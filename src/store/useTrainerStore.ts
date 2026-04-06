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

interface TrainerStore {
  clients: TrainerClient[];
  isLoading: boolean;

  fetchClients: () => Promise<void>;
  addClient: (client: Omit<TrainerClient, 'id'>) => Promise<void>;
  updateClient: (id: string, data: Partial<TrainerClient>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
}

export const useTrainerStore = create<TrainerStore>()(
  persist(
    (set, get) => ({
      clients: [],
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
        // Optimistic: add locally first
        const tempId = Date.now().toString();
        const tempClient: TrainerClient = { ...data, id: tempId };
        set((s) => ({ clients: [tempClient, ...s.clients] }));

        try {
          const serverClient = await trainerService.addClient(data);
          // Replace temp with server response
          set((s) => ({
            clients: s.clients.map((c) => c.id === tempId ? serverClient : c),
          }));
        } catch {
          // Revert on failure
          set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }));
        }
      },

      updateClient: async (id, data) => {
        // Optimistic update
        const prev = get().clients.find((c) => c.id === id);
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? { ...c, ...data } : c),
        }));

        try {
          await trainerService.updateClient(id, data);
        } catch {
          // Revert on failure
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }));
          }
        }
      },

      deleteClient: async (id) => {
        const prev = get().clients;
        set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));

        try {
          await trainerService.deleteClient(id);
        } catch {
          // Revert on failure
          set({ clients: prev });
        }
      },
    }),
    {
      name: 'iron-gym-trainer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ clients: state.clients }),
    }
  )
);
