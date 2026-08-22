import type { JourneyConfig } from "@sncf-alerts/shared";
import { departuresCache, TtlCache } from "../domain/departures-cache.js";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";
import { matchesDestinationFilterAsync } from "../domain/matching.js";
import type { DeparturesPort } from "../ports/departures.js";
import { store } from "../domain/store.js";

export type NavitiaDisruption = {
  id?: string;
  disruption_id?: string;
  cause?: string;
  category?: string;
  messages?: Array<{ text?: string }>;
};

export type NavitiaDeparture = {
  display_informations?: {
    direction?: string;
    headsign?: string;
    trip_short_name?: string;
    name?: string;
    label?: string;
    number?: string;
    commercial_mode?: { name?: string };
  };
  route?: {
    direction?: { name?: string; id?: string };
  };
  stop_date_time?: {
    base_departure_date_time?: string;
    departure_date_time?: string;
  };
  stop_point?: { id?: string };
  links?: Array<{ type?: string; id?: string; href?: string }>;
};

/** Cache stop_area ids d’un vehicle_journey (enrichissement filtre). */
const vehicleJourneyStopsCache = new TtlCache<string[]>(
  Number(process.env.NAVITIA_VJ_CACHE_TTL_MS ?? 600_000),
);

function navitiaAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

/** Message d’erreur clair, surtout quota / rate-limit côté API SNCF. */
export function formatNavitiaHttpError(
  status: number,
  body: string,
  context?: string,
): string {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 180);
  const looksQuota =
    status === 429 ||
    status === 402 ||
    /quota|rate.?limit|trop de requ|too many|dépass/i.test(snippet);
  const ctx = context ? ` (${context})` : "";
  if (looksQuota) {
    return `Navitia quota dépassé — HTTP ${status}${ctx}${
      snippet ? ` — ${snippet}` : ""
    }`;
  }
  return `Navitia HTTP ${status}${ctx}${snippet ? ` — ${snippet}` : ""}`;
}

/** Lookback pour ne pas rater une base déjà passée (retard croissant). */
const NAVITIA_DEPARTURES_LOOKBACK_MS = 60 * 60_000;
/** Fenêtre demandée depuis from_datetime (1 h passé + ~5 h futur). */
const NAVITIA_DEPARTURES_DURATION_SEC = 6 * 3600;

/** Datetime Navitia `YYYYMMDDThhmmss` en Europe/Paris. */
export function formatNavitiaLocalDateTime(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}${g("month")}${g("day")}T${g("hour")}${g("minute")}${g("second")}`;
}

export function extractVehicleJourneyId(dep: NavitiaDeparture): string | null {
  for (const link of dep.links ?? []) {
    if (link.type === "vehicle_journey" && link.id) return link.id;
  }
  return null;
}

/**
 * Liste ordonnée des stop_area du parcours vehicle_journey (cache TTL).
 * L’ordre suit `stop_times` (1ʳᵉ occurrence conservée).
 */
export async function fetchVehicleJourneyStopAreaIds(
  token: string,
  vehicleJourneyId: string,
): Promise<string[]> {
  const cached = vehicleJourneyStopsCache.get(vehicleJourneyId);
  if (cached) return cached;

  const id = encodeURIComponent(vehicleJourneyId);
  const url = `https://api.sncf.com/v1/coverage/sncf/vehicle_journeys/${id}?depth=2`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: navitiaAuthHeader(token) },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    await store.recordApiRequest({ provider: "navitia", ok: false });
    return [];
  }

  if (!res.ok) {
    await store.recordApiRequest({ provider: "navitia", ok: false });
    return [];
  }

  await store.recordApiRequest({ provider: "navitia", ok: true });
  const body = (await res.json()) as {
    vehicle_journeys?: Array<{
      stop_times?: Array<{
        stop_point?: { stop_area?: { id?: string }; id?: string };
      }>;
    }>;
  };

  const list: string[] = [];
  const seen = new Set<string>();
  for (const vj of body.vehicle_journeys ?? []) {
    for (const st of vj.stop_times ?? []) {
      const areaId = st.stop_point?.stop_area?.id;
      if (!areaId || seen.has(areaId)) continue;
      seen.add(areaId);
      list.push(areaId);
    }
  }
  vehicleJourneyStopsCache.set(vehicleJourneyId, list);
  return list;
}

/**
 * True si le parcours dessert `destinationId` **après** `originId`
 * (évite Nice→Menton matché en « Monaco → Nice » parce que Nice est en amont).
 */
export function vehicleJourneyServesOd(
  stopAreaIds: string[],
  originId: string,
  destinationId: string,
): boolean {
  if (!originId || !destinationId || originId === destinationId) return false;
  const oi = stopAreaIds.indexOf(originId);
  if (oi < 0) return false;
  return stopAreaIds.indexOf(destinationId, oi + 1) > oi;
}

/**
 * Filtre gare desservie : texte / id / corridor, puis enrichissement
 * vehicle_journey (OD : filtre après l’origine sur le parcours).
 */
