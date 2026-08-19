export type IndicatorPeriodKey =
  | "today"
  | "last24h"
  | "week"
  | "month"
  | "year";

export const INDICATOR_PERIODS: {
  id: IndicatorPeriodKey;
  label: string;
  hint: string;
}[] = [
  { id: "today", label: "Journée", hint: "depuis 0 h (Paris)" },
  { id: "last24h", label: "24 h", hint: "glissant" },
  { id: "week", label: "Semaine", hint: "depuis lundi 0 h" },
  { id: "month", label: "Mois", hint: "depuis le 1er" },
  { id: "year", label: "Année", hint: "depuis le 1er janv." },
];

export function IndicatorPeriodSwitch({
  value,
  onChange,
}: {
  value: IndicatorPeriodKey;
  onChange: (next: IndicatorPeriodKey) => void;
}) {
  return (
    <div className="period-switch debug-segment" role="tablist" aria-label="Période des indicateurs">
      {INDICATOR_PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={value === p.id}
          className={`debug-segment-btn${value === p.id ? " is-active" : ""}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
