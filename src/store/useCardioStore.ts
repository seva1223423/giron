import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

      clearUserData: () => set({ sessions: [] }),

      syncFromServer: async () => {
        try {
          const serverSessions = await cardioService.getSessions();
          // Merge: keep local-only sessions (prefixed with 'local-')
          const serverIds = new Set(serverSessions.map((s) => s.id));
          const localOnly = get().sessions.filter((s) => s.id.startsWith('local-') && !serverIds.has(s.id));
          set({ sessions: [...serverSessions, ...localOnly] });
        } catch {
          // Keep local sessions if server unreachable
        }
      },
    }),
    {
      name: 'cardio-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
