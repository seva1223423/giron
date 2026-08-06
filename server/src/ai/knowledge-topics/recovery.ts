/**
 * knowledge-topics/recovery.ts — auto-split from knowledgeHelpers.ts
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

// Cross-topic imports (auto-added by fix-knowledge-topic-imports.py):
import { MesocyclePhase } from './cardio';
import { EXERCISE_SUBSTITUTIONS, OverloadStatus } from './training';

export function getSubstitutionAdvice(injuryZones: string[]): string {
  if (injuryZones.length === 0) return '';

  const lines: string[] = ['\n## 🔄 ЗАМЕНЫ УПРАЖНЕНИЙ (с учётом ограничений)'];
  lines.push(`Зоны дискомфорта: ${injuryZones.join(', ')}`);

  for (const [exercise, sub] of Object.entries(EXERCISE_SUBSTITUTIONS)) {
    const affectedZones = sub.reason.split('/');
    if (affectedZones.some((z) => injuryZones.includes(z))) {
      lines.push(`- ❌ ${exercise} → ✅ ${sub.alternatives.slice(0, 2).join(' / ')}`);
    }
  }

  if (lines.length > 2) {
    lines.push('\n→ При создании тренировок/программ ИСПОЛЬЗУЙ замены из списка выше.');
    return lines.join('\n');
  }
  return '';
}
export function estimateRecoveryScore(
  recentWorkouts: Array<{ completedAt: Date | null; exercises: Array<{ sets: Array<{ completed: boolean }> }> }>,
  bodyWeightHistory: Array<{ weightKg: number; date: Date }>,
  todayMeals: Array<{ totalCalories: number; totalProtein: number }>,
  nutritionTargets?: { calories: number; protein: number } | null,
): { score: number; factors: string[] } {
  let score = 100; // start at 100, subtract for negative factors
  const factors: string[] = [];

  // Factor 1: Training frequency last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSessions = recentWorkouts.filter(
    (w) => w.completedAt && new Date(w.completedAt) >= weekAgo
  ).length;

  if (weekSessions >= 6) {
    score -= 25;
    factors.push('Высокая частота тренировок (6+ за неделю) — риск перетренированности');
  } else if (weekSessions >= 5) {
    score -= 10;
    factors.push('5 тренировок за неделю — на грани');
  }

  // Factor 2: Training in last 24h
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const trainedRecently = recentWorkouts.some(
    (w) => w.completedAt && new Date(w.completedAt) >= oneDayAgo
  );
  if (trainedRecently) {
    score -= 15;
    factors.push('Тренировка менее 24ч назад');
  }

  // Factor 3: Consecutive training days
  let consecutiveDays = 0;
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(today);
    checkDate.setUTCDate(checkDate.getUTCDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    const trained = recentWorkouts.some(
      (w) => w.completedAt && w.completedAt.toISOString().split('T')[0] === dateStr
    );
    if (trained) consecutiveDays++;
    else break;
  }
  if (consecutiveDays >= 4) {
    score -= 20;
    factors.push(`${consecutiveDays} дней подряд без отдыха`);
  }

  // Factor 4: Nutrition quality (if data available)
  if (nutritionTargets && todayMeals.length > 0) {
    const totalProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const totalCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    if (totalProt < nutritionTargets.protein * 0.6) {
      score -= 10;
      factors.push('Низкое потребление белка');
    }
    if (totalCal < nutritionTargets.calories * 0.7) {
      score -= 10;
      factors.push('Недобор калорий');
    }
  }

  // Factor 5: Weight fluctuation (stress indicator)
  if (bodyWeightHistory.length >= 3) {
    const last3 = bodyWeightHistory.slice(0, 3).map((bw) => bw.weightKg);
    const variance = Math.max(...last3) - Math.min(...last3);
    if (variance > 2) {
      score -= 10;
      factors.push(`Сильные колебания веса (±${variance.toFixed(1)} кг за 3 взвешивания)`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}
export function buildRecoveryContext(recovery: { score: number; factors: string[] }): string {
  if (recovery.score >= 80 && recovery.factors.length === 0) return '';

  const emoji = recovery.score >= 70 ? '🟢' : recovery.score >= 40 ? '🟡' : '🔴';
  const status = recovery.score >= 70 ? 'Хорошее восстановление' : recovery.score >= 40 ? 'Умеренная усталость' : 'Высокая усталость';

  const lines: string[] = [
    `\n## 🔋 ОЦЕНКА ВОССТАНОВЛЕНИЯ`,
    `${emoji} Score: ${recovery.score}/100 — ${status}`,
  ];

  if (recovery.factors.length > 0) {
    lines.push('Факторы:');
    for (const f of recovery.factors) {
      lines.push(`- ${f}`);
    }
  }

  if (recovery.score < 40) {
    lines.push('→ ОБЯЗАТЕЛЬНО рекомендуй лёгкий день или полный отдых. Не предлагай тяжёлых тренировок.');
  } else if (recovery.score < 70) {
    lines.push('→ Рекомендуй снизить интенсивность или объём. Упомяни важность сна и питания.');
  }

  return lines.join('\n');
}
export interface DeloadRecommendation {
  shouldDeload: boolean;
  reason: string;
  weeksSinceDeload: number;
  suggestedAction: string;
}
/**
 * Analyze training history to determine if the user needs a deload week.
 * Factors:
 * 1. Weeks of continuous training without deload (>4-6 weeks = likely needs one)
 * 2. Plateaus across multiple exercises
 * 3. Volume/intensity trends (consecutive increases = accumulated fatigue)
 * 4. Recovery score trend
 */
export function detectDeloadNeed(
  recentWorkouts: Array<{ name: string; completedAt: Date | null; totalVolume: number | null }>,
  overloadData: OverloadStatus[],
  recoveryScore: number,
): DeloadRecommendation {
  const now = Date.now();
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  // Count consecutive weeks with training
  let consecutiveWeeks = 0;
  for (let w = 0; w < 8; w++) {
    const weekStart = now - (w + 1) * MS_PER_WEEK;
    const weekEnd = now - w * MS_PER_WEEK;
    const workoutsInWeek = recentWorkouts.filter((wo) => {
      const t = wo.completedAt ? wo.completedAt.getTime() : 0;
      return t >= weekStart && t < weekEnd;
    });
    if (workoutsInWeek.length >= 2) {
      consecutiveWeeks++;
    } else {
      break; // found a rest/deload week
    }
  }

  // Check for volume trend (are last 3 weeks showing increasing or flat-high volume?)
  const weeklyVolumes: number[] = [];
  for (let w = 0; w < 4; w++) {
    const weekStart = now - (w + 1) * MS_PER_WEEK;
    const weekEnd = now - w * MS_PER_WEEK;
    const vol = recentWorkouts
      .filter((wo) => {
        const t = wo.completedAt ? wo.completedAt.getTime() : 0;
        return t >= weekStart && t < weekEnd;
      })
      .reduce((sum, wo) => sum + (wo.totalVolume || 0), 0);
    weeklyVolumes.push(vol);
  }

  // Count plateaus
  const plateauCount = overloadData.filter((o) => o.status === 'plateau').length;
  const regressionCount = overloadData.filter((o) => o.status === 'regressing').length;

  // Decision logic
  let shouldDeload = false;
  let reason = '';
  let suggestedAction = '';

  if (consecutiveWeeks >= 6) {
    shouldDeload = true;
    reason = `${consecutiveWeeks} недель подряд без разгрузки — накопленная усталость гарантирована`;
    suggestedAction = 'Рекомендуй deload неделю: сохранить упражнения, снизить вес на 40-50%, объём на 30-40%';
  } else if (consecutiveWeeks >= 4 && (plateauCount >= 2 || recoveryScore < 50)) {
    shouldDeload = true;
    reason = `${consecutiveWeeks} недель без отдыха + ${plateauCount >= 2 ? `плато в ${plateauCount} упражнениях` : `низкий recovery score (${recoveryScore})`}`;
    suggestedAction = 'Предложи облегчённую неделю: снизить рабочие веса на 30%, убрать изоляцию, оставить базовые';
  } else if (regressionCount >= 3) {
    shouldDeload = true;
    reason = `Регрессия в ${regressionCount} упражнениях — явный признак перетренированности`;
    suggestedAction = 'СРОЧНО рекомендуй полный отдых 3-5 дней или очень лёгкую восстановительную тренировку';
  } else if (consecutiveWeeks >= 4 && recoveryScore < 60 && weeklyVolumes[0] > weeklyVolumes[1]) {
    shouldDeload = true;
    reason = `Усталость при растущем объёме — классический сигнал для deload`;
    suggestedAction = 'Предложи следующую неделю сделать разгрузочной: те же упражнения, 60% от рабочих весов';
  }

  return {
    shouldDeload,
    reason,
    weeksSinceDeload: consecutiveWeeks,
    suggestedAction,
  };
}
export function buildDeloadContext(deload: DeloadRecommendation): string {
  if (!deload.shouldDeload) return '';

  return `\n## ⚠️ DELOAD РЕКОМЕНДАЦИЯ (ВАЖНО)
Причина: ${deload.reason}
Тренировочных недель подряд: ${deload.weeksSinceDeload}
→ ${deload.suggestedAction}
→ Объясни пользователю ЗАЧЕМ нужен deload (суперкомпенсация, адаптация ЦНС, профилактика травм).`;
}
export interface PeriodizationAdvice {
  currentPhase: MesocyclePhase;
  weekInPhase: number;
  suggestion: string;
}
/**
 * Analyze weekly volume trends to determine current training phase
 * and suggest next phase transitions.
 */
