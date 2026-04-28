/**
 * Tests for retentionService — push cohort logic, per-user isolation,
 * hard caps, SentAt gating, and error resilience.
 */

jest.mock('../db', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    workout: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  sendWeeklySummaryEmail: jest.fn(),
  sendPreRenewalNotificationEmail: jest.fn(),
}));

jest.mock('../utils/errorReporter', () => ({
  reportError: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  processActivationCohort,
  processReactivationCohort,
  processWeeklySummaryEmails,
  processPreRenewalNotices,
  runAllRetentionCohorts,
} from '../services/retentionService';
import { prisma } from '../db';
import { sendPushToUser } from '../services/pushService';
import { sendWeeklySummaryEmail, sendPreRenewalNotificationEmail } from '../services/emailService';
import { reportError } from '../utils/errorReporter';

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockSubFindMany = prisma.subscription.findMany as jest.Mock;
const mockSubUpdate = prisma.subscription.update as jest.Mock;
const mockWorkoutFindMany = prisma.workout.findMany as jest.Mock;
const mockWorkoutCount = prisma.workout.count as jest.Mock;
const mockSendPush = sendPushToUser as jest.Mock;
const mockWeeklyEmail = sendWeeklySummaryEmail as jest.Mock;
const mockPreRenewalEmail = sendPreRenewalNotificationEmail as jest.Mock;
const mockReportError = reportError as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPush.mockResolvedValue(undefined);
  mockUserUpdate.mockResolvedValue({});
  mockSubUpdate.mockResolvedValue({});
  mockWeeklyEmail.mockResolvedValue(undefined);
  mockPreRenewalEmail.mockResolvedValue(undefined);
});

// ── processActivationCohort ──────────────────────────────────────────────────

describe('processActivationCohort', () => {
  test('returns 0 and skips push when no candidates', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test('sends push and sets activationPushSentAt after successful send', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'u-1', firstName: 'Иван' },
      { id: 'u-2', firstName: null },
    ]);

    const sent = await processActivationCohort();

    expect(sent).toBe(2);
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(mockUserUpdate).toHaveBeenCalledTimes(2);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: { activationPushSentAt: expect.any(Date) },
      }),
    );
  });

  test('push failure calls reportError and does NOT set activationPushSentAt', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-fail', firstName: 'Test' }]);
    mockSendPush.mockRejectedValueOnce(new Error('Expo timeout'));

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ userId: 'u-fail' }),
    );
  });

  test('one failure does not prevent other users from being processed', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'u-ok', firstName: 'OK' },
      { id: 'u-fail', firstName: 'Fail' },
    ]);
    mockSendPush
      .mockResolvedValueOnce(undefined)          // u-ok succeeds
      .mockRejectedValueOnce(new Error('push')); // u-fail errors

    const sent = await processActivationCohort();

    expect(sent).toBe(1);
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-ok' } }),
    );
  });

  test('returns 0 without throwing when Prisma fails', async () => {
    mockUserFindMany.mockRejectedValueOnce(new Error('DB down'));

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockReportError).toHaveBeenCalled();
  });
});

// ── processReactivationCohort ─────────────────────────────────────────────────

describe('processReactivationCohort', () => {
  test('updates reactivation7dSentAt for 7-day cohort', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-1', firstName: 'Test' }]);

    await processReactivationCohort(7);

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reactivation7dSentAt: expect.any(Date) },
      }),
    );
  });

  test('updates reactivation14dSentAt for 14-day cohort', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-1', firstName: 'Test' }]);

    await processReactivationCohort(14);

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reactivation14dSentAt: expect.any(Date) },
      }),
    );
  });

  test('updates reactivation30dSentAt for 30-day cohort', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-1', firstName: 'Test' }]);

    await processReactivationCohort(30);

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reactivation30dSentAt: expect.any(Date) },
      }),
    );
  });

  test('returns 0 when cohort is empty', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);

    const sent = await processReactivationCohort(7);

    expect(sent).toBe(0);
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test('SentAt field is NOT set when push fails', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-fail', firstName: null }]);
    mockSendPush.mockRejectedValueOnce(new Error('push failed'));

    await processReactivationCohort(7);

    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalled();
  });
});

// ── processWeeklySummaryEmails ────────────────────────────────────────────────

