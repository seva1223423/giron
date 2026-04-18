/**
 * Context on Demand — AI-callable tools for fetching user data.
 *
 * These tools let the AI pull exactly what it needs instead of
 * receiving 12 000 tokens of pre-computed context on every request.
 *
 * Tool categories:
 *   get_workout_analysis   — progressive overload, plateau, muscle balance, frequency
 *   get_nutrition_analysis — macros, gaps, meal timing, TDEE estimate
 *   get_recovery_status    — fatigue score, sleep, consecutive days
 *   get_progress_data      — PRs, streaks, body weight trend, milestones
 *   search_fitness_knowledge — TF-IDF search over 25 knowledge modules
 */

import { prisma } from '../db';
import type { DeepSeekTool } from '../services/deepseekAI';

// ─── Pre-loaded data passed from the /chat handler ───────────────────────────

export interface ContextToolPreload {
  nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number } | null;
  sleepEntries?: Array<{ date: string; durationHours: number; quality?: number | null }>;
  todayMeals?: Array<{
    type: string;
    totalCalories: number;
    totalProtein: number;
    totalFats: number;
    totalCarbs: number;
    items?: Array<{ name: string; protein: number; fats: number; carbs: number }>;
    createdAt: Date;
  }>;
  todayDate?: string;
}

// ─── Tool Schemas (sent to AI) ────────────────────────────────────────────────

