import type {
  ClearStatsResult,
  IngestEventSource,
} from "@sncf-alerts/shared";
import { useState } from "react";
import { apiSend } from "../api/client";

const EVENT_SOURCES: { id: IngestEventSource; label: string; hint: string }[] =
  [
    {
      id: "stub",
      label: "Événements stub",
      hint: "Injections debug / ingest stub",
    },
    {
      id: "navitia",
      label: "Événements Navitia",
      hint: "Retards / suppressions issus de l’API SNCF",
    },
    {
      id: "prim",
      label: "Événements PRIM",
      hint: "Source Île-de-France Mobilités (si utilisée)",
    },
  ];

export function ClearStatsPanel() {
  const [sources, setSources] = useState<Record<IngestEventSource, boolean>>({
    stub: false,
    navitia: false,
    prim: false,
  });
  const [deliveries, setDeliveries] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const selectedSources = (
    Object.entries(sources) as [IngestEventSource, boolean][]
  )
    .filter(([, on]) => on)
    .map(([id]) => id);

  const canClear = selectedSources.length > 0 || deliveries;

  async function onClear() {
    if (!canClear) return;
    const parts: string[] = [];
    if (selectedSources.length > 0) {
      parts.push(`événements (${selectedSources.join(", ")})`);
    }
    if (deliveries) parts.push("livraisons email/Teams");
    if (
      !window.confirm(
        `Effacer définitivement : ${parts.join(" + ")} ?\nLes stats dashboard (retards, suppressions, notifs) seront recalculées.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const res = await apiSend<ClearStatsResult>("/v1/admin/stats/clear", "POST", {
        eventSources: selectedSources,
        deliveries,
      });
      setMsg({
        text: `Effacé : ${res.deletedEvents} événement(s), ${res.deletedDeliveries} livraison(s).`,
        ok: true,
      });
      setSources({ stub: false, navitia: false, prim: false });
      setDeliveries(false);
    } catch {
      setMsg({ text: "Échec de l’effacement", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card clear-stats-panel">
      <p className="muted">
        Vide les données qui alimentent les statistiques dashboard (retards,
        suppressions, notifs). Chaque source se coche indépendamment.
      </p>

      <fieldset className="clear-stats-group">
        <legend>Événements ingest</legend>
        <div className="clear-stats-options">
          {EVENT_SOURCES.map(({ id, label, hint }) => (
            <label key={id} className="check-inline clear-stats-option">
              <input
                type="checkbox"
                checked={sources[id]}
                onChange={(e) =>
                  setSources((prev) => ({ ...prev, [id]: e.target.checked }))
                }
              />
              <span>
                <strong>{label}</strong>
                <span className="muted clear-stats-hint">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="clear-stats-group">
        <legend>Notifications</legend>
        <label className="check-inline clear-stats-option">
          <input
            type="checkbox"
            checked={deliveries}
            onChange={(e) => setDeliveries(e.target.checked)}
          />
          <span>
            <strong>Livraisons email / Teams</strong>
            <span className="muted clear-stats-hint">
              Historique des envois (sent / failed / suppressed)
            </span>
          </span>
        </label>
      </fieldset>

      <button
        type="button"
        className="danger-action"
        disabled={!canClear || busy}
        onClick={() => void onClear()}
      >
        {busy ? "Effacement…" : "Effacer la sélection"}
      </button>
      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </div>
  );
}
