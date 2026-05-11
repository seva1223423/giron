/**
 * Cleanup jobs — extracted out of `setInterval` closures in index.ts so
 * they can be unit-tested with a mock Prisma.
 *
 * Each function returns the row counts so the caller (the setInterval
 * wrapper in index.ts) can log "deleted N" without re-running the same
 * predicate. Functions take the Prisma client as an arg instead of
 * importing it directly — keeps test isolation clean (the test passes a
 * jest.Mock-shaped object) and stops integration tests from pulling in
 * the real DB module.
 *
 * Why extract: previously the cleanup predicates lived inline in
 * setInterval bodies, so verifying "deleteMany targets revoked-OR-expired
 * tokens older than 7 days" required either parsing index.ts as text
 * (brittle) or running real timers in CI (slow + flaky). With the
 * extraction, a Jest test mocks Prisma, calls runRefreshTokenCleanup,
 * and inspects deleteMany.calls[0][0].where directly.
 */

import { reportError } from './errorReporter';
import { logger } from './logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const NINETY_SECONDS_MS = 90 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface CleanupResult {
  refreshTokens: number;
  trustedDevices: number;
}

/**
 * Drop expired and stale-revoked refresh tokens + expired trusted devices.
 * Runs hourly in production via setInterval; called directly here in tests.
 *
 * Revoked retention: 7 days. Long enough that a reuse-detection alert
 * can still surface the offending row via the admin DB browser; short
 * enough that the table doesn't balloon with old-session noise.
 */
export async function runRefreshTokenAndDeviceCleanup(db: Db): Promise<CleanupResult> {
  try {
    const { count: rtCount } = await db.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true, createdAt: { lt: new Date(Date.now() - SEVEN_DAYS_MS) } },
        ],
      },
    });
    const { count: tdCount } = await db.trustedDevice.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (rtCount > 0) logger.info(`[Cleanup] Deleted ${rtCount} expired/revoked refresh tokens`);
    if (tdCount > 0) logger.info(`[Cleanup] Deleted ${tdCount} expired trusted devices`);
    return { refreshTokens: rtCount, trustedDevices: tdCount };
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-tokens-devices' } });
    return { refreshTokens: 0, trustedDevices: 0 };
  }
}

/**
 * Drop TOTP replay records older than the 90-second replay window.
 * A used TOTP code can't be replayed after this window anyway (the
 * code itself is only valid for 30s + 1-step grace), so the row has
 * no audit value past 90s.
 */
export async function runTotpReplayCleanup(db: Db): Promise<{ deleted: number }> {
  try {
    const cutoff = new Date(Date.now() - NINETY_SECONDS_MS);
    const { count } = await db.usedTotpCode.deleteMany({
      where: { usedAt: { lt: cutoff } },
    });
    return { deleted: count };
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-totp-replay' } });
    return { deleted: 0 };
  }
}

/**
 * Drop expired/used OTP codes + stale TOTP replay records.
 * Two-bucket cleanup so a single 1h cron handles both the OTP
 * lifecycle (24h retention for used codes) and a long-tail sweep of
 * TOTP replays older than 5 minutes.
 */
export async function runOtpCodesCleanup(db: Db): Promise<{
  otpDeleted: number;
  totpDeleted: number;
}> {
  try {
    const cutoff24h = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
    const { count: otpCount } = await db.otpCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true, createdAt: { lt: cutoff24h } },
        ],
      },
    });
    if (otpCount > 0) logger.info(`[Cleanup] Deleted ${otpCount} expired/used OTP codes`);
    const totpCutoff = new Date(Date.now() - FIVE_MINUTES_MS);
    const { count: totpCount } = await db.usedTotpCode.deleteMany({
      where: { usedAt: { lt: totpCutoff } },
    });
    if (totpCount > 0) logger.info(`[Cleanup] Deleted ${totpCount} stale TOTP replay records`);
    return { otpDeleted: otpCount, totpDeleted: totpCount };
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-otp-codes' } });
    return { otpDeleted: 0, totpDeleted: 0 };
  }
}

/**
 * Drop expired or used-over-24h password reset tokens. Same retention
 * logic as refresh tokens (7d) cut to 24h because reset tokens are
 * single-use and short-lived — no reason to keep them past a day.
 */
export async function runPasswordResetCleanup(db: Db): Promise<{ deleted: number }> {
  try {
    const { count } = await db.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true, createdAt: { lt: new Date(Date.now() - TWENTY_FOUR_HOURS_MS) } },
        ],
      },
    });
    if (count > 0) logger.info(`[Cleanup] Deleted ${count} expired/used password reset tokens`);
    return { deleted: count };
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'cleanup-password-reset' } });
    return { deleted: 0 };
  }
}

// Constants exposed for the tests (so values stay in one place).
export const _internal = {
  SEVEN_DAYS_MS,
  TWENTY_FOUR_HOURS_MS,
  NINETY_SECONDS_MS,
  FIVE_MINUTES_MS,
};
