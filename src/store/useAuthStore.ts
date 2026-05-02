import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { authService, userService, getApiError } from '../services';
import { AuthResponse } from '../services/authService';
import { tokenStorage } from '../utils/secureStorage';
import { useNutritionStore } from './useNutritionStore';

// Backend returns Prisma enum values (MALE/FEMALE, MUSCLE_GAIN, BEGINNER, ADMIN); normalize to frontend types
const normalizeUser = (user: User): User => ({
  ...user,
  gender: user.gender ? (user.gender.toLowerCase() as User['gender']) : user.gender,
  goal: user.goal ? (user.goal.toLowerCase() as User['goal']) : user.goal,
  fitnessLevel: user.fitnessLevel ? (user.fitnessLevel.toLowerCase() as User['fitnessLevel']) : user.fitnessLevel,
  role: user.role ? (user.role.toLowerCase() as User['role']) : user.role,
});

/**
 * Decide whether a user has already completed onboarding by looking at the
 * three required profile fields the wizard collects (gender, height, weight).
 * Used in every login action so a re-login after a session-expired logout
 * doesn't bounce a fully-onboarded user back through the welcome flow —
 * which is the bug the founder hit after the first Render redeploy.
 *
 * `goal` and `fitnessLevel` are intentionally NOT checked: legacy users
 * who registered pre-onboarding flow may have nullable values there;
 * gender + heightCm + weightKg is the strict subset that the wizard
 * always sets.
 */
function deriveOnboarded(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.gender && user.heightCm && user.weightKg);
}

interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  /** Transient flag — true for the very first render of MainTabs after onboarding
   *  finishes. Drives `initialRouteName` so the user lands on the AI tab (the
   *  primary feature) instead of HomeTab. Cleared by MainTabs on mount and is
   *  intentionally NOT persisted, so app restarts always honor the default
   *  HomeTab landing. */
  justOnboarded: boolean;
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
  logoutAllDevices: () => Promise<void>;
  completeOnboarding: () => void;
  /** Called by MainTabs after the post-onboarding redirect to AI tab consumes
   *  the flag, so it doesn't fire again on the next render. */
  clearJustOnboarded: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  fetchProfile: () => Promise<void>;
  clearError: () => void;
}

