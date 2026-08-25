import type {
  ClearStatsResult,
  IngestEventSource,
} from "@sncf-alerts/shared";
import { useState } from "react";
import { apiSend } from "../api/client";

const EVENT_SOURCES: { id: IngestEventSource; label: string }[] = [
  { id: "stub", label: "Stub" },
  { id: "navitia", label: "Navitia" },
  { id: "prim", label: "PRIM (legacy)" },
  { id: "zou", label: "ZOU (legacy)" },
];

export function ClearStatsPanel() {
  const [sources, setSources] = useState<Record<IngestEventSource, boolean>>({
    stub: false,
    navitia: false,
    prim: false,
    zou: false,
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
      parts.push("heatmap / observations board");
    }
    if (deliveries) parts.push("livraisons email/Teams");
    if (
      !window.confirm(
        `Effacer définitivement : ${parts.join(" + ")} ?\nIndicateurs et heatmap dashboard seront recalculés (vides jusqu’au prochain poll).`,
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
      const bits = [
        `${res.deletedEvents} événement(s)`,
        `${res.deletedDeliveries} livraison(s)`,
      ];
      if (selectedSources.length > 0) {
        bits.push(
          `${res.deletedBoardDays ?? 0} jour(s) heatmap`,
          `${res.deletedTrainObservations ?? 0} obs. train`,
        );
      }
      setMsg({
        text: `Effacé : ${bits.join(", ")}.`,
        ok: true,
      });
      setSources({
        stub: false,
        navitia: false,
        prim: false,
        zou: false,
      });
      setDeliveries(false);
    } catch {
      setMsg({ text: "Échec de l’effacement", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card clear-stats-panel">
      <fieldset className="clear-stats-group">
        <legend>Événements</legend>
        <div className="clear-stats-options">
          {EVENT_SOURCES.map(({ id, label }) => (
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
          </span>
        </label>
      </fieldset>

      <button
        type="button"
        className="danger-action"
        disabled={!canClear || busy}
        onClick={() => void onClear()}
      >
        {busy ? "…" : "Effacer"}
      </button>
      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </div>
  );
}
