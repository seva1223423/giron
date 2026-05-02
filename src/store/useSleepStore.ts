import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedAsyncStorage } from '../utils/encryptedStorage';
import { userService } from '../services/userService';

export interface SleepEntry {
  date: string; // YYYY-MM-DD
  bedtime: string; // HH:MM (24h)
  wakeTime: string; // HH:MM (24h)
  durationHours: number;
  quality?: number; // 1-5
  /** Set to true when addEntry's POST failed with a network/5xx error and the
   *  row is still waiting to reach the server. syncFromServer flushes these
   *  on the next online tick. Always undefined for server-confirmed rows so
   *  no migration is needed for existing persisted state. */
  pendingSync?: boolean;
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
  /** Round 279: session-epoch (R249 pattern). */
  _sessionEpoch: number;
}

const computeDuration = (bedtime: string, wakeTime: string): number => {
  const [bH, bM] = bedtime.split(':').map(Number);
  const [wH, wM] = wakeTime.split(':').map(Number);
  if (!Number.isFinite(bH) || !Number.isFinite(bM) || !Number.isFinite(wH) || !Number.isFinite(wM)) return 0;
  let bedMinutes = bH * 60 + bM;
  let wakeMinutes = wH * 60 + wM;
  if (wakeMinutes <= bedMinutes) wakeMinutes += 24 * 60;
  return parseFloat(((wakeMinutes - bedMinutes) / 60).toFixed(2));
};

export const useSleepStore = create<SleepStore>()(
  persist(
    (set, get) => ({
      entries: [],
      _sessionEpoch: 0,

      addEntry: (entry) => {
        const durationHours = computeDuration(entry.bedtime, entry.wakeTime);
        const newEntry: SleepEntry = { ...entry, durationHours };
        set((state) => ({
          entries: [newEntry, ...state.entries.filter((e) => e.date !== entry.date)]
            .sort((a, b) => b.date.localeCompare(a.date)),
        }));
        // Round 73: distinguish 4xx (drop — bad payload, retrying won't help)
        // from network/5xx (keep with pendingSync — syncFromServer will push
        // it on the next online tick). The original behaviour dropped EVERY
        // failure mode, so a sleep entry logged offline silently vanished
        // from the user's history. Same shape as cardioStore round 71 and
        // measurementsStore round 72.
        userService.saveSleep({ ...newEntry }).catch((err: any) => {
          const status = err?.response?.status;
          if (status && status >= 400 && status < 500) {
            set((s) => ({ entries: s.entries.filter((e) => e.date !== newEntry.date) }));
          } else {
            // Mark as pending so the next syncFromServer flushes it.
            set((s) => ({
              entries: s.entries.map((e) =>
                e.date === newEntry.date ? { ...e, pendingSync: true } : e,
              ),
            }));
          }
        });
      },

      removeEntry: (date) => {
        const removed = get().entries.find((e) => e.date === date);
        set((state) => ({ entries: state.entries.filter((e) => e.date !== date) }));
        userService.deleteSleep(date).catch((err) => {
          // 404 = entry was never synced to server (local-only) — treat as success
          if (err?.response?.status !== 404 && removed) {
            // Re-add only the removed entry — restoring a snapshot would erase concurrent changes
            set((s) => ({
              entries: [...s.entries, removed].sort((a, b) => b.date.localeCompare(a.date)),
            }));
          }
        });
      },

      syncFromServer: async () => {
        // Round 279: session-epoch (R249 pattern).
        const epoch = get()._sessionEpoch ?? 0;
        try {
          // Phase 1 — flush any entries marked pendingSync (offline-saved
          // but never reached the backend). Server upsert is keyed on
          // userId+date so retrying is idempotent. Round 73.
          const pending = get().entries.filter((e) => e.pendingSync);
          const flushedDates = new Set<string>();
          for (const local of pending) {
            try {
              await userService.saveSleep({
                date: local.date,
                bedtime: local.bedtime,
                wakeTime: local.wakeTime,
                durationHours: local.durationHours,
                quality: local.quality,
              });
              flushedDates.add(local.date);
            } catch {
              // Still offline / still 4xx — leave pendingSync flag in place
              // for the next sync tick.
            }
          }
          // Clear the flag on successfully-flushed entries before we hit the
          // merge phase. They'll be replaced by the server snapshot next.
          if (flushedDates.size > 0) {
            set((s) => ({
              entries: s.entries.map((e) =>
                flushedDates.has(e.date) ? { ...e, pendingSync: undefined } : e,
              ),
            }));
          }

          const serverEntries = await userService.getSleep();
          if (serverEntries.length > 0) {
            const mapped: SleepEntry[] = serverEntries.map((e) => ({
              date: e.date,
              bedtime: e.bedtime,
              wakeTime: e.wakeTime,
              durationHours: e.durationHours,
              quality: e.quality ?? undefined,
            })).sort((a, b) => b.date.localeCompare(a.date));
            // Merge: server is authoritative; keep local entries (pending or
            // synced from a previous session) for dates the server doesn't
            // know about.
            const serverDates = new Set(mapped.map((e) => e.date));
            const localOnly = get().entries.filter((e) => !serverDates.has(e.date));
            set({ entries: [...localOnly, ...mapped].sort((a, b) => b.date.localeCompare(a.date)) });
          }
        } catch {
          // Keep local entries if server unreachable
        }
      },

      getLastEntries: (count) => {
        if (count <= 0) return [];
        return [...get().entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, count);
      },

      getAverageDuration: (days) => {
        const last = [...get().entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, Math.max(0, days));
        if (last.length === 0) return 0;
        return parseFloat((last.reduce((sum, e) => sum + e.durationHours, 0) / last.length).toFixed(1));
      },

      getAverageQuality: (days) => {
        const last = [...get().entries]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, Math.max(0, days))
          .filter((e) => e.quality != null);
        if (last.length === 0) return 0;
        return parseFloat((last.reduce((sum, e) => sum + (e.quality ?? 0), 0) / last.length).toFixed(1));
      },

      clearUserData: () => set((s) => ({
        entries: [],
        _sessionEpoch: ((s as any)._sessionEpoch ?? 0) + 1,
      })),
    }),
    {
      name: 'giron-sleep',
      version: 1,
      // Round 233 (security audit, HIGH-2): sleep timing/duration is
      // personal health data. AES-GCM-wrapped storage with per-install
      // master key in Keychain/Keystore. Reads pre-round-233 plaintext
      // blobs as a one-shot migration; the next state-mutation write
      // encrypts.
      storage: createJSONStorage(() => createEncryptedAsyncStorage()),
      migrate: (state: any) => state,
    },
  ),
);
