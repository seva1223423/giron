/**
 * Quota reset at midnight tests — verifies that a user's 5-scans-per-
 * day quota automatically rolls over when the local date changes.
 *
 * The subscription store checks `foodScansDate === today` and resets
 * the counter if not. This suite drives that boundary.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { useSubscriptionStore, FREE_LIMITS } from '../store/useSubscriptionStore';
import { localDateStr } from '../utils/date';

describe('Food scan quota rolls over at midnight', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: false,
      premiumExpiresAt: null,
      foodScansUsedToday: 0,
      foodScansDate: null,
      aiMessagesUsedToday: 0,
      aiMessagesDate: null,
      trialUsed: false,
    });
  });

  test('first consume on a new day sets the counter to 1', () => {
    // No date set initially
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
    const ok = useSubscriptionStore.getState().consumeFoodScan();
    expect(ok).toBe(true);
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(1);
  });

  test('consume on a stored-date-equal-today increments', () => {
    const today = localDateStr(new Date());
    useSubscriptionStore.setState({ foodScansDate: today, foodScansUsedToday: 2 });
    useSubscriptionStore.getState().consumeFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(3);
  });

  test('consume with yesterday\'s stored date resets to 1', () => {
    useSubscriptionStore.setState({ foodScansDate: '2000-01-01', foodScansUsedToday: 3 });
    useSubscriptionStore.getState().consumeFoodScan();
    // Should reset to 0 + 1 = 1
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(1);
  });

  test('foodScansLeft reads correctly mid-rollover', () => {
    const total = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    useSubscriptionStore.setState({ foodScansDate: '2000-01-01', foodScansUsedToday: total });
    // Since the stored date is not today, the getter treats it as 0 used
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(total);
  });

  test('canScanFood returns true after rollover', () => {
    const total = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    useSubscriptionStore.setState({ foodScansDate: '2000-01-01', foodScansUsedToday: total });
    expect(useSubscriptionStore.getState().canScanFood()).toBe(true);
  });

  test('refund cannot bring counter below zero after rollover', () => {
    useSubscriptionStore.setState({ foodScansDate: '2000-01-01', foodScansUsedToday: 3 });
    useSubscriptionStore.getState().refundFoodScan();
    // refundFoodScan returns without mutating because date mismatches
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(3);
  });

  test('daily cap respected after consume triggers reset', () => {
    const total = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    useSubscriptionStore.setState({ foodScansDate: '2000-01-01', foodScansUsedToday: total });
    // First consume resets + takes 1
    useSubscriptionStore.getState().consumeFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(1);
    // Subsequent consumes fill today's budget
    for (let i = 0; i < total - 1; i++) {
      expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(true);
    }
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(total);
    expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(false);
  });
});

describe('AI messages quota rollover', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: false,
      aiMessagesUsedToday: 0,
      aiMessagesDate: null,
    });
  });

  test('aiMessagesLeft respects daily rollover', () => {
    useSubscriptionStore.setState({ aiMessagesDate: '2000-01-01', aiMessagesUsedToday: 10 });
    // Stored date is not today — left should be full
    expect(useSubscriptionStore.getState().aiMessagesLeft()).toBe(FREE_LIMITS.AI_MESSAGES_PER_DAY);
  });

  test('canSendAiMessage returns true after rollover', () => {
    useSubscriptionStore.setState({ aiMessagesDate: '2000-01-01', aiMessagesUsedToday: 10 });
    expect(useSubscriptionStore.getState().canSendAiMessage()).toBe(true);
  });
});

describe('Premium users bypass all rollovers', () => {
  test('premium foodScansLeft is Infinity regardless of date/counter', () => {
    useSubscriptionStore.setState({
      isPremium: true,
      premiumExpiresAt: null,
      foodScansDate: '2000-01-01',
      foodScansUsedToday: 999,
    });
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(Infinity);
  });

  test('premium canScanFood always true', () => {
    useSubscriptionStore.setState({
      isPremium: true,
      premiumExpiresAt: null,
      foodScansDate: '2000-01-01',
      foodScansUsedToday: 999,
    });
    expect(useSubscriptionStore.getState().canScanFood()).toBe(true);
  });

  test('premium consume returns true without incrementing', () => {
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null, foodScansUsedToday: 0 });
    expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(true);
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
  });
});
