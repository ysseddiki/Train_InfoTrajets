import type { DashboardOverview } from "@sncf-alerts/shared";
import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import {
  DeliveriesActivityFeed,
  EventsActivityFeed,
} from "../components/ActivityFeed";
import { JourneyCard } from "../components/JourneyCard";
import {
  LiaisonScopePicker,
  type LiaisonScopeValue,
} from "../components/LiaisonScopePicker";
import { StatCard } from "../components/StatCard";
import { errorMessage } from "../lib/format";

const STORAGE_KEY = "sncf.dashboard.liaisonScope";

function formatIngestSourceLabel(data: DashboardOverview): string {
  const provider = data.stats.ingestProvider;
  const failover = data.stats.zouFailoverEnabled === true;
  const detail = data.lastIngest.detail ?? "";
  const usedZou = /\bzou\b|GTFS-RT|failover/i.test(detail);

  const base =
    provider === "navitia"
      ? "Navitia"
      : provider === "stub"
        ? "Stub"
        : provider;

  if (usedZou && provider !== "stub") {
    return "ZOU (failover)";
  }
  if (failover && provider === "navitia") {
    return `${base} · ZOU secours`;
  }
  return base;
}

function sourceTone(provider: string): string {
  if (provider === "navitia") return "navitia";
  if (provider === "stub") return "stub";
  return "default";
}

function readStoredScope(): LiaisonScopeValue | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    if (v === "all") return "all";
    return v;
  } catch {
    return null;
  }
}

