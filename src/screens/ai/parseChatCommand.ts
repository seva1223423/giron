/**
 * AI-chat local command parser with natural-language preprocessing.
 *
 * Pure function — no React, no stores, no side effects. Takes raw chat
 * text, returns a discriminated-union command shape or `null` if nothing
 * matched (caller falls back to the existing server-side AI pipeline).
 *
 * Two-stage pipeline:
 *  1. `normalizeNumberWords` — pre-pass that rewrites Russian volume /
 *     duration WORDS to their digit equivalents. So "выпил стакан воды"
 *     becomes "выпил 250 мл воды", which the existing WATER_RE then
 *     picks up cleanly.
 *  2. Regex matchers — same shape as before, just with broader verb /
 *     prefix coverage so natural phrasing like "накинь 5 кг", "утром
 *     весил 78", "как у меня вода?" works without forcing the user to
 *     learn a command grammar.
 *
 * Goal: cover the 80% of natural Russian phrasings without dragging in
 * a full NLU pipeline. Anything the parser misses falls through to the
 * server-side AI tools (37 of them, see CLAUDE.md) which understand
 * free-form language.
 */

export type ParsedCommand =
  // ── Phase A: in-workout core ───────────────────────────────────────────
  | { type: 'add_water'; ml: number }
  | { type: 'add_set'; weight: number; reps: number }
  | { type: 'complete_set' }
  | { type: 'adjust_weight'; delta: number }
  | { type: 'next_exercise' }
  | { type: 'repeat_last' }
  // ── Phase D ────────────────────────────────────────────────────────────
  | { type: 'prev_exercise' }
  | { type: 'finish_workout' }
  | { type: 'cancel_workout' }
  | { type: 'remove_last_set' }
  | { type: 'set_weight'; weight: number }
  | { type: 'set_reps'; reps: number }
  | { type: 'set_rest_timer'; seconds: number }
  | { type: 'set_calories_target'; kcal: number }
  | { type: 'set_water_target'; ml: number }
  | { type: 'log_cardio'; kind: 'run' | 'walk' | 'cardio'; minutes?: number; km?: number }
  | { type: 'log_measurement'; field: MeasurementField; cm: number }
  // ── Phase E ────────────────────────────────────────────────────────────
  | { type: 'log_meal_kcal'; mealType: MealType; kcal: number }
  | { type: 'reset_water' }
  | { type: 'remove_last_meal' }
  | { type: 'log_sleep'; hours: number; minutes: number }
  | { type: 'set_theme'; mode: 'light' | 'dark' | 'auto' }
  | { type: 'toggle_notifications'; enabled: boolean }
  | { type: 'toggle_water_reminders'; enabled: boolean }
  | { type: 'schedule_rest_today' }
  | { type: 'stats_water' }
  | { type: 'stats_meal' }
  | { type: 'stats_progress' }
  | { type: 'stats_last_workout' }
  // ── Phase F ────────────────────────────────────────────────────────────
  | { type: 'activate_program'; name: string }
  | { type: 'log_body_weight'; kg: number }
  | { type: 'swap_exercise'; fromName: string; toName: string }
  | { type: 'add_recipe'; name: string };

export type MeasurementField = 'chest' | 'waist' | 'hips' | 'bicep' | 'thigh' | 'calf' | 'neck';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// ─── Natural-language preprocessing ────────────────────────────────────────

/**
 * Replace Russian volume / duration WORDS with digit equivalents so the
 * downstream regex set sees a consistent shape. Order matters — multi-
 * word phrases (e.g. "пол-литра", "полтора часа") must run before their
 * one-word components.
 *
 * Values chosen for the typical Russian context:
 *   стакан       = 250 мл (default drinking glass)
 *   полстакана   = 125 мл
 *   литр         = 1000 мл
 *   пол-литра    = 500 мл
 *   бутылка      = 500 мл (default plastic bottle)
 *   кружка       = 300 мл (mug)
 *
 *   час          = 60 мин
 *   полчаса      = 30 мин
 *   полтора часа = 90 мин
 *   два часа     = 120 мин
 *   три часа     = 180 мин
 */
