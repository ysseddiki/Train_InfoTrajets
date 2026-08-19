import type { EventWeatherSnapshot, WeatherBucket } from "@sncf-alerts/shared";
import { TtlCache } from "./departures-cache.js";

const CACHE_TTL_MS = 10 * 60_000;
const snapshotCache = new TtlCache<EventWeatherSnapshot & { fetchedAt: string }>(
  CACHE_TTL_MS,
);

const BUCKET_LABELS: Record<WeatherBucket, string> = {
  clear: "Beau temps",
  cloudy: "Nuageux",
  fog: "Brouillard",
  rain: "Pluie",
  snow: "Neige",
  storm: "Orage",
  unknown: "Inconnu",
};

/** WMO weather code → bucket ops (Open-Meteo). */
export function weatherBucketFromCode(code: number | null | undefined): WeatherBucket {
  if (code == null || !Number.isFinite(code)) return "unknown";
  const c = Math.round(code);
  if (c === 0) return "clear";
  if (c >= 1 && c <= 3) return "cloudy";
  if (c === 45 || c === 48) return "fog";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if (c >= 71 && c <= 77) return "snow";
  if (c >= 95 && c <= 99) return "storm";
  return "cloudy";
}

export function weatherLabelFromCode(code: number | null | undefined): string {
  const bucket = weatherBucketFromCode(code);
  if (code == null || !Number.isFinite(code)) return BUCKET_LABELS.unknown;
  return `${BUCKET_LABELS[bucket]} (WMO ${Math.round(code)})`;
}

export function weatherBucketLabel(bucket: WeatherBucket): string {
  return BUCKET_LABELS[bucket] ?? BUCKET_LABELS.unknown;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function cacheKey(lat: number, lon: number, at: Date): string {
  const hour = at.toISOString().slice(0, 13);
  return `${lat.toFixed(4)},${lon.toFixed(4)}@${hour}`;
}

type GeocodeHit = { latitude: number; longitude: number };

/** Géocodage Open-Meteo (sans clé). */
export async function geocodeStationLabel(
  label: string,
): Promise<GeocodeHit | null> {
  const q = `${label.trim()} France`.trim();
  if (!q || q === "France") return null;
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name: q,
      count: "1",
      language: "fr",
      format: "json",
    }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      results?: Array<{ latitude?: number; longitude?: number }>;
    };
    const hit = body.results?.[0];
    if (
      hit?.latitude == null ||
      hit?.longitude == null ||
      !Number.isFinite(hit.latitude) ||
      !Number.isFinite(hit.longitude)
    ) {
      return null;
    }
    return { latitude: hit.latitude, longitude: hit.longitude };
  } catch {
    return null;
  }
}

async function fetchOpenMeteoCurrent(
  lat: number,
  lon: number,
): Promise<EventWeatherSnapshot | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,precipitation,weather_code,wind_speed_10m",
      timezone: "Europe/Paris",
    }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      current?: {
        weather_code?: number;
        precipitation?: number;
        wind_speed_10m?: number;
        temperature_2m?: number;
      };
    };
    const cur = body.current;
    if (!cur) return null;
    const code =
      cur.weather_code == null ? null : Math.round(Number(cur.weather_code));
    const bucket = weatherBucketFromCode(code);
    return {
      weatherBucket: bucket,
      weatherCode: code,
      weatherLabel: weatherLabelFromCode(code),
      precipitationMm:
        cur.precipitation == null ? null : round1(Number(cur.precipitation)),
      windSpeedKmh:
        cur.wind_speed_10m == null ? null : round1(Number(cur.wind_speed_10m)),
      temperatureC:
        cur.temperature_2m == null ? null : round1(Number(cur.temperature_2m)),
    };
  } catch {
    return null;
  }
}

/** Snapshot météo courant (cache 10 min par gare/heure). */
export async function fetchWeatherSnapshot(
  lat: number,
  lon: number,
  at = new Date(),
): Promise<(EventWeatherSnapshot & { fetchedAt: string }) | null> {
  const key = cacheKey(lat, lon, at);
  const cached = snapshotCache.get(key);
  if (cached) return cached;

  const snap = await fetchOpenMeteoCurrent(lat, lon);
  if (!snap) return null;
  const withAt = { ...snap, fetchedAt: at.toISOString() };
  snapshotCache.set(key, withAt);
  return withAt;
}

/** Météo synthétique pour stub / démo (corrélations dashboard). */
export function syntheticWeatherForStub(
  roll = Math.random(),
): EventWeatherSnapshot {
  if (roll < 0.45) {
    return {
      weatherBucket: "clear",
      weatherCode: 0,
      weatherLabel: weatherLabelFromCode(0),
      precipitationMm: 0,
      windSpeedKmh: 8 + Math.round(Math.random() * 10),
      temperatureC: 14 + Math.round(Math.random() * 10),
    };
  }
  if (roll < 0.65) {
    return {
      weatherBucket: "cloudy",
      weatherCode: 2,
      weatherLabel: weatherLabelFromCode(2),
      precipitationMm: 0,
      windSpeedKmh: 12 + Math.round(Math.random() * 15),
      temperatureC: 12 + Math.round(Math.random() * 8),
    };
  }
  if (roll < 0.85) {
    const precip = round1(0.5 + Math.random() * 6);
    return {
      weatherBucket: "rain",
      weatherCode: 61,
      weatherLabel: weatherLabelFromCode(61),
      precipitationMm: precip,
      windSpeedKmh: 15 + Math.round(Math.random() * 20),
      temperatureC: 10 + Math.round(Math.random() * 6),
    };
  }
  if (roll < 0.95) {
    return {
      weatherBucket: "storm",
      weatherCode: 95,
      weatherLabel: weatherLabelFromCode(95),
      precipitationMm: round1(2 + Math.random() * 10),
      windSpeedKmh: 25 + Math.round(Math.random() * 25),
      temperatureC: 11 + Math.round(Math.random() * 5),
    };
  }
  return {
    weatherBucket: "fog",
    weatherCode: 45,
    weatherLabel: weatherLabelFromCode(45),
    precipitationMm: 0,
    windSpeedKmh: 5 + Math.round(Math.random() * 8),
    temperatureC: 8 + Math.round(Math.random() * 4),
  };
}
