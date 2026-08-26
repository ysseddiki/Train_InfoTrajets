import type { DashboardPeriodStats } from "@sncf-alerts/shared";
import { formatDurationMinutes } from "../lib/format";

export function PeriodStats({
  label,
  stats,
}: {
  label: string;
  stats: DashboardPeriodStats;
}) {
  const avg =
    stats.avgDelayMinutes == null ? "—" : `${stats.avgDelayMinutes} min`;
  const max =
    stats.maxDelayMinutes == null ? "—" : `${stats.maxDelayMinutes} min`;
  const total = formatDurationMinutes(stats.totalDelayMinutes);

  return (
    <article className="stats-period">
      <h3>{label}</h3>
      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-value">{stats.events}</span>
          <span className="kpi-label">Événements</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{stats.onTimeTrains ?? 0}</span>
          <span className="kpi-label">À l’heure</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{stats.delays}</span>
          <span className="kpi-label">Retards</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{stats.cancellations}</span>
          <span className="kpi-label">Suppressions</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{stats.deliveriesSent}</span>
          <span className="kpi-label">Notifs envoyées</span>
        </div>
        <div className="kpi">
          <span
            className={`kpi-value${stats.deliveriesFailed > 0 ? " kpi-bad" : ""}`}
          >
            {stats.deliveriesFailed}
          </span>
          <span className="kpi-label">Échecs</span>
        </div>
      </div>
      <div className="stats-detail">
        <p>
          <span className="muted">Aller</span>{" "}
          <strong>{stats.byDirection.outbound}</strong>
          {" · "}
          <span className="muted">Retour</span>{" "}
          <strong>{stats.byDirection.inbound}</strong>
          {stats.byDirection.unmatched > 0 && (
            <>
              {" · "}
              <span className="muted">Non matchés</span>{" "}
              <strong>{stats.byDirection.unmatched}</strong>
            </>
          )}
        </p>
        <p>
          <span className="muted">Cumul</span> <strong>{total}</strong>
          {" · "}
          <span className="muted">Retard moyen</span> <strong>{avg}</strong>
          {" · "}
          <span className="muted">Max</span> <strong>{max}</strong>
        </p>
        {(stats.delayReasons?.length > 0 || (stats.delaysWithoutReason ?? 0) > 0) && (
          <p>
            <span className="muted">Motifs</span>{" "}
            {(stats.delayReasons ?? []).length === 0 ? (
              <strong>non renseignés</strong>
            ) : (
              (stats.delayReasons ?? []).map((r, i) => (
                <span key={r.key}>
                  {i > 0 ? " · " : null}
                  <strong>{r.label}</strong> ({r.count})
                </span>
              ))
            )}
            {(stats.delaysWithoutReason ?? 0) > 0 ? (
              <>
                {(stats.delayReasons ?? []).length > 0 ? " · " : null}
                <span className="muted">sans motif</span>{" "}
                <strong>{stats.delaysWithoutReason}</strong>
              </>
            ) : null}
          </p>
        )}
      </div>
    </article>
  );
}
