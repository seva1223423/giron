/**
 * Tests for retentionService — push cohort logic, per-user isolation,
 * hard caps, SentAt gating, and error resilience.
 */

jest.mock('../db', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
      // Round 251: retentionService now uses updateMany for atomic
      // claim-then-send (prevents two cron ticks from double-sending).
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    subscription: {
      findMany: jest.fn(),
      update: jest.fn(),
      // Round 253: pre-renewal notice now uses updateMany for atomic CAS.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    workout: {
      // Audit 2026-05-29 (H8): weekly summary now batches via groupBy instead
      // of per-user findMany/count.
      groupBy: jest.fn(),
    },
    workoutExercise: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  sendWeeklySummaryEmail: jest.fn(),
  sendPreRenewalNotificationEmail: jest.fn(),
  sendActivationReminderEmail: jest.fn(),
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
import {
  sendWeeklySummaryEmail,
  sendPreRenewalNotificationEmail,
  sendActivationReminderEmail,
} from '../services/emailService';
import { reportError } from '../utils/errorReporter';

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
// Round 251: retentionService now claims via updateMany before sending.
const mockUserUpdateMany = (prisma.user as any).updateMany as jest.Mock;
const mockSubFindMany = prisma.subscription.findMany as jest.Mock;
const mockSubUpdate = prisma.subscription.update as jest.Mock;
// Round 253: pre-renewal notice now uses updateMany for atomic claim.
const mockSubUpdateMany = (prisma.subscription as any).updateMany as jest.Mock;
const mockWorkoutGroupBy = prisma.workout.groupBy as jest.Mock;
const mockWorkoutExerciseFindMany = prisma.workoutExercise.findMany as jest.Mock;
const mockSendPush = sendPushToUser as jest.Mock;
const mockWeeklyEmail = sendWeeklySummaryEmail as jest.Mock;
const mockPreRenewalEmail = sendPreRenewalNotificationEmail as jest.Mock;
const mockActivationEmail = sendActivationReminderEmail as jest.Mock;
const mockReportError = reportError as jest.Mock;

// Pin "now" to 12:00 UTC = 15:00 MSK so we land in the active (non-quiet)
// push window for every test. Quiet hours are 19:00..05:00 UTC; if jest
// happened to run during real quiet hours, retention cohorts would defer
// instead of sending and dozens of mock-call assertions would break.
//
// Use jest.useFakeTimers() with `now` option — modern @sinonjs/fake-timers
// lets us pin Date without breaking setTimeout/setInterval callers in
// the production code. We don't fake setImmediate/queueMicrotask so
// async-then chains in handlers still resolve normally.
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-04-29T12:00:00Z').getTime(),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPush.mockResolvedValue(undefined);
  mockUserUpdate.mockResolvedValue({});
  // Round 251: default updateMany to "claim succeeded (count=1)" so
  // pre-existing tests treat the new atomic-claim path as a no-op.
  mockUserUpdateMany.mockResolvedValue({ count: 1 });
  mockSubUpdate.mockResolvedValue({});
  mockSubUpdateMany.mockResolvedValue({ count: 1 });
  mockWeeklyEmail.mockResolvedValue(undefined);
  // Audit 2026-05-29 (H8): default the batched weekly-summary queries to empty
  // so tests that don't care about workout data don't crash on .map.
  mockWorkoutGroupBy.mockResolvedValue([]);
  mockWorkoutExerciseFindMany.mockResolvedValue([]);
  mockPreRenewalEmail.mockResolvedValue(undefined);
  mockActivationEmail.mockResolvedValue(undefined);
});

// Helper: activation cohort candidates carry the full select shape now
// (push tokens + activation timestamps + email). Tests can override per-case.
const makeActivationCandidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-1',
  firstName: 'Test',
  email: 'user@test.com',
  activationPushSentAt: null,
  activationEmailSentAt: null,
  pushTokens: [{ id: 'tok-1' }],
  ...overrides,
});

// ── processActivationCohort ──────────────────────────────────────────────────

