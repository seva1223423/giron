/**
 * Round 210 — STALE_DATA inventory tests.
 *
 * Parallel to R209 NO_DATA: when records exist but are old, the AI
 * should know not to quote them as current. Re-implementation of the
 * stale-marker building logic so we can pin behavior without spinning
 * up the chat handler.
 *
 * Thresholds (must mirror ai.ts):
 *   - body weight: 14 days
 *   - body measurements: 30 days
 *   - sleep: 7 days
 *   - last completed workout: 14 days
 *
 * If ai.ts changes, update here too.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-04-30T12:00:00Z').getTime();

const daysAgo = (n: number): Date => new Date(NOW - n * DAY);

type WeightRow = { date: Date | string; weightKg: number };
type MeasRow = { date: Date | string };
type SleepRow = { date: string };
type WorkoutRow = { completedAt: Date | string | null };

function daysSince(d: Date | string | null | undefined, now = NOW): number | null {
  if (!d) return null;
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now - t) / DAY);
}

function buildStaleMarkers(input: {
  bodyWeightHistory: WeightRow[];
  recentMeasurements: MeasRow[];
  recentSleepEntries: SleepRow[];
  recentWorkouts: WorkoutRow[];
}): string[] {
  const markers: string[] = [];
  if (input.bodyWeightHistory.length > 0) {
    const last = input.bodyWeightHistory[0];
    const days = daysSince(last.date);
    if (days !== null && days > 14) {
      markers.push(`Последнее взвешивание: ${days} дней назад (${last.weightKg} кг). Не используй как актуальный вес — попроси заново взвеситься.`);
    }
  }
  if (input.recentMeasurements.length > 0) {
    const last = input.recentMeasurements[0];
    const days = daysSince(last.date);
    if (days !== null && days > 30) {
      markers.push(`Последние замеры тела: ${days} дней назад. Если разговор о текущей форме — попроси новые замеры.`);
    }
  }
  if (input.recentSleepEntries.length > 0) {
    const last = input.recentSleepEntries[0];
    const days = daysSince(last.date);
    if (days !== null && days > 7) {
      markers.push(`Последняя запись сна: ${days} дней назад. Свежих данных о сне нет.`);
    }
  }
  if (input.recentWorkouts.length > 0) {
    const lastCompleted = input.recentWorkouts.find((w) => w.completedAt);
    if (lastCompleted) {
      const days = daysSince(lastCompleted.completedAt);
      if (days !== null && days > 14) {
        markers.push(`Последняя завершённая тренировка: ${days} дней назад. Возможно перерыв — спроси что случилось, не называй активным режимом тренировок.`);
      }
    } else {
      markers.push('Все тренировки в плане незавершённые — фактической истории тренировок нет. Не цитируй их как "выполненные".');
    }
  }
  return markers;
}

// ─── Body weight staleness ──────────────────────────────────────────────────

describe('STALE — body weight', () => {
  test('1 day ago: not stale', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [{ date: daysAgo(1), weightKg: 80 }],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m).toEqual([]);
  });

  test('14 days ago: still NOT stale (boundary inclusive)', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [{ date: daysAgo(14), weightKg: 80 }],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m).toEqual([]);
  });

  test('15 days ago: STALE', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [{ date: daysAgo(15), weightKg: 80 }],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/15 дней назад/);
    expect(m[0]).toMatch(/80 кг/);
    expect(m[0]).toMatch(/попроси заново взвеситься/);
  });

  test('90 days ago: STALE with explicit day count', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [{ date: daysAgo(90), weightKg: 75 }],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m[0]).toMatch(/90 дней/);
    expect(m[0]).toMatch(/75 кг/);
  });
});

// ─── Body measurements staleness ────────────────────────────────────────────

describe('STALE — body measurements', () => {
  test('29 days: not stale', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [{ date: daysAgo(29) }],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m).toEqual([]);
  });

  test('31 days: STALE', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [{ date: daysAgo(31) }],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/замеры тела/i);
    expect(m[0]).toMatch(/31 дней/);
  });
});

// ─── Sleep staleness ────────────────────────────────────────────────────────

describe('STALE — sleep', () => {
  test('5 days: not stale', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [{ date: daysAgo(5).toISOString().slice(0, 10) }],
      recentWorkouts: [],
    });
    expect(m).toEqual([]);
  });

  test('10 days: STALE', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [{ date: daysAgo(10).toISOString().slice(0, 10) }],
      recentWorkouts: [],
    });
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/Свежих данных о сне нет/);
  });
});

// ─── Workout staleness ──────────────────────────────────────────────────────

describe('STALE — workouts', () => {
  test('completed 5 days ago: not stale', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [{ completedAt: daysAgo(5) }],
    });
    expect(m).toEqual([]);
  });

  test('last completed 20 days ago: STALE with break message', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [{ completedAt: daysAgo(20) }],
    });
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/20 дней назад/);
    expect(m[0]).toMatch(/перерыв/);
    expect(m[0]).toMatch(/не называй активным/);
  });

  test('all workouts in plan, none completed: STALE with "незавершённые"', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [{ completedAt: null }, { completedAt: null }],
    });
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/все тренировки.*незавершённ/i);
    expect(m[0]).toMatch(/не цитируй их как "выполненные"/i);
  });

  test('mixed: at least one completed in window → no stale marker', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [
        { completedAt: null }, // ignored
        { completedAt: daysAgo(3) }, // fresh
      ],
    });
    expect(m).toEqual([]);
  });
});

// ─── Compound cases ─────────────────────────────────────────────────────────

describe('STALE — compound', () => {
  test('all four stale → 4 markers', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [{ date: daysAgo(60), weightKg: 80 }],
      recentMeasurements: [{ date: daysAgo(60) }],
      recentSleepEntries: [{ date: daysAgo(60).toISOString().slice(0, 10) }],
      recentWorkouts: [{ completedAt: daysAgo(60) }],
    });
    expect(m.length).toBe(4);
  });

  test('all fresh → 0 markers', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [{ date: daysAgo(2), weightKg: 80 }],
      recentMeasurements: [{ date: daysAgo(5) }],
      recentSleepEntries: [{ date: daysAgo(1).toISOString().slice(0, 10) }],
      recentWorkouts: [{ completedAt: daysAgo(2) }],
    });
    expect(m).toEqual([]);
  });

  test('empty arrays don\'t generate markers (handled by NO_DATA, R209)', () => {
    const m = buildStaleMarkers({
      bodyWeightHistory: [],
      recentMeasurements: [],
      recentSleepEntries: [],
      recentWorkouts: [],
    });
    expect(m).toEqual([]);
  });
});

// ─── Date parsing edge cases ────────────────────────────────────────────────

describe('daysSince — parsing', () => {
  test('valid Date object', () => {
    expect(daysSince(daysAgo(7))).toBe(7);
  });

  test('valid ISO string', () => {
    expect(daysSince(daysAgo(7).toISOString())).toBe(7);
  });

  test('null returns null', () => {
    expect(daysSince(null)).toBe(null);
  });

  test('undefined returns null', () => {
    expect(daysSince(undefined)).toBe(null);
  });

  test('garbage string returns null (no NaN propagation)', () => {
    expect(daysSince('not-a-date')).toBe(null);
  });

  test('future date returns negative (degenerate but well-defined)', () => {
    const future = new Date(NOW + 5 * DAY);
    expect(daysSince(future)).toBeLessThan(0);
  });
});
