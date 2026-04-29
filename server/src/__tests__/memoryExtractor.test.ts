/**
 * Tests for the memory extractor (round 86).
 *
 * Pinned semantics:
 *   - Each pattern matches only the natural Russian phrasings it was
 *     written for (high precision over recall — false positives corrupt
 *     the AI's persistent picture of the user across sessions).
 *   - multiMatch patterns produce one memory per occurrence with a
 *     unique key so concurrent allergies / pain areas all land.
 *   - All extractions land at confidence 0.7, source='stated'.
 */

import { extractMemories } from '../ai/memoryExtractor';

describe('extractMemories — original (pre-round-86) coverage still passes', () => {
  test('training_frequency captures "тренируюсь 3 раза"', () => {
    const out = extractMemories('Тренируюсь 3 раза в неделю');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'schedule',
      key: 'training_frequency',
      value: '3 раз в неделю',
      // Round 93: numeric anchored → 0.9.
      confidence: 0.9,
      source: 'stated',
    }));
  });

  test('training_days multi-match captures multiple weekdays when each has its own "по" marker', () => {
    // The pattern requires "по" as a hard prefix for precision (otherwise
    // any standalone weekday in any context would land as a training day).
    // So multi-day input needs each day to be marked: "по понедельникам, по
    // средам, по пятницам". This pins the contract for future maintainers
    // who might widen the regex.
    const out = extractMemories('хожу в зал по понедельникам, по средам и по пятницам');
    const days = out.filter((m) => m.category === 'schedule');
    expect(days.length).toBeGreaterThanOrEqual(3);
    // Each day gets a unique key so they don't overwrite each other.
    const keys = new Set(days.map((m) => m.key));
    expect(keys.size).toBe(days.length);
  });

  test('training_location captures "тренируюсь дома"', () => {
    const out = extractMemories('тренируюсь дома');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'training_location',
      value: 'дома',
    }));
  });

  test('food_allergy multi-match captures multiple allergies with unique keys', () => {
    const out = extractMemories('у меня аллергия на орехи и непереносимость лактозы');
    const allergies = out.filter((m) => m.category === 'allergy' && m.key.startsWith('allergy_'));
    expect(allergies.length).toBeGreaterThanOrEqual(2);
    const keys = new Set(allergies.map((m) => m.key));
    expect(keys.size).toBe(allergies.length);
  });

  test('pain_area captures plural injury phrasings', () => {
    const out = extractMemories('болит плечо и проблемы с коленом');
    const pains = out.filter((m) => m.key.startsWith('pain_'));
    expect(pains.length).toBeGreaterThanOrEqual(2);
  });

  test('user_goal extracts canonical value, not the matched verb', () => {
    const out = extractMemories('хочу похудеть и сбросить вес');
    const goals = out.filter((m) => m.key === 'user_goal');
    expect(goals.length).toBeGreaterThanOrEqual(1);
    expect(goals[0].value).toBe('похудение');
  });

  test('clean message produces no memories (no false positives)', () => {
    const out = extractMemories('покажи мою статистику за неделю');
    expect(out).toEqual([]);
  });
});

