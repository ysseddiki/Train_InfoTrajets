import type { JourneyConfig, DisruptionEventDto } from "@sncf-alerts/shared";

/** Paris weekday: 1=Mon .. 7=Sun */
function parisParts(date: Date): { weekday: number; hm: string } {
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

function inWindow(hm: string, start: string, end: string): boolean {
  if (start <= end) return hm >= start && hm <= end;
  // overnight window
  return hm >= start || hm <= end;
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

  const { weekday, hm } = parisParts(new Date(event.startsAt || now));
  if (!journey.daysOfWeek.includes(weekday)) return false;
  if (!inWindow(hm, journey.timeWindow.start, journey.timeWindow.end)) {
    return false;
  }

  if (event.kind === "delay") {
    const delay = event.delayMinutes ?? 0;
    if (delay < journey.minDelayMinutes) return false;
  }

  return true;
}

export function resolveDirection(
  journeys: JourneyConfig[],
  event: Pick<DisruptionEventDto, "kind" | "delayMinutes" | "startsAt" | "direction">,
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
