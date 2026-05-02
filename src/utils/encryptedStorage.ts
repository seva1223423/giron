/**
 * encryptedStorage — AES-256-GCM AsyncStorage wrapper for Zustand persist.
 *
 * Round 233 (security audit, HIGH-2): wraps AsyncStorage so the Zustand
 * stores carrying personal health data — body measurements, sleep, etc.
 * — are encrypted at rest. Plain AsyncStorage is unencrypted plaintext
 * inside the app's sandbox; on a rooted/jailbroken device or via a
 * forensic backup, the contents are trivially readable. Token storage
 * is already in `secureStorage.ts` (Keychain/Keystore) — this layer
 * extends similar protection to bulk fitness data that can't fit in
 * SecureStore (iOS limits values to ~2KB).
 *
 * Crypto:
 *   • Per-install master key, 32 bytes from `expo-crypto.getRandomBytesAsync`,
 *     stored in `expo-secure-store` (hardware-backed Keychain on iOS,
 *     Keystore on Android). Generated lazily on first write; same key for
 *     the lifetime of the install — uninstall + reinstall regenerates.
 *   • AES-256-GCM via `node-forge` (already a dep). Random 12-byte IV per
 *     value, 16-byte auth tag — tampering with ciphertext produces a
 *     decrypt failure, which we treat as "no value" (same as a fresh
 *     install) rather than crashing the app.
 *   • Envelope format: base64(version || iv || tag || ciphertext)
 *     where version=0x01 reserves room for key-rotation later.
 *
 * Migration:
 *   Existing installs have plaintext JSON in AsyncStorage. On `getItem`,
 *   if the stored blob isn't a valid encrypted envelope but parses as
 *   JSON, we accept it (returning the plain string) and the next
 *   `setItem` will write encrypted — Zustand `persist` rehydrates and
 *   re-saves on each state change.
 *
 * Web fallback:
 *   Web SecureStore is in-memory only and AsyncStorage is localStorage.
 *   Encrypting on web buys nothing (localStorage is per-origin and the
 *   key would also live in localStorage). On web we transparently fall
 *   through to plain AsyncStorage.
 *
 * Usage with Zustand:
 *
 *     import { createEncryptedAsyncStorage } from '@/utils/encryptedStorage';
 *
 *     persist(creator, {
 *       name: 'giron-measurements',
 *       storage: createJSONStorage(() => createEncryptedAsyncStorage()),
 *       version: 2,
 *     });
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
// Round 257: node-forge ships no .d.ts and @types/node-forge isn't in
// devDependencies. Use a tiny ambient declaration so TS doesn't bail
// while keeping the import path identical at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const forge: any = require('node-forge');

const MASTER_KEY_KEYCHAIN = 'giron_storage_master_key_v1';
const ENVELOPE_VERSION = 0x01;
const IV_BYTES = 12; // AES-GCM standard
const TAG_BYTES = 16;

/** Cached promise for the master key — avoid hitting SecureStore on every
 *  read/write. Reset is only useful in tests; runtime treats the install
 *  as the key's lifetime. */
let _masterKeyPromise: Promise<string> | null = null;