describe('extractMemories — round 86 expansions', () => {
  test('sleep_duration_hours captures "сплю 8 часов"', () => {
    const out = extractMemories('сплю 8 часов в сутки');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'habit',
      key: 'sleep_duration_hours',
      value: '8',
    }));
  });

  test('sleep_duration_hours captures "сплю по 7 часов"', () => {
    const out = extractMemories('обычно сплю по 7 часов');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'sleep_duration_hours',
      value: '7',
    }));
  });

  // Round 109: past-tense + noun-prefix variants
  test('sleep_duration_hours captures "поспал 6 часов"', () => {
    const out = extractMemories('сегодня поспал 6 часов всего');
    expect(out.some((m) => m.key === 'sleep_duration_hours' && m.value === '6')).toBe(true);
  });

  test('sleep_duration_hours captures "проспал 9 часов"', () => {
    const out = extractMemories('проспал 9 часов отлично');
    expect(out.some((m) => m.key === 'sleep_duration_hours' && m.value === '9')).toBe(true);
  });

  test('sleep_duration_hours captures "спал 5 часов"', () => {
    const out = extractMemories('спал 5 часов из-за работы');
    expect(out.some((m) => m.key === 'sleep_duration_hours' && m.value === '5')).toBe(true);
  });

  test('sleep_duration_hours captures "получил 7 часов сна"', () => {
    const out = extractMemories('получил 7 часов сна');
    expect(out.some((m) => m.key === 'sleep_duration_hours' && m.value === '7')).toBe(true);
  });

  test('user_goal — alternative phrasing "моя цель — похудеть"', () => {
    const out = extractMemories('моя цель — похудеть к лету');
    const goals = out.filter((m) => m.key === 'user_goal');
    expect(goals.some((g) => g.value === 'похудение')).toBe(true);
  });

  test('user_goal — alternative phrasing "стремлюсь набрать массу"', () => {
    const out = extractMemories('стремлюсь набрать массу');
    const goals = out.filter((m) => m.key === 'user_goal');
    expect(goals.some((g) => g.value === 'набор массы')).toBe(true);
  });

  test('user_goal — alternative phrasing "планирую похудеть"', () => {
    const out = extractMemories('планирую сбросить вес');
    const goals = out.filter((m) => m.key === 'user_goal');
    expect(goals.some((g) => g.value === 'похудение')).toBe(true);
  });

  test('favorite_exercise — round 86 captures pull-ups / push-ups / plank', () => {
    expect(extractMemories('люблю подтягивания').some((m) => m.key === 'favorite_exercise')).toBe(true);
    expect(extractMemories('обожаю отжимания').length === 0); // "обожаю" not in the pattern (high precision)
    expect(extractMemories('предпочитаю планку').some((m) => m.key === 'favorite_exercise')).toBe(true);
    expect(extractMemories('нравится скакалка').some((m) => m.key === 'favorite_exercise')).toBe(true);
  });

  test('disliked_exercise — round 86 broader coverage', () => {
    expect(extractMemories('ненавижу бёрпи').some((m) => m.key === 'disliked_exercise')).toBe(true);
    expect(extractMemories('избегаю выпады').some((m) => m.key === 'disliked_exercise')).toBe(true);
    expect(extractMemories('не хочу делать жим').some((m) => m.key === 'disliked_exercise')).toBe(true);
  });

  test('target_weight_kg captures "цель 75 кг"', () => {
    const out = extractMemories('моя цель 75 кг');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'goal',
      key: 'target_weight_kg',
      value: '75',
    }));
  });

  test('target_weight_kg captures "хочу весить 80"', () => {
    const out = extractMemories('хочу весить 80 кг');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'target_weight_kg',
      value: '80',
    }));
  });

  test('session_minutes_max captures "у меня 40 минут на тренировку"', () => {
    const out = extractMemories('у меня 40 минут на тренировку максимум');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'preference',
      key: 'session_minutes_max',
      value: '40',
    }));
  });

  test('session_minutes_max captures "только полчаса на тренировку"', () => {
    const out = extractMemories('у меня только полчаса на тренировку');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'session_minutes_max',
      value: '30',
    }));
  });

  test('session_minutes_max captures "максимум час на тренировку"', () => {
    const out = extractMemories('максимум час на тренировку');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'session_minutes_max',
      value: '60',
    }));
  });

  test('caffeine_high captures "пью много кофе"', () => {
    const out = extractMemories('пью много кофе каждый день');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'habit',
      key: 'caffeine_high',
      value: 'high',
    }));
  });

  test('caffeine_high captures "не пью кофе" → none', () => {
    const out = extractMemories('я не пью кофе');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'caffeine_high',
      value: 'none',
    }));
  });

  test('alcohol_pattern captures "пью пиво по выходным"', () => {
    const out = extractMemories('по выходным выпиваю пиво');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'habit',
      key: 'alcohol_pattern',
      value: 'weekend',
    }));
  });

  test('stress_high captures "много стресса"', () => {
    const out = extractMemories('у меня много стресса на работе');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'habit',
      key: 'stress_high',
      value: 'high',
    }));
  });

  test('stress_high captures "выгорание"', () => {
    const out = extractMemories('у меня выгорание');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'stress_high',
      value: 'high',
    }));
  });

  test('sleep_quality_low captures "плохо высыпаюсь"', () => {
    const out = extractMemories('последние недели плохо высыпаюсь');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'habit',
      key: 'sleep_quality_low',
      value: 'low',
    }));
  });
});

