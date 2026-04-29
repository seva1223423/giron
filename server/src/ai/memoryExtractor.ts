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
  { regex: /(?:пью\s*много\s*коф|кофе\s*литрами|зависим\s*от\s*коф)/i, category: 'habit', key: 'caffeine_high', extract: () => 'high' },
  { regex: /(?:не\s*пью\s*коф|без\s*коф|кофе\s*не\s*пью)/i, category: 'habit', key: 'caffeine_high', extract: () => 'none' },
  // Match both "пью пиво по выходным" and "по выходным выпиваю пиво" word
  // orders — Russian doesn't pin SVO so either reads naturally.
  { regex: /(?:по\s*выходн\w*\s*(?:выпиваю|пью)|(?:выпиваю|пью)\s*пиво|(?:выпиваю|пью)\s*по\s*выходн|алкоголь\s*по\s*выходн)/i, category: 'habit', key: 'alcohol_pattern', extract: () => 'weekend' },

  // ── Stress signals ───────────────────────────────────────────────────────
  // Round 86: persistent stress/sleep markers — let the AI factor them into
  // recovery recommendations across sessions instead of treating each "много
  // стресса" mention as a fresh discovery.
  { regex: /(?:много\s*стресса|нервная\s*работа|перенапряжение|выгорание)/i, category: 'habit', key: 'stress_high', extract: () => 'high' },
  { regex: /(?:плохо\s*высыпаюсь|мало\s*сплю|недосып)/i, category: 'habit', key: 'sleep_quality_low', extract: () => 'low' },
];

/**
 * Extract memorable facts from a user message.
 * Pure function — no DB, no I/O. Safe to call on every chat hit.
 */
export function extractMemories(message: string): MemoryExtraction[] {
  const memories: MemoryExtraction[] = [];

  for (const pattern of MEMORY_PATTERNS) {
    if (pattern.multiMatch) {
      // Re-create regex with global flag to capture all occurrences.
      const globalRegex = new RegExp(pattern.regex.source, 'gi');
      for (const match of message.matchAll(globalRegex)) {
        const key = pattern.keyFn ? pattern.keyFn(match as RegExpMatchArray) : pattern.key;
        memories.push({
          category: pattern.category,
          key,
          value: pattern.extract(match as RegExpMatchArray),
          confidence: 0.7,
          source: 'stated',
        });
      }
    } else {
      const match = message.match(pattern.regex);
      if (match) {
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
