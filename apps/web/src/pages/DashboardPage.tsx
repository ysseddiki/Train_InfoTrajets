import type { DashboardOverview, DashboardPeriodStats } from "@sncf-alerts/shared";
import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";
import { ActivityHeatmap } from "../components/ActivityHeatmap";
import {
  DeliveriesActivityFeed,
  EventsActivityFeed,
} from "../components/ActivityFeed";
import {
  INDICATOR_PERIODS,
  IndicatorPeriodSwitch,
  type IndicatorPeriodKey,
} from "../components/IndicatorPeriodSwitch";
import { JourneyCard } from "../components/JourneyCard";
import {
  LiaisonScopePicker,
  type LiaisonScopeValue,
} from "../components/LiaisonScopePicker";
import { StatCard } from "../components/StatCard";
import { WeatherCorrelationPanel } from "../components/WeatherCorrelationPanel";
import { errorMessage, formatRelative, formatWhen } from "../lib/format";

const STORAGE_KEY = "sncf.dashboard.liaisonScope";
const PERIOD_KEY = "sncf.dashboard.indicatorPeriod";

function formatLastCheckHm(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function formatIngestSourceLabel(data: DashboardOverview): string {
  const provider = data.stats.ingestProvider;
  const source =
    provider === "navitia"
      ? "Navitia"
      : provider === "stub"
        ? "Stub"
        : provider;

  const hm = formatLastCheckHm(data.lastIngest.at);
  return hm ? `${source} · ${hm}` : source;
}

/** Couleur = statut réel du dernier poll, pas le provider. */
function sourceStatusTone(data: DashboardOverview): string {
  const status = data.lastIngest.status;
  if (status === "ok") return "ok";
  if (status === "error") return "err";
  if (status === "skipped") return "warn";
  return "unknown";
}

function readStoredScope(): LiaisonScopeValue | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return null;
    if (v === "all") return "all";
    return v;
  } catch {
    return null;
  }
}

function writeStoredScope(value: LiaisonScopeValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function isPeriodKey(v: string): v is IndicatorPeriodKey {
  return INDICATOR_PERIODS.some((p) => p.id === v);
}

function readStoredPeriod(): IndicatorPeriodKey {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (v && isPeriodKey(v)) return v;
  } catch {
    /* ignore */
  }
  return "today";
}

function writeStoredPeriod(value: IndicatorPeriodKey): void {
  try {
    localStorage.setItem(PERIOD_KEY, value);
  } catch {
    /* ignore */
  }
}

function pickPeriodStats(
  periods: DashboardOverview["stats"]["periods"],
  key: IndicatorPeriodKey,
): DashboardPeriodStats {
  return periods[key] ?? periods.last24h;
}

function overviewPath(scope: LiaisonScopeValue | null): string {
  if (scope === "all") return "/v1/dashboard/overview?liaisonId=all";
  if (scope) return `/v1/dashboard/overview?liaisonId=${encodeURIComponent(scope)}`;
  return "/v1/dashboard/overview";
}

