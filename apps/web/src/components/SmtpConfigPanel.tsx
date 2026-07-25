import type { SmtpConfigPublic, SmtpConfigUpdate } from "@sncf-alerts/shared";
import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";

export function SmtpConfigPanel({
  onTest,
  testMsg,
}: {
  onTest: () => Promise<void>;
  testMsg: { text: string; ok: boolean } | null;
}) {
  const [cfg, setCfg] = useState<SmtpConfigPublic | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function reload() {
    const c = await apiGet<SmtpConfigPublic>("/v1/admin/channels/smtp");
    setCfg(c);
    setEnabled(c.enabled);
    setHost(c.host);
    setPort(String(c.port));
    setSecure(c.secure);
    setUsername(c.username);
    setFromAddress(c.fromAddress);
    setPassword("");
  }

  useEffect(() => {
    void reload().catch((err) =>
      setMsg({ text: errorMessage(err), ok: false }),
    );
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: SmtpConfigUpdate = {
        enabled,
        host,
        port: Number(port) || 587,
        secure,
        username,
        fromAddress,
      };
      if (password.trim()) body.password = password.trim();
      const next = await apiSend<SmtpConfigPublic>(
        "/v1/admin/channels/smtp",
        "PUT",
        body,
      );
      setCfg(next);
      setPassword("");
      setMsg({ text: "SMTP enregistré", ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) {
    return <p className="muted">Chargement SMTP…</p>;
  }

  return (
    <article className="card">
      <h3>SMTP</h3>
      <p className="muted">
        Config stockée en base (mot de passe write-only). Bootstrap possible
        depuis <code>.env</code> au premier démarrage.
      </p>
      <form className="stack-form" onSubmit={(e) => void save(e)}>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Email activé
        </label>
        <label>
          Host
          <input
            value={host}
            disabled={busy}
            onChange={(e) => setHost(e.target.value)}
            required
          />
        </label>
        <label>
          Port
          <input
            value={port}
            disabled={busy}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={secure}
            disabled={busy}
            onChange={(e) => setSecure(e.target.checked)}
          />{" "}
          TLS / secure
        </label>
        <label>
          Username
          <input
            value={username}
            disabled={busy}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          From
          <input
            type="email"
            value={fromAddress}
            disabled={busy}
            onChange={(e) => setFromAddress(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          {cfg.passwordConfigured ? " (vide = conserver)" : ""}
          <input
            type="password"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={
              cfg.passwordConfigured ? "••••••••" : "Mot de passe SMTP"
            }
          />
        </label>
        <p className="muted field-hint">
          Password : {cfg.passwordConfigured ? "configuré" : "manquant"}
        </p>
        <div className="ingest-provider-actions">
          <button type="submit" disabled={busy}>
            Enregistrer
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void onTest()}
          >
            Envoyer un test email
          </button>
        </div>
      </form>
      {(msg || testMsg) && (
        <p className={(msg ?? testMsg)!.ok ? "ok" : "error"}>
          {(msg ?? testMsg)!.text}
        </p>
      )}
    </article>
  );
}
