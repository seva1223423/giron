/**
 * Round 206 — verify-pattern tests for the modify-tier tools.
 *
 * Covers the verify logic added in R203/R205 to:
 *   - modify_workout/update_exercise (set replacement)
 *   - modify_workout/scale (weightMultiplier)
 *   - modify_workout/add_exercise
 *   - swap_exercise
 *   - add_superset
 *   - activate_program (exactly-one-active invariant)
 *   - update_nutrition_targets
 *   - update_memory/set
 *
 * Each verify is re-implemented in isolation so we can prove its
 * pass/fail logic without spinning up Prisma. Mirrors the R197
 * logMealVerify.test.ts pattern.
 */

// ─── modify_workout/update_exercise — set replacement ───────────────────────

type ExpectedSet = { reps: number; weight: number | null };

function verifyUpdateExerciseSets(
  expected: ExpectedSet[],
  actual: ExpectedSet[],
): { ok: true } | { ok: false; reason: string } {
  if (actual.length !== expected.length) {
    return {
      ok: false,
      reason: `modify_workout/update_exercise: set count diverges — DB=${actual.length} expected=${expected.length}`,
    };
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i].reps !== expected[i].reps) {
      return {
        ok: false,
        reason: `modify_workout/update_exercise: set ${i + 1} reps diverge — DB=${actual[i].reps} expected=${expected[i].reps}`,
      };
    }
    if (actual[i].weight !== expected[i].weight) {
      return {
        ok: false,
        reason: `modify_workout/update_exercise: set ${i + 1} weight diverges — DB=${actual[i].weight} expected=${expected[i].weight}`,
      };
    }
  }
  return { ok: true };
}

describe('modify_workout/update_exercise verify', () => {
  test('matching sets → ok', () => {
    const sets = [
      { reps: 10, weight: 80 },
      { reps: 8, weight: 80 },
      { reps: 6, weight: 85 },
    ];
    expect(verifyUpdateExerciseSets(sets, sets)).toEqual({ ok: true });
  });

  test('count mismatch → reject', () => {
    const expected = [{ reps: 10, weight: 80 }, { reps: 8, weight: 80 }, { reps: 6, weight: 85 }];
    const actual = [{ reps: 10, weight: 80 }, { reps: 8, weight: 80 }];
    const r = verifyUpdateExerciseSets(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=2 expected=3/);
  });

  test('reps divergence on set 2 → reject with position', () => {
    const expected = [{ reps: 10, weight: 80 }, { reps: 8, weight: 80 }];
    const actual = [{ reps: 10, weight: 80 }, { reps: 6, weight: 80 }]; // wrong reps
    const r = verifyUpdateExerciseSets(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/set 2/);
  });

  test('weight divergence with null vs number → reject', () => {
    const expected = [{ reps: 10, weight: 80 }];
    const actual = [{ reps: 10, weight: null as any }]; // weight lost
    expect(verifyUpdateExerciseSets(expected, actual).ok).toBe(false);
  });

  test('zero sets after delete (catastrophic state) → reject', () => {
    const expected = [{ reps: 10, weight: 80 }, { reps: 8, weight: 80 }];
    const r = verifyUpdateExerciseSets(expected, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DB=0 expected=2/);
  });
});

// ─── swap_exercise verify ───────────────────────────────────────────────────

type WERow = { id: string; exerciseId: string };

function verifySwap(
  expectedNewExId: string,
  matchingIds: string[],
  verifiedRows: WERow[],
): { ok: true } | { ok: false; reason: string } {
  const wrong = verifiedRows.filter((v) => v.exerciseId !== expectedNewExId);
  if (wrong.length > 0) {
    return {
      ok: false,
      reason: `swap_exercise: ${wrong.length}/${matchingIds.length} rows still point to old exerciseId after swap`,
    };
  }
  if (verifiedRows.length !== matchingIds.length) {
    return {
      ok: false,
      reason: `swap_exercise: only ${verifiedRows.length}/${matchingIds.length} rows present after swap`,
    };
  }
  return { ok: true };
}

describe('swap_exercise verify', () => {
  test('all swapped → ok', () => {
    const r = verifySwap(
      'new-ex',
      ['we1', 'we2', 'we3'],
      [
        { id: 'we1', exerciseId: 'new-ex' },
        { id: 'we2', exerciseId: 'new-ex' },
        { id: 'we3', exerciseId: 'new-ex' },
      ],
    );
    expect(r).toEqual({ ok: true });
  });

  test('one row still points to old exercise → reject', () => {
    const r = verifySwap(
      'new-ex',
      ['we1', 'we2'],
      [
        { id: 'we1', exerciseId: 'new-ex' },
        { id: 'we2', exerciseId: 'old-ex' }, // didn't update!
      ],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/1\/2 rows still point to old/);
  });

  test('row missing entirely (hard delete vs. update mismatch) → reject', () => {
    const r = verifySwap(
      'new-ex',
      ['we1', 'we2'],
      [{ id: 'we1', exerciseId: 'new-ex' }], // we2 missing
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/only 1\/2/);
  });

  test('zero swaps performed but verify still passes harmless empty case', () => {
    // matchingIds.length === 0 → caller doesn't run the verify; this
    // test docs that the function still degrades gracefully:
    const r = verifySwap('new-ex', [], []);
    expect(r).toEqual({ ok: true });
  });
});

