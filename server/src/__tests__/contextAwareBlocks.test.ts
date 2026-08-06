/**
 * Knowledge blocks have to answer the person in front of them.
 *
 * Forty of these functions took user context as parameters and never read it.
 * The caller had looked the data up; the block ignored it and produced the
 * same paragraph for everyone. Some were written as if they personalised and
 * did not — guideIntraWorkoutFuel printed the advice for bulking AND the
 * advice for cutting to the same person, and recommendTrainingSplit chose
 * between options labelled "для новичков" and "для продвинутых" without
 * looking at the level it was handed.
 *
 * These pin the cases where ignoring the context produced something actually
 * wrong, rather than merely generic — a beginner told to progress like an
 * advanced lifter, a dieter told to check their motivation for something that
 * happens by itself, a stretch given a two-minute rest.
 */

import { suggestSupplements, guidePreWorkoutNutrition } from '../ai/knowledge-topics/supplements';
import { shouldSummarizeSession, buildAthleteRoadmap } from '../ai/knowledge-topics/performance';
import { estimateBodyComposition } from '../ai/knowledge-topics/equipment';
import { getMentalPerformanceBoost } from '../ai/knowledge-topics/mindset';
import {
  suggestExerciseProgression,
  recommendTrainingSplit,
  adviseVolumeProgression,
  guideIntraWorkoutFuel,
  suggestWorkoutTemplate,
} from '../ai/knowledge-topics/training';
import { getSmartRestSuggestion, manageConversationFlow } from '../ai/knowledge-topics/misc';

