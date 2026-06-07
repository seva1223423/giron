/**
 * Integration tests for the extracted cleanup-job functions.
 *
 * Each function takes a Prisma client and runs deleteMany with a
 * specific predicate. With Prisma mocked we can assert:
 *   - exact `where` shape (predicate didn't drift to "delete-all" or
 *     "delete-nothing")
 *   - the function returns the row counts the caller logs
 *   - errors from prisma surface to reportError (audit signal) instead
 *     of bubbling up and killing the setInterval loop
 *
 * The static-grep test in cleanupCronPin.test.ts pins the SCHEDULE
 * (cadence + .unref()); this file pins the PREDICATE BEHAVIOR.
 */

const reportError = jest.fn();
jest.mock('../utils/errorReporter', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  runRefreshTokenAndDeviceCleanup,
  runTotpReplayCleanup,
  runOtpCodesCleanup,
  runPasswordResetCleanup,
  runFoodScanLogCleanup,
  runHealthSampleCleanup,
  _internal,
} from '../utils/cleanupJobs';

interface MockDb {
  refreshToken: { deleteMany: jest.Mock };
  trustedDevice: { deleteMany: jest.Mock };
  usedTotpCode: { deleteMany: jest.Mock };
  otpCode: { deleteMany: jest.Mock };
  passwordResetToken: { deleteMany: jest.Mock };
  foodScanLog: { deleteMany: jest.Mock };
  healthSample: { deleteMany: jest.Mock };
}

function makeMockDb(): MockDb {
  return {
    refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    trustedDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    usedTotpCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    otpCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    foodScanLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    healthSample: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

beforeEach(() => {
  reportError.mockClear();
});

// ─── runRefreshTokenAndDeviceCleanup ────────────────────────────────────────

describe('runRefreshTokenAndDeviceCleanup', () => {
  test('refresh-token where clause: expired OR (revoked AND >7 days old)', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runRefreshTokenAndDeviceCleanup(db);
    const after = Date.now();

    const where = db.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR.length).toBe(2);

    // Branch 1: expiresAt < now
    const expiredBranch = where.OR.find((b: Record<string, unknown>) => b.expiresAt);
    expect(expiredBranch).toBeDefined();
    expect(expiredBranch!.expiresAt.lt).toBeInstanceOf(Date);
    expect((expiredBranch!.expiresAt.lt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((expiredBranch!.expiresAt.lt as Date).getTime()).toBeLessThanOrEqual(after);

    // Branch 2: revoked === true AND createdAt < now - 7d
    const revokedBranch = where.OR.find((b: Record<string, unknown>) => b.revoked === true);
    expect(revokedBranch).toBeDefined();
    const cutoff = revokedBranch!.createdAt.lt as Date;
    // 7 days = 7 * 24 * 60 * 60 * 1000
    const expectedCutoff = before - _internal.SEVEN_DAYS_MS;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoff);
    // Sanity: cutoff is not "now + something" (defends against sign flip)
    expect(cutoff.getTime()).toBeLessThan(after);
  });

  test('trusted-device where clause: expiresAt < now', async () => {
    const db = makeMockDb();
    await runRefreshTokenAndDeviceCleanup(db);

    const where = db.trustedDevice.deleteMany.mock.calls[0][0].where;
    expect(where.expiresAt.lt).toBeInstanceOf(Date);
  });

  test('returns the row counts from the two deleteMany calls', async () => {
    const db = makeMockDb();
    db.refreshToken.deleteMany.mockResolvedValueOnce({ count: 42 });
    db.trustedDevice.deleteMany.mockResolvedValueOnce({ count: 7 });

    const result = await runRefreshTokenAndDeviceCleanup(db);
    expect(result).toEqual({ refreshTokens: 42, trustedDevices: 7 });
  });

  test('errors are routed to reportError with the cleanup-tokens-devices tag', async () => {
    const db = makeMockDb();
    db.refreshToken.deleteMany.mockRejectedValueOnce(new Error('db gone'));

    const result = await runRefreshTokenAndDeviceCleanup(db);
    // Function MUST NOT throw — would kill the setInterval loop. Returns
    // zero counts so the caller doesn't log a phantom "deleted N".
    expect(result).toEqual({ refreshTokens: 0, trustedDevices: 0 });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { origin: 'cleanup-tokens-devices' } }),
    );
  });
});

// ─── runTotpReplayCleanup ────────────────────────────────────────────────────

describe('runTotpReplayCleanup', () => {
  test('where clause: usedAt < now - 90s', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runTotpReplayCleanup(db);
    const after = Date.now();

    const where = db.usedTotpCode.deleteMany.mock.calls[0][0].where;
    const cutoff = where.usedAt.lt as Date;
    // cutoff = now - 90_000ms (NINETY_SECONDS_MS)
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - _internal.NINETY_SECONDS_MS);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - _internal.NINETY_SECONDS_MS + 100);
  });

  test('errors → reportError with cleanup-totp-replay tag', async () => {
    const db = makeMockDb();
    db.usedTotpCode.deleteMany.mockRejectedValueOnce(new Error('boom'));

    const result = await runTotpReplayCleanup(db);
    expect(result).toEqual({ deleted: 0 });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { origin: 'cleanup-totp-replay' } }),
    );
  });
});

