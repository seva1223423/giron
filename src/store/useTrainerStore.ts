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
  clearUserData: () => void;
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
        // Random suffix — two rapid addClient calls in the same millisecond
        // would otherwise share an id, and a rollback on one would erase both.
        const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
        const removedClient = get().clients.find((c) => c.id === id);
        const removedSessions = get().sessions.filter((s) => s.clientId === id);
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          sessions: s.sessions.filter((s) => s.clientId !== id),
        }));

        try {
          await trainerService.deleteClient(id);
        } catch (err: any) {
          // 404 = already deleted on server — treat as success, don't rollback
          if (err?.response?.status !== 404 && removedClient) {
            // Re-add only the removed client and sessions — restoring a snapshot would
            // erase concurrent changes made while this delete was in-flight
            set((s) => ({
              clients: [...s.clients, removedClient],
              sessions: [...s.sessions, ...removedSessions],
            }));
          }
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
        // Random suffix — prevents id collision when two sessions are logged
        // within the same millisecond (same reason as addClient above).
        const tempId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const tempSession: TrainerWorkoutSession = { ...data, id: tempId };
        set((s) => ({ sessions: [tempSession, ...s.sessions] }));

        try {
          const { clientId, ...rest } = data;
          const serverSession = await trainerService.logSession(clientId, rest);
          // Replace temp with real server record
          set((s) => ({
            sessions: s.sessions.map((sess) => sess.id === tempId ? serverSession : sess),
          }));
          // Client totalWorkouts will resync on next fetchClients call
        } catch {
          // Remove only the temp session — restoring a snapshot would erase concurrent changes
          set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== tempId) }));
        }
      },

      removeWorkoutSession: async (id) => {
        const removed = get().sessions.find((s) => s.id === id);
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));

        try {
          await trainerService.deleteSession(id);
          // Re-fetch clients to get updated totalWorkouts
          const updatedClients = await trainerService.getClients();
          set({ clients: updatedClients });
        } catch (err: any) {
          // 404 = already deleted on server — treat as success, don't rollback
          if (err?.response?.status !== 404 && removed) {
            // Re-add only the removed session — restoring a snapshot would erase concurrent changes
            set((s) => ({ sessions: [...s.sessions, removed] }));
          }
        }
      },

      getClientSessions: (clientId) => {
        return get().sessions
          .filter((s) => s.clientId === clientId)
          .sort((a, b) => b.date.localeCompare(a.date));
      },

      clearUserData: () => set({ clients: [], sessions: [], isLoading: false }),
    }),
    {
      name: 'iron-gym-trainer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ clients: state.clients, sessions: state.sessions }),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
