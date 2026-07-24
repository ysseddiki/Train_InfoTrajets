import type { NextDepartureInfo, NextDepartureStatus } from "@sncf-alerts/shared";

export function formatHmParis(isoOrDate: string | Date | null | undefined): string | null {
  if (!isoOrDate) return null;
  try {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return null;
  }
}

/** Parse HH:mm du jour (Europe/Paris) → ISO approximatif. */
export function hmTodayToIso(hm: string | null | undefined): string | null {
  if (!hm) return null;
  const m = hm.trim().match(/^(\d{1,2})[:hH](\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const mo = Number(get("month"));
  const day = Number(get("day"));
  const guess = new Date(
    `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
  );
  return Number.isNaN(guess.getTime()) ? null : guess.toISOString();
}

export function buildNextDepartureStatus(input: {
  cancelled: boolean;
  delayMinutes: number | null;
  delayedUnknown?: boolean;
}): { status: NextDepartureStatus; statusLabel: string } {
  if (input.cancelled) {
    return { status: "cancelled", statusLabel: "Supprimé" };
  }
  if (input.delayedUnknown) {
    return { status: "unknown", statusLabel: "Retard unknown" };
  }
  if (input.delayMinutes == null) {
    return { status: "unknown", statusLabel: "Statut unknown" };
  }
  if (input.delayMinutes <= 0) {
    return { status: "on_time", statusLabel: "À l’heure" };
  }
  return {
    status: "delayed",
    statusLabel: `Retard ${input.delayMinutes} min`,
  };
}

export function toNextDepartureInfo(input: {
  trainNumber: string | null;
  scheduledAt: string | null;
  realtimeAt: string | null;
  delayMinutes: number | null;
  cancelled: boolean;
  delayedUnknown?: boolean;
  fetchedAt: string;
  source: NextDepartureInfo["source"];
}): NextDepartureInfo {
  const { status, statusLabel } = buildNextDepartureStatus({
    cancelled: input.cancelled,
    delayMinutes: input.delayMinutes,
    delayedUnknown: input.delayedUnknown,
  });
  const scheduledTime = formatHmParis(input.scheduledAt);
  const realtimeTime = formatHmParis(input.realtimeAt);
  return {
    trainNumber: input.trainNumber?.trim() || null,
    scheduledTime,
    realtimeTime:
      realtimeTime && realtimeTime !== scheduledTime ? realtimeTime : null,
    delayMinutes: input.cancelled ? null : input.delayMinutes,
    status,
    statusLabel,
    fetchedAt: input.fetchedAt,
    source: input.source,
  };
}
