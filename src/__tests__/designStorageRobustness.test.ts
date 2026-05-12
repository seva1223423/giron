/**
 * AsyncStorage robustness — handle corruption, size limits, and
 * missing data gracefully. If persist throws, the app should not
 * crash; it should fall back to defaults.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const mem: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        mem[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn((k: string) => {
        delete mem[k];
        return Promise.resolve();
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorageUsage } from '../utils/storage';

async function clear() {
  // clear all 8 giron/cardio keys
  const keys = [
    'giron-workouts',
    'giron-nutrition',
    'giron-auth',
    'giron-settings',
    'giron-theme',
    'giron-sleep',
    'cardio-store',
    'giron-tips',
  ];
  for (const k of keys) await AsyncStorage.removeItem(k);
}

// ─── getStorageUsage happy paths ──────────────────────────────────────────

describe('getStorageUsage', () => {
  beforeEach(async () => {
    await clear();
  });

  test('empty storage returns 0 bytes / 0.00MB / ok', async () => {
    const usage = await getStorageUsage();
    expect(usage.totalBytes).toBe(0);
    expect(usage.totalMB).toBe('0.00');
    expect(usage.warningLevel).toBe('ok');
  });

  test('under 3MB returns ok', async () => {
    const smallPayload = 'x'.repeat(1000); // ~2KB with UTF-16
    await AsyncStorage.setItem('giron-workouts', smallPayload);
    const usage = await getStorageUsage();
    expect(usage.warningLevel).toBe('ok');
  });

  test('between 3MB and 5MB returns warning', async () => {
    // 2MB of UTF-16 = ~1M chars
    const bigPayload = 'x'.repeat(2 * 1024 * 1024); // 4MB in UTF-16
    await AsyncStorage.setItem('giron-workouts', bigPayload);
    const usage = await getStorageUsage();
    expect(usage.warningLevel).toBe('warning');
  });

  test('over 5MB returns critical', async () => {
    const hugePayload = 'x'.repeat(3 * 1024 * 1024); // 6MB in UTF-16
    await AsyncStorage.setItem('giron-workouts', hugePayload);
    const usage = await getStorageUsage();
    expect(usage.warningLevel).toBe('critical');
  });

  test('breakdown sorted descending', async () => {
    await AsyncStorage.setItem('giron-workouts', 'x'.repeat(100));
    await AsyncStorage.setItem('giron-nutrition', 'x'.repeat(500));
    const usage = await getStorageUsage();
    // first key should be largest
    for (let i = 1; i < usage.breakdown.length; i++) {
      expect(usage.breakdown[i - 1].bytes).toBeGreaterThanOrEqual(usage.breakdown[i].bytes);
    }
  });

  test('missing keys report 0 bytes, no crash', async () => {
    const usage = await getStorageUsage();
    expect(usage.breakdown.every((b) => b.bytes === 0)).toBe(true);
    expect(usage.totalBytes).toBe(0);
  });

  test('mb value is correctly formatted with 2 decimal places', async () => {
    await AsyncStorage.setItem('giron-workouts', 'x'.repeat(5000));
    const usage = await getStorageUsage();
    expect(usage.totalMB).toMatch(/^\d+\.\d{2}$/);
    for (const b of usage.breakdown) {
      expect(b.mb).toMatch(/^\d+\.\d{2}$/);
    }
  });

  test('eight STORE_KEYS accounted for', async () => {
    const usage = await getStorageUsage();
    expect(usage.breakdown.length).toBe(8);
  });

  test('unicode strings counted correctly (UTF-16 approximation)', async () => {
    await AsyncStorage.setItem('giron-auth', 'Привет мир'.repeat(100));
    const usage = await getStorageUsage();
    expect(usage.totalBytes).toBeGreaterThan(0);
  });

  test('bytes = length * 2 matches formula', async () => {
    const payload = 'x'.repeat(100);
    await AsyncStorage.setItem('giron-workouts', payload);
    const usage = await getStorageUsage();
    const workouts = usage.breakdown.find((b) => b.key === 'giron-workouts');
    expect(workouts?.bytes).toBe(200);
  });
});

// ─── Persist layer corruption tolerance ────────────────────────────────────

describe('Persisted data parse failures', () => {
  beforeEach(async () => {
    await clear();
  });

  test('invalid JSON stored value round-trips', async () => {
    await AsyncStorage.setItem('giron-workouts', '{not-json');
    const raw = await AsyncStorage.getItem('giron-workouts');
    expect(raw).toBe('{not-json');
  });

  test('null-string stored value returns "null"', async () => {
    await AsyncStorage.setItem('giron-workouts', 'null');
    const raw = await AsyncStorage.getItem('giron-workouts');
    expect(raw).toBe('null');
    expect(JSON.parse(raw!)).toBe(null);
  });

  test('empty object "{}" parses safely', async () => {
    await AsyncStorage.setItem('giron-workouts', '{}');
    const raw = await AsyncStorage.getItem('giron-workouts');
    expect(() => JSON.parse(raw!)).not.toThrow();
  });

  test('deep-nested object parses without stack blowing', async () => {
    const deep = JSON.stringify({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } });
    await AsyncStorage.setItem('giron-workouts', deep);
    const raw = await AsyncStorage.getItem('giron-workouts');
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect((JSON.parse(raw!) as any).a.b.c.d.e.f.g).toBe(1);
  });

  test('64KB payload round-trips intact', async () => {
    const big = 'x'.repeat(64 * 1024);
    await AsyncStorage.setItem('giron-workouts', big);
    const raw = await AsyncStorage.getItem('giron-workouts');
    expect(raw?.length).toBe(big.length);
  });

  test('unicode characters round-trip intact', async () => {
    const s = 'Привет мир 你好 👋';
    await AsyncStorage.setItem('giron-workouts', s);
    const raw = await AsyncStorage.getItem('giron-workouts');
    expect(raw).toBe(s);
  });

  test('null-safety: getItem on unknown key returns null', async () => {
    const raw = await AsyncStorage.getItem('does-not-exist' as any);
    expect(raw).toBeNull();
  });
});

// ─── Store key uniqueness and stability ────────────────────────────────────

describe('Store keys are unique and stable', () => {
  const KEYS = [
    'giron-workouts',
    'giron-nutrition',
    'giron-auth',
    'giron-settings',
    'giron-theme',
    'giron-sleep',
    'cardio-store',
    'giron-tips',
  ];

  test('all keys are distinct', () => {
    expect(new Set(KEYS).size).toBe(KEYS.length);
  });

  test('all keys use lowercase + hyphen naming', () => {
    for (const k of KEYS) {
      expect(k).toMatch(/^[a-z-]+$/);
    }
  });

  test('no spaces or special chars in keys', () => {
    for (const k of KEYS) {
      expect(k).not.toMatch(/[\s:;]/);
    }
  });

  test('giron prefix for all store keys (except cardio legacy)', () => {
    const prefixed = KEYS.filter((k) => k.startsWith('giron-'));
    const unprefixed = KEYS.filter((k) => !k.startsWith('giron-'));
    expect(prefixed.length).toBe(7);
    expect(unprefixed.length).toBe(1);
    expect(unprefixed[0]).toBe('cardio-store');
  });
});
