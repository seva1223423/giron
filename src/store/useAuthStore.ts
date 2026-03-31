import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { authService, userService, getApiError } from '../services';

interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User) => void;
  setToken: (token: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (params: { email: string; password: string; firstName: string; lastName?: string }) => Promise<void>;
  logout: () => void;
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

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      clearError: () => set({ error: null }),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login(email, password);
          set({
            user: response.user,
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

      register: async (params) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.register(params);
          set({
            user: response.user,
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

      logout: () => set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        error: null,
      }),

      completeOnboarding: () => set({ isOnboarded: true }),

      updateProfile: async (data) => {
        const user = get().user;
        if (!user) return;
        try {
          const updated = await userService.updateProfile(data);
          set({ user: { ...user, ...updated } });
        } catch {
          // Fallback to local update if server is unavailable
          set({ user: { ...user, ...data } });
        }
      },

      fetchProfile: async () => {
        try {
          const user = await userService.getProfile();
          set({ user });
        } catch {}
      },
    }),
    {
      name: 'iron-gym-auth',
      storage: createJSONStorage(() => AsyncStorage),
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
