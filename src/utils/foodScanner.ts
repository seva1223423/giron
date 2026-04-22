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

/** Build a sensible display name from OFF product fields.
 *
 *  OpenFoodFacts returns `product_name` (often bare like "Classic Coke"),
 *  `product_name_ru` / `_en` (localised), `brands` (comma-separated list of
 *  manufacturers, often includes redundant trademark suffixes), and
 *  `quantity` (e.g. "500ml"). Just taking product_name misses the brand on
 *  generic-sounding names; just concatenating brand + name doubles up when
 *  the product name already contains the brand.
 *
 *  Heuristic:
 *   1. Pick the best name variant (ru → generic → en → brand).
 *   2. If brand is present AND not already a substring of the name AND
 *      the name looks generic (≤ 2 words), prefix it.
 *   3. Append `quantity` in parens when present AND not already visible.
 *   4. Strip junk whitespace and clamp to 150 chars.
 */
export function buildBarcodeDisplayName(p: {
  product_name?: string;
  product_name_ru?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
}): string {
  const nameRaw = (p.product_name_ru || p.product_name || p.product_name_en || '').trim();
  const brandRaw = (p.brands || '').split(',')[0]?.trim() || '';
  const quantity = (p.quantity || '').trim();

  let name = nameRaw || brandRaw || 'Неизвестный продукт';
  const lowered = name.toLowerCase();

  // Only prefix brand when (a) brand is known, (b) brand isn't already in the
  // name, (c) the name is short/generic (likely missing brand context).
  if (
    brandRaw &&
    brandRaw.toLowerCase() !== lowered &&
    !lowered.includes(brandRaw.toLowerCase()) &&
    name.split(/\s+/).length <= 2
  ) {
    name = `${brandRaw} ${name}`;
  }

  // Append quantity if not already visible (avoids "Coke 0.5l (500ml)").
  if (quantity && !name.toLowerCase().includes(quantity.toLowerCase())) {
    name = `${name} (${quantity})`;
  }

  return name.replace(/\s+/g, ' ').trim().slice(0, 150) || 'Неизвестный продукт';
}

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

// ─── SavedFoods matching ──────────────────────────────────────────────────────
//
// When the AI recognises a food that the user has previously added manually or
// saved from a prior scan (e.g. "куриная грудка" appears in savedFoods), the
// user's saved macros are more trustworthy than the AI's per-image estimate.
// We prefer the saved per-100g values scaled to the AI-reported weight.

export interface MatchableFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
  weightGrams: number;
}

/** Normalize a food name for comparison: lowercase, collapse whitespace, drop
 *  trailing weight markers like "(100г)" that are produced by the manual-add
 *  flow so they don't prevent matching. */
export function normalizeFoodName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(\s*\d+\s*[гgml]+\s*\)\s*$/i, '') // strip "(100г)", "(30 g)", etc.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a saved food whose normalized name matches the query. Only exact
 * (normalized) matches — we don't want fuzzy matches like "яблоко" jumping
 * to "яблочное пюре", because macros differ a lot.
 */
export function findSavedFoodMatch<T extends MatchableFood>(
  savedFoods: T[],
  query: string,
): T | undefined {
  const norm = normalizeFoodName(query);
  if (!norm) return undefined;
  return savedFoods.find((f) => normalizeFoodName(f.name) === norm);
}

/**
 * Return the set of *normalized* food names that appear 2+ times in a list.
 *
 * Used by the scanner screen to warn the user when the AI (or a multi-photo
 * append) produced near-duplicates like "Яблоко" + "яблоко (100г)" — these
 * would otherwise double-count into the totals. We compare by
 * `normalizeFoodName` so "(100г)" suffixes and case differences don't hide
 * the overlap. Empty/whitespace names are skipped.
 */
export function findDuplicateNames<T extends { name: string }>(items: T[]): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeFoodName(item.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dups = new Set<string>();
  for (const [key, count] of counts) {
    if (count >= 2) dups.add(key);
  }
  return dups;
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

// ─── Typical portion from history ────────────────────────────────────────────
//
// If the user has logged "куриная грудка" five times in the last month with
// weights {150, 150, 160, 150, 140}, the AI's per-image guess of 100g is
// almost certainly too low for THIS user. Surfacing the median of past
// portions as a one-tap suggestion cuts the scan-edit-save loop from three
// taps to one.
//
// We use median (not mean) so a single outlier meal (family gathering,
// restaurant doubling) doesn't pull the suggestion away from the user's
// typical serving.

export interface HistoricalMeal {
  items: Array<{ name: string; weightGrams: number }>;
}

/** Median of a non-empty numeric array. Returns 0 for empty input. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Build a "user's typical portion in grams" lookup from meal history.
 * Keys are normalized names (see `normalizeFoodName`), values are median
 * weight observations. Only items with ≥ `minSamples` samples are included
 * to avoid presenting a one-shot outlier as the user's "typical" serving.
 */
export function computeTypicalPortions(
  meals: HistoricalMeal[],
  minSamples = 2,
): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const meal of meals) {
    for (const item of meal.items) {
      const key = normalizeFoodName(item.name);
      if (!key) continue;
      const w = item.weightGrams;
      if (typeof w !== 'number' || !isFinite(w) || w <= 0) continue;
      const arr = groups.get(key) ?? [];
      arr.push(w);
      groups.set(key, arr);
    }
  }
  const out = new Map<string, number>();
  for (const [key, weights] of groups) {
    if (weights.length < minSamples) continue;
    out.set(key, Math.round(median(weights)));
  }
  return out;
}

/** Lookup the user's typical portion for a food name (normalized match). */
export function typicalPortionFor(
  typical: Map<string, number>,
  name: string,
): number | undefined {
  return typical.get(normalizeFoodName(name));
}

// ─── Draft autosave ───────────────────────────────────────────────────────────
//
// The scanner screen builds up a lot of in-memory state (AI-recognised items,
// bases, image, meal type, flags) that used to evaporate if the user backed
// out, backgrounded the app, or the process was killed — any half-edited
// scan was gone for good. These helpers gate a draft through AsyncStorage
// so the next mount can offer "continue where you left off".
//
// Expiry: 2h. If you scanned lunch and didn't come back for half a day, the
// meal-type default has shifted anyway and the draft is stale.

export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

/** Serializable draft state. Kept deliberately minimal — only what we need
 *  to rehydrate the recognised-items list + meal-type choice. The image
 *  URI is local-file only and intentionally NOT saved: the picker's cache
 *  dir gets cleaned between sessions and a dead URI would just show a
 *  broken thumbnail. */
export interface ScannerDraft {
  mealType: MealType;
  isBarcodeResult: boolean;
  items: Array<{
    name: string;
    calories: number;
    protein: number;
    fats: number;
    carbs: number;
    weightGrams: number;
    confidence?: number;
  }>;
  savedAt: number;
}

export function isDraftFresh(draft: ScannerDraft | null | undefined): boolean {
  if (!draft) return false;
  return Date.now() - draft.savedAt <= DRAFT_TTL_MS;
}