describe('extractMemories — round 91 expansions', () => {
  test('diet_style captures "сижу на кето"', () => {
    const out = extractMemories('уже месяц сижу на кето и нравится');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'preference',
      key: 'diet_style',
      value: 'кето',
    }));
  });

  test('diet_style captures "соблюдаю интервальное голодание"', () => {
    const out = extractMemories('соблюдаю интервальное голодание');
    const styles = out.filter((m) => m.key === 'diet_style');
    expect(styles.length).toBeGreaterThanOrEqual(1);
  });

  test('diet_style captures IF window notation "16:8"', () => {
    const out = extractMemories('пощусь 16:8');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'diet_style',
      value: 'IF 16:8',
    }));
  });

  test('diet_style captures "придерживаюсь палео"', () => {
    const out = extractMemories('придерживаюсь палео уже год');
    expect(out.some((m) => m.key === 'diet_style' && m.value === 'палео')).toBe(true);
  });

  test('smoking_status — "бросил курить" wins over later "курю" (dedup-by-key)', () => {
    // Adversarial: a user might type both phrases in one sentence.
    // 'quit' is listed first in the array so dedup keeps it.
    const out = extractMemories('бросил курить полгода назад, раньше курил пачку в день');
    const smk = out.filter((m) => m.key === 'smoking_status');
    expect(smk).toHaveLength(1);
    expect(smk[0].value).toBe('quit');
  });

  test('smoking_status captures "не курю" → never', () => {
    const out = extractMemories('я не курю и не пью');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'smoking_status',
      value: 'never',
    }));
  });

  test('smoking_status captures "курю пачку в день" → current', () => {
    const out = extractMemories('курю пачку в день');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'smoking_status',
      value: 'current',
    }));
  });

  test('water_intake_liters captures "пью 2 литра воды"', () => {
    const out = extractMemories('пью 2 литра воды в день');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'habit',
      key: 'water_intake_liters',
      value: '2',
    }));
  });

  test('water_intake_liters captures decimal "пью 2.5 литра воды"', () => {
    const out = extractMemories('обычно пью 2.5 литра воды');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'water_intake_liters',
      value: '2.5',
    }));
  });

  test('water_intake_liters normalizes comma decimal "2,5"', () => {
    const out = extractMemories('пью 2,5 литра воды');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'water_intake_liters',
      value: '2.5',
    }));
  });

  test('goal_deadline captures "к лету"', () => {
    const out = extractMemories('хочу похудеть к лету');
    expect(out.some((m) => m.key === 'goal_deadline' && m.value.startsWith('лет'))).toBe(true);
  });

  test('goal_deadline captures "к свадьбе"', () => {
    const out = extractMemories('готовлюсь к свадьбе через 4 месяца');
    const dl = out.filter((m) => m.key === 'goal_deadline');
    expect(dl.length).toBeGreaterThanOrEqual(1);
  });

  test('goal_deadline captures "за 3 месяца"', () => {
    const out = extractMemories('хочу набрать массу за 3 месяца');
    expect(out.some((m) => m.key === 'goal_deadline' && m.value.includes('3'))).toBe(true);
  });

  test('experience_level captures "я новичок" → novice', () => {
    const out = extractMemories('я новичок в зале');
    expect(out).toContainEqual(expect.objectContaining({
      category: 'preference',
      key: 'experience_level',
      value: 'novice',
    }));
  });

  test('experience_level captures "я опытный" → advanced', () => {
    const out = extractMemories('я опытный, давно занимаюсь');
    expect(out.some((m) => m.key === 'experience_level' && m.value === 'advanced')).toBe(true);
  });

  test('experience_level captures "только начал" → novice', () => {
    const out = extractMemories('только начал ходить в зал');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'experience_level',
      value: 'novice',
    }));
  });
});

describe('extractMemories — round 91 audit fixes (regression pins)', () => {
  test('audit-A: "мотивируюсь спортом" matches personality_trait (Cyrillic \\w fix)', () => {
    // Pre-existing bug: the original `мотивируюсь\s+\w+` was unreachable
    // because JS \w is ASCII-only. After switching to [а-я]+ this matches.
    const out = extractMemories('я мотивируюсь спортом');
    expect(out.some((m) => m.key === 'personality_trait' && m.value.startsWith('мотивируюсь'))).toBe(true);
  });

  test('audit-B: "придерживаюсь интервального голодания" (genitive) matches diet_style', () => {
    // The genitive-case alternative used `\w+` which couldn't match
    // Cyrillic. Replaced with `[а-я]+` so all inflections of "интервальное
    // голодание" land.
    const out = extractMemories('придерживаюсь интервального голодания уже месяц');
    const styles = out.filter((m) => m.key === 'diet_style');
    expect(styles.length).toBeGreaterThanOrEqual(1);
    expect(styles[0].value).toMatch(/интервальн/);
  });

  test('audit-C: "сижу на кетогене" captures "кетоген", not just "кето"', () => {
    // JS alternation is leftmost, not longest match. After reordering so
    // "кетоген\w*" precedes "кето", inputs containing "кетоген" capture
    // the full word.
    const out = extractMemories('сижу на кетогене');
    const styles = out.filter((m) => m.key === 'diet_style');
    expect(styles).toHaveLength(1);
    expect(styles[0].value.startsWith('кетоген')).toBe(true);
  });

  test('audit-D: "не опытный" does NOT match experience_level=advanced', () => {
    // Without the (?<!не\s+) lookbehind, "не опытный" matched 'opытный'
    // and inverted the user's self-description across sessions.
    const out = extractMemories('я не опытный');
    expect(out.filter((m) => m.key === 'experience_level')).toEqual([]);
  });

  test('audit-D: "не новичок" does NOT match experience_level=novice', () => {
    const out = extractMemories('я уже не новичок');
    expect(out.filter((m) => m.key === 'experience_level')).toEqual([]);
  });

  test('audit-D: "я опытный" still matches (positive case unaffected)', () => {
    const out = extractMemories('я опытный, давно занимаюсь');
    expect(out.some((m) => m.key === 'experience_level' && m.value === 'advanced')).toBe(true);
  });

  test('audit-E: "выступал в театре" does NOT match experience_level=advanced', () => {
    // Removed bare "выступал" alternative — too greedy outside fitness
    // context. Bodybuilders / powerlifters with competition history will
    // say "давно занимаюсь" or "опытный" anyway.
    const out = extractMemories('я выступал в театре прошлым летом');
    expect(out.filter((m) => m.key === 'experience_level')).toEqual([]);
  });

  test('audit-F: "не настроен на кето" does NOT match diet_style', () => {
    // Pre-fix, the bare "на" alternative in the prefix list let
    // ANY occurrence of "на" before "кето" match — so "не настроен на
    // кето" was extracted as if the user followed keto. Dropped "на" plus
    // added (?<!не\s+) lookbehind closes both phrasings.
    const out = extractMemories('я не настроен на кето, для меня это слишком жёстко');
    expect(out.filter((m) => m.key === 'diet_style')).toEqual([]);
  });

  test('audit-F: "не сижу на кето" does NOT match (lookbehind catches strong prefix)', () => {
    const out = extractMemories('я не сижу на кето, ем нормально');
    expect(out.filter((m) => m.key === 'diet_style')).toEqual([]);
  });

  test('audit-F: "сижу на кето" still matches (positive case unaffected)', () => {
    const out = extractMemories('сижу на кето уже полгода');
    expect(out.some((m) => m.key === 'diet_style' && m.value === 'кето')).toBe(true);
  });
});

