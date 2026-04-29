/**
 * AI memory extraction (Round 86 — moved out of routes/ai.ts so it can
 * be unit-tested in isolation).
 *
 * Walks the user's free-text message through a set of regex patterns and
 * yields {category, key, value} memory candidates that aiMemoryService
 * upserts. The patterns are intentionally narrow: high precision over
 * recall, because false positives ("I'm allergic to anything that fails")
 * would silently corrupt the AI's persistent picture of the user.
 *
 * When extending: add a new pattern, then a corresponding test in
 * __tests__/memoryExtractor.test.ts. Keep extract() functions cheap —
 * they run on every /ai/chat hit.
 */

export interface MemoryExtraction {
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: 'stated' | 'inferred';
}

interface MemoryPattern {
  regex: RegExp;
  category: string;
  key: string;
  /** When true, all matches in the message are captured (use with patterns
   *  that may appear multiple times — e.g. multiple allergies). */
  multiMatch?: boolean;
  /** When provided, generates a unique key per match (enables storing
   *  multiple values for the same concept — e.g. one row per allergy). */
  keyFn?: (match: RegExpMatchArray) => string;
  extract: (match: RegExpMatchArray) => string;
}

export const MEMORY_PATTERNS: MemoryPattern[] = [
  // ── Training schedule ─────────────────────────────────────────────────────
  { regex: /тренируюсь?\s*(\d)\s*(раз|дн)/i, category: 'schedule', key: 'training_frequency', extract: (m) => `${m[1]} раз в неделю` },
  { regex: /по\s*(понедельник|вторник|сред|четверг|пятниц|суббот|воскресень)/gi, category: 'schedule', key: 'training_days', multiMatch: true, keyFn: (m) => `training_day_${m[1].toLowerCase().slice(0, 6)}`, extract: (m) => m[0] },

  // ── Equipment ─────────────────────────────────────────────────────────────
  { regex: /(?:занимаюсь|тренируюсь)\s*(дома|в зале|на улице)/i, category: 'preference', key: 'training_location', extract: (m) => m[1] },
  { regex: /(?:у меня|есть|имеется)\s*(гантел|штанг|турник|брусья|гир|тренажёр|тренажер|резинк)/gi, category: 'preference', key: 'available_equipment', multiMatch: true, keyFn: (m) => `equipment_${m[1].toLowerCase().slice(0, 8)}`, extract: (m) => m[1] },

  // ── Diet preferences ──────────────────────────────────────────────────────
  { regex: /(?:я\s+)?(вегетарианец|веган|не ем мясо|не ем рыб|не пью молок|без глютен|безлактозн)/i, category: 'allergy', key: 'diet_restriction', extract: (m) => m[1] },
  { regex: /(?:аллерги[яю]|непереносимость)\s+(?:на\s+)?([\wа-яА-Я]+)/gi, category: 'allergy', key: 'food_allergy', multiMatch: true, keyFn: (m) => `allergy_${m[1].toLowerCase().slice(0, 12)}`, extract: (m) => m[1] },

  // ── Injuries and limitations ─────────────────────────────────────────────
  { regex: /(?:у меня|имеется|была?)\s*(грыж|протрузи|сколиоз|артрит|артроз)/gi, category: 'injury', key: 'chronic_condition', multiMatch: true, keyFn: (m) => `condition_${m[1].toLowerCase().slice(0, 10)}`, extract: (m) => m[1] },
  { regex: /(?:болит|травмирова|проблемы с)\s*(плеч|колен|поясниц|спин|шей|локт|запясть|голеностоп)/gi, category: 'injury', key: 'pain_area', multiMatch: true, keyFn: (m) => `pain_${m[1].toLowerCase().slice(0, 8)}`, extract: (m) => m[1] },

  // ── Exercise preferences ─────────────────────────────────────────────────
  // Round 86 expansion: previously only 7 favourite / 4 disliked exercises.
  // Added пуш-/отжимания, подтягивания, планка, скакалка, выпады, бёрпи,
  // отжимания на брусьях / отжимания, и общий «качаю / тренирую <часть тела>».
  { regex: /(?:люблю|нравится|предпочитаю)\s*(присед|жим|тяг|кардио|йог|бег|плаван|подтягиван|отжиман|планк|скакалк|выпад|бёрпи|берпи|брусь|пресс)/i, category: 'preference', key: 'favorite_exercise', extract: (m) => m[1] },
  { regex: /(?:не люблю|ненавижу|не хочу делать|избегаю)\s*(кардио|присед|жим|тяг|бег|планк|подтягиван|отжиман|скакалк|выпад|бёрпи|берпи|пресс)/i, category: 'preference', key: 'disliked_exercise', extract: (m) => m[1] },

  // ── Workout timing preference ────────────────────────────────────────────
  { regex: /(?:тренируюсь|хожу в зал|занимаюсь)\s*(утром|вечером|днём|ночью|после работы|до работы)/i, category: 'habit', key: 'workout_time_pref', extract: (m) => m[1] },

  // ── Sleep ─────────────────────────────────────────────────────────────────
  { regex: /(?:сплю|ложусь)\s*(?:в|около)?\s*(\d{1,2})[:\.]?(\d{2})?\s*(?:час|ночи)?/i, category: 'habit', key: 'sleep_time', extract: (m) => `${m[1]}:${m[2] || '00'}` },
  { regex: /(?:встаю|просыпаюсь)\s*(?:в|около)?\s*(\d{1,2})[:\.]?(\d{2})?/i, category: 'habit', key: 'wake_time', extract: (m) => `${m[1]}:${m[2] || '00'}` },
  // Round 86: capture sleep DURATION, not just bedtime. "сплю по 7 часов" and
  // "сплю 8 часов" were both invisible before — extracting them lets the
  // recovery / fatigue blocks tune their ACWR ceiling per user.
  { regex: /сплю?\s*(?:по\s*)?(\d{1,2})\s*час/i, category: 'habit', key: 'sleep_duration_hours', extract: (m) => `${m[1]}` },

  // ── Experience ────────────────────────────────────────────────────────────
  { regex: /(?:занимаюсь|тренируюсь)\s*(?:уже)?\s*(\d+)\s*(лет|год|месяц)/i, category: 'preference', key: 'experience_stated', extract: (m) => `${m[1]} ${m[2]}` },

  // ── Personality / motivation style ───────────────────────────────────────
  { regex: /(?:я\s+)?(интроверт|экстраверт|перфекционист|прокрастинирую|мотивируюсь\s+\w+)/i, category: 'personality', key: 'personality_trait', extract: (m) => m[1] },

  // ── Goals ────────────────────────────────────────────────────────────────
  { regex: /хочу?\s*(похудеть|сбросить вес|сжечь жир|снизить вес)/i, category: 'preference', key: 'user_goal', extract: () => 'похудение' },
  { regex: /хочу?\s*(набрать|накачаться|нарастить мышц|набрать массу)/i, category: 'preference', key: 'user_goal', extract: () => 'набор массы' },
  { regex: /хочу?\s*(стать сильнее|увеличить силу|тренирую силу|силовые?)/i, category: 'preference', key: 'user_goal', extract: () => 'сила' },
  { regex: /хочу?\s*(выносливость|бегаю|улучшить кардио|марафон)/i, category: 'preference', key: 'user_goal', extract: () => 'выносливость' },
  { regex: /хочу?\s*(просто быть в форме|поддерживать форму|общая физподготовка|общее здоровье)/i, category: 'preference', key: 'user_goal', extract: () => 'общая форма' },
  // Round 86: alternative goal phrasings — "моя цель", "стремлюсь", "планирую",
  // "хочется". The previous patterns ALL required the "хочу" prefix and missed
  // perfectly natural Russian alternatives. High-impact because goal is the
  // single fact the AI references most often.
  { regex: /(?:моя\s*цель\s*[—\-:]?\s*|стремлюсь\s*|планирую\s*|хочется\s*)(похудеть|сбросить вес|сжечь жир|снизить вес)/i, category: 'preference', key: 'user_goal', extract: () => 'похудение' },
  { regex: /(?:моя\s*цель\s*[—\-:]?\s*|стремлюсь\s*|планирую\s*|хочется\s*)(набрать|накачаться|нарастить мышц|набрать массу)/i, category: 'preference', key: 'user_goal', extract: () => 'набор массы' },
  { regex: /(?:моя\s*цель\s*[—\-:]?\s*|стремлюсь\s*)(стать сильнее|увеличить силу|развить силу)/i, category: 'preference', key: 'user_goal', extract: () => 'сила' },

  // ── Specific weight target ───────────────────────────────────────────────
  // Round 86: "цель 75 кг" / "хочу весить 80" — concrete number to anchor
  // weight-loss / muscle-gain framing. Stored as kg with no further parsing
  // so a downstream block can compare against current weight.
  { regex: /(?:цель|хочу\s*(?:весить|быть)|мечтаю\s*весить)\s*(\d{2,3})\s*кг/i, category: 'goal', key: 'target_weight_kg', extract: (m) => `${m[1]}` },

  // ── Time budget per session ──────────────────────────────────────────────
  // Round 86: "у меня 40 минут на тренировку", "максимум час", "только полчаса".
  // Useful so the AI doesn't keep suggesting 90-min PPL splits to a parent
  // with 30 min between dropping kids off and starting work.
  { regex: /(?:могу|у меня|есть|максимум|только)\s*(\d{2,3})\s*мин(?:ут)?\s*(?:на\s*)?(?:тренировк|зал)/i, category: 'preference', key: 'session_minutes_max', extract: (m) => `${m[1]}` },
  { regex: /(?:только|максимум|есть)\s*(?:час|60\s*мин)\s*(?:на\s*)?(?:тренировк|зал)/i, category: 'preference', key: 'session_minutes_max', extract: () => '60' },
  { regex: /(?:только|максимум|есть)\s*полчаса\s*(?:на\s*)?(?:тренировк|зал)/i, category: 'preference', key: 'session_minutes_max', extract: () => '30' },

  // ── Stimulants / recovery friction ───────────────────────────────────────
  // Round 86: caffeine and alcohol intake correlate with sleep / recovery.
  // The recovery score block already exists; persisting these lets it adjust
  // its ceiling without re-asking every chat.
  //
  // Round 90: 'none' pattern listed FIRST so it wins on conflicting inputs
  // like "пью много кофе утром, но на ночь не пью" — both old patterns could
  // match, and DB upsert under the same `caffeine_high` key just lets the
  // last write win arbitrarily. Negation is the conservative branch (it
  // means "doesn't drink" — most likely true if any negative phrasing
  // appears) so we yield to it deterministically. The MEMORY_PATTERNS
  // walker is in array order, so first hit on this key sticks via the
  // upsert ordering in saveMemories.
  { regex: /(?:не\s*пью\s*коф|без\s*коф|кофе\s*не\s*пью)/i, category: 'habit', key: 'caffeine_high', extract: () => 'none' },
  { regex: /(?:пью\s*много\s*коф|кофе\s*литрами|зависим\s*от\s*коф)/i, category: 'habit', key: 'caffeine_high', extract: () => 'high' },
  // Match both "пью пиво по выходным" and "по выходным выпиваю пиво" word
  // orders — Russian doesn't pin SVO so either reads naturally.
  { regex: /(?:по\s*выходн\w*\s*(?:выпиваю|пью)|(?:выпиваю|пью)\s*пиво|(?:выпиваю|пью)\s*по\s*выходн|алкоголь\s*по\s*выходн)/i, category: 'habit', key: 'alcohol_pattern', extract: () => 'weekend' },

  // ── Stress signals ───────────────────────────────────────────────────────
  // Round 86: persistent stress/sleep markers — let the AI factor them into
  // recovery recommendations across sessions instead of treating each "много
  // стресса" mention as a fresh discovery.
  { regex: /(?:много\s*стресса|нервная\s*работа|перенапряжение|выгорание)/i, category: 'habit', key: 'stress_high', extract: () => 'high' },
  { regex: /(?:плохо\s*высыпаюсь|мало\s*сплю|недосып)/i, category: 'habit', key: 'sleep_quality_low', extract: () => 'low' },

  // ── Round 91: Diet style ─────────────────────────────────────────────────
  // The diet_restriction pattern above only catches "не ем X" / vegan style
  // facts. Active diet protocols (keto / IF / LCHF / dukan / mediterranean)
  // are different — they're a positive choice the user has made, and they
  // change macro targets and meal timing. Extracting them lets the meal
  // planner block generate compatible suggestions instead of asking again.
  // Single key (diet_style) — switching from keto to IF should overwrite,
  // not stack two contradictory protocols.
  { regex: /(?:соблюдаю|на|сижу\s*на|придерживаюсь|держу)\s*(кето|кетоген|интервальное\s*голодание|интервальн\w+\s*голодан|lchf|низкоуглеводн|дукан|средиземноморск|палео|карнивор)/i, category: 'preference', key: 'diet_style', extract: (m) => m[1].toLowerCase() },
  // "16:8" / "18:6" / "20:4" — IF window notations that often appear without
  // the word "интервальное". Stored verbatim so the AI can echo it back.
  { regex: /(?:голодание|пощусь|ем\s*в\s*окне)\s*(\d{1,2}[:\/]\d{1,2})/i, category: 'preference', key: 'diet_style', extract: (m) => `IF ${m[1].replace('/', ':')}` },

  // ── Round 91: Smoking status ─────────────────────────────────────────────
  // Cardio capacity, recovery rate, and supplement recommendations all
  // shift with smoking status. Three-state: smoke / quit / never. The
  // "бросил" branch is listed FIRST (same dedup-by-key reasoning as
  // caffeine_high — quit is the more recent fact and overrides "курю").
  { regex: /(?:бросил\s*курить|не\s*курю\s*уже|бросаю\s*курить|больше\s*не\s*курю)/i, category: 'habit', key: 'smoking_status', extract: () => 'quit' },
  { regex: /(?:не\s*курю|никогда\s*не\s*курил)/i, category: 'habit', key: 'smoking_status', extract: () => 'never' },
  { regex: /(?:курю(?!т)|выкуриваю|пачк[ау]\s*в\s*день)/i, category: 'habit', key: 'smoking_status', extract: () => 'current' },

  // ── Round 91: Hydration intake ───────────────────────────────────────────
  // "пью 2 литра воды" — anchors the water_target the AI suggests. Without
  // this, the AI re-asks every chat. Captured as litres (numeric) so the
  // hydration block can compare against a recommended baseline.
  //
  // NB: JS regex `\w` matches only ASCII word chars — Cyrillic suffixes
  // need `[а-я]*` instead. Same convention used elsewhere in this file
  // (see the food_allergy pattern's [\wа-яА-Я]+ catcher).
  { regex: /пью\s*(\d(?:[.,]\d)?)\s*литр[а-я]*\s*воды/i, category: 'habit', key: 'water_intake_liters', extract: (m) => m[1].replace(',', '.') },
  { regex: /(?:выпиваю|потребляю)\s*(\d(?:[.,]\d)?)\s*л(?:итр[а-я]*)?\s*воды/i, category: 'habit', key: 'water_intake_liters', extract: (m) => m[1].replace(',', '.') },

  // ── Round 91: Goal deadline ──────────────────────────────────────────────
  // "к лету", "к свадьбе", "к отпуску", "к новому году" — when the user
  // mentions a deadline alongside a goal, capture it separately. This lets
  // the AI pace recommendations (aggressive deficit for short windows,
  // conservative for open-ended). Stored as a string label so the
  // periodisation block can map "лет" → ~weeks-to-summer.
  { regex: /к\s*(лет[а-я]+|зим[а-я]+|весн[а-я]+|осен[а-я]+)/i, category: 'goal', key: 'goal_deadline', extract: (m) => m[1].toLowerCase() },
  { regex: /к\s*(свадьб[а-я]+|отпуск[а-я]+|новому\s*году|нг|дню\s*рожден[а-я]+)/i, category: 'goal', key: 'goal_deadline', extract: (m) => m[1].toLowerCase() },
  { regex: /(?:за|через)\s*(\d{1,2})\s*(месяц[а-я]*|недел[а-я]*)/i, category: 'goal', key: 'goal_deadline', extract: (m) => `${m[1]} ${m[2]}` },

  // ── Round 91: Experience level descriptor ────────────────────────────────
  // The existing experience_stated pattern captures "X лет/месяцев", but
  // most users describe their level qualitatively first ("я новичок", "я
  // опытный"). The AI's tone, exercise difficulty, and warm-up depth all
  // shift on this. Different KEY from experience_stated — both can coexist.
  { regex: /(?:я\s+)?(новичок|новенький|только\s*начал|с\s*нуля)/i, category: 'preference', key: 'experience_level', extract: () => 'novice' },
  { regex: /(?:я\s+)?(любитель|на\s*среднем\s*уровне|занимаюсь\s*для\s*себя)/i, category: 'preference', key: 'experience_level', extract: () => 'intermediate' },
  { regex: /(?:я\s+)?(опытный|продвинутый|давно\s*занимаюсь|выступал)/i, category: 'preference', key: 'experience_level', extract: () => 'advanced' },
];

