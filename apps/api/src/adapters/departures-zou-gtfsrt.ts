import type { JourneyConfig } from "@sncf-alerts/shared";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { matchesCorridorAllowlist } from "../domain/corridor.js";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";
import { matchesDestinationFilter } from "../domain/matching.js";
import {
  getZouStaticIndex,
  resolveTripMeta,
  stopNameForId,
  type ZouStaticIndex,
} from "./zou-gtfs-static.js";
import {
  extractUic,
  longToNumber,
  stopIdMatchesUic,
} from "./zou-ids.js";

const DEFAULT_TRIPS_URL =
  "https://proxy-data.zou.maregionsud.fr/GTFS-RT/GTFS-RT_trips_ZOU_express.pb";
const DEFAULT_SA_URL =
  "https://proxy-data.zou.maregionsud.fr/GTFS-RT/GTFS-RT_SA_ZOU_express.pb";

const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

/** GTFS-RT TripScheduleRelationship.CANCELED */
const TRIP_CANCELED = 3;
/** GTFS-RT StopTimeScheduleRelationship.SKIPPED */
const STOP_SKIPPED = 1;
/** Alert effect: NO_SERVICE */
const EFFECT_NO_SERVICE = 1;

const FEED_CACHE_TTL_MS = 45_000;

type CachedFeed = {
  at: number;
  feed: InstanceType<typeof FeedMessage>;
  httpStatus: number;
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

export type ZouServiceAlertHit = {
  alertId: string;
  header: string;
  description: string;
  kind: "delay" | "cancellation";
};

function tripsUrl(): string {
  return process.env.ZOU_GTFSRT_TRIPS_URL?.trim() || DEFAULT_TRIPS_URL;
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
  const lines: string[] = [`${entities.length} alerte(s)`];
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
    const routes = (alert.informedEntity ?? [])
      .map((e) => e.routeId)
      .filter(Boolean)
      .slice(0, 4);
    lines.push(
      [
        `#${++i}`,
        `id=${entity.id ?? "—"}`,
        `effect=${effect}`,
        `header=${header || "—"}`,
        description ? `desc=${description.slice(0, 240)}` : null,
        stops.length ? `stops=${stops.join(",")}` : null,
        routes.length ? `routes=${routes.join(",")}` : null,
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
  try {
    const { feed, httpStatus } = await fetchFeedRaw(tripsUrl());
    tripsFeedCache = { at: Date.now(), feed, httpStatus };
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT TripUpdates (feed brut)",
      httpStatus,
      ok: true,
      lines: formatTripUpdateLines(feed),
    });
    return tripsFeedCache;
  } catch (err) {
    const httpStatus =
      err && typeof err === "object" && "httpStatus" in err
        ? Number((err as { httpStatus: number }).httpStatus)
        : null;
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT TripUpdates (feed brut)",
      httpStatus,
      ok: false,
      lines: [err instanceof Error ? err.message : String(err)],
    });
    throw err;
  }
}

