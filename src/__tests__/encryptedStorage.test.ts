/**
 * encryptedStorage — AES-GCM round-trip + plaintext migration contract.
 *
 * Pins the envelope format and migration semantics so the next person
 * touching this code can't silently drop legacy compatibility (would
 * appear as "everyone's measurements vanished after the update"). Also
 * pins the tamper-detection path: corrupt ciphertext must read as null,
 * not crash the app.
 */

let mockAsyncMem: Record<string, string> = {};
let mockSecureMem: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(mockAsyncMem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      mockAsyncMem[k] = v;
      return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
      delete mockAsyncMem[k];
      return Promise.resolve();
    }),
  },
}));

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
  getItemAsync: jest.fn((k: string) => Promise.resolve(mockSecureMem[k] ?? null)),
  setItemAsync: jest.fn((k: string, v: string) => {
    mockSecureMem[k] = v;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((k: string) => {
    delete mockSecureMem[k];
    return Promise.resolve();
  }),
}));

jest.mock('expo-crypto', () => {
  // Deterministic-ish bytes for tests — derive from a counter so each
  // call returns a distinct sequence (still a real Uint8Array, satisfies
  // the typed-array contract used by the impl).
  let counter = 0;
  return {
    getRandomBytesAsync: jest.fn((n: number) => {
      counter += 1;
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = (counter * 31 + i) & 0xff;
      return Promise.resolve(out);
    }),
  };
});

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  createEncryptedAsyncStorage,
  _internal,
} from '../utils/encryptedStorage';

beforeEach(() => {
  mockAsyncMem = {};
  mockSecureMem = {};
  _internal.resetMasterKeyCache();
});

describe('encryptedStorage — roundtrip', () => {
  it('setItem then getItem returns the original value', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('measurements', JSON.stringify({ chest: 102 }));
    const out = await s.getItem('measurements');
    expect(out).toBe(JSON.stringify({ chest: 102 }));
  });

  it('stored value is NOT plaintext (encryption actually happens)', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('measurements', '{"secret":"hidden_value"}');
    const raw = mockAsyncMem['measurements'];
    expect(raw).toBeDefined();
    expect(raw).not.toContain('hidden_value');
    expect(raw).not.toContain('secret');
  });

  it('removeItem clears the stored value', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('k', 'v');
    await s.removeItem('k');
    expect(mockAsyncMem['k']).toBeUndefined();
    expect(await s.getItem('k')).toBeNull();
  });

  it('reuses the same master key across writes', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('a', 'one');
    const keyAfterFirst = mockSecureMem[_internal.MASTER_KEY_KEYCHAIN];
    await s.setItem('b', 'two');
    expect(mockSecureMem[_internal.MASTER_KEY_KEYCHAIN]).toBe(keyAfterFirst);
  });

  it('two different stored values yield different ciphertexts (random IV)', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('k1', 'same');
    const a = mockAsyncMem['k1'];
    await s.setItem('k2', 'same');
    const b = mockAsyncMem['k2'];
    expect(a).not.toBe(b);
  });
});

describe('encryptedStorage — migration from plaintext', () => {
  it('reads a pre-round-233 plaintext JSON value as-is', async () => {
    mockAsyncMem['measurements'] = JSON.stringify({ legacy: true });
    const s = createEncryptedAsyncStorage();
    const out = await s.getItem('measurements');
    expect(out).toBe(JSON.stringify({ legacy: true }));
  });

  it('next setItem rewrites a migrated value as encrypted (no second-read fallback)', async () => {
    mockAsyncMem['measurements'] = JSON.stringify({ legacy: true });
    const s = createEncryptedAsyncStorage();
    // First read — accepted as legacy.
    await s.getItem('measurements');
    // Zustand's persist would call setItem after rehydrate / state change.
    await s.setItem('measurements', JSON.stringify({ migrated: true }));
    const raw = mockAsyncMem['measurements'];
    expect(raw).not.toContain('migrated');
    expect(raw).not.toContain('legacy');
    // Subsequent read still works through the cipher.
    expect(await s.getItem('measurements')).toBe(JSON.stringify({ migrated: true }));
  });
});

describe('encryptedStorage — tamper resistance', () => {
  it('returns null when stored ciphertext is corrupted', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('k', 'value');
    // Flip a byte deep enough into the envelope to land in the ciphertext
    // (past version[0], iv[1..12], tag[13..28]).
    const orig = mockAsyncMem['k'];
    const decoded = Buffer.from(orig, 'base64');
    decoded[decoded.length - 1] ^= 0xff;
    mockAsyncMem['k'] = decoded.toString('base64');
    expect(await s.getItem('k')).toBeNull();
  });

  it('returns null when SecureStore key disappeared (factory reset / restore-from-backup)', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('k', 'value');
    // Wipe the master key; cached promise too.
    delete mockSecureMem[_internal.MASTER_KEY_KEYCHAIN];
    _internal.resetMasterKeyCache();
    // A fresh master key gets generated; old ciphertext is unreadable.
    const out = await s.getItem('k');
    expect(out).toBeNull();
  });

  it('returns null on completely garbage stored values (not JSON, not envelope)', async () => {
    mockAsyncMem['k'] = '!!! totally not encrypted or json !!!';
    const s = createEncryptedAsyncStorage();
    expect(await s.getItem('k')).toBeNull();
  });

  it('rejects an envelope with the wrong version byte', async () => {
    const s = createEncryptedAsyncStorage();
    await s.setItem('k', 'value');
    const decoded = Buffer.from(mockAsyncMem['k'], 'base64');
    decoded[0] = 0x99; // not ENVELOPE_VERSION
    mockAsyncMem['k'] = decoded.toString('base64');
    expect(await s.getItem('k')).toBeNull();
  });
});

describe('encryptedStorage — key prefix', () => {
  it('namespaces AsyncStorage keys when a prefix is provided', async () => {
    const s = createEncryptedAsyncStorage({ keyPrefix: 'health_' });
    await s.setItem('measurements', 'v');
    expect(mockAsyncMem['health_measurements']).toBeDefined();
    expect(mockAsyncMem['measurements']).toBeUndefined();
  });
});
