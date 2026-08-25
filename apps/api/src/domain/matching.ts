import type { JourneyConfig, DisruptionEventDto } from "@sncf-alerts/shared";
import {
  clampWatchLeadHours,
  DEFAULT_WATCH_LAG_HOURS,
} from "@sncf-alerts/shared";
import { matchesCorridorAllowlist } from "./corridor.js";

/** Helpers terminus saisis sur la gare catalogue (filtre destination). */
export type TerminusHelpersInput = {
  enabled: boolean;
  labels: string[];
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Match board/headsign text against admin terminus helper labels (when enabled).
 *  Sémantique = terminus commercial affiché, pas « n’importe quel arrêt desservi ».
 */
export function matchesTerminusHelpers(
  directionText: string,
  helpers: TerminusHelpersInput | null | undefined,
): boolean {
  if (!helpers?.enabled) return false;
  const text = normalizeText(directionText);
  if (!text) return false;
  for (const raw of helpers.labels) {
    const label = normalizeText(raw).trim();
    if (label.length < 3) continue;
    if (text.includes(label)) return true;
    const tokens = label
      .split(/[\s\-–—,/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
    if (tokens.some((t) => text.includes(t))) return true;
  }
  return false;
}

/** Europe/Paris weekday: 1=Mon .. 7=Sun */
export function parisParts(date: Date): { weekday: number; hm: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return { weekday: map[weekdayName] ?? 1, hm: `${hour}:${minute}` };
}

export function inWindow(hm: string, start: string, end: string): boolean {
  if (start <= end) return hm >= start && hm <= end;
  return hm >= start || hm <= end;
}

function wrapHmMinutes(totalMinutes: number): string {
  const total = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

/** Soustrait N heures à un HH:mm (wrap 24 h). */
export function subtractHoursHm(hm: string, hours: number): string {
  const [hs, ms] = hm.split(":");
  const h = Number(hs) || 0;
  const m = Number(ms) || 0;
  return wrapHmMinutes(h * 60 + m - Math.round(hours) * 60);
}

/** Ajoute N heures à un HH:mm (wrap 24 h). */
export function addHoursHm(hm: string, hours: number): string {
  const [hs, ms] = hm.split(":");
  const h = Number(hs) || 0;
  const m = Number(ms) || 0;
  return wrapHmMinutes(h * 60 + m + Math.round(hours) * 60);
}

/** Tolérance : un départ réel d’il y a quelques minutes est encore « en gare ». */
export const DEPARTURE_STILL_DUE_SLACK_MS = 5 * 60_000;

type WatchSchedule = Pick<
  JourneyConfig,
  "daysOfWeek" | "timeWindow" | "watchAlways" | "watchLeadHours"
>;

function yesterdayWeekday(weekday: number): number {
  return weekday === 1 ? 7 : weekday - 1;
}

/**
 * Veille « cœur » : [start − lead, end] (logique historique, sans lag).
 */
export function isInCoreWatchSchedule(
  journey: WatchSchedule,
  at = new Date(),
): boolean {
  const { weekday, hm } = parisParts(at);

  if (journey.watchAlways) {
    return journey.daysOfWeek.includes(weekday);
  }

  const lead = clampWatchLeadHours(journey.watchLeadHours);
  const travelStart = journey.timeWindow.start;
  const watchStart = subtractHoursHm(travelStart, lead);
  const watchEnd = journey.timeWindow.end;
  const crossedMidnight = watchStart > travelStart;

  if (
    journey.daysOfWeek.includes(weekday) &&
    inWindow(hm, watchStart, watchEnd)
  ) {
    return true;
  }

  // Lead qui traverse minuit : veille en fin de journée si demain = jour trajet
  if (crossedMidnight) {
    const yesterday = yesterdayWeekday(weekday);
    if (journey.daysOfWeek.includes(yesterday) && hm >= watchStart) {
      return true;
    }
  }

  return false;
}

/** Après `time_window.end`, jusqu’à +lagHours (trains théoriques encore en gare). */
function isInLagWindow(
  journey: WatchSchedule,
  at: Date,
  lagHours: number,
): boolean {
  if (lagHours <= 0 || journey.watchAlways) return false;
  const { weekday, hm } = parisParts(at);
  const travelEnd = journey.timeWindow.end;
  const lagEnd = addHoursHm(travelEnd, lagHours);
  const wrapped = lagEnd < travelEnd;

  if (!wrapped) {
    if (!journey.daysOfWeek.includes(weekday)) return false;
    return hm > travelEnd && hm <= lagEnd;
  }

  if (journey.daysOfWeek.includes(weekday) && hm > travelEnd) {
    return true;
  }
  const yesterday = yesterdayWeekday(weekday);
  return journey.daysOfWeek.includes(yesterday) && hm <= lagEnd;
}

/**
 * Jour + heures de veille (sans tester `active`).
 * Veille continue → jours seulement ; sinon [start − lead, end + 2 h].
 */
export function isInWatchSchedule(
  journey: WatchSchedule,
  at = new Date(),
): boolean {
  if (isInCoreWatchSchedule(journey, at)) return true;
  return isInLagWindow(journey, at, DEFAULT_WATCH_LAG_HOURS);
}

export function isDepartureStillDue(
  realtime: Date | null,
  scheduled: Date | null,
  now = new Date(),
): boolean {
  const t = realtime ?? scheduled;
  if (!t) return true;
  return t.getTime() >= now.getTime() - DEPARTURE_STILL_DUE_SLACK_MS;
}

export function isScheduledInTravelWindow(
  journey: WatchSchedule,
  scheduled: Date,
): boolean {
  const { weekday, hm } = parisParts(scheduled);
  if (!journey.daysOfWeek.includes(weekday)) return false;
  return inWindow(hm, journey.timeWindow.start, journey.timeWindow.end);
}

/**
 * Départ à suivre pendant la veille : encore dû en temps réel, et heure
 * **théorique** dans la fenêtre trajet (lead / lag ne changent pas le set de trains).
 * `watch_always` : pas de filtre horaire sur le départ.
 */
export function isWatchedDeparture(
  journey: Pick<
    JourneyConfig,
    | "active"
    | "daysOfWeek"
    | "timeWindow"
    | "watchAlways"
    | "watchLeadHours"
  >,
  scheduled: Date | null,
  realtime: Date | null,
  now = new Date(),
  cancelled = false,
): boolean {
  if (!journey.active) return false;
  // Supprimés : encore visibles jusqu’à l’heure théorique (+ slack), pas toute la journée
  const dueRealtime = cancelled ? scheduled : realtime;
  if (!isDepartureStillDue(dueRealtime, scheduled, now)) {
    return false;
  }
  if (!isInWatchSchedule(journey, now)) return false;
  if (journey.watchAlways) return true;
  if (!scheduled) return true;
  return isScheduledInTravelWindow(journey, scheduled);
}

/** True if now is inside the journey watch window (days + veille, Europe/Paris). */
export function isWithinWatchWindow(
  journey: JourneyConfig,
  now = new Date(),
): boolean {
  if (!journey.active) return false;
  return isInWatchSchedule(journey, now);
}

export function matchesJourney(
  journey: JourneyConfig,
  event: Pick<
    DisruptionEventDto,
    "kind" | "delayMinutes" | "startsAt" | "direction"
  >,
  now = new Date(),
): boolean {
  if (!journey.active) return false;
  if (event.direction && event.direction !== journey.direction) return false;
  if (!journey.severities.includes(event.kind)) return false;

  const at = new Date(event.startsAt || now);
  if (!isInWatchSchedule(journey, at)) return false;

  if (event.kind === "delay") {
    // Seuil numérique seulement si la durée est connue ; null = unknown (éligible)
    if (
      event.delayMinutes != null &&
      event.delayMinutes < journey.minDelayMinutes
    ) {
      return false;
    }
  }

  return true;
}

export function resolveDirection(
  journeys: JourneyConfig[],
  event: Pick<
    DisruptionEventDto,
    "kind" | "delayMinutes" | "startsAt" | "direction" | "journeyId"
  >,
): JourneyConfig | null {
  if (event.journeyId) {
    const j = journeys.find((x) => x.id === event.journeyId);
    if (j && matchesJourney(j, event)) return j;
    return null;
  }
  if (event.direction) {
    const candidates = journeys.filter((x) => x.direction === event.direction);
    for (const j of candidates) {
      if (matchesJourney(j, event)) return j;
    }
    return null;
  }
  for (const j of journeys) {
    if (matchesJourney(j, { ...event, direction: j.direction })) return j;
  }
  return null;
}

/** Does departure board text mention the configured served station (filter)? */
export function matchesDestinationFilter(
  journey: JourneyConfig,
  directionText: string,
  destinationId?: string | null,
  terminusHelpers?: TerminusHelpersInput | null,
): boolean {
  const text = directionText.toLowerCase();
  const label = journey.destinationLabel.toLowerCase();
  const tokens = label
    .split(/[\s\-–—,/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  // Match by stop id if the feed exposes it (served station, not only terminus)
  if (destinationId && journey.destinationId && destinationId === journey.destinationId) {
    return true;
  }
  if (label && text.includes(label)) return true;
  // partial tokens: "Monaco", "Nice", etc. — covers "via Monaco" / longer headsigns
  if (tokens.some((t) => text.includes(t))) return true;

  // Terminus helpers (legacy catalogue) — Navitia n’en passe pas
  if (matchesTerminusHelpers(directionText, terminusHelpers)) return true;

  // Boards terminus-only : Menton au-delà de Monaco, etc.
  return matchesCorridorAllowlist(journey, directionText);
}

/**
 * Matching Navitia (source primaire) : label / id / corridor only.
 * Les terminus helpers catalogue ne sont pas utilisés.
 */
export async function matchesDestinationFilterAsync(
  journey: JourneyConfig,
  directionText: string,
  destinationId?: string | null,
): Promise<boolean> {
  return matchesDestinationFilter(journey, directionText, destinationId, null);
}
