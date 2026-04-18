/**
 * Context Engine — intent-aware, selective context builder.
 *
 * Replaces the "compute everything" approach with targeted context:
 * each intent gets a focused set of context blocks computed on-demand.
 *
 * Performance: instead of ~1 800 functions running per request,
 * only 20-30 relevant builders execute, then optimizeContext
 * still picks the best fit within the token budget.
 */

import { prisma } from '../db';

export type UserIntent =
  | 'data_logging'
  | 'program_creation'
  | 'workout_modify'
  | 'technique_question'
  | 'nutrition_query'
  | 'analytics_query'
  | 'greeting'
  | 'complaint'
  | 'motivation'
  | 'general';

export interface ChatContextData {
  userId: string;
  intent: UserIntent;
  message: string;
  todayDate: string;

  user: {
    goal?: string | null;
    fitnessLevel?: string | null;
    weightKg?: number | null;
    heightCm?: number | null;
    trainingExperienceYears?: number | null;
    gender?: string | null;
    healthRestrictions?: Array<{ bodyPart?: string | null; description?: string | null }>;
  } | null;

  recentWorkouts: Array<{
    name: string;
    completedAt: Date | null;
    durationMinutes?: number | null;
    totalVolume?: number | null;
    exercises: Array<{
      exerciseId: string;
      exercise?: { name: string; primaryMuscles?: string[] } | null;
      sets: Array<{
        completed: boolean;
        weight?: number | null;
        reps?: number | null;
        rpe?: number | null;
      }>;
    }>;
  }>;

  allCompletedExerciseSets: Array<{
    exercise: { name: string };
    workout: { completedAt: Date | null };
    sets: Array<{ weight?: number | null; reps?: number | null; completed?: boolean }>;
  }>;

  todayMeals: Array<{
    type: string;
    totalCalories: number;
    totalProtein: number;
    totalFats: number;
    totalCarbs: number;
    items?: Array<{ name: string; protein: number; fats: number; carbs: number }>;
    createdAt: Date;
  }>;

  bodyWeightHistory: Array<{ weightKg: number; date: Date }>;

  nutritionTargets?: {
    calories: number;
    protein: number;
    fats: number;
    carbs: number;
  } | null;

  sleepEntries?: Array<{
    date: string;
    durationHours: number;
    quality?: number | null;
  }>;

