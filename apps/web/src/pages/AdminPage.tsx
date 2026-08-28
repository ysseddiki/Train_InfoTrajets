import { useSearchParams } from "react-router-dom";
import type {
  ApiQuotaStatus,
  LiaisonConfig,
  RecipientsConfig,
  Station,
  TeamsConfigPublic,
  UserRole,
} from "@sncf-alerts/shared";
import {
  Bug,
  Database,
  Eraser,
  KeyRound,
  LogOut,
  MapPin,
  Plus,
  Radio,
  Route,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { apiGet, apiSend } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AccessPanel, UsersPanel } from "../components/AccessUsersPanels";
import { AdminAccountPanel } from "../components/AdminAccountPanel";
import { ClearStatsPanel } from "../components/ClearStatsPanel";
import { CreateStationDialog } from "../components/CreateStationDialog";
import { DebugPanel } from "../components/DebugPanel";
import { IngestConfigPanel } from "../components/IngestConfigPanel";
import { LiaisonForm } from "../components/LiaisonForm";
import { QuotaPanel } from "../components/QuotaPanel";
import { SmtpConfigPanel } from "../components/SmtpConfigPanel";
import { StationsPanel } from "../components/StationsPanel";
import { errorMessage } from "../lib/format";

type AdminSectionId =
  | "liaisons"
  | "stations"
  | "alerts"
  | "data"
  | "debug"
  | "clear-stats"
  | "users"
  | "access"
  | "account";

const VALID_SECTIONS: AdminSectionId[] = [
  "liaisons",
  "stations",
  "alerts",
  "data",
  "debug",
  "clear-stats",
  "users",
  "access",
  "account",
];

type AdminNavItem = {
  id: AdminSectionId;
  label: string;
  description: string;
  icon: typeof Route;
  tone?: "danger";
};

type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "watch",
    label: "Surveillance",
    items: [
      {
        id: "liaisons",
        label: "Liaisons",
        description: "Aller / retour, fenêtres et seuil.",
        icon: Route,
      },
      {
        id: "stations",
        label: "Gares",
        description: "Catalogue Navitia.",
        icon: MapPin,
      },
    ],
  },
  {
    id: "notify",
    label: "Alertes",
    items: [
      {
        id: "alerts",
        label: "Envoi",
        description: "Destinataires, SMTP, Teams.",
        icon: Radio,
      },
    ],
  },
  {
    id: "ops",
    label: "Données & ops",
    items: [
      {
        id: "data",
        label: "Ingest",
        description: "Source, quota.",
        icon: Database,
      },
      {
        id: "debug",
        label: "Debug",
        description: "Logs et stub.",
        icon: Bug,
      },
      {
        id: "clear-stats",
        label: "Clear stats",
        description: "Purge événements / livraisons.",
        icon: Eraser,
        tone: "danger",
      },
    ],
  },
  {
    id: "security",
    label: "Sécurité",
    items: [
      {
        id: "users",
        label: "Comptes",
        description: "Comptes locaux et rôles.",
        icon: Users,
      },
      {
        id: "access",
        label: "Accès",
        description: "Mode visiteur.",
        icon: Shield,
      },
      {
        id: "account",
        label: "Compte",
        description: "Mot de passe du compte connecté.",
        icon: KeyRound,
      },
    ],
  },
];

const EDITOR_SECTION_IDS = new Set<AdminSectionId>(["liaisons", "account"]);

function navForRole(role: UserRole): AdminNavGroup[] {
  if (role === "admin") return ADMIN_NAV;
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => EDITOR_SECTION_IDS.has(item.id)),
  })).filter((group) => group.items.length > 0);
}

