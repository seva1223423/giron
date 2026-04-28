/**
 * Tests for adminDigestService — digest stats computation, delta formatting,
 * activation rate, and daily digest delivery logic.
 */

jest.mock('../db', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    subscription: {
      count: jest.fn(),
    },
    workout: {
      count: jest.fn(),
    },
    chatMessage: {
      count: jest.fn(),
    },
  },
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  sendDailyAdminDigestEmail: jest.fn(),
}));

jest.mock('../utils/errorReporter', () => ({
  reportError: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { computeDigestStats, sendDailyAdminDigest } from '../services/adminDigestService';
import { prisma } from '../db';
import { sendPushToUser } from '../services/pushService';
import { sendDailyAdminDigestEmail } from '../services/emailService';
import { reportError } from '../utils/errorReporter';

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserCount = prisma.user.count as jest.Mock;
const mockSubCount = prisma.subscription.count as jest.Mock;
const mockWorkoutCount = prisma.workout.count as jest.Mock;
const mockChatCount = prisma.chatMessage.count as jest.Mock;
const mockSendPush = sendPushToUser as jest.Mock;
const mockSendEmail = sendDailyAdminDigestEmail as jest.Mock;
const mockReportError = reportError as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPush.mockResolvedValue(undefined);
  mockSendEmail.mockResolvedValue(undefined);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Queue the 11 Promise.all values that computeDigestStats needs, in the exact
 * order the code builds the array:
 *   1  subscription.count  payingNow
 *   2  subscription.count  payingThirtyDaysAgo
 *   3  user.count          signupsToday
 *   4  user.count          signupsYesterday
 *   5  workout.count       workoutsToday
 *   6  workout.count       workoutsYesterday
 *   7  chatMessage.count   aiMessagesToday
 *   8  chatMessage.count   aiMessagesYesterday
 *   9  subscription.count  newSubsToday
 *  10  subscription.count  newSubsYesterday
 *  11  user.findMany       yesterdayCohort
 */
function setupStatsMocks(overrides: {
  payingNow?: number;
  payingOld?: number;
  signupsToday?: number;
  signupsYesterday?: number;
  workoutsToday?: number;
  workoutsYesterday?: number;
  aiToday?: number;
  aiYesterday?: number;
  subsToday?: number;
  subsYesterday?: number;
  cohort?: Array<{ firstChatAt: Date | null; createdAt: Date }>;
} = {}) {
  const c = {
    payingNow: 10,
    payingOld: 8,
    signupsToday: 3,
    signupsYesterday: 2,
    workoutsToday: 5,
    workoutsYesterday: 4,
    aiToday: 20,
    aiYesterday: 15,
    subsToday: 1,
    subsYesterday: 0,
    cohort: [] as Array<{ firstChatAt: Date | null; createdAt: Date }>,
    ...overrides,
  };

  mockSubCount
    .mockResolvedValueOnce(c.payingNow)       // 1
    .mockResolvedValueOnce(c.payingOld)       // 2
    .mockResolvedValueOnce(c.subsToday)       // 9
    .mockResolvedValueOnce(c.subsYesterday);  // 10

  mockUserCount
    .mockResolvedValueOnce(c.signupsToday)    // 3
    .mockResolvedValueOnce(c.signupsYesterday); // 4

  mockWorkoutCount
    .mockResolvedValueOnce(c.workoutsToday)   // 5
    .mockResolvedValueOnce(c.workoutsYesterday); // 6

  mockChatCount
    .mockResolvedValueOnce(c.aiToday)         // 7
    .mockResolvedValueOnce(c.aiYesterday);    // 8

  mockUserFindMany.mockResolvedValueOnce(c.cohort); // 11
}

// ── computeDigestStats ────────────────────────────────────────────────────────

describe('computeDigestStats', () => {
  test('returns activationRateYesterdayPct as null when cohort is empty', async () => {
    setupStatsMocks({ cohort: [] });

    const stats = await computeDigestStats();

    expect(stats.activationRateYesterdayPct).toBeNull();
  });

  test('computes activationRateYesterdayPct correctly — 1 of 4 activated', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 12 * 60 * 60 * 1000);
    const chatWithin24h = new Date(now - 10 * 60 * 60 * 1000); // within 24h

    setupStatsMocks({
      cohort: [
        { createdAt, firstChatAt: chatWithin24h }, // activated
        { createdAt, firstChatAt: null },
        { createdAt, firstChatAt: null },
        { createdAt, firstChatAt: null },
      ],
    });

    const stats = await computeDigestStats();

    expect(stats.activationRateYesterdayPct).toBe(25); // 1/4 = 25.0%
  });

  test('chat after 24h window does NOT count as activated', async () => {
    const createdAt = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50h ago
    const chatAt = new Date(Date.now() - 20 * 60 * 60 * 1000); // 20h ago
    // diff = 30h > 24h → not activated

    setupStatsMocks({
      cohort: [{ createdAt, firstChatAt: chatAt }],
    });

    const stats = await computeDigestStats();

    expect(stats.activationRateYesterdayPct).toBe(0);
  });

  test('payingDelta30d = payingNow − payingThirtyDaysAgo', async () => {
    setupStatsMocks({ payingNow: 15, payingOld: 10 });

    const stats = await computeDigestStats();

    expect(stats.payingDelta30d).toBe(5);
  });

  test('negative delta is preserved when paying users dropped', async () => {
    setupStatsMocks({ payingNow: 7, payingOld: 10 });

    const stats = await computeDigestStats();

    expect(stats.payingDelta30d).toBe(-3);
  });

  test('date is in YYYY-MM-DD UTC format', async () => {
    setupStatsMocks();

    const stats = await computeDigestStats();

    expect(stats.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('all numeric fields are numbers', async () => {
    setupStatsMocks();

    const stats = await computeDigestStats();

    for (const key of [
      'payingNow',
      'payingDelta30d',
      'signupsToday',
      'signupsYesterday',
      'workoutsToday',
      'workoutsYesterday',
      'aiMessagesToday',
      'aiMessagesYesterday',
      'newSubsToday',
      'newSubsYesterday',
    ] as const) {
      expect(typeof stats[key]).toBe('number');
    }
  });
});

// ── sendDailyAdminDigest ──────────────────────────────────────────────────────

describe('sendDailyAdminDigest', () => {
  test('returns 0 and skips everything when no admin users exist', async () => {
    mockUserFindMany.mockResolvedValueOnce([]); // no admins

    const delivered = await sendDailyAdminDigest();

    expect(delivered).toBe(0);
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test('sends push and email to each admin, returns total delivered', async () => {
    // First findMany = admins list
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'admin-1', email: 'a1@test.com', firstName: 'Admin' },
      { id: 'admin-2', email: 'a2@test.com', firstName: null },
    ]);
    setupStatsMocks(); // second findMany = cohort inside computeDigestStats

    const delivered = await sendDailyAdminDigest();

    expect(delivered).toBe(2);
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      'a1@test.com',
      'Admin',
      expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
  });

  test('push failure is silently swallowed — email still sent', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'admin-1', email: 'a@test.com', firstName: null },
    ]);
    setupStatsMocks();

    // Push rejects — but the code calls .catch(() => {}) so it shouldn't propagate
    mockSendPush.mockRejectedValueOnce(new Error('Expo API down'));

    const delivered = await sendDailyAdminDigest();

    expect(delivered).toBe(1); // email still went through
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  test('per-admin email failure calls reportError and does not stop other admins', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'admin-ok', email: 'ok@test.com', firstName: null },
      { id: 'admin-fail', email: 'fail@test.com', firstName: null },
    ]);
    setupStatsMocks();

    mockSendEmail
      .mockResolvedValueOnce(undefined)             // admin-ok succeeds
      .mockRejectedValueOnce(new Error('SMTP down')); // admin-fail errors

    const delivered = await sendDailyAdminDigest();

    expect(delivered).toBe(1);
    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ userId: 'admin-fail' }),
    );
  });

  test('returns 0 and calls reportError when Prisma fails on admin lookup', async () => {
    mockUserFindMany.mockRejectedValueOnce(new Error('DB down'));

    const delivered = await sendDailyAdminDigest();

    expect(delivered).toBe(0);
    expect(mockReportError).toHaveBeenCalled();
  });

  test('skips email when admin.email is falsy', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'admin-no-email', email: '', firstName: null },
    ]);
    setupStatsMocks();

    const delivered = await sendDailyAdminDigest();

    expect(delivered).toBe(1); // still delivered (push was ok)
    expect(mockSendEmail).not.toHaveBeenCalled(); // no email — empty string is falsy
  });
});