  activeProgram?: {
    name: string;
    type?: string | null;
    daysPerWeek?: number | null;
    level?: string | null;
  } | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build focused, intent-specific context.
 * Returns a formatted string ready to inject into the system prompt.
 * Called ONCE per /chat request after intent classification.
 */
export async function buildDynamicContext(data: ChatContextData): Promise<string> {
  const blocks: string[] = [];

  // Core: always included regardless of intent
  const core = buildCoreStatsContext(data);
  if (core) blocks.push(core);

  // Intent-specific blocks
  switch (data.intent) {
    case 'greeting':
    case 'motivation': {
      const gamification = await buildGamificationBlock(data);
      if (gamification) blocks.push(gamification);
      const motivation = buildMotivationBlock(data);
      if (motivation) blocks.push(motivation);
      break;
    }

    case 'program_creation':
    case 'workout_modify': {
      const overload = buildProgressiveOverloadBlock(data);
      if (overload) blocks.push(overload);
      const balance = buildMuscleBalanceBlock(data);
      if (balance) blocks.push(balance);
      const recovery = buildRecoveryBlock(data);
      if (recovery) blocks.push(recovery);
      const frequency = buildFrequencyBlock(data);
      if (frequency) blocks.push(frequency);
      break;
    }

    case 'nutrition_query': {
      const macros = buildMacroBalanceBlock(data);
      if (macros) blocks.push(macros);
      const gaps = buildNutritionGapsBlock(data);
      if (gaps) blocks.push(gaps);
      const timing = buildMealTimingBlock(data);
      if (timing) blocks.push(timing);
      break;
    }

    case 'data_logging': {
      // Only add nutrition context if the message looks food-related
      const msgLower = data.message.toLowerCase();
      const isFoodLog = /съел|поел|завтрак|обед|ужин|перекус|гречк|курица|творог|ккал|калори|белк|протеин|углевод|жир|порц|грамм/i.test(msgLower);
      if (isFoodLog) {
        const macros = buildMacroBalanceBlock(data);
        if (macros) blocks.push(macros);
      }
      break;
    }

    case 'analytics_query': {
      const overload = buildProgressiveOverloadBlock(data);
      if (overload) blocks.push(overload);
      const gamification = await buildGamificationBlock(data);
      if (gamification) blocks.push(gamification);
      const bodyComp = buildBodyCompBlock(data);
      if (bodyComp) blocks.push(bodyComp);
      break;
    }

    case 'complaint': {
      const recovery = buildRecoveryBlock(data);
      if (recovery) blocks.push(recovery);
      const soreness = buildMuscleSorenessBlock(data);
      if (soreness) blocks.push(soreness);
      break;
    }

    case 'technique_question': {
      const technique = buildTechniqueHintBlock(data);
      if (technique) blocks.push(technique);
      const injury = buildInjuryZoneBlock(data);
      if (injury) blocks.push(injury);
      break;
    }

    case 'general':
    default: {
      const overload = buildProgressiveOverloadBlock(data);
      if (overload) blocks.push(overload);
      const macros = buildMacroBalanceBlock(data);
      if (macros) blocks.push(macros);
      const recovery = buildRecoveryBlock(data);
      if (recovery) blocks.push(recovery);
      break;
    }
  }

  // Memory: for all intents (cross-session personalization)
  const memory = await buildMemoryBlock(data);
  if (memory) blocks.push(memory);

  return blocks.join('\n\n');
}

// ─── Context Builders ────────────────────────────────────────────────────────

function buildCoreStatsContext(data: ChatContextData): string {
  const lines: string[] = [];
  const { user, recentWorkouts, todayMeals, nutritionTargets, activeProgram } = data;

  if (user) {
    const goalLabels: Record<string, string> = {
      MUSCLE_GAIN: 'набор массы',
      WEIGHT_LOSS: 'похудение',
      MAINTAIN: 'поддержание формы',
      STRENGTH: 'развитие силы',
      ENDURANCE: 'выносливость',
    };
    const goal = user.goal ? (goalLabels[user.goal] ?? user.goal) : 'не указана';
    const level = user.fitnessLevel ?? 'не указан';
    const weight = user.weightKg ? `${user.weightKg} кг` : 'не указан';
    lines.push(`## ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ\nЦель: ${goal} | Уровень: ${level} | Вес: ${weight}`);

    if (user.healthRestrictions && user.healthRestrictions.length > 0) {
      const zones = user.healthRestrictions.map((r) => r.bodyPart ?? r.description ?? '').filter(Boolean);
      if (zones.length) lines.push(`⚠️ Ограничения здоровья: ${zones.join(', ')}`);
    }
  }

  if (activeProgram) {
    lines.push(`Активная программа: "${activeProgram.name}" (${activeProgram.type ?? '?'}, ${activeProgram.daysPerWeek ?? '?'} дн/нед)`);
  }

  if (recentWorkouts.length > 0) {
    const last = recentWorkouts[0];
    const date = last.completedAt ? new Date(last.completedAt).toLocaleDateString('ru-RU') : '?';
    const daysSince = last.completedAt
      ? Math.floor((Date.now() - new Date(last.completedAt).getTime()) / 86_400_000)
      : null;
    const daysAgoStr = daysSince !== null ? (daysSince === 0 ? 'сегодня' : daysSince === 1 ? 'вчера' : `${daysSince} дн назад`) : '';
    lines.push(`\n## ПОСЛЕДНЯЯ ТРЕНИРОВКА\n${last.name} — ${date} (${daysAgoStr}), ${last.durationMinutes ?? '?'} мин`);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
    if (weekCount > 0) lines.push(`Тренировок за неделю: ${weekCount}`);
  } else {
    lines.push('\n## ТРЕНИРОВКИ\nНет завершённых тренировок.');
  }

  if (todayMeals.length > 0) {
    const totalCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    const totalProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    lines.push(`\n## ПИТАНИЕ СЕГОДНЯ\n${Math.round(totalCal)} ккал | Белок: ${Math.round(totalProt)} г`);
    if (nutritionTargets) {
      const calPct = Math.round((totalCal / nutritionTargets.calories) * 100);
      const protPct = Math.round((totalProt / nutritionTargets.protein) * 100);
      lines.push(`Норма выполнена: ${calPct}% ккал, ${protPct}% белок`);
    }
  }

  return lines.join('\n');
}

function buildProgressiveOverloadBlock(data: ChatContextData): string {
  const { allCompletedExerciseSets } = data;
  if (!allCompletedExerciseSets || allCompletedExerciseSets.length === 0) return '';

  // Group by exercise, get max weight per workout, sorted by date
  const history = new Map<string, Array<{ date: number; maxWeight: number }>>();

  for (const we of allCompletedExerciseSets) {
    if (!we.workout.completedAt) continue;
    const name = we.exercise?.name;
    if (!name) continue;

    const completedSets = we.sets.filter((s) => (s.weight ?? 0) > 0);
    if (completedSets.length === 0) continue;

    const maxWeight = Math.max(...completedSets.map((s) => s.weight ?? 0));
    if (!history.has(name)) history.set(name, []);
    history.get(name)!.push({ date: new Date(we.workout.completedAt).getTime(), maxWeight });
  }

  const plateaus: string[] = [];
  const regressions: string[] = [];
  const progressions: string[] = [];

  for (const [exercise, sessions] of history) {
    if (sessions.length < 3) continue;
    sessions.sort((a, b) => a.date - b.date);
    const last3 = sessions.slice(-3).map((s) => s.maxWeight);

    if (last3[2] > last3[1] && last3[1] >= last3[0]) {
      progressions.push(`${exercise} (${last3[0]}→${last3[2]} кг ✅)`);
    } else if (Math.max(...last3) - Math.min(...last3) <= 2.5) {
      plateaus.push(`${exercise} (${last3[0]} кг × 3 тр ⚠️)`);
    } else if (last3[2] < last3[0] - 2.5) {
      regressions.push(`${exercise} (${last3[0]}→${last3[2]} кг ⛔)`);
    }
  }

  if (plateaus.length === 0 && regressions.length === 0 && progressions.length === 0) return '';

  const lines = ['\n## 📊 ПРОГРЕССИВНАЯ ПЕРЕГРУЗКА'];
  if (progressions.length) lines.push(`✅ Прогресс: ${progressions.slice(0, 4).join(', ')}`);
  if (plateaus.length) {
    lines.push(`⚠️ Плато (нет роста 3+ тренировки): ${plateaus.join(', ')}`);
    lines.push('→ Предложи: +1.25 кг, смену диапазона повторений, rest-pause или деload.');
  }
  if (regressions.length) {
    lines.push(`⛔ Регресс: ${regressions.join(', ')}`);
    lines.push('→ ОБЯЗАТЕЛЬНО обрати внимание: предложи причины (недосып, недоедание, перетренированность).');
  }

  return lines.join('\n');
}

function buildMuscleBalanceBlock(data: ChatContextData): string {
  const { recentWorkouts } = data;
  if (recentWorkouts.length < 3) return '';

  const muscleVolume: Record<string, number> = {};
  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      const muscles = ex.exercise?.primaryMuscles ?? [];
      const vol = ex.sets
        .filter((s) => s.completed)
        .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
      for (const m of muscles) {
        muscleVolume[m] = (muscleVolume[m] ?? 0) + vol;
      }
    }
  }

  const sorted = Object.entries(muscleVolume).sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return '';

  const top = sorted.slice(0, 3).map(([m]) => m);
  const bottom = sorted.slice(-3).map(([m]) => m);
  const neglected = bottom.filter((m) => !top.includes(m));

  if (neglected.length === 0) return '';

  return `\n## ⚖️ МЫШЕЧНЫЙ БАЛАНС\nДоминирующие группы: ${top.join(', ')}\n⚠️ Слабо нагруженные: ${neglected.join(', ')}\n→ Рекомендуй добавить работу на отстающие мышцы в следующий блок.`;
}

