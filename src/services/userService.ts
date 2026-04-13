import { api } from './api';
import { User, BodyWeight, BodyMeasurement } from '../types';

export const userService = {
  async getProfile(): Promise<User> {
    const { data } = await api.get('/user/profile');
    return data;
  },

  async updateProfile(params: Partial<User>): Promise<User> {
    const { data } = await api.patch('/user/profile', params);
    return data;
  },

  async addWeight(weightKg: number, date?: string): Promise<BodyWeight> {
    const { data } = await api.post('/user/weight', { weightKg, date });
    return data;
  },

  async getWeightHistory(): Promise<BodyWeight[]> {
    const { data } = await api.get('/user/weight');
    return data;
  },

  async saveMeasurement(measurement: BodyMeasurement): Promise<BodyMeasurement> {
    const { data } = await api.post('/user/measurements', measurement);
    return data;
  },

  async getMeasurements(): Promise<BodyMeasurement[]> {
    const { data } = await api.get('/user/measurements');
    return data;
  },

  async saveSleep(entry: { date: string; bedtime: string; wakeTime: string; durationHours: number; quality?: number | null }): Promise<void> {
    await api.post('/user/sleep', entry);
  },

  async deleteSleep(date: string): Promise<void> {
    await api.delete(`/user/sleep/${date}`);
  },

  async getSleep(): Promise<Array<{ date: string; bedtime: string; wakeTime: string; durationHours: number; quality: number | null }>> {
    const { data } = await api.get('/user/sleep');
    return data;
  },

  async getWeekPlan(): Promise<Record<number, any>> {
    const { data } = await api.get('/user/week-plan');
    return data ?? {};
  },

  async saveWeekPlan(plan: Record<number, any>): Promise<void> {
    await api.put('/user/week-plan', plan);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/user/change-password', { currentPassword, newPassword });
  },
};
