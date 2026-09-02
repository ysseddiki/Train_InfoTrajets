/**
 * Mode d'exécution : les gardes de bootstrap dépendent de `NODE_ENV=production`.
 * Les unités systemd du dépôt le positionnent ; un déploiement manuel peut l'oublier,
 * ce qui désactiverait silencieusement le refus de `ADMIN_PASSWORD=changeme`.
 */

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "db",
  "postgres",
]);

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function databaseIsLocal(rawUrl: string | undefined): boolean {
  if (!rawUrl) return true;
  try {
    const hostname = new URL(rawUrl).hostname;
    if (!hostname) return true;
    return LOCAL_HOSTS.has(hostname.toLowerCase());
  } catch {
    return true;
  }
}

/**
 * Avertissement quand la base est distante sans `NODE_ENV=production` : signe d'un
 * déploiement réel où les gardes de production ne s'appliquent pas.
 */
export function productionModeWarning(): string | null {
  if (isProduction()) return null;
  if (databaseIsLocal(process.env.DATABASE_URL)) return null;
  return (
    "NODE_ENV n'est pas 'production' alors que DATABASE_URL pointe vers un hôte distant. " +
    "Les gardes de production (refus de ADMIN_PASSWORD=changeme, cookie Secure implicite) " +
    "sont désactivées. Ajouter Environment=NODE_ENV=production à l'unité systemd."
  );
}