function buildRecoveryBlock(data: ChatContextData): string {
  const { recentWorkouts, todayMeals, nutritionTargets, bodyWeightHistory, sleepEntries } = data;

  let score = 100;
  const factors: string[] = [];

  // Training frequency last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSessions = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
  if (weekSessions >= 6) { score -= 25; factors.push(`6+ тренировок за неделю`); }
  else if (weekSessions >= 5) { score -= 10; factors.push(`5 тренировок за неделю`); }

  // Trained last 24h
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (recentWorkouts.some((w) => w.completedAt && new Date(w.completedAt) >= yesterday)) {
    score -= 15;
    factors.push('Тренировка менее 24ч назад');
  }

  // Consecutive days
  let consecutive = 0;
  const todayStr = new Date().toISOString().split('T')[0];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayStr);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (recentWorkouts.some((w) => w.completedAt && w.completedAt.toISOString().split('T')[0] === ds)) consecutive++;
    else break;
  }
  if (consecutive >= 4) { score -= 20; factors.push(`${consecutive} дней подряд без отдыха`); }

  // Nutrition deficit
  if (nutritionTargets && todayMeals.length > 0) {
    const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    if (prot < nutritionTargets.protein * 0.6) { score -= 10; factors.push('Дефицит белка'); }
    if (cal < nutritionTargets.calories * 0.7) { score -= 10; factors.push('Дефицит калорий'); }
  }

  // Sleep quality
  if (sleepEntries && sleepEntries.length > 0) {
    const avgSleep = sleepEntries.slice(0, 3).reduce((s, e) => s + e.durationHours, 0) / Math.min(3, sleepEntries.length);
    if (avgSleep < 6) { score -= 20; factors.push(`Недостаточный сон (${avgSleep.toFixed(1)}ч)`); }
    else if (avgSleep < 7) { score -= 10; factors.push(`Сон меньше нормы (${avgSleep.toFixed(1)}ч)`); }
  }

  // Weight variance (stress indicator)
  if (bodyWeightHistory.length >= 3) {
    const last3 = bodyWeightHistory.slice(0, 3).map((b) => b.weightKg);
    const variance = Math.max(...last3) - Math.min(...last3);
    if (variance > 2) { score -= 10; factors.push(`Колебания веса ±${variance.toFixed(1)} кг`); }
  }

  score = Math.max(0, Math.min(100, score));
  if (score >= 85 && factors.length === 0) return '';

  const emoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
  const status = score >= 70 ? 'Хорошее восстановление' : score >= 40 ? 'Умеренная усталость' : 'Высокая усталость';
  const lines = [`\n## 🔋 ВОССТАНОВЛЕНИЕ\n${emoji} Score: ${score}/100 — ${status}`];
  if (factors.length) lines.push(`Факторы: ${factors.join(', ')}`);
  if (score < 40) lines.push('→ РЕКОМЕНДУЙ лёгкий день или отдых. Не предлагай тяжёлых тренировок.');
  else if (score < 70) lines.push('→ Рекомендуй снизить интенсивность, напомни про сон и питание.');

  return lines.join('\n');
}

