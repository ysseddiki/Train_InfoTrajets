/** Shared types — no secrets, safe for client + server */

export type JourneyDirection = "outbound" | "inbound";

export type DisruptionSeverity = "info" | "warning" | "critical";

export type DisruptionKind =
  | "delay"
  | "cancellation"
  | "platform_change"
  | "disruption";

export type DeliveryChannel = "email" | "teams";

export type DeliveryStatus = "queued" | "sent" | "failed" | "suppressed";

export interface TimeWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

/** Lead veille avant time_window.start (heures entières). */
export const WATCH_LEAD_HOURS_MIN = 0;
export const WATCH_LEAD_HOURS_MAX = 12;
export const DEFAULT_WATCH_LEAD_HOURS = 4;

export function clampWatchLeadHours(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_WATCH_LEAD_HOURS;
  return Math.min(
    WATCH_LEAD_HOURS_MAX,
    Math.max(WATCH_LEAD_HOURS_MIN, Math.round(n)),
  );
}

export interface JourneyConfig {
  id: string;
  liaisonId: string;
  direction: JourneyDirection;
  label: string;
  /** Gare surveillée (écran départs) */
  originId: string;
  originLabel: string;
  /** Filtre de sens : destination / direction affichée */
  destinationId: string;
  destinationLabel: string;
  network: string;
  daysOfWeek: number[]; // 1=Mon .. 7=Sun
  /** Fenêtre trajet (prise de train) */
  timeWindow: TimeWindow;
  /**
   * Veille continue sur les jours configurés (ignore les bornes horaires).
   * Si true, `watchLeadHours` est ignoré pour le calcul de veille.
   */
  watchAlways: boolean;
  /** Heures avant time_window.start pour démarrer la veille (0–12). */
  watchLeadHours: number;
  minDelayMinutes: number;
  severities: DisruptionKind[];
  active: boolean;
  updatedAt: string;
}

/** Nom auto si l’admin ne saisit pas de libellé custom. */
export function defaultLiaisonName(
  originLabel: string,
  destinationLabel: string,
): string {
  const a = originLabel.trim() || "Départ";
  const b = destinationLabel.trim() || "Arrivée";
  return `${a} <-> ${b}`;
}

export function resolveLiaisonDisplayName(
  customName: string | null | undefined,
  originLabel: string,
  destinationLabel: string,
): string {
  const custom = customName?.trim();
  if (custom) return custom;
  return defaultLiaisonName(originLabel, destinationLabel);
}

/** Paire Aller/Retour (une liaison TER surveillée). */
export interface LiaisonConfig {
  id: string;
  /** Libellé saisi ; vide → displayName auto « départ <-> arrivée » */
  name: string;
  displayName: string;
  outbound: JourneyConfig;
  inbound: JourneyConfig;
  updatedAt: string;
}

export interface LiaisonUpsertBody {
  name?: string;
  outbound: Partial<
    Omit<JourneyConfig, "id" | "liaisonId" | "direction" | "updatedAt">
  >;
  inbound: Partial<
    Omit<JourneyConfig, "id" | "liaisonId" | "direction" | "updatedAt">
  >;
}

export type BoardTrafficStatus =
  | "on_time"
  | "delayed"
  | "cancelled"
  | "no_data"
  | "paused"
  | "outside_window";

export type IngestRunStatus = "ok" | "error" | "skipped";

/** Agrégats sur une fenêtre glissante (UTC côté API, affichage Paris côté UI) */
export interface DashboardPeriodStats {
  events: number;
  delays: number;
  cancellations: number;
  otherKinds: number;
  avgDelayMinutes: number | null;
  maxDelayMinutes: number | null;
  deliveriesSent: number;
  deliveriesFailed: number;
  byDirection: {
    outbound: number;
    inbound: number;
    unmatched: number;
  };
}

export interface LiaisonStatusCard {
  id: string;
  name: string;
  displayName: string;
  outbound: JourneyStatusCard | null;
  inbound: JourneyStatusCard | null;
}

