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

  fetchSessions: (clientId: string) => Promise<void>;
  logWorkoutSession: (session: Omit<TrainerWorkoutSession, 'id'>) => Promise<void>;
  removeWorkoutSession: (id: string) => Promise<void>;
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
        const prevClients = get().clients;
        const prevSessions = get().sessions;
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          sessions: s.sessions.filter((s) => s.clientId !== id),
        }));

        try {
          await trainerService.deleteClient(id);
        } catch {
          set({ clients: prevClients, sessions: prevSessions });
        }
      },

      fetchSessions: async (clientId) => {
        try {
          const serverSessions = await trainerService.getSessions(clientId);
          // Replace all sessions for this client with server data
          set((s) => ({
            sessions: [
              ...s.sessions.filter((sess) => sess.clientId !== clientId),
              ...serverSessions,
            ],
          }));
        } catch {
          // Keep local sessions if server unreachable
        }
      },

      logWorkoutSession: async (data) => {
        const prevSessions = get().sessions;
        const tempId = `session-${Date.now()}`;
        const tempSession: TrainerWorkoutSession = { ...data, id: tempId };
        set((s) => ({ sessions: [tempSession, ...s.sessions] }));

        try {
          const { clientId, ...rest } = data;
          const serverSession = await trainerService.logSession(clientId, rest);
          // Replace temp with real server record
          set((s) => ({
            sessions: s.sessions.map((sess) => sess.id === tempId ? serverSession : sess),
          }));
          // Sync updated client (totalWorkouts incremented server-side)
          const updatedClients = await trainerService.getClients();
          set({ clients: updatedClients });
        } catch {
          set({ sessions: prevSessions });
        }
      },

      removeWorkoutSession: async (id) => {
        const prev = get().sessions;
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));

        try {
          await trainerService.deleteSession(id);
          // Re-fetch clients to get updated totalWorkouts
          const updatedClients = await trainerService.getClients();
          set({ clients: updatedClients });
        } catch {
          set({ sessions: prev });
        }
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
