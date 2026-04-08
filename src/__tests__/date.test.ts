import { todayDateStr, localDateStr, getMonday, getPastDates, formatNum } from '../utils/date';

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
