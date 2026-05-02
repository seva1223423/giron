/**
 * Round 209 — NO_DATA inventory tests.
 *
 * Re-implementation of the marker-building logic from ai.ts so we can
 * pin its behavior without spinning up the chat handler. The real
 * code reads from queried arrays (recentWorkouts, todayMeals, etc.)
 * — these tests verify the OUTPUT INVENTORY shape that the AI sees.
 *
 * Each marker should only fire when its source is truly empty (not
 * just "not provided this turn"). The text it emits must tell the AI
 * to NOT fabricate.
 *
 * If ai.ts changes, update here too.
 */

type DataState = {
  recentWorkouts: unknown[];
  todayMeals: unknown[];
  bodyWeightHistory: unknown[];
  recentMeasurements: unknown[];
  recentSleepEntries: unknown[];
  cardioSessions: unknown[] | undefined;
  lifetimePRsCount: number;
  nutritionTargets: unknown | null;
  activeProgram: unknown | null;
};

function buildNoDataMarkers(state: DataState): string[] {
  const markers: string[] = [];
  if (state.recentWorkouts.length === 0) {
    markers.push('История тренировок: пусто (никогда не записывал)');
  }
  if (state.todayMeals.length === 0) {
    markers.push('Питание сегодня: пусто (ещё не записывал)');
  }
  if (state.bodyWeightHistory.length === 0) {
    markers.push('Записи веса тела: пусто (никогда не взвешивался)');
  }
  if (state.recentMeasurements.length === 0) {
    markers.push('Замеры тела: пусто (никогда не делал)');
  }
  if (state.recentSleepEntries.length === 0) {
    markers.push('Сон: пусто (никогда не записывал)');
  }
  if (!state.cardioSessions || state.cardioSessions.length === 0) {
    markers.push('Кардио: пусто (никогда не записывал)');
  }
  if (state.lifetimePRsCount === 0) {
    markers.push('Личные рекорды (PR): пусто (нет завершённых тренировок с весами)');
  }
  if (!state.nutritionTargets) {
    markers.push('Нормы КБЖУ: не установлены (используй update_nutrition_targets)');
  }
  if (!state.activeProgram) {
    markers.push('Активная программа: нет (используй create_program или activate_program)');
  }
  return markers;
}

const empty: DataState = {
  recentWorkouts: [],
  todayMeals: [],
  bodyWeightHistory: [],
  recentMeasurements: [],
  recentSleepEntries: [],
  cardioSessions: [],
  lifetimePRsCount: 0,
  nutritionTargets: null,
  activeProgram: null,
};

const populated: DataState = {
  recentWorkouts: [{}, {}],
  todayMeals: [{}],
  bodyWeightHistory: [{ weightKg: 80 }],
  recentMeasurements: [{ chest: 100 }],
  recentSleepEntries: [{ date: '2026-04-30', durationHours: 7.5 }],
  cardioSessions: [{ type: 'running', durationMinutes: 30 }],
  lifetimePRsCount: 5,
  nutritionTargets: { calories: 2400 },
  activeProgram: { name: 'Iron Coach' },
};

// ─── Brand-new user case ────────────────────────────────────────────────────

describe('buildNoDataMarkers — fresh user', () => {
  test('all 9 markers fire when everything is empty', () => {
    const m = buildNoDataMarkers(empty);
    expect(m.length).toBe(9);
  });

  test('marker text is non-empty and Russian', () => {
    const m = buildNoDataMarkers(empty);
    expect(m.every((line) => line.length > 5)).toBe(true);
    expect(m.every((line) => /[а-я]/i.test(line))).toBe(true);
  });

  test('"никогда" or "нет" or "не установлены" present in each line', () => {
    const m = buildNoDataMarkers(empty);
    // The phrasing must signal absence to the AI clearly.
    for (const line of m) {
      expect(/пусто|нет|не установлены/.test(line)).toBe(true);
    }
  });

  test('weight tracking marker tells user "никогда не взвешивался"', () => {
    const m = buildNoDataMarkers(empty);
    const weightLine = m.find((l) => l.includes('веса тела'));
    expect(weightLine).toBeDefined();
    expect(weightLine).toMatch(/никогда не взвешивался/);
  });

  test('nutrition targets marker tells AI which tool to use', () => {
    const m = buildNoDataMarkers(empty);
    const targetsLine = m.find((l) => l.includes('КБЖУ'));
    expect(targetsLine).toMatch(/update_nutrition_targets/);
  });

  test('program marker tells AI which tools to use', () => {
    const m = buildNoDataMarkers(empty);
    const progLine = m.find((l) => l.includes('программа'));
    expect(progLine).toMatch(/create_program|activate_program/);
  });
});

