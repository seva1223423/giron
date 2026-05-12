/**
 * Parser regression pins — focus on natural-language phrasings.
 *
 * The parser now has a preprocessing pass that converts Russian volume /
 * duration WORDS (стакан, литр, час, полчаса) to digit forms before the
 * regex matchers run. Plus broader verb / prefix coverage in every
 * matcher so users don't have to memorize a command grammar.
 *
 * Tests are grouped:
 *  - Original digit-form pins (unchanged behaviour from Phase A-F)
 *  - NEW natural-language pins (volume words, duration words, colloquial
 *    verbs, question forms)
 *  - Negatives that must STILL stay null
 */
import { parseChatCommand } from '../screens/ai/parseChatCommand';

// ═══════════════════════ Digit-form pins (regression) ═════════════════════

describe('Digit forms — Phase A/D/E/F regression', () => {
  it.each([
    ['+250 воды', { type: 'add_water', ml: 250 }],
    ['выпил 500 мл', { type: 'add_water', ml: 500 }],
    ['добавь подход 100×6', { type: 'add_set', weight: 100, reps: 6 }],
    ['done', { type: 'complete_set' }],
    ['+1', { type: 'complete_set' }],
    ['тяжелее', { type: 'adjust_weight', delta: 5 }],
    ['легче', { type: 'adjust_weight', delta: -5 }],
    ['next', { type: 'next_exercise' }],
    ['назад', { type: 'prev_exercise' }],
    ['вес 95', { type: 'set_weight', weight: 95 }],
    ['10 повторов', { type: 'set_reps', reps: 10 }],
    ['отдых 90', { type: 'set_rest_timer', seconds: 90 }],
    ['пробежал 5 км', { type: 'log_cardio', kind: 'run', km: 5 }],
    ['прошёл 3 км', { type: 'log_cardio', kind: 'walk', km: 3 }],
    ['30 минут кардио', { type: 'log_cardio', kind: 'cardio', minutes: 30 }],
    ['талия 80', { type: 'log_measurement', field: 'waist', cm: 80 }],
    ['обед 600 ккал', { type: 'log_meal_kcal', mealType: 'lunch', kcal: 600 }],
    ['+300 ккал', { type: 'log_meal_kcal', mealType: 'snack', kcal: 300 }],
    ['спал 7 30', { type: 'log_sleep', hours: 7, minutes: 30 }],
    ['тёмная тема', { type: 'set_theme', mode: 'dark' }],
    ['уведомления вкл', { type: 'toggle_notifications', enabled: true }],
    ['вешу 78.2', { type: 'log_body_weight', kg: 78.2 }],
    ['вешу 78,5', { type: 'log_body_weight', kg: 78.5 }],
  ])('parses %s', (input, expected) => {
    expect(parseChatCommand(input)).toEqual(expected);
  });

  it('preserves вес vs вешу distinction', () => {
    expect(parseChatCommand('вес 95')).toEqual({ type: 'set_weight', weight: 95 });
    expect(parseChatCommand('вешу 78.2')).toEqual({ type: 'log_body_weight', kg: 78.2 });
  });
});

// ═══════════════════════ NL — volume words ═══════════════════════════════

describe('NL volume words → water', () => {
  it.each([
    ['выпил стакан воды', 250],
    ['выпила стакан', 250],
    ['закинул стакан воды', 250],
    ['выпил пол-литра', 500],
    ['выпил пол литра', 500],
    ['выпил полулитра воды', 500],
    ['выпил литр воды', 1000],
    ['налил литр', 1000],
    ['выпил полстакана', 125],
    ['выпил бутылку', 500],
    ['выпил бутылочку', 500],
    ['выпил кружку', 300],
  ])('parses "%s" → add_water %i', (input, ml) => {
    expect(parseChatCommand(input)).toEqual({ type: 'add_water', ml });
  });

  it('handles colloquial verbs even with explicit ml', () => {
    expect(parseChatCommand('выдул 500 мл')).toEqual({ type: 'add_water', ml: 500 });
    expect(parseChatCommand('хлебнул 200 мл')).toEqual({ type: 'add_water', ml: 200 });
    expect(parseChatCommand('попил 300 мл')).toEqual({ type: 'add_water', ml: 300 });
    expect(parseChatCommand('осилил 1000 мл')).toEqual({ type: 'add_water', ml: 1000 });
  });
});