export function getPeriodizationAdvice(
  recentWorkouts: Array<{ completedAt: Date | null; totalVolume: number | null }>,
): PeriodizationAdvice {
  const now = Date.now();
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  // Calculate weekly volumes for last 6 weeks
  const weeklyVolumes: number[] = [];
  const weeklyWorkoutCounts: number[] = [];
  for (let w = 0; w < 6; w++) {
    const weekStart = now - (w + 1) * MS_PER_WEEK;
    const weekEnd = now - w * MS_PER_WEEK;
    const weekWorkouts = recentWorkouts.filter((wo) => {
      const t = wo.completedAt ? wo.completedAt.getTime() : 0;
      return t >= weekStart && t < weekEnd;
    });
    weeklyVolumes.push(weekWorkouts.reduce((sum, wo) => sum + (wo.totalVolume || 0), 0));
    weeklyWorkoutCounts.push(weekWorkouts.length);
  }

  // Reverse so [0] = oldest, [5] = most recent
  weeklyVolumes.reverse();
  weeklyWorkoutCounts.reverse();

  if (weeklyVolumes.filter((v) => v > 0).length < 3) {
    return { currentPhase: 'unknown', weekInPhase: 0, suggestion: '' };
  }

  // Detect volume trend
  const recent3 = weeklyVolumes.slice(-3);
  const isIncreasing = recent3[2] > recent3[1] && recent3[1] > recent3[0];
  const isDecreasing = recent3[2] < recent3[1] && recent3[1] < recent3[0];
  const isFlat = Math.abs(recent3[2] - recent3[0]) / Math.max(recent3[0], 1) < 0.1;

  // Determine average intensity (volume per workout)
  const recentAvgVolPerWorkout = weeklyWorkoutCounts[5] > 0
    ? weeklyVolumes[5] / weeklyWorkoutCounts[5]
    : 0;
  const olderAvgVolPerWorkout = weeklyWorkoutCounts[2] > 0
    ? weeklyVolumes[2] / weeklyWorkoutCounts[2]
    : 0;

  let currentPhase: MesocyclePhase = 'unknown';
  let weekInPhase = 0;
  let suggestion = '';

  if (isIncreasing) {
    currentPhase = 'accumulation';
    // Count consecutive increasing weeks
    for (let i = weeklyVolumes.length - 1; i > 0; i--) {
      if (weeklyVolumes[i] >= weeklyVolumes[i - 1]) weekInPhase++;
      else break;
    }

    if (weekInPhase >= 4) {
      suggestion = `Уже ${weekInPhase} недель нарастающего объёма. Рекомендуется перейти к фазе интенсификации: снизить объём на 20%, повысить рабочие веса на 5-10%.`;
    } else if (weekInPhase >= 3) {
      suggestion = `Фаза накопления (${weekInPhase} недель). Ещё 1-2 недели роста объёма, затем переход к интенсификации.`;
    }
  } else if (isDecreasing && recentAvgVolPerWorkout > olderAvgVolPerWorkout * 0.95) {
    // Volume down but intensity per workout up = intensification
    currentPhase = 'intensification';
    weekInPhase = 2;
    suggestion = `Фаза интенсификации: объём снижается, но интенсивность на тренировку растёт. Это хорошо — через 1-2 недели можно сделать deload.`;
  } else if (isDecreasing && recentAvgVolPerWorkout <= olderAvgVolPerWorkout * 0.7) {
    currentPhase = 'deload';
    weekInPhase = 1;
    suggestion = `Похоже на разгрузочную неделю. После неё — начинай новый мезоцикл с повышенными весами.`;
  } else if (isFlat) {
    currentPhase = 'accumulation';
    weekInPhase = 3;
    suggestion = `Объём стабильный — стагнация. Для прогресса нужно либо повышать объём на 5-10% в неделю, либо увеличить рабочие веса.`;
  }

  return { currentPhase, weekInPhase, suggestion };
}
export function buildRecoveryQuestionnaire(
  recoveryScore: number,
  hasAskedAboutSleep: boolean, // from AI memory
  fatigueStatus: string,
): string {
  if (recoveryScore >= 75 && fatigueStatus !== 'overreaching' && fatigueStatus !== 'dangerous') return '';

  const questions: string[] = [];

  if (!hasAskedAboutSleep) {
    questions.push('💤 Сколько часов ты обычно спишь? Ложишься/встаёшь в одно время?');
  }

  if (recoveryScore < 50) {
    questions.push('😰 Уровень стресса на работе/учёбе по шкале 1-10?');
    questions.push('💧 Сколько воды пьёшь в день?');
  }

  if (fatigueStatus === 'overreaching' || fatigueStatus === 'dangerous') {
    questions.push('🤕 Есть ли болезненность в суставах или мышцах, которая не проходит?');
    questions.push('📉 Заметил снижение мотивации или настроения?');
  }

  if (questions.length === 0) return '';

  return `\n\n## 🩺 ВОПРОСЫ О ВОССТАНОВЛЕНИИ (задай 1-2 если контекст подходит)
${questions.slice(0, 3).join('\n')}
→ Восстановление ${recoveryScore}%, усталость: ${fatigueStatus}. Нужна диагностика.`;
}
export interface MuscleRecoveryStatus {
  muscle: string;
  hoursSinceTraining: number;
  status: 'fresh' | 'recovering' | 'recovered' | 'detraining';
  readyToTrain: boolean;
}
export const RECOVERY_HOURS: Record<string, number> = {
  chest: 48, back: 48, shoulders: 48, quadriceps: 72,
  hamstrings: 72, glutes: 48, biceps: 36, triceps: 36,
  abs: 24, calves: 24, traps: 48, lats: 48,
  forearms: 24, lower_back: 72,
};
export function trackMuscleRecovery(
  recentWorkouts: Array<{
    completedAt: Date | null;
    exercises: Array<{ exercise: { primaryMuscles: string[] } }>;
  }>,
): MuscleRecoveryStatus[] {
  const muscleLastTrained: Record<string, Date> = {};

  for (const workout of recentWorkouts) {
    if (!workout.completedAt) continue;
    const completedDate = new Date(workout.completedAt);
    for (const ex of workout.exercises) {
      for (const muscle of ex.exercise?.primaryMuscles ?? []) {
        const m = muscle.toLowerCase();
        if (!muscleLastTrained[m] || completedDate > muscleLastTrained[m]) {
          muscleLastTrained[m] = completedDate;
        }
      }
    }
  }

  const now = Date.now();
  const results: MuscleRecoveryStatus[] = [];

  for (const [muscle, lastDate] of Object.entries(muscleLastTrained)) {
    const hoursSince = (now - lastDate.getTime()) / (1000 * 60 * 60);
    const recoveryTime = RECOVERY_HOURS[muscle] || 48;

    let status: MuscleRecoveryStatus['status'];
    if (hoursSince < 12) status = 'fresh';
    else if (hoursSince < recoveryTime) status = 'recovering';
    else if (hoursSince < recoveryTime * 3) status = 'recovered';
    else status = 'detraining';

    results.push({
      muscle,
      hoursSinceTraining: Math.round(hoursSince),
      status,
      readyToTrain: hoursSince >= recoveryTime,
    });
  }

  return results.sort((a, b) => a.hoursSinceTraining - b.hoursSinceTraining);
}
export function buildMuscleRecoveryContext(statuses: MuscleRecoveryStatus[]): string {
  if (statuses.length === 0) return '';

  const recovering = statuses.filter((s) => s.status === 'recovering');
  const recovered = statuses.filter((s) => s.status === 'recovered');
  const detraining = statuses.filter((s) => s.status === 'detraining');

  const lines: string[] = [];
  if (recovering.length > 0) {
    lines.push(`⏳ Восстанавливаются: ${recovering.map((s) => `${s.muscle} (${s.hoursSinceTraining}ч)`).join(', ')}`);
  }
  if (recovered.length > 0) {
    lines.push(`✅ Готовы к тренировке: ${recovered.map((s) => s.muscle).join(', ')}`);
  }
  if (detraining.length > 0) {
    lines.push(`⚠️ Давно не тренированы: ${detraining.map((s) => `${s.muscle} (${Math.round(s.hoursSinceTraining / 24)}д)`).join(', ')}`);
  }

  if (lines.length === 0) return '';

  return `\n\n## 💪 ВОССТАНОВЛЕНИЕ МЫШЦ
${lines.join('\n')}
→ Учитывай при рекомендации тренировки на сегодня. Не предлагай нагружать восстанавливающиеся мышцы.`;
}
export function generateDeloadProgram(
  shouldDeload: boolean,
  lastWorkoutVolume: number,
  lastWorkoutExercises: Array<{ exercise: { name: string }; sets: Array<{ weight: number | null; reps: number | null }> }>,
  userGoal: string | null,
): string {
  if (!shouldDeload || lastWorkoutExercises.length === 0) return '';

  // Deload strategy depends on goal
  let volumeReduction: number;
  let intensityReduction: number;
  let strategy: string;

  if (userGoal === 'STRENGTH') {
    // Strength: keep intensity, reduce volume
    volumeReduction = 0.4; // 40% less sets
    intensityReduction = 0.1; // 10% less weight
    strategy = 'Сохраняем веса, снижаем объём (меньше подходов)';
  } else if (userGoal === 'MUSCLE_GAIN') {
    // Hypertrophy: reduce both moderately
    volumeReduction = 0.3;
    intensityReduction = 0.2;
    strategy = 'Снижаем веса на 20%, убираем 1-2 подхода в каждом упражнении';
  } else {
    // General: reduce everything
    volumeReduction = 0.5;
    intensityReduction = 0.3;
    strategy = 'Лёгкая неделя: 50% объёма, 70% рабочих весов';
  }

  const deloadExercises = lastWorkoutExercises.slice(0, 4).map((e) => {
    const weights = e.sets.map((s) => s.weight || 0).filter((w) => w > 0);
    const reps = e.sets.map((s) => s.reps || 0).filter((r) => r > 0);
    const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
    const deloadWeight = Math.round((maxWeight * (1 - intensityReduction)) / 2.5) * 2.5; // round to 2.5kg
    const maxReps = reps.length > 0 ? Math.max(...reps) : 0;
    const deloadSets = Math.max(2, Math.round(e.sets.length * (1 - volumeReduction)));

    return `- ${e.exercise?.name ?? 'Упражнение'}: ${deloadSets}×${maxReps} @ ${deloadWeight} кг`;
  });

  // Процент снижения человек всё равно переводит в килограммы сам. Объём
  // прошлой тренировки приходил в функцию и не использовался — теперь цель
  // разгрузки названа числом, с которым можно сверяться прямо в зале.
  const volumeTarget = lastWorkoutVolume > 0
    ? `\nОбъём: было ${Math.round(lastWorkoutVolume)} кг → цель на разгрузке ~${Math.round(lastWorkoutVolume * (1 - volumeReduction))} кг.`
    : '';

  return `\n\n## 🧘 ПРОГРАММА DELOAD НЕДЕЛИ
Стратегия: ${strategy}${volumeTarget}
Пример deload тренировки:
${deloadExercises.join('\n')}
→ Предложи эту программу если пользователь спрашивает о deload или когда система рекомендует разгрузку.`;
}
export function getSeasonalAdvice(): string {
  const month = new Date().getMonth(); // 0-11
  const lines: string[] = [];

  if (month >= 11 || month <= 1) {
    // Зима (декабрь-февраль)
    lines.push('❄️ Зима: больше времени на разминку (10-15 мин), мышцы холоднее');
    lines.push('🥤 Витамин D: обязателен 2000-4000 МЕ/день (солнца почти нет)');
    lines.push('🍲 Увеличь калорийность на 5-10% — организм тратит энергию на терморегуляцию');
    lines.push('💡 Мотивация может падать из-за короткого светового дня — это нормально');
  } else if (month >= 2 && month <= 4) {
    // Весна (март-май)
    lines.push('🌱 Весна: хорошее время начать «сушку» к лету');
    lines.push('🏃 Добавь outdoor кардио — бег, велосипед (улучшает настроение после зимы)');
    lines.push('💊 Продолжай витамин D до мая (дефицит после зимы)');
  } else if (month >= 5 && month <= 7) {
    // Лето (июнь-август)
    lines.push('☀️ Лето: пей больше воды (+500мл в жару), электролиты при длительных тренировках');
    lines.push('🕐 Тренируйся утром или вечером — избегай пиковой жары (12-16)');
    lines.push('🥗 Лёгкая еда перед тренировкой, больше фруктов и овощей');
  } else {
    // Осень (сентябрь-ноябрь)
    lines.push('🍂 Осень: идеальное время для набора массы (межсезонье)');
    lines.push('🏋️ Увеличивай рабочие веса — прохладная погода, хороший аппетит');
    lines.push('😷 Укрепляй иммунитет: цинк, витамин C, достаточный сон');
  }

  return `\n\n## 🗓️ СЕЗОННЫЕ РЕКОМЕНДАЦИИ
${lines.slice(0, 3).join('\n')}
→ Учитывай при составлении программ и советах по питанию.`;
}
export function getRepRangeAdvice(
  userGoal: string | null,
  trainingAge: number,
  currentPhase: string,
): string {
  if (!userGoal) return '';

  interface RepRange { main: string; auxiliary: string; rationale: string }
  const ranges: Record<string, RepRange> = {
    STRENGTH: {
      main: '3-5 повторений @ 85-95% 1RM',
      auxiliary: '6-8 повторений @ 70-80% 1RM',
      rationale: 'Тяжёлые подходы развивают максимальную силу (нейромышечная адаптация)',
    },
    MUSCLE_GAIN: {
      main: '8-12 повторений @ 65-75% 1RM',
      auxiliary: '12-15 повторений @ 55-65% 1RM',
      rationale: 'Средний диапазон оптимален для гипертрофии (механическое напряжение + метаболический стресс)',
    },
    WEIGHT_LOSS: {
      main: '12-15 повторений @ 55-65% 1RM',
      auxiliary: '15-20 повторений @ 45-55% 1RM',
      rationale: 'Высокий объём + короткий отдых = больше калорий сожжено + сохранение мышц',
    },
    ENDURANCE: {
      main: '15-25 повторений @ 40-55% 1RM',
      auxiliary: '25-30+ повторений или время под нагрузкой',
      rationale: 'Длительная нагрузка развивает мышечную выносливость и капиллярную сеть',
    },
    GENERAL_FITNESS: {
      main: '8-15 повторений @ 60-75% 1RM',
      auxiliary: '6-8 тяжёлых + 15-20 лёгких (чередование)',
      rationale: 'Широкий диапазон для всестороннего развития',
    },
  };

  const range = ranges[userGoal] || ranges.GENERAL_FITNESS;

  // Adjust for training age
  let modifier = '';
  if (trainingAge < 1) {
    modifier = '\n💡 Для новичка: начинай с верхней границы повторений (больше практики техники).';
  } else if (trainingAge > 5) {
    modifier = '\n💡 Для опытных: чередуй диапазоны (DUP — разная нагрузка в разные дни недели).';
  }

  // Adjust for phase
  let phaseNote = '';
  if (currentPhase === 'deload') {
    phaseNote = '\n⚠️ Сейчас деload: работай на 50-60% от обычных весов, фокус на технику.';
  } else if (currentPhase === 'peaking') {
    phaseNote = '\n⚡ Фаза peaking: снижай повторения, увеличивай вес. 1-3 повторения для тестов.';
  }

  return `\n\n## 🔢 РЕКОМЕНДУЕМЫЕ ДИАПАЗОНЫ ПОВТОРЕНИЙ
Основные: ${range.main}
Вспомогательные: ${range.auxiliary}
Почему: ${range.rationale}${modifier}${phaseNote}
→ Используй при составлении программ и обсуждении подходов.`;
}
export function buildRestDayAdvice(
  daysSinceLastWorkout: number | null,
  recoveryScore: number,
  muscleRecovery: MuscleRecoveryStatus[],
): string {
  if (daysSinceLastWorkout === null || daysSinceLastWorkout < 1) return '';

  const activities: string[] = [];

  if (recoveryScore < 50) {
    // Low recovery — very light activity
    activities.push('🧘 Лёгкая растяжка (15-20 мин) — снимает напряжение без нагрузки');
    activities.push('🚶 Прогулка (20-30 мин) — улучшает кровообращение и восстановление');
    activities.push('🧊 Контрастный душ — горячий 1мин / холодный 30сек × 3-4 цикла');
  } else if (recoveryScore < 75) {
    // Moderate recovery — light activity
    activities.push('🏊 Лёгкое плавание (20-30 мин) — разгружает суставы, улучшает кровоток');
    activities.push('🧘 Йога или мобильность (20-30 мин) — растяжка и стабилизация');
    activities.push('🚴 Лёгкое кардио (велосипед/ходьба) — пульс 100-120 уд/мин');
  } else {
    // Good recovery — moderate activity ok
    activities.push('🏃 Лёгкий бег или быстрая ходьба (30-40 мин)');
    activities.push('🏊 Плавание или подвижные игры');
    activities.push('🧘 Глубокая растяжка + foam rolling (20 мин)');
  }

  // Specific muscle advice
  const sorest = muscleRecovery.filter((m) => m.status === 'recovering').slice(0, 2);
  if (sorest.length > 0) {
    activities.push(`💆 Foam rolling / массаж: ${sorest.map((s) => s.muscle).join(', ')} (особенно нуждаются)`);
  }

  return `\n\n## 🌿 ДЕНЬ ОТДЫХА (${daysSinceLastWorkout}д без тренировки)
${activities.slice(0, 3).join('\n')}
→ Предлагай если пользователь спрашивает чем заняться в день отдыха.`;
}
export function buildTempoAdvice(
  userGoal: string | null,
  fitnessLevel: string | null,
  currentExercises: Array<{ exercise: { category: string; type: string; name: string } }>,
): string {
  if (!userGoal || currentExercises.length === 0) return '';

  // Tempo format: eccentric-pause-concentric-pause (seconds)
  interface TempoRec {
    tempo: string;
    explanation: string;
  }

  const tempoByGoal: Record<string, TempoRec> = {
    MUSCLE_GAIN: { tempo: '3-1-2-0', explanation: '3с негатив, 1с пауза, 2с подъём — максимальное время под нагрузкой' },
    STRENGTH: { tempo: '2-1-1-0', explanation: '2с негатив, 1с пауза, 1с взрыв — контроль + мощность' },
    WEIGHT_LOSS: { tempo: '2-0-2-0', explanation: '2с/2с — умеренный темп для жиросжигания с контролем' },
    ENDURANCE: { tempo: '2-0-2-0', explanation: '2с/2с — ритмичный, без пауз, поддерживаем ЧСС' },
    GENERAL_FITNESS: { tempo: '2-1-2-0', explanation: '2с/2с с паузой — безопасный контролируемый темп' },
  };

  const rec = tempoByGoal[userGoal] || tempoByGoal['GENERAL_FITNESS'];

  const lines: string[] = [];
  lines.push(`Рекомендуемый темп: ${rec.tempo} (${rec.explanation})`);

  // Beginner override
  if (fitnessLevel === 'BEGINNER') {
    lines.push('💡 Для новичков: фокус на контроле. Не спеши. Считай до 3 на негативной фазе.');
  }

  // Exercise-specific tips
  const hasCompound = currentExercises.some((e) => ['barbell', 'dumbbell'].includes(e.exercise?.type));
  const hasIsolation = currentExercises.some((e) => e.exercise?.type === 'machine' || e.exercise?.type === 'cable');

  if (hasCompound) {
    lines.push('🏋️ Базовые: контролируй негатив, не бросай штангу');
  }
  if (hasIsolation) {
    lines.push('🔧 Изоляция: можно замедлить ещё сильнее (4-1-3-1) для лучшего пампинга');
  }

  return `\n\n## ⏱️ ТЕМП ВЫПОЛНЕНИЯ
${lines.join('\n')}
→ Упоминай при обсуждении техники и эффективности тренировок.`;
}
export function estimateRecoveryWindow(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
    durationMinutes: number | null;
    completedAt: Date | null;
  }>,
  userGoal: string | null,
): string {
  if (recentWorkouts.length === 0) return '';

  const lastWorkout = recentWorkouts[0];
  if (!lastWorkout.completedAt) return '';

  // Calculate workout intensity score
  const totalVolume = lastWorkout.exercises.reduce((sum, ex) =>
    sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0);
  const totalSets = lastWorkout.exercises.reduce((sum, ex) =>
    sum + ex.sets.filter((s) => s.completed).length, 0);
  const duration = lastWorkout.durationMinutes || 60;

  // Intensity score: volume per minute
  const intensity = totalVolume / duration;

  // Recovery time estimation
  let recoveryHours: number;
  if (intensity > 150) recoveryHours = 72; // very heavy
  else if (intensity > 100) recoveryHours = 48; // heavy
  else if (intensity > 50) recoveryHours = 36; // moderate
  else recoveryHours = 24; // light

  const hoursAgo = Math.round((Date.now() - new Date(lastWorkout.completedAt).getTime()) / (1000 * 60 * 60));
  const recoveryPct = Math.min(100, Math.round((hoursAgo / recoveryHours) * 100));

  const lines: string[] = [];
  lines.push(`Последняя тренировка: ${hoursAgo}ч назад (${totalSets} подходов, ${Math.round(totalVolume)} кг объём)`);
  lines.push(`Восстановление: ${recoveryPct}% (расчётное время: ${recoveryHours}ч)`);

  // Sleep recommendation
  const sleepHours = intensity > 100 ? '8-9' : '7-8';
  lines.push(`💤 Рекомендуемый сон: ${sleepHours} часов для полного восстановления`);

  if (recoveryPct < 70) {
    lines.push('⚠️ Полное восстановление ещё не наступило. Если тренировка сегодня — работай на другие мышечные группы.');
  }

  // Сколько ждать — зависит от того, что восстанавливается. Цель приходила
  // сюда и не использовалась, хотя силовику нужна нервная система, а на
  // выносливости то же окно закрывается заметно быстрее.
  const goalNote = {
    STRENGTH: 'На силе восстанавливается не столько мышца, сколько нервная система: после тяжёлых одиночных подходов бери верхнюю границу окна, даже если мышцы уже не болят.',
    MUSCLE_GAIN: 'На массе ждать полного восстановления не обязательно — вторая тренировка группы на 70-80% готовности даёт больше суммарного объёма за неделю.',
    WEIGHT_LOSS: 'На дефиците восстановление идёт медленнее обычного — добавь к окну примерно четверть и не считай это ленью.',
    ENDURANCE: 'На выносливость лёгкая работа внутри окна восстановлению не мешает, а помогает — кровоток ускоряет его.',
  }[String(userGoal || '')];
  if (goalNote) lines.push(goalNote);

  return `\n\n## 😴 ОКНО ВОССТАНОВЛЕНИЯ
${lines.join('\n')}`;
}
export function generateDeloadPrescription(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
  }>,
  deloadNeeded: boolean,
): string {
  if (!deloadNeeded || recentWorkouts.length < 3) return '';

  // Calculate average working weights from recent workouts
  const exerciseWeights: Record<string, number[]> = {};
  for (const w of recentWorkouts.slice(0, 3)) {
    for (const ex of w.exercises) {
      const exName15131 = ex.exercise?.name;
      if (!exName15131) continue;
      const weights = ex.sets.filter(s => s.weight && s.completed).map(s => s.weight!);
      if (weights.length > 0) {
        if (!exerciseWeights[exName15131]) exerciseWeights[exName15131] = [];
        exerciseWeights[exName15131].push(...weights);
      }
    }
  }

  const deloadPlan: string[] = [];
  for (const [name, weights] of Object.entries(exerciseWeights).slice(0, 5)) {
    const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
    const deloadWeight = Math.round(avgWeight * 0.6 / 2.5) * 2.5; // 60% rounded to 2.5
    deloadPlan.push(`  ${name}: ${deloadWeight} кг × 8-10 повторов × 2-3 подхода`);
  }

  if (deloadPlan.length === 0) return '';

  return `\n\n## 🟢 ПРОГРАММА РАЗГРУЗОЧНОЙ НЕДЕЛИ
Рекомендация: 60% рабочих весов, сосредоточиться на технике.
${deloadPlan.join('\n')}
Отдых между подходами: 60-90 сек. Тренировки 30-40 мин максимум.`;
}
export function getTrainingAgeAdvice(
  experienceYears: number | null,
  fitnessLevel: string | null,
  totalWorkouts: number,
): string {
  // Estimate training age from data if not explicitly set
  let effectiveAge = experienceYears ?? 0;
  if (!experienceYears && totalWorkouts > 0) {
    effectiveAge = Math.min(totalWorkouts / 150, 5); // rough estimate
  }

  const level = fitnessLevel?.toLowerCase() || 'beginner';

  if (effectiveAge < 1 || level === 'beginner') {
    return `\n\n## 🎓 УРОВЕНЬ СОВЕТОВ: НОВИЧОК
Тренировочный стаж: <1 года. Давай ПРОСТЫЕ советы:
- Базовые упражнения, не усложняй
- Объясняй ЗАЧЕМ, а не только КАК
- Не используй жаргон: RPE, периодизация, мезоцикл — только простые слова
- Прогресс линейный: каждую неделю +2.5 кг на штангу
- Мотивируй часто, критикуй мягко`;
  }

  if (effectiveAge < 3 || level === 'intermediate') {
    return `\n\n## 🎓 УРОВЕНЬ СОВЕТОВ: СРЕДНИЙ
Тренировочный стаж: 1-3 года. Можно использовать:
- RPE/RIR для регулировки нагрузки
- Периодизацию (волнообразная, блоковая)
- Суперсеты и дроп-сеты
- Анализ слабых мест`;
  }

  return `\n\n## 🎓 УРОВЕНЬ СОВЕТОВ: ПРОДВИНУТЫЙ
Тренировочный стаж: 3+ лет. Говори на равных:
- DUP, conjugate, block periodization
- Специализация на слабые мышцы
- Тонкая настройка объёма и интенсивности
- Продвинутые техники: кластерные сеты, мио-репс`;
}
export function buildMindMuscleAdvice(
  lastWorkoutExercises: Array<{ name: string; primaryMuscles: string[] }>,
): string {
  if (lastWorkoutExercises.length === 0) return '';

  const cueMap: Record<string, string> = {
    chest: 'Сжимай грудные в верхней точке жима. Представляй что сводишь локти вместе.',
    back: 'Тяни локтями, не руками. Представляй что сжимаешь карандаш между лопатками.',
    shoulders: 'Поднимай через мизинцы при разводках. Представляй что выливаешь воду из бутылки.',
    biceps: 'Супинируй кисть в верхней точке. Сжимай бицепс на пиковом сокращении.',
    triceps: 'Полностью разгибай руку. Чувствуй сокращение над локтем.',
    quadriceps: 'Давай через пятки в приседе. Чувствуй напряжение над коленом.',
    hamstrings: 'Тяни тазом назад в румынской тяге. Чувствуй растяжение задней поверхности.',
    glutes: 'Сжимай ягодицы в верхней точке. Толкай бёдра вперёд.',
    lats: 'Тяни локти к бёдрам в подтягиваниях. Чувствуй широчайшие, не бицепсы.',
    abs: 'Скручивай рёбра к тазу. Выдыхай на усилии, задерживай на секунду.',
  };

  const cues: string[] = [];
  const seen = new Set<string>();
  for (const ex of lastWorkoutExercises.slice(0, 4)) {
    for (const muscle of ex.primaryMuscles) {
      if (cueMap[muscle] && !seen.has(muscle)) {
        cues.push(`${ex.name}: ${cueMap[muscle]}`);
        seen.add(muscle);
      }
    }
  }

  if (cues.length === 0) return '';

  return `\n\n## 🧠 НЕЙРОМЫШЕЧНАЯ СВЯЗЬ
${cues.slice(0, 3).map(c => `- ${c}`).join('\n')}
Предложи эти подсказки если пользователь тренируется или спрашивает о технике.`;
}
export function buildRecoveryProtocol(
  lastWorkoutType: string | null,
  lastWorkoutIntensity: 'light' | 'moderate' | 'heavy' | 'unknown',
  lastWorkoutMuscles: string[],
): string {
  if (lastWorkoutIntensity === 'unknown' || lastWorkoutMuscles.length === 0) return '';

  const protocol: string[] = [];

  if (lastWorkoutIntensity === 'heavy') {
    protocol.push('Тяжёлая тренировка — полное восстановление 48-72 часа');
    protocol.push('Холодный душ или контрастный душ в первые 2 часа');
    protocol.push('Белок: 30-40 г в течение часа после тренировки');
    protocol.push('Сон: 8+ часов сегодня критически важны');
  } else if (lastWorkoutIntensity === 'moderate') {
    protocol.push('Средняя тренировка — восстановление 24-48 часов');
    protocol.push('Белок: 25-30 г после тренировки');
    protocol.push('Лёгкая прогулка вечером поможет восстановлению');
  } else {
    protocol.push('Лёгкая тренировка — можно тренироваться завтра');
    protocol.push('Лёгкий перекус с белком');
  }

  // Muscle-specific recovery
  const muscleRu: Record<string, string> = {
    quadriceps: 'ноги', hamstrings: 'ноги', glutes: 'ноги',
    chest: 'грудь', back: 'спину', shoulders: 'плечи',
  };
  const mainMuscle = muscleRu[lastWorkoutMuscles[0]] || lastWorkoutMuscles[0];

  // Название тренировки приходило сюда и не использовалось, а протокол после
  // кардио и после штанги разный: холод сразу после силовой глушит рост, а
  // после бега он безвреден и помогает.
  const typeLower = (lastWorkoutType || '').toLowerCase();
  const wasCardio = /кардио|бег|run|велос|cycl|плаван|swim|эллипс|гребл|hiit/.test(typeLower);
  const wasLegs = /ног|присед|leg|squat|низ/.test(typeLower);
  const typeNote = wasCardio
    ? '\n- После кардио холод не вредит — в отличие от силовой, где он глушит рост. Главное восстановление здесь — вода и электролиты.'
    : wasLegs
      ? '\n- После ног: подними ноги выше сердца на 10-15 мин и походи вечером. Сидеть весь день после тяжёлого приседа — худшее, что можно сделать.'
      : lastWorkoutType
        ? `\n- Тренировка была «${lastWorkoutType}» — если завтра планируешь те же мышцы, перенеси.`
        : '';

  return `\n\n## 🧊 ПРОТОКОЛ ВОССТАНОВЛЕНИЯ
После тренировки на ${mainMuscle} (${lastWorkoutIntensity === 'heavy' ? 'тяжёлая' : lastWorkoutIntensity === 'moderate' ? 'средняя' : 'лёгкая'}):
${protocol.map(p => `- ${p}`).join('\n')}${typeNote}
Предложи восстановление если пользователь закончил тренировку.`;
}
export function buildTimeBasedAdvice(
  currentHour: number,
  typicalTrainingHour: number | null,
): string {
  const advice: string[] = [];

  if (currentHour >= 6 && currentHour < 10) {
    advice.push('Утро — отличное время для тренировки. Уровень тестостерона на пике.');
    if (typicalTrainingHour && typicalTrainingHour >= 17) {
      advice.push('Обычно ты тренируешься вечером. Утренняя тренировка может быть продуктивнее.');
    }
  } else if (currentHour >= 10 && currentHour < 14) {
    advice.push('Середина дня — хорошее время для тренировки если обед был 1-2 часа назад.');
  } else if (currentHour >= 17 && currentHour < 21) {
    advice.push('Вечер — пик силовых показателей. Мышцы и суставы разогреты за день.');
  } else if (currentHour >= 21) {
    advice.push('Поздний вечер — избегай интенсивных тренировок за 2 часа до сна.');
  }

  if (advice.length === 0) return '';

  return `\n\n## 🕐 ВРЕМЯ ДНЯ
${advice.join('\n')}
Используй это для контекстных советов.`;
}
export function buildBreathingAdvice(
  exerciseNames: string[],
): string {
  if (exerciseNames.length === 0) return '';

  const breathingMap: Record<string, string> = {
    'жим': 'Вдох на опускании, выдох на подъёме. Не задерживай дыхание на лёгких весах.',
    'присед': 'Глубокий вдох стоя → задержка (Вальсальва) → приседание → выдох на подъёме.',
    'тяга': 'Вдох стоя → напряги кор → тяни → выдох наверху.',
    'подтягив': 'Вдох внизу, выдох на подъёме к перекладине.',
    'планк': 'Дыши ровно и глубоко. Не задерживай дыхание — это снижает эффективность.',
    'кардио': 'Ритмичное дыхание: вдох на 2 шага, выдох на 2 шага.',
  };

  const advice: string[] = [];
  for (const name of exerciseNames.slice(0, 3)) {
    const nameL = name.toLowerCase();
    for (const [key, tip] of Object.entries(breathingMap)) {
      if (nameL.includes(key)) {
        advice.push(`${name}: ${tip}`);
        break;
      }
    }
  }

  if (advice.length === 0) return '';

  return `\n\n## 🌬️ ДЫХАНИЕ
${advice.map(a => `- ${a}`).join('\n')}
Упоминай дыхание при обсуждении техники.`;
}
export function analyzeTrainingFrequencyHeatmap(
  recentWorkouts: Array<{
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 5) return '';

  const dayCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  for (const w of recentWorkouts) {
    if (w.completedAt) {
      dayCount[w.completedAt.getDay()]++;
    }
  }

  const maxCount = Math.max(...Object.values(dayCount));
  if (maxCount === 0) return '';

  const heat = Object.entries(dayCount)
    .map(([day, count]) => {
      const bar = count > 0 ? '█'.repeat(Math.ceil(count / maxCount * 5)) : '░';
      return `${dayNames[+day]}: ${bar} (${count})`;
    })
    .join('\n');

  // Find most and least popular days
  const sortedDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1]);
  const bestDay = dayNames[+sortedDays[0][0]];
  const emptyDays = sortedDays.filter(([, c]) => c === 0).map(([d]) => dayNames[+d]);

  return `\n\n## 📅 ЧАСТОТА ПО ДНЯМ НЕДЕЛИ
${heat}
Самый активный день: ${bestDay}
${emptyDays.length > 0 ? `Нет тренировок: ${emptyDays.join(', ')}` : 'Тренировки каждый день!'}`;
}
export function explainRecoveryScore(
  recoveryScore: number,
  daysSinceLastWorkout: number,
  avgSleepHours: number | null,
  fatigueStatus: string,
): string {
  if (recoveryScore === 0) return '';

  const grade = recoveryScore >= 80 ? '🟢 Отлично' :
    recoveryScore >= 60 ? '🟡 Хорошо' :
    recoveryScore >= 40 ? '🟠 Умеренно' : '🔴 Низко';

  const factors: string[] = [];

  if (daysSinceLastWorkout >= 2) factors.push(`✅ Отдых: ${daysSinceLastWorkout} дней после тренировки`);
  else if (daysSinceLastWorkout === 1) factors.push('🟡 1 день после тренировки');
  else factors.push('⚠️ Тренировался сегодня');

  if (avgSleepHours !== null) {
    if (avgSleepHours >= 7.5) factors.push(`✅ Сон: ${avgSleepHours.toFixed(1)}ч`);
    else factors.push(`⚠️ Сон: ${avgSleepHours.toFixed(1)}ч (рекомендовано 7.5-9ч)`);
  }

  if (fatigueStatus === 'overreaching') factors.push('🔴 Признаки перетренированности');
  else if (fatigueStatus === 'high') factors.push('🟠 Накопленная усталость высокая');
  else if (fatigueStatus === 'low') factors.push('✅ Усталость низкая');

  return `\n\n## 💤 ГОТОВНОСТЬ К ТРЕНИРОВКЕ: ${grade} (${recoveryScore}/100)
${factors.join('\n')}`;
}
export function getSmartRestAdvice(
  exerciseName: string | null,
  goal: string | null,
  setCount: number,
): string {
  if (!exerciseName) return '';

  const isCompound = /присед|жим|становая|тяга|подтягиван|жим стоя/i.test(exerciseName);
  const isHeavy = setCount <= 5; // low reps = heavy

  let restSeconds: number;
  let rationale: string;

  if (goal === 'strength' || isHeavy) {
    restSeconds = isCompound ? 180 : 120;
    rationale = 'Силовая работа требует полного восстановления нервной системы';
  } else if (goal === 'muscle_gain') {
    restSeconds = isCompound ? 120 : 90;
    rationale = 'Гипертрофия: умеренный отдых → накопление метаболитов → рост';
  } else if (goal === 'weight_loss') {
    restSeconds = isCompound ? 60 : 45;
    rationale = 'Короткий отдых → выше интенсивность → больше калорий';
  } else {
    restSeconds = 90;
    rationale = 'Универсальный вариант для смешанных целей';
  }

  const mins = Math.floor(restSeconds / 60);
  const secs = restSeconds % 60;
  const timeStr = mins > 0 ? `${mins}м ${secs > 0 ? secs + 'с' : ''}`.trim() : `${secs}с`;

  return `\n\n## ⏸️ ОТДЫХ МЕЖДУ ПОДХОДАМИ: ${timeStr}
Упражнение: ${exerciseName} | Цель: ${goal || 'общая форма'}
${rationale}`;
}
export function planDeloadWeek(
  activeProgram: { name: string; sessionsPerWeek: number } | null,
  avgVolume: number,
  fatigueStatus: string,
): string {
  if (fatigueStatus !== 'high' && fatigueStatus !== 'overreaching') return '';

  const sessions = activeProgram?.sessionsPerWeek || 3;
  const deloadVolume = Math.round(avgVolume * 0.5);

  return `\n\n## 🔄 ПЛАН РАЗГРУЗОЧНОЙ НЕДЕЛИ
Программа: ${activeProgram?.name || 'текущая'}
Тренировок: ${sessions} (сохраняем частоту)
Объём: ~${deloadVolume} кг/тренировку (50% от обычного)
Интенсивность: 60-70% от рабочих весов
Что делать:
• Те же упражнения, но 2-3 подхода вместо 4-5
• Убрать подходы до отказа
• Фокус на технике и восстановлении
Разгрузка — не слабость, а часть прогресса.`;
}
export function trackMuscleGroupRecovery(
  recentWorkouts: Array<{
    completedAt: Date | null;
    exercises: Array<{ exercise: { muscleGroup: string } }>;
  }>,
): string {
  const muscleLastTrained: Record<string, number> = {}; // muscle group → days ago

  for (const wo of recentWorkouts) {
    if (!wo.completedAt) continue;
    const daysAgo = Math.floor((Date.now() - new Date(wo.completedAt).getTime()) / (1000 * 60 * 60 * 24));

    for (const ex of wo.exercises) {
      const mg = ex.exercise?.muscleGroup;
      if (!mg) continue;
      if (muscleLastTrained[mg] === undefined || muscleLastTrained[mg] > daysAgo) {
        muscleLastTrained[mg] = daysAgo;
      }
    }
  }

  const readyGroups = Object.entries(muscleLastTrained).filter(([, days]) => days >= 2);
  const recoveringGroups = Object.entries(muscleLastTrained).filter(([, days]) => days < 2);

  if (readyGroups.length === 0 && recoveringGroups.length === 0) return '';

  const mgNames: Record<string, string> = {
    'chest': 'Грудь', 'back': 'Спина', 'legs': 'Ноги', 'shoulders': 'Плечи',
    'arms': 'Руки', 'core': 'Пресс', 'glutes': 'Ягодицы', 'biceps': 'Бицепс',
    'triceps': 'Трицепс', 'quads': 'Квадрицепс', 'hamstrings': 'Бицепс бедра',
  };

  const parts: string[] = [];
  if (readyGroups.length > 0) {
    parts.push(`✅ Готовы к тренировке: ${readyGroups.map(([mg]) => mgNames[mg] || mg).join(', ')}`);
  }
  if (recoveringGroups.length > 0) {
    parts.push(`⏳ Восстанавливаются: ${recoveringGroups.map(([mg, d]) => `${mgNames[mg] || mg} (${d}д)`).join(', ')}`);
  }

  return `\n\n## 💪 СТАТУС ВОССТАНОВЛЕНИЯ МЫШЦ
${parts.join('\n')}`;
}
export function getLifestyleRecoveryTips(
  recoveryScore: number,
  daysSinceWorkout: number,
  message: string,
): string {
  const keywords = /устал|не сплю|стресс|работа|нет сил|вымотан|болит голова|раздражен/i;
  if (!keywords.test(message) && recoveryScore > 60) return '';

  const tips: string[] = [];

  if (recoveryScore < 50) {
    tips.push('😴 Сон — первый инструмент восстановления. 7.5-9 часов критично для роста мышц и силы');
    tips.push('🧘 Активное восстановление: лёгкая прогулка 20-30 мин лучше полного покоя');
  }

  if (keywords.test(message)) {
    tips.push('🌡️ Хронический стресс повышает кортизол → замедляет рост мышц и жиросжигание');
    tips.push('💧 Гидратация: 35 мл × вес тела (кг) в день. В стрессе и жару — больше');
  }

  if (daysSinceWorkout >= 3) {
    tips.push('🏃 Лёгкое движение восстанавливает лучше полного покоя. Попробуй прогулку или растяжку');
  }

  if (tips.length === 0) return '';

  return `\n\n## 🌿 ВОССТАНОВЛЕНИЕ ЗА ПРЕДЕЛАМИ ЗАЛА
${tips.slice(0, 3).join('\n')}`;
}
export function getTempoAdvice(
  goal: string | null,
  exerciseName: string | null,
  message: string,
): string {
  const tempoKeyword = /темп|скорость|медленно|быстро|взрывно|опускать|контроль/i;
  if (!tempoKeyword.test(message) && Math.random() > 0.2) return ''; // Don't show unless asked

  const tempos: Record<string, { tempo: string; example: string; benefit: string }> = {
    muscle_gain: {
      tempo: '3-1-2-0',
      example: '3с вниз → 1с пауза → 2с вверх → 0с пауза',
      benefit: 'Медленная эксцентрическая фаза → максимальный стресс для гипертрофии',
    },
    strength: {
      tempo: '2-0-X-0',
      example: '2с вниз → 0 → взрывной подъём → 0',
      benefit: 'Взрывной концентрик → рекрутирование максимума мотонейронов',
    },
    weight_loss: {
      tempo: '2-0-2-0',
      example: '2с вниз → 2с вверх → без задержек',
      benefit: 'Больший тоннаж за тренировку → больше калорий',
    },
  };

  const advice = tempos[goal || 'muscle_gain'] || tempos['muscle_gain'];

  return `\n\n## ⏱️ ТЕМП ВЫПОЛНЕНИЯ (${exerciseName || 'упражнение'})
Рекомендую: **${advice.tempo}** (${advice.example})
${advice.benefit}`;
}
export function getEnergySystemAdvice(workoutDurationMinutes: number, avgReps: number, goal: string | null): string {
  if (!workoutDurationMinutes && !avgReps) return '';
  const isStrength = avgReps <= 5;
  const isHypertrophy = avgReps >= 6 && avgReps <= 12;
  const isEndurance = avgReps > 12;
  const isLong = workoutDurationMinutes > 75;

  let system = '';
  let advice = '';

  if (isStrength) {
    system = 'фосфокреатиновая (АТФ-КФ)';
    advice = 'Отдых 3-5 минут между тяжёлыми подходами критичен — именно столько нужно для восстановления КФ. Креатин-моногидрат 5г/день усиливает этот резерв на 20-30%.';
  } else if (isHypertrophy) {
    system = 'гликолитическая';
    advice = 'Отдых 60-120 сек создаёт метаболический стресс — один из ключевых триггеров гипертрофии. Жжение в мышцах — признак накопления лактата, это нормально и полезно.';
  } else if (isEndurance) {
    system = 'окислительная (аэробная)';
    advice = 'При высоких повторениях (15+) работает аэробная система. Короткий отдых (30-60 сек) поддерживает тренировку выносливости и жиросжигание.';
  }

  if (isLong && goal === 'weight_loss') {
    advice += ' Тренировки >75 мин снижают уровень тестостерона и повышают кортизол — рассмотри разбивку на 2 более коротких сессии.';
  }

  return system ? `\n\n⚡ Энергетические системы: Ваши тренировки задействуют преимущественно ${system} систему. ${advice}` : '';
}
export function getPostWorkoutRecoveryWindow(workoutDurationMinutes: number, avgIntensity: number | null, bodyWeightKg: number | null): string {
  if (!workoutDurationMinutes || workoutDurationMinutes < 20) return '';
  const bw = bodyWeightKg ?? 80;
  const intensity = avgIntensity ?? 6;
  const proteinG = Math.round(bw * 0.4);
  const carbsG = intensity >= 7
    ? Math.round(bw * 1.2)
    : Math.round(bw * 0.8);

  const windowMinutes = 30;

  return `\n\n🔄 Анаболическое окно восстановления:
⏱ У вас есть ~${windowMinutes} минут для оптимального усвоения питательных веществ.
🥩 Белок: ${proteinG}г (${Math.round(proteinG / 4)} яиц / ${Math.round(proteinG / 25 * 100)}г куриной грудки / 1-2 мерных ложки протеина)
🍚 Углеводы: ${carbsG}г (${Math.round(carbsG / 30)} средних банана / ${Math.round(carbsG / 45 * 100)}г риса)
💧 Жидкость: восполните 150% от потерянного веса (взвесьтесь до/после)`;
}
export function detectDeloadNeedAdvanced(weeklyVolumeHistory: number[], avgRPEHistory: number[], consecutiveHighRPEDays: number): string {
  if (!weeklyVolumeHistory.length) return '';
  const recentVolume = weeklyVolumeHistory.slice(-2);
  const isVolumePlateaued = recentVolume.length >= 2 && Math.abs(recentVolume[1] - recentVolume[0]) / (recentVolume[0] || 1) < 0.05;
  const avgRPE = avgRPEHistory.length ? avgRPEHistory.reduce((a, b) => a + b, 0) / avgRPEHistory.length : 0;
  const needsDeload = consecutiveHighRPEDays >= 3 || (isVolumePlateaued && avgRPE >= 8.5);

  if (!needsDeload) return '';

  return `\n\n🔄 Сигнал к разгрузочной неделе (deload):
• Средний RPE последних тренировок: ${avgRPE.toFixed(1)}/10
• ${consecutiveHighRPEDays >= 3 ? `${consecutiveHighRPEDays} дней подряд с высоким RPE` : 'Объём застопорился при высокой нагрузке'}

**Рекомендуемая разгрузка:**
- Снизьте веса на 40-50% от рабочих
- Сохраните количество подходов и повторений
- Продолжительность: 5-7 дней
- После deload: ожидайте 5-10% прирост силовых показателей`;
}
export function giveSpotterAdvice(message: string, exerciseNames: string[]): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['страховка', 'страхующий', 'один', 'без партнёра', 'без страховки', 'помогите', 'максимум'].some(kw => lowerMsg.includes(kw));

  if (!isRelevant) return '';

  const hasHeavyExercise = exerciseNames.some(ex => {
    const lower = ex.toLowerCase();
    return lower.includes('жим лёжа') || lower.includes('присед') || lower.includes('становая');
  });

  const advice = hasHeavyExercise
    ? `🛡 Безопасность без страхующего для ваших упражнений:
• **Жим лёжа**: используйте стойки с ограничителями или смитт-машину; альтернатива — гантели (можно бросить)
• **Приседания**: тренируйтесь в силовой раме со штифтами; приседайте до параллели — если упадёте, штанга ляжет на штифты
• **Работайте с весом 85-90% от максимума** — оставляйте 1-2 повторения в запасе при работе в одиночку
• Первый признак отказа мышц — снижайте вес, не "выжимайте любой ценой"`
    : `🛡 Работа без страхующего: оставляйте 2-3 повторения в запасе от отказа. Предпочитайте тренажёры и гантели свободным весам при работе в одиночку.`;

  return `\n\n${advice}`;
}
export function educateRecoveryModalities(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['восстановление', 'боль в мышцах', 'крепатура', 'мфр', 'массаж', 'растяжка после', 'ледяная ванна', 'сауна'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n🛁 Методы восстановления — что реально работает:

**Доказанная эффективность:**
• **Сон** (самый важный) — 8+ часов = полное восстановление
• **Активное восстановление** — лёгкая прогулка/плавание на следующий день снижает DOMS на 30%
• **Холодный душ/криотерапия** — снижает воспаление, но может замедлить адаптацию — лучше в соревновательный период
• **Компрессионное бельё** — реально ускоряет вывод лактата

**Хорошая поддержка:**
• МФР (foam roller) — снижает болезненность, улучшает ROM
• Контрастный душ (горячий/холодный) — улучшает кровоток
• Сауна — 15-20 мин × 2-3 раза/неделю = +20% GH, лучший сон

**Переоценено:**
• Растяжка сразу после тренировки — незначительный эффект на восстановление
• BCAA — если белка достаточно, отдельный эффект минимален`;
}
export function planOverttrainingRecovery(message: string, fatigueStatus: string, consecutiveHighDays: number): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['перетренировался', 'overtraining', 'истощение', 'нет сил совсем', 'полный упадок'].some(kw => lowerMsg.includes(kw));
  const isOverreaching = fatigueStatus === 'overreaching' || fatigueStatus === 'dangerous' || consecutiveHighDays >= 5;

  if (!isRelevant && !isOverreaching) return '';

  return `\n\n🚨 ${fatigueStatus === 'dangerous' || consecutiveHighDays >= 5 ? 'ПРИЗНАКИ ПЕРЕТРЕНИРОВАННОСТИ' : 'Протокол восстановления'}:

**Симптомы перетренированности:**
• Снижение силовых показателей 2+ недели
• Постоянная усталость, плохой сон
• Раздражительность, потеря мотивации
• ЧСС покоя выше нормы на 5-8 уд/мин

**План восстановления:**
Неделя 1-2: полный отдых (максимум лёгкие прогулки)
Неделя 3-4: лёгкие тренировки 3x/неделю, 50% от рабочих весов
Неделя 5+: постепенное возвращение к нормальному режиму

**Поддержка:**
• Сон: 9-10 часов
• Калории: небольшой профицит (+200-300 ккал)
• Адаптогены: ашваганда 300-500мг, родиола 200-400мг
• Анализы: тестостерон/кортизол, общий анализ крови

⚠️ Игнорирование перетренированности → травмы и потеря 3-6 месяцев прогресса.`;
}
export function getStretchingProtocol(message: string, exerciseNames: string[]): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['растяжка', 'гибкость', 'стретчинг', 'потянуть мышцы', 'после тренировки растяжка'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const hasLegs = exerciseNames.some(e => e.toLowerCase().includes('присед') || e.toLowerCase().includes('становая') || e.toLowerCase().includes('ноги'));
  const hasUpper = exerciseNames.some(e => e.toLowerCase().includes('жим') || e.toLowerCase().includes('тяга'));

  const legStretches = hasLegs ? `\n**Ноги:**
• Растяжка квадрицепса стоя (30 сек каждая нога)
• Складка сидя (бицепс бедра, 45 сек)
• Голубь (тазобедренный, 60 сек каждая сторона)
• Икры у стены (30 сек)` : '';

  const upperStretches = hasUpper ? `\n**Верх тела:**
• Растяжка груди в дверном проёме (30 сек)
• Тяга за голову (широчайшие, 30 сек)
• Плечо поперёк груди (30 сек каждое)
• Разгибание трицепса над головой (30 сек)` : '';

  return `\n\n🧘 Протокол растяжки после тренировки (10-12 мин):
${legStretches}${upperStretches}
💡 Статичную растяжку делайте ПОСЛЕ тренировки, не до — перед ней снижает силовые показатели на 5-8%.`;
}
export function getFoamRollerProtocol(exerciseNames: string[], message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['мфр', 'foam roller', 'пенный ролик', 'ролик', 'крепатура', 'миофасциальный'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const hasLegs = exerciseNames.some(e => e.toLowerCase().includes('присед') || e.toLowerCase().includes('ноги') || e.toLowerCase().includes('становая'));
  const hasUpper = exerciseNames.some(e => e.toLowerCase().includes('жим') || e.toLowerCase().includes('тяга'));

  const zones: string[] = [];
  if (hasLegs) {
    zones.push('• **Квадрицепс**: лёжа на животе, ролик под бедром — 60 сек каждая нога');
    zones.push('• **Бицепс бедра**: сидя, ролик под бедром — 60 сек');
    zones.push('• **IT-бант (внешнее бедро)**: лёжа на боку — 90 сек (болезненно, но важно)');
    zones.push('• **Икры**: ролик под голенью — 60 сек каждая нога');
  }
  if (hasUpper) {
    zones.push('• **Грудной отдел**: лёжа на спине, ролик под лопатками — 90 сек');
    zones.push('• **Широчайшие**: лёжа на боку, ролик подмышкой — 60 сек каждая');
    zones.push('• **Задняя поверхность плеча**: 45 сек каждая сторона');
  }
  if (!zones.length) {
    zones.push('• **Поясница**: НЕ катайте ролик по пояснице — усиливает боль. Используйте для ягодиц и грудного отдела.');
  }

  return `\n\n🔄 МФР-протокол (миофасциальный релиз):\n${zones.join('\n')}\n\n💡 Техника: медленно катайте, найдите болезненную точку → удерживайте давление 20-30 сек до снятия напряжения.`;
}
export function getAgeSpecificAdvice(dateOfBirth: Date | null, message: string): string {
  if (!dateOfBirth) return '';
  const age = Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365));
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['возраст', 'поздно начинать', 'в моём возрасте', 'старый', 'молодой'].some(kw => lowerMsg.includes(kw)) || age >= 40 || age < 20;

  if (!isRelevant) return '';

  if (age < 20) {
    return `\n\n🌱 Тренировки в юном возрасте (${age} лет):\n• Скелет ещё формируется — избегайте максимальных нагрузок на позвоночник\n• Технический базис сейчас важнее рекордов\n• Объём и разнообразие → сила придёт позже\n• Анаэробные способности пика достигают в 18-25 лет — у вас всё впереди\n• Восстановление отличное — используйте это для освоения техники`;
  } else if (age >= 40 && age < 55) {
    return `\n\n💪 Тренировки после 40 (${age} лет):\n• Тестостерон снижается ~1%/год — силовые тренировки его повышают\n• Разминка важнее: суставы требуют 10-15 мин разогрева\n• Восстановление дольше: 48-72 ч между тяжёлыми сессиями вместо 24 ч\n• Протеин: повышайте до 2.2-2.4г/кг (хуже усвоение)\n• Плюс: психологическая устойчивость и дисциплина — ваше преимущество\n• После 40 можно набирать мышцы так же эффективно, просто медленнее`;
  } else if (age >= 55) {
    return `\n\n🏅 Тренировки после 55 (${age} лет):\n• Саркопения (потеря мышц) — главный враг. Силовые 3x/неделю = лучшая профилактика\n• Акцент на функциональность: присед, становая, жимы — движения которые нужны в жизни\n• Ударные нагрузки (бег) → заменить плаванием, велосипедом, эллипсом\n• Витамин D3 (4000 МЕ) + кальций + Омега-3 — обязательно\n• Результаты медленнее, но прогресс реален в любом возрасте — доказано`;
  }

  return '';
}
export function getPostWorkoutStretch(message: string, sessionExercises: string[]): string {
  const lower = message.toLowerCase();
  const stretchKeywords = ['растяжк', 'заминк', 'после тренировки', 'скованност', 'stretch', 'гибкост', 'потяну', 'расслаби'];
  if (!stretchKeywords.some(k => lower.includes(k))) return '';

  const muscleStretches: Record<string, string> = {
    'грудь': '🫁 Грудь: руки в дверном проёме, мягко вперёд, 30 сек × 2',
    'спина': '🔙 Широчайшие: висение на турнике 30-60 сек, кошка-корова',
    'ноги': '🦵 Квадрицепс: стоя на одной ноге, тяни пятку к ягодице 30 сек',
    'бёдра': '🦵 Бицепс бедра: наклон сидя к прямой ноге 45 сек',
    'плечи': '💪 Плечи: рука поперёк груди, придержи локоть 30 сек каждую',
    'трицепс': '💪 Трицепс: рука за головой, локоть вверх, тяни вниз 25 сек',
    'икры': '🦶 Икры: ступня на подъёме, пятка вниз, 30 сек × 2',
    'ягодицы': '🍑 Ягодицы: нога за ногу лёжа (поза цифры 4), 40 сек',
    'пресс': '🤸 Пресс/сгибатели бедра: поза кобры лёжа, 20 сек',
  };

  const detected: string[] = [];
  const exercises = sessionExercises.join(' ').toLowerCase();
  if (exercises.includes('жим') || exercises.includes('грудь') || exercises.includes('отжим')) detected.push('грудь');
  if (exercises.includes('тяга') || exercises.includes('подтяг') || exercises.includes('гребл')) detected.push('спина');
  if (exercises.includes('присед') || exercises.includes('выпад') || exercises.includes('жим ногами')) { detected.push('ноги'); detected.push('бёдра'); }
  if (exercises.includes('плечи') || exercises.includes('жим сидя') || exercises.includes('arnold')) detected.push('плечи');
  if (exercises.includes('трицепс') || exercises.includes('брусья') || exercises.includes('разгибани')) detected.push('трицепс');
  if (exercises.includes('икры') || exercises.includes('calf')) detected.push('икры');
  if (exercises.includes('ягодиц') || exercises.includes('glute') || exercises.includes('румынская')) detected.push('ягодицы');

  const lines: string[] = ['🧘 **Заминка и растяжка (5-7 минут):**', ''];
  const toStretch = detected.length > 0 ? [...new Set(detected)] : ['ноги', 'спина', 'плечи'];
  toStretch.forEach(m => { if (muscleStretches[m]) lines.push('• ' + muscleStretches[m]); });
  lines.push('', '**Правила растяжки:**');
  lines.push('• Статическая растяжка — только ПОСЛЕ тренировки, не до (снижает силу до)');
  lines.push('• Удерживай 20-45 секунд, без пружинящих движений');
  lines.push('• Лёгкое жжение — норма, боль — стоп');
  lines.push('• Дыши ровно, на выдохе углубляй растяжку');

  return '\n\n' + lines.join('\n');
}
export function getPausedRepsAdvice(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['темп', 'tempo', 'паузированный', 'медленно', 'задержка', 'паузы', 'время под нагрузкой', 'tut'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n⏱ **Темп и паузированные повторения:**

**Обозначение темпа (4 цифры: эксцентрика-пауза-концентрика-пауза вверху):**
• 3-1-1-0: опускай 3 сек, держи 1 сек, подними за 1 сек, без паузы вверху
• 4-0-1-0: медленный негатив (эксцентрика), быстрый подъём — гипертрофия
• 2-2-1-0: пауза внизу — улучшает нижнюю точку (особенно в приседе/жиме)
• 1-0-1-0: взрывная работа — для скорости и атлетизма

**Паузированные повторения (пауза внизу/вверху):**
• Пауза в нижней точке жима лёжа 2-3 сек → убирает эффект отскока → сложнее и честнее
• Пауза в нижней точке приседа → улучшает стабильность и убирает "сглатывание ямы"
• Пауза вверху в тяге → максимальное сокращение широчайших

**Для каких целей:**
• Гипертрофия: акцент на эксцентрике (3-4 сек опускание)
• Сила: взрывной концентрик, без замедления
• Техника: паузы помогают прочувствовать движение и устранить компенсации
• Реабилитация: медленный темп снижает нагрузку на суставы

💡 Снижай рабочий вес на 20-30% при работе с контролируемым темпом.`;
}
export function getRecoveryDrinkGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['после тренировки пить', 'восстановление напиток', 'гейнер', 'протеиновый коктейль', 'recovery drink', 'шейк после'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🥤 **Напитки и питание для восстановления:**

**Окно после тренировки (0-2 часа):**
• Не "захлопывается" строго через 30 мин — это миф.
• Синтез белка повышен 24-48 часов после тренировки.
• НО: чем быстрее пополнишь гликоген и аминокислоты → тем лучше.

**Оптимальный коктейль (DIY):**
• 30-40г сывороточного протеина (или 250г творога)
• 1-2 банана или 50г мальтодекстрина
• 300-500мл воды или молока
→ ~35г белка + 40-60г углеводов + электролиты

**Варианты без порошков:**
• Молоко (обычное или шоколадное) — соотношение 3:1 углеводы:белок, идеально
• Кефир + банан + ягоды
• Творог 5% + мёд + фрукты

**Гидратация:**
• 500-750мл воды на каждый килограмм веса, потерянного на тренировке
• Добавь щепотку соли + сок лимона = натуральный изотоник

**Что не нужно:**
• Дорогие BCAA отдельно (они есть в любом белковом продукте)
• "Детокс-смузи" — маркетинг, печень справляется сама
• Энергетики после тренировки — мешают сну (кортизол + кофеин)`;
}
export function getDeloadWeekProtocol(message: string, totalWorkoutsEver: number): string {
  const lower = message.toLowerCase();
  const keywords = ['деньги', 'разгрузочная неделя', 'deload', 'нужна разгрузка', 'сбросить нагрузку', 'неделя отдыха', 'восстановительная неделя'];
  if (!keywords.some(k => lower.includes(k))) return '';

  if (totalWorkoutsEver < 20) {
    return '\n\n💡 Deload-неделя рекомендуется после 4-8 недель тренировок. У тебя пока не накопилась усталость для полноценного deload — просто тренируйся по плану.';
  }

  return `\n\n🔋 **Deload-неделя — полный протокол:**

**Зачем нужен deload:**
• Физическая усталость накапливается быстрее, чем ощущается
• Deload не "теряет форму" — это суперкомпенсация
• После deload: сила и мышцы больше, чем до (если питание правильное)

**Когда делать deload:**
• Каждые 4-8 недель (зависит от интенсивности)
• Признаки: сила не растёт 2 нед + усталость + мотивация упала
• Плановый: каждые 4 нед для продвинутых, каждые 6-8 нед для промежуточных

**Варианты deload:**

**1. Снижение объёма (лучший вариант):**
• Сохрани интенсивность (веса те же!)
• Сократи подходы вдвое: 4 × 8 → 2 × 8
• Сохрани упражнения и частоту

**2. Снижение интенсивности:**
• Снизь веса на 40-50%
• Сохрани объём подходов
• Добавь технические упражнения с лёгким весом

**3. Активный отдых:**
• Полностью замени тренировки: плавание, велосипед, йога, пешие прогулки
• Хорошо психологически, но теряешь нейромышечный тонус

**Питание в deload:**
• Калории НЕ снижай! Тело восстанавливается — нужны ресурсы
• Белок: норма. Углеводы: норма или чуть выше

💡 Если "страшно" делать deload → значит, он тебе очень нужен.`;
}
export function getOfficeStretchBreaks(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['сидячая работа', 'офис', 'весь день за компьютером', 'спина от сидения', 'office', 'перерыв на растяжку', 'болит спина от стула'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n💼 **Перерывы на движение при сидячей работе:**

**Почему критично:**
• Сидение > 8 часов в день → риск метаболических заболеваний, даже если тренируешься
• Каждый час статического сидения компрессирует диски + укорачивает сгибатели бедра

**Протокол 20-2:**
Каждые 20 минут вставай на 2 минуты — это минимум для нейтрализации вреда от сидения.

**Упражнения у стола (2 минуты):**
• Встань-сядь × 10 (это приседание — мышцы + кровообращение)
• Потяни голову в сторону 15 сек каждую
• Вращение плечами назад × 10
• Наклон в стороны × 5 каждую

**5-минутный блок (каждые 2 часа):**
• Кошка-корова 10 повторений (поясница)
• Сгибатели бедра: выпад с рукой вверх 30 сек/сторону
• Грудная мышца: дверной проём 30 сек
• Ходьба хотя бы 3-5 минут

**Оборудование у стола:**
• Стол-стойка (регулируемый): чередуй сидение и стоя по 30 мин
• Мяч для баланса вместо стула (нагружает кор пассивно)
• Шагомер/напоминалка: 250 шагов в час минимум

💡 Тренировка 1 час + сидение 15 часов = всё равно "сидячий образ жизни" по данным WHO.`;
}
export function getEatingForRecovery(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('восстановлен') && (lower.includes('еда') || lower.includes('питан')) ||
    lower.includes('боль') && lower.includes('питан') || lower.includes('крепатура') && lower.includes('еда') ||
    lower.includes('что есть после') || lower.includes('питание для восстановления');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🥗 ПИТАНИЕ ДЛЯ ВОССТАНОВЛЕНИЯ МЫШЦ:');
  lines.push('');
  lines.push('🔑 КЛЮЧЕВЫЕ НУТРИЕНТЫ:');
  lines.push('• Белок (2–2.5 г/кг) — строительный материал');
  lines.push('• Углеводы (3–5 г/кг при наборе) — гликоген + инсулиновый отклик');
  lines.push('• Омега-3 (2–3 г EPA+DHA) — снижает воспаление');
  lines.push('• Антиоксиданты — ягоды, зелень (умеренно: не блокируй адаптацию)');
  lines.push('• Цинк + магний — ночное восстановление');
  lines.push('');
  lines.push('⏰ ТАЙМИНГ:');
  lines.push('• В течение 2 ч после тренировки: 30–40 г белка + 50–80 г углеводов');
  lines.push('• Перед сном: казеин или творог (2 г/кг в день суммарно)');
  lines.push('• Следующий день после тяжёлой тренировки: +200–300 ккал сверх нормы');
  lines.push('');
  lines.push('🚫 ЧТО МЕШАЕТ ВОССТАНОВЛЕНИЮ В ПИТАНИИ:');
  lines.push('• Алкоголь — блокирует синтез белка на 24–48 ч');
  lines.push('• Дефицит калорий >500 ккал — замедляет репарацию');
  lines.push('• Недостаток углеводов — высокий кортизол');
  lines.push('');
  lines.push('💊 ТОП ДОБАВКИ ДЛЯ ВОССТАНОВЛЕНИЯ:');
  lines.push('• Магний глицинат 400 мг (на ночь)');
  lines.push('• Омега-3 2–3 г/день');
  lines.push('• Витамин D3 2000–4000 МЕ/день');
  return '\n\n' + lines.join('\n');
}
export function getInterSessionRecovery(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('между тренировками') || lower.includes('отдых между') ||
    lower.includes('не восстановился') || lower.includes('ещё болит') && lower.includes('тренировать') ||
    lower.includes('сколько отдыхать') || lower.includes('дни отдыха');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('♻️ ВОССТАНОВЛЕНИЕ МЕЖДУ ТРЕНИРОВКАМИ:');
  lines.push('');
  lines.push('⏱️ МИНИМАЛЬНОЕ ВРЕМЯ ВОССТАНОВЛЕНИЯ:');
  lines.push('• Маленькие группы мышц (бицепс, трицепс): 48 ч');
  lines.push('• Средние (грудь, плечи, спина): 48–72 ч');
  lines.push('• Крупные (ноги, спина + ноги): 72–96 ч');
  lines.push('• После высокообъёмной тренировки: +24 ч к норме');
  lines.push('');
  lines.push('📊 КАК ПОНЯТЬ, ГОТОВ ЛИ МЫШЦЕЙ:');
  lines.push('• Крепатура прошла? Нет острой боли при пальпации?');
  lines.push('• ЧСС в покое не выше нормы (+5 уд/мин = не восстановился)?');
  lines.push('• Мотивация и энергия в норме?');
  lines.push('');
  lines.push('🟢 ЧТО УСКОРЯЕТ ВОССТАНОВЛЕНИЕ:');
  lines.push('• Белок 2 г/кг/день + углеводы после тренировки');
  lines.push('• Сон 7–9 часов');
  lines.push('• Активное восстановление: лёгкая ходьба, плавание');
  lines.push('• Контрастный душ (3×30 сек горячий / 30 сек холодный)');
  lines.push('• Магний 400 мг на ночь');
  lines.push('');
  lines.push('❌ ЧТО МЕШАЕТ:');
  lines.push('• Алкоголь (даже 2–3 бокала: синтез белка -20% на 12 ч)');
  lines.push('• Недосып, стресс, дефицит еды');
  return '\n\n' + lines.join('\n');
}
export function getActiveRecoveryDay(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('активное восстановлен') || lower.includes('день отдыха') &&
    lower.includes('что делать') || lower.includes('лёгкая тренировка') || lower.includes('deload day') ||
    lower.includes('восстановительный день') || lower.includes('что в выходной');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🌿 ПРОТОКОЛ АКТИВНОГО ВОССТАНОВЛЕНИЯ:');
  lines.push('');
  lines.push('✅ ЧТО ДЕЛАТЬ В ДЕНЬ ОТДЫХА:');
  lines.push('');
  lines.push('🚶 ЛЁГКОЕ ДВИЖЕНИЕ (30–45 мин):');
  lines.push('• Прогулка 5–7 км (не бег!)');
  lines.push('• Велосипед в лёгком темпе');
  lines.push('• Плавание 20–30 мин (восстанавливающий темп)');
  lines.push('• Йога или стретчинг 30 мин');
  lines.push('');
  lines.push('🧘 ВОССТАНОВИТЕЛЬНЫЕ ПРАКТИКИ:');
  lines.push('• Пенный роллер / массаж (10–15 мин)');
  lines.push('• Контрастный душ');
  lines.push('• Медитация или дыхательные упражнения (снижает кортизол)');
  lines.push('');
  lines.push('🍽️ ПИТАНИЕ В ДЕНЬ ОТДЫХА:');
  lines.push('• Калории: −100 до −200 от тренировочного дня');
  lines.push('• Белок: не снижать! 2 г/кг по-прежнему нужен');
  lines.push('• Углеводы: можно снизить (меньше тренировочной нагрузки)');
  lines.push('');
  lines.push('❌ ЧТО НЕ ДЕЛАТЬ:');
  lines.push('• Полный диван — хуже лёгкого движения для восстановления');
  lines.push('• Алкоголь — убивает восстановление');
  lines.push('• Долгое кардио (>60 мин) — не восстановительная нагрузка');
  return '\n\n' + lines.join('\n');
}
export function getPersonalizedFrequencyAdvice(message: string, totalWorkoutsEver: number, plannedDays: number): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('сколько раз') || lower.includes('частота') || lower.includes('раз в неделю') ||
    lower.includes('дней в неделю') || lower.includes('как часто тренироваться');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📅 ПЕРСОНАЛИЗИРОВАННАЯ ЧАСТОТА ТРЕНИРОВОК:');
  lines.push('');
  const experienceLevel = totalWorkoutsEver < 30 ? 'новичок' : totalWorkoutsEver < 100 ? 'средний' : 'опытный';
  lines.push(`🎯 Твой уровень: ${experienceLevel} (${totalWorkoutsEver} тренировок)`);
  lines.push(`📌 Текущий план: ${plannedDays} дней/неделю`);
  lines.push('');
  if (experienceLevel === 'новичок') {
    lines.push('🔰 РЕКОМЕНДАЦИЯ ДЛЯ НОВИЧКА:');
    lines.push('• 3 дня/нед — оптимум (полн-боди каждый раз)');
    lines.push('• Понедельник / Среда / Пятница (день отдыха между)');
    lines.push('• Почему: новичок растёт от 3×/нед так же, как от 5×/нед');
    lines.push('• Отдых важнее объёма на начальном этапе');
  } else if (experienceLevel === 'средний') {
    lines.push('📈 РЕКОМЕНДАЦИЯ ДЛЯ СРЕДНЕГО УРОВНЯ:');
    lines.push('• 4 дня/нед — Upper/Lower или Push/Pull');
    lines.push('• Каждая мышечная группа 2×/нед минимум');
    lines.push('• Объём важнее частоты свыше 2×/нед');
  } else {
    lines.push('🏆 РЕКОМЕНДАЦИЯ ДЛЯ ОПЫТНОГО:');
    lines.push('• 4–6 дней/нед в зависимости от целей');
    lines.push('• Специализация возможна (3× на приоритетную группу)');
    lines.push('• Следи за перетренированностью — ЧСС в покое, мотивация');
  }
  lines.push('');
  lines.push('⚠️ Больше — не всегда лучше. Прогресс = объём + восстановление.');
  return '\n\n' + lines.join('\n');
}
export function getFoamRollingAdvanced(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('пенный ролл') || lower.includes('foam roll') || lower.includes('миофасц') ||
    lower.includes('массаж рол') || lower.includes('раскатка') || lower.includes('триггерные точки') ||
    lower.includes('самомассаж');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🎯 ПЕННЫЙ РОЛЛ И САМОМИОФАСЦИАЛЬНЫЙ РЕЛИЗ:');
  lines.push('');
  lines.push('🔬 КАК ЭТО РАБОТАЕТ:');
  lines.push('• Снижает тонус мышц через аутогенное торможение');
  lines.push('• Улучшает кровоток и питание тканей');
  lines.push('• Размягчает фасциальные спайки (частично)');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ:');
  lines.push('• ДО тренировки: 30–60 сек/зону, медленно (улучшает подвижность)');
  lines.push('• ПОСЛЕ тренировки: 1–2 мин/зону (восстановление)');
  lines.push('• Найди болезненную точку → задержись 20–30 сек');
  lines.push('');
  lines.push('📍 КЛЮЧЕВЫЕ ЗОНЫ:');
  lines.push('• Икры: по 60 сек каждая (важно при беге)');
  lines.push('• ИТБ (латеральная поверхность бедра): медленно, с паузами');
  lines.push('• Грудной отдел: лёжа на ролле поперёк спины');
  lines.push('• Широчайшие: на боку от подмышки вниз');
  lines.push('• Ягодичные: сидя на ролле, одна нога на другой');
  lines.push('');
  lines.push('⚠️ НЕ РАСКАТЫВАЙ:');
  lines.push('• Поясницу (кости позвоночника, не мышцы → вред)');
  lines.push('• Суставы, места с острой болью, воспалённые участки');
  return '\n\n' + lines.join('\n');
}
export function getLoadedStretching(message: string): string {
  const relevant = /нагруженн.+растяжк|loaded stretch|растяжк.+с весом|гибкость.+сила|активн.+растяжк|rdl stretch/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤸 НАГРУЖЕННОЕ РАСТЯЖЕНИЕ — быстрый путь к гибкости:');
  lines.push('');
  lines.push('🔬 ПРИНЦИП:');
  lines.push('• Обычное растяжение: пассивное удлинение');
  lines.push('• Нагруженное: растяжение ПОД НАГРУЗКОЙ → ремоделирование соединительной ткани');
  lines.push('• Результат: гибкость + сила в крайних положениях (функциональная)');
  lines.push('');
  lines.push('📋 ПРИМЕРЫ:');
  lines.push('• RDL на прямых ногах → хамстринги + разгибатели спины');
  lines.push('• Болгарский присед → сгибатели бедра');
  lines.push('• Копенгагенская планка → приводящие');
  lines.push('• Глубокий присед с паузой с весом → голеностоп + бёдра');
  lines.push('');
  lines.push('⚡ ПРОТОКОЛ:');
  lines.push('• 3–5 подходов × 30–60 сек выдержки');
  lines.push('• Лёгкий вес (30–50% от рабочего)');
  lines.push('• Контролируемое снижение в конечную точку амплитуды');
  lines.push('');
  lines.push('⏰ КОГДА: отдельная сессия или в конце тренировки');
  return '\n\n' + lines.join('\n');
}
export function getTricepsSpecialization(message: string): string {
  const relevant = /трицепс|tricep|задняя поверхность руки|разгибани.+локт/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 СПЕЦИАЛИЗАЦИЯ НА ТРИЦЕПСАХ:');
  lines.push('');
  lines.push('🔬 АНАТОМИЯ (3 головки):');
  lines.push('• Длинная (long head): лучший рост = растяжка над головой');
  lines.push('• Латеральная (lateral): видна сбоку руки');
  lines.push('• Медиальная: базовая сила');
  lines.push('');
  lines.push('📋 ЛУЧШИЕ УПРАЖНЕНИЯ:');
  lines.push('• Французский жим лёжа: акцент на длинную головку (растяжение)');
  lines.push('• Жим узким хватом: 3 головки, большой вес');
  lines.push('• Разгибание над головой: максимальный рост длинной головки');
  lines.push('• Отжимания на брусьях: массонаборный вариант');
  lines.push('• Кабельные разгибания: изоляция, памп');
  lines.push('');
  lines.push('⚡ КЛЮЧЕВЫЕ ПРИНЦИПЫ:');
  lines.push('• Длинная головка составляет ~2/3 объёма трицепса — приоритет');
  lines.push('• Упражнения в растянутом положении > сокращённом для гипертрофии');
  lines.push('• 12–20 подходов/нед на трицепс (учитывая объём в жимах)');
  return '\n\n' + lines.join('\n');
}
export function getBicepsSpecialization(message: string): string {
  const relevant = /бицепс|bicep|сгибани.+руки|рост бицепса|накачать руки/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 СПЕЦИАЛИЗАЦИЯ НА БИЦЕПСАХ:');
  lines.push('');
  lines.push('🔬 АНАТОМИЯ (2 головки):');
  lines.push('• Длинная (outer): "пик" бицепса, работает при вращении запястья');
  lines.push('• Короткая (inner): объём, виден спереди');
  lines.push('• Брахиалис (brachialis): под бицепсом, "толкает" его вверх');
  lines.push('');
  lines.push('📋 ЛУЧШИЕ УПРАЖНЕНИЯ:');
  lines.push('• Сгибания со штангой: базовый объём, большой вес');
  lines.push('• Молотковый хват (hammer curl): брахиалис + брахирадиалис');
  lines.push('• Сгибания на скамье Скотта: изоляция, пик бицепса');
  lines.push('• Концентрированные сгибания: максимальный пик');
  lines.push('• Сгибания в кабеле: постоянное напряжение');
  lines.push('');
  lines.push('⚡ КЛЮЧЕВЫЕ ПРИНЦИПЫ:');
  lines.push('• Полная амплитуда: разгибай в нижней точке до конца');
  lines.push('• Супинация (поворот запястья наружу) = активация длинной головки');
  lines.push('• 10–18 подходов/нед, диапазон 8–15 повторений');
  lines.push('• Брахиалис важен для объёма — не забывай молотковый хват');
  return '\n\n' + lines.join('\n');
}
export function getDeloadWeekProgramming(message: string): string {
  const relevant = /разгрузочн.+недел|deload week|когда делать разгрузку|как разгрузиться|deload program/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔄 РАЗГРУЗОЧНАЯ НЕДЕЛЯ — как правильно:');
  lines.push('');
  lines.push('🎯 КОГДА ДЕЛАТЬ РАЗГРУЗКУ:');
  lines.push('• По плану: каждые 4–8 недель интенсивных тренировок');
  lines.push('• По сигналам: сила упала >10%, хроническая усталость, нет мотивации');
  lines.push('• После соревнований/максимальных подходов');
  lines.push('');
  lines.push('📋 МЕТОДЫ РАЗГРУЗКИ:');
  lines.push('① Снижение веса: 40–60% от обычного, сохраняй объём');
  lines.push('② Снижение объёма: 50% подходов, сохраняй вес');
  lines.push('③ Снижение частоты: 1–2 тренировки вместо 4–5');
  lines.push('④ Полный отдых: только при severe overtraining');
  lines.push('');
  lines.push('🔬 ПОЧЕМУ ПОМОГАЕТ:');
  lines.push('• Восстановление ЦНС (гормональный баланс)');
  lines.push('• Консолидация нейромышечных адаптаций');
  lines.push('• Суперкомпенсация: после разгрузки → рекорды');
  lines.push('');
  lines.push('⚠️ РАЗГРУЗКА ≠ "пропуск тренировок" — это спланированное снижение стресса');
  return '\n\n' + lines.join('\n');
}
export function getTrainingInHeat(message: string): string {
  const relevant = /жара|летом|жарко.+тренировк|тренировка.+жара|heat training|high temperature/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🌡️ ТРЕНИРОВКИ В ЖАРУ — адаптация и безопасность:');
  lines.push('');
  lines.push('⚠️ ФИЗИОЛОГИЧЕСКИЕ ИЗМЕНЕНИЯ В ЖАРУ:');
  lines.push('• ЧСС при той же нагрузке выше на 5–10 уд/мин');
  lines.push('• Сила снижается на 5–20% при температуре >30°C');
  lines.push('• Потеря жидкости с потом: 1–2.5 л/ч при интенсивной нагрузке');
  lines.push('');
  lines.push('📋 АДАПТАЦИЯ (7–14 дней):');
  lines.push('• Тело учится охлаждаться эффективнее');
  lines.push('• Объём плазмы увеличивается (+10–12%)');
  lines.push('• Потоотделение начинается раньше');
  lines.push('');
  lines.push('🔧 ПРАКТИЧЕСКИЕ СОВЕТЫ:');
  lines.push('• Тренируйся ранним утром (6–8ч) или вечером (после 19ч)');
  lines.push('• Снизи интенсивность на 10–20% в первые 2 нед жары');
  lines.push('• Пей 200–300 мл воды каждые 15–20 мин');
  lines.push('• Добавь электролиты при тренировке >60 мин');
  lines.push('• Холодный полотенец на шею = снижение температуры');
  lines.push('');
  lines.push('🚨 СТОП: головокружение, тошнота, прекращение потоотделения = тепловой удар!');
  return '\n\n' + lines.join('\n');
}
export function getDeloadIndicatorsAdvanced(message: string, totalWorkoutsEver: number): string {
  const keywords = ['деload', 'делоад', 'разгрузоч', 'перетренир признак', 'нужен ли отдых', 'когда делоад'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📊 ПРОДВИНУТЫЕ ИНДИКАТОРЫ ДЕLOAD:');
  lines.push('');
  lines.push('🔴 СРОЧНО НУЖЕН ДЕLOAD (3+ совпадений):');
  lines.push('• Силовые показатели упали на 10%+ 2 тренировки подряд');
  lines.push('• Пульс покоя утром выше нормы на 5+ уд/мин');
  lines.push('• Сон ухудшился без внешних причин');
  lines.push('• Мотивация на нуле 3+ дня подряд');
  lines.push('• Постоянная болезненность суставов (не мышц!)');
  lines.push('• Аппетит пропал или наоборот неконтролируемый голод');
  lines.push('');
  lines.push('🟡 ПЛАНОВЫЙ ДЕLOAD:');
  if (totalWorkoutsEver < 50) {
    lines.push('• Для новичка: каждые 6-8 недель интенсивных тренировок');
  } else if (totalWorkoutsEver < 200) {
    lines.push('• Для среднего уровня: каждые 4-6 недель');
  } else {
    lines.push('• Для продвинутого: каждые 3-4 недели или по ощущениям');
  }
  lines.push('');
  lines.push('📋 ВАРИАНТЫ ДЕLOAD:');
  lines.push('• Лёгкий: -40% объём, вес тот же');
  lines.push('• Средний: -50% вес, объём тот же');
  lines.push('• Полный: только лёгкое кардио и мобильность, 5-7 дней');
  lines.push('');
  lines.push('✅ ПОСЛЕ ДЕLOAD: обычно суперкомпенсация — новые ПР на 1-2 неделе');
  return '\n\n' + lines.join('\n');
}
export function getTrainingJournalPractices(message: string): string {
  const keywords = ['дневник тренировок', 'журнал тренир', 'записыва тренировк', 'training journal', 'вести лог', 'отслежива прогресс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📓 ТРЕНИРОВОЧНЫЙ ДНЕВНИК — ЛУЧШИЕ ПРАКТИКИ:');
  lines.push('');
  lines.push('❓ ЗАЧЕМ ВЕСТИ:');
  lines.push('• Объективный прогресс (не "мне кажется стал сильнее")');
  lines.push('• Выявление паттернов (что работает, что нет)');
  lines.push('• Мотивация при плато (посмотри откуда начинал!)');
  lines.push('• Планирование прогрессии нагрузки');
  lines.push('');
  lines.push('📋 ЧТО ЗАПИСЫВАТЬ:');
  lines.push('• Упражнение, вес, подходы × повторения');
  lines.push('• RPE/RIR (субъективная сложность)');
  lines.push('• Общее самочувствие (1-10)');
  lines.push('• Качество сна прошлой ночью');
  lines.push('• Вес тела (утром натощак)');
  lines.push('• Заметки: боль, усталость, изменения техники');
  lines.push('');
  lines.push('💡 АНАЛИЗ:');
  lines.push('• Раз в неделю: сравни объём и интенсивность');
  lines.push('• Раз в месяц: тренды силы и массы тела');
  lines.push('• Раз в 3 месяца: пересмотр программы на основе данных');
  lines.push('');
  lines.push('📱 Giron автоматически ведёт дневник — используй историю тренировок!');
  return '\n\n' + lines.join('\n');
}
export function getTrainingInCold(message: string): string {
  const keywords = ['холод тренировк', 'зимой тренир', 'холодн погод', 'мороз', 'cold weather train', 'тренировка на улице зим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('❄️ ТРЕНИРОВКИ В ХОЛОДНУЮ ПОГОДУ:');
  lines.push('');
  lines.push('🔬 ФИЗИОЛОГИЯ:');
  lines.push('• На холоде мышцы жёстче, суставы менее подвижны');
  lines.push('• Разминка занимает больше времени (+5-10 мин)');
  lines.push('• Риск травм мышц и связок выше');
  lines.push('• ↑ расход калорий (термогенез)');
  lines.push('');
  lines.push('🏋️ В ЗАЛЕ (отопление < нормы):');
  lines.push('• Многослойная одежда: снимай по мере разогрева');
  lines.push('• Удлинённая разминка: 10-15 мин');
  lines.push('• Между подходами: не остывай (двигайся, надень кофту)');
  lines.push('');
  lines.push('🏃 НА УЛИЦЕ:');
  lines.push('• Слои: термобельё → флис → ветрозащита');
  lines.push('• Шапка + перчатки обязательно (50% теплопотерь через голову — миф, но комфорт важен)');
  lines.push('• Дыши через нос или баф (согревание воздуха)');
  lines.push('• До -15°C — безопасно при правильной экипировке');
  lines.push('• Ниже -20°C — лучше в помещении');
  lines.push('');
  lines.push('💧 ВАЖНО: пить воду! Жажда снижается на холоде, но дегидратация остаётся');
  return '\n\n' + lines.join('\n');
}
export function getFoamRollingScience(message: string): string {
  const keywords = ['пенн ролик наук', 'foam roll наук', 'ролик эффективн', 'самомассаж наук', 'помогает ли ролик', 'миофасциальн релиз наук'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔄 ПЕННЫЙ РОЛИК — ЧТО ГОВОРИТ НАУКА:');
  lines.push('');
  lines.push('✅ ДОКАЗАННЫЕ ЭФФЕКТЫ:');
  lines.push('• ↑ диапазон движения (ROM) на 10-15° краткосрочно');
  lines.push('• ↓ ощущение боли (DOMS) на 1-2 балла');
  lines.push('• ↓ напряжение мышц субъективно');
  lines.push('• НЕ снижает силу (в отличие от статической растяжки)');
  lines.push('');
  lines.push('❌ НЕ ДОКАЗАНО:');
  lines.push('• "Разбивание спаек" — фасция требует ~900кг давления для деформации');
  lines.push('• Ускорение восстановления (данные противоречивы)');
  lines.push('• Изменение структуры тканей');
  lines.push('');
  lines.push('🔬 ВЕРОЯТНЫЙ МЕХАНИЗМ: нейрологический — стимуляция рецепторов → мозг "разрешает" больший ROM');
  lines.push('');
  lines.push('📋 КАК ИСПОЛЬЗОВАТЬ ЭФФЕКТИВНО:');
  lines.push('• Перед тренировкой: 30-60 сек на группу, средний нажим');
  lines.push('• После тренировки: 1-2 мин на группу, мягче');
  lines.push('• Избегать: прямо по суставам, костям, пояснице');
  lines.push('• Не "кататься" быстро — медленно, с остановками на болезненных точках');
  return '\n\n' + lines.join('\n');
}
export function getTricepsCompleteGuide(message: string): string {
  const keywords = ['трицепс', 'triceps', 'разгибание рук', 'трёхглавая', 'французский жим', 'pushdown'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ПОЛНЫЙ ГАЙД ПО ТРИЦЕПСУ:

Анатомия:
- Длинная головка: начинается от лопатки (нужна растяжка над головой)
- Латеральная: боковая часть (даёт ширину)
- Медиальная: глубокая (стабилизация)

Лучшие упражнения по головкам:
ДЛИННАЯ (60% массы трицепса):
1. Французский жим лёжа/сидя: 3×10-12
2. Разгибания над головой (канат/гантель): 3×12-15
3. Skull crushers с наклонной скамьёй: 3×10-12

ЛАТЕРАЛЬНАЯ:
1. Pushdowns прямая рукоять: 3×10-15
2. Kickbacks: 3×12-15
3. Разгибания обратным хватом: 3×12-15

ВСЕ ГОЛОВКИ:
1. Отжимания на брусьях (узкие): 3×8-12
2. Жим узким хватом: 3×6-10
3. Diamond pushups: 3×до отказа

Программирование:
- 12-20 подходов/неделю
- 2-3 тренировки в неделю
- Обязательно: 1 упражнение над головой (длинная)
- Приоритет: compound → isolation
- Прогрессия: вес → повторения → подходы`;
}
export function getBicepsAdvancedTraining(message: string): string {
  const keywords = ['бицепс', 'biceps', 'двуглавая', 'подъём на бицепс', 'сгибание рук', 'бицуха'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ПРОДВИНУТАЯ ТРЕНИРОВКА БИЦЕПСА:

Анатомия:
- Длинная головка (внешняя): пик бицепса
- Короткая головка (внутренняя): толщина
- Брахиалис: под бицепсом (поднимает пик визуально)

По головкам:
ДЛИННАЯ (пик):
1. Сгибания на наклонной скамье (45°): 3×10-12
2. Drag curls (тяга вдоль тела): 3×10-12
3. Сгибания узким хватом: 3×10-12

КОРОТКАЯ (толщина):
1. Preacher curls (скамья Скотта): 3×10-12
2. Spider curls (на наклонной): 3×10-12
3. Concentration curls: 3×10-12

БРАХИАЛИС (визуальный пик):
1. Молотковые сгибания: 3×10-12
2. Обратные сгибания (пронация): 3×12-15
3. Cross-body hammer curls: 3×10-12

Ключевые принципы:
- Растяжение под нагрузкой = рост (incline curls)
- Супинация в верхней точке = лучшее сокращение
- Не забывайте про брахиалис (30% обхвата руки!)
- 12-20 подходов в неделю
- Полная амплитуда > тяжёлый вес

Частые ошибки:
- Раскачка корпусом (читинг)
- Подъём плеч (передняя дельта)
- Неполная амплитуда (особенно внизу)`;
}
export function getOverheadTricepsExtGuide(message: string): string {
  const keywords = ['французский жим', 'overhead extension', 'разгибание над головой', 'трицепс над головой', 'длинная головка трицепса'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 РАЗГИБАНИЕ НАД ГОЛОВОЙ — ДЛИННАЯ ГОЛОВКА ТРИЦЕПСА:

Почему именно над головой:
- Длинная головка трицепса = 2/3 объёма руки
- Растягивается ТОЛЬКО при руке над головой
- Растянутая мышца генерирует больше силы (stretch-mediated hypertrophy)
- Исследование Maeo (2023): overhead > pushdown для гипертрофии

Вариации (от лучших к хорошим):
1. На нижнем блоке с канатом (стоя спиной): постоянное натяжение
2. С гантелей двумя руками (сидя): классика
3. Французский жим со штангой (лёжа): тяжёлый вес
4. С EZ-грифом (лёжа или сидя): комфорт для запястий
5. Одной рукой с гантелей: коррекция асимметрии

Техника (общие принципы):
- Локти смотрят вперёд, не разъезжаются
- Полное растяжение внизу (ключевой момент!)
- Полное разгибание наверху
- Контролируемый негатив (3 секунды)
- Корпус стабилен, не раскачивается

Программирование:
- 3-4×10-15 повторений
- Первое упражнение на трицепс (приоритет overhead)
- Минимум 6-8 подходов overhead-движений в неделю
- Суперсет: overhead extension + pushdown = полная проработка

Безопасность: при боли в локтях — используйте EZ-гриф или канат (нейтральный хват).`;
}
export function getBeetJuicePerformance(message: string): string {
  const keywords = ['свекольный сок', 'beet juice', 'нитраты', 'свёкла спорт', 'оксид азота свёкла'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🟣 СВЕКОЛЬНЫЙ СОК (НИТРАТЫ) ДЛЯ СПОРТА — НАУКА:

Механизм: нитраты → нитриты → оксид азота (NO). Расширение сосудов, улучшение кровотока.

Доказанные эффекты (уровень A):
- Улучшение экономичности движения на 5-7% (меньше кислорода на ту же работу)
- Повышение выносливости: +3-5% время до утомления
- Увеличение мощности при спринтах
- Снижение систолического давления на 4-10 мм рт.ст.
- Улучшение когнитивных функций

Дозировка:
- 6.4-12.8 ммоль нитратов (400-800мг)
- ≈500 мл свекольного сока или 1-2 шота концентрата
- За 2-3 часа до нагрузки (пик через 2-3 ч)
- Хроническая загрузка: 3-7 дней подряд (эффект выше)

Для каких видов спорта:
- Бег, велоспорт, плавание (выносливость)
- Командные игры (повторные спринты)
- Кроссфит (метконы)
- Менее выражен: чистая сила (но NO = пампинг)

Важные нюансы:
- НЕ полоскать рот антисептиком (убивает бактерии, конвертирующие нитраты)
- НЕ пить кофе вместе (может снижать эффект)
- Побочка: красная моча/стул (безвредно)
- Жевательная резинка с антисептиком тоже снижает эффект

Дешёвая альтернатива: варёная свёкла 200-300г за 2 часа до тренировки.`;
}
export function getTricepPushdownVariations(message: string): string {
  const relevant = /разгибани.+блок.+вариац|трицепс.+блок.+виды|tricep.?pushdown|трицепс.+верхн.+блок|разгибани.+рук.+блок/i.test(message);
  if (!relevant) return '';
  return `
💪 РАЗГИБАНИЯ НА БЛОКЕ — ВСЕ ВАРИАЦИИ ДЛЯ ТРИЦЕПСА:

Анатомия трицепса:
- Длинная головка: ~50% объёма, начинается от лопатки
- Латеральная: внешняя часть, «подковообразный» вид
- Медиальная: глубокая, работает во всех движениях

Вариации по рукояткам:
1. Прямая рукоять (пронация):
   - Акцент на латеральную головку
   - Классический вариант, 3×10-12
   - Хват на ширине плеч, локти прижаты

2. Канатная рукоять (rope):
   - Разводить концы в стороны внизу (пиковое сокращение)
   - Все 3 головки равномерно
   - Бо́льшая амплитуда чем прямая рукоять
   - 3×12-15, акцент на разведение внизу

3. V-рукоять:
   - Нейтральный хват, комфорт для запястий
   - Средний акцент на все головки
   - Хорош для тяжёлых подходов

4. Обратный хват (супинация):
   - Акцент на медиальную головку
   - Лёгкий вес, высокие повторения (12-20)
   - Полезно для баланса между головками

5. Одной рукой:
   - Устранение дисбаланса между руками
   - Можно менять углы для каждой головки
   - Отведение руки чуть назад = длинная головка

Техника — золотые правила:
- Локти ПРИЖАТЫ к корпусу (не разводить!)
- Движение ТОЛЬКО в локтевом суставе
- Полное разгибание внизу + пауза 1 сек
- Контролируемый возврат (не «бросать»)
- Корпус слегка наклонён вперёд (~10-15°)

Программирование:
- Масса: канатная 3×10-12 + прямая 3×8-10
- Рельеф: дроп-сеты × 3 сброса на каждой вариации
- Суперсет: разгибание + обратный хват = все 3 головки`;
}
export function getCNSRecoveryProtocol(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['цнс восстановление', 'cns recovery', 'нервная система восстановление', 'центральная нервная', 'нервная усталость', 'цнс утомление'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🧠 ВОССТАНОВЛЕНИЕ ЦНС — ПРОТОКОЛ ДЛЯ АТЛЕТОВ:

═══ ЧТО ТАКОЕ УТОМЛЕНИЕ ЦНС ═══
• ЦНС = головной и спинной мозг + моторные нейроны
• При тяжёлых нагрузках: снижается способность генерировать максимальную силу
• НЕ мышцы устали, а НЕРВНАЯ СИСТЕМА не может их полноценно активировать
• Особенно после: тяжёлых синглов, становой, приседов с максимальным весом

═══ ПРИЗНАКИ УТОМЛЕНИЯ ЦНС ═══
• «Нет искры» — не можешь взрывно поднимать даже лёгкий вес
• Замедленная реакция, снижение координации
• Веса ощущаются тяжелее, чем обычно
• Нежелание тренироваться тяжело (тело «не включается»)
• Tremor (лёгкая дрожь) при максимальных усилиях

═══ ЧТО УТОМЛЯЕТ ЦНС СИЛЬНЕЕ ВСЕГО ═══
• Синглы и двойки (>90% 1RM): максимальная рекрутация
• Становая тяга: больше всего мышечных групп + grip
• Тренировки до отказа: чем чаще, тем больше нагрузка на ЦНС
• Прыжки и плиометрика: взрывная нагрузка
• Частые maxout-тренировки без восстановления

═══ ПРОТОКОЛ ВОССТАНОВЛЕНИЯ ═══
Ежедневно:
• Сон 8-9 часов (ЦНС восстанавливается ТОЛЬКО во сне)
• Магний глицинат: 300-400 мг перед сном
• Прогулка 20-30 мин (активное восстановление ЦНС)
• Дыхательная практика: 4-7-8 (вдох 4 сек, задержка 7, выдох 8)

После тяжёлой тренировки:
• 48-72 часа до следующей тяжёлой нагрузки
• День после: только лёгкая работа (<60% 1RM)
• Медитация/визуализация: 10-15 мин (снижает кортизол)
• Контрастный душ: 30 сек холод / 60 сек тепло × 5 циклов

После соревнований/тестирования максимумов:
• 5-7 дней без тяжёлых нагрузок
• Лёгкое кардио, растяжка, мобильность
• Повышенный сон: +1-2 часа/день
• Питание: профицит калорий, много углеводов

═══ ДОБАВКИ ДЛЯ ЦНС ═══
• Магний: 300-400 мг (расслабление нервной системы)
• Омега-3: 2-4 г (нейропротекция)
• Альфа-GPC: 300-600 мг (поддержка ацетилхолина)
• Фосфатидилсерин: 400-800 мг (снижение кортизола)
• Креатин: 5 г/день (нейропротекция + энергия мозга)

═══ ПРОГРАММИРОВАНИЕ ДЛЯ СОХРАНЕНИЯ ЦНС ═══
• Чередовать тяжёлые/лёгкие дни (не два тяжёлых подряд)
• RPE 7-8 на большинстве тренировок (не до отказа)
• Deload каждые 4-6 недель (50% объёма)
• Вариативность: менять упражнения каждые 3-4 недели
`;
}
export function getHeatColdTrainingAdaptations(message: string): string {
  const keywords = ['жар', 'холод', 'температур', 'тренировк лет', 'тренировк зим', 'закалива', 'сауна тренировк', 'ледяная ванна'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Тренировки в жару и холоде — адаптации

### Тренировки в жару (>30°C)
**Физиология:**
• ЧСС ↑ на 10-20 уд/мин при той же нагрузке
• Потоотделение: до 2-3 л/час
• Кровь перераспределяется к коже → меньше к мышцам
• Производительность ↓ на 10-20%

**Адаптация (heat acclimation):**
• 10-14 дней тренировок в жаре → организм адаптируется
• Потоотделение начинается раньше, объём пота ↑
• ЧСС нормализуется, температура ядра снижается
• Плазма крови ↑ на 10-15% (больше кислорода)

**Практические советы:**
• Снизь интенсивность на 20-30% в первые дни
• Пей 200-300 мл каждые 15-20 мин
• Электролиты обязательны при >60 мин
• Тренируйся утром (до 10:00) или вечером (после 18:00)
• Лёгкая, дышащая одежда

### Тренировки в холоде (<5°C)
**Физиология:**
• Мышцы холодные = менее эластичные → риск травм ↑
• Суставная жидкость густеет → скованность
• Бронхоспазм при дыхании холодным воздухом
• Калории ↑ (термогенез для обогрева)

**Преимущества:**
• Бурый жир: активация при холоде → дополнительное сжигание калорий
• Норадреналин ↑ на 200-300% (краткосрочно)
• Противовоспалительный эффект
• Закалка иммунитета (при постепенном привыкании)

**Практические советы:**
• Удлини разминку до 15-20 мин (суставы, динамическая растяжка)
• Слоёная одежда (базовый + утепляющий + ветрозащитный)
• Дыши через нос (согревает воздух)
• Не растягивайся на холоде статически (мышцы не готовы)
• После тренировки: сразу в тепло, сухая одежда

### Сауна как тренировочный инструмент
• 15-20 мин при 80-100°C, 2-3 раза/неделю
• ↑ ГР на 200-300% (краткосрочный пик)
• ↑ Heat Shock Proteins → защита мышечных волокон
• ↑ Плазма крови → лучшая кардиовыносливость (+7%)
• После силовой: через 30+ мин (не сразу — мешает mTOR)

### Холодовое воздействие (ice bath)
• 10-15°C, 2-5 мин, после тренировки
• Снижение DOMS (но может замедлять гипертрофию!)
• Лучше в дни без силовых тренировок
• Или использовать только при двух тренировках/день
`;
}
export function getBicepsScienceComplete(message: string): string {
  const keywords = ['бицепс', 'bicep', 'сгибание рук', 'двуглав плеч', 'бицуха', 'руки накач'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Бицепс — наука тренировки

### Анатомия
**Двуглавая мышца плеча (biceps brachii):**
• Длинная головка: наружная, формирует «пик»
• Короткая головка: внутренняя, создаёт «толщину»
• Обе: сгибание локтя + супинация предплечья

**Плечевая мышца (brachialis):**
• Под бицепсом, «выталкивает» его визуально
• Активация: нейтральный или пронированный хват
• Hammer curls, reverse curls

**Плечелучевая (brachioradialis):**
• Предплечье, видна при сгибании
• Активация: нейтральный хват (молотковые)

### EMG по упражнениям
1. Сгибания с гантелями (супинация): длинная головка 95%
2. Сгибания со штангой стоя: обе головки 90%
3. Preacher Curl: короткая головка 92%
4. Incline DB Curl: длинная головка 94% (максимальный стретч!)
5. Hammer Curl: brachialis 88%, длинная 80%
6. Concentration Curl: пик сокращения 90%
7. Spider Curl: короткая головка 88%

### Стратегия максимальной гипертрофии
**Принцип:** тренировать бицепс из разных позиций плеча:

**Плечо за корпусом (разгибание):**
• Incline Dumbbell Curl (30-45°): стретч длинной головки
• Cable Curl за спиной: постоянное напряжение в стретче

**Плечо нейтрально (вертикально):**
• Barbell Curl стоя: обе головки равномерно
• Hammer Curl: brachialis + длинная головка

**Плечо перед корпусом (сгибание):**
• Preacher Curl: акцент на короткую + пик сокращения
• Spider Curl: максимальное сокращение вверху

### Программа «Максимальный бицепс»
**Тренировка А (стретч-фокус):**
• Incline DB Curl: 3×10-12
• Barbell Curl: 3×8-10
• Hammer Curl: 2×12-15

**Тренировка Б (сокращение-фокус):**
• Preacher Curl (EZ-гриф): 3×10-12
• Cable Curl: 3×12-15
• Concentration Curl: 2×12-15

### Объём и частота
• 10-14 прямых подходов/неделю (+ косвенная нагрузка от тяг)
• 2 раза/неделю: оптимально для гипертрофии
• Бицепс — малая мышца, восстанавливается быстро (48ч)
• НЕ нужно 20+ подходов — бесполезный объём

### Частые ошибки
• Слишком тяжёлый вес → читинг (раскачка, подключение спины)
• Неполная амплитуда (не разгибаешь полностью внизу)
• Игнорирование brachialis (только прямые сгибания)
• Слишком быстрый темп (3 сек негатив = ключ)
`;
}
export function getTricepsThreeHeadTraining(message: string): string {
  const keywords = ['трицепс', 'tricep', 'трёхглав', 'разгибан рук', 'задняя рук', 'трицуха'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Трицепс — тренировка всех трёх головок

### Анатомия
**Длинная головка (long head):**
• Самая большая, от лопатки
• Функция: разгибание локтя + приведение плеча
• Активация: руки НАД головой (overhead)
• Визуально: формирует массу и «подкову» сзади

**Латеральная головка (lateral head):**
• Наружная, видна сбоку
• Активация: жимы узким хватом, pushdown пронированным хватом
• Визуально: «подковообразная» форма снаружи

**Медиальная головка (medial head):**
• Глубокая, под двумя другими
• Работает во ВСЕХ разгибаниях (стабилизатор)
• Активация: лёгкий вес, обратный хват pushdown
• Визуально: не видна, но «выталкивает» другие головки

### Лучшие упражнения по EMG

**Длинная головка:**
1. Overhead Triceps Extension (гантель/штанга): EMG 95%
2. Skull Crushers (за голову): EMG 90%
3. Cable Overhead Extension: EMG 92%

**Латеральная головка:**
1. Cable Pushdown (прямая рукоятка, пронация): EMG 90%
2. Close-Grip Bench Press: EMG 88%
3. Dips (вертикальное положение): EMG 87%

**Медиальная головка:**
1. Reverse Grip Pushdown: EMG 85%
2. Close-Grip Bench (лёгкий вес): EMG 82%
3. Diamond Push-ups: EMG 80%

### Программа «3D-трицепс»
**Тренировка А (тяжёлая):**
• Close-Grip Bench Press: 4×6-8 (все головки)
• Overhead DB Extension: 3×10-12 (длинная)
• Cable Pushdown: 3×12-15 (латеральная)

**Тренировка Б (помповая, через 3-4 дня):**
• Dips (с весом или без): 3×8-12
• Skull Crushers: 3×10-12
• Reverse Grip Pushdown: 2×15-20 (медиальная)
• Kickbacks: 2×15 (финишер, пиковое сокращение)

### Объём и частота
• 10-14 прямых подходов/неделю
• + косвенная нагрузка от жимов лёжа и стоя
• 2 раза/неделю: оптимально
• Трицепс = 2/3 объёма руки (больше, чем бицепс!)

### Частые ошибки
• Игнорирование длинной головки (только pushdown)
• Слишком тяжёлый вес → локти разъезжаются
• Неполная амплитуда (не разгибаешь полностью)
• Рывки вместо контролируемого разгибания
`;
}
export function getPostWorkoutRecoveryProtocol(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['после тренировки', 'восстановление после', 'post workout', 'recovery protocol', 'что делать после тренировки', 'заминка', 'пост-тренировка', 'post-workout', 'восстановление мышц после'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🔄 ПРОТОКОЛ ВОССТАНОВЛЕНИЯ ПОСЛЕ ТРЕНИРОВКИ

⏰ ПЕРВЫЕ 30 МИНУТ:

1. ЗАМИНКА (5-10 мин):
• Лёгкое кардио (ходьба, велосипед): снижает ЧСС постепенно
• Предотвращает застой крови в мышцах (головокружение)
• Ускоряет выведение лактата на 25-30%

2. РАСТЯЖКА (5-10 мин):
• Статическая растяжка работавших мышц: 2x20-30 сек
• После тренировки = безопасно (мышцы тёплые)
• Снижает мышечную ригидность
• ⚠️ Не агрессивно! Лёгкий дискомфорт, не боль

3. ГИДРАТАЦИЯ:
• Выпей 500-750 мл воды в первые 30 мин
• Если тренировка >60 мин или жарко: + электролиты (натрий 500-700мг)
• Правило: взвесься до и после тренировки → пей 1.5л на каждый потерянный кг
• Моча светло-жёлтая = гидратация ОК

⏰ 30-120 МИНУТ ПОСЛЕ:

4. ПИТАНИЕ:
• Белок: 0.4-0.55г/кг (30-50г) — запуск мышечного протеиносинтеза
• Углеводы: 0.5-1.0г/кг (40-80г) — восполнение гликогена
• Быстрые варианты:
  → Протеиновый коктейль + банан
  → Творог 200г + мёд + ягоды
  → Курица + рис (если есть время)
• Жиры: не критичны сразу после (замедляют усвоение, но не мешают)
• Полноценный приём пищи через 1-2 часа

5. COLD EXPOSURE (опционально):
• Холодный душ 2-3 мин (10-15°C): снижает воспаление
• ⚠️ НЕ сразу после гипертрофийной тренировки (подавляет mTOR)
• ОК после: тяжёлой силовой, соревнований, 2 тренировок в день
• Контрастный душ: 30 сек холодный → 2 мин тёплый × 3 цикла

⏰ 2-24 ЧАСА ПОСЛЕ:

6. АКТИВНОЕ ВОССТАНОВЛЕНИЕ:
• Лёгкая прогулка 20-30 мин: усиливает кровоток к мышцам
• Самомассаж (ролл/мяч): 5-10 мин на тренированные группы
• Лёгкая мобильность: суставная гимнастика 5-10 мин
• НЕ тренировать те же мышцы (48-72ч между нагрузками)

7. СОН:
• Первая ночь после тренировки — критическая для восстановления
• Гормон роста: пик в первые 3 часа глубокого сна
• Казеин/творог перед сном: поддержка анаболизма 6-8 часов
• Температура комнаты: 16-19°C
• Магний глицинат 400мг: улучшает засыпание после вечерней тренировки

📊 ЧЕКЛИСТ ВОССТАНОВЛЕНИЯ:
□ Заминка 5-10 мин ✓
□ Растяжка работавших мышц ✓
□ 500+ мл воды ✓
□ Белок 30-50г в первые 2ч ✓
□ Углеводы 40-80г ✓
□ Прогулка / лёгкая активность ✓
□ Сон ≥7 часов ✓
□ Роллинг/самомассаж ✓

💊 ДОБАВКИ ДЛЯ ВОССТАНОВЛЕНИЯ:
• Креатин 5г/день: ускоряет ресинтез фосфокреатина
• Омега-3 (EPA+DHA 2-3г): снижает воспаление
• Витамин D (2000-4000 МЕ): если дефицит — критичен для восстановления
• Таурин 2-3г: антиоксидант + осмолит
• Коллаген 15г + витамин C: сухожилия и связки

🚫 ЧТО НЕ ДЕЛАТЬ ПОСЛЕ ТРЕНИРОВКИ:
• Алкоголь: ↓синтез белка на 37%, ↓тестостерон, ↓гликоген
• НПВС (ибупрофен) постоянно: подавляет адаптацию мышц
• Курение: ↓доставка кислорода, ↓восстановление
• Голодание >3ч: упущенное анаболическое окно
• Тяжёлая тренировка тех же мышц на следующий день
`;
}
export function getQuadricepsDevelopmentMasterclass(message: string): string {
  const keywords = ['квадрицепс', 'quadricep', 'четырёхглав', 'четырехглав', 'бедро перед', 'ноги объём', 'разгибание ног', 'leg extension', 'передняя поверхность бедра', 'vastus', 'прямая мышца бедра'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 РАЗВИТИЕ КВАДРИЦЕПСОВ — НАУЧНЫЙ МАСТЕРКЛАСС:

📐 АНАТОМИЯ КВАДРИЦЕПСОВ:
• Прямая мышца бедра (rectus femoris) — двусуставная (сгибание бедра + разгибание колена)
• Латеральная широкая (vastus lateralis) — наружная головка, самая крупная
• Медиальная широкая (vastus medialis, «капля») — внутренняя, стабилизация колена
• Промежуточная широкая (vastus intermedius) — глубокая, под прямой мышцей

🎯 АКЦЕНТЫ ПО ГОЛОВКАМ:
ЛАТЕРАЛЬНАЯ (наружная):
• Приседания с узкой стойкой — максимальная активация
• Жим ногами с узкой постановкой
• Разгибания ног с носками внутрь

МЕДИАЛЬНАЯ («капля» VMO):
• Приседания ниже параллели — VMO активна в нижних 30°
• Разгибание ног в последних 30° ROM
• Sissy squat / Petersen step-ups
• Важна для стабильности коленного сустава

ПРЯМАЯ МЫШЦА БЕДРА:
• Разгибание ног сидя — единственное упражнение для изоляции
• Приседания с высокой постановкой стоп (hack squat)
• Выпады в ходьбе (растягивается в каждом шаге)

📊 EMG-РЕЙТИНГ УПРАЖНЕНИЙ ДЛЯ КВАДРИЦЕПСОВ:
1. Гакк-приседания — 100% (эталон)
2. Жим ногами (высокая постановка) — 95%
3. Приседания фронтальные — 92%
4. Разгибание ног — 88% (изоляция)
5. Приседания со штангой — 85% (+ задняя цепь)
6. Болгарский сплит-присед — 82%
7. Выпады — 78%

💪 ПРОГРАММА РАЗВИТИЯ КВАДРИЦЕПСОВ:
День 1 (тяжёлый):
• Фронтальные приседания 4×6-8
• Гакк-приседания 3×8-10
• Разгибание ног 3×12-15 (пауза 2 сек наверху)

День 2 (лёгкий/средний):
• Жим ногами 3×10-12
• Болгарский сплит-присед 3×10-12
• Sissy squat 2×15-20

📈 КЛЮЧЕВЫЕ ПРИНЦИПЫ:
• Объём: 16-22 рабочих подходов в неделю
• Частота: 2 раза в неделю
• Глубина приседа: чем глубже, тем больше стимул (ниже параллели = +35%)
• Темп: медленная эксцентрика 3-4 сек = больше гипертрофия
• Растянутая позиция: главный стимул для роста (lengthened partials)
• Мышечное чувство: толкать платформу/пол, а не просто «вставать»

⚠️ ЗДОРОВЬЕ КОЛЕНЕЙ:
• Разгибания НЕ вредны для коленей при правильной технике
• Полная амплитуда приседа БЕЗОПАСНЕЕ, чем половинчатая
• VMO слабость → нестабильность колена → укреплять через полные приседы
• При боли в колене: уменьшить вес, увеличить ROM, работать VMO
`;
}
export function getRecoveryModalitiesRanking(message: string): string {
  const keywords = ['методы восстановления', 'recovery modalities', 'что лучше восстановлени', 'баня восстановлени', 'массаж восстановлени', 'лёд ванна', 'криотерапи', 'контрастный душ', 'сауна', 'foam roller восстановлени', 'компрессион'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔄 МЕТОДЫ ВОССТАНОВЛЕНИЯ — РЕЙТИНГ ПО ДОКАЗАТЕЛЬСТВАМ:

🟢 УРОВЕНЬ A (сильные доказательства):

1. СОН (8-9 часов):
   • #1 метод восстановления, непревзойдённый
   • 70% гормона роста, синтез белка, восстановление ЦНС
   • Никакой метод НЕ заменяет сон
   Эффективность: ★★★★★

2. ПИТАНИЕ (белок + углеводы post-workout):
   • 30-40 г белка + углеводы в течение 2 часов
   • Синтез белка, восполнение гликогена
   • Основа всего восстановления
   Эффективность: ★★★★★

3. АКТИВНОЕ ВОССТАНОВЛЕНИЕ (лёгкое кардио):
   • 20-30 мин при 50-60% ЧСС макс
   • Усиление кровотока, выведение метаболитов
   • Ходьба, лёгкий велосипед, плавание
   Эффективность: ★★★★☆

🟡 УРОВЕНЬ B (умеренные доказательства):

4. МАССАЖ:
   • Снижение DOMS на 30%, улучшение кровотока
   • 20-30 мин через 2-6 часов после тренировки
   • Профессиональный > самомассаж
   Эффективность: ★★★★☆

5. САУНА / БАНЯ:
   • 80-100°C, 15-20 мин, 2-3 сеанса
   • Гормон роста +200-300%, кровоток, расслабление
   • НЕ сразу после тренировки (усиливает воспаление)
   • Через 2-3 часа после тренировки — оптимально
   Эффективность: ★★★☆☆

6. КОНТРАСТНЫЙ ДУШ / ВАННА:
   • 1 мин холод (10-15°C) + 2 мин тепло (38-40°C) × 3-5 циклов
   • «Насос» для кровотока, бодрящий эффект
   Эффективность: ★★★☆☆

7. FOAM ROLLING (миофасциальный релиз):
   • 1-2 мин на мышечную группу
   • Снижает DOMS, улучшает ROM на 10-20 мин
   • НЕ «разбивает фасции» — нейромодуляция
   Эффективность: ★★★☆☆

🟠 УРОВЕНЬ C (слабые/смешанные доказательства):

8. ХОЛОДНАЯ ВАННА / КРИОТЕРАПИЯ:
   • 10-15°C, 10-15 мин
   • УМЕНЬШАЕТ воспаление и DOMS
   • НО: может ЗАМЕДЛЯТЬ мышечный рост! (blunts mTOR)
   • Для гипертрофии: НЕ рекомендуется
   • Для спорта (между выступлениями): ДА
   Эффективность: ★★☆☆☆ (для роста мышц)

9. КОМПРЕССИОННАЯ ОДЕЖДА:
   • Тайтсы, рукава — давление 15-25 mmHg
   • Небольшое снижение DOMS, улучшение кровотока
   • Скорее психологический эффект
   Эффективность: ★★☆☆☆

10. ЭЛЕКТРОСТИМУЛЯЦИЯ (EMS):
    • Слабые доказательства для восстановления
    • Может помочь с кровотоком
    Эффективность: ★☆☆☆☆

📋 ОПТИМАЛЬНЫЙ СТЕК ВОССТАНОВЛЕНИЯ:
1. Сон 8+ часов (ежедневно) — бесплатно
2. Белок + углеводы после тренировки — бесплатно
3. Активное восстановление (ходьба 30 мин) — бесплатно
4. Foam rolling 10 мин — дёшево
5. Сауна 1-2 раза в неделю — если доступно
6. Массаж 1-2 раза в месяц — если бюджет позволяет
`;
}
export function getDeloadWeekCompleteScience(message: string): string {
  const keywords = ['разгрузочная неделя полн', 'deload science', 'деловая неделя наук', 'когда делать деload', 'зачем разгрузк', 'deload как', 'снижение нагрузки', 'суперкомпенсация', 'разгрузка полн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📉 РАЗГРУЗОЧНАЯ НЕДЕЛЯ (DELOAD) — ПОЛНАЯ НАУКА:

🔬 ЗАЧЕМ НУЖЕН DELOAD:
• Суперкомпенсация: стресс → утомление → восстановление → РОСТ ВЫШЕ БАЗЫ
• Без деload: стресс → утомление → больше стресса → перетренированность
• Накопленная усталость ЦНС рассеивается за 5-10 дней
• Суставы и сухожилия получают время на ремоделирование
• Психологическая перезагрузка — мотивация восстанавливается

📊 КОГДА ДЕЛАТЬ:
По расписанию: каждые 4-6 недель (мезоцикл)
• Новички: каждые 6-8 недель
• Средний уровень: каждые 4-6 недель
• Продвинутые: каждые 3-4 недели

По сигналам тела:
• Снижение силы 2+ тренировки подряд
• Нарушение сна, утренний пульс повышен
• Боли в суставах/сухожилиях
• Потеря аппетита и мотивации
• Частые болезни

📋 ТИПЫ DELOAD:

1. Снижение ОБЪЁМА (рекомендуется):
   • Сохранить вес на штанге (85-100% от рабочего)
   • Убрать 40-50% подходов (3 подхода → 2, убрать аксессуары)
   • Лучший вариант: сохраняет нервно-мышечную адаптацию

2. Снижение ИНТЕНСИВНОСТИ:
   • Снизить вес на 40-60%
   • Сохранить количество подходов
   • Подходит для суставных проблем

3. Снижение ЧАСТОТЫ:
   • Убрать 1-2 тренировки в неделю
   • Сохранить оставшиеся как есть
   • Подходит при психологическом утомлении

4. Полный ОТДЫХ:
   • 5-7 дней без тренировок
   • Только для крайней усталости / травм
   • НЕ рекомендуется как регулярная практика

⚡ ПРИМЕР DELOAD НЕДЕЛИ:
Обычная: Присед 4×8@100кг, Жим 4×8@80кг, Тяга 4×8@120кг
Deload: Присед 2×5@100кг, Жим 2×5@80кг, Тяга 2×5@120кг
(ТОТ ЖЕ вес, МЕНЬШЕ подходов и повторений, БЕЗ аксессуаров)

💡 ПОСЛЕ DELOAD:
• Возвращайся к предыдущим весам или +2.5-5 кг
• Суперкомпенсация: первая неделя после deload — часто PR
• Начинай новый мезоцикл с MEV → постепенно к MAV
`;
}
export function getOvertrainingSignsProtocol(message: string): string {
  const keywords = ['перетренированность', 'overtraining', 'усталость хроническая', 'не восстанавливаюсь', 'упадок сил', 'слабость в зале'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚠️ ПЕРЕТРЕНИРОВАННОСТЬ — ПРИЗНАКИ И ПРОТОКОЛ ВОССТАНОВЛЕНИЯ:

📊 Стадии перетренированности:
1. **Функциональное перенапряжение** (overreaching): кратковременное, 1-2 недели
   - Нормально при планировании → за ним суперкомпенсация
2. **Нефункциональное перенапряжение**: 2-8 недель восстановления
   - Снижение результатов + плохое самочувствие
3. **Синдром перетренированности** (OTS): месяцы восстановления
   - Системный сбой: гормоны, иммунитет, ЦНС, психика

🔍 Ключевые признаки (≥4 из 10 = тревога):
1. ❌ Снижение силы/выносливости >2 недель подряд
2. ❌ Повышенная ЧСС покоя (+5-10 уд/мин утром)
3. ❌ Нарушения сна (трудности засыпания, ранние пробуждения)
4. ❌ Хроническая мышечная боль (не DOMS, а постоянная)
5. ❌ Раздражительность, апатия, потеря мотивации
6. ❌ Частые простуды (>3 за 2 месяца)
7. ❌ Потеря аппетита или наоборот неконтролируемый голод
8. ❌ Снижение либидо
9. ❌ Затяжная DOMS (>72ч)
10. ❌ Тяжесть в ногах, общая вялость

🔧 Протокол восстановления:
• **Лёгкая стадия**: разгрузочная неделя (50% объёма, 60% весов)
• **Средняя**: 1-2 недели полного отдыха → лёгкие тренировки 3 раза/нед
• **Тяжёлая**: консультация врача, анализы (кортизол, тестостерон, ТТГ, ферритин)
• Во всех случаях: сон 8-9ч, калорийный профицит, снижение стресса
`;
}
export function getTrainingInHeatAdvanced(message: string): string {
  const keywords = ['жара тренировка', 'training heat', 'горячо в зале', 'тепловой удар', 'потоотделение', 'тренировка летом'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌡️ ТРЕНИРОВКИ В ЖАРУ — БЕЗОПАСНОСТЬ И ПРОИЗВОДИТЕЛЬНОСТЬ:

📊 Физиология тренировок при высокой температуре:
• При >30°C: ЧСС выше на 10-20 уд/мин при той же нагрузке
• Кровь перераспределяется к коже (охлаждение) → меньше к мышцам
• Производительность падает на 10-20% при >32°C
• Потери жидкости: 1-3 л/час (зависит от влажности и интенсивности)

⚠️ Тепловые состояния (по нарастающей):
1. **Тепловые судороги**: спазмы мышц → электролиты + прохлада
2. **Тепловое истощение**: слабость, тошнота, головокружение → прекратить, охладить, пить
3. **Тепловой удар**: t >40°C, спутанность сознания → СКОРАЯ ПОМОЩЬ

🔧 Стратегии адаптации:
• **Акклиматизация** (7-14 дней): начни с 50% объёма, постепенно увеличивай
• **Прекулинг**: холодный душ / мокрое полотенце на шею до тренировки
• **Гидратация**: 500мл за 2ч до + 200мл каждые 15-20 мин + электролиты
• **Одежда**: влагоотводящая, светлая, свободная
• **Время**: тренируйся утром (до 10:00) или вечером (после 18:00)

📋 Корректировка тренировки в жару:
- Снижай интенсивность на 10-15% (или RPE -1-2)
- Увеличивай отдых между подходами на 30-60 сек
- Сократи тренировку на 15-20 мин
- Избегай HIIT при >32°C — замени на LISS
- Делай тренировку в кондиционированном зале если возможно

💡 Контроль: взвесься до и после тренировки. Потеря >2% массы тела = обезвоживание.
`;
}
export function getColdWeatherTrainingAdvanced(message: string): string {
  const keywords = ['тренировка холод продвинутый', 'зимние тренировки наука', 'cold weather training', 'мороз тренировка', 'закаливание спорт'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
❄️ ТРЕНИРОВКИ В ХОЛОДЕ — ПРОДВИНУТЫЙ ПОДХОД:

Холод влияет на физиологию: мышечная вязкость ↑, скорость нервных импульсов ↓, расход энергии ↑.

🔬 Физиология в холоде:
- **Мышечная температура ↓** → сила снижается на 4-6% на каждый °C
- **Вязкость синовиальной жидкости ↑** → суставы "тугие", амплитуда ↓
- **Периферическая вазоконстрикция** → меньше крови к мышцам
- **Термогенез** → +10-40% расхода калорий (тело греется)
- **Активация бурого жира** → ускоренное жиросжигание

🌡️ Адаптация разминки:
- При +10-15°C: стандартная разминка + 5 мин
- При 0-10°C: удлинённая разминка (15-20 мин), больше динамической растяжки
- При -10-0°C: 20-25 мин разминки, начинай в помещении
- При ниже -10°C: полная разминка внутри, на улицу — только для основной части

🏋️ Силовые в холодном зале:
1. **Разогревающие подходы** — добавь 2-3 дополнительных лёгких подхода
2. **Паузы** — не делай длинных (мышцы остывают за 3-5 мин)
3. **Одежда** — многослойность: термобельё + флис + верхний слой
4. **Хват** — перчатки ухудшают хват; прогревай руки между подходами
5. **Амплитуда** — увеличивай постепенно, не форсируй глубокие растяжения

🏃 Кардио на холоде:
- Дыши через нос/шарф (согрев воздуха перед лёгкими)
- Бег при -15°C и ниже — риск бронхоспазма
- Ветрозащитная одежда важнее утепления
- Светоотражающие элементы (зимой темнеет рано)

🍲 Питание в холодный период:
- Калорийность +10-15% (термогенез)
- Горячие напитки до и после тренировки
- Больше жиров (для теплообмена): орехи, авокадо, жирная рыба
- Витамин D обязательно (дефицит солнца зимой в России)

⚡ Преимущества тренировок в холоде:
- Активация бурого жира → лучшее жиросжигание
- Закалка → укрепление иммунитета
- Повышенная выработка норадреналина → фокус и энергия
- Адаптация → лучшая термоустойчивость
`;
}
export function getRecoveryDayProtocol(message: string): string {
  const keywords = ['день восстановления протокол', 'recovery day protocol', 'активное восстановление', 'что делать в день отдыха', 'отдых от тренировок'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🔄 ДЕНЬ ВОССТАНОВЛЕНИЯ — ПОЛНЫЙ ПРОТОКОЛ:

День отдыха ≠ день на диване. Активное восстановление ускоряет регенерацию на 30-40% по сравнению с полным покоем.

🔬 Почему восстановление критично:
- Мышцы растут НЕ на тренировке, а МЕЖДУ тренировками
- Суперкомпенсация: стресс → утомление → восстановление → рост выше базового уровня
- Без достаточного восстановления: перетренированность → регресс

📋 Протокол идеального дня восстановления:

**Утро (7:00-9:00):**
- Качественный завтрак: белок (30г) + сложные углеводы + жиры
- 500 мл воды (за ночь обезвоживание)
- 10 мин на солнце (циркадные ритмы + витамин D)
- Лёгкая прогулка 15-20 мин

**День (10:00-14:00):**
- **Активное восстановление** (выбери 1-2):
  - Лёгкое кардио: ходьба, велосипед, плавание (ЧСС 100-120)
  - Йога / мобильность: 20-30 мин
  - Foam rolling: 10-15 мин на целевые мышцы
  - Лёгкая растяжка: 15-20 мин
- Питание: полноценный обед с белком и углеводами

**Вечер (16:00-20:00):**
- Контрастный душ: 30 сек холодный / 60 сек горячий × 5 циклов
- Или: сауна 15-20 мин (↑ ГР, ↑ кровоток)
- Или: холодная ванна 10 мин при 10-15°C (↓ воспаление)
- Лёгкий ужин за 2-3 часа до сна

**Перед сном (21:00-22:00):**
- Магний 300-400 мг
- Растяжка 5-10 мин или дыхательные упражнения
- Казеин / творог (медленный белок на ночь)
- Спать: 8-9 часов (больше, чем в тренировочные дни!)

📊 Foam Rolling (миофасциальный релиз):
| Группа | Время | Давление |
|--------|-------|----------|
| Квадрицепс | 2 мин | Среднее |
| Задняя поверхность | 2 мин | Среднее |
| Ягодичные | 2 мин (каждая) | Сильное |
| Верх спины | 2 мин | Среднее |
| Широчайшие | 1 мин (каждая) | Лёгкое |
| Икры | 1 мин (каждая) | Сильное |

🍽️ Питание в день отдыха:
- Калории: -10-15% от тренировочного дня (или такие же при наборе)
- Белок: такой же (2 г/кг) — восстановление продолжается!
- Углеводы: ↓ на 20-30% (меньше гликогена тратится)
- Жиры: ↑ на 10-15% (антивоспалительные омега-3)

⚠️ Когда нужен ПОЛНЫЙ отдых (без активного восстановления):
- Очень высокая усталость/болезненность
- Недосып (<5 часов)
- Начало простуды/болезни
- Сильный стресс
- После соревнований
`;
}
export function getRecoveryMetricsTrack(message: string): string {
  const keywords = ['метрики восстановления', 'recovery metrics', 'отслеживание восстановления', 'как понять восстановился', 'трекинг восстановления', 'готовность к тренировке', 'readiness score'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📊 ТРЕКИНГ МЕТРИК ВОССТАНОВЛЕНИЯ — ЗНАЙ СВОЁ ТЕЛО:

**Субъективные метрики (оценивай утром, 1-10):**
1. **Качество сна:** как спал? (1 = ужасно, 10 = отлично)
2. **Энергия:** уровень бодрости (1 = разбит, 10 = полон сил)
3. **Настроение:** мотивация тренироваться (1 = нет, 10 = максимум)
4. **Мышечная болезненность:** DOMS (1 = сильная, 10 = нет)
5. **Стресс:** психологический стресс (1 = максимум, 10 = спокоен)

**Общий балл:** сумма / 5 = средний балл готовности
- 8-10: полная готовность, можно тяжёлую тренировку
- 6-7: нормальная готовность, стандартная тренировка
- 4-5: сниженная готовность, лёгкая тренировка / ↓ объём
- 1-3: нужен отдых или активное восстановление

**Объективные метрики:**

**1. ЧСС покоя (Resting Heart Rate):**
- Измеряй утром, лёжа, до подъёма с кровати
- Норма: 50-70 уд/мин (у тренированных: 40-55)
- ↑ на 5+ уд/мин vs обычного = недовосстановление
- ↑ на 10+ уд/мин = возможная болезнь / перетренированность

**2. ВСР (HRV — вариабельность сердечного ритма):**
- Лучший объективный маркер восстановления
- Измеряй утром (Oura, Whoop, HRV4Training)
- ↑ HRV = хорошее восстановление, парасимпатика доминирует
- ↓ HRV = стресс, недовосстановление, симпатика доминирует
- Тренд важнее абсолютного числа!

**3. Grip strength (сила хвата):**
- Динамометр утром (или просто сжатие кистевого эспандера)
- ↓ на 10%+ = ЦНС не восстановилась
- Простой и дешёвый метод

**4. Вертикальный прыжок:**
- Прыгни вверх (измерь или субъективно)
- ↓ на 10%+ от среднего = нервно-мышечная усталость
- Чувствительный маркер для ног

**Протокол утреннего мониторинга (5 мин):**
1. Проснулся → не вставай → ЧСС покоя (1 мин)
2. HRV измерение (2 мин, приложение)
3. Субъективная оценка: сон, энергия, настроение, DOMS, стресс
4. Записать в дневник / приложение
5. Решение о тренировке:
   - Всё в норме → по плану
   - 1-2 метрики ↓ → по плану, но прислушиваться
   - 3+ метрики ↓ → лёгкая тренировка или отдых

**Красные флаги (нужен полный отдых):**
- ЧСС покоя ↑ >10 уд/мин + плохой сон + нет мотивации
- 3+ дня подряд сниженных метрик
- Травма или боль в суставах
- Болезнь (температура, простуда)
`;
}
export function getAddictionRecoveryExercise(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['зависимост', 'addiction', 'реабилитац наркот', 'алкоголизм', 'трезвост', 'ремисси алкогол'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🔄 ТРЕНИРОВКИ В ПРОЦЕССЕ ВОССТАНОВЛЕНИЯ ОТ ЗАВИСИМОСТЕЙ:

Нейрохимия:
- Зависимость = дефицит дофамина → тренировки восстанавливают дофаминовые рецепторы
- 30 мин кардио = эндорфиновый «кайф» без веществ
- Через 6-8 нед регулярных тренировок: нормализация дофаминовой системы
- Снижение тяги (craving) на 40-60% в дни тренировок

Программа:
- Ежедневно: хотя бы 20 мин активности
- Силовые 3 раза/нед: восстановление физической формы
- Кардио 3-4 раза/нед: 30 мин, нейрохимический эффект
- Групповые занятия: замена социального окружения

Психологические бонусы:
- Структура дня = замена ритуала употребления
- Прогресс в зале = доказательство что жизнь улучшается
- Самоэффективность: «я могу контролировать что-то»
- Здоровое сообщество = новые социальные связи

После алкоголизма:
- Печень может быть повреждена → консультация врача
- Электролиты: внимание к магнию, калию
- Тремор рук: начинать с тренажёров, не свободных весов
- Прогрессия медленная: тело восстанавливается параллельно

Важно:
- Тренировка — не замена лечения, а дополнение
- Не заменять одну зависимость другой (спортивная аддикция)
- Если тренировка стала компульсивной — обсудить с психотерапевтом
`;
}
export function getOfficeWorkerFitnessGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['офис', 'сидяч работ', 'office worker', 'за компьютер', 'программист', 'бухгалтер', '8 часов сидя'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
💼 ТРЕНИРОВКИ ДЛЯ ОФИСНЫХ РАБОТНИКОВ:

Проблемы от 8+ ч сидения:
- Укорочение сгибателей бедра → боль в пояснице
- Кифоз (округление верхней части спины)
- Синдром «головы вперёд» → боль в шее
- Атрофия ягодичных мышц («ягодичная амнезия»)
- Метаболический синдром ↑ даже при тренировках!

Компенсационная программа:
- Растяжка сгибателей бедра: 2 × 30 сек, ежедневно
- Активация ягодиц: мостик, 3 × 15, перед тренировкой
- Тяги > жимы (соотношение 2:1): компенсация округлой спины
- Горизонтальные тяги: тяга к поясу, тяга в наклоне
- Ротаторная манжета: внешняя ротация с резиной

Микротренировки в офисе (каждый час):
- Встать, пройтись 2-3 мин
- 10 приседаний у стола
- Растяжка грудных мышц в дверном проёме
- Вращение шеей, отведение плеч назад

Программа в зале:
- 3-4 раза/нед, 45-60 мин
- Акцент: задняя цепь (спина, ягодицы, задняя поверхность бедра)
- Обязательно: face pulls, TYI-подъёмы, мостик с паузой
- Кардио: ходьба предпочтительнее бега (добрать 10 000 шагов)
`;
}
export function getRecoveryScienceAdvanced(message: string): string {
  const triggers = ['наука восстановлен', 'восстановление подробн', 'методы восстановлен', 'суперкомпенсац', 'активн восстановлен', 'восстановлен между тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔬 НАУКА ВОССТАНОВЛЕНИЯ — ПРОДВИНУТЫЙ РАЗБОР:

**Суперкомпенсация:**
- Тренировка → утомление → восстановление → суперкомпенсация
- Окно суперкомпенсации: 24-72 часа после полного восстановления
- Слишком рано = недовосстановление → перетренированность
- Слишком поздно = деадаптация → потеря стимула

**Системы восстановления (от быстрой к медленной):**
1. Нервная система: 48-72 часа (тяжёлые синглы, максимумы)
2. Мышечная ткань: 48-96 часов (зависит от повреждения)
3. Соединительная ткань: 72-120 часов (сухожилия, связки)
4. Гормональная: 24-48 часов (кортизол, тестостерон)

**Доказательные методы восстановления (Tier 1):**
- Сон: 7-9 часов, #1 фактор восстановления
- Питание: белок 1.6-2.2 г/кг, достаточные калории
- Гидратация: 30-40 мл на кг массы тела

**Поддерживающие методы (Tier 2):**
- Активное восстановление: лёгкая активность <50% интенсивности
- Массаж / self-myofascial release: снижение DOMS
- Контрастный душ: горячий 2 мин / холодный 30 сек × 3

**Спорные методы (Tier 3):**
- Холодное погружение: СНИЖАЕТ гипертрофию (блокирует воспаление)
  - OK для: между соревнованиями, когда нужно быстро восстановиться
  - НЕ OK для: после силовой для роста мышц
- Компрессионная одежда: минимальный эффект
- Сауна: возможная польза для кардио, не для мышц

**Маркеры недовосстановления:**
- Повышенный утренний пульс (+5 уд/мин от нормы)
- Снижение аппетита
- Нарушение сна
- Падение мотивации
- Снижение рабочих весов >5% на 2+ тренировках
`;
}
export function getDeloadScienceComplete(message: string): string {
  const triggers = ['деload наука', 'разгрузочная неделя подробн', 'зачем деload', 'как делать деload', 'разгрузка тренировк наука', 'деload протокол'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[НАУКА ДЕLOAD (РАЗГРУЗОЧНОЙ НЕДЕЛИ) — ПОЛНЫЙ РАЗБОР]
Деload — планомерное снижение тренировочного стресса для суперкомпенсации и предотвращения перетренированности.

ФИЗИОЛОГИЧЕСКОЕ ОБОСНОВАНИЕ:
- Модель фитнес-усталости Банистера: производительность = фитнес − усталость
- Усталость рассеивается быстрее фитнеса → деload убирает усталость, сохраняя фитнес
- SRA-кривая (Stimulus-Recovery-Adaptation): деload = фаза полного восстановления
- Снижение системного воспаления (IL-6, TNF-α) накопленного за мезоцикл
- Восстановление нейромедиаторов (дофамин, серотонин) после периода высокого стресса
- Регенерация соединительной ткани (сухожилия адаптируются медленнее мышц)

ТИПЫ ДЕLOAD:
1. Снижение объёма (−40-60% подходов, сохранить интенсивность) — лучший для силовых
2. Снижение интенсивности (−40-50% веса, сохранить объём) — лучший для гипертрофии
3. Снижение частоты (2 тренировки вместо 4-5) — для уставших от зала
4. Полный отдых (0 тренировок, 5-7 дней) — только при признаках перетренированности
5. Активное восстановление: лёгкое кардио, мобильность, плавание

КОГДА ДЕЛАТЬ:
- Каждые 4-6 недель для продвинутых (ACWR приближается к 1.5+)
- Каждые 6-8 недель для среднего уровня
- Каждые 8-12 недель для начинающих (они не генерируют достаточно стресса)
- Реактивный деload: при признаках — ↓ прогресса, ↓ мотивации, ↑ травматизм, ↓ сон

ПРОТОКОЛ ОПТИМАЛЬНОГО ДЕLOAD:
- Длительность: 5-7 дней (не больше, иначе детренированность)
- Объём: 40-60% от обычного
- Интенсивность: 85-90% от обычных рабочих весов
- Частота: можно сохранить или снизить на 1 день
- Питание: поддерживать калории и белок (это НЕ время для дефицита)
- Сон: ↑ на 1 час если возможно
`;
}
export function getOvertrainingDiagnostics(message: string): string {
  const triggers = ['перетренированность диагностик', 'признаки перетренированност', 'перетренировался что делать', 'overtraining syndrom', 'перетрен как понять', 'ots синдром'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ПЕРЕТРЕНИРОВАННОСТЬ — ДИАГНОСТИКА И ВОССТАНОВЛЕНИЕ]
OTS (Overtraining Syndrome) — серьёзное состояние, требующее недель-месяцев восстановления.
Важно: отличать от перенапряжения (overreaching) — которое может быть полезным.

СТАДИИ:
1. Функциональное перенапряжение (FOR): ↓ производительности на дни. Нормальная часть тренировок → суперкомпенсация
2. Нефункциональное перенапряжение (NFOR): ↓ производительности на недели. Требует отдых 1-3 недели
3. Перетренированность (OTS): ↓ производительности на месяцы. Системные симптомы, нейроэндокринные нарушения

СИМПТОМЫ OTS — ФИЗИЧЕСКИЕ:
- ↓ силы и производительности несмотря на отдых
- ↑ ЧСС покоя на 5-10 уд/мин
- ↓ вариабельность сердечного ритма (HRV)
- Частые ОРВИ (↓ иммунитет — J-кривая)
- Затяжные мышечные боли (>72ч)
- Нарушения сна (бессонница или гиперсомния)
- ↓ аппетита и потеря веса

СИМПТОМЫ OTS — ПСИХОЛОГИЧЕСКИЕ:
- ↓ мотивации к тренировкам (ранее любимое занятие)
- Раздражительность, тревожность, депрессивные состояния
- ↓ концентрации
- Ощущение тяжести в теле даже после отдыха

НЕЙРОЭНДОКРИННЫЕ МАРКЕРЫ:
- ↓ тестостерон, ↓ соотношение T/C (тестостерон/кортизол)
- ↑ базальный кортизол
- ↓ DHEA-S
- ↑ креатинкиназа (КФК) в крови — маркер мышечного повреждения
- Нарушение оси гипоталамус-гипофиз-надпочечники

ВОССТАНОВЛЕНИЕ:
- Полный отдых от тренировок: 2-4 недели (при OTS — до 3 месяцев)
- Калорийный профицит: +300-500 ккал/день
- Сон: 8-9 часов
- Стресс-менеджмент: минимизировать внетренировочный стресс
- Постепенный возврат: 50% объёма → 75% → 100% (каждые 1-2 недели)
`;
}
export function getFoamRollingMyofascial(message: string): string {
  const triggers = ['миофасциальный релиз', 'фасция тренировк', 'роллер глубокий', 'самомассаж мышц глубок', 'триггерные точки снять'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔴 МИОФАСЦИАЛЬНЫЙ РЕЛИЗ — ГЛУБОКАЯ РАБОТА:

**Фасциальная система:**
- Фасция — соединительнотканная сеть, покрывающая все мышцы
- При перегрузке фасция "слипается" (адгезии), ограничивая подвижность
- Миофасциальный релиз разрушает адгезии и восстанавливает скольжение

**Инструменты по глубине воздействия:**
1. Пенный ролл (мягкий) — разминка, общее расслабление
2. Пенный ролл (жёсткий) — основная работа
3. Массажный мяч (лакросс) — точечная работа, триггерные точки
4. Двойной мяч (арахис) — паравертебральные мышцы
5. Вибрационный ролл — усиленное расслабление через вибрацию

**Протокол по зонам:**
- Квадрицепсы: 60-90 сек, медленные проходы, паузы на болезненных точках
- Ягодицы/грушевидная: мяч для лакросса, сидя, 60 сек на точку
- IT-бэнд: осторожно, не давить на кость, 30-45 сек
- Грудной отдел: двойной мяч вдоль позвоночника, разгибание
- Икры: ролл + крестообразные движения стопой

**Когда делать:**
- До тренировки: 30-60 сек на группу, без глубокого давления
- После тренировки: 90-120 сек, глубже, с паузами на триггерах
- В дни отдыха: 10-15 мин, полная сессия всего тела

**Важно:**
- Не ролить поясницу напрямую (рёберная дуга — таз = опасная зона)
- Боль не должна превышать 6/10
- Дышать глубоко, не задерживать дыхание
- Не ролить воспалённые/острые травмы
`;
}
export function getSaunaHeatAdaptation(message: string): string {
  const triggers = ['сауна восстановлен', 'баня после тренировк', 'тепловая терапия', 'сауна мышцы', 'гипертермия спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔥 САУНА И ТЕПЛОВАЯ АДАПТАЦИЯ:

**Физиологические эффекты:**
- Повышение гормона роста до 200-300% при 80°С, 20 мин
- Увеличение теплошоковых белков (HSP) → защита мышечных клеток
- Повышение объёма плазмы → лучшая выносливость
- Снижение кортизола, улучшение настроения (бета-эндорфины)

**Протоколы для атлетов:**
- Финская сауна: 80-100°С, 15-20 мин, 2-3 захода, перерыв 5-10 мин
- Инфракрасная сауна: 45-60°С, 30-45 мин (глубже прогревает ткани)
- Русская баня: 60-80°С с паром, 10-15 мин, контраст с холодом

**Оптимальное время:**
✅ Через 30-60 мин после тренировки (после охлаждения)
✅ В дни отдыха — 2-3 сессии в неделю
✅ Вечером — помогает засыпанию (снижение температуры тела после)
⚠️ Не до тренировки (обезвоживание, утомление)

**Сауна для гипертрофии:**
- В отличие от холода, тепло НЕ подавляет мышечный рост
- HSP70 защищают мышечные волокна от катаболизма
- Повышение IGF-1 локально в прогретых тканях
- Можно сразу после силовой

**Гидратация:**
- Потеря жидкости: 0.5-1 л за сессию
- Пить воду с электролитами до и после
- Признаки обезвоживания: головокружение, тошнота — немедленно выйти
- Не употреблять алкоголь до/после сауны
`;
}
export function getDeloadPeriodization(message: string): string {
  const triggers = ['делоад периодизация', 'разгрузочная неделя план', 'когда делать делоад', 'deload как правильно', 'снижение нагрузки цикл'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
📉 ДЕLOAD В КОНТЕКСТЕ ПЕРИОДИЗАЦИИ:

**Зачем нужен deload:**
- Накопленная усталость снижает производительность (принцип суперкомпенсации)
- Без deload → стагнация → перетренированность
- После deload организм "суперкомпенсирует" → выход на новый уровень

**Когда делать deload:**
- По расписанию: каждые 4-6 недель (3:1 или 4:1 нагрузка:разгрузка)
- По самочувствию: HRV ↓ 5+ дней, сон ↓, мотивация ↓, боли в суставах
- После пиковой недели / соревнований
- При стагнации весов 2+ недели подряд

**Варианты deload:**
1. **Снижение объёма** (рекомендуется): те же веса, но 50-60% от обычных подходов/повторений
2. **Снижение интенсивности**: обычный объём, но 60-70% от рабочих весов
3. **Полный отдых**: 3-5 дней без тренировок (только при сильном переутомлении)
4. **Активное восстановление**: лёгкое кардио, подвижность, йога

**Deload в разных системах:**
- 5/3/1 Вендлера: deload каждый 4-й цикл, 40-60% от TM
- Линейная прогрессия: deload при 2 неудачных попытках подряд
- Волновая периодизация: лёгкая неделя каждую 4-ю
- DUP: снижение RPE на 2-3 пункта на неделю

**Что делать на deload:**
- Работать над техникой (лёгкие веса = возможность для идеальной формы)
- Миофасциальный релиз, растяжка, мобильность
- Сауна, сон 8-9 часов, полноценное питание
- НЕ менять программу — просто снижай нагрузку
`;
}
export function getOvertrainingRecognition(message: string): string {
  const triggers = ['перетренированность признаки', 'overtraining как понять', 'перетренировался что делать', 'синдром перетренированности', 'усталость от тренировок хроническ'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚠️ РАСПОЗНАВАНИЕ ПЕРЕТРЕНИРОВАННОСТИ:

**Стадии:**
1. **Функциональное перенапряжение** (Overreaching): краткосрочное, 1-2 недели, восстанавливается за 1-2 недели отдыха — это НОРМАЛЬНАЯ часть тренировок
2. **Нефункциональное перенапряжение** (NFOR): стагнация 2-4 недели, восстановление 2-4 недели
3. **Синдром перетренированности** (OTS): месяцы стагнации, восстановление 1-3 месяца — СЕРЬЁЗНАЯ проблема

**Физические симптомы:**
- Снижение силовых показателей при обычной нагрузке
- Повышенный пульс покоя (+5-10 уд/мин от нормы)
- Постоянная мышечная болезненность (>72 часов DOMS)
- Частые простуды / инфекции (подавленный иммунитет)
- Нарушения сна (бессонница или гиперсомния)
- Потеря аппетита или компульсивное переедание

**Психологические симптомы:**
- Отсутствие желания тренироваться (апатия)
- Раздражительность, тревожность
- Снижение концентрации
- Ощущение "выгорания"
- Депрессивные эпизоды

**Что делать:**
1. Полный отдых 7-14 дней (без тренировок, только прогулки)
2. Сон 9-10 часов, возможно дневной сон
3. Увеличить калораж на 10-15% (организм в дефиците)
4. Магний, цинк, витамин D, омега-3
5. Возвращение: 50% от объёма, постепенное наращивание за 2-3 недели

**Профилактика:**
- Deload каждые 4-6 недель
- Мониторинг HRV, пульса покоя, качества сна
- Не увеличивать объём + интенсивность одновременно
- Правило 10%: не повышать нагрузку более чем на 10% в неделю
`;
}
export function getActiveRecoveryProtocol(message: string): string {
  const triggers = ['активное восстановление', 'active recovery тренировк', 'лёгкая тренировка восстановление', 'мобилити восстановление', 'easy day протокол', 'лайт тренировка'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔄 АКТИВНОЕ ВОССТАНОВЛЕНИЕ — ПРОТОКОЛЫ:

**Что такое активное восстановление:**
- Лёгкая активность в дни отдыха для ускорения восстановления
- Интенсивность: 30-50% от максимальной ЧСС (не выше!)
- Продолжительность: 20-40 минут
- Цель: увеличить кровоток без дополнительного стресса

**Физиологические механизмы:**
- Усиление кровотока → ускоренное удаление метаболитов (лактат, H⁺)
- Снижение отёчности в мышцах (мышечная помпа)
- Поддержание нервно-мышечной готовности
- Снижение мышечной скованности

**Протокол 1 — Мобилити + пенный ролик (30 мин):**
5 мин — пенный ролик: квадрицепс, ягодичные, грудной отдел
10 мин — динамическая стретчинг: leg swings, hip circles, thoracic rotations
10 мин — йога-поток: кошка-корова, нисходящая собака, голубь
5 мин — дыхание: 10 циклов 4-7-8

**Протокол 2 — Лёгкое кардио (30-40 мин):**
- Ходьба в быстром темпе: пульс 90-110 уд/мин
- Лёгкий велосипед: пульс 100-120 уд/мин
- Плавание (кроль без усилий): то же
- Лёгкий гребной тренажёр: 20-30 мин @ RPE 3/10

**Протокол 3 — Функциональные движения (20 мин):**
- Боковые шаги с лентой: 3×15 в каждую сторону
- Cat-cow: 2×10 медленно
- Dead bug: 2×8 на каждую сторону
- Глютовые мосты: 3×15 медленно
- Bird-dog: 2×8

**Когда активное восстановление лучше полного отдыха:**
✅ DOMS (запаздывающая мышечная болезненность) высокая
✅ Ощущение «деревянности» в мышцах
✅ 2 тяжёлые тренировки подряд (между ними)
✅ Соревновательный период (поддержание без накопления усталости)

**Когда нужен полный отдых:**
❌ Явные признаки перетренированности (ЧСС покоя +7+)
❌ Острая травма или боль
❌ ОРВИ, плохое самочувствие
❌ Психологическое выгорание
`;
}
export function getMassageTherapyGuide(message: string): string {
  const triggers = ['массаж спортивный', 'массаж восстановление', 'спортивный массаж', 'миофасциальный массаж', 'тригерные точки массаж', 'глубокий массаж'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💆 СПОРТИВНЫЙ МАССАЖ — ВИДЫ И ЭФФЕКТИВНОСТЬ:

**Типы массажа для атлетов:**

Шведский (классический):
- Техники: поглаживание, растирание, разминание, вибрация
- Цель: расслабление, улучшение кровотока
- Лучшее время: через 24-48ч после тренировки (острое воспаление пройдёт)

Спортивный массаж:
- До события: активирующий (быстрый, поверхностный)
- После события: восстановительный (медленный, глубокий)
- Между сессиями: поддерживающий (нарушение паттернов напряжения)

Глубокотканный:
- Работа с глубокими слоями фасции и мышц
- Устранение спаек и рубцовой ткани
- Болезненный процесс — нормально, но боль не должна быть «невыносимой»

Миофасциальный релиз (MFR):
- Работа с фасциальными ограничениями
- Медленный устойчивый натяг (не трение)
- Часто используется для хронических паттернов напряжения

**Что показывают исследования:**

Массаж и DOMS:
- Снижение болезненности на 25-30% (мета-анализ Guo, 2017)
- Лучший момент: через 48-72ч после тренировки

Массаж и восстановление:
- Улучшение: субъективное восстановление, гибкость
- Слабые доказательства: ускорение метаболического клиренса
- Хороший эффект: психологическое расслабление (снижение кортизола)

**Самомассаж — инструменты:**

Пенный ролик (foam roller):
- Миофасциальный релиз самостоятельно
- Техника: медленно прокатываешь, задерживаешься на болезненных точках 30-60 сек
- Частота: ежедневно, особенно перед тренировкой

Массажный пистолет (перкуссионный):
- Глубокая перкуссия: снижает мышечное напряжение, улучшает ROM
- Техника: 60-90 сек на группу, перед тренировкой 2 мм, после 4 мм
- Избегай: костные выступы, суставы, сосудисто-нервные пучки

Массажный мяч:
- Точечное воздействие (тригерные точки)
- Стопа (фасциит), ягодичные, грудной отдел
- Давление 30-90 сек до расслабления

**Периодичность:**
- Профессиональный атлет: 1-2 раза/нед (полный сеанс)
- Любитель: 1 раз/2 недели или по необходимости
- Самомассаж: ежедневно 5-15 минут
`;
}
export function getElasticEnergySystem(message: string): string {
  const kw = ['упругая энергия', 'эластичность', 'stretch shortening', 'реактивная сила', 'упругий возврат', 'тендон пружина'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Система упругой энергии в мышцах и сухожилиях:**

**Цикл растяжение-сокращение (SSC — Stretch-Shortening Cycle):**
Фаза эксцентрика → хранение упругой энергии → концентрика → высвобождение.
Выгода: +30-40% дополнительной силы без лишних калорий.

**Ключевые компоненты:**
1. **Сухожилие** — основной «накопитель» упругой энергии
   - Ахиллово: 35% энергии возврата при беге
   - Надколенника: ключ для прыжков
   - Плантарная фасция: «пружина стопы»

2. **Тайминг**: интервал эксцентрик→концентрик должен быть <250 мс для эффективного SSC
   - Быстрый SSC: плиометрика, спринт, метания
   - Медленный SSC: приседания с паузой — SSC теряется

**Тренировка SSC:**
Плиометрика: Drop jump → глубина приземления минимальная, быстрый отскок
Прыжки на ящик: акцент на тихом приземлении → нагрузка на сухожилия
Бег/спринт: жёсткость голеностопа = эффективность SSC

**Адаптации сухожилий (8-16 недель):**
- Увеличение жёсткости → лучший возврат энергии
- Тяжёлые медленные повторения (HSR) наиболее эффективны
- Изометрические нагрузки — дополнение

**Практика:** прыжки на месте с минимальным контактом → тренировка реактивной жёсткости.
`;
}
export function getStretchShorteningAdvanced(message: string): string {
  const kw = ['ssc', 'цикл растяжение сокращение', 'плиометрика биомеханика', 'реактивная плиометрика', 'контактное время'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Продвинутая механика SSC и плиометрики:**

**Классификация плиометрических упражнений:**

**Интенсивность 1 (начальная):**
- Подпрыжки на месте, прыжки через скакалку
- Контактное время: >250 мс
- Фокус: координация и базовая жёсткость

**Интенсивность 2 (средняя):**
- Прыжки в длину, прыжки с ящика, бурпи-прыжки
- Контактное время: 150-250 мс
- Фокус: мощность и SSC-эффективность

**Интенсивность 3 (высокая):**
- Depth jumps (прыжки с высоты), спринтерские ускорения, тройной прыжок
- Контактное время: <150 мс (цель: <100 мс у элиты)
- Фокус: нейромышечная реактивность

**Методические правила:**
Объём: 60-100 контактов/сессию (начинающие) → до 200 (продвинутые)
Частота: 2-3 раза/неделю, не в один день с тяжёлыми ногами
Восстановление: 48-72 ч — сухожилия адаптируются медленнее мышц
Прогрессия: высота → скорость → сложность → объём

**Depth jump — «золотой стандарт»:**
Высота ящика = 60-75 см для большинства
Инструкция: сойти (не прыгать) → мягкое приземление → мгновенный максимальный прыжок вверх
Ошибка: слишком высокий ящик → SSC подавляется, риск травмы

**Тест реактивной жёсткости:** высота прыжка / контактное время = RSI (Reactive Strength Index). Цель: RSI > 2.0.
`;
}
export function getDeloadTaper(message: string): string {
  const kw = ['разгрузочная неделя', 'деload', 'тейпер', 'tapering', 'неделя отдыха тренировки', 'плановая разгрузка'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Разгрузка (Deload) и Тейпер — детальный протокол:**

**Разгрузка vs Тейпер:**
Deload: плановое снижение нагрузки для восстановления в рамках цикла
Taper: специфическая разгрузка перед соревнованием/тестом для максимизации результата

**Когда нужна разгрузка:**
Каждые 4-6 недель (проактивно) — не ждать перетренированности
Признаки: снижение силы, нарушение сна, постоянная усталость, потеря мотивации
После особо интенсивных блоков или больших соревнований

**Методы разгрузки:**

**1. Снижение объёма (наиболее популярный):**
Количество сетов: -40-50% от обычного
Интенсивность: сохранять (75-85% 1ПМ) или немного снизить
Упражнения: те же, частота та же

**2. Снижение интенсивности:**
Веса: -20-30% от рабочих
Объём: тот же или чуть меньше
Хорошо для нейронной усталости

**3. Снижение частоты:**
Одна тренировка вместо двух для каждой группы
Менее эффективно для суперкомпенсации

**4. Полный отдых (1 нед):**
При сильном перетренировании или после сезона
Активный отдых: прогулки, плавание, йога

**Ожидаемый результат после разгрузки:**
Первая «возвратная» тренировка: может быть слабее (гликоген ещё не полный)
2-3 тренировка: сила превышает доразгрузочный уровень
Этот момент — начало следующего цикла с новой базой

**Распространённая ошибка:** делать разгрузку только когда «сдохли», а не планово.
`;
}
export function getIndividualRecovery(message: string): string {
  const kw = ['индивидуальное восстановление', 'сколько отдыхать между', 'персональный отдых', 'восстановление генетика', 'как часто тренироваться'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Индивидуализация восстановления:**

**Факторы, определяющие скорость восстановления:**
1. Возраст (25-летний восстанавливается на 20-30% быстрее 45-летнего)
2. Сон (7-9ч = норма, <6ч = ↓ восстановление на 30-60%)
3. Стресс (хронический стресс = +1-2 дня на восстановление)
4. Питание (дефицит калорий = ↓ восстановление на 20-40%)
5. Тренировочный стаж (новички восстанавливаются быстрее)
6. Генетика (варианты IL-6, TNF-α генов)

**Маркеры недовосстановления:**
↑ ЧСС покоя (+5-10 уд/мин от нормы)
↓ HRV (вариабельность)
↓ Мотивация, ↑ раздражительность
↓ Силовые на тренировке (>10% от нормы)
Нарушение сна
Боль в суставах (не DOMS)

**Практическая система:**
Отслеживай ЧСС покоя утром 2 недели → определи свою норму
Если ЧСС > норма + 5 → лёгкий день или отдых
Если 2 тренировки подряд с ↓ силой → deload неделя
Минимум 48ч между тренировками одной группы мышц
72ч для тяжёлых ног/спины

**Autoregulation (авторегуляция):**
RPE/RIR вместо фиксированных %: если сегодня 80% ощущается как 90% → снизь
Flexible periodization: планируй нагрузку, но адаптируй в моменте
`;
}
export function getColdExposureProtocol(message: string): string {
  const kw = ['холод тренировки', 'закаливание', 'холодный душ', 'криотерапия', 'ледяная ванна'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Холодовое воздействие для спортсменов:**

**Доказанные эффекты:**
↑ Норадреналин на 200-300% (бодрость, фокус)
↑ Бурый жир (термогенез)
↓ Воспаление (но это палка о двух концах!)
↑ Допамин на 250% (до 3 часов после)
↑ Иммунитет (при регулярном воздействии)

**Протокол Хубермана:**
Контрастный: 1-3 мин холод / 3 мин тепло × 3 цикла
Или: 2-5 мин холодный душ (11-15°C) каждое утро

**Протокол Вим Хофа:**
30 глубоких вдохов → задержка на выдохе → вдох + задержка 15с → повтор ×3
Затем: холодный душ 2-5 мин (начни с 30 сек)

**ВАЖНО — когда НЕ использовать холод:**
❌ Сразу после силовой (первые 4-6 часов!)
→ Холод ↓ воспаление, но воспаление нужно для адаптации
→ Исследование Roberts 2015: холод после силовой ↓ гипертрофию
✅ Используй: утром, в дни отдыха, после кардио

**Прогрессия для новичка:**
Неделя 1-2: 30 сек холодной воды в конце душа
Неделя 3-4: 1 мин
Неделя 5-6: 2 мин
Цель: 2-5 мин при 10-15°C
`;
}
export function getSaunaAndHeatTherapy(message: string): string {
  const kw = ['сауна', 'баня тренировки', 'термотерапия', 'баня и мышцы', 'сауна после тренировки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Сауна и тепловое воздействие:**

**Доказанные эффекты (финская сауна, 80-100°C):**
↑ ГР (гормон роста) на 200-300% (временно)
↑ Heat Shock Proteins (защита белков от денатурации)
↑ Кровоток → ↑ доставка нутриентов
↓ Риск сердечно-сосудистых заболеваний на 40-50% (Laukkanen 2015, 20 лет наблюдений)
↓ Деменция на 65% (4-7 раз/неделю vs 1 раз)

**Оптимальный протокол:**
Температура: 80-100°C (финская) или 57°C (инфракрасная)
Время: 15-20 мин за сессию
Частота: 3-7 раз/неделю
Гидратация: 500 мл воды до + 500 мл после

**Когда использовать:**
✅ После тренировки (в отличие от холода — НЕ мешает адаптации)
✅ В дни отдыха (восстановление)
✅ Вечером (↑ мелатонин → лучший сон)

**Противопоказания:**
❌ Обезвоживание → пей воду!
❌ Сразу после тяжёлой тренировки ног (↓ давление → головокружение)
❌ Алкоголь + сауна = опасно
❌ Гипертония без контроля врача
`;
}
export function getActiveRecoveryMethods(message: string): string {
  const kw = ['активное восстановление методы', 'методы восстановления спортсмен', 'recovery протокол атлет', 'восстановительная тренировка'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Активное восстановление — научно обоснованные методы:**

**Рейтинг по эффективности (мета-анализы 2020-2024):**
1. Сон 8-10ч — базовый, заменить нечем
2. Компрессионная одежда 24ч после — ↓ DOMS на 20-30%
3. Контрастный душ (1мин холод / 2мин тепло, 3 цикла) — ↓ маркеры воспаления
4. Лёгкое кардио 20-30 мин (50-60% ЧССмакс) — ↑ кровоток, ↑ удаление лактата
5. Массаж/пеноролл 10-15 мин — ↓ субъективная болезненность (DOMS)
6. Ледяная ванна 10-15°C / 10-15мин — спорно при гипертрофии (↓ синтез белка)

**❌ Что НЕ работает:**
- Статическая растяжка сразу после: не снижает DOMS
- "Дни отдыха" с полным бездействием: хуже, чем лёгкая активность

**Протокол на день после тяжёлой тренировки:**
Утро: 10мин ходьба + динамическая разминка
День: пеноролл 15мин на нагруженные мышцы
Вечер: контрастный душ
Питание: 40-50г белка + углеводы для восполнения гликогена

**Для соревновательного периода:**
За 48-72ч до старта: только лёгкое плавание / велосипед 20мин
Компрессия постоянно
Избегать массажа > 10-15мин (риск микроповреждений)
`;
}
export function getDeloadVariants(message: string): string {
  const kw = ['варианты разгрузки', 'deload виды', 'разгрузочная неделя как', 'когда делать deload', 'признаки перетренированности'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Типы deload и когда применять каждый:**

**Тип 1 — Снижение объёма (рекомендуемый):**
Вес: 100% рабочего
Подходы: 50% от обычного объёма
Когда: после 4-8 недель интенсивного блока

**Тип 2 — Снижение интенсивности:**
Вес: 50-60% от рабочего
Подходы: нормальное количество
Когда: суставные боли, накопленная усталость ЦНС

**Тип 3 — Полный отдых (неделя без зала):**
Когда: выгорание, болезнь, жизненный стресс, 2+ недели плохого сна

**Тип 4 — Смена активности:**
Замена тренировок: плавание, велосипед, йога
Когда: психологическое выгорание от тренажёрного зала

**Признаки необходимости deload:**
✓ Стагнация или регресс нагрузок 2+ тренировки
✓ Постоянная болезненность мышц (DOMS >72ч)
✓ Нарушение сна несмотря на усталость
✓ Снижение мотивации / раздражительность
✓ ЧСС покоя ↑ на 5+ уд/мин от базы
✓ HRV ↓ на >15% от 7-дневной скользящей средней

**Частота:**
Новичок: раз в 8-12 недель
Промежуточный: раз в 6-8 недель
Продвинутый: раз в 4-6 недель или по HRV
`;
}
export function getStretchingScience(message: string): string {
  const kw = ['стретчинг', 'растяжка наука', 'гибкость тренировки', 'статическая растяжка', 'динамическая растяжка', 'pnf растяжка', 'мобильность vs гибкость', 'когда растягиваться'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Стретчинг и гибкость — научный подход:**

**Виды растяжки:**
**Статическая:** удерживай положение 20-60 сек
→ Снижает нервное торможение, увеличивает ROM
→ ПЕРЕД тренировкой снижает силу на 5-8% (не делай длинную статику до силовой!)

**Динамическая:** контролируемые движения через диапазон
→ Идеальна для разминки (mahи ногами, круги бёдрами)
→ Активирует мышцы, повышает температуру, не снижает силу

**PNF (проприоцептивная нейромышечная фасилитация):**
Контракция → расслабление → растяжка (с партнёром или петлей)
Напряги мышцу 6-10 сек → расслабь → углуби растяжку
Наиболее эффективна для быстрого прироста ROM

**Мобильность vs Гибкость:**
Гибкость: пассивный диапазон (эластичность тканей)
Мобильность: активный контролируемый диапазон + сила в нём
Мобильность важнее для спорта — сила плюс диапазон

**Программирование:**
Разминка: 5-10 мин динамическая растяжка
После тренировки: статика 20-30 сек/поза — безопасно, снижает болезненность
Отдельные сессии гибкости: 2-3 раза/нед для прогресса в ROM

**Ключевые зоны:**
Тазобедренные сгибатели (поз Лунджа) — у большинства сидячих
Грудной отдел позвоночника (кошка-корова, foam roller)
Голеностоп — влияет на качество приседания
Плечевой пояс — «дверной косяк», разминка манжеты

**Срок адаптации:** заметный прирост ROM через 4-6 недель регулярных упражнений
`;
}
export function getTrainingInHeatV2(message: string): string {
  const kw = ['тренировки в жару', 'тренировки в холод', 'акклиматизация', 'тренировка в жаркую погоду', 'перегрев на тренировке'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки в условиях жары и холода:**

**Жара:**
Снижение производительности: уже при +2°C выше нормы тела → ухудшение на 5-8%
Механизм: кровь перераспределяется к коже (охлаждение) → меньше мышцам

**Акклиматизация к жаре (10-14 дней):**
Увеличивается объём плазмы крови (+10-12%)
Снижается порог потоотделения, увеличивается потоотделение
После акклиматизации: производительность почти как в норме

**Практика в жару:**
Гидратация: пить до жажды + следить за цветом мочи (светло-жёлтый = норма)
Электролиты: 500-700 мг натрия/л воды при длительных тренировках
Снизить интенсивность на 5-10% первые 1-2 недели
Тренироваться ранним утром или вечером, избегать 11:00-16:00

**Холод:**
Мышцы медленнее сокращаются → сила на 5-10% ниже при <10°C
Больший риск мышечных травм → обязательная разминка 15-20 мин
Плюс: меньше перегрев при длительных нагрузках

**Слои одежды в холод:**
База: влагоотводящий материал (не хлопок)
Средний слой: флис или термобельё
Внешний: ветрозащита при необходимости
`;
}
export function getDeloadWeek(message: string): string {
  const kw = ['разгрузочная неделя', 'делоад', 'deload', 'снижение нагрузки', 'перетренированность симптомы'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Разгрузочная неделя (деload) — когда и как:**

**Когда делать деload:**
Каждые 4-8 недель при интенсивных тренировках (проактивный деload)
Немедленно при 2+ тренировках подряд со снижением силы (реактивный деload)
Начинающие: каждые 8-12 недель; продвинутые: каждые 3-5 недель

**Как проводить (два метода, НЕ оба одновременно):**
Метод 1 — снижение объёма: уменьшить количество подходов на 40-60%, веса остаются прежними
Метод 2 — снижение интенсивности: уменьшить рабочие веса на 10-15%, объём прежний
Продолжительность: 1 неделя (5-7 дней)

**Симптомы перетренированности (сигнал к срочному деload):**
Стойкая усталость, не проходящая после 2-3 дней отдыха
Повышение пульса в покое на 5-10 уд/мин
Раздражительность, бессонница, снижение аппетита
Регресс силовых показателей 2+ недели подряд
Частые простуды (подавленный иммунитет)
Боли в суставах и сухожилиях, не связанные с конкретной травмой

**Проактивный vs реактивный деload:**
Проактивный (запланированный): лучший вариант — не допускает перетренированности
Реактивный (по симптомам): организм уже перегружен → восстановление займёт дольше
Правило: если сомневаетесь — лучше сделать деload раньше, чем позже

**Что НЕ делать на деload:**
Не прекращать тренировки полностью (теряется моторный паттерн)
Не вводить новые упражнения (нейромышечный стресс)
Не увеличивать кардио (добавляет стресс вместо восстановления)
`;
}
export function getCooldownProtocol(message: string): string {
  const kw = ['заминка', 'растяжка после тренировки', 'восстановление после тренировки', 'cooldown'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Заминка после тренировки — что говорит наука:**

**Цели заминки:**
Активация парасимпатической нервной системы (переход из «бей-беги» в «отдыхай-восстанавливайся»)
Постепенное снижение ЧСС (резкая остановка после интенсивной нагрузки может вызвать головокружение)
Субъективное ощущение завершённости тренировки (психологический эффект)

**Честно о науке:**
Van Hooren & Peake (2018): заминка НЕ снижает мышечную болезненность (DOMS) и НЕ ускоряет восстановление
Однако: субъективное самочувствие после заминки лучше (плацебо или нет — работает)
Статическая растяжка после тренировки: безопасна (в отличие от перед тренировкой) и улучшает гибкость

**Протокол заминки (10-15 минут):**

**Этап 1: Лёгкое кардио (5 минут)**
Ходьба на дорожке или просто по залу
ЧСС: постепенно снижаем до 100-110 уд/мин
Глубокое дыхание: вдох через нос (4 сек), выдох через рот (6 сек)

**Этап 2: Статическая растяжка (5-7 минут)**
Каждая растяжка: 30-60 секунд (менее 30 сек — неэффективно для развития гибкости)
Приоритет: мышцы, которые работали на тренировке
Верх: грудные в дверном проёме, трицепс за головой, растяжка широчайших
Низ: квадрицепс (стоя, пятка к ягодице), задняя поверхность бедра (наклон), голень к стене
Не тянитесь через боль — дискомфорт допустим, боль — нет

**Этап 3: Фоам-роллинг (опционально, 5 минут)**
Массажный ролл: 2 минуты на группу мышц, медленные прокатки
Приоритетные зоны: квадрицепс, IT band, широчайшие, грудной отдел
Давление: умеренное (6-7 из 10 по шкале дискомфорта)
Избегайте прокатки по суставам и костным выступам

**Дыхательная практика (box breathing, 2 минуты):**
4 секунды вдох → 4 секунды задержка → 4 секунды выдох → 4 секунды задержка
4-6 циклов достаточно для активации парасимпатики
Снижает кортизол, улучшает вариабельность сердечного ритма (HRV)

**Если времени нет:**
Минимум: 2-3 минуты ходьбы + 5 глубоких вдохов. Лучше, чем ничего.
Исследования показывают: пропуск заминки НЕ ухудшает восстановление значимо.
Приоритет всегда: тренировка > разминка > заминка. Если что-то сокращать — сокращайте заминку.
`;
}
