// In-memory tracker of user activity (last API call timestamp per userId)
// Used for approximate "online now" count in admin dashboard

const lastSeen = new Map<string, number>(); // userId → timestamp ms

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
}

// Prune on startup, then every hour
pruneOldEntries();
setInterval(pruneOldEntries, 60 * 60 * 1000);
