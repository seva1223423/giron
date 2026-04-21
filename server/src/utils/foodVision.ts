/**
 * Helpers for the /ai/analyze-food pipeline — JSON extraction, value
 * clamping, duplicate merging.
 *
 * Extracted from routes/ai.ts so the non-trivial logic (especially the
 * calorie-vs-macro reconciliation and the dedup merge) can be unit-tested
 * without standing up the whole Express app.
 */

export interface FoodItem {
  name: string;
  weightGrams: number;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
  confidence?: number;
}

/** Pull a FoodItem[] out of a possibly-messy LLM response. Handles:
 *   - ```json fenced blocks
 *   - JSON objects with items array, or bare arrays
 *   - notFood:true shortcut (returns [] rather than null)
 *   - typical LLM JSON formatting errors (trailing commas, single quotes,
 *     unquoted keys, doubled quotes)
 *
 *   Returns null only when no JSON could be salvaged at all. */
export function parseFoodResponse(text: string): FoodItem[] | null {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();

  // Check if the whole thing is a bare array first. This path used to live
  // as a fallback but the regex /\{[\s\S]*\}/ would swallow objects inside
  // arrays like `[{...}]`, preventing bare arrays from ever being recognised.
  if (cleaned.startsWith('[')) {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const items = JSON.parse(arrayMatch[0]);
        if (Array.isArray(items) && items.length > 0 && items[0].name) return items;
      } catch { /* fall through to object-parse attempt */ }
    }
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.notFood === true) return [];
    if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch { /* fall through to repair attempt */ }

  try {
    const fixed = jsonMatch[0]
      .replace(/,\s*}/g, '}')           // trailing comma before }
      .replace(/,\s*]/g, ']')           // trailing comma before ]
      .replace(/'/g, '"')               // single quotes → double
      .replace(/(\w+)\s*:/g, '"$1":')   // unquoted keys → quoted
      .replace(/""(\w+)""/g, '"$1"');   // accidental double-quoting
    const parsed = JSON.parse(fixed);
    if (parsed.notFood === true) return [];
    if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
    return null;
  } catch {
    return null;
  }
}

/**
 * Clamp, reconcile, and merge LLM-returned FoodItem[] so the response
 * payload to the client is always sensible:
 *
 *  1. Drop items with empty names or obviously invalid weights (> 5kg)
 *  2. Clamp every numeric field to a physically-plausible range
 *  3. Reconcile calories against macro-derived kcal (p*4 + f*9 + c*4). If
 *     they disagree by > 25%, take the average — LLMs often drift one way
 *     or the other and the mean lands closer to truth than either alone.
 *  4. Merge items whose normalized names are identical — the vision model
 *     occasionally returns "грудка" and "куриная грудка" for the same
 *     ingredient on the same plate, and without merging the user sees
 *     both cards and the totals double-count.
 */
export function validateFoodItems(items: FoodItem[]): FoodItem[] {
  const normalized = items
    .filter((item) => item.name && typeof item.name === 'string' && item.name.trim().length > 0)
    .filter((item) => {
      const w = Number(item.weightGrams);
      return isNaN(w) || w === 0 || (w > 0 && w <= 5000);
    })
    .map((item) => {
      const w = Math.round(Math.max(1, Math.min(5000, Number(item.weightGrams) || 100)));
      const prot = Math.max(0, Math.min(300, Number(item.protein) || 0));
      const fats = Math.max(0, Math.min(300, Number(item.fats) || 0));
      const carbs = Math.max(0, Math.min(600, Number(item.carbs) || 0));
      const aiCal = Math.max(0, Math.min(5000, Number(item.calories) || 0));
      const macroCal = prot * 4 + fats * 9 + carbs * 4;

      let finalCal: number;
      if (aiCal === 0) {
        finalCal = Math.round(macroCal);
      } else if (macroCal === 0) {
        finalCal = Math.round(aiCal);
      } else {
        const ratio = aiCal / macroCal;
        finalCal = (ratio < 0.75 || ratio > 1.25)
          ? Math.round((aiCal + macroCal) / 2)
          : Math.round(aiCal);
      }

      const conf = Number(item.confidence);
      const confidence = !isNaN(conf) && conf >= 0.5 && conf <= 1.0
        ? Math.round(conf * 100) / 100
        : undefined;

      return {
        name: String(item.name).trim().slice(0, 200),
        weightGrams: w,
        calories: finalCal,
        protein: Math.round(prot * 10) / 10,
        fats: Math.round(fats * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        ...(confidence != null ? { confidence } : {}),
      } as FoodItem;
    });

  // Merge duplicates by normalized name.
  const groups = new Map<string, FoodItem[]>();
  for (const item of normalized) {
    const key = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return Array.from(groups.values()).map((bucket): FoodItem => {
    if (bucket.length === 1) return bucket[0];
    const weightGrams = Math.min(5000, bucket.reduce((s, i) => s + i.weightGrams, 0));
    const calories = Math.min(5000, bucket.reduce((s, i) => s + i.calories, 0));
    const protein = Math.round(bucket.reduce((s, i) => s + i.protein, 0) * 10) / 10;
    const fats = Math.round(bucket.reduce((s, i) => s + i.fats, 0) * 10) / 10;
    const carbs = Math.round(bucket.reduce((s, i) => s + i.carbs, 0) * 10) / 10;
    const name = bucket.reduce((best, i) => (i.name.length > best.length ? i.name : best), bucket[0].name);
    const confidences = bucket.map((i) => i.confidence).filter((c): c is number => c != null);
    const confidence = confidences.length > 0 ? Math.min(...confidences) : undefined;
    return {
      name,
      weightGrams,
      calories,
      protein,
      fats,
      carbs,
      ...(confidence != null ? { confidence } : {}),
    };
  });
}
