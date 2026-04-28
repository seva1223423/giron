/**
 * Unit tests for social login actions in useAuthStore:
 * loginWithVk, loginWithYandex, loginWithOk, loginWithMailru
 *
 * Covers: success path, TOTP gate (requiresTOTP response), and error path.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    defaults: { headers: { common: {} } },
  },
  getApiError: jest.fn((e: any) => ({
    message: e?.response?.data?.error || e?.message || 'Unknown error',
    status: e?.response?.status ?? 0,
    code: e?.response?.data?.code,
  })),
}));

jest.mock('../utils/secureStorage', () => ({
  tokenStorage: {
    setTokens: jest.fn(() => Promise.resolve()),
    clearTokens: jest.fn(() => Promise.resolve()),
    getAccessToken: jest.fn(() => Promise.resolve(null)),
    getRefreshToken: jest.fn(() => Promise.resolve(null)),
    setDeviceToken: jest.fn(() => Promise.resolve()),
    getDeviceToken: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('../services', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(() => Promise.resolve()),
    verifyTotp: jest.fn(),
    loginWithGoogle: jest.fn(),
    loginWithVk: jest.fn(),
    loginWithYandex: jest.fn(),
    loginWithOk: jest.fn(),
    loginWithMailru: jest.fn(),
    loginByPhone: jest.fn(),
  },
  userService: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    saveWeekPlan: jest.fn(() => Promise.resolve()),
    getWeekPlan: jest.fn(() => Promise.resolve({})),
  },
  getApiError: jest.fn((e: any) => ({
    message: e?.response?.data?.error || e?.message || 'Unknown error',
    status: e?.response?.status ?? 0,
    code: e?.response?.data?.code,
  })),
}));

import { useAuthStore } from '../store/useAuthStore';
import { tokenStorage } from '../utils/secureStorage';

const mockTokenStorage = tokenStorage as jest.Mocked<typeof tokenStorage>;

const resetState = () => {
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    isOnboarded: false,
    isLoading: false,
    error: null,
    totpPendingToken: null,
  });
};

const mockUser = {
  id: '1',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@mail.ru',
  gender: 'MALE' as any,
  goal: 'MUSCLE_GAIN' as any,
  fitnessLevel: 'BEGINNER' as any,
  role: 'USER' as any,
  healthRestrictions: [],
  createdAt: new Date().toISOString(),
};

const mockAuthResponse = {
  user: mockUser,
  token: 'access-token-123',
  refreshToken: 'refresh-token-456',
};

// ── loginWithVk ───────────────────────────────────────────────────────────────

describe('loginWithVk', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test('success: sets isAuthenticated, user, and tokens', async () => {
    const { authService } = require('../services');
    authService.loginWithVk.mockResolvedValueOnce(mockAuthResponse);

    await useAuthStore.getState().loginWithVk({ accessToken: 'vk-token', userId: 123, email: 'test@vk.com' });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('access-token-123');
    expect(state.refreshToken).toBe('refresh-token-456');
    expect(state.user?.firstName).toBe('Test');
    expect(state.user?.gender).toBe('male');
    expect(state.user?.goal).toBe('muscle_gain');
    expect(state.user?.fitnessLevel).toBe('beginner');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(mockTokenStorage.setTokens).toHaveBeenCalledWith('access-token-123', 'refresh-token-456');
  });

  test('error: sets error message, clears isLoading, rethrows', async () => {
    const { authService } = require('../services');
    const err: any = new Error('VK auth failed');
    err.response = { status: 401, data: { error: 'Недействительный токен VK', code: 'INVALID_TOKEN' } };
    authService.loginWithVk.mockRejectedValueOnce(err);

    await expect(
      useAuthStore.getState().loginWithVk({ accessToken: 'bad-token', userId: 0 }),
    ).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Недействительный токен VK');
  });

  test('TOTP gate response: store throws because requiresTOTP response has no .token', async () => {
    const { authService } = require('../services');
    // Server responds with requiresTOTP — but the VK action does not handle it,
    // so accessing .token on the response will throw.
    authService.loginWithVk.mockResolvedValueOnce({ requiresTOTP: true, pendingToken: 'pending-123' });

    await expect(
      useAuthStore.getState().loginWithVk({ accessToken: 'vk-token', userId: 123 }),
    ).rejects.toThrow();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

// ── loginWithYandex ───────────────────────────────────────────────────────────

describe('loginWithYandex', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test('success: sets isAuthenticated, user, and tokens', async () => {
    const { authService } = require('../services');
    authService.loginWithYandex.mockResolvedValueOnce(mockAuthResponse);

    await useAuthStore.getState().loginWithYandex('ya-access-token');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('access-token-123');
    expect(state.refreshToken).toBe('refresh-token-456');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(mockTokenStorage.setTokens).toHaveBeenCalledWith('access-token-123', 'refresh-token-456');
  });

  test('error: sets error message and rethrows', async () => {
    const { authService } = require('../services');
    const err: any = new Error('Yandex error');
    err.response = { status: 401, data: { error: 'Не удалось проверить токен Яндекса', code: 'INVALID_TOKEN' } };
    authService.loginWithYandex.mockRejectedValueOnce(err);

    await expect(useAuthStore.getState().loginWithYandex('bad-token')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Не удалось проверить токен Яндекса');
  });

  test('TOTP gate response: throws because response has no .token', async () => {
    const { authService } = require('../services');
    authService.loginWithYandex.mockResolvedValueOnce({ requiresTOTP: true, pendingToken: 'pending-456' });

    await expect(useAuthStore.getState().loginWithYandex('ya-token')).rejects.toThrow();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

// ── loginWithOk ───────────────────────────────────────────────────────────────

describe('loginWithOk', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test('success: sets isAuthenticated, user, and tokens', async () => {
    const { authService } = require('../services');
    authService.loginWithOk.mockResolvedValueOnce(mockAuthResponse);

    await useAuthStore.getState().loginWithOk({ accessToken: 'ok-token', userId: 'ok-user-id' });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('access-token-123');
    expect(state.refreshToken).toBe('refresh-token-456');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(mockTokenStorage.setTokens).toHaveBeenCalledWith('access-token-123', 'refresh-token-456');
  });

  test('error: sets error message and rethrows', async () => {
    const { authService } = require('../services');
    const err: any = new Error('OK.ru error');
    err.response = { status: 401, data: { error: 'Недействительный токен OK.ru', code: 'INVALID_TOKEN' } };
    authService.loginWithOk.mockRejectedValueOnce(err);

    await expect(useAuthStore.getState().loginWithOk({ accessToken: 'bad', userId: 'id' })).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Недействительный токен OK.ru');
  });

  test('TOTP gate response: throws because response has no .token', async () => {
    const { authService } = require('../services');
    authService.loginWithOk.mockResolvedValueOnce({ requiresTOTP: true, pendingToken: 'pending-789' });

    await expect(
      useAuthStore.getState().loginWithOk({ accessToken: 'ok-token', userId: 'ok-id' }),
    ).rejects.toThrow();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

// ── loginWithMailru ───────────────────────────────────────────────────────────

describe('loginWithMailru', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test('success: sets isAuthenticated, user, and tokens', async () => {
    const { authService } = require('../services');
    authService.loginWithMailru.mockResolvedValueOnce(mockAuthResponse);

    await useAuthStore.getState().loginWithMailru('mr-access-token');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('access-token-123');
    expect(state.refreshToken).toBe('refresh-token-456');
    expect(state.user?.firstName).toBe('Test');
    expect(state.user?.gender).toBe('male');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(mockTokenStorage.setTokens).toHaveBeenCalledWith('access-token-123', 'refresh-token-456');
  });

  test('error: sets error message, clears isLoading, rethrows', async () => {
    const { authService } = require('../services');
    const err: any = new Error('Mail.ru error');
    err.response = { status: 401, data: { error: 'Не удалось проверить токен Mail.ru', code: 'INVALID_TOKEN' } };
    authService.loginWithMailru.mockRejectedValueOnce(err);

    await expect(useAuthStore.getState().loginWithMailru('bad-token')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Не удалось проверить токен Mail.ru');
  });

  test('TOTP gate response: throws because response has no .token', async () => {
    const { authService } = require('../services');
    authService.loginWithMailru.mockResolvedValueOnce({ requiresTOTP: true, pendingToken: 'pending-mr' });

    await expect(useAuthStore.getState().loginWithMailru('mr-token')).rejects.toThrow();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  test('network error: sets generic error message and rethrows', async () => {
    const { authService } = require('../services');
    const networkErr: any = new Error('Network Error');
    networkErr.code = 'ERR_NETWORK';
    authService.loginWithMailru.mockRejectedValueOnce(networkErr);

    await expect(useAuthStore.getState().loginWithMailru('mr-token')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Network Error');
  });

  test('server ban: error propagates from service', async () => {
    const { authService } = require('../services');
    const bannedErr: any = new Error('Banned');
    bannedErr.response = { status: 403, data: { error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' } };
    authService.loginWithMailru.mockRejectedValueOnce(bannedErr);

    await expect(useAuthStore.getState().loginWithMailru('mr-token')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Аккаунт заблокирован. Обратитесь в поддержку.');
  });

  test('isLoading is true during async call, false after', async () => {
    const { authService } = require('../services');
    let resolveAuth!: (val: any) => void;
    authService.loginWithMailru.mockImplementationOnce(
      () => new Promise((res) => { resolveAuth = res; }),
    );

    const promise = useAuthStore.getState().loginWithMailru('mr-token');
    expect(useAuthStore.getState().isLoading).toBe(true);

    resolveAuth(mockAuthResponse);
    await promise;
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
