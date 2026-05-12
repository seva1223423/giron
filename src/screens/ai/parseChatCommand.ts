/**
 * AI-chat local command parser with natural-language preprocessing,
 * Russian morphology helpers, and composite command support.
 *
 * Pure function module — no React, no stores, no side effects.
 *
 * Two public entry points:
 *   parseChatCommands(text) → ParsedCommand[] | null
 *     Returns ONE OR MORE recognized commands. Handles composite phrases
 *     joined by " и " / ", " / " потом " / " после " — each chunk is
 *     parsed independently. If at least one chunk parses, returns the
 *     non-null subset; if zero match, returns null.
 *
 *   parseChatCommand(text) → ParsedCommand | null
 *     Backward-compatible single-command wrapper. Returns the first
 *     parsed command or null. Callers that want composite behavior
 *     should use parseChatCommands.
 *
 * Pipeline:
 *   raw text → normalize digits/words → split (for composite) → match
 *
 * Also exports:
 *   normalizeRu(text)    — lowercase + ё→е + trim, for case-insensitive
 *                          string equality / substring matching
 *   stemRussian(word)    — drops common Russian endings (rough stemmer)
 *                          for fuzzy name resolution in handlers
 *   approxMatch(a, b)    — name-resolution helper using stem-overlap
 *
 * Goal: cover ~80% of natural Russian phrasings without a full NLU.
 * What the parser misses falls through to server-side AI tools, which
 * understand free-form language (slower, costs AI quota).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ParsedCommand =
  | { type: 'add_water'; ml: number }
  | { type: 'add_set'; weight: number; reps: number }
  | { type: 'complete_set' }
  | { type: 'adjust_weight'; delta: number }
  | { type: 'next_exercise' }
  | { type: 'repeat_last' }
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
  | { type: 'stats_sleep' }
  | { type: 'stats_cardio' }
  | { type: 'stats_measurements' }
  | { type: 'stats_body_weight' }
  | { type: 'activate_program'; name: string }
  | { type: 'log_body_weight'; kg: number }
  | { type: 'swap_exercise'; fromName: string; toName: string }
  | { type: 'add_recipe'; name: string };

export type MeasurementField = 'chest' | 'waist' | 'hips' | 'bicep' | 'thigh' | 'calf' | 'neck';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// ─── Russian morphology utilities (exported) ───────────────────────────────

/**
 * lowercase + ё→е + trim. Use this on both sides of any case-insensitive
 * Russian comparison — without it, "Ёжик" and "ёжик" or "ежик" diverge.
 */
export function normalizeRu(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, 'е');
}

/**
 * Very rough Russian stemmer — drops common inflection endings. Doesn't
 * use a morphology DB; just strips the longest matching tail. Good enough
 * for "курица" / "куриная" / "куриный" / "куриного" to land near the
 * same stem ("кури-"), which is what we need for substring/overlap
 * matching against the recipe / exercise / program library.
 *
 * Limits: keeps words ≥4 chars after stemming to avoid stripping short
 * words to nothing. Doesn't normalize prefixes (всё-/пере-/etc.).
 *
 * @example
 *   stemRussian('курица')   → 'кури'
 *   stemRussian('куриная')  → 'кури'
 *   stemRussian('куриного') → 'кури'
 *   stemRussian('грудкой')  → 'грудк'
 */