describe('processWeeklySummaryEmails', () => {
  test('returns 0 when no eligible users', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);

    const sent = await processWeeklySummaryEmails();

    expect(sent).toBe(0);
    expect(mockWeeklyEmail).not.toHaveBeenCalled();
  });

  test('sends email with correct stats including top exercise', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'u-1', email: 'user@test.com', firstName: 'Иван' },
    ]);

    // thisWeek workouts (findMany), lastWeek count
    mockWorkoutFindMany.mockResolvedValueOnce([
      {
        durationMinutes: 60,
        totalVolume: 5000,
        exercises: [
          {
            exercise: { name: 'Жим лёжа' },
            sets: [
              { weight: 100, reps: 5, completed: true },
              { weight: 80, reps: 3, completed: false }, // excluded: completed=false
            ],
          },
          {
            exercise: { name: 'Присед' },
            sets: [{ weight: 120, reps: 3, completed: true }],
          },
        ],
      },
    ]);
    mockWorkoutCount.mockResolvedValueOnce(2); // lastWeek

    const sent = await processWeeklySummaryEmails();

    expect(sent).toBe(1);
    expect(mockWeeklyEmail).toHaveBeenCalledWith(
      'user@test.com',
      'Иван',
      expect.objectContaining({
        workoutsThisWeek: 1,
        workoutsLastWeek: 2,
        totalVolumeKg: 5000,
        topExerciseName: 'Жим лёжа', // Жим: 100*5=500 vol > Присед: 120*3=360 vol
      }),
    );
  });

  test('top exercise is the one with highest completed volume', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'u-1', email: 'user@test.com', firstName: null },
    ]);

    mockWorkoutFindMany.mockResolvedValueOnce([
      {
        durationMinutes: 45,
        totalVolume: 3000,
        exercises: [
          {
            exercise: { name: 'Тяга' },
            sets: [{ weight: 150, reps: 5, completed: true }], // vol = 750
          },
          {
            exercise: { name: 'Жим' },
            sets: [{ weight: 100, reps: 5, completed: true }], // vol = 500
          },
        ],
      },
    ]);
    mockWorkoutCount.mockResolvedValueOnce(0);

    await processWeeklySummaryEmails();

    expect(mockWeeklyEmail).toHaveBeenCalledWith(
      expect.any(String),
      null,
      expect.objectContaining({ topExerciseName: 'Тяга' }),
    );
  });

  test('per-user email failure is isolated and other users continue', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'u-fail', email: 'fail@test.com', firstName: null },
      { id: 'u-ok', email: 'ok@test.com', firstName: null },
    ]);

    // Both users get workout data
    mockWorkoutFindMany.mockResolvedValue([]);
    mockWorkoutCount.mockResolvedValue(0);

    // u-fail email throws, u-ok succeeds
    mockWeeklyEmail
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockResolvedValueOnce(undefined);

    const sent = await processWeeklySummaryEmails();

    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(sent).toBe(1);
  });
});

// ── processPreRenewalNotices ──────────────────────────────────────────────────

describe('processPreRenewalNotices', () => {
  const makeSubscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1',
    userId: 'u-1',
    plan: 'monthly',
    endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
    renewalAmountRub: 299,
    user: { email: 'user@test.com', firstName: 'Test', isBanned: false },
    ...overrides,
  });

  test('returns 0 when no candidates', async () => {
    mockSubFindMany.mockResolvedValueOnce([]);

    const sent = await processPreRenewalNotices();

    expect(sent).toBe(0);
    expect(mockPreRenewalEmail).not.toHaveBeenCalled();
  });

  test('skips banned users and does not send notice', async () => {
    mockSubFindMany.mockResolvedValueOnce([
      makeSubscription({ user: { email: 'banned@test.com', firstName: null, isBanned: true } }),
    ]);

    const sent = await processPreRenewalNotices();

    expect(sent).toBe(0);
    expect(mockPreRenewalEmail).not.toHaveBeenCalled();
  });

  test('sets renewalNoticeSentAt after successful send', async () => {
    mockSubFindMany.mockResolvedValueOnce([makeSubscription()]);

    await processPreRenewalNotices();

    expect(mockSubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: { renewalNoticeSentAt: expect.any(Date) },
      }),
    );
  });

  test('renewalNoticeSentAt NOT set when email fails', async () => {
    mockSubFindMany.mockResolvedValueOnce([makeSubscription()]);
    mockPreRenewalEmail.mockRejectedValueOnce(new Error('SMTP error'));

    await processPreRenewalNotices();

    expect(mockSubUpdate).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ userId: 'u-1' }),
    );
  });

  test('returns 0 and calls reportError on Prisma failure', async () => {
    mockSubFindMany.mockRejectedValueOnce(new Error('DB failure'));

    const sent = await processPreRenewalNotices();

    expect(sent).toBe(0);
    expect(mockReportError).toHaveBeenCalled();
  });
});

// ── runAllRetentionCohorts ────────────────────────────────────────────────────

describe('runAllRetentionCohorts', () => {
  test('invokes all 4 push cohorts and pre-renewal notices', async () => {
    // All return empty — just verifying call count
    mockUserFindMany.mockResolvedValue([]);
    mockSubFindMany.mockResolvedValue([]);

    await runAllRetentionCohorts();

    // activation + reactivation(7) + reactivation(14) + reactivation(30) = 4
    expect(mockUserFindMany).toHaveBeenCalledTimes(4);
    // processPreRenewalNotices = 1
    expect(mockSubFindMany).toHaveBeenCalledTimes(1);
  });
});
