/**
 * Limiteurs de débit en mémoire (process-local, suffisant pour un déploiement ops
 * mono-instance).
 *
 * Login : deux dimensions complémentaires.
 * - par IP réelle : bride un attaquant donné (nécessite `trustProxy` correctement réglé,
 *   sinon toutes les requêtes derrière le proxy partagent un seul compteur) ;
 * - par identifiant : bride une attaque distribuée ciblant un compte précis.
 *
 * Lecture : un plafond global par IP sur `/v1/*`, volontairement large pour ne pas gêner
 * l'UI, mais suffisant pour couper le scraping.
 */

import { envPositiveInt } from "./env.js";

export type RateDecision = {
  allowed: boolean;
  retryAfterSec: number;
};

type Bucket = {
  count: number;
  resetAt: number;
  /** Fenêtres consécutives saturées — allonge la pénalité. */
  strikes: number;
};

// Lus à l'usage : `loadRepoEnv()` tourne après l'évaluation des imports.
const loginWindowMs = () => envPositiveInt("LOGIN_RATE_WINDOW_MS", 15 * 60_000);
const loginMaxIp = () => envPositiveInt("LOGIN_RATE_MAX", 10);
/** Plus large que le seuil IP : plusieurs opérateurs légitimes partagent un compte. */
const loginMaxUser = () => envPositiveInt("LOGIN_RATE_MAX_USER", 20);

const readWindowMs = () => envPositiveInt("READ_RATE_WINDOW_MS", 60_000);
const readMax = () => envPositiveInt("READ_RATE_MAX", 300);

/** Au-delà, la pénalité de backoff n'augmente plus (évite un blocage perpétuel). */
const MAX_STRIKES = 4;
/** Borne mémoire face à des IP tournantes. */
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  // Toujours saturé : purge les plus anciennes (Map itère dans l'ordre d'insertion)
  const excess = buckets.size - MAX_BUCKETS + 1;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++removed >= excess) break;
  }
}

function consume(
  key: string,
  max: number,
  windowMs: number,
  backoff: boolean,
): RateDecision {
  const now = Date.now();
  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // Une fenêtre écoulée sans nouvelle saturation fait décroître la pénalité
    const strikes = bucket ? Math.max(0, bucket.strikes - 1) : 0;
    bucket = { count: 0, resetAt: now + windowMs, strikes };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  if (backoff && bucket.count >= max) {
    bucket.strikes = Math.min(bucket.strikes + 1, MAX_STRIKES);
    const penaltyMs = windowMs * 2 ** (bucket.strikes - 1);
    bucket.resetAt = Math.max(bucket.resetAt, now + penaltyMs);
  }
  return { allowed: true, retryAfterSec: 0 };
}

function loginIpKey(ip: string): string {
  return `login:ip:${ip || "unknown"}`;
}

function loginUserKey(username: string): string {
  return `login:user:${username.trim().toLowerCase() || "unknown"}`;
}

/**
 * Consomme une tentative de connexion sur les deux dimensions.
 * Les deux compteurs sont incrémentés même si l'un refuse déjà, afin qu'un attaquant
 * ne puisse pas préserver une dimension en saturant l'autre.
 */
export function checkLoginRateLimit(
  ip: string,
  username: string,
): RateDecision {
  const windowMs = loginWindowMs();
  const byIp = consume(loginIpKey(ip), loginMaxIp(), windowMs, true);
  const byUser = consume(loginUserKey(username), loginMaxUser(), windowMs, true);
  if (byIp.allowed && byUser.allowed) {
    return { allowed: true, retryAfterSec: 0 };
  }
  return {
    allowed: false,
    retryAfterSec: Math.max(byIp.retryAfterSec, byUser.retryAfterSec),
  };
}

/**
 * Connexion réussie : ne libère que le couple (IP, identifiant) concerné.
 *
 * Le compteur par identifiant est également libéré : sans cela, un attaquant saturant
 * `admin` verrouillerait durablement le titulaire légitime. Le compteur par IP reste la
 * barrière contre le brute force, et il n'est jamais réinitialisé par un tiers.
 */
export function resetLoginRateLimit(ip: string, username: string): void {
  buckets.delete(loginIpKey(ip));
  buckets.delete(loginUserKey(username));
}

/** Plafond de lecture par IP sur `/v1/*` (pas de backoff : trafic UI légitime). */
export function checkReadRateLimit(ip: string): RateDecision {
  return consume(`read:${ip || "unknown"}`, readMax(), readWindowMs(), false);
}

/** Tests uniquement. */
export function resetAllRateLimits(): void {
  buckets.clear();
}