export function stemRussian(word: string): string {
  const w = normalizeRu(word);
  if (w.length < 4) return w;
  // Order matters: longest endings first so compound case endings ("иная",
  // "иного") beat their shorter component pieces. Diminutive / agentive
  // suffixes ("ица", "ица") are listed at 3-char tier so курица / куриная
  // / куриного all collapse to the same "кур"-ish stem.
  // Build a single endings list and pre-sort by length DESC so the
  // longest match wins. (Mixing 4-char "иная" with 5-char "иными"
  // in declaration order risks the 4-char being checked first, losing
  // matches like "куриного" → "иного" → "кур" to "ого" → "курин".)
  const endings = [
    // Compound case (adj nominative / genitive) — chosen to align
    // diminutive noun "курица" with adj "куриная" / "куриного" so they
    // all collapse to the same stem.
    'иными', 'иного', 'иному',
    'ового', 'овые', 'овой',
    'иная', 'иной', 'иную', 'иные', 'иных', 'иным',
    'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
    'ица', 'ицы', 'ицу', 'ице',
    'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ой', 'ей', 'ый', 'ий',
    'ам', 'ям', 'ах', 'ях', 'ом', 'ем',
    'ов', 'ев', 'ин',
    'ть', 'ся', 'сь',
    'у', 'ю', 'ы', 'и', 'а', 'я', 'о', 'е', 'ь', 'й',
  ].sort((a, b) => b.length - a.length);
  for (const e of endings) {
    if (w.length - e.length >= 3 && w.endsWith(e)) return w.slice(0, -e.length);
  }
  return w;
}

/**
 * Compare two names with stem-overlap tolerance. Splits each into tokens,
 * stems them, and checks whether the query's stems are all contained in
 * the target's stems. Lets users say "курица с рисом" and hit "Куриная
 * грудка с рисом" because курица→кури matches куриная→кури.
 *
 * @returns true if every stemmed query-token is found among the target's
 *          stemmed tokens (subset matching, ignoring extras in target).
 */
export function approxMatch(query: string, target: string): boolean {
  const qTokens = normalizeRu(query).split(/\s+/).filter((t) => t.length >= 3).map(stemRussian);
  const tTokens = normalizeRu(target).split(/\s+/).map(stemRussian);
  if (qTokens.length === 0) return false;
  return qTokens.every((qt) => tTokens.some((tt) => tt.includes(qt) || qt.includes(tt)));
}

// ─── NL number / volume / duration / numeral word normalization ─────────────

// JS \b is ASCII-only and silently fails for Cyrillic. Use whitespace +
// punctuation boundaries via lookbehind/lookahead.
const WB_START = '(?<=^|\\s)';
const WB_END = '(?=\\s|$|[.,!?:;])';

/**
 * Russian numeral words for 1-100. We need these so phrases like
 * "выпил двести пятьдесят мл" or "вешу семьдесят восемь" work.
 *
 * Compound numerals (двести пятьдесят) are handled by the replacement
 * loop running on the longest forms first; remaining components are
 * then merged additively post-substitution if they sit adjacent.
 */
const NUMERAL_WORDS: Record<string, number> = {
  // 1-10
  'ноль': 0, 'один': 1, 'одна': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4,
  'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
  // 11-19
  'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14,
  'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18,
  'девятнадцать': 19,
  // 20-90
  'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
  'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90,
  // 100s
  'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400, 'пятьсот': 500,
  'шестьсот': 600, 'семьсот': 700, 'восемьсот': 800, 'девятьсот': 900,
  // 1000
  'тысяча': 1000, 'тысячу': 1000,
};

function buildNumeralRegex(): RegExp {
  // Match longest words first (e.g. "восемнадцать" before "восемь").
  const sorted = Object.keys(NUMERAL_WORDS).sort((a, b) => b.length - a.length);
  return new RegExp(`${WB_START}(${sorted.join('|')})${WB_END}`, 'gi');
}

const NUMERAL_RE = buildNumeralRegex();

/**
 * Replace numeral words with digits AND fold adjacent "сотен + десятки +
 * единицы" sequences into a single number (e.g. "двести пятьдесят" → 250).
 */
