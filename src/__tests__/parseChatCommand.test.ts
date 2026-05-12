/**
 * Parser regression pins — focus on the four big upgrades:
 *   1. Composite commands (parseChatCommands returns array)
 *   2. Russian numeral WORDS → digits (пятьдесят → 50, двести пятьдесят → 250)
 *   3. Russian stemmer + approxMatch (курица ≈ куриная)
 *   4. New stats: sleep, cardio, measurements, body weight
 *
 * Plus all Phase A-F behaviour preserved.
 */
import {
  parseChatCommand,
  parseChatCommands,
  stemRussian,
  approxMatch,
  normalizeRu,
} from '../screens/ai/parseChatCommand';

// ═══════════════════════ Backward-compat single-command ═══════════════════

describe('Single-command — backward compat', () => {
  it.each([
    ['+250 воды', { type: 'add_water', ml: 250 }],
    ['done', { type: 'complete_set' }],
    ['тяжелее', { type: 'adjust_weight', delta: 5 }],
    ['next', { type: 'next_exercise' }],
    ['вес 95', { type: 'set_weight', weight: 95 }],
    ['пробежал 5 км', { type: 'log_cardio', kind: 'run', km: 5 }],
    ['обед 600 ккал', { type: 'log_meal_kcal', mealType: 'lunch', kcal: 600 }],
    ['спал 7 30', { type: 'log_sleep', hours: 7, minutes: 30 }],
    ['тёмная тема', { type: 'set_theme', mode: 'dark' }],
    ['вешу 78.2', { type: 'log_body_weight', kg: 78.2 }],
  ])('parses %s', (input, expected) => {
    expect(parseChatCommand(input)).toEqual(expected);
  });
});

// ═══════════════════════ Composite commands ═══════════════════════════════

describe('Composite commands — parseChatCommands returns array', () => {
  it('parses "выпил стакан и пробежал 5 км"', () => {
    expect(parseChatCommands('выпил стакан и пробежал 5 км')).toEqual([
      { type: 'add_water', ml: 250 },
      { type: 'log_cardio', kind: 'run', km: 5 },
    ]);
  });

  it('parses three actions chained by " и "', () => {
    expect(parseChatCommands('выпил литр и спал 8 часов и весы показали 78')).toEqual([
      { type: 'add_water', ml: 1000 },
      { type: 'log_sleep', hours: 8, minutes: 0 },
      { type: 'log_body_weight', kg: 78 },
    ]);
  });

  it('parses comma-separated list', () => {
    expect(parseChatCommands('тяжелее, готово, дальше')).toEqual([
      { type: 'adjust_weight', delta: 5 },
      { type: 'complete_set' },
      { type: 'next_exercise' },
    ]);
  });

  it('parses "потом" separator', () => {
    expect(parseChatCommands('пробежал 3 км потом выпил пол-литра')).toEqual([
      { type: 'log_cardio', kind: 'run', km: 3 },
      { type: 'add_water', ml: 500 },
    ]);
  });

  it('drops chunks that do not parse', () => {
    // Middle chunk is gibberish — should be filtered, others survive.
    expect(parseChatCommands('выпил стакан и абракадабра и done')).toEqual([
      { type: 'add_water', ml: 250 },
      { type: 'complete_set' },
    ]);
  });

  it('returns null when NOTHING parses', () => {
    expect(parseChatCommands('абракадабра и привет')).toBeNull();
  });

  it('does NOT split program names containing " и "', () => {
    // "активировать программу Сила и масса" — handler captures the
    // whole name. We try whole-match BEFORE splitting so this works.
    expect(parseChatCommands('активировать программу Сила и масса')).toEqual([
      { type: 'activate_program', name: 'Сила и масса' },
    ]);
  });
});

// ═══════════════════════ Russian numeral words ═══════════════════════════

