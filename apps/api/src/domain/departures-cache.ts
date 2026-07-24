/** Simple in-memory TTL cache (process-local). */

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private readonly map = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export const departuresCache = new TtlCache<unknown>(
  Number(process.env.DEPARTURES_CACHE_TTL_MS ?? 90_000),
);
