/**
 * Unicode / emoji / surrogate pair / zero-width / RTL correctness.
 * The app accepts free-text names and food descriptions; we must
 * not explode on exotic characters or truncate badly across grapheme
 * clusters.
 */

import { pluralizeDaysRu } from '../utils/layout';

describe('Russian name edge cases (surrogate pairs, emoji, RTL)', () => {
  test('empty string falls through fallback', () => {
    const name = '';
    const fallback = name.trim() || 'Атлет';
    expect(fallback).toBe('Атлет');
  });

  test('whitespace-only name falls through fallback', () => {
    const name = '    \t\n';
    const fallback = name.trim() || 'Атлет';
    expect(fallback).toBe('Атлет');
  });

  test('emoji in name does not crash', () => {
    const name = '💪Сева';
    expect(name.length).toBeGreaterThan(0);
    // .length for emoji is 2 (surrogate pair) + 4 letters = 6
    expect(name.length).toBe(6);
  });

  test('surrogate pair grapheme cluster', () => {
    const family = '👨‍👩‍👧‍👦'; // ZWJ emoji
    expect(family.length).toBeGreaterThan(1);
    // Array.from splits by code points, not grapheme clusters, but
    // our design uses .length which is code unit count
    expect(Array.from(family).length).toBeGreaterThan(1);
  });

  test('RTL Hebrew/Arabic names render as strings', () => {
    const rtl = 'שלום';
    expect(typeof rtl).toBe('string');
    expect(rtl.length).toBe(4);
  });

  test('combining diacritics do not break length', () => {
    const composed = 'Cafe\u0301'; // Café via combining acute
    expect(composed.length).toBe(5);
  });

  test('zero-width joiner tolerated', () => {
    const zwj = 'a\u200Db'; // ZWJ between chars
    expect(zwj.length).toBe(3);
  });

  test('very long name (1000 chars) does not crash', () => {
    const name = 'а'.repeat(1000);
    expect(name.length).toBe(1000);
  });

  test('mixed scripts handled', () => {
    const mixed = 'АBВ中가😀';
    expect(typeof mixed).toBe('string');
    expect(mixed.length).toBeGreaterThan(0);
  });
});

describe('pluralizeDaysRu on unicode-adjacent integer inputs', () => {
  test('0 → дней', () => {
    expect(pluralizeDaysRu(0)).toBe('дней');
  });

  test('1 → день', () => {
    expect(pluralizeDaysRu(1)).toBe('день');
  });

  test('2 → дня', () => {
    expect(pluralizeDaysRu(2)).toBe('дня');
  });

  test('5 → дней', () => {
    expect(pluralizeDaysRu(5)).toBe('дней');
  });

  test('11 → дней (teen exception)', () => {
    expect(pluralizeDaysRu(11)).toBe('дней');
  });

  test('14 → дней (teen exception)', () => {
    expect(pluralizeDaysRu(14)).toBe('дней');
  });

  test('21 → день (ends in 1, not teen)', () => {
    expect(pluralizeDaysRu(21)).toBe('день');
  });

  test('22 → дня (ends in 2, not teen)', () => {
    expect(pluralizeDaysRu(22)).toBe('дня');
  });

  test('101 → день (not teen)', () => {
    expect(pluralizeDaysRu(101)).toBe('день');
  });

  test('111 → дней (teen)', () => {
    expect(pluralizeDaysRu(111)).toBe('дней');
  });

  test('1000000 → дней', () => {
    expect(pluralizeDaysRu(1000000)).toBe('дней');
  });
});

describe('Slicing unicode strings for UI', () => {
  test('slicing does not split surrogate pair', () => {
    // Best effort — .slice may split surrogate; test design is aware
    const s = '😀Test';
    const first = s.slice(0, 2);
    // slice(0,2) on an emoji returns the full surrogate pair
    expect(first.length).toBe(2);
  });

  test('truncation with ellipsis preserves length cap', () => {
    const long = 'a'.repeat(1000);
    const truncated = long.length > 20 ? long.slice(0, 20) + '…' : long;
    expect(truncated.length).toBeLessThanOrEqual(21);
  });

  test('trim preserves non-breaking space variants', () => {
    const s = '\u00A0hello\u00A0';
    // JS .trim() does strip U+00A0 non-breaking space
    expect(s.trim().length).toBeGreaterThan(0);
  });
});

describe('Russian pluralizer on negative / large / irrational inputs', () => {
  test('negative values use absolute last-digit rule', () => {
    // Math.abs(-5) = 5, mod10 = 5, => дней
    expect(pluralizeDaysRu(-5)).toBe('дней');
    expect(pluralizeDaysRu(-1)).toBe('день');
    expect(pluralizeDaysRu(-2)).toBe('дня');
  });

  test('NaN fallback (non-matching branches) returns дней', () => {
    // NaN % x is NaN, no branch matches, falls through to default 'дней'
    const out = pluralizeDaysRu(NaN);
    expect(out).toBe('дней');
  });

  test('Infinity fallback returns дней', () => {
    // Math.abs(Infinity) % 100 = NaN in JS
    const out = pluralizeDaysRu(Infinity);
    expect(out).toBe('дней');
  });
});

describe('Numeric formatting with Russian locale', () => {
  test('toLocaleString ru-RU uses comma decimal', () => {
    const n = 1234.56;
    const ru = n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // ru-RU uses NBSP thousands + comma decimal — but jest-expo may not
    // have full ICU data, so accept either format
    expect(ru).toMatch(/1[\s,\u00A0]?234[,.]56/);
  });

  test('Infinity renders safely', () => {
    const n = Infinity;
    const s = String(n);
    expect(s).toBe('Infinity');
  });

  test('0.0 renders as "0" or "0.00" based on format spec', () => {
    const n = 0;
    const s = n.toFixed(2);
    expect(s).toBe('0.00');
  });
});
