import type {
  IngestApiLogEntry,
  IngestApiLogSource,
  IngestApiLogsResponse,
  JourneyDirection,
  LiaisonConfig,
} from "@sncf-alerts/shared";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";
import {
  toReadableLogEntry,
  type LogViewMode,
} from "../lib/ingestLogReadable";

const SOURCES: { id: IngestApiLogSource; label: string }[] = [
  { id: "navitia", label: "Navitia" },
  { id: "zou", label: "ZOU" },
  { id: "stub", label: "Stub" },
];

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DebugPanel({
  liaisons,
}: {
  liaisons: LiaisonConfig[];
}) {
  const [source, setSource] = useState<IngestApiLogSource>("navitia");
  const [viewMode, setViewMode] = useState<LogViewMode>("readable");
  const [entries, setEntries] = useState<IngestApiLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [stubDirection, setStubDirection] =
    useState<JourneyDirection>("outbound");
  const [stubLiaisonId, setStubLiaisonId] = useState(
    () => liaisons[0]?.id ?? "",
  );
  const [stubDelay, setStubDelay] = useState(15);
  const [stubMsg, setStubMsg] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!stubLiaisonId && liaisons[0]?.id) {
      setStubLiaisonId(liaisons[0].id);
    }
  }, [liaisons, stubLiaisonId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<IngestApiLogsResponse>(
        `/v1/admin/debug/ingest-logs?source=${source}`,
      );
      setEntries(res.entries);
      setMsg(null);
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      void reload();
    }, 5000);
    return () => window.clearInterval(id);
  }, [auto, reload]);

  async function clearLogs() {
    try {
      await apiSend(`/v1/admin/debug/ingest-logs?source=${source}`, "DELETE");
      await reload();
      setMsg({ text: `Logs ${source} effacés`, ok: true });
    } catch (err) {
      setMsg({ text: errorMessage(err), ok: false });
    }
  }

  async function injectStub() {
    try {
      await apiSend("/v1/admin/debug/stub-event", "POST", {
        direction: stubDirection,
        liaisonId: stubLiaisonId || undefined,
        delayMinutes: stubDelay,
      });
      setStubMsg({ text: "Événement stub injecté", ok: true });
      setSource("stub");
      await reload();
    } catch {
      setStubMsg({ text: "Échec injection", ok: false });
    }
  }

  async function seedStubHistory() {
    try {
      const res = await apiSend<{ created: number; months: number }>(
        "/v1/admin/debug/stub-history",
        "POST",
        { months: 6, liaisonId: stubLiaisonId || undefined },
      );
      setStubMsg({
        text: `Historique : ${res.created} événements / ${res.months} mois`,
        ok: true,
      });
      setSource("stub");
      await reload();
    } catch {
      setStubMsg({ text: "Échec historique stub", ok: false });
    }
  }

  const readableEntries =
    viewMode === "readable" ? entries.map(toReadableLogEntry) : [];

  return (
    <div className="debug-panel">
      <div className="card debug-logs-card">
        <h3>Logs API ingest</h3>
        <p className="muted">
          {viewMode === "readable"
            ? "Mode lecture : résumé en français. Passe en Technique pour le dump complet (utile pour ZOU)."
            : "Mode technique : toutes les infos reçues, ligne par ligne."}
        </p>

        <div className="debug-log-tabs" role="tablist" aria-label="Source ingest">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={source === s.id}
              className={`debug-log-tab${source === s.id ? " is-active" : ""}`}
              onClick={() => setSource(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div
          className="debug-view-modes"
          role="group"
          aria-label="Mode d’affichage"
        >
          <button
            type="button"
            className={`debug-view-mode${viewMode === "readable" ? " is-active" : ""}`}
            onClick={() => setViewMode("readable")}
          >
            Lecture
          </button>
          <button
            type="button"
            className={`debug-view-mode${viewMode === "raw" ? " is-active" : ""}`}
            onClick={() => setViewMode("raw")}
          >
            Technique
          </button>
        </div>

        <div className="debug-log-toolbar">
          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={() => void reload()}
          >
            Actualiser
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void clearLogs()}
          >
            Vider cet onglet
          </button>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />{" "}
            Auto 5 s
          </label>
          {loading && <span className="muted">Chargement…</span>}
        </div>

        {msg && (
          <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
        )}

        {entries.length === 0 ? (
          <p className="muted debug-log-empty">
            Aucun log {SOURCES.find((s) => s.id === source)?.label} pour
            l’instant.
          </p>
        ) : viewMode === "readable" ? (
          <div className="debug-log-list">
            {readableEntries.map((entry) => (
              <article
                key={entry.id}
                className={`debug-log-entry debug-log-readable kind-${entry.kind}${entry.ok ? "" : " is-error"}`}
              >
                <header className="debug-log-entry-head">
                  <span className="debug-log-time">{formatAt(entry.at)}</span>
                  <strong>{entry.title}</strong>
                  {entry.httpStatus != null && (
                    <span className="pill">HTTP {entry.httpStatus}</span>
                  )}
                  <span className={`pill ${entry.ok ? "pill-ok" : "pill-err"}`}>
                    {entry.ok ? "OK" : "KO"}
                  </span>
                </header>
                <ul className="debug-log-bullets">
                  {entry.bullets.map((b, i) => (
                    <li key={`${entry.id}-b-${i}`}>{b}</li>
                  ))}
                </ul>
                {entry.hiddenRawLines > 0 && (
                  <p className="muted debug-log-hint">
                    {entry.hiddenRawLines} ligne(s) techniques masquée(s) —
                    bascule en <em>Technique</em> pour tout voir.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="debug-log-list">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className={`debug-log-entry${entry.ok ? "" : " is-error"}`}
              >
                <header className="debug-log-entry-head">
                  <span className="debug-log-time">{formatAt(entry.at)}</span>
                  <strong>{entry.title}</strong>
                  {entry.httpStatus != null && (
                    <span className="pill">HTTP {entry.httpStatus}</span>
                  )}
                  <span className={`pill ${entry.ok ? "pill-ok" : "pill-err"}`}>
                    {entry.ok ? "OK" : "KO"}
                  </span>
                </header>
                <ol className="debug-log-lines">
                  {entry.lines.map((line, i) => (
                    <li key={`${entry.id}-${i}`}>
                      <code>{line}</code>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </div>

      <section className="card debug">
        <h3>Outils stub</h3>
        <p className="muted">
          Injecte un événement stub (matching + file notifs). Puis ouvre le{" "}
          <Link to="/">Dashboard</Link> et actualise.
        </p>
        <label>
          Liaison
          <select
            value={stubLiaisonId}
            onChange={(e) => setStubLiaisonId(e.target.value)}
          >
            {liaisons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sens
          <select
            value={stubDirection}
            onChange={(e) =>
              setStubDirection(e.target.value as JourneyDirection)
            }
          >
            <option value="outbound">Aller</option>
            <option value="inbound">Retour</option>
          </select>
        </label>
        <label>
          Retard (min)
          <input
            type="number"
            value={stubDelay}
            onChange={(e) => setStubDelay(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={() => void injectStub()}>
          Injecter événement stub
        </button>
        <hr className="admin-sep" />
        <p className="muted">
          Remplit ~6 mois d’événements stub (heatmap / stats).{" "}
          <strong>Sans notifications</strong>.
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => void seedStubHistory()}
        >
          Simuler 6 mois d’historique stub
        </button>
        {stubMsg && (
          <p className={stubMsg.ok ? "ok" : "error"}>{stubMsg.text}</p>
        )}
      </section>
    </div>
  );
}
