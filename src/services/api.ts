import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { setOnlineStatus } from '../store/useConnectionStore';
import { tokenStorage } from '../utils/secureStorage';

// Production server on Render (works from any device/network).
// Override via EXPO_PUBLIC_API_URL for staging/local dev.
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://iron-gym-swoe.onrender.com/api';

// Client version from app.json#expo.version. Sent on every request so the
// server-side clientVersionGate (CLIENT-VERSION-01) can return 426 to old
// APKs before they hit a route whose contract has changed. Falls back to
// '0.0.0' if Constants is somehow unavailable — server treats that as
// "unknown" and lets it through.
const CLIENT_VERSION =
  (Constants?.expoConfig?.version as string | undefined) ??
  // @ts-expect-error legacy SDK fallback
  (Constants?.manifest?.version as string | undefined) ??
  '0.0.0';
const CLIENT_PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';

// Round 288 — VPN-friendly timeout. The previous 15s default was too
// tight for the common Russian-user scenario (Hiddify/PlanetVPN +
// Render free-tier cold start). A cold dyno wakes in 30-50s; with
// VPN-added latency on top, 15s guarantees a timeout. 45s lets the
// first-shot succeed for warm dynos and gives the auto-retry below
// (which fires on ECONNABORTED + ECONNRESET + ERR_NETWORK as well as
// 502/503/504) a real chance to land within the cold-start window.
// AI requests still override this with their own AI_REQUEST_TIMEOUT_MS
// in services/aiService.ts.
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': CLIENT_VERSION,
    'X-Client-Platform': CLIENT_PLATFORM,
  },
});

// ── 426 "client too old" subscriber pattern ─────────────────────────────────
// The response interceptor below raises this event when the server gates
// the request on MIN_CLIENT_VERSION. ForceUpdateModal subscribes via
// onClientTooOld() on mount; using a tiny event bus instead of a context
// provider keeps the modal optional — screens that don't render it just
// never see the error and the user gets the standard error path.

interface ClientTooOldPayload {
  clientVersion: string;
  minVersion: string;
  /** Store URL to send the user to. May be null on web / unknown platform. */
  updateUrl: string | null;
  /** Server-provided message, displayable as-is. */
  message: string;
}

type ClientTooOldHandler = (payload: ClientTooOldPayload) => void;
const clientTooOldSubscribers = new Set<ClientTooOldHandler>();

export function onClientTooOld(handler: ClientTooOldHandler): () => void {
  clientTooOldSubscribers.add(handler);
  return () => clientTooOldSubscribers.delete(handler);
}

function emitClientTooOld(payload: ClientTooOldPayload) {
  for (const handler of clientTooOldSubscribers) {
    try {
      handler(payload);
    } catch {
      /* one bad subscriber shouldn't break the others */
    }
  }
}

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
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _retryCount?: number };

    // Auto-retry on transient failures.
    //
    // What counts as transient:
    //   • HTTP 502/503/504 — Render restart, load-balancer reroute,
    //     deploy window. Typically clears within 5-10s.
    //   • Network errors (ECONNABORTED timeout, ECONNRESET, ERR_NETWORK,
    //     no `error.response`) — VPN flicker, DNS hiccup, WiFi-to-LTE
    //     handover. These ARE expected for Russian users on Hiddify /
    //     PlanetVPN; one transient failure should not surface as a
    //     dead-end "проверь подключение" alert when a 2-second retry
    //     would have succeeded.
    //
    // Why GET-only:
    //   POST/PATCH retries can double-write (create the same record
    //   twice, log the same set twice). If we ever want to retry
    //   specific mutations, do it via an explicit per-request opt-in
    //   on the call site, not here.
    //
    // Backoff schedule: 2s / 5s / 10s (3 attempts max).
    // Together with the 45s base timeout, this absorbs ~95% of Render
    // cold-starts (30-50s) on the second or third attempt.
    const status = error.response?.status;
    const isHttpTransient = status === 502 || status === 503 || status === 504;
    const isNetworkTransient =
      error.code === 'ECONNABORTED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENETUNREACH' ||
      error.code === 'ERR_NETWORK' ||
      (!error.response && !error.code);
    const isTransient = isHttpTransient || isNetworkTransient;
    const isIdempotent = (originalRequest.method || 'get').toLowerCase() === 'get';
    if (isTransient && isIdempotent && originalRequest) {
      const retryCount = originalRequest._retryCount ?? 0;
      if (retryCount < 3) {
        originalRequest._retryCount = retryCount + 1;
        const backoffMs = retryCount === 0 ? 2000 : retryCount === 1 ? 5000 : 10000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return api(originalRequest);
      }
    }

    // Handle banned account — force logout immediately
    if (error.response?.status === 403 && (error.response?.data as any)?.code === 'BANNED') {
      try {
        const { useAuthStore } = require('../store');
        useAuthStore.getState().logout();
      } catch { /* best effort */ }
      return Promise.reject(error);
    }

    // Handle "client too old" — server sets MIN_CLIENT_VERSION above our
    // app version, meaning future requests will keep failing until the
    // user updates. Emit on the event bus so ForceUpdateModal can show
    // a non-dismissible prompt. We still reject so any in-flight callers
    // see a real error and don't render half-loaded screens.
    if (error.response?.status === 426 && (error.response?.data as any)?.code === 'CLIENT_TOO_OLD') {
      const data = error.response.data as any;
      emitClientTooOld({
        clientVersion: data.clientVersion ?? CLIENT_VERSION,
        minVersion: data.minVersion ?? '?',
        updateUrl: data.updateUrl ?? null,
        message: data.error ?? 'Версия приложения устарела',
      });
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

        // Round 245: include client-version headers on refresh too. Without
        // them, the server's clientVersionGate (CLIENT-VERSION-01) couldn't
        // 426-reject stale clients on refresh — so a stale APK whose access
        // token expired could silently keep refreshing, bypassing the
        // force-update gate that other endpoints enforce.
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken }, {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Version': CLIENT_VERSION,
            'X-Client-Platform': CLIENT_PLATFORM,
          },
        });

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