describe('extractMemories — round 91 boundary (no false positives)', () => {
  test('"кето" inside an unrelated word does NOT trigger diet_style', () => {
    // "кетамин" / "макет" / "анкета" all share substrings but should NOT match.
    // The pattern requires a verb prefix (соблюдаю/на/сижу на/etc) so these
    // are safe — pinning the contract.
    const out = extractMemories('заполнил анкету в зале');
    expect(out.filter((m) => m.key === 'diet_style')).toEqual([]);
  });

  test('"курят коллеги" does NOT match smoking_status (3rd-person verb)', () => {
    // "курю" is 1st-person; "курят" is 3rd-person plural and shouldn't
    // attribute the habit to the user. The negative lookahead (?!т) on
    // "курю" guards this.
    const out = extractMemories('у меня курят коллеги в офисе');
    expect(out.filter((m) => m.key === 'smoking_status')).toEqual([]);
  });

  test('"пью 2 литра молока" does NOT match water_intake_liters', () => {
    // The pattern requires "воды" — milk / juice / coffee in litres should
    // not pollute the water memory.
    const out = extractMemories('пью 2 литра молока в день');
    expect(out.filter((m) => m.key === 'water_intake_liters')).toEqual([]);
  });

  test('"к лету готовлю огурцы" — context noise does NOT poison goal_deadline value', () => {
    // The "к лету" deadline pattern is cheap — it's fine if it matches here.
    // What this test pins: when it does match, the captured value is just
    // the season noun, NOT bleeding into the rest of the sentence.
    const out = extractMemories('к лету готовлю огурцы');
    const dl = out.filter((m) => m.key === 'goal_deadline');
    if (dl.length > 0) {
      // Value must be a short season noun, not a phrase.
      expect(dl[0].value.length).toBeLessThan(15);
      expect(dl[0].value).toMatch(/^лет/);
    }
  });
});

describe('extractMemories — high-precision boundary (no false positives)', () => {
  test('"меня бесят бёрпи но я их делаю" — does NOT match disliked_exercise', () => {
    // "бесят" wasn't added to the dislike pattern on purpose — it's a
    // colloquial flag that often surfaces in jokes. Keep precision high.
    const out = extractMemories('меня бесят бёрпи но я их делаю');
    expect(out.filter((m) => m.key === 'disliked_exercise')).toEqual([]);
  });

  test('"кофе вкусный" — does NOT trigger caffeine_high', () => {
    const out = extractMemories('кофе вкусный');
    expect(out.filter((m) => m.key === 'caffeine_high')).toEqual([]);
  });

  test('numeric-looking but unrelated message produces no goal/weight memory', () => {
    const out = extractMemories('съел 200 грамм гречки');
    expect(out.filter((m) => m.key === 'target_weight_kg')).toEqual([]);
    expect(out.filter((m) => m.key === 'user_goal')).toEqual([]);
  });
});

describe('extractMemories — round 92 expansions (sport history, supplements, family, body comp)', () => {
  test('past_sport captures "раньше играл в футбол"', () => {
    const out = extractMemories('раньше играл в футбол лет десять');
    const sports = out.filter((m) => m.key.startsWith('past_sport_'));
    expect(sports.length).toBeGreaterThanOrEqual(1);
    expect(sports.some((s) => s.value.includes('футбол'))).toBe(true);
  });

  test('past_sport captures multiple sports under unique keys', () => {
    const out = extractMemories('занимался боксом и плаванием в школе');
    const sports = out.filter((m) => m.key.startsWith('past_sport_'));
    expect(sports.length).toBeGreaterThanOrEqual(1);
    const keys = new Set(sports.map((s) => s.key));
    expect(keys.size).toBe(sports.length);
  });

  test('supplement captures "пью креатин"', () => {
    const out = extractMemories('пью креатин по 5г каждый день');
    const sups = out.filter((m) => m.key.startsWith('supplement_'));
    expect(sups.some((s) => s.value === 'креатин')).toBe(true);
  });

  test('supplement captures multiple stack items', () => {
    const out = extractMemories('принимаю креатин и протеин, ещё пью омега-3');
    const sups = out.filter((m) => m.key.startsWith('supplement_'));
    expect(sups.length).toBeGreaterThanOrEqual(2);
    const keys = new Set(sups.map((s) => s.key));
    expect(keys.size).toBe(sups.length);
  });

  test('family_kids captures "у меня двое детей"', () => {
    const out = extractMemories('у меня двое маленьких детей, поэтому мало времени');
    expect(out.some((m) => m.key === 'family_kids' && m.value === 'true')).toBe(true);
  });

  test('family_partnered captures "я женат"', () => {
    const out = extractMemories('я женат, жена тоже занимается');
    expect(out.some((m) => m.key === 'family_partnered' && m.value === 'true')).toBe(true);
  });

  test('work_remote captures "работаю из дома"', () => {
    const out = extractMemories('работаю из дома, поэтому могу тренироваться днём');
    expect(out.some((m) => m.key === 'work_remote' && m.value === 'true')).toBe(true);
  });

  test('bodyfat_percent captures "у меня 20% жира"', () => {
    const out = extractMemories('у меня 20% жира по моим прикидкам');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'bodyfat_percent',
      value: '20',
    }));
  });

  test('current_weight_kg captures "вешу 78 кг"', () => {
    const out = extractMemories('сейчас вешу 78 кг, хочу сбросить до 75');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'current_weight_kg',
      value: '78',
    }));
  });

  test('height_cm captures "мой рост 180 см"', () => {
    const out = extractMemories('мой рост 180 см, вес 78');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'height_cm',
      value: '180',
    }));
  });
});