async function getSaFeed(): Promise<CachedFeed> {
  if (saFeedCache && Date.now() - saFeedCache.at < FEED_CACHE_TTL_MS) {
    return saFeedCache;
  }
  try {
    const { feed, httpStatus } = await fetchFeedRaw(saUrl());
    saFeedCache = { at: Date.now(), feed, httpStatus };
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT Service Alerts (feed brut)",
      httpStatus,
      ok: true,
      lines: formatServiceAlertLines(feed),
    });
    return saFeedCache;
  } catch (err) {
    const httpStatus =
      err && typeof err === "object" && "httpStatus" in err
        ? Number((err as { httpStatus: number }).httpStatus)
        : null;
    appendIngestApiLog({
      source: "zou",
      title: "GTFS-RT Service Alerts (feed brut)",
      httpStatus,
      ok: false,
      lines: [err instanceof Error ? err.message : String(err)],
    });
    throw err;
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

function tripServesDestination(
  journey: JourneyConfig,
  directionText: string,
  stopIds: string[],
  originUic: string,
  destUic: string | null,
): boolean {
  if (destUic) {
    const originIdx = stopIds.findIndex((id) => stopIdMatchesUic(id, originUic));
    const destIdx = stopIds.findIndex((id) => stopIdMatchesUic(id, destUic));
    if (originIdx >= 0 && destIdx >= 0) {
      return destIdx > originIdx;
    }
  }
  return matchesDestinationFilter(journey, directionText, null);
}

/**
 * Départs GTFS-RT pour un trajet (origine UIC + filtre destination / corridor).
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

  const [index, cached] = await Promise.all([
    getZouStaticIndex(),
    getTripsFeed(),
  ]);
  const feed = cached.feed;

  const out: ZouRtDeparture[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const matchLines: string[] = [];

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
    if (!originStu && !tripCanceled) continue;

    const directionText = directionTextForTrip(index, tripId, stopIds);
    if (
      !tripServesDestination(
        journey,
        directionText,
        stopIds,
        originUic,
        destUic,
      )
    ) {
      continue;
    }

    const meta = resolveTripMeta(index, tripId);
    const trainNumber =
      meta?.shortName ||
      (tripId.includes(":")
        ? (tripId.split(":")[1]?.split("@")[0] ?? null)
        : null);

    if (tripCanceled) {
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
        `MATCH trip=${tripId} train=${trainNumber ?? "—"} CANCELED dir=${directionText}`,
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

    if (realtimeEpoch != null && realtimeEpoch < nowSec - 2 * 3600) {
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
    title: `Match TripUpdates — ${journey.originLabel} → ${journey.destinationLabel} [${journey.direction}]`,
    ok: true,
    lines:
      matchLines.length > 0
        ? matchLines
        : [
            `0 match — UIC origine ${originUic}` +
              (destUic ? ` / dest ${destUic}` : ""),
          ],
  });

  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mot entier (évite « monte » ⊂ « monter »). */
function textHasToken(text: string, token: string): boolean {
  if (!token || token.length < 3) return false;
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(token)}([^\\p{L}\\p{N}]|$)`,
    "iu",
  );
  return re.test(text);
}

function matchesZouAlertText(journey: JourneyConfig, text: string): boolean {
  const blob = text.toLowerCase();
  const dest = journey.destinationLabel.toLowerCase().trim();
  if (dest && blob.includes(dest)) return true;

  const tokens = dest
    .split(/[\s\-–—,/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  if (tokens.some((t) => textHasToken(blob, t))) return true;

  return matchesCorridorAllowlist(journey, text);
}

/**
 * Service Alerts ZOU pertinentes pour le trajet (texte destination / corridor / stops).
 */
export async function fetchZouAlertsForJourney(
  journey: JourneyConfig,
): Promise<ZouServiceAlertHit[]> {
  const originUic = extractUic(journey.originId);
  const destUic = extractUic(journey.destinationId);
  const { feed } = await getSaFeed();
  const hits: ZouServiceAlertHit[] = [];
  const matchLines: string[] = [];

  for (const entity of feed.entity ?? []) {
    const alert = entity.alert;
    if (!alert) continue;
    const { header, description } = alertText(alert);
    const blob = `${header} ${description}`;
    const informedStops = (alert.informedEntity ?? [])
      .map((e) => String(e.stopId ?? ""))
      .filter(Boolean);

    const stopHit =
      (originUic != null &&
        informedStops.some((id) => stopIdMatchesUic(id, originUic))) ||
      (destUic != null &&
        informedStops.some((id) => stopIdMatchesUic(id, destUic)));

    const textHit = matchesZouAlertText(journey, blob);

    if (!stopHit && !textHit) continue;

    const effect = Number(alert.effect ?? 0);
    const kind: "delay" | "cancellation" =
      effect === EFFECT_NO_SERVICE ? "cancellation" : "delay";

    hits.push({
      alertId: String(entity.id ?? header).slice(0, 120),
      header: header || "Alerte ZOU",
      description: description.slice(0, 500),
      kind,
    });
    matchLines.push(
      `MATCH kind=${kind} · ${header || "—"} · ${description.slice(0, 200)}`,
    );
  }

  appendIngestApiLog({
    source: "zou",
    title: `Match Service Alerts — ${journey.originLabel} → ${journey.destinationLabel} [${journey.direction}]`,
    ok: true,
    lines:
      matchLines.length > 0
        ? matchLines
        : ["0 alerte matchée pour ce trajet"],
  });

  return hits;
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
