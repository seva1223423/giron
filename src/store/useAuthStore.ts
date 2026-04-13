import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { authService, userService, getApiError } from '../services';

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
          set({
            user: normalizeUser(response.user),
            token: response.token,
            refreshToken: response.refreshToken,
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
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, error: null });
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
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version === 0 || version === 1) {
          // v0/v1 → v2: normalize gender/goal/fitnessLevel/role casing (backend returned UPPER_CASE)
          const s = persistedState as any;
          if (s.user) {
            if (s.user.gender) s.user.gender = s.user.gender.toLowerCase();
            if (s.user.goal) s.user.goal = s.user.goal.toLowerCase();
            if (s.user.fitnessLevel) s.user.fitnessLevel = s.user.fitnessLevel.toLowerCase();
            if (s.user.role) s.user.role = s.user.role.toLowerCase();
          }
        }
        return persistedState as any;
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        isOnboarded: state.isOnboarded,
      }),
    }
  )
);