function normalizeNumerals(text: string): string {
  // First pass: words → digits.
  const replaced = text.replace(NUMERAL_RE, (m) => String(NUMERAL_WORDS[normalizeRu(m)] ?? m));
  // Second pass: merge adjacent number tokens (additive).
  // "200 50" → 250, "70 8" → 78. Caps at 3 adjacent components.
  // Conservative limits: only fold if all components <100, OR first is
  // a multiple of 100 followed by <100 components (Russian numeral structure).
  return replaced.replace(/(\d+)\s+(\d+)(?:\s+(\d+))?/g, (full, a, b, c) => {
    const ai = parseInt(a, 10);
    const bi = parseInt(b, 10);
    const ci = c ? parseInt(c, 10) : null;
    // Only fold if the structure looks like a numeral decomposition:
    //   200 + 50 (hundreds + tens), or 200 + 50 + 8 (hundreds+tens+units),
    //   or 70 + 8 (tens + units).
    const isHundredsTens = ai >= 100 && ai % 100 === 0 && bi < 100;
    const isTensUnits = ai >= 20 && ai < 100 && ai % 10 === 0 && bi < 10;
    if (ci != null) {
      if (isHundredsTens && bi >= 20 && bi < 100 && bi % 10 === 0 && ci < 10) {
        return String(ai + bi + ci);
      }
      return full; // don't fold
    }
    if (isHundredsTens || isTensUnits) {
      return String(ai + bi);
    }
    return full;
  });
}

// ─── NL volume / duration WORD normalization ───────────────────────────────

type Replacement = string | ((match: string, ...groups: string[]) => string);
const WORD_REPLACEMENTS: Array<[RegExp, Replacement]> = [
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
  [new RegExp(`${WB_START}стакан(?:а|чик|чика|чики)?${WB_END}`, 'gi'), '250 мл'],
  [new RegExp(`${WB_START}бутыл(?:к[аиу]|очк[аиу])${WB_END}`, 'gi'), '500 мл'],
  [new RegExp(`${WB_START}кружк[аиу]${WB_END}`, 'gi'), '300 мл'],
  [new RegExp(`${WB_START}литр(?:а)?${WB_END}`, 'gi'), '1000 мл'],

  // Quick-add shortcuts.
  // "1.5к" / "1к" → 1500 / 1000 — common chat shorthand for kilo.
  [
    new RegExp(`${WB_START}(\\d+(?:[.,]\\d{1,2})?)к${WB_END}`, 'gi'),
    (_m: string, n: string) =>
      String(Math.round(parseFloat(n.replace(',', '.')) * 1000)),
  ],
];

function normalizeWords(text: string): string {
  let out = text;
  for (const [re, replacement] of WORD_REPLACEMENTS) {
    if (typeof replacement === 'string') {
      out = out.replace(re, replacement);
    } else {
      // TS narrows `replacement` to the function variant of `Replacement`,
      // which is compatible with String.replace's function overload.
      out = out.replace(re, replacement);
    }
  }
  return out;
}

