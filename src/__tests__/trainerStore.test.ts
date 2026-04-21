/**
 * Tests for useTrainerStore — clients, sessions, optimistic updates, rollback
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/trainerService', () => ({
  trainerService: {
    getClients: jest.fn(() => Promise.resolve([])),
    addClient: jest.fn(() => Promise.resolve(null)),
    updateClient: jest.fn(() => Promise.resolve(null)),
    deleteClient: jest.fn(() => Promise.resolve()),
    getSessions: jest.fn(() => Promise.resolve([])),
    logSession: jest.fn(() => Promise.resolve(null)),
    deleteSession: jest.fn(() => Promise.resolve()),
  },
}));

import { useTrainerStore } from '../store/useTrainerStore';

const resetState = () => {
  useTrainerStore.setState({ clients: [], sessions: [], isLoading: false });
};

describe('useTrainerStore', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  // ─── initial state ────────────────────────────────────────────────────────

  test('initial state has empty clients and sessions', () => {
    expect(useTrainerStore.getState().clients).toEqual([]);
    expect(useTrainerStore.getState().sessions).toEqual([]);
    expect(useTrainerStore.getState().isLoading).toBe(false);
  });

  // ─── addClient ────────────────────────────────────────────────────────────

  test('addClient optimistically adds client with temp ID, then replaces with server ID', async () => {
    const { trainerService } = require('../services/trainerService');
    const serverClient = { id: 'server-123', name: 'Ivan', age: 30 };
    trainerService.addClient.mockResolvedValueOnce(serverClient);

    await useTrainerStore.getState().addClient({ name: 'Ivan', age: 30 });

    const clients = useTrainerStore.getState().clients;
    expect(clients).toHaveLength(1);
    expect(clients[0].id).toBe('server-123');
    expect(clients[0].name).toBe('Ivan');
  });

  test('addClient rolls back on server error', async () => {
    const { trainerService } = require('../services/trainerService');
    trainerService.addClient.mockRejectedValueOnce(new Error('Network error'));

    await useTrainerStore.getState().addClient({ name: 'Ivan' });

    expect(useTrainerStore.getState().clients).toHaveLength(0);
  });

  test('addClient tempId has random suffix to prevent collisions', () => {
    const ids = new Set<string>();
    const { trainerService } = require('../services/trainerService');
    // Reject each call so rollback removes them, but capture temp IDs during optimistic phase
    trainerService.addClient.mockImplementation(() => new Promise((_, reject) => {
      const clients = useTrainerStore.getState().clients;
      clients.forEach((c) => ids.add(c.id));
      reject(new Error('fail'));
    }));

    // Multiple rapid calls should generate unique IDs
    const p1 = useTrainerStore.getState().addClient({ name: 'A' });
    const p2 = useTrainerStore.getState().addClient({ name: 'B' });
    return Promise.allSettled([p1, p2]).then(() => {
      // We can't guarantee collisions don't happen with Date.now() alone
      // but with random suffix they should be unique
      expect(ids.size).toBe(2);
    });
  });

  // ─── updateClient ─────────────────────────────────────────────────────────

  test('updateClient applies optimistic update then confirms on success', async () => {
    useTrainerStore.setState({ clients: [{ id: 'c-1', name: 'Ivan' }] });
    const { trainerService } = require('../services/trainerService');
    trainerService.updateClient.mockResolvedValueOnce({});

    await useTrainerStore.getState().updateClient('c-1', { name: 'Petr' });

    expect(useTrainerStore.getState().clients[0].name).toBe('Petr');
  });

  test('updateClient rolls back to previous value on server error', async () => {
    useTrainerStore.setState({ clients: [{ id: 'c-1', name: 'Ivan', age: 25 }] });
    const { trainerService } = require('../services/trainerService');
    trainerService.updateClient.mockRejectedValueOnce(new Error('Server error'));

    await useTrainerStore.getState().updateClient('c-1', { name: 'Petr' });

    expect(useTrainerStore.getState().clients[0].name).toBe('Ivan');
    expect(useTrainerStore.getState().clients[0].age).toBe(25);
  });

  // ─── deleteClient ─────────────────────────────────────────────────────────

  test('deleteClient removes client and its sessions optimistically', async () => {
    useTrainerStore.setState({
      clients: [{ id: 'c-1', name: 'Ivan' }],
      sessions: [
        { id: 's-1', clientId: 'c-1', date: '2026-04-01', name: 'Workout', durationMinutes: 60 },
        { id: 's-2', clientId: 'c-2', date: '2026-04-01', name: 'Workout', durationMinutes: 45 },
      ],
    });
    const { trainerService } = require('../services/trainerService');
    trainerService.deleteClient.mockResolvedValueOnce(undefined);

    await useTrainerStore.getState().deleteClient('c-1');

    expect(useTrainerStore.getState().clients).toHaveLength(0);
    expect(useTrainerStore.getState().sessions).toHaveLength(1);
    expect(useTrainerStore.getState().sessions[0].clientId).toBe('c-2');
  });

  test('deleteClient rolls back on server error (non-404)', async () => {
    const originalClient = { id: 'c-1', name: 'Ivan' };
    const originalSession = { id: 's-1', clientId: 'c-1', date: '2026-04-01', name: 'Workout', durationMinutes: 60 };
    useTrainerStore.setState({ clients: [originalClient], sessions: [originalSession] });

    const { trainerService } = require('../services/trainerService');
    const err: any = new Error('Server error');
    err.response = { status: 500 };
    trainerService.deleteClient.mockRejectedValueOnce(err);

    await useTrainerStore.getState().deleteClient('c-1');

    expect(useTrainerStore.getState().clients).toHaveLength(1);
    expect(useTrainerStore.getState().sessions).toHaveLength(1);
  });

  test('deleteClient treats 404 as success (already deleted on server)', async () => {
    useTrainerStore.setState({ clients: [{ id: 'c-1', name: 'Ivan' }], sessions: [] });
    const { trainerService } = require('../services/trainerService');
    const err: any = new Error('Not found');
    err.response = { status: 404 };
    trainerService.deleteClient.mockRejectedValueOnce(err);

    await useTrainerStore.getState().deleteClient('c-1');

    // Should NOT rollback on 404
    expect(useTrainerStore.getState().clients).toHaveLength(0);
  });

  // ─── logWorkoutSession ────────────────────────────────────────────────────

  test('logWorkoutSession optimistically adds session, then replaces with server record', async () => {
    const { trainerService } = require('../services/trainerService');
    const serverSession = { id: 'srv-sess-1', clientId: 'c-1', date: '2026-04-20', name: 'Push Day', durationMinutes: 45 };
    trainerService.logSession.mockResolvedValueOnce(serverSession);

    await useTrainerStore.getState().logWorkoutSession({ clientId: 'c-1', date: '2026-04-20', name: 'Push Day', durationMinutes: 45 });

    const sessions = useTrainerStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('srv-sess-1');
  });

  test('logWorkoutSession rolls back temp session on server error', async () => {
    const { trainerService } = require('../services/trainerService');
    trainerService.logSession.mockRejectedValueOnce(new Error('Network error'));

    await useTrainerStore.getState().logWorkoutSession({ clientId: 'c-1', date: '2026-04-20', name: 'Push', durationMinutes: 60 });

    expect(useTrainerStore.getState().sessions).toHaveLength(0);
  });

  // ─── getClientSessions ────────────────────────────────────────────────────

  test('getClientSessions returns sessions for specified client, sorted by date desc', () => {
    useTrainerStore.setState({
      sessions: [
        { id: 's-1', clientId: 'c-1', date: '2026-04-18', name: 'A', durationMinutes: 30 },
        { id: 's-2', clientId: 'c-1', date: '2026-04-20', name: 'B', durationMinutes: 45 },
        { id: 's-3', clientId: 'c-2', date: '2026-04-19', name: 'C', durationMinutes: 60 },
      ],
    });

    const sessions = useTrainerStore.getState().getClientSessions('c-1');
    expect(sessions).toHaveLength(2);
    expect(sessions[0].date).toBe('2026-04-20'); // most recent first
    expect(sessions[1].date).toBe('2026-04-18');
  });

  test('getClientSessions returns empty array for unknown client', () => {
    const sessions = useTrainerStore.getState().getClientSessions('nonexistent');
    expect(sessions).toEqual([]);
  });

  // ─── clearUserData ────────────────────────────────────────────────────────

  test('clearUserData resets all state', () => {
    useTrainerStore.setState({
      clients: [{ id: 'c-1', name: 'Ivan' }],
      sessions: [{ id: 's-1', clientId: 'c-1', date: '2026-04-20', name: 'W', durationMinutes: 30 }],
      isLoading: true,
    });

    useTrainerStore.getState().clearUserData();

    expect(useTrainerStore.getState().clients).toEqual([]);
    expect(useTrainerStore.getState().sessions).toEqual([]);
    expect(useTrainerStore.getState().isLoading).toBe(false);
  });
});
