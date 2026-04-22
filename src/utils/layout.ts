/**
 * Shared layout math helpers used by multiple design components.
 *
 * Separated into its own file so the tests don't have to load React
 * Native's store graph just to exercise a pure function.
 */

/**
 * Clamp a progress value into the 0..1 domain with NaN / Infinity
 * safety. Used by the Ring + Bar + any other linear-progress
 * visualisation where:
 *   - negative values would render as reverse-fill
 *   - >1 would overflow the track
 *   - NaN would fail the SVG dash-offset math silently
 */
export function clampProgress(v: number): number {
  if (!isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Normalise a week-dots array to exactly 7 cells of 0 | 1 — used by
 * StreakPRGrid. Missing arrays become all-zeros; short ones pad from
 * the start (oldest days zeroed); long ones slice from the end (last
 * 7 days). Guards against NaN / non-binary values by coercing.
 */
export function normalizeWeekDots(dots: unknown): (0 | 1)[] {
  if (!Array.isArray(dots)) return [0, 0, 0, 0, 0, 0, 0];
  // Coerce to 0|1 — any truthy number → 1, anything else → 0
  const coerced = dots.map((d) => (d === 1 ? 1 : 0)) as (0 | 1)[];
  if (coerced.length === 7) return coerced;
  if (coerced.length > 7) return coerced.slice(-7);
  const pad = new Array(7 - coerced.length).fill(0) as 0[];
  return [...pad, ...coerced];
}

/** Russian plural helper for counts of days: 1 → "день", 2..4 → "дня",
 *  5..20 → "дней", 21 → "день", 22..24 → "дня", 25 → "дней", etc. */
export function pluralizeDaysRu(n: number): 'день' | 'дня' | 'дней' {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}