// `\b` (word boundary) in JS regex is ASCII-only — for Cyrillic it's
// effectively useless ("стакан" is all-non-word to \b). Use explicit
// lookbehind/lookahead on whitespace + string boundaries + punctuation
// so the word matching works for Russian.
const WB_START = '(?<=^|\\s)';
const WB_END = '(?=\\s|$|[.,!?:;])';

const WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  // Multi-word duration FIRST so "полтора часа" doesn't get partial-replaced.
  [new RegExp(`${WB_START}полтор[аы]\\s+час(?:а|ов)?${WB_END}`, 'gi'), '90 мин'],
  [new RegExp(`${WB_START}два\\s+час[аов]+${WB_END}`, 'gi'), '120 мин'],
  [new RegExp(`${WB_START}три\\s+час[аов]+${WB_END}`, 'gi'), '180 мин'],
  [new RegExp(`${WB_START}четыре\\s+час[аов]+${WB_END}`, 'gi'), '240 мин'],

  // Multi-word volume.
  [new RegExp(`${WB_START}пол(?:у|-)?литра${WB_END}`, 'gi'), '500 мл'],
  [new RegExp(`${WB_START}пол\\s+литра${WB_END}`, 'gi'), '500 мл'],

  // Single-word duration. "полчаса" before "час".
  [new RegExp(`${WB_START}полчаса${WB_END}`, 'gi'), '30 мин'],
  [new RegExp(`${WB_START}час(?:ик|ок)?${WB_END}`, 'gi'), '60 мин'],

  // Single-word volume. "полстакана" before "стакан".
  [new RegExp(`${WB_START}полстакана${WB_END}`, 'gi'), '125 мл'],
  [new RegExp(`${WB_START}стакан(?:а|чик|чика)?${WB_END}`, 'gi'), '250 мл'],
  [new RegExp(`${WB_START}бутыл(?:к[аиу]|очк[аиу])${WB_END}`, 'gi'), '500 мл'],
  [new RegExp(`${WB_START}кружк[аиу]${WB_END}`, 'gi'), '300 мл'],
  [new RegExp(`${WB_START}литр(?:а)?${WB_END}`, 'gi'), '1000 мл'],
];

function normalizeNumberWords(text: string): string {
  let out = text;
  for (const [re, replacement] of WORD_REPLACEMENTS) {
    out = out.replace(re, replacement);
  }
  return out;
}

// ─── Patterns ───────────────────────────────────────────────────────────────
// Order matters: more specific patterns must come before greedier ones.

/**
 * Water — broad verb list. Past-tense gendered forms covered:
 *   выпил/выпила/выпили, выдул/выдула, закинул, глотнул, хлебнул, попил,
 *   осилил. Plus imperatives: добавь, добавил, налей. Plus the bare noun
 *   "вода 300" and the pulse "+250".
 *
 * After normalizeNumberWords runs, "выпил стакан" reads as "выпил 250 мл"
 * and hits this regex like any digit form.
 */
const WATER_RE = /^(?:\+\s*|выпил[аи]?\s+|выпива(?:л[аи]?|ю)\s+|выдул[аи]?\s+|закинул[аи]?\s+|глотнул[аи]?\s+|хлебнул[аи]?\s+|попил[аи]?\s+|осилил[аи]?\s+|добав(?:ил?|ь)\s+|налил[аи]?\s+|налей\s+|вода\s+)(\d{1,4})\s*(?:мл(?:\s+воды)?|воды|мл)?\s*$/i;

const ADD_SET_RE = /^(?:\+\s*подход|добавь?\s+подход|подход)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:[×x×*]|на)\s*(\d{1,3})\s*$/i;

/**
 * Complete set — natural confirmations. "Закрыл подход" is the lifter's
 * own phrase. Short forms like "готово" / "ок" risk false positives if
 * used in unrelated chat, so we require either a full word or explicit
 * "+1" punch. Avoid catch-all "ок" / "ага" — they're too noisy.
 */
const COMPLETE_RE = /^(?:засчитай(?:\s+подход)?|выполнил[аи]?(?:\s+подход)?|сделал[аи]?(?:\s+подход)?|закрыл[аи]?\s+подход|сделано|готово|done|\+\s*1)\s*$/i;

