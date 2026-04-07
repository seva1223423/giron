import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardioSession } from '../types';

interface CardioStore {
  sessions: CardioSession[];
  addSession: (session: Omit<CardioSession, 'id' | 'createdAt'>) => void;
  removeSession: (id: string) => void;
  getWeekSessions: () => CardioSession[];
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

      addSession: (data) => {
        const session: CardioSession = {
          ...data,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ sessions: [session, ...s.sessions] }));
      },

      removeSession: (id) => {
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));
      },

      getWeekSessions: () => {
        const start = weekStart();
        return get().sessions.filter((s) => new Date(s.date) >= start);
      },
    }),
    {
      name: 'cardio-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
