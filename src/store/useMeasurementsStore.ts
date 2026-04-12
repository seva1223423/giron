import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BodyMeasurement {
  id: string;
  date: string; // YYYY-MM-DD
  chest?: number;   // cm
  waist?: number;   // cm
  hips?: number;    // cm
  arms?: number;    // cm (bicep, flexed)
  thighs?: number;  // cm
  neck?: number;    // cm
  notes?: string;
}

interface MeasurementsStore {
  entries: BodyMeasurement[];
  addEntry: (data: Omit<BodyMeasurement, 'id'>) => void;
  updateEntry: (id: string, data: Partial<BodyMeasurement>) => void;
  deleteEntry: (id: string) => void;
  getLatest: () => BodyMeasurement | null;
}

export const useMeasurementsStore = create<MeasurementsStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (data) => {
        const entry: BodyMeasurement = { ...data, id: `meas-${Date.now()}` };
        set((s) => ({ entries: [entry, ...s.entries] }));
      },

      updateEntry: (id, data) => {
        set((s) => ({ entries: s.entries.map((e) => e.id === id ? { ...e, ...data } : e) }));
      },

      deleteEntry: (id) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
      },

      getLatest: () => {
        const sorted = [...get().entries].sort((a, b) => b.date.localeCompare(a.date));
        return sorted[0] ?? null;
      },
    }),
    {
      name: 'iron-gym-measurements',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
