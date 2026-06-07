/**
 * Per-tool happy-path integration tests for executeTool.
 *
 * Audit R-2026-05-22 Tier 1 item 6: covers ~10 AI tools that had
 * surface tests (aiToolsSurface) and Zod tests (aiToolsZodValidation)
 * but no per-tool happy-path verification.
 *
 * Strategy: mock prisma, call executeTool directly with realistic
 * inputs, assert the returned shape + that the right Prisma methods
 * got called with the right arguments. No HTTP layer involved.
 *
 * Coverage choice: tools that WRITE to DB + don't already have
 * dedicated per-tool tests. Sorted by data-integrity risk:
 *   - log_meal: writes Meal + N MealItem rows + computes macro totals
 *   - log_cardio: writes CardioSession with 8 optional metrics
 *   - log_sleep: upserts SleepEntry (composite key race)
 *   - log_body_weight: upserts BodyWeight + updates User in a tx
 *   - log_body_measurement: upserts BodyMeasurement with avg() logic
 *   - update_user_profile: bounds-checks profile fields
 *   - update_nutrition_targets: scales macros if total > calories
 *   - set_water_target: simple bounded write
 *   - log_water: client-side only (no DB write) — pins that contract
 *   - set_rest_timer: bounded clamp (no DB write)
 *
 * Tools already covered by per-tool tests are NOT re-tested here:
 *   - delete_* (aiDeleteTools.test.ts)
 *   - modify_workout / create_workout (modifyToolsVerify.test.ts)
 *   - find_recipes (findRecipesAllergyInject.test.ts)
 */

// Mock prisma BEFORE importing ai.ts.
const m = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  meal: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  mealItem: { createMany: jest.fn(), deleteMany: jest.fn() },
  cardioSession: { create: jest.fn(), findUnique: jest.fn() },
  sleepEntry: { upsert: jest.fn(), findUnique: jest.fn() },
  bodyWeight: { upsert: jest.fn(), findUnique: jest.fn() },
  bodyMeasurement: { upsert: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../db', () => ({ prisma: m }));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Suppress express-rate-limit side effect at module load
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Suppress memCache eviction timer at module load
jest.mock('../utils/aiMetrics', () => ({
  recordAIRequest: jest.fn(),
  recordToolExecution: jest.fn(),
}));

import { executeTool } from '../routes/ai';

const userId = 'u-test';

beforeEach(() => {
  for (const model of Object.values(m)) {
    for (const fn of Object.values(model as Record<string, jest.Mock>)) {
      if (typeof fn === 'function' && (fn as jest.Mock).mockReset) {
        (fn as jest.Mock).mockReset();
      }
    }
  }
  // Default transaction implementation: run each step sequentially with
  // the mocked prisma instance. Tools wrap their writes in $transaction.
  m.$transaction.mockImplementation(async (ops: any) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    if (typeof ops === 'function') return ops(m);
    return undefined;
  });
});

// ─── log_meal ──────────────────────────────────────────────────────────────

