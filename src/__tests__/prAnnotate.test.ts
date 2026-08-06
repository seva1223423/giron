/**
 * Personal-record badges have to survive a refresh.
 *
 * `isPR` is written when a set is ticked and lives only on the client —
 * WorkoutSet has no such column. fetchHistory replaces every synced workout
 * with the server's copy, so the badges were stripped: the history card's PR
 * count and the calendar's total both fell to zero on the first refresh after
 * a session, and the person's records quietly disappeared.
 *
 * Recomputing also fixes something storing never could: correct an old set
 * downward and the record it used to hold would have stayed marked forever.
 */

import { annotatePRs } from '../utils/prAnnotate';

const set = (id: string, weight: number, reps: number, over: Record<string, unknown> = {}) => ({
  id, setNumber: 1, type: 'normal', weight, reps, completed: true, ...over,
}) as any;

const workout = (id: string, date: string, sets: any[], exerciseId = 'bench') => ({
  id, name: 'Тест', completedAt: date,
  exercises: [{ id: `we-${id}`, exerciseId, order: 0, sets }],
}) as any;

/** Every set id the pass marked as a record. */
const marked = (out: any[]) =>
  out.flatMap((w) => w.exercises.flatMap((e: any) => e.sets.filter((s: any) => s.isPR).map((s: any) => s.id)));

describe('annotatePRs', () => {
  test('the first time an exercise is done is a record', () => {
    const out = annotatePRs([workout('w1', '2026-08-01T10:00:00Z', [set('s1', 60, 10)])]);
    expect(marked(out)).toEqual(['s1']);
  });

  test('a heavier session later is a record, the lighter one is not', () => {
    const out = annotatePRs([
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 100, 5)]),
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 60, 10)]),
    ]);
    expect(marked(out).sort()).toEqual(['s1', 's2']);
  });

  test('a weaker session after a strong one is not a record', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 100, 8)]),
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 60, 8)]),
    ]);
    expect(marked(out)).toEqual(['s1']);
  });

  test('order in the input does not matter, only the dates do', () => {
    // fetchHistory hands this in newest-first; the records are chronological.
    const newestFirst = annotatePRs([
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 60, 8)]),
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 100, 8)]),
    ]);
    expect(marked(newestFirst)).toEqual(['s1']);
  });

  test('records are per exercise, not global', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 200, 5)], 'deadlift'),
      workout('w2', '2026-08-02T10:00:00Z', [set('s2', 60, 5)], 'bench'),
    ]);
    // 60 kg is nothing next to the deadlift, but it is the first bench.
    expect(marked(out).sort()).toEqual(['s1', 's2']);
  });

  test('within one session only the set that beats the bar counts', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [
        set('s1', 80, 8, { setNumber: 1 }),
        set('s2', 100, 8, { setNumber: 2 }),
        set('s3', 90, 8, { setNumber: 3 }),
      ]),
    ]);
    expect(marked(out)).toEqual(['s1', 's2']);
  });

  test('warm-up sets never count', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 500, 1, { type: 'warmup' })]),
    ]);
    expect(marked(out)).toEqual([]);
  });

  test('unfinished sets never count', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 200, 5, { completed: false })]),
    ]);
    expect(marked(out)).toEqual([]);
  });

  test('bodyweight sets never count — there is no load to compare', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 0, 20)]),
    ]);
    expect(marked(out)).toEqual([]);
  });

  test('a stale flag from the server copy is cleared', () => {
    // The whole reason this runs: a flag can arrive wrong, not just missing.
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 100, 8)]),
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 60, 8, { isPR: true })]),
    ]);
    expect(marked(out)).toEqual(['s1']);
  });

  test('equalling a record is not beating it', () => {
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 100, 5)]),
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 100, 5)]),
    ]);
    expect(marked(out)).toEqual(['s1']);
  });

  test('fewer reps at more weight still counts by estimated 1RM', () => {
    // 100×5 ≈ 116, 110×3 ≈ 121 — heavier for fewer reps is a real record.
    const out = annotatePRs([
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 100, 5)]),
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 110, 3)]),
    ]);
    expect(marked(out).sort()).toEqual(['s1', 's2']);
  });

  test('the input is not mutated', () => {
    const input = [workout('w1', '2026-08-01T10:00:00Z', [set('s1', 60, 10)])];
    annotatePRs(input);
    expect(input[0].exercises[0].sets[0].isPR).toBeUndefined();
  });

  test('the returned order matches the input order', () => {
    const out = annotatePRs([
      workout('w2', '2026-08-05T10:00:00Z', [set('s2', 60, 8)]),
      workout('w1', '2026-08-01T10:00:00Z', [set('s1', 100, 8)]),
    ]);
    expect(out.map((w) => w.id)).toEqual(['w2', 'w1']);
  });

  test('survives a workout with no exercises and an exercise with no sets', () => {
    const out = annotatePRs([
      { id: 'w1', name: 'Пусто', completedAt: '2026-08-01T10:00:00Z' } as any,
      { id: 'w2', name: 'Пусто', completedAt: '2026-08-02T10:00:00Z', exercises: [{ id: 'we', exerciseId: 'bench', order: 0 }] } as any,
    ]);
    expect(marked(out)).toEqual([]);
  });
});
