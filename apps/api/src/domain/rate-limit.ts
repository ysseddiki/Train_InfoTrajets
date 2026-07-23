/** Simple in-memory login rate limiter (per IP). */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MS ?? 15 * 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_MAX ?? 10);

export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const key = ip || "unknown";
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function resetLoginRateLimit(ip: string): void {
  buckets.delete(ip || "unknown");
}