function buildMacroBalanceBlock(data: ChatContextData): string {
  const { todayMeals, nutritionTargets } = data;
  if (todayMeals.length === 0 || !nutritionTargets) return '';

  const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
  const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
  const fats = todayMeals.reduce((s, m) => s + m.totalFats, 0);
  const carbs = todayMeals.reduce((s, m) => s + m.totalCarbs, 0);

  const calPct = Math.round((cal / nutritionTargets.calories) * 100);
  const protPct = Math.round((prot / nutritionTargets.protein) * 100);

  const alerts: string[] = [];
  const hour = new Date().getHours();
  if (hour >= 14 && prot < nutritionTargets.protein * 0.4) {
    alerts.push(`⚠️ ВНИМАНИЕ: белок только ${Math.round(prot)}г из ${nutritionTargets.protein}г — уже вторая половина дня. ОБЯЗАТЕЛЬНО упомяни!`);
  }
  if (hour >= 18 && cal < nutritionTargets.calories * 0.5) {
    alerts.push(`⚠️ Калории: ${Math.round(cal)}/${nutritionTargets.calories} ккал (${calPct}%) — вечер, норма недобрана. Напомни про питание.`);
  }

  const lines = [
    `\n## 🍽️ МАКРОСЫ СЕГОДНЯ`,
    `${Math.round(cal)} ккал (${calPct}%) | Б: ${Math.round(prot)}г (${protPct}%) | Ж: ${Math.round(fats)}г | У: ${Math.round(carbs)}г`,
  ];
  if (alerts.length) lines.push(...alerts);

  return lines.join('\n');
}

