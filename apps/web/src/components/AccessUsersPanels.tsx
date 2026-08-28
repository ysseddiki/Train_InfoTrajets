import type {
  AccessSettings,
  UserCreateBody,
  UserPublic,
  UserRole,
} from "@sncf-alerts/shared";
import { ADMIN_PASSWORD_MIN_LENGTH, USER_ROLES } from "@sncf-alerts/shared";
import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";
import { useAuth } from "../auth/AuthContext";

const ROLE_LABEL: Record<UserRole, string> = {
  reader: "Lecture seule",
  liaison_editor: "Liaisons",
  admin: "Admin",
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserPublic[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const list = await apiGet<UserPublic[]>("/v1/admin/users");
    setUsers(list);
  }

  useEffect(() => {
    void reload().catch((err) =>
      setMsg({ text: errorMessage(err), ok: false }),
    );
  }, []);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: UserCreateBody = {
      username: String(fd.get("username") ?? "").trim(),
      password: String(fd.get("password") ?? ""),
      role: String(fd.get("role") ?? "reader") as UserRole,
    };
    setBusy(true);
    setMsg(null);
    try {
      await apiSend("/v1/admin/users", "POST", body);
      (e.currentTarget as HTMLFormElement).reset();
      await reload();
      setMsg({ text: "Compte créé", ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: { role?: UserRole; disabled?: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      await apiSend(`/v1/admin/users/${id}`, "PATCH", body);
      await reload();
      setMsg({ text: "Compte mis à jour", ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(id: string, username: string) {
    const password = window.prompt(
      `Nouveau mot de passe pour ${username} (min. ${ADMIN_PASSWORD_MIN_LENGTH} caractères)`,
    );
    if (!password) return;
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
      setMsg({
        text: `Le mot de passe doit contenir au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères`,
        ok: false,
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await apiSend(`/v1/admin/users/${id}`, "PATCH", { password });
      setMsg({ text: "Mot de passe réinitialisé", ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (!users) {
    return <p className="muted">Chargement…</p>;
  }

  return (
    <div className="admin-stack">
      <article className="card admin-stack-card">
        <header className="admin-stack-card-head">
          <h3>Comptes</h3>
        </header>
        <ul className="users-list">
          {users.map((u) => (
            <li key={u.id} className={u.disabled ? "is-disabled" : ""}>
              <div>
                <strong>{u.username}</strong>
                {u.disabled && <span className="muted"> — désactivé</span>}
              </div>
              <div className="users-row-actions">
                <select
                  value={u.role}
                  disabled={busy}
                  aria-label={`Rôle de ${u.username}`}
                  onChange={(e) =>
                    void patch(u.id, { role: e.target.value as UserRole })
                  }
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void patch(u.id, { disabled: !u.disabled })}
                >
                  {u.disabled ? "Réactiver" : "Désactiver"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void resetPassword(u.id, u.username)}
                >
                  Mot de passe
                </button>
              </div>
            </li>
          ))}
        </ul>
      </article>

      <article className="card admin-stack-card">
        <header className="admin-stack-card-head">
          <h3>Nouveau compte</h3>
        </header>
        <form className="stack-form" onSubmit={(e) => void create(e)}>
          <label>
            Identifiant
            <input name="username" autoComplete="off" required disabled={busy} />
          </label>
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={ADMIN_PASSWORD_MIN_LENGTH}
              required
              disabled={busy}
            />
          </label>
          <label>
            Rôle
            <select name="role" defaultValue="reader" disabled={busy}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-stack-actions">
            <button type="submit" disabled={busy}>
              Créer
            </button>
          </div>
        </form>
      </article>
      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </div>
  );
}

export function AccessPanel() {
  const { refreshConfig } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiGet<AccessSettings>("/v1/admin/settings/access")
      .then((s) => setEnabled(s.visitorEnabled))
      .catch((err) => setMsg({ text: errorMessage(err), ok: false }));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (enabled === null) return;
    setBusy(true);
    setMsg(null);
    try {
      const next = await apiSend<AccessSettings>(
        "/v1/admin/settings/access",
        "PUT",
        { visitorEnabled: enabled },
      );
      setEnabled(next.visitorEnabled);
      await refreshConfig();
      setMsg({
        text: next.visitorEnabled
          ? "Mode visiteur activé"
          : "Mode visiteur désactivé",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) {
    return <p className="muted">Chargement…</p>;
  }

  return (
    <article className="card admin-stack-card">
      <header className="admin-stack-card-head">
        <h3>Mode visiteur</h3>
      </header>
      <form className="stack-form" onSubmit={(e) => void save(e)}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Autoriser l’accès anonyme au dashboard
        </label>
        <p className="muted field-hint">
          Désactivé : connexion obligatoire. Les APIs de lecture répondent 401
          sans session.
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
