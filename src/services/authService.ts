import { api } from './api';
import { User } from '../types';

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface TOTPLoginResponse {
  requiresTOTP: true;
  pendingToken: string;
}

export interface CheckEmailResponse {
  exists: boolean;
  hasPassword?: boolean;
  hasVk?: boolean;
  hasYandex?: boolean;
}

export interface TotpVerifyResponse extends AuthResponse {
  deviceToken?: string;
}

export interface CheckPhoneResponse {
  exists: boolean;
  phone?: string;
}

export const authService = {
  async login(email: string, password: string, deviceToken?: string): Promise<AuthResponse | TOTPLoginResponse> {
    const { data } = await api.post<AuthResponse | TOTPLoginResponse>('/auth/login', {
      email, password,
      ...(deviceToken ? { deviceToken } : {}),
    });
    return data;
  },

  async verifyTotp(pendingToken: string, code?: string, backupCode?: string, rememberDevice?: boolean): Promise<TotpVerifyResponse> {
    const { data } = await api.post<TotpVerifyResponse>('/auth/totp-verify', {
      pendingToken,
      ...(code ? { code } : {}),
      ...(backupCode ? { backupCode } : {}),
      ...(rememberDevice ? { rememberDevice: true } : {}),
    });
    return data;
  },

  async register(params: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    phone?: string;
    otpToken?: string;
    // Round 237: mandatory consent flag. The server's Zod schema requires
    // `acceptTerms === true` literal — without it the request is rejected
    // with 400 before any DB write.
    acceptTerms: true;
    consentVersion?: string;
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

  async loginWithVk(params: { accessToken: string; userId: number; email?: string }): Promise<AuthResponse | TOTPLoginResponse> {
    const { data } = await api.post<AuthResponse | TOTPLoginResponse>('/auth/vk', params);
    return data;
  },

  async loginWithYandex(accessToken: string): Promise<AuthResponse | TOTPLoginResponse> {
    const { data } = await api.post<AuthResponse | TOTPLoginResponse>('/auth/yandex', { accessToken });
    return data;
  },

  async loginByPhone(phone: string, code: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login-by-phone', { phone, code });
    return data;
  },

  async sendOtp(params: { phone?: string; email?: string; purpose?: 'register' | 'login' | 'phone-login' | 'phone-reset' | 'phone-change' | 'email-change' | 'email-verify' }): Promise<void> {
    await api.post('/auth/send-otp', params);
  },

  async verifyOtp(params: { phone?: string; email?: string; code: string; purpose?: 'register' | 'login' | 'phone-login' | 'phone-reset' | 'phone-change' | 'email-change' | 'email-verify' }): Promise<boolean> {
    const { data } = await api.post<{ valid: boolean }>('/auth/verify-otp', params);
    return data.valid;
  },

  async resetPasswordByPhone(phone: string, code: string, password: string): Promise<void> {
    await api.post('/auth/reset-password-by-phone', { phone, code, password });
  },

  async verifyEmail(email: string, code: string): Promise<boolean> {
    const { data } = await api.post<{ valid: boolean; emailVerified?: boolean }>('/auth/verify-email', { email, code });
    return data.valid;
  },

  async resendVerification(email: string): Promise<void> {
    await api.post('/auth/resend-verification', { email });
  },

  async logout(refreshToken?: string, all?: boolean): Promise<void> {
    try {
      await api.post('/auth/logout', { refreshToken, ...(all ? { all: true } : {}) });
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
