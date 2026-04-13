import { api } from './api';
import { User } from '../types';

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface CheckEmailResponse {
  exists: boolean;
  hasPassword?: boolean;
  hasGoogle?: boolean;
  hasVk?: boolean;
}

export interface CheckPhoneResponse {
  exists: boolean;
  phone?: string;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    return data;
  },

  async register(params: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    phone?: string;
    otpToken?: string;
  }): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', params);
    return data;
  },

  async checkEmail(email: string): Promise<CheckEmailResponse> {
    try {
      const { data } = await api.post<CheckEmailResponse>('/auth/check-email', { email });
      return data;
    } catch {
      return { exists: false };
    }
  },

  async checkPhone(phone: string): Promise<CheckPhoneResponse> {
    try {
      const { data } = await api.post<CheckPhoneResponse>('/auth/check-phone', { phone });
      return data;
    } catch {
      return { exists: false };
    }
  },

  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/google', { idToken });
    return data;
  },

  async loginWithVk(params: { accessToken: string; userId: number; email?: string }): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/vk', params);
    return data;
  },

  async loginByPhone(phone: string, code: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login-by-phone', { phone, code });
    return data;
  },

  async sendOtp(params: { phone?: string; email?: string; purpose?: 'register' | 'login' | 'phone-login' }): Promise<void> {
    await api.post('/auth/send-otp', params);
  },

  async verifyOtp(params: { phone?: string; email?: string; code: string; purpose?: 'register' | 'login' | 'phone-login' }): Promise<boolean> {
    const { data } = await api.post<{ valid: boolean }>('/auth/verify-otp', params);
    return data.valid;
  },

  async logout(refreshToken?: string): Promise<void> {
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {}
  },

  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    const { data } = await api.post('/auth/refresh', { refreshToken });
    return data;
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await api.post('/auth/reset-password', { token, password });
  },
};
