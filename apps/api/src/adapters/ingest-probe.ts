import type { IngestProbeResult, IngestProviderId } from "@sncf-alerts/shared";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";

/**
 * Vérifie qu’un credential donne une réponse positive de l’API cible.
 * Navitia → api.sncf.com ; PRIM → marketplace IDFM ; stub → toujours ok.
 */
export async function probeIngestCredential(
  provider: IngestProviderId,
  token: string | null | undefined,
): Promise<IngestProbeResult> {
  const checkedAt = new Date().toISOString();

  if (provider === "stub") {
    const result: IngestProbeResult = {
      provider,
      ok: true,
      httpStatus: null,
      detail: "Stub — aucun appel externe",
      checkedAt,
    };
    appendIngestApiLog({
      source: "stub",
      title: "Probe stub",
      ok: true,
      lines: [result.detail],
    });
    return result;
  }

  const secret = token?.trim() ?? "";
  if (!secret) {
    const result: IngestProbeResult = {
      provider,
      ok: false,
      httpStatus: null,
      detail: "Token / clé manquant",
      checkedAt,
    };
    appendIngestApiLog({
      source: provider,
      title: `Probe ${provider}`,
      ok: false,
      lines: [result.detail],
    });
    return result;
  }

  if (provider === "navitia") {
    try {
      const res = await fetch("https://api.sncf.com/v1/coverage/sncf", {
        headers: {
          Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(12_000),
      });
      const bodyPreview = (await res.text().catch(() => "")).slice(0, 400);
      if (res.ok) {
        const result: IngestProbeResult = {
          provider,
          ok: true,
          httpStatus: res.status,
          detail: `Navitia OK (HTTP ${res.status})`,
          checkedAt,
        };
        appendIngestApiLog({
          source: "navitia",
          title: "Probe coverage/sncf",
          httpStatus: res.status,
          ok: true,
          lines: [result.detail, bodyPreview || "(corps vide / non-texte)"],
        });
        return result;
      }
      const result: IngestProbeResult = {
        provider,
        ok: false,
        httpStatus: res.status,
        detail: `Navitia HTTP ${res.status} — token refusé ou erreur API`,
        checkedAt,
      };
      appendIngestApiLog({
        source: "navitia",
        title: "Probe coverage/sncf",
        httpStatus: res.status,
        ok: false,
        lines: [result.detail, bodyPreview || "(corps vide)"],
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "erreur réseau";
      const result: IngestProbeResult = {
        provider,
        ok: false,
        httpStatus: null,
        detail: `Navitia injoignable: ${message.slice(0, 200)}`,
        checkedAt,
      };
      appendIngestApiLog({
        source: "navitia",
        title: "Probe coverage/sncf",
        ok: false,
        lines: [result.detail],
      });
      return result;
    }
  }

  // PRIM — stop-monitoring léger (header apiKey)
  try {
    const url =
      "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:41379:";
    const res = await fetch(url, {
      headers: {
        apiKey: secret,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
    const bodyPreview = (await res.text().catch(() => "")).slice(0, 800);
    if (res.ok) {
      const result: IngestProbeResult = {
        provider,
        ok: true,
        httpStatus: res.status,
        detail: `PRIM OK (HTTP ${res.status})`,
        checkedAt,
      };
      appendIngestApiLog({
        source: "prim",
        title: "Probe stop-monitoring",
        httpStatus: res.status,
        ok: true,
        lines: splitJsonOrTextLines(bodyPreview, result.detail),
      });
      return result;
    }
    const result: IngestProbeResult = {
      provider,
      ok: false,
      httpStatus: res.status,
      detail: `PRIM HTTP ${res.status} — clé refusée ou erreur API`,
      checkedAt,
    };
    appendIngestApiLog({
      source: "prim",
      title: "Probe stop-monitoring",
      httpStatus: res.status,
      ok: false,
      lines: [result.detail, bodyPreview || "(corps vide)"],
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "erreur réseau";
    const result: IngestProbeResult = {
      provider,
      ok: false,
      httpStatus: null,
      detail: `PRIM injoignable: ${message.slice(0, 200)}`,
      checkedAt,
    };
    appendIngestApiLog({
      source: "prim",
      title: "Probe stop-monitoring",
      ok: false,
      lines: [result.detail],
    });
    return result;
  }
}

function splitJsonOrTextLines(body: string, headline: string): string[] {
  const lines = [headline];
  if (!body.trim()) {
    lines.push("(corps vide)");
    return lines;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    lines.push(...flattenJsonLines(parsed));
  } catch {
    for (const line of body.split(/\r?\n/)) {
      if (line.trim()) lines.push(line.slice(0, 500));
    }
  }
  return lines;
}

function flattenJsonLines(value: unknown, prefix = "", depth = 0): string[] {
  if (depth > 4) return [`${prefix}=…`];
  if (value === null || value === undefined) {
    return [`${prefix || "value"}=null`];
  }
  if (typeof value !== "object") {
    return [`${prefix || "value"}=${String(value).slice(0, 300)}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix || "array"}=[]`];
    const out: string[] = [];
    value.slice(0, 40).forEach((item, i) => {
      out.push(...flattenJsonLines(item, `${prefix}[${i}]`, depth + 1));
    });
    if (value.length > 40) out.push(`${prefix}… +${value.length - 40} items`);
    return out;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [`${prefix || "object"}={}`];
  const out: string[] = [];
  for (const [k, v] of entries.slice(0, 60)) {
    const key = prefix ? `${prefix}.${k}` : k;
    out.push(...flattenJsonLines(v, key, depth + 1));
  }
  return out;
}
