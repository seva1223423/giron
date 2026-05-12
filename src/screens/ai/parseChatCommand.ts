/**
 * AI-chat local command parser (Direction A spec, chat2.md).
 *
 * Pure function — no React, no stores, no side effects. Takes raw chat
 * text, returns a discriminated-union command shape or `null` if nothing
 * matched (caller falls back to the existing server-side AI pipeline).
 *
 * The parser turns the chat into a quick CLI for the most common ops
 * during a workout / meal log / measurement. Goal: instant feedback (no
 * network roundtrip) for what would otherwise be a 3-5s wait while the
 * server-side AI tools fire.
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
  // ── Phase A: in-workout core ───────────────────────────────────────────
  | { type: 'add_water'; ml: number }
  | { type: 'add_set'; weight: number; reps: number }
  | { type: 'complete_set' }
  | { type: 'adjust_weight'; delta: number }
  | { type: 'next_exercise' }
  | { type: 'repeat_last' }
  // ── Phase D: expanded in-workout controls ──────────────────────────────
  | { type: 'prev_exercise' }
  | { type: 'finish_workout' }
  | { type: 'cancel_workout' }
  | { type: 'remove_last_set' }
  | { type: 'set_weight'; weight: number }
  | { type: 'set_reps'; reps: number }
  | { type: 'set_rest_timer'; seconds: number }
  // ── Phase D: nutrition targets ─────────────────────────────────────────
  | { type: 'set_calories_target'; kcal: number }
  | { type: 'set_water_target'; ml: number }
  // ── Phase D: logging ───────────────────────────────────────────────────
  | { type: 'log_cardio'; kind: 'run' | 'walk' | 'cardio'; minutes?: number; km?: number }
  | { type: 'log_measurement'; field: MeasurementField; cm: number };

export type MeasurementField =
  | 'chest'
  | 'waist'
  | 'hips'
  | 'bicep'
  | 'thigh'
  | 'calf'
  | 'neck';

// ─── Patterns ───────────────────────────────────────────────────────────────
// Order matters: more specific patterns must come before greedier ones.

/**
 * Water — `+250 воды`, `выпил 500 мл`, `добавь 300 воды`, `вода 300`.
 * Numbers up to 9999 (caller caps further). Allows optional `мл` /
 * `воды` / `мл воды` suffix and a flexible verb prefix.
 */
const WATER_RE = /^(?:\+\s*|выпил[аи]?\s+|добав(?:ил?|ь)\s+|вода\s+)(\d{1,4})\s*(?:мл(?:\s+воды)?|воды|мл)?\s*$/i;

/** Add set: `добавь подход 100×6`, `+подход 100×6`, `подход 100 на 6`. */
const ADD_SET_RE = /^(?:\+\s*подход|добавь?\s+подход|подход)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:[×x×*]|на)\s*(\d{1,3})\s*$/i;

/** Complete next pending set: `засчитай`, `done`, `+1`, `сделано`, `выполнил`. */
const COMPLETE_RE = /^(?:засчитай(?:\s+подход)?|выполнил|сделано|done|\+\s*1)\s*$/i;

/** Heavier / lighter: `тяжелее`, `+5 кг`, `harder` / `легче`, `-5 кг`, `easier`. */
const HEAVIER_RE = /^(?:сделай\s+тяжелее|тяжелее|\+\s*5\s*кг|harder)\s*$/i;
const LIGHTER_RE = /^(?:сделай\s+легче|легче|-\s*5\s*кг|easier)\s*$/i;

/** Move forward / backward in the exercise list. */
const NEXT_RE = /^(?:следующ\S*\s+упражн\S*|next(?:\s+exercise)?|след\.?\s+упр\.?)\s*$/i;
const PREV_RE = /^(?:предыдущ\S*\s+упражн\S*|prev(?:ious)?(?:\s+exercise)?|назад|пред\.?\s+упр\.?)\s*$/i;

