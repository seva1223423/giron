/**
 * Global SMS send budget (audit R6, corrected).
 *
 * The first attempt counted OtpCode rows in the last hour/day. That could
 * never work: runOtpCodesCleanup deletes every code whose `expiresAt` has
 * passed, and codes expire after ten minutes — so the "last 24 hours" count
 * only ever saw the handful of codes issued in the last few minutes and the
 * daily cap was unreachable.
 *
 * Timestamps are kept in memory instead. They reset when the dyno restarts,
 * which is the same trade `perUserRate` already makes: an attacker cannot
 * force a restart, and losing the window occasionally is far better than a
 * cap that never fires.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Ascending send timestamps, pruned to the last 24 hours. */
const sends: number[] = [];

function prune(now: number): void {
  const cutoff = now - DAY_MS;
  let drop = 0;
  while (drop < sends.length && sends[drop] < cutoff) drop++;
  if (drop > 0) sends.splice(0, drop);
}

/** Call after an SMS has actually been handed to the provider. */
export function recordSmsSend(): void {
  const now = Date.now();
  prune(now);
  sends.push(now);
}

/** Sends in the last hour and the last 24 hours. */
export function smsCounts(): { hour: number; day: number } {
  const now = Date.now();
  prune(now);
  const hourCutoff = now - HOUR_MS;
  let hour = 0;
  for (let i = sends.length - 1; i >= 0 && sends[i] >= hourCutoff; i--) hour++;
  return { hour, day: sends.length };
}

/** Test-only: drop all recorded sends so suites don't leak state into each other. */
export function resetSmsBudget(): void {
  sends.length = 0;
}
