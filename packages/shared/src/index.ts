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

export interface JourneyConfig {
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
  timeWindow: TimeWindow;
  minDelayMinutes: number;
  severities: DisruptionKind[];
  active: boolean;
  updatedAt: string;
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

export interface DashboardOverview {
  journeys: {
    outbound: JourneyStatusCard | null;
    inbound: JourneyStatusCard | null;
  };
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
  direction: JourneyDirection;
  label: string;
  active: boolean;
  originLabel: string;
  destinationLabel: string;
  network: string;
  timeWindow: TimeWindow;
  daysOfWeek: number[];
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

export interface RecipientsConfig {
  emails: string[];
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  ingestProvider: string;
}
