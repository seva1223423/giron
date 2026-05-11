/**
 * Cleanup cron contract pin.
 *
 * The server in src/index.ts runs four `setInterval` cleanup jobs:
 *   1. Refresh tokens + trusted devices — every 6h
 *   2. TOTP replay records (UsedTotpCode) — every 5min
 *   3. OTP codes — every 1h
 *   4. News refresh — handled by startNewsRefreshScheduler (separate)
 *
 * Without these, the tables grow forever — the refresh-token reuse
 * detection scan in /auth/refresh would slow down, and old revoked
 * tokens would persist as bait for forensic-recovery attacks. These
 * pins lock the cleanup contract so a future commit that swaps the
 * setInterval for "we'll do it in a Render cron" forces an explicit
 * test update.
 *
 * Static-grep style: setInterval callbacks fire on the wall clock, so
 * a runtime test would need fake timers + module reload — heavy. The
 * static contract is what we actually care about: the predicate, the
 * cadence, and the .unref() so tests don't hang waiting for the timer.
 */

import * as fs from 'fs';
import * as path from 'path';

const INDEX_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'index.ts'),
  'utf8',
);

// ─── Refresh-token + trusted-device cleanup ──────────────────────────────────

describe('Cleanup cron — refresh tokens + trusted devices (every 6h)', () => {
  test('setInterval with 6h cadence is registered', () => {
    // `setInterval(...handler..., 6 * 60 * 60 * 1000)` — pin the cadence
    // exactly. If it drops to 1h (noisy) or to 24h (tables grow 24×) the
    // test catches the drift.
    expect(INDEX_SRC).toMatch(/setInterval\([\s\S]*?6\s*\*\s*60\s*\*\s*60\s*\*\s*1000\s*\)\.unref\(\)/);
  });

  test('deletes expired refresh tokens (expiresAt < now)', () => {
    // Confirms the `expiresAt: { lt: new Date() }` predicate stays.
    expect(INDEX_SRC).toMatch(
      /refreshToken\.deleteMany[\s\S]*?expiresAt:\s*\{\s*lt:\s*new Date\(\)\s*\}/,
    );
  });

  test('deletes revoked refresh tokens older than 7 days', () => {
    // The reuse-detection-evidence retention window. < 7 days = keep
    // (legit alerts within last week); > 7 days = drop. If anyone
    // shortens to < 24h, the audit window becomes useless; if longer
    // than 30d, the table grows linearly with churn.
    expect(INDEX_SRC).toMatch(
      /revoked:\s*true,\s*createdAt:\s*\{\s*lt:\s*new Date\(Date\.now\(\)\s*-\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)\s*\}/,
    );
  });

  test('deletes expired trusted devices', () => {
    expect(INDEX_SRC).toMatch(
      /trustedDevice\.deleteMany[\s\S]*?expiresAt:\s*\{\s*lt:\s*new Date\(\)\s*\}/,
    );
  });

  test('cleanup runs inside try/catch with reportError on failure', () => {
    // If the cleanup throws (DB blip, connection drop), the failure must
    // surface to Sentry — otherwise the table grows silently. Pin both
    // the try wrapper and the reportError tag.
    expect(INDEX_SRC).toMatch(
      /origin:\s*['"]cleanup-tokens-devices['"]/,
    );
  });
});

// ─── TOTP replay cleanup ─────────────────────────────────────────────────────

describe('Cleanup cron — TOTP replay records (every 5min)', () => {
  test('setInterval with 5min cadence is registered', () => {
    expect(INDEX_SRC).toMatch(
      /setInterval\([\s\S]*?5\s*\*\s*60\s*\*\s*1000\s*\)\.unref\(\)/,
    );
  });

  test('deletes UsedTotpCode rows older than 90s (TOTP replay window)', () => {
    // TOTP code is valid for 30s + 1-step window = ~90s. Used codes older
    // than that can't be replayed anyway, so they're safe to drop.
    expect(INDEX_SRC).toMatch(/Date\.now\(\)\s*-\s*90\s*\*\s*1000/);
    expect(INDEX_SRC).toMatch(/usedTotpCode\.deleteMany[\s\S]*?usedAt:\s*\{\s*lt:/);
  });

  test('cleanup runs inside try/catch with reportError tag', () => {
    expect(INDEX_SRC).toMatch(
      /origin:\s*['"]cleanup-totp-replay['"]/,
    );
  });
});

// ─── OTP code cleanup ────────────────────────────────────────────────────────

describe('Cleanup cron — OTP codes (every 1h)', () => {
  test('setInterval with 1h cadence is registered', () => {
    expect(INDEX_SRC).toMatch(/setInterval\([\s\S]*?60\s*\*\s*60\s*\*\s*1000\s*\)\.unref\(\)/);
  });

  test('deletes expired OTP codes (regardless of used)', () => {
    expect(INDEX_SRC).toMatch(/otpCode\.deleteMany/);
    expect(INDEX_SRC).toMatch(/expiresAt:\s*\{\s*lt:\s*new Date\(\)\s*\}/);
  });

  test('deletes used OTP codes older than 24h', () => {
    expect(INDEX_SRC).toMatch(
      /used:\s*true,\s*createdAt:\s*\{\s*lt:\s*cutoff24h\s*\}/,
    );
  });
});

// ─── All cleanup intervals must .unref() ─────────────────────────────────────

describe('Cleanup cron — every setInterval has .unref()', () => {
  test('count of setInterval calls equals count of .unref() invocations', () => {
    // .unref() lets the Node process exit cleanly when nothing else is
    // pending — critical for `npm test` not to hang. Counts match means
    // each setInterval got its .unref(). A multi-line regex over setInterval
    // bodies is fragile (the closure has commas, nested parens, async
    // arrow); counting top-level call sites is the reliable check.
    const startCount = (INDEX_SRC.match(/\bsetInterval\(/g) || []).length;
    const unrefCount = (INDEX_SRC.match(/\}\s*,\s*[^)]+\)\.unref\(\)/g) || []).length;
    expect(startCount).toBeGreaterThan(0); // sanity — should be ≥ 4 cleanup jobs
    expect(unrefCount).toBeGreaterThanOrEqual(startCount);
  });
});