export const CONTEXT_TOOL_DEFINITIONS: DeepSeekTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_workout_analysis',
      description: 'Получить детальный анализ тренировок пользователя: прогрессивная перегрузка по упражнениям (плато/прогресс/регресс), мышечный баланс, частота тренировок, рекомендации по деload. Используй когда обсуждаешь программу, прогресс или тренировочный план.',
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            enum: ['overload', 'balance', 'frequency', 'all'],
            description: 'Фокус анализа: overload=прогрессивная перегрузка, balance=мышечный баланс, frequency=частота, all=всё',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_nutrition_analysis',
      description: 'Получить детальный анализ питания: макро-баланс за сегодня и неделю, дефициты макро/микронутриентов, тайминг приёмов пищи относительно тренировок, оценка TDEE на основе реальных данных. Используй для вопросов о питании, диете, КБЖУ.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week'],
            description: 'today=только сегодня, week=тренд за неделю',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recovery_status',
      description: 'Оценить статус восстановления пользователя: score 0-100, факторы риска (перетренированность, недосып, дефицит питания), рекомендации по интенсивности следующей тренировки. Используй для вопросов о самочувствии, усталости, болях, планировании нагрузки.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_progress_data',
      description: 'Получить данные о прогрессе: личные рекорды по упражнениям (PRs), стрик тренировок, история веса тела и динамика, достигнутые вехи (10/25/50/100 тренировок). Используй для аналитики, мотивации, отслеживания результатов.',
      parameters: {
        type: 'object',
        properties: {
          include: {
            type: 'string',
            enum: ['prs', 'streak', 'weight', 'all'],
            description: 'prs=рекорды, streak=стрик, weight=вес тела, all=всё',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_fitness_knowledge',
      description: 'Найти научную информацию в базе знаний по фитнесу: тренировочные принципы, питание, добавки, техника упражнений, физиология, реабилитация. Используй когда нужна конкретная информация по теме (например: "гипертрофия", "периодизация", "белок", "deload").',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос на русском или английском (например: "прогрессивная перегрузка", "протеин для набора массы", "deload week")',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

/**
 * Execute a context-fetching tool and return formatted string for AI.
 * Returns null if toolName is not a context tool (caller handles it).
 */
export async function executeContextTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  preload: ContextToolPreload,
): Promise<string | null> {
  switch (toolName) {
    case 'get_workout_analysis':
      return getWorkoutAnalysis(userId, (args.focus as string) ?? 'all');
    case 'get_nutrition_analysis':
      return getNutritionAnalysis(userId, preload, (args.period as string) ?? 'today');
    case 'get_recovery_status':
      return getRecoveryStatus(userId, preload);
    case 'get_progress_data':
      return getProgressData(userId, preload.todayDate ?? new Date().toISOString().split('T')[0], (args.include as string) ?? 'all');
    case 'search_fitness_knowledge':
      return searchFitnessKnowledge((args.query as string) ?? '');
    default:
      return null;
  }
}

// ─── Tool Implementations ─────────────────────────────────────────────────────

async function getWorkoutAnalysis(userId: string, focus: string): Promise<string> {
  const [exerciseSets, recentWorkouts] = await Promise.all([
    prisma.workoutExercise.findMany({
      where: { workout: { userId, completedAt: { not: null } } },
      select: {
        exercise: { select: { name: true, primaryMuscles: true } },
        workout: { select: { completedAt: true } },
        sets: { where: { completed: true, weight: { gt: 0 } }, select: { weight: true, reps: true } },
      },
      orderBy: { workout: { completedAt: 'desc' } },
      take: 500,
    }),
    prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        name: true,
        completedAt: true,
        durationMinutes: true,
        exercises: {
          select: {
            exercise: { select: { primaryMuscles: true } },
            sets: { where: { completed: true }, select: { weight: true, reps: true } },
          },
        },
      },
    }),
  ]);

  const sections: string[] = ['## 🏋️ АНАЛИЗ ТРЕНИРОВОК'];

  // ── Progressive overload ──
  if (focus === 'overload' || focus === 'all') {
    const history = new Map<string, Array<{ date: number; maxWeight: number }>>();
    for (const we of exerciseSets) {
      if (!we.workout.completedAt || we.sets.length === 0) continue;
      const name = we.exercise?.name;
      if (!name) continue;
      const maxW = Math.max(...we.sets.map((s) => s.weight ?? 0));
      if (!history.has(name)) history.set(name, []);
      history.get(name)!.push({ date: new Date(we.workout.completedAt).getTime(), maxWeight: maxW });
    }

    const plateaus: string[] = [], regressions: string[] = [], progressions: string[] = [];

    for (const [ex, sessions] of history) {
      if (sessions.length < 3) continue;
      sessions.sort((a, b) => a.date - b.date);
      const w = sessions.slice(-3).map((s) => s.maxWeight);
      if (w[2] > w[1] && w[1] >= w[0]) progressions.push(`${ex}: ${w[0]}→${w[2]} кг ✅`);
      else if (Math.max(...w) - Math.min(...w) <= 2.5) plateaus.push(`${ex}: ${w[0]} кг × 3 тр ⚠️`);
      else if (w[2] < w[0] - 2.5) regressions.push(`${ex}: ${w[0]}→${w[2]} кг ⛔`);
    }

    sections.push('\n### Прогрессивная перегрузка');
    if (progressions.length) sections.push(`✅ Прогрессирует: ${progressions.slice(0, 5).join(', ')}`);
    if (plateaus.length) {
      sections.push(`⚠️ ПЛАТО (нет прогресса 3+ тренировки): ${plateaus.join(', ')}`);
      sections.push('→ Варианты выхода: добавить 1.25 кг, сменить диапазон повторений (3×8→4×6), rest-pause, microload, deload неделю');
    }
    if (regressions.length) {
      sections.push(`⛔ РЕГРЕСС: ${regressions.join(', ')}`);
      sections.push('→ Причины: перетренированность, недосып, дефицит калорий/белка. Рекомендуй deload + пересмотр питания');
    }
    if (!progressions.length && !plateaus.length && !regressions.length) {
      sections.push('Недостаточно данных для анализа прогресса (нужно 3+ тренировки с одним упражнением)');
    }
  }

  // ── Muscle balance ──
  if (focus === 'balance' || focus === 'all') {
    const muscleVol: Record<string, number> = {};
    for (const w of recentWorkouts.slice(0, 5)) {
      for (const ex of w.exercises) {
        const vol = ex.sets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0);
        for (const m of ex.exercise?.primaryMuscles ?? []) {
          muscleVol[m] = (muscleVol[m] ?? 0) + vol;
        }
      }
    }
    const sorted = Object.entries(muscleVol).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 4) {
      const dominant = sorted.slice(0, 3).map(([m]) => m).join(', ');
      const neglected = sorted.slice(-3).map(([m]) => m).filter((m) => !sorted.slice(0, 3).map(([x]) => x).includes(m)).join(', ');
      sections.push(`\n### Мышечный баланс (последние 5 тренировок)`);
      sections.push(`Доминируют: ${dominant}`);
      if (neglected) sections.push(`⚠️ Слабо нагружены: ${neglected} — стоит добавить акцент`);
    }
  }

  // ── Frequency ──
  if (focus === 'frequency' || focus === 'all') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
    const timestamps = recentWorkouts.slice(0, 5).map((w) => new Date(w.completedAt!).getTime()).sort((a, b) => b - a);
    const avgGap = timestamps.length >= 2
      ? timestamps.slice(0, -1).reduce((s, t, i) => s + (t - timestamps[i + 1]) / 86400000, 0) / (timestamps.length - 1)
      : null;

    sections.push(`\n### Частота тренировок`);
    sections.push(`Последние 7 дней: ${weekCount} тренировок`);
    if (avgGap !== null) sections.push(`Среднее время между тренировками: ${avgGap.toFixed(1)} дн`);

    // Deload detection
    if (recentWorkouts.length >= 4) {
      const volumes = recentWorkouts.slice(0, 4).map((w) =>
        w.exercises.reduce((s, ex) => s + ex.sets.reduce((ss, set) => ss + (set.weight ?? 0) * (set.reps ?? 0), 0), 0)
      );
      const trend = volumes[0] < volumes[2] * 0.8 && volumes[0] < volumes[3] * 0.8;
      if (weekCount >= 5 || trend) {
        sections.push('⚠️ Признаки усталости: высокая частота или снижение объёма. Рекомендуй deload неделю (50% объёма и интенсивности)');
      }
    }
  }

  return sections.join('\n');
}

