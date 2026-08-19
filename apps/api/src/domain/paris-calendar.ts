const TZ = "Europe/Paris";

const WEEKDAY_MON1: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Jour civil Europe/Paris (YYYY-MM-DD). */
export function parisYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parisParts(now: Date): {
  year: number;
  month: number;
  day: number;
  weekdayMon1: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekdayMon1: WEEKDAY_MON1[get("weekday")] ?? 1,
  };
}

/** Ajoute `delta` jours à une date civile YYYY-MM-DD (calendrier, pas TZ). */
export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Minuit Europe/Paris du jour `ymd` → ISO UTC.
 * Gère le DST (itération sur l’offset Paris).
 */
export function parisMidnightIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(t));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const actual = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const wanted = Date.UTC(y, m - 1, d, 0, 0, 0);
    const diff = wanted - actual;
    if (diff === 0) break;
    t += diff;
  }
  return new Date(t).toISOString();
}

export interface DashboardPeriodStarts {
  today: string;
  last24h: string;
  week: string;
  month: string;
  year: string;
  last7d: string;
  last30d: string;
}

/** Bornes inférieures (inclusives) pour les agrégats dashboard. */
export function dashboardPeriodStarts(now = new Date()): DashboardPeriodStarts {
  const ymd = parisYmd(now);
  const { year, month, weekdayMon1 } = parisParts(now);
  const weekStartYmd = addDaysYmd(ymd, -(weekdayMon1 - 1));
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const yearStart = `${year}-01-01`;
  return {
    today: parisMidnightIso(ymd),
    last24h: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(),
    week: parisMidnightIso(weekStartYmd),
    month: parisMidnightIso(monthStart),
    year: parisMidnightIso(yearStart),
    last7d: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
    last30d: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
  };
}
