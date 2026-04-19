/**
 * Tests for useSleepStore — sleep tracking logic
 */

// Mock AsyncStorage before importing the store
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

describe('useSleepStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSleepStore.setState({ entries: [] });
  });

  describe('addEntry', () => {
    test('adds entry and computes duration for normal sleep', () => {
      useSleepStore.getState().addEntry({
        date: '2026-04-08',
        bedtime: '23:00',
        wakeTime: '07:00',
        quality: 4,
      });

      const entries = useSleepStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].durationHours).toBe(8);
      expect(entries[0].quality).toBe(4);
    });

    test('handles overnight sleep (bedtime > wakeTime)', () => {
      useSleepStore.getState().addEntry({
        date: '2026-04-08',
        bedtime: '01:00',
        wakeTime: '09:00',
        quality: 3,
      });

      expect(useSleepStore.getState().entries[0].durationHours).toBe(8);
    });

    test('handles late bedtime crossing midnight', () => {
      useSleepStore.getState().addEntry({
        date: '2026-04-08',
        bedtime: '23:30',
        wakeTime: '06:30',
        quality: 3,
      });

      expect(useSleepStore.getState().entries[0].durationHours).toBe(7);
    });

    test('handles short sleep', () => {
      useSleepStore.getState().addEntry({
        date: '2026-04-08',
        bedtime: '02:00',
        wakeTime: '05:30',
      });

      expect(useSleepStore.getState().entries[0].durationHours).toBe(3.5);
    });

    test('replaces entry for same date', () => {
      const { addEntry } = useSleepStore.getState();
      addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
      addEntry({ date: '2026-04-08', bedtime: '22:00', wakeTime: '06:00' });

      expect(useSleepStore.getState().entries).toHaveLength(1);
      expect(useSleepStore.getState().entries[0].durationHours).toBe(8);
      expect(useSleepStore.getState().entries[0].bedtime).toBe('22:00');
    });

    test('sorts entries by date descending', () => {
      const { addEntry } = useSleepStore.getState();
      addEntry({ date: '2026-04-06', bedtime: '23:00', wakeTime: '07:00' });
      addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
      addEntry({ date: '2026-04-07', bedtime: '23:00', wakeTime: '07:00' });

      const dates = useSleepStore.getState().entries.map((e) => e.date);
      expect(dates).toEqual(['2026-04-08', '2026-04-07', '2026-04-06']);
    });
  });

  describe('removeEntry', () => {
    test('removes entry by date', () => {
      useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
      useSleepStore.getState().addEntry({ date: '2026-04-07', bedtime: '23:00', wakeTime: '07:00' });

      useSleepStore.getState().removeEntry('2026-04-08');

      const entries = useSleepStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].date).toBe('2026-04-07');
    });

    test('does nothing if date not found', () => {
      useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
      useSleepStore.getState().removeEntry('2026-01-01');

      expect(useSleepStore.getState().entries).toHaveLength(1);
    });
  });

  describe('getLastEntries', () => {
    test('returns last N entries', () => {
      const { addEntry } = useSleepStore.getState();
      for (let i = 1; i <= 10; i++) {
        addEntry({ date: `2026-04-${String(i).padStart(2, '0')}`, bedtime: '23:00', wakeTime: '07:00' });
      }

      const last3 = useSleepStore.getState().getLastEntries(3);
      expect(last3).toHaveLength(3);
      expect(last3[0].date).toBe('2026-04-10');
      expect(last3[2].date).toBe('2026-04-08');
    });

    test('returns all if fewer than requested', () => {
      useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });

      expect(useSleepStore.getState().getLastEntries(5)).toHaveLength(1);
    });

    test('returns empty array when no entries', () => {
      expect(useSleepStore.getState().getLastEntries(5)).toHaveLength(0);
    });
  });

  describe('getAverageDuration', () => {
    test('computes average over last N entries', () => {
      const { addEntry } = useSleepStore.getState();
      addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' }); // 8h
      addEntry({ date: '2026-04-07', bedtime: '23:00', wakeTime: '05:00' }); // 6h
      addEntry({ date: '2026-04-06', bedtime: '23:00', wakeTime: '09:00' }); // 10h

      expect(useSleepStore.getState().getAverageDuration(3)).toBe(8); // (8+6+10)/3
    });

    test('returns 0 when no entries', () => {
      expect(useSleepStore.getState().getAverageDuration(7)).toBe(0);
    });

    test('handles single entry', () => {
      useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '06:00' }); // 7h
      expect(useSleepStore.getState().getAverageDuration(7)).toBe(7);
    });
  });
});
