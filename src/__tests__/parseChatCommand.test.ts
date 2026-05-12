/**
 * AI-chat command parser regression pins.
 *
 * Locks positive + negative matches for every recognized command.
 * Regex changes can quietly swallow regular chat ("когда мне отдохнуть?"
 * → false positive) or drop legitimate user phrasing ("выпил 500 мл"
 * → no match). Every command type has at least one positive case and
 * one near-miss negative case.
 */
import { parseChatCommand } from '../screens/ai/parseChatCommand';

// ═══════════════════════ Phase A — core ═══════════════════════════════════

describe('parseChatCommand — water', () => {
  it.each([
    ['+250 воды', 250],
    ['+ 250 мл', 250],
    ['выпил 500 мл', 500],
    ['выпила 500 мл воды', 500],
    ['добавь 300 воды', 300],
    ['добавил 300', 300],
    ['вода 250', 250],
    ['+1000', 1000],
  ])('parses %s → add_water %i', (input, ml) => {
    expect(parseChatCommand(input)).toEqual({ type: 'add_water', ml });
  });

  it('rejects implausible volumes (>5000ml)', () => {
    expect(parseChatCommand('+9999 воды')).toBeNull();
  });

  it('rejects zero', () => {
    expect(parseChatCommand('+0 воды')).toBeNull();
  });
});

describe('parseChatCommand — add_set', () => {
  it.each([
    ['добавь подход 100×6', 100, 6],
    ['+подход 100×6', 100, 6],
    ['подход 100 на 6', 100, 6],
    ['подход 100x6', 100, 6],
    ['подход 100.5×5', 100.5, 5],
    ['подход 100,5×5', 100.5, 5],
    ['добавь подход 80 на 10', 80, 10],
  ])('parses %s → add_set %fx%i', (input, weight, reps) => {
    expect(parseChatCommand(input)).toEqual({ type: 'add_set', weight, reps });
  });

  it('rejects unrealistic weight (>500 kg)', () => {
    expect(parseChatCommand('подход 999×5')).toBeNull();
  });

  it('rejects 0 reps', () => {
    expect(parseChatCommand('подход 100×0')).toBeNull();
  });
});

describe('parseChatCommand — complete_set', () => {
  it.each(['засчитай подход', 'засчитай', 'выполнил', 'сделано', 'done', 'Done', '+1', '+ 1'])(
    'parses %s as complete_set',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'complete_set' });
    },
  );

  it('does NOT match "сделано неправильно"', () => {
    expect(parseChatCommand('сделано неправильно')).toBeNull();
  });
});

describe('parseChatCommand — adjust_weight', () => {
  it.each(['сделай тяжелее', 'тяжелее', '+5кг', '+5 кг', 'harder'])(
    'parses %s as adjust +5',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'adjust_weight', delta: 5 });
    },
  );

  it.each(['сделай легче', 'легче', '-5кг', '-5 кг', 'easier'])(
    'parses %s as adjust -5',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'adjust_weight', delta: -5 });
    },
  );
});

describe('parseChatCommand — next_exercise / prev_exercise', () => {
  it.each(['следующее упражнение', 'next', 'next exercise', 'след упр', 'след. упр.'])(
    'parses %s as next_exercise',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'next_exercise' });
    },
  );

  it.each(['предыдущее упражнение', 'prev', 'previous exercise', 'назад', 'пред упр'])(
    'parses %s as prev_exercise',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'prev_exercise' });
    },
  );
});

describe('parseChatCommand — repeat_last', () => {
  it.each(['повтори последний', 'повтор последний', 'repeat last'])(
    'parses %s as repeat_last',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'repeat_last' });
    },
  );
});

// ═══════════════════════ Phase D — set tweaks ═════════════════════════════

describe('parseChatCommand — remove_last_set', () => {
  it.each([
    'убери подход',
    'удали подход',
    'удали последний подход',
    'минус подход',
    'remove set',
    'remove last set',
    'undo set',
  ])('parses %s as remove_last_set', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'remove_last_set' });
  });
});

describe('parseChatCommand — finish_workout / cancel_workout', () => {
  it.each(['закончить тренировку', 'финиш', 'finish workout'])(
    'parses %s as finish_workout',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'finish_workout' });
    },
  );

  it.each(['отмени тренировку', 'отменить тренировку', 'cancel workout'])(
    'parses %s as cancel_workout',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'cancel_workout' });
    },
  );
});

describe('parseChatCommand — set_weight', () => {
  it.each([
    ['вес 95', 95],
    ['вес 95 кг', 95],
    ['weight 100', 100],
    ['вес 82.5', 82.5],
    ['вес 82,5 кг', 82.5],
  ])('parses %s → set_weight %f', (input, weight) => {
    expect(parseChatCommand(input)).toEqual({ type: 'set_weight', weight });
  });

  it('rejects out-of-range weight', () => {
    expect(parseChatCommand('вес 999')).toBeNull();
  });
});

