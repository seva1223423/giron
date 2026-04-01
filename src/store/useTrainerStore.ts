import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const SAMPLE_CLIENTS: TrainerClient[] = [
  { id: '1', name: 'Алексей Смирнов', age: 28, goal: 'muscle_gain', level: 'intermediate', lastVisit: '2026-03-31', totalWorkouts: 42, assignedProgram: 'Толчок-Тяга-Ноги', emoji: '💪', phone: '+7 900 000 0001' },
  { id: '2', name: 'Мария Козлова', age: 24, goal: 'weight_loss', level: 'beginner', lastVisit: '2026-04-01', totalWorkouts: 18, assignedProgram: 'Верх / Низ', emoji: '🏃', phone: '+7 900 000 0002' },
  { id: '3', name: 'Дмитрий Петров', age: 35, goal: 'strength', level: 'advanced', lastVisit: '2026-03-29', totalWorkouts: 87, assignedProgram: 'Стартовая сила', emoji: '🏋️', phone: '+7 900 000 0003' },
];

interface TrainerStore {
  clients: TrainerClient[];
  addClient: (client: Omit<TrainerClient, 'id'>) => void;
  updateClient: (id: string, data: Partial<TrainerClient>) => void;
  deleteClient: (id: string) => void;
}

export const useTrainerStore = create<TrainerStore>()(
  persist(
    (set) => ({
      clients: SAMPLE_CLIENTS,

      addClient: (data) => set((s) => ({
        clients: [...s.clients, { ...data, id: Date.now().toString() }],
      })),

      updateClient: (id, data) => set((s) => ({
        clients: s.clients.map((c) => c.id === id ? { ...c, ...data } : c),
      })),

      deleteClient: (id) => set((s) => ({
        clients: s.clients.filter((c) => c.id !== id),
      })),
    }),
    {
      name: 'iron-gym-trainer',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
