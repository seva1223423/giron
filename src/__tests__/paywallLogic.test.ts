/**
 * Paywall pricing + CTA copy tests.
 *
 * Locks:
 *   - One price everywhere: 1990₽/year, 299₽/month (audit R3 — the app
 *     used to show 2990₽ on the modal and 1990₽ on the next screen)
 *   - The strike-through price is DERIVED from the monthly rate, so the
 *     advertised discount is always a claim we can substantiate
 *   - Effective monthly on the yearly plan is 166₽ (the copy says so)
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

describe('Paywall pricing constants — single source of truth', () => {
  test('yearly price is 1990 ₽', () => {
    expect(PRICE_YEAR_RUB).toBe(1990);
  });

  test('strike-through price is derived: 12 × monthly, never a made-up number', () => {
    expect(PRICE_YEAR_OLD_RUB).toBe(PRICE_MONTH_RUB * 12);
    expect(PRICE_YEAR_OLD_RUB).toBe(3588);
  });

  test('monthly price is 299 ₽', () => {
    expect(PRICE_MONTH_RUB).toBe(299);
  });

  test('effective monthly on yearly plan is 166 ₽ (the copy says so)', () => {
    expect(PRICE_YEAR_MONTHLY_EFFECTIVE_RUB).toBe(166);
  });

  test('annual discount is 45% and matches the real delta', () => {
    expect(ANNUAL_DISCOUNT_PCT).toBe(45);
    // The badge number must equal the actual saving, or it is a false claim.
    const realSaving = Math.round(100 - (PRICE_YEAR_RUB / PRICE_YEAR_OLD_RUB) * 100);
    expect(ANNUAL_DISCOUNT_PCT).toBe(realSaving);
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
  test('year → 1990', () => {
    expect(priceForPlan('year')).toBe(1990);
  });

  test('month → 299', () => {
    expect(priceForPlan('month')).toBe(299);
  });
});

// ─── buildPaywallCtaTitle ───────────────────────────────────────────────────

describe('buildPaywallCtaTitle', () => {
  test('trial available → "Начать 7 дней бесплатно" (ignoring plan)', () => {
    expect(buildPaywallCtaTitle('year', false)).toBe('Начать 7 дней бесплатно');
    expect(buildPaywallCtaTitle('month', false)).toBe('Начать 7 дней бесплатно');
  });

  test('trial used + yearly → "Оформить за 1 990 ₽"', () => {
    const out = buildPaywallCtaTitle('year', true);
    // NBSP between "1" and "990"
    expect(out).toMatch(/^Оформить за 1[\s\u202F\u00A0]990 ₽$/);
  });

  test('trial used + monthly → "Оформить за 299 ₽" (no separator, <1000)', () => {
    expect(buildPaywallCtaTitle('month', true)).toBe('Оформить за 299 ₽');
  });
});

// ─── buildPaywallCtaFineprint ───────────────────────────────────────────────

describe('buildPaywallCtaFineprint', () => {
  test('trial used → short "Отмена в любой момент" (no price reminder)', () => {
    expect(buildPaywallCtaFineprint('year', true)).toBe('Отмена в любой момент');
    expect(buildPaywallCtaFineprint('month', true)).toBe('Отмена в любой момент');
  });

  test('trial eligible + yearly → "Далее 1 990 ₽ / год · можно отменить"', () => {
    const out = buildPaywallCtaFineprint('year', false);
    expect(out).toMatch(/Далее 1[\s\u202F\u00A0]990 ₽ \/ год/);
    expect(out).toContain('можно отменить в любой момент');
  });

  test('trial eligible + monthly → "Далее 299 ₽ / мес · можно отменить"', () => {
    const out = buildPaywallCtaFineprint('month', false);
    expect(out).toContain('Далее 299 ₽ / мес');
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
    expect(groups[0]).toBe('1');
    expect(groups[1]).toBe('990');
  });

  test('3-digit monthly price stays unseparated', () => {
    const formatted = PRICE_MONTH_RUB.toLocaleString('ru-RU');
    expect(formatted).toBe('299');
    expect(formatted).not.toContain(' ');
    expect(formatted).not.toContain(',');
  });

  test('strike-through price 3588 formats as "3 588" (one NBSP)', () => {
    const formatted = PRICE_YEAR_OLD_RUB.toLocaleString('ru-RU');
    expect(formatted.replace(/[\s\u202F\u00A0]/, ' ')).toBe('3 588');
  });
});