/** Duplicate last completed set. */
const REPEAT_LAST_RE = /^(?:повтор(?:и)?\s+последний|repeat\s+last)\s*$/i;

/** Drop the last set (typo / wrong entry). */
const REMOVE_SET_RE = /^(?:убери\s+подход|удали\s+(?:последний\s+)?подход|минус\s+подход|remove\s+(?:last\s+)?set|undo\s+set)\s*$/i;

/** Finish / cancel the active workout. */
const FINISH_RE = /^(?:закончить\s+тренировку|финиш|готово\s+тренировка|finish\s+workout)\s*$/i;
const CANCEL_RE = /^(?:отмени(?:ть)?\s+тренировку|cancel\s+workout)\s*$/i;

/** Set weight on the first pending set: `вес 95`, `вес 95 кг`, `weight 95`. */
const SET_WEIGHT_RE = /^(?:вес|weight)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:кг|kg)?\s*$/i;

/**
 * Set reps on the first pending set: `повторов 10`, `повторов 10 раз`,
 * `10 повторов`, `10 раз`, `reps 10`. Order matters — number-suffix form
 * is matched alongside the prefix form because users phrase it both ways.
 */
const SET_REPS_RE = /^(?:(?:повтор(?:ов|ы)|reps)\s+(\d{1,3})(?:\s+раз[а]?)?|(\d{1,3})\s+(?:повтор(?:ов|а|ений|ение)|раз[а]?))\s*$/i;

/** Rest timer for the in-progress workout: `отдых 90`, `отдых 90 сек`, `rest 90`. */
const REST_TIMER_RE = /^(?:отдых|пауза|rest)\s+(\d{1,3})\s*(?:сек|сек\.|сек\.unds?|s)?\s*$/i;

/** Daily calorie / water targets. */
const CAL_TARGET_RE = /^(?:цель\s+калорий|target\s+calories)\s+(\d{3,5})\s*(?:ккал|kcal)?\s*$/i;
const WATER_TARGET_RE = /^(?:цель\s+воды|water\s+target)\s+(\d{3,5})\s*(?:мл|ml)?\s*$/i;

/**
 * Cardio sessions. Three flavours:
 *   - `пробежал 5 км`           → run with distance
 *   - `30 минут кардио`         → cardio with duration
 *   - `прошёл 3 км` / `пешком 3 км` → walk with distance
 * Both km and minutes are optional, but at least one must parse.
 */
const RUN_RE = /^(?:пробежал[аи]?|run)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
const WALK_RE = /^(?:прошёл|прошла|прошли|пешком|walked|walk)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
const CARDIO_MIN_RE = /^(\d{1,3})\s+(?:минут?|мин\.?|minutes?|min)\s+кардио\s*$/i;

/**
 * Body measurements — circumference (cm). Maps Russian + English names
 * to the canonical `MeasurementField`.
 */
