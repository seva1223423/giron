import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingTipsStore {
  shownTips: string[];
  markShown: (tipId: string) => void;
  hasShown: (tipId: string) => boolean;
  resetAll: () => void;
}

export const useOnboardingTipsStore = create<OnboardingTipsStore>()(
  persist(
    (set, get) => ({
      shownTips: [],
      markShown: (tipId) => set((s) => ({
        shownTips: s.shownTips.includes(tipId) ? s.shownTips : [...s.shownTips, tipId],
      })),
      hasShown: (tipId) => get().shownTips.includes(tipId),
      resetAll: () => set({ shownTips: [] }),
    }),
    { name: 'iron-gym-tips', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
