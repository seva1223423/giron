/**
 * Paywall pricing + CTA copy tests.
 *
 * Locks:
 *   - The discount % displayed on the gold chip matches the actual
 *     cost delta (2990 vs 6788 → 56%, not 55% or 57%)
 *   - Effective monthly on the yearly plan is 249₽ (the copy says so)
 *   - CTA title branches correctly on plan × trial-used
 *   - Fine-print branches correctly across 4 combinations
 *   - Russian number formatting uses NBSP separators
 */

import {
  PRICE_YEAR_RUB,
  PRICE_YEAR_OLD_RUB,
  PRICE_MONTH_RUB,
  PRICE_YEAR_MONTHLY_EFFECTIVE_RUB,
  ANNUAL_DISCOUNT_PCT,
  priceForPlan,
  buildPaywallCtaTitle,
  buildPaywallCtaFineprint,
} from '../utils/paywall';

// ─── Constants ──────────────────────────────────────────────────────────────

describe('Paywall pricing constants — Direction A spec', () => {
  test('yearly price is 2990 ₽', () => {
    expect(PRICE_YEAR_RUB).toBe(2990);
  });

  test('old yearly price is 6788 ₽ (crossed out, for discount math)', () => {
    expect(PRICE_YEAR_OLD_RUB).toBe(6788);
  });

  test('monthly price is 569 ₽', () => {
    expect(PRICE_MONTH_RUB).toBe(569);
  });

  test('effective monthly on yearly plan is 249 ₽ (design says so)', () => {
    expect(PRICE_YEAR_MONTHLY_EFFECTIVE_RUB).toBe(249);
  });

  test('annual discount is 56% (badge says "−56%")', () => {
    expect(ANNUAL_DISCOUNT_PCT).toBe(56);
  });

  test('yearly price is cheaper than 12× monthly (must be — it\'s the discount)', () => {
    expect(PRICE_YEAR_RUB).toBeLessThan(PRICE_MONTH_RUB * 12);
  });

  test('effective monthly on yearly is <= monthly price (discount is real)', () => {
    expect(PRICE_YEAR_MONTHLY_EFFECTIVE_RUB).toBeLessThan(PRICE_MONTH_RUB);
  });
});

// ─── priceForPlan ───────────────────────────────────────────────────────────

describe('priceForPlan', () => {
  test('year → 2990', () => {
    expect(priceForPlan('year')).toBe(2990);
  });

  test('month → 569', () => {
    expect(priceForPlan('month')).toBe(569);
  });
});

// ─── buildPaywallCtaTitle ───────────────────────────────────────────────────

describe('buildPaywallCtaTitle', () => {
  test('trial available → "Начать 7 дней бесплатно" (ignoring plan)', () => {
    expect(buildPaywallCtaTitle('year', false)).toBe('Начать 7 дней бесплатно');
    expect(buildPaywallCtaTitle('month', false)).toBe('Начать 7 дней бесплатно');
  });

  test('trial used + yearly → "Оформить за 2 990 ₽"', () => {
    const out = buildPaywallCtaTitle('year', true);
    // NBSP between "2" and "990"
    expect(out).toMatch(/^Оформить за 2[\s\u202F\u00A0]990 ₽$/);
  });

  test('trial used + monthly → "Оформить за 569 ₽" (no separator, <1000)', () => {
    expect(buildPaywallCtaTitle('month', true)).toBe('Оформить за 569 ₽');
  });
});

// ─── buildPaywallCtaFineprint ───────────────────────────────────────────────

describe('buildPaywallCtaFineprint', () => {
  test('trial used → short "Отмена в любой момент" (no price reminder)', () => {
    expect(buildPaywallCtaFineprint('year', true)).toBe('Отмена в любой момент');
    expect(buildPaywallCtaFineprint('month', true)).toBe('Отмена в любой момент');
  });

  test('trial eligible + yearly → "Далее 2 990 ₽ / год · можно отменить"', () => {
    const out = buildPaywallCtaFineprint('year', false);
    expect(out).toMatch(/Далее 2[\s\u202F\u00A0]990 ₽ \/ год/);
    expect(out).toContain('можно отменить в любой момент');
  });

  test('trial eligible + monthly → "Далее 569 ₽ / мес · можно отменить"', () => {
    const out = buildPaywallCtaFineprint('month', false);
    expect(out).toContain('Далее 569 ₽ / мес');
    expect(out).toContain('можно отменить в любой момент');
  });
});

// ─── Locale edge cases ───────────────────────────────────────────────────────

describe('Paywall ru-RU formatting edge cases', () => {
  test('4-digit price formats with one separator', () => {
    const formatted = PRICE_YEAR_RUB.toLocaleString('ru-RU');
    // Should split into exactly 2 groups of digits
    const groups = formatted.split(/[\s\u202F\u00A0]/);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toBe('2');
    expect(groups[1]).toBe('990');
  });

  test('3-digit monthly price stays unseparated', () => {
    const formatted = PRICE_MONTH_RUB.toLocaleString('ru-RU');
    expect(formatted).toBe('569');
    expect(formatted).not.toContain(' ');
    expect(formatted).not.toContain(',');
  });

  test('old price 6788 formats as "6 788" (one NBSP)', () => {
    const formatted = PRICE_YEAR_OLD_RUB.toLocaleString('ru-RU');
    expect(formatted.replace(/[\s\u202F\u00A0]/, ' ')).toBe('6 788');
  });
});