const MEASUREMENT_PATTERNS: Array<{ field: MeasurementField; re: RegExp }> = [
  { field: 'chest', re: /^(?:грудь|chest)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'waist', re: /^(?:талия|waist)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'hips', re: /^(?:бедра|hips)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'bicep', re: /^(?:бицепс|плечо|bicep)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'thigh', re: /^(?:бедро|thigh)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'calf', re: /^(?:икра|calf)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'neck', re: /^(?:шея|neck)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
];

// ─── Parser ─────────────────────────────────────────────────────────────────

export function parseChatCommand(rawText: string): ParsedCommand | null {
  const text = rawText.trim();
  if (!text) return null;

  // ── Phase A core ─────────────────────────────────────────────────────────

  // Water (most common, check first).
  // Min volume = 50 ml. Smaller numbers (e.g. `+1`) fall through to
  // other matchers — `+1` is the complete_set shortcut.
  const water = text.match(WATER_RE);
  if (water) {
    const ml = parseInt(water[1], 10);
    if (Number.isFinite(ml) && ml >= 50 && ml <= 5000) {
      return { type: 'add_water', ml };
    }
  }

  const addSet = text.match(ADD_SET_RE);
  if (addSet) {
    const weight = parseFloat(addSet[1].replace(',', '.'));
    const reps = parseInt(addSet[2], 10);
    if (Number.isFinite(weight) && weight >= 0 && weight <= 500 && reps >= 1 && reps <= 100) {
      return { type: 'add_set', weight, reps };
    }
  }

  if (COMPLETE_RE.test(text)) return { type: 'complete_set' };
  if (HEAVIER_RE.test(text)) return { type: 'adjust_weight', delta: 5 };
  if (LIGHTER_RE.test(text)) return { type: 'adjust_weight', delta: -5 };
  if (NEXT_RE.test(text)) return { type: 'next_exercise' };
  if (PREV_RE.test(text)) return { type: 'prev_exercise' };
  if (REPEAT_LAST_RE.test(text)) return { type: 'repeat_last' };
  if (REMOVE_SET_RE.test(text)) return { type: 'remove_last_set' };
  if (FINISH_RE.test(text)) return { type: 'finish_workout' };
  if (CANCEL_RE.test(text)) return { type: 'cancel_workout' };

  // ── Phase D: set tweaks ──────────────────────────────────────────────────

  const setWeight = text.match(SET_WEIGHT_RE);
  if (setWeight) {
    const weight = parseFloat(setWeight[1].replace(',', '.'));
    if (Number.isFinite(weight) && weight >= 0 && weight <= 500) {
      return { type: 'set_weight', weight };
    }
  }

  const setReps = text.match(SET_REPS_RE);
  if (setReps) {
    // Either group 1 (prefix-form: "повторов 10") or group 2
    // (suffix-form: "10 повторов") will be set, never both.
    const repsStr = setReps[1] ?? setReps[2];
    const reps = parseInt(repsStr, 10);
    if (Number.isFinite(reps) && reps >= 1 && reps <= 100) {
      return { type: 'set_reps', reps };
    }
  }

  const restTimer = text.match(REST_TIMER_RE);
  if (restTimer) {
    const seconds = parseInt(restTimer[1], 10);
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 600) {
      return { type: 'set_rest_timer', seconds };
    }
  }

  // ── Phase D: nutrition targets ───────────────────────────────────────────

  const calTarget = text.match(CAL_TARGET_RE);
  if (calTarget) {
    const kcal = parseInt(calTarget[1], 10);
    if (Number.isFinite(kcal) && kcal >= 800 && kcal <= 8000) {
      return { type: 'set_calories_target', kcal };
    }
  }

  const waterTarget = text.match(WATER_TARGET_RE);
  if (waterTarget) {
    const ml = parseInt(waterTarget[1], 10);
    if (Number.isFinite(ml) && ml >= 500 && ml <= 8000) {
      return { type: 'set_water_target', ml };
    }
  }

  // ── Phase D: cardio ──────────────────────────────────────────────────────

  const run = text.match(RUN_RE);
  if (run) {
    const km = parseFloat(run[1].replace(',', '.'));
    if (Number.isFinite(km) && km > 0 && km <= 100) {
      return { type: 'log_cardio', kind: 'run', km };
    }
  }

  const walk = text.match(WALK_RE);
  if (walk) {
    const km = parseFloat(walk[1].replace(',', '.'));
    if (Number.isFinite(km) && km > 0 && km <= 100) {
      return { type: 'log_cardio', kind: 'walk', km };
    }
  }

  const cardioMin = text.match(CARDIO_MIN_RE);
  if (cardioMin) {
    const minutes = parseInt(cardioMin[1], 10);
    if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 600) {
      return { type: 'log_cardio', kind: 'cardio', minutes };
    }
  }

  // ── Phase D: measurements ────────────────────────────────────────────────

  for (const { field, re } of MEASUREMENT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const cm = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(cm) && cm >= 10 && cm <= 250) {
        return { type: 'log_measurement', field, cm };
      }
    }
  }

  return null;
}
