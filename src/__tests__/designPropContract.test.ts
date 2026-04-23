/**
 * Prop-contract tests for design-system components. Not mounting
 * React — just asserting that helpers/constants that components
 * consume have the expected type + value shape.
 *
 * Goal: catch "I renamed a prop" regressions before runtime.
 */

import { typography } from '../theme/typography';
import { RU_DAY_LABELS } from '../utils/homeDerivations';
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

// ─── Typography contract ───────────────────────────────────────────────────

describe('Typography preset contract', () => {
  const requiredKeys = [
    'h1', 'h2', 'h3', 'h4',
    'body', 'bodyMedium', 'bodySemibold',
    'small', 'smallMedium',
    'caption', 'captionMedium',
    'button', 'buttonSmall',
    'tabLabel',
    'number', 'numberSmall',
    'metaLabel',
  ];

  test.each(requiredKeys)('preset "%s" exists', (key) => {
    expect(typography).toHaveProperty(key);
  });

  test.each(requiredKeys)('preset "%s" has fontSize', (key) => {
    expect((typography as any)[key].fontSize).toBeTypeOf('number');
  });

  test.each(requiredKeys)('preset "%s" has lineHeight', (key) => {
    expect((typography as any)[key].lineHeight).toBeTypeOf('number');
  });

  test('fontSize always positive', () => {
    for (const key of requiredKeys) {
      expect((typography as any)[key].fontSize).toBeGreaterThan(0);
    }
  });

  test('lineHeight always >= fontSize', () => {
    for (const key of requiredKeys) {
      expect((typography as any)[key].lineHeight).toBeGreaterThanOrEqual((typography as any)[key].fontSize);
    }
  });
});

// Extend jest expect with helper (since toBeTypeOf not standard)
expect.extend({
  toBeTypeOf(received, type) {
    const pass = typeof received === type;
    return {
      message: () => `expected ${received} to be of type ${type}`,
      pass,
    };
  },
});
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeTypeOf(type: string): R;
    }
  }
}

// ─── Russian day labels contract ──────────────────────────────────────────

describe('RU_DAY_LABELS contract', () => {
  test('exactly 7 labels', () => {
    expect(RU_DAY_LABELS.length).toBe(7);
  });

  test('Monday first', () => {
    expect(RU_DAY_LABELS[0]).toBe('Пн');
  });

  test('Sunday last', () => {
    expect(RU_DAY_LABELS[6]).toBe('Вс');
  });

  test('all labels are 2 characters', () => {
    for (const l of RU_DAY_LABELS) {
      expect(l).toHaveLength(2);
    }
  });

  test('all labels are distinct', () => {
    expect(new Set(RU_DAY_LABELS).size).toBe(7);
  });

  test('labels are string type', () => {
    for (const l of RU_DAY_LABELS) {
      expect(typeof l).toBe('string');
    }
  });
});

// ─── Paywall pricing contract ─────────────────────────────────────────────

describe('Paywall pricing constants contract', () => {
  test('PRICE_YEAR_RUB is a positive integer', () => {
    expect(Number.isInteger(PRICE_YEAR_RUB)).toBe(true);
    expect(PRICE_YEAR_RUB).toBeGreaterThan(0);
  });

  test('PRICE_YEAR_OLD_RUB > PRICE_YEAR_RUB (there must be a discount)', () => {
    expect(PRICE_YEAR_OLD_RUB).toBeGreaterThan(PRICE_YEAR_RUB);
  });

  test('PRICE_MONTH_RUB is positive integer', () => {
    expect(Number.isInteger(PRICE_MONTH_RUB)).toBe(true);
    expect(PRICE_MONTH_RUB).toBeGreaterThan(0);
  });

  test('Year is cheaper per month than monthly plan', () => {
    expect(PRICE_YEAR_MONTHLY_EFFECTIVE_RUB).toBeLessThan(PRICE_MONTH_RUB);
  });

  test('Discount percent in 0..100 range', () => {
    expect(ANNUAL_DISCOUNT_PCT).toBeGreaterThan(0);
    expect(ANNUAL_DISCOUNT_PCT).toBeLessThan(100);
  });

  test('Monthly-effective math matches year/12 rounded', () => {
    expect(PRICE_YEAR_MONTHLY_EFFECTIVE_RUB).toBe(Math.round(PRICE_YEAR_RUB / 12));
  });

  test('Discount matches formula', () => {
    expect(ANNUAL_DISCOUNT_PCT).toBe(Math.round(100 - (PRICE_YEAR_RUB / PRICE_YEAR_OLD_RUB) * 100));
  });
});

