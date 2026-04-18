/**
 * Context on Demand — AI-callable tools for fetching user data.
 *
 * These tools let the AI pull exactly what it needs instead of
 * receiving a pre-computed dump on every request.
 *
 * Tools:
 *   get_workout_analysis    — overload, plateau, muscle balance, frequency, est1RM
 *   get_nutrition_analysis  — macros, gaps, meal timing, week trend, TDEE estimate
 *   get_recovery_status     — fatigue score 0-100 with factor breakdown
 *   get_progress_data       — PRs with est1RM, streak, weight trend, milestones
 *   get_exercise_history    — full per-session history for a specific exercise
 *   search_fitness_knowledge — TF-IDF stem search over 25 knowledge modules
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

// ─── Tool Schemas ─────────────────────────────────────────────────────────────

export const CONTEXT_TOOL_DEFINITIONS: DeepSeekTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_workout_analysis',
      description:
        'Детальный анализ тренировок: прогрессивная перегрузка по упражнениям (плато/прогресс/регресс), расчётный 1RM, мышечный баланс, частота, признаки перетренированности. Используй при вопросах о программе, прогрессе, весах.',
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            enum: ['overload', 'balance', 'frequency', 'all'],
            description: 'overload — прогрессивная перегрузка и 1RM; balance — мышечный баланс; frequency — частота и deload; all — всё',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_nutrition_analysis',
      description:
        'Детальный анализ питания: КБЖУ сегодня vs нормы, дефициты продуктов, тайминг относительно тренировок, недельный тренд, оценка реального TDEE из данных веса. Используй для вопросов о диете, КБЖУ, питании.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week'],
            description: 'today — только сегодня; week — добавить недельный тренд и TDEE',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recovery_status',
      description:
        'Оценка восстановления: score 0-100 с разбивкой факторов (тренировочная частота, сон, питание, последовательные дни), рекомендация по интенсивности. Используй при вопросах о самочувствии, усталости, можно ли тренироваться.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_progress_data',
      description:
        'Данные о прогрессе: личные рекорды с расчётным 1RM, стрик, всего тренировок, вехи (10/25/50/100), динамика веса тела с темпом кг/нед. Используй для аналитики, мотивации, отслеживания результатов.',
      parameters: {
        type: 'object',
        properties: {
          include: {
            type: 'string',
            enum: ['prs', 'streak', 'weight', 'all'],
            description: 'prs — рекорды; streak — стрик и вехи; weight — вес тела; all — всё',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_exercise_history',
      description:
        'Полная история конкретного упражнения: все сессии с датой, весом, повторениями и расчётным 1RM. Используй когда пользователь спрашивает про конкретное упражнение ("как растёт мой жим?", "когда последний раз делал становую?").',
      parameters: {
        type: 'object',
        properties: {
          exercise_name: {
            type: 'string',
            description: 'Название упражнения точно как оно звучит в русском (например: "Жим штанги лёжа", "Приседания со штангой")',
          },
        },
        required: ['exercise_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_fitness_knowledge',
      description:
        'Поиск научной информации в базе знаний (25 модулей): тренировочные принципы, техника, питание, добавки, физиология, реабилитация, психология. Используй когда нужна теория или научное обоснование.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос (например: "прогрессивная перегрузка гипертрофия", "техника приседания", "протеин для набора массы")',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

/**
 * Execute a context-fetching tool. Returns null if toolName is not a context tool.
 * All DB errors are caught internally — callers always get a string.
 */