// ═══════════════════════ NL — duration words ═════════════════════════════

describe('NL duration words → cardio / sleep', () => {
  it('бегал час → cardio run with 60 minutes', () => {
    // "час" normalizes to "60 мин"; cardio without km uses fallback estimate
    // ... but RUN_DURATION_RE captures it as duration-only.
    expect(parseChatCommand('бегал час')).toEqual({
      type: 'log_cardio', kind: 'run', minutes: 60,
    });
  });

  it('бежал полчаса → cardio run 30 min', () => {
    expect(parseChatCommand('бежал полчаса')).toEqual({
      type: 'log_cardio', kind: 'run', minutes: 30,
    });
  });

  it('бегал полтора часа → cardio run 90 min', () => {
    expect(parseChatCommand('бегал полтора часа')).toEqual({
      type: 'log_cardio', kind: 'run', minutes: 90,
    });
  });

  it('гулял час → cardio walk 60 min', () => {
    expect(parseChatCommand('гулял час')).toEqual({
      type: 'log_cardio', kind: 'walk', minutes: 60,
    });
  });

  it('погулял полчаса → cardio walk 30 min', () => {
    expect(parseChatCommand('погулял полчаса')).toEqual({
      type: 'log_cardio', kind: 'walk', minutes: 30,
    });
  });

  it('спал полтора часа → log_sleep 1h 30min', () => {
    // "полтора часа" → "90 мин" → SLEEP_MIN_RE picks it as 1h 30min
    expect(parseChatCommand('спал полтора часа')).toEqual({
      type: 'log_sleep', hours: 1, minutes: 30,
    });
  });

  it('спал час → log_sleep 1h 0min', () => {
    expect(parseChatCommand('спал час')).toEqual({
      type: 'log_sleep', hours: 1, minutes: 0,
    });
  });
});

// ═══════════════════════ NL — colloquial verbs / phrasings ════════════════

describe('NL — colloquial workout verbs', () => {
  it('накинь / прибавь / убавь work for adjust', () => {
    expect(parseChatCommand('накинь 5')).toEqual({ type: 'adjust_weight', delta: 5 });
    expect(parseChatCommand('накинь 5 кг')).toEqual({ type: 'adjust_weight', delta: 5 });
    expect(parseChatCommand('прибавь 5 кг')).toEqual({ type: 'adjust_weight', delta: 5 });
    expect(parseChatCommand('убавь 5')).toEqual({ type: 'adjust_weight', delta: -5 });
    expect(parseChatCommand('сними 5 кг')).toEqual({ type: 'adjust_weight', delta: -5 });
  });

  it('закрыл подход / сделал подход → complete_set', () => {
    expect(parseChatCommand('закрыл подход')).toEqual({ type: 'complete_set' });
    expect(parseChatCommand('сделал подход')).toEqual({ type: 'complete_set' });
    expect(parseChatCommand('сделала подход')).toEqual({ type: 'complete_set' });
    expect(parseChatCommand('готово')).toEqual({ type: 'complete_set' });
  });

  it('всё / всё на сегодня → finish_workout', () => {
    expect(parseChatCommand('всё')).toEqual({ type: 'finish_workout' });
    expect(parseChatCommand('всё на сегодня')).toEqual({ type: 'finish_workout' });
    expect(parseChatCommand('закончил тренировку')).toEqual({ type: 'finish_workout' });
  });

  it('дальше / вернись → navigation', () => {
    expect(parseChatCommand('дальше')).toEqual({ type: 'next_exercise' });
    expect(parseChatCommand('вернись')).toEqual({ type: 'prev_exercise' });
  });

  it('ещё один такой же → repeat_last', () => {
    expect(parseChatCommand('ещё один такой же')).toEqual({ type: 'repeat_last' });
    expect(parseChatCommand('ещё один такой')).toEqual({ type: 'repeat_last' });
    expect(parseChatCommand('повтори ещё раз')).toEqual({ type: 'repeat_last' });
  });
});

