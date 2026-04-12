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
};