/** Clear all other stores' per-user data to prevent data leaks between accounts. */
function clearStoreUserData() {
  try {
    const stores = require('./index');
    stores.useWorkoutStore?.getState().clearUserData();
    stores.useNutritionStore?.getState().clearUserData();
    stores.useCardioStore?.getState().clearUserData();
    stores.useTrainerStore?.getState().clearUserData();
    stores.useMeasurementsStore?.getState().clearUserData();
    stores.useSleepStore?.getState().clearUserData();
    stores.useSubscriptionStore?.getState().clearUserData();
    stores.useSupportStore?.getState().clearUserData();
    stores.useRecipesStore?.getState().clearUserData();
    stores.useOnboardingTipsStore?.getState().resetAll();
    stores.useThemeStore?.getState().resetToDefaults();
    stores.useSettingsStore?.getState().resetToDefaults();
  } catch { /* best effort */ }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isOnboarded: false,
      justOnboarded: false,
      isLoading: false,
      error: null,
      totpPendingToken: null,
      deviceToken: null,

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      clearError: () => set({ error: null }),

      /** Persist fresh tokens to SecureStore and sync in-memory Zustand state. */
      updateTokens: async (token, refreshToken) => {
        // Round 244: race-safety — if logout fires between awaiting
        // setTokens and the set(), we'd resurrect stale tokens. Capture
        // authenticated state before the await and bail if it changed.
        const wasAuthenticated = get().isAuthenticated;
        await tokenStorage.setTokens(token, refreshToken);
        if (!get().isAuthenticated && wasAuthenticated) {
          // Logout happened mid-await; clear the tokens we just stored
          await tokenStorage.clearTokens().catch(() => {});
          return;
        }
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
          const normalized = normalizeUser(authResponse.user);
          set({
            user: normalized,
            token: authResponse.token,
            refreshToken: authResponse.refreshToken,
            isAuthenticated: true,
            // Restore onboarding flag from server-side profile data — fixes
            // the "wizard runs again on every re-login" bug.
            isOnboarded: deriveOnboarded(normalized),
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
          if (response.deviceToken) {
            await tokenStorage.setDeviceToken(response.deviceToken);
          }
          const normalized = normalizeUser(response.user);
          set({
            user: normalized,
            token: response.token,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isOnboarded: deriveOnboarded(normalized),
            isLoading: false,
            totpPendingToken: null,
            ...(response.deviceToken ? { deviceToken: response.deviceToken } : {}),
          });
        } catch (e) {
          const apiError = getApiError(e);
          // Expired/invalid pending token — clear it so the user can restart the login flow
          const tokenExpired = apiError.code === 'PENDING_TOKEN_EXPIRED' || apiError.code === 'INVALID_TOKEN' || apiError.status === 401;
          set({ isLoading: false, error: apiError.message, ...(tokenExpired ? { totpPendingToken: null } : {}) });
          throw e;
        }
      },

      loginWithGoogle: async (idToken) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginWithGoogle(idToken);
          if ('requiresTOTP' in response && response.requiresTOTP) {
            set({ isLoading: false, totpPendingToken: response.pendingToken });
            const err: any = new Error('TOTP_REQUIRED');
            err.code = 'TOTP_REQUIRED';
            throw err;
          }
          const ar = response as AuthResponse;
          await tokenStorage.setTokens(ar.token, ar.refreshToken);
          const normalizedG = normalizeUser(ar.user);
          set({ user: normalizedG, token: ar.token, refreshToken: ar.refreshToken, isAuthenticated: true, isOnboarded: deriveOnboarded(normalizedG), isLoading: false });
        } catch (e) {
          if ((e as any).code !== 'TOTP_REQUIRED') {
            const apiError = getApiError(e);
            set({ isLoading: false, error: apiError.message });
          }
          throw e;
        }
      },

      loginWithVk: async (params) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginWithVk(params);
          if ('requiresTOTP' in response && response.requiresTOTP) {
            set({ isLoading: false, totpPendingToken: response.pendingToken });
            const err: any = new Error('TOTP_REQUIRED');
            err.code = 'TOTP_REQUIRED';
            throw err;
          }
          const ar = response as AuthResponse;
          await tokenStorage.setTokens(ar.token, ar.refreshToken);
          const normalizedV = normalizeUser(ar.user);
          set({ user: normalizedV, token: ar.token, refreshToken: ar.refreshToken, isAuthenticated: true, isOnboarded: deriveOnboarded(normalizedV), isLoading: false });
        } catch (e) {
          if ((e as any).code !== 'TOTP_REQUIRED') {
            const apiError = getApiError(e);
            set({ isLoading: false, error: apiError.message });
          }
          throw e;
        }
      },

      loginWithYandex: async (accessToken) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginWithYandex(accessToken);
          if ('requiresTOTP' in response && response.requiresTOTP) {
            set({ isLoading: false, totpPendingToken: response.pendingToken });
            const err: any = new Error('TOTP_REQUIRED');
            err.code = 'TOTP_REQUIRED';
            throw err;
          }
          const ar = response as AuthResponse;
          await tokenStorage.setTokens(ar.token, ar.refreshToken);
          const normalizedY = normalizeUser(ar.user);
          set({ user: normalizedY, token: ar.token, refreshToken: ar.refreshToken, isAuthenticated: true, isOnboarded: deriveOnboarded(normalizedY), isLoading: false });
        } catch (e) {
          if ((e as any).code !== 'TOTP_REQUIRED') {
            const apiError = getApiError(e);
            set({ isLoading: false, error: apiError.message });
          }
          throw e;
        }
      },

      loginByPhone: async (phone, code) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.loginByPhone(phone, code);
          await tokenStorage.setTokens(response.token, response.refreshToken);
          const normalizedP = normalizeUser(response.user);
          set({ user: normalizedP, token: response.token, refreshToken: response.refreshToken, isAuthenticated: true, isOnboarded: deriveOnboarded(normalizedP), isLoading: false });
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
          const normalizedR = normalizeUser(response.user);
          set({
            user: normalizedR,
            token: response.token,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            // Brand-new users always start with isOnboarded=false because
            // the registration payload doesn't carry profile data yet.
            // Edge case: if /register ever starts echoing back an existing
            // user with a filled profile, this still does the right thing.
            isOnboarded: deriveOnboarded(normalizedR),
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
        // Revoke current device's refresh token on server (non-blocking — UX stays snappy)
        if (refreshToken) authService.logout(refreshToken).catch(() => {});
        // Clear session tokens from SecureStore; device trust survives logout intentionally
        await tokenStorage.clearTokens();
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, isOnboarded: false, error: null, totpPendingToken: null });
        clearStoreUserData();
      },

      logoutAllDevices: async () => {
        const { refreshToken } = get();
        // Revoke ALL refresh tokens for this user on the server — ends every active session
        if (refreshToken) await authService.logout(refreshToken, true).catch(() => {});
        // Clear session tokens AND device trust from SecureStore
        await tokenStorage.clearAll();
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, isOnboarded: false, error: null, totpPendingToken: null, deviceToken: null });
        clearStoreUserData();
      },

      completeOnboarding: () => set({ isOnboarded: true, justOnboarded: true }),

      clearJustOnboarded: () => set({ justOnboarded: false }),

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
            set({ user: normalizeUser({ ...user, ...data }) });
          }
          // Server validation errors (4xx) are silently ignored — data stays unchanged
        }
      },

      fetchProfile: async () => {
        // Round 244: race-safety — capture user id before the await so
        // we can detect logout / user-switch mid-fetch. Without this,
        // user-A's profile data could land in user-B's store after a
        // quick logout/login swap.
        const startUserId = get().user?.id;
        try {
          const user = await userService.getProfile();
          if (!get().isAuthenticated || get().user?.id !== startUserId) {
            // logout or user-switch occurred during fetch — discard result
            return;
          }
          const normalized = normalizeUser(user);
          // Re-derive isOnboarded — covers edge cases where the local flag
          // got out of sync with server state (manual DB edit, multi-device
          // login where profile was completed elsewhere, persisted v3 state
          // from a build that didn't track it correctly).
          set({ user: normalized, isOnboarded: deriveOnboarded(normalized) });
          // Sync server-persisted nutrition targets (set by AI coach) to local store
          const u = user as any;
          if (u.targetCalories || u.targetProtein || u.targetFats || u.targetCarbs || u.targetWaterMl) {
            useNutritionStore.getState().applyServerTargets({
              calories: u.targetCalories ?? null,
              protein: u.targetProtein ?? null,
              fats: u.targetFats ?? null,
              carbs: u.targetCarbs ?? null,
              waterMl: u.targetWaterMl ?? null,
            });
          }
        } catch {}
      },
    }),
    {
      name: 'giron-auth',
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
        // Always restore deviceToken — device trust is independent of authentication state
        try {
          const deviceToken = await tokenStorage.getDeviceToken();
          if (deviceToken) useAuthStore.setState({ deviceToken });
        } catch { /* SecureStore unavailable */ }

        if (state.isAuthenticated) {
          // Restore session tokens from SecureStore (Keychain/Keystore) back into in-memory state
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
              // Also clear per-user data in the sibling stores: AsyncStorage (workouts, meals,
              // measurements, etc.) survived the device restore even though SecureStore didn't,
              // so without this the next user to log in on this device flashes the previous
              // user's data on Home/Progress until the server-side fetch overwrites it. Mirrors
              // what an explicit logout() does — no reason for the auto-clean path to be lazier.
              useAuthStore.setState({
                isAuthenticated: false,
                user: null,
                token: null,
                refreshToken: null,
                isOnboarded: false,
              });
              clearStoreUserData();
            }
          } catch {
            // SecureStore unavailable — leave token null; API will get 401 and handle gracefully
          }
        }
      },
    }
  )
);
