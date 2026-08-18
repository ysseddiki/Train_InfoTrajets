import {
  formatDelayMinutes,
  type DisruptionEventDto,
  type JourneyDirection,
} from "@sncf-alerts/shared";
import { emailNotifier, teamsNotifier } from "../adapters/notifiers.js";
import { resolveDirection } from "../domain/matching.js";
import { store } from "../domain/store.js";

/** Enfile une notif ; appeler `processNotifyJobs` pour envoyer. */
export async function notifyForEvent(
  event: DisruptionEventDto,
  opts?: { force?: boolean },
): Promise<void> {
  await store.enqueueNotifyJob(event.id, opts?.force === true);
  if (opts?.force) {
    await processNotifyJobs();
  }
}

/** Drain la file notify_jobs (SMTP / Teams). */
export async function processNotifyJobs(): Promise<number> {
  const jobs = await store.claimNotifyJobs(20);
  let done = 0;
  for (const job of jobs) {
    try {
      const event = await store.getEventById(job.eventId);
      if (!event) {
        await store.completeNotifyJob(job.id, false, "event missing");
        continue;
      }
      await deliverEvent(event, { force: job.force });
      await store.completeNotifyJob(job.id, true);
      done += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "notify failed";
      await store.completeNotifyJob(job.id, false, msg.slice(0, 400));
    }
  }
  return done;
}

async function deliverEvent(
  event: DisruptionEventDto,
  opts?: { force?: boolean },
): Promise<void> {
  const journeys = await store.listJourneys();
  const matched = resolveDirection(journeys, event);
  if (!matched && !opts?.force) {
    await store.createDelivery({
      eventId: event.id,
      liaisonId: event.liaisonId,
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
  const delayLine =
    event.kind === "delay"
      ? `Retard: ${formatDelayMinutes(event.delayMinutes, event.kind)}`
      : null;
  const reasonLine = event.delayReason ? `Motif: ${event.delayReason}` : null;
  const body = [
    event.description,
    delayLine,
    reasonLine,
    `Sévérité: ${event.severity}`,
    `Sens: ${direction ?? "n/a"}`,
    `Détecté: ${event.detectedAt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const recipients = await store.getRecipients();
  const smtp = await store.getSmtpRuntime();
  const teamsEnabled = process.env.TEAMS_ENABLED === "true";

  if (!(await store.hasSentDelivery(event.id, "email")) || opts?.force) {
    // Canal désactivé : ne pas tenter d’envoi ni écrire de livraison « suppressed »
    if (smtp.enabled) {
      const result = await emailNotifier.send({
        to: recipients.emails,
        subject: title,
        body,
      });
      await store.createDelivery({
        eventId: event.id,
        liaisonId: event.liaisonId,
        direction,
        channel: "email",
        status: result.ok ? "sent" : "failed",
        detail: result.detail ?? null,
        sentAt: result.ok ? new Date().toISOString() : null,
      });
    }
  }

  if (!(await store.hasSentDelivery(event.id, "teams")) || opts?.force) {
    if (teamsEnabled) {
      const result = await teamsNotifier.send({ title, body });
      await store.createDelivery({
        eventId: event.id,
        liaisonId: event.liaisonId,
        direction,
        channel: "teams",
        status: result.ok ? "sent" : "failed",
        detail: result.detail ?? null,
        sentAt: result.ok ? new Date().toISOString() : null,
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
      liaisonId: null,
      direction: null,
      channel: "email",
      status: result.ok ? "sent" : "failed",
      detail: result.detail ?? "test",
      sentAt: result.ok ? new Date().toISOString() : null,
    });
    return {
      status: result.ok ? "sent" : "failed",
      detail: result.detail ?? null,
    };
  }

  const result = await teamsNotifier.send({
    title: "[SNCF-Alerts] Test Teams",
    body: "Ceci est un test webhook Teams depuis SNCF-Alerts.",
  });
  await store.createDelivery({
    eventId: null,
    liaisonId: null,
    direction: null,
    channel: "teams",
    status: result.ok ? "sent" : "failed",
    detail: result.detail ?? "test",
    sentAt: result.ok ? new Date().toISOString() : null,
  });
  return {
    status: result.ok ? "sent" : "failed",
    detail: result.detail ?? null,
  };
}
