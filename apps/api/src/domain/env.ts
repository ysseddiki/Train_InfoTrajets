import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Minimal .env loader (no external dependency). Does not override existing env vars. */
export function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Entier positif depuis l'environnement, avec repli.
 *
 * À appeler **au moment de l'usage**, jamais au chargement du module : `loadRepoEnv()`
 * s'exécute après l'évaluation des imports, donc une constante de module lue trop tôt
 * ignorerait silencieusement la valeur du `.env`.
 */
export function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/** Load repo-root .env (apps/api/src/domain → ../../../..) */
export function loadRepoEnv(): void {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../..",
  );
  loadEnvFile(path.join(repoRoot, ".env"));
}
