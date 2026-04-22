/**
 * Shared paywall pricing constants + derivation helpers.
 *
 * Extracted so the math behind "2 990 ₽ → 249 ₽/мес", the "−56%"
 * discount chip, and the CTA copy can be unit-tested without
 * rendering the PaywallModal.
 */

// Pricing from the Direction A design export. Annual 2990₽ with the
// crossed-out 6788₽ old price; monthly 569₽.
export const PRICE_YEAR_RUB = 2990;
export const PRICE_YEAR_OLD_RUB = 6788;
export const PRICE_MONTH_RUB = 569;

/** Annual price divided by 12, rounded. Used for the "249 ₽ / мес ·
 *  списание раз в год" subtitle on the yearly plan card. */
export const PRICE_YEAR_MONTHLY_EFFECTIVE_RUB = Math.round(PRICE_YEAR_RUB / 12);

/** Discount percentage shown on the gold badge: 100 * (1 - new/old),
 *  rounded. Keeps the math in one place so design + copy stay in sync
 *  when prices change. */
export const ANNUAL_DISCOUNT_PCT = Math.round(100 - (PRICE_YEAR_RUB / PRICE_YEAR_OLD_RUB) * 100);

export type PaywallPlan = 'year' | 'month';

/** Returns the current-select price in rubles. */
export function priceForPlan(plan: PaywallPlan): number {
  return plan === 'year' ? PRICE_YEAR_RUB : PRICE_MONTH_RUB;
}

/**
 * Build the CTA button title based on plan + trial availability.
 *   - Trial-eligible: "Начать 7 дней бесплатно" regardless of plan
 *   - Trial-used: "Оформить за N ₽" with proper ru-RU number formatting
 *
 * Splitting this out gives the tests a way to assert the exact Russian
 * copy without mounting the modal.
 */
export function buildPaywallCtaTitle(plan: PaywallPlan, trialUsed: boolean): string {
  if (!trialUsed) return 'Начать 7 дней бесплатно';
  const price = priceForPlan(plan);
  return `Оформить за ${price.toLocaleString('ru-RU')} ₽`;
}

/**
 * Fine-print shown below the CTA. Three branches:
 *   - Trial-used: just "Отмена в любой момент"
 *   - Trial-eligible + yearly: "Далее N ₽ / год · ..."
 *   - Trial-eligible + monthly: "Далее N ₽ / мес · ..."
 */
export function buildPaywallCtaFineprint(plan: PaywallPlan, trialUsed: boolean): string {
  if (trialUsed) return 'Отмена в любой момент';
  const price = priceForPlan(plan).toLocaleString('ru-RU');
  const period = plan === 'year' ? 'год' : 'мес';
  return `Далее ${price} ₽ / ${period} · можно отменить в любой момент`;
}