/**
 * Heavier / lighter — colloquial verbs added:
 *   накинь 5 (кг), накинуть 5 (кг), прибавь 5 (кг), добавь 5 кг
 *   убавь 5 (кг), сними 5 (кг), убери 5 кг
 * The +/-5 numeric form stays as the shortest hint.
 */
const HEAVIER_RE = /^(?:сделай\s+тяжелее|тяжелее|\+\s*5\s*кг|harder|накин[ьу](?:ть)?\s+5(?:\s*кг)?|прибавь\s+5(?:\s*кг)?|добавь\s+5\s*кг)\s*$/i;
const LIGHTER_RE = /^(?:сделай\s+легче|легче|-\s*5\s*кг|easier|убавь\s+5(?:\s*кг)?|сними\s+5(?:\s*кг)?|убери\s+5\s*кг)\s*$/i;

const NEXT_RE = /^(?:следующ\S*\s+упражн\S*|next(?:\s+exercise)?|след\.?\s+упр\.?|дальше)\s*$/i;
const PREV_RE = /^(?:предыдущ\S*\s+упражн\S*|prev(?:ious)?(?:\s+exercise)?|назад|пред\.?\s+упр\.?|вернись)\s*$/i;
const REPEAT_LAST_RE = /^(?:повтор(?:и|ить)?\s+(?:последний|ещё\s+раз)|повтори|ещё\s+один\s+такой(?:\s+же)?|repeat\s+last)\s*$/i;
const REMOVE_SET_RE = /^(?:убери\s+подход|удали\s+(?:последний\s+)?подход|минус\s+подход|откати\s+подход|remove\s+(?:last\s+)?set|undo\s+set)\s*$/i;
const FINISH_RE = /^(?:закончить\s+тренировку|финиш|готово\s+тренировка|всё(?:\s+на\s+сегодня)?|закончил[аи]?\s+тренировку|finish\s+workout)\s*$/i;
const CANCEL_RE = /^(?:отмени(?:ть)?\s+тренировку|cancel\s+workout|сбрось\s+тренировку)\s*$/i;

const SET_WEIGHT_RE = /^(?:вес|weight|поставь\s+вес|сделай\s+вес)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:кг|kg)?\s*$/i;
const SET_REPS_RE = /^(?:(?:повтор(?:ов|ы)|reps|поставь\s+повторов)\s+(\d{1,3})(?:\s+раз[а]?)?|(\d{1,3})\s+(?:повтор(?:ов|а|ений|ение)|раз[а]?))\s*$/i;
const REST_TIMER_RE = /^(?:отдых|пауза|rest|таймер\s+отдыха)\s+(\d{1,3})\s*(?:сек|сек\.|s)?\s*$/i;

const CAL_TARGET_RE = /^(?:цель\s+калорий|target\s+calories|поставь\s+цель\s+калорий)\s+(\d{3,5})\s*(?:ккал|kcal)?\s*$/i;
const WATER_TARGET_RE = /^(?:цель\s+воды|water\s+target|поставь\s+цель\s+воды)\s+(\d{3,5})\s*(?:мл|ml)?\s*$/i;

const RUN_RE = /^(?:пробежал[аи]?|бежал[аи]?|бегал[аи]?|run)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
const WALK_RE = /^(?:прошёл|прошла|прошли|пешком|погулял[аи]?|гулял[аи]?|walked|walk)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;

/**
 * Cardio with duration only. Three forms covered (post-normalization):
 *   "30 минут кардио"      → 30 min
 *   "час кардио"           → 60 min (normalized)
 *   "бегал час"            → 60 min run (via RUN_RE_BY_DURATION below)
 */
const CARDIO_MIN_RE = /^(\d{1,3})\s+(?:минут?|мин\.?|minutes?|min)\s+кардио\s*$/i;
const RUN_DURATION_RE = /^(?:пробежал[аи]?|бежал[аи]?|бегал[аи]?|run)\s+(\d{1,3})\s+(?:минут?|мин\.?|min)\s*$/i;
const WALK_DURATION_RE = /^(?:прошёл|прошла|прошли|пешком|погулял[аи]?|гулял[аи]?|walked|walk)\s+(\d{1,3})\s+(?:минут?|мин\.?|min)\s*$/i;

