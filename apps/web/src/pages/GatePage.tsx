import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";

export function GatePage() {
  const { login, continueAsVisitor, visitorEnabled } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setBusy(true);
    try {
      await login(
        String(fd.get("username") ?? ""),
        String(fd.get("password") ?? ""),
      );
    } catch {
      setError("Identifiants incorrects");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate-page">
      <div className="gate-theme-bar">
        <ThemeToggle variant="gate" />
      </div>
      <div className="admin-login-card card gate-card">
        <p className="eyebrow">SNCF-Alerts</p>
        <h1>Accès</h1>
        <p className="muted">
          {visitorEnabled
            ? "Connectez-vous ou continuez en visiteur."
            : "Connexion requise."}
        </p>
        <form className="admin-login-form" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Identifiant
            <input
              name="username"
              autoComplete="username"
              required
              disabled={busy}
            />
          </label>
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>
          <button type="submit" disabled={busy}>
            Se connecter
          </button>
          {error && <p className="error">{error}</p>}
        </form>
        {visitorEnabled && (
          <button
            type="button"
            className="secondary gate-visitor-btn"
            disabled={busy}
            onClick={continueAsVisitor}
          >
            Continuer en visiteur
          </button>
        )}
      </div>
    </div>
  );
}
