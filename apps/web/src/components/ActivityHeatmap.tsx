import type { DashboardHeatmapDay } from "@sncf-alerts/shared";
import { useMemo } from "react";

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
  if (count <= 15) return 1; // léger
  if (count <= 40) return 2; // modéré
  if (count <= 90) return 3; // important
  return 4; // très important
}

type Cell = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
};

type WeekCol = {
  cells: Cell[];
  monthLabel: string | null;
};

function buildWeeks(days: DashboardHeatmapDay[]): { weeks: WeekCol[]; max: number } {
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
    const count = byDate.get(key) ?? 0;
    cells.push({ date: key, count, level: 0, future: key > todayKey });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const max = Math.max(0, ...cells.map((c) => c.count));
  for (const c of cells) {
    c.level = c.future ? 0 : levelForCount(c.count);
  }

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

export function ActivityHeatmap({
  days,
  scopeHint,
}: {
  days: DashboardHeatmapDay[];
  scopeHint?: string;
}) {
  const { weeks, max } = useMemo(() => buildWeeks(days), [days]);

  return (
    <div className="heatmap-card">
      <div className="heatmap-head">
        <h3>Retards (heatmap)</h3>
        <p className="muted">
          53 semaines · score retard
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
                  {week.cells.map((cell) => (
                    <span
                      key={cell.date}
                      className={`heatmap-cell level-${cell.future ? "empty" : cell.level}`}
                      title={
                        cell.future
                          ? undefined
                          : `${cell.date} · score retard ${cell.count}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="heatmap-legend">
          <span className="muted">Aucun</span>
          <span className="heatmap-cell level-0" title="Aucun retard" />
          <span className="heatmap-cell level-1" title="Léger" />
          <span className="heatmap-cell level-2" title="Modéré" />
          <span className="heatmap-cell level-3" title="Important" />
          <span className="heatmap-cell level-4" title="Très important" />
          <span className="muted">Fort retard</span>
        </div>
      </div>
    </div>
  );
}
