import { ChevronDown, Layers, TrainFront } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { LiaisonOption } from "@sncf-alerts/shared";

export type LiaisonScopeValue = string | "all";

export function LiaisonScopePicker({
  options,
  value,
  onChange,
}: {
  options: LiaisonOption[];
  value: LiaisonScopeValue;
  onChange: (next: LiaisonScopeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected =
    value === "all" ? null : (options.find((o) => o.id === value) ?? null);
  const label =
    value === "all"
      ? "Toutes les liaisons"
      : (selected?.displayName ?? "Liaison");

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`liaison-scope${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="liaison-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="liaison-scope-avatar" aria-hidden>
          {value === "all" ? (
            <Layers size={15} strokeWidth={2} />
          ) : (
            <TrainFront size={15} strokeWidth={2} />
          )}
        </span>
        <span className="liaison-scope-label">{label}</span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className="liaison-scope-chevron"
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={listId}
          className="liaison-scope-menu"
          role="listbox"
          aria-label="Choisir une liaison"
        >
          {options.map((o) => (
            <li key={o.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === o.id}
                className={`liaison-scope-option${value === o.id ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className="liaison-scope-option-main">
                  <span className="liaison-scope-avatar sm" aria-hidden>
                    <TrainFront size={14} strokeWidth={2} />
                  </span>
                  <span className="liaison-scope-option-text">{o.displayName}</span>
                </span>
                {o.isDefault && (
                  <span className="liaison-scope-badge">Défaut</span>
                )}
              </button>
            </li>
          ))}
          <li className="liaison-scope-sep" role="separator" aria-hidden />
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className={`liaison-scope-option${value === "all" ? " is-selected" : ""}`}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              <span className="liaison-scope-option-main">
                <span className="liaison-scope-avatar sm" aria-hidden>
                  <Layers size={14} strokeWidth={2} />
                </span>
                <span className="liaison-scope-option-text">
                  Toutes les liaisons
                </span>
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
