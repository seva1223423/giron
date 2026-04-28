// In-memory tracker of user activity (last API call timestamp per userId)
// Used for approximate "online now" count in admin dashboard, AND for
// throttling DB writes to User.lastActiveAt (see shouldSyncLastActiveAt
// below).
//
// Eviction is JS-Map insertion-order LRU: every recordActivity() does
// delete-then-set, which moves the entry to the BACK of iteration order
// (a plain `set` on an existing key updates the value but leaves
// iteration order untouched — that's the bug a delete+set fixes). When
// the map is full, the front of iteration is genuinely the
// least-recently-touched entry.

const lastSeen = new Map<string, number>(); // userId → timestamp ms
// Separate ledger for "last time we wrote lastActiveAt to the DB". Lets
// us throttle the per-request DB write to ~1/hour while keeping the
// online-now tracker (lastSeen) updated on every request. Same eviction
// envelope as lastSeen.
const lastDbSync = new Map<string, number>();

export function recordActivity(userId: string): void {
  // Cap at 50k entries: if full, evict the 5k oldest to prevent unbounded memory growth
  if (lastSeen.size >= 50_000 && !lastSeen.has(userId)) {
    const evictCount = 5_000;
    let i = 0;
    for (const key of lastSeen.keys()) {
      if (i++ >= evictCount) break;
      lastSeen.delete(key);
    }
  }
  // Delete first so the subsequent `set` re-inserts at the BACK of
  // iteration order. Without this, an active user inserted on day 1
  // stays at the front of the map and gets wrongfully evicted on day N
  // even though they keep pinging activity. JS-Map semantics: setting
  // an existing key updates the value but does NOT change iteration
  // order; a delete+set does.
  lastSeen.delete(userId);
  lastSeen.set(userId, Date.now());
}

/** Users active within the last N milliseconds (default: 5 min) */
export function getActiveUsersCount(withinMs = 5 * 60 * 1000): number {
  const cutoff = Date.now() - withinMs;
  let count = 0;
  for (const ts of lastSeen.values()) {
    if (ts > cutoff) count++;
  }
  return count;
}

/** Total distinct users seen since server start */
export function getTotalSeenCount(): number {
  return lastSeen.size;
}

/** User IDs active within the last N milliseconds */
export function getActiveUserIds(withinMs = 5 * 60 * 1000): string[] {
  const cutoff = Date.now() - withinMs;
  const ids: string[] = [];
  for (const [userId, ts] of lastSeen.entries()) {
    if (ts > cutoff) ids.push(userId);
  }
  return ids;
}

/** Cleanup entries older than 24h to prevent unbounded growth */
export function pruneOldEntries(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [userId, ts] of lastSeen.entries()) {
    if (ts < cutoff) lastSeen.delete(userId);
  }
  // Mirror prune on the DB-sync ledger so it doesn't outlive lastSeen.
  for (const [userId, ts] of lastDbSync.entries()) {
    if (ts < cutoff) lastDbSync.delete(userId);
  }
}

/**
 * Returns true if it's time to write User.lastActiveAt = now() for this
 * user, using a 1-hour throttle. Records the sync timestamp internally
 * — call sites should NOT call this twice for the same request, or the
 * second call will return false even though no DB write happened.
 *
 * This solves the "passive reader" gap: users who open the app to
 * browse but never complete a workout / log a meal / talk to the AI
 * weren't refreshing lastActiveAt before, and were getting bucketed
 * into the 7/14/30d reactivation cohorts incorrectly. Now any
 * authenticated request refreshes their freshness up to once per hour.
 */
export function shouldSyncLastActiveAt(userId: string, throttleMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const last = lastDbSync.get(userId);
  if (last && now - last < throttleMs) return false;
  lastDbSync.set(userId, now);
  return true;
}

/** Test helper — wipes both ledgers between cases. */
export function _resetActivityTracker(): void {
  lastSeen.clear();
  lastDbSync.clear();
}

// Prune on startup, then every hour. .unref() so the timer doesn't keep
// the Node process alive — Jest test suites that import this module
// would hang at exit otherwise (same fix as the 9 setInterval sites in
// index.ts, see project_status.md 2026-04-28). Skip the interval
// entirely under NODE_ENV=test for an extra layer of safety since
// tests reset state between cases.
pruneOldEntries();
if (process.env.NODE_ENV !== 'test') {
  setInterval(pruneOldEntries, 60 * 60 * 1000).unref();
}
