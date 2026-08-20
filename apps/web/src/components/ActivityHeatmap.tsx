import type {
  DashboardDayDetail,
  DashboardDayWeather,
  DashboardHeatmapDay,
} from "@sncf-alerts/shared";
import { formatDelayMinutes } from "@sncf-alerts/shared";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";
import {
  directionLabel,
  errorMessage,
  formatDateLongParis,
  formatTimeParis,
  formatTrainNumber,
  kindLabel,
} from "../lib/format";

const MONTHS_FR = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function toDateKey(y: number, m: number, day: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parisToday(): { y: number; m: number; day: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    dow: dowMap[weekday] ?? 0,
  };
}

/** 0 = aucun retard (vert) ; 1–4 = jaune → rouge selon score minutes. */
function levelForCount(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 15) return 1;
  if (count <= 40) return 2;
  if (count <= 90) return 3;
  return 4;
}

type CellLevel = "future" | "none" | 0 | 1 | 2 | 3 | 4;

type Cell = {
  date: string;
  count: number;
  level: CellLevel;
  hasData: boolean;
};

type WeekCol = {
  cells: Cell[];
  monthLabel: string | null;
};

function buildWeeks(days: DashboardHeatmapDay[]): {
  weeks: WeekCol[];
  max: number;
} {
  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const todayP = parisToday();
  const todayKey = toDateKey(todayP.y, todayP.m, todayP.day);

  const end = new Date(Date.UTC(todayP.y, todayP.m - 1, todayP.day, 12, 0, 0));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 52 * 7 - todayP.dow);

  const cells: Cell[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = toDateKey(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
    );
    const hasData = byDate.has(key);
    const count = byDate.get(key) ?? 0;
    const future = key > todayKey;
    let level: CellLevel;
    if (future) level = "future";
    else if (!hasData) level = "none";
    else level = levelForCount(count);
    cells.push({ date: key, count, level, hasData });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const max = Math.max(0, ...cells.map((c) => c.count));

  const weeks: WeekCol[] = [];
  let lastMonth = -1;
  for (let i = 0; i < cells.length; i += 7) {
    const weekCells = cells.slice(i, i + 7);
    const first = weekCells[0];
    const month = first ? Number(first.date.slice(5, 7)) : -1;
    const monthLabel =
      month !== lastMonth ? (MONTHS_FR[month - 1] ?? null) : null;
    if (month !== lastMonth) lastMonth = month;
    weeks.push({ cells: weekCells, monthLabel });
  }

  return { weeks, max };
}

function cellClass(level: CellLevel): string {
  if (level === "future") return "level-empty";
  if (level === "none") return "level-none";
  return `level-${level}`;
}

function cellTitle(cell: Cell): string | undefined {
  if (cell.level === "future") return undefined;
  if (!cell.hasData) return `${cell.date} · aucune donnée`;
  if (cell.count <= 0) return `${cell.date} · aucun retard`;
  return `${cell.date} · score retard ${cell.count}`;
}

function dayPath(date: string, liaisonId?: string): string {
  const q = new URLSearchParams({ date });
  if (liaisonId) q.set("liaisonId", liaisonId);
  return `/v1/dashboard/day?${q.toString()}`;
}

function weatherHeadline(label: string | null | undefined): string | null {
  if (!label) return null;
  return label.split(" (WMO")[0] ?? label;
}

function weatherBits(wx: DashboardDayWeather): string[] {
  const bits: string[] = [];
  if (wx.temperatureC != null) bits.push(`${wx.temperatureC} °C`);
  if (wx.precipitationMm != null && wx.precipitationMm > 0) {
    bits.push(
      wx.source === "daily"
        ? `${wx.precipitationMm} mm`
        : `${wx.precipitationMm} mm/h`,
    );
  }
  if (wx.windSpeedKmh != null) bits.push(`vent ${wx.windSpeedKmh} km/h`);
  return bits;
}

