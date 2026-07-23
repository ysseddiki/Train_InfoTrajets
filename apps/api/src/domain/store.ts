import bcrypt from "bcryptjs";
import type {
  AlertDeliveryDto,
  BoardTrafficStatus,
  DashboardOverview,
  DeliveryChannel,
  DeliveryStatus,
  DisruptionEventDto,
  DisruptionKind,
  DisruptionSeverity,
  IngestRunStatus,
  JourneyConfig,
  JourneyDirection,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import { getPool } from "../db/pool.js";
import { isWithinWatchWindow } from "./matching.js";

const SESSION_COOKIE = "sncf_admin_session";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

const NICE_VILLE = {
  id: "stop_area:SNCF:87756056",
  label: "Nice-Ville",
} as const;

const MONACO_MONTE_CARLO = {
  id: "stop_area:SNCF:87756403",
  label: "Monaco - Monte-Carlo",
} as const;

/** Station-board model: origin = gare surveillée, destination = filtre de sens. */
function emptyJourney(direction: JourneyDirection): Omit<JourneyConfig, "updatedAt"> {
  const isOutbound = direction === "outbound";
  return {
    direction,
    label: isOutbound
      ? "Aller — départs Nice vers Monaco"
      : "Retour — départs Monaco vers Nice",
    originId: isOutbound ? NICE_VILLE.id : MONACO_MONTE_CARLO.id,
    destinationId: isOutbound ? MONACO_MONTE_CARLO.id : NICE_VILLE.id,
    originLabel: isOutbound ? NICE_VILLE.label : MONACO_MONTE_CARLO.label,
    destinationLabel: isOutbound ? MONACO_MONTE_CARLO.label : NICE_VILLE.label,
    network: "ter",
    daysOfWeek: [1, 2, 3, 4, 5],
    timeWindow: isOutbound
      ? { start: "07:00", end: "09:30" }
      : { start: "16:00", end: "19:00" },
    minDelayMinutes: 10,
    severities: ["delay", "cancellation"],
    active: true,
  };
}

function mapJourney(row: Record<string, unknown>): JourneyConfig {
  return {
    direction: row.direction as JourneyDirection,
    label: String(row.label),
    originId: String(row.origin_id),
    destinationId: String(row.destination_id),
    originLabel: String(row.origin_label),
    destinationLabel: String(row.destination_label),
    network: String(row.network),
    daysOfWeek: (row.days_of_week as number[]) ?? [],
    timeWindow: {
      start: String(row.window_start),
      end: String(row.window_end),
    },
    minDelayMinutes: Number(row.min_delay_minutes),
    severities: (row.severities as DisruptionKind[]) ?? [],
    active: Boolean(row.active),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapEvent(row: Record<string, unknown>): DisruptionEventDto {
  return {
    id: String(row.id),
    externalEventId: String(row.external_event_id),
    direction: (row.direction as JourneyDirection | null) ?? null,
    kind: row.kind as DisruptionKind,
    severity: row.severity as DisruptionSeverity,
    title: String(row.title),
    description: String(row.description ?? ""),
    delayMinutes: row.delay_minutes === null ? null : Number(row.delay_minutes),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: row.ends_at ? new Date(String(row.ends_at)).toISOString() : null,
    source: row.source as "stub" | "prim" | "navitia",
    detectedAt: new Date(String(row.detected_at)).toISOString(),
  };
}

function mapDelivery(row: Record<string, unknown>): AlertDeliveryDto {
  return {
    id: String(row.id),
    eventId: row.event_id ? String(row.event_id) : null,
    direction: (row.direction as JourneyDirection | null) ?? null,
    channel: row.channel as DeliveryChannel,
    status: row.status as DeliveryStatus,
    detail: row.detail === null || row.detail === undefined ? null : String(row.detail),
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function resolveBoardStatus(input: {
  journey: JourneyConfig;
  latest: DisruptionEventDto | null;
  lastIngestAt: string | null;
  lastIngestStatus: IngestRunStatus | null;
  recentMs: number;
}): { boardStatus: BoardTrafficStatus; boardStatusLabel: string } {
  const { journey, latest, lastIngestAt, lastIngestStatus, recentMs } = input;

  if (!journey.active) {
    return { boardStatus: "paused", boardStatusLabel: "Pause (inactif)" };
  }
  if (!isWithinWatchWindow(journey)) {
    return {
      boardStatus: "outside_window",
      boardStatusLabel: "Hors fenêtre horaire",
    };
  }
  if (!lastIngestAt || lastIngestStatus === "error") {
    return {
      boardStatus: "no_data",
      boardStatusLabel:
        lastIngestStatus === "error"
          ? "Erreur dernière requête"
          : "Pas de données (pas encore de poll)",
    };
  }

  const recent =
    latest &&
    Date.now() - new Date(latest.detectedAt).getTime() <= recentMs
      ? latest
      : null;

  if (recent?.kind === "cancellation") {
    return { boardStatus: "cancelled", boardStatusLabel: "Suppression détectée" };
  }
  if (recent?.kind === "delay") {
    const d = recent.delayMinutes ?? 0;
    return {
      boardStatus: "delayed",
      boardStatusLabel: d > 0 ? `Retard ${d} min` : "Retard détecté",
    };
  }
  if (lastIngestStatus === "ok" || lastIngestStatus === "skipped") {
    return { boardStatus: "on_time", boardStatusLabel: "À l’heure" };
  }
  return { boardStatus: "no_data", boardStatusLabel: "Pas de données" };
}

export class PgStore {
  readonly sessionCookieName = SESSION_COOKIE;

  async seed(): Promise<void> {
    const pool = getPool();
    const username = process.env.ADMIN_USERNAME ?? "admin";
    const password = process.env.ADMIN_PASSWORD ?? "changeme";

    const existing = await pool.query(
      `SELECT id, password_hash FROM admin_accounts WHERE username = $1`,
      [username],
    );

    if (existing.rowCount === 0) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO admin_accounts (username, password_hash) VALUES ($1, $2)`,
        [username, hash],
      );
    } else if (process.env.ADMIN_PASSWORD_SYNC === "true") {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE admin_accounts SET password_hash = $2 WHERE username = $1`,
        [username, hash],
      );
    }

    const boardSeed = await pool.query(
      `SELECT value FROM app_meta WHERE key = 'station_board_v1'`,
    );
    const forceBoardDefaults = (boardSeed.rowCount ?? 0) === 0;

    for (const direction of ["outbound", "inbound"] as JourneyDirection[]) {
      const base = emptyJourney(direction);
      if (forceBoardDefaults) {
        await pool.query(
          `INSERT INTO journeys (
            direction, label, origin_id, destination_id, origin_label, destination_label,
            network, days_of_week, window_start, window_end, min_delay_minutes, severities, active, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
          ON CONFLICT (direction) DO UPDATE SET
            label = EXCLUDED.label,
            origin_id = EXCLUDED.origin_id,
            destination_id = EXCLUDED.destination_id,
            origin_label = EXCLUDED.origin_label,
            destination_label = EXCLUDED.destination_label,
            network = EXCLUDED.network,
            days_of_week = EXCLUDED.days_of_week,
            window_start = EXCLUDED.window_start,
            window_end = EXCLUDED.window_end,
            min_delay_minutes = EXCLUDED.min_delay_minutes,
            severities = EXCLUDED.severities,
            active = EXCLUDED.active,
            updated_at = now()`,
          [
            base.direction,
            base.label,
            base.originId,
            base.destinationId,
            base.originLabel,
            base.destinationLabel,
            base.network,
            base.daysOfWeek,
            base.timeWindow.start,
            base.timeWindow.end,
            base.minDelayMinutes,
            base.severities,
            base.active,
          ],
        );
      } else {
        await pool.query(
          `INSERT INTO journeys (
            direction, label, origin_id, destination_id, origin_label, destination_label,
            network, days_of_week, window_start, window_end, min_delay_minutes, severities, active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (direction) DO NOTHING`,
          [
            base.direction,
            base.label,
            base.originId,
            base.destinationId,
            base.originLabel,
            base.destinationLabel,
            base.network,
            base.daysOfWeek,
            base.timeWindow.start,
            base.timeWindow.end,
            base.minDelayMinutes,
            base.severities,
            base.active,
          ],
        );
      }
    }

    if (forceBoardDefaults) {
      await pool.query(
        `INSERT INTO app_meta (key, value) VALUES ('station_board_v1', '1')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      );
    }
  }

  async verifyLogin(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string } | null> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, username, password_hash FROM admin_accounts WHERE username = $1`,
      [username],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    const ok = await bcrypt.compare(password, String(row.password_hash));
    if (!ok) return null;
    return { id: String(row.id), username: String(row.username) };
  }

  async createSession(adminId: string): Promise<{ id: string; expiresAt: Date }> {
    const pool = getPool();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    const res = await pool.query(
      `INSERT INTO sessions (admin_id, expires_at) VALUES ($1, $2) RETURNING id, expires_at`,
      [adminId, expiresAt.toISOString()],
    );
    return { id: String(res.rows[0].id), expiresAt: new Date(res.rows[0].expires_at) };
  }

  async getSession(
    sessionId: string | undefined,
  ): Promise<{ adminId: string; username: string } | null> {
    if (!sessionId) return null;
    const pool = getPool();
    const res = await pool.query(
      `SELECT s.admin_id, a.username, s.expires_at
       FROM sessions s
       JOIN admin_accounts a ON a.id = s.admin_id
       WHERE s.id = $1`,
      [sessionId],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      return null;
    }
    return { adminId: String(row.admin_id), username: String(row.username) };
  }

  async deleteSession(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    const pool = getPool();
    await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  }

  async listJourneys(): Promise<JourneyConfig[]> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM journeys ORDER BY direction`);
    return res.rows.map(mapJourney);
  }

  async getJourney(direction: JourneyDirection): Promise<JourneyConfig | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM journeys WHERE direction = $1`, [
      direction,
    ]);
    if (res.rowCount === 0) return null;
    return mapJourney(res.rows[0]);
  }

  async upsertJourney(
    direction: JourneyDirection,
    patch: Partial<JourneyConfig>,
  ): Promise<JourneyConfig> {
    const current = (await this.getJourney(direction)) ?? {
      ...emptyJourney(direction),
      updatedAt: new Date().toISOString(),
    };
    const next: JourneyConfig = {
      ...current,
      ...patch,
      direction,
      timeWindow: patch.timeWindow ?? current.timeWindow,
      updatedAt: new Date().toISOString(),
    };
    const pool = getPool();
    await pool.query(
      `INSERT INTO journeys (
        direction, label, origin_id, destination_id, origin_label, destination_label,
        network, days_of_week, window_start, window_end, min_delay_minutes, severities, active, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (direction) DO UPDATE SET
        label = EXCLUDED.label,
        origin_id = EXCLUDED.origin_id,
        destination_id = EXCLUDED.destination_id,
        origin_label = EXCLUDED.origin_label,
        destination_label = EXCLUDED.destination_label,
        network = EXCLUDED.network,
        days_of_week = EXCLUDED.days_of_week,
        window_start = EXCLUDED.window_start,
        window_end = EXCLUDED.window_end,
        min_delay_minutes = EXCLUDED.min_delay_minutes,
        severities = EXCLUDED.severities,
        active = EXCLUDED.active,
        updated_at = EXCLUDED.updated_at`,
      [
        next.direction,
        next.label,
        next.originId,
        next.destinationId,
        next.originLabel,
        next.destinationLabel,
        next.network,
        next.daysOfWeek,
        next.timeWindow.start,
        next.timeWindow.end,
        next.minDelayMinutes,
        next.severities,
        next.active,
        next.updatedAt,
      ],
    );
    return next;
  }

  async listEvents(limit = 50): Promise<DisruptionEventDto[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM disruption_events ORDER BY detected_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapEvent);
  }

  async listDeliveries(limit = 50): Promise<AlertDeliveryDto[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM alert_deliveries ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapDelivery);
  }

  async getOverview(): Promise<DashboardOverview> {
    const journeys = await this.listJourneys();
    const events = await this.listEvents(20);
    const pool = getPool();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const statsRes = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM disruption_events WHERE detected_at >= $1) AS events,
        (SELECT COUNT(*)::int FROM alert_deliveries WHERE created_at >= $1 AND status = 'sent') AS sent,
        (SELECT COUNT(*)::int FROM alert_deliveries WHERE created_at >= $1 AND status = 'failed') AS failed,
        (SELECT value FROM app_meta WHERE key = 'last_ingest_at') AS last_ingest,
        (SELECT value FROM app_meta WHERE key = 'last_ingest_status') AS last_ingest_status,
        (SELECT value FROM app_meta WHERE key = 'last_ingest_detail') AS last_ingest_detail`,
      [since],
    );
    const s = statsRes.rows[0];
    const lastIngestAt = s.last_ingest ? String(s.last_ingest) : null;
    const lastIngestStatus = (s.last_ingest_status as IngestRunStatus | null) ?? null;
    const lastIngestDetail = s.last_ingest_detail
      ? String(s.last_ingest_detail)
      : null;

    const RECENT_MS = 3 * 60 * 60 * 1000;

    const card = (direction: JourneyDirection) => {
      const j = journeys.find((x) => x.direction === direction);
      const latest = events.find((e) => e.direction === direction) ?? null;
      if (!j) return null;

      const { boardStatus, boardStatusLabel } = resolveBoardStatus({
        journey: j,
        latest,
        lastIngestAt,
        lastIngestStatus,
        recentMs: RECENT_MS,
      });

      return {
        direction,
        label: j.label,
        active: j.active,
        originLabel: j.originLabel,
        destinationLabel: j.destinationLabel,
        boardStatus,
        boardStatusLabel,
        latestEvent: latest
          ? {
              id: latest.id,
              kind: latest.kind,
              severity: latest.severity,
              title: latest.title,
              delayMinutes: latest.delayMinutes,
              detectedAt: latest.detectedAt,
            }
          : null,
      };
    };

    return {
      journeys: {
        outbound: card("outbound"),
        inbound: card("inbound"),
      },
      stats: {
        eventsLast24h: Number(s.events ?? 0),
        deliveriesSentLast24h: Number(s.sent ?? 0),
        deliveriesFailedLast24h: Number(s.failed ?? 0),
        ingestProvider: process.env.INGEST_PROVIDER ?? "stub",
        lastIngestAt,
      },
      lastIngest: {
        at: lastIngestAt,
        status: lastIngestStatus,
        detail: lastIngestDetail,
      },
    };
  }

  async setLastIngestAt(iso: string): Promise<void> {
    await this.setIngestResult({
      status: "ok",
      detail: "Poll terminé",
      at: iso,
    });
  }

  async setIngestResult(input: {
    status: IngestRunStatus;
    detail: string;
    at?: string;
  }): Promise<void> {
    const pool = getPool();
    const at = input.at ?? new Date().toISOString();
    const rows: Array<[string, string]> = [
      ["last_ingest_at", at],
      ["last_ingest_status", input.status],
      ["last_ingest_detail", input.detail.slice(0, 500)],
    ];
    for (const [key, value] of rows) {
      await pool.query(
        `INSERT INTO app_meta (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value],
      );
    }
  }

  getSmtpPublic(): SmtpConfigPublic {
    return {
      host: process.env.SMTP_HOST ?? "",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      username: process.env.SMTP_USERNAME ?? "",
      fromAddress: process.env.SMTP_FROM ?? "",
      passwordConfigured: Boolean(process.env.SMTP_PASSWORD),
      enabled: process.env.EMAIL_ENABLED === "true",
    };
  }

  getTeamsPublic(): TeamsConfigPublic {
    return {
      webhookConfigured: Boolean(process.env.TEAMS_WEBHOOK_URL),
      enabled: process.env.TEAMS_ENABLED === "true",
    };
  }

  async getRecipients(): Promise<RecipientsConfig> {
    const pool = getPool();
    const res = await pool.query(`SELECT email FROM recipients ORDER BY email`);
    return { emails: res.rows.map((r) => String(r.email)) };
  }

  async setRecipients(config: RecipientsConfig): Promise<RecipientsConfig> {
    const emails = [
      ...new Set(
        (config.emails ?? [])
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM recipients`);
      for (const email of emails) {
        await client.query(`INSERT INTO recipients (email) VALUES ($1)`, [email]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return { emails };
  }

  async upsertEvent(
    input: Omit<DisruptionEventDto, "id" | "detectedAt"> & { detectedAt?: string },
  ): Promise<{ event: DisruptionEventDto; created: boolean }> {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT * FROM disruption_events WHERE external_event_id = $1`,
      [input.externalEventId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      const res = await pool.query(
        `UPDATE disruption_events SET
          direction = $2, kind = $3, severity = $4, title = $5, description = $6,
          delay_minutes = $7, starts_at = $8, ends_at = $9, source = $10
         WHERE external_event_id = $1
         RETURNING *`,
        [
          input.externalEventId,
          input.direction,
          input.kind,
          input.severity,
          input.title,
          input.description,
          input.delayMinutes,
          input.startsAt,
          input.endsAt,
          input.source,
        ],
      );
      return { event: mapEvent(res.rows[0]), created: false };
    }
    const res = await pool.query(
      `INSERT INTO disruption_events (
        external_event_id, direction, kind, severity, title, description,
        delay_minutes, starts_at, ends_at, source, detected_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, now()))
      RETURNING *`,
      [
        input.externalEventId,
        input.direction,
        input.kind,
        input.severity,
        input.title,
        input.description,
        input.delayMinutes,
        input.startsAt,
        input.endsAt,
        input.source,
        input.detectedAt ?? null,
      ],
    );
    return { event: mapEvent(res.rows[0]), created: true };
  }

  async hasSentDelivery(eventId: string, channel: DeliveryChannel): Promise<boolean> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT 1 FROM alert_deliveries WHERE event_id = $1 AND channel = $2 AND status = 'sent' LIMIT 1`,
      [eventId, channel],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async createDelivery(input: {
    eventId: string | null;
    direction: JourneyDirection | null;
    channel: DeliveryChannel;
    status: DeliveryStatus;
    detail: string | null;
    sentAt?: string | null;
  }): Promise<AlertDeliveryDto> {
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO alert_deliveries (event_id, direction, channel, status, detail, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        input.eventId,
        input.direction,
        input.channel,
        input.status,
        input.detail,
        input.sentAt ?? null,
      ],
    );
    return mapDelivery(res.rows[0]);
  }
}

export const store = new PgStore();
