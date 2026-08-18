import {
  ADMIN_PASSWORD_MIN_LENGTH,
  type AdminPasswordUpdate,
} from "@sncf-alerts/shared";
import { useState, type FormEvent } from "react";
import { apiSend } from "../api/client";
import { errorMessage } from "../lib/format";

export function AdminAccountPanel({ username }: { username: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== confirmPassword) {
      setMsg({
        text: "Le nouveau mot de passe et la confirmation ne correspondent pas",
        ok: false,
      });
      return;
    }
    if (newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
      setMsg({
        text: `Le mot de passe doit faire au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères`,
        ok: false,
      });
      return;
    }
    setBusy(true);
    try {
      const body: AdminPasswordUpdate = { currentPassword, newPassword };
      await apiSend("/v1/admin/account/password", "PUT", body);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMsg({ text: "Mot de passe mis à jour", ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card admin-stack-card">
      <header className="admin-stack-card-head">
        <h3>Compte</h3>
      </header>
      <p className="muted">
        Identifiant : <strong>{username}</strong>
      </p>
      <form className="stack-form" onSubmit={(e) => void save(e)}>
        <label>
          Mot de passe actuel
          <input
            type="password"
            value={currentPassword}
            disabled={busy}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Nouveau mot de passe
          <input
            type="password"
            value={newPassword}
            disabled={busy}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={ADMIN_PASSWORD_MIN_LENGTH}
            required
          />
        </label>
        <label>
          Confirmation
          <input
            type="password"
            value={confirmPassword}
            disabled={busy}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={ADMIN_PASSWORD_MIN_LENGTH}
            required
          />
        </label>
        <p className="muted field-hint">
          Au moins {ADMIN_PASSWORD_MIN_LENGTH} caractères. Le mot de passe n’est
          jamais affiché.
        </p>
        <div className="admin-stack-actions">
          <button type="submit" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>
      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </article>
  );
}
