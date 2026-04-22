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

/** Format number with comma as decimal separator for Russian locale */
export function formatNum(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace('.', ',');
}

/** Get past N dates as YYYY-MM-DD strings (local timezone) */
export function getPastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return localDateStr(d);
  });
}

/**
 * Compute current workout streak from history.
 * Streak = consecutive calendar days (going back from today) that contain at least one
 * completed workout. Today is special: if there is no workout today yet the streak is NOT
 * broken — you still have until midnight to maintain it.
 *
 * @param completedDates - array of YYYY-MM-DD strings (or Date-parseable strings) of completed workouts
 */
export function computeStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;
  const dateSet = new Set(
    completedDates.map((d) => {
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? '' : localDateStr(parsed);
    }).filter(Boolean)
  );
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    if (dateSet.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      break; // gap found — streak ends
    }
    // i === 0 with no workout today: don't break, let streak survive until midnight
  }
  return streak;
}
