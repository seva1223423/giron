/**
 * Pure helpers used by the Food Scanner screen.
 *
 * Kept in a standalone module (free of React Native imports) so they can be
 * unit-tested cleanly — the screen itself is too entangled with camera /
 * permission side effects to test straight.
 */

import type { NutritionItem } from '../types';

// ─── AI scan result cache (fingerprinting + sanity limits) ────────────────────

export const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Fingerprint a base64 payload for the AI result cache.
 *
 * Non-cryptographic: `length:first64:last64`. Intended to detect the same
 * compressed image being re-analysed within the TTL window — not to guard
 * against collisions from adversarial inputs. Base64 payloads of real JPEG
 * photos differ in content, length, and trailing padding almost always, so
 * the collision rate is negligible in practice.
 */
export function fingerprintBase64(b64: string): string {
  const len = b64.length;
  if (len < 128) return `${len}:${b64}`;
  return `${len}:${b64.slice(0, 64)}:${b64.slice(-64)}`;
}

// Sanity thresholds for AI vision output. Any item or total exceeding these
// is almost certainly a mis-parse (e.g. the model confused ml with g, or
// mistook a huge bucket for a bowl). We still let the user save — we just
// flag it loudly.
export const SANITY_MAX_KCAL_PER_100G = 900; // oils ~884, nothing edible beats this
export const SANITY_MAX_KCAL_PER_ITEM = 2500; // a whole pizza ~2500
export const SANITY_MAX_TOTAL_KCAL = 5000;    // a whole day's calories in one meal is suspect

export type SanityFlag = 'kcal_per_100g' | 'kcal_per_item' | 'total_kcal';

export function flagSanity(items: Pick<NutritionItem, 'calories' | 'weightGrams'>[]): SanityFlag[] {
  const flags: SanityFlag[] = [];
  if (items.length === 0) return flags;

  const total = items.reduce((s, i) => s + (i.calories || 0), 0);
  if (total > SANITY_MAX_TOTAL_KCAL) flags.push('total_kcal');

  for (const item of items) {
    const w = item.weightGrams || 0;
    if (w <= 0) continue;
    const per100 = (item.calories / w) * 100;
    if (per100 > SANITY_MAX_KCAL_PER_100G) { flags.push('kcal_per_100g'); break; }
  }

  for (const item of items) {
    if ((item.calories || 0) > SANITY_MAX_KCAL_PER_ITEM) { flags.push('kcal_per_item'); break; }
  }

  return flags;
}

// ─── Confidence bucketing for the per-item dot indicator ──────────────────────

export type ConfidenceBucket = 'high' | 'medium' | 'low';

/**
 * AI sometimes returns numeric confidence in 0..1, sometimes omits it. Bucket
 * into 3 bins so we can render a single-color dot per item without futzing
 * with continuous gradients.
 */
export function confidenceBucket(conf: number | undefined | null): ConfidenceBucket {
  if (conf == null) return 'low';
  if (conf >= 0.8) return 'high';
  if (conf >= 0.5) return 'medium';
  return 'low';
}

// ─── OpenFoodFacts helpers ────────────────────────────────────────────────────

/** Extract kcal/100g from OFF `nutriments`. Falls back to kJ→kcal (×0.239)
 *  for products that only carry kJ in their labelling (very common in EU/RU). */
export function extractKcal(n: Record<string, any>): number {
  if (n['energy-kcal_100g'] != null && n['energy-kcal_100g'] > 0) return Math.round(n['energy-kcal_100g']);
  if (n['energy-kcal'] != null && n['energy-kcal'] > 0) return Math.round(n['energy-kcal']);
  if (n['energy-kj_100g'] != null && n['energy-kj_100g'] > 0) return Math.round(n['energy-kj_100g'] / 4.184);
  if (n['energy_100g'] != null && n['energy_100g'] > 100) return Math.round(n['energy_100g'] / 4.184);
  return 0;
}

/** Parse serving-size strings like "100g", "30 g", "1 portion (45g)", "250ml"
 *  into grams (treating ml as grams for liquids, a reasonable approximation).
 *  Returns null if no plausible weight can be extracted. Clamps to a sane
 *  range so pathological strings like "1000000g" don't leak through. */
export function parseServingGrams(servingSize: string): number | null {
  if (!servingSize) return null;
  const gMatch = servingSize.match(/(\d+(?:[.,]\d+)?)\s*g(?!\w)/i);
  if (gMatch) {
    const g = Math.round(parseFloat(gMatch[1].replace(',', '.')));
    if (g >= 5 && g <= 2000) return g;
  }
  const mlMatch = servingSize.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
  if (mlMatch) {
    const ml = Math.round(parseFloat(mlMatch[1].replace(',', '.')));
    if (ml >= 5 && ml <= 500) return ml;
  }
  return null;
}

// ─── Meal-type default (time-of-day heuristic) ────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Pick a sensible default meal type from the user's local clock. */
export function defaultMealType(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 20) return 'dinner';
  return 'snack';
}
