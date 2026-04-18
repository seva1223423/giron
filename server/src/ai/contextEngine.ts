/**
 * Context Engine — intent-aware, selective context builder.
 *
 * Replaces the "compute everything" approach with targeted context:
 * each intent gets a focused set of context blocks computed on-demand.
 *
 * Performance: instead of ~1 800 functions running per request,
 * only the relevant builders execute, then optimizeContext picks the
 * best fit within the token budget.
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
    age?: number | null;
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  MUSCLE_GAIN: 'набор массы',
  WEIGHT_LOSS: 'похудение',
  MAINTAIN: 'поддержание формы',
  STRENGTH: 'развитие силы',
  ENDURANCE: 'выносливость',
  GENERAL_FITNESS: 'общий фитнес',
  FLEXIBILITY: 'гибкость',
};

/** Epley formula: estimated 1-rep max */
function est1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
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
      // Only add nutrition context for food logs, not weight/water logs
      const msgLower = data.message.toLowerCase();
      const isFoodLog = /съел|поел|завтрак|обед|ужин|перекус|гречк|курица|творог|ккал|калори|белк|протеин|углевод|жир|порц|грамм|блюдо|продукт/i.test(msgLower);
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
      const macros = buildMacroBalanceBlock(data);
      if (macros) blocks.push(macros);
      break;
    }

    case 'complaint': {
      const recovery = buildRecoveryBlock(data);
      if (recovery) blocks.push(recovery);
      const soreness = buildMuscleSorenessBlock(data);
      if (soreness) blocks.push(soreness);
      const injury = buildInjuryZoneBlock(data);
      if (injury) blocks.push(injury);
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

// ─── Context Builders ─────────────────────────────────────────────────────────

function buildCoreStatsContext(data: ChatContextData): string {
  const lines: string[] = [];
  const { user, recentWorkouts, todayMeals, nutritionTargets, activeProgram, bodyWeightHistory } = data;

  if (user) {
    const goal = user.goal ? (GOAL_LABELS[user.goal] ?? user.goal) : 'не указана';
    const level = user.fitnessLevel ?? 'не указан';
    const profileParts = [`Цель: ${goal}`, `Уровень: ${level}`];
    if (user.weightKg) profileParts.push(`Вес: ${user.weightKg} кг`);
    if (user.heightCm) profileParts.push(`Рост: ${user.heightCm} см`);
    if (user.age) profileParts.push(`Возраст: ${user.age} лет`);
    if (user.trainingExperienceYears) profileParts.push(`Стаж: ${user.trainingExperienceYears} лет`);
    if (user.gender) profileParts.push(`Пол: ${user.gender === 'male' || user.gender === 'MALE' ? 'мужской' : 'женский'}`);
    lines.push(`## ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ\n${profileParts.join(' | ')}`);

    if (user.healthRestrictions && user.healthRestrictions.length > 0) {
      const zones = user.healthRestrictions.map((r) => r.bodyPart ?? r.description ?? '').filter(Boolean);
      if (zones.length) lines.push(`⚠️ Ограничения здоровья: ${zones.join(', ')} — учитывай при рекомендациях`);
    }
  }

  if (activeProgram) {
    lines.push(`Активная программа: "${activeProgram.name}" (${activeProgram.type ?? '?'}, ${activeProgram.daysPerWeek ?? '?'} дн/нед, уровень: ${activeProgram.level ?? '?'})`);
  }

  if (recentWorkouts.length > 0) {
    const last = recentWorkouts[0];
    const date = last.completedAt ? new Date(last.completedAt).toLocaleDateString('ru-RU') : '?';
    const daysSince = last.completedAt
      ? Math.floor((Date.now() - new Date(last.completedAt).getTime()) / 86_400_000)
      : null;
    const daysAgoStr = daysSince !== null
      ? (daysSince === 0 ? 'сегодня' : daysSince === 1 ? 'вчера' : `${daysSince} дн назад`)
      : '';
    lines.push(`\n## ПОСЛЕДНЯЯ ТРЕНИРОВКА\n${last.name} — ${date} (${daysAgoStr}), ${last.durationMinutes ?? '?'} мин`);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
    if (weekCount > 0) lines.push(`Тренировок за неделю: ${weekCount}`);
  } else {
    lines.push('\n## ТРЕНИРОВКИ\nНет завершённых тренировок.');
  }

  // Body weight recent trend (always useful)
  if (bodyWeightHistory.length >= 2) {
    const sorted = [...bodyWeightHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const newest = sorted[0];
    const oldest = sorted[Math.min(sorted.length - 1, 6)]; // last 7 entries max
    const deltaDays = (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / 86_400_000;
    const deltaWeight = newest.weightKg - oldest.weightKg;
    const sign = deltaWeight >= 0 ? '+' : '';
    if (deltaDays > 1) {
      lines.push(`Вес: ${newest.weightKg} кг (${sign}${deltaWeight.toFixed(1)} кг за ${Math.round(deltaDays)} дн)`);
    } else {
      lines.push(`Вес: ${newest.weightKg} кг`);
    }
  }

  if (todayMeals.length > 0) {
    const totalCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    const totalProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    lines.push(`\n## ПИТАНИЕ СЕГОДНЯ\n${Math.round(totalCal)} ккал | Белок: ${Math.round(totalProt)} г`);
    if (nutritionTargets) {
      const calPct = Math.round((totalCal / nutritionTargets.calories) * 100);
      const protPct = Math.round((totalProt / nutritionTargets.protein) * 100);
      lines.push(`Норма: ${calPct}% ккал, ${protPct}% белок (цель: ${nutritionTargets.calories} ккал, ${nutritionTargets.protein}г белка)`);
    }
  } else {
    lines.push('\n## ПИТАНИЕ СЕГОДНЯ\nДанных нет.');
  }

  return lines.join('\n');
}

function buildProgressiveOverloadBlock(data: ChatContextData): string {
  const { allCompletedExerciseSets } = data;
  if (!allCompletedExerciseSets || allCompletedExerciseSets.length === 0) return '';

  // Group by exercise: max weight + reps-at-max-weight per workout session
  const history = new Map<string, Array<{ date: number; maxWeight: number; maxReps: number; e1rm: number }>>();

  for (const we of allCompletedExerciseSets) {
    if (!we.workout.completedAt) continue;
    const name = we.exercise?.name;
    if (!name) continue;

    const completedSets = we.sets.filter((s) => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0);
    if (completedSets.length === 0) continue;

    const maxWeight = Math.max(...completedSets.map((s) => s.weight ?? 0));
    // Reps performed at or near max weight (within 5%)
    const repsAtMax = Math.max(
      ...completedSets
        .filter((s) => (s.weight ?? 0) >= maxWeight * 0.95)
        .map((s) => s.reps ?? 0),
    );
    const e1rm = est1RM(maxWeight, repsAtMax);

    if (!history.has(name)) history.set(name, []);
    history.get(name)!.push({
      date: new Date(we.workout.completedAt).getTime(),
      maxWeight,
      maxReps: repsAtMax,
      e1rm,
    });
  }

  const plateaus: string[] = [];
  const regressions: string[] = [];
  const progressions: string[] = [];

  for (const [exercise, sessions] of history) {
    if (sessions.length < 3) continue;
    sessions.sort((a, b) => a.date - b.date);
    const last3 = sessions.slice(-3);
    const w = last3.map((s) => s.maxWeight);
    const r = last3.map((s) => s.maxReps);
    const e = last3.map((s) => s.e1rm);

    const weightUp = w[2] > w[1] && w[1] >= w[0];
    const repsUp = Math.max(...w) - Math.min(...w) <= 2.5 && r[2] > r[1] && r[1] >= r[0];
    const e1rmUp = e[2] > e[0] + 2;
    const plateau = Math.max(...e) - Math.min(...e) <= 3;
    const regression = w[2] < w[0] - 2.5;

    if (weightUp || repsUp || (e1rmUp && !plateau)) {
      const from = `${w[0]} кг × ${r[0]}`;
      const to = `${w[2]} кг × ${r[2]}`;
      progressions.push(`${exercise} (${from}→${to}, 1RM ~${e[2]} кг ✅)`);
    } else if (regression) {
      regressions.push(`${exercise} (${w[0]}→${w[2]} кг, 1RM ~${e[2]} кг ⛔)`);
    } else if (plateau) {
      plateaus.push(`${exercise} (${w[2]} кг × ${r[2]}, 1RM ~${e[2]} кг × 3 тр ⚠️)`);
    }
  }

  if (plateaus.length === 0 && regressions.length === 0 && progressions.length === 0) return '';

  const lines = ['\n## 📊 ПРОГРЕССИВНАЯ ПЕРЕГРУЗКА'];
  if (progressions.length) lines.push(`✅ Прогресс: ${progressions.slice(0, 5).join(', ')}`);
  if (plateaus.length) {
    lines.push(`⚠️ Плато (нет роста 3+ тренировки): ${plateaus.join(', ')}`);
    lines.push('→ Предложи: +1.25 кг или +1 повтор, смену диапазона, rest-pause, microload, или deload.');
  }
  if (regressions.length) {
    lines.push(`⛔ Регресс: ${regressions.join(', ')}`);
    lines.push('→ ОБЯЗАТЕЛЬНО обрати внимание: вероятные причины — недосып, дефицит калорий/белка, перетренированность.');
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

  return `\n## ⚖️ МЫШЕЧНЫЙ БАЛАНС\nДоминирующие: ${top.join(', ')}\n⚠️ Слабо нагружены: ${neglected.join(', ')}\n→ Рекомендуй добавить акцент на отстающие группы.`;
}

function buildRecoveryBlock(data: ChatContextData): string {
  const { recentWorkouts, todayMeals, nutritionTargets, bodyWeightHistory, sleepEntries } = data;

  let score = 100;
  const factors: string[] = [];

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSessions = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
  if (weekSessions >= 6) { score -= 25; factors.push(`${weekSessions} тренировок за неделю`); }
  else if (weekSessions >= 5) { score -= 10; factors.push(`5 тренировок за неделю`); }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (recentWorkouts.some((w) => w.completedAt && new Date(w.completedAt) >= yesterday)) {
    score -= 15;
    factors.push('Тренировка менее 24ч назад');
  }

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

  if (nutritionTargets && todayMeals.length > 0) {
    const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    if (prot < nutritionTargets.protein * 0.6) { score -= 10; factors.push(`Дефицит белка (${Math.round(prot)}/${nutritionTargets.protein}г)`); }
    if (cal < nutritionTargets.calories * 0.7) { score -= 10; factors.push(`Дефицит калорий (${Math.round(cal)}/${nutritionTargets.calories} ккал)`); }
  }

  if (sleepEntries && sleepEntries.length > 0) {
    const recent = sleepEntries.slice(0, 3);
    const avgSleep = recent.reduce((s, e) => s + e.durationHours, 0) / recent.length;
    if (avgSleep < 6) { score -= 20; factors.push(`Недостаточный сон (${avgSleep.toFixed(1)}ч)`); }
    else if (avgSleep < 7) { score -= 10; factors.push(`Сон меньше нормы (${avgSleep.toFixed(1)}ч)`); }
    const withQuality = recent.filter((e) => e.quality != null);
    if (withQuality.length > 0) {
      const avgQ = withQuality.reduce((s, e) => s + (e.quality ?? 0), 0) / withQuality.length;
      if (avgQ <= 2) { score -= 10; factors.push('Плохое качество сна'); }
    }
  }

  if (bodyWeightHistory.length >= 3) {
    const last3 = bodyWeightHistory.slice(0, 3).map((b) => b.weightKg);
    const variance = Math.max(...last3) - Math.min(...last3);
    if (variance > 2) { score -= 5; factors.push(`Колебания веса ±${variance.toFixed(1)} кг`); }
  }

  score = Math.max(0, Math.min(100, score));
  if (score >= 85 && factors.length === 0) return '';

  const emoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
  const status = score >= 70 ? 'Хорошее восстановление' : score >= 40 ? 'Умеренная усталость' : 'Высокая усталость — нужен отдых';
  const lines = [`\n## 🔋 ВОССТАНОВЛЕНИЕ\n${emoji} ${score}/100 — ${status}`];
  if (factors.length) lines.push(`Факторы: ${factors.join(' | ')}`);
  if (score < 40) lines.push('→ ВАЖНО: рекомендуй лёгкий активный отдых. Тяжёлая тренировка сегодня = перетренированность.');
  else if (score < 70) lines.push('→ Снизь интенсивность на 15-20%, приоритет — сон и белок.');

  return lines.join('\n');
}

function buildMacroBalanceBlock(data: ChatContextData): string {
  const { todayMeals, nutritionTargets } = data;
  if (todayMeals.length === 0) return '';

  const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
  const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
  const fats = todayMeals.reduce((s, m) => s + m.totalFats, 0);
  const carbs = todayMeals.reduce((s, m) => s + m.totalCarbs, 0);

  const lines = [
    `\n## 🍽️ МАКРОСЫ СЕГОДНЯ`,
    `${Math.round(cal)} ккал | Б: ${Math.round(prot)}г | Ж: ${Math.round(fats)}г | У: ${Math.round(carbs)}г`,
  ];

  if (nutritionTargets) {
    const calPct = Math.round((cal / nutritionTargets.calories) * 100);
    const protPct = Math.round((prot / nutritionTargets.protein) * 100);
    lines.push(`Выполнено: ${calPct}% ккал, ${protPct}% белок`);

    const hour = new Date().getHours();
    if (hour >= 14 && prot < nutritionTargets.protein * 0.4) {
      lines.push(`⚠️ КРИТИЧНО: белок ${Math.round(prot)}г из ${nutritionTargets.protein}г — уже ${hour}:00, а норма не закрыта на 40%. ОБЯЗАТЕЛЬНО упомяни!`);
    } else if (hour >= 18 && cal < nutritionTargets.calories * 0.5) {
      lines.push(`⚠️ Калории ${Math.round(cal)}/${nutritionTargets.calories} ккал — вечер, норма ниже 50%. Напомни про питание.`);
    }
  }

  return lines.join('\n');
}

function buildNutritionGapsBlock(data: ChatContextData): string {
  const { todayMeals, user } = data;
  if (todayMeals.length < 2) return '';

  const allItems = todayMeals.flatMap((m) => (m.items ?? []).map((i) => i.name.toLowerCase()));
  if (allItems.length === 0) return '';

  const gaps: string[] = [];

  if (!allItems.some((n) => /курица|мясо|рыба|говядин|яйц|творог|тунец|лосось|индейк|свинин|говяжий/i.test(n))) {
    gaps.push('Нет белковых продуктов (курица/мясо/рыба/творог)');
  }
  if (!allItems.some((n) => /салат|овощ|помидор|огурец|брокколи|шпинат|капуст|морков|перец|кабачок/i.test(n))) {
    gaps.push('Нет овощей/клетчатки');
  }
  if (!allItems.some((n) => /авокадо|орех|миндаль|лосось|оливк|семена|льн|кешью|грецк/i.test(n))) {
    gaps.push('Нет источников полезных жиров');
  }

  if (user?.goal === 'MUSCLE_GAIN') {
    const avgProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0) / todayMeals.length;
    if (avgProt < 25) gaps.push(`Мало белка на приём (~${Math.round(avgProt)}г, нужно 30+г)`);
  }

  if (gaps.length === 0) return '';
  return `\n## 🥗 ПРОБЕЛЫ В РАЦИОНЕ\n${gaps.map((g) => `- ❌ ${g}`).join('\n')}\n→ Упомяни при обсуждении питания.`;
}

function buildMealTimingBlock(data: ChatContextData): string {
  const { todayMeals, recentWorkouts } = data;

  const lastWorkout = recentWorkouts[0];
  if (!lastWorkout?.completedAt) return '';

  const workoutEnd = new Date(lastWorkout.completedAt).getTime();
  const hoursSince = (Date.now() - workoutEnd) / 3_600_000;

  // Check within 36h window (could be yesterday's workout)
  if (hoursSince < 1.5 || hoursSince > 36) return '';

  const mealAfter = todayMeals
    .filter((m) => new Date(m.createdAt).getTime() > workoutEnd)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  if (!mealAfter) {
    return `\n## ⏱️ ПИТАНИЕ ПОСЛЕ ТРЕНИРОВКИ\n⚠️ Тренировка "${lastWorkout.name}" — ${Math.round(hoursSince)}ч назад. Нет записи еды после. Спроси: закрыл ли белковое окно?`;
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
    MAINTAIN: { min: 2, max: 4 },
    GENERAL_FITNESS: { min: 3, max: 5 },
    FLEXIBILITY: { min: 3, max: 6 },
  };

  const optimal = user?.goal ? goalOptimal[user.goal] : null;
  if (!optimal) return '';

  const goalLabel = user?.goal ? (GOAL_LABELS[user.goal] ?? user.goal) : '?';
  const lines = [`\n## 📅 ЧАСТОТА ТРЕНИРОВОК\n${weekCount} тр/нед | Среднее между тренировками: ${avgGap.toFixed(1)} дн`];

  if (weekCount < optimal.min) {
    lines.push(`⚠️ Ниже оптимума для "${goalLabel}" (нужно ${optimal.min}-${optimal.max}/нед). Предложи добавить тренировку.`);
  } else if (weekCount > optimal.max) {
    lines.push(`⚠️ Выше оптимума (${weekCount} vs ${optimal.max} макс для "${goalLabel}"). Уточни про восстановление.`);
  } else {
    lines.push(`✅ Частота в норме для цели "${goalLabel}".`);
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
  if (deltaDays < 1) return '';

  const deltaWeight = newest.weightKg - oldest.weightKg;
  const weeklyRate = (deltaWeight / deltaDays) * 7;

  const lines = [
    `\n## ⚖️ ДИНАМИКА ВЕСА\n${oldest.weightKg} → ${newest.weightKg} кг (${deltaWeight >= 0 ? '+' : ''}${deltaWeight.toFixed(1)} кг за ${Math.round(deltaDays)} дн)`,
    `Темп: ${weeklyRate >= 0 ? '+' : ''}${weeklyRate.toFixed(2)} кг/нед`,
  ];

  if (user?.goal === 'MUSCLE_GAIN') {
    if (weeklyRate > 0.7) lines.push('⚠️ Набор >0.7 кг/нед — риск избыточного жира. Рекомендуй снизить профицит.');
    else if (weeklyRate < 0.1 && deltaDays > 14) lines.push('→ Набор почти нулевой — нужен умеренный профицит (~200-300 ккал).');
  } else if (user?.goal === 'WEIGHT_LOSS') {
    if (weeklyRate < -1.0) lines.push('⚠️ Похудение >1 кг/нед — риск потери мышц. Рекомендуй замедлить до 0.5-0.7 кг/нед.');
    else if (weeklyRate > -0.1 && deltaDays > 14) lines.push('→ Вес не меняется при цели похудения — нужен дефицит калорий (300-500 ккал).');
    else if (weeklyRate >= -0.7 && weeklyRate <= -0.1) lines.push('✅ Темп похудения в норме.');
  }

  return lines.join('\n');
}

function buildMuscleSorenessBlock(data: ChatContextData): string {
  const { recentWorkouts } = data;
  if (recentWorkouts.length === 0) return '';

  const last = recentWorkouts[0];
  if (!last.completedAt) return '';

  const hoursSince = (Date.now() - new Date(last.completedAt).getTime()) / 3_600_000;

  if (hoursSince < 72) {
    const muscles = [...new Set(last.exercises.flatMap((ex) => ex.exercise?.primaryMuscles ?? []))];
    if (muscles.length > 0) {
      return `\n## 💪 КРЕПАТУРА / НАГРУЗКА\nПоследняя тренировка "${last.name}" — ${Math.round(hoursSince)}ч назад.\nНагружались: ${muscles.join(', ')}\n→ Если жалуется на боль — уточни: крепатура (разлитая, 24-72ч) или острая боль (локальная, при движении)?`;
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

  if (daysSince !== null && daysSince >= 5) {
    return `\n## 💬 КОНТЕКСТ МОТИВАЦИИ\n⚠️ Перерыв ${daysSince} дней. Последняя: "${lastWorkout.name}". Мягко спроси что случилось, предложи короткую возвращающую тренировку (20-30 мин, 60% нагрузки).`;
  }

  return '';
}

function buildTechniqueHintBlock(data: ChatContextData): string {
  const { message } = data;

  const CUES: Array<{ patterns: string[]; cue: string; label: string }> = [
    {
      patterns: ['жим лёж', 'bench press'],
      label: 'Жим лёжа',
      cue: 'Лопатки сведены и прижаты к скамье → локти ~75° от корпуса → штанга к нижней части груди → полный контакт стоп с полом',
    },
    {
      patterns: ['присед', 'squat'],
      label: 'Приседания',
      cue: 'Раздвигай пол ногами → грудь вверх, взгляд вперёд → вес равномерно на всей стопе → глубина до параллели или ниже',
    },
    {
      patterns: ['становая', 'deadlift', 'тяга с пол'],
      label: 'Становая тяга',
      cue: 'Штанга у голеней → спина нейтральная (не скруглять) → тяни ногами, руки как крюки → тазобедренный шарнир, не приседание',
    },
    {
      patterns: ['подтягиван', 'pull-up', 'подтянут'],
      label: 'Подтягивания',
      cue: 'Лопатки вниз и вперёд до начала подъёма → тяни локти к бёдрам → полная амплитуда (полное разгибание внизу)',
    },
    {
      patterns: ['жим стоя', 'overhead press', 'жим вверх', 'армейск жим'],
      label: 'Жим стоя',
      cue: 'Ягодицы и пресс напряжены → хват чуть шире плеч → штанга над серединой стопы → голова назад, пропуская штангу мимо лица',
    },
    {
      patterns: ['тяга в накло', 'bent over row', 'штанга к поясу'],
      label: 'Тяга в наклоне',
      cue: 'Наклон корпуса ~45° → лопатки сводить в верхней точке → тяни к пупку, не к груди → контроль негативной фазы',
    },
    {
      patterns: ['выпад', 'lunge'],
      label: 'Выпады',
      cue: 'Шаг широкий → переднее колено над стопой (не выходит вперёд) → корпус прямо → задним коленом почти касаешься пола',
    },
  ];

  const msg = message.toLowerCase();
  const hints: string[] = [];
  for (const { patterns, label, cue } of CUES) {
    if (patterns.some((p) => msg.includes(p))) {
      hints.push(`**${label}**: ${cue}`);
    }
  }

  if (hints.length === 0) return '';
  return `\n## 🎯 ТЕХНИКА (упоминается в вопросе)\n${hints.join('\n')}`;
}

function buildInjuryZoneBlock(data: ChatContextData): string {
  const { user, message } = data;

  const SUBSTITUTIONS: Record<string, { label: string; subs: string[] }> = {
    плеч: {
      label: 'плечо',
      subs: ['Жим штанги → жим гантелей (нейтральный хват)', 'Тяга к подбородку → лицевая тяга', 'Отжимания на брусьях → отжимания от скамьи с нейтральным хватом'],
    },
    колен: {
      label: 'колено',
      subs: ['Приседания → жим ногами в тренажёре', 'Выпады → разгибания ног (осторожно)', 'Бег → велотренажёр/эллипс'],
    },
    поясниц: {
      label: 'поясница',
      subs: ['Становая → гиперэкстензия / Romanian DL', 'Тяга штанги в наклоне → тяга в тренажёре сидя', 'Приседания → жим ногами / гакк-присед'],
    },
    запястьях: {
      label: 'запястье',
      subs: ['Жим штанги → гантели нейтральный хват', 'Отжимания → на кулаках или рукоятях'],
    },
    локт: {
      label: 'локоть',
      subs: ['Трицепс штанга → канат на блоке', 'Жим узким → жим нейтральным хватом', 'Подъём на бицепс → молотковые сгибания'],
    },
    спин: {
      label: 'спина',
      subs: ['Любые осевые нагрузки → тренажёры', 'Становая/присед → сначала укрепляй кор (McGill Big 3)'],
    },
  };

  const msgLower = message.toLowerCase();
  const restrictions = user?.healthRestrictions ?? [];
  const injuredZones = restrictions.map((r) => (r.bodyPart ?? r.description ?? '').toLowerCase());

  const lines: string[] = [];
  const mentioned = new Set<string>();

  for (const [key, { label, subs }] of Object.entries(SUBSTITUTIONS)) {
    if (!mentioned.has(key) && (msgLower.includes(key) || injuredZones.some((z) => z.includes(key)))) {
      lines.push(`Замены при проблеме с ${label}: ${subs.slice(0, 2).join(', ')}`);
      mentioned.add(key);
    }
  }

  if (lines.length === 0) return '';
  return `\n## 🩺 ЗАМЕНЫ УПРАЖНЕНИЙ\n${lines.join('\n')}`;
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

    const trainingDays = new Set(
      workouts.filter((w) => w.completedAt).map((w) => w.completedAt!.toISOString().split('T')[0]),
    );

    let streak = 0;
    const check = new Date(todayDate + 'T00:00:00.000Z');
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
    if (nextMilestone) lines.push(`До вехи ${nextMilestone}: ещё ${nextMilestone - total} тренировок`);
    if (streak >= 7) lines.push(`🔥 Стрик ${streak} дней — обязательно отметь этот факт!`);
    if (streak === 0 && total > 5) lines.push('→ Стрик прерван — мотивируй вернуться сегодня.');

    return lines.join('\n');
  } catch {
    return '';
  }
}

async function buildMemoryBlock(data: ChatContextData): Promise<string> {
  const { userId } = data;

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

    const lines = ['\n## 🧠 ПЕРСОНАЛИЗАЦИЯ (из прошлых сессий)'];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`${cat}: ${items.join(', ')}`);
    }
    lines.push('→ Используй для персонализации. Не упоминай прямо "я помню из прошлых разговоров".');

    return lines.join('\n');
  } catch {
    return '';
  }
}