// ─── runOtpCodesCleanup ──────────────────────────────────────────────────────

describe('runOtpCodesCleanup', () => {
  test('OTP where clause: expired OR (used AND >24h old)', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runOtpCodesCleanup(db);

    const where = db.otpCode.deleteMany.mock.calls[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);

    const expiredBranch = where.OR.find((b: Record<string, unknown>) => b.expiresAt);
    expect(expiredBranch).toBeDefined();

    const usedBranch = where.OR.find((b: Record<string, unknown>) => b.used === true);
    expect(usedBranch).toBeDefined();
    const cutoff = usedBranch!.createdAt.lt as Date;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - _internal.TWENTY_FOUR_HOURS_MS);
  });

  test('also sweeps stale TOTP replays older than 5 minutes', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runOtpCodesCleanup(db);

    // Second deleteMany on usedTotpCode targets the 5-minute long-tail.
    const where = db.usedTotpCode.deleteMany.mock.calls[0][0].where;
    const cutoff = where.usedAt.lt as Date;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - _internal.FIVE_MINUTES_MS);
  });

  test('errors → reportError with cleanup-otp-codes tag', async () => {
    const db = makeMockDb();
    db.otpCode.deleteMany.mockRejectedValueOnce(new Error('boom'));
    await runOtpCodesCleanup(db);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { origin: 'cleanup-otp-codes' } }),
    );
  });
});

// ─── runPasswordResetCleanup ─────────────────────────────────────────────────

describe('runPasswordResetCleanup', () => {
  test('where clause: expired OR (used AND >24h old)', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runPasswordResetCleanup(db);

    const where = db.passwordResetToken.deleteMany.mock.calls[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);

    const expiredBranch = where.OR.find((b: Record<string, unknown>) => b.expiresAt);
    expect(expiredBranch).toBeDefined();

    const usedBranch = where.OR.find((b: Record<string, unknown>) => b.used === true);
    expect(usedBranch).toBeDefined();
    const cutoff = usedBranch!.createdAt.lt as Date;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - _internal.TWENTY_FOUR_HOURS_MS);
  });

  test('errors → reportError with cleanup-password-reset tag', async () => {
    const db = makeMockDb();
    db.passwordResetToken.deleteMany.mockRejectedValueOnce(new Error('boom'));
    await runPasswordResetCleanup(db);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { origin: 'cleanup-password-reset' } }),
    );
  });
});

// ─── runFoodScanLogCleanup ───────────────────────────────────────────────────

describe('runFoodScanLogCleanup', () => {
  test('where clause: createdAt < now - 90d', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runFoodScanLogCleanup(db);

    const where = db.foodScanLog.deleteMany.mock.calls[0][0].where;
    const cutoff = where.createdAt.lt as Date;
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - _internal.NINETY_DAYS_MS);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - _internal.NINETY_DAYS_MS + 100);
  });

  test('returns row count from deleteMany', async () => {
    const db = makeMockDb();
    db.foodScanLog.deleteMany.mockResolvedValueOnce({ count: 137 });
    const result = await runFoodScanLogCleanup(db);
    expect(result).toEqual({ deleted: 137 });
  });

  test('errors → reportError with cleanup-food-scan-log tag, never throws', async () => {
    const db = makeMockDb();
    db.foodScanLog.deleteMany.mockRejectedValueOnce(new Error('boom'));
    const result = await runFoodScanLogCleanup(db);
    expect(result).toEqual({ deleted: 0 });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { origin: 'cleanup-food-scan-log' } }),
    );
  });
});

// ─── runHealthSampleCleanup ──────────────────────────────────────────────────

describe('runHealthSampleCleanup', () => {
  test('where clause: startAt < now - 90d (NOT createdAt — samples are timestamped by the wearable)', async () => {
    const db = makeMockDb();
    const before = Date.now();
    await runHealthSampleCleanup(db);

    const where = db.healthSample.deleteMany.mock.calls[0][0].where;
    // Must filter by startAt — that's the watch-supplied timestamp; createdAt
    // would be the ingest time and would keep stale samples around if the
    // sync was delayed.
    expect(where.startAt).toBeDefined();
    expect(where.createdAt).toBeUndefined();
    const cutoff = where.startAt.lt as Date;
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - _internal.NINETY_DAYS_MS);
  });

  test('returns row count from deleteMany', async () => {
    const db = makeMockDb();
    db.healthSample.deleteMany.mockResolvedValueOnce({ count: 1440 });
    const result = await runHealthSampleCleanup(db);
    expect(result).toEqual({ deleted: 1440 });
  });

  test('errors → reportError with cleanup-health-sample tag, never throws', async () => {
    const db = makeMockDb();
    db.healthSample.deleteMany.mockRejectedValueOnce(new Error('boom'));
    const result = await runHealthSampleCleanup(db);
    expect(result).toEqual({ deleted: 0 });
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { origin: 'cleanup-health-sample' } }),
    );
  });
});