function writeStoredScope(value: LiaisonScopeValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function overviewPath(scope: LiaisonScopeValue | null): string {
  if (scope === "all") return "/v1/dashboard/overview?liaisonId=all";
  if (scope) return `/v1/dashboard/overview?liaisonId=${encodeURIComponent(scope)}`;
  return "/v1/dashboard/overview";
}

export function DashboardPage() {
  const [scope, setScope] = useState<LiaisonScopeValue | null>(() =>
    readStoredScope(),
  );
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextScope: LiaisonScopeValue | null) => {
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<DashboardOverview>(overviewPath(nextScope));
      setData(overview);
      const resolved: LiaisonScopeValue =
        overview.scope === "all"
          ? "all"
          : (overview.selectedLiaisonId ?? "all");
      setScope(resolved);
      writeStoredScope(resolved);
    } catch (err) {
      if (nextScope && nextScope !== "all") {
        try {
          const overview = await apiGet<DashboardOverview>(
            "/v1/dashboard/overview",
          );
          setData(overview);
          const resolved: LiaisonScopeValue =
            overview.scope === "all"
              ? "all"
              : (overview.selectedLiaisonId ?? "all");
          setScope(resolved);
          writeStoredScope(resolved);
          return;
        } catch {
          /* fall through */
        }
      }
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(readStoredScope());
  }, [load]);

  function onScopeChange(next: LiaisonScopeValue) {
    setScope(next);
    writeStoredScope(next);
    void load(next);
  }

  if (error && !data) {
    return (
      <div className="page-enter">
        <h1>Dashboard</h1>
        <p className="error">
          API indisponible. Vérifiez que <code>apps/api</code> tourne.
        </p>
        <pre>{error}</pre>
        <button type="button" className="secondary" onClick={() => void load(scope)}>
          Réessayer
        </button>
      </div>
    );
  }

  if (!data || scope === null) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  const p24 = data.stats.periods.last24h;
  const p7 = data.stats.periods.last7d;
  const p30 = data.stats.periods.last30d;
  const scopeHint =
    data.scope === "all" ? "toutes les liaisons" : "liaison sélectionnée";
  const sourceLabel = formatIngestSourceLabel(data);

  return (
    <div
      className={`page-enter dash-page${loading ? " is-refreshing" : ""}`}
    >
      <div
        className="dash-head dash-reveal"
        style={{ "--reveal-delay": "0ms" } as CSSProperties}
      >
        <div>
          <p className="eyebrow">Ops room · lecture</p>
          <h1>Dashboard</h1>
        </div>
        <div className="dash-head-actions">
          <LiaisonScopePicker
            options={data.availableLiaisons}
            value={scope}
            onChange={onScopeChange}
          />
          <button
            type="button"
            className="btn-icon secondary"
            onClick={() => void load(scope)}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : undefined} />
            <span className="btn-label">Actualiser</span>
          </button>
        </div>
      </div>

      <section
        className="dash-section dash-reveal"
        style={{ "--reveal-delay": "60ms" } as CSSProperties}
      >
        <h2 className="dash-section-title">Statut en cours</h2>
        <p className="source-pill-row">
          <span
            className={`source-pill source-${sourceTone(data.stats.ingestProvider)}`}
            title={data.lastIngest.detail ?? undefined}
          >
            Source · {sourceLabel}
          </span>
        </p>
        <div className="liaison-dash-list">
          {data.liaisons.map((liaison) => (
            <div key={liaison.id} className="liaison-dash-block">
              {data.scope === "all" && (
                <h2 className="liaison-dash-title">{liaison.displayName}</h2>
              )}
              <div className="grid journey-grid dash-hero-grid">
                <JourneyCard title="Aller" card={liaison.outbound} />
                <JourneyCard title="Retour" card={liaison.inbound} />
              </div>
            </div>
          ))}
          {data.liaisons.length === 0 && (
            <p className="muted">Aucune liaison configurée.</p>
          )}
        </div>
      </section>

      <section
        className="dash-section dash-reveal"
        style={{ "--reveal-delay": "120ms" } as CSSProperties}
      >
        <h2 className="dash-section-title">Indicateurs 24 h</h2>
        <p className="muted section-hint">Vue rapide · {scopeHint}</p>
        <div className="stat-card-grid">
          <StatCard label="Événements" value={p24.events} hint="détectés" />
          <StatCard
            label="Retards"
            value={p24.delays}
            hint={
              p24.avgDelayMinutes != null
                ? `moy. ${p24.avgDelayMinutes} min`
                : undefined
            }
            tone={p24.delays > 0 ? "warn" : "default"}
          />
          <StatCard
            label="Suppressions"
            value={p24.cancellations}
            tone={p24.cancellations > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Notifs envoyées"
            value={p24.deliveriesSent}
            hint={
              p24.deliveriesFailed > 0
                ? `${p24.deliveriesFailed} échec${p24.deliveriesFailed > 1 ? "s" : ""}`
                : "0 échec"
            }
            tone={p24.deliveriesFailed > 0 ? "danger" : "accent"}
          />
        </div>
        <div className="stat-card-grid stat-card-grid-secondary">
          <StatCard
            label="7 jours"
            value={p7.events}
            hint={`${p7.delays} retards · ${p7.deliveriesSent} notifs`}
            compact
          />
          <StatCard
            label="30 jours"
            value={p30.events}
            hint={`${p30.delays} retards · ${p30.deliveriesSent} notifs`}
            compact
          />
          <StatCard
            label="Retard max 24 h"
            value={p24.maxDelayMinutes != null ? `${p24.maxDelayMinutes} min` : "—"}
            compact
          />
        </div>
        <ActivityHeatmap
          days={data.activityHeatmap ?? []}
          scopeHint={scopeHint}
        />
      </section>

      <section
        className="dash-section dash-reveal"
        style={{ "--reveal-delay": "180ms" } as CSSProperties}
      >
        <div className="dash-section-head">
          <h2 className="dash-section-title">Activité récente</h2>
          <Link to="/notifications">Historique complet →</Link>
        </div>
        <div className="activity-bento">
          <div className="card activity-panel">
            <h3>Événements</h3>
            <EventsActivityFeed events={data.recentEvents} />
          </div>
          <div className="card activity-panel">
            <h3>Livraisons</h3>
            <DeliveriesActivityFeed deliveries={data.recentDeliveries} />
          </div>
        </div>
      </section>
    </div>
  );
}
