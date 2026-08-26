/**
 * Ring buffer des requêtes HTTP sortantes (debug admin).
 * Jamais de tokens / Authorization / webhooks complets.
 */

export type OutboundHttpProvider =
  | "navitia"
  | "open-meteo"
  | "teams"
  | "smtp"
  | "other";

export type OutboundHttpEntry = {
  id: string;
  at: string;
  provider: OutboundHttpProvider;
  method: string;
  /** URL sans query sensible / fragment / credentials */
  url: string;
  httpStatus: number | null;
  ok: boolean;
  /** Durée ms si connue */
  durationMs: number | null;
  detail: string | null;
};

const MAX_ENTRIES = 200;
const buffer: OutboundHttpEntry[] = [];
let seq = 0;

const SENSITIVE_QUERY = new Set([
  "token",
  "key",
  "apikey",
  "api_key",
  "password",
  "secret",
  "authorization",
  "auth",
  "access_token",
  "webhook",
]);

/** Masque host Teams webhook + query sensibles. */
export function sanitizeOutboundUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Incoming webhook Teams : path contient un secret
    if (
      /webhook\.office\.com$/i.test(u.hostname) ||
      /logic\.azure\.com$/i.test(u.hostname) ||
      u.pathname.toLowerCase().includes("webhook")
    ) {
      return `${u.origin}/…/webhook (masqué)`;
    }
    const params = new URLSearchParams(u.search);
    let changed = false;
    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY.has(key.toLowerCase())) {
        params.set(key, "…");
        changed = true;
      }
    }
    u.search = changed ? params.toString() : u.search;
    u.hash = "";
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return raw.replace(/https?:\/\/[^\s]+/gi, (m) => {
      if (/webhook/i.test(m)) return "https://…/webhook (masqué)";
      return m.slice(0, 120);
    });
  }
}

export function appendOutboundHttp(input: {
  provider: OutboundHttpProvider;
  method?: string;
  url: string;
  httpStatus?: number | null;
  ok: boolean;
  durationMs?: number | null;
  detail?: string | null;
}): OutboundHttpEntry {
  const entry: OutboundHttpEntry = {
    id: `http-${Date.now()}-${++seq}`,
    at: new Date().toISOString(),
    provider: input.provider,
    method: (input.method ?? "GET").toUpperCase(),
    url: sanitizeOutboundUrl(input.url).slice(0, 500),
    httpStatus: input.httpStatus ?? null,
    ok: input.ok,
    durationMs:
      input.durationMs == null || !Number.isFinite(input.durationMs)
        ? null
        : Math.round(input.durationMs),
    detail: input.detail ? String(input.detail).slice(0, 300) : null,
  };
  buffer.unshift(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.length = MAX_ENTRIES;
  }
  return entry;
}

export function listOutboundHttp(limit = 100): OutboundHttpEntry[] {
  const n = Math.min(Math.max(1, limit), MAX_ENTRIES);
  return buffer.slice(0, n);
}

export function clearOutboundHttp(): number {
  const n = buffer.length;
  buffer.length = 0;
  return n;
}

/**
 * fetch + journalisation (URL sanitisée, pas d’Authorization).
 */
export async function loggedFetch(
  url: string,
  init: RequestInit | undefined,
  meta: {
    provider: OutboundHttpProvider;
    detail?: string | null;
  },
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    appendOutboundHttp({
      provider: meta.provider,
      method,
      url,
      httpStatus: res.status,
      ok: res.ok,
      durationMs: Date.now() - started,
      detail: meta.detail ?? null,
    });
    return res;
  } catch (err) {
    appendOutboundHttp({
      provider: meta.provider,
      method,
      url,
      httpStatus: null,
      ok: false,
      durationMs: Date.now() - started,
      detail:
        meta.detail ??
        (err instanceof Error ? err.message.slice(0, 200) : "network error"),
    });
    throw err;
  }
}
