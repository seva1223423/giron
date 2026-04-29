/**
 * Timezone + DST transition edge cases for date-sensitive logic.
 *
 * Streak computation, week-dots, and daily quota all use localDateStr
 * or new Date() comparisons. A subtle bug here means a user loses a
 * streak day after travel or daylight saving time shifts.
 */

import { localDateStr, computeStreak, todayDateStr, formatDateMetaRu } from '../utils/date';
import { buildWeekDotsFromHistory, todayMondayIndex } from '../utils/homeDerivations';

// ─── localDateStr across timezones ─────────────────────────────────────────

describe('localDateStr produces YYYY-MM-DD regardless of timezone', () => {
  test('midnight in UTC', () => {
    const d = new Date('2026-04-22T00:00:00Z');
    const s = localDateStr(d);
    // Depending on local timezone, the date may be 04-21 or 04-22.
    // Both are valid — just ensure shape is YYYY-MM-DD.
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('11pm local on a Saturday still says Saturday', () => {
    const d = new Date(2026, 3, 25, 23, 0, 0); // Saturday 11pm local
    const s = localDateStr(d);
    expect(s).toBe('2026-04-25');
  });

  test('1am local is still the same calendar day', () => {
    const d = new Date(2026, 3, 22, 1, 0, 0);
    expect(localDateStr(d)).toBe('2026-04-22');
  });

  test('noon is unambiguous', () => {
    const d = new Date(2026, 3, 22, 12, 0, 0);
    expect(localDateStr(d)).toBe('2026-04-22');
  });

  test('year boundary 31 Dec → 1 Jan', () => {
    expect(localDateStr(new Date(2025, 11, 31))).toBe('2025-12-31');
    expect(localDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  test('leap year Feb 29', () => {
    expect(localDateStr(new Date(2028, 1, 29))).toBe('2028-02-29');
  });

  test('Feb 28 of non-leap year', () => {
    expect(localDateStr(new Date(2027, 1, 28))).toBe('2027-02-28');
  });

  test('single-digit day and month zero-padded', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

// ─── todayDateStr stability ──────────────────────────────────────────────

describe('todayDateStr', () => {
  test('always returns YYYY-MM-DD shape', () => {
    expect(todayDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('two consecutive calls within 10ms return same date', () => {
    const a = todayDateStr();
    const b = todayDateStr();
    expect(a).toBe(b);
  });
});

// ─── Streak across DST transition (spring forward / fall back) ────────────

describe('computeStreak across DST transitions', () => {
  test('DST spring forward (-1 hour) does not break streak', () => {
    // March 28 2026 (Russia has no DST; we test the helper for universality)
    // Since localDateStr uses getFullYear/getMonth/getDate (local clock),
    // DST shouldn't affect it — this is a smoke test.
    const dates = [
      new Date(2026, 2, 27).toISOString(),
      new Date(2026, 2, 28).toISOString(),
      new Date(2026, 2, 29).toISOString(),
    ];
    expect(() => computeStreak(dates)).not.toThrow();
  });

  test('streak handles date strings at different hour-offsets', () => {
    const base = new Date(2026, 3, 20);
    const early = new Date(base);
    early.setHours(1);
    const late = new Date(base);
    late.setHours(23);
    expect(localDateStr(early)).toBe(localDateStr(late));
  });

  test('empty dates array returns 0', () => {
    expect(computeStreak([])).toBe(0);
  });

  test('invalid date strings filtered out', () => {
    expect(computeStreak(['not-a-date', 'also-not'])).toBe(0);
  });

  test('mixed valid and invalid dates are handled', () => {
    const today = new Date();
    const dates = [today.toISOString(), 'invalid', ''];
    expect(computeStreak(dates)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Week dots with different timezone history ────────────────────────────

describe('buildWeekDotsFromHistory UTC vs local', () => {
  test('history strings can be any ISO variant — does not throw', () => {
    const history = [
      { completedAt: '2026-04-22T00:00:00.000Z' },
      { completedAt: '2026-04-21T23:59:59Z' },
      { completedAt: '2026-04-20T12:00:00+03:00' },
      { completedAt: '2026-04-19T00:00:00-08:00' },
    ];
    expect(() => buildWeekDotsFromHistory(history)).not.toThrow();
    expect(buildWeekDotsFromHistory(history)).toHaveLength(7);
  });

  test('completedAt just after midnight same day counts', () => {
    const now = new Date('2026-04-22T12:00:00Z');
    const history = [{ completedAt: '2026-04-22T00:05:00Z' }];
    const dots = buildWeekDotsFromHistory(history, now);
    expect(dots[6]).toBe(1);
  });

  test('completedAt just before midnight counts for that day (in user local TZ)', () => {
    // Round 75: assertion is now TZ-correct. The previous version pinned
    // both `now` and the workout via UTC ISO strings, which silently
    // mis-asserted in any non-UTC test runner — a UTC+3 runner saw the
    // 23:55 UTC workout as 02:55 the NEXT local day and bucketed it as
    // "today" instead of "yesterday". Constructing the dates with the
    // local Date constructor pins them to the runner's actual day-of-week,
    // which is the bucket the user sees on Home.
    const now = new Date(2026, 3, 22, 12, 0); // Apr 22 noon local
    const yesterday2355 = new Date(2026, 3, 21, 23, 55).toISOString();
    const history = [{ completedAt: yesterday2355 }];
    const dots = buildWeekDotsFromHistory(history, now);
    // Index 5 = yesterday (1 day before `now`)
    expect(dots[5]).toBe(1);
  });
});

// ─── todayMondayIndex behaviour at 11:59pm ────────────────────────────────

describe('todayMondayIndex near midnight', () => {
  test('11:59pm Monday is still Monday (index 0)', () => {
    const d = new Date(2026, 3, 20, 23, 59, 59);
    expect(todayMondayIndex(d)).toBe(0);
  });

  test('12:00am Tuesday is Tuesday (index 1)', () => {
    const d = new Date(2026, 3, 21, 0, 0, 0);
    expect(todayMondayIndex(d)).toBe(1);
  });

  test('handles early-morning hours correctly', () => {
    const sat = new Date(2026, 3, 25, 3, 15, 0); // 3:15am Saturday
    expect(todayMondayIndex(sat)).toBe(5);
  });
});

// ─── formatDateMetaRu across year boundaries ───────────────────────────────

describe('formatDateMetaRu year edges', () => {
  test('31 December renders "среда · 31 декабря"', () => {
    const d = new Date(2025, 11, 31); // wed 2025-12-31
    expect(formatDateMetaRu(d)).toBe('среда · 31 декабря');
  });

  test('1 January renders month as "января"', () => {
    const d = new Date(2026, 0, 1); // thu 2026-01-01
    expect(formatDateMetaRu(d)).toBe('четверг · 1 января');
  });

  test('28 February (non-leap) works', () => {
    const d = new Date(2027, 1, 28);
    expect(formatDateMetaRu(d)).toContain('28 февраля');
  });

  test('29 February (leap) works', () => {
    const d = new Date(2028, 1, 29);
    expect(formatDateMetaRu(d)).toContain('29 февраля');
  });
});
