import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, Colors } from '../theme/colors';

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 21 || hour < 7;
}

interface ThemeStore {
  mode: 'light' | 'dark' | 'auto';
  colors: Colors;
  isDark: boolean;
  setMode: (mode: 'light' | 'dark' | 'auto') => void;
  toggleTheme: () => void;
  applyAutoTheme: () => void;
  resetToDefaults: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light',
      colors: lightColors,
      isDark: false,
      setMode: (mode) => {
        const isDark = mode === 'auto' ? isNightTime() : mode === 'dark';
        set({ mode, isDark, colors: isDark ? darkColors : lightColors });
      },
      toggleTheme: () => {
        const current = get().mode;
        if (current === 'auto') {
          get().setMode('light');
        } else {
          const next = current === 'light' ? 'dark' : 'light';
          get().setMode(next);
        }
      },
      applyAutoTheme: () => {
        if (get().mode !== 'auto') return;
        const isDark = isNightTime();
        if (get().isDark !== isDark) {
          set({ isDark, colors: isDark ? darkColors : lightColors });
        }
      },
      resetToDefaults: () => set({ mode: 'light', isDark: false, colors: lightColors }),
    }),
    {
      name: 'giron-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isDark = state.mode === 'auto' ? isNightTime() : state.mode === 'dark';
          state.isDark = isDark;
          state.colors = isDark ? darkColors : lightColors;
        }
      },
      version: 1,
      migrate: (state: any) => state,
    }
  )
);

// ─── Selector hooks ────────────────────────────────────────────────
//
// Subscribe to ONE slice each — calling `useThemeStore()` returns the
// whole store and re-renders the consumer on every state mutation
// (mode toggle, system theme change, hydration, anything). The
// selector hooks below let leaf components subscribe to just the
// slice they actually use, so an unrelated theme-store mutation
// doesn't cause a cascade of re-renders across the tree.
//
// Usage:
//   const colors = useThemeColors();        // most components
//   const isDark = useThemeIsDark();        // <StatusBar style=...>
//   const mode = useThemeMode();            // settings UI
//
// Round 233 (2026-05-02 audit): introduced after a perf trace showed
// the AI chat list re-rendering on every tab swipe because the swipe
// gesture momentarily flipped a transient theme-store flag.
export const useThemeColors = () => useThemeStore((s) => s.colors);
export const useThemeIsDark = () => useThemeStore((s) => s.isDark);
export const useThemeMode = () => useThemeStore((s) => s.mode);
