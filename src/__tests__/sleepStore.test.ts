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

  describe('getAverageQuality', () => {
    test('computes average quality ignoring null entries', () => {
      const { addEntry } = useSleepStore.getState();
      addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', quality: 5 });
      addEntry({ date: '2026-04-07', bedtime: '23:00', wakeTime: '07:00' }); // no quality
      addEntry({ date: '2026-04-06', bedtime: '23:00', wakeTime: '07:00', quality: 3 });

      // Only entries with quality contribute: (5+3)/2 = 4
      expect(useSleepStore.getState().getAverageQuality(3)).toBe(4);
    });

    test('returns 0 when no entries', () => {
      expect(useSleepStore.getState().getAverageQuality(7)).toBe(0);
    });

    test('returns 0 when no entries have quality set', () => {
      useSleepStore.getState().addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
      expect(useSleepStore.getState().getAverageQuality(7)).toBe(0);
    });

    test('limits to last N entries', () => {
      const { addEntry } = useSleepStore.getState();
      addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', quality: 5 }); // within days=1
      addEntry({ date: '2026-04-06', bedtime: '23:00', wakeTime: '07:00', quality: 1 }); // outside days=1

      // With days=1 only the most recent entry counts
      expect(useSleepStore.getState().getAverageQuality(1)).toBe(5);
    });
  });

  describe('clearUserData', () => {
    test('resets entries to empty array', () => {
      const { addEntry } = useSleepStore.getState();
      addEntry({ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00' });
      addEntry({ date: '2026-04-07', bedtime: '22:00', wakeTime: '06:00' });

      useSleepStore.getState().clearUserData();

      expect(useSleepStore.getState().entries).toHaveLength(0);
    });
  });

  describe('syncFromServer', () => {
    const { userService } = require('../services/userService');

    beforeEach(() => {
      userService.getSleep.mockResolvedValue([]);
    });

    test('replaces local entries with server data and keeps local-only entries', async () => {
      // Seed local entries: one matches server date, one is local-only
      useSleepStore.setState({
        entries: [
          { date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', durationHours: 8 },
          { date: '2026-04-01', bedtime: '22:00', wakeTime: '06:00', durationHours: 8 }, // local-only
        ],
      });

      userService.getSleep.mockResolvedValueOnce([
        { date: '2026-04-08', bedtime: '00:00', wakeTime: '08:00', durationHours: 8, quality: 4 }, // server version
        { date: '2026-04-07', bedtime: '23:00', wakeTime: '06:00', durationHours: 7, quality: null },
      ]);

      await useSleepStore.getState().syncFromServer();

      const entries = useSleepStore.getState().entries;
      // Should have: server 2026-04-08, server 2026-04-07, local-only 2026-04-01
      expect(entries).toHaveLength(3);
      expect(entries[0].date).toBe('2026-04-08');
      expect(entries[0].bedtime).toBe('00:00'); // server overwrote local
      expect(entries[2].date).toBe('2026-04-01'); // local-only preserved
    });

    test('keeps local entries when server returns empty', async () => {
      useSleepStore.setState({
        entries: [{ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', durationHours: 8 }],
      });

      userService.getSleep.mockResolvedValueOnce([]);
      await useSleepStore.getState().syncFromServer();

      // No change — server returned empty
      expect(useSleepStore.getState().entries).toHaveLength(1);
    });

    test('keeps local entries when server call fails', async () => {
      useSleepStore.setState({
        entries: [{ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', durationHours: 8 }],
      });

      userService.getSleep.mockRejectedValueOnce(new Error('Network error'));
      await useSleepStore.getState().syncFromServer(); // should not throw

      expect(useSleepStore.getState().entries).toHaveLength(1);
    });
  });

  describe('addEntry server sync failure rollback', () => {
    const { userService } = require('../services/userService');

    test('rolls back entry when saveSleep fails', async () => {
      userService.saveSleep.mockRejectedValueOnce(new Error('server error'));

      useSleepStore.getState().addEntry({
        date: '2026-04-08',
        bedtime: '23:00',
        wakeTime: '07:00',
      });

      // Entry is added optimistically
      expect(useSleepStore.getState().entries).toHaveLength(1);

      // Wait for the rejected promise to trigger rollback
      await new Promise((r) => setTimeout(r, 0));

      expect(useSleepStore.getState().entries).toHaveLength(0);
    });
  });

  describe('removeEntry server sync failure rollback', () => {
    const { userService } = require('../services/userService');

    test('re-adds entry when deleteSleep fails with non-404 error', async () => {
      useSleepStore.setState({
        entries: [{ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', durationHours: 8 }],
      });

      userService.deleteSleep.mockRejectedValueOnce({ response: { status: 500 } });

      useSleepStore.getState().removeEntry('2026-04-08');

      // Removed optimistically
      expect(useSleepStore.getState().entries).toHaveLength(0);

      // Wait for rollback
      await new Promise((r) => setTimeout(r, 0));

      // Re-added after server error
      expect(useSleepStore.getState().entries).toHaveLength(1);
      expect(useSleepStore.getState().entries[0].date).toBe('2026-04-08');
    });

    test('does NOT re-add when deleteSleep fails with 404 (local-only entry)', async () => {
      useSleepStore.setState({
        entries: [{ date: '2026-04-08', bedtime: '23:00', wakeTime: '07:00', durationHours: 8 }],
      });

      userService.deleteSleep.mockRejectedValueOnce({ response: { status: 404 } });

      useSleepStore.getState().removeEntry('2026-04-08');
      await new Promise((r) => setTimeout(r, 0));

      // 404 means it was local-only — no rollback
      expect(useSleepStore.getState().entries).toHaveLength(0);
    });
  });
});