function buildNutritionGapsBlock(data: ChatContextData): string {
  const { todayMeals, user } = data;
  if (todayMeals.length < 2) return '';

  const allItems = todayMeals.flatMap((m) => (m.items ?? []).map((i) => i.name.toLowerCase()));
  if (allItems.length === 0) return '';

  const gaps: string[] = [];

  const hasProtein = allItems.some((n) => /курица|мясо|рыба|говядин|яйц|творог|тунец|лосось|индейк/i.test(n));
  if (!hasProtein) gaps.push('Нет очевидных белковых продуктов');

  const hasVeggies = allItems.some((n) => /салат|овощ|помидор|огурец|брокколи|шпинат|капуст|морков/i.test(n));
  if (!hasVeggies) gaps.push('Нет овощей/клетчатки');

  const hasHealthyFats = allItems.some((n) => /авокадо|орех|миндаль|лосось|оливк|семена|льн/i.test(n));
  if (!hasHealthyFats) gaps.push('Нет источников полезных жиров (омега-3)');

  if (user?.goal === 'MUSCLE_GAIN') {
    const avgProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0) / todayMeals.length;
    if (avgProt < 25) gaps.push(`Мало белка на приём (${Math.round(avgProt)}г, нужно 30+г)`);
  }

  if (gaps.length === 0) return '';
  return `\n## 🥗 ПРОБЕЛЫ В ПИТАНИИ\n${gaps.map((g) => `- ❌ ${g}`).join('\n')}\n→ Мягко предложи улучшения если тема питания затрагивается.`;
}

function buildMealTimingBlock(data: ChatContextData): string {
  const { todayMeals, recentWorkouts } = data;
  if (todayMeals.length === 0) return '';

  const lastWorkout = recentWorkouts[0];
  if (!lastWorkout?.completedAt) return '';

  const workoutEnd = new Date(lastWorkout.completedAt).getTime();
  const mealAfter = todayMeals
    .filter((m) => new Date(m.createdAt).getTime() > workoutEnd)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  if (!mealAfter) {
    const hoursSince = (Date.now() - workoutEnd) / 3_600_000;
    if (hoursSince > 1.5 && hoursSince < 24) {
      return `\n## ⏱️ ПИТАНИЕ ПОСЛЕ ТРЕНИРОВКИ\n⚠️ Тренировка ${Math.round(hoursSince)} часов назад — нет записи еды после. Уточни: закрыл ли пользователь белковое окно?`;
    }
  }

  return '';
}

function buildFrequencyBlock(data: ChatContextData): string {
  const { recentWorkouts, user } = data;
  if (recentWorkouts.length < 2) return '';

  const timestamps = recentWorkouts
    .filter((w) => w.completedAt)
    .map((w) => new Date(w.completedAt!).getTime())
    .sort((a, b) => b - a);

  if (timestamps.length < 2) return '';

  const gaps = timestamps.slice(0, -1).map((t, i) => (t - timestamps[i + 1]) / 86_400_000);
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;

  const goalOptimal: Record<string, { min: number; max: number }> = {
    MUSCLE_GAIN: { min: 3, max: 5 },
    WEIGHT_LOSS: { min: 3, max: 5 },
    STRENGTH: { min: 3, max: 4 },
    ENDURANCE: { min: 4, max: 6 },
    MAINTAIN: { min: 3, max: 4 },
  };

  const optimal = user?.goal ? goalOptimal[user.goal] : null;
  if (!optimal) return '';

  const lines = [`\n## 📅 ЧАСТОТА ТРЕНИРОВОК\n${weekCount} тр/нед | Среднее между тренировками: ${avgGap.toFixed(1)} дн`];

  if (weekCount < optimal.min) {
    lines.push(`⚠️ Меньше оптимума (${optimal.min}-${optimal.max}/нед для цели "${user?.goal}"). Предложи добавить тренировки.`);
  } else if (weekCount > optimal.max) {
    lines.push(`⚠️ Выше оптимума (${weekCount} vs ${optimal.max} макс). Уточни про восстановление.`);
  }

  return lines.join('\n');
}

