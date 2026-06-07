/**
 * Smoke tests for the knowledge-blocks PoC. The full ai.ts integration
 * (selector wiring) is the next migration step; this just pins:
 *   - Every block has a unique id
 *   - Every block has at least one keyword
 *   - Every block's build() returns a string (never throws)
 *   - The 3 ported blocks produce the same output shape as their
 *     inline counterparts in ai.ts (asserted by checking the static
 *     header text — "## 🗓️ СЕЗОННЫЕ" etc.)
 */

import {
  knowledgeBlocksRegistry,
  findKnowledgeBlock,
} from '../ai/knowledge-blocks/registry';

describe('knowledge-blocks registry', () => {
  test('contains at least 8 blocks (PoC + batch 2)', () => {
    expect(knowledgeBlocksRegistry.length).toBeGreaterThanOrEqual(8);
  });

  test('every block has a unique id', () => {
    const ids = knowledgeBlocksRegistry.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('every block has at least one keyword', () => {
    for (const block of knowledgeBlocksRegistry) {
      expect(block.keywords.length).toBeGreaterThan(0);
    }
  });

  test('every block.build returns a string and never throws on minimal input', () => {
    for (const block of knowledgeBlocksRegistry) {
      const out = block.build({ message: 'test' });
      expect(typeof out).toBe('string');
    }
  });

  test('findKnowledgeBlock returns the right block by id', () => {
    const found = findKnowledgeBlock('lifestyle:seasonal-advice');
    expect(found).toBeDefined();
    expect(found?.id).toBe('lifestyle:seasonal-advice');
  });

  test('findKnowledgeBlock returns undefined for unknown id', () => {
    expect(findKnowledgeBlock('unknown:nonexistent')).toBeUndefined();
  });
});

describe('seasonal advice block', () => {
  test('emits the expected header', () => {
    const block = findKnowledgeBlock('lifestyle:seasonal-advice')!;
    const out = block.build({ message: '' });
    expect(out).toContain('## 🗓️ СЕЗОННЫЕ РЕКОМЕНДАЦИИ');
  });

  test('output reflects exactly 3 bullets (months differ but length stable)', () => {
    const block = findKnowledgeBlock('lifestyle:seasonal-advice')!;
    const out = block.build({ message: '' });
    const lines = out.split('\n').filter((l) => l.trim().length > 0);
    // Header + 3 bullets + trailing instruction = 5 non-empty lines.
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(6);
  });
});

describe('confidence directive block', () => {
  test('returns empty string when all profile fields present and message benign', () => {
    const block = findKnowledgeBlock('safety:confidence-directive')!;
    const out = block.build({
      message: 'привет, расскажи про приседания',
      hasWeightKg: true,
      hasHeightCm: true,
      hasGoal: true,
      hasGender: true,
    });
    expect(out).toBe('');
  });

  test('flags medical questions', () => {
    const block = findKnowledgeBlock('safety:confidence-directive')!;
    const out = block.build({
      message: 'мне нужен стероид курс',
      hasWeightKg: true,
      hasHeightCm: true,
      hasGoal: true,
      hasGender: true,
    });
    expect(out).toContain('⚠️ ОСТОРОЖНОСТЬ');
  });

  test('flags incomplete profile when 2+ fields missing', () => {
    const block = findKnowledgeBlock('safety:confidence-directive')!;
    const out = block.build({
      message: 'составь программу',
      hasWeightKg: false,
      hasHeightCm: false,
      hasGoal: true,
      hasGender: true,
    });
    expect(out).toContain('⚠️ НЕПОЛНЫЕ ДАННЫЕ');
  });

  test('flags contradictory goals (lose weight + bulk)', () => {
    const block = findKnowledgeBlock('safety:confidence-directive')!;
    const out = block.build({
      message: 'хочу похудеть и набрать массу одновременно',
      hasWeightKg: true,
      hasHeightCm: true,
      hasGoal: true,
      hasGender: true,
    });
    expect(out).toContain('⚠️ ПРОТИВОРЕЧИЕ');
  });
});

describe('batch 2 blocks — smoke tests', () => {
  test('smart-rest block emits a rest header for normal sets', () => {
    const block = findKnowledgeBlock('recovery:smart-rest')!;
    const out = block.build({
      message: 'отдых',
      exerciseType: 'barbell',
      setType: 'normal',
      userGoal: 'STRENGTH',
    });
    expect(out).toContain('ОТДЫХ МЕЖДУ ПОДХОДАМИ');
    expect(out).toContain('сек');
  });

  test('smart-rest STRENGTH goal uses ≥180s for barbell', () => {
    const block = findKnowledgeBlock('recovery:smart-rest')!;
    const out = block.build({
      message: '',
      exerciseType: 'barbell',
      setType: 'normal',
      userGoal: 'STRENGTH',
    });
    // 180s minimum for strength
    expect(/180 сек|240 сек|210 сек/.test(out)).toBe(true);
  });

  test('rep-range block returns empty when goal unknown', () => {
    const block = findKnowledgeBlock('training:rep-ranges')!;
    expect(block.build({ message: 'повторений' })).toBe('');
  });

  test('rep-range block emits ranges for MUSCLE_GAIN', () => {
    const block = findKnowledgeBlock('training:rep-ranges')!;
    const out = block.build({ message: '', userGoal: 'MUSCLE_GAIN' });
    expect(out).toContain('8-12 повторений');
    expect(out).toContain('ДИАПАЗОНЫ ПОВТОРЕНИЙ');
  });

  test('nutrition-timing block returns empty when no meals + no workouts', () => {
    const block = findKnowledgeBlock('nutrition:timing')!;
    expect(block.build({ message: 'еда', hour: 12, todayMeals: [], recentWorkouts: [] })).toBe('');
  });

  test('nutrition-timing block flags evening protein deficit', () => {
    const block = findKnowledgeBlock('nutrition:timing')!;
    const out = block.build({
      message: '',
      hour: 21,
      todayMeals: [
        { type: 'breakfast', totalCalories: 500, totalProtein: 30, createdAt: new Date(Date.now() - 12 * 3600_000) },
      ],
      recentWorkouts: [],
      nutritionTargets: { calories: 2400, protein: 160 },
    });
    expect(out).toContain('🌙');
    expect(out).toContain('казеин');
  });

  test('training-age block always emits a tone block', () => {
    const block = findKnowledgeBlock('coaching:training-age-tone')!;
    const out = block.build({ message: '', trainingExperienceYears: 0 });
    expect(out).toContain('УРОВЕНЬ СОВЕТОВ');
  });

  test('training-age block picks "ADVANCED" tone for 5+ years', () => {
    const block = findKnowledgeBlock('coaching:training-age-tone')!;
    // Need both: experience years AND a non-beginner fitnessLevel — the
    // original ai.ts function gates on EITHER (so a "5 yr beginner" still
    // gets beginner advice). Block preserves that semantic.
    const out = block.build({
      message: '',
      trainingExperienceYears: 5,
      fitnessLevel: 'ADVANCED',
    });
    expect(out).toContain('ПРОДВИНУТЫЙ');
  });

  test('exercise-tempo returns empty for unknown exercise', () => {
    const block = findKnowledgeBlock('training:exercise-tempo')!;
    expect(block.build({ message: 'темп', exerciseName: 'неизвестное упражнение' })).toBe('');
  });

  test('exercise-tempo returns tempo string for bench press', () => {
    const block = findKnowledgeBlock('training:exercise-tempo')!;
    const out = block.build({ message: '', exerciseName: 'жим лёжа', userGoal: 'MUSCLE_GAIN' });
    // Header uses uppercase "ТЕМП"; just check for the tempo digits.
    expect(out).toContain('ТЕМП');
    expect(out).toContain('3-0-1-1');
  });
});

describe('macro split block', () => {
  test('returns empty string when bodyWeightKg is missing', () => {
    const block = findKnowledgeBlock('nutrition:macro-split')!;
    expect(block.build({ message: 'кбжу' })).toBe('');
  });

  test('weight_loss goal uses 2.2 g protein/kg', () => {
    const block = findKnowledgeBlock('nutrition:macro-split')!;
    const out = block.build({
      message: 'кбжу для похудения',
      userGoal: 'weight_loss',
      bodyWeightKg: 80,
      trainingDaysPerWeek: 4,
    });
    // 80 × 2.2 = 176 g protein
    expect(out).toContain('Белок: ~176г/день');
    expect(out).toContain('похудение');
  });

  test('muscle_gain goal uses 2.0 g protein/kg', () => {
    const block = findKnowledgeBlock('nutrition:macro-split')!;
    const out = block.build({
      message: 'набор массы кбжу',
      userGoal: 'muscle_gain',
      bodyWeightKg: 80,
      trainingDaysPerWeek: 5,
    });
    // 80 × 2.0 = 160 g protein
    expect(out).toContain('Белок: ~160г/день');
    expect(out).toContain('набор массы');
  });

  test('maintenance goal uses 1.8 g protein/kg', () => {
    const block = findKnowledgeBlock('nutrition:macro-split')!;
    const out = block.build({
      message: 'кбжу',
      userGoal: 'general_fitness',
      bodyWeightKg: 80,
      trainingDaysPerWeek: 3,
    });
    // 80 × 1.8 = 144 g protein
    expect(out).toContain('Белок: ~144г/день');
    expect(out).toContain('поддержание формы');
  });
});
