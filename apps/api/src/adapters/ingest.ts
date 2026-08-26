import type { EventWeatherSnapshot, JourneyConfig, JourneyDirection } from "@sncf-alerts/shared";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";
import { delayReasonFromNavitia, delayReasonFromParts } from "../domain/delay-reason.js";
import { isWatchedDeparture, isWithinWatchWindow } from "../domain/matching.js";
import { buildNextDepartureStatus } from "../domain/next-departure.js";
import { notifyForEvent, processNotifyJobs } from "../domain/notify.js";
import { shouldNotifyDelayStep } from "../domain/notify-step.js";
import { store } from "../domain/store.js";
import { syntheticWeatherForStub } from "../domain/weather.js";
import {
  NavitiaDeparturesPort,
  findImpactedStopForDeparture,
  isNavitiaDepartureCancelled,
  navitiaDepartureMatchesFilter,
  parseNavitiaLocalDateTime,
  type NavitiaDeparture,
  type NavitiaDisruption,
} from "./departures-navitia.js";
// BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
import {
  coveredKeysFromDepartures,
  listOrphanCancellationsFromImpactedObjects,
  type OrphanCancellation,
} from "./navitia-orphan-cancellations.js";
import { parisYmd } from "../domain/paris-calendar.js";
// END FEATURE:navitia-orphan-cancellations-from-impacted-objects

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

  const weather = await weatherForJourney(journey, "stub");
  const trainNumber = `88${String(1000 + Math.floor(Math.random() * 9000))}`;
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
    trainNumber,
    delayMinutes: kind === "delay" ? delayMinutes : null,
    delayReason: null,
    delayReasonKey: null,
    ...weather,
    startsAt: now.toISOString(),
    endsAt: null,
    source: "stub",
  });

  await store.setIngestResult({
    status: "ok",
    detail: `Stub injecté (${direction})`,
  });

  appendIngestApiLog({
    source: "stub",
    title: `Injection debug — ${direction}`,
    ok: true,
    lines: [
      `created=${created}`,
      `externalEventId=${externalEventId}`,
      `journeyId=${journey?.id ?? "—"}`,
      `liaisonId=${journey?.liaisonId ?? "—"}`,
      `kind=${kind}`,
      `delayMinutes=${kind === "delay" ? delayMinutes : "—"}`,
      `title=${event.title}`,
      `description=${event.description}`,
    ],
  });

  // Pas de snapshot board stub — le prochain train vient uniquement de Navitia

  if (created) {
    await notifyForEvent(event);
    await processNotifyJobs();
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

      const stubWeather = await weatherForJourney(journey, "stub");
      const trainNumber = `88${String(1000 + Math.floor(Math.random() * 9000))}`;
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
        trainNumber,
        delayMinutes,
        delayReason: null,
        delayReasonKey: null,
        ...stubWeather,
        startsAt: iso,
        endsAt: null,
        source: "stub",
        detectedAt: iso,
      });
      if (wasCreated) created += 1;
    }
  }

  appendIngestApiLog({
    source: "stub",
    title: `Historique stub — ${months} mois`,
    ok: true,
    lines: [
      `created=${created}`,
      `months=${months}`,
      `liaisonId=${input?.liaisonId ?? "toutes"}`,
      `legs=${legs.length}`,
    ],
  });

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

    // Stub : événements synthétiques éventuels ailleurs ; pas de board « prochain train »
    await store.setIngestResult({
      status: "ok",
      detail: `Stub OK — ${open.length} sens (pas de snapshot board — provider démo)`,
    });
    appendIngestApiLog({
      source: "stub",
      title: "Poll stub",
      ok: true,
      lines: [
        `openJourneys=${open.length}`,
        ...open.map(
          (j) =>
            `${j.direction} · ${j.originLabel} → ${j.destinationLabel} · active=${j.active}`,
        ),
      ],
    });
  }
}

function delayMinutesFromDeparture(dep: NavitiaDeparture): number | null {
  const base = dep.stop_date_time?.base_departure_date_time;
  const real = dep.stop_date_time?.departure_date_time;
  if (!base || !real) return null;
  if (base === real) return 0;
  const b = parseNavitiaLocalDateTime(base);
  const r = parseNavitiaLocalDateTime(real);
  if (!b || !r) return null;
  return Math.round((r.getTime() - b.getTime()) / 60_000);
}

