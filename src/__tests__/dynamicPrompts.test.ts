/**
 * Quick prompts should ask the question the person ought to be asking.
 *
 * The old builder knew one domain: it offered to analyse a workout while
 * protein sat 40 grams behind at eight in the evening and last night's sleep
 * was five hours — data from stores one import away. These pin the
 * cross-domain chips, their thresholds, and the cases where they must NOT
 * appear, because a nagging chip at noon teaches the person to ignore all of
 * them.
 */

import { buildDynamicPrompts, type PromptInputs } from '../screens/ai/components/buildDynamicPrompts';

const NOW = new Date('2026-08-07T20:00:00');

const base: PromptInputs = {
  workoutHistory: [],
  activeProgram: null,
  todayNutrition: null,
  lastSleepHours: null,
  hour: 20,
  now: NOW,
};

const texts = (inp: PromptInputs) => buildDynamicPrompts(inp).map((p) => p.text);

describe('protein gap in the evening', () => {
  test('far behind at 20:00 — the chip names the exact grams left', () => {
    const t = texts({
      ...base,
      todayNutrition: { proteinEaten: 50, proteinTarget: 160, mealsCount: 2 },
    });
    expect(t).toContain('Чем добрать 110 г белка сегодня вечером?');
  });

  test('the same gap at noon stays silent — the day is not over', () => {
    const t = texts({
      ...base,
      hour: 12,
      todayNutrition: { proteinEaten: 50, proteinTarget: 160, mealsCount: 2 },
    });
    expect(t.some((x) => x.includes('добрать'))).toBe(false);
  });

  test('close enough to target — no nagging', () => {
    const t = texts({
      ...base,
      todayNutrition: { proteinEaten: 120, proteinTarget: 160, mealsCount: 3 },
    });
    expect(t.some((x) => x.includes('добрать'))).toBe(false);
  });

  test('no target set — nothing to be behind on', () => {
    const t = texts({
      ...base,
      todayNutrition: { proteinEaten: 0, proteinTarget: 0, mealsCount: 0 },
    });
    expect(t.some((x) => x.includes('добрать'))).toBe(false);
  });
});

describe('short sleep', () => {
  test('five hours suggests adjusting, not cancelling', () => {
    const t = texts({ ...base, lastSleepHours: 5 });
    expect(t).toContain('Спал 5 ч — как скорректировать сегодняшнюю тренировку?');
  });

  test('a decimal renders with a comma, as Russian reads it', () => {
    const t = texts({ ...base, lastSleepHours: 5.5 });
    expect(t).toContain('Спал 5,5 ч — как скорректировать сегодняшнюю тренировку?');
  });

  test('a normal night raises nothing', () => {
    const t = texts({ ...base, lastSleepHours: 7.5 });
    expect(t.some((x) => x.includes('скорректировать'))).toBe(false);
  });

  test('an unlogged night raises nothing — no data is not short sleep', () => {
    const t = texts({ ...base, lastSleepHours: null });
    expect(t.some((x) => x.includes('скорректировать'))).toBe(false);
  });
});

describe('empty diary in the evening', () => {
  test('nothing logged by 19:00 offers reconstruction', () => {
    const t = texts({
      ...base,
      hour: 19,
      todayNutrition: { proteinEaten: 0, proteinTarget: 160, mealsCount: 0 },
    });
    expect(t).toContain('Помоги записать, что я сегодня ел');
  });

  test('meals logged — no reconstruction chip', () => {
    const t = texts({
      ...base,
      hour: 19,
      todayNutrition: { proteinEaten: 90, proteinTarget: 160, mealsCount: 2 },
    });
    expect(t).not.toContain('Помоги записать, что я сегодня ел');
  });
});

describe('the workout prompts survive unchanged', () => {
  test('last workout analysis and no-program suggestion still appear', () => {
    const t = texts({
      ...base,
      workoutHistory: [{ name: 'Грудь', completedAt: '2026-08-06T10:00:00Z' }],
    });
    expect(t).toContain('Разбери мою последнюю тренировку: Грудь');
    expect(t.some((x) => x.includes('Толчок-Тяга-Ноги'))).toBe(true);
  });
});

describe('ordering and cap', () => {
  test('data-driven chips come before generic ones', () => {
    const t = texts({
      ...base,
      lastSleepHours: 5,
      todayNutrition: { proteinEaten: 40, proteinTarget: 160, mealsCount: 1 },
      workoutHistory: [{ name: 'Спина', completedAt: '2026-08-06T10:00:00Z' }],
    });
    const protein = t.findIndex((x) => x.includes('добрать'));
    const generic = t.findIndex((x) => x.includes('Разбери'));
    expect(protein).toBeGreaterThanOrEqual(0);
    expect(protein).toBeLessThan(generic);
  });

  test('never more than six chips', () => {
    const t = texts({
      ...base,
      lastSleepHours: 5,
      todayNutrition: { proteinEaten: 40, proteinTarget: 160, mealsCount: 0 },
      hour: 20,
      activeProgram: { name: 'ППЛ', workouts: [{ name: 'Push' }, { name: 'Pull' }] },
      workoutHistory: [
        { name: 'А', completedAt: '2026-08-07T10:00:00' },
        { name: 'Б', completedAt: '2026-08-06T10:00:00' },
        { name: 'В', completedAt: '2026-08-05T10:00:00' },
      ],
    });
    expect(t.length).toBeLessThanOrEqual(6);
  });
});
