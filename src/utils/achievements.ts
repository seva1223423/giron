import { Workout, WorkoutExercise } from '../types';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  category: 'workout' | 'strength' | 'streak' | 'nutrition' | 'exploration';
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
    emoji: '🎯',
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
    emoji: '🖐️',
    title: 'Разогрев',
    description: '5 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 5, progress: Math.min(n / 5, 1), progressLabel: `${Math.min(n, 5)} / 5` };
    },
  },
  {
    id: 'workouts_25',
    emoji: '💪',
    title: 'Завсегдатай',
    description: '25 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 25, progress: Math.min(n / 25, 1), progressLabel: `${Math.min(n, 25)} / 25` };
    },
  },
  {
    id: 'workouts_100',
    emoji: '💯',
    title: 'Сотня',
    description: '100 завершённых тренировок',
    category: 'workout',
    check: ({ workoutHistory }) => {
      const n = totalWorkouts(workoutHistory);
      return { unlocked: n >= 100, progress: Math.min(n / 100, 1), progressLabel: `${Math.min(n, 100)} / 100` };
    },
  },
  {
    id: 'workouts_month',
    emoji: '🏅',
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
    id: 'streak_7',
    emoji: '🔥',
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
    id: 'streak_30',
    emoji: '🗓️',
    title: 'Железная воля',
    description: '30 дней серии подряд',
    category: 'streak',
    check: ({ currentStreak }) => ({
      unlocked: currentStreak >= 30,
      progress: Math.min(currentStreak / 30, 1),
      progressLabel: `${Math.min(currentStreak, 30)} / 30`,
    }),
  },

  // ── Strength ──
  {
    id: 'bench_100',
    emoji: '🏋️',
    title: 'Жим сотки',
    description: 'Жим лёжа — 100 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, BENCH_IDS);
      return { unlocked: w >= 100, progress: Math.min(w / 100, 1), progressLabel: `${Math.round(w)} / 100 кг` };
    },
  },
  {
    id: 'squat_100',
    emoji: '🦵',
    title: 'Присед сотки',
    description: 'Присед — 100 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, SQUAT_IDS);
      return { unlocked: w >= 100, progress: Math.min(w / 100, 1), progressLabel: `${Math.round(w)} / 100 кг` };
    },
  },
  {
    id: 'deadlift_150',
    emoji: '⚡',
    title: 'Полуторка в тяге',
    description: 'Становая тяга — 150 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 150, progress: Math.min(w / 150, 1), progressLabel: `${Math.round(w)} / 150 кг` };
    },
  },
  {
    id: 'deadlift_200',
    emoji: '🔱',
    title: 'Двойник в тяге',
    description: 'Становая тяга — 200 кг в подходе',
    category: 'strength',
    check: ({ workoutHistory }) => {
      const w = maxWeightForExercises(workoutHistory, DEADLIFT_IDS);
      return { unlocked: w >= 200, progress: Math.min(w / 200, 1), progressLabel: `${Math.round(w)} / 200 кг` };
    },
  },
  {
    id: 'big3_500',
    emoji: '🏆',
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
    id: 'volume_100k',
    emoji: '⚖️',
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

  // ── Exploration ──
  {
    id: 'exercises_10',
    emoji: '🌟',
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
    emoji: '🎪',
    title: 'Исследователь',
    description: 'Выполнить 30 разных упражнений',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = uniqueExerciseIds(workoutHistory).size;
      return { unlocked: n >= 30, progress: Math.min(n / 30, 1), progressLabel: `${Math.min(n, 30)} / 30` };
    },
  },
  {
    id: 'morning_10',
    emoji: '☀️',
    title: 'Ранняя пташка',
    description: '10 тренировок начаты до 9:00',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = morningWorkouts(workoutHistory);
      return { unlocked: n >= 10, progress: Math.min(n / 10, 1), progressLabel: `${Math.min(n, 10)} / 10` };
    },
  },
  {
    id: 'evening_5',
    emoji: '🌙',
    title: 'Ночная смена',
    description: '5 тренировок начаты после 21:00',
    category: 'exploration',
    check: ({ workoutHistory }) => {
      const n = eveningWorkouts(workoutHistory);
      return { unlocked: n >= 5, progress: Math.min(n / 5, 1), progressLabel: `${Math.min(n, 5)} / 5` };
    },
  },

  // ── Nutrition ──
  {
    id: 'nutrition_7',
    emoji: '🥗',
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
    emoji: '📊',
    title: 'Мастер КБЖУ',
    description: 'Отслеживать питание 30 и более дней',
    category: 'nutrition',
    check: ({ nutritionDaysLogged }) => ({
      unlocked: nutritionDaysLogged >= 30,
      progress: Math.min(nutritionDaysLogged / 30, 1),
      progressLabel: `${Math.min(nutritionDaysLogged, 30)} / 30`,
    }),
  },
];

// ─── Compute all achievements ─────────────────────────────────────────────────

export function computeAchievements(data: AchievementData): Achievement[] {
  return ACHIEVEMENT_DEFINITIONS.map((def) => {
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
  });
}

/** Returns newly unlocked achievement IDs compared to previous count */
export function getNewlyUnlocked(prev: string[], current: Achievement[]): Achievement[] {
  const prevSet = new Set(prev);
  return current.filter((a) => a.unlocked && !prevSet.has(a.id));
}