export async function executeContextTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  preload: ContextToolPreload,
): Promise<string | null> {
  const todayDate = preload.todayDate ?? new Date().toISOString().split('T')[0];

  try {
    switch (toolName) {
      case 'get_workout_analysis':
        return await getWorkoutAnalysis(userId, (args.focus as string) ?? 'all');
      case 'get_nutrition_analysis':
        return await getNutritionAnalysis(userId, preload, (args.period as string) ?? 'today');
      case 'get_recovery_status':
        return await getRecoveryStatus(userId, preload, todayDate);
      case 'get_progress_data':
        return await getProgressData(userId, todayDate, (args.include as string) ?? 'all');
      case 'get_exercise_history':
        return await getExerciseHistory(userId, (args.exercise_name as string) ?? '');
      case 'search_fitness_knowledge':
        return await searchFitnessKnowledge((args.query as string) ?? '');
      default:
        return null;
    }
  } catch (err) {
    const readable = toolName.replace(/^get_/, '').replace(/_/g, ' ');
    return `[Данные недоступны: ${readable}. Отвечай на основе имеющегося контекста.]`;
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Epley formula for estimated 1-rep max */
function est1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Format date as DD.MM */
function fmtDate(d: Date | null | undefined): string {
  if (!d) return '?';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

// ─── Tool Implementations ─────────────────────────────────────────────────────

async function getWorkoutAnalysis(userId: string, focus: string): Promise<string> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [exerciseSets, recentWorkouts] = await Promise.all([
    prisma.workoutExercise.findMany({
      where: { workout: { userId, completedAt: { gte: sixMonthsAgo } } },
      select: {
        exercise: { select: { name: true, primaryMuscles: true } },
        workout: { select: { completedAt: true } },
        sets: { where: { completed: true, weight: { gt: 0 }, reps: { gt: 0 } }, select: { weight: true, reps: true } },
      },
      orderBy: { workout: { completedAt: 'desc' } },
      take: 400,
    }),
    prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 12,
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

  // ── Progressive overload + est1RM ──
  if (focus === 'overload' || focus === 'all') {
    const history = new Map<string, Array<{ date: number; maxWeight: number; maxReps: number; e1rm: number }>>();

    for (const we of exerciseSets) {
      if (!we.workout.completedAt || we.sets.length === 0) continue;
      const name = we.exercise?.name;
      if (!name) continue;

      const maxWeight = Math.max(...we.sets.map((s) => s.weight ?? 0));
      const repsAtMax = Math.max(
        ...we.sets.filter((s) => (s.weight ?? 0) >= maxWeight * 0.95).map((s) => s.reps ?? 1),
      );

      if (!history.has(name)) history.set(name, []);
      history.get(name)!.push({
        date: new Date(we.workout.completedAt).getTime(),
        maxWeight,
        maxReps: repsAtMax,
        e1rm: est1RM(maxWeight, repsAtMax),
      });
    }

    const plateaus: string[] = [];
    const regressions: string[] = [];
    const progressions: string[] = [];

    for (const [ex, sessions] of history) {
      if (sessions.length < 3) continue;
      sessions.sort((a, b) => a.date - b.date);
      const last3 = sessions.slice(-3);
      const w = last3.map((s) => s.maxWeight);
      const r = last3.map((s) => s.maxReps);
      const e = last3.map((s) => s.e1rm);

      const weightUp = w[2] > w[1] && w[1] >= w[0];
      const repsUp = Math.max(...w) - Math.min(...w) <= 2.5 && r[2] > r[1];
      const e1rmRegress = e[2] < e[0] - 3;
      const e1rmPlateau = Math.max(...e) - Math.min(...e) <= 3;

      if (weightUp || repsUp) {
        progressions.push(`${ex}: ${w[0]}×${r[0]}→${w[2]}×${r[2]} кг (1RM ~${e[2]})`);
      } else if (e1rmRegress) {
        regressions.push(`${ex}: 1RM упал ${e[0]}→${e[2]} кг ⛔`);
      } else if (e1rmPlateau) {
        plateaus.push(`${ex}: ${w[2]} кг × ${r[2]}, 1RM ~${e[2]} — стоит ⚠️`);
      }
    }

    sections.push('\n### Прогрессивная перегрузка');
    if (progressions.length) sections.push(`✅ Растут: ${progressions.slice(0, 5).join('; ')}`);
    if (plateaus.length) {
      sections.push(`⚠️ Плато (3+ тренировки без роста): ${plateaus.slice(0, 5).join('; ')}`);
      sections.push('→ Выход: +1.25 кг, +1 повтор, смена диапазона, rest-pause, microload, или deload');
    }
    if (regressions.length) {
      sections.push(`⛔ Регресс: ${regressions.join('; ')}`);
      sections.push('→ Причины: перетренированность, дефицит калорий/белка, недосып — разбери с пользователем');
    }
    if (!progressions.length && !plateaus.length && !regressions.length) {
      sections.push('Данных пока недостаточно (нужно 3+ повторения одного упражнения за 6 мес)');
    }
  }

  // ── Muscle balance ──
  if (focus === 'balance' || focus === 'all') {
    const muscleVol: Record<string, number> = {};
    for (const w of recentWorkouts.slice(0, 6)) {
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
      const bottom = sorted.slice(-3).map(([m]) => m);
      const neglected = bottom.filter((m) => !sorted.slice(0, 3).map(([x]) => x).includes(m)).join(', ');
      sections.push('\n### Мышечный баланс (последние 6 тренировок)');
      sections.push(`Доминируют: ${dominant}`);
      if (neglected) sections.push(`⚠️ Слабо нагружены: ${neglected} — добавить акцент`);
    }
  }

  // ── Frequency + deload detection ──
  if (focus === 'frequency' || focus === 'all') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;

    const timestamps = recentWorkouts
      .filter((w) => w.completedAt)
      .slice(0, 6)
      .map((w) => new Date(w.completedAt!).getTime())
      .sort((a, b) => b - a);
    const avgGap = timestamps.length >= 2
      ? timestamps.slice(0, -1).reduce((s, t, i) => s + (t - timestamps[i + 1]) / 86_400_000, 0) / (timestamps.length - 1)
      : null;

    sections.push(`\n### Частота\n${weekCount} тр/нед${avgGap !== null ? ` | Среднее между тренировками: ${avgGap.toFixed(1)} дн` : ''}`);

    if (recentWorkouts.length >= 4) {
      const volumes = recentWorkouts.slice(0, 4).map((w) =>
        w.exercises.reduce((s, ex) => s + ex.sets.reduce((ss, set) => ss + (set.weight ?? 0) * (set.reps ?? 0), 0), 0),
      );
      const volumeTrend = volumes[0] < volumes[2] * 0.8 && volumes[0] < volumes[3] * 0.8;
      if (weekCount >= 6 || volumeTrend) {
        sections.push('⚠️ Признаки перетренированности (высокая частота или падение объёма). Рекомендуй deload неделю (50% объёма и интенсивности)');
      }
    }
  }

  return sections.join('\n');
}

async function getNutritionAnalysis(userId: string, preload: ContextToolPreload, period: string): Promise<string> {
  const sections: string[] = ['## 🍽️ АНАЛИЗ ПИТАНИЯ'];
  const { nutritionTargets, todayMeals = [] } = preload;

  // Today (from preload — zero extra DB cost)
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
      sections.push(`Норма: ${calPct}% ккал, ${protPct}% белок (цель: ${nutritionTargets.calories} ккал, ${nutritionTargets.protein}г)`);

      const hour = new Date().getHours();
      if (hour >= 14 && prot < nutritionTargets.protein * 0.4) {
        sections.push(`🚨 КРИТИЧНО: белок только ${Math.round(prot)}/${nutritionTargets.protein}г — уже ${hour}:00. Обязательно упомяни!`);
      }
      if (hour >= 18 && cal < nutritionTargets.calories * 0.5) {
        sections.push(`⚠️ Калории ${Math.round(cal)}/${nutritionTargets.calories} ккал — вечер, норма ниже 50%.`);
      }
    }

    // Food gaps
    const allItems = todayMeals.flatMap((m) => (m.items ?? []).map((i) => i.name.toLowerCase()));
    if (allItems.length > 0) {
      const gaps: string[] = [];
      if (!allItems.some((n) => /курица|мясо|рыба|говядин|яйц|творог|тунец|лосось|индейк/i.test(n))) gaps.push('нет белковых продуктов');
      if (!allItems.some((n) => /овощ|помидор|огурец|брокколи|шпинат|капуст|морков/i.test(n))) gaps.push('нет овощей');
      if (!allItems.some((n) => /орех|авокадо|лосось|оливк|семена/i.test(n))) gaps.push('нет омега-3');
      if (gaps.length) sections.push(`Пробелы: ${gaps.join(', ')}`);
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
      const byDay: Record<string, { cal: number; prot: number }> = {};
      for (const m of weekMeals) {
        const day = new Date(m.createdAt).toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = { cal: 0, prot: 0 };
        byDay[day].cal += m.totalCalories;
        byDay[day].prot += m.totalProtein;
      }
      const days = Object.values(byDay);
      const avgCal = Math.round(days.reduce((s, d) => s + d.cal, 0) / days.length);
      const avgProt = Math.round(days.reduce((s, d) => s + d.prot, 0) / days.length);

      sections.push(`\n### Неделя (${Object.keys(byDay).length} дней)`);
      sections.push(`Среднее: ${avgCal} ккал/день | ${avgProt}г белка/день`);

      if (nutritionTargets) {
        const calPct = Math.round((avgCal / nutritionTargets.calories) * 100);
        const protPct = Math.round((avgProt / nutritionTargets.protein) * 100);
        sections.push(`Выполнение: ккал ${calPct}%, белок ${protPct}%`);
        if (protPct < 70) sections.push('⚠️ Хронический дефицит белка — это тормозит прогресс');

        // TDEE estimate from weight delta
        const bodyWeights = await prisma.bodyWeight.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: 14,
          select: { weightKg: true, date: true },
        });
        if (bodyWeights.length >= 2) {
          const newest = bodyWeights[0];
          const oldest = bodyWeights[bodyWeights.length - 1];
          const daySpan = (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / 86_400_000;
          const weightDelta = newest.weightKg - oldest.weightKg;
          if (daySpan >= 5) {
            const impliedSurplusPerDay = (weightDelta * 7700) / daySpan;
            const tdee = Math.round(avgCal - impliedSurplusPerDay);
            if (tdee > 1200 && tdee < 6000) {
              sections.push(`Расчётный TDEE на основе данных: ~${tdee} ккал/день`);
            }
          }
        }
      }
    }
  }

  return sections.join('\n');
}