describe('processActivationCohort', () => {
  test('returns 0 and skips push when no candidates', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  test('sends push + email and sets both SentAt fields after successful send', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({ id: 'u-1', firstName: 'Иван' }),
      makeActivationCandidate({ id: 'u-2', firstName: null, email: 'two@test.com' }),
    ]);

    const sent = await processActivationCohort();

    // 2 users × 2 channels each = 4 sends total.
    // Round 251: updates flow through updateMany now (atomic claim).
    expect(sent).toBe(4);
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(mockActivationEmail).toHaveBeenCalledTimes(2);
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-1', activationPushSentAt: null }),
        data: { activationPushSentAt: expect.any(Date) },
      }),
    );
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-1', activationEmailSentAt: null }),
        data: { activationEmailSentAt: expect.any(Date) },
      }),
    );
  });

  test('skips push when user has no push tokens, still sends email', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({ id: 'u-no-push', pushTokens: [] }),
    ]);

    const sent = await processActivationCohort();

    expect(sent).toBe(1); // email only
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockActivationEmail).toHaveBeenCalledTimes(1);
  });

  test('skips email for internal *@giron.internal accounts', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({ id: 'u-internal', email: 'ok_123@giron.internal' }),
    ]);

    const sent = await processActivationCohort();

    expect(sent).toBe(1); // push only
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockActivationEmail).not.toHaveBeenCalled();
  });

  test('respects already-set SentAt gates (push fired, email pending)', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({
        id: 'u-half',
        activationPushSentAt: new Date(),
        activationEmailSentAt: null,
      }),
    ]);

    const sent = await processActivationCohort();

    expect(sent).toBe(1); // email only — push gate already set
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(mockActivationEmail).toHaveBeenCalledTimes(1);
  });

  test('push failure calls reportError and does NOT set activationPushSentAt', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({
        id: 'u-fail',
        // No email so the email path is skipped, isolating the push test.
        email: null,
      }),
    ]);
    mockSendPush.mockRejectedValueOnce(new Error('Expo timeout'));

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ userId: 'u-fail' }),
    );
  });

  test('email failure calls reportError and does NOT set activationEmailSentAt', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({ id: 'u-email-fail', pushTokens: [] }), // no push, only email
    ]);
    mockActivationEmail.mockRejectedValueOnce(new Error('SMTP down'));

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ userId: 'u-email-fail' }),
    );
  });

  test('one user push failure does not prevent other users from being processed', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      makeActivationCandidate({ id: 'u-ok', email: null }),    // push only
      makeActivationCandidate({ id: 'u-fail', email: null }),  // push only — will fail
    ]);
    mockSendPush
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('push'));

    const sent = await processActivationCohort();

    // Round 251: u-ok succeeds (claim + send + no rollback = 1 updateMany).
    // u-fail claims, send fails, then rolls back (claim + rollback = 2 updateMany).
    // Total updateMany = 3. Only u-ok counts toward sent.
    expect(sent).toBe(1);
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-ok', activationPushSentAt: null }),
        data: { activationPushSentAt: expect.any(Date) },
      }),
    );
  });

  test('returns 0 without throwing when Prisma fails', async () => {
    mockUserFindMany.mockRejectedValueOnce(new Error('DB down'));

    const sent = await processActivationCohort();

    expect(sent).toBe(0);
    expect(mockReportError).toHaveBeenCalled();
  });

  test('cohort filter bounds registration age to [7d ago, 24h ago]', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);

    await processActivationCohort();

    // Verify the query includes both bounds — protects against
    // accidentally re-introducing the regression where legacy users
    // registered months ago would get a "fresh signup" activation email.
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            lt: expect.any(Date),  // ≥24h ago
            gte: expect.any(Date), // ≤7d ago
          }),
        }),
      }),
    );
    const callArg = mockUserFindMany.mock.calls[0][0];
    const lt = callArg.where.createdAt.lt as Date;
    const gte = callArg.where.createdAt.gte as Date;
    // gte (older bound) must be earlier than lt (newer bound)
    expect(gte.getTime()).toBeLessThan(lt.getTime());
    // The window must be at least 6 days wide (7 - 1)
    expect(lt.getTime() - gte.getTime()).toBeGreaterThanOrEqual(6 * 86_400_000);
  });

  describe('quiet hours guard', () => {
    // The retention service skips push during 19:00..05:00 UTC = 22:00..08:00
    // MSK to avoid waking users with activation pushes at 3am Moscow.
    // Email always fires (sits in inbox harmlessly until morning).
    afterEach(() => {
      // Restore the test-suite default time after per-test overrides
      jest.setSystemTime(new Date('2026-04-29T12:00:00Z').getTime());
    });

    test('at 22:30 MSK (19:30 UTC) — push deferred, email still fires', async () => {
      jest.setSystemTime(new Date('2026-04-29T19:30:00Z').getTime());
      mockUserFindMany.mockResolvedValueOnce([
        makeActivationCandidate({ id: 'u-night' }),
      ]);

      const sent = await processActivationCohort();

      // Email fires (1), push deferred (0)
      expect(sent).toBe(1);
      expect(mockSendPush).not.toHaveBeenCalled();
      expect(mockActivationEmail).toHaveBeenCalledTimes(1);
      // Critically: push *SentAt must NOT be set so the user is picked up
      // again at the next non-quiet tick. Round 251: gating now uses
      // updateMany — only 1 call (email claim), not 2 (push + email).
      expect(mockUserUpdateMany).toHaveBeenCalledTimes(1);
    });

    test('at 03:00 MSK (00:00 UTC) — push deferred, email still fires', async () => {
      jest.setSystemTime(new Date('2026-04-29T00:00:00Z').getTime());
      mockUserFindMany.mockResolvedValueOnce([
        makeActivationCandidate({ id: 'u-deep-night' }),
      ]);

      const sent = await processActivationCohort();

      expect(sent).toBe(1);
      expect(mockSendPush).not.toHaveBeenCalled();
      expect(mockActivationEmail).toHaveBeenCalledTimes(1);
    });

    test('at 09:00 MSK (06:00 UTC) — push fires (just past quiet window)', async () => {
      jest.setSystemTime(new Date('2026-04-29T06:00:00Z').getTime());
      mockUserFindMany.mockResolvedValueOnce([
        makeActivationCandidate({ id: 'u-morning', email: null }), // push only
      ]);

      const sent = await processActivationCohort();

      expect(sent).toBe(1);
      expect(mockSendPush).toHaveBeenCalledTimes(1);
    });
  });
});

