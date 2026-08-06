/**
 * knowledge-topics/training.ts — auto-split from knowledgeHelpers.ts
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
import { INJURY_EXERCISE_BLACKLIST } from './injury';
import { MuscleRecoveryStatus, PeriodizationAdvice } from './recovery';

export const EXERCISE_SUBSTITUTIONS: Record<string, { reason: string; alternatives: string[] }> = {
  'Жим штанги лёжа': {
    reason: 'плечо/грудь',
    alternatives: ['Жим гантелей лёжа', 'Жим в тренажёре', 'Жим с пола', 'Отжимания от пола'],
  },
  'Приседания со штангой': {
    reason: 'колено/поясница',
    alternatives: ['Жим ногами', 'Болгарские сплит-приседания', 'Гоблет-приседания', 'Приседания в Гакк'],
  },
  'Становая тяга': {
    reason: 'поясница',
    alternatives: ['Румынская тяга', 'Тяга трэп-грифа', 'Гиперэкстензия', 'Тяга гантели в наклоне'],
  },
  'Жим штанги стоя': {
    reason: 'плечо/поясница',
    alternatives: ['Жим гантелей сидя', 'Жим в тренажёре сидя', 'Подъём гантелей через стороны'],
  },
  'Тяга штанги в наклоне': {
    reason: 'поясница',
    alternatives: ['Тяга гантели в наклоне', 'Тяга нижнего блока', 'Тяга в тренажёре с упором'],
  },
  'Подтягивания': {
    reason: 'плечо/локоть',
    alternatives: ['Тяга верхнего блока', 'Подтягивания в гравитроне', 'Тяга верхнего блока обратным хватом'],
  },
  'Французский жим': {
    reason: 'локоть',
    alternatives: ['Разгибания на блоке', 'Разгибания с гантелей из-за головы', 'Отжимания на брусьях узким хватом'],
  },
  'Выпады': {
    reason: 'колено',
    alternatives: ['Болгарские сплит-приседания', 'Степ-ап на платформу', 'Жим ногами одной ногой'],
  },
};
export function getWorkoutRecommendation(
  weekPlan: Record<string, any> | undefined,
  recentWorkouts: Array<{ name: string; completedAt: Date | null }>,
  dayOfWeek: number, // 0=Sun ... 6=Sat
  clientDate?: string,
): string {
  // dayOfWeek from JS: 0=Sun, but weekPlan uses 0=Mon...6=Sun
  const planDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const today = weekPlan?.[planDay];

  if (!today) return '';

  // Check if user already trained today — compare against both UTC date and clientDate to handle UTC offsets
  const todayUtcStr = new Date().toISOString().split('T')[0];
  const todayStr = clientDate ?? todayUtcStr;
  const trainedToday = recentWorkouts.some((w) => {
    if (!w.completedAt) return false;
    const wDateStr = w.completedAt.toISOString().split('T')[0];
    // Match if UTC date matches either server UTC date or client local date
    return wDateStr === todayStr || wDateStr === todayUtcStr;
  });

  if (trainedToday) {
    return `\n\n## 📅 ТРЕНИРОВКА ДНЯ\nПо плану сегодня: ${today.emoji || '💪'} ${today.name} — уже выполнена ✅. Отдыхай или сделай лёгкую заминку/кардио.`;
  }

  // Check what was trained yesterday to avoid same muscle groups
  const yesterday = recentWorkouts.find((w) => {
    if (!w.completedAt) return false;
    const d = new Date(w.completedAt);
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    return diff === 1;
  });

  let fatigueTip = '';
  if (yesterday) {
    fatigueTip = ` Вчера: ${yesterday.name} — учитывай усталость этих мышечных групп.`;
  }

  return `\n\n## 📅 ТРЕНИРОВКА ДНЯ\nПо плану сегодня: ${today.emoji || '💪'} **${today.name}**.${fatigueTip} Если пользователь спросит "что делать сегодня" — предложи эту тренировку.`;
}
export interface OverloadStatus {
  exercise: string;
  status: 'progressing' | 'plateau' | 'regressing';
  lastWeights: number[];
  suggestion: string;
}
export function analyzeProgressiveOverload(
  exerciseSets: Array<{
    exercise: { name: string };
    workout: { completedAt: Date | null };
    sets: Array<{ weight: number | null; reps: number | null }>;
  }>
): OverloadStatus[] {
  // Group by exercise, get max weight per workout, sorted by date
  const exerciseHistory = new Map<string, Array<{ date: Date; maxWeight: number; maxReps: number }>>();

  for (const we of exerciseSets) {
    if (!we.workout.completedAt || we.sets.length === 0) continue;
    const name = we.exercise?.name;
    if (!name) continue;
    const maxSet = we.sets.reduce((best, s) =>
      (s.weight || 0) > (best.weight || 0) ? s : best, we.sets[0]);

    if (!exerciseHistory.has(name)) exerciseHistory.set(name, []);
    exerciseHistory.get(name)!.push({
      date: we.workout.completedAt,
      maxWeight: maxSet.weight || 0,
      maxReps: maxSet.reps || 0,
    });
  }

  const results: OverloadStatus[] = [];

  for (const [exercise, history] of exerciseHistory) {
    if (history.length < 3) continue; // need at least 3 data points

    // Sort by date ascending
    history.sort((a, b) => a.date.getTime() - b.date.getTime());
    const last3 = history.slice(-3);
    const weights = last3.map((h) => h.maxWeight);

    let status: 'progressing' | 'plateau' | 'regressing';
    let suggestion: string;

    if (weights[2] > weights[0] && weights[2] > weights[1]) {
      status = 'progressing';
      suggestion = `${exercise}: прогрессия ✅ (${weights.join(' → ')} кг)`;
    } else if (Math.abs(weights[2] - weights[0]) <= 2.5 && Math.abs(weights[1] - weights[0]) <= 2.5) {
      status = 'plateau';
      suggestion = `${exercise}: ПЛАТО ⚠️ (${weights[0]} кг × 3 тренировки). Варианты: +микронагрузка 1.25кг, смена диапазона повторений, пауза-рест, или замена на аналог.`;
    } else if (weights[2] < weights[0]) {
      status = 'regressing';
      suggestion = `${exercise}: РЕГРЕСС ⛔ (${weights.join(' → ')} кг). Возможно: недовосстановление, недоедание, или нужен deload.`;
    } else {
      continue; // mixed, skip
    }

    results.push({ exercise, status, lastWeights: weights, suggestion });
  }

  return results;
}
export function buildOverloadContext(overloadData: OverloadStatus[]): string {
  if (overloadData.length === 0) return '';

  const plateaus = overloadData.filter((o) => o.status === 'plateau');
  const regressions = overloadData.filter((o) => o.status === 'regressing');
  const progressions = overloadData.filter((o) => o.status === 'progressing');

  if (plateaus.length === 0 && regressions.length === 0 && progressions.length === 0) return '';

  const lines: string[] = ['\n## 📊 ПРОГРЕССИВНАЯ ПЕРЕГРУЗКА'];

  if (progressions.length > 0) {
    lines.push(`✅ Прогресс: ${progressions.slice(0, 3).map((p) => p.suggestion).join('; ')}`);
  }
  if (plateaus.length > 0) {
    lines.push(`⚠️ Плато: ${plateaus.map((p) => p.suggestion).join('\n')}`);
    lines.push('→ Если пользователь спрашивает про прогресс — обязательно упомяни плато и предложи решение.');
  }
  if (regressions.length > 0) {
    lines.push(`⛔ Регресс: ${regressions.map((r) => r.suggestion).join('\n')}`);
    lines.push('→ ОБЯЗАТЕЛЬНО обрати внимание на регресс и предложи причины + решения.');
  }

  return lines.join('\n');
}
export const EXERCISE_MUSCLE_MAP: Record<string, string[]> = {
  // Push
  'жим лёжа': ['грудь', 'трицепс', 'плечи-передние'],
  'жим лежа': ['грудь', 'трицепс', 'плечи-передние'],
  'жим штанги': ['грудь', 'трицепс', 'плечи-передние'],
  'жим гантелей': ['грудь', 'трицепс', 'плечи-передние'],
  'жим на наклонной': ['грудь-верх', 'трицепс', 'плечи-передние'],
  'отжимания': ['грудь', 'трицепс'],
  'жим стоя': ['плечи', 'трицепс'],
  'жим сидя': ['плечи', 'трицепс'],
  'армейский жим': ['плечи', 'трицепс'],
  'разведение гантелей': ['грудь'],
  'махи гантелями': ['плечи-средние'],
  'французский жим': ['трицепс'],
  'разгибание на блоке': ['трицепс'],
  // Pull
  'подтягивания': ['спина-широчайшие', 'бицепс'],
  'тяга верхнего блока': ['спина-широчайшие', 'бицепс'],
  'тяга штанги в наклоне': ['спина', 'бицепс'],
  'тяга гантели в наклоне': ['спина', 'бицепс'],
  'тяга нижнего блока': ['спина'],
  'становая тяга': ['спина', 'ягодицы', 'бёдра-задние'],
  'сгибания на бицепс': ['бицепс'],
  'молотки': ['бицепс', 'предплечья'],
  'шраги': ['трапеции'],
  // Legs
  'приседания': ['квадрицепс', 'ягодицы'],
  'приседания со штангой': ['квадрицепс', 'ягодицы', 'кор'],
  'жим ногами': ['квадрицепс', 'ягодицы'],
  'выпады': ['квадрицепс', 'ягодицы'],
  'румынская тяга': ['бёдра-задние', 'ягодицы'],
  'сгибание ног': ['бёдра-задние'],
  'разгибание ног': ['квадрицепс'],
  'подъём на носки': ['икры'],
  'ягодичный мост': ['ягодицы'],
  'гиперэкстензия': ['поясница', 'бёдра-задние'],
  // Core
  'планка': ['кор'],
  'скручивания': ['пресс'],
  'подъём ног': ['пресс-нижний'],
};
export const MUSCLE_GROUPS_PUSH = ['грудь', 'грудь-верх', 'плечи', 'плечи-передние', 'плечи-средние', 'трицепс'];
export const MUSCLE_GROUPS_PULL = ['спина', 'спина-широчайшие', 'бицепс', 'трапеции', 'предплечья'];
export function buildPeriodizationContext(advice: PeriodizationAdvice): string {
  if (!advice.suggestion || advice.currentPhase === 'unknown') return '';

  const phaseLabels: Record<MesocyclePhase, string> = {
    accumulation: 'Накопление (объём↑)',
    intensification: 'Интенсификация (вес↑, объём↓)',
    deload: 'Разгрузка',
    peaking: 'Пиковая',
    unknown: '',
  };

  return `\n## 📈 ПЕРИОДИЗАЦИЯ
Текущая фаза: ${phaseLabels[advice.currentPhase]} (неделя ${advice.weekInPhase})
${advice.suggestion}
→ Учитывай фазу при рекомендациях по программе и нагрузке.`;
}
export interface ExerciseAlternative {
  original: string;
  alternatives: string[];
  reason: string;
}
export const EXERCISE_ALTERNATIVES: Record<string, { alternatives: string[]; muscles: string[] }> = {
  'Жим штанги лёжа': { alternatives: ['Жим гантелей лёжа', 'Жим в тренажёре Смита', 'Отжимания от пола'], muscles: ['chest', 'triceps'] },
  'Приседания со штангой': { alternatives: ['Жим ногами', 'Гоблет-приседания', 'Болгарские сплит-приседания'], muscles: ['quadriceps', 'glutes'] },
  'Становая тяга': { alternatives: ['Румынская тяга', 'Тяга трэп-грифа', 'Гиперэкстензия'], muscles: ['back', 'hamstrings'] },
  'Жим штанги стоя': { alternatives: ['Жим гантелей сидя', 'Жим Арнольда', 'Жим в тренажёре Смита сидя'], muscles: ['shoulders'] },
  'Тяга штанги в наклоне': { alternatives: ['Тяга гантелей в наклоне', 'Тяга нижнего блока', 'Тяга Т-грифа'], muscles: ['back', 'biceps'] },
  'Подтягивания': { alternatives: ['Тяга верхнего блока', 'Подтягивания в гравитроне', 'Тяга гантели одной рукой'], muscles: ['back', 'biceps'] },
  'Французский жим': { alternatives: ['Разгибания рук на блоке', 'Отжимания на брусьях', 'Жим узким хватом'], muscles: ['triceps'] },
  'Подъём штанги на бицепс': { alternatives: ['Подъём гантелей на бицепс', 'Молоток', 'Сгибания на блоке'], muscles: ['biceps'] },
  'Разведение гантелей': { alternatives: ['Сведения в тренажёре Пек-Дек', 'Кроссовер', 'Разведения на наклонной скамье'], muscles: ['chest'] },
  'Выпады': { alternatives: ['Болгарские сплит-приседания', 'Шаги на платформу', 'Жим одной ногой'], muscles: ['quadriceps', 'glutes'] },
};
export function getExerciseAlternatives(
  programExercises: string[],
  injuryZones: string[],
): ExerciseAlternative[] {
  const result: ExerciseAlternative[] = [];

  // Find exercises that conflict with injuries
  for (const zone of injuryZones) {
    const blacklisted = INJURY_EXERCISE_BLACKLIST[zone] || [];
    for (const exercise of programExercises) {
      if (blacklisted.includes(exercise)) {
        const alts = EXERCISE_ALTERNATIVES[exercise];
        if (alts) {
          // Filter out alternatives that are also blacklisted
          const safeAlts = alts.alternatives.filter((a) =>
            !blacklisted.includes(a) && !injuryZones.some((z) => (INJURY_EXERCISE_BLACKLIST[z] || []).includes(a))
          );
          if (safeAlts.length > 0) {
            result.push({
              original: exercise,
              alternatives: safeAlts,
              reason: `⚠️ Может усугубить проблему с ${zone === 'shoulder' ? 'плечом' : zone === 'knee' ? 'коленом' : zone === 'lower_back' ? 'поясницей' : zone === 'wrist' ? 'запястьем' : zone === 'elbow' ? 'локтем' : zone}`,
            });
          }
        }
      }
    }
  }

  return result;
}
export function buildExerciseAlternativesContext(alternatives: ExerciseAlternative[]): string {
  if (alternatives.length === 0) return '';

  const lines = alternatives.slice(0, 3).map((a) =>
    `- **${a.original}** → ${a.alternatives.join(' / ')} (${a.reason})`
  );

  return `\n\n## 🔄 РЕКОМЕНДУЕМЫЕ ЗАМЕНЫ УПРАЖНЕНИЙ
${lines.join('\n')}
→ Предлагай замены при обсуждении тренировок. Всегда объясняй почему.`;
}
export function analyzeTrainingFrequency(
  workouts: Array<{ completedAt: Date | null; name: string }>,
  recoveryScore: number,
  userGoal: string | null,
): string {
  if (workouts.length < 4) return '';

  const completed = workouts.filter((w) => w.completedAt).sort(
    (a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime()
  );

  if (completed.length < 3) return '';

  // Calculate average gap between workouts (in days)
  const gaps: number[] = [];
  for (let i = 1; i < completed.length; i++) {
    const gap = (new Date(completed[i].completedAt!).getTime() - new Date(completed[i - 1].completedAt!).getTime()) / (24 * 60 * 60 * 1000);
    gaps.push(gap);
  }

  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const currentFrequency = Math.round(7 / avgGap * 10) / 10; // workouts per week

  let suggestedFrequency: number;
  let suggestion: string;

  if (userGoal === 'STRENGTH') {
    suggestedFrequency = recoveryScore >= 70 ? 4 : 3;
    suggestion = recoveryScore >= 70
      ? `Восстановление хорошее (${recoveryScore}%) — 4 тренировки/нед оптимально для силы.`
      : `Восстановление ${recoveryScore}% — 3 тренировки/нед безопаснее для силовых занятий.`;
  } else if (userGoal === 'MUSCLE_GAIN') {
    suggestedFrequency = recoveryScore >= 60 ? 5 : 4;
    suggestion = recoveryScore >= 60
      ? `Для гипертрофии 5 тренировок/нед даст больше стимула.`
      : `Восстановление ${recoveryScore}% — 4 тренировки/нед для баланса роста и отдыха.`;
  } else if (userGoal === 'WEIGHT_LOSS') {
    suggestedFrequency = recoveryScore >= 50 ? 5 : 4;
    suggestion = `Для жиросжигания ${suggestedFrequency} тренировок/нед + повседневная активность.`;
  } else {
    suggestedFrequency = recoveryScore >= 65 ? 4 : 3;
    suggestion = `Оптимально ${suggestedFrequency} тренировок/нед при текущем восстановлении (${recoveryScore}%).`;
  }

  const freqDiff = Math.abs(currentFrequency - suggestedFrequency);
  if (freqDiff < 0.5) return ''; // Already optimal, no need to suggest

  return `\n\n## 📅 ЧАСТОТА ТРЕНИРОВОК
Текущая: ${currentFrequency} тренировок/нед | Рекомендуемая: ${suggestedFrequency}/нед
${suggestion}
${currentFrequency > suggestedFrequency + 0.5 ? '→ Больше отдыха — лучше прогресс. Качество > количество.' : ''}
${currentFrequency < suggestedFrequency - 0.5 ? '→ Можно добавить тренировку — восстановление позволяет.' : ''}`;
}
export function findSimilarWorkouts(
  historyWorkouts: Array<{ name: string; exercises: Array<{ exercise: { name: string; primaryMuscles: string[] } }>; completedAt: Date | null; totalVolume: number | null }>,
  targetMuscles?: string[],
): string {
  if (historyWorkouts.length < 2) return '';

  // Group workouts by primary muscle focus
  const workoutsByFocus = new Map<string, typeof historyWorkouts>();
  for (const w of historyWorkouts) {
    const muscles = w.exercises.flatMap((e) => e.exercise?.primaryMuscles ?? []);
    const primary = muscles.sort((a, b) =>
      muscles.filter((m) => m === b).length - muscles.filter((m) => m === a).length
    )[0];
    if (primary) {
      if (!workoutsByFocus.has(primary)) workoutsByFocus.set(primary, []);
      workoutsByFocus.get(primary)!.push(w);
    }
  }

  // Build template summary — most productive workouts per muscle group
  const templates: string[] = [];
  for (const [muscle, workouts] of workoutsByFocus) {
    const best = workouts
      .filter((w) => w.totalVolume && w.totalVolume > 0)
      .sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0))[0];
    if (best) {
      const exercises = best.exercises.slice(0, 4).map((e) => e.exercise?.name).filter(Boolean).join(', ');
      templates.push(`${muscle}: "${best.name}" (${exercises}) — ${best.totalVolume} кг объём`);
    }
  }

  if (templates.length === 0) return '';

  // Когда спрашивают про конкретные мышцы, пять лучших тренировок вообще —
  // не ответ. targetMuscles приходил сюда и не использовался, так что на
  // вопрос про спину прилетал список, где спины могло не быть совсем.
  const focused = !targetMuscles?.length
    ? templates
    : templates.filter((t) => targetMuscles.some((m) => t.toLowerCase().includes(m.toLowerCase())));
  const list = focused.length > 0 ? focused : templates;
  const note = targetMuscles?.length && focused.length === 0
    ? `\n(Тренировок именно на ${targetMuscles.join(', ')} в истории нет — ниже общий список.)`
    : '';

  return `\n\n## 📋 ЛУЧШИЕ ТРЕНИРОВКИ ИЗ ИСТОРИИ${note}
${list.slice(0, 5).join('\n')}
→ Используй как референс при составлении новых тренировок или когда пользователь просит идеи.`;
}
export interface PlateauStrategy {
  exerciseName: string;
  strategy: string;
  explanation: string;
}
export function getPlateauBreakers(
  overloadData: OverloadStatus[],
): PlateauStrategy[] {
  const plateaus = overloadData.filter((o) => o.status === 'plateau' || o.status === 'regressing');
  if (plateaus.length === 0) return [];

  const strategies: PlateauStrategy[] = [];

  for (const p of plateaus.slice(0, 3)) {
    const strats: Array<{ strategy: string; explanation: string }> = [];
    const lastWeight = p.lastWeights.length > 0 ? p.lastWeights[p.lastWeights.length - 1] : 0;

    if (lastWeight === 0) continue;

    // Strategy 1: Vary rep range
    strats.push({
      strategy: `Переключись на другой диапазон повторений с весом ${Math.round(lastWeight * 0.8)} кг на 2-3 недели`,
      explanation: 'Смена диапазона повторений создаёт новый стимул для адаптации.',
    });

    // Strategy 2: Pause reps
    strats.push({
      strategy: `Добавь паузу 2 сек в нижней точке: ${Math.round(lastWeight * 0.85)} кг × 3-4 подхода`,
      explanation: 'Паузы убирают инерцию и увеличивают время под нагрузкой.',
    });

    // Strategy 3: Volume manipulation
    if (p.status === 'regressing') {
      strats.push({
        strategy: `Снизь объём на 40% на 1 неделю (deload), затем вернись к ${lastWeight} кг`,
        explanation: 'Регресс часто вызван накопленной усталостью. Суперкомпенсация после deload.',
      });
    } else {
      strats.push({
        strategy: `Добавь 1 дополнительный подход к ${p.exercise} на 2 недели`,
        explanation: 'Кратковременное повышение объёма может преодолеть адаптационное плато.',
      });
    }

    // Pick best 2 strategies
    const selected = strats.slice(0, 2);
    for (const s of selected) {
      strategies.push({ exerciseName: p.exercise, ...s });
    }
  }

  return strategies;
}
export function buildPlateauContext(strategies: PlateauStrategy[]): string {
  if (strategies.length === 0) return '';

  const grouped = new Map<string, PlateauStrategy[]>();
  for (const s of strategies) {
    if (!grouped.has(s.exerciseName)) grouped.set(s.exerciseName, []);
    grouped.get(s.exerciseName)!.push(s);
  }

  const lines: string[] = [];
  for (const [exercise, strats] of grouped) {
    lines.push(`**${exercise}** (плато):`);
    for (const s of strats) {
      lines.push(`  → ${s.strategy} — ${s.explanation}`);
    }
  }

  return `\n\n## 🧱 СТРАТЕГИИ ПРЕОДОЛЕНИЯ ПЛАТО
${lines.join('\n')}
→ Предлагай эти стратегии когда пользователь жалуется на застой или спрашивает как прогрессировать.`;
}
export function buildProgressionPlan(
  overloadData: OverloadStatus[],
  userGoal: string | null,
): string {
  const progressing = overloadData.filter((o) => o.status === 'progressing' || o.status === 'plateau');
  if (progressing.length === 0) return '';

  const plans: string[] = [];

  for (const ex of progressing.slice(0, 3)) {
    let plan: string;
    const lastWeight = ex.lastWeights.length > 0 ? ex.lastWeights[ex.lastWeights.length - 1] : 0;
    if (lastWeight === 0) continue;

    if (userGoal === 'STRENGTH') {
      const w1 = lastWeight;
      const w2 = w1 + 2.5;
      const w3 = w2 + 2.5;
      const w4 = Math.round(w1 * 0.6 / 2.5) * 2.5;
      plan = `${ex.exercise}: нед1 ${w1}кг×5×4 → нед2 ${w2}кг×4×4 → нед3 ${w3}кг×3×4 → нед4 ${w4}кг×8×3 (deload)`;
    } else if (userGoal === 'MUSCLE_GAIN') {
      const nextWeight = lastWeight + 2.5;
      plan = `${ex.exercise}: нед1-2 ${lastWeight}кг×10-12×4 (больше повторов) → нед3-4 ${nextWeight}кг×8×4 (больше вес)`;
    } else {
      plan = `${ex.exercise}: +2.5 кг каждые 1-2 недели при выполнении всех подходов`;
    }

    plans.push(plan);
  }

  return `\n\n## 📐 ПЛАН ПРОГРЕССИИ (ближайшие 4 недели)
${plans.join('\n')}
→ Предлагай этот план когда пользователь спрашивает про прогресс или веса.`;
}
export const WARMUP_TEMPLATES: Record<string, string[]> = {
  chest: ['Круговые вращения руками (20 раз)', 'Отжимания от стены (10 раз)', 'Пуловер с лёгкой гантелей (12 раз)', 'Жим пустым грифом (15 раз)'],
  back: ['Вис на перекладине (15 сек)', 'Круговые вращения плечами (15 раз)', 'Тяга резинки к лицу (15 раз)', 'Гиперэкстензия без веса (12 раз)'],
  shoulders: ['Круговые вращения руками (20 раз)', 'Y-W-T подъёмы лёжа (10 каждый)', 'Вращения с резинкой (15 раз)', 'Жим гантелей 2-3 кг (12 раз)'],
  quadriceps: ['Ходьба на месте (60 сек)', 'Воздушные приседания (15 раз)', 'Выпады без веса (10 на каждую)', 'Разгибания ног без веса (15 раз)'],
  hamstrings: ['Наклоны вперёд (10 раз)', 'Румынская тяга без веса (12 раз)', 'Махи ногой назад (10 раз)', 'Ходьба на месте с высоким подъёмом колена (30 сек)'],
  glutes: ['Ягодичный мостик (15 раз)', 'Отведение бедра стоя (12 раз)', 'Приседания в стиле сумо без веса (12 раз)'],
  biceps: ['Сгибания рук без веса (20 раз)', 'Вращения запястий (15 раз)', 'Сгибания с лёгкой гантелей (12 раз)'],
  triceps: ['Разгибания рук над головой без веса (15 раз)', 'Отжимания от скамьи (10 раз)', 'Вращения в локтевых суставах (15 раз)'],
};
export function generateWarmup(primaryMuscles: string[]): string {
  if (primaryMuscles.length === 0) return '';

  const warmupExercises: string[] = [
    '🏃 Общая разминка: 5 мин лёгкого кардио (ходьба, велотренажёр, скакалка)',
  ];

  const usedMuscles = new Set<string>();
  for (const muscle of primaryMuscles) {
    const normalized = muscle.toLowerCase();
    for (const [key, exercises] of Object.entries(WARMUP_TEMPLATES)) {
      if (normalized.includes(key) && !usedMuscles.has(key)) {
        usedMuscles.add(key);
        warmupExercises.push(`🎯 ${key}: ${exercises.slice(0, 2).join(', ')}`);
      }
    }
  }

  if (warmupExercises.length <= 1) return '';

  return `\n\n## 🔥 РЕКОМЕНДУЕМАЯ РАЗМИНКА
${warmupExercises.join('\n')}
→ Предлагай разминку когда пользователь начинает тренировку или спрашивает о ней.`;
}
export function buildWorkoutComparison(
  thisWeekVolume: number,
  prevWeekVolume: number,
  thisWeekCount: number,
  prevWeekCount: number,
  thisWeekDuration: number,
  prevWeekDuration: number,
): string {
  if (thisWeekVolume === 0 && prevWeekVolume === 0) return '';
  if (prevWeekVolume === 0) return ''; // nothing to compare

  const volumeDelta = thisWeekVolume - prevWeekVolume;
  const volumePct = Math.round((volumeDelta / prevWeekVolume) * 100);
  const countDelta = thisWeekCount - prevWeekCount;
  const durationDelta = thisWeekDuration - prevWeekDuration;

  const lines: string[] = [];
  lines.push(`Объём: ${Math.round(thisWeekVolume)} кг ${volumeDelta >= 0 ? '📈' : '📉'} (${volumeDelta >= 0 ? '+' : ''}${volumePct}%)`);
  lines.push(`Тренировок: ${thisWeekCount} ${countDelta > 0 ? `(+${countDelta})` : countDelta < 0 ? `(${countDelta})` : '(=)'}`);
  if (thisWeekDuration > 0 && prevWeekDuration > 0) {
    lines.push(`Длительность: ${thisWeekDuration} мин ${durationDelta > 0 ? `(+${durationDelta})` : durationDelta < 0 ? `(${durationDelta})` : '(=)'}`);
  }

  let verdict = '';
  if (volumePct > 10 && thisWeekCount >= prevWeekCount) verdict = '✅ Прогресс! Объём растёт — хорошая динамика.';
  else if (volumePct < -15) verdict = '⚠️ Объём упал. Это может быть деload (хорошо) или потеря мотивации (плохо).';
  else if (volumePct >= -5 && volumePct <= 5) verdict = '➡️ Стабильно. Для прогресса увеличивай объём на 5-10% в неделю.';

  return `\n\n## 📊 СРАВНЕНИЕ С ПРОШЛОЙ НЕДЕЛЕЙ
${lines.join('\n')}
${verdict}`;
}
export const TECHNIQUE_CUES: Record<string, { mistakes: string[]; cues: string[] }> = {
  'жим лёжа': {
    mistakes: ['Отрыв таза от скамьи', 'Слишком широкий хват', 'Локти 90° — перегрузка плеча', 'Дожим не до конца'],
    cues: ['Сведи лопатки и вдави в скамью', 'Локти ~75° к корпусу', 'Опускай на нижнюю часть груди', 'Упирайся ногами в пол'],
  },
  'приседания': {
    mistakes: ['Колени заваливаются внутрь', 'Округление поясницы', 'Недостаточная глубина', 'Перенос веса на носки'],
    cues: ['Раздвигай пол ногами', 'Грудь вверх, взгляд вперёд', 'Опускайся до параллели или ниже', 'Вес на середину стопы'],
  },
  'становая тяга': {
    mistakes: ['Округление спины', 'Штанга далеко от тела', 'Дёргание руками', 'Переразгибание в верхней точке'],
    cues: ['Напряги широчайшие — «убери штангу в карманы»', 'Штанга скользит по голеням', 'Руки как верёвки, тяни ногами', 'Встань прямо, без отклона назад'],
  },
  'подтягивания': {
    mistakes: ['Раскачивание корпуса', 'Неполная амплитуда', 'Чрезмерный кип', 'Шея вытягивается к перекладине'],
    cues: ['Напряги пресс, ноги слегка вперёд', 'Подбородок выше перекладины', 'Лопатки вниз перед подъёмом', 'Тяни локти к бёдрам'],
  },
  'жим стоя': {
    mistakes: ['Чрезмерный прогиб поясницы', 'Широкий хват', 'Штанга уходит вперёд', 'Нет фиксации в верхней точке'],
    cues: ['Напряги ягодицы и пресс', 'Хват чуть шире плеч', 'Штанга над серединой стопы', 'Полностью выпрями руки вверху'],
  },
  'тяга штанги в наклоне': {
    mistakes: ['Слишком вертикальный корпус', 'Рывки и читинг', 'Округление верха спины', 'Локти расходятся в стороны'],
    cues: ['Наклон ~45°, спина прямая', 'Контролируй негативную фазу', 'Сведи лопатки в верхней точке', 'Тяни к нижней части живота'],
  },
  'выпады': {
    mistakes: ['Колено выходит за носок', 'Узкая стойка — потеря баланса', 'Наклон корпуса вперёд', 'Неравномерная нагрузка на ноги'],
    cues: ['Шаг достаточно широкий', 'Корпус вертикально', 'Опускайся до 90° в обоих коленях', 'Вставай через пятку передней ноги'],
  },
  'отжимания на брусьях': {
    mistakes: ['Слишком глубокое опускание', 'Локти расходятся в стороны', 'Раскачивание', 'Сутулость в верхней точке'],
    cues: ['Опускайся до 90° в локтях', 'Локти направлены назад', 'Скрести ноги, напряги пресс', 'Полностью выпрямляй руки вверху'],
  },
};
export function getTechniqueCues(exerciseNames: string[]): string {
  if (exerciseNames.length === 0) return '';

  const cues: string[] = [];
  for (const name of exerciseNames) {
    const normalized = name.toLowerCase();
    for (const [exercise, data] of Object.entries(TECHNIQUE_CUES)) {
      if (normalized.includes(exercise) || exercise.includes(normalized)) {
        cues.push(`**${exercise}**: ❌ ${data.mistakes[0]} → ✅ ${data.cues[0]}`);
        if (cues.length >= 3) break;
      }
    }
    if (cues.length >= 3) break;
  }

  if (cues.length === 0) return '';

  return `\n\n## 🎯 ТЕХНИКА — ЧАСТЫЕ ОШИБКИ
${cues.join('\n')}
→ Упоминай при обсуждении техники или когда пользователь делает эти упражнения.`;
}
export function analyzeWorkoutRatings(
  recentWorkouts: Array<{
    name: string;
    rating?: number | null;
    totalVolume: number | null;
    durationMinutes: number | null;
    exercises: Array<{ exercise: { name: string; primaryMuscles: string[] } }>;
  }>,
): string {
  const ratedWorkouts = recentWorkouts.filter((w) => w.rating && w.rating > 0);
  if (ratedWorkouts.length < 2) return '';

  const avgRating = ratedWorkouts.reduce((sum, w) => sum + (w.rating || 0), 0) / ratedWorkouts.length;

  // Find best and worst rated workouts
  const sorted = [...ratedWorkouts].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  const lines: string[] = [];
  lines.push(`Средняя оценка тренировок: ${avgRating.toFixed(1)}/5`);

  if (best && best.rating && best.rating >= 4) {
    const muscles = best.exercises.flatMap((e) => e.exercise?.primaryMuscles ?? []);
    const uniqueMuscles = [...new Set(muscles)].slice(0, 3);
    lines.push(`👍 Лучшая: "${best.name}" (${best.rating}/5) — ${uniqueMuscles.join(', ')}`);
  }

  if (worst && worst.rating && worst.rating <= 2) {
    lines.push(`👎 Худшая: "${worst.name}" (${worst.rating}/5) — возможно стоит пересмотреть`);
  }

  // Detect trend
  if (ratedWorkouts.length >= 4) {
    const recentAvg = ratedWorkouts.slice(0, 2).reduce((s, w) => s + (w.rating || 0), 0) / 2;
    const olderAvg = ratedWorkouts.slice(-2).reduce((s, w) => s + (w.rating || 0), 0) / 2;
    if (recentAvg - olderAvg >= 0.5) {
      lines.push('📈 Оценки растут — тренировки нравятся всё больше!');
    } else if (olderAvg - recentAvg >= 0.5) {
      lines.push('📉 Оценки падают — стоит обсудить что не нравится и скорректировать программу');
    }
  }

  return `\n\n## ⭐ ОБРАТНАЯ СВЯЗЬ ПО ТРЕНИРОВКАМ
${lines.join('\n')}
→ Используй для адаптации рекомендаций. Больше тренировок, похожих на лучшие. Меньше — на худшие.`;
}
export function scoreExerciseVariety(
  recentWorkouts: Array<{
    exercises: Array<{ exercise: { name: string; type: string } }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Count exercise frequency across recent workouts
  const exerciseCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  let totalExercises = 0;

  for (const w of recentWorkouts) {
    for (const e of w.exercises) {
      if (e.exercise) {
        exerciseCounts[e.exercise.name] = (exerciseCounts[e.exercise.name] || 0) + 1;
        typeCounts[e.exercise.type ?? 'other'] = (typeCounts[e.exercise.type ?? 'other'] || 0) + 1;
      }
      totalExercises++;
    }
  }

  const uniqueExercises = Object.keys(exerciseCounts).length;
  const varietyRatio = uniqueExercises / Math.max(totalExercises, 1);

  // Find overused exercises (>60% of workouts)
  const threshold = recentWorkouts.length * 0.6;
  const overused = Object.entries(exerciseCounts)
    .filter(([, count]) => count >= threshold)
    .map(([name]) => name);

  // Find missing equipment types
  const allTypes = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];
  const missingTypes = allTypes.filter((t) => !typeCounts[t]);

  const lines: string[] = [];

  if (varietyRatio < 0.3) {
    lines.push(`⚠️ Низкое разнообразие упражнений (${uniqueExercises} уникальных из ${totalExercises} всего)`);
  }

  if (overused.length > 0) {
    lines.push(`🔁 Частые упражнения: ${overused.slice(0, 3).join(', ')} — рассмотри замены для новых стимулов`);
  }

  if (missingTypes.length > 0 && missingTypes.length <= 3) {
    const typeNames: Record<string, string> = {
      barbell: 'штанга', dumbbell: 'гантели', machine: 'тренажёры', cable: 'кроссовер', bodyweight: 'собственный вес',
    };
    lines.push(`💡 Не используешь: ${missingTypes.map((t) => typeNames[t] || t).join(', ')} — добавь для баланса`);
  }

  if (lines.length === 0) return '';

  return `\n\n## 🎲 РАЗНООБРАЗИЕ ТРЕНИРОВОК
${lines.join('\n')}
→ Разнообразие стимулов важно для прогресса. Предлагай новые упражнения и снаряды.`;
}
export function analyzeTrainingTimePerformance(
  workouts: Array<{
    completedAt: Date | null;
    totalVolume: number | null;
    durationMinutes: number | null;
  }>,
): string {
  const withTime = workouts
    .filter((w) => w.completedAt && w.totalVolume && w.totalVolume > 0)
    .map((w) => ({
      hour: new Date(w.completedAt!).getHours(),
      volume: w.totalVolume!,
      duration: w.durationMinutes || 0,
    }));

  if (withTime.length < 5) return '';

  // Group by time slots
  const slots: Record<string, { volumes: number[]; count: number }> = {
    'утро (6-11)': { volumes: [], count: 0 },
    'день (11-16)': { volumes: [], count: 0 },
    'вечер (16-21)': { volumes: [], count: 0 },
    'ночь (21-6)': { volumes: [], count: 0 },
  };

  for (const w of withTime) {
    let slot: string;
    if (w.hour >= 6 && w.hour < 11) slot = 'утро (6-11)';
    else if (w.hour >= 11 && w.hour < 16) slot = 'день (11-16)';
    else if (w.hour >= 16 && w.hour < 21) slot = 'вечер (16-21)';
    else slot = 'ночь (21-6)';

    slots[slot].volumes.push(w.volume);
    slots[slot].count++;
  }

  // Find slot with highest average volume
  let bestSlot = '';
  let bestAvg = 0;
  let preferredSlot = '';
  let maxCount = 0;

  for (const [slot, data] of Object.entries(slots)) {
    if (data.count === 0) continue;
    const avg = data.volumes.reduce((a, b) => a + b, 0) / data.volumes.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestSlot = slot;
    }
    if (data.count > maxCount) {
      maxCount = data.count;
      preferredSlot = slot;
    }
  }

  if (!bestSlot) return '';

  const lines: string[] = [];
  lines.push(`🏆 Лучшие результаты: ${bestSlot} (ср. объём ${Math.round(bestAvg)} кг)`);

  if (preferredSlot !== bestSlot && maxCount > 2) {
    lines.push(`📅 Обычно тренируется: ${preferredSlot} (${maxCount} раз)`);
    lines.push(`💡 Попробуй перенести тренировки на ${bestSlot} — объём там выше`);
  }

  return `\n\n## ⏰ ВРЕМЯ ТРЕНИРОВОК
${lines.join('\n')}
→ Учитывай при планировании расписания.`;
}
export function optimizeWorkoutDuration(
  recentWorkouts: Array<{
    durationMinutes: number | null;
    totalVolume: number | null;
    exercises: Array<{ sets: Array<{ completed: boolean }> }>;
  }>,
  userGoal: string | null,
): string {
  const completed = recentWorkouts.filter((w) => w.durationMinutes && w.durationMinutes > 0);
  if (completed.length < 3) return '';

  const avgDuration = completed.reduce((s, w) => s + (w.durationMinutes || 0), 0) / completed.length;
  const avgVolume = completed.reduce((s, w) => s + (w.totalVolume || 0), 0) / completed.length;

  // Volume per minute (efficiency metric)
  const efficiency = avgVolume / Math.max(avgDuration, 1);

  const suggestions: string[] = [];

  // Too long workouts
  if (avgDuration > 90 && userGoal !== 'STRENGTH') {
    suggestions.push(`⏱️ Средняя тренировка: ${Math.round(avgDuration)} мин — можно оптимизировать до 60-75 мин`);
    suggestions.push('💡 Совет: суперсеты антагонистов (грудь+спина), сокращение отдыха между лёгкими подходами');
  }

  // Low efficiency (low volume for time spent)
  if (efficiency < 50 && avgDuration > 45) {
    suggestions.push('📉 Низкая плотность тренировки — много времени, мало объёма');
    suggestions.push('💡 Совет: меньше пауз между подходами, убери лишние упражнения, фокус на базовые');
  }

  // Very short workouts
  if (avgDuration < 30 && userGoal !== 'WEIGHT_LOSS') {
    suggestions.push(`⚡ Средняя тренировка всего ${Math.round(avgDuration)} мин — возможно недостаточно объёма для прогресса`);
  }

  // Increasing duration trend
  if (completed.length >= 4) {
    const recent2 = completed.slice(0, 2).reduce((s, w) => s + (w.durationMinutes || 0), 0) / 2;
    const older2 = completed.slice(-2).reduce((s, w) => s + (w.durationMinutes || 0), 0) / 2;
    if (recent2 > older2 * 1.3) {
      suggestions.push('📈 Длительность тренировок растёт — убедись что это оправданный объём, а не затянутый отдых');
    }
  }

  if (suggestions.length === 0) return '';

  return `\n\n## ⚡ ЭФФЕКТИВНОСТЬ ТРЕНИРОВОК
${suggestions.join('\n')}
→ Помоги оптимизировать время в зале без потери качества.`;
}
export function calculateWorkoutDensity(
  recentWorkouts: Array<{
    name: string;
    totalVolume: number | null;
    durationMinutes: number | null;
  }>,
): string {
  const valid = recentWorkouts
    .filter((w) => w.totalVolume && w.totalVolume > 0 && w.durationMinutes && w.durationMinutes > 0)
    .map((w) => ({
      name: w.name,
      density: (w.totalVolume || 0) / (w.durationMinutes || 1),
      volume: w.totalVolume || 0,
      duration: w.durationMinutes || 0,
    }));

  if (valid.length < 2) return '';

  const avgDensity = valid.reduce((s, w) => s + w.density, 0) / valid.length;
  const best = valid.reduce((a, b) => (a.density > b.density ? a : b));
  const worst = valid.reduce((a, b) => (a.density < b.density ? a : b));

  // Trend
  let trend = '';
  if (valid.length >= 4) {
    const recent = valid.slice(0, 2).reduce((s, w) => s + w.density, 0) / 2;
    const older = valid.slice(-2).reduce((s, w) => s + w.density, 0) / 2;
    if (recent > older * 1.1) trend = '📈 Плотность растёт — ты работаешь эффективнее!';
    else if (recent < older * 0.85) trend = '📉 Плотность падает — больше пауз или легче веса.';
  }

  return `\n\n## 📐 ПЛОТНОСТЬ ТРЕНИРОВОК
Средняя: ${Math.round(avgDensity)} кг/мин
Лучшая: "${best.name}" (${Math.round(best.density)} кг/мин)
${worst.name !== best.name ? `Слабая: "${worst.name}" (${Math.round(worst.density)} кг/мин)` : ''}
${trend}
→ Чем выше плотность (при сохранении техники) — тем эффективнее тренировка.`;
}
export function recommendSplit(
  daysPerWeek: number,
  userGoal: string | null,
  trainingAge: number,
  muscleRecovery: MuscleRecoveryStatus[],
): string {
  if (daysPerWeek <= 0) return '';

  interface SplitOption { name: string; description: string; schedule: string }
  const recommendations: SplitOption[] = [];

  if (daysPerWeek <= 2) {
    recommendations.push({
      name: 'Full Body',
      description: '2 тренировки всё тело — оптимально при низкой частоте',
      schedule: 'Пн: Full Body A, Чт: Full Body B',
    });
  } else if (daysPerWeek === 3) {
    if (trainingAge < 2) {
      recommendations.push({
        name: 'Full Body 3x',
        description: 'Новичкам лучше полное тело 3 раза — больше практики базовых движений',
        schedule: 'Пн: Full Body A, Ср: Full Body B, Пт: Full Body C',
      });
    } else {
      recommendations.push({
        name: 'Push/Pull/Legs',
        description: 'Классический PPL — каждая мышечная группа 1 раз в неделю',
        schedule: 'Пн: Push, Ср: Pull, Пт: Legs',
      });
    }
  } else if (daysPerWeek === 4) {
    recommendations.push({
      name: 'Upper/Lower',
      description: 'Верх/Низ 2x — каждая группа 2 раза в неделю, хороший баланс',
      schedule: 'Пн: Upper, Вт: Lower, Чт: Upper, Пт: Lower',
    });
    if (userGoal === 'STRENGTH') {
      recommendations.push({
        name: '5/3/1',
        description: 'Wendler 5/3/1 — проверенная силовая программа с авторегуляцией',
        schedule: 'Пн: Жим, Вт: Присед, Чт: Жим стоя, Пт: Тяга',
      });
    }
  } else if (daysPerWeek >= 5) {
    recommendations.push({
      name: 'PPL 2x',
      description: 'Push/Pull/Legs дважды в неделю — высокая частота, быстрый прогресс',
      schedule: 'Пн: Push, Вт: Pull, Ср: Legs, Чт: отдых, Пт: Push, Сб: Pull, Вс: Legs',
    });
    if (userGoal === 'MUSCLE_GAIN') {
      recommendations.push({
        name: 'Bro Split',
        description: 'Классический сплит по мышечным группам — максимальный объём на группу',
        schedule: 'Пн: Грудь, Вт: Спина, Ср: Плечи, Чт: Ноги, Пт: Руки',
      });
    }
  }

  if (recommendations.length === 0) return '';

  // Расписание сплита ничего не стоит, если мышцы под него не восстановились.
  // muscleRecovery приходил сюда и не использовался: сплит предлагали с
  // понедельника, не глядя, что ноги ещё не отошли от субботы.
  const notReady = muscleRecovery
    .filter((m) => m.status === 'fresh' || (m.status === 'recovering' && m.hoursSinceTraining < 24))
    .map((m) => m.muscle);
  const startNote = notReady.length === 0
    ? ''
    : `\nНачинать с сегодняшнего дня не стоит: ${notReady.join(', ')} ещё восстанавливаются. Сдвинь начало или поставь первым день на другие группы.`;

  const rec = recommendations[0]; // primary recommendation
  return `\n\n## 📋 РЕКОМЕНДУЕМЫЙ СПЛИТ
${rec.name}: ${rec.description}
Расписание: ${rec.schedule}${startNote}
${recommendations.length > 1 ? `Альтернатива: ${recommendations[1].name} — ${recommendations[1].description}` : ''}
→ Предлагай при создании или обсуждении программы.`;
}
export function suggestWorkoutName(
  exercises: Array<{ exercise: { primaryMuscles: string[]; category: string } }>,
): string {
  if (exercises.length === 0) return '';

  const allMuscles = exercises.flatMap((e) => e.exercise?.primaryMuscles ?? []);
  const muscleCount: Record<string, number> = {};
  for (const m of allMuscles) muscleCount[m] = (muscleCount[m] || 0) + 1;

  const topMuscles = Object.entries(muscleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);

  const muscleNames: Record<string, string> = {
    chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс', triceps: 'Трицепс',
    quadriceps: 'Квадрицепс', hamstrings: 'Бицепс бедра', glutes: 'Ягодицы', calves: 'Икры',
    abs: 'Пресс', lats: 'Широчайшие', traps: 'Трапеция', forearms: 'Предплечья',
  };

  // Detect common splits
  const hasChest = topMuscles.includes('chest');
  const hasBack = topMuscles.includes('back') || topMuscles.includes('lats');
  const hasLegs = topMuscles.includes('quadriceps') || topMuscles.includes('hamstrings') || topMuscles.includes('glutes');
  const hasShoulders = topMuscles.includes('shoulders');
  const categories = exercises.map((e) => e.exercise?.category);
  const hasCardio = categories.includes('cardio');

  let suggestion = '';
  if (hasChest && hasShoulders && topMuscles.includes('triceps')) suggestion = 'Push (Грудь + Плечи + Трицепс)';
  else if (hasBack && topMuscles.includes('biceps')) suggestion = 'Pull (Спина + Бицепс)';
  else if (hasLegs && !hasChest && !hasBack) suggestion = 'Ноги';
  else if (hasChest && !hasLegs) suggestion = `Верх (${topMuscles.slice(0, 2).map((m) => muscleNames[m] || m).join(' + ')})`;
  else if (hasCardio) suggestion = 'Кардио + Функционал';
  else suggestion = topMuscles.slice(0, 2).map((m) => muscleNames[m] || m).join(' + ');

  return `\n\nСовет для названия тренировки: «${suggestion}»`;
}
export function detectTrainingPhase(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; type: string }>;
    }>;
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Analyze last 3 workouts
  const sessions = recentWorkouts.slice(0, 3).map((w) => {
    const allSets = w.exercises.flatMap((e) =>
      e.sets.filter((s) => s.completed && s.weight && s.reps && s.type !== 'warmup'),
    );
    const avgReps = allSets.length > 0
      ? allSets.reduce((sum, s) => sum + (s.reps || 0), 0) / allSets.length
      : 0;
    const avgWeight = allSets.length > 0
      ? allSets.reduce((sum, s) => sum + (s.weight || 0), 0) / allSets.length
      : 0;
    const totalSets = allSets.length;
    return { avgReps, avgWeight, totalSets };
  });

  const currentAvgReps = sessions[0].avgReps;
  const currentAvgWeight = sessions[0].avgWeight;
  const currentVolume = sessions[0].totalSets;

  // Determine phase
  let phase: string;
  let description: string;
  let advice: string;

  if (currentAvgReps >= 10 && currentVolume >= 15) {
    phase = 'НАКОПЛЕНИЕ (Accumulation)';
    description = 'Высокий объём, умеренные веса — строим базу для будущего прогресса';
    advice = 'Фокус на технике и объёме. Не гонись за весами. Достаточно еды и сна.';
  } else if (currentAvgReps >= 5 && currentAvgReps < 10) {
    phase = 'ИНТЕНСИФИКАЦИЯ (Intensification)';
    description = 'Средние повторы, растущие веса — переход к силовой работе';
    advice = 'Увеличивай веса постепенно. Сократи объём если нужно. Отдых между подходами 2-3 мин.';
  } else if (currentAvgReps < 5 && currentAvgWeight > 0) {
    phase = 'ПИК (Peaking)';
    description = 'Низкие повторы, тяжёлые веса — реализация силового потенциала';
    advice = 'Максимальное восстановление. Лёгкое кардио. Не добавляй лишний объём.';
  } else {
    phase = 'ОБЩАЯ ПОДГОТОВКА';
    description = 'Смешанный тренинг без выраженной фазы';
    advice = 'Определи приоритет: объём или сила. Периодизация ускоряет прогресс.';
  }

  // Trend detection
  const repsTrend = sessions.length >= 2
    ? sessions[0].avgReps < sessions[sessions.length - 1].avgReps ? 'снижение повторов ↓' : 'рост повторов ↑'
    : '';
  const weightTrend = sessions.length >= 2
    ? sessions[0].avgWeight > sessions[sessions.length - 1].avgWeight ? 'рост весов ↑' : ''
    : '';

  const trends = [repsTrend, weightTrend].filter(Boolean);

  return `\n\n## 🔄 ТРЕНИРОВОЧНАЯ ФАЗА
Фаза: ${phase}
${description}
${trends.length > 0 ? `Тренд: ${trends.join(', ')}` : ''}
💡 ${advice}`;
}
export function suggestProgressiveOverload(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; id: string; type: string };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; type: string }>;
    }>;
    completedAt: Date | null;
  }>,
  userGoal: string | null,
): string {
  if (recentWorkouts.length < 2) return '';

  // Group by exercise across workouts
  const exerciseData: Record<string, {
    name: string;
    type: string;
    sessions: Array<{ maxWeight: number; maxReps: number; allCompleted: boolean }>;
  }> = {};

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      if (!ex.exercise?.id) continue;
      const workingSets = ex.sets.filter((s) => s.completed && s.type !== 'warmup' && (s.weight || 0) > 0);
      if (workingSets.length === 0) continue;

      if (!exerciseData[ex.exercise.id]) {
        exerciseData[ex.exercise.id] = { name: ex.exercise.name, type: ex.exercise.type, sessions: [] };
      }

      const maxWeight = Math.max(...workingSets.map((s) => s.weight || 0));
      const maxReps = Math.max(...workingSets.map((s) => s.reps || 0));
      const allCompleted = workingSets.every((s) => s.completed);

      exerciseData[ex.exercise.id].sessions.push({ maxWeight, maxReps, allCompleted });
    }
  }

  const suggestions: string[] = [];

  for (const { name, type, sessions } of Object.values(exerciseData)) {
    if (sessions.length < 2) continue;

    const latest = sessions[0];
    const previous = sessions[1];

    // If all sets completed at same weight for 2+ sessions → suggest increase
    if (latest.maxWeight === previous.maxWeight && latest.allCompleted && previous.allCompleted) {
      let increment: number;
      if (type === 'barbell') increment = 2.5;
      else if (type === 'dumbbell') increment = 2;
      else increment = 5; // machines usually have larger increments

      const newWeight = latest.maxWeight + increment;

      // Goal-based strategy
      if (userGoal === 'STRENGTH') {
        suggestions.push(`${name}: ${latest.maxWeight}→${newWeight} кг (все подходы выполнены 2 раза подряд)`);
      } else if (userGoal === 'MUSCLE_GAIN') {
        // Could also suggest adding reps first
        if (latest.maxReps < 12) {
          suggestions.push(`${name}: сначала доведи до 12 повторений, затем ${latest.maxWeight}→${newWeight} кг`);
        } else {
          suggestions.push(`${name}: ${latest.maxWeight}→${newWeight} кг (12+ повторений достигнуто)`);
        }
      } else {
        suggestions.push(`${name}: можно попробовать ${newWeight} кг (+${increment})`);
      }
    }
  }

  if (suggestions.length === 0) return '';

  return `\n\n## 📈 ПРОГРЕССИЯ НАГРУЗКИ
Готовы к увеличению:
${suggestions.slice(0, 5).map((s) => `- ${s}`).join('\n')}
→ Предложи эти увеличения когда пользователь обсуждает тренировку или прогресс.`;
}
export function calculateWarmupSets(
  scheduledExercises: Array<{
    exercise: { name: string; type: string; primaryMuscles: string[] };
    sets: Array<{ weight: number | null; reps: number | null }>;
  }>,
): string {
  if (scheduledExercises.length === 0) return '';

  // Only for compound barbell/dumbbell exercises
  const compoundExercises = scheduledExercises.filter((ex) =>
    ['barbell', 'dumbbell'].includes(ex.exercise.type) &&
    ex.sets.some((s) => (s.weight || 0) >= 40),
  );

  if (compoundExercises.length === 0) return '';

  const warmups: string[] = [];

  for (const ex of compoundExercises.slice(0, 3)) {
    const workingWeight = Math.max(...ex.sets.map((s) => s.weight || 0));
    if (workingWeight < 40) continue;

    // Ramp-up protocol
    const sets: string[] = [];
    if (workingWeight >= 100) {
      sets.push(`Пустой гриф × 10`);
      sets.push(`${Math.round(workingWeight * 0.4)} кг × 8`);
      sets.push(`${Math.round(workingWeight * 0.6)} кг × 5`);
      sets.push(`${Math.round(workingWeight * 0.8)} кг × 3`);
    } else if (workingWeight >= 60) {
      sets.push(`Пустой гриф × 10`);
      sets.push(`${Math.round(workingWeight * 0.5)} кг × 8`);
      sets.push(`${Math.round(workingWeight * 0.75)} кг × 5`);
    } else {
      sets.push(`${Math.round(workingWeight * 0.5)} кг × 10`);
      sets.push(`${Math.round(workingWeight * 0.75)} кг × 5`);
    }

    warmups.push(`${ex.exercise?.name} (рабочий: ${workingWeight} кг): ${sets.join(' → ')}`);
  }

  if (warmups.length === 0) return '';

  return `\n\n## 🔥 РАЗМИНОЧНЫЕ ПОДХОДЫ
${warmups.join('\n')}
→ Предложи разминку если пользователь спрашивает с чего начать или как разогреться.`;
}
export function analyzeWorkoutPacing(
  recentWorkouts: Array<{
    exercises: Array<{
      restSeconds: number;
      sets: Array<{ completed: boolean }>;
    }>;
    durationMinutes: number | null;
    completedAt: Date | null;
    startedAt: Date | null;
  }>,
  userGoal: string | null,
): string {
  if (recentWorkouts.length === 0) return '';

  const lastWorkout = recentWorkouts[0];
  if (!lastWorkout.startedAt || !lastWorkout.completedAt) return '';

  const actualDuration = lastWorkout.durationMinutes ||
    Math.round((new Date(lastWorkout.completedAt).getTime() - new Date(lastWorkout.startedAt).getTime()) / 60000);

  const totalSets = lastWorkout.exercises.reduce((sum, ex) =>
    sum + ex.sets.filter((s) => s.completed).length, 0);
  const avgRestConfigured = lastWorkout.exercises.length > 0
    ? Math.round(lastWorkout.exercises.reduce((sum, ex) => sum + ex.restSeconds, 0) / lastWorkout.exercises.length)
    : 90;

  // Estimate time spent exercising vs resting
  const estimatedWorkTime = totalSets * 0.5; // ~30sec per set
  const estimatedRestTime = actualDuration - estimatedWorkTime;
  const restPercentage = actualDuration > 0 ? Math.round((estimatedRestTime / actualDuration) * 100) : 0;

  const lines: string[] = [];

  // Goal-specific rest recommendations
  const idealRest: Record<string, { range: string; seconds: number }> = {
    STRENGTH: { range: '3-5 мин', seconds: 240 },
    MUSCLE_GAIN: { range: '60-90 сек', seconds: 75 },
    WEIGHT_LOSS: { range: '30-60 сек', seconds: 45 },
    ENDURANCE: { range: '30-45 сек', seconds: 38 },
    GENERAL_FITNESS: { range: '60-120 сек', seconds: 90 },
  };
  const ideal = idealRest[userGoal || 'GENERAL_FITNESS'] || idealRest['GENERAL_FITNESS'];

  lines.push(`Тренировка: ${actualDuration} мин, ${totalSets} подходов, отдых ~${restPercentage}% времени`);
  lines.push(`Настроенный отдых: ${avgRestConfigured} сек | Рекомендуемый для цели: ${ideal.range}`);

  if (avgRestConfigured > ideal.seconds * 1.5) {
    lines.push(`⚠️ Отдых слишком длинный для цели «${userGoal}». Сократи до ${ideal.range}.`);
  } else if (avgRestConfigured < ideal.seconds * 0.5 && userGoal === 'STRENGTH') {
    lines.push(`⚠️ Для силовой работы отдыхай дольше (${ideal.range}). Короткий отдых снижает силу.`);
  }

  return `\n\n## ⏱️ ТЕМП ТРЕНИРОВКИ
${lines.join('\n')}`;
}
export function compareToStrengthStandards(
  lifetimePRs: Record<string, { name: string; bestWeight: number; bestReps: number; est1RM: number }>,
  userWeightKg: number | null,
  userGender: string | null,
): string {
  if (!userWeightKg || Object.keys(lifetimePRs).length === 0) return '';

  // Approximate strength standards (1RM / bodyweight ratio) for key lifts
  const standards: Record<string, Record<string, number>> = {
    MALE: {
      // novice / intermediate / advanced / elite
      'Жим штанги лёжа': 1.0,      // 1x BW = intermediate
      'Приседания со штангой': 1.25, // 1.25x BW = intermediate
      'Становая тяга': 1.5,         // 1.5x BW = intermediate
      'Жим штанги стоя': 0.65,      // 0.65x BW = intermediate
      'Тяга штанги в наклоне': 0.85,
    },
    FEMALE: {
      'Жим штанги лёжа': 0.65,
      'Приседания со штангой': 0.9,
      'Становая тяга': 1.1,
      'Жим штанги стоя': 0.45,
      'Тяга штанги в наклоне': 0.6,
    },
  };

  const genderStandards = standards[userGender || 'MALE'] || standards['MALE'];
  const lines: string[] = [];

  for (const pr of Object.values(lifetimePRs)) {
    const standard = genderStandards[pr.name];
    if (!standard) continue;

    const ratio = pr.est1RM / userWeightKg;
    const intermediateTarget = standard * userWeightKg;

    let level: string;
    if (ratio < standard * 0.6) level = 'Новичок';
    else if (ratio < standard) level = 'Средний';
    else if (ratio < standard * 1.4) level = 'Продвинутый';
    else level = 'Элита';

    const pct = Math.round((ratio / standard) * 100);
    lines.push(`${pr.name}: ${pr.est1RM} кг (${ratio.toFixed(2)}×BW) — ${level} (${pct}% от норм. среднего)`);
  }

  if (lines.length === 0) return '';

  return `\n\n## 🏆 СИЛОВЫЕ СТАНДАРТЫ
${lines.slice(0, 5).join('\n')}
→ Используй для мотивации и постановки целей. «До продвинутого уровня в жиме осталось X кг».`;
}
export function optimizeTrainingFrequency(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { primaryMuscles: string[] };
      sets: Array<{ completed: boolean }>;
    }>;
    completedAt: Date | null;
  }>,
  userGoal: string | null,
): string {
  if (recentWorkouts.length < 3) return '';

  // Count weekly frequency per muscle
  const now = Date.now();
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
  const recentOnly = recentWorkouts.filter((w) => w.completedAt && new Date(w.completedAt).getTime() > twoWeeksAgo);
  if (recentOnly.length < 2) return '';

  const weeksSpan = Math.max(1, (now - Math.min(...recentOnly.map((w) => new Date(w.completedAt!).getTime()))) / (7 * 24 * 60 * 60 * 1000));

  const muscleFreq: Record<string, number> = {};
  for (const w of recentOnly) {
    const musclesThisWorkout = new Set<string>();
    for (const ex of w.exercises) {
      for (const m of ex.exercise?.primaryMuscles ?? []) musclesThisWorkout.add(m);
    }
    for (const m of musclesThisWorkout) {
      muscleFreq[m] = (muscleFreq[m] || 0) + 1;
    }
  }

  // Convert to weekly frequency
  const weeklyFreq: Record<string, number> = {};
  for (const [m, count] of Object.entries(muscleFreq)) {
    weeklyFreq[m] = Math.round((count / weeksSpan) * 10) / 10;
  }

  // Optimal frequency by goal
  const idealFreq = userGoal === 'MUSCLE_GAIN' ? 2.0 : userGoal === 'STRENGTH' ? 2.5 : 1.5;

  const lines: string[] = [];
  const tooLow: string[] = [];
  const tooHigh: string[] = [];

  for (const [muscle, freq] of Object.entries(weeklyFreq)) {
    if (freq < idealFreq * 0.5) tooLow.push(muscle);
    else if (freq > idealFreq * 1.5) tooHigh.push(muscle);
  }

  const muscleRu: Record<string, string> = {
    chest: 'грудь', back: 'спина', shoulders: 'плечи', biceps: 'бицепс', triceps: 'трицепс',
    quadriceps: 'квадрицепс', hamstrings: 'бицепс бедра', glutes: 'ягодицы', calves: 'икры',
    abs: 'пресс', lats: 'широчайшие',
  };

  if (tooLow.length > 0) {
    lines.push(`📉 Мало тренируются (< ${(idealFreq * 0.5).toFixed(1)}р/нед): ${tooLow.map((m) => muscleRu[m] || m).join(', ')}`);
  }
  if (tooHigh.length > 0) {
    lines.push(`📈 Слишком часто (> ${(idealFreq * 1.5).toFixed(1)}р/нед): ${tooHigh.map((m) => muscleRu[m] || m).join(', ')}`);
  }

  if (lines.length === 0) {
    lines.push(`✅ Частота мышечных групп в оптимальном диапазоне (~${idealFreq}р/нед для цели)`);
  }

  return `\n\n## 📊 ЧАСТОТА ТРЕНИРОВКИ МЫШЦ
${lines.join('\n')}
→ Предлагай изменения в сплите если частота не оптимальна.`;
}
export function scoreWorkoutEfficiency(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; type: string }>;
    }>;
    durationMinutes: number | null;
    completedAt: Date | null;
    startedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length === 0) return '';

  const scores = recentWorkouts.slice(0, 3).map((w) => {
    const duration = w.durationMinutes ||
      (w.startedAt && w.completedAt
        ? Math.round((new Date(w.completedAt).getTime() - new Date(w.startedAt).getTime()) / 60000)
        : null);
    if (!duration || duration < 10) return null;

    const workingSets = w.exercises.reduce((sum, ex) =>
      sum + ex.sets.filter((s) => s.completed && s.type !== 'warmup').length, 0);

    return {
      setsPerMin: workingSets / duration,
      sets: workingSets,
      duration,
    };
  }).filter(Boolean) as Array<{ setsPerMin: number; sets: number; duration: number }>;

  if (scores.length === 0) return '';

  const avgSetsPerMin = scores.reduce((sum, s) => sum + s.setsPerMin, 0) / scores.length;

  let rating: string;
  let advice: string;
  if (avgSetsPerMin > 0.5) {
    rating = 'Высокая';
    advice = 'Отличный темп! Следи за качеством подходов при такой интенсивности.';
  } else if (avgSetsPerMin > 0.33) {
    rating = 'Нормальная';
    advice = 'Хороший баланс между работой и отдыхом.';
  } else if (avgSetsPerMin > 0.2) {
    rating = 'Ниже среднего';
    advice = 'Возможно, слишком длинные перерывы. Попробуй суперсеты или сократи отдых.';
  } else {
    rating = 'Низкая';
    advice = 'Много времени тратится впустую. Сократи отдых, убери телефон, используй суперсеты.';
  }

  return `\n\n## ⚡ ЭФФЕКТИВНОСТЬ ТРЕНИРОВОК
${scores.map((s) => `${s.sets} подходов за ${s.duration} мин (${(s.setsPerMin * 60).toFixed(1)} подх/час)`).join(' | ')}
Оценка: ${rating}
💡 ${advice}`;
}
export function scoreWorkoutComplexity(
  exercises: Array<{
    exercise: { type: string; difficulty: string; primaryMuscles: string[] };
    sets: Array<{ type: string }>;
  }>,
  userLevel: string | null,
): string {
  if (exercises.length === 0) return '';

  let complexityScore = 0;

  // Exercise count factor
  complexityScore += Math.min(exercises.length * 5, 30);

  // Equipment variety
  const equipmentTypes = new Set(exercises.map((e) => e.exercise?.type));
  complexityScore += equipmentTypes.size * 5;

  // Advanced set types (dropsets, supersets, etc)
  const advancedSets = exercises.flatMap((e) => e.sets.filter((s) => ['dropset', 'superset', 'failure', 'rest_pause'].includes(s.type)));
  complexityScore += advancedSets.length * 8;

  // Muscle group count
  const muscleGroups = new Set(exercises.flatMap((e) => e.exercise?.primaryMuscles ?? []));
  complexityScore += muscleGroups.size * 3;

  // Difficulty of exercises
  const difficultyScores: Record<string, number> = { beginner: 1, intermediate: 3, advanced: 5, expert: 8 };
  const avgDifficulty = exercises.reduce((sum, e) => sum + (difficultyScores[e.exercise?.difficulty?.toLowerCase()] || 2), 0) / exercises.length;
  complexityScore += Math.round(avgDifficulty * 5);

  // Normalize to 1-10
  const normalizedScore = Math.min(10, Math.max(1, Math.round(complexityScore / 10)));

  // Level-appropriate check
  const levelMax: Record<string, number> = { BEGINNER: 4, INTERMEDIATE: 6, ADVANCED: 8, EXPERT: 10 };
  const maxForLevel = levelMax[userLevel || 'INTERMEDIATE'] || 6;

  const lines: string[] = [];
  lines.push(`Сложность тренировки: ${normalizedScore}/10`);

  if (normalizedScore > maxForLevel + 1) {
    lines.push(`⚠️ Слишком сложно для уровня ${userLevel || 'intermediate'}. Упрости: убери продвинутые техники или сократи количество упражнений.`);
  } else if (normalizedScore < maxForLevel - 3 && userLevel !== 'BEGINNER') {
    lines.push(`💡 Можно усложнить: добавь суперсеты, дроп-сеты, или более сложные вариации.`);
  }

  return `\n\n## 📐 СЛОЖНОСТЬ ТРЕНИРОВКИ: ${normalizedScore}/10
${lines.join('\n')}`;
}
export function analyzeRPEPatterns(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string };
      sets: Array<{ rpe: number | null; weight: number | null; completed: boolean }>;
    }>;
  }>,
): string {
  // Collect all sets with RPE data
  const rpeSets: Array<{ exercise: string; rpe: number; weight: number }> = [];

  for (const w of recentWorkouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (s.rpe && s.completed && s.weight) {
          rpeSets.push({ exercise: ex.exercise?.name, rpe: s.rpe, weight: s.weight });
        }
      }
    }
  }

  if (rpeSets.length < 5) return ''; // not enough RPE data

  const avgRPE = rpeSets.reduce((sum, s) => sum + s.rpe, 0) / rpeSets.length;
  const highRPE = rpeSets.filter((s) => s.rpe >= 9).length;
  const lowRPE = rpeSets.filter((s) => s.rpe <= 6).length;

  const lines: string[] = [];
  lines.push(`Средний RPE: ${avgRPE.toFixed(1)} (${rpeSets.length} подходов с данными)`);

  if (avgRPE > 8.5) {
    lines.push('🔴 Слишком тяжело! Средний RPE > 8.5. Большинство подходов должно быть RPE 7-8. Снизь нагрузку.');
  } else if (avgRPE < 6) {
    lines.push('🟡 Слишком легко. Средний RPE < 6. Для прогресса работай на RPE 7-8 в рабочих подходах.');
  } else if (highRPE > rpeSets.length * 0.5) {
    lines.push(`⚠️ ${Math.round((highRPE / rpeSets.length) * 100)}% подходов на RPE 9-10. Это путь к перетренированности. Оставляй 1-2 повтора в запасе.`);
  } else {
    lines.push('✅ Нагрузка в оптимальном диапазоне (RPE 7-8).');
  }

  return `\n\n## 📊 АНАЛИЗ RPE
${lines.join('\n')}
→ Комментируй когда обсуждаешь интенсивность тренировок.`;
}
export function analyzeWorkoutPatterns(
  recentWorkouts: Array<{ startedAt: Date | null; completedAt: Date | null; name: string }>,
): string {
  const withTimes = recentWorkouts.filter((w) => w.startedAt);
  if (withTimes.length < 3) return '';

  // Time-of-day analysis
  const hours = withTimes.map((w) => new Date(w.startedAt!).getHours());
  const morningCount = hours.filter((h) => h >= 5 && h < 12).length;
  const afternoonCount = hours.filter((h) => h >= 12 && h < 17).length;
  const eveningCount = hours.filter((h) => h >= 17 && h < 22).length;

  const lines: string[] = [];

  const total = withTimes.length;
  if (morningCount > total * 0.6) {
    lines.push('🌅 Ты жаворонок — большинство тренировок утром. Утренние тренировки дают заряд на весь день.');
  } else if (eveningCount > total * 0.6) {
    lines.push('🌙 Ты сова — тренируешься вечером. Это нормально, но заверши за 2-3ч до сна.');
  } else if (afternoonCount > total * 0.6) {
    lines.push('☀️ Дневные тренировки — пик мышечной активности! Отличное время.');
  }

  // Duration patterns
  const durations = withTimes
    .filter((w) => w.completedAt)
    .map((w) => Math.round((new Date(w.completedAt!).getTime() - new Date(w.startedAt!).getTime()) / 60000));

  if (durations.length >= 3) {
    const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    if (maxDuration - minDuration > 30) {
      lines.push(`⏱️ Длительность варьируется: ${minDuration}-${maxDuration} мин (среднее ${avgDuration}). Стабильность = лучший прогресс.`);
    }

    if (avgDuration > 90) {
      lines.push('⚠️ Средняя тренировка > 90 мин. После 60-75 мин кортизол растёт — рассмотри более короткие, интенсивные сессии.');
    }
  }

  if (lines.length === 0) return '';

  return `\n\n## 🔍 ПАТТЕРНЫ ТРЕНИРОВОК
${lines.join('\n')}`;
}
export function suggestExercisePairings(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; primaryMuscles: string[]; type: string };
      order: number;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 2) return '';

  // Define antagonist pairs
  const antagonists: Record<string, string> = {
    chest: 'back', back: 'chest',
    biceps: 'triceps', triceps: 'biceps',
    quadriceps: 'hamstrings', hamstrings: 'quadriceps',
    shoulders: 'back',
  };

  // Find consecutive exercises that could be paired
  const suggestions: string[] = [];
  const lastWorkout = recentWorkouts[0];
  if (!lastWorkout) return '';

  const exercises = lastWorkout.exercises.sort((a, b) => a.order - b.order);
  for (let i = 0; i < exercises.length - 1; i++) {
    const curr = exercises[i];
    const next = exercises[i + 1];
    const currMuscle = curr.exercise?.primaryMuscles?.[0];
    const nextMuscle = next.exercise?.primaryMuscles?.[0];

    if (currMuscle && nextMuscle && antagonists[currMuscle] === nextMuscle) {
      suggestions.push(`${curr.exercise?.name} + ${next.exercise?.name} → отличный суперсет (антагонисты)`);
    }
  }

  if (suggestions.length === 0) return '';

  return `\n\n## 🔗 СУПЕРСЕТЫ
Замечены удачные пары упражнений в последней тренировке:
${suggestions.slice(0, 2).map(s => `- ${s}`).join('\n')}
Можешь предложить суперсеты для экономии времени.`;
}
export function optimizeWorkoutDensity(
  recentWorkouts: Array<{
    durationMinutes: number | null;
    exercises: Array<{
      sets: Array<{ completed: boolean }>;
      restSeconds: number;
    }>;
  }>,
  userGoal: string | null,
): string {
  if (recentWorkouts.length < 2) return '';

  const densities: number[] = [];
  for (const w of recentWorkouts.slice(0, 5)) {
    if (!w.durationMinutes || w.durationMinutes < 10) continue;
    const totalSets = w.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0);
    const avgRestSec = w.exercises.reduce((sum, ex) => sum + ex.restSeconds, 0) / (w.exercises.length || 1);
    const estimatedRestMin = (totalSets * avgRestSec) / 60;
    const workMin = w.durationMinutes - estimatedRestMin;
    if (workMin > 0) {
      densities.push(workMin / w.durationMinutes);
    }
  }

  if (densities.length === 0) return '';

  const avgDensity = densities.reduce((a, b) => a + b, 0) / densities.length;
  const pct = Math.round(avgDensity * 100);

  // Goal-specific targets
  const target = userGoal === 'WEIGHT_LOSS' ? 50 :
                 userGoal === 'MUSCLE_GAIN' ? 35 :
                 userGoal === 'STRENGTH' ? 25 : 40;

  if (pct > target + 15) {
    return `\n\n## ⏱️ ПЛОТНОСТЬ ТРЕНИРОВОК: ${pct}% работы
Очень высокая плотность. Возможно, слишком короткий отдых между подходами.
${userGoal === 'STRENGTH' ? 'Для силы нужен полный отдых (3-5 мин между тяжёлыми подходами).' : ''}`;
  }

  if (pct < target - 15) {
    return `\n\n## ⏱️ ПЛОТНОСТЬ ТРЕНИРОВОК: ${pct}% работы
Низкая плотность — много времени уходит на отдых.
${userGoal === 'WEIGHT_LOSS' ? 'Для жиросжигания попробуй суперсеты и сокращённый отдых (45-60 сек).' : 'Попробуй сократить отдых на изоляции до 60-90 сек.'}`;
  }

  return '';
}
export function buildSmartWarmup(
  lastWorkoutMuscles: string[],
  daysSinceLastWorkout: number,
  userAge: number | null,
  healthRestrictions: Array<{ bodyPart: string; severity: string }>,
): string {
  if (lastWorkoutMuscles.length === 0) return '';

  const muscleRu: Record<string, string> = {
    chest: 'грудь', back: 'спина', shoulders: 'плечи',
    biceps: 'бицепс', triceps: 'трицепс', quadriceps: 'квадрицепс',
    hamstrings: 'задняя поверхность', glutes: 'ягодицы', calves: 'икры',
    abs: 'пресс', lats: 'широчайшие', traps: 'трапеция',
  };

  const warmup: string[] = [];

  // General warm-up
  warmup.push('5 мин лёгкое кардио (велосипед или эллипс)');

  // If long break, more warm-up needed
  if (daysSinceLastWorkout >= 5) {
    warmup.push('10 мин общая разминка (длительный перерыв!)');
  }

  // Age-specific
  if (userAge && userAge > 40) {
    warmup.push('Дополнительная разминка суставов (круговые движения, 2-3 мин)');
  }

  // Injury-specific warm-up
  for (const r of healthRestrictions) {
    if (r.severity === 'moderate' || r.severity === 'severe') {
      warmup.push(`⚠️ Особое внимание разминке: ${r.bodyPart} (${r.severity === 'severe' ? 'серьёзное ограничение' : 'умеренное ограничение'})`);
    }
  }

  // Muscle-specific mobility
  const mobilityMap: Record<string, string> = {
    chest: 'Растяжка грудных + вращения плеч',
    back: 'Кошка-корова + вращения торса',
    shoulders: 'Дисплокация с палкой + вращения',
    quadriceps: 'Приседания с собственным весом × 15',
    hamstrings: 'Румынская тяга без веса + наклоны',
    glutes: 'Ягодичный мостик × 15',
  };

  for (const muscle of lastWorkoutMuscles.slice(0, 3)) {
    const mobility = mobilityMap[muscle];
    if (mobility) warmup.push(mobility);
  }

  return `\n\n## 🏃 РАЗМИНКА
Рекомендуемая разминка для следующей тренировки (${lastWorkoutMuscles.slice(0, 3).map(m => muscleRu[m] || m).join(', ')}):
${warmup.map(w => `- ${w}`).join('\n')}
Предложи разминку если пользователь собирается тренироваться.`;
}
export function detectTrainingMonotony(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string };
      sets: Array<{ weight: number | null; reps: number | null }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 4) return '';

  // Count exercise frequency across last 8 workouts
  const exerciseCount: Record<string, number> = {};
  const totalWorkouts = Math.min(recentWorkouts.length, 8);

  for (const w of recentWorkouts.slice(0, totalWorkouts)) {
    const seen = new Set<string>();
    for (const ex of w.exercises) {
      const exName = ex.exercise?.name;
      if (!exName) continue;
      if (!seen.has(exName)) {
        exerciseCount[exName] = (exerciseCount[exName] || 0) + 1;
        seen.add(exName);
      }
    }
  }

  // Find exercises that appear in >75% of workouts
  const threshold = totalWorkouts * 0.75;
  const overused = Object.entries(exerciseCount)
    .filter(([, count]) => count >= threshold)
    .map(([name, count]) => `${name} (${count}/${totalWorkouts} тренировок)`);

  // Check if weight/reps are stagnant too
  const stagnant: string[] = [];
  for (const w of recentWorkouts.slice(0, 4)) {
    for (const ex of w.exercises) {
      const stagnantExName = ex.exercise?.name;
      if (!stagnantExName) continue;
      const weights = ex.sets.filter(s => s.weight).map(s => s.weight!);
      if (weights.length >= 3) {
        const allSame = weights.every(w => w === weights[0]);
        if (allSame && !stagnant.includes(stagnantExName)) {
          stagnant.push(stagnantExName);
        }
      }
    }
  }

  if (overused.length === 0 && stagnant.length === 0) return '';

  const parts: string[] = [];
  if (overused.length > 0) {
    parts.push(`Часто повторяющиеся упражнения:\n${overused.slice(0, 3).map(o => `- ${o}`).join('\n')}`);
  }
  if (stagnant.length > 0) {
    parts.push(`Стагнация весов: ${stagnant.slice(0, 3).join(', ')}`);
  }

  return `\n\n## 🔄 МОНОТОННОСТЬ ТРЕНИРОВОК
${parts.join('\n')}
Предложи вариации упражнений или изменение схемы подходов/повторений для разнообразия.`;
}
export function analyzeGripStrength(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; type: string };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Exercises where grip is often limiting
  const gripExercises = ['становая тяга', 'deadlift', 'тяга штанги', 'тяга гантел', 'подтягивания', 'шраги', 'румынская тяга', 'barbell row'];

  const gripData: Array<{ name: string; avgReps: number; maxWeight: number }> = [];

  for (const w of recentWorkouts.slice(0, 5)) {
    for (const ex of w.exercises) {
      const nameL = ex.exercise?.name?.toLowerCase();
      if (!nameL) continue;
      const isGripExercise = gripExercises.some(g => nameL.includes(g));
      if (!isGripExercise) continue;

      const completedSets = ex.sets.filter(s => s.completed && s.weight && s.reps);
      if (completedSets.length < 2) continue;

      // Check if reps drop significantly across sets (grip fatigue pattern)
      const reps = completedSets.map(s => s.reps!);
      const firstHalfAvg = reps.slice(0, Math.ceil(reps.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(reps.length / 2);
      const secondHalfAvg = reps.slice(Math.ceil(reps.length / 2)).reduce((a, b) => a + b, 0) / (reps.length - Math.ceil(reps.length / 2));

      if (firstHalfAvg > 0 && secondHalfAvg / firstHalfAvg < 0.7) {
        gripData.push({
          name: ex.exercise?.name,
          avgReps: Math.round((firstHalfAvg + secondHalfAvg) / 2),
          maxWeight: Math.max(...completedSets.map(s => s.weight!)),
        });
      }
    }
  }

  if (gripData.length === 0) return '';

  return `\n\n## 🤝 СИЛА ХВАТА
Возможный лимитирующий фактор — хват. Заметно падение повторений в:
${gripData.slice(0, 2).map(g => `- ${g.name}: значительное падение повторений к последним подходам`).join('\n')}
Рекомендации: лямки для тяжёлых подходов, тренировка хвата отдельно (фермерская прогулка, вис на перекладине).`;
}
export function suggestPlateauBreakers(
  plateauExercises: string[],
  userLevel: string | null,
): string {
  if (plateauExercises.length === 0) return '';

  const strategies: Record<string, string[]> = {
    beginner: [
      'Увеличь частоту тренировки этого движения до 2-3 раз в неделю',
      'Проверь технику — часто плато у новичков из-за неэффективной биомеханики',
      'Добавь 1 рабочий подход к упражнению',
    ],
    intermediate: [
      'Попробуй волнообразную периодизацию: тяжёлый → средний → лёгкий день',
      'Используй паузу в нижней точке (2-3 сек) для улучшения техники',
      'Добавь вспомогательное упражнение на слабое звено',
      'Попробуй метод 5/3/1 для этого движения',
    ],
    advanced: [
      'Блоковая периодизация: 3 недели объём → 3 недели интенсивность → пик',
      'Кластерные сеты: разбей тяжёлый подход на мини-сеты с 15 сек отдыхом',
      'Сопряжённый метод: чередуй варианты движения (с резиной, с цепями, с паузой)',
      'Перегрузка в частичной амплитуде (рэк-пулл, жим с бруса)',
    ],
  };

  const level = (userLevel?.toLowerCase() || 'intermediate') as string;
  const applicable = strategies[level] || strategies['intermediate'];

  return `\n\n## 🧱 ПРЕОДОЛЕНИЕ ПЛАТО
Упражнения в плато: ${plateauExercises.slice(0, 3).join(', ')}
Стратегии для уровня "${level}":
${applicable!.map(s => `- ${s}`).join('\n')}
Предложи конкретную стратегию при обсуждении этих упражнений.`;
}
export function generateWeeklyReport(
  weeklyWorkouts: number,
  weeklyVolume: number,
  prevWeekVolume: number,
  weeklyCaloriesAvg: number,
  targetCalories: number,
  currentStreak: number,
): string {
  if (weeklyWorkouts === 0) return '';

  const volumeChange = prevWeekVolume > 0
    ? Math.round(((weeklyVolume - prevWeekVolume) / prevWeekVolume) * 100)
    : 0;

  const grade = weeklyWorkouts >= 4 ? 'A' :
                weeklyWorkouts >= 3 ? 'B' :
                weeklyWorkouts >= 2 ? 'C' : 'D';

  const report: string[] = [];
  report.push(`Тренировок: ${weeklyWorkouts} | Оценка: ${grade}`);
  report.push(`Объём: ${Math.round(weeklyVolume)} кг${volumeChange !== 0 ? ` (${volumeChange > 0 ? '+' : ''}${volumeChange}% vs прошлая неделя)` : ''}`);

  if (weeklyCaloriesAvg > 0 && targetCalories > 0) {
    const calPct = Math.round((weeklyCaloriesAvg / targetCalories) * 100);
    report.push(`Питание: ~${Math.round(weeklyCaloriesAvg)} ккал/день (${calPct}% от нормы)`);
  }

  if (currentStreak > 0) {
    report.push(`Серия: ${currentStreak} дней`);
  }

  return `\n\n## 📋 НЕДЕЛЬНЫЙ ОТЧЁТ
${report.join('\n')}
Используй эти данные если пользователь спрашивает об итогах или прогрессе за неделю.`;
}
export function getExerciseTempo(
  exerciseName: string,
  userGoal: string | null,
): string {
  const tempoDb: Record<string, Record<string, string>> = {
    'жим лёжа': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '3-0-1-1', ENDURANCE: '2-0-1-0' },
    'присед': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '4-0-1-1', ENDURANCE: '2-0-1-0' },
    'становая тяга': { STRENGTH: '2-0-1-1', MUSCLE_GAIN: '3-0-1-0', ENDURANCE: '2-0-1-0' },
    'жим стоя': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '3-0-1-1', ENDURANCE: '2-0-1-0' },
    'тяга штанги': { STRENGTH: '2-1-1-1', MUSCLE_GAIN: '3-1-1-1', ENDURANCE: '2-0-1-0' },
    'подтягивания': { STRENGTH: '3-1-1-0', MUSCLE_GAIN: '4-1-1-0', ENDURANCE: '2-0-1-0' },
  };

  const nameL = exerciseName.toLowerCase();
  for (const [key, tempos] of Object.entries(tempoDb)) {
    if (nameL.includes(key)) {
      const tempo = tempos[userGoal || 'MUSCLE_GAIN'] || tempos['MUSCLE_GAIN'];
      return `${exerciseName}: темп ${tempo} (эксцентрик-пауза-концентрик-пауза)`;
    }
  }

  return '';
}
export function detectUserPersonality(
  messageHistory: Array<{ role: string; content: string }>,
): string {
  if (messageHistory.length < 5) return '';

  const userMessages = messageHistory.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
  const allText = userMessages.join(' ');

  // Detect communication style
  const isVerbose = userMessages.some(m => m.length > 200);
  const isTerse = userMessages.every(m => m.length < 50);
  const usesEmoji = /[\u{1F600}-\u{1F64F}]/u.test(allText);
  const isPolite = /пожалуйста|спасибо|будь добр/i.test(allText);
  const isDirect = /давай|сделай|покажи|скажи/i.test(allText);
  const usesSlang = /чел|кач|качок|бро|го|изи|хард/i.test(allText);

  const traits: string[] = [];

  if (isTerse) traits.push('Пользователь пишет кратко — отвечай так же лаконично.');
  else if (isVerbose) traits.push('Пользователь пишет подробно — можно давать развёрнутые ответы.');

  if (usesEmoji) traits.push('Пользователь использует эмодзи — можно отвечать с эмодзи.');
  if (isPolite) traits.push('Вежливый стиль общения — будь таким же.');
  if (isDirect) traits.push('Прямой стиль — давай конкретику без лишних слов.');
  if (usesSlang) traits.push('Использует сленг — можно говорить неформально, «бро»-стиль.');

  if (traits.length === 0) return '';

  return `\n\n## 🎭 СТИЛЬ ОБЩЕНИЯ
${traits.join('\n')}
Подстраивай тон под пользователя.`;
}
export function predictWorkoutCompletion(
  completionRate: number,
  currentStreak: number,
  dayOfWeek: number,
  typicalTrainingDays: number[],
): string {
  // Base prediction from completion rate
  let probability = completionRate;

  // Adjust for streak
  if (currentStreak >= 7) probability = Math.min(probability + 0.1, 1);
  else if (currentStreak === 0) probability = Math.max(probability - 0.15, 0);

  // Adjust for typical training day
  if (typicalTrainingDays.includes(dayOfWeek)) {
    probability = Math.min(probability + 0.1, 1);
  } else {
    probability = Math.max(probability - 0.1, 0);
  }

  const pct = Math.round(probability * 100);

  if (pct >= 80) {
    return `\n\n## 🎯 ПРОГНОЗ ТРЕНИРОВКИ
Вероятность тренировки сегодня: ~${pct}%. Пользователь стабилен — поддержи настрой!`;
  }

  if (pct < 50) {
    return `\n\n## 🎯 ПРОГНОЗ ТРЕНИРОВКИ
Вероятность тренировки сегодня: ~${pct}%. Будь проактивным: предложи лёгкую тренировку или мотивацию.`;
  }

  return '';
}
export function trackProgressiveOverload(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; type: string }>;
    }>;
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 4) return '';

  // Group by exercise and track max weight over time
  const exerciseProgress: Record<string, Array<{ date: number; maxWeight: number; bestSet: string }>> = {};

  for (const w of recentWorkouts) {
    if (!w.completedAt) continue;
    for (const ex of w.exercises) {
      const workingSets = ex.sets.filter(s => s.completed && s.type !== 'warmup' && s.weight);
      if (workingSets.length === 0) continue;

      const maxW = Math.max(...workingSets.map(s => s.weight!));
      const bestSet = workingSets.find(s => s.weight === maxW);

      const progExName = ex.exercise?.name;
      if (!progExName) continue;
      if (!exerciseProgress[progExName]) exerciseProgress[progExName] = [];
      exerciseProgress[progExName].push({
        date: w.completedAt.getTime(),
        maxWeight: maxW,
        bestSet: bestSet ? `${bestSet.weight}кг × ${bestSet.reps}` : '',
      });
    }
  }

  const progressing: string[] = [];
  const stagnating: string[] = [];

  for (const [name, data] of Object.entries(exerciseProgress)) {
    if (data.length < 2) continue;
    const sorted = data.sort((a, b) => b.date - a.date);
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];

    if (newest.maxWeight > oldest.maxWeight) {
      const gain = newest.maxWeight - oldest.maxWeight;
      progressing.push(`✅ ${name}: +${gain}кг (${oldest.bestSet} → ${newest.bestSet})`);
    } else if (newest.maxWeight === oldest.maxWeight && data.length >= 3) {
      stagnating.push(`⏸️ ${name}: ${newest.maxWeight}кг без изменений`);
    }
  }

  if (progressing.length === 0 && stagnating.length === 0) return '';

  const parts: string[] = [];
  if (progressing.length > 0) parts.push(`Прогресс:\n${progressing.slice(0, 3).join('\n')}`);
  if (stagnating.length > 0) parts.push(`Стагнация:\n${stagnating.slice(0, 2).join('\n')}`);

  return `\n\n## 📈 ПРОГРЕССИВНАЯ ПЕРЕГРУЗКА
${parts.join('\n\n')}
Хвали прогресс и помогай со стагнирующими упражнениями.`;
}
export function buildTrainingPartnerContext(
  isCurrentlyTraining: boolean,
  currentExercise: string | null,
  setNumber: number | null,
): string {
  if (!isCurrentlyTraining) return '';

  const encouragements = [
    'Давай, ещё один подход! Ты сильнее чем думаешь.',
    'Контролируй негативную фазу. Медленно опускай.',
    'Дыши! Не забывай дышать между повторениями.',
    'Отличная работа! Отдохни и готовься к следующему.',
  ];

  const random = encouragements[Math.floor(Math.random() * encouragements.length)];

  return `\n\n## 🤝 НАПАРНИК ПО ТРЕНИРОВКЕ
${currentExercise ? `Текущее упражнение: ${currentExercise}${setNumber ? `, подход ${setNumber}` : ''}` : 'Тренировка идёт'}
Подбадривай как напарник: "${random}"
Будь энергичным и поддерживающим если пользователь пишет во время тренировки.`;
}
export function suggestExerciseProgression(
  exerciseName: string,
  userLevel: string | null,
): string {
  const progressions: Record<string, { easier: string; harder: string }> = {
    'жим лёжа': { easier: 'Жим гантелей лёжа', harder: 'Жим лёжа с паузой / Жим с цепями' },
    'присед': { easier: 'Гоблет-присед', harder: 'Фронтальный присед / Присед с паузой' },
    'становая тяга': { easier: 'Румынская тяга', harder: 'Дефицитная тяга / Тяга с паузой' },
    'подтягивания': { easier: 'Подтягивания с резинкой', harder: 'Подтягивания с весом' },
    'жим стоя': { easier: 'Жим гантелей сидя', harder: 'Жим стоя строгий / Push-press' },
    'тяга штанги': { easier: 'Тяга гантели в наклоне', harder: 'Тяга Пендлея / Тяга с паузой' },
  };

  const nameL = exerciseName.toLowerCase();
  // Новичку показывать оба направления бессмысленно: ему нужна одна сторона,
  // а «сложнее» звучит как приглашение туда полезть. Уровень раньше приходил
  // в функцию и не использовался — ответ был одинаковым для первого месяца и
  // для десятого года.
  const level = (userLevel || '').toUpperCase();
  for (const [key, prog] of Object.entries(progressions)) {
    if (nameL.includes(key)) {
      if (level === 'BEGINNER') {
        return `${exerciseName}: если тяжело — ${prog.easier}. Усложнять рано: сначала техника и стабильный вес.`;
      }
      if (level === 'ADVANCED' || level === 'EXPERT') {
        return `${exerciseName}: сложнее → ${prog.harder} (облегчённый вариант — ${prog.easier}, для разгрузочных недель).`;
      }
      return `${exerciseName}: проще → ${prog.easier} | сложнее → ${prog.harder}`;
    }
  }

  return '';
}
export function rateWorkout(
  workout: {
    totalVolume: number | null;
    durationMinutes: number | null;
    exerciseCount: number;
    completedSets: number;
    totalSets: number;
    avgRpe: number;
  } | null,
): string {
  if (!workout || !workout.durationMinutes) return '';

  let score = 50; // base

  // Volume efficiency
  if (workout.totalVolume && workout.durationMinutes > 0) {
    const volPerMin = workout.totalVolume / workout.durationMinutes;
    if (volPerMin > 100) score += 15;
    else if (volPerMin > 50) score += 10;
    else if (volPerMin < 20) score -= 10;
  }

  // Completion rate
  const completionRate = workout.totalSets > 0 ? workout.completedSets / workout.totalSets : 1;
  if (completionRate >= 0.95) score += 15;
  else if (completionRate >= 0.8) score += 10;
  else if (completionRate < 0.6) score -= 15;

  // RPE sweet spot (6-8 is ideal for most)
  if (workout.avgRpe >= 6 && workout.avgRpe <= 8) score += 10;
  else if (workout.avgRpe > 9) score -= 5;

  // Duration (30-75 min optimal)
  if (workout.durationMinutes >= 30 && workout.durationMinutes <= 75) score += 10;
  else if (workout.durationMinutes > 120) score -= 10;

  // Exercise variety
  if (workout.exerciseCount >= 4 && workout.exerciseCount <= 8) score += 5;

  score = Math.max(0, Math.min(100, score));
  const rating = score >= 80 ? '⭐⭐⭐⭐⭐' : score >= 65 ? '⭐⭐⭐⭐' : score >= 50 ? '⭐⭐⭐' : score >= 35 ? '⭐⭐' : '⭐';

  return `\n\n## 📊 ОЦЕНКА ПОСЛЕДНЕЙ ТРЕНИРОВКИ: ${rating} (${score}/100)
${score >= 80 ? 'Отличная тренировка!' : score >= 50 ? 'Хорошая тренировка, есть куда расти.' : 'Можно лучше — проверь объём и завершённость подходов.'}
${completionRate < 0.8 ? `Завершено подходов: ${Math.round(completionRate * 100)}% — попробуй снизить веса.` : ''}`;
}
export function advisePeriodizationPhase(
  weeksSinceStart: number,
  currentPhase: string | null,
  recentPerformanceTrend: 'improving' | 'stagnating' | 'declining',
): string {
  if (weeksSinceStart < 4) return '';

  let nextPhase: string;
  let reason: string;

  if (recentPerformanceTrend === 'declining') {
    nextPhase = 'Разгрузка (1 неделя)';
    reason = 'Спад результатов — нужен отдых для суперкомпенсации.';
  } else if (recentPerformanceTrend === 'stagnating') {
    if (currentPhase === 'accumulation' || !currentPhase) {
      nextPhase = 'Интенсификация (3-4 недели)';
      reason = 'Стагнация в объёмной фазе — пора увеличивать интенсивность.';
    } else {
      nextPhase = 'Пиковая фаза (2 недели)';
      reason = 'Пора проверить новые максимумы.';
    }
  } else {
    if (weeksSinceStart % 12 < 4) {
      nextPhase = 'Накопление объёма (текущая)';
      reason = 'Прогресс идёт — продолжай в том же духе.';
    } else if (weeksSinceStart % 12 < 8) {
      nextPhase = 'Интенсификация (текущая)';
      reason = 'Время повышать веса и снижать объём.';
    } else {
      nextPhase = 'Пиковая фаза';
      reason = 'Финальная фаза цикла — выход на максимумы.';
    }
  }

  return `\n\n## 📅 ФАЗА ПЕРИОДИЗАЦИИ
Текущая рекомендация: ${nextPhase}
Причина: ${reason}
Предложи смену фазы если пользователь спрашивает о программе.`;
}
export function analyzeStrengthToWeight(
  bodyWeight: number | null,
  lifts: Record<string, number>, // exercise name -> best weight
  gender: string | null,
): string {
  if (!bodyWeight || bodyWeight <= 0) return '';

  const ratios: string[] = [];
  const standards: Record<string, Record<string, number[]>> = {
    // [novice, intermediate, advanced, elite] multiples of bodyweight
    'жим лёжа': { male: [0.5, 1.0, 1.5, 2.0], female: [0.3, 0.6, 1.0, 1.3] },
    'присед': { male: [0.75, 1.25, 1.75, 2.5], female: [0.5, 0.8, 1.25, 1.75] },
    'становая тяга': { male: [1.0, 1.5, 2.25, 3.0], female: [0.75, 1.0, 1.75, 2.25] },
    'жим стоя': { male: [0.35, 0.65, 1.0, 1.35], female: [0.2, 0.4, 0.65, 0.85] },
  };

  const genderKey = gender?.toLowerCase() === 'female' ? 'female' : 'male';

  for (const [lift, weight] of Object.entries(lifts)) {
    const liftL = lift.toLowerCase();
    for (const [key, std] of Object.entries(standards)) {
      if (liftL.includes(key)) {
        const ratio = weight / bodyWeight;
        const levelStd = std[genderKey];
        const level = ratio < levelStd[0] ? 'ниже новичка' :
                      ratio < levelStd[1] ? 'новичок' :
                      ratio < levelStd[2] ? 'средний' :
                      ratio < levelStd[3] ? 'продвинутый' : 'элита';
        ratios.push(`${key}: ${weight}кг = ${ratio.toFixed(2)}× вес тела → уровень: **${level}**`);
        break;
      }
    }
  }

  if (ratios.length === 0) return '';

  return `\n\n## ⚖️ СИЛА ОТНОСИТЕЛЬНО ВЕСА ТЕЛА
${ratios.join('\n')}
Используй для мотивации и постановки целей.`;
}
export function optimizeTrainingSplit(
  daysPerWeek: number,
  goal: string | null,
  experience: string | null,
): string {
  if (!daysPerWeek || daysPerWeek < 2) return '';

  const splits: Record<number, Record<string, string>> = {
    2: {
      any: 'Full Body × 2 — лучший выбор при 2 днях. A: грудь/спина/плечи, B: ноги/бицепс/трицепс',
    },
    3: {
      beginner: 'Full Body × 3 (пн/ср/пт) — оптимально для начинающих. Каждое упражнение 3×/нед',
      intermediate: 'Push/Pull/Legs (PPL) — 3 дня. Push: грудь/плечи/трицепс, Pull: спина/бицепс, Legs: ноги',
      advanced: 'Upper/Lower × 3 — 2× верх + 1× низ или ротация',
    },
    4: {
      any: 'Upper/Lower × 4 (пн/вт/чт/пт) — 2× верх + 2× низ. Лучший баланс частоты и восстановления',
    },
    5: {
      any: 'PPL + Upper/Lower — чередование. Или 5-дневный сплит: грудь/спина/плечи/ноги/руки',
    },
    6: {
      any: 'PPL × 2 (Push A/Pull A/Legs A → Push B/Pull B/Legs B) — продвинутый вариант',
    },
  };

  const dayData = splits[Math.min(daysPerWeek, 6)] || splits[3];
  const split = dayData[experience || 'intermediate'] || dayData['any'] || dayData['beginner'] || Object.values(dayData)[0];

  // Одна и та же схема дней работает на разные цели по-разному, а цель
  // приходила в функцию и не использовалась — обоснование было дословно
  // одинаковым и для похудения, и для силы.
  const rationale = {
    STRENGTH: 'Обоснование: под силу в каждом дне первым идёт одно базовое движение в малом числе повторов, остальное — подсобка.',
    MUSCLE_GAIN: 'Обоснование: под массу важнее суммарный недельный объём на группу, поэтому каждую мышцу лучше нагружать дважды за неделю.',
    WEIGHT_LOSS: 'Обоснование: на дефиците силовые дни держат мышцы, а кардио лучше ставить отдельно или после штанги, а не вместо неё.',
    ENDURANCE: 'Обоснование: под выносливость силовые дни короче и служат профилактикой травм — основной объём остаётся в кардио.',
    muscle_gain: 'Обоснование: под массу важнее суммарный недельный объём на группу, поэтому каждую мышцу лучше нагружать дважды за неделю.',
    weight_loss: 'Обоснование: на дефиците силовые дни держат мышцы, а кардио лучше ставить отдельно или после штанги, а не вместо неё.',
  }[String(goal || '')] || 'Обоснование: высокая частота стимуляции мышц при достаточном восстановлении.';

  return `\n\n## 📅 ОПТИМАЛЬНЫЙ СПЛИТ (${daysPerWeek} дн/нед)
${split}
${rationale}`;
}
export function detectTrainingPhaseAdvanced(
  weeksSinceStart: number,
  avgRPE: number | null,
  completionRate: number,
): string {
  if (weeksSinceStart < 2) {
    return `\n\n## 🗓️ ФАЗА ТРЕНИРОВОК: Адаптация (Неделя ${weeksSinceStart + 1})
Ты в начале пути. Фокус: техника, связь мозг-мышца, привычка. Не гонись за весами.`;
  }

  if (avgRPE !== null && avgRPE > 8.5 && completionRate < 0.8) {
    return `\n\n## 🗓️ ФАЗА ТРЕНИРОВОК: Перегрузка
Высокий RPE + низкое завершение → сигнал усталости. Рассмотри deload на следующей неделе.`;
  }

  if (weeksSinceStart % 4 === 3) {
    return `\n\n## 🗓️ ФАЗА ТРЕНИРОВОК: Разгрузочная неделя
Снизь объём на 40-50%, сохрани интенсивность. Восстановление = прогресс.`;
  }

  const phases = ['Накопление объёма', 'Интенсификация', 'Пик силы'];
  const phase = phases[weeksSinceStart % 3] || phases[0];

  return `\n\n## 🗓️ ФАЗА ТРЕНИРОВОК: ${phase} (Неделя ${weeksSinceStart + 1})
${phase === 'Накопление объёма' ? 'Больше объёма, умеренная интенсивность (70-75% 1ПМ)' :
  phase === 'Интенсификация' ? 'Меньше объёма, выше интенсивность (80-85% 1ПМ)' :
  'Максимальная интенсивность (85-95% 1ПМ), минимальный объём'}`;
}
export function suggestWorkoutTemplate(
  availableMinutes: number,
  targetMuscles: string[],
  equipment: string,
): string {
  if (availableMinutes <= 0) return '';

  let template: string;

  if (availableMinutes <= 20) {
    template = `Экспресс (20 мин): 3 упражнения × 3 подхода по 45 сек работы / 15 сек отдых. HIIT-формат.
Пример: приседания с весом → отжимания → тяга верхнего блока`;
  } else if (availableMinutes <= 40) {
    template = `Короткая (40 мин): 5-6 упражнений × 3 подхода, отдых 60 сек.
Выбирай базовые многосуставные: жим + тяга + ноги.`;
  } else if (availableMinutes <= 60) {
    template = `Стандартная (60 мин): 6-8 упражнений × 3-4 подхода, отдых 90 сек.
Формула: 2 базовых + 3-4 изолирующих + кардио-финиш.`;
  } else {
    template = `Расширенная (${availableMinutes} мин): полный сплит, 8-10 упражнений.
Можно добавить разминку, растяжку, дополнительные изолирующие.`;
  }

  // Шаблон был про одно время и ни про что больше: и мышцы, и доступный
  // инвентарь приходили в функцию и не использовались. Человек спрашивал
  // «40 минут, только гантели, спина», а получал «жим + тяга + ноги».
  const muscleLine = targetMuscles.length > 0
    ? `\nПод ${targetMuscles.join(', ')}: первыми ставь базовые движения именно на эти группы, изоляцию — в конец.`
    : '';

  const eq = (equipment || '').toLowerCase();
  const equipLine =
    /дом|home|нет|без|bodyweight|собствен/.test(eq)
      ? '\nБез инвентаря: замени штангу на односторонние и статические варианты — отжимания в упоре, выпады, ягодичный мостик, планка. Нагрузку добавляй темпом и паузами, а не весом.'
      : /гантел|dumbbell/.test(eq)
        ? '\nТолько гантели: базу собирай из жима и тяги гантелей, приседа-гоблет и румынской тяги. Отсутствие штанги не мешает — мешает отсутствие прогрессии.'
        : /резин|band|эспандер/.test(eq)
          ? '\nРезины: нагрузка растёт к концу амплитуды, поэтому бери больше повторов и следи за натяжением в начальной точке.'
          : eq
            ? `\nИнвентарь: ${equipment} — подбирай упражнения под то, что есть, не предлагай недоступное.`
            : '';

  return `\n\n## ⏱️ ШАБЛОН ПОД ${availableMinutes} МИНУТ
${template}${muscleLine}${equipLine}`;
}
export function rankExercisesByGoal(
  goal: string | null,
  availableExercises: string[],
): string {
  if (!goal || availableExercises.length === 0) return '';

  const priorities: Record<string, string[]> = {
    weight_loss: ['кардио', 'суперсет', 'круговая', 'бёрпи', 'прыжк', 'HIIT', 'выпад', 'приседан'],
    muscle_gain: ['жим', 'присед', 'становая', 'тяга', 'жим стоя', 'подтягиван', 'брусья'],
    endurance: ['бег', 'велосипед', 'гребля', 'плавание', 'кардио', 'трастер'],
    strength: ['присед', 'становая', 'жим лёжа', 'жим стоя', 'рывок', 'толчок'],
  };

  const prio = priorities[goal] || priorities['muscle_gain'];

  const ranked = availableExercises.filter(ex =>
    prio.some(p => ex.toLowerCase().includes(p)),
  ).slice(0, 3);

  if (ranked.length === 0) return '';

  const goalName = goal === 'weight_loss' ? 'похудение' :
    goal === 'muscle_gain' ? 'набор мышц' :
    goal === 'endurance' ? 'выносливость' : 'сила';

  return `\n\n## 🎯 ПРИОРИТЕТНЫЕ УПРАЖНЕНИЯ ДЛЯ ЦЕЛИ: ${goalName}
${ranked.map((e, i) => `${i + 1}. ${e}`).join('\n')}
Рекомендуй их в первую очередь при составлении тренировки.`;
}
export function getWorkoutTimingInsight(
  workoutHours: number[], // hours of day (0-23) from recent workouts
  goal: string | null,
): string {
  if (workoutHours.length < 3) return '';

  const avgHour = Math.round(workoutHours.reduce((a, b) => a + b, 0) / workoutHours.length);
  const period = avgHour < 10 ? 'утро' : avgHour < 14 ? 'день' : avgHour < 19 ? 'вечер' : 'ночь';

  const advice: Record<string, string> = {
    'утро': 'Утренние тренировки повышают метаболизм на весь день и улучшают дисциплину. Не забывай поесть за 30-60 мин до тренировки.',
    'день': 'Дневные тренировки приходятся на пик температуры тела и силовых показателей. Хорошее время для максимальных весов.',
    'вечер': 'Вечерние тренировки: сила и выносливость на пике. Старайся закончить за 2-3 часа до сна для качественного восстановления.',
    'ночь': 'Поздние тренировки могут нарушать сон. Если чувствуешь проблемы со сном — сдвинь тренировку раньше.',
  };

  // Время суток значит разное в зависимости от цели, а цель приходила сюда и
  // не использовалась: совет про утро был один и тот же и для похудения, и
  // для силовых рекордов.
  const goalTiming = {
    STRENGTH: period === 'утро'
      ? 'Для силы утро — худшее время: пик силовых приходится на вторую половину дня. Если рекорд важен, ставь тяжёлые подходы на вечер, а утром работай в лёгком объёме.'
      : 'Для силы это удачное время — температура тела и нервная система на пике.',
    WEIGHT_LOSS: 'Для похудения время не решает: решает суточный дефицит. Тренируйся тогда, когда получится делать это регулярно.',
    MUSCLE_GAIN: 'Для массы важнее не время, а чтобы в предыдущие 2-3 часа была еда — иначе объём вытянуть тяжело.',
    ENDURANCE: period === 'утро'
      ? 'Для выносливости утро подходит хорошо, но длинные объёмы натощак не бери — только лёгкие.'
      : 'Для выносливости это нормальное время; следи, чтобы длинные тренировки не приходились на жару.',
  }[String(goal || '')];

  return `\n\n## 🕐 ТВОЁ ВРЕМЯ ТРЕНИРОВОК: ${period} (~${avgHour}:00)
${advice[period]}${goalTiming ? `\n${goalTiming}` : ''}`;
}
export function suggestWeightProgression(
  exerciseName: string,
  currentWeight: number,
  currentReps: number,
  goal: string | null,
): string {
  if (!exerciseName || !currentWeight || !currentReps) return '';

  let nextWeight: number;
  let nextReps: number;
  let strategy: string;

  const isCompound = /присед|жим|становая|тяга|подтягиван/i.test(exerciseName);

  if (goal === 'strength') {
    // Linear progression
    nextWeight = currentWeight + (isCompound ? 2.5 : 1.25);
    nextReps = currentReps;
    strategy = 'Линейная прогрессия: добавляй вес каждую тренировку';
  } else if (goal === 'muscle_gain') {
    // Double progression
    if (currentReps < 12) {
      nextWeight = currentWeight;
      nextReps = currentReps + 1;
      strategy = 'Двойная прогрессия: сначала добери до 12 повт, потом добавь вес';
    } else {
      nextWeight = currentWeight + (isCompound ? 2.5 : 1.25);
      nextReps = 8;
      strategy = 'Добавь вес, вернись к 8 повторениям';
    }
  } else {
    nextWeight = currentWeight;
    nextReps = Math.min(currentReps + 2, 20);
    strategy = 'Увеличивай повторения для выносливости';
  }

  return `\n\n## 📈 ПРОГРЕССИЯ: ${exerciseName}
Сейчас: ${currentWeight}кг × ${currentReps} повт
Следующий шаг: ${nextWeight}кг × ${nextReps} повт
Стратегия: ${strategy}`;
}
export function recommendSupersets(
  exerciseNames: string[],
  availableMinutes: number,
): string {
  if (exerciseNames.length < 2) return '';

  const supersetPairs: Array<{ a: string; b: string; benefit: string }> = [
    { a: 'жим лёжа', b: 'тяга штанги', benefit: 'классический Push+Pull суперсет — экономит время, не снижает силу' },
    { a: 'присед', b: 'жим стоя', benefit: 'ноги + верх — нет конкуренции за одни мышцы' },
    { a: 'бицепс', b: 'трицепс', benefit: 'антагонисты — суперсет ускоряет восстановление между подходами' },
    { a: 'жим гантелей', b: 'тяга гантели', benefit: 'грудь + спина — популярный суперсет в тренажёрном зале' },
    { a: 'разгибание', b: 'сгибание', benefit: 'сгибатели + разгибатели — эффективная пара для рук' },
  ];

  const recommended: string[] = [];
  for (const pair of supersetPairs) {
    const hasA = exerciseNames.some(e => e.toLowerCase().includes(pair.a));
    const hasB = exerciseNames.some(e => e.toLowerCase().includes(pair.b));
    if (hasA && hasB) {
      recommended.push(`• ${pair.a} + ${pair.b} — ${pair.benefit}`);
    }
  }

  if (recommended.length === 0 && availableMinutes <= 45) {
    return `\n\n## ⚡ СУПЕРСЕТЫ (экономия времени)
При ${availableMinutes} мин объедини упражнения на антагонисты в суперсеты: бицепс+трицепс, грудь+спина. Сэкономишь 20-30% времени без потери эффекта.`;
  }

  if (recommended.length === 0) return '';

  return `\n\n## ⚡ СУПЕРСЕТЫ ДЛЯ ТВОЕЙ ТРЕНИРОВКИ
${recommended.join('\n')}
Выполняй без отдыха между A и B, отдыхай после пары.`;
}
export function getAgeAdjustedStrengthStandards(
  ageYears: number | null,
  bodyWeightKg: number | null,
  gender: string | null,
): string {
  if (!ageYears || !bodyWeightKg) return '';

  // Age factor (peak strength 25-35, then decline ~1%/year)
  const ageFactor = ageYears < 25 ? 0.85 : ageYears <= 35 ? 1.0 : Math.max(0.6, 1.0 - (ageYears - 35) * 0.01);

  const genderKey = gender?.toLowerCase() === 'female' ? 'female' : 'male';
  const baseMultipliers: Record<string, Record<string, number>> = {
    male: { bench: 1.0, squat: 1.5, deadlift: 1.75 },
    female: { bench: 0.65, squat: 1.0, deadlift: 1.25 },
  };

  const base = baseMultipliers[genderKey];
  const bench = Math.round(bodyWeightKg * base.bench * ageFactor);
  const squat = Math.round(bodyWeightKg * base.squat * ageFactor);
  const dead = Math.round(bodyWeightKg * base.deadlift * ageFactor);

  return `\n\n## 📊 НОРМАТИВЫ ДЛЯ ТВОЕГО ВОЗРАСТА (${ageYears} лет, ${bodyWeightKg}кг)
Жим лёжа: >${bench}кг — средний уровень
Присед: >${squat}кг — средний уровень
Становая: >${dead}кг — средний уровень
${ageYears > 40 ? 'После 40: акцент на технику, мобильность и здоровье суставов.' : ''}`;
}
export function suggestProgramAdjustments(
  completionRate: number,
  avgRPE: number | null,
  weeklyVolumeChange: number, // percentage change vs last week
  goal: string | null,
): string {
  const adjustments: string[] = [];

  if (completionRate > 0.95 && (avgRPE === null || avgRPE < 7)) {
    adjustments.push('📈 Программа слишком лёгкая: добавь 1 подход или увеличь вес на 5%');
  }

  if (completionRate < 0.65) {
    adjustments.push('📉 Программа слишком тяжёлая: убери 1 подход или снизь вес на 10%');
  }

  if (weeklyVolumeChange > 20) {
    adjustments.push('⚠️ Объём вырос слишком резко (+20%): риск перетренированности. Держи прирост ≤10%/нед');
  }

  if (weeklyVolumeChange < -30 && completionRate < 0.75) {
    adjustments.push('⚠️ Объём и выполнение упали: возможная перетренированность. Рассмотри deload');
  }

  if (avgRPE !== null && avgRPE > 9 && goal !== 'strength') {
    adjustments.push('⚠️ Средний RPE > 9: работаешь на пределе каждый раз. Для гипертрофии лучше 7-8');
  }

  if (adjustments.length === 0) return '';

  return `\n\n## 🔧 РЕКОМЕНДАЦИИ ПО ПРОГРАММЕ
${adjustments.join('\n')}`;
}
export function scoreTrainingConsistency(
  plannedDaysPerWeek: number,
  actualDaysThisWeek: number,
  streak: number,
  totalWorkouts: number,
): string {
  if (plannedDaysPerWeek === 0 || totalWorkouts < 3) return '';

  const weekScore = Math.round((actualDaysThisWeek / plannedDaysPerWeek) * 100);
  const grade = weekScore >= 90 ? 'A' : weekScore >= 70 ? 'B' : weekScore >= 50 ? 'C' : 'D';
  const emoji = weekScore >= 90 ? '🟢' : weekScore >= 70 ? '🟡' : weekScore >= 50 ? '🟠' : '🔴';

  const feedback = weekScore >= 90
    ? 'Отлично! Высокая регулярность → предсказуемый прогресс.'
    : weekScore >= 70
    ? 'Хорошо. Немного не дотянул до плана — попробуй следующую неделю добраться до цели.'
    : weekScore >= 50
    ? 'Регулярность ниже плана. Определи что мешает и скорректируй расписание.'
    : 'Низкая регулярность. Может программа слишком амбициозна? Попробуй снизить до 2-3 дней/нед.';

  return `\n\n## 📋 РЕГУЛЯРНОСТЬ ТРЕНИРОВОК
${emoji} Оценка недели: ${grade} (${weekScore}%) | Серия: ${streak} дней | Всего: ${totalWorkouts}
${feedback}`;
}
export function buildPersonalizedWarmup(
  targetMuscles: string[],
  ageYears: number | null,
  injuryZones: string[],
  daysSinceLastWorkout: number,
): string {
  if (targetMuscles.length === 0) return '';

  const warmupTime = ageYears && ageYears > 40 ? 10 : daysSinceLastWorkout > 2 ? 8 : 5;
  const exercises: string[] = [];

  // General warm-up
  exercises.push(`${warmupTime} мин лёгкое кардио (велосипед/беговая) или ходьба`);

  // Muscle-specific
  const muscleWarmups: Record<string, string> = {
    chest: 'Вращение плечами × 20, отжимания с широкой постановкой × 15 (пустой вес)',
    back: 'Кошка-корова × 10, тяга резинки или блока × 20 (лёгкий вес)',
    legs: 'Приседания с весом тела × 20, выпады × 10/ногу, вращение колен',
    shoulders: 'Вращение плечами, поднятие рук над головой, тяга резинки к подбородку × 20',
    core: 'Кошка-корова × 10, мёртвый жук × 10, планка 30с',
  };

  for (const muscle of targetMuscles.slice(0, 2)) {
    const warmup = muscleWarmups[muscle.toLowerCase()];
    if (warmup) exercises.push(warmup);
  }

  // Injury-specific additions
  if (injuryZones.includes('knee') || injuryZones.includes('колен')) {
    exercises.push('Для колен: разогрев квадрицепса, ягодичный мостик × 20');
  }
  if (injuryZones.includes('back') || injuryZones.includes('спин')) {
    exercises.push('Для спины: кошка-корова расширенная × 15, МакГилл большая тройка');
  }

  return `\n\n## 🔥 ПЕРСОНАЛЬНАЯ РАЗМИНКА (${warmupTime}+ мин)
${exercises.map((e, i) => `${i + 1}. ${e}`).join('\n')}
${daysSinceLastWorkout > 3 ? '⚠️ Давно не тренировался — уделяй разминке больше времени.' : ''}`;
}
export function trackProgressiveOverloadTrend(
  recentSets: Array<{
    exercise: string;
    weight: number;
    reps: number;
    date: Date;
  }>,
): string {
  if (recentSets.length < 4) return '';

  // Group by exercise
  const byExercise: Record<string, Array<{ weight: number; reps: number; date: Date }>> = {};
  for (const s of recentSets) {
    if (!byExercise[s.exercise]) byExercise[s.exercise] = [];
    byExercise[s.exercise].push({ weight: s.weight, reps: s.reps, date: s.date });
  }

  const trends: string[] = [];

  for (const [exercise, sets] of Object.entries(byExercise)) {
    if (sets.length < 2) continue;
    const sorted = sets.sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const volumeFirst = first.weight * first.reps;
    const volumeLast = last.weight * last.reps;
    const change = Math.round(((volumeLast - volumeFirst) / volumeFirst) * 100);

    if (Math.abs(change) > 5) {
      const trend = change > 0 ? `📈 +${change}%` : `📉 ${change}%`;
      trends.push(`${exercise}: ${first.weight}×${first.reps} → ${last.weight}×${last.reps} (${trend})`);
    }
  }

  if (trends.length === 0) return '';

  return `\n\n## 📊 ПРОГРЕССИВНАЯ ПЕРЕГРУЗКА
${trends.slice(0, 3).join('\n')}
Прогресс есть — продолжай!`;
}
export function optimizeExerciseOrder(exercises: string[]): string {
  if (exercises.length < 2) return '';

  const compoundKeywords = ['жим', 'присед', 'становая', 'тяга', 'жим стоя', 'подтягиван', 'брусья'];
  const isolationKeywords = ['бицепс', 'трицепс', 'подъём', 'разведение', 'сгибание', 'разгибание'];
  const coreKeywords = ['пресс', 'планка', 'скручиван', 'подъём ног'];

  const groups: Record<string, string[]> = { compound: [], isolation: [], core: [], other: [] };

  for (const ex of exercises) {
    const exL = ex.toLowerCase();
    if (compoundKeywords.some(k => exL.includes(k))) groups.compound.push(ex);
    else if (isolationKeywords.some(k => exL.includes(k))) groups.isolation.push(ex);
    else if (coreKeywords.some(k => exL.includes(k))) groups.core.push(ex);
    else groups.other.push(ex);
  }

  const optimal = [...groups.compound, ...groups.other, ...groups.isolation, ...groups.core];

  if (JSON.stringify(optimal) === JSON.stringify(exercises)) return '';

  return `\n\n## 🔢 ОПТИМАЛЬНЫЙ ПОРЯДОК УПРАЖНЕНИЙ
Рекомендую: ${optimal.join(' → ')}
Принцип: базовые сначала → изолирующие потом → пресс в конце.`;
}
export function checkTechniqueIssues(message: string): string {
  const issues: Array<{ trigger: RegExp; advice: string }> = [
    {
      trigger: /колен.*(боль|болит|тянет)|боль.*колен/i,
      advice: `Боль в коленях при приседе:
• Колени уходят внутрь → слабые ягодицы, тренируй ягодичные отдельно
• Колени выходят за носки → смести вес на пятки, расставь шире
• Снизь глубину до уровня комфорта, постепенно увеличивай`,
    },
    {
      trigger: /поясниц.*(боль|болит)|боль.*поясниц/i,
      advice: `Боль в пояснице:
• Округление поясницы → снизь вес, работай над гибкостью
• Гиперэкстензия (прогиб назад) → нейтральная спина, напряги кор
• Если острая — СТОП. Обратись к врачу.`,
    },
    {
      trigger: /плечо.*(боль|болит|щёлк|хруст)|боль.*плеч/i,
      advice: `Боль в плечах при жиме:
• Локти слишком разведены (90°) → опусти до 45-60°
• Нет ретракции лопаток → сводить лопатки перед подъёмом
• Смени хват на более узкий`,
    },
  ];

  const triggered = issues.filter(i => i.trigger.test(message));
  if (triggered.length === 0) return '';

  return `\n\n## 🩺 ТЕХНИКА И БОЛЬ
${triggered.map(t => t.advice).join('\n\n')}
Если боль острая или не проходит — обратись к врачу.`;
}
export function setMicroGoals(
  lastWorkoutExercises: Array<{ name: string; weight: number; reps: number; sets: number }>,
  goal: string | null,
): string {
  if (lastWorkoutExercises.length === 0) return '';

  const microGoals: string[] = [];

  for (const ex of lastWorkoutExercises.slice(0, 3)) {
    if (goal === 'strength') {
      microGoals.push(`${ex.name}: попробуй ${ex.weight + 2.5}кг × ${ex.reps}`);
    } else if (goal === 'muscle_gain') {
      if (ex.reps < 12) {
        microGoals.push(`${ex.name}: добавь 1 повторение → ${ex.weight}кг × ${ex.reps + 1}`);
      } else {
        microGoals.push(`${ex.name}: увеличь вес → ${ex.weight + 2.5}кг × 8`);
      }
    } else {
      microGoals.push(`${ex.name}: сохрани прошлый результат (${ex.weight}кг × ${ex.reps})`);
    }
  }

  return `\n\n## 🎯 МИКРОЦЕЛИ НА СЛЕДУЮЩУЮ ТРЕНИРОВКУ
${microGoals.join('\n')}
Маленький прогресс каждую тренировку → большой результат через месяц.`;
}
export function educateAboutRPE(
  message: string,
  hasUsedRPE: boolean,
): string {
  const rpeQuestion = /рпе|rpe|рир|rir|запас|до отказа|насколько тяжело/i;
  if (!rpeQuestion.test(message) && hasUsedRPE) return '';
  if (!rpeQuestion.test(message)) return '';

  return `\n\n## 📊 ШКАЛА RPE (Rate of Perceived Exertion)
RPE 6 — очень легко, можно говорить спокойно
RPE 7 — комфортно тяжело (3-4 повторения в запасе)
RPE 8 — тяжело (2 повторения в запасе) ← цель для гипертрофии
RPE 9 — очень тяжело (1 повторение в запасе) ← для силовой
RPE 10 — максимум, больше невозможно

RIR (Reps In Reserve) = сколько раз мог бы ещё повторить.
RPE 8 = RIR 2 (мог ещё 2 раза).
Цель: большинство рабочих подходов на RPE 7-9.`;
}
export function getTrainingAgeProtocol(
  weeksSinceStart: number,
  totalWorkouts: number,
): string {
  if (totalWorkouts < 5) return '';

  const months = Math.round(weeksSinceStart / 4.3);

  if (months < 3) {
    return `\n\n## 📅 ПРОТОКОЛ ДЛЯ НОВИЧКА (до 3 месяцев)
Фокус: техника + привычка. НЕ объём и НЕ интенсивность.
Программа: Full Body 3×/нед. Базовые упражнения. 3×8-12.
Прогрессия: линейная — каждую тренировку +2.5кг если технически.
Главная цель: приходить регулярно 6 месяцев подряд.`;
  }

  if (months < 12) {
    return `\n\n## 📅 ПРОТОКОЛ ДЛЯ НАЧИНАЮЩЕГО (3-12 месяцев)
Продолжай линейную прогрессию до её предела.
Добавляй 1 новое базовое упражнение каждые 2-3 месяца.
Начни отслеживать 1ПМ в главных лифтах.
Объём: 10-15 рабочих подходов на мышечную группу в неделю.`;
  }

  if (months < 36) {
    return `\n\n## 📅 ПРОТОКОЛ ДЛЯ СРЕДНЕГО (1-3 года)
Линейная прогрессия больше не работает — нужна периодизация.
Переходи на Upper/Lower или PPL сплит.
Начни использовать RPE/RIR для контроля интенсивности.
Фокус на отстающих мышечных группах.`;
  }

  return `\n\n## 📅 ПРОТОКОЛ ДЛЯ ПРОДВИНУТОГО (3+ лет)
Прогресс медленный — это норма. Тонкая настройка важна.
Необходима детальная периодизация (блоковая или сопряжённая).
Рассмотри работу с тренером для анализа техники.
Соревнования — хороший мотиватор на этом уровне.`;
}
export function compareToPopulationBenchmarks(exerciseName: string, weightKg: number, bodyWeightKg: number | null, gender: string | null): string {
  if (!exerciseName || !weightKg || !bodyWeightKg) return '';
  const bw = bodyWeightKg;
  const ratio = weightKg / bw;
  const isMale = gender !== 'female';

  const benchmarks: Record<string, { male: number[]; female: number[] }> = {
    'присед': { male: [0.75, 1.25, 1.5, 2.0], female: [0.5, 0.75, 1.0, 1.5] },
    'становая': { male: [1.0, 1.5, 2.0, 2.5], female: [0.75, 1.0, 1.5, 2.0] },
    'жим лёжа': { male: [0.5, 0.75, 1.25, 1.5], female: [0.35, 0.5, 0.75, 1.0] },
    'жим стоя': { male: [0.35, 0.55, 0.75, 1.0], female: [0.2, 0.35, 0.5, 0.7] },
  };

  const exLower = exerciseName.toLowerCase();
  const matchedKey = Object.keys(benchmarks).find(k => exLower.includes(k));
  if (!matchedKey) return '';

  const levels = isMale ? benchmarks[matchedKey].male : benchmarks[matchedKey].female;
  const labels = ['новичок', 'любитель', 'продвинутый', 'элита'];
  let level = 'начинающий';
  let percentile = '<25%';

  for (let i = levels.length - 1; i >= 0; i--) {
    if (ratio >= levels[i]) {
      level = labels[i];
      percentile = i === 0 ? '25-50%' : i === 1 ? '50-75%' : i === 2 ? '75-90%' : 'топ 10%';
      break;
    }
  }

  return `\n\n📊 Ваш результат в ${matchedKey} (${weightKg}кг при весе тела ${bw}кг = коэф. ${ratio.toFixed(2)}):
Уровень: **${level}** (${percentile} среди ${isMale ? 'мужчин' : 'женщин'})
${ratio >= levels[3] ? '🏆 Элитный уровень — вы в топе!' : ratio >= levels[2] ? '💪 Отличный результат!' : ratio >= levels[1] ? '👍 Хороший результат, есть куда расти' : '🎯 Продолжайте прогрессировать!'}`;
}
export function bustTrainingMonotony(exerciseNames: string[], weekCount: number): string {
  if (weekCount < 4 || !exerciseNames.length) return '';

  const coreExercises = ['приседания', 'становая', 'жим лёжа', 'тяга'];
  const usedCore = coreExercises.filter(ex => exerciseNames.some(e => e.toLowerCase().includes(ex)));

  if (usedCore.length >= 3 && weekCount >= 8) {
    return `\n\n🔄 Монотонность тренировок:
Вы используете одни и те же базовые упражнения ${weekCount} недель. Это хорошо для прогресса, но мозг и суставы нуждаются в разнообразии.

Варианты вариации без потери прогресса:
• Паузные повторения в нижней точке (приседания, жим)
• Темповые подходы (3 сек вниз, 1 сек наверх)
• Кластерные сеты (мини-отдыхи внутри подхода)
• Замена штанги гантелями на 2-3 недели
• Добавить 1 новое упражнение на отстающую группу`;
  }

  return '';
}
export function explainPeriodizationToUser(message: string, totalWorkoutsEver: number): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['периодизация', 'программа', 'план тренировок', 'прогресс застопорился', 'как построить'].some(kw => lowerMsg.includes(kw));

  if (!isRelevant || totalWorkoutsEver < 20) return '';

  const isBeginner = totalWorkoutsEver < 50;

  if (isBeginner) {
    return `\n\n📅 Периодизация для вашего уровня:
С вашим опытом (${totalWorkoutsEver} тренировок) лучший подход — **линейная периодизация**:
Неделя 1-3: 3x12 (лёгкий вес, освоение техники)
Неделя 4-6: 3x8 (средний вес)
Неделя 7-9: 4x5 (тяжёлый вес)
Неделя 10: разгрузка (2x12, 60% веса)
Затем повторить с новыми рабочими весами (+2.5-5кг).`;
  }

  return `\n\n📅 Волновая периодизация (для вашего уровня):
**Блок 1 (4 недели): Объём** — 4x10-12, ~70% от 1ПМ, отдых 90 сек
**Блок 2 (3 недели): Интенсивность** — 5x5, ~85% от 1ПМ, отдых 3-5 мин
**Блок 3 (2 недели): Пик** — 3x3, ~90-95% от 1ПМ, тест максимума
**Блок 4 (1 неделя): Deload** — 3x8, ~60% от 1ПМ
Этот цикл позволяет прогрессировать без выхода на плато.`;
}
export function generateWarmUpProtocol(exerciseNames: string[], fitnessLevel: string | null): string {
  if (!exerciseNames.length) return '';
  const isAdvanced = fitnessLevel === 'advanced';
  const hasSquat = exerciseNames.some(e => e.toLowerCase().includes('присед'));
  const hasDeadlift = exerciseNames.some(e => e.toLowerCase().includes('становая'));
  const hasBench = exerciseNames.some(e => e.toLowerCase().includes('жим лёжа') || e.toLowerCase().includes('жим штанги'));
  const hasPress = exerciseNames.some(e => e.toLowerCase().includes('жим стоя') || e.toLowerCase().includes('армейский'));

  const steps: string[] = ['5 мин лёгкое кардио (велосипед / ходьба)'];

  if (hasSquat) {
    steps.push('Приседания с весом тела: 2x15');
    steps.push('Мобилизация таза (круги): 10 в каждую сторону');
    if (isAdvanced) steps.push('Паузный присед 50% от рабочего: 1x5, 70%: 1x3, 85%: 1x2');
    else steps.push('Присед 50% от рабочего: 2x8');
  }
  if (hasDeadlift) {
    steps.push('Наклоны с собственным весом: 2x10');
    steps.push('Ягодичный мост: 2x15');
    if (isAdvanced) steps.push('Становая 50%: 1x5, 70%: 1x3');
    else steps.push('Становая 40-50% от рабочего: 2x6');
  }
  if (hasBench) {
    steps.push('Вращения в плечевом суставе: 2x10');
    steps.push('Жим пустым грифом: 1x15');
    if (isAdvanced) steps.push('Жим 50%: 1x8, 70%: 1x5, 85%: 1x3');
  }
  if (hasPress) {
    steps.push('Разминка плеч (боковые вращения): 2x12');
    steps.push('Жим пустым грифом стоя: 1x10');
  }

  return `\n\n🔥 Протокол разминки для сегодняшней тренировки:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n⏱ Общее время: ~10-12 мин`;
}
export function educateAboutTempo(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['темп', 'скорость повторений', '3-1-1', '4-0-1', 'медленно делать', 'быстро делать', 'тренировка темпа'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n⏱ Темп повторений — мощный, но недооценённый инструмент:

Запись темпа: **X-Y-Z** (эксцентрик-пауза-концентрик)
Например: **3-1-2** = 3 сек опускание, 1 сек пауза внизу, 2 сек подъём

**Для гипертрофии:** 3-1-2 или 4-0-1 (медленный эксцентрик = больше микроразрывов)
**Для силы:** 1-0-X (взрывной подъём, быстрый)
**Для контроля техники:** 4-2-2 (замедляет движение, выявляет слабые места)
**Для новичков:** 2-0-2 (базовый темп для освоения паттерна)

💡 Замедление эксцентрика на 2-4 сек = +20-30% к мышечной нагрузке без увеличения веса.`;
}
export function recommendTrainingSplit(daysPerWeek: number, goal: string | null, fitnessLevel: string | null): string {
  if (!daysPerWeek) return '';

  interface SplitOption { name: string; schedule: string; best: string }
  const splits: Record<number, SplitOption[]> = {
    2: [{ name: 'Full Body 2x', schedule: 'Пн + Чт', best: 'для поддержки формы или новичков' }],
    3: [
      { name: 'Full Body 3x', schedule: 'Пн/Ср/Пт', best: 'лучший вариант для новичков и набора силы' },
      { name: 'Push/Pull/Legs', schedule: 'Пн=Push, Ср=Pull, Пт=Legs', best: 'для среднего уровня' },
    ],
    4: [
      { name: 'Upper/Lower 4x', schedule: 'Пн=Верх, Вт=Низ, Чт=Верх, Пт=Низ', best: 'для гипертрофии и силы' },
      { name: 'Push/Pull/Legs + Full Body', schedule: 'Пн=Push, Вт=Pull, Чт=Legs, Сб=Full', best: 'продвинутый вариант' },
    ],
    5: [{ name: 'PPL + 2 Upper', schedule: 'Push/Pull/Legs/Upper/Upper', best: 'для акцента на верх тела' }],
    6: [{ name: 'PPLx2', schedule: 'Push/Pull/Legs/Push/Pull/Legs', best: 'для продвинутых с отличным восстановлением' }],
  };

  const options = splits[Math.min(daysPerWeek, 6)] ?? splits[3];
  // Варианты уже подписаны «для новичков» / «для среднего» / «для продвинутых»,
  // но выбор шёл только по цели — и новичок на четырёх днях получал вариант с
  // пометкой «продвинутый». Уровень приходил в функцию и не использовался.
  const level = (fitnessLevel || '').toLowerCase();
  const isBeginner = /beginner|новичок/.test(level);
  const isAdvanced = /advanced|expert|продвинут/.test(level);
  const beginnerOption = options.find((o) => /новичк|начинающ|поддержк/.test(o.best));
  const advancedOption = options.find((o) => /продвинут/.test(o.best));
  // Не на каждой частоте есть вариант с пометкой «для новичков» — на четырёх
  // днях их два, и один прямо помечен продвинутым. Тогда достаточно его не
  // выбирать: любой другой новичку подходит больше.
  const notAdvanced = options.find((o) => !/продвинут/.test(o.best));
  const goalFilter =
    isBeginner ? (beginnerOption ?? notAdvanced ?? options[0])
    : isAdvanced ? (advancedOption ?? options[options.length - 1])
    : goal === 'strength' ? options[0]
    : options[options.length - 1];

  return `\n\n📋 Рекомендуемый сплит для ${daysPerWeek} дней/неделю:
**${goalFilter.name}**
Расписание: ${goalFilter.schedule}
Подходит: ${goalFilter.best}`;
}
export function suggestAntiPlateauTechniques(message: string, weeksOnSameWeights: number): string {
  const lowerMsg = message.toLowerCase();
  const isPlateauMsg = ['плато', 'застрял', 'не растёт вес', 'давно не прогрессирую', 'не могу пробить'].some(kw => lowerMsg.includes(kw));
  if (!isPlateauMsg && weeksOnSameWeights < 3) return '';

  const techniques = [
    '**Микропрогрессия**: добавляйте 0.5-1кг вместо 2.5кг — многие залы имеют блины по 0.5кг',
    '**Пауза-повторения**: остановитесь на 2-3 сек в нижней точке — увеличит нагрузку без прибавки веса',
    '**Объёмный день**: один раз в неделю делайте больше подходов (5-6 вместо 3-4) с 80% веса',
    '**Нисходящие подходы (drop sets)**: после последнего рабочего снизьте вес на 20% и сделайте ещё 6-8 повторений',
    '**Кластерные подходы**: 10 повторений = 5+2 мини-паузы 10 сек + 5 — позволяет взять больший вес',
    '**Смена порядка упражнений**: начните тренировку с того, что раньше было вторым',
  ];

  return `\n\n🚧 Техники пробития плато:\n${techniques.map(t => `• ${t}`).join('\n')}`;
}
export function trackStrengthToWeight(bestLifts: Record<string, number>, bodyWeightKg: number | null): string {
  if (!Object.keys(bestLifts).length || !bodyWeightKg) return '';
  const bw = bodyWeightKg;
  const entries = Object.entries(bestLifts).slice(0, 4);
  const ratios = entries.map(([ex, w]) => `• ${ex}: ${w}кг = **${(w / bw).toFixed(2)}x** от веса тела`).join('\n');

  return `\n\n⚖️ Соотношение силы к весу тела (${bw}кг):\n${ratios}\n💡 Цель для среднего уровня: присед 1.5x, становая 2.0x, жим лёжа 1.25x от веса тела.`;
}
export function adviseVolumeProgression(weeklyVolumeCurrent: number, weeklyVolumePrev: number, goal: string | null): string {
  if (!weeklyVolumeCurrent || !weeklyVolumePrev) return '';
  const changePct = ((weeklyVolumeCurrent - weeklyVolumePrev) / (weeklyVolumePrev || 1)) * 100;

  if (changePct > 20) {
    return `\n\n📈 Предупреждение: объём тренировок вырос на ${Math.round(changePct)}% за неделю. Безопасный прирост — не более 10% в неделю. Резкий скачок увеличивает риск травм и перетренированности.`;
  }
  if (changePct < -30) {
    // На дефиците падение объёма — ожидаемое явление, а не тревожный знак.
    // Цель приходила в функцию и не использовалась, так что худеющему
    // советовали «проверить мотивацию» за то, что происходит само собой.
    const cutting = goal === 'WEIGHT_LOSS' || goal === 'weight_loss' || goal === 'cutting';
    return cutting
      ? `\n\n📉 Объём снизился на ${Math.round(Math.abs(changePct))}%. На дефиците это нормально — сил меньше. Важно не удержать объём, а удержать рабочие веса: именно они показывают, что уходит жир, а не мышцы.`
      : `\n\n📉 Объём снизился на ${Math.round(Math.abs(changePct))}%. Если это не запланированная разгрузка — проверьте восстановление и мотивацию.`;
  }
  if (changePct >= 5 && changePct <= 10) {
    const massing = goal === 'MUSCLE_GAIN' || goal === 'muscle_gain' || goal === 'hypertrophy';
    return massing
      ? `\n\n📈 Объём растёт оптимально (+${Math.round(changePct)}%/неделю) — для набора это и есть главный двигатель роста.`
      : `\n\n📈 Объём растёт оптимально (+${Math.round(changePct)}%/неделю) — отличная прогрессия нагрузки!`;
  }

  return '';
}
export function adviseCompetitionPrep(message: string, totalWorkoutsEver: number): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['соревнования', 'турнир', 'выступление', 'пауэрлифтинг', 'бодибилдинг', 'подготовка к старту'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const isExperienced = totalWorkoutsEver > 100;

  return `\n\n🏆 Подготовка к соревнованиям:

**За 4 недели до старта:**
• Прекратите добавлять новые упражнения — только проверенные
• Начните снижать объём (−20%/неделю), сохраняя интенсивность

**За 1 неделю:**
• Deload: 50% объёма, те же веса
• Углеводная загрузка (при силовых видах): +30% углеводов за 3-4 дня до старта
• Нормализуйте сон: 8-9 часов

**За 1 день:**
• Лёгкая активация, никаких тяжёлых подходов
• Привычное питание, никакой экзотики
• Проверьте экипировку заранее

${isExperienced ? '💡 Ваш опыт позволяет работать с 90-95% от максимума на пике формы.' : '💡 Для первого выступления: цель — выступить чисто, не максимализировать результат.'}`;
}
export function adviseGutHealthForPerformance(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['кишечник', 'пробиотики', 'переваривание', 'вздутие', 'желудок', 'микробиом', 'дискомфорт после еды'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n🦠 Здоровье кишечника и спортивные результаты:

Микробиом влияет на:
• Усвоение питательных веществ (до ±40% от одной и той же пищи)
• Уровень воспаления и скорость восстановления
• Синтез нейромедиаторов (серотонин — настроение, мотивация)

**Что улучшает микробиом спортсмена:**
• Пробиотики: Lactobacillus + Bifidobacterium — снижают DOMS на 20%
• Ферментированные продукты: кефир, квашеная капуста, йогурт с живыми культурами
• Клетчатка: 25-35г/день (овощи, бобовые, цельные злаки)
• Омега-3: уменьшает кишечное воспаление

**Что разрушает:**
• Антибиотики (восстановление микробиома — 1-6 месяцев)
• Чрезмерный алкоголь
• Хронический стресс (кортизол меняет состав микробиома за 72 часа)`;
}
export function guideIntraWorkoutFuel(workoutDurationMinutes: number, goal: string | null, message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['во время тренировки', 'есть во время', 'пить во время', 'между подходами'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant && workoutDurationMinutes < 75) return '';

  if (workoutDurationMinutes < 60) return '';

  const needsFuel = workoutDurationMinutes >= 75;

  // Блок уже знал, что совет разный при наборе и при похудении, но выдавал обе
  // строки всем: цель приходила в функцию и не использовалась. Человек читал
  // два взаимоисключающих указания и выбирал сам.
  const cutting = goal === 'WEIGHT_LOSS' || goal === 'weight_loss' || goal === 'cutting';
  const massing = goal === 'MUSCLE_GAIN' || goal === 'muscle_gain' || goal === 'hypertrophy';
  const goalFuel = cutting
    ? '• На дефиците: достаточно воды + BCAA 5-10г — калорий нет, катаболизм придержат.'
    : massing
      ? '• На наборе: 15-20г простых углеводов каждые 45-60 мин поддерживают анаболизм.'
      : '• На наборе — 15-20г простых углеводов; на дефиците — вода + BCAA 5-10г.';

  return `\n\n⚡ Топливо во время тренировки (${workoutDurationMinutes} мин):
${needsFuel
  ? `Тренировка >75 мин — дозаправка необходима:
• Каждые 45-60 мин: 20-30г быстрых углеводов (банан, спортивный гель, изотоник)
${goalFuel}`
  : `Тренировка 60-75 мин: достаточно воды. Еда не нужна.`}`;
}
export function explainExerciseAnatomy(message: string): string {
  const lowerMsg = message.toLowerCase();

  const exercises: Record<string, { primary: string; secondary: string; tip: string }> = {
    'присед': {
      primary: 'квадрицепс (70%), ягодицы (20%)',
      secondary: 'бицепс бедра, кор, поясница, икры',
      tip: 'Чем шире стойка — больше ягодицы. Уже — больше квадрицепс.',
    },
    'становая': {
      primary: 'бицепс бедра (40%), ягодицы (30%)',
      secondary: 'выпрямители спины, трапеция, предплечья',
      tip: 'Румынская становая — акцент на бицепс бедра. Классика — равномерно.',
    },
    'жим лёжа': {
      primary: 'грудные большие (60%), трицепс (25%)',
      secondary: 'передняя дельта, кор-стабилизаторы',
      tip: 'Широкий хват — больше грудь. Узкий хват — больше трицепс.',
    },
    'подтягивания': {
      primary: 'широчайшие мышцы спины (65%), бицепс (20%)',
      secondary: 'задняя дельта, ромбовидные, бицепс плеча',
      tip: 'Широкий хват — акцент широчайшие. Нейтральный хват — более бицепсовый.',
    },
    'жим стоя': {
      primary: 'передняя дельта (50%), трицепс (30%)',
      secondary: 'средняя дельта, кор, трапеция',
      tip: 'Держите локти чуть вперёд, не в стороны — защищает плечевой сустав.',
    },
  };

  const matched = Object.entries(exercises).find(([key]) => lowerMsg.includes(key));
  if (!matched) return '';

  const [name, data] = matched;
  return `\n\n🦴 Анатомия ${name}:\n• Основные мышцы: ${data.primary}\n• Второстепенные: ${data.secondary}\n• 💡 ${data.tip}`;
}
export function calculateWorkoutDensitySimple(totalVolumeKg: number, durationMinutes: number): string {
  if (!totalVolumeKg || !durationMinutes || durationMinutes < 10) return '';
  const density = totalVolumeKg / durationMinutes;
  let assessment = '';

  if (density < 100) assessment = 'Низкая плотность — слишком долгие паузы или мало объёма';
  else if (density < 300) assessment = 'Средняя плотность — норма';
  else if (density < 600) assessment = 'Хорошая плотность — эффективно используете время';
  else assessment = 'Высокая плотность — суперсеты или минимальный отдых';

  return `\n\n📊 Плотность тренировки: ${Math.round(density)} кг/мин\n${assessment}`;
}
export function advocateTrainingPartner(message: string, streak: number): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['партнёр', 'вместе тренироваться', 'тренировочный партнёр', 'один скучно', 'нет мотивации'].some(kw => lowerMsg.includes(kw));
  const hasLowStreak = streak < 5;

  if (!isRelevant && !hasLowStreak) return '';

  return `\n\n👥 Тренировочный партнёр — недооценённый инструмент:

**Что даёт партнёр:**
• +14% к интенсивности тренировки (исследование J.Strength Cond)
• Страховка → можно безопасно работать на пределе
• Соревновательный эффект: не хочется отставать
• Социальная ответственность: сложнее пропустить тренировку

**Как найти:**
• Telegram-группы вашего зала
• Фитнес-приложения с поиском партнёра
• Просто поговорите с кем-то в зале — многие ищут

**Если партнёра нет:**
Используйте Iron Coach как виртуального партнёра — записывайте каждую тренировку и отчитывайтесь.`;
}
export function guideGripStrength(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['хват', 'слабые запястья', 'выскальзывает', 'мозоли', 'болят запястья', 'укрепить хват'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n✊ Хват и запястья:

**Укрепление хвата:**
• Вис на перекладине: начните с 3x30 сек, прогрессируйте до 3x90 сек
• Фермерская прогулка: возьмите гантели 50-60% от веса тела в каждую руку, идите 30м
• Сжимание эспандера: 3x20 каждой рукой (в свободное время)

**При болях в запястьях:**
• Нейтральный хват (молоток) снижает нагрузку на запястье
• Кистевые бинты при максимальных весах
• Растяжка: руки вперёд, пальцы вниз, тяните 30 сек

**Мозоли — нормально,** но при разрывах используйте жидкий мел или перчатки (спорно — перчатки снижают проприоцепцию).

**Лямки:** используйте только при весах >80% от максимума в тяговых — иначе хват не развивается.`;
}
export function showBodyweightProgressions(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['без железа', 'без снаряжения', 'подтягивания не могу', 'отжиматься не могу', 'с чего начать', 'прогрессия'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n📈 Прогрессия упражнений с весом тела:

**Подтягивания (от нуля до 10):**
1. Вис (30-60 сек) → 2. Негативные (5 сек вниз) → 3. Резиновые петли → 4. Австралийские → 5. Полные подтягивания

**Отжимания (от нуля до 30):**
1. От стены → 2. От скамьи (наклонные) → 3. С колен → 4. Классические → 5. На кулаках → 6. Широкий/узкий хват → 7. На брусьях

**Приседания (к пистолетику):**
1. Присед с опорой → 2. Классический → 3. Болгарский сплит → 4. Пистолетик с поддержкой → 5. Пистолетик

**Принцип:** освойте 3x8-12 текущего уровня → переходите на следующий.`;
}
export function getSeasonalTrainingCalendar(): string {
  const month = new Date().getMonth() + 1;
  let season = '';
  let advice = '';

  if (month >= 12 || month <= 2) {
    season = 'Зима';
    advice = `❄️ Зимний период — идеальное время для наращивания силы и массы:
• Акцент на базовые движения с максимальными весами
• Профицит калорий 200-300 ккал/день — мышцы растут лучше в холод
• Витамин D3 — критичен при дефиците солнца (2000-4000 МЕ/день)
• Тренировки утром — повышают настроение в тёмное время года`;
  } else if (month >= 3 && month <= 5) {
    season = 'Весна';
    advice = `🌱 Весна — время трансформации:
• Постепенно снижайте калории (−200 ккал/неделю) для рельефа к лету
• Добавьте кардио-компонент (2x HIIT/неделю)
• Сезон соревнований по пауэрлифтингу и федерации (ФПРС) стартует — следите за турнирами`;
  } else if (month >= 6 && month <= 8) {
    season = 'Лето';
    advice = `☀️ Лето:
• Повышенный риск обезвоживания — +500мл воды сверх нормы
• Тренировки утром или вечером (избегайте жары 12-17 ч)
• Сезон активности — пляж, плавание считаются дополнительным кардио
• Поддерживающий режим питания, акцент на белок`;
  } else {
    season = 'Осень';
    advice = `🍂 Осень — время вернуться к железу:
• Начинайте набор после летнего поддержания
• Увеличивайте калории и рабочие веса
• Планируйте цели на следующий год — соревнования, личные рекорды
• Осенние турниры по пауэрлифтингу и кроссфиту — хорошее время для дебюта`;
  }

  return `\n\n📅 ${season} — периодизация по сезону:\n${advice}`;
}
export function guideWorkoutJournaling(message: string, totalWorkoutsEver: number): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['дневник тренировок', 'записывать', 'как вести записи', 'трекинг', 'отслеживать прогресс'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const hasJournaled = totalWorkoutsEver > 5;

  return `\n\n📓 Дневник тренировок — почему это работает:\n\n${hasJournaled ? `Вы уже ведёте ${totalWorkoutsEver} тренировок — отличная привычка! Вот как улучшить записи:` : 'Начните записывать — это один из самых недооценённых инструментов прогресса:'}\n\n**Что фиксировать:**\n• Упражнение → подходы × повторения × вес\n• RPE (субъективная сложность 1-10)\n• Самочувствие и энергия перед тренировкой\n• Что удалось, что нет\n\n**Что это даёт:**\n• Видите прогресс — самый мощный мотиватор\n• Не гадаете "с каким весом работал в прошлый раз"\n• Выявляете паттерны: в какие дни лучшие тренировки, что ест перед хорошим результатом\n• AI Iron Coach использует ваши данные для персонализации`;
}
export function adviseTrainingEconomics(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['зал стоит дорого', 'домашний зал', 'минимальное оборудование', 'бюджетный спорт', 'что купить для зала дома'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n💰 Минимальный бюджетный домашний зал:\n\n**Уровень 1 (~0₽):** Собственный вес\n• Отжимания, приседания, планка, берпи, пресс — полноценные тренировки\n\n**Уровень 2 (~2 000-5 000₽):**\n• Турник дверной (800-1500₽) → подтягивания, вис\n• Эспандеры-петли (500-800₽) → десятки упражнений с нагрузкой\n\n**Уровень 3 (~10 000-20 000₽):**\n• Разборные гантели 2-24кг (7 000-12 000₽) → 90% упражнений\n• Коврик для пола (500-1000₽)\n\n**Уровень 4 (полноценный, ~50 000-80 000₽):**\n• Штанга + блины + стойки → полный пауэрлифтерский комплекс\n\n💡 Лучшее вложение: **абонемент в зал** (1500-3000₽/мес) — доступ к полному оборудованию, социальная среда, тренеры рядом`;
}
export function linkCognitionAndTraining(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['мозг', 'концентрация', 'когнитивные', 'умственная работа', 'стресс работа', 'фокус', 'память'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n🧠 Тренировки и мозг:\n\n**Что происходит с мозгом при тренировках:**\n• BDNF (нейротрофический фактор) вырабатывается при кардио → буквально "удобрение для нейронов"\n• 30 мин умеренного кардио = +20% когнитивная производительность на 2-3 часа\n• Силовые тренировки снижают уровень кортизола → снижают тревожность\n• Регулярные тренировки: +30% объём гиппокампа (память)\n\n**Лучшие тренировки для мозга:**\n1. Утреннее кардио 20-30 мин → продуктивность весь день\n2. Сложно-координационные упражнения (олимпийские) → новые нейронные связи\n3. Командные виды спорта → социальные нейросети мозга\n\n💡 Перед важной встречей или экзаменом: 20 мин бег/велосипед → пиковая концентрация через 2-3 часа.`;
}
export function adviseTrainingInBadConditions(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['холодно', 'мороз', 'жара', 'дождь', 'не хочется выходить', 'погода', 'зимой тренироваться'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const isCold = lowerMsg.includes('холод') || lowerMsg.includes('мороз') || lowerMsg.includes('зим');
  const isHot = lowerMsg.includes('жар') || lowerMsg.includes('летом') || lowerMsg.includes('жарко');

  if (isCold) {
    return `\n\n❄️ Тренировки в холод:\n\n**Разминка удлиняется:** при -10°C мышцам нужно 15-20 мин для полного разогрева (vs 5-10 мин в тепле)\n\n**Одевайтесь слоями:**\n• 1-й слой: термобельё (отводит пот)\n• 2-й: флис (тепло)\n• 3-й: ветрозащита (при уличных тренировках)\n\n**Питание в холод:**\n• Организм тратит больше калорий на обогрев → можно есть немного больше\n• Горячий напиток после тренировки ускоряет восстановление температуры тела\n\n💡 Холодный воздух не "застуживает" лёгкие — это миф. Дышать через нос согревает воздух.`;
  }

  if (isHot) {
    return `\n\n☀️ Тренировки в жару:\n\n• Тренируйтесь утром до 10 или вечером после 18 (температура ниже)\n• +500мл воды сверх нормы — обезвоживание начинается при потере 1-2% веса тела\n• Электролиты (натрий, калий, магний) — не просто вода!\n• Акклиматизация: первые 10-14 дней жары снижайте интенсивность на 20%\n\n⚠️ Признаки теплового удара: головокружение + прекращение потоотделения + спутанность — немедленно в тень и обливайтесь холодной водой.`;
  }

  return `\n\n🌧 Плохая погода — не повод пропускать:\n• Зал всегда доступен независимо от погоды — это его главный плюс над уличными тренировками\n• Если всё же пропустили — не пытайтесь "отработать" двойной тренировкой. Просто продолжайте по плану.`;
}
export function getProgressionModel(message: string, totalWorkoutsEver: number, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['прогресси', 'progression', 'прибавлять', 'добавить вес', 'когда увеличивать', 'застрял', 'не растёт'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isNewbie = totalWorkoutsEver < 30;
  const isIntermediate = totalWorkoutsEver >= 30 && totalWorkoutsEver < 150;
  const isAdvanced = totalWorkoutsEver >= 150;
  const isStrength = userGoalStr === 'strength' || userGoalStr === 'powerlifting';
  const isMass = userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy';

  let model = '';
  if (isNewbie) {
    model = `📈 **Линейная прогрессия (для начинающих):**
Ты на стадии новичка — прогрессировать можно КАЖДУЮ тренировку.
• Прибавляй +2.5кг на штанге каждую тренировку (ноги) или каждые 2 тренировки (верх)
• Если сделал все повторения в программе → следующий раз добавляй вес
• Линейная прогрессия работает 3-6 месяцев — не усложняй раньше времени
• Программы: StrongLifts 5×5, Starting Strength, GZCLP`;
  } else if (isIntermediate) {
    if (isStrength) {
      model = `📊 **Волновая прогрессия (для среднего уровня, сила):**
• Прогрессируй неделями, не тренировками
• Неделя 1: 3×5 @ 75% | Неделя 2: 3×5 @ 77.5% | Неделя 3: 3×5 @ 80% | Неделя 4: разгрузка 3×5 @ 65%
• Texas Method, 5/3/1 — лучшие программы для этой стадии
• Добавляй 2.5кг/нед на жиме, 5кг/нед на приседе/тяге`;
    } else {
      model = `📊 **Двойная прогрессия (для гипертрофии):**
• Сначала наращивай повторения в диапазоне (8-12), затем вес
• Пример: 3×8 @ 80кг → 3×9 → 3×10 → 3×11 → 3×12 → 3×8 @ 82.5кг
• Это надёжнее, чем добавлять вес каждую тренировку
• Плато: смени диапазон повторений на 2 недели (6-8 или 15-20)`;
    }
  } else {
    model = `🏔 **Прогрессия для продвинутых:**
• Прогрессируй по мезоциклам (4-6 недель), не неделям
• Варианты: увеличение объёма → увеличение интенсивности → разгрузка → новый цикл
• Инструменты прогрессии: объём (больше подходов), плотность (меньше отдых), интенсивность (больше вес), частота (чаще)
• Периодизация: блоковая (накопление → интенсификация → реализация)
• Фиксируй всё в дневнике — без данных продвинутая прогрессия невозможна`;
  }

  return '\n\n' + model;
}
export function getTrainingFrequencyByMuscle(message: string, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['как часто тренировать', 'частота тренировок', 'сколько раз в неделю', 'training frequency', 'frequency'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isMass = userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy';
  const isStrength = userGoalStr === 'strength' || userGoalStr === 'powerlifting';

  const lines: string[] = ['📅 **Оптимальная частота тренировок по группам мышц:**', ''];

  if (isStrength) {
    lines.push('**Для силы (пауэрлифтинг / силовые виды):**');
    lines.push('• Присед: 2-3 раза/нед (высокая нагрузка ЦНС — нужно восстановление)');
    lines.push('• Жим лёжа: 2-3 раза/нед (можно чаще — меньше нагрузка на ЦНС)');
    lines.push('• Становая тяга: 1-2 раза/нед (максимальная нагрузка — нужно больше времени)');
    lines.push('• Вспомогательные упражнения: 2-3 раза/нед');
  } else if (isMass) {
    lines.push('**Для гипертрофии (набор мышц):**');
    lines.push('• Большие группы (грудь, спина, ноги): 2 раза/нед — оптимум по мета-анализам');
    lines.push('• Малые группы (бицепс, трицепс, плечи): 2-3 раза/нед');
    lines.push('• Икры, пресс: переносят 3-4 раза/нед хорошо');
    lines.push('• Исследования: 2×/нед > 1×/нед для роста, но 3×/нед не всегда лучше 2×/нед');
  } else {
    lines.push('**Для общей физической формы:**');
    lines.push('• Каждая группа мышц: 2 раза в неделю');
    lines.push('• Полное тело: 3 раза/нед (лучший вариант для большинства)');
    lines.push('• PPL (Push-Pull-Legs): 6 раз/нед — каждая мышца 2×/нед');
  }

  lines.push('');
  lines.push('**Признаки недостаточного восстановления:**');
  lines.push('• Результаты не растут или падают');
  lines.push('• Постоянная болезненность (DOMS) не проходит');
  lines.push('• Потеря мотивации, вялость на тренировках');
  lines.push('');
  lines.push('💡 Начни с 2×/нед на каждую группу и корректируй по самочувствию.');

  return '\n\n' + lines.join('\n');
}
export function getWarmupWeightScheme(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['разминка', 'разминочные', 'warmup', 'разогрев перед', 'разминочный вес', 'сколько на разминку'];
  if (!keywords.some(k => lower.includes(k))) return '';

  // Extract working weight if mentioned
  const weightMatch = lower.match(/(\d+)\s*(?:кг|kg)/);
  const workingWeight = weightMatch ? parseInt(weightMatch[1], 10) : null;

  const lines: string[] = ['🏋️ **Схема разминочных подходов:**', ''];

  if (workingWeight && workingWeight > 20) {
    const w = workingWeight;
    lines.push(`**Для рабочего веса ${w} кг:**`);
    lines.push(`• Подход 1: гриф (20 кг) × 10 повторений`);
    if (w > 60) lines.push(`• Подход 2: ${Math.round(w * 0.4 / 2.5) * 2.5} кг × 6 повторений`);
    if (w > 80) lines.push(`• Подход 3: ${Math.round(w * 0.6 / 2.5) * 2.5} кг × 4 повторения`);
    if (w > 100) lines.push(`• Подход 4: ${Math.round(w * 0.8 / 2.5) * 2.5} кг × 2 повторения`);
    lines.push(`• Подход 5: ${Math.round(w * 0.9 / 2.5) * 2.5} кг × 1 повторение`);
    lines.push(`• **Рабочие подходы:** ${w} кг`);
  } else {
    lines.push('**Универсальная формула (от рабочего веса):**');
    lines.push('• 20 кг (гриф) × 10 повт');
    lines.push('• 40% × 6 повт');
    lines.push('• 60% × 4 повт');
    lines.push('• 80% × 2 повт');
    lines.push('• 90% × 1 повт');
    lines.push('• Рабочие подходы');
  }

  lines.push('');
  lines.push('**Зачем это нужно:**');
  lines.push('• Активирует ЦНС и улучшает нейромышечную связь');
  lines.push('• Разогревает суставы и связки без накопления усталости');
  lines.push('• Даёт "прочувствовать" движение перед рабочим весом');
  lines.push('');
  lines.push('⚡ Не жалей времени на разминку — 10 мин разминки > 30 мин с травмой.');

  return '\n\n' + lines.join('\n');
}
export function getDropSetProtocol(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['дроп-сет', 'drop set', 'стриппинг', 'сбрасывать вес', 'снижение веса', 'добавить интенсивности'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n💥 **Дроп-сеты — протокол:**

**Что такое дроп-сет:**
Выполняешь подход до отказа → сразу снижаешь вес → продолжаешь без отдыха → повторяешь 2-3 раза.

**Схемы снижения веса:**
• Классика: -20-25% каждый раз (100 → 75 → 55 кг)
• Механическое дроп-сет: меняешь угол/хват вместо веса (жим горизонтальный → наклонный → вертикальный)
• Микроплиты: -5-10% (для максимальной выносливости)

**Когда применять:**
• 1-2 последних подхода в упражнении, не все
• Изолирующие упражнения (сгибания, разгибания, разводки) — лучше всего
• Базовые упражнения (присед, становая) — осторожно, высокий риск травмы

**Ограничения:**
• Не более 2-3 упражнений с дроп-сетами за тренировку
• 1-2 раза в неделю на группу мышц максимум
• Не в начале тренировочного блока — это инструмент интенсификации

⚠️ Дроп-сеты создают огромный метаболический стресс — восстановление дольше обычного.`;
}
export function getWorkoutSplitReview(message: string, workoutsPerWeek: number, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['сплит', 'split', 'программа тренировок', 'какой сплит', 'выбрать программу', 'push pull', 'ppl', 'full body', 'верх низ'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isMass = userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy';
  const isStrength = userGoalStr === 'strength' || userGoalStr === 'powerlifting';
  const days = workoutsPerWeek;

  const lines: string[] = ['🗓 **Выбор сплита по цели и количеству дней:**', ''];

  if (days <= 2) {
    lines.push('**2 дня/нед → Full Body:**');
    lines.push('• Приседание / Жим лёжа / Тяга / Жим плеч / Подтягивания');
    lines.push('• Каждая мышца тренируется 2 раза/нед — оптимально для частоты');
    lines.push('• Лучший выбор при ограниченном времени');
  } else if (days === 3) {
    if (isStrength) {
      lines.push('**3 дня/нед → Full Body (силовой):**');
      lines.push('• 5×5 или 3×5 на большие упражнения');
      lines.push('• StrongLifts 5×5, Starting Strength, GZCLP');
    } else {
      lines.push('**3 дня/нед → Full Body или Upper/Lower:**');
      lines.push('• Full Body (Пн/Ср/Пт): классика для начинающих и любителей');
      lines.push('• Upper/Lower/Full Body: разнообразие стимулов');
    }
  } else if (days === 4) {
    lines.push('**4 дня/нед → Upper/Lower Split:**');
    lines.push('• Пн: Верх (жим-ориентированный) | Вт: Низ (присед)');
    lines.push('• Чт: Верх (тяга-ориентированный) | Пт: Низ (становая)');
    lines.push('• Каждая мышца: 2×/нед, отличный баланс объёма и восстановления');
    lines.push('• Альтернатива: PPL с днём отдыха (Push/Pull/Legs + отдых)');
  } else if (days === 5 || days === 6) {
    if (isMass) {
      lines.push('**5-6 дней/нед → PPL (Push-Pull-Legs):**');
      lines.push('• Push (грудь/плечи/трицепс) → Pull (спина/бицепс) → Legs (ноги)');
      lines.push('• При 6 днях: каждая группа 2×/нед — идеально для гипертрофии');
      lines.push('• При 5 днях: один день Full Body или специализация на слабом месте');
    } else {
      lines.push('**5-6 дней/нед → Специализированный сплит:**');
      lines.push('• Bro-split (1 мышца в день) — меньший объём на мышцу/нед, но допустимо');
      lines.push('• PPL — золотой стандарт по соотношению частота/объём/восстановление');
    }
  } else {
    lines.push('**Начни с 3-4 дней в неделю** — это оптимум для большинства людей.');
    lines.push('• Больше дней ≠ лучше результат без правильного восстановления');
  }

  lines.push('');
  lines.push('💡 Лучший сплит — тот, которого ты придерживаешься. Консистентность > оптимальность.');

  return '\n\n' + lines.join('\n');
}
export function adviseSupersets(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['суперсет', 'superset', 'агонист', 'антагонист', 'без отдыха', 'связать упражнения'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n⚡ **Суперсеты — полное руководство:**

**Типы суперсетов:**

**1. Антагонистические (лучшие для силы и гипертрофии):**
• Жим лёжа + Тяга в наклоне
• Жим гантелей + Тяга блока
• Сгибание бицепса + Разгибание трицепса
→ Антагонистические мышцы отдыхают, пока работает агонист — меньше потери силы

**2. Агонистические (одна группа, удар по гипертрофии):**
• Жим штанги + Жим гантелей + Отжимания на брусьях (грудь)
→ Максимальная накачка, сильная усталость — для продвинутых

**3. Несвязанные (для скорости тренировки):**
• Подтягивания + Подъём икр
→ Не мешают друг другу, просто экономят время

**Практика:**
• Отдых между суперсетами: 60-90 сек (антагонисты) или 90-120 сек (агонисты)
• Снижай рабочий вес на 5-10% vs одиночных подходов
• 2-3 суперсета за тренировку — оптимум, не превращай всё в суперсет

💡 Суперсеты сокращают время тренировки на 25-30% без потери объёма.`;
}
export function adviseBodyweightProgressions(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['с весом тела', 'без железа', 'калистеника', 'calisthenics', 'отжимания', 'подтягивания прогрессия', 'домашние тренировки'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🤸 **Прогрессия упражнений с весом тела:**

**Отжимания (от простого к сложному):**
1. С колен → 2. Классические → 3. Широкая постановка → 4. Узкая → 5. На возвышении ног → 6. Плиометрические → 7. Archer push-up → 8. На одной руке

**Подтягивания:**
1. Австралийские (тело горизонтально) → 2. С резиновой петлёй → 3. Негативные (только опускание) → 4. Классические → 5. Узкий хват → 6. С весом → 7. Weighted → 8. На одной руке (One arm chin-up)

**Приседания:**
1. Воздушный присед → 2. Присед на ящик → 3. Болгарский сплит-сквот → 4. Пистолетик с опорой → 5. Пистолетик полный

**Планка → к динамике:**
Планка 60 сек → планка с поднятием руки/ноги → dragon flag → L-sit

**Дип (отжимание на брусьях):**
Отжимания узко → на стуле → на параллельных брусьях → с весом

💡 Принцип прогрессии без железа: сложность рычага > количество повторений.`;
}
export function getSpeedPowerTraining(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['скорость', 'взрывная сила', 'мощность', 'power', 'плиометрика', 'прыжки', 'sprint', 'спринт', 'ловкость'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n⚡ **Скорость и взрывная сила:**

**Ключевой принцип:** Мощность = Сила × Скорость. Нельзя стать быстрым, тренируясь медленно.

**Плиометрика (для взрывной силы):**
• Прыжки на ящик (Box Jump): 3-5 подходов × 3-5 повторений — акцент на мягкое приземление
• Прыжки в длину с места: развивает горизонтальную мощность
• Бросок медболом: стоя → прыжок + бросок мяча вперёд/вверх
• Взрывные отжимания (с хлопком): верхняя часть тела

**Когда выполнять:**
• ТОЛЬКО в начале тренировки (свежие мышцы и ЦНС)
• 2-3 раза в неделю максимум
• Небольшой объём: 6-15 прыжков в сессии — это не кардио, это нейромышечная работа

**Олимпийские упражнения (для атлетов):**
• Рывок/толчок: сложны, нужен тренер
• Вместо них: Hang Power Clean, Kettlebell Swing — похожий эффект, проще техника

**Спринт:**
• Рваный бег (10-30м) × 6-10 повторений с полным восстановлением (2-3 мин)
• Лестница (agility): координация + скорость смены направления

💡 Взрывная сила тренируется за 8-12 недель специализированного цикла, без него — теряется.`;
}
export function getTrainingLogGuide(message: string, totalWorkoutsEver: number): string {
  const lower = message.toLowerCase();
  const keywords = ['дневник тренировок', 'записывать', 'логировать', 'отслеживать', 'журнал', 'training log', 'notes'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isNewbie = totalWorkoutsEver < 20;

  return `\n\n📓 **Дневник тренировок — почему это критично:**

**Что записывать:**
• Упражнение → вес → подходы × повторения × реальные повторения
• RPE (1-10): насколько тяжело было
• Самочувствие (1-10): сон, стресс, энергия перед тренировкой
• Заметки: что болело, что удивило, что изменил

**Пример записи:**
\`Жим лёжа: 80кг × 5, 80кг × 5, 80кг × 4 | RPE 8 | ощущение: хорошо, плечо чуть беспокоит\`

**Почему это меняет всё:**
• Видишь реальный прогресс (или его отсутствие)
• Находишь паттерны: когда результат лучше (сон, еда, время)
• Принимаешь обоснованные решения о весе/объёме, а не гадаешь
• Исследование: те, кто записывает, прогрессируют на 30% быстрее

${isNewbie
  ? '💡 Ты только начинаешь — начни записывать с первой тренировки. Это привычка, которую потом нельзя наверстать.'
  : `💡 У тебя уже ${totalWorkoutsEver} тренировок — если не записывал, то сейчас лучший момент начать. Данные — это конкурентное преимущество.`}

**Приложения:** Giron дневник (встроен), Google Sheets, Strong App, бумажный блокнот — всё работает.`;
}
export function getMorningVsEveningTraining(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['утром или вечером', 'когда тренироваться', 'время тренировки', 'утренняя тренировка', 'вечерняя тренировка', 'best time to train'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🕐 **Утренние vs вечерние тренировки — что говорит наука:**

**Утром:**
✅ Укрепляет дисциплину (тренировка уже сделана, день не помешает)
✅ Ускоряет метаболизм на весь день
✅ Повышает фокус и энергию утром
❌ Температура тела ниже → мышцы менее "разогреты"
❌ Требует более длинной разминки (15-20 мин vs 5-10)
❌ Силовые показатели на 2-5% ниже, чем вечером

**Вечером (16-18 часов):**
✅ Пик температуры тела → максимальная сила и выносливость
✅ Реакция, координация и силовые показатели лучше
✅ Тестостерон и ИФР-1 на подъёме во второй половине дня
❌ Может нарушать сон (тренировка за 1-2 часа до сна → кортизол + температура мешают засыпанию)
❌ Чаще срываются из-за работы/усталости/социальных событий

**Вывод:**
• Для максимальной производительности: 16-18 часов
• Для стабильности и дисциплины: утро
• **Лучшее время → то, которое ты реально соблюдаешь.**

💡 Если тренируешься вечером и плохо спишь → перенеси тренировку хотя бы за 2 часа до сна.`;
}
export function getProgramDesignPrinciples(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['составить программу', 'program design', 'как составить', 'принципы программы', 'построить тренировку', 'базовые принципы'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n📐 **Принципы построения тренировочной программы:**

**7 ключевых принципов:**

**1. Специфичность (SAID)**
Тело адаптируется к конкретной нагрузке. Хочешь жать 100кг → жми, а не делай только трицепс.

**2. Прогрессивная перегрузка**
Нагрузка должна постоянно расти (вес, объём, плотность). Без прогрессии = нет роста.

**3. Восстановление**
Рост происходит НЕ на тренировке, а ПОСЛЕ. Тренировка — стимул. Еда + сон = рост.

**4. Вариативность**
Менять упражнения/диапазоны/методы каждые 4-8 недель. Тело адаптируется → нужен новый стресс.

**5. Реверсивность**
Перестал тренироваться → потерял. Сила уходит медленнее мышц, выносливость — быстрее всего.

**6. Индивидуальность**
Нет универсальной программы. Твоё тело, история травм, цели → адаптируй под себя.

**7. Долгосрочность**
Программа на 3 месяца > идеальная тренировка сегодня. Консистентность определяет всё.

**Структура хорошей программы:**
• Разминка (5-10 мин)
• Основная часть (главные упражнения)
• Вспомогательная работа
• Заминка (5-7 мин)

💡 Плохая программа + хорошее исполнение > хорошая программа + плохое исполнение.`;
}
export function getSeasonalTrainingFull(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['зимой', 'летом', 'осень', 'весна', 'сезон', 'зимний период', 'летний период', 'сезонная программа'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const month = new Date().getMonth() + 1; // 1-12
  const isWinter = month >= 12 || month <= 2;
  const isSpring = month >= 3 && month <= 5;
  const isSummer = month >= 6 && month <= 8;
  const isAutumn = month >= 9 && month <= 11;

  let season = '';
  if (isWinter) {
    season = `\n\n❄️ **Зимний период (декабрь–февраль) — фаза набора:**
• Калории можно поднять на 200-400 ккал (профицит легче соблюдать)
• Акцент: силовые упражнения, набор мышечной массы
• Витамин D3 обязателен — солнца нет
• Кардио: крытый бассейн, эллипс, велотренажёр
• Психология: короткие дни → следи за настроением, риск депрессии растёт
💡 Зима = строй мышцы. Летом покажешь форму.`;
  } else if (isSpring) {
    season = `\n\n🌸 **Весна (март–май) — фаза перехода:**
• Постепенный переход к дефициту (если цель лето)
• Возвращай кардио на улицу по мере потепления
• Снижай дефицит медленно: -100 ккал/нед, не резко
• Добавляй активный отдых (велосипед, ходьба, пробежки)
💡 Весна = подготовка. Начни в марте — к июню будешь готов.`;
  } else if (isSummer) {
    season = `\n\n☀️ **Лето (июнь–август) — фаза рельефа:**
• Тренируйся рано утром или поздно вечером (жара)
• Электролиты обязательны при активности на улице
• Лёгкий дефицит 200-300 ккал поддерживай без фанатизма
• Плавание — отличная альтернатива кардио без перегрева
💡 Лето = поддерживай форму. Агрессивная сушка в жару → обезвоживание.`;
  } else {
    season = `\n\n🍂 **Осень (сентябрь–ноябрь) — фаза набора силы:**
• Отпуска заканчиваются → возвращаемся к регулярным тренировкам
• Идеальное время начать силовой цикл (5×5, 531 и т.п.)
• Плавно увеличивай калории к зиме
• Добавляй витамин D3 с октября
💡 Осень = строй силу. К зиме будешь сильнее, чем был летом.`;
  }

  return season;
}
export function getCoreTrainingGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['пресс', 'кор', 'core', 'живот', 'планка', 'упражнения на пресс', 'сила кора', 'кубики'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n💪 **Кор — правильный подход:**

**Что такое кор (не только пресс):**
• Прямая мышца живота (кубики)
• Косые мышцы (боковая стабильность)
• Поперечная мышца живота (внутренний корсет — самая важная!)
• Мультифидус (поясница)
• Ягодицы и тазовые стабилизаторы

**Почему бесконечные скручивания не работают:**
• Скручивания тренируют только прямую мышцу в сгибании
• Реальная функция кора — СТАБИЛИЗАЦИЯ, а не движение
• Кубики появляются от низкого % жира, не от количества скручиваний

**Эффективные упражнения:**

**Стабилизация (приоритет):**
• Планка и варианты: ноги на мяче, динамическая, RKC планка
• Паллоф-пресс: против ротационных сил
• Dead bug: нейтральная поясница + координация
• Bird-dog: баланс + экстензия

**Антиэкстензия/флексия:**
• Ab wheel rollout → самое сложное упражнение для кора
• Hollow hold (гимнастика) → тотальное напряжение

**Динамика (добавляй последней):**
• Скручивания с нагрузкой (кабель/блин) → допустимо в небольших объёмах
• Russian twist с весом → косые

💡 Если жмёшь/приседаешь/тянешь с правильной техникой — кор уже тренируется. Добавь 10-15 мин в конце тренировки.`;
}
export function getForearmTrainingGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['предплечья', 'forearm', 'хват слабый', 'кисти', 'запястья', 'wrist', 'сила кисти', 'срывается хват'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n✊ **Тренировка предплечий и хвата:**

**Почему важен сильный хват:**
• Слабый хват = ограничение в тягах, турнике, становой
• Корреляция: сила хвата предсказывает общую силу и долголетие
• Часто "слабые" спина/ноги — на деле слабый хват

**Программа предплечий (2-3 раза/нед):**

**1. Фермерская ходьба (лучшее упражнение)**
Возьми максимальный вес и ходи 30-60 сек × 3-4 раза
Тренирует: удерживающий хват (crushing grip)

**2. Висение на турнике**
До отказа × 3-4 подхода
Прогрессия: одна рука → с полотенцем

**3. Сгибание запястий (flexion/extension)**
Лёжа предплечьем на скамье, 3×15 со штангой или гантелями
Тренирует: сгибатели и разгибатели предплечья

**4. Вращение молоткового типа (pronation/supination)**
Молоток или гантель держишь за конец: поворот ладонью вниз/вверх
3×12 каждую сторону

**5. Рисование блинами**
Возьми блин за ребро большим и указательным пальцем → удержи 30 сек × 3

**Тайминг:**
• Делай в конце тренировки — уставшие предплечья портят остальные упражнения
• 2-3 раза в неделю достаточно

💡 Месяц таких тренировок → подтягивания без лямок станут значительно легче.`;
}
export function getTravelWorkoutProtocol(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['в командировке', 'в отпуске', 'нет зала', 'гостиница', 'hotel workout', 'travel workout', 'в поездке', 'в дороге'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n✈️ **Тренировки в командировке/отпуске:**

**Принцип: сохрани стимул, а не объём**
Цель в поездке — не прогрессировать, а сохранить наработанное.
Достаточно 2-3 тренировки в неделю по 25-30 мин.

**Минимальная тренировка в номере (25 мин):**
• 3×15 отжиманий (или до отказа)
• 3×20 приседаний + 3×10 болгарских сплит-сквотов на стул
• 3×30 сек планки / 3×15 mountain climbers
• 3×20 обратных выпадов
→ Всё тело, без инвентаря, без шума (соседи снизу скажут спасибо)

**Если есть турник/спортплощадка:**
• Подтягивания: 4×max
• Отжимания с ногами на высоте (подоконник/стул): 3×12-15
→ Отличная верхняя тренировка

**Если есть бассейн в отеле:**
• 30-40 мин плавания = полноценная тренировка
• Интервалы: 25м спринт + 25м восстановление × 10

**Если возишь резиновые ленты:**
Добавь любые тяги, жимы, плечи → почти полноценный зал в кармане.

**Питание в поездке:**
• Протеиновые батончики/порошок в шейкере — бери с собой
• Куриная грудь/яйца в большинстве ресторанов есть
• Главное: не опускайся ниже 1.5г белка/кг

💡 Даже 1 тренировка в неделю сохраняет 90% результата при отдыхе до 2 недель.`;
}
export function getIsometricTrainingGuide(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('изометр') || lower.includes('статич') || lower.includes('планка') ||
    lower.includes('wall sit') || lower.includes('удержан') || lower.includes('напряжен');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📐 ИЗОМЕТРИЧЕСКИЕ ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('Изометрия = мышца напряжена, но не меняет длину.');
  lines.push('');
  lines.push('🔑 ПРЕИМУЩЕСТВА:');
  lines.push('• Развивает силу в конкретном угле сустава');
  lines.push('• Реабилитация (нет движения → меньше боли)');
  lines.push('• Улучшает нейромышечный контроль');
  lines.push('• Можно делать везде, без инвентаря');
  lines.push('');
  lines.push('⚡ ПРОТОКОЛЫ:');
  lines.push('• Силовая изометрия: 3–5 сек максимального усилия × 5 подходов');
  lines.push('• Выносливость: 30–60 сек умеренного усилия × 3 подхода');
  lines.push('• 120° правило: угол сустава ~120° даёт максимальный прирост силы');
  lines.push('');
  lines.push('🏋️ ЛУЧШИЕ ИЗОМЕТРИЧЕСКИЕ УПРАЖНЕНИЯ:');
  lines.push('• Планка — кор, поясница');
  lines.push('• Wall sit — квадрицепсы');
  lines.push('• Изометрический жим (в стойке) — грудь, трицепс');
  lines.push('• Удержание тяги у пояса — широчайшие, бицепс');
  lines.push('• Изометрический присед на параллели');
  lines.push('');
  lines.push('⚠️ Ограничения: сила растёт только в диапазоне ±15° от тренируемого угла.');
  lines.push('Комбинируй с динамической работой для полного результата.');
  return '\n\n' + lines.join('\n');
}
export function getCalisthenicsProgressions(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('калистеник') || lower.includes('street workout') ||
    lower.includes('турник') || lower.includes('брус') || lower.includes('отжимани') ||
    lower.includes('подтягива') || lower.includes('мышечный выход') || lower.includes('стойка');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤸 КАЛИСТЕНИКА — ПРОГРЕССИИ:');
  lines.push('');
  lines.push('📈 ПОДТЯГИВАНИЯ (от нуля до 10):');
  lines.push('1. Негативы: 5 сек вниз × 5 повт');
  lines.push('2. Австралийские подтягивания × 15');
  lines.push('3. Помощь резинкой × 3×8');
  lines.push('4. Подтягивания × 3×5 → 3×10');
  lines.push('');
  lines.push('📈 ОТЖИМАНИЯ (к взрывным):');
  lines.push('1. От стены → колен → пола');
  lines.push('2. Широкая постановка → узкая');
  lines.push('3. Ноги на возвышении');
  lines.push('4. Хлопки → Superman');
  lines.push('');
  lines.push('🎯 НАВЫКИ УРОВНЯ PRO:');
  lines.push('• Стойка на руках: сначала у стены, затем в балансе');
  lines.push('• Мышечный выход: требует ~1.3× вес тела в тяге');
  lines.push('• Флаг на шесте: нужна сила кора + плеч + широчайших');
  lines.push('• Пистолет: гибкость + сила одной ноги');
  lines.push('');
  lines.push('⏱️ ЧАСТОТА: 3 дня/неделю. Навыки — ежедневная практика по 5–10 мин.');
  return '\n\n' + lines.join('\n');
}
export function getIntensityTechniquesPlateauBreaker(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('плато') || lower.includes('не растёт') || lower.includes('застрял') ||
    lower.includes('интенсивность') || lower.includes('дроп') || lower.includes('суперсет') ||
    lower.includes('форсир') || lower.includes('отдых-пауза');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔥 ТЕХНИКИ ИНТЕНСИВНОСТИ ДЛЯ ПРОБИТИЯ ПЛАТО:');
  lines.push('');
  lines.push('1️⃣ ДРОП-СЕТЫ');
  lines.push('• Доделай подход до отказа → снизь вес на 20–30% → ещё до отказа');
  lines.push('• Применяй 1 раз в неделю на целевую мышцу');
  lines.push('');
  lines.push('2️⃣ ОТДЫХ-ПАУЗА');
  lines.push('• 8 повт → 15 сек отдых → ещё 3 → 15 сек → ещё 2');
  lines.push('• Суммарный объём за 1 сет = 3 нормальных');
  lines.push('');
  lines.push('3️⃣ ФОРСИРОВАННЫЕ ПОВТОРЕНИЯ');
  lines.push('• Партнёр помогает в 2–3 последних повт');
  lines.push('• Используй редко — высокая нагрузка на ЦНС');
  lines.push('');
  lines.push('4️⃣ МИОНЕВРАЛЬНАЯ УСТАЛОСТЬ (21s)');
  lines.push('• 7 нижних + 7 верхних + 7 полных повторений');
  lines.push('');
  lines.push('5️⃣ МЕХАНИЧЕСКОЕ ПРЕИМУЩЕСТВО');
  lines.push('• Начни со слабой позиции → переходи в сильную без отдыха');
  lines.push('');
  lines.push('6️⃣ КЛАСТЕРНЫЕ СЕТЫ');
  lines.push('• 85% 1ПМ × 2 повт → 10 сек → ещё 2 → 10 сек → ещё 2 (итого 6 повт)');
  lines.push('');
  lines.push('⚠️ Использовать не более 10–20% тренировочного объёма — иначе перетрен.');
  return '\n\n' + lines.join('\n');
}
export function getPowerliftingVsBodybuilding(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('пауэрлифтинг') || lower.includes('бодибилдинг') ||
    lower.includes('сила vs масс') || lower.includes('пл vs бб') || lower.includes('разница') &&
    (lower.includes('сила') || lower.includes('масса'));
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚔️ ПАУЭРЛИФТИНГ vs БОДИБИЛДИНГ:');
  lines.push('');
  lines.push('🏋️ ПАУЭРЛИФТИНГ:');
  lines.push('• Цель: максимальная сила в жиме, приседе, тяге');
  lines.push('• Повторения: 1–5, вес 80–100% 1ПМ');
  lines.push('• Упражнения: базовые (3 соревновательных движения + вспомогательные)');
  lines.push('• Отдых: 3–10 минут между подходами');
  lines.push('• Периодизация: линейная, волновая, блоковая');
  lines.push('');
  lines.push('💪 БОДИБИЛДИНГ:');
  lines.push('• Цель: максимальная мышечная масса и эстетика');
  lines.push('• Повторения: 8–15, акцент на ощущение растяжки/сокращения');
  lines.push('• Упражнения: широкий арсенал, изоляция важна');
  lines.push('• Отдых: 60–120 сек');
  lines.push('• Питание: циклы масса/сушка более структурированы');
  lines.push('');
  lines.push('🤝 POWERBUILDING (гибрид):');
  lines.push('• Базовые движения 4–6 повт (сила)');
  lines.push('• Вспомогательные 8–15 повт (масса)');
  lines.push('• Лучший вариант для большинства натуральных атлетов');
  lines.push('');
  lines.push('📌 Вывод: чем больше базы — тем больше потенциал для роста мышц.');
  return '\n\n' + lines.join('\n');
}
export function getStrengthForWeightLoss(message: string, userGoalStr: string): string {
  const lower = message.toLowerCase();
  const isWeightLoss = userGoalStr.toLowerCase().includes('похуден') || userGoalStr.toLowerCase().includes('сброс');
  const relevant = (lower.includes('похудет') || lower.includes('сжечь') || lower.includes('сбросить')) &&
    (lower.includes('силов') || lower.includes('тренажёр') || lower.includes('штанга'));
  if (!relevant && !isWeightLoss) return '';
  if (!lower.includes('похуд') && !lower.includes('жир') && !lower.includes('вес') && !isWeightLoss) return '';
  const lines: string[] = [];
  lines.push('🔥 СИЛОВЫЕ ТРЕНИРОВКИ ДЛЯ ПОХУДЕНИЯ:');
  lines.push('');
  lines.push('❓ ПОЧЕМУ НЕ ТОЛЬКО КАРДИО:');
  lines.push('• Мышцы = метаболически активная ткань (1 кг мышц +50 ккал/сут в покое)');
  lines.push('• EPOC (дожигание после тренировки): до 48 ч после силовой');
  lines.push('• Сохраняет мышцы при дефиците калорий (иначе тело "съедает" их)');
  lines.push('');
  lines.push('📋 ОПТИМАЛЬНЫЙ ПРОТОКОЛ:');
  lines.push('• 3–4 силовых тренировки/неделю + 2 кардио (30 мин умеренных)');
  lines.push('• Повторения: 8–15 (метаболический стресс → больше EPOC)');
  lines.push('• Короткие паузы: 45–90 сек (ЧСС выше → больше калорий)');
  lines.push('• Суперсеты — дополнительный плюс к расходу');
  lines.push('');
  lines.push('🍽️ ПИТАНИЕ ПРИ СИЛОВЫХ НА ДЕФИЦИТЕ:');
  lines.push('• Дефицит: -300 до -500 ккал (не больше — потеряешь мышцы)');
  lines.push('• Белок: 2–2.5 г/кг (защищает мышцы при похудении)');
  lines.push('• Углеводы до тренировки: не убирай полностью — нужна энергия');
  lines.push('');
  lines.push('📊 Оптимальная скорость похудения: 0.5–1% веса тела в неделю.');
  return '\n\n' + lines.join('\n');
}
export function getBusyScheduleWorkout(message: string, plannedDays: number): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('мало времени') || lower.includes('занят') || lower.includes('нет времени') ||
    lower.includes('короткая тренировка') || lower.includes('20 минут') || lower.includes('30 минут') ||
    lower.includes('быстрая тренировка') || lower.includes('не успеваю');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏰ ТРЕНИРОВКИ ПРИ ЗАНЯТОМ ГРАФИКЕ:');
  lines.push('');
  if (plannedDays >= 4) {
    lines.push(`ℹ️ У тебя запланировано ${plannedDays} дней/нед. При нехватке времени:`);
    lines.push('• Сократи до 3 дней, но увеличь качество каждой тренировки');
    lines.push('');
  }
  lines.push('🏃 ФОРМАТЫ ПО ВРЕМЕНИ:');
  lines.push('');
  lines.push('⚡ 20 МИНУТ — ЭКСТРЕННЫЙ ФОРМАТ:');
  lines.push('• 3 упражнения × 4 подхода × 8–10 повт с минимальным отдыхом');
  lines.push('• Суперсеты: жим + тяга (без паузы между)');
  lines.push('• EMOM: каждую минуту — новое упражнение');
  lines.push('');
  lines.push('⚡ 30–40 МИНУТ — ОПТИМУМ:');
  lines.push('• Фул-боди 3 раза/нед: присед, жим, тяга + 1–2 изоляции');
  lines.push('• Отдых между подходами: 60–90 сек (не 3 мин)');
  lines.push('');
  lines.push('⚡ ПРАВИЛО "НИКОГДА НЕ ПРОПУСКАТЬ ДВА РАЗ ПОДРЯД":');
  lines.push('• Одна пропущенная тренировка — не катастрофа');
  lines.push('• Две подряд — начало потери прогресса и привычки');
  lines.push('');
  lines.push('💡 ЛАЙФХАКИ:');
  lines.push('• Тренировки утром — реже срываются из-за дел');
  lines.push('• Сумка собрана заранее = меньше порог входа');
  lines.push('• "Мини-тренировка" лучше, чем ничего');
  return '\n\n' + lines.join('\n');
}
export function getGripStrengthTraining(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('хват') || lower.includes('grip') || lower.includes('кисти') ||
    lower.includes('предплечье') || lower.includes('скользит') || lower.includes('слабые кисти') ||
    lower.includes('удержать') && lower.includes('гриф');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤜 ТРЕНИРОВКА СИЛЫ ХВАТА:');
  lines.push('');
  lines.push('🔑 ТРИ ТИПА ХВАТА:');
  lines.push('• Хват давления (Crush): сжимание — становая, тяги');
  lines.push('• Хват удержания (Support): удерживать долго — фермерская прогулка');
  lines.push('• Хват щипком (Pinch): большой vs остальные — диски, прищепки');
  lines.push('');
  lines.push('📋 УПРАЖНЕНИЯ:');
  lines.push('• Фермерская прогулка: 30–60 м × 3 подхода (лучшее упражнение)');
  lines.push('• Dead hang (вис на перекладине): 3×30–60 сек');
  lines.push('• Удержание блина щипком: 3×20–30 сек');
  lines.push('• Кистевой эспандер: 3×50 повт');
  lines.push('• Полотенечные подтягивания (нестабильный хват)');
  lines.push('');
  lines.push('⚠️ КОГДА СЛАБЫЙ ХВАТ МЕШАЕТ:');
  lines.push('• Используй лямки для работы с большим весом в тягах');
  lines.push('• Тренируй хват отдельно после основной тренировки');
  lines.push('• 2 раза/неделю достаточно — кисти требуют восстановления');
  lines.push('');
  lines.push('💡 Прогресс хвата = прогресс во всех тяговых движениях.');
  return '\n\n' + lines.join('\n');
}
export function getEccentricTraining(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('эксцентрик') || lower.includes('негатив') || lower.includes('опускание') ||
    lower.includes('медленно опускать') || lower.includes('уступающий') || lower.includes('tempo');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔽 ЭКСЦЕНТРИЧЕСКИЕ ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('📚 ЧТО ЭТО:');
  lines.push('• Эксцентрика = фаза опускания (мышца удлиняется под нагрузкой)');
  lines.push('• Концентрика = фаза подъёма (мышца сокращается)');
  lines.push('');
  lines.push('💪 ПОЧЕМУ ЭКСЦЕНТРИКА ВАЖНА:');
  lines.push('• Мышца выдаёт на 20–40% БОЛЬШЕ силы в эксцентрике');
  lines.push('• Максимальный стимул для гипертрофии (микроповреждения)');
  lines.push('• Улучшает гибкость и снижает риск травм сухожилий');
  lines.push('• Эффективна при тендинопатии (протокол Alfredson)');
  lines.push('');
  lines.push('⚡ ПРОТОКОЛЫ:');
  lines.push('• 3-1-3 темп: 3 сек вниз, пауза 1 сек, 3 сек вверх');
  lines.push('• Суперэксцентрика: опускание 5–8 сек × 4–6 повт');
  lines.push('• Негативы: снизь вес на 10–20%, фокус только на опускании');
  lines.push('');
  lines.push('⚠️ ПРЕДУПРЕЖДЕНИЕ:');
  lines.push('• Сильная крепатура после первого применения — норма');
  lines.push('• Вводи постепенно: 1 эксцентрический подход → добавляй');
  lines.push('• Восстановление дольше обычного — планируй');
  return '\n\n' + lines.join('\n');
}
export function getContrastTraining(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('контраст') || lower.includes('pap') || lower.includes('постактивационна') ||
    lower.includes('прыжок после') || lower.includes('взрывная') && lower.includes('сила') ||
    lower.includes('спринт') && lower.includes('присед');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚡ КОНТРАСТНЫЕ ТРЕНИРОВКИ (PAP):');
  lines.push('');
  lines.push('📚 ПРИНЦИП PAP (Post-Activation Potentiation):');
  lines.push('• Тяжёлое упражнение "разогревает" нейромышечную систему');
  lines.push('• Следующее взрывное движение становится мощнее на 5–15%');
  lines.push('');
  lines.push('🏋️ → ⚡ ПРИМЕРЫ ПАРЫ:');
  lines.push('• Присед 85% × 3 повт → прыжки в высоту × 5 (отдых 3–5 мин)');
  lines.push('• Становая 85% × 3 → спринт 30 м × 3');
  lines.push('• Жим 80% × 3 → броски медбола от груди × 5');
  lines.push('• Болгарский присед × 4 → прыжки на одной ноге × 6');
  lines.push('');
  lines.push('⏱️ КЛЮЧЕВОЕ: отдых между тяжёлым и взрывным — 3–8 минут.');
  lines.push('Меньше = накопленная усталость. Больше = PAP исчезает.');
  lines.push('');
  lines.push('👥 ДЛЯ КОГО:');
  lines.push('• Атлеты (спринт, прыжки, единоборства)');
  lines.push('• Силовики, желающие добавить взрывную силу');
  lines.push('• Не для начинающих (нужна база силы)');
  return '\n\n' + lines.join('\n');
}
export function getPartialRepsStrategy(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('частичн') || lower.includes('неполная амплитуд') ||
    lower.includes('half rep') || lower.includes('21s') || lower.includes('верхняя часть') ||
    lower.includes('bottom half');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📐 ЧАСТИЧНЫЕ ПОВТОРЕНИЯ:');
  lines.push('');
  lines.push('✅ КОГДА ПОЛЕЗНЫ:');
  lines.push('• Дополнительный объём после отказа (насосить)');
  lines.push('• Акцент на конкретную фазу движения');
  lines.push('• Слабое звено в конкретном диапазоне');
  lines.push('');
  lines.push('🎯 ПРОТОКОЛЫ:');
  lines.push('• Метод 21: 7 нижних + 7 верхних + 7 полных (бицепс)');
  lines.push('• Частичные после полных: 10 полных → ещё 5 частичных с тем же весом');
  lines.push('• Пин-пресс: только верхние 10–15 см жима (локаут)');
  lines.push('• Нижняя часть приседа: пауза внизу на параллели');
  lines.push('');
  lines.push('⚠️ ОШИБКИ:');
  lines.push('• Полная замена полных повторений — потеряешь силу в диапазоне');
  lines.push('• Слишком большой вес — нарушение техники на полных повт');
  lines.push('');
  lines.push('💡 Используй как дополнение к полной амплитуде, не замену.');
  return '\n\n' + lines.join('\n');
}
export function getTrainingAroundLowerBack(message: string, injuryZones: string[]): string {
  const lower = message.toLowerCase();
  const hasBackInjury = injuryZones.some(z => z.toLowerCase().includes('поясниц') || z.toLowerCase().includes('спин'));
  const relevant = lower.includes('поясниц') || lower.includes('спина болит') || lower.includes('боль в спине') ||
    lower.includes('межпозвон') || lower.includes('грыжа') || lower.includes('прострел') || hasBackInjury;
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔴 ТРЕНИРОВКА ПРИ ПРОБЛЕМАХ С ПОЯСНИЦЕЙ:');
  if (hasBackInjury) lines.push('⚠️ Зона травмы: поясница — учитываю в рекомендациях.');
  lines.push('');
  lines.push('✅ БЕЗОПАСНЫЕ УПРАЖНЕНИЯ:');
  lines.push('• Планка (прямая и боковая) — стабилизация без нагрузки на диски');
  lines.push('• Ягодичный мост — ягодичные, разгрузка поясницы');
  lines.push('• Тяга горизонтального блока сидя — спина без осевой нагрузки');
  lines.push('• Жим лёжа, жим сидя — верх без нагрузки на LB');
  lines.push('• Велосипед, плавание — кардио без удара');
  lines.push('');
  lines.push('❌ ИЗБЕГАЙ:');
  lines.push('• Становая тяга (особенно стандарт) в острой фазе');
  lines.push('• Приседания со штангой (осевая нагрузка)');
  lines.push('• Гиперэкстензии с отягощением');
  lines.push('• Скручивания с нагрузкой');
  lines.push('');
  lines.push('🔄 РЕАБИЛИТАЦИЯ:');
  lines.push('• Упражнения МакКензи (разгибание лёжа)');
  lines.push('• Мёртвый жук (Dead Bug) — безопасная активация кора');
  lines.push('• Растяжка грушевидной мышцы и сгибателей бедра');
  lines.push('');
  lines.push('⚕️ При острой боли — врач сначала, тренировки потом.');
  return '\n\n' + lines.join('\n');
}
export function getStrengthStandardsByWeight(message: string, weightKg: number | null): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('норматив') || lower.includes('стандарт') || lower.includes('сколько надо жать') ||
    lower.includes('средний уровень') || lower.includes('для моего веса') || lower.includes('хорошо для');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📊 СТАНДАРТЫ СИЛЫ (% от веса тела):');
  lines.push('');
  const wStr = weightKg ? `(при твоём весе ~${weightKg} кг)` : '';
  lines.push(`Ориентиры для мужчин ${wStr}:`);
  lines.push('');
  lines.push('ПРИСЕД:');
  lines.push('• Новичок: 1× вес тела');
  lines.push('• Средний: 1.5× вес тела');
  lines.push('• Продвинутый: 2× вес тела');
  lines.push('• Элита: 2.5×+');
  lines.push('');
  lines.push('ЖИМ ЛЁЖА:');
  lines.push('• Новичок: 0.75× вес тела');
  lines.push('• Средний: 1.25× вес тела');
  lines.push('• Продвинутый: 1.75× вес тела');
  lines.push('• Элита: 2×+');
  lines.push('');
  lines.push('СТАНОВАЯ ТЯГА:');
  lines.push('• Новичок: 1.25× вес тела');
  lines.push('• Средний: 1.75× вес тела');
  lines.push('• Продвинутый: 2.5× вес тела');
  lines.push('• Элита: 3×+');
  lines.push('');
  if (weightKg) {
    lines.push(`Твои ориентиры (вес ${weightKg} кг):`);
    lines.push(`• Присед средний: ~${Math.round(weightKg * 1.5)} кг`);
    lines.push(`• Жим средний: ~${Math.round(weightKg * 1.25)} кг`);
    lines.push(`• Тяга средний: ~${Math.round(weightKg * 1.75)} кг`);
  }
  lines.push('');
  lines.push('📌 Для женщин нормативы на 20–30% ниже. Это ориентиры, не требования.');
  return '\n\n' + lines.join('\n');
}
export function getTrainingTypeWarmup(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('разминка') || lower.includes('разогрев') || lower.includes('как размяться') ||
    lower.includes('перед тренировкой') && lower.includes('разминка');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔥 ПРАВИЛЬНАЯ РАЗМИНКА ПО ТИПУ ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('🏋️ СИЛОВАЯ ТРЕНИРОВКА:');
  lines.push('• 5 мин общий разогрев (кардио низкой интенсивности)');
  lines.push('• Суставная гимнастика (круги плечами, тазом, коленями)');
  lines.push('• Специфичная разминка: пустой гриф → 50% → 70% → 85% → рабочий');
  lines.push('• Активация целевых мышц (жим: отжимания с паузой, резина)');
  lines.push('');
  lines.push('🏃 КАРДИО:');
  lines.push('• 5–10 мин ходьба быстрым шагом → постепенное ускорение');
  lines.push('• Динамические растяжки (не статика перед нагрузкой!)');
  lines.push('');
  lines.push('⚽ ФУНКЦИОНАЛЬНАЯ/HIIT:');
  lines.push('• 3–5 мин прыжки скакалки / jumping jacks');
  lines.push('• Приседания с весом тела × 15');
  lines.push('• Выпады × 10/сторону');
  lines.push('• Инчворм × 5');
  lines.push('');
  lines.push('🧘 СТРЕТЧИНГ:');
  lines.push('• Разогрев 5 мин динамикой ДО статических растяжек');
  lines.push('• Статика на холодных мышцах = риск травмы');
  lines.push('');
  lines.push('⏱️ Минимум: 5–7 мин. Оптимум: 10–15 мин.');
  return '\n\n' + lines.join('\n');
}
export function getOutdoorTrainingGuide(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('на улице') || lower.includes('outdoor') || lower.includes('воркаут') ||
    lower.includes('на свежем воздухе') || lower.includes('парк') && lower.includes('тренировка') ||
    lower.includes('без зала');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🌳 ТРЕНИРОВКИ НА УЛИЦЕ:');
  lines.push('');
  lines.push('🏋️ ОБОРУДОВАНИЕ ВОРКАУТ-ПЛОЩАДКИ:');
  lines.push('• Турник: подтягивания, вис, австралийские подтягивания');
  lines.push('• Брусья: отжимания на брусьях, подъём ног');
  lines.push('• Шведская стенка: пресс, ноги, растяжка');
  lines.push('');
  lines.push('🌿 БЕЗ ОБОРУДОВАНИЯ В ПАРКЕ:');
  lines.push('• Спринт-интервалы (30 сек × 8 с отдыхом 90 сек)');
  lines.push('• Горки: бег вверх × 8–10 повторений');
  lines.push('• Скамейка: отжимания под углом, прыжки, ступеньки');
  lines.push('• Бег + функциональная схема (6 упражнений × 1 мин)');
  lines.push('');
  lines.push('🇷🇺 СЕЗОННОСТЬ:');
  lines.push('• Лето: идеально, добавь воду и защиту от солнца');
  lines.push('• Осень: дождевик/водостойкая одежда, нескользкая обувь');
  lines.push('• Зима: термобельё, шапка, варежки; сократи тренировку вдвое');
  lines.push('• Весна: следи за гололёдом, одевайся слоями');
  lines.push('');
  lines.push('⚡ ПЛЮС УЛИЦЫ: витамин D, свежий воздух, дофамин от природы.');
  lines.push('МИНУС: погода, скользко зимой, нет горячего душа рядом.');
  return '\n\n' + lines.join('\n');
}
export function getAltitudeTraining(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('горы') || lower.includes('высота') || lower.includes('altitude') ||
    lower.includes('горная') && lower.includes('тренировка') || lower.includes('сочи') ||
    lower.includes('альп') || lower.includes('кавказ') && lower.includes('тренировк');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⛰️ ТРЕНИРОВКИ В ГОРАХ / НА ВЫСОТЕ:');
  lines.push('');
  lines.push('🧪 ЧТО ПРОИСХОДИТ:');
  lines.push('• Меньше кислорода → организм адаптируется: больше эритроцитов, VO2max↑');
  lines.push('• Метод "живи высоко — тренируйся низко" (Live High Train Low) = профессионал');
  lines.push('');
  lines.push('📈 АДАПТАЦИЯ:');
  lines.push('• 1–3 дня: снижение производительности, одышка, голова');
  lines.push('• 1–2 недели: начало адаптации, восстановление ЧСС');
  lines.push('• 3–4 недели: полная адаптация, эффект от тренировок');
  lines.push('');
  lines.push('🏋️ ТРЕНИРОВКИ В ГОРАХ:');
  lines.push('• Снизь интенсивность на 10–20% в первую неделю');
  lines.push('• Акцент на объём, не интенсивность');
  lines.push('• Восстановление дольше — планируй');
  lines.push('');
  lines.push('💧 ВАЖНО:');
  lines.push('• Гидратация: воздух суше, потери воды больше (+500–1000 мл/день)');
  lines.push('• Железо и B12: особенно важны при высотных тренировках');
  lines.push('');
  lines.push('🇷🇺 В России: Кавказ, Эльбрус (5642 м), Сочи (~600 м) — популярные места.');
  return '\n\n' + lines.join('\n');
}
export function getPreCompetitionPrep(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('соревнован') || lower.includes('турнир') || lower.includes('пик форм') ||
    lower.includes('выступлен') || lower.includes('перед стартом') || lower.includes('пиковая нед');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏆 ПОДГОТОВКА К СОРЕВНОВАНИЯМ:');
  lines.push('');
  lines.push('📅 ПИКОВАЯ НЕДЕЛЯ (за 1 нед до старта):');
  lines.push('• Снизь объём на 40–60% (не интенсивность!)');
  lines.push('• Оставь 2–3 тренировки с привычными весами (не пробовать новое)');
  lines.push('• Углеводная загрузка: за 3–4 дня до + 50–100 г углей сверх нормы');
  lines.push('• Сон: 9 ч минимум, за 3 ночи до старта');
  lines.push('');
  lines.push('📅 ДЕНЬ СОРЕВНОВАНИЙ:');
  lines.push('• За 3–4 ч: полноценный приём пищи (углеводы + умеренный белок)');
  lines.push('• За 30–60 мин: быстрые углеводы (банан, сок, энергетик без газа)');
  lines.push('• Разминка: 15–20 мин по привычной схеме');
  lines.push('• Первый подход: 70–75% — не рвись сразу на максимум');
  lines.push('');
  lines.push('🧠 МЕНТАЛЬНАЯ ПОДГОТОВКА:');
  lines.push('• Визуализация: 5 мин/день представляй успешное выступление');
  lines.push('• Рутина: та же музыка, та же одежда что на тренировках');
  lines.push('• "Нервы = готовность". Тревога перед стартом — нормально и полезно');
  lines.push('');
  lines.push('🇷🇺 Российские соревнования: ФПРС (пауэрлифтинг), ФБР (бодибилдинг).');
  return '\n\n' + lines.join('\n');
}
export function getBreathingDuringExercise(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('дыхани') || lower.includes('задержк') && lower.includes('дыхан') ||
    lower.includes('вальсальв') || lower.includes('дышать') && lower.includes('тренировк') ||
    lower.includes('breathing') || lower.includes('задерж') && lower.includes('воздух');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💨 ПРАВИЛЬНОЕ ДЫХАНИЕ ВО ВРЕМЯ ТРЕНИРОВОК:');
  lines.push('');
  lines.push('🏋️ СИЛОВЫЕ УПРАЖНЕНИЯ:');
  lines.push('• Вдох → фаза опускания (эксцентрика)');
  lines.push('• Выдох → фаза подъёма (концентрика, усилие)');
  lines.push('• Пример: вдох при опускании штанги, выдох при жиме вверх');
  lines.push('');
  lines.push('⚡ МАНЁВР ВАЛЬСАЛЬВЫ (тяжёлые базовые):');
  lines.push('• Глубокий вдох → задержка дыхания → напряжение кора → усилие');
  lines.push('• Создаёт внутрибрюшное давление — защищает позвоночник');
  lines.push('• Используй при 1–3 повт максимальных весах');
  lines.push('• НЕ для гипертоников и начинающих!');
  lines.push('');
  lines.push('🏃 КАРДИО:');
  lines.push('• Нос (вдох) + рот (выдох) — оптимально');
  lines.push('• Паттерн 2:2 (2 шага вдох, 2 шага выдох) или 3:2');
  lines.push('• Бег: дыши животом (диафрагмальное), не грудью');
  lines.push('');
  lines.push('🧘 ДЫХАНИЕ ДЛЯ ВОССТАНОВЛЕНИЯ:');
  lines.push('• Метод 4-7-8: вдох 4 сек → задержка 7 → выдох 8 (активирует парасимпатику)');
  lines.push('• Боксёрское дыхание: вдох носом, резкий выдох ртом с усилием');
  return '\n\n' + lines.join('\n');
}
export function getProgressiveOverloadTracking(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('прогрессия нагрузки') || lower.includes('прогрессивная') ||
    lower.includes('как прогрессировать') || lower.includes('добавлять вес') ||
    lower.includes('когда повышать вес') || lower.includes('прогресс в весах');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📈 КАК ОТСЛЕЖИВАТЬ ПРОГРЕССИЮ НАГРУЗКИ:');
  lines.push('');
  lines.push('🔢 ВИДЫ ПРОГРЕССИИ:');
  lines.push('• Весовая: +2.5 кг каждую неделю (новичок) / каждые 2–4 нед (средний)');
  lines.push('• Объёмная: те же веса, но +1 подход или +2 повт');
  lines.push('• Плотность: те же вес/объём, но меньше отдыха');
  lines.push('• Техническая: лучшее качество выполнения с тем же весом');
  lines.push('');
  lines.push('📊 ПРАВИЛО "2+2":');
  lines.push('• Если выполнил верхний предел диапазона в 2 сетах подряд → повышай вес');
  lines.push('• Пример: диапазон 8–12 → сделал 12×3 → следующая тренировка +2.5 кг');
  lines.push('');
  lines.push('📓 ЧТО ЗАПИСЫВАТЬ:');
  lines.push('• Дата, упражнение, вес × повт × подходы');
  lines.push('• RPE (1–10) — субъективная тяжесть');
  lines.push('• Примечание о технике/самочувствии');
  lines.push('');
  lines.push('📱 ПРИЛОЖЕНИЯ: Strong, Hevy, FitNotes (англоязычные), Giron (твой трекер!)');
  lines.push('');
  lines.push('💡 Нет записей = нет прогресса. Тренировочный дневник = обязателен.');
  return '\n\n' + lines.join('\n');
}
export function getFastedTrainingAnalysis(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('натощак') || lower.includes('без завтрак') && lower.includes('тренировка') ||
    lower.includes('тренировка утром') && (lower.includes('не ел') || lower.includes('голодный')) ||
    lower.includes('fasted') || lower.includes('интервальное голодание') && lower.includes('тренировка');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('☀️ ТРЕНИРОВКА НАТОЩАК — ЗА И ПРОТИВ:');
  lines.push('');
  lines.push('✅ ПЛЮСЫ:');
  lines.push('• Высокий уровень норэпинефрина → больше жиросжигания (теоретически)');
  lines.push('• Удобно при IF (интервальное голодание)');
  lines.push('• Нет дискомфорта от переполненного желудка');
  lines.push('');
  lines.push('❌ МИНУСЫ:');
  lines.push('• Интенсивность и сила: до -20% при натощаковой тренировке');
  lines.push('• Распад мышечного белка (катаболизм) выше — критично при наборе');
  lines.push('• Головокружение, усталость, особенно при базовых упражнениях');
  lines.push('');
  lines.push('🔬 ЧТО ГОВОРИТ НАУКА:');
  lines.push('• За 24 ч общее жиросжигание одинаково — не важно, натощак или нет');
  lines.push('• Для кардио низкой интенсивности — подходит');
  lines.push('• Для силовых и HIIT — лучше с едой');
  lines.push('');
  lines.push('🍌 ЕСЛИ ХОЧЕШЬ НАТОЩАК:');
  lines.push('• 3–5 г BCAA или 10 г незаменимых АК за 15 мин до — снизит катаболизм');
  lines.push('• Или хотя бы протеин в воде');
  lines.push('');
  lines.push('💡 Самый важный фактор — можешь ли ты тренироваться качественно?');
  return '\n\n' + lines.join('\n');
}
export function getTrainingDuringIllness(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('болею') || lower.includes('простуда') || lower.includes('грипп') ||
    lower.includes('насморк') || lower.includes('температур') || lower.includes('можно ли тренироваться') &&
    lower.includes('болен') || lower.includes('тренировка при болезни');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤒 ТРЕНИРОВКИ ВО ВРЕМЯ БОЛЕЗНИ:');
  lines.push('');
  lines.push('📏 ПРАВИЛО ШЕИ:');
  lines.push('• Симптомы ВЫШЕ шеи (насморк, лёгкое першение): тренировка допустима');
  lines.push('• Симптомы НИЖЕ шеи (кашель, ломота, желудок): СТОП тренировка');
  lines.push('• Температура > 37.5°C: СТОП категорически');
  lines.push('');
  lines.push('⚠️ ПОЧЕМУ НЕЛЬЗЯ ПРИ ТЕМПЕРАТУРЕ:');
  lines.push('• Риск миокардита (воспаление сердца) — серьёзно и долго лечится');
  lines.push('• Ухудшение иммунного ответа → болезнь затягивается');
  lines.push('• Регресс: 3–5 дней болезни ≠ потеря силы (понадобится 1–2 нед для потери)');
  lines.push('');
  lines.push('✅ ЧТО МОЖНО ПРИ ЛЁГКОМ НЕДОМОГАНИИ:');
  lines.push('• Прогулка (не пробежка)');
  lines.push('• Лёгкие растяжки/йога');
  lines.push('• Снизь вес на 40–50%, только лёгкая помпа');
  lines.push('');
  lines.push('🔄 ВОЗВРАЩЕНИЕ ПОСЛЕ БОЛЕЗНИ:');
  lines.push('• После температуры: 2–3 дня после нормализации перед тренировкой');
  lines.push('• Первая неделя: 60% обычной нагрузки → наращивай постепенно');
  return '\n\n' + lines.join('\n');
}
export function getPyramidTraining(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('пирамида') || lower.includes('pyramid') || lower.includes('нарастающая') ||
    lower.includes('убывающая') && lower.includes('нагрузка') || lower.includes('схема подходов');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔺 ПИРАМИДНЫЕ СХЕМЫ ТРЕНИНГА:');
  lines.push('');
  lines.push('1️⃣ ВОСХОДЯЩАЯ ПИРАМИДА (классика):');
  lines.push('• Вес ↑, повт ↓ с каждым подходом');
  lines.push('• Пример (жим): 12×60 кг → 10×70 → 8×80 → 6×90');
  lines.push('• Плюс: естественная разминка, постепенный выход на рабочий вес');
  lines.push('• Минус: первые подходы не максимально нагружают целевую мышцу');
  lines.push('');
  lines.push('2️⃣ НИСХОДЯЩАЯ ПИРАМИДА:');
  lines.push('• Вес ↓, повт ↑ с каждым подходом');
  lines.push('• Пример: 5×90 → 8×80 → 12×70 → 15×60');
  lines.push('• Плюс: максимальное усилие в начале тренировки (свежий)');
  lines.push('• Требует хорошей разминки перед стартом');
  lines.push('');
  lines.push('3️⃣ ДВОЙНАЯ ПИРАМИДА (гора):');
  lines.push('• Вес ↑ до пика, затем ↓ (6 подходов)');
  lines.push('• Большой объём тренировки');
  lines.push('');
  lines.push('💡 Для гипертрофии: нисходящая (больше механического напряжения в начале)');
  lines.push('Для силы: восходящая (разминка + выход на 1–3 максимальных повторения)');
  return '\n\n' + lines.join('\n');
}
export function getWorkoutDurationEfficiency(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('сколько длится') || lower.includes('длительность') ||
    lower.includes('час в зале') || lower.includes('2 часа тренировки') || lower.includes('долго тренироваться') ||
    lower.includes('эффективность тренировки') || lower.includes('КПД');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏱️ ОПТИМАЛЬНАЯ ДЛИТЕЛЬНОСТЬ ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('📊 ИССЛЕДОВАНИЯ:');
  lines.push('• Тестостерон начинает снижаться после 60–75 мин интенсивной нагрузки');
  lines.push('• Кортизол продолжает расти — катаболический режим');
  lines.push('• При тренировке 45–60 мин: оптимальный гормональный профиль');
  lines.push('');
  lines.push('⚡ ФОРМАТЫ ПО ЭФФЕКТИВНОСТИ:');
  lines.push('• 45 мин: высокая интенсивность, 3–4 упражнения, суперсеты');
  lines.push('• 60 мин: стандарт — разминка + 5–6 упражнений + заминка');
  lines.push('• 75–90 мин: базовый силовой тренинг с полным отдыхом');
  lines.push('• >90 мин: оправдано только при специализации (пауэрлифтинг, объёмный период)');
  lines.push('');
  lines.push('🔑 КАК СОКРАТИТЬ НЕ ТЕРЯЯ КАЧЕСТВО:');
  lines.push('• Суперсеты антагонистов (жим + тяга без паузы)');
  lines.push('• Готовь снаряды заранее');
  lines.push('• Отдых 90 сек, не 5 мин в телефоне');
  lines.push('• Убери кардио отдельно, не совмещай с силовой');
  lines.push('');
  lines.push('💡 Лучше 45 эффективных минут, чем 2 часа с телефоном между подходами.');
  return '\n\n' + lines.join('\n');
}
export function getCrossFitBasics(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('кроссфит') || lower.includes('crossfit') || lower.includes('wod') ||
    lower.includes('функциональные тренировки') || lower.includes('amrap') || lower.includes('emom') ||
    lower.includes('форжа');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚡ КРОССФИТ — ОСНОВЫ:');
  lines.push('');
  lines.push('📋 ЧТО ЭТО:');
  lines.push('• Высокоинтенсивные функциональные тренировки (HIIT + гимнастика + тяжёлая атлетика)');
  lines.push('• Постоянно меняющиеся WOD (Workout of the Day)');
  lines.push('• Акцент на общей физической подготовке');
  lines.push('');
  lines.push('✅ ПЛЮСЫ КРОССФИТА:');
  lines.push('• Высокий расход калорий');
  lines.push('• Развивает все компоненты физической формы');
  lines.push('• Сообщество, мотивация, соревновательный дух');
  lines.push('• Функциональные движения (переносятся в жизнь)');
  lines.push('');
  lines.push('❌ РИСКИ:');
  lines.push('• Рабдомиолиз при слишком интенсивном старте (редко, но реально)');
  lines.push('• Техника жертвуется ради скорости → травмы');
  lines.push('• Не оптимален для чистой гипертрофии или максимальной силы');
  lines.push('');
  lines.push('🏋️ КАК БЕЗОПАСНО НАЧАТЬ:');
  lines.push('• Выбери сертифицированный бокс (не "похожее на CF")');
  lines.push('• On-ramp программа для новичков (обязательно)');
  lines.push('• Учи технику рывка/толчка ДО высокоинтенсивных WOD');
  lines.push('');
  lines.push('🇷🇺 В России: много кроссфит-боксов в крупных городах, федерации РФ по CF.');
  return '\n\n' + lines.join('\n');
}
export function getBFRTraining(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('bfr') || lower.includes('окклюзионный') || lower.includes('бфр') ||
    lower.includes('жгут') && lower.includes('тренировка') || lower.includes('кровоток') && lower.includes('ограничен');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🩸 ТРЕНИНГ С ОГРАНИЧЕНИЕМ КРОВОТОКА (BFR):');
  lines.push('');
  lines.push('🔬 КАК РАБОТАЕТ:');
  lines.push('• Жгут/манжета ограничивает венозный отток (не артериальный!)');
  lines.push('• Метаболиты накапливаются → мощный гипертрофический стимул');
  lines.push('• Достаточно 20–30% от 1ПМ для роста мышц');
  lines.push('');
  lines.push('✅ ПЛЮСЫ:');
  lines.push('• Рост мышц без тяжёлых весов (реабилитация!)');
  lines.push('• Идеально при травмах суставов');
  lines.push('• Активация быстрых волокон при низкой нагрузке');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ:');
  lines.push('• 30 повт → 30 сек отдых → 15 → 30 сек → 15 → 30 сек → 15');
  lines.push('• Давление жгута: 50–60% от полной окклюзии (ощутимое давление, не боль)');
  lines.push('• Жгуты только на конечности (бёдра, плечи)');
  lines.push('');
  lines.push('⚠️ ПРОТИВОПОКАЗАНИЯ:');
  lines.push('• Варикоз, тромбозы, сердечно-сосудистые заболевания');
  lines.push('• Диабетическая нейропатия');
  lines.push('• Беременность');
  lines.push('');
  lines.push('💡 BFR — нишевый инструмент. Не замена обычному тренингу, но ценное дополнение.');
  return '\n\n' + lines.join('\n');
}
export function getSeasonalPeriodizationRec(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('периодизация') && (lower.includes('год') || lower.includes('сезон')) ||
    lower.includes('макроцикл') || lower.includes('годовой план') || lower.includes('план на год') ||
    lower.includes('долгосрочный план') || lower.includes('периодизация для любителей');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📅 ГОДОВАЯ ПЕРИОДИЗАЦИЯ ДЛЯ ЛЮБИТЕЛЯ:');
  lines.push('');
  lines.push('🗓️ 4 ФАЗЫ ГОДА:');
  lines.push('');
  lines.push('ФАЗА 1 — БАЗА (8–12 нед, осень):');
  lines.push('• Высокий объём, умеренная интенсивность');
  lines.push('• 3–5 подходов × 8–15 повт');
  lines.push('• Цель: накопить объём, улучшить технику');
  lines.push('');
  lines.push('ФАЗА 2 — СИЛА (6–8 нед, зима):');
  lines.push('• Снизить объём, поднять интенсивность');
  lines.push('• 4–6 подходов × 3–6 повт');
  lines.push('• Цель: конвертировать объём в силу');
  lines.push('');
  lines.push('ФАЗА 3 — ПИКОВАЯ (3–4 нед, весна):');
  lines.push('• Минимальный объём, максимальная интенсивность');
  lines.push('• 2–4 подхода × 1–3 повт');
  lines.push('• Цель: тестирование новых максимумов');
  lines.push('');
  lines.push('ФАЗА 4 — ПЕРЕХОДНАЯ/ДЕLOAD (2–4 нед, лето):');
  lines.push('• Снижение всего на 40–60%');
  lines.push('• Активный отдых, спорт, туризм');
  lines.push('• Цель: восстановление ЦНС, мотивации');
  lines.push('');
  lines.push('💡 Для натурального атлета: 2–3 таких цикла в год = постоянный прогресс.');
  return '\n\n' + lines.join('\n');
}
export function getSmartGoalSetting(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('поставить цель') || lower.includes('умная цель') || lower.includes('smart') &&
    lower.includes('цель') || lower.includes('не знаю с чего начать') || lower.includes('какую цель') ||
    lower.includes('реалистичная цель');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🎯 ПОСТАНОВКА УМНЫХ ЦЕЛЕЙ В ФИТНЕСЕ:');
  lines.push('');
  lines.push('📋 SMART ДЛЯ СПОРТА:');
  lines.push('• S — Конкретная: "подтянуться 10 раз" > "стать сильнее"');
  lines.push('• M — Измеримая: в кг, повторениях, сантиметрах');
  lines.push('• A — Достижимая: реальная за период');
  lines.push('• R — Значимая: почему это важно для тебя');
  lines.push('• T — Ограниченная по времени: "за 3 месяца"');
  lines.push('');
  lines.push('🏋️ ХОРОШИЕ ЦЕЛИ:');
  lines.push('• "Жать 100 кг через 6 месяцев (сейчас 80 кг)"');
  lines.push('• "Сбросить 5 кг за 10 недель при дефиците 500 ккал"');
  lines.push('• "Подтянуться 1 раз через 8 недель нулевых подтягиваний"');
  lines.push('');
  lines.push('❌ ПЛОХИЕ ЦЕЛИ:');
  lines.push('• "Похудеть к лету" (не измеримо, не конкретно)');
  lines.push('• "Накачаться" (без параметров и срока)');
  lines.push('• "Стать здоровее" (как измерить прогресс?)');
  lines.push('');
  lines.push('⚡ ПРОЦЕССНЫЕ ЦЕЛИ VS РЕЗУЛЬТАТНЫЕ:');
  lines.push('• Результатная: "сбросить 10 кг" (зависит от многих факторов)');
  lines.push('• Процессная: "тренироваться 4×/нед, не пропускать" (под твоим контролем!)');
  lines.push('• Комбинируй оба типа для максимальной мотивации.');
  return '\n\n' + lines.join('\n');
}
export function getRestPeriodsBetweenSets(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('сколько отдыхать') || lower.includes('пауза между подходами') ||
    lower.includes('отдых между подходами') || lower.includes('перерыв между') ||
    lower.includes('время отдыха') || lower.includes('rest period');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏱️ ОПТИМАЛЬНЫЙ ОТДЫХ МЕЖДУ ПОДХОДАМИ:');
  lines.push('');
  lines.push('🎯 ПО ЦЕЛЯМ:');
  lines.push('');
  lines.push('МАКСИМАЛЬНАЯ СИЛА (1–5 повт):');
  lines.push('• 3–10 минут (полное восстановление АТФ и фосфокреатина)');
  lines.push('• При > 85% 1ПМ: всегда минимум 3–5 мин');
  lines.push('');
  lines.push('ГИПЕРТРОФИЯ (6–15 повт):');
  lines.push('• 1–3 минуты оптимально');
  lines.push('• 2 мин = лучший баланс объёма и качества');
  lines.push('• Слишком короткий (<1 мин) — снижает вес, объём страдает');
  lines.push('');
  lines.push('ВЫНОСЛИВОСТЬ / ПОХУДЕНИЕ (15+ повт):');
  lines.push('• 30–90 секунд');
  lines.push('• Суперсеты — ещё короче при том же объёме');
  lines.push('');
  lines.push('⚡ АНТАГОНИСТИЧЕСКИЕ СУПЕРСЕТЫ:');
  lines.push('• Жим + тяга: отдых после тяги = отдых жим (60–90 сек суммарно)');
  lines.push('• Не снижает силу в обоих движениях!');
  lines.push('');
  lines.push('📱 СОВЕТ: поставь таймер — объективный отдых без "залипания" в телефон.');
  return '\n\n' + lines.join('\n');
}
export function getTrainingBoredomFix(message: string): string {
  const relevant = /скучно|надоело|однообразно|устал от|мотивац|монотон|boring/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🎮 ПОБЕДА НАД СКУКОЙ В ТРЕНИРОВКАХ:');
  lines.push('');
  lines.push('🔄 РАЗНООБРАЗИЕ БЕЗ ПОТЕРИ ПРОГРЕССА:');
  lines.push('• Смени порядок упражнений на 4 недели');
  lines.push('• Добавь новый паттерн движений (горизонталь → вертикаль)');
  lines.push('• Попробуй другой спортинвентарь: гантели → штанга → тренажёр → кабель');
  lines.push('');
  lines.push('🎯 ИГРОВЫЕ ЭЛЕМЕНТЫ:');
  lines.push('• Ставь мини-цели на каждую тренировку (побить прошлый рекорд)');
  lines.push('• Считай тоннаж и отслеживай рост');
  lines.push('• Timeboxed тренировки: сколько успею за 45 мин?');
  lines.push('');
  lines.push('🎵 ВНЕШНИЕ СТИМУЛЫ:');
  lines.push('• Новый плейлист / подкаст');
  lines.push('• Другое время суток');
  lines.push('• Партнёр по тренировкам');
  lines.push('');
  lines.push('⚠️ НАСТОЯЩАЯ СКУКА = сигнал к смене программы (каждые 8–12 нед)');
  return '\n\n' + lines.join('\n');
}
export function getNaturalTrainingFrequency(message: string): string {
  const relevant = /натурал|без химии|без стероид|фармакологи|enhanced|natural athelete|восстановлени.+частот/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ ЧАСТОТА ТРЕНИРОВОК ДЛЯ НАТУРАЛЬНОГО АТЛЕТА:');
  lines.push('');
  lines.push('🔬 КЛЮЧЕВОЕ ОТЛИЧИЕ:');
  lines.push('• Натурал: синтез белка повышен 24–48 ч после нагрузки → нужна частая стимуляция');
  lines.push('• Каждую мышцу 2–3 раза в неделю > 1 раз в неделю (при одинаковом объёме)');
  lines.push('');
  lines.push('📋 ОПТИМАЛЬНЫЕ СХЕМЫ:');
  lines.push('• 3 дня/нед: Full Body — каждая мышца 3×/нед');
  lines.push('• 4 дня/нед: Upper/Lower — каждая мышца 2×/нед');
  lines.push('• 5–6 дней/нед: Push/Pull/Legs × 2 — каждая мышца 2×/нед');
  lines.push('');
  lines.push('⚠️ ИЗБЕГАТЬ:');
  lines.push('• Бро-сплит 1 раз/нед — неоптимально для гипертрофии у натуралов');
  lines.push('• Слишком высокий объём за сессию (>25 рабочих подходов на мышцу)');
  lines.push('');
  lines.push('💡 ПРИНЦИП: суммарный объём за неделю важнее, чем объём за тренировку');
  return '\n\n' + lines.join('\n');
}
export function getSplitsByGoal(message: string): string {
  const relevant = /сплит.+цел|программ.+под цель|схем.+тренировок|выбрат.+сплит|split.+goal/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📋 ВЫБОР СХЕМЫ ТРЕНИРОВОК ПОД ЦЕЛЬ:');
  lines.push('');
  lines.push('💪 МАКСИМАЛЬНАЯ ГИПЕРТРОФИЯ:');
  lines.push('• Push/Pull/Legs × 2 (6 дней/нед) или Upper/Lower × 2 (4 дня)');
  lines.push('• 10–20 рабочих подходов на мышцу/нед, 6–20 повторений');
  lines.push('');
  lines.push('🏋️ МАКСИМАЛЬНАЯ СИЛА:');
  lines.push('• 5/3/1, Conjugate, GZCL — 3–4 дня/нед');
  lines.push('• Основные движения: присед, жим, тяга, жим стоя');
  lines.push('• 1–5 повторений в рабочих подходах');
  lines.push('');
  lines.push('🔥 ЖИРОСЖИГАНИЕ + сохранение мышц:');
  lines.push('• Full Body 3 раза/нед + 2–3 кардио-сессии');
  lines.push('• Снижение объёма, сохранение интенсивности');
  lines.push('');
  lines.push('🏃 СПОРТИВНАЯ ФОРМА (атлетизм):');
  lines.push('• Upper/Lower 4 дня + 2 дня ОФП/кардио');
  lines.push('• Акцент: взрывная сила, мобильность, кардио');
  lines.push('');
  lines.push('👶 НОВИЧОК (любая цель):');
  lines.push('• Full Body 3 раза/нед — максимальный отклик от минимума');
  return '\n\n' + lines.join('\n');
}
export function getEccentricOverloadAdv(message: string): string {
  const relevant = /эксцентрик|негатив.+фаза|accentuated eccentric|eccentric overload|негатив.+подход/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⬇️ ЭКСЦЕНТРИЧЕСКАЯ ПЕРЕГРУЗКА — продвинутая техника:');
  lines.push('');
  lines.push('🔬 ПРИНЦИП:');
  lines.push('• Эксцентрика (опускание) допускает на 20–40% больше веса, чем концентрика');
  lines.push('• Больше эксцентрического напряжения → больший гипертрофический стимул');
  lines.push('');
  lines.push('📋 МЕТОДЫ:');
  lines.push('• Форсированные негативы: партнёр помогает поднять → ты медленно опускаешь 5 сек');
  lines.push('• Ступенчатое снятие: 2 руки подъём, 1 рука опускание');
  lines.push('• Акцентированная эксцентрика: 4–6 сек опускание без партнёра');
  lines.push('');
  lines.push('⚡ ПРИМЕНЕНИЕ:');
  lines.push('• Подтягивания (прыжок вверх → медленный спуск)');
  lines.push('• Жим лёжа (партнёр добавляет 10–15% на опускании)');
  lines.push('• Сгибание на бицепс: 2 руки вверх → 1 рука вниз');
  lines.push('');
  lines.push('⚠️ ОСТОРОЖНО: высокий риск DOMS, вводить постепенно, не чаще 1×/нед на мышцу');
  return '\n\n' + lines.join('\n');
}
export function getGripForPullingStrength(message: string): string {
  const relevant = /хват.+тяг|хват.+подтягива|сила хвата.+спин|grip.+pull|forearm.+pull/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('✊ ХВАТ ДЛЯ ТЯГОВЫХ ДВИЖЕНИЙ:');
  lines.push('');
  lines.push('🎯 ПРОБЛЕМА: хват отказывает раньше спины на:');
  lines.push('• Становой тяге >80 кг');
  lines.push('• Подтягиваниях >8 повторений');
  lines.push('• Тяге штанги/гантелей');
  lines.push('');
  lines.push('📋 РЕШЕНИЯ:');
  lines.push('• Разнохват (становая): одна рука пронация, другая супинация — +10–15% веса');
  lines.push('• Крюкообразный хват: большой под средний+безымянный — пауэрлифтинг стиль');
  lines.push('• Лямки на max-подходах, голый хват на объёмных');
  lines.push('');
  lines.push('💪 РАЗВИТИЕ ХВАТА:');
  lines.push('• Фермерская прогулка 40–60 м × 3 подхода');
  lines.push('• Статическое висение на перекладине 3 × max');
  lines.push('• Зажим толстого грифа или Fat Gripz');
  lines.push('• Вращение запястья с гантелью');
  lines.push('');
  lines.push('📅 ЧАСТОТА: 2–3 раза/нед, в конце тренировки');
  return '\n\n' + lines.join('\n');
}
export function getOverheadPressingHealth(message: string): string {
  const relevant = /жим вверх|жим стоя|жим над головой|overhead press|жми над головой|болит плечо.+жим/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('☝️ ЖИМ СТОЯ — ЗДОРОВЫЕ ПЛЕЧИ:');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА БЕЗ ТРАВМ:');
  lines.push('• Хват чуть шире плеч, запястья над локтями');
  lines.push('• Гриф по груди → стартовое положение');
  lines.push('• Отводи голову назад при подъёме, не шею');
  lines.push('• Полное разгибание вверху: "вожми уши между руками"');
  lines.push('• Натяни пресс и ягодицы — не прогибай поясницу');
  lines.push('');
  lines.push('🔧 ЧАСТЫЕ ОШИБКИ:');
  lines.push('• Выдвижение головы вперёд → нагрузка на шею');
  lines.push('• Локти разъезжаются → нестабильность');
  lines.push('• Гиперэкстензия поясницы → боль в пояснице');
  lines.push('');
  lines.push('📋 ПРОГРЕССИЯ:');
  lines.push('• Начни с гантелей — более естественная траектория');
  lines.push('• Landmine press — облегчённый вариант при болях в плечах');
  lines.push('• Жим Арнольда — вращение добавляет нагрузку на ротаторы');
  lines.push('');
  lines.push('💪 ВСПОМОГАТЕЛЬНЫЕ: боковые подъёмы, тяга в наклоне, ротаторы');
  return '\n\n' + lines.join('\n');
}
export function getTrainingAdaptationTimeline(message: string): string {
  const relevant = /когда увижу результат|сколько времени|как долго|адаптаци.+тренировк|timeline|результат через/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📅 СРОКИ АДАПТАЦИИ К ТРЕНИРОВКАМ:');
  lines.push('');
  lines.push('⚡ 1–4 НЕДЕЛИ:');
  lines.push('• Нейронная адаптация: мозг учится активировать мышцы');
  lines.push('• Сила растёт без роста мышц — просто лучше координация');
  lines.push('• Крепатура постепенно снижается');
  lines.push('');
  lines.push('💪 4–8 НЕДЕЛЬ:');
  lines.push('• Первые видимые изменения (при дефиците или профиците)');
  lines.push('• Гипертрофия: появляется плотность мышц');
  lines.push('• Выносливость: ощутимый прогресс');
  lines.push('');
  lines.push('🏆 2–6 МЕСЯЦЕВ:');
  lines.push('• Значимые изменения состава тела');
  lines.push('• Сила выросла на 20–50% от начального уровня');
  lines.push('• Навык движений отточен');
  lines.push('');
  lines.push('🔄 6–12+ МЕСЯЦЕВ:');
  lines.push('• Трансформация тела, заметная окружающим');
  lines.push('• Переход от новичка к среднему уровню');
  lines.push('');
  lines.push('⚠️ Фотки каждые 4 недели — прогресс виден в сравнении, не ежедневно');
  return '\n\n' + lines.join('\n');
}
export function getTrainingForLongevity(message: string): string {
  const relevant = /долголети|здоровье.+долго|тренировки.+старост|longevity|здоровье на долго|здоровый образ жизни/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('♾️ ТРЕНИРОВКИ ДЛЯ ДОЛГОЙ ЖИЗНИ:');
  lines.push('');
  lines.push('🏆 ТОП-5 УПРАЖНЕНИЙ ПО ДАННЫМ НАУКИ:');
  lines.push('• Силовые тренировки: сохраняют мышцы и кости, снижают риск падений');
  lines.push('• Ходьба: 7000–10000 шагов/день снижают смертность на 50–70%');
  lines.push('• Зона 2 кардио: 150 мин/нед = митохондриальное здоровье');
  lines.push('• Мобильность: сохраняет диапазон движений и независимость');
  lines.push('• Баланс и координация: профилактика падений (убивает пожилых)');
  lines.push('');
  lines.push('📋 РЕКОМЕНДОВАННАЯ СХЕМА:');
  lines.push('• 2–3 силовых в неделю (включают все основные группы)');
  lines.push('• 150–300 мин умеренного кардио / 75–150 мин интенсивного');
  lines.push('• Ежедневная мобильность: 10–15 мин');
  lines.push('');
  lines.push('🔬 МАРКЕРЫ ДОЛГОЛЕТИЯ:');
  lines.push('• VO2max >35 мл/кг/мин для мужчин, >30 для женщин');
  lines.push('• Мышечная масса выше среднего для возраста');
  lines.push('• Способность встать с пола без рук (тест PCS)');
  return '\n\n' + lines.join('\n');
}
export function getBenchAngleGuide(message: string): string {
  const relevant = /наклонн.+жим|жим под углом|incline bench|decline bench|жим вниз|угол.+жим лёж/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📐 ЖИМ ПОД РАЗНЫМИ УГЛАМИ — акценты:');
  lines.push('');
  lines.push('➡️ ГОРИЗОНТАЛЬНЫЙ ЖИМ (0°):');
  lines.push('• Равномерная нагрузка на грудь (верх + низ)');
  lines.push('• Максимальный вес → ключевое упражнение');
  lines.push('• Акцент: средняя и нижняя часть груди');
  lines.push('');
  lines.push('⬆️ НАКЛОННЫЙ ЖИМ (30–45°):');
  lines.push('• Акцент: верхняя часть груди + передняя дельта');
  lines.push('• 30° < 45° → при 45° слишком много дельт');
  lines.push('• Меньший вес, но важнее для эстетики декольте');
  lines.push('');
  lines.push('⬇️ ЖИМM ВНИЗ (−15–30°):');
  lines.push('• Акцент: нижняя часть груди, больший вес');
  lines.push('• Менее популярен, полезен при слабом низе груди');
  lines.push('');
  lines.push('📋 РЕКОМЕНДАЦИЯ:');
  lines.push('• Горизонтальный — основа (60% объёма груди)');
  lines.push('• Наклонный — второй приоритет (30%)');
  lines.push('• Declined — опционально (10%)');
  return '\n\n' + lines.join('\n');
}
export function getHypertrophyVsStrengthScheme(message: string): string {
  const relevant = /гипертрофи.+повторени|сила.+повторени|сколько повторений.+рост|rep range.+hypert|схема.+рост мышц/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📊 СХЕМЫ ДЛЯ ГИПЕРТРОФИИ vs СИЛЫ:');
  lines.push('');
  lines.push('💪 ДЛЯ МАКСИМАЛЬНОЙ ГИПЕРТРОФИИ:');
  lines.push('• Диапазон: 6–20 повторений (все в пределах дают рост)');
  lines.push('• Оптимум: 8–12 для крупных мышц, 12–15 для малых');
  lines.push('• Вес: 60–80% от 1ПМ');
  lines.push('• Отдых: 60–120 сек');
  lines.push('• Ключ: близко к отказу (2–4 повтора в запасе)');
  lines.push('');
  lines.push('🏋️ ДЛЯ МАКСИМАЛЬНОЙ СИЛЫ:');
  lines.push('• Диапазон: 1–5 повторений');
  lines.push('• Вес: 85–97% от 1ПМ');
  lines.push('• Отдых: 3–5 минут');
  lines.push('• Ключ: нейронная адаптация, техника, ЦНС');
  lines.push('');
  lines.push('🔄 ДЛЯ ОБОИХ (рекомендуется):');
  lines.push('• Силовой блок (1–5) → гипертрофийный (8–12) → разгрузка');
  lines.push('• Основные движения: тяжело → вспомогательные: многоповторно');
  lines.push('');
  lines.push('💡 ВЫВОД: гипертрофия возможна в широком диапазоне при условии усилия');
  return '\n\n' + lines.join('\n');
}
export function getTrainingAfterIllness(message: string): string {
  const relevant = /после болезни|после ковид|вернуться после|перерыв из-за болезни|болел|sick.+training|covid.+gym/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏥 ВОЗВРАТ К ТРЕНИРОВКАМ ПОСЛЕ БОЛЕЗНИ:');
  lines.push('');
  lines.push('⏳ ПЕРИОД ОЖИДАНИЯ:');
  lines.push('• Лёгкое ОРВИ: подождать полного выздоровления + 2–3 дня');
  lines.push('• Высокая температура: полный отдых + 5–7 дней после нормализации');
  lines.push('• Ковид: минимум 2 недели, при симптомах усталости — дольше');
  lines.push('• НЕ тренируйся при температуре — риск миокардита!');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ ВОЗВРАТА:');
  lines.push('• Нед 1: 50–60% привычных весов, объём −30%');
  lines.push('• Нед 2: 70–75% весов, стандартный объём');
  lines.push('• Нед 3: возврат к нормальным нагрузкам');
  lines.push('• СТОП-сигналы: одышка, усиленное сердцебиение, резкая слабость');
  lines.push('');
  lines.push('💊 ПОСЛЕ КОВИД — особая осторожность:');
  lines.push('• Long-COVID: усталость может сохраняться месяцами');
  lines.push('• Кардио — постепенно, начни с ходьбы');
  lines.push('• Проверь ЧСС покоя — если выше нормы, отдохни ещё');
  return '\n\n' + lines.join('\n');
}
export function getIntraWorkoutSnacks(message: string): string {
  const relevant = /во время тренировки.+еда|есть во время|intra workout|во время занятия.+питани|банан во время/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🍌 ПИТАНИЕ ВО ВРЕМЯ ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('🎯 КОГДА НУЖНО INTRA-WORKOUT ПИТАНИЕ:');
  lines.push('• Тренировка > 75–90 минут');
  lines.push('• Тренировка на пустой желудок (фастед)');
  lines.push('• Два занятия в один день');
  lines.push('• Ощущение "стены" / падения энергии посередине');
  lines.push('');
  lines.push('✅ ПРОСТЫЕ ВАРИАНТЫ:');
  lines.push('• Банан: 25–30 г быстрых углеводов, натуральный');
  lines.push('• Спортивный напиток: 30–60 г углеводов/ч для длинных сессий');
  lines.push('• Изотоник или BCAA + углеводы');
  lines.push('• Гель или сухофрукты: удобно и быстро');
  lines.push('');
  lines.push('❌ НЕ НУЖНО:');
  lines.push('• Тренировка <60 мин при нормальном предтренировочном питании');
  lines.push('• Белок во время — медленно переваривается, отток крови к ЖКТ');
  lines.push('');
  lines.push('💧 ГЛАВНОЕ: вода! 150–200 мл каждые 15–20 мин');
  return '\n\n' + lines.join('\n');
}
export function getRomanianDeadliftGuide(message: string): string {
  const relevant = /румынская тяга|рдт|rdl|romanian deadlift|тяга на прямых ногах/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ РУМЫНСКАЯ ТЯГА — полный гид:');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА:');
  lines.push('• Старт: стоя, штанга у бёдер, хват на ширине плеч');
  lines.push('• Откати бёдра назад — не сгибай колени намеренно');
  lines.push('• Тяни хамстринги → корпус параллельно полу (или до натяжения)');
  lines.push('• Держи гриф близко к голени (≠ Stiff-Leg DL, где гриф отходит)');
  lines.push('• Нейтральный позвоночник — не округляй спину');
  lines.push('');
  lines.push('📋 ВАРИАНТЫ:');
  lines.push('• RDL с гантелями: лучшая амплитуда, рекомендована новичкам');
  lines.push('• Одноногая RDL: баланс + асимметрия хамстрингов');
  lines.push('• RDL на платформе (дефицит): большая амплитуда для растяжки');
  lines.push('');
  lines.push('🎯 ЦЕЛЕВЫЕ МЫШЦЫ:');
  lines.push('• Основные: бицепс бедра (hamstrings), большая ягодичная');
  lines.push('• Вспомогательные: разгибатели спины, аддукторы');
  lines.push('');
  lines.push('📅 ОБЪЁМ: 3–4 × 8–12, 2–3 раза/нед (хорошо восстанавливаются)');
  return '\n\n' + lines.join('\n');
}
export function getBenchPressArch(message: string): string {
  const relevant = /прогиб.+жим|арч|arch.+bench|мост.+жим|техника жима лёж/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔵 ПРОГИБ В ЖИМЕ ЛЁЖА — зачем и как:');
  lines.push('');
  lines.push('🎯 ЗАЧЕМ ПРОГИБ:');
  lines.push('• Сокращает амплитуду → можно поднять больше веса');
  lines.push('• Снижает нагрузку на передние дельтовидные');
  lines.push('• Создаёт стабильную базу (5 точек опоры)');
  lines.push('');
  lines.push('⚙️ 5 ТОЧЕК ОПОРЫ:');
  lines.push('• Затылок, верхняя часть спины (лопатки) — на скамье');
  lines.push('• Ягодицы — на скамье');
  lines.push('• Обе стопы — на полу');
  lines.push('');
  lines.push('📋 КАК ЗАФИКСИРОВАТЬ ПРОГИБ:');
  lines.push('• Сведи лопатки → опусти вниз');
  lines.push('• "Надень грудью медаль" — выдвини грудь вперёд');
  lines.push('• Ноги под себя (powerlifting setup) или ступни на полу');
  lines.push('');
  lines.push('⚠️ ВАЖНО:');
  lines.push('• Ягодицы НЕ отрываются от скамьи на соревнованиях (правила IPF)');
  lines.push('• Умеренный арч = техническая хитрость, не обман');
  lines.push('• НЕ нужен на изолирующих упражнениях, только на базовых');
  return '\n\n' + lines.join('\n');
}
export function getProgressiveOverloadMethods(message: string): string {
  const relevant = /прогрессия.+без веса|прогрессировать.+без увеличения веса|методы прогрессии|progressive overload methods|как прогрессировать/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📈 ПРОГРЕССИЯ БЕЗ УВЕЛИЧЕНИЯ ВЕСА:');
  lines.push('');
  lines.push('🔢 7 МЕТОДОВ ПРОГРЕССИИ:');
  lines.push('① Больше повторений при том же весе (8→10→12)');
  lines.push('② Больше подходов (3→4→5)');
  lines.push('③ Меньше отдых при той же работе');
  lines.push('④ Медленнее темп (3 сек вниз вместо 1 сек)');
  lines.push('⑤ Больший диапазон движения (полная амплитуда)');
  lines.push('⑥ Ближе к отказу (RPE 8→9→10)');
  lines.push('⑦ Лучшая техника / активация целевой мышцы');
  lines.push('');
  lines.push('🎯 ДВОЙНАЯ ПРОГРЕССИЯ (рекомендуется):');
  lines.push('• Начни с 3×8 → добавляй повторения до 3×12 → прибавь вес → вернись к 3×8');
  lines.push('');
  lines.push('📋 КОГДА ПРИМЕНЯТЬ:');
  lines.push('• Застрял на одном весе >2–3 недели');
  lines.push('• Нет доступа к большему весу (дома, в поездке)');
  lines.push('• Хочешь добавить стимул без нагрузки на суставы');
  lines.push('');
  lines.push('💡 Прогресс в каждой тренировке необязателен — смотри на тренд за 4 недели');
  return '\n\n' + lines.join('\n');
}
export function getFrontSquatTechnique(message: string): string {
  const relevant = /фронтальный присед|front squat|фронт.+приседани|присед со штангой спереди/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ ФРОНТАЛЬНЫЙ ПРИСЕД — техника и преимущества:');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА:');
  lines.push('• Гриф лежит на передних дельтах, локти высоко (параллельно полу)');
  lines.push('• Хват: чистовой (3–4 пальца) или крест-накрест — оба допустимы');
  lines.push('• Спина строго вертикальная — наклон вперёд → штанга падает');
  lines.push('• Приседай глубоко, колени наружу по линии носков');
  lines.push('');
  lines.push('📊 ПРЕИМУЩЕСТВА НАД ПРИСЕДОМ НАЗАД:');
  lines.push('• Больше квадрицепсов, меньше низ спины');
  lines.push('• Вынуждает держать корпус вертикально → лучше осанка');
  lines.push('• Меньший стресс на позвоночник при боли в пояснице');
  lines.push('• Незаменим для тяжёлой атлетики (clean & jerk)');
  lines.push('');
  lines.push('🔧 ЧАСТЫЕ ПРОБЛЕМЫ:');
  lines.push('• Локти падают: нет гибкости запястий/предплечий → растяни грудь/плечи');
  lines.push('• Нет глубины: жёсткие голеностопы → работа над ankle mobility');
  lines.push('');
  lines.push('📅 ВЕС: начни с 50–60% от back squat, сосредоточься на технике');
  return '\n\n' + lines.join('\n');
}
export function getWeightedVestTraining(message: string): string {
  const relevant = /утяжелённый жилет|вест|weighted vest|жилет.+вес|отягощени.+жилет/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦺 ТРЕНИРОВКИ С УТЯЖЕЛЁННЫМ ЖИЛЕТОМ:');
  lines.push('');
  lines.push('🎯 ПРЕИМУЩЕСТВА:');
  lines.push('• Прогрессия в упражнениях с собственным весом (подтягивания, отжимания)');
  lines.push('• Ходьба/бег с весом → повышенный расход калорий без добавления нагрузки на суставы');
  lines.push('• Равномерное распределение нагрузки (vs рюкзак)');
  lines.push('');
  lines.push('📋 ПРИМЕНЕНИЕ:');
  lines.push('• Подтягивания: начни с 5–10 кг, прогрессируй по 2.5 кг');
  lines.push('• Отжимания: 10–30 кг для опытных');
  lines.push('• Ходьба с жилетом (rucking): 10–15% от массы тела = оптимально');
  lines.push('• Plyometrics: осторожно — избегай травм суставов');
  lines.push('');
  lines.push('⚠️ ПРАВИЛА:');
  lines.push('• НЕ бегай с тяжёлым жилетом — нагрузка на позвоночник/суставы');
  lines.push('• Начни с лёгкого (5–10% от массы тела)');
  lines.push('• Купи жилет с мелкой регулировкой (пластины по 1–2 кг)');
  return '\n\n' + lines.join('\n');
}
export function getSupersetsTimeEfficiency(message: string): string {
  const relevant = /суперсет.+время|суперсет.+эффективн|supersets?.+time|суперсет.+быстро/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚡ СУПЕРСЕТЫ ДЛЯ ЭКОНОМИИ ВРЕМЕНИ:');
  lines.push('');
  lines.push('🎯 ВИДЫ СУПЕРСЕТОВ:');
  lines.push('• Антагонистические: жим + тяга (грудь + спина, бицепс + трицепс)');
  lines.push('  → отдых одного = работа другого, без потери производительности');
  lines.push('• Синергетические: приседание + выпад (обе мышцы устают)');
  lines.push('  → компромисс веса ради времени');
  lines.push('• Гигантские сеты: 3–4 упражнения без отдыха (круговые)');
  lines.push('');
  lines.push('📊 ЭКОНОМИЯ ВРЕМЕНИ:');
  lines.push('• Антагонистические суперсеты: экономия 25–30% времени');
  lines.push('• При этом: тот же объём, сопоставимый результат');
  lines.push('');
  lines.push('📋 ЛУЧШИЕ ПАРЫ:');
  lines.push('• Жим лёжа + Тяга штанги в наклоне');
  lines.push('• Жим стоя + Подтягивания');
  lines.push('• Сгибание бицепса + Разгибание трицепса');
  lines.push('• Присед + Становая тяга (НЕ рекомендую — оба утомляют поясницу)');
  lines.push('');
  lines.push('⚠️ НЕ суперсети на одну мышцу (бицепс + бицепс) — снизит вес');
  return '\n\n' + lines.join('\n');
}
export function getTrainingLogBenefits(message: string): string {
  const relevant = /вести дневник|записывать тренировки|дневник тренировок|тренировочный журнал|training log|зачем записывать/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📓 ТРЕНИРОВОЧНЫЙ ДНЕВНИК — зачем вести:');
  lines.push('');
  lines.push('🎯 КЛЮЧЕВЫЕ ПРЕИМУЩЕСТВА:');
  lines.push('• Прогрессия: знаешь точно, что делал последний раз → стремишься сделать больше');
  lines.push('• Анализ: видишь паттерны (что работает, что нет)');
  lines.push('• Мотивация: видишь путь пройденный за месяц/год');
  lines.push('• Обнаружение плато: объективные данные, а не ощущения');
  lines.push('');
  lines.push('📋 ЧТО ЗАПИСЫВАТЬ МИНИМАЛЬНО:');
  lines.push('• Дата и упражнения');
  lines.push('• Вес × повторения × подходы');
  lines.push('• Самочувствие (1–10) + краткие заметки');
  lines.push('');
  lines.push('📱 ФОРМАТЫ:');
  lines.push('• Приложение (удобно, автоматика)');
  lines.push('• Тетрадь (работает без интернета, не отвлекает)');
  lines.push('• Голосовые заметки → расшифровка');
  lines.push('');
  lines.push('💡 ПРАВИЛО: записывай сразу после подхода, не "потом"');
  lines.push('⚡ Атлеты с дневником прогрессируют на 30–40% быстрее');
  return '\n\n' + lines.join('\n');
}
export function getExplosivenessPowerTraining(message: string): string {
  const relevant = /взрывная сила|мощность|explosiveness|power training|прыжки.+тренировк|плиометрик/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚡ ТРЕНИРОВКА ВЗРЫВНОЙ СИЛЫ И МОЩНОСТИ:');
  lines.push('');
  lines.push('🔬 ПРИНЦИП: сила × скорость = мощность');
  lines.push('• Тяжёлые веса медленно = сила');
  lines.push('• Лёгкие веса быстро = скорость');
  lines.push('• Нужно тренировать оба компонента!');
  lines.push('');
  lines.push('📋 МЕТОДЫ:');
  lines.push('• Плиометрика: прыжки в глубину, box jumps, медбол');
  lines.push('• Подъёмы со взрывом: рывок, толчок, взрывное приседание');
  lines.push('• Speed-strength: 50–70% 1ПМ, максимальная скорость выполнения');
  lines.push('• Баллистика: медбол броски, спрыгивание с платформы');
  lines.push('');
  lines.push('⚡ ПРОТОКОЛ СКОРОСТНО-СИЛОВЫХ:');
  lines.push('• 3–5 подходов × 3–5 повторений (немного, взрывно)');
  lines.push('• Полный отдых 2–4 мин между подходами');
  lines.push('• В начале тренировки (ЦНС свежая)');
  lines.push('');
  lines.push('🎯 ДЛЯ КОГО: боевые искусства, спринт, прыжки, атлетизм');
  lines.push('⚠️ Новичкам: сначала база силы, потом мощность');
  return '\n\n' + lines.join('\n');
}
export function getPullUpProgressions(message: string): string {
  const relevant = /подтягиван|pull.?up|не могу подтянуться|научиться подтягиватся|первое подтягивани/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ ПРОГРЕССИЯ ПОДТЯГИВАНИЙ — с нуля до 10+:');
  lines.push('');
  lines.push('📋 ЭТАПЫ:');
  lines.push('① МЁРТВЫЙ ВИС: 3×30–60 сек — развивает хват и плечи');
  lines.push('② НЕГАТИВЫ: прыжок вверх → медленный спуск 5–8 сек: 3×3–5');
  lines.push('③ С РЕЗИНОЙ: подтягивания с петлей под колено: 3×5–10');
  lines.push('④ ПРЫЖКОВЫЕ: энергичный подъём + медленный спуск: 3×5–8');
  lines.push('⑤ ОБЫЧНЫЕ: начни с 1–2, добавляй по 1 каждые 1–2 нед');
  lines.push('');
  lines.push('📊 ПРОГРАММА "0 → 10":');
  lines.push('• 3 раза/нед, прогрессируй сложность еженедельно');
  lines.push('• Нед 1–4: негативы + резина');
  lines.push('• Нед 5–8: самостоятельные + резина');
  lines.push('• Нед 9–12: чистые подтягивания × объём');
  lines.push('');
  lines.push('⚡ ВАРИАНТЫ:');
  lines.push('• Пронация (ладони от себя): широчайшие + задняя дельта');
  lines.push('• Супинация (подтягивание): больше бицепс');
  lines.push('• Нейтральный (параллельный): хорошо для плеч');
  return '\n\n' + lines.join('\n');
}
export function getDipsTechnique(message: string): string {
  const relevant = /отжимани.+брус|брусья|dips|отжимания на брусьях|параллельн.+брус/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 ОТЖИМАНИЯ НА БРУСЬЯХ — техника и варианты:');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА:');
  lines.push('• Широкие брусья (плечи) → грудной акцент: наклон вперёд, локти чуть наружу');
  lines.push('• Узкие брусья (≤ ширины плеч) → трицепсный акцент: тело вертикально');
  lines.push('• Снижайся до угла 90° в локте (или чуть ниже если здоровы плечи)');
  lines.push('• НЕ выпрыгивай наверх — контролируй весь диапазон');
  lines.push('');
  lines.push('📋 ПРОГРЕССИЯ:');
  lines.push('① Тренажёр с противовесом');
  lines.push('② Стул за спиной (ноги прямые)');
  lines.push('③ Обычные дипсы');
  lines.push('④ Дипсы с весом (+5 кг и далее)');
  lines.push('');
  lines.push('🎯 ПРЕИМУЩЕСТВА:');
  lines.push('• Грудной вариант = нижняя грудь + трицепс');
  lines.push('• Трицепсный вариант = трицепс + передняя дельта');
  lines.push('• Один из лучших жимовых упражнений с весом тела');
  lines.push('');
  lines.push('⚠️ ОГРАНИЧЕНИЯ: боли в плечах → остановись и проверь технику');
  return '\n\n' + lines.join('\n');
}
export function getRackPullsGuide(message: string): string {
  const relevant = /рак пулл|rack pull|partial deadlift|тяга из стоек|частичная тяга|тяга из рамы/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ РЭКОВЫЕ ТЯГИ (RACK PULLS):');
  lines.push('');
  lines.push('🎯 ЗАЧЕМ НУЖНЫ:');
  lines.push('• Перегрузка верхней части становой тяги >130% 1ПМ');
  lines.push('• Развитие спины и хвата без большой нагрузки на ноги');
  lines.push('• Психологическая привычка к большим весам');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА:');
  lines.push('• Высота стоек: чуть ниже колена (классика) или уровень колена');
  lines.push('• Техника идентична верхней фазе становой тяги');
  lines.push('• Хват обязательно с лямками — вес будет большой');
  lines.push('');
  lines.push('📋 ПРИМЕНЕНИЕ В ПРОГРАММЕ:');
  lines.push('• 1–2 раза в месяц как дополнение к становой');
  lines.push('• Вес: 105–125% от рабочего веса становой');
  lines.push('• 3–5 подходов × 1–5 повторений');
  lines.push('');
  lines.push('⚠️ НЕ для новичков: нужна хорошая техника становой + развитая спина');
  lines.push('🔄 Альтернатива: тяга с плинтов или дефицитная тяга (больший диапазон)');
  return '\n\n' + lines.join('\n');
}
export function getSustainableRoutine(message: string): string {
  const relevant = /постоянство|регулярность|режим тренировок|не бросать|стабильн.+тренировк|выработать привычку/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔄 УСТОЙЧИВЫЙ РЕЖИМ ТРЕНИРОВОК:');
  lines.push('');
  lines.push('🔬 НАУКА О ПРИВЫЧКАХ:');
  lines.push('• Привычка формируется за 21–66 дней (среднее — 66 дней)');
  lines.push('• Триггер → Действие → Награда (петля Дахигга)');
  lines.push('• Пропуск 1 тренировки ≠ провал — опасен 2-й подряд пропуск');
  lines.push('');
  lines.push('📋 СТРАТЕГИИ:');
  lines.push('• Одно и то же время: автоматизация устраняет необходимость решать');
  lines.push('• Минимальный вариант: "хотя бы 10 мин в зале" — снижает порог входа');
  lines.push('• Готовая форма с вечера: убирает трение утром');
  lines.push('• Якорная привычка: тренировка = сразу после работы/до завтрака');
  lines.push('');
  lines.push('⚡ ТИПИЧНЫЕ УБИЙЦЫ РЕЖИМА:');
  lines.push('• "Всё или ничего": пропустил→ "неделя потеряна" → бросил');
  lines.push('• Слишком сложная программа на старте');
  lines.push('• Нет удовольствия: найди то, что нравится внутри тренинга');
  lines.push('');
  lines.push('🎯 ПЕРВЫЕ 3 МЕСЯЦА: фокус на посещаемости, не на результатах');
  lines.push('💡 После 3 мес — результаты сами будут тянуть тебя в зал');
  return '\n\n' + lines.join('\n');
}
export function getFlexibilityMuscleGrowth(message: string): string {
  const relevant = /растяжка.+рост мышц|гибкость.+гипертрофи|flexibility.+muscle growth|растяжк.+сила/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤸 ГИБКОСТЬ И РОСТ МЫШЦ — связь:');
  lines.push('');
  lines.push('🔬 НАУЧНЫЕ ДАННЫЕ:');
  lines.push('• Мышца растёт максимально в РАСТЯНУТОМ положении');
  lines.push('• Длинные мышцы имеют больше потенциала для гипертрофии (длиннее мышечные пучки)');
  lines.push('• Хорошая гибкость = полный диапазон движений = больший стимул');
  lines.push('');
  lines.push('📋 ПРАКТИКА:');
  lines.push('• Приседай глубже → больше стимула для квадрицепса и ягодиц');
  lines.push('• Жим с полным опусканием до груди > частичный диапазон');
  lines.push('• Французский жим: опускай ниже затылка для растяжения трицепса');
  lines.push('• RDL: максимальное растяжение хамстрингов = больший рост');
  lines.push('');
  lines.push('🎯 НАГРУЖЕННОЕ РАСТЯЖЕНИЕ:');
  lines.push('• Задержка в растянутом положении под нагрузкой 2–3 сек');
  lines.push('• Увеличивает количество саркомеров в мышце (структурная адаптация)');
  lines.push('');
  lines.push('💡 ВЫВОД: работай над диапазоном движений → гибкость = гипертрофия');
  return '\n\n' + lines.join('\n');
}
export function getTrapTrainingGuide(message: string): string {
  const keywords = ['трапец', 'трап', 'шраг', 'shrug', 'trap', 'верх спин', 'капюшон'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🏔️ ТРЕНИРОВКА ТРАПЕЦИЕВИДНЫХ МЫШЦ:');
  lines.push('');
  lines.push('📐 АНАТОМИЯ ТРАПЕЦИИ (3 части):');
  lines.push('• Верхняя: подъём лопаток (шраги) — самая видимая');
  lines.push('• Средняя: сведение лопаток (тяги к поясу) — толщина спины');
  lines.push('• Нижняя: депрессия лопаток (Y-подъёмы) — осанка и стабильность');
  lines.push('');
  lines.push('💪 ЛУЧШИЕ УПРАЖНЕНИЯ:');
  lines.push('• Шраги со штангой: 3-4×12-15, пауза 2 сек вверху');
  lines.push('• Шраги с гантелями: 3×15-20, лёгкое вращение вверх-назад');
  lines.push('• Тяга штанги к подбородку (широкий хват): 3×10-12');
  lines.push('• Фермерская ходьба: 3×30-40м — трапеции + хват + кор');
  lines.push('• Face pulls: средняя трапеция + задние дельты');
  lines.push('');
  lines.push('⚠️ ОШИБКИ:');
  lines.push('• Вращение плечами под нагрузкой — травмоопасно');
  lines.push('• Слишком тяжёлый вес в шрагах — амплитуда страдает');
  lines.push('• Игнорирование средней и нижней части — дисбаланс');
  lines.push('');
  lines.push('📋 ЧАСТОТА: 2-3 раза/нед, трапеции восстанавливаются быстро');
  return '\n\n' + lines.join('\n');
}
export function getTrainingWithScoliosis(message: string): string {
  const keywords = ['сколиоз', 'искривлен позвоноч', 'scoliosis', 'кривой позвоноч', 'асимметри спин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦴 ТРЕНИРОВКИ ПРИ СКОЛИОЗЕ:');
  lines.push('');
  lines.push('✅ РЕКОМЕНДУЕМЫЕ УПРАЖНЕНИЯ:');
  lines.push('• Планка и боковая планка — укрепление кора');
  lines.push('• Тяга одной рукой — коррекция асимметрии');
  lines.push('• Гиперэкстензия — укрепление разгибателей спины');
  lines.push('• Плавание — разгрузка позвоночника');
  lines.push('• Упражнения на балансборде — проприоцепция');
  lines.push('');
  lines.push('⚠️ С ОСТОРОЖНОСТЬЮ:');
  lines.push('• Приседания со штангой: начинать с малых весов, следить за симметрией');
  lines.push('• Становая тяга: только при хорошей технике и разрешении врача');
  lines.push('• Жим стоя: может усиливать лордоз');
  lines.push('');
  lines.push('❌ ИЗБЕГАТЬ:');
  lines.push('• Осевые нагрузки с большим весом без подготовки');
  lines.push('• Ротационные движения с весом при выраженном искривлении');
  lines.push('');
  lines.push('💡 ПРИНЦИПЫ:');
  lines.push('• Односторонние упражнения: дополнительный подход на слабую сторону');
  lines.push('• Укрепление кора — приоритет №1');
  lines.push('• Регулярная консультация с ортопедом/реабилитологом');
  return '\n\n' + lines.join('\n');
}
export function getPreExhaustTechnique(message: string): string {
  const keywords = ['предварительн утомлен', 'pre-exhaust', 'pre exhaust', 'предутомлен', 'изоляция перед базой', 'изоляци перед'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔥 ПРЕДВАРИТЕЛЬНОЕ УТОМЛЕНИЕ (PRE-EXHAUST):');
  lines.push('');
  lines.push('📝 СУТЬ: изолирующее упражнение ПЕРЕД базовым для целевой мышцы');
  lines.push('');
  lines.push('💡 ПРИМЕРЫ СВЯЗОК:');
  lines.push('• Разведения гантелей → Жим лёжа (грудные)');
  lines.push('• Разгибания ног → Приседания (квадрицепсы)');
  lines.push('• Махи в стороны → Жим гантелей сидя (дельты)');
  lines.push('• Пуловер → Тяга верхнего блока (широчайшие)');
  lines.push('');
  lines.push('✅ КОГДА ИСПОЛЬЗОВАТЬ:');
  lines.push('• Целевая мышца "отстаёт" и не чувствуется в базе');
  lines.push('• Для улучшения нейромышечной связи');
  lines.push('• В период специализации на слабую группу');
  lines.push('');
  lines.push('⚠️ НЮАНСЫ:');
  lines.push('• В базовом упражнении рабочий вес будет меньше на 15-25%');
  lines.push('• Не подходит для развития максимальной силы');
  lines.push('• Отдых между изоляцией и базой: минимальный (30-60 сек)');
  lines.push('• 2-3 подхода изоляции по 12-15 повторений достаточно');
  return '\n\n' + lines.join('\n');
}
export function getAbdominalTrainingScience(message: string): string {
  const keywords = ['пресс', 'кубик', 'живот', 'abs', 'кор трен', 'абдоминальн', 'скруч'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🎯 НАУКА ТРЕНИРОВКИ ПРЕССА:');
  lines.push('');
  lines.push('📐 АНАТОМИЯ:');
  lines.push('• Прямая мышца живота: "кубики" — сгибание туловища');
  lines.push('• Косые (внутренние + внешние): ротация и наклоны');
  lines.push('• Поперечная: глубокий стабилизатор, "корсет"');
  lines.push('');
  lines.push('💡 МИФЫ:');
  lines.push('• ❌ "1000 скручиваний уберут жир с живота" — нет! Жиросжигание локально не работает');
  lines.push('• ❌ "Пресс нужно качать каждый день" — он тоже требует восстановления');
  lines.push('• ❌ "Пресс делается на кухне" — частично: видимость = низкий % жира, но мышцы надо развивать');
  lines.push('');
  lines.push('💪 ЭФФЕКТИВНЫЕ УПРАЖНЕНИЯ:');
  lines.push('• Скручивания на блоке: лучшая прогрессия нагрузки');
  lines.push('• Подъём ног в висе: нижняя часть + сгибатели бедра');
  lines.push('• Ab wheel (ролик): полное сокращение + эксцентрик');
  lines.push('• Pallof press: антиротация (функциональность)');
  lines.push('• Планка: базовая стабильность (для начинающих)');
  lines.push('');
  lines.push('📋 РЕЖИМ: 2-4 раза/нед, 3-4 упражнения, 3×10-20 повторений');
  lines.push('🔑 Для видимых кубиков: ~12% жира у мужчин, ~18% у женщин');
  return '\n\n' + lines.join('\n');
}
export function getPlateauPsychology(message: string): string {
  const keywords = ['застой психолог', 'плато мотивац', 'не прогрессиру', 'застрял', 'нет прогресс', 'разочарован', 'демотивац'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🧠 ПСИХОЛОГИЯ ТРЕНИРОВОЧНОГО ПЛАТО:');
  lines.push('');
  lines.push('📊 ПОЧЕМУ ПЛАТО — ЭТО НОРМАЛЬНО:');
  lines.push('• Адаптация нелинейна: быстрый рост → замедление → скачок');
  lines.push('• 80% прогресса приходится на первые 2 года тренировок');
  lines.push('• Плато = тело адаптировалось, нужен новый стимул');
  lines.push('');
  lines.push('😤 ТИПИЧНЫЕ ЛОВУШКИ:');
  lines.push('• "Program hopping" — смена программы каждые 2 недели');
  lines.push('• Сравнение с другими (генетика, фарма, стаж)');
  lines.push('• Фокус только на весе снаряда (игнорируя технику, объём, самочувствие)');
  lines.push('• Увеличение объёма без восстановления');
  lines.push('');
  lines.push('🎯 ЧТО ДЕЛАТЬ:');
  lines.push('• Взять деload неделю (часто плато = недовосстановление)');
  lines.push('• Сменить тип периодизации (линейная → волнообразная)');
  lines.push('• Добавить вариации упражнений, не меняя базу');
  lines.push('• Проверить сон, питание, стресс — часто проблема вне зала');
  lines.push('• Вести дневник: объективные данные > субъективные ощущения');
  lines.push('');
  lines.push('💪 MINDSET: "Плато — это плато роста, а не конец пути"');
  lines.push('📈 Микропрогресс (0.5кг/нед) за год = +25кг к результату!');
  return '\n\n' + lines.join('\n');
}
export function getRotatorCuffStrengthening(message: string): string {
  const keywords = ['ротатор', 'вращатель', 'манжет', 'rotator cuff', 'плечо стабил', 'вращение плеча внутр'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔄 УКРЕПЛЕНИЕ РОТАТОРНОЙ МАНЖЕТЫ:');
  lines.push('');
  lines.push('📐 4 МЫШЦЫ МАНЖЕТЫ:');
  lines.push('• Надостная (supraspinatus): отведение 0-15° — самая травмируемая');
  lines.push('• Подостная (infraspinatus): наружная ротация');
  lines.push('• Малая круглая (teres minor): наружная ротация + стабилизация');
  lines.push('• Подлопаточная (subscapularis): внутренняя ротация');
  lines.push('');
  lines.push('💪 УПРАЖНЕНИЯ (с резинкой или лёгкой гантелей 1-3кг):');
  lines.push('• Наружная ротация стоя/лёжа: 3×15-20, контроль и медленно');
  lines.push('• Внутренняя ротация с резинкой: 3×15-20');
  lines.push('• Cuban rotation: 3×12 (отведение → наружная ротация → жим)');
  lines.push('• Face pulls с паузой: 3×15');
  lines.push('• Y-T-W-L подъёмы лёжа на скамье: 2×10 каждая буква');
  lines.push('');
  lines.push('📋 РЕЖИМ: перед каждой тренировкой верха, 5-7 мин');
  lines.push('⚠️ НЕ гнаться за весом — это стабилизаторы, не силовые мышцы!');
  return '\n\n' + lines.join('\n');
}
export function getBreathingPatternsLifts(message: string): string {
  const keywords = ['дыхание упражнен', 'как дышать', 'дыхание жим', 'дыхание присед', 'задержка дыхан', 'breathing lift'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💨 ПАТТЕРНЫ ДЫХАНИЯ В УПРАЖНЕНИЯХ:');
  lines.push('');
  lines.push('📋 ОБЩЕЕ ПРАВИЛО:');
  lines.push('• Вдох: эксцентрическая фаза (опускание)');
  lines.push('• Выдох: концентрическая фаза (подъём/усилие)');
  lines.push('');
  lines.push('🏋️ ТЯЖЁЛЫЕ БАЗОВЫЕ (>80% 1ПМ):');
  lines.push('• Вдох → задержка (Вальсальва) → подъём → выдох наверху');
  lines.push('• Вальсальва создаёт внутрибрюшное давление = стабильность');
  lines.push('• ⚠️ Противопоказана при гипертонии!');
  lines.push('');
  lines.push('🔄 СПЕЦИФИКА ПО УПРАЖНЕНИЯМ:');
  lines.push('• Присед: вдох стоя → задержка → сел-встал → выдох');
  lines.push('• Жим лёжа: вдох при опускании → задержка → жим → выдох');
  lines.push('• Тяга: вдох внизу → задержка → подъём → выдох вверху');
  lines.push('• Подтягивания: выдох наверху, вдох при опускании');
  lines.push('');
  lines.push('📊 ИЗОЛЯЦИЯ (малые веса):');
  lines.push('• Непрерывное дыхание, без задержки');
  lines.push('• Выдох на усилии, вдох на расслаблении');
  lines.push('');
  lines.push('🎯 Правильное дыхание = +5-10% к силе и безопасности!');
  return '\n\n' + lines.join('\n');
}
export function getTrainingFrequencyByMuscleAdv(message: string): string {
  const keywords = ['частота тренировк', 'сколько раз в недел', 'frequency', 'как часто качать', 'раз в недел мышц'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📅 ОПТИМАЛЬНАЯ ЧАСТОТА ПО МЫШЕЧНЫМ ГРУППАМ:');
  lines.push('');
  lines.push('🔬 НАУКА: синтез белка после тренировки повышен 48-72ч → тренировать 2-3 раза/нед эффективнее');
  lines.push('');
  lines.push('📊 РЕКОМЕНДАЦИИ:');
  lines.push('• Грудь: 2 раза/нед (восстановление ~48-72ч)');
  lines.push('• Спина: 2-3 раза/нед (крупная, выносливая группа)');
  lines.push('• Плечи: 2-3 раза/нед (малый объём за тренировку)');
  lines.push('• Бицепс: 2-3 раза/нед (маленькая мышца, быстро восстанавливается)');
  lines.push('• Трицепс: 2 раза/нед (нагружается в жимах)');
  lines.push('• Квадрицепсы: 2 раза/нед (тяжелее восстанавливаются)');
  lines.push('• Бицепс бедра: 2 раза/нед');
  lines.push('• Икры: 3-4 раза/нед (очень выносливые)');
  lines.push('• Пресс: 3-4 раза/нед (стабилизатор, быстрое восстановление)');
  lines.push('');
  lines.push('📋 ОБЪЁМ ЗА НЕДЕЛЮ (рабочие подходы):');
  lines.push('• Новички: 10-12 на группу');
  lines.push('• Средний: 12-18 на группу');
  lines.push('• Продвинутые: 16-22 на группу');
  lines.push('• >25 подходов/нед — скорее всего избыточно');
  return '\n\n' + lines.join('\n');
}
export function getSquatDepthScience(message: string): string {
  const keywords = ['глубина присед', 'полный присед', 'параллел', 'squat depth', 'глубокий присед', 'ниже параллел'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📐 НАУКА О ГЛУБИНЕ ПРИСЕДА:');
  lines.push('');
  lines.push('📊 ВАРИАНТЫ ГЛУБИНЫ:');
  lines.push('• Четверть (quarter): колени ~45° — минимальная работа ягодиц');
  lines.push('• Полуприсед: бедро ~45° к полу — больше квадрицепсов');
  lines.push('• Параллель: бедро параллельно полу — стандарт');
  lines.push('• Ниже параллели: ↑↑ активация ягодиц, лучший рост');
  lines.push('• "В пол" (ATG): максимальная амплитуда, требует мобильности');
  lines.push('');
  lines.push('🔬 ЧТО ГОВОРИТ НАУКА:');
  lines.push('• Глубокие приседания НЕ вреднее для коленей (при правильной технике)');
  lines.push('• Ягодицы максимально активируются ниже параллели');
  lines.push('• Квадрицепсы работают во всех вариантах');
  lines.push('• Глубина > вес для гипертрофии ягодиц');
  lines.push('');
  lines.push('⚠️ ОГРАНИЧЕНИЯ ГЛУБИНЫ:');
  lines.push('• "Butt wink" (округление поясницы внизу) → остановись чуть выше');
  lines.push('• Недостаточная дорсифлексия голеностопа → штангетки или работа над мобильностью');
  lines.push('• Боль в коленях при глубоком приседе → работай с тем диапазоном, где нет боли');
  return '\n\n' + lines.join('\n');
}
export function getPostWorkoutWindowTruth(message: string): string {
  const keywords = ['анаболическ окно', 'после тренировк есть', 'post workout meal', 'белковое окно', '30 минут после', 'окно возможност'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('⏰ "АНАБОЛИЧЕСКОЕ ОКНО" — ПРАВДА И МИФЫ:');
  lines.push('');
  lines.push('❌ МИФ: "Если не съел белок за 30 мин — тренировка впустую"');
  lines.push('✅ РЕАЛЬНОСТЬ: окно гораздо шире (4-6 часов после тренировки)');
  lines.push('');
  lines.push('🔬 ЧТО ГОВОРИТ НАУКА:');
  lines.push('• Синтез мышечного белка повышен 24-48ч после тренировки');
  lines.push('• Если ел за 2-3ч до тренировки — аминокислоты ещё в крови');
  lines.push('• Общее суточное потребление белка важнее тайминга');
  lines.push('');
  lines.push('📋 КОГДА ТАЙМИНГ ДЕЙСТВИТЕЛЬНО ВАЖЕН:');
  lines.push('• Тренировка натощак (утром без завтрака) → поешь в течение 1-2ч');
  lines.push('• 2 тренировки в день → быстрое восстановление гликогена критично');
  lines.push('• Соревновательный спорт с частыми выступлениями');
  lines.push('');
  lines.push('🎯 ОПТИМАЛЬНЫЙ ПОДХОД:');
  lines.push('• Поешь когда удобно в течение 2-3ч после тренировки');
  lines.push('• 25-40г белка + углеводы (восполнение гликогена)');
  lines.push('• Не стрессуй из-за минут — стресс хуже "пропущенного окна"');
  return '\n\n' + lines.join('\n');
}
export function getWarmupScienceComprehensive(message: string): string {
  const keywords = ['разминк подробн', 'как разминат', 'warm up наук', 'правильная разминк', 'зачем разминк', 'разминка перед'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔥 РАЗМИНКА — ПОЛНЫЙ ГАЙД:');
  lines.push('');
  lines.push('🔬 ЗАЧЕМ:');
  lines.push('• ↑ температура мышц: +1°C = +5% мощности');
  lines.push('• ↑ кровоток к рабочим мышцам');
  lines.push('• ↑ скорость нервной проводимости');
  lines.push('• ↓ риск травм на 50%+ (мета-анализы)');
  lines.push('• Психологическая подготовка');
  lines.push('');
  lines.push('📋 СТРУКТУРА (10-15 мин):');
  lines.push('1. Общая: 3-5 мин лёгкого кардио (пульс 110-130)');
  lines.push('2. Динамическая мобильность: 3-5 мин (вращения суставов, махи)');
  lines.push('3. Активация: 2-3 мин (резинка для ягодиц, ротаторов)');
  lines.push('4. Подводящие подходы: 2-3 подхода с нарастающим весом');
  lines.push('');
  lines.push('❌ ЧТО НЕ ДЕЛАТЬ:');
  lines.push('• Статическая растяжка перед силовой (↓ сила на 5-7%)');
  lines.push('• Пропускать разминку "потому что торопишься"');
  lines.push('• Делать 20 мин кардио перед тяжёлой тренировкой');
  lines.push('');
  lines.push('✅ Статическая растяжка — ПОСЛЕ тренировки в заминке');
  return '\n\n' + lines.join('\n');
}
export function getPeriodizationModelsComparison(message: string): string {
  const keywords = ['периодизац модел', 'линейная волнообразн', 'периодизация сравн', 'какая периодизац', 'блочная периодизац', 'undulating'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📊 МОДЕЛИ ПЕРИОДИЗАЦИИ — СРАВНЕНИЕ:');
  lines.push('');
  lines.push('1️⃣ ЛИНЕЙНАЯ:');
  lines.push('• Прогрессия: вес ↑ каждую неделю, повторения фиксированы');
  lines.push('• Для кого: новички (первые 6-12 мес)');
  lines.push('• +: простота, предсказуемость');
  lines.push('• -: быстро упираешься в плато');
  lines.push('');
  lines.push('2️⃣ ВОЛНООБРАЗНАЯ (DUP):');
  lines.push('• Вариация в каждой тренировке: ПН-тяжёлый, СР-лёгкий, ПТ-средний');
  lines.push('• Для кого: средний уровень');
  lines.push('• +: разнообразие, меньше адаптации, больше прогресса по силе');
  lines.push('• -: сложнее планировать');
  lines.push('');
  lines.push('3️⃣ БЛОЧНАЯ:');
  lines.push('• Мезоциклы по 3-4 нед: гипертрофия → сила → пиковая мощь');
  lines.push('• Для кого: продвинутые, спортсмены');
  lines.push('• +: максимальная специализация');
  lines.push('• -: временный спад в непрофильных качествах');
  lines.push('');
  lines.push('4️⃣ АВТОРЕГУЛЯЦИЯ (RPE):');
  lines.push('• Нагрузка по самочувствию дня');
  lines.push('• Для кого: опытные (умеют оценивать RPE)');
  lines.push('• +: учитывает восстановление');
  lines.push('');
  lines.push('🎯 Общее правило: чем опытнее — тем сложнее периодизация нужна');
  return '\n\n' + lines.join('\n');
}
export function getMuscleSorenessVsGrowth(message: string): string {
  const keywords = ['боль рост мышц', 'крепатура рост', 'не болят мышцы', 'болят значит раст', 'doms рост', 'боль после тренировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💪 БОЛЬ ПОСЛЕ ТРЕНИРОВКИ ≠ РОСТ:');
  lines.push('');
  lines.push('❌ МИФ: "Если мышцы не болят — тренировка была бесполезной"');
  lines.push('');
  lines.push('🔬 РЕАЛЬНОСТЬ:');
  lines.push('• DOMS (крепатура) — побочный эффект, НЕ индикатор роста');
  lines.push('• Мышцы растут от: механического напряжения + метаболического стресса');
  lines.push('• С опытом DOMS снижается (repeated bout effect) — это ХОРОШО');
  lines.push('• Чрезмерная крепатура = слишком много новых стимулов');
  lines.push('');
  lines.push('📊 ЧТО ДЕЙСТВИТЕЛЬНО ВАЖНО:');
  lines.push('• Прогрессия нагрузки (больше вес/повторы/подходы со временем)');
  lines.push('• Pump (наполненность) во время тренировки — лучший индикатор');
  lines.push('• Близость к отказу (RPE 7-9 для гипертрофии)');
  lines.push('• Общий недельный объём');
  lines.push('');
  lines.push('💡 Если хочешь нарочно получить DOMS:');
  lines.push('• Новое упражнение или новый диапазон амплитуды');
  lines.push('• Акцент на эксцентрике');
  lines.push('• НО это не ускорит рост — просто создаст больше повреждений');
  return '\n\n' + lines.join('\n');
}
export function getRestPauseTechnique(message: string): string {
  const keywords = ['rest pause', 'рест пауз', 'отдых-пауза', 'мио-реп', 'myo rep', 'кластерные подход'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('⏸️ REST-PAUSE ТЕХНИКА:');
  lines.push('');
  lines.push('📝 СУТЬ: один длинный подход с короткими паузами вместо обычных подходов');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ:');
  lines.push('• Выполни подход до RPE 8-9 (близко к отказу)');
  lines.push('• Положи вес, отдохни 10-20 сек');
  lines.push('• Сделай ещё 3-5 повторений');
  lines.push('• Снова отдых 10-20 сек');
  lines.push('• Ещё 2-3 повторения');
  lines.push('• Итого: 1 "мега-подход" = ~3 обычных подхода по стимулу');
  lines.push('');
  lines.push('✅ ПРЕИМУЩЕСТВА:');
  lines.push('• Экономия времени (тот же объём за 50% времени)');
  lines.push('• Больше эффективных повторений (близко к отказу)');
  lines.push('• Отличный метаболический стресс');
  lines.push('');
  lines.push('⚠️ ОГРАНИЧЕНИЯ:');
  lines.push('• НЕ для базовых (присед, тяга) — опасно при утомлении');
  lines.push('• Лучше для изоляции и тренажёров');
  lines.push('• Не больше 1-2 упражнений за тренировку в этом стиле');
  lines.push('• Требует опыт (умение оценивать RPE)');
  return '\n\n' + lines.join('\n');
}
export function getLegPressVariations(message: string): string {
  const keywords = ['жим ногами', 'leg press', 'жим платформ', 'постановка ног жим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦵 ЖИМ НОГАМИ — ВАРИАЦИИ И ПОСТАНОВКА:');
  lines.push('');
  lines.push('📐 ПОСТАНОВКА НОГ:');
  lines.push('• Высокая (верх платформы): ягодицы + бицепс бедра');
  lines.push('• Низкая (низ платформы): квадрицепсы (больше сгибание колена)');
  lines.push('• Широкая: приводящие + ягодицы');
  lines.push('• Узкая: внешняя часть квадрицепсов (vastus lateralis)');
  lines.push('• Одна нога: коррекция дисбаланса, стабилизация');
  lines.push('');
  lines.push('✅ ПРЕИМУЩЕСТВА:');
  lines.push('• Безопасен для поясницы (фиксированная спина)');
  lines.push('• Большие веса без осевой нагрузки');
  lines.push('• Легко менять акцент через постановку');
  lines.push('');
  lines.push('⚠️ ОШИБКИ:');
  lines.push('• Слишком глубокое опускание → поясница отрывается от спинки');
  lines.push('• Разгибание коленей в замок (полный локаут) — опасно');
  lines.push('• Слишком тяжёлый вес → минимальная амплитуда');
  lines.push('');
  lines.push('📋 РЕЖИМ: 3-4×10-15, контролируемый негатив (3 сек)');
  return '\n\n' + lines.join('\n');
}
export function getTrainingBoneDensity(message: string): string {
  const keywords = ['кост', 'остеопороз', 'плотность кост', 'bone density', 'кальций кост', 'хрупк кост'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦴 ТРЕНИРОВКИ ДЛЯ ПЛОТНОСТИ КОСТЕЙ:');
  lines.push('');
  lines.push('🔬 КАК ЭТО РАБОТАЕТ:');
  lines.push('• Закон Вольфа: кость адаптируется к нагрузке');
  lines.push('• Механическая нагрузка стимулирует остеобласты (строят кость)');
  lines.push('• Силовые > кардио для плотности костей');
  lines.push('');
  lines.push('💪 ЛУЧШИЕ УПРАЖНЕНИЯ:');
  lines.push('• Приседания со штангой: позвоночник + бедро');
  lines.push('• Становая тяга: весь скелет');
  lines.push('• Жим стоя: позвоночник + плечевой пояс');
  lines.push('• Прыжки (box jumps, скакалка): ударная нагрузка ↑↑ плотность');
  lines.push('• Ходьба с отягощением: бёдра + позвоночник');
  lines.push('');
  lines.push('📊 РЕКОМЕНДАЦИИ:');
  lines.push('• Интенсивность: >70% 1ПМ (лёгкие веса не дают стимул)');
  lines.push('• Частота: 2-3 раза/нед');
  lines.push('• Прогрессия: постепенное увеличение нагрузки');
  lines.push('');
  lines.push('🍽️ ПИТАНИЕ:');
  lines.push('• Кальций: 1000-1200мг/день (творог, молоко, брокколи)');
  lines.push('• Витамин D: 2000-4000 МЕ/день (для усвоения кальция)');
  lines.push('• Белок: достаточное потребление (1.6г/кг+)');
  return '\n\n' + lines.join('\n');
}
export function getPlyometricsStrength(message: string): string {
  const keywords = ['плиометрик', 'прыжки сила', 'plyometric', 'взрывн сила', 'box jump', 'прыжковые'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦘 ПЛИОМЕТРИКА ДЛЯ СИЛОВЫХ АТЛЕТОВ:');
  lines.push('');
  lines.push('🔬 ЗАЧЕМ СИЛОВИКУ ПРЫЖКИ:');
  lines.push('• ↑ скорость рекрутирования мышечных волокон');
  lines.push('• ↑ rate of force development (RFD) — скорость развития силы');
  lines.push('• Перенос на скорость разгона штанги');
  lines.push('• Развитие быстрых волокон типа IIx');
  lines.push('');
  lines.push('💪 УПРАЖНЕНИЯ:');
  lines.push('• Box jumps: 3-5×3-5, полный отдых (2-3 мин)');
  lines.push('• Прыжки в длину с места: 4×3');
  lines.push('• Запрыгивания на тумбу: 3×5');
  lines.push('• Сбросы мяча (med ball slam): 3×5 — взрывная верхняя часть');
  lines.push('• Прыжки из приседа: 3×3 (без веса или с лёгкой штангой)');
  lines.push('');
  lines.push('📋 ПРАВИЛА:');
  lines.push('• ПЕРЕД силовой тренировкой (когда свежий)');
  lines.push('• Малые повторения (1-5) — это НЕ кардио');
  lines.push('• Полный отдых между подходами');
  lines.push('• Качество > количество');
  lines.push('• Мягкое приземление (техника!)');
  lines.push('');
  lines.push('⚠️ Противопоказано при травмах коленей/спины, избыточном весе >110кг');
  return '\n\n' + lines.join('\n');
}
export function getChestFlyVariations(message: string): string {
  const keywords = ['разводк', 'fly', 'кроссовер', 'crossover', 'грудные изоляц', 'разведен гантел'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦋 РАЗВОДКИ И КРОССОВЕРЫ — ГАЙД:');
  lines.push('');
  lines.push('📐 ВАРИАНТЫ:');
  lines.push('• Разводки с гантелями (flat): классика, средняя часть грудных');
  lines.push('• Разводки на наклонной (incline): верх грудных');
  lines.push('• Кроссовер сверху: нижняя часть грудных');
  lines.push('• Кроссовер снизу: верхняя часть грудных');
  lines.push('• Pec deck (бабочка): постоянное напряжение, безопасно');
  lines.push('');
  lines.push('💪 ТЕХНИКА:');
  lines.push('• Лёгкий сгиб локтей (15-20°) — фиксирован на протяжении всего движения');
  lines.push('• Движение "обнимаешь дерево"');
  lines.push('• Пиковое сокращение: сжимай 1-2 сек наверху');
  lines.push('• Контролируемый негатив (3-4 сек)');
  lines.push('');
  lines.push('📊 РЕЖИМ: 3-4×12-15, малые веса (это изоляция!)');
  lines.push('');
  lines.push('⚠️ ОШИБКИ:');
  lines.push('• Слишком тяжёлые гантели → превращается в жим');
  lines.push('• Слишком глубокое растяжение → стресс на плечо');
  lines.push('• Прямые руки → нагрузка на локти');
  return '\n\n' + lines.join('\n');
}
export function getTrainingFlatFeet(message: string): string {
  const keywords = ['плоскостоп', 'flat feet', 'свод стоп', 'стопа плоск', 'ортопедическ стельк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦶 ТРЕНИРОВКИ ПРИ ПЛОСКОСТОПИИ:');
  lines.push('');
  lines.push('📐 ПРОБЛЕМА:');
  lines.push('• Сниженный свод → гиперпронация → нагрузка на колени и поясницу');
  lines.push('• Влияет на биомеханику приседа, тяги, выпадов');
  lines.push('');
  lines.push('✅ РЕКОМЕНДАЦИИ:');
  lines.push('• Штангетки: жёсткая подошва + каблук компенсирует');
  lines.push('• Ортопедические стельки: индивидуальные (от ортопеда)');
  lines.push('• Минималистичная обувь для укрепления мышц стопы (не для тяжёлых подъёмов)');
  lines.push('');
  lines.push('💪 УКРЕПЛЕНИЕ СВОДА:');
  lines.push('• Towel scrunches: собирай полотенце пальцами ног, 3×15');
  lines.push('• Short foot exercise: "укорачивай" стопу без сгибания пальцев');
  lines.push('• Ходьба босиком по неровной поверхности');
  lines.push('• Подъёмы на носки одной ногой: 3×15');
  lines.push('• Marble pickups: поднимай шарики пальцами ног');
  lines.push('');
  lines.push('🏋️ Приседания при плоскостопии: широкая стойка + носки наружу обычно комфортнее');
  lines.push('⚠️ При боли — консультация ортопеда');
  return '\n\n' + lines.join('\n');
}
export function getBenchPressGripWidth(message: string): string {
  const keywords = ['хват жим лёжа', 'ширина хвата', 'grip width bench', 'узкий широкий хват жим', 'жим узким хватом'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('✋ ШИРИНА ХВАТА В ЖИМЕ ЛЁЖА:');
  lines.push('');
  lines.push('📐 ВАРИАНТЫ:');
  lines.push('• Узкий (<1.5× ширина плеч): трицепс + передняя дельта');
  lines.push('• Средний (1.5× ширина плеч): баланс грудных и трицепса');
  lines.push('• Широкий (>1.5× ширина плеч): максимум грудных, короче амплитуда');
  lines.push('');
  lines.push('📊 ДЛЯ РАЗНЫХ ЦЕЛЕЙ:');
  lines.push('• Гипертрофия грудных: средний-широкий (1.5-1.8×)');
  lines.push('• Максимальная сила: максимально разрешённый (81 см между указательными — IPF)');
  lines.push('• Трицепс: узкий (на ширине плеч или уже)');
  lines.push('• Здоровье плеч: средний хват (минимум стресса)');
  lines.push('');
  lines.push('⚠️ НЮАНСЫ:');
  lines.push('• Широкий хват: ↑ нагрузка на плечевой сустав');
  lines.push('• Узкий: ↑ нагрузка на запястья и локти');
  lines.push('• Большие руки/бочкообразная грудная клетка → чуть шире');
  lines.push('• Длинные руки → средний хват комфортнее');
  lines.push('');
  lines.push('💡 Найди СВОЙ хват: в нижней точке предплечья должны быть вертикальны');
  return '\n\n' + lines.join('\n');
}
export function getTrainingVsChronologicalAge(message: string): string {
  const keywords = ['тренировочн возраст', 'стаж тренировок', 'training age', 'сколько лет тренируюсь', 'новичок средн продвинут'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📅 ТРЕНИРОВОЧНЫЙ ВОЗРАСТ vs ХРОНОЛОГИЧЕСКИЙ:');
  lines.push('');
  lines.push('📝 ТРЕНИРОВОЧНЫЙ ВОЗРАСТ: сколько лет регулярных (!) тренировок');
  lines.push('');
  lines.push('📊 КЛАССИФИКАЦИЯ:');
  lines.push('• Новичок: <1 года — линейная прогрессия работает');
  lines.push('• Средний: 1-3 года — нужна периодизация');
  lines.push('• Продвинутый: 3-7 лет — сложные программы, специализация');
  lines.push('• Элита: 7+ лет — микрооптимизация, авторегуляция');
  lines.push('');
  lines.push('⚠️ ЧАСТАЯ ОШИБКА:');
  lines.push('• "Я 5 лет хожу в зал" ≠ 5 лет тренировочного стажа');
  lines.push('• Если 3 года без программы/прогрессии → реальный стаж ~1 год');
  lines.push('• Перерывы >3 мес сбрасывают тренировочный возраст частично');
  lines.push('');
  lines.push('📋 ВЛИЯНИЕ НА ПРОГРАММИРОВАНИЕ:');
  lines.push('• Новичок: простые программы (SS, StrongLifts), 3 раза/нед');
  lines.push('• Средний: PPL, Upper/Lower, 4-5 раз/нед');
  lines.push('• Продвинутый: блочная периодизация, DUP, 5-6 раз/нед');
  lines.push('• Хронологический возраст: влияет на восстановление, не на методику');
  lines.push('');
  lines.push('🎯 30-летний с 10 годами стажа тренируется сложнее, чем 20-летний новичок');
  return '\n\n' + lines.join('\n');
}
export function getDeadliftVariationsGuide(message: string): string {
  const keywords = ['вариант тяг', 'виды становой', 'deadlift variation', 'какую тягу выбрать', 'сумо классика', 'трэп гриф тяга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🏋️ ВАРИАЦИИ СТАНОВОЙ ТЯГИ:');
  lines.push('');
  lines.push('1️⃣ КЛАССИЧЕСКАЯ:');
  lines.push('• Хват чуть шире бёдер, ноги на ширине таза');
  lines.push('• Акцент: разгибатели спины + ягодицы + бицепс бедра');
  lines.push('• Для: длинный торс, короткие ноги');
  lines.push('');
  lines.push('2️⃣ СУМО:');
  lines.push('• Широкая стойка, руки внутри ног');
  lines.push('• Акцент: квадрицепсы + приводящие + ягодицы');
  lines.push('• Для: длинные ноги, короткий торс; меньше нагрузка на поясницу');
  lines.push('');
  lines.push('3️⃣ РУМЫНСКАЯ (RDL):');
  lines.push('• Минимальное сгибание коленей, штанга вдоль ног');
  lines.push('• Акцент: бицепс бедра + ягодицы (растяжение!)');
  lines.push('• Для: гипертрофии задней цепи');
  lines.push('');
  lines.push('4️⃣ ТРЭП-ГРИФ:');
  lines.push('• Стоишь внутри грифа, нейтральный хват');
  lines.push('• Меньше нагрузка на поясницу, проще техника');
  lines.push('• Отлично для начинающих и спортсменов');
  lines.push('');
  lines.push('5️⃣ ДЕФИЦИТНАЯ:');
  lines.push('• Стоя на подставке 5-10 см → увеличенная амплитуда');
  lines.push('• Для проработки начальной фазы');
  return '\n\n' + lines.join('\n');
}
export function getDeadliftBracing(message: string): string {
  const keywords = ['напряжение кор', 'bracing', 'стабилизац туловищ', 'жёсткость спин', 'кор тяга', 'как держать спину'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🛡️ ПРАВИЛЬНЫЙ BRACING (НАПРЯЖЕНИЕ КОРА):');
  lines.push('');
  lines.push('📝 ЧТО ЭТО: создание "пневматической подушки" внутри живота для стабилизации позвоночника');
  lines.push('');
  lines.push('📋 ТЕХНИКА (пошагово):');
  lines.push('1. Вдохни на 70-80% объёма лёгких (животом, не грудью!)');
  lines.push('2. Задержи дыхание');
  lines.push('3. Напряги пресс, как будто тебя сейчас ударят в живот');
  lines.push('4. "Распри" живот во все стороны (360°), не только вперёд');
  lines.push('5. Выполни подъём, удерживая давление');
  lines.push('6. Выдохни наверху (или в "мёртвой точке")');
  lines.push('');
  lines.push('⚠️ ОШИБКИ:');
  lines.push('• Втягивание живота (↓ давление, ↓ стабильность)');
  lines.push('• Вдох грудью (не создаёт внутрибрюшное давление)');
  lines.push('• Потеря напряжения в нижней точке приседа/тяги');
  lines.push('• Задержка дыхания слишком долго (головокружение)');
  lines.push('');
  lines.push('🏋️ ПРИМЕНЕНИЕ: присед, тяга, жим стоя, любые тяжёлые подъёмы');
  lines.push('💪 Пояс помогает, но НЕ заменяет bracing — он даёт обратную связь');
  return '\n\n' + lines.join('\n');
}
export function getOverheadPressForm(message: string): string {
  const keywords = ['жим стоя техник', 'жим над головой', 'overhead press form', 'армейский жим техн', 'OHP техник'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🏋️ ТЕХНИКА ЖИМА СТОЯ (OHP):');
  lines.push('');
  lines.push('📐 СТАРТОВАЯ ПОЗИЦИЯ:');
  lines.push('• Ноги на ширине плеч, стопы полностью на полу');
  lines.push('• Хват чуть шире плеч, локти перед штангой');
  lines.push('• Штанга на передних дельтах (не на ключицах!)');
  lines.push('• Ягодицы и пресс напряжены (не прогибай поясницу!)');
  lines.push('');
  lines.push('📋 ДВИЖЕНИЕ:');
  lines.push('1. Bracing → лёгкий отвод головы назад ("создай пространство")');
  lines.push('2. Жми вертикально ВВЕРХ (не вперёд!)');
  lines.push('3. Как штанга прошла лоб → подай голову вперёд ("под штангу")');
  lines.push('4. Локаут: штанга над серединой стопы, руки полностью выпрямлены');
  lines.push('5. Контролируемое опускание до дельт');
  lines.push('');
  lines.push('⚠️ ТИПИЧНЫЕ ОШИБКИ:');
  lines.push('• Прогиб в пояснице (компенсация слабых дельт)');
  lines.push('• Жим вперёд, а не вверх');
  lines.push('• Разведение локтей в стороны (локти вперёд!)');
  lines.push('• Отталкивание ногами (это push press, другое упражнение)');
  lines.push('');
  lines.push('📊 РЕЖИМ: 3-5×5-8 для силы, 3-4×8-12 для гипертрофии');
  return '\n\n' + lines.join('\n');
}
export function getClusterSets(message: string): string {
  const kw = /кластерн|cluster.?set|мини.?подход|отдых.*внутри.*подход|интра.?сет/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('⚡ КЛАСТЕРНЫЕ ПОДХОДЫ — ПРОДВИНУТАЯ ТЕХНИКА:');
  lines.push('');
  lines.push('📖 Что это:');
  lines.push('• Подход разбивается на мини-серии с короткими паузами (10-30с)');
  lines.push('• Пример: вместо 1×6 → 3×2 с отдыхом 15с внутри подхода');
  lines.push('• Позволяет работать с бо́льшим весом при том же объёме');
  lines.push('');
  lines.push('🔬 Наука:');
  lines.push('• Частичное восстановление фосфокреатина за 15-30с');
  lines.push('• Снижение метаболического стресса → больше механического напряжения');
  lines.push('• Лучшее качество каждого повторения (техника не "плывёт")');
  lines.push('• Исследования: +10-15% к рабочему весу vs обычные подходы');
  lines.push('');
  lines.push('📊 Протоколы:');
  lines.push('• Сила: 5×1 с отдыхом 20-30с, 85-90% 1ПМ');
  lines.push('• Мощность: 6×1 с отдыхом 15-20с, 75-80% 1ПМ');
  lines.push('• Гипертрофия: 4×2-3 с отдыхом 10-15с, 75-80% 1ПМ');
  lines.push('');
  lines.push('✅ Лучше всего для:');
  lines.push('• Базовые компаунды: присед, жим, тяга');
  lines.push('• Преодоление плато в силе');
  lines.push('• Подготовка к соревнованиям (работа с тяжёлыми весами)');
  lines.push('');
  lines.push('❌ Не подходит для:');
  lines.push('• Изоляция (нет смысла)');
  lines.push('• Начинающие (сначала классические подходы)');
  return '\n\n' + lines.join('\n');
}
export function getPecTrainingOptimization(message: string): string {
  const kw = /груд|грудн|жим.*лёж|жим.*леж|pec|bench|chest|развити.*груд|отстаёт.*груд/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ОПТИМИЗАЦИЯ ТРЕНИРОВКИ ГРУДНЫХ:');
  lines.push('');
  lines.push('📐 Анатомия грудных:');
  lines.push('• Ключичная часть (верхняя) — наклон 30-45°');
  lines.push('• Стернальная часть (средняя) — горизонтальный жим');
  lines.push('• Абдоминальная часть (нижняя) — отрицательный наклон / отжимания на брусьях');
  lines.push('');
  lines.push('🔑 Ключевые принципы:');
  lines.push('• Полная растяжка внизу — главный стимул гипертрофии');
  lines.push('• Пауза внизу 1-2с — убирает инерцию, увеличивает TUT');
  lines.push('• Сведение лопаток и прогиб — защита плеч + больше амплитуда груди');
  lines.push('• Локти 45-60° от корпуса — оптимальный баланс нагрузки');
  lines.push('');
  lines.push('📊 Программа для отстающих грудных:');
  lines.push('• День 1: Жим штанги на наклонной 4×6-8');
  lines.push('• + Жим гантелей горизонтально 3×8-10');
  lines.push('• + Кроссовер/бабочка 3×12-15');
  lines.push('• День 2 (через 3-4 дня): Жим гантелей наклонный 3×8-10');
  lines.push('• + Отжимания на брусьях (с весом) 3×8-12');
  lines.push('• + Разводка гантелей 3×12-15');
  lines.push('');
  lines.push('💡 Частые ошибки:');
  lines.push('• Слишком тяжёлый вес → трицепсы/плечи забирают нагрузку');
  lines.push('• Отсутствие наклонного жима → плоский верх груди');
  lines.push('• Недостаточный объём растягивающих движений (разводки)');
  return '\n\n' + lines.join('\n');
}
export function getTrapBarDeadlift(message: string): string {
  const kw = /трэп.*бар|trap.?bar|шестиугольн|гексагональн|hex.?bar|трап.*гриф/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔷 ТРЭП-БАР (ГЕКСАГОНАЛЬНЫЙ ГРИФ):');
  lines.push('');
  lines.push('✅ Преимущества vs обычная становая:');
  lines.push('• На 75% меньше нагрузки на поясницу (исследования)');
  lines.push('• Нейтральный хват — нет проблем с пронацией/супинацией');
  lines.push('• Центр тяжести ближе к телу → безопаснее');
  lines.push('• Проще освоить технику для новичков');
  lines.push('• Выше пиковая мощность и скорость → лучше для атлетизма');
  lines.push('');
  lines.push('📐 Техника:');
  lines.push('• Встань в центр грифа, стопы на ширине плеч');
  lines.push('• Согни колени и бёдра — это гибрид приседа и тяги');
  lines.push('• Хват за высокие ручки (проще) или низкие (больше амплитуда)');
  lines.push('• Спина прямая, грудь вперёд, давим ногами в пол');
  lines.push('• Вверху — полное разгибание, пауза');
  lines.push('');
  lines.push('🏋️ Кому подходит:');
  lines.push('• Новички в становой тяге');
  lines.push('• Люди с проблемами поясницы');
  lines.push('• Спортсмены (мощность, спринт, прыжки)');
  lines.push('• Бодибилдеры (меньше утомления ЦНС при том же весе)');
  lines.push('');
  lines.push('📊 Можно тянуть на 5-10% больше vs классическая становая');
  return '\n\n' + lines.join('\n');
}
export function getUnilateralTraining(message: string): string {
  const kw = /односторонн|унилатеральн|одна.*нога|одна.*рука|дисбаланс.*сторон|асимметр|unilateral/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('↔️ ОДНОСТОРОННИЕ (УНИЛАТЕРАЛЬНЫЕ) УПРАЖНЕНИЯ:');
  lines.push('');
  lines.push('🔬 Зачем нужны:');
  lines.push('• Устранение мышечных дисбалансов между сторонами');
  lines.push('• Bilateral deficit: сумма односторонних усилий > двустороннее');
  lines.push('• Развитие стабилизаторов и кора (антиротация)');
  lines.push('• Профилактика травм (слабая сторона = звено цепи)');
  lines.push('');
  lines.push('🏋️ Лучшие упражнения:');
  lines.push('• Ноги: болгарские сплит-приседания, выпады, одноногий жим');
  lines.push('• Спина: тяга гантели в наклоне, одноручный блок');
  lines.push('• Грудь: жим гантели одной рукой, одноручный кроссовер');
  lines.push('• Плечи: жим гантели стоя одной рукой');
  lines.push('• Кор: чемоданная ходьба, боковая планка');
  lines.push('');
  lines.push('📊 Как внедрить:');
  lines.push('• Начинай со слабой стороны всегда!');
  lines.push('• Одинаковый вес и объём для обеих сторон');
  lines.push('• 1-2 унилатеральных упражнения в каждой тренировке');
  lines.push('• Разница >10% между сторонами = нужно адресовать');
  lines.push('');
  lines.push('💡 Совет: жми гантелю одной рукой — отличная проверка дисбаланса');
  return '\n\n' + lines.join('\n');
}
export function getHamstringTraining(message: string): string {
  const kw = /бицепс.*бедр|задн.*бедр|hamstring|сгибан.*ног|мёртв.*тяг|румынск/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦵 ПОЛНОЕ РУКОВОДСТВО ПО БИЦЕПСУ БЕДРА:');
  lines.push('');
  lines.push('📐 Анатомия:');
  lines.push('• Двуглавая (biceps femoris) — короткая и длинная головка');
  lines.push('• Полусухожильная (semitendinosus)');
  lines.push('• Полуперепончатая (semimembranosus)');
  lines.push('• Двусуставная мышца: сгибание колена + разгибание бедра');
  lines.push('');
  lines.push('🏋️ Типы упражнений:');
  lines.push('• Растягивающие (hip-dominant): румынская тяга, мёртвая тяга');
  lines.push('  → больше стимулируют длинную головку');
  lines.push('• Сгибающие (knee-dominant): сгибания лёжа/сидя');
  lines.push('  → больше стимулируют короткую головку');
  lines.push('• Нужны ОБА типа для полного развития!');
  lines.push('');
  lines.push('📊 Оптимальная программа:');
  lines.push('• Румынская тяга: 3×8-10 (тяжёлое растяжение)');
  lines.push('• Сгибания ног лёжа: 3×10-12 (сокращение)');
  lines.push('• Nordic curls (продвинутые): 3×5-8 (эксцентрик)');
  lines.push('• Объём: 8-12 подходов/неделю');
  lines.push('');
  lines.push('⚠️ Профилактика травм:');
  lines.push('• Соотношение квадрицепс:бицепс бедра = 3:2');
  lines.push('• Эксцентрические упражнения (Nordic curls) ↓ риск разрывов на 51%');
  lines.push('• Не пренебрегай растяжкой после тренировки');
  lines.push('• Разминка: лёгкие сгибания + динамическая растяжка');
  return '\n\n' + lines.join('\n');
}
export function getBloodPressureExercise(message: string): string {
  const kw = /давлен|гипертон|гипотон|ад.*тренир|тренир.*давлен|blood.?pressure|сердечн.*давлен/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('❤️ АРТЕРИАЛЬНОЕ ДАВЛЕНИЕ И ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('🔬 Влияние тренировок на АД:');
  lines.push('• Регулярные силовые: снижение систолического на 5-10 мм рт.ст.');
  lines.push('• Кардио: снижение на 5-7 мм рт.ст.');
  lines.push('• Комбинация — максимальный эффект');
  lines.push('• Эффект сохраняется 12-16 часов после тренировки');
  lines.push('');
  lines.push('⚠️ При повышенном АД (>140/90):');
  lines.push('• Консультация врача перед началом!');
  lines.push('• Избегать натуживания (Вальсальва) — повышает АД до 300+');
  lines.push('• Дыхание: выдох на усилии, не задерживать');
  lines.push('• Не работать на максимум (60-70% 1ПМ, 12-15 повт.)');
  lines.push('• Избегать изометрических упражнений >10 секунд');
  lines.push('');
  lines.push('✅ Безопасные подходы:');
  lines.push('• Круговые тренировки с умеренным весом');
  lines.push('• Ходьба 30-60 мин 5 раз/неделю');
  lines.push('• Плавание (давление воды помогает)');
  lines.push('• Дыхательные упражнения (снижают АД на 5-10 мм)');
  lines.push('');
  lines.push('🍽️ Диетические факторы:');
  lines.push('• Снижение натрия (<2300 мг/день)');
  lines.push('• Больше калия (бананы, картофель, шпинат)');
  lines.push('• DASH-диета: доказанное снижение АД');
  lines.push('• Свёкольный сок: нитраты → оксид азота → расширение сосудов');
  return '\n\n' + lines.join('\n');
}
export function getRearDeltTraining(message: string): string {
  const kw = /задн.*дельт|задн.*плеч|rear.?delt|face.?pull|тяга.*лиц|разведен.*наклон|задний.*пуч/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🎯 ТРЕНИРОВКА ЗАДНИХ ДЕЛЬТ:');
  lines.push('');
  lines.push('📐 Почему задние дельты отстают:');
  lines.push('• Не видно в зеркале → забывают тренировать');
  lines.push('• Мало базовых упражнений с прямой нагрузкой');
  lines.push('• Часто используют слишком тяжёлый вес → трапеции забирают');
  lines.push('');
  lines.push('🏋️ Топ упражнений:');
  lines.push('• Face pulls (тяга к лицу) — №1 для здоровья плеч');
  lines.push('• Разведение в наклоне — классика изоляции');
  lines.push('• Reverse pec deck — стабильная траектория');
  lines.push('• Тяга канатной рукоятки к лицу — контроль');
  lines.push('• Подъёмы в наклоне на скамье (chest-supported)');
  lines.push('');
  lines.push('📊 Техника (критично!):');
  lines.push('• Лёгкий вес, высокие повторения (15-25)');
  lines.push('• Пауза в сокращённой позиции 1-2с');
  lines.push('• Не поднимай плечи к ушам (трапеции!)');
  lines.push('• Большой палец вниз или нейтральный хват');
  lines.push('• Объём: 10-15 подходов/неделю');
  lines.push('');
  lines.push('💡 Совет: делай face pulls каждую тренировку (3×15-20) — это и здоровье плеч, и эстетика');
  return '\n\n' + lines.join('\n');
}
export function getBeginnerPeriodization(message: string): string {
  const kw = /начинающ.*программ|новичок.*план|первый.*раз.*зал|как.*начать.*тренир|программ.*новичк|начал.*заним/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🌱 ПРОГРАММИРОВАНИЕ ДЛЯ НАЧИНАЮЩИХ:');
  lines.push('');
  lines.push('📊 Периодизация по этапам:');
  lines.push('');
  lines.push('📅 Недели 1-4 (Адаптация):');
  lines.push('• 3 тренировки/неделю (полное тело)');
  lines.push('• 2-3 подхода × 12-15 повторений');
  lines.push('• Лёгкие веса — фокус на технику');
  lines.push('• 6-8 упражнений за тренировку');
  lines.push('');
  lines.push('📅 Недели 5-12 (Линейная прогрессия):');
  lines.push('• 3-4 тренировки/неделю');
  lines.push('• 3 подхода × 8-12 повторений');
  lines.push('• Добавляй 2.5-5 кг каждую неделю (линейно)');
  lines.push('• Приоритет: присед, жим, тяга, подтягивания');
  lines.push('');
  lines.push('📅 Недели 13-24 (Развитие):');
  lines.push('• Переход на верх/низ сплит или Push-Pull-Legs');
  lines.push('• 4 подхода × 6-12 повторений');
  lines.push('• Прогрессия замедляется → +вес каждые 1-2 недели');
  lines.push('• Добавляй изоляцию для отстающих групп');
  lines.push('');
  lines.push('⚠️ Главные ошибки новичков:');
  lines.push('• Слишком много объёма с первого дня → DOMS на неделю');
  lines.push('• Пропуск базовых → строят дом без фундамента');
  lines.push('• Программы "продвинутых" (сплит на 5 дней — не для новичков!)');
  lines.push('• Смена программы каждые 2 недели — нет времени адаптироваться');
  return '\n\n' + lines.join('\n');
}
export function getAdductorAbductorTraining(message: string): string {
  const kw = /приводящ|отводящ|аддуктор|абдуктор|adductor|abductor|внутрен.*бедр|внешн.*бедр|сведен.*ног|разведен.*ног/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦵 ПРИВОДЯЩИЕ И ОТВОДЯЩИЕ МЫШЦЫ БЕДРА:');
  lines.push('');
  lines.push('📐 Анатомия:');
  lines.push('• Приводящие (аддукторы): сведение ног, стабилизация в приседах');
  lines.push('• Отводящие (абдукторы): gluteus medius/minimus, TFL');
  lines.push('• Оба комплекса = стабильность таза и колена');
  lines.push('');
  lines.push('⚠️ Почему важно тренировать:');
  lines.push('• Слабые аддукторы → боль в паху, травмы при приседаниях');
  lines.push('• Слабые абдукторы → "колени внутрь" (valgus) при приседе');
  lines.push('• Спортсмены: профилактика паховых травм');
  lines.push('• Женщины: часто слабые абдукторы → боли в коленях');
  lines.push('');
  lines.push('🏋️ Упражнения для аддукторов:');
  lines.push('• Сведение ног в тренажёре: 3×12-15');
  lines.push('• Приседания сумо: 3×8-12');
  lines.push('• Copenhagen adductor exercise (продвинутый): 3×8');
  lines.push('• Приседания с широкой постановкой ног');
  lines.push('');
  lines.push('🏋️ Упражнения для абдукторов:');
  lines.push('• Разведение ног в тренажёре: 3×12-15');
  lines.push('• Боковые приставные шаги с мини-бэндом: 3×12');
  lines.push('• Clamshells: 3×15');
  lines.push('• Ягодичный мост с мини-бэндом');
  lines.push('');
  lines.push('📊 Объём: 6-8 подходов/неделю каждая группа');
  lines.push('💡 Делай как разминку перед приседаниями — мини-бэнд 2×15');
  return '\n\n' + lines.join('\n');
}
export function getProgressiveCalisthenics(message: string): string {
  const kw = /калистеник.*прогресс|прогресс.*калистеник|отжимания.*прогресс|подтяг.*прогресс|собствен.*вес.*прогресс|без.*отягощ/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🤸 ПРОГРЕССИВНАЯ КАЛИСТЕНИКА:');
  lines.push('');
  lines.push('📈 Прогрессии основных движений:');
  lines.push('');
  lines.push('💪 Отжимания:');
  lines.push('• На коленях → обычные → алмазные → на одной руке');
  lines.push('• Вариант: ноги на возвышении → pike push-ups → отжимания в стойке');
  lines.push('');
  lines.push('💪 Подтягивания:');
  lines.push('• Австралийские → негативные → с резинкой → обычные → с весом');
  lines.push('• Далее: L-sit подтягивания → muscle-up');
  lines.push('');
  lines.push('💪 Приседания:');
  lines.push('• Приседания у стены → обычные → болгарские → пистолетики');
  lines.push('• Вариант: шримп-приседания');
  lines.push('');
  lines.push('💪 Горизонтальные тяги:');
  lines.push('• Австралийские подтягивания (высоко) → ниже → с ногами на возвышении');
  lines.push('• Front lever progressions: tucked → advanced tucked → full');
  lines.push('');
  lines.push('📊 Принципы прогрессии:');
  lines.push('• 3×8-12 с хорошей техникой → переходи к следующему уровню');
  lines.push('• Рычаг: чем длиннее, тем тяжелее');
  lines.push('• Одностороннее > двустороннее (для усложнения)');
  lines.push('• Темп: замедли → сложнее без смены упражнения');
  return '\n\n' + lines.join('\n');
}
export function getLegCurlVariations(message: string): string {
  const kw = /сгибан.*ног|leg.?curl|бицепс.*бедр.*тренажёр|бицепс.*бедр.*тренажер|лёж.*сгибан|сидя.*сгибан/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦵 ВАРИАЦИИ СГИБАНИЙ НОГ:');
  lines.push('');
  lines.push('📐 Анатомический нюанс:');
  lines.push('• Бицепс бедра — двусуставная мышца');
  lines.push('• Сгибания лёжа vs сидя активируют по-разному');
  lines.push('• Положение бедра меняет длину мышцы → разный стимул');
  lines.push('');
  lines.push('🏋️ Варианты:');
  lines.push('• Сгибания лёжа: классика, хорошая растяжка');
  lines.push('• Сгибания сидя: бицепс бедра в укороченной позиции бедра → больше стресс');
  lines.push('• Сгибания стоя (одноногие): изоляция + баланс');
  lines.push('• Nordic curls: эксцентрик с собственным весом (продвинутый)');
  lines.push('• GHR (glute-ham raise): бицепс бедра + ягодичные');
  lines.push('• Скользящие сгибания (на полу с полотенцем)');
  lines.push('');
  lines.push('📊 Что говорит наука:');
  lines.push('• Сгибания сидя > лёжа для гипертрофии (растянутая позиция)');
  lines.push('• Nordic curls снижают риск травм на 51%');
  lines.push('• Комбинация 2 вариантов = оптимально');
  lines.push('');
  lines.push('💡 Программа: сгибания сидя 3×10-12 + Nordic curls 3×5-8');
  return '\n\n' + lines.join('\n');
}
export function getMechanicalDropSets(message: string): string {
  const kw = /механическ.*дроп|дроп.*механическ|mechanical.*drop|менять.*угол|смена.*хват.*без.*отдых/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔄 МЕХАНИЧЕСКИЕ ДРОП-СЕТЫ:');
  lines.push('');
  lines.push('📖 Что это:');
  lines.push('• Смена биомеханической позиции вместо веса');
  lines.push('• Переход от слабой к сильной позиции без отдыха');
  lines.push('• Больше времени под нагрузкой с одним весом');
  lines.push('');
  lines.push('🏋️ Примеры:');
  lines.push('• Жим: наклонный → горизонтальный → отрицательный');
  lines.push('• Сгибания на бицепс: наклонная скамья → стоя → читинг');
  lines.push('• Разведения: в наклоне → стоя → частичные');
  lines.push('• Подтягивания: широкий хват → средний → узкий супинированный');
  lines.push('• Жим гантелей: нейтральный хват → пронированный');
  lines.push('');
  lines.push('📊 Протокол:');
  lines.push('• Выбери вес для 8-10 повторений в слабой позиции');
  lines.push('• Первая позиция: до отказа (~8 повт.)');
  lines.push('• Смена позиции (5с) → до отказа (~5-6 повт.)');
  lines.push('• Ещё одна смена → до отказа (~4-5 повт.)');
  lines.push('• 2-3 таких подхода = достаточно');
  lines.push('');
  lines.push('✅ Преимущества vs обычные дроп-сеты:');
  lines.push('• Не нужно менять вес (экономия времени)');
  lines.push('• Разные углы = полная проработка мышцы');
  lines.push('• Меньше утомления ЦНС при том же эффекте');
  return '\n\n' + lines.join('\n');
}
export function getChestSupportedRows(message: string): string {
  const kw = /тяга.*упор.*груд|тяга.*с.*упор|chest.?supported|тяга.*лёж.*на.*скамь|тяга.*скамь.*наклон/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ТЯГИ С УПОРОМ ГРУДЬЮ В СКАМЬЮ:');
  lines.push('');
  lines.push('✅ Зачем:');
  lines.push('• Изоляция спины без нагрузки на поясницу');
  lines.push('• Нет "читинга" корпусом');
  lines.push('• Безопаснее для людей с проблемами поясницы');
  lines.push('• Лучший контроль и связь мозг-мышца');
  lines.push('');
  lines.push('📐 Варианты:');
  lines.push('• Тяга гантелей лёжа на наклонной скамье (30-45°)');
  lines.push('• Тяга штанги лёжа на скамье');
  lines.push('• Тяга на тренажёре с упором (T-bar с подушкой)');
  lines.push('• Seal row (лёжа на высокой скамье, штанга снизу)');
  lines.push('');
  lines.push('📊 Техника:');
  lines.push('• Ляг грудью на скамью под 30-45°');
  lines.push('• Руки свободно висят, гантели нейтральным хватом');
  lines.push('• Тяни к бёдрам (нижняя часть спины) или к груди (верхняя)');
  lines.push('• Пауза вверху 1-2с, сведи лопатки');
  lines.push('• 3-4 подхода × 10-12 повторений');
  lines.push('');
  lines.push('💡 Идеальная замена тяги штанги в наклоне при боли в пояснице');
  return '\n\n' + lines.join('\n');
}
export function getAntioxidantsExercise(message: string): string {
  const kw = /антиоксидант|свободн.*радикал|окислительн.*стресс|витамин.*[cс].*тренир|антиокс.*добавк/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🫐 АНТИОКСИДАНТЫ И ТРЕНИРОВКИ:');
  lines.push('');
  lines.push('🔬 Парадокс антиоксидантов:');
  lines.push('• Тренировки создают свободные радикалы (ROS)');
  lines.push('• ROS — сигнал для адаптации (рост, укрепление)');
  lines.push('• Избыток антиоксидантов может БЛОКИРОВАТЬ адаптацию!');
  lines.push('• Витамин C/E в высоких дозах после тренировки → хуже результаты');
  lines.push('');
  lines.push('📊 Что говорят исследования:');
  lines.push('• 1000+ мг витамина C → снижение адаптации к тренировкам');
  lines.push('• Витамин E 400+ МЕ → может блокировать mTOR сигнал');
  lines.push('• Естественные антиоксиданты из еды — безопасны и полезны');
  lines.push('• NAC перед тренировкой может снижать утомляемость');
  lines.push('');
  lines.push('✅ Правильный подход:');
  lines.push('• Антиоксиданты из еды: ягоды, зелень, фрукты, овощи');
  lines.push('• Не принимай мегадозы витаминов C/E вокруг тренировки');
  lines.push('• Если принимаешь добавки — за 3-4 часа до или после зала');
  lines.push('• Полифенолы (тёмный шоколад, зелёный чай) — безопасны');
  lines.push('');
  lines.push('💡 Лучший антиоксидант для спортсмена — разнообразная диета с 5+ порциями овощей/фруктов');
  return '\n\n' + lines.join('\n');
}
export function getLandmineExercises(message: string): string {
  const kw = /лэндмайн|landmine|штанга.*в.*угл|угол.*штанг|т.?бар.*жим|одноруч.*жим.*штанг/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔥 LANDMINE УПРАЖНЕНИЯ (ШТАНГА В УГЛУ):');
  lines.push('');
  lines.push('📐 Что это:');
  lines.push('• Один конец штанги закреплён (landmine attachment или в углу)');
  lines.push('• Дуговая траектория → уникальные углы нагрузки');
  lines.push('• Безопаснее для плеч, чем вертикальные жимы');
  lines.push('');
  lines.push('🏋️ Лучшие упражнения:');
  lines.push('• Landmine press (жим одной рукой): грудь + плечо без импинджмента');
  lines.push('• Landmine row (тяга): спина с нейтральным позвоночником');
  lines.push('• Landmine squat (присед): фронтальный присед без давления на запястья');
  lines.push('• Landmine rotation: мощнейшее упражнение для кора/косых');
  lines.push('• Landmine RDL: румынская тяга с одного конца');
  lines.push('• Meadows row: тяга одной рукой (по John Meadows)');
  lines.push('');
  lines.push('✅ Кому подходит:');
  lines.push('• Боль в плечах при жимах → landmine press');
  lines.push('• Проблемы с запястьями → нейтральный хват');
  lines.push('• Спортсмены → ротационная мощность');
  lines.push('• Все → разнообразие программы');
  lines.push('');
  lines.push('💡 Нет landmine attachment? Поставь штангу в угол (подложи полотенце)');
  return '\n\n' + lines.join('\n');
}
export function getBackSquatForm(message: string): string {
  const kw = /техник.*присед|присед.*техник|как.*правильн.*присед|ошибки.*присед|присед.*штанг.*спин|back.?squat/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ТЕХНИКА ПРИСЕДАНИЙ СО ШТАНГОЙ:');
  lines.push('');
  lines.push('📐 Постановка:');
  lines.push('• High bar: штанга на трапециях, корпус вертикальнее → квадрицепсы');
  lines.push('• Low bar: штанга на задних дельтах, наклон → ягодичные/бицепс бедра');
  lines.push('• Ноги: шире плеч, носки 15-30° наружу');
  lines.push('• Хват: узкий = напряжённая спина, широкий = если не хватает мобильности');
  lines.push('');
  lines.push('🔑 Ключевые точки:');
  lines.push('• Глубокий вдох, напряги кор (Вальсальва)');
  lines.push('• Начинай с разведения коленей наружу (по носкам)');
  lines.push('• Сядь "между ног", не назад');
  lines.push('• Колени в линию с носками (не внутрь!)');
  lines.push('• Спина нейтральная, грудь вверх');
  lines.push('• Глубина: бедро параллельно полу минимум');
  lines.push('• Вставай, давя ногами в пол ("раздвигай пол")');
  lines.push('');
  lines.push('❌ Частые ошибки:');
  lines.push('• Butt wink (подкрут таза внизу) → работай над мобильностью');
  lines.push('• Колени внутрь (valgus) → активация ягодичных, мини-бэнд');
  lines.push('• Наклон вперёд → слабый кор, высокое положение штанги');
  lines.push('• Отрыв пяток → мобильность голеностопа, штангетки');
  lines.push('');
  lines.push('💡 Штангетки (+1-2 см каблук) решают 80% проблем с техникой');
  return '\n\n' + lines.join('\n');
}
export function getFrontSquatTechniqueAdv(message: string): string {
  const kw = /фронтальн.*присед|присед.*фронтальн|front.?squat|штанг.*на.*груд.*присед|кроссов.*хват.*присед/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ФРОНТАЛЬНЫЕ ПРИСЕДАНИЯ:');
  lines.push('');
  lines.push('✅ Преимущества vs обычные:');
  lines.push('• Больше нагрузки на квадрицепсы (+20% ЭМГ)');
  lines.push('• Вертикальный корпус → меньше нагрузки на поясницу');
  lines.push('• Развитие мобильности грудного отдела и запястий');
  lines.push('• Автокоррекция: если техника плохая — штанга падает');
  lines.push('');
  lines.push('📐 Варианты хвата:');
  lines.push('• Классический (олимпийский): пальцы под штангой, локти вверх');
  lines.push('• Кроссовый: руки крест-накрест, локти вперёд');
  lines.push('• С лямками: обмотай лямки вокруг грифа');
  lines.push('');
  lines.push('🔑 Техника:');
  lines.push('• Штанга лежит на передних дельтах (не на руках!)');
  lines.push('• Локти ВВЕРХ — главный cue');
  lines.push('• Корпус максимально вертикальный');
  lines.push('• Колени выходят за носки — это НОРМАЛЬНО');
  lines.push('• Глубокий сед (ниже параллели если мобильность позволяет)');
  lines.push('');
  lines.push('📊 Обычное соотношение: фронтальный = 80-85% от обычного приседа');
  lines.push('');
  lines.push('⚠️ Если запястья болят → кроссовый хват или лямки');
  lines.push('💡 Отличный инструмент для тех, у кого спина — слабое звено');
  return '\n\n' + lines.join('\n');
}
export function getPendlayRow(message: string): string {
  const kw = /пендли|pendlay|тяга.*с.*пол|тяга.*штанг.*наклон.*пол|взрывн.*тяга.*штанг/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ТЯГА ПЕНДЛИ (PENDLAY ROW):');
  lines.push('');
  lines.push('📖 Что это:');
  lines.push('• Тяга штанги в наклоне с полной остановкой на полу');
  lines.push('• Изобретатель: Glenn Pendlay (тренер тяжелоатлетов)');
  lines.push('• Каждое повторение — с пола, без инерции');
  lines.push('');
  lines.push('📐 Техника:');
  lines.push('• Исходная позиция как в становой тяге');
  lines.push('• Корпус параллелен полу (строго!)');
  lines.push('• Хват чуть шире плеч, пронированный');
  lines.push('• Взрывная тяга к нижней части груди / верху живота');
  lines.push('• Контролируемый спуск → штанга на пол → пауза');
  lines.push('• Каждое повторение — из мёртвой точки');
  lines.push('');
  lines.push('✅ Преимущества vs обычная тяга в наклоне:');
  lines.push('• Нет читинга (каждый раз с пола)');
  lines.push('• Развитие взрывной силы');
  lines.push('• Перенос на рывок и толчок');
  lines.push('• Меньше утомления поясницы (короткое напряжение)');
  lines.push('');
  lines.push('📊 Программирование:');
  lines.push('• 4-5 подходов × 3-5 повторений (сила)');
  lines.push('• Или 3×8 с умеренным весом (гипертрофия)');
  lines.push('• Нужны блины стандартного диаметра (или подставки)');
  return '\n\n' + lines.join('\n');
}
export function getGobletSquat(message: string): string {
  const kw = /гоблет|goblet|присед.*гантел.*груд|кубков.*присед|присед.*с.*гирей|учебн.*присед/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ГОБЛЕТ ПРИСЕД — ЛУЧШИЙ УЧЕБНЫЙ ПРИСЕД:');
  lines.push('');
  lines.push('📖 Что это:');
  lines.push('• Присед с гантелей/гирей у груди');
  lines.push('• Придуман Dan John как учебный инструмент');
  lines.push('• Автоматически учит правильной технике');
  lines.push('');
  lines.push('✅ Почему он уникален:');
  lines.push('• Противовес впереди → вертикальный корпус');
  lines.push('• Невозможно сильно наклониться → безопасно');
  lines.push('• Учит "садиться между ног"');
  lines.push('• Активирует кор без специального фокуса');
  lines.push('• Раскрывает бёдра естественно');
  lines.push('');
  lines.push('📐 Техника:');
  lines.push('• Держи гантель/гирю у груди, локти вниз');
  lines.push('• Ноги шире плеч, носки наружу');
  lines.push('• Сядь глубоко (локти между коленей)');
  lines.push('• Внизу: разведи колени локтями (мобильность!)');
  lines.push('• Задержись внизу 2-3с → встань');
  lines.push('');
  lines.push('📊 Применение:');
  lines.push('• Новички: основной присед на первые 4-8 недель');
  lines.push('• Разминка: 2×10 перед тяжёлыми приседами');
  lines.push('• Мобильность: пауза внизу 10-30с (goblet squat hold)');
  lines.push('• Кондиция: 100 гоблет-приседов за минимум времени');
  return '\n\n' + lines.join('\n');
}
export function getInvertedRowProgression(message: string): string {
  const kw = /австралийск.*подтяг|подтяг.*австралийск|inverted.*row|горизонтальн.*подтяг|тяга.*на.*перекладин.*лёж|тяга.*в.*TRX/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ АВСТРАЛИЙСКИЕ ПОДТЯГИВАНИЯ (INVERTED ROWS):');
  lines.push('');
  lines.push('📖 Зачем:');
  lines.push('• Горизонтальная тяга собственного веса');
  lines.push('• Подготовка к обычным подтягиваниям');
  lines.push('• Развитие средней части спины, ромбовидных, задних дельт');
  lines.push('• Безопасно для поясницы');
  lines.push('');
  lines.push('📈 Прогрессии (от лёгкого к сложному):');
  lines.push('• 1. Высокий гриф, ноги согнуты → самый лёгкий');
  lines.push('• 2. Высокий гриф, ноги прямые');
  lines.push('• 3. Низкий гриф, ноги на полу');
  lines.push('• 4. Низкий гриф, ноги на возвышении');
  lines.push('• 5. С жилетом / блином на груди');
  lines.push('• 6. Одноручные (очень сложно!)');
  lines.push('');
  lines.push('📐 Техника:');
  lines.push('• Хват: пронированный (шире) или супинированный (уже)');
  lines.push('• Тело — прямая линия (как планка)');
  lines.push('• Тяни грудью к грифу, сведи лопатки');
  lines.push('• Пауза вверху 1-2с');
  lines.push('• Не провисай в пояснице!');
  lines.push('');
  lines.push('📊 Программирование: 3-4×8-15, как первое или второе упражнение на спину');
  return '\n\n' + lines.join('\n');
}
export function getSissySquat(message: string): string {
  const keywords = ['сисси', 'sissy', 'квадрицепс', 'передняя бедра', 'изоляция ног', 'разгибание'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[СИССИ-ПРИСЕДАНИЯ — ИЗОЛЯЦИЯ КВАДРИЦЕПСОВ]
Одно из лучших упражнений для изоляции квадрицепсов без нагрузки на поясницу.

Техника:
1. Встань у опоры (стойка, стена), ноги на ширине плеч
2. Поднимись на носки, держась одной рукой за опору
3. Отклони корпус назад, сгибая колени вперёд
4. Опускайся, пока колени не пройдут далеко вперёд за носки
5. Бёдра и корпус — одна линия (не складывайся в тазу!)
6. Поднимись, выпрямляя колени, сжимая квадрицепсы

Прогрессия:
- Уровень 1: с опорой, собственный вес × 12-15
- Уровень 2: без опоры × 10-12
- Уровень 3: с блином на груди × 8-10
- Уровень 4: на специальном тренажёре с отягощением

Противопоказания: травмы коленей, нестабильность надколенника.
Место в программе: в конце тренировки ног как добивка квадрицепсов.
Альтернатива: разгибания ног в тренажёре (менее эффективно для растяжки под нагрузкой).`;
}
export function getBulgarianSplitSquatAdv(message: string): string {
  const keywords = ['болгарск', 'bulgarian', 'сплит присед', 'одна нога', 'выпад на скамье', 'сплит-присед'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[БОЛГАРСКИЙ СПЛИТ-ПРИСЕД — ПРОДВИНУТЫЙ ГАЙД]
Одно из самых эффективных упражнений для ног — исследования показывают сопоставимый рост мышц с приседаниями.

Техника:
1. Задняя нога на скамье (подъём стопы, не носок)
2. Передняя нога на расстоянии 60-80 см от скамьи
3. Корпус вертикально или с лёгким наклоном вперёд
4. Опускайся, пока переднее бедро не параллельно полу
5. Колено передней ноги может проходить за носок (это безопасно!)
6. Толкайся через пятку передней ноги

Акцент на разные мышцы:
- Узкая стойка + вертикальный корпус → квадрицепсы
- Широкая стойка + наклон вперёд → ягодичные
- Стопа на возвышении (5-10 см) → увеличенная амплитуда

Прогрессия:
1. Собственный вес × 12-15 (баланс!)
2. Гантели по бокам × 10-12
3. Гантель гоблет × 10-12
4. Штанга на спине × 8-10
5. Штанга фронтально × 6-8

Объём: 3-4 × 8-12 на ногу.
Частые ошибки: слишком близко к скамье, наклон корпуса, завал колена внутрь.
Отдых: 60-90 сек между подходами (каждая нога = полподхода).`;
}
export function getMeadowsRow(message: string): string {
  const keywords = ['мидоуз', 'meadows', 'тяга мидоуз', 'тяга одной рукой штанга', 'тяга в наклоне одной', 'т-гриф одной'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ТЯГА МИДОУЗА — УНИКАЛЬНАЯ ТЯГА ДЛЯ СПИНЫ]
Изобретена Джоном Мидоузом — тяга одной рукой за конец штанги в лэндмайне.

Почему эффективна:
- Уникальный угол нагрузки — мощная растяжка широчайших
- Односторонняя работа — устраняет дисбаланс
- Минимальная нагрузка на поясницу (опора на колено)
- Огромная амплитуда движения

Техника:
1. Штанга в лэндмайн (или в углу), встань перпендикулярно
2. Передняя нога — на одной линии с концом штанги
3. Задняя нога отставлена назад, корпус наклонён
4. Хват сверху за толстый конец штанги (с блинами)
5. Тяни локоть назад и вверх, сводя лопатку
6. Растяжка внизу — полная, пиковое сокращение вверху

Параметры:
- 3-4 × 10-12 на руку
- Вес: умеренный (техника важнее)
- Темп: 1-0-2-1 (контроль негативной фазы)
- Отдых: 60-90 сек

Место в программе: после тяжёлых базовых тяг (становая, тяга штанги).
Совет: используй лямки если хват лимитирует — не ограничивай широчайшие.`;
}
export function getChestDipTechnique(message: string): string {
  const keywords = ['отжимания на брусьях', 'dip', 'брусья грудь', 'брусья техника', 'отжимания грудные', 'dips'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ОТЖИМАНИЯ НА БРУСЬЯХ — ТЕХНИКА ДЛЯ ГРУДИ vs ТРИЦЕПСА]
Одно из лучших упражнений для верхней части тела — но техника меняет акцент кардинально.

Акцент на ГРУДЬ:
- Наклон корпуса вперёд 15-30°
- Широкий хват (если брусья регулируемые)
- Локти разведены в стороны
- Опускайся глубоко (плечи ниже локтей)
- Не выпрямляй руки полностью вверху (сохраняй напряжение)

Акцент на ТРИЦЕПС:
- Корпус вертикально
- Узкий хват
- Локти прижаты к корпусу
- Глубина — до угла 90° в локтях
- Полное разгибание вверху

Прогрессия:
1. Негативные (5 сек спуск) × 5-8
2. Собственный вес × 8-12
3. С резинкой (помощь) если нужно
4. С поясом + вес: +5кг → +10кг → +20кг → ...
5. С цепью (нарастающее сопротивление)

Противопоказания:
- Травмы плеча (особенно передней капсулы)
- Нестабильность плечевого сустава
- Боль в грудино-ключичном суставе

Объём: 3-4 × 8-12 (с весом) или 3 × до отказа (собственный вес).
Место: начало тренировки (тяжёлое многосуставное) или суперсет с тягами.`;
}
export function getFacePullForm(message: string): string {
  const keywords = ['фейс пул', 'face pull', 'тяга к лицу', 'задняя дельта блок', 'ротаторы блок', 'здоровье плеч упражн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[FACE PULL (ТЯГА К ЛИЦУ) — ЛУЧШЕЕ УПРАЖНЕНИЕ ДЛЯ ЗДОРОВЬЯ ПЛЕЧ]
Единственное упражнение, которое одновременно тренирует заднюю дельту, ротаторы и учит правильному положению лопаток.

Техника (канатная рукоять, верхний блок):
1. Блок на уровне лица или чуть выше
2. Хват сверху за канат, руки на ширине плеч
3. Шаг назад, руки вытянуты — натяжение троса
4. Тяни к лицу, РАЗВОДЯ канат в стороны
5. В конечной точке: руки образуют "двойной бицепс"
6. Лопатки сведены, внешняя ротация плеч
7. Задержка 1-2 сек, медленное возвращение

Ключевые моменты:
- НЕ тяни к шее или груди — именно к лицу!
- Локти выше плеч в конечной позиции
- Движение лопатками, не только руками
- Лёгкий вес — техника важнее всего

Параметры:
- 3-4 × 15-20 повторений
- Каждую тренировку верха или через день
- Может быть разминкой перед жимами

Альтернативы: band pull-apart (резинка), prone Y-raise (лёжа на животе).
Соотношение: на каждый подход жима — 1 подход тяги к лицу для баланса.`;
}
export function getHackSquat(message: string): string {
  const keywords = ['гакк', 'hack squat', 'гакк-присед', 'тренажёр присед', 'квадрицепс тренажёр', 'гак приседан'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ГАКК-ПРИСЕДАНИЯ — БЕЗОПАСНАЯ АЛЬТЕРНАТИВА КЛАССИКЕ]
Тренажёр убирает нагрузку со стабилизаторов и поясницы, позволяя нагрузить квадрицепсы максимально.

Техника:
1. Спина плотно прижата к подушке
2. Стопы на платформе: ширина плеч, чуть впереди от корпуса
3. Снимай фиксаторы, плечи под упоры
4. Опускайся до 90° или глубже (если позволяют колени)
5. Толкай через пятки, колени — по направлению носков
6. Не замыкай полностью колени вверху

Постановка ног — акцент:
- Низко на платформе: максимум квадрицепсов
- Высоко: подключение ягодичных и бицепсов бедра
- Узко: латеральная головка квадрицепса
- Широко: приводящие + медиальная головка

Преимущества перед приседом:
✅ Безопаснее для поясницы
✅ Не нужен страхующий
✅ Легче прогрессировать в весах
✅ Фокус на целевые мышцы

Недостатки:
❌ Не тренирует стабилизаторы
❌ Меньше функциональный перенос
❌ Не заменяет свободные приседания полностью

Объём: 3-4 × 8-12, после базовых приседаний.
Совет: попробуй обратный гакк (лицом к подушке) — великолепно для ягодичных!`;
}
export function getPendulumSquat(message: string): string {
  const keywords = ['маятник', 'pendulum squat', 'пендулум', 'тренажёр ноги квад', 'маятниковый присед'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[МАЯТНИКОВЫЙ (ПЕНДУЛУМ) ПРИСЕД — ЭЛИТНАЯ ИЗОЛЯЦИЯ КВАДРИЦЕПСОВ]
Тренажёр с дуговой траекторией — золотой стандарт для изоляции квадрицепсов без нагрузки на поясницу.

Почему эффективен:
- Дуговая траектория обеспечивает максимальную нагрузку в растянутой позиции
- Нулевая осевая нагрузка на позвоночник
- Постоянное напряжение во всей амплитуде
- Невозможно "украсть" повторение за счёт инерции

Техника:
1. Плечи под упоры, стопы на платформе (середина или чуть ниже)
2. Снимай фиксаторы, контролируй спуск
3. Опускайся максимально глубоко (растяжка квадрицепсов!)
4. Пауза 1 сек в нижней точке
5. Выталкивай через пятки, не замыкай колени полностью

Постановка ног:
- Низко + узко: латеральная головка (vastus lateralis)
- Стандарт: все головки равномерно
- Высоко: больше ягодичных (но это не его главная цель)

Объём: 3-4 × 10-15 после базовых приседаний.
Темп: 3-1-2-0 (медленный негатив, пауза, подъём).
Совет: идеален для myo-reps — подход до отказа, 5 сек отдых, 3-5 повторений × 3.`;
}
export function getReverseGripBench(message: string): string {
  const keywords = ['обратный хват жим', 'reverse grip', 'жим обратн', 'верх груди хват', 'супинированный жим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ЖИМ ЛЁЖА ОБРАТНЫМ ХВАТОМ — ВЕРХНЯЯ ЧАСТЬ ГРУДИ]
Исследования (EMG) показывают на 30% больше активацию верхней части груди по сравнению с обычным жимом.

Техника:
1. Ложись на скамью как для обычного жима
2. Возьми штангу ОБРАТНЫМ хватом (ладони к лицу)
3. Хват чуть шире плеч (не узкий!)
4. Снимай штангу — ОБЯЗАТЕЛЬНО со страхующим
5. Опускай к нижней части груди / верхнему прессу
6. Жми вверх и чуть к голове
7. Локти ближе к корпусу (30-45°)

Ключевые моменты:
- ВСЕГДА со страхующим (сложнее удерживать)
- Начинай с 50-60% от обычного жима
- Запястья прямые, не заламывай
- Большие пальцы ОБЯЗАТЕЛЬНО обхватывают гриф (без monkey grip!)

Преимущества:
✅ Лучшая активация верхней груди
✅ Больше нагрузка на передние дельты
✅ Может быть комфортнее для плеч (меньше внутренняя ротация)

Ограничения:
❌ Сложнее удерживать — нужен опыт
❌ Обязателен страхующий
❌ Не для максимальных весов

Объём: 3-4 × 8-12, как второе упражнение для груди.`;
}
export function getJeffersonCurl(message: string): string {
  const keywords = ['jefferson curl', 'джефферсон керл', 'гибкость позвоночник', 'задняя цепь растяжка', 'сгибание позвоночника вес'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[JEFFERSON CURL — УКРЕПЛЕНИЕ ПОЗВОНОЧНИКА ЧЕРЕЗ ГИБКОСТЬ]
Контролируемое сгибание позвоночника под нагрузкой — упражнение из гимнастики для здоровья спины.

ВАЖНО: это НЕ становая тяга с круглой спиной! Это осознанное, контролируемое, медленное сгибание.

Техника:
1. Встань на возвышение (ступенька, блок), вес в руках (лёгкий!)
2. Подбородок к груди — начинай сгибание с шейного отдела
3. ПОЗВОНОК ЗА ПОЗВОНКОМ — плавно скругляй спину вниз
4. Сгибай грудной отдел → поясничный → наклон в тазу
5. Опусти вес НИЖЕ уровня стоп (амплитуда!)
6. Разгибайся в обратном порядке — снизу вверх
7. Голова поднимается последней

Прогрессия (МЕДЛЕННО!):
1. Без веса × 5 повторений (2-3 недели)
2. 2-5 кг × 5 повторений (2-3 недели)
3. +2 кг каждые 2-3 недели
4. Продвинутые: 15-25 кг

Противопоказания:
❌ Грыжи и протрузии в активной фазе
❌ Острая боль в спине
❌ Без предварительного разогрева

Показания:
✅ Улучшение гибкости задней цепи
✅ Укрепление мышц-разгибателей позвоночника
✅ Профилактика травм спины

Темп: 5 сек вниз, 5 сек вверх. 1 подход × 5 повторений. В конце тренировки.`;
}
export function getZercherSquat(message: string): string {
  const keywords = ['зерчер', 'zercher', 'присед локти', 'штанга в локтях', 'фронтальный локти'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ПРИСЕД ЗЕРЧЕРА — УНИКАЛЬНОЕ БАЗОВОЕ ДВИЖЕНИЕ]
Штанга удерживается в сгибах локтей — создаёт уникальный паттерн нагрузки на всё тело.

Техника:
1. Штанга на стойках на уровне пояса
2. Подойди, помести штангу в сгибы локтей
3. Прижми предплечья к груди, руки сведены
4. Сними штангу, отойди (ноги шире плеч)
5. Приседай, держа корпус максимально вертикально
6. Глубина: минимум параллель бёдер
7. Вставай, толкаясь через пятки

Преимущества:
- Вынуждает держать вертикальный торс (улучшает технику)
- Мощная активация кора и верхней части спины
- Отлично переносится на функциональные движения
- Минимальная осевая нагрузка vs. приседания со штангой на спине
- Учит "правильному" паттерну приседа

Для комфорта:
- Оберни штангу полотенцем или используй pad
- Начинай с лёгкого веса (40-60 кг)
- Рукава или налокотники защитят кожу

Программа:
- 3-4 × 6-10 повторений
- Как основное или второе упражнение дня ног
- Прогрессия: +2.5-5 кг в неделю

Кому подойдёт: тем, кому неудобен обычный фронтальный присед, людям с проблемами запястий/плеч.`;
}
export function getGluteHamRaise(message: string): string {
  const keywords = ['глют-хэм', 'glute ham raise', 'ghr', 'задняя поверхность тренажёр', 'бицепс бедра тренажёр'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[GLUTE-HAM RAISE — ЛУЧШЕЕ ДЛЯ ЗАДНЕЙ ПОВЕРХНОСТИ БЕДРА]
GHR — единственное упражнение, нагружающее бицепс бедра и в тазобедренном, и в коленном суставе одновременно.

Техника:
1. Зафиксируй ноги в тренажёре (подушка выше колен)
2. Корпус перпендикулярен полу — стартовая позиция
3. Медленно опускай корпус вперёд, сохраняя прямую линию от колен до головы
4. Когда корпус параллелен полу — начинай сгибать корпус в тазу
5. Возвращайся обратно, сгибая колени и разгибая бёдра

Прогрессия (упражнение СЛОЖНОЕ!):
1. Эксцентрик только: медленный спуск (5-8 сек), помогай руками подняться
2. С резинкой: петля от стойки помогает подняться
3. Полные повторения × 6-8
4. С блином на груди × 5-8

Преимущества:
- Снижает риск травмы бицепса бедра на 51% (мета-анализ Nordic Curl)
- Одновременная работа при сгибании колена И разгибании бедра
- Улучшает спринт, прыжки, силу в становой тяге
- Профилактика ACL-травм (передняя крестообразная)

Альтернативы: Nordic curl (доступнее), Romanian deadlift (другой паттерн).
Объём: 3-4 × 6-10. Частота: 2 раза в неделю.`;
}
export function getCloseGripBench(message: string): string {
  const keywords = ['узкий хват жим', 'close grip', 'трицепс жим', 'жим узким', 'жим лёжа узк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ЖИМ ЛЁЖА УЗКИМ ХВАТОМ — БАЗА ДЛЯ ТРИЦЕПСА]
Самое тяжёлое и эффективное упражнение для трицепса — позволяет использовать максимальные веса.

Техника:
1. Хват на ширине плеч или чуть уже (НЕ совсем узкий — вредно для запястий!)
2. Оптимальная ширина: 35-40 см между руками
3. Опускай штангу к нижней части груди / солнечному сплетению
4. Локти ближе к корпусу (30-45°, не прижимай полностью)
5. Жми вверх и слегка назад (к стойкам)
6. Полное разгибание локтей в верхней точке

Акцент на головки трицепса:
- Стандартный: все три головки
- С паузой на груди (2 сек): медиальная головка
- С мостом: длинная головка (больше растяжка)
- Негативный (5 сек спуск): максимальная гипертрофия

Прогрессия:
- Типично 70-80% от обычного жима лёжа
- Прогресс: +2.5 кг в неделю
- Объём: 3-4 × 6-10 повторений

Место в программе:
- День трицепса: первое упражнение (пока свежий)
- День груди: после обычного жима (добивка трицепса)
- Push-день: основное или второе движение

Ошибки: слишком узкий хват (перегружает запястья), локти в стороны (теряется акцент на трицепс).`;
}
export function getSealRow(message: string): string {
  const keywords = ['сил роу', 'seal row', 'тяга лёжа на скамье', 'тяга на животе', 'strict row'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[SEAL ROW (ТЯГА ЛЁЖА НА ЖИВОТЕ) — ЧИСТАЯ РАБОТА СПИНЫ]
Полностью исключает инерцию и читинг — 100% нагрузка на широчайшие и ромбовидные.

Установка:
- Скамья на возвышении (2 степ-платформы или плинты)
- Высота: чтобы штанга/гантели свободно свисали под скамьёй
- Ложись на живот, лицо в отверстие (или свисает)

Техника:
1. Возьми штангу/гантели хватом на ширине плеч
2. Лёжа на животе, руки свободно свисают
3. Тяни к нижней части скамьи, сводя лопатки
4. Пиковое сокращение 1-2 сек
5. Медленно опускай (3 сек), полная растяжка внизу

Варианты:
- Штанга: максимальный вес, общая масса спины
- Гантели: больше амплитуда, нейтральный хват
- Разный хват: пронированный, супинированный, нейтральный

Преимущества перед обычной тягой в наклоне:
✅ Нулевая нагрузка на поясницу
✅ Невозможно использовать инерцию
✅ Изолированная работа спины
✅ Безопасно при проблемах с поясницей

Объём: 3-4 × 10-12.
Место: основное или второе упражнение для спины.
Минус: нужна специальная установка (высокая скамья).`;
}
export function getSpotoPress(message: string): string {
  const keywords = ['споторпресс', 'spoto press', 'жим с паузой', 'жим без касания', 'жим зависание', 'пауза над грудью'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[SPOTO PRESS — ЖИМ С ЗАВИСАНИЕМ]
Назван в честь пауэрлифтера Эрика Спото — жим лёжа с паузой 2-3 см над грудью.

Зачем:
- Убирает рефлекс растяжения (stretch reflex) — чистая сила
- Тренирует самую слабую фазу жима (нижняя точка)
- Развивает контроль и стабильность
- Увеличивает время под нагрузкой грудных

Техника:
1. Разгрузка как в обычном жиме
2. Опускай штангу МЕДЛЕННО к груди
3. ОСТАНОВИСЬ в 2-3 см от груди (не касайся!)
4. Задержка 1-3 сек (пауза!)
5. Жми вверх БЕЗ отбива от груди
6. Полное разгибание вверху

Параметры:
- Вес: 75-85% от 1ПМ в жиме лёжа
- 3-4 × 3-6 повторений
- Пауза: 1-3 сек (чем дольше, тем сложнее)
- Блок: 3-4 недели

Вариации:
- Широкий хват: акцент на грудь
- Средний хват: баланс грудь/трицепс
- С ногами на скамье: без поддержки ног (суперстрого)

Эффект: после 4 недель Spoto Press обычный жим чувствуется значительно легче — "эффект переноса".
Место в программе: вместо обычного жима на 3-4 недели или как вспомогательное после основного.`;
}
export function getPinPress(message: string): string {
  const keywords = ['пин пресс', 'pin press', 'жим со стоек', 'жим с упоров', 'board press', 'борд пресс', 'локаут жим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ПИН ПРЕСС / БОРД ПРЕСС — ПРЕОДОЛЕНИЕ МЁРТВОЙ ТОЧКИ]
Частичная амплитуда для работы над слабым участком в жиме лёжа.

Pin Press (жим со стоек):
- Штанга лежит на страховочных стойках на заданной высоте
- Каждое повторение начинается с полной остановки (без рефлекса растяжения)
- Развивает стартовую силу в мёртвой точке

Board Press (жим с доски):
- На грудь кладётся доска (1-5 досок, каждая ~5 см)
- Штанга опускается до доски и жмётся вверх
- Позволяет работать с бо́льшими весами в укороченной амплитуде

Выбор высоты:
- Мёртвая точка внизу: пин на 5-8 см от груди
- Мёртвая точка в середине: пин на уровне лба
- Локаут: последние 15 см

Параметры:
- Вес: 90-110% от 1ПМ (зависит от высоты)
- 4-6 × 2-4 повторения
- Блок: 3-4 недели, затем возврат к полной амплитуде

Эффект: после блока pin press мёртвая точка "пробивается" — основной жим растёт.
Безопасность: всегда в силовой раме, страховочные штыри на месте.`;
}
export function getPauseSquat(message: string): string {
  const keywords = ['присед с паузой', 'pause squat', 'пауза внизу', 'присед пауза', 'застревание в приседе'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ПРИСЕД С ПАУЗОЙ — СИЛА ИЗ НИЖНЕЙ ТОЧКИ]
Пауза в нижней точке убирает рефлекс растяжения — развивает чистую стартовую силу.

Техника:
1. Выполни обычный присед до нижней точки (ниже параллели)
2. ПОЛНОСТЬЮ остановись на 2-3 секунды
3. Сохраняй нейтральную спину, грудь вверх
4. Не расслабляйся в паузе — мышцы напряжены!
5. Взрывной подъём из неподвижного положения
6. Полное разгибание вверху

Варианты паузы:
- 1 сек: минимум, убирает отбив
- 2-3 сек: стандарт, развитие стартовой силы
- 5 сек: экстрим, строит ментальную стойкость
- Двойная пауза: 2 сек внизу + 2 сек на параллели

Параметры:
- Вес: 65-80% от 1ПМ (на 15-20% легче обычного)
- 3-4 × 3-5 повторений
- Блок: 4-6 недель

Когда использовать:
✅ "Застреваешь" в нижней точке приседа
✅ Хочешь улучшить контроль и стабильность
✅ Подготовка к соревнованиям (запас силы)
✅ Улучшение глубины приседа

Эффект: после 4 недель пауз-приседов обычный присед чувствуется "пружинным" — мёртвая точка исчезает.`;
}
export function getAndersonSquat(message: string): string {
  const keywords = ['андерсон присед', 'anderson squat', 'присед с упоров', 'приседания со стоек', 'bottom up squat'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ПРИСЕД АНДЕРСОНА — ПРИСЕД СО СТОЕК (СНИЗУ ВВЕРХ)]
Изобретён Полом Андерсоном — присед начинается из нижней точки, штанга на страховочных стойках.

Уникальность:
- Нет эксцентрической фазы — чистый концентрик
- Убирает ВСЕ преимущества рефлекса растяжения
- Развивает максимальную стартовую силу
- Тренирует "взрыв" из неподвижного положения

Техника:
1. Установи штыри в силовой раме на высоте нижней точки твоего приседа
2. Положи штангу на штыри
3. Подлезь под штангу, встань в стартовую позицию (внизу приседа)
4. Создай напряжение: дыхание, корпус, ноги
5. ВЗРЫВНОЙ подъём — встань полностью
6. Контролируемо опусти штангу обратно на штыри
7. ПОЛНАЯ остановка между повторениями

Параметры:
- Вес: 60-75% от обычного приседа (из-за отсутствия эксцентрики)
- 4-6 × 1-3 повторения (тяжёлые одиночки или тройки)
- Отдых: 3-5 мин между подходами

Кому подходит:
✅ Пауэрлифтерам — пробивание мёртвой точки
✅ Тем, кто боится приседать глубоко
✅ Реабилитация — контролируемая амплитуда
✅ Развитие взрывной силы

Совет: комбинируй с обычными приседами (не заменяй) — 4 недели блоком.`;
}
export function getFloorPress(message: string): string {
  const keywords = ['жим с пола', 'floor press', 'жим лёжа на полу', 'трицепс жим пол', 'локаут трицепс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ЖИМ С ПОЛА (FLOOR PRESS) — ТРИЦЕПС И ЛОКАУТ]
Классическое упражнение — жим лёжа на полу ограничивает амплитуду и убирает ноги из уравнения.

Техника:
1. Ложись на пол, ноги согнуты или вытянуты
2. Штангу снимай со стоек или подавай с пола (помощник)
3. Опускай штангу до касания локтей пола
4. ПАУЗА на полу (1-2 сек) — локти расслаблены
5. Жми вверх, полное разгибание
6. Повтори

Преимущества:
- Безопасен для плеч (ограниченная амплитуда)
- Развивает локаут (последние 2/3 жима)
- Убирает ноги — чистая работа верха
- Учит стартовой силе (пауза на полу)
- Отлично для домашних тренировок (не нужна скамья)

Вариации:
- Штанга: максимальные веса
- Гантели: больше амплитуда, каждая рука отдельно
- С цепями: нарастающее сопротивление
- Узкий хват: акцент на трицепс
- Нейтральный хват (гантели): комфорт для плеч

Параметры:
- 3-4 × 5-8 повторений
- Вес: 80-95% от обычного жима (зависит от вставки ног)
- Место: день трицепса или как вспомогательное к жиму

Кому: тем, у кого болят плечи при полном жиме, пауэрлифтерам для локаута.`;
}
export function getSafetySquatBar(message: string): string {
  const keywords = ['safety squat bar', 'ssb', 'сейфти бар', 'гриф с подушкой', 'присед ssb', 'гриф безопасн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[SAFETY SQUAT BAR — ПРИСЕД С БЕЗОПАСНЫМ ГРИФОМ]
SSB — гриф с изгибом, подушкой и ручками. Смещает центр тяжести вперёд — нагрузка ближе к фронтальному приседу.

Преимущества:
- Не нужна подвижность плеч (руки на ручках перед собой)
- Больше нагрузка на верх спины и кор (центр тяжести смещён)
- Комфортно для шеи и запястий
- Развивает "подъём из ямы" в обычном приседе
- Идеален для тех, у кого травмы плеч/локтей

Техника:
1. Гриф на трапециях, руки на ручках
2. Можно тянуть ручки вверх (облегчает) или вперёд (усложняет)
3. Приседай как обычно — спина вертикально
4. Гриф будет "тянуть" вперёд — борись с этим кором!
5. Вес: на 10-15% меньше обычного приседа

Вариации:
- Обычный SSB присед: замена классике
- Hatfield squat: руки на стойке для баланса, больше вес
- SSB гуд-морнинг: отличное вспомогательное
- SSB выпады: комфортнее для плеч

Для кого:
✅ Травмы плеч/локтей/запястий
✅ Пауэрлифтеры (вспомогательное)
✅ Ограниченная подвижность верха
✅ Все, кто хочет разнообразить тренировки

Объём: как обычные приседания — 3-5 × 5-8.`;
}
export function getSnatchGripDeadlift(message: string): string {
  const keywords = ['рывков хват становая', 'snatch grip', 'широкий хват становая', 'трапеции становая', 'верх спины становая'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[СТАНОВАЯ РЫВКОВЫМ ХВАТОМ — МОЩНЕЙШЕЕ ВСПОМОГАТЕЛЬНОЕ]
Становая тяга широким (рывковым) хватом — одно из лучших упражнений для верхней части спины и трапеций.

Почему эффективна:
- Увеличенная амплитуда (на 5-8 см больше обычной)
- Мощная нагрузка на трапеции и верх спины (удержание широкого хвата)
- Развивает силу хвата
- Улучшает стартовую позицию для обычной становой

Техника:
1. Хват: шире плеч (указательный палец на насечке или шире)
2. Стартовая позиция ниже обычной (из-за широкого хвата)
3. Спина строго нейтральная — критично при широком хвате!
4. Тяни плавно, без рывков
5. Лопатки сведены, трапеции напряжены на протяжении всего движения
6. Верхняя точка: полное разгибание

Параметры:
- Вес: 60-75% от обычной становой
- 3-4 × 4-8 повторений
- С паузой на полу между повторениями (touch & go запрещён!)
- Лямки: допустимы, если хват лимитирует

Программирование:
- Как основная тяга в лёгкий день
- Как вспомогательное после обычной становой
- Блок 4-6 недель → перенос на основное движение

Совет: начинай с пустого грифа — привыкай к позиции. Не форсируй вес.`;
}
export function getTempoContrastTraining(message: string): string {
  const keywords = ['темповой контраст', 'tempo contrast', 'контрастный темп', 'медленно быстро', 'темп чередование'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[КОНТРАСТНЫЙ ТЕМПОВОЙ ТРЕНИНГ]
Чередование медленных и взрывных повторений в одном подходе — максимальная активация моторных единиц.

Протокол:
1. Первые 3-4 повторения: МЕДЛЕННЫЙ темп (4-0-4-0)
2. Следующие 3-4 повторения: ВЗРЫВНОЙ темп (1-0-X-0, X = максимально быстро)
3. Без отдыха между фазами

Почему работает:
- Медленная фаза утомляет медленные волокна (тип I)
- Быстрая фаза вынуждает рекрутировать быстрые волокна (тип IIx)
- Больше моторных единиц задействовано за подход
- Увеличенное время под нагрузкой + взрывная мощность

Примеры:
- Жим лёжа: 4 медленных (4-0-4-0) + 4 взрывных
- Приседания: 3 медленных (5-0-3-0) + 3 взрывных
- Подтягивания: 3 медленных + 3 взрывных

Параметры:
- 3-4 подхода × 6-8 повторений (3-4 медл + 3-4 быстр)
- Вес: 60-70% от 1ПМ
- Отдых: 2-3 мин между подходами
- Блок: 3-4 недели

Кому подходит:
✅ Промежуточный-продвинутый уровень
✅ Плато в силе или гипертрофии
✅ Спортсмены, нуждающиеся в силе И мощности
❌ Начинающие (сначала освой базовую технику)`;
}
export function getPendlayRowStrict(message: string): string {
  const keywords = ['пендлэй строгий', 'strict row', 'тяга с пола строг', 'тяга штанги с полной', 'тяга без инерц'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[СТРОГАЯ ТЯГА ПЕНДЛЭЯ — ПРОДВИНУТАЯ ТЕХНИКА]
Полная остановка на полу между повторениями — максимальная стартовая сила и взрывная мощность спины.

Отличие от обычной тяги Пендлэя:
- Каждое повторение начинается с ПОЛНОЙ остановки
- Никакой инерции — чистый концентрик
- Тяжелее, но эффективнее для развития силы

Строгая техника:
1. Штанга на полу, хват на ширине плеч (или чуть шире)
2. Наклон корпуса: ПАРАЛЛЕЛЬНО полу (90°!)
3. Полный сброс на пол — 1 сек пауза
4. Взрывная тяга к нижней части груди/солнечному сплетению
5. Лопатки сведены в верхней точке (1 сек)
6. Контролируемый спуск → полный сброс

Программирование:
- Силовой блок: 5 × 3-5 с паузой на полу
- Гипертрофия: 4 × 6-8 (строгая форма!)
- Мощность: 6 × 2-3 (взрывной подъём)

Преимущества перед "тяга в наклоне" (Bent-over row):
✅ Нет читинга — невозможно использовать инерцию
✅ Фиксированный угол корпуса
✅ Развивает стартовую силу для становой тяги

Вес: 50-65% от становой тяги. Не форсируй — техника первична!`;
}
export function getBeltSquat(message: string): string {
  const keywords = ['белт сквот', 'belt squat', 'присед с поясом', 'присед без спины', 'ноги без осевой'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[BELT SQUAT — ПРИСЕД БЕЗ ОСЕВОЙ НАГРУЗКИ]
Вес подвешен на поясе — нулевая нагрузка на позвоночник при полной работе ног.

Варианты:
1. Тренажёр Belt Squat (Rhino, Pit Shark):
   - Идеальная траектория, удобно
   - Есть не во всех залах

2. С лэндмайном:
   - Конец штанги в лэндмайн, вес на поясе через цепь
   - Доступно в любом зале

3. С гантелью/гирей между ног:
   - Стоя на двух скамьях/блоках
   - Гантель подвешена на поясе через цепь

Техника:
1. Пояс для окунаний + цепь + вес
2. Встань на возвышения (чтобы вес свисал свободно)
3. Приседай как обычно — спина свободна!
4. Можно держаться за опору для баланса

Преимущества:
✅ Абсолютный ноль осевой нагрузки
✅ Травмы спины? Belt squat — твой лучший друг
✅ Огромный объём без утомления спины
✅ Можно тренировать ноги ежедневно
✅ Отлично для дроп-сетов и гигант-сетов

Программирование:
- 3-5 × 10-20 повторений (высокий объём!)
- После тяжёлых приседов как добивка
- Или как основное — при проблемах со спиной

Совет: добавь паузу внизу (2 сек) — убийственно для квадрицепсов!`;
}
export function getLarsenPress(message: string): string {
  const keywords = ['ларсен пресс', 'larsen press', 'жим без ног', 'жим ноги в воздухе', 'жим без упора ног'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ЛАРСЕН ПРЕСС — ЖИМ ЛЁЖА БЕЗ УПОРА НОГ]
Ноги вытянуты прямо на скамье или свисают — убирает привод ног из жима.

Зачем:
- Изолирует грудь, плечи, трицепс (ноги не помогают)
- Тренирует стабильность корпуса
- Развивает "чистую" силу жима
- Уменьшает арку (полезно для гипертрофии)

Техника:
1. Ложись на скамью, ноги прямые НА скамье (или в воздухе)
2. Пятки не упираются в пол!
3. Жми как обычно — лопатки сведены, грудь вверх
4. Без арки или с минимальной
5. Контролируй стабильность — корпус не должен раскачиваться

Варианты:
- Ноги на скамье (легче — есть опора)
- Ноги в воздухе (сложнее — кор работает)
- Ноги скрещены в воздухе (самое сложное)

Параметры:
- Вес: 70-80% от обычного жима
- 3-4 × 6-10 повторений
- Как вспомогательное или в лёгкий день

Кому:
✅ Пауэрлифтерам — развитие "чистой" силы верха
✅ Бодибилдерам — лучшая активация грудных
✅ Тем, кто злоупотребляет аркой

Безопасность: используй меньший вес, всегда со страхующим.`;
}
export function getZPress(message: string): string {
  const keywords = ['z press', 'зет пресс', 'жим сидя на полу', 'жим без спинки', 'жим вверх сидя строг'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[Z PRESS — ЖЕСТОКИЙ ЖИМ НАД ГОЛОВОЙ]
Жим сидя на полу с прямыми ногами — убирает ВСЮ поддержку: ни ног, ни спинки, ни арки.

Почему "жестокий":
- Нулевая компенсация — чистая сила плеч и трицепсов
- Требует идеальной мобильности ТБС и грудного отдела
- Кор работает изометрически на 100%
- Невозможно отклониться назад (нет спинки!)
- Мгновенно показывает слабые звенья

Техника:
1. Сядь на пол в силовой раме, ноги ПРЯМЫЕ перед собой
2. Штанга снимается со стоек на уровне плеч
3. Спина строго вертикально — не отклоняйся!
4. Жми вертикально вверх, полное разгибание
5. Опускай медленно до уровня подбородка/носа
6. Если заваливаешься — слишком тяжело

Если не получается:
- Недостаток мобильности ТБС → работай над растяжкой
- Слабый кор → дополнительная работа на стабилизацию
- Начни с гантелей (легче балансировать)

Параметры:
- Вес: 50-65% от стоячего жима
- 3-4 × 5-8 повторений
- Прогрессия: +1-2.5 кг в неделю

Место: основное или вспомогательное в день плеч.
Бонус: если можешь Z Press — стоячий жим будет лёгким!`;
}
export function getJmPress(message: string): string {
  const keywords = ['jm press', 'жм пресс', 'жим джи эм', 'гибрид жим', 'жим трицепс продвинут'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[JM PRESS — ГИБРИД ЖИМА И ФРАНЦУЗСКОГО ЖИМА]
Изобретён Дж. М. Блейкли — комбинация жима лёжа узким хватом и французского жима.

Уникальность:
- Совмещает жим и разгибание — двойная нагрузка на трицепс
- Позволяет использовать бо́льший вес, чем французский жим
- Минимальная нагрузка на локти (если правильная техника)

Техника:
1. Ложись как для жима узким хватом (ширина плеч)
2. Опускай штангу, направляя локти ВПЕРЁД (к ногам)
3. Штанга движется к подбородку/горлу (не к груди!)
4. В нижней точке предплечья почти вертикальны
5. Жми вверх, разгибая локти + жимовое движение
6. Траектория: дуга от подбородка к обычной верхней точке жима

Ключевые моменты:
- Локти двигаются ВПЕРЁД, а не в стороны
- Штанга НЕ касается тела (зависает на 3-5 см от горла)
- Медленная негативная фаза (3-4 сек)
- Контроль на протяжении всего движения

Параметры:
- 3-4 × 6-10 повторений
- Вес: между узким жимом и французским (примерно 60-70% от жима)
- Всегда со страхующим!

Место: день трицепса, после основного жима.
Для кого: продвинутые атлеты (нужен опыт обоих движений).`;
}
export function getVikingPress(message: string): string {
  const keywords = ['викинг пресс', 'viking press', 'лэндмайн жим двумя', 'жим лэндмайн стоя', 'жим вверх лэндмайн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[VIKING PRESS — ЖИМ В ЛЭНДМАЙНЕ СТОЯ]
Жим двумя руками в лэндмайне — уникальный угол нагрузки для плеч и трицепсов.

Преимущества:
- Фиксированная траектория (дуга) — безопаснее свободного жима
- Нейтральный хват — комфорт для плеч
- Нагрузка возрастает к верхней точке (рычаг)
- Мощная активация кора (антиротация)
- Можно использовать тяжёлые веса

Техника:
1. Штанга в лэндмайн, стоишь лицом к стене
2. Конец штанги на уровне груди, обе руки на конце
3. Жми вверх и вперёд (по дуге лэндмайна)
4. Полное разгибание рук в верхней точке
5. Контролируемый спуск к груди
6. Корпус слегка наклонён вперёд

Вариации:
- Стоя двумя руками: основной вариант
- Одной рукой: больше амплитуда, антиротация
- На коленях: убирает ноги из уравнения
- С V-рукоятью: нейтральный хват, удобнее

Параметры:
- 3-4 × 8-12 повторений
- Отдых: 90-120 сек
- Место: день плеч, после основного жима

Для кого:
✅ Боль в плечах при обычном жиме
✅ Ограниченная подвижность над головой
✅ Функциональная тренировка
✅ Стронгмен (имитация лог-пресса)`;
}
export function getGripStrengthAdvanced(message: string): string {
  const keywords = ['хват', 'grip', 'кисти', 'предплечья', 'сила хвата', 'кистевой', 'гриппер', 'вис'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🤝 ТРЕНИРОВКА ХВАТА:

Типы хвата:
- Сдавливающий (crush grip): кистевые эспандеры, гриф
- Щипковый (pinch grip): удержание блинов пальцами
- Удерживающий (support grip): вис, фермерская прогулка
- Разгибание: резинки на пальцы (профилактика)

Упражнения:
- Фермерская прогулка: 30-40 сек × 3-4 подхода
- Вис на перекладине: 30-60 сек × 3 подхода
- Кистевые эспандеры (CoC): 5-8 сжатий × 3-5 подходов
- Удержание блина щипком: 15-30 сек × 3 подхода
- Сгибание/разгибание запястий с гантелей: 12-15 × 3
- Полотенце на перекладину (толстый хват): подтягивания
- Прокатка штанги в пальцах: 15-20 × 3

Программирование:
- 2-3 раза в неделю после основной тренировки
- 10-15 минут достаточно
- Чередовать типы хвата
- Прогрессия: время удержания → вес → толщина хвата

Зачем сильный хват:
- Больше повторов в становой/тягах (без лямок)
- Профилактика травм запястий и локтей
- Перенос на все тянущие упражнения
- Функциональная сила в жизни`;
}
export function getForwardVsReverseLunge(message: string): string {
  const keywords = ['выпады', 'lunges', 'вперёд', 'назад', 'обратные выпады', 'реверс выпады'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ВЫПАДЫ ВПЕРЁД vs НАЗАД:

Выпады вперёд:
- Больше нагрузка на квадрицепсы
- Эксцентрическое торможение вперёд (больше стресса на колено)
- Лучше для спортивной специфики (бег, прыжки)
- Сложнее баланс (инерция вперёд)
- Противопоказаны при проблемах с коленями

Обратные выпады (назад):
- Более безопасны для коленей (меньше сдвигающих сил)
- Равномерная нагрузка квадрицепсы + ягодицы
- Легче контролировать технику
- Лучше для начинающих
- Меньше нагрузка на переднюю крестообразную связку

Вариации:
- Дефицитные (с подставки): увеличенная амплитуда
- С ходьбой (walking lunges): функциональность + кардио
- Болгарские (задняя нога на скамье): максимум на одну ногу
- Перекрёстные (curtsy): акцент на приводящие

Программирование:
- Начинающие: обратные выпады 3×10-12 на ногу
- Средний уровень: чередовать типы в разные дни
- Продвинутые: суперсет вперёд + назад
- Вес: гантели в руках или штанга на спине`;
}
export function getSissyHackSquat(message: string): string {
  const keywords = ['сисси хак', 'sissy hack', 'гак присед сисси', 'сиси', 'сисcи приседания'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ СИССИ ХАК-ПРИСЕДАНИЯ:

Что это:
Комбинация сисси-приседа и гак-приседа:
отклонение корпуса назад с упором на квадрицепсы,
максимальная изоляция передней поверхности бедра.

Техника:
1. Держитесь за опору одной рукой
2. Встаньте на носки, пятки оторваны
3. Отклоняйтесь назад, сгибая колени
4. Колени уходят далеко вперёд (это нормально для этого упражнения)
5. Бёдра и корпус — одна линия (не ломайтесь в тазу)
6. Опускайтесь до максимального растяжения квадрицепсов
7. Мощно выжимайте вверх через носки

Для кого:
- Тем, кто хочет добить квадрицепсы после основных приседов
- Бодибилдерам для детализации передней поверхности
- Тем, кто ищет альтернативу разгибаниям ног

Противопоказания:
- Проблемы с коленями (огромная нагрузка на связки)
- Не для новичков — требует базовой силы и подвижности

Программирование:
- Финишер дня ног: 3×12-20 (без веса или лёгкий)
- Суперсет с разгибаниями ног
- НЕ заменяет базовые приседания`;
}
export function getLateralDeltTraining(message: string): string {
  const keywords = ['средняя дельта', 'боковая дельта', 'lateral delt', 'широкие плечи', 'махи в стороны', 'отведение плеча'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ТРЕНИРОВКА СРЕДНЕЙ ДЕЛЬТЫ:

Почему важна:
- Создаёт визуальную ширину плеч (V-силуэт)
- Самая заметная часть дельтовидной мышцы
- Плохо работает в жимах (передняя дельта доминирует)
- Нуждается в изоляции для максимального развития

Лучшие упражнения (по ЭМГ):
1. Махи гантелей в стороны: 3-4×12-20
2. Тяга к подбородку широким хватом: 3×10-15
3. Махи в кроссовере (одной рукой): 3×12-15
4. Разведения в тренажёре: 3×12-15
5. Боковые подъёмы лёжа на боку: 3×12-15

Техника махов:
- Лёгкий наклон вперёд (5-10°)
- Мизинец чуть выше большого пальца (внутренняя ротация)
- Не поднимать выше уровня плеч (трапеция берёт)
- Контролируемое опускание (2-3 сек негатив)
- Лёгкие веса, много повторений

Программирование:
- 15-25 подходов в неделю для отстающих плеч
- 2-3 раза в неделю (дельты восстанавливаются быстро)
- Чередовать: гантели / кабели / тренажёры
- Финишер: 100-метод (4 дроп-сета = 100 повторений)`;
}
export function getPausedBulgarianSplit(message: string): string {
  const keywords = ['болгарский с паузой', 'паузой сплит', 'paused bulgarian', 'болгарский присед пауза'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⏸️ БОЛГАРСКИЙ СПЛИТ-ПРИСЕД С ПАУЗОЙ:

Зачем пауза:
- Убирает рефлекс растяжения (stretch reflex)
- Увеличивает время под напряжением в нижней точке
- Усиливает рекрутирование мышечных волокон
- Развивает стартовую силу из мёртвой точки
- Выявляет слабые звенья в диапазоне движения

Техника:
1. Задняя нога на скамье, передняя на полу
2. Опуститься до параллели (бедро || полу)
3. ПАУЗА 2-3 секунды в нижней точке
4. Полностью расслабить квадрицепс (убить инерцию)
5. Мощно встать — без раскачки и читинга
6. Колено передней ноги не уходит за носок

Кому подходит:
- Атлетам с «мёртвой точкой» в нижней части приседа
- Для коррекции дисбаланса между ногами
- Бодибилдерам (увеличенный TUT = рост)
- Пауэрлифтерам (сила из нижней позиции)

Программирование:
- 3×6-10 на ногу (вес на 20-30% легче обычного)
- Пауза: 2-3 сек (считать «один-один-тысяча...»)
- 1-2 раза в неделю
- Прогрессия: увеличивать паузу → увеличивать вес`;
}
export function getReverseGripRow(message: string): string {
  const keywords = ['обратный хват тяга', 'reverse grip row', 'тяга обратным хватом', 'супинированный хват тяга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ТЯГА В НАКЛОНЕ ОБРАТНЫМ ХВАТОМ:

Отличия от прямого хвата:
- Больше амплитуда (локти ближе к телу)
- Сильнее активация нижних широчайших
- Больше нагрузка на бицепсы
- Более естественное положение плеча
- Дориан Йейтс — главный популяризатор

Техника:
1. Хват снизу (супинация), чуть шире плеч
2. Наклон 45-60° (не слишком низко)
3. Тяга к нижней части живота (не к груди!)
4. Локти скользят вдоль тела (не разводить)
5. Сжать лопатки в верхней точке (1 сек)
6. Контролируемое опускание

Преимущества:
- Больше ROM → больше мышечная работа
- Лучше чувствуется нижняя часть спины
- Меньше нагрузка на плечевой сустав
- Помогает развить толщину спины

Программирование:
- 3-4×8-12 повторений
- Вес на 10-15% меньше, чем прямым хватом
- Отлично как второе упражнение на спину
- Чередовать с прямым хватом по неделям

Осторожно: запястья — если болят, используйте EZ-гриф.`;
}
export function getLegExtensionVariations(message: string): string {
  const keywords = ['разгибание ног', 'leg extension', 'квадрицепс изоляция', 'разгибания вариации'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 РАЗГИБАНИЯ НОГ — ВАРИАЦИИ:

Классическое разгибание:
- Обе ноги одновременно
- 3×12-20 повторений
- Контроль: 2 сек вверх, 3 сек вниз
- Не разгибать колено полностью (снять нагрузку со связок)

Одноногое разгибание:
- Выявляет и исправляет дисбаланс
- Более сильное сокращение (фокус)
- 3×10-15 на ногу

Разгибание с паузой:
- 2-3 сек пауза в верхней точке (пиковое сокращение)
- Максимальная активация vastus medialis (внутренняя головка)
- Отлично для здоровья колена (VMO стабилизирует)

1.5 повторения:
- Вверх полностью → вниз наполовину → вверх → вниз полностью
- Увеличенное время под напряжением
- Жжение невероятное

Дроп-сеты:
- 3 сброса веса по 25-30%
- Финишер дня ног

Безопасность коленей:
- НЕ используйте максимальный вес
- Контролируйте эксцентрик (опускание)
- Если болят колени — замените на сисси-присед или терминальное разгибание (TKE)
- Угол наклона спинки — влияет на растяжение квадрицепса`;
}
export function getLegPressAngles(message: string): string {
  const keywords = ['жим ногами', 'leg press', 'постановка ног жим', 'угол жим ног', 'платформа ног'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ЖИМ НОГАМИ — УГЛЫ И ПОСТАНОВКА:

Постановка ног на платформе:
ВЫСОКО (верхняя часть):
- Акцент: ягодицы + задняя поверхность бедра
- Больше разгибание бедра, меньше коленей
- Безопаснее для коленей

НИЗКО (нижняя часть):
- Акцент: квадрицепсы (особенно vastus medialis)
- Больше сгибание коленей
- Осторожно: нагрузка на колени и поясницу

ШИРОКО (шире плеч):
- Акцент: приводящие мышцы + внутренняя часть бедра
- Носки развёрнуты наружу (45°)

УЗКО (уже плеч):
- Акцент: латеральная часть квадрицепсов
- Больше амплитуда движения

Углы тренажёра:
- 45° (классический): стандартная нагрузка
- Горизонтальный: меньше осевая нагрузка на позвоночник
- Вертикальный (hack): максимум на квадрицепсы

Техника безопасности:
- НИКОГДА не выпрямлять колени полностью (замыкание)
- Поясница прижата к спинке (не отрывать таз!)
- Опускать до 90° в коленях (не глубже если таз уходит)
- Дыхание: выдох на подъёме

Программирование:
- Базовое: 3-4×8-12
- Гипертрофия: 3×15-20 (жжение)
- Сила: 4×5-8
- Менять постановку каждую тренировку`;
}
export function getForearmDetailedTraining(message: string): string {
  const keywords = ['предплечья тренировка', 'forearm training', 'сгибание запястий', 'wrist curl', 'предплечья накачать'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ДЕТАЛЬНАЯ ТРЕНИРОВКА ПРЕДПЛЕЧИЙ:

Анатомия:
- Сгибатели запястья (внутренняя сторона): сгибания
- Разгибатели запястья (внешняя сторона): разгибания
- Брахиорадиалис: молотковые сгибания, обратные сгибания
- Пронаторы/супинаторы: вращение

Упражнения по группам:
СГИБАТЕЛИ:
1. Сгибания запястий (сидя, гантели на коленях): 3×15-20
2. Сгибания за спиной (штанга): 3×15-20
3. Прокатка штанги в пальцах: 3×15-20

РАЗГИБАТЕЛИ:
1. Обратные сгибания запястий: 3×15-20
2. Разгибания с резинкой на пальцах: 3×20-30
3. Radial/ulnar deviation: 3×12-15

БРАХИОРАДИАЛИС:
1. Молотковые сгибания: 3×10-12
2. Обратные сгибания (штанга/EZ): 3×10-12
3. Zottman curls: 3×10-12 (вверх супинация, вниз пронация)

Программирование:
- 2-3 раза в неделю, после основной тренировки
- 10-15 минут достаточно
- Высокие повторения (15-30) для сгибателей/разгибателей
- Средние повторения (10-15) для брахиорадиалиса
- Растяжка после тренировки (профилактика эпикондилита)`;
}
export function getHackVsLegPress(message: string): string {
  const keywords = ['гак или жим', 'hack vs leg press', 'гак жим ногами', 'что лучше гак', 'hack squat или'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚖️ ГАК-ПРИСЕД vs ЖИМ НОГАМИ:

ГАК-ПРИСЕД:
✅ Имитирует приседания (вертикальный паттерн)
✅ Больше активация квадрицепсов
✅ Развивает силу в приседе
✅ Больше стабилизации (стоя на ногах)
❌ Нагрузка на колени выше
❌ Требует подвижности голеностопа
❌ Тяжелее для поясницы

ЖИМ НОГАМИ:
✅ Минимальная нагрузка на поясницу
✅ Можно работать с большими весами
✅ Разные постановки ног = разные акценты
✅ Безопаснее для начинающих
❌ Меньше стабилизации (не стоишь)
❌ Риск отрыва таза при большой глубине
❌ Не переносится на приседания так же хорошо

Когда что использовать:
- Проблемы с поясницей → жим ногами
- Хочешь улучшить присед → гак-присед
- Начинающий → жим ногами
- Добивка квадрицепсов → гак-присед
- Максимальный вес → жим ногами
- Тренировка без напарника → жим ногами

Идеальная комбинация:
День 1: Приседания + жим ногами (высоко)
День 2: Гак-присед + разгибания ног`;
}
export function getTrapTrainingComplete(message: string): string {
  const keywords = ['трапеция полн', 'trap training complete', 'верхняя средняя нижняя трапеция', 'трапеции все части'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏔️ ТРЕНИРОВКА ТРАПЕЦИЙ — ВСЕ ЧАСТИ:

Анатомия:
- Верхняя часть: поднимает лопатки (шраги)
- Средняя часть: сводит лопатки (тяги к груди)
- Нижняя часть: опускает лопатки (Y-подъёмы)

ВЕРХНЯЯ ТРАПЕЦИЯ:
1. Шраги со штангой: 3×12-15
2. Шраги с гантелями: 3×12-15
3. Фермерская прогулка: 3×30-40 сек
Техника: вверх-назад (не вращать!), пауза 2 сек наверху

СРЕДНЯЯ ТРАПЕЦИЯ:
1. Тяга к груди в наклоне (широкий хват): 3×10-12
2. Face pulls: 3×15-20
3. Chest-supported row (лёжа на скамье): 3×10-12
Техника: сводить лопатки, не сгибать руки

НИЖНЯЯ ТРАПЕЦИЯ (часто забытая):
1. Y-подъёмы на наклонной скамье: 3×12-15
2. Prone trap raises: 3×12-15
3. Overhead shrugs (в верхней точке жима): 3×10
Техника: руки прямые, лопатки вниз и к позвоночнику

Баланс важен:
- Верхняя > средняя/нижняя = сутулость
- Тренируйте все три части равномерно
- 2-3 упражнения 2 раза в неделю`;
}
export function getArnoldPressTechnique(message: string): string {
  const keywords = ['жим арнольда', 'arnold press', 'арнольд жим', 'вращательный жим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏆 ЖИМ АРНОЛЬДА — ТЕХНИКА:

Что это:
Жим гантелей с вращением — начинается в позиции
обратного сгибания (ладони к себе), заканчивается
классическим жимом (ладони вперёд).

Преимущества:
- Прорабатывает ВСЕ три пучка дельтовидных
- Увеличенная амплитуда движения vs обычный жим
- Ротация добавляет работу средней и передней дельты
- Постоянное натяжение (нет мёртвых точек)

Техника пошагово:
1. Сидя, спинка 80-90°, гантели перед собой (ладони к лицу)
2. Начинайте разводить локти в стороны + вращать запястья
3. В середине: ладони смотрят в стороны
4. Выжимайте вверх, завершая ротацию (ладони вперёд)
5. В верхней точке: руки почти прямые
6. Обратное движение: опускайте + вращайте назад

Ключевые моменты:
- Плавное вращение (не резкое!)
- Не выпрямлять руки полностью наверху
- Вес на 20-30% меньше обычного жима
- Контроль на протяжении всего ROM

Программирование:
- 3×10-12 повторений
- Как основное или второе упражнение на плечи
- Не сочетать с обычным жимом в один день
- 2 раза в неделю максимум`;
}
export function getOneArmDbRow(message: string): string {
  const keywords = ['тяга гантели одной рукой', 'one arm row', 'тяга в наклоне одной', 'гантель одной рукой тяга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ТЯГА ГАНТЕЛИ ОДНОЙ РУКОЙ В НАКЛОНЕ:

Почему это одно из лучших упражнений:
- Односторонняя работа (исправляет дисбаланс)
- Огромная амплитуда (больше любой штанговой тяги)
- Минимальная нагрузка на поясницу (опора на скамью)
- Можно работать очень тяжело (безопасно)

Техника (версия Кройце — на скамье):
1. Одно колено и рука на скамье
2. Спина параллельна полу (или чуть выше)
3. Гантель в свободной руке, рука свисает вниз
4. Тяга к бедру (не к груди!) — локоть назад
5. Лопатка: вниз в начале → вверх в конце
6. Контролируемое опускание с растяжкой

Техника (стоя, упор рукой):
1. Одна рука на стойке/скамье
2. Широкая стойка ног (стабильность)
3. Наклон 45-60°
4. Тяга к бедру

Вариации траектории:
- К бедру: акцент на широчайшие (нижняя часть)
- К груди: акцент на верх спины, трапецию
- Под 45°: баланс между ними

Программирование:
- 3-4×8-12 на сторону
- Начинайте со слабой стороны
- Одинаковое количество повторений на обе стороны
- 2 раза в неделю`;
}
export function getPeriodizationNaturals(message: string): string {
  const keywords = ['периодизация натурал', 'periodization natural', 'натуральный атлет програм', 'без стероидов програм', 'натурал тренировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📊 ПЕРИОДИЗАЦИЯ ДЛЯ НАТУРАЛЬНЫХ АТЛЕТОВ:

Почему натуралам нужна другая периодизация:
- Синтез белка повышен 24-48ч (не 72+, как на стероидах)
- Значит: мышцу нужно тренировать чаще (2-3 раза/нед)
- Объём за тренировку — ниже, но частота — выше
- Отдых и деload критичнее

Лучшие сплиты для натуралов:
1. Upper/Lower (4 дня): каждая мышца 2 раза/нед
2. Push/Pull/Legs (6 дней): каждая мышца 2 раза/нед
3. Full Body (3 дня): каждая мышца 3 раза/нед

Волновая периодизация (лучшая для натуралов):
- Неделя 1: 3×10-12 (гипертрофия)
- Неделя 2: 4×6-8 (сила)
- Неделя 3: 3×12-15 (метаболический стресс)
- Неделя 4: deload (50% объёма)

Ключевые принципы:
- Прогрессия нагрузки каждую неделю/месяц
- Deload каждые 4-6 недель (обязательно!)
- 10-20 подходов на мышцу в неделю
- RPE 7-9 (не каждый подход до отказа)
- Сон 7-9 часов (гормон роста!)
- Белок 1.6-2.2 г/кг/день
- Калорийный профицит +200-300 ккал для набора`;
}
export function getCalvesScienceTraining(message: string): string {
  const keywords = ['икры наука', 'calves science', 'голень тренировка наук', 'икроножная камбаловидная', 'икры не растут'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ИКРЫ: НАУЧНЫЙ ПОДХОД:

Анатомия:
- Икроножная (gastrocnemius): 2 головки, быстрые волокна
  → Работает при выпрямленном колене
- Камбаловидная (soleus): под икроножной, медленные волокна
  → Работает при согнутом колене
  → 60% объёма голени!

Почему не растут:
- Генетика (длина сухожилия vs мышечного брюшка)
- Мало объёма (3×15 раз в неделю — недостаточно!)
- Нет прогрессии
- Маленькая амплитуда (читинг)

Как заставить расти:
1. Объём: 16-20 подходов/неделю (больше, чем для других мышц!)
2. Частота: 4-6 раз в неделю (маленькая мышца, быстро восстанавливается)
3. Полная амплитуда: максимальное растяжение ВНИЗУ (2-3 сек)
4. Пауза наверху: 1-2 сек (пиковое сокращение)
5. Медленный темп: 3-1-2 (опускание-пауза-подъём)

Программа:
Понедельник: Подъёмы стоя 4×8-12 (икроножная)
Вторник: Подъёмы сидя 4×12-20 (камбаловидная)
Четверг: Подъёмы в жиме ногами 4×10-15
Пятница: Подъёмы сидя 4×15-25
Суббота: Подъёмы стоя на одной ноге 3×10-12

Растяжка КРИТИЧНА: 30 сек на каждую ногу после тренировки.`;
}
export function getSkullCrushersTechnique(message: string): string {
  const keywords = ['skull crusher', 'скул крашер', 'французский жим лёжа', 'разгибание лёжа штанг', 'трицепс лёжа штанг'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💀 SKULL CRUSHERS (ФРАНЦУЗСКИЙ ЖИМ ЛЁЖА):

Почему эффективны:
- Длинная головка трицепса в растяжении (руки над головой)
- Растяжение под нагрузкой = максимальный стимул роста
- Большая амплитуда движения
- Можно использовать значительный вес

Техника (EZ-гриф):
1. Лечь на горизонтальную скамью
2. Хват узкий (внутренние изгибы EZ-грифа)
3. Руки вертикально вверх (стартовая позиция)
4. Сгибать ТОЛЬКО локти — плечи неподвижны!
5. Опускать ко лбу или за голову
6. Разгибание мощное, но контролируемое

Ко лбу vs за голову:
- Ко лбу: больше на латеральную головку
- За голову: больше на длинную головку (лучше для массы!)
- За голову = больше растяжение = больше рост

Варианты:
- EZ-гриф: классика, комфортно для запястий
- Гантели: независимая работа рук, больше стабилизации
- На наклонной скамье: ещё больше растяжение длинной головки
- В кроссовере (нижний блок): постоянное натяжение

Безопасность:
- НЕ опускать НА лоб (чуть выше или за голову)
- Лёгкий вес → техника → прогрессия
- Локти не разводить (параллельно друг другу)
- Партнёр для страховки при тяжёлых подходах

Программирование: 3×10-12, второе упражнение на трицепс.`;
}
export function getLatsScienceTraining(message: string): string {
  const keywords = ['широчайшие наука', 'lats science', 'широчайшие мышцы', 'спина ширина', 'v-образн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦅 ШИРОЧАЙШИЕ: НАУЧНЫЙ ПОДХОД:

Анатомия:
- Крупнейшая мышца верха тела
- Функции: приведение, разгибание, внутренняя ротация плеча
- Верхняя часть: ширина (подтягивания)
- Нижняя часть: толщина (тяги)

Топ упражнений по ЭМГ:
ШИРИНА:
1. Подтягивания широким хватом: 3×6-12
2. Тяга верхнего блока широким хватом: 3×10-12
3. Пуловер (гантель/блок): 3×12-15

ТОЛЩИНА:
1. Тяга штанги в наклоне: 3×8-12
2. Тяга нижнего блока (V-рукоять): 3×10-12
3. Тяга гантели одной рукой: 3×8-12

Ключи к росту:
- Растяжение под нагрузкой: задержка в нижней точке тяг
- Полная амплитуда: полное растяжение → полное сокращение
- Mind-muscle connection: тянуть ЛОКТЁМ, не рукой
- Лопатки: депрессия → ретракция → тяга

Объём: 12-20 подходов/неделю
Частота: 2 раза в неделю
Соотношение: 50% вертикальные + 50% горизонтальные тяги

Прогрессия для подтягиваний:
Резинка → собственный вес → пояс с отягощением`;
}
export function getInvertedRowDetailed(message: string): string {
  const keywords = ['обратная тяга прогресс', 'inverted row progress', 'австралийские подтягивания', 'тяга на кольцах горизонт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔄 ОБРАТНАЯ ТЯГА (INVERTED ROW) — ПРОГРЕССИЯ:

Что это:
Горизонтальное подтягивание — тело под углом,
тяга к перекладине/кольцам. Отличное упражнение
для спины без тяжёлых весов.

Прогрессия (от лёгкого к тяжёлому):
1. Ноги согнуты, высокая перекладина (45°): начальный уровень
2. Ноги прямые, высокая перекладина: средний
3. Ноги на полу, низкая перекладина: продвинутый
4. Ноги на возвышении (скамья): ещё тяжелее
5. С утяжелением (жилет/блин на груди): эксперт
6. На кольцах (нестабильность): максимум

Хваты:
- Прямой (пронация): верх спины, задние дельты
- Обратный (супинация): широчайшие + бицепсы
- Нейтральный (кольца): комфортно для плеч

Техника:
1. Тело — прямая линия (не провисать в тазу!)
2. Лопатки: сведение → тяга грудью к перекладине
3. Пауза 1 сек у перекладины
4. Медленное опускание (3 сек)
5. Полное разгибание рук внизу (растяжка)

Программирование:
- 3-4×8-15 повторений
- Разминка перед тяжёлыми тягами
- Суперсет с отжиманиями (антагонисты)
- Финишер дня спины (высокие повторения)
- Отличная замена тяге штанги при травмах поясницы`;
}
export function getWideGripPullUps(message: string): string {
  const keywords = ['подтягивания широким', 'wide grip pull', 'широкий хват подтяг', 'подтягивания ширина'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ПОДТЯГИВАНИЯ ШИРОКИМ ХВАТОМ:

Биомеханика:
- Широкий хват: больше приведение плеча (аддукция)
- Акцент на верхнюю часть широчайших
- Меньше вовлечение бицепсов (короче рычаг)
- Больше работа большой круглой мышцы (teres major)

Техника:
1. Хват: 1.5 ширины плеч (не шире — травма плеча!)
2. Вис: лопатки опущены (депрессия), не расслабленный вис
3. Начало: сведение лопаток → тяга локтей вниз
4. Подъём: подбородок выше перекладины
5. Грудь к перекладине (не подбородок!)
6. Опускание: контролируемое, 2-3 сек
7. Внизу: полное разгибание, но лопатки в тонусе

Хват прямой vs обратный:
- Прямой (пронация): классика, верх широчайших
- Обратный (супинация): больше бицепс, нижняя часть лат
- Нейтральный: баланс, комфортно для плеч

Прогрессия:
1. Негативные подтягивания (5 сек опускание)
2. Подтягивания с резинкой
3. Собственный вес
4. С паузой наверху (2 сек)
5. С отягощением (пояс + блины)

Программирование:
- 4×max (собственный вес)
- 4×6-8 (с отягощением)
- 2 раза в неделю
- Первое упражнение дня спины`;
}
export function getChestScienceTraining(message: string): string {
  const keywords = ['грудные наука', 'chest science', 'грудь тренировка наук', 'пекторальные', 'грудь полный гайд'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ГРУДНЫЕ: НАУЧНЫЙ ПОДХОД:

Анатомия:
- Верхняя часть (ключичная): жимы на наклонной 30-45°
- Средняя часть (стернальная): горизонтальный жим
- Нижняя часть (абдоминальная): жим на обратном наклоне / отжимания на брусьях

Топ упражнений по ЭМГ:
ВЕРХ:
1. Жим гантелей на наклонной 30°: 3×8-12
2. Low-to-high cable fly: 3×12-15
3. Reverse grip bench press: 3×8-12

СЕРЕДИНА:
1. Жим штанги лёжа: 3×6-10
2. Жим гантелей лёжа: 3×8-12
3. Cable fly (середина): 3×12-15

НИЗ:
1. Отжимания на брусьях (наклон вперёд): 3×8-12
2. High-to-low cable fly: 3×12-15
3. Decline press: 3×8-12

Ключи к росту:
- Растяжение под нагрузкой (fly + глубокие жимы)
- Гантели > штанги для гипертрофии (больший ROM)
- Верхняя часть отстаёт у большинства (больше наклонных)
- Flyes в конце тренировки (изоляция после compound)

Объём: 12-20 подходов/неделю
Частота: 2 раза/неделю
Соотношение: 40% наклонные + 40% горизонтальные + 20% изоляция`;
}
export function getPulloverTechnique(message: string): string {
  const keywords = ['пуловер техника', 'pullover technique', 'пуловер грудь', 'пуловер спина', 'пуловер гантель'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ПУЛОВЕР — ТЕХНИКА И НЮАНСЫ:

Уникальность:
Единственное упражнение, одновременно нагружающее
грудные И широчайшие (в зависимости от техники).

Грудной вариант (гантель):
- Лёжа поперёк скамьи (таз ниже плеч)
- Локти слегка согнуты и ЗАФИКСИРОВАНЫ
- Движение: от груди → за голову → обратно
- Акцент: растяжение грудных в нижней точке
- Не опускать слишком глубоко (плечевой сустав!)

Спинной вариант (блок):
- Прямые руки (или минимальный изгиб)
- Верхний блок, стоя или на коленях
- Тяга вниз к бёдрам прямыми руками
- Акцент: широчайшие (приведение плеча)

Ключевые отличия:
- Согнутые локти → больше грудь
- Прямые руки → больше спина
- Лёжа на скамье → грудь + расширение грудной клетки
- Стоя на блоке → спина (изоляция широчайших)

Программирование:
- Грудной пуловер: 3×12-15 (финишер дня груди)
- Пуловер на блоке: 3×12-15 (первое изоляция спины)
- Лёгкий вес, чувство мышцы > килограммы

Для молодых атлетов (<25):
Пуловеры лёжа могут расширять грудную клетку
(хрящи рёбер ещё пластичны). Спорный эффект, но безвредно.`;
}
export function getTBarRowTechnique(message: string): string {
  const keywords = ['т-тяга', 't-bar row', 'тяга т-грифа', 'тяга штанги в угл', 'ландмайн тяга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ Т-ТЯГА (T-BAR ROW):

Варианты:
1. На тренажёре (с упором груди): самый безопасный
2. Со свободным концом штанги (landmine): классика
3. С рукоятью: различные хваты

Техника (свободная штанга):
1. Один конец штанги в углу (или в landmine крепление)
2. V-рукоять под грифом (ближе к блинам)
3. Наклон 45° (грудь направлена к штанге)
4. Хват узкий (V-рукоять) или за гриф
5. Тяга к животу: лопатки сводим → локти назад
6. Пауза 1 сек → контролируемое опускание

Преимущества:
- Нейтральный хват (комфортно для плеч)
- Стабильная траектория (штанга зафиксирована)
- Можно работать тяжело (безопаснее, чем тяга в наклоне)
- Отличная активация средней части спины

Хваты:
- V-рукоять (узкий): максимум на толщину спины
- Прямой широкий хват: верх спины, задние дельты
- Обратный хват: широчайшие + бицепс

С упором груди:
- Убирает нагрузку с поясницы полностью
- Невозможно читинговать
- Лучшая изоляция спины
- Меньший рабочий вес

Программирование:
- 3-4×8-12
- Второе compound на спину
- Чередовать с тягой штанги в наклоне`;
}
export function getInclineBenchPress(message: string): string {
  const keywords = ['жим на наклонной', 'incline bench', 'наклонный жим', 'верх груди жим', 'жим 30 градусов'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📐 ЖИМ НА НАКЛОННОЙ СКАМЬЕ:

Оптимальный угол:
- 30°: лучший баланс верх груди + передняя дельта
- 45°: больше передняя дельта (менее оптимально для груди)
- 15-20°: почти как горизонтальный, лёгкий акцент на верх
- Исследование 2020: 30° = максимальная активация верхней части

Штанга vs Гантели:
ШТАНГА:
+ Больше вес
+ Стабильная траектория
- Меньше ROM
- Нет независимой работы рук

ГАНТЕЛИ:
+ Больше ROM (глубже опустить)
+ Растяжение грудных
+ Корректирует дисбаланс
- Сложнее вывести в позицию
- Меньше абсолютный вес

Техника (штанга):
1. Спина: лёгкий прогиб, лопатки сведены
2. Хват: 1.5 ширины плеч
3. Снятие: на прямые руки, штанга над ключицами
4. Опускание: к верхней части груди (ключицы)
5. Локти: 45-60° от тела (не 90°!)
6. Жим: вверх и слегка назад (дуга)

Программирование:
- Первое упражнение дня груди (пока свежий)
- Штанга: 3-4×6-10
- Гантели: 3-4×8-12
- Чередовать: штанга неделя 1, гантели неделя 2

Верх груди отстаёт у 90% людей — делайте наклонный жим ПЕРВЫМ.`;
}
export function getDeadliftVariationsComplete(message: string): string {
  const keywords = ['мёртвая тяга', 'становая', 'дедлифт', 'deadlift', 'тяга с пола', 'румынская тяга', 'тяга на прямых'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ВАРИАЦИИ СТАНОВОЙ ТЯГИ — ПОЛНЫЙ ГАЙД:

Классическая становая:
- Ноги на ширине бёдер, хват чуть шире
- Спина нейтральная, грудь вперёд
- Тяга начинается ногами, затем разгибание таза
- Целевые мышцы: вся задняя цепь, квадрицепсы, кор
- Ошибки: округление поясницы, отрыв таза раньше плеч

Румынская тяга (RDL):
- Старт сверху, минимальный сгиб коленей
- Гриф скользит по бёдрам вниз
- Растяжение задней поверхности — предел
- Акцент: бицепс бедра, ягодицы
- Не касаемся пола — разворот в точке максимального натяжения

Тяга сумо:
- Широкая постановка ног, носки наружу 45°
- Короткая амплитуда, меньше нагрузка на поясницу
- Больше квадрицепсов и приводящих
- Колени строго над стопами

Тяга трэп-бара (гексагональный):
- Нейтральный хват, центр тяжести по бокам
- Безопаснее для поясницы
- Отлично для начинающих и набора силы
- Ближе к приседу по биомеханике

Дефицитная становая:
- Стоя на подставке 5-10 см
- Увеличенная амплитуда = больше работы ног от пола
- Развивает силу срыва
- Только при идеальной технике базовой становой

Программирование:
- Сила: 3-5 повторений, 80-90% 1ПМ
- Гипертрофия: 6-10 повторений, 65-80% 1ПМ
- RDL/румынская: 8-12 повторений (контроль эксцентрики)
- Частота: 1-2 раза в неделю с адекватным восстановлением
- Прогрессия: +2.5 кг/неделю для новичков`;
}
export function getFrontRaiseScience(message: string): string {
  const keywords = ['подъём перед собой', 'фронт рейз', 'front raise', 'передняя дельта изоляция', 'передний пучок'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ПОДЪЁМ ПЕРЕД СОБОЙ — НАУКА И ТЕХНИКА:

Анатомия:
- Передняя дельтовидная — основная
- Ключичная порция большой грудной — синергист
- Верх трапеции — стабилизатор

Классическая техника:
- Стоя, гантели у бёдер, ладони к себе
- Подъём до уровня глаз (не выше — трапеция перехватывает)
- Контролируемое опускание 2-3 секунды
- Корпус неподвижен, без раскачки

Вариации:
- С блинами (нейтральный хват) — другой вектор
- На нижнем блоке — постоянное натяжение
- Попеременно — лучший контроль
- Сидя — исключает читинг
- С штангой — двустороннее нагружение

Нужен ли вообще фронт рейз?
- Передняя дельта АКТИВНО работает в жимах (жим лёжа, жим стоя)
- У большинства передняя дельта доминирует без изоляции
- Приоритет: средний и задний пучки
- Фронт рейз нужен: бодибилдерам для симметрии, если передняя дельта отстаёт

Параметры:
- 3-4 подхода × 12-15 повторений
- Малый-средний вес (не гонитесь за весом!)
- Темп: 2-0-3 (подъём-верх-спуск)
- В конце тренировки плеч как добивка`;
}
export function getSumoDeadliftTechnique(message: string): string {
  const keywords = ['сумо тяга', 'тяга сумо', 'sumo deadlift', 'широкая стойка становая', 'сумо становая'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 СТАНОВАЯ ТЯГА СУМО — ДЕТАЛЬНЫЙ РАЗБОР:

Кому подходит:
- Длинный торс, короткие руки — идеальные рычаги для сумо
- Хорошая подвижность тазобедренных суставов
- При проблемах с поясницей (меньше наклон корпуса)
- Пауэрлифтеры (разрешена на соревнованиях IPF/WRPF)

Техника:
1. Постановка ног: широко, носки 45-60° наружу
2. Хват: узкий, на ширине плеч или уже
3. Таз низко, грудь вверх, колени над стопами
4. Первая фаза: разведение коленей + разгибание ног
5. Вторая фаза: разгибание таза, локаут
6. Гриф движется максимально вертикально

Частые ошибки:
- Колени заваливаются внутрь → слабые приводящие
- Таз поднимается первым → слабые квадрицепсы
- Слишком широкая стойка → потеря силы срыва
- Округление верха спины → слабые ромбовидные

Подсобка для сумо:
- Приседания с паузой внизу
- Тяга сумо с дефицитом (срыв)
- Тяга с плинтов/блоков (локаут)
- Разведение ног в тренажёре (приводящие)
- Болгарские выпады (односторонняя сила)

Сумо vs Классика:
- Сумо: короче амплитуда, меньше нагрузка на поясницу, больше приводящие
- Классика: длиннее амплитуда, больше спина и бицепс бедра
- Обе стойки: одинаково эффективны для развития силы`;
}
export function getGoodMorningExercise(message: string): string {
  const keywords = ['гуд морнинг', 'good morning', 'наклоны со штангой', 'наклоны вперёд штанга', 'доброе утро упражнение'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌅 НАКЛОНЫ СО ШТАНГОЙ (GOOD MORNING) — ТЕХНИКА:

Целевые мышцы:
- Разгибатели позвоночника (основные)
- Бицепс бедра (синергист)
- Ягодичные (синергист)
- Кор (стабилизация)

Техника выполнения:
1. Штанга на трапециях (как при приседе)
2. Ноги на ширине плеч, колени слегка согнуты
3. Наклон вперёд от тазобедренных суставов
4. Спина НЕЙТРАЛЬНАЯ на протяжении всего движения
5. Наклон до параллели торса с полом (или до комфортного растяжения)
6. Возврат за счёт ягодиц и разгибателей спины

Вариации:
- Классические (стоя): основной вариант
- Сидя на скамье: изолирует разгибатели спины
- С согнутыми коленями: больше ягодиц
- С прямыми ногами: больше бицепса бедра
- С резиной: прогрессивная нагрузка

Зачем делать:
- Укрепление задней цепи для приседа и тяги
- Профилактика травм поясницы
- Развитие силы в наклоне (слабое звено у многих)
- Используется в Вестсайд Барбелл как основная подсобка

Безопасность:
- Начинайте с пустого грифа — освойте паттерн
- Никогда не округляйте поясницу
- Вес 30-50% от приседа максимум
- 3-4 × 8-12 повторений
- Противопоказан при грыжах и протрузиях поясничного отдела`;
}
export function getFacePullAdvanced(message: string): string {
  const keywords = ['фейс пулл', 'face pull', 'тяга к лицу', 'здоровье плеч', 'ротаторная манжета тяга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 ТЯГА К ЛИЦУ (FACE PULL) — ПРОДВИНУТЫЙ ГАЙД:

Почему это обязательное упражнение:
- Баланс передней и задней дельты (профилактика травм)
- Укрепление внешних ротаторов плеча
- Коррекция осанки (противодействие сутулости)
- Jeff Cavaliere: «Если бы я мог делать только одно упражнение — это face pull»

Техника:
1. Блок на уровне лица или чуть выше
2. Канат, хват сверху, ладони вниз
3. Тяга к вискам с разведением концов каната
4. В конечной точке: руки в позиции «сдаюсь» (наружная ротация)
5. Пауза 1-2 секунды, сжатие лопаток
6. Медленный возврат

Целевые мышцы:
- Задняя дельтовидная
- Подостная и малая круглая (внешние ротаторы)
- Средняя и нижняя трапеция
- Ромбовидные

Вариации:
- Стоя (классика): самый популярный вариант
- Сидя: исключает читинг
- С резиной: доступно дома, прогрессивная нагрузка
- Лёжа на наклонной скамье: гравитация усиливает нагрузку
- Одной рукой: коррекция асимметрии

Программирование:
- 3-4×15-20 повторений (лёгкий вес, идеальная техника)
- В каждой тренировке верха (разминка или финишер)
- Не гонитесь за весом — это коррекционное упражнение
- Минимум 100 повторений в неделю для здоровья плеч`;
}
export function getBoxSquatTechnique(message: string): string {
  const keywords = ['присед на ящик', 'бокс сквот', 'box squat', 'присед на тумбу', 'присед с паузой на ящик'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📦 ПРИСЕД НА ЯЩИК (BOX SQUAT) — ТЕХНИКА:

Зачем:
- Развитие взрывной силы из нижней точки (нет рефлекса растяжения)
- Контроль глубины приседа (консистентность)
- Обучение правильному паттерну приседа
- Снижение нагрузки на колени (больше таз назад)
- Метод Westside Barbell (Луи Симмонс)

Техника:
1. Ящик/тумба на высоте, дающей параллель или чуть ниже
2. Стойка шире обычной, носки наружу
3. Садимся НАЗАД (не вниз) — таз первым касается ящика
4. Полная посадка на ящик — расслабление сгибателей бедра
5. Пауза 1-2 секунды (ключевой момент!)
6. Взрывной подъём без раскачки вперёд
7. Колени не заваливаются внутрь

Ошибки:
- «Плюхание» на ящик (опасно для позвоночника)
- Раскачка вперёд для старта подъёма
- Слишком высокий ящик (полуприсед)
- Отсутствие паузы на ящике

Применение:
- Динамическое усилие: 50-60% × 2-3 повторения × 10-12 подходов (скорость!)
- Максимальное усилие: 90%+ × 1-3 повторения
- Обучение технике: лёгкий вес, фокус на паттерн

Прогрессия:
- Менять высоту ящика (ниже = сложнее)
- Добавлять цепи/резину (аккомодационное сопротивление)
- Варьировать ширину стойки`;
}
export function getLandminePress(message: string): string {
  const keywords = ['лэндмайн', 'landmine', 'жим грифа в угол', 'жим одной рукой гриф', 'лендмайн пресс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💣 ЛЭНДМАЙН ПРЕСС — ВАРИАЦИИ И ТЕХНИКА:

Что это: жим грифа, закреплённого одним концом в углу или в специальном креплении. Уникальная дуга движения.

Преимущества:
- Безопасен для плеч (нет чрезмерного отведения)
- Естественная дуга движения (не строго вертикальная)
- Развивает стабилизаторы и кор
- Работа одной рукой — коррекция асимметрии
- Функциональная сила для спорта и жизни

Жим стоя (одной рукой):
- Стоя лицом к грифу, одна рука держит конец грифа
- Жим вверх-вперёд по дуге
- Кор стабилизирует — не вращать корпус
- 3-4×8-12 каждой рукой

Жим стоя (двумя руками):
- Обе руки на конце грифа, сцепление пальцев
- Ноги в разножке (сплит-стойка)
- Акцент на верхнюю часть груди и передние дельты
- 3-4×10-15

Жим с колен:
- Убирает импульс ног — чистая работа верха
- Отличная активация кора
- Хорош для реабилитации плеча

Тяга лэндмайн (бонус):
- Тяга конца грифа одной рукой к поясу
- Отличная альтернатива тяге гантели в наклоне
- Меньше нагрузка на поясницу

Совет: если нет крепления — просто поставьте гриф в угол стен, обернув конец полотенцем.`;
}
export function getStepUpExercise(message: string): string {
  const keywords = ['степ ап', 'step up', 'зашагивания', 'зашагивание на платформу', 'подъём на тумбу'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ЗАШАГИВАНИЯ (STEP-UP) — ПОЛНЫЙ ГАЙД:

Преимущества:
- Одностороннее упражнение — исправляет дисбалансы
- Функциональное движение (лестницы, подъёмы)
- Безопасно для поясницы
- Развивает баланс и координацию
- Высокая активация ягодичных и квадрицепсов

Техника:
1. Высота тумбы: колено рабочей ноги на 90° или чуть выше
2. Вся стопа на платформе (не свешивается)
3. Подъём ЗА СЧЁТ рабочей ноги (не отталкиваться задней)
4. Полное разгибание наверху
5. Контролируемое опускание (та же нога)
6. Без раскачки и прыжков

Вариации:
- С гантелями: базовый вариант с отягощением
- Со штангой: больше нагрузка на кор
- Латеральные (боковые): приводящие + средняя ягодичная
- С выносом колена: баланс + сгибатели бедра
- Перекрёстные (crossover): функциональный паттерн

Ошибки:
- Отталкивание задней ногой (крадёт нагрузку)
- Слишком низкая платформа (квадрицепсы доминируют)
- Наклон корпуса вперёд
- Колено заваливается внутрь

Программирование:
- 3-4×8-12 каждой ногой
- Начинайте со слабой ноги
- Прогрессия: высота → вес → темп
- Отлично в суперсете с ягодичным мостиком`;
}
export function getSpotoPressTechnique(message: string): string {
  const keywords = ['споте пресс', 'spoto press', 'жим с паузой над грудью', 'споте жим', 'жим без касания'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ СПОТЕ ПРЕСС — ПРОДВИНУТАЯ ТЕХНИКА ЖИМА:

Что это: жим лёжа с паузой 2-3 см над грудью (не касаясь). Назван в честь пауэрлифтера Эрика Споте.

Зачем:
- Убирает рефлекс растяжения = чистая сила
- Развивает контроль в нижней точке жима
- Увеличивает время под нагрузкой
- Укрепляет стабилизаторы плечевого пояса
- Переносится на соревновательный жим (сила с паузой)

Техника:
1. Обычная установка жима лёжа (свод, лопатки, ноги)
2. Опускаем штангу контролируемо
3. Останавливаемся в 2-3 см от груди (НЕ касаясь)
4. Пауза 1-3 секунды (без расслабления!)
5. Мощный жим вверх
6. Повторить

Параметры:
- 3-5 подходов × 3-6 повторений
- Вес: 75-85% от обычного жима лёжа
- Пауза: 2-3 секунды (считать вслух)
- Использовать как основную вариацию жима 1 раз в 2-3 недели

Когда использовать:
- Слабая нижняя точка жима
- Подготовка к соревнованиям по жиму
- Развитие контроля и стабильности
- Вариация для преодоления плато в жиме`;
}
export function getPendlayRowTechnique(message: string): string {
  const keywords = ['пендли', 'pendlay row', 'тяга пендли', 'тяга с пола к поясу', 'взрывная тяга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ТЯГА ПЕНДЛИ (PENDLAY ROW) — ТЕХНИКА:

Отличие от обычной тяги в наклоне:
- Каждое повторение начинается С ПОЛА (полный сброс)
- Корпус параллелен полу (строго горизонтально)
- Взрывной концентрический подъём
- Развивает стартовую силу и мощность

Техника:
1. Штанга на полу, стойка как в становой
2. Хват чуть шире плеч, пронированный (сверху)
3. Спина горизонтально, жёсткий кор
4. Взрывная тяга к нижней части груди / верху живота
5. Контролируемое опускание на пол
6. Полная остановка (убить инерцию)
7. Следующее повторение

Целевые мышцы:
- Широчайшие (основные)
- Ромбовидные и средняя трапеция
- Задняя дельта
- Бицепс (синергист)
- Разгибатели спины (стабилизаторы)

Программирование:
- Сила: 5×5 (тяжёлый вес, взрывной подъём)
- Мощность: 6-8×3 (максимальная скорость)
- Гипертрофия: 3-4×6-8

Преимущества:
- Честные повторения (нет читинга с инерцией)
- Развивает взрывную силу для спорта
- Укрепляет позицию для становой тяги
- Нагрузка на кор и стабилизаторы`;
}
export function getZercherSquatAdvanced(message: string): string {
  const keywords = ['зерчер', 'zercher', 'присед зерчера', 'штанга на локтях', 'zercher squat'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦾 ПРИСЕД ЗЕРЧЕРА — ТЕХНИКА И ПРИМЕНЕНИЕ:

Что это: приседание со штангой в сгибах локтей. Названо в честь Эда Зерчера (1930-е годы).

Уникальные преимущества:
- Переднее положение нагрузки = максимальная работа кора
- Вертикальное положение торса (как фронтальный присед)
- Развивает силу подъёма тяжестей с пола (функциональный паттерн)
- Не требует стоек (можно поднять с пола через становую)
- Укрепляет верхнюю часть спины

Техника:
1. Штанга в сгибах локтей, прижата к корпусу
2. Руки сцеплены перед собой
3. Стойка на ширине плеч или чуть шире
4. Приседание с вертикальным торсом
5. Глубина — до параллели или ниже
6. Мощный подъём, кор напряжён

Защита рук:
- Полотенце или поролон на гриф (первое время)
- Со временем кожа адаптируется
- Длинные рукава на первых тренировках

Параметры:
- 3-4×6-10 повторений
- Вес: значительно меньше обычного приседа (50-60%)
- Отлично для GPP (общая физическая подготовка)
- Хорош как вариация в тренировке стронгмена

Кому подходит: стронгмены, единоборцы, для разнообразия программы.`;
}
export function getCloseGripBenchDetailed(message: string): string {
  const keywords = ['узкий хват жим', 'close grip bench', 'жим узким хватом', 'трицепс жим', 'клоуз грип'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ЖИМ ЛЁЖА УЗКИМ ХВАТОМ — ДЕТАЛЬНЫЙ ГАЙД:

Целевые мышцы:
- Трицепс (все три головки — основная нагрузка)
- Передняя дельта (синергист)
- Грудные (внутренняя часть, синергист)

Техника:
1. Хват: на ширине плеч или чуть уже (НЕ слишком узко!)
2. Локти прижаты к корпусу (45° или меньше)
3. Опускаем к нижней части груди / солнечному сплетению
4. Гриф касается ниже, чем при обычном жиме
5. Мощный жим вверх с акцентом на разгибание локтей
6. Лопатки сведены, свод сохраняется

Ошибки:
- Слишком узкий хват (запястья страдают, нет преимущества)
- Локти разъезжаются в стороны (нагрузка уходит с трицепса)
- Опускание к верхней части груди (перегрузка плеч)
- Отсутствие свода (теряется стабильность)

Программирование:
- Сила: 4-5×4-6 (80-85% от максимума узкого хвата)
- Гипертрофия: 3-4×8-12
- Как основное движение дня трицепса
- Или как вспомогательное после обычного жима

Для пауэрлифтеров:
- Развивает локаут в соревновательном жиме
- Укрепляет трицепс для финальной фазы жима
- Перенос на обычный жим: значительный`;
}
export function getReverseLungeDeepDive(message: string): string {
  const keywords = ['обратные выпады', 'reverse lunge', 'выпады назад детально', 'выпад назад техника'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦿 ОБРАТНЫЕ ВЫПАДЫ — УГЛУБЛЁННЫЙ ГАЙД:

Почему обратные лучше прямых:
- Меньше нагрузка на коленный сустав (вектор силы)
- Легче контролировать баланс
- Колено не выходит за носок
- Больше акцент на ягодицы и заднюю поверхность бедра
- Безопаснее для людей с проблемами коленей

Техника:
1. Шаг назад (не в сторону), длинный шаг
2. Заднее колено почти касается пола
3. Переднее колено над лодыжкой (не за носком)
4. Торс вертикальный, кор напряжён
5. Подъём за счёт передней ноги
6. Вернуть заднюю ногу в исходное

Вариации:
- С гантелями у бёдер: базовый вариант
- Со штангой на спине: больше осевая нагрузка
- С гантелями над головой: кор + стабильность
- В ходьбе: динамический вариант
- С дефицитом (с платформы): увеличенный ROM → больше ягодиц
- Перекрёстные (curtsy): средняя ягодичная + приводящие

Программирование:
- 3-4×10-12 каждой ногой
- Начинайте со слабой ноги
- Прогрессия: вес → дефицит → темп (паузы)
- Суперсет с ягодичным мостиком — отличная связка

Для разных целей:
- Гипертрофия ягодиц: длинный шаг + дефицит
- Квадрицепсы: короткий шаг
- Баланс: без отягощения, на нестабильной поверхности`;
}
export function getFloorPressTechnique(message: string): string {
  const keywords = ['жим с пола', 'floor press', 'флор пресс', 'жим лёжа на полу'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ЖИМ С ПОЛА (FLOOR PRESS) — ГАЙД:

Что это: жим лёжа на полу. Укороченная амплитуда — локти касаются пола.

Преимущества:
- Изолирует верхнюю часть жима (локаут)
- Убирает помощь ног (нет leg drive)
- Безопасен без страхующего
- Меньше нагрузка на плечевой сустав
- Не требует скамьи

Техника:
1. Лёжа на полу, ноги согнуты (стопы на полу) или вытянуты
2. Гриф на стойках или партнёр подаёт
3. Опускаем до касания трицепсом пола
4. Пауза 1-2 секунды (убивает инерцию)
5. Мощный жим вверх
6. НЕ отбивать локти от пола

Вариации:
- Со штангой: основной вариант
- С гантелями: больше ROM + стабилизаторы
- Узким хватом: акцент на трицепс
- С цепями/резиной: аккомодационное сопротивление
- Одной рукой (гантель): кор + антиротация

Когда использовать:
- Слабый локаут в жиме лёжа
- Реабилитация плеча (безопасная амплитуда)
- Нет скамьи (домашние тренировки)
- Вариация для преодоления плато

Параметры:
- 4-5×3-6 (сила, тяжёлый вес с паузой)
- 3-4×8-12 (гипертрофия)
- Вес обычно 85-95% от жима лёжа на скамье`;
}
export function getBulgarianSplitAdvGuide(message: string): string {
  const keywords = ['болгарские выпады продвинутый', 'bulgarian split squat', 'болгарский сплит', 'выпады с ногой на скамье'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🇧🇬 БОЛГАРСКИЕ ВЫПАДЫ — ПРОДВИНУТЫЙ ГАЙД:

Почему это король односторонних упражнений:
- Исследование (Speirs 2016): активация квадрицепсов сравнима с приседом
- Минимальная осевая нагрузка на позвоночник
- Корректирует мышечные дисбалансы между ногами
- Развивает баланс и проприоцепцию
- Растяжка сгибателей бедра задней ноги

Техника:
1. Задняя нога на скамье (подъём стопы или шнуровкой вниз)
2. Передняя нога — 60-90 см от скамьи
3. Колено передней ноги — над лодыжкой
4. Торс вертикальный или лёгкий наклон
5. Опускание до параллели бедра с полом
6. Мощный подъём через пятку

Настройка по целям:
- Больше квадрицепсов: ближе к скамье, вертикальный торс
- Больше ягодиц: дальше от скамьи, лёгкий наклон вперёд
- С дефицитом (стоя на блине): увеличенный ROM
- 1.5 повторения: вниз-полвверх-снова вниз-вверх = 1 rep

Прогрессии:
1. Без веса → с гантелями → со штангой → в жилете
2. Обычные → с паузой внизу → 1.5 rep → с дефицитом
3. Медленный эксцентрик (4-5 сек вниз) — разрушительно

Параметры: 3-4×8-12 каждой ногой. Начинайте всегда со слабой.`;
}
export function getHangCleanTechnique(message: string): string {
  const keywords = ['хэнг клин', 'hang clean', 'взятие с виса', 'взятие на грудь с виса', 'тяжёлая атлетика'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ВЗЯТИЕ НА ГРУДЬ С ВИСА (HANG CLEAN) — ТЕХНИКА:

Зачем: развитие взрывной силы, координации, атлетизма. Проще полного взятия с пола.

Фазы движения:
1. Исходная позиция: стоя, штанга в руках, хват на ширине плеч
2. Наклон: опускаем штангу до середины бедра (колени слегка согнуты)
3. Тройное разгибание: взрывное разгибание голеностопа, коленей, тазобедренных
4. Подрыв: плечи поднимаются, локти идут вверх
5. Подсед: быстро уходим под штангу, ловим на передние дельты
6. Стойка: встаём из подседа

Ключевые моменты:
- Штанга близко к телу на всём протяжении
- Взрыв начинается от бёдер (не от рук!)
- Локти быстро вперёд при ловле
- Ловля на «полку» из передних дельт

Ошибки:
- Тяга руками (должно быть разгибание ног/бёдер)
- Штанга далеко от тела (петля)
- Медленный подсед (должен быть молниеносным)
- Ловля на запястья (а не на дельты)

Программирование:
- 5×3 (развитие мощности — низкие повторения)
- Вес: 60-80% от максимума
- Отдых: 2-3 минуты между подходами
- В начале тренировки (свежая нервная система)

Прогрессия: hang clean с виса выше колена → с виса ниже колена → полное взятие с пола.`;
}
export function getTrapBarDeadliftGuide(message: string): string {
  const keywords = ['трэп бар', 'trap bar', 'гексагональный гриф', 'hex bar', 'тяга трэп'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⬡ ТЯГА С ТРЭП-БАРОМ (ГЕКСАГОНАЛЬНЫЙ ГРИФ) — ГАЙД:

Преимущества:
- Центр тяжести по бокам (не впереди) — безопаснее для поясницы
- Нейтральный хват — комфорт для запястий и бицепсов
- Проще освоить, чем классическую становую
- Больше квадрицепсов (биомеханика ближе к приседу)
- Исследования: генерирует больше силы и мощности

Для кого идеален:
- Новички (безопасное обучение тяге)
- Спортсмены (развитие взрывной силы)
- При проблемах с поясницей
- Люди с длинными руками/ногами (неудобная классика)

Техника:
1. Встать внутрь грифа, стопы на ширине бёдер
2. Присесть, взяться за рукоятки нейтральным хватом
3. Грудь вверх, спина нейтральная, кор напряжён
4. Подъём за счёт разгибания ног и бёдер
5. Полное разгибание наверху, плечи назад
6. Контролируемое опускание

Высокие vs низкие ручки:
- Высокие: короче амплитуда, больше вес, безопаснее
- Низкие: полная амплитуда, как обычная становая

Программирование:
- Сила: 5×5 или 3×3 (тяжёлый вес)
- Мощность: 5×3 (взрывной подъём, 60-70%)
- Гипертрофия: 3-4×8-12
- Может полностью заменить классическую становую`;
}
export function getDeclineBenchPressGuide(message: string): string {
  const keywords = ['жим на наклонной вниз', 'decline bench', 'жим головой вниз', 'нижняя грудь жим', 'деклайн бенч'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📐 ЖИМ ЛЁЖА ГОЛОВОЙ ВНИЗ (DECLINE) — ГАЙД:

Целевые мышцы:
- Нижняя часть грудных (стернальная порция) — основная
- Трицепс — синергист
- Передняя дельта — меньше, чем в горизонтальном

Преимущества:
- Меньшая нагрузка на плечевой сустав
- Укороченная амплитуда = можно жать больше
- Изоляция нижней части груди
- Некоторые исследования: активация груди выше, чем в горизонтальном

Техника:
1. Скамья наклон -15° до -30° (не круче!)
2. Ноги зафиксированы за валики
3. Лопатки сведены, свод сохраняется
4. Опускаем к нижней части груди
5. Жим вертикально вверх
6. Обязательно со страхующим!

Нужен ли деклайн жим?
- Нижняя грудь хорошо работает в отжиманиях на брусьях
- Горизонтальный жим тоже задействует нижнюю часть
- Деклайн — дополнение, не замена
- Бодибилдерам: для детализации нижней груди

Параметры:
- 3-4×8-12 повторений
- После горизонтального жима или брусьев
- Угол -15° — оптимальный (больше — кровь к голове)

Осторожно: повышенное давление в голове. Противопоказан при гипертонии, глаукоме.`;
}
export function getSafetySquatBarGuide(message: string): string {
  const keywords = ['safety squat bar', 'ssb', 'безопасный гриф', 'гриф с ручками', 'присед ssb'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦺 ПРИСЕД С SAFETY SQUAT BAR (SSB) — ГАЙД:

Что это: гриф с подушкой на шее и ручками спереди. Нагрузка смещена вперёд.

Преимущества:
- Не требует подвижности плеч (травмы, артрит)
- Вертикальный торс (как фронтальный присед)
- Больше нагрузки на верх спины и кор
- Безопасен при соскальзывании (ручки удерживают)
- Развивает слабые места обычного приседа

Биомеханика:
- Центр тяжести смещён вперёд → больше квадрицепсов
- Верх спины борется с наклоном вперёд → укрепляет разгибатели
- Ручки: можно давить вверх (легче) или вниз (сложнее)
- Перенос на обычный присед: значительный

Техника:
1. Гриф на трапециях, ручки перед собой
2. Стойка на ширине плеч
3. Сохраняйте вертикальный торс (гриф тянет вперёд!)
4. Глубина — до параллели или ниже
5. Не давите на ручки вперёд (помощь рукам — читинг)

Программирование:
- Как основное приседание: 4-5×5-8
- Как подсобка: 3-4×8-12
- В ротации с обычным приседом (чередование по неделям)
- Вес обычно 80-90% от обычного приседа

Кому: пауэрлифтерам (разнообразие), при проблемах с плечами, для укрепления верха спины.`;
}
export function getSingleArmDBPress(message: string): string {
  const keywords = ['жим одной рукой', 'single arm press', 'односторонний жим', 'жим гантели одной рукой'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ЖИМ ГАНТЕЛИ ОДНОЙ РУКОЙ — ТЕХНИКА:

Преимущества одностороннего жима:
- Исправление мышечных дисбалансов (слабая/сильная сторона)
- Мощная активация кора (антиротация)
- Лучшая связь мозг-мышца (фокус на одной стороне)
- Больший ROM по сравнению со штангой
- Функциональная сила (в жизни часто работаем одной рукой)

Вариации:
1. На горизонтальной скамье:
   - Лёжа, одна гантель, вторая рука стабилизирует
   - Кор борется с вращением — мощная работа косых

2. На наклонной скамье:
   - Акцент на верхнюю грудь + стабилизаторы

3. Стоя (жим стоя одной рукой):
   - Полная кинетическая цепь от стоп до кисти
   - Максимальная работа кора

4. В позиции полу-стоя на коленях:
   - Убирает импульс ног
   - Отличная стабилизация

Техника (лёжа):
- Одна гантель, свободная рука на животе или в сторону
- Не вращать корпус (главный принцип!)
- Полная амплитуда: глубокая растяжка → полное выпрямление
- Контролируемый негатив

Параметры:
- 3-4×8-12 каждой рукой
- Начинайте со слабой стороны
- Вес: ~85-90% от обычного жима гантели
- Отличная финишная работа после тяжёлых жимов`;
}
export function getSissySquatScience(message: string): string {
  const relevant = /сисси.?присед|sissy.?squat|присед.+на.+носк|квадрицепс.+изоляц|присед.+назад.+наклон/i.test(message);
  if (!relevant) return '';
  return `
🦵 СИССИ-ПРИСЕД — НАУКА И ТЕХНИКА:

Что это: приседание с наклоном корпуса назад и подъёмом на носки.
Название «sissy» — от Сизифа (греч. мифология), а не «женский».

Биомеханика:
- Колени выдвигаются ДАЛЕКО вперёд за носки (и это нормально для этого упражнения)
- Минимальное сгибание тазобедренного — почти вся нагрузка на квадрицепс
- ЭМГ-активация прямой мышцы бедра: ~90% от максимума
- Похоже на разгибание ног, но со свободным весом тела

Правильная техника:
1. Встать на носки, держаться за опору одной рукой
2. Медленно опускаться, отклоняя корпус назад
3. Колени идут вперёд, бёдра остаются на одной линии с корпусом
4. Опуститься до параллели бёдер с полом (или ниже)
5. Подняться, сохраняя наклон назад

Прогрессия:
- Уровень 1: с опорой за стойку, половина амплитуды
- Уровень 2: полная амплитуда с опорой
- Уровень 3: без опоры (требует баланса)
- Уровень 4: с блином на груди
- Уровень 5: в тренажёре для сисси-приседа

Кому подходит и кому нет:
✅ Бодибилдерам для изоляции квадрицепса
✅ Тем, у кого болит поясница при обычных приседах
✅ Как финишер после основных упражнений на ноги
❌ При проблемах с коленями (высокая нагрузка на связки)
❌ Новичкам без базы в обычных приседаниях

Программирование:
- 3×12-20 в конце тренировки ног
- Темп 3-1-2 (медленный эксцентрик)
- Суперсет с разгибанием ног = квадрицепсы горят`;
}
export function getLegPressComplete(message: string): string {
  const relevant = /жим.?ног.+полн|жим.?ног.+техник|leg.?press.+guide|постановк.+стоп.+жим|жим.+ног.+углы|жим.+платформ/i.test(message);
  if (!relevant) return '';
  return `
🦿 ЖИМ НОГАМИ — ПОЛНЫЙ ГАЙД ПО ТЕХНИКЕ:

Типы тренажёров:
- 45° жим ногами (самый распространённый): наклонная платформа
- Горизонтальный жим: сидя, платформа перед собой
- Вертикальный жим: лёжа, платформа над собой (редко)
- Пендулумный жим: маятниковый механизм, плавная кривая

Постановка стоп — карта мышечного акцента:
🔵 Высоко + широко: ягодицы + задняя поверхность бедра
🔴 Низко + узко: квадрицепс (особенно латеральная головка)
🟢 Средняя (ширина плеч): сбалансированная нагрузка
🟡 Одна нога: устранение дисбаланса, стабилизаторы

Техника безопасности — КРИТИЧНО:
1. Поясница ВСЕГДА прижата к спинке (никакого «подкручивания» таза)
2. Колени НЕ блокировать полностью в верхней точке
3. Колени идут по направлению носков (не «заваливаются» внутрь)
4. Глубина: до 90° в коленях (глубже — только если поясница не отрывается)
5. Дыхание: вдох на опускании, выдох на жиме

Частые ошибки:
- Слишком глубоко → поясница отрывается → грыжа межпозвоночного диска
- Полное разгибание коленей → травма коленного сустава
- Узкая постановка + тяжёлый вес → колени внутрь
- Отталкивание носками → перегрузка коленного сухожилия

Программирование:
- Гипертрофия: 3-4×10-15, 90 сек отдых
- Сила: 4×6-8, 2-3 мин отдых
- Дроп-сет: 4 сброса по 20% веса, по 10 повторений
- Суперсет: жим ногами + разгибания ног = взрыв квадрицепсов

Преимущества перед приседом:
- Нет осевой нагрузки на позвоночник
- Можно безопасно работать до отказа (страховочные стопоры)
- Легче изолировать конкретные мышцы через постановку стоп`;
}
export function getWalkingLungeTechnique(message: string): string {
  const relevant = /выпад.+ходьб|шагающ.+выпад|walking.?lunge|выпад.+вперёд.+техник|выпад.+шаг.+подробн/i.test(message);
  if (!relevant) return '';
  return `
🚶 ШАГАЮЩИЕ ВЫПАДЫ — ТЕХНИКА И ПРОГРАММИРОВАНИЕ:

Биомеханика:
- Одностороннее упражнение (каждая нога работает независимо)
- Нагрузка: квадрицепс + ягодицы + стабилизаторы
- Длинный шаг → больше ягодицы, короткий → больше квадрицепс
- Вертикальный торс → квадрицепс, наклон → ягодицы

Техника по шагам:
1. Штанга на трапециях / гантели в руках
2. Шаг вперёд — длина ~60-80 см (зависит от роста)
3. Опуститься: заднее колено почти касается пола
4. Переднее колено НЕ выходит далеко за носок
5. Оттолкнуться передней ногой, подтянуть заднюю → следующий шаг
6. Корпус вертикально, взгляд вперёд, кор напряжён

Вариации:
- С гантелями: проще для баланса, хват по бокам
- Со штангой: сложнее баланс, больше нагрузка на кор
- Обратные выпады: шаг НАЗАД — безопаснее для коленей
- Болгарские в ходьбе: задняя нога поднята — максимум ягодиц
- С поворотом корпуса: + косые мышцы пресса
- Дефицитные: передняя нога на возвышении (5-10 см) — больше растяжка

Частые ошибки:
1. Слишком узкий шаг (стопы на одной линии) → нет стабильности
2. Колено «заваливается» внутрь → слабость ягодичных
3. Наклон корпуса вперёд → перегрузка поясницы
4. Рывковые движения → потеря баланса

Программирование:
- Гипертрофия: 3×10-12 на каждую ногу, 60-90 сек отдых
- Выносливость: 3×15-20 на каждую ногу, 45 сек отдых
- Силовые: 4×6-8 на ногу, 2 мин отдых
- Как финишер: 2 прохода по 20 метров с лёгкими гантелями`;
}
export function getChestFlyScience(message: string): string {
  const relevant = /разводк.+наук|разведен.+гантел.+подробн|chest.?fly.+scien|разводк.+техник.+полн|пек.+дек.+наук/i.test(message);
  if (!relevant) return '';
  return `
🦋 РАЗВОДКИ — НАУКА ИЗОЛЯЦИИ ГРУДНЫХ:

ЭМГ-данные (исследования Contreras, 2010):
- Разводки с гантелями: 92% активации большой грудной
- Pec Dec (тренажёр бабочка): 98% (максимальная изоляция)
- Cable Fly: 95% (постоянное натяжение)
- Жим лёжа для сравнения: 100% но с участием трицепса и передних дельт

Почему разводки нужны:
- Горизонтальное приведение = основная функция грудных
- Жим = грудь + трицепс + передние дельты (не изолированно)
- Разводки — единственный способ нагрузить грудь без трицепса
- Полная растяжка грудных в нижней точке (важно для гипертрофии)

Техника разводок с гантелями:
1. Лёжа на скамье, гантели над грудью, лёгкий изгиб в локтях
2. Развести руки дугой до уровня плеч (чувствовать растяжку)
3. Свести руки обратно, сжимая грудные в верхней точке
4. Локти слегка согнуты и ЗАФИКСИРОВАНЫ (не менять угол!)
5. Движение — в плечевом суставе, а не в локтевом

Углы скамьи:
- Горизонтальная: средняя часть грудных
- Наклон 30°: верхняя часть (ключичная порция)
- Наклон 45°: ещё больше верха (но передние дельты подключаются)
- Отрицательный наклон: нижняя часть грудных

Cable Fly (разводки на блоке) — преимущества:
- Постоянное натяжение во всей амплитуде
- Нет мёртвой точки вверху (в отличие от гантелей)
- Можно менять угол: снизу вверх, сверху вниз, горизонтально
- Безопаснее для плечей при тяжёлых весах

Программирование:
- 3×12-15 после жимов (добивка)
- Темп 3-1-2 (медленный эксцентрик для растяжки)
- Вес: на 50-60% меньше чем в жиме (это изоляция!)
- Суперсет: жим + разводка = максимальная гипертрофия грудных`;
}
export function getPreacherCurlGuide(message: string): string {
  const relevant = /скамь.+скотт|preacher.?curl|сгибани.+пюпитр|скотт.+бицепс|бицепс.+скамья.+подробн/i.test(message);
  if (!relevant) return '';
  return `
💪 СГИБАНИЯ НА СКАМЬЕ СКОТТА (PREACHER CURL):

Почему это упражнение особенное:
- Упор рук исключает читинг и раскачку
- Максимальная изоляция бицепса
- ЭМГ-активация короткой головки: ~95% (vs 80% в стоячих)
- Растяжка бицепса в нижней точке — стимул для роста

Техника:
1. Сесть на скамью, подмышки упираются в верхний край
2. Руки полностью лежат на подушке, от плеча до локтя
3. Хват EZ-грифа на ширине плеч (снижает нагрузку на запястья)
4. Медленно опустить (3 сек) до почти полного разгибания
5. Поднять, сжимая бицепс, НЕ отрывая локти от подушки
6. НЕ разгибать полностью — оставить микро-изгиб (защита локтей)

Вариации:
- EZ-гриф: классика, комфортно для запястий
- Прямой гриф: больше супинация, сильнее короткая головка
- Гантели: каждая рука независимо, устранение дисбаланса
- Одной рукой с гантелью: максимальная концентрация
- На блоке: постоянное натяжение, нет мёртвой точки вверху

Частые ошибки:
❌ Отрыв локтей от подушки → теряется изоляция
❌ Полное разгибание с тяжёлым весом → травма сухожилия бицепса
❌ Рывок вверху → инерция вместо мышечной работы
❌ Слишком тяжёлый вес → качание всем телом

Программирование:
- Гипертрофия: 3×8-12, темп 3-1-2
- Пампинг: 2×15-20 с лёгким весом
- Суперсет: скотт + молотковые = бицепс + брахиалис
- Дроп-сет: 3 сброса, до отказа на каждом`;
}
export function getSumoSquatTechnique(message: string): string {
  const relevant = /сумо.+присед|sumo.?squat|присед.+плие|широк.+стойк.+присед.+техник|присед.+широко.+постав/i.test(message);
  if (!relevant) return '';
  return `
🦵 ПРИСЕД СУМО (ПЛИЕ) — ТЕХНИКА И БИОМЕХАНИКА:

Отличие от классического приседа:
- Стойка: 1.5-2 ширины плеч (vs ширина плеч)
- Носки развёрнуты на 45-60° наружу
- Акцент смещён на: приводящие мышцы + ягодичные
- Меньше нагрузка на поясницу (более вертикальный торс)

Мышечная активация (ЭМГ):
- Приводящие мышцы: +35-40% vs классический присед
- Ягодичные: +15-20% vs классический
- Квадрицепс: -10-15% vs классический
- Поясничные разгибатели: -20% нагрузки (безопаснее)

Техника по шагам:
1. Стопы шире плеч, носки развёрнуты наружу (45-60°)
2. Штанга на трапециях или гантель в руках между ног
3. Таз НАЗАД и ВНИЗ, колени идут по направлению носков
4. Корпус максимально вертикально
5. Опуститься до параллели бёдер (или ниже)
6. Встать, сжимая ягодицы и толкая колени наружу

Вариации:
- С гантелью/гирей: держать двумя руками между ног
- Со штангой на спине: как классический, но шире стойка
- Приседания Джефферсона (Jefferson): штанга между ног, разнохват
- Плие на носках: + нагрузка на икроножные
- На возвышениях (deficit): стоя на степах, гантель глубже

Кому особенно полезно:
✅ Длинные бёдра / короткий торс (анатомически удобнее)
✅ Девушки, желающие акцент на ягодицы и внутреннюю часть бедра
✅ Проблемы с поясницей (меньше наклон)
✅ Для разнообразия после классического приседа

Программирование:
- Гипертрофия: 3-4×10-15
- Сила: 4×6-8 (тяжёлый вариант со штангой)
- Финишер: 2×20 с лёгкой гирей, темп 3-1-1`;
}
export function getPendulumSquatGuide(message: string): string {
  const relevant = /пендулум.?присед.+техник|pendulum.?squat.+guide|маятников.+присед.+подробн|пендулум.+квадрицепс|пендулум.+тренажёр.+гайд/i.test(message);
  if (!relevant) return '';
  return `
🔄 ПЕНДУЛУМ-ПРИСЕД — ПОЛНЫЙ ГАЙД:

Что это:
- Тренажёр с маятниковым механизмом
- Платформа для ног двигается по дуге (не прямой линии)
- Создаёт уникальную кривую нагрузки: максимум внизу
- «Гибрид» между приседом и жимом ногами

Преимущества:
- Глубокая амплитуда безопасно (фиксированная траектория)
- Нулевая осевая нагрузка на позвоночник
- Максимальная нагрузка в растянутой позиции (key для гипертрофии)
- Безопасная работа до отказа (стопоры)
- Вертикальный торс = комфорт для поясницы

Биомеханика:
- Вектор силы по дуге → больше нагрузки в нижней точке
- В верхней точке нагрузка снижается (нет локаута)
- Это идеально для квадрицепса (макс. стресс в растяжке)
- ЭМГ-активация квадрицепса: сравнима с гакк-приседом

Техника:
1. Встать на платформу, плечи под подушками
2. Стопы на ширине плеч, немного ниже центра платформы
3. Медленно опуститься (3-4 сек), контролируя движение
4. Глубина: максимальная, при которой поясница не округляется
5. Мощно подняться, НЕ блокируя колени вверху
6. Постоянное напряжение — не «отдыхать» вверху

Постановка стоп:
- Низко: акцент квадрицепс (больше сгибание колена)
- Высоко: ягодицы + задняя поверхность
- Узко: латеральная головка квадрицепса
- Широко: приводящие + медиальная головка

Программирование:
- Основное: 3-4×8-12, 90 сек отдых
- Тяжёлые: 4×6-8, 2-3 мин отдых
- Метаболические: 2×20-25, 60 сек отдых
- Дроп-сеты: 3 сброса по 20%, до отказа`;
}
export function getInclineBenchSciGuide(message: string): string {
  const relevant = /наклон.+жим.+наук|жим.+наклон.+скамь.+подробн|incline.?bench.+science|верхн.+груд.+жим.+полн|жим.+30.+45.+градус/i.test(message);
  if (!relevant) return '';
  return `
📐 ЖИМ НА НАКЛОННОЙ СКАМЬЕ — НАУКА:

ЭМГ-данные по углам (исследования Trebs, Lauver):
- 0° (горизонтальный): 100% средняя грудь, минимум передних дельт
- 15°: 95% средняя + 15% верхняя грудь (почти как горизонтальный)
- 30°: 85% средняя + 50% верхняя (ОПТИМАЛЬНЫЙ угол для верха груди)
- 45°: 70% средняя + 65% верхняя + 40% передние дельты
- 60°+: дельты доминируют, грудь теряет нагрузку

Научный вердикт: 30° — ЛУЧШИЙ угол для верхней части грудных.
45° допустим, но уже значительно подключаются дельты.

Техника на наклонной:
1. Скамья 30° (или 30-45° — экспериментируйте)
2. Лопатки сведены и ОПУЩЕНЫ (создать «полку»)
3. Лёгкий прогиб в пояснице (не чрезмерный)
4. Гриф опускается на верхнюю часть груди (ниже ключиц)
5. Локти под 45-75° к корпусу (не 90° — стресс для плечей)
6. Жать вверх и слегка к лицу (естественная траектория)

Штанга vs Гантели на наклонной:
- Штанга: больший вес, проще прогрессия
- Гантели: больше амплитуда (ниже в нижней точке, сведение вверху)
- Гантели: меньше стресс для плечей (свобода вращения)
- ЭМГ верхней груди: гантели ~5-8% выше (исследование Saeterbakken)

Программирование:
- Как основное: 4×6-8 (сила) или 3-4×8-12 (гипертрофия)
- После горизонтального жима: 3×10-12 (дополнительный объём)
- Суперсет: жим наклонный + разводки наклонные = максимум верха груди
- Чередовать углы: неделя 1 — 30°, неделя 2 — 45°`;
}
export function getNordicHamstringCurl(message: string): string {
  const relevant = /нордик.+curl|скандинавск.+сгибан|nordic.+hamstring|сгибани.+бёдер.+стоя.+на.+колен|профилактик.+разрыв.+задн/i.test(message);
  if (!relevant) return '';
  return `
🦵 НОРДИК ХАМСТРИНГ КЁРЛ — ЛУЧШЕЕ ДЛЯ ЗАДНЕЙ ПОВЕРХНОСТИ:

Почему это упражнение особенное:
- Снижает риск травм задней поверхности бедра на 51% (мета-анализ 2015)
- Максимальная ЭМГ-активация бицепса бедра: 100%+ (супрамаксимальная в эксцентрике)
- Тренирует эксцентрическую силу (основная причина травм)
- Используется в FIFA 11+ (профилактическая программа FIFA)

Техника:
1. Встать на колени, партнёр держит лодыжки (или закрепить ступни)
2. Корпус вертикально, руки на груди или перед собой
3. МЕДЛЕННО наклоняться вперёд, контролируя движение бицепсом бедра
4. Максимально долго сопротивляться падению (это и есть тренировка!)
5. Когда не можете удержаться — мягко упасть на руки
6. Оттолкнуться руками и вернуться вверх (помощь руками — нормально)

Прогрессия (от лёгкого к сложному):
- Уровень 1: только негатив (эксцентрик), падение на руки
- Уровень 2: негатив с замедлением (5-8 сек опускание)
- Уровень 3: полная амплитуда с помощью рук на подъёме
- Уровень 4: полная амплитуда без рук
- Уровень 5: с отягощением (блин на груди)

Частые ошибки:
❌ Сгибание в тазобедренном суставе (сохранять прямую линию корпус-бёдра!)
❌ Слишком быстрое падение (цель — максимально замедлить)
❌ Слишком много объёма на первой неделе (DOMS будет жёстким!)
❌ Игнорирование боли в коленях (подкладывать подушку)

Программирование:
- Начинающие: 2×3-5 повторений (только негативы), 2 раза в неделю
- Средний уровень: 3×5-8, 2 раза в неделю
- Продвинутые: 3-4×8-12, 2-3 раза в неделю
- ВАЖНО: начинать с малого объёма — крепатура может быть экстремальной`;
}
export function getGHDExerciseGuide(message: string): string {
  const relevant = /GHD|глют.?хам|glute.?ham.?dev|обратная.+гиперэкстензия.+GHD|GHR.+техник|задняя.+цепь.+тренажёр/i.test(message);
  if (!relevant) return '';
  return `
🏋️ GHD (GLUTE HAM DEVELOPER) — ПОЛНЫЙ ГАЙД:

Что такое GHD:
- Тренажёр для задней кинетической цепи
- Упор для стоп + подушка для бёдер
- Позволяет выполнять множество упражнений

Основные упражнения на GHD:

1. GHD Raise (Glute-Ham Raise):
   Техника: колени на подушке, стопы в упорах
   - Опуститься лицом вниз (контролируемо!)
   - Подняться силой задней поверхности + ягодиц
   - Самое сложное: переход из горизонтали в вертикаль
   Мышцы: задняя поверхность бедра (100% ЭМГ), ягодичные, икры
   Прогрессия: помощь рук → без рук → с блином

2. GHD Back Extension:
   Техника: бёдра на подушке, стопы в упорах
   - Наклон вниз → подъём до горизонтали
   - НЕ переразгибаться (до нейтрали позвоночника)
   Мышцы: разгибатели спины, ягодичные
   3×12-15

3. GHD Sit-Up:
   Техника: сидя, стопы в упорах
   - Откинуться назад (полная амплитуда!)
   - Подняться силой пресса + сгибателей бедра
   ⚠️ Осторожно: высокая нагрузка на сгибатели бедра
   Мышцы: прямая мышца живота, сгибатели бедра

4. GHD Hip Extension:
   Техника: лицом вниз, бёдра на подушке
   - Опустить верхнюю часть тела → поднять до горизонтали
   - Фокус на ягодичные (сжать вверху)
   Мышцы: ягодичные (акцент), разгибатели спины

Почему GHD лучше обычной гиперэкстензии:
- Больше амплитуда движения
- Задняя поверхность бедра работает значительно больше
- Эксцентрическая нагрузка на бицепс бедра (профилактика травм)
- Можно выполнять разные упражнения на одном тренажёре

Программирование:
- GHD Raise: 3×6-10 (начинайте с 3×3-5 — это ОЧЕНЬ сложно)
- Back Extension: 3×12-15 (разминка или финишер)
- Sit-Up: 3×10-15 (осторожно с объёмом)`;
}
export function getReverseGripBenchDetailed(message: string): string {
  const relevant = /обратн.+хват.+жим.+подробн|reverse.?grip.+bench.+detail|жим.+супинац.+техник|обратн.+хват.+груд.+полн/i.test(message);
  if (!relevant) return '';
  return `
🔄 ЖИМ ОБРАТНЫМ ХВАТОМ — ПОДРОБНЫЙ РАЗБОР:

Зачем жать обратным хватом:
- ЭМГ-активация верхней части грудных на 30% БОЛЬШЕ чем прямой хват
- Альтернатива жиму на наклонной для тех, у кого болят плечи
- Меньше стресс на переднюю дельту и ротаторную манжету
- Исследование Barnett (1995): обратный хват — лучший для ключичной порции

Техника:
1. Лёжа на горизонтальной скамье, снять штангу обычным хватом
2. Перехватить на супинированный (ладони к лицу), ширина чуть шире плеч
3. Большие пальцы ОБЯЗАТЕЛЬНО обхватывают гриф (без «открытого» хвата!)
4. Опустить на нижнюю часть груди (ниже сосков)
5. Жать вверх и чуть к голове
6. Локти ближе к корпусу (~30° от туловища)

Безопасность — КРИТИЧНО:
⚠️ Никогда не используйте открытый хват (гриф может выскользнуть!)
⚠️ Обязательно страхующий или стойки со стопорами
⚠️ Начинайте с лёгкого веса — хват непривычный
⚠️ В Смите безопаснее на первых порах

Преимущества:
- Верхняя часть груди БЕЗ наклонной скамьи
- Трицепс работает меньше → больше изоляции грудных
- Легче на плечи (меньше отведение)
- Разнообразие для преодоления плато

Программирование:
- 3×8-12 как дополнение к обычному жиму
- Или как основное упражнение: 4×6-10
- Суперсет: обратный хват + разводки = максимум верха груди`;
}
export function getTBarRowComplete(message: string): string {
  const relevant = /Т.?тяг.+полн|t.?bar.?row.+complete|тяга.+Т.?грифа.+подробн|тяга.+штанги.+в.+углу.+полн|тяга.+одним.+концом/i.test(message);
  if (!relevant) return '';
  return `
🏋️ Т-ТЯГА — ПОЛНЫЙ ГАЙД:

Варианты выполнения:
1. Классическая Т-тяга (конец штанги в углу):
   - Штанга одним концом упирается в угол
   - V-рукоять под грифом, тянуть к груди
   - Самый «сырой» и эффективный вариант

2. Т-тяга в тренажёре с упором для груди:
   - Грудь на подушке, изоляция спины
   - Нет нагрузки на поясницу
   - Чистая работа широчайших

3. Landmine Row (тяга лэндмайн):
   - Одной рукой, стоя сбоку от грифа
   - Большая амплитуда + ротация корпуса

Техника классической Т-тяги:
1. Стоя над штангой, стопы шире плеч
2. Наклон ~45°, спина прямая, колени слегка согнуты
3. V-рукоять под грифом (ближе к блинам)
4. Тянуть к нижней части груди / верхней части живота
5. Лопатки: сведение в верхней точке (задержка 1 сек)
6. Контролируемое опускание (не «бросать»)

Мышечная активация:
- Широчайшие: основная мышца (толщина спины)
- Ромбовидные + трапеция: стабилизация лопаток
- Задние дельты: при разведении локтей
- Бицепс: вспомогательная роль
- Разгибатели спины: изометрическая стабилизация

Хват и акценты:
- V-рукоять (нейтральный): сбалансированная нагрузка
- Широкий (за блины): больше верхняя спина
- Обратный: больше нижние широчайшие + бицепс

Программирование:
- Масса спины: 4×8-12, 90 сек отдых
- Сила: 4×5-8, 2-3 мин отдых
- Суперсет: Т-тяга + тяга верхнего блока = толщина + ширина`;
}
export function getBulgarianSplitProgramming(message: string): string {
  const relevant = /болгарск.+сплит.+программ|болгарск.+присед.+продвинут|bulgarian.+split.+program|болгарск.+выпад.+прогресс|сплит.+присед.+схем/i.test(message);
  if (!relevant) return '';
  return `
🇧🇬 БОЛГАРСКИЙ СПЛИТ-ПРИСЕД — ПРОДВИНУТОЕ ПРОГРАММИРОВАНИЕ:

Почему это одно из лучших упражнений для ног:
- Исследование Speirs (2016): равная гипертрофия с приседом со штангой
- На 50% меньше осевая нагрузка на позвоночник
- Устранение мышечного дисбаланса между ногами
- Развитие баланса и стабильности

Прогрессия нагрузки:
Уровень 1 (новичок): собственный вес, 3×10-12/ногу
Уровень 2: гантели по 10-15 кг, 3×10-12
Уровень 3: гантели по 20-30 кг, 3×8-10
Уровень 4: штанга на спине, 4×6-8
Уровень 5: штанга фронтально, 4×6-8 (самое сложное)

Высота задней ноги:
- Скамья (~40 см): стандарт
- Низкая опора (~20 см): легче баланс, больше вес
- Кольца/TRX: нестабильность → больше стабилизаторов

Расстояние до скамьи:
- Короткое: больше квадрицепс (колено далеко за носок)
- Длинное: больше ягодицы (больше наклон корпуса)
- Тест: в нижней точке голень вертикальна = оптимально

Продвинутые протоколы:
📅 Волновая периодизация (4 недели):
- Неделя 1: 3×12, RPE 7 (лёгкая)
- Неделя 2: 4×8, RPE 8 (средняя)
- Неделя 3: 4×6, RPE 9 (тяжёлая)
- Неделя 4: 2×15, RPE 6 (разгрузка)

📅 Ежедневная болгарка (Ben Patrick «Knees Over Toes»):
- Каждый день по 1-2 подхода с лёгким весом
- Прогрессивное увеличение амплитуды
- Для здоровья коленей и мобильности

Суперсеты:
- Болгарский + выпрыгивания = сила + мощность
- Болгарский + сисси-присед = полный квадрицепс
- Болгарский + ягодичный мост = максимум ягодиц`;
}
export function getDeclinePressComplete(message: string): string {
  const relevant = /жим.+наклон.+вниз.+полн|жим.+отрицательн.+наклон.+подробн|decline.?press.+complete|нижн.+груд.+жим.+техник|жим.+головой.+вниз/i.test(message);
  if (!relevant) return '';
  return `
⬇️ ЖИМ НА СКАМЬЕ С ОТРИЦАТЕЛЬНЫМ НАКЛОНОМ:

Биомеханика:
- Угол: -15° до -30° (головой ниже ног)
- Акцент: нижняя (абдоминальная) порция большой грудной
- ЭМГ нижней груди: +25-30% vs горизонтальный жим
- Меньше нагрузка на передние дельты (больше изоляции грудных)

Преимущества:
- Сильнее нижняя часть груди → «подрез» грудных мышц
- Можно жать БОЛЬШИЙ вес (укороченная амплитуда)
- Меньше стресс для плечевого сустава
- Арнольд Шварценеггер считал его основным жимом для груди

Техника:
1. Лечь на скамью, ноги зафиксированы валиками
2. Хват чуть шире плеч
3. Гриф опускается на нижнюю часть груди (под сосками)
4. Жать вверх и чуть к голове
5. Полное разгибание в верхней точке
6. Лопатки сведены и прижаты к скамье

Вариации:
- Со штангой: максимальный вес
- С гантелями: больше амплитуда + сведение вверху
- В Смите: безопасность без страхующего
- На блоке (cable decline): постоянное натяжение

Предостережения:
⚠️ Кровь приливает к голове — не задерживаться долго
⚠️ Повышенное внутричерепное давление — осторожно при гипертонии
⚠️ Не использовать при глаукоме или проблемах с сосудами головы
⚠️ Обязательно фиксация ног (чтобы не соскользнуть)

Программирование:
- Основное: 4×6-8 (заменить горизонтальный жим)
- Дополнительное: 3×10-12 после горизонтального
- Суперсет: decline жим + decline разводки = нижняя грудь`;
}
export function getCalfRaiseScience(message: string): string {
  const relevant = /подъём.+на.+носки.+наук|икр.+тренировк.+наук|calf.?raise.+scien|икроножн.+полн.+гайд|камбаловидн.+тренировк/i.test(message);
  if (!relevant) return '';
  return `
🦶 ПОДЪЁМЫ НА НОСКИ — НАУКА ТРЕНИРОВКИ ИКР:

Анатомия:
- Икроножная (gastrocnemius): 2 головки, видимая часть, ~60% объёма
  - Работает при ПРЯМЫХ коленях
  - Быстрые мышечные волокна (отзывчива на тяжёлые веса)

- Камбаловидная (soleus): глубокая, ~40% объёма
  - Работает при СОГНУТЫХ коленях
  - Медленные волокна (отзывчива на высокие повторения)

Правило: для полного развития — тренировать ОБЕ (стоя + сидя)

Упражнения:
1. Подъём на носки стоя (икроножная):
   - В тренажёре, в Смите, с гантелями
   - 3-4×8-12, тяжёлый вес
   - Полная амплитуда: растяжка внизу + пиковое сокращение вверху

2. Подъём на носки сидя (камбаловидная):
   - Колени согнуты ~90° — икроножная выключена
   - 3-4×15-20, средний вес, медленный темп
   - Пауза вверху 2-3 сек

3. Подъём на одной ноге (устранение дисбаланса):
   - С гантелью, стоя на ступеньке
   - 3×12-15 на каждую ногу

Техника (частые ошибки):
❌ «Прыгание» вверх-вниз (нет контроля, нет нагрузки)
❌ Неполная амплитуда (верхняя треть)
❌ Только стоя (камбаловидная не растёт)
❌ Тренировка 1 раз в неделю (нужно 2-3)

Оптимальный протокол:
- Стоя: 4×8-12, темп 2-1-3 (3 сек растяжка внизу!)
- Сидя: 3×15-20, темп 2-2-2 (пауза вверху)
- Частота: 3-4 раза в неделю (икры быстро восстанавливаются)
- «Правило 3 секунд»: 3 сек растяжка внизу = ключ к росту

Прогрессия:
- Увеличивать вес на 2.5-5 кг каждые 2 недели
- Или увеличивать паузу внизу (до 5 сек)
- Дроп-сеты: 3 сброса, последний — до полного отказа`;
}
export function getDBLateralRaiseScience(message: string): string {
  const relevant = /подъём.+гантел.+в.+сторон.+наук|латеральн.+подъём.+наук|lateral.?raise.+science|махи.+гантел.+в.+сторон.+подробн|средн.+дельт.+науч/i.test(message);
  if (!relevant) return '';
  return `
📐 ЛАТЕРАЛЬНЫЕ ПОДЪЁМЫ — НАУКА СРЕДНЕЙ ДЕЛЬТЫ:

ЭМГ-данные (Sweeney, 2014):
- Латеральные подъёмы стоя: 100% средней дельты (эталон)
- На блоке (одна рука): 95% + постоянное натяжение
- Наклонные (лёжа на боку на скамье): 115% (максимальная растяжка!)
- Жим над головой: 70% средней дельты (не изолирует)

Оптимальная техника (по науке):
1. Гантели перед бёдрами (не по бокам — так путь длиннее)
2. Лёгкий наклон корпуса вперёд (10-15°) — снимает импинджмент
3. Поднять руки до уровня плеч (не выше!)
4. Мизинец чуть выше большого пальца («выливание воды из стакана»)
5. Пауза вверху 1 сек
6. Медленное опускание (3 сек) — не бросать!
7. Локти слегка согнуты и ЗАФИКСИРОВАНЫ

Распространённые ошибки (ЭМГ-подтверждённые):
❌ Подъём выше плеч → трапеция доминирует, импинджмент
❌ Полностью прямые руки → стресс для локтей
❌ Рывок вверх → инерция вместо мышечной работы
❌ Слишком тяжёлые гантели → читинг корпусом
❌ «Пожимание» плечами вверх → трапеция забирает нагрузку

Продвинутые вариации:
- На блоке (одной рукой): постоянное натяжение, разные углы
- Лёжа на боку на наклонной скамье: максимальная растяжка внизу
- С паузой 3 сек вверху: максимальная активация
- Partial reps (верхняя половина): после отказа в полной амплитуде
- Дроп-сет × 3: идеально для средней дельты

Программирование:
- Гипертрофия: 4×12-15, лёгкий вес, идеальная техника
- Интенсивность: 3×10-12 + дроп-сет на последнем
- Частота: 2-3 раза в неделю (дельты быстро восстанавливаются)
- Суперсет: латеральные + face pull = средние + задние дельты`;
}
export function getChestSupportedRowScience(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['тяга с упором', 'тяга лёжа', 'chest supported', 'тяга на скамье', 'тяга с опорой на грудь', 'seal row', 'тяга горизонтальная'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🏋️ ТЯГА С УПОРОМ В ГРУДЬ — ПОЛНАЯ НАУКА:

═══ БИОМЕХАНИЧЕСКОЕ ПРЕИМУЩЕСТВО ═══
• Полная изоляция широчайших — спина НЕ участвует как стабилизатор
• Нет компрессии позвоночника (в отличие от тяги в наклоне)
• Минимальная нагрузка на поясницу — идеально при грыжах/протрузиях
• Нет инерции — каждое повторение чистое, без читинга

═══ ВАРИАНТЫ ВЫПОЛНЕНИЯ ═══
• Тяга гантелей лёжа на наклонной скамье (30-45°):
  - Классика: нейтральный хват, локти вдоль тела → нижний пучок широчайших
  - Широкий хват, локти в стороны → средняя/верхняя часть спины
• Тяга штанги лёжа (seal row):
  - Скамья на подставках, штанга под ней
  - Максимальная амплитуда, без инерции
  - EMG: +18% активация ромбовидных vs обычная тяга в наклоне
• Тяга в тренажёре с упором:
  - Hammer Strength, plate-loaded
  - Каждая рука независимо → коррекция дисбалансов

═══ ТЕХНИКА И ОШИБКИ ═══
• Грудь плотно прижата к скамье на протяжении ВСЕГО движения
• Лопатки: сведение в верхней точке на 1-2 сек → усиление сокращения
• Не поднимать грудь от скамьи — теряется смысл упражнения
• Темп: 2-1-3-0 (подъём-пауза-опускание-без паузы внизу)
• Полная растяжка внизу — руки полностью выпрямлены

═══ ПРОГРАММИРОВАНИЕ ═══
• Для гипертрофии: 3-4 × 10-12 повторений, 60-90 сек отдыха
• Для силы спины: 4-5 × 6-8, тяжёлые гантели/штанга
• Как добивка: 2-3 × 15-20, лёгкий вес, акцент на сокращение
• Прогрессия: +2.5 кг каждые 2 недели при выполнении всех подходов
• Место в программе: после тяжёлых тяг (становая, тяга в наклоне)

═══ КОМУ ОСОБЕННО ПОЛЕЗНО ═══
• Спортсмены с проблемами поясницы — безопасная альтернатива тяге в наклоне
• При дисбалансе лево/право — гантели, каждая рука отдельно
• Для улучшения mind-muscle connection со спиной
• Бодибилдеры — изоляция без утомления разгибателей спины
`;
}
export function getLegExtensionScience(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['разгибание ног', 'leg extension наука', 'разгибание ног в тренажёре наука', 'квадрицепс изоляция', 'разгибание ног безопасность'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🦵 РАЗГИБАНИЕ НОГ — НАУКА И ПРАКТИКА:

═══ БИОМЕХАНИКА ═══
• Единственное упражнение — полная изоляция квадрицепса
• Открытая кинетическая цепь: стопа не зафиксирована
• Максимальный крутящий момент на колено в нижней точке
• Прямая мышца бедра (rectus femoris) — максимально активна
• Vastus medialis (внутренняя головка) — активнее в верхних 30°

═══ МИФЫ О БЕЗОПАСНОСТИ ═══
Миф: «Разгибания ног разрушают колени»
Реальность:
• При правильной технике — безопасно для здоровых суставов
• Исследования: НЕ увеличивает риск травмы ПКС у здоровых
• Используется в реабилитации после операций на колене!
• Проблема — чрезмерный вес + резкие движения

═══ ПРАВИЛЬНАЯ ТЕХНИКА ═══
• Настройка тренажёра: ось вращения = ось колена
• Валик: чуть выше голеностопа (не на стопе!)
• Спинка: плотно прижата, таз не отрывается
• Движение: плавное, 2 сек вверх — 1 сек пауза — 3 сек вниз
• В верхней точке: полное разгибание, пиковое сокращение 1-2 сек

═══ ПРОДВИНУТЫЕ ТЕХНИКИ ═══
• Разгибание с паузой: 3 сек в верхней точке → +20% метаболический стресс
• 1.5 повторения: полное разгибание → полусгиб → снова полное → вниз
• Дроп-сеты: 3 сброса веса → полный отказ квадрицепсов
• Разворот стоп внутрь: акцент на vastus lateralis
• Разворот стоп наружу: акцент на vastus medialis
• Одной ногой: коррекция дисбалансов

═══ ПРОГРАММИРОВАНИЕ ═══
• Как добивка: 3 × 12-20 после приседаний/жима ногами
• Преутомление: 2 × 15-20 перед приседаниями (продвинутый метод)
• Отдельное упражнение: 4 × 10-15 с контролем темпа
• НЕ использовать как единственное упражнение на квадрицепс
• Частота: 2 раза в неделю максимум
`;
}
export function getPendlayRowProgramming(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['тяга пендли программа', 'pendlay row program', 'тяга пендли план', 'тяга пендли прогрессия', 'тяга пендли для силы'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🏋️ ТЯГА ПЕНДЛИ — ПРОГРАММИРОВАНИЕ И ПРОГРЕССИЯ:

═══ ПРОГРАММА ДЛЯ НОВИЧКОВ (0-1 год) ═══
Неделя 1-4: Освоение техники
• 3 × 8 @ 50-60% от целевого рабочего веса
• Фокус: полный сброс на пол, взрывной подъём, чистая техника
• Прогрессия: +2.5 кг/неделю при чистом выполнении

Неделя 5-12: Набор объёма
• 4 × 6-8 @ 65-75%
• Каждую 4ю неделю: deload 3 × 8 @ 60%
• Прогрессия: +2.5 кг каждые 2 недели

═══ ПРОГРАММА ДЛЯ ПРОДВИНУТЫХ (1-3 года) ═══
Силовой блок (4 недели):
• Неделя 1: 5 × 5 @ 75%
• Неделя 2: 5 × 4 @ 80%
• Неделя 3: 5 × 3 @ 85%
• Неделя 4: 3 × 3 @ 70% (deload)

Гипертрофийный блок (4 недели):
• 4 × 8-10 с контролем эксцентрики (3 сек опускание)
• Прогрессия через объём, потом через вес

═══ ИНТЕГРАЦИЯ В СПЛИТ ═══
• Push-Pull-Legs: день тяг, первое упражнение
• Upper-Lower: день верха, после подтягиваний или перед ними
• Fullbody: основное тяговое движение дня
• Как подсобка к становой: 3 × 5 после становой

═══ ЦЕЛЕВЫЕ СТАНДАРТЫ (относительно массы тела) ═══
• Новичок: 0.6-0.8 × масса тела
• Средний: 0.8-1.0 × масса тела
• Продвинутый: 1.0-1.3 × масса тела
• Элита: 1.3-1.5+ × масса тела

═══ ТИПИЧНЫЕ ОШИБКИ ПРОГРАММИРОВАНИЯ ═══
❌ Слишком частое использование (>2 раз/неделю) — утомление поясницы
❌ Объединение с тяжёлой становой в один день без учёта объёма
❌ Прогрессия только в весе, забывая о качестве повторений
❌ Отсутствие deload → стагнация через 6-8 недель
`;
}
export function getInclineDBCurlScience(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['сгибание на наклонной наука', 'incline curl science', 'наклонные сгибания наука', 'бицепс на наклонной скамье', 'длинная головка бицепса'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
💪 СГИБАНИЯ НА НАКЛОННОЙ — НАУКА МАКСИМАЛЬНОЙ РАСТЯЖКИ:

═══ ПОЧЕМУ ЭТО ОСОБЕННОЕ УПРАЖНЕНИЕ ═══
• Единственное упражнение с максимальной растяжкой бицепса
• Плечо заведено назад → длинная головка полностью растянута
• Принцип: мышца сильнее в растянутой позиции = больше стимул
• EMG: длинная головка бицепса +15-20% vs стоячие сгибания

═══ ОПТИМАЛЬНЫЙ УГОЛ СКАМЬИ ═══
• 30° наклон: МАКСИМАЛЬНАЯ растяжка, но сложнее стабилизация
• 45° наклон: оптимальный баланс растяжки и контроля (рекомендация)
• 60° наклон: меньше растяжки, больше похоже на обычные сгибания
• Исследование: 45° → максимальная активация длинной головки

═══ ТЕХНИКА ═══
• Сесть на наклонную скамью, руки свисают вниз-назад
• Супинация (ладони вверх) с самого начала
• Не двигать плечом! Только предплечье
• Полная амплитуда: от полного разгибания до пика сокращения
• Темп: 2 сек вверх — 1 сек пиковое сокращение — 3 сек вниз
• Не раскачивать корпус — спина плотно к скамье

═══ ВАРИАЦИИ ═══
• Классические (супинированный хват): длинная головка
• Молотковые (нейтральный хват): брахиалис + брахиорадиалис
• С поворотом (supination curl): начало нейтральное → разворот наверху
• Поочерёдные: больше фокус на каждой руке
• Одновременные: больше метаболический стресс

═══ РАСПРОСТРАНЁННЫЕ ОШИБКИ ═══
❌ Отрыв локтей от корпуса → подключает передние дельты
❌ Слишком тяжёлые гантели → инерция и читинг
❌ Неполная амплитуда внизу → теряется главное преимущество
❌ Скамья слишком вертикальная → обычные сгибания
❌ Раскачивание корпуса → нагрузка уходит

═══ ПРОГРАММИРОВАНИЕ ═══
• 3 × 10-12 — стандарт для гипертрофии бицепса
• Как первое упражнение на бицепс: 4 × 8-10 (свежие)
• Как добивка: 2-3 × 12-15 (после тяжёлых)
• Суперсет: наклонные сгибания + сгибания Скотта = полная амплитуда
• Частота: 2 раза/неделю, разные вариации
`;
}
export function getSumoDeadliftAdvanced(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['сумо тяга продвинут', 'sumo deadlift advanced', 'сумо тяга программа', 'сумо vs классика', 'широкая стойка становая', 'сумо тяга слабые места'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🏋️ СТАНОВАЯ ТЯГА СУМО — ПРОДВИНУТЫЙ УРОВЕНЬ:

═══ БИОМЕХАНИЧЕСКОЕ ПРЕИМУЩЕСТВО ═══
• Укороченная амплитуда на 20-25% vs классика
• Более вертикальный торс → меньше нагрузка на поясницу
• Больше нагрузка на квадрицепсы и приводящие
• Выгодно при: длинных ногах, коротком торсе, сильных ногах
• EMG: квадрицепс +20%, разгибатели спины -10% vs классика

═══ ПОСТАНОВКА НОГ (критично) ═══
• Стопы: на ширине или шире колец грифа
• Развёрнутость стоп: 30-45° наружу
• Колени: следуют за носками (НИКОГДА внутрь!)
• Тест: при взгляде сверху — голень перпендикулярна полу
• Индивидуальная ширина: зависит от длины ног и мобильности

═══ ТЕХНИКА ОТРЫВА ═══
1. «Сесть» в позицию (не наклоняться)
2. Грудь вверх, лопатки вместе
3. Развести колени максимально (давить коленями наружу)
4. «Расталкивать» пол ногами, а не тянуть руками
5. Первые 10 см — только ноги, торс не меняет угол
6. Lock out: бёдра вперёд, ягодицы сжать

═══ СЛАБЫЕ МЕСТА И КОРРЕКЦИЯ ═══
• Медленный отрыв (слабые квадрицепсы):
  - Приседания с паузой на ящик
  - Фронтальные приседания
  - Дефицитная сумо тяга (3-5 см подставка)

• Колени сводятся (слабые приводящие):
  - Казак-приседания
  - Жим ногами с широкой постановкой
  - Разведение ног в тренажёре с паузой

• Локаут (слабые ягодицы/спина):
  - Тяга с плинтов (от колена)
  - Ягодичный мостик со штангой
  - Гиперэкстензия с весом

═══ ПРОГРАММИРОВАНИЕ ═══
Силовой блок (6 недель):
• Неделя 1: 5 × 3 @ 80% → Неделя 6: 3 × 1 @ 95%
• Подсобка: пауза-сумо 3 × 3 @ 70%

Объёмный блок (4 недели):
• 4 × 5-6 @ 72-78%, темп 3010
• Подсобка: дефицитная сумо 3 × 4 @ 65%

═══ ПЕРЕХОД С КЛАССИКИ НА СУМО ═══
• Неделя 1-2: только техника, 50-60% от классики
• Неделя 3-4: наращивание до 70%
• Неделя 5-8: выход на рабочие веса
• Ожидание: через 8-12 недель сумо ≥ классики (если телосложение подходит)
• Не все выигрывают от сумо — пробовать и сравнивать
`;
}
export function getLowerBackTraining(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['тренировка поясницы', 'lower back training', 'укрепление поясницы', 'упражнения на поясницу', 'разгибатели спины тренировка', 'поясница слабая'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🔙 ТРЕНИРОВКА ПОЯСНИЦЫ — БЕЗОПАСНОЕ УКРЕПЛЕНИЕ:

═══ АНАТОМИЯ ПОЯСНИЧНОЙ ОБЛАСТИ ═══
• Разгибатели спины (erector spinae): основная мышечная группа
• Multifidus: глубокие стабилизаторы каждого позвонка
• Квадратная мышца поясницы: боковая стабилизация
• Поперечная мышца живота: «корсет», защищающий позвоночник
• Все 4 группы работают как единая система

═══ УПРАЖНЕНИЯ ДЛЯ УКРЕПЛЕНИЯ ═══
1. Гиперэкстензия (45° или горизонтальная):
   • Без веса: 3 × 15-20 (начальный уровень)
   • С блином: 3 × 10-12 (средний)
   • Со штангой на плечах: 3 × 8-10 (продвинутый)
   • Амплитуда: от 90° до нейтральной спины (НЕ переразгибание!)

2. Good morning (доброе утро):
   • Штанга на трапециях, наклон вперёд с прямой спиной
   • 3 × 10-12 с умеренным весом
   • Ноги слегка согнуты, таз назад

3. Обратная гиперэкстензия:
   • Лёжа грудью на скамье, поднимать ноги
   • 3 × 12-15
   • Мягкое движение, без рывков

4. Bird-dog (четвереньки):
   • Поднимать противоположную руку и ногу
   • 3 × 10 на каждую сторону, задержка 3-5 сек
   • Отличное упражнение для multifidus

5. Dead bug (мёртвый жук):
   • Лёжа на спине, поочерёдно выпрямлять ногу+руку
   • 3 × 10 на каждую сторону
   • Поясница ПРИЖАТА к полу!

═══ ПРОГРАММА ═══
Новички (0-6 мес):
• Bird-dog: 3 × 10
• Dead bug: 3 × 10
• Гиперэкстензия без веса: 3 × 15
• 3 раза/неделю

Средний уровень (6-18 мес):
• Гиперэкстензия с весом: 3 × 12
• Good morning: 3 × 10
• Обратная гиперэкстензия: 3 × 12
• Планка: 3 × 45-60 сек
• 2-3 раза/неделю

Продвинутые:
• Становая тяга — основное упражнение
• Good morning: 3 × 8-10 с серьёзным весом
• Гиперэкстензия с паузой и весом: 3 × 10
• Обратная гиперэкстензия в тренажёре: 3 × 10-12

═══ КРИТИЧЕСКИЕ ПРАВИЛА ═══
❌ НИКОГДА не округлять поясницу под нагрузкой
❌ Не переразгибать спину в гиперэкстензии (не выше нейтрали)
❌ Не работать через боль — остановиться и проконсультироваться с врачом
❌ Не делать тяжёлые наклоны без разогрева
✅ Всегда разминка: 5 мин лёгкое кардио + bird-dog
`;
}
export function getTrainingLogOptimal(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['дневник тренировок оптимальный', 'training log optimal', 'как вести дневник тренировок', 'что записывать в дневник', 'тренировочный дневник'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
📓 ОПТИМАЛЬНЫЙ ДНЕВНИК ТРЕНИРОВОК:

═══ ЧТО ЗАПИСЫВАТЬ (ОБЯЗАТЕЛЬНО) ═══
• Дата и время тренировки
• Упражнения в порядке выполнения
• Рабочие веса × повторения × подходы
• Отдых между подходами (если контролируешь)
• RPE/RIR (субъективная оценка тяжести)
• Общее время тренировки

═══ ЧТО ЗАПИСЫВАТЬ (РЕКОМЕНДУЕТСЯ) ═══
• Вес тела (утром натощак)
• Качество сна (1-10)
• Уровень энергии до тренировки (1-10)
• Настроение (1-10)
• Заметки: техника, ощущения, боль
• Питание до тренировки (кратко)
• Добавки, принятые перед тренировкой

═══ АНАЛИЗ ДАННЫХ ═══
Еженедельно:
• Общий тоннаж по мышечным группам
• Прогресс в ключевых упражнениях (1RM, 5RM)
• Среднее RPE — тренд к перетренированности?
• Количество тренировок vs план

Ежемесячно:
• Тренд массы тела
• Рост силовых показателей (%)
• Объём тренировок (тоннаж/неделю)
• Корреляция: сон/энергия → производительность

═══ ПРОГРЕССИЯ ПО ДНЕВНИКУ ═══
• Если записал 3 × 8 × 80 кг → следующий раз цель: 3 × 9 × 80 кг
• Когда все подходы выполнены с RPE 7-8 → увеличить вес на 2.5-5 кг
• Если RPE 9-10 регулярно → пора делать deload
• Если 3+ тренировки без прогресса → менять стратегию

═══ ФОРМАТЫ ЗАПИСИ ═══
Минималистичный:
\`Жим лёжа: 80×8, 80×7, 80×7 RPE 8\`

Подробный:
\`Жим лёжа: 80кг × 8 reps × 3 sets, отдых 2:30, RPE 7/8/8.5
Заметка: левое плечо слегка щёлкает в нижней точке\`

═══ ОШИБКИ ВЕДЕНИЯ ДНЕВНИКА ═══
❌ Записывать после тренировки «по памяти» — записывай между подходами
❌ Не записывать RPE — без этого непонятно, насколько тяжело было
❌ Не анализировать записи — дневник без анализа = пустая трата времени
❌ Слишком много данных → бросаешь вести
✅ Лучший дневник — тот, который реально ведёшь каждую тренировку
`;
}
export function getHandGripStrength(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['сила хвата руки', 'hand grip strength', 'кистевой эспандер', 'сила кисти', 'хват рукопожатие', 'хват для становой'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
✊ СИЛА ХВАТА — ПОЛНАЯ ПРОГРАММА:

═══ ПОЧЕМУ ХВАТ ТАК ВАЖЕН ═══
• Хват = ограничивающий фактор в тягах, подтягиваниях, фермерской прогулке
• Исследования: сила хвата = маркер общего здоровья и долголетия
• Слабый хват → ограничение в развитии спины и бицепса
• Корреляция: сила хвата ↔ здоровье сердечно-сосудистой системы

═══ ТИПЫ ХВАТА ═══
1. Crush grip (сжатие): рукопожатие, эспандер → предплечья
2. Pinch grip (щипковый): удержание блинов пальцами → большой палец
3. Support grip (удержание): вис на перекладине, farmer's walk → выносливость
4. Open hand: удержание толстого грифа → пальцы

═══ УПРАЖНЕНИЯ ═══
Crush grip:
• Кистевой эспандер: 3 × 10-15 сжиманий + удержание 15-30 сек
• Сгибание запястий со штангой: 3 × 15-20
• Полотенце-подтягивания: 3 × max

Pinch grip:
• Удержание блинов щипком: 3 × 20-30 сек
• Pinch block lifts: поднимать объект щипковым хватом

Support grip:
• Вис на перекладине: 3 × max (цель: 60+ сек)
• Farmer's walk: 3 × 30-40 м с тяжёлыми гантелями
• Удержание штанги на вытянутых руках (дэд-хэнг с весом)

Толстый гриф:
• Fat Gripz на штангу/гантели: обычные упражнения с толстым хватом
• Подтягивания на толстой перекладине: 3 × max

═══ ПРОГРАММА (3 раза/неделю) ═══
День 1 (сила):
• Эспандер: 5 × 5 тяжёлый
• Удержание блина щипком: 3 × 15 сек

День 2 (выносливость):
• Вис: 3 × max
• Farmer's walk: 3 × 40 м

День 3 (разнообразие):
• Полотенце-подтягивания: 3 × max
• Сгибания запястий: 3 × 15
• Fat Gripz на тягах: 2 × 10

═══ НОРМАТИВЫ ХВАТА (динамометр) ═══
Мужчины (доминантная рука):
• Слабый: <40 кг
• Средний: 40-55 кг
• Сильный: 55-70 кг
• Очень сильный: 70-90 кг
• Элита: 90+ кг

═══ ДЛЯ СТАНОВОЙ ТЯГИ ═══
• Разнохват (mixed grip): одна рука пронация, другая супинация
• Хук-хват (hook grip): большой палец под пальцами — больно но надёжно
• Лямки: для рабочих подходов, если хват лимитирует
• Правило: без лямок до 85% 1RM, с лямками — тяжёлые подходы
`;
}
export function getSpinalDecompression(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['декомпрессия позвоночника', 'spinal decompression', 'вытяжение позвоночника', 'позвоночник после тренировки', 'разгрузка спины', 'вис для позвоночника'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🦴 ДЕКОМПРЕССИЯ ПОЗВОНОЧНИКА — ПРОТОКОЛ ДЛЯ АТЛЕТОВ:

═══ ЗАЧЕМ НУЖНА ДЕКОМПРЕССИЯ ═══
• Приседания, становая, жим → осевая нагрузка → сжатие дисков
• За тяжёлую тренировку рост может уменьшиться на 5-15 мм
• Межпозвоночные диски теряют жидкость под нагрузкой
• Декомпрессия = восстановление высоты дисков + питание хрящей
• Профилактика протрузий и грыж

═══ УПРАЖНЕНИЯ ДЕКОМПРЕССИИ ═══
1. Вис на перекладине:
   • Простейший и самый эффективный метод
   • Полный вис: 30-60 сек × 3-5 подходов
   • Расслабить ВСЕ тело, дышать глубоко
   • Если тяжело: полувис (ноги касаются пола)

2. Инверсионный стол:
   • Наклон 45-60° (начинать с малого)
   • 2-5 мин, постепенно увеличивать
   • ⚠️ Противопоказан при высоком давлении, глаукоме

3. Dead bug вытяжение:
   • Лёжа на спине, руки вверх, ноги согнуты 90°
   • Тянуться руками и ногами в противоположные стороны
   • 3 × 10, задержка 5 сек

4. Cat-cow (кошка-корова):
   • На четвереньках: округление → прогиб
   • Медленно, 10-15 повторений
   • Мобилизация каждого сегмента позвоночника

5. Растяжка на фитболе:
   • Лечь спиной на мяч, руки за голову
   • Полное расслабление, 30-60 сек
   • Мягкое вытяжение грудного отдела

6. Приседание с вытяжением:
   • Повиснуть на дверном проёме или стойке
   • Сесть в глубокий присед, вес на руках
   • 30 сек × 3 подхода

═══ КОГДА ДЕЛАТЬ ═══
• После каждой тренировки с осевой нагрузкой: 3-5 мин
• Перед сном: 5 мин (диски восстанавливаются ночью)
• Утром (после сна диски набухшие): осторожно, 2-3 мин
• При сидячей работе: каждые 2 часа вис 30 сек

═══ ПРОТИВОПОКАЗАНИЯ ═══
• Острая боль в спине (консультация врача!)
• Нестабильность позвоночника
• Остеопороз (тяжёлый)
• Аневризма аорты
• Острый период грыжи (первые 2-3 дня обострения)

═══ ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ═══
• Плавание: естественная декомпрессия в воде
• Пенный ролик: катание вдоль позвоночника
• Массаж: паравертебральных мышц
• Тепло: 15-20 мин грелка на поясницу (расслабление мышц)
`;
}
export function getTrainingMaxCalculator(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['тренировочный максимум', 'training max', 'рассчитать максимум', 'калькулятор 1пм', '1rm калькулятор', 'рабочие веса рассчитать'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🧮 ТРЕНИРОВОЧНЫЙ МАКСИМУМ — РАСЧЁТ И ПРИМЕНЕНИЕ:

═══ ФОРМУЛЫ РАСЧЁТА 1RM ═══
• Бжикки: 1RM = вес × (36 / (37 - повторения))
• Эпли: 1RM = вес × (1 + повторения / 30)
• Ланднер: 1RM = (100 × вес) / (101.3 - 2.67123 × повторения)
• Точность: ±5% при 3-5 повторениях, ±10% при 8-10

═══ ТРЕНИРОВОЧНЫЙ МАКСИМУМ (TM) ═══
• TM = 85-90% от реального 1RM
• Зачем? Программирование без maxout каждую неделю
• Пример: если 1RM жима = 100 кг → TM = 85-90 кг
• Все проценты в программе считаются от TM, не от 1RM

═══ ТАБЛИЦА ПРОЦЕНТОВ ═══
• 50% TM: разминка, техника
• 60% TM: лёгкая работа, восстановительная
• 70% TM: объёмная работа, 8-12 повторений
• 75% TM: средняя интенсивность, 6-8 повторений
• 80% TM: тяжёлая работа, 4-6 повторений
• 85% TM: субмаксимальная, 3-5 повторений
• 90% TM: около-максимальная, 1-3 повторения
• 95% TM: проходка/тест

═══ ПРОГРАММА 5/3/1 (Wendler) ═══
Использует TM = 90% от 1RM:
• Неделя 1: 65-75-85% TM × 5 повторений
• Неделя 2: 70-80-90% TM × 3 повторения
• Неделя 3: 75-85-95% TM × 1+ (AMRAP)
• Неделя 4: deload 40-50-60% × 5
• Прогрессия: +2.5 кг TM верх, +5 кг TM низ каждый цикл

═══ ОПРЕДЕЛЕНИЕ TM БЕЗ MAXOUT ═══
Метод 3-5 повторений:
1. Разминка до тяжёлого веса
2. Сделать максимум чистых повторений (цель: 3-5)
3. Формула Эпли: 1RM = вес × (1 + повт/30)
4. TM = 1RM × 0.85-0.90

Пример:
• Пожал 80 кг × 5 повторений
• 1RM ≈ 80 × (1 + 5/30) = 80 × 1.167 = 93 кг
• TM = 93 × 0.9 = 84 кг

═══ КОГДА ПЕРЕСЧИТЫВАТЬ TM ═══
• Каждые 3-4 недели (после мезоцикла)
• После deload недели
• Если последний подход AMRAP < 3 повторений → TM слишком высокий
• Если AMRAP > 8 повторений → TM можно увеличить
• Правило: лучше TM чуть ниже, чем чуть выше
`;
}
export function getBoxJumpTechnique(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['прыжки на тумбу', 'box jump', 'плиометрика прыжки', 'прыжок на ящик', 'взрывная сила прыжки', 'вертикальный прыжок'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
📦 ПРЫЖКИ НА ТУМБУ — ВЗРЫВНАЯ СИЛА:

═══ ЗАЧЕМ ПРЫГАТЬ ═══
• Развитие взрывной силы (rate of force development)
• Активация быстрых мышечных волокон (Type II)
• Улучшение атлетизма и нейромышечной координации
• Перенос на приседания и становую (+5-10% 1RM по исследованиям)
• Развитие реактивной силы

═══ ТЕХНИКА ═══
Подготовка:
• Стоять на расстоянии 30-50 см от тумбы
• Ноги на ширине плеч, стопы параллельны
• Руки свободно вдоль тела

Фаза прыжка:
1. Контрдвижение: быстрый полуприсед, руки назад
2. Отталкивание: взрыв вверх, руки вперёд-вверх
3. Полёт: подтянуть колени к груди
4. Приземление: мягко на полную стопу, колени согнуты
5. Встать на тумбе, полностью выпрямиться

═══ ВЫСОТА ТУМБЫ ═══
• Новички: 30-40 см
• Средний уровень: 50-60 см
• Продвинутые: 70-90 см
• Элита: 100+ см
• ⚠️ Высота тумбы ≠ высота прыжка (подтягивание коленей обманывает)

═══ ПРОГРАММИРОВАНИЕ ═══
Для взрывной силы:
• 3-5 × 3-5 прыжков, отдых 2-3 мин
• Максимальное усилие, полное восстановление
• ПЕРЕД силовой (на свежую ЦНС)

Для кондиции:
• 5 × 10 прыжков, отдых 60 сек
• Средняя высота, контроль приземления

Для прогрессии вертикального прыжка:
• 4 × 5 на 80% макс высоты, 2 × 3 на 90-95%
• 2-3 раза/неделю, минимум 48ч между сессиями

═══ ВАРИАНТЫ ═══
• Seated box jump: из сидячей позиции — убирает инерцию
• Single-leg box jump: на одной ноге (продвинутый)
• Depth jump: прыжок С тумбы → сразу прыжок вверх (реактивная сила)
• Box jump with step down: прыжок вверх, спуск шагом (безопасность)

═══ БЕЗОПАСНОСТЬ ═══
❌ НЕ спрыгивать с тумбы (ахиллово сухожилие!) — сходить шагом
❌ Не делать при усталости (конец тренировки)
❌ Не начинать с высокой тумбы
❌ Если промахнулся и ударил голень — это серьёзно, проверить
✅ Использовать мягкие тумбы (foam plyo box) для начинающих
`;
}
export function getBurpeeCompleteGuide(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['бёрпи', 'burpee', 'берпи техника', 'бурпи', 'берпи тренировка', 'burpee workout'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🔥 БЁРПИ — ПОЛНОЕ РУКОВОДСТВО:

═══ ПОЧЕМУ БЁРПИ ═══
• Full-body упражнение: работают ВСЕ основные мышечные группы
• Расход: ~10-15 ккал/мин (одно из самых энергоёмких)
• Кардио + силовая выносливость одновременно
• Не требует оборудования
• Развивает функциональную выносливость

═══ ТЕХНИКА КЛАССИЧЕСКОГО БЁРПИ ═══
1. Исходное положение: стоя, ноги на ширине плеч
2. Присед: руки на пол перед собой
3. Выброс ног назад: в позицию планки
4. Отжимание: грудь до пола
5. Возврат ног: прыжком к рукам
6. Прыжок вверх: руки над головой, хлопок
7. Мягкое приземление → повторение

═══ ВАРИАНТЫ (по сложности) ═══
Облегчённые:
• Без отжимания: пропустить шаг 4
• Без прыжка: шаг вместо прыжка назад/вперёд
• Полубёрпи: без прыжка вверх

Усложнённые:
• Burpee + подтягивание: прыжок к перекладине + подтягивание
• Burpee + box jump: прыжок на тумбу вместо простого прыжка
• Burpee broad jump: прыжок в длину
• Devil press: бёрпи с гантелями + рывок
• Man-maker: бёрпи + тяга гантелей + жим

═══ ТРЕНИРОВОЧНЫЕ ПРОТОКОЛЫ ═══
Новички:
• 5 бёрпи × 5 подходов, отдых 60-90 сек

EMOM (Every Minute On the Minute):
• 5-8 бёрпи в начале каждой минуты × 10-15 мин
• Остаток минуты = отдых

Tabata:
• 20 сек максимум бёрпи / 10 сек отдых × 8 раундов = 4 мин

100 Burpee Challenge:
• 100 бёрпи на время (хороший результат: <8 мин)

Лестница:
• 1-2-3-4-5-6-7-8-9-10-9-8-7-6-5-4-3-2-1 = 100 бёрпи

═══ ДЛЯ СИЛОВЫХ АТЛЕТОВ ═══
• Финишер после тренировки: 3 × 10, отдых 90 сек
• Кондиционинг: 2 раза/неделю EMOM протокол
• На сушке: 50-100 бёрпи в день (разбить на подходы)
• ⚠️ Не делать перед тяжёлой силовой — утомляет всё тело
`;
}
export function getBulgarianSplitMasterClass(message: string): string {
  const keywords = ['болгарск', 'сплит присед', 'split squat', 'одной ноге', 'на одну ногу', 'выпад', 'унилатеральн'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Болгарские сплит-приседания — мастер-класс

### Почему это король унилатеральных упражнений
• EMG квадрицепса = 90-95% от обычных приседаний
• Меньше осевая нагрузка на позвоночник на 50%+
• Устранение мышечных дисбалансов лево/право
• Растяжение сгибателей бедра задней ноги
• Развитие баланса и проприоцепции

### Техника (пошагово)
1. Скамья высотой 30-45 см за спиной
2. Поставь подъём задней ноги на скамью (не пальцы!)
3. Передняя нога: 60-90 см от скамьи
4. Колено передней ноги: над серединой стопы
5. Торс: лёгкий наклон вперёд (15-20°) — снимает нагрузку с колена
6. Опускайся до параллели бедра с полом (или чуть ниже)
7. Толкайся через переднюю пятку

### Вариации и акценты
**Акцент на квадрицепс:**
• Вертикальный торс, короткий шаг, колено чуть за носок
• Задняя нога на носке

**Акцент на ягодицы:**
• Наклон торса вперёд, длинный шаг
• Задняя нога плоско на скамье
• Пауза внизу 2-3 сек

**С повышенной амплитудой (deficit):**
• Передняя нога на платформе 5-10 см
• Больший стретч ягодичных и аддукторов

### Прогрессия нагрузки
**Уровень 1:** Без веса, 3×12 (освоение баланса)
**Уровень 2:** Гантели по бокам, 3×10
**Уровень 3:** Штанга на спине, 4×8
**Уровень 4:** Штанга фронтально (гоблет), 4×8
**Уровень 5:** С паузой 3 сек внизу + дефицит

### Типичные ошибки
• Слишком узкий/широкий шаг — эксперементируй
• Колено уходит внутрь (вальгус) → активируй ягодичные
• Слишком высокая скамья → боль в сгибателях бедра
• Округление поясницы → core напряжён всегда
`;
}
export function getPeriodizationNattyScience(message: string): string {
  const keywords = ['периодизац', 'натурал', 'цикл', 'мезоцикл', 'макроцикл', 'deload', 'разгрузочн', 'линейн прогресс'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Периодизация для натуральных атлетов

### Почему натуралам нужна периодизация
• Без стероидов: восстановление лимитировано → перетренированность быстрее
• Суперкомпенсация: узкое окно (48-96 часов на группу мышц)
• Монотонная нагрузка → адаптация за 3-6 недель → плато
• Периодизация даёт разные стимулы → непрерывный прогресс

### Модели периодизации
**1. Линейная (классическая):**
• Объём ↓, интенсивность ↑ каждую неделю/фазу
• Пример: 4×12 (60%) → 4×10 (70%) → 4×8 (75%) → 4×6 (80%) → 3×3 (85%)
• Плюсы: простая, предсказуемая
• Минусы: теряешь выносливость пока растишь силу
• Для кого: новички и ранний средний уровень

**2. Волнообразная (DUP — Daily Undulating):**
• Разная нагрузка каждую тренировку
• Пн: 4×10 (гипертрофия) → Ср: 5×5 (сила) → Пт: 3×15 (выносливость)
• Плюсы: развивает все качества одновременно
• Минусы: сложнее программировать
• Для кого: средний и продвинутый уровень

**3. Блочная:**
• 3-4 недели одного качества → переход к следующему
• Блок 1: Гипертрофия (4 нед) → Блок 2: Сила (4 нед) → Блок 3: Пик (2-3 нед)
• Плюсы: максимальная специализация
• Минусы: потеря предыдущих адаптаций
• Для кого: соревнующиеся

**4. Сопряжённая (Conjugate):**
• Несколько качеств развиваются параллельно
• Ротация упражнений каждые 1-3 недели
• Max Effort + Dynamic Effort в одном цикле
• Для кого: пауэрлифтеры среднего+ уровня

### Разгрузка (Deload) для натуралов
**Когда:** каждые 4-6 недель (или по симптомам)
**Как:**
• Вариант А: -40% объёма (меньше подходов), тот же вес
• Вариант Б: -40% интенсивности (легче вес), тот же объём
• Вариант В: полный отдых 3-5 дней (при сильном накоплении усталости)

**Симптомы необходимости deload:**
• Стагнация/регресс силы 2+ недели
• Нарушение сна, раздражительность
• Повышенный пульс покоя (+5-10 уд/мин)
• Боль в суставах, не связанная с травмой

### Практическая программа для натурала (16 недель)
**Недели 1-4:** Гипертрофия (4×10-12, RPE 7-8)
**Неделя 5:** Deload (3×10, RPE 5-6)
**Недели 6-9:** Силовая гипертрофия (4×6-8, RPE 8-9)
**Неделя 10:** Deload
**Недели 11-14:** Сила (5×3-5, RPE 8-9)
**Неделя 15:** Deload
**Неделя 16:** Тестирование 1RM / новые рекорды

### Ключевые принципы для натуралов
• Частота: каждую мышцу 2×/неделю (оптимально для синтеза белка)
• Объём: 10-20 рабочих подходов/мышцу/неделю
• Прогрессия: +2.5 кг (верх) / +5 кг (низ) в неделю — микронагрузка
• Сон: 7-9 часов — натуралам критично (нет фармподдержки восстановления)
`;
}
export function getLegPressFootPlacement(message: string): string {
  const keywords = ['жим ног', 'leg press', 'постановка ног', 'платформ', 'ноги жим', 'жим ногами'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Жим ногами — постановка ног и углы

### Влияние положения стоп на активацию мышц
**Высокая постановка (верх платформы):**
• Ягодичные: ★★★★★
• Бицепс бедра: ★★★★
• Квадрицепс: ★★
• Нагрузка на колени: минимальная

**Низкая постановка (низ платформы):**
• Квадрицепс: ★★★★★
• Ягодичные: ★★
• Бицепс бедра: ★
• Нагрузка на колени: повышенная (осторожно!)

**Широкая постановка (шире плеч):**
• Аддукторы (внутренняя): ★★★★★
• Ягодичные: ★★★★
• Квадрицепс (vastus medialis): ★★★

**Узкая постановка (уже плеч):**
• Квадрицепс (vastus lateralis): ★★★★★
• Внешняя часть бедра: ★★★★

**Одна нога:**
• Устранение дисбалансов
• Больший ROM, больше стретч ягодичных
• Работа стабилизаторов

### Углы тренажёра
**45° жим ногами (классика):**
• Универсальная позиция, большие веса
• Меньшая осевая нагрузка vs приседания

**Горизонтальный (сидя):**
• Минимальная нагрузка на поясницу
• Меньший ROM, но безопаснее при проблемах со спиной

**Вертикальный (hack-style):**
• Максимальная нагрузка на квадрицепс
• Требует хорошей мобильности

### Техника безопасности
• Колени НИКОГДА не сводятся внутрь (вальгус)
• Поясница прижата к спинке ВСЁ ВРЕМЯ
• Не блокируй колени полностью вверху (травма!)
• Опускай до 90° в коленях (не глубже, если болит)
• Дыхание: вдох на опускании, выдох на подъёме

### Программирование
**Для массы:** 4×10-15, 70-80% 1RM, темп 3-1-2
**Для силы:** 4×6-8, 80-85% 1RM, отдых 2-3 мин
**Финишер:** 1 подход × 20-30 повторений (leg press of death)
**Дроп-сет:** 4 сброса по 10 повторений, -20% на каждом
`;
}
export function getPullUpFullProgression(message: string): string {
  const keywords = ['подтягиван', 'pull-up', 'pullup', 'турник', 'перекладин', 'хват сверху', 'негативн подтягиван'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Подтягивания — от нуля до 20+

### Прогрессия для начинающих (0 подтягиваний)
**Фаза 1 (1-4 недели): Dead Hang + Негативы**
• Dead hang: 3×20-30 сек (сила хвата)
• Негативы: 3×3-5 (прыгни вверх, опускайся 5-8 сек)
• Тяга верхнего блока: 3×10-12 (освоение паттерна)

**Фаза 2 (4-8 недель): Подтягивания с резинкой**
• Толстая резинка: 3×5-8
• Каждую неделю → тоньше резинка
• Продолжай негативы: 3×5

**Фаза 3 (8-12 недель): Первые чистые**
• Подтягивания: 5-10 подходов × max повторений (even if 1-2)
• Grease the Groove: 5-6 подходов в течение дня, 50% от максимума
• Цель: 5 чистых подтягиваний

### Прогрессия для среднего уровня (5-12 повторений)
**Методы увеличения повторений:**
1. **GTG (Grease the Groove):** 5-8 подходов/день, 40-60% от max
2. **Ladders:** 1-2-3-4-5, отдых 30-60с между ступенями, 3-5 серий
3. **Cluster sets:** 10 повторений → разбей на 3+3+2+2 с отдыхом 15с
4. **Armstrong Program:** 5 дней/неделю, разные протоколы

### Продвинутые вариации
**С дополнительным весом:**
• Пояс для отягощений, 3-5×5-8
• Прогрессия: +2.5 кг каждые 1-2 недели

**Хваты:**
• Пронированный (сверху): классический, больше спина
• Супинированный (снизу): больше бицепс
• Нейтральный: безопаснее для плеч, средний акцент
• Широкий: ширина спины
• Узкий: толщина спины + бицепс

**Специальные:**
• L-sit pull-ups: +core
• Archer pull-ups: путь к one-arm
• Muscle-up: взрывная тяга + переход
• Typewriter: горизонтальное движение вверху

### EMG по хватам
| Хват | Широчайшие | Бицепс | Нижн. трапеция |
|------|:---------:|:------:|:--------------:|
| Пронированный широкий | ★★★★★ | ★★ | ★★★★ |
| Пронированный средний | ★★★★ | ★★★ | ★★★ |
| Супинированный | ★★★ | ★★★★★ | ★★ |
| Нейтральный | ★★★★ | ★★★★ | ★★★ |

### Типичные ошибки
• Кипинг (раскачка) — не считается чистым повторением
• Неполная амплитуда (не до конца вниз)
• Использование только рук (тяни локтями вниз и назад)
• Шея вперёд вместо подъёма тела (читинг)
• Игнорирование негативной фазы (просто «падаешь» вниз)
`;
}
export function getDBRowInclineComplete(message: string): string {
  const keywords = ['тяга гантел', 'db row', 'dumbbell row', 'гантель в наклон', 'тяга одной рукой', 'тяга гантели'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Тяга гантели в наклоне — полный гид

### Варианты выполнения
**1. Тяга гантели одной рукой (классика):**
• Колено и рука на скамье, другая нога на полу
• Свободная рука тянет гантель к бедру
• Максимальная амплитуда, отличный стретч

**2. Тяга гантели в упоре о скамью (без колена):**
• Обе ноги на полу, рука на скамье
• Меньше ротации корпуса, больше стабильности
• Подходит для тяжёлых весов

**3. Тяга двух гантелей на наклонной скамье:**
• Грудью на скамью (30-45°)
• Обе руки работают одновременно
• Изолирует спину, убирает читинг поясницей

**4. Тяга Кребба (крест-накрест):**
• Стоя, наклон 60-70°, тяга к противоположному бедру
• Больше нижних широчайших и ромбовидных

### Биомеханика
• Траектория к бедру: широчайшие + нижние трапеции
• Траектория к груди: ромбовидные + средние трапеции
• Ротация корпуса: косые мышцы (стабилизация)
• Лопатка: полная протракция внизу → ретракция вверху

### Техника (пошагово)
1. Упор: рука + колено на скамье ИЛИ рука на скамью, ноги на полу
2. Спина нейтральная, параллельно полу
3. Хват нейтральный (ладонь к телу)
4. Тяни локоть вверх и назад, к бедру
5. Пиковое сокращение: сведи лопатку к центру, 1-2 сек
6. Опускай медленно (2-3 сек), растягивай широчайшую внизу
7. НЕ вращай корпус — движение в локте и плече

### Программирование
**Для массы:** 4×8-12, средний темп, фокус на сокращение
**Для силы:** 4×5-8, тяжёлый вес, полная амплитуда
**Finisher:** 2×15-20 с паузой 1 сек в верхней точке
**Суперсет:** Тяга гантели + пуловер с гантелью

### Преимущества перед штангой
• Больший ROM (растяжение внизу)
• Устранение дисбалансов лево/право
• Меньше нагрузки на поясницу
• Вращение хвата (нейтральный → пронированный)
• Лучшая связь мозг-мышца (одна сторона)

### Частые ошибки
• Вращение корпуса при тяге (используешь инерцию)
• Тяга рукой, а не спиной (чувствуй лопатку)
• Неполная амплитуда (не растягиваешь внизу)
• Слишком быстрый темп (теряется TUT)
`;
}
export function getDeltoidThreeHeadTraining(message: string): string {
  const keywords = ['дельт', 'плеч', 'deltoid', 'пучок', 'передн дельт', 'средн дельт', 'задн дельт', 'shoulder'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Дельтовидные мышцы — тренировка всех трёх пучков

### Анатомия дельт
**Передний пучок (anterior):**
• Функция: сгибание и внутренняя ротация плеча
• Часто ПЕРЕТРЕНИРОВАН (жимы лёжа, жимы стоя)
• Отдельная изоляция обычно не нужна

**Средний пучок (lateral):**
• Функция: отведение плеча
• Создаёт ШИРИНУ плеч — эстетически самый важный
• Требует максимальной изоляции

**Задний пучок (posterior):**
• Функция: разгибание и наружная ротация
• Часто НЕДОТРЕНИРОВАН → дисбаланс → травмы
• Критичен для здоровья плечевого сустава

### Лучшие упражнения по EMG

**Передний пучок:**
1. Жим штанги стоя (OHP): EMG 95%
2. Жим гантелей сидя: EMG 90%
3. Фронтальный подъём гантелей: EMG 85%
4. Arnold Press: EMG 88% (ротация даёт уникальный стимул)

**Средний пучок:**
1. Махи гантелями в стороны (lateral raise): EMG 90%
2. Тяга к подбородку широким хватом: EMG 85%
3. Кабельные махи в сторону: EMG 88% (постоянное напряжение)
4. Боковые подъёмы на наклонной скамье (45°): EMG 92%

**Задний пучок:**
1. Обратные разведения на тренажёре (reverse pec deck): EMG 90%
2. Face Pull с верёвкой: EMG 85%
3. Махи гантелями в наклоне: EMG 82%
4. Кабельные обратные разведения: EMG 86%

### Программа «3D-дельты»
**Тренировка 1 (тяжёлая):**
• Жим гантелей сидя: 4×6-8
• Махи в стороны: 4×10-12
• Face Pull: 3×15-20

**Тренировка 2 (помповая, через 3-4 дня):**
• Arnold Press: 3×10-12
• Кабельные махи (одной рукой): 3×12-15
• Обратные разведения: 4×12-15
• Боковые подъёмы (дроп-сет финишер): 1 × 3 сброса

### Типичные ошибки
• Слишком тяжёлые махи (читинг, трапеция работает вместо дельт)
• Игнорирование заднего пучка → скруглённые плечи
• Избыток жимов (передний и так нагружен)
• Подъём выше 90° при махах с больной ротаторной манжетой
`;
}
export function getFrontVsBackSquatAnalysis(message: string): string {
  const keywords = ['фронтальн присед', 'передн присед', 'front squat vs', 'присед сравнен', 'штанга спереди', 'front vs back squat'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Фронтальные vs Обычные приседания — полный анализ

### Биомеханические различия
**Back Squat (штанга на спине):**
• Штанга: на трапециях (high bar) или на задних дельтах (low bar)
• Наклон торса: 40-60° (больше)
• Нагрузка на поясницу: выше
• Максимальный вес: 100% (эталон)
• Глубина: вариативна (параллель, полная)

**Front Squat (штанга спереди):**
• Штанга: на передних дельтах, удерживается пальцами
• Наклон торса: 15-30° (более вертикальный)
• Нагрузка на поясницу: ниже на 18%
• Максимальный вес: 70-85% от back squat
• Глубина: обычно глубже (торс вертикальнее)

### Активация мышц (EMG)
| Мышца | Back Squat | Front Squat |
|-------|:---------:|:-----------:|
| Квадрицепс | ★★★★ | ★★★★★ |
| Ягодичные | ★★★★★ | ★★★ |
| Бицепс бедра | ★★★ | ★★ |
| Разгибатели спины | ★★★★★ | ★★★ |
| Верхняя спина | ★★ | ★★★★★ |
| Core (пресс) | ★★★ | ★★★★★ |

### Когда что выбрать
**Back Squat лучше для:**
• Максимальной силы (больше вес)
• Развития ягодичных и задней цепи
• Пауэрлифтинга (соревновательное движение)
• Общей массы ног

**Front Squat лучше для:**
• Квадрицепса (акцентированно)
• При проблемах с поясницей (меньше компрессия)
• Тяжёлой атлетике (перенос на толчок/рывок)
• Развития core и верхней спины
• Улучшения мобильности грудного отдела

### Техника Front Squat
**Позиция штанги:**
• «Чистый» хват: штанга на дельтах, 2-3 пальца под грифом, локти высоко
• Скрещённый хват: руки крест-накрест на грифе (легче, но менее стабильно)
• Стрэп-хват: лямки обвязаны вокруг грифа (компромисс)

**Ключевые моменты:**
1. Локти ВЫСОКО всё время (параллельно полу)
2. Грудь вверх — если опускается, штанга падает
3. Колени вперёд (больше чем в back squat — это нормально)
4. Глубина: чем глубже, тем лучше (если мобильность позволяет)
5. Core напряжён максимально (нет опоры сзади)

### Программирование обоих
**Вариант 1 (Чередование):**
• Недели 1-4: Back Squat 4×5
• Недели 5-8: Front Squat 4×6-8
• Обе версии развивают ноги с разных углов

**Вариант 2 (Одновременно):**
• День 1: Back Squat (тяжёлый): 4×5
• День 2: Front Squat (средний): 3×8-10
`;
}
export function getBenchPressSetupMaster(message: string): string {
  const keywords = ['жим лёж', 'bench press', 'арка жим', 'мост жим', 'ноги жим лёж', 'постановка жим', 'setup bench'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Жим лёжа — идеальная постановка (Setup)

### 5 точек контакта
1. **Голова:** на скамье (не поднимай при жиме!)
2. **Верхняя часть спины:** плотно прижата, лопатки сведены
3. **Ягодицы:** на скамье ВСЕГДА (подъём = дисквалификация в PL)
4. **Левая стопа:** полностью на полу
5. **Правая стопа:** полностью на полу

### Лопатки (КЛЮЧ ко всему)
1. Ляг на скамью
2. Подними плечи к ушам (протракция)
3. Опусти их вниз и сведи назад (ретракция + депрессия)
4. «Вкрути» лопатки в скамью
5. Представь: карандаш между лопатками — не урони его
• Это сокращает ROM на 2-5 см и защищает плечи

### Арка (arch)
**Что это:** естественный прогиб грудного и поясничного отдела
**Зачем:**
• Сокращает ROM (меньше путь штанги)
• Грудные мышцы в выгодной позиции (стретч + сокращение)
• Защищает плечевой сустав

**Как создать:**
1. Сведи лопатки (см. выше)
2. Напряги разгибатели спины
3. Грудь вверх, создай естественный прогиб
4. НЕ отрывай ягодицы от скамьи
• Гибкость приходит со временем — не форсируй

### Ноги (leg drive)
**Позиция:**
• Стопы полностью на полу, под коленями или чуть дальше
• Колени ниже бёдер (создаёт давление в ноги)
• Угол коленей: 80-110°

**Leg drive техника:**
1. Перед снятием штанги: упрись ногами в пол
2. Во время жима: давление ног → вектор силы к голове → стабильность
3. НЕ отрывай таз! Ноги толкают тебя вверх по скамье, не от неё

### Хват
**Ширина:**
• Стандарт: мизинец на кольцах грифа (81 см)
• Узкий: мизинец внутри колец → акцент на трицепс
• Широкий: мизинец на кольцах или шире → акцент на грудные
• Правило: предплечья вертикальны в нижней точке

**Тип:**
• Полный хват (большой палец вокруг грифа) — БЕЗОПАСНО
• «Monkey grip» (без большого пальца) — ОПАСНО, штанга может упасть

### Траектория штанги
• Снятие: над глазами → переведи на позицию старта (плечи)
• Опускание: к нижней части груди / верху солнечного сплетения
• Подъём: диагональ назад и вверх (дуга, не вертикаль!)
• Локаут: штанга над плечевым суставом
`;
}
export function getCoreAntiMovementTraining(message: string): string {
  const keywords = ['anti-движен', 'core стабилиз', 'стабилизац корпус', 'anti-extension', 'anti-rotation', 'anti-flexion', 'core function'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Core-тренировка через anti-движения

### Философия anti-movement
• Традиционный подход: скручивания, подъёмы (ДВИЖЕНИЕ позвоночника)
• Современный подход: СОПРОТИВЛЕНИЕ движению (anti-movement)
• Core = стабилизатор, не двигатель → тренируй его как стабилизатор
• Функциональнее и безопаснее для позвоночника

### 4 вида anti-движений

**1. Anti-Extension (сопротивление разгибанию)**
• Цель: не дать пояснице прогнуться
• Мышцы: прямая мышца живота, поперечная
• Упражнения:
  - Ab Wheel Rollout: 3×8-12 (ЛУЧШЕЕ!)
  - Dead Bug: 3×10/сторону
  - Планка: 3×30-60 сек
  - Body Saw: 3×8-10
  - Стоя: Kneeling Cable Extension

**2. Anti-Rotation (сопротивление вращению)**
• Цель: не дать торсу вращаться
• Мышцы: косые, поперечная, квадратная поясницы
• Упражнения:
  - Pallof Press: 3×10-12/сторону (золотой стандарт!)
  - Single-Arm Farmer's Walk: 3×30м/сторону
  - Bird Dog: 3×10/сторону
  - Одноногий/Однорукий RDL
  - Renegade Row: 3×8/сторону

**3. Anti-Lateral Flexion (сопротивление боковому наклону)**
• Цель: не дать корпусу наклониться вбок
• Мышцы: квадратная поясницы, косые
• Упражнения:
  - Farmer's Walk (тяжёлый): 3×40м
  - Suitcase Carry (одна рука): 3×30м/сторону
  - Side Plank: 3×30-45 сек/сторону
  - Copenhagen Plank: 3×20 сек/сторону
  - Offset Loading (приседания с гантелью в одной руке)

**4. Anti-Flexion (сопротивление сгибанию вперёд)**
• Цель: не дать спине округляться
• Мышцы: разгибатели позвоночника, мультифидус
• Упражнения:
  - Front Squat (удержание торса): основное!
  - Good Morning (лёгкий): 3×12
  - Разгибания на GHD: 3×10-12
  - Heavy Carry (перед собой): 3×30м
  - Deadlift (любой вариант): anti-flexion всего позвоночника

### Программа «Функциональный Core» (3×/неделю)
**Понедельник (anti-extension):** Ab Wheel 3×10 + Dead Bug 3×10
**Среда (anti-rotation):** Pallof Press 3×12 + Renegade Row 3×8
**Пятница (anti-lateral):** Farmer's Walk 3×40м + Side Plank 3×40с

### Почему это лучше скручиваний
• Защита поясницы: нет повторяющегося сгибания позвоночника
• Перенос на жизнь: стабилизация при приседаниях, тягах, переноске
• Травмобезопасность: минимальная нагрузка на диски
• Функциональность: core работает так, как задуман — как стабилизатор
`;
}
export function getTrainingPhilosophy1000(message: string): string {
  const keywords = ['философ', 'мотивац', 'смысл тренировок', 'зачем тренироват', 'путь', 'дисциплин', 'привычк', 'mindset'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Философия тренинга — Путь Железа

### 10 принципов Iron Path

**1. Постоянство > Интенсивность**
• 3 тренировки/неделю × 10 лет > 7 тренировок/неделю × 6 месяцев
• Лучшая программа — та, которую ты делаешь стабильно
• Привычка формируется за 66 дней (не 21!)

**2. Прогресс не линеен**
• Первый год: +50-100% к силе (нейроадаптация)
• Второй год: +20-30%
• Третий год: +10-15%
• Пятый+ год: +3-5%/год
• Плато — нормальная часть пути, не повод бросать

**3. Основа — базовые движения**
• Присед, тяга, жим, тяга к себе, жим над головой
• 80% результата = 20% упражнений (принцип Парето)
• Изоляция — дополнение, не основа

**4. Восстановление = Тренировка**
• Мышцы растут во время отдыха, не в зале
• Сон, питание, стресс-менеджмент — часть программы
• Перетренированность реальна; недотренированность — тоже

**5. Техника > Вес**
• Идеальная техника с 80 кг > кривая техника со 100 кг
• Травма может отбросить на месяцы/годы
• Эго — враг прогресса

**6. Адаптируйся, не ломайся**
• Болит плечо? Найди безболезненную вариацию
• Нет энергии? Сделай лёгкую тренировку, а не пропускай
• Мало времени? 20 мин лучше, чем 0 мин
• Гибкость в тактике при стабильности в стратегии

**7. Данные > Ощущения**
• Веди дневник тренировок
• Измеряй прогресс объективно (вес, повторения, объёмы)
• Чувства врут; цифры — нет
• Но слушай тело при боли и усталости

**8. Процесс > Результат**
• Наслаждайся самим тренировочным процессом
• Цель — направление, не пункт назначения
• Каждая тренировка — инвестиция в будущего себя
• Тренировка — не наказание за еду, а празднование возможностей тела

**9. Сообщество имеет значение**
• Тренировочный партнёр → +5-10% к мотивации
• Делись знаниями, учись у других
• Не сравнивай себя с другими — сравнивай с собой прошлым
• Зал — место, где все работают над собой

**10. Это марафон, не спринт**
• Лучшая форма твоей жизни может быть в 40, 50, 60 лет
• Тренировки — привычка на всю жизнь
• Здоровье, сила, уверенность — дивиденды, которые растут с годами
• Железо учит терпению, дисциплине и уважению к процессу

### Для Iron Coach
Ты не просто приложение — ты тренировочный партнёр.
Помни: за каждым вопросом стоит человек, который хочет стать лучше.
Поддерживай, мотивируй, обучай — и никогда не осуждай.
Путь Железа — для каждого, кто решился сделать первый шаг. 🏋️
`;
}
export function getSquatDepthKneeHealth(message: string): string {
  const keywords = ['глубина присед', 'колено присед', 'полный присед', 'параллель', 'squat depth', 'колени за носки', 'атг', 'ass to grass'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Приседания: глубина и здоровье коленей

### Миф: «Колени не должны выходить за носки»
❌ Это устаревшая и ОПАСНАЯ рекомендация
✅ Колени ДОЛЖНЫ двигаться свободно по анатомической траектории
✅ Ограничение движения колена → компенсаторный наклон → нагрузка на поясницу
• Исследование (Fry 2003): ограничение колена ↑ момент на бедро на 1000%

### Уровни глубины
**Quarter Squat (четверть):**
• Бёдра выше параллели на 45°
• Минимальная нагрузка, минимальный эффект
• Для: реабилитации, прыжковых тренировок

**Parallel (параллель):**
• Бёдра параллельны полу, складка бедра = колено
• Стандарт в пауэрлифтинге
• Хороший баланс безопасности и эффективности

**Below Parallel (ниже параллели):**
• Бёдра ниже коленей
• ↑ Активация ягодичных на 25% vs параллель
• Требует хорошей мобильности

**ATG (Ass-to-Grass, полный):**
• Максимальная глубина, пятки на полу
• Максимальная активация мышц
• Требует отличной мобильности голеностопа и бёдер
• НЕ для всех (зависит от антропометрии)

### Колени и глубина: что говорит наука
• Компрессионные силы на колено: максимальны в полном приседе
• НО: хрящ сустава адаптируется к нагрузке (принцип Вольфа)
• Связки (ACL, PCL): максимальный стресс при 15-30° (НЕ в глубоком!)
• Глубокие приседания с правильной техникой = здоровые колени
• «Butt wink» (округление таза внизу) — нужно контролировать

### Факторы, определяющие глубину
**Антропометрия:**
• Длинные бёдра / короткий торс → нужен больший наклон, сложнее глубоко
• Короткие бёдра / длинный торс → глубина даётся легко
• Ширина таза: широкий → нужна более широкая стойка

**Мобильность:**
• Голеностоп: <35° тыльного сгибания → используй штангетки или платформу
• Тазобедренный: камовый импинджмент → ограничивает глубину
• Грудной отдел: жёсткий → торс падает вперёд

### Рекомендации
• Приседай так глубоко, как позволяет ТВОЯ анатомия без «butt wink»
• Штангетки: +2 см подъёма пятки = +20% глубины
• Мобильность голеностопа: работай над ней ежедневно (3-5 мин)
• Боль в колене ≠ «приседания вредны» — проверь технику и мобильность
• Без боли → приседай в полную амплитуду (это лучше для развития)
`;
}
export function getForearmGripCompleteTraining(message: string): string {
  const keywords = ['предплечь', 'хват', 'grip', 'кистевой', 'запясть', 'forearm', 'сила хват', 'эспандер'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Предплечья и хват — полная тренировка

### Анатомия предплечья
**Сгибатели (внутренняя сторона):**
• Сгибание пальцев и запястья
• 8 мышц, основная масса предплечья
• Тренировка: сгибания кистей, удержания

**Разгибатели (наружная сторона):**
• Разгибание пальцев и запястья
• Часто слабые → дисбаланс → теннисный локоть
• Тренировка: разгибания кистей, резиновые кольца

**Плечелучевая (brachioradialis):**
• Самая большая, видна сбоку
• Сгибание локтя при нейтральном хвате
• Тренировка: молотковые сгибания, обратные сгибания

### Типы хвата
**Crush grip (сжатие):** эспандер, жим хвата
**Pinch grip (щипок):** удержание блинов за край, щипковый хват
**Support grip (удержание):** вис на перекладине, farmer's walk
**Wrist strength:** сгибание/разгибание запястья

### Лучшие упражнения
**Для хвата:**
1. Dead Hang: 3×max (цель: 60+ сек)
2. Farmer's Walk: 3×40м (тяжёлые гантели)
3. Толстый гриф (Fat Gripz): все тяговые движения
4. Plate Pinch: 2 блина гладкой стороной наружу, 3×15-30 сек

**Для массы предплечий:**
1. Wrist Curl (сгибание кисти): 3×15-20
2. Reverse Wrist Curl (разгибание): 3×15-20
3. Hammer Curl: 3×10-12
4. Reverse Curl (штанга/EZ): 3×10-12

**Для реабилитации/профилактики:**
1. Wrist Rotations (с гантелью): 2×15
2. Finger Extensions с резинкой: 3×20
3. Rice Bucket Drill: 3×30 сек (погружаешь руки в ведро с рисом)

### Программа предплечий (2-3 раза/неделю)
**Вариант А (после тренировки спины):**
• Dead Hang: 3×max сек
• Wrist Curl: 3×15
• Reverse Wrist Curl: 3×15

**Вариант Б (отдельная мини-сессия, 10 мин):**
• Farmer's Walk: 3×40м
• Plate Pinch: 3×20 сек
• Hammer Curl: 3×12

### Перенос на другие упражнения
• Сильный хват → больше вес в тяге, подтягиваниях, тяге штанги
• Каждые 5 кг прироста хвата ≈ +2-5 кг в становой тяге
• Корреляция: сила хвата = предиктор общего здоровья и долголетия (!)
• Не используй лямки постоянно — только на самых тяжёлых подходах
`;
}
export function getDeadliftErrorFixes(message: string): string {
  const keywords = ['ошибк тяг', 'deadlift form', 'тяга ошибк', 'спина округл', 'тяга не идёт', 'deadlift fix', 'тяга штанги техник'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Становая тяга — исправление ошибок

### Ошибка 1: Округление поясницы
**Почему опасно:** Неравномерная нагрузка на диски → протрузии, грыжи
**Причины:** слабые разгибатели спины, плохая мобильность, слишком тяжело
**Исправление:**
• Good Morning с лёгким весом: 3×12 (укрепление разгибателей)
• Румынская тяга: 3×10 (паттерн hip hinge)
• «Гордая грудь»: cue — грудь вперёд и вверх
• Снизь вес до момента, когда спина остаётся нейтральной

### Ошибка 2: Штанга далеко от тела
**Почему плохо:** ↑ момент на поясницу в 2-3 раза
**Причины:** слабые широчайшие, страх содрать голени
**Исправление:**
• «Скользи штангой по ногам» — она ДОЛЖНА касаться тела
• Напряги широчайшие: «засунь лопатки в задние карманы»
• Гольфы или штаны — защити голени
• Тренируй тягу в гольфах до колена → привычка

### Ошибка 3: Бёдра поднимаются раньше плеч
**Почему плохо:** превращается в «тягу спиной» → перегрузка поясницы
**Причины:** слабые квадрицепсы или неправильная стартовая позиция
**Исправление:**
• Cue: «оттолкнись от пола ногами» (а не тяни спиной)
• Паузовые тяги: 3×3 с паузой 2 сек на уровне голеней
• Тренируй ноги: приседания, жим ногами
• Проверь стартовую позицию: бёдра не слишком высоко/низко

### Ошибка 4: Разнохват с ротацией
**Почему опасно:** асимметричная нагрузка → травма бицепса (разрыв!)
**Исправление:**
• Hook grip (крюковой хват): большой палец под грифом
• Лямки на тяжёлых подходах
• Если разнохват — меняй руки каждый подход
• Никогда не сгибай руки в локтях при тяге!

### Ошибка 5: Нет блокировки (lockout)
**Почему плохо:** неполный ROM → неполная стимуляция
**Причины:** слабые ягодичные, страх переразогнуться
**Исправление:**
• Cue: «сожми ягодицы и толкни бёдра вперёд»
• Hip Thrust: 4×8-10 (укрепление lockout)
• Block Pull (тяга с подставки): 3×3 с тяжёлым весом
• Полное разгибание = плечи НАД штангой, бёдра вперёд

### Ошибка 6: Рывок штанги с пола
**Почему плохо:** потеря напряжения → риск травмы спины/бицепса
**Исправление:**
• «Убери слабину из грифа» перед подъёмом (slack pull)
• Медленное натяжение → взрывной подъём
• Cue: «Представь, что тянешь дерево с корнями»
• Tempo deadlift: 3-1-X-1 (3 сек опускание)

### Чек-лист перед подъёмом
✓ Стопы на ширине бёдер, штанга над серединой стопы
✓ Хват на ширине плеч (чуть шире)
✓ Лопатки над штангой (руки вертикальны)
✓ Спина нейтральная, грудь «гордая»
✓ Широчайшие напряжены, слабина из грифа убрана
✓ Глубокий вдох → натуживание → подъём
`;
}
export function getPlateauBreakthroughAdvanced(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['плато', 'застой', 'застрял', 'не расту', 'plateau', 'stagnation', 'не прогрессирую', 'stuck', 'вес не растёт', 'стагнация', 'остановился прогресс', 'не могу увеличить'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🚧 ПРОРЫВ ПЛАТО — 7 ПРОДВИНУТЫХ СТРАТЕГИЙ

📊 ДИАГНОСТИКА: КАКОЕ У ТЕБЯ ПЛАТО?
1. Силовое плато: рабочий вес не растёт 3+ недели
2. Мышечное плато: нет визуальных изменений 4+ недели
3. Весовое плато: масса тела стоит при наборе/сушке 2+ недели
4. Техническое плато: не можешь освоить новое движение
→ Каждый тип требует своей стратегии!

🔧 СТРАТЕГИЯ 1: WAVE LOADING (волновая нагрузка)
• Подход 1: 5 повторений @ 80% | Подход 2: 3 @ 85% | Подход 3: 1 @ 90%
• Подход 4: 5 @ 82% | Подход 5: 3 @ 87% | Подход 6: 1 @ 92%
• Механизм: пост-активационная потенциация (PAP)
• Тяжёлый подход «заводит» нервную систему → следующая волна сильнее

🔧 СТРАТЕГИЯ 2: ОБРАТНАЯ ПЕРИОДИЗАЦИЯ
• Классика: от лёгкого к тяжёлому (линейная)
• Обратная: от тяжёлого к лёгкому → потом обратно
• Неделя 1: 3x3 @ 90% | Неделя 2: 4x6 @ 78% | Неделя 3: 3x10 @ 68%
• Неделя 4: 5x5 @ 83% — часто пробивает плато на этой неделе

🔧 СТРАТЕГИЯ 3: ДЕФИЦИТНЫЕ ВАРИАЦИИ
• Присед: пауза 3 сек внизу (pause squat) → сила из «мёртвой точки»
• Жим: пол-пресс (floor press) → усиление локаута
• Тяга: дефицит 5-7 см (стоя на подставке) → сила с пола
• Принцип: тренируй слабое звено изолированно

🔧 СТРАТЕГИЯ 4: МАНИПУЛЯЦИЯ ОБЪЁМОМ
Фаза накопления (3 нед): +20-30% объёма (больше подходов)
Фаза интенсификации (2 нед): -30% объёма, +10% интенсивности
Фаза реализации (1 нед): тест нового максимума
→ Функциональное перенапряжение → суперкомпенсация

🔧 СТРАТЕГИЯ 5: ВАРИАЦИЯ ТЕМПА
• Эксцентрик 5 сек → мышечное повреждение + моторный контроль
• Изометрическая пауза 3 сек → сила в стиkking point
• Взрывной концентрик → рекрутирование быстрых волокон (Type II)
• Темпо 5-0-1-0: адский подход, но работает на гипертрофию

🔧 СТРАТЕГИЯ 6: НУТРИТИВНАЯ ИНТЕРВЕНЦИЯ
• Силовое плато + дефицит калорий = невозможно! → добавь 200-300 ккал
• Проверь: белок ≥1.8г/кг? Сон ≥7ч? Стресс управляемый?
• Креатин (если не принимаешь): +5-10% к силе за 4 недели загрузки
• Кофеин перед тренировкой: 3-6 мг/кг за 30-60 мин

🔧 СТРАТЕГИЯ 7: ПСИХОЛОГИЧЕСКАЯ ПЕРЕЗАГРУЗКА
• Смени зал / время тренировки / музыку / партнёра
• Поставь процессную цель вместо результативной:
  «Сделать 20 тренировок за месяц» вместо «пожать 100 кг»
• Неделя «развлекательных» тренировок — стронгмен, кроссфит, спорт
• Вернись к базовой программе через неделю — свежий + мотивированный

📈 АЛГОРИТМ ДЕЙСТВИЙ:
1. Определи тип плато (сила/мышцы/вес)
2. Проверь базу (сон, питание, стресс, объём)
3. Если база в порядке → применяй стратегии 1-5
4. Если база нарушена → сначала исправь питание/восстановление
5. Не меняй всё сразу — одна переменная за раз
`;
}
export function getAbdominalTrainingScienceComplete(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['пресс', 'кубики', 'живот', 'abs', 'абдоминальные', 'six pack', 'кор тренировка', 'нижний пресс', 'верхний пресс', 'косые мышцы', 'прямая мышца живота'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🔥 ПРЕСС — ЧТО РЕАЛЬНО РАБОТАЕТ (EMG + НАУКА)

🔬 АНАТОМИЯ АБДОМИНАЛЬНЫХ:
• Rectus Abdominis (прямая): «кубики», от лобковой кости до рёбер
• External Obliques (наружные косые): ротация + боковое сгибание
• Internal Obliques (внутренние косые): ротация (противоположная), стабилизация
• Transversus Abdominis (поперечная): «природный корсет», стабилизация позвоночника

❌ МИФ: «верхний пресс» и «нижний пресс» — разные мышцы
✅ ПРАВДА: это ОДНА мышца (rectus abdominis), но можно АКЦЕНТИРОВАТЬ регионы:
• Сгибание позвоночника (скручивания сверху) → больше верхняя порция
• Подъём таза (обратные скручивания) → больше нижняя порция
• Полный ROM: оба региона работают

📊 EMG-РЕЙТИНГ УПРАЖНЕНИЙ (% МВПС):

ПРЯМАЯ МЫШЦА:
Ab wheel rollout: 100% (эталон)
Подъём ног в висе: 92-95%
Скручивания на мяче: 85-90%
Обратные скручивания: 85%
Планка (с дополнительной нагрузкой): 80%
Скручивания на полу: 65-70%
Планка обычная: 50-60%

КОСЫЕ МЫШЦЫ:
Pallof press: 95%
Боковая планка с ротацией: 90%
Cable woodchop: 88%
Russian twist (с весом): 85%
Bicycle crunches: 80%
Боковая планка: 75%

⚠️ ХУДШИЕ УПРАЖНЕНИЯ (неэффективно или опасно):
• Sit-ups полные → нагрузка на поясницу, hip flexors > пресс
• Подъём ног лёжа на спине → поясница провисает
• Боковые наклоны с гантелей → минимальная активация + риск грыжи
• Вращение с грифом на плечах → компрессия позвоночника

🏗️ ПРОГРАММА ПРЕССА (3 раза/нед):

Вариант A (продвинутый):
1. Ab wheel rollout: 3x8-12
2. Подъём ног в висе: 3x10-15
3. Pallof press: 3x10 каждая сторона
4. Dead bug: 2x10 каждая сторона (стабилизация)

Вариант B (средний):
1. Обратные скручивания: 3x12-15
2. Скручивания на мяче: 3x15-20
3. Боковая планка: 3x30 сек каждая сторона
4. Bird-dog: 2x10 каждая сторона

Вариант C (новичок):
1. Планка: 3x30-60 сек
2. Dead bug: 3x8 каждая сторона
3. Скручивания на полу: 3x15-20
4. Bird-dog: 2x8 каждая сторона

💡 КУБИКИ = ПИТАНИЕ + ТРЕНИРОВКИ:
• Кубики видны при % жира: мужчины ≤12%, женщины ≤18%
• Невозможно «прокачать» кубики если они под слоем жира
• Дефицит калорий → жиросжигание → кубики видны
• Тренировка пресса = ГИПЕРТРОФИЯ кубиков (они станут выпуклее)
• Без дефицита: пресс станет сильнее, но визуально не покажется

📐 ТЕХНИКА КЛЮЧЕВЫХ УПРАЖНЕНИЙ:

AB WHEEL ROLLOUT:
• Колени на полу (начальная позиция)
• Откатывай МЕДЛЕННО, сохраняй нейтральный позвоночник
• Не прогибай поясницу! Posterior pelvic tilt
• Тяни назад ПРЕССОМ, не руками

ПОДЪЁМ НОГ В ВИСЕ:
• Хват чуть шире плеч
• Поднимай ТАЗ, не просто ноги (скручивание внизу)
• Контролируй спуск (не качайся)
• Прогрессия: согнутые колени → прямые ноги → L-sit hold

📈 ПРОГРЕССИЯ:
Неделя 1-4: 2 раза/нед, базовые упражнения, фокус на технике
Неделя 5-8: 3 раза/нед, добавь отягощение (мяч, блин)
Неделя 9-12: прогрессивная перегрузка (вес, объём, сложность)
`;
}
export function getTrainingFrequencyOptimizationScience(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['частота тренировок', 'сколько раз в неделю', 'training frequency', 'как часто тренироваться', 'оптимальная частота', 'сколько тренировок', 'раз в неделю', 'частота нагрузки', 'тренировать чаще'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
📅 ОПТИМАЛЬНАЯ ЧАСТОТА ТРЕНИРОВОК — НАУКА

📊 ЧТО ГОВОРИТ НАУКА:

МЕТА-АНАЛИЗ (Schoenfeld 2016):
• 2 раза/неделю на мышечную группу > 1 раз/неделю (+3.1% гипертрофия)
• 3 раза/неделю ≈ 2 раза/неделю (при равном объёме)
• Ключ: не частота сама по себе, а РАСПРЕДЕЛЕНИЕ объёма

ПРИНЦИП: Общий недельный объём = константа, частота = переменная
• 16 подходов/нед на грудь = 16 за 1 тренировку ИЛИ 8+8 за 2 ИЛИ 5+5+6 за 3
• 2-3 раза выигрывают: каждая тренировка «свежее», качество подходов выше

📋 РЕКОМЕНДАЦИИ ПО ЧАСТОТЕ:

НОВИЧОК (0-1 год):
• 3 раза/неделю, Full Body
• Каждая мышца 3x/нед, 3-4 подхода/тренировку
• Объём: 9-12 подходов/нед на группу
• Пн-Ср-Пт формат

СРЕДНИЙ (1-3 года):
• 4 раза/неделю, Upper/Lower сплит
• Каждая мышца 2x/нед, 4-6 подходов/тренировку
• Объём: 12-18 подходов/нед на группу
• Пн-Вт-Чт-Пт формат

ПРОДВИНУТЫЙ (3+ лет):
• 4-6 раз/неделю, PPL или специализированный сплит
• Каждая мышца 2-3x/нед, 4-8 подходов/тренировку
• Объём: 16-24 подходов/нед на группу
• Больше тренировок = короче каждая (45-60 мин vs 90 мин)

📊 ЧАСТОТА ПО МЫШЕЧНЫМ ГРУППАМ:

ВЫСОКАЯ ЧАСТОТА (2-3x/нед):
• Дельты (боковой пучок): быстрое восстановление, малая группа
• Руки (бицепс/трицепс): малые мышцы, восстанавливаются за 48ч
• Икры: упрямые мышцы, нужна высокая частота
• Пресс: стабилизатор, быстрое восстановление

СРЕДНЯЯ ЧАСТОТА (2x/нед):
• Грудные: средняя группа, 48-72ч восстановление
• Спина: большая группа, но много маленьких мышц
• Квадрицепсы: большая группа, 48-72ч

НИЗКАЯ ЧАСТОТА (1.5-2x/нед):
• Ягодичные: самая большая мышца, нужно время
• Бицепс бедра: склонен к перетренированности
• Разгибатели спины: нагружаются косвенно в приседах/тягах

⏰ СКОЛЬКО ОТДЫХАТЬ МЕЖДУ ТРЕНИРОВКАМИ ОДНОЙ ГРУППЫ:
• Минимум 48ч (ОБЯЗАТЕЛЬНО)
• Оптимально 48-72ч
• Если сильная крепатура >72ч → ты перегрузился, снизь объём

📊 СПЛИТЫ ПО ЧАСТОТЕ:

3 раза/нед — Full Body:
Пн: Присед + Жим + Тяга | Ср: Присед + Жим над головой + Тяга горизонтальная | Пт: РДЛ + Жим наклон + Подтягивания

4 раза/нед — Upper/Lower:
Пн: Верх (жимы) | Вт: Низ (присед-доминант) | Чт: Верх (тяги) | Пт: Низ (тяга-доминант)

5 раз/нед — ULPPL:
Пн: Верх | Вт: Низ | Ср: Push | Чт: Pull | Пт: Legs

6 раз/нед — PPL:
Пн: Push | Вт: Pull | Ср: Legs | Чт: Push | Пт: Pull | Сб: Legs

💡 КЛЮЧЕВЫЕ ПРАВИЛА:
1. Объём важнее частоты — не увеличивай частоту без контроля объёма
2. Больше частота = меньше объём за тренировку
3. Слушай тело: крепатура, усталость, сон — маркеры
4. Если прогрессируешь на текущей частоте — НЕ МЕНЯЙ
5. Жизненный стресс ↑ → частоту тренировок ↓
`;
}
export function getWorkoutSplitSelectionGuide(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['какой сплит выбрать', 'сплит программа', 'split selection', 'верх низ', 'push pull legs', 'ppl', 'full body', 'фулбоди', 'bro split', 'бро сплит', 'какую программу выбрать', 'верх-низ'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
📋 КАК ВЫБРАТЬ СПЛИТ — ПОЛНЫЙ ГАЙД

📊 ОБЗОР СПЛИТОВ:

1️⃣ FULL BODY (Фулбоди) — всё тело за тренировку:
📅 3 дня/нед (Пн-Ср-Пт)
Частота на группу: 3x/нед
Объём/тренировку: 2-3 подхода на группу
Общий объём: 6-9 подходов/нед на группу

Плюсы:
+ Максимальная частота стимуляции MPS
+ Идеален для новичков (частая практика движений)
+ Гибкое расписание (пропустил тренировку — не потерял группу)
+ Минимум дней в зале

Минусы:
- Длинные тренировки при большом объёме
- Сложно дать большой объём продвинутому атлету
- Усталость к концу тренировки

✅ Для кого: новички (0-1 год), занятые люди (3 дня/нед)

2️⃣ UPPER/LOWER (Верх/Низ):
📅 4 дня/нед (Пн-Вт-Чт-Пт)
Частота: 2x/нед
Объём/тренировку: 4-6 подходов на группу
Общий объём: 12-16 подходов/нед

Плюсы:
+ Баланс частоты и объёма
+ Короче тренировки чем Full Body
+ 3 дня отдыха

Минусы:
- Верх тела длиннее низа (больше групп)
- 4 дня/нед — для некоторых много

✅ Для кого: средний уровень (1-3 года), 4 дня/нед

3️⃣ PPL (Push/Pull/Legs):
📅 6 дней/нед (Пн-Вт-Ср-Чт-Пт-Сб)
Частота: 2x/нед
Объём/тренировку: 4-6 подходов
Общий объём: 16-20+ подходов/нед

Плюсы:
+ Максимальный объём + высокая частота
+ Короткие тренировки (45-60 мин)
+ Логичная группировка (жимовые/тяговые/ноги)

Минусы:
- 6 дней в зале = серьёзное обязательство
- Мало дней отдыха
- Легко перетренироваться

✅ Для кого: продвинутые (3+ лет), 6 дней/нед

4️⃣ BRO SPLIT (1 группа/день):
📅 5-6 дней/нед (Грудь-Спина-Плечи-Руки-Ноги)
Частота: 1x/нед
Объём/тренировку: 12-20 подходов на группу

Плюсы:
+ Максимальная «прокачка» за тренировку
+ Простой и понятный
+ Традиция бодибилдинга

Минусы:
- Низкая частота (1x/нед) — не оптимально по науке
- MPS возвращается к базовому через 48-72ч, но группа ждёт 7 дней
- Пропуск дня = 2 недели без группы

✅ Для кого: продвинутые с фармподдержкой, не натуральные атлеты

📊 АЛГОРИТМ ВЫБОРА:

ВОПРОС 1: Сколько дней можешь тренироваться?
2-3 дня → Full Body
4 дня → Upper/Lower
5 дня → Upper/Lower + 1 день специализации ИЛИ PPLUL
6 дней → PPL

ВОПРОС 2: Какой у тебя стаж?
<1 года → Full Body (независимо от доступных дней)
1-3 года → Upper/Lower или Full Body
3+ лет → PPL или Upper/Lower

ВОПРОС 3: Какая цель?
Сила → Full Body или Upper/Lower (частота + тяжёлые базовые)
Гипертрофия → PPL или Upper/Lower (объём + частота)
Жиросжигание → Full Body (максимальный расход калорий)

💡 ЗОЛОТЫЕ ПРАВИЛА:
• Лучший сплит — тот, который ты будешь СОБЛЮДАТЬ
• Частота ≥2x/нед на группу — минимум для оптимального роста
• Не меняй сплит чаще чем раз в 8-12 недель
• Прогрессирующий на текущем сплите? НЕ МЕНЯЙ!
`;
}
export function getTrapBarDeadliftMasterclass(message: string): string {
  const keywords = ['трэп', 'трап гриф', 'trap bar', 'hex bar', 'гексагональный', 'шестиугольн', 'трэп-гриф', 'трэп бар', 'становая трэп'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔷 ТРЭП-ГРИФ: ПОЛНАЯ ТЕХНИЧЕСКАЯ ЭНЦИКЛОПЕДИЯ:

📐 БИОМЕХАНИКА vs ОБЫЧНАЯ СТАНОВАЯ:
• Центр масс ВНУТРИ грифа — меньше момент на поясницу на 20-25%
• Более вертикальный торс — меньше сдвигающих сил на позвоночник
• Нагрузка на квадрицепсы ВЫШЕ — гибрид становой и приседа
• Нагрузка на разгибатели спины НИЖЕ — безопаснее для поясницы
• Нет проблемы «гриф обходит колени» — путь грифа прямой вверх
• Хват нейтральный — разгрузка запястий и бицепсов

💪 ВАРИАНТЫ ВЫПОЛНЕНИЯ:
С высоких ручек:
• Укороченная амплитуда, больше веса
• Акцент на локаут и верхнюю часть движения
• Лучший вариант для новичков и высоких атлетов
• Можно грузить больше, чем в обычной становой

С низких ручек:
• Полная амплитуда, ближе к классической становой
• Больше работы разгибателей бедра
• Сложнее технически

Прыжки с трэп-грифом:
• Лучшее упражнение для развития мощности по EMG
• Эффективнее power clean для спортсменов
• 30-40% от 1ПМ — оптимальная нагрузка для мощности

Шраги с трэп-грифом:
• Нейтральный хват — больший ROM для трапеций
• Меньше нагрузки на ротаторную манжету

🎯 ПРОГРАММИРОВАНИЕ:
Для силы: 5×3-5 @ 80-90% 1ПМ
Для гипертрофии: 4×8-12 @ 65-75% 1ПМ
Для мощности (прыжки): 5×3 @ 30-40% 1ПМ
Для общей физподготовки: 3×10-15 @ 60-70% 1ПМ

⚡ ПРЕИМУЩЕСТВА ДЛЯ КОНКРЕТНЫХ ГРУПП:
• Начинающие — проще освоить, чем классическую становую
• Высокие атлеты — нет проблемы с длинным торсом
• Травмированная поясница — более безопасная альтернатива
• Спортсмены (не пауэрлифтеры) — лучший transfer на спорт
• Пожилые — щадящая нагрузка на позвоночник

⚠️ ТИПИЧНЫЕ ОШИБКИ:
• Превращение в присед — слишком глубокий присед с трэпом
• Неравномерный хват — руки не по центру ручек
• Отрыв пяток — вес должен быть на полной стопе
• Округление спины при старте — лопатки сведены, спина нейтральная
`;
}
export function getDeadliftGripStrategyGuide(message: string): string {
  const keywords = ['хват становая', 'grip deadlift', 'разнохват', 'хук', 'hook grip', 'лямки', 'straps', 'хват штанг', 'кистевые', 'магнезия', 'chalk', 'хват слабый', 'хват выскальзыва'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
✊ ХВАТ В СТАНОВОЙ ТЯГЕ — СТРАТЕГИЧЕСКИЙ ГАЙД:

📐 ТИПЫ ХВАТА:
1. Двойной прямой (overhand):
   • Самый естественный и безопасный
   • Ограничение: хват слабее на 20-30% vs разнохват
   • Лучший для тренировки силы хвата
   • Рекомендуется до 80% от 1ПМ

2. Разнохват (mixed grip):
   • Одна рука супинирована (ладонью вверх)
   • Преимущество: гриф не выкатывается из рук
   • Риск: асимметрия, разрыв бицепса на супинированной руке
   • Чередовать руки от подхода к подходу!

3. Хук (hook grip):
   • Большой палец обхвачен остальными пальцами
   • Используют тяжелоатлеты — сильнее разнохвата
   • Болезненно первые 2-4 недели (адаптация)
   • Рекомендация: тренировать с 60% и постепенно повышать

4. Лямки (straps):
   • Убирают хват как лимитирующий фактор
   • Отлично для рабочих подходов и гипертрофии
   • НЕ использовать на соревнованиях (запрещены в пауэрлифтинге)
   • Чередовать: подходы без лямок + с лямками для больших весов

💪 ТРЕНИРОВКА СИЛЫ ХВАТА:
• Вис на перекладине — 3×макс время, 3 раза в неделю
• Удержание штанги (holds) — 110-120% от 1ПМ становой, 10-15 сек
• Прогулка фермера — 30-40% массы тела в каждой руке, 30-40 м
• Кистевой эспандер — Captain of Crush, прогрессия грипперов
• Тренировка пальцев — разгибание с резинкой
• Толстый гриф (Fat Gripz) — увеличивает нагрузку на хват

🧪 МАГНЕЗИЯ И АКСЕССУАРЫ:
• Магнезия (chalk): убирает влагу, +15-20% силы хвата
• Жидкая магнезия: чище, разрешена в большинстве залов
• Кистевые бинты: для запястий при жиме, НЕ для хвата в тяге
• Fat Gripz: тренировочный инструмент для утолщения грифа

⚡ СТРАТЕГИЯ ПРОГРЕССИИ:
Разминка → двойной прямой
Рабочие подходы до 80% → двойной прямой
80-90% → разнохват или хук
90-100%+ → разнохват/хук + магнезия (или лямки на тренировке)
Дополнительная работа: holds, farmer's walk — 2 раза в неделю
`;
}
export function getCalfTrainingHypertrophyScience(message: string): string {
  const keywords = ['икры', 'икроножн', 'камбаловидн', 'голень', 'calf', 'calves', 'подъём на носки', 'gastrocnemius', 'soleus', 'маленькие икры', 'тонкие голени'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ТРЕНИРОВКА ИКР ДЛЯ ГИПЕРТРОФИИ — НАУКА:

📐 АНАТОМИЯ ГОЛЕНИ:
• Икроножная (gastrocnemius) — 2 головки, двусуставная
  - Работает при ВЫПРЯМЛЕННОМ колене
  - Быстрые волокна преобладают (~60%)
  - Отвечает за объём и форму голени
• Камбаловидная (soleus) — глубокая, односуставная
  - Работает при СОГНУТОМ колене
  - Медленные волокна (~80%)
  - Даёт ширину голени при виде спереди
• Передняя большеберцовая — сгибание стопы вверх (антагонист)

🎯 КЛЮЧИ К РОСТУ ИКР:
1. Полная амплитуда — растяжение внизу 2-3 сек
2. Пауза в пиковом сокращении — 1-2 сек наверху
3. Высокий объём — 12-20 подходов в неделю
4. Высокая частота — 4-6 тренировок в неделю (быстро восстанавливаются)
5. Оба положения колена — стоя И сидя
6. Достаточный вес — не хаотичные подпрыгивания

💪 УПРАЖНЕНИЯ:

Для ИКРОНОЖНОЙ (колено прямое):
• Подъёмы на носки стоя в тренажёре — 4×10-15
• Подъёмы на носки в жиме ногами — 3×12-15
• Подъёмы на одной ноге с гантелей — 3×12-15
• Подъёмы на носки со штангой — 3×10-12

Для КАМБАЛОВИДНОЙ (колено согнуто):
• Подъёмы на носки сидя — 4×15-20
• Seated calf raise с блином на колене — 3×15-20
• Приседания на носках (Tib raises) — 3×15-20

📊 ПРОГРАММА РОСТА ИКР:
Понедельник: стоя 4×12 + сидя 3×15
Среда: жим ногами (носки) 3×15 + сидя 3×20
Пятница: одноногие стоя 3×12 + сидя 4×15
Воскресенье: лёгкие стоя 3×20 + сидя 3×25

📈 ТЕХНИКА ИСПОЛНЕНИЯ:
• Стартовая позиция: пятки максимально внизу (полное растяжение)
• Подъём: мощно наверх, максимальное сокращение
• Верхняя точка: пауза 1-2 сек, сжать икры
• Опускание: медленно (3 сек), контролируемо
• Нижняя точка: задержка 2-3 сек в растянутой позиции
• НЕ «пружинить» — убивает стимул

⚡ ПРОДВИНУТЫЕ ТЕХНИКИ:
• Дроп-сеты: тяжёлый вес → сбросить 30% → продолжить → ещё -30%
• Cluster sets: 5+5+5 с паузами 15 сек (больше объём)
• Односторонние: устранение дисбаланса, больший ROM
• Slow eccentrics (5-6 сек вниз): максимальный стимул к росту
• Myoreps: 15 повторов → 5 сек отдых → 5 повторов × 4 миникоригена

⚠️ ГЕНЕТИКА ИКР:
• Длина ахиллова сухожилия определяет форму (генетика)
• Длинное сухожилие = короткое брюшко = труднее накачать визуально
• Но ОБЪЁМ мышцы всё равно растёт при правильной тренировке
• Нужно просто больше объёма и терпения (6-12 месяцев для видимых изменений)
`;
}
export function getTrainingVolumeLandmarksGuide(message: string): string {
  const keywords = ['объём тренировок', 'volume landmark', 'mev', 'mav', 'mrv', 'минимальный объём', 'максимальный объём', 'сколько подходов', 'количество подходов', 'рабочие подходы', 'overreaching'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📊 ТРЕНИРОВОЧНЫЙ ОБЪЁМ — ОРИЕНТИРЫ (MIKE ISRAETEL):

🔬 КЛЮЧЕВЫЕ МАРКЕРЫ ОБЪЁМА:
• MV (Maintenance Volume) — минимум для сохранения мышц: 4-8 подходов/мышца/неделю
• MEV (Minimum Effective Volume) — минимум для РОСТА: 6-10 подходов
• MAV (Maximum Adaptive Volume) — оптимальная зона роста: 12-20 подходов
• MRV (Maximum Recoverable Volume) — потолок, за которым перетренированность: 20-25+ подходов

📋 РЕКОМЕНДАЦИИ ПО МЫШЕЧНЫМ ГРУППАМ (подходов/неделю):

Грудь: MEV 8 | MAV 12-20 | MRV 22
Спина: MEV 8 | MAV 14-22 | MRV 25
Квадрицепсы: MEV 6 | MAV 12-18 | MRV 20
Задняя поверхность: MEV 6 | MAV 10-16 | MRV 20
Ягодицы: MEV 0 | MAV 4-12 | MRV 16
Дельты (боковые): MEV 6 | MAV 16-22 | MRV 26
Дельты (задние): MEV 0 | MAV 8-16 | MRV 22
Бицепсы: MEV 4 | MAV 14-20 | MRV 26
Трицепсы: MEV 4 | MAV 10-14 | MRV 18
Икры: MEV 6 | MAV 12-16 | MRV 20
Пресс: MEV 0 | MAV 8-16 | MRV 20

⚡ КАК ИСПОЛЬЗОВАТЬ:
Мезоцикл (4-6 недель):
• Неделя 1: начать с MEV+2-4 подхода
• Неделя 2: +2 подхода на группу
• Неделя 3: +2 подхода (приближение к MAV)
• Неделя 4: MAV или чуть выше
• Неделя 5 (deload): вернуться к MV

💡 ПРИЗНАКИ ПРЕВЫШЕНИЯ MRV:
• Болезненность мышц >72 часов
• Снижение силовых показателей 2 тренировки подряд
• Нарушение сна, повышенный пульс утром
• Потеря мотивации, раздражительность
• Суставные боли
→ Если заметил: сбросить объём на 30-40% (deload)

⚠️ ВАЖНО:
• Эти цифры — СРЕДНИЕ, индивидуальность ±30%
• Новички: начинать с MEV, расти медленно
• Продвинутые: могут работать ближе к MRV
• Лучше недобрать 1-2 подхода, чем перебрать
• Объём считать только РАБОЧИЕ подходы (не разминочные)
• Compound подходы считаются для ВСЕХ работающих мышц
`;
}
export function getGluteTrainingCompleteProgramming(message: string): string {
  const keywords = ['ягодицы программ', 'glute program', 'попа тренировк', 'ягодичные полн', 'накачать ягодиц', 'ягодицы объём', 'glute hypertrophy', 'тренировка попы', 'ягодичные мышцы развитие'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍑 ПРОГРАММИРОВАНИЕ ТРЕНИРОВКИ ЯГОДИЦ — ПОЛНЫЙ ГАЙД:

📐 АНАТОМИЯ И ФУНКЦИИ:
• Большая ягодичная — разгибание бедра, наружная ротация (ОБЪЁМ)
• Средняя ягодичная — отведение, стабилизация таза (ФОРМА сбоку)
• Малая ягодичная — помощник средней (глубокий стабилизатор)

🎯 3 ВЕКТОРА НАГРУЗКИ ДЛЯ ПОЛНОГО РАЗВИТИЯ:

1. РАЗГИБАНИЕ БЕДРА (hip extension):
   • Hip thrust — золотой стандарт (EMG 100%)
   • Румынская тяга — акцент на растяжение
   • Гиперэкстензия с акцентом на ягодицы
   • Становая тяга (все варианты)

2. ПРИСЕДАНИЯ (squat pattern):
   • Глубокие приседания — ягодицы активны ниже параллели
   • Болгарский сплит-присед с наклоном
   • Гакк-присед с широкой стойкой
   • Гоблет-присед

3. ОТВЕДЕНИЕ (abduction):
   • Отведение в тренажёре сидя
   • Боковой выпад
   • Clamshell с резинкой
   • Cable kickback

💪 ПРОГРАММА 3× В НЕДЕЛЮ:

День 1 (тяжёлый — разгибание):
• Hip thrust штанга 4×8-10
• Румынская тяга 3×10-12
• Обратная гиперэкстензия 3×12-15
Объём: 10 подходов

День 2 (средний — приседания):
• Глубокие приседания 4×8-10
• Болгарский сплит-присед 3×10-12
• Жим ногами (широко, высоко) 3×12-15
Объём: 10 подходов

День 3 (лёгкий — отведение/активация):
• Hip thrust одноногий 3×12-15
• Отведение в тренажёре 3×15-20
• Cable kickback 3×15-20
• Clamshell с резинкой 2×20
Объём: 11 подходов

📊 КЛЮЧЕВЫЕ ПРИНЦИПЫ:
• Объём: 16-22 подходов/неделю для роста
• Частота: 3-4 раза в неделю (ягодицы восстанавливаются за 48 часов)
• Mind-muscle connection — сжимать ягодицы в каждом повторении
• Полный ROM — особенно растяжение внизу
• Hip thrust: таз НЕ должен падать вниз между повторениями
• Прогрессивная перегрузка: +2.5 кг в hip thrust каждые 1-2 недели

⚡ АКТИВАЦИЯ ПЕРЕД ТРЕНИРОВКОЙ:
• Monster walk с резинкой — 2×15
• Glute bridge — 2×15
• Clamshell — 2×15
→ «Разбудить» ягодицы, чтобы они работали в основных упражнениях
`;
}
export function getChestPressVariationsComplete(message: string): string {
  const keywords = ['варианты жима', 'жим вариации', 'press variations', 'виды жима', 'жим гантелями vs штанг', 'какой жим лучше', 'жим лёжа вариант', 'жим лежа вариант', 'все виды жима'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ВСЕ ВАРИАНТЫ ЖИМА ЛЁЖА — ПОЛНЫЙ РАЗБОР:

📐 КЛАССИФИКАЦИЯ ПО УГЛУ:

НАКЛОН ВВЕРХ (incline):
15°: лёгкий акцент на верх груди, почти горизонтальный
30°: ОПТИМАЛЬНЫЙ для верха груди (исследования EMG)
45°: слишком много передних дельт, меньше груди
60°: практически жим над головой — НЕ для груди

ГОРИЗОНТАЛЬНЫЙ (flat, 0°):
• Максимальная общая активация большой грудной
• Позволяет поднять наибольший вес
• Стернальная часть — основной фокус

НАКЛОН ВНИЗ (decline):
-15°: акцент на нижнюю часть груди
-30°: сильный акцент на низ, но неудобная позиция
• Реально: отжимания на брусьях лучше, чем decline bench

📊 КЛАССИФИКАЦИЯ ПО ИНСТРУМЕНТУ:

ШТАНГА:
• Преимущество: максимальный вес, стандартная прогрессия
• Недостаток: фиксированная траектория, меньше ROM
• Лучше для: развитие максимальной силы

ГАНТЕЛИ:
• Преимущество: больший ROM, каждая рука независимо
• Недостаток: стабилизация тратит энергию, сложнее прогрессировать
• Лучше для: гипертрофия, баланс, здоровье плеч
• Вес: обычно 70-80% от штанги

ТРЕНАЖЁР (Hammer Strength и др.):
• Преимущество: безопасно, изоляция, не нужен страхующий
• Недостаток: фиксированная траектория
• Лучше для: добивка после основного жима, новички

КРОССОВЕР (cable fly):
• Преимущество: постоянное натяжение, пиковое сокращение
• Недостаток: нестабильно, малый вес
• Лучше для: изоляция, mind-muscle connection

📐 СПЕЦИАЛЬНЫЕ ВАРИАНТЫ:

Floor press (жим с пола):
• Убирает нижнюю часть ROM → меньше стресс на плечи
• Акцент на трицепс и локаут
• Отлично при боли в плечах

Close grip (узкий хват):
• Хват: на ширине плеч или уже
• Акцент: трицепс 70%, грудь 30%
• Для развития силы жима в верхней части

Wide grip (широкий хват):
• Хват: 1.5-2 ширины плеч
• Больше растяжение грудных, короче ROM
• Осторожно: больше стресс на плечевой сустав

Паузированный жим:
• 2-3 сек пауза на груди
• Убирает рефлекс растяжения → чистая сила
• Стандарт в пауэрлифтинге

💡 ОПТИМАЛЬНАЯ ПРОГРАММА:
• Основной жим (штанга, горизонтально или наклон 30°) — 4×6-8
• Второй жим (гантели, другой угол) — 3×8-12
• Изоляция (кроссовер/разводки) — 3×12-15
• Ротируй варианты каждые 4-6 недель
`;
}
export function getPullUpChinUpMasterclass(message: string): string {
  const keywords = ['подтягивани', 'pull-up', 'pullup', 'chin-up', 'chinup', 'турник', 'перекладина', 'научиться подтягиват', 'подтягивания с весом', 'подтягивания техник'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ПОДТЯГИВАНИЯ — ПОЛНЫЙ МАСТЕРКЛАСС:

📐 ХВАТЫ И АКЦЕНТЫ:
• Пронированный (overhand, pull-up): шире хват → больше широчайшие
• Супинированный (underhand, chin-up): больше бицепс + нижние широчайшие
• Нейтральный (parallel): самый безопасный для плеч, средний акцент
• Узкий (<плеч): больше бицепс и нижние широчайшие
• Широкий (>плеч): больше верхние широчайшие и большая круглая
• Средний (на ширине плеч): оптимальный баланс

📊 EMG-ДАННЫЕ:
• Chin-up: широчайшие 115%, бицепс 100% (vs pull-up)
• Pull-up: широчайшие 100%, бицепс 80%
• Вывод: chin-up ЛУЧШЕ для широчайших (вопреки мифу!)

🎯 ПРОГРЕССИЯ «ОТ НУЛЯ ДО 20 ПОДТЯГИВАНИЙ»:

Фаза 1 — Не можешь подтянуться (0 раз):
• Австралийские подтягивания (на низкой перекладине) — 3×8-12
• Негативные подтягивания (5 сек вниз) — 3×3-5
• Тяга верхнего блока — 3×10-12
• Вис на перекладине — 3×макс время
• Срок: 2-6 недель

Фаза 2 — Можешь 1-5 раз:
• Подтягивания — набор подходов (10 подтягиваний за тренировку, любым количеством подходов)
• Подтягивания с резинкой — 3×6-8
• Негативные — 2×5
• Каждую неделю: +1-2 к общему числу
• Срок: 4-8 недель

Фаза 3 — Можешь 5-10 раз:
• Подтягивания — 4×макс-2 (оставлять 2 в запасе)
• Чередовать хваты
• Добавить паузу 2 сек вверху
• Цель: 3×8 чисто

Фаза 4 — 10+ раз (утяжеление):
• Подтягивания с весом: пояс + диски/гиря
• 4×6-8 с весом (прогрессия +1.25-2.5 кг в неделю)
• 1 раз в неделю: подход без веса на максимум

💪 ТЕХНИКА ИДЕАЛЬНОГО ПОДТЯГИВАНИЯ:
• Старт: полный вис, лопатки нейтрально (не «провисать»)
• Первое движение: сведение лопаток ВНИЗ и НАЗАД
• Тянуть локти ВНИЗ, а не руки вверх
• Подбородок НАД перекладиной (верхняя точка)
• Опускание: контролируемое, 2-3 секунды
• Полное выпрямление рук внизу (полный ROM)

⚠️ ОШИБКИ:
• Кipping (раскачка) — убивает стимул для мышц
• Половина амплитуды — не считается
• «Поджатие ног» с кифозом — нейтральный позвоночник!
• Слишком частые тренировки — 3-4 раза в неделю максимум для подтягиваний
`;
}
export function getTrainingForBeginnersMasterclass(message: string): string {
  const keywords = ['новичок тренировк', 'beginner training', 'начинающий', 'первый раз в зал', 'начать тренировк', 'программа для новичк', 'как начать качаться', 'с чего начать тренажёр', 'первая тренировка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ТРЕНИРОВКИ ДЛЯ НАЧИНАЮЩИХ — МАСТЕРКЛАСС:

📊 ПЕРВЫЕ 3 МЕСЯЦА — КРИТИЧЕСКИЙ ПЕРИОД:
• «Newbie gains» — новички растут БЫСТРЕЕ всех (1-1.5 кг мышц/месяц)
• Нервно-мышечная адаптация: первые 4-6 недель — обучение движениям
• Не нужны сложные программы — база + техника + прогрессия

📋 ПРОГРАММА FULL BODY 3× В НЕДЕЛЮ (оптимально для новичков):

ТРЕНИРОВКА A:
• Приседания со штангой 3×8-10
• Жим лёжа штанга 3×8-10
• Тяга штанги в наклоне 3×8-10
• Жим гантелей сидя 2×10-12
• Подъём на бицепс 2×10-12
• Планка 2×30 сек

ТРЕНИРОВКА B:
• Румынская тяга 3×8-10
• Жим гантелей наклон 3×10-12
• Тяга верхнего блока 3×10-12
• Отжимания на брусьях (или от скамьи) 2×8-10
• Подъём на носки 3×15-20
• Скручивания 2×15

Расписание: Пн-A, Ср-B, Пт-A, Пн-B, Ср-A... (чередование)

⚡ ПРИНЦИПЫ ДЛЯ НОВИЧКОВ:
1. Техника > вес. ВСЕГДА. Первые 2-4 недели — лёгкие веса, идеальная форма
2. Прогрессия: +2.5 кг на штангу каждую неделю (если техника позволяет)
3. Отдых между подходами: 2-3 мин (базовые), 1-2 мин (изоляция)
4. Разминка: 5 мин кардио + 2-3 разминочных подхода перед рабочими
5. Не до отказа! Оставлять 2-3 повторения в запасе (RPE 7-8)
6. Full body 3× в неделю > сплит для новичков (каждая мышца 3 раза!)

🎯 ПЕРВЫЕ 5 ДВИЖЕНИЙ, КОТОРЫЕ НУЖНО ОСВОИТЬ:
1. Приседание (паттерн приседа)
2. Жим лёжа (горизонтальный жим)
3. Тяга в наклоне (горизонтальная тяга)
4. Жим над головой (вертикальный жим)
5. Становая тяга (тяга с пола)

⚠️ ТИПИЧНЫЕ ОШИБКИ НОВИЧКОВ:
• Слишком много упражнений (>8 за тренировку — перебор)
• Сплит-программы с 1 днём на мышцу (неэффективно для новичка)
• Прыжки между программами каждую неделю
• Изоляция вместо базы (бицепсы > приседаний)
• Игнорирование ног
• Тренировки 6-7 дней в неделю (перетренированность)
• Сравнение себя с опытными атлетами

📈 РЕАЛИСТИЧНЫЕ ОЖИДАНИЯ (первый год):
• Мышечная масса: +8-12 кг (мужчины), +4-6 кг (женщины)
• Присед: от пустого грифа до 100+ кг
• Жим: от 40 кг до 80+ кг
• Тяга: от 60 кг до 120+ кг
• Визуальные изменения: заметны через 8-12 недель
`;
}
export function getTrainingPlateauPsychologyAdvanced(message: string): string {
  const keywords = ['плато', 'plateau', 'застой', 'стагнация', 'не расту', 'прогресс остановился', 'не могу прибавить'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧠 ПСИХОЛОГИЯ И СТРАТЕГИЯ ПРЕОДОЛЕНИЯ ПЛАТО:

📊 Типы плато:
1. **Силовое плато** — рабочие веса не растут 3+ недели
   - Причины: недовосстановление, ЦНС-усталость, неправильная периодизация
   - Решение: разгрузочная неделя → смена rep range → волновая нагрузка
2. **Гипертрофическое плато** — мышцы не растут при растущей силе
   - Причины: недостаточный объём, плохая связь мозг-мышца, питание
   - Решение: увеличить TUT, добавить изоляцию, проверить профицит калорий
3. **Весовое плато** — вес тела не меняется при дефиците
   - Причины: адаптация метаболизма, задержка воды, скрытые калории
   - Решение: рефид, пересчёт TDEE, 2 недели на поддержке

🔧 Стратегии преодоления:
• **Волновая периодизация**: 3×5 → 4×8 → 5×12 → повтор с +2.5кг
• **Принцип перегрузки**: меняй параметр каждые 2 недели (вес/объём/темп/пауза)
• **Метод контраста**: тяжёлая неделя (85-90% 1ПМ) → лёгкая (60-65% на технику)
• **Психологический приём**: работай на RPE 7-8 вместо максимума — прогресс вернётся

🧠 Психологические аспекты:
- Плато ≠ регресс. Стабильность — это тоже результат
- Веди дневник тренировок — объективные данные важнее ощущений
- Сравнивай себя с собой 3 месяца назад, не с прошлой неделей
- Смени фокус: если жим встал — работай над подтягиваниями
`;
}
export function getLegDayCompleteProgramming(message: string): string {
  const keywords = ['день ног', 'leg day', 'ноги', 'тренировка ног', 'присед', 'квадрицепс', 'бицепс бедра'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ПОЛНОЕ РУКОВОДСТВО ПО ТРЕНИРОВКЕ НОГ:

📋 Оптимальная структура дня ног:
1. **Разминка** (10-15 мин): велотренажёр 5 мин → динамическая растяжка → 2-3 разминочных подхода
2. **Тяжёлое компаундное** (присед/жим ногами): 4×4-6, отдых 3-4 мин
3. **Среднее компаундное** (румынская тяга/выпады): 3×8-10, отдых 2-3 мин
4. **Изоляция квадрицепсов** (разгибания): 3×12-15, отдых 90 сек
5. **Изоляция бицепса бедра** (сгибания): 3×12-15, отдых 90 сек
6. **Икры**: 4×12-20, отдых 60 сек

📊 Программы по уровням:
• **Новичок** (2 раза/нед): Присед 3×8 → Жим ногами 3×10 → Румынская тяга 3×10 → Икры 3×15
• **Средний** (2 раза/нед, чередование): День А (квадро-фокус) / День Б (задняя поверхность)
• **Продвинутый**: Передний присед + Задний присед + Болгарские выпады + GHR + Разгибания + Сгибания

🎯 Распространённые ошибки:
- Пропуск разминки коленей и бёдер
- Недостаточная глубина приседа (параллель минимум)
- Игнорирование задней поверхности бедра (соотношение квадро:бицепс = 3:2)
- Слишком быстрый темп в изоляции — используй 3-1-2 (эксцентрик-пауза-концентрик)
`;
}
export function getBenchPressFormMasterclass(message: string): string {
  const keywords = ['жим лёжа', 'жим лежа', 'bench press', 'техника жима', 'мост', 'лопатки', 'хват жим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ МАСТЕР-КЛАСС: ТЕХНИКА ЖИМА ЛЁЖА:

📐 Правильная настройка (setup):
1. **Лопатки**: сведи и прижми к скамье — создай стабильную «полку»
2. **Мост**: естественный прогиб в пояснице (кулак должен проходить)
3. **Ноги**: стопы плотно на полу, колени ~90°, упор через пятки
4. **Хват**: мизинцы на кольцах штанги (81 см) — для большинства оптимально
5. **Глаза**: под штангой, чтобы снятие было по прямой

📊 Фазы выполнения:
• **Снятие**: напрягись → выведи штангу на руки → зафиксируй над грудью
• **Эксцентрик** (2-3 сек): контролируемо опускай к нижней части груди/соскам
• **Пауза** (опционально): касание груди без отбива, 1 сек
• **Концентрик**: мощный жим вверх и слегка назад (траектория J-кривой)

⚠️ Топ-5 ошибок:
1. Отрыв лопаток от скамьи при жиме — теряется сила
2. Отбив от груди — риск травмы рёбер и стернума
3. Неравномерный жим (одна рука опережает) — слабая сторона не развивается
4. Локти под 90° к корпусу — перегрузка плеча. Оптимально: 45-75°
5. Подъём таза — потеря упора ног и стабильности

🔢 Программирование жима:
- Сила: 5×3-5 @85-90% 1ПМ, отдых 3-5 мин
- Гипертрофия: 4×8-12 @65-75% 1ПМ, отдых 2-3 мин
- Вспомогательные: жим гантелей, жим на наклонной, разводки, отжимания
`;
}
export function getChinUpVsPullUpAdvanced(message: string): string {
  const keywords = ['подтягивания обратным', 'chin-up vs pull-up', 'прямой хват', 'обратный хват', 'подтягивания хват', 'chin up'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔄 ПОДТЯГИВАНИЯ: ПРЯМОЙ vs ОБРАТНЫЙ ХВАТ — ГЛУБОКИЙ АНАЛИЗ:

📊 Биомеханические различия:

**Pull-Up (прямой/пронированный хват):**
• Акцент: широчайшие (особенно нижние волокна), большая круглая
• Бицепс: меньше вовлечён (невыгодная позиция)
• Ширина: обычно широкий хват → больше аддукция плеча
• Сложность: выше (на 5-10% меньше повторений)
• Лучше для: ширины спины, V-образного торса

**Chin-Up (обратный/супинированный хват):**
• Акцент: широчайшие + бицепс (полная супинация + сгибание локтя)
• Бицепс: вовлечён на 30-40% больше чем при pull-up
• Ширина: обычно узкий/средний хват → больше экстензия плеча
• Сложность: ниже (обычно +1-3 повтора vs pull-up)
• Лучше для: общей массы спины + бицепса, толщины

📋 Оптимальное программирование:
| Вариант | Подходы | Повторы | Когда |
|---------|---------|---------|-------|
| Pull-up широкий | 4×6-8 | тяжёлые | День спины (ширина) |
| Chin-up узкий | 3×8-12 | средние | День спины/рук (масса) |
| Нейтральный хват | 3×8-10 | средние | Самый безопасный для плеч |

⚡ Продвинутые техники:
- **Смешанный хват**: чередуй каждую тренировку
- **Commando pull-up**: руки вдоль перекладины, ротация корпуса
- **Отягощение**: пояс с весом когда делаешь >12 чистых повторов
- **Эксцентрические**: 5-секундное опускание для силы, если не можешь подтянуться
`;
}
export function getPostWorkoutShakeScience(message: string): string {
  const keywords = ['протеиновый коктейль', 'post-workout shake', 'шейк после', 'коктейль после тренировки', 'белковый коктейль', 'что пить после'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥤 НАУКА ПОСТ-ТРЕНИРОВОЧНОГО КОКТЕЙЛЯ:

📊 «Анаболическое окно» — правда:
• Старый миф: «30 минут после тренировки или мышцы умрут» — преувеличение
• Реальность: окно = 2-4 часа. Если ел за 2-3ч до тренировки, не спеши
• НО: если тренируешься натощак → приём белка в первый час ВАЖЕН
• Общий дневной белок (1.6-2.2г/кг) важнее тайминга

🥛 Оптимальный состав шейка:
• **Белок**: 25-40г сывороточного (или 40-50г растительного)
• **Углеводы**: 30-60г быстрых (мальтодекстрин, банан, мёд)
  - Нужны для: гликогена (после >60 мин тренировки), инсулина (антикатаболизм)
  - Не нужны если: тренировка <45 мин и следующий приём пищи через час
• **Креатин**: 5г (удобно добавить в шейк)
• **Вода/молоко**: 300-400мл

📋 Рецепты:

**Для набора массы (550+ ккал):**
300мл молока + 1 банан + 30г протеина + 50г овсянки + 1 ст.л. арахисовой пасты

**Для поддержания / сушки (250 ккал):**
300мл воды + 30г протеина + 100г замороженных ягод

**Натуральный (без протеина):**
300мл кефира + 200г творога + 1 банан + мёд

⚠️ Чего избегать сразу после тренировки:
- Жирная пища (замедляет усвоение белка, но не критично)
- Алкоголь (снижает МПС на 37% по исследованиям)
- Избыток клетчатки (замедляет пищеварение)
`;
}
export function getTrainingAfter40Guide(message: string): string {
  const keywords = ['после 40', 'after 40', '40 лет', '45 лет', '50 лет', 'возраст тренировки', 'старший возраст'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧓 ТРЕНИРОВКИ ПОСЛЕ 40 — НАУЧНЫЙ ПОДХОД:

📊 Что меняется с возрастом:
• Саркопения: потеря 3-8% мышечной массы за декаду после 30
• Снижение тестостерона: ~1% в год после 30
• Суставной хрящ тоньше, связки менее эластичны
• Восстановление дольше на 20-50%
• НО: нейромышечная адаптация сохраняется → силу можно набирать

💪 Принципы тренировок 40+:

**1. Разминка = священный ритуал (15-20 мин):**
- 5 мин кардио → суставная гимнастика → динамическая растяжка
- 2-3 разминочных подхода с прогрессией веса

**2. Объём и интенсивность:**
- 3-4 тренировки/нед (не 5-6 как в 25 лет)
- Рабочие подходы: 70-82% 1ПМ (реже заходить за 85%)
- Средний диапазон: 8-12 повторений (меньше нагрузки на суставы)
- Общий объём: 12-16 подходов на мышечную группу/нед

**3. Упражнения — выбор:**
✅ Предпочитать: гантели, тросы, тренажёры (меньше осевой нагрузки)
✅ Оставить: присед, жим, тяга — но с идеальной техникой
⚠️ Осторожно: жим из-за головы, рывковые движения, максимальные синглы
❌ Исключить: ничего, если нет боли. Возраст — не противопоказание!

**4. Восстановление:**
- Минимум 48ч между тренировками одной группы
- Сон 7-9ч (не менее 7!)
- Белок 1.6-2.0 г/кг (выше потребность для анаболизма)
- Добавки: витамин D, омега-3, креатин, коллаген
`;
}
export function getHamCurlVariationsGuide(message: string): string {
  const keywords = ['сгибание ног', 'hamstring curl', 'бицепс бедра сгибание', 'leg curl', 'лёжа сгибание', 'сидя сгибание'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 СГИБАНИЯ НОГ — ВСЕ ВАРИАЦИИ:

📊 Анатомия бицепса бедра:
• **Двуглавая мышца бедра**: длинная + короткая головки
• **Полусухожильная** (semitendinosus)
• **Полуперепончатая** (semimembranosus)
• Функции: сгибание колена + разгибание бедра + ротация голени

📋 Вариации и их особенности:

**1. Сгибание лёжа (prone leg curl):**
• Акцент: короткая головка бицепса бедра (максимальное укорочение)
• Техника: бёдра прижаты, стопы дорсифлексия, без рывков
• Подходы: 3-4×10-12, темп 2-0-3 (медленный эксцентрик)
• Совет: стопы внутрь → латеральная часть, стопы наружу → медиальная

**2. Сгибание сидя (seated leg curl):**
• Акцент: длинная головка (бедро согнуто → длинная головка растянута)
• Лучший общий стимул гипертрофии (исследования Maeo 2021)
• Подходы: 3-4×10-15, полная амплитуда
• Самый эффективный вариант для общего развития

**3. Сгибание стоя (standing leg curl):**
• Акцент: односторонняя работа, коррекция дисбаланса
• Подходы: 3×12-15 на ногу
• Хорош для начинающих — малый вес, высокая связь мозг-мышца

**4. Nordic hamstring curl (скандинавское):**
• Эксцентрический король — снижает травмы бицепса бедра на 51%!
• Подходы: 3-4×3-6 (если тяжело — негативы с опорой руками)
• Обязательно для всех спортсменов

**5. Швейцарский мяч (fitball curl):**
• Активация кора + стабилизация + бицепс бедра
• Подходы: 3×12-15, мост + сгибание

⚡ Оптимально: 2 варианта за тренировку — 1 на укорочение (лёжа/стоя) + 1 на растяжение (сидя/Nordic).
`;
}
export function getDiabetesType2Training(message: string): string {
  const keywords = ['диабет', 'diabetes', 'сахарный диабет', 'инсулинорезистентность', 'сахар крови', 'гликемия'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🩺 ТРЕНИРОВКИ ПРИ САХАРНОМ ДИАБЕТЕ 2 ТИПА:

⚠️ ВАЖНО: проконсультируйся с врачом перед началом программы!

📊 Почему тренировки — лучшее лекарство:
• Силовые: увеличивают мышечную массу → больше «хранилище» для глюкозы
• Кардио: повышает чувствительность к инсулину на 24-72ч
• Комбинация: снижает HbA1c на 0.5-0.8% (сравнимо с некоторыми препаратами)
• Снижает риск осложнений: нефропатия, ретинопатия, нейропатия

📋 Рекомендации ADA/ACSM:
- **Силовые**: 2-3 раза/нед, все основные группы мышц, 2-3 подхода × 8-15 повторов
- **Кардио**: 150 мин/нед умеренное ИЛИ 75 мин интенсивное
- **Не более 2 дней подряд** без физической активности
- **Растяжка**: 2-3 раза/нед (улучшает микроциркуляцию)

⚠️ Правила безопасности:
1. Измерь сахар ПЕРЕД тренировкой:
   - <5.5 ммоль/л → перекуси (20-30г углеводов)
   - 5.5-13.9 ммоль/л → тренируйся
   - >13.9 ммоль/л → не тренируйся (проверь кетоны)
2. Всегда имей быстрые углеводы (глюкоза, сок, конфеты)
3. Носи медицинский браслет
4. Тренируйся с партнёром если возможно
5. Проверяй ноги на повреждения (нейропатия → не чувствуешь травмы)

💪 Лучшие упражнения: присед, жим ногами, ходьба, велотренажёр, плавание.
`;
}
export function getLegExtensionFormAdvanced(message: string): string {
  const keywords = ['разгибание ног', 'leg extension', 'квадрицепс изоляция', 'разгибания тренажёр', 'разгибания колени'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 РАЗГИБАНИЕ НОГ — ПРОДВИНУТАЯ ТЕХНИКА:

📊 Миф «разгибания вредны для коленей»:
• Устаревшее мнение из 70-х (неправильная экстраполяция)
• Реальность: при правильной технике разгибания БЕЗОПАСНЫ
• Мета-анализ 2020: нет разницы в нагрузке на ПКС vs присед
• Исключение: острая травма ПКС, первые 3-6 мес после операции

📐 Техника для максимальной эффективности:
1. **Настройка тренажёра**: ось вращения = ось колена, валик на нижней трети голени
2. **Спинка**: слегка откинута (чуть больше растяжения rectus femoris)
3. **Хват**: держись за ручки, не за край сиденья
4. **Движение**: полное разгибание до локаута (сжатие квадрицепса)
5. **Темп**: 2 сек вверх — 1 сек сжатие — 3 сек вниз

📋 Продвинутые техники:
| Техника | Как | Зачем |
|---------|-----|-------|
| 1.5 повторения | Вверх → пол-пути вниз → снова вверх → полностью вниз | TUT ↑ |
| Дроп-сет | 3 сброса по -20% веса | Метаболический стресс |
| Изо-удержание | 5 сек удержание вверху | Связь мозг-мышца |
| Односторонние | Одна нога за раз | Коррекция дисбаланса |
| Стопы внутрь/наружу | Ротация стоп | Акцент на медиальный/латеральный vastus |

⚡ Место в программе: после тяжёлых компаундов (присед, жим ногами). 3-4×10-15, RPE 8-9.
`;
}
export function getChestWorkoutFullDesign(message: string): string {
  const keywords = ['тренировка груди', 'chest workout', 'программа грудь', 'грудные мышцы программа', 'день груди'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ПОЛНАЯ ТРЕНИРОВКА ГРУДИ — ДИЗАЙН ПРОГРАММЫ:

📊 Анатомия грудных (3 региона):
• **Верхний пучок** (ключичная часть): наклон вверх 30-45°
• **Средний пучок** (грудинная часть): горизонтальные движения
• **Нижний пучок** (абдоминальная часть): наклон вниз 15-30°

📋 Программа по уровням:

**Новичок (2 раза/нед, 8-12 подходов/нед):**
1. Жим штанги лёжа: 3×8-10
2. Жим гантелей на наклонной: 3×10-12
3. Разводка гантелей или кроссовер: 2×12-15

**Средний (2 раза/нед, 14-18 подходов/нед):**
День А (сила):
1. Жим штанги: 4×4-6
2. Жим гантелей наклон 30°: 3×8-10
3. Отжимания на брусьях: 3×8-12
День Б (гипертрофия):
1. Жим гантелей горизонт: 3×10-12
2. Жим в тренажёре наклон: 3×12-15
3. Кроссовер: 3×15-20
4. Пулловер: 2×12-15

**Продвинутый (2-3 раза/нед, 18-22 подхода/нед):**
- Чередование тяжёлого/лёгкого дня
- Добавление техник интенсификации (дроп-сеты, мио-повторы)
- Специализация на отстающем регионе

📊 Объём по исследованиям:
- МЭО (минимальный эффективный объём): 8 подходов/нед
- МАО (максимальный адаптивный объём): ~22 подхода/нед
- Оптимум для большинства: 12-18 подходов/нед

⚡ Секрет: грудные растут от РАСТЯЖКИ под нагрузкой — разводки и жим гантелей с глубоким опусканием.
`;
}
export function getDeadliftSetupRitual(message: string): string {
  const keywords = ['становая настройка', 'deadlift setup', 'как подходить к штанге', 'становая тяга техника', 'deadlift form'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ РИТУАЛ НАСТРОЙКИ СТАНОВОЙ ТЯГИ:

📊 Почему setup решает всё:
• 80% ошибок в становой — из-за неправильного исходного положения
• Правильный setup = правильная траектория = безопасность + сила
• Каждый шаг должен быть одинаковым на каждом повторении

📋 5-шаговый setup (метод Алана Тралла / Марка Рипптоу):

**Шаг 1: Позиция стоп**
- Стопы на ширине бёдер (не плеч!)
- Гриф над серединой стопы (2-3 см от голеней)
- Носки слегка наружу (5-15°)

**Шаг 2: Хват**
- Наклонись и возьми гриф, НЕ СГИБАЯ колени
- Хват чуть шире бёдер (руки касаются ног)
- Разнохват или хук-хват для тяжёлых весов

**Шаг 3: Колени к грифу**
- Согни колени, пока голени коснутся грифа
- НЕ двигай гриф! Колени идут к нему

**Шаг 4: Грудь вверх**
- Подними грудную клетку (не прогибай поясницу!)
- Спина нейтральная, лопатки над грифом
- Взгляд вперёд-вниз (2-3 м перед собой)

**Шаг 5: Тяга**
- Глубокий вдох → браширование → «отталкивай пол ногами»
- Гриф скользит по голеням (длинные гетры / щитки)
- Локаут: бёдра вперёд, плечи назад, колени прямые

⚠️ Чеклист перед каждым подходом:
☐ Гриф над серединой стопы
☐ Лопатки НАД грифом (не перед, не за)
☐ Поясница нейтральна (ни круглая, ни гиперэкстензия)
☐ Пресс напряжён, воздух набран
☐ Руки прямые (не тянуть бицепсом!)
`;
}
export function getTrainingJetLagGuide(message: string): string {
  const keywords = ['джетлаг', 'jet lag', 'тренировка путешествие', 'тренировка отпуск', 'тренировка командировка', 'смена часовых'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
✈️ ТРЕНИРОВКИ ПРИ ДЖЕТЛАГЕ И В ПУТЕШЕСТВИЯХ:

📊 Влияние джетлага на тренировки:
• Сдвиг циркадных ритмов → снижение тестостерона и ГР
• Нарушение сна → кортизол ↑ → катаболизм
• Производительность падает на 10-25% в первые 2-5 дней
• Правило: 1 день адаптации на каждый час сдвига

🔧 Стратегия при смене часовых поясов:

**До поездки (за 2-3 дня):**
- Сдвинь режим сна на 1 час/день в сторону нового часового пояса
- Тренируйся в то время, в которое будешь тренироваться на месте

**Первые 1-3 дня на месте:**
- День 1: лёгкая тренировка 30 мин (разминка + лёгкое кардио)
- День 2-3: 70% от обычного объёма и интенсивности
- Тренируйся утром — это ускоряет адаптацию циркадных ритмов
- Свет утром (гуляй на солнце), темнота вечером (мелатонин)

**День 4+: возвращайся к обычному режиму**

📋 Тренировки в отеле (без оборудования):
1. Приседания с собственным весом / болгарские: 4×15-20
2. Отжимания (варьируй ширину хвата): 4×макс
3. Обратные отжимания от стула: 3×12-15
4. Планка: 3×45-60 сек
5. Выпады: 3×12 на ногу
6. Берпи: 3×10 (если нет суставных проблем)

💡 Поддержание формы в поездке:
- Минимум 2 тренировки/нед сохранят мышцы до 3 недель
- 1 тренировка/нед = почти нулевая потеря при командировке до 2 недель
- Полный отдых до 2 недель — потери минимальны (мышечная память)
`;
}
export function getTrapezTrainingAdvanced(message: string): string {
  const keywords = ['трапеция продвинутый', 'trapezius advanced', 'шраги', 'верхняя трапеция', 'средняя трапеция', 'нижняя трапеция'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💎 ТРЕНИРОВКА ТРАПЕЦИИ — ПРОДВИНУТЫЙ ГАЙД:

📊 Анатомия (3 части — 3 функции):
• **Верхняя**: подъём лопаток → шраги
• **Средняя**: сведение лопаток → тяги к груди, face pull
• **Нижняя**: опускание лопаток → подтягивания широким хватом, Y-подъёмы

📋 Полная программа (все 3 части):

**Верхняя трапеция (визуальный объём):**
1. Шраги со штангой: 4×10-12, пауза 2 сек вверху
2. Шраги с гантелями (наклон 10°): 3×12-15
3. Фермерская прогулка: 3×40м с тяжёлыми гантелями
- Совет: НЕ вращай плечами — строго вверх-вниз

**Средняя трапеция (толщина спины):**
1. Тяга штанги в наклоне (хват шире плеч): 4×8-10
2. Face pull с ротацией: 3×15-20
3. Тяга к груди сидя в тренажёре: 3×12-15
- Совет: задержка 1-2 сек в сокращённом положении

**Нижняя трапеция (здоровье плеч):**
1. Y-подъёмы на наклонной скамье: 3×12-15
2. Шраги на наклонной скамье лицом вниз: 3×12-15
3. Подтягивания широким хватом (фокус на опускание лопаток): 3×8-10
- Совет: легче всего забыть — но критично для осанки!

⚡ Частота: верхняя = 2 раза/нед (быстро восстанавливается), средняя = с каждой тягой спины, нижняя = 2-3 раза/нед как корректирующее.
`;
}
export function getLandminePressAdvancedGuide(message: string): string {
  const keywords = ['лэндмайн жим', 'landmine press', 'жим штанги в угол', 'жим в угол', 'landmine упражнения'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚔️ ЛЭНДМАЙН (LANDMINE) — ПРОДВИНУТЫЕ УПРАЖНЕНИЯ:

📊 Почему лэндмайн отличный инструмент:
• Дуговая траектория → натуральнее для плечевого сустава
• Одностороння работа → коррекция дисбаланса + кор
• Нейтральный хват → безопасно для плеч
• Комбинация жимовых и тяговых движений

📋 Топ-8 упражнений:

**Жимовые:**
1. **Landmine press стоя** (одной рукой): 3×10-12/руку
   - Акцент: передняя дельта + верх груди + трицепс
   - Техника: пресс напряжён, не поворачивай корпус
2. **Landmine press с колена**: 3×10-12/руку
   - Акцент: антиротация кора + дельты
3. **Landmine floor press**: 3×8-10
   - Акцент: трицепс + грудь (меньше ROM = больше нагрузки на трицепс)

**Тяговые:**
4. **Landmine row (Meadows row)**: 3×10-12/руку
   - Акцент: широчайшие + ромбовидные
5. **Landmine T-bar row**: 4×8-10
   - Акцент: толщина спины

**Нижняя часть тела:**
6. **Landmine squat**: 3×12-15
   - Акцент: квадрицепсы (вертикальный торс)
7. **Landmine RDL**: 3×10-12/нога
   - Акцент: бицепс бедра + ягодичные

**Полное тело:**
8. **Landmine thruster**: 3×8-10
   - Присед → жим = метаболический взрыв

💡 Установка: специальный landmine-адаптер или угол стены (оберни конец штанги полотенцем).
Прогрессия: добавляй вес на свободный конец штанги по 2.5-5кг.
`;
}
export function getTrainingDiaryOptimization(message: string): string {
  const keywords = ['дневник тренировок', 'training diary', 'training log', 'записывать тренировки', 'лог тренировок', 'отслеживание прогресса'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📓 ДНЕВНИК ТРЕНИРОВОК — ОПТИМИЗАЦИЯ:

📊 Зачем вести дневник (доказано):
• Атлеты с дневником прогрессируют на 30-50% быстрее (отчётность)
• Объективные данные vs «мне кажется, я стал сильнее»
• Позволяет выявить паттерны: что работает, что нет
• Мотивация: видишь прогресс за месяцы/годы

📋 Что записывать (минимум):
1. **Дата и время** тренировки
2. **Упражнение**: название, вариация
3. **Подходы × Повторы × Вес**: каждый рабочий подход
4. **RPE / RIR**: субъективная оценка тяжести
5. **Заметки**: самочувствие, боли, технические ощущения

📋 Что записывать (продвинутый):
6. **Общий тоннаж** (вес × повторы × подходы)
7. **Отдых между подходами**
8. **Настроение/энергия** (шкала 1-5)
9. **Сон накануне** (часы и качество)
10. **Питание** (калории, белок)

📊 Как анализировать дневник:

**Еженедельно:**
- Общий объём по группам мышц (подходы)
- Прогрессия нагрузки (больше вес/повторы/подходы?)
- Соотношение жимы:тяги (цель 1:1 или 1:1.5)

**Ежемесячно:**
- Тренд силовых показателей (растёт → хорошо, стоит → менять программу)
- Частота тренировок и пропусков
- Корреляция сна/настроения с производительностью

💡 Giron автоматически ведёт дневник! Все данные сохраняются, строятся графики и тренды.
Используй AI-ассистента (Iron Coach) для анализа — спроси «как мой прогресс?»
`;
}
export function getGripStrengthMasterclass(message: string): string {
  const keywords = ['хват', 'grip', 'сила хвата', 'предплечья хват', 'кистевой эспандер', 'становая хват', 'farmer', 'фермерская прогулка'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🤝 СИЛА ХВАТА — ПОЛНЫЙ МАСТЕР-КЛАСС:

Хват — лимитирующий фактор во многих упражнениях (становая, подтягивания, тяги).

🔬 Анатомия хвата:
- **Сгибатели пальцев** (flexor digitorum) — основная сила сжатия
- **Разгибатели** (extensor digitorum) — баланс и здоровье суставов
- **Лучевой сгибатель** (brachioradialis) — пронация/супинация
- **Длинная ладонная** — стабилизация запястья

📊 Типы хвата:
1. **Crushing grip** (сжатие) — эспандер, сжатие штанги
2. **Pinch grip** (щипок) — удержание блинов пальцами
3. **Support grip** (удержание) — вис на турнике, фермерская прогулка
4. **Wrist strength** (запястье) — сгибание/разгибание с гантелей

💪 Программа развития хвата (3 раза/неделю):

**День A — Сжатие:**
- Кистевой эспандер: 3×15-20 (каждая рука)
- Сжатие толстого грифа: 3×30 сек
- Скручивание полотенца: 3×20 сек

**День B — Удержание:**
- Фермерская прогулка: 3×30м с макс. весом
- Вис на турнике: 3× до отказа
- Dead hang одной рукой: 3×10-15 сек

**День C — Щипок + запястье:**
- Щипковый хват блинов: 3×20 сек
- Сгибание запястий с гантелей: 3×15
- Разгибание запястий: 3×15
- Вращение кисти с грузом на верёвке: 2×5

📈 Прогрессия:
- Начинай с лёгких эспандеров (20-30 кг)
- Увеличивай время удержания на 5 сек/неделю
- Фермерская прогулка: +2.5 кг/неделю
- Цель: вис 90+ сек, фермерская прогулка с 50%+ массы тела в каждой руке

⚡ Лайфхаки:
- **Fat Gripz** (утолщители грифа) — надевай на гантели для автоматической тренировки хвата
- **Полотенце на турнике** — подтягивания на полотенце = хват + спина
- **Становая без лямок** — тренирует support grip
- **Рис в ведре** — погружай руку и сжимай рис (старый метод борцов)
`;
}
export function getBulgarianSplitSquatMaster(message: string): string {
  const keywords = ['болгарские приседания мастер', 'bulgarian split squat advanced', 'сплит присед продвинутый', 'выпады болгарские наука', 'одноногие приседания'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🇧🇬 БОЛГАРСКИЕ СПЛИТ-ПРИСЕДАНИЯ — МАСТЕР-КЛАСС:

Одно из лучших унилатеральных упражнений для ног. Убирает дисбалансы, развивает стабильность, щадит поясницу.

🔬 Преимущества перед обычными приседаниями:
- ↓ осевая нагрузка на позвоночник (меньший вес, та же нагрузка на ноги)
- ↑ амплитуда для ягодичных (глубже растяжка)
- Коррекция мышечных дисбалансов (лево/право)
- Развитие баланса и проприоцепции
- Исследование (Speirs, 2016): ЭМГ ягодичных сопоставима с приседанием, но с вдвое меньшим весом

📐 Техника выполнения:
1. **Скамья** позади, высота ~40-45 см (середина голени)
2. Встань в шаге от скамьи, подъём задней стопы на скамью
3. **Передняя нога** — голень вертикально, колено над стопой
4. Опускайся до угла 90° в переднем колене (или глубже)
5. **Торс** вертикально, взгляд вперёд
6. Поднимайся через пятку передней ноги

🎯 Варианты нагрузки:

**Для новичков:**
- С собственным весом, держась за опору
- 3×10 каждая нога

**Средний уровень:**
- С гантелями в руках
- 3×12 каждая нога
- Вес: 30-50% от приседа

**Продвинутый:**
- Со штангой на спине
- С гантелью в одной руке (контралатерально)
- С паузой 2 сек в нижней точке
- С дефицитом (передняя нога на подставке 5-10 см)

⚠️ Типичные ошибки:
- Слишком короткий шаг (колено уходит за носок)
- Слишком длинный шаг (задняя нога перегружена)
- Наклон торса вперёд (нагрузка на поясницу)
- Заваливание колена внутрь (valgus)

📊 Программирование:
- **Гипертрофия:** 3-4×8-12, RIR 2-3
- **Сила:** 4×5-6 со штангой
- **Выносливость:** 3×15-20 с лёгкими гантелями
- **Частота:** 2 раза/неделю с 48+ часов отдыха

💡 Hack: если баланс — проблема, начни с сплит-приседаний без скамьи (задняя нога на полу), затем прогрессируй к болгарским.
`;
}
export function getBreathingTechniquesLifting(message: string): string {
  const keywords = ['дыхание при подъёме', 'breathing lifting', 'вальсальва', 'valsalva', 'когда дышать', 'задержка дыхания жим', 'дыхание приседания'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🌬️ ТЕХНИКА ДЫХАНИЯ ПРИ СИЛОВЫХ УПРАЖНЕНИЯХ:

Правильное дыхание — это стабилизация кора, безопасность позвоночника и увеличение силы на 10-15%.

🔬 Манёвр Вальсальвы — золотой стандарт:

**Что это:** глубокий вдох → задержка дыхания → напряжение пресса → выполнение повторения → выдох.

**Механизм:**
1. Вдох повышает внутрибрюшное давление (intra-abdominal pressure, IAP)
2. IAP стабилизирует позвоночник как "воздушная подушка"
3. Исследования: IAP ↑ на 40-50% при Вальсальве vs обычное дыхание
4. Сила ↑ на 10-15% за счёт лучшей стабилизации

📋 Пошаговая техника:

**Для тяжёлых базовых (присед, становая, жим):**
1. Стоя с весом — глубокий вдох через нос (в живот, не в грудь!)
2. Напряги пресс, как будто готовишься к удару
3. Задержи дыхание
4. Выполни эксцентрическую фазу (опускание)
5. Выполни концентрическую фазу (подъём)
6. Выдохни в верхней точке (после прохождения мёртвой точки)
7. Повтори для каждого повторения

**Для изоляции (бицепс, трицепс, разводки):**
- Выдох на усилии (концентрическая фаза)
- Вдох на расслаблении (эксцентрическая фаза)
- Задержка дыхания НЕ нужна

⚡ Bracing (напряжение кора):
- Представь, что надеваешь тугой пояс — расширяй живот на 360°
- Не втягивай живот — РАЗДУВАЙ его
- Пресс, косые, поясничные — всё напряжено одновременно
- Тренировка: ложись на спину, клади руки на живот, дыши "в руки"

⚠️ Безопасность Вальсальвы:
- Кратковременно повышает артериальное давление (до 300+ мм рт.ст.)
- **Противопоказания:** гипертония, аневризмы, глаукома, беременность
- При проблемах с давлением — выдыхай через сжатые губы (частичная Вальсальва)
- Не задерживай дыхание дольше 3-4 сек

📊 Когда какое дыхание:
| Упражнение | Тип дыхания | Момент выдоха |
|-----------|-------------|---------------|
| Присед (80%+) | Вальсальва | Верхняя точка |
| Становая | Вальсальва | Локаут |
| Жим лёжа | Вальсальва/обычный | Верх |
| Жим стоя | Вальсальва | Локаут |
| Подтягивания | Обычный | Подъём |
| Бицепс | Обычный | Сгибание |
`;
}
export function getSeatedLegCurlScience(message: string): string {
  const keywords = ['сгибание ног сидя', 'seated leg curl', 'задняя поверхность бедра тренажёр', 'хамстринги тренажёр', 'leg curl наука'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🦵 СГИБАНИЕ НОГ СИДЯ — НАУЧНЫЙ ПОДХОД:

Сгибание ног сидя vs лёжа — не одно и то же! Сидячий вариант растягивает бицепс бедра сильнее (бедро согнуто), что даёт ↑ гипертрофию.

🔬 Биомеханика:
- Бицепс бедра — двусуставная мышца (тазобедренный + коленный)
- **Сидя:** тазобедренный согнут → бицепс бедра растянут → длинная головка работает сильнее
- **Лёжа:** тазобедренный разогнут → бицепс бедра укорочен → акцент на короткой головке
- Исследование (Maeo, 2021): сгибание сидя → +14% гипертрофии vs лёжа (за 12 недель!)

📐 Техника выполнения:
1. Сядь, спина прижата к спинке
2. Валик — на нижней части голени (чуть выше ахилла)
3. Колени на краю сиденья (не свисают!)
4. Плавно сгибай колени до максимального сокращения
5. Задержи пиковое сокращение на 1 сек
6. Медленно возвращай (3-4 сек негативная фаза)
7. Не разгибай полностью — сохраняй напряжение

⚠️ Частые ошибки:
- Отрыв спины от спинки (компенсация тазом)
- Рывки и использование инерции
- Слишком быстрая негативная фаза
- Разгибание коленей до полного lockout (потеря напряжения)

📊 Программирование:
| Цель | Подходы × Повторения | Темп | Отдых |
|------|---------------------|------|-------|
| Гипертрофия | 3-4×10-15 | 2-0-1-2 | 90 сек |
| Растяжение под нагрузкой | 3×8-12 + 20 сек stretch | 3-0-1-3 | 120 сек |
| Пампинг (финишер) | 2×20-25 | 1-0-1-1 | 60 сек |
| Силовая выносливость | 3×15-20 | 2-0-1-0 | 60 сек |

💡 Продвинутые техники:
- **Unilateral** (одной ногой): устранение дисбалансов
- **Partials в растянутой позиции:** верхние 1/3 амплитуды (максимальное растяжение)
- **Drop-set:** полный вес → -20% → -20% → отказ
- **Iso-hold:** задержка в сокращённой позиции на 10-15 сек после подхода

🔄 Место в программе:
- После тяжёлых тяг и приседаний (добивка задней поверхности)
- Суперсет: сгибание ног сидя + разгибание ног = полная нагрузка на бедро
- Минимум 10-15 подходов на заднюю поверхность в неделю для оптимальной гипертрофии
`;
}
export function getShiftWorkTrainingGuide(message: string): string {
  const keywords = ['сменный график тренировка', 'shift work training', 'ночная смена спорт', 'работа сутки тренировка', 'вахта тренировка'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🔄 ТРЕНИРОВКИ ПРИ СМЕННОМ ГРАФИКЕ — РУКОВОДСТВО:

Сменная работа нарушает циркадные ритмы → гормональный сбой → сложнее тренироваться и восстанавливаться.

🔬 Проблемы сменного графика:
- **Мелатонин** — нарушен ритм выработки → плохой сон
- **Кортизол** — пиковый уровень в неправильное время → ↑ катаболизм
- **Тестостерон** ↓ на 15-25% при хроническом нарушении сна
- **Гормон роста** — выделяется в глубоком сне, которого меньше при сменном графике
- **Инсулинорезистентность** ↑ → хуже набор мышц, легче набор жира

📋 Стратегии по типу графика:

**2/2 (два дня/две ночи) или 3/3:**
- Тренируйся в выходные дни (после отдыха)
- В рабочие дни — максимум лёгкое кардио
- Силовые: 3 раза/неделю в дни отдыха

**Сутки через трое:**
- День после суток — ПОЛНЫЙ ОТДЫХ (только сон)
- 2-й день — лёгкая тренировка (если выспался)
- 3-й день — полноценная силовая
- День перед сменой — тренировка утром

**Ночные смены постоянно:**
- Тренируйся ДО смены (за 3-4 часа до работы)
- Или СРАЗУ после смены (если не слишком устал)
- Никогда не тренируйся вместо сна!

⏰ Оптимальное время:
- **После пробуждения + 2-3 часа** — температура тела ↑, координация в норме
- Не тренируйся сразу после пробуждения (диски позвоночника набухшие, ↑ риск травм)
- Не тренируйся в «мёртвую зону» (3-5 утра) — минимальная производительность

🍽️ Питание при сменном графике:
- **Белок** при каждом приёме пищи (стабилизация сахара)
- **Кофеин** — не позже чем за 6 часов до сна
- Лёгкая еда перед сменой, основные приёмы — в период бодрствования
- Meal prep — готовь еду заранее (на смене нет нормальной еды)

💤 Сон — приоритет #1:
- Затемнение спальни (blackout шторы)
- Беруши + маска для сна
- Температура 18-20°C
- Мелатонин 0.5-1 мг за 30 мин до сна (при дневном сне)
- Минимум 7 часов сна (даже если в 2-3 блока)

📊 Адаптация программы:
- ↓ объём на 20-30% (меньше подходов)
- ↓ частота: 3 раза/неделю максимум
- Приоритет: базовые упражнения (больше эффекта за меньшее время)
- Full body или Upper/Lower split (гибче по расписанию)
`;
}
export function getHexBarDeadliftGuide(message: string): string {
  const keywords = ['трэп гриф', 'hex bar', 'trap bar', 'становая трэп', 'шестиугольный гриф', 'трап гриф становая'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
⬡ СТАНОВАЯ С ТРЭП-ГРИФОМ (HEX BAR) — ПОЛНЫЙ ГАЙД:

Трэп-гриф — безопасная альтернатива классической становой. Центр тяжести ближе к телу → меньше нагрузка на поясницу.

🔬 Преимущества vs классическая становая:
- ↓ нагрузка на поясницу на 25-30% (Swinton, 2011)
- ↑ мощность (можно тянуть быстрее и взрывнее)
- Нейтральный хват → удобнее для плеч и запястий
- Проще техника (меньше шансов ошибиться)
- ↑ активация квадрицепсов (гибрид между становой и приседом)

📊 Сравнение ЭМГ-активации:

| Мышца | Классическая | Трэп-гриф |
|-------|-------------|-----------|
| Разгибатели спины | +++++ | +++ |
| Квадрицепс | ++ | ++++ |
| Ягодичные | ++++ | ++++ |
| Бицепс бедра | ++++ | +++ |
| Трапеция | +++ | ++++ |

📐 Техника выполнения:
1. Встань в центр грифа, стопы на ширине бёдер
2. Присядь, возьмись за ручки нейтральным хватом
3. **Грудь вверх, лопатки назад, спина нейтральная**
4. Давление через пятки + середину стопы
5. Выпрямляйся, разгибая колени и тазобедренный одновременно
6. Локаут: полное разгибание, плечи назад
7. Опускание: отведи таз назад, сгибай колени

🎯 Два варианта хвата:

**Высокие ручки (стандарт):**
- Меньшая амплитуда → можно взять больший вес
- Больше похоже на приседание
- Для новичков и тех, кому нужна безопасность

**Низкие ручки (перевёрнутый гриф):**
- Полная амплитуда как в классической становой
- Больше нагрузка на заднюю цепь
- Для продвинутых

📊 Программирование:
- **Сила:** 5×3-5 при 80-90% от 1ПМ, отдых 3-5 мин
- **Мощность:** 5-6×2-3 при 60-75%, взрывное выполнение
- **Гипертрофия:** 3-4×8-12 при 65-75%, отдых 90-120 сек

🏆 Кому особенно подходит:
- Новичкам (проще техника, безопаснее)
- Высоким людям (пропорции тела не мешают)
- Спортсменам (тренировка мощности)
- При проблемах с поясницей (↓ стресс на L4-L5)
- При проблемах с хватом (нейтральный хват комфортнее)
`;
}
export function getFacePullMasterclass(message: string): string {
  const keywords = ['face pull мастеркласс', 'face pull продвинутый техника', 'фейс пул наука', 'тяга к лицу продвинутый', 'face pull ротаторы'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🎯 FACE PULL (ТЯГА К ЛИЦУ) — МАСТЕР-КЛАСС:

Face pull — одно из лучших упражнений для здоровья плеч, осанки и баланса мышц верхней части тела.

🔬 Почему face pull так важен:
- Современные программы перегружены жимами (жим лёжа, жим стоя, отжимания)
- Дисбаланс «жимы > тяги» → внутренняя ротация плеч → импинджмент
- Face pull тренирует задние дельты + внешние ротаторы → исправляет баланс
- Исследование: добавление face pull ↓ травмы плеча на 40% у жимовиков

📐 Мышцы-мишени:
- **Задняя дельта** — основная
- **Infraspinatus** (подостная) — внешний ротатор
- **Teres minor** (малая круглая) — внешний ротатор
- **Средняя трапеция** — ретракция лопаток
- **Ромбовидные** — стабилизация лопаток

📋 Техника (эталонная):
1. Верхний блок, канатная рукоять на уровне лица
2. Хват — нейтральный, ладони друг к другу
3. Шаг назад, лёгкий наклон назад (10-15°)
4. Тяни к лицу, РАЗВОДЯ руки в стороны
5. В конечной точке: локти выше плеч, руки в позиции «double bicep pose»
6. **Ключ:** внешняя ротация — поворачивай кулаки назад в верхней точке
7. Задержи на 1-2 сек (пиковое сокращение)
8. Медленно верни (3 сек негативная)

⚠️ Критические ошибки:
- Тяга к груди вместо лица (другое упражнение!)
- Отсутствие внешней ротации (главный компонент!)
- Слишком тяжёлый вес (компенсация трапециями)
- Рывки и инерция (потеря контроля)
- Приведение лопаток без ротации (неполная работа ротаторов)

📊 Варианты:

**1. С канатом на верхнем блоке** (стандарт)
- 3-4×15-20, вес 10-25 кг
- Основной вариант для большинства

**2. С резиновой лентой** (разминка)
- Привяжи на уровне лица
- 2×20-25 перед каждой тренировкой верха
- Идеально для разогрева ротаторов

**3. Лёжа лицом вниз на наклонной** (с гантелями)
- Скамья 30-45°, лечь лицом вниз
- Разведение с внешней ротацией
- Убирает инерцию и читинг

📊 Место в программе:
- **Минимум:** 2 раза/неделю, 3-4×15-20
- **Оптимально:** каждую тренировку верха, 100+ повторений в неделю
- Соотношение жимов к face pull: на каждый жимовой подход — 1 подход face pull
- Вес: лёгкий/средний (контроль > сила)
`;
}
export function getPecDeckFlyScience(message: string): string {
  const keywords = ['pec deck', 'бабочка тренажёр', 'пек дек', 'сведение рук в тренажёре', 'бабочка грудь', 'butterfly machine'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🦋 PEC DECK (БАБОЧКА) — НАУЧНЫЙ ПОДХОД:

Pec deck — изолирующий тренажёр для грудных мышц. Преимущество: постоянное напряжение во всей амплитуде + безопасность.

🔬 Биомеханика:
- Движение: горизонтальное приведение плеча (как обнимание)
- Фиксированная траектория → убирает работу стабилизаторов
- ЭМГ: активация грудных на уровне жима лёжа (Trebs, 2010)
- Пиковое сокращение сильнее, чем у гантельных разводок

📐 Два типа тренажёра:

**1. С подушками для предплечий:**
- Локти на уровне плеч, предплечья прижаты к подушкам
- Угол в локтях ~90°
- Проще контролировать, меньше нагрузка на плечи
- Подходит новичкам

**2. С ручками (вытянутые руки):**
- Хват за ручки, руки почти прямые (лёгкий сгиб в локтях)
- Больше амплитуда → больше растяжка грудных
- Больше нагрузка на сухожилия → требует разогрева
- Для среднего/продвинутого уровня

📋 Техника выполнения:
1. Сядь, спина прижата к спинке, лопатки сведены
2. Высота сиденья: ручки/подушки на уровне середины груди
3. Начальная позиция: руки разведены, грудные растянуты (но без боли!)
4. Плавно своди руки перед собой, фокусируясь на сжатии груди
5. В конечной точке: максимальное сжатие, пауза 1-2 сек
6. Медленно возвращай (3 сек), контролируя растяжку
7. НЕ позволяй весу «падать» — сохраняй напряжение

⚠️ Ошибки:
- Слишком большая амплитуда назад (→ стресс на плечи)
- Отрыв спины от спинки
- Рывки и инерция (особенно в начале движения)
- Слишком быстрая негативная фаза
- Выпрямление рук полностью (включает трицепс)

📊 Программирование:
- **Гипертрофия:** 3-4×12-15, темп 2-1-3-0, отдых 60-90 сек
- **Пампинг (финишер):** 2-3×15-20, лёгкий вес, фокус на сжатии
- **Дроп-сет:** 3 дропа без отдыха, последний — до отказа
- **21s:** 7 нижняя половина + 7 верхняя половина + 7 полная амплитуда

💡 Место в программе:
- После тяжёлых жимов (добивка грудных)
- Суперсет: pec deck + разведение гантелей на наклонной скамье
- 2-3 раза/неделю, не перегружай (изоляция восстанавливается быстро)
`;
}
export function getTallPeopleTraining(message: string): string {
  const keywords = ['высокий рост тренировка', 'tall people training', 'тренировка 190', 'длинные рычаги', 'высокий рост присед', 'длинные ноги тренировка'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
📏 ТРЕНИРОВКИ ДЛЯ ВЫСОКИХ ЛЮДЕЙ (185+ СМ) — СПЕЦИАЛЬНЫЙ ГАЙД:

Стандартные программы и техники рассчитаны на людей среднего роста (170-180 см). Высоким нужны модификации.

🔬 Биомеханические особенности:
- **Длинные рычаги** → больший момент силы → меньший вес при том же усилии
- **Больший ROM** (амплитуда) → больше работа на повторение
- **Центр тяжести** выше → труднее балансировать
- **Длинные бёдра** → присед глубже и тяжелее
- **Длинные руки** → жим лёжа с большей амплитудой, но становая легче

📊 Как рост влияет на упражнения:

| Упражнение | Проблема для высоких | Решение |
|-----------|---------------------|---------|
| Присед | Длинные бёдра → наклон корпуса | Широкая стойка, штангетки |
| Жим лёжа | Длинные руки → большая амплитуда | Арка, более широкий хват |
| Становая | ✅ Преимущество! Длинные руки | Наслаждайся |
| Жим стоя | Длинный путь → меньший вес | Фокус на технику |
| Подтягивания | Длинные руки → больше работа | Начинай с негативных |

🏋️ Модификации приседа для высоких:

1. **Широкая стойка** (low bar): ↓ наклон корпуса, ↓ нагрузка на колени
2. **Штангетки** (обувь с каблуком): компенсирует плохую мобильность голеностопа
3. **Safety squat bar** (SSB): ↓ нагрузка на плечи и поясницу
4. **Фронтальный присед:** заставляет держать торс вертикально
5. **Goblet squat** для разучивания паттерна
6. **Ящик (box squat):** контроль глубины, обучение «садиться назад»

📐 Модификации жима лёжа:
- **Широкий хват** (81 см или шире) — ↓ амплитуда
- **Арка** в грудном отделе — ↓ амплитуда на 3-5 см
- **Ноги ближе к тазу** — лучший leg drive
- **Floor press** — ограничение амплитуды (для гипертрофии)

💡 Общие рекомендации:
- **Не сравнивай веса** с людьми среднего роста — твои рычаги длиннее
- **Темп важнее веса** — контролируй движение по всей (большей) амплитуде
- **Тренажёры** — твои друзья (фиксированная траектория, безопасность)
- **Паузы** в нижних точках — развивают силу в самой сложной позиции
- **Гипертрофия** визуально сложнее — мышцы «размазаны» по длинным костям
- **Калорийность ↑** — больше тело = больше BMR = больше еды

📊 Программа для высокого (пример Push):
1. Жим лёжа (широкий хват, арка): 4×6-8
2. Жим гантелей на наклонной: 3×10-12
3. Жим в Hammer Strength machine: 3×10-12
4. Разводки в кроссовере (средний блок): 3×15
5. Жим гантелей сидя: 3×10-12
6. Подъёмы через стороны: 3×15
`;
}
export function getWarmUpProtocolComplete(message: string): string {
  const keywords = ['разминка полная', 'warm up protocol', 'как разминаться', 'разминка перед силовой', 'подготовка к тренировке'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🔥 ПОЛНЫЙ ПРОТОКОЛ РАЗМИНКИ ПЕРЕД СИЛОВОЙ:

Разминка ↑ температуру мышц на 1-2°C → ↑ скорость нервных импульсов → ↑ сила на 5-10%, ↓ травмы на 50%.

🔬 Наука разминки:
- ↑ температура мышц → ↑ эластичность (↓ вязкость)
- ↑ кровоток → ↑ доставка кислорода и нутриентов
- ↑ синовиальная жидкость → суставы работают плавнее
- ↑ нервная проводимость → лучшая координация
- Психологическая настройка на тренировку

📋 5-этапный протокол (15-20 мин):

**Этап 1: Общее кардио (3-5 мин)**
- Лёгкий бег, велотренажёр, эллипс или скакалка
- ЧСС 110-130 (лёгкая потливость)
- Цель: ↑ температура ядра тела, ↑ кровоток

**Этап 2: Foam Rolling (3-5 мин)**
- Целевые мышцы дня: 30-60 сек на каждую
- Push день: грудные, дельты, трицепс, верх спины
- Pull день: широчайшие, ромбовидные, бицепс
- Legs день: квадрицепс, задняя, ягодичные, икры
- Давление: умеренное (не до боли!)

**Этап 3: Динамическая растяжка (3-5 мин)**
- НЕ статическая! (статическая ↓ силу на 5-10%)
- Push: круговые вращения рук, разведения, пуловер без веса
- Pull: повороты торса, кошка-корова, скорпион
- Legs: махи ногами, выпады с поворотом, приседания без веса

**Этап 4: Активация (2-3 мин)**
- Push: band pull-apart, face pull с резинкой, отжимания от стены
- Pull: ретракция лопаток, мёртвый вис, обратные снежные ангелы
- Legs: глют-бридж, monster walks с резинкой, приседания на одной ноге

**Этап 5: Специфическая разминка (3-5 мин)**
- Рабочее упражнение с прогрессией веса:
  - Пустой гриф: 15 повторений
  - 40% рабочего: 10 повторений
  - 60% рабочего: 5 повторений
  - 80% рабочего: 3 повторения
  - 90% рабочего: 1-2 повторения
  - → Рабочие подходы

⚠️ Что НЕ делать:
- Статическая растяжка перед силовой (↓ сила, ↓ мощность)
- Слишком долгое кардио (>10 мин) — устанешь
- Пропуск разминки «чтобы сэкономить время»
- Одинаковая разминка каждый день (адаптируй под тренировку)
`;
}
export function getTrainingWithArthritis(message: string): string {
  const keywords = ['артрит тренировка', 'arthritis training', 'суставы болят тренировка', 'остеоартрит спорт', 'артроз упражнения'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🦴 ТРЕНИРОВКИ ПРИ АРТРИТЕ/АРТРОЗЕ — БЕЗОПАСНЫЙ ПОДХОД:

Артрит — НЕ противопоказание к тренировкам. Правильно подобранная нагрузка ↓ боль и ↑ функцию суставов.

🔬 Что происходит при артрите:
- **Остеоартрит (артроз):** разрушение хряща, костные наросты
- **Ревматоидный артрит:** аутоиммунное воспаление суставов
- В обоих случаях: боль, скованность, ↓ амплитуда

📊 Почему тренировки ПОМОГАЮТ:
- ↑ синовиальная жидкость (смазка суставов) при движении
- ↑ сила мышц вокруг сустава → ↓ нагрузка на сустав
- ↓ воспаление (парадоксально: умеренная нагрузка = противовоспалительный эффект)
- ↓ боль на 25-40% (мета-анализ Cochrane, 2015)
- ↑ мобильность и качество жизни

📋 Правила тренировки:

**Общие принципы:**
- Начинай легко, прогрессируй медленно
- Никогда не тренируйся через острую боль (тупая → допустимо)
- Разминка: 10-15 мин (больше обычного!)
- Амплитуда: комфортная, не форсируй
- Машины > свободные веса (контролируемая траектория)

**При артрите коленей:**
✅ Рекомендовано:
- Жим ногами (плавная амплитуда, ↓ осевая нагрузка)
- Разгибание ног (частичная амплитуда, без полного разгибания)
- Мини-приседания (до 45°, не глубокие)
- Велотренажёр (низкое сопротивление)
- Ходьба в бассейне (гидроневесомость)

❌ Избегай:
- Глубокие приседания с весом
- Выпады (↑ нагрузка на колено)
- Прыжки и плиометрика
- Бег по асфальту

**При артрите плеч:**
✅ Рекомендовано:
- Жим в машине (Hammer Strength)
- Боковые подъёмы с лёгким весом
- Тяги в тренажёрах (контролируемая амплитуда)
- Разминка с резинками перед каждой тренировкой

❌ Избегай:
- Жим из-за головы
- Тяга верхнего блока за голову
- Upright row (тяга к подбородку)

💊 Дополнительная поддержка:
- Коллаген: 10-15 г/день + витамин C
- Омега-3: 2-3 г EPA+DHA (↓ воспаление)
- Куркумин: 500-1000 мг (↓ боль)
- Глюкозамин + хондроитин: 1500+1200 мг (спорно, но безопасно)
- Тепло перед тренировкой, холод после (если отёк)
`;
}
export function getDetrainingRetrainingGuide(message: string): string {
  const keywords = ['детренированность', 'detraining', 'перерыв в тренировках', 'возврат после перерыва', 'растренированность', 'потеря формы', 'вернуться после паузы', 'давно не тренировался', 'пропустил тренировки'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔄 ДЕТРЕНИРОВАННОСТЬ И ВОЗВРАТ К ТРЕНИРОВКАМ:

**Что теряется и когда:**
- **1-2 недели без тренировок:**
  - Сила: практически не теряется (−0-3%)
  - Мышечная масса: сохраняется
  - Гликоген: ↓ на 20-30% → мышцы «сдуваются» визуально
  - Кардио: VO₂max ↓ на 5-7%

- **2-4 недели:**
  - Сила: ↓ 5-10% (нейромышечная адаптация снижается)
  - Масса: ↓ 1-3% (в основном гликоген и вода)
  - Кардио: VO₂max ↓ 10-15%
  - Гибкость: заметно снижается

- **1-3 месяца:**
  - Сила: ↓ 15-25% (структурные адаптации начинают уходить)
  - Масса: ↓ 5-10% реальной мышечной ткани
  - Кардио: VO₂max ↓ 20-30%
  - Капилляризация: ↓ 10-15%

- **6+ месяцев:**
  - Сила: ↓ 30-50%
  - Масса: значительная потеря, но мышечная память сохраняется!
  - Кардио: возвращение к нетренированному уровню
  - Нейромышечные связи: ослабевают, но не исчезают

**Мышечная память — почему возврат быстрее:**
- Миоядра (ядра мышечных клеток) НЕ теряются при атрофии
- При возобновлении тренировок — ядра уже на месте
- Ресинтез белка идёт в 2-3 раза быстрее, чем у новичка
- Нейромышечные паттерны восстанавливаются за дни
- Полный возврат формы = 50-70% от времени потери

**Протокол возврата после перерыва:**
- **После 1-2 недель:** начни с 90% привычных весов, объём 100%
- **После 2-4 недель:** начни с 70-80% весов, 80% объёма, +10%/неделю
- **После 1-3 месяцев:** начни с 50-60% весов, 60% объёма, +10%/неделю
- **После 6+ месяцев:** как «продвинутый новичок» — линейная прогрессия

**Важные правила возврата:**
- Первые 2 недели — НЕ тренируйся до отказа (DOMS будет жёсткий)
- Увеличивай объём раньше интенсивности
- Каждую неделю добавляй не более 10-15% нагрузки
- Пей больше воды — мышцы восстанавливают гидратацию
- Сон 7-9 часов — критичен для ресинтеза миоядер
- Белок 1.8-2.2 г/кг — поддержка восстановления массы
`;
}
export function getInclinePressAngleMaster(message: string): string {
  const keywords = ['угол наклона жим', 'incline angle', 'наклон скамьи жим', 'угол скамьи', 'наклонный жим угол', '30 градусов жим', '45 градусов жим', 'верхняя часть грудных'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📐 УГЛЫ НАКЛОНА СКАМЬИ ПРИ ЖИМЕ — ПОЛНЫЙ ГАЙД:

**Влияние угла на активацию мышц (ЭМГ-данные):**

| Угол | Верх грудных | Середина | Низ | Дельты передние | Трицепс |
|------|-------------|----------|-----|-----------------|---------|
| −15° (decline) | 20% | 65% | 85% | 15% | 75% |
| 0° (flat) | 40% | 85% | 60% | 30% | 80% |
| 15° | 60% | 75% | 40% | 40% | 75% |
| **30°** | **80%** | **60%** | **25%** | **50%** | **70%** |
| 45° | 75% | 45% | 15% | 65% | 65% |
| 60° | 55% | 30% | 10% | 80% | 60% |
| 75°+ | 30% | 15% | 5% | 90% | 55% |

**Оптимальные углы по целям:**
- **Верх грудных (clavicular head):** 30° — золотой стандарт
  - 30° = максимальная активация ключичной порции
  - 15-30° — диапазон для акцента на верх
  - >45° — дельты перехватывают нагрузку

- **Общее развитие грудных:** 0° (горизонтальный)
  - Максимум общей активации грудных
  - Лучший потенциал для прогрессии весов
  - Основа любой программы для груди

- **Нижняя часть грудных:** −15° (decline)
  - Или отжимания на брусьях (лучше!)
  - Decline bench — спорный, можно заменить

**Практические рекомендации:**
- Включай 2-3 угла в программу для полного развития
- Основа: горизонтальный жим (сила и масса)
- Дополнение: 30° наклон (верх грудных)
- Опционально: decline или брусья (низ)
- Меняй углы каждый мезоцикл для разнообразия

**Нюансы по видам снаряда:**
- **Штанга наклонная:** 30° оптимально, можно 15-45°
- **Гантели наклонные:** 30-45° (больше ROM, меньше дельт)
- **Смит-машина наклонная:** 30° (стабилизация не нужна)
- **Кроссовер снизу:** имитация 30-45° наклона

**Ошибки при наклонном жиме:**
- Угол >45° → превращается в жим сидя (дельты доминируют)
- Подъём таза с наклонной скамьи → уменьшение реального угла
- Слишком широкий хват на наклонной → ↑ нагрузка на плечи
- Отсутствие ретракции лопаток → ↓ активация грудных
`;
}
export function getTrainingLongevityGuide(message: string): string {
  const keywords = ['тренировки долголетие', 'training longevity', 'тренировки для здоровья', 'спорт и долголетие', 'фитнес и старение', 'тренировки и возраст', 'здоровое старение', 'zone 2', 'зона 2'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧬 ТРЕНИРОВКИ ДЛЯ ДОЛГОЛЕТИЯ — НАУКА ЗДОРОВОГО СТАРЕНИЯ:

**Что говорит наука (мета-анализы 2020-2025):**
- Силовые тренировки: ↓ смертность на 15% (vs нетренирующиеся)
- Кардио (150 мин/неделю): ↓ смертность на 20-25%
- Силовые + кардио: ↓ смертность на 40% (!) — максимальный эффект
- Grip strength (сила хвата): лучший предиктор долголетия
- VO₂max: каждый +1 MET = ↓ риск смерти на 12%

**4 столпа тренировок для долголетия:**

1. **Силовые тренировки (2-3 раза/неделю):**
   - Поддержание мышечной массы (теряется 3-8% за декаду после 30)
   - Плотность костей (профилактика остеопороза)
   - Чувствительность к инсулину
   - Функциональная независимость в старости
   - Приоритет: приседания, становая, жим, тяги, подъёмы

2. **Zone 2 кардио (3-4 раза/неделю, 30-60 мин):**
   - Зона 2 = 60-70% от ЧССмакс (можешь говорить, но не петь)
   - Развитие митохондриальной функции
   - ↑ окисление жиров → метаболическое здоровье
   - ↓ воспаление, ↓ риск диабета 2 типа
   - Быстрая ходьба, лёгкий бег, велосипед, плавание

3. **VO₂max тренировки (1-2 раза/неделю):**
   - Интервалы: 4×4 мин при 85-95% ЧССмакс
   - Или 8×30 сек спринт + 90 сек отдых
   - VO₂max — главный биомаркер кардиореспираторного здоровья
   - ↓ на 10% каждую декаду — можно замедлить до 5%!

4. **Мобильность и баланс (ежедневно):**
   - 10-15 мин растяжки / йоги
   - Упражнения на баланс (стойка на одной ноге, болгарские выпады)
   - Профилактика падений (главная причина инвалидизации после 65)
   - Подвижность суставов — «смазка» для долголетия

**Ключевые биомаркеры долголетия для атлета:**
- VO₂max > 40 мл/кг/мин (мужчины) / > 35 (женщины) — «отлично»
- Grip strength > 40 кг (мужчины) / > 25 кг (женщины)
- Вставание с пола без рук — тест функциональности
- Приседание собственного веса на 5 повторений — минимум
- Висеть на перекладине > 60 сек — здоровье плеч и хвата

**Что избегать для долголетия:**
- Хроническое кардио >10 часов/неделю (↑ фиброз сердца)
- Экстремальные веса без прогрессии (травмы суставов)
- Полное отсутствие силовых (саркопения после 40)
- Сидячий образ жизни + «компенсация» 1 тренировкой (weekend warrior)
`;
}
export function getPeriodizationBlockGuide(message: string): string {
  const keywords = ['блочная периодизация', 'block periodization', 'блоковая периодизация', 'аккумуляция трансмутация реализация', 'фазы периодизации', 'мезоцикл планирование', 'периодизация для натурала'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📊 БЛОЧНАЯ ПЕРИОДИЗАЦИЯ — СИСТЕМНЫЙ ПОДХОД К ПРОГРЕССУ:

**Что такое блочная периодизация:**
- Разделение тренировочного цикла на фазы (блоки) с разными целями
- Каждый блок длится 2-6 недель
- Фокус на 1-2 качествах в каждом блоке (vs линейная — всё сразу)
- Автор концепции: Владимир Иссурин (израильский спортивный учёный)

**Три основных блока:**

**1. АККУМУЛЯЦИЯ (объёмный блок) — 3-4 недели:**
- Цель: набор мышечной массы, рабочая ёмкость
- Объём: высокий (14-20 подходов/мышцу в неделю)
- Интенсивность: умеренная (65-75% 1ПМ)
- Повторения: 8-15
- RPE: 6-8 (далеко от отказа)
- Отдых: 1.5-2.5 мин

**2. ТРАНСМУТАЦИЯ (интенсивный блок) — 3-4 недели:**
- Цель: преобразование объёма в силу
- Объём: средний (10-14 подходов/мышцу)
- Интенсивность: высокая (78-88% 1ПМ)
- Повторения: 4-8
- RPE: 7-9
- Отдых: 2-4 мин

**3. РЕАЛИЗАЦИЯ (пиковый блок) — 1-2 недели:**
- Цель: выход на пиковую силу / тест 1ПМ
- Объём: низкий (6-10 подходов/мышцу)
- Интенсивность: максимальная (88-100% 1ПМ)
- Повторения: 1-4
- RPE: 9-10
- Отдых: 3-5 мин

**+ РАЗГРУЗКА (деload) после каждого макроцикла — 1 неделя:**
- 50-60% объёма и интенсивности
- Восстановление соединительной ткани и ЦНС
- Психологическая перезагрузка

**Пример 12-недельного макроцикла:**
- Недели 1-4: Аккумуляция (объём, гипертрофия)
- Неделя 5: Деload
- Недели 6-9: Трансмутация (сила, мощность)
- Неделя 10: Деload
- Недели 11-12: Реализация (пиковая сила, тест 1ПМ)

**Блочная vs линейная периодизация:**
- Линейная: каждую неделю ↑ вес, ↓ повторения (для новичков)
- Блочная: фазы с разными целями (для среднего+ уровня)
- Блочная эффективнее для натуральных атлетов со стажем >2 лет
- Причина: «всё сразу» = ни одно качество не развивается максимально

**Для натурального атлета:**
- Аккумуляция — самый длинный блок (4 недели)
- Натуралу нужно больше объёма для роста
- Реализация — короткий (1-2 недели, иначе суставы страдают)
- Деload обязателен — натурал не восстанавливается как «химик»
- Смена блоков = ↓ риск застоя и ↑ мотивация
`;
}
export function getTrainingMinimalismGuide(message: string): string {
  const keywords = ['минимализм тренировок', 'training minimalism', 'минимум тренировок', 'эффективный минимум', 'мало времени тренировки', 'минимальная доза', 'минимальный объём', 'минимум упражнений'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 ТРЕНИРОВОЧНЫЙ МИНИМАЛИЗМ — МАКСИМУМ РЕЗУЛЬТАТА С МИНИМУМОМ:

**Минимальная эффективная доза (MED) — наука:**
- Для поддержания мышечной массы: 1/3 от набирающего объёма
- Для поддержания силы: 1 тяжёлая сессия в неделю
- Для минимального роста: 4-6 подходов/мышцу в неделю
- Для кардио-здоровья: 2×20 мин HIIT или 3×30 мин Zone 2

**Минимальная программа (3 дня/неделю, 30-45 мин):**

**День А — Жим:**
1. Жим лёжа или жим гантелей — 3×6-10
2. Жим стоя или сидя — 3×8-12
3. Отжимания на брусьях — 2×8-15
→ Грудь, дельты, трицепс — 8 рабочих подходов

**День Б — Тяга:**
1. Становая тяга или тяга штанги — 3×5-8
2. Подтягивания — 3×6-12
3. Тяга гантели в наклоне — 2×8-12
→ Спина, бицепс, задние дельты — 8 рабочих подходов

**День В — Ноги:**
1. Приседания — 3×6-10
2. Румынская тяга — 3×8-12
3. Выпады — 2×10-12 каждая нога
→ Квадрицепс, ягодичные, задняя поверхность — 8 подходов

**Правила минимализма:**
- Только компаунд-движения (многосуставные)
- Изоляция — только если есть явное отставание
- 2-3 упражнения за тренировку (не 6-8!)
- Каждый подход — качественный (RPE 7-9)
- Прогрессия: ↑ вес когда все повторения выполнены чисто

**Что можно убрать без потери результата:**
- ❌ 4-5 упражнений на бицепс (хватит 0-2, подтягивания работают)
- ❌ 3 варианта жима на грудь (хватит 1-2)
- ❌ Кардио после силовой «для жиросжигания» (питание важнее)
- ❌ Разминочные подходы по 10 мин (3-4 подхода к рабочему весу достаточно)
- ❌ Растяжка 20 мин (5-10 мин на проблемные зоны)

**Минимализм vs Объёмный тренинг:**
- Минимализм: 80% результата за 30% времени
- Объёмный: 100% результата за 100% времени
- Для занятых людей: минимализм — лучший выбор
- Для соревнующихся: нужен полный объём

**Когда минимализм — правильный выбор:**
- Мало времени (30-45 мин на тренировку)
- Высокий стресс на работе (↓ объём = ↓ кортизол)
- Восстановление после травмы
- Поддержание формы в отпуске / командировке
- «Лучше 3 тренировки по 30 мин, чем 0 по 90 мин»
`;
}
export function getReactiveTrainingGuide(message: string): string {
  const keywords = ['реактивный тренинг', 'reactive training', 'плиометрика наука', 'plyometric science', 'цикл растяжение-сокращение', 'ssc', 'stretch shortening', 'прыжковая тренировка', 'реактивная сила'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦘 РЕАКТИВНЫЙ ТРЕНИНГ — ЦИКЛ РАСТЯЖЕНИЕ-СОКРАЩЕНИЕ (SSC):

**Что такое SSC (Stretch-Shortening Cycle):**
- Мышца сначала РАСТЯГИВАЕТСЯ (эксцентрика), затем СОКРАЩАЕТСЯ (концентрика)
- Упругая энергия сухожилий + рефлекс растяжения = ↑ мощность на 20-30%
- Пример: прыжок с предварительным приседанием > прыжок из статики
- Ключевой механизм: сухожильная упругость + мышечный рефлекс

**Два типа SSC:**
1. **Быстрый SSC (<250 мс):**
   - Контакт с поверхностью <250 мс
   - Пример: спринт, прыжки в глубину, скачки
   - Тренирует: жёсткость сухожилий, скорость рефлекса
   - Для: спринтеров, прыгунов, единоборцев

2. **Медленный SSC (>250 мс):**
   - Контакт >250 мс, большая амплитуда
   - Пример: прыжок с места, прыжок на тумбу
   - Тренирует: мощность, силу в растянутой позиции
   - Для: тяжелоатлетов, баскетболистов, волейболистов

**Упражнения по уровням:**

**Уровень 1 — Начальный (0-6 мес):**
- Прыжки на месте (pogo jumps) — 3×10
- Прыжки с места (broad jump) — 3×5
- Прыжки на невысокую тумбу (30-40 см) — 3×5
- Скиппинг (бег с высоким подниманием бёдер) — 3×15 м

**Уровень 2 — Средний (6-18 мес):**
- Прыжки на тумбу (50-70 см) — 4×4
- Прыжки в длину с 2-3 шагов — 4×3
- Прыжки на одной ноге (bounds) — 3×5 каждая
- Бросок медбола из приседа — 3×5

**Уровень 3 — Продвинутый (18+ мес):**
- Depth jumps (прыжки в глубину, 40-60 см) — 4×3
- Reactive bounds (многоскоки) — 3×6
- Altitude drops → sprint — 3×2
- Weighted jumps (10-20% BW) — 3×4

**Протокол плиометрической тренировки:**
- Место в программе: ПЕРЕД силовой (свежая ЦНС)
- Объём: 40-60 контактов за сессию (начинающие), 80-120 (продвинутые)
- Отдых: 1-2 мин между подходами (полное восстановление ЦНС)
- Частота: 2-3 раза/неделю (не подряд!)
- Поверхность: умеренно мягкая (газон, мат, резиновое покрытие)

**Контрастный метод (French Contrast):**
1. Тяжёлое силовое: приседание 85% 1ПМ × 3
2. Плиометрика: прыжок на тумбу × 3
3. Ускоренное силовое: приседание с прыжком 30% × 3
4. Быстрая плиометрика: pogo jumps × 5
- Отдых: 30 сек между упражнениями, 3-4 мин между сериями
- Эффект PAP (постактивационная потенциация) = ↑ мощность

**Техника безопасности:**
- «Тихие» приземления (мягко, на переднюю часть стопы)
- Никогда на бетон или твёрдый пол!
- Не делай плиометрику утомлённым (конец тренировки = травмы)
- Минимальная база: присед 1.5× BW до depth jumps
- Травмы коленей / голеностопов = противопоказание
`;
}
export function getAutoregulationTraining(message: string): string {
  const keywords = ['авторегуляция', 'autoregulation', 'rpe тренировка', 'тренировка по самочувствию', 'гибкая программа', 'адаптивная нагрузка', 'reactive deload', 'тренировка по ощущениям'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎛️ АВТОРЕГУЛЯЦИЯ ТРЕНИРОВОК — УМНАЯ ПРОГРЕССИЯ:

**Что такое авторегуляция:**
- Подстройка нагрузки под текущее состояние организма
- Вместо «строго 80 кг на 5 повторений» → «RPE 8 на 5 повторений»
- Учитывает: сон, стресс, питание, восстановление, настроение
- Результат: ↓ перетренированность, ↑ долгосрочный прогресс

**Три метода авторегуляции:**

**1. RPE (Rate of Perceived Exertion) — шкала Борга:**
| RPE | Описание | RIR |
|-----|----------|-----|
| 10 | Максимум, отказ | 0 |
| 9 | Мог бы сделать ещё 1 | 1 |
| 8 | Мог бы сделать ещё 2 | 2 |
| 7 | Мог бы сделать ещё 3 | 3 |
| 6 | Лёгкая нагрузка | 4+ |

- Тренировочные подходы: RPE 7-9 (оставляешь 1-3 RIR)
- Разминочные: RPE 4-6
- Тест 1ПМ: RPE 10

**2. Velocity-Based (по скорости штанги):**
- Используй линейный датчик или приложение (PUSH, RepOne)
- Если скорость упала на 20%+ от первого повторения → заканчивай подход
- Объективнее RPE (не зависит от субъективных ощущений)

**3. APRE (Autoregulatory Progressive Resistance):**
- Подход 1: 50% RM × 10
- Подход 2: 75% RM × 6
- Подход 3: 100% RM × до отказа (считаешь повторения)
- Подход 4: корректировка веса по результату подхода 3:
  - <4 повторения → ↓ 2.5-5 кг
  - 4-6 повторений → без изменений
  - >6 повторений → ↑ 2.5-5 кг

**Когда авторегуляция критична:**
- Стрессовый период на работе (↑ кортизол → ↓ производительность)
- Плохой сон (<6 часов) → ↓ вес на 5-10%
- После болезни / перерыва → начать с RPE 6-7
- Чувствуешь боль в суставах → ↓ интенсивность, ↑ повторения
- Отличное самочувствие → можно прибавить 2.5-5 кг!

**Практическая программа с авторегуляцией:**
- Основные упражнения: RPE 7-9 (прогрессия по самочувствию)
- Вспомогательные: RPE 7-8 (не до отказа)
- Изоляция: RPE 8-9 (можно ближе к отказу)
- Если 2+ тренировки подряд RPE 9+ на привычных весах → деload

**Ошибки авторегуляции:**
- Всегда работать RPE 10 («я же могу больше!»)
- Недооценка RPE (говоришь 7, а реально 9)
- Авторегуляция = не лень (нужна честность с собой)
- Игнорировать отслеживание (записывай RPE в дневник!)
`;
}
export function getHangingLegRaiseSci(message: string): string {
  const keywords = ['подъём ног в висе', 'hanging leg raise', 'подъём ног на перекладине', 'нижний пресс', 'подъём коленей в висе', 'висеть пресс', 'captain chair'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ПОДЪЁМ НОГ В ВИСЕ — ЛУЧШЕЕ УПРАЖНЕНИЕ НА ПРЕСС:

**Почему это №1 для пресса (ЭМГ-данные):**
- Активация прямой мышцы живота: 130-150% vs скручивания
- Активация косых мышц: 120-140% vs скручивания
- Нагрузка на нижнюю порцию пресса: максимальная (!)
- Бонус: тренирует хват, декомпрессирует позвоночник

**Прогрессия (от лёгкого к тяжёлому):**

**Уровень 1 — Подъём коленей в висе:**
- Висишь на перекладине
- Поднимаешь согнутые колени к груди
- Контролируемо опускаешь
- 3×10-15

**Уровень 2 — Подъём коленей с паузой:**
- То же, но пауза 2-3 сек в верхней точке
- Скругление поясницы наверху (posterior pelvic tilt!)
- 3×8-12

**Уровень 3 — Подъём прямых ног до 90°:**
- Прямые ноги поднимаешь до горизонтали
- Без раскачки! Если качаешься — ↓ уровень
- 3×8-12

**Уровень 4 — Подъём прямых ног до перекладины:**
- «Toes to bar» — носки касаются перекладины
- Требует гибкости задней поверхности бедра
- 3×6-10

**Уровень 5 — С отягощением:**
- Утяжелители на голени (1-5 кг)
- Или медбол между стоп
- 3×6-8

**Критическая техника:**
- ✅ Скругление поясницы (posterior pelvic tilt) — БЕЗ этого работают сгибатели бедра, а НЕ пресс!
- ✅ Контролируемое движение (без раскачки)
- ✅ Выдох на подъёме, вдох на опускании
- ✅ Хват шире плеч для стабильности
- ❌ Махи ногами по инерции = 0 пользы
- ❌ Прямая поясница = нагрузка на сгибатели бедра (psoas!)
- ❌ Слишком быстрое опускание = потеря эксцентрики

**Альтернативы (если нет перекладины):**
- Captain's chair (опора на локти) — хороша, но меньше активация
- Подъём ног лёжа на полу — базовый вариант
- Обратные скручивания на наклонной скамье
- Ab wheel (ролик для пресса) — другая биомеханика, но тоже топ

**Программирование пресса:**
- 2-3 раза/неделю (пресс восстанавливается быстро)
- 3-4 подхода × 8-15 повторений
- Прогрессия: от колен → прямые ноги → отягощение
- Комбинируй: подъём ног (нижняя порция) + скручивания (верхняя)
- Планка: тренирует стабильность, НЕ гипертрофию пресса
`;
}
export function getTrainingJournalMaster(message: string): string {
  const keywords = ['тренировочный дневник', 'training journal', 'дневник тренировок вести', 'что записывать', 'тренировочный лог', 'журнал тренировок', 'как вести дневник', 'записи тренировок'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📓 ТРЕНИРОВОЧНЫЙ ДНЕВНИК — МАСТЕРСТВО ЗАПИСЕЙ:

**Зачем вести дневник (доказано):**
- ↑ Прогресс на 30-50% vs «на глаз» (мета-анализ 2021)
- Точное отслеживание прогрессии (не полагаешься на память)
- Обнаружение паттернов (что работает, что нет)
- Мотивация (видишь свой путь)
- Предотвращение перетренированности (объективные данные)

**Что записывать ОБЯЗАТЕЛЬНО:**
1. **Дата и время** тренировки
2. **Упражнение** (название)
3. **Подходы × повторения × вес** (например: 3×8×80 кг)
4. **RPE** каждого рабочего подхода (7-10)
5. **Общий объём** (тоннаж = подходы × повторения × вес)

**Что записывать ДОПОЛНИТЕЛЬНО (↑ ценность):**
- Вес тела утром (для корреляции с силой)
- Качество сна (1-10)
- Уровень энергии до тренировки (1-10)
- Длительность тренировки
- Заметки (болезненность, ощущения, техника)
- Что ел перед тренировкой

**Формат записи (быстрый):**
\`\`\`
05.04 | 9:00 | День А — Push | Энергия: 8/10 | Сон: 7.5ч | Вес: 82.3

Жим лёжа:
  20×10, 40×5, 60×3 (разминка)
  80×8 RPE7, 82.5×7 RPE8, 82.5×6 RPE9 ← ↑ вес след. раз!

Жим гантелей 30°:
  28×10 RPE7, 28×10 RPE8, 28×8 RPE8

Отжимания на брусьях:
  +10×10, +10×9, +10×8 RPE8

Тоннаж: 4250 кг | Время: 52 мин
Заметки: правое плечо чуть напрягает в жиме > 80°
\`\`\`

**Анализ дневника (раз в 4 недели):**
- Сравни тоннаж неделя к неделе (должен расти или стабилен)
- Посмотри RPE-тренд (постоянно 9-10 = нужен деload)
- Найди упражнения где застой (плато >3 недель = смени вариацию)
- Корреляция: сон <6 ч = ↓ производительность? (обычно да!)
- Лучшие тренировки: что общего? (сон? питание? время дня?)

**Цифровые vs бумажные дневники:**
- 📱 Приложения (Giron!): автоматические графики, статистика, облако
- 📝 Бумажный: быстрее записать между подходами, тактильность
- Рекомендация: приложение + быстрые заметки в телефоне

**Ошибки ведения дневника:**
- ❌ Записывать только «хорошие» тренировки
- ❌ Не писать RPE (потом не помнишь насколько было тяжело)
- ❌ Записывать после тренировки по памяти (забываешь детали)
- ❌ Не анализировать записи (дневник без анализа = бесполезен)
- ❌ Слишком подробно (10 мин на запись = бросишь через неделю)
`;
}
export function getAdductorTrainingGuide(message: string): string {
  const keywords = ['приводящие мышцы', 'adductor', 'внутренняя поверхность бедра', 'аддуктор', 'паховая область', 'сведение ног', 'приводящие бедра'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ТРЕНИРОВКА ПРИВОДЯЩИХ МЫШЦ (АДДУКТОРОВ):

**Анатомия приводящих:**
- Длинная приводящая (adductor longus) — самая крупная
- Короткая приводящая (adductor brevis)
- Большая приводящая (adductor magnus) — мощнейшая, помогает в приседе
- Тонкая мышца (gracilis) — единственная двусуставная
- Гребенчатая (pectineus) — самая короткая

**Функции:**
- Приведение бедра (сведение ног)
- Стабилизация таза при ходьбе/беге
- Помощь в разгибании бедра (magnus — «второй хамстринг»)
- Внутренняя ротация бедра

**Почему важно тренировать:**
- Профилактика паховых травм (самая частая у спортсменов!)
- Стабильность в приседе и становой
- Баланс с отводящими (abductors) → здоровье тазобедренного
- Сила в sumo-стойке

**Лучшие упражнения:**
1. **Copenhagen plank** — изометрическая сила, реабилитация
   - Боковая планка, верхняя нога на скамье
   - 3×20-30 сек каждая сторона

2. **Сведение ног в тренажёре:**
   - Контролируемый темп, 3×12-15
   - Пауза 2 сек в сведённой позиции

3. **Sumo приседания (широкая стойка):**
   - ↑ активация приводящих на 30% vs обычный присед
   - 3×8-12

4. **Приседания плие с гантелей:**
   - Широкая стойка, носки наружу
   - 3×12-15

5. **Выпады в сторону (lateral lunge):**
   - ↑ растяжка + сила приводящих
   - 3×8-10 каждая сторона

6. **Приведение ноги в кроссовере:**
   - Кабель на нижнем блоке, нога через тело
   - 3×12-15 каждая

**Соотношение приводящих/отводящих:**
- Оптимальное: приводящие = 80-100% силы отводящих
- Дисбаланс >25% → ↑ риск травм паха и колена
- Тестируй: если сведение слабее разведения — ↑ объём на приводящие

**Профилактика паховых травм:**
- Copenhagen plank 3×/неделю (доказано ↓ риск на 41%!)
- Растяжка приводящих после каждой тренировки ног
- Разминка: боковые выпады + лёгкое сведение перед основной работой
`;
}
export function getDiabetesExerciseGuide(message: string): string {
  const keywords = ['диабет тренировки', 'diabetes exercise', 'сахарный диабет спорт', 'инсулинорезистентность упражнения', 'диабет 2 типа', 'гликемия тренировки', 'сахар крови спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🩺 ТРЕНИРОВКИ ПРИ САХАРНОМ ДИАБЕТЕ — БЕЗОПАСНЫЙ ГАЙД:

⚠️ ВАЖНО: Проконсультируйся с эндокринологом перед началом!
Это общие рекомендации, не замена медицинскому совету.

**Почему тренировки критичны при диабете:**
- Силовые: ↑ чувствительность к инсулину на 24-48 часов
- Кардио: ↓ HbA1c на 0.5-0.7% (сравнимо с медикаментами!)
- Силовые + кардио: ↓ HbA1c на 0.9-1.2%
- ↑ GLUT4 транспортёры → глюкоза поступает в мышцы БЕЗ инсулина
- ↓ Висцеральный жир → ↓ воспаление → ↑ чувствительность к инсулину

**Рекомендации по типу диабета:**

**Диабет 2 типа (инсулинорезистентность):**
- Силовые: 2-3 раза/неделю, все основные группы мышц
- Кардио: 150 мин/неделю умеренной интенсивности (быстрая ходьба)
- Или: 75 мин/неделю высокой интенсивности (HIIT)
- Не более 2 дней подряд без физической активности!

**Диабет 1 типа (инсулинозависимый):**
- Те же рекомендации + тщательный контроль глюкозы
- Измеряй глюкозу ДО, ВО ВРЕМЯ и ПОСЛЕ тренировки
- Имей быстрые углеводы при себе (сок, глюкозные таблетки)

**Контроль глюкозы вокруг тренировки:**
| Глюкоза до тренировки | Действие |
|----------------------|----------|
| <5.0 ммоль/л | НЕ начинай! Съешь 15-30 г углеводов, подожди |
| 5.0-8.0 ммоль/л | Оптимально, начинай тренировку |
| 8.0-14.0 ммоль/л | Можно начинать, но следи |
| >14.0 ммоль/л | Проверь кетоны! Если есть → НЕ тренируйся |

**Лучшие упражнения при диабете:**
- ✅ Ходьба (30 мин после еды ↓ пик глюкозы на 30-40%)
- ✅ Приседания, жим, тяги (↑ мышечная масса = ↑ утилизация глюкозы)
- ✅ Плавание (низкая нагрузка на суставы)
- ✅ HIIT (мощно ↓ инсулинорезистентность)
- ⚠️ Осторожно: высокоинтенсивные спринты (могут ↑ глюкозу кратковременно)

**Питание для атлета с диабетом:**
- Углеводы: с низким ГИ (крупы, овощи, бобовые)
- Белок: 1.6-2.0 г/кг (↑ сытость + ↓ гликемический ответ)
- Клетчатка: 30+ г/день (↓ скорость всасывания глюкозы)
- Углеводы перед тренировкой: медленные, за 1-2 часа
- После тренировки: белок + умеренные углеводы

**Меры безопасности:**
- Всегда носи с собой быстрые углеводы (15-20 г)
- Тренируйся с партнёром (или предупреди персонал зала)
- Браслет/карточка с диагнозом
- При диабетической нейропатии: проверяй стопы после тренировки
- Избегай тренировок при температуре/болезни (↑ риск гипогликемии)
`;
}
export function getTrainingWithAnemia(message: string): string {
  const keywords = ['анемия тренировки', 'anemia training', 'низкий гемоглобин', 'железодефицитная анемия', 'тренировки при анемии', 'гемоглобин спорт', 'ферритин низкий'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🩸 ТРЕНИРОВКИ ПРИ АНЕМИИ — БЕЗОПАСНЫЙ ПОДХОД:

⚠️ Проконсультируйся с терапевтом/гематологом!
Анемия требует диагностики причины и лечения.

**Что такое анемия:**
- Гемоглобин: <130 г/л (мужчины), <120 г/л (женщины)
- Ферритин: <30 мкг/л = дефицит запасов железа
- Ферритин <15 мкг/л = тяжёлый дефицит
- Для атлетов: оптимум ферритина = 50-100 мкг/л

**Как анемия влияет на тренировки:**
- ↓ Доставка O₂ к мышцам → ↓ выносливость, ↓ VO₂max
- ↓ Энергия, ↑ утомляемость → ↓ объём и интенсивность
- ↑ ЧСС при привычных нагрузках
- Головокружение, одышка при нагрузке
- ↓ Восстановление между тренировками

**Можно ли тренироваться с анемией?**
- Лёгкая анемия (Hb 100-120): ДА, с коррекцией нагрузки
- Средняя анемия (Hb 80-100): только лёгкие нагрузки, по ощущениям
- Тяжёлая анемия (Hb <80): НЕТ, сначала лечение!

**Рекомендации по тренировкам:**
- ↓ Интенсивность на 20-30% от привычной
- ↓ Объём на 30-50%
- ↑ Отдых между подходами (2-3 мин вместо 1-2)
- Избегай тренировок до отказа
- Кардио: низкая интенсивность (Zone 1-2), не HIIT
- Прислушивайся к телу: головокружение = остановись!

**Восстановление железа:**
- Пероральное железо: 100-200 мг элементарного Fe/день
- Принимай натощак с витамином C (↑ усвоение на 60%)
- НЕ с чаем, кофе, молоком (↓ усвоение)
- Улучшение: через 2-4 недели (ферритин — через 3-6 мес)

**Продукты богатые железом (для атлетов):**
- Гемовое (животное, усвоение 15-35%): говядина, печень, индейка
- Негемовое (растительное, усвоение 2-20%): шпинат, чечевица, гречка
- Витамин C + негемовое железо = ↑ усвоение в 3-6 раз
- Готовь в чугунной посуде (↑ содержание железа в пище!)

**Спортивная анемия (псевдоанемия):**
- У выносливостных атлетов: объём плазмы ↑ → «разбавление» Hb
- Hb может быть 120-130, но ферритин нормальный (>30)
- Это адаптация, не болезнь! Не путай с истинной анемией.
- Проверяй ферритин, не только гемоглобин
`;
}
export function getAntiGravityTraining(message: string): string {
  const keywords = ['антигравитационный', 'anti gravity', 'инверсия', 'inversion', 'вис вниз головой', 'декомпрессия позвоночника', 'инверсионный стол', 'гравитационные ботинки'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔄 АНТИГРАВИТАЦИОННЫЙ ТРЕНИНГ (ИНВЕРСИЯ):

**Что такое инверсионная терапия:**
- Подвешивание вниз головой (частично или полностью)
- Цель: декомпрессия позвоночника, растяжение под действием гравитации
- Инструменты: инверсионный стол, гравитационные ботинки, турник

**Доказанные эффекты:**
- ↑ Межпозвонковое пространство на 1-3 мм (временно)
- ↓ Компрессия нервных корешков → ↓ боль
- ↓ Мышечный спазм паравертебральных мышц
- ↑ Кровоток к головному мозгу (кратковременно)
- ↓ Болевой синдром при протрузиях/грыжах (исследования: ↓ на 30-40%)

**Протокол инверсии:**

**Для начинающих (неделя 1-2):**
- Угол: 15-30° (не полная инверсия!)
- Длительность: 1-2 мин
- 1 раз/день
- После тренировки или вечером

**Для адаптированных (неделя 3+):**
- Угол: 45-60°
- Длительность: 3-5 мин
- 1-2 раза/день
- Можно добавить лёгкие движения (скручивания, прогибы)

**Полная инверсия (90°) — только опытным:**
- Длительность: 2-3 мин
- С партнёром / страховкой
- НЕ рекомендуется при гипертонии

**Упражнения в инверсии:**
1. **Простой вис** — декомпрессия (1-3 мин)
2. **Скручивания** — мягкие повороты корпуса
3. **Crunches в инверсии** — пресс (с отягощением = продвинутый!)
4. **Прогиб назад** — растяжка передней цепи
5. **Подтягивание коленей к груди** — сгибатели бедра + пресс

**Dead hang (вис на перекладине) — доступная альтернатива:**
- Висишь на турнике, полностью расслабленный
- 30-60 сек × 3-5 подходов
- ↑ Декомпрессия поясничного отдела
- ↑ Сила хвата (бонус!)
- ↑ Мобильность плечей
- Безопаснее, чем полная инверсия

**Противопоказания (ВАЖНО!):**
- ❌ Гипертония (↑ давление на 20-30 мм рт.ст. в инверсии!)
- ❌ Глаукома (↑ внутриглазное давление)
- ❌ Заболевания сердца
- ❌ Беременность
- ❌ Ожирение (>120 кг — ограничение большинства столов)
- ❌ Отслоение сетчатки
- ❌ Грыжи пищевода
- ⚠️ Не инвертируй сразу после еды (тошнота!)
`;
}
export function getHypertensionExerciseGuide(message: string): string {
  const keywords = ['гипертония тренировки', 'hypertension exercise', 'высокое давление спорт', 'тренировки при давлении', 'артериальное давление', 'повышенное давление', 'гипертоник тренируется'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💓 ТРЕНИРОВКИ ПРИ ГИПЕРТОНИИ — БЕЗОПАСНЫЙ ПОДХОД:

⚠️ ОБЯЗАТЕЛЬНА консультация кардиолога перед началом!
Тренировки — доказанный метод ↓ АД, но нужен контроль.

**Влияние тренировок на давление:**
- Регулярные аэробные: ↓ систолическое на 5-8 мм рт.ст.
- Силовые: ↓ систолическое на 3-6 мм рт.ст.
- Изометрические: ↓ на 5-10 мм рт.ст. (удивительно эффективны!)
- Каждые −2 мм рт.ст. = ↓ риск инсульта на 10%, инфаркта на 7%

**Когда МОЖНО тренироваться:**
| АД до тренировки | Решение |
|-------------------|---------|
| <140/90 | ✅ Можно тренироваться нормально |
| 140-160 / 90-100 | ⚠️ Лёгкая нагрузка, контроль АД |
| 160-180 / 100-110 | ⚠️ Только после консультации врача |
| >180/110 | ❌ НЕ тренируйся! Обратись к врачу! |

**Аэробные тренировки (приоритет №1):**
- 150-300 мин/неделю умеренной интенсивности
- Быстрая ходьба, плавание, велотренажёр
- Интенсивность: 40-60% ЧССрезерва (можешь говорить)
- НЕ HIIT при неконтролируемом давлении!
- Эффект ↓ АД: через 4-8 недель регулярных занятий

**Силовые тренировки:**
- 2-3 раза/неделю
- 8-12 повторений × 2-3 подхода
- 60-70% 1ПМ (НЕ тяжёлые веса!)
- Отдых: 60-90 сек (не меньше)
- Чередуй верх и низ тела

**Изометрические упражнения (новое направление!):**
- Wall sit (присед у стены): 4×2 мин, отдых 1-3 мин
- Handgrip (кистевой эспандер): 4×2 мин, 30% max, 3×/неделю
- Мета-анализ 2023: изометрика наиболее эффективна для ↓ АД!

**Правила безопасности:**
- ✅ Дыши непрерывно — НИКОГДА не задерживай дыхание!
- ✅ Избегай Вальсальвы (натуживания) при подъёме тяжестей
- ✅ Измеряй АД до и после тренировки (первые 2-3 месяца)
- ✅ Постепенное начало и завершение (разминка + заминка по 5-10 мин)
- ✅ Пей воду (обезвоживание ↑ АД)
- ❌ Избегай жимов над головой с тяжёлыми весами
- ❌ Не переворачивайся (инверсия, стойка на голове)
- ❌ Не тренируйся в сильную жару

**Чего избегать при гипертонии:**
- Задержка дыхания + натуживание (↑ АД на 300+ мм рт.ст.!)
- Максимальные подъёмы (1ПМ) — ↑ давление экстремально
- Бег в холод (↑ спазм сосудов)
- Кофеин перед тренировкой (↑ АД на 10-20 мм рт.ст.)
- Сауна сразу после силовой (↓ давление резко → обморок)

**Образ жизни для контроля АД:**
- ↓ Соль: <5 г/день (↓ АД на 5-6 мм рт.ст.)
- ↑ Калий: 3500-4700 мг/день (бананы, картофель, авокадо)
- Вес: ↓ на каждый 1 кг = ↓ АД на ~1 мм рт.ст.
- Сон: 7-8 часов (хронический недосып ↑ АД)
- Магний: 300-400 мг/день (↓ тонус сосудов)
`;
}
export function getThyroidTrainingGuide(message: string): string {
  const triggers = ['щитовидк', 'тиреоид', 'гипотиреоз', 'гипертиреоз', 'тироксин', 'т4', 'ттг', 'thyroid'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦋 ТРЕНИРОВКИ ПРИ ЗАБОЛЕВАНИЯХ ЩИТОВИДНОЙ ЖЕЛЕЗЫ:

**Гипотиреоз (↓ функция):**
- Метаболизм замедлён → акцент на ↑ NEAT + силовые
- Силовые 3-4 раза/нед, умеренная интенсивность (65-75% 1ПМ)
- Кардио: 20-30 мин низкой интенсивности (ходьба, велосипед)
- Избегать перетренированности — и так ↓ восстановление
- Утренние тренировки предпочтительнее (↑ метаболизм на день)
- Холодовая адаптация — осторожно (↓ терморегуляция)

**Гипертиреоз (↑ функция):**
- Избегать высокоинтенсивного кардио (↑ ЧСС уже повышена)
- Силовые — фокус на сохранение мышечной массы
- Контролировать ЧСС: не >70% от макс ЧСС
- ↑ Калораж — катаболизм усилен
- Избегать кофеина перед тренировкой

**Особенности питания:**
- Гипотиреоз: йод 150-300 мкг/день (морская капуста, рыба)
- Избегать избытка крестоцветных сырых (↓ поглощение йода)
- Селен: 55-200 мкг/день (бразильский орех) — конверсия T4→T3
- Цинк: 15-30 мг/день — поддержка функции щитовидки
- Глютен: исключить при Хашимото (связь с аутоиммунным тиреоидитом)

**Мониторинг:**
- Контроль ТТГ каждые 6-8 недель при смене нагрузок
- Пульс покоя утром — индикатор состояния
- Усталость >2 дней после тренировки = снизить объём
`;
}
export function getOsteoporosisExercise(message: string): string {
  const triggers = ['остеопороз', 'кости хрупк', 'плотность кост', 'osteoporosis', 'костная ткань', 'остеопения'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦴 ТРЕНИРОВКИ ПРИ ОСТЕОПОРОЗЕ / ОСТЕОПЕНИИ:

**Механизм: как нагрузка укрепляет кости:**
- Закон Вольфа: кость адаптируется к нагрузке, которой подвергается
- Механотрансдукция: остеоциты реагируют на деформацию → ↑ остеобласты
- Минимум 4.2× масса тела нагрузки для стимуляции ремоделирования
- Эффект специфичен: нагрузка на ноги = ↑ плотность бедра, не позвоночника

**Рекомендованные упражнения:**
✅ Силовые (2-3 раза/нед):
- Приседания (с опорой если нужно)
- Жим ногами
- Становая тяга (лёгкий вес, идеальная техника)
- Жим от груди
- Тяга в наклоне

✅ Весовая нагрузка (ежедневно):
- Ходьба 30+ мин/день
- Подъём по лестнице
- Танцы

✅ Баланс (ежедневно, профилактика падений):
- Стойка на одной ноге (30 сек × 3)
- Тандемная ходьба
- Тай-чи (↓ риск падений на 40%)

**ЗАПРЕЩЕНО при остеопорозе:**
❌ Скручивания/кранчи (↑ риск перелома позвонков)
❌ Наклоны вперёд с весом
❌ Прыжки на твёрдой поверхности
❌ Резкие ротации позвоночника
❌ Бег на высокой скорости

**Нутриенты для костей:**
- Кальций: 1200-1500 мг/день (разделить на 2-3 приёма)
- Витамин D3: 2000-4000 МЕ/день
- Витамин K2 (MK-7): 100-200 мкг/день
- Магний: 400 мг/день
- Коллаген: 10-15 г/день
`;
}
export function getBoneDensityTraining(message: string): string {
  const triggers = ['плотность кост', 'укрепить кости', 'кости крепч', 'минерализац', 'bone density'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
💪 ТРЕНИРОВКИ ДЛЯ УВЕЛИЧЕНИЯ ПЛОТНОСТИ КОСТЕЙ:

**Научные данные:**
- Силовые тренировки ↑ BMD на 1-3% за 12 месяцев
- Ударные нагрузки ↑ BMD бедра на 1.5-2.5% за 6 месяцев
- Комбинация силовых + ударных = максимальный эффект
- Нужна прогрессивная перегрузка — кость адаптируется как мышца

**Программа Osteogenic Loading (3 раза/нед):**

Тренировка A — Нижняя часть:
1. Приседания со штангой: 3×8-10 (70-80% 1ПМ)
2. Выпады с гантелями: 3×10 на ногу
3. Жим ногами: 3×12
4. Подъёмы на носки стоя: 3×15
5. Прыжки на коробку: 3×8 (если безопасно)

Тренировка B — Верхняя часть:
1. Жим штанги лёжа: 3×8-10
2. Тяга штанги в наклоне: 3×10
3. Жим гантелей сидя: 3×10
4. Подтягивания (или с резинкой): 3×8
5. Фермерская прогулка: 3×30м

**Ударные нагрузки (ежедневно):**
- 50 прыжков/день (высота 10-20 см) — ↑ BMD бедра
- Бег трусцой 20-30 мин (↑ BMD ног vs плавание/велосипед)
- Подъём по лестнице (20+ этажей/нед)
- Прыжки со скакалкой: 2×50 прыжков

**Ключевые правила:**
- Интенсивность важнее объёма для костей
- Минимум 6 месяцев для измеримых изменений BMD
- Нагрузка должна быть непривычной (вариативность!)
- Кости восстанавливаются медленнее мышц — прогрессия раз в 2-3 нед
`;
}
export function getAsthmaExerciseGuide(message: string): string {
  const triggers = ['астм', 'бронхиальн', 'asthma', 'дышать тяжело', 'ингалятор', 'бронхоспазм'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🫁 ТРЕНИРОВКИ ПРИ БРОНХИАЛЬНОЙ АСТМЕ:

**Бронхоспазм при физнагрузке (EIB):**
- Встречается у 80-90% астматиков при нагрузке
- Пик через 5-10 мин после начала интенсивного упражнения
- Триггеры: холодный/сухой воздух, высокая интенсивность, пыль в зале
- Профилактика: ингалятор (сальбутамол) за 15-20 мин до тренировки

**Безопасные виды тренировок:**
✅ Силовые в зале (контролируемая среда, умеренная ЧСС)
✅ Плавание (тёплый влажный воздух = ↓ риск бронхоспазма)
✅ Йога / пилатес (дыхательные техники)
✅ Ходьба (низкая интенсивность)
✅ Интервальные тренировки (короткие усилия vs длительное кардио)

⚠️ Осторожно:
- Бег на холоде (↑↑ риск бронхоспазма)
- Длительное непрерывное кардио >20 мин
- Высокая интенсивность без разминки

**Программа силовых для астматиков:**
- Разминка: 10-15 мин (постепенное ↑ ЧСС — "рефрактерный период")
- Основная: 3-4 упражнения, 3×10-12
- Отдых между подходами: 90-120 сек (достаточно для дыхания)
- Заминка: 10 мин ↓ интенсивности + дыхательные упражнения

**Дыхательные техники:**
- Диафрагмальное дыхание: вдох носом 4 сек → выдох ртом 6 сек
- Метод Бутейко: ↓ гипервентиляция, дыхание носом
- Pursed-lip: вдох носом → выдох через сжатые губы (↓ коллапс бронхов)
- Практиковать ежедневно 10-15 мин
`;
}
export function getVaricoseVeinExercise(message: string): string {
  const triggers = ['варикоз', 'вены', 'varicose', 'сосудист', 'венозн', 'вена на ноге'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦵 ТРЕНИРОВКИ ПРИ ВАРИКОЗНОМ РАСШИРЕНИИ ВЕН:

**Механизм варикоза и нагрузки:**
- Варикоз = недостаточность венозных клапанов → застой крови
- Мышечный насос (икры/бёдра) — главный механизм венозного возврата
- Тренировки ↑ мышечный насос, но ↑ давление при натуживании

**Рекомендованные упражнения:**
✅ Ходьба (30-45 мин/день) — №1 для мышечного насоса
✅ Плавание — горизонтальное положение ↓ давление в венах
✅ Велосипед/велотренажёр — работа икроножных без ударной нагрузки
✅ Подъёмы на носки: 3×20 — тренировка мышечного насоса
✅ Тренажёры лёжа/сидя (жим ногами, сгибание/разгибание)
✅ Упражнения с поднятыми ногами (велосипед лёжа, ножницы)

**ОГРАНИЧЕНИЯ:**
⚠️ Приседания: допустимы с лёгким весом, без задержки дыхания
⚠️ Становая тяга: только с идеальным дыханием, без натуживания
❌ Длительное стояние на месте (>10 мин)
❌ Тяжёлые приседания/жим ногами с натуживанием
❌ Прыжки с отягощением
❌ Горячая сауна после тренировки (↑ расширение вен)

**После тренировки:**
- Лечь, поднять ноги выше сердца на 10-15 мин
- Компрессионные чулки во время тренировки
- Контрастный душ для ног (тёплый → холодный)
- Избегать горячей ванны сразу после
`;
}
export function getEpilepsyExerciseGuide(message: string): string {
  const triggers = ['эпилепс', 'epilepsy', 'припадок', 'судорожный синдром', 'противосудорожн'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⚡ ТРЕНИРОВКИ ПРИ ЭПИЛЕПСИИ:

**Научные данные:**
- Регулярные тренировки ↓ частоту приступов на 30-50%
- Механизм: ↑ ГАМК (тормозной нейромедиатор), ↓ глутамат
- ↑ Порог судорожной готовности
- ↓ Стресс и тревожность (частые триггеры)

**Безопасные виды тренировок:**
✅ Силовые в зале (контролируемая среда, партнёр)
✅ Ходьба/бег на дорожке (не на дороге!)
✅ Велотренажёр (не обычный велосипед)
✅ Групповые занятия с инструктором
✅ Йога (↓ стресс = ↓ триггеры)

**ЗАПРЕЩЕНО (риск при приступе):**
❌ Плавание без присмотра
❌ Скалолазание
❌ Упражнения со штангой над головой без страхующего
❌ Тренажёры с фиксацией (невозможно безопасно упасть)
❌ Дайвинг, прыжки с высоты

**Правила безопасности:**
1. Всегда тренироваться с партнёром/в зале с персоналом
2. Информировать тренера/персонал о диагнозе
3. Избегать триггеров: недосып, обезвоживание, перегрев
4. Не тренироваться при аурах или плохом самочувствии
5. Гидратация: 500 мл за час до + 200 мл каждые 20 мин
6. Избегать гипервентиляции (провоцирует абсансы)
7. Приём лекарств строго по расписанию
`;
}
export function getIBSExerciseGuide(message: string): string {
  const triggers = ['срк', 'раздражённ кишечник', 'ibs', 'irritable bowel', 'кишечник болит', 'вздутие трен'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🫃 ТРЕНИРОВКИ ПРИ СИНДРОМЕ РАЗДРАЖЁННОГО КИШЕЧНИКА (СРК):

**Влияние тренировок на СРК:**
- Умеренные тренировки ↓ симптомы на 50% за 12 нед
- ↓ Стресс (главный триггер СРК)
- ↑ Моторика кишечника (при запорах)
- ↓ Вздутие и газообразование
- ↑ Разнообразие микробиоты

**Оптимальные тренировки:**
✅ Ходьба 30 мин/день — №1 доказательная база
✅ Йога: специфические позы для ЖКТ (скручивания, «кошка-корова»)
✅ Лёгкие силовые: 3×12-15, 60-70% 1ПМ
✅ Плавание: расслабление + лёгкая нагрузка
✅ Тай-чи: ↓ стресс + ↑ парасимпатика

**Чего избегать при обострении:**
❌ HIIT и интенсивное кардио (↑ моторику = ↑ диарея)
❌ Тяжёлые приседания/становая (↑ внутрибрюшное давление)
❌ Бег (ударная нагрузка = "runner's trots")
❌ Тренировки сразу после еды (<90 мин)

**Тайминг тренировок:**
- Утром до еды или через 2-3ч после
- Избегать вечерних интенсивных тренировок (↑ моторика ночью)
- При запорах: кардио утром натощак (↑ перистальтика)
- При диарее: лёгкие силовые, избегать кардио

**Питание вокруг тренировки при СРК:**
- FODMAP-дружелюбный перекус за 2ч: рис + курица + банан
- Избегать: молоко, яблоки, лук, бобовые перед тренировкой
- Гидратация без газа (газировка ↑ вздутие)
`;
}
export function getMigraineExerciseGuide(message: string): string {
  const triggers = ['мигрен', 'migraine', 'головная боль', 'головн бол', 'цефалг', 'аура головн'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🧠 ТРЕНИРОВКИ ПРИ МИГРЕНИ:

**Двоякий эффект:**
- Регулярные тренировки ↓ частоту мигрени на 40-50% за 3 мес
- НО: интенсивная нагрузка может СПРОВОЦИРОВАТЬ приступ
- Ключ: постепенность и контроль интенсивности

**Механизм профилактики:**
- ↑ Серотонин (↓ у мигреников)
- ↓ Кортизол и стресс
- ↑ Эндорфины (естественные обезболивающие)
- ↑ β-эндорфин: порог болевой чувствительности
- Нормализация тонуса сосудов

**Безопасная программа:**
1. Аэробные: 3 раза/нед, 30-40 мин
   - Ходьба (наименьший риск провокации)
   - Велотренажёр (нет ударной нагрузки)
   - Плавание (расслабление + нагрузка)
   - Интенсивность: 60-70% макс ЧСС (разговорный темп)

2. Разминка: 15 мин! (↓ резкое ↑ давления → триггер)

3. Силовые: 2 раза/нед
   - Лёгкий-средний вес, 3×12-15
   - Без натуживания и задержки дыхания!
   - Отдых 90-120 сек

**Провоцирующие факторы при тренировке:**
❌ Обезвоживание (пить каждые 15 мин)
❌ Гипогликемия (перекус за 1-2ч до)
❌ Перегрев (тренироваться в прохладе)
❌ Яркий свет (солнцезащитные очки на улице)
❌ Резкое начало без разминки
❌ Вальсальва/натуживание

**Если приступ начинается во время тренировки:**
→ Немедленно прекратить
→ Тёмное прохладное помещение
→ Медикаменты (триптаны) как можно раньше
`;
}
export function getFibromyalgiaExercise(message: string): string {
  const triggers = ['фибромиалг', 'fibromyalgia', 'хронич боль', 'триггерн точк', 'всё болит мышц'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
💆 ТРЕНИРОВКИ ПРИ ФИБРОМИАЛГИИ:

**Что важно знать:**
- Фибромиалгия = хроническая распространённая боль + усталость
- Тренировки — доказанно эффективнее любых лекарств
- Первые 2-4 нед могут ↑ боль → затем стабильное ↓
- Принцип: «начинай низко, расти медленно»

**Аэробные (приоритет №1):**
- Начать: 5-10 мин ходьбы 3 раза/нед
- Прогрессия: +2-3 мин каждую неделю
- Цель: 30 мин 3-5 раз/нед за 3-4 месяца
- Интенсивность: 40-60% макс ЧСС (очень лёгкое)
- Лучшие: ходьба, аквааэробика, велосипед

**Силовые (после 4-6 нед кардио):**
- Начать: 1 подход × 8-10 повт, очень лёгкий вес
- Прогрессия: +1 подход каждые 2 нед
- Цель: 2-3×10-12 за 3 месяца
- Тренажёры предпочтительнее свободных весов
- 2 раза/нед, через день

**Растяжка и гибкость:**
- Ежедневно 15-20 мин
- Мягкие статические растяжки (30 сек каждая)
- Йога нидра / восстановительная йога
- Тай-чи (доказанная эффективность при фибромиалгии)

**Аквааэробика — золотой стандарт:**
- Тёплая вода (33-36°C) ↓ болевой порог
- Плавучесть ↓ нагрузку на суставы на 90%
- ↓ Боль + ↑ качество сна за 8 нед

**Правила:**
- Никогда не тренироваться «через боль»
- Дневник боли (0-10): если >5 перед тренировкой → отдых
- Достаточный сон (7-9ч) — без сна тренировки ↑ симптомы
`;
}
export function getHashimotoTrainingGuide(message: string): string {
  const triggers = ['хашимото', 'hashimoto', 'аутоиммунн тиреоидит', 'аит', 'антитела щитовидк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦋 ТРЕНИРОВКИ ПРИ ТИРЕОИДИТЕ ХАШИМОТО:

**Особенности Хашимото:**
- Аутоиммунное заболевание → тренировки могут ↑ или ↓ воспаление
- Чрезмерная нагрузка ↑ аутоиммунную реакцию
- Недостаточная нагрузка ↑ воспаление и набор веса

**Золотая середина:**
- Умеренная интенсивность: 60-75% от макс ЧСС
- 30-45 мин/сессия (не >60 мин!)
- 4-5 тренировок/нед максимум
- Обязательно: дни полного отдыха

**Программа:**
Силовые (3 раза/нед):
- 3×10-12, 65-75% 1ПМ
- Акцент на крупные мышечные группы
- Отдых 90 сек между подходами
- Без тренировок до отказа!

Кардио (2 раза/нед):
- Ходьба 30-40 мин или плавание
- Избегать длительного бега (↑ кортизол → ↑ аутоиммунитет)

**ЗАПРЕЩЕНО при обострениях:**
❌ HIIT (↑ кортизол → ↑ воспаление)
❌ Тренировки >60 мин (↑ аутоиммунная реакция)
❌ Ежедневные тренировки без выходных
❌ Тренировки при ТТГ >10 (сначала стабилизация лекарствами)

**Нутриенты при Хашимото:**
- Селен: 200 мкг/день (↓ антитела TPO на 40%)
- Цинк: 25-30 мг/день
- Витамин D: 4000-5000 МЕ/день (дефицит у 90% с АИТ)
- Безглютеновая диета (доказана связь глютен ↔ Хашимото)
- Омега-3: 2-3 г/день (↓ воспаление)
`;
}
export function getGoutExerciseGuide(message: string): string {
  const triggers = ['подагр', 'gout', 'мочевая кислота', 'уратн', 'большой палец нога болит'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦶 ТРЕНИРОВКИ ПРИ ПОДАГРЕ:

**Подагра и физнагрузка:**
- Регулярные тренировки ↓ уровень мочевой кислоты
- Тренировки ↓ вес → ↓ продукция мочевой кислоты
- НО: интенсивная нагрузка временно ↑ мочевую кислоту (распад АТФ → пурины)
- ↑ Гидратация во время тренировок = критично

**В период между приступами:**
✅ Ходьба: 30-45 мин/день
✅ Плавание: ↓ нагрузка на суставы + кардио
✅ Велотренажёр: минимальная нагрузка на стопы
✅ Силовые верхней части тела
✅ Силовые ног в тренажёрах (не свободные веса)
✅ Йога/растяжка (↓ тугоподвижность суставов)

**ВО ВРЕМЯ ПРИСТУПА:**
❌ Полный покой поражённого сустава
❌ Никаких нагрузок на воспалённый сустав
✅ Можно тренировать неповреждённые части тела
✅ Лёд на воспалённый сустав 15 мин × 3-4 раза/день

**Питание вокруг тренировок:**
- Обильная гидратация: 3+ л/день
- Избегать: красное мясо, субпродукты, пиво, сладкие напитки
- ↓ Фруктоза (↑ мочевую кислоту)
- Вишня: 15-20 штук/день (↓ приступы на 35%)
- Молочные продукты: ↓ риск приступов
- Витамин C: 500-1000 мг/день (↓ уровень мочевой кислоты)
`;
}
export function getHypoglycemiaExercise(message: string): string {
  const triggers = ['гипогликем', 'hypoglycemia', 'низкий сахар', 'сахар упал', 'трясёт от голода'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🍬 ТРЕНИРОВКИ ПРИ СКЛОННОСТИ К ГИПОГЛИКЕМИИ:

**Гипогликемия при тренировках:**
- Симптомы: дрожь, потливость, головокружение, спутанность, слабость
- Опасна: обморок при работе со штангой
- Порог: <3.9 ммоль/л (70 мг/дл)
- Триггер: длительная нагрузка + недостаток углеводов

**Профилактика:**
1. Перекус за 1-2ч до тренировки (30-50 г углеводов):
   - Банан + овсянка
   - Тост с мёдом
   - Рисовая каша

2. Во время тренировки (>60 мин):
   - 30-60 г углеводов/час
   - Спортивный напиток, гель, банан
   - Изотоник с глюкозой

3. Экстренный запас ВСЕГДА с собой:
   - Глюкозные таблетки (15 г)
   - Сок 200 мл
   - Конфеты/мармеладки

**Правила тренировок:**
- Не тренироваться натощак!
- Мониторить ощущения каждые 15-20 мин
- Силовые безопаснее длительного кардио
- При симптомах → СТОП → 15 г быстрых углеводов → ждать 15 мин
- После купирования: можно продолжить при хорошем самочувствии
- Партнёр/инструктор должен знать о состоянии

**Для диабетиков на инсулине:**
- Глюкометр до, во время (>45 мин) и после тренировки
- ↓ Дозу инсулина перед тренировкой (по согласованию с врачом)
- Не вводить инсулин в работающую мышцу (↑ всасывание)
`;
}
export function getLymphedemaExercise(message: string): string {
  const triggers = ['лимфедем', 'lymphedema', 'лимфостаз', 'отёк рук', 'отёк ног лимф', 'лимфатич'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
💧 ТРЕНИРОВКИ ПРИ ЛИМФЕДЕМЕ:

**Почему тренировки помогают:**
- Мышечные сокращения = насос для лимфатической системы
- ↑ Лимфатический дренаж на 30-50%
- ↓ Объём конечности при регулярных тренировках
- Безопасно при правильном подходе (мета-анализ 2020)

**Программа:**

Силовые (2-3 раза/нед):
- Начать с ОЧЕНЬ лёгкого веса (0.5-1 кг)
- Прогрессия: +0.5 кг каждые 2 нед
- 2×10-15 повт → 3×10-15
- Компрессионный рукав/чулок ОБЯЗАТЕЛЬНО во время тренировки
- Поднятие поражённой конечности между подходами

Аэробные (5 раз/нед):
- Ходьба: 20-30 мин (начать с 10 мин)
- Плавание: идеально (гидростатическое давление = естественная компрессия)
- Велосипед: для нижних конечностей

Дыхательные (ежедневно):
- Диафрагмальное дыхание: ↑ лимфодренаж грудного протока
- 5-10 мин перед тренировкой

**Правила безопасности:**
- Компрессионное бельё ВСЕГДА при нагрузке
- Мониторинг окружности конечности (↑ >2 см = стоп)
- Не перегревать поражённую конечность
- Избегать: турникетный эффект (тугие резинки, манжеты)
- После тренировки: приподнять конечность на 15-20 мин
`;
}
export function getMultipleSclerosisExercise(message: string): string {
  const triggers = ['рассеянн склероз', 'multiple sclerosis', 'мс ', 'демиелинизац', 'рс диагноз'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🧠 ТРЕНИРОВКИ ПРИ РАССЕЯННОМ СКЛЕРОЗЕ (РС):

**Доказанные эффекты:**
- ↑ Нейропластичность и ремиелинизация
- ↑ Мышечная сила на 20-30% за 12 нед
- ↓ Усталость (главный симптом РС) на 25-40%
- ↑ Когнитивные функции
- ↑ Баланс и ↓ риск падений

**Ключевая проблема — феномен Утхоффа:**
- ↑ Температуры тела → временное ↑ симптомов
- Решение: охлаждающий жилет, прохладное помещение
- Плавание в прохладной воде (26-28°C) — идеально

**Программа:**

Силовые (2-3 раза/нед):
- Начать: 1-2×8-12, 40-50% 1ПМ
- Прогрессия: 2-3×10-12, 60-70% 1ПМ
- Тренажёры для безопасности (↓ риск падений)
- Унилатеральные упражнения для слабой стороны

Аэробные (3-5 раз/нед):
- 15-30 мин при 60-70% ЧСС макс
- Велотренажёр (безопасно при проблемах с балансом)
- Плавание (охлаждение + невесомость)
- Ходьба с поддержкой если нужно

Баланс и координация (ежедневно):
- Стойка на одной ноге (у стены для безопасности)
- Тандемная ходьба
- Тай-чи (↓ падения на 50%)

**Управление усталостью:**
- Тренироваться утром (↓ усталость)
- Короткие сессии (20-30 мин)
- Принцип «энергетического конверта»: не превышать 70% энергии
- Дни отдыха при обострениях
- Прохладная среда обязательна

**Противопоказания во время обострения:**
❌ Любая интенсивная нагрузка
✅ Лёгкая растяжка и ROM-упражнения
✅ Возвращение к тренировкам через 2-4 нед после обострения
`;
}
export function getParkinsonExerciseGuide(message: string): string {
  const triggers = ['паркинсон', 'parkinson', 'тремор', 'дрожь рук', 'экстрапирамидн'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🧠 ТРЕНИРОВКИ ПРИ БОЛЕЗНИ ПАРКИНСОНА:

**Доказанные эффекты:**
- ↑ Дофаминовые рецепторы (компенсация потери нейронов)
- ↓ Тремор и ригидность на 30-40%
- ↑ Баланс и ↓ падения на 50%
- ↑ Скорость ходьбы и длина шага
- Замедление прогрессирования заболевания

**Программа (3 компонента):**

1. Аэробные (3-5 раз/нед) — ПРИОРИТЕТ №1:
   - 30-40 мин при 60-80% макс ЧСС
   - Велотренажёр: 80+ об/мин (forced cycling ↑ дофамин!)
   - Ходьба на дорожке с удержанием за поручни
   - Танцы (танго доказанно ↑ баланс при Паркинсоне)

2. Силовые (2-3 раза/нед):
   - 2-3×10-12, 60-70% 1ПМ
   - Тренажёры для безопасности
   - Акцент на разгибатели (↓ сгибательная поза)
   - Медленный контролируемый темп

3. Баланс и гибкость (ежедневно):
   - Тай-чи: доказанно ↓ падения
   - Стойка на одной ноге (с поддержкой)
   - Растяжка сгибателей бедра, грудных (↓ сгибательная поза)
   - Громкое дыхание/вокализация (LSVT BIG/LOUD)

**Правила:**
- Тренироваться в «ON» период (когда лекарства работают)
- Партнёр/тренер рядом (риск падений)
- Музыка с чётким ритмом ↑ координацию
`;
}
export function getCOPDExerciseGuide(message: string): string {
  const triggers = ['хобл', 'copd', 'хронич обструктивн', 'эмфизем', 'хронич бронхит'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🫁 ТРЕНИРОВКИ ПРИ ХОБЛ:

**Зачем тренироваться при ХОБЛ:**
- ↑ Переносимость нагрузки на 18-25%
- ↓ Одышка при повседневных делах
- ↑ Дыхательная мускулатура
- ↓ Госпитализаций на 40%
- ↑ Качество жизни

**Программа:**

Аэробные (3-5 раз/нед):
- Ходьба: 20-30 мин (начать с 5-10 мин)
- Велотренажёр: 15-20 мин
- Интенсивность: по шкале одышки Борг 3-5 из 10
- Интервальный подход: 1 мин нагрузка → 2 мин отдых

Силовые (2-3 раза/нед):
- 2×8-12, 50-70% 1ПМ
- Акцент на верхнюю часть тела (дыхательные мышцы)
- Упражнения на крупные мышцы нижних конечностей
- Избегать задержки дыхания!

Дыхательные (ежедневно):
- Pursed-lip breathing: вдох носом 2 сек → выдох через губы 4 сек
- Диафрагмальное дыхание: 10 мин × 2 раза/день
- Тренировка вдыхательных мышц (IMT): дыхательный тренажёр

**Правила:**
- Ингалятор (бронходилататор) за 15-20 мин до тренировки
- Пульсоксиметр: SpO₂ >88% во время нагрузки
- Если SpO₂ <88% → снизить интенсивность или дополнительный O₂
- Не тренироваться при обострении ХОБЛ
- Разминка 10-15 мин (↓ бронхоспазм)
`;
}
export function getHeartFailureExercise(message: string): string {
  const triggers = ['сердечн недостаточност', 'heart failure', 'хсн', 'фракция выброс', 'ejection fraction'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
❤️ ТРЕНИРОВКИ ПРИ ХРОНИЧЕСКОЙ СЕРДЕЧНОЙ НЕДОСТАТОЧНОСТИ:

**Важно:** только после разрешения кардиолога!

**Доказанные эффекты:**
- ↑ VO₂peak на 15-20% (ключевой прогностический фактор)
- ↓ Госпитализаций на 28%
- ↑ Фракция выброса на 2-4%
- ↓ Натрийуретические пептиды
- ↑ Качество жизни (анкета Kansas City +5-10 баллов)

**Программа (по стадиям NYHA):**

NYHA I-II (лёгкая-умеренная):
- Кардио: 20-30 мин, 3-5 раз/нед, 60-70% ЧСС макс
- Силовые: 2 раза/нед, 2×12-15, 40-60% 1ПМ
- Интервальные: 4×4 мин при 85-95% peak VO₂ (под контролем!)

NYHA III (выраженная):
- Кардио: 10-15 мин, 3 раза/нед, 50-60% ЧСС макс
- Силовые: 1×10-12, 30-50% 1ПМ
- Дыхательные упражнения (IMT)
- Постепенное ↑ продолжительности

**Стоп-сигналы:**
🚨 Одышка в покое
🚨 ↑ Отёков (↑ массы тела >2 кг за 2 дня)
🚨 ЧСС >120 или <40
🚨 АД >180/110 или систолическое <90
🚨 Головокружение/предобморок
🚨 Боль в груди

**Правила:**
- Монитор ЧСС обязателен
- Не тренироваться при декомпенсации
- Вес ежедневно утром (контроль жидкости)
- ↓ Интенсивность в жару/влажность
`;
}
export function getTMJExerciseGuide(message: string): string {
  const triggers = ['внчс', 'tmj', 'челюсть', 'челюстн сустав', 'бруксизм', 'щёлкает челюсть'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦷 ТРЕНИРОВКИ ПРИ ДИСФУНКЦИИ ВНЧС:

**Связь тренировок и ВНЧС:**
- Сжимание зубов при натуживании → ↑ нагрузка на ВНЧС
- Вальсальва → ↑ давление → ↑ бруксизм
- Стресс от тренировок → ↑ напряжение жевательных мышц

**Упражнения для ВНЧС (3 раза/день):**

1. Расслабление: язык к нёбу, зубы разомкнуты — удержание 30 сек
2. Контролируемое открывание: палец на подбородке, медленно открыть без отклонения — 10×
3. Боковые движения: нижняя челюсть вправо/влево (5 мм) — 10× в каждую сторону
4. Резистивное открывание: кулак под подбородок, открывать рот против сопротивления — 10×
5. Растяжка: медленно открыть рот максимально + удержать 5 сек — 5×

**Модификации при тренировках в зале:**
- Капа (mouthguard) при тяжёлых подходах — ↓ давление на ВНЧС на 60%
- Сознательно расслаблять челюсть между подходами
- Выдыхать через рот при усилии (не сжимать зубы)
- ↓ Нагрузку если замечаете сжатие зубов

**Массаж перед тренировкой:**
- Жевательная мышца: круговые движения 2 мин
- Височная мышца: от виска к уху, 1 мин
- Подъязычные мышцы: мягкое давление под подбородком, 1 мин
- Тёплый компресс на область ВНЧС 5-10 мин
`;
}
export function getEhlersDanlosExercise(message: string): string {
  const triggers = ['элерс', 'ehlers', 'данлос', 'гипермобильн', 'суставы разболтан', 'связки слабые'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🤸 ТРЕНИРОВКИ ПРИ ГИПЕРМОБИЛЬНОСТИ / ЭЛЕРСА-ДАНЛОСА:

**Проблема:**
- Избыточная подвижность суставов → нестабильность → травмы
- Частые подвывихи/вывихи
- Хроническая боль от нестабильности
- Парадокс: нужна сила без избыточной растяжки

**Принципы тренировок:**
1. НИКОГДА не растягивать до конца ROM (оставлять 10-15°)
2. Стабилизация > мобильность (мышцы компенсируют слабость связок)
3. Медленный контролируемый темп (2-1-2-1)
4. Избегать «лока» суставов в крайних позициях
5. Тренажёры > свободные веса (контролируемая амплитуда)

**Рекомендованные упражнения:**
✅ Изометрические: 5×10 сек удержания (укрепляют без амплитуды)
✅ Тренажёры с ограничением ROM
✅ Упражнения в закрытой кинетической цепи (приседания, отжимания)
✅ Проприоцептивные: баланс-борд, босу
✅ Аквааэробика (поддержка + нагрузка)

❌ Йога (особенно «продвинутые» позы — углубляет проблему!)
❌ Растяжка ради гибкости
❌ Прыжки и плиометрика
❌ Тяжёлые нагрузки до формирования нервно-мышечного контроля
❌ Упражнения с переразгибанием суставов

**Стабилизация суставов (приоритет):**
- Плечи: ротаторная манжета, лопаточные стабилизаторы
- Колени: VMO (мед. широкая бедра), хамстринги
- Голеностоп: перонеальные мышцы, баланс
- Кор: планки, bird-dog, dead bug (не кранчи!)
`;
}
export function getAutismExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['аутизм', 'autism', 'расстройств аутист', 'рас ', 'аспергер', 'сенсорн перегрузк'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🧩 ТРЕНИРОВКИ ПРИ РАССТРОЙСТВАХ АУТИСТИЧЕСКОГО СПЕКТРА:

Сенсорная адаптация зала:
- Избегай пиковые часы (шум, толпа = перегрузка)
- Наушники с шумоподавлением — допустимы и рекомендованы
- Привычный маршрут по залу снижает тревогу
- Одна и та же стойка/тренажёр = якорь стабильности

Структура тренировки:
- Жёсткий план: упражнение → подходы → повторы → отдых — всё расписано
- Визуальный таймер (не звуковой) для отдыха между подходами
- Предсказуемость > вариативность: менять программу раз в 4-6 нед
- Рутина: одни дни, одно время, один порядок

Предпочтительные упражнения:
- Тренажёры > свободные веса (предсказуемая траектория)
- Ритмичные движения: гребной тренажёр, велоэргометр
- Проприоцептивная нагрузка: жим ногами, присед в Смите
- Плавание — отличная сенсорная интеграция

Чего избегать:
- Групповые занятия (непредсказуемость)
- Упражнения с партнёром (социальный стресс)
- Внезапная смена плана тренером
- Громкая музыка в зале — проси убавить или используй свои наушники
`;
}
export function getCerebralPalsyExercise(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['дцп', 'церебральн паралич', 'cerebral palsy', 'спастичност', 'спастик'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
♿ ТРЕНИРОВКИ ПРИ ДЦП (ЦЕРЕБРАЛЬНЫЙ ПАРАЛИЧ):

Принципы:
- Спастичность снижается после 10-15 мин лёгкого кардио (разогрев критичен)
- Тренажёры с фиксацией > свободные веса (контроль траектории)
- Унилатеральная работа: компенсация асимметрии сторон
- Растяжка после КАЖДОГО рабочего подхода (профилактика контрактур)

Рекомендуемые упражнения:
- Велоэргометр с фиксацией стоп (кардио + координация)
- Жим ногами (безопасная нагрузка на НК)
- Тренажёры с сиденьем: жим от груди, тяга к поясу
- Гребной тренажёр (если позволяет хват)
- Аквааэробика — снижает спастичность на 30-40%

Развитие функциональности:
- Баланс: стойка на одной ноге с опорой → без опоры
- Координация: бросание мяча, ловля с разных сторон
- Мелкая моторика: хват гантели, переключение хватов

Безопасность:
- Страхующий всегда рядом при свободных весах
- Не допускать переутомления — усиливает спастичность
- Перерыв при появлении непроизвольных движений
- Прогресс медленный — 5% нагрузки раз в 2-3 недели
`;
}
export function getDownSyndromeExercise(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['синдром даун', 'down syndrome', 'трисомия 21', 'даун'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
💛 ТРЕНИРОВКИ ПРИ СИНДРОМЕ ДАУНА:

Особенности:
- Атлантоаксиальная нестабильность (15% случаев) — ЗАПРЕТ кувырков, стоек на голове
- Гипотония мышц — требует больше силовой работы
- Гипермобильность суставов — контроль амплитуды
- Врождённые пороки сердца (40-50%) — обязательно разрешение кардиолога

Программа силовых:
- Начало: тренажёры (фиксированная траектория)
- Прогрессия: 2-3 мес тренажёры → свободные веса с малыми весами
- 2-3 подхода × 10-15 повторений, отдых 90-120 сек
- Акцент на постуральные мышцы: спина, кор, ягодицы

Кардио:
- Ходьба 20-30 мин, ЧСС 50-60% от максимума
- Велоэргометр, эллипс (низкая ударная нагрузка)
- Танцевальные элементы — высокая мотивация + координация

Мотивация:
- Короткие блоки (10-15 мин), частые переключения
- Визуальные инструкции (картинки упражнений)
- Позитивное подкрепление после каждого подхода
- Постоянный напарник / тренер = стабильность
`;
}
export function getBlindVisualImpairedTraining(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['слеп', 'слабовидящ', 'blind', 'нарушени зрен', 'незряч', 'потеря зрен'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
👁️ ТРЕНИРОВКИ ПРИ НАРУШЕНИЯХ ЗРЕНИЯ:

Ориентация в зале:
- Первые 2-3 визита — обход зала с сопровождающим, запоминание расположения
- Тактильные ориентиры: стена → 3 шага → стойка для приседа
- Тренажёры всегда на одних местах — проси персонал не переставлять
- Личный тренер или напарник первые 1-2 месяца

Безопасные упражнения:
- Тренажёры > свободные веса (предсказуемая траектория)
- Блочные рамы: верхняя тяга, нижняя тяга, кроссовер
- Жим ногами, гак-присед (фиксированная траектория)
- Гребной тренажёр, велоэргометр (кардио без риска)

Свободные веса (с опытом):
- Жим лёжа — ТОЛЬКО со страхующим
- Присед — в Смите или силовой раме с ограничителями
- Гантели — сидя на скамье с опорой спины
- Тактильная обратная связь: рука тренера на целевую мышцу

Проприоцепция (преимущество!):
- Слабовидящие часто имеют лучшую проприоцепцию
- Связь «мозг-мышца» развита сильнее — используй это
- Изометрические удержания — отличное чувство мышцы
`;
}
export function getDeafTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['глух', 'deaf', 'слабослыш', 'нарушени слух', 'слуховой аппарат', 'кохлеарн'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🦻 ТРЕНИРОВКИ ПРИ НАРУШЕНИЯХ СЛУХА:

Коммуникация в зале:
- Визуальные сигналы со страхующим: палец вверх = ОК, ладонь = стоп
- Зеркало — для контроля техники без вербальной коррекции
- Вибрационный таймер на запястье (вместо звукового)
- Видео с техникой — лучше текстовых инструкций

Преимущества глухих атлетов:
- Меньше отвлекающих факторов (разговоры, музыка)
- Лучшая визуальная концентрация на технике
- Усиленное чувство вибрации — помогает при взрывных движениях
- Высокая способность к сосредоточению

Безопасность:
- Всегда в поле зрения других занимающихся
- Зеркала — не только для техники, но и для обзора
- Не надевать наушники (иллюзия слуха мешает ориентации)
- При работе со штангой — визуальный контакт со страхующим ДО подхода

Вестибулярный аппарат:
- У 30-40% глухих — нарушения вестибулярки
- Если есть — избегать резких смен положения тела
- Балансовые упражнения с опорой рядом
- Не закрывать глаза при упражнениях на баланс
`;
}
export function getAmputeeTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['ампутац', 'amputee', 'протез', 'культ', 'потеря конечност', 'без руки', 'без ноги'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🦿 ТРЕНИРОВКИ ПОСЛЕ АМПУТАЦИИ:

Верхняя конечность (рука/кисть):
- Унилатеральная работа здоровой рукой: гантели, блоки
- Тренажёры с адаптацией: крепление манжетой к культе (если длина позволяет)
- Кор и ноги — без ограничений (присед, жим ногами, становая)
- Компенсация асимметрии: усиленная работа кора для стабилизации

Нижняя конечность (нога):
- С протезом: ходьба, велоэргометр, эллипс (адаптированный)
- Без протеза: верхний плечевой пояс — без ограничений
- Жим лёжа, тяги, жимы стоя с опорой
- Сидячие тренажёры: жим от груди, тяга к поясу, разгибания/сгибания здоровой ноги

Фантомные боли:
- Зеркальная терапия перед тренировкой (10-15 мин) снижает боль
- Тренировка отвлекает от фантомных ощущений
- Если боль усиливается во время тренировки — снизить интенсивность
- Массаж культи перед тренировкой

Адаптивное оборудование:
- Манжеты-крепления для культи
- Адаптированные грифы
- Ремни для фиксации протеза на педалях
- Специальные перчатки с усиленным хватом
`;
}
export function getPostCancerExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['онколог', 'рак', 'cancer', 'химиотерап', 'лучев терап', 'ремисси', 'после рака'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🎗️ ТРЕНИРОВКИ ПОСЛЕ ОНКОЛОГИЧЕСКОГО ЛЕЧЕНИЯ:

Когда можно начинать:
- С разрешения онколога (обязательно!)
- Через 2-4 недели после операции (лёгкие прогулки)
- Через 4-8 недель — лёгкие силовые
- Во время химиотерапии — можно тренироваться в «хорошие» дни цикла

Особенности после химиотерапии:
- Кардиотоксичность: ЧСС не выше 60-70% от максимума
- Нейтропения: если лейкоциты < 3.0 — тренироваться дома, не в зале
- Нейропатия (онемение конечностей): тренажёры > свободные веса
- Усталость (cancer-related fatigue): парадокс — лёгкая активность СНИЖАЕТ усталость

После мастэктомии:
- Лимфедема руки — избегать подъёмы >5 кг поражённой рукой первые 3 мес
- Компрессионный рукав при силовых
- Прогрессия: 0.5 кг за раз, следить за отёком
- Растяжка грудных мышц ежедневно

Программа:
- 2-3 раза в неделю, 20-30 мин
- RPE 3-5 из 10 (лёгко — умеренно)
- Прогрессия: +5-10% нагрузки каждые 2 недели
- Приоритет: ходьба, тренажёры, лёгкие гантели, растяжка
- Дни после химии: только лёгкая ходьба или отдых
`;
}
export function getOsteoarthritisExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['остеоартроз', 'остеоартрит', 'osteoarthritis', 'артроз', 'коксартроз', 'гонартроз'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🦴 ТРЕНИРОВКИ ПРИ ОСТЕОАРТРОЗЕ:

Ключевой принцип: ДВИЖЕНИЕ — ЛЕКАРСТВО
- Хрящ питается через движение (диффузия синовиальной жидкости)
- Бездействие УХУДШАЕТ артроз, а не помогает
- Умеренная нагрузка замедляет прогрессирование на 30-50%

Коленный артроз (гонартроз):
- ДА: велоэргометр, жим ногами (неполная амплитуда 0-60°), разгибания (верхняя 1/3)
- ДА: ходьба 30-40 мин (ровная поверхность)
- НЕТ: глубокий присед, выпады с большим весом, прыжки
- Укрепление квадрицепса снижает боль на 25-30%
- Изометрические сокращения: прижать колено к полу, держать 10 сек × 10

Тазобедренный артроз (коксартроз):
- ДА: плавание, велоэргометр, мостик ягодичный
- ДА: отведение бедра лёжа, разгибание бедра стоя
- НЕТ: глубокое сгибание бедра (>90°), широкие выпады
- Растяжка сгибателей бедра ежедневно

Общие рекомендации:
- Разминка 15 мин (не 5!) — суставам нужно время
- Лёд после тренировки 10-15 мин на сустав
- Глюкозамин + хондроитин — доказательства слабые, но безвредны
- Омега-3: 2-3 г/день — снижает воспаление
- Снижение веса на 5 кг = снижение нагрузки на колено на 20 кг
`;
}
export function getCrohnsColitisExercise(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['крон', 'crohn', 'колит', 'colitis', 'воспалительн заболеван кишечн', 'вз к', 'язвенн колит'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🫁 ТРЕНИРОВКИ ПРИ БОЛЕЗНИ КРОНА / ЯЗВЕННОМ КОЛИТЕ:

В ремиссии:
- Тренировки без ограничений (с поправкой на самочувствие)
- 3-4 раза в неделю, силовые + кардио
- Интенсивность: RPE 6-8 из 10
- Анаболический эффект силовых компенсирует катаболизм болезни

В обострении:
- Лёгкая ходьба 15-20 мин (если позволяет состояние)
- Растяжка, дыхательные упражнения
- Полный покой при тяжёлом обострении
- Возвращение к нагрузкам через 1-2 нед после купирования

Специфика:
- Анемия (частая при ВЗК) — снижает выносливость: следи за ЧСС
- Стеноз → избегать натуживания (Вальсальва) — мягкий выдох на усилии
- Стома (если есть) — поддерживающий пояс, избегать прямой давление
- Обезвоживание: пить 200 мл каждые 15 мин тренировки

Питание при ВЗК + тренировки:
- Белок: 1.5-2 г/кг (компенсация мальабсорбции)
- Приём пищи за 2-3 часа до тренировки (не позже)
- Избегать FODMAP-продукты перед тренировкой
- Электролиты обязательно при диарее
- Железо, В12, фолиевая — мониторить регулярно
`;
}
export function getADHDExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['сдвг', 'adhd', 'дефицит вниман', 'гиперактивност', 'невнимательност'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
⚡ ТРЕНИРОВКИ ПРИ СДВГ:

Почему спорт = лекарство при СДВГ:
- 30 мин кардио = +20% дофамина и норадреналина на 2-3 часа
- Эффект сравним с низкой дозой метилфенидата
- Тренировка утром → лучшая концентрация весь день
- Регулярные занятия снижают симптомы на 30-40%

Идеальные форматы:
- HIIT: короткие интервалы (20-40 сек) = постоянная смена → нет скуки
- Круговая тренировка: 8-10 станций по 45 сек = разнообразие + интенсивность
- Единоборства: внимание, координация, дисциплина
- Скалолазание: требует полной концентрации — идеальный «поток»

Адаптации:
- Короткие тренировки (30-40 мин) > длинные (60+ мин)
- Музыка в наушниках — фокус и блокировка отвлекающих факторов
- Таймер на каждый подход — структура без напряжения
- Менять программу каждые 3-4 недели (скука = враг СДВГ)
- Суперсеты: двигаешься без пауз = меньше шансов отвлечься

Чего избегать:
- Длинные паузы между подходами (3-5 мин) — потеряешь фокус
- Монотонные кардио-сессии (40 мин на дорожке)
- Сложные программы с кучей мелких деталей
`;
}
export function getLupusExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['волчанк', 'lupus', 'сле ', 'системн красн'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🦋 ТРЕНИРОВКИ ПРИ СИСТЕМНОЙ КРАСНОЙ ВОЛЧАНКЕ:

В ремиссии:
- Силовые 2-3 раза/нед, умеренная интенсивность (RPE 5-7)
- Кардио 3-5 раз/нед, 20-30 мин, ЧСС 50-70% от макс
- Плавание — отлично (щадит суставы, охлаждает)

При обострении:
- Снизить интенсивность до минимума или полный отдых
- Лёгкая растяжка, ходьба 10-15 мин
- Не тренироваться при лихорадке, сыпи, артрите

Специфика:
- Фотосенсибилизация: тренировки в помещении, избегать окон с прямым светом
- Суставы: упражнения без ударной нагрузки (велоэргометр, эллипс)
- Кортикостероиды → остеопороз: силовые обязательны для костей
- Нефрит: мониторить давление до/после тренировки
- Усталость (90% пациентов): парадокс — регулярные тренировки снижают усталость

Важно:
- Разминка 15 мин (суставы + мышцы)
- Не тренироваться в жару (ухудшает симптомы)
- Следить за ЧСС — тахикардия может быть признаком обострения
- Витамин D: контроль уровня (часто дефицит при СКВ)
`;
}
export function getPostCovidExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['постковид', 'post-covid', 'long covid', 'после ковид', 'после коронавирус', 'лонг ковид'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🦠 ТРЕНИРОВКИ ПОСЛЕ COVID-19 (ПОСТКОВИДНЫЙ СИНДРОМ):

Фазы возвращения (WHO протокол):
1. Фаза 1 (нед 1-2): дыхательные упражнения, растяжка, ходьба 10-15 мин
2. Фаза 2 (нед 3-4): ходьба 20-30 мин, лёгкие упражнения с собственным весом
3. Фаза 3 (нед 5-6): лёгкие силовые (30-40% от прежних весов), кардио 20 мин
4. Фаза 4 (нед 7-8): увеличение до 50-60% прежней нагрузки
5. Фаза 5 (нед 9+): полное возвращение к нормальной программе

Красные флаги — СТОП тренировки:
- ЧСС >100 в покое или >140 при лёгкой нагрузке
- SpO2 <95% (пульсоксиметр обязателен!)
- Одышка при разговоре
- Боль в груди, головокружение
- Ухудшение симптомов через 24 ч после тренировки (PEM)

Постковидный синдром:
- «Мозговой туман»: тренировки улучшают когнитивные функции
- Усталость: начинать с 50% ожидаемой нагрузки
- Тахикардия: приоритет дыхательных упражнений + ходьба
- Миалгии: растяжка, лёгкий массаж, тепло

Правило: если после тренировки хуже на следующий день — нагрузка была слишком высокой. Снизить на 30%.
`;
}
export function getPsoriasisExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['псориаз', 'psoriasis', 'бляшк', 'чешуйчат лишай'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🧴 ТРЕНИРОВКИ ПРИ ПСОРИАЗЕ:

Польза тренировок:
- Снижение системного воспаления (TNF-α, IL-6)
- Контроль веса — ожирение ухудшает псориаз на 50%
- Стресс → обострение, а тренировки снижают кортизол
- Регулярные занятия снижают тяжесть на 20-30%

Адаптации:
- Одежда: дышащая, свободная, без трения о бляшки
- Пот: может раздражать → душ СРАЗУ после тренировки
- Хлорированная вода (бассейн): может ухудшить → душ + увлажняющий крем после
- Холодные помещения лучше жарких (пот = раздражение)

Выбор упражнений:
- Тренажёры > свободные веса (меньше трения об одежду/скамью)
- Полотенце на скамью (гигиена + комфорт)
- Перчатки при бляшках на ладонях
- Велоэргометр > бег (меньше трения)

Псориатический артрит (30% пациентов):
- Мягкая разминка 15 мин обязательна
- Изометрические упражнения при воспалении суставов
- Аквааэробика — идеально (невесомость + прохлада)
- Не тренировать воспалённые суставы до купирования
`;
}
export function getEndometriosisExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['эндометриоз', 'endometriosis', 'аденомиоз'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🌸 ТРЕНИРОВКИ ПРИ ЭНДОМЕТРИОЗЕ:

Польза движения:
- Снижает уровень эстрогена (который стимулирует эндометриоз)
- Эндорфины = природное обезболивание
- Снижает воспаление и спаечный процесс
- Улучшает кровоток в малом тазу

Во время обострения/менструации:
- Лёгкая ходьба 15-20 мин
- Растяжка (мягкая, без натуживания)
- Йога: поза ребёнка, кошка-корова, бабочка
- Тепло на низ живота перед тренировкой

В безболевой период:
- Силовые 2-3 раза/нед, умеренная интенсивность
- Кардио 3-4 раза/нед, 20-30 мин
- Плавание — отлично (расслабление + нагрузка)

Чего избегать:
- Тяжёлые приседания и становые при обострении
- Упражнения с сильным натуживанием (Вальсальва)
- Прыжки и ударная нагрузка при болях
- Перетренировка: избыток кортизола ухудшает воспаление

Тазовое дно:
- Упражнения Кегеля (после консультации с врачом!)
- Часто при эндометриозе тазовое дно в ГИПЕРТОНУСЕ → нужно расслаблять, а не сжимать
- Дыхание: вдох = расслабление тазового дна, выдох = мягкое сокращение
`;
}
export function getHypothyroidExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['гипотиреоз', 'hypothyroid', 'щитовидк снижен', 'тироксин', 'т4 низк', 'ттг повышен'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🦋 ТРЕНИРОВКИ ПРИ ГИПОТИРЕОЗЕ:

Метаболизм замедлен — адаптации:
- Жиросжигание медленнее: не сравнивай с нормотиреозом
- Утомляемость выше: начинай с 60-70% обычной нагрузки
- Восстановление дольше: 48-72 ч между силовыми на одну группу

Силовые (приоритет #1):
- 3 раза/нед, базовые многосуставные упражнения
- 3-4 подхода × 8-12 повторений
- Тяжёлые веса (относительно) → стимуляция метаболизма
- Рост мышечной массы = повышение основного обмена

Кардио:
- Умеренное 3-4 раза/нед, 20-30 мин
- ЧСС 60-70% от максимума (бета-блокаторы? пересчитай)
- Утренние тренировки натощак могут быть слишком тяжелы → лёгкий перекус
- HIIT: ограничить 1-2 раза/нед (стресс → кортизол → ТТГ↑)

Частые проблемы:
- Отёки, набор веса: силовые + ходьба > агрессивное кардио
- Суставные боли: разминка 15 мин обязательна, мягкие упражнения
- Зябкость: одевайся теплее, разминка длиннее
- Запоры: тренировки улучшают моторику ЖКТ

Питание:
- Дефицит калорий не более 300-400 ккал (не агрессивные диеты!)
- Белок 1.6-2 г/кг — защита мышечной массы
- Селен 200 мкг + цинк 15 мг — поддержка конверсии Т4→Т3
- Левотироксин: принимать натощак, тренировка через 30-60 мин
`;
}
export function getVertigoExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['вертиго', 'vertigo', 'дппг', 'головокружени', 'вестибулярн'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🌀 ТРЕНИРОВКИ ПРИ ВЕРТИГО / ВЕСТИБУЛЯРНЫХ НАРУШЕНИЯХ:

ДППГ (доброкачественное позиционное):
- Манёвр Эпли перед тренировкой (если назначен врачом)
- Избегать резкие наклоны головы вниз (гиперэкстензия, наклоны)
- Не ложиться резко на скамью — сесть → медленно откинуться
- Первые 2-3 нед после эпизода: только сидячие тренажёры

Безопасные упражнения:
- Тренажёры сидя: жим от груди, тяга к поясу, жим ногами
- Блочные рамы (стоя с опорой если нужно)
- Велоэргометр (фиксированное положение головы)
- Упражнения сидя: жим гантелей сидя, сгибания рук

Опасные упражнения (избегать):
- Наклоны вниз: румынская тяга, гуд-морнинг
- Резкие вставания: бёрпи, подъёмы с пола
- Упражнения с запрокинутой головой
- Турник (голова запрокинута назад)

Вестибулярная реабилитация (упражнения):
- Фиксация взгляда при поворотах головы (20 повторений)
- Ходьба с поворотами головы влево-вправо
- Стойка на мягкой поверхности (пенный коврик)
- Прогрессия: открытые глаза → закрытые → нестабильная поверхность

Общие правила:
- Всегда иметь опору рядом (стена, стойка)
- Не тренироваться при активном головокружении
- Пить достаточно воды (обезвоживание усиливает вертиго)
`;
}
export function getRaynaudExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['рейно', 'raynaud', 'белеют пальцы', 'спазм сосудов', 'холодные руки немеют'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🥶 ТРЕНИРОВКИ ПРИ СИНДРОМЕ РЕЙНО:

Провоцирующие факторы в зале:
- Холод: кондиционер, холодный гриф, сквозняки
- Вибрация: тяжёлые штанги, ударные нагрузки
- Стресс: перетренировка, соревновательный настрой
- Сжатие: тугой хват, тяжёлые кистевые лямки

Защита:
- Перчатки для тренировок (всегда, даже летом)
- Разминка рук: сжимания-разжимания, вращения кистей, 3-5 мин
- Тёплая одежда, слоями (не мёрзнуть!)
- Химические грелки в карманах (между подходами)

Безопасные упражнения:
- Тренажёры с мягкими ручками (не холодный металл)
- Блочные рамы (резиновые рукояти)
- Кардио с разогревом: велоэргометр, эллипс
- Упражнения с собственным весом (нет холодного грифа)

При приступе (побеление пальцев):
- Немедленно прекратить упражнение
- Опустить руки вниз, потрясти, помассировать
- Тёплая вода (подставить руки под кран)
- Подождать полного восстановления кровотока
- Продолжить тренировку через 10-15 мин

Кардио = лекарство:
- Регулярное кардио улучшает периферическое кровообращение
- 30 мин 4-5 раз/нед = снижение частоты приступов на 30-40%
- Ходьба, велоэргометр, плавание в тёплой воде
`;
}
export function getPTSDExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['птср', 'ptsd', 'посттравматическ', 'травматическ стресс', 'флешбэк'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🛡️ ТРЕНИРОВКИ ПРИ ПТСР:

Почему тренировки помогают:
- Снижают гиперактивацию симпатической нервной системы
- Регулярные занятия уменьшают тревогу и флешбэки на 30-50%
- Чувство контроля над телом = восстановление агентности
- Эндорфины и эндоканнабиноиды = природные анксиолитики

Безопасная среда:
- Избегай переполненных залов (гипербдительность)
- Позиция в зале: спиной к стене, лицом ко входу
- Наушники с шумоподавлением — снижают триггеры
- Постоянное время и место = предсказуемость

Рекомендации:
- Силовые: контроль и мощь → восстановление уверенности
- Бокс/груша: безопасная разрядка агрессии
- Йога (trauma-sensitive): доказанная эффективность при ПТСР
- Плавание: сенсорная изоляция, ритмичное дыхание

Адаптации:
- Не стоять над клиентом (триггер доминирования)
- Предупреждать о касаниях заранее (коррекция техники)
- Упражнения лёжа на спине могут быть триггером → замена на сидячие
- При панической атаке: заземление (5-4-3-2-1), дыхание 4-7-8
`;
}
export function getBipolarExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['биполярн', 'bipolar', 'маниакальн', 'мания', 'бар '];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🔄 ТРЕНИРОВКИ ПРИ БИПОЛЯРНОМ РАССТРОЙСТВЕ:

Маниакальная фаза:
- ОГРАНИЧИВАЙ интенсивность (кажется что можешь всё — это мания)
- RPE не выше 6-7, не повышать веса
- Короткие тренировки (30 мин макс)
- Структурированная программа — не импровизация
- Риск травмы повышен из-за переоценки возможностей

Депрессивная фаза:
- Любое движение лучше бездействия — даже 10 мин ходьбы
- Не ждать мотивации — начни с разминки, дальше легче
- Снизить ожидания: 50% обычной нагрузки = отлично
- Утренние тренировки помогают стабилизировать циркадный ритм

Стабилизация:
- Регулярный режим тренировок = стабилизация настроения
- Одно и то же время, одни дни — ритм = якорь
- Кардио 30 мин, 3-4 раза/нед = антидепрессивный эффект
- Силовые 2-3 раза/нед = структура и достижения

Лекарства и тренировки:
- Литий: обезвоживание усиливает токсичность → пить 200 мл/15 мин
- Вальпроат: может снижать координацию → осторожно со свободными весами
- Кветиапин: метаболический синдром → силовые + кардио обязательны
- Не тренироваться при температуре >30°C если на литии
`;
}
export function getOCDExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['окр', 'ocd', 'обсессивн', 'компульсивн', 'навязчив мысл'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🔁 ТРЕНИРОВКИ ПРИ ОКР (ОБСЕССИВНО-КОМПУЛЬСИВНОЕ РАССТРОЙСТВО):

Почему помогает:
- Кардио 30 мин снижает навязчивые мысли на 30-40% на 2-3 часа
- Переключение внимания на тело = разрыв цикла обсессий
- Серотонин↑ = тот же механизм что у СИОЗС

Ловушки ОКР в зале:
- Компульсивный подсчёт повторений (пересчитывание)
- Ритуальный порядок упражнений (паника если нарушен)
- Перфекционизм техники (бесконечная коррекция)
- Компульсивные тренировки (нельзя пропустить = тревога)

Стратегии:
- Намеренное нарушение порядка: начни с последнего упражнения
- «Достаточно хорошо» > «идеально» (экспозиция)
- Таймер на подход (начал → остановился по таймеру, не по числу повторов)
- Разрешение пропустить тренировку без «наказания»

Программа:
- 3-4 раза/нед (не каждый день — день отдыха = экспозиция)
- Кардио: бег, плавание (ритмичные, медитативные)
- Силовые: фокус на ощущениях, не на числах
- Йога/растяжка: осознанность без перфекционизма
`;
}
export function getSchizophreniaExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['шизофрен', 'schizophreni', 'психоз', 'антипсихотик', 'галлюцинац'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🧠 ТРЕНИРОВКИ ПРИ ШИЗОФРЕНИИ:

Метаболические проблемы (из-за антипсихотиков):
- Набор веса 5-15 кг за первый год приёма
- Метаболический синдром у 30-40% пациентов
- Диабет 2 типа в 2-3 раза чаще
- Тренировки = критически важная компенсация

Программа:
- Начало: 2 раза/нед × 20 мин → постепенно до 3-4 × 30-45 мин
- Простые упражнения, минимум инструкций
- Тренажёры (безопасность, простота)
- Повторяющаяся программа (стабильность)

Кардио (приоритет):
- Ходьба 30 мин — самое доступное и эффективное
- Велоэргометр (сидя, безопасно)
- Эллипс (низкая ударная нагрузка)
- ЧСС 50-65% от максимума

Когнитивные бонусы:
- Аэробные тренировки улучшают когнитивные функции
- BDNF↑ (нейротрофический фактор) — нейропротекция
- Улучшение рабочей памяти и внимания
- Социализация в зале — структурированное общение

Безопасность:
- Ортостатическая гипотензия (антипсихотики): вставать медленно
- Поздняя дискинезия: адаптировать упражнения
- Не тренироваться при остром психозе
- Личный тренер / сопровождающий рекомендован
`;
}
export function getEatingDisorderExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['расстройств пищев', 'анорекси', 'булими', 'eating disorder', 'компульсивн перееда', 'орторекси'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
⚠️ ТРЕНИРОВКИ ПРИ РАССТРОЙСТВАХ ПИЩЕВОГО ПОВЕДЕНИЯ:

ВАЖНО: тренировки при РПП — двойное лезвие. Только с разрешения врача/психотерапевта!

Анорексия:
- Тренировки ЗАПРЕЩЕНЫ при ИМТ <17.5 или нестабильных витальных
- Компульсивные тренировки — часть болезни, не здоровья
- Возвращение: только после стабилизации веса, с психотерапевтом
- Начало: ходьба 15-20 мин, 2-3 раза/нед
- Никаких калорийных трекеров и счётчиков!

Булимия:
- Тренировка НЕ должна быть «компенсацией» за еду
- Если тренируешься после переедания — это компульсия, не фитнес
- Цель: удовольствие от движения, не «сжигание калорий»
- Силовые лучше кардио (меньше ассоциация с «сжиганием»)

Компульсивное переедание:
- Тренировки помогают регулировать эмоции
- Не наказывать себя тренировкой за переедание
- Фокус: сила, выносливость, настроение — не вес/калории
- Регулярный режим (не «марафон после срыва»)

Общие правила:
- Не отслеживать калории сожжённые
- Не взвешиваться в зале
- Цели: «поднять Х кг», «пробежать 5 км» — не «похудеть»
- Тренер должен знать о диагнозе
`;
}
export function getAlzheimerExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['альцгеймер', 'alzheimer', 'деменц', 'когнитивн нарушен', 'старческ слабоум'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🧓 ТРЕНИРОВКИ ПРИ БОЛЕЗНИ АЛЬЦГЕЙМЕРА / ДЕМЕНЦИИ:

Доказанная эффективность:
- Аэробные тренировки замедляют прогрессирование на 30-40%
- BDNF↑ = нейропротекция гиппокампа (центр памяти)
- Улучшение сна, настроения, поведенческих симптомов
- Снижение риска падений на 30-50%

Ранняя стадия:
- Самостоятельные тренировки с простой программой
- 3-4 раза/нед: 30 мин ходьба + 20 мин простые силовые
- Тренажёры (безопасность, простота)
- Записывать программу крупным шрифтом (визуальная подсказка)

Средняя стадия:
- Только с сопровождающим / тренером
- Простые движения: ходьба, подъём со стула, жим сидя
- 20-30 мин, показывая движения (не объясняя словами)
- Музыка из молодости = лучшая мотивация

Поздняя стадия:
- Пассивные движения (с помощью)
- Сидячие упражнения: подъёмы рук, разгибания ног
- Ходьба с поддержкой 10-15 мин
- Сенсорная стимуляция: мячи разной текстуры

Безопасность:
- Риск падений высок — убрать все препятствия
- Не оставлять одного у тренажёров
- Простые команды, показ, зеркальное повторение
- Одежда с нескользящей подошвой
`;
}
export function getAutoimmuneExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['аутоиммунн', 'autoimmune', 'иммунн систем атак', 'аутоиммунит'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🛡️ ТРЕНИРОВКИ ПРИ АУТОИММУННЫХ ЗАБОЛЕВАНИЯХ (ОБЩИЕ ПРИНЦИПЫ):

Золотое правило: умеренность
- Слишком мало → атрофия, усталость, депрессия
- Слишком много → обострение воспаления, флейр
- «Зона Голдилокс»: RPE 5-6, не до отказа

Во время ремиссии:
- Силовые 2-3 раза/нед, 3 подхода × 10-12 повторов
- Кардио 3-4 раза/нед, 20-30 мин, умеренно
- Растяжка/йога 2-3 раза/нед
- Прогрессия: не более 5% в неделю

Во время флейра (обострения):
- Снизить нагрузку на 50-70%
- Только лёгкое: ходьба, растяжка, дыхание
- Полный покой при температуре, сильной боли
- Возвращение: постепенно, как после болезни

Противовоспалительный эффект:
- Регулярные тренировки снижают IL-6, TNF-α, CRP
- Но перетренировка ПОВЫШАЕТ эти маркеры!
- Оптимум: 150-200 мин/нед умеренной активности
- Сон 7-9 ч = критично для иммунорегуляции

Питание:
- Противовоспалительная диета: омега-3, овощи, ягоды
- Витамин D: часто дефицит при аутоиммунных → 2000-4000 МЕ
- Глютен: некоторые замечают улучшение при исключении
- Белок 1.4-1.6 г/кг — поддержка мышечной массы
`;
}
export function getNightShiftTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['ночн смен', 'night shift', 'работа ночью', 'сменный график', 'вахта', 'дежурств'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🌙 ТРЕНИРОВКИ ПРИ НОЧНЫХ СМЕНАХ / СМЕННОМ ГРАФИКЕ:

Когда тренироваться:
- Перед ночной сменой (за 4-6 ч): лёгкое кардио + силовые
- После ночной (утром): ТОЛЬКО лёгкая растяжка, потом сон
- В выходные: основная тренировка, полная интенсивность
- НЕ тренироваться между сменами если <6 ч сна

Адаптации:
- Кортизол инвертирован → восстановление медленнее
- Прогрессия на 30-50% медленнее чем при нормальном режиме
- RPE кажется ниже чем реальная нагрузка — следи за ЧСС
- Перетренировка наступает быстрее — слушай тело

Питание:
- Мелатонин нарушен → есть сложнее, но белок обязателен
- Перекус перед тренировкой: банан + протеин
- Основной приём: за 3-4 ч до сна (дневного)
- Кофеин: не позже чем за 6 ч до планируемого сна

Сон (критично!):
- Блокировка света: плотные шторы, маска для сна
- Температура: 18-20°C
- Белый шум
- Мелатонин 1-3 мг за 30 мин до дневного сна
- Тренировка помогает: углубляет сон и улучшает засыпание
`;
}
export function getSoccerTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['футбол', 'soccer', 'football', 'вратар', 'нападающ', 'полузащит'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
⚽ СИЛОВАЯ ПОДГОТОВКА ДЛЯ ФУТБОЛА:

Физические требования:
- 10-13 км за матч, 80% — низкая интенсивность
- 15-25 спринтов за игру
- 30-40 ускорений/торможений
- Сила единоборств, удар по мячу

Межсезонье (3-4 раза/нед):
Сила ног:
- Приседания: 4 × 6 (базовая сила)
- Румынская тяга: 3 × 8 (задняя цепь, профилактика травм подколенных)
- Болгарские выпады: 3 × 8 (унилатеральная сила)
- Nordic ham curl: 3 × 5-8 (КРИТИЧНО для профилактики травм)

Скоростно-силовые:
- Power clean: 4 × 3 (взрывная сила)
- Прыжки на тумбу: 3 × 5
- Спринты 10-30 м × 6-8 (ускорение)

Профилактика травм (ОБЯЗАТЕЛЬНО):
- Nordic ham curl: снижает риск разрыва подколенных на 60-70%!
- Копенгагенское приведение: аддукторы (паховые)
- Баланс на одной ноге: 3 × 30 сек (голеностоп)
- Укрепление кора: планка, Pallof press

В сезоне:
- 2 раза/нед, сниженный объём (поддержание)
- Не тренировать ноги тяжело за 48 ч до матча
- Акцент на восстановление: сон, питание, растяжка
`;
}
export function getHockeyTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['хоккей', 'hockey', 'на льду', 'шайб', 'клюшк'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏒 СИЛОВАЯ ПОДГОТОВКА ДЛЯ ХОККЕЯ:

Специфика:
- Катание = горизонтальная + латеральная сила
- Силовые единоборства у борта
- Бросок = вращательная сила + плечи
- Смены 45-60 сек, высокая интенсивность

Ноги (приоритет #1):
- Приседания: 4 × 5 (глубокие — имитация позиции катания)
- Боковые выпады: 3 × 8 (латеральная сила)
- Конькобежные прыжки: 4 × 6 на сторону
- Прыжки на одной ноге: 3 × 5 (отталкивание)

Верх тела:
- Жим лёжа: 4 × 6 (единоборства, защита)
- Тяга в наклоне: 4 × 8 (бросок, тяговая сила)
- Landmine rotational press: 3 × 8 (вращение при броске)
- Подтягивания: 3 × 8-10

Кор (КРИТИЧЕН):
- Rotational: Pallof press, Russian twist с медболом
- Anti-rotation: планка с вытянутой рукой
- Сила вращения = сила броска

Специальные:
- Slide board (имитация катания): 3 × 30 сек
- Lateral bounds: 4 × 6
- Медбол бросок в стену (вращение): 3 × 8 на сторону
`;
}
export function getBoxingTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['бокс', 'boxing', 'боксёр', 'удар', 'спарринг', 'мешок'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🥊 СИЛОВАЯ ПОДГОТОВКА ДЛЯ БОКСА:

Принципы:
- Скорость > абсолютная сила (быстрый удар важнее сильного)
- Выносливость: 12 раундов × 3 мин = 36 мин боя
- Сила удара = ноги + кор + плечи (кинетическая цепь)
- Не набирать лишнюю массу (весовая категория!)

Силовые (2-3 раза/нед):
Ноги (основа удара):
- Приседания: 3 × 5 (сила, не гипертрофия)
- Болгарские выпады: 3 × 6 (задняя нога в стойке)
- Power clean: 3 × 3 (взрывная сила)
- Прыжки на тумбу: 3 × 5

Кор (передача силы):
- Landmine rotation: 3 × 8 на сторону
- Медбол бросок из-за головы: 3 × 8
- Медбол бросок вбок: 3 × 8 на сторону
- Anti-rotation: Pallof press 3 × 10

Верх тела:
- Жим стоя: 3 × 6 (прямой удар)
- Тяга к поясу: 3 × 8 (возврат руки, защита)
- Отжимания с хлопком: 3 × 8 (скорость)
- Плечевая выносливость: подъём гантелей перед собой 3 × 15

Выносливость:
- Скакалка: 3 раунда × 3 мин (базовая кардио)
- Интервалы: 30 сек спринт / 30 сек отдых × 10
- Бой с тенью с лёгкими гантелями (0.5-1 кг): 3 раунда
`;
}
export function getWrestlingTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['борьба', 'wrestling', 'самбо', 'дзюдо', 'judo', 'грэпплинг', 'bjj', 'джиу'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🤼 СИЛОВАЯ ПОДГОТОВКА ДЛЯ БОРЬБЫ / ГРЭППЛИНГА:

Ключевые качества:
- Сила хвата (контроль противника)
- Тяговая сила (захваты, броски)
- Взрывная сила бёдер (проходы в ноги, подъёмы)
- Силовая выносливость (6 мин схватки на максимуме)

Программа (3 раза/нед):
Тяговые (приоритет):
- Становая тяга: 4 × 5 (подъём противника)
- Тяга в наклоне: 4 × 6 (контроль, захваты)
- Подтягивания с полотенцем: 3 × макс (хват!)
- Rope climb (канат): 3 × подъём

Ноги:
- Приседания: 4 × 5 (проходы в ноги)
- Power clean: 4 × 3 (взрывная сила)
- Выпады с ходьбой: 3 × 10

Хват (КРИТИЧЕН):
- Wrist roller: 3 × макс
- Farmer's walk: 3 × 40 м тяжело
- Towel pull-ups: 3 × макс
- Thick grip deadlift: 3 × 6

Шея (профилактика травм):
- Изометрические: давление руками, 4 направления × 10 сек
- Мостик борцовский (осторожно, прогрессивно)
- Harness work: 3 × 12

Силовая выносливость:
- Круговые: 5-6 упражнений, 30 сек работа / 15 сек отдых × 5 кругов
- Гиревые свинги: 5 × 20 (бёдра + хват + кардио)
`;
}
export function getSkiingTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['лыж', 'skiing', 'горнолыж', 'сноуборд', 'snowboard', 'биатлон'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
⛷️ СИЛОВАЯ ПОДГОТОВКА ДЛЯ ЛЫЖНОГО СПОРТА:

Горные лыжи:
- Квадрицепсы: основная рабочая группа (позиция стойки)
- Присед «стенка»: 4 × 45-60 сек (имитация стойки)
- Присед: 4 × 8-10 (средняя глубина, пауза внизу)
- Боковые выпады: 3 × 8 (перекантовка)
- Прыжки с разворотом: 3 × 8 (слалом)
- Баланс: BOSU, нестабильные платформы

Беговые лыжи / биатлон:
- Выносливость: бег, велосипед, гребной тренажёр (VO2max)
- Верх тела: подтягивания, жим стоя, тяга (работа палками)
- Лыжный тренажёр (SkiErg) — идеальная имитация
- Роллерные интервалы: имитация гонки

Сноуборд:
- Кор: rotational + anti-rotation (повороты, стабильность)
- Приседания с широкой стойкой: 3 × 10 (позиция на доске)
- Баланс: Indo board, BOSU (ключевое!)
- Прыжки с вращением: 3 × 5 на сторону

Профилактика травм:
- Коленные связки (ACL): Nordic ham curl, balance, приседания
- Голеностоп: проприоцепция на нестабильной поверхности
- Запястье (сноуборд): укрепление разгибателей, гибкость
- Предсезонная подготовка: 8-12 нед до начала сезона
`;
}
export function getClimbingTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['скалолаз', 'climbing', 'боулдеринг', 'bouldering', 'альпинизм'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🧗 СИЛОВАЯ ПОДГОТОВКА ДЛЯ СКАЛОЛАЗАНИЯ:

Ключевые качества:
1. Сила хвата (пальцы, предплечья) — приоритет #1
2. Тяговая сила (подтягивания, блокировки)
3. Сила кора (контроль тела на стене)
4. Соотношение сила/вес (каждый кг = сложнее)

Хват (специфика):
- Hangboard: основной инструмент скалолаза
  * Начало: удержание на открытых хватах 7 сек × 6, отдых 3 мин
  * Прогрессия: уменьшение зацепки, добавление веса
  * НЕ раньше 1 года опыта лазания (сухожилия не готовы)
- No-hang device: тренировка хвата без стены

Подтягивания:
- Обычные: 3 × макс
- С задержкой: 3 × 5 (пауза 3 сек наверху и на 90°)
- На одной руке: прогрессия через негативы и резину
- Lock-offs: удержание на 90° и 120°, 3 × 10 сек

Кор:
- Front lever прогрессия (tuck → advanced → full)
- Toes-to-bar: 3 × 8
- Ab wheel: 3 × 10
- Планка на одной руке: 3 × 15 сек

Антагонисты (профилактика):
- Отжимания: 3 × 15 (компенсация тяговых)
- Жим стоя: 3 × 10
- Разгибание пальцев с резиной: 3 × 15
- Вращатели плеча: 3 × 15
`;
}
export function getRussianPowerliftingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['пауэрлифтинг', 'powerlifting', 'фпр', 'ipf', 'тройк', 'сумма троеборь'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏋️ ПАУЭРЛИФТИНГ — РОССИЙСКАЯ ШКОЛА:

Федерации в России:
- ФПР (IPF) — самая престижная, с допинг-контролем
- WRPF — без допинг-контроля, широкие правила
- СПР, АПЛ — альтернативные федерации
- Разряды: III → II → I → КМС → МС → МСМК

Нормативы КМС (ФПР, 83 кг, экипировочный):
- Присед: ~230 кг
- Жим: ~155 кг
- Тяга: ~250 кг
- Сумма: ~635 кг

Русская школа подготовки:
- Борис Шейко: высокий объём, средняя интенсивность (70-80% от 1ПМ)
- 3-4 тренировки/нед, присед и жим 2-3 раза/нед
- Мало подсобки, много базы
- Периодизация: 12-16 нед циклы к соревнованиям

Типичный цикл Шейко (4 нед блок):
Нед 1-2: Объёмный (5×5 @ 70-75%)
Нед 3: Интенсивный (4×3 @ 80-85%)
Нед 4: Разгрузка (3×3 @ 65-70%)

Подсобные для троеборья:
- Присед с паузой, присед на ящик
- Жим с бруска (2-3 доски), жим узким хватом
- Тяга с подставки, тяга до колен
`;
}
export function getStrongmanTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['стронгмен', 'strongman', 'силач', 'камень атлас', 'бревно', 'фермерск прогулк', 'коромысл'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
💪 СТРОНГМЕН — ТРЕНИРОВОЧНЫЙ ГАЙД:

Дисциплины:
- Становая тяга (обычная, автомобильная, рамка)
- Log press / Axle press (бревно, ось)
- Atlas stones (камни Атласа)
- Farmer's walk (фермерская прогулка)
- Yoke walk (коромысло)
- Tire flip (переворот покрышки)

Программа (4 дня/нед):
День 1 — Жимовой:
- Log clean & press: 5 × 3 (специфика стронгмена)
- Жим стоя: 4 × 5
- Жим сидя гантели: 3 × 10

День 2 — Тяговой:
- Становая: 5 × 3 (тяжело)
- Тяга в наклоне: 4 × 8
- Шраги: 4 × 10

День 3 — Ноги:
- Присед: 5 × 5
- Жим ногами: 4 × 12
- Подъёмы на носки: 4 × 15

День 4 — Events (специальный):
- Farmer's walk: 4 × 40 м
- Yoke walk: 3 × 20 м
- Atlas stones: 5 × 1 (на тумбу)
- Tire flip: 3 × 5

Хват:
- Без лямок на всех тягах (силовой хват)
- Thick grip work
- Farmer's walk — лучшее упражнение для хвата

В России:
- Соревнования: Кубок России по стронгмену, региональные
- Федерация: РФСС
`;
}
export function getWeightliftingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['тяжёл атлетик', 'тяжелая атлетика', 'weightlifting', 'рывок', 'толчок', 'snatch', 'clean and jerk'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏋️‍♂️ ТЯЖЁЛАЯ АТЛЕТИКА — ОСНОВЫ:

Два соревновательных движения:
1. Рывок (snatch): штанга с пола над головой одним движением
2. Толчок (clean & jerk): на грудь + выталкивание над головой

Обучение (прогрессия):
Фаза 1 (1-3 мес): позиции
- Фронтальный присед (позиция приёма толчка)
- Присед со штангой над головой (позиция рывка)
- Жимовой швунг (толчок без подседа)

Фаза 2 (3-6 мес): тяги
- Тяга рывковая (широкий хват, до паха)
- Тяга толчковая (средний хват, до пояса)
- Протяжка (muscle snatch, muscle clean)

Фаза 3 (6+ мес): полные движения
- Power snatch → snatch
- Power clean & jerk → clean & jerk
- Работа с мостов (hang): колено, бедро

Программа (5 дней/нед, типично):
Пн: Рывок + присед
Вт: Толчок + тяга толчковая
Ср: Лёгкий рывок + подсобка
Чт: Толчок с мостов + фронтальный присед
Пт: Рывок + толчок (тестирование)

Российская школа:
- ФТАР — федерация тяжёлой атлетики России
- Алексей Ловчев, Дмитрий Клоков — легенды
- Акцент на технику, объём, классику
`;
}
export function getCrossFitGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['кроссфит', 'crossfit', 'wod', 'amrap', 'emom', 'функциональн фитнес'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏋️ КРОССФИТ / ФУНКЦИОНАЛЬНЫЙ ФИТНЕС:

Что это:
- Постоянно варьируемые функциональные движения, выполняемые с высокой интенсивностью
- Комбинация: тяжёлая атлетика + гимнастика + кардио
- Формат WOD (Workout of the Day): ежедневная тренировка

Форматы WOD:
- AMRAP: максимум раундов за время (напр. 15 мин)
- For Time: фиксированный объём, на время
- EMOM: каждую минуту выполнить задание
- Chipper: длинный список упражнений, одно за другим

Базовые бенчмарки (Hero WODs):
- Fran: 21-15-9 thrusters (43 кг) + подтягивания. Элитный: <3 мин
- Murph: 1 миля бег + 100 подтягиваний + 200 отжиманий + 300 приседаний + 1 миля бег
- Grace: 30 clean & jerk (60 кг) на время. Элитный: <2 мин

Развитие навыков:
1. Подтягивания (kipping → butterfly → strict weighted)
2. Muscle-ups (кольца, турник)
3. Олимпийские подъёмы (snatch, clean & jerk)
4. Handstand push-ups / walks
5. Double-unders (двойные прыжки через скакалку)

В России:
- Соревнования: CrossFit Games → Russian Classic → Siberian Showdown
- Залы: CrossFit-аффилиаты по всей стране
- Сертификация: CF-L1, L2
`;
}
export function getFunctionalTrainingScience(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['функциональн тренировк', 'functional training', 'функционал фитнес', 'движени повседневн'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🔧 ФУНКЦИОНАЛЬНЫЙ ТРЕНИНГ — НАУКА:

7 базовых паттернов движения:
1. Присед (squat) — встать со стула, поднять предмет с пола
2. Тяга (hinge) — наклон, подъём ребёнка, становая
3. Толчок (push) — открыть дверь, жим, отжимания
4. Тяга (pull) — притянуть, подтягивания
5. Ротация (rotate) — повороты, броски
6. Локомоция (locomotion) — ходьба, бег, перенос
7. Стабилизация (stabilize) — удержание позиции, баланс

Принципы:
- Свободные веса > тренажёры (стабилизация)
- Стоячие > сидячие (баланс + кор)
- Многосуставные > изолирующие (кинетические цепи)
- Унилатеральные = половина объёма (асимметрия в жизни)

Программа (3-4 раза/нед):
- Присед: кубковый присед, фронтальный, на одной ноге
- Тяга: румынская тяга, свинг гирей, тяга в наклоне
- Толчок: жим стоя, отжимания, жим одной рукой
- Перенос: farmer's walk, переноска над головой, Turkish get-up
- Ротация: медбол, Landmine rotation, Pallof press
- Баланс: стойка на одной ноге с нагрузкой

Для кого идеально:
- Люди 40+ (функциональность > эстетика)
- Реабилитация после травм
- Спортсмены (перенос на спорт)
- Все, кто хочет «быть в форме для жизни»
`;
}
export function getStreetWorkoutGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['воркаут', 'street workout', 'турник', 'брусья', 'калистеник', 'планш', 'горизонт', 'флажок'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🤸 СТРИТ ВОРКАУТ — ГАЙД:

Элементы (от простого к сложному):
Базовые: подтягивания, отжимания на брусьях, приседания
Средние: muscle-up, стойка на руках, L-sit
Продвинутые: planche (планш), front lever, back lever
Элитные: planche push-ups, one-arm pull-up, human flag

Прогрессия подтягиваний:
1. Австралийские (на низкой перекладине) → 3 × 10
2. Негативы: 3 × 5 (медленный спуск 5 сек)
3. Подтягивания: 3 × 5 → 3 × 12
4. Подтягивания с весом: 3 × 5 (+10 кг → +20 кг)
5. Подтягивания на одной руке: прогрессия через резину

Прогрессия планша:
1. Планка на прямых руках → 30 сек
2. Псевдопланш (ноги на полу) → отжимания
3. Tuck planche (колени к груди) → 10 сек
4. Advanced tuck (ноги горизонтально) → 10 сек
5. Straddle planche → 5 сек
6. Full planche → мечта!

Фронт-левер:
1. Tuck → 10 сек
2. Advanced tuck → 10 сек
3. One leg → 5 сек
4. Straddle → 5 сек
5. Full → мечта!

В России:
- ФВОР (Федерация воркаута России)
- Соревнования: WorkoutFest, ISF
- Площадки: в каждом дворе, бесплатно
`;
}
export function getTriathlonTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['триатлон', 'triathlon', 'ironman', 'олимпийск дистанц', 'спринт дистанц', 'плавание бег велосипед'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏊‍♂️🚴‍♂️🏃 ТРИАТЛОН — ТРЕНИРОВОЧНЫЙ ГАЙД:

Дистанции:
- Спринт: 750м плав + 20км вело + 5км бег
- Олимпийская: 1.5км + 40км + 10км
- Half Ironman (70.3): 1.9км + 90км + 21.1км
- Ironman: 3.8км + 180км + 42.2км

Распределение тренировок (нед, олимпийка):
- Плавание: 3 раза, 45-60 мин (техника!)
- Вело: 3 раза, 60-120 мин
- Бег: 3 раза, 30-60 мин
- Силовые: 2 раза, 30-40 мин (профилактика)
- Итого: 10-14 ч/нед

Силовые для триатлета:
- Приседания: 3 × 8 (сила ног для вело и бега)
- Тяга на прямых ногах: 3 × 10 (задняя цепь)
- Планка: 3 × 60 сек (кор для всех дисциплин)
- Подтягивания: 3 × 8 (плавание)
- Жим стоя: 3 × 8

Переходы (T1, T2):
- T1 (плавание → вело): практикуй быструю смену
- T2 (вело → бег): «ватные ноги» — привыкай (brick workouts)
- Brick: вело 30 мин → бег 15 мин (2 раза/нед)

В России:
- Федерация: ФТР
- Гонки: Ironman Sochi, A1 Triathlon, STC
- Сезон: май-сентябрь (открытая вода)
`;
}
export function getFencingTrainingGuide(message: string): string {
  const triggers = ['фехтовани', 'fencing', 'рапир', 'шпаг', 'сабл', 'выпад фехтовал', 'фехтовальщик'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🤺 ФЕХТОВАНИЕ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Специфика вида спорта:**
- Асимметричная нагрузка (ведущая сторона)
- Взрывные выпады и перемещения
- Быстрая реакция и координация глаз-рука
- Длительная работа в полуприседе

**Физические качества фехтовальщика:**
1. Скоростно-силовые: выпады, прыжки, ускорения
2. Выносливость: 5-6 боёв по 3 мин в турнире
3. Гибкость: выпады, уклонения
4. Координация: работа оружием + передвижения

**Силовая программа:**
- Приседания (акцент на переднюю ногу): 4 × 8
- Выпады с гантелями: 3 × 10 на каждую
- Прыжки в длину с места: 4 × 5
- Степ-апы на тумбу: 3 × 12
- Жим одной рукой стоя (рабочая рука): 3 × 10
- Тяга гантели в наклоне: 3 × 10
- Разгибания запястья: 3 × 15 (сила хвата оружия)
- Планка боковая: 3 × 30 сек (антиротация)

**Скоростная подготовка:**
- Челночный бег 5×5м: реакция + ускорение
- Прыжки на скакалке: координация стоп
- Выпады с резинкой: имитация боевого выпада
- Реакционные упражнения: ловля мяча, свет/звук

**Компенсация асимметрии:**
- Обязательная работа на недоминантную сторону
- Односторонние упражнения: +20-30% объёма на слабую сторону
- Растяжка: особенно задняя поверхность бедра ведущей ноги
- Ротационная подвижность: грудной отдел позвоночника
`;
}
export function getArcheryTrainingGuide(message: string): string {
  const triggers = ['стрельба из лука', 'archery', 'лучник', 'лук спорт', 'олимпийск лук', 'блочный лук', 'compound bow'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏹 СТРЕЛЬБА ИЗ ЛУКА — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Статическая сила удержания (20-25 кг натяжения, сотни выстрелов)
- Стабильность плечевого пояса
- Выносливость мышц спины
- Контроль дыхания и концентрация

**Мышцы, задействованные при выстреле:**
- Широчайшие и ромбовидные (основная тяга)
- Задняя дельта (удержание)
- Трапециевидные (стабилизация лопатки)
- Разгибатели пальцев (выпуск тетивы)
- Кор (стабильность корпуса)
- Ноги (устойчивая стойка)

**Силовая программа лучника:**
- Тяга резиновой ленты (имитация натяжения): 5 × 15
- Тяга к лицу (face pulls): 3 × 15
- Разведение рук с гантелями: 3 × 12
- Шраги с удержанием 5 сек: 3 × 10
- Изометрическое удержание в тяге: 3 × 20 сек
- Планка: 3 × 60 сек
- Приседания: 3 × 12 (устойчивость)
- Разгибание запястья: 3 × 15

**Тренировка стабильности:**
- Стойка на одной ноге с закрытыми глазами: 3 × 30 сек
- Балансировка на нестабильной поверхности
- Дыхательные упражнения: 4-7-8 метод
- Визуализация: мысленная проработка идеального выстрела

**Профилактика травм лучника:**
- Растяжка грудных мышц (компенсация)
- Внешняя ротация плеча: 3 × 15
- Массаж предплечий (перенапряжение)
- Перерывы каждые 30-40 выстрелов
`;
}
export function getBadmintonTrainingGuide(message: string): string {
  const triggers = ['бадминтон', 'badminton', 'воланчик', 'ракетка бадминтон', 'смеш бадминтон'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏸 БАДМИНТОН — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические качества бадминтониста:**
- Скорость реакции: волан летит до 400+ км/ч
- Взрывная сила ног: прыжки, выпады, рывки
- Выносливость: матчи до 60-90 мин
- Гибкость: растяжки за воланом
- Координация: работа ракеткой + перемещения

**Силовая программа:**
- Приседания с прыжком: 4 × 6
- Боковые выпады: 3 × 10 на сторону
- Степ-апы на тумбу: 3 × 12
- Жим гантели одной рукой стоя: 3 × 10
- Тяга гантели в наклоне: 3 × 10
- Сгибание/разгибание запястья: 3 × 20 (сила хвата)
- Ротация плеча с резинкой: 3 × 15
- Планка с касанием плеч: 3 × 30 сек

**Скоростно-координационная работа:**
- Челночный бег (имитация перемещений на корте)
- Прыжки на скакалке: 3 × 2 мин
- Лестница координационная: 4-5 упражнений
- Теневой бадминтон: работа ног без волана
- Реакционный мяч: тренировка реакции

**Тренировка прыжка (для смеша):**
- Прыжки с приседа: 3 × 8
- Запрыгивания на тумбу: 3 × 6
- Ножницы в прыжке: 3 × 10
- Прыжки в глубину (drop jumps): 3 × 5

**Профилактика травм:**
- Разминка плечевого сустава перед игрой
- Укрепление ротаторной манжеты
- Бинтование/тейпирование голеностопа
- Растяжка подколенных и приводящих мышц
`;
}
export function getSamboTrainingGuide(message: string): string {
  const triggers = ['самбо', 'sambo', 'боевое самбо', 'спортивное самбо', 'самбист', 'бросков техник', 'болевой приём'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🥋 САМБО — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**История и специфика:**
- Советская система самозащиты (с 1938 года)
- Спортивное самбо: броски, удержания, болевые
- Боевое самбо: + удары руками и ногами
- Российский национальный вид единоборств

**Физические качества самбиста:**
- Взрывная сила (броски)
- Силовая выносливость (5 мин схватка)
- Гибкость (болевые, уходы)
- Борцовская чувствительность (баланс, реакция)
- Сила хвата (захваты куртки)

**Силовая программа:**
- Становая тяга: 4 × 5 (основа бросковой силы)
- Взятие штанги на грудь: 4 × 3 (взрывная сила)
- Подтягивания с полотенцем: 4 × 8 (хват куртки)
- Приседания: 4 × 6
- Жим лёжа: 3 × 8 (удержания, дожимы)
- Тяга штанги в наклоне: 4 × 8 (тяговая сила)
- Канат: лазание 3-5 подъёмов
- Farmer's walk с гирями: 3 × 30м (хват + кор)

**Борцовская специфика:**
- Партерная борьба: тренировка удержаний, переворотов
- Бросковая техника: подсечки, подхваты, через бедро
- Болевые приёмы: рычаг локтя, ущемление ахилла
- Работа в стойке: проходы в ноги, клинч

**Функциональная подготовка:**
- Борцовский мост: укрепление шеи
- Кувырки: вперёд, назад, боковые
- Перемещения в партере: «крокодил», «краб», «медведь»
- Тренировка с манекеном: броски, удержания
- Протяжка партнёра за куртку: 3 × 30 сек

**Выносливость:**
- Интервальная борьба: 5 × 1 мин (работа/отдых 1:1)
- Круговая тренировка: 6-8 станций × 3 круга
- Кроссфит-стиль: бёрпи + броски + подтягивания
- Бег 3-5 км для аэробной базы

**Профилактика травм:**
- Разминка шеи: вращения, наклоны, мост
- Укрепление коленей: работа на баланс, резинки
- Тейпирование пальцев (травмы от захватов)
- Страховка при падениях: отработка самостраховки
`;
}
export function getJudoTrainingGuide(message: string): string {
  const triggers = ['дзюдо', 'judo', 'дзюдоист', 'иппон', 'ваза-ари', 'бросок через бедро', 'рандори'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🥋 ДЗЮДО — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Специфика дзюдо:**
- Олимпийский вид единоборств (с 1964)
- Броски, удержания, удушения, болевые
- Схватка 4-5 мин (высокая интенсивность)
- Работа в кимоно: хват — ключевой элемент

**Силовая программа дзюдоиста:**
- Подтягивания с кимоно/полотенцем: 4 × 8 (хват)
- Взятие на грудь: 4 × 3 (бросковая взрывная сила)
- Становая тяга: 4 × 5
- Приседания: 4 × 6
- Жим стоя: 3 × 8 (подбив при бросках)
- Тяга штанги в наклоне: 4 × 8
- Канат: 3-5 подъёмов (сила хвата)
- Рывок гири: 3 × 10 на руку

**Специальная подготовка:**
- Учикоми: многократные повторения входа в бросок (100-200/тренировка)
- Нагекоми: броски с падением партнёра
- Рандори: свободная борьба, 3-5 × 5 мин
- Ньюаза (партер): работа в борьбе лёжа
- Каэши-ваза: контрприёмы

**Функциональная работа:**
- Борцовский мост: шея
- Перемещения в партере: крокодил, краб
- Тренировка с резиновым жгутом: имитация бросков
- Круговая тренировка: 8 станций × 1 мин, отдых 30 сек

**Гибкость:**
- Растяжка приводящих: широкие стойки
- Подколенные: наклоны, складка
- Плечевой пояс: растяжка после тренировки
- Поясничный отдел: скручивания лёжа
`;
}
export function getKarateTrainingGuide(message: string): string {
  const triggers = ['карате', 'karate', 'каратист', 'ката', 'кумите', 'шотокан', 'киокушинкай', 'чёрный пояс карате'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🥋 КАРАТЕ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Основные стили:**
- Шотокан: мощные удары, низкие стойки
- Киокушинкай: полный контакт, закалка тела
- Вадо-рю: уклоны, скорость
- Годзю-рю: ближний бой, дыхательные ката

**Физические качества каратиста:**
- Скорость удара (руки и ноги)
- Взрывная сила (ой-цуки, маваши-гери)
- Гибкость (высокие удары ногами)
- Реакция (на атаку противника)
- Выносливость (3 мин кумите)

**Силовая программа:**
- Приседания с прыжком: 4 × 6 (удары ногами)
- Выпады с весом: 3 × 10 (устойчивость в стойках)
- Жим лёжа: 3 × 8 (мощность ударов руками)
- Подтягивания: 3 × 10 (спина для отдёрга руки)
- Скручивания с медболом: 3 × 15 (ротация при ударах)
- Отжимания на кулаках: 3 × 20 (укрепление запястий)
- Планка: 3 × 60 сек
- Прыжки на тумбу: 3 × 6 (взрывная сила)

**Скоростная подготовка:**
- Удары по лапам: серии 10-15 сек максимальный темп
- Теневой бой: 3 × 3 мин
- Работа с грушей: скоростные серии
- Резиновый жгут: удары с сопротивлением

**Набивка (Киокушинкай):**
- Постепенное закаливание голеней: макивара, мешок
- Предплечья: блоки по мешку
- Не форсировать — микротрещины опасны
`;
}
export function getTaekwondoTrainingGuide(message: string): string {
  const triggers = ['тхэквондо', 'taekwondo', 'тэквондо', 'пхумсэ', 'долио чаги', 'нерио чаги', 'ап чаги'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦶 ТХЭКВОНДО — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Специфика вида:**
- 80% техник — удары ногами
- Высокие удары в голову = больше баллов
- Скорость и точность важнее силы
- Олимпийский вид (WTF) с 2000 года

**Физические приоритеты:**
1. Гибкость (высокие удары)
2. Скорость (быстрые атаки)
3. Взрывная сила (прыжковые удары)
4. Баланс (на одной ноге при ударе)
5. Выносливость (3 раунда по 2 мин)

**Силовая программа:**
- Приседания на одной ноге: 3 × 6 (баланс + сила)
- Выпады в прыжке: 3 × 8 (переключение ног)
- Становая тяга на одной ноге: 3 × 8
- Подъёмы ног в висе: 3 × 12 (удары ногами)
- Разгибание/сгибание ног: 3 × 12
- Боковая планка: 3 × 30 сек
- Прыжки с вращением: 3 × 6

**Гибкость (приоритет №1):**
- Динамическая растяжка перед тренировкой: махи ногами
- Статическая после: шпагаты, наклоны
- PNF-стретчинг: контракт-релакс
- Активная: удержание ноги на высоте 3 × 15 сек
- Цель: продольный шпагат и удар выше головы

**Специальная работа:**
- Удары по подушке/лапам: серии 20-30 ударов
- Степпинг (работа ног): 3 × 2 мин
- Комбинации: 2-3 удара → уход
- Спарринг: 3-5 раундов по 2 мин
`;
}
export function getRugbyTrainingGuide(message: string): string {
  const triggers = ['регби', 'rugby', 'регбист', 'скрам', 'тэкл', 'tackle', 'line-out'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏉 РЕГБИ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Позиционные требования:**
- Нападающие (форварды): сила, масса, мощность в контакте
- Защитники (бэки): скорость, ловкость, выносливость
- Все: контактная прочность, общая атлетика

**Силовая программа (нападающие):**
- Приседания: 5 × 5 (тяжёлые)
- Жим лёжа: 4 × 6
- Становая тяга: 4 × 5
- Жим стоя: 4 × 6
- Тяга в наклоне: 4 × 8
- Жим ногами: 3 × 10
- Шраги: 3 × 12

**Силовая программа (защитники):**
- Приседания с прыжком: 4 × 5
- Взятие на грудь: 4 × 3
- Жим гантелей: 3 × 8
- Подтягивания: 3 × 10
- Выпады: 3 × 8
- Рывок гири: 3 × 8
- Спринтерские старты: 6 × 20м

**Скоростно-силовая работа:**
- Спринты 10-40м: 8-10 × с полным отдыхом
- Челночный бег: 5 × 20м
- Толкание саней: 4 × 20м
- Перевороты покрышки: 3 × 8
- Прыжки в длину с места: 4 × 5

**Контактная подготовка:**
- Тэкл-техника: вход, захват, завершение
- Борьба у земли: забор мяча, рак
- Скрам: техника упора, связка с партнёрами
- Работа с шилдами и мешками

**Выносливость:**
- Интервалы: 6 × 300м, отдых 90 сек
- Повторные спринты: 10 × 40м, отдых 30 сек
- Игровые ситуации: 7-на-7, touch-rugby
`;
}
export function getBiathlonTrainingGuide(message: string): string {
  const triggers = ['биатлон', 'biathlon', 'биатлонист', 'стрельба лёжа стоя', 'стрелковая подготовк', 'гонка преследован'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🎯 БИАТЛОН — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Специфика вида:**
- Сочетание лыжных гонок и стрельбы
- Нужно стрелять точно на пульсе 160-180 уд/мин
- Дистанции: спринт (7.5-10 км), гонка преследования, масс-старт, эстафета
- За каждый промах — штрафной круг (150м) или минута

**Физические требования:**
1. Аэробная выносливость (как у лыжника)
2. Контроль дыхания и ЧСС (для стрельбы)
3. Силовая выносливость
4. Стабильность корпуса (удержание оружия)
5. Мелкая моторика (работа пальцев на курке)

**Силовая программа:**
- Приседания: 4 × 8
- Выпады: 3 × 10
- Подтягивания: 3 × 8
- Тяга верхнего блока: 3 × 12
- Жим стоя: 3 × 8
- Планка с удержанием: 3 × 60 сек
- Боковая планка: 3 × 30 сек на сторону
- Упражнения на баланс: BOSU, одна нога

**Стрелковая подготовка (без оружия):**
- Удержание позы стрельбы стоя: 3 × 30 сек
- Удержание позы стрельбы лёжа: 3 × 30 сек
- Контроль дыхания: выстрел на паузе между вдохом и выдохом
- Визуализация: мысленная проработка стрельбы на пульсе
- Балансировка после бега: имитация рубежа

**Кардио:**
- Интервалы: 4 × 4 мин на 90% ЧСС, отдых 3 мин
- Длительный бег: 60-90 мин в зоне 2
- Лыжероллеры: специфическая работа
- Быстрый переход бег → стабильность (имитация рубежа)
`;
}
export function getCurlingTrainingGuide(message: string): string {
  const triggers = ['кёрлинг', 'curling', 'кёрлингист', 'камень кёрлинг', 'свипинг', 'хаус кёрлинг'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🥌 КЁРЛИНГ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Баланс и стабильность (выпуск камня в низкой позиции)
- Силовая выносливость (свипинг — подметание)
- Гибкость нижней части тела (выпады)
- Координация и мелкая моторика
- Выносливость (матч 2-3 часа)

**Позиция выпуска камня (delivery):**
- Глубокий выпад на одной ноге
- Скольжение на подошве
- Точный контроль вращения камня
- Требует: гибкость бёдер, сила ног, баланс

**Силовая программа:**
- Приседания: 3 × 10 (общая сила ног)
- Выпады (глубокие): 3 × 8 на ногу (имитация деливери)
- Тяга гири из приседа: 3 × 10
- Жим стоя: 3 × 10 (свипинг)
- Тяга в наклоне: 3 × 10 (свипинг)
- Планка: 3 × 45 сек (стабильность кора)
- Боковая планка: 3 × 30 сек
- Подъём на носки: 3 × 15

**Тренировка свипинга:**
- Свипинг — интенсивная аэробная работа: ЧСС до 180+
- Кардио: бег, велосипед 30-45 мин (база)
- Интервалы: 30 сек максимум / 30 сек отдых × 10
- Тяга резинки (имитация подметания): 3 × 20
- Гребной тренажёр: 3 × 3 мин

**Баланс и гибкость:**
- Стойка на одной ноге: 3 × 30 сек (каждая)
- Приседания на BOSU: 3 × 10
- Растяжка бёдер: глубокий выпад, голубь
- Растяжка паховой области
- Ротация грудного отдела
`;
}
export function getGolfTrainingGuide(message: string): string {
  const triggers = ['гольф', 'golf', 'гольфист', 'свинг', 'драйвер гольф', 'паттинг', 'айрон гольф'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⛳ ГОЛЬФ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Ротационная сила (свинг до 180+ км/ч)
- Гибкость (амплитуда замаха)
- Стабильность корпуса (точность)
- Баланс (перенос веса при ударе)
- Выносливость (18 лунок = 6-8 км ходьбы)

**Силовая программа гольфиста:**
- Становая тяга: 3 × 8 (основа ротационной мощности)
- Приседания: 3 × 10 (нижняя опора свинга)
- Вращения корпуса с блоком: 3 × 12 на сторону
- Медбол: броски в стену с ротацией 3 × 10
- Жим стоя одной рукой: 3 × 8 (стабильность)
- Тяга в наклоне: 3 × 10
- Планка с ротацией: 3 × 10
- Боковая планка: 3 × 30 сек

**Гибкость (критична для свинга):**
- Ротация грудного отдела: 3 × 10 на сторону
- Растяжка бёдер: глубокий выпад, 90/90
- Растяжка широчайших: вис на перекладине
- Подвижность плеч: палка за спиной
- Ежедневно 15-20 мин

**Профилактика травм:**
- «Локоть гольфиста»: укрепление предплечий
- Поясница: кор-стабильность, правильная механика свинга
- Запястья: вращения с лёгким весом
- Шея: мобильность, растяжка
`;
}
export function getSurfingTrainingGuide(message: string): string {
  const triggers = ['сёрфинг', 'surfing', 'сёрфер', 'сёрф', 'доска для сёрфа', 'волна сёрфинг', 'paddle board'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏄 СЁРФИНГ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Выносливость верхнего пояса (гребля)
- Взрывная сила (pop-up — вставание на доску)
- Баланс (катание на волне)
- Гибкость (повороты, манёвры)
- Кардио-выносливость (часы в воде)

**Сухопутная программа:**
- Подтягивания: 4 × 8 (гребля)
- Отжимания: 3 × 15 (pop-up)
- Бёрпи: 3 × 10 (имитация pop-up)
- Тяга в наклоне: 3 × 10 (гребля)
- Приседания с прыжком: 3 × 8 (взрывная сила ног)
- Планка: 3 × 60 сек (стабильность)
- Боковая планка: 3 × 30 сек
- Turkish get-up: 3 × 5 на сторону (функционал)

**Баланс и координация:**
- Индо-борд: 3 × 2 мин (имитация доски)
- BOSU: приседания, стойка на одной ноге
- Баланс-борд: повороты, наклоны
- Слэклайн: если доступен

**Кардио:**
- Плавание: 30-45 мин (основная кардио)
- Гребля на каяке/SUP: 30-60 мин
- Бег: 30 мин (общая выносливость)
- Интервалы: 30 сек спринт / 30 сек отдых × 10

**Гибкость:**
- Кобра (разгибание спины): для pop-up
- Растяжка плеч: надплечники, ротаторы
- Бёдра: голубь, бабочка
- Грудной отдел: вращения, cat-cow
`;
}
export function getSnowboardTrainingGuide(message: string): string {
  const triggers = ['сноуборд', 'snowboard', 'сноубордист', 'фристайл сноуборд', 'хафпайп', 'бордеркросс', 'jib'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏂 СНОУБОРД — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Баланс (боковая стойка на доске)
- Сила ног и кора (управление доской)
- Взрывная сила (прыжки, олли)
- Гибкость (повороты, грэбы)
- Выносливость (целый день на склоне)

**Силовая программа:**
- Приседания: 4 × 8
- Боковые выпады: 3 × 10 (перенос веса)
- Становая тяга на одной ноге: 3 × 8
- Прыжки с приседа: 3 × 6
- Планка: 3 × 60 сек
- Боковая планка: 3 × 30 сек
- Russian twist с медболом: 3 × 15
- Подъём ног в висе: 3 × 10

**Баланс (приоритет):**
- Балансборд: 3 × 2 мин
- BOSU приседания: 3 × 10
- Стойка на одной ноге (глаза закрыты): 3 × 30 сек
- Прыжки с приземлением на одну ногу: 3 × 8
- Indo-board: имитация карвинга

**Подготовка к прыжкам (фристайл):**
- Прыжки с вращением: 180°, 360°
- Запрыгивания на тумбу: 3 × 6
- Глубинные прыжки: 3 × 5
- Трамплин в зале (если доступен)
- Батут: отработка вращений

**Профилактика:**
- Запястья: протекторы + укрепление
- Колени: нейромышечная стабилизация
- Копчик: защитные шорты
- Шлем — обязателен
`;
}
export function getEquestrianTrainingGuide(message: string): string {
  const triggers = ['конный спорт', 'equestrian', 'верховая езда', 'конкур', 'выездк', 'всадник', 'наездник'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🐴 КОННЫЙ СПОРТ — ФИЗИЧЕСКАЯ ПОДГОТОВКА ВСАДНИКА:

**Физические требования:**
- Баланс и посадка (управление лошадью)
- Сила кора (стабильность в седле)
- Приводящие мышцы (сжатие бёдер)
- Гибкость (мягкая посадка, повороты)
- Кардио-выносливость (конкур, кросс)

**Силовая программа:**
- Приседания сумо: 3 × 10 (приводящие)
- Приводящая машина: 3 × 12
- Планка: 3 × 60 сек (кор)
- Боковая планка: 3 × 30 сек
- Подъём ног лёжа: 3 × 12
- Ягодичный мостик: 3 × 15
- Тяга верхнего блока: 3 × 10 (осанка)
- Разгибание спины: 3 × 12

**Баланс:**
- Фитбол: сидя, удержание баланса
- BOSU: стойка, приседания
- Стойка на одной ноге: 3 × 30 сек
- Упражнения с закрытыми глазами

**Гибкость:**
- Растяжка приводящих: бабочка, шпагат
- Тазобедренные суставы: 90/90, голубь
- Поясничный отдел: кошка-корова
- Плечи и грудной отдел

**Кардио:**
- Бег/велосипед: 30-45 мин (общая база)
- Верховая езда сама по себе — серьёзная нагрузка
- Пульс при конкуре достигает 170+ уд/мин
`;
}
export function getDancesportTrainingGuide(message: string): string {
  const triggers = ['танцевальн спорт', 'dancesport', 'бальные танцы', 'латина танц', 'стандарт танц', 'вальс', 'самба танц', 'ча-ча-ча'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💃 ТАНЦЕВАЛЬНЫЙ СПОРТ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Выносливость (5 танцев по 1.5-2 мин без перерыва)
- Гибкость (линии тела, элементы)
- Сила ног (работа на полупальцах, быстрые перемещения)
- Баланс и координация (партнёрское взаимодействие)
- Кор-стабильность (рамка, контакт)

**Силовая программа:**
- Подъёмы на носки: 4 × 20 (работа на полупальцах)
- Приседания плие: 3 × 12 (стандарт)
- Выпады: 3 × 10 (шаговая сила)
- Ягодичный мостик: 3 × 15 (движение бёдер в латине)
- Планка: 3 × 60 сек (рамка)
- Тяга верхнего блока: 3 × 10 (осанка)
- Гиперэкстензия: 3 × 12 (спина)
- Боковые подъёмы ног: 3 × 15

**Кардио:**
- Танцевальная практика: 60-120 мин (основная кардио)
- Бег: 20-30 мин (дополнительно)
- Скакалка: 3 × 2 мин (координация + кардио)
- Интервалы: высокая интенсивность

**Гибкость:**
- Шпагаты: ежедневная работа
- Наклоны: стоя, сидя
- Растяжка бёдер: голубь, выпад
- Грудной отдел: ротации, мост
- Балетный станок: батман, тандю

**Осанка и линии:**
- Упражнения у стены: выравнивание
- Работа с зеркалом: контроль линий
- Укрепление межлопаточных мышц
`;
}
export function getParkourTrainingGuide(message: string): string {
  const triggers = ['паркур', 'parkour', 'фриран', 'freerunning', 'трейсер', 'прыжок паркур', 'ролл паркур', 'вол ран'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏃‍♂️ ПАРКУР — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Базовые навыки паркура:**
- Прыжки точности (precision jumps)
- Ролл (кувырок при приземлении)
- Волл-ран (забег на стену)
- Клаймб-ап (подъём на препятствие)
- Cat hang (вис на стене)
- Конг-волт (прыжок через препятствие с опорой)

**Силовая программа:**
- Подтягивания: 4 × 8 (клаймб-ап)
- Отжимания: 3 × 15 (общая сила)
- Отжимания на брусьях: 3 × 10
- Приседания с прыжком: 4 × 6 (прыжки)
- Выпады в прыжке: 3 × 8
- Прыжки в длину с места: 4 × 5
- Подъём ног в висе: 3 × 10 (кор для ролла)
- Планка: 3 × 60 сек

**Плиометрика (основа паркура):**
- Прыжки на тумбу (разная высота): 4 × 5
- Прыжки в глубину: 3 × 5
- Прыжки с разбега: 4 × 3
- Прыжки точности: на точку с места
- Бег по препятствиям: преодоление серии

**Баланс и координация:**
- Ходьба по перилам/бордюрам
- Баланс на рейле: удержание
- Прыжки на узкие поверхности
- Кувырки: вперёд, назад, боковой ролл

**Безопасность:**
- Освоение ролла ДО прыжков с высоты
- Прогрессия: низко → средне → высоко
- Тренировки в зале перед улицей
- Осмотр поверхности перед прыжком
- Никогда не прыгай на мокрую поверхность
`;
}
export function getCricketTrainingGuide(message: string): string {
  const triggers = ['крикет', 'cricket', 'крикетист', 'боулинг крикет', 'бэтсмен', 'калитка'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏏 КРИКЕТ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Позиционные требования:**
- Бэтсмен: реакция, ротационная сила, выносливость
- Боулер (быстрый): скорость разбега, сила броска, выносливость
- Боулер (спин): вращение запястья, точность
- Филдер: скорость, ловкость, сила броска

**Силовая программа:**
- Приседания: 4 × 6 (основа для всех позиций)
- Становая тяга: 4 × 5
- Жим стоя: 3 × 8 (бросковая сила)
- Подтягивания: 3 × 10
- Ротации с медболом: 3 × 10 (бэттинг)
- Выпады: 3 × 8
- Планка: 3 × 60 сек
- Боковая планка: 3 × 30 сек

**Боулинг (быстрый) — специфика:**
- Разбег: 15-25 м с ускорением
- Бросок: нагрузка на плечо и поясницу
- Укрепление: ротаторная манжета, кор
- Ограничение: max 6-8 оверов подряд (36-48 бросков)
- Профилактика стресс-переломов поясницы

**Кардио:**
- Интервалы: 6 × 200м, отдых 60 сек
- Бег на выносливость: 30-45 мин (Test cricket)
- Повторные спринты: 10 × 20м (филдинг)
- Челночный бег: для ловкости в поле

**Гибкость:**
- Бёдра и поясница: критично для боулеров
- Плечи: полная амплитуда для бросков
- Подколенные: профилактика травм при беге
- Грудной отдел: ротация для бэттинга
`;
}
export function getLacrosseTrainingGuide(message: string): string {
  const triggers = ['лакросс', 'lacrosse', 'клюшка лакросс', 'кросс лакросс'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🥍 ЛАКРОСС — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Скорость и ловкость (постоянные смены направления)
- Выносливость (непрерывный бег 60+ мин)
- Контактная прочность (столкновения)
- Бросковая сила (передачи и удары)
- Координация (работа клюшкой на бегу)

**Силовая программа:**
- Приседания: 4 × 6
- Становая тяга: 4 × 5
- Жим лёжа: 3 × 8
- Подтягивания: 3 × 10
- Жим стоя: 3 × 8
- Вращения с медболом: 3 × 10 (бросок)
- Выпады с гантелями: 3 × 8
- Планка anti-rotation: 3 × 10

**Скорость и ловкость:**
- Спринты 20-40м: 8 × с полным отдыхом
- Челночный бег: 5 × 10м
- Конусные дриллы: Т-тест, звезда
- Шаттл-ран: 5-10-5
- Прыжки в стороны: 3 × 10

**Кондиция:**
- Интервалы: 300м × 6, отдых 90 сек
- Фартлек: 20-30 мин (смена темпа)
- Повторные спринты: 10 × 30м, отдых 20 сек
`;
}
export function getBMXTrainingGuide(message: string): string {
  const triggers = ['bmx', 'бмх', 'велосипед трюковой', 'bmx race', 'bmx freestyle', 'дёрт джамп'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🚲 BMX — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Дисциплины:**
- BMX Race: спринт по трассе с трамплинами
- BMX Freestyle: трюки (парк, стрит, дёрт)
- Flatland: трюки на плоскости

**Физические требования:**
- Взрывная сила (старт, прыжки)
- Баланс (трюки, приземления)
- Координация (вращения, грэбы)
- Верхняя часть тела (управление велосипедом в воздухе)
- Выносливость (серии заездов)

**Силовая программа:**
- Приседания с прыжком: 4 × 6 (взрывная мощность)
- Становая тяга: 3 × 6
- Жим стоя: 3 × 8 (управление рулём)
- Подтягивания: 3 × 10
- Тяга в наклоне: 3 × 8
- Выпады: 3 × 8
- Планка: 3 × 45 сек
- Подъём ног: 3 × 12 (кор для трюков)

**Скоростная (Race):**
- Спринты 10-30м: 8 × из стартовых ворот
- Прыжки на тумбу: 3 × 6
- Спринт на велосипеде: интервалы 15 сек/15 сек

**Баланс (Freestyle):**
- Балансборд: 3 × 2 мин
- Мануал (баланс на заднем колесе): практика
- Стойка на руках (для барспинов): прогрессия

**Безопасность:**
- Фулл-фейс шлем (обязательно)
- Защита: колени, голени, локти
- Перчатки
`;
}
export function getDivingTrainingGuide(message: string): string {
  const triggers = ['прыжки в воду', 'diving sport', 'прыгун в воду', 'трамплин прыжки', 'вышка прыжки', 'синхронн прыжки'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🤿 ПРЫЖКИ В ВОДУ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Дисциплины:**
- Трамплин 1м и 3м
- Вышка 10м
- Синхронные прыжки

**Физические требования:**
- Взрывная сила ног (высота прыжка)
- Акробатическая подготовка (вращения, винты)
- Гибкость (пики, группировки)
- Баланс и ориентация в пространстве
- Сила кора (контроль тела в воздухе)

**Силовая программа:**
- Приседания с прыжком: 4 × 6
- Прыжки на тумбу: 4 × 5
- Подъём на носки (взрывной): 3 × 12
- Подтягивания: 3 × 10
- V-sit удержание: 3 × 20 сек
- Планка: 3 × 60 сек
- L-sit: 3 × 15 сек
- Жим в стойку на руках: 3 × 5

**Акробатика (вне воды):**
- Батут: основная тренировка (сальто, винты)
- Сухая яма: отработка новых элементов
- Стойка на руках: баланс
- Кувырки: вперёд, назад, боковые
- Вращения в группировке: скорость

**Гибкость:**
- Шпагаты: продольный и поперечный
- Складка: касание головой коленей
- Мостик: полный прогиб
- Пайк (пика): ноги прямые, касание носков
`;
}
export function getPoloTrainingGuide(message: string): string {
  const triggers = ['поло конн', 'polo sport', 'поло верхом', 'поло на лошад', 'чукка'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🐎 ПОЛО — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Управление лошадью на скорости + удары по мячу
- Ротационная сила (удар клюшкой)
- Баланс в седле (высокие скорости, повороты)
- Сила хвата (клюшка + поводья)
- Выносливость (4-6 чукк по 7 мин)

**Силовая программа:**
- Приседания сумо: 3 × 10 (приводящие — седло)
- Вращения с медболом: 3 × 12 (удар)
- Жим стоя одной рукой: 3 × 8 (удар)
- Тяга гантели в наклоне: 3 × 10
- Сгибание запястья: 3 × 20 (хват)
- Планка: 3 × 45 сек
- Боковая планка: 3 × 30 сек
- Ягодичный мостик: 3 × 15

**Баланс:**
- Фитбол: сидя, удержание
- BOSU: стойки и движения
- Упражнения на нестабильных поверхностях
- Работа с закрытыми глазами

**Кардио:**
- Верховая езда: основная кардио (ЧСС 150+)
- Бег: 20-30 мин (дополнение)
- Интервалы: 30 сек макс / 30 сек отдых × 10
`;
}
export function getAdvancedPeriodizationGuide(message: string): string {
  const triggers = ['периодизаци модел', 'линейн периодизац', 'волнов периодизац', 'блочн периодизац', 'сопряжённ метод', 'conjugate method', 'daily undulating', 'dup программ'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
📊 ПРОДВИНУТЫЕ МОДЕЛИ ПЕРИОДИЗАЦИИ:

**1. Линейная периодизация (классическая):**
- Фаза 1 (4 нед): Гипертрофия — 3-4 × 8-12, 65-75% 1ПМ
- Фаза 2 (4 нед): Сила — 4-5 × 4-6, 80-87% 1ПМ
- Фаза 3 (3 нед): Мощность — 3-5 × 1-3, 90-100% 1ПМ
- Фаза 4 (1 нед): Разгрузка
- Плюсы: простота, подходит начинающим
- Минусы: потеря качеств ранних фаз

**2. Волновая периодизация (DUP):**
- Пн: Гипертрофия (3 × 10 @ 70%)
- Ср: Сила (5 × 5 @ 82%)
- Пт: Мощность (6 × 2 @ 90%)
- Плюсы: все качества развиваются параллельно
- Исследования: превосходит линейную для опытных

**3. Блочная периодизация:**
- Блок 1 (3-4 нед): Накопление — высокий объём, 60-75%
- Блок 2 (3-4 нед): Трансформация — средний объём, 75-85%
- Блок 3 (2-3 нед): Реализация — низкий объём, 85-100%
- Плюсы: концентрация на одном качестве
- Для: продвинутых атлетов, соревнующихся

**4. Сопряжённый метод (Westside Barbell):**
- День максимальных усилий (ME): работа до 1-3ПМ
- День динамических усилий (DE): 8-12 × 2-3 @ 50-60% + аккомодация
- Вариативность: смена упражнений каждые 1-3 недели
- Аккомодация: цепи и резиновые ленты
- Плюсы: одновременное развитие силы и скорости
- Для: опытных пауэрлифтеров

**5. Авторегуляция (RPE-based):**
- Рабочие веса по RPE, а не % от 1ПМ
- RPE 8 = 2 повторения в запасе
- Адаптация под дневную форму
- Прогрессия: увеличение нагрузки при снижении RPE

**Выбор модели:**
- Новичок (< 1 года): линейная
- Средний (1-3 года): DUP или линейная с разгрузками
- Продвинутый (3+ лет): блочная или сопряжённый метод
- Соревнующийся: блочная с пиковой подводкой
`;
}
export function getTrainingPsychologyDeep(message: string): string {
  const triggers = ['психология тренировок', 'ментальн подготовк', 'мотивация к тренировк', 'психологи спорт', 'визуализация спорт', 'внутренн диалог', 'самодисциплин тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🧠 ПСИХОЛОГИЯ ТРЕНИРОВОК — ГЛУБОКИЙ РАЗБОР:

**Внутренняя vs внешняя мотивация:**
- Внутренняя: удовольствие от процесса, рост, мастерство
  - Долговечна, не зависит от внешних факторов
  - Культивируй: фокус на прогресс, не на результат
- Внешняя: подписчики, комплименты, соревнования
  - Хороша для старта, плоха как единственный двигатель
  - Исчезает при достижении цели

**Теория потока (Flow State):**
- Состояние полного погружения в тренировку
- Условия: сложность ≈ навыки (не слишком легко, не слишком тяжело)
- Как достичь: музыка, ритуалы, отключение телефона
- Признаки: потеря чувства времени, лёгкость

**Ментальные техники:**
1. Визуализация: 5 мин перед тренировкой, представь успешные подходы
2. Self-talk: «Я могу» вместо «Надо бы попробовать»
3. Process goals: «Сделать 5 подходов» вместо «Пожать 100 кг»
4. Якорение: ритуал перед тяжёлым подходом (хлопок, глубокий вдох)
5. Принятие дискомфорта: тяжело ≠ плохо

**Преодоление ментальных барьеров:**
- «Я не могу»: переформулируй в «Я ещё не могу»
- Страх тяжёлых весов: прогрессивное десенсибилизация
- Синдром самозванца: веди дневник достижений
- Перфекционизм: «достаточно хорошо» > «идеально»
- Сравнение с другими: сравнивай только с собой прошлым

**Привычка тренироваться:**
- Правило 2 минут: «просто приди в зал»
- Habit stacking: привязка к существующей привычке
- Reward loop: награда после тренировки
- Identity-based: «Я — человек, который тренируется»
`;
}
export function getWarmupScienceAdvanced(message: string): string {
  const triggers = ['наука разминки', 'разминка подробн', 'зачем разминка', 'типы разминки', 'динамическ статическ разминк', 'pap разминка'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔬 НАУКА РАЗМИНКИ — ПРОДВИНУТЫЙ РАЗБОР:

**Физиология разминки:**
- Повышение температуры мышц на 1-2°С
- Увеличение скорости нервной проводимости
- Снижение вязкости синовиальной жидкости (смазка суставов)
- Усиление кровотока к рабочим мышцам
- Повышение доступности кислорода (сдвиг кривой диссоциации)

**3 фазы оптимальной разминки:**
1. Общая (5 мин): повышение ЧСС до 50-60% макс
   - Лёгкое кардио: дорожка, велосипед, скакалка
2. Динамическая растяжка (5-7 мин):
   - Махи ногами, выпады с ротацией, круги руками
   - Увеличение ROM без снижения силы
3. Специфическая (5-10 мин):
   - Разминочные подходы с прогрессивным увеличением веса
   - 40% → 60% → 75% → рабочий вес

**Статическая растяжка ДО тренировки — миф:**
- Снижает силу на 5-8% (мета-анализ 2012)
- Снижает мощность на 2-3%
- Допустима: если удержание <30 сек и мышца критически жёсткая
- Лучше: динамическая растяжка (сохраняет силу)

**PAP (Post-Activation Potentiation):**
- Тяжёлый подход → пауза 3-5 мин → взрывной подход
- Пример: присед 90% × 2 → пауза → прыжок с весом
- Активирует высокопороговые мотонейроны
- Для: опытных атлетов, день силы/мощности

**Разминка для конкретных упражнений:**
- Жим лёжа: пустой гриф × 15 → 40% × 8 → 60% × 5 → 75% × 3 → рабочий
- Приседания: body weight × 10 → 40% × 8 → 60% × 5 → 75% × 3 → рабочий
- Становая: cat-cow + hip hinge → 40% × 5 → 60% × 3 → 80% × 1 → рабочий
`;
}
export function getTempoTrainingGuide(message: string): string {
  const triggers = ['темп тренировок', 'темповая тренировка', 'скорость повторений', 'эксцентрика концентрик темп', 'time under tension', 'TUT тренировк', 'темп подъём'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ТЕМПОВАЯ ТРЕНИРОВКА — УПРАВЛЕНИЕ СКОРОСТЬЮ ПОВТОРЕНИЙ]
Темп записывается 4 цифрами: E-P1-C-P2 (Эксцентрика-Пауза внизу-Концентрика-Пауза вверху)
Пример: 3-1-2-0 = 3с опускание, 1с пауза внизу, 2с подъём, 0с пауза вверху

ФИЗИОЛОГИЯ КАЖДОЙ ФАЗЫ:
Эксцентрика (опускание):
- Мышца сильнее на 20-40% vs концентрика
- Больше механического повреждения мышечных волокон → стимул к гипертрофии
- Задействует преимущественно быстрые волокна (тип II)
- Оптимально для гипертрофии: 2-4 секунды

Пауза внизу (растянутая позиция):
- Убирает рефлекс растяжения (stretch reflex) → мышца работает «с нуля»
- ↑ механическое напряжение в растянутой позиции → мощный стимул роста
- 1-2с пауза ↑ гипертрофию (Schoenfeld stretch-mediated hypothesis)

Концентрика (подъём):
- Для силы: максимально быстро (intent to move fast)
- Для гипертрофии: 1-3с, контролируемо
- Взрывная концентрика (X или 1с): ↑ рекрутирование быстрых волокон

Пауза вверху (сокращённая позиция):
- Пиковое сокращение: 1-2с → ↑ метаболический стресс
- 0с: для поддержания напряжения (без локаута)

ПРОТОКОЛЫ ПО ЦЕЛЯМ:
Гипертрофия: 3-1-2-1 (TUT 40-70с за подход, 8-12 повторов)
Сила: 2-0-X-1 (X = максимально быстро, 3-5 повторов)
Выносливость: 2-0-2-0 (TUT 60-90с, 15-25 повторов)
Контроль техники: 4-2-2-1 (медленно, осознанно, для новичков)
Эксцентрический акцент: 5-0-1-0 (тяжёлые эксцентрики для продвинутых)

ПРАКТИЧЕСКИЕ СОВЕТЫ:
- Не все упражнения подходят для медленного темпа (взрывные: рывок, толчок — нет)
- Считай в голове «тысяча один, тысяча два...» для точного темпа
- ↓ рабочий вес на 20-30% при переходе на медленный темп
`;
}
export function getIsometricTrainingScience(message: string): string {
  const triggers = ['изометрическ тренировк', 'статическ удержан', 'изометрика наука', 'планка наука', 'wall sit наука', 'изометрическ сила'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ИЗОМЕТРИЧЕСКИЕ ТРЕНИРОВКИ — НАУКА И ПРАКТИКА]
Изометрия — мышечное сокращение без изменения длины мышцы и угла в суставе.

ТИПЫ ИЗОМЕТРИЧЕСКИХ СОКРАЩЕНИЙ:
1. Yielding (уступающая): удержание позиции под нагрузкой (удержание приседа, планка)
2. Overcoming (преодолевающая): давление на неподвижный объект (давить в стену, тянуть закреплённый гриф)
3. Quasi-isometric: очень медленное движение с паузами (5с на каждые 2-3см)

НЕЙРОФИЗИОЛОГИЯ:
- Максимальное произвольное изометрическое сокращение (MVIC) — золотой стандарт измерения силы
- Изометрия: ↑ рекрутирование моторных единиц на КОНКРЕТНОМ угле (±15-20°)
- Angle-specific strength: сила растёт на тренируемом угле ±15°
- Для полного ROM нужны изометрические удержания на 3+ углах

ПРЕИМУЩЕСТВА:
- Минимальная нагрузка на суставы (нет движения → нет трения)
- Идеально для реабилитации и работы вокруг травм
- ↑ прочность сухожилий (тендинопатия: изометрия >30% эффективнее эксцентрики на ранних стадиях)
- Развитие силы в «мёртвых точках» (sticking points)
- ↓ артериальное давление (мета-анализ: 3×4мин wall sit/неделю → −8mmHg систолическое)

ПРОТОКОЛЫ:
Сила: overcoming, 6-10с максимальное усилие, 3-5 подходов, 2-3 мин отдых
Гипертрофия: yielding, 20-40с удержание при 30-50% MVIC, 3-4 подхода
Сухожилия: 45с удержание при тяжёлой нагрузке (70-80% MVIC), 4-5 подходов, 2мин отдых
Давление: wall sit 4×2мин, 3 раза/неделю (протокол Wiles)

ИНТЕГРАЦИЯ В ТРЕНИРОВКИ:
- Пауза в мёртвой точке приседа (2-3с) → ↑ сила из нижней позиции
- Изометрический жим в стойке (pin press isometric) → ↑ сила в локауте
- Планка + вариации → стабильность кора (переход к динамическим: < 60с → прогрессируй)
- Overcoming deadlift (тяга в упоры): 3×6с на уровне колен → ↑ тяга
`;
}
export function getEccentricTrainingGuide(message: string): string {
  const triggers = ['эксцентрическ тренировк', 'негативные повторен', 'эксцентрика наука', 'негативы в тренировк', 'эксцентрическ перегрузк', 'supramaximal eccentric'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ЭКСЦЕНТРИЧЕСКИЕ ТРЕНИРОВКИ — НАУКА НЕГАТИВНЫХ ПОВТОРЕНИЙ]
Эксцентрика — фаза удлинения мышцы под нагрузкой (опускание веса). Мышца на 20-40% сильнее эксцентрически.

УНИКАЛЬНАЯ ФИЗИОЛОГИЯ:
- Преимущественный рекрутирование быстрых волокон типа IIx (даже при низкой скорости)
- Поперечные мостики актин-миозин разрушаются принудительно → больше механического повреждения
- Z-линии саркомеров: деформация → сигнал к ремоделированию → гипертрофия
- Титин (titin): гигантский белок действует как пружина → уникальный стимул
- Меньший расход энергии (АТФ) чем при концентрике → можно работать дольше/тяжелее

ТИПЫ ЭКСЦЕНТРИЧЕСКИХ МЕТОДОВ:
1. Акцентированная эксцентрика: медленное опускание (4-6с) с обычным концентрическим подъёмом
2. Супрамаксимальные негативы: 100-130% 1ПМ, опускание 5-8с, помощь партнёра/стоек на подъёме
3. 2/1 метод: подъём двумя конечностями, опускание одной (leg curl, leg extension)
4. Flywheel training: инерционные тренажёры с эксцентрической перегрузкой
5. Nordic hamstring curl: эталон эксцентрики для задней поверхности бедра

ЭФФЕКТЫ:
- ↑ гипертрофия: особенно рост мышц в длину (сарколемерогенез) — больше саркомеров в серии
- ↑ архитектура мышц: ↑ длина пучков (fascicle length) → ↑ скорость сокращения
- ↑ прочность сухожилий: золотой стандарт при тендинопатии (протокол Alfredson: 3×15 эксц. подъёмов на носки 2р/день)
- ↓ травматизм: Nordic hamstring exercise ↓ риск травмы бицепса бедра на 51% (мета-анализ)
- Repeated bout effect: после первой сессии → защита от повреждений на 2-3 недели

ДОЗИРОВКА:
Гипертрофия: 70-85% 1ПМ, 4-6с эксцентрика, 6-8 повторов, 3-4 подхода
Сила: 100-120% 1ПМ, 5-8с эксцентрика, 2-4 повтора, 3-5 подходов (нужен страхующий)
Реабилитация: 60-70%, 3-4с, 12-15 повторов, ежедневно

⚠️ ПРЕДУПРЕЖДЕНИЯ:
- DOMS (крепатура) после эксцентрики значительно сильнее — начинай с 50% объёма
- Восстановление: 72-96ч (дольше чем обычные тренировки)
- Супрамаксимальные нагрузки ТОЛЬКО для опытных (2+ года стажа) и со страхующим
`;
}
export function getBloodFlowRestrictionTraining(message: string): string {
  const triggers = ['bfr тренировк', 'окклюзионн тренировк', 'ограничение кровоток', 'kaatsu тренировк', 'тренировки с жгутом', 'blood flow restriction'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[BFR (BLOOD FLOW RESTRICTION) — ТРЕНИРОВКИ С ОГРАНИЧЕНИЕМ КРОВОТОКА]
BFR — наложение манжеты/жгута на проксимальную часть конечности для частичного ограничения венозного оттока при сохранении артериального притока.

МЕХАНИЗМ ДЕЙСТВИЯ:
- Накопление метаболитов (лактат, H+, Pi) в мышце → метаболический стресс
- ↑ рекрутирование быстрых волокон типа II даже при 20-30% 1ПМ
- ↑ выработка ГР в 170-290 раз (Takarada 2000)
- ↑ mTOR сигнализация → стимул к мышечному синтезу белка
- ↑ myostatin подавление → снятие «тормоза» роста мышц
- Клеточное набухание (cell swelling) → анаболический сигнал

ПРОТОКОЛ:
- Давление: 40-80% от полной окклюзии (артериальное давление покоя × 1.3 для рук, × 1.5 для ног)
- Нагрузка: 20-40% 1ПМ (лёгкие веса!)
- Схема подходов: 30-15-15-15 (классическая) или 4×20
- Отдых между подходами: 30-60с (короткий — сохранить метаболический стресс)
- Манжету НЕ снимать между подходами, снять после всех подходов упражнения
- Длительность окклюзии: не более 10-15 минут непрерывно

КОГДА ИСПОЛЬЗОВАТЬ:
- Реабилитация после травм (минимальная механическая нагрузка на суставы)
- Дополнение к обычным тренировкам (в конце сессии, 1-2 упражнения)
- Пожилые атлеты (↓ нагрузка на суставы при сохранении стимула)
- Путешествия (нет тяжёлых весов)
- Поддержание мышечной массы при деload

⚠️ ПРОТИВОПОКАЗАНИЯ: тромбоз, варикоз тяжёлой степени, гипертония неконтролируемая, беременность, заболевания сосудов
`;
}
export function getClusterSetTraining(message: string): string {
  const triggers = ['кластерные подход', 'cluster set', 'кластерн сет', 'межповторн отдых', 'intra-set rest'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[КЛАСТЕРНЫЕ ПОДХОДЫ (CLUSTER SETS) — МЕТОДОЛОГИЯ]
Кластерный подход = разбиение обычного подхода на мини-серии с короткими паузами (10-30с) внутри.
Пример: вместо 1×6 → 3×2 с 15с отдыха между парами.

ФИЗИОЛОГИЯ:
- Частичное восстановление фосфокреатина за 10-30с (~50-70%)
- ↓ утомление внутри подхода → ↑ качество каждого повторения
- ↑ средняя скорость штанги → ↑ развитие мощности
- Поддержание высокого рекрутирования моторных единиц без ↑ метаболического утомления
- ↑ тренировочный объём при данной интенсивности

ТИПЫ КЛАСТЕРНЫХ ПОДХОДОВ:
1. Стандартные кластеры: 4-6 повторов, пауза 15-20с после каждого 2-го повтора
2. Rest-redistribution: общее время отдыха распределяется внутри подхода (3мин → 6×30с)
3. Одиночные кластеры (singles): 85-95% 1ПМ, 1 повтор × 5-6 с паузой 15-30с
4. Волнообразные кластеры: чередование весов внутри кластера

ПРОТОКОЛЫ ПО ЦЕЛЯМ:
Сила: 85-95% 1ПМ, кластеры по 1-2 повтора, пауза 20-30с, 4-6 мини-серий
Мощность: 60-80% 1ПМ, кластеры по 1-3 повтора, пауза 15-20с, акцент на скорость
Гипертрофия: 70-80% 1ПМ, кластеры по 3-4 повтора, пауза 10-15с (↑ объём vs обычные подходы)

ЛУЧШИЕ УПРАЖНЕНИЯ ДЛЯ КЛАСТЕРОВ:
- Приседания, жим лёжа, тяга (базовые со штангой)
- Тяжелоатлетические движения (рывок, толчок) — классический метод подготовки
- НЕ подходят: изоляция, упражнения на тренажёрах (не нужна мощность)

ПРЕИМУЩЕСТВО: больший тоннаж при той же интенсивности. 5×(2+2+2) с 15с > 5×6 по качеству повторений.
`;
}
export function getDropSetScience(message: string): string {
  const triggers = ['дроп сет наука', 'дропсет подробн', 'снижение веса подход', 'strip set', 'дроп сеты эффективн', 'механизм дроп сет'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ДРОП-СЕТЫ — НАУКА И ПРАКТИКА]
Дроп-сет = выполнение подхода до отказа → снижение веса на 20-30% → продолжение без отдыха → повтор.

МЕХАНИЗМЫ:
- При отказе: утомлены текущие моторные единицы, но ↓ веса позволяет продолжить другими
- ↑↑ метаболический стресс (лактат, H+) — мощный триггер гипертрофии
- ↑ Time Under Tension (TUT) — 2-3× дольше чем обычный подход
- ↑ клеточное набухание → mTOR → синтез белка
- Рекрутирование моторных единиц по принципу размера: быстрые → медленные

ИССЛЕДОВАНИЯ:
- Fink et al. (2018): дроп-сеты = обычным подходам по гипертрофии при ВДВОЕ меньшем времени тренировки
- Schoenfeld & Grgic (2018): 1 дроп-сет ≈ 3 обычных подхода по мышечному росту
- Ozaki et al. (2018): ↑ мышечная выносливость при дроп-сетах vs обычные

ТИПЫ ДРОП-СЕТОВ:
1. Стандартный: 3 дропа по 20-25% (100кг→80кг→60кг→45кг)
2. Тройной дроп: ровно 3 снижения веса
3. Механический дроп-сет: смена упражнения/хвата/угла вместо веса
4. «6-20» дроп: тяжёлый подход 6 повторов → 50% сброс → 20 повторов
5. Drop-set с паузой: 5-10с отдых между дропами

ПРАВИЛА ПРИМЕНЕНИЯ:
- Максимум 1-2 дроп-сета на мышечную группу за тренировку
- Идеально: последний подход упражнения → дроп-сет как финишер
- Лучше работают на тренажёрах (быстрая смена веса) и гантелях
- Не использовать на базовых со штангой (долго менять блины, риск техники)
- Восстановление: 48-72ч (высокий метаболический стресс)
`;
}
export function getSupersetTrainingScience(message: string): string {
  const triggers = ['суперсет наука', 'суперсеты подробн', 'суперсеты эффективн', 'пара упражнений без отдыха', 'антагонист суперсет', 'агонист суперсет'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[СУПЕРСЕТЫ — НАУКА И МЕТОДОЛОГИЯ]
Суперсет = два упражнения подряд без отдыха (или с минимальным 10-15с).

ТИПЫ СУПЕРСЕТОВ:
1. Антагонисты: мышцы-антагонисты (жим + тяга, бицепс + трицепс)
   - ↑ сила в каждом упражнении на 5-10% (реципрокная иннервация)
   - ↓ время тренировки на 40% при сохранении объёма и интенсивности
   - Лучший тип для силы и гипертрофии

2. Агонисты: одна мышечная группа (жим лёжа + разведение гантелей)
   - ↑↑ метаболический стресс и пампинг
   - ↑ TUT для целевой мышцы
   - Требует больше восстановления

3. Верх-Низ: упражнения для разных частей тела (приседания + подтягивания)
   - Минимальная интерференция между упражнениями
   - ↑↑ кардио-эффект (сердце гонит кровь между верхом и низом)
   - Лучший тип для жиросжигания и conditioning

4. Предутомление: изоляция → база (разведения → жим лёжа)
   - Целевая мышца уже утомлена → ↑ MMC в базовом упражнении
   - ⚠️ ↓ рабочий вес в базовом на 15-25%

5. Пост-утомление: база → изоляция (жим лёжа → разведения)
   - Тяжёлая работа без ↓ веса + добивка целевой мышцы

ИССЛЕДОВАНИЯ:
- Paz et al. (2017): антагонист суперсеты ↑ объём тренировки и ↓ время на 33%
- Weakley et al. (2017): суперсеты антагонистов ↑ мощность на 4-6%
- Schoenfeld (2010): агонист суперсеты = эффективный метод гипертрофии

ПРАКТИКА:
- Антагонисты: 3-4 суперсета × 8-12 повторов, 90с отдых между суперсетами
- Агонисты: 2-3 суперсета × 10-15 повторов, 2мин отдых
- Не суперсетить два тяжёлых базовых упражнения (приседания + тяга = ↑↑ системная усталость)
`;
}
export function getGiantSetTraining(message: string): string {
  const triggers = ['гигантский подход', 'giant set', 'гигант сет', '4+ упражнения подряд', 'круговая тренировка силов'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ГИГАНТСКИЕ ПОДХОДЫ (GIANT SETS) — МЕТОДОЛОГИЯ]
Giant set = 4+ упражнений подряд на одну мышечную группу с минимальным отдыхом (0-15с).

СТРУКТУРА:
Классический giant set для груди (пример):
1. Жим лёжа (тяжёлая база) → сразу →
2. Жим гантелей на наклонной (средняя база) → сразу →
3. Разведение гантелей (изоляция, растяжение) → сразу →
4. Отжимания (добивка собственным весом)
Отдых 2-3 минуты → повторить 2-3 круга

ФИЗИОЛОГИЯ:
- ↑↑↑ метаболический стресс (экстремальный пампинг)
- ↑ локальная гипоксия → ↑ факторы роста (IGF-1, HGF)
- ↑ клеточное набухание → ↑ активация сателлитных клеток
- Разные углы/упражнения → полная активация всех пучков мышцы
- ↑↑ расход калорий и EPOC (excess post-exercise oxygen consumption)

ПРИНЦИПЫ ПОСТРОЕНИЯ:
1. Начинай с самого тяжёлого/технически сложного упражнения (пока свежий)
2. Прогрессия от базовых к изоляции (↓ координационные требования)
3. Чередуй растяжение/сокращение: растянутая позиция → сокращённая позиция
4. Финишер: упражнение с собственным весом или самое простое (до максимального пампа)
5. Веса: 60-75% 1ПМ (ниже чем обычно из-за кумулятивной усталости)

ДОЗИРОВКА:
- 2-3 giant set за тренировку (1 на мышечную группу)
- Повторения: 8-15 в каждом упражнении
- Отдых внутри: 0-15с (только переход между снарядами)
- Отдых между кругами: 2-3 минуты
- Частота: 1 раз в неделю на мышечную группу (высокий стресс)

⚠️ ТОЛЬКО для продвинутых (2+ года стажа). Новичкам — стандартные подходы.
`;
}
export function getRestPauseTrainingScience(message: string): string {
  const triggers = ['рест пауз', 'rest pause', 'отдых пауза метод', 'rest-pause тренировк', 'метод отдых пауза подробн'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[REST-PAUSE — МЕТОД ТРЕНИРОВКИ]
Rest-pause = подход до отказа → пауза 10-20с → продолжение до отказа → пауза → продолжение.
Отличие от кластеров: rest-pause идёт ДО ОТКАЗА, кластеры — с запасом.

ТИПЫ:
1. DC Training (Dante Trudel): 1 тяжёлый подход, 2 rest-pause
   - 80-85% 1ПМ до отказа (обычно 6-8 повторов) → 15с пауза → до отказа (2-4 повтора) → 15с → до отказа (1-3 повтора)
   - Итого: 9-15 повторов с весом на 6-8ПМ

2. Myo-reps (Borge Fagerli): лёгкая версия
   - Активационный подход: 12-20 повторов до RPE 8-9
   - Мини-серии: 3-5 повторов с 5-10с паузой × 4-5 серий
   - Нагрузка: 40-60% 1ПМ

3. Rest-pause для силы:
   - 87-93% 1ПМ, 1-2 повтора → 20-30с → 1-2 повтора × 4-6 серий
   - Имитация синглов без полного отдыха

МЕХАНИЗМЫ:
- Частичное восстановление фосфокреатина (~50-65% за 15-20с)
- ↑ рекрутирование моторных единиц: с каждой мини-серией ↑ доля быстрых волокон
- ↑ метаболический стресс при минимальном времени
- Эффективность по времени: 1 rest-pause = 3 обычных подхода за 1/3 времени

ИССЛЕДОВАНИЯ:
- Prestes et al. (2019): rest-pause = традиционным подходам по гипертрофии при ↓ времени на 60%
- Marshall et al. (2021): rest-pause ↑ гипертрофию нижней части тела vs обычные подходы

ПРИМЕНЕНИЕ:
- Последний подход упражнения → rest-pause как интенсификатор
- Максимум 2-3 rest-pause подхода за тренировку
- Лучше всего: тренажёры и гантели (безопасность при отказе)
`;
}
export function getMechanicalDropSetGuide(message: string): string {
  const triggers = ['механический дроп сет', 'mechanical drop set', 'смена угла без отдыха', 'механическ дроп', 'дроп сет без снижения веса'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[МЕХАНИЧЕСКИЕ ДРОП-СЕТЫ — ПРОДВИНУТАЯ МЕТОДИКА]
Механический дроп-сет = вместо снижения веса меняется биомеханическое преимущество (угол, хват, позиция).
Переход от слабой позиции к сильной позволяет продолжать с ТЕМ ЖЕ весом.

ПРИНЦИП: слабая позиция → более сильная позиция → самая сильная позиция

ПРИМЕРЫ МЕХАНИЧЕСКИХ ДРОП-СЕТОВ:

Грудь (гантели, один вес):
1. Разведения на наклонной → 2. Жим на наклонной → 3. Жим на горизонтальной
(изоляция → база слабый угол → база сильный угол)

Бицепс (штанга EZ, один вес):
1. Сгибания узким хватом → 2. Сгибания средним хватом → 3. Сгибания широким хватом + читинг

Трицепс (канатная рукоять, один вес):
1. Разгибания из-за головы → 2. Разгибания перед собой → 3. Отжимания от каната вниз

Плечи (гантели):
1. Передние подъёмы → 2. Боковые подъёмы → 3. Тяга к подбородку

Спина (блок):
1. Прямые руки тяга → 2. Широкий хват тяга к груди → 3. Узкий хват тяга к поясу

Ноги (штанга):
1. Фронтальные приседания → 2. Приседания со штангой на спине → 3. Полуприседания

ПРЕИМУЩЕСТВА:
- Не нужно менять вес → экономия времени, особенно в загруженном зале
- ↑ TUT и метаболический стресс
- Проработка мышцы под разными углами за один подход
- Психологически легче: вес не снижается (нет ощущения «стало слишком легко»)

ДОЗИРОВКА: 2-3 механических дропа, 6-10 повторов в каждой позиции, 1-2 таких подхода на мышцу.
`;
}
export function getMyoRepTrainingGuide(message: string): string {
  const triggers = ['myo rep тренировк', 'myo-rep', 'майореп', 'борге фагерли метод', 'активационн подход мини серии'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[MYO-REPS — ЭФФЕКТИВНАЯ ГИПЕРТРОФИЯ ЗА МИНИМУМ ВРЕМЕНИ]
Myo-reps (Borge Fagerli) — оптимизированная версия rest-pause для максимальной гипертрофии при минимальном объёме.

КОНЦЕПЦИЯ:
Первые 5 повторов обычного подхода (при лёгком весе) — «мусорные»: низкое рекрутирование моторных единиц. Только последние 5 повторов перед отказом — эффективные (effective reps). Myo-reps максимизирует количество «эффективных повторов».

ПРОТОКОЛ:
1. Активационный подход: 40-60% 1ПМ × 12-20 повторов до RPE 8-9 (почти до отказа)
2. Пауза: 3-5 глубоких вдохов (≈10-15с)
3. Мини-серия: 3-5 повторов
4. Повторять паузу + мини-серию пока:
   - Количество повторов в мини-серии падает (начал с 5, упал до 3 → стоп)
   - Или выполнено 4-5 мини-серий
   - Или скорость штанги заметно ↓

ПРИМЕР:
Разгибания на трицепс, 30кг:
- Активация: 15 повторов → 5с пауза → 5 повторов → 5с → 4 повтора → 5с → 3 повтора → СТОП
- Итого: 27 повторов, из них ~20 «эффективных» (vs 5-6 в обычном подходе из 12)

НАУКА:
- Каждый повтор после активации выполняется при высоком рекрутировании моторных единиц
- Фосфокреатин восстанавливается достаточно для продолжения, но моторные единицы остаются активными
- 1 myo-rep подход ≈ 3-4 обычных подхода по эффективным повторениям
- Время: 2-3 минуты вместо 10-12 минут

ПРИМЕНЕНИЕ:
- Идеально для: изоляции, тренажёров, вспомогательных упражнений
- НЕ подходит для: тяжёлых базовых (приседания, тяга — ↑ риск при утомлении)
- 1-2 myo-rep упражнения в конце тренировки как финишеры
- Отлично для тренировок с ограниченным временем
`;
}
export function getPartialRepsScience(message: string): string {
  const triggers = ['частичн повторен наука', 'partial reps', 'неполная амплитуда наука', 'укороченн амплитуд', 'полуприсед наука', 'частичны повторен эффект'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ЧАСТИЧНЫЕ ПОВТОРЕНИЯ (PARTIAL REPS) — НАУЧНЫЙ АНАЛИЗ]
Partial reps = выполнение упражнения в ограниченном диапазоне движения (ROM).

ПОЛНАЯ АМПЛИТУДА VS ЧАСТИЧНАЯ — ЧТО ЛУЧШЕ?
Мета-анализ Schoenfeld & Grgic (2020): полная амплитуда ↑ гипертрофию на 5-10% vs частичная.
НО: частичные в РАСТЯНУТОЙ позиции = лучше или равно полному ROM.

КЛЮЧЕВОЕ ОТКРЫТИЕ (2022-2024):
- Pedrosa et al. (2022): тренировки в растянутой позиции (нижняя часть ROM) ↑ гипертрофию на 53% vs укороченная позиция
- Maeo et al. (2022): сгибания бицепса в растянутой позиции (наклонная скамья) ↑ рост на 27%
- Механизм: stretch-mediated hypertrophy — максимальное механическое напряжение в растянутой позиции

КОГДА ЧАСТИЧНЫЕ ЭФФЕКТИВНЕЕ:
1. Растянутая позиция (lengthened partials): нижняя 1/2-2/3 ROM
   - Приседания: параллель и ниже (не вставать полностью)
   - Жим лёжа: нижняя половина (от груди до середины)
   - Сгибания: нижняя позиция с растяжением бицепса
   - ↑↑ гипертрофия, возможно лучше полного ROM

2. Укороченная позиция (shortened partials): верхняя 1/3 ROM
   - Локаут в жиме, локаут в приседаниях
   - ↓ гипертрофия vs полный ROM
   - Полезно для: развития силы в конкретном угле, перегрузка ЦНС

3. Средняя часть ROM:
   - Промежуточная эффективность
   - Используется при болезненности в крайних позициях

ПРАКТИЧЕСКОЕ ПРИМЕНЕНИЕ:
- Lengthened partials как финишер после подходов с полным ROM (3-5 повторов в растянутой позиции после отказа)
- «1.5 reps»: полный ROM + возврат в растянутую позицию + полный ROM = 1 повтор
- Не заменять полную амплитуду частичной — дополнять
- Разгибания ног: в нижней позиции (колено согнуто >90°) → ↑ vastus lateralis рост
`;
}
export function getLinearProgressionGuide(message: string): string {
  const triggers = ['линейная прогрессия подробн', 'linear progression', 'новичку программ', 'прогрессия весов для начинающ', 'каждую тренировку добавлять вес'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ЛИНЕЙНАЯ ПРОГРЕССИЯ — ОСНОВА СИЛОВОГО ТРЕНИНГА]
Линейная прогрессия (LP) = увеличение рабочего веса КАЖДУЮ тренировку. Работает у новичков 3-9 месяцев.

ПОЧЕМУ РАБОТАЕТ У НОВИЧКОВ:
- Нейромышечные адаптации: ↑ рекрутирование моторных единиц, ↑ координация → быстрый рост силы
- SRA-цикл: восстановление за 48-72ч (быстрее чем у продвинутых)
- Мышечная память: мало мышечных ядер (миоядер) → каждое новое ядро = значимый прирост
- Нет необходимости в сложной периодизации — простой стимул даёт максимальный ответ

КЛАССИЧЕСКИЕ LP-ПРОГРАММЫ:
Starting Strength (Mark Rippetoe):
- 3 дня/неделю, полное тело, A/B чередование
- A: приседания 3×5, жим лёжа 3×5, тяга 1×5
- B: приседания 3×5, жим стоя 3×5, подтягивания 3×до отказа
- Прогрессия: +2.5кг верх, +5кг низ каждую тренировку

StrongLifts 5×5:
- 3 дня/неделю, A/B
- A: приседания 5×5, жим 5×5, тяга 1×5
- B: приседания 5×5, жим стоя 5×5, тяга штанги 5×5
- Прогрессия: +2.5кг каждую тренировку

КОГДА LP ПЕРЕСТАЁТ РАБОТАТЬ:
- Не можешь добавить вес 2-3 тренировки подряд → время для промежуточных программ
- Обычно: приседания ~100-140кг, жим ~70-90кг, тяга ~120-160кг (для мужчин 80кг)
- Признак: нужен деload, но после него рост возвращается только на 1-2 тренировки

ПЕРЕХОД НА СЛЕДУЮЩИЙ УРОВЕНЬ:
LP → weekly progression (Texas Method, Madcow 5×5) → block periodization
`;
}
export function getDailyUndulatingPeriodization(message: string): string {
  const triggers = ['dup программ', 'daily undulating', 'ежедневн волнообразн периодизац', 'дуп периодизац', 'волнообразн нагрузк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[DUP — ЕЖЕДНЕВНАЯ ВОЛНООБРАЗНАЯ ПЕРИОДИЗАЦИЯ]
DUP = изменение интенсивности и объёма КАЖДУЮ тренировку для одного движения.

СТРУКТУРА (пример для 3 дней/неделю):
Понедельник — ГИПЕРТРОФИЯ: 4×8-12 при 65-75% 1ПМ
Среда — СИЛА: 5×3-5 при 80-88% 1ПМ
Пятница — МОЩНОСТЬ: 6×2-3 при 85-93% 1ПМ (или 5×3 при 75% с акцентом на скорость)

НАУКА:
- Rhea et al. (2002): DUP ↑ силу на 28.8% vs линейная периодизация на 14.4% за 12 недель
- Miranda et al. (2011): DUP = или > линейной для гипертрофии
- Механизм: ↑ вариативность стимула → ↓ адаптация к однотипной нагрузке
- Каждая тренировка — уникальный стимул: нервная система, метаболизм, механическое напряжение

ВАРИАНТЫ DUP:
1. Классическая (3 дня): гипертрофия → сила → мощность
2. 4-дневная: гипертрофия → сила → лёгкая → мощность
3. По движениям: жим лёжа DUP + приседания DUP (разные дни — разные зоны)
4. Undulating block: 2 недели акцент гипертрофия, 2 недели сила, 2 недели мощность

ПРИМЕР ПОЛНОЙ НЕДЕЛИ:
Пн: Присед 4×10@70%, Жим 5×5@82%, Тяга 3×8@72%
Ср: Присед 5×5@82%, Жим 4×10@70%, Подтягивания 4×8
Пт: Присед 6×2@88%, Жим 6×3@85%, Тяга 5×3@85%

КОМУ ПОДХОДИТ:
✅ Средний уровень (6-18 месяцев стажа) — лучший вариант после LP
✅ Атлеты, которым скучно от однотипных тренировок
❌ Начинающие (LP эффективнее и проще)
`;
}
export function getBlockPeriodizationGuide(message: string): string {
  const triggers = ['блочная периодизац', 'block periodization', 'мезоцикл програм', 'блок гипертрофии', 'блок силы', 'периодизация блоками'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[БЛОЧНАЯ ПЕРИОДИЗАЦИЯ — ПРОДВИНУТОЕ ПРОГРАММИРОВАНИЕ]
Блочная периодизация (Issurin, 2008) = последовательные мезоциклы (блоки) по 2-4 недели с разными целями.

СТРУКТУРА:
Блок 1 — НАКОПЛЕНИЕ (Accumulation): 3-4 недели
- Цель: гипертрофия, GPP (общая физическая подготовка)
- Объём: ВЫСОКИЙ (20-25 подходов/мышца/неделю)
- Интенсивность: 60-75% 1ПМ, 8-15 повторов
- Отдых: 60-90с

Блок 2 — ТРАНСМУТАЦИЯ (Transmutation): 2-3 недели
- Цель: максимальная сила
- Объём: СРЕДНИЙ (12-16 подходов/мышца/неделю)
- Интенсивность: 80-90% 1ПМ, 3-6 повторов
- Отдых: 2-4 мин

Блок 3 — РЕАЛИЗАЦИЯ (Realization): 1-2 недели
- Цель: пик силы / соревнования
- Объём: НИЗКИЙ (6-10 подходов/мышца/неделю)
- Интенсивность: 90-100%+ 1ПМ, 1-3 повтора
- Отдых: 3-5+ мин

Деload: 1 неделя после каждого макроцикла (3 блока)

ПРЕИМУЩЕСТВА:
- Развитие одного качества за блок → минимальная интерференция
- Residual training effects: гипертрофия сохраняется 30+ дней → несёт пользу в блоке силы
- Психологическое разнообразие: каждый блок — новые ощущения
- Лучше для продвинутых: нужна концентрация стимула для прогресса

КОМУ:
✅ Продвинутые (2+ года), пауэрлифтеры, спортсмены с соревновательным сезоном
❌ Новички и средний уровень (LP и DUP эффективнее)
`;
}
export function get531ProgramGuide(message: string): string {
  const triggers = ['5/3/1 програм', '531 программ', 'wendler программ', 'вендлер програм', 'boring but big', '531 подробн'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[5/3/1 ДЖИМА ВЕНДЛЕРА — ПОЛНЫЙ РАЗБОР]
5/3/1 — одна из самых популярных и эффективных программ для среднего-продвинутого уровня. Простая, гибкая, долгосрочная.

БАЗОВАЯ СТРУКТУРА (4-недельный цикл):
Training Max (TM) = 85-90% от реального 1ПМ

Неделя 1 (5+): 65%×5, 75%×5, 85%×5+ (AMRAP — максимум повторов)
Неделя 2 (3+): 70%×3, 80%×3, 90%×3+ (AMRAP)
Неделя 3 (5/3/1+): 75%×5, 85%×3, 95%×1+ (AMRAP)
Неделя 4 (Deload): 40%×5, 50%×5, 60%×5

Проценты от Training Max, НЕ от реального 1ПМ!
Прогрессия: +2.5кг TM для верха, +5кг TM для низа каждый цикл (4 недели)

4 ОСНОВНЫХ УПРАЖНЕНИЯ (1 в день):
День 1: Жим стоя | День 2: Тяга | День 3: Жим лёжа | День 4: Приседания

ШАБЛОНЫ ВСПОМОГАТЕЛЬНЫХ:
Boring But Big (BBB): основное упражнение 5×10 при 50-60% TM после основной работы
First Set Last (FSL): 3-5×5-8 при 65-75% TM (первый рабочий вес)
Triumvirate: 2 вспомогательных упражнения × 3-5×10-15
Building the Monolith: 5/3/1 + высокий объём + жёсткая диета (для набора массы)

ДОПОЛНИТЕЛЬНАЯ РАБОТА (50-100 повторов каждой категории):
- Push: отжимания, дипы, жим гантелей
- Pull: подтягивания, тяга гантели, фейс-пулл
- Legs/Core: выпады, GHR, пресс

ПОЧЕМУ 5/3/1 РАБОТАЕТ:
- Субмаксимальные веса: ↓ травматизм, ↑ долгосрочный прогресс
- AMRAP-подход: авторегуляция (плохой день = минимум, хороший = рекорд)
- Медленная прогрессия: ~30кг/год на приседания = реалистично для среднего уровня
- Гибкость: десятки шаблонов вспомогательных под любую цель
`;
}
export function getStartingStrengthGuide(message: string): string {
  const triggers = ['starting strength подробн', 'стартинг стренгс', 'программа рипт', 'rippetoe программ', 'ss программ новичк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[STARTING STRENGTH — ПРОГРАММА МАРКА РИПТО ДЛЯ НОВИЧКОВ]
Starting Strength (SS) — классическая программа линейной прогрессии. Фокус: базовые движения со штангой.

ПРОГРАММА:
Фаза 1 (первые 2-3 недели):
День A: Приседания 3×5, Жим лёжа 3×5, Становая тяга 1×5
День B: Приседания 3×5, Жим стоя 3×5, Становая тяга 1×5
Чередование A/B, 3 дня/неделю: Пн-A, Ср-B, Пт-A, Пн-B...

Фаза 2 (с 3-й недели):
День A: Приседания 3×5, Жим лёжа 3×5, Становая тяга 1×5
День B: Приседания 3×5, Жим стоя 3×5, Подтягивания 3×до отказа (или тяга в наклоне 3×5)

Фаза 3 (через 4-6 недель):
Добавляются: взятие на грудь (power clean) 5×3 вместо тяги в день B
Подсобка: дипы, подъём на бицепс (опционально)

ПРОГРЕССИЯ:
- Приседания: +2.5-5кг КАЖДУЮ тренировку
- Жим/жим стоя: +1-2.5кг каждую тренировку
- Тяга: +2.5-5кг каждую тренировку
- Микро-блины (0.5-1кг) = необходимость для длительной прогрессии

ОТЛАЖИВАНИЕ СТОПОВ:
1 стоп: не взял вес → повторить тот же вес следующую тренировку
2 стопа подряд: ↓ вес на 10%, работать обратно вверх
3 стопа: deload на 20% или переход на промежуточную программу

ТИПИЧНЫЕ РЕЗУЛЬТАТЫ (мужчина, 80кг, 6-9 месяцев):
- Приседания: 60кг → 120-140кг
- Жим лёжа: 40кг → 80-100кг
- Тяга: 70кг → 140-180кг
- Жим стоя: 30кг → 55-65кг

ПИТАНИЕ (критично для SS):
- GOMAD (gallon of milk a day) — экстремальный вариант для худых (не рекомендую)
- Реалистично: +300-500 ккал/день, 1.6-2г белка/кг
- Без профицита LP остановится раньше
`;
}
export function getPPLSplitGuide(message: string): string {
  const triggers = ['ppl сплит', 'push pull legs', 'тяни толкай ноги', 'ppl программ подробн', 'push pull legs програм'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[PPL (PUSH/PULL/LEGS) — СПЛИТ ДЛЯ ГИПЕРТРОФИИ]
PPL = разделение тренировок по типу движения: толкающие / тянущие / ноги.

СТРУКТУРА (6 дней/неделю, каждая группа 2×/неделю):
Пн: Push | Вт: Pull | Ср: Legs | Чт: Push | Пт: Pull | Сб: Legs | Вс: отдых

PUSH (грудь, плечи, трицепс):
1. Жим лёжа / жим гантелей: 4×6-8 (тяжёлая база)
2. Жим на наклонной: 3×8-10
3. Разведения / пек-дек: 3×12-15
4. Жим стоя / жим гантелей сидя: 3×8-10
5. Боковые подъёмы: 3×12-15
6. Трицепс (разгибания на блоке): 3×10-12
7. Трицепс (французский жим): 3×10-12

PULL (спина, задние дельты, бицепс):
1. Тяга штанги в наклоне / подтягивания: 4×6-8
2. Тяга верхнего блока / подтягивания обратным хватом: 3×8-10
3. Тяга нижнего блока / тяга гантели: 3×10-12
4. Фейс-пулл: 3×15-20
5. Шраги: 3×10-12
6. Подъём на бицепс штанга: 3×8-10
7. Молотки / концентрированные сгибания: 3×10-12

LEGS (квадрицепс, бицепс бедра, икры, ягодицы):
1. Приседания: 4×6-8
2. Румынская тяга: 3×8-10
3. Жим ногами: 3×10-12
4. Разгибания ног: 3×12-15
5. Сгибания ног: 3×10-12
6. Подъёмы на носки: 4×12-15

ПРОГРЕССИЯ:
- Линейная в базовых (↑ вес при выполнении верхней границы повторов)
- Двойная прогрессия в изоляции: 3×10 → 3×12 → ↑ вес → 3×10

КОМУ ПОДХОДИТ:
✅ Средний/продвинутый уровень, цель гипертрофия, 6 дней свободны
❌ Новички (полное тело эффективнее), занятые (3 дня/неделю → upper/lower)
`;
}
export function getUpperLowerSplitGuide(message: string): string {
  const triggers = ['верх низ сплит', 'upper lower split', 'верх/низ программ', 'upper lower подробн', '4 дня сплит верх низ'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[UPPER/LOWER (ВЕРХ/НИЗ) — УНИВЕРСАЛЬНЫЙ СПЛИТ]
Upper/Lower = 4 дня/неделю, каждая мышечная группа 2×/неделю.

СТРУКТУРА:
Пн: Upper A (сила) | Вт: Lower A (сила)
Ср: отдых
Чт: Upper B (гипертрофия) | Пт: Lower B (гипертрофия)
Сб-Вс: отдых

UPPER A (акцент сила):
1. Жим лёжа: 4×4-6
2. Тяга штанги в наклоне: 4×4-6
3. Жим стоя: 3×6-8
4. Подтягивания: 3×6-8
5. Фейс-пулл: 3×12-15
6. Трицепс: 2×8-10
7. Бицепс: 2×8-10

UPPER B (акцент гипертрофия):
1. Жим гантелей наклонная: 3×8-12
2. Тяга верхнего блока: 3×8-12
3. Боковые подъёмы: 3×12-15
4. Тяга нижнего блока: 3×10-12
5. Разведения: 3×12-15
6. Трицепс: 3×10-15
7. Бицепс: 3×10-15

LOWER A (акцент сила):
1. Приседания: 4×4-6
2. Румынская тяга: 3×6-8
3. Жим ногами: 3×8-10
4. Сгибания ног: 3×8-10
5. Подъёмы на носки: 3×10-15
6. Пресс: 3×10-15

LOWER B (акцент гипертрофия):
1. Фронтальные приседания / гакк: 3×8-12
2. Становая тяга: 3×5-8
3. Выпады: 3×10-12 на ногу
4. Разгибания ног: 3×12-15
5. GHR / сгибания ног: 3×10-12
6. Подъёмы на носки сидя: 3×12-15

ПРЕИМУЩЕСТВА:
- 4 дня/неделю — реалистично для работающих людей
- Каждая группа 2×/неделю — оптимально для гипертрофии (Schoenfeld 2016)
- Силовой + гипертрофический день — развитие и силы, и массы
- Гибкость: можно двигать дни без потери структуры
`;
}
export function getFullBodyVsSplitScience(message: string): string {
  const triggers = ['полное тело или сплит', 'full body vs split', 'фулбади или сплит', 'что лучше сплит или фулбоди', 'фулбади vs пплс'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[FULL BODY VS СПЛИТ — ЧТО ГОВОРИТ НАУКА]
Ключевой фактор: ЧАСТОТА тренировки мышечной группы при РАВНОМ недельном объёме.

МЕТА-АНАЛИЗ Schoenfeld et al. (2016):
- 2× в неделю > 1× в неделю для гипертрофии (при одинаковом объёме)
- 3× в неделю ≈ 2× в неделю (не значимо лучше для большинства)

FULL BODY (3-4 дня/неделю):
✅ Каждая мышца 3-4×/неделю → максимальная частота MPS (мышечный синтез белка)
✅ Идеально для начинающих (нейромышечные адаптации требуют частой практики)
✅ Гибкость расписания: пропустил день — не потерял мышечную группу
✅ Высокий EPOC и расход калорий (множество базовых за тренировку)
❌ Длинные тренировки (60-90 мин) если нужен высокий объём
❌ Сложно дать 20+ подходов на мышцу/неделю без утомления

СПЛИТ (PPL 6 дней, Upper/Lower 4 дня, Bro-split 5 дней):
✅ Больше объёма на мышцу за тренировку (10-15 подходов vs 4-6 в full body)
✅ Больше разнообразия упражнений для каждой мышцы
✅ Меньше системной усталости за тренировку
❌ Bro-split (1×/неделю): субоптимален для гипертрофии (Schoenfeld 2016)
❌ PPL 6 дней: требует 6 свободных дней

РЕКОМЕНДАЦИИ ПО УРОВНЮ:
Новичок (0-12 мес): Full Body 3×/неделю — без вариантов
Средний (1-2 года): Upper/Lower 4×/неделю или Full Body 4× — оптимальный баланс
Продвинутый (2+ лет): PPL 6×, U/L 4×, или arnold split — нужен объём
Продвинутый с мало времени: Full Body 3× с высокой интенсивностью

ВЕРДИКТ: при РАВНОМ объёме и частоте ≥2×/неделю — разница минимальна. Выбирай по расписанию и удовольствию.
`;
}
export function getAutoregulationRPEScience(message: string): string {
  const triggers = ['авторегуляция тренировок', 'rpe тренировк подробн', 'rir наука', 'rpe vs процент', 'субъективн шкала нагрузк', 'как использовать rpe'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[АВТОРЕГУЛЯЦИЯ: RPE И RIR — НАУКА СУБЪЕКТИВНОЙ НАГРУЗКИ]
RPE (Rate of Perceived Exertion) и RIR (Reps in Reserve) — системы управления нагрузкой по ощущениям.

ШКАЛА RPE (Tuchscherer, модификация Borg):
RPE 10 = максимальное усилие, 0 повторов в запасе (отказ)
RPE 9 = мог бы сделать 1 повтор ещё
RPE 8 = мог бы сделать 2 повтора ещё
RPE 7 = мог бы сделать 3 повтора ещё
RPE 6 = лёгкая работа, 4+ повтора в запасе

RIR = Reps In Reserve (повторы в запасе) — обратная шкала: RIR 0 = отказ, RIR 2 = 2 повтора в запасе

ПОЧЕМУ RPE ЛУЧШЕ % ОТ 1ПМ:
- 1ПМ меняется: +5% в хороший день, −10% в плохой → проценты неточны
- Внешние факторы: сон, стресс, питание, менструальный цикл → ежедневные колебания
- Разные упражнения: RPE 8 в приседаниях ≠ 82% 1ПМ в жиме
- RPE учитывает текущее состояние → оптимальный стимул СЕГОДНЯ

ТОЧНОСТЬ RPE:
- Новички: плохо оценивают RPE (ошибка ±2-3 повтора) → им нужен тренерский контроль
- Средний: умеренная точность (±1-2 повтора)
- Продвинутые: высокая точность (±0.5-1 повтор), особенно в базовых движениях
- Многосуставные > изоляция по точности оценки RPE

ОПТИМАЛЬНЫЕ ЗОНЫ:
Гипертрофия: RPE 7-9 (RIR 1-3) × 8-12 повторов
Сила: RPE 8-9.5 (RIR 0.5-2) × 1-5 повторов
Мощность/техника: RPE 6-7 (RIR 3+) × 2-5 повторов
Разминочные: RPE 5-6

КАК НАУЧИТЬСЯ RPE:
1. Каждый подход записывай предполагаемый RPE ДО и фактический ПОСЛЕ
2. Иногда делай AMRAP (до отказа) чтобы калибровать ощущения
3. Используй velocity-based training (VBT) для объективной обратной связи
4. Через 3-6 месяцев практики точность значительно ↑
`;
}
export function getPlyometricTrainingScience(message: string): string {
  const triggers = ['плиометрика', 'plyometric', 'прыжковые тренировк', 'взрывная сила ноги', 'box jump', 'прыжки на коробку'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⚡ ПЛИОМЕТРИЧЕСКАЯ ТРЕНИРОВКА — НАУКА:

ЧТО ТАКОЕ ПЛИОМЕТРИКА:
Упражнения с быстрым циклом растяжение-сокращение (SSC — Stretch-Shortening Cycle). Мышца растягивается (эксцентрика) → мгновенный переход → сокращается (концентрика). Накопленная упругая энергия + рефлекс растяжения = взрывная сила.

НАУКА SSC:
- Быстрый SSC (<250 мс контакта): прыжки в глубину, спринт, отскоки. Минимальное сгибание коленей. Жёсткость сухожилий = ключевой фактор.
- Медленный SSC (>250 мс): прыжок с подседом (CMJ), прыжок из приседа. Бо́льшая амплитуда, больше мышечное усилие.
- Разница в силе: SSC увеличивает выход силы на 15-30% по сравнению с чисто концентрическим сокращением.

ПРОГРЕССИЯ (от простого к сложному):
Уровень 1 (новичок): обе ноги, низкая интенсивность
- Приседания с выпрыгиванием (squat jump)
- Прыжки на коробку (box jump) — высота 30-45 см
- Прыжки с подседом (CMJ)

Уровень 2 (средний): обе ноги, средняя интенсивность
- Прыжки в глубину (depth jump) с высоты 30 см
- Серийные прыжки (pogo jumps, hurdle hops)
- Прыжки на коробку с минимальным подседом

Уровень 3 (продвинутый): одна нога, высокая интенсивность
- Прыжки на одной ноге (single-leg bounds)
- Depth jump одной ногой
- Латеральные прыжки на одной ноге

Уровень 4 (элита): комбинированные, максимальная интенсивность
- Depth jump с высоты 50-75 см + мгновенный прыжок вверх
- Altitude landings
- Shock method (метод Верхошанского)

ПРОГРАММИРОВАНИЕ:
- Объём: считается в контактах (каждое приземление = 1 контакт).
  * Новичок: 40-60 контактов/тренировка.
  * Средний: 60-100 контактов.
  * Продвинутый: 100-150 контактов.
- Частота: 2-3 раза/неделю, НЕ в дни тяжёлых приседов.
- Отдых между подходами: 2-3 минуты (полное восстановление нервной системы).
- Качество > количество: если прыжки становятся медленнее — СТОП.

БЕЗОПАСНОСТЬ:
- Минимальная база: присед 1.5× своего веса ПЕРЕД началом плиометрики.
- Мягкая поверхность: резиновое покрытие или трава. НЕ бетон.
- Техника приземления: на переднюю часть стопы, колени над стопами (не вальгус), мягкое «пружинное» приземление.
- Возраст: осторожно до 14 лет (зоны роста). Только уровень 1 упражнения.
- НЕ делать плиометрику при усталости (конец тренировки) — риск травм увеличивается на 300%.

ЭФФЕКТ ПОТЕНЦИАЦИИ (PAP):
Тяжёлый подход (присед 85-90% 1ПМ × 2-3 повторения) → отдых 3-4 мин → прыжки. Тяжёлая нагрузка «возбуждает» нервную систему → прыжки на 3-5% мощнее. Используется в соревновательной подготовке.

МЕТОД ВЕРХОШАНСКОГО (УДАРНЫЙ МЕТОД):
Юрий Верхошанский — советский учёный, создатель плиометрики (1960-е). Его «ударный метод»: прыжок в глубину с высоты → мгновенный прыжок вверх. Оптимальная высота: индивидуальна (высота, при которой последующий прыжок максимален). Обычно 40-70 см. Использовался сборной СССР для подготовки олимпийцев.
`;
}
export function getGoalSettingSMARTFitness(message: string): string {
  const triggers = ['smart цели фитнес', 'постановка целей тренировк', 'goal setting fitness', 'как ставить цели спорт', 'фитнес цели план'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🎯 SMART-ЦЕЛИ В ФИТНЕСЕ — НАУКА ПОСТАНОВКИ ЦЕЛЕЙ:

SMART-ФОРМУЛА:
S — Specific (конкретная): НЕ «стать сильнее» → «присесть 150 кг».
M — Measurable (измеримая): НЕ «похудеть» → «снизить % жира с 25% до 18%».
A — Achievable (достижимая): НЕ «пожать 200 кг за месяц» → «добавить 5 кг к жиму за 8 недель».
R — Relevant (значимая): цель должна быть важна ТЕБЕ, не навязана.
T — Time-bound (с дедлайном): «к 1 сентября» → создаёт срочность.

ИЕРАРХИЯ ЦЕЛЕЙ:
1. Видение (1-5 лет): «Быть в лучшей форме жизни к 30 годам».
2. Макроцель (3-12 мес): «Присесть 2× веса тела» или «Добиться 12% жира».
3. Мезоцели (4-8 недель): «Закончить цикл 5/3/1, добавив 10 кг к приседу».
4. Микроцели (1 неделя): «Выполнить 4 тренировки, увеличить вес на 2.5 кг в жиме».
5. Ежедневные: «Сделать сегодняшнюю тренировку по плану, съесть 160 г белка».

ТИПЫ ЦЕЛЕЙ:
- Outcome goals (результат): «Победить на соревнованиях». Малоконтролируемы (зависят от других).
- Performance goals (показатели): «Пробежать 5 км за 22 мин». Контролируемы, измеримы.
- Process goals (процесс): «Тренироваться 4 раза/нед, спать 8 часов». Максимально контролируемы.
- Лучшая стратегия: 1 outcome + 2-3 performance + 5-7 process целей.

ПРИМЕРЫ SMART-ЦЕЛЕЙ:
Новичок: «За 12 недель научиться приседать с правильной техникой до параллели с весом 60 кг на 5 повторений».
Средний: «За 16 недель увеличить жим лёжа с 90 кг до 100 кг (1ПМ), тренируя жим 2 раза в неделю».
Продвинутый: «За 6 месяцев выйти на сцену в категории 82.5 кг с процентом жира 8-10%».
Похудение: «За 20 недель снизить вес с 95 кг до 85 кг, теряя 0.5 кг/неделю, с еженедельным контролем».

ПЕРЕСМОТР ЦЕЛЕЙ:
- Каждые 4-6 недель: оценка прогресса. На пути? Корректировка сроков/объёмов.
- При травме: полный пересмотр. Новая цель — восстановление.
- При достижении: НОВАЯ цель в тот же день. Безцелевой период → потеря мотивации.
- Запись: записанная цель в 1.4 раза вероятнее достигнута (Matthews, 2015).
`;
}
export function getFitnessPlateauPsychology(message: string): string {
  const triggers = ['психология плато', 'застой тренировк психолог', 'plateau psychology', 'не вижу прогресс', 'застрял результат'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
📊 ПСИХОЛОГИЯ ПЛАТО И ЗАСТОЯ В ТРЕНИРОВКАХ:

ПЛАТО — ЭТО НОРМАЛЬНО:
- Прогресс НЕ линейный. Ожидание: ↗️. Реальность: ↗️↗️→→↗️↘️→↗️↗️.
- Чем опытнее атлет, тем длиннее периоды плато между скачками.
- Новичок: прогресс каждую тренировку (недели-месяцы).
- Средний: прогресс каждые 2-4 недели.
- Продвинутый: прогресс каждые 2-3 месяца.

ПСИХОЛОГИЧЕСКИЕ ЛОВУШКИ ПЛАТО:
1. «Всё или ничего»: «Раз не расту — брошу». Опасно. Поддержание = тоже достижение.
2. Постоянное сравнение: с другими в зале, в соцсетях. Чужой прогресс — не твой провал.
3. Program hopping: менять программу каждые 2 недели «потому что не работает». Дай программе шанс (6-8 недель минимум).
4. Перфекционизм: «Если не идеально — не считается». Прогресс > перфекционизм.
5. Фиксация на цифрах: вес на штанге — не единственный прогресс.

СКРЫТЫЙ ПРОГРЕСС (когда кажется что плато):
- Улучшение техники (тот же вес, но чище).
- Увеличение рабочего объёма (больше подходов/повторений при том же весе).
- Снижение RPE (тот же вес стал легче).
- Улучшение восстановления (меньше болезненности).
- Изменение состава тела (вес тела тот же, но жир ↓ мышцы ↑).
- Психологическая устойчивость: ты по-прежнему ходишь в зал — это уже победа.

СТРАТЕГИИ ПРЕОДОЛЕНИЯ:
1. Объективный анализ: действительно плато? Проверь: программа, питание, сон, стресс. Часто причина — за пределами зала.
2. Деload: неделя с 50-60% нагрузки. После — суперкомпенсация и новый прогресс.
3. Смена стимула: новые упражнения, другой диапазон повторений, другой сплит.
4. Фокус на процессе: забудь о результате на 4-6 недель. Фокус: техника, кайф от процесса.
5. Мини-победы: маленькие цели — +1 повторение, -5 сек отдыха, +0.5 кг. Любой прогресс = дофамин.
6. Длительная перспектива: где ты будешь через год? Плато сейчас — незначительное в масштабе лет.
`;
}
export function getTrainingPartnerDynamics(message: string): string {
  const triggers = ['тренировочный партнёр', 'напарник в зале', 'training partner', 'тренироваться вдвоём', 'найти партнёра тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
👥 ТРЕНИРОВОЧНЫЙ ПАРТНЁР — НАУКА И ПРАКТИКА:

ЭФФЕКТ КЁЛЕРА (Köhler Effect):
- В паре слабый участник повышает усилие на 15-25% (мотивация «не отстать»).
- Сильный участник тоже улучшается на 5-10% (ответственность «вести за собой»).
- Условие: разница в силе не более 30-40%. Слишком большой разрыв → демотивация слабого.

ПРЕИМУЩЕСТВА ПАРТНЁРА:
1. Безопасность: страховка в жиме, приседе. Возможность работать до отказа.
2. Форсированные повторения: 1-3 дополнительных повторения с помощью → стимул для гипертрофии.
3. Внешняя ответственность: «Он ждёт в 7:00» — мощнейший мотиватор против пропусков.
4. Обратная связь по технике: свежий взгляд замечает то, что ты не чувствуешь.
5. Конкуренция: здоровое соперничество = +10-15% интенсивности.

ВЫБОР ПАРТНЁРА:
- Сопоставимый уровень (±30% по силовым показателям).
- Совместимое расписание (стабильно, без постоянных переносов).
- Похожие цели (оба на массу, оба на силу — не «один сушится, второй набирает»).
- Характер: серьёзный, пунктуальный, поддерживающий. Не «болтун», не «вечно опаздывает».

ФОРМАТ РАБОТЫ В ПАРЕ:
- По очереди: один работает, второй отдыхает и страхует. Оптимально для базовых.
- Суперсеты в паре: разные упражнения, минимальный отдых. Для гипертрофии.
- Соревновательные сеты: «кто больше повторений с Х кг» — взрывная интенсивность.

ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ:
1. Разный уровень → фрустрация. Решение: отдельные рабочие веса, общая структура.
2. Чрезмерная болтовня → длинные тренировки. Решение: таймер отдыха.
3. Нездоровое соперничество → травмы. Решение: RPE-ориентированный тренинг, не эго-лифтинг.
4. Зависимость → не можешь тренироваться один. Решение: 1-2 дня/нед соло.
`;
}
export function getPowerliftingCompGuide(message: string): string {
  const triggers = ['пауэрлифтинг соревнован', 'подготовка к пауэрлифтинг', 'powerlifting competition', 'федерация пауэрлифтинг', 'жим присед тяга соревнован'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🏋️ ПАУЭРЛИФТИНГ — СОРЕВНОВАТЕЛЬНЫЙ ГАЙД:

ТРИ СОРЕВНОВАТЕЛЬНЫХ ДВИЖЕНИЯ:
1. Присед со штангой на спине (low bar или high bar).
2. Жим лёжа (с паузой на груди по команде).
3. Становая тяга (классика или сумо).
Результат = сумма лучших попыток в каждом движении (total).

ВЕСОВЫЕ КАТЕГОРИИ (IPF/ФПР мужчины): 59, 66, 74, 83, 93, 105, 120, 120+ кг.
ВЕСОВЫЕ КАТЕГОРИИ (женщины): 47, 52, 57, 63, 69, 76, 84, 84+ кг.

РОССИЙСКИЕ ФЕДЕРАЦИИ:
- ФПР (Федерация Пауэрлифтинга России) — аффилирована с IPF. Допинг-контроль. Основная.
- WRPF (World Raw Powerlifting Federation) — без экипировки, Кирилл Сарычев основатель. Популярна.
- Другие: AWPC, WPC, НАП — разные правила, разный допинг-контроль.

ЭКИПИРОВКА:
- RAW (без экипировки): пояс, бинты на запястья, наколенники (до 7 мм). Наиболее популярный формат.
- Equipped (экипировочный): майка для жима, комбез для приседа/тяги. Добавляют 10-30% к результату.

ПОДГОТОВКА К ПЕРВЫМ СОРЕВНОВАНИЯМ:
Неделя 12-8: объёмный блок. 4-5 подходов × 5-8 повторений. Работа над техникой и мышечной массой.
Неделя 8-4: силовой блок. 3-5 подходов × 2-4 повторения. Повышение интенсивности.
Неделя 4-2: пиковый блок. 1-3 подхода × 1-2 повторения. Работа с околомаксимальными весами.
Неделя 1: разгрузка. Лёгкие тренировки, фокус на восстановление.

СТРАТЕГИЯ ПОПЫТОК:
- 1-я попытка (opener): 90-92% 1ПМ. Вес, который поднимешь «в любом состоянии». НИКОГДА не рискуй.
- 2-я попытка: 95-97% 1ПМ. Основной результат.
- 3-я попытка: 100-103% 1ПМ. Рекорд. Только если 2-я прошла уверенно.

КОМАНДЫ СУДЕЙ:
Присед: «Squat» (присесть) → «Rack» (вернуть). Жим: «Start» (опустить) → «Press» (жать) → «Rack». Тяга: «Down» (опустить после фиксации).

СГОНКА ВЕСА:
- Не рекомендуется для первых соревнований. Выступай в натуральной категории.
- Водная сгонка: 1-3 кг за 24 часа. Требует опыта.
- Восстановление после взвешивания: электролиты, углеводы, вода — 2-24 часа до выступления.
`;
}
export function getWeightliftingOlyGuide(message: string): string {
  const triggers = ['тяжёлая атлетика', 'рывок штанги техника', 'толчок штанги техника', 'olympic weightlifting', 'олимпийские подъёмы'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🏋️ ТЯЖЁЛАЯ АТЛЕТИКА (ОЛИМПИЙСКАЯ) — ГАЙД:

ДВА СОРЕВНОВАТЕЛЬНЫХ ДВИЖЕНИЯ:
1. РЫВОК (Snatch): подъём штанги с пола над головой одним непрерывным движением.
2. ТОЛЧОК (Clean & Jerk): два этапа — подъём на грудь (clean) + выталкивание над головой (jerk).

РЫВОК — ФАЗЫ:
1. Первый подъём (1st pull): от пола до уровня коленей. Медленный, контролируемый. Ноги работают.
2. Переход (transition): гриф проходит колени, торс начинает выпрямляться.
3. Второй подъём (2nd pull): взрывное разгибание ТБС + коленей + голеностопа. Максимальная мощность.
4. Подрыв и уход (turnover): подъём на носки, «подрыв» штанги вверх, мгновенный уход под штангу в полный присед.
5. Фиксация (catch): штанга зафиксирована над головой на выпрямленных руках в полном приседе.
6. Подъём: встать из приседа с штангой над головой.

ТОЛЧОК — ФАЗЫ:
Clean (подъём на грудь): аналогично рывку, но хват уже, штанга ловится на передних дельтах (front rack).
Jerk (выталкивание):
- Split jerk (в ножницы): наиболее распространён. Подсед + выталкивание + уход в ножницы.
- Push jerk: без ножниц, вертикальный подсед.
- Squat jerk: уход в полный присед. Самый сложный, стиль Лю Сяоцзюня.

ПОЧЕМУ ТА ПОЛЕЗНА ДЛЯ ВСЕХ:
- Взрывная сила: развивает Rate of Force Development (RFD) как ничто другое.
- Координация: сложнейшие многосуставные движения.
- Мобильность: требует и развивает подвижность в голеностопах, ТБС, плечах, грудном отделе.
- Атлетизм: трансфер в любой спорт.

ПОДВОДЯЩИЕ УПРАЖНЕНИЯ:
1. Рывковый баланс (snatch balance).
2. Рывок с виса (hang snatch) — убирает первый подъём.
3. Подъём на грудь с виса (hang clean).
4. Рывковая тяга / толчковая тяга.
5. Фронтальный присед — база для clean.
6. Приседания со штангой над головой (overhead squat) — база для snatch.

РОССИЙСКАЯ ТЯЖЁЛАЯ АТЛЕТИКА:
- Россия — одна из сильнейших стран в истории ТА.
- Легенды: Юрий Власов, Леонид Жаботинский, Давид Ригерт, Василий Алексеев.
- Современность: Алексей Ловчев, Татьяна Каширина.
- Федерация: ФТАР (Федерация тяжёлой атлетики России).

НАЧАТЬ С НУЛЯ:
- ОБЯЗАТЕЛЬНО с тренером. ТА — технически сложнейший вид. Самоучка = травмы.
- Первые 2-3 месяца: только техника с пустым грифом и палкой.
- Штангетки: обязательны. Подъём пятки 1.5-2.5 см = критичен для позиции.
`;
}
export function getStrongmanTrainingDeep(message: string): string {
  const triggers = ['стронгмен тренировк', 'strongman training', 'силовой экстрим', 'перенос камня', 'лог пресс'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
💪 СТРОНГМЕН (СИЛОВОЙ ЭКСТРИМ) — ГАЙД:

ЧТО ТАКОЕ СТРОНГМЕН:
Соревнования в разнообразных силовых дисциплинах с нестандартными снарядами. Не только максимальная сила, но и выносливость, скорость, хват, координация.

КЛАССИЧЕСКИЕ ДИСЦИПЛИНЫ:
1. Становая тяга (часто на максимум или на повторения с фиксированным весом).
2. Жим бревна (Log Press): цилиндрическое бревно, нейтральный хват. Техника отличается от обычного жима.
3. Камень Атласа (Atlas Stones): подъём круглых каменных шаров на подставки разной высоты.
4. Фермерская прогулка (Farmer's Walk): перенос тяжёлых гантелей на дистанцию.
5. Коромысло (Yoke Walk): рама на спине, перенос на дистанцию. Веса до 500+ кг.
6. Тяга грузовика / саней.
7. Кантование покрышки (Tire Flip).
8. Подъём гантели Circus Dumbbell.

ТРЕНИРОВОЧНЫЙ ПОДХОД:
- База (60% тренировочного объёма): присед, жим, тяга, жим стоя — классическая силовая база.
- Снарядная работа (30%): работа со специфическими снарядами. 1-2 раза/неделю.
- Кондиционирование (10%): prowler push/pull, farmer's walk на время, интервалы.

ПРИМЕР НЕДЕЛЬНОГО СПЛИТА:
Пн: Жим (жим лёжа + жим бревна + трицепс).
Ср: Присед + тяга (front squat + становая тяга + работа на спину).
Пт: Жим стоя (strict press + push press + плечи).
Сб: Event day (снарядная работа: камни, фермерская, покрышка).

РОССИЙСКИЙ СТРОНГМЕН:
- Михаил Кокляев — легенда российского стронгмена.
- Эльбрус Нигматуллин — многократный чемпион России.
- Шиманский, Савицкас (Литва, но популярен в РФ) — вдохновение.
- Серия «Русский силач» — российские соревнования.

НАЧАТЬ:
- Не нужен специальный зал. Базовая сила (присед 2×BW, тяга 2.5×BW, жим 1.5×BW) — минимум.
- DIY-снаряды: покрышка (шиномонтаж бесплатно), сэндбэг (мешок + песок), фермерские ручки.
- Соревнования любительского уровня: часто проводятся в фитнес-клубах и на open air.
`;
}
export function getCrossFitTrainingScience(message: string): string {
  const triggers = ['кроссфит наука', 'crossfit training', 'функциональный тренинг наука', 'wod тренировка', 'кроссфит за и против'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🏃 КРОССФИТ — НАУКА И ПРАКТИКА:

ЧТО ТАКОЕ КРОССФИТ:
«Постоянно варьируемые функциональные движения, выполняемые с высокой интенсивностью» (Greg Glassman).
Три модальности: тяжёлая атлетика (ТА), гимнастика, метаболическое кондиционирование (метконы).

НАУЧНЫЕ ДАННЫЕ:
Плюсы:
- Одновременное развитие силы, выносливости, мощности и гибкости (Smith et al., 2013).
- Высокий расход калорий: до 15-20 ккал/мин в WOD.
- Сообщество: высочайшая приверженность (dropout rate самый низкий среди фитнес-программ).
- Функциональность: разнообразие движений, трансфер в жизнь.

Минусы (научная критика):
- Травматизм: 19.4% в год (Weisenthal et al., 2014). Сопоставимо с тяжёлой атлетикой и гимнастикой.
- Рабдомиолиз: редко, но случается при чрезмерной интенсивности (особенно у новичков).
- Техника под усталостью: сложные движения (рывок, толчок) при высоком пульсе → деградация техники → травма.
- Интерференция: трудно стать максимально сильным И максимально выносливым одновременно.

СТРУКТУРА ТРЕНИРОВКИ:
1. Разминка (10 мин): общая + специфическая к движениям WOD.
2. Сила/навык (15-20 мин): работа над тяжёлыми движениями или гимнастическими элементами.
3. WOD (Workout of the Day, 10-25 мин): основная часть. Типы:
   - AMRAP (As Many Rounds As Possible): макс раундов за время.
   - For Time: фиксированный объём, минимальное время.
   - EMOM (Every Minute on the Minute): работа каждую минуту.
   - Tabata: 20 сек работы / 10 сек отдых × 8 раундов.
4. Заминка (5-10 мин): растяжка, foam rolling.

КЛАССИЧЕСКИЕ WOD:
- Fran: 21-15-9 трастеры (43 кг) + подтягивания. Элита: <2:30.
- Murph: 1 миля бег + 100 подтягиваний + 200 отжиманий + 300 приседаний + 1 миля бег.
- Grace: 30 толчков (60 кг) на время. Элита: <1:30.
- Cindy: AMRAP 20 мин: 5 подтягиваний + 10 отжиманий + 15 приседаний.

СОВМЕЩЕНИЕ С СИЛОВЫМИ:
- Возможно, но нужно приоритизировать. 3 дня кроссфит + 2 дня чистая сила = баланс.
- Или: силовая часть ДО WOD, а не наоборот (техника ТА на свежую голову).
`;
}
export function getCalisthenicsProgressionsAdv(message: string): string {
  const triggers = ['калистеника прогресс', 'воркаут упражнения', 'calisthenics progression', 'тренировки с своим весом', 'планш выход силой'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🤸 КАЛИСТЕНИКА — ПРОГРЕССИИ И НАУКА:

ЧТО ТАКОЕ КАЛИСТЕНИКА:
Тренировки с собственным весом, от базовых (отжимания, подтягивания) до продвинутых статических и динамических элементов (планш, front lever, muscle-up).

БАЗОВЫЕ ПАТТЕРНЫ И ПРОГРЕССИИ:

ГОРИЗОНТАЛЬНЫЙ ЖИМ (Push):
1. Отжимания с коленей → 2. Обычные отжимания → 3. Алмазные → 4. Pseudo planche push-ups → 5. Planche push-ups.

ВЕРТИКАЛЬНЫЙ ЖИМ:
1. Pike push-ups → 2. Elevated pike → 3. Wall handstand push-ups → 4. Freestanding HSPU.

ГОРИЗОНТАЛЬНАЯ ТЯГА:
1. Австралийские подтягивания (наклон 45°) → 2. Горизонтальные → 3. Front lever rows → 4. Full front lever.

ВЕРТИКАЛЬНАЯ ТЯГА:
1. Негативные подтягивания → 2. Подтягивания → 3. L-sit pull-ups → 4. Muscle-up → 5. One-arm pull-up.

ПРИСЕДАНИЯ:
1. Приседания → 2. Болгарский сплит-присед → 3. Пистолетик с поддержкой → 4. Полный пистолетик (pistol squat).

КОР:
1. Планка → 2. L-sit на полу → 3. L-sit на брусьях → 4. V-sit → 5. Manna.

СТАТИЧЕСКИЕ ЭЛЕМЕНТЫ (от простого к сложному):
1. L-sit: 15-30 сек удержания. Пресс + плечи. 2-4 месяца для освоения.
2. Back lever: вис на кольцах лицом вниз, тело горизонтально. 3-6 месяцев.
3. Front lever: вис на перекладине лицом вверх, тело горизонтально. 6-18 месяцев.
4. Planche (горизонт): упор на руках, тело горизонтально. 12-36 месяцев. Элитный навык.
5. Iron cross (крест): на кольцах, руки в стороны. Годы работы.

MUSCLE-UP — КЛЮЧЕВОЙ ЭЛЕМЕНТ:
Прогрессия: 10 чистых подтягиваний + 10 отжиманий на брусьях → explosive pull-ups (до груди) → переход → полный muscle-up.
Время освоения: 2-6 месяцев при базе 10+ подтягиваний.

ПРОГРАММИРОВАНИЕ КАЛИСТЕНИКИ:
- 3-4 тренировки/нед. Upper-Lower или Push-Pull-Legs.
- Сила элементов: 3-5 подходов × 5-8 сек (статика) или 3-5 повторений (динамика).
- Гипертрофия: 3-4 подхода × 8-15 повторений базовых движений.
- Навыки: ежедневная практика 10-15 мин (greasing the groove).

ПРЕИМУЩЕСТВА:
- Минимум оборудования (турник + брусья).
- Воркаут-площадки бесплатны в каждом районе России.
- Развитие относительной силы (сила/вес тела).
`;
}
export function getJetLagTrainingAdapt(message: string): string {
  const triggers = ['джетлаг тренировк', 'перелёт и спорт', 'смена часовых поясов', 'тренировки после перелёт', 'путешествие фитнес'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
✈️ ДЖЕТЛАГ И АДАПТАЦИЯ ТРЕНИРОВОК:

**Влияние смены часовых поясов:**
- Циркадный ритм адаптируется ~1 день на 1 час разницы
- Полёт на восток тяжелее (укорачивание дня) чем на запад
- Пик силы/координации обычно в 16-18 часов по "домашнему" времени
- Первые 48 часов — снижение производительности на 10-25%

**Стратегия до перелёта:**
- За 3-5 дней: сдвигать режим сна на 30-60 мин/день в нужную сторону
- Тяжёлая тренировка за 24-48 часов до вылета
- В день перелёта: лёгкая тренировка утром или отдых

**В первые дни после прилёта:**
- День 1: только лёгкая ходьба или мобильность
- День 2-3: тренировка 50-60% от обычного объёма
- День 4-5: 70-80% от нормы
- К 7 дню: полная нагрузка

**Ускорение адаптации:**
- Яркий свет утром (при полёте на восток)
- Яркий свет вечером (при полёте на запад)
- Мелатонин 0.5-3 мг за 30 мин до сна в новом часовом поясе
- Питание по новому расписанию с первого дня
- Кофеин только утром по новому времени

**Тренировки в поездках:**
- Bodyweight тренировки в отеле (отжимания, приседания, планка)
- Резинки/эспандеры — компактный вариант сопротивления
- Бег/ходьба — помогает адаптации к новому времени
- Не стремись к PR в поездке — поддерживай форму
`;
}
export function getSpinalHealthTrainGuide(message: string): string {
  const triggers = ['здоровье позвоночника', 'межпозвоночная грыжа тренировк', 'протрузия спорт', 'спина болит тренировк', 'сколиоз тренировк план'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦴 ЗДОРОВЬЕ ПОЗВОНОЧНИКА И ТРЕНИРОВКИ:

⚠️ При грыжах/протрузиях — обязательно МРТ и консультация невролога!

**Протрузии и грыжи — можно тренироваться!**
- Большинство грыж асимптоматичны (у 40% людей без болей есть грыжи на МРТ)
- Сильные мышцы кора — лучшая защита позвоночника
- Правильные тренировки улучшают симптомы в 70-80% случаев
- Бездействие и страх движения (кинезиофобия) ухудшают прогноз

**Безопасные упражнения для спины:**
✅ Мёртвый жук (Dead Bug) — активация глубоких мышц кора
✅ Птица-собака (Bird Dog) — стабильность и координация
✅ Мост ягодичный — укрепление задней цепи
✅ Паллоф пресс — антиротационная стабильность
✅ Ходьба фермера — нагрузка всего кора
✅ Тяга в тренажёре (сидя, с опорой на грудь)

**Что модифицировать:**
- Приседания: гоблет или фронтальные (меньше нагрузка на поясницу)
- Тяга: трэп-гриф или румынская с гантелями
- Жим: нейтральный хват, без чрезмерного прогиба
- Тяга к поясу: с опорой грудью на скамью (Seal Row)

**Чего избегать (при острой боли):**
❌ Скручивания, ситапы (высокая компрессия дисков)
❌ Становая тяга с круглой спиной
❌ Гиперэкстензия с весом в руках
❌ Жим ногами с большим весом (компрессия поясницы)
❌ Good morning с тяжёлым весом

**Система McGill Big 3 (профилактика):**
1. Curl-up (модифицированное скручивание) — 3×8 с задержкой 10 сек
2. Side Plank — 3×3 с задержкой 10 сек на сторону
3. Bird Dog — 3×5 с задержкой 10 сек на сторону
- Делать ежедневно, занимает 10-15 мин
`;
}
export function getLinearPerPlan(message: string): string {
  const triggers = ['линейная периодизация план', 'классическая периодизация', 'linear periodization программа', 'от объёма к интенсивности', 'макроцикл периодизация'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
📈 ЛИНЕЙНАЯ ПЕРИОДИЗАЦИЯ — КЛАССИЧЕСКАЯ МОДЕЛЬ:

**Концепция Матвеева:**
- Последовательная смена фаз: объём → интенсивность → пик → восстановление
- Каждая фаза развивает определённое качество
- Подходит для: новичков, среднего уровня, спортсменов с 1 пиком в сезоне

**Фазы макроцикла (12-16 недель):**

Фаза 1 — Гипертрофия (4-6 недель):
- Объём: 3-4 подхода × 10-12 повторений
- Интенсивность: 65-75% от 1ПМ
- Отдых: 60-90 сек
- Цель: увеличение мышечной массы, укрепление связок

Фаза 2 — Базовая сила (4-6 недель):
- Объём: 3-5 подходов × 5-8 повторений
- Интенсивность: 75-85% от 1ПМ
- Отдых: 2-3 мин
- Цель: развитие максимальной силы

Фаза 3 — Пиковая сила (2-4 недели):
- Объём: 3-5 подходов × 1-3 повторения
- Интенсивность: 85-95% от 1ПМ
- Отдых: 3-5 мин
- Цель: реализация силового потенциала

Фаза 4 — Deload (1-2 недели):
- 50% объёма, 60-70% интенсивности
- Активное восстановление

**Плюсы:**
+ Простая, понятная прогрессия
+ Хорошо подходит для новичков и среднего уровня
+ Минимизирует риск перетренированности

**Минусы:**
- К фазе 3 теряется часть гипертрофии фазы 1
- Только один пик за цикл
- Не оптимально для продвинутых (нужна более частая смена стимулов)
`;
}
export function getDUPProgramming(message: string): string {
  const triggers = ['dup программирование', 'ежедневная волнообразная', 'daily undulating periodization', 'дуп тренировк', 'волнообразная периодизация план'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🌊 DUP — ЕЖЕДНЕВНАЯ ВОЛНООБРАЗНАЯ ПЕРИОДИЗАЦИЯ:

**Концепция:**
- Смена тренировочных стимулов КАЖДУЮ тренировку
- 3 типа дней: сила, гипертрофия, мощность/выносливость
- Все качества развиваются параллельно (не последовательно)
- Исследования: DUP ≥ линейная для продвинутых атлетов

**Пример недельного плана (3 дня):**

Понедельник — Сила:
- Приседания: 5×3 @ 85-90%
- Жим лёжа: 5×3 @ 85-90%
- Тяга: 4×3 @ 85-90%
- Отдых: 3-5 мин

Среда — Гипертрофия:
- Приседания: 4×10 @ 70%
- Жим лёжа: 4×10 @ 70%
- Румынская тяга: 4×10 @ 70%
- Отдых: 60-90 сек

Пятница — Мощность/Скорость:
- Приседания: 6×2 @ 75% (взрывной подъём)
- Жим лёжа: 6×3 @ 70% (скоростной)
- Тяга: 5×2 @ 75% (динамическое усилие)
- Отдых: 2-3 мин

**Прогрессия в DUP:**
- Еженедельное повышение весов на 1-2.5%
- Или: повторения ↑ при том же весе
- Micro-loading: прибавки по 0.5-1 кг
- Deload каждые 4-6 недель

**Для кого:**
✅ Средний и продвинутый уровень
✅ Тренировки 3-5 раз/неделю
✅ Стагнация на линейной прогрессии
❌ Новички (недостаточно базы)
❌ Менее 3 тренировок/неделю

**Преимущества:**
- Меньше монотонности
- Развитие нескольких качеств одновременно
- Более частый тренировочный стимул для каждого качества
- Гибкость: можно менять акценты дней
`;
}
export function getRPEAutoregGuide(message: string): string {
  const triggers = ['rpe авторегуляция', 'rpe шкала тренировк', 'авторегуляция нагрузки', 'rpe таблица', 'тренировки по ощущениям шкала'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
📊 RPE-АВТОРЕГУЛЯЦИЯ ТРЕНИРОВОК:

**Шкала RPE (Повторения в запасе):**
- RPE 10: отказ, 0 повторений в запасе
- RPE 9.5: возможно ещё 1, не уверен
- RPE 9: 1 повторение в запасе
- RPE 8.5: 1-2 повторения в запасе
- RPE 8: 2 повторения в запасе
- RPE 7: 3 повторения в запасе
- RPE 6: 4+ повторений в запасе (разминка/лёгкая работа)

**Как использовать в программе:**
Пример дня приседаний:
1. Разминка: пустой гриф × 10, 50% × 5, 70% × 3
2. Рабочие: вес на RPE 8 × 4 повторения × 4 подхода
3. Подсобка: RPE 7-8

**Прогрессия по RPE:**
- Неделя 1: 4×4 @ RPE 7 (лёгкая)
- Неделя 2: 4×4 @ RPE 8
- Неделя 3: 4×4 @ RPE 8.5
- Неделя 4: 4×4 @ RPE 9
- Неделя 5: Deload — 3×4 @ RPE 6

**Преимущества авторегуляции:**
- Адаптация к текущему состоянию (сон, стресс, питание)
- Плохой день → автоматически меньше вес
- Хороший день → автоматически больше вес
- Снижает риск перетренированности и травм

**Как научиться оценивать RPE:**
- Первые 2-3 недели: записывай RPE после КАЖДОГО подхода
- Сравнивай прогнозируемый RPE с фактическим
- Используй видео для калибровки (скорость штанги)
- Точность приходит с опытом (4-8 недель практики)

**Ошибки:**
- Новички завышают RPE (думают что RPE 10, а реально RPE 7)
- Не все упражнения одинаково "читаемы" (изоляция сложнее)
- RPE 10 на тренировке — почти никогда не нужен (только на соревнованиях)
- При болезни/недосыпе RPE неточен — лучше снизить нагрузку превентивно
`;
}
export function getClusterSetScience(message: string): string {
  const triggers = ['кластерные подходы наука', 'cluster sets программа', 'кластер сеты тренировк', 'внутриподходный отдых', 'rest cluster метод'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⏱️ КЛАСТЕРНЫЕ ПОДХОДЫ — НАУКА И ПРАКТИКА:

**Что такое кластерные подходы:**
- Обычный подход разбивается на мини-серии с коротким отдыхом (15-30 сек)
- Пример: вместо 1×6 → 3×2 с 20 сек отдыха внутри подхода
- Частичное восстановление фосфокреатина между мини-сериями
- Результат: больше мощности и качества каждого повторения

**Протоколы:**

Кластер для силы (тяжёлые веса):
- 85-90% от 1ПМ
- 5-6 синглов с 15-20 сек отдыха между ними = 1 кластер
- 3-4 кластера, отдых 3-4 мин между кластерами
- Эффект: больше объёма на высокой интенсивности

Кластер для мощности (взрывная сила):
- 70-80% от 1ПМ
- 3 дабла (по 2 повторения) с 20 сек отдыха = 1 кластер
- 4-5 кластеров
- Каждое повторение — максимально взрывное

Кластер для гипертрофии:
- 70-75% от 1ПМ
- 4×3 повторения с 15 сек отдыха = 12 повторений за кластер
- Больше механического напряжения на повторение чем обычный 1×12

**Преимущества vs обычные подходы:**
- Более высокая средняя скорость штанги
- Меньше деградации техники к концу подхода
- Больше общий объём при высокой интенсивности
- Меньше метаболического стресса (не всегда плюс для гипертрофии)

**Когда применять:**
✅ Развитие максимальной силы и мощности
✅ Тяжёлые базовые упражнения
✅ Когда качество повторений важнее "прокачки"
❌ Изолирующие упражнения
❌ Чисто гипертрофийные цели (обычные подходы эффективнее)
`;
}
export function getDropSetMethods(message: string): string {
  const triggers = ['дроп сеты методы', 'дропсеты наука', 'drop sets варианты', 'снижение веса подход', 'дроп сеты для роста мышц'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
📉 ДРОП-СЕТЫ — МЕТОДЫ И НАУКА:

**Механизм:**
- Подход до отказа → снижение веса на 20-30% → продолжение без отдыха
- Рекрутирует все типы мышечных волокон
- Увеличивает метаболический стресс (один из драйверов гипертрофии)
- Экономит время при высоком объёме

**Варианты дроп-сетов:**

Классический (1 дроп):
- 10 повторений @ 80% → снизить вес на 25% → до отказа
- Самый простой и эффективный вариант

Тройной дроп:
- 8 @ 80% → 10 @ 60% → 15+ @ 40%
- Высокий метаболический стресс, сильный пампинг

Дроп 6-20:
- 6 повторений с тяжёлым весом → снижение на 50% → 20 повторений
- Механическое напряжение + метаболический стресс

Обратный дроп:
- Начать с лёгкого веса (15-20 повторений) → увеличить → 6-8 повторений
- Предварительное утомление, менее распространён

**Что говорит наука:**
- Исследование 2018 (Fink et al.): 1 дроп-сет = 3 обычных подхода по гипертрофии
- Экономия времени: ~60% при сопоставимом росте мышц
- Сила: обычные подходы лучше (дроп-сеты не оптимальны для силы)
- Оптимально: 1-2 упражнения с дроп-сетами за тренировку

**Лучшие упражнения для дроп-сетов:**
✅ Тренажёры (быстро менять вес): блочные тяги, жим ногами
✅ Гантели (ряд весов): сгибания, разводки
✅ Разгибание/сгибание ног, кроссовер
❌ Приседания со штангой (небезопасно)
❌ Становая тяга (утомление = плохая техника)

**Рекомендации:**
- 1-2 дроп-сета на группу мышц (не больше)
- Использовать в последнем упражнении на группу
- Не каждую тренировку (высокий стресс, медленнее восстановление)
- 1 дроп (снижение) достаточно для большинства целей
`;
}
export function getGVTProgram(message: string): string {
  const triggers = ['gvt программа', 'german volume training', 'немецкий объёмный', '10x10 тренировк', 'десять по десять программа'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🇩🇪 GERMAN VOLUME TRAINING (10×10):

**Концепция:**
- 10 подходов × 10 повторений одного базового упражнения
- Интенсивность: 60% от 1ПМ (или вес на ~20 повторений)
- Отдых: 60-90 сек между подходами
- Происхождение: немецкая школа тяжёлой атлетики 1970-х

**Классическая программа GVT:**

День A — Грудь/Спина:
- A1: Жим лёжа 10×10 @ 60%
- A2: Тяга в наклоне 10×10 @ 60%
(суперсет, 90 сек отдыха)
- B1: Разводка гантелей 3×12
- B2: Тяга верхнего блока 3×12

День B — Ноги/Пресс:
- A1: Приседания 10×10 @ 60%
- A2: Сгибание ног 10×10
(суперсет, 90 сек отдыха)
- B1: Подъём на носки 3×15
- B2: Скручивания 3×15

**Расписание:**
- День A → отдых → День B → отдых → День A → ...
- 4-5 тренировок в неделю
- Программа на 4-6 недель (не дольше!)

**Прогрессия:**
- Начинаешь с 60% от 1ПМ
- Цель: все 10×10 с полным отдыхом 90 сек
- Когда все 100 повторений выполнены → +2.5-5% веса
- Первые подходы кажутся лёгкими — это НОРМАЛЬНО, подходы 7-10 убьют

**Кому подходит:**
✅ Средний уровень (1-3 года стажа)
✅ Набор массы (нужен калорийный профицит!)
✅ Минималисты (1 упражнение на группу)
❌ Новички (слишком высокий объём)
❌ На сушке/дефиците (объём слишком высок для восстановления)
❌ Не дольше 6 недель (ЦНС-утомление)

**Модификация 6×6 (Modified GVT):**
- Исследование Amirthalingam (2017): 6×10 ≥ 10×10 для гипертрофии
- Меньше утомления, проще восстанавливаться
- Рекомендация: начать с 6×10, перейти к 10×10 если справляешься
`;
}
export function getFPRSPowerliftingGuide(message: string): string {
  const triggers = ['фпрс', 'ipf пауэрлифтинг', 'пауэрлифтинг федерация россия', 'сырой пауэрлифтинг россия', 'ipf правила', 'пауэрлифтинг соревнования россия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏋️ ФПРС / IPF — ПАУЭРЛИФТИНГ В РОССИИ:

**Правила IPF (ФПРС):**

Приседание:
- Глубина: параллель (верхняя часть бедра параллельна полу)
- Команды: «Присесть», «Встать», «Стойка»
- Запрет: подъём с помощью рук, касание скамьи

Жим лёжа:
- Остановка на груди по команде судьи
- Ширина хвата: 81 см между указательными пальцами (IPF правило)
- Запрет: отбив от груди, подъём таза

Становая тяга:
- Без паузы при подъёме (слитное движение)
- Сумо или классика — на выбор атлета
- Команда «Опустить» — только после фиксации наверху

**Снаряжение (сырая дивизия / классика):**
- Майка: без рукавов или с рукавами (не трико)
- Ремень: макс 13 см ширина
- Бинты на колени: разрешены (до 2 м)
- Наколенники (рукава): разрешены для сырой дивизии

**Оценка подхода (3 судьи):**
- Белый флаг = успешно, красный = неудача
- 2 из 3 белых = подход засчитан

**Подготовка к первому старту:**
- Минимум 6 месяцев тренировок до соревнований
- Отработай команды судей заблаговременно
- Тренировочный максимум ≠ соревновательный (добавляй 10-15% на адреналин)
- Взвешивание за 24ч или 2ч до соревнований
- Стратегия открывашки: 90-92% от планируемого максимума

**Весовые категории мужчины (IPF 2024):**
59, 66, 74, 83, 93, 105, 120, +120 кг
`;
}
export function getRussianStrengthSports(message: string): string {
  const triggers = ['российский силовой спорт', 'россия силовые виды', 'армрестлинг россия', 'гиревой спорт россия', 'силовое многоборье россия', 'силачи россия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 СИЛОВЫЕ ВИДЫ СПОРТА В РОССИИ:

**Гиревой спорт (Россия — мировой лидер):**
- ФГСР (Федерация гиревого спорта России)
- Дисциплины: толчок двух гирь, рывок, длинный цикл
- Разряды: 3й → 2й → 1й → КМС → МС → МСМК
- Пример норматив рывок 32кг МС: 100+ повторений за 10 минут
- Известные атлеты: Иван Денисов, Сергей Мерkulов

Преимущества гиревого спорта:
- Уникальное развитие выносливости + силы
- Минимальное оборудование (1-2 гири)
- Соревнования от городских до мировых

**Армрестлинг:**
- ФАР (Федерация армрестлинга России)
- Аффилиация: WAF, EAF
- Категории по весу и руке (правая/левая)
- Топ-борцы: Дмитрий Трухин, Денис Кипрушкин
- Россия — традиционно сильная школа пальцевого хвата

Специфика тренировок:
- Пронаторы и супинаторы предплечья
- Боковой хват (Top Roll), крюк (Hook)
- Специфические упражнения: arm curl through table, pronation curls

**Силовое многоборье / Strongman:**
- ФСС (Федерация силового спорта)
- Снаряды: лог-жим, атлас-камни, тир (тяга грузовика), ходьба с фермой
- Российская школа: традиционно сильна в грузоподъёмных дисциплинах

**Перетягивание каната:**
- ФПМС России
- Командный вид, выступают от школьников до взрослых

**Силовой экстрим (ТВ-шоу):**
- «Богатырские игры» — российский телеформат
- «Сила Урала», региональные турниры силачей

**Как начать:**
- Любой из этих видов: найди региональный клуб/секцию
- Гиревой спорт: самый доступный — гири продаются в любом спортмагазине
- Армрестлинг: тренировки часто бесплатные в фитнес-клубах
`;
}
export function getTrainingSeasonalRussia(message: string): string {
  const triggers = ['сезонные тренировки россия', 'зимние тренировки', 'летние тренировки', 'тренировки зима лето россия', 'климат тренировки', 'новый год тренировки'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🌦️ СЕЗОННОСТЬ ТРЕНИРОВОК В РОССИЙСКИХ РЕАЛИЯХ:

**Зима (ноябрь–март):**

Вызовы:
- Нехватка витамина D (солнце < 4ч/день севернее 55° широты)
- Иммунный стресс — риск простуд в сезон ОРВИ
- Психологическая усталость (сезонная депрессия у 10-15%)
- Тяжёлая одежда → ограничение движений на улице

Адаптации:
- Витамин D3: 2000-4000 МЕ/день обязательно с октября по апрель
- Сместить фокус: зима = МАССА (силовой мезоцикл в профиците калорий)
- Зимние виды спорта как активное восстановление: лыжи, коньки → кардиобаза
- Тренировки с 10:00 до 14:00 — максимум дневного света

**Лето (май–август):**

Вызовы:
- Жара (Москва до +35°C, Краснодар до +40°C) → перегрев
- Обезвоживание — потоотделение вырастает в 2-3 раза
- Смещение режима дня (белые ночи на Северо-Западе)

Адаптации:
- Тренировки рано утром (6:00-9:00) или вечером (19:00+)
- Увеличить воду: +500-750мл/час тренировки в жару
- Добавить электролиты (натрий, калий) — потери с потом
- Лето = СУШКА (дефицит калорий + сохранение силы)

**Осенне-весенние переходные периоды:**
- Сентябрь: «Сентябрьский прилив» — мотивация высокая после лета, хороший старт цикла
- Март–апрель: весенняя усталость от зимы → снизь интенсивность, добавь B12

**Российские праздники и режим:**
- Новый год (31дек-9янв): не теряй форму! 1-2 тренировки/неделю спасут откат
- 23 февраля / 8 марта: «праздничные» пики в залах — знай, что перед ними будет аншлаг
- Майские (1-10 мая): часть залов с сокращённым расписанием — уточни заранее

**Годовой план для россиян:**
- Октябрь–февраль: силовой мезоцикл (масса, профицит 200-300 ккал)
- Март–апрель: переходный период, техника, поддержание
- Май–август: сушка/поддержание (дефицит 300-500 ккал)
- Сентябрь: пик формы или начало нового силового цикла
`;
}
export function getVisualizationTechniques(message: string): string {
  const triggers = ['визуализация спорт', 'ментальные образы', 'imagery тренировка', 'воображение тренировка', 'визуализация упражнений', 'идеомоторная тренировка'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🎯 ВИЗУАЛИЗАЦИЯ И МЕНТАЛЬНЫЕ ОБРАЗЫ В СПОРТЕ:

**Научная база:**
- Двигательные программы активируются при визуализации (исследования ЭМГ)
- Регулярная визуализация улучшает технику на 35% без физических повторений
- Идеомоторная тренировка: представление → нервно-мышечные паттерны
- Спортсмены элиты: 80%+ используют визуализацию

**PETTLEP-модель (современный стандарт):**
P — Physical: физические ощущения (гриф в руках, напряжение мышц)
E — Environment: реальная обстановка (воображай тот зал, тот помост)
T — Task: конкретное задание (подход с 150кг, не «хорошая тренировка»)
T — Timing: реальный темп (не ускоренный)
L — Learning: корректировать образ по мере роста навыка
E — Emotion: включать эмоции (уверенность, азарт)
P — Perspective: от первого лица (не смотреть на себя со стороны)

**Практика — как проводить сессию:**

Базовая (10-15 минут):
1. Сядь, закрой глаза, 5 дыхательных циклов
2. Создай образ окружения: зал, запах, звуки
3. Прочувствуй тело: одежда, гриф, подошвы
4. Выполни упражнение в РЕАЛЬНОМ темпе
5. Включи успешный результат + эмоцию
6. Повтори 3-5 раз

Для исправления ошибок:
- Сначала визуализируй ошибку медленно
- Потом «перезапиши» правильным движением
- Повтори правильный вариант 10 раз в воображении

**Когда применять:**
- Перед тренировкой: прайминг (настрой)
- После тренировки: закрепление паттернов
- В дни отдыха: поддержание нервно-мышечных связей
- Перед соревнованиями: репетиция без риска

**Упражнение «Лучшее выступление»:**
- Вспомни свой лучший подход/тренировку в деталях
- Проживи её заново: что чувствовал, как двигался
- Закрепи «якорь» (сжатие кулака, слово)
- Используй якорь перед сложными подходами
`;
}
export function getFlowStateTraining(message: string): string {
  const triggers = ['состояние потока', 'flow state спорт', 'зона спортсмен', 'поток чиксентмихайи', 'быть в зоне', 'состояние зоны тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🌊 СОСТОЯНИЕ ПОТОКА (FLOW STATE) В СПОРТЕ:

**Концепция (Михай Чиксентмихайи):**
Flow — состояние полного поглощения деятельностью
- Ощущение «я и задача — одно целое»
- Время ускоряется или замедляется
- Автоматизм без сознательного контроля
- Высочайшая производительность без усилий

**9 характеристик Flow:**
1. Баланс вызов-навык (задача чуть выше умений)
2. Слияние действия и осознания
3. Чёткие цели
4. Немедленная обратная связь
5. Полная концентрация на задаче
6. Чувство контроля
7. Потеря самосознания
8. Изменение восприятия времени
9. Автотелическое переживание (само по себе ценно)

**Условия для Flow на тренировке:**

Правильный уровень вызова:
- Слишком легко → скука
- Слишком тяжело → тревога
- Оптимум: ~110% от зоны комфорта
- Пример: работа с весом 85-90% от максимума (не 60%, не 100%)

Устранение помех:
- Телефон в режиме «не беспокоить»
- Знакомая музыка (не новая — отвлекает)
- Тренировочный план написан заранее
- Минимум разговоров в рабочий период

Предстартовые рутины:
- Повторяющийся ритуал входа в тренировку (5-10 мин)
- Всегда одинаковая разминка
- «Переключатель» состояния: слово, жест, музыка

**Практические методы вызова Flow:**

Техника «тоннельного фокуса»:
- 10 глубоких дыхательных циклов перед работой
- Фраза: «Следующие Х минут — только это»
- Взгляд только на штангу/снаряд, не на зеркало

Метод «процессного якоря»:
- Выбери 1 техническую реперную точку (пример: «грудь вперёд»)
- Концентрируйся только на ней — это создаёт тоннель

**Важно:**
Flow нельзя «заставить» — только создать условия
Опыт потока накапливается: чем чаще практикуешь условия, тем чаще входишь
`;
}
export function getGoalSettingMastery(message: string): string {
  const triggers = ['постановка целей спорт', 'smart цели фитнес', 'долгосрочные цели тренировк', 'цели спортсмена', 'целеполагание тренировки', 'как поставить цель тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🎯 ПОСТАНОВКА ЦЕЛЕЙ В СПОРТЕ — МАСТЕР-УРОВЕНЬ:

**Иерархия целей (3 уровня):**

1. Долгосрочные цели (6-12+ месяцев):
- Мечта/вдохновение: «Присед 200кг», «Пробежать марафон»
- Не обязана быть реалистичной — даёт направление

2. Среднесрочные цели (1-3 месяца):
- SMART: конкретные, измеримые, достижимые, релевантные, временные
- Пример: «К 1 июня 5×5 приседания со 130кг»

3. Краткосрочные / процессные (тренировка):
- Что именно делаю сегодня: «3×5 @ 120кг, фокус на глубину»
- Под полным контролем — нет зависимости от внешних факторов

**SMART vs SMARTER:**
S — Specific (конкретная)
M — Measurable (измеримая)
A — Achievable (достижимая)
R — Relevant (значимая)
T — Time-bound (срок)
E — Evaluate (план оценки прогресса)
R — Reward (вознаграждение при достижении)

**Типы целей:**

Результатные цели (outcome):
- «Стать чемпионом», «Выиграть»
- Мотивируют, но НЕ под контролем
- Не делай их основными

Перформативные цели (performance):
- «Показать 300кг сумму на соревнованиях»
- Под бо́льшим личным контролем
- Хороший основной ориентир

Процессные цели (process):
- «На каждой тренировке контролировать дыхание»
- Полностью под контролем
- ЛУЧШИЕ для ежедневного фокуса и роста

**Практика:**

Ежеквартальное ревью:
- Каждые 3 месяца: что достигнуто, что нет, почему
- Корректируй цели — они должны жить, не пылиться

Визуализация + запись:
- Написанная цель > не написанная (х2 вероятность достижения, исследования)
- Повешенная на виду > в ящике (ежедневное подкрепление)

Микро-победы (momentum):
- Разбивай большие цели на понедельные задачи
- Каждый «зелёный» день добавляет инерцию
- Стрик 21+ день создаёт привычку
`;
}
export function getParasympatheticTraining(message: string): string {
  const triggers = ['парасимпатика восстановление', 'вагус тонус', 'нервная система восстановление', 'симпатика парасимпатика баланс', 'вагальный тонус', 'автономная нервная система спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚖️ АВТОНОМНАЯ НЕРВНАЯ СИСТЕМА И ВОССТАНОВЛЕНИЕ:

**Симпатика vs Парасимпатика:**

Симпатическая НС (СНС) — «fight or flight»:
- Активируется: стресс, тренировка, опасность
- Эффекты: ↑ ЧСС, ↑ АД, ↑ кровоток к мышцам, ↑ кортизол, ↑ адреналин
- Анаболизм → через катаболизм (надо успеть восстановиться)

Парасимпатическая НС (ПНС) — «rest and digest»:
- Активируется: покой, сон, безопасность
- Эффекты: ↓ ЧСС, пищеварение, синтез, восстановление
- Главный медиатор восстановления

Баланс у атлета:
- Тренировка = стимул СНС
- Между тренировками нужно ДОМИНИРОВАНИЕ ПНС
- Хронический стресс = постоянная активность СНС → выгорание, перетренированность

**Как измерить тонус ПНС:**

HRV (вариабельность ритма):
- Высокий HRV = сильный вагальный тонус = хорошая ПНС
- Измерение: ежедневно утром (5 мин лёжа)
- Устройства: Polar H10, Garmin, Apple Watch (менее точный)

ЧСС покоя:
- Утром (лёжа): норма 45-65 уд/мин для тренированных
- Повышение на 5+ = сигнал перегрузки
- Снижение до уровня ниже нормы = улучшение

**Методы активации ПНС:**

Глубокое медленное дыхание:
- 5-6 дыхательных циклов/мин (6 сек вдох, 4 сек выдох)
- Резонансное дыхание → синхронизация с сердечным ритмом
- 5-10 мин → ЧСС снижается, HRV растёт

Пение/гудение/жужжание:
- Стимулирует вагусный нерв через мышцы гортани
- Серьёзная и доказанная техника (вибрация Ом-мантры, гудение)
- Практика: 2-3 мин гудения = measurable ↑ HRV

Холодная вода на лицо:
- Активирует нырятельный рефлекс → мощное вагусное воздействие
- Немедленный эффект: ↓ ЧСС на 10-20%

Смех:
- Снижает кортизол, повышает HRV
- Не шутка — реальная рекомендация

Природа и социальные связи:
- Безопасные социальные контакты → поливагальная теория Порджеса
- Объятия, поддерживающие беседы → ↑ окситоцин → ↑ ПНС

**Практический протокол «ПНС-вечер»:**
19:00 — последняя тренировка (не позже)
20:00 — тёплый душ + ужин без алкоголя
21:00 — 10 мин медленного дыхания
21:30 — тёмный свет, без экранов, чтение
22:00-23:00 — сон
`;
}
export function getPlyometricsProgramming(message: string): string {
  const kw = ['программирование плиометрики', 'плиометрика план', 'прыжки программа', 'взрывная сила программа', 'плиометрика новичок'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Программирование плиометрических тренировок:**

**Периодизация плиометрики:**

**Фаза 1 — Основа (4 нед):**
Цель: жёсткость суставов, базовый контроль
Упражнения: прыжки на месте, боковые шаги, прыжки через линию
Объём: 60-80 контактов/сессию × 2 раза/нед
Интенсивность: низкая (высота <30 см)

**Фаза 2 — Накопление (4-6 нед):**
Цель: мощность и SSC-эффективность
Упражнения: выпрыгивания из приседа, прыжки в длину, box jumps
Объём: 100-140 контактов/сессию × 2-3 раза/нед
Интенсивность: средняя (40-60 см)

**Фаза 3 — Интенсификация (3-4 нед):**
Цель: максимальная реактивность
Упражнения: depth jumps, тройной прыжок, спринты с ускорением
Объём: 80-100 контактов/сессию × 2 раза/нед
Интенсивность: высокая (60-75 см+)

**Фаза 4 — Реализация/Разгрузка (1-2 нед):**
Объём ↓ 50%, интенсивность та же — суперкомпенсация

**Сочетание с силовыми:**
Комплексные тренировки: силовое упражнение → плиометрика через 5-10 мин
Пример: приседания 80% × 3 → выпрыгивания × 5 (PAP-эффект)
PAP (post-activation potentiation): нервная система активирована → прыжок мощнее

**Восстановление и объём:**
Новичок: 50-60 контактов, 1-2 раза/нед
Промежуточный: 80-120 контактов, 2-3 раза/нед
Продвинутый: 120-200 контактов, 3 раза/нед
`;
}
export function getSpeedStrengthDevelopment(message: string): string {
  const kw = ['скоростно-силовые', 'взрывная сила', 'мощность атлета', 'rate of force development', 'rfd скорость', 'быстрая сила'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Развитие скоростно-силовых качеств:**

**Пирамида мощности:**
Мощность = Сила × Скорость
Максимальная мощность достигается при ~30% от 1ПМ (скорость) или 30% от Vmax (сила).

**Rate of Force Development (RFD):**
Скорость нарастания силы — ключевой параметр взрывности.
Важнее абсолютной силы в большинстве видов спорта (удары, прыжки, рывки).

**Методы развития RFD:**

**1. Баллистические упражнения:**
Жим лёжа бросок (Swiss bar), бросок медбола, рывок гири
Нагрузка: 30-50% 1ПМ, максимальное намерение ускорения
Сеты: 3-5 × 3-5 повторений, полное восстановление 3-5 мин

**2. Силовые упражнения с «намерением скорости»:**
Любой силовой лифт — думать «максимально быстро» в концентрику
Нагрузка: 70-85% 1ПМ — «силовая зона скорости»
Это активирует быстрые волокна даже при субмаксимальном весе

**3. Рывок и толчок (Olympic lifts):**
Золотой стандарт для мощности — вовлекают всё тело
Пиковая мощность: рывок > 5000 Вт у атлетов

**4. Изометрические взрывные попытки:**
IMTP (isometric mid-thigh pull): 3-5 сек максимального усилия
Прирост RFD без усталости — хорошо в конце цикла

**Периодизация мощности:**
Сила (8-12 нед) → Мощность (4-6 нед) → Пик (2-3 нед)
Нельзя развивать мощность без базы силы.
`;
}
export function getTrainingBlockDesign(message: string): string {
  const kw = ['блочная периодизация', 'block periodization', 'специализированный блок', 'тренировочный блок дизайн', 'целевой блок'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Дизайн тренировочных блоков (Block Periodization):**

**Принципы блочной периодизации (Исуринн):**
Концентрация нагрузки на 1-3 способностях в каждом блоке.
Предотвращение «тренировки всего сразу» — лучший стимул для каждой способности.

**Три типа блоков:**

**Аккумуляция (Accumulation Block):**
Длина: 3-6 нед
Цель: базовая мощность, объём, аэробная база
Средства: большой объём, умеренная интенсивность
Упражнения: разнообразные, многосуставные

**Трансмутация (Transmutation Block):**
Длина: 3-4 нед
Цель: конверсия базовых качеств в специфические
Средства: умеренный объём, высокая интенсивность
Упражнения: специфичные для цели (соревновательные движения)

**Реализация (Realization Block):**
Длина: 1-2 нед
Цель: максимизация результата, снижение усталости
Средства: малый объём, очень высокая интенсивность
Тест ПР или соревнование в конце

**Последовательность блоков:**
Аккум → Трансм → Реализ → [разгрузка/переход] → новый цикл
Каждый следующий цикл начинается с более высокой базы

**Для типичного атлета (гипертрофия → сила):**
Блок 1 (6 нед): гипертрофия (8-15 повт, высокий объём)
Блок 2 (4 нед): сила (3-6 повт, умеренный объём)
Блок 3 (2 нед): пик/тест (1-3 повт, низкий объём)
`;
}
export function getStrengthHypertrophyBalance(message: string): string {
  const kw = ['сила и масса одновременно', 'сила vs гипертрофия', 'как совместить силу и мышцы', 'одновременно сила и размер', 'пауэрбилдинг'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Совмещение силы и гипертрофии (Powerbuilding):**

**Почему это сложно:**
Оптимальные зоны повторений разные:
- Гипертрофия: 6-20 повторений, ~60-80% 1ПМ
- Сила: 1-5 повторений, 80-95% 1ПМ
- Но обе адаптации имеют перекрытие: 4-8 повторений работают для обеих

**Подходы к совмещению:**

**1. Одновременная тренировка (гибридная):**
Блок A (основное): тяжёлое компаундное 3-5 × 3-5 (сила)
Блок B (аксессуар): 3-4 × 8-12 (гипертрофия)
Пример: Жим × 4 × 4 + Жим гантелей × 4 × 10

**2. Чередование приоритетов (по блокам):**
8 нед гипертрофия → 6 нед сила → 2 нед пик
Одна система приоритетна, другая поддерживается

**3. Daily Undulating Periodization (DUP):**
Пн: сила (3-5 повт), Ср: гипертрофия (8-12), Пт: мощность (2-4 взрывных)
Для одного движения три стимула в неделю

**Лучший подход для большинства:**
Powerbuilding: 60-70% объёма в силовой зоне (4-6 повт), 30-40% — гипертрофия (8-12)
Компаундные: сила. Изолированные: гипертрофия.

**Роль каждой адаптации:**
Гипертрофия → больший мышечный «двигатель»
Сила → лучшая нейронная активация этого «двигателя»
Долгосрочно: нужны обе
`;
}
export function getAccessoryProgramming(message: string): string {
  const kw = ['вспомогательные упражнения', 'аксессуарная работа', 'добавочные упражнения', 'accessory work', 'ассистирующие упражнения'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Программирование вспомогательных упражнений:**

**Роль аксессуаров:**
- Укрепить слабые звенья основных движений
- Сбалансировать мышечное развитие (передняя/задняя цепь)
- Добавить объём без нагрузки на ЦНС
- Превентивная работа против травм

**Принципы подбора аксессуаров:**

**1. По слабым звеньям:**
Присед проваливается в дне? → Укрепить квадрицепс/бёдра (Bulgarian split squat, leg press)
Становая тянет из ног? → Укрепить поясницу/ягодицы (RDL, гиперэкстензии)
Жим не идёт вверху? → Трицепс, передние дельты (close grip bench, dips)

**2. Баланс агонист/антагонист:**
После каждого толкающего — тяговое
Жим → тяга в горизонтальной плоскости (соотношение 1:1 или 1:2)
Приседание/квадрицепс → бицепс бедра (соотношение 1:1 минимум)

**3. Объём и интенсивность:**
Аксессуары: 3-4 × 8-15 повторений
Вес: умеренный, НЕ до отказа — цель объём, не стресс
Количество: 2-4 аксессуарных упражнения после основных

**Примеры аксессуарных блоков:**

**После приседания:**
Жим ногами (4×12) → Румынская тяга (3×10) → Подъём на носки (4×15)

**После жима:**
Жим гантелей (3×12) → Тяга к груди (4×10) → Разводка (3×15)

**После становой:**
Подтягивания (4×8) → Гиперэкстензия (3×12) → Тяга нижнего блока (3×10)
`;
}
export function getPrePerformanceRoutine(message: string): string {
  const kw = ['предстартовая рутина', 'разминочный ритуал', 'рутина перед подходом', 'pre-performance routine', 'предсоревновательная подготовка ритуал'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Pre-Performance Routine (Предстартовая рутина):**

**Зачем нужна рутина:**
Активирует автоматическое выполнение навыка, блокирует самоконтроль
Создаёт предсказуемость → снижает тревожность
Психологический «переключатель» в рабочий режим

**Компоненты эффективной рутины:**

**1. Физический ритуал (3-10 сек):**
Специфические движения, жесты, позиции
Хлопок по бёдрам, тряска рук, особый способ взяться за гриф
Должен быть легко воспроизводимым в любых условиях

**2. Дыхательный компонент (5-15 сек):**
1-3 управляемых вдоха-выдоха
Может включать задержку перед взрывным усилием

**3. Когнитивный компонент (2-5 сек):**
Ключевое слово или образ
Краткое напоминание о технике ИЛИ о цели
НЕ длинные инструкции — 1-2 слова

**4. Переход к действию:**
Немедленно после рутины — нет паузы для «додумывания»
Выполнение на автопилоте

**Как разработать свою рутину:**
1. Изучи, что делают при лучших тренировках (спонтанная рутина)
2. Стандартизируй эти действия в последовательность
3. Практикуй одинаково на каждой тренировке
4. Тест: воспроизведи рутину в стрессе → результат должен быть стабильным

**Длина рутины:**
Слишком короткая (<10 сек) → не успевает «переключить»
Слишком длинная (>45 сек) → теряется концентрация
Оптимум: 15-30 сек для большинства

**Важно:** рутина должна быть ОДИНАКОВОЙ на тренировках и соревнованиях.
`;
}
export function getBoneHealthTraining(message: string): string {
  const kw = ['остеопороз тренировки', 'кости и спорт', 'плотность костей', 'профилактика остеопороза', 'здоровье костей'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки для здоровья костей:**

**Механизм:** Механическая нагрузка → остеобласты активируются → ↑ минерализация
Закон Вольфа: кость адаптируется к нагрузкам, которым подвергается

**Лучшие виды нагрузки для костей:**
1. Силовые (особенно осевая нагрузка): приседания, становая, жим стоя
2. Ударные: прыжки, бег (не плавание/велосипед — нет осевой нагрузки)
3. Высокоинтенсивные > низкоинтенсивные (порог стимула)

**Протокол LIFTMOR (доказанный):**
5 подходов по 5 повторений при 80-85% 1ПМ
Упражнения: приседания, становая тяга, жим над головой, прыжки с подтягиванием коленей
Частота: 2 раза в неделю
Результат: ↑ плотность бедра +2.9%, поясницы +0.3% за 8 месяцев

**Питание для костей:**
Кальций: 1000-1200 мг/день (творог, сыр, листовая зелень)
Витамин D: 1000-4000 МЕ/день (особенно в России — мало солнца)
Витамин K2: 100-200 мкг (направляет кальций в кости, а не в сосуды)
Магний: 400 мг/день
Белок: 1.2-1.6 г/кг (коллаген — бонус)

**Противопоказания при остеопорозе:**
❌ Скручивания позвоночника под нагрузкой
❌ Резкие наклоны вперёд
❌ Прыжки на жёсткую поверхность
✅ Приседания, тяги, жимы — безопасны при правильной технике
`;
}
export function getLongevityExercise(message: string): string {
  const kw = ['долголетие тренировки', 'спорт для здоровья', 'продолжительность жизни', 'тренировки для жизни', 'здоровое старение'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки для долголетия (по данным Attia, Huberman, Blue Zones):**

**4 столпа физической подготовки для долголетия:**

1. **Кардиореспираторная выносливость (VO2max):**
   Самый сильный предиктор смертности от всех причин
   ↑ VO2max на 1 МЕТ = ↓ смертности на 13%
   Протокол: 150 мин Zone 2 + 1 сессия VO2max (4×4 мин) в неделю

2. **Сила:**
   Мышечная сила в нижних конечностях предсказывает независимость в старости
   Тест: встать с пола без рук, присесть на одной ноге
   Протокол: 2-3 силовых в неделю, акцент на ноги и спину

3. **Стабильность и баланс:**
   "Centenarian decathlon" Attia: конкретные задачи для 100-летнего возраста
   Тест: стойка на одной ноге с закрытыми глазами 10+ сек
   Протокол: ежедневные упражнения на баланс

4. **Гибкость и мобильность:**
   Тест "сесть-встать" (SRT) коррелирует со смертностью
   Протокол: ежедневная растяжка 10 мин, йога 1-2 раза/нед

**Минимальная эффективная доза:**
150 мин умеренного кардио ИЛИ 75 мин интенсивного в неделю
2 силовых тренировки
= снижение смертности от всех причин на 40%

**"Exercise snacks":**
Короткие всплески активности (2-3 мин) в течение дня
Подъём по лестнице, быстрая ходьба, 10 приседаний
Снижают пост-прандиальную глюкозу, улучшают инсулиновую чувствительность
`;
}
export function getFunctionalTrainingBasics(message: string): string {
  const kw = ['функциональный тренинг', 'функциональные тренировки', 'тренировка для жизни', 'движения в жизни', 'функциональная сила'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Функциональный тренинг — основы:**

**Определение:** Тренировки, улучшающие способность выполнять повседневные движения
Не противопоставление силовым — дополнение

**7 основных паттернов движения:**
1. Приседание (squat) — встать со стула, поднять ребёнка
2. Шарнир (hinge) — поднять сумку с пола, наклон
3. Выпад (lunge) — подъём по лестнице, ходьба
4. Жим (push) — открыть дверь, толкнуть коляску
5. Тяга (pull) — потянуть ящик, грести
6. Вращение (rotation) — повернуться, бросить мяч
7. Перенос (carry) — нести сумки, переносить вещи

**Ошибка "функциональщиков":**
Стоять на босу с гантелями ≠ функционально
Приседания со штангой = функционально (нагружает все паттерны)
Самое функциональное: становая тяга, приседания, жимы, фермерская прогулка

**Программирование:**
80% — базовые многосуставные (сила)
20% — балансовые, ротационные, унилатеральные (стабильность)
`;
}
export function getBreathingForPerformance(message: string): string {
  const kw = ['дыхание тренировки', 'вальсальва техника', 'дыхательные упражнения', 'как дышать при', 'дыхание и сила'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Дыхание и спортивная производительность:**

**Манёвр Вальсальвы (силовые):**
Техника: глубокий вдох → задержка → натуживание → выполнение → выдох
Зачем: ↑ внутрибрюшное давление → стабилизация позвоночника → ↑ сила на 10-20%
Когда: все тяжёлые подходы (>70% 1ПМ)
Противопоказания: неконтролируемая гипертония, аневризма, глаукома

**Bracing (техника Вайнштейна/МакГилла):**
Не "втягивать живот", а "раздувать" его во все стороны
Представь: кто-то ударит тебя в живот → напряги всё вокруг
+ Вальсальва = максимальная стабильность

**Дыхание при кардио:**
Носовое дыхание: ↑ NO (оксид азота), ↑ CO2 толерантность, ↑ эффективность
Zone 2: должен дышать носом. Если не можешь → слишком интенсивно
HIIT: рот+нос, акцент на выдох

**Дыхательные практики для восстановления:**
Box breathing (4-4-4-4): 5 мин → активация парасимпатики
Physiological sigh (двойной вдох + длинный выдох): мгновенное успокоение
Wim Hof: 30 вдохов → задержка → повтор 3 цикла → ↑ адреналин, ↓ воспаление

**Интеграция в тренировку:**
Разминка: 2 мин носового дыхания
Рабочие подходы: Вальсальва + bracing
Между подходами: 2-3 глубоких выдоха (↓ ЧСС быстрее)
Заминка: 5 мин box breathing или 4-7-8
`;
}
export function getBodyTypeTraining(message: string): string {
  const kw = ['эктоморф', 'мезоморф', 'эндоморф', 'тип телосложения', 'соматотип'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Типы телосложения (соматотипы) — научный взгляд:**

**Классификация Шелдона (устаревшая, но полезная как ориентир):**
Эктоморф: узкие плечи, длинные конечности, мало жира, трудно набрать
Мезоморф: широкие плечи, мускулистый, легко набирает мышцы
Эндоморф: широкий таз, легко набирает жир, мощная нижняя часть

**Современная наука:**
Чистых типов не существует — все люди в спектре
Соматотип НЕ определяет судьбу — он определяет стартовую точку
Метаболические различия реальны, но скромны (±200-300 ккал/день)

**Практические рекомендации:**

"Эктоморф" (трудно набирать):
Калорийный профицит +300-500 ккал
Тренировки: базовые, тяжёлые, 3-4 раза/неделю
Кардио: минимум (1-2 раза, 20 мин)
Отдых между подходами: 3-5 мин
Белок: 1.8-2.0 г/кг

"Эндоморф" (легко набирать жир):
Умеренный профицит +200-300 (или дефицит для жиросжигания)
Тренировки: больше объёма, суперсеты, 4-5 раз/нед
Кардио: 3-4 раза, Zone 2
Отдых: 60-120 сек
Белок: 2.0-2.4 г/кг (для насыщения)

"Мезоморф" (генетически одарён):
Стандартный подход работает хорошо
Может прогрессировать на любой программе
Риск: самонадеянность → игнорирование восстановления
`;
}
export function getTrainingAgeAdaptation(message: string): string {
  const kw = ['тренировочный стаж', 'новичок программа', 'продвинутый атлет', 'стаж тренировок', 'опыт тренировок'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Адаптация программы к тренировочному стажу:**

**Новичок (0-1 год):**
Частота: 3 раза/неделю (фулбоди)
Объём: 10-12 подходов на группу/неделю
Прогрессия: линейная (+2.5 кг каждую тренировку)
Фокус: техника > вес
Программы: Starting Strength, StrongLifts, GZCLP

**Промежуточный (1-3 года):**
Частота: 4 раза/неделю (upper/lower или PPL)
Объём: 12-18 подходов на группу/неделю
Прогрессия: еженедельная (+2.5 кг/неделю или DUP)
Фокус: гипертрофия + сила
Программы: 5/3/1, PHUL, nSuns

**Продвинутый (3-7 лет):**
Частота: 4-6 раз/неделю
Объём: 16-22 подходов на группу/неделю
Прогрессия: ежемесячная (блочная периодизация)
Фокус: слабые места, специализация
Программы: блочная периодизация, Conjugate, PHAT

**Элита (7+ лет):**
Частота: 5-6 раз/неделю (возможна двойная)
Объём: индивидуально (MRV тестирование)
Прогрессия: мезоциклами (4-6 нед)
Фокус: микропрогрессия, пикинг
Техники: cluster sets, accommodating resistance, пиковые циклы
`;
}
export function getResponseToTraining(message: string): string {
  const kw = ['не растут мышцы', 'нет прогресса', 'плато генетика', 'хардгейнер', 'не могу набрать'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Почему нет прогресса — системный разбор:**

**Проверь по порядку (80% проблем здесь):**

1. **Калории** — ты реально в профиците?
   Взвешиваешь еду? Считаешь ВСЁ (масло, соусы, перекусы)?
   Если вес не растёт 2+ недели → добавь 200 ккал

2. **Белок** — реально 1.6-2.2 г/кг?
   Считай по трекеру. "Примерно достаточно" = обычно мало

3. **Сон** — 7-9 часов?
   Недосып = минус 30-60% эффективности тренировок

4. **Прогрессия** — увеличиваешь нагрузку?
   Если делаешь одно и то же 4+ недели → прогресса не будет
   Веди дневник: вес × повторения каждую тренировку

5. **Объём** — достаточно подходов?
   Минимум 10 подходов/группу/неделю для роста
   Оптимум: 15-20 подходов

6. **Интенсивность** — работаешь до отказа?
   Последние 1-3 повторения должны быть тяжёлыми (RPE 7-9)
   "Лёгкие" подходы не стимулируют рост

7. **Стресс** — хронический стресс блокирует рост
   Кортизол ↑ → синтез белка ↓, катаболизм ↑

**Если всё ок → тренировочный стимул:**
Смени программу (новый стимул)
Добавь техники интенсификации (дроп-сеты, rest-pause)
Deload → суперкомпенсация
`;
}
export function getAnthropometryExercises(message: string): string {
  const kw = ['длинные руки тяга', 'короткие ноги присед', 'рычаги упражнения', 'антропометрия', 'телосложение упражнения'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Выбор упражнений по антропометрии:**

**Длинные руки / короткий торс:**
✅ Становая тяга (механическое преимущество)
✅ Тяга в наклоне
⚠️ Жим лёжа — длинная амплитуда, используй паузу внизу
Совет: жим на наклонной скамье может быть удобнее

**Короткие руки / длинный торс:**
✅ Жим лёжа (короткая амплитуда — преимущество)
⚠️ Становая — используй трэп-бар или сумо
Совет: фокус на изоляцию для рук (длинные мышечные брюшка)

**Длинные бёдра / короткий торс:**
⚠️ Приседания — сильный наклон вперёд
✅ Фронтальный присед (вертикальнее торс)
✅ Hack squat / жим ногами
Совет: wide stance + носки наружу для глубины

**Короткие бёдра / длинный торс:**
✅ Приседания (короткий рычаг — легче техника)
✅ Становая сумо (короткая амплитуда)

**Общие правила:**
Не заставляй себя делать "обязательные" упражнения, если анатомия не позволяет
Замени опасное для тебя движение безопасной альтернативой
Боль ≠ "нужно привыкнуть", боль = неподходящее движение
`;
}
export function getHybridTraining(message: string): string {
  const kw = ['гибридный тренинг', 'сила и кардио', 'совмещать бег и зал', 'гибридный атлет', 'concurrent training'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Гибридный тренинг (сила + выносливость):**

**Interference effect (эффект интерференции):**
Силовые и кардио одновременно = ↓ адаптация к обоим на 10-30%
AMPK (кардио) vs mTOR (мышцы) — конкурирующие сигнальные пути
НО: для 95% людей это не проблема — интерференция критична только для элиты

**Как совмещать правильно:**

1. **Приоритет:** определи, что важнее (сила или выносливость)
   60/40 в пользу приоритета

2. **Разделение:**
   Идеально: разные дни (силовые пн-ср-пт, кардио вт-чт-сб)
   Допустимо: одна тренировка, но сила ПЕРВАЯ, кардио потом
   Худший вариант: кардио перед силовой (↓ силовые результаты)

3. **Тип кардио:**
   Low-impact (велосипед, гребля) > running (бег повреждает мышцы ног)
   Zone 2 не мешает росту мышц
   HIIT мешает больше, чем LISS → ограничь до 1-2 раз/неделю

4. **Объём:**
   Силовые: 3-4 раза/неделю, акцент на многосуставные
   Кардио: 2-3 раза + Zone 2 в повседневности (ходьба)

**Питание для гибридного атлета:**
↑ Калории на 200-400 (компенсация кардио)
↑ Углеводы (5-7 г/кг для поддержки обоих видов)
Белок: 1.8-2.2 г/кг (стандарт)
`;
}
export function getOlympicLifting(message: string): string {
  const kw = ['тяжёлая атлетика', 'рывок штанга', 'толчок штанга', 'олимпийские упражнения', 'тяжелоатлетические'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Олимпийская тяжёлая атлетика — основы:**

**Два соревновательных упражнения:**

1. **Рывок (Snatch):**
   Штанга с пола → над головой в одном движении
   Самое технически сложное упражнение в зале
   Развивает: мощность, координацию, гибкость, скорость

2. **Толчок (Clean & Jerk):**
   Clean: штанга с пола → на грудь
   Jerk: с груди → над головой
   Два отдельных движения = более тяжёлые веса

**Зачем это обычному атлету:**
↑ Мощность (rate of force development)
↑ Взрывная сила
↑ Атлетизм и координация
↑ Трап, спина, ноги, плечи — полнотелая нагрузка

**Подводящие упражнения (если нет тренера):**
Hang power clean (с виса, без полного седа)
Push press (жим с подседом)
Overhead squat (присед со штангой над головой)
Snatch grip deadlift (тяга рывковым хватом)

**Предупреждение:**
❌ Не учись по YouTube — найди тренера
❌ Не делай рывок/толчок уставшим
❌ Не гонись за весом до освоения техники
Минимум 3-6 месяцев на технику с пустым грифом и лёгкими весами
`;
}
export function getGymnasticsStrength(message: string): string {
  const kw = ['гимнастика силовая', 'калистеника продвинутая', 'muscle up', 'выход силой', 'стойка на руках'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Гимнастические силовые элементы:**

**Прогрессия подтягиваний → Muscle-up:**
1. Строгие подтягивания 15+ повторений
2. Подтягивания до груди (chest-to-bar) 10+
3. Кипинг подтягивания (для кроссфита)
4. Muscle-up на низких кольцах (transition drill)
5. Bar muscle-up
6. Ring muscle-up

**Стойка на руках (Handstand):**
1. Стойка у стены (спиной к стене) 60 сек
2. Стойка лицом к стене (касание носом) 30 сек
3. Freestanding attempts (отрыв от стены)
4. Ходьба на руках (handstand walk)
Время освоения: 3-12 месяцев

**L-sit:**
1. Tucked L-sit (согнутые колени) на параллетках 15 сек
2. One leg extended 10 сек
3. Full L-sit 10 сек
4. V-sit (продвинутый)

**Planche прогрессия:**
1. Planche lean (планка с наклоном вперёд)
2. Tucked planche
3. Advanced tucked planche
4. Straddle planche
5. Full planche (годы тренировок)

**Рекомендации:**
Тренируй навыки ПЕРВЫМИ (свежая ЦНС)
3-5 подходов по 3-5 повторений (или 10-30 сек удержания)
Каждый день по 10-15 мин > 1 длинная тренировка
`;
}
export function getCompetitionPrep(message: string): string {
  const kw = ['подготовка к соревнованиям', 'пикинг', 'первые соревнования', 'выход на пик', 'соревновательная подготовка'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Подготовка к соревнованиям (пикинг):**

**За 12-16 недель до соревнований:**
Блок накопления: высокий объём, умеренная интенсивность (65-80%)
4-6 недель, акцент на гипертрофию и рабочую ёмкость

**За 6-8 недель:**
Блок трансформации: средний объём, высокая интенсивность (80-90%)
Сужение упражнений к соревновательным
Практика соревновательных движений

**За 2-4 недели:**
Блок реализации (пикинг):
Неделя 4: синглы на 90-95%
Неделя 3: синглы на 95-100%
Неделя 2: лёгкие синглы 85-90% (deload начинается)
Неделя 1: 1-2 лёгких тренировки, отдых перед соревнованиями

**Нарезка веса (если нужно):**
За 7 дней: уменьшить углеводы и натрий
За 24ч: ограничить воду (только для опытных!)
⚠️ Не режь более 3-5% массы тела (опасно для здоровья)
Лучше: выступай в своей весовой категории

**День соревнований:**
Подготовка разминки: 30-40 мин до первого подхода
Первый подход: консервативный (то, что сделаешь 100%)
Второй: рабочий (90-95% от цели)
Третий: рекорд (если два предыдущих удачны)

**Совет для первых соревнований:**
Цель: получить опыт, а не медаль
3 из 3 попыток > 1 рекорд + 2 промаха
`;
}
export function getClimbingStrength(message: string): string {
  const kw = ['скалолазание тренировки', 'хват для лазания', 'боулдеринг', 'тренировки для скалолазания'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Силовые тренировки для скалолазания:**

**Ключевые качества:** Сила хвата, тяговая сила, кор, выносливость пальцев

**Специфическая тренировка:**

Пальцы (после 1+ года лазания, не раньше!):
Hangboard: 7 сек вис / 3 сек отдых × 6, 2-3 хвата
Начни с открытого хвата → полуоткрытый → щипок
Тренируй 2 раза/неделю, ≥48ч между сессиями
⚠️ Пальцы восстанавливаются медленно — не перегружай

Тяговая сила:
Подтягивания: 3×5-8 (с доп. весом для продвинутых)
Lock-off: удержание на 90°, 120°, 150° по 5 сек
Тяга одной рукой (с помощью): 3×5 на руку

**Общая силовая (2 раза/нед):**
Подтягивания (разные хваты): 4×6-8
Inverted rows: 3×10
Push-ups / Жим (баланс): 3×10
Кор: front lever progressions, hanging leg raise
Antagonist training: отжимания, жим гантелей (профилактика дисбаланса!)

**Выносливость для лазания:**
Traverses (горизонтальное лазание): 15-30 мин непрерывно
4×4s: 4 боулдера подряд × 4 серии, отдых 4 мин
ARC training: 20-30 мин лёгкого лазания (Zone 2 на стене)
`;
}
export function getAltitudeTrainingV2(message: string): string {
  const kw = ['тренировки на высоте', 'altitude training', 'горный тренинг', 'высокогорье спорт', 'эритропоэтин натуральный'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Высотные тренировки (Altitude Training):**

**Физиологические адаптации:**
↑ ЭПО (эритропоэтин) → ↑ эритроциты → ↑ перенос O2
↑ Плотность митохондрий
Улучшение на уровне моря: ↑ VO2max на 1-3% за 3-4 недели на высоте

**Модели:**
Live High — Train Low (LHTL): жить на 2000-2500м, тренироваться на <1500м
Наиболее научно обоснована: сохраняет качество тренировки + даёт высотную адаптацию
Гипоксические палатки: умеренный эффект (~30-50% от натуральной высоты)

**Оптимальные параметры:**
Высота: 2000-2500м (выше — слишком нарушается тренировочный процесс)
Продолжительность: минимум 3-4 недели
Возвращение на уровень моря: пик эффекта через 2-4 недели после

**Практические рекомендации:**
↑ потребление железа и белка на высоте
↑ углеводы (↑ зависимость от гликолиза при гипоксии)
Мониторинг HRV и качества сна (снижаются первые 1-2 недели)
Ожидать: первые 5-7 дней — снижение производительности, затем адаптация

**Для большинства спортсменов:**
Сборы в горах 1-2 раза/год = разумный вариант
Гипоксические маски на уровне моря: НЕ создают высотную адаптацию
`;
}
export function getPlyometricTraining(message: string): string {
  const kw = ['плиометрика', 'прыжковые тренировки', 'взрывная мощь', 'depth jump', 'box jump', 'реактивная сила', 'стретч рефлекс'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Плиометрические тренировки (plyometrics):**

**Физиологическая основа:**
Использует цикл растяжение-сокращение (SSC): упругая энергия в сухожилиях + стретч-рефлекс = мощность > чисто мышечного усилия
Ключевые структуры: ахиллово сухожилие, сухожилие надколенника, фасции

**Классификация по интенсивности:**
Низкая: прыжки в длину стоя, прыжки на скакалке, боковые шаги
Средняя: запрыгивания на тумбу (box jump), бурпи, прыжки с разворотом
Высокая: depth jump (прыжок в глубину), прыжки с весом, hurdle jumps

**Depth Jump — ключевое упражнение:**
Спрыгнуть с высоты 40-75 см → немедленно взрывной прыжок вверх
Время контакта с полом: цель < 0.25 сек
Адаптирует нервную систему к максимальной скорости силы

**Программирование:**
Объём: 80-120 контактов/сессию (начинающие), до 200 (продвинутые)
Частота: 2-3 раза/нед, НЕ в дни тяжёлых силовых
Отдых: 2-3 мин между сериями
Прогрессия: низкоинтенсивные → средние → высокоинтенсивные (6-8 нед)

**Совмещение с силовым тренингом (Complex Training):**
Тяжёлый присед (85-90% 1ПМ) → сразу прыжок в глубину = пост-активационное потенцирование (PAP)
Пауза 4-8 мин между силовым и плио для максимального эффекта PAP

**Противопоказания:** не применять при болях в суставах, тендинопатиях, <6 мес после операций
`;
}
export function getIsometricTraining(message: string): string {
  const kw = ['изометрические тренировки', 'изометрика', 'статические упражнения', 'isometric', 'мышечная напряжённость без движения', 'стенной присед'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Изометрические тренировки — наука и применение:**

**3 типа изометрических:**
1. **Overcoming** (преодолевающие): толкать/тянуть несдвигаемое препятствие — максимальная нагрузка на ЦНС
2. **Yielding** (уступающие): удерживать позицию против гравитации (планка, стул у стены) — эндюранс мышц
3. **Functional** (функциональные): удерживать спортивную позицию (медленный присед)

**Применение в реабилитации и силе:**
Тендинопатии (колено прыгуна, ахилл): изометрия 45-60 сек × 4-5 подходов — немедленное обезболивание (↓ кортикальная ингибиция)
Болевой синдром надколенника: стенной присед 45° — безопасная нагрузка

**Эффекты изометрии:**
Специфика угла: сила растёт ±15° от тренируемого угла — тренируй несколько углов для полного ROM
Нейрально-мышечная эффективность: 6 недель изометрии = ↑ 1ПМ на 10-25% даже без движения
Rate of Force Development: overcoming изометрия улучшает RFD лучше, чем динамическая

**Протокол для начинающих:**
Overcoming: 3-5 попыток × 3-5 сек максимального усилия, отдых 3 мин
Yielding: 3 × 30-60 сек, отдых 2 мин
Добавь в конец тренировки или как самостоятельный блок

**Пример применения в силовом:**
Spanish Squat (изо присед с ремнём) → снижение нагрузки на колено при патологии
Hip thrust iso → ягодицы без осевой нагрузки на позвоночник
`;
}
export function getBFRTrainingV2(message: string): string {
  const kw = ['окклюзионный тренинг', 'bfr', 'blood flow restriction', 'жгут тренировка', 'тренировка с ограничением кровотока', 'kaatsu'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**BFR-тренинг (Blood Flow Restriction) — окклюзионный тренинг:**

**Суть метода:**
Манжета/жгут частично ограничивает венозный отток (НЕ артериальный приток)
Давление: 40-80% от окклюзии артерии (рука ~50-60%, нога ~60-80%)
Результат: накопление метаболитов → мощный анаболический ответ без тяжёлых весов

**Ключевые преимущества:**
Гипертрофия при нагрузке 20-30% 1ПМ (vs стандартные 65-85%)
Идеален при травмах суставов, после операций, для пожилых
Нет осевой нагрузки — безопасность позвоночника сохранена

**Протокол:**
Нагрузка: 20-30% 1ПМ
Схема подходов: 30 повторений → 15 → 15 → 15 (пауза 30-45 сек между подходами, жгут НЕ снимать)
Скорость: умеренная, без расслабления в нижней точке (постоянное напряжение)
Частота: 2-4 раза/нед

**Локализация жгута:**
Руки: проксимально на плечо (бицепс/трицепс работают дистально)
Ноги: проксимально на бедро (квадрицепс/бицепс бедра работают дистально)
НЕ накладывай на предплечье или голень — неэффективно и опасно

**Физиологические механизмы:**
↑ ГР (гормон роста), IGF-1, тестостерон
↑ мышечный ПАП-фактор, MAPK/ERK сигналинг
Локальная гипоксия → быстрые волокна II типа рекрутируются при малом весе

**Противопоказания:** тромбозы, варикоз, диабетическая нейропатия, гипертония 3 ст.
`;
}
export function getGripStrengthTrainingV2(message: string): string {
  const kw = ['сила хвата', 'кисть тренировка', 'grip strength', 'forearm training', 'пальцы сила', 'предплечья накачать', 'висение на перекладине'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировка силы хвата:**

**3 типа хвата:**
1. Сдавливающий (crush): сжатие предмета — эспандер, хват гантели
2. Поддерживающий (support): удержание в позиции — вис на перекладине, deadlift
3. Щипковый (pinch): большой палец против остальных — блины, hub lift

**Упражнения по типу:**
Crush: эспандер кисти (100+ повторений), rollers, hand gripper
Support: вис на перекладине — до отказа, farmer carry 40-60 м
Pinch: удержание блина за ребро, pinch deadlift, pinch carry
Предплечья: wrist roller (мотовило), zottman curl, reverse curl

**Структура программы:**
3 дня/нед в конце тренировки
Вис: 3 × максимум (цель >60 сек) — ключевое упражнение
Farmer carry: 3 × 40 м с комфортно тяжёлым весом
Gripper: 3 × 8-10 закрытий с 2-3 сек удержанием

**Связь с другими движениями:**
Слабый хват = ограничивающий фактор в становой, подтягиваниях, тягах
↑ хват на 10% → +5-7% к становой тяге у начинающих
Straps временно снимают ограничение хвата — но не развивают его

**Методы отдельного развития:**
Chalk (магнезия) убирает трение — помогает в соревновательный день
Лямки — для технической работы с субмаксимальными весами
Naked grip — для силы хвата: никаких лямок 80% тренировок
`;
}
export function getCoreTrainingScience(message: string): string {
  const kw = ['тренировка кора', 'кор мышцы', 'core training', 'стабилизация позвоночника', 'планка польза наука', 'глубокие мышцы живота'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировка кора — современная наука:**

**Что такое кор (не только пресс):**
Диафрагма (сверху) + поперечная мышца живота (глубокий корсет) + мышцы тазового дна (снизу) + мультифидус (спина)
+ внешние слои: прямая/косые/квадратус поясницы/ягодицы/сгибатели бедра

**Функция кора — стабилизация, а НЕ движение:**
Stuart McGill: кор должен быть жёстким при передаче силы конечностей
"Stiffness vs Mobility": кор rigid → сила ног/рук не теряется при передаче
Скручивания (crunch) изолированно — ↑ нагрузка на диски, минимальная функциональная польза

**Большая тройка McGill:**
1. **McGill Curl-Up**: чуть поднять голову/плечи → держать → нейтральный поясничный лордоз
2. **Bird Dog**: рука + противоположная нога → 8-10 сек hold, контроль таза
3. **Side Plank**: боковая планка → прямое тело → нагружает квадратус поясниц

**Планка — оптимальная техника:**
Время не главное — качество важнее. 10 сек × 10 подходов > 60 сек × 3 подхода (по нагрузке на ЦНС)
Активная: сжать всё тело, втянуть лопатки, выровнять таз (не опускать/поднимать)

**Прогрессия:**
Базовый: Большая тройка McGill 2-3 раза/нед
Промежуточный: + паллоф пресс, медбол slam, ab wheel rollout
Продвинутый: dragon flag, L-sit, renegade row, gymnastics hollow body

**Ошибка:** тренировать кор через боль в пояснице скручиваниями → усугубляет
Правильно: начать с декомпрессии (детская поза) + McGill Curl-Up
`;
}
export function getHormonalResponseTraining(message: string): string {
  const kw = ['гормональный ответ тренировка', 'тестостерон тренировки', 'гормон роста силовые', 'кортизол тренировка', 'анаболические гормоны спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Гормональный ответ на тренировку:**

**Острый гормональный ответ (после тренировки):**

**Тестостерон:**
Пик: через 15-30 мин после начала тренировки
Стимуляторы: многосуставные упражнения (присед, становая), объём 3-5 подходов, нагрузка 75-85% 1ПМ, короткий отдых 60-90 сек
Не коррелирует прямо с гипертрофией у натуральных атлетов (Schoenfeld 2020)

**Гормон роста (ГР):**
Пик: 15-60 мин после тренировки
Стимуляторы: высокий объём, умеренные веса, короткие паузы, метаболический стресс
↑ ГР от тренировки временный — хроническая адаптация важнее

**Инсулиноподобный фактор роста (IGF-1):**
Местный (mechano growth factor): выделяется в мышцах при механической нагрузке
Ключевой триггер локального анаболизма — важнее системного IGF-1

**Кортизол — не враг:**
Острый ↑ кортизола = нормальная мобилизация энергии
Проблема только при хронически ↑ кортизоле (перетренированность, стресс, недосып)
Тренировка >75 мин → соотношение тест/кортизол смещается в сторону кортизола

**Практические выводы:**
Не гонись за "гормональным всплеском" — хроническая перегрузка прогрессивной нагрузкой важнее
Сон 7-9 часов: 70% суточного ГР выделяется в медленных фазах сна
Утром ↑ кортизол, вечером ↑ тестостерон — вечерние тренировки чуть эффективнее для гипертрофии (незначительно)
`;
}
export function getDeadliftMechanics(message: string): string {
  const kw = ['техника становой тяги', 'биомеханика становой', 'сумо или классика', 'румынская тяга техника', 'нейтральная спина тяга', 'становая спина округляется'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Биомеханика становой тяги:**

**Классическая становая:**
Ноги: тазовая ширина или чуть уже, носки прямо или 10-15° наружу
Хват: прямо под голенями, руки вертикальны в начале
Старт: таз выше, чем в приседе — это тяга, не присед
Спина: нейтральная, лопатки над штангой, «гордая грудь»

**Сумо:**
Широкая постановка ног (30-45°+ наружу), хват внутри ног
Более вертикальный торс → меньше нагрузка на поясницу
Требует: мобильности тазобедренных суставов
Не «мухлёж» — соревновательный вариант со своей техникой

**Выбор Классика vs Сумо:**
Длинные бедра/короткий торс → Сумо может быть эффективнее
Пропорции плечи/бедра среднии → Классика
Лучший способ: пробуй оба 4-6 недель и сравни

**Ключевые ошибки:**
Округление поясницы → шир. округление спины опасно при тяжёлых весах
Штанга уходит от тела → потеря момента, нагрузка на поясницу
Таз поднимается первым → «утро доброе» — квадрицепсы выключились
Гиперэкстензия в верхней точке → не нужна, ведёт к компрессии дисков

**Румынская тяга (RDL):**
Hip hinge с минимальным сгибом колена
Штанга скользит вдоль тёр → почувствуй растяжение бицепсов бедра
Диапазон: до середины голени (не пола) — удержание нейтральной спины
Нагрузка: задняя цепь (ягодицы, бицепс бедра, поясница)

**Дыхание:** Valsalva до отрыва, выдох — только после прохождения колен при подъёме
`;
}
export function getDUPPeriodization(message: string): string {
  const kw = ['dup периодизация', 'волновая периодизация', 'нелинейная периодизация', 'daily undulating periodization', 'чередование диапазонов повторений', 'как менять нагрузку на неделе'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**DUP — Daily Undulating Periodization (Волновая периодизация):**

**Суть:**
Разные диапазоны повторений в разные тренировочные дни той же недели
Vs линейная: нагрузка растёт постепенно неделя за неделей
Vs блоковая: отдельные блоки на силу/гипертрофию/выносливость

**Классическая структура (3 дня/нед):**
Пн: Сила — 3-5 повторений, 85-90% 1ПМ, отдых 3-5 мин
Ср: Гипертрофия — 8-12 повторений, 65-75% 1ПМ, отдых 90-120 сек
Пт: Объём/выносливость — 15-20 повторений, 50-60% 1ПМ, отдых 60 сек

**Преимущества:**
Нет монотонии нагрузки → лучше адаптация
Работает сила И гипертрофия одновременно
Меньше вероятность плато
Доказана преимущество над линейной в исследованиях на атлетах с опытом

**Кому подходит:**
Промежуточный/продвинутый уровень (6+ мес опыта)
Те, кто застрял на одной цели
Люди с нестабильным расписанием (можно гибко переставлять дни)

**Пример на жиме лёжа:**
Пн: 4 × 3 @ 85%
Ср: 3 × 10 @ 70%
Пт: 3 × 15 @ 60%
Прогрессия: каждые 4-6 нед поднимать веса на 2-5%

**Модификация (Weekly DUP):**
Нед 1: Объём (10-12 повт), Нед 2: Интенсивность (6-8 повт), Нед 3: Мощность (3-5 повт)
Менее жёсткий вариант, подходит для начинающего уровня
`;
}
export function getTrainingVolumeScience(message: string): string {
  const kw = ['объём тренировок', 'сколько подходов в неделю', 'mev mav mrv', 'минимальный объём', 'максимальный объём', 'как считать объём тренировки', 'тренировочный объём'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировочный объём — MEV, MAV, MRV:**

**Концепция (Mike Israetel / RP Strength):**
MEV (Minimum Effective Volume): минимум подходов/нед для поддержания прогресса
MAV (Maximum Adaptive Volume): оптимальный диапазон для роста
MRV (Maximum Recoverable Volume): максимум, после которого начинается перетренированность

**Ориентиры по группам мышц (подходов в неделю):**
| Группа | MEV | MAV | MRV |
|---|---|---|---|
| Квадрицепсы | 6 | 12-18 | 20+ |
| Ягодицы | 4 | 10-16 | 20+ |
| Спина | 6 | 14-22 | 25+ |
| Грудь | 4 | 10-20 | 22+ |
| Дельты | 6 | 16-22 | 26+ |
| Бицепс/Трицепс | 6 | 14-20 | 26+ |
| Икры | 8 | 14-20 | 22+ |

**Практическое применение:**
Начинай с MEV при новой программе
Добавляй 1-2 подхода/мышцу/нед пока есть прогресс
При признаках усталости/плато → deload до MEV
MRV — индивидуально, зависит от восстановления, сна, питания

**Факторы, влияющие на MEV/MRV:**
Сон: <7ч → ↓ MRV значительно
Стресс: высокий → ↓ MRV
Стаж тренировок: > опыт → нужно больше объёма
Близость к отказу: больше интенсивность → ↓ нужный объём

**Ошибка новичков:** слишком много объёма сразу → перетренированность без базы адаптации
**Ошибка продвинутых:** слишком мало объёма → нет стимула для роста
`;
}
export function getGoalSettingPsychology(message: string): string {
  const kw = ['психология целей', 'постановка целей спорт', 'мотивация тренировки', 'привычки тренировки', 'как не бросить тренировки', 'дисциплина тренировки', 'плато мотивация'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Психология целей и привычек в тренинге:**

**SMART-цели для спорта:**
Specific: «хочу жать 100 кг» vs «хочу стать сильнее»
Measurable: отслеживаемые цифры (вес, повторения, время)
Achievable: реалистично для твоего уровня
Relevant: связано с твоими реальными ценностями
Time-bound: дата (через 12 недель, к лету)

**Иерархия целей:**
Результатные (outcome): «поднять 140 кг в становой»
Процессные (process): «тренироваться 4 раза в неделю»
Фокусируйся на process-целях — они под контролем, они формируют привычку

**Цикл привычки (Atomic Habits — James Clear):**
Триггер → Желание → Действие → Награда
Снизи трение: форма заготовлена с вечера, зал по пути с работы
Повысь привлекательность: пара плейлистов только для зала
2-минутное правило: «встань и надень кроссовки» — начало снимает инерцию

**Психология плато:**
Плато нормально — биологически тело адаптировалось
Смена стимула (новые упражнения, диапазоны) → новый прогресс
Вести дневник тренировок → видеть реальный прогресс, а не субъективное ощущение

**Поддержание долгосрочной мотивации:**
Self-Determination Theory: автономия + компетентность + связь с людьми
Компетентность: отслеживай PR и маленькие победы
Автономия: выбирай упражнения, которые тебе нравятся
Связь: партнёр по тренировкам удваивает consistency

**При потере мотивации:**
Снизь интенсивность, но НЕ прекращай (поддерживающий объём)
Поставь процессную цель на 2 недели
Смени формат: другой зал, новое упражнение, другое время
`;
}
export function getPopularPrograms(message: string): string {
  const kw = ['531', '5/3/1', 'gzclp', 'stronglifts', 'starting strength', 'greyskull', 'программа 5x5', 'wendler', 'программа для начинающих'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Популярные силовые программы:**

**Starting Strength (Rippetoe):**
Для: абсолютные новички
Структура: 3 тренировки/нед, 3 базовых упражнения × 3×5
Прогрессия: +2.5 кг каждую тренировку
Плюс: простота, быстрый прогресс
Минус: однообразие, мало объёма на гипертрофию

**StrongLifts 5×5:**
Для: новички/начинающие
Структура: тренировка A/B, 5 упражнений × 5×5
Прогрессия: +2.5 кг каждую тренировку
Минус: сессии становятся очень длинными на средних весах

**GZCLP (Gainit Zach Coleman Light Programme):**
Для: новички, хотят больше объёма
Уровни: T1 (базовые тяжёлые), T2 (основные средние), T3 (изоляция)
Прогрессия по уровням независима
Плюс: гибкость, больше объёма, лучше гипертрофия

**5/3/1 (Wendler):**
Для: средний/продвинутый уровень
Структура: 4 тренировки/нед, 1 главное упражнение + дополнение
Прогрессия: медленная (месячные циклы), зато устойчивая
Лучшие вариации: 5/3/1 BBB, Forever (для гипертрофии)

**Выбор:**
Новичок (<1 года) → StrongLifts или GZCLP
1-2 года → 5/3/1 или PPL
2+ года → нужна более индивидуальная программа
`;
}
export function getHypertrophyMechanisms(message: string): string {
  const kw = ['механизмы роста мышц', 'механический стресс', 'метаболический стресс', 'саркоплазматическая гипертрофия', 'миофибриллярная гипертрофия', 'как растут мышцы'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Механизмы гипертрофии мышц — научный обзор:**

**3 механизма (Schoenfeld, 2010):**

1. **Механическое натяжение** — главный стимул
Создаётся тяжёлой нагрузкой, особенно в растянутом положении
Активирует mTOR → синтез белка
Практика: работа в полном диапазоне движения, медленная эксцентрика

2. **Метаболический стресс** (пампинг)
Накопление метаболитов (лактат, ионы H⁺, неорганический фосфат)
Гипоксия мышцы → клеточный отёк → анаболические сигналы
Практика: диапазон 12-20 повторений, короткий отдых (60-90 сек), дроп-сеты

3. **Мышечные повреждения**
Микроразрывы → воспаление → восстановление с гиперплазией миофибрилл
Практика: акцент на эксцентрике, новые упражнения, большой ROM

**Саркоплазматическая vs Миофибриллярная:**
Миофибриллярная (функциональная): рост сократительных белков → сила + размер
Тяжёлые нагрузки (1-6 повт), длинный отдых (3-5 мин)

Саркоплазматическая (неспецифическая): рост жидкости и органелл → размер без силы
Лёгкие нагрузки (15-30 повт), высокий объём, пампинг

**Практика:**
Оба типа важны для максимальной гипертрофии
Комбинируй тяжёлые (4-6 повт) и умеренные (8-15) и лёгкие (15-25) диапазоны
`;
}
export function getBlockPeriodization(message: string): string {
  const kw = ['блоковая периодизация', 'block periodization', 'накопление трансформация реализация', 'этапы тренировочного цикла', 'периодизация продвинутый'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Блоковая периодизация (Issurin):**

**Суть:**
Разбивка тренировочного года на последовательные мезоциклы (блоки), каждый с одной доминирующей задачей

**3 типа блоков:**

**Накопление (Accumulation), 3-6 недель:**
Цель: объём, база, аэробная ёмкость, гипертрофия
Нагрузка: средняя интенсивность, высокий объём
Пример: 4×8-12, 65-75% от 1ПМ

**Трансформация (Transmutation), 3-6 недель:**
Цель: конвертировать объём в специфическое качество (сила, мощь)
Нагрузка: высокая интенсивность, средний объём
Пример: 5×3-5, 80-90% от 1ПМ

**Реализация (Realization), 1-2 недели:**
Цель: пик формы, снижение усталости, максимальные результаты
Нагрузка: высокая интенсивность, низкий объём (тейпер)
Пример: 3×1-3, 90-100%+

**Преимущества перед линейной:**
Меньше риск перетренированности
Каждый блок концентрирован на одном качестве → более глубокая адаптация
Лучше для продвинутых (не-новичков) атлетов

**Пример годового плана:**
Ян-Фев (накопление) → Мар-Апр (трансформация) → Май (реализация/соревнование)
Июн-Июл (накопление) → Авг-Сен (трансформация) → Окт (реализация/соревнование)
`;
}
export function getDropSetScienceV2(message: string): string {
  const kw = ['дроп-сеты', 'drop set', 'дропсеты наука', 'механический дроп-сет'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Дроп-сеты — наука и практика:**

**Суть метода:**
Выполнение подхода до отказа → немедленное снижение веса → продолжение до отказа → снова снижение.
Цель: максимальная метаболическая нагрузка и рекрутирование мышечных волокон.

**Что говорит наука:**
Мета-анализ (Angleri et al. 2022): дроп-сеты дают СОПОСТАВИМУЮ гипертрофию с традиционными подходами, но за ВДВОЕ меньше времени.
Coleman et al. (2022): 1 дроп-сет = ~3 обычных подхода по стимулу гипертрофии.
Механизм: максимальное утомление всех типов мышечных волокон (тип I и тип II).

**Протокол выполнения:**
3 дропа (снижения) за один подход
Снижение веса: 20-25% на каждом дропе
Без отдыха между дропами (только время на смену веса, 5-10 сек)
Пример: 40 кг × 10 → 30 кг × 8 → 22 кг × 8 → 16 кг × до отказа

**Механический дроп-сет (вариация):**
Вместо снижения веса — смена упражнения на более лёгкую вариацию:
Жим гантелей на наклонной → жим на горизонтальной → отжимания
Тот же вес, но механическое преимущество растёт

**Где использовать:**
ЛУЧШЕ: изолирующие упражнения в конце тренировки (разгибания ног, сгибания на бицепс, разведения)
ХУЖЕ: базовые упражнения (приседания, становая — опасно при утомлении)
Частота: 1-2 упражнения за тренировку максимум (больше = избыточный стресс)

**Для кого:**
Идеально при дефиците времени (та же гипертрофия за меньшее время)
Продвинутые атлеты для преодоления плато
НЕ рекомендуется начинающим (сначала освоить технику до автоматизма)
`;
}
export function getTrainingJournal(message: string): string {
  const kw = ['тренировочный дневник', 'как вести дневник тренировок', 'отслеживание прогресса', 'логирование тренировок'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировочный дневник — ключ к прогрессу:**

**Зачем вести дневник:**
Прогрессивная перегрузка — главный драйвер мышечного роста. Без записей невозможно точно знать, прогрессируете ли вы.
Исследования: атлеты, ведущие дневник, прогрессируют на 30-40% быстрее (за счёт осознанной прогрессии).
Дневник выявляет паттерны: что работает, что нет, когда начинается перетренированность.

**Что записывать (минимум):**
Упражнение, вес, подходы × повторения — это база
RPE (шкала воспринимаемой нагрузки 1-10) — субъективная оценка тяжести подхода
Время тренировки и общий объём (вес × подходы × повторения)

**Что записывать (продвинутый уровень):**
Качество сна (1-10) и количество часов — коррелирует с силовыми показателями
Настроение/энергия перед тренировкой (1-10)
Питание: выполнен ли план по калориям и белку
Боль/дискомфорт: локализация и интенсивность (предотвращение травм)
Темп повторений и паузы отдыха

**Цифровой vs бумажный дневник:**
Цифровой (это приложение!): автоматические расчёты, графики прогресса, всегда с собой
Бумажный: тактильное запоминание, нет отвлечений, но неудобно анализировать
Оптимально: цифровой для данных + краткие заметки (ощущения, техника)

**Протокол еженедельного обзора (5-10 минут):**
1. Сравнить объём/интенсивность с прошлой неделей — есть ли прогрессия?
2. Проверить RPE — если растёт при том же весе, нужен деload
3. Оценить сон и питание — были ли «провалы» и как они повлияли
4. Поставить конкретные цели на следующую неделю: «+2.5 кг в приседе» или «+1 повторение в жиме»
5. Отметить, какие упражнения «застряли» — кандидаты на замену/модификацию
`;
}
export function getTrainingPartner(message: string): string {
  const kw = ['тренировочный партнёр', 'тренировки с партнёром', 'споттер', 'страховка'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировочный партнёр и страховка — максимум пользы:**

**Преимущества тренировки с партнёром:**
Исследования (Feltz et al. 2011): партнёр повышает интенсивность на 10-15% (эффект Кёлера)
Мотивация: сложнее пропустить тренировку, когда кто-то ждёт в зале
Безопасность: страховка на тяжёлых подходах позволяет работать до отказа
Форсированные повторения: 2-3 дополнительных повторения с помощью = больший стимул для роста

**Когда обязательно нужен споттер:**
Жим лёжа — самое опасное упражнение без страховки (гриф может упасть на грудь/шею)
Приседания со свободным грифом (без стоек безопасности)
Жим гантелей — помощь при подъёме гантелей в исходное положение
Любой подход «до отказа» с тяжёлым весом (более 85% от 1RM)

**Как правильно страховать:**
Жим лёжа: стоять за скамьёй, руки под грифом (не на нём!), помогать МИНИМАЛЬНО
Приседания: стоять сзади, руки под грудью атлета (не за гриф!)
Правило: помощь — это 5-10% от усилия, не больше. Если нужно больше — вес слишком тяжёлый.
Договоритесь о сигнале: «держи» = помощь нужна, «ещё одно» = готов к следующему повторению

**Негативные/ассистируемые повторения (протокол):**
Партнёр помогает в концентрической (подъём) фазе, атлет контролирует эксцентрику (опускание)
Используйте вес 105-120% от 1RM
2-3 негативных повторения в конце последнего подхода — достаточно
НЕ делайте каждую тренировку — 1-2 раза в месяц на ключевых упражнениях
Эксцентрическая фаза: 4-6 секунд (медленно и контролируемо)

**Коммуникация с партнёром:**
Обсудите цели: одинаковый уровень и цели = лучший результат
Согласуйте время отдыха между подходами
Не разговаривайте во время подхода — только необходимые команды
Честная обратная связь по технике (без обид)
`;
}
export function getPlateauBreaking(message: string): string {
  const kw = ['пробить плато', 'застой в весах', 'не могу увеличить вес', 'стагнация прогресса'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Как пробить плато — 5 проверенных методов:**

**Метод 1: Смена диапазона повторений**
Если работали в 3-5 повторений — перейдите на 8-12 на 3-4 недели
Если работали в 8-12 — попробуйте тяжёлые синглы и тройки
Принцип: разный диапазон повторений стимулирует разные адаптации (нейральные vs структурные)
Пример: застряли на жиме 100×5 → 4 недели 80×10-12 → возврат к 5RM → обычно +5-7.5 кг

**Метод 2: Увеличение объёма**
Добавьте 2-4 рабочих подхода на отстающую группу мышц в неделю
Распределите по дням (не всё в один день)
Критерий: если делаете менее 10 подходов/неделю на группу — объём недостаточен
Исследования (Schoenfeld 2017): 10-20 подходов/неделю — оптимум для гипертрофии

**Метод 3: Деload → Пик**
Неделя 1 (деload): 50% объёма, 70-80% интенсивности — полное восстановление
Неделя 2: обычная программа с прежними весами
Неделя 3: попытка нового максимума (суперкомпенсация после отдыха)
Часто «плато» = накопленная усталость, а не предел возможностей

**Метод 4: Смена вариации упражнения**
Классический жим → жим с паузой на груди (2-3 сек) → возврат к классике
Приседания → приседания с паузой в нижней точке или фронтальные приседания
Становая тяга → тяга с дефицитом (стоя на подставке 5-7 см)
Принцип: устраняете слабое звено → основное движение растёт

**Метод 5: Улучшение восстановления**
Сон: 7-9 часов. Недосып = -10-15% силы (Knowles et al. 2018)
Белок: 1.6-2.2 г/кг/день — проверьте, достаточно ли?
Стресс: хронический стресс повышает кортизол → катаболизм. Медитация, прогулки, хобби.
Калории: в дефиците прогресс в силе значительно замедляется. Возможно, нужен maintenance или surplus.

**Концепция минимальной эффективной дозы (MED):**
Не нужно использовать все 5 методов одновременно — попробуйте один, дайте 3-4 недели.
Начинайте с простейшего (обычно №5 — восстановление) и переходите к сложным.
Больше ≠ лучше. Восстановление — это часть тренировочного процесса.
`;
}
export function getWarmupProtocol(message: string): string {
  const kw = ['разминка перед тренировкой', 'как разминаться', 'динамическая разминка', 'активация мышц'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Разминка перед тренировкой — полный протокол:**

**Зачем нужна разминка:**
Повышение температуры мышц на 1-2°C → увеличение скорости нервных импульсов и эластичности тканей
Снижение риска травм на 50%+ (Fradkin et al. 2006)
Улучшение производительности: разогретые мышцы генерируют больше силы
Психологическая подготовка: переход из «режима дня» в «режим тренировки»

**Этап 1: Общая разминка (5-10 минут)**
Лёгкое кардио: ходьба на дорожке, велотренажёр, гребной тренажёр
ЧСС: 100-120 уд/мин (лёгкое учащение, не одышка)
Цель: повысить температуру тела, увеличить кровоток к мышцам
НЕ нужно бегать 20 минут — это уже кардио-тренировка, а не разминка

**Этап 2: Динамическая растяжка (5 минут)**
ВАЖНО: НЕ статическая растяжка перед силовой! Статика снижает силу на 5-8% (Simic et al. 2013)
Махи ногами (вперёд-назад, в стороны): 10 на каждую ногу
Вращения руками (малые и большие круги): 10 в каждом направлении
Выпады с поворотом корпуса: 5 на каждую ногу
Приседания без веса (глубокие, с задержкой внизу): 10 повторений
Кошка-корова (для позвоночника): 10 повторений

**Этап 3: Специфическая разминка (разминочные подходы):**
Подход 1: пустой гриф (или 30% от рабочего) × 10-12 повторений — координация движения
Подход 2: 50% от рабочего веса × 8 повторений — ощущение нагрузки
Подход 3: 70% × 5 повторений — подготовка к нагрузке
Подход 4: 85% × 2-3 повторения — нейральная активация (по желанию)
Отдых между разминочными подходами: 60-90 сек

**Этап 4: Активация (2-3 минуты, опционально):**
Резиновые мини-петли для активации ягодиц (перед приседаниями/тягой): 2×15
Внешняя ротация плеча с лёгкой резинкой (перед жимом): 2×12
Face pulls с лёгким весом (перед любой тренировке верха): 2×15

**Общее время: ~15 минут. Это инвестиция в безопасность и результат.**
Если опаздываете — минимум: 5 мин общая + 2-3 разминочных подхода. НЕ пропускайте разминку полностью.
`;
}
export function getTrainingForBusyPeople(message: string): string {
  const kw = ['нет времени на тренировки', 'короткие тренировки', 'тренировка за 30 минут', 'мало времени для зала'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки для занятых людей — максимум результата за минимум времени:**

**Минимальная эффективная доза:**
Исследования (Schoenfeld 2016): 2 тренировки full body в неделю — достаточно для роста мышц и силы
Даже 1 тренировка/неделю лучше, чем 0 (сохраняет 80% адаптаций)
Оптимум для большинства: 3×/нед full body по 35-45 минут

**Шаблон 30-минутной тренировки (5 упражнений × 3 подхода):**
1. Приседания или жим ногами (ноги) — 3×8-10
2. Жим гантелей лёжа или отжимания (грудь/трицепс) — 3×8-12
3. Тяга гантели в наклоне (спина/бицепс) — 3×10-12
4. Жим гантелей стоя (плечи) — 3×10-12
5. Планка или скручивания (кор) — 3×30-60 сек
Отдых: 60-90 сек между подходами (не больше!)
Итого: 15 подходов × ~2 мин = 30 минут

**Суперсеты для экономии времени:**
Суперсет = два упражнения подряд без отдыха (на разные мышцы)
Пример: жим лёжа + тяга в наклоне (грудь + спина)
Экономия: 30-40% времени при тех же результатах
Антагонистические суперсеты даже улучшают силу (Paz et al. 2017)

**Протокол EMOM (Every Minute On the Minute):**
Каждую минуту выполняете подход упражнения, остаток минуты — отдых
Пример: 20-минутный EMOM — чётные минуты: 8 приседаний, нечётные: 8 жимов
Очень эффективно по времени + кардиоэффект в бонус

**Тренировки в обеденный перерыв:**
Запас 40-50 минут: 5 мин переодевание + 30 мин тренировка + 5 мин душ
Держите сумку с формой на работе/в машине
Выбирайте зал рядом с работой (не с домом) — экономия на дорогу

**Утро vs вечер:**
Утро: тестостерон выше на 20-30%, меньше шансов пропустить, но сила на 5-10% ниже
Вечер: пиковая сила и гибкость, но выше шанс "устал после работы — пропущу"
Лучшее время — то, которое вы реально будете соблюдать

**Ключевой принцип:**
30 минут 3 раза в неделю > идеальная 90-минутная программа, на которую вы забьёте через 2 недели
Консистентность важнее оптимальности. Лучшая программа — та, которую вы выполняете.
`;
}
export function getRestPauseSets(message: string): string {
  const kw = ['рест-пауз', 'rest pause', 'отдых-пауза'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Рест-пауз сеты — протокол для максимальной интенсивности:**

**Протокол выполнения:**
1. Выполните подход до отказа (обычно 6-10 повторений)
2. Отдых 10-15 секунд (гриф на стойках, руки опущены)
3. Продолжите до отказа снова (обычно 2-4 повторения)
4. Повторите ещё 1-2 раза (всего 2-3 мини-подхода после основного)
Итого: один "расширенный" подход вместо нескольких обычных

**Преимущества:**
На 20-30% больше повторений за один подход по сравнению с обычным подходом до отказа
Максимальное рекрутирование мышечных волокон (все моторные единицы включены)
Высокий метаболический стресс — один из ключевых факторов гипертрофии

**Для каких упражнений:**
Лучше всего: изолирующие упражнения (разгибания ног, сведение в кроссовере, подъёмы на бицепс)
С осторожностью: базовые упражнения (жим лёжа — нужен страхующий)
НЕ рекомендуется: становая тяга, приседания со штангой (слишком высокий риск травмы при отказе)

**Программирование:**
1-2 упражнения за тренировку в формате рест-пауз (не больше — слишком утомительно)
Используйте в последнем подходе упражнения для финального "добивания"
Не используйте каждую тренировку — 2-3 раза в неделю максимум
`;
}
export function getClusterSetsAdv(message: string): string {
  const kw = ['кластерные сеты', 'cluster sets', 'интрасет отдых'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Кластерные сеты — больше нагрузки с меньшей усталостью:**

**Протокол:**
Вместо 1 подхода × 5 повторений → делаете 5 × 1 повторение с 20-30 секундами отдыха между ними
Пример: присед 120 кг — 1 повтор, отдых 20с, 1 повтор, отдых 20с... × 5
Это один "кластерный сет". Между кластерами отдых 2-3 минуты.

**Преимущества:**
Больше общая нагрузка (tonnage) за тренировку при том же или меньшем утомлении
Каждое повторение выполняется с максимальной скоростью и техникой
Меньше накопленной усталости → меньше деградации техники

**Когда использовать:**
Для развития СИЛЫ (не гипертрофии — для гипертрофии нужен метаболический стресс)
Идеально для тяжёлоатлетических движений (рывок, толчок, подъём на грудь)
Хорошо для приседаний и становой тяги при работе с весами >85% от 1RM

**Программирование:**
3-5 кластерных сетов по 3-5 повторений (с 20-30с паузами)
Вес: 80-90% от 1RM
Отдых между кластерами: 2-3 минуты
Частота: 1-2 раза в неделю для конкретного упражнения
`;
}
export function getMechanicalDropSetsAdv(message: string): string {
  const kw = ['механический дроп-сет', 'mechanical drop set'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Механические дроп-сеты — смена позиции вместо снижения веса:**

**Концепция:**
В обычном дроп-сете вы снижаете вес. В механическом — меняете угол/хват на более выгодный
Это позволяет продолжать работу с ТЕМ ЖЕ весом, но в более сильной позиции
Мышца остаётся под постоянным напряжением без пауз

**Примеры механических дроп-сетов:**

Грудь: жим на наклонной → жим на горизонтальной → жим на наклонной вниз (decline)
Спина: подтягивания узким хватом → средним → широким
Бицепс: сгибания сидя на наклонной → стоя → с читингом
Плечи: подъёмы перед собой → в стороны → тяга к подбородку
Трицепс: разгибания из-за головы → жим узким хватом → отжимания от скамьи

**Правила выполнения:**
3 позиции в одном сете (от самой слабой к самой сильной)
Без отдыха между сменами позиций (максимум 5 секунд на переход)
В каждой позиции работайте до отказа или околоотказного состояния
1-2 механических дроп-сета на группу мышц — достаточно

**Преимущества:**
Сохранение нагрузки (не нужно снижать вес — экономия времени)
Полная проработка мышцы во всех диапазонах движения
Экстремальный пампинг и метаболический стресс
`;
}
export function getGiantSets(message: string): string {
  const kw = ['гигантские сеты', 'giant sets', '4 упражнения подряд'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Гигантские сеты — 4+ упражнения подряд на одну группу мышц:**

**Определение:**
Суперсет = 2 упражнения, трисет = 3, гигантский сет = 4 и более упражнений подряд
Все упражнения на одну мышечную группу, без отдыха между ними
Отдых 2-3 минуты ПОСЛЕ завершения полного круга

**Пример — грудь (giant set):**
1. Жим штанги лёжа × 8-10 (тяжёлое базовое)
2. Разводка гантелей × 10-12 (растяжение)
3. Отжимания от пола × до отказа (собственный вес)
4. Сведение в кроссовере × 12-15 (пиковое сокращение)
→ отдых 2-3 мин → повторить 3 раза

**Пример — спина (giant set):**
1. Подтягивания × 6-8
2. Тяга штанги в наклоне × 8-10
3. Тяга гантели одной рукой × 10-12
4. Пулловер × 12-15
→ отдых 2-3 мин → повторить 3 раза

**Преимущества:**
Высочайший метаболический стресс (пампинг, молочная кислота)
Экономия времени: 40-минутная тренировка даёт объём 60-минутной
Разнообразие стимулов в одном сете (разные углы, типы нагрузки)

**Ограничения:**
Сила падает от упражнения к упражнению (это нормально — начинайте с самого тяжёлого)
Не для новичков — требуется опыт и кондиция
Не для максимальной силы — это инструмент гипертрофии и выносливости
Логистика: нужно занять 4 снаряда одновременно (может быть проблемой в зале)
`;
}
export function getEccentricTrainingAdv(message: string): string {
  const kw = ['эксцентрическая тренировка', 'негативы', 'eccentric training', 'негативные повторения'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Эксцентрическая тренировка — сила негативной фазы:**

**Научная основа:**
Мышца способна генерировать на 40% больше силы в эксцентрической фазе (опускание) чем в концентрической (подъём)
Эксцентрика вызывает наибольшее повреждение мышечных волокон → сильнейший стимул к росту
Именно эксцентрическая фаза отвечает за основной DOMS (крепатуру)

**Методы эксцентрической тренировки:**

1. Медленные негативы (tempo eccentrics):
Опускание веса за 3-5 секунд вместо обычных 1-2
Используйте рабочий вес (70-80% 1RM)
Пример: жим лёжа — опускаете штангу 4 секунды, жмёте обычно

2. Супрамаксимальные негативы:
Вес 105-120% от вашего 1RM (больше, чем можете поднять!)
Партнёр помогает поднять вес, вы медленно (5-6 сек) опускаете ОДИН
2-3 повторения максимум. ОБЯЗАТЕЛЬНО нужен опытный страхующий!

3. Негативные подтягивания:
Запрыгните в верхнюю точку → медленно (5 сек) опуститесь вниз
Отличный способ научиться подтягиваться, если пока не можете

**Программирование:**
Ограничьте 1-2 упражнениями с акцентом на эксцентрику за тренировку
DOMS будет значительно сильнее обычного — планируйте восстановление
Частота: не чаще 1 раза в неделю для одной группы мышц
Отличный инструмент для преодоления плато в силе

**Предупреждения:**
Высокий риск травмы при неправильном выполнении (особенно супрамаксимальные)
Не для новичков (минимум 6 месяцев тренировочного опыта)
Значительная крепатура на 48-72 часа — не планируйте тяжёлые тренировки на следующий день
`;
}
export function getTempoTrainingAdv(message: string): string {
  const kw = ['темповые тренировки', 'контролируемый темп', '4010 темп'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Темповые тренировки — контроль каждой фазы повторения:**

**Нотация ECPA (4 цифры):**
E — Eccentric (эксцентрическая фаза, опускание)
C — Concentric (концентрическая фаза, подъём)
P — Pause at bottom (пауза в нижней точке)
A — At top (пауза в верхней точке)
Пример: 4010 = 4 сек опускание, 0 пауза внизу, 1 сек подъём, 0 пауза вверху

**Популярные темпы и их назначение:**

4010 — гипертрофия:
Медленное опускание увеличивает время под напряжением (TUT)
Отлично для изоляции и "чувства мышцы"
TUT за подход: ~40-50 секунд (оптимально для роста)

3110 — сила + контроль:
Контролируемое опускание, пауза внизу убирает инерцию
Хорош для базовых упражнений (жим, присед)
Учит генерировать силу из мёртвой точки

5010 — эксцентрический акцент:
Очень медленное опускание (5 сек) — максимальное повреждение волокон
Используйте для специализации или преодоления плато
Снизьте рабочий вес на 15-20% от обычного

2010 — стандартный:
Естественный ритм без осознанного контроля
Подходит для силовой работы с тяжёлыми весами (>85% 1RM)
Фокус на мощности, а не на TUT

**Почему темп важен:**
Время под напряжением (TUT): 40-70 сек за подход — оптимально для гипертрофии
Mind-muscle connection: медленный темп заставляет фокусироваться на целевой мышце
Честные повторения: медленный темп убирает читинг и инерцию
Контроль прогрессии: увеличение TUT — форма прогрессивной перегрузки (не только вес!)

**Практическое применение:**
Начните с 3010 для всех упражнений (научитесь контролировать темп)
Для отстающих мышц: 4010-5010 (больше TUT → больше стимул)
Не используйте медленный темп для взрывных движений (рывок, толчок, прыжки)
`;
}
export function getUnilateralTrainingAdv(message: string): string {
  const kw = ['односторонние упражнения', 'унилатеральные', 'одной рукой', 'одной ногой'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Унилатеральная (односторонняя) тренировка — исправление дисбалансов:**

**Преимущества:**
Выявление и исправление мышечных дисбалансов (у 90% людей одна сторона сильнее)
Повышенная активация кора (стабилизация тела при работе одной стороной)
Профилактика травм (симметричное развитие = меньше компенсаций)
Нейромышечная координация: каждая сторона учится работать самостоятельно
Дефицит двусторонней силы: сумма односторонних часто > двустороннего максимума

**Ключевые упражнения:**

Ноги:
Болгарские сплит-приседания — №1 унилатеральное упражнение для ног
Румынская тяга на одной ноге — баланс + задняя цепь
Выпады (шагающие, обратные, боковые)
Жим ногами одной ногой

Верх тела:
Жим гантели одной рукой (лёжа или стоя) — грудь/плечи + стабилизация
Тяга гантели в наклоне одной рукой — классика для спины
Подъём на бицепс одной рукой — контроль и концентрация
Разгибание на трицепс одной рукой

**Правила программирования:**
ВСЕГДА начинайте со слабой (нетренированной) стороны
Выполняйте одинаковое количество повторений на обе стороны (равняйтесь по слабой)
Не добавляйте дополнительные подходы для сильной стороны
Дисбаланс >15-20% — фокусируйтесь на унилатеральной работе до выравнивания

**Программирование:**
Включайте 2-3 унилатеральных упражнения в каждую тренировку
Можно чередовать: одна тренировка двусторонняя, другая унилатеральная
Используйте унилатеральные упражнения как "вспомогательные" после основных базовых
`;
}
export function getCompetitionPreparation(message: string): string {
  const kw = ['подготовка к соревнованиям подробно', 'пик формы', 'тейпер перед соревнованием'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Подготовка к соревнованиям — выход на пик формы:**

**Периодизация подготовки (12-16 недель):**

Недели 12-8: базовый блок (накопление)
Высокий объём (70-80% от 1RM), 4-5 тренировок в неделю
Наращивание общей силовой базы и мышечной массы
GPP (общая физическая подготовка): кардио, работа над слабыми местами

Недели 8-4: силовой блок (интенсификация)
Увеличение интенсивности (80-90%), снижение объёма на 20-30%
Работа в соревновательных движениях, оттачивание техники
Начало попыток с около-максимальными весами (90-95%)

Недели 4-1: пиковый блок (реализация)
Максимальная интенсивность (90-100%), минимальный объём
Тейпер: снижение объёма на 40-60%, но СОХРАНЕНИЕ интенсивности
Последняя тяжёлая тренировка: 7-10 дней до соревнований
Последняя неделя: лёгкие разминочные сессии, отработка комманд/процедур

**Водно-солевая манипуляция (для весовых категорий):**
За 7 дней: повышенное потребление воды (7-8 литров/день)
За 3 дня: постепенное снижение воды (5л → 3л → 1л)
За 1 день: минимальная вода, ограничение натрия
ВНИМАНИЕ: опасно без опыта, используйте только под руководством тренера
После взвешивания: агрессивное восстановление (электролиты, углеводы, вода)

**Углеводная загрузка:**
За 3 дня до соревнований: увеличить углеводы до 8-10 г/кг
Цель: максимальное заполнение гликогеновых депо
Продукты: рис, картофель, макароны (проверенные, привычные!)

**Питание в день соревнований:**
За 3-4 часа: привычный приём пищи (белок + углеводы, без экспериментов!)
За 1-2 часа: лёгкий перекус (банан, энергетический батончик)
Между попытками: глоток воды, несколько глотков спортивного напитка
Кофеин: 3-5 мг/кг за 30-45 минут до первого выхода

**Разминка в день соревнований:**
Общая: 10-15 минут (велосипед, лёгкий бег)
Специальная: разминочные подходы в соревновательном движении
Последний разминочный подход: 85-90% от первой попытки (за 15-20 минут до выхода)
НЕ выкладывайтесь на разминке — сохраняйте силы для помоста

**Ментальная подготовка:**
Визуализация: представляйте успешное выполнение подходов каждый вечер за 2 недели до старта
Рутина: выработайте ритуал перед подходом (дыхание, хлопок, настройка)
План Б: если первый подход не пошёл — не паникуйте, следуйте стратегии
`;
}
export function getTrainingWhileSick(message: string): string {
  const kw = ['тренировки при болезни', 'можно ли тренироваться с простудой', 'тренировка при температуре'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки при болезни — когда можно, когда нельзя:**

**"Правило шеи" (Neck Check Rule):**

Симптомы ВЫШЕ шеи (лёгкая тренировка допустима):
Насморк, заложенность носа
Лёгкая боль в горле
Чихание
Лёгкая головная боль
→ Можно: лёгкая тренировка (50-60% интенсивности), ходьба, растяжка
→ Избегайте: тяжёлых весов, HIIT, длительного кардио

Симптомы НИЖЕ шеи (ПОЛНЫЙ ОТДЫХ):
Кашель (особенно глубокий, грудной)
Боль в мышцах/суставах (не DOMS)
Температура ≥37.5°C — АБСОЛЮТНОЕ противопоказание к тренировкам!
Расстройство желудка, тошнота
Одышка, боль в груди
→ НЕЛЬЗЯ тренироваться. Тренировка при температуре может привести к миокардиту (воспаление сердца!)

**Иммунное "окно" после интенсивной тренировки:**
После тяжёлой тренировки иммунитет подавлен на 2-6 часов ("open window" theory)
В это время вы более уязвимы к инфекциям
Профилактика: не переохлаждайтесь после тренировки, мойте руки, витамин C

**Протокол возвращения после болезни:**
День 1-3: начните с 50% от привычной нагрузки (и по весу, и по объёму)
День 4-6: увеличьте до 70-80%
День 7+: возвращение к обычному режиму
Не пытайтесь "нагнать" пропущенное — организм ещё восстанавливается

**Поддержка иммунитета:**
Витамин C: 500-1000 мг/день (особенно в сезон ОРВИ)
Цинк: 15-30 мг/день при первых признаках простуды
Витамин D: 2000-4000 МЕ/день (дефицит = слабый иммунитет)
Сон: 8-10 часов во время болезни (самое эффективное лекарство)
Куриный бульон — не просто "бабушкин рецепт", реально снижает воспаление (Rennard et al. 2000)
`;
}