function normalize(text: string): string {
  // Do NOT lowercase or ё→е here — many regex patterns rely on the case
  // (case-insensitive via /i flag) and the ё-specific spelling
  // (тёмная, прошёл, etc.). The ё→е normalization is purely a
  // utility for the exported `normalizeRu` / `stemRussian` helpers.
  return normalizeNumerals(normalizeWords(text.trim()));
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const WATER_RE = /^(?:\+\s*|выпил[аи]?\s+|выпива(?:л[аи]?|ю)\s+|выдул[аи]?\s+|закинул[аи]?\s+|глотнул[аи]?\s+|хлебнул[аи]?\s+|попил[аи]?\s+|осилил[аи]?\s+|добав(?:ил?|ь)\s+|налил[аи]?\s+|налей\s+|вода\s+|употребил[аи]?\s+)(\d{1,4})\s*(?:мл(?:\s+воды)?|воды|мл)?\s*$/i;
const ADD_SET_RE = /^(?:\+\s*подход|добавь?\s+подход|подход|сделал[аи]?\s+подход|качнул[аи]?\s+подход)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:[×x×*]|на)\s*(\d{1,3})\s*$/i;
const COMPLETE_RE = /^(?:засчитай(?:\s+подход)?|выполнил[аи]?(?:\s+подход)?|сделал[аи]?(?:\s+подход)?|закрыл[аи]?\s+подход|врубил[аи]?\s+подход|сделано|готово|done|\+\s*1|✓|✅|👍)\s*$/i;
const HEAVIER_RE = /^(?:сделай\s+тяжелее|тяжелее|потяжелее|\+\s*5\s*кг|harder|накин[ьу](?:ть)?\s+5(?:\s*кг)?|прибавь\s+5(?:\s*кг)?|добавь\s+5\s*кг|наварь\s+5(?:\s*кг)?)\s*$/i;
const LIGHTER_RE = /^(?:сделай\s+легче|легче|полегче|-\s*5\s*кг|easier|убавь\s+5(?:\s*кг)?|сними\s+5(?:\s*кг)?|убери\s+5\s*кг|сбавь\s+5(?:\s*кг)?)\s*$/i;
const NEXT_RE = /^(?:следующ\S*\s+упражн\S*|next(?:\s+exercise)?|след\.?\s+упр\.?|дальше|поехали\s+дальше|давай\s+дальше)\s*$/i;
const PREV_RE = /^(?:предыдущ\S*\s+упражн\S*|prev(?:ious)?(?:\s+exercise)?|назад|пред\.?\s+упр\.?|вернись|вернуться|откати)\s*$/i;
const REPEAT_LAST_RE = /^(?:повтор(?:и|ить)?\s+(?:последний|ещё\s+раз)|повтори|ещё\s+один\s+такой(?:\s+же)?|давай\s+ещё\s+(?:один\s+)?такой\s+же?|repeat\s+last)\s*$/i;
const REMOVE_SET_RE = /^(?:убери\s+подход|удали\s+(?:последний\s+)?подход|минус\s+подход|откати\s+подход|сними\s+подход|remove\s+(?:last\s+)?set|undo\s+set)\s*$/i;
const FINISH_RE = /^(?:закончить\s+тренировку|финиш|готово\s+тренировка|всё(?:\s+на\s+сегодня)?|закончил[аи]?\s+тренировку|устал[аи]?(?:\s+всё)?|сворачиваюсь|finish\s+workout)\s*$/i;
const CANCEL_RE = /^(?:отмени(?:ть)?\s+тренировку|cancel\s+workout|сбрось\s+тренировку|выкинь\s+тренировку)\s*$/i;
const SET_WEIGHT_RE = /^(?:вес|weight|поставь\s+вес|сделай\s+вес)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:кг|kg)?\s*$/i;
const SET_REPS_RE = /^(?:(?:повтор(?:ов|ы)|reps|поставь\s+повторов)\s+(\d{1,3})(?:\s+раз[а]?)?|(\d{1,3})\s+(?:повтор(?:ов|а|ений|ение)|раз[а]?))\s*$/i;
const REST_TIMER_RE = /^(?:отдых|пауза|rest|таймер\s+отдыха)\s+(\d{1,3})\s*(?:сек|сек\.|s)?\s*$/i;
const CAL_TARGET_RE = /^(?:цель\s+калорий|target\s+calories|поставь\s+цель\s+калорий)\s+(\d{3,5})\s*(?:ккал|kcal)?\s*$/i;
const WATER_TARGET_RE = /^(?:цель\s+воды|water\s+target|поставь\s+цель\s+воды)\s+(\d{3,5})\s*(?:мл|ml)?\s*$/i;
const RUN_RE = /^(?:пробежал[аи]?|бежал[аи]?|бегал[аи]?|пробежка|run)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
const WALK_RE = /^(?:прошёл|прошла|прошли|пешком|погулял[аи]?|гулял[аи]?|walked|walk)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:км|km)\s*$/i;
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
const SLEEP_MIN_RE = /^(?:спал[аи]?|sleep|slept)\s+(\d{1,3})\s+(?:мин\.?|минут?)\s*$/i;

const THEME_DARK_RE = /^(?:тёмная\s+тема|тёмный\s+режим|dark\s+(?:theme|mode))\s*$/i;
const THEME_LIGHT_RE = /^(?:светлая\s+тема|светлый\s+режим|light\s+(?:theme|mode))\s*$/i;
const THEME_AUTO_RE = /^(?:авто\s+тема|auto\s+theme|системная\s+тема)\s*$/i;
const NOTIF_ON_RE = /^(?:уведомления\s+вкл(?:ючить)?|notifications?\s+on|вкл\s+уведомления)\s*$/i;
const NOTIF_OFF_RE = /^(?:уведомления\s+выкл(?:ючить)?|notifications?\s+off|выкл\s+уведомления)\s*$/i;
const WATER_REM_ON_RE = /^(?:напоминани[ея]\s+вод[ыу]?\s+вкл(?:ючить)?|water\s+reminders?\s+on)\s*$/i;
const WATER_REM_OFF_RE = /^(?:напоминани[ея]\s+вод[ыу]?\s+выкл(?:ючить)?|water\s+reminders?\s+off)\s*$/i;
const REST_TODAY_RE = /^(?:сегодня\s+отдых|выходной\s+сегодня|отдыхаю\s+сегодня|rest\s+day\s+today)\s*$/i;

