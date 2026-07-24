import type {
  IngestConfigPublic,
  IngestProbeResult,
  IngestProviderId,
  IngestProviderSlotPublic,
} from "@sncf-alerts/shared";
import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";

const LABELS: Record<IngestProviderId, string> = {
  stub: "Stub (dev / démo)",
  navitia: "Navitia (api.sncf.com)",
  prim: "PRIM (Île-de-France Mobilités)",
};

function CheckBadge({ slot }: { slot: IngestProviderSlotPublic }) {
  if (slot.lastCheckOk === true) {
    return (
      <p className="ok ingest-check">
        Dernier check OK
        {slot.lastCheckDetail ? ` — ${slot.lastCheckDetail}` : ""}
      </p>
    );
  }
  if (slot.lastCheckOk === false) {
    return (
      <p className="error ingest-check">
        Dernier check KO
        {slot.lastCheckDetail ? ` — ${slot.lastCheckDetail}` : ""}
      </p>
    );
  }
  return <p className="muted ingest-check">Pas encore de check API</p>;
}

function ProviderCard({
  slot,
  active,
  onActivate,
  onSaveToken,
  onProbe,
  busy,
}: {
  slot: IngestProviderSlotPublic;
  active: boolean;
  onActivate: () => void;
  onSaveToken: (token: string) => Promise<void>;
  onProbe: (token?: string) => Promise<void>;
  busy: boolean;
}) {
  const [token, setToken] = useState("");

  return (
    <article className={`card ingest-provider-card${active ? " is-active" : ""}`}>
      <div className="ingest-provider-head">
        <label className="check-inline ingest-active-radio">
          <input
            type="radio"
            name="activeIngest"
            checked={active}
            disabled={busy}
            onChange={() => onActivate()}
          />
          <strong>{LABELS[slot.id]}</strong>
          {active && <span className="pill">Actif</span>}
        </label>
      </div>

      {slot.id === "stub" ? (
        <p className="muted field-hint">
          Aucun token. Injection debug possible. Toujours « OK » pour le check.
        </p>
      ) : (
        <>
          <p className="ingest-token-status">
            {slot.tokenConfigured ? (
              <>
                Token :{" "}
                <code>
                  {slot.tokenPreview}
                  …
                </code>
              </>
            ) : (
              <span className="error">Aucun token configuré</span>
            )}
          </p>
          <label>
            {slot.tokenConfigured
              ? "Nouveau token (vide = conserver)"
              : "Token / clé API"}
            <input
              type="password"
              autoComplete="off"
              value={token}
              disabled={busy}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                slot.tokenConfigured
                  ? "•••••••• (inchangé si vide)"
                  : "Coller le secret"
              }
            />
          </label>
          <div className="ingest-provider-actions">
            <button
              type="button"
              disabled={busy || !token.trim()}
              onClick={() => void onSaveToken(token.trim()).then(() => setToken(""))}
            >
              Enregistrer + vérifier
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || (!token.trim() && !slot.tokenConfigured)}
              onClick={() =>
                void onProbe(token.trim() || undefined).then(() => {
                  if (token.trim()) setToken("");
                })
              }
            >
              Tester
            </button>
          </div>
        </>
      )}

      <CheckBadge slot={slot} />
    </article>
  );
}

export function IngestConfigPanel() {
  const [config, setConfig] = useState<IngestConfigPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function reload() {
    const c = await apiGet<IngestConfigPublic>("/v1/admin/ingest");
    setConfig(c);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setMsg({ text: errorMessage(err), ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function activate(provider: IngestProviderId) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await apiSend<IngestConfigPublic>("/v1/admin/ingest", "PUT", {
        activeProvider: provider,
      });
      setConfig(next);
      setMsg({ text: `Provider actif : ${LABELS[provider]}`, ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
      try {
        await reload();
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveToken(provider: "navitia" | "prim", token: string) {
    setBusy(true);
    setMsg(null);
    try {
      const body =
        provider === "navitia"
          ? { navitiaToken: token }
          : { primApiKey: token };
      const next = await apiSend<IngestConfigPublic>(
        "/v1/admin/ingest",
        "PUT",
        body,
      );
      setConfig(next);
      setMsg({
        text: `${LABELS[provider]} : token enregistré (check API OK)`,
        ok: true,
      });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
      try {
        await reload();
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }

  async function setGcFailover(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await apiSend<IngestConfigPublic>("/v1/admin/ingest", "PUT", {
        gcFailoverEnabled: enabled,
      });
      setConfig(next);
      setMsg({
        text: enabled
          ? "Failover G&C activé"
          : "Failover G&C désactivé (rollback)",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function probe(provider: IngestProviderId, token?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await apiSend<IngestProbeResult>(
        "/v1/admin/ingest/probe",
        "POST",
        { provider, token },
      );
      await reload();
      setMsg({
        text: result.ok
          ? `Check OK — ${result.detail}`
          : `Check KO — ${result.detail}`,
        ok: result.ok,
      });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !config) {
    return <p className="muted">Chargement…</p>;
  }

  const order: IngestProviderId[] = ["stub", "navitia", "prim"];

  return (
    <div className="ingest-config">
      <div className="card">
        <h2>Sources de données</h2>
        <p className="muted">
          Configure chaque provider indépendamment, puis choisis celui{" "}
          <strong>actif</strong> pour le poll. Les tokens sont write-only : seuls
          les 5 premiers caractères restent visibles. Enregistrer un token
          déclenche un check API (refus si échec).
        </p>
        <p>
          Actif : <strong>{LABELS[config.activeProvider]}</strong>
        </p>
      </div>

      <div className="card ingest-failover-card">
        <h3>Failover temporaire — Gares &amp; Connexions</h3>
        <p className="muted">
          Si Navitia (ou PRIM) échoue / quota / token manquant, scrape le board
          public via l’UIC et le lien fiche gare (<code>display_url</code> du
          catalogue Stations). Désactiver = rollback comportement normal.
        </p>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={config.gcFailoverEnabled}
            disabled={busy}
            onChange={(e) => void setGcFailover(e.target.checked)}
          />{" "}
          Activer le failover scrape G&amp;C
        </label>
        <p className="muted field-hint">
          Attention : le site peut renvoyer un captcha (Datadome) selon l’IP —
          le détail d’ingest affichera alors l’erreur.
        </p>
      </div>

      <div className="ingest-provider-grid">
        {order.map((id) => (
          <ProviderCard
            key={id}
            slot={config.providers[id]}
            active={config.activeProvider === id}
            busy={busy}
            onActivate={() => void activate(id)}
            onSaveToken={(t) =>
              saveToken(id as "navitia" | "prim", t)
            }
            onProbe={(t) => probe(id, t)}
          />
        ))}
      </div>

      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </div>
  );
}