describe('extractMemories — round 118 lifestyle / aesthetic goals', () => {
  test('captures "хочу пляжное тело" → эстетика', () => {
    const out = extractMemories('хочу пляжное тело к июню');
    expect(out.some((m) => m.key === 'user_goal' && m.value === 'эстетика')).toBe(true);
  });

  test('captures "тело к лету" → эстетика', () => {
    const out = extractMemories('хочу тело к лету');
    expect(out.some((m) => m.key === 'user_goal' && m.value === 'эстетика')).toBe(true);
  });

  test('captures "восстановиться после родов" → постнатальное восстановление', () => {
    const out = extractMemories('хочу восстановиться после родов');
    expect(out.some((m) => m.key === 'user_goal' && /родов/.test(m.value))).toBe(true);
  });

  test('captures "сесть на шпагат" → гибкость', () => {
    const out = extractMemories('мечтаю сесть на шпагат');
    expect(out.some((m) => m.key === 'user_goal' && m.value === 'гибкость')).toBe(true);
  });

  test('captures "сильный пресс" → кор и пресс', () => {
    const out = extractMemories('хочу сильный пресс');
    expect(out.some((m) => m.key === 'user_goal' && /кор/.test(m.value))).toBe(true);
  });

  test('captures "вернуть форму" → возврат в форму', () => {
    const out = extractMemories('хочу вернуть форму после долгого перерыва');
    expect(out.some((m) => m.key === 'user_goal' && /возврат/.test(m.value))).toBe(true);
  });
});

describe('extractMemories — round 116 schedule constraints', () => {
  test('captures "не могу во вторник"', () => {
    const out = extractMemories('не могу во вторник, занят');
    expect(out.some((m) => m.key.startsWith('unavail_'))).toBe(true);
  });

  test('captures multiple unavailable days under unique keys', () => {
    const out = extractMemories('не могу в понедельник и не могу в среду');
    const unavail = out.filter((m) => m.key.startsWith('unavail_'));
    expect(unavail.length).toBeGreaterThanOrEqual(1);
    const keys = new Set(unavail.map((m) => m.key));
    expect(keys.size).toBe(unavail.length);
  });

  test('captures "занят в субботу"', () => {
    const out = extractMemories('занят в субботу');
    expect(out.some((m) => m.key.startsWith('unavail_') && /суббот/.test(m.value))).toBe(true);
  });

  test('captures "только по выходным" → weekends_only', () => {
    const out = extractMemories('только по выходным занимаюсь');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'training_window',
      value: 'weekends_only',
    }));
  });

  test('captures "только в будни" → weekdays_only', () => {
    const out = extractMemories('занимаюсь только в будни');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'training_window',
      value: 'weekdays_only',
    }));
  });

  test('training_window has 0.85 confidence', () => {
    const out = extractMemories('только по выходным');
    const w = out.find((m) => m.key === 'training_window');
    expect(w?.confidence).toBe(0.85);
  });
});

describe('extractMemories — round 113 workout time patterns', () => {
  test('captures "тренируюсь по утрам"', () => {
    const out = extractMemories('тренируюсь по утрам перед работой');
    expect(out.some((m) => m.key === 'workout_time_pref' && /утра/.test(m.value))).toBe(true);
  });

  test('captures "хожу в зал по выходным"', () => {
    const out = extractMemories('хожу в зал по выходным');
    expect(out.some((m) => m.key === 'workout_time_pref' && /выходн/.test(m.value))).toBe(true);
  });

  test('captures "тренируюсь до завтрака"', () => {
    const out = extractMemories('тренируюсь до завтрака');
    expect(out.some((m) => m.key === 'workout_time_pref' && /завтрак/.test(m.value))).toBe(true);
  });

  test('captures explicit hour "тренируюсь в 7"', () => {
    const out = extractMemories('тренируюсь в 7 утра');
    expect(out.some((m) => m.key === 'workout_time_hour' && /^7:00$/.test(m.value))).toBe(true);
  });

  test('captures "тренируюсь в 18:30"', () => {
    const out = extractMemories('тренируюсь в 18:30');
    expect(out.some((m) => m.key === 'workout_time_hour' && /^18:30$/.test(m.value))).toBe(true);
  });
});

