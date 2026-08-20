/**
 * Origines autorisées pour CORS (lectures cross-site).
 * Liste vide = aucune origine navigateur (l’UI passe par le proxy same-origin).
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowlist: string[],
): boolean {
  if (!origin) return true;
  return allowlist.includes(origin);
}
