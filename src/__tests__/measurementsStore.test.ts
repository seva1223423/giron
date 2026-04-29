/**
 * Tests for useMeasurementsStore — body measurements CRUD, sync logic,
 * and ID upgrade pattern (local meas-* → server-{date} after persist).
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/userService', () => ({
  userService: {
    saveMeasurement: jest.fn(() => Promise.resolve()),
    deleteMeasurement: jest.fn(() => Promise.resolve()),
    getMeasurements: jest.fn(() => Promise.resolve([])),
  },
}));

import { useMeasurementsStore } from '../store/useMeasurementsStore';
import { userService } from '../services/userService';

const mockSave = userService.saveMeasurement as jest.Mock;
const mockDelete = userService.deleteMeasurement as jest.Mock;
const mockGet = userService.getMeasurements as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useMeasurementsStore.setState({ entries: [] });
  mockSave.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  mockGet.mockResolvedValue([]);
});

// ─── addEntry ─────────────────────────────────────────────────────────────────

describe('addEntry', () => {
  test('adds entry to state immediately (optimistic)', () => {
    useMeasurementsStore.getState().addEntry({
      date: '2026-04-20',
      waist: 80,
      chest: 100,
    });

    const entries = useMeasurementsStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].waist).toBe(80);
    expect(entries[0].chest).toBe(100);
    expect(entries[0].date).toBe('2026-04-20');
  });

  test('generates local id starting with meas- before sync', () => {
    useMeasurementsStore.getState().addEntry({ date: '2026-04-20', waist: 80 });

    const entries = useMeasurementsStore.getState().entries;
    expect(entries[0].id).toMatch(/^meas-/);
  });

  test('upgrades id to server-{date} after successful sync', async () => {
    useMeasurementsStore.getState().addEntry({ date: '2026-04-20', waist: 80 });

    // Wait for async sync
    await Promise.resolve();
    await Promise.resolve();

    const entries = useMeasurementsStore.getState().entries;
    expect(entries[0].id).toBe('server-2026-04-20');
  });

  test('keeps entry locally on network error (round 72 — was data-loss)', async () => {
    // Round 72 changed the contract: a network error keeps the meas-prefixed
    // entry so syncFromServer can promote it later. Previously every failure
    // dropped the row, including transient offline saves the user thought
    // they had successfully logged. Server-side 4xx still drops (covered
    // by the test below).
    mockSave.mockRejectedValueOnce(new Error('Network error')); // no `response.status` → treated as offline

    useMeasurementsStore.getState().addEntry({ date: '2026-04-20', waist: 80 });
    expect(useMeasurementsStore.getState().entries).toHaveLength(1); // optimistic

    await Promise.resolve();
    await Promise.resolve();

    // Entry retained with meas- prefix; sync will retry it on next online tick
    expect(useMeasurementsStore.getState().entries).toHaveLength(1);
    expect(useMeasurementsStore.getState().entries[0].id).toMatch(/^meas-/);
  });

  test('drops entry on 4xx server reject (validation failure is permanent)', async () => {
    // Bad payload — server responded 400. Retrying won't help, so the
    // entry should be removed. Mirrors cardio's addSession 4xx branch.
    mockSave.mockRejectedValueOnce({ response: { status: 400 } });

    useMeasurementsStore.getState().addEntry({ date: '2026-04-20', waist: 80 });
    expect(useMeasurementsStore.getState().entries).toHaveLength(1); // optimistic

    await Promise.resolve();
    await Promise.resolve();

    expect(useMeasurementsStore.getState().entries).toHaveLength(0); // dropped
  });

  test('calls saveMeasurement with correct fields', async () => {
    useMeasurementsStore.getState().addEntry({
      date: '2026-04-20',
      waist: 80,
      chest: 100,
      hips: 95,
      bicep: 35,
      thigh: 60,
      calf: 38,
      neck: 40,
    });

    await Promise.resolve();

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-04-20',
        waist: 80,
        chest: 100,
        hips: 95,
        bicep: 35,
        thigh: 60,
        calf: 38,
        neck: 40,
      })
    );
  });
});

// ─── updateEntry ──────────────────────────────────────────────────────────────

describe('updateEntry', () => {
  test('updates entry fields in state immediately', () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80, chest: 100 }],
    });

    useMeasurementsStore.getState().updateEntry('server-2026-04-20', { waist: 85 });

    const entry = useMeasurementsStore.getState().entries[0];
    expect(entry.waist).toBe(85);
    expect(entry.chest).toBe(100); // unchanged
  });

  test('calls saveMeasurement with merged data', async () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80, chest: 100 }],
    });

    useMeasurementsStore.getState().updateEntry('server-2026-04-20', { waist: 85 });

    await Promise.resolve();

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-04-20', waist: 85, chest: 100 })
    );
  });

  test('reverts entry on sync failure', async () => {
    mockSave.mockRejectedValueOnce(new Error('Network error'));

    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });

    useMeasurementsStore.getState().updateEntry('server-2026-04-20', { waist: 99 });
    expect(useMeasurementsStore.getState().entries[0].waist).toBe(99); // optimistic

    await Promise.resolve();
    await Promise.resolve();

    expect(useMeasurementsStore.getState().entries[0].waist).toBe(80); // reverted
  });
});

// ─── deleteEntry ──────────────────────────────────────────────────────────────

describe('deleteEntry', () => {
  test('removes entry from state immediately', () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });

    useMeasurementsStore.getState().deleteEntry('server-2026-04-20');

    expect(useMeasurementsStore.getState().entries).toHaveLength(0);
  });

  test('calls deleteMeasurement only for server-* entries', async () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });

    useMeasurementsStore.getState().deleteEntry('server-2026-04-20');
    await Promise.resolve();

    expect(mockDelete).toHaveBeenCalledWith('2026-04-20');
  });

  test('does NOT call deleteMeasurement for local meas-* entries (not yet on server)', async () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'meas-1234-abc', date: '2026-04-20', waist: 80 }],
    });

    useMeasurementsStore.getState().deleteEntry('meas-1234-abc');
    await Promise.resolve();

    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('restores entry if server delete fails (non-404)', async () => {
    const err = { response: { status: 500 } };
    mockDelete.mockRejectedValueOnce(err);

    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });

    useMeasurementsStore.getState().deleteEntry('server-2026-04-20');
    expect(useMeasurementsStore.getState().entries).toHaveLength(0); // optimistic

    await Promise.resolve();
    await Promise.resolve();

    expect(useMeasurementsStore.getState().entries).toHaveLength(1); // restored
  });

  test('does NOT restore entry if server returns 404 (already deleted)', async () => {
    const err404 = { response: { status: 404 } };
    mockDelete.mockRejectedValueOnce(err404);

    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });

    useMeasurementsStore.getState().deleteEntry('server-2026-04-20');

    await Promise.resolve();
    await Promise.resolve();

    // 404 = already deleted on server — local deletion stands
    expect(useMeasurementsStore.getState().entries).toHaveLength(0);
  });
});

// ─── getLatest ────────────────────────────────────────────────────────────────

describe('getLatest', () => {
  test('returns null when no entries', () => {
    expect(useMeasurementsStore.getState().getLatest()).toBeNull();
  });

  test('returns the most recent entry by date', () => {
    useMeasurementsStore.setState({
      entries: [
        { id: 'server-2026-04-10', date: '2026-04-10', waist: 80 },
        { id: 'server-2026-04-20', date: '2026-04-20', waist: 85 },
        { id: 'server-2026-04-05', date: '2026-04-05', waist: 78 },
      ],
    });

    const latest = useMeasurementsStore.getState().getLatest();
    expect(latest?.date).toBe('2026-04-20');
    expect(latest?.waist).toBe(85);
  });
});

// ─── syncFromServer ───────────────────────────────────────────────────────────

describe('syncFromServer', () => {
  test('replaces entries with server data when server has results', async () => {
    const serverData = [
      { date: '2026-04-20T00:00:00.000Z', waist: 80, chest: 100, hips: null, bicep: null, thigh: null, calf: null, neck: null },
    ];
    mockGet.mockResolvedValueOnce(serverData);

    await useMeasurementsStore.getState().syncFromServer();

    const entries = useMeasurementsStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('server-2026-04-20');
    expect(entries[0].date).toBe('2026-04-20');
    expect(entries[0].waist).toBe(80);
  });

  test('strips time component from ISO date string', async () => {
    mockGet.mockResolvedValueOnce([
      { date: '2026-04-20T15:30:00.000Z', waist: 80 },
    ]);

    await useMeasurementsStore.getState().syncFromServer();

    const entry = useMeasurementsStore.getState().entries[0];
    expect(entry.date).toBe('2026-04-20');
    expect(entry.id).toBe('server-2026-04-20');
  });

  test('merges local-only entries (by date) not present on server', async () => {
    // Local entry for 2026-04-15 (not on server)
    useMeasurementsStore.setState({
      entries: [{ id: 'meas-local-abc', date: '2026-04-15', waist: 75 }],
    });

    mockGet.mockResolvedValueOnce([
      { date: '2026-04-20', waist: 80 },
    ]);

    await useMeasurementsStore.getState().syncFromServer();

    const entries = useMeasurementsStore.getState().entries;
    // Should have both: local 2026-04-15 AND server 2026-04-20
    expect(entries).toHaveLength(2);
    const dates = entries.map((e) => e.date).sort();
    expect(dates).toEqual(['2026-04-15', '2026-04-20']);
  });

  test('does not duplicate when server already has the same date as local', async () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });

    mockGet.mockResolvedValueOnce([
      { date: '2026-04-20', waist: 82 }, // server has updated value
    ]);

    await useMeasurementsStore.getState().syncFromServer();

    const entries = useMeasurementsStore.getState().entries;
    // server value takes precedence; no duplicate
    expect(entries).toHaveLength(1);
    expect(entries[0].waist).toBe(82);
  });

  test('keeps local data unchanged if server call fails', async () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'server-2026-04-20', date: '2026-04-20', waist: 80 }],
    });
    mockGet.mockRejectedValueOnce(new Error('Network error'));

    await useMeasurementsStore.getState().syncFromServer();

    const entries = useMeasurementsStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].waist).toBe(80);
  });

  test('does nothing if server returns empty array (preserve local)', async () => {
    useMeasurementsStore.setState({
      entries: [{ id: 'meas-local', date: '2026-04-20', waist: 80 }],
    });
    mockGet.mockResolvedValueOnce([]);

    await useMeasurementsStore.getState().syncFromServer();

    // Empty server response = do nothing (keep local)
    expect(useMeasurementsStore.getState().entries).toHaveLength(1);
  });
});

// ─── clearUserData ────────────────────────────────────────────────────────────

describe('clearUserData', () => {
  test('removes all entries', () => {
    useMeasurementsStore.setState({
      entries: [
        { id: 'server-2026-04-20', date: '2026-04-20', waist: 80 },
        { id: 'server-2026-04-10', date: '2026-04-10', waist: 78 },
      ],
    });

    useMeasurementsStore.getState().clearUserData();

    expect(useMeasurementsStore.getState().entries).toHaveLength(0);
  });
});
