import type {
  JourneyConfig,
  JourneyDirection,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import { Bug, LogOut, Mail, Radio, Route } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { apiGet, apiSend } from "../api/client";
import { VoyageForm } from "../components/VoyageForm";
import { errorMessage } from "../lib/format";

type AdminMe = { username: string };

type AdminSectionId = "voyage" | "recipients" | "channels" | "debug";

const ADMIN_SECTIONS: {
  id: AdminSectionId;
  label: string;
  description: string;
  icon: typeof Route;
}[] = [
  {
    id: "voyage",
    label: "Voyage A/R",
    description: "Gares, fenêtres horaires et jours de surveillance.",
    icon: Route,
  },
  {
    id: "recipients",
    label: "Destinataires",
    description: "Adresses email qui reçoivent les alertes.",
    icon: Mail,
  },
  {
    id: "channels",
    label: "Canaux",
    description: "État SMTP et Teams, tests d’envoi.",
    icon: Radio,
  },
  {
    id: "debug",
    label: "Debug",
    description: "Injection d’événements stub pour valider le matching.",
    icon: Bug,
  },
];

function AdminConsole({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<AdminSectionId>("voyage");
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

  const active = ADMIN_SECTIONS.find((s) => s.id === section)!;

  let panelBody: ReactNode;
  switch (section) {
    case "voyage":
      panelBody = <VoyageForm outbound={outbound} inbound={inbound} />;
      break;
    case "recipients":
      panelBody = (
        <form className="card" onSubmit={(e) => void saveRecipients(e)}>
          <label>
            Emails (un par ligne)
            <textarea
              name="emails"
              rows={6}
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
      );
      break;
    case "channels":
      panelBody = (
        <div className="grid">
          <article className="card">
            <h3>SMTP</h3>
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
            <h3>Teams</h3>
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
        </div>
      );
      break;
    case "debug":
      panelBody = (
        <section className="card debug">
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
            Retard (min)
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
      );
      break;
  }

  return (
    <div className="page-enter admin-shell">
      <header className="admin-shell-head">
        <div>
          <h1>Console admin</h1>
          <p className="muted admin-user">
            Connecté : <strong>{username}</strong>
          </p>
        </div>
        <button type="button" className="secondary" onClick={onLogout}>
          <LogOut size={16} strokeWidth={2} aria-hidden />
          Déconnexion
        </button>
      </header>

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Paramètres admin">
          <p className="admin-nav-label">Paramètres</p>
          <ul className="admin-nav-list">
            {ADMIN_SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  className={`admin-nav-item${section === id ? " is-active" : ""}`}
                  onClick={() => setSection(id)}
                  aria-current={section === id ? "page" : undefined}
                >
                  <Icon size={18} strokeWidth={2} aria-hidden />
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="admin-panel" aria-labelledby="admin-panel-title">
          <header className="admin-panel-head">
            <h2 id="admin-panel-title">{active.label}</h2>
            <p className="lede">{active.description}</p>
          </header>
          <div className="admin-panel-body">{panelBody}</div>
        </section>
      </div>
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
