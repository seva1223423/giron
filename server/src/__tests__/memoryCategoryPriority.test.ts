/**
 * Drift-catcher (round 101): every category emitted by MEMORY_PATTERNS in
 * memoryExtractor must be registered in MEMORY_CATEGORY_PRIORITY in
 * contextEngine. Without this test, a future round adding a fresh
 * category (e.g. 'wellness') to memoryExtractor.ts would silently sort to
 * position 99 ("last") in the rendered chat memory block — and the LLM
 * would attend to it after every other category. That's a stealth
 * regression: facts go in the prompt, just below the attention threshold,
 * and nobody notices until the AI keeps "forgetting" the new fact type.
 *
 * Conversely, removing a category from MEMORY_PATTERNS without removing
 * it from MEMORY_CATEGORY_PRIORITY is a smaller bug (extra entry no
 * longer used), but worth flagging.
 */

import { MEMORY_PATTERNS } from '../ai/memoryExtractor';
import { MEMORY_CATEGORY_PRIORITY } from '../ai/contextEngine';

describe('MEMORY_CATEGORY_PRIORITY consistency', () => {
  test('every category emitted by MEMORY_PATTERNS is registered in MEMORY_CATEGORY_PRIORITY', () => {
    const emittedCategories = new Set(MEMORY_PATTERNS.map((p) => p.category));
    const registeredCategories = new Set(Object.keys(MEMORY_CATEGORY_PRIORITY));

    for (const cat of emittedCategories) {
      expect(registeredCategories.has(cat)).toBe(true);
    }
  });

  test('no orphaned entries in MEMORY_CATEGORY_PRIORITY (every key is also emitted by some pattern)', () => {
    const emittedCategories = new Set(MEMORY_PATTERNS.map((p) => p.category));
    const registeredCategories = Object.keys(MEMORY_CATEGORY_PRIORITY);

    for (const cat of registeredCategories) {
      expect(emittedCategories.has(cat)).toBe(true);
    }
  });

  test('priority values are non-negative and unique', () => {
    const values = Object.values(MEMORY_CATEGORY_PRIORITY);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
    // Uniqueness — duplicate priorities would produce non-deterministic
    // ordering for tied categories.
    expect(new Set(values).size).toBe(values.length);
  });

  // Round 131: dead-pattern catcher.
  test('no two patterns share both the same regex source AND the same key (dead-pattern catcher)', () => {
    const seen = new Map<string, number>();
    for (const p of MEMORY_PATTERNS) {
      const sig = `${p.regex.source}::${p.key}`;
      seen.set(sig, (seen.get(sig) ?? 0) + 1);
    }
    const duplicates = Array.from(seen.entries()).filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);
  });

  test('every pattern has a non-empty regex source and a non-empty key', () => {
    for (const p of MEMORY_PATTERNS) {
      expect(p.regex.source.length).toBeGreaterThan(0);
      expect(p.key.length).toBeGreaterThan(0);
    }
  });

  test('multiMatch patterns must define keyFn (otherwise they overwrite each other)', () => {
    for (const p of MEMORY_PATTERNS) {
      if (p.multiMatch) {
        expect(typeof p.keyFn).toBe('function');
      }
    }
  });

  test('confidence values stay in (0, 1) when explicitly set', () => {
    for (const p of MEMORY_PATTERNS) {
      if (typeof p.confidence === 'number') {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});
