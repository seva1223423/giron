/**
 * Simple in-memory TTL cache.
 *
 * Suitable for caching expensive computations or DB-aggregate results
 * that don't need real-time freshness (admin stats, AI knowledge lookups, etc.)
 *
 * Thread-safety: Node.js is single-threaded for JS execution, so no mutex needed.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Unix timestamp ms
}

export class MemCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /** Get a cached value. Returns undefined if missing or expired. */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Set a value with a TTL in milliseconds. */
  set(key: string, value: T, ttlMs: number): void {
    // Evict oldest entries when at capacity (simple LRU-lite)
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Remove a specific key (call on write paths to invalidate stale data). */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove every entry. Used by tests that need a fresh cache between cases,
   *  since module-singleton caches otherwise leak state across `it` blocks. */
  clear(): void {
    this.store.clear();
  }

  /** Remove all expired entries (call periodically to free memory). */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  /** Current number of entries (including potentially expired ones). */
  get size(): number {
    return this.store.size;
  }
}

/** Singleton caches for different use cases */

/** Admin stats — 90s TTL; refreshes at most once per 1.5 minutes */
export const adminStatsCache = new MemCache<unknown>(10);

/** News feed cache — 6h TTL matches the RSS refresh schedule */
export const newsCache = new MemCache<unknown>(200);

/** Food-vision result cache — keyed by `userId:fingerprint(base64)`. Saves
 *  the Mistral vision API call when the same user uploads the same photo
 *  from two devices (phone + tablet), after reinstall, etc. Client-side
 *  cache covers the single-device re-scan case; this covers cross-device.
 *  100 entries / 24h TTL. */
export const foodVisionCache = new MemCache<unknown>(100);