// ═══════════════════════ NL — body weight phrasings ═══════════════════════

describe('NL — body weight', () => {
  it.each([
    ['утром весил 78', 78],
    ['утром весила 78.5', 78.5],
    ['утром весил 78 кг', 78],
    ['весы показали 78.5', 78.5],
    ['весы показали 78.5 кг', 78.5],
    ['вес сегодня 80', 80],
    ['вес утром 78', 78],
    ['взвесился на 78.2', 78.2],
    ['взвесилась на 65', 65],
  ])('parses "%s" → log_body_weight %f', (input, kg) => {
    expect(parseChatCommand(input)).toEqual({ type: 'log_body_weight', kg });
  });
});

// ═══════════════════════ NL — stats questions ═════════════════════════════

describe('NL — stats questions', () => {
  it.each([
    'как у меня вода',
    'как у меня с водой',
    'как с водой',
    'как вода',
    'вода',
    'вода?',
  ])('%s → stats_water', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'stats_water' });
  });

  it.each([
    'как я ем',
    'как я ем сегодня',
    'как ем',
    'как с едой',
    'сколько калорий',
    'сколько съел',
    'сколько съела',
  ])('%s → stats_meal', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'stats_meal' });
  });

  it.each([
    'мой прогресс',
    'прогресс',
    'статистика',
    'как тренировки',
    'как дела с тренировками',
    'как дела с тренировкой',
  ])('%s → stats_progress', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'stats_progress' });
  });

  it.each([
    'последняя тренировка',
    'что я делал в последний раз',
    'какая была последняя',
  ])('%s → stats_last_workout', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'stats_last_workout' });
  });
});

// ═══════════════════════ NL — meal / recipe verbs ═════════════════════════

describe('NL — meal verbs for recipes', () => {
  it.each([
    ['поел омлет с грибами', 'омлет с грибами'],
    ['позавтракал овсянкой', 'овсянкой'],
    ['пообедал курицей с рисом', 'курицей с рисом'],
    ['поужинал салатом', 'салатом'],
  ])('parses "%s" → add_recipe "%s"', (input, name) => {
    expect(parseChatCommand(input)).toEqual({ type: 'add_recipe', name });
  });
});

// ═══════════════════════ NL — activate / swap ═════════════════════════════

describe('NL — activate program / swap exercise', () => {
  it.each([
    ['включи программу Сила', 'Сила'],
    ['поставь программу Верх Низ', 'Верх Низ'],
    ['запусти программу Кардио', 'Кардио'],
  ])('parses "%s" → activate_program "%s"', (input, name) => {
    expect(parseChatCommand(input)).toEqual({ type: 'activate_program', name });
  });

  it('swap accepts more verbs (поменяй)', () => {
    expect(parseChatCommand('поменяй жим на наклонной')).toEqual({
      type: 'swap_exercise',
      fromName: 'жим',
      toName: 'наклонной',
    });
  });
});

// ═══════════════════════ Negatives — STILL must stay null ═════════════════

describe('Negatives — natural-language false-positive guards', () => {
  it.each([
    '',
    '   ',
    'привет',
    'как дела',
    'когда мне отдохнуть?',
    'подход',
    '+воды',
    'тренировка',
    'спать пора',
    'программа какая лучше',
    'замени',
    'съел',
    // "ок" alone could be ambiguous chat reaction — must NOT match complete_set
    'ок',
    'ага',
    'хорошо',
    // Questions about WHAT to do (not WHAT IS) — must not match stats
    'что мне есть',
    'что попить',
  ])('returns null for %s', (input) => {
    expect(parseChatCommand(input)).toBeNull();
  });
});
