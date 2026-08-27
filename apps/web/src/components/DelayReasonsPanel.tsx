import type { DashboardPeriodStats } from "@sncf-alerts/shared";

export function DelayReasonsPanel({
  stats,
}: {
  stats: DashboardPeriodStats;
}) {
  const rows = stats.delayReasons ?? [];
  const withoutReason = stats.delaysWithoutReason ?? 0;
  const withReason = rows.reduce((sum, row) => sum + row.count, 0);

  if (withReason === 0 && withoutReason === 0) {
    return (
      <article className="card weather-correlation delay-reasons">
        <h3>Motifs de retard</h3>
        <p className="muted">
          Aucun retard sur cette période. Les motifs Navitia apparaîtront ici
          quand un retard est signalé avec une cause.
        </p>
      </article>
    );
  }

  return (
    <article className="card weather-correlation delay-reasons">
      <header className="admin-stack-card-head">
        <h3>Motifs de retard</h3>
      </header>
      <p className="muted field-hint">
        {withReason} retard{withReason > 1 ? "s" : ""} avec motif
        {withoutReason > 0 ? (
          <>
            {" · "}
            <strong>{withoutReason}</strong> sans motif
          </>
        ) : null}
      </p>
      {rows.length === 0 ? (
        <p className="muted">
          Aucun motif renseigné par Navitia sur cette période.
        </p>
      ) : (
        <ul className="weather-correlation-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span className="weather-correlation-label">{row.label}</span>
              <span className="weather-correlation-count">{row.count}</span>
              <span className="muted">
                {row.avgDelayMinutes != null
                  ? `moy. ${row.avgDelayMinutes} min`
                  : "moy. —"}
                {" · "}
                {row.sharePercent} %
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
