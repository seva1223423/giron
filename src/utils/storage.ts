import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEYS = [
  'iron-gym-workouts',
  'iron-gym-nutrition',
  'iron-gym-auth',
  'iron-gym-settings',
  'iron-gym-theme',
  'iron-gym-sleep',
  'cardio-store',
  'iron-gym-tips',
];

export interface StorageUsage {
  totalBytes: number;
  totalMB: string;
  breakdown: { key: string; bytes: number; mb: string }[];
  warningLevel: 'ok' | 'warning' | 'critical'; // >3MB warning, >5MB critical
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const breakdown: { key: string; bytes: number; mb: string }[] = [];
  let total = 0;

  for (const key of STORE_KEYS) {
    try {
      const value = await AsyncStorage.getItem(key);
      const bytes = value ? value.length * 2 : 0; // approximate UTF-16 byte size
      breakdown.push({ key, bytes, mb: (bytes / 1024 / 1024).toFixed(2) });
      total += bytes;
    } catch {
      breakdown.push({ key, bytes: 0, mb: '0.00' });
    }
  }

  breakdown.sort((a, b) => b.bytes - a.bytes);

  return {
    totalBytes: total,
    totalMB: (total / 1024 / 1024).toFixed(2),
    breakdown,
    warningLevel: total > 5 * 1024 * 1024 ? 'critical' : total > 3 * 1024 * 1024 ? 'warning' : 'ok',
  };
}
