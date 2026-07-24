import { ChevronDown, Route } from "lucide-react";
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

  const label =
    value === "all"
      ? "Toutes les liaisons"
      : (options.find((o) => o.id === value)?.displayName ?? "Liaison");

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
    <div className="liaison-scope" ref={rootRef}>
      <button
        type="button"
        className="liaison-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <Route size={16} strokeWidth={2} aria-hidden />
        <span className="liaison-scope-label">{label}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <ul
          id={listId}
          className="liaison-scope-menu"
          role="listbox"
          aria-label="Choisir une liaison"
        >
          {options.map((o) => (
            <li key={o.id} role="option" aria-selected={value === o.id}>
              <button
                type="button"
                className={value === o.id ? "is-selected" : undefined}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span>{o.displayName}</span>
                {o.isDefault && <span className="liaison-scope-badge">défaut</span>}
              </button>
            </li>
          ))}
          <li role="option" aria-selected={value === "all"}>
            <button
              type="button"
              className={value === "all" ? "is-selected" : undefined}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              Toutes les liaisons
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
