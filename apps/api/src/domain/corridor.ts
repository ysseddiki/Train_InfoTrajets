import type { JourneyConfig } from "@sncf-alerts/shared";

/**
 * Corridor TER côtier Nice ↔ Vintimille (sens Est).
 * Permet d’accepter un terminus *au-delà* de la gare filtre (ex. Menton
 * quand on surveille Nice → Monaco) — les boards n’exposent parfois
 * que le terminus commercial.
 */
export type CorridorStop = {
  /** Identifiants Navitia connus (optionnel) */
  ids: string[];
  /** Tokens libellé board (minuscule) — plus long d’abord pour le matching */
  tokens: string[];
};

export type CorridorDef = {
  id: string;
  stops: CorridorStop[];
};

/** Ouest ← Nice → Est (Italie) */
export const CORRIDOR_NICE_VENTIMIGLIA: CorridorDef = {
  id: "nice-ventimiglia",
  stops: [
    {
      ids: [],
      tokens: ["saint-raphael", "st-raphael", "st raphael", "fréjus", "frejus"],
    },
    {
      ids: [],
      tokens: ["cannes"],
    },
    {
      ids: [],
      tokens: ["antibes", "juan-les-pins", "juan les pins"],
    },
    {
      ids: ["stop_area:SNCF:87756056"],
      tokens: ["nice-ville", "nice ville", "nice"],
    },
    {
      ids: [],
      tokens: ["riquier", "nice-riquier"],
    },
    {
      ids: [],
      tokens: ["villefranche"],
    },
    {
      ids: [],
      tokens: ["beaulieu"],
    },
    {
      ids: [],
      tokens: ["èze", "eze"],
    },
    {
      ids: [],
      tokens: ["cap-d'ail", "cap d'ail", "cap dail"],
    },
    {
      ids: ["stop_area:SNCF:87756403"],
      tokens: ["monaco", "monte-carlo", "monte carlo"],
    },
    {
      ids: [],
      tokens: ["roquebrune", "carnolès", "carnoles"],
    },
    {
      ids: [],
      tokens: ["menton"],
    },
    {
      ids: [],
      tokens: ["vintimille", "ventimiglia"],
    },
  ],
};

const CORRIDORS: CorridorDef[] = [CORRIDOR_NICE_VENTIMIGLIA];

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function stopIndexById(corridor: CorridorDef, stopId: string): number {
  return corridor.stops.findIndex((s) => s.ids.includes(stopId));
}

function stopIndexByLabel(corridor: CorridorDef, label: string): number {
  const n = normalizeText(label);
  let best = -1;
  for (let i = 0; i < corridor.stops.length; i++) {
    for (const t of corridor.stops[i].tokens) {
      if (n.includes(normalizeText(t))) {
        best = Math.max(best, i);
      }
    }
  }
  return best;
}

function findCorridorForJourney(
  journey: Pick<JourneyConfig, "originId" | "destinationId">,
): CorridorDef | null {
  for (const c of CORRIDORS) {
    const o = stopIndexById(c, journey.originId);
    const d = stopIndexById(c, journey.destinationId);
    if (o >= 0 && d >= 0 && o !== d) return c;
  }
  return null;
}

/**
 * Terminus (texte board) au-delà ou égal à la gare filtre sur le corridor
 * depuis l’origine.
 */
export function matchesCorridorAllowlist(
  journey: Pick<
    JourneyConfig,
    "originId" | "destinationId" | "destinationLabel" | "originLabel"
  >,
  directionText: string,
): boolean {
  const corridor = findCorridorForJourney(journey);
  if (!corridor) return false;

  const originIdx = stopIndexById(corridor, journey.originId);
  const destIdx = stopIndexById(corridor, journey.destinationId);
  if (originIdx < 0 || destIdx < 0 || originIdx === destIdx) return false;

  const terminusIdx = stopIndexByLabel(corridor, directionText);
  if (terminusIdx < 0) return false;

  // Sens Est (Nice → Monaco) : accepter Menton, Vintimille, …
  if (destIdx > originIdx) {
    return terminusIdx >= destIdx;
  }
  // Sens Ouest (Monaco → Nice) : accepter Nice, Antibes, Cannes, …
  return terminusIdx <= destIdx;
}
