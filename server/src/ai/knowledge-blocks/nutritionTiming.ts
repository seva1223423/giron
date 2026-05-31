/**
 * Block 17: Nutrition Timing Advice
 *
 * Originally inline at ai.ts L13347 (`getNutritionTimingAdvice`). Pure
 * function — checks post-workout window, meal gaps, evening protein
 * deficit, and pre-workout timing.
 *
 * Input is richer than most blocks (needs today's meals + recent
 * workouts) — contextEngine assembles these from the existing /chat
 * Promise.all and passes through.
 */

import type { KnowledgeBlock, KnowledgeBlockInput } from './types';

interface NutritionTimingInput extends KnowledgeBlockInput {
  hour?: number;
  todayMeals?: Array<{
    type: string;
    totalCalories: number;
    totalProtein: number;
    createdAt: Date | string;
  }>;
  recentWorkouts?: Array<{ completedAt: Date | string | null }>;
  nutritionTargets?: { calories: number; protein: number } | null;
  clientDate?: string;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function buildNutritionTiming(input: NutritionTimingInput): string {
  const {
    hour = new Date().getHours(),
    todayMeals = [],
    recentWorkouts = [],
    nutritionTargets,
    clientDate,
  } = input;
  const lines: string[] = [];

  const todayStr = clientDate ?? new Date().toISOString().split('T')[0];
  const trainedToday = recentWorkouts.some((w) => {
    if (!w.completedAt) return false;
    return toDate(w.completedAt).toISOString().split('T')[0] === todayStr;
  });

  // Post-workout window — finished in last 2 hours, no meal logged since
  const recentTraining = recentWorkouts.find((w) => {
    if (!w.completedAt) return false;
    const hoursAgo = (Date.now() - toDate(w.completedAt).getTime()) / 3_600_000;
    return hoursAgo < 2;
  });

  if (recentTraining) {
    const workoutTime = toDate(recentTraining.completedAt!).getTime();
    const postWorkoutMeal = todayMeals.find((m) => toDate(m.createdAt).getTime() > workoutTime);
    if (!postWorkoutMeal) {
      lines.push('🍽️ ПОСТ-ТРЕНИРОВКА: Прошло менее 2ч после тренировки и нет приёма пищи. Рекомендуй: 30-40г белка + быстрые углеводы (рис, банан, протеин с молоком).');
    }
  }

  // Meal-gap detection — >5 hours between meals
  if (todayMeals.length >= 2) {
    const sorted = [...todayMeals].sort(
      (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const gap = (toDate(sorted[i].createdAt).getTime() - toDate(sorted[i - 1].createdAt).getTime()) / 3_600_000;
      if (gap > 5) {
        lines.push(`⏰ Перерыв ${Math.round(gap)}ч между приёмами пищи — слишком долго. Оптимально: каждые 3-4ч.`);
        break;
      }
    }
  }

  // Evening protein check
  if (hour >= 20 && nutritionTargets) {
    const totalProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const remaining = nutritionTargets.protein - totalProt;
    if (remaining > 30) {
      lines.push(`🌙 Вечер, а до нормы белка ещё ${Math.round(remaining)}г. Рекомендуй казеин / творог перед сном.`);
    }
  }

  // Pre-workout suggestion — evening window, no training today, last meal >3h ago
  if (!trainedToday && hour >= 15 && hour <= 20) {
    const lastMeal = todayMeals[todayMeals.length - 1];
    if (lastMeal) {
      const hoursSinceLastMeal = (Date.now() - toDate(lastMeal.createdAt).getTime()) / 3_600_000;
      if (hoursSinceLastMeal > 3) {
        lines.push('⚡ Если тренировка вечером — стоит перекусить за 1-1.5ч: банан + немного белка.');
      }
    }
  }

  if (lines.length === 0) return '';
  return '\n\n## ⏱️ ТАЙМИНГ ПИТАНИЯ\n' + lines.join('\n');
}

export const nutritionTimingBlock: KnowledgeBlock = {
  id: 'nutrition:timing',
  keywords: [
    'тайминг', 'питание', 'еда', 'приём пищи', 'белок',
    'пост-тренировка', 'до тренировки', 'после тренировки',
    'казеин', 'творог', 'перекус', 'голод',
  ],
  build: (input) => buildNutritionTiming(input as NutritionTimingInput),
};
