import type {
  DashboardOverview,
  IngestApiLogEntry,
  IngestApiLogsResponse,
} from "@sncf-alerts/shared";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client";
import { errorMessage, formatRelative, formatWhen } from "../lib/format";
import {
  rawLineHighlight,
  toReadableLogEntry,
  type LogViewMode,
} from "../lib/ingestLogReadable";

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

function EntryCard({
  entry,
  featured,
  viewMode,
}: {
  entry: IngestApiLogEntry;
  featured?: boolean;
  viewMode: LogViewMode;
}) {
  const readable = toReadableLogEntry(entry);

  return (
    <article
      className={[
        "debug-log-entry",
        "debug-log-readable",
        `kind-${readable.kind}`,
        !entry.ok ? "is-error" : "",
        readable.isToolSignal ? "is-tool-signal" : "",
        featured ? "api-live-featured" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="debug-log-entry-head">
        <time className="debug-log-time" dateTime={entry.at}>
          {formatAt(entry.at)}
        </time>
        <span className={`pill${entry.ok ? "" : " pill-warn"}`}>
          {entry.source}
        </span>
        {entry.httpStatus != null ? (
          <span className="pill pill-muted">HTTP {entry.httpStatus}</span>
        ) : null}
        <span className={`pill${entry.ok ? "" : " pill-warn"}`}>
          {entry.ok ? "OK" : "KO"}
        </span>
        {featured ? <span className="pill">Dernière</span> : null}
      </div>
      <p className="activity-feed-title">{readable.title}</p>
      {viewMode === "readable" ? (
        <ul className="debug-log-bullets">
          {readable.bullets.map((b, i) => (
            <li
              key={`${entry.id}-b-${i}`}
              className={b.highlight ? `hl-${b.highlight}` : undefined}
            >
              {b.text}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="debug-log-lines">
          {entry.lines.map((line, i) => {
            const hl = rawLineHighlight(line);
            return (
              <li key={`${entry.id}-r-${i}`} className={hl ? `hl-${hl}` : undefined}>
                <code>{line}</code>
              </li>
            );
          })}
        </ul>
      )}
      {viewMode === "readable" && readable.hiddenRawLines > 0 ? (
        <p className="muted debug-log-hint">
          +{readable.hiddenRawLines} ligne(s) en mode Technique
        </p>
      ) : null}
    </article>
  );
}

export function ApiLivePage() {
  const [entries, setEntries] = useState<IngestApiLogEntry[] | null>(null);
  const [ingest, setIngest] = useState<DashboardOverview["lastIngest"] | null>(
    null,
  );
  const [provider, setProvider] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LogViewMode>("readable");
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [logs, overview] = await Promise.all([
        apiGet<IngestApiLogsResponse>("/v1/admin/debug/ingest-logs?source=all"),
        apiGet<DashboardOverview>("/v1/dashboard/overview?liaisonId=all"),
      ]);
      const sorted = [...logs.entries].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
      );
      setEntries(sorted);
      setIngest(overview.lastIngest);
      setProvider(overview.stats.ingestProvider);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (error && !entries) {
    return (
      <div className="page-enter">
        <h1>Réponse API</h1>
        <p className="error">Impossible de charger les réponses ingest.</p>
        <pre>{error}</pre>
        <button type="button" className="secondary" onClick={() => void reload()}>
          Réessayer
        </button>
      </div>
    );
  }

  if (!entries) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  const latest = entries[0] ?? null;
  const previous = entries.slice(1, 8);

  return (
    <div className={`page-enter api-live-page${loading ? " is-refreshing" : ""}`}>
      <div className="dash-head">
        <div>
          <p className="eyebrow">Ingest · lecture</p>
          <h1>Réponse API</h1>
          <p className="muted section-hint">
            Dernière réponse Navitia / stub et contexte du poll.
          </p>
        </div>
        <div className="dash-head-actions">
          <div className="debug-segment" role="group" aria-label="Affichage">
            <button
              type="button"
              className={`debug-segment-btn${viewMode === "readable" ? " is-active" : ""}`}
              onClick={() => setViewMode("readable")}
            >
              Lecture
            </button>
            <button
              type="button"
              className={`debug-segment-btn${viewMode === "raw" ? " is-active" : ""}`}
              onClick={() => setViewMode("raw")}
            >
              Technique
            </button>
          </div>
          <label className="check-inline api-live-auto">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto 5 s
          </label>
          <button
            type="button"
            className="btn-icon secondary"
            onClick={() => void reload()}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : undefined} />
            <span className="btn-label">Actualiser</span>
          </button>
        </div>
      </div>

      <section className="card api-live-meta">
        <h2 className="dash-section-title">Dernier poll</h2>
        <dl className="api-live-meta-grid">
          <div>
            <dt>Provider</dt>
            <dd>
              <code>{provider ?? "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Statut</dt>
            <dd>
              <span
                className={`pill${
                  ingest?.status === "ok"
                    ? ""
                    : ingest?.status === "error"
                      ? " pill-warn"
                      : " pill-muted"
                }`}
              >
                {ingest?.status ?? "inconnu"}
              </span>
            </dd>
          </div>
          <div>
            <dt>Horodatage</dt>
            <dd>
              {ingest?.at
                ? `${formatWhen(ingest.at)} (${formatRelative(ingest.at)})`
                : "—"}
            </dd>
          </div>
          <div className="api-live-meta-detail">
            <dt>Détail</dt>
            <dd>{ingest?.detail?.trim() || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">Dernière réponse</h2>
        {latest ? (
          <EntryCard entry={latest} featured viewMode={viewMode} />
        ) : (
          <p className="muted">
            Aucune réponse en mémoire (attendre un poll ou un test Admin →
            Ingest).
          </p>
        )}
      </section>

      {previous.length > 0 ? (
        <section className="dash-section">
          <h2 className="dash-section-title">Récentes</h2>
          <div className="debug-log-list api-live-list">
            {previous.map((e) => (
              <EntryCard key={e.id} entry={e} viewMode={viewMode} />
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="error form-msg">{error}</p> : null}
    </div>
  );
}
