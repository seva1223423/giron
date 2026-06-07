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
    // Delete-then-set so updates to an existing key move it to the BACK
    // of iteration order (recency-correct LRU). A plain `set` on an
    // existing key updates the value but leaves iteration position
    // untouched — so a hot key set first would sit at the front and
    // get wrongfully evicted on the next eviction sweep. Same bug
    // pattern as activityTracker.ts (commit ab90086).
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Remove a specific key (call on write paths to invalidate stale data). */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove every entry whose key starts with `prefix`. Useful for scoped
   *  invalidation — e.g. dropping every cached vision response for a
   *  given userId after their allergies or preferences change, so the
   *  next scan re-queries the LLM with the fresh context. Returns the
   *  count of removed entries for callers that want to log impact. */
  deletePrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
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

/**
 * Auth middleware ban/role cache (R280).
 *
 * Without this, every authenticated request paid a Prisma roundtrip
 * to fetch isBanned/role/lockedUntil. Under load (a chat that fans
 * out 5 in-flight requests every keystroke for the typing indicator)
 * this becomes a measurable bottleneck.
 *
 * 60s TTL is the right trade-off: ban / role-change / lock writes
 * propagate to a user within at most 60s without manual invalidation.
 * Sensitive ops (admin writes) explicitly invalidate via
 * `authUserCache.delete(userId)` to take effect immediately.
 *
 * Capped at 10K entries — even a hot day rarely sees more than
 * 1-2K active users; the LRU-lite eviction handles overflow.
 */
export const authUserCache = new MemCache<{
  isBanned: boolean;
  role: string;
  lockedUntil: Date | null;
  // Optional so existing cache-unit-test fixtures stay valid; authenticate() always
  // populates it from the DB select, and its kill-switch check treats absence as "no cutoff".
  tokensValidAfter?: Date | null;
}>(10_000);

export const AUTH_CACHE_TTL_MS = 60_000;

/** News feed cache — 6h TTL matches the RSS refresh schedule */
export const newsCache = new MemCache<unknown>(200);

/** Food-vision result cache — keyed by `userId:fingerprint(base64)`. Saves
 *  the Mistral vision API call when the same user uploads the same photo
 *  from two devices (phone + tablet), after reinstall, etc. Client-side
 *  cache covers the single-device re-scan case; this covers cross-device.
 *  100 entries / 24h TTL. */
export const foodVisionCache = new MemCache<unknown>(100);

/**
 * AI /chat user-context cache (audit R-2026-05-22, supabase-postgres /
 * vercel-react skill review).
 *
 * Identified by the audit: every /chat message fired ~16 parallel Prisma
 * queries; the User row (with healthRestrictions JOIN) is the biggest
 * payload and changes infrequently. Caching it cuts ~30-60ms of DB
 * round-trip + JOIN cost off every message for a hot user.
 *
 * Keyed by userId; value is the same shape `prisma.user.findUnique({
 * include: { healthRestrictions: true } })` returns (non-null — we only
 * cache after confirming the row exists). 60s TTL matches authUserCache
 * so an admin write or user-profile update is visible within a minute
 * without explicit invalidation; the `update_user_profile` AI tool
 * explicitly invalidates so its own write takes effect immediately.
 *
 * Capped at 10K entries — same envelope as authUserCache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiUserContextValue = any; // intentional: typed at the use site to
// avoid pulling @prisma/client User+HealthRestriction types into this
// shared util (the AI route does its own typed cast via `as
// Awaited<ReturnType<typeof prisma.user.findUnique<{include:{healthRestrictions:true}}>>>`).
export const aiUserContextCache = new MemCache<AiUserContextValue>(10_000);
export const AI_USER_CONTEXT_TTL_MS = 60_000;