describe('Numeral words → digits', () => {
  it('simple tens', () => {
    expect(parseChatCommand('выпил пятьдесят мл')).toEqual({ type: 'add_water', ml: 50 });
    // "вешу семьдесят восемь" — folds 70+8=78.
    expect(parseChatCommand('вешу семьдесят восемь')).toEqual({ type: 'log_body_weight', kg: 78 });
  });

  it('hundreds + tens fold (двести пятьдесят → 250)', () => {
    expect(parseChatCommand('выпил двести пятьдесят мл')).toEqual({ type: 'add_water', ml: 250 });
  });

  it('hundreds + tens + units (двести пятьдесят шесть)', () => {
    expect(parseChatCommand('обед двести пятьдесят шесть ккал')).toEqual({
      type: 'log_meal_kcal', mealType: 'lunch', kcal: 256,
    });
  });

  it('сто as standalone hundred', () => {
    expect(parseChatCommand('подход сто на шесть')).toEqual({ type: 'add_set', weight: 100, reps: 6 });
  });

  it('1.5к / 1к shorthand', () => {
    expect(parseChatCommand('цель калорий 2к')).toEqual({ type: 'set_calories_target', kcal: 2000 });
    expect(parseChatCommand('цель воды 2.5к')).toEqual({ type: 'set_water_target', ml: 2500 });
  });
});

// ═══════════════════════ Russian stemmer / approxMatch ═══════════════════

describe('stemRussian / approxMatch — for Russian case endings', () => {
  it('курица / куриная / куриного all collapse to the same stem', () => {
    // The exact stem value isn't pinned — what matters is that these
    // three forms produce the SAME stem so substring matching bridges
    // them. (Implementation detail: currently "кур".)
    expect(stemRussian('курица')).toBe(stemRussian('куриная'));
    expect(stemRussian('куриная')).toBe(stemRussian('куриного'));
  });

  it('грудка / грудку / грудкой share a stem prefix', () => {
    const a = stemRussian('грудка');
    const b = stemRussian('грудку');
    const c = stemRussian('грудкой');
    expect(a).toBe(b);
    // грудкой → грудк (drop ой), грудка → грудк (drop а)
    expect(a).toBe(c);
  });

  it('keeps short words intact', () => {
    expect(stemRussian('лом')).toBe('лом'); // <4 chars after, returns as-is
    expect(stemRussian('мяс')).toBe('мяс');
  });

  it('handles ё→е normalization', () => {
    expect(stemRussian('ёжик')).toBe(stemRussian('ежик'));
  });

  it('approxMatch — курица matches Куриная грудка с рисом', () => {
    expect(approxMatch('курица с рисом', 'Куриная грудка с рисом')).toBe(true);
  });

  it('approxMatch — case-insensitive', () => {
    expect(approxMatch('ОВСЯНКА', 'овсянка с бананом')).toBe(true);
  });

  it('approxMatch — fails on totally unrelated', () => {
    expect(approxMatch('борщ', 'Шарлотка с яблоками')).toBe(false);
  });

  it('approxMatch — handles "Жим штанги лёжа" / "жимом лежа"', () => {
    expect(approxMatch('жимом лежа', 'Жим штанги лёжа')).toBe(true);
  });
});

describe('normalizeRu', () => {
  it('lowercases + ё→е + trims', () => {
    expect(normalizeRu('  Ёжик  ')).toBe('ежик');
    expect(normalizeRu('ПРИВЕТ')).toBe('привет');
  });
});

// ═══════════════════════ NL volume / duration words ═══════════════════════

describe('NL volume / duration words', () => {
  it.each([
    ['выпил стакан', 250],
    ['выпил пол-литра', 500],
    ['выпил литр', 1000],
    ['выпил полстакана', 125],
    ['выпил бутылочку', 500],
    ['выпил кружку', 300],
  ])('parses "%s" → add_water %i', (input, ml) => {
    expect(parseChatCommand(input)).toEqual({ type: 'add_water', ml });
  });

  it('cardio duration words', () => {
    expect(parseChatCommand('бегал час')).toEqual({ type: 'log_cardio', kind: 'run', minutes: 60 });
    expect(parseChatCommand('бегал полтора часа')).toEqual({ type: 'log_cardio', kind: 'run', minutes: 90 });
    expect(parseChatCommand('гулял полчаса')).toEqual({ type: 'log_cardio', kind: 'walk', minutes: 30 });
  });

  it('sleep duration words', () => {
    expect(parseChatCommand('спал час')).toEqual({ type: 'log_sleep', hours: 1, minutes: 0 });
    expect(parseChatCommand('спал полтора часа')).toEqual({ type: 'log_sleep', hours: 1, minutes: 30 });
  });
});

