/**
 * Arithmetic behind the number wheel — pure, no React and no store imports.
 *
 * Kept out of the component so it can be tested directly: importing the view
 * would drag in the theme store and, through it, native AsyncStorage. The
 * maths is also the part most likely to be wrong, so it deserves its own home.
 */

/**
 * Build the option list from an integer index.
 *
 * Accumulating `+= 2.5` two hundred times drifts to 102.50000000000001 and the
 * wheel starts rendering noise. Deriving each value from its index keeps every
 * option exact.
 */
export function wheelOptions(min: number, max: number, step: number): number[] {
  const count = Math.max(1, Math.floor((max - min) / step) + 1);
  return Array.from({ length: count }, (_, i) => Math.round((min + i * step) * 1000) / 1000);
}

/**
 * Index of the option nearest to `value`, clamped into range. An off-grid
 * value — 103 against a 2.5 step, or a set saved before the step changed —
 * snaps to the closest option instead of falling off the wheel.
 */
export function wheelIndexOf(value: number, min: number, step: number, count: number): number {
  if (!Number.isFinite(value)) return 0;
  const raw = Math.round((value - min) / step);
  return Math.min(count - 1, Math.max(0, raw));
}

/** Values around `current`, snapped to the step — the ones worth one tap. */
export function buildPresets(current: number, step: number, min = 0, span = 2): number[] {
  const out: number[] = [];
  for (let i = -span; i <= span; i++) {
    const v = Math.round((current + i * step) * 1000) / 1000;
    if (v >= min) out.push(v);
  }
  return out;
}
