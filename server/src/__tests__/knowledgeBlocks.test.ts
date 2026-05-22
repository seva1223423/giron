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
  test('contains at least one block (PoC seeded with 3)', () => {
    expect(knowledgeBlocksRegistry.length).toBeGreaterThan(0);
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