function AdminConsole({
  username,
  role,
  onLogout,
}: {
  username: string;
  role: UserRole;
  onLogout: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const section: AdminSectionId = VALID_SECTIONS.includes(
    sectionParam as AdminSectionId,
  )
    ? (sectionParam as AdminSectionId)
    : "liaisons";
  const setSection = (id: AdminSectionId) => {
    setSearchParams({ section: id });
  };
  const [createStationOpen, setCreateStationOpen] = useState(false);
  const nav = navForRole(role);
  const sections = nav.flatMap((g) => g.items);
  const isEditor = role === "liaison_editor";
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
  const [ready, setReady] = useState(false);

  const selected =
    liaisons.find((l) => l.id === selectedId) ?? liaisons[0] ?? null;

  useEffect(() => {
    const allowed = navForRole(role).flatMap((g) => g.items).map((s) => s.id);
    if (!allowed.includes(section)) {
      setSection("liaisons");
    }
  }, [role, section]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (isEditor) {
          const [list, st] = await Promise.all([
            apiGet<LiaisonConfig[]>("/v1/admin/liaisons"),
            apiGet<Station[]>("/v1/admin/stations"),
          ]);
          if (cancelled) return;
          setLiaisons(list);
          setStations(st);
          setSelectedId((prev) => prev ?? list[0]?.id ?? null);
          setReady(true);
          return;
        }
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
        setReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditor]);

  useEffect(() => {
    if (section !== "data") return;
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

    const invalid = emails.filter(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    );
    if (invalid.length > 0) {
      setRecipientsMsg({
        text: `Emails invalides : ${invalid.join(", ")}`,
        ok: false,
      });
      return;
    }

    try {
      await apiSend("/v1/admin/channels/recipients", "PUT", { emails });
      setRecipients({ emails });
      setRecipientsMsg({ text: "Destinataires enregistrés", ok: true });
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
          l.id === updated.id ? updated : { ...l, isDefault: false },
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
        <button
          type="button"
          className="secondary"
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!ready) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  if ((section === "liaisons" || section === "debug") && !selected) {
    return (
      <div className="page-enter admin-empty">
        <p className="muted">Aucune liaison — créez-en une pour continuer.</p>
        <button type="button" onClick={() => void addLiaison()}>
          Ajouter une liaison
        </button>
      </div>
    );
  }

  const active = sections.find((s) => s.id === section) ?? sections[0];

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
                  aria-selected={l.id === selected!.id}
                  className={`liaison-chip${l.id === selected!.id ? " is-active" : ""}`}
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
              <button
                type="button"
                className="secondary"
                onClick={() => void addLiaison()}
              >
                <Plus size={16} strokeWidth={2} aria-hidden />
                Ajouter
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void makeDefaultLiaison()}
                disabled={selected!.isDefault}
                title={
                  selected!.isDefault
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
              role="alert"
            >
              {liaisonActionMsg.text}
            </p>
          )}
          <LiaisonForm
            liaison={selected!}
            stations={stations}
            onCreateStation={() => setCreateStationOpen(true)}
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
    case "alerts":
      panelBody =
        recipients && teams ? (
        <div className="admin-stack">
          <form
            className="card admin-stack-card"
            onSubmit={(e) => void saveRecipients(e)}
          >
            <header className="admin-stack-card-head">
              <h3>Destinataires</h3>
            </header>
            <label>
              Emails (un par ligne)
              <textarea
                name="emails"
                rows={4}
                defaultValue={recipients.emails.join("\n")}
                aria-describedby="recipients-hint"
              />
            </label>
            <p id="recipients-hint" className="muted field-hint">
              Une adresse par ligne. Format email valide requis.
            </p>
            <div className="admin-stack-actions">
              <button type="submit">Enregistrer</button>
            </div>
            {recipientsMsg && (
              <p
                className={`form-msg ${recipientsMsg.ok ? "ok" : "error"}`}
                role="alert"
              >
                {recipientsMsg.text}
              </p>
            )}
          </form>

          <div className="admin-stack-grid">
            <SmtpConfigPanel onTest={() => testEmail()} testMsg={emailMsg} />
            <article className="card admin-stack-card">
              <header className="admin-stack-card-head">
                <h3>Teams</h3>
              </header>
              <ul className="admin-status-list">
                <li>
                  <span className="muted">Activé</span>
                  <span
                    className={`pill ${teams.enabled ? "pill-ok" : "pill-ignored"}`}
                  >
                    {teams.enabled ? "oui" : "non"}
                  </span>
                </li>
                <li>
                  <span className="muted">Webhook</span>
                  <span
                    className={`pill ${teams.webhookConfigured ? "pill-ok" : "pill-ignored"}`}
                  >
                    {teams.webhookConfigured ? "configuré" : "manquant"}
                  </span>
                </li>
              </ul>
              <div className="admin-stack-actions">
                <button type="button" onClick={() => void testTeams()}>
                  Test Teams
                </button>
              </div>
              {teamsMsg && (
                <p
                  className={teamsMsg.ok ? "ok" : "error"}
                  role="alert"
                >
                  {teamsMsg.text}
                </p>
              )}
            </article>
          </div>
        </div>
        ) : (
          <p className="muted">Chargement…</p>
        );
      break;
    case "data":
      panelBody = quota ? (
        <div className="admin-stack">
          <QuotaPanel quota={quota} />
          <IngestConfigPanel />
        </div>
      ) : (
        <p className="muted">Chargement…</p>
      );
      break;
    case "clear-stats":
      panelBody = <ClearStatsPanel />;
      break;
    case "debug":
      panelBody = <DebugPanel liaisons={liaisons} />;
      break;
    case "account":
      panelBody = <AdminAccountPanel username={username} />;
      break;
    case "users":
      panelBody = <UsersPanel />;
      break;
    case "access":
      panelBody = <AccessPanel />;
      break;
  }

  if (!active) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  return (
    <div className="page-enter admin-shell">
      <header className="admin-shell-head">
        <div>
          <p className="eyebrow">SNCF-Alerts</p>
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
          {nav.map((group) => (
            <div key={group.id} className="admin-nav-group">
              <p className="admin-nav-label">{group.label}</p>
              <ul className="admin-nav-list" role="tablist">
                {group.items.map(({ id, label, icon: Icon, tone }) => (
                  <li key={id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={section === id}
                      tabIndex={section === id ? 0 : -1}
                      className={[
                        "admin-nav-item",
                        section === id ? "is-active" : "",
                        tone === "danger" ? "is-danger" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSection(id)}
                      onKeyDown={(e) => {
                        const items = sections;
                        const currentIndex = items.findIndex(
                          (s) => s.id === section,
                        );
                        let nextIndex = currentIndex;

                        switch (e.key) {
                          case "ArrowDown":
                          case "ArrowRight":
                            e.preventDefault();
                            nextIndex = (currentIndex + 1) % items.length;
                            break;
                          case "ArrowUp":
                          case "ArrowLeft":
                            e.preventDefault();
                            nextIndex =
                              (currentIndex - 1 + items.length) % items.length;
                            break;
                          case "Home":
                            e.preventDefault();
                            nextIndex = 0;
                            break;
                          case "End":
                            e.preventDefault();
                            nextIndex = items.length - 1;
                            break;
                          default:
                            return;
                        }

                        const next = items[nextIndex];
                        if (next) {
                          setSection(next.id);
                          e.currentTarget
                            .closest(".admin-nav")
                            ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                            [nextIndex]?.focus();
                        }
                      }}
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden />
                      <span>{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <section className="admin-panel" aria-labelledby="admin-panel-title">
          <header className="admin-panel-head">
            <h2 id="admin-panel-title">{active.label}</h2>
            <p className="lede">{active.description}</p>
          </header>
          <div className="admin-panel-body">{panelBody}</div>
        </section>
      </div>
      {createStationOpen ? (
        <CreateStationDialog
          onCreated={(s) =>
            setStations((prev) =>
              [...prev, s].sort((a, b) => a.label.localeCompare(b.label, "fr")),
            )
          }
          onClose={() => setCreateStationOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function AdminPage() {
  const { me, logout } = useAuth();
  if (!me) return null;
  return (
    <AdminConsole
      username={me.username}
      role={me.role}
      onLogout={() => void logout()}
    />
  );
}