async function getNutritionAnalysis(userId: string, preload: ContextToolPreload, period: string): Promise<string> {
  const sections: string[] = ['## 🍽️ АНАЛИЗ ПИТАНИЯ'];
  const { nutritionTargets, todayMeals = [] } = preload;

  // Today's data (from preload — no extra DB query)
  if (todayMeals.length > 0) {
    const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const fats = todayMeals.reduce((s, m) => s + m.totalFats, 0);
    const carbs = todayMeals.reduce((s, m) => s + m.totalCarbs, 0);

    sections.push(`\n### Сегодня (${todayMeals.length} приёмов)`);
    sections.push(`${Math.round(cal)} ккал | Б: ${Math.round(prot)}г | Ж: ${Math.round(fats)}г | У: ${Math.round(carbs)}г`);

    if (nutritionTargets) {
      const calPct = Math.round((cal / nutritionTargets.calories) * 100);
      const protPct = Math.round((prot / nutritionTargets.protein) * 100);
      sections.push(`Норма: ${calPct}% ккал, ${protPct}% белок`);

      const hour = new Date().getHours();
      if (hour >= 14 && prot < nutritionTargets.protein * 0.4) {
        sections.push(`⚠️ КРИТИЧНО: ${Math.round(prot)}г белка из ${nutritionTargets.protein}г — уже ${hour}:00, а норма не выполнена и на 40%. Обязательно упомяни!`);
      }
      if (hour >= 18 && cal < nutritionTargets.calories * 0.5) {
        sections.push(`⚠️ Калории: ${Math.round(cal)}/${nutritionTargets.calories} ккал — вечер, а меньше половины нормы`);
      }
    }

    // Nutrition gaps
    const allItems = todayMeals.flatMap((m) => (m.items ?? []).map((i) => i.name.toLowerCase()));
    const gaps: string[] = [];
    if (allItems.length > 0) {
      if (!allItems.some((n) => /курица|мясо|рыба|говядин|яйц|творог|тунец|лосось/i.test(n))) gaps.push('нет белковых продуктов');
      if (!allItems.some((n) => /овощ|помидор|огурец|брокколи|шпинат|капуст|морков/i.test(n))) gaps.push('нет овощей');
      if (!allItems.some((n) => /орех|авокадо|лосось|оливк|семена/i.test(n))) gaps.push('нет омега-3 / полезных жиров');
      if (gaps.length) sections.push(`Пробелы в рационе: ${gaps.join(', ')}`);
    }
  } else {
    sections.push('Нет данных о питании за сегодня.');
  }

  // Week trend (DB query)
  if (period === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekMeals = await prisma.meal.findMany({
      where: { userId, createdAt: { gte: weekAgo } },
      select: { totalCalories: true, totalProtein: true, totalFats: true, totalCarbs: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    if (weekMeals.length >= 3) {
      const byDay: Record<string, { cal: number; prot: number; count: number }> = {};
      for (const m of weekMeals) {
        const day = new Date(m.createdAt).toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = { cal: 0, prot: 0, count: 0 };
        byDay[day].cal += m.totalCalories;
        byDay[day].prot += m.totalProtein;
        byDay[day].count++;
      }
      const days = Object.values(byDay);
      const avgCal = Math.round(days.reduce((s, d) => s + d.cal, 0) / days.length);
      const avgProt = Math.round(days.reduce((s, d) => s + d.prot, 0) / days.length);

      sections.push(`\n### Средние за неделю (${Object.keys(byDay).length} дней данных)`);
      sections.push(`${avgCal} ккал/день | ${avgProt}г белка/день`);

      if (nutritionTargets) {
        const calConsistency = Math.round((avgCal / nutritionTargets.calories) * 100);
        const protConsistency = Math.round((avgProt / nutritionTargets.protein) * 100);
        sections.push(`Выполнение нормы: ккал ${calConsistency}%, белок ${protConsistency}%`);
        if (protConsistency < 70) sections.push('⚠️ Хронический дефицит белка за неделю — это тормозит прогресс');

        // TDEE estimate
        const bodyWeights = await prisma.bodyWeight.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: 10,
          select: { weightKg: true, date: true },
        });
        if (bodyWeights.length >= 2) {
          const delta = bodyWeights[0].weightKg - bodyWeights[bodyWeights.length - 1].weightKg;
          const daySpan = (new Date(bodyWeights[0].date).getTime() - new Date(bodyWeights[bodyWeights.length - 1].date).getTime()) / 86400000;
          const impliedSurplus = daySpan > 0 ? (delta * 7700) / daySpan : 0;
          const tdee = Math.round(avgCal - impliedSurplus);
          if (tdee > 1200 && tdee < 6000) {
            sections.push(`Расчётный TDEE на основе данных: ~${tdee} ккал/день`);
          }
        }
      }
    }
  }

  return sections.join('\n');
}

async function getRecoveryStatus(userId: string, preload: ContextToolPreload): Promise<string> {
  const { nutritionTargets, sleepEntries = [], todayMeals = [] } = preload;

  const recentWorkouts = await prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
    take: 10,
    select: { completedAt: true },
  });

  let score = 100;
  const factors: string[] = [];

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
  if (weekCount >= 6) { score -= 25; factors.push(`6+ тренировок за неделю`); }
  else if (weekCount >= 5) { score -= 10; factors.push(`5 тренировок за неделю`); }

  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (recentWorkouts.some((w) => w.completedAt && new Date(w.completedAt) >= yesterday)) {
    score -= 15; factors.push('Тренировка менее 24ч назад');
  }

  let consecutive = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (recentWorkouts.some((w) => w.completedAt?.toISOString().split('T')[0] === ds)) consecutive++;
    else break;
  }
  if (consecutive >= 4) { score -= 20; factors.push(`${consecutive} дней подряд`); }

  if (nutritionTargets && todayMeals.length > 0) {
    const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    if (prot < nutritionTargets.protein * 0.6) { score -= 10; factors.push('Дефицит белка'); }
    if (cal < nutritionTargets.calories * 0.7) { score -= 10; factors.push('Дефицит калорий'); }
  }

  const recentSleep = sleepEntries.slice(0, 3);
  if (recentSleep.length > 0) {
    const avg = recentSleep.reduce((s, e) => s + e.durationHours, 0) / recentSleep.length;
    if (avg < 6) { score -= 20; factors.push(`Мало сна (${avg.toFixed(1)}ч/ночь)`); }
    else if (avg < 7) { score -= 10; factors.push(`Сон на грани нормы (${avg.toFixed(1)}ч/ночь)`); }
    const avgQ = recentSleep.filter((e) => e.quality != null).reduce((s, e) => s + (e.quality ?? 0), 0) / Math.max(1, recentSleep.filter((e) => e.quality != null).length);
    if (avgQ > 0 && avgQ <= 2) { score -= 10; factors.push(`Плохое качество сна`); }
  }

  score = Math.max(0, Math.min(100, score));
  const emoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
  const status = score >= 70 ? 'Хорошее восстановление' : score >= 40 ? 'Умеренная усталость' : 'Высокая усталость';

  const lines = [
    `## 🔋 СТАТУС ВОССТАНОВЛЕНИЯ`,
    `${emoji} Score: ${score}/100 — ${status}`,
    `Тренировок за неделю: ${weekCount} | Дней подряд: ${consecutive}`,
  ];

  if (factors.length) lines.push(`Факторы усталости: ${factors.join(', ')}`);

  if (score < 40) lines.push('→ РЕКОМЕНДАЦИЯ: активный отдых или очень лёгкая тренировка. Не нагружай тяжело!');
  else if (score < 70) lines.push('→ Снизь интенсивность на 15-20%, приоритет сон и белок сегодня.');
  else lines.push('→ Готов к полноценной тренировке.');

  return lines.join('\n');
}

