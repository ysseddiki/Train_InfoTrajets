/**
 * BEGIN FEATURE:navitia-orphan-cancellations-from-impacted-objects
 *
 * Suppressions absentes de `departures[]` : on synthétise des trains annulés
 * depuis `disruptions.impacted_objects[].impacted_stops` (gare originId).
 *
 * Revert : phrase exacte documentée dans README.md
 *   « Revert FEATURE:navitia-orphan-cancellations-from-impacted-objects »
 * → supprimer ce fichier + les blocs BEGIN/END portant le même id dans ingest.
 *
 * END FEATURE HEADER
 */

import type { NavitiaDeparture, NavitiaDisruption } from "./departures-navitia.js";
import {
  navitiaStopIdKey,
  parseNavitiaLocalDateTime,
} from "./departures-navitia.js";

/** Id stable pour grep / revert agent. */
export const NAVITIA_ORPHAN_CANCELLATIONS_FEATURE_ID =
  "navitia-orphan-cancellations-from-impacted-objects" as const;

const CANCEL_STOP_STATUSES = new Set([
  "deleted",
  "skipped",
  "no_service",
]);

export type OrphanCancellation = {
  trainNumber: string;
  /** Clé Navitia `YYYYMMDDThhmmss` */
  baseDepartureKey: string;
  scheduledAt: Date;
  cause: string | null;
};

function isStopCancelled(stop: {
  departure_status?: string;
  stop_time_effect?: string;
}): boolean {
  const depStatus = String(stop.departure_status ?? "").toLowerCase();
  const effect = String(stop.stop_time_effect ?? "").toLowerCase();
  return (
    CANCEL_STOP_STATUSES.has(depStatus) || CANCEL_STOP_STATUSES.has(effect)
  );
}

function normalizeHms(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 6) return digits;
  if (digits.length === 4) return `${digits}00`;
  return null;
}

function trainTokensFromDeparture(dep: NavitiaDeparture): string[] {
  const info = dep.display_informations;
  const out: string[] = [];
  for (const c of [
    info?.trip_short_name,
    info?.headsign,
    info?.number,
    info?.name,
    info?.label,
  ]) {
    const t = String(c ?? "").trim();
    if (!t) continue;
    out.push(t.toUpperCase());
    const m = t.match(/\b([A-Z]?\d{3,5})\b/i);
    if (m?.[1]) out.push(m[1].toUpperCase());
  }
  return out;
}

/** Clés déjà couvertes par le board `departures` (évite double comptage). */
export function coveredKeysFromDepartures(
  departures: NavitiaDeparture[],
): Set<string> {
  const keys = new Set<string>();
  for (const dep of departures) {
    const base = dep.stop_date_time?.base_departure_date_time;
    const hms =
      base && base.length >= 15
        ? base.slice(9, 15)
        : normalizeHms(base ?? undefined);
    for (const tok of trainTokensFromDeparture(dep)) {
      if (hms) keys.add(`${tok}|${hms}`);
      if (base) keys.add(`${tok}|${base}`);
    }
  }
  return keys;
}

/**
 * Trains supprimés à la gare surveillée présents dans `impacted_objects`
 * mais absents (ou non appariés) de `departures[]`.
 */
export function listOrphanCancellationsFromImpactedObjects(input: {
  disruptions: NavitiaDisruption[];
  originStopId: string | null | undefined;
  coveredKeys: Set<string>;
  /** Jour civil Europe/Paris `YYYYMMDD` pour coller `base_departure_time`. */
  dayYmd: string;
}): OrphanCancellation[] {
  const originKey = navitiaStopIdKey(input.originStopId);
  if (!originKey) return [];
  const day = String(input.dayYmd).replace(/\D/g, "").slice(0, 8);
  if (day.length !== 8) return [];

  const out: OrphanCancellation[] = [];
  const seen = new Set<string>();

  for (const d of input.disruptions) {
    for (const obj of d.impacted_objects ?? []) {
      const train = String(obj.pt_object?.trip?.name ?? "")
        .trim()
        .toUpperCase();
      if (!train) continue;

      for (const stop of obj.impacted_stops ?? []) {
        const stopKey = navitiaStopIdKey(stop.stop_point?.id);
        if (!stopKey || stopKey !== originKey) continue;
        if (!isStopCancelled(stop)) continue;

        const hms = normalizeHms(
          stop.base_departure_time ?? stop.base_arrival_time,
        );
        if (!hms) continue;

        const coverKey = `${train}|${hms}`;
        if (input.coveredKeys.has(coverKey)) continue;
        if (input.coveredKeys.has(`${train}|${day}T${hms}`)) continue;

        const baseDepartureKey = `${day}T${hms}`;
        if (seen.has(`${train}|${baseDepartureKey}`)) continue;
        seen.add(`${train}|${baseDepartureKey}`);

        const scheduledAt = parseNavitiaLocalDateTime(baseDepartureKey);
        if (!scheduledAt) continue;

        const cause = String(stop.cause ?? d.cause ?? "").trim() || null;
        out.push({
          trainNumber: train,
          baseDepartureKey,
          scheduledAt,
          cause,
        });
      }
    }
  }

  out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  return out;
}

// END FEATURE:navitia-orphan-cancellations-from-impacted-objects
