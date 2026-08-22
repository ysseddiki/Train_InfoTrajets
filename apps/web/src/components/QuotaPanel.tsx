import type { ApiQuotaStatus } from "@sncf-alerts/shared";

export function QuotaPanel({ quota }: { quota: ApiQuotaStatus }) {
  const limit = Math.max(1, quota.limit);
  const successPct = Math.min(100, Math.max(0, (quota.success / limit) * 100));
  const failedPct = Math.min(
    100 - successPct,
    Math.max(0, (quota.failed / limit) * 100),
  );

  return (
    <div className="card quota-panel">
      <div className="quota-head">
        <div>
          <h3>Quota Navitia</h3>
          <p className="muted">
            {quota.day} · Europe/Paris · jauge locale (n’arrête pas le poll)
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
        aria-label={`Quota : ${quota.success} réussies, ${quota.failed} échouées`}
      >
        <div
          className="quota-bar-fill quota-fill-success"
          style={{ width: `${successPct}%` }}
          title={`${quota.success} réussies`}
        />
        <div
          className="quota-bar-fill quota-fill-failed"
          style={{ width: `${failedPct}%` }}
          title={`${quota.failed} échouées`}
        />
      </div>
      <p className="quota-bar-caption muted">
        {quota.percent}% de la jauge {quota.limit}
        {quota.exhausted ? " · au‑delà de la jauge" : ` · ${quota.remaining} sous la jauge`}
        {" · "}stop uniquement si l’API Navitia refuse (ex. HTTP 429)
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
          <span className="quota-stat-label">Jauge</span>
          <strong>{quota.limit}</strong>
        </div>
      </div>
    </div>
  );
}
