import type {
  ApiQuotaStatus,
  LiaisonConfig,
  RecipientsConfig,
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
import { ClearStatsPanel } from "../components/ClearStatsPanel";
import { DebugPanel } from "../components/DebugPanel";
import { IngestConfigPanel } from "../components/IngestConfigPanel";
import { LiaisonForm } from "../components/LiaisonForm";
import { QuotaPanel } from "../components/QuotaPanel";
import { SmtpConfigPanel } from "../components/SmtpConfigPanel";
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
    description:
      "Logs API ingest (onglet par source) et injection d’événements stub.",
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
  const [liaisonActionMsg, setLiaisonActionMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const selected =
    liaisons.find((l) => l.id === selectedId) ?? liaisons[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, st, r, t, q] = await Promise.all([
          apiGet<LiaisonConfig[]>("/v1/admin/liaisons"),
          apiGet<Station[]>("/v1/admin/stations"),
          apiGet<RecipientsConfig>("/v1/admin/channels/recipients"),
          apiGet<TeamsConfigPublic>("/v1/admin/channels/teams"),
          apiGet<ApiQuotaStatus>("/v1/admin/quota"),
        ]);
        if (cancelled) return;
        setLiaisons(list);
        setStations(st);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
        setRecipients(r);
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

  async function addLiaison() {
    setLiaisonActionMsg(null);
    try {
      const created = await apiSend<LiaisonConfig>("/v1/admin/liaisons", "POST");
      setLiaisons((prev) => [...prev, created]);
      setSelectedId(created.id);
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

  if (!recipients || !teams || !quota) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  if ((section === "liaisons" || section === "debug") && !selected) {
    return (
      <div className="page-enter">
        <p className="muted">Aucune liaison — créez-en une depuis Admin.</p>
        <button type="button" onClick={() => void addLiaison()}>
          Ajouter une liaison
        </button>
      </div>
    );
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
          <SmtpConfigPanel onTest={() => testEmail()} testMsg={emailMsg} />
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
      panelBody = <DebugPanel liaisons={liaisons} />;
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
