/**
 * AI-chat command parser regression pins.
 *
 * Every command type has positive variants + at least one negative
 * near-miss that MUST stay null. Regex tightening / loosening shows
 * up here first before reaching production.
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

  it('rejects implausible volumes', () => {
    expect(parseChatCommand('+9999 воды')).toBeNull();
  });
});

describe('parseChatCommand — add_set', () => {
  it.each([
    ['добавь подход 100×6', 100, 6],
    ['+подход 100×6', 100, 6],
    ['подход 100 на 6', 100, 6],
    ['подход 100.5×5', 100.5, 5],
    ['подход 100,5×5', 100.5, 5],
  ])('parses %s → add_set %fx%i', (input, weight, reps) => {
    expect(parseChatCommand(input)).toEqual({ type: 'add_set', weight, reps });
  });
});

describe('parseChatCommand — complete_set', () => {
  it.each(['засчитай', 'выполнил', 'сделано', 'done', '+1'])(
    'parses %s as complete_set',
    (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'complete_set' });
    },
  );

  it('does NOT match "сделано неправильно"', () => {
    expect(parseChatCommand('сделано неправильно')).toBeNull();
  });
});

describe('parseChatCommand — adjust_weight + next/prev', () => {
  it('тяжелее → +5, легче → -5', () => {
    expect(parseChatCommand('тяжелее')).toEqual({ type: 'adjust_weight', delta: 5 });
    expect(parseChatCommand('легче')).toEqual({ type: 'adjust_weight', delta: -5 });
  });

  it('next/prev recognized in Russian and English', () => {
    expect(parseChatCommand('next')).toEqual({ type: 'next_exercise' });
    expect(parseChatCommand('следующее упражнение')).toEqual({ type: 'next_exercise' });
    expect(parseChatCommand('prev')).toEqual({ type: 'prev_exercise' });
    expect(parseChatCommand('назад')).toEqual({ type: 'prev_exercise' });
  });
});

describe('parseChatCommand — repeat / remove / finish / cancel', () => {
  it('all four shapes parse', () => {
    expect(parseChatCommand('повтори последний')).toEqual({ type: 'repeat_last' });
    expect(parseChatCommand('убери подход')).toEqual({ type: 'remove_last_set' });
    expect(parseChatCommand('финиш')).toEqual({ type: 'finish_workout' });
    expect(parseChatCommand('отмени тренировку')).toEqual({ type: 'cancel_workout' });
  });
});

// ═══════════════════════ Phase D — set tweaks ═════════════════════════════

describe('parseChatCommand — set_weight / set_reps / set_rest_timer', () => {
  it('set_weight forms', () => {
    expect(parseChatCommand('вес 95')).toEqual({ type: 'set_weight', weight: 95 });
    expect(parseChatCommand('вес 82.5 кг')).toEqual({ type: 'set_weight', weight: 82.5 });
  });

  it('set_reps prefix and suffix forms', () => {
    expect(parseChatCommand('повторов 10')).toEqual({ type: 'set_reps', reps: 10 });
    expect(parseChatCommand('10 повторов')).toEqual({ type: 'set_reps', reps: 10 });
    expect(parseChatCommand('10 раз')).toEqual({ type: 'set_reps', reps: 10 });
  });

  it('set_rest_timer forms', () => {
    expect(parseChatCommand('отдых 90')).toEqual({ type: 'set_rest_timer', seconds: 90 });
    expect(parseChatCommand('пауза 60')).toEqual({ type: 'set_rest_timer', seconds: 60 });
  });

  it('rejects out-of-range rest', () => {
    expect(parseChatCommand('отдых 9999')).toBeNull();
  });
});

// ═══════════════════════ Phase D — targets / cardio / measurements ════════

describe('parseChatCommand — nutrition targets', () => {
  it('calorie + water targets', () => {
    expect(parseChatCommand('цель калорий 2500')).toEqual({
      type: 'set_calories_target', kcal: 2500,
    });
    expect(parseChatCommand('цель воды 3000')).toEqual({
      type: 'set_water_target', ml: 3000,
    });
  });
});

describe('parseChatCommand — cardio', () => {
  it('run / walk / cardio-min', () => {
    expect(parseChatCommand('пробежал 5 км')).toEqual({
      type: 'log_cardio', kind: 'run', km: 5,
    });
    expect(parseChatCommand('прошёл 3 км')).toEqual({
      type: 'log_cardio', kind: 'walk', km: 3,
    });
    expect(parseChatCommand('30 минут кардио')).toEqual({
      type: 'log_cardio', kind: 'cardio', minutes: 30,
    });
  });
});

describe('parseChatCommand — measurements', () => {
  it.each([
    ['талия 80', 'waist', 80],
    ['грудь 110', 'chest', 110],
    ['бицепс 38', 'bicep', 38],
    ['шея 42', 'neck', 42],
  ])('parses %s → %s %i cm', (input, field, cm) => {
    expect(parseChatCommand(input)).toEqual({ type: 'log_measurement', field, cm });
  });
});

// ═══════════════════════ Phase E — meals + sleep + settings + stats ══════

describe('parseChatCommand — log_meal_kcal', () => {
  it.each([
    ['завтрак 400 ккал', 'breakfast', 400],
    ['обед 600 ккал', 'lunch', 600],
    ['ужин 500', 'dinner', 500],
    ['перекус 200', 'snack', 200],
    ['+300 ккал', 'snack', 300],
  ])('parses %s → meal %s %i', (input, mealType, kcal) => {
    expect(parseChatCommand(input)).toEqual({ type: 'log_meal_kcal', mealType, kcal });
  });

  it('rejects implausible kcal', () => {
    expect(parseChatCommand('завтрак 9999 ккал')).toBeNull();
    expect(parseChatCommand('завтрак 5 ккал')).toBeNull();
  });
});

describe('parseChatCommand — reset_water / remove_last_meal', () => {
  it('reset_water variants', () => {
    expect(parseChatCommand('обнули воду')).toEqual({ type: 'reset_water' });
    expect(parseChatCommand('сбрось воду')).toEqual({ type: 'reset_water' });
    expect(parseChatCommand('reset water')).toEqual({ type: 'reset_water' });
  });

  it('remove_last_meal variants', () => {
    expect(parseChatCommand('удали последний приём')).toEqual({ type: 'remove_last_meal' });
    expect(parseChatCommand('минус приём')).toEqual({ type: 'remove_last_meal' });
    expect(parseChatCommand('remove last meal')).toEqual({ type: 'remove_last_meal' });
  });
});

describe('parseChatCommand — log_sleep', () => {
  it('hour-minute form: спал 7 30 → 7h 30min', () => {
    expect(parseChatCommand('спал 7 30')).toEqual({ type: 'log_sleep', hours: 7, minutes: 30 });
  });

  it('integer-hour form: спал 8 → 8h 0min', () => {
    expect(parseChatCommand('спал 8')).toEqual({ type: 'log_sleep', hours: 8, minutes: 0 });
  });

  it('decimal form: спал 7.5 → 7h 30min', () => {
    expect(parseChatCommand('спал 7.5')).toEqual({ type: 'log_sleep', hours: 7, minutes: 30 });
  });

  it('decimal-quarter form: спал 7.25 → 7h 15min', () => {
    expect(parseChatCommand('спал 7,25')).toEqual({ type: 'log_sleep', hours: 7, minutes: 15 });
  });
});

describe('parseChatCommand — theme + notifications + water reminders', () => {
  it('theme modes', () => {
    expect(parseChatCommand('тёмная тема')).toEqual({ type: 'set_theme', mode: 'dark' });
    expect(parseChatCommand('светлая тема')).toEqual({ type: 'set_theme', mode: 'light' });
    expect(parseChatCommand('авто тема')).toEqual({ type: 'set_theme', mode: 'auto' });
    expect(parseChatCommand('dark mode')).toEqual({ type: 'set_theme', mode: 'dark' });
  });

  it('notifications toggle', () => {
    expect(parseChatCommand('уведомления вкл')).toEqual({ type: 'toggle_notifications', enabled: true });
    expect(parseChatCommand('уведомления выкл')).toEqual({ type: 'toggle_notifications', enabled: false });
  });

  it('water reminders toggle', () => {
    expect(parseChatCommand('напоминание воды вкл')).toEqual({ type: 'toggle_water_reminders', enabled: true });
    expect(parseChatCommand('напоминания воды выкл')).toEqual({ type: 'toggle_water_reminders', enabled: false });
  });
});

describe('parseChatCommand — schedule_rest_today', () => {
  it.each(['сегодня отдых', 'выходной сегодня', 'rest day today'])(
    'parses %s', (input) => {
      expect(parseChatCommand(input)).toEqual({ type: 'schedule_rest_today' });
    },
  );
});

describe('parseChatCommand — stats queries (read-only)', () => {
  it('stats_water', () => {
    expect(parseChatCommand('сколько воды')).toEqual({ type: 'stats_water' });
    expect(parseChatCommand('вода?')).toEqual({ type: 'stats_water' });
  });

  it('stats_meal', () => {
    expect(parseChatCommand('сколько калорий')).toEqual({ type: 'stats_meal' });
    expect(parseChatCommand('сколько я съел')).toEqual({ type: 'stats_meal' });
    expect(parseChatCommand('калорий?')).toEqual({ type: 'stats_meal' });
  });

  it('stats_progress', () => {
    expect(parseChatCommand('мой прогресс')).toEqual({ type: 'stats_progress' });
    expect(parseChatCommand('статистика')).toEqual({ type: 'stats_progress' });
    expect(parseChatCommand('stats')).toEqual({ type: 'stats_progress' });
  });

  it('stats_last_workout', () => {
    expect(parseChatCommand('последняя тренировка')).toEqual({ type: 'stats_last_workout' });
    expect(parseChatCommand('last workout')).toEqual({ type: 'stats_last_workout' });
  });
});

// ═══════════════════════ Negatives ═══════════════════════════════════════

describe('parseChatCommand — negatives (must return null)', () => {
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
    'вес какой ставить?',
    'сколько повторов?',
    'много калорий',
    'спать пора',
    'тема какая лучше',
  ])('returns null for %s', (input) => {
    expect(parseChatCommand(input)).toBeNull();
  });
});
