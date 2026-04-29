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
        const entry: BodyMeasurement = { ...data, id: `meas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        set((s) => ({ entries: [entry, ...s.entries] }));
        // Sync to server; upgrade local ID to server-{date} so deleteEntry can reach it
        const serverId = `server-${data.date}`;
        userService.saveMeasurement({ date: data.date, chest: data.chest, waist: data.waist, hips: data.hips, bicep: data.bicep, thigh: data.thigh, calf: data.calf, neck: data.neck }).then(() => {
          set((s) => ({ entries: s.entries.map((e) => e.id === entry.id ? { ...e, id: serverId } : e) }));
        }).catch((err: any) => {
          // Distinguish "server rejected this payload" (4xx — drop, the data
          // was bad) from "we couldn't reach the server" (network — keep
          // the entry locally for syncFromServer to retry). The original
          // behaviour dropped the entry on EVERY failure mode, so a user
          // measuring themselves on the subway watched the row vanish even
          // though the data was perfectly valid. Same shape as cardio's
          // addSession 4xx-vs-network split (round 71 fixed cardio's sync-
          // back too — measurements now mirrors that contract).
          const status = err?.response?.status;
          if (status && status >= 400 && status < 500) {
            set((s) => ({ entries: s.entries.filter((e) => e.id !== entry.id) }));
          }
          // else: keep the meas-prefixed entry; syncFromServer will push it
          // to the backend on the next online tick (idempotent upsert by date).
        });
      },

      updateEntry: (id, data) => {
        const existing = get().entries.find((e) => e.id === id);
        set((s) => ({ entries: s.entries.map((e) => e.id === id ? { ...e, ...data } : e) }));
        if (existing) {
          const updated = { ...existing, ...data };
          userService.saveMeasurement({ date: updated.date, chest: updated.chest, waist: updated.waist, hips: updated.hips, bicep: updated.bicep, thigh: updated.thigh, calf: updated.calf, neck: updated.neck }).catch(() => {
            // Revert only this entry — restoring a snapshot would erase concurrent updates
            set((s) => ({ entries: s.entries.map((e) => e.id === id ? existing : e) }));
          });
        }
      },

      deleteEntry: (id) => {
        const entry = get().entries.find((e) => e.id === id);
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        // Only sync deletion for server-persisted entries; local-only entries (pending sync)
        // are not on the server yet so calling delete would 404 and rollback the local removal.
        if (entry?.date && entry.id.startsWith('server-')) {
          userService.deleteMeasurement(entry.date).catch((err) => {
            // 404 = already deleted on server — treat as success, don't rollback
            if (err?.response?.status !== 404 && entry) {
              set((s) => ({ entries: [...s.entries, entry] }));
            }
          });
        }
      },

      getLatest: () => {
        const sorted = [...get().entries].sort((a, b) => b.date.localeCompare(a.date));
        return sorted[0] ?? null;
      },

      syncFromServer: async () => {
        try {
          // Phase 1 — push offline-saved (`meas-` prefixed) entries to the
          // backend. Without this they accumulate forever on the device and
          // never count toward server-side analytics or AI memory. Idempotent
          // on the server (upsert keyed on userId+date), so retrying after a
          // partial failure is safe. Mirrors cardioStore round 71.
          const localPending = get().entries.filter((e) => e.id.startsWith('meas-'));
          const promotedDates = new Set<string>();
          const promotedRows: BodyMeasurement[] = [];
          for (const local of localPending) {
            try {
              await userService.saveMeasurement({
                date: local.date,
                chest: local.chest,
                waist: local.waist,
                hips: local.hips,
                bicep: local.bicep,
                thigh: local.thigh,
                calf: local.calf,
                neck: local.neck,
              });
              promotedDates.add(local.date);
              // Stash the upgraded row (now with `server-{date}` id) so the
              // user sees it under its new identity even if getMeasurements
              // hasn't propagated the write yet — same read-after-write
              // protection as cardio's `missingPromoted` in round 71.
              promotedRows.push({ ...local, id: `server-${local.date}` });
            } catch {
              // Validation reject (server returned 4xx) or transient — leave
              // the local entry for the next sync tick to retry.
            }
          }

          const serverEntries = await userService.getMeasurements();
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
          const serverDates = new Set(mapped.map((e) => e.date));
          const missingPromoted = promotedRows.filter((p) => !serverDates.has(p.date));
          // Local-only entries that didn't promote this round (e.g. server
          // rejected them) stay visible so the user can retry / delete them.
          const localOnly = get().entries.filter(
            (e) => e.id.startsWith('meas-')
              && !serverDates.has(e.date)
              && !promotedDates.has(e.date),
          );
          set({
            entries: [...localOnly, ...missingPromoted, ...mapped]
              .sort((a, b) => b.date.localeCompare(a.date)),
          });
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
