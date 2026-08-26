import bcrypt from "bcryptjs";
import type {
  AlertDeliveryDto,
  ApiQuotaStatus,
  BoardTrafficStatus,
  DashboardDayDetail,
  DashboardHeatmapDay,
  DashboardOverview,
  DashboardPeriodStats,
  DeliveryChannel,
  DeliveryStatus,
  DisruptionEventDto,
  DisruptionKind,
  DisruptionSeverity,
  EventWeatherSnapshot,
  IngestConfigPublic,
  IngestConfigUpdate,
  IngestEventSource,
  IngestProviderId,
  IngestProviderSlotPublic,
  IngestRunStatus,
  JourneyConfig,
  JourneyDirection,
  JourneyStatusCard,
  LiaisonConfig,
  LiaisonOption,
  LiaisonStatusCard,
  LiaisonUpsertBody,
  NextDepartureInfo,
  RecipientsConfig,
  SmtpConfigPublic,
  SmtpConfigUpdate,
  Station,
  StationUpsertBody,
  TeamsConfigPublic,
  TrainObservationDto,
  UserCreateBody,
  UserPatchBody,
  UserPublic,
  UserRole,
  WeatherBucket,
  WeatherDelayCorrelation,
  WeatherSnapshotPublic,
} from "@sncf-alerts/shared";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  isUserRole,
  clampIngestPollSeconds,
  clampNotifyStepMinutes,
  clampWatchLeadHours,
  DEFAULT_INGEST_POLL_SECONDS,
  DEFAULT_NOTIFY_STEP_MINUTES,
  DEFAULT_WATCH_LEAD_HOURS,
  ingestTokenPreview,
  resolveLiaisonDisplayName,
} from "@sncf-alerts/shared";
import { getPool } from "../db/pool.js";
import { wouldRemoveLastAdmin } from "./access.js";
import { isDepartureStillDue, isWithinWatchWindow } from "./matching.js";
import { formatHmParis } from "./next-departure.js";
import {
  fetchWeatherForParisDay,
  fetchWeatherSnapshot,
  geocodeStationLabel,
  weatherBucketLabel,
} from "./weather.js";
import {
  addDaysYmd,
  dashboardPeriodStarts,
  isValidYmd,
  parisMidnightIso,
  parisYmd,
} from "./paris-calendar.js";

const SESSION_COOKIE = "sncf_admin_session";
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

const META_INGEST_PROVIDER = "ingest_provider";
const META_NAVITIA_TOKEN = "ingest_navitia_token";
const META_NAVITIA_CHECK = "ingest_navitia_check";
const META_STUB_CHECK = "ingest_stub_check";
const META_POLL_STUB = "ingest_poll_seconds_stub";
const META_POLL_NAVITIA = "ingest_poll_seconds_navitia";

const META_SMTP_ENABLED = "smtp_enabled";
const META_SMTP_HOST = "smtp_host";
const META_SMTP_PORT = "smtp_port";
const META_SMTP_SECURE = "smtp_secure";
const META_SMTP_USERNAME = "smtp_username";
const META_SMTP_PASSWORD = "smtp_password";
const META_SMTP_FROM = "smtp_from";
const META_SMTP_BOOTSTRAPPED = "smtp_bootstrapped_from_env";
const META_VISITOR_ENABLED = "visitor_enabled";

function parseIngestProvider(value: string | null | undefined): IngestProviderId {
  // Ancien provider PRIM (IDF) → Navitia
  if (value === "navitia" || value === "prim") return "navitia";
  if (value === "stub") return "stub";
  return "stub";
}

function secretMetaKey(provider: IngestProviderId): string | null {
  if (provider === "navitia") return META_NAVITIA_TOKEN;
  return null;
}

function checkMetaKey(provider: IngestProviderId): string {
  if (provider === "navitia") return META_NAVITIA_CHECK;
  return META_STUB_CHECK;
}

type StoredCheck = {
  ok: boolean;
  at: string;
  detail: string;
};

const NICE_VILLE = {
  id: "stop_area:SNCF:87756056",
  label: "Nice-Ville",
  latitude: 43.7044,
  longitude: 7.2619,
  displayUrl:
    "https://www.garesetconnexions.sncf/fr/gares-services/nice-ville",
} as const;

const MONACO_MONTE_CARLO = {
  id: "stop_area:SNCF:87756403",
  label: "Monaco - Monte-Carlo",
  latitude: 43.7384,
  longitude: 7.4194,
  displayUrl:
    "https://www.garesetconnexions.sncf/fr/gares-services/monaco-monte-carlo",
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
    notifyStepMinutes: DEFAULT_NOTIFY_STEP_MINUTES,
    severities: ["delay", "cancellation"],
    active: opts?.active ?? !blank,
  };
}

function normalizeDisplayUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeTerminusHelperLabels(
  value: string[] | null | undefined,
): string[] {
  if (!value || !Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.slice(0, 80));
    if (out.length >= 20) break;
  }
  return out;
}

function mapStation(row: Record<string, unknown>): Station {
  const rawUrl = row.display_url;
  const displayUrl =
    rawUrl === null || rawUrl === undefined || String(rawUrl).trim() === ""
      ? null
      : String(rawUrl).trim();
  const labelsRaw = row.terminus_helper_labels;
  const terminusHelperLabels = Array.isArray(labelsRaw)
    ? labelsRaw.map((x) => String(x)).filter(Boolean)
    : [];
  return {
    id: String(row.id),
    externalId: String(row.external_id),
    label: String(row.label),
    latitude:
      row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
    longitude:
      row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
    displayUrl,
    terminusHelpersEnabled: Boolean(row.terminus_helpers_enabled),
    terminusHelperLabels,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
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
    notifyStepMinutes: clampNotifyStepMinutes(row.notify_step_minutes),
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
    trainNumber:
      row.train_number === null || row.train_number === undefined
        ? null
        : String(row.train_number).trim() || null,
    delayMinutes: row.delay_minutes === null ? null : Number(row.delay_minutes),
    delayReason:
      row.delay_reason === null || row.delay_reason === undefined
        ? null
        : String(row.delay_reason),
    delayReasonKey:
      row.delay_reason_key === null || row.delay_reason_key === undefined
        ? null
        : String(row.delay_reason_key),
    weatherBucket: (row.weather_bucket as WeatherBucket | null) ?? null,
    weatherCode:
      row.weather_code === null || row.weather_code === undefined
        ? null
        : Number(row.weather_code),
    weatherLabel:
      row.weather_label === null || row.weather_label === undefined
        ? null
        : String(row.weather_label),
    precipitationMm:
      row.precipitation_mm === null || row.precipitation_mm === undefined
        ? null
        : Number(row.precipitation_mm),
    windSpeedKmh:
      row.wind_speed_kmh === null || row.wind_speed_kmh === undefined
        ? null
        : Number(row.wind_speed_kmh),
    temperatureC:
      row.temperature_c === null || row.temperature_c === undefined
        ? null
        : Number(row.temperature_c),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: row.ends_at ? new Date(String(row.ends_at)).toISOString() : null,
    source: row.source as "stub" | "prim" | "navitia" | "zou",
    detectedAt: new Date(String(row.detected_at)).toISOString(),
  };
}

function mapDelivery(row: Record<string, unknown>): AlertDeliveryDto {
  return {
    id: String(row.id),
    eventId: row.event_id ? String(row.event_id) : null,
    liaisonId: row.liaison_id ? String(row.liaison_id) : null,
    direction: (row.direction as JourneyDirection | null) ?? null,
    channel: row.channel as DeliveryChannel,
    status: row.status as DeliveryStatus,
    detail: row.detail === null || row.detail === undefined ? null : String(row.detail),
    trainNumber:
      row.train_number === null || row.train_number === undefined
        ? null
        : String(row.train_number).trim() || null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function resolveBoardStatus(input: {
  journey: JourneyConfig;
  lastIngestAt: string | null;
  lastIngestStatus: IngestRunStatus | null;
}): { boardStatus: BoardTrafficStatus; boardStatusLabel: string } {
  const { journey, lastIngestAt, lastIngestStatus } = input;

  if (!journey.active) {
    return { boardStatus: "paused", boardStatusLabel: "Pause (inactif)" };
  }
  if (!isWithinWatchWindow(journey)) {
    return {
      boardStatus: "outside_window",
      boardStatusLabel: "Hors fenêtre de veille",
    };
  }
  if (lastIngestStatus === "error") {
    return {
      boardStatus: "no_data",
      boardStatusLabel: "Ingest en erreur",
    };
  }
  if (!lastIngestAt) {
    return {
      boardStatus: "no_data",
      boardStatusLabel: "Pas de données (pas encore de poll)",
    };
  }
  // Trafic = prochain train uniquement (affiné dans getOverview via nextDeparture)
  return {
    boardStatus: "no_data",
    boardStatusLabel: "Pas de prochain train",
  };
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode: status });
}

