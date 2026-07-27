import type {
  IngestConfigPublic,
  IngestConfigUpdate,
  IngestProbeResult,
  IngestProviderId,
  IngestProviderSlotPublic,
} from "@sncf-alerts/shared";
import {
  clampIngestPollSeconds,
  INGEST_POLL_SECONDS_MAX,
  INGEST_POLL_SECONDS_MIN,
} from "@sncf-alerts/shared";
import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";

const LABELS: Record<IngestProviderId, string> = {
  stub: "Stub",
  navitia: "Navitia",
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
  onSavePoll,
  onProbe,
  busy,
}: {
  slot: IngestProviderSlotPublic;
  active: boolean;
  onActivate: () => void;
  onSaveToken: (token: string) => Promise<void>;
  onSavePoll: (seconds: number) => Promise<void>;
  onProbe: (token?: string) => Promise<void>;
  busy: boolean;
}) {
  const [token, setToken] = useState("");
  const [pollSeconds, setPollSeconds] = useState(
    String(slot.pollIntervalSeconds),
  );

  useEffect(() => {
    setPollSeconds(String(slot.pollIntervalSeconds));
  }, [slot.pollIntervalSeconds, slot.id]);

  const pollDirty =
    clampIngestPollSeconds(pollSeconds) !== slot.pollIntervalSeconds;

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

      <label className="ingest-poll-field">
        Poll (s)
        <input
          type="number"
          min={INGEST_POLL_SECONDS_MIN}
          max={INGEST_POLL_SECONDS_MAX}
          step={30}
          value={pollSeconds}
          disabled={busy}
          onChange={(e) => setPollSeconds(e.target.value)}
        />
      </label>
      {pollDirty ? (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void onSavePoll(clampIngestPollSeconds(pollSeconds))
          }
        >
          Sauver intervalle
        </button>
      ) : null}

      {slot.id === "stub" ? (
        <p className="muted field-hint">Pas de token. OK pour les checks.</p>
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
              onClick={() =>
                void onSaveToken(token.trim()).then(() => setToken(""))
              }
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
      const slot = next.providers[provider];
      const checkOk = provider === "stub" || slot.lastCheckOk === true;
      setMsg({
        text: checkOk
          ? `Provider actif : ${LABELS[provider]}`
          : `Provider actif : ${LABELS[provider]} — check KO (${slot.lastCheckDetail ?? "API indisponible"}).`,
        ok: checkOk,
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

  async function setZouFailover(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await apiSend<IngestConfigPublic>("/v1/admin/ingest", "PUT", {
        zouFailoverEnabled: enabled,
      });
      setConfig(next);
      setMsg({
        text: enabled ? "Failover ZOU activé" : "Failover ZOU désactivé",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function savePoll(provider: IngestProviderId, seconds: number) {
    setBusy(true);
    setMsg(null);
    try {
      const body: IngestConfigUpdate =
        provider === "stub"
          ? { stubPollIntervalSeconds: seconds }
          : { navitiaPollIntervalSeconds: seconds };
      const next = await apiSend<IngestConfigPublic>(
        "/v1/admin/ingest",
        "PUT",
        body,
      );
      setConfig(next);
      setMsg({
        text: `${LABELS[provider]} : poll ${seconds}s`,
        ok: true,
      });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function saveToken(provider: "navitia", token: string) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await apiSend<IngestConfigPublic>("/v1/admin/ingest", "PUT", {
        navitiaToken: token,
      });
      setConfig(next);
      const slot = next.providers[provider];
      const checkOk = slot.lastCheckOk === true;
      setMsg({
        text: checkOk
          ? `${LABELS[provider]} : token OK`
          : `${LABELS[provider]} : token enregistré — check KO`,
        ok: checkOk,
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

  const order: IngestProviderId[] = ["stub", "navitia"];

  return (
    <div className="ingest-config">
      <div className="card ingest-failover-card">
        <div className="ingest-provider-head">
          <strong>Failover ZOU</strong>
          {config.zouFailoverEnabled ? (
            <span className="pill pill-ok">ON</span>
          ) : (
            <span className="pill pill-ignored">OFF</span>
          )}
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={config.zouFailoverEnabled}
            disabled={busy}
            onChange={(e) => void setZouFailover(e.target.checked)}
          />{" "}
          Basculer si Navitia KO / quota / sans token
        </label>
      </div>

      <div className="ingest-provider-grid">
        {order.map((id) => (
          <ProviderCard
            key={id}
            slot={config.providers[id]}
            active={config.activeProvider === id}
            busy={busy}
            onActivate={() => void activate(id)}
            onSaveToken={(t) => saveToken("navitia", t)}
            onSavePoll={(s) => savePoll(id, s)}
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
