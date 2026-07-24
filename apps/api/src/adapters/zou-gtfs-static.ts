import { unzipSync } from "fflate";
import { extractUic } from "./zou-ids.js";

const DEFAULT_GTFS_URL =
  "https://proxy-data.zou.maregionsud.fr/GTFS/GTFS_SIBR_zou_ferre_datasud.zip";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type ZouTripMeta = {
  tripId: string;
  headsign: string;
  shortName: string;
};

export type ZouStaticIndex = {
  fetchedAt: number;
  /** stop_id → UIC */
  stopUic: Map<string, string>;
  /** stop_id → name */
  stopName: Map<string, string>;
  /** trip_id → meta */
  trips: Map<string, ZouTripMeta>;
};

let cache: ZouStaticIndex | null = null;
let inflight: Promise<ZouStaticIndex> | null = null;

function gtfsUrl(): string {
  return process.env.ZOU_GTFS_URL?.trim() || DEFAULT_GTFS_URL;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]!] = cols[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

/** Minimal CSV split (GTFS fields are unquoted or simply quoted). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function buildIndex(zipBytes: Uint8Array): ZouStaticIndex {
  const files = unzipSync(zipBytes, {
    filter: (file) => {
      const n = file.name.replace(/^.*\//, "").toLowerCase();
      return n === "stops.txt" || n === "trips.txt";
    },
  });

  const findEntry = (base: string): Uint8Array | undefined => {
    if (files[base]) return files[base];
    const key = Object.keys(files).find((k) =>
      k.replace(/^.*\//, "").toLowerCase() === base,
    );
    return key ? files[key] : undefined;
  };

  const stopsRaw = findEntry("stops.txt");
  const tripsRaw = findEntry("trips.txt");
  if (!stopsRaw || !tripsRaw) {
    throw new Error("GTFS ZOU: stops.txt / trips.txt manquants dans le zip");
  }

  const decoder = new TextDecoder("utf-8");
  const stopUic = new Map<string, string>();
  const stopName = new Map<string, string>();
  for (const row of parseCsv(decoder.decode(stopsRaw))) {
    const id = row.stop_id?.trim();
    if (!id) continue;
    const name = (row.stop_name ?? "").trim();
    if (name) stopName.set(id, name);
    const uic =
      extractUic(id) ??
      extractUic(row.stop_code) ??
      extractUic(row.zone_id) ??
      extractUic(row.parent_station);
    if (uic) stopUic.set(id, uic);
  }

  const trips = new Map<string, ZouTripMeta>();
  for (const row of parseCsv(decoder.decode(tripsRaw))) {
    const tripId = row.trip_id?.trim();
    if (!tripId) continue;
    trips.set(tripId, {
      tripId,
      headsign: (row.trip_headsign ?? "").trim(),
      shortName: (row.trip_short_name ?? "").trim(),
    });
  }

  return {
    fetchedAt: Date.now(),
    stopUic,
    stopName,
    trips,
  };
}

async function fetchStatic(): Promise<ZouStaticIndex> {
  const res = await fetch(gtfsUrl(), {
    headers: { Accept: "application/zip,*/*" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`GTFS ZOU HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return buildIndex(buf);
}

/** Cached GTFS static (stops + trips). Refresh every 12h. */
export async function getZouStaticIndex(): Promise<ZouStaticIndex> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  if (!inflight) {
    inflight = fetchStatic()
      .then((idx) => {
        cache = idx;
        return idx;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function resolveTripMeta(
  index: ZouStaticIndex,
  tripId: string | null | undefined,
): ZouTripMeta | null {
  if (!tripId) return null;
  return index.trips.get(tripId) ?? null;
}

export function stopNameForId(
  index: ZouStaticIndex,
  stopId: string | null | undefined,
): string | null {
  if (!stopId) return null;
  return index.stopName.get(stopId) ?? null;
}

/** Test helper */
export function _resetZouStaticCacheForTests(): void {
  cache = null;
  inflight = null;
}