async function getProgressData(userId: string, todayDate: string, include: string): Promise<string> {
  const sections: string[] = ['## 📈 ПРОГРЕСС'];

  if (include === 'prs' || include === 'all') {
    const exerciseSets = await prisma.workoutExercise.findMany({
      where: { workout: { userId, completedAt: { not: null } } },
      select: {
        exercise: { select: { name: true } },
        sets: { where: { completed: true, weight: { gt: 0 } }, select: { weight: true, reps: true } },
      },
      take: 2000,
    });

    const prMap = new Map<string, { weight: number; reps: number }>();
    for (const we of exerciseSets) {
      const name = we.exercise?.name;
      if (!name) continue;
      for (const s of we.sets) {
        const existing = prMap.get(name);
        if (!existing || (s.weight ?? 0) > existing.weight) {
          prMap.set(name, { weight: s.weight ?? 0, reps: s.reps ?? 0 });
        }
      }
    }

    if (prMap.size > 0) {
      const topPRs = [...prMap.entries()]
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, 8)
        .map(([ex, { weight, reps }]) => `${ex}: ${weight} кг × ${reps}`)
        .join(', ');
      sections.push(`\n### Личные рекорды\n${topPRs}`);
    }
  }

  if (include === 'streak' || include === 'all') {
    const workouts = await prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
      take: 400,
    });

    const total = workouts.length;
    const trainingDays = new Set(workouts.map((w) => w.completedAt!.toISOString().split('T')[0]));
    let streak = 0;
    const check = new Date(todayDate + 'T00:00:00.000Z');
    if (!trainingDays.has(check.toISOString().split('T')[0])) check.setDate(check.getDate() - 1);
    while (trainingDays.has(check.toISOString().split('T')[0])) { streak++; check.setDate(check.getDate() - 1); }

    const milestones = [10, 25, 50, 100, 200, 500].filter((m) => total >= m);
    const next = [10, 25, 50, 100, 200, 500].find((m) => m > total);

    sections.push(`\n### Стрик и вехи\nТекущий стрик: ${streak} дн | Всего тренировок: ${total}`);
    if (milestones.length) sections.push(`Достигнуто: ${milestones.map((m) => `${m} тр`).join(', ')}`);
    if (next) sections.push(`До следующей вехи: ${next - total} тренировок`);
    if (streak >= 7) sections.push(`🔥 Стрик ${streak} дней — отличная последовательность!`);
  }

  if (include === 'weight' || include === 'all') {
    const bwHistory = await prisma.bodyWeight.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 20,
      select: { weightKg: true, date: true },
    });

    if (bwHistory.length >= 2) {
      const newest = bwHistory[0];
      const oldest = bwHistory[bwHistory.length - 1];
      const delta = newest.weightKg - oldest.weightKg;
      const days = (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / 86400000;
      const weeklyRate = days > 0 ? (delta / days) * 7 : 0;

      sections.push(`\n### Динамика веса`);
      sections.push(`${oldest.weightKg} → ${newest.weightKg} кг (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} кг за ${Math.round(days)} дн)`);
      sections.push(`Темп: ${weeklyRate >= 0 ? '+' : ''}${weeklyRate.toFixed(2)} кг/нед`);
    }
  }

  return sections.join('\n');
}