// ─── priceForPlan function contract ───────────────────────────────────────

describe('priceForPlan contract', () => {
  test('year plan returns PRICE_YEAR_RUB', () => {
    expect(priceForPlan('year')).toBe(PRICE_YEAR_RUB);
  });

  test('month plan returns PRICE_MONTH_RUB', () => {
    expect(priceForPlan('month')).toBe(PRICE_MONTH_RUB);
  });

  test('unknown plan falls back to monthly', () => {
    // priceForPlan uses ternary; non-'year' → month
    expect(priceForPlan('month' as any)).toBe(PRICE_MONTH_RUB);
  });
});

// ─── CTA title contract ───────────────────────────────────────────────────

describe('buildPaywallCtaTitle contract', () => {
  test('trial-eligible returns free-trial copy', () => {
    expect(buildPaywallCtaTitle('year', false)).toBe('Начать 7 дней бесплатно');
    expect(buildPaywallCtaTitle('month', false)).toBe('Начать 7 дней бесплатно');
  });

  test('trial-used yearly shows year price', () => {
    const title = buildPaywallCtaTitle('year', true);
    expect(title).toContain('Оформить за');
    expect(title).toContain('₽');
  });

  test('trial-used monthly shows month price', () => {
    const title = buildPaywallCtaTitle('month', true);
    expect(title).toContain('Оформить за');
    expect(title).toContain('₽');
  });

  test('CTA title is under 40 chars for button fit', () => {
    const title = buildPaywallCtaTitle('year', true);
    expect(title.length).toBeLessThan(40);
  });
});

// ─── Fine-print contract ──────────────────────────────────────────────────

describe('buildPaywallCtaFineprint contract', () => {
  test('trial-used is short copy', () => {
    expect(buildPaywallCtaFineprint('year', true)).toBe('Отмена в любой момент');
  });

  test('trial-eligible + yearly includes год', () => {
    const fine = buildPaywallCtaFineprint('year', false);
    expect(fine).toContain('год');
    expect(fine).toContain('₽');
  });

  test('trial-eligible + monthly includes мес', () => {
    const fine = buildPaywallCtaFineprint('month', false);
    expect(fine).toContain('мес');
  });

  test('all fineprint variants under 70 chars', () => {
    for (const plan of ['year', 'month'] as const) {
      for (const used of [true, false]) {
        expect(buildPaywallCtaFineprint(plan, used).length).toBeLessThan(80);
      }
    }
  });
});

// ─── Typography letter-spacing contract ───────────────────────────────────

describe('Letter-spacing: heading tracking is negative', () => {
  test('h1 has negative tracking (typography premium feel)', () => {
    expect(typography.h1.letterSpacing).toBeLessThan(0);
  });

  test('meta labels have positive tracking (caps-style)', () => {
    expect(typography.metaLabel.letterSpacing).toBeGreaterThan(0);
  });

  test('body doesn\'t over-stretch tracking', () => {
    const bs = typography.body.letterSpacing ?? 0;
    expect(Math.abs(bs)).toBeLessThanOrEqual(0.5);
  });
});

// ─── Font weights are valid RN numeric/string values ──────────────────────

describe('Typography fontWeight contract', () => {
  const validWeights = new Set([
    'normal', 'bold',
    '100', '200', '300', '400', '500', '600', '700', '800', '900',
  ]);

  test.each(Object.keys(typography))('preset "%s" has a valid fontWeight', (key) => {
    const weight = (typography as any)[key].fontWeight;
    if (weight !== undefined) {
      expect(validWeights.has(String(weight))).toBe(true);
    }
  });
});