async function getRecoveryStatus(userId: string, preload: ContextToolPreload, todayDate: string): Promise<string> {
  const { nutritionTargets, sleepEntries = [], todayMeals = [] } = preload;

  const recentWorkouts = await prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
    take: 10,
    select: { completedAt: true },
  });

  let score = 100;
  const factors: Array<{ label: string; delta: number }> = [];

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCount = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt) >= weekAgo).length;
  if (weekCount >= 6) { score -= 25; factors.push({ label: `${weekCount} тренировок за неделю`, delta: -25 }); }
  else if (weekCount >= 5) { score -= 10; factors.push({ label: '5 тренировок за неделю', delta: -10 }); }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (recentWorkouts.some((w) => w.completedAt && new Date(w.completedAt) >= yesterday)) {
    score -= 15;
    factors.push({ label: 'Тренировка <24ч назад', delta: -15 });
  }

  // Consecutive training days using client todayDate
  let consecutive = 0;
  const todayUTC = todayDate + 'T00:00:00.000Z';
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().split('T')[0];
    if (recentWorkouts.some((w) => w.completedAt && w.completedAt.toISOString().split('T')[0] === ds)) consecutive++;
    else break;
  }
  if (consecutive >= 4) { score -= 20; factors.push({ label: `${consecutive} дней подряд`, delta: -20 }); }
  else if (consecutive >= 3) { score -= 8; factors.push({ label: `${consecutive} дня подряд`, delta: -8 }); }

  if (nutritionTargets && todayMeals.length > 0) {
    const prot = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
    const cal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
    if (prot < nutritionTargets.protein * 0.6) {
      score -= 10;
      factors.push({ label: `Дефицит белка (${Math.round(prot)}/${nutritionTargets.protein}г)`, delta: -10 });
    }
    if (cal < nutritionTargets.calories * 0.7) {
      score -= 10;
      factors.push({ label: `Дефицит калорий (${Math.round(cal)}/${nutritionTargets.calories})`, delta: -10 });
    }
  }

  if (sleepEntries.length > 0) {
    const recent = sleepEntries.slice(0, 3);
    const avg = recent.reduce((s, e) => s + e.durationHours, 0) / recent.length;
    if (avg < 6) { score -= 20; factors.push({ label: `Мало сна (${avg.toFixed(1)}ч/ночь)`, delta: -20 }); }
    else if (avg < 7) { score -= 10; factors.push({ label: `Сон < нормы (${avg.toFixed(1)}ч)`, delta: -10 }); }
    const withQ = recent.filter((e) => e.quality != null);
    if (withQ.length > 0 && withQ.reduce((s, e) => s + (e.quality ?? 0), 0) / withQ.length <= 2) {
      score -= 8;
      factors.push({ label: 'Плохое качество сна', delta: -8 });
    }
  }

  score = Math.max(0, Math.min(100, score));
  const emoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
  const status = score >= 70 ? 'Хорошее' : score >= 40 ? 'Умеренная усталость' : 'Высокая усталость';

  const lines = [
    `## 🔋 СТАТУС ВОССТАНОВЛЕНИЯ`,
    `${emoji} Score: ${score}/100 — ${status}`,
    `Тренировок за неделю: ${weekCount} | Дней подряд: ${consecutive}`,
  ];

  if (factors.length) {
    lines.push('Факторы:');
    for (const f of factors) lines.push(`  ${f.delta} — ${f.label}`);
  }

  if (score < 40) lines.push('→ РЕКОМЕНДАЦИЯ: активный отдых или лёгкая техническая тренировка. Тяжёлая нагрузка сейчас контрпродуктивна!');
  else if (score < 70) lines.push('→ Снизь интенсивность на 15-20%, приоритет — сон и белок.');
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
        sets: { where: { completed: true, weight: { gt: 0 }, reps: { gt: 0 } }, select: { weight: true, reps: true } },
      },
      orderBy: { workout: { completedAt: 'desc' } },
      take: 1000,
    });

    // Track best set per exercise: highest est1RM
    const prMap = new Map<string, { weight: number; reps: number; e1rm: number }>();
    for (const we of exerciseSets) {
      const name = we.exercise?.name;
      if (!name) continue;
      for (const s of we.sets) {
        const e = est1RM(s.weight ?? 0, s.reps ?? 1);
        const existing = prMap.get(name);
        if (!existing || e > existing.e1rm) {
          prMap.set(name, { weight: s.weight ?? 0, reps: s.reps ?? 0, e1rm: e });
        }
      }
    }

    if (prMap.size > 0) {
      const topPRs = [...prMap.entries()]
        .sort((a, b) => b[1].e1rm - a[1].e1rm)
        .slice(0, 10)
        .map(([ex, { weight, reps, e1rm }]) => `${ex}: ${weight}×${reps} (1RM ~${e1rm} кг)`)
        .join('; ');
      sections.push(`\n### Личные рекорды (по расчётному 1RM)\n${topPRs}`);
    }
  }

  if (include === 'streak' || include === 'all') {
    const workouts = await prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
      take: 500,
    });

    const total = workouts.length;
    const trainingDays = new Set(
      workouts.filter((w) => w.completedAt).map((w) => w.completedAt!.toISOString().split('T')[0]),
    );

    let streak = 0;
    const check = new Date(todayDate + 'T00:00:00.000Z');
    if (!trainingDays.has(check.toISOString().split('T')[0])) check.setUTCDate(check.getUTCDate() - 1);
    while (trainingDays.has(check.toISOString().split('T')[0])) {
      streak++;
      check.setUTCDate(check.getUTCDate() - 1);
    }

    const MILESTONES = [5, 10, 25, 50, 100, 200, 500];
    const reached = MILESTONES.filter((m) => total >= m);
    const next = MILESTONES.find((m) => m > total);

    sections.push(`\n### Стрик и вехи`);
    sections.push(`Текущий стрик: ${streak} дн | Всего тренировок: ${total}`);
    if (reached.length) sections.push(`Достигнуто: ${reached.map((m) => `${m} тр`).join(', ')}`);
    if (next) sections.push(`До ${next} тренировок: ещё ${next - total}`);
    if (streak >= 7) sections.push(`🔥 ${streak}-дневный стрик — отметь это!`);
    if (streak >= 30) sections.push(`🏆 Невероятный стрик ${streak} дней — это топ!`);
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
      const days = (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / 86_400_000;
      const delta = newest.weightKg - oldest.weightKg;
      const weeklyRate = days > 0 ? (delta / days) * 7 : 0;

      sections.push(`\n### Динамика веса`);
      sections.push(`${oldest.weightKg} → ${newest.weightKg} кг (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} кг за ${Math.round(days)} дн)`);
      sections.push(`Темп: ${weeklyRate >= 0 ? '+' : ''}${weeklyRate.toFixed(2)} кг/нед`);
    }
  }

  return sections.join('\n');
}

