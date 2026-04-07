import { api } from './api';
import { CardioSession } from '../types';

export const cardioService = {
  async getSessions(): Promise<CardioSession[]> {
    const { data } = await api.get('/cardio');
    return data;
  },

  async createSession(session: Omit<CardioSession, 'id' | 'createdAt'>): Promise<CardioSession> {
    const { data } = await api.post('/cardio', session);
    return data;
  },

  async deleteSession(id: string): Promise<void> {
    await api.delete(`/cardio/${id}`);
  },
};
