import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { setOnlineStatus } from '../store/useConnectionStore';
import { tokenStorage } from '../utils/secureStorage';

// Production server on Render (works from any device/network)
const BASE_URL = 'https://iron-gym-swoe.onrender.com/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT from SecureStore
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 + token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => { setOnlineStatus(true); return response; },
  async (error: AxiosError) => {
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !error.response) {
      setOnlineStatus(false);
    } else {
      setOnlineStatus(true);
    }
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle banned account — force logout immediately
    if (error.response?.status === 403 && (error.response?.data as any)?.code === 'BANNED') {
      try {
        const { useAuthStore } = require('../store');
        useAuthStore.getState().logout();
      } catch { /* best effort */ }
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await tokenStorage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });

        // Persist new tokens in SecureStore
        await tokenStorage.setTokens(data.token, data.refreshToken);

        // Keep Zustand in-memory store in sync and persist to SecureStore
        try {
          const { useAuthStore } = require('../store');
          await useAuthStore.getState().updateTokens(data.token, data.refreshToken);
        } catch { /* best effort */ }

        processQueue(null, data.token);
        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Clear tokens on failed refresh
        await tokenStorage.clearTokens();
        try {
          const { useAuthStore } = require('../store');
          useAuthStore.getState().logout();
        } catch { /* best effort */ }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export type ApiError = {
  message: string;
  status: number;
};

export const getApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    return {
      message: error.response?.data?.error || error.message || 'Ошибка сети',
      status: error.response?.status || 0,
    };
  }
  return { message: 'Неизвестная ошибка', status: 0 };
};
