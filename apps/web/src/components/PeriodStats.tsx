import type { DashboardPeriodStats } from "@sncf-alerts/shared";

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

  return (
    <article className="stats-period">
      <h3>{label}</h3>
      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-value">{stats.events}</span>
          <span className="kpi-label">Événements</span>
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
          <span className="muted">Retard moyen</span> <strong>{avg}</strong>
          {" · "}
          <span className="muted">Max</span> <strong>{max}</strong>
        </p>
      </div>
    </article>
  );
}