// Stats — phase E + new phase G additions (sleep / cardio / measurements / weight)
const STATS_WATER_RE = /^(?:сколько\s+вод[ыу]|вода\??|как\s+(?:у\s+меня\s+)?(?:с\s+)?вод(?:а|ой)\??|как\s+вода\??)\s*$/i;
const STATS_MEAL_RE = /^(?:сколько\s+(?:калорий|съел[аи]?)|калорий\??|сколько\s+я\s+съел[аи]?|как\s+(?:я\s+)?ем(?:\?|\s+сегодня\??)?|как\s+(?:у\s+меня\s+)?(?:с\s+)?ед(?:а|ой)\??)\s*$/i;
const STATS_PROGRESS_RE = /^(?:мой\s+прогресс|прогресс|статистика|stats|my\s+stats|как\s+тренировки\??|как\s+дела\s+с\s+тренировк(?:ами|ой)\??)\s*$/i;
const STATS_LAST_WORKOUT_RE = /^(?:последняя\s+тренировка|last\s+workout|что\s+я\s+делал\s+в\s+последний\s+раз\??|какая\s+была\s+последняя\??)\s*$/i;
const STATS_SLEEP_RE = /^(?:как\s+сон\??|сколько\s+спал[аи]?\??|мой\s+сон\??|sleep\s+stats?)\s*$/i;
const STATS_CARDIO_RE = /^(?:как\s+кардио\??|сколько\s+пробежал[аи]?\??|мои\s+кардио\??|cardio\s+stats?)\s*$/i;
const STATS_MEASUREMENTS_RE = /^(?:мои\s+замеры|замеры\??|какие\s+у\s+меня\s+замеры\??|body\s+measurements?)\s*$/i;
const STATS_BODY_WEIGHT_RE = /^(?:мой\s+вес\??|сколько\s+я\s+вешу\??|какой\s+у\s+меня\s+вес\??|сколько\s+я\s+сейчас\s+вешу\??)\s*$/i;

const ACTIVATE_PROGRAM_RE = /^(?:активир(?:овать|уй)\s+программу|сменить\s+программу\s+на|включи\s+программу|поставь\s+программу|запусти\s+программу|давай\s+программу)\s+(.+)$/i;
const BODY_WEIGHT_RE = /^(?:вешу|вес\s+тела|body\s+weight|утром\s+весил[аи]?|весы\s+показал[аи]?|вес\s+сегодня|вес\s+утром|взвесил(?:ся|ась)\s+на)\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:кг|kg|кило)?\s*$/i;
const SWAP_EXERCISE_RE = /^(?:замени|свапни|поменяй|swap)\s+(.+?)\s+(?:на|to|for)\s+(.+)$/i;
const ADD_RECIPE_RE = /^(?:съел[аи]?|съедал[аи]?|поел[аи]?|поужинал[аи]?|пообедал[аи]?|позавтракал[аи]?|перекусил[аи]?|добавь\s+рецепт|\+\s*рецепт)\s+(.+)$/i;

// ─── Single-command matcher ────────────────────────────────────────────────

