import type { ApiQuotaStatus } from "@sncf-alerts/shared";

function barTone(percent: number, exhausted: boolean): string {
  if (exhausted || percent >= 90) return "quota-fill-high";
  if (percent >= 70) return "quota-fill-mid";
  return "quota-fill-ok";
}

export function QuotaPanel({ quota }: { quota: ApiQuotaStatus }) {
  const fill = Math.min(100, Math.max(0, quota.percent));
  const tone = barTone(quota.percent, quota.exhausted);

  return (
    <div className="card quota-panel">
      <div className="quota-head">
        <div>
          <h3>Navitia / SNCF open data</h3>
          <p className="muted">
            Compteur du jour <strong>{quota.day}</strong> (Europe/Paris) ·
            provider <code>{quota.provider}</code>
          </p>
        </div>
        <p className="quota-used">
          <strong>{quota.used}</strong>
          <span className="muted"> / {quota.limit}</span>
        </p>
      </div>

      <div
        className="quota-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
        aria-label="Utilisation du quota API journalier"
      >
        <div
          className={`quota-bar-fill ${tone}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="quota-bar-caption muted">
        {quota.percent}% utilisé · {quota.remaining} restantes
        {quota.exhausted ? " · quota épuisé (ingest en pause)" : ""}
      </p>

      <div className="quota-stats">
        <div className="quota-stat">
          <span className="quota-stat-label">Réussies</span>
          <strong className="ok">{quota.success}</strong>
        </div>
        <div className="quota-stat">
          <span className="quota-stat-label">Échouées</span>
          <strong className={quota.failed > 0 ? "error" : ""}>
            {quota.failed}
          </strong>
        </div>
        <div className="quota-stat">
          <span className="quota-stat-label">Total</span>
          <strong>{quota.used}</strong>
        </div>
        <div className="quota-stat">
          <span className="quota-stat-label">Limite</span>
          <strong>{quota.limit}</strong>
        </div>
      </div>

      <p className="muted quota-note">
        Une requête = un appel départs Navitia (une gare / un sens dans la
        fenêtre). Le compteur se réinitialise à minuit (Paris).
      </p>
    </div>
  );
}
