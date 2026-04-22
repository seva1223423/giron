/**
 * Plate loading calculator — pure helper extracted from PlateCalculatorTab.
 *
 * Given a target barbell weight and the weight of the bare bar, calculates
 * how many plates of each standard size to add to one side.
 *
 * Algorithm: greedy from largest to smallest plate. Floating-point remainder
 * is rounded to 2 decimal places after each step to avoid drift (e.g., 0.2
 * instead of 0.19999...).
 */

export const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export type PlateSize = (typeof PLATE_SIZES)[number];

/**
 * Returns a map from plate size → count (plates per SIDE).
 * An empty map means the target equals or is less than the barbell weight.
 */
export function calculatePlates(targetKg: number, barbellKg: number): Map<PlateSize, number> {
  const platesWeight = (targetKg - barbellKg) / 2;
  const result = new Map<PlateSize, number>();
  if (platesWeight <= 0) return result;

  let remaining = platesWeight;
  for (const plate of PLATE_SIZES) {
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.set(plate, count);
      remaining = Math.round((remaining - count * plate) * 100) / 100;
    }
  }
  return result;
}

/** Convenience: sum up the total weight loaded (both sides + barbell). */
export function totalLoadedWeight(plates: Map<PlateSize, number>, barbellKg: number): number {
  let perSide = 0;
  for (const [size, count] of plates) perSide += size * count;
  return barbellKg + perSide * 2;
}
