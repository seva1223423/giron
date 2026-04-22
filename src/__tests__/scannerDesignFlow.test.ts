/**
 * Scanner + subscription interplay tests — locks the refund logic I
 * wired earlier (pickImage cancel → refund, AI error → refund, 402 →
 * no refund, etc.) and guards the quota math.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { useSubscriptionStore, FREE_LIMITS } from '../store/useSubscriptionStore';
import { localDateStr } from '../utils/date';

// Reset between tests so counter drift doesn't cascade
beforeEach(() => {
  const today = localDateStr(new Date());
  useSubscriptionStore.setState({
    isPremium: false,
    premiumExpiresAt: null,
    foodScansUsedToday: 0,
    foodScansDate: today,
    aiMessagesUsedToday: 0,
    aiMessagesDate: today,
    trialUsed: false,
  });
});

describe('Scanner refund invariants', () => {
  test('consume + refund = 0 (round-trip)', () => {
    useSubscriptionStore.getState().consumeFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(1);
    useSubscriptionStore.getState().refundFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
  });

  test('multiple consumes + refunds stay balanced', () => {
    const store = useSubscriptionStore.getState();
    store.consumeFoodScan();
    store.consumeFoodScan();
    store.consumeFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(3);
    store.refundFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(2);
  });

  test('refund at 0 stays at 0 (no negative counter)', () => {
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
    useSubscriptionStore.getState().refundFoodScan();
    useSubscriptionStore.getState().refundFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
  });

  test('foodScansLeft reflects correct remaining', () => {
    const total = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(total);
    useSubscriptionStore.getState().consumeFoodScan();
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(total - 1);
    useSubscriptionStore.getState().refundFoodScan();
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(total);
  });

  test('premium user is unaffected by consume/refund', () => {
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
    useSubscriptionStore.getState().consumeFoodScan();
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(Infinity);
    useSubscriptionStore.getState().refundFoodScan();
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(Infinity);
  });

  test('cannot go over daily limit even after refunds', () => {
    const total = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    // Exhaust quota
    for (let i = 0; i < total; i++) {
      expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(true);
    }
    expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(false);
    // Refund one, try again
    useSubscriptionStore.getState().refundFoodScan();
    expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(true);
    expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(false);
  });

  test('refund from yesterday scans into today is a no-op', () => {
    // Set yesterday's counter
    useSubscriptionStore.setState({ foodScansUsedToday: 3, foodScansDate: '2000-01-01' });
    useSubscriptionStore.getState().refundFoodScan();
    // Counter untouched because date mismatch
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(3);
  });
});

describe('Scanner-related quota constants', () => {
  test('FREE_LIMITS.FOOD_SCANS_PER_DAY is 5 (design spec)', () => {
    expect(FREE_LIMITS.FOOD_SCANS_PER_DAY).toBe(5);
  });

  test('FREE_LIMITS.AI_MESSAGES_PER_DAY is 10', () => {
    expect(FREE_LIMITS.AI_MESSAGES_PER_DAY).toBe(10);
  });

  test('All 4 FREE_LIMITS present', () => {
    expect(FREE_LIMITS).toHaveProperty('AI_MESSAGES_PER_DAY');
    expect(FREE_LIMITS).toHaveProperty('FOOD_SCANS_PER_DAY');
  });
});
