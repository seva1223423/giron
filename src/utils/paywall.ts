/**
 * Shared paywall pricing constants + derivation helpers.
 *
 * SINGLE SOURCE OF TRUTH for every paywall surface (PaywallModal,
 * SubscriptionScreen, PlanSelector, AutoRenewalConsentModal). Each of
 * those screens used to carry its own hardcoded numbers and they
 * disagreed: the modal promised "Оформить за 2 990 ₽" and the very next
 * screen showed 1 990 ₽. Import from here — never retype a price.
 */

// Annual 1990₽ / monthly 299₽.
export const PRICE_YEAR_RUB = 1990;
export const PRICE_MONTH_RUB = 299;

/** Strike-through reference price: what 12 months actually cost at the
 *  monthly rate. Derived, not invented — the previous 6788₽ "old price"
 *  was a number we could not substantiate, which is exactly what ФЗ-38
 *  «О рекламе» treats as a misleading discount claim. */
export const PRICE_YEAR_OLD_RUB = PRICE_MONTH_RUB * 12;

/** Annual price divided by 12, rounded. Used for the "166 ₽ / мес ·
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
