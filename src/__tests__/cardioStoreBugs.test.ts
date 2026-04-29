/**
 * Regression tests for cardio store sync/merge bugs
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/cardioService', () => ({
  cardioService: {
    getSessions: jest.fn(() => Promise.resolve([])),
    createSession: jest.fn(() => Promise.resolve({ id: 'server-1' })),
    deleteSession: jest.fn(() => Promise.resolve()),
  },
}));

import { useCardioStore } from '../store/useCardioStore';

beforeEach(() => {
  useCardioStore.setState({ sessions: [] });
});

describe('syncFromServer merge', () => {
  test('round 71: local- sessions promote to server (no longer kept verbatim)', async () => {
    // Round 71 changed the merge contract: instead of preserving 'local-'
    // entries forever (data-loss bug — they NEVER reached the backend), the
    // sync now pushes them via createSession first. The original BUG FIX
    // test asserted the old "keep local verbatim" contract, which by design
    // accumulated unsynced sessions until the user reinstalled.
    const localSession = {
      id: 'local-123', type: 'running' as const, date: '2026-04-08',
      durationMinutes: 30, distanceKm: 5, createdAt: '2026-04-08T10:00:00Z',
    };
    useCardioStore.setState({ sessions: [localSession] as any });

    const serverSession = {
      id: 'server-456', type: 'cycling' as const, date: '2026-04-07',
      durationMinutes: 45, createdAt: '2026-04-07T10:00:00Z',
    };
    const promotedSession = {
      id: 'server-promoted', type: 'running' as const, date: '2026-04-08',
      durationMinutes: 30, distanceKm: 5, createdAt: '2026-04-08T10:00:00Z',
    };
    const { cardioService } = require('../services/cardioService');
    cardioService.createSession.mockResolvedValueOnce(promotedSession);
    cardioService.getSessions.mockResolvedValueOnce([serverSession]);

    await useCardioStore.getState().syncFromServer();

    const sessions = useCardioStore.getState().sessions;
    // local-123 is gone (promoted to server-promoted)
    expect(sessions.find((s: any) => s.id === 'local-123')).toBeUndefined();
    // The promoted entry stays (read-after-write protection — server hasn't
    // included it in getSessions yet on this tick)
    expect(sessions.find((s: any) => s.id === 'server-promoted')).toBeDefined();
    expect(sessions.find((s: any) => s.id === 'server-456')).toBeDefined();
    expect(cardioService.createSession).toHaveBeenCalledTimes(1);
  });

  test('server sync failure keeps local sessions', async () => {
    const localSession = {
      id: 'local-789', type: 'swimming' as const, date: '2026-04-08',
      durationMinutes: 60, createdAt: '2026-04-08T10:00:00Z',
    };
    useCardioStore.setState({ sessions: [localSession] as any });

    const { cardioService } = require('../services/cardioService');
    cardioService.getSessions.mockRejectedValueOnce(new Error('Network error'));

    await useCardioStore.getState().syncFromServer();

    expect(useCardioStore.getState().sessions.length).toBe(1);
    expect(useCardioStore.getState().sessions[0].id).toBe('local-789');
  });

  test('server session with same ID as local replaces local version', async () => {
    // If server knows about a session, server version wins
    const localSession = {
      id: 'server-existing', type: 'running' as const, date: '2026-04-08',
      durationMinutes: 30, createdAt: '2026-04-08T10:00:00Z',
    };
    useCardioStore.setState({ sessions: [localSession] as any });

    const serverSession = {
      id: 'server-existing', type: 'running' as const, date: '2026-04-08',
      durationMinutes: 35, createdAt: '2026-04-08T10:00:00Z', // updated on server
    };
    const { cardioService } = require('../services/cardioService');
    cardioService.getSessions.mockResolvedValueOnce([serverSession]);

    await useCardioStore.getState().syncFromServer();

    const sessions = useCardioStore.getState().sessions;
    // Should not duplicate: local-prefixed sessions are kept, non-local are replaced by server
    expect(sessions.length).toBe(1);
    expect(sessions[0].durationMinutes).toBe(35); // server version
  });
});

describe('addSession offline fallback', () => {
  test('creates local session when server fails', async () => {
    const { cardioService } = require('../services/cardioService');
    cardioService.createSession.mockRejectedValueOnce(new Error('Offline'));

    await useCardioStore.getState().addSession({
      type: 'running', date: '2026-04-08', durationMinutes: 30,
    });

    const sessions = useCardioStore.getState().sessions;
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toMatch(/^local-/);
  });
});
