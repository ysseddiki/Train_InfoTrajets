import type { JourneyConfig } from "@sncf-alerts/shared";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";
import { isWithinWatchWindow } from "../domain/matching.js";
import {
  getZouStaticIndex,
  resolveTripMeta,
  staticTripServesUicPair,
  stopNameForId,
  type ZouStaticIndex,
} from "./zou-gtfs-static.js";
import {
  extractUic,
  longToNumber,
  stopIdMatchesUic,
} from "./zou-ids.js";

const DEFAULT_TRIPS_URLS = [
  "https://proxy-data.zou.maregionsud.fr/GTFS-RT/GTFS-RT_trips_ZOU_express.pb",
];
const DEFAULT_SA_URL =
  "https://proxy-data.zou.maregionsud.fr/GTFS-RT/GTFS-RT_SA_ZOU_express.pb";

const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

/** GTFS-RT TripScheduleRelationship.CANCELED */
const TRIP_CANCELED = 3;
/** GTFS-RT StopTimeScheduleRelationship.SKIPPED */
const STOP_SKIPPED = 1;

/** Ignore RT points older than this (stale feed). */
const STALE_PAST_SEC = 2 * 3600;
/** Include dep slightly outside watch if still live while we poll. */
const LIVE_SLACK_PAST_MS = 2 * 3600_000;
const LIVE_SLACK_FUTURE_MS = 6 * 3600_000;

const FEED_CACHE_TTL_MS = 45_000;

type CachedFeed = {
  at: number;
  feed: InstanceType<typeof FeedMessage>;
  httpStatus: number;
  sources: string[];
};

let tripsFeedCache: CachedFeed | null = null;
let saFeedCache: CachedFeed | null = null;

export type ZouRtDeparture = {
  tripId: string;
  trainNumber: string | null;
  directionText: string;
  /** Epoch seconds scheduled (time − delay) if known */
  scheduledEpoch: number | null;
  realtimeEpoch: number | null;
  delayMinutes: number | null;
  cancelled: boolean;
};

function tripsUrls(): string[] {
  const multi = process.env.ZOU_GTFSRT_TRIPS_URLS?.trim();
  if (multi) {
    return multi
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
  }
  const single = process.env.ZOU_GTFSRT_TRIPS_URL?.trim();
  if (single) return [single];
  return [...DEFAULT_TRIPS_URLS];
}

function saUrl(): string {
  return process.env.ZOU_GTFSRT_SA_URL?.trim() || DEFAULT_SA_URL;
}

