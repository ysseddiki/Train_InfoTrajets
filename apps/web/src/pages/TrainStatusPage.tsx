import type {
  TrainObservationDto,
  TrainObservationStatus,
  TrainObservationsResponse,
} from "@sncf-alerts/shared";
import { formatDelayMinutes } from "@sncf-alerts/shared";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client";
import {
  directionLabel,
  errorMessage,
  formatRelative,
  formatTrainNumber,
  formatWhen,
} from "../lib/format";

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

export function TrainStatusPage() {
  const [entries, setEntries] = useState<TrainObservationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<TrainObservationsResponse>(
        "/v1/admin/debug/train-observations?limit=150",
      );
      setEntries(res.entries);
      setFetchedAt(new Date().toISOString());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-enter">
      <h1>Statuts trains</h1>
      <p className="muted">
        Dernières observations ingest (à l’heure, retard, suppression) — debug
        admin.
      </p>
      <p>
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
          <span className="muted"> · Mis à jour {formatRelative(fetchedAt)}</span>
        ) : null}
      </p>

      {error ? <p className="error">{error}</p> : null}

      {loading && entries.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="muted">
          Aucune observation pour le moment. Attendez un poll Navitia.
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
