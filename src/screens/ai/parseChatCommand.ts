/**
 * AI-chat local command parser (Direction A spec, chat2.md).
 *
 * Pure function — no React, no stores, no side effects. Takes raw chat
 * text, returns a discriminated-union command shape or `null` if nothing
 * matched (caller falls back to the existing server-side AI pipeline).
 *
 * The parser turns the chat into a quick CLI for the most common ops
 * across the app — workout, nutrition, sleep, theme, stats. Goal:
 * instant feedback (no network roundtrip) for what would otherwise be
 * a 3-5s wait while the server-side AI tools fire.
 *
 * Adding a new command:
 *  1. Add a variant to `ParsedCommand`.
 *  2. Add a regex below + the matching branch in `parseChatCommand`.
 *  3. Add 2-4 test cases in `__tests__/parseChatCommand.test.ts` —
 *     positive matches + a near-miss that MUST stay null.
 *
 * Russian-first because that's our market. English aliases where natural.
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
  | { type: 'log_measurement'; field: MeasurementField; cm: number }
  // ── Phase E: meals + sleep + settings ──────────────────────────────────
  | { type: 'log_meal_kcal'; mealType: MealType; kcal: number }
  | { type: 'reset_water' }
  | { type: 'remove_last_meal' }
  | { type: 'log_sleep'; hours: number; minutes: number }
  | { type: 'set_theme'; mode: 'light' | 'dark' | 'auto' }
  | { type: 'toggle_notifications'; enabled: boolean }
  | { type: 'toggle_water_reminders'; enabled: boolean }
  | { type: 'schedule_rest_today' }
  // ── Phase E: read-only stats (push info toast) ─────────────────────────
  | { type: 'stats_water' }
  | { type: 'stats_meal' }
  | { type: 'stats_progress' }
  | { type: 'stats_last_workout' };

export type MeasurementField =
  | 'chest'
  | 'waist'
  | 'hips'
  | 'bicep'
  | 'thigh'
  | 'calf'
  | 'neck';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// ─── Patterns ───────────────────────────────────────────────────────────────
// Order matters: more specific patterns must come before greedier ones.

/** Water: `+250 воды`, `выпил 500 мл`, `вода 300`. */
const WATER_RE = /^(?:\+\s*|выпил[аи]?\s+|добав(?:ил?|ь)\s+|вода\s+)(\d{1,4})\s*(?:мл(?:\s+воды)?|воды|мл)?\s*$/i;

/** Add set: `добавь подход 100×6`, `+подход 100×6`. */
const ADD_SET_RE = /^(?:\+\s*подход|добавь?\s+подход|подход)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:[×x×*]|на)\s*(\d{1,3})\s*$/i;

const COMPLETE_RE = /^(?:засчитай(?:\s+подход)?|выполнил|сделано|done|\+\s*1)\s*$/i;
const HEAVIER_RE = /^(?:сделай\s+тяжелее|тяжелее|\+\s*5\s*кг|harder)\s*$/i;
const LIGHTER_RE = /^(?:сделай\s+легче|легче|-\s*5\s*кг|easier)\s*$/i;
const NEXT_RE = /^(?:следующ\S*\s+упражн\S*|next(?:\s+exercise)?|след\.?\s+упр\.?)\s*$/i;
const PREV_RE = /^(?:предыдущ\S*\s+упражн\S*|prev(?:ious)?(?:\s+exercise)?|назад|пред\.?\s+упр\.?)\s*$/i;
const REPEAT_LAST_RE = /^(?:повтор(?:и)?\s+последний|repeat\s+last)\s*$/i;
const REMOVE_SET_RE = /^(?:убери\s+подход|удали\s+(?:последний\s+)?подход|минус\s+подход|remove\s+(?:last\s+)?set|undo\s+set)\s*$/i;
const FINISH_RE = /^(?:закончить\s+тренировку|финиш|готово\s+тренировка|finish\s+workout)\s*$/i;
const CANCEL_RE = /^(?:отмени(?:ть)?\s+тренировку|cancel\s+workout)\s*$/i;
const SET_WEIGHT_RE = /^(?:вес|weight)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:кг|kg)?\s*$/i;
const SET_REPS_RE = /^(?:(?:повтор(?:ов|ы)|reps)\s+(\d{1,3})(?:\s+раз[а]?)?|(\d{1,3})\s+(?:повтор(?:ов|а|ений|ение)|раз[а]?))\s*$/i;
const REST_TIMER_RE = /^(?:отдых|пауза|rest)\s+(\d{1,3})\s*(?:сек|сек\.|s)?\s*$/i;
const CAL_TARGET_RE = /^(?:цель\s+калорий|target\s+calories)\s+(\d{3,5})\s*(?:ккал|kcal)?\s*$/i;
const WATER_TARGET_RE = /^(?:цель\s+воды|water\s+target)\s+(\d{3,5})\s*(?:мл|ml)?\s*$/i;
const RUN_RE = /^(?:пробежал[аи]?|run)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
const WALK_RE = /^(?:прошёл|прошла|прошли|пешком|walked|walk)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
const CARDIO_MIN_RE = /^(\d{1,3})\s+(?:минут?|мин\.?|minutes?|min)\s+кардио\s*$/i;

