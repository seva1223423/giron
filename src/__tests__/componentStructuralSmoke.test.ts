/**
 * Pure-util module smoke. Verifies each utility file loads without
 * error and exports its documented helpers.
 *
 * Full component loading needs a deeper mock graph (reanimated /
 * react-native-svg / native modules) which breaks under jest-expo.
 * We keep render tests out of this file — those live in dedicated
 * suites that can afford per-file mocking. This suite is a cheap
 * "did we break the module graph" check.
 */

describe('design utility modules load', () => {
  test('utils/layout loads', () => {
    expect(() => require('../utils/layout')).not.toThrow();
  });

  test('utils/paywall loads', () => {
    expect(() => require('../utils/paywall')).not.toThrow();
  });

  test('utils/homeDerivations loads', () => {
    expect(() => require('../utils/homeDerivations')).not.toThrow();
  });

  test('utils/date loads', () => {
    expect(() => require('../utils/date')).not.toThrow();
  });

  test('tracker/heroLogic loads', () => {
    expect(() => require('../screens/tracker/components/heroLogic')).not.toThrow();
  });

  test('testHelpers/storageKeys loads', () => {
    expect(() => require('../testHelpers/storageKeys')).not.toThrow();
  });
});

describe('design utility modules export their symbols', () => {
  test('utils/layout exports clampProgress, normalizeWeekDots, pluralizeDaysRu', () => {
    const m = require('../utils/layout');
    expect(typeof m.clampProgress).toBe('function');
    expect(typeof m.normalizeWeekDots).toBe('function');
    expect(typeof m.pluralizeDaysRu).toBe('function');
  });

  test('utils/paywall exports pricing constants + CTA builders', () => {
    const m = require('../utils/paywall');
    expect(m.PRICE_YEAR_RUB).toBe(2990);
    expect(m.PRICE_MONTH_RUB).toBe(569);
    expect(m.PRICE_YEAR_OLD_RUB).toBe(6788);
    expect(m.PRICE_YEAR_MONTHLY_EFFECTIVE_RUB).toBe(249);
    expect(m.ANNUAL_DISCOUNT_PCT).toBe(56);
    expect(typeof m.priceForPlan).toBe('function');
    expect(typeof m.buildPaywallCtaTitle).toBe('function');
    expect(typeof m.buildPaywallCtaFineprint).toBe('function');
  });

  test('utils/homeDerivations exports derivations + constant', () => {
    const m = require('../utils/homeDerivations');
    expect(typeof m.buildWeekDotsFromHistory).toBe('function');
    expect(typeof m.findHeaviestPR).toBe('function');
    expect(typeof m.todayMondayIndex).toBe('function');
    expect(typeof m.calorieDayProgress).toBe('function');
    expect(typeof m.deriveWeekPlanDays).toBe('function');
    expect(m.RU_DAY_LABELS).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
  });

  test('utils/date exports date utilities', () => {
    const m = require('../utils/date');
    expect(typeof m.todayDateStr).toBe('function');
    expect(typeof m.localDateStr).toBe('function');
    expect(typeof m.getMonday).toBe('function');
    expect(typeof m.computeStreak).toBe('function');
    expect(typeof m.formatDateMetaRu).toBe('function');
  });

  test('tracker/heroLogic exports pure hero helpers', () => {
    const m = require('../screens/tracker/components/heroLogic');
    expect(typeof m.findLiveSet).toBe('function');
    expect(typeof m.rpeFillRatio).toBe('function');
    expect(typeof m.buildSetEyebrow).toBe('function');
  });

  test('testHelpers/storageKeys exports all 5 keys', () => {
    const m = require('../testHelpers/storageKeys');
    expect(m.BARCODE_CACHE_KEY_FOR_TEST).toBe('iron_gym_barcode_cache');
    expect(m.RECENT_SCANS_KEY_FOR_TEST).toBe('iron_gym_recent_scans');
    expect(m.SCANNER_DRAFT_KEY_FOR_TEST).toBe('iron_gym_scanner_draft');
    expect(m.LAST_MEAL_TYPE_KEY_FOR_TEST).toBe('iron_gym_scanner_last_meal_type');
    expect(m.AI_SCAN_CACHE_KEY_FOR_TEST).toBe('iron_gym_ai_scan_cache');
  });
});
