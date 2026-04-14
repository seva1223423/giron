/**
 * secureStorage — platform-aware secure token store.
 *
 * On iOS/Android: uses Expo SecureStore (hardware-backed Keychain / Keystore).
 * On web: falls back to in-memory storage (tokens are never persisted to disk in browsers).
 *
 * NEVER store access or refresh tokens in AsyncStorage — it is unencrypted plain text
 * accessible to any app on a rooted/jailbroken device.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'iron_gym_access_token';
const REFRESH_TOKEN_KEY = 'iron_gym_refresh_token';

// Web fallback: in-memory only (no persistence — safer than localStorage)
const webMemory: Record<string, string> = {};

async function set(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemory[key] = value;
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    // requireAuthentication: false — don't require biometrics to read tokens,
    // that would break background refresh. Use keychainAccessible = after first unlock.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

async function get(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webMemory[key] ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    delete webMemory[key];
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const tokenStorage = {
  /** Persist both tokens atomically (called after login / token refresh). */
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      set(ACCESS_TOKEN_KEY, accessToken),
      set(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },

  /** Read the current access token. Returns null if not logged in. */
  getAccessToken(): Promise<string | null> {
    return get(ACCESS_TOKEN_KEY);
  },

  /** Read the current refresh token. Returns null if not logged in. */
  getRefreshToken(): Promise<string | null> {
    return get(REFRESH_TOKEN_KEY);
  },

  /** Update only the access token (after a silent refresh). */
  async setAccessToken(token: string): Promise<void> {
    await set(ACCESS_TOKEN_KEY, token);
  },

  /** Clear both tokens on logout or authentication failure. */
  async clearTokens(): Promise<void> {
    await Promise.all([
      remove(ACCESS_TOKEN_KEY),
      remove(REFRESH_TOKEN_KEY),
    ]);
  },
};
