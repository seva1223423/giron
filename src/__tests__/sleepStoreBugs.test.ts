/**
 * Regression tests for sleep duration calculation edge cases
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/userService', () => ({
  userService: {
    saveSleep: jest.fn(() => Promise.resolve()),
    deleteSleep: jest.fn(() => Promise.resolve()),
    getSleep: jest.fn(() => Promise.resolve([])),
  },
}));

import { useSleepStore } from '../store/useSleepStore';

beforeEach(() => {
  useSleepStore.setState({ entries: [] });
});

describe('overnight sleep calculation', () => {
  test('BUG: bedtime 23:30, wake 06:30 = 7 hours (crosses midnight)', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:30', wakeTime: '06:30' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(7);
  });

  test('same time bedtime and wake = 24 hours (edge case)', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '23:00' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(24);
  });

  test('very short sleep: 3:00 - 5:30 = 2.5 hours', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '03:00', wakeTime: '05:30' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(2.5);
  });

  test('normal overnight: 22:00 - 06:00 = 8 hours', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '22:00', wakeTime: '06:00' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(8);
  });

  test('daytime nap: 14:00 - 15:30 = 1.5 hours', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '14:00', wakeTime: '15:30' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(1.5);
  });

  test('midnight to morning: 00:00 - 07:00 = 7 hours', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '00:00', wakeTime: '07:00' });
    expect(useSleepStore.getState().entries[0].durationHours).toBe(7);
  });
});

describe('entry management', () => {
  test('replaces entry for same date (no duplicates)', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '22:00', wakeTime: '06:00' });
    expect(useSleepStore.getState().entries.length).toBe(1);
    expect(useSleepStore.getState().entries[0].bedtime).toBe('22:00');
  });

  test('different dates create separate entries', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    useSleepStore.getState().addEntry({ date: '2026-04-07', bedtime: '22:00', wakeTime: '06:00' });
    expect(useSleepStore.getState().entries.length).toBe(2);
  });

  test('removeEntry removes by date', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    useSleepStore.getState().addEntry({ date: '2026-04-07', bedtime: '22:00', wakeTime: '06:00' });
    useSleepStore.getState().removeEntry('2026-04-08');
    expect(useSleepStore.getState().entries.length).toBe(1);
    expect(useSleepStore.getState().entries[0].date).toBe('2026-04-07');
  });
});

describe('input validation', () => {
  test('getLastEntries returns empty array for negative count', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    expect(useSleepStore.getState().getLastEntries(-1)).toEqual([]);
    expect(useSleepStore.getState().getLastEntries(0)).toEqual([]);
  });

  test('getAverageDuration returns 0 for negative days', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
    expect(useSleepStore.getState().getAverageDuration(-5)).toBe(0);
    expect(useSleepStore.getState().getAverageDuration(0)).toBe(0);
  });

  test('getAverageQuality returns 0 for negative days', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', quality: 8 });
    expect(useSleepStore.getState().getAverageQuality(-5)).toBe(0);
    expect(useSleepStore.getState().getAverageQuality(0)).toBe(0);
  });
});

describe('average duration', () => {
  test('average duration with mixed sleep lengths', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' }); // 8h
    useSleepStore.getState().addEntry({ date: '2026-04-07', bedtime: '01:00', wakeTime: '05:00' }); // 4h
    useSleepStore.getState().addEntry({ date: '2026-04-06', bedtime: '22:00', wakeTime: '07:00' }); // 9h
    expect(useSleepStore.getState().getAverageDuration(3)).toBe(7); // (8+4+9)/3 = 7
  });

  test('average duration with no entries returns 0', () => {
    expect(useSleepStore.getState().getAverageDuration(7)).toBe(0);
  });

  test('average duration with fewer entries than requested', () => {
    useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' }); // 8h
    // Requesting 7 but only 1 entry -> should return 8
    expect(useSleepStore.getState().getAverageDuration(7)).toBe(8);
  });
});
