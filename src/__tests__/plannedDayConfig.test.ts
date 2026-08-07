/**
 * A planned day remembers how, not just what.
 *
 * The week plan stored a list of exercise ids and nothing else, so starting a
 * planned day always built 4×10 with no rest — whatever the person had set up
 * when they made the plan. The numbers were invented fresh every morning.
 *
 * `plan` is optional and parallel to `exercises` so every plan saved before it
 * existed still loads and still starts, just with the old defaults.
 */

jest.mock('../utils/startWorkoutSafe', () => ({
  startWorkoutSafe: (...a: unknown[]) => mockStart(...a),
}));
const mockStart = jest.fn();

import { startPlannedDay } from '../utils/startFromPlan';

const EXERCISES = [
  { id: 'squat', name: 'Приседания' },
  { id: 'bench-press', name: 'Жим лёжа' },
] as any;

const started = () => mockStart.mock.calls[0][0];

beforeEach(() => mockStart.mockReset());

describe('startPlannedDay', () => {
  test('uses the sets, reps and rest the day carries', () => {
    startPlannedDay(
      {
        name: 'Ноги',
        emoji: '◎',
        exercises: ['squat'],
        plan: [{ exerciseId: 'squat', sets: 5, reps: 5, restSeconds: 180 }],
      } as any,
      EXERCISES,
      {},
    );

    const ex = started().exercises[0];
    expect(ex.sets).toHaveLength(5);
    expect(ex.sets.every((s: any) => s.reps === 5)).toBe(true);
    expect(ex.restSeconds).toBe(180);
  });

  test('falls back to 4x10 for a plan saved before the field existed', () => {
    startPlannedDay(
      { name: 'Ноги', emoji: '◎', exercises: ['squat'] } as any,
      EXERCISES,
      {},
    );

    const ex = started().exercises[0];
    expect(ex.sets).toHaveLength(4);
    expect(ex.sets[0].reps).toBe(10);
    expect(ex.restSeconds).toBe(0);
  });

  test('configures each exercise on its own', () => {
    startPlannedDay(
      {
        name: 'Верх',
        emoji: '◎',
        exercises: ['squat', 'bench-press'],
        plan: [
          { exerciseId: 'squat', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'bench-press', sets: 5, reps: 3, restSeconds: 240 },
        ],
      } as any,
      EXERCISES,
      {},
    );

    const [a, b] = started().exercises;
    expect(a.sets).toHaveLength(3);
    expect(b.sets).toHaveLength(5);
    expect(b.sets[0].reps).toBe(3);
    expect(b.restSeconds).toBe(240);
  });

  test('an exercise missing from the config keeps the defaults', () => {
    startPlannedDay(
      {
        name: 'Верх',
        emoji: '◎',
        exercises: ['squat', 'bench-press'],
        plan: [{ exerciseId: 'squat', sets: 5, reps: 5, restSeconds: 180 }],
      } as any,
      EXERCISES,
      {},
    );

    // A half-configured day must not drop the exercise it says nothing about.
    const [, b] = started().exercises;
    expect(b.sets).toHaveLength(4);
    expect(b.sets[0].reps).toBe(10);
  });

  test('set numbers stay sequential whatever the count', () => {
    startPlannedDay(
      {
        name: 'Ноги',
        emoji: '◎',
        exercises: ['squat'],
        plan: [{ exerciseId: 'squat', sets: 6, reps: 8, restSeconds: 90 }],
      } as any,
      EXERCISES,
      {},
    );

    expect(started().exercises[0].sets.map((s: any) => s.setNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('a day pointing at a routine is handed back for the caller to start', () => {
    const r = startPlannedDay(
      { name: 'Ноги', emoji: '◎', exercises: [], routineId: 'r-1' } as any,
      EXERCISES,
      {},
    );
    // Routines already carry their own sets and reps; that path is async and
    // belongs to the caller.
    expect(r.status).toBe('routine');
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('a day the coach planned by name', () => {
  // set_weekly_plan stores exercise NAMES ("Жим лёжа"), deliberately, so the
  // AI context reads well. Manual flows store ids ("bench-press"). Resolution
  // matched only ids, so every AI-created day collapsed to zero exercises and
  // the person tapping "Начать тренировку" got "Упражнения не найдены —
  // план ссылается на удалённые упражнения". The coach's whole
  // build-a-programme flow died at the moment of truth.
  test('starts by exact name', () => {
    const r = startPlannedDay(
      { name: 'Грудь', emoji: '◎', exercises: ['Жим лёжа'] } as any,
      EXERCISES,
      {},
    );
    expect(r.status).toBe('started');
    expect(started().exercises[0].exercise.id).toBe('bench-press');
  });

  test('name matching ignores case', () => {
    startPlannedDay(
      { name: 'Грудь', emoji: '◎', exercises: ['жим лёжа'] } as any,
      EXERCISES,
      {},
    );
    expect(started().exercises[0].exercise.id).toBe('bench-press');
  });

  test('an exact name beats a substring of another exercise', () => {
    const catalogue = [
      { id: 'bench-press-incline', name: 'Жим лёжа на наклонной' },
      { id: 'bench-press', name: 'Жим лёжа' },
    ] as any;
    startPlannedDay(
      { name: 'Грудь', emoji: '◎', exercises: ['Жим лёжа'] } as any,
      catalogue,
      {},
    );
    expect(started().exercises[0].exercise.id).toBe('bench-press');
  });

  test('ids keep working — the manual flows are untouched', () => {
    const r = startPlannedDay(
      { name: 'Ноги', emoji: '◎', exercises: ['squat'] } as any,
      EXERCISES,
      {},
    );
    expect(r.status).toBe('started');
    expect(started().exercises[0].exercise.id).toBe('squat');
  });

  test('per-exercise config is honoured when keyed by name too', () => {
    startPlannedDay(
      {
        name: 'Грудь', emoji: '◎', exercises: ['Жим лёжа'],
        plan: [{ exerciseId: 'Жим лёжа', sets: 5, reps: 5, restSeconds: 180 }],
      } as any,
      EXERCISES,
      {},
    );
    const ex = started().exercises[0];
    expect(ex.sets).toHaveLength(5);
    expect(ex.restSeconds).toBe(180);
  });

  test('a name that resolves to nothing still reports missing', () => {
    const r = startPlannedDay(
      { name: 'Грудь', emoji: '◎', exercises: ['Несуществующее упражнение'] } as any,
      EXERCISES,
      {},
    );
    expect(r.status).toBe('missing');
  });
});