function HeatmapDayPanel({
  date,
  loading,
  error,
  detail,
  onClose,
}: {
  date: string;
  loading: boolean;
  error: string | null;
  detail: DashboardDayDetail | null;
  onClose: () => void;
}) {
  const title = formatDateLongParis(date);
  const wx = detail?.weather ?? null;
  const headline = weatherHeadline(wx?.weatherLabel);

  return (
    <div
      className="heatmap-day-panel"
      role="region"
      aria-live="polite"
      aria-label={`Détail du ${title}`}
    >
      <header className="heatmap-day-panel-head">
        <h4>{title}</h4>
        <button type="button" className="secondary heatmap-day-close" onClick={onClose}>
          Fermer
        </button>
      </header>

      {loading ? <p className="muted">Chargement du jour…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && detail ? (
        <>
          <section className="heatmap-day-weather">
            <h5>Météo du jour</h5>
            {wx && (headline || weatherBits(wx).length > 0) ? (
              <p>
                {headline ? <strong>{headline}</strong> : null}
                {wx.stationLabel ? (
                  <span className="muted">
                    {headline ? " · " : ""}
                    {wx.stationLabel}
                  </span>
                ) : null}
                {weatherBits(wx).length > 0 ? (
                  <span className="muted">
                    {(headline || wx.stationLabel) ? " · " : ""}
                    {weatherBits(wx).join(" · ")}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="muted">Météo inconnue pour ce jour.</p>
            )}
          </section>

          <section className="heatmap-day-reasons">
            <h5>Motifs</h5>
            {detail.delayReasons.length === 0 &&
            detail.delaysWithoutReason === 0 ? (
              <p className="muted">Aucun motif de retard ce jour.</p>
            ) : (
              <ul>
                {detail.delayReasons.map((r) => (
                  <li key={r.key}>
                    {r.label} <span className="muted">({r.count})</span>
                  </li>
                ))}
                {detail.delaysWithoutReason > 0 ? (
                  <li className="muted">
                    {detail.delaysWithoutReason} sans motif
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <section className="heatmap-day-events">
            <h5>Retards</h5>
            {detail.events.length === 0 ? (
              <p className="muted">
                {detail.hasObservation
                  ? "Aucun retard ce jour."
                  : "Aucune donnée d’observation ce jour."}
              </p>
            ) : (
              <ul className="heatmap-day-event-list">
                {detail.events.map((e) => (
                  <li key={e.id}>
                    <time dateTime={e.detectedAt}>
                      {formatTimeParis(e.detectedAt)}
                    </time>
                    <div>
                      <div className="heatmap-day-event-tags">
                        <span className="pill">{kindLabel(e.kind)}</span>
                        <span className="pill pill-muted">
                          {directionLabel(e.direction)}
                        </span>
                        {e.trainNumber ? (
                          <span className="pill pill-muted">
                            {formatTrainNumber(e.trainNumber)}
                          </span>
                        ) : null}
                        {(e.kind === "delay" || e.delayMinutes != null) && (
                          <span className="pill pill-warn">
                            {formatDelayMinutes(e.delayMinutes, e.kind)}
                          </span>
                        )}
                      </div>
                      {e.delayReason ? (
                        <p className="muted">Motif : {e.delayReason}</p>
                      ) : e.kind === "delay" ? (
                        <p className="muted">Motif non renseigné</p>
                      ) : null}
                      {e.weatherLabel ? (
                        <p className="muted">
                          Météo à la détection :{" "}
                          {weatherHeadline(e.weatherLabel)}
                          {e.temperatureC != null
                            ? ` · ${e.temperatureC} °C`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function ActivityHeatmap({
  days,
  scopeHint,
  liaisonId,
}: {
  days: DashboardHeatmapDay[];
  scopeHint?: string;
  liaisonId?: string;
}) {
  const { weeks, max } = useMemo(() => buildWeeks(days), [days]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DashboardDayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDate(null);
    setDetail(null);
    setError(null);
    setLoading(false);
  }, [liaisonId]);

  useEffect(() => {
    if (!selectedDate) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    void apiGet<DashboardDayDetail>(dayPath(selectedDate, liaisonId))
      .then((data) => {
        if (ac.signal.aborted) return;
        setDetail(data);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [selectedDate, liaisonId]);

  function onSelect(cell: Cell) {
    if (cell.level === "future") return;
    setSelectedDate((cur) => (cur === cell.date ? null : cell.date));
  }

  return (
    <div className="heatmap-card">
      <div className="heatmap-head">
        <h3>Retards (heatmap)</h3>
        <p className="muted">
          53 semaines · score retard · clic un jour
          {scopeHint ? ` · ${scopeHint}` : ""}
          {max > 0 ? ` · max ${max}/j` : ""}
        </p>
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap">
          <div className="heatmap-dow" aria-hidden>
            <span className="heatmap-dow-spacer" />
            <span>L</span>
            <span />
            <span>M</span>
            <span />
            <span>V</span>
            <span />
          </div>
          <div className="heatmap-grid-wrap">
            <div className="heatmap-months" aria-hidden>
              {weeks.map((w, i) => (
                <span key={`m-${i}`} className="heatmap-month">
                  {w.monthLabel ?? ""}
                </span>
              ))}
            </div>
            <div className="heatmap-weeks">
              {weeks.map((week, wi) => (
                <div key={wi} className="heatmap-week">
                  {week.cells.map((cell) =>
                    cell.level === "future" ? (
                      <span
                        key={cell.date}
                        className={`heatmap-cell ${cellClass(cell.level)}`}
                      />
                    ) : (
                      <button
                        key={cell.date}
                        type="button"
                        className={`heatmap-cell ${cellClass(cell.level)}${
                          selectedDate === cell.date ? " is-selected" : ""
                        }`}
                        title={cellTitle(cell)}
                        aria-label={cellTitle(cell)}
                        aria-pressed={selectedDate === cell.date}
                        onClick={() => onSelect(cell)}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="heatmap-legend">
          <span className="muted">Sans donnée</span>
          <span className="heatmap-cell level-none" title="Aucune donnée" />
          <span className="heatmap-cell level-0" title="Aucun retard" />
          <span className="heatmap-cell level-1" title="Léger" />
          <span className="heatmap-cell level-2" title="Modéré" />
          <span className="heatmap-cell level-3" title="Important" />
          <span className="heatmap-cell level-4" title="Très important" />
          <span className="muted">Fort retard</span>
        </div>
      </div>
      {selectedDate ? (
        <HeatmapDayPanel
          date={selectedDate}
          loading={loading}
          error={error}
          detail={detail}
          onClose={() => setSelectedDate(null)}
        />
      ) : null}
    </div>
  );
}
