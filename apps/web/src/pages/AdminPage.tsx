import type {
  ApiQuotaStatus,
  JourneyDirection,
  LiaisonConfig,
  RecipientsConfig,
  SmtpConfigPublic,
  Station,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import {
  Bug,
  Database,
  Eraser,
  Gauge,
  LogOut,
  Mail,
  MapPin,
  Plus,
  Radio,
  Route,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { apiGet, apiSend } from "../api/client";
import { Link } from "react-router-dom";
import { ClearStatsPanel } from "../components/ClearStatsPanel";
import { IngestConfigPanel } from "../components/IngestConfigPanel";
import { LiaisonForm } from "../components/LiaisonForm";
import { QuotaPanel } from "../components/QuotaPanel";
import { StationsPanel } from "../components/StationsPanel";
import { errorMessage } from "../lib/format";

type AdminMe = { username: string };

type AdminSectionId =
  | "liaisons"
  | "stations"
  | "ingest"
  | "recipients"
  | "channels"
  | "quota"
  | "clear-stats"
  | "debug";

const ADMIN_SECTIONS: {
  id: AdminSectionId;
  label: string;
  description: string;
  icon: typeof Route;
}[] = [
  {
    id: "liaisons",
    label: "Liaisons",
    description: "Paires Aller/Retour surveillées (gares, fenêtres, jours).",
    icon: Route,
  },
  {
    id: "stations",
    label: "Gares",
    description: "Catalogue des gares (nom + id Navitia) pour les liaisons.",
    icon: MapPin,
  },
  {
    id: "ingest",
    label: "Ingest",
    description: "Source de données (stub / Navitia / PRIM) et token.",
    icon: Database,
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
    id: "quota",
    label: "Quota API",
    description: "Consommation journalière des appels Navitia (limite 5000).",
    icon: Gauge,
  },
  {
    id: "clear-stats",
    label: "Clear stats",
    description:
      "Effacer les stats dashboard (retards, suppressions, notifs) par source.",
    icon: Eraser,
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
  const [section, setSection] = useState<AdminSectionId>("liaisons");
  const [liaisons, setLiaisons] = useState<LiaisonConfig[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientsConfig | null>(null);
  const [smtp, setSmtp] = useState<SmtpConfigPublic | null>(null);
  const [teams, setTeams] = useState<TeamsConfigPublic | null>(null);
  const [quota, setQuota] = useState<ApiQuotaStatus | null>(null);
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
  const [liaisonActionMsg, setLiaisonActionMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [stubDirection, setStubDirection] =
    useState<JourneyDirection>("outbound");
  const [stubLiaisonId, setStubLiaisonId] = useState<string>("");
  const [stubDelay, setStubDelay] = useState(15);

  const selected =
    liaisons.find((l) => l.id === selectedId) ?? liaisons[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, st, r, s, t, q] = await Promise.all([
          apiGet<LiaisonConfig[]>("/v1/admin/liaisons"),
          apiGet<Station[]>("/v1/admin/stations"),
          apiGet<RecipientsConfig>("/v1/admin/channels/recipients"),
          apiGet<SmtpConfigPublic>("/v1/admin/channels/smtp"),
          apiGet<TeamsConfigPublic>("/v1/admin/channels/teams"),
          apiGet<ApiQuotaStatus>("/v1/admin/quota"),
        ]);
        if (cancelled) return;
        setLiaisons(list);
        setStations(st);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
        setStubLiaisonId((prev) => prev || list[0]?.id || "");
        setRecipients(r);
        setSmtp(s);
        setTeams(t);
        setQuota(q);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (section !== "quota") return;
    let cancelled = false;
    void (async () => {
      try {
        const q = await apiGet<ApiQuotaStatus>("/v1/admin/quota");
        if (!cancelled) setQuota(q);
      } catch {
        /* keep last known */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);

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
        liaisonId: stubLiaisonId || undefined,
        delayMinutes: stubDelay,
        kind: "delay",
      });
      setStubMsg({
        text: "Événement injecté — ouvre le Dashboard et actualise",
        ok: true,
      });
    } catch {
      setStubMsg({ text: "Échec injection", ok: false });
    }
  }

  async function seedStubHistory() {
    try {
      const res = await apiSend<{ ok: boolean; created: number; months: number }>(
        "/v1/admin/debug/stub-history",
        "POST",
        {
          months: 6,
          liaisonId: stubLiaisonId || undefined,
        },
      );
      setStubMsg({
        text: `Historique stub : ${res.created} événements sur ${res.months} mois (sans notifs)`,
        ok: true,
      });
    } catch {
      setStubMsg({ text: "Échec simulation historique", ok: false });
    }
  }

  async function addLiaison() {
    setLiaisonActionMsg(null);
    try {
      const created = await apiSend<LiaisonConfig>("/v1/admin/liaisons", "POST");
      setLiaisons((prev) => [...prev, created]);
      setSelectedId(created.id);
      setStubLiaisonId(created.id);
      setLiaisonActionMsg({ text: "Liaison ajoutée", ok: true });
    } catch {
      setLiaisonActionMsg({ text: "Impossible d’ajouter", ok: false });
    }
  }

  async function removeLiaison() {
    if (!selected || liaisons.length <= 1) return;
    if (!window.confirm(`Supprimer « ${selected.displayName} » ?`)) return;
    setLiaisonActionMsg(null);
    try {
      await apiSend(`/v1/admin/liaisons/${selected.id}`, "DELETE");
      const next = await apiGet<LiaisonConfig[]>("/v1/admin/liaisons");
      setLiaisons(next);
      setSelectedId(next[0]?.id ?? null);
      setStubLiaisonId(next[0]?.id ?? "");
      setLiaisonActionMsg({ text: "Liaison supprimée", ok: true });
    } catch {
      setLiaisonActionMsg({
        text: "Suppression impossible (au moins une liaison requise)",
        ok: false,
      });
    }
  }

  async function makeDefaultLiaison() {
    if (!selected || selected.isDefault) return;
    setLiaisonActionMsg(null);
    try {
      const updated = await apiSend<LiaisonConfig>(
        `/v1/admin/liaisons/${selected.id}/default`,
        "PUT",
      );
      setLiaisons((prev) =>
        prev.map((l) =>
          l.id === updated.id
            ? updated
            : { ...l, isDefault: false },
        ),
      );
      setLiaisonActionMsg({
        text: "Liaison définie par défaut sur le dashboard",
        ok: true,
      });
    } catch {
      setLiaisonActionMsg({ text: "Impossible de définir le défaut", ok: false });
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

  if (
    !recipients ||
    !smtp ||
    !teams ||
    !quota ||
    liaisons.length === 0 ||
    !selected
  ) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  const active = ADMIN_SECTIONS.find((s) => s.id === section)!;

  let panelBody: ReactNode;
  switch (section) {
    case "liaisons":
      panelBody = (
        <div className="liaison-manager">
          <div className="liaison-toolbar">
            <div className="liaison-picker" role="tablist" aria-label="Liaisons">
              {liaisons.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={l.id === selected.id}
                  className={`liaison-chip${l.id === selected.id ? " is-active" : ""}`}
                  onClick={() => setSelectedId(l.id)}
                >
                  {l.displayName}
                  {l.isDefault && (
                    <span className="liaison-chip-default">défaut</span>
                  )}
                </button>
              ))}
            </div>
            <div className="liaison-actions">
              <button type="button" className="secondary" onClick={() => void addLiaison()}>
                <Plus size={16} strokeWidth={2} aria-hidden />
                Ajouter
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void makeDefaultLiaison()}
                disabled={selected.isDefault}
                title={
                  selected.isDefault
                    ? "Déjà la liaison par défaut"
                    : "Ouvrir cette liaison par défaut sur le dashboard"
                }
              >
                Définir par défaut
              </button>
              <button
                type="button"
                className="secondary danger-ghost"
                onClick={() => void removeLiaison()}
                disabled={liaisons.length <= 1}
                title={
                  liaisons.length <= 1
                    ? "Au moins une liaison est requise"
                    : "Supprimer cette liaison"
                }
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden />
                Supprimer
              </button>
            </div>
          </div>
          {liaisonActionMsg && (
            <p
              className={`form-msg ${liaisonActionMsg.ok ? "ok" : "error"}`}
            >
              {liaisonActionMsg.text}
            </p>
          )}
          <LiaisonForm
            liaison={selected}
            stations={stations}
            onCreateStation={() => setSection("stations")}
            onSaved={(next) => {
              setLiaisons((prev) =>
                prev.map((l) => (l.id === next.id ? next : l)),
              );
            }}
          />
        </div>
      );
      break;
    case "stations":
      panelBody = (
        <StationsPanel stations={stations} onChange={setStations} />
      );
      break;
    case "ingest":
      panelBody = <IngestConfigPanel />;
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
    case "quota":
      panelBody = <QuotaPanel quota={quota} />;
      break;
    case "clear-stats":
      panelBody = <ClearStatsPanel />;
      break;
    case "debug":
      panelBody = (
        <section className="card debug">
          <p className="muted">
            Injecte un événement stub (matching + file notifs). Puis ouvre le{" "}
            <Link to="/">Dashboard</Link> et actualise pour voir le statut
            Aller/Retour.
          </p>
          <label>
            Liaison
            <select
              value={stubLiaisonId}
              onChange={(e) => setStubLiaisonId(e.target.value)}
            >
              {liaisons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.displayName}
                </option>
              ))}
            </select>
          </label>
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
          <hr className="admin-sep" />
          <p className="muted">
            Remplit ~6 mois d’événements stub (retards / suppressions) pour la
            heatmap et les stats. <strong>Sans notifications</strong>. Idempotent
            si relancé.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => void seedStubHistory()}
          >
            Simuler 6 mois d’historique stub
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
