/**
 * knowledge-topics/analytics.ts — auto-split from knowledgeHelpers.ts
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
import { DifficultyAdjustment, MUSCLE_GROUPS_LEGS, MuscleBalanceResult } from './misc';
import { EXERCISE_MUSCLE_MAP, MUSCLE_GROUPS_PULL, MUSCLE_GROUPS_PUSH } from './training';

export function analyzeMuscleBalance(
  exerciseSets: Array<{ exercise: { name: string }; sets: Array<{ weight: number | null; reps: number | null }> }>,
): MuscleBalanceResult {
  const muscleVolume: Record<string, number> = {};

  for (const es of exerciseSets) {
    const name = es.exercise.name.toLowerCase();
    let muscles: string[] = [];

    // Find matching muscle group
    for (const [exerciseName, groups] of Object.entries(EXERCISE_MUSCLE_MAP)) {
      if (name.includes(exerciseName) || exerciseName.includes(name)) {
        muscles = groups;
        break;
      }
    }

    if (muscles.length === 0) continue;

    // Count total volume (sets * reps * weight) per muscle
    const totalVol = es.sets.reduce((sum, s) => {
      return sum + ((s.weight || 0) * (s.reps || 0));
    }, 0);

    const volPerMuscle = totalVol / muscles.length;
    for (const m of muscles) {
      muscleVolume[m] = (muscleVolume[m] || 0) + volPerMuscle;
    }
  }

  // Calculate push/pull ratio
  const pushVol = MUSCLE_GROUPS_PUSH.reduce((s, m) => s + (muscleVolume[m] || 0), 0);
  const pullVol = MUSCLE_GROUPS_PULL.reduce((s, m) => s + (muscleVolume[m] || 0), 0);
  const upperVol = pushVol + pullVol;
  const lowerVol = MUSCLE_GROUPS_LEGS.reduce((s, m) => s + (muscleVolume[m] || 0), 0);

  const pushPullRatio = pullVol > 0 ? pushVol / pullVol : pushVol > 0 ? 5.0 : 1.0;
  const upperLowerRatio = lowerVol > 0 ? upperVol / lowerVol : upperVol > 0 ? 5.0 : 1.0;

  // Detect neglected muscles (0 volume)
  const allMuscles = [...MUSCLE_GROUPS_PUSH, ...MUSCLE_GROUPS_PULL, ...MUSCLE_GROUPS_LEGS];
  const neglectedMuscles = allMuscles.filter((m) => !muscleVolume[m] || muscleVolume[m] === 0);

  // Detect overtrained (>3x average)
  const volumes = Object.values(muscleVolume).filter((v) => v > 0);
  const avgVol = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const overtrainedMuscles = Object.entries(muscleVolume)
    .filter(([, vol]) => vol > avgVol * 3)
    .map(([m]) => m);

  // Build advice
  const adviceParts: string[] = [];
  if (pushPullRatio > 1.5) {
    adviceParts.push(`Много жимовых (push:pull = ${pushPullRatio.toFixed(1)}). Добавь тяговые: подтягивания, тяга в наклоне, фейспулл.`);
  } else if (pushPullRatio < 0.7) {
    adviceParts.push(`Мало жимовых (push:pull = ${pushPullRatio.toFixed(1)}). Добавь жим, отжимания, разводки.`);
  }
  if (upperLowerRatio > 2.0) {
    adviceParts.push(`Перекос в верх тела (верх:низ = ${upperLowerRatio.toFixed(1)}). Добавь приседания, выпады, румынскую тягу.`);
  } else if (upperLowerRatio < 0.5) {
    adviceParts.push(`Много ног, мало верха (верх:низ = ${upperLowerRatio.toFixed(1)}). Баланс по верху: жим, тяги, подтягивания.`);
  }

  const importantNeglected = neglectedMuscles.filter((m) =>
    ['спина', 'ягодицы', 'бёдра-задние', 'плечи-средние', 'икры'].includes(m)
  );
  if (importantNeglected.length > 0) {
    adviceParts.push(`Не тренируются: ${importantNeglected.join(', ')}.`);
  }

  return {
    pushPullRatio,
    upperLowerRatio,
    neglectedMuscles,
    overtrainedMuscles,
    advice: adviceParts.join(' '),
  };
}
export function analyzeDifficultyAdjustments(
  lastWorkoutExercises: Array<{
    exercise: { name: string };
    sets: Array<{ weight: number | null; reps: number | null; rpe: number | null; completed: boolean }>;
  }>
): DifficultyAdjustment[] {
  const adjustments: DifficultyAdjustment[] = [];

  for (const we of lastWorkoutExercises) {
    const completedSets = we.sets.filter((s) => s.completed);
    if (completedSets.length === 0) continue;

    const avgWeight = completedSets.reduce((s, set) => s + (set.weight || 0), 0) / completedSets.length;
    const avgReps = completedSets.reduce((s, set) => s + (set.reps || 0), 0) / completedSets.length;
    const avgRpe = completedSets.filter((s) => s.rpe).reduce((s, set) => s + (set.rpe || 0), 0) / (completedSets.filter((s) => s.rpe).length || 1);
    const completionRate = completedSets.length / we.sets.length;

    if (avgWeight === 0) continue;

    // Too easy: all sets completed, low RPE
    if (completionRate === 1 && avgRpe > 0 && avgRpe < 7) {
      const increase = avgRpe < 5 ? 0.1 : 0.05; // +10% or +5%
      adjustments.push({
        exerciseName: we.exercise?.name,
        currentWeight: Math.round(avgWeight),
        suggestedWeight: Math.round(avgWeight * (1 + increase) / 2.5) * 2.5, // round to 2.5kg
        currentReps: Math.round(avgReps),
        suggestedReps: Math.round(avgReps),
        reason: `RPE ${avgRpe.toFixed(0)} — слишком легко. Увеличь вес на ${Math.round(increase * 100)}%.`,
      });
    }

    // Too hard: low completion, high RPE
    if (completionRate < 0.7 || (avgRpe >= 9.5)) {
      const decrease = completionRate < 0.5 ? 0.15 : 0.1;
      adjustments.push({
        exerciseName: we.exercise?.name,
        currentWeight: Math.round(avgWeight),
        suggestedWeight: Math.round(avgWeight * (1 - decrease) / 2.5) * 2.5,
        currentReps: Math.round(avgReps),
        suggestedReps: Math.round(avgReps),
        reason: completionRate < 0.7
          ? `Выполнено только ${Math.round(completionRate * 100)}% подходов — снизь вес на ${Math.round(decrease * 100)}%.`
          : `RPE ${avgRpe.toFixed(0)} — на пределе. Снизь вес на ${Math.round(decrease * 100)}% для безопасного прогресса.`,
      });
    }

    // Rep target not met consistently (completed but fewer reps than planned)
    if (completionRate >= 0.8 && avgRpe >= 8 && avgRpe < 9.5) {
      // This is the "productive" zone — just acknowledge it
      // No adjustment needed
    }
  }

  return adjustments;
}
export function trackVolumeLandmarks(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
    completedAt: Date | null;
  }>,
  totalWorkoutsEver: number,
): string {
  if (recentWorkouts.length === 0) return '';

  // Estimate lifetime volume from recent data
  const recentVolumes = recentWorkouts.map((w) =>
    w.exercises.reduce((sum, ex) =>
      sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0),
  );
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const estimatedLifetimeVolume = Math.round(avgVolume * totalWorkoutsEver);

  // Tonnage milestones
  const milestones = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
  const nextMilestone = milestones.find((m) => m > estimatedLifetimeVolume);
  const lastMilestone = milestones.filter((m) => m <= estimatedLifetimeVolume).pop();

  const lines: string[] = [];
  lines.push(`Примерный общий тоннаж: ~${(estimatedLifetimeVolume / 1000).toFixed(0)} тонн`);

  if (lastMilestone) {
    lines.push(`✅ Достигнут рубеж: ${(lastMilestone / 1000).toFixed(0)} тонн`);
  }

  if (nextMilestone) {
    const remaining = nextMilestone - estimatedLifetimeVolume;
    const workoutsToGo = avgVolume > 0 ? Math.ceil(remaining / avgVolume) : 0;
    lines.push(`🎯 Следующий рубеж: ${(nextMilestone / 1000).toFixed(0)} тонн (осталось ~${workoutsToGo} тренировок)`);
  }

  // Session volume trend
  if (recentVolumes.length >= 3) {
    const recent3 = recentVolumes.slice(0, 3);
    const older = recentVolumes.slice(3);
    if (older.length > 0) {
      const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      const changePct = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);
      if (Math.abs(changePct) > 10) {
        lines.push(`${changePct > 0 ? '📈' : '📉'} Тоннаж за тренировку: ${changePct > 0 ? '+' : ''}${changePct}% vs предыдущие`);
      }
    }
  }

  return `\n\n## 🏋️ ТОННАЖ
${lines.join('\n')}`;
}
export function analyzeConsistency(
  recentWorkouts: Array<{ completedAt: Date | null }>,
  plannedDaysPerWeek: number,
): string {
  const completed = recentWorkouts.filter((w) => w.completedAt).map((w) => new Date(w.completedAt!));
  if (completed.length < 3) return '';

  // Analyze gaps between workouts
  const gaps: number[] = [];
  for (let i = 0; i < completed.length - 1; i++) {
    const gap = Math.round((completed[i].getTime() - completed[i + 1].getTime()) / (1000 * 60 * 60 * 24));
    gaps.push(gap);
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const maxGap = Math.max(...gaps);
  const minGap = Math.min(...gaps);
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
  const consistency = Math.max(0, 100 - Math.round(Math.sqrt(gapVariance) * 20));

  const lines: string[] = [];
  lines.push(`Средний интервал между тренировками: ${avgGap.toFixed(1)} дней`);
  lines.push(`Стабильность расписания: ${consistency}%`);

  if (plannedDaysPerWeek > 0) {
    const idealGap = 7 / plannedDaysPerWeek;
    if (avgGap > idealGap * 1.5) {
      lines.push(`⚠️ Тренируешься реже плана (${plannedDaysPerWeek} дн/нед → идеал: каждые ${idealGap.toFixed(1)} дн)`);
    }
  }

  if (maxGap > 7) {
    lines.push(`⚠️ Был перерыв ${maxGap} дней — стабильность важнее интенсивности`);
  }

  // Day-of-week preference
  const dayCount: Record<number, number> = {};
  for (const d of completed) {
    const day = d.getDay();
    dayCount[day] = (dayCount[day] || 0) + 1;
  }
  const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const favoriteDays = Object.entries(dayCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => dayNames[Number(day)]);
  if (favoriteDays.length > 0) {
    lines.push(`Любимые дни: ${favoriteDays.join(', ')}`);
  }

  return `\n\n## 📅 СТАБИЛЬНОСТЬ ТРЕНИРОВОК
${lines.join('\n')}
→ Используй при планировании расписания и рекомендациях по частоте.`;
}
export function calculateMuscleBalance(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { primaryMuscles: string[] };
      sets: Array<{ completed: boolean }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Classify muscles into movement patterns
  const pushMuscles = new Set(['chest', 'shoulders', 'triceps']);
  const pullMuscles = new Set(['back', 'lats', 'biceps', 'traps', 'forearms']);
  const legMuscles = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']);

  let pushSets = 0, pullSets = 0, legSets = 0;

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      const completedSets = ex.sets.filter((s) => s.completed).length;
      const primary = ex.exercise?.primaryMuscles?.[0];
      if (!primary) continue;
      if (pushMuscles.has(primary)) pushSets += completedSets;
      else if (pullMuscles.has(primary)) pullSets += completedSets;
      else if (legMuscles.has(primary)) legSets += completedSets;
    }
  }

  const total = pushSets + pullSets + legSets;
  if (total < 10) return '';

  const pushPct = Math.round((pushSets / total) * 100);
  const pullPct = Math.round((pullSets / total) * 100);
  const legPct = Math.round((legSets / total) * 100);

  // Ideal ratio roughly 30:35:35 (more pulling for posture)
  const issues: string[] = [];
  if (pushPct > pullPct + 10) issues.push('больше тяг (горизонт. + вертик.) для баланса плечевого пояса');
  if (legPct < 20) issues.push('увеличить объём на ноги (≥30% от общего)');
  if (pullPct < 20) issues.push('добавить тяговые движения для здоровья спины');

  const lines: string[] = [];
  lines.push(`Push ${pushPct}% : Pull ${pullPct}% : Legs ${legPct}% (подходов: ${pushSets}/${pullSets}/${legSets})`);

  if (issues.length > 0) {
    lines.push(`⚠️ Рекомендации: ${issues.join('; ')}`);
  } else {
    lines.push('✅ Баланс Push/Pull/Legs в норме');
  }

  return `\n\n## ⚖️ БАЛАНС ДВИЖЕНИЙ
${lines.join('\n')}
→ Учитывай при составлении и корректировке программ.`;
}
export function analyzeCompoundPriority(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { type: string; primaryMuscles: string[] };
      order: number;
      sets: Array<{ completed: boolean }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 2) return '';

  let compoundFirst = 0;
  let isolationFirst = 0;
  let totalCompound = 0;
  let totalIsolation = 0;

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      if (!ex.exercise) continue;
      const isCompound = ['barbell', 'dumbbell'].includes(ex.exercise.type) &&
        ex.exercise?.primaryMuscles?.length >= 1;
      const isIsolation = ['machine', 'cable'].includes(ex.exercise.type);

      if (isCompound) {
        totalCompound += ex.sets.filter((s) => s.completed).length;
        if (ex.order <= 2) compoundFirst++;
      }
      if (isIsolation) {
        totalIsolation += ex.sets.filter((s) => s.completed).length;
        if (ex.order <= 2 && w.exercises.some((e) => ['barbell', 'dumbbell'].includes(e.exercise?.type) && e.order > ex.order)) {
          isolationFirst++;
        }
      }
    }
  }

  const lines: string[] = [];
  const ratio = totalCompound + totalIsolation > 0
    ? Math.round((totalCompound / (totalCompound + totalIsolation)) * 100)
    : 50;

  lines.push(`Базовые: ${totalCompound} подходов (${ratio}%) | Изоляция: ${totalIsolation} подходов (${100 - ratio}%)`);

  if (isolationFirst > compoundFirst && compoundFirst > 0) {
    lines.push('⚠️ Изоляция часто идёт перед базовыми — делай наоборот для максимальной силы');
  }

  if (ratio < 40) {
    lines.push('⚠️ Мало базовых упражнений. Добавь приседания, жимы, тяги — они дают максимум отдачи.');
  }

  if (lines.length <= 1) return ''; // nothing interesting

  return `\n\n## 🎯 ПРИОРИТЕТ БАЗОВЫХ УПРАЖНЕНИЙ
${lines.join('\n')}`;
}
export function calculateReadinessScore(
  recoveryScore: number,
  daysSinceLastWorkout: number | null,
  sleepQuality: string | null, // 'good' | 'poor' | null
  moodDetected: string | null,
  muscleRecoveryPct: number, // % of muscles that are recovered
): string {
  let score = 0;

  // Recovery (0-30 pts)
  score += Math.round(recoveryScore * 0.3);

  // Rest days (0-25 pts)
  if (daysSinceLastWorkout !== null) {
    if (daysSinceLastWorkout === 0) score += 10; // trained today already
    else if (daysSinceLastWorkout === 1) score += 20;
    else if (daysSinceLastWorkout === 2) score += 25;
    else if (daysSinceLastWorkout >= 3) score += 15; // too much rest
  } else {
    score += 25; // fresh
  }

  // Sleep (0-20 pts)
  if (sleepQuality === 'good') score += 20;
  else if (sleepQuality === 'poor') score += 5;
  else score += 12; // unknown = average

  // Mood (0-15 pts)
  if (moodDetected === 'motivated') score += 15;
  else if (moodDetected === 'tired' || moodDetected === 'pain') score += 3;
  else if (moodDetected === 'stressed' || moodDetected === 'demotivated') score += 5;
  else score += 10; // neutral

  // Muscle recovery (0-10 pts)
  score += Math.round(muscleRecoveryPct * 0.1);

  const clampedScore = Math.min(100, Math.max(0, score));

  let readiness: string;
  let recommendation: string;
  if (clampedScore >= 80) {
    readiness = '🟢 Отлично';
    recommendation = 'Можно тренироваться на полную! Хороший день для PR-попытки.';
  } else if (clampedScore >= 60) {
    readiness = '🟡 Хорошо';
    recommendation = 'Нормальная тренировка. Работай по плану.';
  } else if (clampedScore >= 40) {
    readiness = '🟠 Средне';
    recommendation = 'Снизь интенсивность на 10-20%. Фокус на технике, не на весах.';
  } else {
    readiness = '🔴 Низкая';
    recommendation = 'Рассмотри лёгкую тренировку или день отдыха. Восстановление важнее.';
  }

  return `\n\n## 💪 ГОТОВНОСТЬ К ТРЕНИРОВКЕ: ${clampedScore}/100 ${readiness}
${recommendation}`;
}
export function analyzeVolumeDosing(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { primaryMuscles: string[] };
      sets: Array<{ completed: boolean; type: string }>;
    }>;
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Count completed working sets per muscle in last 7 days
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const muscleSets: Record<string, number> = {};

  for (const w of recentWorkouts) {
    if (!w.completedAt || now - w.completedAt.getTime() > weekMs) continue;
    for (const ex of w.exercises) {
      const workingSets = ex.sets.filter(s => s.completed && s.type !== 'warmup').length;
      for (const m of ex.exercise?.primaryMuscles ?? []) {
        muscleSets[m] = (muscleSets[m] || 0) + workingSets;
      }
    }
  }

  if (Object.keys(muscleSets).length === 0) return '';

  // Optimal ranges (weekly sets per muscle)
  const optimalRange: Record<string, [number, number]> = {
    chest: [10, 20], back: [10, 20], shoulders: [8, 16],
    biceps: [6, 14], triceps: [6, 14], quadriceps: [10, 20],
    hamstrings: [8, 16], glutes: [8, 16], calves: [6, 12],
    abs: [6, 14], traps: [6, 12],
  };

  const muscleRu: Record<string, string> = {
    chest: 'Грудь', back: 'Спина', shoulders: 'Плечи',
    biceps: 'Бицепс', triceps: 'Трицепс', quadriceps: 'Квадрицепс',
    hamstrings: 'Задняя поверхность', glutes: 'Ягодицы', calves: 'Икры',
    abs: 'Пресс', traps: 'Трапеция',
  };

  const report: string[] = [];
  for (const [muscle, sets] of Object.entries(muscleSets)) {
    const range = optimalRange[muscle];
    if (!range) continue;
    const name = muscleRu[muscle] || muscle;
    if (sets < range[0]) {
      report.push(`⬇️ ${name}: ${sets} подходов/нед (мало, нужно ${range[0]}-${range[1]})`);
    } else if (sets > range[1]) {
      report.push(`⬆️ ${name}: ${sets} подходов/нед (много, оптимум ${range[0]}-${range[1]})`);
    }
  }

  if (report.length === 0) return '';

  return `\n\n## 📊 ОБЪЁМ ПО МЫШЦАМ (за неделю)
${report.slice(0, 4).join('\n')}
Помоги скорректировать объём если пользователь спрашивает о программе.`;
}
export function monitorLoadRampRate(
  recentWorkouts: Array<{
    totalVolume: number | null;
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 4) return '';

  // Get weekly volumes
  const weeklyVolumes: number[] = [];
  const now = Date.now();
  for (let week = 0; week < 4; week++) {
    const weekStart = now - (week + 1) * 7 * 86400000;
    const weekEnd = now - week * 7 * 86400000;
    const weekVol = recentWorkouts
      .filter(w => w.completedAt && w.completedAt.getTime() >= weekStart && w.completedAt.getTime() < weekEnd)
      .reduce((sum, w) => sum + (w.totalVolume || 0), 0);
    weeklyVolumes.push(weekVol);
  }

  // Calculate week-over-week changes
  const changes: number[] = [];
  for (let i = 0; i < weeklyVolumes.length - 1; i++) {
    if (weeklyVolumes[i + 1] > 0) {
      changes.push((weeklyVolumes[i] - weeklyVolumes[i + 1]) / weeklyVolumes[i + 1]);
    }
  }

  if (changes.length === 0) return '';

  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const pct = Math.round(avgChange * 100);

  if (pct > 15) {
    return `\n\n## ⚠️ СКОРОСТЬ РОСТА НАГРУЗКИ: +${pct}%/нед
Слишком быстрый рост объёма! Рекомендуемый безопасный темп: 5-10% в неделю.
Высокий темп роста = повышенный риск травмы и перетренированности.`;
  }

  if (pct < -15) {
    return `\n\n## 📉 СНИЖЕНИЕ НАГРУЗКИ: ${pct}%/нед
Объём тренировок снижается. Это нормально для разгрузочной недели, но если не запланировано — выясни причину.`;
  }

  return '';
}
export function calculatePlates(targetWeight: number): string {
  if (targetWeight <= 20) return 'Пустой гриф (20 кг)';

  const perSide = (targetWeight - 20) / 2;
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
  const result: string[] = [];
  let remaining = perSide;

  for (const plate of plates) {
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.push(`${plate}кг × ${count}`);
      remaining -= count * plate;
    }
  }

  if (result.length === 0) return '';
  return `Блины на сторону: ${result.join(' + ')}`;
}
export function analyzeIntensityDistribution(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ rpe: number | null; completed: boolean }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  const rpeValues: number[] = [];
  for (const w of recentWorkouts.slice(0, 5)) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (s.rpe && s.completed) rpeValues.push(s.rpe);
      }
    }
  }

  if (rpeValues.length < 10) return '';

  const zones = {
    easy: rpeValues.filter(r => r <= 6).length,
    moderate: rpeValues.filter(r => r >= 7 && r <= 8).length,
    hard: rpeValues.filter(r => r >= 9).length,
  };

  const total = rpeValues.length;
  const easyPct = Math.round((zones.easy / total) * 100);
  const modPct = Math.round((zones.moderate / total) * 100);
  const hardPct = Math.round((zones.hard / total) * 100);

  // Optimal: ~30% easy, ~50% moderate, ~20% hard
  const distribution = `Лёгкие (RPE ≤6): ${easyPct}% | Средние (RPE 7-8): ${modPct}% | Тяжёлые (RPE 9-10): ${hardPct}%`;

  const advice: string[] = [];
  if (hardPct > 40) advice.push('Слишком много тяжёлой работы. Целевое: ~20% подходов на RPE 9-10.');
  if (easyPct < 10) advice.push('Мало лёгкой работы. Добавь разминочные и техничные подходы.');

  return `\n\n## 📊 РАСПРЕДЕЛЕНИЕ ИНТЕНСИВНОСТИ
${distribution}
${advice.length > 0 ? advice.join('\n') : 'Хорошее распределение!'}`;
}
export function analyzeStickingPoints(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['застреваю', 'мёртвая точка', 'не могу пройти', 'в нижней точке', 'в верхней точке', 'слабое место'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n📍 Анализ слабых точек в базовых упражнениях:

**Присед (застряли в нижней точке):**
Слабое место: квадрицепс или мобильность голеностопа
Решение: паузный присед, болгарский сплит, жим ногами

**Жим лёжа (застряли в нижней точке):**
Слабое место: грудные или передняя дельта
Решение: жим с паузой на груди, жим под углом, разводка

**Жим лёжа (застряли в верхней точке):**
Слабое место: трицепс
Решение: французский жим, отжимания на брусьях, жим узким хватом

**Становая (с пола не идёт):**
Слабое место: квадрицепс или слабый старт
Решение: становая с плинтов, жим ногами, паузная тяга у пола

**Становая (ниже колен застряла):**
Слабое место: поясница или ягодицы
Решение: румынская тяга, гиперэкстензия, хорошее утро`;
}
export function getTrackingMetrics(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['что отслеживать', 'метрики', 'показатели прогресса', 'как измерить прогресс', 'tracking metrics', 'не знаю прогрессирую ли'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n📏 **Ключевые метрики для отслеживания прогресса:**

**Сила:**
• 1ПМ (или расчётный) в больших упражнениях — присед, жим, тяга
• Рабочий вес × повторения (объём прогрессии)
• Отслеживай каждую тренировку

**Тело:**
• Вес: утром, натощак, после туалета — 1 раз/нед (усредняй 3-5 дней)
• Обхваты: талия, грудь, бёдра, рука, нога — 1 раз/2-4 нед
• Фото: одинаковое освещение, одинаковая поза — 1 раз/4 нед

**Питание:**
• Ккал / белок / вода (ежедневно при активной работе над составом тела)

**Восстановление:**
• Субъективное самочувствие 1-10 каждое утро
• Качество сна (приложение или Apple Watch/Garmin)
• ЧСС в покое утром (рост = недовосстановление)

**Производительность:**
• Время завершения тренировки (плотность)
• Выносливость: количество кардио при одинаковом ЧСС

**Красные флаги:**
🚩 Сила падает 2+ недели → деньги, программа или восстановление
🚩 Вес растёт быстро при наборе → профицит слишком большой
🚩 Вес не меняется при дефиците → калории выше, чем кажется

💡 Не все метрики нужны сразу — начни с весов + силовых. Добавляй по мере необходимости.`;
}
export function getWearablesFitnessTracking(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('часы') || lower.includes('фитнес-браслет') || lower.includes('garmin') ||
    lower.includes('apple watch') || lower.includes('mi band') || lower.includes('пульсомер') ||
    lower.includes('шаги') || lower.includes('hrv') || lower.includes('вариабельность');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⌚ ФИТНЕС-ТРЕКЕРЫ И УМНЫЕ ЧАСЫ:');
  lines.push('');
  lines.push('📊 ЧТО РЕАЛЬНО ПОЛЕЗНО ОТСЛЕЖИВАТЬ:');
  lines.push('• ЧСС в покое: >60 уд/мин = усталость/болезнь, <50 = хорошая форма');
  lines.push('• HRV (вариабельность ЧСС): чем выше — тем лучше восстановление');
  lines.push('• Шаги: 7000–10 000/день — оптимально для здоровья');
  lines.push('• Сон: фазы, общее время, пробуждения');
  lines.push('');
  lines.push('⚠️ ЧТО НЕ ОЧЕНЬ ТОЧНО:');
  lines.push('• Калории от тренировки: погрешность 20–40%');
  lines.push('• SpO2 без сертификации — только ориентировочно');
  lines.push('• Стресс-оценка — алгоритм, не диагноз');
  lines.push('');
  lines.push('🇷🇺 ПОПУЛЯРНЫЕ В РФ:');
  lines.push('• Xiaomi Mi Band / Redmi Band — бюджет, базовые функции');
  lines.push('• Huawei Watch — хорошая точность ЧСС');
  lines.push('• Garmin Forerunner — лучшие для бега и триатлона');
  lines.push('• Apple Watch — экосистема iOS, здоровье Apple');
  lines.push('');
  lines.push('🎯 ГЛАВНОЕ: реагируй на тренды за 7–14 дней, не на разовые показатели.');
  return '\n\n' + lines.join('\n');
}
export function getFormulasCalculations(message: string): string {
  const kw = ['формулы тренировки', 'расчёт 1пм', 'вычислить объём нагрузку', 'формула прилепина', 'tonnage формула', 'тоннаж расчёт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Ключевые формулы и расчёты для тренировок:**

**1. Расчёт 1ПМ (прогностические формулы):**
Эпли: 1ПМ = вес × (1 + повторения/30)
Бжики: 1ПМ = вес × повторения × 0.0333 + вес
Ломбарди: 1ПМ = вес × повторения^0.10
Лучшие при 1-10 повторениях; точность снижается >10 повт

**2. Таблица % от 1ПМ:**
95% = 1-2 повт | 90% = 3 | 85% = 5 | 80% = 6-8 | 75% = 10 | 70% = 12 | 65% = 15 | 60% = 20

**3. Тоннаж (тренировочный объём):**
Тоннаж = Вес × Сеты × Повторения
Пример: 100 кг × 5 сетов × 5 повт = 2500 кг тоннажа
Применение: отслеживание прогресса объёма нагрузки

**4. Формула Прилепина (оптимальный объём по %1ПМ):**
55-65%: 24-48 повт/упражнение (оптимум 30)
70-75%: 18-24 повт (оптимум 18)
80-85%: 15-24 повт (оптимум 18)
90+%: 4-10 повт (оптимум 7)

**5. INOL (Intensity × Number Of Lifts):**
INOL = повторения / (100 — %1ПМ)
<0.4 = слишком легко
0.4-1.0 = умеренно (оптимум для большинства)
1.0-2.0 = тяжело (допустимо для конкретного движения)
>2.0 = чрезмерно, риск перетренированности

**6. Расчёт нагрузки дня (RPE → вес):**
Если RPE 8 при 100 кг × 5 повт → следующий сет добавить 2.5-5 кг (до RPE 9)
Или уменьшить при RPE >9

**7. Прогрессия по неделям:**
Линейная: +2.5 кг/нед (новичок), +1.25 кг/нед (средний)
Процентная: +2-3% нагрузки каждую неделю
`;
}
export function getTrackerOptimization(message: string): string {
  const kw = ['фитнес трекер', 'часы тренировки', 'apple watch', 'garmin', 'whoop hrv'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Фитнес-трекеры и носимые устройства:**

**Что они хорошо измеряют:**
ЧСС в покое (±2-3 уд/мин)
Тренд HRV (относительные изменения, не абсолют)
Шаги (±5-10%)
Сон (длительность, ±15 мин)

**Что они плохо измеряют:**
Калории сожжённые (ошибка до ±27%)
Глубокий сон vs REM (неточность до 50%)
Стресс-скор (субъективная интерпретация)

**Как использовать правильно:**

HRV (Heart Rate Variability):
Мерь утром, лёжа, 2-3 мин (не случайно в течение дня)
Тренд важнее абсолюта: если HRV ↓ 3 дня подряд → deload
Нормальная вариация: ±10-15% от среднего

ЧСС покоя:
Твой "базовый" уровень — определи за 2 недели
+5-10 уд/мин от нормы = недовосстановление или болезнь

Зоны ЧСС для кардио:
Zone 2: 60-70% макс ЧСС (разговорный темп)
Zone 3: 70-80% (комфортно тяжело)
Zone 4: 80-90% (тяжело, интервалы)
Zone 5: 90-100% (максимум, спринты)
Макс ЧСС ≈ 220 - возраст (грубая оценка)
`;
}
export function getProgressTracking(message: string): string {
  const kw = ['как отслеживать прогресс', 'прогресс не виден', 'как понять что прогрессирую', 'стоит ли на месте'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Отслеживание прогресса — как понять, что вы двигаетесь вперёд:**

**Метрики силы (главный индикатор):**
Одноповторный максимум (1RM) или расчётный e1RM — главный показатель прогресса в силе
Отслеживайте e1RM для ключевых упражнений: присед, жим лёжа, становая тяга, жим стоя
Рост e1RM = однозначный прогресс (даже если визуально мало что изменилось)
Формула Epley: e1RM = вес × (1 + повторения / 30)

**Тренировочный объём:**
Общий тоннаж за тренировку: сумма (вес × повторения) по всем подходам
Растущий тоннаж при сохранении техники = прогресс
Пример: жим 80кг × 3×8 = 1920 кг → через месяц 85кг × 3×8 = 2040 кг (+6%)

**Антропометрия (обхваты тела):**
Измеряйте 1 раз в 2-4 недели, утром натощак, в одних и тех же точках
Ключевые точки: шея, грудь, бицепс (напряжённый), талия (на пупке), бёдра, бедро
Рост обхватов рук/ног + уменьшение талии = рекомпозиция тела (идеально!)
Используйте сантиметровую ленту — всегда одно и то же натяжение

**Фотографии:**
Делайте фото каждые 4 недели (спереди, сбоку, сзади)
Одинаковые условия: освещение, время дня, одежда, поза
Визуальные изменения накапливаются медленно — фото позволяют сравнить
Более информативно, чем весы (зеркало обманывает из-за ежедневного привыкания)

**Почему весы врут:**
Вода: ±1-2 кг за день (соль, углеводы, стресс, цикл у женщин)
Еда: 500г еды в желудке = +500г на весах (не жир!)
Мышцы vs жир: можно потерять 2 кг жира + набрать 2 кг мышц = весы "стоят на месте"
Решение: взвешивайтесь ежедневно утром → считайте средний вес за неделю → сравнивайте средние

**Ожидания по скорости прогресса (набор мышц):**
Новичок (первый год): 0.7-1.5 кг мышц в месяц (8-12 кг за год — при идеальных условиях)
Средний (2-3 года): 0.3-0.5 кг мышц в месяц (4-6 кг за год)
Продвинутый (4+ лет): 0.1-0.25 кг мышц в месяц (1-3 кг за год)
Это МАКСИМАЛЬНЫЕ значения для мужчин. Женщины: примерно 50-60% от этих цифр.

**Когда прогресс реально остановился (плато):**
e1RM не растёт 3-4 недели подряд — время менять программу или переменные
Обхваты не изменились за 6-8 недель — проверьте питание (достаточно ли едите?)
Вес не падает 3 недели при сушке — снизьте калории на 100-200 или добавьте кардио
Одна "плохая неделя" — НЕ плато. Стресс, недосып, болезнь — нормальные причины регресса.

**Используйте это приложение:**
Записывайте каждый подход — приложение автоматически считает прогресс и e1RM
Регулярное логирование — ключ к осознанному тренингу и долгосрочному прогрессу
`;
}