const MEASUREMENT_PATTERNS: Array<{ field: MeasurementField; re: RegExp }> = [
  { field: 'chest', re: /^(?:грудь|chest)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'waist', re: /^(?:талия|waist)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'hips', re: /^(?:бедра|hips)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'bicep', re: /^(?:бицепс|плечо|bicep)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'thigh', re: /^(?:бедро|thigh)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'calf', re: /^(?:икра|calf)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
  { field: 'neck', re: /^(?:шея|neck)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:см|cm)?\s*$/i },
];

const MEAL_KCAL_TYPED_RE = /^(завтрак|обед|ужин|перекус)\s+(\d{2,4})\s*(?:ккал|kcal)?\s*$/i;
const MEAL_KCAL_PLUS_RE = /^\+\s*(\d{2,4})\s*ккал\s*$/i;
const RESET_WATER_RE = /^(?:обнули?\s+воду|сброс(?:ь)?\s+воду|reset\s+water)\s*$/i;
const REMOVE_LAST_MEAL_RE = /^(?:удали\s+последний\s+приём|убери\s+приём|минус\s+приём|remove\s+last\s+meal)\s*$/i;
const SLEEP_HM_RE = /^(?:спал[аи]?|sleep|slept)\s+(\d{1,2})\s+(\d{1,2})\s*$/i;
const SLEEP_DECIMAL_RE = /^(?:спал[аи]?|sleep|slept)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:ч|h|часов?|hours?)?\s*$/i;

/**
 * Sleep with normalized duration: after preprocessing, "спал полчаса"
 * becomes "спал 30 мин", "спал полтора часа" becomes "спал 90 мин".
 * This regex picks up the "мин" suffix.
 */
const SLEEP_MIN_RE = /^(?:спал[аи]?|sleep|slept)\s+(\d{1,3})\s+(?:мин\.?|минут?)\s*$/i;

const THEME_DARK_RE = /^(?:тёмная\s+тема|тёмный\s+режим|dark\s+(?:theme|mode))\s*$/i;
const THEME_LIGHT_RE = /^(?:светлая\s+тема|светлый\s+режим|light\s+(?:theme|mode))\s*$/i;
const THEME_AUTO_RE = /^(?:авто\s+тема|auto\s+theme|системная\s+тема)\s*$/i;
const NOTIF_ON_RE = /^(?:уведомления\s+вкл(?:ючить)?|notifications?\s+on|вкл\s+уведомления)\s*$/i;
const NOTIF_OFF_RE = /^(?:уведомления\s+выкл(?:ючить)?|notifications?\s+off|выкл\s+уведомления)\s*$/i;
const WATER_REM_ON_RE = /^(?:напоминани[ея]\s+вод[ыу]?\s+вкл(?:ючить)?|water\s+reminders?\s+on)\s*$/i;
const WATER_REM_OFF_RE = /^(?:напоминани[ея]\s+вод[ыу]?\s+выкл(?:ючить)?|water\s+reminders?\s+off)\s*$/i;
const REST_TODAY_RE = /^(?:сегодня\s+отдых|выходной\s+сегодня|отдыхаю\s+сегодня|rest\s+day\s+today)\s*$/i;

/**
 * Stats queries — heavily expanded for natural phrasing. Covers:
 *   "как у меня вода", "как с водой", "вода?", "сколько воды"
 *   "как я ем", "сколько калорий", "как с едой"
 *   "мой прогресс", "как тренировки", "как дела с тренировками"
 *   "последняя тренировка", "что я делал в последний раз"
 */
