import type {
  IngestConfigPublic,
  IngestProviderId,
} from "@sncf-alerts/shared";
import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";

export function IngestConfigPanel() {
  const [config, setConfig] = useState<IngestConfigPublic | null>(null);
  const [provider, setProvider] = useState<IngestProviderId>("stub");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await apiGet<IngestConfigPublic>("/v1/admin/ingest");
        if (cancelled) return;
        setConfig(c);
        setProvider(c.provider);
      } catch (err) {
        if (!cancelled) {
          setMsg({ text: errorMessage(err), ok: false });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const next = await apiSend<IngestConfigPublic>("/v1/admin/ingest", "PUT", {
        provider,
        token: token.trim() ? token.trim() : undefined,
      });
      setConfig(next);
      setToken("");
      setMsg({ text: "Configuration ingest enregistrée", ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted">Chargement…</p>;
  }

  const needsToken = provider === "navitia" || provider === "prim";

  return (
    <form className="card" onSubmit={(e) => void onSubmit(e)}>
      <h2>Source de données</h2>
      <p className="muted">
        Provider actif pour le poll. Le token est un secret : saisi à la mise en
        place, puis seuls les 5 premiers caractères restent visibles.
      </p>

      <label>
        Provider
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as IngestProviderId)}
        >
          <option value="stub">stub (dev / démo)</option>
          <option value="navitia">navitia (api.sncf.com)</option>
          <option value="prim">prim (non implémenté)</option>
        </select>
      </label>

      {needsToken && (
        <>
          <p className="ingest-token-status">
            {config?.tokenConfigured ? (
              <>
                Token configuré :{" "}
                <code>
                  {config.tokenPreview}
                  …
                </code>
              </>
            ) : (
              <span className="error">Aucun token configuré</span>
            )}
          </p>
          <label>
            {config?.tokenConfigured
              ? "Nouveau token (laisser vide pour conserver)"
              : "Token"}
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                config?.tokenConfigured
                  ? "•••••••• (inchangé si vide)"
                  : "Coller le token"
              }
            />
          </label>
        </>
      )}

      {!needsToken && (
        <p className="muted field-hint">
          Mode stub : pas de token requis (injection debug possible).
        </p>
      )}

      <button type="submit" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </button>
      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </form>
  );
}
