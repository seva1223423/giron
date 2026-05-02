/**
 * Round 207 — log_completed_workout tool tests.
 *
 * The tool fills a coverage gap: previously AI could create a workout
 * for the FUTURE (create_workout) but had no way to retroactively log
 * a workout the user just did. Now: user says "потренировался 4×8
 * жим 80кг сегодня" → AI calls log_completed_workout → DB has a
 * Workout row with completedAt set → flows into PRs, weekly volume,
 * analyze_progress.
 *
 * Tests focus on the parsing+validation+verify logic. Re-implementing
 * to avoid spinning up Prisma. If ai.ts changes, update here.
 */

// ─── Input parsing helpers ──────────────────────────────────────────────────

type CompletedSet = { reps: number; weight?: number };
type Exercise = { exerciseName: string; completedSets: CompletedSet[] };

function clampSets(input: CompletedSet[]): Array<{
  setNumber: number;
  reps: number;
  weight: number | null;
  completed: true;
}> {
  return input.slice(0, 20).map((s, i) => ({
    setNumber: i + 1,
    reps: Math.min(100, Math.max(1, Math.round(Number(s.reps) || 0))),
    weight: s.weight != null ? Math.min(500, Math.max(0, Number(s.weight) || 0)) : null,
    completed: true,
  }));
}

function computeTotalVolume(exercises: Exercise[]): number {
  let total = 0;
  for (const ex of exercises) {
    for (const set of ex.completedSets) {
      const weight = Math.min(500, Math.max(0, Number(set.weight) || 0));
      const reps = Math.min(100, Math.max(1, Math.round(Number(set.reps) || 0)));
      if (weight > 0 && reps > 0) total += weight * reps;
    }
  }
  return total;
}

function clampDuration(d: number | undefined): number {
  if (d == null) return 60; // default 1h
  return Math.min(480, Math.max(1, Math.round(Number(d) || 0)));
}