describe('supplement doses follow the body they are for', () => {
  test('a per-kilo dose is worked out for the person', () => {
    const out = suggestSupplements('STRENGTH', 92, true);
    // Caffeine is written as "3-6 мг/кг" — at 92 kg that is 276-552 mg.
    expect(out).toContain('276-552 мг');
  });

  test('without a weight the range is left as written', () => {
    const out = suggestSupplements('STRENGTH', null, true);
    expect(out).toContain('3-6 мг/кг');
    expect(out).not.toMatch(/\d{3}-\d{3} мг \(/);
  });

  test('on a rest day the pre-workout half is marked as not needed', () => {
    expect(suggestSupplements('STRENGTH', 92, false)).toContain('тренировки нет');
    expect(suggestSupplements('STRENGTH', 92, true)).toContain('Сегодня тренировка');
  });
});

describe('advice that used to contradict itself', () => {
  test('intra-workout fuel gives one instruction, not both', () => {
    const cutting = guideIntraWorkoutFuel(90, 'WEIGHT_LOSS', 'что есть во время тренировки');
    expect(cutting).toContain('BCAA');
    expect(cutting).not.toContain('анаболизм');

    const massing = guideIntraWorkoutFuel(90, 'MUSCLE_GAIN', 'что есть во время тренировки');
    expect(massing).toContain('анаболизм');
    expect(massing).not.toContain('BCAA');
  });

  test('with no goal it still says both, since it cannot choose', () => {
    const neither = guideIntraWorkoutFuel(90, null, 'что есть во время тренировки');
    expect(neither).toContain('BCAA');
    expect(neither).toContain('углевод');
  });
});

describe('recommendations match the level they were told about', () => {
  test('a beginner on four days is not handed the advanced option', () => {
    const out = recommendTrainingSplit(4, null, 'beginner');
    expect(out).not.toContain('продвинутый');
  });

  test('an advanced lifter gets the advanced option', () => {
    expect(recommendTrainingSplit(4, null, 'advanced')).toContain('продвинутый');
  });

  test('progression does not offer a beginner a harder variation', () => {
    const beginner = suggestExerciseProgression('Жим лёжа', 'BEGINNER');
    expect(beginner).toContain('Жим гантелей лёжа');
    expect(beginner).toContain('Усложнять рано');

    const advanced = suggestExerciseProgression('Жим лёжа', 'ADVANCED');
    expect(advanced).toContain('сложнее');
  });
});

describe('numbers are read in the light of the goal', () => {
  test('falling volume on a deficit is not treated as lost motivation', () => {
    const cutting = adviseVolumeProgression(5000, 10000, 'WEIGHT_LOSS');
    expect(cutting).not.toContain('мотивацию');
    expect(cutting).toContain('рабочие веса');

    const other = adviseVolumeProgression(5000, 10000, 'STRENGTH');
    expect(other).toContain('мотивацию');
  });

  test('a BMI-based fat estimate warns about itself when the person trains', () => {
    const user = { weightKg: 95, heightCm: 180, gender: 'MALE' };
    const history = [
      { weightKg: 95, date: new Date('2026-08-01') },
      { weightKg: 94, date: new Date('2026-07-01') },
    ];
    expect(estimateBodyComposition(user, history, 16)).toContain('завышает');
    expect(estimateBodyComposition(user, history, 2)).not.toContain('завышает');
  });
});

describe('blocks stay quiet when they would be noise', () => {
  test('no session summary is offered mid-logging', () => {
    expect(shouldSummarizeSession(20, 'data_logging')).toBe('');
    expect(shouldSummarizeSession(20, 'general')).not.toBe('');
  });

  test('"устал" while logging a set is not a cry for help', () => {
    const logging = getMentalPerformanceBoost('устал, но добил 100 на 8', 'data_logging');
    expect(logging).toBe('');

    const venting = getMentalPerformanceBoost('устал, не хочу идти', 'general');
    expect(venting).not.toBe('');
  });

  test('the topic being asked about right now is not called overused', () => {
    const said = [
      'Белок считай по 1.6 г на кг',
      'Калорийность держи в дефиците',
      'Питание важнее тренировок для веса',
    ];
    // Three nutrition answers in a row, and the person asks about nutrition
    // again — telling the model not to repeat the topic answers the wrong
    // question.
    expect(manageConversationFlow(said, 'nutrition_query')).toBe('');
    expect(manageConversationFlow(said, 'technique_question')).toContain('nutrition');
  });
});

describe('rest suggestions respect what is being done', () => {
  test('a stretch does not get a barbell rest', () => {
    const r = getSmartRestSuggestion('flexibility', 'bodyweight', 'normal', null, 'STRENGTH');
    expect(r.restSeconds).toBeLessThanOrEqual(30);
  });

  test('a cardio interval rests by heart rate, not by strength rules', () => {
    const r = getSmartRestSuggestion('cardio', 'machine', 'normal', null, 'STRENGTH');
    expect(r.restSeconds).toBe(60);
    expect(r.reason).toContain('пульс');
  });

  test('strength work still gets its long rest', () => {
    const r = getSmartRestSuggestion('strength', 'barbell', 'normal', null, 'STRENGTH');
    expect(r.restSeconds).toBeGreaterThanOrEqual(180);
  });
});

describe('templates use what they were told is available', () => {
  test('dumbbells only does not answer with barbell work', () => {
    const out = suggestWorkoutTemplate(40, ['спина'], 'гантели');
    expect(out).toContain('гантел');
    expect(out).toContain('спина');
  });

  test('no equipment given, no equipment line', () => {
    expect(suggestWorkoutTemplate(40, [], '')).not.toContain('Инвентарь');
  });
});

describe('the roadmap notices a level that outruns the mileage', () => {
  test('40 workouts and "advanced" is called out', () => {
    const out = buildAthleteRoadmap(40, 'advanced', 'STRENGTH', 20);
    expect(out).toContain('уровень указан выше');
  });

  test('300 workouts and "advanced" is not', () => {
    expect(buildAthleteRoadmap(320, 'advanced', 'STRENGTH', 100)).not.toContain('уровень указан выше');
  });

  test('the next stage is described in terms of the goal', () => {
    expect(buildAthleteRoadmap(40, 'beginner', 'WEIGHT_LOSS', 20)).toContain('силовые');
  });
});

describe('pre-workout timing advice knows the goal', () => {
  test('morning training on a cut is told the truth about fasted cardio', () => {
    const out = guidePreWorkoutNutrition('питание перед тренировкой', 7, 'WEIGHT_LOSS');
    expect(out).toContain('натощак');
    expect(out).toContain('дефицит');
  });

  test('morning training on a bulk is told not to go fasted', () => {
    const out = guidePreWorkoutNutrition('питание перед тренировкой', 7, 'MUSCLE_GAIN');
    expect(out).toContain('не тренируйся');
  });

  test('the duplicated macro table is gone', () => {
    // getPreWorkoutMealPlan covers macros and is goal-aware; both blocks match
    // "питание перед", so one question used to emit two near-identical tables.
    const out = guidePreWorkoutNutrition('питание перед тренировкой', 19, null);
    expect(out).not.toContain('За 2-3 часа');
  });
});