const MEASUREMENT_PATTERNS: Array<{ field: MeasurementField; re: RegExp }> = [
  { field: 'chest', re: /^(?:грудь|chest)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'waist', re: /^(?:талия|waist)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'hips', re: /^(?:бедра|hips)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'bicep', re: /^(?:бицепс|плечо|bicep)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'thigh', re: /^(?:бедро|thigh)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'calf', re: /^(?:икра|calf)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'neck', re: /^(?:шея|neck)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
];

// ─── Phase E patterns ──────────────────────────────────────────────────────

/**
 * Meal-by-calories. Two forms:
 *   `+300 ккал`        → snack with 300 kcal (no explicit meal type)
 *   `завтрак 400 ккал` / `обед 600 ккал` / `ужин 500 ккал` / `перекус 200 ккал`
 */
const MEAL_KCAL_TYPED_RE = /^(завтрак|обед|ужин|перекус)\s+(\d{2,4})\s*(?:ккал|kcal)?\s*$/i;
const MEAL_KCAL_PLUS_RE = /^\+\s*(\d{2,4})\s*ккал\s*$/i;

const RESET_WATER_RE = /^(?:обнули?\s+воду|сброс(?:ь)?\s+воду|reset\s+water)\s*$/i;
const REMOVE_LAST_MEAL_RE = /^(?:удали\s+последний\s+приём|убери\s+приём|минус\s+приём|remove\s+last\s+meal)\s*$/i;

/**
 * Sleep duration. Three forms:
 *   `спал 7 30`   → 7h 30min
 *   `спал 7.5`    → 7h 30min (.5 → 30 min, .25 → 15 min)
 *   `спал 8`      → 8h 00min
 */
const SLEEP_HM_RE = /^(?:спал[аи]?|sleep|slept)\s+(\d{1,2})\s+(\d{1,2})\s*$/i;
const SLEEP_DECIMAL_RE = /^(?:спал[аи]?|sleep|slept)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:ч|h|часов?|hours?)?\s*$/i;

/** Theme mode. */
const THEME_DARK_RE = /^(?:тёмная\s+тема|тёмный\s+режим|dark\s+(?:theme|mode))\s*$/i;
const THEME_LIGHT_RE = /^(?:светлая\s+тема|светлый\s+режим|light\s+(?:theme|mode))\s*$/i;
const THEME_AUTO_RE = /^(?:авто\s+тема|auto\s+theme|системная\s+тема)\s*$/i;

/** Notifications on/off. */
const NOTIF_ON_RE = /^(?:уведомления\s+вкл(?:ючить)?|notifications?\s+on|вкл\s+уведомления)\s*$/i;
const NOTIF_OFF_RE = /^(?:уведомления\s+выкл(?:ючить)?|notifications?\s+off|выкл\s+уведомления)\s*$/i;

/** Water reminders on/off. */
const WATER_REM_ON_RE = /^(?:напоминани[ея]\s+вод[ыу]?\s+вкл(?:ючить)?|water\s+reminders?\s+on)\s*$/i;
const WATER_REM_OFF_RE = /^(?:напоминани[ея]\s+вод[ыу]?\s+выкл(?:ючить)?|water\s+reminders?\s+off)\s*$/i;

/** "Сегодня отдых" — clear today's week-plan entry. */
const REST_TODAY_RE = /^(?:сегодня\s+отдых|выходной\s+сегодня|rest\s+day\s+today)\s*$/i;

