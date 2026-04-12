import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trainerService } from '../services/trainerService';

export interface TrainerClient {
  id: string;
  name: string;
  age?: number;
  goal?: string;
  level?: string;
  lastVisit?: string;
  totalWorkouts?: number;
  assignedProgram?: string;
  notes?: string;
  phone?: string;
  emoji?: string;
}

export interface TrainerWorkoutSession {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  name: string;
  durationMinutes: number;
  volumeKg?: number;
  notes?: string;
}

interface TrainerStore {
  clients: TrainerClient[];
  sessions: TrainerWorkoutSession[];
  isLoading: boolean;

  fetchClients: () => Promise<void>;
  addClient: (client: Omit<TrainerClient, 'id'>) => Promise<void>;
  updateClient: (id: string, data: Partial<TrainerClient>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  logWorkoutSession: (session: Omit<TrainerWorkoutSession, 'id'>) => void;
  removeWorkoutSession: (id: string) => void;
  getClientSessions: (clientId: string) => TrainerWorkoutSession[];
}

export const useTrainerStore = create<TrainerStore>()(
  persist(
    (set, get) => ({
      clients: [],
      sessions: [],
      isLoading: false,

      fetchClients: async () => {
        set({ isLoading: true });
        try {
          const clients = await trainerService.getClients();
          set({ clients, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      addClient: async (data) => {
        const tempId = Date.now().toString();
        const tempClient: TrainerClient = { ...data, id: tempId };
        set((s) => ({ clients: [tempClient, ...s.clients] }));

        try {
          const serverClient = await trainerService.addClient(data);
          set((s) => ({
            clients: s.clients.map((c) => c.id === tempId ? serverClient : c),
          }));
        } catch {
          set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }));
        }
      },

      updateClient: async (id, data) => {
        const prev = get().clients.find((c) => c.id === id);
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? { ...c, ...data } : c),
        }));

        try {
          await trainerService.updateClient(id, data);
        } catch {
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }));
          }
        }
      },

      deleteClient: async (id) => {
        const prev = get().clients;
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          sessions: s.sessions.filter((s) => s.clientId !== id),
        }));

        try {
          await trainerService.deleteClient(id);
        } catch {
          set({ clients: prev });
        }
      },

      logWorkoutSession: (data) => {
        const session: TrainerWorkoutSession = { ...data, id: `session-${Date.now()}` };
        set((s) => ({ sessions: [session, ...s.sessions] }));
      },

      removeWorkoutSession: (id) => {
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));
      },

      getClientSessions: (clientId) => {
        return get().sessions
          .filter((s) => s.clientId === clientId)
          .sort((a, b) => b.date.localeCompare(a.date));
      },
    }),
    {
      name: 'iron-gym-trainer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ clients: state.clients, sessions: state.sessions }),
    }
  )
);
