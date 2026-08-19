import type { Station } from "@sncf-alerts/shared";
import { useState, type FormEvent } from "react";
import { apiSend } from "../api/client";

export function CreateStationDialog({
  onCreated,
  onClose,
}: {
  onCreated: (station: Station) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<Station>("/v1/admin/stations", "POST", {
        label: String(fd.get("label") ?? "").trim(),
        externalId: String(fd.get("externalId") ?? "").trim(),
      });
      onCreated(created);
      onClose();
    } catch {
      setError("Création impossible (id déjà pris ?)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card dialog-card"
        role="dialog"
        aria-labelledby="create-station-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="create-station-title">Nouvelle gare</h3>
        <form className="stack-form" onSubmit={(e) => void save(e)}>
          <label>
            Libellé
            <input name="label" required disabled={busy} />
          </label>
          <label>
            ID Navitia
            <input
              name="externalId"
              required
              disabled={busy}
              placeholder="stop_area:SNCF:…"
            />
          </label>
          <div className="admin-stack-actions">
            <button type="submit" disabled={busy}>
              Créer
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Annuler
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
