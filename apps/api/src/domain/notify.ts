import type { DisruptionEventDto, JourneyDirection } from "@sncf-alerts/shared";
import { emailNotifier, teamsNotifier } from "../adapters/notifiers.js";
import { resolveDirection } from "../domain/matching.js";
import { store } from "../domain/store.js";

export async function notifyForEvent(
  event: DisruptionEventDto,
  opts?: { force?: boolean },
): Promise<void> {
  const journeys = await store.listJourneys();
  const matched = resolveDirection(journeys, event);
  if (!matched && !opts?.force) {
    await store.createDelivery({
      eventId: event.id,
      direction: event.direction,
      channel: "email",
      status: "suppressed",
      detail: "No journey window matched",
    });
    return;
  }

  const direction: JourneyDirection | null =
    matched?.direction ?? event.direction ?? null;
  const title = `[SNCF-Alerts] ${matched?.label ?? "Alerte"} — ${event.title}`;
  const body = [
    event.description,
    event.delayMinutes != null ? `Retard: ${event.delayMinutes} min` : null,
    `Sévérité: ${event.severity}`,
    `Sens: ${direction ?? "n/a"}`,
    `Détecté: ${event.detectedAt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const recipients = await store.getRecipients();

  // Email
  if (!(await store.hasSentDelivery(event.id, "email")) || opts?.force) {
    if (process.env.EMAIL_ENABLED === "true") {
      const result = await emailNotifier.send({
        to: recipients.emails,
        subject: title,
        body,
      });
      await store.createDelivery({
        eventId: event.id,
        direction,
        channel: "email",
        status: result.ok ? "sent" : "failed",
        detail: result.detail ?? null,
        sentAt: result.ok ? new Date().toISOString() : null,
      });
    } else {
      await store.createDelivery({
        eventId: event.id,
        direction,
        channel: "email",
        status: "suppressed",
        detail: "EMAIL_ENABLED=false",
      });
    }
  }

  // Teams
  if (!(await store.hasSentDelivery(event.id, "teams")) || opts?.force) {
    if (process.env.TEAMS_ENABLED === "true") {
      const result = await teamsNotifier.send({ title, body });
      await store.createDelivery({
        eventId: event.id,
        direction,
        channel: "teams",
        status: result.ok ? "sent" : "failed",
        detail: result.detail ?? null,
        sentAt: result.ok ? new Date().toISOString() : null,
      });
    } else {
      await store.createDelivery({
        eventId: event.id,
        direction,
        channel: "teams",
        status: "suppressed",
        detail: "TEAMS_ENABLED=false",
      });
    }
  }
}

export async function sendTestNotification(
  channel: "email" | "teams",
): Promise<{ status: string; detail: string | null }> {
  if (channel === "email") {
    const recipients = await store.getRecipients();
    const result = await emailNotifier.send({
      to: recipients.emails,
      subject: "[SNCF-Alerts] Test email",
      body: "Ceci est un test d'envoi SMTP depuis SNCF-Alerts.",
    });
    await store.createDelivery({
      eventId: null,
      direction: null,
      channel: "email",
      status: result.ok ? "sent" : "failed",
      detail: result.detail ?? "test",
      sentAt: result.ok ? new Date().toISOString() : null,
    });
    return { status: result.ok ? "sent" : "failed", detail: result.detail ?? null };
  }

  const result = await teamsNotifier.send({
    title: "[SNCF-Alerts] Test Teams",
    body: "Ceci est un test webhook Teams depuis SNCF-Alerts.",
  });
  await store.createDelivery({
    eventId: null,
    direction: null,
    channel: "teams",
    status: result.ok ? "sent" : "failed",
    detail: result.detail ?? "test",
    sentAt: result.ok ? new Date().toISOString() : null,
  });
  return { status: result.ok ? "sent" : "failed", detail: result.detail ?? null };
}
