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
      confidence: 0.7,
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

describe('extractMemories — output contract', () => {
  test('all extractions have confidence=0.7 and source=stated', () => {
    const out = extractMemories('тренируюсь 4 раза в неделю, сплю 8 часов, моя цель 80 кг');
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) {
      expect(m.confidence).toBe(0.7);
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
