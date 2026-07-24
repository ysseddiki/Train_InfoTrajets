import type { IngestProbeResult, IngestProviderId } from "@sncf-alerts/shared";

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
    return {
      provider,
      ok: true,
      httpStatus: null,
      detail: "Stub — aucun appel externe",
      checkedAt,
    };
  }

  const secret = token?.trim() ?? "";
  if (!secret) {
    return {
      provider,
      ok: false,
      httpStatus: null,
      detail: "Token / clé manquant",
      checkedAt,
    };
  }

  if (provider === "navitia") {
    try {
      const res = await fetch("https://api.sncf.com/v1/coverage/sncf", {
        headers: {
          Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        return {
          provider,
          ok: true,
          httpStatus: res.status,
          detail: `Navitia OK (HTTP ${res.status})`,
          checkedAt,
        };
      }
      return {
        provider,
        ok: false,
        httpStatus: res.status,
        detail: `Navitia HTTP ${res.status} — token refusé ou erreur API`,
        checkedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "erreur réseau";
      return {
        provider,
        ok: false,
        httpStatus: null,
        detail: `Navitia injoignable: ${message.slice(0, 200)}`,
        checkedAt,
      };
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
    if (res.ok) {
      return {
        provider,
        ok: true,
        httpStatus: res.status,
        detail: `PRIM OK (HTTP ${res.status})`,
        checkedAt,
      };
    }
    return {
      provider,
      ok: false,
      httpStatus: res.status,
      detail: `PRIM HTTP ${res.status} — clé refusée ou erreur API`,
      checkedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "erreur réseau";
    return {
      provider,
      ok: false,
      httpStatus: null,
      detail: `PRIM injoignable: ${message.slice(0, 200)}`,
      checkedAt,
    };
  }
}
