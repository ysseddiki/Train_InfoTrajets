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
  journeyId?: string;
  liaisonId?: string;
  delayMinutes?: number;
  kind?: "delay" | "cancellation";
}): Promise<void> {
  const journeys = await store.listJourneys();
  let journey =
    (input?.journeyId
      ? journeys.find((j) => j.id === input.journeyId)
      : undefined) ??
    (input?.liaisonId
      ? journeys.find(
          (j) =>
            j.liaisonId === input.liaisonId &&
            j.direction === (input.direction ?? "outbound"),
        )
      : undefined) ??
    journeys.find((j) => j.direction === (input?.direction ?? "outbound")) ??
    journeys[0];

  const direction = journey?.direction ?? input?.direction ?? "outbound";
  const delayMinutes = input?.delayMinutes ?? 15;
  const kind = input?.kind ?? "delay";
  const now = new Date();
  const externalEventId = `stub-${journey?.id ?? direction}-${now.toISOString()}`;

  const { event, created } = await store.upsertEvent({
    externalEventId,
    journeyId: journey?.id ?? null,
    liaisonId: journey?.liaisonId ?? null,
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

/**
 * Génère un historique stub sur N mois (heatmap / stats).
 * Pas de notifications — données démo uniquement.
 */
export async function seedStubHistory(input?: {
  months?: number;
  liaisonId?: string;
}): Promise<{ created: number; months: number }> {
  const months = Math.min(Math.max(input?.months ?? 6, 1), 12);
  const journeys = await store.listJourneys();
  const scoped = input?.liaisonId
    ? journeys.filter((j) => j.liaisonId === input.liaisonId)
    : journeys;
  const legs =
    scoped.length > 0
      ? scoped
      : journeys.length > 0
        ? journeys
        : [];

  if (legs.length === 0) {
    return { created: 0, months };
  }

  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const days = Math.round(months * 30.44);
  let created = 0;

  for (let d = days; d >= 0; d--) {
    const dayStart = new Date(now - d * dayMs);
    // Europe/Paris weekday approx via local — serveur en UTC OK pour démo
    const dow = dayStart.getUTCDay(); // 0=dim
    const isWeekend = dow === 0 || dow === 6;
    // densités : week-end plus calme
    const roll = Math.random();
    const eventCount = isWeekend
      ? roll < 0.55
        ? 0
        : roll < 0.85
          ? 1
          : 2
      : roll < 0.25
        ? 0
        : roll < 0.55
          ? 1
          : roll < 0.8
            ? 2
            : roll < 0.92
              ? 3
              : 4;

    for (let i = 0; i < eventCount; i++) {
      const journey = legs[Math.floor(Math.random() * legs.length)]!;
      const isCancel = Math.random() < 0.12;
      const delayMinutes = isCancel
        ? null
        : [5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 45][
            Math.floor(Math.random() * 12)
          ]!;
      const hour = 6 + Math.floor(Math.random() * 14);
      const minute = Math.floor(Math.random() * 60);
      const detected = new Date(dayStart);
      detected.setUTCHours(hour, minute, Math.floor(Math.random() * 60), 0);
      const iso = detected.toISOString();
      const dayKey = iso.slice(0, 10);
      const externalEventId = `stub-hist-${journey.id}-${dayKey}-${i}`;

      const { created: wasCreated } = await store.upsertEvent({
        externalEventId,
        journeyId: journey.id,
        liaisonId: journey.liaisonId,
        direction: journey.direction,
        kind: isCancel ? "cancellation" : "delay",
        severity:
          isCancel || (delayMinutes != null && delayMinutes >= 20)
            ? "critical"
            : "warning",
        title: isCancel
          ? `Suppression (stub hist) ${journey.direction}`
          : `Retard ${delayMinutes} min (stub hist) ${journey.direction}`,
        description: "Historique synthétique stub — 6 mois démo.",
        delayMinutes,
        startsAt: iso,
        endsAt: null,
        source: "stub",
        detectedAt: iso,
      });
      if (wasCreated) created += 1;
    }
  }

  await store.setIngestResult({
    status: "ok",
    detail: `Stub historique : ${created} événements sur ${months} mois`,
  });

  return { created, months };
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
  constructor(private readonly token: string) {}

  async poll(): Promise<void> {
    const token = this.token;
    if (!token) {
      await store.setIngestResult({
        status: "error",
        detail: "Token Navitia manquant (config admin)",
      });
      throw new Error("Navitia token is required");
    }

    const quota = await store.getApiQuota("navitia");
    if (quota.exhausted) {
      await store.setIngestResult({
        status: "skipped",
        detail: `Quota Navitia épuisé (${quota.used}/${quota.limit}) — jour ${quota.day}`,
      });
      return;
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
        const current = await store.getApiQuota("navitia");
        if (current.exhausted) {
          await store.setIngestResult({
            status: "ok",
            detail: `Quota atteint en cours de poll — ${checked} gare(s), ${alerts} alerte(s)`,
          });
          return;
        }
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

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
        },
      });
    } catch (err) {
      await store.recordApiRequest({ provider: "navitia", ok: false });
      throw err;
    }

    if (!res.ok) {
      await store.recordApiRequest({ provider: "navitia", ok: false });
      throw new Error(`Navitia HTTP ${res.status} (${journey.direction})`);
    }

    await store.recordApiRequest({ provider: "navitia", ok: true });

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

      if (!cancelled) {
        if (delay === null) continue;
        if (delay < journey.minDelayMinutes) continue;
        if (delay <= 0) continue;
      }

      const base = dep.stop_date_time?.base_departure_date_time ?? "unknown";
      const externalEventId =
        `navitia-${journey.id}-${base}-${directionText}`.slice(0, 200);

      const kind = cancelled ? "cancellation" : "delay";
      if (!journey.severities.includes(kind)) continue;

      const delayLabel =
        delay == null ? "unknown" : `${delay} min`;
      const { event, created } = await store.upsertEvent({
        externalEventId,
        journeyId: journey.id,
        liaisonId: journey.liaisonId,
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

export class ConfiguredIngestAdapter implements DisruptionIngestPort {
  async poll(): Promise<void> {
    const provider = await store.getIngestProvider();
    if (provider === "navitia") {
      const token = (await store.getIngestSecret("navitia")) ?? "";
      await new NavitiaDeparturesAdapter(token).poll();
      return;
    }
    if (provider === "prim") {
      await store.setIngestResult({
        status: "error",
        detail: "Provider PRIM non implémenté — choisir stub ou navitia",
      });
      return;
    }
    await new StubIngestAdapter().poll();
  }
}

export function createIngestAdapter(): DisruptionIngestPort {
  return new ConfiguredIngestAdapter();
}