// ═══════════════════════ NEW: stats — sleep / cardio / measurements / weight ════

describe('New stats commands', () => {
  it.each([
    ['как сон', 'stats_sleep'],
    ['сколько спал', 'stats_sleep'],
    ['мой сон', 'stats_sleep'],
    ['как кардио', 'stats_cardio'],
    ['сколько пробежал', 'stats_cardio'],
    ['мои замеры', 'stats_measurements'],
    ['замеры', 'stats_measurements'],
    ['мой вес', 'stats_body_weight'],
    ['сколько я вешу', 'stats_body_weight'],
    ['какой у меня вес', 'stats_body_weight'],
  ])('"%s" → %s', (input, type) => {
    expect(parseChatCommand(input)).toEqual({ type });
  });
});

// ═══════════════════════ Expanded NL coverage ═══════════════════════════════

describe('Expanded NL — emoji + slang + exclamations', () => {
  it('emoji confirmations → complete_set', () => {
    expect(parseChatCommand('✓')).toEqual({ type: 'complete_set' });
    expect(parseChatCommand('✅')).toEqual({ type: 'complete_set' });
    expect(parseChatCommand('👍')).toEqual({ type: 'complete_set' });
  });

  it('slang adjust', () => {
    expect(parseChatCommand('потяжелее')).toEqual({ type: 'adjust_weight', delta: 5 });
    expect(parseChatCommand('полегче')).toEqual({ type: 'adjust_weight', delta: -5 });
    expect(parseChatCommand('наварь 5')).toEqual({ type: 'adjust_weight', delta: 5 });
    expect(parseChatCommand('сбавь 5')).toEqual({ type: 'adjust_weight', delta: -5 });
  });

  it('slang next / finish', () => {
    expect(parseChatCommand('поехали дальше')).toEqual({ type: 'next_exercise' });
    expect(parseChatCommand('давай дальше')).toEqual({ type: 'next_exercise' });
    expect(parseChatCommand('устал всё')).toEqual({ type: 'finish_workout' });
    expect(parseChatCommand('сворачиваюсь')).toEqual({ type: 'finish_workout' });
  });

  it('slang complete', () => {
    expect(parseChatCommand('врубил подход')).toEqual({ type: 'complete_set' });
  });

  it('slang set add', () => {
    expect(parseChatCommand('качнул подход 100×6')).toEqual({ type: 'add_set', weight: 100, reps: 6 });
    expect(parseChatCommand('сделал подход 80×10')).toEqual({ type: 'add_set', weight: 80, reps: 10 });
  });

  it('перекусил X → add_recipe', () => {
    expect(parseChatCommand('перекусил овсянкой')).toEqual({ type: 'add_recipe', name: 'овсянкой' });
  });

  it('употребил X мл → water', () => {
    expect(parseChatCommand('употребил 500 мл')).toEqual({ type: 'add_water', ml: 500 });
  });

  it('давай программу X → activate', () => {
    expect(parseChatCommand('давай программу Сила')).toEqual({ type: 'activate_program', name: 'Сила' });
  });
});

// ═══════════════════════ Negatives ═══════════════════════════════════════

describe('Negatives — must stay null', () => {
  it.each([
    '',
    '   ',
    'привет',
    'как дела',
    'когда мне отдохнуть?',
    'подход',
    '+воды',
    'спать пора',
    'программа какая лучше',
    'замени',
    'съел',
    'ок',
    'ага',
    'хорошо',
    'что мне есть',
    'что попить',
  ])('returns null for "%s"', (input) => {
    expect(parseChatCommand(input)).toBeNull();
  });
});
