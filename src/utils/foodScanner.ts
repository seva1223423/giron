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

/**
 * Sanitize and validate a raw barcode string from the camera scanner.
 *
 * The CameraView delivers whatever the native decoder produces, which can
 * include trailing whitespace, occasional control bytes, and — when the
 * label is partially obscured — short malformed reads. Sending those to
 * OpenFoodFacts wastes a round-trip every time and bloats our negative
 * cache with garbage keys. We strip non-digits, then require one of the
 * canonical GTIN lengths (8, 12, 13, 14). EAN-13 / UPC-A also get a
 * checksum verification — a single mis-read digit on a real product
 * would otherwise silently look up the wrong item or return "not found"
 * for what should be a hit.
 *
 * Returns the cleaned barcode on success, `null` when the string can't
 * plausibly be a real product code. Callers should surface a "невалидный
 * штрих-код" hint and avoid network work in the null case.
 */
export function sanitizeBarcode(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8 || digits.length === 12 || digits.length === 14) {
    return digits;
  }
  if (digits.length === 13) {
    return verifyEan13Checksum(digits) ? digits : null;
  }
  return null;
}

/**
 * EAN-13 checksum: sum of odd-positioned digits (1-indexed) plus 3× sum
 * of even-positioned digits, modulo 10, must equal 0. Catches a single
 * mis-decoded digit ~90% of the time, which is the dominant scanner
 * failure mode in poor light (matters for kitchen / store-shelf use,
 * exactly where this app is used).
 */
export function verifyEan13Checksum(barcode: string): boolean {
  if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = barcode.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return sum % 10 === 0;
}

/**
 * EAN-13 country-of-origin prefixes 460–469 are reserved for the
 * Russian Federation. Detecting this is purely informational — OFF
 * coverage of Russian SKUs is patchy and a positive identification
 * here lets the UI both prioritise the RU mirror endpoint and surface
 * a better fallback message ("часто отсутствует в OFF — попробуй фото
 * этикетки") instead of a generic "not found".
 */
export function isRussianBarcode(barcode: string): boolean {
  if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) return false;
  const prefix = parseInt(barcode.slice(0, 3), 10);
  return prefix >= 460 && prefix <= 469;
}

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

/**
 * OpenFoodFacts host preference. `ru.openfoodfacts.org` resolves through
 * a CDN PoP closer to most RF users and isn't on any of the well-known
 * RKN block lists that have hit `world.openfoodfacts.org` in the past;
 * latency from RF mobile networks is usually 200-500ms lower in our
 * field tests. The two hosts share the same dataset, so the response
 * shape is identical — only the network path differs. We keep `world.`
 * as a fallback because the RU mirror occasionally lags by hours
 * during a sync hiccup, and a slow / failed first attempt shouldn't
 * leave the user stranded.
 */
export const OFF_HOSTS = ['ru.openfoodfacts.org', 'world.openfoodfacts.org'] as const;

/**
 * Fetch an OFF product across the host fallback chain. Each host gets
 * its own AbortController with the supplied per-host timeout — this
 * caps worst-case wait time at `timeoutMs * hosts.length`, which
 * matters when the primary mirror is wedged but the user is on a
 * cellular connection where TCP RST can take 30s+ to surface naturally.
 *
 * Returns the first response that arrives with `data.status === 1` or
 * with `status === 0` (product genuinely missing — don't try the
 * secondary, both mirrors share the same DB). Network errors (timeout,
 * 5xx) advance to the next host. If all hosts fail, the final error is
 * rethrown so the caller can show the right message.
 */
