import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userService } from '../services/userService';

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
  syncFromServer: () => Promise<void>;
  getLastEntries: (count: number) => SleepEntry[];
  getAverageDuration: (days: number) => number;
  getAverageQuality: (days: number) => number;
  clearUserData: () => void;
}

const computeDuration = (bedtime: string, wakeTime: string): number => {
  const [bH, bM] = bedtime.split(':').map(Number);
  const [wH, wM] = wakeTime.split(':').map(Number);
  let bedMinutes = bH * 60 + bM;
  let wakeMinutes = wH * 60 + wM;
  if (wakeMinutes <= bedMinutes) wakeMinutes += 24 * 60;
  return parseFloat(((wakeMinutes - bedMinutes) / 60).toFixed(2));
};

export const useSleepStore = create<SleepStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) => {
        const snapshot = get().entries;
        const durationHours = computeDuration(entry.bedtime, entry.wakeTime);
        const newEntry: SleepEntry = { ...entry, durationHours };
        set((state) => ({
          entries: [newEntry, ...state.entries.filter((e) => e.date !== entry.date)]
            .sort((a, b) => b.date.localeCompare(a.date)),
        }));
        // Sync to server with rollback on failure
        userService.saveSleep({ ...newEntry }).catch(() => {
          set({ entries: snapshot });
        });
      },

      removeEntry: (date) => {
        const snapshot = get().entries;
        set((state) => ({ entries: state.entries.filter((e) => e.date !== date) }));
        userService.deleteSleep(date).catch(() => {
          set({ entries: snapshot });
        });
      },

      syncFromServer: async () => {
        try {
          const serverEntries = await userService.getSleep();
          if (serverEntries.length > 0) {
            const mapped: SleepEntry[] = serverEntries.map((e) => ({
              date: e.date,
              bedtime: e.bedtime,
              wakeTime: e.wakeTime,
              durationHours: e.durationHours,
              quality: e.quality ?? undefined,
            })).sort((a, b) => b.date.localeCompare(a.date));
            // Merge: server is authoritative; keep local-only entries (any date) not known to server
            const serverDates = new Set(mapped.map((e) => e.date));
            const localOnly = get().entries.filter((e) => !serverDates.has(e.date));
            set({ entries: [...localOnly, ...mapped].sort((a, b) => b.date.localeCompare(a.date)) });
          }
        } catch {
          // Keep local entries if server unreachable
        }
      },

      getLastEntries: (count) => {
        return [...get().entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, count);
      },

      getAverageDuration: (days) => {
        const last = [...get().entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, days);
        if (last.length === 0) return 0;
        return parseFloat((last.reduce((sum, e) => sum + e.durationHours, 0) / last.length).toFixed(1));
      },

      getAverageQuality: (days) => {
        const last = [...get().entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, days)
          .filter((e) => e.quality != null);
        if (last.length === 0) return 0;
        return parseFloat((last.reduce((sum, e) => sum + (e.quality ?? 0), 0) / last.length).toFixed(1));
      },

      clearUserData: () => set({ entries: [] }),
    }),
    {
      name: 'iron-gym-sleep',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (state: any) => state,
    },
  ),
);