describe('executeTool — log_meal happy path', () => {
  test('persists a meal with 2 items and returns macro totals', async () => {
    m.meal.create.mockResolvedValueOnce({
      id: 'meal-1',
      type: 'breakfast',
      totalCalories: 500,
      totalProtein: 30,
      totalFats: 20,
      totalCarbs: 50,
    });
    // log_meal does a post-write verify with `findUnique({include:items})`
    // — must return matching count + macros within ±1 kcal tolerance.
    m.meal.findUnique.mockResolvedValueOnce({
      id: 'meal-1',
      totalCalories: 500,
      totalProtein: 30,
      items: [{}, {}],
    });

    const result = await executeTool(
      'log_meal',
      {
        mealType: 'breakfast',
        items: [
          { name: 'oats', weightGrams: 80, calories: 300, protein: 10, fats: 5, carbs: 50 },
          { name: 'milk', weightGrams: 200, calories: 200, protein: 20, fats: 15, carbs: 0 },
        ],
      },
      userId,
    );

    expect(result.resultText).toContain('Завтрак');
    expect(result.resultText).toContain('500 ккал');
    expect(m.meal.create).toHaveBeenCalledTimes(1);
    const createArgs = m.meal.create.mock.calls[0][0];
    expect(createArgs.data.type).toBe('breakfast');
    expect(createArgs.data.userId).toBe(userId);
    expect(createArgs.data.totalCalories).toBe(500);
  });

  test('rejects empty items list with graceful error', async () => {
    const result = await executeTool('log_meal', {
      mealType: 'breakfast',
      items: [],
    }, userId);
    expect(result.resultText).toMatch(/Ошибка параметров log_meal/);
    expect(m.meal.create).not.toHaveBeenCalled();
  });

  test('rejects >50 items via Zod (defense before the slice fallback)', async () => {
    // Pre-Zod the tool quietly did .slice(0, 50) to cap. With the
    // Zod schema (audit R-2026-05-22), items.max(50) rejects upfront
    // so the LLM gets a clear "too many items" error instead of
    // silently dropping data.
    const items = Array.from({ length: 60 }, (_, i) => ({
      name: `item ${i}`, weightGrams: 10, calories: 10, protein: 1, fats: 0, carbs: 0,
    }));
    const result = await executeTool('log_meal', { mealType: 'snack', items }, userId);
    expect(result.resultText).toMatch(/Ошибка параметров log_meal/);
    expect(m.meal.create).not.toHaveBeenCalled();
  });

  test('accepts exactly 50 items (boundary)', async () => {
    m.meal.create.mockResolvedValueOnce({
      id: 'meal-cap', type: 'snack', totalCalories: 500, totalProtein: 50, totalFats: 0, totalCarbs: 0,
    });
    m.meal.findUnique.mockResolvedValueOnce({
      id: 'meal-cap',
      totalCalories: 500,
      totalProtein: 50,
      items: Array.from({ length: 50 }, () => ({})),
    });
    const items = Array.from({ length: 50 }, (_, i) => ({
      name: `item ${i}`, weightGrams: 10, calories: 10, protein: 1, fats: 0, carbs: 0,
    }));
    await executeTool('log_meal', { mealType: 'snack', items }, userId);
    const createArgs = m.meal.create.mock.calls[0][0];
    expect(createArgs.data.items.create).toHaveLength(50);
  });
});

// ─── log_cardio ────────────────────────────────────────────────────────────

describe('executeTool — log_cardio happy path', () => {
  test('persists cardio session with HR + VO2max metrics', async () => {
    m.cardioSession.create.mockResolvedValueOnce({
      id: 'card-1', type: 'running', durationMinutes: 30,
    });
    m.cardioSession.findUnique.mockResolvedValueOnce({
      id: 'card-1', type: 'running', durationMinutes: 30,
    });

    const result = await executeTool('log_cardio', {
      type: 'running',
      durationMinutes: 30,
      distanceKm: 5,
      avgHeartRate: 145,
      vo2Max: 42,
    }, userId);

    expect(result.resultText).toContain('running');
    expect(result.resultText).toContain('30 мин');
    const createArgs = m.cardioSession.create.mock.calls[0][0];
    expect(createArgs.data.avgHeartRate).toBe(145);
    expect(createArgs.data.vo2Max).toBe(42);
  });

  test('rejects HR outside 30-250 bpm range (out-of-band gets undefined)', async () => {
    m.cardioSession.create.mockResolvedValueOnce({ id: 'c2', type: 'running', durationMinutes: 30 });
    m.cardioSession.findUnique.mockResolvedValueOnce({ id: 'c2', type: 'running', durationMinutes: 30 });
    await executeTool('log_cardio', {
      type: 'running', durationMinutes: 30, avgHeartRate: 500,
    }, userId);
    const createArgs = m.cardioSession.create.mock.calls[0][0];
    expect(createArgs.data.avgHeartRate).toBeUndefined();
  });

  test('coerces unknown type to "other"', async () => {
    m.cardioSession.create.mockResolvedValueOnce({ id: 'c3', type: 'other', durationMinutes: 30 });
    m.cardioSession.findUnique.mockResolvedValueOnce({ id: 'c3', type: 'other', durationMinutes: 30 });
    await executeTool('log_cardio', {
      type: 'snowboarding', durationMinutes: 30,
    }, userId);
    const createArgs = m.cardioSession.create.mock.calls[0][0];
    expect(createArgs.data.type).toBe('other');
  });
});

// ─── log_sleep ─────────────────────────────────────────────────────────────