// ─── Established user case ──────────────────────────────────────────────────

describe('buildNoDataMarkers — established user', () => {
  test('zero markers when everything has data', () => {
    expect(buildNoDataMarkers(populated)).toEqual([]);
  });

  test('only one marker when only weight is missing', () => {
    const state: DataState = { ...populated, bodyWeightHistory: [] };
    const m = buildNoDataMarkers(state);
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/Записи веса тела/);
  });

  test('cardio undefined treated same as empty array', () => {
    const state: DataState = { ...populated, cardioSessions: undefined };
    const m = buildNoDataMarkers(state);
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/Кардио/);
  });

  test('multiple categories empty produces multiple markers', () => {
    const state: DataState = {
      ...populated,
      bodyWeightHistory: [],
      recentSleepEntries: [],
      lifetimePRsCount: 0,
    };
    const m = buildNoDataMarkers(state);
    expect(m.length).toBe(3);
  });
});

// ─── Boundary cases ─────────────────────────────────────────────────────────

describe('buildNoDataMarkers — boundary cases', () => {
  test('single workout means recentWorkouts marker absent', () => {
    const state: DataState = { ...empty, recentWorkouts: [{}] };
    const m = buildNoDataMarkers(state);
    expect(m.find((l) => l.includes('История тренировок'))).toBeUndefined();
  });

  test('single PR means PR marker absent', () => {
    const state: DataState = { ...empty, lifetimePRsCount: 1 };
    const m = buildNoDataMarkers(state);
    expect(m.find((l) => l.includes('Личные рекорды'))).toBeUndefined();
  });

  test('truthy nutritionTargets even with zero calories suppresses marker', () => {
    // edge: user explicitly set 0 calories (weird but valid); object is truthy
    const state: DataState = { ...empty, nutritionTargets: { calories: 0 } };
    const m = buildNoDataMarkers(state);
    expect(m.find((l) => l.includes('КБЖУ'))).toBeUndefined();
  });
});

// ─── Output composition ─────────────────────────────────────────────────────

function composeNoDataSection(markers: string[]): string {
  if (markers.length === 0) return '';
  let out = '\n## ЧЕГО НЕТ В ДАННЫХ (НЕ ВЫДУМЫВАЙ ЦИФРЫ)\n';
  out += markers.map((m) => `- ${m}`).join('\n') + '\n';
  out += 'Если пользователь спрашивает о пунктах из этого списка — честно скажи "у тебя нет таких данных" и предложи начать записывать.\n';
  return out;
}

describe('composeNoDataSection — final prompt fragment', () => {
  test('empty markers → empty string', () => {
    expect(composeNoDataSection([])).toBe('');
  });

  test('section uses uppercase Russian header', () => {
    const out = composeNoDataSection(['История тренировок: пусто']);
    expect(out).toContain('## ЧЕГО НЕТ В ДАННЫХ (НЕ ВЫДУМЫВАЙ ЦИФРЫ)');
  });

  test('every marker prefixed with - bullet', () => {
    const out = composeNoDataSection(['История тренировок: пусто', 'Питание сегодня: пусто']);
    expect(out).toContain('- История тренировок: пусто');
    expect(out).toContain('- Питание сегодня: пусто');
  });

  test('closing instruction tells AI to be honest', () => {
    const out = composeNoDataSection(['anything']);
    expect(out).toMatch(/честно скажи/);
    expect(out).toMatch(/у тебя нет таких данных/);
  });

  test('full empty user produces section under 700 chars (cost-bounded)', () => {
    const m = buildNoDataMarkers(empty);
    const out = composeNoDataSection(m);
    // Cost guard — 9 markers × ~60 chars + headers + closing ≈ 650.
    // If this exceeds 700, the prompt got bloated unintentionally.
    expect(out.length).toBeLessThan(700);
  });
});
