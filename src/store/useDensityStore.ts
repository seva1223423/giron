import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Density } from '../theme/responsive';

interface DensityStore {
  density: Density;
  setDensity: (d: Density) => void;
  cycleDensity: () => void;
}

/**
 * User-controlled density preference. Persisted across launches.
 *
 * Wire this into the Settings screen — give the user a 3-way segmented
 * control: Компактно / Обычно / Просторно. Every responsive component
 * that uses `useResponsive()` will pick it up automatically.
 */
export const useDensityStore = create<DensityStore>()(
  persist(
    (set, get) => ({
      density: 'normal',
      setDensity: (density) => set({ density }),
      cycleDensity: () => {
        const order: Density[] = ['compact', 'normal', 'spacious'];
        const idx = order.indexOf(get().density);
        set({ density: order[(idx + 1) % order.length] });
      },
    }),
    {
      name: 'giron-density',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
