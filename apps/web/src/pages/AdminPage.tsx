import type {
  JourneyConfig,
  JourneyDirection,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../api/client";
import { VoyageForm } from "../components/VoyageForm";
import { errorMessage } from "../lib/format";

type AdminMe = { username: string };

function AdminConsole({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  const [outbound, setOutbound] = useState<JourneyConfig | null>(null);
  const [inbound, setInbound] = useState<JourneyConfig | null>(null);
  const [recipients, setRecipients] = useState<RecipientsConfig | null>(null);
  const [smtp, setSmtp] = useState<SmtpConfigPublic | null>(null);
  const [teams, setTeams] = useState<TeamsConfigPublic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recipientsMsg, setRecipientsMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [teamsMsg, setTeamsMsg] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [stubMsg, setStubMsg] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [stubDirection, setStubDirection] =
    useState<JourneyDirection>("outbound");
  const [stubDelay, setStubDelay] = useState(15);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [o, i, r, s, t] = await Promise.all([
          apiGet<JourneyConfig>("/v1/admin/journeys/outbound"),
          apiGet<JourneyConfig>("/v1/admin/journeys/inbound"),
          apiGet<RecipientsConfig>("/v1/admin/channels/recipients"),
          apiGet<SmtpConfigPublic>("/v1/admin/channels/smtp"),
          apiGet<TeamsConfigPublic>("/v1/admin/channels/teams"),
        ]);
        if (cancelled) return;
        setOutbound(o);
        setInbound(i);
        setRecipients(r);
        setSmtp(s);
        setTeams(t);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveRecipients(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const emails = String(fd.get("emails") ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await apiSend("/v1/admin/channels/recipients", "PUT", { emails });
      setRecipientsMsg({ text: "Enregistré", ok: true });
    } catch {
      setRecipientsMsg({ text: "Erreur", ok: false });
    }
  }

  async function testEmail() {
    try {
      const res = await apiSend<{ status: string; detail: string | null }>(
        "/v1/admin/channels/email/test",
        "POST",
      );
      setEmailMsg({
        text: `${res.status}${res.detail ? ` — ${res.detail}` : ""}`,
        ok: res.status === "sent",
      });
    } catch {
      setEmailMsg({ text: "Échec", ok: false });
    }
  }

  async function testTeams() {
    try {
      const res = await apiSend<{ status: string; detail: string | null }>(
        "/v1/admin/channels/teams/test",
        "POST",
      );
      setTeamsMsg({
        text: `${res.status}${res.detail ? ` — ${res.detail}` : ""}`,
        ok: res.status === "sent",
      });
    } catch {
      setTeamsMsg({ text: "Échec", ok: false });
    }
  }

  async function injectStub() {
    try {
      await apiSend("/v1/admin/debug/stub-event", "POST", {
        direction: stubDirection,
        delayMinutes: stubDelay,
        kind: "delay",
      });
      setStubMsg({ text: "Événement injecté — voir Notifications", ok: true });
    } catch {
      setStubMsg({ text: "Échec injection", ok: false });
    }
  }

  if (loadError) {
    return (
      <div className="page-enter">
        <h1>Console admin</h1>
        <p className="error">Impossible de charger la console.</p>
        <pre>{loadError}</pre>
      </div>
    );
  }

  if (!outbound || !inbound || !recipients || !smtp || !teams) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  return (
    <div className="page-enter">
      <h1>Console admin</h1>
      <p>
        Connecté : <strong>{username}</strong>{" "}
        <button type="button" className="secondary" onClick={onLogout}>
          Déconnexion
        </button>
      </p>

      <section className="voyage-block">
        <VoyageForm outbound={outbound} inbound={inbound} />
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Destinataires email</h2>
        <form onSubmit={(e) => void saveRecipients(e)}>
          <label>
            Emails (un par ligne)
            <textarea
              name="emails"
              rows={4}
              defaultValue={recipients.emails.join("\n")}
            />
          </label>
          <button type="submit">Enregistrer</button>
          {recipientsMsg && (
            <p className={`form-msg ${recipientsMsg.ok ? "ok" : "error"}`}>
              {recipientsMsg.text}
            </p>
          )}
        </form>
      </section>

      <section className="grid" style={{ marginTop: "1rem" }}>
        <article className="card">
          <h2>SMTP</h2>
          <ul>
            <li>Activé : {smtp.enabled ? "oui" : "non"}</li>
            <li>Host : {smtp.host || "—"}</li>
            <li>From : {smtp.fromAddress || "—"}</li>
            <li>
              Password : {smtp.passwordConfigured ? "configuré" : "manquant"}
            </li>
          </ul>
          <p className="muted">
            Secrets SMTP via <code>.env</code> (jamais affichés).
          </p>
          <button type="button" onClick={() => void testEmail()}>
            Envoyer un test email
          </button>
          {emailMsg && (
            <p className={emailMsg.ok ? "ok" : "error"}>{emailMsg.text}</p>
          )}
        </article>
        <article className="card">
          <h2>Teams</h2>
          <ul>
            <li>Activé : {teams.enabled ? "oui" : "non"}</li>
            <li>
              Webhook : {teams.webhookConfigured ? "configuré" : "manquant"}
            </li>
          </ul>
          <p className="muted">
            URL webhook via <code>.env</code>.
          </p>
          <button type="button" onClick={() => void testTeams()}>
            Envoyer un test Teams
          </button>
          {teamsMsg && (
            <p className={teamsMsg.ok ? "ok" : "error"}>{teamsMsg.text}</p>
          )}
        </article>
      </section>

      <section className="card debug" style={{ marginTop: "1rem" }}>
        <h2>Debug ingest (admin)</h2>
        <p className="muted">
          Injecte un événement stub et déclenche le matching / notifications.
        </p>
        <label>
          Sens
          <select
            value={stubDirection}
            onChange={(e) =>
              setStubDirection(e.target.value as JourneyDirection)
            }
          >
            <option value="outbound">Aller</option>
            <option value="inbound">Retour</option>
          </select>
        </label>
        <label>
          Retard (min){" "}
          <input
            type="number"
            value={stubDelay}
            onChange={(e) => setStubDelay(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={() => void injectStub()}>
          Injecter événement stub
        </button>
        {stubMsg && (
          <p className={stubMsg.ok ? "ok" : "error"}>{stubMsg.text}</p>
        )}
      </section>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await apiSend("/v1/admin/login", "POST", {
        username: String(fd.get("username") ?? ""),
        password: String(fd.get("password") ?? ""),
      });
      onSuccess();
    } catch {
      setError("Échec login");
    }
  }

  return (
    <div className="page-enter">
      <h1>Console admin</h1>
      <form className="card" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Username{" "}
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Password{" "}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit">Se connecter</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

export function AdminPage() {
  const [me, setMe] = useState<AdminMe | null | undefined>(undefined);

  const probe = useCallback(async () => {
    try {
      const user = await apiGet<AdminMe>("/v1/admin/me");
      setMe(user);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  async function logout() {
    await apiSend("/v1/admin/logout", "POST");
    setMe(null);
  }

  if (me === undefined) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  if (!me) {
    return <LoginForm onSuccess={() => void probe()} />;
  }

  return <AdminConsole username={me.username} onLogout={() => void logout()} />;
}
