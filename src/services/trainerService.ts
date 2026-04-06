import { api } from './api';
import type { TrainerClient } from '../store/useTrainerStore';

export const trainerService = {
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
};