export interface DashboardOverview {
  /** Liaisons surveillées (Aller + Retour par liaison). */
  liaisons: LiaisonStatusCard[];
  stats: {
    /** @deprecated préférer periods.last24h — conservé pour compat */
    eventsLast24h: number;
    deliveriesSentLast24h: number;
    deliveriesFailedLast24h: number;
    ingestProvider: string;
    lastIngestAt: string | null;
    periods: {
      last24h: DashboardPeriodStats;
      last7d: DashboardPeriodStats;
      last30d: DashboardPeriodStats;
    };
  };
  /** Résumé de la dernière requête ingest (poll API / stub) */
  lastIngest: {
    at: string | null;
    status: IngestRunStatus | null;
    detail: string | null;
  };
  /** Derniers événements / livraisons pour le panneau activité */
  recentEvents: DisruptionEventDto[];
  recentDeliveries: AlertDeliveryDto[];
}

export interface JourneyStatusCard {
  id: string;
  liaisonId: string;
  direction: JourneyDirection;
  label: string;
  active: boolean;
  originLabel: string;
  destinationLabel: string;
  network: string;
  timeWindow: TimeWindow;
  daysOfWeek: number[];
  watchAlways: boolean;
  watchLeadHours: number;
  minDelayMinutes: number;
  /** Synthèse trafic pour le dashboard */
  boardStatus: BoardTrafficStatus;
  boardStatusLabel: string;
  latestEvent: {
    id: string;
    kind: DisruptionKind;
    severity: DisruptionSeverity;
    title: string;
    delayMinutes: number | null;
    detectedAt: string;
  } | null;
}

export interface DisruptionEventDto {
  id: string;
  externalEventId: string;
  journeyId: string | null;
  liaisonId: string | null;
  direction: JourneyDirection | null;
  kind: DisruptionKind;
  severity: DisruptionSeverity;
  title: string;
  description: string;
  /** null = durée unknown (jamais coercée en 0) */
  delayMinutes: number | null;
  startsAt: string;
  endsAt: string | null;
  source: "stub" | "prim" | "navitia";
  detectedAt: string;
}

/**
 * Libellé retard pour UI / notifs.
 * - durée connue → `"N min"`
 * - `kind = delay` (ou disruption) sans durée → `"unknown"`
 * - suppression / quai sans durée → `"—"` (N/A)
 */
export function formatDelayMinutes(
  delayMinutes: number | null | undefined,
  kind?: DisruptionKind,
): string {
  if (delayMinutes != null) return `${delayMinutes} min`;
  if (kind === "cancellation" || kind === "platform_change") return "—";
  return "unknown";
}

export interface AlertDeliveryDto {
  id: string;
  eventId: string | null;
  direction: JourneyDirection | null;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  detail: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface SmtpConfigPublic {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  passwordConfigured: boolean;
  enabled: boolean;
}

export interface TeamsConfigPublic {
  webhookConfigured: boolean;
  enabled: boolean;
}

export type IngestProviderId = "stub" | "navitia" | "prim";

/** Config ingest exposée à l’admin (secret jamais en clair). */
export interface IngestConfigPublic {
  provider: IngestProviderId;
  tokenConfigured: boolean;
  /** 5 premiers caractères du secret du provider courant, ou null */
  tokenPreview: string | null;
}

export interface IngestConfigUpdate {
  provider: IngestProviderId;
  /** Si non vide, remplace le secret ; omit / vide = conserver */
  token?: string;
}

/** Aperçu identification uniquement (jamais le secret complet). */
export function ingestTokenPreview(
  token: string | null | undefined,
): string | null {
  if (!token) return null;
  const t = token.trim();
  if (!t) return null;
  return t.slice(0, 5);
}


export interface RecipientsConfig {
  emails: string[];
}

/** Compteur journalier d’appels API externes (Navitia / PRIM). */
export interface ApiQuotaStatus {
  provider: string;
  /** Jour civil Europe/Paris (YYYY-MM-DD) */
  day: string;
  limit: number;
  success: number;
  failed: number;
  /** success + failed */
  used: number;
  remaining: number;
  /** 0–100 */
  percent: number;
  /** true si used >= limit */
  exhausted: boolean;
}

export type IngestEventSource = "stub" | "prim" | "navitia";

/** Sources décorrélées pour vider les stats dashboard (retards, etc.). */
export interface ClearStatsRequest {
  /** Supprime les événements ingest de ces sources (et livraisons liées). */
  eventSources?: IngestEventSource[];
  /** Supprime l’historique des livraisons email/Teams. */
  deliveries?: boolean;
}

export interface ClearStatsResult {
  deletedEvents: number;
  deletedDeliveries: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  ingestProvider: string;
}
