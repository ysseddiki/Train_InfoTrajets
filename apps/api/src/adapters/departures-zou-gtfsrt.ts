import type { JourneyConfig } from "@sncf-alerts/shared";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { matchesDestinationFilter } from "../domain/matching.js";
import { matchesCorridorAllowlist } from "../domain/corridor.js";
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

async function fetchFeed(url: string): Promise<InstanceType<typeof FeedMessage>> {
  const res = await fetch(url, {
    headers: { Accept: "application/x-protobuf,*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GTFS-RT ZOU HTTP ${res.status} (${url.split("/").pop()})`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return FeedMessage.decode(buf);
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
  // Fallback: last stop name in the update
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
      // Sens du trajet : la destination doit être après l’origine
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

  const [index, feed] = await Promise.all([
    getZouStaticIndex(),
    fetchFeed(tripsUrl()),
  ]);

  const out: ZouRtDeparture[] = [];
  const nowSec = Math.floor(Date.now() / 1000);

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

    // Ignore departures already far in the past (> 2 h)
    if (realtimeEpoch != null && realtimeEpoch < nowSec - 2 * 3600) {
      continue;
    }

    out.push({
      tripId,
      trainNumber,
      directionText,
      scheduledEpoch,
      realtimeEpoch,
      delayMinutes: stopSkipped ? null : delayMinutesFromSeconds(delaySec),
      cancelled: stopSkipped,
    });
  }

  out.sort(
    (a, b) =>
      (a.realtimeEpoch ?? a.scheduledEpoch ?? Number.MAX_SAFE_INTEGER) -
      (b.realtimeEpoch ?? b.scheduledEpoch ?? Number.MAX_SAFE_INTEGER),
  );
  return out;
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
  const feed = await fetchFeed(saUrl());
  const hits: ZouServiceAlertHit[] = [];

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
  }

  return hits;
}

/** Probe léger : feed TripUpdates joignable. */
export async function probeZouGtfsRt(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const feed = await fetchFeed(tripsUrl());
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
