import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedAsyncStorage } from '../utils/encryptedStorage';
import { CardioSession } from '../types';
import { cardioService } from '../services/cardioService';
import { localDateStr } from '../utils/date';

interface CardioStore {
  sessions: CardioSession[];
  addSession: (session: Omit<CardioSession, 'id' | 'createdAt'>) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  getWeekSessions: () => CardioSession[];
  syncFromServer: () => Promise<void>;
  clearUserData: () => void;
  /** Round 278: session-epoch counter (mirrors R249 in useWorkoutStore).
   *  Bumped by clearUserData; syncFromServer captures before await
   *  and discards set() on mismatch so user-A's data can't pollute
   *  user-B after a fast logout/login swap. */
  _sessionEpoch: number;
}

const weekStartStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return localDateStr(d);
};

export const useCardioStore = create<CardioStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      _sessionEpoch: 0,

      addSession: async (data) => {
        try {
          const session = await cardioService.createSession(data);
          set((s) => ({ sessions: [session, ...s.sessions] }));
        } catch (e: any) {
          // Only fall back to local storage for network errors (offline); not for 4xx validation errors
          const status = e?.response?.status;
          if (status && status >= 400 && status < 500) throw e;
          const session: CardioSession = {
            ...data,
            id: `local-${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({ sessions: [session, ...s.sessions] }));
        }
      },

      removeSession: async (id) => {
        const removed = get().sessions.find((s) => s.id === id);
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));
        if (!id.startsWith('local-')) {
          cardioService.deleteSession(id).catch((err) => {
            // 404 = already deleted on server — treat as success, don't rollback
            if (err?.response?.status !== 404 && removed) {
              set((s) => ({ sessions: [...s.sessions, removed] }));
            }
          });
        }
      },

      getWeekSessions: () => {
        const start = weekStartStr();
        return get().sessions.filter((s) => s.date >= start);
      },

      clearUserData: () => set((s) => ({
        sessions: [],
        // Round 278: bump epoch so any in-flight syncFromServer drops
        // its result on completion instead of polluting the new session.
        _sessionEpoch: (s._sessionEpoch ?? 0) + 1,
      })),

      syncFromServer: async () => {
        // Round 278: capture session epoch before any await so a
        // logout/user-switch mid-sync doesn't write stale data into
        // the new session.
        const epoch = get()._sessionEpoch ?? 0;
        try {
          // Phase 1 — push offline-created sessions to the server BEFORE we
          // replace state with the server snapshot. Otherwise the local-
          // prefixed entries from addSession's offline-fallback path would
          // never reach the backend (the original behaviour was data loss
          // after the user came back online: getSessions returned just the
          // server set and the local-only filter at the end happened to
          // re-include them locally, so they accumulated forever and never
          // synced). Mirrors the workoutStore.pendingSync retry pattern.
          const localPending = get().sessions.filter((s) => s.id.startsWith('local-'));
          const promoted: CardioSession[] = [];
          const promotedLocalIds = new Set<string>();
          for (const local of localPending) {
            try {
              const newServerSession = await cardioService.createSession({
                type: local.type,
                date: local.date,
                durationMinutes: local.durationMinutes,
                distanceKm: local.distanceKm,
                caloriesBurned: local.caloriesBurned,
                avgHeartRate: local.avgHeartRate,
                notes: local.notes,
              });
              promoted.push(newServerSession);
              promotedLocalIds.add(local.id);
            } catch {
              // Validation reject (400) or transient — leave the local entry
              // in place; next syncFromServer tick will retry. Indefinite
              // retries are tolerable because addSession only takes the
              // local path on NETWORK failure (line 35 already throws on
              // 4xx), so a stuck local-prefixed row is a real desync that
              // the user can also delete manually.
            }
          }

          const serverSessions = await cardioService.getSessions();
          const serverIds = new Set(serverSessions.map((s) => s.id));
          // Read-after-write race protection: if a promoted entry isn't yet
          // in serverSessions (replication lag, eventual consistency), keep
          // the row we got back from createSession so the user doesn't see
          // their freshly-pushed cardio session vanish for a tick.
          const missingPromoted = promoted.filter((p) => !serverIds.has(p.id));
          // Local-only entries that didn't promote this round (rejected by
          // server) stay visible so the user can still see + delete them.
          const localOnly = get().sessions.filter(
            (s) => s.id.startsWith('local-') && !promotedLocalIds.has(s.id) && !serverIds.has(s.id),
          );
          // Round 278: drop result if session changed during the await.
          if ((get()._sessionEpoch ?? 0) !== epoch) return;
          set({ sessions: [...serverSessions, ...missingPromoted, ...localOnly] });
        } catch {
          // Keep local sessions if server unreachable
        }
      },
    }),
    {
      name: 'cardio-store',
      // Round 233 (security audit, HIGH-2 follow-up): cardio sessions
      // (type, duration, calories, heart-rate notes) are personal
      // health data. AES-GCM-wrapped storage with per-install key.
      storage: createJSONStorage(() => createEncryptedAsyncStorage()),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
