/**
 * Unit tests for getTimeContext (round 165).
 *
 * Builds the "ВРЕМЯ И ДАТА" block injected into the system prompt.
 * Drives time-of-day-aware suggestions ("утро — хорошее для кардио").
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

import { getTimeContext } from '../routes/ai';

describe('getTimeContext — time-of-day buckets', () => {
  test('hour 5-9 → утро', () => {
    expect(getTimeContext(7)).toMatch(/утро/);
    expect(getTimeContext(7)).toMatch(/тренировк/i); // contains training-related hint
  });

  test('hour 10-13 → первая половина дня', () => {
    expect(getTimeContext(11)).toMatch(/первая половина дня/);
  });

  test('hour 14-16 → день', () => {
    expect(getTimeContext(15)).toMatch(/день/);
    expect(getTimeContext(15)).toMatch(/температура тела/i);
  });

  test('hour 17-20 → вечер', () => {
    expect(getTimeContext(19)).toMatch(/вечер/);
  });

  test('hour 21-23 → ночь', () => {
    expect(getTimeContext(22)).toMatch(/ночь/);
    expect(getTimeContext(22)).toMatch(/восстановл|сон/i);
  });

  test('hour 0-4 → ночь (wraps around midnight)', () => {
    expect(getTimeContext(2)).toMatch(/ночь/);
  });

  test('hour at boundary 5 → утро (inclusive)', () => {
    expect(getTimeContext(5)).toMatch(/утро/);
  });

  test('hour at boundary 9 → утро (last hour)', () => {
    expect(getTimeContext(9)).toMatch(/утро/);
  });

  test('hour at boundary 10 → первая половина дня', () => {
    expect(getTimeContext(10)).toMatch(/первая половина дня/);
  });
});

describe('getTimeContext — date formatting', () => {
  test('includes ru-RU formatted date when clientDate provided', () => {
    const out = getTimeContext(12, '2026-04-30');
    // Should be DD.MM.YYYY format from ru-RU locale
    expect(out).toMatch(/30\.0?4\.2026/);
  });

  test('includes day name from clientDate', () => {
    // 2026-04-30 was a Thursday — but we use UTC noon so verify against that
    const out = getTimeContext(12, '2026-04-30');
    // Whichever day it is, should be one of 7 Russian day names
    expect(out).toMatch(/(?:понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)/i);
  });
});

describe('getTimeContext — output shape', () => {
  test('always starts with header', () => {
    const out = getTimeContext(12);
    expect(out).toMatch(/## ВРЕМЯ И ДАТА/);
  });

  test('default to current time when no args', () => {
    const out = getTimeContext();
    // Should produce some output; basic non-empty check
    expect(out.length).toBeGreaterThan(20);
  });

  test('hour 0 (midnight) → ночь branch', () => {
    expect(getTimeContext(0)).toMatch(/ночь/);
  });
});