async function getExerciseHistory(userId: string, exerciseName: string): Promise<string> {
  if (!exerciseName.trim()) {
    return 'Укажи название упражнения (например: "Жим штанги лёжа").';
  }

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // Fuzzy match: search by partial name (case insensitive)
  const records = await prisma.workoutExercise.findMany({
    where: {
      workout: { userId, completedAt: { gte: threeMonthsAgo } },
      exercise: { name: { contains: exerciseName.slice(0, 8), mode: 'insensitive' } },
    },
    select: {
      exercise: { select: { name: true } },
      workout: { select: { completedAt: true, name: true } },
      sets: { where: { completed: true, weight: { gt: 0 }, reps: { gt: 0 } }, select: { weight: true, reps: true } },
    },
    orderBy: { workout: { completedAt: 'asc' } },
    take: 50,
  });

  if (records.length === 0) {
    return `Нет данных по упражнению "${exerciseName}" за последние 3 месяца.`;
  }

  const exerciseActualName = records[0].exercise?.name ?? exerciseName;
  const lines = [`## 📊 ИСТОРИЯ: ${exerciseActualName}`];

  for (const rec of records) {
    if (!rec.workout.completedAt || rec.sets.length === 0) continue;
    const date = fmtDate(rec.workout.completedAt);
    // Best set of the session
    const best = rec.sets.reduce((prev, s) => {
      const e = est1RM(s.weight ?? 0, s.reps ?? 1);
      const pe = est1RM(prev.weight ?? 0, prev.reps ?? 1);
      return e > pe ? s : prev;
    });
    const allSets = rec.sets
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 4)
      .map((s) => `${s.weight}×${s.reps}`)
      .join(', ');
    lines.push(`${date}: ${allSets} (лучший 1RM ~${est1RM(best.weight ?? 0, best.reps ?? 1)} кг)`);
  }

  // Trend summary
  if (records.length >= 2) {
    const firstSets = records[0].sets;
    const lastSets = records[records.length - 1].sets;
    if (firstSets.length && lastSets.length) {
      const firstBest = Math.max(...firstSets.map((s) => est1RM(s.weight ?? 0, s.reps ?? 1)));
      const lastBest = Math.max(...lastSets.map((s) => est1RM(s.weight ?? 0, s.reps ?? 1)));
      const delta = lastBest - firstBest;
      lines.push(`\nТренд за 3 мес: 1RM ${firstBest} → ${lastBest} кг (${delta >= 0 ? '+' : ''}${delta} кг)`);
    }
  }

  return lines.join('\n');
}