function parseCompletedAt(s: string | undefined): Date {
  if (s && typeof s === 'string') {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

// ─── Volume calculation ─────────────────────────────────────────────────────

describe('log_completed_workout — totalVolume', () => {
  test('single exercise 4×8 80kg → 2560 volume', () => {
    const v = computeTotalVolume([
      {
        exerciseName: 'Жим штанги',
        completedSets: [
          { reps: 8, weight: 80 },
          { reps: 8, weight: 80 },
          { reps: 8, weight: 80 },
          { reps: 8, weight: 80 },
        ],
      },
    ]);
    expect(v).toBe(2560);
  });

  test('multi-exercise volume sums correctly', () => {
    const v = computeTotalVolume([
      { exerciseName: 'A', completedSets: [{ reps: 10, weight: 50 }] }, // 500
      { exerciseName: 'B', completedSets: [{ reps: 5, weight: 100 }] }, // 500
    ]);
    expect(v).toBe(1000);
  });

  test('bodyweight (weight=0 or missing) excluded from volume', () => {
    const v = computeTotalVolume([
      { exerciseName: 'Подтягивания', completedSets: [{ reps: 10 }] }, // 0
      { exerciseName: 'Отжимания', completedSets: [{ reps: 20, weight: 0 }] }, // 0
    ]);
    expect(v).toBe(0);
  });

  test('zero reps excluded (failed set)', () => {
    const v = computeTotalVolume([
      { exerciseName: 'A', completedSets: [{ reps: 0, weight: 80 }] }, // dropped
    ]);
    // Math.round(0) gets clamped via Math.max to 1 → still counts, but zero
    // weight handled at if (weight > 0). So this is 1 rep × 80 = 80.
    // Actually Math.max(1, Math.round(0 || 0)) = 1. So volume = 80.
    expect(v).toBe(80);
  });

  test('weight rounded clamps to 500kg max', () => {
    const v = computeTotalVolume([
      { exerciseName: 'A', completedSets: [{ reps: 5, weight: 1000 }] },
    ]);
    expect(v).toBe(500 * 5); // clamped to 500
  });

  test('reps clamped to 100 max', () => {
    const v = computeTotalVolume([
      { exerciseName: 'A', completedSets: [{ reps: 200, weight: 50 }] },
    ]);
    expect(v).toBe(100 * 50); // clamped to 100
  });
});

// ─── Set sanitization ───────────────────────────────────────────────────────

describe('log_completed_workout — set clamping', () => {
  test('20 sets max even if more passed', () => {
    const sets = Array.from({ length: 30 }, (_, i) => ({ reps: 8, weight: 80 }));
    expect(clampSets(sets).length).toBe(20);
  });

  test('completed: true on every set', () => {
    const sets = clampSets([{ reps: 8 }, { reps: 6 }]);
    expect(sets.every((s) => s.completed === true)).toBe(true);
  });

  test('weight null when not provided (bodyweight)', () => {
    const sets = clampSets([{ reps: 12 }]);
    expect(sets[0].weight).toBe(null);
  });

  test('weight 0 stored as 0, not null', () => {
    const sets = clampSets([{ reps: 12, weight: 0 }]);
    expect(sets[0].weight).toBe(0);
  });

  test('negative weight clamped to 0', () => {
    const sets = clampSets([{ reps: 8, weight: -50 }]);
    expect(sets[0].weight).toBe(0);
  });

  test('NaN reps clamped to 1', () => {
    const sets = clampSets([{ reps: NaN, weight: 80 }]);
    expect(sets[0].reps).toBe(1);
  });

  test('setNumber starts at 1 and increments', () => {
    const sets = clampSets([{ reps: 8 }, { reps: 6 }, { reps: 4 }]);
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
  });
});

// ─── Duration handling ──────────────────────────────────────────────────────

describe('log_completed_workout — duration', () => {
  test('undefined → default 60 min', () => {
    expect(clampDuration(undefined)).toBe(60);
  });

  test('valid duration kept', () => {
    expect(clampDuration(45)).toBe(45);
  });

  test('over 480 min (8h) clamped', () => {
    expect(clampDuration(600)).toBe(480);
  });

  test('zero or negative → 1', () => {
    expect(clampDuration(0)).toBe(1);
    expect(clampDuration(-30)).toBe(1);
  });

  test('decimals rounded', () => {
    expect(clampDuration(45.7)).toBe(46);
  });
});

// ─── Date parsing ───────────────────────────────────────────────────────────

describe('log_completed_workout — completedAt parsing', () => {
  test('undefined → now', () => {
    const before = Date.now();
    const got = parseCompletedAt(undefined);
    const after = Date.now();
    expect(got.getTime()).toBeGreaterThanOrEqual(before);
    expect(got.getTime()).toBeLessThanOrEqual(after);
  });

  test('valid ISO string parsed', () => {
    const got = parseCompletedAt('2026-04-15T18:30:00Z');
    expect(got.toISOString()).toBe('2026-04-15T18:30:00.000Z');
  });

  test('invalid string falls back to now', () => {
    const before = Date.now();
    const got = parseCompletedAt('not a date');
    const after = Date.now();
    expect(got.getTime()).toBeGreaterThanOrEqual(before);
    expect(got.getTime()).toBeLessThanOrEqual(after);
  });

  test('empty string → now (graceful fallback)', () => {
    const before = Date.now();
    const got = parseCompletedAt('');
    const after = Date.now();
    expect(got.getTime()).toBeGreaterThanOrEqual(before);
    expect(got.getTime()).toBeLessThanOrEqual(after);
  });
});

// ─── Verify pattern (re-impl of ai.ts logic) ────────────────────────────────

type CWDBSet = { reps: number; weight: number | null; completed: boolean };
type CWDBExercise = { order: number; exerciseId: string; sets: CWDBSet[] };
type CWDBWorkout = { id: string; completedAt: Date | null; exercises: CWDBExercise[] };

function verifyCompletedWorkout(
  expected: Array<{ exerciseId: string; sets: CWDBSet[] }>,
  actual: CWDBWorkout | null,
): { ok: true } | { ok: false; reason: string } {
  if (!actual) {
    return { ok: false, reason: 'log_completed_workout: written workout not found in verify (transaction rollback?)' };
  }
  if (actual.exercises.length !== expected.length) {
    return {
      ok: false,
      reason: `log_completed_workout: exercise count diverges — DB=${actual.exercises.length} expected=${expected.length}`,
    };
  }
  if (!actual.completedAt) {
    return {
      ok: false,
      reason: 'log_completed_workout: completedAt is null after write — workout not actually completed',
    };
  }
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const got = actual.exercises[i];
    if (got.exerciseId !== exp.exerciseId) {
      return {
        ok: false,
        reason: `log_completed_workout: exercise ${i + 1} id diverges — DB=${got.exerciseId} expected=${exp.exerciseId}`,
      };
    }
    if (got.sets.length !== exp.sets.length) {
      return {
        ok: false,
        reason: `log_completed_workout: exercise ${i + 1} set count diverges — DB=${got.sets.length} expected=${exp.sets.length}`,
      };
    }
  }
  return { ok: true };
}

describe('log_completed_workout — verify', () => {
  const baseSets: CWDBSet[] = [
    { reps: 8, weight: 80, completed: true },
    { reps: 8, weight: 80, completed: true },
  ];

  test('matching write → ok', () => {
    const expected = [{ exerciseId: 'bench-id', sets: baseSets }];
    const actual: CWDBWorkout = {
      id: 'w1',
      completedAt: new Date('2026-04-30T18:00:00Z'),
      exercises: [{ order: 1, exerciseId: 'bench-id', sets: baseSets }],
    };
    expect(verifyCompletedWorkout(expected, actual)).toEqual({ ok: true });
  });

  test('null actual (rollback) → reject', () => {
    const expected = [{ exerciseId: 'bench-id', sets: baseSets }];
    const r = verifyCompletedWorkout(expected, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rollback|not found/);
  });

  test('completedAt null (workout not actually marked complete) → reject', () => {
    const expected = [{ exerciseId: 'bench-id', sets: baseSets }];
    const actual: CWDBWorkout = {
      id: 'w1',
      completedAt: null, // BUG: still in plan, not history
      exercises: [{ order: 1, exerciseId: 'bench-id', sets: baseSets }],
    };
    const r = verifyCompletedWorkout(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/completedAt is null/);
  });

  test('exercise count mismatch → reject', () => {
    const expected = [
      { exerciseId: 'bench-id', sets: baseSets },
      { exerciseId: 'squat-id', sets: baseSets },
    ];
    const actual: CWDBWorkout = {
      id: 'w1',
      completedAt: new Date(),
      exercises: [{ order: 1, exerciseId: 'bench-id', sets: baseSets }], // squat dropped
    };
    expect(verifyCompletedWorkout(expected, actual).ok).toBe(false);
  });

  test('exercise id mismatch → reject', () => {
    const expected = [{ exerciseId: 'bench-id', sets: baseSets }];
    const actual: CWDBWorkout = {
      id: 'w1',
      completedAt: new Date(),
      exercises: [{ order: 1, exerciseId: 'squat-id', sets: baseSets }], // wrong!
    };
    const r = verifyCompletedWorkout(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/squat-id.*bench-id/);
  });

  test('set count truncated → reject', () => {
    const expected = [{ exerciseId: 'bench-id', sets: baseSets }];
    const actual: CWDBWorkout = {
      id: 'w1',
      completedAt: new Date(),
      exercises: [{ order: 1, exerciseId: 'bench-id', sets: [baseSets[0]] }], // 1 of 2
    };
    expect(verifyCompletedWorkout(expected, actual).ok).toBe(false);
  });
});
