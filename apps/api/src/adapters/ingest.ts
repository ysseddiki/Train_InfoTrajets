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

  await store.setIngestResult({
    status: "ok",
    detail: `Stub injecté (${direction})`,
  });
  if (created) {
    await notifyForEvent(event);
  }
}

export class StubIngestAdapter implements DisruptionIngestPort {
  async poll(): Promise<void> {
    const journeys = await store.listJourneys();
    const open = journeys.filter((j) => isWithinWatchWindow(j));
    if (open.length === 0) {
      await store.setIngestResult({
        status: "skipped",
        detail: "Hors fenêtre — aucun appel (stub)",
      });
      return;
    }
    await store.setIngestResult({
      status: "ok",
      detail: `Stub OK — ${open.length} sens dans la fenêtre (pas d’appel externe)`,
    });
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
  };
  route?: {
    direction?: { id?: string; name?: string };
  };
};

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
  const dir = `${dep.display_informations?.direction ?? ""} ${dep.display_informations?.headsign ?? ""}`.toLowerCase();
  if (dir.includes("supprim") || dir.includes("cancel")) return true;
  if (base && !real) return true;
  return false;
}

export class NavitiaDeparturesAdapter implements DisruptionIngestPort {
  async poll(): Promise<void> {
    const token = process.env.NAVITIA_TOKEN;
    if (!token) {
      await store.setIngestResult({
        status: "error",
        detail: "NAVITIA_TOKEN manquant",
      });
      throw new Error("NAVITIA_TOKEN is required for INGEST_PROVIDER=navitia");
    }

    const journeys = await store.listJourneys();
    const open = journeys.filter((j) => isWithinWatchWindow(j));
    if (open.length === 0) {
      await store.setIngestResult({
        status: "skipped",
        detail: "Hors fenêtre — 0 requête Navitia",
      });
      return;
    }

    let checked = 0;
    let alerts = 0;
    try {
      for (const journey of open) {
        const n = await this.pollJourney(journey, token);
        checked += 1;
        alerts += n;
      }
      await store.setIngestResult({
        status: "ok",
        detail: `Navitia OK — ${checked} gare(s), ${alerts} alerte(s)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur Navitia";
      await store.setIngestResult({
        status: "error",
        detail: message.slice(0, 400),
      });
      throw err;
    }
  }

  private async pollJourney(
    journey: JourneyConfig,
    token: string,
  ): Promise<number> {
    const stopId = encodeURIComponent(journey.originId);
    const url = `https://api.sncf.com/v1/coverage/sncf/stop_areas/${stopId}/departures?count=20&data_freshness=realtime`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Navitia HTTP ${res.status} (${journey.direction})`);
    }

    const body = (await res.json()) as { departures?: NavitiaDeparture[] };
    const departures = body.departures ?? [];
    let createdCount = 0;

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
      const delay = delayMinutesFromDeparture(dep);

      // Sans horaires exploitables : pas d’assertion de retard depuis le board départs
      if (!cancelled) {
        if (delay === null) continue;
        if (delay < journey.minDelayMinutes) continue;
        if (delay <= 0) continue;
      }

      const base = dep.stop_date_time?.base_departure_date_time ?? "unknown";
      const externalEventId =
        `navitia-${journey.direction}-${journey.originId}-${base}-${directionText}`.slice(
          0,
          200,
        );

      const kind = cancelled ? "cancellation" : "delay";
      if (!journey.severities.includes(kind)) continue;

      const delayLabel =
        delay == null ? "unknown" : `${delay} min`;
      const { event, created } = await store.upsertEvent({
        externalEventId,
        direction: journey.direction,
        kind,
        severity:
          cancelled || (delay != null && delay >= 20) ? "critical" : "warning",
        title: cancelled
          ? `Suppression — ${journey.originLabel} → ${directionText || journey.destinationLabel}`
          : `Retard ${delayLabel} — ${journey.originLabel} → ${directionText || journey.destinationLabel}`,
        description: `Départ gare ${journey.originLabel}, sens ${directionText || journey.destinationLabel}.`,
        delayMinutes: cancelled ? null : delay,
        startsAt: new Date().toISOString(),
        endsAt: null,
        source: "navitia",
      });

      if (created) {
        createdCount += 1;
        await notifyForEvent(event);
      }
    }

    return createdCount;
  }
}

export function createIngestAdapter(): DisruptionIngestPort {
  const provider = process.env.INGEST_PROVIDER ?? "stub";
  if (provider === "navitia") return new NavitiaDeparturesAdapter();
  return new StubIngestAdapter();
}