const STATS_WATER_RE = /^(?:сколько\s+вод[ыу]|вода\??|как\s+(?:у\s+меня\s+)?(?:с\s+)?вод(?:а|ой)\??|как\s+вода\??)\s*$/i;
const STATS_MEAL_RE = /^(?:сколько\s+(?:калорий|съел[аи]?)|калорий\??|сколько\s+я\s+съел[аи]?|как\s+(?:я\s+)?ем(?:\?|\s+сегодня\??)?|как\s+(?:у\s+меня\s+)?(?:с\s+)?ед(?:а|ой)\??)\s*$/i;
const STATS_PROGRESS_RE = /^(?:мой\s+прогресс|прогресс|статистика|stats|my\s+stats|как\s+тренировки\??|как\s+дела\s+с\s+тренировк(?:ами|ой)\??)\s*$/i;
const STATS_LAST_WORKOUT_RE = /^(?:последняя\s+тренировка|last\s+workout|что\s+я\s+делал\s+в\s+последний\s+раз\??|какая\s+была\s+последняя\??)\s*$/i;

/**
 * Activate program — natural verbs added: "включи программу", "ставь
 * программу", "запусти программу".
 */
const ACTIVATE_PROGRAM_RE = /^(?:активир(?:овать|уй)\s+программу|сменить\s+программу\s+на|включи\s+программу|поставь\s+программу|запусти\s+программу)\s+(.+)$/i;

/**
 * Body weight — broad. Natural variants for morning-scale workflow:
 *   вешу 78.2
 *   вес тела 80
 *   утром весил 78 (or "утром весила")
 *   весы показали 78.5
 *   вес сегодня 78
 *   взвесился на 78
 */
const BODY_WEIGHT_RE = /^(?:вешу|вес\s+тела|body\s+weight|утром\s+весил[аи]?|весы\s+показал[аи]?|вес\s+сегодня|вес\s+утром|взвесил(?:ся|ась)\s+на)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:кг|kg|кило)?\s*$/i;

const SWAP_EXERCISE_RE = /^(?:замени|свапни|поменяй|swap)\s+(.+?)\s+(?:на|to|for)\s+(.+)$/i;

const ADD_RECIPE_RE = /^(?:съел[аи]?|съедал[аи]?|поел[аи]?|поужинал[аи]?|пообедал[аи]?|позавтракал[аи]?|добавь\s+рецепт|\+\s*рецепт)\s+(.+)$/i;

// ─── Parser ─────────────────────────────────────────────────────────────────

