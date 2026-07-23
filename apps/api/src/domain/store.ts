import type {
  AlertDeliveryDto,
  DashboardOverview,
  DisruptionEventDto,
  JourneyConfig,
  JourneyDirection,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";

function emptyJourney(direction: JourneyDirection): JourneyConfig {
  const isOutbound = direction === "outbound";
  return {
    direction,
    label: isOutbound ? "Aller" : "Retour",
    originId: "",
    destinationId: "",
    originLabel: isOutbound ? "Origine" : "Destination",
    destinationLabel: isOutbound ? "Destination" : "Origine",
    network: "transilien",
    daysOfWeek: [1, 2, 3, 4, 5],
    timeWindow: isOutbound
      ? { start: "07:00", end: "09:30" }
      : { start: "17:00", end: "20:00" },
    minDelayMinutes: 10,
    severities: ["delay", "cancellation"],
    active: false,
    updatedAt: new Date(0).toISOString(),
  };
}

class MemoryStore {
  private journeys: Record<JourneyDirection, JourneyConfig> = {
    outbound: emptyJourney("outbound"),
    inbound: emptyJourney("inbound"),
  };
  private events: DisruptionEventDto[] = [];
  private deliveries: AlertDeliveryDto[] = [];
  private recipients: RecipientsConfig = { emails: [] };

  tryLogin(username: string, password: string): boolean {
    const expectedUser = process.env.ADMIN_USERNAME ?? "admin";
    const expectedPass = process.env.ADMIN_PASSWORD ?? "changeme";
    return username === expectedUser && password === expectedPass;
  }

  listJourneys(): JourneyConfig[] {
    return [this.journeys.outbound, this.journeys.inbound];
  }

  getJourney(direction: JourneyDirection): JourneyConfig | null {
    return this.journeys[direction] ?? null;
  }

  upsertJourney(
    direction: JourneyDirection,
    patch: Partial<JourneyConfig>,
  ): JourneyConfig {
    const current = this.journeys[direction];
    const next: JourneyConfig = {
      ...current,
      ...patch,
      direction,
      updatedAt: new Date().toISOString(),
    };
    this.journeys[direction] = next;
    return next;
  }

  listEvents(): DisruptionEventDto[] {
    return this.events;
  }

  listDeliveries(): AlertDeliveryDto[] {
    return this.deliveries;
  }

  getOverview(): DashboardOverview {
    const card = (direction: JourneyDirection) => {
      const j = this.journeys[direction];
      const latest =
        this.events.find((e) => e.direction === direction) ?? null;
      return {
        direction,
        label: j.label,
        active: j.active,
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
        eventsLast24h: this.events.length,
        deliveriesSentLast24h: this.deliveries.filter((d) => d.status === "sent")
          .length,
        deliveriesFailedLast24h: this.deliveries.filter(
          (d) => d.status === "failed",
        ).length,
        ingestProvider: process.env.INGEST_PROVIDER ?? "stub",
        lastIngestAt: null,
      },
    };
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

  getRecipients(): RecipientsConfig {
    return { emails: [...this.recipients.emails] };
  }

  setRecipients(config: RecipientsConfig): RecipientsConfig {
    this.recipients = {
      emails: [...new Set(config.emails.map((e) => e.trim().toLowerCase()))],
    };
    return this.getRecipients();
  }
}

export const memoryStore = new MemoryStore();
