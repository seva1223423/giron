// Per-account 2FA brute-force lockout (audit 2026-06 finding H1; generalised 2026-06-07).
//
// The IP-based totpRateLimiter is bypassable by an attacker rotating source IPs to brute
// a 6-digit TOTP code or a backup code. This per-USER counter locks the account's 2FA /
// step-up checks for a window after N failures, regardless of source IP. It is shared by
// EVERY step-up surface — login /totp-verify, user change-password / change-email /
// change-phone / 2fa-disable / 2fa-backup-codes / linked-accounts / account-delete, and
// admin destructive-op step-up — so the ceiling cannot be sidestepped by hitting a
// different endpoint. In-memory (mirrors the per-user AI rate-bucket pattern); resets on
// dyno restart, which an attacker cannot force.

const TFA_MAX_FAILURES = 5;
const TFA_LOCKOUT_MS = 15 * 60 * 1000;

interface TfaFailRecord {
  count: number;
  lockedUntil: number;
}

const tfaFailures = new Map<string, TfaFailRecord>();

/** True while the account's 2FA/step-up checks are locked after too many failures. */
export function is2faLocked(userId: string): boolean {
  const rec = tfaFailures.get(userId);
  return !!rec && rec.lockedUntil > Date.now();
}

/** Record one failed TOTP / step-up attempt; locks the account after TFA_MAX_FAILURES. */
export function record2faFailure(userId: string): void {
  const now = Date.now();
  const rec = tfaFailures.get(userId);
  if (!rec || rec.lockedUntil <= now) {
    // Fresh window (no record, or a prior lock already expired).
    tfaFailures.set(userId, { count: 1, lockedUntil: 0 });
    return;
  }
  rec.count++;
  if (rec.count >= TFA_MAX_FAILURES) rec.lockedUntil = now + TFA_LOCKOUT_MS;
}

/** Clear the failure counter after a successful step-up. */
export function clear2faFailures(userId: string): void {
  tfaFailures.delete(userId);
}

// Prune stale records hourly. .unref() so it never keeps the process alive in tests.
setInterval(() => {
  const now = Date.now();
  for (const [uid, rec] of tfaFailures) {
    if (rec.lockedUntil < now && rec.count < TFA_MAX_FAILURES) tfaFailures.delete(uid);
    else if (rec.lockedUntil && rec.lockedUntil < now - TFA_LOCKOUT_MS) tfaFailures.delete(uid);
  }
}, 60 * 60 * 1000).unref();