export async function navitiaDepartureMatchesFilter(
  token: string,
  journey: JourneyConfig,
  dep: NavitiaDeparture,
): Promise<boolean> {
  const directionText =
    dep.display_informations?.direction ??
    dep.route?.direction?.name ??
    dep.display_informations?.headsign ??
    "";
  const destId = dep.route?.direction?.id ?? null;

  if (await matchesDestinationFilterAsync(journey, directionText, destId)) {
    return true;
  }

  if (!journey.destinationId || !journey.originId) return false;

  const vjId = extractVehicleJourneyId(dep);
  if (!vjId) return false;

  const stops = await fetchVehicleJourneyStopAreaIds(token, vjId);
  return vehicleJourneyServesOd(
    stops,
    journey.originId,
    journey.destinationId,
  );
}

/**
 * Adapter Navitia derrière DeparturesPort + cache TTL process.
 */
export class NavitiaDeparturesPort implements DeparturesPort {
  constructor(private readonly token: string) {}

  async fetchDepartures(
    journey: JourneyConfig,
  ): Promise<{
    departures: NavitiaDeparture[];
    disruptions: NavitiaDisruption[];
  }> {
    const cacheKey = `dep:${journey.originId}`;
    const cached = departuresCache.get(cacheKey) as
      | { departures?: NavitiaDeparture[]; disruptions?: NavitiaDisruption[] }
      | undefined;
    if (cached) {
      const departures = cached.departures ?? [];
      const disruptions = cached.disruptions ?? [];
      appendIngestApiLog({
        source: "navitia",
        title: `Départs (cache) — ${journey.originLabel || journey.originId} [${journey.direction}]`,
        ok: true,
        lines: formatNavitiaDepartureLines(departures, journey),
      });
      return { departures, disruptions };
    }

    const stopId = encodeURIComponent(journey.originId);
    const fromDatetime = formatNavitiaLocalDateTime(
      new Date(Date.now() - NAVITIA_DEPARTURES_LOOKBACK_MS),
    );
    const url =
      `https://api.sncf.com/v1/coverage/sncf/stop_areas/${stopId}/departures` +
      `?from_datetime=${fromDatetime}&duration=${NAVITIA_DEPARTURES_DURATION_SEC}` +
      `&count=40&data_freshness=realtime`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: navitiaAuthHeader(this.token),
        },
      });
    } catch (err) {
      await store.recordApiRequest({ provider: "navitia", ok: false });
      appendIngestApiLog({
        source: "navitia",
        title: `Départs — ${journey.originLabel || journey.originId} [${journey.direction}]`,
        ok: false,
        lines: [
          `URL ${url.replace(/stop_areas\/[^/]+/, "stop_areas/…")}`,
          `Erreur réseau: ${err instanceof Error ? err.message : String(err)}`,
        ],
      });
      throw err;
    }

    if (!res.ok) {
      await store.recordApiRequest({ provider: "navitia", ok: false });
      const errBody = (await res.text().catch(() => "")).slice(0, 500);
      appendIngestApiLog({
        source: "navitia",
        title: `Départs — ${journey.originLabel || journey.originId} [${journey.direction}]`,
        httpStatus: res.status,
        ok: false,
        lines: [
          `HTTP ${res.status}`,
          errBody || "(corps vide)",
        ],
      });
      throw new Error(
        formatNavitiaHttpError(res.status, errBody, journey.direction),
      );
    }

    await store.recordApiRequest({ provider: "navitia", ok: true });
    const body = (await res.json()) as {
      departures?: NavitiaDeparture[];
      disruptions?: NavitiaDisruption[];
    };
    departuresCache.set(cacheKey, body);
    const departures = body.departures ?? [];
    const disruptions = body.disruptions ?? [];
    appendIngestApiLog({
      source: "navitia",
      title: `Départs — ${journey.originLabel || journey.originId} [${journey.direction}]`,
      httpStatus: res.status,
      ok: true,
      lines: formatNavitiaDepartureLines(departures, journey),
    });
    return { departures, disruptions };
  }
}

function formatNavitiaDepartureLines(
  departures: NavitiaDeparture[],
  journey: JourneyConfig,
): string[] {
  if (departures.length === 0) {
    return [
      `0 départ(s) — gare ${journey.originLabel || journey.originId}`,
    ];
  }
  return departures.map((dep, i) => {
    const info = dep.display_informations;
    const dir =
      info?.direction ??
      dep.route?.direction?.name ??
      info?.headsign ??
      "—";
    const train =
      info?.trip_short_name ??
      info?.headsign ??
      info?.number ??
      info?.name ??
      "—";
    const base = dep.stop_date_time?.base_departure_date_time ?? "—";
    const real = dep.stop_date_time?.departure_date_time ?? "—";
    const mode = info?.commercial_mode?.name ?? "";
    const destId = dep.route?.direction?.id ?? "";
    return [
      `#${i + 1}`,
      `train=${train}`,
      mode ? `mode=${mode}` : null,
      `dir=${dir}`,
      destId ? `destId=${destId}` : null,
      `base=${base}`,
      `real=${real}`,
    ]
      .filter(Boolean)
      .join(" · ");
  });
}
