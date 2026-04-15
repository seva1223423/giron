import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardioSession } from '../types';
import { cardioService } from '../services/cardioService';

interface CardioStore {
  sessions: CardioSession[];
  addSession: (session: Omit<CardioSession, 'id' | 'createdAt'>) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  getWeekSessions: () => CardioSession[];
  syncFromServer: () => Promise<void>;
}

const weekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const useCardioStore = create<CardioStore>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: async (data) => {
        try {
          const session = await cardioService.createSession(data);
          set((s) => ({ sessions: [session, ...s.sessions] }));
        } catch {
          // Offline fallback: save locally with temp id
          const session: CardioSession = {
            ...data,
            id: `local-${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({ sessions: [session, ...s.sessions] }));
        }
      },

      removeSession: async (id) => {
        const snapshot = get().sessions;
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));
        if (!id.startsWith('local-')) {
          cardioService.deleteSession(id).catch(() => {
            set({ sessions: snapshot });
          });
        }
      },

      getWeekSessions: () => {
        const start = weekStart();
        return get().sessions.filter((s) => new Date(s.date) >= start);
      },

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
