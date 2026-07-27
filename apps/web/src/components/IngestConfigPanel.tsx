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

function CheckStatus({ slot }: { slot: IngestProviderSlotPublic }) {
  if (slot.lastCheckOk === true) {
    return (
      <p className="ingest-status ingest-status-ok" role="status">
        Check OK
        {slot.lastCheckDetail ? ` — ${slot.lastCheckDetail}` : ""}
      </p>
    );
  }
  if (slot.lastCheckOk === false) {
    return (
      <p className="ingest-status ingest-status-ko" role="status">
        Check KO
        {slot.lastCheckDetail ? ` — ${slot.lastCheckDetail}` : ""}
      </p>
    );
  }
  return (
    <p className="ingest-status ingest-status-muted" role="status">
      Pas encore de check
    </p>
  );
}

function ProviderCard({
  slot,
  active,
  onActivate,
  onSave,
  onProbe,
  busy,
}: {
  slot: IngestProviderSlotPublic;
  active: boolean;
  onActivate: () => void;
  onSave: (input: { pollSeconds: number; token?: string }) => Promise<void>;
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

  const pollValue = clampIngestPollSeconds(pollSeconds);
  const pollDirty = pollValue !== slot.pollIntervalSeconds;
  const tokenDirty = Boolean(token.trim());
  const canSave = pollDirty || tokenDirty;
  const canProbe =
    slot.id === "stub" || tokenDirty || slot.tokenConfigured;

  async function handleSave() {
    await onSave({
      pollSeconds: pollValue,
      token: token.trim() || undefined,
    });
    setToken("");
  }

  return (
    <article
      className={`card ingest-provider-card${active ? " is-active" : ""}`}
    >
      <header className="ingest-provider-head">
        <label className="check-inline ingest-active-radio">
          <input
            type="radio"
            name="activeIngest"
            checked={active}
            disabled={busy}
            onChange={() => onActivate()}
          />
          <strong>{LABELS[slot.id]}</strong>
          {active ? <span className="pill">Actif</span> : null}
        </label>
      </header>

      <div className="ingest-provider-fields">
        <label className="ingest-field ingest-field-poll">
          <span className="ingest-field-label">
            Intervalle de poll
            <span className="muted"> ({INGEST_POLL_SECONDS_MIN}–{INGEST_POLL_SECONDS_MAX} s)</span>
          </span>
          <div className="ingest-poll-input">
            <input
              type="number"
              min={INGEST_POLL_SECONDS_MIN}
              max={INGEST_POLL_SECONDS_MAX}
              step={30}
              value={pollSeconds}
              disabled={busy}
              onChange={(e) => setPollSeconds(e.target.value)}
              aria-label={`Intervalle de poll ${LABELS[slot.id]}`}
            />
            <span className="muted">s</span>
          </div>
        </label>

        {slot.id === "stub" ? (
          <p className="muted field-hint">Pas de token — checks toujours OK.</p>
        ) : (
          <label className="ingest-field">
            <span className="ingest-field-label">
              {slot.tokenConfigured ? "Token API" : "Token / clé API"}
            </span>
            {slot.tokenConfigured ? (
              <span className="ingest-token-hint muted">
                Actuel : <code>{slot.tokenPreview}…</code> — laisser vide pour
                conserver
              </span>
            ) : (
              <span className="ingest-token-hint error">Aucun token configuré</span>
            )}
            <input
              type="password"
              autoComplete="off"
              value={token}
              disabled={busy}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                slot.tokenConfigured
                  ? "Nouveau token (optionnel)"
                  : "Coller le secret"
              }
            />
          </label>
        )}
      </div>

      <div className="ingest-provider-actions">
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() => void handleSave()}
        >
          Enregistrer
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !canProbe}
          onClick={() =>
            void onProbe(token.trim() || undefined).then(() => {
              if (token.trim()) setToken("");
            })
          }
        >
          Tester
        </button>
      </div>

      <CheckStatus slot={slot} />
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

  async function saveProvider(
    provider: IngestProviderId,
    input: { pollSeconds: number; token?: string },
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const body: IngestConfigUpdate =
        provider === "stub"
          ? { stubPollIntervalSeconds: input.pollSeconds }
          : {
              navitiaPollIntervalSeconds: input.pollSeconds,
              ...(input.token ? { navitiaToken: input.token } : {}),
            };
      const next = await apiSend<IngestConfigPublic>(
        "/v1/admin/ingest",
        "PUT",
        body,
      );
      setConfig(next);
      const slot = next.providers[provider];
      if (provider === "stub") {
        setMsg({
          text: `Stub : poll ${input.pollSeconds}s`,
          ok: true,
        });
        return;
      }
      if (input.token) {
        const checkOk = slot.lastCheckOk === true;
        setMsg({
          text: checkOk
            ? `Navitia : enregistré (poll ${input.pollSeconds}s) — token OK`
            : `Navitia : enregistré (poll ${input.pollSeconds}s) — check KO`,
          ok: checkOk,
        });
      } else {
        setMsg({
          text: `Navitia : poll ${input.pollSeconds}s`,
          ok: true,
        });
      }
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
        <p className="muted field-hint">
          Pas d’intervalle dédié : ZOU tourne dans le même poll que Navitia
          (intervalle configuré sur la carte Navitia).
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
            onSave={(input) => saveProvider(id, input)}
            onProbe={(t) => probe(id, t)}
          />
        ))}
      </div>

      {msg ? (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
