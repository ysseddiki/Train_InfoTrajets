import type { DashboardPeriodStats } from "@sncf-alerts/shared";

function formatCorrelation(r: number | null): string {
  if (r == null) return "—";
  const sign = r > 0 ? "+" : "";
  return `${sign}${r.toFixed(2)}`;
}

export function WeatherCorrelationPanel({
  stats,
}: {
  stats: DashboardPeriodStats;
}) {
  const rows = stats.weatherCorrelation ?? [];
  const withWeather = stats.delaysWithWeather ?? 0;
  const corr = stats.precipitationDelayCorrelation ?? null;

  if (withWeather === 0 && rows.length === 0) {
    return (
      <article className="card weather-correlation">
        <h3>Météo et retards</h3>
        <p className="muted">
          Aucun retard avec snapshot météo sur cette période. Les prochains
          événements Navitia/stub enregistreront les conditions à la gare
          surveillée.
        </p>
      </article>
    );
  }

  return (
    <article className="card weather-correlation">
      <header className="admin-stack-card-head">
        <h3>Météo et retards</h3>
      </header>
      <p className="muted field-hint">
        {withWeather} retard{withWeather > 1 ? "s" : ""} avec météo · corrélation
        pluie ↔ durée :{" "}
        <strong>{formatCorrelation(corr)}</strong>
        {corr != null ? " (Pearson)" : " (min. 5 points)"}
      </p>
      <ul className="weather-correlation-list">
        {rows.map((row) => (
          <li key={row.bucket}>
            <span className="weather-correlation-label">{row.label}</span>
            <span className="weather-correlation-count">{row.delayCount}</span>
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
    </article>
  );
}
