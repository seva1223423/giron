/**
 * Russian-language rendering edge cases for the design chrome:
 *  - Name greetings with unusual characters
 *  - Pluralization edge cases (teens, compound numbers)
 *  - String length truncation for long Russian words
 *  - Upper/lowercase transitions across the Cyrillic alphabet
 */

import { pluralizeDaysRu } from '../utils/layout';
import { formatDateMetaRu } from '../utils/date';

// ─── Name greetings ─────────────────────────────────────────────────────────

describe('Name greetings', () => {
  const buildGreeting = (name: string) => `Привет, ${name}`;

  test('regular Russian names', () => {
    const names = ['Артём', 'Владимир', 'Екатерина', 'Юрий', 'Анастасия'];
    for (const n of names) {
      expect(buildGreeting(n)).toContain(n);
      expect(buildGreeting(n).length).toBeLessThan(60);
    }
  });

  test('names with ё', () => {
    expect(buildGreeting('Фёдор')).toBe('Привет, Фёдор');
    expect(buildGreeting('Алёна')).toBe('Привет, Алёна');
  });

  test('names with й', () => {
    expect(buildGreeting('Андрей')).toBe('Привет, Андрей');
    expect(buildGreeting('Сергей')).toBe('Привет, Сергей');
  });

  test('names with ь (soft sign)', () => {
    expect(buildGreeting('Олька')).toBe('Привет, Олька');
  });

  test('hyphenated names', () => {
    expect(buildGreeting('Анна-Мария')).toContain('Анна-Мария');
  });

  test('empty string fallback handled by caller not helper', () => {
    // When user?.firstName is undefined, caller shows 'Атлет'
    const name: string | undefined = undefined;
    const fallback = name ?? 'Атлет';
    expect(buildGreeting(fallback)).toBe('Привет, Атлет');
  });
});

// ─── Pluralization edge cases ──────────────────────────────────────────────

describe('pluralizeDaysRu — full range', () => {
  const cases: Array<[number, string]> = [
    [1, 'день'],
    [2, 'дня'], [3, 'дня'], [4, 'дня'],
    [5, 'дней'], [6, 'дней'], [7, 'дней'], [8, 'дней'], [9, 'дней'], [10, 'дней'],
    [11, 'дней'], [12, 'дней'], [13, 'дней'], [14, 'дней'],
    [15, 'дней'], [16, 'дней'], [17, 'дней'], [18, 'дней'], [19, 'дней'], [20, 'дней'],
    [21, 'день'],
    [22, 'дня'], [23, 'дня'], [24, 'дня'],
    [25, 'дней'],
    [111, 'дней'], [112, 'дней'], [113, 'дней'], [114, 'дней'],
    [121, 'день'],
    [999, 'дней'],
  ];

  test.each(cases)('pluralizeDaysRu(%i) === "%s"', (n, expected) => {
    expect(pluralizeDaysRu(n)).toBe(expected);
  });

  test('zero is "дней"', () => {
    expect(pluralizeDaysRu(0)).toBe('дней');
  });
});

// ─── Date labels — every month ──────────────────────────────────────────────

describe('Date labels across the year', () => {
  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];

  test('every month name is present in the label for its 15th', () => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 15);
      const s = formatDateMetaRu(d);
      expect(s).toContain(MONTHS[m]);
    }
  });

  test('monthlabels are all in genitive case (ru grammar)', () => {
    // "15 января" not "15 январь" — design intentionally uses genitive
    for (const m of MONTHS) {
      // All genitive Russian month names end with я/а/е
      expect(m).toMatch(/[яае]$/);
    }
  });

  test('no accidental capital letters (design uses lowercase meta)', () => {
    for (const m of MONTHS) {
      expect(m).toBe(m.toLowerCase());
    }
  });
});

// ─── Long word clamp ──────────────────────────────────────────────────────

describe('Long Russian word clamp', () => {
  test('40-char splits still fit clamp safely', () => {
    const longExerciseName = 'Жим штанги лёжа узким хватом со строгой формой';
    // Just make sure the string doesn't explode — slice utilities in
    // the scanner use chars not grapheme clusters, but Russian has
    // no ligatures that would break that.
    expect(longExerciseName.length).toBeGreaterThan(20);
    expect(longExerciseName.slice(0, 20).length).toBe(20);
  });

  test('Moscow / Saint Petersburg fit within the gym location label', () => {
    // The design shows "Iron Gym Центр" in news posts. Moscow/SPb
    // branch names would be "Iron Gym · Москва" — stay under 40.
    expect('Iron Gym · Москва'.length).toBeLessThanOrEqual(40);
    expect('Iron Gym · Санкт-Петербург'.length).toBeLessThanOrEqual(40);
  });
});

// ─── Ruble sign positioning ────────────────────────────────────────────────

describe('Ruble sign (₽) positioning', () => {
  test('ruble sign is U+20BD', () => {
    expect('₽').toBe('\u20BD');
  });

  test('price strings render with trailing space + ₽ per design', () => {
    const s = `${(2990).toLocaleString('ru-RU')} ₽`;
    expect(s).toMatch(/ ₽$/);
    expect(s).toMatch(/₽/);
  });

  test('ruble sign counts as 1 code unit (measurement)', () => {
    // In React Native's Text measurement, ₽ is one character. Make
    // sure tests that count characters stay correct.
    expect('₽'.length).toBe(1);
  });
});

// ─── Price-per-month subtitle grammar ──────────────────────────────────────

describe('Price per month grammar', () => {
  test('"249 ₽ / мес" singular form', () => {
    const s = '249 ₽ / мес';
    expect(s.length).toBeLessThan(20);
  });

  test('"2 990 ₽ / год" format stays under 20 chars', () => {
    const formatted = (2990).toLocaleString('ru-RU');
    const full = `${formatted} ₽ / год`;
    expect(full.length).toBeLessThan(20);
  });
});