/**
 * Extract memorable facts from a user message.
 * Pure function — no DB, no I/O. Safe to call on every chat hit.
 *
 * Round 90: deduplicate by `key` so the FIRST matching pattern wins.
 * Without this, ambiguous inputs ("пью много кофе утром, но на ночь не
 * пью") could match both branches of a binary key like caffeine_high,
 * push two entries, and the `Promise.all` upsert in saveMemories would
 * non-deterministically commit one or the other (last write to land in
 * Postgres wins, but the "last" parallel upsert isn't fixed by JS
 * ordering). Keeping only the first hit per key matches what the
 * MEMORY_PATTERNS array order already implies — the array is the
 * priority list, and we yield to whichever pattern is listed first.
 *
 * multiMatch patterns are exempt because they generate UNIQUE keys per
 * match (via keyFn) — those entries don't collide with each other.
 */
export function extractMemories(message: string): MemoryExtraction[] {
  const memories: MemoryExtraction[] = [];
  const seenKeys = new Set<string>();

  for (const pattern of MEMORY_PATTERNS) {
    if (pattern.multiMatch) {
      // Re-create regex with global flag to capture all occurrences.
      const globalRegex = new RegExp(pattern.regex.source, 'gi');
      for (const match of message.matchAll(globalRegex)) {
        const key = pattern.keyFn ? pattern.keyFn(match as RegExpMatchArray) : pattern.key;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        memories.push({
          category: pattern.category,
          key,
          value: pattern.extract(match as RegExpMatchArray),
          confidence: 0.7,
          source: 'stated',
        });
      }
    } else {
      if (seenKeys.has(pattern.key)) continue;
      const match = message.match(pattern.regex);
      if (match) {
        seenKeys.add(pattern.key);
        memories.push({
          category: pattern.category,
          key: pattern.key,
          value: pattern.extract(match),
          confidence: 0.7,
          source: 'stated',
        });
      }
    }
  }

  return memories;
}
