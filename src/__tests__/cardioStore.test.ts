/**
 * Tests for useCardioStore — session CRUD, offline fallback,
 * 4xx re-throw, sync merge, and 404-safe delete.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/cardioService', () => ({
  cardioService: {
    createSession: jest.fn(),
    deleteSession: jest.fn(() => Promise.resolve()),
    getSessions: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('../utils/date', () => ({
  localDateStr: (d: Date) => d.toISOString().slice(0, 10),
}));

import { useCardioStore } from '../store/useCardioStore';
import { cardioService } from '../services/cardioService';

const mockCreate = cardioService.createSession as jest.Mock;
const mockDelete = cardioService.deleteSession as jest.Mock;
const mockGetSessions = cardioService.getSessions as jest.Mock;

import type { CardioType } from '../types';

const session = (overrides: Partial<{id: string; date: string; type: CardioType}> = {}) => ({
  id: overrides.id ?? 's-001',
  type: (overrides.type ?? 'running') as CardioType,
  date: overrides.date ?? '2026-04-20',
  durationMinutes: 30,
  distanceKm: 5,
  caloriesBurned: 300,
  avgHeartRate: 145,
  notes: undefined as string | undefined,
  createdAt: '2026-04-20T10:00:00.000Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  useCardioStore.setState({ sessions: [] });
  mockCreate.mockResolvedValue(session());
  mockDelete.mockResolvedValue(undefined);
  mockGetSessions.mockResolvedValue([]);
});

// ─── addSession ───────────────────────────────────────────────────────────────

describe('addSession', () => {
  test('adds server-returned session to state on success', async () => {
    await useCardioStore.getState().addSession({
      type: 'running',
      date: '2026-04-20',
      durationMinutes: 30,
    });

    const sessions = useCardioStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('s-001');
  });

  test('falls back to local storage on network error (non-4xx)', async () => {
    // Network error has no status code
    mockCreate.mockRejectedValueOnce(new Error('Network timeout'));

    await useCardioStore.getState().addSession({
      type: 'walking',
      date: '2026-04-20',
      durationMinutes: 45,
    });

    const sessions = useCardioStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toMatch(/^local-/);
  });

  test('rethrows 4xx validation errors (no local fallback)', async () => {
    const err400 = { response: { status: 400 } };
    mockCreate.mockRejectedValueOnce(err400);

    await expect(
      useCardioStore.getState().addSession({
        type: 'running',
        date: '2026-04-20',
        durationMinutes: 0, // invalid
      })
    ).rejects.toEqual(err400);

    // No local session should be created
    expect(useCardioStore.getState().sessions).toHaveLength(0);
  });

  test('prepends session to front of list (most recent first)', async () => {
    useCardioStore.setState({ sessions: [session({ id: 's-old', date: '2026-04-15' })] });

    await useCardioStore.getState().addSession({
      type: 'cycling',
      date: '2026-04-20',
      durationMinutes: 60,
    });

    const sessions = useCardioStore.getState().sessions;
    expect(sessions[0].id).toBe('s-001'); // new session first
    expect(sessions[1].id).toBe('s-old');
  });
});

// ─── removeSession ────────────────────────────────────────────────────────────

describe('removeSession', () => {
  test('removes session from state immediately (optimistic)', async () => {
    useCardioStore.setState({ sessions: [session()] });

    useCardioStore.getState().removeSession('s-001');

    // Synchronous removal happens immediately
    expect(useCardioStore.getState().sessions).toHaveLength(0);
  });

  test('calls deleteSession for server-persisted ids', async () => {
    useCardioStore.setState({ sessions: [session({ id: 's-001' })] });

    await useCardioStore.getState().removeSession('s-001');
    await Promise.resolve();

    expect(mockDelete).toHaveBeenCalledWith('s-001');
  });

  test('does NOT call deleteSession for local- sessions', async () => {
    useCardioStore.setState({
      sessions: [session({ id: 'local-1234567890' })],
    });

    useCardioStore.getState().removeSession('local-1234567890');
    await Promise.resolve();

    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('restores session if server delete fails (non-404)', async () => {
    const err500 = { response: { status: 500 } };
    mockDelete.mockRejectedValueOnce(err500);

    useCardioStore.setState({ sessions: [session()] });

    useCardioStore.getState().removeSession('s-001');
    expect(useCardioStore.getState().sessions).toHaveLength(0); // optimistic

    await Promise.resolve();
    await Promise.resolve();

    expect(useCardioStore.getState().sessions).toHaveLength(1); // restored
  });

  test('does NOT restore if server returns 404 (already deleted)', async () => {
    const err404 = { response: { status: 404 } };
    mockDelete.mockRejectedValueOnce(err404);

    useCardioStore.setState({ sessions: [session()] });

    useCardioStore.getState().removeSession('s-001');

    await Promise.resolve();
    await Promise.resolve();

    expect(useCardioStore.getState().sessions).toHaveLength(0); // deletion stands
  });
});

// ─── getWeekSessions ──────────────────────────────────────────────────────────

describe('getWeekSessions', () => {
  test('returns sessions from the last 7 days (including today)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const d3ago = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const d10ago = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);

    useCardioStore.setState({
      sessions: [
        session({ id: 's-today', date: today }),
        session({ id: 's-3ago', date: d3ago }),
        session({ id: 's-10ago', date: d10ago }),
      ],
    });

    const week = useCardioStore.getState().getWeekSessions();
    const weekIds = week.map((s) => s.id);

    expect(weekIds).toContain('s-today');
    expect(weekIds).toContain('s-3ago');
    expect(weekIds).not.toContain('s-10ago');
  });

  test('returns empty array when no sessions in last week', () => {
    const oldDate = '2020-01-01';
    useCardioStore.setState({ sessions: [session({ date: oldDate })] });

    expect(useCardioStore.getState().getWeekSessions()).toHaveLength(0);
  });
});

// ─── syncFromServer ───────────────────────────────────────────────────────────

describe('syncFromServer', () => {
  test('replaces sessions with server data', async () => {
    const serverSessions = [session({ id: 's-server-1' }), session({ id: 's-server-2' })];
    mockGetSessions.mockResolvedValueOnce(serverSessions);

    await useCardioStore.getState().syncFromServer();

    const sessions = useCardioStore.getState().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.id)).toContain('s-server-1');
  });

  test('preserves local- sessions not on server', async () => {
    useCardioStore.setState({
      sessions: [
        session({ id: 'local-pending' }), // pending local session
        session({ id: 's-server-old' }),    // old server session
      ],
    });

    mockGetSessions.mockResolvedValueOnce([session({ id: 's-server-new' })]);

    await useCardioStore.getState().syncFromServer();

    const ids = useCardioStore.getState().sessions.map((s) => s.id);
    expect(ids).toContain('local-pending');   // kept
    expect(ids).toContain('s-server-new');    // new from server
    expect(ids).not.toContain('s-server-old'); // replaced
  });

  test('keeps local data unchanged if server call fails', async () => {
    useCardioStore.setState({ sessions: [session({ id: 'local-1' })] });
    mockGetSessions.mockRejectedValueOnce(new Error('Network error'));

    await useCardioStore.getState().syncFromServer();

    expect(useCardioStore.getState().sessions).toHaveLength(1);
    expect(useCardioStore.getState().sessions[0].id).toBe('local-1');
  });
});

// ─── clearUserData ────────────────────────────────────────────────────────────

describe('clearUserData', () => {
  test('removes all sessions', () => {
    useCardioStore.setState({
      sessions: [session({ id: 's-1' }), session({ id: 's-2' })],
    });

    useCardioStore.getState().clearUserData();

    expect(useCardioStore.getState().sessions).toHaveLength(0);
  });
});