// ── processReactivationCohort ─────────────────────────────────────────────────

describe('processReactivationCohort', () => {
  // Round 253: reactivation cohorts now use updateMany for atomic
  // claim-then-send. Tests assert against updateMany instead of update.
  test('updates reactivation7dSentAt for 7-day cohort', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-1', firstName: 'Test' }]);

    await processReactivationCohort(7);

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-1', reactivation7dSentAt: null }),
        data: { reactivation7dSentAt: expect.any(Date) },
      }),
    );
  });

  test('updates reactivation14dSentAt for 14-day cohort', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-1', firstName: 'Test' }]);

    await processReactivationCohort(14);

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-1', reactivation14dSentAt: null }),
        data: { reactivation14dSentAt: expect.any(Date) },
      }),
    );
  });

  test('updates reactivation30dSentAt for 30-day cohort', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u-1', firstName: 'Test' }]);

    await processReactivationCohort(30);

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u-1', reactivation30dSentAt: null }),
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

  test('quiet hours: returns 0 + skips DB query entirely (no candidates fetched)', async () => {
    // Reactivation cohort defers as a whole during quiet hours (push-only,
    // no email channel). Verify findMany never gets called — saves a DB
    // round trip on every quiet-window cron tick.
    jest.setSystemTime(new Date('2026-04-29T20:00:00Z').getTime()); // 23:00 MSK

    const sent = await processReactivationCohort(7);

    expect(sent).toBe(0);
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockSendPush).not.toHaveBeenCalled();

    // Restore the suite default for subsequent tests
    jest.setSystemTime(new Date('2026-04-29T12:00:00Z').getTime());
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

    // thisWeek aggregate (groupBy), lastWeek count (groupBy), exercise rows
    mockWorkoutGroupBy
      .mockResolvedValueOnce([
        { userId: 'u-1', _count: { _all: 1 }, _sum: { totalVolume: 5000, durationMinutes: 60 } },
      ])
      .mockResolvedValueOnce([{ userId: 'u-1', _count: { _all: 2 } }]);
    mockWorkoutExerciseFindMany.mockResolvedValueOnce([
      {
        workout: { userId: 'u-1' },
        exercise: { name: 'Жим лёжа' },
        sets: [
          { weight: 100, reps: 5, completed: true },
          { weight: 80, reps: 3, completed: false }, // excluded: completed=false
        ],
      },
      {
        workout: { userId: 'u-1' },
        exercise: { name: 'Присед' },
        sets: [{ weight: 120, reps: 3, completed: true }],
      },
    ]);

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

    mockWorkoutGroupBy
      .mockResolvedValueOnce([
        { userId: 'u-1', _count: { _all: 1 }, _sum: { totalVolume: 3000, durationMinutes: 45 } },
      ])
      .mockResolvedValueOnce([]); // no last-week workouts
    mockWorkoutExerciseFindMany.mockResolvedValueOnce([
      {
        workout: { userId: 'u-1' },
        exercise: { name: 'Тяга' },
        sets: [{ weight: 150, reps: 5, completed: true }], // vol = 750
      },
      {
        workout: { userId: 'u-1' },
        exercise: { name: 'Жим' },
        sets: [{ weight: 100, reps: 5, completed: true }], // vol = 500
      },
    ]);

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

    // Both users send with zeroed stats — no workout aggregates returned.
    mockWorkoutGroupBy.mockResolvedValue([]);
    mockWorkoutExerciseFindMany.mockResolvedValue([]);

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

    // Round 253: now uses updateMany for atomic CAS — assert against
    // the claim call (renewalNoticeSentAt: null in WHERE, Date in data).
    expect(mockSubUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sub-1', renewalNoticeSentAt: null }),
        data: { renewalNoticeSentAt: expect.any(Date) },
      }),
    );
  });

  test('renewalNoticeSentAt rolled back when email fails', async () => {
    mockSubFindMany.mockResolvedValueOnce([makeSubscription()]);
    mockPreRenewalEmail.mockRejectedValueOnce(new Error('SMTP error'));

    await processPreRenewalNotices();

    // Round 253: claim succeeds (set→Date) → email fails → rollback (set→null).
    // So updateMany is called twice: once to claim, once to rollback.
    expect(mockSubUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockSubUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { renewalNoticeSentAt: null },
      }),
    );
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

  describe('quiet hours guard', () => {
    // 376-ФЗ §4 is satisfied by the email (legal channel that lands in
    // inbox harmlessly at any hour). The push is a UX nudge and gets
    // skipped during 22:00..08:00 MSK so we don't wake users at 03:00
    // with a charging warning. Mirrors the activation cohort's behaviour.
    afterEach(() => {
      jest.setSystemTime(new Date('2026-04-29T12:00:00Z').getTime());
    });

    test('at 22:30 MSK (19:30 UTC) — push deferred, email + gate still set', async () => {
      jest.setSystemTime(new Date('2026-04-29T19:30:00Z').getTime());
      mockSubFindMany.mockResolvedValueOnce([makeSubscription()]);

      const sent = await processPreRenewalNotices();

      expect(sent).toBe(1);
      expect(mockSendPush).not.toHaveBeenCalled();
      expect(mockPreRenewalEmail).toHaveBeenCalledTimes(1);
      // Gate must still be set so the user doesn't get a duplicate email
      // on the next tick — email already satisfied the legal requirement.
      // Round 253: claim flows through updateMany now.
      expect(mockSubUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'sub-1', renewalNoticeSentAt: null }),
          data: { renewalNoticeSentAt: expect.any(Date) },
        }),
      );
    });

    test('at 03:00 MSK (00:00 UTC) — push deferred, email + gate still set', async () => {
      jest.setSystemTime(new Date('2026-04-29T00:00:00Z').getTime());
      mockSubFindMany.mockResolvedValueOnce([makeSubscription()]);

      const sent = await processPreRenewalNotices();

      expect(sent).toBe(1);
      expect(mockSendPush).not.toHaveBeenCalled();
      expect(mockPreRenewalEmail).toHaveBeenCalledTimes(1);
      expect(mockSubUpdateMany).toHaveBeenCalledTimes(1);
    });

    test('at 09:00 MSK (06:00 UTC) — push fires (just past quiet window)', async () => {
      jest.setSystemTime(new Date('2026-04-29T06:00:00Z').getTime());
      mockSubFindMany.mockResolvedValueOnce([makeSubscription()]);

      const sent = await processPreRenewalNotices();

      expect(sent).toBe(1);
      expect(mockSendPush).toHaveBeenCalledTimes(1);
      expect(mockPreRenewalEmail).toHaveBeenCalledTimes(1);
    });
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
