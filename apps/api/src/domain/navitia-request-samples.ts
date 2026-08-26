/**
 * Catalogue + échantillons bruts des requêtes Navitia (Admin → Debug).
 * Jamais de token / Authorization réel.
 */

export type NavitiaRequestKind =
  | "departures"
  | "vehicle_journey"
  | "probe";

export type NavitiaRequestCatalogEntry = {
  kind: NavitiaRequestKind;
  title: string;
  /** Quand / pourquoi cet appel est fait */
  situation: string;
  method: "GET";
  urlTemplate: string;
  headers: string[];
  notes: string[];
};

export type NavitiaRequestSample = {
  id: string;
  at: string;
  kind: NavitiaRequestKind;
  situation: string;
  method: string;
  url: string;
  /** Dump HTTP brut (auth masquée) */
  rawRequest: string;
  httpStatus: number | null;
  ok: boolean;
  durationMs: number | null;
};

const MAX_SAMPLES = 80;
const buffer: NavitiaRequestSample[] = [];
let seq = 0;

/** Doc debug : templates des appels Navitia utilisés par l’app. */
export const NAVITIA_REQUEST_CATALOG: NavitiaRequestCatalogEntry[] = [
  {
    kind: "departures",
    title: "Départs gare (board)",
    situation:
      "À chaque poll d’ingest Navitia, pour chaque sens (Aller/Retour) dont le cache départs a expiré (~90 s). Une requête par gare d’origine surveillée.",
    method: "GET",
    urlTemplate:
      "https://api.sncf.com/v1/coverage/sncf/stop_areas/{originId}/departures" +
      "?from_datetime={YYYYMMDDThhmmss}&duration=21600&count=40&data_freshness=realtime",
    headers: [
      "Authorization: Basic <base64(token + \":\")>",
      "Accept: application/json",
    ],
    notes: [
      "from_datetime = maintenant (Europe/Paris) − 1 h de lookback",
      "duration = 6 h de fenêtre après from_datetime",
      "Le token n’est jamais mis en query : uniquement header Basic",
    ],
  },
  {
    kind: "vehicle_journey",
    title: "Enrichissement vehicle_journey",
    situation:
      "Quand le headsign / direction du board ne suffit pas pour matcher la destination : on charge le parcours pour vérifier que la destination est desservie après l’origine.",
    method: "GET",
    urlTemplate:
      "https://api.sncf.com/v1/coverage/sncf/vehicle_journeys/{vehicleJourneyId}?depth=2",
    headers: [
      "Authorization: Basic <base64(token + \":\")>",
      "Accept: application/json",
    ],
    notes: [
      "Cache process par vehicle_journey id",
      "Utilisé pour le filtre OD (ex. Menton vs Nice sur un Menton→Nice)",
    ],
  },
  {
    kind: "probe",
    title: "Probe credential Admin",
    situation:
      "Lors d’un enregistrement / test de token Navitia depuis Admin → Ingest (vérifie que api.sncf.com accepte le secret).",
    method: "GET",
    urlTemplate: "https://api.sncf.com/v1/coverage/sncf",
    headers: [
      "Authorization: Basic <base64(token + \":\")>",
      "Accept: application/json",
    ],
    notes: ["Pas utilisé au poll régulier", "Timeout 12 s"],
  },
];

export function formatNavitiaRawRequest(
  url: string,
  method = "GET",
): string {
  try {
    const u = new URL(url);
    return [
      `${method.toUpperCase()} ${u.pathname}${u.search} HTTP/1.1`,
      `Host: ${u.host}`,
      "Authorization: Basic ***",
      "Accept: application/json",
      "",
      `# ${u.origin}${u.pathname}${u.search}`,
    ].join("\n");
  } catch {
    return `${method.toUpperCase()} ${url}\nAuthorization: Basic ***`;
  }
}

export function appendNavitiaRequestSample(input: {
  kind: NavitiaRequestKind;
  situation: string;
  method?: string;
  url: string;
  httpStatus?: number | null;
  ok: boolean;
  durationMs?: number | null;
}): NavitiaRequestSample {
  const method = (input.method ?? "GET").toUpperCase();
  const entry: NavitiaRequestSample = {
    id: `nav-${Date.now()}-${++seq}`,
    at: new Date().toISOString(),
    kind: input.kind,
    situation: input.situation.slice(0, 400),
    method,
    url: input.url.slice(0, 800),
    rawRequest: formatNavitiaRawRequest(input.url, method).slice(0, 1200),
    httpStatus: input.httpStatus ?? null,
    ok: input.ok,
    durationMs:
      input.durationMs == null || !Number.isFinite(input.durationMs)
        ? null
        : Math.round(input.durationMs),
  };
  buffer.unshift(entry);
  if (buffer.length > MAX_SAMPLES) {
    buffer.length = MAX_SAMPLES;
  }
  return entry;
}

export function listNavitiaRequestSamples(limit = 80): NavitiaRequestSample[] {
  const n = Math.min(Math.max(1, limit), MAX_SAMPLES);
  return buffer.slice(0, n);
}

export function clearNavitiaRequestSamples(): number {
  const n = buffer.length;
  buffer.length = 0;
  return n;
}

/** fetch Navitia + enregistrement d’un échantillon brut. */
export async function loggedNavitiaFetch(
  url: string,
  init: RequestInit | undefined,
  meta: {
    kind: NavitiaRequestKind;
    situation: string;
  },
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    appendNavitiaRequestSample({
      kind: meta.kind,
      situation: meta.situation,
      method,
      url,
      httpStatus: res.status,
      ok: res.ok,
      durationMs: Date.now() - started,
    });
    return res;
  } catch (err) {
    appendNavitiaRequestSample({
      kind: meta.kind,
      situation:
        meta.situation +
        (err instanceof Error ? ` — ${err.message.slice(0, 120)}` : ""),
      method,
      url,
      httpStatus: null,
      ok: false,
      durationMs: Date.now() - started,
    });
    throw err;
  }
}
