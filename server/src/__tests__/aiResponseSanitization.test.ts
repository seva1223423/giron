/**
 * Round 190 — AI response post-processing.
 *
 * Tests the additions to `cleanResponse`:
 *   • Russian transliteration consistency (1RM/1PM → 1ПМ, PR → ПР)
 *   • Profanity passthrough guard (мат → ***)
 *
 * cleanResponse already strips opening/closing fluff — this test
 * file focuses on the round-190 additions.
 */

import { cleanResponse } from '../services/deepseekAI';

describe('cleanResponse — transliteration consistency (round 190)', () => {
  test('1RM → 1ПМ', () => {
    const out = cleanResponse('Подними 80% от 1RM');
    expect(out).toContain('1ПМ');
    expect(out).not.toContain('1RM');
  });

  test('1PM → 1ПМ (alternate spelling)', () => {
    const out = cleanResponse('Это 75% от 1PM');
    expect(out).toContain('1ПМ');
    expect(out).not.toContain('1PM');
  });

  test('1 RM (with space) → 1ПМ', () => {
    const out = cleanResponse('Что такое 1 RM?');
    expect(out).toContain('1ПМ');
  });

  test('PR (personal record) → ПР between word boundaries', () => {
    const out = cleanResponse('Поставил PR в жиме 100 кг.');
    expect(out).toContain('ПР');
    expect(out).not.toMatch(/\bPR\b/);
  });

  test('PB (personal best) → ПР', () => {
    const out = cleanResponse('Это PB на сегодня.');
    expect(out).toContain('ПР');
    expect(out).not.toMatch(/\bPB\b/);
  });

  test('does NOT replace PR inside compound words', () => {
    // "PR-предсказание" should stay (proper noun-like compound)
    const out = cleanResponse('Алгоритм PR-предсказания работает.');
    // The inner 'PR' is part of compound — stays
    expect(out).toContain('PR-предсказания');
  });

  test('does NOT replace PR at end of word', () => {
    const out = cleanResponse('expert');
    // "PR" inside "expert" not standalone — should not be replaced
    expect(out).toBe('expert');
  });

  test('handles multiple replacements in one response', () => {
    const out = cleanResponse('1RM = 100 кг. PR в жиме = 80 кг. PB на присед = 120 кг.');
    expect(out).toContain('1ПМ');
    // Use Cyrillic-aware boundary check (JS \b doesn't work with Cyrillic)
    expect(out).toMatch(/(?:^|[^а-яА-Я])ПР(?:[^а-яА-Я]|$)/);
    expect(out).not.toContain('1RM');
    expect(out).not.toMatch(/(?:^|[^а-яА-Я])PR(?:[^а-яА-Я]|$)/);
    expect(out).not.toMatch(/(?:^|[^а-яА-Я])PB(?:[^а-яА-Я]|$)/);
  });
});

describe('cleanResponse — profanity passthrough guard (round 190)', () => {
  test('"бля" → ***', () => {
    const out = cleanResponse('Ну бля, это сложно');
    expect(out).toContain('***');
    expect(out).not.toContain('бля');
  });

  test('"блядь" → ***', () => {
    const out = cleanResponse('Ох блядь, что делать?');
    expect(out).toContain('***');
    expect(out).not.toMatch(/блядь/i);
  });

  test('"сука" → ***', () => {
    const out = cleanResponse('Ну сука, как же');
    expect(out).toContain('***');
    expect(out).not.toMatch(/сука/i);
  });

  test('"пиздец" → ***', () => {
    const out = cleanResponse('Это пиздец какой-то');
    expect(out).toContain('***');
    expect(out).not.toMatch(/пиздец/i);
  });

  test('does NOT touch innocent Russian text', () => {
    const out = cleanResponse('Хорошая тренировка! Продолжай в том же духе.');
    expect(out).toBe('Хорошая тренировка! Продолжай в том же духе.');
  });

  test('multiple profanities all replaced', () => {
    const out = cleanResponse('Бля, эта сука нагрузка пиздец сложная');
    const stars = (out.match(/\*\*\*/g) || []).length;
    expect(stars).toBeGreaterThanOrEqual(3);
  });

  test('case-insensitive matching', () => {
    const out = cleanResponse('БЛЯ как тяжело');
    expect(out).toContain('***');
  });
});

describe('cleanResponse — combinations', () => {
  test('handles transliteration + profanity in same response', () => {
    const out = cleanResponse('Бля, поставил PR на 1RM = 120 кг.');
    expect(out).toContain('***');
    expect(out).toContain('ПР');
    expect(out).toContain('1ПМ');
  });

  test('does NOT break existing fluff-stripping', () => {
    const out = cleanResponse('Конечно! Поставил PR в жиме.');
    // "Конечно!" stripped + PR → ПР
    expect(out).not.toMatch(/^Конечно/);
    expect(out).toContain('ПР');
  });

  test('preserves trim behavior', () => {
    const out = cleanResponse('   Поставил PR.   ');
    expect(out).not.toMatch(/^\s/);
    expect(out).not.toMatch(/\s$/);
  });
});
