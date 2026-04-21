/**
 * Tests for useSubscriptionStore — premium status, daily limits, counters
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

/** Match the store's notion of "today" (local calendar day, not UTC) so these
 *  tests don't flake around local midnight when UTC is still the previous day. */
const today = () => localDateStr(new Date());

const resetState = () => {
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
};

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    resetState();
  });

  describe('isPremiumActive', () => {
    test('not premium by default', () => {
      expect(useSubscriptionStore.getState().isPremiumActive()).toBe(false);
    });

    test('premium with no expiry is active', () => {
      useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
      expect(useSubscriptionStore.getState().isPremiumActive()).toBe(true);
    });

    test('premium with future expiry is active', () => {
      const future = new Date(Date.now() + 30 * 86400000).toISOString();
      useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: future });
      expect(useSubscriptionStore.getState().isPremiumActive()).toBe(true);
    });

    test('premium with past expiry is NOT active', () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: past });
      expect(useSubscriptionStore.getState().isPremiumActive()).toBe(false);
    });
  });

  describe('FREE_LIMITS', () => {
    test('AI messages per day limit is defined', () => {
      expect(FREE_LIMITS.AI_MESSAGES_PER_DAY).toBeGreaterThan(0);
    });

    test('food scans per day limit is defined', () => {
      expect(FREE_LIMITS.FOOD_SCANS_PER_DAY).toBeGreaterThan(0);
    });

    test('AI messages limit is 10', () => {
      expect(FREE_LIMITS.AI_MESSAGES_PER_DAY).toBe(10);
    });

    test('food scans limit is 5', () => {
      expect(FREE_LIMITS.FOOD_SCANS_PER_DAY).toBe(5);
    });
  });

  describe('activatePremium / deactivatePremium', () => {
    test('activatePremium sets premium and marks trial used', () => {
      const expiry = new Date(Date.now() + 86400000).toISOString();
      useSubscriptionStore.getState().activatePremium(expiry);
      const state = useSubscriptionStore.getState();
      expect(state.isPremium).toBe(true);
      expect(state.premiumExpiresAt).toBe(expiry);
      expect(state.trialUsed).toBe(true);
    });

    test('deactivatePremium clears premium state', () => {
      useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: 'x', plan: 'pro', status: 'active' });
      useSubscriptionStore.getState().deactivatePremium();
      const state = useSubscriptionStore.getState();
      expect(state.isPremium).toBe(false);
      expect(state.premiumExpiresAt).toBeNull();
      expect(state.plan).toBeNull();
      expect(state.status).toBeNull();
    });
  });

  describe('AI message counters', () => {
    test('canSendAiMessage is true when no messages used today', () => {
      expect(useSubscriptionStore.getState().canSendAiMessage()).toBe(true);
    });

    test('consumeAiMessage increments counter and returns true', () => {
      const result = useSubscriptionStore.getState().consumeAiMessage();
      expect(result).toBe(true);
      expect(useSubscriptionStore.getState().aiMessagesUsedToday).toBe(1);
    });

    test('consumeAiMessage returns false after hitting daily limit', () => {
      const today = new Date().toISOString().split('T')[0];
      useSubscriptionStore.setState({
        aiMessagesUsedToday: FREE_LIMITS.AI_MESSAGES_PER_DAY,
        aiMessagesDate: today,
      });
      const result = useSubscriptionStore.getState().consumeAiMessage();
      expect(result).toBe(false);
    });

    test('canSendAiMessage returns false at daily limit', () => {
      const today = new Date().toISOString().split('T')[0];
      useSubscriptionStore.setState({
        aiMessagesUsedToday: FREE_LIMITS.AI_MESSAGES_PER_DAY,
        aiMessagesDate: today,
      });
      expect(useSubscriptionStore.getState().canSendAiMessage()).toBe(false);
    });

    test('premium user can always send AI messages', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const today = new Date().toISOString().split('T')[0];
      useSubscriptionStore.setState({
        isPremium: true,
        premiumExpiresAt: future,
        aiMessagesUsedToday: FREE_LIMITS.AI_MESSAGES_PER_DAY,
        aiMessagesDate: today,
      });
      expect(useSubscriptionStore.getState().canSendAiMessage()).toBe(true);
      expect(useSubscriptionStore.getState().consumeAiMessage()).toBe(true);
    });

    test('aiMessagesLeft returns correct count', () => {
      const today = new Date().toISOString().split('T')[0];
      useSubscriptionStore.setState({ aiMessagesUsedToday: 3, aiMessagesDate: today });
      expect(useSubscriptionStore.getState().aiMessagesLeft()).toBe(FREE_LIMITS.AI_MESSAGES_PER_DAY - 3);
    });

    test('aiMessagesLeft returns Infinity for premium', () => {
      useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
      expect(useSubscriptionStore.getState().aiMessagesLeft()).toBe(Infinity);
    });

    test('counter resets on new day (old date)', () => {
      useSubscriptionStore.setState({
        aiMessagesUsedToday: FREE_LIMITS.AI_MESSAGES_PER_DAY,
        aiMessagesDate: '2020-01-01',
      });
      // Old date means new day — should allow
      expect(useSubscriptionStore.getState().canSendAiMessage()).toBe(true);
      expect(useSubscriptionStore.getState().consumeAiMessage()).toBe(true);
      expect(useSubscriptionStore.getState().aiMessagesUsedToday).toBe(1);
    });
  });

  describe('food scan counters', () => {
    test('canScanFood is true initially', () => {
      expect(useSubscriptionStore.getState().canScanFood()).toBe(true);
    });

    test('consumeFoodScan increments counter', () => {
      const result = useSubscriptionStore.getState().consumeFoodScan();
      expect(result).toBe(true);
      expect(useSubscriptionStore.getState().foodScansUsedToday).toBe(1);
    });

    test('consumeFoodScan returns false at daily limit', () => {
      const today = new Date().toISOString().split('T')[0];
      useSubscriptionStore.setState({
        foodScansUsedToday: FREE_LIMITS.FOOD_SCANS_PER_DAY,
        foodScansDate: today,
      });
      expect(useSubscriptionStore.getState().consumeFoodScan()).toBe(false);
    });

    test('foodScansLeft returns correct count', () => {
      const today = new Date().toISOString().split('T')[0];
      useSubscriptionStore.setState({ foodScansUsedToday: 2, foodScansDate: today });
      expect(useSubscriptionStore.getState().foodScansLeft()).toBe(FREE_LIMITS.FOOD_SCANS_PER_DAY - 2);
    });

    test('foodScansLeft returns Infinity for premium', () => {
      useSubscriptionStore.setState({ isPremium: true, premiumExpiresAt: null });
      expect(useSubscriptionStore.getState().foodScansLeft()).toBe(Infinity);
    });
  });

  describe('markTrialUsed', () => {
    test('sets trialUsed to true', () => {
      expect(useSubscriptionStore.getState().trialUsed).toBe(false);
      useSubscriptionStore.getState().markTrialUsed();
      expect(useSubscriptionStore.getState().trialUsed).toBe(true);
    });
  });
});
