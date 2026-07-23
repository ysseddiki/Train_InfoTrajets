import type { JourneyDirection } from "@sncf-alerts/shared";
import { store } from "../domain/store.js";
import { notifyForEvent } from "../domain/notify.js";

export interface DisruptionIngestPort {
  poll(): Promise<void>;
}

/** Inject a synthetic disruption (admin debug / stub poll). */
export async function injectStubEvent(input?: {
  direction?: JourneyDirection;
  delayMinutes?: number;
  kind?: "delay" | "cancellation";
}): Promise<void> {
  const direction = input?.direction ?? "outbound";
  const delayMinutes = input?.delayMinutes ?? 15;
  const kind = input?.kind ?? "delay";
  const now = new Date();
  const externalEventId = `stub-${direction}-${now.toISOString()}`;

  const { event, created } = await store.upsertEvent({
    externalEventId,
    direction,
    kind,
    severity: delayMinutes >= 20 ? "critical" : "warning",
    title:
      kind === "cancellation"
        ? `Suppression (stub) ${direction}`
        : `Retard ${delayMinutes} min (stub) ${direction}`,
    description: "Événement synthétique généré par l'ingest stub / debug admin.",
    delayMinutes: kind === "delay" ? delayMinutes : null,
    startsAt: now.toISOString(),
    endsAt: null,
    source: "stub",
  });

  await store.setLastIngestAt(now.toISOString());
  if (created) {
    await notifyForEvent(event);
  }
}

export class StubIngestAdapter implements DisruptionIngestPort {
  async poll(): Promise<void> {
    // Passive stub: no automatic spam. Use admin debug endpoint to inject.
    await store.setLastIngestAt(new Date().toISOString());
  }
}

export function createIngestAdapter(): DisruptionIngestPort {
  const provider = process.env.INGEST_PROVIDER ?? "stub";
  if (provider === "stub") return new StubIngestAdapter();
  // PRIM / Navitia adapters: next iteration
  return new StubIngestAdapter();
}