export function DashboardPage() {
  const [scope, setScope] = useState<LiaisonScopeValue | null>(() =>
    readStoredScope(),
  );
  const [period, setPeriod] = useState<IndicatorPeriodKey>(() =>
    readStoredPeriod(),
  );
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextScope: LiaisonScopeValue | null) => {
    setLoading(true);
    setError(null);
    try {
      const overview = await apiGet<DashboardOverview>(overviewPath(nextScope));
      setData(overview);
      const resolved: LiaisonScopeValue =
        overview.scope === "all"
          ? "all"
          : (overview.selectedLiaisonId ?? "all");
      setScope(resolved);
      writeStoredScope(resolved);
    } catch (err) {
      if (nextScope && nextScope !== "all") {
        try {
          const overview = await apiGet<DashboardOverview>(
            "/v1/dashboard/overview",
          );
          setData(overview);
          const resolved: LiaisonScopeValue =
            overview.scope === "all"
              ? "all"
              : (overview.selectedLiaisonId ?? "all");
          setScope(resolved);
          writeStoredScope(resolved);
          return;
        } catch {
          /* fall through */
        }
      }
      setData(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(readStoredScope());
  }, [load]);

  function onScopeChange(next: LiaisonScopeValue) {
    setScope(next);
    writeStoredScope(next);
    void load(next);
  }

  function onPeriodChange(next: IndicatorPeriodKey) {
    setPeriod(next);
    writeStoredPeriod(next);
  }

  if (error && !data) {
    return (
      <div className="page-enter">
        <h1>Dashboard</h1>
        <p className="error">
          API indisponible. Vérifiez que <code>apps/api</code> tourne.
        </p>
        <pre>{error}</pre>
        <button type="button" className="secondary" onClick={() => void load(scope)}>
          Réessayer
        </button>
      </div>
    );
  }

  if (!data || scope === null) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  const periodMeta =
    INDICATOR_PERIODS.find((p) => p.id === period) ?? INDICATOR_PERIODS[0];
  const p = pickPeriodStats(data.stats.periods, period);
  const scopeHint =
    data.scope === "all" ? "toutes les liaisons" : "liaison sélectionnée";
  const sourceLabel = formatIngestSourceLabel(data);

  return (
    <div
      className={`page-enter dash-page${loading ? " is-refreshing" : ""}`}
    >
      <div
        className="dash-head dash-reveal"
        style={{ "--reveal-delay": "0ms" } as CSSProperties}
      >
        <div>
          <p className="eyebrow">Ops room · lecture</p>
          <h1>Dashboard</h1>
        </div>
        <div className="dash-head-actions">
          <LiaisonScopePicker
            options={data.availableLiaisons}
            value={scope}
            onChange={onScopeChange}
          />
          <button
            type="button"
            className="btn-icon secondary"
            onClick={() => void load(scope)}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : undefined} />
            <span className="btn-label">Actualiser</span>
          </button>
        </div>
      </div>

      <section
        className="dash-section dash-reveal"
        style={{ "--reveal-delay": "60ms" } as CSSProperties}
      >
        <h2 className="dash-section-title">Statut en cours</h2>
        <p className="source-pill-row">
          <span
            className={`source-pill source-${sourceStatusTone(data)}`}
            title={
              [
                data.lastIngest.status
                  ? `Statut: ${data.lastIngest.status}`
                  : "Statut: inconnu",
                data.lastIngest.at
                  ? `${formatWhen(data.lastIngest.at)} (${formatRelative(data.lastIngest.at)})`
                  : null,
                data.lastIngest.detail,
              ]
                .filter(Boolean)
                .join(" — ")
            }
          >
            Source · {sourceLabel}
          </span>
        </p>
        <div className="liaison-dash-list">
          {data.liaisons.map((liaison) => (
            <div key={liaison.id} className="liaison-dash-block">
              {data.scope === "all" && (
                <h2 className="liaison-dash-title">{liaison.displayName}</h2>
              )}
              <div className="grid journey-grid dash-hero-grid">
                <JourneyCard title="Aller" card={liaison.outbound} />
                <JourneyCard title="Retour" card={liaison.inbound} />
              </div>
            </div>
          ))}
          {data.liaisons.length === 0 && (
            <p className="muted">Aucune liaison configurée.</p>
          )}
        </div>
      </section>

      <section
        className="dash-section dash-reveal"
        style={{ "--reveal-delay": "120ms" } as CSSProperties}
      >
        <div className="dash-section-head dash-section-head-wrap">
          <h2 className="dash-section-title">Indicateurs</h2>
          <IndicatorPeriodSwitch value={period} onChange={onPeriodChange} />
        </div>
        <p className="muted section-hint">
          {periodMeta.label} · {periodMeta.hint} · {scopeHint}
        </p>
        <div className="stat-card-grid">
          <StatCard label="Événements" value={p.events} hint="détectés" />
          <StatCard
            label="Retards"
            value={p.delays}
            hint={
              p.avgDelayMinutes != null
                ? `moy. ${p.avgDelayMinutes} min`
                : undefined
            }
            tone={p.delays > 0 ? "warn" : "default"}
          />
          <StatCard
            label="Suppressions"
            value={p.cancellations}
            tone={p.cancellations > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Notifs envoyées"
            value={p.deliveriesSent}
            hint={
              p.deliveriesFailed > 0
                ? `${p.deliveriesFailed} échec${p.deliveriesFailed > 1 ? "s" : ""}`
                : "0 échec"
            }
            tone={p.deliveriesFailed > 0 ? "danger" : "accent"}
          />
        </div>
        <div className="stat-card-grid stat-card-grid-secondary">
          <StatCard
            label="Retard max"
            value={p.maxDelayMinutes != null ? `${p.maxDelayMinutes} min` : "—"}
            hint={`Aller ${p.byDirection.outbound} · Retour ${p.byDirection.inbound}`}
            compact
          />
          <StatCard
            label="Motifs"
            value={
              (p.delayReasons?.length ?? 0) === 0
                ? p.delaysWithoutReason
                  ? "Non renseignés"
                  : "—"
                : (p.delayReasons ?? [])
                    .slice(0, 2)
                    .map((r) => `${r.label} (${r.count})`)
                    .join(" · ")
            }
            hint={
              (p.delaysWithoutReason ?? 0) > 0
                ? `${p.delaysWithoutReason} sans motif`
                : undefined
            }
            compact
          />
        </div>
        <WeatherCorrelationPanel stats={p} />
        <ActivityHeatmap
          days={data.activityHeatmap ?? []}
          scopeHint={scopeHint}
          liaisonId={scope === "all" ? "all" : scope}
        />
      </section>

      <section
        className="dash-section dash-reveal"
        style={{ "--reveal-delay": "180ms" } as CSSProperties}
      >
        <div className="dash-section-head">
          <h2 className="dash-section-title">Activité récente</h2>
          <Link to="/notifications">Historique complet →</Link>
        </div>
        <div className="activity-bento">
          <div className="card activity-panel">
            <h3>Événements</h3>
            <EventsActivityFeed events={data.recentEvents} />
          </div>
          <div className="card activity-panel">
            <h3>Livraisons</h3>
            <DeliveriesActivityFeed deliveries={data.recentDeliveries} />
          </div>
        </div>
      </section>
    </div>
  );
}
