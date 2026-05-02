/**
 * Round 215 — suggest_next_workout program-aware logic.
 *
 * Previously the tool only counted muscle groups in last 7 workouts
 * to suggest "least trained". When the user has an active program
 * with multiple workout templates (e.g. Push/Pull/Legs), this advice
 * was abstract: "tomorrow do shoulders" — but the user already has a
 * plan that says "tomorrow do Pull".
 *
 * The new logic: when active program with ≥2 workouts exists, find
 * the most-recently-done WORKOUT NAME and suggest the next one in
 * the rotation. Falls back to muscle-balance suggestion when no
 * program exists.
 *
 * This re-implements the rotation logic in isolation so we can pin
 * its behavior without spinning up Prisma.
 */

type WorkoutName = { name: string };
type RecentWorkout = { name: string | null };

function pickNextProgramWorkout(
  programWorkouts: WorkoutName[],
  lastDone: RecentWorkout | undefined,
): string | null {
  if (programWorkouts.length < 2) return null;
  const lastDoneName = lastDone?.name;
  let nextIndex = 0;
  if (lastDoneName) {
    const idx = programWorkouts.findIndex((w) => w.name === lastDoneName);
    if (idx >= 0) nextIndex = (idx + 1) % programWorkouts.length;
  }
  return programWorkouts[nextIndex].name;
}

const PPL = [
  { name: 'Push' },
  { name: 'Pull' },
  { name: 'Legs' },
];

const UPPER_LOWER = [
  { name: 'Upper A' },
  { name: 'Lower A' },
  { name: 'Upper B' },
  { name: 'Lower B' },
];

// ─── Rotation logic ─────────────────────────────────────────────────────────

describe('pickNextProgramWorkout — basic rotation', () => {
  test('Push completed → next is Pull', () => {
    expect(pickNextProgramWorkout(PPL, { name: 'Push' })).toBe('Pull');
  });

  test('Pull completed → next is Legs', () => {
    expect(pickNextProgramWorkout(PPL, { name: 'Pull' })).toBe('Legs');
  });

  test('Legs completed → wraps to Push', () => {
    expect(pickNextProgramWorkout(PPL, { name: 'Legs' })).toBe('Push');
  });

  test('first time / no recent → first workout', () => {
    expect(pickNextProgramWorkout(PPL, undefined)).toBe('Push');
  });

  test('recent workout name not in program → first workout', () => {
    // User did some unrelated workout outside the program — fall back to start
    expect(pickNextProgramWorkout(PPL, { name: 'Random Day' })).toBe('Push');
  });

  test('recent.name is null → first workout', () => {
    expect(pickNextProgramWorkout(PPL, { name: null })).toBe('Push');
  });
});

// ─── 4-day rotation ─────────────────────────────────────────────────────────

describe('pickNextProgramWorkout — 4-day rotation', () => {
  test('Upper A → Lower A', () => {
    expect(pickNextProgramWorkout(UPPER_LOWER, { name: 'Upper A' })).toBe('Lower A');
  });

  test('Lower A → Upper B', () => {
    expect(pickNextProgramWorkout(UPPER_LOWER, { name: 'Lower A' })).toBe('Upper B');
  });

  test('Lower B → wraps to Upper A', () => {
    expect(pickNextProgramWorkout(UPPER_LOWER, { name: 'Lower B' })).toBe('Upper A');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('pickNextProgramWorkout — edge cases', () => {
  test('1 workout in program → null (not enough rotation)', () => {
    expect(pickNextProgramWorkout([{ name: 'Full Body' }], undefined)).toBe(null);
  });

  test('0 workouts in program → null', () => {
    expect(pickNextProgramWorkout([], undefined)).toBe(null);
  });

  test('2-workout program (A/B alternation)', () => {
    const ab = [{ name: 'A' }, { name: 'B' }];
    expect(pickNextProgramWorkout(ab, { name: 'A' })).toBe('B');
    expect(pickNextProgramWorkout(ab, { name: 'B' })).toBe('A');
  });

  test('case-sensitive name match (Push ≠ push)', () => {
    expect(pickNextProgramWorkout(PPL, { name: 'push' })).toBe('Push');
    // Lowercase "push" not in program → fall back to first
  });
});

// ─── Composition with overall suggestion ────────────────────────────────────

function composeSuggestion(
  daysSince: number,
  leastTrained: string[],
  programSuggestion: string | null,
): string {
  if (daysSince >= 3) {
    let s = `Ты не тренировался ${daysSince} дней. Рекомендую начать с лёгкой тренировки на всё тело.`;
    if (programSuggestion) s += ` ${programSuggestion}`;
    return s;
  }
  if (programSuggestion) {
    let s = programSuggestion;
    if (leastTrained.length > 0) {
      s += ` (Также давно не нагружал: ${leastTrained.join(', ')}.)`;
    }
    return s;
  }
  if (leastTrained.length > 0) {
    return `Наименее нагруженные мышцы за последние тренировки: ${leastTrained.join(', ')}. Рекомендую сфокусироваться на них.`;
  }
  return 'Все мышечные группы хорошо прокачаны. Продолжай по плану!';
}

describe('composeSuggestion — priority order', () => {
  test('long break: break message + program hint', () => {
    const out = composeSuggestion(5, ['Грудь'], 'По программе "PPL" следующая: Pull.');
    expect(out).toMatch(/5 дней/);
    expect(out).toMatch(/Pull/);
  });

  test('active program: program suggestion + muscle hint as parenthetical', () => {
    const out = composeSuggestion(1, ['Грудь', 'Плечи'], 'По программе "PPL" следующая: Pull.');
    expect(out).toMatch(/Pull/);
    expect(out).toMatch(/\(Также давно не нагружал: Грудь, Плечи\.\)/);
  });

  test('no program but recent: muscle-only suggestion', () => {
    const out = composeSuggestion(1, ['Спина'], null);
    expect(out).toMatch(/Спина/);
    expect(out).not.toMatch(/программе/);
  });

  test('all balanced + no program → "продолжай по плану"', () => {
    const out = composeSuggestion(1, [], null);
    expect(out).toMatch(/продолжай по плану/i);
  });

  test('long break + no program → break message only', () => {
    const out = composeSuggestion(7, [], null);
    expect(out).toMatch(/7 дней/);
    expect(out).not.toMatch(/программе/);
  });
});
