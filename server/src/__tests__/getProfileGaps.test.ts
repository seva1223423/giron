/**
 * Unit tests for getProfileGaps (round 164).
 *
 * The function returns a sorted list of profile gaps with priorities
 * 1-10. Higher priority = ask sooner. Drives the AI's "Гордись своим
 * прогрессом! Сколько ты весишь?" prompts.
 *
 * Untested for ~50+ rounds — pinning the priority order and the gap
 * detection logic.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    aIMemory: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { getProfileGaps } from '../routes/ai';

const COMPLETE_USER = {
  weightKg: 75,
  heightCm: 180,
  goal: 'WEIGHT_LOSS',
  fitnessLevel: 'INTERMEDIATE',
  dateOfBirth: new Date('1995-01-15'),
  gender: 'MALE',
  trainingExperienceYears: 3,
};

describe('getProfileGaps — happy path', () => {
  test('returns empty list for complete user', () => {
    expect(getProfileGaps(COMPLETE_USER)).toEqual([]);
  });

  test('returns empty list for null user (edge case)', () => {
    expect(getProfileGaps(null)).toEqual([]);
  });
});

describe('getProfileGaps — single gap detection', () => {
  test('missing weightKg → ВЕС gap (priority 10)', () => {
    const gaps = getProfileGaps({ ...COMPLETE_USER, weightKg: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('вес');
    expect(gaps[0].priority).toBe(10);
  });

  test('missing heightCm → РОСТ gap (priority 9)', () => {
    const gaps = getProfileGaps({ ...COMPLETE_USER, heightCm: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('рост');
  });

  test('missing goal → ЦЕЛЬ gap (priority 10)', () => {
    const gaps = getProfileGaps({ ...COMPLETE_USER, goal: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('цель');
  });

  test('missing fitnessLevel → УРОВЕНЬ gap', () => {
    const gaps = getProfileGaps({ ...COMPLETE_USER, fitnessLevel: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('уровень');
  });

  test('missing trainingExperienceYears → СТАЖ gap (lowest priority)', () => {
    const gaps = getProfileGaps({ ...COMPLETE_USER, trainingExperienceYears: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].field).toBe('стаж');
    expect(gaps[0].priority).toBe(4);
  });
});

describe('getProfileGaps — priority ordering', () => {
  test('multiple gaps sorted by priority desc (high → low)', () => {
    const gaps = getProfileGaps({
      ...COMPLETE_USER,
      weightKg: null, // priority 10
      gender: null,   // priority 6
      heightCm: null, // priority 9
      trainingExperienceYears: null, // priority 4
    });
    expect(gaps.length).toBe(4);
    // Priority should be monotonically non-increasing.
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i].priority).toBeLessThanOrEqual(gaps[i - 1].priority);
    }
    expect(gaps[0].field).toBe('вес'); // 10
    expect(gaps[gaps.length - 1].field).toBe('стаж'); // 4
  });

  test('all 7 gaps when user is fully empty', () => {
    const empty = {
      weightKg: null,
      heightCm: null,
      goal: null,
      fitnessLevel: null,
      dateOfBirth: null,
      gender: null,
      trainingExperienceYears: null,
    };
    const gaps = getProfileGaps(empty);
    expect(gaps).toHaveLength(7);
    // First gap has priority 10 (вес or цель — both at 10).
    expect(gaps[0].priority).toBe(10);
  });
});

describe('getProfileGaps — boundary properties', () => {
  test('every returned gap has non-empty question', () => {
    const empty = {
      weightKg: null, heightCm: null, goal: null, fitnessLevel: null,
      dateOfBirth: null, gender: null, trainingExperienceYears: null,
    };
    for (const gap of getProfileGaps(empty)) {
      expect(gap.question.length).toBeGreaterThan(10);
    }
  });

  test('every gap has unique field name', () => {
    const empty = {
      weightKg: null, heightCm: null, goal: null, fitnessLevel: null,
      dateOfBirth: null, gender: null, trainingExperienceYears: null,
    };
    const fields = getProfileGaps(empty).map((g) => g.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  test('priorities are in [1, 10] range', () => {
    const empty = {
      weightKg: null, heightCm: null, goal: null, fitnessLevel: null,
      dateOfBirth: null, gender: null, trainingExperienceYears: null,
    };
    for (const gap of getProfileGaps(empty)) {
      expect(gap.priority).toBeGreaterThanOrEqual(1);
      expect(gap.priority).toBeLessThanOrEqual(10);
    }
  });
});
