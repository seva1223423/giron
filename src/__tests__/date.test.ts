import { todayDateStr, localDateStr, getMonday, getPastDates, formatNum, computeStreak } from '../utils/date';

describe('date utils', () => {
  test('todayDateStr returns YYYY-MM-DD format', () => {
    const result = todayDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('localDateStr formats date correctly', () => {
    const d = new Date(2026, 0, 15); // Jan 15 2026
    expect(localDateStr(d)).toBe('2026-01-15');
  });

  test('localDateStr pads single digit month and day', () => {
    const d = new Date(2026, 2, 5); // Mar 5 2026
    expect(localDateStr(d)).toBe('2026-03-05');
  });

  test('getMonday returns Monday for any day of the week', () => {
    // Wednesday March 4 2026
    const wed = new Date(2026, 2, 4);
    const monday = getMonday(wed);
    expect(monday.getDay()).toBe(1); // 1 = Monday
    expect(localDateStr(monday)).toBe('2026-03-02');
  });

  test('getMonday on Sunday returns previous Monday', () => {
    // Sunday March 8 2026
    const sun = new Date(2026, 2, 8);
    const monday = getMonday(sun);
    expect(monday.getDay()).toBe(1);
    expect(localDateStr(monday)).toBe('2026-03-02');
  });

  test('getMonday on Monday returns same day', () => {
    const mon = new Date(2026, 2, 2);
    const monday = getMonday(mon);
    expect(localDateStr(monday)).toBe('2026-03-02');
  });

  test('getPastDates returns correct number of dates', () => {
    const dates = getPastDates(7);
    expect(dates).toHaveLength(7);
    // First date should be today
    expect(dates[0]).toBe(todayDateStr());
  });

  test('formatNum uses comma as decimal separator', () => {
    expect(formatNum(1.5)).toBe('1,5');
    expect(formatNum(0)).toBe('0,0');
    expect(formatNum(100.123, 2)).toBe('100,12');
  });
});

// Helper: returns a date N days ago as YYYY-MM-DD ISO string
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

describe('computeStreak', () => {
  test('returns 0 for empty array', () => {
    expect(computeStreak([])).toBe(0);
  });

  test('returns 0 for array with only invalid dates', () => {
    expect(computeStreak(['not-a-date', '', 'abc'])).toBe(0);
  });

  test('returns 1 when only today has a workout', () => {
    expect(computeStreak([daysAgo(0)])).toBe(1);
  });

  test('returns 1 when only yesterday has a workout (today forgiving)', () => {
    // Today = no workout, yesterday = workout → streak is still 1
    expect(computeStreak([daysAgo(1)])).toBe(1);
  });

  test('returns 3 for workouts on today, yesterday, and 2 days ago', () => {
    expect(computeStreak([daysAgo(0), daysAgo(1), daysAgo(2)])).toBe(3);
  });

  test('returns 3 for yesterday + 2 days ago + 3 days ago (today forgiving)', () => {
    expect(computeStreak([daysAgo(1), daysAgo(2), daysAgo(3)])).toBe(3);
  });

  test('breaks streak at a gap', () => {
    // Workouts today and 2 days ago, but NOT yesterday → gap breaks at day 1
    expect(computeStreak([daysAgo(0), daysAgo(2)])).toBe(1);
  });

  test('breaks streak at gap when today has no workout', () => {
    // Workouts 2 and 3 days ago, not yesterday → gap at yesterday breaks streak
    expect(computeStreak([daysAgo(2), daysAgo(3)])).toBe(0);
  });

  test('deduplicates multiple workouts on same day', () => {
    // Two workouts on same day should count as streak of 1
    expect(computeStreak([daysAgo(0), daysAgo(0), daysAgo(1)])).toBe(2);
  });

  test('handles ISO strings with time component', () => {
    // Strings like "2026-04-22T08:00:00.000Z" should parse correctly
    const todayIso = new Date().toISOString();
    const yesterdayIso = new Date(Date.now() - 86400000).toISOString();
    expect(computeStreak([todayIso, yesterdayIso])).toBe(2);
  });

  test('returns 0 when last workout was 2 days ago (gap = yesterday)', () => {
    expect(computeStreak([daysAgo(2), daysAgo(3), daysAgo(4)])).toBe(0);
  });

  test('counts a long streak correctly', () => {
    const dates = Array.from({ length: 30 }, (_, i) => daysAgo(i + 1)); // yesterday through 30 days ago
    expect(computeStreak(dates)).toBe(30); // today forgiving, yesterday starts streak
  });

  test('caps at 365 days max', () => {
    const dates = Array.from({ length: 400 }, (_, i) => daysAgo(i));
    expect(computeStreak(dates)).toBe(365);
  });
});