export function parseChatCommand(rawText: string): ParsedCommand | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  // NL preprocessing — convert volume / duration words to digit forms.
  const text = normalizeNumberWords(trimmed);

  // ── Phase A core ─────────────────────────────────────────────────────────

  const water = text.match(WATER_RE);
  if (water) {
    const ml = parseInt(water[1], 10);
    if (Number.isFinite(ml) && ml >= 50 && ml <= 5000) return { type: 'add_water', ml };
  }

  const addSet = text.match(ADD_SET_RE);
  if (addSet) {
    const weight = parseFloat(addSet[1].replace(',', '.'));
    const reps = parseInt(addSet[2], 10);
    if (weight >= 0 && weight <= 500 && reps >= 1 && reps <= 100) {
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

  // ── Phase F: name-resolved actions before set_weight (ordering matters) ──

  const bodyWeight = text.match(BODY_WEIGHT_RE);
  if (bodyWeight) {
    const kg = parseFloat(bodyWeight[1].replace(',', '.'));
    if (Number.isFinite(kg) && kg >= 30 && kg <= 300) return { type: 'log_body_weight', kg };
  }

  const swap = text.match(SWAP_EXERCISE_RE);
  if (swap) {
    const fromName = swap[1].trim();
    const toName = swap[2].trim();
    if (fromName.length >= 2 && toName.length >= 2) {
      return { type: 'swap_exercise', fromName, toName };
    }
  }

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
    if (reps >= 1 && reps <= 100) return { type: 'set_reps', reps };
  }

  const restTimer = text.match(REST_TIMER_RE);
  if (restTimer) {
    const seconds = parseInt(restTimer[1], 10);
    if (seconds >= 5 && seconds <= 600) return { type: 'set_rest_timer', seconds };
  }

  // ── Phase D: nutrition targets ───────────────────────────────────────────

  const calTarget = text.match(CAL_TARGET_RE);
  if (calTarget) {
    const kcal = parseInt(calTarget[1], 10);
    if (kcal >= 800 && kcal <= 8000) return { type: 'set_calories_target', kcal };
  }

  const waterTarget = text.match(WATER_TARGET_RE);
  if (waterTarget) {
    const ml = parseInt(waterTarget[1], 10);
    if (ml >= 500 && ml <= 8000) return { type: 'set_water_target', ml };
  }

  // ── Phase D: cardio (distance forms first, then duration forms) ──────────

  const run = text.match(RUN_RE);
  if (run) {
    const km = parseFloat(run[1].replace(',', '.'));
    if (km > 0 && km <= 100) return { type: 'log_cardio', kind: 'run', km };
  }

  const walk = text.match(WALK_RE);
  if (walk) {
    const km = parseFloat(walk[1].replace(',', '.'));
    if (km > 0 && km <= 100) return { type: 'log_cardio', kind: 'walk', km };
  }

  const runDur = text.match(RUN_DURATION_RE);
  if (runDur) {
    const minutes = parseInt(runDur[1], 10);
    if (minutes >= 1 && minutes <= 600) return { type: 'log_cardio', kind: 'run', minutes };
  }

  const walkDur = text.match(WALK_DURATION_RE);
  if (walkDur) {
    const minutes = parseInt(walkDur[1], 10);
    if (minutes >= 1 && minutes <= 600) return { type: 'log_cardio', kind: 'walk', minutes };
  }

  const cardioMin = text.match(CARDIO_MIN_RE);
  if (cardioMin) {
    const minutes = parseInt(cardioMin[1], 10);
    if (minutes >= 1 && minutes <= 600) return { type: 'log_cardio', kind: 'cardio', minutes };
  }

  // ── Phase D: measurements ────────────────────────────────────────────────

  for (const { field, re } of MEASUREMENT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const cm = parseFloat(m[1].replace(',', '.'));
      if (cm >= 10 && cm <= 250) return { type: 'log_measurement', field, cm };
    }
  }

  // ── Phase E: meal kcal ───────────────────────────────────────────────────

  const mealTyped = text.match(MEAL_KCAL_TYPED_RE);
  if (mealTyped) {
    const mealType = mealTypeFromRus(mealTyped[1].toLowerCase());
    const kcal = parseInt(mealTyped[2], 10);
    if (mealType && kcal >= 10 && kcal <= 5000) {
      return { type: 'log_meal_kcal', mealType, kcal };
    }
  }

  const mealPlus = text.match(MEAL_KCAL_PLUS_RE);
  if (mealPlus) {
    const kcal = parseInt(mealPlus[1], 10);
    if (kcal >= 10 && kcal <= 5000) return { type: 'log_meal_kcal', mealType: 'snack', kcal };
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

  const sleepMin = text.match(SLEEP_MIN_RE);
  if (sleepMin) {
    // After normalizeNumberWords, "спал час" becomes "спал 60 мин".
    const total = parseInt(sleepMin[1], 10);
    if (total > 0 && total <= 16 * 60) {
      return { type: 'log_sleep', hours: Math.floor(total / 60), minutes: total % 60 };
    }
  }

  const sleepDec = text.match(SLEEP_DECIMAL_RE);
  if (sleepDec) {
    const decimal = parseFloat(sleepDec[1].replace(',', '.'));
    if (decimal > 0 && decimal <= 16) {
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

  // ── Phase E: stats ───────────────────────────────────────────────────────

  if (STATS_WATER_RE.test(text)) return { type: 'stats_water' };
  if (STATS_MEAL_RE.test(text)) return { type: 'stats_meal' };
  if (STATS_PROGRESS_RE.test(text)) return { type: 'stats_progress' };
  if (STATS_LAST_WORKOUT_RE.test(text)) return { type: 'stats_last_workout' };

  // ── Phase F: name-resolved actions (wide capture; placed last) ───────────

  const activate = text.match(ACTIVATE_PROGRAM_RE);
  if (activate) {
    const name = activate[1].trim();
    if (name.length >= 2) return { type: 'activate_program', name };
  }

  const recipe = text.match(ADD_RECIPE_RE);
  if (recipe) {
    const name = recipe[1].trim();
    if (name.length >= 2) return { type: 'add_recipe', name };
  }

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
