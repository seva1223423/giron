import { Workout, WorkoutExercise } from '../types';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  category: 'workout' | 'strength' | 'streak' | 'nutrition' | 'exploration' | 'recovery';
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;   // 0–1 for partial progress
  progressLabel?: string; // e.g. "7 / 30"
}

export interface AchievementDefinition {
  id: string;
  emoji: string;
  title: string;
  description: string;
  category: Achievement['category'];
  check: (data: AchievementData) => { unlocked: boolean; progress?: number; progressLabel?: string };
}

export interface AchievementData {
  workoutHistory: Workout[];
  nutritionDaysLogged: number; // distinct dates with at least 1 meal
  currentStreak: number;
  /** R240: optional watch/recovery signals — all fields nullable so
   *  the achievements degrade gracefully when no watch is paired. */
  sleepEntries?: Array<{ date: string; durationHours: number; quality?: number | null }>;
  /** Cardio sessions that came from a non-MANUAL source (watch). */
  watchCardioCount?: number;
  /** Latest VO₂max value from any source. */
  latestVo2Max?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalWorkouts(history: Workout[]) {
  return history.filter((w) => w.completedAt).length;
}

function uniqueExerciseIds(history: Workout[]): Set<string> {
  const ids = new Set<string>();
  history.forEach((w) => w.exercises.forEach((e) => ids.add(e.exerciseId)));
  return ids;
}

function totalVolume(history: Workout[]): number {
  return history.reduce((sum, w) => {
    const vol = w.exercises.reduce((s, ex) =>
      s + ex.sets.reduce((ss, set) => ss + (set.completed ? (set.weight || 0) * (set.reps || 0) : 0), 0), 0);
    return sum + vol;
  }, 0);
}

/** Returns max weight ever lifted in one set for given exercise IDs */
function maxWeightForExercises(history: Workout[], exerciseIds: string[]): number {
  let max = 0;
  history.forEach((w) =>
    w.exercises
      .filter((e) => exerciseIds.includes(e.exerciseId))
      .forEach((e) =>
        e.sets.forEach((s) => {
          if (s.completed && (s.weight || 0) > max) max = s.weight || 0;
        })
      )
  );
  return max;
}

/** Estimated 1RM: weight * (1 + reps/30) — Epley */
function best1RM(history: Workout[], exerciseIds: string[]): number {
  let best = 0;
  history.forEach((w) =>
    w.exercises
      .filter((e) => exerciseIds.includes(e.exerciseId))
      .forEach((e) =>
        e.sets.forEach((s) => {
          if (s.completed && s.weight && s.reps) {
            const est = s.weight * (1 + s.reps / 30);
            if (est > best) best = est;
          }
        })
      )
  );
  return Math.round(best);
}

/** Count workouts in last N calendar days */
function workoutsInLastDays(history: Workout[], days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return history.filter((w) => w.completedAt && new Date(w.completedAt) >= cutoff).length;
}

/** Count morning workouts (before 9:00) */
function morningWorkouts(history: Workout[]): number {
  return history.filter((w) => {
    if (!w.startedAt) return false;
    const h = new Date(w.startedAt).getHours();
    return h < 9;
  }).length;
}

/** Count evening workouts (21:00+) */
function eveningWorkouts(history: Workout[]): number {
  return history.filter((w) => {
    if (!w.startedAt) return false;
    const h = new Date(w.startedAt).getHours();
    return h >= 21;
  }).length;
}

/** Workout count in latest calendar month */
function workoutsThisMonth(history: Workout[]): number {
  const now = new Date();
  return history.filter((w) => {
    if (!w.completedAt) return false;
    const d = new Date(w.completedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

/** Workouts on Saturday or Sunday (locale-agnostic — getDay() 0=Sun, 6=Sat) */
function weekendWorkouts(history: Workout[]): number {
  return history.filter((w) => {
    if (!w.completedAt) return false;
    const d = new Date(w.completedAt).getDay();
    return d === 0 || d === 6;
  }).length;
}

/** Total completed sets across all completed workouts */
function totalCompletedSets(history: Workout[]): number {
  return history.reduce((sum, w) => {
    if (!w.completedAt) return sum;
    return sum + w.exercises.reduce((s, ex) => s + ex.sets.filter((set) => set.completed).length, 0);
  }, 0);
}

/** Total completed reps across all completed workouts */
function totalCompletedReps(history: Workout[]): number {
  return history.reduce((sum, w) => {
    if (!w.completedAt) return sum;
    return sum + w.exercises.reduce((s, ex) =>
      s + ex.sets.reduce((ss, set) => ss + (set.completed ? (set.reps || 0) : 0), 0), 0);
  }, 0);
}

/** Single-workout volume — max across all completed workouts */
function maxSingleWorkoutVolume(history: Workout[]): number {
  let best = 0;
  for (const w of history) {
    if (!w.completedAt) continue;
    const vol = w.exercises.reduce((s, ex) =>
      s + ex.sets.reduce((ss, set) => ss + (set.completed ? (set.weight || 0) * (set.reps || 0) : 0), 0), 0);
    if (vol > best) best = vol;
  }
  return best;
}

/** Longest workout duration in minutes (max across history) */
function longestWorkoutMinutes(history: Workout[]): number {
  let best = 0;
  for (const w of history) {
    if (!w.completedAt || !w.durationMinutes) continue;
    if (w.durationMinutes > best) best = w.durationMinutes;
  }
  return best;
}

// ─── SQUAT / BENCH / DEADLIFT exercise IDs ────────────────────────────────────
const SQUAT_IDS = ['squat', 'hack-squat'];
const BENCH_IDS = ['bench-press', 'incline-bench-press', 'close-grip-bench'];
const DEADLIFT_IDS = ['deadlift', 'romanian-deadlift'];
const BIG3_IDS = [...SQUAT_IDS, ...BENCH_IDS, ...DEADLIFT_IDS];

// ─── Achievement Definitions ──────────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // ── Workout count ──
  {
    id: 'first_workout',
    emoji: '◎',
    title: 'Первый шаг',
    description: 'Завершить первую тренировку',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 1, progress: Math.min(n, 1), progressLabel: `${Math.min(n, 1)} / 1` };
    },
  },
  {
    id: 'workouts_5',
    emoji: '◉',
    title: 'Разогрев',
    description: '5 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 5, progress: Math.min(n / 5, 1), progressLabel: `${Math.min(n, 5)} / 5` };
    },
  },
  {
    id: 'workouts_10',
    emoji: '◉',
    title: 'Втянулся',
    description: '10 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 10, progress: Math.min(n / 10, 1), progressLabel: `${Math.min(n, 10)} / 10` };
    },
  },
  {
    id: 'workouts_25',
    emoji: '◈',
    title: 'Завсегдатай',
    description: '25 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 25, progress: Math.min(n / 25, 1), progressLabel: `${Math.min(n, 25)} / 25` };
    },
  },
  {
    id: 'workouts_50',
    emoji: '◈',
    title: 'Полтинник',
    description: '50 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 50, progress: Math.min(n / 50, 1), progressLabel: `${Math.min(n, 50)} / 50` };
    },
  },
  {
    id: 'workouts_100',
    emoji: '◧',
    title: 'Сотня',
    description: '100 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 100, progress: Math.min(n / 100, 1), progressLabel: `${Math.min(n, 100)} / 100` };
    },
  },
  {
    id: 'workouts_250',
    emoji: '◨',
    title: 'Тяжеловес',
    description: '250 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 250, progress: Math.min(n / 250, 1), progressLabel: `${Math.min(n, 250)} / 250` };
    },
  },
  {
    id: 'workouts_500',
    emoji: '◫',
    title: 'Ветеран зала',
    description: '500 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 500, progress: Math.min(n / 500, 1), progressLabel: `${Math.min(n, 500)} / 500` };
    },
  },
  {
    id: 'workouts_1000',
    emoji: '◪',
    title: 'Легенда',
    description: '1000 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 1000, progress: Math.min(n / 1000, 1), progressLabel: `${Math.min(n, 1000)} / 1000` };
    },
  },
  {
    id: 'workouts_month',
    emoji: '◫',
    title: 'Железный месяц',
    description: '20+ тренировок за один календарный месяц',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = workoutsThisMonth(workoutHistory);
      return { unlocked: n >= 20, progress: Math.min(n / 20, 1), progressLabel: `${Math.min(n, 20)} / 20` };
    },
  },

  // ── Streak ──
  {
    id: 'streak_3',
    emoji: '○',
    title: 'На старте',
    description: '3 дня серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 3,
      progress: Math.min(currentStreak / 3, 1),
      progressLabel: `${Math.min(currentStreak, 3)} / 3`,
    }),
  },
  {
    id: 'streak_7',
    emoji: '●',
    title: 'Неделя огня',
    description: '7 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 7,
      progress: Math.min(currentStreak / 7, 1),
      progressLabel: `${Math.min(currentStreak, 7)} / 7`,
    }),
  },
  {
    id: 'streak_14',
    emoji: '◐',
    title: 'Полмесяца',
    description: '14 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 14,
      progress: Math.min(currentStreak / 14, 1),
      progressLabel: `${Math.min(currentStreak, 14)} / 14`,
    }),
  },
  {
    id: 'streak_30',
    emoji: '■',
    title: 'Железная воля',
    description: '30 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 30,
      progress: Math.min(currentStreak / 30, 1),
      progressLabel: `${Math.min(currentStreak, 30)} / 30`,
    }),
  },
  {
    id: 'streak_60',
    emoji: '◧',
    title: 'Двухмесячный марафон',
    description: '60 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 60,
      progress: Math.min(currentStreak / 60, 1),
      progressLabel: `${Math.min(currentStreak, 60)} / 60`,
    }),
  },
  {
    id: 'streak_100',
    emoji: '◫',
    title: 'Сотка дней',
    description: '100 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 100,
      progress: Math.min(currentStreak / 100, 1),
      progressLabel: `${Math.min(currentStreak, 100)} / 100`,
    }),
  },
  {
    id: 'streak_365',
    emoji: '◪',
    title: 'Год без срыва',
    description: '365 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 365,
      progress: Math.min(currentStreak / 365, 1),
      progressLabel: `${Math.min(currentStreak, 365)} / 365`,
    }),
  },

  // ── Strength: Bench Press ──
  {
    id: 'bench_60',
    emoji: '◇',
    title: 'Жим 60',
    description: 'Жим лёжа — 60 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, BENCH_IDS);
      return { unlocked: w >= 60, progress: Math.min(w / 60, 1), progressLabel: `${Math.round(w)} / 60 кг` };
    },
  },
  {
    id: 'bench_80',
    emoji: '◈',
    title: 'Жим 80',
    description: 'Жим лёжа — 80 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, BENCH_IDS);
      return { unlocked: w >= 80, progress: Math.min(w / 80, 1), progressLabel: `${Math.round(w)} / 80 кг` };
    },
  },
  {
    id: 'bench_100',
    emoji: '◎',
    title: 'Жим сотки',
    description: 'Жим лёжа — 100 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, BENCH_IDS);
      return { unlocked: w >= 100, progress: Math.min(w / 100, 1), progressLabel: `${Math.round(w)} / 100 кг` };
    },
  },
  {
    id: 'bench_140',
    emoji: '◆',
    title: 'Полтора центнера в жиме',
    description: 'Жим лёжа — 140 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, BENCH_IDS);
      return { unlocked: w >= 140, progress: Math.min(w / 140, 1), progressLabel: `${Math.round(w)} / 140 кг` };
    },
  },
  // ── Strength: Squat ──
  {
    id: 'squat_60',
    emoji: '◇',
    title: 'Присед 60',
    description: 'Присед — 60 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, SQUAT_IDS);
      return { unlocked: w >= 60, progress: Math.min(w / 60, 1), progressLabel: `${Math.round(w)} / 60 кг` };
    },
  },
  {
    id: 'squat_100',
    emoji: '◎',
    title: 'Присед сотки',
    description: 'Присед — 100 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, SQUAT_IDS);
      return { unlocked: w >= 100, progress: Math.min(w / 100, 1), progressLabel: `${Math.round(w)} / 100 кг` };
    },
  },
  {
    id: 'squat_140',
    emoji: '◈',
    title: 'Присед 140',
    description: 'Присед — 140 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, SQUAT_IDS);
      return { unlocked: w >= 140, progress: Math.min(w / 140, 1), progressLabel: `${Math.round(w)} / 140 кг` };
    },
  },
  {
    id: 'squat_180',
    emoji: '◆',
    title: 'Присед 180',
    description: 'Присед — 180 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, SQUAT_IDS);
      return { unlocked: w >= 180, progress: Math.min(w / 180, 1), progressLabel: `${Math.round(w)} / 180 кг` };
    },
  },
  {
    id: 'squat_200',
    emoji: '◧',
    title: 'Двойник в приседе',
    description: 'Присед — 200 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, SQUAT_IDS);
      return { unlocked: w >= 200, progress: Math.min(w / 200, 1), progressLabel: `${Math.round(w)} / 200 кг` };
    },
  },
  // ── Strength: Deadlift ──
  {
    id: 'deadlift_100',
    emoji: '◇',
    title: 'Тяга сотки',
    description: 'Становая тяга — 100 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 100, progress: Math.min(w / 100, 1), progressLabel: `${Math.round(w)} / 100 кг` };
    },
  },
  {
    id: 'deadlift_150',
    emoji: '◈',
    title: 'Полуторка в тяге',
    description: 'Становая тяга — 150 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 150, progress: Math.min(w / 150, 1), progressLabel: `${Math.round(w)} / 150 кг` };
    },
  },
  {
    id: 'deadlift_180',
    emoji: '◆',
    title: 'Тяга 180',
    description: 'Становая тяга — 180 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 180, progress: Math.min(w / 180, 1), progressLabel: `${Math.round(w)} / 180 кг` };
    },
  },
  {
    id: 'deadlift_200',
    emoji: '◆',
    title: 'Двойник в тяге',
    description: 'Становая тяга — 200 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 200, progress: Math.min(w / 200, 1), progressLabel: `${Math.round(w)} / 200 кг` };
    },
  },
  {
    id: 'deadlift_250',
    emoji: '◧',
    title: 'Четверть тонны в тяге',
    description: 'Становая тяга — 250 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 250, progress: Math.min(w / 250, 1), progressLabel: `${Math.round(w)} / 250 кг` };
    },
  },
  // ── Strength: Big 3 sum (1RM) ──
  {
    id: 'big3_300',
    emoji: '◇',
    title: 'Сумма 300',
    description: 'Сумма 1ПМ в приседе + жиме + тяге ≥ 300 кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const sum =
        best1RM(workoutHistory, SQUAT_IDS) +
        best1RM(workoutHistory, BENCH_IDS) +
        best1RM(workoutHistory, DEADLIFT_IDS);
      return { unlocked: sum >= 300, progress: Math.min(sum / 300, 1), progressLabel: `${sum} / 300 кг` };
    },
  },
  {
    id: 'big3_400',
    emoji: '◈',
    title: 'Сумма 400',
    description: 'Сумма 1ПМ в приседе + жиме + тяге ≥ 400 кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const sum =
        best1RM(workoutHistory, SQUAT_IDS) +
        best1RM(workoutHistory, BENCH_IDS) +
        best1RM(workoutHistory, DEADLIFT_IDS);
      return { unlocked: sum >= 400, progress: Math.min(sum / 400, 1), progressLabel: `${sum} / 400 кг` };
    },
  },
  {
    id: 'big3_500',
    emoji: '◉',
    title: 'Сумма 500',
    description: 'Сумма 1ПМ в приседе + жиме + тяге ≥ 500 кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const sum =
        best1RM(workoutHistory, SQUAT_IDS) +
        best1RM(workoutHistory, BENCH_IDS) +
        best1RM(workoutHistory, DEADLIFT_IDS);
      return { unlocked: sum >= 500, progress: Math.min(sum / 500, 1), progressLabel: `${sum} / 500 кг` };
    },
  },
  {
    id: 'big3_600',
    emoji: '◧',
    title: 'Сумма 600',
    description: 'Сумма 1ПМ в приседе + жиме + тяге ≥ 600 кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const sum =
        best1RM(workoutHistory, SQUAT_IDS) +
        best1RM(workoutHistory, BENCH_IDS) +
        best1RM(workoutHistory, DEADLIFT_IDS);
      return { unlocked: sum >= 600, progress: Math.min(sum / 600, 1), progressLabel: `${sum} / 600 кг` };
    },
  },
  {
    id: 'big3_700',
    emoji: '◪',
    title: 'Элита: сумма 700',
    description: 'Сумма 1ПМ в приседе + жиме + тяге ≥ 700 кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const sum =
        best1RM(workoutHistory, SQUAT_IDS) +
        best1RM(workoutHistory, BENCH_IDS) +
        best1RM(workoutHistory, DEADLIFT_IDS);
      return { unlocked: sum >= 700, progress: Math.min(sum / 700, 1), progressLabel: `${sum} / 700 кг` };
    },
  },
  // ── Strength: Lifetime volume ──
  {
    id: 'volume_10k',
    emoji: '◇',
    title: '10 тонн',
    description: 'Поднять суммарно 10 000 кг за всё время',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const vol = totalVolume(workoutHistory);
      return {
        unlocked: vol >= 10000,
        progress: Math.min(vol / 10000, 1),
        progressLabel: `${Math.round(vol / 1000)} / 10 т`,
      };
    },
  },
  {
    id: 'volume_100k',
    emoji: '◧',
    title: '100 тонн',
    description: 'Поднять суммарно 100 000 кг за всё время',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const vol = totalVolume(workoutHistory);
      return {
        unlocked: vol >= 100000,
        progress: Math.min(vol / 100000, 1),
        progressLabel: `${Math.round(vol / 1000)} / 100 т`,
      };
    },
  },
  {
    id: 'volume_500k',
    emoji: '◫',
    title: 'Полтыщи тонн',
    description: 'Поднять суммарно 500 000 кг за всё время',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const vol = totalVolume(workoutHistory);
      return {
        unlocked: vol >= 500000,
        progress: Math.min(vol / 500000, 1),
        progressLabel: `${Math.round(vol / 1000)} / 500 т`,
      };
    },
  },
  {
    id: 'volume_1m',
    emoji: '◪',
    title: 'Мегатонна',
    description: 'Поднять суммарно 1 000 000 кг за всё время',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const vol = totalVolume(workoutHistory);
      return {
        unlocked: vol >= 1000000,
        progress: Math.min(vol / 1000000, 1),
        progressLabel: `${Math.round(vol / 1000)} / 1000 т`,
      };
    },
  },
  // ── Strength: Single-session volume ──
  {
    id: 'single_workout_5k',
    emoji: '◉',
    title: 'Пятитонник за тренировку',
    description: 'Одна тренировка с объёмом 5 000+ кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const v = maxSingleWorkoutVolume(workoutHistory);
      return { unlocked: v >= 5000, progress: Math.min(v / 5000, 1), progressLabel: `${Math.round(v)} / 5000 кг` };
    },
  },
  {
    id: 'single_workout_10k',
    emoji: '◧',
    title: 'Десятитонник за тренировку',
    description: 'Одна тренировка с объёмом 10 000+ кг',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const v = maxSingleWorkoutVolume(workoutHistory);
      return { unlocked: v >= 10000, progress: Math.min(v / 10000, 1), progressLabel: `${Math.round(v)} / 10000 кг` };
    },
  },
  // ── Strength: Reps & sets ──
  {
    id: 'reps_5000',
    emoji: '◈',
    title: '5000 повторений',
    description: 'Выполнить 5000 засчитанных повторений за всё время',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const r = totalCompletedReps(workoutHistory);
      return { unlocked: r >= 5000, progress: Math.min(r / 5000, 1), progressLabel: `${r} / 5000` };
    },
  },
  {
    id: 'reps_25000',
    emoji: '◧',
    title: '25 000 повторений',
    description: 'Выполнить 25 000 засчитанных повторений',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const r = totalCompletedReps(workoutHistory);
      return { unlocked: r >= 25000, progress: Math.min(r / 25000, 1), progressLabel: `${r} / 25000` };
    },
  },
  {
    id: 'sets_500',
    emoji: '◈',
    title: 'Полтыщи подходов',
    description: 'Выполнить 500 засчитанных подходов за всё время',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const s = totalCompletedSets(workoutHistory);
      return { unlocked: s >= 500, progress: Math.min(s / 500, 1), progressLabel: `${s} / 500` };
    },
  },
  {
    id: 'sets_2000',
    emoji: '◧',
    title: '2000 подходов',
    description: 'Выполнить 2000 засчитанных подходов',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const s = totalCompletedSets(workoutHistory);
      return { unlocked: s >= 2000, progress: Math.min(s / 2000, 1), progressLabel: `${s} / 2000` };
    },
  },

  // ── Exploration ──
  {
    id: 'exercises_10',
    emoji: '◫',
    title: 'Разнообразие',
    description: 'Выполнить 10 разных упражнений',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = uniqueExerciseIds(workoutHistory).size;
      return { unlocked: n >= 10, progress: Math.min(n / 10, 1), progressLabel: `${Math.min(n, 10)} / 10` };
    },
  },
  {
    id: 'exercises_30',
    emoji: '◑',
    title: 'Исследователь',
    description: 'Выполнить 30 разных упражнений',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = uniqueExerciseIds(workoutHistory).size;
      return { unlocked: n >= 30, progress: Math.min(n / 30, 1), progressLabel: `${Math.min(n, 30)} / 30` };
    },
  },
  {
    id: 'exercises_50',
    emoji: '◒',
    title: 'Коллекционер',
    description: 'Выполнить 50 разных упражнений',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = uniqueExerciseIds(workoutHistory).size;
      return { unlocked: n >= 50, progress: Math.min(n / 50, 1), progressLabel: `${Math.min(n, 50)} / 50` };
    },
  },
  {
    id: 'morning_10',
    emoji: '○',
    title: 'Ранняя пташка',
    description: '10 тренировок начаты до 9:00',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = morningWorkouts(workoutHistory);
      return { unlocked: n >= 10, progress: Math.min(n / 10, 1), progressLabel: `${Math.min(n, 10)} / 10` };
    },
  },
  {
    id: 'morning_25',
    emoji: '◐',
    title: 'Жаворонок',
    description: '25 тренировок начаты до 9:00',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = morningWorkouts(workoutHistory);
      return { unlocked: n >= 25, progress: Math.min(n / 25, 1), progressLabel: `${Math.min(n, 25)} / 25` };
    },
  },
  {
    id: 'evening_5',
    emoji: '●',
    title: 'Ночная смена',
    description: '5 тренировок начаты после 21:00',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = eveningWorkouts(workoutHistory);
      return { unlocked: n >= 5, progress: Math.min(n / 5, 1), progressLabel: `${Math.min(n, 5)} / 5` };
    },
  },
  {
    id: 'evening_25',
    emoji: '◔',
    title: 'Сова',
    description: '25 тренировок начаты после 21:00',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = eveningWorkouts(workoutHistory);
      return { unlocked: n >= 25, progress: Math.min(n / 25, 1), progressLabel: `${Math.min(n, 25)} / 25` };
    },
  },
  {
    id: 'weekend_warrior',
    emoji: '◓',
    title: 'Воин выходных',
    description: '20 тренировок в субботу или воскресенье',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = weekendWorkouts(workoutHistory);
      return { unlocked: n >= 20, progress: Math.min(n / 20, 1), progressLabel: `${Math.min(n, 20)} / 20` };
    },
  },
  {
    id: 'workout_2h',
    emoji: '◕',
    title: 'Марафонец',
    description: 'Тренировка длительностью 2 часа и больше',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const m = longestWorkoutMinutes(workoutHistory);
      return { unlocked: m >= 120, progress: Math.min(m / 120, 1), progressLabel: `${m} / 120 мин` };
    },
  },
  {
    id: 'workout_3h',
    emoji: '◫',
    title: 'Железная задница',
    description: 'Тренировка длительностью 3 часа',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const m = longestWorkoutMinutes(workoutHistory);
      return { unlocked: m >= 180, progress: Math.min(m / 180, 1), progressLabel: `${m} / 180 мин` };
    },
  },

  // ── Nutrition ──
  {
    id: 'nutrition_7',
    emoji: '◑',
    title: 'Неделя питания',
    description: 'Отслеживать питание 7 дней подряд',
    category: 'nutrition',
    check: ({ nutritionDaysLogged }) => ({
      unlocked: nutritionDaysLogged >= 7,
      progress: Math.min(nutritionDaysLogged / 7, 1),
      progressLabel: `${Math.min(nutritionDaysLogged, 7)} / 7`,
    }),
  },
  {
    id: 'nutrition_30',
    emoji: '◧',
    title: 'Мастер КБЖУ',
    description: 'Отслеживать питание 30 и более дней',
    category: 'nutrition',
    check: ({ nutritionDaysLogged }) => ({
      unlocked: nutritionDaysLogged >= 30,
      progress: Math.min(nutritionDaysLogged / 30, 1),
      progressLabel: `${Math.min(nutritionDaysLogged, 30)} / 30`,
    }),
  },

  // ─── R240: Recovery / smartwatch ────────────────────────────────────────────

  {
    id: 'sleep_7days_streak',
    emoji: '◐',
    title: 'Неделя здорового сна',
    description: '7 ночей подряд по 7+ часов сна',
    category: 'recovery',
    check: ({ sleepEntries }) => {
      const entries = sleepEntries ?? [];
      if (entries.length === 0) return { unlocked: false, progress: 0, progressLabel: '0 / 7' };
      // Walk backwards from today, count consecutive 7h+ nights
      const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
      let streak = 0;
      for (const e of sorted) {
        if (e.durationHours >= 7) streak++;
        else break;
      }
      return {
        unlocked: streak >= 7,
        progress: Math.min(streak / 7, 1),
        progressLabel: `${Math.min(streak, 7)} / 7`,
      };
    },
  },
  {
    id: 'sleep_30nights',
    emoji: '◑',
    title: 'Месяц сна под контролем',
    description: 'Записать 30 ночей сна',
    category: 'recovery',
    check: ({ sleepEntries }) => {
      const n = sleepEntries?.length ?? 0;
      return {
        unlocked: n >= 30,
        progress: Math.min(n / 30, 1),
        progressLabel: `${Math.min(n, 30)} / 30`,
      };
    },
  },
  {
    id: 'sleep_quality_avg4',
    emoji: '◓',
    title: 'Качественный отдых',
    description: 'Средняя оценка сна ≥ 4/5 за последние 14 дней',
    category: 'recovery',
    check: ({ sleepEntries }) => {
      const recent = (sleepEntries ?? []).slice(0, 14).filter((e) => e.quality != null);
      if (recent.length < 7) return { unlocked: false, progress: recent.length / 7, progressLabel: `${recent.length} / 7 дней` };
      const avg = recent.reduce((s, e) => s + (e.quality ?? 0), 0) / recent.length;
      return {
        unlocked: avg >= 4,
        progress: Math.min(avg / 4, 1),
        progressLabel: `${avg.toFixed(1)} / 4.0`,
      };
    },
  },
  {
    id: 'watch_synced_first',
    emoji: '◒',
    title: 'На связи с часами',
    description: 'Получить первую тренировку с часов (Apple Watch, Mi Band, Polar и др.)',
    category: 'recovery',
    check: ({ watchCardioCount }) => ({
      unlocked: (watchCardioCount ?? 0) >= 1,
      progress: Math.min((watchCardioCount ?? 0), 1),
      progressLabel: `${Math.min((watchCardioCount ?? 0), 1)} / 1`,
    }),
  },
  {
    id: 'watch_synced_10',
    emoji: '◔',
    title: 'Регулярный синк',
    description: '10 тренировок с часов',
    category: 'recovery',
    check: ({ watchCardioCount }) => ({
      unlocked: (watchCardioCount ?? 0) >= 10,
      progress: Math.min((watchCardioCount ?? 0) / 10, 1),
      progressLabel: `${Math.min((watchCardioCount ?? 0), 10)} / 10`,
    }),
  },
  {
    id: 'vo2max_40',
    emoji: '◕',
    title: 'Хорошая форма',
    description: 'VO₂max 40 и выше — выше среднего для возраста',
    category: 'recovery',
    check: ({ latestVo2Max }) => {
      const v = latestVo2Max ?? 0;
      return {
        unlocked: v >= 40,
        progress: Math.min(v / 40, 1),
        progressLabel: v > 0 ? `${v.toFixed(1)} / 40` : 'нет данных',
      };
    },
  },
];

// ─── Compute all achievements ─────────────────────────────────────────────────

export function computeAchievements(data: AchievementData): Achievement[] {
  return ACHIEVEMENT_DEFINITIONS.map((def) => {
    try {
      const result = def.check(data);
      return {
        id: def.id,
        emoji: def.emoji,
        title: def.title,
        description: def.description,
        category: def.category,
        unlocked: result.unlocked,
        progress: result.progress,
        progressLabel: result.progressLabel,
      };
    } catch {
      return { id: def.id, emoji: def.emoji, title: def.title, description: def.description, category: def.category, unlocked: false };
    }
  });
}

/** Returns newly unlocked achievement IDs compared to previous count */
export function getNewlyUnlocked(prev: string[], current: Achievement[]): Achievement[] {
  const prevSet = new Set(prev);
  return current.filter((a) => a.unlocked && !prevSet.has(a.id));
}
