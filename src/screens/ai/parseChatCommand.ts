/**
 * AI-chat local command parser (Direction A spec, chat2.md).
 *
 * Pure function — no React, no stores, no side effects. Takes raw chat
 * text, returns a discriminated-union command shape or `null` if nothing
 * matched (caller falls back to the existing server-side AI pipeline).
 *
 * The parser turns the chat into a quick CLI for the 6 most common ops
 * during a workout. Goal: instant feedback (no network roundtrip) for
 * what would otherwise be a 3-5s wait while the server-side AI tools
 * fire.
 *
 * Adding a new command:
 *  1. Add a variant to `ParsedCommand`.
 *  2. Add a regex below + the matching branch in `parseChatCommand`.
 *  3. Add 2-4 test cases in `__tests__/parseChatCommand.test.ts` —
 *     positive matches + a near-miss that MUST stay null.
 *
 * Russian-first because that's our market. English aliases (`done`,
 * `next`, `repeat last`) only where they read naturally; we don't
 * mirror every command bilingually.
 */

export type ParsedCommand =
  | { type: 'add_water'; ml: number }
  | { type: 'add_set'; weight: number; reps: number }
  | { type: 'complete_set' }
  | { type: 'adjust_weight'; delta: number }
  | { type: 'next_exercise' }
  | { type: 'repeat_last' };

// ─── Patterns ───────────────────────────────────────────────────────────────
// Order matters: more specific patterns must come before greedier ones.

/**
 * Water — `+250 воды`, `выпил 500 мл`, `добавь 300 воды`, `вода 300`.
 * Numbers up to 9999 (caller caps further). Allows optional `мл` /
 * `воды` / `мл воды` suffix and a flexible verb prefix.
 * Verb variants:
 *   - `выпил`, `выпила`, `выпили` (past tense, any gender)
 *   - `добавь` (imperative) + `добавил`, `добавил` (past)
 *   - `вода` (bare noun, "вода 250")
 *   - `+` (plain pulse)
 */
const WATER_RE = /^(?:\+\s*|выпил[аи]?\s+|добав(?:ил?|ь)\s+|вода\s+)(\d{1,4})\s*(?:мл(?:\s+воды)?|воды|мл)?\s*$/i;

/**
 * Add set — `добавь подход 100×6`, `+подход 100x6`, `подход 100 на 6`,
 * `подход 100.5×5` (decimal weight ok).
 */
const ADD_SET_RE = /^(?:\+\s*подход|добавь?\s+подход|подход)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:[×x×*]|на)\s*(\d{1,3})\s*$/i;

/**
 * Complete next pending set — `засчитай подход` (with or without word
 * "подход"), `выполнил`, `сделано`, `done`, `+1`.
 * Anchored short matchers — they must MATCH THE WHOLE LINE, otherwise
 * an off-topic message containing "done" inside it would false-positive.
 */
const COMPLETE_RE = /^(?:засчитай(?:\s+подход)?|выполнил|сделано|done|\+\s*1)\s*$/i;

/** Adjust pending weights — `сделай тяжелее`, `тяжелее`, `+5кг`, `harder`. */
const HEAVIER_RE = /^(?:сделай\s+тяжелее|тяжелее|\+\s*5\s*кг|harder)\s*$/i;

/** `сделай легче`, `легче`, `-5кг`, `easier`. */
const LIGHTER_RE = /^(?:сделай\s+легче|легче|-\s*5\s*кг|easier)\s*$/i;

/**
 * Move to next exercise — `следующее упражнение`, `next`, `next exercise`,
 * `след упр` (common abbreviation).
 */
const NEXT_RE = /^(?:следующ\S*\s+упражн\S*|next(?:\s+exercise)?|след\.?\s+упр\.?)\s*$/i;

/** Duplicate last completed set — `повтори последний`, `repeat last`. */
const REPEAT_LAST_RE = /^(?:повтор(?:и)?\s+последний|repeat\s+last)\s*$/i;

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Try to parse a chat input as a local command. Returns null if no
 * pattern matched — caller should fall through to the server AI pipeline.
 */
export function parseChatCommand(rawText: string): ParsedCommand | null {
  const text = rawText.trim();
  if (!text) return null;

  // Water (most common, check first).
  // Min volume = 50 ml. Smaller numbers (e.g. `+1`) fall through to
  // other matchers — `+1` is the complete_set shortcut, and we mustn't
  // shadow it with a 1-ml water shape match.
  const water = text.match(WATER_RE);
  if (water) {
    const ml = parseInt(water[1], 10);
    if (Number.isFinite(ml) && ml >= 50 && ml <= 5000) {
      return { type: 'add_water', ml };
    }
    // Shape matched, number out of range — fall through. A `+1` here
    // continues down to the COMPLETE_RE check below; a `+9999 воды`
    // continues to nothing (returns null at the end).
  }

  // Add set.
  const addSet = text.match(ADD_SET_RE);
  if (addSet) {
    const weight = parseFloat(addSet[1].replace(',', '.'));
    const reps = parseInt(addSet[2], 10);
    if (Number.isFinite(weight) && weight >= 0 && weight <= 500 && reps >= 1 && reps <= 100) {
      return { type: 'add_set', weight, reps };
    }
    // Out-of-range numbers fall through, same logic as water.
  }

  if (COMPLETE_RE.test(text)) return { type: 'complete_set' };
  if (HEAVIER_RE.test(text)) return { type: 'adjust_weight', delta: 5 };
  if (LIGHTER_RE.test(text)) return { type: 'adjust_weight', delta: -5 };
  if (NEXT_RE.test(text)) return { type: 'next_exercise' };
  if (REPEAT_LAST_RE.test(text)) return { type: 'repeat_last' };

  return null;
}
