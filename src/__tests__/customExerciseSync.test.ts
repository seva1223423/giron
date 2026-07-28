/**
 * Exercises a person adds themselves must survive the phone.
 *
 * They used to live in AsyncStorage and nowhere else, so a reinstall erased
 * them — and every past workout that referenced one lost the name of what was
 * actually done, leaving a history entry pointing at nothing.
 *
 * The server keeps them now, on a route deliberately separate from the shared
 * catalogue: GET /workouts/exercises is cached under one global key, so
 * folding per-user rows into it would serve one person's private exercises to
 * everybody else.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockGet = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
jest.mock('../services/workoutService', () => ({
  workoutService: {
    getCustomExercises: (...a: unknown[]) => mockGet(...a),
    createCustomExercise: (...a: unknown[]) => mockCreate(...a),
    deleteCustomExercise: (...a: unknown[]) => mockDelete(...a),
    getRoutines: jest.fn(() => Promise.resolve([])),
    createRoutine: jest.fn(),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';

const local = (over: Record<string, unknown> = {}) => ({
  id: 'custom-1699000000',
  name: 'Тяга к поясу в наклоне',
  description: '',
  instructions: [],
  primaryMuscles: ['back'],
  secondaryMuscles: [],
  type: 'barbell',
  category: 'strength',
  difficulty: 'intermediate',
  ...over,
}) as any;

const remote = (over: Record<string, unknown> = {}) => ({
  ...local(),
  id: 'clx0000000000000000000000',
  ...over,
}) as any;

beforeEach(() => {
  mockGet.mockReset();
  mockCreate.mockReset();
  mockDelete.mockReset();
  useWorkoutStore.setState({ customExercises: [] } as any);
});

describe('syncCustomExercises', () => {
  test('pushes an exercise that only existed on this phone', async () => {
    mockGet.mockResolvedValue([]);
    mockCreate.mockResolvedValue(remote());
    useWorkoutStore.setState({ customExercises: [local()] } as any);

    await useWorkoutStore.getState().syncCustomExercises();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].name).toBe('Тяга к поясу в наклоне');
    // The server's row replaces the local one, ids and all.
    expect(useWorkoutStore.getState().customExercises[0].id).toMatch(/^clx/);
  });

  test('does not push one the server already has', async () => {
    mockGet.mockResolvedValue([remote()]);
    useWorkoutStore.setState({ customExercises: [local()] } as any);

    await useWorkoutStore.getState().syncCustomExercises();

    // Matched by name — the local id is a client-side stamp and never matches.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(useWorkoutStore.getState().customExercises).toHaveLength(1);
  });

  test('brings down exercises added on another device', async () => {
    mockGet.mockResolvedValue([remote({ name: 'Жим Арнольда' })]);

    await useWorkoutStore.getState().syncCustomExercises();

    expect(useWorkoutStore.getState().customExercises).toHaveLength(1);
    expect(useWorkoutStore.getState().customExercises[0].name).toBe('Жим Арнольда');
  });

  test('keeps local rows when the server is unreachable', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    useWorkoutStore.setState({ customExercises: [local()] } as any);

    await useWorkoutStore.getState().syncCustomExercises();

    // Wiping them here would be the data loss this whole change exists to fix.
    expect(useWorkoutStore.getState().customExercises).toHaveLength(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('stops pushing after the first refusal', async () => {
    mockGet.mockResolvedValue([]);
    mockCreate.mockRejectedValue(new Error('boom'));
    useWorkoutStore.setState({
      customExercises: [local(), local({ id: 'custom-2', name: 'Б' }), local({ id: 'custom-3', name: 'В' })],
    } as any);

    await useWorkoutStore.getState().syncCustomExercises();

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('fills in the fields the server insists on', async () => {
    mockGet.mockResolvedValue([]);
    mockCreate.mockResolvedValue(remote());
    useWorkoutStore.setState({
      customExercises: [local({ type: undefined, category: undefined, difficulty: undefined })],
    } as any);

    await useWorkoutStore.getState().syncCustomExercises();

    // These three are required by the route's schema; a half-filled local
    // exercise would 400 forever and never leave the phone.
    const sent = mockCreate.mock.calls[0][0];
    expect(sent.type).toBeTruthy();
    expect(sent.category).toBeTruthy();
    expect(sent.difficulty).toBeTruthy();
  });
});

describe('deleteCustomExercise', () => {
  test('removes it locally and on the server', () => {
    mockDelete.mockResolvedValue(undefined);
    useWorkoutStore.setState({ customExercises: [remote()] } as any);

    useWorkoutStore.getState().deleteCustomExercise('clx0000000000000000000000');

    expect(useWorkoutStore.getState().customExercises).toHaveLength(0);
    // Without the server call the next sync would bring it straight back.
    expect(mockDelete).toHaveBeenCalledWith('clx0000000000000000000000');
  });

  test('calls the server once, not once per state update', () => {
    mockDelete.mockResolvedValue(undefined);
    useWorkoutStore.setState({ customExercises: [remote()] } as any);

    useWorkoutStore.getState().deleteCustomExercise('clx0000000000000000000000');

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
