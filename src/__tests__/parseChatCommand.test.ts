/**
 * AI-chat command parser regression pins.
 *
 * Locking the parser's positive + negative matches. Regression-prone
 * because regex changes can quietly:
 *  - swallow regular chat ("когда мне отдохнуть?" → false positive)
 *  - drop legitimate user phrasing ("выпил 500 мл" → no match)
 *
 * Every command type has at least one positive case and one near-miss
 * negative case so regex tightening/loosening shows up here first.
 */
import { parseChatCommand } from '../screens/ai/parseChatCommand';

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

  it('rejects implausible volumes (>5000ml is almost certainly a typo)', () => {
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
  it.each([
    'засчитай подход',
    'засчитай',
    'выполнил',
    'сделано',
    'done',
    'Done',
    '+1',
    '+ 1',
  ])('parses %s as complete_set', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'complete_set' });
  });

  it('does NOT match "сделано неправильно"', () => {
    // Off-topic message containing "done" / "сделано" mid-sentence must
    // fall through to the server AI — not snap to a complete_set action.
    expect(parseChatCommand('сделано неправильно')).toBeNull();
  });
});

describe('parseChatCommand — adjust_weight', () => {
  it.each([
    'сделай тяжелее',
    'тяжелее',
    '+5кг',
    '+5 кг',
    'harder',
  ])('parses %s as adjust +5', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'adjust_weight', delta: 5 });
  });

  it.each([
    'сделай легче',
    'легче',
    '-5кг',
    '-5 кг',
    'easier',
  ])('parses %s as adjust -5', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'adjust_weight', delta: -5 });
  });
});

describe('parseChatCommand — next_exercise', () => {
  it.each([
    'следующее упражнение',
    'следующая упражнение', // typo, but common
    'next',
    'next exercise',
    'след упр',
    'след. упр.',
  ])('parses %s as next_exercise', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'next_exercise' });
  });
});

describe('parseChatCommand — repeat_last', () => {
  it.each([
    'повтори последний',
    'повтор последний',
    'repeat last',
  ])('parses %s as repeat_last', (input) => {
    expect(parseChatCommand(input)).toEqual({ type: 'repeat_last' });
  });
});

describe('parseChatCommand — negative cases (must return null)', () => {
  it.each([
    // Empty / whitespace
    '',
    '   ',
    // Free-form questions that should reach the AI
    'привет',
    'как дела',
    'какой подход следующий?',
    'что мне есть на ужин',
    'когда мне отдохнуть?',
    // Almost-commands that are too ambiguous to act on
    'подход',
    '+воды',
    'тренировка',
  ])('returns null for %s', (input) => {
    expect(parseChatCommand(input)).toBeNull();
  });
});