describe('parseChatCommand — set_reps', () => {
  it.each([
    ['повторов 10', 10],
    ['повторов 10 раз', 10],
    ['повторы 8', 8],
    ['10 повторов', 10],
    ['10 повторений', 10],
    ['10 раз', 10],
    ['reps 12', 12],
  ])('parses %s → set_reps %i', (input, reps) => {
    expect(parseChatCommand(input)).toEqual({ type: 'set_reps', reps });
  });
});

describe('parseChatCommand — set_rest_timer', () => {
  it.each([
    ['отдых 90', 90],
    ['отдых 90 сек', 90],
    ['пауза 60', 60],
    ['rest 120', 120],
  ])('parses %s → set_rest_timer %i', (input, seconds) => {
    expect(parseChatCommand(input)).toEqual({ type: 'set_rest_timer', seconds });
  });

  it('rejects unrealistic duration (<5s or >600s)', () => {
    expect(parseChatCommand('отдых 2')).toBeNull();
    expect(parseChatCommand('отдых 9999')).toBeNull();
  });
});

// ═══════════════════════ Phase D — targets ════════════════════════════════

describe('parseChatCommand — calorie / water targets', () => {
  it.each([
    ['цель калорий 2500', 2500],
    ['цель калорий 2500 ккал', 2500],
    ['target calories 3000', 3000],
  ])('parses %s → set_calories_target %i', (input, kcal) => {
    expect(parseChatCommand(input)).toEqual({ type: 'set_calories_target', kcal });
  });

  it.each([
    ['цель воды 3000', 3000],
    ['цель воды 3000 мл', 3000],
    ['water target 2500', 2500],
  ])('parses %s → set_water_target %i', (input, ml) => {
    expect(parseChatCommand(input)).toEqual({ type: 'set_water_target', ml });
  });

  it('rejects unrealistic kcal targets', () => {
    expect(parseChatCommand('цель калорий 100')).toBeNull(); // too low
    expect(parseChatCommand('цель калорий 99999')).toBeNull(); // too high
  });
});

// ═══════════════════════ Phase D — cardio ══════════════════════════════════

describe('parseChatCommand — log_cardio', () => {
  it('parses "пробежал 5 км" as run with distance', () => {
    expect(parseChatCommand('пробежал 5 км')).toEqual({
      type: 'log_cardio',
      kind: 'run',
      km: 5,
    });
  });

  it('parses "прошёл 3 км" as walk with distance', () => {
    expect(parseChatCommand('прошёл 3 км')).toEqual({
      type: 'log_cardio',
      kind: 'walk',
      km: 3,
    });
  });

  it('parses "пешком 2 км" as walk', () => {
    expect(parseChatCommand('пешком 2 км')).toEqual({
      type: 'log_cardio',
      kind: 'walk',
      km: 2,
    });
  });

  it('parses "30 минут кардио" as duration-only cardio', () => {
    expect(parseChatCommand('30 минут кардио')).toEqual({
      type: 'log_cardio',
      kind: 'cardio',
      minutes: 30,
    });
  });

  it('accepts decimal km', () => {
    expect(parseChatCommand('пробежал 5.5 км')).toEqual({
      type: 'log_cardio',
      kind: 'run',
      km: 5.5,
    });
  });
});

// ═══════════════════════ Phase D — measurements ═══════════════════════════

describe('parseChatCommand — log_measurement', () => {
  it.each([
    ['талия 80', 'waist', 80],
    ['талия 80 см', 'waist', 80],
    ['грудь 110', 'chest', 110],
    ['бицепс 38', 'bicep', 38],
    ['шея 42', 'neck', 42],
    ['бедра 95', 'hips', 95],
    ['бедро 60', 'thigh', 60],
    ['икра 38', 'calf', 38],
    ['waist 75', 'waist', 75],
    ['chest 100.5', 'chest', 100.5],
  ])('parses %s → log_measurement %s %f', (input, field, cm) => {
    expect(parseChatCommand(input)).toEqual({ type: 'log_measurement', field, cm });
  });

  it('rejects out-of-range cm', () => {
    expect(parseChatCommand('талия 5')).toBeNull();
    expect(parseChatCommand('талия 999')).toBeNull();
  });
});

// ═══════════════════════ Negatives ═══════════════════════════════════════

describe('parseChatCommand — negative cases (must return null)', () => {
  it.each([
    '',
    '   ',
    'привет',
    'как дела',
    'какой подход следующий?',
    'что мне есть на ужин',
    'когда мне отдохнуть?',
    'подход',
    '+воды',
    'тренировка',
    // Near-miss cases for new patterns
    'вес какой ставить?',
    'сколько повторов?',
    'отдых?',
    'много калорий',
  ])('returns null for %s', (input) => {
    expect(parseChatCommand(input)).toBeNull();
  });
});
