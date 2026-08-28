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
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected =
    value === "all" ? null : (options.find((o) => o.id === value) ?? null);
  const label =
    value === "all"
      ? "Toutes les liaisons"
      : (selected?.displayName ?? "Liaison");

  const allOptions = [
    ...options.map((o) => ({ id: o.id, displayName: o.displayName })),
    { id: "all" as const, displayName: "Toutes les liaisons" },
  ];

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

  function focusOption(index: number) {
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]");
    buttons?.[index]?.focus();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      const currentIndex = allOptions.findIndex((o) => o.id === value);
      setTimeout(() => focusOption(Math.max(0, currentIndex)), 0);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    const currentIndex = allOptions.findIndex((o) => o.id === value);
    let nextIndex = currentIndex;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        nextIndex = (currentIndex + 1) % allOptions.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        nextIndex =
          (currentIndex - 1 + allOptions.length) % allOptions.length;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = allOptions.length - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (currentIndex >= 0) {
          onChange(allOptions[currentIndex].id as LiaisonScopeValue);
          setOpen(false);
        }
        return;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        return;
      default:
        return;
    }

    focusOption(nextIndex);
  }

  return (
    <div className={`liaison-scope${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="liaison-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
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
          ref={listRef}
          id={listId}
          className="liaison-scope-menu"
          role="listbox"
          aria-label="Choisir une liaison"
          onKeyDown={onListKeyDown}
        >
          {options.map((o) => (
            <li key={o.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === o.id}
                tabIndex={value === o.id ? 0 : -1}
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
              tabIndex={value === "all" ? 0 : -1}
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