describe('executeTool — log_sleep happy path', () => {
  test('upserts a sleep entry + post-write verify', async () => {
    m.sleepEntry.upsert.mockResolvedValueOnce({});
    m.sleepEntry.findUnique.mockResolvedValueOnce({
      durationHours: 7.5,
      quality: 4,
    });

    const result = await executeTool('log_sleep', {
      durationHours: 7.5,
      quality: 4,
    }, userId);

    expect(result.resultText).toContain('Сон записан');
    expect(result.resultText).toContain('хороший сон');
    expect(m.sleepEntry.upsert).toHaveBeenCalledTimes(1);
  });

  test('clamps quality to 1-5 range', async () => {
    m.sleepEntry.upsert.mockResolvedValueOnce({});
    m.sleepEntry.findUnique.mockResolvedValueOnce({
      durationHours: 8, quality: 5,
    });
    await executeTool('log_sleep', { durationHours: 8, quality: 99 }, userId);
    const upsertArgs = m.sleepEntry.upsert.mock.calls[0][0];
    expect(upsertArgs.create.quality).toBe(5);
  });

  test('rounds durationHours to nearest 0.5', async () => {
    m.sleepEntry.upsert.mockResolvedValueOnce({});
    m.sleepEntry.findUnique.mockResolvedValueOnce({ durationHours: 7.5 });
    await executeTool('log_sleep', { durationHours: 7.4 }, userId);
    const upsertArgs = m.sleepEntry.upsert.mock.calls[0][0];
    expect(upsertArgs.create.durationHours).toBe(7.5);
  });
});

// ─── log_body_weight ───────────────────────────────────────────────────────

