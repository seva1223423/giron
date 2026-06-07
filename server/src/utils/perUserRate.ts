// Per-user per-minute burst limiter (in-memory), shared across cost-bearing LLM/STT
// endpoints that lacked an account-level cap (audit 2026-06-07 L3/L4/L5).
//
// This is the per-ACCOUNT complement to the per-IP express-rate-limiters: a per-IP cap is
// bypassable by one user rotating IPs (or a botnet of accounts), which is exactly how the
// audit showed paid-LLM spend could be multiplied. Separate from the daily subscription
// quota. In-memory, resets on dyno restart (an attacker can't force that). /chat keeps its
// own inline bucket; this serves /voice, /workout-insights and /recipes/ai-generate.
interface PerUserBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, PerUserBucket>();
const WINDOW_MS = 60_000;

/** Records one request for the user and returns true if they are now OVER the per-minute
 *  limit (caller should reply 429). Returns false when the request is within budget. */
export function overPerUserAiRate(userId: string, limitPerMin = 30): boolean {
  // Bypass in tests (mirrors authUserCache): the in-memory bucket persists across cases in
  // a suite, so leaving it on would 429 a fixture that fires many requests as one user.
  if (process.env.NODE_ENV === 'test') return false;
  const now = Date.now();
  const b = buckets.get(userId) ?? { count: 0, resetAt: now + WINDOW_MS };
  if (now > b.resetAt) {
    b.count = 0;
    b.resetAt = now + WINDOW_MS;
  }
  if (b.count >= limitPerMin) return true;
  b.count++;
  buckets.set(userId, b);
  return false;
}

// Prune expired buckets every 5 min. .unref() so it never keeps the process alive in tests.
setInterval(() => {
  const now = Date.now();
  for (const [uid, b] of buckets) if (now > b.resetAt) buckets.delete(uid);
}, 5 * 60 * 1000).unref();
