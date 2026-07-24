import type { DashboardOverview } from "@sncf-alerts/shared";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { DeliveriesTable } from "../components/DeliveriesTable";
import { EventsTable } from "../components/EventsTable";
import { JourneyCard } from "../components/JourneyCard";
import {
  LiaisonScopePicker,
  type LiaisonScopeValue,
} from "../components/LiaisonScopePicker";
import { PeriodStats } from "../components/PeriodStats";
import { errorMessage } from "../lib/format";

const STORAGE_KEY = "sncf.dashboard.liaisonScope";

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
      // Liaison stockée introuvable → retomber sur le défaut serveur
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

  const periods = data.stats.periods;

  return (
    <div className="page-enter">
      <div className="dash-head">
        <div>
          <p className="eyebrow">Ops · lecture</p>
          <h1>Dashboard</h1>
          <p className="lede">
            État en cours des liaisons Aller / Retour, puis historique issu de
            l’ingest.
          </p>
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
          >
            <RefreshCw size={16} className={loading ? "spin" : undefined} />
            Actualiser
          </button>
        </div>
      </div>

      <section className="dash-section">
        <h2 className="dash-section-title">Statut en cours</h2>
        <div className="liaison-dash-list">
          {data.liaisons.map((liaison) => (
            <div key={liaison.id} className="liaison-dash-block">
              {data.scope === "all" && (
                <h2 className="liaison-dash-title">{liaison.displayName}</h2>
              )}
              <div className="grid journey-grid">
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

      <section className="dash-section">
        <h2 className="dash-section-title">Statistiques</h2>
        <p className="muted section-hint">
          Agrégats
          {data.scope === "all"
            ? " (toutes les liaisons)"
            : " (liaison sélectionnée)"}{" "}
          sur les événements détectés et les notifications envoyées.
        </p>
        <div className="stats-grid">
          <PeriodStats label="24 heures" stats={periods.last24h} />
          <PeriodStats label="7 jours" stats={periods.last7d} />
          <PeriodStats label="30 jours" stats={periods.last30d} />
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">Activité récente</h2>
          <Link to="/notifications">Historique complet →</Link>
        </div>
        <div className="activity-grid">
          <div className="card">
            <h3>Événements ingest</h3>
            <EventsTable events={data.recentEvents} showSource />
          </div>
          <div className="card">
            <h3>Livraisons</h3>
            <DeliveriesTable deliveries={data.recentDeliveries} />
          </div>
        </div>
      </section>
    </div>
  );
}
