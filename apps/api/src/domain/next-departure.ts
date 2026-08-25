import type { NextDepartureInfo, NextDepartureStatus } from "@sncf-alerts/shared";
import { parisMidnightIso, parisYmd } from "./paris-calendar.js";

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

/** Parse HH:mm du jour (Europe/Paris) → ISO UTC. */
export function hmTodayToIso(hm: string | null | undefined): string | null {
  if (!hm) return null;
  const m = hm.trim().match(/^(\d{1,2})[:hH](\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const midnight = new Date(parisMidnightIso(parisYmd())).getTime();
  return new Date(midnight + hour * 3_600_000 + minute * 60_000).toISOString();
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