async function loadOrCreateMasterKey(): Promise<string> {
  if (_masterKeyPromise) return _masterKeyPromise;
  _masterKeyPromise = (async () => {
    const existing = await SecureStore.getItemAsync(MASTER_KEY_KEYCHAIN, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    if (existing) return existing;
    // Generate a fresh 32-byte (256-bit) key. expo-crypto wraps the
    // platform CSPRNG (SecRandomCopyBytes / SecureRandom).
    const bytes = await Crypto.getRandomBytesAsync(32);
    const b64 = forge.util.encode64(
      String.fromCharCode(...Array.from(bytes)),
    );
    await SecureStore.setItemAsync(MASTER_KEY_KEYCHAIN, b64, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    return b64;
  })();
  return _masterKeyPromise;
}

function keyAsBytes(b64: string): string {
  // node-forge AES wants a binary string (each char's code = one byte).
  return forge.util.decode64(b64);
}

async function encryptValue(plaintext: string): Promise<string> {
  const keyB64 = await loadOrCreateMasterKey();
  const keyBytes = keyAsBytes(keyB64);
  const ivBytes = await Crypto.getRandomBytesAsync(IV_BYTES);
  const ivBin = String.fromCharCode(...Array.from(ivBytes));
  const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
  cipher.start({ iv: ivBin, tagLength: TAG_BYTES * 8 });
  cipher.update(forge.util.createBuffer(plaintext, 'utf8'));
  cipher.finish();
  const ct = cipher.output.getBytes();
  const tag = cipher.mode.tag.getBytes();
  // Envelope: version(1) || iv(12) || tag(16) || ct(N)
  const envelope = String.fromCharCode(ENVELOPE_VERSION) + ivBin + tag + ct;
  return forge.util.encode64(envelope);
}

/** Returns null on any decrypt failure (wrong key, tampered ciphertext,
 *  malformed envelope). Caller treats null as "value not present". */
async function decryptValue(envelopeB64: string): Promise<string | null> {
  try {
    const env = forge.util.decode64(envelopeB64);
    if (env.length < 1 + IV_BYTES + TAG_BYTES) return null;
    const version = env.charCodeAt(0);
    if (version !== ENVELOPE_VERSION) return null;
    const ivBin = env.slice(1, 1 + IV_BYTES);
    const tagBin = env.slice(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ctBin = env.slice(1 + IV_BYTES + TAG_BYTES);
    const keyB64 = await loadOrCreateMasterKey();
    const keyBytes = keyAsBytes(keyB64);
    const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);
    decipher.start({
      iv: ivBin,
      tagLength: TAG_BYTES * 8,
      tag: forge.util.createBuffer(tagBin),
    });
    decipher.update(forge.util.createBuffer(ctBin));
    const ok = decipher.finish();
    if (!ok) return null;
    return decipher.output.toString();
  } catch {
    return null;
  }
}

/** Heuristic: a stored value is "legacy plaintext" if it parses as JSON.
 *  Encrypted envelopes are base64 — they may technically also parse as
 *  JSON if they happen to start with a digit/quote/etc., but the leading
 *  byte after base64-decode wouldn't be `ENVELOPE_VERSION`, so the
 *  decrypt path returns null first and we only land here as a fallback. */
function looksLikeLegacyPlaintext(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a Zustand `StateStorage`-shaped object backed by AsyncStorage,
 * with values transparently AES-GCM-encrypted at rest. Decryption errors
 * surface as `null` from getItem so the store falls back to its initial
 * state — same UX as a fresh install for this slice.
 *
 * Pass an explicit `keyPrefix` only when you want to namespace storage
 * keys further (rare — Zustand `persist` already namespaces by `name`).
 */
export function createEncryptedAsyncStorage(opts: { keyPrefix?: string } = {}) {
  const prefix = opts.keyPrefix ?? '';

  // Web: encryption buys nothing (localStorage + JS-only key). Pass through
  // to AsyncStorage so the dev shell and Expo Web preview keep working.
  if (Platform.OS === 'web') {
    return {
      getItem: (k: string) => AsyncStorage.getItem(prefix + k),
      setItem: (k: string, v: string) => AsyncStorage.setItem(prefix + k, v),
      removeItem: (k: string) => AsyncStorage.removeItem(prefix + k),
    };
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const stored = await AsyncStorage.getItem(prefix + key);
      if (stored == null) return null;
      const decrypted = await decryptValue(stored);
      if (decrypted !== null) return decrypted;
      // Migration path: pre-round-233 installs have plaintext JSON here.
      // Accept it on read; the next state-mutation write (Zustand calls
      // setItem on every store change) will rewrite as encrypted.
      if (looksLikeLegacyPlaintext(stored)) return stored;
      // Tampered or unrecognized — treat as missing.
      return null;
    },

    async setItem(key: string, value: string): Promise<void> {
      const encrypted = await encryptValue(value);
      await AsyncStorage.setItem(prefix + key, encrypted);
    },

    async removeItem(key: string): Promise<void> {
      await AsyncStorage.removeItem(prefix + key);
    },
  };
}

// Exported for tests + emergency reset (e.g. "logout, then forget all
// encrypted data" flows). Real production code should never call these.
export const _internal = {
  encryptValue,
  decryptValue,
  loadOrCreateMasterKey,
  resetMasterKeyCache: () => {
    _masterKeyPromise = null;
  },
  MASTER_KEY_KEYCHAIN,
  ENVELOPE_VERSION,
};
