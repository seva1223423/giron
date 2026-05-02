/**
 * Round 201 — create_workout post-write verification tests.
 *
 * After create_workout creates the Workout + nested exercises + sets,
 * we read it back to confirm the structure persisted correctly. Without
 * this, partial-success rollbacks could leave the AI thinking it
 * created an 8-exercise workout when DB has 3.
 *
 * Re-implementation of the verify logic for testing in isolation.
 * If ai.ts changes, update here too.
 */

type ExpectedExercise = {
  order: number;
  exerciseId: string;
  sets: number; // expected set count
  reps: number;
  weight: number | null;
  restSeconds: number;
};

type DBSet = { setNumber: number; reps: number; weight: number | null };
type DBExercise = { order: number; exerciseId: string; sets: DBSet[] };
type DBWorkout = { id: string; name: string; exercises: DBExercise[] };

function verifyWorkoutWrite(
  expected: ExpectedExercise[],
  actual: DBWorkout | null,
): { ok: true } | { ok: false; reason: string } {
  if (!actual) {
    return {
      ok: false,
      reason: 'create_workout: written workout not found in verify (transaction rollback?)',
    };
  }
  if (actual.exercises.length !== expected.length) {
    return {
      ok: false,
      reason: `create_workout: exercise count diverges — DB=${actual.exercises.length} expected=${expected.length}`,
    };
  }
  // Verify each exercise in the order returned by DB matches input
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const got = actual.exercises[i];
    if (got.exerciseId !== exp.exerciseId) {
      return {
        ok: false,
        reason: `create_workout: exercise ${i + 1} id diverges — DB=${got.exerciseId} expected=${exp.exerciseId}`,
      };
    }
    if (got.sets.length !== exp.sets) {
      return {
        ok: false,
        reason: `create_workout: exercise ${i + 1} set count diverges — DB=${got.sets.length} expected=${exp.sets}`,
      };
    }
  }
  return { ok: true };
}

const ex = (order: number, exerciseId: string, sets: number): ExpectedExercise => ({
  order,
  exerciseId,
  sets,
  reps: 10,
  weight: 50,
  restSeconds: 90,
});

const dbEx = (order: number, exerciseId: string, setCount: number): DBExercise => ({
  order,
  exerciseId,
  sets: Array.from({ length: setCount }, (_, i) => ({ setNumber: i + 1, reps: 10, weight: 50 })),
});

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('create_workout post-write verify — happy path', () => {
  test('matching write → ok', () => {
    const expected = [ex(1, 'bench-press-id', 4), ex(2, 'squat-id', 3)];
    const actual: DBWorkout = {
      id: 'workout-1',
      name: 'Chest+Legs',
      exercises: [dbEx(1, 'bench-press-id', 4), dbEx(2, 'squat-id', 3)],
    };
    expect(verifyWorkoutWrite(expected, actual)).toEqual({ ok: true });
  });

  test('single exercise workout verifies', () => {
    const expected = [ex(1, 'pullup-id', 5)];
    const actual: DBWorkout = {
      id: 'workout-1',
      name: 'Back',
      exercises: [dbEx(1, 'pullup-id', 5)],
    };
    expect(verifyWorkoutWrite(expected, actual)).toEqual({ ok: true });
  });

  test('large workout (10 exercises) verifies', () => {
    const expected = Array.from({ length: 10 }, (_, i) => ex(i + 1, `ex-${i}`, 3));
    const actual: DBWorkout = {
      id: 'workout-1',
      name: 'Full Body',
      exercises: expected.map((e) => dbEx(e.order, e.exerciseId, e.sets)),
    };
    expect(verifyWorkoutWrite(expected, actual)).toEqual({ ok: true });
  });
});

// ─── Failure modes ──────────────────────────────────────────────────────────

describe('create_workout post-write verify — failure modes', () => {
  test('null actual (transaction rollback) → reject', () => {
    const expected = [ex(1, 'bench-id', 3)];
    const r = verifyWorkoutWrite(expected, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rollback|not found/);
  });

  test('exercise count mismatch (some exercises dropped silently) → reject', () => {
    const expected = [ex(1, 'a', 3), ex(2, 'b', 3), ex(3, 'c', 3)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 3), dbEx(2, 'b', 3)],
    };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=2 expected=3/);
  });

  test('exercise id mismatch (wrong exercise persisted) → reject', () => {
    const expected = [ex(1, 'bench-press', 4)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'leg-curl', 4)], // wrong exercise!
    };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=leg-curl expected=bench-press/);
  });

  test('set count mismatch (sets truncated) → reject', () => {
    const expected = [ex(1, 'bench-id', 5)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'bench-id', 3)], // only 3 of 5 sets created
    };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/set count diverges.*DB=3 expected=5/);
  });

  test('zero exercises persisted (silent failure) → reject', () => {
    const expected = [ex(1, 'a', 3), ex(2, 'b', 3)];
    const actual: DBWorkout = { id: 'w1', name: 'W', exercises: [] };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=0 expected=2/);
  });

  test('extra exercises (impossible state) → reject', () => {
    const expected = [ex(1, 'a', 3)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 3), dbEx(2, 'b', 3)], // bonus exercise
    };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=2 expected=1/);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('create_workout post-write verify — edge cases', () => {
  test('empty expected list (no valid exercises) → matches empty actual', () => {
    const actual: DBWorkout = { id: 'w1', name: 'Empty', exercises: [] };
    expect(verifyWorkoutWrite([], actual)).toEqual({ ok: true });
  });

  test('1 set per exercise (warmup style) verifies', () => {
    const expected = [ex(1, 'a', 1)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 1)],
    };
    expect(verifyWorkoutWrite(expected, actual)).toEqual({ ok: true });
  });

  test('20 sets per exercise (max bound) verifies', () => {
    const expected = [ex(1, 'a', 20)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 20)],
    };
    expect(verifyWorkoutWrite(expected, actual)).toEqual({ ok: true });
  });
});

// ─── Error message clarity ──────────────────────────────────────────────────

describe('create_workout post-write verify — error message clarity', () => {
  test('reason names exercise position when id mismatch', () => {
    const expected = [ex(1, 'a', 3), ex(2, 'b', 3), ex(3, 'wrong', 3)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 3), dbEx(2, 'b', 3), dbEx(3, 'c', 3)], // 3rd wrong
    };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('exercise 3');
  });

  test('reason names exercise position when set count diverges', () => {
    const expected = [ex(1, 'a', 3), ex(2, 'b', 5)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 3), dbEx(2, 'b', 2)], // 2nd ex has wrong set count
    };
    const r = verifyWorkoutWrite(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('exercise 2');
  });

  test('reason cites concrete numbers', () => {
    const expected = [ex(1, 'a', 4)];
    const actual: DBWorkout = {
      id: 'w1',
      name: 'W',
      exercises: [dbEx(1, 'a', 1)],
    };
    const r = verifyWorkoutWrite(expected, actual);
    if (!r.ok) {
      expect(r.reason).toContain('DB=1');
      expect(r.reason).toContain('expected=4');
    }
  });
});
