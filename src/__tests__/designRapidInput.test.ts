/**
 * Rapid-input race condition tests — simulate double-taps, fast
 * successive set-state, and burst consumption. If the app's state
 * transitions aren't idempotent or ordering-safe, the user hits
 * duplicate scans, ghost messages, or misaligned streaks.
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
import { clampProgress, normalizeWeekDots } from '../utils/layout';

describe('Rapid consume — scanners survive 1000-tap burst', () => {
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

  test('1000 synchronous consume calls cap at daily limit', () => {
    const limit = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    let accepted = 0;
    for (let i = 0; i < 1000; i++) {
      if (useSubscriptionStore.getState().consumeFoodScan()) accepted++;
    }
    expect(accepted).toBe(limit);
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(limit);
  });

  test('state is never negative under rapid consume', () => {
    for (let i = 0; i < 100; i++) {
      useSubscriptionStore.getState().consumeFoodScan();
    }
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBeGreaterThanOrEqual(0);
  });

  test('rapid refund on empty counter stays at 0', () => {
    useSubscriptionStore.getState().refundFoodScan();
    useSubscriptionStore.getState().refundFoodScan();
    useSubscriptionStore.getState().refundFoodScan();
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
  });

  test('consume-refund-consume loop stabilizes', () => {
    for (let i = 0; i < 50; i++) {
      useSubscriptionStore.getState().consumeFoodScan();
      useSubscriptionStore.getState().refundFoodScan();
    }
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(0);
  });

  test('AI message burst caps at daily limit', () => {
    const limit = FREE_LIMITS.AI_MESSAGES_PER_DAY;
    let accepted = 0;
    for (let i = 0; i < 1000; i++) {
      if (useSubscriptionStore.getState().consumeAiMessage()) accepted++;
    }
    expect(accepted).toBe(limit);
  });
});

describe('clampProgress is idempotent under repeat application', () => {
  test('clamp(clamp(x)) == clamp(x)', () => {
    for (let i = 0; i < 100; i++) {
      const x = (Math.random() - 0.5) * 10;
      const once = clampProgress(x);
      const twice = clampProgress(once);
      expect(once).toBe(twice);
    }
  });

  test('clamp 1000 times on NaN stays at 0', () => {
    let v: number = NaN;
    for (let i = 0; i < 1000; i++) v = clampProgress(v);
    expect(v).toBe(0);
  });

  test('clamp preserves monotonic relationship for valid inputs', () => {
    const a = clampProgress(0.1);
    const b = clampProgress(0.5);
    const c = clampProgress(0.9);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('normalizeWeekDots stable under many calls', () => {
  test('10 000 calls return identical output for same input', () => {
    const input = [1, 0, 1, 0, 1, 0, 1] as (0 | 1)[];
    const first = normalizeWeekDots(input);
    for (let i = 0; i < 10000; i++) {
      const out = normalizeWeekDots(input);
      expect(out).toEqual(first);
    }
  });

  test('returning array is always new (safe for React memo invalidation)', () => {
    const input = [1, 0, 1, 0, 1, 0, 1] as (0 | 1)[];
    const a = normalizeWeekDots(input);
    const b = normalizeWeekDots(input);
    // different references
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('Concurrent (microtask) consume calls', () => {
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

  test('Promise.all-ish parallel consume respects cap', async () => {
    const promises = Array.from({ length: 10 }, () =>
      Promise.resolve().then(() => useSubscriptionStore.getState().consumeFoodScan())
    );
    const results = await Promise.all(promises);
    // Zustand is synchronous; all 10 resolve in microtask order
    // and at most FOOD_SCANS_PER_DAY are accepted
    const accepted = results.filter(Boolean).length;
    expect(accepted).toBeLessThanOrEqual(FREE_LIMITS.FOOD_SCANS_PER_DAY);
  });

  test('parallel refunds don\'t crash', async () => {
    useSubscriptionStore.setState({
      foodScansDate: require('../utils/date').localDateStr(new Date()),
      foodScansUsedToday: 5,
    });
    const promises = Array.from({ length: 20 }, () =>
      Promise.resolve().then(() => useSubscriptionStore.getState().refundFoodScan())
    );
    await Promise.all(promises);
    expect(useSubscriptionStore.getState().foodScansUsedToday).toBeGreaterThanOrEqual(0);
  });
});

describe('State transitions remain consistent', () => {
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

  test('canScanFood toggles false → false → false after exhausting', () => {
    const limit = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    for (let i = 0; i < limit; i++) {
      expect(useSubscriptionStore.getState().canScanFood()).toBe(true);
      useSubscriptionStore.getState().consumeFoodScan();
    }
    expect(useSubscriptionStore.getState().canScanFood()).toBe(false);
    expect(useSubscriptionStore.getState().canScanFood()).toBe(false);
  });

  test('upgrading to premium mid-session unlocks instantly', () => {
    const today = require('../utils/date').localDateStr(new Date());
    useSubscriptionStore.setState({ foodScansUsedToday: 999, foodScansDate: today });
    expect(useSubscriptionStore.getState().canScanFood()).toBe(false);
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
    expect(useSubscriptionStore.getState().canScanFood()).toBe(true);
  });
});
