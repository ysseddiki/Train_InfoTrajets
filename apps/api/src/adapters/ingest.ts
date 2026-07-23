import type { JourneyConfig, JourneyDirection } from "@sncf-alerts/shared";
import {
  isWithinWatchWindow,
  matchesDestinationFilter,
} from "../domain/matching.js";
import { notifyForEvent } from "../domain/notify.js";
import { store } from "../domain/store.js";

export interface DisruptionIngestPort {
  poll(): Promise<void>;
}

/** Inject a synthetic disruption (admin debug). */
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
    // No auto events — use admin debug. Still touch last_ingest when a window is open.
    const journeys = await store.listJourneys();
    const anyOpen = journeys.some((j) => isWithinWatchWindow(j));
    if (anyOpen) {
      await store.setLastIngestAt(new Date().toISOString());
    }
  }
}

type NavitiaDeparture = {
  display_informations?: {
    direction?: string;
    headsign?: string;
    name?: string;
    label?: string;
  };
  stop_date_time?: {
    base_departure_date_time?: string;
    departure_date_time?: string;
    arrival_date_time?: string;
    base_arrival_date_time?: string;
  };
  route?: {
    direction?: { id?: string; name?: string };
  };
};

/** Interpret Navitia local datetime string (YYYYMMDDThhmmss). */
function navitiaLocalToDate(value?: string): Date | null {
  if (!value || value.length < 15) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15) || "00"}`;
  return new Date(iso);
}

function delayMinutesFromDeparture(dep: NavitiaDeparture): number | null {
  const base = dep.stop_date_time?.base_departure_date_time;
  const real = dep.stop_date_time?.departure_date_time;
  if (!base || !real) return null;
  if (base === real) return 0;
  const b = navitiaLocalToDate(base);
  const r = navitiaLocalToDate(real);
  if (!b || !r) return null;
  return Math.round((r.getTime() - b.getTime()) / 60_000);
}

function isCancelled(dep: NavitiaDeparture): boolean {
  const base = dep.stop_date_time?.base_departure_date_time;
  const real = dep.stop_date_time?.departure_date_time;
  // Heuristic: missing realtime departure while base exists, or headsign hints
  const dir = `${dep.display_informations?.direction ?? ""} ${dep.display_informations?.headsign ?? ""}`.toLowerCase();
  if (dir.includes("supprim") || dir.includes("cancel")) return true;
  if (base && !real) return true;
  return false;
}

export class NavitiaDeparturesAdapter implements DisruptionIngestPort {
  async poll(): Promise<void> {
    const token = process.env.NAVITIA_TOKEN;
    if (!token) {
      throw new Error("NAVITIA_TOKEN is required for INGEST_PROVIDER=navitia");
    }

    const journeys = await store.listJourneys();
    let didWork = false;

    for (const journey of journeys) {
      if (!isWithinWatchWindow(journey)) continue;
      didWork = true;
      await this.pollJourney(journey, token);
    }

    if (didWork) {
      await store.setLastIngestAt(new Date().toISOString());
    }
  }

  private async pollJourney(journey: JourneyConfig, token: string): Promise<void> {
    const stopId = encodeURIComponent(journey.originId);
    const url = `https://api.sncf.com/v1/coverage/sncf/stop_areas/${stopId}/departures?count=20&data_freshness=realtime`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Navitia departures HTTP ${res.status} for ${journey.direction}`);
    }

    const body = (await res.json()) as { departures?: NavitiaDeparture[] };
    const departures = body.departures ?? [];

    for (const dep of departures) {
      const directionText =
        dep.display_informations?.direction ??
        dep.route?.direction?.name ??
        dep.display_informations?.headsign ??
        "";
      const destId = dep.route?.direction?.id ?? null;

      if (!matchesDestinationFilter(journey, directionText, destId)) {
        continue;
      }

      const cancelled = isCancelled(dep);
      const delay = delayMinutesFromDeparture(dep) ?? 0;

      if (!cancelled && delay < journey.minDelayMinutes) {
        continue;
      }
      if (!cancelled && delay <= 0) {
        continue;
      }

      const base = dep.stop_date_time?.base_departure_date_time ?? "unknown";
      const externalEventId = `navitia-${journey.direction}-${journey.originId}-${base}-${directionText}`.slice(
        0,
        200,
      );

      const kind = cancelled ? "cancellation" : "delay";
      if (!journey.severities.includes(kind)) continue;

      const { event, created } = await store.upsertEvent({
        externalEventId,
        direction: journey.direction,
        kind,
        severity: cancelled || delay >= 20 ? "critical" : "warning",
        title: cancelled
          ? `Suppression — ${journey.originLabel} → ${directionText || journey.destinationLabel}`
          : `Retard ${delay} min — ${journey.originLabel} → ${directionText || journey.destinationLabel}`,
        description: `Départ gare ${journey.originLabel}, sens ${directionText || journey.destinationLabel}.`,
        delayMinutes: cancelled ? null : delay,
        startsAt: new Date().toISOString(),
        endsAt: null,
        source: "navitia",
      });

      if (created) {
        await notifyForEvent(event);
      }
    }
  }
}

export function createIngestAdapter(): DisruptionIngestPort {
  const provider = process.env.INGEST_PROVIDER ?? "stub";
  if (provider === "navitia") return new NavitiaDeparturesAdapter();
  return new StubIngestAdapter();
}
