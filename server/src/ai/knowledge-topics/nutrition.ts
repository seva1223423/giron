/**
 * knowledge-topics/nutrition.ts — auto-split from knowledgeHelpers.ts
 * (audit R-2026-05-22 Tier 1 item 4).
 *
 * Every decl here was originally inline in routes/ai.ts, then bulk-
 * extracted to knowledgeHelpers.ts, and now grouped by topic via name
 * regex. Logic byte-identical to the original.
 *
 * To re-split: run `python scripts/split-knowledge-helpers.py` from
 * the server/ directory. The barrel `../knowledgeHelpers.ts` re-exports
 * every topic file so callers don't need to change imports.
 */
import { logger } from '../../utils/logger';
import { sanitizeForPrompt } from '../../utils/inputSanitizer';
import type { DeepSeekMessage } from '../../services/deepseekAI';
import type { GamificationData } from '../../routes/ai';

export function getNutritionTimingAdvice(
  hour: number,
  todayMeals: Array<{ type: string; totalCalories: number; totalProtein: number; createdAt: Date }>,
  recentWorkouts: Array<{ completedAt: Date | null }>,
  nutritionTargets?: { calories: number; protein: number } | null,
  clientDate?: string,
): string {
  const lines: string[] = [];

  // Check if workout is coming (planned for today) or just finished
  const todayStr = clientDate ?? new Date().toISOString().split('T')[0];
  const trainedToday = recentWorkouts.some(
    (w) => w.completedAt && w.completedAt.toISOString().split('T')[0] === todayStr
  );

  // Post-workout window (trained today, less than 2h ago)
  const recentTraining = recentWorkouts.find((w) => {
    if (!w.completedAt) return false;
    const hoursAgo = (Date.now() - new Date(w.completedAt).getTime()) / (1000 * 60 * 60);
    return hoursAgo < 2;
  });

  if (recentTraining) {
    const postWorkoutMeal = todayMeals.find((m) => {
      const mealTime = new Date(m.createdAt).getTime();
      const workoutTime = new Date(recentTraining.completedAt!).getTime();
      return mealTime > workoutTime;
    });

    if (!postWorkoutMeal) {
      lines.push('🍽️ ПОСТ-ТРЕНИРОВКА: Прошло менее 2ч после тренировки и нет приёма пищи. Рекомендуй: 30-40г белка + быстрые углеводы (рис, банан, протеин с молоком).');
    }
  }

  // Meal timing gaps (>5 hours between meals)
  if (todayMeals.length >= 2) {
    const sortedMeals = [...todayMeals].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (let i = 1; i < sortedMeals.length; i++) {
      const gap = (new Date(sortedMeals[i].createdAt).getTime() - new Date(sortedMeals[i - 1].createdAt).getTime()) / (1000 * 60 * 60);
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

  // Pre-workout timing
  if (!trainedToday && hour >= 15 && hour <= 20) {
    const lastMeal = todayMeals[todayMeals.length - 1];
    if (lastMeal) {
      const hoursSinceLastMeal = (Date.now() - new Date(lastMeal.createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastMeal > 3) {
        lines.push('⚡ Если тренировка вечером — стоит перекусить за 1-1.5ч: банан + немного белка.');
      }
    }
  }

  if (lines.length === 0) return '';
  return '\n\n## ⏱️ ТАЙМИНГ ПИТАНИЯ\n' + lines.join('\n');
}
export interface FatigueData {
  acuteLoad: number;    // last 7 days
  chronicLoad: number;  // last 28 days average per week
  ratio: number;        // acute:chronic ratio (ACWR)
  status: 'fresh' | 'optimal' | 'overreaching' | 'dangerous';
  message: string;
}
export function calculateFatigueIndex(
  workouts: Array<{ completedAt: Date | null; totalVolume: number | null; durationMinutes: number | null }>,
): FatigueData {
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Calculate load as volume × duration proxy
  const getLoad = (wo: typeof workouts[number]) => {
    const vol = wo.totalVolume || 0;
    const dur = wo.durationMinutes || 45;
    return vol * (dur / 60); // volume-hours
  };

  const last7Days = workouts.filter((w) => w.completedAt && (now - new Date(w.completedAt).getTime()) < 7 * MS_PER_DAY);
  const last28Days = workouts.filter((w) => w.completedAt && (now - new Date(w.completedAt).getTime()) < 28 * MS_PER_DAY);

  const acuteLoad = last7Days.reduce((s, w) => s + getLoad(w), 0);
  const chronicLoad = last28Days.length > 0
    ? last28Days.reduce((s, w) => s + getLoad(w), 0) / 4 // average weekly load over 4 weeks
    : acuteLoad;

  const ratio = chronicLoad > 0 ? Math.round((acuteLoad / chronicLoad) * 100) / 100 : 1;

  let status: FatigueData['status'];
  let message: string;

  if (ratio < 0.8) {
    status = 'fresh';
    message = `Нагрузка ниже обычной (ACWR: ${ratio}). Можно увеличить объём или интенсивность.`;
  } else if (ratio <= 1.3) {
    status = 'optimal';
    message = `Нагрузка в оптимальной зоне (ACWR: ${ratio}). Продолжай в том же духе!`;
  } else if (ratio <= 1.5) {
    status = 'overreaching';
    message = `⚠️ Нагрузка повышена (ACWR: ${ratio}). Возможно функциональное перенапряжение. Следи за восстановлением.`;
  } else {
    status = 'dangerous';
    message = `🚨 Нагрузка критически высокая (ACWR: ${ratio}). Высокий риск травмы! Рекомендуется снизить объём на 30-40%.`;
  }

  return { acuteLoad: Math.round(acuteLoad), chronicLoad: Math.round(chronicLoad), ratio, status, message };
}
export function buildFatigueContext(fatigue: FatigueData): string {
  if (fatigue.acuteLoad === 0 && fatigue.chronicLoad === 0) return '';

  return `\n\n## 🔋 ИНДЕКС УСТАЛОСТИ (ACWR)
Острая нагрузка (7д): ${fatigue.acuteLoad} | Хроническая (28д/нед): ${fatigue.chronicLoad}
Соотношение: ${fatigue.ratio} — ${fatigue.message}
→ Учитывай при рекомендациях по объёму и интенсивности.`;
}
export function detectNutritionGaps(
  meals: Array<{ items: Array<{ name: string; protein: number; fats: number; carbs: number }> }>,
  userGoal: string | null,
): string {
  if (meals.length < 3) return ''; // Need at least 3 meals for analysis

  // Collect all food items
  const allItems = meals.flatMap((m) => m.items.map((i) => i.name.toLowerCase()));

  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Check for protein source variety
  const proteinSources = allItems.filter((name) =>
    /курица|мясо|рыба|говядин|свинин|яйц|творог|тунец|лосось|индейк|печен/i.test(name)
  );
  if (proteinSources.length < meals.length * 0.3) {
    gaps.push('Мало белковых продуктов');
    recommendations.push('Добавь белок в каждый приём: курица, рыба, яйца, творог.');
  }

  // Check for vegetables/fiber
  const veggies = allItems.filter((name) =>
    /салат|овощ|помидор|огурец|брокколи|шпинат|капуст|морков|свекл|перец|лук|зелен|кабачок/i.test(name)
  );
  if (veggies.length < meals.length * 0.2) {
    gaps.push('Мало овощей и клетчатки');
    recommendations.push('Минимум 400г овощей в день для клетчатки и микроэлементов.');
  }

  // Check for healthy fats
  const healthyFats = allItems.filter((name) =>
    /авокадо|орех|миндаль|лосось|масло.*олив|семена|льн/i.test(name)
  );
  if (healthyFats.length === 0) {
    gaps.push('Мало полезных жиров');
    recommendations.push('Добавь источники омега-3: лосось, орехи, семена, авокадо.');
  }

  // Check for dairy/calcium
  const dairy = allItems.filter((name) =>
    /молок|кефир|творог|йогурт|сыр|ряженк/i.test(name)
  );
  if (dairy.length === 0) {
    gaps.push('Мало кальция (нет молочных)');
    recommendations.push('Для костей и мышц: творог, кефир или йогурт ежедневно.');
  }

  // Check carb quality
  const simpleCarbs = allItems.filter((name) =>
    /сахар|конфет|торт|печень.*сладк|шоколад|газировк|сок.*пакет/i.test(name)
  );
  const complexCarbs = allItems.filter((name) =>
    /рис|гречк|овсянк|картофел|макарон|хлеб.*цельнозерн|булгур|киноа|перловк/i.test(name)
  );
  if (simpleCarbs.length > complexCarbs.length && simpleCarbs.length >= 2) {
    gaps.push('Преобладают простые углеводы');
    recommendations.push('Замени сладкое на сложные углеводы: гречка, рис, овсянка.');
  }

  // Goal-specific
  if (userGoal === 'MUSCLE_GAIN') {
    const totalProtein = meals.reduce((s, m) => s + m.items.reduce((ps, i) => ps + i.protein, 0), 0);
    const avgProteinPerMeal = totalProtein / meals.length;
    if (avgProteinPerMeal < 25) {
      gaps.push('Мало белка на приём пищи');
      recommendations.push('Для набора массы: минимум 30г белка в каждом приёме пищи.');
    }
  }

  if (gaps.length === 0) return '';

  return `\n\n## 🥗 ПРОБЕЛЫ В ПИТАНИИ
${gaps.map((g) => `- ❌ ${g}`).join('\n')}
Рекомендации:
${recommendations.map((r) => `- 💡 ${r}`).join('\n')}
→ Если пользователь обсуждает питание — мягко предложи улучшения.`;
}
export function estimateCaloriesBurned(
  workout: {
    totalVolume: number | null;
    durationMinutes: number | null;
    exercises: Array<{ exercise: { category: string; type: string } }>;
  } | null,
  userWeightKg: number | null,
): string {
  if (!workout || !workout.durationMinutes || !userWeightKg) return '';

  const duration = workout.durationMinutes;
  const weight = userWeightKg;

  // Determine workout intensity from exercise types
  const categories = workout.exercises.map((e) => e.exercise?.category);
  const hasCardio = categories.includes('cardio');
  const hasStrength = categories.includes('strength');

  // MET values (rough estimates)
  let met: number;
  if (hasCardio && !hasStrength) {
    met = 7.0; // moderate cardio
  } else if (hasStrength && !hasCardio) {
    met = 5.0; // strength training
  } else if (hasCardio && hasStrength) {
    met = 6.0; // mixed
  } else {
    met = 4.5; // flexibility/functional
  }

  // Adjust for volume (higher volume = more calorie expenditure)
  if (workout.totalVolume && workout.totalVolume > 10000) {
    met += 0.5; // heavy session
  }

  // Calorie estimation: kcal = MET × weight(kg) × duration(hours)
  const calories = Math.round(met * weight * (duration / 60));

  return `\n\n## 🔥 РАСХОД КАЛОРИЙ (последняя тренировка)
Примерно ${calories} ккал за ${duration} мин (MET ~${met.toFixed(1)})
${hasStrength ? '💪 Силовая тренировка сжигает калории ещё 24-48ч после (EPOC-эффект)' : ''}
⚠️ Грубая оценка. Реальный расход зависит от интенсивности, пауз отдыха, ЧСС.`;
}
export function buildHydrationAdvice(
  userWeightKg: number | null,
  userGoal: string | null,
  todayWorkout: boolean,
  todayMealsCount: number,
): string {
  if (!userWeightKg) return '';

  // Base: 30-35ml per kg body weight
  const baseWater = Math.round(userWeightKg * 33);
  let totalWater = baseWater;
  const notes: string[] = [];

  // Training day: +500-750ml
  if (todayWorkout) {
    totalWater += 600;
    notes.push('+600мл за тренировку');
  }

  // Goal-specific
  if (userGoal === 'WEIGHT_LOSS') {
    totalWater += 300;
    notes.push('+300мл для метаболизма (похудение)');
  } else if (userGoal === 'MUSCLE_GAIN') {
    totalWater += 400;
    notes.push('+400мл для синтеза белка (набор)');
  }

  // Season (summer = more water)
  const month = new Date().getMonth();
  if (month >= 5 && month <= 8) {
    totalWater += 400;
    notes.push('+400мл (лето, жара)');
  }

  const liters = (totalWater / 1000).toFixed(1);

  return `\n\n## 💧 ГИДРАТАЦИЯ
Рекомендуемый объём: ${liters} л/день (${totalWater} мл)
${notes.length > 0 ? `Расчёт: базовые ${baseWater}мл, ${notes.join(', ')}` : ''}
${todayMealsCount < 3 ? '⚠️ Мало приёмов пищи сегодня — не забывай пить между едой' : ''}
→ Напоминай о воде когда обсуждаешь питание или тренировки.`;
}
export function optimizeProteinTiming(
  todayMeals: Array<{ type: string; totalProtein: number; createdAt: Date }>,
  userWeightKg: number | null,
  userGoal: string | null,
  hasWorkoutToday: boolean,
): string {
  if (!userWeightKg) return '';

  // Target protein per day
  let proteinTarget: number;
  if (userGoal === 'MUSCLE_GAIN') proteinTarget = userWeightKg * 2.0;
  else if (userGoal === 'WEIGHT_LOSS') proteinTarget = userWeightKg * 2.2; // higher to preserve muscle
  else if (userGoal === 'STRENGTH') proteinTarget = userWeightKg * 1.8;
  else proteinTarget = userWeightKg * 1.6;

  const totalProtein = todayMeals.reduce((sum, m) => sum + m.totalProtein, 0);
  const remaining = Math.max(0, proteinTarget - totalProtein);

  const lines: string[] = [];
  lines.push(`Цель: ${Math.round(proteinTarget)}г белка/день (${(proteinTarget / userWeightKg).toFixed(1)}г/кг)`);
  lines.push(`Сегодня: ${Math.round(totalProtein)}г из ${Math.round(proteinTarget)}г (${Math.round((totalProtein / proteinTarget) * 100)}%)`);

  if (remaining > 40) {
    const mealsLeft = hasWorkoutToday ? 3 : 2; // assume more meals on training day
    const perMeal = Math.round(remaining / mealsLeft);
    lines.push(`📌 Осталось добрать: ${Math.round(remaining)}г (~${perMeal}г на оставшиеся приёмы)`);
  }

  // Timing advice
  if (hasWorkoutToday) {
    lines.push('⏰ Пост-тренировочный приём (30-60мин после): 30-40г быстрого белка (сывороточный протеин, яйца)');
  }

  // Check meal distribution
  if (todayMeals.length >= 2) {
    const maxProtein = Math.max(...todayMeals.map((m) => m.totalProtein));
    const minProtein = Math.min(...todayMeals.map((m) => m.totalProtein));
    if (maxProtein > minProtein * 3 && minProtein < 20) {
      lines.push('⚠️ Белок распределён неравномерно — старайся 25-40г в каждом приёме');
    }
  }

  return `\n\n## 🥩 БЕЛОК СЕГОДНЯ
${lines.join('\n')}
→ Упоминай при обсуждении питания. Помоги добрать белок к концу дня.`;
}
export function estimateCaloricBalance(
  todayMeals: Array<{ totalCalories: number }>,
  userWeightKg: number | null,
  userGoal: string | null,
  hasWorkoutToday: boolean,
  userGender: string | null,
  userAge: number | null,
): string {
  if (!userWeightKg || todayMeals.length === 0) return '';

  // Round 189: clamp inputs before BMR calc to prevent garbage-in-
  // garbage-out. Without these clamps a user with heightCm=10 (typo) or
  // weightKg=300 (typo) would get a BMR of 200 or 4500 respectively,
  // which then gets multiplied by 1.55 = TDEE of 310 or 6975 — neither
  // is plausible. Clamping to physiological ranges keeps the AI from
  // hallucinating absurd targets in nutrition advice.
  const safeWeight = Math.min(Math.max(userWeightKg, 35), 250);
  const safeAge = Math.min(Math.max(userAge ?? 25, 14), 100);

  // Estimate BMR using Mifflin-St Jeor
  let bmr: number;
  if (userGender === 'MALE') {
    bmr = 10 * safeWeight + 6.25 * 175 - 5 * safeAge + 5; // assume 175cm if unknown
  } else {
    bmr = 10 * safeWeight + 6.25 * 165 - 5 * safeAge - 161;
  }

  // Final BMR sanity clamp — typical adult range is 1100-2400 kcal/day.
  // Wider band accounts for outliers (very large athletes, very small
  // older adults).
  bmr = Math.min(Math.max(bmr, 900), 3000);

  // Activity multiplier
  const activityMultiplier = hasWorkoutToday ? 1.55 : 1.3;
  const tdee = Math.round(bmr * activityMultiplier);

  // Target based on goal
  let targetCalories: number;
  let targetLabel: string;
  if (userGoal === 'WEIGHT_LOSS') {
    targetCalories = tdee - 400;
    targetLabel = 'дефицит ~400 ккал';
  } else if (userGoal === 'MUSCLE_GAIN') {
    targetCalories = tdee + 300;
    targetLabel = 'профицит ~300 ккал';
  } else {
    targetCalories = tdee;
    targetLabel = 'поддержание';
  }

  const consumed = Math.round(todayMeals.reduce((sum, m) => sum + m.totalCalories, 0));
  const balance = consumed - targetCalories;

  const lines: string[] = [];
  lines.push(`Расчётный TDEE: ~${tdee} ккал (${targetLabel})`);
  lines.push(`Цель: ~${targetCalories} ккал | Съедено: ${consumed} ккал`);

  if (balance > 200) {
    lines.push(`⚠️ Превышение на ~${balance} ккал${userGoal === 'WEIGHT_LOSS' ? ' — может замедлить похудение' : ''}`);
  } else if (balance < -500 && userGoal !== 'WEIGHT_LOSS') {
    lines.push(`⚠️ Недоедание ~${Math.abs(balance)} ккал — может ухудшить восстановление`);
  }

  return `\n\n## 🔥 КАЛОРИЙНЫЙ БАЛАНС
${lines.join('\n')}
→ Используй при обсуждении питания. Рекомендуй корректировки если баланс не соответствует цели.`;
}
export function analyzeMacroQuality(
  todayMeals: Array<{
    items: Array<{ name: string; protein: number; fats: number; carbs: number; calories: number }>;
  }>,
): string {
  if (todayMeals.length === 0) return '';

  const allItems = todayMeals.flatMap((m) => m.items);
  if (allItems.length === 0) return '';

  const lines: string[] = [];

  // Protein quality: check if protein comes from diverse sources
  const highProteinItems = allItems.filter((item) => item.protein > 10);
  if (highProteinItems.length > 0) {
    lines.push(`Основные источники белка: ${highProteinItems.slice(0, 4).map((i) => `${i.name} (${Math.round(i.protein)}г)`).join(', ')}`);
  }

  // Fat analysis: ratio of protein to fat in items
  const highFatItems = allItems.filter((item) => item.fats > 15 && item.fats > item.protein);
  if (highFatItems.length > 0) {
    lines.push(`⚠️ Жирные продукты: ${highFatItems.slice(0, 3).map((i) => `${i.name} (Ж:${Math.round(i.fats)}г)`).join(', ')}`);
  }

  // Carb quality: simple vs complex (heuristic from item names)
  const simpleCarbs = ['сахар', 'конфет', 'шоколад', 'печенье', 'торт', 'пирож', 'газиров', 'сок', 'варень', 'джем', 'мёд'];
  const hasSugar = allItems.some((item) => simpleCarbs.some((s) => item.name.toLowerCase().includes(s)));
  if (hasSugar) {
    lines.push('⚠️ Обнаружены быстрые углеводы. Замени на сложные: каша, крупа, цельнозерновой хлеб.');
  }

  // Overall protein-to-calorie ratio
  const totalProtein = allItems.reduce((sum, i) => sum + i.protein, 0);
  const totalCalories = allItems.reduce((sum, i) => sum + i.calories, 0);
  if (totalCalories > 0) {
    const proteinPct = Math.round((totalProtein * 4 / totalCalories) * 100);
    if (proteinPct < 20) {
      lines.push(`📊 Доля белка: ${proteinPct}% от калорий (рекомендуется 25-35%)`);
    }
  }

  if (lines.length === 0) return '';

  return `\n\n## 🥗 КАЧЕСТВО ПИТАНИЯ
${lines.join('\n')}
→ Комментируй качество, не только количество. Предлагай замены на более качественные источники.`;
}
export function analyzeNutritionTiming(
  todayMeals: Array<{ createdAt: Date; totalCalories: number; totalProtein: number; totalCarbs: number }>,
  workoutStartTime: Date | null,
  workoutEndTime: Date | null,
): string {
  if (todayMeals.length === 0 || !workoutStartTime) return '';

  const lines: string[] = [];

  // Pre-workout meal (1-3 hours before)
  const preWorkoutWindow = todayMeals.filter((m) => {
    const diff = (workoutStartTime.getTime() - new Date(m.createdAt).getTime()) / (1000 * 60 * 60);
    return diff > 0.5 && diff < 3;
  });

  if (preWorkoutWindow.length === 0) {
    lines.push('⚠️ Нет приёма пищи за 1-3ч до тренировки. Энергия на тренировке может быть ниже.');
    lines.push('💡 Рекомендуй: сложные углеводы + белок за 1.5-2ч до (каша + яйца, рис + курица).');
  } else {
    const preCalories = preWorkoutWindow.reduce((sum, m) => sum + m.totalCalories, 0);
    const preCarbs = preWorkoutWindow.reduce((sum, m) => sum + m.totalCarbs, 0);
    if (preCarbs < 30) {
      lines.push('⚠️ Мало углеводов перед тренировкой. Добавь 30-50г сложных углеводов для энергии.');
    }
  }

  // Post-workout meal (within 2 hours after)
  if (workoutEndTime) {
    const postWorkoutWindow = todayMeals.filter((m) => {
      const diff = (new Date(m.createdAt).getTime() - workoutEndTime.getTime()) / (1000 * 60 * 60);
      return diff > 0 && diff < 2;
    });

    if (postWorkoutWindow.length === 0) {
      const hoursAfter = (Date.now() - workoutEndTime.getTime()) / (1000 * 60 * 60);
      if (hoursAfter > 1 && hoursAfter < 4) {
        lines.push('⚠️ Прошло больше часа после тренировки — поешь! 30-40г белка + углеводы для восстановления.');
      }
    } else {
      const postProtein = postWorkoutWindow.reduce((sum, m) => sum + m.totalProtein, 0);
      if (postProtein < 20) {
        lines.push('⚠️ Мало белка после тренировки. Добавь 25-40г (протеин, яйца, творог).');
      }
    }
  }

  if (lines.length === 0) return '';

  return `\n\n## 🕐 ТАЙМИНГ ПИТАНИЯ
${lines.join('\n')}`;
}
export function monitorFatigueAccumulation(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
    durationMinutes: number | null;
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 4) return '';

  // Split into recent (last 2 workouts) vs older (rest)
  const recent = recentWorkouts.slice(0, 2);
  const older = recentWorkouts.slice(2);

  const calcAvgWeight = (workouts: typeof recentWorkouts) => {
    const allSets = workouts.flatMap((w) =>
      w.exercises.flatMap((e) => e.sets.filter((s) => s.completed && (s.weight || 0) > 0)),
    );
    return allSets.length > 0 ? allSets.reduce((sum, s) => sum + (s.weight || 0), 0) / allSets.length : 0;
  };

  const calcAvgReps = (workouts: typeof recentWorkouts) => {
    const allSets = workouts.flatMap((w) =>
      w.exercises.flatMap((e) => e.sets.filter((s) => s.completed && (s.reps || 0) > 0)),
    );
    return allSets.length > 0 ? allSets.reduce((sum, s) => sum + (s.reps || 0), 0) / allSets.length : 0;
  };

  const recentAvgWeight = calcAvgWeight(recent);
  const olderAvgWeight = calcAvgWeight(older);
  const recentAvgReps = calcAvgReps(recent);
  const olderAvgReps = calcAvgReps(older);

  const weightDrop = olderAvgWeight > 0 ? Math.round(((olderAvgWeight - recentAvgWeight) / olderAvgWeight) * 100) : 0;
  const repsDrop = olderAvgReps > 0 ? Math.round(((olderAvgReps - recentAvgReps) / olderAvgReps) * 100) : 0;

  if (weightDrop < 5 && repsDrop < 5) return '';

  const lines: string[] = [];

  if (weightDrop >= 10) {
    lines.push(`🔴 Средний вес упал на ${weightDrop}% — признак накопленной усталости`);
  } else if (weightDrop >= 5) {
    lines.push(`🟡 Средний вес снизился на ${weightDrop}% — следи за восстановлением`);
  }

  if (repsDrop >= 10) {
    lines.push(`🔴 Среднее кол-во повторов упало на ${repsDrop}% — мышечная усталость нарастает`);
  }

  if (weightDrop >= 10 || repsDrop >= 10) {
    lines.push('💡 Рекомендация: deload-неделя (50-60% от рабочих весов) или 2-3 дня отдыха.');
  }

  return `\n\n## 🔋 НАКОПЛЕННАЯ УСТАЛОСТЬ
${lines.join('\n')}`;
}
export function estimateExecutionQuality(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; type: string }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length === 0) return '';

  const issues: string[] = [];

  for (const w of recentWorkouts.slice(0, 2)) {
    for (const ex of w.exercises) {
      const workingSets = ex.sets.filter((s) => s.completed && s.type !== 'warmup' && (s.weight || 0) > 0);
      if (workingSets.length < 3) continue;

      // Check rep consistency within the same exercise
      const reps = workingSets.map((s) => s.reps || 0);
      const repsDiff = Math.max(...reps) - Math.min(...reps);

      // Big rep drops across sets = possible too heavy
      if (repsDiff > 5 && reps[reps.length - 1] < reps[0] * 0.5) {
        issues.push(`${ex.exercise?.name}: повторы падают с ${reps[0]} до ${reps[reps.length - 1]} — вес может быть слишком большим`);
      }

      // Weight jumps within exercise = inconsistent
      const weights = workingSets.map((s) => s.weight || 0);
      const weightVariance = weights.some((w, i) => i > 0 && Math.abs(w - weights[i - 1]) > weights[0] * 0.2);
      if (weightVariance && weights.length >= 3) {
        issues.push(`${ex.exercise?.name}: вес скачет между подходами — работай с фиксированным весом для стабильности`);
      }
    }
  }

  if (issues.length === 0) return '';

  return `\n\n## 🎯 КАЧЕСТВО ВЫПОЛНЕНИЯ
${issues.slice(0, 3).join('\n')}
→ Предлагай коррекцию весов и техники.`;
}
export function estimateFiberType(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; primaryMuscles: string[] };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; type: string }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Analyze performance: if user performs better at low reps = fast-twitch dominant
  // If performs better at high reps = slow-twitch dominant
  const musclePerformance: Record<string, { lowRepSets: number; highRepSets: number }> = {};

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      const primaryMuscle = ex.exercise?.primaryMuscles?.[0];
      if (!primaryMuscle) continue;

      if (!musclePerformance[primaryMuscle]) {
        musclePerformance[primaryMuscle] = { lowRepSets: 0, highRepSets: 0 };
      }

      for (const s of ex.sets.filter((s) => s.completed && s.type !== 'warmup')) {
        const reps = s.reps || 0;
        if (reps <= 5) musclePerformance[primaryMuscle].lowRepSets++;
        else if (reps >= 12) musclePerformance[primaryMuscle].highRepSets++;
      }
    }
  }

  const insights: string[] = [];

  for (const [muscle, perf] of Object.entries(musclePerformance)) {
    const total = perf.lowRepSets + perf.highRepSets;
    if (total < 5) continue;

    const muscleRu: Record<string, string> = {
      chest: 'Грудь', back: 'Спина', quadriceps: 'Квадрицепс', shoulders: 'Плечи',
      hamstrings: 'Бицепс бедра', biceps: 'Бицепс', triceps: 'Трицепс',
    };

    if (perf.lowRepSets > perf.highRepSets * 2) {
      insights.push(`${muscleRu[muscle] || muscle}: преобладает силовая работа → быстрые мышечные волокна доминируют`);
    } else if (perf.highRepSets > perf.lowRepSets * 2) {
      insights.push(`${muscleRu[muscle] || muscle}: преобладает объёмная работа → хорошая выносливость мышцы`);
    }
  }

  if (insights.length === 0) return '';

  return `\n\n## 🧬 ТРЕНИРОВОЧНЫЙ ПРОФИЛЬ
${insights.slice(0, 3).join('\n')}
💡 Для гипертрофии тренируй ОБОИХ типов волокон: и тяжёлые подходы (3-6 повторов), и объёмные (10-15).`;
}
export function analyzeNutritionTrainingSync(
  todayCalories: number,
  todayProtein: number,
  targetCalories: number,
  targetProtein: number,
  hadWorkoutToday: boolean,
  userGoal: string | null,
): string {
  if (targetCalories <= 0 || todayCalories <= 0 || targetProtein <= 0) return '';

  const caloriePct = Math.round((todayCalories / targetCalories) * 100);
  const proteinPct = Math.round((todayProtein / targetProtein) * 100);

  const issues: string[] = [];

  // Training day but under-eating
  if (hadWorkoutToday && caloriePct < 70) {
    issues.push(`Тренировочный день, но съедено только ${caloriePct}% нормы калорий. Нужно больше энергии!`);
  }

  // Protein always important for training
  if (proteinPct < 60) {
    issues.push(`Белок: только ${proteinPct}% от нормы (${Math.round(todayProtein)}/${targetProtein} г). Мышцам нужен строительный материал.`);
  }

  // Goal-specific checks
  if (userGoal === 'MUSCLE_GAIN' && caloriePct < 90 && hadWorkoutToday) {
    issues.push('Цель набор массы — нужен профицит калорий, особенно в тренировочные дни.');
  }

  if (userGoal === 'WEIGHT_LOSS' && caloriePct > 120) {
    issues.push(`Цель похудение, но калории превышают норму на ${caloriePct - 100}%.`);
  }

  if (issues.length === 0) return '';

  return `\n\n## 🍽️ ПИТАНИЕ × ТРЕНИРОВКИ
${issues.join('\n')}
Помоги скорректировать питание если пользователь спрашивает.`;
}
export function estimateDetailedCalorieBurn(
  exercises: Array<{
    exercise: { category: string; type: string };
    sets: Array<{ duration: number | null; weight: number | null; reps: number | null; completed: boolean }>;
  }>,
  userWeightKg: number,
  durationMinutes: number,
): string {
  if (exercises.length === 0 || durationMinutes <= 0) return '';

  let totalCal = 0;

  for (const ex of exercises) {
    const completedSets = ex.sets.filter(s => s.completed);
    if (completedSets.length === 0) continue;

    if (ex.exercise?.category === 'strength') {
      // MET ~6 for weight training
      const setTime = completedSets.length * 1.5; // ~1.5 min per set including rest
      totalCal += 6 * userWeightKg * (setTime / 60);
    } else if (ex.exercise?.category === 'cardio') {
      const totalDuration = completedSets.reduce((s, set) => s + (set.duration || 0), 0);
      // MET ~8 for moderate cardio
      totalCal += 8 * userWeightKg * (totalDuration / 3600);
    }
  }

  // Add EPOC (excess post-exercise oxygen consumption) ~10%
  totalCal *= 1.1;

  if (totalCal < 50) return '';

  return `\n\n## 🔥 РАСХОД КАЛОРИЙ (оценка)
~${Math.round(totalCal)} ккал за тренировку (${durationMinutes} мин)
+ ~${Math.round(totalCal * 0.1)} ккал EPOC (дожигание после тренировки)
Итого: ~${Math.round(totalCal * 1.1)} ккал
Используй для мотивации при обсуждении питания.`;
}
export function detectDehydrationRisk(
  durationMinutes: number | null,
  intensity: 'light' | 'moderate' | 'heavy' | 'unknown',
  currentHour: number,
): string {
  if (!durationMinutes || intensity === 'unknown') return '';

  let risk = 0;
  if (durationMinutes > 60) risk += 2;
  else if (durationMinutes > 40) risk += 1;

  if (intensity === 'heavy') risk += 2;
  else if (intensity === 'moderate') risk += 1;

  // Summer months or afternoon (proxy for heat)
  const month = new Date().getMonth();
  if (month >= 5 && month <= 8) risk += 1; // June-September
  if (currentHour >= 12 && currentHour <= 16) risk += 1;

  if (risk < 3) return '';

  return `\n\n## 🚰 РИСК ОБЕЗВОЖИВАНИЯ: ${risk >= 5 ? 'ВЫСОКИЙ' : 'УМЕРЕННЫЙ'}
${risk >= 5 ? 'Пей 200-300 мл каждые 15-20 мин во время тренировки!' : 'Не забывай пить воду между подходами.'}
${month >= 5 && month <= 8 ? 'Лето — потери жидкости выше обычного.' : ''}`;
}
export function buildPostWorkoutNutrition(
  minutesSinceLastWorkout: number | null,
  userGoal: string | null,
  todayProteinGrams: number,
  targetProtein: number,
): string {
  if (minutesSinceLastWorkout === null || minutesSinceLastWorkout > 180) return '';

  const remaining = targetProtein - todayProteinGrams;
  const recommendations: string[] = [];

  if (minutesSinceLastWorkout < 30) {
    recommendations.push('⏰ Анаболическое окно! Белок в ближайшие 30-60 мин.');
    if (userGoal === 'MUSCLE_GAIN') {
      recommendations.push('Рекомендация: 30-40 г белка + 50-70 г быстрых углеводов.');
    } else {
      recommendations.push('Рекомендация: 25-30 г белка + лёгкий перекус.');
    }
  } else if (minutesSinceLastWorkout < 120) {
    recommendations.push('Полноценный приём пищи в ближайший час.');
    if (remaining > 30) {
      recommendations.push(`Осталось набрать ${Math.round(remaining)} г белка за день.`);
    }
  }

  if (recommendations.length === 0) return '';

  return `\n\n## 🍗 ПИТАНИЕ ПОСЛЕ ТРЕНИРОВКИ (${minutesSinceLastWorkout} мин назад)
${recommendations.join('\n')}
Предложи конкретные продукты если пользователь спрашивает что поесть.`;
}
export function buildRecoveryNutritionGuide(
  lastWorkoutIntensity: 'light' | 'moderate' | 'heavy' | 'unknown',
  userGoal: string | null,
): string {
  if (lastWorkoutIntensity === 'unknown') return '';

  const foods: Record<string, string[]> = {
    heavy: [
      'Куриная грудка + рис + овощи (40г белка, 60г углеводов)',
      'Творог 5% + банан + мёд (30г белка, быстрые углеводы)',
      'Протеиновый коктейль + овсянка (35г белка)',
    ],
    moderate: [
      'Яйца + тост с авокадо (25г белка)',
      'Греческий йогурт + орехи + ягоды (20г белка)',
      'Тунец + картофель (30г белка)',
    ],
    light: [
      'Фрукты + горсть орехов',
      'Кефир + банан',
      'Лёгкий салат с курицей',
    ],
  };

  const applicable = foods[lastWorkoutIntensity] || foods['moderate'];

  // Порции после тренировки на дефиците и на массе — разные, и цель приходила
  // сюда, не влияя ни на что: человеку на похудении предлагали грудку с рисом
  // на 60 г углеводов ровно теми же словами, что и на наборе.
  const goalNote = {
    WEIGHT_LOSS: 'На дефиците: белок оставь как есть, углеводы урежь примерно вдвое. Приём после тренировки — не бонус сверх нормы, а часть дневной калорийности.',
    MUSCLE_GAIN: 'На массе: это самый удобный момент добрать углеводы за день — после нагрузки они уходят в мышцы охотнее всего.',
    STRENGTH: 'На силе главное — белок и достаточно углеводов, чтобы восстановить гликоген к следующей тяжёлой сессии.',
    ENDURANCE: 'На выносливость углеводы важнее белка: 1-1.2 г на кг веса в первые два часа, иначе следующая длинная тренировка не пойдёт.',
  }[String(userGoal || '')];

  return `\n\n## 🥗 ЕДА ДЛЯ ВОССТАНОВЛЕНИЯ
После ${lastWorkoutIntensity === 'heavy' ? 'тяжёлой' : lastWorkoutIntensity === 'moderate' ? 'средней' : 'лёгкой'} тренировки:
${applicable.map(f => `- ${f}`).join('\n')}${goalNote ? `\n${goalNote}` : ''}
Предложи конкретную еду если пользователь спрашивает что поесть.`;
}
export function bustNutritionMyths(message: string): string {
  const myths = [
    {
      triggers: /протеин.*(порош|коктейл|добавк)/i,
      fact: 'Протеиновые порошки — просто еда. Нет разницы между порошковым и пищевым белком (если нет проблем с ЖКТ). Используй для удобства, не как замену обычного питания.',
    },
    {
      triggers: /жир.*(замедл|плох|нельзя)/i,
      fact: 'Жиры необходимы! Без них не усваиваются витамины A/D/E/K и не производятся гормоны. Ешь жиры, но выбирай ненасыщенные: орехи, рыба, авокадо.',
    },
    {
      triggers: /соль.*(вред|нельзя|убирать)/i,
      fact: 'Для спортсменов соль важна! Теряешь натрий с потом. Иодированная соль в норме (3-5г/день) полезна. Избыток вреден, но полный отказ — тоже.',
    },
    {
      triggers: /гейнер.*(набор|масс)/i,
      fact: 'Гейнер работает только если ешь меньше нормы. Дешевле и эффективнее: рис + куриная грудка + банан дадут те же макросы.',
    },
    {
      triggers: /кардио.*(натощак|утро.*жир)/i,
      fact: 'Кардио натощак НЕ сжигает больше жира по итогу дня. Разница минимальна. Лучше поешь — тренировка будет продуктивнее.',
    },
  ];

  const triggered = myths.filter(m => m.triggers.test(message));
  if (triggered.length === 0) return '';

  return `\n\n## 🔬 ФАКТ О ПИТАНИИ
${triggered.map(t => t.fact).join('\n\n')}`;
}
export function getMacroSplitAdvice(
  goal: string | null,
  bodyWeightKg: number | null,
  trainingDaysPerWeek: number,
): string {
  if (!bodyWeightKg) return '';

  const protein = Math.round(bodyWeightKg * (goal === 'weight_loss' ? 2.2 : goal === 'muscle_gain' ? 2.0 : 1.8));
  let carbPct: number;
  let fatPct: number;

  if (goal === 'weight_loss') {
    carbPct = trainingDaysPerWeek >= 4 ? 35 : 30;
    fatPct = 30;
  } else if (goal === 'muscle_gain') {
    carbPct = 45;
    fatPct = 25;
  } else {
    carbPct = 40;
    fatPct = 30;
  }

  const proteinPct = 100 - carbPct - fatPct;
  const cals = protein * 4 + Math.round(bodyWeightKg * 35);
  const carbs = Math.round((cals * carbPct) / 100 / 4);
  const fats = Math.round((cals * fatPct) / 100 / 9);

  return `\n\n## 🥩 РЕКОМЕНДУЕМОЕ СООТНОШЕНИЕ МАКРОСОВ
Цель: ${goal === 'weight_loss' ? 'похудение' : goal === 'muscle_gain' ? 'набор массы' : 'поддержание формы'}
Белок: ~${protein}г/день (${proteinPct}% калорий)
Углеводы: ~${carbs}г/день (${carbPct}% калорий)
Жиры: ~${fats}г/день (${fatPct}% калорий)
Используй если пользователь спрашивает про питание или похудение.`;
}
export function getCaloricStrategyAdvice(
  tdee: number | null,
  currentCals: number,
  goal: string | null,
  bodyWeightKg: number | null,
): string {
  if (!tdee || tdee <= 0 || !bodyWeightKg) return '';

  let target: number;
  let explanation: string;

  if (goal === 'weight_loss') {
    target = Math.max(tdee - 500, bodyWeightKg * 22); // max 500 kcal deficit, min 22 kcal/kg
    const deficitPct = Math.round(((tdee - target) / tdee) * 100);
    explanation = `Дефицит ${tdee - target} ккал/день (~${deficitPct}%) → потеря ~0.5кг/нед`;
  } else if (goal === 'muscle_gain') {
    target = tdee + 200; // lean bulk
    explanation = `Профицит +200 ккал/день → медленный набор мышц без лишнего жира`;
  } else {
    target = tdee;
    explanation = `Поддержание веса: TDEE ≈ расход = потребление`;
  }

  const diff = currentCals - target;
  const status = Math.abs(diff) < 100 ? '✅ В норме' :
    diff > 0 ? `⚠️ Превышение на ${Math.round(diff)} ккал` :
    `⚠️ Недобор ${Math.abs(Math.round(diff))} ккал`;

  return `\n\n## 🔢 КАЛОРИЙНАЯ СТРАТЕГИЯ
TDEE: ~${tdee} ккал | Цель: ~${target} ккал | Сегодня: ${currentCals} ккал
Статус: ${status}
${explanation}`;
}
export function getProteinTimingPersonalized(
  workoutTimeHour: number | null,
  bodyWeightKg: number | null,
  goal: string | null,
): string {
  if (!bodyWeightKg) return '';

  const proteinPerKg = goal === 'muscle_gain' ? 2.2 : goal === 'weight_loss' ? 2.0 : 1.8;
  const totalProtein = Math.round(bodyWeightKg * proteinPerKg);
  const meals = 4;
  const perMeal = Math.round(totalProtein / meals);

  const timingAdvice = workoutTimeHour !== null
    ? workoutTimeHour < 12
      ? `Перед тренировкой (~07:00): ${perMeal}г белка. После тренировки (30-60 мин): ещё ${perMeal}г`
      : workoutTimeHour < 17
      ? `Перед тренировкой: лёгкий перекус с белком. После тренировки: ${perMeal}г белка в течение часа`
      : `Вечерняя тренировка: после — ${perMeal}г белка. Перед сном: творог или казеин (медленный белок)`
    : `Распредели ${totalProtein}г белка на ${meals} приёма пищи (~${perMeal}г/приём)`;

  return `\n\n## 🥩 БЕЛОК: ${totalProtein}г/ДЕНЬ
${timingAdvice}
Распределяй равномерно — усвоение белка за 1 приём ограничено (~40г).`;
}
export function syncNutritionWithWorkout(
  lastMealHoursAgo: number | null,
  workoutDurationMinutes: number | null,
  bodyWeightKg: number | null,
  goal: string | null,
): string {
  if (!bodyWeightKg) return '';

  const parts: string[] = [];

  // Pre-workout
  if (lastMealHoursAgo !== null) {
    if (lastMealHoursAgo > 4) {
      parts.push('⚠️ Давно не ел — съешь что-то за 30-60 мин до тренировки (банан + творог или рис + курица)');
    } else if (lastMealHoursAgo < 0.5) {
      parts.push('⚠️ Поел менее 30 мин назад — возможен дискомфорт при высокой интенсивности');
    } else {
      parts.push(`✅ Последний приём пищи ${lastMealHoursAgo.toFixed(1)}ч назад — хорошо`);
    }
  }

  // Post-workout
  if (workoutDurationMinutes && workoutDurationMinutes > 45) {
    const postProtein = Math.round(bodyWeightKg * 0.4);
    const postCarbs = Math.round(bodyWeightKg * (goal === 'muscle_gain' ? 0.8 : 0.5));
    parts.push(`После тренировки (в течение 60 мин): ${postProtein}г белка + ${postCarbs}г углеводов`);
  }

  if (parts.length === 0) return '';

  return `\n\n## 🍽️ ПИТАНИЕ И ТРЕНИРОВКА
${parts.join('\n')}`;
}
export function calculateWaterNeeds(
  bodyWeightKg: number | null,
  workoutDurationMinutes: number | null,
  workoutIntensity: 'low' | 'medium' | 'high',
): string {
  if (!bodyWeightKg) return '';

  const baseWater = Math.round(bodyWeightKg * 35); // mL/day
  const workoutWater = workoutDurationMinutes
    ? Math.round(workoutDurationMinutes * (workoutIntensity === 'high' ? 12 : workoutIntensity === 'medium' ? 8 : 5))
    : 0;
  const totalWater = baseWater + workoutWater;

  const electrolytes = workoutDurationMinutes && workoutDurationMinutes > 60
    ? '\nПри тренировке >60 мин добавь электролиты: 1г соли + 400мг калия (банан) + 200мг магния'
    : '';

  return `\n\n## 💧 ПОТРЕБНОСТЬ В ВОДЕ
База: ${baseWater} мл/день (${Math.round(baseWater / 1000 * 10) / 10}л)
${workoutWater > 0 ? `Тренировка (+${workoutDurationMinutes} мин): +${workoutWater} мл` : ''}
Итого: **~${totalWater} мл (${Math.round(totalWater / 1000 * 10) / 10}л)**${electrolytes}`;
}
export function getFlexibleDietingAdvice(
  message: string,
  dailyProtein: number,
  dailyCalories: number,
  targetProtein: number | null,
  targetCalories: number | null,
): string {
  const flexKeywords = /можно ли|можно съесть|вписыватся|вписывается|читмил|IIFYM|гибкая диет/i;
  if (!flexKeywords.test(message)) return '';

  if (!targetProtein || !targetCalories) return '';

  const proteinDone = Math.round((dailyProtein / targetProtein) * 100);
  const calsDone = Math.round((dailyCalories / targetCalories) * 100);
  const remainingCals = targetCalories - dailyCalories;
  const remainingProtein = Math.round(targetProtein - dailyProtein);

  return `\n\n## 🍕 ГИБКАЯ ДИЕТА (IIFYM)
Прогресс на сегодня: белок ${proteinDone}%, калории ${calsDone}%
${remainingCals > 0 ? `Осталось: ${remainingCals} ккал и ${remainingProtein}г белка` : `⚠️ Лимит калорий исчерпан`}
Принцип IIFYM: если белок выполнен и калории в пределах — можно есть что угодно. Без запрещённых продуктов.`;
}
export function scoreNutritionQuality(
  protein: number,
  carbs: number,
  fats: number,
  calories: number,
  targetProtein: number | null,
  targetCalories: number | null,
): string {
  if (calories < 100) return ''; // no food today

  const scores: Array<{ name: string; score: number; feedback: string }> = [];

  // Protein adequacy
  if (targetProtein) {
    const pScore = Math.min(100, Math.round((protein / targetProtein) * 100));
    scores.push({
      name: 'Белок',
      score: pScore,
      feedback: pScore >= 90 ? '✅' : pScore >= 60 ? '🟡 немного не хватает' : '🔴 сильно не хватает',
    });
  }

  // Caloric balance
  if (targetCalories) {
    const diff = Math.abs(calories - targetCalories);
    const cScore = diff < 100 ? 100 : diff < 200 ? 80 : diff < 400 ? 60 : 30;
    scores.push({
      name: 'Калории',
      score: cScore,
      feedback: cScore >= 90 ? '✅ в норме' : calories > targetCalories ? `🟡 +${diff} ккал` : `🟡 -${diff} ккал`,
    });
  }

  // Macro balance
  const totalMacros = protein + carbs + fats;
  if (totalMacros > 0) {
    const protPct = Math.round((protein * 4 / calories) * 100);
    const balanced = protPct >= 20 && protPct <= 35;
    scores.push({
      name: 'Баланс',
      score: balanced ? 90 : 60,
      feedback: balanced ? '✅ сбалансировано' : '🟡 скорректируй макросы',
    });
  }

  if (scores.length === 0) return '';

  return `\n\n## 🥗 КАЧЕСТВО ПИТАНИЯ СЕГОДНЯ
${scores.map(s => `${s.name}: ${s.feedback}`).join(' | ')}`;
}
export function suggestFoodSwaps(message: string): string {
  const swaps: Array<{ trigger: RegExp; swap: string }> = [
    {
      trigger: /бургер|фастфуд|макдо|бигмак/i,
      swap: 'Бургер → котлета из куриной грудки + цельнозерновой хлеб: те же ~500 ккал, но 40г белка вместо 20г',
    },
    {
      trigger: /чипсы|снеки|сухарики/i,
      swap: 'Чипсы → орехи или творог: меньше калорий, больше белка, нет пустых углеводов',
    },
    {
      trigger: /соки|лимонад|газировка/i,
      swap: 'Сок/газировка → вода + 1 ст. л. лимонного сока + стевия: 0 калорий вместо 200+',
    },
    {
      trigger: /белый хлеб|батон/i,
      swap: 'Белый хлеб → гречка или бурый рис: медленные углеводы, больше клетчатки',
    },
    {
      trigger: /сладкое|торт|шоколад|конфеты/i,
      swap: 'Торт → протеиновый батончик или творог с фруктами: удовлетворишь тягу к сладкому с пользой',
    },
  ];

  const triggered = swaps.filter(s => s.trigger.test(message));
  if (triggered.length === 0) return '';

  return `\n\n## 🔄 УМНЫЕ ЗАМЕНЫ В ПИТАНИИ
${triggered.map(s => `• ${s.swap}`).join('\n')}`;
}
export function getIntraWorkoutHydration(
  workoutDurationMinutes: number | null,
  bodyWeightKg: number | null,
): string {
  if (!workoutDurationMinutes || workoutDurationMinutes < 30) return '';

  const sweatRate = bodyWeightKg ? Math.round(bodyWeightKg * 8) : 500; // ~8ml/kg/hour
  const totalSweat = Math.round(sweatRate * (workoutDurationMinutes / 60));

  return `\n\n## 🥤 ПИТЬЕВОЙ РЕЖИМ ВО ВРЕМЯ ТРЕНИРОВКИ
Перед тренировкой: 400-600 мл за 1-2 часа
Во время: ${Math.round(sweatRate / 4)} мл каждые 15 мин (итого ~${totalSweat} мл)
${workoutDurationMinutes > 60 ? 'После 60 мин: добавь электролиты (изотоник или щепотку соли)' : ''}
После: восполни потери — весь за ${workoutDurationMinutes} мин потерял ~${totalSweat} мл`;
}
export function optimizeMealTiming(workoutTimeHour: number | null, goal: string | null, message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['когда есть', 'питание до', 'питание после', 'перед тренировкой', 'после тренировки', 'что съесть'].some(kw => lowerMsg.includes(kw));

  if (!isRelevant || workoutTimeHour === null) return '';

  const isMorning = workoutTimeHour < 10;
  const isEvening = workoutTimeHour >= 18;

  let preMeal = '';
  let postMeal = '';

  if (isMorning) {
    preMeal = 'За 30-60 мин: банан + кофе или протеиновый коктейль (если тренировка на пустой желудок — норма при похудении)';
    postMeal = 'Сразу после: полноценный завтрак — яйца, овсянка, творог';
  } else if (isEvening) {
    preMeal = 'За 1.5-2 часа: углеводы + белок (рис + курица, картофель + рыба)';
    postMeal = 'После: лёгкий белковый перекус (творог, яйца). Не ешьте тяжёлую пищу за 2 часа до сна';
  } else {
    preMeal = 'За 1-2 часа: смешанная еда с белком и углеводами';
    postMeal = 'В течение 30-60 мин: белок + быстрые углеводы';
  }

  const goalAdvice = goal === 'weight_loss'
    ? '\n💡 При похудении: питание после тренировки обязательно — иначе мышцы разрушаются, а не жир'
    : goal === 'muscle_gain'
    ? '\n💡 При наборе: увеличьте порцию углеводов после тренировки на 30-50г'
    : '';

  return `\n\n🍽 Тайминг питания для ваших тренировок (~${workoutTimeHour}:00):
До: ${preMeal}
После: ${postMeal}${goalAdvice}`;
}
export function calculateDailyWaterNeeds(bodyWeightKg: number | null, workoutDurationMinutes: number, message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['вода', 'сколько пить', 'гидратация', 'обезвоживание'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const bw = bodyWeightKg ?? 80;
  const baseWater = bw * 35; // ml
  const workoutWater = workoutDurationMinutes * 8; // ~8ml per minute
  const totalMl = baseWater + workoutWater;
  const totalL = (totalMl / 1000).toFixed(1);

  return `\n\n💧 Норма воды для вас:
Базовая потребность: ${(baseWater / 1000).toFixed(1)}л/день
Тренировочные потери: +${(workoutWater / 1000).toFixed(1)}л
**Итого: ${totalL}л/день**

Распределение:
• 500мл за 2 часа до тренировки
• 150-250мл каждые 15-20 мин во время
• 500-700мл в течение часа после
• Остаток равномерно в течение дня

Признак достаточной гидратации: светло-жёлтая моча.`;
}
export function rankProteinSources(message: string, goal: string | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['белок', 'протеин', 'источники белка', 'что есть для мышц', 'сколько белка', 'белковая пища'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  interface ProteinSource { food: string; per100g: number; absorption: string; note: string }
  const sources: ProteinSource[] = [
    { food: 'Куриная грудка', per100g: 31, absorption: '~80%', note: 'лучшее соотношение цена/белок' },
    { food: 'Творог 0-5%', per100g: 18, absorption: '~75%', note: 'казеин — медленный, идеален перед сном' },
    { food: 'Яйца (целые)', per100g: 13, absorption: '~91%', note: 'самый биодоступный натуральный белок' },
    { food: 'Говядина', per100g: 26, absorption: '~74%', note: 'содержит креатин и железо' },
    { food: 'Рыба (тунец/треска)', per100g: 25, absorption: '~76%', note: 'омега-3 бонус' },
    { food: 'Сывороточный протеин', per100g: 80, absorption: '~95%', note: 'быстрейшее усвоение — идеален после тренировки' },
  ];

  const lines = sources.map(s => `• **${s.food}**: ${s.per100g}г белка/100г (усвоение ${s.absorption}) — ${s.note}`).join('\n');

  // Список один, но выбирают из него по-разному. Цель приходила в функцию и
  // не использовалась — рейтинг был одинаковым на сушке и на массе.
  const goalLine = {
    WEIGHT_LOSS: 'На дефиците смотри не только на белок: грудка и треска дают его почти без калорий, говядина и целые яйца — заметно дороже по калорийности.',
    MUSCLE_GAIN: 'На массе жирность источника — плюс, а не минус: она добирает калории. Творог 5% и целые яйца удобнее обезжиренных.',
    STRENGTH: 'На силе бери говядину и яйца: цельные продукты дают ещё креатин и железо, которых нет в изоляте.',
    ENDURANCE: 'На выносливость белок нужен в меньшем объёме, но регулярно — рыба и яйца между приёмами, а не одна большая порция.',
  }[String(goal || '')];

  return `\n\n🥩 Рейтинг источников белка:\n${lines}${goalLine ? `\n${goalLine}` : ''}`;
}
export function calculateMacros(bodyWeightKg: number | null, goal: string | null, activityLevel: string | null, message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['кбжу', 'макросы', 'сколько белка', 'сколько углеводов', 'сколько жиров', 'рассчитай питание', 'норма питания'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant || !bodyWeightKg) return '';

  const bw = bodyWeightKg;
  let proteinG = 0, fatG = 0, carbsG = 0, calories = 0;

  const activityMultiplier = activityLevel === 'high' ? 1.6 : activityLevel === 'medium' ? 1.4 : 1.2;
  const bmr = bw * 22 * activityMultiplier; // simplified

  if (goal === 'weight_loss') {
    calories = Math.round(bmr * 0.85);
    proteinG = Math.round(bw * 2.2);
    fatG = Math.round(bw * 0.8);
    carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  } else if (goal === 'muscle_gain') {
    calories = Math.round(bmr * 1.1);
    proteinG = Math.round(bw * 2.0);
    fatG = Math.round(bw * 1.0);
    carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  } else {
    calories = Math.round(bmr);
    proteinG = Math.round(bw * 1.8);
    fatG = Math.round(bw * 0.9);
    carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  }

  carbsG = Math.max(carbsG, 50);

  return `\n\n📊 Расчёт КБЖУ для вас (${bw}кг):
🔥 Калории: **${calories} ккал/день**
🥩 Белки: **${proteinG}г** (${proteinG * 4} ккал)
🧈 Жиры: **${fatG}г** (${fatG * 9} ккал)
🍚 Углеводы: **${carbsG}г** (${carbsG * 4} ккал)

Это примерный расчёт. Отслеживайте вес 2 недели и корректируйте на ±100-200 ккал.`;
}
export function guideFastingAndTraining(message: string, lastMealHoursAgo: number | null): string {
  const lowerMsg = message.toLowerCase();
  const isFastingMsg = ['натощак', 'без еды', 'голодный', 'интервальное голодание', '16/8', 'пост'].some(kw => lowerMsg.includes(kw));
  const isLongFast = lastMealHoursAgo !== null && lastMealHoursAgo > 12;

  if (!isFastingMsg && !isLongFast) return '';

  return `\n\n🕐 Тренировки натощак / при голодании:

**Работает для похудения?** Да, но незначительно больше, чем с едой. Разница 5-10% от жиросжигания.

**Риски натощак:**
• Снижение интенсивности (−10-15% от максимального)
• Повышенный катаболизм мышц (особенно при длительных тренировках)
• Головокружение, падение концентрации

**Если тренируетесь натощак:**
• Принимайте 5-10г BCAA или 20г протеина перед тренировкой
• Сокращайте тренировку до 45-50 мин
• Первым делом после — полноценный белково-углеводный приём пищи
• Подходит для: лёгкого кардио, разминочных тренировок — но НЕ для тяжёлых силовых`;
}
export function teachNutritionLabelReading(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['состав продукта', 'читать этикетку', 'что на упаковке', 'искусственный сахар', 'добавки в еде', 'е-номера', 'пальмовое масло'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n🏷 Как читать этикетки продуктов:

**На что смотреть в первую очередь:**
1. **Состав** — ингредиенты в порядке убывания веса. Сахар в первых 3 = много сахара.
2. **Размер порции** — производители часто занижают (30г чипсов = полпачки).
3. **Белок** — для спортивного питания нужно 70-80г белка на 100г продукта.

**Скрытый сахар (более 60 названий!):**
Мальтоза, декстроза, фруктоза, сироп агавы, рисовый сироп — всё это сахар.

**Что избегать:**
• Частично гидрогенизированные масла = трансжиры
• Нитрит натрия (E250) в колбасах — канцероген при нагреве
• Аспартам (E951) — при чувствительности может вызывать головные боли

**Хорошие знаки на этикетке:**
✅ Короткий список ингредиентов
✅ Белок > жиры > углеводы (для протеиновых продуктов)
✅ Отсутствие "усилитель вкуса" (глутамат натрия) в здоровой пище`;
}
export function guideMealPrep(message: string, goal: string | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['приготовить на неделю', 'meal prep', 'заготовки', 'готовить заранее', 'нет времени готовить'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const goalStr = goal === 'weight_loss' ? 'для похудения' : goal === 'muscle_gain' ? 'для набора' : 'для поддержки';

  return `\n\n🍱 Meal Prep на неделю ${goalStr}:

**Воскресенье (2-2.5 часа → еда на 5 дней):**

**Белки:**
• 1.5кг куриного филе — отварить/запечь порциями по 150г
• 12-15 яиц — сварить вкрутую
• 500г творога — разложить по контейнерам

**Углеводы:**
• 500г риса или гречки — сварить, разложить порциями 150г
• 1кг картофеля — запечь целиком

**Овощи:**
• Нарезать и запечь микс (брокколи, перец, цукини) — 2 противня

**Хранение:** холодильник 4-5 дней / морозилка до 3 месяцев
**Итог:** 15-20 порций за 2.5 часа работы = 3-4 приёма пищи × 5 дней`;
}
export function adviseCaloricDeficit(bodyWeightKg: number | null, goal: string | null, message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['дефицит', 'сколько есть', 'калорийность для похудения', 'дефицит калорий', 'как похудеть'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant || goal !== 'weight_loss') return '';

  const bw = bodyWeightKg ?? 80;
  const tdee = bw * 33; // rough TDEE estimate
  const mildDeficit = Math.round(tdee * 0.85);
  const moderateDeficit = Math.round(tdee * 0.75);

  return `\n\n📉 Дефицит калорий для похудения (${bw}кг):

Ваше примерное TDEE: ~${Math.round(tdee)} ккал/день

**Умеренный дефицит (рекомендуется):**
${mildDeficit} ккал/день = дефицит ~${Math.round(tdee - mildDeficit)} ккал
Потеря: ~0.3-0.5кг/неделю — сохраняет мышцы

**Агрессивный дефицит (временно):**
${moderateDeficit} ккал/день = дефицит ~${Math.round(tdee - moderateDeficit)} ккал
Потеря: ~0.7-1кг/неделю — риск потери мышц

⚠️ Ниже ${Math.round(bw * 22)} ккал не опускайтесь — начнётся потеря мышечной массы.
💡 Белок при похудении: минимум ${Math.round(bw * 2)}г/день — предотвращает катаболизм.`;
}
export function adviseNutritionPeriodization(goal: string | null, workoutsPerWeek: number): string {
  if (!goal || workoutsPerWeek === 0) return '';

  const isStrengthDay = workoutsPerWeek >= 4;

  if (goal === 'muscle_gain' && isStrengthDay) {
    return `\n\n🍽 Нутриционная периодизация для набора:
**В дни тренировок:** +200-300 ккал, акцент на углеводы (рис, картофель, хлеб)
**В дни отдыха:** базовые калории, акцент на белок и жиры
**Эффект:** тело получает топливо когда нужно, нет лишнего жира в дни отдыха`;
  }
  if (goal === 'weight_loss') {
    return `\n\n🍽 Нутриционная периодизация для похудения:
**В дни тренировок:** ~300 ккал дополнительно (в основном углеводы до и после)
**В дни отдыха:** максимальный дефицит (−400-500 ккал)
**Эффект:** мышцы получают питание перед тренировкой, жир горит активнее в дни отдыха`;
  }

  return '';
}
export function adviseDietType(message: string, goal: string | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['кето', 'интервальное', 'вегетарианская диета', 'карбоциклинг', 'какая диета', 'какое питание'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const diets: Record<string, { pros: string; cons: string; forGoal: string[] }> = {
    'кето': {
      pros: 'Быстрое начальное похудение, подавление аппетита',
      cons: 'Снижает производительность в силовых, сложно набрать мышцы',
      forGoal: ['weight_loss'],
    },
    'интервальное голодание (16/8)': {
      pros: 'Гибкость, лёгкий дефицит, повышение GH',
      cons: 'Может снизить мышечный синтез при утренних тренировках',
      forGoal: ['weight_loss', 'maintenance'],
    },
    'карбоциклинг': {
      pros: 'Максимум гликогена в дни тренировок, дефицит в дни отдыха',
      cons: 'Сложно планировать, требует чёткого расписания',
      forGoal: ['muscle_gain', 'weight_loss'],
    },
    'высокобелковое питание': {
      pros: 'Максимальный мышечный синтез, насыщение',
      cons: 'Нагрузка на почки при хронических заболеваниях',
      forGoal: ['muscle_gain', 'strength'],
    },
  };

  const matchedDiet = Object.entries(diets).find(([name]) => lowerMsg.includes(name.split(' ')[0]));
  if (!matchedDiet) {
    const bestDiet = goal === 'weight_loss' ? 'Умеренный дефицит + высокий белок' : goal === 'muscle_gain' ? 'Профицит + высокий белок + карбоциклинг' : 'Сбалансированное питание КБЖУ без жёстких ограничений';
    return `\n\n🥗 Оптимальный тип питания для вашей цели:\n${bestDiet}\n💡 Лучшая диета — та, которой вы придерживаетесь. Гибкость > строгость.`;
  }

  const [name, info] = matchedDiet;
  return `\n\n🥗 ${name}:\n✅ Плюсы: ${info.pros}\n❌ Минусы: ${info.cons}\n${info.forGoal.includes(goal ?? '') ? '✅ Подходит для вашей цели' : '⚠️ Не оптимально для вашей цели — рассмотрите альтернативы'}`;
}
export function getGenderSpecificNutrition(message: string, gender: string | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['девушкам', 'женщинам', 'мужчинам', 'гендер питание', 'цикл и тренировки', 'менструальный цикл'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  if (gender === 'female') {
    return `\n\n👩 Питание и тренировки для женщин:\n\n**Железо:** женщины теряют железо с менструацией — 18мг/день нормa, при дефиците: усталость, снижение VO2max\n**Фолиевая кислота:** важна независимо от планирования беременности — 400мкг/день\n**Кальций:** 1000-1200мг/день (остеопороз чаще у женщин после 40)\n\n**Цикл и тренировки:**\n• Фолликулярная фаза (дни 1-14): высокая энергия → тяжёлые тренировки, силовой максимум\n• Лютеиновая фаза (дни 15-28): усталость → снижайте интенсивность, больше отдыха\n• ПМС → магний 300мг снижает симптомы\n\n**Белок:** те же 1.6-2.0г/кг — миф что "перекачаетесь". У женщин тестостерона в 10-20 раз меньше.`;
  }

  return `\n\n👨 Питание для мужчин-спортсменов:\n• Цинк 15-25мг (тыква, говядина) — тестостерон и иммунитет\n• Витамин D3 2000-4000 МЕ — тестостерон + 30%\n• Ликопин (томаты) — здоровье простаты при высоких физических нагрузках\n• Белок 1.8-2.2г/кг при интенсивных тренировках\n• Омега-3 2-3г — снижает воспаление, улучшает когнитивные функции`;
}
export function getMealFrequencyAdvice(message: string, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['сколько раз есть', 'приёмов пищи', 'частота питания', 'дробное питание', 'meal frequency', 'когда есть', 'режим питания'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const lines: string[] = ['🍽 **Частота приёмов пищи — что говорит наука:**', ''];
  lines.push('**Миф:** "Есть 6 раз в день разгоняет метаболизм"');
  lines.push('**Факт:** Общий калораж и белок важнее, чем количество приёмов.');
  lines.push('');
  lines.push('**Оптимальный диапазон: 3-5 приёмов в день**');
  lines.push('• < 3 приёмов: сложнее набрать нужный белок, высокий дефицит перед тренировкой');
  lines.push('• > 6 приёмов: практически не даёт преимуществ, неудобно для большинства');
  lines.push('');

  if (userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy') {
    lines.push('**Для набора мышц:**');
    lines.push('• 3-5 приёмов с белком каждые 3-5 часов (максимальный синтез белка)');
    lines.push('• Предтренировочный приём: за 1.5-2 часа (углеводы + белок)');
    lines.push('• Послетренировочный: в течение 1-2 часов (30-40г белка + углеводы)');
  } else if (userGoalStr === 'weight_loss' || userGoalStr === 'cutting') {
    lines.push('**Для похудения:**');
    lines.push('• Интервальное питание 16/8 работает не лучше обычного при том же дефиците');
    lines.push('• Но многим проще соблюдать дефицит при 2-3 приёмах (меньше решений о еде)');
    lines.push('• Большой завтрак снижает аппетит днём у большинства людей');
  } else {
    lines.push('**Для поддержания формы:**');
    lines.push('• 3 основных приёма + 1-2 перекуса при необходимости');
    lines.push('• Прислушивайся к голоду — интуитивное питание работает при стабильном весе');
  }

  lines.push('', '💡 Лучшая частота питания — та, которую ты реально можешь соблюдать.');
  return '\n\n' + lines.join('\n');
}
export function getCarbCyclingPlan(message: string, userGoalStr: string | null, calorieTarget: number | null): string {
  const lower = message.toLowerCase();
  const keywords = ['углеводное чередование', 'carb cycling', 'углеводы по дням', 'высокоуглеводный', 'низкоуглеводный день'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isWeightLoss = userGoalStr === 'weight_loss' || userGoalStr === 'cutting';
  const isRecomp = userGoalStr === 'recomp';

  if (!isWeightLoss && !isRecomp) {
    return '\n\n🔄 **Углеводное чередование (carb cycling):**\nЭтот метод наиболее эффективен при похудении или рекомпозиции тела. При наборе мышц проще и эффективнее держать стабильный профицит углеводов.';
  }

  const base = calorieTarget ?? 2000;
  const highCarbDay = Math.round(base * 1.1);
  const lowCarbDay = Math.round(base * 0.85);
  const restDay = Math.round(base * 0.75);

  return `\n\n🔄 **Углеводное чередование:**

**Принцип:** Высокие углеводы в тренировочные дни (топливо + анаболизм), низкие — в дни отдыха (жиросжигание).

**Схема на неделю:**
• 💪 Тренировочный день (тяжёлый): ~${highCarbDay} ккал, углеводы высокие
  - Углеводы: ~${Math.round(base * 0.5 / 4)}г | Белок: ~${Math.round(base * 0.3 / 4)}г | Жиры: ~${Math.round(base * 0.2 / 9)}г
• 🏃 Тренировочный день (лёгкий): ~${base} ккал, углеводы средние
• 😴 День отдыха: ~${restDay} ккал, углеводы низкие
  - Акцент на белок и жиры, минимум крахмала

**Углеводы по категориям:**
• Высокий день: рис, гречка, овсянка, картофель, фрукты — свободно
• Низкий день: только овощи, зелень, ягоды
• Жиры компенсируют энергию в низкоуглеводные дни

⚡ Начни с простой версии: тренировочный день = +200 ккал от нормы, день отдыха = -200 ккал.`;
}
export function getProteinQualityGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['качество белка', 'аминокислоты', 'bcaa', 'лейцин', 'усвояемость белка', 'растительный белок', 'животный белок', 'pdcaas'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🥩 **Качество белка — не все белки одинаковы:**

**Что такое качество белка:**
Определяется аминокислотным составом (особенно незаменимых АК) и усвояемостью.
Ключевой показатель: **PDCAAS** (шкала 0-1) и **DIAAS**.

**Рейтинг источников белка:**
• 🥇 Сывороточный протеин: PDCAAS 1.0, быстрое усвоение, лейцин высокий
• 🥇 Яйца: PDCAAS 1.0, эталонный белок
• 🥇 Молоко/казеин: PDCAAS 1.0, медленное усвоение (на ночь идеален)
• 🥈 Говядина/куриная грудка: PDCAAS ~0.92
• 🥈 Рыба/морепродукты: PDCAAS ~0.9, богаты омега-3
• 🥉 Бобовые: PDCAAS 0.7-0.8 (недостаток метионина у сои)
• 🥉 Зерновые: PDCAAS 0.4-0.6 (лизина мало)

**Лейцин — ключ к синтезу мышц:**
• Порог активации mTOR: ~2.5-3г лейцина = ~25-30г качественного белка
• В 30г сывороточного: ~3г лейцина ✅
• В 30г горохового: ~2г лейцина — нужно больше порция

**Для вегетарианцев/веганов:**
• Комбинируй: рис + горох/соя = полный аминокислотный профиль
• Или используй изолят горохового/соевого протеина
• Потребляй на 20% больше белка (компенсация усвояемости)

💡 Если 80%+ белка из животных источников — не заморачивайся, просто следи за граммами.`;
}
export function getCuttingMistakes(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['сушка', 'cutting', 'сжечь жир', 'жиросжигание', 'дефицит', 'похудение ошибки', 'не могу похудеть', 'плато на сушке'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n⚠️ **Топ ошибок на сушке/жиросжигании:**

**Ошибка 1: Слишком большой дефицит**
Дефицит 1000+ ккал → потеря мышц, замедление метаболизма, потеря силы.
✅ Правило: дефицит 300-500 ккал/день = 0.5-0.7 кг/нед → сохраняешь мышцы.

**Ошибка 2: Слишком мало белка**
При дефиците белок важен ЕЩЁ БОЛЬШЕ, чем при наборе.
✅ 1.8-2.7г белка на кг веса тела при сушке (верхний конец диапазона).

**Ошибка 3: Убрать силовые тренировки**
Силовые тренировки — главный инструмент сохранения мышц при дефиците.
✅ Сохраняй силовые, можно добавить кардио, но не заменять.

**Ошибка 4: Убрать углеводы полностью**
Кето работает, но не лучше обычного дефицита при равном белке.
✅ Если убрал углеводы и просыпаешься — работает. Нет → возвращай умеренно.

**Ошибка 5: Читмил раз в неделю → "заслуженный срыв"**
1 читмил = 3000-5000 ккал = неделя дефицита коту под хвост.
✅ Запланированные читмилы с контролем: +300-500 ккал от нормы (не "ем всё подряд").

**Ошибка 6: Игнорировать жидкие калории**
Кофе с молоком, соки, смузи, алкоголь — незаметно +500-700 ккал.
✅ Считай всё или переходи на воду/чёрный кофе/несладкий чай.`;
}
export function getBulkingMistakes(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['набор массы', 'bulking', 'набираю жир', 'грязный набор', 'профицит', 'ем много', 'набор ошибки'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n⚠️ **Топ ошибок при наборе мышечной массы:**

**Ошибка 1: Слишком большой профицит ("грязный набор")**
Профицит 500+ ккал → больше жира, НЕ больше мышц (мышцы растут медленно).
✅ Оптимальный профицит: +200-300 ккал/день = "чистый набор" (lean bulk).

**Ошибка 2: Недостаточно белка**
Большинство думает "раз в профиците — мышцы растут сами". Нет.
✅ 1.6-2.2г белка на кг при наборе — обязательно.

**Ошибка 3: Тренируешься как на сушке (лёгкий вес, много повторений)**
Мышцы растут в ответ на прогрессирующую нагрузку, а не на "тоннаж".
✅ Прогрессируй в рабочих весах — это главный стимул роста.

**Ошибка 4: Слишком большие циклы без деролла**
8-12+ недель массанабора без разгрузки → рецепторы нечувствительны, прогресс стопорится.
✅ 8-10 нед профицит → 2-3 нед поддержание/лёгкий дефицит → повтор.

**Ошибка 5: Игнорировать состав тела**
"Буду набирать, потом засушусь" — но жир набрать проще, чем убрать.
✅ Когда живот начал расти → снижай профицит или делай мини-сушку.

**Ошибка 6: Ожидать слишком многого**
Натуральный рост: 1-2 кг мышц в месяц максимум у новичков, 0.5 кг — у продвинутых.
✅ Набрал 3 кг за месяц? → бо́льшая часть это жир + вода.`;
}
export function getNighttimeNutrition(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['на ночь', 'перед сном', 'поздно есть', 'ночной перекус', 'nighttime', 'eating at night', 'после 18', 'после 20'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🌙 **Питание вечером и перед сном:**

**Миф: "После 18:00 нельзя есть"**
Это неправда. Набор жира определяется суммой калорий за день, а не временем приёма.

**Что реально важно:**
• Полный дефицит/профицит за сутки — вот что меняет вес
• Переедание вечером → проблема не во времени, а в объёме

**Перед сном — что оптимально:**
• Казеиновый белок (творог, греческий йогурт): медленное высвобождение аминокислот 6-8 часов
• Пример: творог 5% 150-200г + ягоды = 25-30г белка, насыщает, поддерживает синтез белка ночью
• Орехи (20-30г): здоровые жиры, насыщение без скачка инсулина

**Что лучше избегать перед сном:**
• Большие объёмы углеводов и жиров вместе (пицца, паста с соусом) — нарушают сон
• Алкоголь — фрагментирует сон, снижает восстановление на 20-40%
• Кофеин за 6+ часов до сна

**Если поздно тренируешься:**
• Послетренировочный приём важнее времени → ешь после тренировки, не голодай
• Лёгкий вариант: протеиновый коктейль + банан → всё, можно спать

💡 Не ешь за 2-3 часа до сна тяжёлую пищу, но белок перед сном — это плюс для роста мышц.`;
}
export function getAlcoholImpact(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['алкоголь', 'пиво', 'вино', 'выпил', 'alcohol', 'тренировка после алкоголя', 'можно выпить', 'влияние алкоголя'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🍺 **Алкоголь и тренировки — факты:**

**Прямое влияние на рост мышц:**
• Алкоголь подавляет синтез мышечного белка на 37% (исследование Parr et al.)
• Снижает уровень тестостерона на 20-25% (даже умеренное потребление)
• Нарушает синтез гликогена → меньше топлива на следующую тренировку

**Влияние на восстановление:**
• Фрагментирует сон → снижает фазу глубокого сна (там производится ГР)
• Диуретик → обезвоживание → скованность мышц назавтра
• Воспаление усиливается → DOMS тяжелее

**Тренировка после алкоголя:**
• Через 8+ часов после умеренного потребления — снижение силы 5-15%
• После тяжёлой попойки — не тренируйся: риск травмы высок, пользы нет
• Рекомендация: пей воду 1:1 с алкоголем, поешь перед сном

**Умеренность vs отказ:**
• 1-2 напитка в нетренировочный день: минимальное влияние на долгосрок
• Регулярное ежедневное потребление: катастрофа для прогресса
• Серьёзный спортсмен: алкоголь в дни соревнований / пиков — всегда нет

💡 Нет необходимости быть тотальным трезвенником. Но знай цену каждого решения.`;
}
export function getMacroTrackingSimplified(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('кбжу') || lower.includes('макро') || lower.includes('считать') ||
    lower.includes('белок') && lower.includes('углевод') || lower.includes('дневник питания') ||
    lower.includes('подсчёт') || lower.includes('трекинг еды');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📊 УПРОЩЁННЫЙ ПОДСЧЁТ МАКРОСОВ:');
  lines.push('');
  lines.push('🎯 ШАБЛОН "РУКА":');
  lines.push('• Белок: 1 ладонь (25–30 г) × 2–3 раза в день');
  lines.push('• Углеводы: 1 кулак (40–50 г) = 1 порция');
  lines.push('• Жиры: 1 большой палец (10–15 г) = 1 порция');
  lines.push('• Овощи: 2 кулака без подсчёта — всегда можно');
  lines.push('');
  lines.push('📱 МЕТОД "80/20":');
  lines.push('• Считай только белок и калории');
  lines.push('• Жиры и углеводы — по ощущению насыщения');
  lines.push('• Работает у 80% людей без стресса от цифр');
  lines.push('');
  lines.push('🔢 ПРОСТАЯ ФОРМУЛА СТАРТА:');
  lines.push('• Калории = вес (кг) × 30–35 (поддержание)');
  lines.push('• Белок = вес (кг) × 1.8–2.2 г');
  lines.push('• Жиры = 0.8–1 г × кг');
  lines.push('• Углеводы = остаток калорий ÷ 4');
  lines.push('');
  lines.push('💡 ПРИЛОЖЕНИЯ: MyFitnessPal, FatSecret (есть русские продукты)');
  lines.push('Первые 2–4 недели считай → потом будешь чувствовать на глаз.');
  return '\n\n' + lines.join('\n');
}
export function getVegetarianAthleteNutrition(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('вегетариан') || lower.includes('веган') || lower.includes('без мяса') ||
    lower.includes('растительный белок') || lower.includes('plant-based') || lower.includes('соевый') ||
    lower.includes('бобовые') && lower.includes('белок');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🌱 ПИТАНИЕ СПОРТСМЕНА-ВЕГЕТАРИАНЦА:');
  lines.push('');
  lines.push('💪 КАК НАБРАТЬ БЕЛОК БЕЗ МЯСА:');
  lines.push('• Соевый белок: полноценный (все незаменимые АК), 35–36 г/100г сухого');
  lines.push('• Творог / яйца / рыба (лакто/ово-вегетарианцы) — проще всего');
  lines.push('• Чечевица 9 г/100г + рис = полный аминокислотный профиль');
  lines.push('• Темпе / тофу — ферментированная соя, лучше усваивается');
  lines.push('• Гречка + фасоль — российская классика');
  lines.push('');
  lines.push('⚠️ КРИТИЧНЫЕ НУТРИЕНТЫ ДЛЯ ВЕГАНОВ:');
  lines.push('• B12: только из добавок/обогащённых продуктов (дефицит = критично)');
  lines.push('• Железо: негемовое (хуже усваивается). С витамином C усваивается лучше');
  lines.push('• Цинк: тыквенные семечки, бобовые. Замачивай для лучшего усвоения');
  lines.push('• Омега-3: льняное масло (ALA → EPA/DHA конверсия слабая). Водорослевый DHA');
  lines.push('• Кальций: кунжут, тофу, зелень');
  lines.push('');
  lines.push('🥤 ПРОТЕИНОВЫЕ ДОБАВКИ:');
  lines.push('• Соевый протеин — лучший растительный выбор');
  lines.push('• Гороховый + рисовый 50/50 — хороший профиль АК');
  lines.push('');
  lines.push('📊 Реальность: при грамотном подходе веган-атлеты не уступают. Нужно планирование.');
  return '\n\n' + lines.join('\n');
}
export function getRefeedAndDietBreaks(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('рефид') || lower.includes('refeed') || lower.includes('диетический перерыв') ||
    lower.includes('diet break') || lower.includes('обжорств') && lower.includes('план') ||
    lower.includes('углеводная загрузка') || lower.includes('неделя поддержания');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🍚 РЕФИДЫ И ДИЕТИЧЕСКИЕ ПАУЗЫ:');
  lines.push('');
  lines.push('🔄 РЕФИД (1–2 дня):');
  lines.push('• Увеличение калорий до поддерживающих или +5–10%');
  lines.push('• За счёт УГЛЕВОДОВ (не жиров!)');
  lines.push('• Цель: восстановить гликоген, поднять лептин, дать психике отдых');
  lines.push('• Когда: каждые 2–4 недели при дефиците калорий');
  lines.push('• Белок и жиры — без изменений');
  lines.push('');
  lines.push('🗓️ ДИЕТИЧЕСКАЯ ПАУЗА (1–2 недели):');
  lines.push('• Питание на уровне поддержания (ноль дефицита)');
  lines.push('• Восстанавливает метаболические адаптации');
  lines.push('• Снижает уровень кортизола и усталости');
  lines.push('• Когда: каждые 8–12 недель при длительной сушке');
  lines.push('');
  lines.push('📊 ИССЛЕДОВАНИЯ:');
  lines.push('• 2 нед диетической паузы = больший общий жиропотерь за 16 нед');
  lines.push('• Сохраняет мышечную массу лучше непрерывного дефицита');
  lines.push('');
  lines.push('⚠️ Рефид ≠ читмил (читмил = неконтролируемое поедание всего подряд).');
  return '\n\n' + lines.join('\n');
}
export function getIntraWorkoutNutritionAdv(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('во время тренировки') && (lower.includes('есть') || lower.includes('пить') || lower.includes('питан')) ||
    lower.includes('intra') || lower.includes('bcaa') && lower.includes('тренировка') ||
    lower.includes('углеводы во время тренировки') || lower.includes('что пить на тренировке');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🥤 ПИТАНИЕ ВО ВРЕМЯ ТРЕНИРОВКИ (INTRA-WORKOUT):');
  lines.push('');
  lines.push('❓ НУЖНО ЛИ ЭТО:');
  lines.push('• Тренировка <60 мин: нет, достаточно воды');
  lines.push('• Тренировка 60–90 мин: возможно, при натощак или большом объёме');
  lines.push('• Тренировка >90 мин: рекомендуется');
  lines.push('');
  lines.push('🏅 ДЛЯ ТРЕНИРОВОК >60 МИН:');
  lines.push('• 30–60 г быстрых углеводов/час (изотоник, сок, бананы)');
  lines.push('• Гидратация: 400–600 мл/час в зависимости от потения');
  lines.push('');
  lines.push('💊 BCAA — НУЖНЫ ЛИ:');
  lines.push('• При тренировке натощак: небольшой эффект (3–5 г лейцина)');
  lines.push('• При нормальном питании: не нужны (WheyProtein до/после = лучше)');
  lines.push('• Вывод: BCAA — переоценённая и дорогая добавка при адекватном питании');
  lines.push('');
  lines.push('🍋 САМОДЕЛЬНЫЙ ИЗОТОНИК:');
  lines.push('• 500 мл воды + 30–40 г мёда/сахара + щепотка соли');
  lines.push('• Стоит в 10× дешевле магазинного');
  return '\n\n' + lines.join('\n');
}
export function getMacroTimingByGoal(message: string, userGoalStr: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('когда есть') || lower.includes('тайминг') ||
    lower.includes('до или после') || lower.includes('углеводы когда') || lower.includes('белок когда');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏰ ТАЙМИНГ МАКРОСОВ ПО ЦЕЛЯМ:');
  lines.push('');
  const isWeightLoss = (userGoalStr || '').toLowerCase().includes('похуден') || (userGoalStr || '').toLowerCase().includes('сброс');
  const isMuscleGain = (userGoalStr || '').toLowerCase().includes('набор') || (userGoalStr || '').toLowerCase().includes('масс');
  if (isWeightLoss) {
    lines.push('🎯 ЦЕЛЬ: ПОХУДЕНИЕ:');
    lines.push('• Большинство углей — до/после тренировки');
    lines.push('• Вечер: белок + жиры + овощи (меньше углей)');
    lines.push('• Завтрак с белком → сытость на весь день');
  } else if (isMuscleGain) {
    lines.push('🎯 ЦЕЛЬ: НАБОР МАССЫ:');
    lines.push('• Углеводы распределены равномерно + пик до/после тренировки');
    lines.push('• Перед тренировкой (за 1.5–2 ч): углеводы + белок');
    lines.push('• После тренировки (в течение 2 ч): 30–40 г белка + 50 г углеводов');
    lines.push('• Перед сном: казеин / творог (медленный белок)');
  } else {
    lines.push('🎯 ОБЩИЕ ПРИНЦИПЫ:');
    lines.push('• Белок: 3–4 приёма по 25–40 г (максимальный синтез мышечного белка)');
    lines.push('• Углеводы: акцент вокруг тренировки (до + после)');
    lines.push('• Жиры: утром и вечером (не мешают энергетическому обеспечению тренировки)');
  }
  lines.push('');
  lines.push('📌 Важнее тайминга: общий объём нутриентов за сутки.');
  lines.push('Тайминг даёт +5–10% — оптимизация, не основа.');
  return '\n\n' + lines.join('\n');
}
export function getDehydrationImpact(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('обезвожива') || lower.includes('вода') && lower.includes('результат') ||
    lower.includes('жажда') && lower.includes('тренировк') || lower.includes('сколько воды') ||
    lower.includes('гидратация') || lower.includes('электролит');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💧 ОБЕЗВОЖИВАНИЕ И СПОРТИВНЫЕ РЕЗУЛЬТАТЫ:');
  lines.push('');
  lines.push('📉 ПОТЕРИ ОТ ОБЕЗВОЖИВАНИЯ:');
  lines.push('• -1% воды (0.7 кг при 70 кг): концентрация начинает страдать');
  lines.push('• -2%: сила -4–6%, выносливость -8–10%');
  lines.push('• -3%: риск теплового удара, мышечные судороги');
  lines.push('• -5%: критическое состояние, прекрати тренировку');
  lines.push('');
  lines.push('💧 НОРМЫ ВОДЫ:');
  lines.push('• В покое: 30–35 мл × кг веса тела');
  lines.push('• При тренировке: +400–600 мл/час умеренной нагрузки');
  lines.push('• При жаре: +200–300 мл дополнительно');
  lines.push('');
  lines.push('🧪 ЭЛЕКТРОЛИТЫ (важны при тренировках >1 ч):');
  lines.push('• Натрий: главный электролит, теряется с потом');
  lines.push('• Калий: мышечные сокращения (бананы, картофель)');
  lines.push('• Магний: нервная проводимость (орехи, зелень)');
  lines.push('');
  lines.push('🎯 ПРОВЕРКА ГИДРАТАЦИИ: моча светло-жёлтая = норма, тёмная = пей больше.');
  return '\n\n' + lines.join('\n');
}
export function getProteinSynthesisWindowMyth(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('углевод') && lower.includes('после тренировки') ||
    lower.includes('анаболическое окно') || lower.includes('белок после тренировки') ||
    lower.includes('30 минут после') || lower.includes('protein window') ||
    lower.includes('когда пить протеин');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏰ МИФ ОБ "АНАБОЛИЧЕСКОМ ОКНЕ":');
  lines.push('');
  lines.push('🔬 РЕАЛЬНЫЕ ДАННЫЕ:');
  lines.push('• "Анаболическое окно 30 мин после тренировки" — преувеличение 90-х годов');
  lines.push('• Синтез мышечного белка повышен 24–48 ч после тренировки, не 30 мин');
  lines.push('• Мета-анализ 2013: время белка не критично, если суточный объём в норме');
  lines.push('');
  lines.push('📊 ЧТО РЕАЛЬНО ВАЖНО:');
  lines.push('• 1. Суточный белок: 1.8–2.2 г/кг (важнее всего)');
  lines.push('• 2. Распределение: 3–5 приёмов по 25–40 г/порцию');
  lines.push('• 3. Лейцин: не менее 2.5–3 г на приём (запускает mTOR)');
  lines.push('');
  lines.push('✅ ПРАКТИЧЕСКИ:');
  lines.push('• Если тренируешься натощак → протеин после важнее');
  lines.push('• Если ел за 2–3 ч до тренировки → поешь в течение 2–3 ч после = отлично');
  lines.push('• "Срочно выпить протеин прямо в раздевалке" — не обязательно');
  lines.push('');
  lines.push('💡 Фокус на общем объёме белка за сутки, не на тайминге.');
  return '\n\n' + lines.join('\n');
}
export function getCalorieCountingAccuracy(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('точность') && lower.includes('калор') || lower.includes('считаю калори') ||
    lower.includes('не худею') && lower.includes('калори') || lower.includes('ошибки') && lower.includes('подсчёт') ||
    lower.includes('дефицит') && lower.includes('не работает');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🎯 ТОЧНОСТЬ ПОДСЧЁТА КАЛОРИЙ:');
  lines.push('');
  lines.push('📊 ТИПИЧНЫЕ ОШИБКИ:');
  lines.push('• +20% — масло/соусы/заправки (самая частая ошибка!)');
  lines.push('• +15% — "лёгкий перекус" не вписан');
  lines.push('• +10% — разные базы данных калорий (расхождение до 30%)');
  lines.push('• +10% — мерить стаканами/ложками вместо весов');
  lines.push('• Суммарно: людям кажется, что они едят на 30–40% меньше, чем на самом деле');
  lines.push('');
  lines.push('✅ КАК ПОВЫСИТЬ ТОЧНОСТЬ:');
  lines.push('• Кухонные весы (±1 г) — единственный точный способ');
  lines.push('• Считай масло отдельно (1 ст.л. = 90 ккал!)');
  lines.push('• Записывай ВСЁ, включая "маленькие" кусочки');
  lines.push('• Готовое блюдо взвешивай после приготовления (вода испаряется)');
  lines.push('');
  lines.push('🔢 ПОГРЕШНОСТЬ ФОРМУЛ KCAL:');
  lines.push('• Mifflin-St Jeor: ±10% для большинства людей');
  lines.push('• Ресторанная еда: ±25–40%');
  lines.push('• Трекеры тренировок (калории): ±25–30%');
  lines.push('');
  lines.push('💡 Если дефицит есть, но вес стоит → ешь меньше ещё на 100–150 ккал. Дефицит реальный < предполагаемого.');
  return '\n\n' + lines.join('\n');
}
export function getNutritionByBodyType(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('эктоморф') || lower.includes('мезоморф') || lower.includes('эндоморф') ||
    lower.includes('тип телосложения') || lower.includes('конституция') && lower.includes('питание');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🧬 ПИТАНИЕ ПО ТИПУ ТЕЛОСЛОЖЕНИЯ:');
  lines.push('');
  lines.push('⚠️ ДИСКЛЕЙМЕР:');
  lines.push('Типы телосложения — упрощённая модель. Большинство людей — смешанный тип.');
  lines.push('');
  lines.push('ЭКТОМОРФ (худой, узкие кости):');
  lines.push('• Калории: +300–500 ккал выше поддержания');
  lines.push('• Углеводы: 50–55% (высокий метаболизм — нужно топливо)');
  lines.push('• Белок: 2–2.5 г/кг');
  lines.push('• Тренировки: 3–4 дня/нед, без лишнего кардио');
  lines.push('');
  lines.push('МЕЗОМОРФ (атлетичный, хорошая реакция на тренировки):');
  lines.push('• Калории: ±200–300 ккал от поддержания (зависит от цели)');
  lines.push('• Сбалансированное распределение: 40% углей, 30% белок, 30% жиры');
  lines.push('• 4–5 дней тренировок');
  lines.push('');
  lines.push('ЭНДОМОРФ (склонность к набору жира):');
  lines.push('• Калории: дефицит при похудении -300 ккал (мягко)');
  lines.push('• Углеводы: 30–40%, акцент — вокруг тренировок');
  lines.push('• Белок: 2–2.5 г/кг (сохранение мышц)');
  lines.push('• Кардио: 3–4 раза/нед 30–45 мин');
  lines.push('');
  lines.push('📌 Главное: реакция на питание индивидуальна. Тип — ориентир, не приговор.');
  return '\n\n' + lines.join('\n');
}
export function getShiftWorkerNutrition(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('ночная смена') || lower.includes('работаю ночью') ||
    lower.includes('сменный') && lower.includes('работ') || lower.includes('нарушен режим') ||
    lower.includes('нестандартный график') || lower.includes('сутки через трое');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🌙 ПИТАНИЕ И ТРЕНИРОВКИ ДЛЯ РАБОТАЮЩИХ В НОЧЬ:');
  lines.push('');
  lines.push('⚠️ ВЫЗОВЫ:');
  lines.push('• Циркадный ритм нарушен → метаболизм хуже работает ночью');
  lines.push('• Ночные перекусы → склонность к перееданию (высокий грелин)');
  lines.push('• Мелатонин подавлен → ухудшение восстановления');
  lines.push('');
  lines.push('🍽️ СТРАТЕГИЯ ПИТАНИЯ:');
  lines.push('• Главный приём пищи: ДО ночной смены (не во время)');
  lines.push('• На смене: лёгкая еда (белок + некрахмальные овощи)');
  lines.push('• После смены: лёгкий перекус, не объедайся перед сном');
  lines.push('• Высококалорийная еда ночью = хуже усваивается, больше откладывается');
  lines.push('');
  lines.push('🏋️ ТРЕНИРОВКИ:');
  lines.push('• После пробуждения (твой "утренний" = тренировочный пик)');
  lines.push('• Не тренируйся сразу после 12-часовой смены — риск травмы');
  lines.push('• Выходные дни используй для полного отдыха');
  lines.push('');
  lines.push('💊 ДОБАВКИ:');
  lines.push('• Мелатонин 0.5 мг перед сном (после смены)');
  lines.push('• Магний — помогает переключиться на сон');
  return '\n\n' + lines.join('\n');
}
export function getFatigueSignalReading(message: string): string {
  const relevant = /сигнал.+тела|слушать тело|чувствую усталость|переутомлени|не восстановил|нет сил на тренировк/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔍 КАК ЧИТАТЬ СИГНАЛЫ УСТАЛОСТИ ТЕЛА:');
  lines.push('');
  lines.push('🟡 НОРМАЛЬНАЯ УСТАЛОСТЬ (тренируйся):');
  lines.push('• Лёгкая крепатура (DOMS)');
  lines.push('• Усталость к концу дня');
  lines.push('• Снижение мотивации на 1 тренировке');
  lines.push('');
  lines.push('🟠 УМЕРЕННОЕ ПРЕДУПРЕЖДЕНИЕ (снизь нагрузку):');
  lines.push('• ЧСС в покое выше нормы на 5–8 уд/мин');
  lines.push('• Сон >9 ч, но всё равно не отдохнул');
  lines.push('• Снижение силы >10% на ключевых упражнениях');
  lines.push('• Раздражительность, рассеянность');
  lines.push('');
  lines.push('🔴 СТОП — требуется отдых:');
  lines.push('• ЧСС покоя выше нормы на 10+ уд/мин');
  lines.push('• Боль в суставах (не мышцах)');
  lines.push('• Частые болезни (иммунитет угнетён)');
  lines.push('• Снижение аппетита + потеря веса');
  lines.push('');
  lines.push('📱 ИЗМЕРЬ: ЧСС утром лёжа 3 дня подряд — создай личный базовый уровень');
  return '\n\n' + lines.join('\n');
}
export function getProteinWeightLossPreservation(message: string): string {
  const relevant = /белок.+похудени|протеин.+дефицит|сохранить мышцы.+диет|protein.+cut|белок.+сушк/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🥩 БЕЛОК ПРИ ПОХУДЕНИИ — сохрани мышцы:');
  lines.push('');
  lines.push('📊 НОРМЫ:');
  lines.push('• Обычный человек на диете: 1.6–2.0 г/кг');
  lines.push('• Силовые тренировки + дефицит: 2.0–2.6 г/кг');
  lines.push('• Агрессивный дефицит: до 3.0 г/кг (для защиты мышц)');
  lines.push('');
  lines.push('⚡ ПОЧЕМУ ВАЖНО:');
  lines.push('• Белок = самый насыщающий макронутриент');
  lines.push('• Термогенный эффект: 20–30% калорий из белка уходит на переработку');
  lines.push('• Сохраняет LBM (сухую массу) при дефиците');
  lines.push('');
  lines.push('🍳 ИСТОЧНИКИ:');
  lines.push('• Курица, индейка, рыба — нежирные белки');
  lines.push('• Творог, яичные белки — удобно и дёшево');
  lines.push('• Протеиновый порошок — добивать норму');
  lines.push('');
  lines.push('💡 СТРАТЕГИЯ: достигни нормы белка → остальные калории распредели по жирам/углеводам');
  return '\n\n' + lines.join('\n');
}
export function getCardioFatLossComparison(message: string): string {
  const relevant = /кардио.+жир|hiit.+liss|liss.+hiit|кардио для похудени|какое кардио лучше/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏃 КАРДИО ДЛЯ ЖИРОСЖИГАНИЯ — LISS vs HIIT:');
  lines.push('');
  lines.push('🔄 LISS (низкая интенсивность, длительно):');
  lines.push('• 60–70% макс. ЧСС, 30–60 мин');
  lines.push('• Ходьба, лёгкий бег, велосипед');
  lines.push('• Плюсы: не мешает восстановлению, легко добавить');
  lines.push('• Минусы: скучно, много времени, тело адаптируется');
  lines.push('');
  lines.push('⚡ HIIT (высокая интенсивность, интервалы):');
  lines.push('• 20–30 мин, чередование 20–40 сек max / 40–80 сек восстановление');
  lines.push('• Плюсы: EPOC (дожигание калорий после), сохраняет мышцы, эффективно');
  lines.push('• Минусы: тяжело восстанавливаться при силовых, нельзя ежедневно');
  lines.push('');
  lines.push('📋 ОПТИМАЛЬНАЯ СТРАТЕГИЯ:');
  lines.push('• Силовые 3–4 раза/нед + LISS 2–3 раза/нед → хорошо для состава тела');
  lines.push('• HIIT 2 раза/нед MAX если есть силовые');
  lines.push('• Ходьба 7000–10000 шагов/день — самое простое и эффективное');
  lines.push('');
  lines.push('💡 ГЛАВНОЕ: дефицит калорий, кардио — инструмент, не замена диете');
  return '\n\n' + lines.join('\n');
}
export function getDehydrationPerformance(message: string): string {
  const relevant = /обезвоживани|пить.+тренировк|вода.+сила|воды.+спорт|deh?ydrat|electrolyte/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💧 ОБЕЗВОЖИВАНИЕ И РЕЗУЛЬТАТЫ:');
  lines.push('');
  lines.push('📊 ВЛИЯНИЕ НА ПРОИЗВОДИТЕЛЬНОСТЬ:');
  lines.push('• −1% воды от массы тела: снижение выносливости на 5–8%');
  lines.push('• −2%: снижение силы и когнитивных функций');
  lines.push('• −3–4%: значительное падение всех показателей');
  lines.push('• Почти всегда мы уже слегка обезвожены к моменту занятия');
  lines.push('');
  lines.push('💊 ЭЛЕКТРОЛИТЫ:');
  lines.push('• Натрий (Na): потеря с потом → судороги, слабость');
  lines.push('• Калий (K): мышечные сокращения, передача нервных импульсов');
  lines.push('• Магний (Mg): синтез АТФ, расслабление мышц');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ ГИДРАТАЦИИ:');
  lines.push('• До: 400–600 мл за 2 ч');
  lines.push('• Во время: 150–200 мл каждые 15–20 мин');
  lines.push('• После: 1.5 л на каждый кг потерянного веса');
  lines.push('• При тренировке >60 мин или в жару: изотоник или щепотка соли в воду');
  return '\n\n' + lines.join('\n');
}
export function getCuttingMistakesAdv(message: string): string {
  const relevant = /ошибки.+сушка|сушка.+ошибк|ошибки.+дефицит|худею.+не теряю|стоит вес.+диет/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('❌ ОШИБКИ НА СУШКЕ / В ДЕФИЦИТЕ:');
  lines.push('');
  lines.push('🚫 ТОПОВЫЕ ОШИБКИ:');
  lines.push('① Слишком большой дефицит (>1000 ккал) → потеря мышц + метаболическая адаптация');
  lines.push('② Дефицит без силовых → теряешь мышцы, не только жир');
  lines.push('③ Мало белка (<1.6 г/кг) → нечем "защищать" мышечную ткань');
  lines.push('④ Не учитываешь жидкие калории (соки, кофе с молоком, алкоголь)');
  lines.push('⑤ Слишком агрессивное кардио + дефицит → перетренированность и голод');
  lines.push('');
  lines.push('⚠️ МЕТАБОЛИЧЕСКАЯ АДАПТАЦИЯ:');
  lines.push('• Тело снижает расход калорий в ответ на дефицит');
  lines.push('• Диетные паузы (2 нед на поддержке) помогают сбросить адаптацию');
  lines.push('• Рефиды (1–2 дня углеводов) повышают лептин');
  lines.push('');
  lines.push('📋 ПРАВИЛЬНАЯ СУШКА:');
  lines.push('• Дефицит 300–500 ккал/день');
  lines.push('• Белок 2.0–2.4 г/кг');
  lines.push('• Силовые 3–4 раза/нед (сохраняют мышцы)');
  lines.push('• LISS кардио 2–3 раза/нед (доп. расход)');
  return '\n\n' + lines.join('\n');
}
export function getProteinAbsorptionMeals(message: string): string {
  const relevant = /усвоение белка|сколько белка за раз|белок.+за один приём|protein absorption|порция белка/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🥩 УСВОЕНИЕ БЕЛКА — сколько за один приём:');
  lines.push('');
  lines.push('🔬 ИССЛЕДОВАНИЯ:');
  lines.push('• Миф "30 г за раз" — устарел! Тело усваивает любое количество');
  lines.push('• НО: синтез мышечного белка стимулируется ~20–40 г за раз');
  lines.push('• Остальной белок → энергия или другие пути синтеза');
  lines.push('');
  lines.push('📊 ОПТИМАЛЬНОЕ РАСПРЕДЕЛЕНИЕ:');
  lines.push('• 3–5 приёмов белка в день');
  lines.push('• 30–50 г за приём (на тренировочный день)');
  lines.push('• Общая дневная норма важнее распределения');
  lines.push('');
  lines.push('⏰ СПЕЦИАЛЬНЫЕ ПЕРИОДЫ:');
  lines.push('• До тренировки: 20–30 г за 2–3 ч или 20 г за 1 ч');
  lines.push('• После тренировки: 30–40 г (быстрый белок: изолят, яйца)');
  lines.push('• Перед сном: 30–40 г казеина (творог, казеиновый протеин)');
  lines.push('');
  lines.push('🍳 СКОРОСТЬ УСВОЕНИЯ:');
  lines.push('• Быстрый: сывороточный (2–3 ч), яичный белок (2 ч)');
  lines.push('• Медленный: казеин (6–8 ч), мясо/рыба (4–5 ч)');
  return '\n\n' + lines.join('\n');
}
export function getIntermittentFastingAthletes(message: string): string {
  const relevant = /интервальн.+голодан|intermittent fast|16.8|18.6|голодани.+тренировк|IF.+спорт/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏰ ИНТЕРВАЛЬНОЕ ГОЛОДАНИЕ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('📋 СХЕМЫ:');
  lines.push('• 16:8 (наиболее популярный): 16 ч голодания, 8 ч питания');
  lines.push('• 18:6: строже, меньше окно для набора белка');
  lines.push('• Leangains: 16:8 + тренировка перед первым приёмом');
  lines.push('');
  lines.push('✅ ПРЕИМУЩЕСТВА:');
  lines.push('• Упрощает дефицит калорий (меньше окно → меньше едят)');
  lines.push('• Улучшение инсулиновой чувствительности');
  lines.push('• Простота (не считаешь все приёмы)');
  lines.push('');
  lines.push('⚠️ ОГРАНИЧЕНИЯ ДЛЯ АТЛЕТОВ:');
  lines.push('• Сложнее набрать нужное количество белка в узком окне');
  lines.push('• Тренировка натощак → может снизить интенсивность');
  lines.push('• НЕ рекомендуется в период набора массы (нужны калории весь день)');
  lines.push('');
  lines.push('🎯 ОПТИМАЛЬНО ДЛЯ:');
  lines.push('• Жиросжигание при сохранении мышц');
  lines.push('• Эктоморфы с низким аппетитом');
  lines.push('• Тренировка во 2-й половине дня');
  return '\n\n' + lines.join('\n');
}
export function getBulkingStrategies(message: string): string {
  const relevant = /набор масс|булкинг|bulking|набираю вес|калорийный профицит|грязный набор/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 УМНЫЙ НАБОР МАССЫ (BULKING):');
  lines.push('');
  lines.push('📊 ЧИСТЫЙ vs ГРЯЗНЫЙ НАБОР:');
  lines.push('• Грязный (dirty bulk): +500–1000 ккал/день → быстрый набор, но много жира');
  lines.push('• Чистый (clean bulk): +200–350 ккал/день → медленнее, но качественнее');
  lines.push('• Рекомендация: clean bulk — соотношение мышцы:жир лучше');
  lines.push('');
  lines.push('⚡ СТРАТЕГИЯ:');
  lines.push('• Профицит 200–300 ккал в тренировочные дни');
  lines.push('• Поддержка в дни отдыха');
  lines.push('• Белок: 1.8–2.2 г/кг — защита от жиронабора');
  lines.push('');
  lines.push('📅 МИНИБУЛК ЦИКЛ:');
  lines.push('• Набор 8–16 нед → сушка 6–12 нед → повтор');
  lines.push('• Ориентир: если жир >18% (муж) / >28% (жен) → переходи на сушку');
  lines.push('');
  lines.push('🍳 КАЛОРИЙНЫЕ ПРОДУКТЫ ДЛЯ НАБОРА:');
  lines.push('• Орехи, арахисовая паста, оливковое масло');
  lines.push('• Цельные яйца, жирная рыба (лосось)');
  lines.push('• Овсянка, рис, макароны, картофель');
  return '\n\n' + lines.join('\n');
}
export function getCaloricNeedsEstimation(message: string): string {
  const relevant = /сколько калорий|норма калорий|рассчитать ккал|tdee|ТДЭ|basal metabolic|BMR|базальный обмен/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔢 РАСЧЁТ КАЛОРИЙ — практичный метод:');
  lines.push('');
  lines.push('📊 ФОРМУЛА ПРИБЛИЗИТЕЛЬНОГО TDEE:');
  lines.push('• Сидячий образ жизни: вес × 26–28 ккал/кг');
  lines.push('• Умеренная активность (3×/нед): вес × 30–33 ккал/кг');
  lines.push('• Высокая активность (5–6×/нед): вес × 34–38 ккал/кг');
  lines.push('• Очень высокая (2×/день): вес × 40–50 ккал/кг');
  lines.push('');
  lines.push('🎯 КОРРЕКТИРОВКА ПОД ЦЕЛЬ:');
  lines.push('• Жиросжигание: TDEE − 300–500 ккал');
  lines.push('• Поддержка: TDEE');
  lines.push('• Набор массы: TDEE + 200–350 ккал');
  lines.push('');
  lines.push('📋 ПРАКТИКА:');
  lines.push('• Считай 2 недели → если вес стабилен → нашёл TDEE');
  lines.push('• Корректируй каждые 4–6 нед (тело адаптируется)');
  lines.push('');
  lines.push('⚠️ ФОРМУЛЫ = НАЧАЛЬНАЯ ТОЧКА, не абсолютная истина');
  lines.push('💡 Точнее: 2 нед стабильного веса при известных калориях');
  return '\n\n' + lines.join('\n');
}
export function getBloodSugarTraining(message: string): string {
  const keywords = ['сахар кров', 'глюкоз', 'инсулин', 'гликем', 'диабет', 'сахар', 'blood sugar'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🩸 САХАР КРОВИ И ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('📊 КАК ТРЕНИРОВКИ ВЛИЯЮТ НА ГЛЮКОЗУ:');
  lines.push('• Силовые: кратковременный ↑ глюкозы (стресс-ответ), затем ↑ чувствительность к инсулину на 24-48ч');
  lines.push('• Кардио: ↓ глюкозы во время и после — мышцы поглощают без инсулина (GLUT4)');
  lines.push('• Комбинация: лучший эффект для инсулиновой чувствительности');
  lines.push('');
  lines.push('🍽️ ПИТАНИЕ ДЛЯ СТАБИЛЬНОГО САХАРА:');
  lines.push('• Углеводы с белком и жирами — замедляет всасывание');
  lines.push('• Клетчатка перед углеводами (овощи → основное блюдо)');
  lines.push('• Избегать простые сахара натощак');
  lines.push('• После тренировки: быстрые углеводы допустимы (окно чувствительности)');
  lines.push('');
  lines.push('⏰ ЛУЧШЕЕ ВРЕМЯ ТРЕНИРОВКИ: после еды (через 1-2ч) — помогает утилизировать глюкозу');
  lines.push('');
  lines.push('⚠️ При диабете: консультация эндокринолога обязательна!');
  return '\n\n' + lines.join('\n');
}
export function getReverseDieting(message: string): string {
  const keywords = ['реверс диет', 'обратная диет', 'reverse diet', 'после дефицит', 'выход из диет', 'как перестать худеть'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔄 РЕВЕРСИВНАЯ ДИЕТА:');
  lines.push('');
  lines.push('📝 ЧТО ЭТО: постепенное увеличение калорий после дефицита до поддерживающего уровня');
  lines.push('');
  lines.push('❓ ЗАЧЕМ:');
  lines.push('• Избежать "rebound" (откат веса после диеты)');
  lines.push('• Восстановить метаболизм (адаптивный термогенез)');
  lines.push('• Нормализовать гормоны (лептин, T3, тестостерон)');
  lines.push('• Психологическое восстановление');
  lines.push('');
  lines.push('📊 ПРОТОКОЛ:');
  lines.push('• Добавлять 50-100 ккал/неделю (из углеводов и жиров)');
  lines.push('• Белок: оставить высоким (1.8-2.2 г/кг)');
  lines.push('• Взвешиваться ежедневно, анализировать среднее за неделю');
  lines.push('• Допустимый набор: 0.2-0.3 кг/нед (в основном вода + гликоген)');
  lines.push('');
  lines.push('⏰ ДЛИТЕЛЬНОСТЬ: обычно 4-12 недель (зависит от глубины дефицита)');
  lines.push('');
  lines.push('💡 ПРИМЕР: дефицит был 1800ккал → реверс: 1850 → 1900 → ... → 2400 (поддержка)');
  return '\n\n' + lines.join('\n');
}
export function getAlcoholFitnessImpact(message: string): string {
  const keywords = ['алкогол', 'пиво', 'вино', 'выпивк', 'alcohol', 'спиртн', 'похмель'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🍺 АЛКОГОЛЬ И ФИТНЕС — ВЛИЯНИЕ:');
  lines.push('');
  lines.push('📊 НАУЧНЫЕ ФАКТЫ:');
  lines.push('• ↓ синтез мышечного белка на 20-37% (даже 2-3 порции)');
  lines.push('• ↓ тестостерон, ↑ кортизол, ↑ эстроген');
  lines.push('• ↓ качество сна (REM-фазы нарушаются)');
  lines.push('• Дегидратация → замедленное восстановление');
  lines.push('• 7 ккал/г (почти как жир) + пустые калории миксеров');
  lines.push('');
  lines.push('🏋️ ВЛИЯНИЕ НА ТРЕНИРОВКИ:');
  lines.push('• Тренировка после алкоголя: ↓ сила на 11-12%');
  lines.push('• Повышенный риск травм (нарушена координация)');
  lines.push('• Замедленное восстановление мышц на 24-48ч');
  lines.push('');
  lines.push('📋 ЕСЛИ ВСЁ ЖЕ ПЬЁШЬ:');
  lines.push('• Не в день тренировки и не вечером перед');
  lines.push('• Белок перед/во время (замедляет всасывание)');
  lines.push('• Вода между порциями (1 стакан на 1 порцию)');
  lines.push('• Ограничивай 1-2 порциями');
  lines.push('• Красное вино или чистые напитки < сладкие коктейли');
  lines.push('');
  lines.push('🎯 0 алкоголя = лучший результат. Но жизнь — баланс.');
  return '\n\n' + lines.join('\n');
}
export function getProteinSourcesRanking(message: string): string {
  const keywords = ['источники белк', 'лучший бело', 'protein source', 'откуда брать бел', 'белков продукт', 'качественн бел'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🥩 РЕЙТИНГ ИСТОЧНИКОВ БЕЛКА:');
  lines.push('');
  lines.push('🏆 ЖИВОТНЫЙ БЕЛОК (полный аминокислотный профиль):');
  lines.push('• Яйца: эталон (BV=100), 13г/100г, дёшево');
  lines.push('• Куриная грудка: 31г/100г, низкий жир, универсально');
  lines.push('• Говядина: 26г/100г, железо, креатин, цинк');
  lines.push('• Рыба (лосось, тунец): 20-25г/100г, омега-3');
  lines.push('• Творог: 18г/100г, казеин (медленный), кальций');
  lines.push('• Сывороточный протеин: 80-90г/100г, быстрое усвоение');
  lines.push('');
  lines.push('🌱 РАСТИТЕЛЬНЫЙ (комбинировать для полного профиля):');
  lines.push('• Чечевица: 9г/100г (варёная), клетчатка');
  lines.push('• Нут: 8.9г/100г (варёный)');
  lines.push('• Тофу: 8г/100г');
  lines.push('• Гречка: 13г/100г (сырая), полный профиль для крупы');
  lines.push('• Киноа: 14г/100г (сырая)');
  lines.push('');
  lines.push('📊 УСВОЯЕМОСТЬ (DIAAS):');
  lines.push('• Яйца/молоко: >100% — эталон');
  lines.push('• Мясо/рыба: 85-95%');
  lines.push('• Бобовые: 60-75%');
  lines.push('• Зерновые: 40-55%');
  lines.push('');
  lines.push('🎯 Цель: 1.6-2.2 г/кг массы тела в день из разнообразных источников');
  return '\n\n' + lines.join('\n');
}
export function getCarbTimingPerformance(message: string): string {
  const keywords = ['углевод тайминг', 'когда есть углевод', 'carb timing', 'углевод перед тренировк', 'углевод после тренировк', 'углеводное окно'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🍞 ТАЙМИНГ УГЛЕВОДОВ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ:');
  lines.push('');
  lines.push('⏰ ПЕРЕД ТРЕНИРОВКОЙ (за 1-3ч):');
  lines.push('• 1-2г/кг углеводов из сложных источников');
  lines.push('• Каша, рис, хлеб, макароны + белок');
  lines.push('• Заполняет гликогеновые депо → больше энергии');
  lines.push('');
  lines.push('🏋️ ВО ВРЕМЯ ТРЕНИРОВКИ (>75 мин):');
  lines.push('• 30-60г/ч быстрых углеводов');
  lines.push('• Спортивный напиток, банан, мармеладки');
  lines.push('• Для коротких тренировок (<60 мин) — не нужно');
  lines.push('');
  lines.push('🔄 ПОСЛЕ ТРЕНИРОВКИ:');
  lines.push('• 0.8-1.2 г/кг углеводов в течение 2-3ч');
  lines.push('• Восполнение гликогена');
  lines.push('• Быстрые + медленные углеводы');
  lines.push('');
  lines.push('📊 СУТОЧНОЕ РАСПРЕДЕЛЕНИЕ:');
  lines.push('• Большая часть углеводов: вокруг тренировки');
  lines.push('• Вечерние углеводы: НЕ вредны (миф!) — даже помогают сну');
  lines.push('• Общее суточное количество > тайминг');
  lines.push('');
  lines.push('🎯 На дефиците: приоритет углеводов = перед/после тренировки');
  return '\n\n' + lines.join('\n');
}
export function getSodiumWaterRetention(message: string): string {
  const keywords = ['соль задержк', 'отёк', 'водн задержк', 'water retention', 'натрий вод', 'опух', 'заливает водой'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💧 НАТРИЙ, ВОДА И ВЕС ТЕЛА:');
  lines.push('');
  lines.push('🔬 КАК РАБОТАЕТ:');
  lines.push('• 1г натрия удерживает ~200мл воды');
  lines.push('• Резкое ↑ натрия → +1-3 кг за день (НЕ жир!)');
  lines.push('• Стабильное потребление → организм адаптируется');
  lines.push('');
  lines.push('📊 ЧАСТЫЕ ПРИЧИНЫ "ЗАЛИВКИ":');
  lines.push('• Солёная еда вечером (суши, чипсы, фастфуд)');
  lines.push('• Начало креатина (+1-2 кг воды — норма)');
  lines.push('• Углеводная загрузка после низкоуглеводки');
  lines.push('• Стресс/недосып → ↑ кортизол → задержка воды');
  lines.push('• У женщин: фаза цикла (лютеиновая → +1-3 кг)');
  lines.push('');
  lines.push('🛡️ КАК СНИЗИТЬ:');
  lines.push('• Пить больше воды (парадокс! — организм перестаёт запасать)');
  lines.push('• Калий: бананы, картофель, авокадо (баланс с натрием)');
  lines.push('• Стабильное потребление соли (не скачки)');
  lines.push('• Движение: ходьба, лимфодренаж');
  lines.push('');
  lines.push('🎯 Не паникуй из-за скачков веса ±1-2 кг — это вода, не жир');
  return '\n\n' + lines.join('\n');
}
export function getAntiInflammatoryNutrition(message: string): string {
  const keywords = ['противовоспалительн', 'воспален', 'anti-inflammatory', 'inflammation', 'хроническ воспален', 'снизить воспален'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔥 ПРОТИВОВОСПАЛИТЕЛЬНОЕ ПИТАНИЕ:');
  lines.push('');
  lines.push('🔬 ЗАЧЕМ:');
  lines.push('• Хроническое воспаление → замедленное восстановление');
  lines.push('• ↓ синтез белка, ↑ катаболизм');
  lines.push('• Боли в суставах, усталость, плохой сон');
  lines.push('');
  lines.push('✅ ПРОТИВОВОСПАЛИТЕЛЬНЫЕ ПРОДУКТЫ:');
  lines.push('• Жирная рыба (лосось, сардины): омега-3 EPA/DHA');
  lines.push('• Ягоды: антиоксиданты (черника, вишня, малина)');
  lines.push('• Куркума + чёрный перец: куркумин (биодоступность ↑ 2000%)');
  lines.push('• Зелёные овощи: шпинат, брокколи, кейл');
  lines.push('• Оливковое масло extra virgin: олеокантал');
  lines.push('• Имбирь: гингерол (противовоспалительный)');
  lines.push('• Орехи: грецкие (омега-3), миндаль (витамин E)');
  lines.push('');
  lines.push('❌ ПРОВОСПАЛИТЕЛЬНЫЕ (минимизировать):');
  lines.push('• Трансжиры: маргарин, фастфуд');
  lines.push('• Избыточный сахар: >50г добавленного/день');
  lines.push('• Рафинированные масла (подсолнечное, кукурузное) в избытке');
  lines.push('• Алкоголь в больших количествах');
  lines.push('');
  lines.push('💊 Добавки: Омега-3 (2-3г EPA+DHA/день), куркумин (500-1000мг/день)');
  return '\n\n' + lines.join('\n');
}
export function getCalorieTrackingAccuracy(message: string): string {
  const keywords = ['точность подсчёт', 'погрешность калор', 'calorie accuracy', 'правильно считать калор', 'ошибки подсчёт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📊 ТОЧНОСТЬ ПОДСЧЁТА КАЛОРИЙ:');
  lines.push('');
  lines.push('⚠️ ИСТОЧНИКИ ОШИБОК:');
  lines.push('• Этикетки: допустимая погрешность ±20% (по закону!)');
  lines.push('• Порции "на глаз": ошибка 20-50%');
  lines.push('• Масло при готовке: +100-300 ккал/приём (часто забывают)');
  lines.push('• Соусы и заправки: +50-200 ккал');
  lines.push('• "Я это не считаю": конфета, кусочек, допить сок');
  lines.push('');
  lines.push('📋 КАК ПОВЫСИТЬ ТОЧНОСТЬ:');
  lines.push('• Кухонные весы (не мерные стаканы!) — разница до 30%');
  lines.push('• Взвешивать сырые продукты (варёное = +вода = +масса)');
  lines.push('• Считать масло: 1 ст.л. = 120 ккал');
  lines.push('• Записывать ВСЁ (даже "пробу на вкус")');
  lines.push('');
  lines.push('💡 ВАЖНО:');
  lines.push('• Идеальная точность невозможна (и не нужна!)');
  lines.push('• Главное — ПОСТОЯНСТВО метода');
  lines.push('• Если ты всегда ошибаешься на +10%, тренды всё равно видны');
  lines.push('• Результат за 2-3 недели покажет реальность');
  lines.push('');
  lines.push('🎯 Вес тела — лучший индикатор. Не худеешь? Калорий больше, чем думаешь');
  return '\n\n' + lines.join('\n');
}
export function getMealPrepStrategies(message: string): string {
  const kw = /мил.?преп|подготовк.*еды|готов.*заранее|контейнер|планирован.*питан|batch.?cook|meal.?prep/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🍱 MEAL PREP ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('📋 Стратегия подготовки:');
  lines.push('• Выбери 1 день (воскресенье) — 2-3 часа на готовку');
  lines.push('• Готовь 3-4 базовых блюда на 4-5 дней');
  lines.push('• Используй контейнеры 500-800 мл с отделениями');
  lines.push('');
  lines.push('🥘 Базовые компоненты (готовь отдельно, миксуй):');
  lines.push('• Белок: куриная грудка, фарш из индейки, яйца вкрутую');
  lines.push('• Углеводы: рис, гречка, макароны, картофель');
  lines.push('• Овощи: брокколи, стручковая фасоль, перец');
  lines.push('• Соусы/заправки: хранить отдельно (чтобы не размокло)');
  lines.push('');
  lines.push('⏰ Хранение:');
  lines.push('• Холодильник: 3-4 дня максимум');
  lines.push('• Морозилка: до 3 месяцев (маркируй датой!)');
  lines.push('• Рис: охлаждай быстро (риск бактерий при медленном остывании)');
  lines.push('• Разогрев: 2-3 минуты в микроволновке, перемешивая');
  lines.push('');
  lines.push('💰 Экономия:');
  lines.push('• Meal prep экономит 30-40% бюджета vs еда на ходу');
  lines.push('• Покупай оптом: куриное филе, крупы, замороженные овощи');
  lines.push('• Меньше соблазнов: еда уже готова → нет "закажу пиццу"');
  lines.push('');
  lines.push('🏋️ Для набора массы: +1 контейнер перекус (орехи, банан, протеин)');
  lines.push('🏋️ Для сушки: взвешивай порции при раскладке, считай КБЖУ 1 раз');
  return '\n\n' + lines.join('\n');
}
export function getRecoveryNutritionTiming(message: string): string {
  const kw = /питан.*после.*тренир|еда.*восстановл|восстановл.*питан|пост.?тренир.*еда|что.*есть.*после.*зал/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🍽️ ПИТАНИЕ ДЛЯ ВОССТАНОВЛЕНИЯ — ТАЙМИНГ:');
  lines.push('');
  lines.push('⏰ Первые 0-2 часа после тренировки:');
  lines.push('• Белок: 30-40г (быстрый — сывороточный или курица)');
  lines.push('• Углеводы: 0.5-1г/кг массы тела (рис, картофель, фрукты)');
  lines.push('• Жиры: минимум (замедляют усвоение, но не критично)');
  lines.push('');
  lines.push('⏰ 2-4 часа после:');
  lines.push('• Полноценный приём пищи с белком, углеводами, овощами');
  lines.push('• 30-40г белка повторно');
  lines.push('• Сложные углеводы: гречка, макароны, хлеб');
  lines.push('');
  lines.push('⏰ Перед сном:');
  lines.push('• 30-40г казеина или творог (медленный белок)');
  lines.push('• Поддержка синтеза белка во время сна (6-8 часов без еды)');
  lines.push('');
  lines.push('🔬 Что говорит наука:');
  lines.push('• "Анаболическое окно" шире, чем думали (4-6 часов)');
  lines.push('• Если ел до тренировки за 2-3 часа — не спеши сразу после');
  lines.push('• Общее суточное потребление важнее тайминга');
  lines.push('• НО: тренировки натощак → еда после = более срочно');
  lines.push('');
  lines.push('💧 Не забудь: 500-700 мл воды за первый час после тренировки');
  return '\n\n' + lines.join('\n');
}
export function getProteinTypesComparison(message: string): string {
  const kw = /сыворот.*казеин|казеин.*сыворот|раститель.*протеин|какой.*протеин.*лучше|whey.*casein|изолят.*концентрат/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🥛 СРАВНЕНИЕ ТИПОВ ПРОТЕИНА:');
  lines.push('');
  lines.push('📊 Сывороточный (Whey):');
  lines.push('• Скорость усвоения: быстрая (20-30 мин)');
  lines.push('• Лейцин: ~10-12% (высший среди протеинов)');
  lines.push('• Лучший момент: после тренировки, утром');
  lines.push('• Концентрат (80% белка, дешевле) vs изолят (90%+, меньше лактозы)');
  lines.push('');
  lines.push('📊 Казеин:');
  lines.push('• Скорость: медленная (6-8 часов)');
  lines.push('• Формирует гель в желудке → постепенное высвобождение');
  lines.push('• Лучший момент: перед сном');
  lines.push('• Мицеллярный казеин > казеинат кальция');
  lines.push('');
  lines.push('📊 Растительный:');
  lines.push('• Горох + рис = полный аминокислотный профиль');
  lines.push('• Лейцина меньше → нужно больше порция (35-40г vs 25-30г)');
  lines.push('• Соевый: хороший профиль, но фитоэстрогены (спорный вопрос)');
  lines.push('• Подходит веганам и при непереносимости лактозы');
  lines.push('');
  lines.push('🏆 Рейтинг по эффективности:');
  lines.push('• 1. Whey изолят (лучший аминокислотный профиль)');
  lines.push('• 2. Whey концентрат (дешевле, почти так же эффективен)');
  lines.push('• 3. Казеин (для медленного высвобождения)');
  lines.push('• 4. Гороховый+рисовый (лучший растительный)');
  lines.push('');
  lines.push('💡 Миф: "нужен только изолят" — для большинства концентрат = ОК');
  return '\n\n' + lines.join('\n');
}
export function getThermicEffectFood(message: string): string {
  const kw = /термическ.*эффект|термоген.*пищ|TEF|thermic|калор.*переварив|сколько.*калор.*тратит.*переварив/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔥 ТЕРМИЧЕСКИЙ ЭФФЕКТ ПИЩИ (TEF):');
  lines.push('');
  lines.push('🔬 Что это:');
  lines.push('• Энергия, затрачиваемая на переваривание, усвоение и обработку пищи');
  lines.push('• Составляет 8-15% от общего расхода калорий');
  lines.push('• Часть TDEE, которую можно оптимизировать');
  lines.push('');
  lines.push('📊 TEF по макронутриентам:');
  lines.push('• Белок: 20-30% (съел 100 ккал белка → 20-30 ккал на переваривание)');
  lines.push('• Углеводы: 5-10%');
  lines.push('• Жиры: 0-3%');
  lines.push('• Алкоголь: 10-15%');
  lines.push('');
  lines.push('💡 Практическое применение:');
  lines.push('• Высокобелковая диета → выше TEF → легче в дефиците');
  lines.push('• При 2000 ккал/день: высокий белок даёт +100-150 ккал расхода');
  lines.push('• Цельные продукты > обработанные (TEF на 50% выше!)');
  lines.push('• Холодная пища ≠ больший TEF (миф)');
  lines.push('');
  lines.push('📐 Расчёт для спортсмена:');
  lines.push('• Базовый обмен (BMR): ~1600-2000 ккал');
  lines.push('• TEF: ~200-400 ккал');
  lines.push('• Активность: 300-800 ккал');
  lines.push('• NEAT (бытовая активность): 200-800 ккал');
  lines.push('• Итого TDEE = BMR + TEF + Activity + NEAT');
  return '\n\n' + lines.join('\n');
}
export function getCarbSourcesRanking(message: string): string {
  const kw = /лучш.*углевод|углевод.*источник|какие.*углевод|рис.*гречк|овсянк.*рис|быстр.*медл.*углевод/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🍚 РЕЙТИНГ ИСТОЧНИКОВ УГЛЕВОДОВ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('🥇 Топ-уровень (основа рациона):');
  lines.push('• Овсянка — медленные углеводы, бета-глюкан, клетчатка');
  lines.push('• Гречка — уникальный профиль, рутин, белок 12г/100г');
  lines.push('• Рис (белый) — быстрое усвоение, идеален после тренировки');
  lines.push('• Картофель — калий, витамин C, насыщает лучше всех');
  lines.push('• Батат — низкий ГИ, витамин A, сложные углеводы');
  lines.push('');
  lines.push('🥈 Хороший уровень:');
  lines.push('• Макароны (из твёрдых сортов) — умеренный ГИ');
  lines.push('• Хлеб цельнозерновой — клетчатка + углеводы');
  lines.push('• Бананы — быстрый перекус, калий');
  lines.push('• Булгур — низкий ГИ, хорошая текстура');
  lines.push('• Киноа — полный белок + углеводы');
  lines.push('');
  lines.push('📊 Когда какие:');
  lines.push('• До тренировки (за 2ч): овсянка, гречка, батат');
  lines.push('• После тренировки: белый рис, картофель, бананы');
  lines.push('• Перед сном: гречка, овсянка (медленные)');
  lines.push('• На сушке: гречка, овсянка (насыщают + клетчатка)');
  lines.push('• На массе: рис, макароны (легко есть в больших объёмах)');
  return '\n\n' + lines.join('\n');
}
export function getFatSourcesAthletes(message: string): string {
  const kw = /источник.*жир|жир.*источник|полезн.*жир|какие.*жиры.*есть|омега.*продукт|ненасыщ/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🥑 ИСТОЧНИКИ ЖИРОВ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('📊 Ненасыщенные (приоритет):');
  lines.push('• Оливковое масло — мононенасыщенные, антиоксиданты');
  lines.push('• Авокадо — калий + полезные жиры');
  lines.push('• Орехи (миндаль, грецкий) — омега-3, витамин E');
  lines.push('• Жирная рыба (сёмга, скумбрия) — EPA/DHA омега-3');
  lines.push('• Семена (чиа, лён) — ALA омега-3, клетчатка');
  lines.push('');
  lines.push('📊 Насыщенные (умеренно):');
  lines.push('• Яйца целиком — холин + жирорастворимые витамины');
  lines.push('• Сливочное масло — витамин A, K2');
  lines.push('• Тёмный шоколад (70%+) — полифенолы');
  lines.push('• Кокосовое масло — MCT (быстрая энергия)');
  lines.push('');
  lines.push('❌ Минимизировать:');
  lines.push('• Транс-жиры (маргарин, фастфуд) — прямой вред');
  lines.push('• Рафинированные масла (подсолнечное, соевое) — избыток омега-6');
  lines.push('');
  lines.push('📐 Сколько жиров:');
  lines.push('• Минимум: 0.8 г/кг (гормональное здоровье)');
  lines.push('• Оптимум: 1.0-1.5 г/кг');
  lines.push('• Ниже 0.5 г/кг → падение тестостерона');
  lines.push('• Баланс: омега-6:омега-3 = 2:1 (у большинства 15:1!)');
  return '\n\n' + lines.join('\n');
}
export function getFiberIntakeOptimization(message: string): string {
  const kw = /клетчатк|пищев.*волокн|fiber|грубая.*пища|вздут.*клетчатк|запор.*тренир|пищеварен.*клетч/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🥦 ОПТИМИЗАЦИЯ ПОТРЕБЛЕНИЯ КЛЕТЧАТКИ:');
  lines.push('');
  lines.push('🔬 Типы клетчатки:');
  lines.push('• Растворимая: овсянка, бобовые, яблоки → сытость, холестерин');
  lines.push('• Нерастворимая: отруби, овощи, орехи → моторика ЖКТ');
  lines.push('• Нужны оба типа!');
  lines.push('');
  lines.push('📊 Нормы:');
  lines.push('• Минимум: 25-30 г/день');
  lines.push('• Оптимально: 14 г на каждые 1000 ккал');
  lines.push('• Спортсмен на 3000 ккал → 42 г клетчатки/день');
  lines.push('');
  lines.push('🍽️ Топ источники (г на 100г):');
  lines.push('• Чечевица — 8г');
  lines.push('• Овсянка — 10г');
  lines.push('• Брокколи — 3г');
  lines.push('• Авокадо — 7г');
  lines.push('• Малина — 7г');
  lines.push('• Цельнозерновой хлеб — 6г');
  lines.push('');
  lines.push('⚠️ Для спортсменов:');
  lines.push('• Не ешь много клетчатки за 2 часа до тренировки (вздутие!)');
  lines.push('• После тренировки: минимум клетчатки (быстрое усвоение)');
  lines.push('• Увеличивай постепенно (+5г в неделю) + больше воды');
  lines.push('• На сушке: клетчатка = спасение (сытость при дефиците)');
  return '\n\n' + lines.join('\n');
}
export function getChromiumBloodSugar(message: string): string {
  const kw = /хром.*микроэлемент|хром.*сахар|chromium|инсулин.*хром|тяг.*сладк|сладк.*тяг.*добавк/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🧪 ХРОМ И РЕГУЛЯЦИЯ САХАРА В КРОВИ:');
  lines.push('');
  lines.push('🔬 Роль хрома:');
  lines.push('• Усиливает действие инсулина (инсулиновый кофактор)');
  lines.push('• Улучшает транспорт глюкозы в мышечные клетки');
  lines.push('• Может снижать тягу к сладкому');
  lines.push('• Участвует в метаболизме жиров');
  lines.push('');
  lines.push('📊 Доказательная база:');
  lines.push('• Умеренные доказательства для улучшения чувствительности к инсулину');
  lines.push('• Эффект лучше при дефиците хрома');
  lines.push('• Для похудения — эффект небольшой, но реальный');
  lines.push('• Не "волшебная таблетка", а поддержка при правильном питании');
  lines.push('');
  lines.push('🍽️ Источники:');
  lines.push('• Брокколи — 11 мкг/100г');
  lines.push('• Виноградный сок — 8 мкг/стакан');
  lines.push('• Цельнозерновые — 5-8 мкг/порция');
  lines.push('• Мясо (говядина, индейка) — 2-3 мкг/100г');
  lines.push('');
  lines.push('💊 Добавки:');
  lines.push('• Пиколинат хрома: 200-1000 мкг/день');
  lines.push('• Безопасен в рекомендуемых дозах');
  lines.push('• Лучший эффект при: сушке, тяге к сладкому, инсулинорезистентности');
  return '\n\n' + lines.join('\n');
}
export function getCoconutWaterSport(message: string): string {
  const kw = /кокосов.*вод|coconut.*water|изотоник.*натуральн|чем.*заменить.*изотоник|электролит.*напит/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🥥 КОКОСОВАЯ ВОДА КАК СПОРТИВНЫЙ НАПИТОК:');
  lines.push('');
  lines.push('📊 Состав (на 240 мл):');
  lines.push('• Калории: 45 ккал');
  lines.push('• Калий: 600 мг (больше, чем в изотониках!)');
  lines.push('• Натрий: 250 мг (меньше, чем в изотониках)');
  lines.push('• Магний: 60 мг');
  lines.push('• Углеводы: 9г (натуральные сахара)');
  lines.push('');
  lines.push('✅ Плюсы:');
  lines.push('• Натуральный источник электролитов');
  lines.push('• Высокое содержание калия');
  lines.push('• Без красителей и искусственных добавок');
  lines.push('• Хорошо переносится желудком');
  lines.push('');
  lines.push('⚠️ Минусы vs спортивные напитки:');
  lines.push('• Мало натрия (главный электролит пота)');
  lines.push('• Мало углеводов для длительных нагрузок');
  lines.push('• Дороже изотоников');
  lines.push('• Для силовых тренировок <90 мин — обычная вода достаточна');
  lines.push('');
  lines.push('💡 Вердикт: хороший натуральный вариант для лёгкого восполнения, но для интенсивных/длительных тренировок — добавь щепотку соли');
  return '\n\n' + lines.join('\n');
}
export function getCarnitineFatMetabolism(message: string): string {
  const keywords = ['карнитин', 'carnitine', 'l-карнитин', 'жиросжигание добавк', 'митохондри', 'окисление жиров'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[L-КАРНИТИН — ТРАНСПОРТ ЖИРОВ В МИТОХОНДРИИ]
L-карнитин переносит длинноцепочечные жирные кислоты в митохондрии для окисления (сжигания).

Формы и их назначение:
- L-карнитин тартрат: спорт, выносливость, восстановление (2-3г/день)
- Ацетил-L-карнитин (ALCAR): когнитивные функции, энергия (1-2г/день)
- Пропионил-L-карнитин: кровообращение, сердце (1-2г/день)
- L-карнитин L-тартрат: лучшее усвоение для спортсменов

Доказанные эффекты:
- Ускоряет окисление жиров при аэробных нагрузках на 10-20%
- Снижает маркеры мышечного повреждения после тренировок
- Улучшает восстановление (снижает болезненность)
- Повышает утилизацию кислорода

Важный нюанс — инсулин:
- Для попадания в мышцы карнитину нужен инсулин
- Принимай с углеводами (30-40г) или после еды
- Без углеводов усвоение снижается на 50-70%

Дозировка: 2-3г/день, разделить на 2 приёма.
Курс: 2-3 месяца, перерыв 1 месяц.
Источники: красное мясо (95мг/100г баранины), молочные продукты.
Побочки: редко — тошнота, рыбный запах при высоких дозах.`;
}
export function getDeficitDeadlift(message: string): string {
  const keywords = ['дефицит становая', 'deficit deadlift', 'с подставки', 'увеличенная амплитуда становая', 'становая платформа'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[СТАНОВАЯ ТЯГА С ДЕФИЦИТОМ — УВЕЛИЧЕННАЯ АМПЛИТУДА]
Стоя на подставке 5-10 см — увеличивает амплитуду и прорабатывает слабое звено (отрыв от пола).

Когда использовать:
- Слабая фаза: штанга медленно отрывается от пола
- Хочешь увеличить квадрицепсы и поясницу
- Подготовка к соревнованиям (запас силы)
- Улучшение позиции тела в старте

Техника:
1. Встань на платформу 5-10 см (блин, степ-платформа)
2. Стартовая позиция: как обычная становая, но бёдра ниже
3. Хват — как привычно (двойной, разнохват, с лямками)
4. Спина нейтральная, грудь вверх, лопатки над штангой
5. Тяни плавно — не рви! Контроль с пола
6. Верхняя позиция стандартная

Прогрессия:
1. Начни с дефицита 2-3 см (1 блин 25кг)
2. Увеличь до 5 см
3. Максимум 10 см (больше — техника ломается)
4. Вес: 70-85% от обычной становой

Программирование:
- 3-4 × 3-6 повторений
- Как основное или вспомогательное в день тяги
- 4-6 недель блоком, затем вернуться к обычной
- Эффект переноса: обычная становая чувствуется легче

Противопоказания: проблемы с поясницей, ограниченная подвижность ТБС.`;
}
export function getPaleoDietAthletes(message: string): string {
  const keywords = ['палео', 'paleo', 'палеодиета', 'пещерный человек диета', 'палеолит питан'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 ПАЛЕОДИЕТА ДЛЯ АТЛЕТОВ:

Принципы:
- Есть: мясо, рыба, яйца, овощи, фрукты, орехи, семечки
- Исключить: зерновые, бобовые, молочные, сахар, масла
- Основа: «ешь то, что ели предки-охотники»

Плюсы для атлетов:
+ Высокое качество белка (мясо, рыба, яйца)
+ Много овощей (микронутриенты, клетчатка)
+ Исключение переработанной пищи
+ Стабильный сахар крови (нет скачков)
+ Противовоспалительный профиль

Минусы для атлетов:
- Мало углеводов (проблема для интенсивных тренировок!)
- Исключение бобовых (дешёвый белок + клетчатка)
- Исключение молочных (кальций, казеин, сыворотка)
- Дорого (качественное мясо, дикая рыба)
- Сложно набрать калории для набора массы

Адаптация для спортсменов:
- Добавить: рис, картофель, батат (углеводы для тренировок)
- Добавить: качественные молочные (если нет непереносимости)
- Периодизация углеводов: больше в дни тренировок
- Не быть фанатиком: 80/20 правило

Вердикт:
Хорошая база для питания, но строгое палео
слишком ограничительно для атлетов.
Лучше: палео-шаблон + углеводы вокруг тренировок.`;
}
export function getKetoDietAthletes(message: string): string {
  const keywords = ['кето', 'keto', 'кетогенная', 'кетоз', 'без углеводов диета', 'кетоновые тела'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥑 КЕТО-ДИЕТА ДЛЯ АТЛЕТОВ:

Принцип:
- Углеводы <20-50г/день → кетоз
- Тело переключается на жиры как основной источник энергии
- Кетоновые тела: бета-гидроксибутират, ацетоацетат

Плюсы:
+ Эффективное жиросжигание
+ Стабильная энергия (нет скачков сахара)
+ Снижение воспаления
+ Улучшение когнитивных функций (кетоны = топливо мозга)
+ Снижение аппетита (кетоны подавляют грелин)

Минусы для силовых:
- Снижение мощности на 5-15% (нет гликогена!)
- Хуже восстановление между подходами
- Потеря мышечной массы возможна (первые 2-4 нед)
- «Кето-грипп»: 1-2 недели адаптации
- Сложно набрать массу (калории из жиров)

Для каких видов спорта:
✅ Выносливость (марафон, велогонки) — после адаптации (6-8 нед)
✅ Рекомпозиция (жиросжигание + сохранение мышц)
⚠️ Пауэрлифтинг: работает, но пиковая сила падает
❌ Бодибилдинг в период набора: не хватает углеводов для роста

Компромисс — CKD (циклическая кето):
- 5-6 дней кето → 1-2 дня карб-загрузка
- Восполнение гликогена для интенсивных тренировок
- Лучший вариант для силовых атлетов на кето

Белок на кето: 2-2.5 г/кг (выше обычного для сохранения мышц).`;
}
export function getDietaryFatsHormones(message: string): string {
  const keywords = ['жиры гормоны', 'dietary fats hormones', 'жиры тестостерон', 'холестерин гормоны', 'жиры для здоровья'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥑 ДИЕТИЧЕСКИЕ ЖИРЫ И ГОРМОНЫ:

Почему жиры критичны:
- Холестерин → прегненолон → ВСЕ стероидные гормоны
- Тестостерон, эстроген, кортизол, DHEA — все из холестерина
- Низкие жиры (<20% калорий) = падение тестостерона на 10-15%

Типы жиров и их роль:
НАСЫЩЕННЫЕ (кокос, масло, мясо):
- Основа для синтеза тестостерона
- 10-15% калорий — оптимально
- Не бойтесь: связь с сердечными заболеваниями пересмотрена

МОНОНЕНАСЫЩЕННЫЕ (оливковое масло, авокадо, орехи):
- Повышают тестостерон
- Кардиопротекция
- Должны быть основой жиров в рационе

ПОЛИНЕНАСЫЩЕННЫЕ:
- Омега-3 (рыба): противовоспалительные
- Омега-6 (масла): провоспалительные в избытке
- Соотношение: Omega-6:Omega-3 = 2:1 до 4:1 (идеал)

ТРАНСЖИРЫ (маргарин, фастфуд):
- ИСКЛЮЧИТЬ полностью
- Снижают тестостерон
- Увеличивают воспаление и риск заболеваний

Рекомендации:
- 25-35% калорий из жиров
- Минимум: 0.5 г/кг массы тела
- Оптимум: 0.8-1.2 г/кг
- Источники: оливковое масло, авокадо, орехи, жирная рыба, яйца
- НЕ снижать жиры ниже 20% при сушке (гормональный крах)`;
}
export function getIFAthletesGuide(message: string): string {
  const keywords = ['интервальное голодание', 'intermittent fasting', '16:8', 'окно питания', 'голодание атлет'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⏰ ИНТЕРВАЛЬНОЕ ГОЛОДАНИЕ 16:8 ДЛЯ АТЛЕТОВ:

Принцип:
- 16 часов голодания + 8 часов окно питания
- Пример: еда с 12:00 до 20:00, голод с 20:00 до 12:00
- Во время голодания: вода, чай, кофе (без сахара/молока)

Плюсы для атлетов:
+ Аутофагия (очистка повреждённых клеток)
+ Улучшение инсулиновой чувствительности
+ Повышение гормона роста (натощак до 5×)
+ Удобство (меньше приёмов пищи = меньше готовить)
+ Хорошо для сушки (контроль калорий)

Минусы:
- Сложнее набрать калории для массонабора
- Тренировка натощак = снижение производительности (5-15%)
- Менее частое питание = менее оптимальный синтез белка
- Может повышать кортизол при длительном голодании
- Не подходит при расстройствах пищевого поведения

Оптимизация для тренирующихся:
- Тренировка в конце голодания (перед первым приёмом)
- ИЛИ: тренировка через 1-2 часа после первого приёма
- 10г EAA перед тренировкой натощак (защита мышц)
- Белок в каждом приёме: 40-50г (3 приёма за 8 часов)
- Суточный белок: 1.6-2.2 г/кг (не снижать!)

Вердикт:
Работает для сушки и здоровья.
Для набора массы — не оптимально.
Для силовых — нейтрально (если правильно таймить).`;
}
export function getDeficitDeadliftGuide(message: string): string {
  const keywords = ['дефицитная тяга', 'тяга с дефицитом', 'deficit deadlift', 'тяга с подставки', 'тяга с возвышения'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📏 ДЕФИЦИТНАЯ СТАНОВАЯ ТЯГА — ГАЙД:

Что это: становая тяга, стоя на подставке 5-10 см. Увеличенная амплитуда.

Зачем:
- Развивает силу срыва (самое слабое звено у многих)
- Увеличенный ROM = больше работы и мышечного роста
- Укрепляет позицию в нижней точке
- Улучшает технику классической становой
- Развивает силу квадрицепсов и ягодиц от пола

Техника:
1. Подставка 2.5-10 см (начните с минимума)
2. Техника как в обычной становой
3. Спина НЕЙТРАЛЬНАЯ — если округляется, уменьшите дефицит
4. Контроль опускания (не бросать)
5. Обязательная проверка: при дефиците 5см вы держите нейтраль?

Правила:
- ТОЛЬКО при идеальной технике обычной становой
- Вес 70-85% от обычной становой
- 3-4×4-6 повторений
- Не более 1 раза в неделю
- Чередуйте с обычной тягой

Прогрессия дефицита:
- 2.5 см → 5 см → 7.5 см → 10 см (максимум)
- Увеличивайте дефицит, когда текущий стал комфортным
- Больше 10 см — нет дополнительной пользы, только риск

Кому НЕ подходит: при ограниченной подвижности бёдер, травмах поясницы.`;
}
export function getSodiumBicarbonatePerf(message: string): string {
  const keywords = ['сода', 'бикарбонат натрия', 'sodium bicarbonate', 'буферизация', 'сода спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚗️ БИКАРБОНАТ НАТРИЯ (СОДА) ДЛЯ СПОРТА — НАУКА:

Механизм: буферизация кислоты в мышцах → отсрочка утомления. Один из САМЫХ изученных эргогенных средств.

Доказанные эффекты (уровень A):
- +1.7% производительность при нагрузках 1-10 минут
- Увеличение времени до отказа
- Больше повторений при высоких интенсивностях
- Наибольший эффект: интервалы, спринты, высокие повторения

Протокол приёма:
- Острый: 0.3 г/кг за 60-90 минут до нагрузки
- Пример: 70 кг спортсмен = 21 г (около 4 чайных ложек)
- Хронический: 0.5 г/кг/день разделить на 3-4 приёма (5 дней)
- С едой — снижает ЖКТ-побочки

Побочные эффекты (главная проблема):
- ЖКТ-дискомфорт: вздутие, тошнота, диарея
- Встречается у 30-50% спортсменов
- Решения: серийная загрузка (5 дней), приём с едой, капсулы

Для каких видов спорта:
- Кроссфит, гребля, плавание, бег 400-1500м
- Бокс, борьба, MMA (раунды)
- Высокоповторные тренировки (15-30 rep)
- Минимальный эффект: чистая сила (1-3 rep)

Альтернатива с меньшими побочками: бета-аланин (похожий механизм, но хронический).`;
}
export function getAntiInflammatoryFoods(message: string): string {
  const relevant = /противовоспалител.+продукт|антивоспалител.+ед|anti.?inflamm.+food|воспален.+снизить.+ед|продукт.+воспален.+снижа/i.test(message);
  if (!relevant) return '';
  return `
🥗 ПРОТИВОВОСПАЛИТЕЛЬНЫЕ ПРОДУКТЫ ДЛЯ СПОРТСМЕНОВ:

Почему это важно:
- Тренировки вызывают микро-воспаление (нормально для адаптации)
- Хроническое воспаление = перетренированность, травмы, болезни
- Питание может снизить CRP (маркер воспаления) на 20-40%

ТОП-15 противовоспалительных продуктов:

🐟 ОМЕГА-3 ИСТОЧНИКИ:
1. Жирная рыба (лосось, скумбрия, сельдь): 2-3 раза в неделю
2. Льняное масло: 1 ст.л./день (ALA → EPA/DHA)
3. Грецкие орехи: 30 г/день

🍒 ЯГОДЫ И ФРУКТЫ:
4. Вишня/черешня: снижение CRP на 25%, ускорение восстановления
5. Черника: антоцианы, один из мощнейших антиоксидантов
6. Гранат: эллагитанины, защита суставов
7. Ананас: бромелаин — природный противовоспалительный фермент

🥬 ОВОЩИ:
8. Шпинат: лютеин + зеаксантин + нитраты
9. Брокколи: сульфорафан — активирует Nrf2 (антиоксидантный путь)
10. Свёкла: бетаин + нитраты

🌶️ СПЕЦИИ:
11. Куркума: куркумин — мощнейший природный антивоспалительный
    - С чёрным перцем (пиперин ↑ усвоение на 2000%)
12. Имбирь: гингерол — сравним с ибупрофеном по силе
13. Чеснок: аллицин — антимикробный + антивоспалительный

🫒 ЖИРЫ И ДРУГОЕ:
14. Оливковое масло (extra virgin): олеокантал — природный ибупрофен
15. Зелёный чай: EGCG — один из сильнейших полифенолов

Продукты, УСИЛИВАЮЩИЕ воспаление (ограничить):
❌ Трансжиры (маргарин, фаст-фуд)
❌ Рафинированный сахар в больших количествах
❌ Рафинированные масла (подсолнечное, кукурузное) — много омега-6
❌ Алкоголь (более 1-2 порций)
❌ Ультраобработанные продукты (колбасы, чипсы)

Противовоспалительная тарелка спортсмена:
- 1/2 — овощи (разноцветные)
- 1/4 — качественный белок (рыба, птица)
- 1/4 — сложные углеводы (гречка, батат)
- + оливковое масло + специи (куркума, имбирь)`;
}
export function getFiberIntakeAthletes(message: string): string {
  const relevant = /клетчатк.+спортсмен.+подробн|пищевые.+волокн.+спорт|fiber.+athlete|клетчатк.+сколько.+подробн|клетчатк.+виды.+польз/i.test(message);
  if (!relevant) return '';
  return `
🌾 КЛЕТЧАТКА ДЛЯ СПОРТСМЕНОВ:

Виды клетчатки:
1. Растворимая (пребиотик):
   - Овёс, бобовые, яблоки, льняное семя
   - Замедляет усвоение углеводов (стабильный сахар)
   - Кормит полезные бактерии (бутират для кишечника)
   - Снижает холестерин (желчные кислоты)

2. Нерастворимая:
   - Цельные злаки, овощи, отруби
   - Ускоряет транзит (профилактика запоров)
   - Даёт объём стулу
   - Сытость (наполнение желудка)

Сколько нужно спортсмену:
- Минимум: 25-30 г/день
- Оптимум: 30-40 г/день
- Максимум: 50-60 г/день (больше — может мешать усвоению минералов)
- Увеличивать ПОСТЕПЕННО (+5 г в неделю) — иначе вздутие

Когда ограничивать клетчатку:
❌ За 2-3 часа до тренировки (замедляет пищеварение)
❌ Сразу после тренировки (нужны быстрые нутриенты)
❌ При проблемах с ЖКТ на тренировках
✅ За 3-4 часа до тренировки — нормально
✅ В основные приёмы пищи (завтрак, обед, ужин)

Продукты-лидеры (г клетчатки на 100г):
- Отруби пшеничные: 43 г
- Льняное семя: 27 г
- Чечевица: 15 г
- Фасоль: 12 г
- Авокадо: 7 г
- Брокколи: 3.3 г
- Овсянка: 10 г (сухая)
- Гречка: 10 г (сухая)

Клетчатка и набор массы:
- Помогает контролировать аппетит при сушке
- На массонаборе: не переборщить (чувство сытости мешает есть)
- Баланс: 14 г на каждые 1000 ккал`;
}
export function getPostWorkoutMealTiming(message: string): string {
  const relevant = /послетрениров.+еда.+время|когда.+есть.+после.+тренировк.+подробн|post.?workout.+meal.+timing|анаболическ.+окно.+правда|еда.+после.+зал.+подробн/i.test(message);
  if (!relevant) return '';
  return `
🍽️ ПИТАНИЕ ПОСЛЕ ТРЕНИРОВКИ — НАУЧНЫЙ ПОДХОД:

Анаболическое окно — правда или миф?
- Старая теория: «30 минут после тренировки или всё пропало!»
- Наука 2020-х: окно СУЩЕСТВУЕТ, но оно ШИРЕ (2-3 часа)
- Если ели за 2-3 часа до тренировки — аминокислоты ещё в крови
- Если тренировались натощак — да, нужно есть скорее (в течение часа)

Что нужно после тренировки:

БЕЛОК (20-40 г):
- Стимуляция синтеза мышечного белка (MPS)
- Сывороточный протеин: самый быстрый (~30 мин до пика аминокислот)
- Цельная еда (курица, рыба, яйца): 1-2 часа до пика
- Лейцин-порог: 2.5-3 г для максимальной MPS

УГЛЕВОДЫ (0.5-1 г/кг массы):
- Восполнение гликогена
- Инсулин → усиление транспорта аминокислот в мышцы
- Быстрые углеводы (рис, банан, мёд) — оптимально
- Критично если 2 тренировки в день; менее важно при 1 тренировке

ЖИРЫ — ограничить:
- Замедляют усвоение белка и углеводов
- Не исключать полностью, но не приоритет
- 10-15 г максимум в первый приём

Тайминг по типу тренировки:
- Силовая (1 тренировка/день): в течение 2 часов
- Тренировка натощак: в течение 1 часа
- 2 тренировки в день: СРАЗУ после первой (максимально быстро)
- Лёгкая кардио: обычный приём пищи, не спешить

Примеры посттренировочных приёмов:
🥇 Протеиновый шейк + банан (сразу после)
🥈 Куриная грудка + рис (через 30-60 мин)
🥉 Творог + мёд + овсянка (через 30-60 мин)
🏅 Омлет из 4 яиц + тост (через 30-60 мин)`;
}
export function getCarbLoadingProtocol(message: string): string {
  const relevant = /углевод.+загрузк.+протокол|carb.?load|карбо.?загрузк|углевод.+перед.+соревнован|гликоген.+загрузк.+подробн/i.test(message);
  if (!relevant) return '';
  return `
🍝 УГЛЕВОДНАЯ ЗАГРУЗКА — ПРОТОКОЛ:

Зачем нужна:
- Запасы гликогена в мышцах: ~300-500 г (1200-2000 ккал)
- Гликоген в печени: ~80-100 г
- Загрузка увеличивает запасы на 25-100% → больше выносливости
- Полезна для нагрузок >90 минут

Классический протокол (Bergström, 1967):
- Дни 1-3: истощение (низкие углеводы + тренировки)
- Дни 4-6: загрузка (8-12 г углеводов/кг массы тела)
⚠️ Устарел — фаза истощения не нужна!

Современный протокол (Sherman, 1981):
📅 За 3 дня до события:
- День -3: 5 г/кг углеводов, лёгкая тренировка
- День -2: 8 г/кг углеводов, очень лёгкая тренировка
- День -1: 10-12 г/кг углеводов, полный отдых
- День события: привычный завтрак за 3-4 часа до старта

Лучшие продукты для загрузки:
✅ Белый рис, паста, хлеб, картофель (чистые углеводы)
✅ Бананы, финики, мёд (быстрые)
✅ Овсянка, гречка (умеренные)
❌ Избегать: клетчатку (может вызвать ЖКТ-дискомфорт)
❌ Избегать: жирную пищу (замедляет усвоение)

Пример для 80 кг спортсмена (день -1, ~960 г углеводов):
- Завтрак: 150 г овсянки + банан + мёд + сок = ~150 г
- Перекус: 100 г фиников + рисовые хлебцы = ~100 г
- Обед: 300 г риса (сухой) + куриная грудка = ~230 г
- Перекус: 2 банана + энергетический батончик = ~80 г
- Ужин: 250 г пасты + лёгкий соус = ~200 г
- Перед сном: смузи с фруктами + мёд = ~100 г
Итого: ~860 г углеводов

Для силовых спортсменов:
- Менее критично (тренировки <60 мин обычно)
- Но за день до тяжёлой тренировки: 6-8 г/кг углеводов
- Это обеспечит полные запасы гликогена`;
}
export function getRecoveryDrinkRecipes(message: string): string {
  const relevant = /восстановител.+напит.+рецепт|напит.+после.+тренировк.+рецепт|recovery.+drink.+recipe|что.+пить.+после.+зал.+рецепт|домашн.+протеин.+напит/i.test(message);
  if (!relevant) return '';
  return `
🥤 РЕЦЕПТЫ ВОССТАНОВИТЕЛЬНЫХ НАПИТКОВ:

1. 🍫 ШОКОЛАДНО-БАНАНОВЫЙ (пост-тренировочный):
- 300 мл молока (обычного или растительного)
- 1 банан
- 30 г сывороточного протеина (шоколадный)
- 1 ст.л. мёда
- 5 г креатина
- КБЖУ: ~400 ккал, 35г белка, 55г углеводов, 5г жиров
- Зачем: белок + быстрые углеводы = оптимальное восстановление

2. 🍒 ВИШНЁВЫЙ АНТИВОСПАЛИТЕЛЬНЫЙ:
- 200 мл вишнёвого сока (натурального!)
- 200 мл воды
- 30 г протеина (ванильный)
- 1 ст.л. мёда
- Щепотка куркумы + чёрного перца
- КБЖУ: ~350 ккал, 30г белка, 50г углеводов
- Зачем: антоцианы вишни снижают воспаление на 25%

3. 🥛 КЕФИРНЫЙ (для ЖКТ + восстановление):
- 300 мл кефира
- 1 банан
- 30 г протеина
- 50 г овсяных хлопьев
- Корица
- КБЖУ: ~450 ккал, 40г белка, 50г углеводов, 7г жиров
- Зачем: пробиотики + белок + медленные углеводы

4. ⚡ ЭЛЕКТРОЛИТНЫЙ (при сильном потоотделении):
- 500 мл воды
- 1/4 ч.л. морской соли (~500 мг натрия)
- Сок половины лимона
- 2 ст.л. мёда
- Щепотка калия (или 100 мл кокосовой воды)
- КБЖУ: ~130 ккал, 0г белка, 32г углеводов
- Зачем: восполнение электролитов без лишних ингредиентов

5. 🫐 АНТИОКСИДАНТНЫЙ СМУЗИ:
- 200 мл молока
- 100 г черники (замороженной)
- 30 г протеина
- 1 ст.л. льняного семени
- 1 ст.л. мёда
- КБЖУ: ~380 ккал, 33г белка, 45г углеводов, 8г жиров
- Зачем: антиоксиданты + омега-3 + белок

6. 🥜 ОРЕХОВЫЙ ГЕЙНЕР (для набора массы):
- 300 мл молока
- 2 ст.л. арахисовой пасты
- 1 банан
- 40 г протеина
- 50 г овсянки
- КБЖУ: ~700 ккал, 50г белка, 65г углеводов, 22г жиров
- Зачем: высокая калорийность для массонабора`;
}
export function getWaterFastingTraining(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['водное голодание', 'water fasting', 'голодание и тренировки', 'тренировка натощак длительно', 'голод и мышцы', 'пост и тренировки'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
💧 ВОДНОЕ ГОЛОДАНИЕ И ТРЕНИРОВКИ — НАУЧНЫЙ ПОДХОД:

═══ ЧТО ПРОИСХОДИТ ПРИ ГОЛОДАНИИ ═══
• 0-12 ч: гликоген печени расходуется, инсулин падает
• 12-24 ч: глюконеогенез, начало кетоза, рост гормона роста
• 24-48 ч: аутофагия, кетоновые тела как основной источник
• 48-72 ч: пик аутофагии, значительный кетоз
• >72 ч: глубокий кетоз, катаболизм мышц усиливается

═══ ВЛИЯНИЕ НА ТРЕНИРОВКИ ═══
• Силовые показатели: падение на 5-15% после 24ч
• Выносливость: снижается значительно после 16ч
• Скорость восстановления: замедляется на 30-50%
• Гормон роста: ↑ до 500% при 24-48ч голодании
• Тестостерон: начинает снижаться после 48ч
• Кортизол: повышается — катаболический эффект

═══ РЕКОМЕНДАЦИИ ═══
⚠️ ВАЖНО: длительное голодание + тренировки = РИСК

Если тренируешься при коротком голодании (16-24ч):
• Только лёгкие/умеренные нагрузки
• Не более 45 минут
• Обязательно пить воду + электролиты (натрий, калий, магний)
• Никаких максимальных весов
• Прекратить при головокружении, тошноте, слабости

При голодании >24ч:
• Рекомендуется только ходьба, лёгкая йога
• Силовые тренировки противопоказаны
• Риск: обморок, травма, рабдомиолиз
• Потеря мышц неизбежна без белка >48ч

═══ АЛЬТЕРНАТИВЫ ═══
• Интервальное голодание 16/8 — безопасно с тренировками
• 5:2 метод — 2 дня ограничения, тренировки в обычные дни
• 24ч однодневное — тренировка ПЕРЕД голоданием
• PSMF (protein-sparing modified fast) — сохраняет мышцы лучше

═══ ВЫХОД ИЗ ГОЛОДАНИЯ ═══
• Не начинать тренировки сразу после окончания
• Первый приём пищи: лёгкий (бульон, овощи)
• Подождать 1-2 дня нормального питания перед тяжёлыми тренировками
• Постепенно увеличивать калории и нагрузку
`;
}
export function getMCTKetoPerformance(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['мст кето', 'mct keto', 'мст и тренировки', 'среднецепочечные триглицериды кето', 'кетогенная спорт', 'кето и сила'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🥥 MCT + КЕТОГЕННАЯ ДИЕТА В СПОРТЕ:

═══ MCT И КЕТОЗ ═══
• MCT (среднецепочечные триглицериды) → прямо в печень → кетоны
• Не требуют L-карнитина для транспорта в митохондрии
• Быстрый источник энергии на кето: 15-30 мин до эффекта
• C8 (каприловая кислота): самый кетогенный MCT
• C10 (каприновая): медленнее, но тоже эффективна

═══ КЕТО И СИЛОВЫЕ ТРЕНИРОВКИ ═══
Адаптация (первые 2-4 недели):
• Падение силы на 10-20% — НОРМАЛЬНО
• Утомляемость, «туман в голове»
• Электролитный дисбаланс → обязательно: Na, K, Mg
• Снижение мощности в высокоинтенсивных упражнениях

После адаптации (4-8 недель):
• Сила восстанавливается на 90-100% от исходной
• Выносливость может улучшиться (жирные кислоты = бесконечный источник)
• Высокоинтенсивные короткие усилия — всё ещё хуже vs углеводы
• Аэробная работа — на уровне или лучше

═══ ПРОТОКОЛ MCT НА КЕТО ═══
• Начинающим: 5 мл × 2 раза/день (избежать ЖКТ проблем)
• Постепенно: увеличивать до 15-30 мл/день за 2 недели
• Перед тренировкой: 15-20 мл MCT C8 за 30-60 мин
• В кофе (bulletproof): 15 мл MCT + масло → утренняя энергия
• С пищей: добавлять в салаты, смузи

═══ КОМУ ПОДХОДИТ КЕТО + MCT ═══
✅ Спортсмены на выносливость (марафон, велогонки)
✅ Люди с целью похудения + сохранение мышц
✅ При метаболическом синдроме / инсулинорезистентности
❌ НЕ подходит для пауэрлифтинга / тяжёлой атлетики (нужен гликоген)
❌ НЕ подходит для спринтеров / взрывных видов
❌ НЕ подходит при проблемах с жёлчным пузырём

═══ TKD (Целевая кето) — КОМПРОМИСС ═══
• 20-50 г быстрых углеводов за 30 мин до тренировки
• Остальное время — строгое кето (<20 г углеводов)
• Углеводы «сгорают» во время тренировки → кетоз не прерывается
• Лучший вариант для силовых атлетов на кето
• MCT + TKD = максимум энергии без выхода из кетоза
`;
}
export function getCarbWindowMythTruth(message: string): string {
  const keywords = ['углеводное окно', 'carb window', 'анаболическое окно', 'после тренировк', 'гликоген восстановл', 'пост-тренировочн'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Углеводное окно — правда и мифы

### Что говорит наука (2024+)
• «30-минутное анаболическое окно» — СИЛЬНО преувеличено
• Реальное окно для синтеза белка: 24-48 часов после тренировки
• Гликогеновое окно: 2-4 часа (для повторных нагрузок в тот же день)
• Для большинства атлетов (1 тренировка/день): обычное питание = достаточно

### Когда углеводное окно РЕАЛЬНО важно
✓ Две тренировки в день (интервал <8 часов)
✓ Многодневные соревнования
✓ Тренировки с истощением гликогена (>90 мин интенсивных)
✓ Профессиональные спортсмены с жёстким графиком

### Когда НЕ критично
✗ Одна тренировка в день с нормальным питанием
✗ Силовые тренировки <60 мин
✗ Цель — похудение (дефицит калорий важнее тайминга)
✗ Рекреационный фитнес

### Оптимальное питание после тренировки
**В течение 2 часов (не 30 минут!):**
• Белок: 20-40 г (0.25-0.4 г/кг)
• Углеводы: 0.8-1.2 г/кг (если гликоген истощён)
• Соотношение У:Б = 3:1 до 4:1 (для восполнения гликогена)

**Лучшие пост-тренировочные продукты:**
• Куриная грудка + рис
• Творог + банан + мёд
• Протеиновый шейк + овсянка
• Яйца + хлеб + фрукт

### Гликоген — что нужно знать
• Запасы: 300-600 г (мышцы) + 80-110 г (печень)
• Скорость восстановления: 5-7% в час (с углеводами)
• Полное восстановление: 24-48 часов при нормальном питании
• Ускорение: быстрые углеводы + белок сразу после тренировки

### Синтез мышечного белка (MPS)
• Пик MPS: 24-48 часов после тренировки
• Каждый приём белка (20-40 г) стимулирует MPS на 1-3 часа
• Оптимально: 4-5 приёмов белка в день каждые 3-5 часов
• Тайминг белка вокруг тренировки: маленький бонус (+5-10%)
• Общее суточное потребление белка >>> тайминг

### Итоговые рекомендации
1. Не паникуй, если не поел за 30 мин после тренировки
2. Ешь полноценный приём пищи в течение 1-2 часов после
3. Фокусируйся на суточном потреблении белка (1.6-2.2 г/кг)
4. Углеводное окно важно только при двух тренировках в день
5. Лучшее питание = то, которое ты можешь соблюдать стабильно
`;
}
export function getReverseDietCompleteGuide(message: string): string {
  const keywords = ['обратная диета', 'reverse diet', 'реверс диет', 'после дефицит', 'выход из диеты', 'метаболическ адаптац', 'восстановлен метаболизм'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Реверс-диета — полный гид

### Что это и зачем
• Постепенное увеличение калорий после периода дефицита
• Цель: восстановить метаболизм без резкого набора жира
• Организм адаптируется к дефициту: ↓ метаболизм, ↓ лептин, ↓ T3
• Резкий возврат к обычному питанию = быстрый набор жира (rebound)

### Метаболическая адаптация (почему нужна реверс-диета)
• Термогенез активности (NEAT): ↓ на 200-500 ккал/день при дефиците
• Тиреоидные гормоны (T3, T4): ↓ на 15-25%
• Лептин: ↓ на 40-60% → голод ↑↑
• Кортизол: ↑ на 20-30% → задержка воды, разрушение мышц
• Тестостерон: ↓ на 10-20% (при длительном дефиците)

### Протокол реверс-диеты
**Фаза 1 (1-2 недели): Стабилизация**
• Остановись на текущих калориях
• Увеличь углеводы на 20-30 г (из жёстких ограничений)
• Цель: прекратить потерю веса, стабилизироваться

**Фаза 2 (4-8 недель): Постепенный подъём**
• +50-100 ккал/неделю (из углеводов)
• Пример: 1800 → 1850 → 1900 → 1950 → 2000 → ...
• Мониторь вес: допустимый набор 0.2-0.5 кг/нед (вода + гликоген)
• Жиры: также постепенно ↑ (до 25-30% от калорий)

**Фаза 3 (2-4 недели): Поддержание**
• Достигни расчётного TDEE (или чуть выше)
• Стабилизируй вес на 2-3 недели
• Гормоны восстанавливаются: лептин, T3, тестостерон

### Что происходит с весом
• Первые 1-2 недели: +1-3 кг (вода + гликоген — это НОРМАЛЬНО)
• Не путай с жиром! 1 г гликогена = 3 г воды
• Реальный жир набирается медленно (0.1-0.2 кг/нед при умеренном профиците)
• После стабилизации: вес может даже снизиться (нормализация кортизола)

### Тренировки во время реверс-диеты
• Объём ↑ постепенно (больше калорий = лучше восстановление)
• Кардио ↓ постепенно (если было избыточным при сушке)
• Силовые: увеличивай нагрузку (энергия возвращается)
• Не делай резких изменений — постепенность во всём

### Психологический аспект
• Вес БУДЕТ расти — это нормально (вода + гликоген)
• Не паникуй и не возвращайся в дефицит
• Фокус: долгосрочное здоровье > краткосрочный рельеф
• Доверяй процессу: 8-12 недель → полное восстановление метаболизма
`;
}
export function getWaterBalancePreciseCalc(message: string): string {
  const keywords = ['вод баланс', 'сколько воды', 'питьевой режим', 'water intake', 'гидратац расчёт', 'норма воды', 'обезвожив'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Водный баланс — точный расчёт для спортсмена

### Базовая формула
**Минимум:** 30 мл × вес тела (кг) = мл/день
**Активный спортсмен:** 35-40 мл × вес тела (кг)
**Жаркий климат / интенсивные нагрузки:** 40-50 мл × вес тела (кг)

Пример: 80 кг × 40 мл = 3200 мл (3.2 л/день)

### Дополнительная вода при тренировке
• За 2-4 часа до: 400-600 мл
• За 15-30 мин до: 200-300 мл
• Во время: 150-250 мл каждые 15-20 мин
• После: 150% потерянного веса за 2-4 часа

### Факторы, увеличивающие потребность
• Тренировка: +500-1500 мл за сессию
• Высокобелковая диета: +250-500 мл (переработка белка)
• Креатин: +500-750 мл (гидратация мышц)
• Кофе/чай: НЕ обезвоживают (вопреки мифу), но +100 мл на чашку
• Алкоголь: +250 мл воды на каждый алкогольный напиток
• Сауна/баня: +500-1000 мл

### Признаки обезвоживания
**Лёгкая (1-2% потеря массы):**
• Жажда, сухость во рту
• Тёмная моча
• Снижение производительности -5-10%

**Умеренная (3-5%):**
• Головная боль, усталость
• Судороги мышц
• ↓ Производительность -20-30%
• ↓ Координация, замедление реакции

**Тяжёлая (>5%):**
• Тахикардия, головокружение
• Спутанность сознания
• Тепловой удар — СКОРАЯ ПОМОЩЬ!

### Тест цвета мочи
• 💧 Прозрачная/бледно-жёлтая: оптимальная гидратация
• 🟡 Жёлтая: нормально, но можно пить больше
• 🟠 Тёмно-жёлтая/янтарная: обезвоживание, пей сейчас!
• Утренняя моча чуть темнее — это нормально

### Электролиты
• При потерях >1 л: добавляй натрий (0.5-1 г на литр)
• Калий: бананы, картофель, авокадо
• Магний: орехи, зелень, добавки
• Не пей чистую воду литрами без соли (риск гипонатриемии!)

### Практические советы
• Бутылка воды всегда с собой
• Пей по чуть-чуть весь день (не 1 л залпом)
• Фрукты/овощи содержат воду: арбуз, огурцы, помидоры = до 95% воды
• Первое, что делаешь утром: 300-500 мл воды
• Приложения для отслеживания: напоминают пить
`;
}
export function getNutritionPeriodizationPhases(message: string): string {
  const keywords = ['периодизац питан', 'фаза набор', 'фаза сушк', 'bulk cut', 'набор масс', 'сушка', 'caloric phases'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Периодизация питания: фазы

### Фаза 1: Набор массы (Bulking)
**Профицит:** +300-500 ккал/день (чистый набор)
**Макросы:**
• Белок: 1.6-2.2 г/кг
• Жиры: 0.8-1.2 г/кг
• Углеводы: остаток калорий (4-7 г/кг)

**Ожидания:**
• Набор: 0.25-0.5 кг/неделю (новички: до 1 кг)
• Соотношение: ~60% мышцы / 40% жир (при чистом набор)
• Длительность: 3-6 месяцев

**Ошибки:**
• «Грязный» набор (+1000 ккал) → больше жира, не больше мышц
• Слишком мало белка (студенческий рамен ≠ bulking food)
• Нет тренировочного стимула → профицит = только жир

### Фаза 2: Поддержание (Maintenance)
**Калории:** = TDEE (общий расход энергии)
**Цели:**
• Закрепить набранную массу
• Восстановить гормоны после дефицита
• Рекомпозиция (для новичков: мышцы растут и на поддержке!)

**Длительность:** 2-4 недели между фазами (минимум)
**Макросы:** белок 1.6-2 г/кг, остальное гибко

### Фаза 3: Сушка (Cutting)
**Дефицит:** -300-500 ккал/день (медленная) или -500-750 (быстрая)
**Макросы:**
• Белок: 2.0-2.4 г/кг (↑ при дефиците — сохранение мышц!)
• Жиры: 0.6-1.0 г/кг (не ниже 0.5 — гормоны)
• Углеводы: остаток

**Ожидания:**
• Потеря: 0.5-1% массы тела/неделю (медленная → сохраняет мышцы)
• При >1%/неделю: ↑ потеря мышц, ↓ производительность
• Длительность: 8-16 недель (не дольше без перерыва)

### Фаза 4: Рекомпозиция (Recomp)
**Для кого:** новички, люди с лишним весом, после долгого перерыва
**Калории:** = TDEE или лёгкий дефицит (-100-200 ккал)
**Результат:** медленный одновременный набор мышц + потеря жира
**Длительность:** 6-12+ месяцев
**Белок:** 2.0-2.4 г/кг (максимально важен)

### Годовой план (пример)
• Январь-Апрель: Набор массы (+400 ккал)
• Май: Поддержание (2-3 недели)
• Июнь-Август: Сушка (-500 ккал) → форма к лету
• Сентябрь: Реверс-диета (2-3 недели)
• Октябрь-Декабрь: Набор массы (+350 ккал)

### Ключевые правила
1. Не набирай >15% жира (тяжело потом сушить)
2. Не сушись <8-10% жира мужчинам (гормональный спад)
3. Переходы между фазами: плавные (2-3 недели)
4. Белок высокий ВСЕГДА (минимум 1.6 г/кг в любой фазе)
5. Тренируйся тяжело в любой фазе (сохраняй стимул!)
`;
}
export function getMealPrepAthleteMastery(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['meal prep', 'мил преп', 'подготовка еды', 'готовка на неделю', 'заготовка еды', 'приготовление заранее', 'meal planning', 'планирование питания', 'контейнеры еда', 'еда на несколько дней', 'заготовки'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🍱 MEAL PREP — МАСТЕРСТВО ПОДГОТОВКИ ЕДЫ ДЛЯ АТЛЕТОВ

📋 ПОШАГОВЫЙ ПЛАН НА НЕДЕЛЮ:

ШАГ 1 — РАСЧЁТ (пятница вечер, 15 мин):
• Определи КБЖУ на неделю (цель × 7 дней)
• Раздели на 4-5 приёмов пищи × 7 дней
• Составь список продуктов (шаблон ниже)

ШАГ 2 — ЗАКУПКА (суббота утро, 1-2 часа):
Базовый список атлета:
Белок: куриная грудка 2-3 кг, фарш 90/10 1 кг, яйца 30 шт, творог 1 кг, рыба 1 кг
Углеводы: рис 2 кг, гречка 1 кг, овсянка 1 кг, макароны 1 кг, картофель 2 кг
Жиры: оливковое масло, авокадо 4-5 шт, орехи 500г
Овощи: брокколи 1 кг, шпинат, помидоры, огурцы, перец
Фрукты: бананы 7-10 шт, яблоки, ягоды

ШАГ 3 — ПРИГОТОВЛЕНИЕ (воскресенье, 3-4 часа):
Порядок готовки (параллельные процессы):

10:00 — Включи духовку 200°C
10:05 — Поставь рис + гречку (мультиварки/кастрюли)
10:10 — Замаринуй курицу (соевый соус, специи, лимон)
10:15 — Нарежь овощи для запекания
10:30 — Курица и овощи в духовку (25-30 мин)
10:35 — Обжарь фарш с луком и специями
10:45 — Свари яйца вкрутую (12 мин)
11:00 — Достань курицу, начни рыбу (духовка 180°, 15-20 мин)
11:30 — Всё готово → остуди до комнатной температуры
12:00 — Разложи по контейнерам

📦 СИСТЕМА КОНТЕЙНЕРОВ:
• 14-21 контейнер (2-3 приёма × 7 дней)
• Стеклянные > пластиковые (микроволновка, долговечность)
• Разделённые контейнеры: белок | углевод | овощи
• Маркировка: день + приём пищи (Пн-обед, Вт-ужин)

🧊 ХРАНЕНИЕ:
• Холодильник: 3-4 дня (Вс-Ср)
• Морозилка: оставшиеся 3 дня (Чт-Сб) → разморозь вечером перед
• Рис/гречка: хранятся 5-6 дней в холодильнике
• Курица: 4 дня холодильник, 3 мес морозилка
• Рыба: 2-3 дня холодильник → лучше готовить в среду дополнительно

⚡ ЛАЙФХАКИ:
• Мультиварка = друг: закинь на ночь → утром готово
• Slow cooker рагу: 2 кг курицы + овощи + соус = 8-10 порций за 0 усилий
• Овсянка overnight: 7 банок + молоко + ягоды + протеин → завтрак готов
• Замороженные овощи = ОК (95% нутриентов сохраняется)
• Специи — разнообразие без калорий: курица может быть итальянской, мексиканской, азиатской

📊 ПРИМЕРНЫЙ ДЕНЬ (набор массы, 3000 ккал):
07:00 — Овсянка 100г + банан + протеин (550 ккал, 35Б/70У/12Ж)
10:00 — Перекус: творог 200г + орехи 30г + ягоды (350 ккал, 30Б/15У/18Ж)
13:00 — Обед: курица 200г + рис 150г (сухой) + овощи (650 ккал, 45Б/80У/10Ж)
16:00 — Пре-тренировка: банан + хлебцы + джем (250 ккал, 5Б/55У/2Ж)
18:30 — Пост-тренировка: протеин + банан (300 ккал, 35Б/35У/3Ж)
20:00 — Ужин: рыба 200г + гречка 150г + овощи (600 ккал, 45Б/65У/15Ж)
22:00 — Казеин / творог 200г (300 ккал, 35Б/10У/8Ж)

💰 БЮДЖЕТ (Россия, ~руб/неделя):
• Бюджетный вариант: 3000-4000₽ (курица, яйца, рис, гречка, овощи сезонные)
• Средний: 5000-7000₽ (+ рыба, говядина, фрукты, добавки)
• Премиум: 8000-12000₽ (+ лосось, индейка, авокадо, ягоды)
`;
}
export function getProteinMythsScienceGuide(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['мифы о белке', 'мифы о протеине', 'protein myth', 'сколько белка усваивается', 'белок за раз', '30 грамм белка', 'белок вредит почкам', 'почки белок', 'протеин вредно', 'белок правда', 'мифы питание белок'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🥩 МИФЫ О БЕЛКЕ — НАУЧНОЕ РАЗВЕНЧАНИЕ

❌ МИФ 1: «Организм усваивает только 30г белка за раз»
✅ ПРАВДА: Организм усваивает ВЕСЬ поступающий белок. Нет «предела»
• Исследование (Schoenfeld 2018): разницы в мышечном росте между 30г x 4 и 60г x 2 — не обнаружено
• Механизм: кишечник адаптирует скорость всасывания под объём пищи
• НО: для максимальной стимуляции МПС (мышечный протеиносинтез) оптимально 0.4-0.55г/кг за приём
• Вывод: 2-4 приёма белка в день — оптимально, но не из-за «лимита усвоения», а из-за частоты стимуляции МПС

❌ МИФ 2: «Высокобелковая диета вредит почкам»
✅ ПРАВДА: У здоровых людей — нет доказательств вреда (до 3.5г/кг)
• Мета-анализ (Devries 2018): 74 исследования, >3000 участников → нет ухудшения функции почек
• Повышенная СКФ (скорость клубочковой фильтрации) = адаптация, не повреждение
• ⚠️ Исключение: людям с СУЩЕСТВУЮЩЕЙ болезнью почек → ограничивать белок по рекомендации врача
• Аналогия: «высокий пульс при беге не повреждает сердце — это адаптация»

❌ МИФ 3: «Белок из растений неполноценный и бесполезный»
✅ ПРАВДА: Растительные белки работают, но требуют комбинирования
• Проблема: большинство растительных источников имеют лимитирующую аминокислоту
  → Бобовые: мало метионина | Злаки: мало лизина
• Решение: комбинируй за день (не обязательно в один приём!)
  → Рис + бобовые = полный аминокислотный профиль
• Для атлетов-веганов: +10-20% к общему количеству белка (компенсация биодоступности)
• Лейцин: 2.5-3г за приём → может потребоваться бОльшая порция растительного белка

❌ МИФ 4: «Чем больше белка — тем больше мышцы»
✅ ПРАВДА: Есть потолок полезного эффекта
• Мета-анализ (Morton 2018): 1.6г/кг/день — верхний порог пользы для большинства
• Для натуральных атлетов в дефиците: до 2.2-2.4г/кг (защита от потери мышц)
• >2.5г/кг: лишние калории, нет дополнительного роста мышц
• Исключение: продвинутые атлеты в глубоком дефиците — до 3.0г/кг

❌ МИФ 5: «Белковое окно 30 минут после тренировки — или мышцы сдуются»
✅ ПРАВДА: «Окно» значительно шире — 4-6 часов (и даже больше)
• Schoenfeld 2013: мета-анализ → время приёма белка post-workout не критично
• Важнее: общий суточный белок + распределение по 3-4 приёма
• Если ты ел за 2-3 часа до тренировки → аминокислоты ещё циркулируют
• Если тренировался натощак → тогда да, поешь в течение 1-2 часов

❌ МИФ 6: «Протеиновый порошок лучше обычной еды»
✅ ПРАВДА: Нет принципиальной разницы для роста мышц
• Протеин = удобство, не превосходство
• Цельная пища: дополнительные микронутриенты, клетчатка, сытость
• Когда порошок полезен: сразу после тренировки (быстро), дорога, перекус
• Сывороточный vs казеин vs растительный — для роста мышц при равном лейцине разницы почти нет

❌ МИФ 7: «Белок на ночь превращается в жир»
✅ ПРАВДА: Казеин перед сном УЛУЧШАЕТ восстановление
• Snijders 2015: 40г казеина перед сном → +38% синтеза мышечного белка ночью
• Ночь = 7-9 часов без еды → медленный белок поддерживает анаболизм
• Жир накапливается от ИЗБЫТКА калорий за день, не от времени приёма

📊 РЕЗЮМЕ — ЧТО РЕАЛЬНО РАБОТАЕТ:
• Общий белок: 1.6-2.2г/кг/день (в зависимости от цели и дефицита)
• Распределение: 3-5 приёмов по 0.4-0.55г/кг
• Качество: достаточный лейцин (2.5-3г за приём)
• Источники: 70% цельная пища, 30% добавки (по желанию)
• Перед сном: казеин/творог 200-250г — да, это работает
`;
}
export function getCarbSourcesAthleteRanking(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['источники углеводов', 'лучшие углеводы', 'carb sources', 'какие углеводы', 'углеводы для спорта', 'рейтинг углеводов', 'быстрые медленные углеводы', 'гликемический индекс', 'сложные углеводы', 'простые углеводы'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🍚 РЕЙТИНГ ИСТОЧНИКОВ УГЛЕВОДОВ ДЛЯ АТЛЕТОВ

📊 КЛАССИФИКАЦИЯ:

🟢 МЕДЛЕННЫЕ (низкий ГИ, <55):
→ Постепенное повышение сахара в крови, длительная энергия
→ Идеально: 2-3ч до тренировки, в течение дня, перед сном

🟡 СРЕДНИЕ (средний ГИ, 55-70):
→ Умеренная скорость усвоения
→ Идеально: 1-2ч до тренировки

🔴 БЫСТРЫЕ (высокий ГИ, >70):
→ Быстрое повышение глюкозы и инсулина
→ Идеально: 30 мин до тренировки, во время, сразу после

📋 РЕЙТИНГ ПО КАТЕГОРИЯМ:

🥇 ТОП-5 УГЛЕВОДОВ ДЛЯ АТЛЕТА:

1. ОВСЯНКА (ГИ 55):
• 66г углеводов/100г сухой
• Бета-глюкан → стабильная энергия на 3-4ч
• Клетчатка + белок (13г/100г)
• Лучшее время: завтрак, 2-3ч до тренировки
• Готовка: 1:2 с водой/молоком, 3-5 мин

2. РИС БЕЛЫЙ (ГИ 73):
• 78г углеводов/100г сухой, легкоусвояемый
• Минимум клетчатки → не вызывает дискомфорт
• Универсальный: до, после тренировки, любой приём
• Русский атлетический стандарт: курица + рис = классика
• Басмати: ГИ 58 (медленнее), жасмин: ГИ 80 (быстрее)

3. ГРЕЧКА (ГИ 54):
• 71г углеводов/100г, 13г белка, 3.4г жира
• Рутин → антиоксидант, укрепление сосудов
• Все незаменимые аминокислоты (необычно для крупы!)
• Уникально для России: дёшево, доступно, питательно
• Лучшее время: обед, ужин, 2-3ч до тренировки

4. КАРТОФЕЛЬ (ГИ 70-85):
• 17г углеводов/100г (готовый), калий 421мг
• Самый сытный продукт (индекс сытости = №1)
• Варёный/запечённый: ГИ 70 | Пюре: ГИ 85
• Охлаждённый картофель: резистентный крахмал (+пребиотик)
• Батат (сладкий): ГИ 54, больше витамина А, бета-каротин

5. БАНАНЫ (ГИ 51-62):
• 23г углеводов/банан, калий 422мг
• Зелёный: ГИ 42, резистентный крахмал
• Жёлтый: ГИ 51, баланс
• С коричневыми точками: ГИ 62, больше простых сахаров
• Идеальный pre/post-workout снэк: портативный, дешёвый, эффективный

📊 РАСШИРЕННЫЙ РЕЙТИНГ:

КРУПЫ И ЗЛАКИ:
6. Макароны из твёрдых сортов (ГИ 45): медленные, сытные
7. Булгур (ГИ 48): клетчатка + белок
8. Киноа (ГИ 53): полный аминокислотный профиль
9. Перловка (ГИ 25): самый низкий ГИ среди круп
10. Кускус (ГИ 65): быстрый в готовке

ФРУКТЫ:
11. Яблоки (ГИ 36): пектин, портативность
12. Ягоды (ГИ 25-40): антиоксиданты, низкокалорийные
13. Апельсины (ГИ 43): витамин C
14. Финики (ГИ 42-62): натуральная энергия, калий
15. Арбуз (ГИ 72, но низкая ГН): гидратация

⏰ ТАЙМИНГ:
УТРО: овсянка / гречка + фрукты
2-3Ч ДО: рис / макароны / картофель + белок
30 МИН ДО: банан / финики / хлебцы
ВО ВРЕМЯ (>60 мин): спортивный напиток / банан / гель
ПОСЛЕ: рис / картофель / банан + белок
ВЕЧЕР: гречка / овсянка / батат (медленные)

💡 СКОЛЬКО УГЛЕВОДОВ:
• Набор массы: 4-6г/кг/день
• Поддержание: 3-5г/кг/день
• Сушка: 2-3г/кг/день (не ниже 2г!)
• День тренировки: +50-100г vs день отдыха
`;
}
export function getFatLossPreserveMuscleGuide(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['сушка без потери мышц', 'жиросжигание мышцы', 'fat loss muscle', 'похудеть не теряя мышцы', 'сохранить мышцы сушка', 'дефицит калорий мышцы', 'сушка правильно', 'cutting guide', 'как сушиться', 'рекомпозиция'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🔥 СУШКА БЕЗ ПОТЕРИ МЫШЦ — НАУЧНЫЙ ПОДХОД

📊 СКОРОСТЬ ПОХУДЕНИЯ:
• Оптимально: 0.5-1% массы тела в неделю
• Мужчина 80 кг: 0.4-0.8 кг/нед
• >1% в неделю: высокий риск потери мышц
• <0.5%: слишком медленно, дефицит минимален
• Чем больше % жира, тем агрессивнее можно (до 1.5%/нед при >25% жира)

🍽️ ДЕФИЦИТ КАЛОРИЙ:
• Умеренный дефицит: 300-500 ккал/день (оптимально)
• Агрессивный: 500-750 ккал/день (только при высоком % жира)
• Экстремальный: >750 ккал → потеря мышц неизбежна
• Расчёт: TDEE - 300-500 = целевые калории
• Пересчитывай каждые 2-3 недели (метаболизм адаптируется)

🥩 БЕЛОК — ГЛАВНЫЙ ЗАЩИТНИК МЫШЦ:
• Минимум: 1.8г/кг (в дефиците потребность ВЫШЕ, не ниже!)
• Оптимум: 2.0-2.4г/кг (чем глубже дефицит, тем больше белка)
• Распределение: 4-5 приёмов по 0.4-0.55г/кг
• Перед сном: казеин/творог 200-250г (защита от ночного катаболизма)
• Мета-анализ (Helms 2014): 2.3-3.1г/кг для натуральных атлетов на сушке

🏋️ ТРЕНИРОВКИ (самое важное):
1. СОХРАНЯЙ ИНТЕНСИВНОСТЬ (вес на штанге):
   • НЕ переходи на «многоповторку с лёгким весом»
   • Это миф! Лёгкий вес × много повторений ≠ «рельеф»
   • Тяжёлые веса → сигнал телу СОХРАНЯТЬ мышцы
   • Правило: если до сушки жал 100x5, продолжай жать 100x5 (или 95x5)

2. СОКРАЩАЙ ОБЪЁМ, НЕ ИНТЕНСИВНОСТЬ:
   • Снижение объёма на 30-40% допустимо
   • Было 16 подходов на грудь → стало 10-12
   • Но вес в каждом подходе — максимально близкий к пре-сушке

3. ЧАСТОТА: 3-4 раза/неделю
   • Чаще чем при наборе — не нужно
   • Восстановление в дефиците хуже → меньше объём, но сохраняй частоту

🏃 КАРДИО:
• Приоритет: NEAT (шаги 8-12K/день) > LISS > HIIT
• LISS (ходьба 30-45 мин): не мешает восстановлению, сжигает жир
• HIIT: максимум 2 раза/неделю (перетренированность в дефиците)
• НЕ начинай с максимума кардио — добавляй постепенно
• Правило: начни с 0 кардио → дефицит из питания → добавляй кардио когда плато

📋 НУТРИТИВНЫЕ СТРАТЕГИИ:

РЕФИДЫ (1 раз/нед):
• +500 ккал к дефициту за счёт УГЛЕВОДОВ
• Восполнение гликогена → лучшая тренировка
• Лептин ↑ → метаболизм не замедляется
• В день тяжёлой тренировки

DIET BREAK (каждые 4-6 недель):
• 1-2 недели на поддерживающих калориях
• Психологическая перезагрузка
• Гормональная нормализация (T3, лептин, кортизол)
• Исследование (Byrne 2018): прерывистый дефицит → -50% потери мышц

ПРИОРИТЕТ МАКРОСОВ:
1. Белок: фиксирован (2.0-2.4г/кг) — не снижай!
2. Жиры: ≥0.8г/кг (гормональное здоровье)
3. Углеводы: переменная (заполняй оставшиеся калории)

📊 МОНИТОРИНГ:
• Вес: ежедневно утром натощак → средняя за неделю
• Обхваты: талия, руки, бёдра — каждые 2 недели
• Фото: в одинаковых условиях каждые 2 недели
• Сила: если 1ПМ упал >10% → дефицит слишком агрессивен
• Сон, настроение, либидо: ухудшение = тело перенапряжено

⚠️ КРАСНЫЕ ФЛАГИ (снизь дефицит!):
• Сила падает более 10% за 2 недели
• Постоянная усталость, раздражительность
• Снижение либидо
• Бессонница
• Частые простуды
→ Это не «слабость» — это сигнал, что дефицит слишком агрессивен
`;
}
export function getIntermittentFastingTrainingComplete(message: string): string {
  const keywords = ['интервальное голодание', 'периодическое голодание', 'голодан', 'fasting', 'натощак', '16/8', '16:8', '18/6', '20/4', 'пищевое окно', 'окно питания'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⏰ ИНТЕРВАЛЬНОЕ ГОЛОДАНИЕ И ТРЕНИРОВКИ — ПОЛНЫЙ ГАЙД:

📊 ПРОТОКОЛЫ IF:
• 16/8 — самый популярный, 8 часов еда / 16 голод
• 18/6 — более жёсткий, подходит опытным
• 20/4 (Warrior Diet) — 1-2 больших приёма пищи
• 5:2 — 5 дней нормально / 2 дня 500-600 ккал
• OMAD (один приём) — экстремальный, НЕ рекомендуется для тренирующихся

🔬 ФИЗИОЛОГИЯ ГОЛОДАНИЯ:
• 12-16 часов: истощение гликогена печени, усиление жиросжигания
• 16-24 часа: пик аутофагии (очистка клеток от повреждённых белков)
• Повышение гормона роста на 300-500% через 24 часа
• Повышение норадреналина — мобилизация жиров
• Инсулин падает до минимума — максимальная инсулиновая чувствительность
• mTOR снижается → аутофагия → затем при еде mTOR активируется сильнее

💪 ТРЕНИРОВКИ В РЕЖИМЕ IF:
Силовые НАТОЩАК:
• Возможно, но эффективность снижается на 10-15%
• BCAA/EAA 10 г за 30 мин до тренировки — сохранение мышц
• Тренировка ближе к концу голодного окна — оптимально
• Первый приём пищи СРАЗУ после тренировки

Силовые В ПИЩЕВОМ ОКНЕ (оптимально):
• Приём пищи за 2-3 часа до тренировки
• Пост-тренировочный приём через 1-2 часа
• Основная порция белка — после тренировки (40-50 г)

Кардио НАТОЩАК:
• Низкоинтенсивное (ходьба, лёгкий бег) — эффективно для жиросжигания
• HIIT натощак — НЕ рекомендуется, катаболизм мышц
• Утреннее кардио натощак + вечерние силовые в пищевом окне = идеал

📋 ОПТИМАЛЬНОЕ РАСПИСАНИЕ (16/8):
7:00 — подъём, вода, кофе (без сахара/молока)
8:00 — кардио натощак (по желанию)
12:00 — первый приём пищи (30% калорий)
15:00 — второй приём (25% калорий)
17:00 — тренировка силовая
18:30 — основной приём после тренировки (35% калорий)
20:00 — последний приём (10% калорий) — казеин/творог
20:00-12:00 — голодное окно

⚠️ КОМУ IF НЕ ПОДХОДИТ:
• Набор массы при дефиците калорий от природы (хардгейнеры)
• Расстройства пищевого поведения (анорексия, булимия)
• Диабет 1 типа
• Беременность/кормление
• Подростки до 18 лет
• Критически низкий % жира (<10% м, <18% ж)

✅ КОМУ IF ПОДХОДИТ ИДЕАЛЬНО:
• Похудение при сохранении мышц — IF + силовые + высокий белок
• Занятые люди — меньше готовки и приёмов пищи
• Инсулинорезистентность — мощный инструмент
• Люди 30+ — аутофагия и долголетие
`;
}
export function getProteinDigestionAbsorptionScience(message: string): string {
  const keywords = ['усвоение белка', 'переваривание белка', 'protein absorption', 'сколько белка за раз', 'скорость усвоения', 'белок за приём', 'казеин vs сывороточн', 'аминокислоты усвоение', 'пищеварение белк', 'анаболическое окно', 'лейцин порог'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥩 ПЕРЕВАРИВАНИЕ И УСВОЕНИЕ БЕЛКА — НАУКА:

🔬 ФИЗИОЛОГИЯ ПИЩЕВАРЕНИЯ БЕЛКА:
• Желудок: пепсин + HCl → денатурация и начальный гидролиз
• 12-перстная: трипсин + химотрипсин → пептиды
• Тонкий кишечник: пептидазы → аминокислоты → всасывание
• Скорость опорожнения желудка: 1.3-10 г белка/час (зависит от источника)
• ВЕСЬ съеденный белок усваивается — вопрос лишь в скорости

📊 СКОРОСТЬ УСВОЕНИЯ ПО ИСТОЧНИКАМ:
• Изолят сыворотки: 8-10 г/час (быстрый пик аминокислот)
• Концентрат сыворотки: 6-8 г/час
• Яйца (целые): 3-4 г/час
• Казеин: 6-7 г/час (медленный, длительный поток)
• Курица/мясо: 3-6 г/час
• Растительный белок: 3-5 г/час (+ клетчатка замедляет)
• Творог: 4-6 г/час (казеин + сыворотка)

❌ МИФ: «Организм усваивает только 30 г белка за раз»:
• НЕПРАВДА — организм усвоит ВСЕ, что вы съедите
• 30 г — это порог МАКСИМАЛЬНОЙ стимуляции MPS (синтеза мышечного белка)
• Исследования Schoenfeld 2018: до 0.4-0.55 г/кг за приём стимулирует MPS
• Лишний белок: глюконеогенез, окисление, термический эффект
• Но для СОХРАНЕНИЯ мышц и насыщения — можно и 50-70 г за приём

🎯 ЛЕЙЦИНОВЫЙ ПОРОГ:
• Минимум 2.5-3 г лейцина за приём для активации mTOR
• 20-25 г качественного белка = ~2.5 г лейцина
• После 40 лет: порог растёт — нужно 3-4 г лейцина (30-40 г белка)
• Растительные белки: лейцина меньше — нужно 35-45 г за приём

📋 ОПТИМАЛЬНАЯ СТРАТЕГИЯ РАСПРЕДЕЛЕНИЯ:
• 4-5 приёмов по 30-40 г белка = оптимально для MPS
• Интервал между приёмами: 3-5 часов
• Белок перед сном: 30-40 г казеина — поддержание MPS ночью
• После тренировки: 40 г (20 г сыворотки + 20 г твёрдая пища)

💡 ФАКТОРЫ, ВЛИЯЮЩИЕ НА УСВОЕНИЕ:
Улучшают:
• Термическая обработка мяса — денатурация = легче расщепить
• Маринование в кислоте (лимон, уксус) — начало денатурации
• Ферментация (кефир, йогурт) — частично переварен
• Пищеварительные ферменты (бромелаин, папаин) при проблемах с ЖКТ
• Достаточная кислотность желудка — не пить много воды ВО ВРЕМЯ еды

Ухудшают:
• Избыток клетчатки в одном приёме (>15 г)
• Антинутриенты (фитаты, танины) — особенно в бобовых
• Стресс и спешка — снижает секрецию ферментов
• НПВС (ибупрофен) при регулярном приёме — повреждение слизистой
• Низкая кислотность желудка (частая проблема после 40)

⏰ ТАЙМИНГ ДЛЯ МАКСИМАЛЬНОЙ АНАБОЛИИ:
Утро: 30-40 г (прервать ночной катаболизм)
Пред-тренировка (2 часа до): 30 г с медленными углеводами
Пост-тренировка (0-2 часа): 40 г быстрый белок
Перед сном: 30-40 г казеин/творог
`;
}
export function getAntiInflammatoryDietAthletes(message: string): string {
  const keywords = ['воспалени', 'противовоспалительн', 'anti-inflammat', 'inflammation', 'хроническое воспаление', 'боль суставы еда', 'диета воспалени', 'антиоксидант', 'куркум', 'имбирь'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔥 ПРОТИВОВОСПАЛИТЕЛЬНОЕ ПИТАНИЕ ДЛЯ СПОРТСМЕНОВ:

🔬 ВОСПАЛЕНИЕ И ТРЕНИРОВКИ:
• Острое воспаление после тренировки = НОРМАЛЬНО и НУЖНО для адаптации
• Хроническое системное воспаление = ПЛОХО — замедляет восстановление
• Маркеры: CRP, IL-6, TNF-α — повышены при хроническом воспалении
• Причины хронического: плохой сон, стресс, неправильная еда, перетренированность
• Цель: НЕ подавлять острое, а контролировать хроническое

🟢 ПРОТИВОВОСПАЛИТЕЛЬНЫЕ ПРОДУКТЫ:
Топ-15 для спортсменов:
1. Жирная рыба (лосось, скумбрия) — EPA/DHA, 2-3 раза в неделю
2. Черника — антоцианы, 100-150 г/день
3. Вишня (терпкая) — мелатонин + антиоксиданты, сок перед сном
4. Куркума — куркумин, 500-1000 мг с пиперином
5. Имбирь — гингерол, 2-4 г/день свежего
6. Листовая зелень (шпинат, кале) — витамин K, магний
7. Оливковое масло extra virgin — олеокантал (как ибупрофен!)
8. Грецкие орехи — ALA омега-3 + полифенолы
9. Авокадо — олеиновая кислота + витамин E
10. Зелёный чай — EGCG, 3-4 чашки/день
11. Тёмный шоколад (>70%) — флавоноиды, 20-30 г/день
12. Чеснок — аллицин, 2-3 зубчика/день
13. Томаты — ликопин (усвоение лучше при нагреве с маслом)
14. Брокколи — сульфорафан, лучше слегка пропаренная
15. Гранат — пуникалагины, 200 мл сока/день

🔴 ПРОВОСПАЛИТЕЛЬНЫЕ ПРОДУКТЫ (минимизировать):
• Трансжиры — маргарин, фритюр, фаст-фуд
• Рафинированный сахар >50 г/день — гликирование белков
• Рафинированные масла (подсолнечное, кукурузное) — избыток омега-6
• Переработанное мясо (колбасы, сосиски) — нитраты + AGEs
• Алкоголь — повышает проницаемость кишечника
• Белый хлеб, выпечка — быстрые углеводы → инсулин → воспаление

📋 ПРОТИВОВОСПАЛИТЕЛЬНЫЙ ПРОТОКОЛ ДЛЯ АТЛЕТА:
Утро: зелёный чай + овсянка с черникой и грецкими орехами
Обед: лосось + бурый рис + брокколи + оливковое масло
Перекус: авокадо + гранатовый сок
Ужин: курица + шпинат + томаты + куркума + имбирь
Перед сном: терпкий вишнёвый сок (мелатонин + антиоксиданты)

⚠️ ВАЖНО ДЛЯ СПОРТСМЕНОВ:
• НЕ принимать НПВС (ибупрофен) постоянно — разрушает ЖКТ и замедляет адаптацию
• Омега-3 рыбий жир: 2-3 г EPA+DHA/день — основа стратегии
• Витамин D: 4000 МЕ/день — мощный противовоспалительный эффект
• Сон 8+ часов — главный антивоспалительный «препарат»
`;
}
export function getNutritionForFatLossComplete(message: string): string {
  const keywords = ['питание для похудения полн', 'диета похудение наук', 'как питаться чтобы похудеть', 'рацион жиросжигание', 'nutrition fat loss', 'дефицит калорий как', 'сколько есть чтобы худеть', 'калории для похудения'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 ПИТАНИЕ ДЛЯ ЖИРОСЖИГАНИЯ — ПОЛНЫЙ НАУЧНЫЙ ГАЙД:

📊 ШАГИ НАСТРОЙКИ:

1. РАССЧИТАЙ ПОДДЕРЖИВАЮЩИЕ КАЛОРИИ:
   • Формула Миффлина-Сан Жеора:
   Мужчины: 10×вес(кг) + 6.25×рост(см) - 5×возраст - 5
   Женщины: 10×вес(кг) + 6.25×рост(см) - 5×возраст - 161
   • × коэффициент активности (1.2-1.9)
   • Или: вес × 33-35 ккал (грубая оценка для тренирующихся)

2. СОЗДАЙ ДЕФИЦИТ:
   • Умеренный дефицит: 300-500 ккал/день (0.5-0.7 кг/нед) — РЕКОМЕНДУЕТСЯ
   • Агрессивный: 700-1000 ккал/день (1-1.2 кг/нед) — только для высокого % жира
   • Никогда не ниже: БМ × 1.2 (иначе метаболическая адаптация)
   • Потеря >1% массы тела в неделю = потеря мышц!

3. УСТАНОВИ МАКРОНУТРИЕНТЫ:
   Белок (приоритет #1):
   • 2.0-2.4 г/кг массы тела (при дефиците больше, чем при наборе!)
   • Сохраняет мышцы, высокий TEF (25-30%), насыщение

   Жиры (приоритет #2):
   • 0.8-1.2 г/кг — минимум для гормонов
   • Никогда <0.5 г/кг — тестостерон упадёт

   Углеводы (остаток):
   • Всё, что осталось после белка и жиров
   • Распределить ВОКРУГ тренировки (до и после)

📋 ПРИМЕР ДЛЯ 80 КГ МУЖЧИНЫ:
Поддержание: ~2800 ккал
Дефицит (-500): 2300 ккал
Белок: 2.2 × 80 = 176 г (704 ккал)
Жиры: 1.0 × 80 = 80 г (720 ккал)
Углеводы: (2300 - 704 - 720) / 4 = 219 г (876 ккал)

⚡ СТРАТЕГИИ СЫТОСТИ:
• Объёмная еда: овощи, салаты, супы (много объёма, мало калорий)
• Белок в каждом приёме: 30-40 г
• Клетчатка: 25-35 г/день (замедляет пищеварение)
• Вода: 500 мл за 30 мин до еды — снижает аппетит
• Медленная еда: жуй 20+ раз, сигнал насыщения через 15-20 мин

📉 ЕСЛИ ВЕС ВСТАЛ (ПЛАТО):
1. Пересчитай калории для НОВОГО веса
2. Увеличь NEAT (ходьба 8000-12000 шагов)
3. Рефид 1 день (калории на поддержание, больше углеводов)
4. Diet break: 1-2 недели на поддерживающих калориях
5. Только потом — уменьшать калории дальше

⚠️ ЧЕГО НЕ ДЕЛАТЬ:
• Не убирать целые группы продуктов (углеводы, жиры)
• Не голодать — метаболическая адаптация + потеря мышц
• Не взвешиваться каждый день нервозно — 1 раз в неделю утром натощак
• Не менять калории чаще чем раз в 2-3 недели
• Не делать кардио >5 раз в неделю на дефиците
`;
}
export function getHydrationPerformanceScience(message: string): string {
  const keywords = ['гидратация производительность', 'hydration performance', 'сколько воды для тренировк', 'вода и сила', 'обезвоживание спорт', 'водный баланс спорт', 'питьевой режим тренировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💧 ГИДРАТАЦИЯ И СПОРТИВНАЯ ПРОИЗВОДИТЕЛЬНОСТЬ:

🔬 ВЛИЯНИЕ ДЕГИДРАТАЦИИ:
• -1% массы тела: снижение аэробной выносливости на 5%
• -2%: снижение силы на 10%, когнитивных функций на 15%
• -3%: снижение мощности на 15-20%, риск теплового удара
• -5%: опасно для здоровья, критическое снижение производительности
• БОЛЬШИНСТВО людей приходят на тренировку УЖЕ дегидратированными на 1-2%

📊 СКОЛЬКО ВОДЫ НУЖНО:
Базовая потребность:
• 35-40 мл × вес в кг = мл/день (для 80 кг = 2.8-3.2 л)
• + 500-1000 мл на каждый час тренировки
• + 500 мл на каждые 25 г белка (белок требует воду для метаболизма)

Во время тренировки:
• 150-250 мл каждые 15-20 минут
• При >60 мин: изотоник (натрий + углеводы)
• НЕ пить «залпом» 500 мл — маленькими глотками

🔍 ПРОВЕРКА ГИДРАТАЦИИ:
• Цвет мочи: светло-жёлтый = норма, тёмный = пить больше
• Вес до/после тренировки: потеря = пот (восполнить 150%)
• Утренний вес: стабилен день ото дня = хорошая гидратация
• Чувство жажды: уже -1-2% дегидратации (не ждать жажды!)

💡 СТРАТЕГИЯ ГИДРАТАЦИИ:
Утро: 500 мл воды сразу после пробуждения
Перед тренировкой (2 часа): 500-600 мл
Перед тренировкой (15 мин): 200-300 мл
Во время: 150-250 мл каждые 15-20 мин
После: 150% от потерянного веса в течение 2-4 часов
Вечер: снизить приём за 2 часа до сна (чтобы не вставать ночью)

🍹 ЧТО ПИТЬ:
• Вода — основа (90% всей жидкости)
• Изотоник — при тренировках >60 мин или обильном потоотделении
• Зелёный/травяной чай — считается за воду
• Молоко — отличный регидратор (белок + натрий + калий)
• Кокосовая вода — натуральный изотоник (богата калием)

❌ ЧТО НЕ СЧИТАЕТСЯ:
• Кофе >2 чашек — диуретический эффект (но 1-2 чашки — нормально)
• Алкоголь — мощный диуретик, дегидратирует
• Сладкие газировки — осмотически вытягивают воду из клеток
• Энергетики — кофеин + сахар + таурин = плохая гидратация

⚠️ ГИПЕРГИДРАТАЦИЯ (тоже опасно):
• >10 л/день без электролитов → гипонатриемия
• Симптомы: тошнота, головная боль, спутанность
• Профилактика: пить ПО ЖАЖДЕ + электролиты при обильном потоотделении
`;
}
export function getProteinVeganAthleteGuide(message: string): string {
  const keywords = ['растительный белок', 'веган', 'vegan protein', 'без мяса', 'вегетарианец', 'соевый белок', 'plant protein'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌱 РАСТИТЕЛЬНЫЙ БЕЛОК ДЛЯ СПОРТСМЕНОВ:

📊 Проблема аминокислотного профиля:
• Растительные источники часто имеют лимитирующую аминокислоту
• **Бобовые**: мало метионина → комбинируй с злаками
• **Злаки**: мало лизина → комбинируй с бобовыми
• **Соя**: полный профиль, но фитоэстрогены (безопасно до 50г/день)

🥗 Лучшие источники (на 100г):
1. Соевый изолят — 90г белка (PDCAAS = 1.0)
2. Чечевица (варёная) — 9г белка + железо
3. Нут (варёный) — 8.9г белка + клетчатка
4. Тофу — 8-15г белка (зависит от плотности)
5. Темпе — 19г белка + пробиотики
6. Сейтан — 25г белка (глютен — не всем подходит)
7. Киноа — 4.4г белка (полный профиль)
8. Гречка — 13г белка (высокий лизин для злака)

💪 Стратегия для набора 1.6-2.2г/кг:
- Увеличь общее потребление белка на 10-20% vs мясоеды (ниже усвояемость)
- Комбинируй источники в каждом приёме: рис + фасоль, хлеб + хумус
- Протеиновые коктейли: гороховый + рисовый изолят (идеальная комбинация)
- Добавки: креатин 5г/день (в растительной пище почти нет), витамин B12, омега-3 из водорослей

⚠️ На что обратить внимание:
- Железо из растений (негемовое) — усвоение 5-12% vs 15-35% из мяса → ешь с витамином С
- Цинк — фитаты снижают усвоение → замачивай бобовые, проращивай
- Витамин B12 — ОБЯЗАТЕЛЬНО добавка (нет в растительной пище)
`;
}
export function getProteinBreakfastImportance(message: string): string {
  const keywords = ['завтрак белок', 'protein breakfast', 'завтрак спортсмена', 'что есть утром', 'завтрак для роста', 'утренний белок'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍳 БЕЛКОВЫЙ ЗАВТРАК — ПОЧЕМУ ЭТО КРИТИЧНО:

📊 Наука:
• После 8-10 часов сна организм в катаболическом состоянии
• МПС (мышечный синтез белка) утром на минимуме
• 30-40г белка на завтрак → МПС ↑ на 25-30% vs завтрак без белка
• Эффект насыщения: белковый завтрак снижает калории за день на 200-400 ккал

📋 Сколько белка на завтрак:
- Минимум: 25-30г (для активации МПС)
- Оптимально: 35-50г (для спортсмена 80+ кг)
- Лейцин: минимум 2.5-3г (триггер МПС) — есть в яйцах, молочных, мясе

🍽️ Быстрые высокобелковые завтраки:

**За 5 минут:**
1. 3 яйца + 100г творога + хлеб = 35г белка
2. Протеиновый коктейль + банан + овсянка = 40г белка
3. Греческий йогурт 300г + гранола + ягоды = 30г белка

**За 10 минут:**
4. Омлет из 4 яиц + сыр + овощи = 35г белка
5. Овсянка на молоке + протеин + орехи = 45г белка
6. Тост с авокадо + 2 яйца + ветчина = 30г белка

**Заготовка на неделю:**
7. Творожная запеканка (нарезать на порции) = 35г белка/порция
8. Яичные маффины с овощами (12 шт = 6 дней) = 25г/2шт

⚠️ Чего избегать утром:
- Чистые углеводы (хлопья, сладкая каша, сок) → скачок инсулина → голод через 2ч
- Пропуск завтрака (допустимо при IF, но не для набора массы)

💡 Правило: если видишь завтрак без 25+ г белка — добавь яйца или протеин.
`;
}
export function getAntiInflamDietComplete(message: string): string {
  const keywords = ['противовоспалительная диета полная', 'anti inflammatory diet complete', 'воспаление еда наука', 'антивоспалительное питание спорт'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🔥 ПРОТИВОВОСПАЛИТЕЛЬНАЯ ДИЕТА ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Тренировки вызывают острое воспаление (полезно для адаптации), но хроническое воспаление тормозит восстановление и вредит здоровью.

🔬 Острое vs хроническое воспаление:
- **Острое** (после тренировки): IL-6 ↑ → запуск регенерации → ХОРОШО
- **Хроническое** (постоянное): CRP ↑, TNF-α ↑ → разрушение тканей → ПЛОХО
- Цель: поддерживать острый ответ, подавлять хронический

📊 Маркеры воспаления и питание:
| Маркер | Норма | Повышен при | Снижается от |
|--------|-------|------------|-------------|
| hs-CRP | <1 мг/л | Хрон. воспаление | Омега-3, куркумин |
| IL-6 | Временно ↑ | Перетренированность | Отдых, антиоксиданты |
| TNF-α | Низкий | Ожирение, стресс | Омега-3, полифенолы |

🥦 Топ-10 противовоспалительных продуктов:
1. **Жирная рыба** (лосось, скумбрия) — EPA/DHA
2. **Ягоды** (черника, вишня) — антоцианы
3. **Куркума** + чёрный перец — куркумин (↑ усвоение в 20 раз с пиперином)
4. **Оливковое масло extra virgin** — олеокантал (действует как ибупрофен)
5. **Тёмный шоколад** (70%+) — флаванолы
6. **Имбирь** — гингеролы (↓ DOMS на 25%)
7. **Зелёный чай** — EGCG (мощный антиоксидант)
8. **Орехи** (грецкие) — ALA (омега-3)
9. **Шпинат, брокколи** — сульфорафан, кверцетин
10. **Помидоры** — ликопин (↑ усвоение при нагревании)

🚫 Провоспалительные продукты (ограничь):
- Трансжиры (маргарин, фастфуд)
- Рафинированный сахар (>50 г/день → CRP ↑)
- Переработанное мясо (колбаса, сосиски)
- Рафинированные масла (подсолнечное, кукурузное — много омега-6)
- Алкоголь (>2 порций → воспаление ↑)
- Белая мука (высокий гликемический индекс)

📋 План питания (пример дня):
- **Завтрак:** Овсянка + черника + грецкие орехи + мёд
- **Обед:** Лосось + киноа + брокколи + оливковое масло
- **Перекус:** Тёмный шоколад + миндаль + зелёный чай
- **Ужин:** Индейка + батат + шпинат + куркума + имбирь
- **Перед сном:** Вишнёвый сок (антоцианы + мелатонин)

💊 Добавки при хроническом воспалении:
- Омега-3: 2-3 г EPA+DHA/день
- Куркумин: 500-1000 мг (с пиперином)
- Вишнёвый экстракт: 480 мг
- Бромелайн: 500 мг (фермент из ананаса)
`;
}
export function getTrainingDuringFasting(message: string): string {
  const keywords = ['тренировка пост', 'training fasting', 'интервальное голодание спорт', 'тренировка натощак', 'пост рамадан спорт', 'голодание тренировка'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🍽️ ТРЕНИРОВКИ ВО ВРЕМЯ ПОСТА/ГОЛОДАНИЯ — НАУЧНЫЙ ПОДХОД:

Интервальное голодание (IF) и религиозные посты создают уникальные вызовы для тренировок.

🔬 Физиология натощак:
- Через 12-16 часов голодания: гликоген печени истощается
- ↑ окисление жиров (липолиз) — тело переключается на жир
- ↑ гормон роста (до 5× при 24-часовом голодании!)
- ↑ норадреналин → ↑ концентрация и бодрость
- ↓ инсулин → ↑ чувствительность к инсулину
- НО: ↓ мышечный гликоген → ↓ производительность при высокой интенсивности

📊 Влияние на разные типы тренировок:

| Тип тренировки | Натощак (16+ часов) | Рекомендация |
|---------------|---------------------|-------------|
| Лёгкое кардио | ✅ Оптимально | Сжигание жира ↑ |
| HIIT | ⚠️ Снижение мощности | Лучше после еды |
| Силовая (80%+) | ⚠️ ↓ сила на 5-10% | Снизь вес |
| Силовая (60-75%) | ✅ Приемлемо | Хорошо для гипертрофии |

📋 Стратегии по типу голодания:

**Интервальное голодание 16:8:**
- Окно питания: 12:00-20:00 (пример)
- Тренировка в 11:00: натощак, первый приём пищи — сразу после
- Тренировка в 17:00: после 1-2 приёмов пищи (оптимально)
- BCAA/EAA 5-10 г перед тренировкой натощак (↓ катаболизм)

**Пост (православный, мусульманский):**
- Тренируйся за 1-2 часа до разговения (если возможно)
- Или через 1-2 часа после разговения (пища усвоилась)
- Снизь объём на 30-40%
- Фокус на базовых упражнениях (эффективность за минимум времени)
- Поддерживай гидратацию (критично!)

⏰ Оптимальное время:
1. **Лучше всего:** за 1-2 часа до первого приёма пищи
2. **Хорошо:** через 2-3 часа после последнего приёма
3. **Допустимо:** в середине голодания (но ↓ интенсивность)

🍗 Питание вокруг тренировки при IF:

**Перед тренировкой (если в окне питания):**
- Лёгкий приём: белок + быстрые углеводы за 1-2 часа

**После тренировки (КРИТИЧНО):**
- Белок: 30-40 г в первые 30-60 мин
- Углеводы: 50-80 г (восполнение гликогена)
- Это должен быть самый большой приём пищи за день

💪 Сохранение мышц при голодании:
- Белок: минимум 2 г/кг в окне питания
- Распредели на 3-4 приёма
- Казеин перед началом голодания (медленный белок)
- Креатин: 5 г/день (не зависит от приёмов пищи)
`;
}
export function getMuscleProteinSynthGuide(message: string): string {
  const keywords = ['синтез мышечного белка', 'muscle protein synthesis', 'mps', 'синтез белка', 'анаболизм белка', 'белковый синтез', 'скорость синтеза белка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧬 СИНТЕЗ МЫШЕЧНОГО БЕЛКА (MPS) — ФУНДАМЕНТ РОСТА МЫШЦ:

**Что такое MPS:**
- MPS (Muscle Protein Synthesis) = скорость создания новых мышечных белков
- MPB (Muscle Protein Breakdown) = скорость распада мышечных белков
- Рост мышц = когда MPS > MPB (чистый белковый баланс +)
- Без тренировок: MPS ≈ MPB (мышцы не растут и не теряются)

**Факторы, повышающие MPS:**
1. **Силовые тренировки:**
   - ↑ MPS на 50-150% на 24-48 часов после тренировки
   - У новичков: ↑ на 48-72 часа
   - У опытных: ↑ на 24-36 часов
   - Поэтому опытным нужна бОльшая частота тренировок!

2. **Приём белка:**
   - ↑ MPS на 25-50% после приёма 20-40 г белка
   - Пик MPS: через 1-3 часа после приёма белка
   - Возвращение к базальному уровню: через 3-5 часов
   - «Мышечно-полный эффект» — MPS не растёт бесконечно с дозой белка

3. **Лейцин — главный триггер MPS:**
   - Лейцин активирует mTOR-путь → запускает синтез
   - Порог лейцина: 2.5-3 г за приём (leucine threshold)
   - Источники: 30 г сывороточного белка = ~3 г лейцина
   - Растительные белки: нужно больше для порога лейцина

**Оптимизация MPS через питание:**
- **Доза белка за приём:** 0.4-0.5 г/кг (для 80 кг = 32-40 г)
- **Частота:** 3-5 приёмов/день с интервалом 3-5 часов
- **Суточный белок:** 1.6-2.2 г/кг для максимума MPS
- **Белок перед сном:** 30-40 г казеина → ↑ ночной MPS на 22%
- **Белок на завтрак:** часто недостаточно — добавь до 30+ г!

**MPS после тренировки — временная шкала:**
- 0-1 час: начинается ↑ MPS (даже без еды!)
- 1-3 часа: пик MPS (если поел белок — ещё выше)
- 3-12 часов: MPS остаётся ↑ на 50-100%
- 12-24 часа: MPS ↑ на 25-50%
- 24-48 часов: MPS возвращается к базальному уровню
- Вывод: тренируй каждую мышцу 2 раза/неделю = 2 «волны» MPS

**Факторы, снижающие MPS:**
- Алкоголь: ↓ MPS на 20-30% (даже умеренные дозы)
- Недосып: ↓ MPS на 18% при <6 часов сна
- Хронический стресс / кортизол: ↑ MPB, ↓ MPS
- Возраст >40: «анаболическая резистентность» — нужно больше белка
- Калорийный дефицит: ↓ MPS на 20-30% (↑ белок компенсирует)
`;
}
export function getWaterCuttingGuide(message: string): string {
  const keywords = ['водная загрузка', 'water cutting', 'сгонка воды', 'сушка вода', 'water manipulation', 'водная манипуляция', 'выведение воды', 'слить воду', 'подводка к соревнованиям'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💧 ВОДНАЯ МАНИПУЛЯЦИЯ (WATER CUTTING) — ПОДВОДКА:

⚠️ ВАЖНО: Экстремальная водная манипуляция опасна для здоровья!
Используй только при подготовке к соревнованиям/фотосессии.
При проблемах с почками или сердцем — КАТЕГОРИЧЕСКИ противопоказано.

**Зачем манипулировать водой:**
- Временно ↓ подкожную воду → рельеф, «сухость», прорисовка мышц
- Сгонка веса для попадания в весовую категорию
- Эффект: −1.5-4 кг за 5-7 дней (только вода, не жир!)

**Безопасный протокол водной загрузки (7 дней):**

| День | Вода (л) | Натрий | Углеводы | Калий |
|------|---------|--------|----------|-------|
| Д-7 | 6-8 | Обычно | Обычно | Обычно |
| Д-6 | 6-8 | Обычно | Обычно | Обычно |
| Д-5 | 6-8 | Обычно | ↓ на 30% | Обычно |
| Д-4 | 6-8 | ↓ 50% | ↓ на 50% | ↑ 50% |
| Д-3 | 4 | ↓ 75% | Минимум | ↑ 50% |
| Д-2 | 2 | Минимум | Минимум | Обычно |
| Д-1 | 1-1.5 | Минимум | ↑ загрузка | Обычно |
| Д-день | По жажде | Минимум | По ощущениям | Обычно |

**Как это работает:**
1. Высокое потребление воды (6-8 л) → организм привыкает выводить много
2. Резкое снижение воды → механизм вывода ещё работает → «сливает» подкожную воду
3. ↓ Натрий = ↓ задержка жидкости (Na+ удерживает воду)
4. ↑ Калий = вытесняет натрий из клеток
5. Углеводная загрузка в Д-1 = гликоген тянет воду В мышцы (не под кожу)

**Безопасные методы ↓ подкожной воды (без экстрима):**
- ↓ натрий за 2-3 дня (не солить еду, избегать полуфабрикатов)
- ↑ калий: бананы, авокадо, картофель, шпинат
- Натуральные диуретики: одуванчик, зелёный чай, кофе
- Сауна: 15-20 мин (↓ 0.5-1 кг воды, временно!)
- ↓ углеводы за 2-3 дня → ↓ гликоген → ↓ задержка воды

**Чего НИКОГДА не делать:**
- ❌ Фармацевтические диуретики без врача (фуросемид = опасно!)
- ❌ Полное обезвоживание (>24 часов без воды)
- ❌ Экстремальная сауна (>30 мин непрерывно)
- ❌ Водная манипуляция чаще 1-2 раз в год
- ❌ Водная манипуляция при проблемах с почками/сердцем

**После соревнования/фотосессии:**
- Постепенно возвращай воду (не залпом 3 литра!)
- Нормализуй натрий в течение 1-2 дней
- Вес вернётся к норме за 2-3 дня — это НОРМАЛЬНО
- Электролиты: Регидрон или минеральная вода
`;
}
export function getProteinAbsRateGuide(message: string): string {
  const keywords = ['скорость усвоения белка', 'protein absorption rate', 'сколько белка за раз', 'усвоение протеина', '30 грамм белка', 'белок за приём', 'лимит белка', 'сколько белка усваивается'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥩 СКОРОСТЬ УСВОЕНИЯ БЕЛКА — НАУКА И МИФЫ:

**Миф «30 грамм белка за раз — максимум»:**
- ❌ Организм усваивает практически ВЕСЬ белок (даже 100 г за раз)
- Вопрос не «усвоится ли», а «стимулирует ли MPS оптимально»
- 20-40 г за приём = оптимально для СТИМУЛЯЦИИ синтеза белка
- >40 г за приём = усвоится, но избыток → окисление (энергия), а не MPS

**Скорость усвоения разных белков:**
| Источник | Скорость (г/час) | Полное усвоение |
|----------|-----------------|-----------------|
| Сывороточный изолят | 8-10 г/час | 2-3 часа |
| Сывороточный концентрат | 6-8 г/час | 3-4 часа |
| Яичный белок | 3-4 г/час | 5-7 часов |
| Казеин | 3-4 г/час | 6-8 часов |
| Куриная грудка | 3-5 г/час | 5-7 часов |
| Говядина | 2-4 г/час | 6-8 часов |
| Творог | 3-4 г/час | 5-7 часов |
| Растительный белок | 3-6 г/час | 4-7 часов |

**Оптимальная доза за приём (исследования 2020-2025):**
- **Молодые атлеты (<40 лет):**
  - Минимум для MPS: 20 г (0.25 г/кг)
  - Оптимум: 30-40 г (0.4-0.5 г/кг)
  - Максимум полезного: ~40 г (дальше — diminishing returns)

- **Атлеты 40+ лет (анаболическая резистентность):**
  - Минимум для MPS: 30 г (0.35 г/кг)
  - Оптимум: 40-50 г (0.5-0.6 г/кг)
  - Нужно больше белка для того же эффекта

- **После тренировки всего тела:**
  - До 100 г за приём = эффективно (исследование 2024, Trommelen et al.)
  - Тренировка всего тела → больше мышц нуждаются в аминокислотах
  - → Может утилизировать больше белка

**Факторы, влияющие на усвоение:**
- ↑ Клетчатка в приёме → ↓ скорость усвоения (не плохо!)
- ↑ Жиры в приёме → ↓ скорость (но ↑ длительность)
- Физическая активность → ↑ кровоток в ЖКТ → ↑ усвоение
- Ферменты (бромелайн, папаин) → ↑ расщепление белка

**Практические рекомендации:**
- 3-5 приёмов по 30-50 г белка = оптимальная стратегия
- Не паникуй, если съел больше 40 г за раз — усвоится!
- Казеин / творог на ночь = медленное высвобождение на 6-8 часов
- После тренировки: быстрый белок (сыворотка) + медленный (мясо) = идеально
- Общий суточный белок (1.6-2.2 г/кг) > тайминг и дозировка за приём
`;
}
export function getFattyLiverExercise(message: string): string {
  const keywords = ['жировой гепатоз', 'fatty liver', 'ожирение печени', 'жирная печень', 'стеатоз печени', 'nafld', 'печень и тренировки'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🫁 ТРЕНИРОВКИ ПРИ ЖИРОВОМ ГЕПАТОЗЕ (NAFLD):

⚠️ Проконсультируйся с гастроэнтерологом/гепатологом!

**Что такое NAFLD:**
- Неалкогольная жировая болезнь печени
- Накопление жира >5% от массы печени
- Распространённость в РФ: 25-30% взрослых
- Связана с ожирением, инсулинорезистентностью, метаболическим синдромом

**Почему тренировки = главное лечение:**
- Упражнения ↓ печёночный жир на 20-30% (даже без потери веса!)
- Механизм: ↑ окисление жирных кислот в печени
- ↑ Чувствительность к инсулину → ↓ липогенез в печени
- ↓ Воспаление (IL-6, TNF-α) → ↓ прогрессирование в стеатогепатит

**Оптимальный режим тренировок:**

**Аэробные (кардио) — 150-300 мин/неделю:**
- Быстрая ходьба, бег, велосипед, плавание
- Умеренная интенсивность (60-70% ЧССмакс)
- HIIT: 2-3 раза/неделю (более эффективен для ↓ печёночного жира)
- Ходьба 10000 шагов/день — простейшая мера

**Силовые — 2-3 раза/неделю:**
- Все основные группы мышц
- 2-3 подхода × 8-12 повторений
- ↑ Мышечная масса → ↑ утилизация глюкозы и жиров
- Приоритет: крупные мышечные группы (ноги, спина, грудь)

**Комбинация кардио + силовые = лучший результат:**
- ↓ Печёночный жир на 30-40%
- ↓ Окружность талии (висцеральный жир)
- ↑ Аэробная форма + ↑ мышечная масса

**Питание при NAFLD:**
- Дефицит 500-750 ккал/день (↓ вес на 0.5-1 кг/неделю)
- Потеря 5-10% веса = значительное ↓ стеатоза
- ↓ Фруктоза (сок, сахар, мёд) — фруктоза метаболизируется в печени!
- ↑ Клетчатка (30+ г/день), ↑ овощи
- Омега-3: 2-4 г/день (↓ печёночные триглицериды)
- Кофе: 3-4 чашки/день = ↓ риск фиброза печени (доказано!)

**Чего избегать:**
- ❌ Алкоголь (даже малые дозы при NAFLD)
- ❌ Фруктоза из напитков (соки, газировка, энергетики)
- ❌ Трансжиры (фастфуд, маргарин)
- ❌ Экстремальные диеты (быстрая потеря веса ухудшает NAFLD!)
- ❌ Анаболические стероиды (гепатотоксичны)
`;
}
export function getVeganMealPrepGuide(message: string): string {
  const keywords = ['веган мил преп', 'vegan meal prep', 'растительное питание подготовка', 'веганское питание спорт', 'заготовка еды веган', 'растительный белок готовка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥗 МИЛ-ПРЕП ДЛЯ ВЕГАНОВ-АТЛЕТОВ:

**Ключевые нутриенты для веган-атлета:**
- **Белок:** 1.8-2.4 г/кг (↑ vs всеядных из-за неполных а/к)
- **Лейцин:** комбинируй источники для порога 2.5 г/приём
- **B12:** обязательно добавка (500-1000 мкг/день)
- **Железо:** ↑ в 1.8 раз vs рекомендации для всеядных
- **Цинк:** ↑ в 1.5 раз (фитаты ↓ усвоение)
- **Омега-3 (DHA/EPA):** водоросли, 250-500 мг/день
- **Креатин:** 5 г/день (веганы не получают из пищи!)
- **Витамин D:** 2000-4000 МЕ/день (зимой в РФ — обязательно)

**Лучшие источники растительного белка:**
| Продукт (на 100 г) | Белок | Лейцин |
|---------------------|-------|--------|
| Соевый текстурат | 50-52 г | 3.8 г |
| Чечевица (сухая) | 24-26 г | 1.8 г |
| Нут (сухой) | 20-22 г | 1.4 г |
| Тофу (твёрдый) | 15-17 г | 1.2 г |
| Темпе | 18-20 г | 1.5 г |
| Сейтан (пшеничный) | 25-30 г | 1.1 г |
| Гороховый протеин | 80 г | 6.5 г |
| Арахисовая паста | 25 г | 1.6 г |

**Базовый мил-преп на 5 дней:**

**Завтрак (500-600 ккал, 30-40 г белка):**
- Овсянка 100 г + гороховый протеин 30 г + банан + ореховая паста 20 г
- Или: тофу-скрэмбл (200 г тофу + овощи + куркума) + хлеб

**Обед (600-700 ккал, 40-50 г белка):**
- Рис 150 г (сухой) + чечевица 100 г (сухой) + овощи + соус
- Или: гречка + соевый текстурат 50 г + салат

**Перекус (300-400 ккал, 20-30 г белка):**
- Протеиновый шейк (гороховый + рисовый) + банан
- Или: хумус 100 г + овощи + лаваш

**Ужин (600-700 ккал, 40-50 г белка):**
- Макароны 150 г + темпе 200 г + томатный соус + шпинат
- Или: батат 200 г + нут 150 г (вар.) + брокколи

**Секреты мил-препа:**
- Готовь крупы и бобовые оптом (рис, чечевица, нут)
- Замачивай бобовые на ночь (↓ фитаты → ↑ усвоение минералов)
- Замораживай порциями в контейнерах (держится 3-5 дней в холоде)
- Комбинируй белки: злак + бобовое = полный аминокислотный профиль
- Пророщенные бобовые = ↑ биодоступность (лейцин, железо, цинк)
`;
}
export function getChronicFatigueExercise(message: string): string {
  const triggers = ['хронич усталост', 'chronic fatigue', 'сху', 'мэ/сху', 'постнагрузочн недомоган'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
😔 ТРЕНИРОВКИ ПРИ СИНДРОМЕ ХРОНИЧЕСКОЙ УСТАЛОСТИ (МЭ/СХУ):

**КРИТИЧЕСКИ ВАЖНО:**
- ❌ Грубая ошибка: «просто больше тренируйся» — ОПАСНО при СХУ!
- Постнагрузочное недомогание (PEM) — ↑ симптомов через 12-72ч
- GET (graded exercise therapy) — устаревший подход, может ↑↑ симптомы

**Принцип «энергетического конверта» (pacing):**
- Определить текущую «базовую линию» (что можно без PEM)
- Никогда не превышать 50-70% от максимума
- «Хороший день» ≠ день для большой нагрузки
- Лучше 5 мин × 3 раза/день, чем 15 мин × 1 раз

**Безопасная активность:**

Уровень 1 (тяжёлое СХУ):
- Лёжа: растяжки, дыхательные упражнения
- Пассивные движения
- 1-2 мин × 2-3 раза/день

Уровень 2 (умеренное):
- Ходьба: 3-5 мин × 2-3 раза/день
- Лёгкая растяжка
- Упражнения с собственным весом: 5 мин

Уровень 3 (лёгкое):
- Ходьба: 10-15 мин
- Лёгкие силовые: 1×8-10, минимальный вес
- Йога восстановительная: 15 мин

**Красные флаги (СТОП):**
🚨 Симптомы ↑ через 24-48ч после нагрузки (PEM)
🚨 ↑ Усталость >2 баллов (шкала 0-10) после тренировки
🚨 Невозможность выполнять обычные дела после тренировки
→ ↓ Нагрузку на 30-50% и стабилизировать

**Мониторинг:**
- ЧСС: не превышать анаэробный порог (~60% макс ЧСС)
- Дневник активности: записывать нагрузку + симптомы 24-48ч после
- Если PEM — вернуться на предыдущий уровень на 2 нед
`;
}
export function getWaterPoloTrainingGuide(message: string): string {
  const triggers = ['водное поло', 'water polo', 'ватерпол', 'водный мяч'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🤽 ВОДНОЕ ПОЛО — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Специфика вида:**
- 4 × 8 мин чистого времени (фактически ~60 мин)
- Постоянное плавание + контактная борьба в воде
- Броски мяча из воды (без опоры)
- Эггбитер (ножницы) — основной способ удержания

**Плавательная подготовка:**
- Кроль: основной стиль перемещения
- Голова над водой: кроль с поднятой головой
- Спринты: 25м × 10, отдых 20 сек
- Смена темпа: 50м быстро / 50м медленно × 8
- Эггбитер: удержание 3 × 1 мин (руки над водой)

**Сухопутная силовая:**
- Жим стоя: 4 × 6 (сила броска из воды)
- Подтягивания: 4 × 8 (верхний пояс)
- Жим лёжа: 3 × 8
- Тяга в наклоне: 4 × 8
- Приседания: 3 × 10 (ноги для эггбитера)
- Вращения с медболом: 3 × 12 (бросок)
- Плечевые ротации: 3 × 15 (профилактика)
- Планка: 3 × 60 сек

**Специфические навыки:**
- Бросок с воды: наработка техники
- Борьба за позицию: работа корпуса
- Старт из воды: взрывное ускорение
- Приём/передача мяча: под давлением

**Профилактика травм:**
- Плечо пловца: укрепление ротаторной манжеты
- Колени: нагрузка от эггбитера — растяжка и укрепление
- Разминка плеч: 5-10 мин перед каждой тренировкой
`;
}
export function getGoalNutritionTimingGuide(message: string): string {
  const triggers = ['питание по целям', 'питание для набора', 'питание для похуден', 'питание для рекомпозиц', 'когда есть для набора', 'нутриент тайминг цели'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🍽️ ПИТАНИЕ ПО ЦЕЛЯМ — ТАЙМИНГ И СТРАТЕГИИ:

**НАБОР МАССЫ (профицит +300-500 ккал):**
- Калории: TDEE + 300-500 ккал/день
- Белок: 1.6-2.2 г/кг, равномерно 4-5 приёмов
- Углеводы: 4-7 г/кг (основной источник энергии)
- Жиры: 0.8-1.2 г/кг
- Перед тренировкой (60-90 мин): сложные углеводы + белок
- После тренировки (30-60 мин): быстрые углеводы + сыворотка
- Перед сном: казеин или творог

**ПОХУДЕНИЕ (дефицит 300-500 ккал):**
- Калории: TDEE - 300-500 ккал (не более 1% массы/нед)
- Белок: 2.0-2.6 г/кг (выше при дефиците!)
- Углеводы: вокруг тренировки (до/после)
- Жиры: 0.7-1.0 г/кг (гормональный баланс)
- Перед тренировкой: белок + умеренные углеводы
- После тренировки: белок + минимум углеводов (если цель — жиросжигание)
- Вечер: белок + овощи (минимум углеводов)

**РЕКОМПОЗИЦИЯ (одновременно):**
- Калории: на уровне TDEE или лёгкий дефицит (-100-200)
- Белок: 2.2-2.6 г/кг (максимально высокий)
- Тренировочные дни: +200-300 ккал (за счёт углеводов)
- Дни отдыха: -200-300 ккал (за счёт углеводов и жиров)
- Углеводный цикл: высокие/низкие дни
- Подходит: новичкам, после перерыва, с лишним весом

**ПОДДЕРЖАНИЕ:**
- Калории: TDEE
- Белок: 1.6-2.0 г/кг
- Гибкое питание: 80/20 (80% качественная еда)
- Не считай каждую калорию — ориентируйся на вес и зеркало
`;
}
export function getReverseDietingScience(message: string): string {
  const triggers = ['обратная диета', 'reverse diet', 'выход из дефицита', 'после сушки питание', 'как выйти из диеты', 'обратн диет наука'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ОБРАТНАЯ ДИЕТА (REVERSE DIET) — НАУКА ВЫХОДА ИЗ ДЕФИЦИТА]
Reverse diet = постепенное увеличение калорий после длительного дефицита для минимизации набора жира.

ПРОБЛЕМА РЕЗКОГО ВЫХОДА:
- После длительного дефицита: ↓ метаболизм на 10-15% (адаптивный термогенез)
- ↓ NEAT (non-exercise activity thermogenesis) — спонтанная активность падает
- ↓ лептин (гормон сытости) → ↑↑ аппетит
- ↓ T3 (тироксин) → ↓ скорость метаболизма
- Резкий переход на поддерживающие калории → быстрый набор жира (fat overshoot)

ПРОТОКОЛ ОБРАТНОЙ ДИЕТЫ:
1. Определи текущее реальное потребление (не «план», а факт)
2. ↑ калории на 50-100 ккал/неделю (за счёт углеводов в первую очередь)
3. Белок: сохранить 1.6-2.2 г/кг (не снижать!)
4. Жиры: ↑ до минимум 0.8 г/кг если были ниже
5. Отслеживать: вес (среднее за неделю), обхваты, фото каждые 2 недели
6. Продолжать пока вес не стабилизируется на целевом уровне
7. Длительность: 4-12 недель (зависит от глубины и длительности дефицита)

МАРКЕРЫ УСПЕШНОГО ВЫХОДА:
- Вес стабилен ±0.5кг/неделю
- ↑ энергия и настроение
- ↑ сила в зале (восстановление после дефицита)
- Нормализация сна и либидо
- ↓ навязчивые мысли о еде

АЛЬТЕРНАТИВНЫЙ ПОДХОД — DIET BREAK:
- 1-2 недели на поддерживающих калориях каждые 6-8 недель дефицита
- Matador study (Byrne 2018): прерывистый дефицит → ↑ потеря жира и ↓ потеря метаболизма vs непрерывный
`;
}
export function getCarbCyclingAdvanced(message: string): string {
  const triggers = ['карб сайклинг подробн', 'циклирование углеводов наука', 'углеводн чередован', 'high low carb дни', 'карб цикл протокол'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[КАРБ-САЙКЛИНГ — ПРОДВИНУТОЕ ЦИКЛИРОВАНИЕ УГЛЕВОДОВ]
Карб-сайклинг = систематическое чередование дней с высоким и низким потреблением углеводов.

ФИЗИОЛОГИЯ:
- Гликоген: основное топливо для интенсивных тренировок (300-500г в мышцах, 80-100г в печени)
- High carb дни: ↑ инсулин → ↑ анаболизм, ↑ лептин, ↑ тренировочная производительность
- Low carb дни: ↑ окисление жиров, ↑ инсулиновая чувствительность, ↓ общий калораж
- Чередование предотвращает метаболическую адаптацию к постоянному дефициту

ПРОТОКОЛ (для рекомпозиции/сушки):
High carb дни (тяжёлые тренировки):
- Углеводы: 4-6 г/кг массы тела
- Жиры: 0.5-0.8 г/кг
- Калории: поддержание или лёгкий профицит (+200 ккал)

Moderate carb дни (лёгкие тренировки):
- Углеводы: 2-3 г/кг
- Жиры: 0.8-1.0 г/кг
- Калории: поддержание

Low carb дни (отдых):
- Углеводы: 0.5-1.5 г/кг
- Жиры: 1.0-1.5 г/кг
- Калории: дефицит (−300-500 ккал)

Белок: ПОСТОЯННО 1.8-2.2 г/кг во все дни

РАСПРЕДЕЛЕНИЕ ПО НЕДЕЛЕ (пример):
Пн (ноги) — HIGH | Вт (грудь/плечи) — HIGH | Ср (отдых) — LOW |
Чт (спина) — MODERATE | Пт (руки) — MODERATE | Сб (отдых) — LOW | Вс (отдых) — LOW

КОМУ ПОДХОДИТ:
✅ Продвинутые атлеты на сушке (сохранить силу в тяжёлые дни)
✅ Рекомпозиция тела (профицит в дни тренировок, дефицит в дни отдыха)
❌ Новичкам (слишком сложно отслеживать, нет необходимости)
❌ При расстройствах пищевого поведения (↑ фиксация на еде)
`;
}
export function getIntermittentFastingTraining(message: string): string {
  const triggers = ['интервальн голодан тренировк', 'IF и тренировки', 'голодание и мышцы', 'тренировка натощак', '16/8 и силовые', 'периодическ голодан спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ИНТЕРВАЛЬНОЕ ГОЛОДАНИЕ (IF) И ТРЕНИРОВКИ]
Популярные протоколы: 16/8 (16ч голод, 8ч еда), 18/6, 20/4 (warrior diet), 5:2 (5 дней норма, 2 дня 500 ккал).

ВЛИЯНИЕ НА ТРЕНИРОВКИ:
Плюсы IF:
- ↑ инсулиновая чувствительность → лучшее усвоение нутриентов в окне питания
- ↑ аутофагия (при >16ч голода) → клеточное обновление
- ↑ ГР натощак на 300-500% (Hartman 1992) — но кратковременно, без значимого эффекта на мышцы
- Удобство: меньше приёмов пищи, проще контролировать калории
- ↓ воспалительные маркеры (CRP, IL-6)

Минусы IF для атлетов:
- ↓ тренировочная производительность при тренировках натощак (↓ гликоген)
- ↓ мышечный синтез белка при голодании >5ч после последнего приёма белка
- Сложно набрать 1.6-2.2 г/кг белка в узком окне (2-3 приёма vs 4-5)
- ↓ NEAT при длительном голодании (↓ спонтанная активность)

ОПТИМАЛЬНАЯ СТРАТЕГИЯ (IF + ТРЕНИРОВКИ):
1. Тренируйся в конце периода голодания или в начале окна питания
2. Если тренировка натощак: 10г BCAA/EAA за 15-20 мин до тренировки (опционально)
3. Главный приём пищи: ПОСЛЕ тренировки (40-50г белка + углеводы)
4. Распредели белок равномерно по окну: 3 приёма по 40г каждые 3-4ч
5. Не урезай углеводы в окне — они нужны для восполнения гликогена

ВЕРДИКТ:
- Для жиросжигания: IF не имеет преимущества перед обычным дефицитом (при равных калориях)
- Для гипертрофии: IF субоптимален (меньше окно для белковых приёмов)
- Для здоровья: есть доказательства пользы 16/8 для метаболического здоровья
- Для удобства: если помогает контролировать калории — используй
`;
}
export function getAntiInflammatoryNutritionAdvanced(message: string): string {
  const triggers = ['противовоспалительн питание', 'воспаление и питание', 'антивоспалительн диет', 'продукты от воспалени', 'хроническое воспалени еда'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ПРОТИВОВОСПАЛИТЕЛЬНОЕ ПИТАНИЕ ДЛЯ АТЛЕТОВ]
Воспаление: острое (после тренировки) = ПОЛЕЗНО → адаптация. Хроническое = ВРЕДНО → ↓ восстановление, ↓ иммунитет.

ПРОТИВОВОСПАЛИТЕЛЬНЫЕ ПРОДУКТЫ:
Омега-3 жирные кислоты:
- Жирная рыба (сёмга, скумбрия, сардины): 2-3 порции/неделю
- Дозировка EPA+DHA: 2-3г/день для противовоспалительного эффекта
- Соотношение Омега-6/Омега-3: стремиться к 2-4:1 (среднее в РФ: 15-20:1)

Полифенолы и антиоксиданты:
- Ягоды (черника, клюква, облепиха): 100-200г/день
- Куркума + чёрный перец (пиперин ↑ усвоение куркумина в 2000 раз)
- Имбирь: 2-4г/день ↓ DOMS на 25% (Black 2010)
- Зелёный чай (EGCG): 3-4 чашки/день
- Вишнёвый сок (tart cherry): ↓ воспаление, ↑ восстановление, ↑ качество сна

Другие:
- Оливковое масло extra virgin: олеокантал — натуральный ибупрофен
- Тёмный шоколад (70%+): флаванолы ↓ CRP
- Орехи (грецкие, миндаль): ↓ IL-6, ↓ TNF-α
- Чеснок: аллицин — мощный антиоксидант

ПРОВОСПАЛИТЕЛЬНЫЕ ПРОДУКТЫ (ограничить):
- Транс-жиры (маргарин, промышленная выпечка): ↑↑ воспаление
- Избыток сахара >50г/день: ↑ CRP, ↑ инсулинорезистентность
- Рафинированные углеводы (белый хлеб, выпечка): ↑ гликемический индекс → ↑ воспаление
- Обработанное мясо (колбасы, сосиски): ↑ AGEs (конечные продукты гликирования)
- Избыток алкоголя: >2 порций → ↑ проницаемость кишечника → ↑ системное воспаление

⚠️ ВАЖНО: НЕ подавляй острое воспаление после тренировки (НПВС, лёд, мегадозы антиоксидантов) — это ↓ адаптацию!
`;
}
export function getProteinTimingDistribution(message: string): string {
  const triggers = ['распределение белка', 'белок в течение дня', 'protein timing', 'анаболическое окно', 'сколько белка за раз'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🥩 РАСПРЕДЕЛЕНИЕ БЕЛКА В ТЕЧЕНИЕ ДНЯ — НАУКА:

СУТОЧНАЯ НОРМА (мета-анализ Morton et al., 2018):
- Для гипертрофии: 1.6-2.2 г/кг/день. >2.2 г/кг — нет дополнительной пользы.
- Для сохранения мышц при дефиците: 2.3-3.1 г/кг сухой массы (Helms et al., 2014).
- Для новичков: нижняя граница (1.6 г/кг) достаточна. Для опытных: ближе к 2.2 г/кг.

РАСПРЕДЕЛЕНИЕ ПО ПРИЁМАМ (Schoenfeld & Aragon, 2018):
- Оптимально: 4-5 приёмов по 0.4-0.55 г/кг за каждый.
- Пример для 80 кг: 4 приёма по 32-44 г белка = 128-176 г/день.
- Минимальный порог MPS (мышечный синтез): ~20 г высококачественного белка на приём.
- Максимальный порог за раз: ~40-50 г (при бо́льших дозах → усвоение продолжается, но MPS не увеличивается дополнительно).

«АНАБОЛИЧЕСКОЕ ОКНО» — ПРАВДА И МИФЫ:
- МИФ: нужно выпить протеин за 30 минут после тренировки, иначе «окно закроется».
- РЕАЛЬНОСТЬ: анаболическое окно = ~4-6 часов вокруг тренировки (2-3 ч до + 2-3 ч после). Если ел за 2-3 часа до тренировки — срочности в послетренировочном приёме нет.
- КОГДА ВАЖНО: тренировки натощак или через >4 часов после еды — тогда послетренировочный белок критичен.

КАЧЕСТВО БЕЛКА (DIAAS/PDCAAS):
- Высший: сывороточный протеин (DIAAS ~1.09), яйца, молоко.
- Высокий: курица, рыба, говядина (DIAAS 0.9-1.0).
- Средний: бобовые, соя, гречка (DIAAS 0.6-0.8).
- Низкий: большинство злаков, орехи (DIAAS 0.4-0.6). Комбинирование повышает качество.

ЛЕЙЦИН — КЛЮЧЕВАЯ АМИНОКИСЛОТА:
- Порог активации mTOR: 2-3 г лейцина за приём.
- Сывороточный протеин: ~3 г лейцина на 25 г белка.
- Куриная грудка: ~2.5 г на 30 г белка.
- Растительные источники: нужно больше белка для достижения порога лейцина.

ПЕРЕД СНОМ:
- Казеин (30-40 г) перед сном: усваивается 6-8 часов, поддерживает MPS ночью.
- Творог (200-300 г): натуральный источник казеина. Доступно и дёшево.
`;
}
export function getPostWorkoutNutritionScience(message: string): string {
  const triggers = ['питание после тренировк', 'что есть после тренировк', 'post workout nutrition', 'еда после зала', 'восстановление питание'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🍽️ ПИТАНИЕ ПОСЛЕ ТРЕНИРОВКИ — НАУКА:

ФИЗИОЛОГИЯ ПОСЛЕ ТРЕНИРОВКИ:
- Мышечный синтез белка (MPS): повышен на 24-48 часов после тренировки. Пик — первые 2-4 часа.
- Гликоген: истощён на 20-40% (силовая) или 60-90% (длительное кардио).
- Кортизол: повышен (катаболический гормон). Еда помогает снизить.
- Инсулин: нужен для подавления распада мышечного белка и восполнения гликогена.

БЕЛОК ПОСЛЕ ТРЕНИРОВКИ:
- Доза: 20-40 г высококачественного белка. 40 г — для тренировок всего тела или для атлетов >85 кг.
- Сывороточный протеин: быстрое всасывание (пик через 60-90 мин). Оптимален для послетренировочного окна.
- Обычная еда (курица, рыба, яйца): так же эффективна, если съесть в течение 2-3 часов.
- Казеин: медленнее, но тоже работает. Смесь сывороточного + казеина — пролонгированный MPS.

УГЛЕВОДЫ ПОСЛЕ ТРЕНИРОВКИ:
- Для восполнения гликогена: 0.8-1.2 г/кг/час в первые 4 часа.
- Высокий ГИ лучше для скорости восполнения (рис, картофель, белый хлеб).
- Для следующей тренировки через 24+ часов: тайминг не критичен, суточное количество важнее.
- Для двух тренировок в день: СРОЧНО — максимум углеводов сразу после первой.

СООТНОШЕНИЕ УГЛЕВОДЫ:БЕЛОК:
- Для восстановления: 3:1 — 4:1 (углеводы:белок). Пример: 80 г углеводов + 25 г белка.
- Для гипертрофии при дефиците: 1:1 — 2:1. Меньше углеводов, приоритет на белок.
- Инсулиновый эффект: 20+ г белка уже стимулирует достаточный выброс инсулина для подавления распада. Отдельно углеводы «для инсулина» — не нужны.

ПРИМЕРЫ ПОСЛЕТРЕНИРОВОЧНЫХ ПРИЁМОВ:
Сразу (30-60 мин): протеиновый коктейль + банан (30 г белка, 30 г углеводов).
Через 1-2 часа: рис + лосось + овощи (60 г углеводов, 40 г белка, 15 г жиров).
Бюджетный вариант: творог 5% (300 г) + мёд (2 ложки) + банан = 40 г белка, 60 г углеводов.

ЧЕГО ИЗБЕГАТЬ:
- Алкоголь: снижает MPS на 24-37% (Parr et al., 2014). Даже 1-2 пива.
- Чрезмерный жир: замедляет всасывание белка и углеводов. Не критично, но не идеально.
- Голодание: пропуск послетренировочного приёма при >4 часах без еды — потеря анаболического потенциала.
`;
}
export function getFatLossNutritionStrategy(message: string): string {
  const triggers = ['стратегия похудени', 'питание для жиросжигани', 'fat loss nutrition', 'дефицит калорий план', 'как правильно худеть'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🔥 СТРАТЕГИЯ ПИТАНИЯ ДЛЯ ПОХУДЕНИЯ — НАУКА:

ПРИНЦИП №1: ДЕФИЦИТ КАЛОРИЙ (закон термодинамики):
Без дефицита калорий жиросжигание НЕВОЗМОЖНО. Никакие продукты/добавки не сжигают жир без дефицита.

РАЗМЕР ДЕФИЦИТА:
- Агрессивный: -750-1000 ккал/день (0.75-1 кг/нед). Быстро, но потеря мышц, голод, метаболическая адаптация.
- Умеренный: -500 ккал/день (0.5 кг/нед). Оптимально для большинства. Баланс скорости и сохранения мышц.
- Консервативный: -250 ккал/день (0.25 кг/нед). Медленно, но максимальное сохранение мышц. Для уже худых (<15% жира м, <22% ж).

МАКРОЭЛЕМЕНТЫ НА ДЕФИЦИТЕ:
Белок: 2.3-3.1 г/кг сухой массы. САМЫЙ ВАЖНЫЙ макроэлемент при дефиците. Сохраняет мышцы, насыщает, имеет высокий термический эффект (20-30% калорий уходит на переваривание).
Жиры: 0.7-1.2 г/кг. Не ниже 0.5 г/кг — гормональные нарушения (тестостерон, менструальный цикл).
Углеводы: остаток калорий. Минимум ~100-130 г/день для работы мозга и тренировочной интенсивности.

СТРАТЕГИИ ПРОТИВ АДАПТАЦИИ:
1. Рефид (refeed day): 1-2 дня/неделю на поддерживающих калориях, дополнительные калории = углеводы. Повышение лептина, снижение кортизола.
2. Диетные перерывы (diet break): 1-2 недели на поддерживающих каждые 6-8 недель дефицита. Восстановление метаболизма, психики.
3. Циклический дефицит: 5 дней дефицит, 2 дня поддерживающие (или 11/3). MATADOR study: циклический подход сохраняет больше мышц.

НАСЫЩЕНИЕ — СТРАТЕГИИ:
- Объём пищи: овощи, салаты, супы — много еды при малых калориях.
- Белок в каждом приёме: 25-40 г → сытость.
- Клетчатка: 25-35 г/день. Замедляет пищеварение.
- Вода перед едой: 500 мл за 30 мин → снижение потребления на 13%.
- Медленный приём пищи: 20+ минут. Сигнал сытости от ЖКТ до мозга идёт 15-20 мин.

КОГДА ОСТАНОВИТЬ ДЕФИЦИТ:
- Достигнут целевой % жира (мужчины 10-15%, женщины 18-25%).
- Постоянная усталость, нарушение сна, потеря либидо — признаки чрезмерного дефицита.
- Плато >3 недель при подтверждённом дефиците → диетный перерыв.
- Потеря силы >10% от рабочих весов → увеличить калории или паузу.
`;
}
export function getMuscleGainNutritionPlan(message: string): string {
  const triggers = ['питание для набора масс', 'профицит калорий', 'muscle gain nutrition', 'как набрать мышечную масс', 'lean bulk'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
💪 ПИТАНИЕ ДЛЯ НАБОРА МЫШЕЧНОЙ МАССЫ:

ПРИНЦИП: небольшой профицит калорий + достаточно белка + прогрессивная нагрузка.

РАЗМЕР ПРОФИЦИТА:
- Lean bulk (минимум жира): +200-300 ккал/день. Набор 0.25-0.5 кг/месяц. Для опытных атлетов.
- Умеренный bulk: +300-500 ккал/день. Набор 0.5-1 кг/месяц. Оптимально для большинства.
- Грязный bulk (dirty bulk): +1000+ ккал/день. Быстрый набор, НО 50-70% = жир. Не рекомендуется кроме хардгейнеров.

РЕАЛИСТИЧНЫЕ ОЖИДАНИЯ (набор МЫШЦ без фармы):
- Первый год: 8-12 кг мышц (0.7-1 кг/мес).
- Второй год: 4-6 кг (0.3-0.5 кг/мес).
- Третий год: 2-3 кг (0.15-0.25 кг/мес).
- 4+ год: 1-2 кг/год.
- Женщины: примерно 50-60% от мужских показателей.

МАКРОЭЛЕМЕНТЫ НА ПРОФИЦИТЕ:
Белок: 1.6-2.2 г/кг. На профиците потребность ниже чем на дефиците (анаболическая среда).
Жиры: 0.8-1.2 г/кг. Достаточно для гормонов и здоровья.
Углеводы: 3-6 г/кг (остаток калорий). Чем больше тренировочный объём, тем больше углеводов.

ТАЙМИНГ ПРИЁМОВ ПРИ НАБОРЕ:
- 4-6 приёмов пищи в день. Равномерное распределение белка (30-50 г на приём).
- Перед тренировкой (2-3 часа): полноценный приём с углеводами и белком.
- После тренировки (1-2 часа): приём с акцентом на белок и углеводы.
- Перед сном: казеин (творог 200-300 г) или казеиновый протеин.

МОНИТОРИНГ:
- Взвешивание: ежедневно утром натощак → среднее за неделю.
- Набор >0.5 кг/неделю (для среднего атлета): слишком много → уменьшить профицит.
- Набор <0.1 кг/неделю: мало → увеличить на 200 ккал.
- Обхваты: талия, руки, грудь. Если талия растёт быстрее рук → слишком жирно.
- Зеркало + фото каждые 2 недели > весы.

ПРИМЕР ДНЕВНОГО РАЦИОНА (80 кг, набор):
Калории: ~3000 ккал. Белок: 160 г. Углеводы: 380 г. Жиры: 80 г.
Завтрак: овсянка 100 г + молоко + 3 яйца + банан.
Перекус: творог 200 г + орехи 30 г.
Обед: рис 150 г + куриная грудка 200 г + овощи + масло.
Перед тренировкой: бутерброд с тунцом + фрукт.
После тренировки: протеиновый коктейль + банан.
Ужин: паста 120 г + лосось 150 г + салат.
Перед сном: творог 200 г + мёд.
`;
}
export function getVegetarianAthleteNutritionAdv(message: string): string {
  const triggers = ['вегетарианское питание спорт', 'веган тренировк', 'растительный белок спорт', 'vegetarian athlete', 'без мяса тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🌱 ВЕГЕТАРИАНСКОЕ/ВЕГАНСКОЕ ПИТАНИЕ ДЛЯ СПОРТСМЕНОВ:

МОЖЕТ ЛИ ВЕГАН НАБРАТЬ МЫШЦЫ?
ДА. При правильном планировании результаты сопоставимы. Исследование Hevia-Larraín et al. (2021): одинаковый набор мышц и силы у веганов и мясоедов при одинаковом белке и тренировках.

ПРОБЛЕМА РАСТИТЕЛЬНОГО БЕЛКА:
1. Меньше лейцина: соя — 7.5% vs сыворотка — 12%. Нужно больше белка за приём (35-50 г vs 25-30 г).
2. Ниже усвояемость (DIAAS): соя 0.90, горох 0.82, рис 0.59, пшеница 0.45.
3. Решение: КОМБИНИРОВАНИЕ источников. Рис + горох = профиль аминокислот близок к животному белку.

ЛУЧШИЕ РАСТИТЕЛЬНЫЕ ИСТОЧНИКИ БЕЛКА:
- Тофу: 15 г/100 г. Полный аминокислотный профиль.
- Темпе: 19 г/100 г. Ферментированная соя — лучше усвояемость.
- Чечевица: 9 г/100 г (варёная). Высокое содержание железа.
- Нут: 8.9 г/100 г (варёный). Хороший профиль аминокислот.
- Сейтан: 25 г/100 г. Высокий белок, НО не полный профиль (мало лизина).
- Эдамаме: 11 г/100 г. Полный профиль.
- Протеин горох+рис (смесь): 80 г/100 г. Близок к сывороточному по эффективности.

КРИТИЧЕСКИЕ НУТРИЕНТЫ (риск дефицита):
1. Витамин B12: ОБЯЗАТЕЛЬНА добавка (1000 мкг/нед или 50 мкг/день). Без B12 — анемия, неврологические нарушения.
2. Железо: растительное (non-heme) усваивается в 2-3 раза хуже. Потребность: мужчины 14 мг/день, женщины 33 мг/день. Витамин C при приёме увеличивает усвоение.
3. Цинк: 50% усвояемости от животного. Тыквенные семечки, кешью, чечевица. Возможна добавка 15-25 мг.
4. Омега-3 (EPA/DHA): рыба — лучший источник. Для веганов: добавка из водорослей (250-500 мг DHA).
5. Креатин: в растительной пище почти нет. Добавка 3-5 г/день — доказанная эффективность, особенно для веганов (у них базовый уровень ниже).
6. Витамин D: не зависит от диеты, но часто дефицит. 1000-2000 МЕ/день.
7. Кальций: без молочных — обогащённые продукты, тофу на кальциевом коагулянте, кунжут.

ПРАКТИЧЕСКИЕ СОВЕТЫ:
- Суточный белок: 1.8-2.4 г/кг (выше чем для мясоедов из-за усвояемости).
- Считать белок ТОЛЬКО из значимых источников (>5 г на порцию).
- Замачивание бобовых: снижает фитаты, улучшает усвоение минералов.
`;
}
export function getAlcoholFitnessImpactDeep(message: string): string {
  const triggers = ['алкоголь тренировк', 'пиво после тренировк', 'alcohol fitness', 'выпивка мышцы', 'спиртное и спорт'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🍺 ВЛИЯНИЕ АЛКОГОЛЯ НА ТРЕНИРОВКИ И ВОССТАНОВЛЕНИЕ:

АЛКОГОЛЬ И МЫШЕЧНЫЙ СИНТЕЗ (MPS):
- Parr et al. (2014): алкоголь (1.5 г/кг, ~8 стандартных порций) после тренировки снижает MPS на 24% (с белком) и 37% (без белка).
- Умеренная доза (0.5 г/кг, ~2-3 порции): минимальное влияние на MPS при адекватном белке.
- Механизм: алкоголь ингибирует mTOR (тот же путь, через который лейцин стимулирует MPS).

АЛКОГОЛЬ И ГОРМОНЫ:
- Тестостерон: при чрезмерном употреблении (>1 г/кг) — снижение на 20-25% на 12-24 часа.
- Умеренно (1-2 порции): незначительное влияние или даже кратковременное повышение.
- Кортизол: повышается, особенно при запое. Катаболический эффект.
- Гормон роста: алкоголь перед сном снижает ночной пик на 75%.

АЛКОГОЛЬ И ВОССТАНОВЛЕНИЕ:
- Сон: алкоголь ухудшает качество REM-сна на 20-40%. Засыпание быстрее, но сон поверхностный.
- Гидратация: алкоголь — диуретик. 1 л пива → потеря ~1.2 л жидкости. Дегидратация замедляет восстановление.
- Гликоген: алкоголь замедляет ресинтез гликогена, если заменяет углеводы.
- Воспаление: острое употребление усиливает воспаление. Хроническое → системное воспаление.

АЛКОГОЛЬ И СОСТАВ ТЕЛА:
- Калорийность: 7 ккал/г (почти как жир — 9 ккал/г). + калории от закусок.
- Пиво (500 мл): ~200 ккал. Вино (150 мл): ~120 ккал. Водка (50 мл): ~110 ккал.
- Алкоголь НЕ запасается как жир напрямую, НО приоритетно окисляется печенью → окисление жиров ОСТАНАВЛИВАЕТСЯ до полной переработки алкоголя.
- «Пивной живот»: не от пива специфически, а от общего профицита калорий.

ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ:
1. Лучше: не пить в день тренировки и следующий день.
2. Допустимо: 1-2 порции за вечер, не чаще 2 раз/неделю. Влияние минимально при адекватном белке.
3. Если выпил: приоритет на белок + углеводы + воду. Не пропускай приём пищи.
4. Худший сценарий: запой + пропуск еды + тренировка на следующий день = травма и потеря прогресса.
5. Безалкогольное пиво: 0-0.5% алк, 30-60 ккал, изотоническое — неплохой вариант для социальных ситуаций.
`;
}
export function getFoodAllergyTraining(message: string): string {
  const triggers = ['аллергия еда тренировк', 'непереносимость лактоз', 'целиакия тренировк', 'food allergy training', 'глютен спорт'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⚠️ ПИЩЕВЫЕ АЛЛЕРГИИ И НЕПЕРЕНОСИМОСТИ ДЛЯ СПОРТСМЕНОВ:

ЛАКТОЗНАЯ НЕПЕРЕНОСИМОСТЬ (65-70% взрослых в мире):
- Что: дефицит лактазы → молочный сахар не расщепляется → газы, вздутие, диарея.
- Степени: полная (никакой молочки) vs частичная (переносит сыр, кефир, йогурт — там лактоза частично расщеплена).
- Решения для спортсменов:
  * Сывороточный изолят: <1% лактозы (vs концентрат ~4-8%). Большинство переносит.
  * Безлактозное молоко/творог: широко доступно в России.
  * Ферменты (лактаза): принять перед молочным продуктом.
  * Альтернативы кальция: обогащённое растительное молоко, тофу, рыба с костями.

ЦЕЛИАКИЯ И ЧУВСТВИТЕЛЬНОСТЬ К ГЛЮТЕНУ:
- Целиакия (1% населения): аутоиммунное → полное исключение глютена (пшеница, рожь, ячмень).
- NCGS (чувствительность без целиакии): 6-13% — дискомфорт без иммунного поражения.
- Влияние на тренировки: нарушение всасывания → дефицит железа, кальция, B12, витамина D → усталость, анемия, остеопороз.
- Безглютеновые источники углеводов: рис, гречка, картофель, кукуруза, киноа, овёс (чистый, без контаминации).
- Безглютеновые протеины: сывороточный (проверить сертификацию), горох, рис.

АЛЛЕРГИЯ НА ЯЙЦА:
- Частая (2-3% детей, многие перерастают). Яйца — одна из основных аминокислотных баз.
- Замена: курица, рыба, молочные (если переносит), бобовые. Яичный белок в протеинах → читать этикетку.

АЛЛЕРГИЯ НА МОРЕПРОДУКТЫ / РЫБУ:
- Omега-3: альтернативы — льняное масло (ALA → конвертация в EPA/DHA 5-10%), добавка из водорослей (DHA).
- Белок: другие животные источники.

АЛЛЕРГИЯ НА ОРЕХИ / АРАХИС:
- Калории и жиры: замена — семена (подсолнечник, тыквенные, кунжут), авокадо, оливковое масло.
- Внимание: многие протеиновые батончики содержат орехи/арахис.

ОБЩИЕ РЕКОМЕНДАЦИИ:
1. Аллергия ≠ непереносимость. Аллергия — иммунная (опасно, анафилаксия). Непереносимость — ферментная (неприятно, но не опасно).
2. При исключении группы продуктов: анализ крови каждые 6 мес на дефициты (железо, B12, D, кальций).
3. Спортпит: ВСЕГДА читать полный состав. «Может содержать следы...» — критично при истинной аллергии.
4. Тренировка после приёма аллергена (непереносимость): подождать пока ЖКТ успокоится. Тренировка с вздутием = дискомфорт и снижение производительности.
`;
}
export function getMealPrepAthleteGuide(message: string): string {
  const triggers = ['мил-преп', 'meal prep', 'готовка на неделю', 'заготовка еды спорт', 'подготовка еды тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🍱 МИЛ-ПРЕП ДЛЯ СПОРТСМЕНОВ — ПРАКТИЧЕСКИЙ ГАЙД:

ЗАЧЕМ MEAL PREP:
- Контроль КБЖУ: знаешь точно что ешь. Убирает «на глаз» и «заказал пиццу потому что лень».
- Экономия времени: 3-4 часа в воскресенье = еда на 5-7 дней.
- Экономия денег: покупка оптом + готовка дома vs кафе/доставка — в 2-3 раза дешевле.
- Дисциплина: еда готова → нет соблазна нарушить план.

БАЗОВЫЕ ПРИНЦИПЫ:
1. Выбери 2-3 источника белка: курица, индейка, рыба, яйца, творог, бобовые.
2. Выбери 2-3 источника углеводов: рис, гречка, макароны, картофель, овсянка.
3. Выбери 2-3 вида овощей: брокколи, стручковая фасоль, морковь, перец, шпинат.
4. Жиры: оливковое масло для готовки, авокадо, орехи — добавляй при подаче.

АЛГОРИТМ ПОДГОТОВКИ (3-4 часа):
1 час: подготовка — помыть, нарезать овощи. Замариновать мясо. Сварить крупы.
1.5 часа: основная готовка — мясо в духовке (2-3 вида одновременно), крупы на плите, овощи на пару/сковороде.
0.5 часа: сборка — разложить по контейнерам. Взвесить порции.
30 мин: уборка.

ХРАНЕНИЕ:
- Холодильник: 3-4 дня для готового мяса/рыбы, 5 дней для круп.
- Морозильник: до 3 месяцев. Лучше заморозить то, что будешь есть на 4-7 день.
- Контейнеры: стеклянные (не впитывают запах, можно в микроволновку) или пластик без BPA.
- Соусы отдельно: чтобы еда не размокла.

ПРИМЕР НЕДЕЛЬНОГО ПРЕПА (набор массы, 80 кг):
Белок: 2 кг куриных грудок + 1 кг лосося + 20 яиц + 1 кг творога.
Углеводы: 1 кг риса + 1 кг гречки + 2 кг картофеля + 500 г овсянки.
Овощи: 1 кг брокколи + 1 кг стручковой фасоли + 500 г шпината.
Жиры: 200 мл оливкового масла + 200 г орехов.
Фрукты: бананы (7-10 шт) + яблоки + ягоды (для овсянки).

ПРИМЕР НЕДЕЛЬНОГО ПРЕПА (сушка, 80 кг):
Белок: 2.5 кг куриных грудок + 500 г рыбы + 15 яиц + 1.5 кг обезжиренного творога.
Углеводы: 500 г риса + 500 г гречки + 500 г овсянки. Количество уменьшено.
Овощи: удвоить! 2 кг брокколи + 1 кг огурцов + 1 кг помидоров + зелень.
Жиры: 100 мл оливкового масла + 100 г орехов.

БЮДЖЕТНЫЙ МИЛ-ПРЕП В РОССИИ (на неделю):
- Курица (бедро/грудка): 300-500 ₽/кг × 2 кг = 600-1000 ₽.
- Рис + гречка: 60-100 ₽/кг × 2 кг = 120-200 ₽.
- Яйца (30 шт): 250-400 ₽.
- Творог: 80-150 ₽/пачка × 5 = 400-750 ₽.
- Овощи (заморозка): 100-200 ₽/кг × 3 кг = 300-600 ₽.
- Итого: ~1700-3000 ₽/неделю. При 3000+ ккал/день.
`;
}
export function getSportNutritionRussia(message: string): string {
  const triggers = ['спортпит россия', 'российское спортивное питание', 'спортпит отечественный', 'русское спортпит', 'россия питание атлет', 'отечественный протеин'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🇷🇺 СПОРТИВНОЕ ПИТАНИЕ В России:

**Рынок и доступность:**
- Крупнейшие российские бренды: Ironman, Академия-Т, Siberian Health, Syntech Nutrition
- Импортные бренды: Optimum Nutrition, BSN, MyProtein — доступны через маркетплейсы
- Санкционные бренды (частично недоступны): некоторые американские марки
- Покупка: Wildberries, Ozon, iHerb (через Беларусь), спортивные магазины

**Популярные категории по цене/качеству:**

Протеин (стоимость на кг):
- Бюджет (800-1200₽/кг): Minotaur, Академия-Т
- Средний (1500-2500₽/кг): Syntech, Geneticlab
- Премиум (3000+₽/кг): Optimum Nutrition Gold Standard

Креатин моногидрат:
- Отечественный: Creatine от Академия-Т, GoldTouch Nutrition
- Оптом из Китая (лабораторное качество Creapure) — через проверенных поставщиков
- Цена: 300-800₽ за 300г

**Законодательство:**
- В РФ спортивное питание — пищевой продукт, не лекарство
- Запрещённые вещества (ВАДА): мельдоний, стимуляторы, прогормоны — в продаже не должны быть, но встречаются в «бустерах»
- Проверяй состав перед соревнованиями — «жиросжигатели» часто содержат эфедрин

**Рекомендации по покупке:**
- iHerb: хороший выбор для базовых добавок (витамины D3, K2, рыбий жир, магний)
- Wildberries/Ozon: протеин, креатин, BCAA — смотри на рейтинг и состав
- Спортмастер/Декатлон: гейнеры, протеиновые батончики — для начального уровня
- Избегай: добавки без состава, «секретные формулы», слишком дешёвый протеин (могут быть добавки аминокислот для фальсификации теста)
`;
}
export function getSportsNutritionTimingAdv(message: string): string {
  const triggers = ['тайминг питания продвинутый', 'периодизация питания', 'нутриентный тайминг', 'питание вокруг тренировки точно', 'анаболическое окно точно', 'пред тренировочное питание точно'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⏱️ НУТРИЕНТНЫЙ ТАЙМИНГ — ПРОДВИНУТЫЙ УРОВЕНЬ:

**Миф vs Реальность анаболического окна:**
- Старая версия (2000-е): «30 минут после тренировки — закрыть окно»
- Актуальная наука (2020+): «окно» открыто 4-6 часов при нормальном питании до тренировки
- НО: если тренируешься натощак или >4ч после еды → немедленный белок важен

**Оптимальная стратегия по целям:**

Набор мышечной массы:
- За 1.5-2ч до тренировки: 30-50г белка + 50-80г углеводов + минимум жира
- За 30-45 мин: 5г креатина + 100-200мг кофеина (если нужен)
- Сразу после: не критично если ел за 2ч — но 30-50г быстрого белка не навредит
- Через 1.5-2ч после: полноценный приём пищи (белок + углеводы)

Сжигание жира (дефицит):
- Тренируйся на минимуме углеводов (жиросжигание выше)
- НО: силовые результаты упадут → приоритизируй белок (40г до тренировки)
- После тренировки: белок обязателен, углеводы — по остатку КБЖУ дня

Сила/пауэрлифтинг:
- Углеводы критичны за 1.5-2ч (гликоген = топливо для силовых)
- За 45 мин: небольшой источник быстрых углеводов (банан, рис)
- После: полноценный приём с акцентом на углеводы для восстановления гликогена

**Специфика временных окон:**

Протеиновый синтез:
- Стимулируется каждым приёмом белка 20-40г
- Рефрактерный период: ~3-4 часа после стимуляции (нет смысла есть белок чаще)
- Оптимально: 4-5 приёмов белка в день равномерно (25-45г каждый)

Углеводная загрузка перед соревнованиями:
- За 3 дня: 8-10г углеводов/кг (суперкомпенсация гликогена)
- За день: снизить до 6-8г/кг + уменьшить клетчатку
- Утро соревнований: 1-2г/кг лёгких углеводов за 2-3ч

**Продвинутые техники:**

Белковый «пульс» (для синтеза):
- Утром натощак (если ночь без белка): 30-40г быстрого белка → рестарт синтеза
- Перед сном: 30-40г казеина → поддержание синтеза 7-8ч (исследования Res 2012)

Углеводный цикл:
- Высокоуглеводные дни: дни тренировки (5-7г/кг)
- Низкоуглеводные дни: дни отдыха (1-2г/кг)
- Умеренные: лёгкие тренировки (3-4г/кг)
`;
}
export function getProteinSynthesisScience(message: string): string {
  const triggers = ['синтез белка наука', 'протеиновый синтез мышц', 'mtor активация', 'лейцин порог', 'синтез мышечного белка', 'MPS механизм'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔬 СИНТЕЗ МЫШЕЧНОГО БЕЛКА (MPS) — НАУКА:

**Молекулярные механизмы:**

mTORC1 — главный регулятор синтеза белка:
- Активируется: аминокислотами (особенно лейцином), инсулином, механической нагрузкой
- Ингибируется: дефицитом энергии (AMPK), рапамицином
- Путь: Akt → TSC1/2 → Rheb → mTORC1 → S6K1 + 4EBP1 → трансляция белка

Лейциновый порог:
- Лейцин — ключевой активатор mTOR
- Минимальный порог: ~0.7-1.0г лейцина на приём пищи
- Содержание в продуктах: 100г куриной грудки = ~1.8г лейцина
- Сывороточный протеин: ~10% лейцина → 25г WP = 2.5г лейцина

**Фазы синтеза белка:**

Острая фаза MPS (после тренировки):
- Пик: 2-4 часа после тренировки
- Повышенный MPS: 24-48 часов
- Тренированные: более короткий ответ (EIMD)

Базальный MPS:
- Поддерживается регулярными приёмами белка
- Рефрактерный период: ~3-4 часа (нет смысла есть белок чаще)
- Оптимум: 4-5 приёмов по 25-40г белка

**Баланс MPS vs MPB (распад белка):**
- Гипертрофия = MPS > MPB (устойчивый профицит)
- После тренировки ОБА возрастают, но MPS больше при адекватном белке
- Инсулин подавляет MPB (роль углеводов: не стимулировать синтез, а тормозить распад)

**Практические выводы:**

Суточное потребление белка:
- Минимум для сохранения мышц: 1.2-1.6г/кг
- Оптимум для роста: 1.6-2.2г/кг
- Предел эффективности: ~2.2г/кг (выше — лишний белок окисляется)

Распределение по приёмам:
- 4-5 приёмов по 30-40г белка = оптимально
- «Доза-ответ» плато: ~40г за один приём (для молодых)
- После 65 лет: нужно больше (~40г на приём) — «анаболическая резистентность»

Скорость переваривания:
- Сыворотка: 8-10г/ч (быстрый, пик лейцина 60-90 мин)
- Казеин: 6г/ч (медленный, плато 5-7ч)
- Перед сном: казеин предпочтительнее для ночного MPS
`;
}
export function getCarbohydrateMetabolism(message: string): string {
  const triggers = ['метаболизм углеводов', 'гликоген синтез', 'инсулин углеводы', 'гликемический индекс наука', 'углеводы энергия механизм', 'глюкоза мышцы механизм'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚡ МЕТАБОЛИЗМ УГЛЕВОДОВ В СПОРТЕ:

**Пути метаболизма глюкозы:**

Гликолиз (анаэробный):
- Глюкоза → 2 пируват + 2 ATP
- Быстрый, но малоэффективный
- При высокой интенсивности (>80% VO2max)
- Пируват → лактат (миф: лактат НЕ вызывает усталость)

Цикл Кребса + ЭТЦ (аэробный):
- Пируват → Ацетил-CoA → цикл Кребса → 30-32 ATP
- Медленнее, но высокая эффективность
- Доминирует при умеренной интенсивности

**Гликоген — хранилище углеводов:**
Запасы гликогена:
- Мышцы: ~400-500г (15-16 ккал/г = 1700 ккал)
- Печень: ~80-100г (резерв для глюкозы крови)
- Мозг: почти нет (зависит от глюкозы крови постоянно)

Скорость опустошения:
- Интенсивные силовые: ~30-40% за 1 тренировку
- Длительный бег 2+ч: до полного истощения

Ресинтез гликогена:
- Скорость: 5-7% в час без углеводов, до 7-10% с углеводами
- Максимум: первые 4-6 часов после тренировки (GLUT4 транслокация)
- Полное восстановление: 24-48ч при достаточных углеводах

**Инсулин и углеводы:**
Роль инсулина в спорте:
1. Транспорт глюкозы в клетки (GLUT4)
2. Подавление распада мышечного белка (анти-катаболизм)
3. Синтез гликогена (активация гликогенсинтазы)
4. Подавление липолиза (жиросжигания)

Инсулинорезистентность от тренировок:
- Тренировки УЛУЧШАЮТ чувствительность к инсулину
- Механизм: AMPK → GLUT4 транслокация (без инсулина)
- После тренировки мышцы «поглощают» глюкозу независимо от инсулина

**Гликемический индекс на практике:**

Высокий ГИ (>70):
- Быстрый подъём и спад глюкозы
- Использование: сразу после тренировки (быстрый ресинтез гликогена)
- Источники: рис, картофель, белый хлеб, спортивные напитки

Низкий ГИ (<55):
- Постепенный подъём, длительное насыщение
- Использование: за 2-3ч до тренировки, основной рацион
- Источники: овсянка, гречка, бобовые, большинство овощей

Вывод: ГИ важен ТОЛЬКО в контексте тайминга; для общего здоровья приоритет — качество продукта
`;
}
export function getFatMetabolismSport(message: string): string {
  const triggers = ['жировой обмен', 'метаболизм жиров', 'липолиз механизм', 'бета окисление', 'жиросжигание механизм', 'кетоз спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔥 МЕТАБОЛИЗМ ЖИРОВ В СПОРТЕ:

**Жировая ткань как энергетическое депо:**
- Среднестатистический мужчина 80кг, 15% жира = 12кг жира = 108,000 ккал!
- Теоретически хватит на 1000км бега
- Проблема: скорость мобилизации ограничена

Виды жировых депо:
- Подкожный жир (80-90%): основной резерв
- Висцеральный жир: опасный (окружает органы), связан с метаболическим синдромом
- Внутримышечный триглицерид (IMTG): быстрая энергия для мышц

**Липолиз — как «сжигается» жир:**
1. Катехоламины (адреналин, норадреналин) → β-адренорецепторы
2. Активация гормон-чувствительной липазы (HSL)
3. Триглицерид → глицерин + 3 свободные жирные кислоты (FFA)
4. FFA в кровоток → мышцы → β-окисление

β-Окисление:
- FFA → Ацетил-CoA → цикл Кребса → ATP
- Например, пальмитиновая кислота (C16) → 106 ATP
- Эффективнее углеводов по ATP/молекула, но медленнее

Гормоны, влияющие на липолиз:
- Усиливают: адреналин, гормон роста, кортизол, тестостерон, тиреоидные гормоны
- Подавляют: инсулин (сильнейший ингибитор)

**Кетоз и кетогенная диета в спорте:**

Что такое кетоз:
- При дефиците углеводов (<50г/сут) → ацетил-CoA → кетоновые тела
- Кетоновые тела (β-HBA, ацетоацетат) как альтернативное топливо
- Мозг, сердце, мышцы могут использовать кетоны

Кетогенная диета и силовой спорт:
- Адаптация: 4-8 недель для оптимизации жирового метаболизма
- Сила: снижение на ~5-10% в первые 4 недели → возврат к базовой
- Гипертрофия: исследования неоднозначны; некоторые потери vs обычная диета
- Преимущества: контроль аппетита, стабильная энергия, уменьшение воспаления
- Недостатки: ограничение взрывной мощности (гликолиз ограничен), запах изо рта

Рекомендация для пауэрлифтеров/бодибилдеров:
- Стандартная диета с умеренными углеводами > кето для большинства
- Кето рассмотреть: при значительном избыточном весе, диабете 2 типа, личном комфорте

**Зоны интенсивности и топливо:**
< 60% VO2max: преимущественно жиры (>60% энергии)
60-70% VO2max: смешанное (жиры + углеводы)
> 80% VO2max: преимущественно углеводы (гликолиз)
100%: почти исключительно гликолиз
`;
}
export function getAntiInflammationDiet(message: string): string {
  const triggers = ['противовоспалительная диета', 'воспаление питание', 'антиоксиданты питание', 'воспаление от тренировок', 'хроническое воспаление питание', 'омега 3 воспаление'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🌿 ПРОТИВОВОСПАЛИТЕЛЬНАЯ ДИЕТА ДЛЯ АТЛЕТОВ:

**Воспаление: острое vs хроническое:**
Острое воспаление (нужно!):
- Ответ на тренировку: сигнал для адаптации
- Часть процесса восстановления и гипертрофии
- НЕ нужно подавлять в первые 24-48ч после тренировки

Хроническое системное воспаление (вредно):
- Нарушает восстановление, снижает чувствительность к инсулину
- Связано с: ожирением, стрессом, плохим сном, провоспалительной диетой
- Биомаркеры: hs-CRP, IL-6, TNF-α

**Противовоспалительные продукты:**

Омега-3 жирные кислоты:
- EPA и DHA: конкурируют с арахидоновой кислотой (провоспалительной)
- Источники: жирная рыба (лосось, скумбрия, сельдь), рыбий жир
- Доза для эффекта: 2-4г EPA+DHA/сут
- Российская традиция: сельдь + скумбрия — доступные богатые источники

Куркумин:
- Ингибирует NF-κB (главный провоспалительный транскрипционный фактор)
- Проблема: плохая биодоступность
- Решение: куркумин + пиперин (чёрный перец) × 20 биодоступность
- Доза: 500-1000 мг куркумина + пиперин

Ягоды (черника, вишня, клубника):
- Антоцианы: антиоксиданты, снижают мышечную болезненность
- Вишнёвый сок: исследования показывают снижение DOMS на 20-30%
- Черника: когнитивные функции + восстановление

Имбирь:
- Гингеролы → ингибиция COX-1/COX-2 (как ибупрофен, но мягче)
- 1-2г свежего имбиря или чай снижают боль после тренировки

Зелёный чай (EGCG):
- Сильный антиоксидант, противовоспалительный
- Дополнительный бонус: небольшое ускорение метаболизма

**Провоспалительные продукты (ограничить):**
🚫 Трансжиры (маргарин, фастфуд)
🚫 Рафинированный сахар (выпечка, сладкие напитки)
🚫 Омега-6 в избытке (подсолнечное масло в больших количествах)
🚫 Обработанное мясо (колбасы, сосиски)
🚫 Алкоголь

**Баланс Омега-6/Омега-3:**
Оптимум: 4:1 (Омега-6 : Омега-3)
Современный рацион: 15-20:1 (провоспалительный перекос)
Стратегия:
- Увеличь Омега-3 (рыба, рыбий жир)
- Снизь Омега-6 (меньше подсолнечного масла, больше оливкового)
`;
}
export function getHydrationScienceAdv(message: string): string {
  const triggers = ['гидратация наука', 'обезвоживание спорт наука', 'осмоляльность', 'электролиты баланс', 'гипонатриемия спорт', 'водный баланс точно'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💧 ГИДРАТАЦИЯ — УГЛУБЛЁННАЯ НАУКА:

**Физиология воды в организме:**
- Общая вода тела: 60% у мужчин, 55% у женщин (жир содержит меньше воды)
- Внутриклеточная (ICF): 60% от общей воды
- Внеклеточная (ECF): 40% (плазма крови + интерстиций)

Осмоляльность плазмы:
- Норма: 275-295 мОсм/кг
- Регуляция: АДГ (вазопрессин) из гипоталамуса + ренин-ангиотензин-альдостерон
- Обезвоживание: осмоляльность ↑ → жажда + снижение диуреза

**Влияние обезвоживания на результат:**

-1% массы тела (вода): снижение выносливости заметно
-2%: снижение аэробной производительности ~10-20%
-3%: когнитивные нарушения (реакция, решения)
-5%: тепловое истощение
-8-10%: опасно для жизни

Важно: чувство жажды запаздывает от реального обезвоживания на ~1%

**Электролиты — детали:**

Натрий (Na⁺):
- Главный внеклеточный катион, регулирует объём плазмы
- Потери с потом: 900-1400 мг/л пота (варьирует индивидуально)
- При длительных тренировках (>2ч): натрий ОБЯЗАТЕЛЕН
- Источники: соль, электролитные напитки

Калий (K⁺):
- Внутриклеточный катион, потенциал покоя нейронов и мышц
- Потери с потом: ~150-200 мг/л
- Источники: бананы, картофель, авокадо

Магний (Mg²⁺):
- Нервно-мышечная передача, >300 реакций
- Потери с потом: 4-15 мг/л
- Дефицит: судороги, слабость

**Гипонатриемия — опасность при избытке воды:**
- Слишком много воды без электролитов → снижение Na⁺ плазмы
- Симптомы: тошнота, головная боль, спутанность, судороги
- Риск: марафонцы, ультра-спортсмены, пьющие воду «по расписанию», а не по жажде
- Правило безопасности: пей по жажде + добавляй натрий при тренировках >90 мин

**Практические рекомендации:**

До тренировки:
- Утром натощак моча светло-жёлтая = хорошо, тёмно-жёлтая = пей
- За 2-3ч до: 400-600 мл воды
- Можно добавить щепотку соли

Во время (>60 мин):
- 150-250 мл каждые 15-20 мин
- При >90 мин: электролитный напиток или изотоник

После:
- На каждые 500мл дефицита (по весу до/после): 750мл жидкости
- Восстановление занимает 4-6 часов
`;
}
export function getAlcoholAndFitness(message: string): string {
  const triggers = ['алкоголь тренировки', 'алкоголь мышцы', 'пиво после тренировки', 'алкоголь восстановление', 'алкоголь тестостерон', 'спирт мышечный рост'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🍺 АЛКОГОЛЬ И ТРЕНИРОВКИ — ФАКТЫ:

**Метаболизм алкоголя:**
- Этанол → ацетальдегид (токсичен) → ацетат → CO₂ + H₂O
- Приоритет метаболизма: организм СНАЧАЛА перерабатывает алкоголь
- При этом жиры, углеводы, белки «ждут» → жирные кислоты накапливаются
- Скорость: ~1 стандартный дринк/час (вес+пол влияют)

**Влияние на синтез мышечного белка (MPS):**
- 1.5г/кг алколя (≈5-6 пив) после тренировки снижает MPS на ~37% (Parr 2014)
- Блокирует сигнальный путь mTOR
- Даже при адекватном потреблении белка → частичная блокировка
- Умеренная доза (1-2 дринка): данные неоднозначны, эффект меньше

**Влияние на гормоны:**

Тестостерон:
- Острое потребление (>4 дринка): снижение тестостерона на 6-23%
- Механизм: алкоголь токсичен для клеток Лейдига (синтез тестостерона)
- Хроническое злоупотребление: стойкое снижение + рост эстрогена

Кортизол:
- Алкоголь повышает кортизол
- Высокий кортизол = катаболизм мышц, нарушение сна

Гормон роста:
- Нарушает пульсацию ГР во сне (особенно SWS фаза)
- Даже 1-2 дринка перед сном нарушают ГР-пульс

**Влияние на восстановление:**

Сон:
- Алкоголь: засыпаешь быстрее, но нарушается фаза REM и SWS
- SWS — фаза максимального выброса ГР → нарушение восстановления
- «Качество сна» снижается даже при субъективном ощущении «сплю хорошо»

Гидратация:
- Алкоголь — диуретик (подавляет АДГ)
- 1г алкоголя = потеря 10мл воды
- 500мл пива = сеть ~100мл обезвоживания

Воспаление:
- Алкоголь усиливает системное воспаление
- Замедляет восстановление мышечных повреждений после тренировки

**Практические рекомендации:**

Минимизация вреда (если пьёшь):
- Никогда перед тренировкой
- После тренировки: минимум 4-8 часов паузы
- Максимум 1-2 стандартных дринка
- Компенсируй водой (1.5:1 к алкогольному напитку)
- Не забудь белок (снижает негативный эффект на MPS)

Суть: умеренное потребление (1-3р/нед, 1-2 дринка) — незначительный эффект на атлетический прогресс. Регулярное злоупотребление — серьёзный тормоз.
`;
}
export function getVeganAthleteNutrition(message: string): string {
  const triggers = ['веган спортсмен', 'растительная диета атлет', 'веганство и мышцы', 'растительный белок мышцы', 'вегетарианец бодибилдинг', 'веган пауэрлифтинг'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🌱 ВЕГАН-АТЛЕТ — ПИТАНИЕ И НУТРИЕНТЫ:

**Главные вызовы для вегана-атлета:**
1. Количество белка (объём пищи больше)
2. Качество белка (аминокислотный профиль)
3. Специфические нутриенты: B12, железо, Омега-3, цинк, кальций, витамин D

**Белок для веган-атлета:**

Лимитирующие аминокислоты растительных белков:
- Зерновые: мало лизина
- Бобовые: мало метионина
- Решение: комбинировать (рис + бобовые = полный профиль)

Качество белка (PDCAAS / DIAAS):
- Горох: DIAAS 0.82 (хорошее)
- Соя: DIAAS 0.99 (отличное, = животным)
- Рис: DIAAS 0.59 (умеренное)
- Пшеница: DIAAS 0.43 (низкое)

Практика: ешь БОЛЬШЕ белка (+10-20%) для компенсации:
- Рекомендация для веган-атлета: 1.8-2.5г/кг
- Основные источники: тофу, темпе, эдамаме, бобовые, сейтан, протеиновые порошки

Лучший веган-протеин:
- Гороховый: хороший DIAAS, богат лейцином
- Соевый: полный аминокислотный профиль
- Смесь горох+рис: часто лучше, чем по отдельности

**Критически важные нутриенты:**

Витамин B12 (ОБЯЗАТЕЛЬНО):
- Единственный нутриент, которого в растениях НЕТ
- Дефицит: анемия, нейропатия, когнитивные нарушения
- Доза: 250-1000 мкг/сут метилкобаламин или аденозилкобаламин
- Или большая доза 2500 мкг 2-3 раза в неделю

Железо (гем vs негем):
- Гемовое (мясо): биодоступность 15-35%
- Негемовое (растения): 2-20% (сильно варьирует)
- Усиливают всасывание: витамин C
- Ингибируют: фитаты (зерновые), полифенолы (чай, кофе), кальций
- Рекомендация: ешь ферментированные/проросшие злаки (снижают фитаты)

Омега-3 (ALA → EPA/DHA конверсия):
- ALA (льняное масло, чиа): конверсия в EPA: 5-10%, в DHA: <1%
- Решение: водорослевое масло DHA/EPA (веганский источник)
- Доза: 250-500 мг DHA+EPA из водорослей

Цинк:
- В растениях фитаты снижают усвоение
- Решение: замачивать бобовые, проростки, цельные зерна
- Или добавки: 25-35 мг/сут (выше RDA на 50%)

**Российский контекст:**
- Темпе/тофу: доступны в Москве и крупных городах (Wildberries, ВкусВилл)
- Гороховый протеин: доступен, относительно дёшев
- Квашеная капуста + чечевичный суп = отличная противовоспалительная комбинация
`;
}
export function getIntermittentFastingSport(message: string): string {
  const triggers = ['интервальное голодание спорт', 'прерывистое голодание', '16 8 тренировки', 'if питание атлет', 'голодание мышцы', 'intermittent fasting атлет'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⏰ ПРЕРЫВИСТОЕ ГОЛОДАНИЕ (IF) В СПОРТЕ:

**Популярные протоколы:**

16:8 (Leangains — Мартин Берхан):
- 16 часов голодания, 8 часов окно питания
- Пример: последний приём 20:00, первый 12:00 следующего дня
- Наиболее исследован для спортсменов

18:6 и 20:4:
- Более экстремальные варианты
- Меньше времени для потребления достаточного белка

5:2:
- 5 дней обычно, 2 дня ≤500 ккал
- Для большинства силовиков: неоптимально (слишком мало белка в дни голодания)

OMAD (One Meal A Day):
- 1 приём в день
- Очень сложно получить достаточно белка → не рекомендуется при цели мышечная масса

**Физиологические эффекты IF:**

Аутофагия:
- Запускается через ~16-24ч голодания
- Очистка повреждённых клеточных компонентов
- Потенциал: снижение воспаления, защита от болезней
- Для мышечного роста: необходима умеренность (чрезмерная аутофагия = катаболизм)

Инсулин и жиросжигание:
- Инсулин低 → жиросжигание активно
- При грамотном IF: лучший контроль аппетита, легче придерживаться дефицита

Гормон роста:
- Голодание → повышение ГР (компенсация катаболизма)
- НО: физиологически и практически ограниченный эффект

**IF и мышечная масса — что говорят исследования:**

Метаанализ Cioffi (2018): при равном белке IF не хуже обычного питания для сохранения мышц

НО проблема: большинство исследований с нетренированными субъектами

Для тренированных атлетов:
- Окно 8ч = сложно разместить 4-5 приёмов белка по 30-40г
- Качество важнее формата: если IF помогает соблюдать рацион → используй

**Практика IF для силовика:**

Расписание тренировок:
- Тренируйся перед первым приёмом пищи (в конце голодания) ИЛИ
- В начале окна питания
- После тренировки: первый приём должен быть богат белком (40-60г)

Типичное расписание (16:8, тренировка утром):
7:00 — тренировка (кофе + BCAA опционально)
12:00 — 50г белка + углеводы (1-й приём)
16:00 — 40г белка + жиры (2-й приём)
20:00 — 40г белка + казеин (3-й приём)

Кому НЕ подходит IF:
- Стрессовая работа + тяжёлые тренировки (двойная нагрузка на кортизол)
- Женщины с гормональными нарушениями (IF нарушает циклы)
- Набор массы (сложнее создать профицит)
- Восстановление после травм
`;
}
export function getDietBreakProtocol(message: string): string {
  const kw = ['диетическая пауза', 'diet break', 'перерыв в диете', 'поддерживающие калории неделя', 'maintenance break'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Diet Break (Диетическая пауза) — протокол:**

**Отличие от рефида:**
Рефид = 1-2 дня повышенных углеводов
Diet Break = 1-2 недели на поддерживающих калориях

**Доказательная база:**
Исследование Byrne et al. (2017): прерывистая диета (2 нед дефицит + 2 нед TDEE) vs постоянная диета → одинаковая потеря жира при лучшем сохранении мышц и меньшей усталости.

**Физиология:**
2 недели на TDEE:
- Лептин полностью восстанавливается
- Тестостерон нормализуется
- Щитовидная железа (T3/T4) восстанавливается
- Психологический отдых от ограничений

**Когда делать Diet Break:**
- После 8-12 недель непрерывного дефицита
- Стагнация потери жира > 2-3 нед без объяснения
- Усталость, раздражительность, потеря мотивации
- Перед важным событием (соревнование, отпуск)

**Протокол:**
Калории: TDEE (поддержка, не профицит)
Белок: сохраняем высоким (≥2.0 г/кг)
Тренировки: продолжаем нормально или чуть интенсивнее
Срок: 7-14 дней
После: возвращаемся к дефициту без угрызений совести

**Ожидаемый результат:**
+1-2 кг от воды/гликогена — это нормально, не жир.
Тренировки улучшатся → потеря жира ускорится после возврата к дефициту.
`;
}
export function getNitrateFoodSport(message: string): string {
  const kw = ['нитраты спорт', 'свёкольный сок', 'нитраты в питании', 'нитрат натрия спорт', 'dietary nitrate'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Диетические нитраты и спортивная эффективность:**

**Механизм действия:**
Нитраты (NO₃⁻) → нитриты (NO₂⁻) → оксид азота (NO)
NO → вазодилатация → ↑ кровоток к мышцам → ↑ доставка О₂ и питательных веществ
+ снижение О₂-стоимости упражнений (мышцы работают эффективнее)

**Доказательная эффективность:**
↑ выносливость (аэробные виды) на 1-3%
↑ мощность при субмаксимальных нагрузках
Особенно эффективны у нетренированных и любителей (у элиты меньше)
Снижение потребления О₂ при одинаковой мощности на 3-5%

**Лучший источник — свекольный сок:**
~400-500 мг нитратов / 500 мл сока
Протокол: 500 мл за 2-2.5 ч до тренировки
Острый эффект: уже с первой дозы
Хронический: нагрузка 6-7 дней → максимальный эффект

**Другие источники нитратов:**
Рукола: ~250 мг/100 г (рекордсмен)
Шпинат: ~150 мг/100 г
Сельдерей, редис, листовой салат

**Важно:**
НЕ использовать ополаскиватель с антибактериальным — убивает бактерии рта, конвертирующие NO₃ → NO₂
НЕ жевать жвачку перед приёмом (та же причина)
Красные пятна на моче и стуле после свёклы — норма (пигмент бетаин)

**Для каких нагрузок наиболее эффективно:**
Аэробные > 10 мин (бег, велосипед, гребля)
Командные виды (прерывистые спринты)
Менее эффективно: чистая силовая, спринты <30 сек
`;
}
export function getMacrocyclePlanning(message: string): string {
  const kw = ['макроцикл', 'macrocycle', 'годовой план', 'долгосрочное планирование', 'план на год тренировки', 'периодизация год'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Планирование макроцикла (годовой план):**

**Макроцикл — 3-12 месяцев:**
Состоит из нескольких мезоциклов с разными целями.
Вершина — пиковая форма к конкретной дате.

**Типичный годовой план силового атлета:**

**Октябрь-Январь (16 нед) — Фундамент:**
Объёмный блок: база силы и гипертрофии
3 × 4-недельных мезоцикла накопление → интенсификация → накопление → разгрузка

**Февраль-Март (8 нед) — Специализация:**
Акцент на слабых точках
Пауэрлифтинг: специфика соревновательных движений

**Апрель-Май (6 нед) — Пик:**
Интенсификация + разгрузка + пиковая форма
Соревнование / тест ПР в конце

**Июнь (4 нед) — Переход:**
Активный отдых, смена видов активности

**Июль-Сентябрь (12 нед) — Второй цикл:**
Повторение с более высокой базой

**Принципы долгосрочного планирования:**
- Работай назад от цели: дата соревнования → план назад
- Специфичность нарастает ближе к цели
- Разнообразие в подготовительном периоде → монотонность в пиковом
- Записывай результаты каждого цикла → улучшай следующий

**Для любителей без соревнований:**
Цикл каждые 3-4 месяца: 8-10 нед нагрузки + 2-3 нед разгрузки + новые цели
`;
}
export function getPersonalizedNutrition(message: string): string {
  const kw = ['индивидуальное питание', 'питание по генетике', 'персональная диета', 'подходящая диета', 'тип питания'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Индивидуализация питания:**

**Почему одна диета не подходит всем:**
Микробиом (разные бактерии → разный отклик на продукты)
Генетика (CYP1A2 → кофеин, LCT → лактоза, FADS1 → омега-3)
Инсулиновая чувствительность (варьирует в 10 раз между людьми)
Пищевые привычки и культура

**Как найти СВОЙ подход:**

1. **Начни с базы** (одинаково для всех):
   Белок 1.6-2.2 г/кг
   Овощи 400+ г/день
   Клетчатка 25-35 г/день
   Вода 30-35 мл/кг

2. **Настрой углеводы/жиры** (индивидуально):
   Высокие углеводы (50-60%): если активен, хороший отклик, хорошая энергия
   Умеренные (35-45%): универсальный вариант
   Низкие углеводы (20-30%): если плохая инсулиновая чувствительность, сидячая работа
   Ориентируйся на энергию и самочувствие, не на модные диеты

3. **Тестируй 2-4 недели:**
   Отслеживай: энергию, сон, силу, вес, настроение
   Если всё в норме → работает
   Если чувствуешь себя плохо → корректируй

4. **Тайминг:**
   Если утренние тренировки → углеводы вечером (для гликогена)
   Если вечерние → углеводы утром и днём
   Белок: каждые 3-5 часов, 30-50 г за приём
`;
}
export function getReversDieting(message: string): string {
  const kw = ['обратная диета', 'реверс диета', 'выход из дефицита', 'после диеты', 'восстановление метаболизма'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Обратная диета (Reverse Diet):**

**Зачем:**
После длительного дефицита калорий:
↓ Метаболизм (адаптивный термогенез: -10-15%)
↓ NEAT (бессознательное снижение активности)
↓ Гормоны (лептин, T3, тестостерон)
↑ Грелин (голод)
Резкий возврат к нормальным калориям = быстрый набор жира (rebound)

**Протокол реверса:**
Добавляй 50-100 ккал в неделю (в основном углеводы)
Пример: с 1800 → 1900 → 2000 → ... → 2500 за 7-14 недель
Белок: держи стабильно (1.6-2.0 г/кг)
Жиры: добавляй если были слишком низкие (<0.7 г/кг)

**Что отслеживать:**
Вес: может ↑ на 1-3 кг (гликоген + вода, НЕ жир)
Окружность талии: если растёт >1 см/неделю → замедли реверс
Энергия: должна расти
Сон: должен улучшиться
Либидо: должно восстанавливаться

**Когда реверс завершён:**
Калории = TDEE (вес стабилен 2-3 недели)
Энергия в норме
Голод контролируем
Теперь можно начинать новый набор или поддержание
`;
}
export function getCarbCycling(message: string): string {
  const kw = ['карбсайклинг', 'углеводное чередование', 'циклирование углеводов', 'carb cycling', 'высокие низкие углеводы'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Карбсайклинг (циклирование углеводов):**

**Принцип:** разное количество углеводов в разные дни
Высокие дни: тяжёлые тренировки (ноги, спина)
Средние дни: умеренные тренировки (руки, плечи)
Низкие дни: отдых или лёгкое кардио

**Пример (для атлета 80 кг на дефиците):**
Высокий день: 350 г углеводов, 180 г белка, 60 г жиров = 2660 ккал
Средний день: 200 г, 180 г, 70 г = 2130 ккал
Низкий день: 100 г, 200 г, 80 г = 1880 ккал
Средненедельный: ~2200 ккал (дефицит)

**Преимущества:**
Лучшая тренировочная производительность в тяжёлые дни
Сохранение лептина (чувствительность не падает)
Психологически легче (есть "загрузочные" дни)
Лучшее партиционирование (углеводы → мышцы, не жир)

**Кому подходит:**
Продвинутым (>2 лет стажа)
Тем, кто уже умеет считать макросы
При жиросжигании на последних 5-10% жира

**Кому НЕ нужно:**
Новичкам (усложняет без пользы)
Если не можешь стабильно считать обычные калории
`;
}
export function getAlcoholAndFitnessV2(message: string): string {
  const kw = ['алкоголь и спорт', 'алкоголь мышцы', 'можно ли пить', 'пиво после тренировки', 'алкоголь тестосте��он'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Алкоголь и спортивные результаты:**

**Влияние на мышцы:**
↓ Синтез белка на 20-37% (при >1.5 г/кг этанола — ~6+ напитков)
↓ Тестостерон на 10-20% (при умеренном употреблении)
↑ Кортизол
↓ ГР (гормон роста) на 70-75% (нарушение глубокого сна)
↓ Качество сна (↓ REM, фрагментация)

**При умеренном употреблении (1-2 напитка):**
Влияние на MPS — минимальное
Но: пустые калории (1г этанола = 7 ккал)
Пиво 500 мл = ~200 ккал, вино 150 мл = ~120 ккал

**Стратегия минимизации вреда (если пьёшь):**
Не пей в день тренировки (особенно ног/спины)
Минимум 24ч между алкоголем и следующей тренировкой
Ешь белок ДО употребления (замедляет всасывание)
Пей воду между алкоголем (1:1)
Избегай коктейлей (сахар + алкоголь = максимум калорий)
Белое вино/сухое > пиво > коктейли (по калорийности)

**Лучший выбор:**
0 алкоголя — лучший для результатов (очевидно)
Если не готов отказаться: ≤2 напитка, ≤2 раза в неделю
`;
}
export function getMealPrepStrategiesV2(message: string): string {
  const kw = ['мил преп', 'meal prep', 'готовка на неделю', 'заготовки еды', 'контейнеры еда'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Meal Prep — подготовка еды на неделю:**

**Зачем:**
Экономия 5-7 часов/неделю
Контроль КБЖУ (взвешено и посчитано заранее)
↓ Вероятность сорваться (еда всегда готова)
Экономия денег (оптовые закупки)

**Стратегия "batch cooking" (воскресенье):**

1. **Белки (3-4 источника):**
   Куриная грудка: 2 кг запечь с приправами
   Говядина: 1 кг потушить
   Рыба: 1 кг (замороженное филе — на отдельные дни)
   Яйца: 20 шт варёных

2. **Углеводы (2-3 источника):**
   Рис: 1.5 кг (отварить)
   Гречка: 1 кг
   Картофель: 1 кг (запечь)

3. **Овощи:**
   Брокколи/цветная капуста: 1 кг (на пару)
   Микс салатов (свежее — покупать чаще)

4. **Соусы/приправы:**
   Подготовь 2-3 разных приправки (не скучная еда!)
   Соевый соус, горчица, аджика, лимон

**Хранение:**
Контейнеры 500-700 мл с крышками
Холодильник: 3-4 дня
Морозилка: порции на 2-ю половину недели

**Бюджет:** ~4000-6000 руб/неделю на 2500 ккал/день
`;
}
export function getRefeedAndCheatMeals(message: string): string {
  const kw = ['рефид', 'чит мил', 'загрузочный день', 'cheat meal', 'загрузка углеводами'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Рефиды и чит-милы — научный подход:**

**Рефид (structured refeed):**
Плановый день с ↑ углеводами при сохранении калорий/дефицита
Цель: восстановить лептин, гликоген, психологический перерыв
НЕ то же, что "ешь всё подряд"

**Протокол рефида:**
Углеводы: ↑ на 100-150% от обычного
Жиры: ↓ до минимума (30-40 г)
Белок: без изменений
Калории: поддержание или лёгкий профицит (+200-300)
Источники углеводов: рис, паста, хлеб, фрукты, овсянка

**Частота:**
>20% жира: 1 раз в 2 недели
15-20% жира: 1 раз в неделю
10-15% жира: 2 раза в неделю
<10% жира: через день (практически carb cycling)

**Чит-мил (unstructured):**
1 приём пищи без подсчёта (не весь день!)
Максимум 1 раз в неделю
Правило: наслаждайся, но не объедайся
После: вернись к плану без чувства вины

**Чит-дей (целый день) — НЕ рекомендуется:**
Можно набрать 3000-5000+ ккал сверх нормы
Разрушает недельный дефицит за один день
Формирует нездоровые отношения с едой
Лучше: плановый рефид > хаотичный чит
`;
}
export function getNutritionForRecovery(message: string): string {
  const kw = ['питание для восстановления', 'еда после тренировки восстановление', 'нутриенты восстановление мышц', 'антивоспалительное питание спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Питание для максимального восстановления:**

**Протокол 30-минутное окно после тренировки:**
Белок: 30-40г быстроусвояемого (сывороточный, яйца)
Углеводы: 1-1.2г/кг для восполнения гликогена (критично если тренировки 2× в день)
Лейцин ≥3г — триггер синтеза белка

**В течение 24ч:**
Белок: 0.4г/кг каждые 3-4ч (равномерное распределение)
Углеводы: 5-8г/кг при высоком объёме тренинга
Жиры: не ограничивать — омега-3 снижают воспаление

**Антивоспалительные продукты:**
Вишня/черешня: ↓ DOMS на 20% (антоцианины)
Куркума + чёрный перец: ↓ CRP маркер воспаления
Жирная рыба (лосось, скумбрия): 2-3г ЭПК+ДГК
Черника, гранат: полифенолы → ↓ оксидативный стресс

**Микронутриенты для восстановления:**
Магний 400-600мг: синтез белка, сон, ↓ спазмы
Цинк 25-30мг: тестостерон, иммунитет, заживление
Витамин C 500-1000мг: синтез коллагена
Витамин D 2000-4000 МЕ: противовоспалительный эффект

**Гидратация:**
1.5× объём потерянного пота (взвешивайся до/после)
Электролиты если потерено >1% массы тела
`;
}
export function getMusclesFiberTypes(message: string): string {
  const kw = ['типы мышечных волокон', 'быстрые медленные волокна', 'волокна 1 2 типа', 'slow twitch fast twitch', 'как тренировать под тип волокон'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Типы мышечных волокон и тренировка:**

**Классификация:**
Тип I (медленные, ST): красные, много митохондрий, аэробный метаболизм, усталость медленная
→ Преобладают в: камбаловидной, тип А жирных мышцах позвоночника, ягодичной
Тип IIa (быстрые окислительно-гликолитические): переходный тип, тренируемый под любой вид
Тип IIx/IIb (быстрые гликолитические): белые, мало митохондрий, максимальная сила/мощь, быстрая усталость
→ Преобладают в: икрах (gastrocnemius), трицепс, верхняя ВМЖ

**Как определить свой тип:**
Нет точного теста без биопсии, но косвенно:
Жим на 80% 1ПМ → <5 повторений = больше быстрых; >10 повторений = больше медленных

**Тренировка под тип волокон:**
Тип I (медленные): 15-30+ повторений, TUT 40-70 сек, короткий отдых 60-90 сек
Тип IIa: 8-15 повторений — стандартная гипертрофийная работа
Тип IIx: 1-5 повторений, 85%+ 1ПМ, длинный отдых 3-5 мин

**Конвертация типов:**
IIx → IIa: ЛЮБОЙ тренинг вызывает сдвиг в сторону IIa
IIa → I: длительный аэробный тренинг (месяцы)
I → II: НЕВОЗМОЖНО у взрослых в значимом масштабе

**Практический вывод:**
Тренируй ВСЕ типы волокон: тяжёлая работа (1-5) + гипертрофийная (8-15) + объёмная (15-30)
Это Periodization — базовый принцип долгосрочного прогресса
`;
}
export function getDehydrationPerformanceV2(message: string): string {
  const kw = ['обезвоживание тренировка', 'дегидратация спорт', 'вода и производительность', 'сколько пить на тренировке', 'потеря воды сила'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Обезвоживание и спортивная результативность:**

**Критические пороги:**
-1% от массы тела: субъективный дискомфорт, ↓ когнитивная функция
-2%: ↓ выносливость на 10-20%, ↑ воспринимаемая нагрузка, ↑ ЧСС на 3-5 уд/мин
-3%: ↓ силовые показатели, нарушение терморегуляции
-5%: опасная зона, возможен тепловой удар

**Силовой тренинг и дегидратация:**
Обезвоживание -3% → ↓ 1ПМ на жиме лёжа на 5-8% (Judelson et al. 2007)
Мышечная выносливость (большие повторения): более чувствительна, чем максимальная сила
Концентрация: ↓ уже при -1-2% — важно для техники

**Оценка гидратации:**
Цвет мочи: светло-жёлтый = хорошо, тёмно-жёлтый = пей больше
Жажда — ненадёжный индикатор (запаздывает на 1-2% дегидратации)
Вес: взвесься до/после тренировки, разница = потеря воды

**Нормы потребления:**
Общая дневная: 30-35 мл/кг массы тела (без учёта тренировок)
До тренировки: 500 мл за 2 часа, 250 мл за 30 мин
Во время: 150-250 мл каждые 15-20 мин (при тренировке >60 мин)
После: 150% от потерянного веса (500 мл потерял → 750 мл выпей)

**Электролиты (при тренировке >90 мин или жаре):**
Натрий — ключевой. Изотоник или щепотка соли в воде
Гипонатриемия (слишком много воды без натрия) опаснее обезвоживания
`;
}
export const FOOD_SCAN_FREE_DAILY_LIMIT = 5;
export function getCarbCyclingV2(message: string): string {
  const kw = ['углеводное циклирование', 'карбофазирование', 'углеводная загрузка', 'carb cycling', 'загрузочный день'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Углеводное циклирование (карб-сайклинг):**

**Суть метода:**
Чередование дней с высоким, средним и низким потреблением углеводов в зависимости от тренировочной нагрузки.

**Базовая схема:**
Тренировочный день: углеводы высокие (3-5 г/кг) — восполнение гликогена, анаболизм
День отдыха: углеводы низкие (0.5-1.5 г/кг) — стимуляция жиросжигания
День лёгкой тренировки: углеводы средние (1.5-2.5 г/кг)

**Механизм:**
Высокие углеводы → инсулин → анаболизм → восполнение гликогена мышц
Низкие углеводы → жиросжигание → инсулиновая чувствительность

**Для кого:**
Продвинутые атлеты на рекомпозиции (одновременно рост мышц + жиросжигание)
Тем, кто застрял на плато — плюс 3-5% скорости жиросжигания vs линейный дефицит

**Белок и жиры:**
Белок остаётся ПОСТОЯННЫМ: 1.8-2.2 г/кг во все дни
Жиры компенсируют калории в низкоуглеводные дни (0.8-1.2 г/кг)

**Практический вариант для 3 тренировок/неделю:**
Пн (силовая): углеводы высокие — 350-400 г
Вт (кардио): углеводы средние — 200-250 г
Ср (отдых): углеводы низкие — 80-100 г
`;
}
export function getProteinTiming(message: string): string {
  const kw = ['когда пить протеин', 'протеин после тренировки', 'анаболическое окно', 'белковое окно'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Протеин: тайминг и анаболическое окно — наука:**

**Миф об анаболическом окне 30 минут:**
Опровергнут. Мета-анализ Schoenfeld et al. (2013): анаболическое окно составляет 4-6 часов, а не 30 минут.
Если вы поели за 2-3 часа до тренировки — нет срочности пить протеин сразу после.
Если тренируетесь натощак — приём белка в течение 1-2 часов после тренировки имеет смысл.

**Главное правило:**
Общее суточное потребление белка ВАЖНЕЕ тайминга. 1.6-2.2 г/кг/день — целевой диапазон.

**Оптимальное распределение:**
0.4-0.55 г/кг на приём × 4 приёма в день (каждые 3-5 часов)
Для атлета 80 кг: 32-44 г белка за приём, 4 раза в день = 128-176 г/день
Равномерное распределение на 10-15% эффективнее, чем 1-2 больших приёма (Mamerow et al. 2014)

**Лейциновый порог:**
Для активации mTOR (ключевой сигнал синтеза белка) нужно 2.5-3 г лейцина за приём
Это примерно: 25-30 г сывороточного протеина, 170 г куриной грудки, 200 г творога, 4 яйца

**Казеин перед сном:**
Snijders et al. (2015): группа с казеином перед сном показала +12% прироста силы и +7% мышечной массы за 12 недель vs контроль
Рекомендация: 30-40 г казеина или 200-300 г творога за 30-60 минут до сна
Механизм: медленное высвобождение аминокислот (6-8 часов) поддерживает анаболизм ночью

**Практический вывод:**
Не стрессуйте из-за тайминга. Ешьте белок 3-5 раз в день, с акцентом на достаточный лейцин в каждом приёме, и добавьте казеин/творог перед сном.
`;
}
export function getTrainingForFatLoss(message: string): string {
  const kw = ['тренировки для похудения', 'жиросжигающая тренировка', 'силовые или кардио для похудения', 'кардио натощак'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки для жиросжигания — наука vs мифы:**

**Главный принцип:**
Жиросжигание = дефицит калорий. Тренировки — инструмент, а не замена диеты.
Нельзя «пережечь» плохое питание: 1 час бега = ~500 ккал = 1 бургер.

**Силовые vs кардио для похудения:**
Силовые тренировки ЛУЧШЕ для состава тела: сохраняют мышцы в дефиците
При диете без силовых: до 25-30% потерянного веса = мышцы (Weinheimer et al. 2010)
При диете + силовые: потеря мышц < 5%
EPOC (избыточное потребление кислорода после тренировки): силовые → повышенный метаболизм 24-48ч

**Миф о кардио натощак:**
Schoenfeld (2014): НЕТ разницы в жиросжигании между кардио натощак и после еды при равном дефиците
Кардио натощак → больше жира сжигается ВО ВРЕМЯ тренировки, но меньше — в остальное время дня
Итог за сутки: одинаковый результат. Делайте как удобнее.

**NEAT — недооценённый фактор:**
NEAT (Non-Exercise Activity Thermogenesis) = ходьба, работа по дому, жестикуляция, fidgeting
10 000 шагов/день = 300-500 ккал дополнительно (зависит от веса)
При диете NEAT снижается на 200-400 ккал/день (адаптивный термогенез) → целенаправленно поддерживайте активность
NEAT составляет 15-30% суточного расхода энергии — больше, чем тренировки!

**Оптимальная комбинация:**
3 силовые тренировки/неделю (сохранение мышц, EPOC)
2 сессии LISS-кардио (Low Intensity Steady State, 30-45 мин, ЧСС 120-140)
Ежедневно: 8000-12000 шагов (высокий NEAT)
Дефицит калорий 300-500 ккал/день (из питания, не из тренировок)

**Чего избегать:**
Экстремальный дефицит (>1000 ккал) — потеря мышц, метаболическая адаптация
Только кардио без силовых — «скинни фэт» результат
Ежедневные HIIT-тренировки — перетренированность, повышение кортизола
`;
}
export function getMealPrep(message: string): string {
  const kw = ['мил преп', 'подготовка еды', 'готовка на неделю', 'meal prep', 'заготовки еды'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Мил-преп (Meal Prep) — подготовка еды для атлетов:**

**Зачем это нужно:**
Meal prep = приготовление еды на несколько дней вперёд. Главное преимущество — контроль КБЖУ и экономия времени.
Атлеты, планирующие питание заранее, на 60% чаще придерживаются плана (исследования по compliance).
Экономия: домашняя еда на 40-60% дешевле столовых и доставки.

**3-дневный vs 7-дневный преп:**
3-дневный (рекомендуется): готовите 2 раза в неделю (вск + среда). Еда свежее, вкуснее, безопаснее.
7-дневный: готовите 1 раз. Экономит больше времени, но последние дни — еда может потерять качество.
Оптимально для начинающих: 3-дневный преп. Два сеанса готовки по 1.5-2 часа.

**Белковые источники, которые хорошо хранятся (3-4 дня):**
Куриная грудка (запечённая/отварная) — универсальный вариант
Говядина (тушёная, медленного приготовления) — до 4 дней
Варёные яйца — до 5 дней в скорлупе
Рыба — ТОЛЬКО 1-2 дня (готовьте позже или замораживайте)
Творог — покупайте свежий, не готовьте заранее
Бобовые (чечевица, нут) — до 5 дней, отличный растительный белок

**Хранение и контейнеры:**
Стеклянные контейнеры предпочтительнее пластиковых (нет BPA, не впитывают запахи)
Разделяйте крупы и белок от овощей (овощи размокают)
Температура холодильника: 2-4°C. Контейнеры — на среднюю полку, не в дверцу.
Маркируйте дату приготовления на каждом контейнере.

**Разогрев:**
Курица/мясо: микроволновка 2-3 мин, добавьте 1 ст.л. воды (чтобы не пересохло)
Рис/крупы: отлично разогреваются, добавьте немного воды
Овощи: лучше есть холодными в салате или разогревать минимально

**Пример расписания препа (воскресенье):**
10:00 — ставите крупы (рис, гречка, макароны) + запекаете 2 кг курицы
10:30 — нарезаете овощи, ставите яйца вариться
11:00 — раскладываете по контейнерам на пн-вт-ср
11:30 — готово! 9 контейнеров (3 дня × 3 приёма) за 1.5 часа
`;
}
export function getSportNutritionBasics(message: string): string {
  const kw = ['спортивное питание основы', 'что есть спортсмену', 'питание для мышц', 'диета для зала'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Основы спортивного питания — научно обоснованный подход:**

**Белок (protein) — строительный материал:**
Оптимум для набора мышц: 1.6-2.2 г/кг массы тела в день (Schoenfeld & Aragon 2018)
Больше 2.2 г/кг — нет дополнительной пользы для мышц, но безопасно до 3.0 г/кг
Распределение: 4-6 приёмов по 25-40г белка (для максимального MPS — мышечного протеинового синтеза)
Источники: курица, рыба, яйца, творог, бобовые, протеиновый порошок (если не добираете из еды)

**Углеводы (carbs) — топливо для тренировок:**
Диапазон: 3-7 г/кг в зависимости от активности
Лёгкие тренировки (3×/нед): 3-4 г/кг
Интенсивные тренировки (5-6×/нед): 5-7 г/кг
Источники: рис, овсянка, гречка, картофель, макароны, фрукты
Углеводы НЕ враг — без них тренировки будут вялыми, а восстановление медленным

**Жиры (fats) — гормоны и здоровье:**
Оптимум: 0.8-1.2 г/кг массы тела
Ниже 0.5 г/кг — риск снижения тестостерона и нарушения гормонального баланса
Источники: оливковое масло, авокадо, орехи, жирная рыба (омега-3), яйца

**Частота приёмов пищи:**
Оптимально: 4-6 приёмов в день (каждые 3-4 часа)
Минимум 3 приёма — но при 2 приёмах трудно набрать достаточно белка с оптимальным MPS
Общая калорийность важнее частоты — если проще есть 3 раза, это тоже работает

**Питание вокруг тренировки:**
Приём пищи ДО тренировки: за 1-3 часа, белок + углеводы (например, рис с курицей, овсянка с протеином)
Натощак тренироваться можно, но производительность может снизиться на 10-15%
ПОСЛЕ тренировки: белок + углеводы в течение 2 часов (не обязательно за 30 минут — это миф "анаболического окна")
Реальное окно: 4-6 часов вокруг тренировки (если ели до — запас есть)

**Гидратация:**
Базовая норма: 35 мл/кг массы тела в день
Дополнительно: +500 мл на каждый час тренировки
Признаки обезвоживания: тёмная моча, головная боль, снижение силы на 10-20%
Электролиты (натрий, калий, магний) — добавлять при потоотделении более 1 часа
`;
}
export function getAlcoholAndTraining(message: string): string {
  const kw = ['алкоголь и тренировки', 'пиво после тренировки', 'влияние алкоголя на мышцы', 'можно ли пить и тренироваться'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Алкоголь и тренировки — влияние на мышцы и результат:**

**Влияние алкоголя на мышечный рост:**
Снижает мышечный протеиновый синтез (MPS) на 20-30% (Parr et al. 2014)
Даже умеренная доза (5-6 стандартных напитков) подавляет MPS на 24-48 часов
Механизм: алкоголь ингибирует mTOR-путь — главный сигнальный путь для роста мышц
Эффект зависит от дозы: 1-2 напитка — минимальное влияние, 5+ — значительное

**Дегидратация:**
Алкоголь — диуретик (увеличивает выведение воды)
Обезвоживание на 2% снижает силу на 10-15% и выносливость на 20%
На следующий день после выпивки: тренировка менее продуктивна
Компенсация: на каждый алкогольный напиток — стакан воды

**Влияние на сон:**
Алкоголь помогает заснуть, но разрушает качество сна (подавляет REM-фазу)
REM-сон критичен для восстановления и мышечного роста
Даже 2 бокала вина за 4 часа до сна снижают качество восстановления на 24% (Ebrahim et al. 2013)

**Гормональные эффекты:**
Повышает кортизол (катаболический гормон) — мышцы разрушаются быстрее
Снижает тестостерон на 6-10% при регулярном умеренном употреблении
Хроническое употребление: повышенная ароматизация (тестостерон → эстроген)

**Тайминг — когда хуже всего:**
Наихудший вариант: алкоголь в первые 4 часа после тренировки (пик MPS уничтожен)
Плохой вариант: вечером в день тренировки
Наименее вредный: день отдыха, умеренная доза, с едой

**Умеренное употребление — реальное влияние:**
1-2 напитка 1-2 раза в неделю = минимальное влияние на результат (Steiner & Lang 2015)
Ключевое слово: УМЕРЕННОЕ и НЕ ЧАСТО
Бокал вина на ужине в субботу — не катастрофа
Пятничный запой каждую неделю — потеря 20-30% потенциального прогресса

**Практические советы:**
Не пейте в день тренировки (особенно после неё)
Если выпили — на следующий день всё равно идите в зал (не пропускайте!)
Высокобелковая пища с алкоголем частично компенсирует подавление MPS
Гидратация: 500 мл воды перед сном после алкоголя, электролиты утром
Безалкогольное пиво — отличная альтернатива (без негативных эффектов, содержит углеводы)
`;
}
