import type { IngestProbeResult, IngestProviderId } from "@sncf-alerts/shared";
import { appendIngestApiLog } from "../domain/ingest-api-logs.js";
import { formatNavitiaHttpError } from "./departures-navitia.js";

/**
 * Vérifie qu’un credential donne une réponse positive de l’API cible.
 * Navitia → api.sncf.com ; stub → toujours ok.
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
      detail: formatNavitiaHttpError(
        res.status,
        bodyPreview,
        "token / probe",
      ).slice(0, 280),
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
