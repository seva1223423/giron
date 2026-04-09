import { todayDateStr, localDateStr, getMonday, getPastDates, formatNum } from '../utils/date';

describe('timezone safety', () => {
  test('localDateStr does NOT use toISOString (which is UTC)', () => {
    // Create a date at 11PM in a +3 timezone - toISOString would show next day
    const d = new Date(2026, 3, 8, 23, 30, 0); // Apr 8, 11:30 PM local
    const result = localDateStr(d);
    expect(result).toBe('2026-04-08'); // Should be local date, not UTC
    // toISOString would give '2026-04-09' in UTC if timezone is +3
  });

  test('getMonday handles Sunday correctly (was broken: returned NEXT Monday)', () => {
    // Sunday April 12, 2026
    const sunday = new Date(2026, 3, 12); // month is 0-indexed
    const monday = getMonday(sunday);
    // Should return PREVIOUS Monday (Apr 6), not next Monday (Apr 13)
    expect(monday.getDate()).toBe(6);
    expect(monday.getMonth()).toBe(3); // April
  });

  test('getMonday handles Saturday', () => {
    const saturday = new Date(2026, 3, 11);
    const monday = getMonday(saturday);
    expect(monday.getDate()).toBe(6);
  });

  test('getMonday on Monday returns same day', () => {
    const mon = new Date(2026, 3, 6);
    const result = getMonday(mon);
    expect(result.getDate()).toBe(6);
  });

  test('formatNum uses comma for Russian locale', () => {
    expect(formatNum(1.5)).toBe('1,5');
    expect(formatNum(0.0)).toBe('0,0');
    expect(formatNum(123.456, 2)).toBe('123,46');
    expect(formatNum(-2.5)).toBe('-2,5');
  });
});
