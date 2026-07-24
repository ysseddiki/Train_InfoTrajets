import type { DashboardOverview } from "@sncf-alerts/shared";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { DeliveriesTable } from "../components/DeliveriesTable";
import { EventsTable } from "../components/EventsTable";
import { JourneyCard } from "../components/JourneyCard";
import { PeriodStats } from "../components/PeriodStats";
import { ingestClass } from "../lib/boardStatus";
import { errorMessage, formatRelative, formatWhen } from "../lib/format";

function ingestLabel(status: string | null): string {
  if (status === "ok") return "Ingest OK";
  if (status === "error") return "Ingest en erreur";
  if (status === "skipped") return "Ingest ignoré (hors fenêtre)";
  return "Aucun ingest encore";
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<DashboardOverview>("/v1/dashboard/overview");
      setData(overview);
    } catch (err) {
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) {
    return (
      <div className="page-enter">
        <h1>Dashboard</h1>
        <p className="error">
          API indisponible. Vérifiez que <code>apps/api</code> tourne.
        </p>
        <pre>{error}</pre>
        <button type="button" className="secondary" onClick={() => void load()}>
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  const ingestStatus = data.lastIngest?.status ?? null;
  const periods = data.stats.periods;

  return (
    <div className="page-enter">
      <div className="dash-head">
        <div>
          <p className="eyebrow">Ops · lecture</p>
          <h1>Dashboard</h1>
          <p className="lede">
            État en cours des trajets Aller / Retour, puis historique issu de
            l’ingest.
          </p>
        </div>
        <button
          type="button"
          className="btn-icon secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : undefined} />
          Actualiser
        </button>
      </div>

      <section className="dash-section">
        <h2 className="dash-section-title">Statut en cours</h2>
        <div className={ingestClass(ingestStatus)}>
          <div>
            <strong>{ingestLabel(ingestStatus)}</strong>
            <p>
              Provider <code>{data.stats.ingestProvider}</code> ·{" "}
              {formatWhen(data.lastIngest?.at ?? null)} (
              {formatRelative(data.lastIngest?.at ?? null)})
            </p>
          </div>
          <p className="ingest-detail">{data.lastIngest?.detail ?? "—"}</p>
        </div>
        <div className="grid journey-grid">
          <JourneyCard title="Aller" card={data.journeys.outbound} />
          <JourneyCard title="Retour" card={data.journeys.inbound} />
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Statistiques</h2>
        <p className="muted section-hint">
          Agrégats sur les événements détectés et les notifications envoyées.
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
