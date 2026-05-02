/**
 * Round 201 — create_program post-write verification tests.
 *
 * After create_program creates the Program + nested Workouts (each
 * with nested Exercises), we read it back to confirm the structure
 * persisted correctly. Critical because create_program then
 * deactivates competing programs — if our new program is half-built
 * and we deactivate the user's working one, the user is left with
 * nothing useful.
 *
 * Re-implementation of the verify logic for testing in isolation.
 * If ai.ts changes, update here too.
 */

type PgmDBExercise = { exerciseId: string };
type PgmDBWorkout = { id: string; exercises: PgmDBExercise[] };
type DBProgram = { id: string; workouts: PgmDBWorkout[] };

function verifyProgramWrite(
  expected: { workoutCount: number; totalExercises: number },
  actual: DBProgram | null,
): { ok: true } | { ok: false; reason: string } {
  if (!actual) {
    return {
      ok: false,
      reason: 'create_program: written program not found in verify (transaction rollback?)',
    };
  }
  if (actual.workouts.length !== expected.workoutCount) {
    return {
      ok: false,
      reason: `create_program: workout count diverges — DB=${actual.workouts.length} expected=${expected.workoutCount}`,
    };
  }
  const dbExerciseTotal = actual.workouts.reduce((s, w) => s + w.exercises.length, 0);
  if (dbExerciseTotal !== expected.totalExercises) {
    return {
      ok: false,
      reason: `create_program: total exercise count diverges — DB=${dbExerciseTotal} expected=${expected.totalExercises}`,
    };
  }
  return { ok: true };
}

const wkt = (id: string, exerciseCount: number): PgmDBWorkout => ({
  id,
  exercises: Array.from({ length: exerciseCount }, (_, i) => ({ exerciseId: `${id}-ex-${i}` })),
});

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('create_program post-write verify — happy path', () => {
  test('matching write → ok', () => {
    const actual: DBProgram = {
      id: 'p1',
      workouts: [wkt('w1', 5), wkt('w2', 5), wkt('w3', 5)],
    };
    expect(verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, actual)).toEqual({ ok: true });
  });

  test('single-day program verifies', () => {
    const actual: DBProgram = { id: 'p1', workouts: [wkt('w1', 8)] };
    expect(verifyProgramWrite({ workoutCount: 1, totalExercises: 8 }, actual)).toEqual({ ok: true });
  });

  test('large program (6 days, 36 exercises) verifies', () => {
    const actual: DBProgram = {
      id: 'p1',
      workouts: Array.from({ length: 6 }, (_, i) => wkt(`w${i}`, 6)),
    };
    expect(verifyProgramWrite({ workoutCount: 6, totalExercises: 36 }, actual)).toEqual({ ok: true });
  });
});

// ─── Failure modes ──────────────────────────────────────────────────────────

describe('create_program post-write verify — failure modes', () => {
  test('null actual → reject', () => {
    const r = verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rollback|not found/);
  });

  test('workout count mismatch → reject', () => {
    const actual: DBProgram = {
      id: 'p1',
      workouts: [wkt('w1', 5), wkt('w2', 5)], // missing 3rd day
    };
    const r = verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/workout count.*DB=2 expected=3/);
  });

  test('total exercise count mismatch (some exercises dropped) → reject', () => {
    const actual: DBProgram = {
      id: 'p1',
      workouts: [wkt('w1', 5), wkt('w2', 3), wkt('w3', 5)], // 13 not 15
    };
    const r = verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/total exercise count.*DB=13 expected=15/);
  });

  test('zero workouts persisted (silent failure on create) → reject', () => {
    const actual: DBProgram = { id: 'p1', workouts: [] };
    const r = verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=0 expected=3/);
  });

  test('one workout has zero exercises (catastrophic for that day) → caught by total', () => {
    const actual: DBProgram = {
      id: 'p1',
      workouts: [wkt('w1', 5), wkt('w2', 0), wkt('w3', 5)], // middle day empty!
    };
    const r = verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/total exercise count/);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('create_program post-write verify — edge cases', () => {
  test('check failure means no deactivation of other programs', () => {
    // Sanity-check the contract: verify happens BEFORE updateMany that
    // deactivates competing programs in ai.ts. Test docs the order.
    // (This is a unit test for the verify return shape; the order is
    // enforced by ai.ts code structure.)
    const actual: DBProgram = { id: 'p1', workouts: [] };
    const r = verifyProgramWrite({ workoutCount: 3, totalExercises: 15 }, actual);
    expect(r.ok).toBe(false);
    // ai.ts: throw if !ok → updateMany never runs → user's working
    // program stays active. This is the safety property.
  });
});
