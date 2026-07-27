/**
 * Performance sanity for the design-layer pure helpers. We can't
 * measure actual render time without a test harness, but we can
 * assert the pure-function helpers stay O(n) or better and don't
 * silently degrade.
 */

import {
  buildWeekDotsFromHistory,
  findHeaviestPR,
  deriveWeekPlanDays,
} from '../utils/homeDerivations';
import { normalizeWeekDots, clampProgress } from '../utils/layout';
import { findLiveSet } from '../screens/tracker/components/heroLogic';

// ─── Time budget for pure helpers ──────────────────────────────────────────

describe('Pure helper performance budgets', () => {
  // These aren't precise benchmarks (jest env varies) but they catch
  // accidental O(n²) slippage. If any helper takes >100ms on realistic
  // inputs, something's off.
  //
  // TIMING_HEADROOM: the raw budgets below are the *real* expected cost, but
  // on a loaded machine (several jest workers, CI, a laptop on battery) a
  // microsecond-scale helper easily measures 100ms+. That flakiness used to
  // paint the build red for no reason — deriveWeekPlanDays failed at 65ms
  // against a 50ms budget with nothing wrong (audit R45). ~20x slack keeps
  // these honest about catastrophic regressions and quiet about noise.
  const TIMING_HEADROOM = 20;

  // The two 10 000-item tests exist specifically to catch an accidental O(n²)
  // pass, and 20x slack defeats that: a quadratic walk over 10 000 items
  // measures several hundred ms, which the wide budget would wave through.
  // A linear pass over 10 000 items stays under ~5ms even on a loaded machine,
  // so 4x still absorbs scheduler noise while failing on quadratic behaviour.
  const SCALE_HEADROOM = 4;

  test('buildWeekDotsFromHistory with 1000-item history runs fast', () => {
    const history = Array.from({ length: 1000 }, (_, i) => ({
      completedAt: new Date(Date.now() - i * 86400000).toISOString(),
    }));
    const start = Date.now();
    for (let i = 0; i < 100; i++) buildWeekDotsFromHistory(history);
    const elapsed = Date.now() - start;
    // 100 runs × 1000 items × "some some"-ish loop = O(100k). Budget 1s.
    expect(elapsed).toBeLessThan(1000 * TIMING_HEADROOM);
  });

  test('findHeaviestPR with 1000 workouts × 10 exercises × 10 sets runs fast', () => {
    const history = Array.from({ length: 100 }, () => ({
      exercises: Array.from({ length: 10 }, () => ({
        exercise: { name: 'X' },
        sets: Array.from({ length: 10 }, () => ({
          completed: true,
          weight: Math.random() * 200,
        })),
      })),
    } as any));
    const start = Date.now();
    findHeaviestPR(history);
    const elapsed = Date.now() - start;
    // 100 × 10 × 10 = 10k iterations; should be < 50ms
    expect(elapsed).toBeLessThan(500 * TIMING_HEADROOM);
  });

  test('deriveWeekPlanDays constant-time over history size', () => {
    // Only iterates weekPlan keys 0..6, plus some.every(history) for
    // each past day. Scales with history size, not plan size.
    const hugeHistory = Array.from({ length: 5000 }, () => ({
      completedAt: new Date().toISOString(),
    }));
    const start = Date.now();
    for (let i = 0; i < 10; i++) deriveWeekPlanDays({}, hugeHistory);
    expect(Date.now() - start).toBeLessThan(500 * TIMING_HEADROOM);
  });

  test('normalizeWeekDots handles 10000-item input quickly', () => {
    const huge = Array.from({ length: 10000 }, () => 1 as 0 | 1);
    const start = Date.now();
    const result = normalizeWeekDots(huge);
    expect(result.length).toBe(7);
    expect(Date.now() - start).toBeLessThan(200 * SCALE_HEADROOM);
  });

  test('clampProgress is constant-time per call', () => {
    const start = Date.now();
    for (let i = 0; i < 100000; i++) clampProgress(Math.random() * 2);
    expect(Date.now() - start).toBeLessThan(500 * TIMING_HEADROOM);
  });

  test('findLiveSet with 10000 sets resolves quickly', () => {
    const sets = Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      setNumber: i,
      type: 'normal' as const,
      completed: i < 5000,
    } as any));
    const start = Date.now();
    const r = findLiveSet(sets);
    expect(r?.index).toBe(5000);
    expect(Date.now() - start).toBeLessThan(50 * SCALE_HEADROOM);
  });
});

// ─── Memoization-friendly outputs ──────────────────────────────────────────

describe('Helpers return stable shapes (React memo friendly)', () => {
  test('deriveWeekPlanDays returns new array per call', () => {
    // Required: we set array-identity output so consumers can rely on
    // reference equality not breaking (arrays are always new).
    const out1 = deriveWeekPlanDays({}, []);
    const out2 = deriveWeekPlanDays({}, []);
    expect(out1).not.toBe(out2); // different references
    expect(out1).toEqual(out2); // but same values
  });

  test('buildWeekDotsFromHistory output shape stable', () => {
    const out = buildWeekDotsFromHistory([]);
    // Exactly 7 elements of 0
    expect(out).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // Every element is 0 (proper narrowing test)
    for (const d of out) {
      expect(typeof d).toBe('number');
    }
  });
});