// ─── Knowledge Search ─────────────────────────────────────────────────────────

// Keyword → module mappings (top-level topics)
const KNOWLEDGE_TOPICS: Array<{ name: string; keywords: string[]; content: () => string }> = [];

// Lazy-load knowledge modules to avoid circular imports at module level
let knowledgeLoaded = false;

async function loadKnowledge(): Promise<void> {
  if (knowledgeLoaded) return;
  knowledgeLoaded = true;

  try {
    const k = await import('../knowledge');

    KNOWLEDGE_TOPICS.push(
      { name: 'Принципы тренировок', keywords: ['тренировка', 'прогрессия', 'объём', 'интенсивность', 'периодизация', 'hypertrophy', 'сила', 'гипертрофия', 'частота', 'deload', 'деload'], content: () => k.TRAINING_PRINCIPLES.slice(0, 3000) },
      { name: 'Питание', keywords: ['питание', 'белок', 'протеин', 'калории', 'углеводы', 'жиры', 'макросы', 'кбжу', 'tdee', 'дефицит', 'профицит'], content: () => k.NUTRITION_KNOWLEDGE.slice(0, 3000) },
      { name: 'Техника упражнений', keywords: ['техника', 'жим', 'приседания', 'тяга', 'форма', 'биомеханика', 'ошибки'], content: () => k.EXERCISE_TECHNIQUE.slice(0, 3000) },
      { name: 'Восстановление', keywords: ['восстановление', 'сон', 'отдых', 'перетренированность', 'fatigue', 'крепатура', 'мышечная боль'], content: () => k.RECOVERY_KNOWLEDGE.slice(0, 3000) },
      { name: 'Добавки', keywords: ['добавки', 'протеин', 'креатин', 'bcaa', 'pre-workout', 'предтрен', 'омега', 'витамин'], content: () => k.SUPPLEMENTS_DETAILED.slice(0, 3000) },
      { name: 'Кардио', keywords: ['кардио', 'бег', 'выносливость', 'hiit', 'аэробика', 'liss', 'интервальный'], content: () => k.CARDIO_KNOWLEDGE.slice(0, 2000) },
      { name: 'Физиология', keywords: ['физиология', 'мышечные волокна', 'гормоны', 'метаболизм', 'адаптация'], content: () => k.SPORTS_PHYSIOLOGY.slice(0, 2000) },
      { name: 'Психология', keywords: ['мотивация', 'психология', 'привычки', 'plateau', 'плато', 'ментальный'], content: () => k.PSYCHOLOGY_HABITS.slice(0, 2000) },
      { name: 'Реабилитация', keywords: ['травма', 'реабилитация', 'боль', 'плечо', 'колено', 'поясница', 'растяжение', 'воспаление'], content: () => k.INJURY_AND_REHAB.slice(0, 2000) },
      { name: 'Похудение и набор', keywords: ['похудение', 'набор массы', 'жиросжигание', 'bulking', 'cutting', 'рекомпозиция'], content: () => k.CUTTING_BULKING.slice(0, 2000) },
      { name: 'Пауэрлифтинг', keywords: ['пауэрлифтинг', 'powerlifting', 'соревнования', '1rm', '1пм', 'максимум'], content: () => k.POWERLIFTING.slice(0, 2000) },
      { name: 'Женский тренинг', keywords: ['женский', 'женщины', 'менструальный', 'беременность', 'пмс'], content: () => k.WOMENS_PROGRAMMING.slice(0, 2000) },
    );
  } catch {
    // knowledge modules unavailable
  }
}

async function searchFitnessKnowledge(query: string): Promise<string> {
  await loadKnowledge();

  if (!query || KNOWLEDGE_TOPICS.length === 0) {
    return 'База знаний недоступна. Используй свои знания для ответа.';
  }

  const q = query.toLowerCase();
  const scored = KNOWLEDGE_TOPICS.map((topic) => ({
    topic,
    score: topic.keywords.filter((kw) => q.includes(kw) || kw.includes(q.split(' ')[0])).length,
  })).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return `По запросу "${query}" ничего не найдено в базе знаний. Отвечай на основе своих знаний.`;
  }

  const top = scored.slice(0, 2);
  const result = top.map((s) => `### ${s.topic.name}\n${s.topic.content()}`).join('\n\n');

  return `## 📚 БАЗА ЗНАНИЙ: "${query}"\n\n${result}`;
}