async function fetchFeedRaw(
  url: string,
): Promise<{ feed: InstanceType<typeof FeedMessage>; httpStatus: number }> {
  const res = await fetch(url, {
    headers: { Accept: "application/x-protobuf,*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw Object.assign(
      new Error(`GTFS-RT ZOU HTTP ${res.status} (${url.split("/").pop()})`),
      { httpStatus: res.status },
    );
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { feed: FeedMessage.decode(buf), httpStatus: res.status };
}

function alertText(alert: {
  headerText?: { translation?: Array<{ text?: string | null }> | null } | null;
  descriptionText?: {
    translation?: Array<{ text?: string | null }> | null;
  } | null;
}): { header: string; description: string } {
  const header =
    alert.headerText?.translation?.map((t) => t.text ?? "").join(" ").trim() ??
    "";
  const description =
    alert.descriptionText?.translation
      ?.map((t) => t.text ?? "")
      .join(" ")
      .trim() ?? "";
  return { header, description };
}

function formatTripUpdateLines(
  feed: InstanceType<typeof FeedMessage>,
): string[] {
  const entities = feed.entity ?? [];
  if (entities.length === 0) return ["0 entité TripUpdate"];
  const lines: string[] = [
    `header.timestamp=${feed.header?.timestamp ?? "—"} · ${entities.length} entité(s)`,
  ];
  let i = 0;
  for (const entity of entities) {
    const tu = entity.tripUpdate;
    if (!tu) {
      lines.push(`#${++i} id=${entity.id ?? "?"} (pas de tripUpdate)`);
      continue;
    }
    const tripId = tu.trip?.tripId ?? "—";
    const startDate = tu.trip?.startDate ?? "";
    const canceled =
      tu.trip?.scheduleRelationship === TRIP_CANCELED ||
      String(tu.trip?.scheduleRelationship ?? "") === "CANCELED";
    const stops = (tu.stopTimeUpdate ?? []).map((s) => {
      const delay =
        longToNumber(s.departure?.delay) ?? longToNumber(s.arrival?.delay);
      const time =
        longToNumber(s.departure?.time) ?? longToNumber(s.arrival?.time);
      return `${s.stopId ?? "?"}[d=${delay ?? "—"}s t=${time ?? "—"}]`;
    });
    lines.push(
      [
        `#${++i}`,
        `trip=${tripId}`,
        startDate ? `date=${startDate}` : null,
        canceled ? "CANCELED" : null,
        `stops=${stops.join(" → ") || "—"}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  return lines;
}

function formatServiceAlertLines(
  feed: InstanceType<typeof FeedMessage>,
): string[] {
  const entities = feed.entity ?? [];
  if (entities.length === 0) return ["0 Service Alert"];
  const lines: string[] = [
    `${entities.length} alerte(s) — debug only (pas d’événements retard)`,
  ];
  let i = 0;
  for (const entity of entities) {
    const alert = entity.alert;
    if (!alert) {
      lines.push(`#${++i} id=${entity.id ?? "?"} (pas d’alert)`);
      continue;
    }
    const { header, description } = alertText(alert);
    const effect = alert.effect ?? "—";
    const stops = (alert.informedEntity ?? [])
      .map((e) => e.stopId)
      .filter(Boolean)
      .slice(0, 8);
    lines.push(
      [
        `#${++i}`,
        `id=${entity.id ?? "—"}`,
        `effect=${effect}`,
        `header=${header || "—"}`,
        description ? `desc=${description.slice(0, 240)}` : null,
        stops.length ? `stops=${stops.join(",")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }
  return lines;
}

async function getTripsFeed(): Promise<CachedFeed> {
  if (
    tripsFeedCache &&
    Date.now() - tripsFeedCache.at < FEED_CACHE_TTL_MS
  ) {
    return tripsFeedCache;
  }
  const urls = tripsUrls();
  const entities: InstanceType<typeof FeedMessage>["entity"] = [];
  const sources: string[] = [];
  let lastStatus = 200;
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const { feed, httpStatus } = await fetchFeedRaw(url);
      lastStatus = httpStatus;
      sources.push(url.split("/").pop() ?? url);
      for (const e of feed.entity ?? []) {
        entities.push(e);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (entities.length === 0 && errors.length > 0) {
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT TripUpdates (feed brut)",
      httpStatus: null,
      ok: false,
      lines: errors,
    });
    throw new Error(errors[0] ?? "Aucun feed TripUpdates ZOU");
  }

  const feed = {
    header: { gtfsRealtimeVersion: "2.0", timestamp: Date.now() / 1000 },
    entity: entities,
  } as InstanceType<typeof FeedMessage>;
  tripsFeedCache = {
    at: Date.now(),
    feed,
    httpStatus: lastStatus,
    sources,
  };
  appendIngestApiLog({
    source: "zou",
    title: "GTFS-RT TripUpdates (feed brut)",
    httpStatus: lastStatus,
    ok: true,
    lines: [
      `sources=${sources.join(" + ") || "—"}`,
      ...formatTripUpdateLines(feed),
      ...(errors.length ? [`partial errors: ${errors.join(" | ")}`] : []),
    ],
  });
  return tripsFeedCache;
}

/** Charge le feed SA pour logs debug uniquement (aucun événement métier). */
async function logSaFeedForDebug(): Promise<void> {
  try {
    if (saFeedCache && Date.now() - saFeedCache.at < FEED_CACHE_TTL_MS) {
      return;
    }
    const { feed, httpStatus } = await fetchFeedRaw(saUrl());
    saFeedCache = {
      at: Date.now(),
      feed,
      httpStatus,
      sources: [saUrl().split("/").pop() ?? "sa"],
    };
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT Service Alerts (debug, ignoré pour retards)",
      httpStatus,
      ok: true,
      lines: formatServiceAlertLines(feed),
    });
  } catch (err) {
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT Service Alerts (debug, ignoré pour retards)",
      httpStatus: null,
      ok: false,
      lines: [err instanceof Error ? err.message : String(err)],
    });
  }
}

function delayMinutesFromSeconds(sec: number | null | undefined): number | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  return Math.round(sec / 60);
}

function directionTextForTrip(
  index: ZouStaticIndex,
  tripId: string,
  stopIds: string[],
): string {
  const meta = resolveTripMeta(index, tripId);
  if (meta?.headsign) return meta.headsign;
  for (let i = stopIds.length - 1; i >= 0; i--) {
    const name = stopNameForId(index, stopIds[i]!);
    if (name) return name;
  }
  return "";
}

/**
 * Éligibilité ZOU : le trip dessert dest UIC **après** origin UIC.
 * RT d’abord ; sinon parcours GTFS static. Pas de headsign / terminus / corridor.
 */
export function tripServesUicOd(
  index: ZouStaticIndex,
  tripId: string,
  stopIds: string[],
  originUic: string,
  destUic: string,
): boolean {
  const originIdx = stopIds.findIndex((id) => stopIdMatchesUic(id, originUic));
  const destIdx = stopIds.findIndex((id) => stopIdMatchesUic(id, destUic));
  if (originIdx >= 0 && destIdx > originIdx) return true;
  return staticTripServesUicPair(index, tripId, originUic, destUic);
}

/**
 * Départ dans la tranche de veille, ou encore « live » pendant un poll en veille.
 */
export function isZouDepartureInSurveillanceWindow(
  journey: JourneyConfig,
  epochSec: number | null,
  now = new Date(),
): boolean {
  if (epochSec == null) {
    return isWithinWatchWindow(journey, now);
  }
  const at = new Date(epochSec * 1000);
  if (isWithinWatchWindow(journey, at)) return true;
  if (!isWithinWatchWindow(journey, now)) return false;
  const ageMs = now.getTime() - at.getTime();
  return ageMs >= -LIVE_SLACK_FUTURE_MS && ageMs <= LIVE_SLACK_PAST_MS;
}

/**
 * Départs GTFS-RT pour un trajet : UIC origine → UIC destination, TripUpdates only.
 * Retourne **tous** les trips éligibles dans la fenêtre de surveillance (triés).
 */
export async function fetchZouDeparturesForJourney(
  journey: JourneyConfig,
): Promise<ZouRtDeparture[]> {
  const originUic = extractUic(journey.originId);
  const destUic = extractUic(journey.destinationId);
  if (!originUic) {
    throw new Error(
      `UIC origine introuvable pour ${journey.originId || journey.originLabel}`,
    );
  }
  if (!destUic) {
    throw new Error(
      `UIC destination introuvable pour ${journey.destinationId || journey.destinationLabel}`,
    );
  }

  const [index, cached] = await Promise.all([
    getZouStaticIndex(),
    getTripsFeed(),
  ]);
  // SA : log debug only, never drives delay events
  void logSaFeedForDebug();

  const feed = cached.feed;
  const out: ZouRtDeparture[] = [];
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const matchLines: string[] = [];
  let skippedOd = 0;
  let skippedWindow = 0;

  for (const entity of feed.entity ?? []) {
    const tu = entity.tripUpdate;
    if (!tu) continue;
    const tripId = tu.trip?.tripId?.trim() ?? "";
    if (!tripId) continue;

    const tripCanceled =
      tu.trip?.scheduleRelationship === TRIP_CANCELED ||
      String(tu.trip?.scheduleRelationship ?? "") === "CANCELED";

    const stops = tu.stopTimeUpdate ?? [];
    const stopIds = stops
      .map((s) => String(s.stopId ?? ""))
      .filter(Boolean);

    const originStu = stops.find((s) =>
      stopIdMatchesUic(String(s.stopId ?? ""), originUic),
    );
    // Cancelled trips may omit stop updates — OD via static only
    if (!originStu && !tripCanceled) continue;
    if (
      !tripServesUicOd(index, tripId, stopIds, originUic, destUic)
    ) {
      skippedOd += 1;
      continue;
    }

    const directionText = directionTextForTrip(index, tripId, stopIds);
    const meta = resolveTripMeta(index, tripId);
    const trainNumber =
      meta?.shortName ||
      (tripId.includes(":")
        ? (tripId.split(":")[1]?.split("@")[0] ?? null)
        : null);

    if (tripCanceled) {
      if (!isZouDepartureInSurveillanceWindow(journey, null, now)) {
        skippedWindow += 1;
        continue;
      }
      out.push({
        tripId,
        trainNumber,
        directionText,
        scheduledEpoch: null,
        realtimeEpoch: null,
        delayMinutes: null,
        cancelled: true,
      });
      matchLines.push(
        `MATCH trip=${tripId} train=${trainNumber ?? "—"} CANCELED dir=${directionText || "—"}`,
      );
      continue;
    }

    const stopSkipped =
      originStu!.scheduleRelationship === STOP_SKIPPED ||
      String(originStu!.scheduleRelationship ?? "") === "SKIPPED";

    const depDelaySec = longToNumber(originStu!.departure?.delay);
    const arrDelaySec = longToNumber(originStu!.arrival?.delay);
    const delaySec = depDelaySec ?? arrDelaySec;
    const realtimeEpoch =
      longToNumber(originStu!.departure?.time) ??
      longToNumber(originStu!.arrival?.time);
    const scheduledEpoch =
      realtimeEpoch != null && delaySec != null
        ? realtimeEpoch - delaySec
        : realtimeEpoch;

    if (realtimeEpoch != null && realtimeEpoch < nowSec - STALE_PAST_SEC) {
      skippedWindow += 1;
      continue;
    }

    const epochForWindow = realtimeEpoch ?? scheduledEpoch;
    if (!isZouDepartureInSurveillanceWindow(journey, epochForWindow, now)) {
      skippedWindow += 1;
      continue;
    }

    const delayMinutes = stopSkipped
      ? null
      : delayMinutesFromSeconds(delaySec);
    out.push({
      tripId,
      trainNumber,
      directionText,
      scheduledEpoch,
      realtimeEpoch,
      delayMinutes,
      cancelled: stopSkipped,
    });
    matchLines.push(
      [
        `MATCH trip=${tripId}`,
        `train=${trainNumber ?? "—"}`,
        `dir=${directionText || "—"}`,
        stopSkipped ? "SKIPPED" : null,
        `delayMin=${delayMinutes ?? "—"}`,
        `realEpoch=${realtimeEpoch ?? "—"}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  out.sort(
    (a, b) =>
      (a.realtimeEpoch ?? a.scheduledEpoch ?? Number.MAX_SAFE_INTEGER) -
      (b.realtimeEpoch ?? b.scheduledEpoch ?? Number.MAX_SAFE_INTEGER),
  );

  appendIngestApiLog({
    source: "zou",
    title: `Match TripUpdates UIC — ${journey.originLabel} → ${journey.destinationLabel} [${journey.direction}]`,
    ok: true,
    lines: [
      `UIC ${originUic} → ${destUic} · ${out.length} éligible(s) · skip OD=${skippedOd} fenêtre=${skippedWindow}`,
      ...(matchLines.length > 0
        ? matchLines
        : ["0 trip OD dans la fenêtre de veille"]),
    ],
  });

  return out;
}

/** Probe léger : feed TripUpdates joignable. */
export async function probeZouGtfsRt(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const { feed } = await getTripsFeed();
    const n = feed.entity?.length ?? 0;
    return {
      ok: true,
      detail: `GTFS-RT TripUpdates OK (${n} entités)`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Erreur GTFS-RT ZOU",
    };
  }
}