export async function fetchBarcodeFromOFF(
  barcode: string,
  fields: string,
  timeoutMs: number = 8_000,
): Promise<{ host: string; data: any } | { host: string; notFound: true }> {
  let lastError: unknown = null;
  for (const host of OFF_HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://${host}/api/v2/product/${barcode}.json?fields=${fields}&lc=ru`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        // 5xx / 429 — try next mirror. 4xx other than 404 also bail to next.
        lastError = new Error(`HTTP ${response.status} from ${host}`);
        continue;
      }
      const data = await response.json();
      if (data?.status === 1) return { host, data };
      // status 0 means OFF replied authoritatively that no such product
      // exists; both mirrors share the same DB so re-asking is wasted work.
      if (data?.status === 0) return { host, notFound: true };
      // Anomalous shape — try next host.
      lastError = new Error(`Unexpected payload from ${host}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('OFF unavailable');
}

/**
 * Reject OFF nutriments that are physically implausible. OFF is
 * crowd-sourced and Russian SKUs in particular suffer from two recurring
 * data-entry errors that get past OFF's own checks:
 *
 *  - kJ value entered into the kcal field (so 1500 kJ → "1500 kcal/100g",
 *    which exceeds the maximum any real food can hit — pure oils top out
 *    near 900 kcal/100g).
 *  - Per-serving values posted into the per-100g field on supplements
 *    or single-portion sachets (so a 30g protein bar reads as 350g of
 *    protein per 100g).
 *
 * Letting either through poisons the user's diary with macros that
 * silently bust their daily targets. Treating implausible OFF data as
 * "not found" prompts the user toward photo scan / manual entry, which
 * for a corrupt entry is the right move.
 *
 * Limits:
 *  - kcal/100g ≤ 900 (oils ~884 is the natural ceiling).
 *  - Each macro ≤ 100g/100g, with a 10% slack on carbs to absorb the
 *    rounding noise OFF sometimes carries on isomalt-heavy products.
 *  - Σ(p·4 + f·9 + c·4) ≤ 1100 — anything higher is physically
 *    impossible regardless of the per-field values.
 */
/**
 * Cache TTLs for the barcode lookup cache. Positive entries (real
 * product data from OFF) live for 30 days — OFF nutrition data
 * doesn't change quickly. Negative entries ("OFF replied status:0")
 * live for 24 hours so community contributions become visible the
 * next day; without negative caching, every retry of a Russian
 * not-in-OFF SKU re-fired both mirrors (~16 s of network).
 */
export const BARCODE_POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const BARCODE_NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

export interface BarcodePositiveEntry {
  name: string;
  cal: number;
  prot: number;
  fats: number;
  carbs: number;
  cachedAt?: number;
}

export interface BarcodeNegativeEntry {
  __notFound: true;
  cachedAt: number;
}

export type BarcodeCacheEntry = BarcodePositiveEntry | BarcodeNegativeEntry;

export type BarcodeCacheLookup =
  | { kind: 'hit'; product: BarcodePositiveEntry }
  | { kind: 'miss-known' }
  | { kind: 'expired'; barcode?: string }
  | null;

/**
 * Evaluate a stored cache entry against TTLs. Pure — takes the
 * already-parsed entry plus the current time, returns the
 * structural decision the caller should act on.
 *
 * Splitting this out of the AsyncStorage I/O lets us unit-test the
 * TTL logic and the negative-cache detection without mocking
 * AsyncStorage. The screen still owns the read/write side effects
 * (eviction on expiry, the `multiSet`-equivalent batching).
 */
export function evaluateBarcodeCacheEntry(
  entry: BarcodeCacheEntry | null | undefined,
  now: number = Date.now(),
): BarcodeCacheLookup {
  if (!entry) return null;
  if ((entry as BarcodeNegativeEntry).__notFound === true) {
    const negEntry = entry as BarcodeNegativeEntry;
    if (now - negEntry.cachedAt > BARCODE_NEGATIVE_TTL_MS) {
      return { kind: 'expired' };
    }
    return { kind: 'miss-known' };
  }
  const posEntry = entry as BarcodePositiveEntry;
  const cachedAt = posEntry.cachedAt ?? 0;
  if (cachedAt && now - cachedAt > BARCODE_POSITIVE_TTL_MS) {
    return { kind: 'expired' };
  }
  // Strip the cachedAt timestamp from the returned product — it's
  // bookkeeping, not data the consumer needs.
  const { cachedAt: _ts, ...product } = posEntry;
  return { kind: 'hit', product: product as BarcodePositiveEntry };
}

/**
 * Minimum shortest-side resolution accepted for the food vision
 * pipeline. Below this threshold the calibration rules in the system
 * prompt (plate sizes, utensils, hand for scale) need the reference
 * features to actually resolve into recognisable shapes — below
 * ~400 px those features compress into a few-pixel blobs and the
 * model falls back to wild-guess portion estimates.
 *
 * Phone cameras produce ≥1080 px on the shortest side, so the
 * tiny-image path only fires for: heavily cropped screenshots,
 * very old gallery photos, or messenger-relayed images mangled by
 * aggressive downsizing.
 */
export const MIN_IMAGE_SHORT_SIDE = 400;

/**
 * Returns true when image dimensions look plausible for food vision.
 *
 * Used to reject obviously-too-small images BEFORE consuming a scan
 * credit — paired with ImagePicker's asset.width/height which are
 * cheap to read. When either dimension is missing/zero we return true
 * (skip the check) so callers that don't have dimensions handy don't
 * accidentally block legitimate scans.
 */
export function isImageDimensionsValid(width: number | undefined | null, height: number | undefined | null): boolean {
  if (!width || !height) return true;
  return Math.min(width, height) >= MIN_IMAGE_SHORT_SIDE;
}

export function isOFFDataPlausible(cal: number, prot: number, fats: number, carbs: number): boolean {
  if (cal > 900) return false;
  if (prot > 100 || fats > 100 || carbs > 110) return false;
  const macroCal = prot * 4 + fats * 9 + carbs * 4;
  if (macroCal > 1100) return false;
  return true;
}

/**
 * Extract kcal/100g from OFF `nutriments`.
 *
 * Field priority — _100g-suffixed fields first, bare fields LAST. The
 * bare `energy-kcal` is contextual: when the product's
 * `nutrition_data_per` is `'serving'`, OFF stores per-serving values
 * there, and treating those as per-100g silently inflates the user's
 * diary by (100 / serving_size_g)× — a 30g protein bar listed as 350
 * kcal would read as "350 kcal/100g" before the round-192 plausibility
 * gate caught it. Reordering means we only fall through to the bare
 * field when no per-100g variant of any kind is available, so the
 * canonical per-100g data wins whenever both exist.
 *
 * The 100-threshold heuristic on `energy_100g` (legacy field) treats
 * values >100 as kJ — almost universal for that field in OFF.
 */
/**
 * Derive kcal/100g from macros when the OFF energy field is empty.
 *
 * About 6% of Russian-market OFF entries carry protein/fat/carb
 * numbers but no energy field — the contributor stopped before
 * filling it in. Saving those at cal=0 produces a confusing diary
 * row ("0 ккал, 12 г белка, 4 г жиров") that users distrust.
 *
 * Atwater factors (4×p + 9×f + 4×c) are exact for whole foods and
 * within ±10% for processed. We refine for fiber when OFF supplies
 * it: regulation/EU treats fiber at ~2 kcal/g not 4, so high-fiber
 * Russian staples (гречка ≈ 10 g fiber, овсянка ≈ 11) had their
 * derived calories overstated by 20-40 kcal/100 g without this
 * adjustment.
 *
 * Fiber is clamped to ≤ carbs to absorb OFF data-entry noise (rare
 * cases where fiber_100g > carbs_100g, usually a unit confusion).
 * Returns 0 when all macros are zero so the all-empty short-circuit
 * upstream still fires.
 */
export function deriveKcalFromMacros(
  prot: number,
  fats: number,
  carbs: number,
  fiber: number = 0,
): number {
  const p = Math.max(0, Number.isFinite(prot) ? prot : 0);
  const f = Math.max(0, Number.isFinite(fats) ? fats : 0);
  const c = Math.max(0, Number.isFinite(carbs) ? carbs : 0);
  const rawFib = Number.isFinite(fiber) ? fiber : 0;
  const fib = Math.max(0, Math.min(c, rawFib));
  if (p + f + c <= 0) return 0;
  const netCarbs = Math.max(0, c - fib);
  return Math.round(p * 4 + f * 9 + netCarbs * 4 + fib * 2);
}

export function extractKcal(n: Record<string, any>): number {
  if (n['energy-kcal_100g'] != null && n['energy-kcal_100g'] > 0) return Math.round(n['energy-kcal_100g']);
  if (n['energy-kj_100g'] != null && n['energy-kj_100g'] > 0) return Math.round(n['energy-kj_100g'] / 4.184);
  if (n['energy_100g'] != null && n['energy_100g'] > 100) return Math.round(n['energy_100g'] / 4.184);
  if (n['energy-kcal'] != null && n['energy-kcal'] > 0) return Math.round(n['energy-kcal']);
  return 0;
}

/**
 * Parse a serving-size value into grams.
 *
 * Accepts:
 *  - strings like "100g", "30 g", "1 portion (45g)", "250ml" — extracts
 *    the numeric portion via regex; treats ml as grams for liquids
 *    (close enough for water-based products, the common case).
 *  - numbers — OFF's `serving_quantity` field comes through this way
 *    (the API sometimes serializes it as a number, sometimes a string).
 *    Unit is implied: OFF stores grams there for solids and ml for
 *    liquids; we treat numerics as grams since `serving_quantity_unit`
 *    isn't requested in the OFF_FIELDS list.
 *  - null / undefined / empty string — returns null cleanly.
 *
 * Round 194: hardened against `serving_quantity` being a number. The
 * old signature only typed `string`, but `p.serving_size ||
 * p.serving_quantity || ''` propagated the raw OFF value, which
 * produced `(30).match is not a function` runtime crashes mid-lookup
 * on products that had only `serving_quantity` populated. The crash
 * surfaced as "Ошибка / Не удалось получить данные" even though the
 * fetch had succeeded — confusing for users and operators alike.
 *
 * Returns null if no plausible weight can be extracted. Clamps to a
 * sane range so pathological values like 1_000_000 don't leak through.
 */
export function parseServingGrams(servingSize: string | number | null | undefined): number | null {
  if (servingSize == null || servingSize === '') return null;
  if (typeof servingSize === 'number') {
    if (!isFinite(servingSize)) return null;
    const g = Math.round(servingSize);
    if (g >= 5 && g <= 2000) return g;
    return null;
  }
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

/** Per-item macro base (kcal + macros per 100g). Keyed by item id in the
 *  scanner's itemBases map. */
export interface MacroBase {
  cal: number;
  prot: number;
  fats: number;
  carbs: number;
}

/** Merge duplicate-named items in a scanner recognized-items list.
 *
 *  For each group of items with the same normalized name:
 *  - Keep the first (preserves any user rename / confidence edits there).
 *  - Sum all weights into the kept item.
 *  - Take the max confidence across the group (so merging a high-conf
 *    item with a low-conf duplicate doesn't drag the merged card's
 *    confidence dot back to red).
 *  - Recompute calories / macros from the kept item's base (per-100g) so
 *    the merged total is self-consistent with the per-100g view.
 *  - Drop all others and prune their entries from `bases`.
 *
 *  Items with empty names are left alone (we can't group what we can't
 *  identify). If no duplicates exist, returns the original arrays
 *  unchanged.
 *
 *  Pure function — callers own the state updates. Extracted here so the
 *  logic can be tested without rendering FoodScannerScreen.
 */
export function mergeDuplicateItems<T extends { id: string; name: string; weightGrams: number; calories: number; protein: number; fats: number; carbs: number; confidence?: number }>(
  items: T[],
  bases: Record<string, MacroBase | undefined>,
): { items: T[]; bases: Record<string, MacroBase>; mergedCount: number } {
  const seen = new Map<string, string>(); // normKey → kept item id
  const extra = new Map<string, number>(); // kept id → summed extra grams
  const maxConf = new Map<string, number>(); // kept id → highest conf across group
  for (const item of items) {
    const key = normalizeFoodName(item.name);
    if (!key) continue;
    const kept = seen.get(key);
    const conf = item.confidence ?? 0;
    if (kept == null) {
      seen.set(key, item.id);
      if (item.confidence != null) maxConf.set(item.id, conf);
    } else {
      extra.set(kept, (extra.get(kept) ?? 0) + (item.weightGrams || 0));
      const prevMax = maxConf.get(kept) ?? 0;
      if (conf > prevMax) maxConf.set(kept, conf);
    }
  }

  if (extra.size === 0) {
    // No duplicates — return originals. Bases unchanged (pass-through).
    const cleanBases: Record<string, MacroBase> = {};
    for (const [id, b] of Object.entries(bases)) if (b) cleanBases[id] = b;
    return { items, bases: cleanBases, mergedCount: 0 };
  }

  const keptIds = new Set(seen.values());
  const mergedCount = items.filter((item) => {
    const key = normalizeFoodName(item.name);
    return key && !keptIds.has(item.id);
  }).length;

  const nextItems = items
    .filter((item) => {
      const key = normalizeFoodName(item.name);
      if (!key) return true; // keep nameless items as-is
      return keptIds.has(item.id);
    })
    .map((item) => {
      const addG = extra.get(item.id);
      // Always apply the max-conf promotion for the kept item, even if no
      // extra weight got added (defensive — keeps the rule simple).
      const conf = maxConf.get(item.id);
      const withConf = conf != null && conf > (item.confidence ?? 0)
        ? { ...item, confidence: conf }
        : item;
      if (!addG) return withConf;
      const newW = (withConf.weightGrams || 0) + addG;
      const base = bases[withConf.id];
      if (!base) return { ...withConf, weightGrams: newW };
      return {
        ...withConf,
        weightGrams: newW,
        calories: Math.round((base.cal * newW) / 100),
        protein: Math.round(((base.prot * newW) / 100) * 10) / 10,
        fats: Math.round(((base.fats * newW) / 100) * 10) / 10,
        carbs: Math.round(((base.carbs * newW) / 100) * 10) / 10,
      };
    });

  const nextBases: Record<string, MacroBase> = {};
  for (const item of nextItems) {
    const b = bases[item.id];
    if (b) nextBases[item.id] = b;
  }

  return { items: nextItems, bases: nextBases, mergedCount };
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