function mapUserRow(row: {
  id: unknown;
  username: unknown;
  role: unknown;
  disabled_at: unknown;
  created_at: unknown;
}): UserPublic {
  const role = isUserRole(row.role) ? row.role : "admin";
  return {
    id: String(row.id),
    username: String(row.username),
    role,
    disabled: row.disabled_at != null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
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
        `INSERT INTO admin_accounts (username, password_hash, role) VALUES ($1, $2, 'admin')`,
        [username, hash],
      );
    } else if (process.env.ADMIN_PASSWORD_SYNC === "true") {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE admin_accounts SET password_hash = $2 WHERE username = $1`,
        [username, hash],
      );
    }

    if ((await this.getMeta(META_VISITOR_ENABLED)) === null) {
      await this.setMeta(META_VISITOR_ENABLED, "true");
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
          `INSERT INTO liaisons (name, is_default, updated_at) VALUES ('', true, now()) RETURNING id`,
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
              network, days_of_week, window_start, window_end, watch_always, watch_lead_hours,
              min_delay_minutes, severities, active, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
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
              watch_always = EXCLUDED.watch_always,
              watch_lead_hours = EXCLUDED.watch_lead_hours,
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
              base.watchAlways,
              base.watchLeadHours,
              base.minDelayMinutes,
              base.severities,
              base.active,
            ],
          );
        } else {
          await pool.query(
            `INSERT INTO journeys (
              liaison_id, direction, label, origin_id, destination_id, origin_label, destination_label,
              network, days_of_week, window_start, window_end, watch_always, watch_lead_hours,
              min_delay_minutes, severities, active
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
              base.watchAlways,
              base.watchLeadHours,
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

    await this.seedDefaultStations();
    await this.ensureIngestConfigBootstrapped();
  }

  private async seedDefaultStations(): Promise<void> {
    const defaults = [NICE_VILLE, MONACO_MONTE_CARLO];
    const pool = getPool();
    for (const s of defaults) {
      await pool.query(
        `INSERT INTO stations (external_id, label, display_url, latitude, longitude, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (external_id) DO UPDATE SET
           display_url = COALESCE(NULLIF(stations.display_url, ''), EXCLUDED.display_url),
           label = EXCLUDED.label,
           latitude = COALESCE(stations.latitude, EXCLUDED.latitude),
           longitude = COALESCE(stations.longitude, EXCLUDED.longitude),
           updated_at = now()`,
        [s.id, s.label, s.displayUrl, s.latitude, s.longitude],
      );
    }
  }

  /** Lat/lon catalogue ; géocodage Open-Meteo si manquant. */
  async resolveStationCoordinates(
    externalId: string,
    label?: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const station = externalId
      ? await this.getStationByExternalId(externalId)
      : null;
    if (
      station?.latitude != null &&
      station?.longitude != null &&
      Number.isFinite(station.latitude) &&
      Number.isFinite(station.longitude)
    ) {
      return { latitude: station.latitude, longitude: station.longitude };
    }
    const geoLabel = label ?? station?.label;
    if (!geoLabel?.trim()) return null;
    const hit = await geocodeStationLabel(geoLabel);
    if (!hit || !externalId) return hit;
    const pool = getPool();
    await pool.query(
      `UPDATE stations SET latitude = $2, longitude = $3, updated_at = now()
       WHERE external_id = $1`,
      [externalId, hit.latitude, hit.longitude],
    );
    return hit;
  }

  async getWeatherForOrigin(
    originExternalId: string,
    originLabel?: string,
    at = new Date(),
  ): Promise<WeatherSnapshotPublic | null> {
    const coords = await this.resolveStationCoordinates(
      originExternalId,
      originLabel,
    );
    if (!coords) return null;
    return fetchWeatherSnapshot(coords.latitude, coords.longitude, at);
  }

  private async getMeta(key: string): Promise<string | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT value FROM app_meta WHERE key = $1`, [
      key,
    ]);
    if ((res.rowCount ?? 0) === 0) return null;
    return String(res.rows[0].value);
  }

  private async setMeta(key: string, value: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO app_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }

  /** Une fois : provider stub/navitia depuis env si pas encore en meta. Tokens = Admin uniquement. */
  async ensureIngestConfigBootstrapped(): Promise<void> {
    const existing = await this.getMeta(META_INGEST_PROVIDER);
    if (existing !== null) return;
    const provider = parseIngestProvider(process.env.INGEST_PROVIDER);
    await this.setMeta(META_INGEST_PROVIDER, provider);
  }

  async getIngestProvider(): Promise<IngestProviderId> {
    await this.ensureIngestConfigBootstrapped();
    return parseIngestProvider(await this.getMeta(META_INGEST_PROVIDER));
  }

  /** Secret serveur uniquement — ne jamais exposer via API. */
  async getIngestSecret(
    provider?: IngestProviderId,
  ): Promise<string | null> {
    const p = provider ?? (await this.getIngestProvider());
    const key = secretMetaKey(p);
    if (!key) return null;
    const v = await this.getMeta(key);
    return v?.trim() ? v : null;
  }

  private async readStoredCheck(
    provider: IngestProviderId,
  ): Promise<StoredCheck | null> {
    const raw = await this.getMeta(checkMetaKey(provider));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredCheck;
      if (typeof parsed.ok !== "boolean" || typeof parsed.at !== "string") {
        return null;
      }
      return {
        ok: parsed.ok,
        at: parsed.at,
        detail: String(parsed.detail ?? ""),
      };
    } catch {
      return null;
    }
  }

  async saveIngestCheck(result: {
    provider: IngestProviderId;
    ok: boolean;
    detail: string;
    checkedAt: string;
  }): Promise<void> {
    await this.setMeta(
      checkMetaKey(result.provider),
      JSON.stringify({
        ok: result.ok,
        at: result.checkedAt,
        detail: result.detail.slice(0, 400),
      } satisfies StoredCheck),
    );
  }

  private async buildSlot(
    id: IngestProviderId,
  ): Promise<IngestProviderSlotPublic> {
    const requiresToken = id === "navitia";
    const secret = requiresToken ? await this.getIngestSecret(id) : null;
    const check = await this.readStoredCheck(id);
    return {
      id,
      requiresToken,
      tokenConfigured: id === "stub" ? true : Boolean(secret),
      tokenPreview: ingestTokenPreview(secret),
      lastCheckOk: check?.ok ?? null,
      lastCheckAt: check?.at ?? null,
      lastCheckDetail: check?.detail ?? null,
      pollIntervalSeconds: await this.getIngestPollIntervalSeconds(id),
    };
  }

  defaultPollSecondsFromEnv(): number {
    const fromEnv = Number(process.env.INGEST_INTERVAL_MS ?? NaN);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return clampIngestPollSeconds(fromEnv / 1000);
    }
    return DEFAULT_INGEST_POLL_SECONDS;
  }

  async getIngestPollIntervalSeconds(
    provider?: IngestProviderId,
  ): Promise<number> {
    const p = provider ?? (await this.getIngestProvider());
    const key = p === "stub" ? META_POLL_STUB : META_POLL_NAVITIA;
    const raw = await this.getMeta(key);
    if (raw == null || raw === "") return this.defaultPollSecondsFromEnv();
    return clampIngestPollSeconds(raw);
  }

  async getIngestPollIntervalMs(
    provider?: IngestProviderId,
  ): Promise<number> {
    return (await this.getIngestPollIntervalSeconds(provider)) * 1000;
  }

  async getIngestConfigPublic(): Promise<IngestConfigPublic> {
    await this.ensureIngestConfigBootstrapped();
    const activeProvider = await this.getIngestProvider();
    const [stub, navitia] = await Promise.all([
      this.buildSlot("stub"),
      this.buildSlot("navitia"),
    ]);
    return {
      activeProvider,
      providers: { stub, navitia },
    };
  }

  /**
   * Met à jour secrets et/ou provider actif.
   * Un probe est fait côté route pour le statut OK/KO (n’empêche pas la persistance).
   */
  async updateIngestConfig(
    body: IngestConfigUpdate,
  ): Promise<IngestConfigPublic> {
    const nav = body.navitiaToken?.trim() ?? "";
    if (nav) await this.setMeta(META_NAVITIA_TOKEN, nav);
    if (body.activeProvider !== undefined) {
      const next = parseIngestProvider(body.activeProvider);
      await this.setMeta(META_INGEST_PROVIDER, next);
      // Board « prochain train » : jamais de stub affiché hors provider stub
      if (next !== "stub") {
        await this.clearStubBoardSnapshots();
      }
    }
    if (body.stubPollIntervalSeconds !== undefined) {
      await this.setMeta(
        META_POLL_STUB,
        String(clampIngestPollSeconds(body.stubPollIntervalSeconds)),
      );
    }
    if (body.navitiaPollIntervalSeconds !== undefined) {
      await this.setMeta(
        META_POLL_NAVITIA,
        String(clampIngestPollSeconds(body.navitiaPollIntervalSeconds)),
      );
    }
    return this.getIngestConfigPublic();
  }

  async verifyLogin(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string; role: UserRole } | null> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, username, password_hash, role, disabled_at
       FROM admin_accounts WHERE username = $1`,
      [username],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    if (row.disabled_at != null) return null;
    const ok = await bcrypt.compare(password, String(row.password_hash));
    if (!ok) return null;
    const role = isUserRole(row.role) ? row.role : "admin";
    return { id: String(row.id), username: String(row.username), role };
  }

  async changeAdminPassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const next = String(newPassword ?? "");
    if (next.length < ADMIN_PASSWORD_MIN_LENGTH) {
      throw Object.assign(
        new Error(
          `Le mot de passe doit faire au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères`,
        ),
        { statusCode: 400 },
      );
    }
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, password_hash FROM admin_accounts WHERE id = $1`,
      [adminId],
    );
    if (res.rowCount === 0) {
      throw Object.assign(new Error("Admin not found"), { statusCode: 404 });
    }
    const row = res.rows[0];
    const ok = await bcrypt.compare(
      String(currentPassword ?? ""),
      String(row.password_hash),
    );
    if (!ok) {
      throw Object.assign(new Error("Mot de passe actuel incorrect"), {
        statusCode: 401,
      });
    }
    const hash = await bcrypt.hash(next, 12);
    await pool.query(
      `UPDATE admin_accounts SET password_hash = $2 WHERE id = $1`,
      [adminId, hash],
    );
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
  ): Promise<{ adminId: string; username: string; role: UserRole } | null> {
    if (!sessionId) return null;
    const pool = getPool();
    const res = await pool.query(
      `SELECT s.admin_id, a.username, a.role, a.disabled_at, s.expires_at
       FROM sessions s
       JOIN admin_accounts a ON a.id = s.admin_id
       WHERE s.id = $1`,
      [sessionId],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    if (row.disabled_at != null) {
      await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      return null;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
      return null;
    }
    const role = isUserRole(row.role) ? row.role : "admin";
    return {
      adminId: String(row.admin_id),
      username: String(row.username),
      role,
    };
  }

  async deleteSession(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    const pool = getPool();
    await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  }

  async getVisitorEnabled(): Promise<boolean> {
    const raw = await this.getMeta(META_VISITOR_ENABLED);
    if (raw === null) return true;
    return raw !== "false";
  }

  async setVisitorEnabled(enabled: boolean): Promise<boolean> {
    await this.setMeta(META_VISITOR_ENABLED, enabled ? "true" : "false");
    return enabled;
  }

  async listUsers(): Promise<UserPublic[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT id, username, role, disabled_at, created_at
       FROM admin_accounts
       ORDER BY username`,
    );
    return res.rows.map(mapUserRow);
  }

  async createUser(body: UserCreateBody): Promise<UserPublic> {
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role;
    if (!username) {
      throw httpError(400, "username is required");
    }
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
      throw httpError(
        400,
        `Le mot de passe doit faire au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères`,
      );
    }
    if (!isUserRole(role)) {
      throw httpError(400, "role must be reader | liaison_editor | admin");
    }
    const hash = await bcrypt.hash(password, 12);
    const pool = getPool();
    try {
      const res = await pool.query(
        `INSERT INTO admin_accounts (username, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, username, role, disabled_at, created_at`,
        [username, hash, role],
      );
      return mapUserRow(res.rows[0]);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        throw httpError(409, "Username already exists");
      }
      throw err;
    }
  }

  async patchUser(id: string, body: UserPatchBody): Promise<UserPublic> {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT id, username, role, disabled_at, created_at, password_hash
       FROM admin_accounts WHERE id = $1`,
      [id],
    );
    if (existing.rowCount === 0) {
      throw httpError(404, "User not found");
    }
    const row = existing.rows[0];
    const current = mapUserRow(row);
    const nextRole =
      body.role !== undefined
        ? isUserRole(body.role)
          ? body.role
          : (() => {
              throw httpError(400, "role must be reader | liaison_editor | admin");
            })()
        : current.role;
    const nextDisabled =
      body.disabled !== undefined ? Boolean(body.disabled) : current.disabled;

    const adminCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM admin_accounts
       WHERE role = 'admin' AND disabled_at IS NULL`,
    );
    const activeAdminCount = Number(adminCount.rows[0]?.n ?? 0);
    if (
      wouldRemoveLastAdmin({
        targetIsActiveAdmin: current.role === "admin" && !current.disabled,
        activeAdminCount,
        disable: nextDisabled && !current.disabled ? true : undefined,
        nextRole: nextRole !== current.role ? nextRole : undefined,
      })
    ) {
      throw httpError(400, "Impossible de retirer le dernier admin");
    }

    let passwordHash = String(row.password_hash);
    if (body.password !== undefined && body.password !== "") {
      if (body.password.length < ADMIN_PASSWORD_MIN_LENGTH) {
        throw httpError(
          400,
          `Le mot de passe doit faire au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères`,
        );
      }
      passwordHash = await bcrypt.hash(body.password, 12);
    }

    const disabledAt = nextDisabled
      ? current.disabled
        ? row.disabled_at
        : new Date().toISOString()
      : null;

    const updated = await pool.query(
      `UPDATE admin_accounts
       SET role = $2, disabled_at = $3, password_hash = $4
       WHERE id = $1
       RETURNING id, username, role, disabled_at, created_at`,
      [id, nextRole, disabledAt, passwordHash],
    );

    if (nextDisabled && !current.disabled) {
      await pool.query(`DELETE FROM sessions WHERE admin_id = $1`, [id]);
    }

    return mapUserRow(updated.rows[0]);
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
      watchAlways:
        patch.watchAlways !== undefined
          ? Boolean(patch.watchAlways)
          : (base.watchAlways ?? false),
      watchLeadHours: clampWatchLeadHours(
        patch.watchLeadHours ?? base.watchLeadHours ?? DEFAULT_WATCH_LEAD_HOURS,
      ),
      notifyStepMinutes: clampNotifyStepMinutes(
        patch.notifyStepMinutes ?? base.notifyStepMinutes,
      ),
      updatedAt: new Date().toISOString(),
    };
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO journeys (
        liaison_id, direction, label, origin_id, destination_id, origin_label, destination_label,
        network, days_of_week, window_start, window_end, watch_always, watch_lead_hours,
        min_delay_minutes, notify_step_minutes, severities, active, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
        watch_always = EXCLUDED.watch_always,
        watch_lead_hours = EXCLUDED.watch_lead_hours,
        min_delay_minutes = EXCLUDED.min_delay_minutes,
        notify_step_minutes = EXCLUDED.notify_step_minutes,
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
        next.watchAlways,
        next.watchLeadHours,
        next.minDelayMinutes,
        next.notifyStepMinutes,
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
    isDefault = false,
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
      isDefault,
      outbound,
      inbound,
      updatedAt,
    };
  }

  async listLiaisons(): Promise<LiaisonConfig[]> {
    const pool = getPool();
    const [liaisonsRes, journeys] = await Promise.all([
      pool.query(
        `SELECT * FROM liaisons
         ORDER BY is_default DESC, updated_at ASC`,
      ),
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
        Boolean(row.is_default),
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
      Boolean(row.is_default),
    );
  }

  async createLiaison(): Promise<LiaisonConfig> {
    const pool = getPool();
    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM liaisons`);
    const isFirst = Number(countRes.rows[0]?.n ?? 0) === 0;
    const created = await pool.query(
      `INSERT INTO liaisons (name, is_default, updated_at)
       VALUES ('', $1, now()) RETURNING *`,
      [isFirst],
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
      isDefault: Boolean(created.rows[0].is_default),
      outbound,
      inbound,
      updatedAt: new Date(String(created.rows[0].updated_at)).toISOString(),
    };
  }

  async setDefaultLiaison(id: string): Promise<LiaisonConfig> {
    const pool = getPool();
    const existing = await this.getLiaison(id);
    if (!existing) {
      throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
    }
    await pool.query(`UPDATE liaisons SET is_default = false WHERE is_default = true`);
    await pool.query(
      `UPDATE liaisons SET is_default = true, updated_at = now() WHERE id = $1`,
      [id],
    );
    const next = await this.getLiaison(id);
    if (!next) {
      throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
    }
    return next;
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
      isDefault: Boolean(res.rows[0].is_default),
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
    const wasDefault = await pool.query(
      `SELECT is_default FROM liaisons WHERE id = $1`,
      [id],
    );
    const res = await pool.query(`DELETE FROM liaisons WHERE id = $1`, [id]);
    if ((res.rowCount ?? 0) === 0) {
      throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
    }
    if (Boolean(wasDefault.rows[0]?.is_default)) {
      await pool.query(`
        UPDATE liaisons SET is_default = true
        WHERE id = (SELECT id FROM liaisons ORDER BY updated_at ASC LIMIT 1)
      `);
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
    opts?: { direction?: JourneyDirection; liaisonId?: string },
  ): Promise<DisruptionEventDto[]> {
    const pool = getPool();
    const direction = opts?.direction;
    const liaisonId = opts?.liaisonId;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (direction) {
      params.push(direction);
      clauses.push(`direction = $${params.length}`);
    }
    if (liaisonId) {
      params.push(liaisonId);
      clauses.push(`liaison_id = $${params.length}`);
    }
    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const res = await pool.query(
      `SELECT * FROM disruption_events ${where}
       ORDER BY detected_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(mapEvent);
  }

  async listDeliveries(
    limit = 50,
    opts?: { liaisonId?: string },
  ): Promise<AlertDeliveryDto[]> {
    const pool = getPool();
    // Masquer les « suppressed » bruit (canaux OFF) — legacy + inutiles en UI
    const noise = `NOT (
      d.status = 'suppressed'
      AND d.detail IN (
        'EMAIL_ENABLED=false',
        'TEAMS_ENABLED=false',
        'SMTP désactivé (admin)',
        'TEAMS_ENABLED is false'
      )
    )`;
    if (opts?.liaisonId) {
      const res = await pool.query(
        `SELECT d.*, e.train_number
         FROM alert_deliveries d
         LEFT JOIN disruption_events e ON e.id = d.event_id
         WHERE d.liaison_id = $1 AND ${noise}
         ORDER BY d.created_at DESC LIMIT $2`,
        [opts.liaisonId, limit],
      );
      return res.rows.map(mapDelivery);
    }
    const res = await pool.query(
      `SELECT d.*, e.train_number
       FROM alert_deliveries d
       LEFT JOIN disruption_events e ON e.id = d.event_id
       WHERE ${noise}
       ORDER BY d.created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapDelivery);
  }

  async periodStats(
    sinceIso: string,
    liaisonId?: string,
  ): Promise<DashboardPeriodStats> {
    const pool = getPool();
    const eventFilter = liaisonId
      ? `detected_at >= $1 AND liaison_id = $2`
      : `detected_at >= $1`;
    const delFilter = liaisonId
      ? `created_at >= $1 AND liaison_id = $2`
      : `created_at >= $1`;
    const params = liaisonId ? [sinceIso, liaisonId] : [sinceIso];

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
        SUM(delay_minutes) FILTER (WHERE delay_minutes IS NOT NULL)::int AS total_delay,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
        COUNT(*) FILTER (WHERE direction IS NULL)::int AS unmatched,
        COUNT(*) FILTER (
          WHERE kind = 'delay' AND delay_reason_key IS NULL
        )::int AS delays_without_reason
       FROM disruption_events
       WHERE ${eventFilter}`,
      params,
    );
    const delRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM alert_deliveries
       WHERE ${delFilter}`,
      params,
    );
    const reasonRes = await pool.query(
      `SELECT delay_reason_key AS key,
              MIN(delay_reason) AS label,
              COUNT(*)::int AS count
       FROM disruption_events
       WHERE ${eventFilter}
         AND kind = 'delay'
         AND delay_reason_key IS NOT NULL
         AND delay_reason_key <> ''
       GROUP BY delay_reason_key
       ORDER BY count DESC, key ASC
       LIMIT 8`,
      params,
    );
    const weatherRes = await pool.query(
      `SELECT weather_bucket AS bucket,
              COUNT(*)::int AS delay_count,
              ROUND(AVG(delay_minutes) FILTER (WHERE delay_minutes IS NOT NULL))::int AS avg_delay
       FROM disruption_events
       WHERE ${eventFilter}
         AND kind = 'delay'
         AND weather_bucket IS NOT NULL
         AND weather_bucket <> 'unknown'
       GROUP BY weather_bucket
       ORDER BY delay_count DESC, weather_bucket ASC`,
      params,
    );
    const weatherCountRes = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM disruption_events
       WHERE ${eventFilter}
         AND kind = 'delay'
         AND weather_bucket IS NOT NULL
         AND weather_bucket <> 'unknown'`,
      params,
    );
    const corrRes = await pool.query(
      `SELECT CORR(precipitation_mm, delay_minutes::float) AS r,
              COUNT(*)::int AS n
       FROM disruption_events
       WHERE ${eventFilter}
         AND kind = 'delay'
         AND precipitation_mm IS NOT NULL
         AND delay_minutes IS NOT NULL`,
      params,
    );
    const onTimeFilter = liaisonId
      ? `o.status = 'on_time'
         AND COALESCE(o.scheduled_at, o.observed_at) >= $1::timestamptz
         AND COALESCE(o.scheduled_at, o.observed_at) <= now()
         AND j.liaison_id = $2`
      : `o.status = 'on_time'
         AND COALESCE(o.scheduled_at, o.observed_at) >= $1::timestamptz
         AND COALESCE(o.scheduled_at, o.observed_at) <= now()`;
    const onTimeRes = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM board_train_observations o
       JOIN journeys j ON j.id = o.journey_id
       WHERE ${onTimeFilter}`,
      params,
    );
    const e = res.rows[0] ?? {};
    const d = delRes.rows[0] ?? {};
    const delaysWithWeather = Number(weatherCountRes.rows[0]?.n ?? 0);
    const weatherCorrelation: WeatherDelayCorrelation[] = weatherRes.rows.map(
      (row) => {
        const bucket = String(row.bucket) as WeatherBucket;
        const delayCount = Number(row.delay_count ?? 0);
        return {
          bucket,
          label: weatherBucketLabel(bucket),
          delayCount,
          avgDelayMinutes:
            row.avg_delay === null || row.avg_delay === undefined
              ? null
              : Number(row.avg_delay),
          sharePercent:
            delaysWithWeather > 0
              ? Math.round((delayCount / delaysWithWeather) * 100)
              : 0,
        };
      },
    );
    const corrRow = corrRes.rows[0] ?? {};
    const corrN = Number(corrRow.n ?? 0);
    const corrR = corrRow.r === null || corrRow.r === undefined ? null : Number(corrRow.r);
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
      totalDelayMinutes:
        e.total_delay === null || e.total_delay === undefined
          ? null
          : Number(e.total_delay),
      deliveriesSent: Number(d.sent ?? 0),
      deliveriesFailed: Number(d.failed ?? 0),
      byDirection: {
        outbound: Number(e.outbound ?? 0),
        inbound: Number(e.inbound ?? 0),
        unmatched: Number(e.unmatched ?? 0),
      },
      delayReasons: reasonRes.rows.map((row) => ({
        key: String(row.key),
        label: String(row.label ?? row.key),
        count: Number(row.count ?? 0),
      })),
      delaysWithoutReason: Number(e.delays_without_reason ?? 0),
      delaysWithWeather,
      weatherCorrelation,
      precipitationDelayCorrelation:
        corrN >= 5 && corrR != null && Number.isFinite(corrR)
          ? Math.round(corrR * 100) / 100
          : null,
      onTimeTrains: Number(onTimeRes.rows[0]?.n ?? 0),
    };
  }

  /** Compteurs journaliers (Europe/Paris) — score retard pondéré par trains à l’heure. */
  async activityHeatmapDays(
    sinceIso: string,
    liaisonId?: string,
  ): Promise<DashboardHeatmapDay[]> {
    const pool = getPool();
    const eventFilter = liaisonId
      ? `detected_at >= $1 AND liaison_id = $2`
      : `detected_at >= $1`;
    const obsFilter = liaisonId
      ? `day >= ($1::timestamptz AT TIME ZONE 'Europe/Paris')::date AND liaison_id = $2`
      : `day >= ($1::timestamptz AT TIME ZONE 'Europe/Paris')::date`;
    const params = liaisonId ? [sinceIso, liaisonId] : [sinceIso];
    const res = await pool.query(
      `WITH scores AS (
         SELECT
           to_char((detected_at AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS day,
           COALESCE(
             SUM(
               CASE
                 WHEN kind = 'delay' THEN GREATEST(COALESCE(delay_minutes, 1), 1)
                 WHEN kind = 'cancellation' THEN 60
                 ELSE 0
               END
             ),
             0
           )::int AS delay_score
         FROM disruption_events
         WHERE ${eventFilter}
         GROUP BY 1
       ),
       observed AS (
         SELECT
           to_char(day, 'YYYY-MM-DD') AS day,
           COALESCE(SUM(on_time_count), 0)::int AS on_time_count
         FROM board_day_observations
         WHERE ${obsFilter}
         GROUP BY 1
       )
       SELECT
         COALESCE(o.day, s.day) AS day,
         COALESCE(s.delay_score, 0)::int AS delay_score,
         COALESCE(o.on_time_count, 0)::int AS on_time_count
       FROM observed o
       FULL OUTER JOIN scores s ON s.day = o.day
       ORDER BY 1`,
      params,
    );
    return res.rows.map((row) => {
      const delayScore = Number(row.delay_score ?? 0);
      const onTimeCount = Number(row.on_time_count ?? 0);
      // Pondération : plus de trains à l’heure → intensité retard diluée
      const count =
        delayScore <= 0
          ? 0
          : Math.max(
              1,
              Math.round(delayScore / (1 + onTimeCount * 0.5)),
            );
      return {
        date: String(row.day),
        count,
        onTimeCount,
      };
    });
  }

  /**
   * Détail d’un jour civil Europe/Paris (clic heatmap).
   * @param liaisonQuery `all` = global ; uuid = scoped ; undefined = default liaison
   */
  async getDayDetail(
    dateYmd: string,
    liaisonQuery?: string,
  ): Promise<DashboardDayDetail> {
    if (!isValidYmd(dateYmd)) {
      throw Object.assign(new Error("date YYYY-MM-DD invalide"), {
        statusCode: 400,
      });
    }
    if (dateYmd > parisYmd()) {
      throw Object.assign(new Error("date future"), { statusCode: 400 });
    }

    const allLiaisons = await this.listLiaisons();
    let filterLiaisonId: string | undefined;
    let weatherLiaison =
      allLiaisons.find((l) => l.isDefault) ?? allLiaisons[0] ?? null;

    if (liaisonQuery === "all") {
      filterLiaisonId = undefined;
    } else if (liaisonQuery) {
      const found = allLiaisons.find((l) => l.id === liaisonQuery);
      if (!found) {
        throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
      }
      filterLiaisonId = found.id;
      weatherLiaison = found;
    } else if (weatherLiaison) {
      filterLiaisonId = weatherLiaison.id;
    }

    const startIso = parisMidnightIso(dateYmd);
    const endIso = parisMidnightIso(addDaysYmd(dateYmd, 1));
    const pool = getPool();
    const eventParams = filterLiaisonId
      ? [startIso, endIso, filterLiaisonId]
      : [startIso, endIso];
    const eventFilter = filterLiaisonId
      ? `detected_at >= $1 AND detected_at < $2 AND liaison_id = $3`
      : `detected_at >= $1 AND detected_at < $2`;

    const [eventRes, obsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM disruption_events
         WHERE ${eventFilter}
           AND kind IN ('delay', 'cancellation')
         ORDER BY detected_at ASC
         LIMIT 100`,
        eventParams,
      ),
      filterLiaisonId
        ? pool.query(
            `SELECT COALESCE(SUM(on_time_count), 0)::int AS on_time_count
             FROM board_day_observations
             WHERE day = $1::date AND liaison_id = $2`,
            [dateYmd, filterLiaisonId],
          )
        : pool.query(
            `SELECT COALESCE(SUM(on_time_count), 0)::int AS on_time_count
             FROM board_day_observations
             WHERE day = $1::date`,
            [dateYmd],
          ),
    ]);

    const events = eventRes.rows.map(mapEvent);
    const onTimeCount = Number(obsRes.rows[0]?.on_time_count ?? 0);
    const hasObservation = obsRes.rows.length > 0 || events.length > 0;

    const reasonMap = new Map<
      string,
      { key: string; label: string; count: number }
    >();
    let delaysWithoutReason = 0;
    for (const e of events) {
      if (e.kind !== "delay") continue;
      if (!e.delayReasonKey) {
        delaysWithoutReason += 1;
        continue;
      }
      const existing = reasonMap.get(e.delayReasonKey);
      if (existing) {
        existing.count += 1;
      } else {
        reasonMap.set(e.delayReasonKey, {
          key: e.delayReasonKey,
          label: e.delayReason?.trim() || e.delayReasonKey,
          count: 1,
        });
      }
    }
    const delayReasons = [...reasonMap.values()].sort(
      (a, b) => b.count - a.count || a.key.localeCompare(b.key),
    );

    let weather: DashboardDayDetail["weather"] = null;
    const origin = weatherLiaison?.outbound;
    const stationLabel = origin?.originLabel?.trim() || null;
    if (origin?.originId) {
      const coords = await this.resolveStationCoordinates(
        origin.originId,
        origin.originLabel,
      );
      if (coords) {
        const daily = await fetchWeatherForParisDay(
          coords.latitude,
          coords.longitude,
          dateYmd,
        );
        if (daily) {
          weather = {
            ...daily,
            source: "daily",
            stationLabel,
          };
        }
      }
    }
    if (!weather) {
      const withWx = events.find(
        (e) =>
          (e.weatherBucket && e.weatherBucket !== "unknown") ||
          e.weatherLabel ||
          e.temperatureC != null,
      );
      if (withWx) {
        weather = {
          weatherBucket: withWx.weatherBucket,
          weatherCode: withWx.weatherCode,
          weatherLabel: withWx.weatherLabel,
          precipitationMm: withWx.precipitationMm,
          windSpeedKmh: withWx.windSpeedKmh,
          temperatureC: withWx.temperatureC,
          source: "event",
          stationLabel,
        };
      }
    }

    return {
      date: dateYmd,
      hasObservation,
      onTimeCount,
      events,
      delayReasons,
      delaysWithoutReason,
      weather,
    };
  }

  /**
   * @param liaisonQuery `all` = global ; uuid = scoped ; undefined = default liaison
   */
  async getOverview(liaisonQuery?: string): Promise<DashboardOverview> {
    const allLiaisons = await this.listLiaisons();
    const availableLiaisons: LiaisonOption[] = allLiaisons.map((l) => ({
      id: l.id,
      displayName: l.displayName,
      isDefault: l.isDefault,
    }));

    let scope: "liaison" | "all";
    let selectedLiaisonId: string | null;
    let filterLiaisonId: string | undefined;

    if (liaisonQuery === "all") {
      scope = "all";
      selectedLiaisonId = null;
      filterLiaisonId = undefined;
    } else if (liaisonQuery) {
      const found = allLiaisons.find((l) => l.id === liaisonQuery);
      if (!found) {
        throw Object.assign(new Error("Liaison not found"), { statusCode: 404 });
      }
      scope = "liaison";
      selectedLiaisonId = found.id;
      filterLiaisonId = found.id;
    } else {
      const def =
        allLiaisons.find((l) => l.isDefault) ?? allLiaisons[0] ?? null;
      scope = "liaison";
      selectedLiaisonId = def?.id ?? null;
      filterLiaisonId = def?.id;
    }

    const listOpts = filterLiaisonId
      ? { liaisonId: filterLiaisonId }
      : undefined;

    const [events, recentEvents, recentDeliveries] = await Promise.all([
      this.listEvents(40, listOpts),
      this.listEvents(12, listOpts),
      this.listDeliveries(12, listOpts),
    ]);
    const pool = getPool();
    const now = Date.now();
    const since = dashboardPeriodStarts(new Date(now));
    const sinceHeatmap = new Date(now - 53 * 7 * 24 * 3600 * 1000).toISOString();

    const [metaRes, today, last24h, week, month, year, last7d, last30d, activityHeatmap] =
      await Promise.all([
      pool.query(
        `SELECT
          (SELECT value FROM app_meta WHERE key = 'last_ingest_at') AS last_ingest,
          (SELECT value FROM app_meta WHERE key = 'last_ingest_status') AS last_ingest_status,
          (SELECT value FROM app_meta WHERE key = 'last_ingest_detail') AS last_ingest_detail`,
      ),
      this.periodStats(since.today, filterLiaisonId),
      this.periodStats(since.last24h, filterLiaisonId),
      this.periodStats(since.week, filterLiaisonId),
      this.periodStats(since.month, filterLiaisonId),
      this.periodStats(since.year, filterLiaisonId),
      this.periodStats(since.last7d, filterLiaisonId),
      this.periodStats(since.last30d, filterLiaisonId),
      this.activityHeatmapDays(sinceHeatmap, filterLiaisonId),
    ]);

    const s = metaRes.rows[0] ?? {};
    const lastIngestAt = s.last_ingest ? String(s.last_ingest) : null;
    const lastIngestStatus = (s.last_ingest_status as IngestRunStatus | null) ?? null;
    const lastIngestDetail = s.last_ingest_detail
      ? String(s.last_ingest_detail)
      : null;

    const scopedLiaisons =
      scope === "all"
        ? allLiaisons
        : allLiaisons.filter((l) => l.id === selectedLiaisonId);

    const stations = await this.listStations();
    const stationByExt = new Map(
      stations.map((s) => [s.externalId, s] as const),
    );

    const journeyIds = scopedLiaisons.flatMap((l) => [
      l.outbound.id,
      l.inbound.id,
    ]);
    const boardByJourney = await this.getJourneyBoardSnapshots(journeyIds);

    const originKeys = new Map<string, string>();
    for (const l of scopedLiaisons) {
      for (const j of [l.outbound, l.inbound]) {
        if (j.originId) originKeys.set(j.originId, j.originLabel);
      }
    }
    const weatherByOrigin = new Map<string, WeatherSnapshotPublic | null>();
    await Promise.all(
      [...originKeys.entries()].map(async ([originId, originLabel]) => {
        const w = await this.getWeatherForOrigin(originId, originLabel);
        weatherByOrigin.set(originId, w);
      }),
    );

    const card = (j: JourneyConfig): JourneyStatusCard => {
      const latest =
        events.find((e) => e.journeyId === j.id) ??
        events.find(
          (e) => e.liaisonId === j.liaisonId && e.direction === j.direction,
        ) ??
        null;

      let { boardStatus, boardStatusLabel } = resolveBoardStatus({
        journey: j,
        lastIngestAt,
        lastIngestStatus,
      });

      const nextDeparture = boardByJourney.get(j.id) ?? null;
      const ingestDegraded = lastIngestStatus === "error";
      // Statut en cours = prochain train (horaire), pas le dernier événement / poll OK
      if (
        nextDeparture &&
        boardStatus !== "paused" &&
        boardStatus !== "outside_window"
      ) {
        if (nextDeparture.status === "cancelled") {
          boardStatus = "cancelled";
          boardStatusLabel = nextDeparture.statusLabel;
        } else if (nextDeparture.status === "delayed") {
          boardStatus = "delayed";
          boardStatusLabel = nextDeparture.statusLabel;
        } else if (nextDeparture.status === "on_time") {
          boardStatus = "on_time";
          boardStatusLabel = nextDeparture.statusLabel;
        } else if (nextDeparture.status === "unknown") {
          boardStatus = "no_data";
          boardStatusLabel = nextDeparture.statusLabel;
        }
        if (ingestDegraded) {
          boardStatusLabel = `Ingest KO · ${boardStatusLabel}`;
        }
      } else if (
        boardStatus !== "paused" &&
        boardStatus !== "outside_window" &&
        !ingestDegraded
      ) {
        boardStatus = "no_data";
        boardStatusLabel = "Pas de prochain train";
      }

      const originStation = stationByExt.get(j.originId);
      const destStation = stationByExt.get(j.destinationId);

      return {
        id: j.id,
        liaisonId: j.liaisonId,
        direction: j.direction,
        label: j.label,
        active: j.active,
        originLabel: j.originLabel,
        destinationLabel: j.destinationLabel,
        originDisplayUrl: originStation?.displayUrl ?? null,
        destinationDisplayUrl: destStation?.displayUrl ?? null,
        network: j.network,
        timeWindow: j.timeWindow,
        daysOfWeek: j.daysOfWeek,
        watchAlways: j.watchAlways,
        watchLeadHours: j.watchLeadHours,
        minDelayMinutes: j.minDelayMinutes,
        notifyStepMinutes: j.notifyStepMinutes,
        boardStatus,
        boardStatusLabel,
        nextDeparture,
        originWeather: weatherByOrigin.get(j.originId) ?? null,
        latestEvent: latest
          ? {
              id: latest.id,
              kind: latest.kind,
              severity: latest.severity,
              title: latest.title,
              trainNumber: latest.trainNumber,
              delayMinutes: latest.delayMinutes,
              delayReason: latest.delayReason,
              detectedAt: latest.detectedAt,
            }
          : null,
      };
    };

    const liaisonCards: LiaisonStatusCard[] = scopedLiaisons.map((l) => ({
      id: l.id,
      name: l.name,
      displayName: l.displayName,
      isDefault: l.isDefault,
      outbound: card(l.outbound),
      inbound: card(l.inbound),
    }));

    return {
      scope,
      selectedLiaisonId,
      availableLiaisons,
      liaisons: liaisonCards,
      stats: {
        eventsLast24h: last24h.events,
        deliveriesSentLast24h: last24h.deliveriesSent,
        deliveriesFailedLast24h: last24h.deliveriesFailed,
        ingestProvider: await this.getIngestProvider(),
        lastIngestAt,
        periods: { today, last24h, week, month, year, last7d, last30d },
      },
      lastIngest: {
        at: lastIngestAt,
        status: lastIngestStatus,
        detail: lastIngestDetail,
      },
      recentEvents,
      recentDeliveries,
      activityHeatmap,
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

  /** Bootstrap SMTP depuis .env une fois si meta vide. */
  async ensureSmtpBootstrapped(): Promise<void> {
    const done = await this.getMeta(META_SMTP_BOOTSTRAPPED);
    if (done === "1") return;
    const host = (process.env.SMTP_HOST ?? "").trim();
    if (host) {
      const existing = await this.getMeta(META_SMTP_HOST);
      if (existing === null) {
        await this.setMeta(META_SMTP_HOST, host);
        await this.setMeta(
          META_SMTP_PORT,
          String(process.env.SMTP_PORT ?? "587"),
        );
        await this.setMeta(
          META_SMTP_SECURE,
          process.env.SMTP_SECURE === "true" ? "1" : "0",
        );
        await this.setMeta(
          META_SMTP_USERNAME,
          (process.env.SMTP_USERNAME ?? "").trim(),
        );
        await this.setMeta(
          META_SMTP_FROM,
          (process.env.SMTP_FROM ?? "").trim(),
        );
        const pass = process.env.SMTP_PASSWORD ?? "";
        if (pass) await this.setMeta(META_SMTP_PASSWORD, pass);
        await this.setMeta(
          META_SMTP_ENABLED,
          process.env.EMAIL_ENABLED === "true" ? "1" : "0",
        );
      }
    }
    await this.setMeta(META_SMTP_BOOTSTRAPPED, "1");
  }

  async getSmtpPublic(): Promise<SmtpConfigPublic> {
    await this.ensureSmtpBootstrapped();
    const host =
      (await this.getMeta(META_SMTP_HOST)) ??
      (process.env.SMTP_HOST ?? "").trim();
    const portRaw =
      (await this.getMeta(META_SMTP_PORT)) ?? process.env.SMTP_PORT ?? "587";
    const secureMeta = await this.getMeta(META_SMTP_SECURE);
    const secure =
      secureMeta != null
        ? secureMeta === "1" || secureMeta === "true"
        : process.env.SMTP_SECURE === "true";
    const username =
      (await this.getMeta(META_SMTP_USERNAME)) ??
      (process.env.SMTP_USERNAME ?? "").trim();
    const fromAddress =
      (await this.getMeta(META_SMTP_FROM)) ??
      (process.env.SMTP_FROM ?? "").trim();
    const password =
      (await this.getMeta(META_SMTP_PASSWORD)) ??
      process.env.SMTP_PASSWORD ??
      "";
    const enabledMeta = await this.getMeta(META_SMTP_ENABLED);
    const enabled =
      enabledMeta != null
        ? enabledMeta === "1" || enabledMeta === "true"
        : process.env.EMAIL_ENABLED === "true";
    return {
      host,
      port: Number(portRaw) || 587,
      secure,
      username,
      fromAddress,
      passwordConfigured: Boolean(password.trim()),
      enabled,
    };
  }

  /** Secrets runtime SMTP (serveur uniquement). */
  async getSmtpRuntime(): Promise<{
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromAddress: string;
  }> {
    const pub = await this.getSmtpPublic();
    const password =
      (await this.getMeta(META_SMTP_PASSWORD)) ??
      process.env.SMTP_PASSWORD ??
      "";
    return {
      enabled: pub.enabled,
      host: pub.host,
      port: pub.port,
      secure: pub.secure,
      username: pub.username,
      password,
      fromAddress: pub.fromAddress,
    };
  }

  async updateSmtpConfig(body: SmtpConfigUpdate): Promise<SmtpConfigPublic> {
    await this.ensureSmtpBootstrapped();
    if (body.enabled !== undefined) {
      await this.setMeta(META_SMTP_ENABLED, body.enabled ? "1" : "0");
    }
    if (body.host !== undefined) {
      await this.setMeta(META_SMTP_HOST, body.host.trim());
    }
    if (body.port !== undefined) {
      await this.setMeta(META_SMTP_PORT, String(body.port));
    }
    if (body.secure !== undefined) {
      await this.setMeta(META_SMTP_SECURE, body.secure ? "1" : "0");
    }
    if (body.username !== undefined) {
      await this.setMeta(META_SMTP_USERNAME, body.username.trim());
    }
    if (body.fromAddress !== undefined) {
      await this.setMeta(META_SMTP_FROM, body.fromAddress.trim());
    }
    const pass = body.password?.trim() ?? "";
    if (pass) await this.setMeta(META_SMTP_PASSWORD, pass);
    return this.getSmtpPublic();
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

  async clearStubBoardSnapshots(): Promise<void> {
    const pool = getPool();
    await pool.query(
      `DELETE FROM journey_board_snapshots WHERE source = 'stub'`,
    );
  }

  async clearJourneyBoardSnapshot(journeyId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `DELETE FROM journey_board_snapshots WHERE journey_id = $1`,
      [journeyId],
    );
  }

  /**
   * Observation idempotente d’un train surveillé (à l’heure / retard / supprimé).
   * Incrémente les compteurs journaliers seulement à la première vue.
   */
  async upsertBoardTrainObservation(input: {
    journeyId: string;
    baseDepartureKey: string;
    trainNumber: string | null;
    scheduledAt: string | null;
    status: "on_time" | "delayed" | "cancelled" | "unknown";
    delayMinutes: number | null;
    observedAt?: string;
  }): Promise<{ created: boolean }> {
    const pool = getPool();
    const observedAt = input.observedAt ?? new Date().toISOString();
    const insert = await pool.query(
      `INSERT INTO board_train_observations (
         journey_id, base_departure_key, train_number, scheduled_at,
         status, delay_minutes, observed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (journey_id, base_departure_key) DO UPDATE SET
         train_number = COALESCE(EXCLUDED.train_number, board_train_observations.train_number),
         scheduled_at = COALESCE(EXCLUDED.scheduled_at, board_train_observations.scheduled_at),
         status = EXCLUDED.status,
         delay_minutes = EXCLUDED.delay_minutes,
         observed_at = EXCLUDED.observed_at
       RETURNING (xmax = 0) AS inserted`,
      [
        input.journeyId,
        input.baseDepartureKey.slice(0, 200),
        input.trainNumber,
        input.scheduledAt,
        input.status,
        input.delayMinutes,
        observedAt,
      ],
    );
    const created = Boolean(insert.rows[0]?.inserted);

    if (created) {
      const col =
        input.status === "on_time"
          ? "on_time_count"
          : input.status === "cancelled"
            ? "cancelled_count"
            : input.status === "delayed"
              ? "delayed_count"
              : null;
      if (col) {
        await pool.query(
          `INSERT INTO board_day_observations (day, liaison_id, ${col})
           SELECT
             (($1::timestamptz) AT TIME ZONE 'Europe/Paris')::date,
             j.liaison_id,
             1
           FROM journeys j
           WHERE j.id = $2::uuid AND j.liaison_id IS NOT NULL
           ON CONFLICT (day, liaison_id) DO UPDATE SET
             ${col} = board_day_observations.${col} + 1`,
          [observedAt, input.journeyId],
        );
      } else {
        // unknown : marque le jour observé sans incrémenter un compteur métier
        await pool.query(
          `INSERT INTO board_day_observations (day, liaison_id)
           SELECT
             (($1::timestamptz) AT TIME ZONE 'Europe/Paris')::date,
             j.liaison_id
           FROM journeys j
           WHERE j.id = $2::uuid AND j.liaison_id IS NOT NULL
           ON CONFLICT DO NOTHING`,
          [observedAt, input.journeyId],
        );
      }
    }

    return { created };
  }

  /** Dernières observations trains (debug admin), plus récentes d’abord. */
  async listRecentTrainObservations(input?: {
    limit?: number;
    trainNumber?: string | null;
    status?: "on_time" | "delayed" | "cancelled" | "unknown" | null;
  }): Promise<TrainObservationDto[]> {
    const pool = getPool();
    const capped = Math.min(
      Math.max(1, Math.floor(input?.limit ?? 100)),
      500,
    );
    const trainQ = input?.trainNumber?.trim().replace(/\s+/g, "") ?? "";
    const status = input?.status ?? null;
    const clauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (trainQ) {
      clauses.push(
        `regexp_replace(upper(COALESCE(o.train_number, '')), '[^A-Z0-9]', '', 'g')
         LIKE '%' || $${i} || '%'`,
      );
      params.push(trainQ.toUpperCase().replace(/[^A-Z0-9]/gi, ""));
      i += 1;
    }
    if (status) {
      clauses.push(`o.status = $${i}`);
      params.push(status);
      i += 1;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(capped);
    const res = await pool.query(
      `SELECT
         o.journey_id,
         o.train_number,
         o.scheduled_at,
         o.status,
         o.delay_minutes,
         o.observed_at,
         j.direction,
         j.origin_label,
         j.destination_label,
         j.liaison_id,
         l.name AS liaison_name
       FROM board_train_observations o
       JOIN journeys j ON j.id = o.journey_id
       LEFT JOIN liaisons l ON l.id = j.liaison_id
       ${where}
       ORDER BY
         CASE o.status WHEN 'cancelled' THEN 0 WHEN 'delayed' THEN 1 ELSE 2 END,
         o.observed_at DESC
       LIMIT $${i}`,
      params,
    );
    return res.rows.map((row) => ({
      journeyId: String(row.journey_id),
      liaisonId: row.liaison_id ? String(row.liaison_id) : null,
      liaisonName: row.liaison_name ? String(row.liaison_name) : null,
      direction: (row.direction === "inbound" ? "inbound" : "outbound") as
        | "outbound"
        | "inbound",
      originLabel: String(row.origin_label ?? ""),
      destinationLabel: String(row.destination_label ?? ""),
      trainNumber: row.train_number ? String(row.train_number) : null,
      scheduledAt: row.scheduled_at
        ? new Date(row.scheduled_at as string | Date).toISOString()
        : null,
      status: (["on_time", "delayed", "cancelled", "unknown"].includes(
        String(row.status),
      )
        ? String(row.status)
        : "unknown") as
        | "on_time"
        | "delayed"
        | "cancelled"
        | "unknown",
      delayMinutes:
        row.delay_minutes == null ? null : Number(row.delay_minutes),
      observedAt: new Date(row.observed_at as string | Date).toISOString(),
    }));
  }

  async upsertJourneyBoardSnapshot(input: {
    journeyId: string;
    trainNumber: string | null;
    scheduledAt: string | null;
    realtimeAt: string | null;
    delayMinutes: number | null;
    cancelled: boolean;
    status: string;
    statusLabel: string;
    source: string;
    fetchedAt?: string;
  }): Promise<void> {
    // Ne jamais persister un board stub (prochain train = APIs réelles uniquement)
    if (input.source === "stub") return;

    const pool = getPool();
    const fetchedAt = input.fetchedAt ?? new Date().toISOString();
    await pool.query(
      `INSERT INTO journey_board_snapshots (
         journey_id, train_number, scheduled_at, realtime_at, delay_minutes,
         cancelled, status, status_label, source, fetched_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (journey_id) DO UPDATE SET
         train_number = EXCLUDED.train_number,
         scheduled_at = EXCLUDED.scheduled_at,
         realtime_at = EXCLUDED.realtime_at,
         delay_minutes = EXCLUDED.delay_minutes,
         cancelled = EXCLUDED.cancelled,
         status = EXCLUDED.status,
         status_label = EXCLUDED.status_label,
         source = EXCLUDED.source,
         fetched_at = EXCLUDED.fetched_at`,
      [
        input.journeyId,
        input.trainNumber,
        input.scheduledAt,
        input.realtimeAt,
        input.delayMinutes,
        input.cancelled,
        input.status,
        input.statusLabel,
        input.source,
        fetchedAt,
      ],
    );
    // Marque le jour (Paris) comme observé → heatmap vert si aucun retard
    await pool.query(
      `INSERT INTO board_day_observations (day, liaison_id)
       SELECT
         (($1::timestamptz) AT TIME ZONE 'Europe/Paris')::date,
         j.liaison_id
       FROM journeys j
       WHERE j.id = $2::uuid AND j.liaison_id IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [fetchedAt, input.journeyId],
    );
  }

  async getJourneyBoardSnapshots(
    journeyIds: string[],
  ): Promise<Map<string, NextDepartureInfo>> {
    const map = new Map<string, NextDepartureInfo>();
    if (journeyIds.length === 0) return map;
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM journey_board_snapshots WHERE journey_id = ANY($1::uuid[])`,
      [journeyIds],
    );
    for (const row of res.rows) {
      const source = String(row.source);
      // Prochain train = Navitia (jamais stub, G&C, ni ancien ZOU)
      if (
        source === "stub" ||
        source === "garesetconnexions" ||
        source === "zou"
      ) {
        continue;
      }

      const scheduledAt = row.scheduled_at
        ? new Date(String(row.scheduled_at)).toISOString()
        : null;
      const realtimeAt = row.realtime_at
        ? new Date(String(row.realtime_at)).toISOString()
        : null;
      const cancelled = Boolean(row.cancelled);
      if (
        !cancelled &&
        !isDepartureStillDue(
          realtimeAt ? new Date(realtimeAt) : null,
          scheduledAt ? new Date(scheduledAt) : null,
        )
      ) {
        continue;
      }
      const scheduledTime = formatHmParis(scheduledAt);
      const realtimeTime = formatHmParis(realtimeAt);
      map.set(String(row.journey_id), {
        trainNumber: row.train_number ? String(row.train_number) : null,
        scheduledTime,
        realtimeTime:
          realtimeTime && realtimeTime !== scheduledTime ? realtimeTime : null,
        delayMinutes:
          row.delay_minutes === null || row.delay_minutes === undefined
            ? null
            : Number(row.delay_minutes),
        status: row.status as NextDepartureInfo["status"],
        statusLabel: String(row.status_label),
        fetchedAt: new Date(String(row.fetched_at)).toISOString(),
        source: source as NextDepartureInfo["source"],
      });
    }
    return map;
  }

  async upsertEvent(
    input: Omit<DisruptionEventDto, "id" | "detectedAt"> & { detectedAt?: string },
  ): Promise<{
    event: DisruptionEventDto;
    created: boolean;
    previousKind: DisruptionKind | null;
    notifiedDelayMinutes: number | null;
    notifiedSeverity: DisruptionSeverity | null;
  }> {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT * FROM disruption_events WHERE external_event_id = $1`,
      [input.externalEventId],
    );
    const delayReason = input.delayReason ?? null;
    const delayReasonKey = input.delayReasonKey ?? null;
    const trainNumber =
      input.trainNumber?.trim() ? input.trainNumber.trim() : null;
    const weatherBucket = input.weatherBucket ?? null;
    const weatherCode = input.weatherCode ?? null;
    const weatherLabel = input.weatherLabel ?? null;
    const precipitationMm = input.precipitationMm ?? null;
    const windSpeedKmh = input.windSpeedKmh ?? null;
    const temperatureC = input.temperatureC ?? null;
    if ((existing.rowCount ?? 0) > 0) {
      const prev = existing.rows[0] as Record<string, unknown>;
      const res = await pool.query(
        `UPDATE disruption_events SET
          journey_id = $2, liaison_id = $3, direction = $4, kind = $5, severity = $6,
          title = $7, description = $8, delay_minutes = $9, starts_at = $10, ends_at = $11,
          source = $12, delay_reason = $13, delay_reason_key = $14,
          weather_bucket = $15, weather_code = $16, weather_label = $17,
          precipitation_mm = $18, wind_speed_kmh = $19, temperature_c = $20,
          train_number = $21
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
          delayReason,
          delayReasonKey,
          weatherBucket,
          weatherCode,
          weatherLabel,
          precipitationMm,
          windSpeedKmh,
          temperatureC,
          trainNumber,
        ],
      );
      return {
        event: mapEvent(res.rows[0]),
        created: false,
        previousKind: (prev.kind as DisruptionKind | null) ?? null,
        notifiedDelayMinutes:
          prev.notified_delay_minutes === null ||
          prev.notified_delay_minutes === undefined
            ? null
            : Number(prev.notified_delay_minutes),
        notifiedSeverity:
          (prev.notified_severity as DisruptionSeverity | null) ?? null,
      };
    }
    const res = await pool.query(
      `INSERT INTO disruption_events (
        external_event_id, journey_id, liaison_id, direction, kind, severity, title, description,
        delay_minutes, starts_at, ends_at, source, detected_at, delay_reason, delay_reason_key,
        weather_bucket, weather_code, weather_label, precipitation_mm, wind_speed_kmh, temperature_c,
        train_number
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz, now()),$14,$15,$16,$17,$18,$19,$20,$21,$22)
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
        delayReason,
        delayReasonKey,
        weatherBucket,
        weatherCode,
        weatherLabel,
        precipitationMm,
        windSpeedKmh,
        temperatureC,
        trainNumber,
      ],
    );
    return {
      event: mapEvent(res.rows[0]),
      created: true,
      previousKind: null,
      notifiedDelayMinutes: null,
      notifiedSeverity: null,
    };
  }

  async markEventNotified(
    eventId: string,
    delayMinutes: number | null,
    severity: DisruptionSeverity,
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE disruption_events
       SET notified_delay_minutes = $2, notified_severity = $3
       WHERE id = $1`,
      [eventId, delayMinutes, severity],
    );
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
    liaisonId?: string | null;
    direction: JourneyDirection | null;
    channel: DeliveryChannel;
    status: DeliveryStatus;
    detail: string | null;
    sentAt?: string | null;
  }): Promise<AlertDeliveryDto> {
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO alert_deliveries (event_id, liaison_id, direction, channel, status, detail, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.eventId,
        input.liaisonId ?? null,
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

  async clearStats(input: {
    eventSources?: IngestEventSource[];
    deliveries?: boolean;
  }): Promise<{
    deletedEvents: number;
    deletedDeliveries: number;
    deletedBoardDays: number;
    deletedTrainObservations: number;
  }> {
    const sources = [...new Set(input.eventSources ?? [])].filter(
      (s): s is IngestEventSource =>
        s === "stub" || s === "prim" || s === "navitia" || s === "zou",
    );
    const clearDeliveries = input.deliveries === true;
    if (sources.length === 0 && !clearDeliveries) {
      throw Object.assign(new Error("Nothing selected to clear"), {
        statusCode: 400,
      });
    }

    const pool = getPool();
    const client = await pool.connect();
    let deletedEvents = 0;
    let deletedDeliveries = 0;
    let deletedBoardDays = 0;
    let deletedTrainObservations = 0;
    try {
      await client.query("BEGIN");

      if (sources.length > 0) {
        const ev = await client.query(
          `DELETE FROM disruption_events
           WHERE source = ANY($1::text[])
           RETURNING id`,
          [sources],
        );
        deletedEvents = ev.rowCount ?? 0;
        const ids = ev.rows.map((r) => String(r.id));
        if (ids.length > 0) {
          const linked = await client.query(
            `DELETE FROM alert_deliveries
             WHERE event_id = ANY($1::uuid[])`,
            [ids],
          );
          deletedDeliveries += linked.rowCount ?? 0;
        }

        // Heatmap / indicateurs board : mêmes compteurs que le dashboard
        // (jours verts à l’heure + observations trains). Rebuild au prochain poll.
        const days = await client.query(
          `DELETE FROM board_day_observations RETURNING day`,
        );
        deletedBoardDays = days.rowCount ?? 0;
        const trains = await client.query(
          `DELETE FROM board_train_observations RETURNING journey_id`,
        );
        deletedTrainObservations = trains.rowCount ?? 0;
      }

      if (clearDeliveries) {
        const del = await client.query(`DELETE FROM alert_deliveries`);
        deletedDeliveries += del.rowCount ?? 0;
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return {
      deletedEvents,
      deletedDeliveries,
      deletedBoardDays,
      deletedTrainObservations,
    };
  }

  async listStations(): Promise<Station[]> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM stations ORDER BY label ASC`,
    );
    return res.rows.map(mapStation);
  }

  async getStation(id: string): Promise<Station | null> {
    const pool = getPool();
    const res = await pool.query(`SELECT * FROM stations WHERE id = $1`, [id]);
    if (res.rowCount === 0) return null;
    return mapStation(res.rows[0]);
  }

  async getStationByExternalId(externalId: string): Promise<Station | null> {
    const id = String(externalId ?? "").trim();
    if (!id) return null;
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM stations WHERE external_id = $1`,
      [id],
    );
    if (res.rowCount === 0) return null;
    return mapStation(res.rows[0]);
  }

  async createStation(body: StationUpsertBody): Promise<Station> {
    const externalId = String(body.externalId ?? "").trim();
    const label = String(body.label ?? "").trim();
    const displayUrl = normalizeDisplayUrl(body.displayUrl);
    const terminusHelpersEnabled = body.terminusHelpersEnabled === true;
    const terminusHelperLabels = normalizeTerminusHelperLabels(
      body.terminusHelperLabels,
    );
    if (!externalId || !label) {
      throw Object.assign(new Error("label and externalId are required"), {
        statusCode: 400,
      });
    }
    const pool = getPool();
    try {
      const res = await pool.query(
        `INSERT INTO stations (
           external_id, label, display_url,
           terminus_helpers_enabled, terminus_helper_labels, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, now())
         RETURNING *`,
        [
          externalId,
          label,
          displayUrl,
          terminusHelpersEnabled,
          terminusHelperLabels,
        ],
      );
      return mapStation(res.rows[0]);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        throw Object.assign(new Error("Station externalId already exists"), {
          statusCode: 409,
        });
      }
      throw err;
    }
  }

  async updateStation(id: string, body: StationUpsertBody): Promise<Station> {
    const current = await this.getStation(id);
    if (!current) {
      throw Object.assign(new Error("Station not found"), { statusCode: 404 });
    }
    const externalId =
      body.externalId !== undefined
        ? String(body.externalId).trim()
        : current.externalId;
    const label =
      body.label !== undefined ? String(body.label).trim() : current.label;
    const displayUrl =
      body.displayUrl !== undefined
        ? normalizeDisplayUrl(body.displayUrl)
        : current.displayUrl;
    const terminusHelpersEnabled =
      body.terminusHelpersEnabled !== undefined
        ? body.terminusHelpersEnabled === true
        : current.terminusHelpersEnabled;
    const terminusHelperLabels =
      body.terminusHelperLabels !== undefined
        ? normalizeTerminusHelperLabels(body.terminusHelperLabels)
        : current.terminusHelperLabels;
    if (!externalId || !label) {
      throw Object.assign(new Error("label and externalId are required"), {
        statusCode: 400,
      });
    }
    const pool = getPool();
    try {
      const res = await pool.query(
        `UPDATE stations
         SET external_id = $2,
             label = $3,
             display_url = $4,
             terminus_helpers_enabled = $5,
             terminus_helper_labels = $6,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          externalId,
          label,
          displayUrl,
          terminusHelpersEnabled,
          terminusHelperLabels,
        ],
      );
      return mapStation(res.rows[0]);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        throw Object.assign(new Error("Station externalId already exists"), {
          statusCode: 409,
        });
      }
      throw err;
    }
  }

  async deleteStation(id: string): Promise<void> {
    const pool = getPool();
    const used = await pool.query(
      `SELECT 1 FROM journeys
       WHERE origin_id = (SELECT external_id FROM stations WHERE id = $1)
          OR destination_id = (SELECT external_id FROM stations WHERE id = $1)
       LIMIT 1`,
      [id],
    );
    if ((used.rowCount ?? 0) > 0) {
      throw Object.assign(
        new Error("Station is used by a liaison and cannot be deleted"),
        { statusCode: 400 },
      );
    }
    const res = await pool.query(`DELETE FROM stations WHERE id = $1`, [id]);
    if ((res.rowCount ?? 0) === 0) {
      throw Object.assign(new Error("Station not found"), { statusCode: 404 });
    }
  }

  async enqueueNotifyJob(eventId: string, force = false): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO notify_jobs (event_id, status, force) VALUES ($1, 'pending', $2)`,
      [eventId, force],
    );
  }

  async claimNotifyJobs(
    limit = 20,
  ): Promise<Array<{ id: string; eventId: string; force: boolean }>> {
    const pool = getPool();
    const res = await pool.query(
      `UPDATE notify_jobs SET status = 'processing', attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM notify_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, event_id, force`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      eventId: String(r.event_id),
      force: Boolean(r.force),
    }));
  }

  async completeNotifyJob(id: string, ok: boolean, error?: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE notify_jobs
       SET status = $2, last_error = $3, processed_at = now()
       WHERE id = $1`,
      [id, ok ? "done" : "failed", error ?? null],
    );
  }

  async getEventById(id: string): Promise<DisruptionEventDto | null> {
    const pool = getPool();
    const res = await pool.query(
      `SELECT * FROM disruption_events WHERE id = $1`,
      [id],
    );
    if ((res.rowCount ?? 0) === 0) return null;
    return mapEvent(res.rows[0]);
  }
}

export const store = new PgStore();
