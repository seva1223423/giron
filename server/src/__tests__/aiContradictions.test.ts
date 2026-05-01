/**
 * Round 190 — cross-turn contradiction detection.
 *
 * When the user states something that contradicts a stored memory
 * fact, we surface it so the AI explicitly acknowledges the change
 * instead of silently overwriting (or worse, keeping both contradictory
 * facts in subsequent context).
 */

import {
  detectContradictions,
  formatConflictsDirective,
  type MemoryConflict,
} from '../ai/memoryExtractor';

const stored = (key: string, value: string, category = 'preference', confidence = 0.9) => ({
  key,
  value,
  category,
  confidence,
});

const ext = (key: string, value: string, confidence = 0.9, category = 'preference') => ({
  key,
  value,
  confidence,
  category,
  source: 'stated' as const,
});

describe('detectContradictions — basic cases', () => {
  test('no conflicts when extractions match stored', () => {
    const conflicts = detectContradictions(
      [ext('user_goal', 'похудение')],
      [stored('user_goal', 'похудение')],
    );
    expect(conflicts).toEqual([]);
  });

  test('no conflicts when extraction key not in stored', () => {
    const conflicts = detectContradictions(
      [ext('user_goal', 'похудение')],
      [stored('different_key', 'something')],
    );
    expect(conflicts).toEqual([]);
  });

  test('flags goal change: похудение → набор массы', () => {
    const conflicts = detectContradictions(
      [ext('user_goal', 'набор массы')],
      [stored('user_goal', 'похудение')],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].key).toBe('user_goal');
    expect(conflicts[0].oldValue).toBe('похудение');
    expect(conflicts[0].newValue).toBe('набор массы');
  });

  test('flags target weight change: 75kg → 80kg', () => {
    const conflicts = detectContradictions(
      [ext('target_weight_kg', '80', 0.9, 'goal')],
      [stored('target_weight_kg', '75', 'goal', 0.9)],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].oldValue).toBe('75');
    expect(conflicts[0].newValue).toBe('80');
  });

  test('flags training frequency change: 3x → 5x', () => {
    const conflicts = detectContradictions(
      [ext('training_frequency', '5 раз в неделю', 0.9, 'schedule')],
      [stored('training_frequency', '3 раз в неделю', 'schedule', 0.9)],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].category).toBe('schedule');
  });
});

describe('detectContradictions — confidence gating', () => {
  test('skips conflict when extraction confidence < 0.8', () => {
    const conflicts = detectContradictions(
      [ext('user_goal', 'набор массы', 0.6)], // low confidence
      [stored('user_goal', 'похудение')],
    );
    expect(conflicts).toEqual([]);
  });

  test('skips conflict when stored confidence < 0.8', () => {
    const conflicts = detectContradictions(
      [ext('user_goal', 'набор массы')],
      [stored('user_goal', 'похудение', 'preference', 0.6)], // low stored
    );
    expect(conflicts).toEqual([]);
  });

  test('flags only when both confidences >= 0.8', () => {
    const conflicts = detectContradictions(
      [ext('user_goal', 'набор массы', 0.85)],
      [stored('user_goal', 'похудение', 'preference', 0.85)],
    );
    expect(conflicts).toHaveLength(1);
  });
});

describe('detectContradictions — append-only keys are skipped', () => {
  // Multi-match keys (allergy_*, equipment_*, etc.) generate unique
  // keys per match by design — they don't conflict with each other.
  test('allergy_* keys not treated as conflicts', () => {
    const conflicts = detectContradictions(
      [ext('allergy_орехи', 'орехи')],
      [stored('allergy_орехи', 'old value', 'allergy')],
    );
    expect(conflicts).toEqual([]);
  });

  test('equipment_* keys not treated as conflicts', () => {
    const conflicts = detectContradictions(
      [ext('equipment_штанга', 'штанга')],
      [stored('equipment_штанга', 'штанг', 'preference')],
    );
    expect(conflicts).toEqual([]);
  });

  test('past_injury_* keys not treated as conflicts', () => {
    const conflicts = detectContradictions(
      [ext('past_injury_спин', 'спина')],
      [stored('past_injury_спин', 'спин', 'injury')],
    );
    expect(conflicts).toEqual([]);
  });

  test('pain_* keys not treated as conflicts (multi-match)', () => {
    const conflicts = detectContradictions(
      [ext('pain_спин_жим', 'спина при жим')],
      [stored('pain_спин_жим', 'old', 'injury')],
    );
    expect(conflicts).toEqual([]);
  });

  test('pr_target_* keys not treated as conflicts', () => {
    const conflicts = detectContradictions(
      [ext('pr_target_жим', '120 кг (жим)', 0.9, 'goal')],
      [stored('pr_target_жим', '110 кг (жим)', 'goal', 0.9)],
    );
    expect(conflicts).toEqual([]);
  });
});

describe('detectContradictions — multiple conflicts', () => {
  test('returns all conflicts when multiple change', () => {
    const conflicts = detectContradictions(
      [
        ext('user_goal', 'набор массы'),
        ext('training_frequency', '5 раз в неделю', 0.9, 'schedule'),
        ext('current_weight_kg', '85', 0.9),
      ],
      [
        stored('user_goal', 'похудение'),
        stored('training_frequency', '3 раз в неделю', 'schedule'),
        stored('current_weight_kg', '80'),
      ],
    );
    expect(conflicts).toHaveLength(3);
    const keys = conflicts.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['user_goal', 'training_frequency', 'current_weight_kg']));
  });
});

describe('formatConflictsDirective', () => {
  test('empty list returns empty string', () => {
    expect(formatConflictsDirective([])).toBe('');
  });

  test('single conflict produces directive with old → new', () => {
    const conflicts: MemoryConflict[] = [
      { key: 'user_goal', oldValue: 'похудение', newValue: 'набор массы', category: 'preference' },
    ];
    const directive = formatConflictsDirective(conflicts);
    expect(directive).toContain('user_goal');
    expect(directive).toContain('похудение');
    expect(directive).toContain('набор массы');
    expect(directive).toContain('Уточни мягко');
    expect(directive).toContain('Не перезаписывай молча');
  });

  test('multiple conflicts joined as bulleted list', () => {
    const conflicts: MemoryConflict[] = [
      { key: 'user_goal', oldValue: 'похудение', newValue: 'набор массы', category: 'preference' },
      { key: 'training_frequency', oldValue: '3', newValue: '5', category: 'schedule' },
    ];
    const directive = formatConflictsDirective(conflicts);
    expect(directive.split('•').length - 1).toBe(2); // 2 bullet points
  });

  test('caps at 3 conflicts to bound prompt growth', () => {
    const conflicts: MemoryConflict[] = Array.from({ length: 10 }, (_, i) => ({
      key: `key${i}`,
      oldValue: `old${i}`,
      newValue: `new${i}`,
      category: 'preference',
    }));
    const directive = formatConflictsDirective(conflicts);
    // 3 bullets max
    expect(directive.split('•').length - 1).toBe(3);
    expect(directive).toContain('key0');
    expect(directive).toContain('key1');
    expect(directive).toContain('key2');
    expect(directive).not.toContain('key4');
  });
});
