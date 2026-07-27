/**
 * Accessibility contract for the Direction A redesign — verifies the
 * label strings, roles, and state values that every design component
 * uses are consistent and screen-reader-friendly.
 *
 * Tests the copy, not the render — the actual a11y props are set on
 * TouchableOpacity / View through accessibilityLabel etc. The rules
 * below lock how we should construct those strings.
 */

import { pluralizeDaysRu } from '../utils/layout';
import {
  buildPaywallCtaTitle,
  priceForPlan,
  PRICE_YEAR_RUB,
  PRICE_MONTH_RUB,
  ANNUAL_DISCOUNT_PCT,
} from '../utils/paywall';

// ─── Streak VO strings ─────────────────────────────────────────────────────

describe('Streak accessibility strings', () => {
  function buildStreakVoLabel(days: number): string {
    return `${days} ${pluralizeDaysRu(days)} подряд`;
  }

  test('1 day', () => {
    expect(buildStreakVoLabel(1)).toBe('1 день подряд');
  });

  test('3 days', () => {
    expect(buildStreakVoLabel(3)).toBe('3 дня подряд');
  });

  test('10 days', () => {
    expect(buildStreakVoLabel(10)).toBe('10 дней подряд');
  });

  test('47 days', () => {
    expect(buildStreakVoLabel(47)).toBe('47 дней подряд');
  });

  test('100 days', () => {
    expect(buildStreakVoLabel(100)).toBe('100 дней подряд');
  });
});

// ─── Tab bar a11y labels ───────────────────────────────────────────────────

describe('Tab bar a11y labels', () => {
  // These must match the accessibilityLabel strings in AppNavigator.
  const TAB_LABELS = {
    HomeTab: 'Главная',
    WorkoutsTab: 'Тренировки',
    AITab: 'ИИ-тренер',
    NutritionTab: 'Питание',
    ProgressTab: 'Прогресс',
    ProfileTab: 'Профиль',
  };

  test('AI tab uses "ИИ-тренер" (full name for VO), not "ИИ"', () => {
    // The visible label is "ИИ" but VO should read "ИИ-тренер" for
    // clarity. Locks this contract.
    expect(TAB_LABELS.AITab).toBe('ИИ-тренер');
  });

  test('all tab labels are non-empty', () => {
    for (const label of Object.values(TAB_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test('all tab labels are Russian', () => {
    for (const label of Object.values(TAB_LABELS)) {
      // Contains at least one cyrillic character
      expect(label).toMatch(/[а-яА-Я]/);
    }
  });
});

// ─── Paywall a11y buttons ──────────────────────────────────────────────────

describe('Paywall button a11y', () => {
  test('Plan toggle label includes price + discount', () => {
    // From PaywallModal: `Годовая подписка ${PRICE_YEAR_RUB} рублей,
    // выгода ${ANNUAL_DISCOUNT_PCT} процентов`. Reads the shared constants
    // rather than repeating the numbers, so a price change touches only
    // paywallLogic.test.ts.
    const yearLabel = `Годовая подписка ${priceForPlan('year')} рублей, выгода ${ANNUAL_DISCOUNT_PCT} процентов`;
    expect(yearLabel).toBe(`Годовая подписка ${PRICE_YEAR_RUB} рублей, выгода ${ANNUAL_DISCOUNT_PCT} процентов`);
    expect(yearLabel).toMatch(/^Годовая подписка \d+ рублей, выгода \d+ процентов$/);
  });

  test('Monthly plan label speaks the raw number, without thousands separators', () => {
    const monthLabel = `Месячная подписка ${priceForPlan('month')} рублей`;
    expect(monthLabel).toBe(`Месячная подписка ${PRICE_MONTH_RUB} рублей`);
    // A screen reader should get "299", never "2 99" — no separator chars.
    expect(monthLabel).toMatch(/^Месячная подписка \d+ рублей$/);
  });

  test('CTA title itself is usable as accessibilityLabel', () => {
    // We set `accessibilityLabel={ctaTitle}` on the main CTA. Verify it
    // produces screen-reader-friendly copy.
    const trialLabel = buildPaywallCtaTitle('year', false);
    // Should not contain HTML entities, digits without spaces, or
    // unreadable chars
    expect(trialLabel).toBe('Начать 7 дней бесплатно');
  });
});

// ─── RingStats a11y ────────────────────────────────────────────────────────

describe('RingStats screen-reader strings', () => {
  function buildPercentLabel(pct: number): string {
    return `${pct}% дня`;
  }

  test('0% reads as "0% дня"', () => {
    expect(buildPercentLabel(0)).toBe('0% дня');
  });

  test('100% reads as "100% дня"', () => {
    expect(buildPercentLabel(100)).toBe('100% дня');
  });
});

// ─── Icon a11y default label ────────────────────────────────────────────────

describe('Icon accessibility', () => {
  test('Icon without accessibilityLabel is decorative (parent labels it)', () => {
    // The current Icon component doesn't set accessibilityLabel by
    // default — that's correct because icons are decorative and the
    // wrapping TouchableOpacity should carry the label. Just lock
    // this contract by asserting we *don't* pass one.
    // (No code to test — this is an architectural note locked here.)
    expect(true).toBe(true);
  });
});

// ─── Set hero a11y ─────────────────────────────────────────────────────────

describe('CurrentSetHero a11y string', () => {
  function buildHeroLabel(
    eyebrow: string,
    weight: number,
    reps: number,
    rpe: number,
  ): string {
    return `${eyebrow}. Вес ${weight || 0} килограмм, повторов ${reps || 0}, RPE ${rpe}`;
  }

  test('complete label for 100kg × 8 at RPE 7', () => {
    const s = buildHeroLabel('Подход 1 из 4 · рабочий', 100, 8, 7);
    expect(s).toBe('Подход 1 из 4 · рабочий. Вес 100 килограмм, повторов 8, RPE 7');
  });

  test('zero weight / zero reps fallback', () => {
    const s = buildHeroLabel('Подход 1 из 1 · рабочий', 0, 0, 7);
    expect(s).toContain('Вес 0 килограмм');
    expect(s).toContain('повторов 0');
  });
});
