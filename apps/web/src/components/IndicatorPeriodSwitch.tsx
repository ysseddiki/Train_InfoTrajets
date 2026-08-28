import { useRef } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const currentIndex = INDICATOR_PERIODS.findIndex((p) => p.id === value);
    let nextIndex = currentIndex;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        nextIndex = (currentIndex + 1) % INDICATOR_PERIODS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        nextIndex =
          (currentIndex - 1 + INDICATOR_PERIODS.length) %
          INDICATOR_PERIODS.length;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = INDICATOR_PERIODS.length - 1;
        break;
      default:
        return;
    }

    const next = INDICATOR_PERIODS[nextIndex];
    if (next) {
      onChange(next.id);
      const buttons =
        containerRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
      buttons?.[nextIndex]?.focus();
    }
  }

  return (
    <div
      ref={containerRef}
      className="period-switch debug-segment"
      role="tablist"
      aria-label="Période des indicateurs"
      onKeyDown={onKeyDown}
    >
      {INDICATOR_PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={value === p.id}
          tabIndex={value === p.id ? 0 : -1}
          className={`debug-segment-btn${value === p.id ? " is-active" : ""}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