// ─── Knowledge Search ─────────────────────────────────────────────────────────

// Topics populated once at startup via loadKnowledge()
const KNOWLEDGE_TOPICS: Array<{ name: string; keywords: string[]; content: () => string }> = [];

// Promise-based lock to prevent double-loading under concurrent requests
let knowledgeLoadPromise: Promise<void> | null = null;

async function loadKnowledge(): Promise<void> {
  if (KNOWLEDGE_TOPICS.length > 0) return; // already loaded
  if (knowledgeLoadPromise) return knowledgeLoadPromise; // in progress

  knowledgeLoadPromise = (async () => {
    try {
      const k = await import('../knowledge');

      KNOWLEDGE_TOPICS.push(
        {
          name: 'Принципы тренировок',
          keywords: ['тренировк', 'прогресс', 'объём', 'интенсивн', 'периодизац', 'hypertrophy', 'сила', 'гипертроф', 'частота', 'deload', 'деload', 'перегрузк', 'прогрессивн', 'суперкомпенс', 'rep range', 'нагрузк'],
          content: () => k.TRAINING_PRINCIPLES.slice(0, 3500),
        },
        {
          name: 'Питание и КБЖУ',
          keywords: ['питан', 'белок', 'протеин', 'калор', 'углевод', 'жир', 'макро', 'кбжу', 'tdee', 'дефицит', 'профицит', 'рацион', 'диет', 'еда', 'кушать', 'бмр', 'bmr'],
          content: () => k.NUTRITION_KNOWLEDGE.slice(0, 3500),
        },
        {
          name: 'Техника упражнений',
          keywords: ['техник', 'жим', 'присед', 'тяг', 'форм', 'биомеханик', 'ошибк', 'выполнен', 'стойк', 'хват', 'амплитуд', 'движени', 'угол', 'разминк'],
          content: () => k.EXERCISE_TECHNIQUE.slice(0, 3500),
        },
        {
          name: 'Восстановление и сон',
          keywords: ['восстановл', 'сон', 'отдых', 'перетренир', 'fatigue', 'крепатур', 'мышечн боль', 'усталост', 'doms', 'актив отдых', 'недосып'],
          content: () => k.RECOVERY_KNOWLEDGE.slice(0, 3000),
        },
        {
          name: 'Добавки и спортпит',
          keywords: ['добавк', 'протеин', 'креатин', 'bcaa', 'pre-workout', 'предтрен', 'омега', 'витамин', 'спортпит', 'supplement', 'л-карнитин', 'кофеин', 'аминокислот'],
          content: () => k.SUPPLEMENTS_DETAILED.slice(0, 3000),
        },
        {
          name: 'Кардио и выносливость',
          keywords: ['кардио', 'бег', 'выносливост', 'hiit', 'аэробик', 'liss', 'интервальн', 'вело', 'плавани', 'пульс', 'зоны', 'дыхани', 'зона пульса'],
          content: () => k.CARDIO_KNOWLEDGE.slice(0, 2500),
        },
        {
          name: 'Спортивная физиология',
          keywords: ['физиолог', 'мышечн волокн', 'гормон', 'метаболизм', 'адаптац', 'тестостерон', 'кортизол', 'миофибрилл', 'саркоплазм', 'иннервац'],
          content: () => k.SPORTS_PHYSIOLOGY.slice(0, 2500),
        },
        {
          name: 'Психология и мотивация',
          keywords: ['мотивац', 'психолог', 'привычк', 'plateau', 'плато', 'ментальн', 'выгорани', 'дисциплин', 'постановк цел', 'лень', 'хочу бросить'],
          content: () => k.PSYCHOLOGY_HABITS.slice(0, 2500),
        },
        {
          name: 'Реабилитация и травмы',
          keywords: ['травм', 'реабилитац', 'боль', 'плеч', 'колен', 'поясниц', 'растяжен', 'воспален', 'prehab', 'прехаб', 'грыж', 'тендинит', 'импинджмент', 'связк'],
          content: () => k.INJURY_AND_REHAB.slice(0, 2500),
        },
        {
          name: 'Похудение и набор массы',
          keywords: ['похуден', 'набор масс', 'жиросжиган', 'bulking', 'cutting', 'рекомпозиц', 'дефицит калор', 'сушк', 'масснабор', 'body recomp'],
          content: () => k.CUTTING_BULKING.slice(0, 2500),
        },
        {
          name: 'Пауэрлифтинг',
          keywords: ['пауэрлифт', 'powerlifting', 'соревнован', '1rm', '1пм', 'максимум', 'экипировк', 'шейко', 'westside', 'одноповторн'],
          content: () => k.POWERLIFTING.slice(0, 2000),
        },
        {
          name: 'Женский тренинг',
          keywords: ['женск', 'женщин', 'менструальн', 'беременн', 'пмс', 'гормональн цикл', 'эстроген', 'менопауз'],
          content: () => k.WOMENS_PROGRAMMING.slice(0, 2000),
        },
        {
          name: 'Гормоны и здоровье',
          keywords: ['гормон', 'тестостерон', 'кортизол', 'инсулин', 'щитовидн', 'ттг', 'холестерин', 'давлени', 'биохими', 'анализ крови', 'маркер здоровья'],
          content: () => k.HORMONES_AND_HEALTH.slice(0, 2000),
        },
        {
          name: 'Гибкость и мобильность',
          keywords: ['растяжк', 'гибкост', 'мобильност', 'стрейч', 'stretch', 'шпагат', 'пенн ролл', 'foam roll', 'миофасциальн', 'ротац', 'диапазон движени'],
          content: () => k.FLEXIBILITY_MOBILITY.slice(0, 2000),
        },
        {
          name: 'Домашние тренировки',
          keywords: ['дом', 'без железа', 'bodyweight', 'вес тела', 'отжиман', 'подтягиван', 'планк', 'без зала', 'минимум инвентар', 'home gym'],
          content: () => k.HOME_BODYWEIGHT.slice(0, 2000),
        },
        {
          name: 'Продвинутые техники',
          keywords: ['дроп-сет', 'суперсет', 'форсированн', 'rest-pause', 'мионевральн', 'advanced', 'plateau busting', 'интенсификац', 'кластерные', 'гигантск сеты'],
          content: () => k.ADVANCED_TECHNIQUES.slice(0, 2000),
        },
        {
          name: 'Специальные популяции',
          keywords: ['диабет', 'сердечнос', 'пожилые', 'дети', 'подростк', 'инвалид', 'артрит', 'остеопороз', 'special populations'],
          content: () => k.SPECIAL_POPULATIONS.slice(0, 2000),
        },
      );
    } catch {
      // Knowledge modules unavailable — AI uses parametric knowledge
    }
  })();

  return knowledgeLoadPromise;
}

