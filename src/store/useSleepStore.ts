import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SleepEntry {
  date: string; // YYYY-MM-DD
  bedtime: string; // HH:MM (24h)
  wakeTime: string; // HH:MM (24h)
  durationHours: number;
  quality?: number; // 1-5
}

interface SleepStore {
  entries: SleepEntry[];
  addEntry: (entry: Omit<SleepEntry, 'durationHours'>) => void;
  removeEntry: (date: string) => void;
  getLastEntries: (count: number) => SleepEntry[];
  getAverageDuration: (days: number) => number;
}

const computeDuration = (bedtime: string, wakeTime: string): number => {
  const [bH, bM] = bedtime.split(':').map(Number);
  const [wH, wM] = wakeTime.split(':').map(Number);
  let bedMinutes = bH * 60 + bM;
  let wakeMinutes = wH * 60 + wM;
  if (wakeMinutes <= bedMinutes) {
    wakeMinutes += 24 * 60; // handle overnight
  }
  return parseFloat(((wakeMinutes - bedMinutes) / 60).toFixed(2));
};

export const useSleepStore = create<SleepStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) => {
        const durationHours = computeDuration(entry.bedtime, entry.wakeTime);
        const newEntry: SleepEntry = { ...entry, durationHours };
        set((state) => ({
          entries: [newEntry, ...state.entries.filter((e) => e.date !== entry.date)]
            .sort((a, b) => b.date.localeCompare(a.date)),
        }));
      },

      removeEntry: (date) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.date !== date),
        }));
      },

      getLastEntries: (count) => {
        const { entries } = get();
        return [...entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, count);
      },

      getAverageDuration: (days) => {
        const { entries } = get();
        const last = [...entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, days);
        if (last.length === 0) return 0;
        const total = last.reduce((sum, e) => sum + e.durationHours, 0);
        return parseFloat((total / last.length).toFixed(1));
      },
    }),
    {
      name: 'iron-gym-sleep',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