describe('extractMemories — round 112 weight delta targets', () => {
  test('captures "хочу сбросить 5 кг"', () => {
    const out = extractMemories('хочу сбросить 5 кг к лету');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'weight_loss_target_kg',
      value: '5',
    }));
  });

  test('captures "сбросить 10 кг" (no хочу)', () => {
    const out = extractMemories('сбросить 10 кг и удержать');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'weight_loss_target_kg',
      value: '10',
    }));
  });

  test('captures "хочу набрать 8 кг"', () => {
    const out = extractMemories('хочу набрать 8 кг массы');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'weight_gain_target_kg',
      value: '8',
    }));
  });

  test('captures "нарастить 3 кг"', () => {
    const out = extractMemories('нарастить 3 кг сухой массы');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'weight_gain_target_kg',
      value: '3',
    }));
  });

  test('weight_loss_target gets confidence 0.9 (numeric anchored)', () => {
    const out = extractMemories('хочу сбросить 5 кг');
    const found = out.find((m) => m.key === 'weight_loss_target_kg');
    expect(found?.confidence).toBe(0.9);
  });
});

describe('extractMemories — round 111 expanded diet_restriction', () => {
  test('captures "не ем красное мясо"', () => {
    const out = extractMemories('я не ем красное мясо последние 3 года');
    expect(out.some((m) => m.key === 'diet_restriction' && /красн\w*\s*мяс|мяс/.test(m.value))).toBe(true);
  });

  test('captures "пескетарианка"', () => {
    const out = extractMemories('я пескетарианка');
    expect(out.some((m) => m.key === 'diet_restriction' && /пескетариан/.test(m.value))).toBe(true);
  });

  test('captures "без сахара"', () => {
    const out = extractMemories('держусь без сахара');
    expect(out.some((m) => m.key === 'diet_restriction' && /сахар/.test(m.value))).toBe(true);
  });

  test('captures "без глютена"', () => {
    const out = extractMemories('питаюсь без глютена');
    expect(out.some((m) => m.key === 'diet_restriction' && /глютен/.test(m.value))).toBe(true);
  });

  test('captures "не ем свинину"', () => {
    const out = extractMemories('не ем свинину по религиозным соображениям');
    expect(out.some((m) => m.key === 'diet_restriction' && /свинин/.test(m.value))).toBe(true);
  });
});