/** Stem: first N chars based on word length for morphological matching */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.length <= 5) return word.slice(0, 3);
  if (word.length <= 8) return word.slice(0, 4);
  return word.slice(0, 5);
}

/**
 * Score topic relevance using stem-based multi-word matching.
 * Each matched keyword counts once; longer stems = more specific = higher confidence.
 */
function scoreTopicMatch(keywords: string[], query: string): number {
  const qWords = query.split(/[\s,]+/).filter(Boolean).map((w) => stem(w.toLowerCase()));
  let score = 0;
  for (const kw of keywords) {
    const kwStems = kw.split(/\s+/).map((w) => stem(w));
    for (const qs of qWords) {
      for (const ks of kwStems) {
        if (qs.length >= 3 && ks.length >= 3 && (qs === ks || qs.startsWith(ks) || ks.startsWith(qs))) {
          // Longer match = more weight
          score += Math.min(qs.length, ks.length);
          break;
        }
      }
    }
  }
  return score;
}

async function searchFitnessKnowledge(query: string): Promise<string> {
  await loadKnowledge();

  if (!query.trim() || KNOWLEDGE_TOPICS.length === 0) {
    return 'База знаний недоступна. Отвечай на основе своих знаний.';
  }

  const q = query.toLowerCase();
  const scored = KNOWLEDGE_TOPICS
    .map((topic) => ({ topic, score: scoreTopicMatch(topic.keywords, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return `По запросу "${query}" — отвечай на основе своих знаний.`;
  }

  // Return top 2 most relevant modules
  const top = scored.slice(0, 2);
  const result = top.map((s) => `### ${s.topic.name}\n${s.topic.content()}`).join('\n\n');

  return `## 📚 БАЗА ЗНАНИЙ (${top.map((s) => s.topic.name).join(', ')})\n\n${result}`;
}
