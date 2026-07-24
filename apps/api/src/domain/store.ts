import bcrypt from "bcryptjs";
import type {
  AlertDeliveryDto,
  ApiQuotaStatus,
  BoardTrafficStatus,
  DashboardOverview,
  DashboardPeriodStats,
  DeliveryChannel,
  DeliveryStatus,
  DisruptionEventDto,
  DisruptionKind,
  DisruptionSeverity,
  IngestRunStatus,
  JourneyConfig,
  JourneyDirection,
  JourneyStatusCard,
  LiaisonConfig,
  LiaisonStatusCard,
  LiaisonUpsertBody,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import { clampWatchLeadHours, resolveLiaisonDisplayName } from "@sncf-alerts/shared";
import { DEFAULT_WATCH_LEAD_HOURS } from "@sncf-alerts/shared";
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
function emptyLeg(
  liaisonId: string,
  direction: JourneyDirection,
  opts?: { active?: boolean; blank?: boolean },
): Omit<JourneyConfig, "id" | "updatedAt"> {
  const isOutbound = direction === "outbound";
  const blank = opts?.blank === true;
  const origin = blank
    ? { id: "", label: "" }
    : isOutbound
      ? NICE_VILLE
      : MONACO_MONTE_CARLO;
  const dest = blank
    ? { id: "", label: "" }
    : isOutbound
      ? MONACO_MONTE_CARLO
      : NICE_VILLE;
  return {
    liaisonId,
    direction,
    label: isOutbound
      ? `Aller — ${origin.label || "A"} → ${dest.label || "B"}`
      : `Retour — ${origin.label || "B"} → ${dest.label || "A"}`,
    originId: origin.id,
    destinationId: dest.id,
    originLabel: origin.label,
    destinationLabel: dest.label,
    network: "ter",
    daysOfWeek: [1, 2, 3, 4, 5],
    timeWindow: isOutbound
      ? { start: "07:00", end: "09:30" }
      : { start: "16:00", end: "19:00" },
    watchAlways: false,
    watchLeadHours: DEFAULT_WATCH_LEAD_HOURS,
    minDelayMinutes: 10,
    severities: ["delay", "cancellation"],
    active: opts?.active ?? !blank,
  };
}

function mapJourney(row: Record<string, unknown>): JourneyConfig {
  return {
    id: String(row.id),
    liaisonId: String(row.liaison_id),
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
    watchAlways: Boolean(row.watch_always),
    watchLeadHours: clampWatchLeadHours(
      row.watch_lead_hours ?? DEFAULT_WATCH_LEAD_HOURS,
    ),
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
    journeyId: row.journey_id ? String(row.journey_id) : null,
    liaisonId: row.liaison_id ? String(row.liaison_id) : null,
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
      boardStatusLabel: "Hors fenêtre de veille",
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
    const d = recent.delayMinutes;
    return {
      boardStatus: "delayed",
      boardStatusLabel:
        d != null ? `Retard ${d} min` : "Retard unknown",
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

    const liaisonCount = await pool.query(`SELECT COUNT(*)::int AS n FROM liaisons`);
    const nLiaisons = Number(liaisonCount.rows[0]?.n ?? 0);

    if (nLiaisons === 0 || forceBoardDefaults) {
      let liaisonId: string;
      if (nLiaisons === 0) {
        const created = await pool.query(
          `INSERT INTO liaisons (name, updated_at) VALUES ('', now()) RETURNING id`,
        );
        liaisonId = String(created.rows[0].id);
      } else {
        const first = await pool.query(
          `SELECT id FROM liaisons ORDER BY updated_at ASC LIMIT 1`,
        );
        liaisonId = String(first.rows[0].id);
        if (forceBoardDefaults) {
          await pool.query(`UPDATE liaisons SET name = '', updated_at = now() WHERE id = $1`, [
            liaisonId,
          ]);
        }
      }

      for (const direction of ["outbound", "inbound"] as JourneyDirection[]) {
        const base = emptyLeg(liaisonId, direction, { active: true });
        if (forceBoardDefaults) {
          await pool.query(
            `INSERT INTO journeys (
              liaison_id, direction, label, origin_id, destination_id, origin_label, destination_label,
              network, days_of_week, window_start, window_end, min_delay_minutes, severities, active, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
            ON CONFLICT (liaison_id, direction) DO UPDATE SET
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
              liaisonId,
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
              liaison_id, direction, label, origin_id, destination_id, origin_label, destination_label,
              network, days_of_week, window_start, window_end, min_delay_minutes, severities, active
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (liaison_id, direction) DO NOTHING`,
            [
              liaisonId,
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
    const res = await pool.query(
      `SELECT * FROM journeys ORDER BY liaison_id, direction`,
    );
    return res.rows.map(mapJourney);
  }

  async getJourneyById(id: string): Promise<JourneyConfig | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM journeys WHERE id = $1`, [id]);
    if (res.rowCount === 0) return null;
    return mapJourney(res.rows[0]);
  }

  private async insertLeg(
    liaisonId: string,
    direction: JourneyDirection,
    patch: Partial<JourneyConfig>,
  ): Promise<JourneyConfig> {
    const base = emptyLeg(liaisonId, direction, {
      blank: true,
      active: false,
    });
    const next: Omit<JourneyConfig, "id"> = {
      ...base,
      ...patch,
      liaisonId,
      direction,
      timeWindow: patch.timeWindow ?? base.timeWindow,
      updatedAt: new Date().toISOString(),
    };
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO journeys (
        liaison_id, direction, label, origin_id, destination_id, origin_label, destination_label,
        network, days_of_week, window_start, window_end, min_delay_minutes, severities, active, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (liaison_id, direction) DO UPDATE SET
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
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        next.liaisonId,
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
    return mapJourney(res.rows[0]);
  }

  private toLiaison(
    id: string,
    name: string,
    updatedAt: string,
    legs: JourneyConfig[],
  ): LiaisonConfig | null {
    const outbound = legs.find((j) => j.direction === "outbound");
    const inbound = legs.find((j) => j.direction === "inbound");
    if (!outbound || !inbound) return null;
    return {
      id,
      name,
      displayName: resolveLiaisonDisplayName(
        name,
        outbound.originLabel,
        outbound.destinationLabel,
      ),
      outbound,
      inbound,
      updatedAt,
    };
  }

  async listLiaisons(): Promise<LiaisonConfig[]> {
    const pool = getPool();
    const [liaisonsRes, journeys] = await Promise.all([
      pool.query(`SELECT * FROM liaisons ORDER BY updated_at ASC`),
      this.listJourneys(),
    ]);
    const out: LiaisonConfig[] = [];
    for (const row of liaisonsRes.rows) {
      const id = String(row.id);
      const legs = journeys.filter((j) => j.liaisonId === id);
      const liaison = this.toLiaison(
        id,
        String(row.name ?? ""),
        new Date(String(row.updated_at)).toISOString(),
        legs,
      );
      if (liaison) out.push(liaison);
    }
    return out;
  }

  async getLiaison(id: string): Promise<LiaisonConfig | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM liaisons WHERE id = $1`, [id]);
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    const legsRes = await pool.query(
      `SELECT * FROM journeys WHERE liaison_id = $1`,
      [id],
    );
    return this.toLiaison(
      id,
      String(row.name ?? ""),
      new Date(String(row.updated_at)).toISOString(),
      legsRes.rows.map(mapJourney),
    );
  }

  async createLiaison(): Promise<LiaisonConfig> {
    const pool = getPool();
    const created = await pool.query(
      `INSERT INTO liaisons (name, updated_at) VALUES ('', now()) RETURNING *`,
    );
    const liaisonId = String(created.rows[0].id);
    const outbound = await this.insertLeg(liaisonId, "outbound", {
      ...emptyLeg(liaisonId, "outbound", { blank: true, active: false }),
    });
    const inbound = await this.insertLeg(liaisonId, "inbound", {
      ...emptyLeg(liaisonId, "inbound", { blank: true, active: false }),
    });
    return {
      id: liaisonId,
      name: "",
      displayName: resolveLiaisonDisplayName(
        "",
        outbound.originLabel,
        outbound.destinationLabel,
      ),
      outbound,
      inbound,
      updatedAt: new Date(String(created.rows[0].updated_at)).toISOString(),
    };
  }

  async upsertLiaison(
    id: string,
    body: LiaisonUpsertBody,
  ): Promise<LiaisonConfig> {
    const current = await this.getLiaison(id);
    if (!current) {
      throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
    }
    const name =
      body.name !== undefined ? String(body.name).trim() : current.name;

    const outboundPatch = body.outbound ?? {};
    const inboundPatch = body.inbound ?? {};

    const outbound = await this.insertLeg(id, "outbound", {
      ...current.outbound,
      ...outboundPatch,
      timeWindow: outboundPatch.timeWindow ?? current.outbound.timeWindow,
    });
    const inbound = await this.insertLeg(id, "inbound", {
      ...current.inbound,
      ...inboundPatch,
      timeWindow: inboundPatch.timeWindow ?? current.inbound.timeWindow,
    });

    const pool = getPool();
    const res = await pool.query(
      `UPDATE liaisons SET name = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, name],
    );
    return {
      id,
      name,
      displayName: resolveLiaisonDisplayName(
        name,
        outbound.originLabel,
        outbound.destinationLabel,
      ),
      outbound,
      inbound,
      updatedAt: new Date(String(res.rows[0].updated_at)).toISOString(),
    };
  }

  async deleteLiaison(id: string): Promise<void> {
    const pool = getPool();
    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM liaisons`);
    if (Number(count.rows[0]?.n ?? 0) <= 1) {
      throw Object.assign(new Error("Cannot delete the last liaison"), {
        statusCode: 400,
      });
    }
    const res = await pool.query(`DELETE FROM liaisons WHERE id = $1`, [id]);
    if ((res.rowCount ?? 0) === 0) {
      throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
    }
  }

  /** @deprecated prefer getLiaison / listLiaisons — kept for single-leg lookups */
  async getJourney(direction: JourneyDirection): Promise<JourneyConfig | null> {
    const liaisons = await this.listLiaisons();
    const first = liaisons[0];
    if (!first) return null;
    return direction === "outbound" ? first.outbound : first.inbound;
  }

  async upsertJourney(
    direction: JourneyDirection,
    patch: Partial<JourneyConfig>,
  ): Promise<JourneyConfig> {
    const liaisons = await this.listLiaisons();
    let liaison = liaisons[0];
    if (!liaison) {
      liaison = await this.createLiaison();
    }
    const updated = await this.upsertLiaison(liaison.id, {
      name: liaison.name,
      outbound: direction === "outbound" ? patch : {},
      inbound: direction === "inbound" ? patch : {},
    });
    return direction === "outbound" ? updated.outbound : updated.inbound;
  }

  async listEvents(
    limit = 50,
    direction?: JourneyDirection,
  ): Promise<DisruptionEventDto[]> {
    const pool = getPool();
    if (direction) {
      const res = await pool.query(
        `SELECT * FROM disruption_events
         WHERE direction = $1
         ORDER BY detected_at DESC LIMIT $2`,
        [direction, limit],
      );
      return res.rows.map(mapEvent);
    }
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

  async periodStats(sinceIso: string): Promise<DashboardPeriodStats> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT
        COUNT(*)::int AS events,
        COUNT(*) FILTER (WHERE kind = 'delay')::int AS delays,
        COUNT(*) FILTER (WHERE kind = 'cancellation')::int AS cancellations,
        COUNT(*) FILTER (
          WHERE kind IS DISTINCT FROM 'delay'
            AND kind IS DISTINCT FROM 'cancellation'
        )::int AS other_kinds,
        ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes IS NOT NULL))::int AS avg_delay,
        MAX(delay_minutes) FILTER (WHERE delay_minutes IS NOT NULL)::int AS max_delay,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
        COUNT(*) FILTER (WHERE direction IS NULL)::int AS unmatched
       FROM disruption_events
       WHERE detected_at >= $1`,
      [sinceIso],
    );
    const delRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM alert_deliveries
       WHERE created_at >= $1`,
      [sinceIso],
    );
    const e = res.rows[0] ?? {};
    const d = delRes.rows[0] ?? {};
    return {
      events: Number(e.events ?? 0),
      delays: Number(e.delays ?? 0),
      cancellations: Number(e.cancellations ?? 0),
      otherKinds: Number(e.other_kinds ?? 0),
      avgDelayMinutes:
        e.avg_delay === null || e.avg_delay === undefined
          ? null
          : Number(e.avg_delay),
      maxDelayMinutes:
        e.max_delay === null || e.max_delay === undefined
          ? null
          : Number(e.max_delay),
      deliveriesSent: Number(d.sent ?? 0),
      deliveriesFailed: Number(d.failed ?? 0),
      byDirection: {
        outbound: Number(e.outbound ?? 0),
        inbound: Number(e.inbound ?? 0),
        unmatched: Number(e.unmatched ?? 0),
      },
    };
  }

  async getOverview(): Promise<DashboardOverview> {
    const [events, recentEvents, recentDeliveries] = await Promise.all([
      this.listEvents(20),
      this.listEvents(12),
      this.listDeliveries(12),
    ]);
    const pool = getPool();
    const now = Date.now();
    const since24h = new Date(now - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const since30d = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

    const [metaRes, last24h, last7d, last30d] = await Promise.all([
      pool.query(
        `SELECT
          (SELECT value FROM app_meta WHERE key = 'last_ingest_at') AS last_ingest,
          (SELECT value FROM app_meta WHERE key = 'last_ingest_status') AS last_ingest_status,
          (SELECT value FROM app_meta WHERE key = 'last_ingest_detail') AS last_ingest_detail`,
      ),
      this.periodStats(since24h),
      this.periodStats(since7d),
      this.periodStats(since30d),
    ]);

    const s = metaRes.rows[0] ?? {};
    const lastIngestAt = s.last_ingest ? String(s.last_ingest) : null;
    const lastIngestStatus = (s.last_ingest_status as IngestRunStatus | null) ?? null;
    const lastIngestDetail = s.last_ingest_detail
      ? String(s.last_ingest_detail)
      : null;

    const RECENT_MS = 3 * 60 * 60 * 1000;
    const liaisons = await this.listLiaisons();

    const card = (j: JourneyConfig): JourneyStatusCard => {
      const latest =
        events.find((e) => e.journeyId === j.id) ??
        events.find(
          (e) => e.liaisonId === j.liaisonId && e.direction === j.direction,
        ) ??
        null;

      const { boardStatus, boardStatusLabel } = resolveBoardStatus({
        journey: j,
        latest,
        lastIngestAt,
        lastIngestStatus,
        recentMs: RECENT_MS,
      });

      return {
        id: j.id,
        liaisonId: j.liaisonId,
        direction: j.direction,
        label: j.label,
        active: j.active,
        originLabel: j.originLabel,
        destinationLabel: j.destinationLabel,
        network: j.network,
        timeWindow: j.timeWindow,
        daysOfWeek: j.daysOfWeek,
        minDelayMinutes: j.minDelayMinutes,
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

    const liaisonCards: LiaisonStatusCard[] = liaisons.map((l) => ({
      id: l.id,
      name: l.name,
      displayName: l.displayName,
      outbound: card(l.outbound),
      inbound: card(l.inbound),
    }));

    return {
      liaisons: liaisonCards,
      stats: {
        eventsLast24h: last24h.events,
        deliveriesSentLast24h: last24h.deliveriesSent,
        deliveriesFailedLast24h: last24h.deliveriesFailed,
        ingestProvider: process.env.INGEST_PROVIDER ?? "stub",
        lastIngestAt,
        periods: { last24h, last7d, last30d },
      },
      lastIngest: {
        at: lastIngestAt,
        status: lastIngestStatus,
        detail: lastIngestDetail,
      },
      recentEvents,
      recentDeliveries,
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
          journey_id = $2, liaison_id = $3, direction = $4, kind = $5, severity = $6,
          title = $7, description = $8, delay_minutes = $9, starts_at = $10, ends_at = $11, source = $12
         WHERE external_event_id = $1
         RETURNING *`,
        [
          input.externalEventId,
          input.journeyId,
          input.liaisonId,
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
        external_event_id, journey_id, liaison_id, direction, kind, severity, title, description,
        delay_minutes, starts_at, ends_at, source, detected_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz, now()))
      RETURNING *`,
      [
        input.externalEventId,
        input.journeyId,
        input.liaisonId,
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

  /** Jour civil Europe/Paris (YYYY-MM-DD) pour le reset quotidien du quota. */
  parisDay(now = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }

  async recordApiRequest(input: {
    provider?: string;
    ok: boolean;
  }): Promise<ApiQuotaStatus> {
    const provider = input.provider ?? "navitia";
    const day = this.parisDay();
    const successInc = input.ok ? 1 : 0;
    const failedInc = input.ok ? 0 : 1;
    const pool = getPool();
    await pool.query(
      `INSERT INTO api_quota_daily (day, provider, success, failed, updated_at)
       VALUES ($1::date, $2, $3, $4, now())
       ON CONFLICT (day, provider) DO UPDATE SET
         success = api_quota_daily.success + EXCLUDED.success,
         failed = api_quota_daily.failed + EXCLUDED.failed,
         updated_at = now()`,
      [day, provider, successInc, failedInc],
    );
    return this.getApiQuota(provider);
  }

  async getApiQuota(provider = "navitia"): Promise<ApiQuotaStatus> {
    const day = this.parisDay();
    const limit = Number(process.env.NAVITIA_DAILY_QUOTA ?? 5000);
    const pool = getPool();
    const res = await pool.query(
      `SELECT success, failed FROM api_quota_daily
       WHERE day = $1::date AND provider = $2`,
      [day, provider],
    );
    const success = Number(res.rows[0]?.success ?? 0);
    const failed = Number(res.rows[0]?.failed ?? 0);
    const used = success + failed;
    const remaining = Math.max(0, limit - used);
    const percent =
      limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 1000) / 10);
    return {
      provider,
      day,
      limit,
      success,
      failed,
      used,
      remaining,
      percent,
      exhausted: used >= limit,
    };
  }
}

export const store = new PgStore();
