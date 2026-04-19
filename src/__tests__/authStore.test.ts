/**
 * Tests for useAuthStore — auth state, logout, profile updates
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
  getApiError: jest.fn((e: any) => ({ message: e?.message || 'Unknown error' })),
}));

jest.mock('../services/userService', () => ({
  userService: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    saveWeekPlan: jest.fn(() => Promise.resolve()),
    getWeekPlan: jest.fn(() => Promise.resolve({})),
    saveSleep: jest.fn(() => Promise.resolve()),
    deleteSleep: jest.fn(() => Promise.resolve()),
    getSleep: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('../services', () => ({
  userService: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    saveWeekPlan: jest.fn(() => Promise.resolve()),
    getWeekPlan: jest.fn(() => Promise.resolve({})),
  },
  authService: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(() => Promise.resolve()),
    verifyTotp: jest.fn(),
    loginWithGoogle: jest.fn(),
    loginWithVk: jest.fn(),
    loginWithYandex: jest.fn(),
    loginByPhone: jest.fn(),
  },
  getApiError: jest.fn((e: any) => ({ message: e?.message || 'Unknown error' })),
}));

import { useAuthStore } from '../store/useAuthStore';

const resetState = () => {
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    isOnboarded: false,
    isLoading: false,
    error: null,
  });
};

describe('useAuthStore', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  test('initial state is not authenticated', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  test('logout clears all auth state', async () => {
    useAuthStore.setState({
      token: 'abc',
      refreshToken: 'xyz',
      isAuthenticated: true,
      user: { id: '1', firstName: 'Test' } as any,
    });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBeNull();
  });

  test('completeOnboarding sets isOnboarded true', () => {
    expect(useAuthStore.getState().isOnboarded).toBe(false);
    useAuthStore.getState().completeOnboarding();
    expect(useAuthStore.getState().isOnboarded).toBe(true);
  });

  test('clearError resets error to null', () => {
    useAuthStore.setState({ error: 'some error' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  test('updateProfile with network error falls back to local update', async () => {
    useAuthStore.setState({
      user: { id: '1', firstName: 'Test', weightKg: 80 } as any,
    });
    const { userService } = require('../services');
    userService.updateProfile.mockRejectedValueOnce({ code: 'ERR_NETWORK' });

    await useAuthStore.getState().updateProfile({ weightKg: 85 });

    // Should update locally on network error
    expect(useAuthStore.getState().user?.weightKg).toBe(85);
  });

  test('updateProfile with ECONNABORTED error falls back to local update', async () => {
    useAuthStore.setState({
      user: { id: '1', firstName: 'Test', weightKg: 80 } as any,
    });
    const { userService } = require('../services');
    userService.updateProfile.mockRejectedValueOnce({ code: 'ECONNABORTED' });

    await useAuthStore.getState().updateProfile({ weightKg: 90 });

    expect(useAuthStore.getState().user?.weightKg).toBe(90);
  });

  test('updateProfile with server validation error does NOT update locally', async () => {
    useAuthStore.setState({
      user: { id: '1', firstName: 'Test', weightKg: 80 } as any,
    });
    const { userService } = require('../services');
    userService.updateProfile.mockRejectedValueOnce({ response: { status: 400 } });

    await useAuthStore.getState().updateProfile({ weightKg: -999 });

    // Should NOT update locally — server rejected it
    expect(useAuthStore.getState().user?.weightKg).toBe(80);
  });

  test('updateProfile success updates user from server response', async () => {
    useAuthStore.setState({
      user: { id: '1', firstName: 'Test', weightKg: 80 } as any,
    });
    const { userService } = require('../services');
    userService.updateProfile.mockResolvedValueOnce({ weightKg: 85 });

    await useAuthStore.getState().updateProfile({ weightKg: 85 });

    expect(useAuthStore.getState().user?.weightKg).toBe(85);
  });

  test('updateProfile does nothing when user is null', async () => {
    useAuthStore.setState({ user: null });
    const { userService } = require('../services');

    await useAuthStore.getState().updateProfile({ weightKg: 85 });

    expect(userService.updateProfile).not.toHaveBeenCalled();
  });

  test('login sets authenticated state on success', async () => {
    const { authService } = require('../services');
    authService.login.mockResolvedValueOnce({
      user: { id: '1', firstName: 'Test', gender: 'MALE', goal: 'MUSCLE_GAIN', fitnessLevel: 'BEGINNER' },
      token: 'token123',
      refreshToken: 'refresh123',
    });

    await useAuthStore.getState().login('test@test.com', 'password');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('token123');
    expect(state.refreshToken).toBe('refresh123');
    expect(state.user?.firstName).toBe('Test');
    // Verify normalization: MALE → male
    expect(state.user?.gender).toBe('male');
    expect(state.user?.goal).toBe('muscle_gain');
    expect(state.user?.fitnessLevel).toBe('beginner');
    expect(state.isLoading).toBe(false);
  });

  test('login sets error on failure', async () => {
    const { authService } = require('../services');
    const error = new Error('Invalid credentials');
    authService.login.mockRejectedValueOnce(error);

    await expect(useAuthStore.getState().login('bad@test.com', 'wrong')).rejects.toThrow();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().error).toBe('Invalid credentials');
  });
});
