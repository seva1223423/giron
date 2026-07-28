/**
 * Saved templates must reach the server.
 *
 * They used to live in AsyncStorage and nowhere else. The server has had the
 * model the whole time — a Routine is a template — but nothing ever pushed
 * them, so every template a person built existed on exactly one phone.
 * Reinstall, wipe, new device, and it was gone with no way back. That is not
 * hypothetical: it happened during the signing-key change, when the app had
 * to be uninstalled.
 *
 * These tests pin the drain: local first so it works with no signal, server
 * next, and the local copy dropped only once the server confirms.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockCreateRoutine = jest.fn();
jest.mock('../services/workoutService', () => ({
  workoutService: {
    createRoutine: (...args: unknown[]) => mockCreateRoutine(...args),
    getRoutines: jest.fn(() => Promise.resolve([])),
  },
}));

import { useWorkoutStore } from '../store/useWorkoutStore';

const template = (over: Record<string, unknown> = {}) => ({
  id: 'tpl-1',
  name: 'Ноги — база',
  exercises: [
    {
      id: 'we-1',
      exerciseId: 'squat',
      order: 0,
      restSeconds: 120,
      sets: [
        { id: 's1', setNumber: 1, type: 'normal', reps: 8, weight: 100, completed: true },
        { id: 's2', setNumber: 2, type: 'normal', reps: 8, weight: 100, completed: true },
      ],
    },
  ],
  ...over,
}) as any;

beforeEach(() => {
  mockCreateRoutine.mockReset();
  useWorkoutStore.setState({ savedTemplates: [], routines: [] } as any);
});

describe('syncLocalTemplates', () => {
  test('sends a local template to the server and stops keeping it local', async () => {
    mockCreateRoutine.mockResolvedValue({ id: 'r-1', name: 'Ноги — база', exercises: [] });
    useWorkoutStore.setState({ savedTemplates: [template()] } as any);

    await useWorkoutStore.getState().syncLocalTemplates();

    expect(mockCreateRoutine).toHaveBeenCalledTimes(1);
    expect(useWorkoutStore.getState().savedTemplates).toHaveLength(0);
    expect(useWorkoutStore.getState().routines).toHaveLength(1);
  });

  test('carries the exercises, their order and their sets across', async () => {
    mockCreateRoutine.mockResolvedValue({ id: 'r-1', name: 'x', exercises: [] });
    useWorkoutStore.setState({ savedTemplates: [template()] } as any);

    await useWorkoutStore.getState().syncLocalTemplates();

    const sent = mockCreateRoutine.mock.calls[0][0];
    expect(sent.name).toBe('Ноги — база');
    expect(sent.exercises).toHaveLength(1);
    expect(sent.exercises[0].exerciseId).toBe('squat');
    expect(sent.exercises[0].order).toBe(0);
    expect(sent.exercises[0].restSeconds).toBe(120);
    expect(sent.exercises[0].sets).toHaveLength(2);
    // setNumber is renumbered from the array, not trusted from the source —
    // a template built by deleting a middle set would otherwise send 1 and 3.
    expect(sent.exercises[0].sets.map((s: any) => s.setNumber)).toEqual([1, 2]);
    expect(sent.exercises[0].sets[0].weight).toBe(100);
  });

  test('keeps the template when the server cannot be reached', async () => {
    mockCreateRoutine.mockRejectedValue(new Error('offline'));
    useWorkoutStore.setState({ savedTemplates: [template()] } as any);

    await useWorkoutStore.getState().syncLocalTemplates();

    // Dropping it here is exactly the data loss being fixed.
    expect(useWorkoutStore.getState().savedTemplates).toHaveLength(1);
    expect(useWorkoutStore.getState().routines).toHaveLength(0);
  });

  test('stops at the first failure instead of hammering a dead server', async () => {
    mockCreateRoutine.mockRejectedValue(new Error('offline'));
    useWorkoutStore.setState({
      savedTemplates: [template(), template({ id: 'tpl-2' }), template({ id: 'tpl-3' })],
    } as any);

    await useWorkoutStore.getState().syncLocalTemplates();

    expect(mockCreateRoutine).toHaveBeenCalledTimes(1);
    expect(useWorkoutStore.getState().savedTemplates).toHaveLength(3);
  });

  test('does nothing when there is nothing local', async () => {
    await useWorkoutStore.getState().syncLocalTemplates();
    expect(mockCreateRoutine).not.toHaveBeenCalled();
  });

  test('a template with no name still gets one the server will accept', async () => {
    mockCreateRoutine.mockResolvedValue({ id: 'r-1', name: 'Тренировка', exercises: [] });
    useWorkoutStore.setState({ savedTemplates: [template({ name: '' })] } as any);

    await useWorkoutStore.getState().syncLocalTemplates();

    // The server requires min(1) — an empty name would 400 and the template
    // would sit local forever.
    expect(mockCreateRoutine.mock.calls[0][0].name).toBe('Тренировка');
  });
});
