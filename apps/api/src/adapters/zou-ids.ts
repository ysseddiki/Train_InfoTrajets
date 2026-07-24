/** Extract UIC 8 digits from Navitia stop_area / GTFS stop_id / zone_id. */
export function extractUic(value: string | null | undefined): string | null {
  if (!value) return null;
  const m =
    String(value).match(/(?:SNCF:|MCN:|stop_point:MCN:)?(87\d{6})\b/i) ??
    String(value).match(/\b(87\d{6})\b/);
  return m?.[1] ?? null;
}

/** True if a GTFS / GTFS-RT stop_id refers to the given UIC. */
export function stopIdMatchesUic(
  stopId: string | null | undefined,
  uic: string,
): boolean {
  if (!stopId) return false;
  return String(stopId).includes(uic);
}

export function longToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      return Number((value as { toNumber: () => number }).toNumber());
    } catch {
      /* fall through */
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
