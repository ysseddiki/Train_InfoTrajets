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
  /** Filtre de sens : gare desservie (pas forcément le terminus) */
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
  /** Liaison ouverte par défaut sur le dashboard (une seule). */
  isDefault: boolean;
  outbound: JourneyConfig;
  inbound: JourneyConfig;
  updatedAt: string;
}

/** Entrée du sélecteur dashboard (liste légère). */
export interface LiaisonOption {
  id: string;
  displayName: string;
  isDefault: boolean;
}

export type DashboardScope = "liaison" | "all";

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

/** Statut du prochain départ affiché sur le board */
export type NextDepartureStatus =
  | "on_time"
  | "delayed"
  | "cancelled"
  | "unknown";

/** Prochain train valide (snapshot dernier poll) */
export interface NextDepartureInfo {
  trainNumber: string | null;
  /** HH:mm théorique (Europe/Paris) */
  scheduledTime: string | null;
  /** HH:mm temps réel si différent */
  realtimeTime: string | null;
  /** 0 = à l’heure ; null = unknown */
  delayMinutes: number | null;
  status: NextDepartureStatus;
  statusLabel: string;
  fetchedAt: string;
  source: "navitia" | "stub" | "zou";
}

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

/** Jour calendaire (Europe/Paris) pour heatmap retards */
export interface DashboardHeatmapDay {
  /** YYYY-MM-DD */
  date: string;
  /**
   * Score retards du jour (minutes de retard + pénalité suppressions).
   * Intensité heatmap vert → rouge.
   * Absence du jour dans `activityHeatmap` = aucune donnée (cellule grise).
   */
  count: number;
}

export interface LiaisonStatusCard {
  id: string;
  name: string;
  displayName: string;
  isDefault: boolean;
  outbound: JourneyStatusCard | null;
  inbound: JourneyStatusCard | null;
}

