import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { setOnlineStatus } from '../store/useConnectionStore';
import { tokenStorage } from '../utils/secureStorage';

// Production server on Render (works from any device/network).
// Override via EXPO_PUBLIC_API_URL for staging/local dev.
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://iron-gym-swoe.onrender.com/api';

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
// Module-level flag to prevent stacked "session expired" alerts when a burst of
// parallel requests all 401 at once. Reset when the alert is dismissed.
let sessionExpiredAlertShown = false;
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

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 15000 });

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
        // Surface the logout — otherwise the user suddenly finds themselves
        // back on the login screen with no explanation. Debounced via a module
        // flag so rapid-fire 401s from batched requests don't stack alerts.
        try {
          if (!sessionExpiredAlertShown) {
            sessionExpiredAlertShown = true;
            const { Alert } = require('react-native');
            Alert.alert(
              'Сессия истекла',
              'Войди в приложение заново.',
              [{ text: 'OK', onPress: () => { sessionExpiredAlertShown = false; } }],
              { onDismiss: () => { sessionExpiredAlertShown = false; } },
            );
          }
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
  code?: string; // server-side error code (e.g. SUBSCRIPTION_REQUIRED)
};

/** Friendly fallback messages for HTTP status codes without a server-side message. */
const STATUS_MESSAGES: Record<number, string> = {
  0:   'Нет подключения к интернету. Проверь соединение и попробуй снова.',
  401: 'Сессия истекла. Войди в приложение заново.',
  402: 'Эта функция доступна только для платных подписчиков.',
  403: 'Нет доступа к этому разделу.',
  404: 'Данные не найдены.',
  409: 'Конфликт: такая запись уже существует.',
  422: 'Некорректные данные. Проверь введённые значения.',
  429: 'Слишком много запросов. Подожди немного и попробуй снова.',
  500: 'Ошибка сервера. Попробуй через несколько секунд.',
  503: 'Сервис временно недоступен. Попробуй позже.',
};

export const getApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const serverMessage = error.response?.data?.error as string | undefined;
    const serverCode = error.response?.data?.code as string | undefined;
    return {
      message: serverMessage || STATUS_MESSAGES[status] || `Ошибка ${status || 'сети'}`,
      status,
      code: serverCode,
    };
  }
  return { message: 'Неизвестная ошибка', status: 0 };
};
