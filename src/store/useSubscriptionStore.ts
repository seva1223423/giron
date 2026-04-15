import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const FREE_AI_MESSAGES_PER_DAY = 10;
const FREE_FOOD_SCANS_PER_DAY = 5;
const FREE_WORKOUT_HISTORY_LIMIT = 10;
const FREE_MEASUREMENTS_LIMIT = 5;
const FREE_TRAINER_CLIENTS_LIMIT = 3;

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

interface SubscriptionStore {
  isPremium: boolean;
  premiumExpiresAt: string | null; // ISO date string
  plan: string | null; // 'free' | 'pro' | 'trainer' | 'club'
  status: string | null; // 'active' | 'cancelled' | 'expired'
  trialUsed: boolean;

  // Daily usage counters (reset each day)
  aiMessagesUsedToday: number;
  aiMessagesDate: string | null; // YYYY-MM-DD
  foodScansUsedToday: number;
  foodScansDate: string | null; // YYYY-MM-DD

  // Actions
  activatePremium: (expiresAt: string) => void;
  deactivatePremium: () => void;
  markTrialUsed: () => void;

  // Backend sync
  syncWithBackend: () => Promise<void>;
  activateOnBackend: (plan: 'pro' | 'trainer' | 'club', durationDays: number) => Promise<void>;
  cancelOnBackend: () => Promise<{ message?: string }>;

  // Counters — return true if allowed, false if limit exceeded
  canSendAiMessage: () => boolean;
  consumeAiMessage: () => boolean;
  canScanFood: () => boolean;
  consumeFoodScan: () => boolean;

  // Getters
  aiMessagesLeft: () => number;
  foodScansLeft: () => number;
  isPremiumActive: () => boolean;

  // Feature gates — return true if the user is allowed to access the feature
  canViewFullWorkoutHistory: () => boolean;
  canViewFullMeasurements: () => boolean;
  canAddTrainerClient: (currentClientCount: number) => boolean;
  canViewLeaderboard: () => boolean;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      isPremium: false,
      premiumExpiresAt: null,
      plan: null,
      status: null,
      trialUsed: false,

      aiMessagesUsedToday: 0,
      aiMessagesDate: null,
      foodScansUsedToday: 0,
      foodScansDate: null,

      activatePremium: (expiresAt) =>
        set({ isPremium: true, premiumExpiresAt: expiresAt, trialUsed: true }),

      deactivatePremium: () =>
        set({ isPremium: false, premiumExpiresAt: null, plan: null, status: null }),

      markTrialUsed: () => set({ trialUsed: true }),

      syncWithBackend: async () => {
        try {
          const { data } = await api.get('/subscription/status');
          set({
            isPremium: data.isPremium,
            premiumExpiresAt: data.expiresAt || null,
            plan: data.plan || null,
            status: data.status || null,
            trialUsed: data.plan !== 'free',
          });
        } catch (e) {
          console.error('Sync subscription error:', e);
        }
      },

      activateOnBackend: async (plan, durationDays) => {
        try {
          const { data } = await api.post('/subscription/activate', { plan, durationDays });
          set({
            isPremium: data.isPremium,
            premiumExpiresAt: data.expiresAt || null,
            plan: data.plan,
            status: data.status,
            trialUsed: true,
          });
        } catch (e) {
          console.error('Activate subscription error:', e);
          throw e;
        }
      },

      cancelOnBackend: async () => {
        try {
          const { data } = await api.post('/subscription/cancel');
          set({
            isPremium: data.isPremium,
            premiumExpiresAt: data.expiresAt || null,
            status: data.status,
          });
          return { message: data.message };
        } catch (e) {
          console.error('Cancel subscription error:', e);
          throw e;
        }
      },

      isPremiumActive: () => {
        const { isPremium, premiumExpiresAt } = get();
        if (!isPremium) return false;
        if (!premiumExpiresAt) return true;
        return new Date(premiumExpiresAt) > new Date();
      },

      canSendAiMessage: () => {
        if (get().isPremiumActive()) return true;
        const today = todayDateStr();
        const { aiMessagesDate, aiMessagesUsedToday } = get();
        if (aiMessagesDate !== today) return true; // new day, counter will reset
        return aiMessagesUsedToday < FREE_AI_MESSAGES_PER_DAY;
      },

      consumeAiMessage: () => {
        if (get().isPremiumActive()) return true;
        const today = todayDateStr();
        const { aiMessagesDate, aiMessagesUsedToday } = get();

        const used = aiMessagesDate === today ? aiMessagesUsedToday : 0;
        if (used >= FREE_AI_MESSAGES_PER_DAY) return false;

        set({ aiMessagesUsedToday: used + 1, aiMessagesDate: today });
        return true;
      },

      canScanFood: () => {
        if (get().isPremiumActive()) return true;
        const today = todayDateStr();
        const { foodScansDate, foodScansUsedToday } = get();
        if (foodScansDate !== today) return true;
        return foodScansUsedToday < FREE_FOOD_SCANS_PER_DAY;
      },

      consumeFoodScan: () => {
        if (get().isPremiumActive()) return true;
        const today = todayDateStr();
        const { foodScansDate, foodScansUsedToday } = get();

        const used = foodScansDate === today ? foodScansUsedToday : 0;
        if (used >= FREE_FOOD_SCANS_PER_DAY) return false;

        set({ foodScansUsedToday: used + 1, foodScansDate: today });
        return true;
      },

      aiMessagesLeft: () => {
        if (get().isPremiumActive()) return Infinity;
        const today = todayDateStr();
        const { aiMessagesDate, aiMessagesUsedToday } = get();
        const used = aiMessagesDate === today ? aiMessagesUsedToday : 0;
        return Math.max(0, FREE_AI_MESSAGES_PER_DAY - used);
      },

      foodScansLeft: () => {
        if (get().isPremiumActive()) return Infinity;
        const today = todayDateStr();
        const { foodScansDate, foodScansUsedToday } = get();
        const used = foodScansDate === today ? foodScansUsedToday : 0;
        return Math.max(0, FREE_FOOD_SCANS_PER_DAY - used);
      },

      canViewFullWorkoutHistory: () => get().isPremiumActive(),
      canViewFullMeasurements: () => get().isPremiumActive(),
      canAddTrainerClient: (currentClientCount) =>
        get().isPremiumActive() || currentClientCount < FREE_TRAINER_CLIENTS_LIMIT,
      canViewLeaderboard: () => get().isPremiumActive(),
    }),
    {
      name: 'iron-gym-subscription',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (state: any, _version: number) => state,
      partialize: (state) => ({
        isPremium: state.isPremium,
        premiumExpiresAt: state.premiumExpiresAt,
        plan: state.plan,
        status: state.status,
        trialUsed: state.trialUsed,
        aiMessagesUsedToday: state.aiMessagesUsedToday,
        aiMessagesDate: state.aiMessagesDate,
        foodScansUsedToday: state.foodScansUsedToday,
        foodScansDate: state.foodScansDate,
      }),
    }
  )
);

export const FREE_LIMITS = {
  AI_MESSAGES_PER_DAY: FREE_AI_MESSAGES_PER_DAY,
  FOOD_SCANS_PER_DAY: FREE_FOOD_SCANS_PER_DAY,
  WORKOUT_HISTORY: FREE_WORKOUT_HISTORY_LIMIT,
  MEASUREMENTS: FREE_MEASUREMENTS_LIMIT,
  TRAINER_CLIENTS: FREE_TRAINER_CLIENTS_LIMIT,
};