export interface DashboardOverview {
  /** Scope effectif de la réponse (stats + activité). */
  scope: DashboardScope;
  /** null si scope = all */
  selectedLiaisonId: string | null;
  /** Toutes les liaisons pour le sélecteur (indépendant du scope). */
  availableLiaisons: LiaisonOption[];
  /** Cartes status : 1 liaison si scoped, toutes si global. */
  liaisons: LiaisonStatusCard[];
  stats: {
    /** @deprecated préférer periods.last24h — conservé pour compat */
    eventsLast24h: number;
    deliveriesSentLast24h: number;
    deliveriesFailedLast24h: number;
    ingestProvider: string;
    /** Failover ZOU GTFS-RT actif (secours si Navitia KO) */
    zouFailoverEnabled?: boolean;
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
  /** Activité journalière (~53 semaines, TZ Paris) pour heatmap */
  activityHeatmap: DashboardHeatmapDay[];
}

export interface JourneyStatusCard {
  id: string;
  liaisonId: string;
  direction: JourneyDirection;
  label: string;
  active: boolean;
  originLabel: string;
  destinationLabel: string;
  /** URL fiche Gares & Connexions (catalogue) pour la gare surveillée */
  originDisplayUrl: string | null;
  /** URL fiche G&C pour la gare filtre (desservie) */
  destinationDisplayUrl: string | null;
  network: string;
  timeWindow: TimeWindow;
  daysOfWeek: number[];
  watchAlways: boolean;
  watchLeadHours: number;
  minDelayMinutes: number;
  /** Synthèse trafic pour le dashboard */
  boardStatus: BoardTrafficStatus;
  boardStatusLabel: string;
  /** Prochain départ valide (dernier poll) */
  nextDeparture: NextDepartureInfo | null;
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
  source: "stub" | "prim" | "navitia" | "zou";
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
  liaisonId: string | null;
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

/** Mise à jour SMTP (password write-only ; vide = conserver). */
export interface SmtpConfigUpdate {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  fromAddress?: string;
  /** Remplace le mot de passe si non vide */
  password?: string;
}

export interface TeamsConfigPublic {
  webhookConfigured: boolean;
  enabled: boolean;
}

export type IngestProviderId = "stub" | "navitia";

/** Slot public pour un provider (secret jamais en clair). */
export interface IngestProviderSlotPublic {
  id: IngestProviderId;
  requiresToken: boolean;
  tokenConfigured: boolean;
  /** 5 premiers caractères, ou null */
  tokenPreview: string | null;
  lastCheckOk: boolean | null;
  lastCheckAt: string | null;
  lastCheckDetail: string | null;
  /** Intervalle de poll pour ce provider (secondes). */
  pollIntervalSeconds: number;
}

/** Config ingest : stub | navitia + failover ZOU. */
export interface IngestConfigPublic {
  activeProvider: IngestProviderId;
  providers: Record<IngestProviderId, IngestProviderSlotPublic>;
  /**
   * Failover open data ZOU PACA (GTFS-RT) si Navitia KO / quota / token manquant.
   * Défaut : false.
   */
  zouFailoverEnabled: boolean;
}

export interface IngestConfigUpdate {
  /** Provider utilisé par le poll */
  activeProvider?: IngestProviderId;
  /** Remplace le token Navitia si non vide */
  navitiaToken?: string;
  /** Active / désactive le failover GTFS-RT ZOU */
  zouFailoverEnabled?: boolean;
  /** Intervalle poll stub (secondes) */
  stubPollIntervalSeconds?: number;
  /** Intervalle poll Navitia (secondes) */
  navitiaPollIntervalSeconds?: number;
}

/** Bornes poll ingest (secondes). */
export const INGEST_POLL_SECONDS_MIN = 60;
export const INGEST_POLL_SECONDS_MAX = 3600;
export const DEFAULT_INGEST_POLL_SECONDS = 300;

export function clampIngestPollSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INGEST_POLL_SECONDS;
  return Math.min(
    INGEST_POLL_SECONDS_MAX,
    Math.max(INGEST_POLL_SECONDS_MIN, Math.round(n)),
  );
}

export interface IngestProbeRequest {
  provider: IngestProviderId;
  /** Token/clé à tester (sinon secret stocké) */
  token?: string;
}

export interface IngestProbeResult {
  provider: IngestProviderId;
  ok: boolean;
  httpStatus: number | null;
  detail: string;
  checkedAt: string;
}

/** @deprecated prefer IngestConfigPublic.activeProvider */
export type IngestConfigUpdateLegacy = {
  provider: IngestProviderId;
  token?: string;
};

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

/** Gare catalogue (admin) — référencée par les liaisons via externalId Navitia. */
export interface Station {
  id: string;
  /** ID Navitia / stop_area (ex. stop_area:SNCF:87756056) */
  externalId: string;
  label: string;
  /**
   * URL page publique d’affichage (ex. Gares & Connexions).
   * null si non renseigné.
   */
  displayUrl: string | null;
  /**
   * Legacy catalogue — non utilisé par le matching Navitia ni failover ZOU
   * (éligibilité ZOU = paire UIC).
   */
  terminusHelpersEnabled: boolean;
  /**
   * Legacy — voir `terminusHelpersEnabled`.
   */
  terminusHelperLabels: string[];
  updatedAt: string;
}

export interface StationUpsertBody {
  externalId: string;
  label: string;
  /** URL affichage gare ; `""` ou omis → null */
  displayUrl?: string | null;
  terminusHelpersEnabled?: boolean;
  terminusHelperLabels?: string[];
}

/** Compteur journalier d’appels API externes (Navitia). */
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

export type IngestEventSource = "stub" | "navitia" | "zou" | "prim";

/** Source de log debug API ingest (onglets Admin → Debug). */
export type IngestApiLogSource = "stub" | "navitia" | "zou";

export interface IngestApiLogEntry {
  id: string;
  at: string;
  source: IngestApiLogSource;
  title: string;
  httpStatus: number | null;
  ok: boolean;
  /** Une ligne = un élément reçu (départ, trip update, alerte, …) */
  lines: string[];
}

export interface IngestApiLogsResponse {
  source: IngestApiLogSource | "all";
  entries: IngestApiLogEntry[];
}

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
  /** Feature flags ops (provider + workloads) */
  flags: {
    ingestInProcess: boolean;
    prometheusEnabled: boolean;
  };
}
