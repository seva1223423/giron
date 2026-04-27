/**
 * Unit tests for the trainer invite flow actions on useTrainerStore
 * (Product-01 frontend).
 *
 * Complements server-side trainer_invite.test.ts — verifies that the
 * mobile store correctly:
 *   - optimistically patches the local roster on invite generation,
 *   - returns structured {trainerClientId, trainerId, displayName} on
 *     successful acceptance,
 *   - preserves server error codes (INVITE_NOT_FOUND / ALREADY_USED /
 *     SELF_INVITE / ALREADY_CLIENT) so UI can render localized copy,
 *   - optimistically clears linkage on disconnect and rolls back on
 *     server failure without clobbering concurrent edits.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/trainerService', () => ({
  trainerService: {
    getClients: jest.fn(() => Promise.resolve([])),
    addClient: jest.fn(),
    updateClient: jest.fn(),
    deleteClient: jest.fn(),
    getSessions: jest.fn(() => Promise.resolve([])),
    logSession: jest.fn(),
    deleteSession: jest.fn(),
    generateInvite: jest.fn(),
    acceptInvite: jest.fn(),
    disconnectClient: jest.fn(),
    getMyTrainers: jest.fn(() => Promise.resolve([])),
    leaveTrainer: jest.fn(),
  },
}));

import { useTrainerStore, type TrainerClient } from '../store/useTrainerStore';
import { trainerService } from '../services/trainerService';

const mockGenerateInvite = trainerService.generateInvite as jest.Mock;
const mockAcceptInvite = trainerService.acceptInvite as jest.Mock;
const mockDisconnect = trainerService.disconnectClient as jest.Mock;
const mockGetMyTrainers = trainerService.getMyTrainers as jest.Mock;
const mockLeaveTrainer = trainerService.leaveTrainer as jest.Mock;

const baseClient = (overrides: Partial<TrainerClient> = {}): TrainerClient => ({
  id: 'c-1',
  name: 'Ivan Petrov',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  useTrainerStore.setState({ clients: [], sessions: [], isLoading: false, myTrainers: [] });
  // Default: getMyTrainers returns empty so background refresh after
  // acceptInvite doesn't race other tests' mocks.
  mockGetMyTrainers.mockResolvedValue([]);
});

describe('generateInvite — happy path', () => {
  test('returns the code and optimistically patches the row', async () => {
    useTrainerStore.setState({ clients: [baseClient({ id: 'c-1' })] });
    mockGenerateInvite.mockResolvedValueOnce({ code: 'ABCDEF2345' });

    const result = await useTrainerStore.getState().generateInvite('c-1');

    expect(result).toEqual({ code: 'ABCDEF2345' });
    const row = useTrainerStore.getState().clients.find((c) => c.id === 'c-1')!;
    expect(row.inviteCode).toBe('ABCDEF2345');
    expect(row.invitedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
  });

  test('returns null on network failure and leaves roster untouched', async () => {
    useTrainerStore.setState({ clients: [baseClient({ id: 'c-1' })] });
    mockGenerateInvite.mockRejectedValueOnce(new Error('network'));

    const result = await useTrainerStore.getState().generateInvite('c-1');

    expect(result).toBeNull();
    const row = useTrainerStore.getState().clients.find((c) => c.id === 'c-1')!;
    expect(row.inviteCode).toBeUndefined();
    expect(row.invitedAt).toBeUndefined();
  });

  test('does not mutate other rows when patching one', async () => {
    useTrainerStore.setState({
      clients: [baseClient({ id: 'c-1' }), baseClient({ id: 'c-2', name: 'Petr' })],
    });
    mockGenerateInvite.mockResolvedValueOnce({ code: 'WXYZPQ7823' });

    await useTrainerStore.getState().generateInvite('c-1');

    const other = useTrainerStore.getState().clients.find((c) => c.id === 'c-2')!;
    expect(other.inviteCode).toBeUndefined();
    expect(other.name).toBe('Petr');
  });
});

describe('acceptInvite — happy path', () => {
  test('returns structured link info on success', async () => {
    mockAcceptInvite.mockResolvedValueOnce({
      success: true,
      trainerClientId: 'c-1',
      trainerId: 'u-trainer',
      displayName: 'Ivan Petrov',
    });

    const result = await useTrainerStore.getState().acceptInvite('ABCDEF2345');

    expect(result).toEqual({
      trainerClientId: 'c-1',
      trainerId: 'u-trainer',
      displayName: 'Ivan Petrov',
    });
  });
});

describe('acceptInvite — error mapping', () => {
  const errorCases = [
    { serverCode: 'INVITE_NOT_FOUND', serverError: 'Код не найден', expectCode: 'INVITE_NOT_FOUND' },
    { serverCode: 'INVITE_ALREADY_USED', serverError: 'Уже использован', expectCode: 'INVITE_ALREADY_USED' },
    { serverCode: 'SELF_INVITE', serverError: 'Свой код', expectCode: 'SELF_INVITE' },
    { serverCode: 'ALREADY_CLIENT', serverError: 'Уже клиент', expectCode: 'ALREADY_CLIENT' },
  ];

  test.each(errorCases)('preserves server code "$serverCode"', async ({ serverCode, serverError, expectCode }) => {
    mockAcceptInvite.mockRejectedValueOnce({
      response: { data: { code: serverCode, error: serverError } },
    });

    const result = await useTrainerStore.getState().acceptInvite('ABCDEF2345');

    expect(result).toEqual({ error: serverError, code: expectCode });
  });

  test('falls back to generic error on network timeout (no response)', async () => {
    mockAcceptInvite.mockRejectedValueOnce(new Error('timeout'));

    const result = await useTrainerStore.getState().acceptInvite('ABCDEF2345');

    expect(result).toEqual({
      error: 'Не удалось принять приглашение',
      code: undefined,
    });
  });

  test('falls back to generic error when server sends no body', async () => {
    mockAcceptInvite.mockRejectedValueOnce({ response: { data: null } });

    const result = await useTrainerStore.getState().acceptInvite('ABCDEF2345');

    expect((result as { error: string }).error).toBe('Не удалось принять приглашение');
  });
});

describe('myTrainers — fetch / leave / sync after accept', () => {
  test('fetchMyTrainers populates list from server', async () => {
    mockGetMyTrainers.mockResolvedValueOnce([
      {
        trainerClientId: 'tc-1',
        acceptedAt: '2026-04-22T10:00:00Z',
        trainerId: 'u-trainer-1',
        firstName: 'Stas',
        lastName: 'Trainer',
        avatarUrl: null,
      },
    ]);

    await useTrainerStore.getState().fetchMyTrainers();

    expect(useTrainerStore.getState().myTrainers).toHaveLength(1);
    expect(useTrainerStore.getState().myTrainers[0].firstName).toBe('Stas');
  });

  test('fetchMyTrainers swallows errors and keeps stale list', async () => {
    useTrainerStore.setState({
      myTrainers: [{
        trainerClientId: 'tc-1',
        acceptedAt: '2026-04-22T10:00:00Z',
        trainerId: 'u-trainer-1',
        firstName: 'Stas',
        lastName: null,
        avatarUrl: null,
      }],
    });
    mockGetMyTrainers.mockRejectedValueOnce(new Error('offline'));

    await useTrainerStore.getState().fetchMyTrainers();

    // Stale entry preserved — offline users still see their trainer.
    expect(useTrainerStore.getState().myTrainers).toHaveLength(1);
  });

  test('successful acceptInvite triggers background myTrainers refresh', async () => {
    mockAcceptInvite.mockResolvedValueOnce({
      success: true,
      trainerClientId: 'tc-2',
      trainerId: 'u-trainer-2',
      displayName: 'Petr',
    });
    mockGetMyTrainers.mockResolvedValueOnce([
      {
        trainerClientId: 'tc-2',
        acceptedAt: '2026-04-22T10:00:00Z',
        trainerId: 'u-trainer-2',
        firstName: 'Petr',
        lastName: null,
        avatarUrl: null,
      },
    ]);

    const result = await useTrainerStore.getState().acceptInvite('ABCDEF2345');

    expect((result as any).trainerClientId).toBe('tc-2');
    // Drain pending microtask so the store-side `.then()` fires.
    await Promise.resolve();
    await Promise.resolve();
    expect(useTrainerStore.getState().myTrainers).toHaveLength(1);
    expect(mockGetMyTrainers).toHaveBeenCalledTimes(1);
  });

  test('failed acceptInvite does NOT trigger refresh', async () => {
    mockAcceptInvite.mockRejectedValueOnce({
      response: { data: { code: 'INVITE_NOT_FOUND', error: 'no' } },
    });

    await useTrainerStore.getState().acceptInvite('ABCDEF2345');

    expect(mockGetMyTrainers).not.toHaveBeenCalled();
  });

  test('leaveTrainer optimistically removes link and persists on success', async () => {
    useTrainerStore.setState({
      myTrainers: [
        {
          trainerClientId: 'tc-1',
          acceptedAt: '2026-04-22T10:00:00Z',
          trainerId: 'u-trainer-1',
          firstName: 'Stas',
          lastName: null,
          avatarUrl: null,
        },
        {
          trainerClientId: 'tc-2',
          acceptedAt: '2026-04-22T10:00:00Z',
          trainerId: 'u-trainer-2',
          firstName: 'Petr',
          lastName: null,
          avatarUrl: null,
        },
      ],
    });
    mockLeaveTrainer.mockResolvedValueOnce(undefined);

    await useTrainerStore.getState().leaveTrainer('tc-1');

    const remaining = useTrainerStore.getState().myTrainers;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].trainerClientId).toBe('tc-2');
  });

  test('leaveTrainer rolls back on server failure', async () => {
    const original = [{
      trainerClientId: 'tc-1',
      acceptedAt: '2026-04-22T10:00:00Z',
      trainerId: 'u-trainer-1',
      firstName: 'Stas',
      lastName: null,
      avatarUrl: null,
    }];
    useTrainerStore.setState({ myTrainers: original });
    mockLeaveTrainer.mockRejectedValueOnce(new Error('500'));

    await useTrainerStore.getState().leaveTrainer('tc-1');

    expect(useTrainerStore.getState().myTrainers).toHaveLength(1);
    expect(useTrainerStore.getState().myTrainers[0].trainerClientId).toBe('tc-1');
  });
});

describe('disconnectLink — optimistic + rollback', () => {
  test('clears linkage fields immediately and commits on server success', async () => {
    useTrainerStore.setState({
      clients: [baseClient({
        id: 'c-1',
        inviteCode: 'ABCDEF2345',
        invitedAt: '2026-04-22T10:00:00Z',
        acceptedAt: '2026-04-22T10:05:00Z',
        clientUserId: 'u-client',
      })],
    });
    mockDisconnect.mockResolvedValueOnce(undefined);

    await useTrainerStore.getState().disconnectLink('c-1');

    const row = useTrainerStore.getState().clients.find((c) => c.id === 'c-1')!;
    expect(row.inviteCode).toBeNull();
    expect(row.invitedAt).toBeNull();
    expect(row.acceptedAt).toBeNull();
    expect(row.clientUserId).toBeNull();
  });

  test('rolls back to prev state on server failure', async () => {
    const linkedState: TrainerClient = {
      id: 'c-1',
      name: 'Ivan',
      inviteCode: 'ABCDEF2345',
      invitedAt: '2026-04-22T10:00:00Z',
      acceptedAt: '2026-04-22T10:05:00Z',
      clientUserId: 'u-client',
    };
    useTrainerStore.setState({ clients: [linkedState] });
    mockDisconnect.mockRejectedValueOnce(new Error('network'));

    await useTrainerStore.getState().disconnectLink('c-1');

    const row = useTrainerStore.getState().clients.find((c) => c.id === 'c-1')!;
    expect(row).toEqual(linkedState);
  });

  test('rollback does not clobber a concurrent edit on a different slot', async () => {
    useTrainerStore.setState({
      clients: [
        baseClient({ id: 'c-1', acceptedAt: '2026-04-22T10:00:00Z', clientUserId: 'u-c1' }),
        baseClient({ id: 'c-2', name: 'Petr' }),
      ],
    });
    let resolveDisconnect!: () => void;
    mockDisconnect.mockImplementationOnce(
      () => new Promise<void>((_, reject) => { resolveDisconnect = () => reject(new Error('network')); }),
    );

    // Fire disconnect on c-1 — it will reject below.
    const pending = useTrainerStore.getState().disconnectLink('c-1');
    // Meanwhile, an independent mutation updates c-2.
    useTrainerStore.setState((s) => ({
      clients: s.clients.map((c) => (c.id === 'c-2' ? { ...c, name: 'Petr Updated' } : c)),
    }));
    // Now let the disconnect fail.
    resolveDisconnect();
    await pending;

    const c1 = useTrainerStore.getState().clients.find((c) => c.id === 'c-1')!;
    const c2 = useTrainerStore.getState().clients.find((c) => c.id === 'c-2')!;

    // c-1 rolled back to its linked state…
    expect(c1.acceptedAt).toBe('2026-04-22T10:00:00Z');
    expect(c1.clientUserId).toBe('u-c1');
    // …while the concurrent c-2 edit is preserved.
    expect(c2.name).toBe('Petr Updated');
  });
});
