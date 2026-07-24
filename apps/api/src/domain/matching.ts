import type { JourneyConfig, DisruptionEventDto } from "@sncf-alerts/shared";

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

/** True if now is inside the journey watch window (days + hours, Europe/Paris). */
export function isWithinWatchWindow(
  journey: JourneyConfig,
  now = new Date(),
): boolean {
  if (!journey.active) return false;
  const { weekday, hm } = parisParts(now);
  if (!journey.daysOfWeek.includes(weekday)) return false;
  return inWindow(hm, journey.timeWindow.start, journey.timeWindow.end);
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
  const { weekday, hm } = parisParts(at);
  if (!journey.daysOfWeek.includes(weekday)) return false;
  if (!inWindow(hm, journey.timeWindow.start, journey.timeWindow.end)) {
    return false;
  }

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
    "kind" | "delayMinutes" | "startsAt" | "direction"
  >,
): JourneyConfig | null {
  if (event.direction) {
    const j = journeys.find((x) => x.direction === event.direction);
    if (j && matchesJourney(j, event)) return j;
    return null;
  }
  for (const j of journeys) {
    if (matchesJourney(j, { ...event, direction: j.direction })) return j;
  }
  return null;
}

/** Does departure board direction match the configured destination filter? */
export function matchesDestinationFilter(
  journey: JourneyConfig,
  directionText: string,
  destinationId?: string | null,
): boolean {
  const text = directionText.toLowerCase();
  const label = journey.destinationLabel.toLowerCase();
  const tokens = label
    .split(/[\s\-–—,/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  if (destinationId && journey.destinationId && destinationId === journey.destinationId) {
    return true;
  }
  if (label && text.includes(label)) return true;
  // partial: "Monaco", "Nice", etc.
  return tokens.some((t) => text.includes(t));
}
