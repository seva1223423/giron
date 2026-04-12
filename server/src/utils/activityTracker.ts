// In-memory tracker of user activity (last API call timestamp per userId)
// Used for approximate "online now" count in admin dashboard

const lastSeen = new Map<string, number>(); // userId → timestamp ms

export function recordActivity(userId: string): void {
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

/** Cleanup entries older than 24h to prevent unbounded growth */
export function pruneOldEntries(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [userId, ts] of lastSeen.entries()) {
    if (ts < cutoff) lastSeen.delete(userId);
  }
}

// Auto-prune every hour
setInterval(pruneOldEntries, 60 * 60 * 1000);