function buildBodyCompBlock(data: ChatContextData): string {
  const { bodyWeightHistory, user } = data;
  if (bodyWeightHistory.length < 2) return '';

  const sorted = [...bodyWeightHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const deltaDays = (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / 86_400_000;
  const deltaWeight = newest.weightKg - oldest.weightKg;
  const weeklyRate = deltaDays > 0 ? (deltaWeight / deltaDays) * 7 : 0;

  const lines = [
    `\n## ⚖️ ДИНАМИКА ВЕСА\n${oldest.weightKg} → ${newest.weightKg} кг (${deltaWeight >= 0 ? '+' : ''}${deltaWeight.toFixed(1)} кг за ${Math.round(deltaDays)} дн)`,
    `Темп: ${weeklyRate >= 0 ? '+' : ''}${weeklyRate.toFixed(2)} кг/нед`,
  ];

  if (user?.goal === 'MUSCLE_GAIN' && weeklyRate > 0.7) {
    lines.push('⚠️ Набор слишком быстрый (>0.7 кг/нед) — риск набора лишнего жира. Рекомендуй замедлить.');
  } else if (user?.goal === 'WEIGHT_LOSS' && weeklyRate < -1.0) {
    lines.push('⚠️ Похудение слишком быстрое (<-1 кг/нед) — риск потери мышц. Рекомендуй замедлить.');
  } else if (user?.goal === 'WEIGHT_LOSS' && weeklyRate > -0.1 && deltaDays > 14) {
    lines.push('→ Вес практически не меняется при цели "похудение". Обрати внимание на дефицит калорий.');
  }

  return lines.join('\n');
}

function buildMuscleSorenessBlock(data: ChatContextData): string {
  const { recentWorkouts } = data;
  if (recentWorkouts.length === 0) return '';

  const last = recentWorkouts[0];
  if (!last.completedAt) return '';

  const hoursSince = (Date.now() - new Date(last.completedAt).getTime()) / 3_600_000;

  if (hoursSince < 48) {
    const muscles = [...new Set(last.exercises.flatMap((ex) => ex.exercise?.primaryMuscles ?? []))];
    if (muscles.length > 0) {
      return `\n## 💪 КРЕПАТУРА\nПоследняя тренировка ${Math.round(hoursSince)}ч назад.\nРаботали: ${muscles.join(', ')}\n→ Возможна крепатура. Если пользователь жалуется на боль — уточни, это крепатура или острая боль.`;
    }
  }

  return '';
}

function buildMotivationBlock(data: ChatContextData): string {
  const { recentWorkouts } = data;
  if (recentWorkouts.length === 0) return '';

  const lastWorkout = recentWorkouts[0];
  const daysSince = lastWorkout.completedAt
    ? Math.floor((Date.now() - new Date(lastWorkout.completedAt).getTime()) / 86_400_000)
    : null;

  const lines: string[] = [];

  if (daysSince !== null && daysSince >= 5) {
    lines.push(`\n## 💬 КОНТЕКСТ МОТИВАЦИИ\n⚠️ Пользователь не тренировался ${daysSince} дней. Последняя: "${lastWorkout.name}". Мягко спроси что случилось, предложи лёгкую возвращающую тренировку.`);
  }

  return lines.join('\n');
}

function buildTechniqueHintBlock(data: ChatContextData): string {
  const { message } = data;

  const CUES: Record<string, string> = {
    'жим лёжа': 'Лопатки сведены и прижаты → локти ~75° → опускай на нижнюю часть груди',
    'приседания': 'Раздвигай пол ногами → грудь вверх → вес на всей стопе → до параллели или ниже',
    'становая тяга': 'Штанга у голеней → спина нейтральная → тяни ногами, руки как крюки',
    'подтягивания': 'Лопатки вниз до подъёма → тяни локти к бёдрам → полная амплитуда',
    'жим стоя': 'Ягодицы и пресс напряжены → хват чуть шире плеч → штанга над серединой стопы',
    'тяга': 'Наклон ~45° → лопатки в верхней точке → контроль негативной фазы',
  };

  const msg = message.toLowerCase();
  const hints: string[] = [];
  for (const [exercise, cue] of Object.entries(CUES)) {
    if (msg.includes(exercise)) hints.push(`**${exercise}**: ${cue}`);
  }

  if (hints.length === 0) return '';
  return `\n## 🎯 ТЕХНИКА (упоминается в вопросе)\n${hints.join('\n')}`;
}

function buildInjuryZoneBlock(data: ChatContextData): string {
  const { user, message } = data;
  const restrictions = user?.healthRestrictions ?? [];

  const INJURY_SUBSTITUTIONS: Record<string, string[]> = {
    'плеч': ['Жим штанги → гантели/Смит', 'Тяга к подбородку → лицевая тяга', 'Отжимания на брусьях → отжимания от скамьи'],
    'колен': ['Приседания → жим ногами', 'Выпады → разгибания', 'Бег → велосипед/эллипс'],
    'поясниц': ['Становая → гиперэкстензия', 'Скруглённые → Romanian DL', 'Тяга в наклоне → тяга в тренажёре'],
    'запястьях': ['Жим штанги → гантели нейтральный хват', 'Отжимания → на кулаках'],
  };

  const lines: string[] = [];

  const injuredZones = restrictions.map((r) => (r.bodyPart ?? r.description ?? '').toLowerCase());

  // Also check message for mentioned body parts
  const BODY_PARTS = ['плеч', 'колен', 'поясниц', 'запястьях', 'спин', 'шейн'];
  for (const part of BODY_PARTS) {
    if (message.toLowerCase().includes(part) || injuredZones.some((z) => z.includes(part))) {
      const subs = Object.entries(INJURY_SUBSTITUTIONS).find(([key]) => part.startsWith(key.slice(0, 4)))?.[1];
      if (subs) lines.push(`Замены при проблеме с "${part}": ${subs.slice(0, 2).join(', ')}`);
    }
  }

  if (lines.length === 0) return '';
  return `\n## 🩺 ЗАМЕНЫ УПРАЖНЕНИЙ (травмы/ограничения)\n${lines.join('\n')}`;
}

async function buildGamificationBlock(data: ChatContextData): Promise<string> {
  const { userId, todayDate } = data;

  try {
    const workouts = await prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
      take: 400,
    });

    if (workouts.length === 0) return '';

    // Calculate streak
    const today = new Date(todayDate + 'T00:00:00.000Z');
    const trainingDays = new Set(
      workouts.filter((w) => w.completedAt).map((w) => w.completedAt!.toISOString().split('T')[0])
    );

    let streak = 0;
    const check = new Date(today);
    if (!trainingDays.has(check.toISOString().split('T')[0])) {
      check.setDate(check.getDate() - 1);
    }
    while (trainingDays.has(check.toISOString().split('T')[0])) {
      streak++;
      check.setDate(check.getDate() - 1);
    }

    const total = workouts.length;
    const milestones = [10, 25, 50, 100, 200, 500].filter((m) => total >= m);
    const nextMilestone = [10, 25, 50, 100, 200, 500].find((m) => m > total);

    const lines = [`\n## 🏆 ДОСТИЖЕНИЯ\nСтрик: ${streak} дн | Всего тренировок: ${total}`];
    if (milestones.length > 0) lines.push(`Достигнуто: ${milestones.map((m) => `${m} тр`).join(', ')}`);
    if (nextMilestone) lines.push(`До следующей вехи: ${nextMilestone - total} тренировок`);
    if (streak >= 7) lines.push(`🔥 Отличный стрик ${streak} дней! Обязательно отметь это.`);
    if (streak === 0 && total > 5) lines.push(`→ Стрик прерван. Мотивируй вернуться.`);

    return lines.join('\n');
  } catch {
    return '';
  }
}

async function buildMemoryBlock(data: ChatContextData): Promise<string> {
  const { userId, user } = data;

  try {
    const memories = await prisma.aIMemory.findMany({
      where: { userId, confidence: { gte: 0.4 } },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: 15,
      select: { category: true, key: true, value: true },
    });

    if (memories.length === 0) return '';

    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(`${m.key}: ${m.value}`);
    }

    const lines = ['\n## 🧠 ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ (из прошлых сессий)'];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`${cat}: ${items.join(', ')}`);
    }
    lines.push('→ Используй эти данные для персонализации. Не упоминай что "помнишь это из прошлых разговоров".');

    return lines.join('\n');
  } catch {
    return '';
  }
}
