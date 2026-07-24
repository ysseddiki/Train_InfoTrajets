export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "accent";
  compact?: boolean;
}) {
  return (
    <article
      className={`stat-card stat-card-${tone}${compact ? " stat-card-compact" : ""}`}
    >
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">{value}</p>
      {hint ? <p className="stat-card-hint">{hint}</p> : null}
    </article>
  );
}
