export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "accent";
}) {
  return (
    <article className={`stat-card stat-card-${tone}`}>
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">{value}</p>
      {hint ? <p className="stat-card-hint">{hint}</p> : null}
    </article>
  );
}
