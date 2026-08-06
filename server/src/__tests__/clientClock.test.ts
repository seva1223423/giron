/**
 * Whose "yesterday" the coach means.
 *
 * SleepEntry.date and CardioSession.date are stamped with the CLIENT's local
 * date. Three tools computed their own dates from server UTC instead, which
 * for anyone east of Greenwich is the previous day during their small hours:
 *
 *   Moscow 01:00 on the 6th  →  UTC is still 22:00 on the 5th
 *   "yesterday" = UTC now − 24h = the 4th — two nights back
 *
 * Asked "как я спал" at one in the morning, the coach answered about the
 * wrong night. Asked "сколько я сегодня двигался" after a late run, it said
 * zero. The client's date was in the function signature the whole time.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

const sleepFindFirst = jest.fn();
const cardioFindMany = jest.fn();
const sleepFindMany = jest.fn();
const sampleFindMany = jest.fn();

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    aIMemory: { findMany: jest.fn().mockResolvedValue([]) },
    sleepEntry: {
      findFirst: (...a: unknown[]) => sleepFindFirst(...a),
      findMany: (...a: unknown[]) => sleepFindMany(...a),
    },
    cardioSession: { findMany: (...a: unknown[]) => cardioFindMany(...a) },
    healthSample: { findMany: (...a: unknown[]) => sampleFindMany(...a) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { executeTool, clientDayShift } from '../routes/ai';

/** Moscow is three hours ahead; at 01:00 there it is still yesterday in UTC. */
const CLIENT_TODAY = '2026-08-06';

beforeEach(() => {
  sleepFindFirst.mockReset().mockResolvedValue(null);
  sleepFindMany.mockReset().mockResolvedValue([]);
  cardioFindMany.mockReset().mockResolvedValue([]);
  sampleFindMany.mockReset().mockResolvedValue([]);
});

describe('clientDayShift', () => {
  test('day zero is the day the client says it is', () => {
    expect(clientDayShift(CLIENT_TODAY, 0)).toBe('2026-08-06');
  });

  test('one day back', () => {
    expect(clientDayShift(CLIENT_TODAY, 1)).toBe('2026-08-05');
  });

  test('crosses a month boundary', () => {
    expect(clientDayShift('2026-08-01', 1)).toBe('2026-07-31');
  });

  test('crosses a year boundary', () => {
    expect(clientDayShift('2026-01-01', 1)).toBe('2025-12-31');
  });

  test('handles a leap day', () => {
    expect(clientDayShift('2028-03-01', 1)).toBe('2028-02-29');
  });

  test('falls back to server today when the client sent nothing', () => {
    expect(clientDayShift(undefined, 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('ignores a client date that is not a date', () => {
    // A malformed value would otherwise produce "Invalid Date" and then throw
    // on toISOString, taking the whole tool down.
    expect(clientDayShift('вчера', 1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clientDayShift('', 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('get_sleep_breakdown', () => {
  test('"yesterday" is the night before the client\'s today', async () => {
    await executeTool('get_sleep_breakdown', {}, 'u1', CLIENT_TODAY);
    expect(sleepFindFirst.mock.calls[0][0].where.date).toBe('2026-08-05');
  });

  test('an explicit date is used as given', async () => {
    await executeTool('get_sleep_breakdown', { date: '2026-07-30' }, 'u1', CLIENT_TODAY);
    expect(sleepFindFirst.mock.calls[0][0].where.date).toBe('2026-07-30');
  });

  test('the word "yesterday" resolves the same way as no date at all', async () => {
    await executeTool('get_sleep_breakdown', { date: 'yesterday' }, 'u1', CLIENT_TODAY);
    expect(sleepFindFirst.mock.calls[0][0].where.date).toBe('2026-08-05');
  });
});

describe('get_health_summary', () => {
  test('counts today\'s cardio by the client\'s today', async () => {
    cardioFindMany.mockResolvedValue([
      { date: '2026-08-06', durationMinutes: 40, caloriesBurned: 300, avgHeartRate: 140, vo2Max: null },
      { date: '2026-08-05', durationMinutes: 25, caloriesBurned: 200, avgHeartRate: 130, vo2Max: null },
    ]);

    const r = await executeTool('get_health_summary', { days: 7 }, 'u1', CLIENT_TODAY);

    // Only the run from the client's today counts, and it is not zero.
    expect(r.actionData?.todayActiveMin).toBe(40);
    expect(r.actionData?.todayCardioSessions).toBe(1);
  });

  test('the sleep window starts from the client\'s calendar too', async () => {
    await executeTool('get_health_summary', { days: 7 }, 'u1', CLIENT_TODAY);
    expect(sleepFindMany.mock.calls[0][0].where.date.gte).toBe('2026-07-30');
  });
});
