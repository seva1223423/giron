import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, Colors } from '../theme/colors';

interface ThemeStore {
  mode: 'light' | 'dark' | 'system';
  colors: Colors;
  isDark: boolean;
  setMode: (mode: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light',
      colors: lightColors,
      isDark: false,
      setMode: (mode) => {
        const isDark = mode === 'dark';
        set({
          mode,
          isDark,
          colors: isDark ? darkColors : lightColors,
        });
      },
      toggleTheme: () => {
        const current = get().mode;
        const next = current === 'light' ? 'dark' : 'light';
        get().setMode(next);
      },
    }),
    {
      name: 'iron-gym-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const isDark = state.mode === 'dark';
          state.isDark = isDark;
          state.colors = isDark ? darkColors : lightColors;
        }
      },
    }
  )
);
