import type {
  IngestApiLogEntry,
  IngestApiLogSource,
  IngestApiLogsResponse,
  JourneyDirection,
  LiaisonConfig,
} from "@sncf-alerts/shared";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { apiGet, apiSend } from "../api/client";
import { errorMessage } from "../lib/format";
import {
  rawLineHighlight,
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
        <p className="muted debug-logs-lead">
          {viewMode === "readable"
            ? "Surligné = signal outil (retard / suppression). SA ZOU ignorées."
            : "Dump technique — lignes retard / cancel surlignées."}
        </p>

        <div className="debug-logs-controls">
          <div className="debug-logs-filters">
            <div className="debug-control-group">
              <span className="debug-control-label" id="debug-source-label">
                Source
              </span>
              <div
                className="debug-segment"
                role="tablist"
                aria-labelledby="debug-source-label"
              >
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={source === s.id}
                    className={`debug-segment-btn${source === s.id ? " is-active" : ""}`}
                    onClick={() => setSource(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="debug-control-group">
              <span className="debug-control-label" id="debug-view-label">
                Affichage
              </span>
              <div
                className="debug-segment"
                role="group"
                aria-labelledby="debug-view-label"
              >
                <button
                  type="button"
                  className={`debug-segment-btn${viewMode === "readable" ? " is-active" : ""}`}
                  aria-pressed={viewMode === "readable"}
                  onClick={() => setViewMode("readable")}
                >
                  Lecture
                </button>
                <button
                  type="button"
                  className={`debug-segment-btn${viewMode === "raw" ? " is-active" : ""}`}
                  aria-pressed={viewMode === "raw"}
                  onClick={() => setViewMode("raw")}
                >
                  Technique
                </button>
              </div>
            </div>
          </div>

          <div className="debug-logs-actions">
            <button
              type="button"
              className="debug-action-btn"
              disabled={loading}
              onClick={() => void reload()}
            >
              <RefreshCw
                size={15}
                strokeWidth={2}
                className={loading ? "is-spinning" : undefined}
                aria-hidden
              />
              Actualiser
            </button>
            <button
              type="button"
              className="debug-action-btn debug-action-danger"
              onClick={() => void clearLogs()}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              Vider
            </button>
            <label
              className={`debug-auto-toggle${auto ? " is-on" : ""}`}
              title="Rafraîchir automatiquement toutes les 5 secondes"
            >
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              <span className="debug-auto-track" aria-hidden>
                <span className="debug-auto-knob" />
              </span>
              <span className="debug-auto-text">Auto 5 s</span>
            </label>
          </div>
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
                className={[
                  "debug-log-entry",
                  "debug-log-readable",
                  `kind-${entry.kind}`,
                  entry.ok ? "" : "is-error",
                  entry.isToolSignal ? "is-tool-signal" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <header className="debug-log-entry-head">
                  <span className="debug-log-time">{formatAt(entry.at)}</span>
                  <strong>{entry.title}</strong>
                  {entry.isToolSignal && (
                    <span className="pill pill-tool">Signal outil</span>
                  )}
                  {entry.kind === "ignored" && (
                    <span className="pill pill-ignored">Ignoré</span>
                  )}
                  {entry.httpStatus != null && (
                    <span className="pill">HTTP {entry.httpStatus}</span>
                  )}
                  <span className={`pill ${entry.ok ? "pill-ok" : "pill-err"}`}>
                    {entry.ok ? "OK" : "KO"}
                  </span>
                </header>
                <ul className="debug-log-bullets">
                  {entry.bullets.map((b, i) => (
                    <li
                      key={`${entry.id}-b-${i}`}
                      className={
                        b.highlight ? `hl-${b.highlight}` : undefined
                      }
                    >
                      {b.text}
                    </li>
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
            {entries.map((entry) => {
              const isSa =
                /Service Alerts/i.test(entry.title) &&
                !/TripUpdates/i.test(entry.title);
              const isTuMatch = /^Match TripUpdates/i.test(entry.title);
              return (
                <article
                  key={entry.id}
                  className={[
                    "debug-log-entry",
                    entry.ok ? "" : "is-error",
                    isTuMatch ? "is-tool-signal" : "",
                    isSa ? "is-ignored-feed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <header className="debug-log-entry-head">
                    <span className="debug-log-time">{formatAt(entry.at)}</span>
                    <strong>{entry.title}</strong>
                    {isTuMatch && (
                      <span className="pill pill-tool">Signal outil</span>
                    )}
                    {isSa && (
                      <span className="pill pill-ignored">Ignoré</span>
                    )}
                    {entry.httpStatus != null && (
                      <span className="pill">HTTP {entry.httpStatus}</span>
                    )}
                    <span
                      className={`pill ${entry.ok ? "pill-ok" : "pill-err"}`}
                    >
                      {entry.ok ? "OK" : "KO"}
                    </span>
                  </header>
                  <ol className="debug-log-lines">
                    {entry.lines.map((line, i) => {
                      const hl = rawLineHighlight(line);
                      return (
                        <li
                          key={`${entry.id}-${i}`}
                          className={hl ? `hl-${hl}` : undefined}
                        >
                          <code>{line}</code>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <section className="card debug">
        <h3>Outils stub</h3>
        <p className="muted">Injection événement + matching / notifs.</p>
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
          ~6 mois d’historique (heatmap). Sans notifs.
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
