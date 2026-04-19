import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userService } from '../services/userService';

export interface BodyMeasurement {
  id: string;
  date: string; // YYYY-MM-DD
  chest?: number;   // cm
  waist?: number;   // cm
  hips?: number;    // cm
  bicep?: number;   // cm (bicep, flexed)
  thigh?: number;   // cm
  calf?: number;    // cm
  neck?: number;    // cm
  notes?: string;   // local-only field
}

interface MeasurementsStore {
  entries: BodyMeasurement[];
  addEntry: (data: Omit<BodyMeasurement, 'id'>) => void;
  updateEntry: (id: string, data: Partial<BodyMeasurement>) => void;
  deleteEntry: (id: string) => void;
  getLatest: () => BodyMeasurement | null;
  syncFromServer: () => Promise<void>;
  clearUserData: () => void;
}

export const useMeasurementsStore = create<MeasurementsStore>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (data) => {
        const snapshot = get().entries;
        const entry: BodyMeasurement = { ...data, id: `meas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        set((s) => ({ entries: [entry, ...s.entries] }));
        // Sync to server; upgrade local ID to server-{date} so deleteEntry can reach it
        const serverId = `server-${data.date}`;
        userService.saveMeasurement({ date: data.date, chest: data.chest, waist: data.waist, hips: data.hips, bicep: data.bicep, thigh: data.thigh, calf: data.calf, neck: data.neck }).then(() => {
          set((s) => ({ entries: s.entries.map((e) => e.id === entry.id ? { ...e, id: serverId } : e) }));
        }).catch(() => {
          set({ entries: snapshot });
        });
      },

      updateEntry: (id, data) => {
        const snapshot = get().entries;
        const existing = snapshot.find((e) => e.id === id);
        set((s) => ({ entries: s.entries.map((e) => e.id === id ? { ...e, ...data } : e) }));
        if (existing) {
          const updated = { ...existing, ...data };
          userService.saveMeasurement({ date: updated.date, chest: updated.chest, waist: updated.waist, hips: updated.hips, bicep: updated.bicep, thigh: updated.thigh, calf: updated.calf, neck: updated.neck }).catch(() => {
            set({ entries: snapshot });
          });
        }
      },

      deleteEntry: (id) => {
        const snapshot = get().entries;
        const entry = get().entries.find((e) => e.id === id);
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        // Only sync deletion for server-persisted entries; local-only entries (pending sync)
        // are not on the server yet so calling delete would 404 and rollback the local removal.
        if (entry?.date && entry.id.startsWith('server-')) {
          userService.deleteMeasurement(entry.date).catch((err) => {
            // 404 = already deleted on server — treat as success, don't rollback
            if (err?.response?.status !== 404) set({ entries: snapshot });
          });
        }
      },

      getLatest: () => {
        const sorted = [...get().entries].sort((a, b) => b.date.localeCompare(a.date));
        return sorted[0] ?? null;
      },

      syncFromServer: async () => {
        try {
          const serverEntries = await userService.getMeasurements();
          if (serverEntries.length > 0) {
            const mapped: BodyMeasurement[] = serverEntries.map((e) => {
              const dateStr = typeof e.date === 'string' ? e.date.split('T')[0] : e.date;
              return {
                id: `server-${dateStr}`,
                date: dateStr,
                chest: e.chest,
                waist: e.waist,
                hips: e.hips,
                bicep: e.bicep,
                thigh: e.thigh,
                calf: e.calf,
                neck: e.neck,
              };
            });
            // Merge: keep local-only entries (by date) that server doesn't have
            const serverDates = new Set(mapped.map((e) => e.date));
            const localOnly = get().entries.filter((e) => !serverDates.has(e.date) && !e.id.startsWith('server-'));
            set({ entries: [...localOnly, ...mapped].sort((a, b) => b.date.localeCompare(a.date)) });
          }
        } catch {
          // Keep local data if server unreachable
        }
      },

      clearUserData: () => set({ entries: [] }),
    }),
    {
      name: 'iron-gym-measurements',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