function extractTrainNumber(dep: NavitiaDeparture): string | null {
  const info = dep.display_informations;
  const candidates = [
    info?.trip_short_name,
    info?.headsign,
    info?.number,
    info?.name,
    info?.label,
  ];
  for (const c of candidates) {
    const t = String(c ?? "").trim();
    if (!t) continue;
    // Prefer token that looks like a train number (digits, optionally letter prefix)
    const m = t.match(/\b([A-Z]?\d{3,5})\b/i);
    if (m) return m[1].toUpperCase();
    if (/^\d{3,5}$/.test(t)) return t;
  }
  const head = String(info?.headsign ?? "").trim();
  return head || null;
}

function departureSortKey(dep: NavitiaDeparture): number {
  const real = parseNavitiaLocalDateTime(
    dep.stop_date_time?.departure_date_time,
  );
  const base = parseNavitiaLocalDateTime(
    dep.stop_date_time?.base_departure_date_time,
  );
  return (real ?? base)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

async function saveNextFromNavitia(
  token: string,
  journey: JourneyConfig,
  departures: NavitiaDeparture[],
  disruptions: NavitiaDisruption[],
  // BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
  orphanCancellations: OrphanCancellation[] = [],
  // END FEATURE:navitia-orphan-cancellations-from-impacted-objects
): Promise<void> {
  const now = new Date();
  type Candidate = {
    trainNumber: string | null;
    baseDate: Date | null;
    realDate: Date | null;
    cancelled: boolean;
    delay: number | null;
    sortBase: number;
    sortReal: number;
  };
  const matched: Candidate[] = [];
  for (const dep of departures) {
    if (!(await navitiaDepartureMatchesFilter(token, journey, dep))) {
      continue;
    }
    const cancelled = isNavitiaDepartureCancelled(
      dep,
      disruptions,
      journey.originId,
    );
    const baseDate = parseNavitiaLocalDateTime(
      dep.stop_date_time?.base_departure_date_time,
    );
    const realDate = parseNavitiaLocalDateTime(
      dep.stop_date_time?.departure_date_time,
    );
    if (!isWatchedDeparture(journey, baseDate, realDate, now, cancelled)) {
      continue;
    }
    matched.push({
      trainNumber: extractTrainNumber(dep),
      baseDate,
      realDate,
      cancelled,
      delay: delayMinutesFromDeparture(dep),
      sortBase: baseDate?.getTime() ?? departureSortKey(dep),
      sortReal: departureSortKey(dep),
    });
  }

  // BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
  for (const orphan of orphanCancellations) {
    if (
      !isWatchedDeparture(
        journey,
        orphan.scheduledAt,
        orphan.scheduledAt,
        now,
        true,
      )
    ) {
      continue;
    }
    matched.push({
      trainNumber: orphan.trainNumber,
      baseDate: orphan.scheduledAt,
      realDate: orphan.scheduledAt,
      cancelled: true,
      delay: null,
      sortBase: orphan.scheduledAt.getTime(),
      sortReal: orphan.scheduledAt.getTime(),
    });
  }
  // END FEATURE:navitia-orphan-cancellations-from-impacted-objects

  matched.sort((a, b) => {
    if (a.sortBase !== b.sortBase) return a.sortBase - b.sortBase;
    return a.sortReal - b.sortReal;
  });

  const next = matched[0] ?? null;
  if (!next) {
    await store.clearJourneyBoardSnapshot(journey.id);
    return;
  }

  const { status, statusLabel } = buildNextDepartureStatus({
    cancelled: next.cancelled,
    delayMinutes: next.delay,
  });
  const fetchedAt = new Date().toISOString();
  await store.upsertJourneyBoardSnapshot({
    journeyId: journey.id,
    trainNumber: next.trainNumber,
    scheduledAt: next.baseDate?.toISOString() ?? null,
    realtimeAt: next.realDate?.toISOString() ?? null,
    delayMinutes: next.cancelled ? null : next.delay,
    cancelled: next.cancelled,
    status,
    statusLabel,
    source: "navitia",
    fetchedAt,
  });
}

async function weatherForJourney(
  journey: JourneyConfig | null | undefined,
  source: string,
): Promise<EventWeatherSnapshot> {
  if (source === "stub" || !journey?.originId) {
    return syntheticWeatherForStub();
  }
  const snap = await store.getWeatherForOrigin(
    journey.originId,
    journey.originLabel,
  );
  if (!snap) {
    return {
      weatherBucket: null,
      weatherCode: null,
      weatherLabel: null,
      precipitationMm: null,
      windSpeedKmh: null,
      temperatureC: null,
    };
  }
  return {
    weatherBucket: snap.weatherBucket,
    weatherCode: snap.weatherCode,
    weatherLabel: snap.weatherLabel,
    precipitationMm: snap.precipitationMm,
    windSpeedKmh: snap.windSpeedKmh,
    temperatureC: snap.temperatureC,
  };
}

async function persistAlertAndMaybeNotify(input: {
  journey: JourneyConfig;
  event: Omit<
    Parameters<typeof store.upsertEvent>[0],
    keyof EventWeatherSnapshot
  >;
}): Promise<boolean> {
  const weather = await weatherForJourney(input.journey, input.event.source);
  const upserted = await store.upsertEvent({ ...input.event, ...weather });
  const notify = shouldNotifyDelayStep({
    created: upserted.created,
    notifyStepMinutes: input.journey.notifyStepMinutes,
    kind: input.event.kind,
    previousKind: upserted.previousKind,
    delayMinutes: input.event.delayMinutes,
    notifiedDelayMinutes: upserted.notifiedDelayMinutes,
    severity: input.event.severity,
    notifiedSeverity: upserted.notifiedSeverity,
  });
  if (notify) {
    await notifyForEvent(upserted.event, { force: !upserted.created });
    await store.markEventNotified(
      upserted.event.id,
      input.event.delayMinutes,
      input.event.severity,
    );
  }
  return upserted.created;
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

    // Pas de stop sur le compteur local (NAVITIA_DAILY_QUOTA) :
    // on continue jusqu’à l’erreur réelle renvoyée par l’API Navitia.

    const journeys = await store.listJourneys();
    const open = journeys.filter((j) => isWithinWatchWindow(j));
    if (open.length === 0) {
      await store.setIngestResult({
        status: "skipped",
        detail: "Hors fenêtre — 0 requête",
      });
      return;
    }

    let checked = 0;
    let alerts = 0;

    try {
      for (const journey of open) {
        const n = await this.pollJourneyNavitia(journey, token);
        checked += 1;
        alerts += n;
      }
      await processNotifyJobs();
      await store.setIngestResult({
        status: "ok",
        detail: `Navitia — ${checked} gare(s), ${alerts} alerte(s)`.slice(0, 500),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur ingest";
      await store.setIngestResult({
        status: "error",
        detail: message.slice(0, 400),
      });
      throw err;
    }
  }

  private async pollJourneyNavitia(
    journey: JourneyConfig,
    token: string,
  ): Promise<number> {
    const port = new NavitiaDeparturesPort(token);
    const { departures, disruptions } = await port.fetchDepartures(journey);

    // BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
    const orphanCancellations = listOrphanCancellationsFromImpactedObjects({
      disruptions,
      originStopId: journey.originId,
      coveredKeys: coveredKeysFromDepartures(departures),
      dayYmd: parisYmd(new Date()).replace(/-/g, ""),
    });
    // END FEATURE:navitia-orphan-cancellations-from-impacted-objects

    await saveNextFromNavitia(
      token,
      journey,
      departures,
      disruptions,
      // BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
      orphanCancellations,
      // END FEATURE:navitia-orphan-cancellations-from-impacted-objects
    );
    let createdCount = 0;

    for (const dep of departures) {
      if (!(await navitiaDepartureMatchesFilter(token, journey, dep))) {
        continue;
      }

      const directionText =
        dep.display_informations?.direction ??
        dep.route?.direction?.name ??
        dep.display_informations?.headsign ??
        "";

      const cancelled = isNavitiaDepartureCancelled(
        dep,
        disruptions,
        journey.originId,
      );
      const delay = delayMinutesFromDeparture(dep);
      const baseDate = parseNavitiaLocalDateTime(
        dep.stop_date_time?.base_departure_date_time,
      );
      const realDate = parseNavitiaLocalDateTime(
        dep.stop_date_time?.departure_date_time,
      );
      if (!isWatchedDeparture(journey, baseDate, realDate, new Date(), cancelled)) {
        continue;
      }

      const base = dep.stop_date_time?.base_departure_date_time ?? "unknown";
      const trainNumber = extractTrainNumber(dep);
      const { status } = buildNextDepartureStatus({
        cancelled,
        delayMinutes: delay,
      });

      // Observation train (à l’heure inclus) — pas de notif
      await store.upsertBoardTrainObservation({
        journeyId: journey.id,
        baseDepartureKey: `${base}-${directionText || "dest"}`,
        trainNumber,
        scheduledAt: baseDate?.toISOString() ?? null,
        status,
        delayMinutes: cancelled ? null : delay,
      });

      // Alertes uniquement retard ≥ seuil / suppression
      if (!cancelled) {
        if (delay === null) continue;
        if (delay < journey.minDelayMinutes) continue;
        if (delay <= 0) continue;
      }

      const externalEventId =
        `navitia-${journey.id}-${base}-${directionText}`.slice(0, 200);

      const kind = cancelled ? "cancellation" : "delay";
      if (!journey.severities.includes(kind)) continue;

      const delayLabel = delay == null ? "unknown" : `${delay} min`;
      const impacted = findImpactedStopForDeparture(
        dep,
        disruptions,
        journey.originId,
      );
      const reason = impacted?.cause?.trim()
        ? delayReasonFromParts({ cause: impacted.cause })
        : delayReasonFromNavitia(dep, disruptions);
      const created = await persistAlertAndMaybeNotify({
        journey,
        event: {
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
          trainNumber,
          delayMinutes: cancelled ? null : delay,
          delayReason: reason.delayReason,
          delayReasonKey: reason.delayReasonKey,
          startsAt: new Date().toISOString(),
          endsAt: null,
          source: "navitia",
        },
      });
      if (created) createdCount += 1;
    }

    // BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
    for (const orphan of orphanCancellations) {
      if (
        !isWatchedDeparture(
          journey,
          orphan.scheduledAt,
          orphan.scheduledAt,
          new Date(),
          true,
        )
      ) {
        continue;
      }
      if (!journey.severities.includes("cancellation")) continue;

      const directionText = journey.destinationLabel || "dest";
      const base = orphan.baseDepartureKey;
      await store.upsertBoardTrainObservation({
        journeyId: journey.id,
        baseDepartureKey: `${base}-${directionText}-orphan`,
        trainNumber: orphan.trainNumber,
        scheduledAt: orphan.scheduledAt.toISOString(),
        status: "cancelled",
        delayMinutes: null,
      });

      const reason = orphan.cause
        ? delayReasonFromParts({ cause: orphan.cause })
        : { delayReason: null, delayReasonKey: null };
      const created = await persistAlertAndMaybeNotify({
        journey,
        event: {
          externalEventId:
            `navitia-orphan-${journey.id}-${base}-${orphan.trainNumber}`.slice(
              0,
              200,
            ),
          journeyId: journey.id,
          liaisonId: journey.liaisonId,
          direction: journey.direction,
          kind: "cancellation",
          severity: "critical",
          title: `Suppression — ${journey.originLabel} → ${journey.destinationLabel}`,
          description: `Départ gare ${journey.originLabel} (hors board Navitia, via impacted_stops).`,
          trainNumber: orphan.trainNumber,
          delayMinutes: null,
          delayReason: reason.delayReason,
          delayReasonKey: reason.delayReasonKey,
          startsAt: new Date().toISOString(),
          endsAt: null,
          source: "navitia",
        },
      });
      if (created) createdCount += 1;
    }
    // END FEATURE:navitia-orphan-cancellations-from-impacted-objects

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
    await new StubIngestAdapter().poll();
  }
}

export function createIngestAdapter(): DisruptionIngestPort {
  return new ConfiguredIngestAdapter();
}
