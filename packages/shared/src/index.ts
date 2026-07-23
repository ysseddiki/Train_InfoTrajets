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

export interface DashboardOverview {
  journeys: {
    outbound: JourneyStatusCard | null;
    inbound: JourneyStatusCard | null;
  };
  stats: {
    eventsLast24h: number;
    deliveriesSentLast24h: number;
    deliveriesFailedLast24h: number;
    ingestProvider: string;
    lastIngestAt: string | null;
  };
}

export interface JourneyStatusCard {
  direction: JourneyDirection;
  label: string;
  active: boolean;
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
  delayMinutes: number | null;
  startsAt: string;
  endsAt: string | null;
  source: "stub" | "prim" | "navitia";
  detectedAt: string;
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
