import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { authService, userService, getApiError } from '../services';
import { tokenStorage } from '../utils/secureStorage';

// Backend returns Prisma enum values (MALE/FEMALE, MUSCLE_GAIN, BEGINNER, ADMIN); normalize to frontend types
const normalizeUser = (user: User): User => ({
  ...user,
  gender: user.gender ? (user.gender.toLowerCase() as User['gender']) : user.gender,
  goal: user.goal ? (user.goal.toLowerCase() as User['goal']) : user.goal,
  fitnessLevel: user.fitnessLevel ? (user.fitnessLevel.toLowerCase() as User['fitnessLevel']) : user.fitnessLevel,
  role: user.role ? (user.role.toLowerCase() as User['role']) : user.role,
});

interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  error: string | null;
  totpPendingToken: string | null;
  deviceToken: string | null;

  setUser: (user: User) => void;
  setToken: (token: string) => void;
  /** Called by api.ts or screens after receiving fresh tokens — persists to SecureStore and syncs in-memory state. */
  updateTokens: (token: string, refreshToken: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithTotp: (code: string, rememberDevice?: boolean) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithVk: (params: { accessToken: string; userId: number; email?: string }) => Promise<void>;
  loginWithYandex: (accessToken: string) => Promise<void>;
  loginByPhone: (phone: string, code: string) => Promise<void>;
  register: (params: { email: string; password: string; firstName: string; lastName?: string; phone?: string; otpToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  fetchProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isOnboarded: false,
      isLoading: false,
      error: null,
      totpPendingToken: null,
      deviceToken: null,

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      clearError: () => set({ error: null }),

      /** Persist fresh tokens to SecureStore and sync in-memory Zustand state. */
      updateTokens: async (token, refreshToken) => {
        await tokenStorage.setTokens(token, refreshToken);
        set({ token, refreshToken });
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null, totpPendingToken: null });
        try {
          const { deviceToken } = get();
          const response = await authService.login(email, password, deviceToken ?? undefined);
          if ('requiresTOTP' in response && response.requiresTOTP) {
            set({ isLoading: false, totpPendingToken: response.pendingToken });
            const err: any = new Error('TOTP_REQUIRED');
            err.code = 'TOTP_REQUIRED';
            throw err;
          }
          const authResponse = response as import('../services/authService').AuthResponse;
          await tokenStorage.setTokens(authResponse.token, authResponse.refreshToken);
          set({
            user: normalizeUser(authResponse.user),
            token: authResponse.token,
            refreshToken: authResponse.refreshToken,
            isAuthenticated: true,
            isLoading: false,
            totpPendingToken: null,
          });
        } catch (e: any) {
          if (e.code !== 'TOTP_REQUIRED') {
            const apiError = getApiError(e);
            set({ isLoading: false, error: apiError.message });
          }
          throw e;
        }
      },

      loginWithTotp: async (code, rememberDevice?: boolean) => {
        const { totpPendingToken } = get();
        if (!totpPendingToken) throw new Error('No pending TOTP token');
        set({ isLoading: true, error: null });
        try {
          const response = await authService.verifyTotp(totpPendingToken, code, undefined, rememberDevice);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          set({
            user: normalizeUser(response.user),
            token: response.token,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
            totpPendingToken: null,
            ...(response.deviceToken ? { deviceToken: response.deviceToken } : {}),
          });
        } catch (e) {
          const apiError = getApiError(e);
          set({ isLoading: false, error: apiError.message });
          throw e;
        }
      },

      loginWithGoogle: async (idToken) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginWithGoogle(idToken);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          set({ user: normalizeUser(response.user), token: response.token, refreshToken: response.refreshToken, isAuthenticated: true, isLoading: false });
        } catch (e) {
          const apiError = getApiError(e);
          set({ isLoading: false, error: apiError.message });
          throw e;
        }
      },

      loginWithVk: async (params) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginWithVk(params);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          set({ user: normalizeUser(response.user), token: response.token, refreshToken: response.refreshToken, isAuthenticated: true, isLoading: false });
        } catch (e) {
          const apiError = getApiError(e);
          set({ isLoading: false, error: apiError.message });
          throw e;
        }
      },

      loginWithYandex: async (accessToken) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginWithYandex(accessToken);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          set({ user: normalizeUser(response.user), token: response.token, refreshToken: response.refreshToken, isAuthenticated: true, isLoading: false });
        } catch (e) {
          const apiError = getApiError(e);
          set({ isLoading: false, error: apiError.message });
          throw e;
        }
      },

      loginByPhone: async (phone, code) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginByPhone(phone, code);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          set({ user: normalizeUser(response.user), token: response.token, refreshToken: response.refreshToken, isAuthenticated: true, isLoading: false });
        } catch (e) {
          const apiError = getApiError(e);
          set({ isLoading: false, error: apiError.message });
          throw e;
        }
      },

      register: async (params) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.register(params);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          set({
            user: normalizeUser(response.user),
            token: response.token,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (e) {
          const apiError = getApiError(e);
          set({ isLoading: false, error: apiError.message });
          throw e;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        // Revoke refresh token on server (non-blocking)
        if (refreshToken) authService.logout(refreshToken).catch(() => {});
        // Clear tokens from SecureStore (hardware-backed Keychain/Keystore)
        await tokenStorage.clearTokens();
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, error: null });
        // Clear all per-user data from other persisted stores to prevent data leak to next user
        try {
          const { useWorkoutStore, useNutritionStore } = require('./index');
          useWorkoutStore.getState().clearUserData();
          useNutritionStore.getState().clearUserData();
        } catch { /* best effort */ }
      },

      completeOnboarding: () => set({ isOnboarded: true }),

      updateProfile: async (data) => {
        const user = get().user;
        if (!user) return;
        try {
          const updated = await userService.updateProfile(data);
          set({ user: normalizeUser({ ...user, ...updated }) });
        } catch (e: any) {
          // Only fallback to local update on network errors, not validation errors
          const isNetworkError = !e?.response || e?.code === 'ECONNABORTED' || e?.code === 'ERR_NETWORK';
          if (isNetworkError) {
            set({ user: { ...user, ...data } });
          }
          // Server validation errors (4xx) are silently ignored — data stays unchanged
        }
      },

      fetchProfile: async () => {
        try {
          const user = await userService.getProfile();
          set({ user: normalizeUser(user) });
        } catch {}
      },
    }),
    {
      name: 'iron-gym-auth',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: async (persistedState: any, version: number) => {
        const s = persistedState as any;
        if (version === 0 || version === 1) {
          // v0/v1 → normalize gender/goal/fitnessLevel/role casing
          if (s.user) {
            if (s.user.gender) s.user.gender = s.user.gender.toLowerCase();
            if (s.user.goal) s.user.goal = s.user.goal.toLowerCase();
            if (s.user.fitnessLevel) s.user.fitnessLevel = s.user.fitnessLevel.toLowerCase();
            if (s.user.role) s.user.role = s.user.role.toLowerCase();
          }
        }
        if (version < 3) {
          // v2 → v3: migrate tokens from unencrypted AsyncStorage into SecureStore (Keychain/Keystore).
          // Tokens are removed from persisted state; SecureStore becomes the single source of truth.
          if (s.token && s.refreshToken) {
            try {
              await tokenStorage.setTokens(s.token, s.refreshToken);
            } catch { /* best effort — if SecureStore unavailable (e.g. emulator), tokens stay in memory */ }
          }
          delete s.token;
          delete s.refreshToken;
        }
        return s;
      },
      // Tokens are NOT persisted to AsyncStorage (unencrypted) — they live in SecureStore only.
      // On startup they are loaded back into in-memory state via onRehydrateStorage.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isOnboarded: state.isOnboarded,
      }),
      onRehydrateStorage: () => async (state) => {
        if (!state) return;
        if (state.isAuthenticated) {
          // Restore tokens from SecureStore (Keychain/Keystore) back into in-memory Zustand state
          try {
            const [token, refreshToken] = await Promise.all([
              tokenStorage.getAccessToken(),
              tokenStorage.getRefreshToken(),
            ]);
            if (token && refreshToken) {
              useAuthStore.setState({ token, refreshToken });
            } else {
              // SecureStore empty but store says authenticated — tokens were wiped (device restore,
              // app reinstall, or OS security event). Force a clean logout so the user re-authenticates.
              useAuthStore.setState({ isAuthenticated: false, user: null, token: null, refreshToken: null });
            }
          } catch {
            // SecureStore unavailable — leave token null; API will get 401 and handle gracefully
          }
        }
      },
    }
  )
);
