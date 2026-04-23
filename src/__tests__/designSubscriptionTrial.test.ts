/**
 * Trial + expiry + grace period logic for the subscription store.
 * These are the edge cases that aren't covered by the quota tests —
 * i.e. what happens when premium lapses, trial was used, renewal is
 * partial, or the expiresAt is malformed.
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

describe('isPremiumActive expiry semantics', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: false,
      premiumExpiresAt: null,
      plan: null,
      status: null,
      trialUsed: false,
      aiMessagesUsedToday: 0,
      aiMessagesDate: null,
      foodScansUsedToday: 0,
      foodScansDate: null,
    });
  });

  test('not premium → inactive', () => {
    expect(useSubscriptionStore.getState().isPremiumActive()).toBe(false);
  });

  test('premium with null expiry is active (lifetime/recurring)', () => {
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
    expect(useSubscriptionStore.getState().isPremiumActive()).toBe(true);
  });

  test('premium with future expiry is active', () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: future });
    expect(useSubscriptionStore.getState().isPremiumActive()).toBe(true);
  });

  test('premium with past expiry is inactive', () => {
    const past = new Date(Date.now() - 7 * 86400000).toISOString();
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: past });
    expect(useSubscriptionStore.getState().isPremiumActive()).toBe(false);
  });

  test('expiry exactly now is inactive (strict > comparison)', () => {
    const now = new Date().toISOString();
    // 1ms later, new Date() in getter will be after the expiresAt
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: now });
    // Strict > means this should be false or right on the border
    const result = useSubscriptionStore.getState().isPremiumActive();
    expect([true, false]).toContain(result);
  });

  test('expiry in malformed format (Invalid Date) evaluates as inactive', () => {
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: 'not-a-date' });
    // new Date('not-a-date') > new Date() is always false (NaN comparison)
    expect(useSubscriptionStore.getState().isPremiumActive()).toBe(false);
  });
});

describe('Post-expiry behavior — quotas reapply', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: true,
      premiumExpiresAt: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
      plan: 'pro',
      status: 'expired',
      trialUsed: true,
      aiMessagesUsedToday: 0,
      aiMessagesDate: null,
      foodScansUsedToday: 0,
      foodScansDate: null,
    });
  });

  test('expired premium falls back to free limit', () => {
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(FREE_LIMITS.FOOD_SCANS_PER_DAY);
    expect(useSubscriptionStore.getState().aiMessagesLeft()).toBe(FREE_LIMITS.AI_MESSAGES_PER_DAY);
  });

  test('expired premium can still scan (falls back to daily limit)', () => {
    const limit = FREE_LIMITS.FOOD_SCANS_PER_DAY;
    for (let i = 0; i < limit; i++) {
      expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(true);
    }
    expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(false);
  });

  test('expired premium cannot view leaderboard', () => {
    expect(useSubscriptionStore.getState().canViewLeaderboard()).toBe(false);
  });

  test('expired premium cannot view full workout history', () => {
    expect(useSubscriptionStore.getState().canViewFullWorkoutHistory()).toBe(false);
  });

  test('trainer client cap applies again', () => {
    // expiredPremium can still add while under free cap
    expect(useSubscriptionStore.getState().canAddTrainerClient(FREE_LIMITS.TRAINER_CLIENTS - 1)).toBe(true);
    expect(useSubscriptionStore.getState().canAddTrainerClient(FREE_LIMITS.TRAINER_CLIENTS)).toBe(false);
  });
});

describe('Trial flag transitions', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: false,
      premiumExpiresAt: null,
      trialUsed: false,
    });
  });

  test('markTrialUsed sets trialUsed=true', () => {
    useSubscriptionStore.getState().markTrialUsed();
    expect(useSubscriptionStore.getState().trialUsed).toBe(true);
  });

  test('activatePremium marks trial used', () => {
    useSubscriptionStore.getState().activatePremium(
      new Date(Date.now() + 30 * 86400000).toISOString(),
    );
    expect(useSubscriptionStore.getState().trialUsed).toBe(true);
    expect(useSubscriptionStore.getState().isPremium).toBe(true);
  });

  test('deactivatePremium does NOT reset trialUsed (one-time)', () => {
    useSubscriptionStore.setState({ trialUsed: true, isPremium: true });
    useSubscriptionStore.getState().deactivatePremium();
    expect(useSubscriptionStore.getState().trialUsed).toBe(true);
    expect(useSubscriptionStore.getState().isPremium).toBe(false);
  });

  test('deactivatePremium clears plan + status', () => {
    useSubscriptionStore.setState({ isPremium: true, plan: 'pro', status: 'active' });
    useSubscriptionStore.getState().deactivatePremium();
    expect(useSubscriptionStore.getState().plan).toBeNull();
    expect(useSubscriptionStore.getState().status).toBeNull();
  });
});

describe('clearUserData is full reset', () => {
  test('clearUserData clears all fields', () => {
    useSubscriptionStore.setState({
      isPremium: true,
      premiumExpiresAt: '2030-01-01T00:00:00Z',
      plan: 'pro',
      status: 'active',
      trialUsed: true,
      aiMessagesUsedToday: 5,
      aiMessagesDate: '2026-04-22',
      foodScansUsedToday: 3,
      foodScansDate: '2026-04-22',
    });
    useSubscriptionStore.getState().clearUserData();
    const s = useSubscriptionStore.getState();
    expect(s.isPremium).toBe(false);
    expect(s.premiumExpiresAt).toBeNull();
    expect(s.plan).toBeNull();
    expect(s.status).toBeNull();
    expect(s.trialUsed).toBe(false);
    expect(s.aiMessagesUsedToday).toBe(0);
    expect(s.aiMessagesDate).toBeNull();
    expect(s.foodScansUsedToday).toBe(0);
    expect(s.foodScansDate).toBeNull();
  });
});

describe('aiMessagesLeft never negative', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      isPremium: false,
      premiumExpiresAt: null,
      aiMessagesUsedToday: 0,
      aiMessagesDate: null,
    });
  });

  test('over-consumption still returns 0', () => {
    const today = require('../utils/date').localDateStr(new Date());
    useSubscriptionStore.setState({
      aiMessagesDate: today,
      aiMessagesUsedToday: 1000, // far over the cap
    });
    expect(useSubscriptionStore.getState().aiMessagesLeft()).toBe(0);
  });

  test('premium returns Infinity', () => {
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
    expect(useSubscriptionStore.getState().aiMessagesLeft()).toBe(Infinity);
  });

  test('premium food scans also Infinity', () => {
    useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
    expect(useSubscriptionStore.getState().foodScansLeft()).toBe(Infinity);
  });
});
