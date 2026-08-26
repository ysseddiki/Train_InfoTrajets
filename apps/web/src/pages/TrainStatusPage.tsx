import type {
  TrainObservationDto,
  TrainObservationStatus,
  TrainObservationsResponse,
} from "@sncf-alerts/shared";
import { formatDelayMinutes } from "@sncf-alerts/shared";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client";
import {
  directionLabel,
  errorMessage,
  formatRelative,
  formatTrainNumber,
  formatWhen,
} from "../lib/format";

type StatusFilter = "all" | TrainObservationStatus;

function statusLabel(status: TrainObservationStatus): string {
  switch (status) {
    case "on_time":
      return "À l’heure";
    case "delayed":
      return "Retard";
    case "cancelled":
      return "Supprimé";
    default:
      return "Inconnu";
  }
}

function statusClass(status: TrainObservationStatus): string {
  switch (status) {
    case "on_time":
      return "pill pill-ok";
    case "delayed":
      return "pill pill-warn";
    case "cancelled":
      return "pill pill-err";
    default:
      return "pill pill-muted";
  }
}

function delayCell(row: TrainObservationDto): string {
  if (row.status === "cancelled") return "—";
  if (row.status === "on_time") return "0 min";
  if (row.delayMinutes == null) return "—";
  return formatDelayMinutes(
    row.delayMinutes,
    row.status === "delayed" ? "delay" : undefined,
  );
}

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "cancelled", label: "Supprimés" },
  { id: "delayed", label: "Retards" },
  { id: "on_time", label: "À l’heure" },
];

export function TrainStatusPage() {
  const [entries, setEntries] = useState<TrainObservationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [trainQuery, setTrainQuery] = useState("");
  const [appliedTrain, setAppliedTrain] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (appliedTrain.trim()) {
        params.set("trainNumber", appliedTrain.trim());
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const res = await apiGet<TrainObservationsResponse>(
        `/v1/admin/debug/train-observations?${params}`,
      );
      setEntries(res.entries);
      setFetchedAt(new Date().toISOString());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [appliedTrain, statusFilter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setAppliedTrain(trainQuery.trim());
  }

  const cancelledCount = entries.filter((r) => r.status === "cancelled").length;

  return (
    <div className="page-enter">
      <h1>Statuts trains</h1>
      <p className="muted">
        Observations ingest (à l’heure, retard, suppression) — debug admin.
      </p>

      <form className="train-debug-toolbar" onSubmit={onSearch}>
        <label className="train-debug-search">
          <span className="muted">N° train</span>
          <input
            type="search"
            value={trainQuery}
            onChange={(e) => setTrainQuery(e.target.value)}
            placeholder="ex. 86053"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="secondary" disabled={loading}>
          Chercher
        </button>
        {appliedTrain ? (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setTrainQuery("");
              setAppliedTrain("");
            }}
          >
            Effacer
          </button>
        ) : null}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          disabled={loading}
        >
          Actualiser
        </button>
        {fetchedAt ? (
          <span className="muted">Mis à jour {formatRelative(fetchedAt)}</span>
        ) : null}
      </form>

      <div className="debug-segment" role="group" aria-label="Filtre statut">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`debug-segment-btn${statusFilter === f.id ? " is-active" : ""}`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
            {f.id === "cancelled" && statusFilter === "all" && cancelledCount > 0
              ? ` (${cancelledCount})`
              : null}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading && entries.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="muted">
          {appliedTrain || statusFilter !== "all"
            ? "Aucune observation pour ce filtre."
            : "Aucune observation pour le moment. Attendez un poll Navitia."}
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Observé</th>
                <th>Train</th>
                <th>Sens</th>
                <th>Gare</th>
                <th>Départ théorique</th>
                <th>Statut</th>
                <th>Retard</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr
                  key={`${row.journeyId}-${row.scheduledAt ?? ""}-${row.observedAt}-${row.trainNumber ?? ""}`}
                  className={
                    row.status === "cancelled" ? "train-row-cancelled" : undefined
                  }
                >
                  <td>{formatWhen(row.observedAt)}</td>
                  <td>{formatTrainNumber(row.trainNumber)}</td>
                  <td>
                    {row.liaisonName
                      ? `${row.liaisonName} · ${directionLabel(row.direction)}`
                      : directionLabel(row.direction)}
                  </td>
                  <td>
                    {row.originLabel || "—"}
                    {row.destinationLabel ? (
                      <span className="muted"> → {row.destinationLabel}</span>
                    ) : null}
                  </td>
                  <td>
                    {row.scheduledAt ? formatWhen(row.scheduledAt) : "—"}
                  </td>
                  <td>
                    <span className={statusClass(row.status)}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td>{delayCell(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
