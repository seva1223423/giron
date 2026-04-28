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

  async deleteMeasurement(date: string): Promise<void> {
    await api.delete(`/user/measurements/${date}`);
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

  async changePassword(currentPassword: string, newPassword: string, totpCode?: string): Promise<void> {
    await api.post('/user/change-password', { currentPassword, newPassword, totpCode });
  },

  async getSecurityEvents(): Promise<Array<{ id: string; action: string; ip: string | null; userAgent?: string | null; createdAt: string; details?: string | null }>> {
    const { data } = await api.get('/user/security-events');
    return data;
  },

  async hasPassword(): Promise<boolean> {
    const { data } = await api.get<{ hasPassword: boolean }>('/user/has-password');
    return data.hasPassword;
  },

  async getSessions(): Promise<Array<{ id: string; createdAt: string; expiresAt: string; userAgent?: string | null; ip?: string | null }>> {
    const { data } = await api.get('/user/sessions');
    return data;
  },

  async revokeSession(id: string): Promise<void> {
    await api.delete(`/user/sessions/${id}`);
  },

  async revokeAllSessions(): Promise<void> {
    await api.delete('/user/sessions');
  },

  async getTrustedDevices(): Promise<Array<{ id: string; createdAt: string; expiresAt: string; userAgent?: string | null; ip?: string | null }>> {
    const { data } = await api.get('/user/trusted-devices');
    return data;
  },

  async revokeTrustedDevice(id: string): Promise<void> {
    await api.delete(`/user/trusted-devices/${id}`);
  },

  async revokeAllTrustedDevices(): Promise<void> {
    await api.delete('/user/trusted-devices');
  },

  async unlinkProvider(provider: 'yandex' | 'vk' | 'google' | 'ok' | 'mailru'): Promise<void> {
    await api.delete(`/user/linked-accounts/${provider}`);
  },

  async linkProvider(provider: 'vk' | 'yandex' | 'google' | 'ok' | 'mailru', params: { accessToken: string; userId?: string }): Promise<void> {
    await api.post(`/user/linked-accounts/${provider}`, params);
  },

  async deleteAccount(password?: string, totpCode?: string): Promise<void> {
    await api.delete('/user/account', { data: { password, totpCode } });
  },

  async changePhone(phone: string, code: string, totpCode?: string): Promise<{ ok: boolean; phone: string; phoneVerified: boolean; token?: string; refreshToken?: string }> {
    const { data } = await api.post('/user/change-phone', { phone, code, totpCode });
    return data;
  },
};
