import { api } from './api';
import type { TrainerClient, TrainerWorkoutSession } from '../store/useTrainerStore';

export const trainerService = {
  // ── Clients ───────────────────────────────────────────────────────────────
  async getClients(): Promise<TrainerClient[]> {
    const { data } = await api.get('/trainer/clients');
    return data;
  },

  async addClient(params: Omit<TrainerClient, 'id'>): Promise<TrainerClient> {
    const { data } = await api.post('/trainer/clients', params);
    return data;
  },

  async updateClient(id: string, params: Partial<TrainerClient>): Promise<TrainerClient> {
    const { data } = await api.patch(`/trainer/clients/${id}`, params);
    return data;
  },

  async deleteClient(id: string): Promise<void> {
    await api.delete(`/trainer/clients/${id}`);
  },

  // ── Sessions ──────────────────────────────────────────────────────────────
  async getSessions(clientId: string): Promise<TrainerWorkoutSession[]> {
    const { data } = await api.get(`/trainer/sessions/${clientId}`);
    return data.map((s: any) => ({
      id: s.id,
      clientId: s.clientId,
      date: s.date,
      name: s.name,
      durationMinutes: s.durationMinutes,
      volumeKg: s.volumeKg ?? undefined,
      notes: s.notes ?? undefined,
    }));
  },

  async logSession(clientId: string, params: Omit<TrainerWorkoutSession, 'id' | 'clientId'>): Promise<TrainerWorkoutSession> {
    const { data } = await api.post(`/trainer/sessions/${clientId}`, params);
    return {
      id: data.id,
      clientId: data.clientId,
      date: data.date,
      name: data.name,
      durationMinutes: data.durationMinutes,
      volumeKg: data.volumeKg ?? undefined,
      notes: data.notes ?? undefined,
    };
  },

  async deleteSession(id: string): Promise<void> {
    await api.delete(`/trainer/sessions/${id}`);
  },
};
