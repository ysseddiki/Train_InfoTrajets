import type { JourneyConfig } from "@sncf-alerts/shared";
import { store } from "../domain/store.js";

/**
 * TEMP / rollbackable — failover scrape Gares & Connexions.
 *
 * Utilise l’UIC dérivé de `originId` (+ `display_url` catalogue stations).
 * Endpoint public observé : `/fr/train-times/{uic}/departure`
 * Note : le site peut renvoyer un captcha Datadome (403) depuis certains IP.
 */

export type GcBoardDeparture = {
  directionText: string;
  delayMinutes: number | null;
  cancelled: boolean;
  /** Retard signalé sans durée exploitable */
  delayedUnknown: boolean;
  /** Clé stable pour idempotence (heure théorique / numéro train) */
  identity: string;
  baseDepartureHm: string | null;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Extrait UIC 8 chiffres depuis `stop_area:SNCF:87756056` ou URL G&C. */
export function extractUic(originId: string, displayUrl?: string | null): string | null {
  const fromId = originId.match(/(\d{8})\s*$/);
  if (fromId) return fromId[1];
  const digits = originId.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(-8);
  if (displayUrl) {
    const m = displayUrl.match(/(\d{8})/);
    if (m) return m[1];
  }
  return null;
}

function parseDelayMinutes(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "0" || s === "à l'heure" || s === "a l'heure" || s === "on time") {
    return 0;
  }
  const m = s.match(/(\d+)\s*min/);
  if (m) return Number(m[1]);
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function isCancelledText(...parts: unknown[]): boolean {
  const t = parts.map((p) => String(p ?? "").toLowerCase()).join(" ");
  return (
    t.includes("supprim") ||
    t.includes("cancel") ||
    t.includes("deleted") ||
    t.includes("annul")
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function normalizeRow(row: unknown, index: number): GcBoardDeparture | null {
  const r = asRecord(row);
  if (!r) return null;

  const nested =
    asRecord(r.displayInformations) ??
    asRecord(r.display_informations) ??
    asRecord(r.train) ??
    r;

  const directionText = pickString(nested, [
    "destination",
    "dest",
    "terminus",
    "term",
    "direction",
    "miss",
    "mission",
    "destinationLabel",
  ]);

  const timeHm = pickString(nested, [
    "heure",
    "time",
    "departureTime",
    "aimedDepartureTime",
    "baseDepartureTime",
    "horaire",
    "departure",
  ]);

  const num = pickString(nested, ["num", "number", "trainNumber", "numero", "headsign"]);
  const etat = pickString(nested, ["etat", "state", "status", "situation"]);
  const delayRaw =
    nested.retard ?? nested.delay ?? nested.delayMinutes ?? nested.minutesRetard;
  let delayMinutes = parseDelayMinutes(delayRaw);
  const cancelled = isCancelledText(etat, nested.canceled, nested.cancelled);
  let delayedUnknown = false;

  if (!cancelled && delayMinutes == null && /retard/i.test(etat)) {
    delayedUnknown = true;
  }
  if (!cancelled && delayMinutes == null && etat && /heure|on.?time/i.test(etat)) {
    delayMinutes = 0;
  }

  if (!directionText && !timeHm && !num) return null;

  const identity = [num || "x", timeHm || `i${index}`, directionText || "dest"]
    .join("-")
    .slice(0, 120);

  return {
    directionText: directionText || num || "—",
    delayMinutes: cancelled ? null : delayMinutes,
    cancelled,
    delayedUnknown,
    identity,
    baseDepartureHm: timeHm || null,
  };
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (!root) return [];
  for (const key of [
    "trains",
    "departures",
    "trainList",
    "nextTrains",
    "data",
    "results",
  ]) {
    const v = root[key];
    if (Array.isArray(v)) return v;
  }
  // nested data.trains
  const data = asRecord(root.data);
  if (data) {
    for (const key of ["trains", "departures", "trainList"]) {
      const v = data[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export function parseGcBoardPayload(payload: unknown): GcBoardDeparture[] {
  return extractRows(payload)
    .map((row, i) => normalizeRow(row, i))
    .filter((x): x is GcBoardDeparture => x != null);
}

function looksLikeCaptcha(body: string, status: number): boolean {
  if (status === 403 || status === 429) return true;
  const t = body.toLowerCase();
  return (
    t.includes("captcha-delivery") ||
    t.includes("datadome") ||
    t.includes("please enable js")
  );
}

/**
 * Récupère le board départs G&C pour une gare (UIC).
 */
export async function fetchGcDeparturesForJourney(
  journey: JourneyConfig,
): Promise<{ departures: GcBoardDeparture[]; detail: string }> {
  const station = (await store.listStations()).find(
    (s) => s.externalId === journey.originId,
  );
  const uic = extractUic(journey.originId, station?.displayUrl ?? null);
  if (!uic) {
    throw new Error(
      `G&C failover: UIC introuvable pour ${journey.originLabel} (${journey.originId})`,
    );
  }

  const urls = [
    `https://www.garesetconnexions.sncf/fr/train-times/${uic}/departure`,
    `https://www.garesetconnexions.sncf/fr/train-times/${uic}/departures`,
  ];
  if (station?.displayUrl) {
    const base = station.displayUrl.replace(/\/$/, "");
    urls.push(`${base}/horaires`);
  }

  let lastErr = "aucune réponse";
  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/html;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9",
        Referer: station?.displayUrl ?? "https://www.garesetconnexions.sncf/fr",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (looksLikeCaptcha(text, res.status)) {
      lastErr = `Captcha / blocage Datadome (HTTP ${res.status}) sur ${url}`;
      continue;
    }
    if (!res.ok) {
      lastErr = `HTTP ${res.status} sur ${url}`;
      continue;
    }

    // JSON
    try {
      const json = JSON.parse(text) as unknown;
      const departures = parseGcBoardPayload(json);
      if (departures.length > 0) {
        return {
          departures,
          detail: `G&C JSON OK (${departures.length} trains) via UIC ${uic}`,
        };
      }
      lastErr = `JSON sans trains parseables (${url})`;
    } catch {
      // HTML — extraction basique data-JSON embarqué
      const embedded = text.match(
        /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i,
      );
      if (embedded?.[1]) {
        try {
          const departures = parseGcBoardPayload(JSON.parse(embedded[1]));
          if (departures.length > 0) {
            return {
              departures,
              detail: `G&C HTML/JSON OK (${departures.length} trains) UIC ${uic}`,
            };
          }
        } catch {
          /* ignore */
        }
      }
      lastErr = `Réponse non JSON / HTML non exploitable (${url})`;
    }
  }

  throw new Error(`G&C failover échoué: ${lastErr}`);
}