function matchOne(text: string): ParsedCommand | null {
  // Water (most common; check first).
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

  // Body weight + swap BEFORE set_weight (regex ordering).
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

  for (const { field, re } of MEASUREMENT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const cm = parseFloat(m[1].replace(',', '.'));
      if (cm >= 10 && cm <= 250) return { type: 'log_measurement', field, cm };
    }
  }

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

  if (THEME_DARK_RE.test(text)) return { type: 'set_theme', mode: 'dark' };
  if (THEME_LIGHT_RE.test(text)) return { type: 'set_theme', mode: 'light' };
  if (THEME_AUTO_RE.test(text)) return { type: 'set_theme', mode: 'auto' };
  if (NOTIF_ON_RE.test(text)) return { type: 'toggle_notifications', enabled: true };
  if (NOTIF_OFF_RE.test(text)) return { type: 'toggle_notifications', enabled: false };
  if (WATER_REM_ON_RE.test(text)) return { type: 'toggle_water_reminders', enabled: true };
  if (WATER_REM_OFF_RE.test(text)) return { type: 'toggle_water_reminders', enabled: false };
  if (REST_TODAY_RE.test(text)) return { type: 'schedule_rest_today' };

  if (STATS_WATER_RE.test(text)) return { type: 'stats_water' };
  if (STATS_MEAL_RE.test(text)) return { type: 'stats_meal' };
  if (STATS_PROGRESS_RE.test(text)) return { type: 'stats_progress' };
  if (STATS_LAST_WORKOUT_RE.test(text)) return { type: 'stats_last_workout' };
  if (STATS_SLEEP_RE.test(text)) return { type: 'stats_sleep' };
  if (STATS_CARDIO_RE.test(text)) return { type: 'stats_cardio' };
  if (STATS_MEASUREMENTS_RE.test(text)) return { type: 'stats_measurements' };
  if (STATS_BODY_WEIGHT_RE.test(text)) return { type: 'stats_body_weight' };

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

// ─── Composite splitter ────────────────────────────────────────────────────

/**
 * Split a phrase into chunks for composite-command parsing. Separators:
 *   " и " / ", " / "; " / " потом " / " после чего " / " затем "
 * Each chunk is then trimmed and parsed independently.
 *
 * Caveat: doesn't try to be clever about " и " inside a single phrase
 * (e.g. "лёг в 11 и встал в 7"). The parser sees both chunks separately;
 * if either chunk doesn't match a command, it's dropped silently and the
 * caller still gets the others. False-negative cost > false-positive
 * cost for a chat parser.
 */
function splitComposite(text: string): string[] {
  // Split on " и " / ", " / "; " / " потом " / " затем " / " после ".
  // Use lookbehind to avoid splitting inside numbers (e.g. "100, 80, 60"
  // is a number list, not a composite — guard by requiring a Cyrillic /
  // Latin letter following the separator).
  return text
    .split(/(?:\s+и\s+|\s*,\s+(?=[А-Яа-яA-Za-z])|\s*;\s+|\s+потом\s+|\s+затем\s+|\s+после\s+)/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse text into ONE OR MORE commands. Returns the non-null subset, or
 * `null` if zero chunks parsed.
 *
 * For composite phrases like "выпил стакан и пробежал 5 км", returns
 * `[add_water, log_cardio]`. The caller (handler) iterates and executes
 * each in order.
 */
export function parseChatCommands(rawText: string): ParsedCommand[] | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  const normalized = normalize(trimmed);

  // Try the whole thing first — some commands legitimately contain " и "
  // in their captured names (e.g. "активировать программу Сила и масса").
  const whole = matchOne(normalized);
  if (whole) return [whole];

  // Composite: split and parse each chunk independently.
  const chunks = splitComposite(normalized);
  if (chunks.length <= 1) return null;
  const cmds = chunks
    .map((c) => matchOne(c))
    .filter((c): c is ParsedCommand => c !== null);
  return cmds.length > 0 ? cmds : null;
}

/**
 * Backward-compatible single-command parser. Returns the first parsed
 * command or null. Use parseChatCommands for composite support.
 */
export function parseChatCommand(rawText: string): ParsedCommand | null {
  const list = parseChatCommands(rawText);
  return list && list[0] ? list[0] : null;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function mealTypeFromRus(rus: string): MealType | null {
  switch (rus) {
    case 'завтрак': return 'breakfast';
    case 'обед': return 'lunch';
    case 'ужин': return 'dinner';
    case 'перекус': return 'snack';
    default: return null;
  }
}