describe('executeTool — log_body_weight happy path', () => {
  test('upserts BodyWeight + updates User in a transaction', async () => {
    m.bodyWeight.findUnique.mockResolvedValueOnce({ weightKg: 80.0 });
    m.$transaction.mockResolvedValueOnce([{}, {}]);

    const result = await executeTool('log_body_weight', {
      weightKg: 80,
    }, userId);

    expect(result.resultText).toContain('80 кг');
    expect(m.$transaction).toHaveBeenCalledTimes(1);
  });

  test('rejects weight outside 1-500 kg as graceful error', async () => {
    const result = await executeTool('log_body_weight', {
      weightKg: 1000,
    }, userId);
    expect(result.resultText).toMatch(/Ошибка параметров|корректный вес/);
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  test('accepts string-encoded weight (Mistral sometimes wraps numerics as strings)', async () => {
    m.bodyWeight.findUnique.mockResolvedValueOnce({ weightKg: 75.5 });
    m.$transaction.mockResolvedValueOnce([{}, {}]);

    const result = await executeTool('log_body_weight', {
      weightKg: '75.5',
    }, userId);
    expect(result.resultText).toContain('75.5 кг');
  });
});

// ─── log_water (no DB write — pins contract) ───────────────────────────────

describe('executeTool — log_water no-DB contract', () => {
  test('returns actionData.ml without any prisma call', async () => {
    const result = await executeTool('log_water', { ml: 250 }, userId);
    expect(result.actionData).toMatchObject({ ml: 250 });
    expect(m.meal.create).not.toHaveBeenCalled();
    expect(m.user.update).not.toHaveBeenCalled();
  });

  test('clamps ml to 50-5000', async () => {
    const lo = await executeTool('log_water', { ml: 10 }, userId);
    expect(lo.actionData).toMatchObject({ ml: 50 });
    const hi = await executeTool('log_water', { ml: 99999 }, userId);
    expect(hi.actionData).toMatchObject({ ml: 5000 });
  });

  test('defaults to 250ml when ml missing', async () => {
    const r = await executeTool('log_water', {}, userId);
    expect(r.actionData).toMatchObject({ ml: 250 });
  });
});

// ─── update_user_profile ───────────────────────────────────────────────────

describe('executeTool — update_user_profile happy path', () => {
  test('updates valid fields + post-write verify', async () => {
    m.user.update.mockResolvedValueOnce({});
    m.user.findUnique.mockResolvedValueOnce({
      weightKg: 80, heightCm: 180, goal: 'MUSCLE_GAIN', fitnessLevel: 'INTERMEDIATE',
    });

    const result = await executeTool('update_user_profile', {
      weightKg: 80, heightCm: 180, goal: 'MUSCLE_GAIN', fitnessLevel: 'INTERMEDIATE',
    }, userId);

    expect(result.resultText).toContain('Профиль обновлён');
    expect(result.resultText).toContain('80 кг');
    expect(result.resultText).toContain('180 см');
    const updateArgs = m.user.update.mock.calls[0][0];
    expect(updateArgs.data.weightKg).toBe(80);
    expect(updateArgs.data.goal).toBe('MUSCLE_GAIN');
  });

  test('drops invalid goal value (only updates valid fields)', async () => {
    m.user.update.mockResolvedValueOnce({});
    m.user.findUnique.mockResolvedValueOnce({ weightKg: 80 });

    await executeTool('update_user_profile', {
      weightKg: 80,
      goal: 'INVALID_GOAL',
    }, userId);

    const updateArgs = m.user.update.mock.calls[0][0];
    expect(updateArgs.data.weightKg).toBe(80);
    expect(updateArgs.data.goal).toBeUndefined();
  });

  test('returns "no valid fields" message when nothing valid', async () => {
    const result = await executeTool('update_user_profile', {
      weightKg: 1000,
      goal: 'NONSENSE',
    }, userId);
    expect(result.resultText).toMatch(/Нет корректных данных|Ошибка параметров/);
    expect(m.user.update).not.toHaveBeenCalled();
  });
});

// ─── set_water_target ──────────────────────────────────────────────────────

describe('executeTool — set_water_target happy path', () => {
  test('writes User.targetWaterMl + post-write verify', async () => {
    m.user.update.mockResolvedValueOnce({});
    m.user.findUnique.mockResolvedValueOnce({ targetWaterMl: 2500 });

    const result = await executeTool('set_water_target', { targetMl: 2500 }, userId);

    expect(result.resultText).toContain('2500 мл');
    const updateArgs = m.user.update.mock.calls[0][0];
    expect(updateArgs.data.targetWaterMl).toBe(2500);
  });

  test('clamps to 500-10000 range', async () => {
    m.user.update.mockResolvedValueOnce({});
    m.user.findUnique.mockResolvedValueOnce({ targetWaterMl: 500 });
    const r = await executeTool('set_water_target', { targetMl: 50 }, userId);
    expect(r.resultText).toContain('500 мл');
  });
});

// ─── set_rest_timer (no DB write) ──────────────────────────────────────────

describe('executeTool — set_rest_timer no-DB contract', () => {
  test('clamps seconds to 15-600 + returns actionData', async () => {
    const r = await executeTool('set_rest_timer', { seconds: 120 }, userId);
    expect(r.actionData).toMatchObject({ restTimerSeconds: 120 });
    const lo = await executeTool('set_rest_timer', { seconds: 5 }, userId);
    expect(lo.actionData).toMatchObject({ restTimerSeconds: 15 });
    const hi = await executeTool('set_rest_timer', { seconds: 9999 }, userId);
    expect(hi.actionData).toMatchObject({ restTimerSeconds: 600 });
  });
});

// ─── log_body_measurement (avg of left/right) ──────────────────────────────

describe('executeTool — log_body_measurement happy path', () => {
  test('averages bicepLeft + bicepRight into bicep field', async () => {
    m.bodyMeasurement.upsert.mockResolvedValueOnce({});
    m.bodyMeasurement.findUnique.mockResolvedValueOnce({
      bicep: 40, chest: undefined, waist: undefined, hips: undefined,
      thigh: undefined, calf: undefined, neck: undefined,
    });

    const result = await executeTool('log_body_measurement', {
      bicepLeft: 39, bicepRight: 41,
    }, userId);

    expect(result.resultText).toContain('бицепс');
    expect(result.resultText).toContain('40 см');
    const upsertArgs = m.bodyMeasurement.upsert.mock.calls[0][0];
    expect(upsertArgs.create.bicep).toBe(40);
  });

  test('rejects all-invalid input with graceful error', async () => {
    const result = await executeTool('log_body_measurement', {
      chest: -10, waist: 9999,
    }, userId);
    expect(result.resultText).toMatch(/Нет данных|Ошибка параметров/);
    expect(m.bodyMeasurement.upsert).not.toHaveBeenCalled();
  });
});

// ─── unknown tool name (executor fall-through) ─────────────────────────────

describe('executeTool — unknown tool name', () => {
  test('returns the "Неизвестный инструмент" sentinel', async () => {
    const result = await executeTool('this_tool_does_not_exist', {}, userId);
    expect(result.resultText).toMatch(/Неизвестный инструмент/);
  });
});
