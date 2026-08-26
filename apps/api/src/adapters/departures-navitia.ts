import type { JourneyConfig } from "@sncf-alerts/shared";
import { departuresCache, TtlCache } from "../domain/departures-cache.js";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";
import { matchesDestinationFilterAsync } from "../domain/matching.js";
import { loggedNavitiaFetch } from "../domain/navitia-request-samples.js";
import type { DeparturesPort } from "../ports/departures.js";
import { store } from "../domain/store.js";

export type NavitiaDisruption = {
  id?: string;
  disruption_id?: string;
  cause?: string;
  category?: string;
  status?: string;
  severity?: {
    name?: string;
    effect?: string;
  };
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
    /** deleted | skipped | … (realtime) */
    departure_status?: string;
    arrival_status?: string;
    additional_informations?: string[];
    data_freshness?: string;
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

/**
 * Parse un datetime local Navitia (`YYYYMMDDThhmmss`) comme mur Europe/Paris → Instant UTC.
 * `new Date("…T16:47:00")` sans offset dépend du TZ process (UTC → affiche 18:47 Paris en été).
 */
export function parseNavitiaLocalDateTime(value?: string): Date | null {
  if (!value || value.length < 15) return null;
  const y = Number(value.slice(0, 4));
  const mo = Number(value.slice(4, 6));
  const d = Number(value.slice(6, 8));
  const h = Number(value.slice(9, 11));
  const mi = Number(value.slice(11, 13));
  const s = Number(value.slice(13, 15) || "00");
  if (![y, mo, d, h, mi, s].every((n) => Number.isFinite(n))) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
    return null;
  }

  let t = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(t));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const actual = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const wanted = Date.UTC(y, mo - 1, d, h, mi, s);
    const diff = wanted - actual;
    if (diff === 0) break;
    t += diff;
  }
  return new Date(t);
}

const CANCEL_EFFECTS = new Set(["NO_SERVICE", "DELETED_DEPARTURE"]);

function looksCancelledText(raw: string): boolean {
  return /supprim|cancel|annul|no[_\s-]?service|deleted/i.test(raw);
}

/**
 * Départ Navitia annulé / stop supprimé (board + alertes).
 * Signaux : departure_status, additional_informations, disruption NO_SERVICE, texte.
 */
export function isNavitiaDepartureCancelled(
  dep: NavitiaDeparture,
  disruptions: NavitiaDisruption[] = [],
): boolean {
  const sdt = dep.stop_date_time;
  const depStatus = String(sdt?.departure_status ?? "").toLowerCase();
  if (
    depStatus === "deleted" ||
    depStatus === "skipped" ||
    depStatus === "no_service"
  ) {
    return true;
  }
  for (const info of sdt?.additional_informations ?? []) {
    if (looksCancelledText(String(info))) return true;
  }

  const base = sdt?.base_departure_date_time;
  const real = sdt?.departure_date_time;
  if (base && !real) return true;

  const dir = [
    dep.display_informations?.direction,
    dep.display_informations?.headsign,
    dep.route?.direction?.name,
  ]
    .filter(Boolean)
    .join(" ");
  if (looksCancelledText(dir)) return true;

  const ids = new Set(
    (dep.links ?? [])
      .filter((l) => l.type === "disruption" && (l.id || l.href))
      .flatMap((l) => [String(l.id ?? ""), String(l.href ?? "")].filter(Boolean)),
  );
  if (ids.size === 0 || disruptions.length === 0) return false;

  for (const d of disruptions) {
    const dIds = [d.id, d.disruption_id].filter(Boolean).map(String);
    const match = dIds.some(
      (did) =>
        ids.has(did) ||
        [...ids].some((lid) => lid.endsWith(did) || did.endsWith(lid)),
    );
    if (!match) continue;
    const effect = String(d.severity?.effect ?? "").toUpperCase();
    if (CANCEL_EFFECTS.has(effect)) return true;
    const blob = [
      d.severity?.name,
      d.cause,
      d.category,
      d.status,
      ...(d.messages ?? []).map((m) => m.text),
    ]
      .filter(Boolean)
      .join(" ");
    if (looksCancelledText(blob)) return true;
  }
  return false;
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
    res = await loggedNavitiaFetch(
      url,
      {
        headers: { Authorization: navitiaAuthHeader(token) },
        signal: AbortSignal.timeout(12_000),
      },
      {
        kind: "vehicle_journey",
        situation: `Enrichissement parcours — matching destination (vj ${vehicleJourneyId})`,
      },
    );
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
      res = await loggedNavitiaFetch(
        url,
        {
          headers: {
            Authorization: navitiaAuthHeader(this.token),
          },
        },
        {
          kind: "departures",
          situation: `Poll board départs — ${journey.originLabel || journey.originId} [${journey.direction}]`,
        },
      );
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