/** Read-only stats commands. */
const STATS_WATER_RE = /^(?:сколько\s+вод[ыу]|вода\??)\s*$/i;
const STATS_MEAL_RE = /^(?:сколько\s+(?:калорий|съел[аи]?)|калорий\??|сколько\s+я\s+съел[аи]?)\s*$/i;
const STATS_PROGRESS_RE = /^(?:мой\s+прогресс|прогресс|статистика|stats|my\s+stats)\s*$/i;
const STATS_LAST_WORKOUT_RE = /^(?:последняя\s+тренировка|last\s+workout)\s*$/i;

// ─── Parser ─────────────────────────────────────────────────────────────────

export function parseChatCommand(rawText: string): ParsedCommand | null {
  const text = rawText.trim();
  if (!text) return null;

  // ── Phase A core ─────────────────────────────────────────────────────────

  // Water (most common, check first).
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

  // ── Phase E: meal kcal ───────────────────────────────────────────────────

  const mealTyped = text.match(MEAL_KCAL_TYPED_RE);
  if (mealTyped) {
    const mealTypeRus = mealTyped[1].toLowerCase();
    const kcal = parseInt(mealTyped[2], 10);
    const mealType = mealTypeFromRus(mealTypeRus);
    if (mealType && Number.isFinite(kcal) && kcal >= 10 && kcal <= 5000) {
      return { type: 'log_meal_kcal', mealType, kcal };
    }
  }

  const mealPlus = text.match(MEAL_KCAL_PLUS_RE);
  if (mealPlus) {
    const kcal = parseInt(mealPlus[1], 10);
    if (Number.isFinite(kcal) && kcal >= 10 && kcal <= 5000) {
      // Untyped quick-add → snack (least pretentious bucket).
      return { type: 'log_meal_kcal', mealType: 'snack', kcal };
    }
  }

  if (RESET_WATER_RE.test(text)) return { type: 'reset_water' };
  if (REMOVE_LAST_MEAL_RE.test(text)) return { type: 'remove_last_meal' };

  // ── Phase E: sleep ───────────────────────────────────────────────────────

  const sleepHM = text.match(SLEEP_HM_RE);
  if (sleepHM) {
    const hours = parseInt(sleepHM[1], 10);
    const minutes = parseInt(sleepHM[2], 10);
    if (hours >= 0 && hours <= 16 && minutes >= 0 && minutes < 60) {
      return { type: 'log_sleep', hours, minutes };
    }
  }

  const sleepDec = text.match(SLEEP_DECIMAL_RE);
  if (sleepDec) {
    const decimal = parseFloat(sleepDec[1].replace(',', '.'));
    if (Number.isFinite(decimal) && decimal > 0 && decimal <= 16) {
      const hours = Math.floor(decimal);
      const minutes = Math.round((decimal - hours) * 60);
      return { type: 'log_sleep', hours, minutes };
    }
  }

  // ── Phase E: settings ────────────────────────────────────────────────────

  if (THEME_DARK_RE.test(text)) return { type: 'set_theme', mode: 'dark' };
  if (THEME_LIGHT_RE.test(text)) return { type: 'set_theme', mode: 'light' };
  if (THEME_AUTO_RE.test(text)) return { type: 'set_theme', mode: 'auto' };
  if (NOTIF_ON_RE.test(text)) return { type: 'toggle_notifications', enabled: true };
  if (NOTIF_OFF_RE.test(text)) return { type: 'toggle_notifications', enabled: false };
  if (WATER_REM_ON_RE.test(text)) return { type: 'toggle_water_reminders', enabled: true };
  if (WATER_REM_OFF_RE.test(text)) return { type: 'toggle_water_reminders', enabled: false };
  if (REST_TODAY_RE.test(text)) return { type: 'schedule_rest_today' };

  // ── Phase E: stats queries (read-only, surface as info toast) ────────────

  if (STATS_WATER_RE.test(text)) return { type: 'stats_water' };
  if (STATS_MEAL_RE.test(text)) return { type: 'stats_meal' };
  if (STATS_PROGRESS_RE.test(text)) return { type: 'stats_progress' };
  if (STATS_LAST_WORKOUT_RE.test(text)) return { type: 'stats_last_workout' };

  return null;
}

function mealTypeFromRus(rus: string): MealType | null {
  switch (rus) {
    case 'завтрак': return 'breakfast';
    case 'обед': return 'lunch';
    case 'ужин': return 'dinner';
    case 'перекус': return 'snack';
    default: return null;
  }
}