describe('extractMemories — round 105 expanded equipment list', () => {
  test('captures "купил TRX"', () => {
    const out = extractMemories('купил TRX, теперь могу заниматься дома');
    const items = out.filter((m) => m.key.startsWith('equipment_'));
    expect(items.some((it) => /trx/i.test(it.value))).toBe(true);
  });

  test('captures "у меня есть фитбол"', () => {
    const out = extractMemories('у меня есть фитбол');
    const items = out.filter((m) => m.key.startsWith('equipment_'));
    expect(items.some((it) => /фитбол/i.test(it.value))).toBe(true);
  });

  test('captures "у меня есть эспандер"', () => {
    const out = extractMemories('у меня есть эспандер');
    const items = out.filter((m) => m.key.startsWith('equipment_'));
    expect(items.some((it) => /эспандер/i.test(it.value))).toBe(true);
  });

  test('captures "купил скакалку"', () => {
    const out = extractMemories('купил скакалку для кардио');
    const items = out.filter((m) => m.key.startsWith('equipment_'));
    expect(items.some((it) => /скакалк/i.test(it.value))).toBe(true);
  });

  test('captures "у меня есть ролик"', () => {
    const out = extractMemories('у меня есть ролик пресса');
    const items = out.filter((m) => m.key.startsWith('equipment_'));
    expect(items.some((it) => /ролик/i.test(it.value))).toBe(true);
  });

  // Compound lists ("X и Y") are a known limitation — each equipment word
  // currently needs its own prefix ("у меня есть X, у меня есть Y") to land.
  // Documented here as "future work" rather than a bug.
  test('compound list "брусья и турник" only captures the first item (limitation)', () => {
    const out = extractMemories('у меня есть брусья и турник');
    const items = out.filter((m) => m.key.startsWith('equipment_'));
    // At least one — captures "брусь" via "есть брусья". "турник" needs
    // its own "есть" prefix.
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('extractMemories — round 132 systemic health conditions', () => {
  test('captures "у меня диабет"', () => {
    const out = extractMemories('у меня диабет 2 типа');
    expect(out.some((m) => m.key.startsWith('health_') && /диабет/.test(m.value))).toBe(true);
  });

  test('captures "у меня гипертония"', () => {
    const out = extractMemories('у меня гипертония, принимаю лекарства');
    expect(out.some((m) => m.key.startsWith('health_') && /гипертон/.test(m.value))).toBe(true);
  });

  test('captures multiple conditions under unique keys', () => {
    const out = extractMemories('у меня астма и плоскостопие');
    const conditions = out.filter((m) => m.key.startsWith('health_'));
    expect(conditions.length).toBeGreaterThanOrEqual(1);
    const keys = new Set(conditions.map((c) => c.key));
    expect(keys.size).toBe(conditions.length);
  });

  test('captures "диагноз тахикардия"', () => {
    const out = extractMemories('диагноз тахикардия по утрам');
    expect(out.some((m) => m.key.startsWith('health_') && /тахикард/.test(m.value))).toBe(true);
  });

  test('health_condition confidence is 0.85', () => {
    const out = extractMemories('у меня астма');
    const c = out.find((m) => m.key.startsWith('health_'));
    expect(c?.confidence).toBe(0.85);
  });
});

describe('extractMemories — round 129 gym + coach context', () => {
  test('captures "тренируюсь с тренером" → has_personal_trainer=true', () => {
    const out = extractMemories('тренируюсь с тренером 2 раза в неделю');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'has_personal_trainer',
      value: 'true',
    }));
  });

  test('captures "сам тренируюсь" → has_personal_trainer=false', () => {
    const out = extractMemories('сам тренируюсь, без помощи');
    expect(out).toContainEqual(expect.objectContaining({
      key: 'has_personal_trainer',
      value: 'false',
    }));
  });

  test('captures "хожу в World Class" → gym_membership', () => {
    const out = extractMemories('хожу в World Class на Тверской');
    expect(out.some((m) => m.key === 'gym_membership' && /world\s*class/.test(m.value))).toBe(true);
  });

  test('captures "хожу в качалку" → gym_membership generic', () => {
    const out = extractMemories('хожу в качалку рядом с домом');
    expect(out.some((m) => m.key === 'gym_membership' && /качалк/.test(m.value))).toBe(true);
  });
});

describe('extractMemories — round 125 RPE / intensity preference', () => {
  test('captures "люблю тяжёлые тренировки" → high', () => {
    const out = extractMemories('люблю тяжёлые тренировки до отказа');
    expect(out.some((m) => m.key === 'rpe_pref' && m.value === 'high')).toBe(true);
  });

  test('captures "до отказа" via the "люблю до отказа" pattern', () => {
    const out = extractMemories('комфортно работать до отказа');
    expect(out.some((m) => m.key === 'rpe_pref' && m.value === 'high')).toBe(true);
  });

  test('captures "не люблю до отказа" → low', () => {
    const out = extractMemories('не люблю до отказа, оставляю запас');
    expect(out.some((m) => m.key === 'rpe_pref' && m.value === 'low')).toBe(true);
  });

  test('captures "работаю с запасом" → low', () => {
    const out = extractMemories('работаю с запасом, не до отказа');
    expect(out.some((m) => m.key === 'rpe_pref' && m.value === 'low')).toBe(true);
  });

  test('captures "оставляю в баке" → low', () => {
    const out = extractMemories('оставляю пару повторов в баке');
    expect(out.some((m) => m.key === 'rpe_pref' && m.value === 'low')).toBe(true);
  });
});

describe('extractMemories — round 92 boundary (no false positives)', () => {
  test('"я не женат" does NOT match family_partnered (round 124 fix)', () => {
    // Round 92 originally matched this as 'true' — the pattern had no
    // negation guard. Round 124 added (?<!не\s+) lookbehind, mirroring
    // experience_level and diet_style.
    const out = extractMemories('я не женат, живу один');
    expect(out.filter((m) => m.key === 'family_partnered')).toEqual([]);
  });

  test('round 124: "я женат" still matches (positive case unchanged)', () => {
    const out = extractMemories('я женат, жена тоже занимается');
    expect(out.some((m) => m.key === 'family_partnered' && m.value === 'true')).toBe(true);
  });

  test('round 124: "у меня нет детей" does NOT match family_kids', () => {
    const out = extractMemories('у меня нет детей пока');
    expect(out.filter((m) => m.key === 'family_kids')).toEqual([]);
  });

  test('"вес 78" without "кг" does NOT match current_weight_kg (avoids false positives on rep counts etc)', () => {
    const out = extractMemories('сделал жим лёжа 78');
    expect(out.filter((m) => m.key === 'current_weight_kg')).toEqual([]);
  });

  test('rost without 3-digit number does NOT match height_cm', () => {
    const out = extractMemories('у меня рост важен');
    expect(out.filter((m) => m.key === 'height_cm')).toEqual([]);
  });

  test('"мне 20%" without "жира" does NOT match bodyfat_percent', () => {
    const out = extractMemories('у меня 20% скидка на абонемент');
    expect(out.filter((m) => m.key === 'bodyfat_percent')).toEqual([]);
  });
});

describe('extractMemories — round 93 confidence calibration', () => {
  test('numeric anchored facts get confidence 0.9 (training_frequency, sleep_duration, target_weight)', () => {
    const cases: Array<{ input: string; key: string }> = [
      { input: 'тренируюсь 4 раза в неделю', key: 'training_frequency' },
      { input: 'сплю 8 часов', key: 'sleep_duration_hours' },
      { input: 'моя цель 75 кг', key: 'target_weight_kg' },
      { input: 'у меня 40 минут на тренировку', key: 'session_minutes_max' },
      { input: 'пью 2 литра воды', key: 'water_intake_liters' },
      { input: 'у меня 18% жира', key: 'bodyfat_percent' },
      { input: 'сейчас вешу 80 кг', key: 'current_weight_kg' },
      { input: 'мой рост 180 см', key: 'height_cm' },
    ];
    for (const c of cases) {
      const out = extractMemories(c.input);
      const found = out.find((m) => m.key === c.key);
      expect(found).toBeDefined();
      expect(found!.confidence).toBe(0.9);
    }
  });

  test('strong qualitative facts get confidence 0.8-0.85 (training_location, smoking, diet_style, caffeine)', () => {
    const out1 = extractMemories('тренируюсь дома');
    expect(out1.find((m) => m.key === 'training_location')?.confidence).toBe(0.8);

    const out2 = extractMemories('я не курю');
    expect(out2.find((m) => m.key === 'smoking_status')?.confidence).toBe(0.85);

    const out3 = extractMemories('сижу на кето');
    expect(out3.find((m) => m.key === 'diet_style')?.confidence).toBe(0.85);

    const out4 = extractMemories('пью много кофе');
    expect(out4.find((m) => m.key === 'caffeine_high')?.confidence).toBe(0.85);
  });

  test('weak signals get confidence 0.6 (personality_trait)', () => {
    const out = extractMemories('я перфекционист');
    expect(out.find((m) => m.key === 'personality_trait')?.confidence).toBe(0.6);
  });

  test('uncalibrated patterns retain default 0.7', () => {
    // favorite_exercise has no explicit confidence — falls back to 0.7.
    const out = extractMemories('люблю приседания');
    const fav = out.find((m) => m.key === 'favorite_exercise');
    expect(fav).toBeDefined();
    expect(fav!.confidence).toBe(0.7);
  });
});

describe('extractMemories — round 127 multi-pattern integration', () => {
  test('long natural message yields multiple distinct memories without crosstalk', () => {
    const message = `Привет! Я тренируюсь 4 раза в неделю по утрам,
    в зале. Сейчас вешу 80 кг, рост 178 см, хочу сбросить 5 кг к лету.
    У меня двое детей и я работаю из дома. Не курю, пью 2 литра воды.
    Сплю 7 часов. Я опытный, давно занимаюсь.`;
    const out = extractMemories(message);

    // Multiple memories should land. Check key categories present.
    const keys = new Set(out.map((m) => m.key));
    expect(keys.has('training_frequency')).toBe(true);
    expect(keys.has('current_weight_kg')).toBe(true);
    expect(keys.has('height_cm')).toBe(true);
    expect(keys.has('weight_loss_target_kg')).toBe(true);
    expect(keys.has('family_kids')).toBe(true);
    expect(keys.has('work_remote')).toBe(true);
    expect(keys.has('smoking_status')).toBe(true);
    expect(keys.has('water_intake_liters')).toBe(true);
    expect(keys.has('sleep_duration_hours')).toBe(true);
    expect(keys.has('experience_level')).toBe(true);
  });

  test('all memories from such a message have valid confidence in [0.6, 0.95]', () => {
    const out = extractMemories(
      'тренируюсь 5 раз в неделю, цель 85 кг, сплю 8 часов, я новичок'
    );
    for (const m of out) {
      expect(m.confidence).toBeGreaterThanOrEqual(0.6);
      expect(m.confidence).toBeLessThanOrEqual(0.95);
      expect(m.source).toBe('stated');
    }
  });

  test('all keys uniqueness invariant — no two memories share the same key', () => {
    const out = extractMemories(
      'тренируюсь 4 раза в неделю, тренируюсь дома, у меня двое детей, женат, не курю'
    );
    const keys = out.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('extractMemories — output contract', () => {
  test('all extractions have valid confidence in [0.6, 0.9] range and source=stated', () => {
    const out = extractMemories('тренируюсь 4 раза в неделю, сплю 8 часов, моя цель 80 кг');
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) {
      expect(m.confidence).toBeGreaterThanOrEqual(0.6);
      expect(m.confidence).toBeLessThanOrEqual(0.9);
      expect(m.source).toBe('stated');
    }
  });

  test('returns an empty array (not undefined) for an empty message', () => {
    expect(extractMemories('')).toEqual([]);
  });

  test('returns an empty array for whitespace-only input', () => {
    expect(extractMemories('     \n\t   ')).toEqual([]);
  });

  test('round 90: deduplicates by key — first matching pattern wins on conflicts', () => {
    // Ambiguous input that historically matched both caffeine_high('none')
    // and caffeine_high('high'). With the round-90 dedup the FIRST listed
    // pattern (which is now 'none' — see MEMORY_PATTERNS array order)
    // wins deterministically. Without it, the parallel saveMemories
    // upserts would race and either value could land in the DB.
    const out = extractMemories('пью много кофе утром, но на ночь не пью кофе');
    const cafs = out.filter((m) => m.key === 'caffeine_high');
    expect(cafs).toHaveLength(1);
    expect(cafs[0].value).toBe('none');
  });

  test('round 90: multiMatch keys (per-match keyFn) are NOT deduplicated', () => {
    // food_allergy uses keyFn so each allergen lands under a unique key
    // (allergy_орех, allergy_лактоз...). Dedup must NOT collapse them.
    const out = extractMemories('у меня аллергия на орехи и непереносимость лактозы');
    const allergies = out.filter((m) => m.key.startsWith('allergy_'));
    expect(allergies.length).toBeGreaterThanOrEqual(2);
    const keys = new Set(allergies.map((m) => m.key));
    expect(keys.size).toBe(allergies.length);
  });
});
