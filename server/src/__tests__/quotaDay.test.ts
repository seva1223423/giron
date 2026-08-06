/**
 * When the free-tier day starts.
 *
 * The food-scan routes resolve the quota day on the user's own clock and say
 * why in a comment: a user in Vladivostok who hit the limit at 14:00 could not
 * scan again until 10:00 the next morning, twenty hours later, because the
 * server reset at UTC midnight. The chat quota had the same bug and never got
 * the same fix — ten messages, then locked out past your own midnight.
 *
 * Worse, one request used two different floors: the early exit derived one
 * from the client's date, and the transaction that actually enforces derived
 * another from the server's. They disagreed for three hours every night.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    aIMemory: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { dailyQuotaFloor } from '../routes/ai';

const MOSCOW = 180;      // UTC+3
const VLADIVOSTOK = 600; // UTC+10
const LOS_ANGELES = -480; // UTC-8

/** What the floor looks like on the user's own wall clock. */
const localWallClock = (floor: Date, offsetMinutes: number) =>
  new Date(floor.getTime() + offsetMinutes * 60_000).toISOString().slice(11, 16);

describe('dailyQuotaFloor', () => {
  test('lands on local midnight in Moscow', () => {
    expect(localWallClock(dailyQuotaFloor(MOSCOW), MOSCOW)).toBe('00:00');
  });

  test('lands on local midnight in Vladivostok', () => {
    // The timezone from the food-scan comment: the reset used to be ten hours
    // late here.
    expect(localWallClock(dailyQuotaFloor(VLADIVOSTOK), VLADIVOSTOK)).toBe('00:00');
  });

  test('lands on local midnight west of Greenwich too', () => {
    expect(localWallClock(dailyQuotaFloor(LOS_ANGELES), LOS_ANGELES)).toBe('00:00');
  });

  test('an old client that sends nothing gets UTC midnight', () => {
    // Not a correct answer — the behaviour being replaced. Pinned so a build
    // without the field is not silently given a different day boundary.
    expect(dailyQuotaFloor(undefined).toISOString().slice(11)).toBe('00:00:00.000Z');
  });

  test('the floor is never in the future', () => {
    for (const off of [MOSCOW, VLADIVOSTOK, LOS_ANGELES, 0, 840, -720]) {
      expect(dailyQuotaFloor(off).getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  test('the floor is never more than a day old', () => {
    for (const off of [MOSCOW, VLADIVOSTOK, LOS_ANGELES, 0]) {
      expect(Date.now() - dailyQuotaFloor(off).getTime()).toBeLessThan(24 * 60 * 60 * 1000);
    }
  });

  test('two calls in the same request agree', () => {
    // The bug was two floors in one request, not a wrong floor alone.
    expect(dailyQuotaFloor(MOSCOW).getTime()).toBe(dailyQuotaFloor(MOSCOW).getTime());
  });
});
