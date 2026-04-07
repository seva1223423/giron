/**
 * Timezone-safe date utilities.
 * Using toISOString().split('T')[0] gives UTC date, which is wrong
 * for users in non-UTC timezones (e.g. UTC+3 at 11PM = next day in UTC).
 */

/** Returns today's date as YYYY-MM-DD in local timezone */
export function todayDateStr(): string {
  return localDateStr(new Date());
}

/** Formats a Date to YYYY-MM-DD in local timezone */
export function localDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns Monday of the current week (local timezone) */
export function getMonday(d: Date = new Date()): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  // Sunday = 0, Monday = 1, ..., Saturday = 6
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return result;
}

/** Get past N dates as YYYY-MM-DD strings (local timezone) */
export function getPastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return localDateStr(d);
  });
}