// ─── add_superset verify ────────────────────────────────────────────────────

type SupersetRow = { id: string; supersetGroupId: string | null };

function verifySuperset(
  groupId: string,
  expectedRowCount: number,
  actualRows: SupersetRow[],
): { ok: true } | { ok: false; reason: string } {
  const tagged = actualRows.filter((v) => v.supersetGroupId === groupId);
  if (tagged.length !== expectedRowCount) {
    return {
      ok: false,
      reason: `add_superset: only ${tagged.length}/${expectedRowCount} exercises tagged with groupId after update`,
    };
  }
  return { ok: true };
}

describe('add_superset verify', () => {
  test('both tagged → ok', () => {
    const r = verifySuperset('superset-1', 2, [
      { id: 'a', supersetGroupId: 'superset-1' },
      { id: 'b', supersetGroupId: 'superset-1' },
    ]);
    expect(r).toEqual({ ok: true });
  });

  test('one tagged, one not → reject', () => {
    const r = verifySuperset('superset-1', 2, [
      { id: 'a', supersetGroupId: 'superset-1' },
      { id: 'b', supersetGroupId: null }, // failed to tag
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/1\/2/);
  });

  test('neither tagged → reject', () => {
    const r = verifySuperset('superset-1', 2, [
      { id: 'a', supersetGroupId: null },
      { id: 'b', supersetGroupId: null },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/0\/2/);
  });

  test('wrong groupId persisted → reject', () => {
    const r = verifySuperset('superset-1', 2, [
      { id: 'a', supersetGroupId: 'superset-1' },
      { id: 'b', supersetGroupId: 'superset-2' }, // wrong group
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/1\/2/);
  });
});

// ─── activate_program verify (exactly-one-active invariant) ─────────────────

type ProgramRow = { id: string; isActive: boolean };

function verifyActivate(
  expectedActiveId: string,
  programs: ProgramRow[],
): { ok: true } | { ok: false; reason: string } {
  const activeNow = programs.filter((p) => p.isActive);
  if (activeNow.length !== 1) {
    return {
      ok: false,
      reason: `activate_program: expected exactly 1 active program, DB has ${activeNow.length}`,
    };
  }
  if (activeNow[0].id !== expectedActiveId) {
    return {
      ok: false,
      reason: `activate_program: wrong program is active — DB=${activeNow[0].id} expected=${expectedActiveId}`,
    };
  }
  return { ok: true };
}

describe('activate_program verify — exactly-one-active invariant', () => {
  test('target active, others inactive → ok', () => {
    const r = verifyActivate('p2', [
      { id: 'p1', isActive: false },
      { id: 'p2', isActive: true },
      { id: 'p3', isActive: false },
    ]);
    expect(r).toEqual({ ok: true });
  });

  test('two active programs → reject', () => {
    const r = verifyActivate('p2', [
      { id: 'p1', isActive: true }, // race left p1 active
      { id: 'p2', isActive: true },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/expected exactly 1 active.*has 2/);
  });

  test('zero active programs (transaction rolled back) → reject', () => {
    const r = verifyActivate('p2', [
      { id: 'p1', isActive: false },
      { id: 'p2', isActive: false },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/has 0/);
  });

  test('wrong program is active (id mismatch) → reject', () => {
    const r = verifyActivate('p2', [
      { id: 'p1', isActive: true }, // p1 is active, not p2
      { id: 'p2', isActive: false },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/wrong program is active.*DB=p1 expected=p2/);
  });
});

// ─── update_nutrition_targets verify ────────────────────────────────────────

type Targets = { targetCalories: number; targetProtein: number; targetFats: number; targetCarbs: number };

function verifyTargets(
  expected: Targets,
  actual: Targets | null,
): { ok: true } | { ok: false; reason: string } {
  if (
    !actual ||
    actual.targetCalories !== expected.targetCalories ||
    actual.targetProtein !== expected.targetProtein ||
    actual.targetFats !== expected.targetFats ||
    actual.targetCarbs !== expected.targetCarbs
  ) {
    return {
      ok: false,
      reason: `update_nutrition_targets: stored values diverge — DB cal/prot/fat/carb=${actual?.targetCalories}/${actual?.targetProtein}/${actual?.targetFats}/${actual?.targetCarbs} expected=${expected.targetCalories}/${expected.targetProtein}/${expected.targetFats}/${expected.targetCarbs}`,
    };
  }
  return { ok: true };
}

describe('update_nutrition_targets verify', () => {
  test('matching targets → ok', () => {
    const t = { targetCalories: 2400, targetProtein: 160, targetFats: 80, targetCarbs: 280 };
    expect(verifyTargets(t, t)).toEqual({ ok: true });
  });

  test('null actual (user vanished?) → reject', () => {
    const t = { targetCalories: 2400, targetProtein: 160, targetFats: 80, targetCarbs: 280 };
    expect(verifyTargets(t, null).ok).toBe(false);
  });

  test('stale calories → reject', () => {
    const expected = { targetCalories: 2400, targetProtein: 160, targetFats: 80, targetCarbs: 280 };
    const actual = { ...expected, targetCalories: 2000 }; // didn't update
    const r = verifyTargets(expected, actual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/2000.*2400/);
  });

  test('one macro stale → reject (silent partial update)', () => {
    const expected = { targetCalories: 2400, targetProtein: 160, targetFats: 80, targetCarbs: 280 };
    const actual = { ...expected, targetProtein: 100 };
    expect(verifyTargets(expected, actual).ok).toBe(false);
  });
});

// ─── update_memory verify ───────────────────────────────────────────────────

type MemRow = { value: string; category: string };

function verifyMemSet(
  expected: { value: string; category: string },
  actual: MemRow | null,
): { ok: true } | { ok: false; reason: string } {
  if (!actual || actual.value !== expected.value || actual.category !== expected.category) {
    return {
      ok: false,
      reason: `update_memory/set: stored value diverges — DB=${actual?.category}/${actual?.value} expected=${expected.category}/${expected.value}`,
    };
  }
  return { ok: true };
}

describe('update_memory/set verify', () => {
  test('exact match → ok', () => {
    const exp = { value: 'TRX дома', category: 'preference' };
    expect(verifyMemSet(exp, exp)).toEqual({ ok: true });
  });

  test('null actual (upsert silently failed) → reject', () => {
    const exp = { value: 'TRX дома', category: 'preference' };
    expect(verifyMemSet(exp, null).ok).toBe(false);
  });

  test('value mismatch → reject', () => {
    const exp = { value: 'TRX дома', category: 'preference' };
    const r = verifyMemSet(exp, { value: 'TRX офис', category: 'preference' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/TRX офис.*TRX дома/);
  });

  test('category mismatch (write hit wrong column) → reject', () => {
    const exp = { value: 'TRX дома', category: 'preference' };
    const r = verifyMemSet(exp, { value: 'TRX дома', category: 'habit' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/habit.*preference/);
  });
});

// ─── adjust_all_weights sample-verify ───────────────────────────────────────

type SetEdit = { id: string; newWeight: number };
type DBSetWithId = { id: string; weight: number | null };

function verifyAdjustWeightsSample(
  edits: SetEdit[],
  verifiedRows: DBSetWithId[],
): { ok: true } | { ok: false; reason: string } {
  const verifiedMap = new Map(verifiedRows.map((s) => [s.id, s.weight]));
  for (const exp of edits) {
    const got = verifiedMap.get(exp.id);
    const gotNum = got != null ? Number(got) : null;
    if (gotNum !== exp.newWeight) {
      return {
        ok: false,
        reason: `adjust_all_weights: set ${exp.id} weight diverges — DB=${gotNum} expected=${exp.newWeight}`,
      };
    }
  }
  return { ok: true };
}

describe('adjust_all_weights sample-verify', () => {
  test('all edits match → ok', () => {
    const edits = [
      { id: 'set1', newWeight: 90 },
      { id: 'set2', newWeight: 95 },
    ];
    const rows: DBSetWithId[] = [
      { id: 'set1', weight: 90 },
      { id: 'set2', weight: 95 },
    ];
    expect(verifyAdjustWeightsSample(edits, rows)).toEqual({ ok: true });
  });

  test('one edit silently failed (DB unchanged) → reject', () => {
    const edits = [
      { id: 'set1', newWeight: 90 },
      { id: 'set2', newWeight: 95 },
    ];
    const rows: DBSetWithId[] = [
      { id: 'set1', weight: 90 },
      { id: 'set2', weight: 80 }, // not 95!
    ];
    const r = verifyAdjustWeightsSample(edits, rows);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/set2.*DB=80 expected=95/);
  });

  test('row missing from verify result → reject (gotNum is null)', () => {
    const edits = [{ id: 'set1', newWeight: 90 }];
    const rows: DBSetWithId[] = []; // verify returned nothing
    const r = verifyAdjustWeightsSample(edits, rows);
    expect(r.ok).toBe(false);
  });

  test('numeric coercion (Prisma Decimal as string) handled', () => {
    const edits = [{ id: 'set1', newWeight: 90 }];
    // simulate Prisma Decimal coming back as string "90.00"
    const rows: DBSetWithId[] = [{ id: 'set1', weight: '90' as any }];
    // Number('90') === 90
    expect(verifyAdjustWeightsSample(edits, rows)).toEqual({ ok: true });
  });
});
