/**
 * knowledge-topics/misc.ts — auto-split from knowledgeHelpers.ts
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

export function detectPendingFollowups(history: Array<{ role: string; content: string | null }>): string[] {
  const followups: string[] = [];

  // Scan last 3 AI messages for unanswered questions
  const recentAiMessages = history
    .filter((m) => m.role === 'assistant' && m.content)
    .slice(-3);

  const recentUserMessages = history
    .filter((m) => m.role === 'user' && m.content)
    .slice(-3)
    .map((m) => (m.content || '').toLowerCase());

  for (const aiMsg of recentAiMessages) {
    const content = aiMsg.content || '';

    // Detect questions AI asked
    const questions = content.match(/[^.!?\n]*\?/g) || [];
    for (const q of questions) {
      const cleanQ = q.trim().toLowerCase();
      // Skip rhetorical questions
      if (cleanQ.includes('хочешь') || cleanQ.includes('хотите') || cleanQ.length < 15) continue;

      // Check if user answered this question in subsequent messages
      const keyWords = cleanQ
        .replace(/[?.,!]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 3);

      const wasAnswered = recentUserMessages.some((userMsg) =>
        keyWords.some((kw) => userMsg.includes(kw))
      );

      if (!wasAnswered) {
        followups.push(q.trim());
      }
    }
  }

  return followups.slice(0, 2); // max 2 pending follow-ups
}
export const BORING_OPENINGS = [
  /^(конечно|разумеется|безусловно|отличный вопрос|хороший вопрос|отличное решение|ок,?\s*давай)/i,
  /^(здравствуйте|добрый день),?\s*(рад|приятно)/i,
  /^(я\s*(бы\s*)?рекомендовал|позвольте\s*мне)/i,
  /^(как\s*ваш\s*(персональный\s*)?тренер)/i,
];

export const GENERIC_PHRASES = [
  /важно\s*помнить,?\s*что/gi,
  /не\s*забывайте?\s*,?\s*что/gi,
  /стоит\s*отметить,?\s*что/gi,
  /в\s*первую\s*очередь/gi,
  /давайте?\s*разберёмся/gi,
  /хочу\s*подчеркнуть/gi,
];

export function buildAntiPatternDirective(history: Array<{ role: string; content: string | null }>): string {
  // Check if AI has been repeating openings
  const lastAiMessages = history
    .filter((m) => m.role === 'assistant' && m.content)
    .slice(-3)
    .map((m) => m.content!);

  if (lastAiMessages.length < 2) return '';

  // Detect repeated first words/phrases
  const firstPhrases = lastAiMessages.map((msg) => {
    const firstLine = msg.split('\n')[0].trim().toLowerCase();
    return firstLine.split(/\s+/).slice(0, 3).join(' ');
  });

  const hasDuplicateOpening = new Set(firstPhrases).size < firstPhrases.length;

  const directives: string[] = [];

  if (hasDuplicateOpening) {
    directives.push('⚠️ РАЗНООБРАЗИЕ: Ты повторяешь одинаковые начала ответов. Начни ответ по-другому — сразу с сути, числа, действия или наблюдения из данных.');
  }

  // Check for generic filler phrases in last response
  const lastMsg = lastAiMessages[lastAiMessages.length - 1] || '';
  let genericCount = 0;
  for (const pattern of GENERIC_PHRASES) {
    if (pattern.test(lastMsg)) genericCount++;
    pattern.lastIndex = 0; // reset regex state
  }
  if (genericCount >= 2) {
    directives.push('⚠️ КОНКРЕТНОСТЬ: Предыдущий ответ содержал общие фразы-заполнители. Убери "важно помнить", "стоит отметить" и т.п. — сразу к фактам и числам.');
  }

  return directives.length > 0
    ? `\n\n## 🎯 КАЧЕСТВО ОТВЕТА\n${directives.join('\n')}`
    : '';
}
export const MUSCLE_GROUPS_LEGS = ['квадрицепс', 'ягодицы', 'бёдра-задние', 'икры'];
export interface MuscleBalanceResult {
  pushPullRatio: number; // ideal ~1.0
  upperLowerRatio: number; // ideal ~1.0-1.5
  neglectedMuscles: string[];
  overtrainedMuscles: string[];
  advice: string;
}
export function buildMuscleBalanceContext(balance: MuscleBalanceResult): string {
  if (!balance.advice) return '';

  return `\n## ⚖️ МЫШЕЧНЫЙ БАЛАНС (анализ за последние 2 недели)
Push/Pull: ${balance.pushPullRatio.toFixed(1)} (норма: ~1.0)
Верх/Низ: ${balance.upperLowerRatio.toFixed(1)} (норма: ~1.0-1.5)
${balance.advice}
→ Если пользователь спрашивает программу или упражнения — учти этот дисбаланс.`;
}
export interface GreetingContext {
  timeOfDay: string; // утро/день/вечер/ночь
  clientHour?: number; // client's local hour (0-23) for time-sensitive checks
  userName: string;
  daysSinceLastWorkout: number | null;
  lastWorkoutName: string | null;
  streak: number;
  scheduledToday: string | null;
  todayMealsCount: number;
  bodyWeightTrend: string | null; // 'up' | 'down' | 'stable' | null
  newPRs: string[];
  recoveryScore: number;
  deloadNeeded: boolean;
}
export function buildSmartGreetingDirective(ctx: GreetingContext): string {
  const lines: string[] = [];

  // Time-appropriate greeting
  const greetingMap: Record<string, string> = {
    'утро': `Доброе утро, ${ctx.userName}!`,
    'день': `Добрый день, ${ctx.userName}!`,
    'вечер': `Добрый вечер, ${ctx.userName}!`,
    'ночь': `${ctx.userName}, не поздновато для тренировки? 😄`,
  };
  lines.push(`Начни с приветствия: "${greetingMap[ctx.timeOfDay]}"`);

  // Last workout context
  if (ctx.daysSinceLastWorkout !== null) {
    if (ctx.daysSinceLastWorkout === 0) {
      lines.push(`Пользователь уже тренировался сегодня (${ctx.lastWorkoutName}). Похвали и спроси как самочувствие.`);
    } else if (ctx.daysSinceLastWorkout === 1) {
      lines.push(`Вчера была тренировка "${ctx.lastWorkoutName}". Спроси про восстановление или предложи следующую.`);
    } else if (ctx.daysSinceLastWorkout <= 3) {
      lines.push(`Последняя тренировка ${ctx.daysSinceLastWorkout} дня назад ("${ctx.lastWorkoutName}"). Мягко предложи тренировку.`);
    } else if (ctx.daysSinceLastWorkout <= 7) {
      lines.push(`Перерыв ${ctx.daysSinceLastWorkout} дней. Мотивируй вернуться, но без давления.`);
    } else {
      lines.push(`Долгий перерыв (${ctx.daysSinceLastWorkout} дней). Предложи лёгкую тренировку для возвращения в ритм.`);
    }
  }

  // Streak
  if (ctx.streak >= 7) {
    lines.push(`🔥 Серия ${ctx.streak} дней! Обязательно отметь это достижение.`);
  } else if (ctx.streak >= 3) {
    lines.push(`Серия ${ctx.streak} дней — хорошо, поддержи мотивацию.`);
  }

  // Scheduled workout today
  if (ctx.scheduledToday) {
    lines.push(`Сегодня запланирована тренировка "${ctx.scheduledToday}". Напомни и предложи начать.`);
  }

  // Nutrition check
  if (ctx.todayMealsCount === 0) {
    const hour = ctx.clientHour ?? new Date().getHours();
    if (hour >= 10) {
      lines.push(`Пользователь ещё не записал ни одного приёма пищи сегодня. Если уместно — напомни.`);
    }
  }

  // Body weight trend
  if (ctx.bodyWeightTrend === 'down') {
    lines.push(`Вес снижается — если цель похудение, похвали прогресс.`);
  } else if (ctx.bodyWeightTrend === 'up') {
    lines.push(`Вес растёт — если цель набор массы, отметь прогресс. Если похудение — деликатно предложи корректировку.`);
  }

  // New PRs
  if (ctx.newPRs.length > 0) {
    lines.push(`🎉 Недавние рекорды: ${ctx.newPRs.join(', ')}. Обязательно поздравь!`);
  }

  // Recovery warning
  if (ctx.recoveryScore < 50) {
    lines.push(`⚠️ Восстановление ${ctx.recoveryScore}% — предложи лёгкую тренировку или день отдыха.`);
  }

  // Deload
  if (ctx.deloadNeeded) {
    lines.push(`Нужна разгрузочная неделя — мягко предложи deload.`);
  }

  lines.push(`Будь кратким (3-5 предложений), дружелюбным и проактивным. НЕ перечисляй все пункты подряд — выбери 2-3 самых важных.`);

  return `\n\n## 🤝 ИНСТРУКЦИЯ ДЛЯ ПРИВЕТСТВИЯ\n${lines.join('\n')}`;
}
export interface DifficultyAdjustment {
  exerciseName: string;
  currentWeight: number;
  suggestedWeight: number;
  currentReps: number;
  suggestedReps: number;
  reason: string;
}
export function buildDifficultyContext(adjustments: DifficultyAdjustment[]): string {
  if (adjustments.length === 0) return '';

  const lines = adjustments.slice(0, 4).map((a) =>
    `- **${a.exerciseName}**: ${a.currentWeight}кг → ${a.suggestedWeight}кг (${a.reason})`
  );

  return `\n\n## ⚖️ РЕКОМЕНДАЦИИ ПО НАГРУЗКЕ (на основе последней тренировки)
${lines.join('\n')}
→ Если пользователь спрашивает про веса или программу — предложи эти корректировки.`;
}
export interface GoalProgress {
  goal: string;
  progressPercent: number;
  estimatedWeeksLeft: number | null;
  insight: string;
  onTrack: boolean;
}
export function buildGoalProgressContext(progress: GoalProgress | null): string {
  if (!progress) return '';

  return `\n\n## 🎯 ПРОГРЕСС К ЦЕЛИ: ${progress.goal.toUpperCase()}
Прогресс: ${progress.progressPercent}%${progress.estimatedWeeksLeft ? ` (~${progress.estimatedWeeksLeft} нед до цели)` : ''}
${progress.insight}
${progress.onTrack ? '✅ На верном пути' : '⚠️ Требуется корректировка'}
→ Используй при мотивации и корректировке программы/питания.`;
}
export function getSmartRestSuggestion(
  exerciseCategory: string, // strength, cardio, flexibility
  exerciseType: string, // barbell, dumbbell, machine, bodyweight
  setType: string, // normal, warmup, dropset, superset
  lastRpe: number | null,
  userGoal: string | null,
): { restSeconds: number; reason: string } {
  // Категория задаёт вилку отдыха раньше, чем снаряд: между подходами
  // растяжки не отдыхают две минуты, а между интервалами кардио — не по
  // силовым правилам. exerciseCategory приходила сюда и не использовалась,
  // так что планке назначались те же 90 секунд, что и жиму.
  if (exerciseCategory === 'flexibility') {
    return { restSeconds: 20, reason: 'Растяжка — 15-30 сек между подходами, дольше не нужно.' };
  }
  if (exerciseCategory === 'cardio') {
    const cardioRest = lastRpe !== null && lastRpe >= 9 ? 120 : 60;
    return { restSeconds: cardioRest, reason: `Кардио-интервал — ${cardioRest} сек, чтобы пульс успел опуститься.` };
  }

  // Base rest by exercise type
  let baseRest = 90;

  // Compound barbell exercises need more rest
  if (exerciseType === 'barbell') baseRest = 120;
  else if (exerciseType === 'machine') baseRest = 60;
  else if (exerciseType === 'bodyweight') baseRest = 60;
  else if (exerciseType === 'cable') baseRest = 60;

  // Adjust by set type
  if (setType === 'warmup') return { restSeconds: 60, reason: 'Разминочный подход — 60 сек достаточно.' };
  if (setType === 'dropset') return { restSeconds: 15, reason: 'Дроп-сет — минимальный отдых (10-15 сек) для максимального пампинга.' };
  if (setType === 'superset') return { restSeconds: 30, reason: 'Суперсет — 30 сек между упражнениями, 90 сек между кругами.' };

  // Adjust by goal
  if (userGoal === 'STRENGTH') {
    baseRest = Math.max(baseRest, 180); // 3+ min for strength
  } else if (userGoal === 'MUSCLE_GAIN') {
    baseRest = Math.min(baseRest, 90); // 60-90s hypertrophy
  } else if (userGoal === 'WEIGHT_LOSS') {
    baseRest = Math.min(baseRest, 60); // shorter rest for caloric burn
  } else if (userGoal === 'ENDURANCE') {
    baseRest = Math.min(baseRest, 45);
  }

  // Adjust by RPE (fatigue)
  if (lastRpe !== null) {
    if (lastRpe >= 9) baseRest += 60; // very hard — need extra recovery
    else if (lastRpe >= 8) baseRest += 30;
  }

  let reason = '';
  if (userGoal === 'STRENGTH') reason = `Силовая цель — длинный отдых (${baseRest} сек) для полного восстановления АТФ.`;
  else if (userGoal === 'MUSCLE_GAIN') reason = `Гипертрофия — ${baseRest} сек для оптимального метаболического стресса.`;
  else if (userGoal === 'WEIGHT_LOSS') reason = `Жиросжигание — ${baseRest} сек для поддержания ЧСС.`;
  else reason = `Рекомендуемый отдых: ${baseRest} сек.`;

  return { restSeconds: baseRest, reason };
}
export function buildRestTimerContext(
  userGoal: string | null,
  exerciseTypes: string[], // types from current program
): string {
  if (!userGoal || exerciseTypes.length === 0) return '';

  // Generate general recommendations
  const recommendations: string[] = [];

  const barbellRest = getSmartRestSuggestion('strength', 'barbell', 'normal', null, userGoal);
  const machineRest = getSmartRestSuggestion('strength', 'machine', 'normal', null, userGoal);

  if (barbellRest.restSeconds !== machineRest.restSeconds) {
    recommendations.push(`Базовые (штанга): ${barbellRest.restSeconds} сек — ${barbellRest.reason}`);
    recommendations.push(`Изоляция (тренажёры): ${machineRest.restSeconds} сек — ${machineRest.reason}`);
  } else {
    recommendations.push(`Стандартный отдых: ${barbellRest.restSeconds} сек — ${barbellRest.reason}`);
  }

  if (userGoal === 'STRENGTH') {
    recommendations.push('При RPE 9+ — добавь ещё 60 сек для восстановления.');
  }

  return `\n\n## ⏱ РЕКОМЕНДАЦИИ ПО ОТДЫХУ
${recommendations.join('\n')}
→ Предлагай персонализированное время отдыха при обсуждении тренировок.`;
}
export function validateAIResponse(response: string, intent: string): { cleaned: string; warnings: string[] } {
  let cleaned = response;
  const warnings: string[] = [];

  // Remove excessive emoji (more than 8 per response)
  const emojiCount = (cleaned.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length;
  if (emojiCount > 8) {
    warnings.push('excessive_emoji');
    // Remove emojis beyond first 5
    let count = 0;
    cleaned = cleaned.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, (match) => {
      count++;
      return count <= 5 ? match : '';
    });
  }

  // Remove English text blocks (AI sometimes responds in English)
  const englishPattern = /^[A-Za-z\s,.!?:;'"()-]{50,}$/m;
  if (englishPattern.test(cleaned) && intent !== 'technique_question') {
    warnings.push('english_detected');
  }

  // Ensure response isn't too short for important intents
  if (cleaned.length < 30 && !['greeting'].includes(intent)) {
    warnings.push('too_short');
  }

  // Ensure response isn't absurdly long — limit varies by intent
  // Align char limits with per-intent token budgets
  const maxLen = intent === 'program_creation' ? 8000
    : intent === 'general' ? 6000
    : ['analytics_query', 'nutrition_query', 'workout_modify', 'technique_question', 'complaint'].includes(intent) ? 5000
    : 3000;
  if (cleaned.length > maxLen) {
    warnings.push('too_long');
    const trimPoint = cleaned.lastIndexOf('.', maxLen - 200);
    if (trimPoint > maxLen * 0.5) {
      cleaned = cleaned.substring(0, trimPoint + 1);
    }
  }

  // Remove repeated paragraphs/lines (line-level to preserve markdown structure)
  const hasMarkdown = /^#{1,3}\s|^\s*[-*+]\s|^\s*\d+\.\s|\*\*|__|```/m.test(cleaned);
  if (!hasMarkdown) {
    const sentences = cleaned.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of sentences) {
      const normalized = s.toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(s);
      }
    }
    if (unique.length < sentences.length) {
      warnings.push('duplicates_removed');
      cleaned = unique.join('. ') + '.';
    }
  }

  return { cleaned, warnings };
}
export function buildIntensityZoneContext(
  userGoal: string | null,
  currentPhase: string, // from periodization
  avgRpe: number | null,
): string {
  if (!userGoal) return '';

  interface Zone {
    name: string;
    rpeRange: string;
    percentRM: string;
    purpose: string;
  }

  const zones: Zone[] = [
    { name: 'Лёгкая', rpeRange: '4-5', percentRM: '50-65%', purpose: 'Разминка, техника, активное восстановление' },
    { name: 'Умеренная', rpeRange: '6-7', percentRM: '65-75%', purpose: 'Объёмная работа, гипертрофия, выносливость' },
    { name: 'Тяжёлая', rpeRange: '8-9', percentRM: '75-90%', purpose: 'Сила, мышечный рост, прогрессия' },
    { name: 'Максимальная', rpeRange: '9.5-10', percentRM: '90-100%', purpose: 'Пиковая сила, тестирование 1ПМ' },
  ];

  let targetZone: string;
  let distribution: string;

  if (currentPhase === 'accumulation') {
    targetZone = 'Умеренная-Тяжёлая (RPE 6-8)';
    distribution = '60% умеренная, 30% тяжёлая, 10% лёгкая';
  } else if (currentPhase === 'intensification') {
    targetZone = 'Тяжёлая (RPE 8-9)';
    distribution = '20% умеренная, 60% тяжёлая, 20% максимальная';
  } else if (currentPhase === 'deload') {
    targetZone = 'Лёгкая-Умеренная (RPE 4-6)';
    distribution = '60% лёгкая, 40% умеренная';
  } else {
    // Default based on goal
    if (userGoal === 'STRENGTH') {
      targetZone = 'Тяжёлая (RPE 7-9)';
      distribution = '30% умеренная, 60% тяжёлая, 10% максимальная';
    } else if (userGoal === 'MUSCLE_GAIN') {
      targetZone = 'Умеренная-Тяжёлая (RPE 7-8)';
      distribution = '20% лёгкая, 50% умеренная, 30% тяжёлая';
    } else if (userGoal === 'WEIGHT_LOSS') {
      targetZone = 'Умеренная (RPE 6-7)';
      distribution = '30% лёгкая, 60% умеренная, 10% тяжёлая';
    } else {
      targetZone = 'Умеренная (RPE 6-8)';
      distribution = '20% лёгкая, 60% умеренная, 20% тяжёлая';
    }
  }

  let rpeWarning = '';
  if (avgRpe !== null) {
    if (avgRpe >= 9 && currentPhase !== 'intensification') {
      rpeWarning = `\n⚠️ Средний RPE ${avgRpe} — слишком высокий для текущей фазы. Снизь интенсивность.`;
    } else if (avgRpe < 6 && currentPhase !== 'deload') {
      rpeWarning = `\n💡 Средний RPE ${avgRpe} — можно работать тяжелее для лучшего прогресса.`;
    }
  }

  return `\n\n## 🎚 ЗОНЫ ИНТЕНСИВНОСТИ
Целевая зона: ${targetZone}
Распределение: ${distribution}${rpeWarning}
→ Используй при программировании нагрузки и ответах о весах.`;
}
export interface ContextSection {
  name: string;
  content: string;
  relevantIntents: Set<string>;
  priority: number; // 1 = always include, 2 = include if relevant, 3 = include if space allows
}
export function optimizeContext(
  sections: ContextSection[],
  intent: string,
  maxTokenEstimate: number,
): string[] {
  // Sort by priority, then by relevance
  const scored = sections.map((s) => ({
    ...s,
    score: s.priority * 10 + (s.relevantIntents.has(intent) || s.relevantIntents.has('*') ? 100 : 0),
  }));

  scored.sort((a, b) => b.score - a.score);

  const included: string[] = [];
  let totalTokens = 0;

  for (const section of scored) {
    if (!section.content) continue;
    const sectionTokens = Math.ceil(section.content.length / 3.5); // rough estimate

    if (totalTokens + sectionTokens > maxTokenEstimate) {
      // Skip low-priority sections if over budget
      if (section.priority >= 3) continue;
    }

    included.push(section.content);
    totalTokens += sectionTokens;
  }

  return included;
}
export function predictNextPR(
  overloadData: Array<{ exercise: string; status: string; lastWeights: number[]; suggestion: string }>,
): string {
  if (overloadData.length === 0) return '';

  const predictions: string[] = [];

  for (const ex of overloadData) {
    if (ex.status !== 'progressing' || ex.lastWeights.length < 3) continue;

    // Calculate weekly weight progression rate
    const weights = ex.lastWeights;
    const weeklyGain = (weights[weights.length - 1] - weights[0]) / Math.max(weights.length - 1, 1);

    if (weeklyGain <= 0) continue;

    const currentMax = weights[weights.length - 1];
    // Predict next milestone (round up to next 5kg)
    const nextMilestone = Math.ceil(currentMax / 5) * 5;
    if (nextMilestone <= currentMax) continue;

    const weeksToMilestone = Math.ceil((nextMilestone - currentMax) / weeklyGain);

    if (weeksToMilestone <= 8) {
      predictions.push(`📈 ${ex.exercise}: текущий макс ~${currentMax}кг → ${nextMilestone}кг через ~${weeksToMilestone} ${weeksToMilestone === 1 ? 'неделю' : weeksToMilestone < 5 ? 'недели' : 'недель'}`);
    }
  }

  if (predictions.length === 0) return '';

  return `\n\n## 🎯 ПРОГНОЗ РЕКОРДОВ
${predictions.slice(0, 3).join('\n')}
→ Мотивируй: «До нового рекорда осталось совсем немного!»`;
}
export function detectGoalConflicts(
  userGoal: string | null,
  bodyWeightTrend: 'up' | 'down' | 'stable' | null,
  avgCalories: number | null,
  trainingFocus: 'strength' | 'hypertrophy' | 'cardio' | 'mixed' | null,
): string {
  if (!userGoal) return '';

  const conflicts: string[] = [];

  if (userGoal === 'WEIGHT_LOSS') {
    if (bodyWeightTrend === 'up') {
      conflicts.push('⚠️ Цель: похудение, но вес растёт. Проверь дефицит калорий — возможно, слишком много калорий.');
    }
    if (avgCalories && avgCalories > 2500) {
      conflicts.push('⚠️ Цель: похудение, но среднее потребление ~' + Math.round(avgCalories) + ' ккал — многовато для дефицита.');
    }
    if (trainingFocus === 'strength') {
      conflicts.push('💡 Цель: похудение, но фокус на силу. Добавь кардио и увеличь объём (больше повторений, меньше отдых).');
    }
  }

  if (userGoal === 'MUSCLE_GAIN') {
    if (bodyWeightTrend === 'down') {
      conflicts.push('⚠️ Цель: набор массы, но вес снижается. Увеличь калорийность на 300-500 ккал.');
    }
    if (avgCalories && avgCalories < 1800) {
      conflicts.push('⚠️ Цель: набор массы, но среднее ~' + Math.round(avgCalories) + ' ккал — слишком мало для роста.');
    }
    if (trainingFocus === 'cardio') {
      conflicts.push('💡 Цель: набор массы, но много кардио. Фокусируйся на силовых, кардио — 2-3 раза в неделю по 20 мин.');
    }
  }

  if (userGoal === 'STRENGTH') {
    if (trainingFocus === 'hypertrophy') {
      conflicts.push('💡 Цель: сила, но тренировки в стиле гипертрофии (10-15 повторений). Переходи на 3-6 повторений с тяжёлыми весами.');
    }
  }

  if (conflicts.length === 0) return '';

  return `\n\n## 🎯 КОНФЛИКТЫ ЦЕЛИ И ДЕЙСТВИЙ
${conflicts.join('\n')}
→ Деликатно укажи на противоречия и предложи конкретные корректировки.`;
}
export function buildLanguageEnforcer(recentMessages: Array<{ role: string; content: string }>): string {
  // Check if recent AI responses contained English
  const recentAI = recentMessages.filter((m) => m.role === 'assistant').slice(-3);
  const hasEnglish = recentAI.some((m) => {
    const englishWords = (m.content.match(/\b[a-zA-Z]{4,}\b/g) || []).filter(
      (w) => !['push', 'pull', 'legs', 'full', 'body', 'upper', 'lower', 'rpe', 'rir',
        'bcaa', 'eaa', 'met', 'epoc', 'dup', 'amrap', 'emom', 'hiit', 'drop', 'super',
        'set', 'rep', 'max', 'bmi', 'acwr', 'deload', 'rest', 'pause', 'split'].includes(w.toLowerCase())
    );
    return englishWords.length > 5;
  });

  if (hasEnglish) {
    return '\n\n⚠️ КРИТИЧНО: В предыдущих ответах замечен английский текст. СТРОГО отвечай ТОЛЬКО на русском языке. Англоязычные термины (RPE, AMRAP, HIIT, etc.) допустимы, но предложения и объяснения — ТОЛЬКО по-русски.';
  }

  return '';
}
export function identifyWeakPoints(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { primaryMuscles: string[] };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Calculate volume per muscle group
  const muscleVolume: Record<string, number> = {};
  const muscleFrequency: Record<string, number> = {};

  for (const w of recentWorkouts) {
    const musclesThisWorkout = new Set<string>();
    for (const ex of w.exercises) {
      for (const muscle of ex.exercise?.primaryMuscles ?? []) {
        const vol = ex.sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
        muscleVolume[muscle] = (muscleVolume[muscle] || 0) + vol;
        musclesThisWorkout.add(muscle);
      }
    }
    for (const m of musclesThisWorkout) {
      muscleFrequency[m] = (muscleFrequency[m] || 0) + 1;
    }
  }

  if (Object.keys(muscleVolume).length < 3) return '';

  const totalVolume = Object.values(muscleVolume).reduce((a, b) => a + b, 0);
  const avgVolume = totalVolume / Object.keys(muscleVolume).length;

  // Find significantly undertrained muscles
  const weak = Object.entries(muscleVolume)
    .filter(([, vol]) => vol < avgVolume * 0.4)
    .map(([muscle, vol]) => ({
      muscle,
      volume: vol,
      pct: Math.round((vol / avgVolume) * 100),
      frequency: muscleFrequency[muscle] || 0,
    }))
    .sort((a, b) => a.pct - b.pct);

  // Find important neglected muscle groups
  const importantMuscles = ['quadriceps', 'hamstrings', 'glutes', 'back', 'chest', 'shoulders'];
  const neglected = importantMuscles.filter((m) => !muscleVolume[m] || muscleVolume[m] < avgVolume * 0.2);

  const lines: string[] = [];

  if (weak.length > 0) {
    lines.push(`📉 Отстающие мышцы: ${weak.slice(0, 3).map((w) => `${w.muscle} (${w.pct}% от среднего)`).join(', ')}`);
  }

  if (neglected.length > 0) {
    const muscleNames: Record<string, string> = {
      quadriceps: 'квадрицепсы', hamstrings: 'задняя поверхность бедра', glutes: 'ягодицы',
      back: 'спина', chest: 'грудь', shoulders: 'плечи',
    };
    lines.push(`⚠️ Почти не тренируются: ${neglected.map((m) => muscleNames[m] || m).join(', ')}`);
  }

  if (lines.length === 0) return '';

  return `\n\n## 🔍 СЛАБЫЕ МЕСТА
${lines.join('\n')}
→ Предложи добавить упражнения на отстающие группы мышц. Баланс важен для здоровья и эстетики.`;
}
export function buildSubstitutionMap(
  healthRestrictions: Array<{ bodyPart: string; severity: string }>,
): string {
  if (healthRestrictions.length === 0) return '';

  const substitutions: Record<string, Array<{ from: string; to: string; reason: string }>> = {
    'колено': [
      { from: 'Приседания со штангой', to: 'Жим ногами (ограниченная амплитуда)', reason: 'меньше нагрузки на коленный сустав' },
      { from: 'Выпады', to: 'Ягодичный мост со штангой', reason: 'нагрузка на ягодицы без давления на колено' },
      { from: 'Разгибание ног', to: 'Сгибание ног лёжа', reason: 'изолируем заднюю поверхность, щадим колено' },
    ],
    'knee': [
      { from: 'Приседания со штангой', to: 'Жим ногами (ограниченная амплитуда)', reason: 'меньше нагрузки на коленный сустав' },
    ],
    'плечо': [
      { from: 'Жим штанги стоя', to: 'Жим гантелей сидя (нейтральный хват)', reason: 'меньше нагрузки на вращательную манжету' },
      { from: 'Жим лёжа (широкий хват)', to: 'Жим лёжа узким хватом или на наклонной', reason: 'снижает нагрузку на плечевой сустав' },
      { from: 'Тяга к подбородку', to: 'Махи гантелей в стороны', reason: 'без внутренней ротации плеча' },
    ],
    'shoulder': [
      { from: 'Жим штанги стоя', to: 'Жим гантелей сидя (нейтральный хват)', reason: 'меньше нагрузки на вращательную манжету' },
    ],
    'спина': [
      { from: 'Становая тяга', to: 'Тяга в тренажёре / тяга блока', reason: 'контролируемая нагрузка без осевого давления' },
      { from: 'Тяга штанги в наклоне', to: 'Тяга одной рукой с упором', reason: 'можно контролировать положение спины' },
    ],
    'поясница': [
      { from: 'Становая тяга', to: 'Румынская тяга с гантелями (лёгкий вес)', reason: 'укрепляет поясницу без критической нагрузки' },
      { from: 'Приседания со штангой на спине', to: 'Приседания в Смите / Гоблет присед', reason: 'стабилизация + меньше осевой нагрузки' },
    ],
  };

  const lines: string[] = [];

  for (const restriction of healthRestrictions) {
    const bodyPart = restriction.bodyPart.toLowerCase();
    const subs = substitutions[bodyPart];
    if (!subs) continue;

    const count = restriction.severity === 'severe' ? subs.length : Math.min(2, subs.length);
    for (const sub of subs.slice(0, count)) {
      lines.push(`${sub.from} → ${sub.to} (${sub.reason})`);
    }
  }

  if (lines.length === 0) return '';

  return `\n\n## 🔄 ЗАМЕНЫ УПРАЖНЕНИЙ (по ограничениям здоровья)
${lines.join('\n')}
→ ИСПОЛЬЗУЙ эти замены когда составляешь программу или пользователь жалуется на боль.`;
}
export function detectVolumeWaves(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
    }>;
    completedAt: Date | null;
  }>,
): string {
  if (recentWorkouts.length < 4) return '';

  // Calculate volume per session
  const sessionVolumes = recentWorkouts.map((w) => ({
    volume: w.exercises.reduce((sum, ex) =>
      sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0),
    date: w.completedAt,
    sets: w.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0),
  }));

  const volumes = sessionVolumes.map((s) => s.volume);
  const maxVol = Math.max(...volumes);
  const minVol = Math.min(...volumes);
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  // Check if there's a pattern (wave loading)
  let isWaving = false;
  let isLinear = true;
  for (let i = 0; i < volumes.length - 2; i++) {
    // Wave: volume goes up then down
    if ((volumes[i] > volumes[i + 1] && volumes[i + 1] < volumes[i + 2]) ||
        (volumes[i] < volumes[i + 1] && volumes[i + 1] > volumes[i + 2])) {
      isWaving = true;
    }
    // Linear: monotonic increase/decrease
    if (!(volumes[i] >= volumes[i + 1] && volumes[i + 1] >= volumes[i + 2]) &&
        !(volumes[i] <= volumes[i + 1] && volumes[i + 1] <= volumes[i + 2])) {
      isLinear = false;
    }
  }

  const variation = maxVol > 0 ? Math.round(((maxVol - minVol) / avgVol) * 100) : 0;

  const lines: string[] = [];
  lines.push(`Объём: ${volumes.map((v) => Math.round(v / 100) + '×100').join(' → ')} кг`);

  if (isWaving && variation > 20) {
    lines.push('✅ Волновая нагрузка обнаружена — отличная периодизация!');
  } else if (isLinear && volumes[0] > volumes[volumes.length - 1]) {
    lines.push('📈 Линейный рост объёма — хорошо для начинающих. Следи за восстановлением.');
  } else if (variation < 10) {
    lines.push('⚠️ Объём монотонный (вариация <10%). Для прогресса используй волновую нагрузку: тяжёлая → средняя → лёгкая неделя.');
  }

  return `\n\n## 🌊 ВОЛНА НАГРУЗКИ
${lines.join('\n')}
→ Используй для рекомендаций по периодизации объёма.`;
}
export function generateFollowUpQuestions(
  intent: string,
  userGoal: string | null,
  hasActiveProgram: boolean,
  todayMealsCount: number,
  daysSinceLastWorkout: number | null,
  recentTopics: string[],
): string {
  const questions: string[] = [];

  // Intent-based questions
  if (intent === 'greeting') {
    if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= 2) {
      questions.push('Планируешь сегодня тренироваться?');
    }
    if (todayMealsCount === 0) {
      questions.push('Уже завтракал? Могу помочь с планом питания.');
    }
  }

  if (intent === 'workout' || intent === 'program_creation') {
    if (!hasActiveProgram) {
      questions.push('Хочешь, составлю тебе программу тренировок?');
    }
    questions.push('Есть ли упражнения которые ты хотел бы добавить/убрать?');
  }

  if (intent === 'nutrition' || intent === 'data_logging') {
    questions.push('Хочешь узнать сколько ещё белка нужно добрать сегодня?');
  }

  // Goal-based
  if (userGoal === 'WEIGHT_LOSS' && todayMealsCount === 0) {
    questions.push('Записать завтрак? Сфотографируй или расскажи что ел.');
  }

  // Avoid topics already discussed
  const filtered = questions.filter((q) =>
    !recentTopics.some((t) => q.toLowerCase().includes(t)),
  ).slice(0, 2);

  if (filtered.length === 0) return '';

  return `\n\n## ❓ ПРЕДЛОЖИ В КОНЦЕ ОТВЕТА (выбери 1 самый уместный)
${filtered.join('\n')}`;
}
export function adviseRecomposition(
  userGoal: string | null,
  userWeightKg: number | null,
  bodyWeightHistory: Array<{ weightKg: number; date: Date }>,
  totalWorkoutsEver: number,
  fitnessLevel: string | null,
): string {
  // Only relevant for muscle gain or weight loss goals with some experience
  if (!userGoal || !userWeightKg) return '';
  if (!['MUSCLE_GAIN', 'WEIGHT_LOSS', 'GENERAL_FITNESS'].includes(userGoal)) return '';

  const lines: string[] = [];

  // Check if weight is stable but user still wants to change
  if (bodyWeightHistory.length >= 5) {
    const recent5 = bodyWeightHistory.slice(0, 5).map((bw) => bw.weightKg);
    const range = Math.max(...recent5) - Math.min(...recent5);

    if (range < 1.0 && totalWorkoutsEver > 20) {
      // Weight stable + experienced = probably recomping
      lines.push('📊 Вес стабилен при регулярных тренировках — возможна рекомпозиция (потеря жира + набор мышц)');
      lines.push('💡 Рекомпозиция подтверждается: уменьшением объёмов, ростом силы, визуальными изменениями');
      lines.push('📏 Следи за замерами (талия, бёдра) и силовыми показателями — весы не покажут всю картину');
    }
  }

  // Beginner + surplus = fastest recomp window
  if (fitnessLevel === 'BEGINNER' && totalWorkoutsEver < 50) {
    lines.push('🌟 Новичковый бонус! Первые 6-12 месяцев тренировок — можно одновременно терять жир и наращивать мышцы');
    lines.push('💡 Ешь на уровне поддержания или лёгком дефиците (200-300 ккал). Белок: 2г/кг. Тренируйся 3-4 раза/нед.');
  }

  if (lines.length === 0) return '';

  return `\n\n## 🔄 РЕКОМПОЗИЦИЯ ТЕЛА
${lines.join('\n')}`;
}
export function buildSocialProof(
  totalWorkoutsEver: number,
  currentStreak: number,
  userGoal: string | null,
): string {
  if (totalWorkoutsEver < 5) return '';

  const lines: string[] = [];

  // Percentile estimates (based on fitness app statistics)
  if (totalWorkoutsEver >= 100) {
    lines.push('🏆 100+ тренировок — ты в топ-5% пользователей по дисциплине!');
  } else if (totalWorkoutsEver >= 50) {
    lines.push('💪 50+ тренировок — ты опережаешь 80% пользователей!');
  } else if (totalWorkoutsEver >= 20) {
    lines.push('📈 20+ тренировок — ты уже сформировал привычку. Большинство бросают после 5.');
  }

  if (currentStreak >= 12) {
    lines.push(`🔥 Стрик ${currentStreak} недель — невероятная стабильность!`);
  } else if (currentStreak >= 4) {
    lines.push(`🔥 Стрик ${currentStreak} — ты на правильном пути!`);
  }

  // Fun facts
  if (totalWorkoutsEver >= 30) {
    const hoursEstimate = Math.round(totalWorkoutsEver * 1.1); // ~66 min avg
    lines.push(`⏱️ ~${hoursEstimate} часов тренировок — это инвестиция в здоровье!`);
  }

  if (lines.length === 0) return '';

  // Достижение измеряется тем, ради чего человек ходит. Цель приходила сюда и
  // не использовалась: худеющему сообщали, сколько он часов провёл в зале, —
  // а это не то число, которое он ждёт.
  const goalLine = {
    WEIGHT_LOSS: 'Но главный показатель у тебя не число тренировок, а то, что рабочие веса не падают на дефиците.',
    MUSCLE_GAIN: 'Но главный показатель у тебя не число тренировок, а прибавка веса при растущих силовых.',
    STRENGTH: 'Но главный показатель у тебя не число тренировок, а килограммы на штанге в базовых движениях.',
    ENDURANCE: 'Но главный показатель у тебя не число тренировок, а тот же темп при более низком пульсе.',
  }[String(userGoal || '')];

  return `\n\n## 🌟 ДОСТИЖЕНИЯ
${lines.join('\n')}${goalLine ? `\n${goalLine}` : ''}
→ Используй для мотивации — люди любят знать что они впереди.`;
}
export function calibrateResponseLength(
  message: string,
  intent: string,
  messageCount: number,
): string {
  const msgLen = message.length;

  // Short messages expect short responses
  if (msgLen < 20 && !message.includes('?')) {
    return '\n\n## 📏 ДЛИНА ОТВЕТА\nПользователь написал коротко. Отвечай кратко (2-3 предложения). Без лишних деталей.';
  }

  // Questions deserve full answers
  if (message.includes('?') || message.includes('почему') || message.includes('как') || message.includes('объясни')) {
    return '\n\n## 📏 ДЛИНА ОТВЕТА\nПользователь задал вопрос. Дай полный, но структурированный ответ. Используй списки если нужно.';
  }

  // Greeting = medium
  if (intent === 'greeting') {
    return '\n\n## 📏 ДЛИНА ОТВЕТА\nПриветствие — будь дружелюбным и информативным, но не перегружай. 3-5 предложений.';
  }

  // Long message = user invested effort, match it
  if (msgLen > 200) {
    return '\n\n## 📏 ДЛИНА ОТВЕТА\nПользователь написал подробно. Дай развёрнутый ответ, учитывая все упомянутые детали.';
  }

  // First messages = be welcoming and helpful
  if (messageCount <= 3) {
    return '\n\n## 📏 ДЛИНА ОТВЕТА\nНачало беседы — покажи ценность: будь полезным, тёплым, проактивным.';
  }

  return '';
}
export function detectBilateralImbalance(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; type: string };
      sets: Array<{ weight: number | null; reps: number | null; completed: boolean; notes: string | null }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Look for dumbbell exercises with notes mentioning left/right difference
  const dbExercises: string[] = [];
  for (const w of recentWorkouts.slice(0, 5)) {
    for (const ex of w.exercises) {
      if (ex.exercise?.type === 'dumbbell') {
        const dbExName = ex.exercise?.name;
        if (!dbExName) continue;
        // Check for incomplete sets pattern (alternating complete/incomplete could indicate imbalance)
        const completedCount = ex.sets.filter(s => s.completed).length;
        const totalCount = ex.sets.length;
        if (totalCount >= 3 && completedCount / totalCount < 0.7) {
          dbExercises.push(dbExName);
        }
        // Check notes for imbalance mentions
        for (const s of ex.sets) {
          if (s.notes && /лев|прав|слаб|left|right|weak/i.test(s.notes)) {
            if (!dbExercises.includes(dbExName)) {
              dbExercises.push(dbExName);
            }
          }
        }
      }
    }
  }

  if (dbExercises.length === 0) return '';

  return `\n\n## ⚖️ БАЛАНС СТОРОН
Возможный дисбаланс в упражнениях с гантелями:
${dbExercises.slice(0, 3).map(e => `- ${e}`).join('\n')}
Рекомендация: начинай с более слабой стороны, используй одностороннюю работу для выравнивания.`;
}
export function autoScaleDifficulty(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ rpe: number | null; completed: boolean }>;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Collect all RPE values from last 3 workouts
  const rpeValues: number[] = [];
  for (const w of recentWorkouts.slice(0, 3)) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (s.rpe && s.completed) rpeValues.push(s.rpe);
      }
    }
  }

  if (rpeValues.length < 5) return '';

  const avgRpe = rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length;
  const highRpePct = rpeValues.filter(r => r >= 9).length / rpeValues.length;

  if (avgRpe > 8.5 || highRpePct > 0.5) {
    return `\n\n## 📈 АВТО-МАСШТАБИРОВАНИЕ
Средний RPE: ${avgRpe.toFixed(1)}, ${Math.round(highRpePct * 100)}% подходов на RPE 9-10.
Слишком тяжело! Рекомендация: снизить рабочие веса на 5-10% на следующей неделе.`;
  }

  if (avgRpe < 6) {
    return `\n\n## 📈 АВТО-МАСШТАБИРОВАНИЕ
Средний RPE: ${avgRpe.toFixed(1)} — тренировки слишком лёгкие.
Рекомендация: увеличить веса на 5% или добавить 1-2 подхода для прогресса.`;
  }

  return '';
}
export function optimizeMuscleGroupSynergy(
  lastWorkoutMuscles: string[],
  programType: string | null,
): string {
  if (lastWorkoutMuscles.length === 0) return '';

  const synergyMap: Record<string, string[]> = {
    chest: ['triceps', 'shoulders'],
    back: ['biceps', 'traps'],
    shoulders: ['triceps', 'traps'],
    quadriceps: ['hamstrings', 'glutes', 'calves'],
    hamstrings: ['glutes', 'calves'],
  };

  const nextSuggestions: string[] = [];
  const trainedToday = new Set(lastWorkoutMuscles);

  // Suggest muscles that synergize with untrained ones
  const muscleRu: Record<string, string> = {
    chest: 'грудь', back: 'спина', shoulders: 'плечи',
    biceps: 'бицепс', triceps: 'трицепс', quadriceps: 'квадрицепс',
    hamstrings: 'задняя поверхность', glutes: 'ягодицы', calves: 'икры',
    traps: 'трапеция', abs: 'пресс',
  };

  // Suggest next workout based on what was trained
  if (trainedToday.has('chest') || trainedToday.has('shoulders') || trainedToday.has('triceps')) {
    nextSuggestions.push('Следующая: спина + бицепс (антагонисты)');
  } else if (trainedToday.has('back') || trainedToday.has('biceps')) {
    nextSuggestions.push('Следующая: грудь + плечи + трицепс');
  } else if (trainedToday.has('quadriceps') || trainedToday.has('hamstrings')) {
    nextSuggestions.push('Следующая: верх тела (грудь или спина)');
  }

  if (nextSuggestions.length === 0) return '';

  // Совет «дальше антагонисты» верен для сплита и вреден для фулбади, где
  // следующая тренировка — снова всё тело. Тип программы приходил в функцию
  // и не использовался, так что человеку на Full Body предлагали разбивку.
  const type = (programType || '').toLowerCase();
  const programNote =
    /full ?body|фулбади|всё тело|все тело/.test(type)
      ? '\nНо у тебя Full Body: следующая тренировка — снова всё тело, меняются не группы, а упражнения и веса.'
      : /ppl|push|pull/.test(type)
        ? '\nЭто как раз следующий день твоего PPL.'
        : /upper|lower|верх|низ/.test(type)
          ? '\nПо схеме Upper/Lower следующая — противоположная половина тела.'
          : '';

  return `\n\n## 🔀 ОПТИМАЛЬНАЯ СЛЕДУЮЩАЯ ТРЕНИРОВКА
На основе последней тренировки (${lastWorkoutMuscles.slice(0, 3).map(m => muscleRu[m] || m).join(', ')}):
${nextSuggestions.join('\n')}${programNote}
Предложи это если пользователь спрашивает что тренировать дальше.`;
}
export function predictSoreness(
  lastWorkoutMuscles: string[],
  lastWorkoutIntensity: 'light' | 'moderate' | 'heavy' | 'unknown',
  daysSinceWorkout: number,
): string {
  if (lastWorkoutMuscles.length === 0 || lastWorkoutIntensity === 'unknown') return '';

  const muscleRu: Record<string, string> = {
    chest: 'грудь', back: 'спина', shoulders: 'плечи',
    biceps: 'бицепс', triceps: 'трицепс', quadriceps: 'квадрицепс',
    hamstrings: 'задняя поверхность', glutes: 'ягодицы', calves: 'икры',
    abs: 'пресс', lats: 'широчайшие',
  };

  // DOMS peaks at 24-72 hours
  if (daysSinceWorkout > 3) return '';

  const sorenessLevel = lastWorkoutIntensity === 'heavy' ? 'сильная' :
                        lastWorkoutIntensity === 'moderate' ? 'умеренная' : 'лёгкая';

  const peakDay = daysSinceWorkout <= 1 ? 'Пик крепатуры: завтра-послезавтра.' :
                  daysSinceWorkout === 2 ? 'Сейчас скорее всего пик крепатуры.' :
                  'Крепатура должна проходить.';

  const muscles = lastWorkoutMuscles.slice(0, 4).map(m => muscleRu[m] || m).join(', ');

  return `\n\n## 😤 ПРОГНОЗ КРЕПАТУРЫ
Мышцы: ${muscles}
Интенсивность: ${sorenessLevel}
${peakDay}
${lastWorkoutIntensity === 'heavy' ? 'Лёгкая активность (прогулка, растяжка) ускорит восстановление.' : ''}`;
}
export function manageConversationFlow(
  recentAssistantMessages: string[],
  currentIntent: string,
): string {
  if (recentAssistantMessages.length < 3) return '';

  // Detect repeated topics
  const topicCounts: Record<string, number> = {};
  const topicKeywords: Record<string, string[]> = {
    nutrition: ['белок', 'калори', 'питание', 'еда', 'КБЖУ'],
    workout: ['тренировк', 'подход', 'повтор', 'упражнен'],
    motivation: ['молодец', 'отлично', 'круто', 'так держать'],
    sleep: ['сон', 'спать', 'отдых'],
    progress: ['прогресс', 'рекорд', 'улучшени'],
  };

  for (const msg of recentAssistantMessages.slice(0, 5)) {
    const msgL = msg.toLowerCase();
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(k => msgL.includes(k))) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }
  }

  const overusedTopics = Object.entries(topicCounts)
    .filter(([, count]) => count >= 3)
    .map(([topic]) => topic);

  if (overusedTopics.length === 0) return '';

  // Тема, о которой человек спрашивает прямо сейчас, — не «заезженная», а
  // ровно та, которая ему нужна. Раньше intent приходил сюда и не
  // использовался: третий вопрос подряд про питание получал в контекст
  // указание «не повторяй тему питания».
  const intentTopic: Record<string, string> = {
    nutrition_query: 'nutrition',
    technique_question: 'workout',
    workout_modify: 'workout',
    program_creation: 'workout',
    analytics_query: 'progress',
    motivation: 'motivation',
  };
  const asking = intentTopic[currentIntent];
  const stale = overusedTopics.filter((t) => t !== asking);

  if (stale.length === 0) return '';

  return `\n\n## 🔄 УПРАВЛЕНИЕ ДИАЛОГОМ
Темы, которые уже обсуждались много раз: ${stale.join(', ')}
НЕ ПОВТОРЯЙ эти темы без прямого запроса пользователя. Внеси разнообразие в ответы.${asking ? `\nПро «${asking}» пользователь спрашивает сейчас — это исключение, отвечай полноценно.` : ''}`;
}
export function recommendAccessories(
  mainLifts: string[],
  weakMuscles: string[],
  userLevel: string | null,
): string {
  if (mainLifts.length === 0) return '';

  const accessoryMap: Record<string, string[]> = {
    'жим лёжа': ['Разводки гантелей', 'Французский жим', 'Отжимания на брусьях'],
    'присед': ['Болгарские выпады', 'Разгибания ног', 'Ягодичный мостик'],
    'становая тяга': ['Гиперэкстензия', 'Тяга блока к поясу', 'Сгибания ног'],
    'жим стоя': ['Махи гантелями в стороны', 'Тяга к подбородку', 'Фейс-пулл'],
    'подтягивания': ['Тяга верхнего блока', 'Пулловер', 'Сгибания на бицепс'],
  };

  const recommendations: string[] = [];
  for (const lift of mainLifts.slice(0, 3)) {
    const nameL = lift.toLowerCase();
    for (const [key, accessories] of Object.entries(accessoryMap)) {
      if (nameL.includes(key)) {
        recommendations.push(`${lift} → ${accessories.slice(0, 2).join(', ')}`);
        break;
      }
    }
  }

  if (recommendations.length === 0) return '';

  // Подсобка нужна для двух разных вещей: закрыть отстающее и не перегрузить
  // новичка. Обе — weakMuscles и userLevel — приходили сюда и не
  // использовались: список был одинаковым для первого месяца и для человека
  // с явно отстающей спиной.
  const weakLine = weakMuscles.length > 0
    ? `\nОтстают: ${weakMuscles.join(', ')} — подсобку на них ставь первой в подсобной части, пока есть силы.`
    : '';

  const level = (userLevel || '').toUpperCase();
  const levelLine =
    level === 'BEGINNER'
      ? '\nНа старте бери по одному подсобному упражнению на движение, не больше. Прогресс сейчас даёт база, а не объём подсобки.'
      : (level === 'ADVANCED' || level === 'EXPERT')
        ? '\nНа твоём уровне подсобка — это адресная работа по слабому звену в самом движении, а не «добить мышцу».'
        : '';

  return `\n\n## 🎯 ПОДСОБНЫЕ УПРАЖНЕНИЯ
${recommendations.map(r => `- ${r}`).join('\n')}${weakLine}${levelLine}
Предложи подсобку если пользователь хочет улучшить основные движения.`;
}
export function checkGoalAlignment(
  userGoal: string | null,
  avgRepsPerSet: number,
  cardioMinutes: number,
  avgRestSeconds: number,
): string {
  if (!userGoal) return '';

  const issues: string[] = [];

  if (userGoal === 'STRENGTH') {
    if (avgRepsPerSet > 8) issues.push(`Средние повторы (${Math.round(avgRepsPerSet)}) слишком высоки для силы. Для силы: 1-5 повторов.`);
    if (avgRestSeconds < 120) issues.push('Короткий отдых. Для силы нужно 3-5 мин между тяжёлыми подходами.');
  } else if (userGoal === 'MUSCLE_GAIN') {
    if (avgRepsPerSet < 6) issues.push('Мало повторов для гипертрофии. Оптимально: 8-12 повторов.');
    if (avgRepsPerSet > 15) issues.push('Слишком много повторов. Для массы: 8-12 повторов с умеренным весом.');
  } else if (userGoal === 'WEIGHT_LOSS') {
    if (cardioMinutes < 10) issues.push('Мало кардио для жиросжигания. Добавь 20-30 мин кардио 3-4 раза в неделю.');
    if (avgRestSeconds > 120) issues.push('Длинный отдых. Для жиросжигания: 30-60 сек между подходами, суперсеты.');
  } else if (userGoal === 'ENDURANCE') {
    if (avgRepsPerSet < 12) issues.push('Для выносливости нужно 15-20+ повторов с лёгким весом.');
  }

  if (issues.length === 0) return '';

  return `\n\n## 🎯 СООТВЕТСТВИЕ ЦЕЛИ (${userGoal})
${issues.map(i => `- ${i}`).join('\n')}
Помоги скорректировать тренировочный стиль под цель.`;
}
export function buildEtiquetteTips(
  totalWorkouts: number,
  userLevel: string | null,
): string {
  if (totalWorkouts > 50 || (userLevel && userLevel !== 'BEGINNER')) return '';

  const tips = [
    'Возвращай блины на место после использования — уважай других.',
    'Протирай скамью/тренажёр после себя полотенцем.',
    'Не занимай стойку для приседаний для сгибаний на бицепс.',
    'Используй лямки/ремень на тяжёлых подходах, не стесняйся.',
    'Спрашивай "сколько подходов осталось?" а не просто жди.',
  ];

  const tip = tips[totalWorkouts % tips.length];

  return `\n\n## 💡 СОВЕТ НОВИЧКУ
${tip}
Давай такие советы новичкам время от времени (не каждый раз).`;
}
export function suggestVariations(
  frequentExercises: string[],
): string {
  if (frequentExercises.length === 0) return '';

  const variationMap: Record<string, string[]> = {
    'жим лёжа': ['Жим на наклонной', 'Жим гантелей', 'Жим узким хватом', 'Жим с пола'],
    'присед': ['Фронтальный присед', 'Присед с паузой', 'Кубковый присед', 'Приседания Зерчера'],
    'становая тяга': ['Тяга сумо', 'Дефицитная тяга', 'Тяга трэп-грифом', 'Румынская тяга'],
    'подтягивания': ['Подтягивания широким хватом', 'Нейтральный хват', 'Подтягивания с весом', 'Австралийские подтягивания'],
    'жим стоя': ['Жим Арнольда', 'Push-press', 'Жим гантелей сидя', 'Жим одной рукой'],
    'тяга штанги': ['Тяга Т-грифа', 'Тяга гантели в упоре', 'Тяга Пендлея', 'Горизонтальная тяга в блоке'],
  };

  const suggestions: string[] = [];
  for (const ex of frequentExercises.slice(0, 3)) {
    const nameL = ex.toLowerCase();
    for (const [key, vars] of Object.entries(variationMap)) {
      if (nameL.includes(key)) {
        suggestions.push(`${ex}: попробуй ${vars.slice(0, 2).join(' или ')}`);
        break;
      }
    }
  }

  if (suggestions.length === 0) return '';

  return `\n\n## 🔄 ВАРИАЦИИ УПРАЖНЕНИЙ
${suggestions.map(s => `- ${s}`).join('\n')}
Предложи замену если пользователь жалуется на скуку или плато.`;
}
export function buildDecisionEngine(
  signals: {
    fatigueStatus: string;
    recoveryScore: number;
    deloadNeeded: boolean;
    mood: string | null;
    daysSinceLastWorkout: number;
    currentStreak: number;
    completionRate: number;
    hasWorkoutScheduled: boolean;
  },
): string {
  const { fatigueStatus, recoveryScore, deloadNeeded, mood, daysSinceLastWorkout, currentStreak, completionRate } = signals;

  // Decision matrix
  let recommendation: string;
  let reasoning: string;

  if (deloadNeeded || fatigueStatus === 'overreaching') {
    recommendation = '🟡 РЕКОМЕНДАЦИЯ: Разгрузочная тренировка или день отдыха';
    reasoning = 'Накопленная усталость. Восстановись чтобы не потерять прогресс.';
  } else if (recoveryScore < 40 || mood === 'tired') {
    recommendation = '🟡 РЕКОМЕНДАЦИЯ: Лёгкая тренировка или активное восстановление';
    reasoning = `Восстановление: ${recoveryScore}/100. Не перегружай организм.`;
  } else if (daysSinceLastWorkout >= 4 && currentStreak === 0) {
    recommendation = '🔵 РЕКОМЕНДАЦИЯ: Тренировка средней интенсивности для возвращения';
    reasoning = `${daysSinceLastWorkout} дней без тренировки. Начни мягко.`;
  } else if (recoveryScore >= 80 && mood === 'motivated') {
    recommendation = '🟢 РЕКОМЕНДАЦИЯ: Тяжёлая тренировка — отличный день для рекордов!';
    reasoning = `Восстановление: ${recoveryScore}/100, настроение отличное. Время давить!`;
  } else if (recoveryScore >= 60) {
    recommendation = '🟢 РЕКОМЕНДАЦИЯ: Стандартная тренировка по программе';
    reasoning = `Нормальное состояние. Работай по плану.`;
  } else {
    recommendation = '🟡 РЕКОМЕНДАЦИЯ: Тренировка с уменьшенным объёмом (-20%)';
    reasoning = `Восстановление среднее (${recoveryScore}/100). Не форсируй.`;
  }

  return `\n\n## 🧠 РЕШЕНИЕ ДНЯ
${recommendation}
Причина: ${reasoning}
Учитывай это при любом совете о тренировке.`;
}
export function generateHealthAlerts(
  signals: {
    avgRpe: number;
    daysSinceLastWorkout: number;
    weeklyVolumeTrend: 'increasing' | 'decreasing' | 'stable';
    hasInjury: boolean;
    injuryAreas: string[];
    weightTrend: 'gaining' | 'losing' | 'stable' | 'unknown';
    calorieAdherence: number; // 0-1
  },
): string {
  const alerts: Array<{ level: 'warning' | 'info'; message: string }> = [];

  if (signals.avgRpe >= 9 && signals.weeklyVolumeTrend === 'increasing') {
    alerts.push({ level: 'warning', message: 'Высокий RPE + растущий объём = риск перетренированности. Запланируй разгрузку.' });
  }

  if (signals.hasInjury && signals.avgRpe >= 8) {
    alerts.push({ level: 'warning', message: `Тренировки с высокой нагрузкой при травме (${signals.injuryAreas.join(', ')}). Снизь интенсивность!` });
  }

  if (signals.weightTrend === 'losing' && signals.calorieAdherence < 0.7) {
    alerts.push({ level: 'info', message: 'Теряешь вес при недоборе калорий. Если цель не похудение — ешь больше.' });
  }

  if (signals.daysSinceLastWorkout >= 10) {
    alerts.push({ level: 'info', message: `${signals.daysSinceLastWorkout} дней без тренировки. Начинай возвращение постепенно — не прыгай сразу на тяжёлые веса.` });
  }

  if (alerts.length === 0) return '';

  return `\n\n## 🚨 АЛЕРТЫ ЗДОРОВЬЯ
${alerts.map(a => `${a.level === 'warning' ? '⚠️' : 'ℹ️'} ${a.message}`).join('\n')}
Упоминай алерты уместно — не пугай, но предупреждай.`;
}
export function suggestSmartGoals(
  currentStats: {
    totalWorkouts: number;
    currentStreak: number;
    avgVolume: number;
    strongestLift: { name: string; weight: number } | null;
    bodyWeight: number | null;
  },
  userGoal: string | null,
): string {
  const goals: string[] = [];

  // Short-term goals (1-2 weeks)
  if (currentStats.currentStreak < 7) {
    goals.push(`Краткосрочная: 7 дней подряд без пропусков (сейчас: ${currentStats.currentStreak})`);
  } else if (currentStats.currentStreak < 30) {
    goals.push(`Краткосрочная: 30 дней подряд (сейчас: ${currentStats.currentStreak})`);
  }

  // Strength goals
  if (currentStats.strongestLift) {
    const target = Math.round(currentStats.strongestLift.weight * 1.05 / 2.5) * 2.5;
    goals.push(`Сила: ${currentStats.strongestLift.name} → ${target} кг (сейчас: ${currentStats.strongestLift.weight} кг)`);
  }

  // Volume goals
  if (currentStats.avgVolume > 0) {
    const volTarget = Math.round(currentStats.avgVolume * 1.1);
    goals.push(`Объём: ${volTarget} кг за тренировку (сейчас: ~${Math.round(currentStats.avgVolume)} кг)`);
  }

  // Goal-specific
  if (userGoal === 'WEIGHT_LOSS' && currentStats.bodyWeight) {
    const target = Math.round(currentStats.bodyWeight - 2);
    goals.push(`Вес: ${target} кг через 4 недели (безопасный темп: -0.5 кг/нед)`);
  } else if (userGoal === 'MUSCLE_GAIN' && currentStats.bodyWeight) {
    const target = Math.round(currentStats.bodyWeight + 1);
    goals.push(`Масса: ${target} кг через 4 недели (чистый набор: +0.25 кг/нед)`);
  }

  if (goals.length === 0) return '';

  return `\n\n## 🎯 SMART-ЦЕЛИ
${goals.slice(0, 3).map(g => `- ${g}`).join('\n')}
Предложи цели если пользователь спрашивает о прогрессе или мотивации.`;
}
export function buildEmotionalResponse(
  message: string,
  recentUserMessages: string[],
  currentStreak: number,
): string {
  const allText = [message, ...recentUserMessages.slice(0, 3)].join(' ').toLowerCase();

  const emotions: Record<string, { detected: boolean; response: string }> = {
    frustration: {
      detected: /не получается|не могу|задолбал|бесит|плохо|неудач|провал/i.test(allText),
      response: 'Пользователь фрустрирован. Будь эмпатичным, признай сложность, предложи конкретный маленький шаг вперёд.',
    },
    excitement: {
      detected: /ура|круто|рекорд|получилось|наконец-то|yes|!{2,}/i.test(allText),
      response: 'Пользователь в восторге! Раздели радость, похвали конкретное достижение, предложи следующую цель.',
    },
    anxiety: {
      detected: /боюсь|страшно|нервничаю|травм|опасно|не уверен/i.test(allText),
      response: 'Пользователь тревожится. Успокой, дай уверенность через факты и безопасные альтернативы.',
    },
    guilt: {
      detected: /пропустил|забил|не ходил|стыдно|плохой/i.test(allText),
      response: 'Пользователь чувствует вину за пропуск. НЕ вини. Нормализуй пропуски, предложи мягкое возвращение.',
    },
    pride: {
      detected: /горжусь|добился|смог|преодолел|сильнее/i.test(allText),
      response: 'Пользователь гордится собой. Усиль это чувство! Подчеркни путь и прогресс.',
    },
  };

  const detected = Object.entries(emotions)
    .filter(([, v]) => v.detected)
    .map(([, v]) => v.response);

  if (detected.length === 0) return '';

  // Стрик — это факт, которым отвечают на «у меня не получается». Он
  // приходил в функцию и не использовался, так что эмпатия строилась на
  // пустом месте, хотя доказательство обратного лежало рядом.
  const streakLine =
    currentStreak >= 4 && /фрустрирован|тревожится/.test(detected.join(' '))
      ? `\nПри этом стрик — ${currentStreak}. Если человек говорит, что ничего не выходит, это число и есть возражение: сошлись на него, а не на общие слова.`
      : currentStreak >= 8 && /гордится|восторге/.test(detected.join(' '))
        ? `\nСтрик ${currentStreak} — похвали именно постоянство, оно тут заслуженнее разового результата.`
        : '';

  return `\n\n## 💝 ЭМОЦИОНАЛЬНЫЙ КОНТЕКСТ
${detected.slice(0, 2).join('\n')}${streakLine}
Приоритет: эмоциональная поддержка > информация. Сначала прояви эмпатию, потом давай советы.`;
}
export function detectKnowledgeGaps(
  userLevel: string | null,
  totalWorkouts: number,
  hasUsedRPE: boolean,
  hasTrackedNutrition: boolean,
  hasSupersets: boolean,
): string {
  if (totalWorkouts > 100) return ''; // experienced user, don't lecture

  const gaps: string[] = [];

  if (!hasUsedRPE && totalWorkouts > 5) {
    gaps.push('RPE (шкала усилий): не используется. Объясни при случае — помогает управлять нагрузкой.');
  }

  if (!hasTrackedNutrition && totalWorkouts > 10) {
    gaps.push('Питание: не отслеживается. Упомяни что 70% результата зависит от еды.');
  }

  if (!hasSupersets && totalWorkouts > 15 && userLevel !== 'BEGINNER') {
    gaps.push('Суперсеты: не используются. Предложи для экономии времени и интенсивности.');
  }

  if (totalWorkouts > 20 && userLevel === 'BEGINNER') {
    gaps.push('20+ тренировок на уровне "новичок". Возможно пора обновить уровень в профиле.');
  }

  if (gaps.length === 0) return '';

  return `\n\n## 📚 ПРОБЕЛЫ В ЗНАНИЯХ
${gaps.slice(0, 2).map(g => `- ${g}`).join('\n')}
Обучай ненавязчиво — встраивай знания в ответы, не читай лекции.`;
}
export function filterBroscience(message: string): string {
  const myths: Array<{ trigger: RegExp; correction: string }> = [
    { trigger: /углевод.*(вечер|ночь|после 6)/i, correction: 'Миф: "углеводы после 6 превращаются в жир". Факт: время приёма углеводов почти не влияет на набор жира — важен общий калорийный баланс.' },
    { trigger: /жиросжигающ.*(зон|пульс|кардио)/i, correction: 'Миф: "жиросжигающая зона пульса". Факт: высокоинтенсивное кардио сжигает больше калорий за меньшее время. Оба подхода работают.' },
    { trigger: /мышц.*(жир|перейд|превращ)/i, correction: 'Миф: "мышцы превращаются в жир". Факт: это разные ткани. Мышцы атрофируются отдельно, жир накапливается отдельно.' },
    { trigger: /есть.*каждые.*(2|3) часа/i, correction: 'Миф: "есть каждые 2-3 часа для разгона метаболизма". Факт: частота приёмов пищи не влияет на метаболизм. Важен общий дневной калораж.' },
    { trigger: /присед.*(колен|вред|опасн)/i, correction: 'Миф: "приседания вредят коленям". Факт: правильные приседания УКРЕПЛЯЮТ колени. Важна техника и прогрессия.' },
    { trigger: /белок.*бол[ьш].*(30|40|50) гр/i, correction: 'Миф: "организм усваивает только 30г белка за раз". Факт: организм усваивает весь белок, просто медленнее при больших порциях.' },
  ];

  const triggered = myths.filter(m => m.trigger.test(message));
  if (triggered.length === 0) return '';

  return `\n\n## 🔬 НАУЧНЫЙ ФАКТ-ЧЕК
${triggered.map(t => t.correction).join('\n\n')}
Мягко развей миф, опираясь на науку. Не высмеивай — многие так думают.`;
}
export function getVolumeForWeek(
  weekNumber: number,
  mesocycleLength: number,
  baseVolume: number,
): string {
  if (baseVolume <= 0) return '';

  const weekInCycle = weekNumber % mesocycleLength;
  let volumeMultiplier: number;
  let weekType: string;

  if (mesocycleLength === 4) {
    const multipliers = [1.0, 1.1, 1.2, 0.6]; // 3 load + 1 deload
    volumeMultiplier = multipliers[weekInCycle] || 1.0;
    weekType = weekInCycle === 3 ? 'Разгрузка' : `Нагрузочная ${weekInCycle + 1}`;
  } else {
    const multipliers = [0.9, 1.0, 1.1, 1.2, 1.3, 0.6]; // 5 load + 1 deload
    volumeMultiplier = multipliers[Math.min(weekInCycle, multipliers.length - 1)] || 1.0;
    weekType = weekInCycle >= 5 ? 'Разгрузка' : `Нагрузочная ${weekInCycle + 1}`;
  }

  const targetVolume = Math.round(baseVolume * volumeMultiplier);

  return `\n\n## 📅 ОБЪЁМ НА ТЕКУЩУЮ НЕДЕЛЮ
Неделя ${weekNumber + 1} цикла (${weekType}): целевой объём ~${targetVolume} кг
${weekType.includes('Разгруз') ? 'Снизь интенсивность и объём — это запланировано!' : `${Math.round(volumeMultiplier * 100)}% от базового объёма.`}`;
}
export function buildRussianGymContext(
  message: string,
): string {
  const contexts: Array<{ trigger: RegExp; context: string }> = [
    {
      trigger: /рывок|толчок|тяга сумо|пауэрлифт/i,
      context: 'Российская школа пауэрлифтинга — одна из сильнейших в мире. ФПРС (федерация пауэрлифтинга) проводит соревнования по всей стране.',
    },
    {
      trigger: /соревнован|турнир|выступ/i,
      context: 'Для соревнований в России: ФПРС (пауэрлифтинг), ФБР (бодибилдинг), РФС (фитнес). Региональные старты есть в каждом городе-миллионнике.',
    },
    {
      trigger: /гречк|творог|кефир|тушенк/i,
      context: 'Российские продукты для спортсмена: гречка — медленные углеводы, творог — казеин перед сном, кефир — белок и пробиотики. Отличные, доступные продукты.',
    },
    {
      trigger: /аптек|аптечн/i,
      context: 'Из российских аптек: глюкозамин+хондроитин, магний B6, омега-3 (рыбий жир), витамин D3 — всё доступно и эффективно для спортсмена.',
    },
    {
      trigger: /магазин спортивн|спортмастер|декатлон/i,
      context: 'Магазины спортпита в России: Olimp, PureProtein, Bombbar — отечественные бренды хорошего качества. СпортМастер, Декатлон — для инвентаря.',
    },
  ];

  const applicable = contexts.filter(c => c.trigger.test(message));
  if (applicable.length === 0) return '';

  return `\n\n## 🇷🇺 РОССИЙСКИЙ КОНТЕКСТ
${applicable.slice(0, 2).map(c => c.context).join('\n')}`;
}
export function refineIntent(message: string, baseIntent: string): string {
  const refinements: Record<string, RegExp> = {
    'asking_for_program': /создай|составь|напиши программ|сделай програм|нужна программ/i,
    'reporting_pain': /болит|боль|тянет|ноет|дискомф|травм/i,
    'asking_technique': /как (делать|выполнять)|техника|правильно ли|покажи как/i,
    'seeking_motivation': /не хочу|лень|мотив|зачем|смысл|устал от/i,
    'reporting_progress': /похудел|набрал|стал сильнее|прогресс|рекорд|вес вырос/i,
    'asking_nutrition': /что (есть|съесть|кушать)|рацион|диета|калории|белок/i,
    'asking_schedule': /когда тренир|расписание|план на неделю|сколько раз/i,
    'seeking_explanation': /почему|зачем|как работает|объясни|что такое/i,
  };

  const matched = Object.entries(refinements).filter(([, re]) => re.test(message)).map(([name]) => name);

  if (matched.length === 0) return '';

  return `\n\n## 🎯 УТОЧНЁННЫЙ ИНТЕНТ
Базовый: ${baseIntent}
Уточнённый: ${matched.join(', ')}
Адаптируй ответ под конкретный под-тип запроса.`;
}
export function adaptDifficultyRamp(
  recentWorkouts: Array<{
    exercises: Array<{
      sets: Array<{ completed: boolean; rpe: number | null; weight: number | null; reps: number | null }>;
    }>;
    durationMinutes: number | null;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  // Avg completion rate per workout
  const rates = recentWorkouts.slice(0, 5).map(w => {
    const total = w.exercises.reduce((s, e) => s + e.sets.length, 0);
    const completed = w.exercises.reduce((s, e) => s + e.sets.filter(st => st.completed).length, 0);
    return total > 0 ? completed / total : 1;
  });

  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;

  if (avgRate > 0.95) {
    return `\n\n## 📈 АДАПТАЦИЯ СЛОЖНОСТИ
Высокий % завершения подходов (${Math.round(avgRate * 100)}%). Программа слишком лёгкая.
Рекомендация: увеличь рабочие веса на 5% или добавь 1 подход к каждому упражнению.`;
  }

  if (avgRate < 0.7) {
    return `\n\n## 📉 АДАПТАЦИЯ СЛОЖНОСТИ
Низкий % завершения подходов (${Math.round(avgRate * 100)}%). Программа слишком тяжёлая.
Рекомендация: снизь веса на 10% или убери 1 подход. Лучше тренироваться стабильно.`;
  }

  return '';
}
export function buildProgressNarrative(
  totalWorkouts: number,
  firstWorkoutDaysAgo: number,
  currentStreak: number,
  totalVolumeTons: number,
  personalRecords: number,
): string {
  if (totalWorkouts < 5) return '';

  const parts: string[] = [];

  // Journey duration
  if (firstWorkoutDaysAgo >= 30) {
    parts.push(`${Math.round(firstWorkoutDaysAgo / 30)} месяц(ев) в зале`);
  }

  // Volume moved
  if (totalVolumeTons >= 1) {
    parts.push(`${totalVolumeTons.toFixed(1)} тонн поднято за всё время`);
  }

  // Workout count
  if (totalWorkouts >= 50) {
    parts.push(`${totalWorkouts} тренировок в истории`);
  }

  // Consistency
  if (currentStreak >= 14) {
    parts.push(`${currentStreak} дней без пропуска сейчас`);
  }

  if (personalRecords > 0) {
    parts.push(`${personalRecords} личных рекордов`);
  }

  if (parts.length < 2) return '';

  return `\n\n## 📖 ИСТОРИЯ ПРОГРЕССА
${parts.map(p => `🏆 ${p}`).join('\n')}
Используй для мотивации — покажи пользователю насколько далеко он продвинулся.`;
}
export function suggestNextActions(
  intent: string,
  hasActiveProgram: boolean,
  lastWorkoutDaysAgo: number,
  nutritionTracked: boolean,
): string {
  const actions: string[] = [];

  if (intent === 'greeting' || intent === 'general') {
    if (lastWorkoutDaysAgo >= 2) {
      actions.push('🏋️ Начать тренировку: открой вкладку «Тренировки»');
    }
    if (!nutritionTracked) {
      actions.push('🥗 Записать питание: вкладка «Питание» → добавить приём пищи');
    }
    if (!hasActiveProgram) {
      actions.push('📋 Создать программу: AI Coach поможет составить план');
    }
  }

  if (intent === 'workout') {
    actions.push('▶️ Начать тренировку прямо сейчас — запусти таймер');
    if (hasActiveProgram) actions.push('📋 Следуй активной программе');
  }

  if (intent === 'nutrition') {
    actions.push('📸 Сфотографировать еду для автоматического подсчёта КБЖУ');
    actions.push('✏️ Ввести вручную: поиск по базе продуктов');
  }

  if (actions.length === 0) return '';

  return `\n\n## 👆 СЛЕДУЮЩИЙ ШАГ В ПРИЛОЖЕНИИ
${actions.slice(0, 2).map(a => `- ${a}`).join('\n')}
Предложи конкретные действия в приложении если уместно.`;
}
export function getSmartSubstitutions(exerciseName: string): string {
  const subs: Record<string, Array<{ name: string; reason: string }>> = {
    'жим лёжа': [
      { name: 'Жим гантелей лёжа', reason: 'Большая амплитуда, независимая работа рук' },
      { name: 'Отжимания на брусьях', reason: 'Похожий паттерн, больше стабилизаторов' },
      { name: 'Жим в Смите', reason: 'Безопаснее без страховщика' },
    ],
    'присед': [
      { name: 'Жим ног в тренажёре', reason: 'Меньше нагрузки на позвоночник' },
      { name: 'Болгарские выпады', reason: 'Одностороннее развитие, хороший баланс' },
      { name: 'Приседания в Смите', reason: 'Фиксированная траектория, безопаснее' },
    ],
    'становая тяга': [
      { name: 'Румынская тяга', reason: 'Акцент на задней поверхности бедра, меньше нагрузки на поясницу' },
      { name: 'Гиперэкстензия', reason: 'Укрепляет поясницу без осевой нагрузки' },
      { name: 'Тяга гантелей', reason: 'Снижает нагрузку на позвоночник' },
    ],
    'подтягивания': [
      { name: 'Тяга верхнего блока', reason: 'Тот же паттерн, регулируемый вес' },
      { name: 'Тяга в тренажёре', reason: 'Изолированная работа широчайших' },
      { name: 'Австралийские подтягивания', reason: 'Проще, хорошая база' },
    ],
  };

  const nameL = exerciseName.toLowerCase();
  for (const [key, alternatives] of Object.entries(subs)) {
    if (nameL.includes(key)) {
      return `\n\n## 🔄 АЛЬТЕРНАТИВЫ: ${exerciseName}
${alternatives.map(a => `• **${a.name}** — ${a.reason}`).join('\n')}`;
    }
  }
  return '';
}
export function getMuscleActivationCues(exerciseName: string): string {
  const cues: Record<string, string[]> = {
    'жим лёжа': [
      'Представь, что пытаешься согнуть гриф руками друг к другу — грудь включится сильнее',
      'Вдавливай лопатки в скамью на протяжении всего движения',
    ],
    'присед': [
      'Раздвигай пол ногами в стороны — ягодицы активируются',
      'Смотри вперёд и чуть вверх — поможет держать спину прямой',
    ],
    'становая тяга': [
      'Представь, что отталкиваешь пол от себя, а не тянешь гриф вверх',
      'Перед подъёмом: большой вдох в живот, напряги кор как при ударе',
    ],
    'подтягивания': [
      'Начинай с того, что опускаешь лопатки вниз — потом уже тяни локти',
      'Представь, что пытаешься засунуть локти в карманы',
    ],
    'тяга штанги': [
      'Веди локти как можно выше — не тяни руками, тяни локтями',
      'В верхней точке сведи лопатки как будто хочешь зажать карандаш',
    ],
  };

  const nameL = exerciseName.toLowerCase();
  for (const [key, activationCues] of Object.entries(cues)) {
    if (nameL.includes(key)) {
      return `\n\n## 🧠 МЕНТАЛЬНЫЕ СИГНАЛЫ: ${exerciseName}
${activationCues.map(c => `💡 ${c}`).join('\n')}`;
    }
  }
  return '';
}
export function buildMuscleActivationContext(exercises: string[]): string {
  const all: string[] = [];
  for (const ex of exercises.slice(0, 2)) {
    const cue = getMuscleActivationCues(ex);
    if (cue) all.push(cue);
  }
  return all.join('');
}
export function getAdaptiveCoachingStyle(
  fitnessLevel: string | null,
  totalWorkouts: number,
  recentFailures: number, // workouts with <70% completion
): string {
  let style: string;
  let approach: string;

  if (totalWorkouts < 20 || fitnessLevel === 'beginner') {
    style = 'Поддерживающий';
    approach = 'Акцент на мотивации, объяснение "зачем", простые инструкции. Не перегружай техническими деталями.';
  } else if (recentFailures >= 2) {
    style = 'Восстановительный';
    approach = 'Уменьши давление. Анализируй причины незавершённых тренировок. Предложи облегчённый вариант.';
  } else if (fitnessLevel === 'advanced' || totalWorkouts > 200) {
    style = 'Партнёрский';
    approach = 'Технические детали приветствуются. Обсуждай нюансы периодизации. Пользователь знает что делает.';
  } else {
    style = 'Прогрессивный';
    approach = 'Постепенно усложняй информацию. Объясняй принципы, не только упражнения.';
  }

  return `\n\n## 🎓 СТИЛЬ КОУЧИНГА: ${style}
${approach}`;
}
export function checkVolumeBalance(
  weekWorkouts: Array<{
    exercises: Array<{ exercise: { muscleGroup: string }; sets: Array<{ completed: boolean }> }>;
  }>,
): string {
  const volumeByGroup: Record<string, number> = {};

  for (const wo of weekWorkouts) {
    for (const ex of wo.exercises) {
      const mg = ex.exercise?.muscleGroup;
      if (!mg) continue;
      const sets = ex.sets.filter(s => s.completed).length;
      volumeByGroup[mg] = (volumeByGroup[mg] || 0) + sets;
    }
  }

  if (Object.keys(volumeByGroup).length === 0) return '';

  const pushMuscles = ['chest', 'shoulders', 'triceps'];
  const pullMuscles = ['back', 'biceps'];

  const pushSets = pushMuscles.reduce((s, m) => s + (volumeByGroup[m] || 0), 0);
  const pullSets = pullMuscles.reduce((s, m) => s + (volumeByGroup[m] || 0), 0);

  if (pushSets === 0 || pullSets === 0) return '';

  const ratio = pushSets / pullSets;
  if (ratio > 1.5) {
    return `\n\n## ⚖️ БАЛАНС НАГРУЗКИ
Тяговые упражнения в дефиците (Push: ${pushSets} сетов, Pull: ${pullSets} сетов).
Добавь тяговые движения: тяга штанги, подтягивания, тяга блока.
Дисбаланс ведёт к проблемам с плечами.`;
  }

  if (ratio < 0.7) {
    return `\n\n## ⚖️ БАЛАНС НАГРУЗКИ
Жимовые упражнения в дефиците (Push: ${pushSets} сетов, Pull: ${pullSets} сетов).
Добавь жимовые движения: жим лёжа, жим стоя, отжимания.`;
  }

  return '';
}
export function enforceCompoundFirst(
  workoutExercises: string[],
): string {
  if (workoutExercises.length === 0) return '';

  const compounds = ['жим лёжа', 'присед', 'становая', 'тяга штанги', 'жим стоя', 'подтягиван', 'отжимания'];
  const isolations = ['бицепс', 'трицепс', 'подъём', 'разведение', 'сгибание', 'разгибание', 'пресс'];

  const firstExercise = workoutExercises[0].toLowerCase();
  const isFirstCompound = compounds.some(c => firstExercise.includes(c));
  const isFirstIsolation = isolations.some(i => firstExercise.includes(i));

  if (isFirstIsolation && !isFirstCompound) {
    const suggestedCompound = compounds.find(c =>
      workoutExercises.some(e => e.toLowerCase().includes(c)),
    );

    return `\n\n## ⚠️ ПОРЯДОК УПРАЖНЕНИЙ
Тренировка начинается с изолирующего упражнения (${workoutExercises[0]}).
Рекомендация: начинай с базовых (составных) упражнений — они требуют больше сил и нервной энергии.
${suggestedCompound ? `Поставь "${suggestedCompound}" первым.` : 'Начни с приседа, жима или тяги.'}`;
  }

  return '';
}
export function generateMonthlyChallenge(
  fitnessLevel: string | null,
  goal: string | null,
  currentStreak: number,
): string {
  const challenges: Array<{ level: string; name: string; description: string }> = [
    {
      level: 'beginner',
      name: '30 дней последовательности',
      description: 'Тренируйся 3 раза в неделю весь месяц. Цель: 12 тренировок.',
    },
    {
      level: 'intermediate',
      name: 'Месяц базы',
      description: 'Каждую неделю увеличивай рабочие веса в присяде, жиме лёжа и тяге на 2.5кг.',
    },
    {
      level: 'advanced',
      name: 'Силовой месяц',
      description: '4 недели по 5/3/1: неделя 1 (65/75/85%), неделя 2 (70/80/90%), неделя 3 (75/85/95%), неделя 4 deload.',
    },
    {
      level: 'any',
      name: 'Вызов питания',
      description: 'Весь месяц записывай каждый приём пищи. Попади в норму белка 25 из 30 дней.',
    },
  ];

  const levelChallenges = challenges.filter(c => c.level === (fitnessLevel || 'beginner') || c.level === 'any');
  const pick = levelChallenges[currentStreak % levelChallenges.length] || levelChallenges[0];

  // Вызов месяца выбирался по уровню и стрику, но не по тому, ради чего
  // человек тренируется: цель приходила в функцию и не использовалась.
  // Худеющему могли предложить прибавлять 2.5 кг в базе каждую неделю.
  const goalTwist = {
    WEIGHT_LOSS: 'Под твою цель: считай вызов выполненным, если за месяц вес снизился, а рабочие веса остались прежними.',
    MUSCLE_GAIN: 'Под твою цель: добавь к вызову +1 кг собственного веса за месяц — без этого прибавка силы будет медленной.',
    STRENGTH: 'Под твою цель: измеряй вызов не тренировками, а суммой в трёх базовых движениях на конец месяца.',
    ENDURANCE: 'Под твою цель: добавь к вызову одну длинную тренировку в неделю — она и двигает выносливость.',
  }[String(goal || '')];

  return `\n\n## 🏆 ВЫЗОВ МЕСЯЦА: ${pick.name}
${pick.description}${goalTwist ? `\n${goalTwist}` : ''}
Хочешь принять вызов? Скажи "да" — и я буду следить за прогрессом.`;
}
export function checkOvertainingSyndrome(
  message: string,
  fatigueStatus: string,
  sleepIssues: boolean,
  consecutiveHighIntensityDays: number,
): string {
  const symptoms: string[] = [];

  const otSymptoms = {
    mood: /раздражен|злой|депрессия|апатия|не хочу ничего/i,
    sleep: /плохо сплю|не сплю|бессонниц|усталость после сна/i,
    performance: /стал слабее|снизились результаты|не могу поднять|регрессирую/i,
    physical: /постоянно болят мышцы|не восстанавливаюсь|частые простуды|сердце учащённое/i,
  };

  if (otSymptoms.mood.test(message)) symptoms.push('нарушение настроения/мотивации');
  if (otSymptoms.sleep.test(message) || sleepIssues) symptoms.push('нарушения сна');
  if (otSymptoms.performance.test(message)) symptoms.push('снижение результатов');
  if (otSymptoms.physical.test(message)) symptoms.push('хроническая боль/болезни');

  if (fatigueStatus === 'overreaching' || fatigueStatus === 'dangerous') {
    symptoms.push('перегрузка по данным тренировок');
  }

  if (consecutiveHighIntensityDays >= 5) {
    symptoms.push(`${consecutiveHighIntensityDays} дней высокой интенсивности подряд`);
  }

  if (symptoms.length < 2) return '';

  return `\n\n## 🚨 ВОЗМОЖНЫЙ СИНДРОМ ПЕРЕТРЕНИРОВАННОСТИ
Симптомы: ${symptoms.join(', ')}
Что делать: 1 неделя полного отдыха или очень лёгкой активности.
Затем постепенное возвращение с 50% объёма.
Перетренированность — не слабость, это физиология.`;
}
export function detectWeekendWarrior(
  workouts: Array<{ completedAt: Date | null }>,
): string {
  if (workouts.length < 4) return '';

  const workoutDays = workouts
    .filter(w => w.completedAt)
    .map(w => new Date(w.completedAt!).getDay()); // 0=Sun, 6=Sat

  const weekendCount = workoutDays.filter(d => d === 0 || d === 6).length;
  const weekdayCount = workoutDays.filter(d => d >= 1 && d <= 5).length;

  if (weekendCount === 0 || weekdayCount > weekendCount) return '';

  const ratio = weekendCount / workouts.length;
  if (ratio < 0.6) return '';

  return `\n\n## 📅 ЗАМЕТИЛ ПАТТЕРН: ТРЕНИРОВКИ В ОСНОВНОМ В ВЫХОДНЫЕ
Это называется "синдром выходного бойца". Риски: травмы, меньший прогресс.
Попробуй добавить хотя бы 1-2 тренировки в будни — пусть короткие (30 мин).
Регулярность > интенсивность для долгосрочного прогресса.`;
}
export function getSeasonalAdjustments(): string {
  const month = new Date().getMonth(); // 0-11

  if (month >= 11 || month <= 1) { // Dec-Feb (Russian winter)
    return `\n\n## ❄️ ЗИМНИЕ РЕКОМЕНДАЦИИ
Зима в России: меньше витамина D → добавляй витамин D3 (2000-4000 МЕ/день).
Тёмное время суток влияет на сон и настрой — поддерживай режим тренировок.
Холод увеличивает потребность в калориях на 5-10%.`;
  }

  if (month >= 5 && month <= 7) { // Jun-Aug (Russian summer)
    return `\n\n## ☀️ ЛЕТНИЕ РЕКОМЕНДАЦИИ
Жара увеличивает расход воды на 500-1000 мл.
Тренируйся в прохладное время (утро/вечер).
Летний период — хорошее время для активного кардио и работы над рельефом.`;
  }

  if (month >= 2 && month <= 4) { // Mar-May (spring)
    return `\n\n## 🌱 ВЕСЕННИЕ РЕКОМЕНДАЦИИ
Весна — отличное время для интенсификации после зимы.
Начинай добавлять кардио для подготовки к летнему сезону.
Возможна весенняя усталость — проверь витамины (D, B12, железо).`;
  }

  return ''; // Autumn — no special advice needed
}
export function personalizeFrequency(goal: string | null, recoveryScore: number, fitnessLevel: string | null): string {
  if (recoveryScore === 0) return '';

  let baseDays = 3;
  let advice = '';

  if (goal === 'weight_loss') baseDays = 4;
  else if (goal === 'muscle_gain') baseDays = 4;
  else if (goal === 'strength') baseDays = 3;
  else if (goal === 'endurance') baseDays = 5;

  if (fitnessLevel === 'beginner') baseDays = Math.min(baseDays, 3);
  else if (fitnessLevel === 'advanced') baseDays = Math.min(baseDays + 1, 6);

  if (recoveryScore < 40) {
    baseDays = Math.max(baseDays - 1, 2);
    advice = 'Ваше восстановление ниже нормы — снизьте частоту или добавьте день отдыха.';
  } else if (recoveryScore > 75) {
    advice = 'Отличное восстановление — можете добавить дополнительную сессию если хотите.';
  } else {
    advice = 'Восстановление в норме — текущая частота оптимальна.';
  }

  return `\n\n📅 Оптимальная частота тренировок для вас: ${baseDays} дней/неделю\n${advice}`;
}
export function conductLifestyleAudit(message: string, sleepScore: number, stressLevel: number, recoveryScore: number): string {
  const lowerMsg = message.toLowerCase();
  const noProgressKeywords = ['не растёт', 'нет прогресса', 'стагнация', 'плато', 'не худею', 'не набираю', 'топчусь на месте', 'результатов нет'];
  const hasNoProgress = noProgressKeywords.some(kw => lowerMsg.includes(kw));

  if (!hasNoProgress) return '';

  const issues: string[] = [];
  if (sleepScore < 60) issues.push(`😴 Сон: ${sleepScore}/100 — недостаточный отдых тормозит восстановление и рост`);
  if (stressLevel > 65) issues.push(`😰 Стресс: ${stressLevel}/100 — хронический стресс повышает кортизол, блокирующий рост мышц`);
  if (recoveryScore < 50) issues.push(`⚡ Восстановление: ${recoveryScore}/100 — вы накопили усталость, прогресс заблокирован`);

  if (!issues.length) {
    return '\n\n🔍 Аудит образа жизни: показатели сна и стресса в норме. Возможные причины плато: недостаточная калорийность, монотонность программы или нужна деload-неделя.';
  }

  return `\n\n🔍 Аудит образа жизни — обнаруженные проблемы:
${issues.join('\n')}

Тренировки — лишь 1 час из 24. Остальные 23 часа определяют ваш прогресс.`;
}
export function suggestBodyPartSpecialization(message: string, muscleGroupVolumes: Record<string, number>): string {
  const lowerMsg = message.toLowerCase();
  const specialRequests: Record<string, string> = {
    'руки': 'бицепс, трицепс',
    'бицепс': 'бицепс',
    'трицепс': 'трицепс',
    'плечи': 'дельтовидные',
    'спина': 'широчайшие, трапеция',
    'грудь': 'грудные',
    'ноги': 'квадрицепс, бицепс бедра, икры',
    'пресс': 'кор',
    'икры': 'икроножные',
  };

  const requestedMuscle = Object.keys(specialRequests).find(kw => lowerMsg.includes(kw));

  if (!requestedMuscle) return '';

  const specializations: Record<string, string[]> = {
    'руки': ['Подъём штанги на бицепс (3x10-12)', 'Молотковые сгибания (3x12)', 'Французский жим (3x10)', 'Отжимания на брусьях узким хватом (3xmax)'],
    'плечи': ['Жим Арнольда (4x10)', 'Боковые подъёмы (4x15)', 'Тяга к подбородку (3x12)', 'Протяжка штанги (3x12)'],
    'спина': ['Подтягивания широким хватом (4xmax)', 'Тяга нижнего блока (4x10)', 'Шраги с гантелями (3x15)', 'Тяга Т-грифа (3x10)'],
    'грудь': ['Жим под углом вверх (4x10)', 'Разводка с гантелями (3x12)', 'Сведение в кроссовере (3x15)', 'Пуловер (3x12)'],
    'ноги': ['Фронтальный присед (4x8)', 'Румынская тяга (4x10)', 'Разгибания ног (3x15)', 'Сгибания ног (3x15)', 'Подъём на носки (4x20)'],
    'пресс': ['Скручивания на блоке (4x15)', 'Подъём ног в висе (3x12)', 'Планка 3x60сек', 'Русские скручивания (3x20)'],
    'икры': ['Подъём на носки стоя (5x20)', 'Подъём на носки сидя (5x15)', 'Осликовые подъёмы (3x25)'],
  };

  const exList = specializations[requestedMuscle] ?? specializations['руки'];

  // Специализация имеет смысл на отстающей группе и вредна на той, что и так
  // получает больше всех. Объёмы по группам приходили в функцию и не
  // использовались, так что «хочу руки» одобрялось и тому, кто уже качает их
  // трижды в неделю.
  const volumes = Object.entries(muscleGroupVolumes || {}).filter(([, v]) => v > 0);
  let volumeNote = '';
  if (volumes.length >= 3) {
    const sorted = [...volumes].sort((a, b) => b[1] - a[1]);
    const topGroup = sorted[0][0].toLowerCase();
    const asked = requestedMuscle.toLowerCase();
    const alreadyTop = topGroup.includes(asked) || asked.includes(topGroup);
    const lowest = sorted[sorted.length - 1];
    volumeNote = alreadyTop
      ? `\n⚠️ По объёму «${topGroup}» и так на первом месте у тебя. Ещё специализация сверху даст мало — отстаёт «${lowest[0]}».`
      : `\nПо объёму меньше всего получает «${lowest[0]}» (${Math.round(lowest[1])} кг за период) — если выбирать, куда добавлять, то туда.`;
  }

  return `\n\n🎯 Специализация на ${specialRequests[requestedMuscle]}:
Добавьте эти упражнения 2 раза в неделю:
${exList.map(ex => `• ${ex}`).join('\n')}${volumeNote}

Для заметного результата: 6-8 недель акцентированной работы на эту группу.`;
}
export function guideMindMuscleConnection(message: string, exerciseNames: string[]): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['не чувствую мышцу', 'не качает', 'ментальная связь', 'не ощущаю', 'не чувствую грудь', 'не чувствую спину'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const tips: Record<string, string> = {
    'грудь': 'Жим: представьте что сводите локти к центру груди, а не толкаете штангу. Перед жимом — 30 сек сжимайте кулаки с максимальной силой (активирует ЦНС).',
    'спина': 'Тяги: начинайте движение с лопаток (сводите их), а не с рук. Представьте что хотите сломать гриф, разводя руки в стороны.',
    'бицепс': 'Сгибания: поворачивайте мизинец наружу в верхней точке. Держите локоть строго у тела.',
    'трицепс': 'Разгибания: представьте что хотите пробить стену локтем — не просто разгибайте руку.',
    'ноги': 'Приседания: давите пятками в пол и "раздвигайте пол" ногами в стороны — активирует ягодицы и приводящие.',
  };

  const matched = Object.entries(tips).find(([key]) => lowerMsg.includes(key) || exerciseNames.some(e => e.toLowerCase().includes(key)));

  const tipText = matched ? matched[1] : 'Общее правило: замедлите движение, используйте зеркало, уменьшите вес на 20-30% для фокуса на ощущениях.';

  return `\n\n🧠 Ментальная связь мозг-мышца:\n${tipText}\n\nИсследования: осознанная концентрация на мышце повышает её активацию на 20-35%.`;
}
export function screenFunctionalMovement(message: string, injuryZones: string[]): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['болит колено', 'болит спина', 'болит плечо', 'болит локоть', 'болит запястье', 'боль при'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant && !injuryZones.length) return '';

  const painZone = injuryZones[0] ?? 'неизвестная зона';

  return `\n\n🏥 Функциональный скрининг при боли в ${painZone}:

**Немедленно:**
• Оцените боль по шкале 1-10. Выше 4 — прекратите упражнение.
• Отличайте "рабочую боль" (жжение в мышце) от "суставной" (резкая, с щелчком, нарастает).

**Тест движения:**
• Выполните движение без нагрузки. Боль есть? → Исключите упражнение на 1-2 недели.
• Боль только под нагрузкой? → Снизьте вес на 50%, выполняйте с полным контролем.

**Замены:**
• Болит колено при приседе → жим ногами под большим углом, разгибания на тренажёре
• Болит плечо при жиме → жим нейтральным хватом на тренажёре, отжимания
• Болит поясница → упражнения лёжа, гиперэкстензия с собственным весом

⚠️ Постоянная боль 3+ дня = консультация врача.`;
}
export function getHormonalOptimizationTips(message: string, goal: string | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['гормоны', 'тестостерон', 'кортизол', 'гормон роста', 'инсулин', 'гормональный фон'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  // Один и тот же текст выдавался человеку на сушке и на массе, хотя главный
  // гормональный фактор у них разный. Цель приходила в функцию и не
  // использовалась вообще.
  const goalHormoneNote = {
    WEIGHT_LOSS: '\n**Главное на дефиците:** глубокий дефицит и недосып роняют тестостерон сильнее, чем любые добавки его поднимают. Дефицит держи умеренным, сон — в приоритете.',
    MUSCLE_GAIN: '\n**Главное на наборе:** гормональный отклик от тренировки короткий и на рост влияет слабо. Решают питание и объём, а не «выброс тестостерона» после приседа.',
    STRENGTH: '\n**Главное на силе:** кортизол от долгих тяжёлых сессий бьёт по восстановлению нервной системы. Держи тренировку в 60-75 минут, остальное — вред.',
    ENDURANCE: '\n**Главное на выносливости:** большие объёмы кардио при недоедании роняют тестостерон и щитовидку. Углеводы тут не враг, а условие.',
  }[String(goal || '')] || '';

  return `\n\n⚗️ Гормональная оптимизация для тренировок:

**Тестостерон (анаболизм):**
• Многосуставные упражнения (присед, становая) дают максимальный гормональный отклик
• Сон 7-9 часов: 60% суточного тестостерона вырабатывается ночью
• Цинк 25-30мг, Витамин D3 2000-4000 МЕ
• Исключите хронический стресс и >2 часов алкоголя/неделю

**Кортизол (катаболизм) — минимизировать:**
• Тренировки >90 мин резко повышают кортизол — держите сессии в 45-75 мин
• Избегайте тренировок на голодный желудок при силовых целях
• Медитация 10 мин/день снижает кортизол на 14%

**Гормон роста (жиросжигание + восстановление):**
• Пик выброса: первые 2 часа сна — не ешьте за 2-3 часа до сна
• HIIT-тренировки дают +450% GH vs кардио в равномерном темпе
• Интерваль­ное голодание 16/8 увеличивает базовый GH
${goalHormoneNote}`;
}
export function explainMuscleFliberTypes(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['медленные волокна', 'быстрые волокна', 'тип мышечных волокон', 'why не растут', 'генетика мышц'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n🧬 Типы мышечных волокон:

**Тип I (медленные, выносливые):**
• Красные, богаты митохондриями
• Устойчивы к усталости, слабо гипертрофируются
• Тренируются: высокие повторения (15-25+), короткий отдых
• Пример: икроножные у марафонцев

**Тип IIa (промежуточные, тренируемые):**
• Переключаются между режимами при тренировках
• Гипертрофируются хорошо при 8-15 повторениях

**Тип IIx (быстрые, взрывные):**
• Белые, мощные, быстро устают
• Максимальная гипертрофия — при 1-6 повторениях, взрывных движениях
• Чаще у людей с "пауэрлифтерским" телосложением

💡 Оптимальная тренировка гипертрофии охватывает ВСЕ типы: 6-8 тяжёлые + 10-15 средние + 20+ лёгкие подходы в одну сессию.`;
}
export function listGymBagEssentials(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['что взять', 'сумка в зал', 'снаряжение', 'экипировка', 'что нужно в зал'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n🎒 Что взять в зал:

**Базовый набор:**
• Спортивная форма (дышащая, не стесняет движений)
• Кроссовки с хорошей боковой поддержкой (не беговые для силовых!)
• Полотенце (личное — гигиена)
• Бутылка с водой 750мл-1л

**Для лучших результатов:**
• Ремень штангиста (для присяда/становой >80% от 1ПМ)
• Наколенники или бинты (при проблемах с суставами)
• Кистевые лямки (для тяговых упражнений >100кг)
• Блокнот или телефон для записи результатов

**Питание:**
• Протеиновый батончик или шейкер с протеином
• Банан (до или после)

**Опционально:**
• Беруши/наушники (фокус)
• Мел (улучшает хват)
• Пояс для тяжёлой атлетики`;
}
export function planRestDayActivity(message: string, fatigueStatus: string): string {
  const lowerMsg = message.toLowerCase();
  const isRestDay = ['день отдыха', 'не тренируюсь', 'отдыхаю', 'что делать в день отдыха', 'активный отдых'].some(kw => lowerMsg.includes(kw));
  if (!isRestDay) return '';

  const isDangerous = fatigueStatus === 'dangerous' || fatigueStatus === 'overreaching';

  if (isDangerous) {
    return `\n\n🛋 День отдыха (у вас признаки накопленной усталости):
Сегодня: только пассивное восстановление
• Сон 8-9 часов
• Лёгкая прогулка 20-30 мин (пульс не выше 110 уд/мин)
• МФР (foam roller) для ног и спины
• Никакого HIIT, никаких «лёгких» тренировок`;
  }

  return `\n\n🌿 Активный отдых — лучше полного безделья:
• **Лёгкая прогулка/велосипед** 30-45 мин (пульс 100-120) → ускоряет вывод молочной кислоты
• **Йога/стретчинг** 20-30 мин → улучшает гибкость и снимает мышечный тонус
• **Бассейн** — идеально для разгрузки суставов при активной работе мышц
• **МФР** (пенный ролик) для болезненных зон 10-15 мин

Активное восстановление снижает DOMS на 20-30% и ускоряет готовность к следующей тренировке.`;
}
export function guideMicronutrients(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['витамины', 'минералы', 'железо', 'витамин д', 'витамин с', 'магний', 'цинк', 'микронутриенты'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n💊 Ключевые микронутриенты для спортсменов:

| Нутриент | Зачем | Источники | Дополнительно |
|---|---|---|---|
| **Витамин D3** | Тестостерон, иммунитет, кости | Жирная рыба, яйца | 2000-4000 МЕ/день (РФ — дефицит у 70%) |
| **Магний** | Качество сна, мышечные сокращения | Орехи, тёмный шоколад | 300-400мг перед сном |
| **Цинк** | Синтез тестостерона | Говядина, тыквенные семечки | 15-25мг/день (ZMA) |
| **Железо** | Перенос кислорода, выносливость | Красное мясо, шпинат | Особенно важно девушкам |
| **Омега-3** | Воспаление, мозг, суставы | Жирная рыба, льняное масло | 2-3г EPA+DHA/день |
| **Витамин C** | Коллаген, иммунитет | Цитрусовые, перец | 500-1000мг при интенсивных тренировках |`;
}
export function debunkBMI(message: string, bodyWeightKg: number | null, heightCm: number | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['bmi', 'имт', 'индекс массы тела', 'нормальный ли вес', 'ожирение по бми'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  let bmiNote = '';
  if (bodyWeightKg && heightCm) {
    const bmi = bodyWeightKg / Math.pow(heightCm / 100, 2);
    bmiNote = `\nВаш ИМТ: **${bmi.toFixed(1)}** — `;
    if (bmi < 18.5) bmiNote += 'недостаточный вес';
    else if (bmi < 25) bmiNote += 'норма';
    else if (bmi < 30) bmiNote += 'избыточный вес';
    else bmiNote += 'ожирение';
    bmiNote += '\nНо помните: ИМТ не отличает мышцы от жира.';
  }

  return `\n\n⚖️ ИМТ — устаревший показатель:${bmiNote}

**Почему ИМТ вводит в заблуждение:**
• Профессиональные спортсмены часто имеют ИМТ "ожирение" (мышцы тяжелее жира)
• Не учитывает распределение жира (висцеральный жир у живота опаснее)
• Не показывает процент мышечной массы

**Лучшие показатели:**
• Обхват талии (норма: <80см женщины, <94см мужчины)
• Соотношение талия/бёдра
• Процент жира (DEXA, импедансометрия)
• Силовые показатели и самочувствие`;
}
export function guideHeartRateZones(message: string, dateOfBirth: Date | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['пульс', 'зоны пульса', 'ЧСС', 'сердцебиение', 'пульсовые зоны', 'кардио пульс'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const age = dateOfBirth ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365)) : 30;
  const maxHR = 220 - age;

  const z1 = Math.round(maxHR * 0.5);
  const z2 = Math.round(maxHR * 0.6);
  const z3 = Math.round(maxHR * 0.7);
  const z4 = Math.round(maxHR * 0.8);
  const z5 = Math.round(maxHR * 0.9);

  return `\n\n❤️ Пульсовые зоны (возраст: ${age} лет, макс. ЧСС: ~${maxHR} уд/мин):\n\n• **Зона 1** (Восстановление): <${z1} — прогулка, активный отдых\n• **Зона 2** (Жиросжигание): ${z1}-${z2} — лёгкое кардио, можно говорить\n• **Зона 3** (Аэробная): ${z2}-${z3} — умеренная нагрузка, небольшое напряжение\n• **Зона 4** (Порог): ${z3}-${z4} — HIIT, тяжёлое дыхание\n• **Зона 5** (Максимум): ${z4}-${z5}+ — спринты, только короткие интервалы\n\n💡 80% тренировок — зона 2-3. 20% — зона 4-5. Это "правило 80/20" для долгосрочного прогресса.`;
}
export function bustFitnessMyths(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['миф', 'правда ли', 'слышал что', 'говорят что', 'так ли', 'действительно ли'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const myths = [
    { myth: 'Жир сжигается в зоне', fact: 'Нельзя сжечь жир в конкретном месте. Жир уходит равномерно со всего тела при общем дефиците калорий.' },
    { myth: 'Мышцы превращаются в жир', fact: 'Мышцы и жир — разные ткани. При прекращении тренировок мышцы уменьшаются (атрофируются), жир накапливается от профицита калорий — отдельные процессы.' },
    { myth: 'Кардио убивает мышцы', fact: 'Умеренное кардио (2-3x/неделю, 30-40 мин) не влияет на набор мышц. Проблема — когда кардио + дефицит калорий + мало белка.' },
    { myth: 'Без боли нет результата', fact: 'DOMS (крепатура) — нормально для начинающих, но не показатель качества тренировки. Профессионалы редко испытывают DOMS.' },
    { myth: 'Протеин вредит почкам', fact: 'Здоровым людям при достаточном потреблении воды — 2.0-2.5г/кг белка абсолютно безопасны. Ограничения только при хронических заболеваниях почек.' },
  ];

  const idx = new Date().getDate() % myths.length;
  const m = myths[idx];
  return `\n\n🔍 Развенчание мифа:\n❌ Миф: «${m.myth}»\n✅ Факт: ${m.fact}`;
}
export function getNutrientDeficiencyAlerts(message: string, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['витамин', 'минерал', 'дефицит', 'нехватка', 'добавки', 'supplement', 'железо', 'магний', 'цинк', 'd3', 'b12', 'омега'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isMass = userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy';
  const isWeightLoss = userGoalStr === 'weight_loss' || userGoalStr === 'cutting';

  const lines: string[] = ['🔬 **Типичные дефициты у спортсменов в России:**', ''];

  lines.push('**Витамин D3** (дефицит у ~80% россиян, особенно зима)');
  lines.push('• Симптомы: усталость, снижение иммунитета, боли в мышцах');
  lines.push('• Дозировка: 2000-4000 МЕ/день в осенне-зимний период');
  lines.push('• Принимать с жиром (жирорастворимый), лучше с K2-MK7');
  lines.push('');

  lines.push('**Магний** (дефицит у 70% при тренировках)');
  lines.push('• Симптомы: судороги, плохой сон, раздражительность, высокое давление');
  lines.push('• Спортсмены теряют с потом в 2-3 раза больше нормы');
  lines.push('• Дозировка: 300-400 мг/день (цитрат или глицинат — лучшая усвояемость)');
  lines.push('');

  lines.push('**Цинк** (теряется с потом)');
  lines.push('• Нужен для синтеза тестостерона и восстановления');
  lines.push('• Дозировка: 15-25 мг/день, принимать отдельно от кальция/железа');
  lines.push('');

  if (isMass) {
    lines.push('**Для набора мышц особенно важны:**');
    lines.push('• Омега-3 (1-3г ЭПК+ДГК): снижает воспаление, ускоряет рост мышц');
    lines.push('• Витамин B12 (при недостатке мяса): синтез белка и нервная система');
  }

  if (isWeightLoss) {
    lines.push('**При дефиците калорий следи за:**');
    lines.push('• Железо (особенно у женщин): риск анемии при ограниченном питании');
    lines.push('• Электролиты: натрий, калий, магний теряются при дефиците углеводов');
  }

  lines.push('');
  lines.push('⚠️ Анализ крови 1-2 раза в год — лучший способ выявить реальные дефициты.');

  return '\n\n' + lines.join('\n');
}
export function getCoachPersona(message: string, totalWorkoutsEver: number): string {
  const lower = message.toLowerCase();
  const keywords = ['строже', 'жёстче', 'мягче', 'motivat', 'мотивир', 'как тренер', 'поддержи', 'подбодри', 'накричи', 'требовательн'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isExperienced = totalWorkoutsEver > 100;
  const wantsTough = lower.includes('строже') || lower.includes('жёстче') || lower.includes('накричи') || lower.includes('требовательн');
  const wantsSoft = lower.includes('мягче') || lower.includes('поддержи') || lower.includes('подбодри');

  if (wantsTough) {
    return `\n\n💪 **Режим жёсткого тренера включён:**\n\nОтговорок больше нет. Ты пришёл сюда за результатом — значит, работаем. Каждый пропуск тренировки — шаг назад. Каждый лишний приём пищи — минус к прогрессу. Слабость — это выбор. Сила — тоже выбор.\n\nГотов? Тогда вперёд. Расскажи, что сегодня делаешь — я разберу по деталям.`;
  }

  if (wantsSoft) {
    return `\n\n🌟 **Режим поддержки:**\n\nЗнаешь что? Ты уже молодец — то, что ты здесь и работаешь над собой, важнее любых результатов. Прогресс не всегда виден сразу, но он есть. Каждая тренировка, даже самая тяжёлая, делает тебя чуть сильнее — физически и ментально.\n\nЧем сегодня могу помочь?`;
  }

  return `\n\n🏋️ **Твой тренер Iron Coach:**\nЯ адаптируюсь под твои нужды. ${isExperienced ? `У тебя уже ${totalWorkoutsEver} тренировок — серьёзный путь. Работаем как взрослые профессионалы.` : 'Ты только начинаешь — я здесь, чтобы помочь, объяснить и поддержать.'}\nХочешь строже или мягче — просто скажи.`;
}
export function getGripVariations(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['хват', 'grip', 'ширина хвата', 'пронация', 'супинация', 'нейтральный хват', 'прямой хват', 'обратный хват'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n✋ **Варианты хвата и их влияние:**

**В упражнениях на спину:**
• Широкий хват (тяга/подтягивания): акцент на широчайшие, меньше бицепс
• Узкий хват: больше нижние трапеции, бицепс активнее
• Нейтральный (параллельный): наилучшая нагрузка для большинства + щадит плечи
• Обратный (супинация): бицепс максимально включён, удобен при слабом хвате

**В жиме:**
• Широкий хват (жим лёжа): акцент грудь, меньше трицепс
• Узкий хват: трицепс, нижняя грудь
• Обратный хват жим лёжа: верхняя грудь — нестандартно, но работает

**В тягах на бицепс:**
• Прямой (пронация): акцент на плечевую мышцу (брахиалис) — добавляет объём
• Обратный (супинация): классика, двуглавая мышца
• Молотковый (нейтральный): брахиалис + брахиорадиалис (предплечье)

**Усиление хвата:**
• Рюкзак не нужен — тяни без лямок до отказа хвата, это его тренирует
• Фермерская ходьба: 30-60 сек с гантелями — лучший аксессуар для хвата
• Вис на турнике 30-60 сек — прогрессируй до одноруч

💡 Чередуй варианты хвата в циклах — разная стимуляция = лучший рост.`;
}
export function getBodyCompositionGoal(message: string, userGoalStr: string | null, weightKg: number | null, heightCm: number | null): string {
  const lower = message.toLowerCase();
  const keywords = ['состав тела', 'жировая масса', 'мышечная масса', 'процент жира', 'body composition', 'сколько жира', 'идеальный вес'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const lines: string[] = ['📊 **Состав тела — ориентиры и цели:**', ''];

  lines.push('**Здоровый диапазон жировой массы:**');
  lines.push('• Мужчины: 10-20% жира — здоровый диапазон; 8-12% — спортивная форма; < 8% — соревновательный рельеф');
  lines.push('• Женщины: 20-30% жира — здоровый диапазон; 15-22% — спортивная форма; < 15% — соревновательный рельеф');
  lines.push('');

  if (weightKg && heightCm) {
    const bmi = weightKg / ((heightCm / 100) ** 2);
    lines.push(`**Твои данные:**`);
    lines.push(`• Вес: ${weightKg} кг | Рост: ${heightCm} см | ИМТ: ${bmi.toFixed(1)}`);
    if (bmi < 18.5) lines.push('• ИМТ: недовес → цель набора мышечной массы');
    else if (bmi < 25) lines.push('• ИМТ: норма → можно работать над рекомпозицией или набором');
    else if (bmi < 30) lines.push('• ИМТ: избыточный вес → постепенный дефицит (500 ккал) + силовые');
    else lines.push('• ИМТ: ожирение → работа с врачом/нутрициологом + активность');
    lines.push('');
  }

  lines.push('**Реалистичные ожидания:**');
  lines.push('• Максимальный набор мышц (натурально): 1-2 кг/мес у начинающих, 0.5кг/мес у продвинутых');
  lines.push('• Оптимальное жиросжигание: 0.5-1% веса тела в неделю (сохраняет мышцы)');
  lines.push('• Рекомпозиция (одновременно набор + жиросжигание): возможна у новичков и людей с лишним весом, медленно');

  // Три ожидания разом — это выбор, который человек делает сам, хотя цель у
  // него уже указана. userGoalStr приходил сюда и не использовался.
  const goalTarget = {
    weight_loss: `• Твоя цель — похудение${weightKg ? `: ориентир ${(weightKg * 0.0075).toFixed(1)}-${(weightKg * 0.01).toFixed(1)} кг в неделю` : ''}. Быстрее — уходят мышцы.`,
    cutting: `• Твоя цель — сушка${weightKg ? `: ориентир ${(weightKg * 0.0075).toFixed(1)}-${(weightKg * 0.01).toFixed(1)} кг в неделю` : ''}. Быстрее — уходят мышцы.`,
    muscle_gain: '• Твоя цель — набор: ориентир 0.25-0.5 кг в неделю. Больше — это в основном жир, а не мышцы.',
    hypertrophy: '• Твоя цель — набор: ориентир 0.25-0.5 кг в неделю. Больше — это в основном жир, а не мышцы.',
    strength: '• Твоя цель — сила: вес можно держать на месте, ориентир — рост рабочих весов при неизменной массе.',
    endurance: '• Твоя цель — выносливость: резкое снижение веса ударит по объёмам, держи умеренный дефицит.',
  }[String(userGoalStr || '').toLowerCase()];
  if (goalTarget) lines.push(goalTarget);
  lines.push('');
  lines.push('💡 Весы — плохой показатель прогресса. Используй: обхваты, фото, ощущение одежды, силовые показатели.');

  return '\n\n' + lines.join('\n');
}
export function getSmartSubstitution(message: string, injuryZones: string[]): string {
  const lower = message.toLowerCase();
  const keywords = ['замена', 'заменить', 'альтернатива', 'болит', 'не могу делать', 'без станка', 'нет оборудования', 'substitute'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const subs: [string, string, string][] = [
    ['присед', 'жим ногами + болгарский сплит-сквот', 'колено/поясница'],
    ['становая', 'румынская тяга + гиперэкстензия', 'поясница'],
    ['жим лёжа', 'жим гантелей лёжа + отжимания', 'плечо/запястье'],
    ['подтягивания', 'тяга верхнего блока + тяга горизонтального блока', 'плечо'],
    ['жим плеч', 'подъём гантелей в стороны + махи + тяга к подбородку узким хватом', 'вращательная манжета'],
    ['выпады', 'степ-ап + жим ногами одной ногой + болгарский присед', 'колено'],
    ['скандинавский сгиб', 'лёжа на тренажёре сгибание ног + SL RDL', 'колено'],
  ];

  const result: string[] = ['🔄 **Умные замены упражнений:**', ''];

  let found = false;
  for (const [exercise, substitutes, injury] of subs) {
    if (lower.includes(exercise)) {
      result.push(`**Замена для "${exercise}":**`);
      result.push(`• ${substitutes}`);
      if (injuryZones.some(z => injury.includes(z.toLowerCase()))) {
        result.push(`⚠️ Учитывая твои ограничения (${injuryZones.join(', ')}) — начни с минимального веса`);
      }
      result.push('');
      found = true;
    }
  }

  if (!found) {
    result.push('Назови конкретное упражнение — и я подберу замену с учётом твоих ограничений и доступного оборудования.');
  }

  return '\n\n' + result.join('\n');
}
export function getFitnessAgeVsRealAge(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['биологический возраст', 'fitness age', 'возраст тела', 'сколько мне лет по состоянию', 'стареть медленнее', 'молодость'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🕰 **Фитнес-возраст vs биологический возраст:**

**Что такое фитнес-возраст:**
Оценивается по VO2max (максимальное потребление кислорода).
Исследование NTNU (Норвегия, 55,000 человек): 30-летние с низким VO2max имеют фитнес-возраст 50+.

**VO2max — главный предиктор:**
• Коррелирует с продолжительностью жизни сильнее, чем курение или ожирение
• Падает ~1% в год без тренировок (с 20 лет)
• Можно улучшить в любом возрасте при тренировках

**Что замедляет биологическое старение:**
• Силовые тренировки → сохраняют мышечную массу (саркопения = главный враг старения)
• Зона 2 кардио (низкоинтенсивная аэробика) → митохондрии, VO2max
• HIIT → гормон роста, кардиоадаптация
• Растяжка → подвижность суставов, профилактика падений

**Практика:**
• Мышечная масса после 40 критична: каждые 10 лет без тренировок -3-5% мышц
• 2-3 силовых + 2 кардио-сессии в неделю = разница в 10-15 лет фитнес-возраста

💡 Если тебе 40+: у тебя есть несколько десятилетий впереди — инвестируй в них сейчас.`;
}
export function getBeltUsageGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['пояс', 'belt', 'тяжелоатлетический пояс', 'нужен ли пояс', 'когда использовать пояс', 'powerlifting belt'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🔧 **Тяжелоатлетический пояс — когда и как использовать:**

**Что делает пояс:**
• Увеличивает внутрибрюшное давление (IAP) → стабилизирует позвоночник
• Снижает нагрузку на поясницу при максимальных весах
• Даёт тактильный сигнал для дыхания по Вальсальве

**ВАЖНО: пояс не замена силы кора**
Пояс усиливает уже существующую технику, но не заменяет сильный кор.
Атлет без пояса должен быть техничным.

**Когда использовать:**
✅ Приседания: > 80-85% от 1ПМ
✅ Становая тяга: > 85% от 1ПМ
✅ Тяжёлые горизонтальные тяги (Pendlay row)
❌ Лёгкие рабочие подходы — тренируй кор без пояса
❌ Изолирующие упражнения — нет смысла

**Как надевать:**
• На 2-3 пальца выше тазовых костей
• Не слишком туго — должен войти кулак в вертикальном положении
• При взятии позиции под нагрузкой — набери воздух, давите животом в пояс (Вальсальва)

**Типы:**
• Пауэрлифтинговый (4 дюйма равномерно): максимальная поддержка
• Тяжелоатлетический (сужается спереди): для рывка/толчка
• Нейлоновый (velcro): тренировочный, для умеренных нагрузок

💡 Привыкание к поясу: первые 3-4 тренировки будет чувствоваться неудобно — это нормально.`;
}
export function getCalvesGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['икры', 'calf', 'calves', 'голень', 'икроножная', 'камбаловидная', 'не растут икры'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🦵 **Икры — почему не растут и как это исправить:**

**Анатомия:**
• Икроножная мышца (gastrocnemius): двухсуставная, работает с прямой ногой, тип II волокон
• Камбаловидная (soleus): односуставная, работает в согнутом колене, тип I волокон

**Почему икры "не растут":**
1. Генетика: у некоторых людей мало мышечных волокон типа II в икрах
2. Недостаточная нагрузка: пешая ходьба не даёт стимула роста
3. Малая амплитуда: подъёмы без растяжки в нижней точке

**Протокол для роста:**

**Стоячий подъём на носки (икроножная):**
• Пятка полностью опускается ниже плоскости (растяжение)
• 3-4 × 12-15 с паузой 2 сек внизу
• Высокая нагрузка + полная амплитуда = ключ

**Сидячий подъём на носки (камбаловидная):**
• Колено согнуто под 90° → тренирует камбаловидную
• 3-4 × 15-20 (камбаловидная — выносливостная мышца, любит объём)
• Можно класть блин на бедро

**Частота:**
• Икры переносят 4-6 раз/нед — они привычны к большому объёму (ходьба каждый день)
• Но начни с 3 раз, добавляй постепенно

**Прогрессия:**
• Одна нога (Donkey calf raise) → максимальная нагрузка

💡 "Генетические" икры часто — просто недотренированные икры с малой амплитудой.`;
}
export function getMartialArtsAndGym(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('единоборств') || lower.includes('бокс') || lower.includes('mma') ||
    lower.includes('дзюдо') || lower.includes('самбо') || lower.includes('борьба') ||
    lower.includes('грэпплинг') || lower.includes('кикбоксинг') || lower.includes('кроссфит') && lower.includes('бокс');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🥊 СОВМЕЩЕНИЕ ЕДИНОБОРСТВ И ЗАЛА:');
  lines.push('');
  lines.push('⚡ ПРИНЦИПЫ:');
  lines.push('• Зал — вспомогательный инструмент, единоборства — приоритет');
  lines.push('• Не перегружай ЦНС: силовые и спарринги не в один день');
  lines.push('• Периодизация: базовая сила в межсезонье, поддержание в сезоне');
  lines.push('');
  lines.push('🏋️ ЧТО КАЧАТЬ:');
  lines.push('• Взрывная сила: приседы с прыжком, тяги, броски медбола');
  lines.push('• Grip strength: фермерская прогулка, вис, полотенечные тяги');
  lines.push('• Кор: планки, мёртвый жук, ротационные движения');
  lines.push('• Шея: специальные упражнения (важно для борьбы и ударных)');
  lines.push('');
  lines.push('📅 ПРИМЕР НЕДЕЛИ (3 тренировки единоборств):');
  lines.push('• Пн: единоборства | Вт: силовая (нижний) | Ср: единоборства');
  lines.push('• Чт: отдых/мобильность | Пт: единоборства | Сб: силовая (верх)');
  lines.push('• Вс: активное восстановление');
  lines.push('');
  lines.push('🇷🇺 Популярные российские единоборства: самбо, дзюдо, бокс, вольная борьба.');
  lines.push('Зал + самбо/дзюдо = отличная функциональная база.');
  return '\n\n' + lines.join('\n');
}
export function getCompoundVsIsolation(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('базов') && (lower.includes('или') || lower.includes('vs') || lower.includes('изоляц')) ||
    lower.includes('изолирующ') || lower.includes('многосуставн') || lower.includes('какие упражнения') ||
    lower.includes('нужна ли изоляция');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚖️ БАЗОВЫЕ vs ИЗОЛИРУЮЩИЕ УПРАЖНЕНИЯ:');
  lines.push('');
  lines.push('🏋️ БАЗОВЫЕ (многосуставные):');
  lines.push('• Примеры: присед, становая, жим, тяга, жим стоя');
  lines.push('• Плюсы: больший гормональный отклик, больше мышц, функциональность');
  lines.push('• Эффективность: 80% результата от 20% упражнений');
  lines.push('• Для кого: ВСЕМ, особенно новичкам и среднему уровню');
  lines.push('');
  lines.push('💪 ИЗОЛИРУЮЩИЕ (односуставные):');
  lines.push('• Примеры: сгибания на бицепс, разводки, подъём на носки');
  lines.push('• Плюсы: акцент на конкретную мышцу, меньше осевой нагрузки');
  lines.push('• Для кого: продвинутые (слабое звено), реабилитация, эстетика');
  lines.push('');
  lines.push('📊 ОПТИМАЛЬНЫЙ БАЛАНС:');
  lines.push('• Новичок: 90% базовых, 10% изоляции');
  lines.push('• Средний: 70% базовых, 30% изоляции');
  lines.push('• Продвинутый: 50–60% базовых, 40–50% изоляции');
  lines.push('');
  lines.push('💡 Порядок в тренировке: сначала базовые (больше сил), потом изоляция.');
  return '\n\n' + lines.join('\n');
}
export function getMindBodyConnection(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('связь мозг') || lower.includes('ментальн') && lower.includes('трениров') ||
    lower.includes('концентрац') && lower.includes('мышца') || lower.includes('mind muscle') ||
    lower.includes('фокус') && lower.includes('упражнен') || lower.includes('думать о мышце');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🧠 НЕЙРОМЫШЕЧНАЯ СВЯЗЬ В ТРЕНИРОВКАХ:');
  lines.push('');
  lines.push('🔬 НАУЧНАЯ БАЗА:');
  lines.push('• Фокус на целевой мышце → активация на 20–35% выше (ЭМГ-исследования)');
  lines.push('• Особенно важно для: бицепс, грудь, трапеции, ягодичные');
  lines.push('• Менее важно для: многосуставных движений при работе с большим весом');
  lines.push('');
  lines.push('🎯 КАК РАЗВИТЬ СВЯЗЬ:');
  lines.push('• Изоляционные упражнения медленно и с лёгким весом');
  lines.push('• Точечное прикосновение к мышце (тактильная биологическая обратная связь)');
  lines.push('• Пауза в точке максимального сокращения (1–2 сек)');
  lines.push('• Визуализация: представляй мышцу работающей');
  lines.push('• Тёмные тренировки (меньше отвлекающих факторов)');
  lines.push('');
  lines.push('💪 ПРАКТИКА:');
  lines.push('• Начни урок с активационных движений: тяга резинки на спину × 20');
  lines.push('• Уменьши вес на 20–30% и сфокусируйся на ощущении → потом добавь');
  lines.push('• С опытом связь формируется автоматически');
  lines.push('');
  lines.push('📌 Для гипертрофии: лучше чувствовать лёгкий вес, чем не чувствовать тяжёлый.');
  return '\n\n' + lines.join('\n');
}
export function getVolumeByMuscleGroup(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('объём') && (lower.includes('для') || lower.includes('мышц')) ||
    lower.includes('сколько подходов') || lower.includes('MEV') || lower.includes('MAV') ||
    lower.includes('минимальный объём') || lower.includes('максимальный объём');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📊 ОБЪЁМ НАГРУЗКИ ПО МЫШЕЧНЫМ ГРУППАМ (подходов/нед):');
  lines.push('');
  lines.push('Концепция RP (Renaissance Periodization): MEV → MAV → MRV');
  lines.push('MEV = минимальный; MAV = оптимальный; MRV = максимальный');
  lines.push('');
  lines.push('ГРУДЬ:     MEV 8, MAV 12–18, MRV 22');
  lines.push('СПИНА:     MEV 10, MAV 14–22, MRV 25');
  lines.push('ПЛЕЧИ:     MEV 6, MAV 16–22, MRV 26');
  lines.push('БИЦЕПС:    MEV 6, MAV 14–20, MRV 26');
  lines.push('ТРИЦЕПС:   MEV 4, MAV 10–16, MRV 20');
  lines.push('НОГИ:      MEV 8, MAV 16–20, MRV 25');
  lines.push('ЯГОДИЧНЫЕ: MEV 4, MAV 12–18, MRV 20');
  lines.push('АБС:       MEV 6, MAV 16–20, MRV 25');
  lines.push('');
  lines.push('📌 Начинай с MEV, постепенно добавляй по 2 подхода/мышцу в неделю.');
  lines.push('При ухудшении восстановления — снизь к MEV (деload).');
  return '\n\n' + lines.join('\n');
}
export function getKneeHealthGuide(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('колен') || lower.includes('knee') || lower.includes('боль в колене') ||
    lower.includes('присед болит') || lower.includes('прыжки колени') || lower.includes('патела') ||
    lower.includes('мениск');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦵 ЗДОРОВЬЕ КОЛЕНЕЙ:');
  lines.push('');
  lines.push('🔴 ПАТЕЛЛОФЕМОРАЛЬНЫЙ СИНДРОМ (боль под коленной чашечкой):');
  lines.push('• Причина: слабые ягодичные → колено "заваливается" внутрь');
  lines.push('• Упражнения: моллюшки с резинкой, ягодичный мост, боковые приседы');
  lines.push('• Временно: снизь глубину приседа, избегай полного разгибания');
  lines.push('');
  lines.push('💪 УКРЕПЛЕНИЕ ДЛЯ ЗДОРОВЬЯ КОЛЕН:');
  lines.push('• Ягодичный мост / болгарский присед — нагружает без стресса на колено');
  lines.push('• Разгибания ног в машине: контролируемое укрепление квадрицепса');
  lines.push('• Скандинавские сгибания — укрепляет подколенные сухожилия');
  lines.push('');
  lines.push('🏋️ ТЕХНИКА ПРИСЕДА:');
  lines.push('• Колени за носками — миф! Главное — не заваливаться внутрь');
  lines.push('• Широкая постановка ног снижает нагрузку на колени');
  lines.push('• Присед-сумо = меньший стресс на коленный сустав');
  lines.push('');
  lines.push('🛡️ ПРОФИЛАКТИКА:');
  lines.push('• Укрепляй ягодичные — они снимают нагрузку с колен');
  lines.push('• Качественная обувь с поддержкой свода');
  lines.push('• При боли — не "через боль", снизь нагрузку');
  return '\n\n' + lines.join('\n');
}
export function getBodySignalsGuide(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('слушать тело') || lower.includes('сигналы тела') ||
    lower.includes('когда остановиться') || lower.includes('как понять') && lower.includes('перетрен') ||
    lower.includes('не нравится ощущени') || lower.includes('что-то не так');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('📡 КАК ЧИТАТЬ СИГНАЛЫ ТЕЛА:');
  lines.push('');
  lines.push('🟢 НОРМАЛЬНЫЕ СИГНАЛЫ (тренируйся):');
  lines.push('• Жжение мышц при подходе — метаболическая усталость (норма)');
  lines.push('• Крепатура через 24–48 ч — признак адаптации');
  lines.push('• Одышка при кардио — норма, следи за ЧСС');
  lines.push('• Небольшая усталость после тренировки');
  lines.push('');
  lines.push('🟡 СИГНАЛЫ ПРЕДУПРЕЖДЕНИЯ (снизь нагрузку):');
  lines.push('• Усталость сохраняется после 8+ ч сна');
  lines.push('• Нет желания идти в зал несколько дней подряд');
  lines.push('• ЧСС в покое выше нормы на +5–10 уд/мин');
  lines.push('• Сила ощутимо снизилась без причины');
  lines.push('');
  lines.push('🔴 СТОП-СИГНАЛЫ (прекрати тренировку):');
  lines.push('• Острая боль (не жжение, а резкая боль) в суставе/мышце');
  lines.push('• Боль в груди, одышка в покое');
  lines.push('• Головокружение, темнота в глазах');
  lines.push('• Тошнота / рвота на тренировке');
  lines.push('• Онемение или покалывание конечностей');
  lines.push('');
  lines.push('💡 Жжение ≠ боль. Боль = стоп. Учись различать — это ключевой навык.');
  return '\n\n' + lines.join('\n');
}
export function getHipFlexorHealth(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('сгибатели бедра') || lower.includes('подвздошная') || lower.includes('поясница') &&
    lower.includes('сидячий') || lower.includes('напряжённые бёдра') || lower.includes('hip flexor') ||
    lower.includes('болит пах') || lower.includes('сидячая работа') && lower.includes('мышц');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦵 СГИБАТЕЛИ БЕДРА — ЗДОРОВЬЕ И ГИБКОСТЬ:');
  lines.push('');
  lines.push('⚠️ ПРОБЛЕМА СИДЯЧЕГО ОБРАЗА ЖИЗНИ:');
  lines.push('• 8+ ч в день сидя = сгибатели бедра в укороченном состоянии');
  lines.push('• Результат: передний наклон таза, боль в пояснице, нарушение паттерна движения');
  lines.push('• При приседе/тяге: мешает нейтральному положению таза');
  lines.push('');
  lines.push('🧘 РАСТЯЖКА СГИБАТЕЛЕЙ:');
  lines.push('• Выпад с коленом на полу (статика 60 сек × 3/сторону)');
  lines.push('• Поза голубя (лёжа)');
  lines.push('• Ягодичный мост с паузой (активирует антагонист)');
  lines.push('• Растяжка thomas test position');
  lines.push('');
  lines.push('💪 УКРЕПЛЕНИЕ:');
  lines.push('• Подъём колен висом на турнике (активное растяжение)');
  lines.push('• Болгарский присед — растяжка и укрепление одновременно');
  lines.push('• Шагающие выпады с длинным шагом');
  lines.push('');
  lines.push('⏰ РУТИНА: 5–10 мин стретчинга сгибателей ежедневно = значительный прогресс за мес.');
  return '\n\n' + lines.join('\n');
}
export function getDOMSScience(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('крепатура') || lower.includes('боль через день') || lower.includes('doms') ||
    lower.includes('болит после тренировки') || lower.includes('мышцы болят') || lower.includes('почему болит') &&
    lower.includes('мышц');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 КРЕПАТУРА (DOMS) — НАУКА:');
  lines.push('');
  lines.push('🔬 ЧТО ПРОИСХОДИТ:');
  lines.push('• DOMS = Delayed Onset Muscle Soreness — появляется через 12–48 ч');
  lines.push('• Причина: микроразрывы миофибрилл + воспаление при заживлении');
  lines.push('• НЕ молочная кислота! (она выводится через 1–2 ч после тренировки)');
  lines.push('');
  lines.push('📊 КОГДА КРЕПАТУРА СИЛЬНЕЕ:');
  lines.push('• Новые упражнения или движения');
  lines.push('• После длительного перерыва');
  lines.push('• После эксцентрических нагрузок');
  lines.push('• После объёмных тренировок');
  lines.push('');
  lines.push('✅ КАК УМЕНЬШИТЬ:');
  lines.push('• Лёгкое активное восстановление (ходьба, плавание)');
  lines.push('• Тёплый душ/ванна через 24 ч');
  lines.push('• Массаж / пенный ролл');
  lines.push('• Омега-3 снижает воспаление');
  lines.push('');
  lines.push('⚠️ КРЕПАТУРА ≠ хорошая тренировка:');
  lines.push('• Можно отлично тренироваться без крепатуры (адаптированные мышцы)');
  lines.push('• Хроническая сильная крепатура = перетренированность');
  lines.push('');
  lines.push('🚫 Тренироваться при острой крепатуре можно, но снизь интенсивность.');
  return '\n\n' + lines.join('\n');
}
export function getStickingPointAnalysis(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('застрял в') && lower.includes('жим') || lower.includes('застрял') &&
    lower.includes('присед') || lower.includes('стикинг пойнт') || lower.includes('слабое место') &&
    lower.includes('жим') || lower.includes('не идёт с мёртвой точки');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔍 АНАЛИЗ СЛАБЫХ ТОЧЕК В БАЗОВЫХ УПРАЖНЕНИЯХ:');
  lines.push('');
  lines.push('🏋️ ЖИМ ЛЁЖА:');
  lines.push('• Застрял внизу: слабые грудные → жим с паузой, дефицитные отжимания');
  lines.push('• Застрял в середине: слабый трицепс или плечи → JM пресс, жим стоя');
  lines.push('• Застрял вверху (локаут): слабый трицепс → пин-пресс, разгибания на блоке');
  lines.push('');
  lines.push('🦵 ПРИСЕД:');
  lines.push('• Застрял из ямы: слабые квадрицепсы → паузовый присед, жим ногами');
  lines.push('• Падает корпус: слабый кор/спина → доброе утро, планка с нагрузкой');
  lines.push('• Колени заваливаются: слабые ягодичные → выпады, RDL');
  lines.push('');
  lines.push('🏋️ СТАНОВАЯ ТЯГА:');
  lines.push('• С пола не идёт: слабые квадрицепсы → тяга с дефицита (стоя на блинах)');
  lines.push('• Ниже колен останавливается: слабые ягодичные → RDL, гиперэкстензии');
  lines.push('• Локаут: слабые трапеции → шраги, тяга в стропах');
  lines.push('');
  lines.push('💡 Принцип: усиливай самое слабое звено — вся цепь станет сильнее.');
  return '\n\n' + lines.join('\n');
}
export function getPostActivationPotentiation(message: string): string {
  const relevant = /pap|постактивац|контрасн|потенциац|взрывной после тяж|прыжк.+присед/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚡ ПОСТАКТИВАЦИОННАЯ ПОТЕНЦИАЦИЯ (PAP):');
  lines.push('');
  lines.push('🔬 ПРИНЦИП:');
  lines.push('• Тяжёлое упражнение (85–95% 1ПМ) → нервная система "взводится"');
  lines.push('• Последующее взрывное движение становится мощнее на 5–15%');
  lines.push('');
  lines.push('📋 ПРИМЕРЫ ПАРЫ (тяжёлое → взрывное):');
  lines.push('• Приседание 90% → прыжок в высоту');
  lines.push('• Жим лёжа 90% → отжимание с хлопком');
  lines.push('• Румынская тяга 85% → спринт 20 м');
  lines.push('');
  lines.push('⏰ ТАЙМИНГ:');
  lines.push('• Пауза между подходами: 4–8 минут (оптимально ~6 мин)');
  lines.push('• Меньше 3 мин — усталость перевешивает потенциацию');
  lines.push('');
  lines.push('🎯 ПРИМЕНЕНИЕ: спортсмены, пауэрлифтеры, перед соревновательными подходами');
  lines.push('⚠️ НЕ для новичков — требует освоенной техники тяжёлых упражнений');
  return '\n\n' + lines.join('\n');
}
export function getMuscleBloodFlow(message: string): string {
  const relevant = /памп|пампинг|pump|кровоток|кровоснабжен|наполнени.+мышц/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔴 ПАМП И КРОВОТОК В МЫШЦАХ:');
  lines.push('');
  lines.push('🔬 ЧТО ТАКОЕ ПАМП:');
  lines.push('• Скопление крови в мышце при работе = метаболический стресс');
  lines.push('• Один из трёх механизмов гипертрофии (+ механическое напряжение + повреждение)');
  lines.push('• Сам по себе памп ≠ рост, но оптимизирует среду для анаболизма');
  lines.push('');
  lines.push('⚡ КАК УСИЛИТЬ ПАМП:');
  lines.push('• Диапазон 12–20 повторений с короткими паузами (30–45 сек)');
  lines.push('• Суперсеты на одну группу');
  lines.push('• Нитраты: свекольный сок, арбуз, цитрулин (6–8 г за 60 мин)');
  lines.push('• Хорошая гидратация (400–500 мл воды за 1 ч до)');
  lines.push('');
  lines.push('🎯 ПРИМЕНЕНИЕ:');
  lines.push('• Финишные "памп-подходы" в конце тренировки — дополнительный стимул');
  lines.push('• BFR-тренинг: лёгкий вес + ограничение кровотока = памп без нагрузки на суставы');
  lines.push('');
  lines.push('💊 ДОБАВКИ ДЛЯ ПАМПА: Л-цитрулин, бета-аланин, нитраты');
  return '\n\n' + lines.join('\n');
}
export function getTemperatureTherapy(message: string): string {
  const relevant = /баня|сауна|холодн.+душ|криотерапи|ледян.+ванн|контрастн|热|temperature therapy|ice bath|sauna/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🌡️ ТЕРМАЛЬНАЯ ТЕРАПИЯ ДЛЯ ВОССТАНОВЛЕНИЯ:');
  lines.push('');
  lines.push('🔥 БАНЯ / САУНА:');
  lines.push('• 80–100°C, 15–20 мин × 2–3 захода');
  lines.push('• Польза: улучшение кровотока, расслабление мышц, рост ГР');
  lines.push('• НЕ сразу после силовой — может снизить синтез белка (подожди 3–4 ч)');
  lines.push('• После кардио и в дни отдыха — отлично');
  lines.push('');
  lines.push('❄️ ХОЛОДНЫЙ ДУШ / ЛЕДЯНАЯ ВАННА:');
  lines.push('• 10–15°C, 5–15 мин');
  lines.push('• Польза: снижение воспаления, DOMS, бодрость');
  lines.push('• НЕ после силовой в период роста — притупляет адаптацию гипертрофии');
  lines.push('• Лучше: после соревнований, кардио, при болях');
  lines.push('');
  lines.push('🔄 КОНТРАСТНЫЙ ДУШ:');
  lines.push('• Горячий 2 мин → холодный 30 сек × 5–7 циклов');
  lines.push('• "Мышечный насос" — чередование расширения/сужения сосудов');
  lines.push('');
  lines.push('📅 ОПТИМАЛЬНО: баня 2× в неделю, контрастный душ ежедневно');
  return '\n\n' + lines.join('\n');
}
export function getMinimalTimeConsistency(message: string): string {
  const relevant = /мало времени|нет времени|15 минут|20 минут|короткая тренировка|минимум времени|занятый/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⏱️ ТРЕНИРОВКИ ПРИ МИНИМУМЕ ВРЕМЕНИ:');
  lines.push('');
  lines.push('🎯 ПРИНЦИП "МИНИМАЛЬНАЯ ЭФФЕКТИВНАЯ ДОЗА":');
  lines.push('• 2 силовых в неделю сохраняют 90% прогресса vs 3–4');
  lines.push('• 15–20 мин качественной работы > 45 мин с отвлечениями');
  lines.push('');
  lines.push('📋 СХЕМА ДЛЯ 2 ДНЕЙ В НЕДЕЛЮ:');
  lines.push('• День 1: Жим + Тяга + Приседание (по 3×5–8)');
  lines.push('• День 2: Жим стоя + Подтягивания/Тяга + Румынская тяга (по 3×5–8)');
  lines.push('• 45–60 мин/тренировка, без суеты');
  lines.push('');
  lines.push('⚡ 20-МИНУТНАЯ ЭКСТРЕННАЯ ТРЕНИРОВКА:');
  lines.push('• 5 мин разминки');
  lines.push('• 3 суперсета: тяжёлое упражнение + лёгкое антагонистное');
  lines.push('• Без болтовни и соцсетей');
  lines.push('');
  lines.push('🔑 ГЛАВНОЕ ПРАВИЛО: плохая тренировка лучше пропущенной');
  lines.push('📅 Регулярность важнее интенсивности — выходи за 3 месяца из плато нерегулярности');
  return '\n\n' + lines.join('\n');
}
export function getHipThrustGuide(message: string): string {
  const relevant = /hip thrust|ягодичный мост|тяга бедром|ягодицы.+мост|glute bridge/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🍑 HIP THRUST — КОРОЛЬ ДЛЯ ЯГОДИЦ:');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА:');
  lines.push('• Лопатки на скамье, штанга на бёдрах (под мягкую подкладку)');
  lines.push('• Стопы ширина плеч, пятки под коленями');
  lines.push('• Подъём: ягодицы сжать в верхней точке, бёдра параллельны полу');
  lines.push('• НЕ прогибать поясницу — нейтральный позвоночник');
  lines.push('');
  lines.push('📊 ПОЧЕМУ ЭТО ЭФФЕКТИВНО:');
  lines.push('• Максимальная активация ягодичных (EMG выше, чем в приседе и становой)');
  lines.push('• Нагрузка в укороченном положении — уникально для ягодиц');
  lines.push('• Минимальная нагрузка на колени и поясницу');
  lines.push('');
  lines.push('📋 ВАРИАНТЫ:');
  lines.push('• Ягодичный мост (без скамьи): отличное начало для новичков');
  lines.push('• Одноногий hip thrust: больший диапазон, работает стабилизаторы');
  lines.push('• Banded hip thrust: резиновая лента добавляет напряжение в верхней точке');
  lines.push('');
  lines.push('📅 ЧАСТОТА: 2–3 раза/нед, 3–4 рабочих подхода × 8–15 повторений');
  return '\n\n' + lines.join('\n');
}
export function getValsalvaBreathing(message: string): string {
  const relevant = /вальсальва|внутрибрюшн|как дышать.+тяжёл|дыхани.+присед|дыхани.+становой|intra-abdominal|IAP/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💨 МАНЕВР ВАЛЬСАЛЬВЫ — правильное дыхание при тяжёлом весе:');
  lines.push('');
  lines.push('🔬 ПРИНЦИП:');
  lines.push('• Глубокий вдох → задержка дыхания → повышение внутрибрюшного давления (IAP)');
  lines.push('• IAP = "жёсткий корсет" вокруг позвоночника без внешнего пояса');
  lines.push('');
  lines.push('⚡ ТЕХНИКА:');
  lines.push('• Вдохни глубоко (не в грудь, а в живот) перед началом');
  lines.push('• Надуй живот как воздушный шарик');
  lines.push('• Задержи дыхание в самой тяжёлой части движения');
  lines.push('• Выдохни в верхней точке или между повторениями');
  lines.push('');
  lines.push('📋 КОГДА ПРИМЕНЯТЬ:');
  lines.push('• Приседания, становая тяга, жим лёжа с max весом');
  lines.push('• НЕ нужно на лёгких весах и многоповторных подходах');
  lines.push('');
  lines.push('⚠️ ПРОТИВОПОКАЗАНИЯ:');
  lines.push('• Гипертония — проконсультируйся с врачом');
  lines.push('• Задержка дыхания не на весь подход — между каждым повторением');
  return '\n\n' + lines.join('\n');
}
export function getLowerBodyImbalances(message: string): string {
  const relevant = /дисбаланс.+ног|дисбаланс.+нижн|левая.+нога.+слабее|разница.+ноги|leg imbalance|одна нога слабее/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚖️ ДИСБАЛАНС МЫШЦ НОГ — диагностика и коррекция:');
  lines.push('');
  lines.push('🔍 ДИАГНОСТИКА:');
  lines.push('• Одноногий присед: сравни глубину и стабильность');
  lines.push('• Одноногая становая: покачивание = слабый стабилизатор');
  lines.push('• Симметрия vs нет: запиши или снимай видео сзади');
  lines.push('');
  lines.push('📍 ЧАСТЫЕ ПРИЧИНЫ:');
  lines.push('• Доминирующая нога компенсирует при двустороннем приседе');
  lines.push('• Асимметрия после травмы');
  lines.push('• Разная длина ног (анатомическая vs функциональная)');
  lines.push('');
  lines.push('🔧 КОРРЕКЦИЯ:');
  lines.push('• Унилатеральные упражнения: болгарский присед, выпады, одноногий жим ногами');
  lines.push('• Начни со слабой ногой, повтори на сильной без добавления');
  lines.push('• 1–2 упражнения/тренировку: 2–3 мес → выравнивание');
  lines.push('');
  lines.push('⚠️ ЦЕЛЕВОЕ СООТНОШЕНИЕ: <10% разница сила лево/право = норма');
  return '\n\n' + lines.join('\n');
}
export function getCompoundMovementsPriority(message: string): string {
  const relevant = /базов.+упражнени|с чего начать тренировку|порядок упражнений|compound first|база vs изоляция/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏗️ ПРИОРИТЕТ БАЗОВЫХ УПРАЖНЕНИЙ:');
  lines.push('');
  lines.push('🔝 ИЕРАРХИЯ УПРАЖНЕНИЙ:');
  lines.push('1️⃣ БАЗА (мультисуставные): приседание, становая, жим лёжа, жим стоя, подтягивания');
  lines.push('2️⃣ ВСПОМОГАТЕЛЬНЫЕ: выпады, жим гантелей, тяга в наклоне, болгарский присед');
  lines.push('3️⃣ ИЗОЛЯЦИЯ: сгибания, разгибания, подъёмы плеч, кроссоверы');
  lines.push('');
  lines.push('📋 ПОЧЕМУ БАЗА СНАЧАЛА:');
  lines.push('• Требует максимального ресурса ЦНС → свежий = лучший результат');
  lines.push('• Самый большой стимул для роста и силы');
  lines.push('• Устал на изоляции → база пострадает, а не наоборот');
  lines.push('');
  lines.push('⚡ ИСКЛЮЧЕНИЯ:');
  lines.push('• Pre-exhaust (уставить мышцу изоляцией перед базой): спорный, но работает');
  lines.push('• Реабилитация: изоляция пострадавшей зоны сначала');
  lines.push('• Поддерживающая тренировка: любой порядок');
  lines.push('');
  lines.push('💡 ПРАВИЛО: приоритет тому, что хочешь развить больше всего');
  return '\n\n' + lines.join('\n');
}
export function getLateralAgility(message: string): string {
  const relevant = /ловкость|agility|боковое движение|lateral|координаци.+тренировк|скорость реакции/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚡ ЛОВКОСТЬ И БОКОВЫЕ ДВИЖЕНИЯ:');
  lines.push('');
  lines.push('🎯 ЗАЧЕМ ТРЕНИРОВАТЬ:');
  lines.push('• Профилактика травм (колени/голеностоп при боковых нагрузках)');
  lines.push('• Улучшение координации и равновесия');
  lines.push('• Нужно всем командным видам спорта и единоборствам');
  lines.push('');
  lines.push('📋 УПРАЖНЕНИЯ:');
  lines.push('• Боковые прыжки (lateral hops): 3×10–15/сторону');
  lines.push('• Crossover шаги с резиной: 3×10/сторону');
  lines.push('• Ladder drills (лестница): 3×20 м разных паттернов');
  lines.push('• Боковые выпады: 3×10/сторону');
  lines.push('• Cone drill (изменение направления): 30 сек × 5');
  lines.push('');
  lines.push('⚙️ ИНТЕГРАЦИЯ:');
  lines.push('• 10–15 мин после разминки, перед силовой');
  lines.push('• Или отдельная сессия 20–30 мин (1–2 раза/нед)');
  lines.push('');
  lines.push('💡 ПРИНЦИП: обучаешь нервную систему паттернам → навык переносится в жизнь');
  return '\n\n' + lines.join('\n');
}
export function getSprintingBodyComp(message: string): string {
  const relevant = /спринт|бег на короткие|sprint.+body|скоростной бег.+тело/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏃 СПРИНТЫ ДЛЯ ИЗМЕНЕНИЯ СОСТАВА ТЕЛА:');
  lines.push('');
  lines.push('🔬 ПОЧЕМУ СПРИНТЫ РАБОТАЮТ:');
  lines.push('• Активация быстрых мышечных волокон (2X/2B) — крупные и мощные');
  lines.push('• Высокий EPOC: дожигание калорий 24–48 ч после');
  lines.push('• Выброс ГР и катехоламинов → жиромобилизация');
  lines.push('• Сохраняет мышечную массу (в отличие от длинного кардио)');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ СПРИНТОВ:');
  lines.push('• Классика: 6–10 × 30 м с полным восстановлением (90–180 сек)');
  lines.push('• Холм-спринты: 6–8 × 20–40 м в гору (снижает риск травм)');
  lines.push('• Cycle sprints: 8 × 20 сек макс/10 сек отдых (Tabata-стиль)');
  lines.push('');
  lines.push('⚠️ ВАЖНО:');
  lines.push('• Разминка обязательна: 10–15 мин + динамика');
  lines.push('• Начни с 60–70% скорости в первых 2 сессиях');
  lines.push('• 2 раза/нед максимум при силовых тренировках');
  lines.push('• Дни без силовой или с большим промежутком');
  return '\n\n' + lines.join('\n');
}
export function getLatBuildingGuide(message: string): string {
  const relevant = /широчайш|широкая спина|lat|крылья.+спин|спина шире/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔱 СТРОИМ ШИРОКИЕ ШИРОЧАЙШИЕ:');
  lines.push('');
  lines.push('🔬 АНАТОМИЯ:');
  lines.push('• Широчайшие мышцы спины (latissimus dorsi) — самые широкие мышцы тела');
  lines.push('• Функция: приведение, разгибание, внутренняя ротация плеча');
  lines.push('');
  lines.push('📋 ЛУЧШИЕ УПРАЖНЕНИЯ ДЛЯ ШИРИНЫ:');
  lines.push('• Подтягивания широким хватом пронация: 4×6–10');
  lines.push('• Тяга верхнего блока широким хватом: 4×8–12');
  lines.push('• Тяга нижнего блока сидя (узкий хват): 3×10–12');
  lines.push('• Одноручная тяга гантели: 4×10–12 (полная амплитуда!)');
  lines.push('• Стрейт-армс (пуловер на блоке): 3×12–15 — изоляция');
  lines.push('');
  lines.push('⚡ КЛЮЧИ:');
  lines.push('• "Тяни локтями вниз и назад" — не "тяни руками"');
  lines.push('• Полная амплитуда: растяжение в верхней точке');
  lines.push('• Отключи бицепс от усилия (думай о локтях)');
  lines.push('');
  lines.push('📅 ЧАСТОТА: 12–20 подходов/нед, 2–3 тренировки');
  return '\n\n' + lines.join('\n');
}
export function getPowerCleansGuide(message: string): string {
  const relevant = /тяговый рывок|power clean|взятие на грудь|рывок.+атлет|олимпийск.+подъём/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ ВЗЯТИЕ НА ГРУДЬ (POWER CLEAN) — зачем и как:');
  lines.push('');
  lines.push('🎯 ДЛЯ КОГО:');
  lines.push('• Спортсмены командных видов, борьбы, лёгкой атлетики');
  lines.push('• Все, кто хочет развить взрывную мощность');
  lines.push('• CrossFit-атлеты');
  lines.push('');
  lines.push('📋 ФАЗЫ ДВИЖЕНИЯ:');
  lines.push('① Начальный отрыв (first pull): штанга — колени → бёдра');
  lines.push('② Взрывная фаза (second pull): разгибание бёдер, пожимание плечами');
  lines.push('③ Подсед и поймка: гриф на плечи, локти вперёд, ноги в приседе');
  lines.push('④ Подъём из приседа: встать с грифом');
  lines.push('');
  lines.push('⚙️ ТЕХНИКА:');
  lines.push('• Держи гриф близко к телу на протяжении всего движения');
  lines.push('• "Взрыв" бёдрами — главный двигатель');
  lines.push('• Поймка на гибкие запястья — не жёсткие');
  lines.push('');
  lines.push('📅 ТРЕНИРОВКА: 3–5 × 3–5 повторений в начале тренировки (ЦНС свежа)');
  lines.push('⚠️ Требует обучения у тренера или видео-анализа техники');
  return '\n\n' + lines.join('\n');
}
export function getSorenesScienceDetailed(message: string): string {
  const relevant = /почему болят мышцы|механизм крепатуры|что вызывает боль в мышцах|doms механизм|молочная кислота.+боль/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔬 НАУКА О КРЕПАТУРЕ (DOMS):');
  lines.push('');
  lines.push('❌ МИФ: "Молочная кислота вызывает крепатуру"');
  lines.push('• Лактат выводится за 1–2 часа после тренировки');
  lines.push('• Крепатура появляется через 12–72 ч → лактат тут ни при чём');
  lines.push('');
  lines.push('✅ РЕАЛЬНЫЕ ПРИЧИНЫ DOMS:');
  lines.push('• Микротравмы мышечных волокон (особенно при эксцентрике)');
  lines.push('• Воспалительный процесс → нейтрофилы, макрофаги → отёк');
  lines.push('• Чувствительность болевых рецепторов усиливается');
  lines.push('• Механическое натяжение соединительной ткани');
  lines.push('');
  lines.push('💊 КАК СНИЗИТЬ DOMS:');
  lines.push('• Разминка перед и заминка после (умеренно помогает)');
  lines.push('• Лёгкая активность (ходьба, плавание) — кровоток ускоряет);');
  lines.push('• Омега-3, вишнёвый сок, имбирь — небольшой противовоспалительный эффект');
  lines.push('• Массаж: снижает болевое ощущение (не скорость восстановления)');
  lines.push('');
  lines.push('🎯 DOMS ≠ рост мышц: отсутствие крепатуры при хорошем тренинге — норма');
  return '\n\n' + lines.join('\n');
}
export function getMuscleMemoryScience(message: string): string {
  const keywords = ['мышечн памят', 'muscle memory', 'вернуть форм', 'после перерыва', 'перерыв тренировк', 'растренированн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🧠 МЫШЕЧНАЯ ПАМЯТЬ — НАУКА:');
  lines.push('');
  lines.push('🔬 КАК ЭТО РАБОТАЕТ:');
  lines.push('• Миоядра: при тренировках мышечные волокна получают новые ядра');
  lines.push('• При детренированности: мышца уменьшается, но ядра СОХРАНЯЮТСЯ (до 15+ лет!)');
  lines.push('• При возврате: больше ядер = быстрее синтез белка = быстрее рост');
  lines.push('');
  lines.push('📊 СРОКИ ПОТЕРИ И ВОССТАНОВЛЕНИЯ:');
  lines.push('• 2 недели без тренировок: минимальная потеря силы');
  lines.push('• 1 месяц: -5-10% силы, -3-5% мышечной массы');
  lines.push('• 3 месяца: -10-15% силы, заметная потеря объёма');
  lines.push('• Восстановление: в 2-3 раза быстрее, чем первоначальный набор');
  lines.push('');
  lines.push('🎯 СТРАТЕГИЯ ВОЗВРАТА:');
  lines.push('• Неделя 1-2: 50-60% от прежних весов, фокус на технике');
  lines.push('• Неделя 3-4: 70-80%, постепенное увеличение объёма');
  lines.push('• Неделя 5-6: 85-95%, возврат к привычному режиму');
  lines.push('• Не торопись — сухожилия адаптируются медленнее мышц!');
  return '\n\n' + lines.join('\n');
}
export function getHormonalOptimizationNatural(message: string): string {
  const keywords = ['гормон', 'тестостерон натур', 'гормональн оптимиз', 'повысить тестостерон', 'hormonal', 'эндокрин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('⚡ НАТУРАЛЬНАЯ ОПТИМИЗАЦИЯ ГОРМОНОВ:');
  lines.push('');
  lines.push('🔬 ТЕСТОСТЕРОН (естественные способы):');
  lines.push('• Сон 7-9ч: дефицит сна ↓ тестостерон на 10-15%');
  lines.push('• Базовые упражнения (присед, тяга, жим): ↑ острый гормональный ответ');
  lines.push('• Жиры: 25-35% калорий из жиров (холестерин → тестостерон)');
  lines.push('• Цинк: 15-30мг/день (тыквенные семечки, мясо)');
  lines.push('• Витамин D: 2000-5000 МЕ/день (особенно зимой в РФ)');
  lines.push('• Минимизировать алкоголь (↓ тестостерон, ↑ эстроген)');
  lines.push('');
  lines.push('🧠 ГОРМОН РОСТА:');
  lines.push('• Глубокий сон: основной пик ГР — первые 2ч сна');
  lines.push('• Высокоинтенсивные тренировки (HIIT, тяжёлые подходы)');
  lines.push('• Интервальное голодание: может ↑ ГР (данные неоднозначны)');
  lines.push('');
  lines.push('📊 КОРТИЗОЛ (снижение):');
  lines.push('• Медитация, прогулки, дыхательные практики');
  lines.push('• Ашваганда 300-600мг/день');
  lines.push('• Тренировки <60-75 мин');
  lines.push('');
  lines.push('⚠️ Без фармакологии реалистичный диапазон оптимизации: +10-20% от базового уровня');
  return '\n\n' + lines.join('\n');
}
export function getMuscleImbalanceCorrection(message: string): string {
  const keywords = ['дисбаланс мышц', 'асимметрия мышц', 'одна сторона сильн', 'неравномерн развит', 'imbalance', 'левая правая разниц'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('⚖️ КОРРЕКЦИЯ МЫШЕЧНОГО ДИСБАЛАНСА:');
  lines.push('');
  lines.push('📊 ТИПЫ ДИСБАЛАНСА:');
  lines.push('• Лево-правый: одна сторона сильнее/больше');
  lines.push('• Агонист-антагонист: грудь >> спина, квадрицепсы >> бицепс бедра');
  lines.push('• Верх-низ: мощный верх, слабые ноги (или наоборот)');
  lines.push('');
  lines.push('🔧 СТРАТЕГИИ КОРРЕКЦИИ:');
  lines.push('');
  lines.push('📌 Лево-правый:');
  lines.push('• Односторонние упражнения (гантели вместо штанги)');
  lines.push('• Начинай с СЛАБОЙ стороны, сильная делает столько же');
  lines.push('• +1-2 подхода для отстающей стороны');
  lines.push('• Разница до 10% — норма для большинства людей');
  lines.push('');
  lines.push('📌 Агонист-антагонист:');
  lines.push('• Идеальные соотношения: тяги:жимы = 1.5:1');
  lines.push('• Бицепс бедра: квадрицепсы = 0.6:1');
  lines.push('• Внешние ротаторы: внутренние = 0.7:1');
  lines.push('');
  lines.push('⏰ СРОКИ: заметное улучшение за 6-12 недель целенаправленной работы');
  return '\n\n' + lines.join('\n');
}
export function getVolumeAutoregulation(message: string): string {
  const keywords = ['авторегуляц объём', 'сколько подход', 'слишком много подход', 'volume autoregulation', 'оптимальн объём', 'больше подходов'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('📊 АВТОРЕГУЛЯЦИЯ ТРЕНИРОВОЧНОГО ОБЪЁМА:');
  lines.push('');
  lines.push('🔬 КЛЮЧЕВЫЕ КОНЦЕПЦИИ:');
  lines.push('• MV (Maintenance Volume): минимум для удержания — 6-8 подходов/нед на группу');
  lines.push('• MEV (Min Effective Volume): минимум для роста — 8-12 подходов/нед');
  lines.push('• MAV (Max Adaptive Volume): оптимум — 12-20 подходов/нед');
  lines.push('• MRV (Max Recoverable Volume): потолок — 20-25+ подходов/нед');
  lines.push('');
  lines.push('📋 КАК ОПРЕДЕЛИТЬ СВОЙ MRV:');
  lines.push('• Начни с MEV → добавляй 1-2 подхода/нед каждые 2 недели');
  lines.push('• Отслеживай: прогресс в силе, pump, крепатура, мотивация');
  lines.push('• Если прогресс остановился + усталость ↑ → превышен MRV');
  lines.push('• Делоад → начни новый цикл с MEV');
  lines.push('');
  lines.push('💡 ПРАКТИЧЕСКИЕ ПРАВИЛА:');
  lines.push('• Больше ≠ лучше (после MRV начинается регресс)');
  lines.push('• Маленькие мышцы: меньше подходов (бицепс: 10-14/нед)');
  lines.push('• Большие мышцы: больше подходов (спина: 14-22/нед)');
  lines.push('• На дефиците: снизь объём на 30% (MRV падает)');
  return '\n\n' + lines.join('\n');
}
export function getFunctionalFitness(message: string): string {
  const keywords = ['функциональн тренировк', 'functional fitness', 'для жизни', 'повседневн нагрузк', 'практичн сил'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔧 ФУНКЦИОНАЛЬНАЯ ТРЕНИРОВКА:');
  lines.push('');
  lines.push('📝 СУТЬ: движения, переносящиеся на повседневную жизнь');
  lines.push('');
  lines.push('💪 КЛЮЧЕВЫЕ ПАТТЕРНЫ:');
  lines.push('• Приседание: сесть/встать, поднять что-то с пола');
  lines.push('• Тяга с пола: поднять тяжёлое (deadlift)');
  lines.push('• Жим над головой: положить что-то на верхнюю полку');
  lines.push('• Перенос (carry): нести продукты, ребёнка');
  lines.push('• Выпады: ходьба по лестнице, подъёмы');
  lines.push('• Ротация: повороты корпуса с нагрузкой');
  lines.push('');
  lines.push('📋 ФУНКЦИОНАЛЬНЫЕ УПРАЖНЕНИЯ:');
  lines.push('• Turkish get-up: всё тело, координация');
  lines.push('• Фермерская ходьба: хват + кор + кондиция');
  lines.push('• Медбол: броски, подъёмы, скручивания');
  lines.push('• Гоблет-присед: паттерн приседа + кор');
  lines.push('• Renegade row: тяга + стабилизация');
  lines.push('');
  lines.push('🎯 Не заменяет силовую, но ДОПОЛНЯЕТ её');
  lines.push('📋 Включай 2-3 функциональных упражнения в каждую тренировку');
  return '\n\n' + lines.join('\n');
}
export function getBetaAlanineGuide(message: string): string {
  const keywords = ['бета-аланин', 'beta alanine', 'покалывание добавк', 'парестезия добавк', 'выносливость добавк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💊 БЕТА-АЛАНИН — ГАЙД:');
  lines.push('');
  lines.push('🔬 ЧТО ЭТО: аминокислота → превращается в карнозин в мышцах');
  lines.push('• Карнозин буферизирует H+ ионы (кислоту) при высокоинтенсивной работе');
  lines.push('');
  lines.push('✅ ДОКАЗАННЫЕ ЭФФЕКТЫ:');
  lines.push('• ↑ выносливость при подходах 60-240 сек (8-30 повторений)');
  lines.push('• ↑ объём тренировки на 2-3%');
  lines.push('• Эффективен для HIIT, кроссфита, многоповторных подходов');
  lines.push('');
  lines.push('❌ НЕ ПОМОГАЕТ:');
  lines.push('• Для коротких подходов (<60 сек, 1-5 повторений)');
  lines.push('• Для чистой силы (1ПМ не изменится)');
  lines.push('');
  lines.push('📋 ДОЗИРОВКА:');
  lines.push('• 3.2-6.4г/день, разделить на 2-4 приёма');
  lines.push('• Эффект накопительный: 2-4 недели загрузки');
  lines.push('• Тайминг НЕ важен (в отличие от кофеина)');
  lines.push('');
  lines.push('⚡ ПОБОЧКА: покалывание кожи (парестезия) — безвредно');
  lines.push('• Уменьшается при разделении на мелкие дозы');
  return '\n\n' + lines.join('\n');
}
export function getCitrullineGuide(message: string): string {
  const keywords = ['цитруллин', 'citrulline', 'пампинг добавк', 'оксид азот', 'NO booster', 'аргинин vs цитруллин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💊 ЦИТРУЛЛИН — ГАЙД:');
  lines.push('');
  lines.push('🔬 МЕХАНИЗМ: L-цитруллин → L-аргинин → оксид азота (NO) → расширение сосудов');
  lines.push('• Лучше аргинина! (аргинин разрушается в кишечнике)');
  lines.push('');
  lines.push('✅ ЭФФЕКТЫ:');
  lines.push('• ↑ пампинг (кровенаполнение мышц)');
  lines.push('• ↑ выносливость при подходах >30 сек');
  lines.push('• ↓ крепатура после тренировки');
  lines.push('• Может ↑ объём тренировки на 3-5%');
  lines.push('');
  lines.push('📋 ДОЗИРОВКА:');
  lines.push('• L-цитруллин: 6-8г за 30-60 мин до тренировки');
  lines.push('• Цитруллин малат (2:1): 8-10г');
  lines.push('• Можно смешать с водой или соком');
  lines.push('');
  lines.push('🔄 vs АРГИНИН:');
  lines.push('• Аргинин: 1-2% доходит до крови (печень разрушает)');
  lines.push('• Цитруллин: 80%+ превращается в аргинин');
  lines.push('• Вывод: цитруллин > аргинин для NO');
  lines.push('');
  lines.push('⚠️ Безопасен, побочки редки (лёгкий дискомфорт в животе при передозе)');
  return '\n\n' + lines.join('\n');
}
export function getHipHingePattern(message: string): string {
  const keywords = ['хинж', 'тазобедренн сгибан', 'hip hinge', 'наклон таз', 'наклон корпус', 'сгибание в тазу'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔄 HIP HINGE (СГИБАНИЕ В ТАЗУ):');
  lines.push('');
  lines.push('📝 ПАТТЕРН: наклон корпуса за счёт тазобедренного сустава, НЕ поясницы');
  lines.push('');
  lines.push('❓ ПОЧЕМУ ВАЖНО:');
  lines.push('• Основа: становая тяга, RDL, наклоны, свинги');
  lines.push('• Защита поясницы при поднятии тяжёлого');
  lines.push('• Ключевой паттерн для задней цепи');
  lines.push('');
  lines.push('📋 КАК НАУЧИТЬСЯ:');
  lines.push('1. Wall hip hinge: встань спиной к стене (20 см), тянись тазом назад до касания');
  lines.push('2. Dowel hip hinge: палка вдоль позвоночника (затылок + верх спины + крестец) — не должна отрываться');
  lines.push('3. RDL с пустым грифом: медленно, чувствуя растяжение бицепса бедра');
  lines.push('');
  lines.push('✅ ПРАВИЛЬНО:');
  lines.push('• Таз уходит НАЗАД (не колени вперёд)');
  lines.push('• Спина нейтральная на протяжении всего движения');
  lines.push('• Колени слегка согнуты (не в замке)');
  lines.push('• Вес на средней части стопы / пятках');
  lines.push('');
  lines.push('❌ ОШИБКА: округление поясницы = нагрузка на диски, а не на мышцы');
  return '\n\n' + lines.join('\n');
}
export function getGluteActivation(message: string): string {
  const kw = /ягодиц|глют|попа|зад|приседан.*ягод|мост|hip.?thrust|glute/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🍑 РАЗВИТИЕ ЯГОДИЧНЫХ — НАУЧНЫЙ ПОДХОД:');
  lines.push('');
  lines.push('📐 Анатомия и функции:');
  lines.push('• Gluteus maximus — разгибание бедра, наружная ротация');
  lines.push('• Gluteus medius — отведение, стабилизация таза');
  lines.push('• Gluteus minimus — внутренняя ротация, стабилизация');
  lines.push('');
  lines.push('🏋️ Лучшие упражнения по ЭМГ-активации:');
  lines.push('• Hip thrust — максимальная активация в верхней точке (peak contraction)');
  lines.push('• Болгарские сплит-приседания — глубокая растяжка + нагрузка');
  lines.push('• Становая румынская — эксцентрический стресс');
  lines.push('• Приседания с широкой постановкой — больше ягодичных vs узкая');
  lines.push('• Ягодичный мост со штангой — изоляция без нагрузки на спину');
  lines.push('• Отведение ноги в кроссовере — финишер');
  lines.push('');
  lines.push('⚡ Активация перед тренировкой:');
  lines.push('• Мини-бэнд: приставные шаги — 2×15');
  lines.push('• Ягодичный мостик без веса — 2×20 с паузой вверху 2с');
  lines.push('• Clamshells — 2×15 каждая сторона');
  lines.push('• Цель: "разбудить" ягодичные до тяжёлой работы');
  lines.push('');
  lines.push('📊 Программирование:');
  lines.push('• Объём: 12-20 подходов/неделю для гипертрофии');
  lines.push('• Микс: тяжёлые (6-8) + лёгкие (15-20) — разные типы волокон');
  lines.push('• Частота: 2-3 раза/неделю (ягодичные восстанавливаются быстро)');
  lines.push('• Прогрессия: hip thrust до 1.5× веса тела — хороший ориентир');
  return '\n\n' + lines.join('\n');
}
export function getPotassiumMuscleFunction(message: string): string {
  const kw = /калий|потассиум|potassium|судорог|спазм.*мышц|мышечн.*спазм|электролит.*калий|банан.*калий/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🍌 КАЛИЙ И МЫШЕЧНАЯ ФУНКЦИЯ:');
  lines.push('');
  lines.push('🔬 Роль калия:');
  lines.push('• Мышечное сокращение (натриево-калиевый насос)');
  lines.push('• Передача нервных импульсов');
  lines.push('• Регуляция сердечного ритма');
  lines.push('• Баланс жидкости (антагонист натрия)');
  lines.push('');
  lines.push('⚠️ Дефицит (гипокалиемия):');
  lines.push('• Мышечные судороги и слабость');
  lines.push('• Усталость и снижение работоспособности');
  lines.push('• Нарушения ритма сердца');
  lines.push('• Повышенный риск при обильном потоотделении');
  lines.push('');
  lines.push('🥑 Источники (мг на 100г):');
  lines.push('• Курага — 1700 мг');
  lines.push('• Фасоль — 1100 мг');
  lines.push('• Чернослив — 860 мг');
  lines.push('• Картофель (запечённый) — 535 мг');
  lines.push('• Авокадо — 485 мг');
  lines.push('• Банан — 360 мг (не лучший источник!)');
  lines.push('• Шпинат — 560 мг');
  lines.push('');
  lines.push('📊 Нормы:');
  lines.push('• Рекомендуемое: 3500-4700 мг/день');
  lines.push('• Спортсмены: до 5000 мг/день (потери с потом)');
  lines.push('• Не добавка, а из еды! (передозировка калия опасна)');
  lines.push('• Совет: 5+ порций овощей/фруктов = норма покрыта');
  return '\n\n' + lines.join('\n');
}
export function getMinimalEffectiveVolume(message: string): string {
  const kw = /минимальн.*объём|минимальн.*эффект|мало.*врем|мало.*подход|сколько.*подход.*достаточ|MEV|minimal.*volume/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('📊 МИНИМАЛЬНЫЙ ЭФФЕКТИВНЫЙ ОБЪЁМ (MEV):');
  lines.push('');
  lines.push('🔬 Концепция:');
  lines.push('• MEV — наименьший объём, вызывающий адаптацию');
  lines.push('• MRV — максимальный восстановимый объём (потолок)');
  lines.push('• MAV — оптимальный диапазон между MEV и MRV');
  lines.push('• Тренируйся в зоне MAV, но не меньше MEV');
  lines.push('');
  lines.push('📐 MEV по мышечным группам (подходов/неделя):');
  lines.push('• Грудь: 8-10');
  lines.push('• Спина: 8-10');
  lines.push('• Квадрицепсы: 6-8');
  lines.push('• Бицепс бедра: 4-6');
  lines.push('• Плечи (передние): 0 (работают в жимах)');
  lines.push('• Плечи (боковые): 6-8');
  lines.push('• Бицепс: 4-6');
  lines.push('• Трицепс: 4-6');
  lines.push('• Ягодичные: 4-6');
  lines.push('');
  lines.push('💡 Когда MEV достаточно:');
  lines.push('• Поддержание в период сушки');
  lines.push('• Мало времени / высокий стресс');
  lines.push('• Деоляд-фаза (разгрузка)');
  lines.push('• 2-3 тренировки/неделю — реально поддержать форму');
  lines.push('');
  lines.push('📈 Стратегия прогрессии объёма:');
  lines.push('• Мезоцикл 1: начни с MEV');
  lines.push('• +2-3 подхода/неделя каждый мезоцикл');
  lines.push('• Дойди до MRV → деоляд → снова с MEV');
  return '\n\n' + lines.join('\n');
}
export function getDigestiveEnzymes(message: string): string {
  const kw = /фермент|энзим|пищеварен|переварива|вздути|газ.*после.*еды|тяжесть.*желуд|усвоен.*белк/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🧬 ПИЩЕВАРИТЕЛЬНЫЕ ФЕРМЕНТЫ И УСВОЕНИЕ:');
  lines.push('');
  lines.push('🔬 Основные ферменты:');
  lines.push('• Протеазы — расщепляют белки (пепсин, трипсин)');
  lines.push('• Липазы — расщепляют жиры');
  lines.push('• Амилазы — расщепляют углеводы (начинается во рту!)');
  lines.push('• Лактаза — расщепляет молочный сахар');
  lines.push('');
  lines.push('⚠️ Признаки плохого пищеварения:');
  lines.push('• Вздутие после еды с высоким содержанием белка');
  lines.push('• Чувство тяжести более 2-3 часов после приёма пищи');
  lines.push('• Непереваренная пища в стуле');
  lines.push('• Газообразование после молочных продуктов');
  lines.push('');
  lines.push('💡 Улучшение пищеварения (без добавок):');
  lines.push('• Жуй тщательно (20-30 жевательных движений)');
  lines.push('• Не запивай еду большим количеством воды');
  lines.push('• Ешь медленно — 15-20 минут на приём пищи');
  lines.push('• Готовь белковую пищу хорошо (денатурация облегчает переваривание)');
  lines.push('• Имбирь, ананас, папайя — натуральные источники ферментов');
  lines.push('');
  lines.push('📊 Когда стоит попробовать добавки:');
  lines.push('• Очень высокое потребление белка (>2.5 г/кг)');
  lines.push('• Непереносимость лактозы → лактаза с молочкой');
  lines.push('• Проблемы с перевариванием бобовых → альфа-галактозидаза');
  lines.push('• Приём с едой, не натощак!');
  return '\n\n' + lines.join('\n');
}
export function getGripTypesApplications(message: string): string {
  const kw = /хват|grip|пронир|супинир|нейтральн.*хват|обратн.*хват|разнохват|mixed.?grip/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('✊ ТИПЫ ХВАТОВ И ИХ ПРИМЕНЕНИЕ:');
  lines.push('');
  lines.push('📐 Основные типы:');
  lines.push('• Пронированный (сверху): жим, тяга штанги — стандарт');
  lines.push('• Супинированный (снизу): сгибания на бицепс, подтягивания узко');
  lines.push('• Нейтральный (ладони друг к другу): жим гантелей, молотки');
  lines.push('• Разнохват (mixed): становая тяга — максимальное удержание');
  lines.push('• Hook grip: большой палец под пальцами — пауэрлифтинг/тяжёлая атлетика');
  lines.push('');
  lines.push('🏋️ Влияние хвата на мышцы:');
  lines.push('• Жим: пронированный → больше трицепс; нейтральный → безопаснее для плеч');
  lines.push('• Подтягивания: широкий пронированный → широчайшие; узкий супинированный → бицепс');
  lines.push('• Тяга: пронированный → верх спины; супинированный → низ широчайших');
  lines.push('• Сгибания: супинированный → короткая головка бицепса; молоток → брахиалис');
  lines.push('');
  lines.push('📊 Ширина хвата:');
  lines.push('• Узкий (уже плеч): больше трицепс в жиме, больше бицепс в тяге');
  lines.push('• Средний (на ширине плеч): универсальный, безопасный');
  lines.push('• Широкий (шире плеч): больше грудных в жиме, широчайших в тяге');
  lines.push('');
  lines.push('⚠️ Разнохват: чередуй стороны! Постоянный разнохват → дисбаланс');
  lines.push('💡 Hook grip > разнохват для безопасности (но больнее на пальцы)');
  return '\n\n' + lines.join('\n');
}
export function getScapularHealth(message: string): string {
  const kw = /лопатк|скапул|scapul|крыловидн|winging|лопатки.*двигаются|стабилизац.*лопат/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦴 ЗДОРОВЬЕ И ПОДВИЖНОСТЬ ЛОПАТОК:');
  lines.push('');
  lines.push('📐 Почему это важно:');
  lines.push('• Лопатки = фундамент для всех движений руками');
  lines.push('• Дисфункция лопаток → импинджмент, боли в плечах');
  lines.push('• "Крыловидные лопатки" — слабость serratus anterior');
  lines.push('');
  lines.push('🔧 Ключевые мышцы:');
  lines.push('• Нижняя трапеция — депрессия лопатки (часто слабая!)');
  lines.push('• Serratus anterior — протракция, стабилизация у грудной клетки');
  lines.push('• Средняя трапеция + ромбовидные — ретракция');
  lines.push('• Верхняя трапеция — элевация (часто перенапряжена!)');
  lines.push('');
  lines.push('💪 Упражнения для стабилизации:');
  lines.push('• Scapular push-ups — 3×15 (serratus anterior)');
  lines.push('• Wall slides — 3×10 (координация лопаток)');
  lines.push('• Band pull-apart — 3×15-20 (средняя трапеция)');
  lines.push('• Prone Y-T-W — 2×10 каждое (весь комплекс)');
  lines.push('• Планка с протракцией — 3×10 (serratus)');
  lines.push('');
  lines.push('📊 Когда делать:');
  lines.push('• Как разминку перед жимами и тягами');
  lines.push('• Ежедневно при офисной работе (5-10 мин)');
  lines.push('• 3-4 раза/неделю при крыловидных лопатках');
  return '\n\n' + lines.join('\n');
}
export function getTimeUnderTensionScience(message: string): string {
  const kw = /время.*напряжен|TUT|time.*under.*tension|медленн.*повтор|темп.*подъём|эксцентрик.*темп/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('⏱️ ВРЕМЯ ПОД НАГРУЗКОЙ (TUT) — НАУКА:');
  lines.push('');
  lines.push('🔬 Что такое TUT:');
  lines.push('• Суммарное время, которое мышца находится под напряжением в подходе');
  lines.push('• Пример: 10 повт. × 4с = 40с TUT');
  lines.push('• Гипертрофия: оптимально 30-60с TUT на подход');
  lines.push('');
  lines.push('📊 Что говорят исследования:');
  lines.push('• TUT сам по себе НЕ главный фактор гипертрофии');
  lines.push('• Механическое напряжение (вес) важнее, чем время');
  lines.push('• Слишком медленный темп → слишком лёгкий вес → меньше стимул');
  lines.push('• Контролируемый эксцентрик (2-3с) > быстрый бросок');
  lines.push('');
  lines.push('📐 Оптимальный темп:');
  lines.push('• Эксцентрик (негативная фаза): 2-3 секунды');
  lines.push('• Пауза внизу: 0-1 секунда');
  lines.push('• Концентрик (подъём): максимально быстро с контролем');
  lines.push('• Пауза вверху: 0-1 секунда, пиковое сокращение');
  lines.push('');
  lines.push('💡 Практический вывод:');
  lines.push('• Не считай секунды — контролируй движение');
  lines.push('• Не бросай вес вниз, не используй инерцию');
  lines.push('• Намеренно замедляйся только для слабых мышц (финишеры)');
  lines.push('• Для силы: быстрый концентрик, контролируемый эксцентрик');
  return '\n\n' + lines.join('\n');
}
export function getSumoVsConventional(message: string): string {
  const kw = /сумо.*тяг|тяг.*сумо|класс.*станов|станов.*класс|sumo.*deadlift|conventional.*dead|какая.*тяга.*лучше/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ СУМО VS КЛАССИЧЕСКАЯ СТАНОВАЯ:');
  lines.push('');
  lines.push('📊 Классическая (conventional):');
  lines.push('• Стопы на ширине плеч, руки снаружи');
  lines.push('• Больше нагрузки на поясницу и бицепс бедра');
  lines.push('• Бо́льшая амплитуда движения');
  lines.push('• Лучше для длинных рук / коротких ног');
  lines.push('• Больше переноса на спортивные движения');
  lines.push('');
  lines.push('📊 Сумо:');
  lines.push('• Широкая постановка ног, руки внутри');
  lines.push('• Больше нагрузки на квадрицепсы и аддукторы');
  lines.push('• Короче амплитуда (~20-25%)');
  lines.push('• Меньше нагрузки на поясницу');
  lines.push('• Лучше для коротких рук / длинных ног / широких бёдер');
  lines.push('');
  lines.push('📐 Как выбрать:');
  lines.push('• Попробуй обе с одинаковым весом');
  lines.push('• Где комфортнее и сильнее = твой стиль');
  lines.push('• Боль в пояснице → попробуй сумо');
  lines.push('• Боль в бёдрах/аддукторах → классика');
  lines.push('');
  lines.push('💡 Обе стиля одинаково эффективны для развития силы');
  lines.push('В пауэрлифтинге обе разрешены на соревнованиях');
  return '\n\n' + lines.join('\n');
}
export function getSeleniumThyroid(message: string): string {
  const kw = /селен|selenium|щитовидн|тирео|thyroid|метаболизм.*замедл|замедл.*метаболизм/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🧪 СЕЛЕН И ФУНКЦИЯ ЩИТОВИДНОЙ ЖЕЛЕЗЫ:');
  lines.push('');
  lines.push('🔬 Связь селен-щитовидка:');
  lines.push('• Щитовидная железа содержит больше селена, чем любой другой орган');
  lines.push('• Селен необходим для конвертации Т4→Т3 (активная форма)');
  lines.push('• Антиоксидантная защита щитовидки (глутатионпероксидаза)');
  lines.push('');
  lines.push('💪 Влияние на спорт:');
  lines.push('• Т3 регулирует метаболизм → расход энергии');
  lines.push('• Влияет на синтез белка и жировой обмен');
  lines.push('• Дефицит = замедление метаболизма, усталость, набор жира');
  lines.push('');
  lines.push('🥜 Источники селена:');
  lines.push('• Бразильский орех — 1 штука = 70-90 мкг (дневная норма!)');
  lines.push('• Тунец — 90 мкг/100г');
  lines.push('• Яйца — 15 мкг/шт');
  lines.push('• Чеснок — 14 мкг/100г');
  lines.push('• Грибы — 12 мкг/100г');
  lines.push('');
  lines.push('📊 Рекомендации:');
  lines.push('• Норма: 55-70 мкг/день');
  lines.push('• Максимум: 400 мкг/день (выше — токсично!)');
  lines.push('• 2-3 бразильских ореха в день = покрыто');
  lines.push('• Не принимай высокие дозы без анализов');
  return '\n\n' + lines.join('\n');
}
export function getMuscleSorenessManage(message: string): string {
  const kw = /крепатур|DOMS|болят.*мышц|мышц.*болят|не могу.*ходить.*после|всё.*болит.*после.*тренир|мышечн.*боль/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('😫 УПРАВЛЕНИЕ МЫШЕЧНОЙ БОЛЬЮ (КРЕПАТУРА/DOMS):');
  lines.push('');
  lines.push('🔬 Что происходит:');
  lines.push('• DOMS (Delayed Onset Muscle Soreness) = микроповреждения мышц');
  lines.push('• Пик боли: 24-72 часа после тренировки');
  lines.push('• НЕ показатель качества тренировки!');
  lines.push('• Новые движения и эксцентрика = максимальный DOMS');
  lines.push('');
  lines.push('✅ Что реально помогает:');
  lines.push('• Лёгкое кардио (ходьба 20-30 мин) — усиление кровотока');
  lines.push('• Лёгкая тренировка той же группы мышц (active recovery)');
  lines.push('• Достаточный белок (1.6-2.2 г/кг)');
  lines.push('• Сон 7-9 часов');
  lines.push('• Контрастный душ (холод/тепло)');
  lines.push('• Таурин 2-3г/день (снижает маркеры повреждения)');
  lines.push('');
  lines.push('❌ Мифы:');
  lines.push('• "Нет боли — нет роста" — неправда');
  lines.push('• Растяжка до/после НЕ предотвращает DOMS');
  lines.push('• НПВС (ибупрофен) — снимает боль, но может замедлить адаптацию');
  lines.push('');
  lines.push('📊 Профилактика:');
  lines.push('• Постепенно увеличивай объём (+10-20% в неделю)');
  lines.push('• Не делай новые упражнения на максимальный объём сразу');
  lines.push('• Регулярность > интенсивность разовых тренировок');
  return '\n\n' + lines.join('\n');
}
export function getIodineThyroid(message: string): string {
  const kw = /йод|iodine|щитовидн.*йод|морск.*капуст|водоросл.*йод|дефицит.*йод/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🧂 ЙОД И МЕТАБОЛИЗМ СПОРТСМЕНА:');
  lines.push('');
  lines.push('🔬 Роль йода:');
  lines.push('• Строительный материал для гормонов щитовидной железы (Т3, Т4)');
  lines.push('• Регулирует базовый метаболизм');
  lines.push('• Влияет на расход энергии, температуру тела');
  lines.push('• Дефицит → гипотиреоз → замедление метаболизма, набор веса');
  lines.push('');
  lines.push('📊 Статистика по России:');
  lines.push('• 70% россиян не получают достаточно йода');
  lines.push('• Большинство регионов — йоддефицитные');
  lines.push('• Йодированная соль не всегда используется');
  lines.push('');
  lines.push('🍽️ Источники:');
  lines.push('• Морская капуста (ламинария) — 300-1500 мкг/100г');
  lines.push('• Треска — 110 мкг/100г');
  lines.push('• Креветки — 35 мкг/100г');
  lines.push('• Яйца — 24 мкг/шт');
  lines.push('• Йодированная соль — 40 мкг/г');
  lines.push('');
  lines.push('📊 Рекомендации:');
  lines.push('• Норма: 150 мкг/день (взрослые)');
  lines.push('• Используй йодированную соль — простейший способ');
  lines.push('• Морская капуста 2-3 раза/неделю');
  lines.push('• Не превышай 1100 мкг/день (подавляет щитовидку!)');
  lines.push('• При проблемах с щитовидкой — консультация эндокринолога');
  return '\n\n' + lines.join('\n');
}
export function getConcentricVsEccentric(message: string): string {
  const kw = /концентрик|эксцентрик|негатив.*фаз|позитив.*фаз|concentric|eccentric|опускан.*медленн|подъём.*быстр/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('⬆️⬇️ КОНЦЕНТРИК VS ЭКСЦЕНТРИК:');
  lines.push('');
  lines.push('🔬 Определения:');
  lines.push('• Концентрик: мышца укорачивается (подъём веса)');
  lines.push('• Эксцентрик: мышца удлиняется (опускание веса)');
  lines.push('• Изометрик: длина не меняется (удержание)');
  lines.push('');
  lines.push('📊 Ключевые факты:');
  lines.push('• Эксцентрическая сила на 20-50% выше концентрической');
  lines.push('• Эксцентрик → больше микроповреждений → сильнее DOMS');
  lines.push('• Эксцентрик → больше механического напряжения → рост');
  lines.push('• Концентрик → больше метаболического стресса');
  lines.push('• Оба нужны для оптимальной гипертрофии');
  lines.push('');
  lines.push('📐 Практика:');
  lines.push('• Контролируемый эксцентрик (2-3с) — база для любого упражнения');
  lines.push('• Акцентированный эксцентрик (4-6с) — для преодоления плато');
  lines.push('• Негативные повторения: вес >1ПМ, только фаза опускания');
  lines.push('• Взрывной концентрик — для развития мощности');
  lines.push('');
  lines.push('💡 Применение:');
  lines.push('• Плато в силе → акцент на эксцентрик (супрамаксимальные негативы)');
  lines.push('• Реабилитация → эксцентрик при тендинопатиях');
  lines.push('• Гипертрофия → контролируй обе фазы, не бросай вес');
  return '\n\n' + lines.join('\n');
}
export function getRotationalCore(message: string): string {
  const kw = /ротац|вращен.*кор|косые.*мышц|русск.*скручив|wood.?chop|кабельн.*скручив|бок.*пресс/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔄 РОТАЦИОННЫЕ ТРЕНИРОВКИ ДЛЯ КОРА:');
  lines.push('');
  lines.push('📐 Зачем тренировать ротацию:');
  lines.push('• Реальная жизнь = движения во всех плоскостях');
  lines.push('• Спорт: удар, бросок, бег — всё включает ротацию');
  lines.push('• Профилактика травм поясницы');
  lines.push('• Косые мышцы = визуальный V-shape торса');
  lines.push('');
  lines.push('🏋️ Упражнения (от простых к сложным):');
  lines.push('• Русские скручивания: базовое ротационное');
  lines.push('• Pallof press (анти-ротация): стабилизация');
  lines.push('• Wood chops (кабельные): вверх-вниз / низ-верх');
  lines.push('• Landmine rotation: мощность');
  lines.push('• Med ball throws: взрывная ротация');
  lines.push('• Cable rotation: контролируемая ротация с сопротивлением');
  lines.push('');
  lines.push('⚠️ Важно:');
  lines.push('• Ротация должна идти от торса, не от поясницы!');
  lines.push('• Бёдра стабильны, ротирует грудной отдел');
  lines.push('• Начинай с анти-ротации (Pallof), потом активная ротация');
  lines.push('• Не делай русские скручивания с тяжёлым весом — нагрузка на позвоночник');
  lines.push('');
  lines.push('📊 Объём: 2-3 упражнения, 3×10-15, 2-3 раза/неделю');
  return '\n\n' + lines.join('\n');
}
export function getMindBodyConnectionScience(message: string): string {
  const kw = /связь.*мозг.*мышц|мозг.*мышц|mind.*muscle|чувствов.*мышц|не чувств.*мышц|ментальн.*фокус/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🧠 СВЯЗЬ МОЗГ-МЫШЦА — НАУЧНЫЙ ПОДХОД:');
  lines.push('');
  lines.push('🔬 Что говорит наука:');
  lines.push('• Внутренний фокус (на мышцу) увеличивает ЭМГ-активацию на 20-25%');
  lines.push('• Эффект доказан для изоляции (бицепс, грудные, широчайшие)');
  lines.push('• Для базовых с тяжёлым весом — лучше внешний фокус');
  lines.push('• Внешний фокус: "толкни пол ногами" vs "напряги квадрицепсы"');
  lines.push('');
  lines.push('📊 Когда какой фокус:');
  lines.push('• Изоляция (сгибания, разведения, кроссовер): ВНУТРЕННИЙ — думай о мышце');
  lines.push('• Базовые тяжёлые (присед, тяга): ВНЕШНИЙ — толкни пол, потяни штангу');
  lines.push('• Жим лёжа 60-70%: внутренний (гипертрофия)');
  lines.push('• Жим лёжа 85%+: внешний (сила, мощность)');
  lines.push('');
  lines.push('💡 Как улучшить связь:');
  lines.push('• Тренируй позирование (flexing) целевой мышцы');
  lines.push('• Лёгкие подходы с фокусом перед тяжёлыми');
  lines.push('• Касание мышцы перед подходом (проприоцепция)');
  lines.push('• Замедли темп, убери инерцию');
  lines.push('• Закрой глаза на лёгких изоляционных');
  lines.push('');
  lines.push('⚠️ "Не чувствую мышцу" — снизь вес, замедлись, добавь паузу в пике');
  return '\n\n' + lines.join('\n');
}
export function getConjugateMethod(message: string): string {
  const kw = /сопряжённ|сопряженн|вестсайд|westside|conjugate|макс.*усили.*дин|ME.*DE.*метод/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ СОПРЯЖЁННЫЙ МЕТОД (CONJUGATE / WESTSIDE):');
  lines.push('');
  lines.push('📖 Суть метода:');
  lines.push('• Разработан Луи Симмонсом (Westside Barbell)');
  lines.push('• 4 тренировки в неделю');
  lines.push('• Чередование Max Effort (ME) и Dynamic Effort (DE)');
  lines.push('• Ротация упражнений каждые 1-3 недели');
  lines.push('');
  lines.push('📊 Структура недели:');
  lines.push('• Пн: ME верх (жим вариация → работа до 1-3ПМ)');
  lines.push('• Ср: ME низ (присед/тяга вариация → 1-3ПМ)');
  lines.push('• Пт: DE верх (жим 8-12×3 с 50-60% + резинки/цепи)');
  lines.push('• Вс: DE низ (присед 10-12×2 с 50-60% + резинки)');
  lines.push('');
  lines.push('🔑 Ключевые принципы:');
  lines.push('• ME: меняй вариацию каждые 1-3 недели (pin press, floor press, box squat)');
  lines.push('• DE: скорость штанги > вес! Цель = максимальная мощность');
  lines.push('• Аккомодационное сопротивление: резинки и цепи');
  lines.push('• Repetition Effort: добивка слабых мышц (8-15 повт.)');
  lines.push('');
  lines.push('✅ Для кого:');
  lines.push('• Средний-продвинутый уровень (1+ год серьёзных тренировок)');
  lines.push('• Пауэрлифтеры, силовые атлеты');
  lines.push('• Те, кто застрял на плато в базовых движениях');
  lines.push('');
  lines.push('⚠️ Требует: опыт, знание слабых точек, разнообразие оборудования');
  return '\n\n' + lines.join('\n');
}
export function getRdlVsSldl(message: string): string {
  const kw = /румынск.*мёртв|мёртв.*румынск|RDL.*SLDL|SLDL.*RDL|разница.*тяг|румынск.*тяг.*техник/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ РУМЫНСКАЯ VS МЁРТВАЯ ТЯГА:');
  lines.push('');
  lines.push('📐 Румынская тяга (RDL):');
  lines.push('• Штанга ВСЕГДА в руках (начинаем сверху)');
  lines.push('• Колени слегка согнуты (15-20°) — фиксированы');
  lines.push('• Штанга скользит по ногам');
  lines.push('• Акцент: бицепс бедра + ягодичные');
  lines.push('• Амплитуда: до середины голени (до растяжки)');
  lines.push('');
  lines.push('📐 Мёртвая тяга (SLDL / Stiff Leg):');
  lines.push('• Ноги полностью прямые (или почти)');
  lines.push('• Штанга может отходить от ног');
  lines.push('• Бо́льшая нагрузка на поясницу');
  lines.push('• Больше растяжки бицепса бедра');
  lines.push('• Амплитуда: ниже, до пола');
  lines.push('');
  lines.push('📊 Что выбрать:');
  lines.push('• RDL — безопаснее, лучше для большинства');
  lines.push('• SLDL — гибкость + более сильная растяжка');
  lines.push('• Боль в пояснице → только RDL');
  lines.push('• Продвинутый уровень → можно оба');
  lines.push('');
  lines.push('💡 Ключевое: оба требуют нейтральной спины! Округление = стоп');
  return '\n\n' + lines.join('\n');
}
export function getSeatedVsStanding(message: string): string {
  const kw = /сидя.*стоя|стоя.*сидя|жим.*сидя.*стоя|разведен.*сидя|seated.*standing|какой.*жим.*плеч/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🪑 УПРАЖНЕНИЯ СИДЯ VS СТОЯ:');
  lines.push('');
  lines.push('📊 Стоя (преимущества):');
  lines.push('• Больше активация кора и стабилизаторов');
  lines.push('• Функциональный перенос');
  lines.push('• Жим стоя: на 10% больше активация дельт vs сидя');
  lines.push('• Больше расход калорий');
  lines.push('');
  lines.push('📊 Сидя (преимущества):');
  lines.push('• Изоляция целевой мышцы (убраны ноги/кор)');
  lines.push('• Можно взять больший вес');
  lines.push('• Стабильная спина (спинка скамьи)');
  lines.push('• Безопаснее при проблемах с поясницей');
  lines.push('');
  lines.push('📐 По упражнениям:');
  lines.push('• Жим плеч: стоя → функциональнее; сидя → тяжелее');
  lines.push('• Сгибания бицепса: стоя → больше вес; сидя (наклон) → растяжка');
  lines.push('• Разведения: стоя → классика; сидя → убирает читинг');
  lines.push('• Жим от груди: всегда лёжа/сидя (это жим лёжа)');
  lines.push('');
  lines.push('💡 Рекомендация:');
  lines.push('• Тяжёлые базовые: стоя (жим, тяга)');
  lines.push('• Изоляция и добивка: сидя (лучше контроль)');
  lines.push('• Комбинируй оба варианта в программе');
  return '\n\n' + lines.join('\n');
}
export function getAppetiteManagement(message: string): string {
  const kw = /аппетит|не.*хочу.*есть|не.*могу.*есть.*много|как.*есть.*больше|как.*сниз.*аппетит|голод|сытост/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🍽️ УПРАВЛЕНИЕ АППЕТИТОМ:');
  lines.push('');
  lines.push('📈 На массе (как есть БОЛЬШЕ):');
  lines.push('• Жидкие калории: смузи с арахисовой пастой, бананом, молоком');
  lines.push('• Ешь по часам, не по голоду (6-7 приёмов)');
  lines.push('• Калорийные продукты: орехи, масла, сухофрукты, авокадо');
  lines.push('• Меньше клетчатки в каждом приёме (чтобы не раздувало)');
  lines.push('• Белый рис > гречка (быстрее усваивается, меньше сытость)');
  lines.push('• Gainer-коктейли дома: молоко + овсянка + банан + протеин + масло');
  lines.push('');
  lines.push('📉 На сушке (как есть МЕНЬШЕ):');
  lines.push('• Больше клетчатки: овощи, салаты (объём без калорий)');
  lines.push('• Белок в каждом приёме (сытость + TEF)');
  lines.push('• Пей воду перед едой (400 мл за 30 мин)');
  lines.push('• Медленно жуй (20+ жевательных движений)');
  lines.push('• Убери снеки из видимости');
  lines.push('• Картофель = самый сытный продукт (исследование)');
  lines.push('• Кофе: подавляет аппетит на 1-2 часа');
  lines.push('');
  lines.push('🔬 Гормоны аппетита:');
  lines.push('• Грелин (голод): повышается при дефиците сна и калорий');
  lines.push('• Лептин (сытость): снижается при длительной диете');
  lines.push('• Рефид 1 день/неделю восстанавливает лептин');
  lines.push('');
  lines.push('💡 На массе: "не голоден" ≠ "не ем". На сушке: "хочу есть" ≠ "ем"');
  return '\n\n' + lines.join('\n');
}
export function getTrapBarFarmersWalk(message: string): string {
  const keywords = ['фермерская', 'farmer', 'трэп', 'trap bar', 'перенос', 'хват', 'предплечья', 'кор', 'функционал'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ФЕРМЕРСКАЯ ХОДЬБА С ТРЭП-ГРИФОМ]
Трэп-гриф идеален для фермерской ходьбы — центр тяжести ниже, хват нейтральный, нагрузка на позвоночник минимальна.

Техника:
- Встань в центр грифа, стопы на ширине бёдер
- Возьмись за ручки нейтральным хватом, выпрями спину
- Встань как в становой — бёдра вперёд, грудь вверх
- Иди короткими шагами, корпус строго вертикально
- Дыши ровно, плечи опущены и назад
- Дистанция: 20-40 метров × 3-4 подхода

Прогрессия:
1. Начни с 60-80% от становой × 20м
2. Увеличивай дистанцию до 40м
3. Добавляй вес по 5-10 кг
4. Усложняй: повороты, препятствия

Целевые мышцы: трапеции, предплечья, кор, квадрицепсы, ягодичные.
Бонус: улучшает силу хвата, осанку, стабильность кора и кондицию одновременно.
Частота: 1-2 раза в неделю в конце тренировки.`;
}
export function getLGlutamineGuide(message: string): string {
  const keywords = ['глутамин', 'glutamine', 'l-glutамин', 'кишечник', 'иммунитет', 'восстановление добавк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[L-ГЛУТАМИН — ГАЙД ДЛЯ СПОРТСМЕНОВ]
L-глутамин — самая распространённая аминокислота в организме (60% пула свободных АК в мышцах).

Функции:
- Основное топливо для клеток кишечника и иммунной системы
- При интенсивных тренировках запасы падают на 30-50%
- Поддерживает целостность кишечного барьера
- Участвует в синтезе гликогена

Когда реально нужен:
✅ Интенсивные тренировки 5+ раз в неделю
✅ Подготовка к соревнованиям (жёсткая сушка)
✅ Частые простуды / перетренированность
✅ Проблемы с ЖКТ
❌ Рекреационные тренировки 2-3 раза в неделю (хватает из пищи)

Дозировка:
- Стандарт: 5г × 2 раза в день (утро + после тренировки)
- Интенсив: 10г × 2 раза в день
- Для ЖКТ: 5г натощак утром

Источники из пищи:
- Говядина: 4.8г/100г
- Курица: 4.3г/100г
- Рыба: 3.5г/100г
- Яйца: 0.6г/шт
- Молочные: 2-3г/100г

Совместимость: хорошо сочетается с BCAA, креатином, протеином.
Побочки: практически нет при дозах до 40г/день.`;
}
export function getPhosphatidylserine(message: string): string {
  const keywords = ['фосфатидилсерин', 'phosphatidyl', 'кортизол снижение', 'стресс добавк', 'ps-100', 'надпочечник'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ФОСФАТИДИЛСЕРИН — АНТИСТРЕССОВАЯ ДОБАВКА]
Фосфолипид клеточных мембран, доказанно снижающий кортизол после тренировок.

Механизм:
- Модулирует ответ гипоталамо-гипофизарно-надпочечниковой оси (HPA)
- Снижает кортизол после интенсивных тренировок на 15-30%
- Улучшает соотношение тестостерон/кортизол
- Поддерживает когнитивные функции при стрессе

Исследования:
- 800мг/день снижал кортизол на 20% после силовых (ISSN, 2008)
- 400мг/день улучшал восстановление у велосипедистов
- 200-600мг/день улучшал память и внимание

Дозировка:
- Антистресс/восстановление: 400-800 мг/день
- Когнитивная поддержка: 100-300 мг/день
- Приём: разделить на 2-3 приёма, с едой (жиры улучшают усвоение)
- Курс: 1-3 месяца

Источники:
- Соевый лецитин (основной промышленный источник)
- Говяжьи мозги (самое высокое содержание — 713мг/100г)
- Скумбрия — 480мг/100г
- Курица — 85мг/100г

Совместимость: хорошо с омега-3, магнием, ашвагандой.
Противопоказания: антикоагулянты (усиливает действие).`;
}
export function getSerratusAnterior(message: string): string {
  const keywords = ['зубчат', 'serratus', 'передняя зубчатая', 'лопатка стабильн', 'протракция', 'крыловидная лопатка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ПЕРЕДНЯЯ ЗУБЧАТАЯ МЫШЦА — СТАБИЛИЗАТОР ЛОПАТКИ]
Часто забываемая мышца, критически важная для здоровья плеч и силы жима.

Функции:
- Протракция лопатки (движение вперёд)
- Вращение лопатки вверх при подъёме руки
- Прижимает лопатку к грудной клетке
- Слабость → крыловидная лопатка, боль в плечах

Лучшие упражнения:
1. Отжимания с протракцией: обычные отжимания + в верхней точке "вытолкни" лопатки вперёд
2. Пуловер с гантелью: акцент на растяжку и протракцию
3. Прямые удары с гантелями: лёжа на спине, "пробивай" вверх
4. Планка с протракцией: в верхней позиции толкай лопатки вверх
5. Жим ногами от стены (serratus press): стоя у стены, руки на стене, толкай

Программа:
- 2-3 упражнения × 3 × 12-15 повторений
- 2 раза в неделю (день верха или плеч)
- Можно как часть разминки перед жимами

Признаки слабости: боль при жиме над головой, нестабильность в отжиманиях, визуально выступающие лопатки.`;
}
export function getRhodiolaRosea(message: string): string {
  const keywords = ['родиола', 'rhodiola', 'золотой корень', 'адаптоген', 'выносливость добавка', 'усталость добавка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[РОДИОЛА РОЗОВАЯ — РОССИЙСКИЙ АДАПТОГЕН]
Золотой корень — легендарный адаптоген, исследованный советскими учёными для космонавтов и спортсменов.

Доказанные эффекты:
- Снижает восприятие усталости на 15-20% при аэробных нагрузках
- Улучшает время реакции и когнитивные функции при стрессе
- Модулирует кортизол — снижает избыточный, не подавляя нормальный
- Повышает VO2max на 3-5% (мета-анализ 2022)

Дозировка:
- Стандарт: 200-400 мг/день экстракта (3% розавинов, 1% салидрозида)
- Перед тренировкой: 200 мг за 30-60 мин
- Антистресс: 400-600 мг/день
- Циклирование: 5 дней приём / 2 дня перерыв

Когда принимать:
✅ Утро или перед тренировкой (бодрит!)
❌ Вечером (может нарушить сон)

Совместимость:
- Хорошо: креатин, кофеин (умеренные дозы), ашваганда
- Осторожно: антидепрессанты (SSRI), стимуляторы ЦНС

Российский бонус: растёт на Алтае, Урале, в Сибири — качественное отечественное сырьё доступно.
Курс: 6-8 недель, перерыв 2-4 недели.`;
}
export function getCoQ10Energy(message: string): string {
  const keywords = ['коэнзим q10', 'coq10', 'убихинон', 'убихинол', 'митохондри', 'энергия клеточ'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[КОЭНЗИМ Q10 — ЭНЕРГИЯ КЛЕТОК]
CoQ10 — ключевой компонент электрон-транспортной цепи в митохондриях, где производится 95% ATP.

Формы:
- Убихинон: окисленная форма (дешевле, нужно преобразование)
- Убихинол: восстановленная форма (дороже, готова к использованию, лучше после 40 лет)

Для спортсменов:
- Повышает выработку ATP на клеточном уровне
- Мощный антиоксидант (защита от оксидативного стресса при тренировках)
- Снижает маркеры воспаления после интенсивных нагрузок
- Поддерживает здоровье сердечно-сосудистой системы
- Может улучшить время до утомления на 5-10%

Дозировка:
- Общее здоровье: 100-200 мг/день
- Спортсмены: 200-300 мг/день
- Интенсивные нагрузки: 300-600 мг/день
- Принимать с жирной пищей (усвоение +300%)

Важно:
- Выработка CoQ10 снижается после 25-30 лет
- Статины (atorvastatin и др.) истощают запасы CoQ10
- Эффект накопительный — ощутимый результат через 2-4 недели

Источники: субпродукты (сердце — 11мг/100г), сардины, шпинат, брокколи.
Побочки: крайне редко — лёгкая бессонница при вечернем приёме.`;
}
export function getAstaxanthinGuide(message: string): string {
  const keywords = ['астаксантин', 'astaxanthin', 'антиоксидант мощн', 'каротиноид', 'красный пигмент'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[АСТАКСАНТИН — САМЫЙ МОЩНЫЙ КАРОТИНОИД]
В 6000 раз мощнее витамина C и в 550 раз мощнее витамина E как антиоксидант.

Механизмы:
- Встраивается в клеточные мембраны с обеих сторон (уникальное свойство!)
- Проникает через ГЭБ → защита мозга
- Снижает оксидативный стресс при интенсивных тренировках
- Подавляет NF-κB → системное противовоспалительное действие

Для спортсменов:
- Снижает маркеры мышечного повреждения (CK, LDH) на 20-40%
- Улучшает окисление жиров при аэробных нагрузках
- Защищает суставы от оксидативного повреждения
- Улучшает выносливость: +10% время до утомления (исследование 2011)
- Защищает кожу от УФ (актуально для outdoor-тренировок)

Дозировка:
- Стандарт: 4-12 мг/день
- Спортсмены: 8-12 мг/день
- Принимать с жирной пищей (каротиноид — жирорастворимый)
- Эффект накопительный: 2-4 недели до заметных результатов

Источники: лосось (5мг/100г), креветки, криль, микроводоросли Haematococcus pluvialis.
Безопасность: нет токсичности даже при 40 мг/день. Не является допингом.`;
}
export function getBoronMineral(message: string): string {
  const keywords = ['бор минерал', 'boron', 'бор добавка', 'бор кости', 'бор тестостерон', 'микроэлемент бор'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[БОР — НЕДООЦЕНЁННЫЙ МИКРОЭЛЕМЕНТ]
Бор критически важен для метаболизма кальция, магния и витамина D, но редко упоминается.

Функции:
- Поддерживает метаболизм стероидных гормонов (тестостерон, эстроген)
- Улучшает усвоение и удержание кальция и магния
- Активирует витамин D (конвертация в D3)
- Противовоспалительное действие (снижает CRP, TNF-α)
- Поддерживает когнитивные функции

Исследования:
- 10 мг/день повышал свободный тестостерон на 28% через 7 дней (Naghii, 2011)
- Снижал SHBG на 9% (больше свободного тестостерона)
- Улучшал маркеры костного метаболизма
- Снижал воспалительные маркеры на 20%

Дозировка:
- Стандарт: 3-6 мг/день
- Оптимальная для спортсменов: 6-10 мг/день
- Верхний предел: 20 мг/день
- Форма: борный глицинат или фруктоборат кальция

Источники:
- Авокадо: 2.1 мг/100г
- Изюм: 4.5 мг/100г
- Миндаль: 2.8 мг/100г
- Чернослив: 1.9 мг/100г

Синергия: D3 + K2 + магний + бор — идеальный стек для костей и гормонов.
Дефицит: распространён при диете с малым количеством фруктов и орехов.`;
}
export function getPqqMitochondrial(message: string): string {
  const keywords = ['pqq', 'пирролохинолин', 'митохондри биогенез', 'новые митохондри', 'энергия клеточная'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[PQQ — БИОГЕНЕЗ МИТОХОНДРИЙ]
Пирролохинолинхинон — единственная добавка, доказанно стимулирующая СОЗДАНИЕ НОВЫХ митохондрий.

Механизм:
- Активирует PGC-1α — мастер-регулятор биогенеза митохондрий
- Действует как редокс-кофактор (более стабильный, чем CoQ10)
- Нейропротекция: защищает нейроны от оксидативного стресса
- Синергия с CoQ10: PQQ создаёт митохондрии, CoQ10 поддерживает их работу

Для спортсменов:
- Больше митохондрий = больше энергии = лучше выносливость
- Ускоряет восстановление на клеточном уровне
- Улучшает утилизацию кислорода
- Поддерживает когнитивные функции при усталости

Дозировка:
- Стандарт: 10-20 мг/день
- Спортсмены: 20-40 мг/день
- Связка: PQQ 20мг + CoQ10 200-300мг (синергия!)
- Принимать утром с едой

Источники (очень малые количества):
- Натто: 61 нг/г
- Петрушка: 34 нг/г
- Зелёный чай: 30 нг/г
- Киви: 27 нг/г

Практически невозможно получить терапевтическую дозу из пищи — добавка обязательна.
Побочки: нет при рекомендуемых дозах. Не является допингом.`;
}
export function getShilajitGuide(message: string): string {
  const keywords = ['мумиё', 'shilajit', 'шиладжит', 'горная смола', 'фульвовая кислота'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[МУМИЁ (ШИЛАДЖИТ) — ДРЕВНИЙ АДАПТОГЕН]
Горная смола с 85+ минералами и фульвовыми кислотами — используется тысячелетиями в аюрведе и тибетской медицине.

Активные компоненты:
- Фульвовая кислота (60-80%): улучшает усвоение минералов, антиоксидант
- Дибензо-альфа-пироны: поддерживают митохондрии
- 85+ микроэлементов в ионной форме

Исследования:
- Повышает свободный тестостерон на 20% за 90 дней (Pandit, 2016)
- Увеличивает уровень CoQ10 в мышцах
- Улучшает адаптацию к высотным тренировкам
- Повышает усвоение железа и минералов

Дозировка:
- Стандарт: 300-500 мг/день очищенного экстракта
- Курс: 6-8 недель, перерыв 2 недели
- Приём: утром натощак, растворить в тёплой воде
- Форма: смола (лучшая) или капсулы (удобнее)

Качество:
- Выбирай очищенное от тяжёлых металлов
- Сертификат на содержание фульвовой кислоты (>50%)
- Запах — специфический, смолистый

Российский бонус: мумиё добывается на Алтае, в Средней Азии — доступное отечественное сырьё.
Совместимость: хорошо с креатином, CoQ10, витамином D.`;
}
export function getCurcuminBioavailability(message: string): string {
  const keywords = ['куркумин', 'curcumin', 'куркума', 'противовоспалит добавк', 'суставы воспаление'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[КУРКУМИН — МАКСИМАЛЬНАЯ БИОДОСТУПНОСТЬ]
Куркумин — мощнейший природный противовоспалительный агент, но его биодоступность без усилителей ~1%.

Формы по биодоступности:
1. Обычный куркумин: 1% усвоения (практически бесполезен без добавок)
2. С пиперином (чёрный перец): усвоение ×20 (бюджетный вариант)
3. Lipocurcumin/Meriva (фосфолипиды): усвоение ×29
4. Longvida (SLCP): усвоение ×65, проникает через ГЭБ
5. Theracurmin (наночастицы): усвоение ×27
6. BCM-95/Curcugreen: усвоение ×7-8

Для спортсменов:
- Снижает DOMS (болезненность) на 25-50%
- Уменьшает маркеры воспаления (CRP, IL-6) на 20-30%
- Защищает суставы (ингибирует NF-κB, COX-2)
- Ускоряет восстановление после тяжёлых тренировок
- Антиоксидантный эффект

Дозировка:
- Meriva: 500-1000 мг × 2 раза в день (с едой)
- Longvida: 400-800 мг/день
- С пиперином: 500мг куркумина + 20мг пиперина × 2-3 раза

Важно: приём с жирами увеличивает усвоение. Не принимать натощак.
Противопоказания: желчнокаменная болезнь, приём антикоагулянтов.
Курс: можно длительно (месяцы), но мониторить печёночные ферменты при дозах >2г/день.`;
}
export function getNacGuide(message: string): string {
  const keywords = ['nac', 'н-ацетилцистеин', 'ацетилцистеин', 'глутатион предшественник', 'nac добавка', 'ацц'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[NAC (N-АЦЕТИЛЦИСТЕИН) — ПРЕДШЕСТВЕННИК ГЛУТАТИОНА]
NAC — прямой предшественник глутатиона, главного антиоксиданта организма.

Механизмы:
- Повышает уровень глутатиона на 30-50%
- Муколитик (разжижает мокроту — известен как АЦЦ)
- Детоксикация печени (используется в медицине при отравлениях)
- Модулирует глутаматергическую систему (нейропротекция)
- Хелатирует тяжёлые металлы

Для спортсменов:
- Защита от оксидативного стресса при тяжёлых тренировках
- Поддержка иммунитета (глутатион критичен для иммунных клеток)
- Ускорение восстановления после длительных нагрузок
- Защита печени при высокобелковой диете
- Снижение воспалительных маркеров

Дозировка:
- Стандарт: 600-1200 мг/день
- Спортсмены: 1200-1800 мг/день (разделить на 2-3 приёма)
- Приём: натощак (за 30 мин до еды) для лучшего усвоения
- Курс: 8-12 недель, перерыв 4 недели

Совместимость:
- Хорошо: витамин C (синергия антиоксидантов), селен, глицин
- Осторожно: не принимать одновременно с нитроглицерином

Побочки: редко — ЖКТ-дискомфорт, запах серы.
В РФ: доступен как АЦЦ (600мг) без рецепта, но спортивные формы дешевле в порошке.`;
}
export function getSpirulinaGuide(message: string): string {
  const keywords = ['спирулина', 'spirulina', 'сине-зелёные водоросл', 'суперфуд водоросл', 'фикоцианин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[СПИРУЛИНА — СУПЕРФУД ДЛЯ СПОРТСМЕНОВ]
Сине-зелёная водоросль с 60-70% белка и уникальным антиоксидантом фикоцианином.

Состав (на 10г):
- Белок: 6-7г (все незаменимые аминокислоты!)
- Железо: 3-5 мг (30-50% суточной нормы)
- Витамин B12: 2-8 мкг (но биодоступность спорная)
- Бета-каротин: 14 мг
- Фикоцианин: уникальный антиоксидант

Для спортсменов:
- Снижает оксидативный стресс после тренировок на 25%
- Повышает выносливость: +7% время до утомления (2010, Medicine & Science)
- Снижает маркеры воспаления (CRP, IL-6)
- Источник легкоусвояемого железа (важно для выносливости)
- Улучшает липидный профиль

Дозировка:
- Стандарт: 3-5г/день
- Спортсмены: 5-10г/день
- Начинай с 1г/день (ЖКТ-адаптация)
- Приём: утром или перед тренировкой

Качество:
- Выбирай органическую, без тяжёлых металлов
- Тест на микроцистины (токсины) — обязателен!
- Таблетки или порошок — разницы в эффекте нет

Противопоказания: аутоиммунные заболевания (стимулирует иммунитет), фенилкетонурия.
Совместимость: хорошо с хлореллой, витамином C, спирулиной.`;
}
export function getFulvicAcid(message: string): string {
  const keywords = ['фульвовая кислота', 'fulvic acid', 'гуминовые', 'минерал усвоение', 'humic'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ФУЛЬВОВАЯ КИСЛОТА — УСИЛИТЕЛЬ МИНЕРАЛОВ]
Органическое соединение из почвы — природный хелатор, повышающий биодоступность минералов в 2-5 раз.

Механизмы:
- Хелатирует минералы → переводит в ионную форму → лучшее усвоение
- Проникает через клеточные мембраны, доставляя нутриенты внутрь клетки
- Мощный антиоксидант (нейтрализует свободные радикалы)
- Поддерживает электролитный баланс
- Улучшает здоровье кишечника (усиливает барьерную функцию)

Для спортсменов:
- Улучшает усвоение железа, цинка, магния из пищи
- Поддерживает энергетический метаболизм
- Ускоряет детоксикацию (выводит тяжёлые металлы)
- Может улучшить тестостерон (через лучшее усвоение цинка/бора)

Дозировка:
- Жидкая форма: 15-30 капель в воду, 1-2 раза в день
- Капсулы: 250-500 мг/день
- Приём: утром натощак или с едой

Качество:
- Источник: леонардит, торф, мумиё (содержит фульвовую кислоту)
- Без тяжёлых металлов (сертификат!)
- Органическая экстракция (без химии)

Синергия: принимай вместе с мультивитаминами — усилит их действие.
Побочки: крайне редко — потемнение стула (нормально, из-за гуминовых кислот).`;
}
export function getGoodMorning(message: string): string {
  const keywords = ['гуд морнинг', 'good morning', 'наклоны со штангой', 'поясница упражнение штанга', 'задняя цепь штанга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ГУД МОРНИНГ — НАКЛОНЫ СО ШТАНГОЙ НА ПЛЕЧАХ]
Ключевое вспомогательное упражнение для становой и приседаний — мощно нагружает всю заднюю цепь.

Техника:
1. Штанга на трапециях (как для приседаний)
2. Ноги на ширине плеч, чуть согнуты в коленях
3. Отводи таз назад, наклоняя корпус вперёд
4. Спина СТРОГО нейтральная — никакого округления!
5. Наклоняйся до параллели корпуса с полом (или чуть ниже)
6. Поднимайся, разгибая бёдра, сжимая ягодичные

Варианты:
- Стоя (классический): задняя цепь целиком
- Сидя на скамье: изоляция поясницы (убраны ноги)
- С резинкой: нарастающее сопротивление
- С Safety Squat Bar: комфортнее для плеч
- С паузой внизу: развитие стабильности

Параметры:
- 3-4 × 8-12 повторений
- Вес: 30-50% от приседа (лёгкие веса!)
- Контроль: медленный темп 3-0-3-0
- НИКОГДА не делай на максимум — это вспомогательное!

Целевые мышцы: разгибатели спины, ягодичные, бицепс бедра.
Место: после основного движения (присед или становая).
Противопоказания: грыжи, протрузии в острой фазе, слабый кор.`;
}
export function getResveratrolLongevity(message: string): string {
  const keywords = ['ресвератрол', 'resveratrol', 'виноград полифенол', 'антиэйдж добавка', 'сиртуин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[РЕСВЕРАТРОЛ — ПОЛИФЕНОЛ ДОЛГОЛЕТИЯ]
Полифенол из кожуры винограда — активирует сиртуины (гены долголетия) и имитирует эффект калорийного ограничения.

Механизмы:
- Активирует SIRT1 → улучшение митохондриальной функции
- Активирует AMPK → улучшение метаболизма глюкозы
- Мощный антиоксидант и противовоспалительное
- Защищает сердечно-сосудистую систему
- Улучшает кровоток (NO-зависимая вазодилатация)

Для спортсменов:
- Улучшает аэробную ёмкость (через митохондриальный биогенез)
- Защищает мышцы от оксидативного повреждения
- Улучшает кровоток к мышцам при нагрузках
- Поддерживает здоровье суставов (противовоспалительное)

⚠️ Спорный момент:
- Высокие дозы (>1г/день) могут БЛОКИРОВАТЬ адаптацию к тренировкам
- Антиоксидантный парадокс: ROS нужны как сигнал для адаптации
- Рекомендация: низкие-средние дозы, НЕ принимать сразу после тренировки

Дозировка:
- Стандарт: 100-500 мг/день (транс-ресвератрол!)
- Не перед и не сразу после тренировки (через 4+ часа)
- С жирной пищей для усвоения

Источники: красное вино (1-2 мг/стакан — мизер), виноград, арахис, какао.
Форма: транс-ресвератрол (НЕ цис-форма — неактивна).`;
}
export function getEaaGuide(message: string): string {
  const keywords = ['eaa', 'незаменимые аминокислот', 'essential amino', 'аминокислоты комплекс', 'eaa vs bcaa'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[EAA (НЕЗАМЕНИМЫЕ АМИНОКИСЛОТЫ) — ПОЛНЫЙ ГАЙД]
9 аминокислот, которые организм НЕ может синтезировать — они должны поступать с пищей.

EAA vs BCAA:
- BCAA = 3 аминокислоты (лейцин, изолейцин, валин) — только часть
- EAA = все 9 незаменимых — полноценный стимул для синтеза белка
- EAA эффективнее BCAA на 50%+ для мышечного роста (исследование 2017)

9 незаменимых:
1. Лейцин (2.5г) — главный триггер mTOR
2. Изолейцин (1.5г) — утилизация глюкозы мышцами
3. Валин (1.5г) — энергия при нагрузках
4. Лизин (1.5г) — синтез коллагена, усвоение кальция
5. Треонин (1г) — иммунитет, коллаген
6. Фенилаланин (1г) — предшественник дофамина
7. Метионин (0.5г) — антиоксидант, метилирование
8. Триптофан (0.5г) — серотонин, мелатонин
9. Гистидин (0.5г) — карнозин, гемоглобин

Когда принимать:
- Интратренировочно: 10-15г EAA в воде (если тренировка натощак)
- Между приёмами пищи: 5-10г
- При низкобелковой диете: как дополнение

Когда НЕ нужны:
- Если ешь 1.6-2.2г белка/кг из полноценных источников
- Если уже пьёшь протеин

Преимущество: быстрое усвоение, не нагружает ЖКТ, минимум калорий.`;
}
export function getChlorellaDetox(message: string): string {
  const keywords = ['хлорелла', 'chlorella', 'детокс водоросл', 'хлорофилл', 'очищение организм'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ХЛОРЕЛЛА — ДЕТОКС И ВОССТАНОВЛЕНИЕ]
Одноклеточная зелёная водоросль — чемпион по хлорофиллу и детоксикационному потенциалу.

Состав (на 10г):
- Белок: 5-6г (55-67% от массы)
- Хлорофилл: 30-70 мг (в 10 раз больше спирулины!)
- Железо: 1.3 мг
- Витамин B12: 0.3 мкг (биоактивная форма!)
- CGF (Chlorella Growth Factor): нуклеотиды, пептиды

Уникальные свойства:
- Хелатирует тяжёлые металлы (ртуть, свинец, кадмий)
- Связывает токсины в ЖКТ (препятствует реабсорбции)
- Хлорофилл поддерживает кроветворение
- CGF ускоряет регенерацию клеток

Для спортсменов:
- Детоксикация при высокобелковой диете
- Поддержка кроветворения (железо + хлорофилл)
- Ускорение восстановления (CGF)
- Поддержка иммунитета
- Улучшение пищеварения

Дозировка:
- Стандарт: 3-5г/день
- Детокс: 5-10г/день
- Начинай с 1г/день (может быть детокс-реакция!)
- Принимай с едой

Важно: клеточная стенка должна быть РАЗРУШЕНА (broken cell wall) — иначе не усваивается.
Хлорелла vs спирулина: хлорелла — детокс, спирулина — энергия. Идеально комбинировать.`;
}
export function getReverseHyper(message: string): string {
  const keywords = ['обратная гиперэкстензия', 'reverse hyper', 'реверс гипер', 'поясница тренажёр', 'декомпрессия позвоночн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ОБРАТНАЯ ГИПЕРЭКСТЕНЗИЯ — РЕАБИЛИТАЦИЯ И СИЛА]
Изобретена Луи Симмонсом (Westside Barbell) для лечения собственной травмы спины.

Уникальность:
- ЕДИНСТВЕННОЕ упражнение, сочетающее укрепление И декомпрессию поясницы
- В маховой фазе позвонки мягко разделяются (тракция)
- В силовой фазе — мощное укрепление разгибателей

Техника:
1. Ложись животом на платформу, держись за ручки
2. Ноги свисают свободно (с роликом или без)
3. Поднимай ноги маховым движением до горизонтали (или чуть выше)
4. Контролируй спуск — ноги проходят под скамьёй (маятник)
5. Используй инерцию маятника, но контролируй движение

С роликом (тренажёр):
- 3-4 × 12-20 повторений с весом
- Лёгкий: реабилитация, декомпрессия
- Тяжёлый: развитие силы ягодичных и поясницы

Без тренажёра (на скамье):
- Ложись на конец высокой скамьи
- Держись за ножки
- Поднимай ноги до горизонтали
- 3 × 15-20 повторений

Когда делать:
- Перед тренировкой: лёгко, для разогрева и декомпрессии
- После тренировки: с весом, для укрепления
- В день отдыха: лёгко, для восстановления

Рекомендация Луи Симмонса: делать каждый день — "лучшее, что вы можете дать своей спине".`;
}
export function getAlphaGpcCognitive(message: string): string {
  const keywords = ['альфа гпц', 'alpha-gpc', 'alpha gpc', 'холин', 'ацетилхолин', 'когнитив добавка', 'фокус добавка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ALPHA-GPC — ХОЛИН ДЛЯ МОЗГА И МЫШЦ]
Лучшая форма холина — прекурсор ацетилхолина (нейромедиатор внимания, памяти и мышечного сокращения).

Механизмы:
- Повышает уровень ацетилхолина в мозге → лучший фокус
- Ацетилхолин = нейромедиатор мышечного сокращения (нервно-мышечная связь!)
- Стимулирует секрецию гормона роста
- Проникает через ГЭБ (в отличие от холин битартрата)

Для спортсменов:
- Улучшение "mind-muscle connection" (связь мозг-мышца)
- Повышение силы: +14% пиковой мощности (исследование 2008)
- Улучшение фокуса и концентрации во время тренировки
- Секреция GH: +44% при 600мг за 90 мин до тренировки
- Нейропротекция при ударных видах спорта

Дозировка:
- Когнитивная поддержка: 300-600 мг/день
- Перед тренировкой: 300-600 мг за 30-60 мин
- Секреция GH: 600 мг за 90 мин до сна

Формы холина (по эффективности):
1. Alpha-GPC (50% холина) — лучшая для мозга и мышц
2. CDP-Choline (18% холина) — лучшая для нейропротекции
3. Холин битартрат — дешёвый, плохо проникает в мозг

Побочки: редко — головная боль, ЖКТ (снизить дозу).
Совместимость: хорошо с кофеином, L-теанином, креатином.`;
}
export function getTongkatAli(message: string): string {
  const keywords = ['тонгкат', 'tongkat ali', 'эврикома', 'longjack', 'тестобустер натуральн', 'эврикоманон'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ТОНГКАТ АЛИ — НАТУРАЛЬНЫЙ ТЕСТОБУСТЕР]
Eurycoma longifolia — один из немногих натуральных тестобустеров с серьёзной доказательной базой.

Механизмы:
- Снижает SHBG (глобулин, связывающий половые гормоны) → больше свободного тестостерона
- Ингибирует ароматазу (меньше конвертации в эстроген)
- Снижает кортизол на 16% (улучшает T:C соотношение)
- Активирует ферменты CYP17 в клетках Лейдига

Исследования:
- +37% тестостерона у мужчин с умеренно сниженным T (Talbott, 2013)
- Снижение кортизола на 16% за 4 недели
- Улучшение состава тела: -2% жира за 5 недель
- Улучшение силы и настроения

Дозировка:
- Стандартизованный экстракт (100:1 или 200:1): 200-400 мг/день
- Горький вкус = маркер качества (эврикоманон)
- Утром натощак (лучшее усвоение)
- Циклирование: 5 дней / 2 выходных или 8 недель / 2 перерыв

Кому реально поможет:
✅ Мужчины 30+ с сниженным T
✅ При хроническом стрессе (высокий кортизол)
✅ После сушки / сильного дефицита калорий
❌ Молодые мужчины с нормальным T (эффект минимален)

Побочки: редко — бессонница (принимай утром), жажда.
Не является допингом — разрешён WADA.`;
}
export function getElderberryImmune(message: string): string {
  const keywords = ['бузина', 'elderberry', 'sambucus', 'иммунитет ягод', 'простуда добавка', 'противовирусн ягод'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[БУЗИНА ЧЁРНАЯ — ИММУННАЯ ПОДДЕРЖКА ДЛЯ СПОРТСМЕНОВ]
Sambucus nigra — одно из самых изученных растительных средств для иммунитета.

Механизмы:
- Блокирует вирусную гемагглютинин (препятствует проникновению вируса в клетку)
- Стимулирует выработку цитокинов (IL-6, IL-8, TNF-α)
- Высокое содержание антоцианов (антиоксиданты)
- Ингибирует нейраминидазу (как осельтамивир/Тамифлю — но мягче)

Исследования:
- Сокращение длительности простуды на 3-4 дня (мета-анализ 2019)
- Снижение тяжести симптомов на 50-70%
- Эффективна как профилактика у путешественников

Для спортсменов:
- Интенсивные тренировки → временное подавление иммунитета → "окно инфекции"
- Бузина сокращает это окно
- Особенно актуальна в период соревнований и межсезонье

Дозировка:
- Профилактика: 500-1000 мг экстракта/день
- При первых симптомах: 1000 мг × 3-4 раза в день × 3-5 дней
- Сироп: 15 мл × 4 раза/день
- Курс профилактики: осень-зима непрерывно

Важно:
⚠️ Нельзя есть СЫРЫЕ ягоды бузины — содержат цианогенные гликозиды (токсично!)
⚠️ Только термически обработанные или экстракт

Российский бонус: бузина чёрная растёт по всей европейской части России.`;
}
export function getMacaRoot(message: string): string {
  const keywords = ['мака', 'maca root', 'перуанская мака', 'мака либидо', 'мака энергия', 'lepidium'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[МАКА ПЕРУАНСКАЯ — ЭНЕРГИЯ И АДАПТАЦИЯ]
Lepidium meyenii — адаптоген из Перу, растущий на высоте 4000+ м.

Типы маки:
- Жёлтая (70% урожая): общая энергия, гормональный баланс
- Красная: антиоксидант, простата, костная ткань
- Чёрная: либидо, сперматогенез, когнитивные функции (самая редкая)

Исследования:
- Улучшение либидо на 42% за 12 недель (1.5-3г/день)
- НЕ влияет на тестостерон напрямую (работает через другие механизмы!)
- Снижение тревожности и депрессии
- Улучшение выносливости у велосипедистов
- Улучшение сперматогенеза (объём, подвижность)

Для спортсменов:
- Повышение общей энергии и выносливости
- Адаптация к стрессу (высокие нагрузки)
- Улучшение настроения и мотивации
- Нормализация гормонального фона

Дозировка:
- Порошок: 1.5-3г/день (начинай с 1г)
- Экстракт (6:1): 450-500 мг/день
- Желатинизированная (без крахмала): лучше усваивается
- Приём: утром или перед тренировкой

Важно:
- Эффект накопительный — 2-4 недели до результата
- Циклирование: 2 месяца / 2 недели перерыв
- Побочки: редко — ЖКТ-дискомфорт, бессонница

Совместимость: хорошо с ашвагандой, родиолой, тонгкат али.`;
}
export function getBlackSeedOil(message: string): string {
  const keywords = ['чёрный тмин', 'black seed', 'nigella sativa', 'тимохинон', 'масло чёрного тмина'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[МАСЛО ЧЁРНОГО ТМИНА — УНИВЕРСАЛЬНЫЙ СУПЕРФУД]
Nigella sativa — "лекарство от всего, кроме смерти" (хадис). Активное вещество — тимохинон.

Механизмы:
- Тимохинон: мощный антиоксидант и противовоспалительное
- Модулирует иммунитет (активирует NK-клетки)
- Ингибирует NF-κB (мастер-регулятор воспаления)
- Улучшает инсулиновую чувствительность

Для спортсменов:
- Снижение воспаления после тренировок
- Поддержка дыхательной системы (бронходилатация)
- Улучшение липидного профиля
- Защита печени при высокобелковой диете
- Антиоксидантная защита

Исследования:
- Снижение CRP (воспаление) на 30% за 8 недель
- Улучшение VO2max на 5% (исследование 2015)
- Снижение массы тела на 2 кг за 12 недель
- Улучшение бронхиальной проходимости

Дозировка:
- Масло: 1-3 чайных ложки/день (холодного отжима)
- Капсулы: 500-1000 мг × 2-3 раза в день
- Тимохинон (экстракт): 10-25 мг/день
- Приём: с едой (жирная пища)

Побочки: горький вкус масла, ЖКТ при больших дозах.
Качество: только холодный отжим, тёмное стекло, содержание тимохинона >2%.
Осторожно: может взаимодействовать с метформином, варфарином.`;
}
export function getSingleLegRDL(message: string): string {
  const keywords = ['одноногая', 'single leg', 'рдл на одной', 'румынская на одной', 'односторонняя тяга', 'дисбаланс ног'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦩 РУМЫНСКАЯ ТЯГА НА ОДНОЙ НОГЕ:

Преимущества:
- Выявляет и устраняет мышечный дисбаланс
- Развивает проприоцепцию и баланс
- Укрепляет стабилизаторы голеностопа/бедра
- Безопасна для поясницы (меньше осевая нагрузка)
- Функциональный перенос (бег, прыжки)

Техника:
1. Гантель в противоположной руке от рабочей ноги
2. Лёгкий наклон вперёд, свободная нога уходит назад
3. Спина прямая — от макушки до пятки одна линия
4. Таз не раскрывается (оба гребня смотрят вниз)
5. Опускаться до натяжения задней поверхности
6. Мощное разгибание бедра вверх

Прогрессия:
1. Без веса (баланс) → 2. Касание стены → 3. Гантель
4. Штанга → 5. С дефицитом → 6. С паузой внизу

Частые ошибки:
- Вращение таза (раскрытие бедра)
- Округление спины
- Сгибание рабочей ноги слишком сильно
- Взгляд вниз (нарушает баланс)

Программирование:
- 3×8-12 на каждую ногу
- Accessory после основной тяги
- 2 раза в неделю для коррекции дисбаланса`;
}
export function getArachidonicAcid(message: string): string {
  const keywords = ['арахидоновая', 'arachidonic', 'простагландин', 'пгf2', 'pgf2'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔬 АРАХИДОНОВАЯ КИСЛОТА (ARA):

Что это:
Омега-6 жирная кислота, предшественник простагландинов.
PGF2α — ключевой медиатор мышечного роста после тренировки.

Механизм:
- Повреждение мышц → высвобождение ARA из мембран
- ARA → PGF2α (через циклооксигеназу-2)
- PGF2α → активация mTOR → синтез белка
- PGF2α → привлечение сателлитных клеток → гипертрофия

Исследования:
- +3.4% мышечной массы за 50 дней (Molecular & Cellular Endocrinology, 2007)
- Увеличение пиковой мощности на 5%
- Увеличение анаэробной выносливости
- Снижение маркеров воспаления (парадоксально)

Дозировка:
- 1000-1500 мг/день (исследовательская доза)
- Приём: за 30-45 мин до тренировки
- Курс: 8-12 недель, перерыв 4 недели
- Не сочетать с НПВС (ибупрофен блокирует COX-2)!

Важно:
- НЕ принимать омега-3 одновременно (конкурируют)
- Разнести приём ARA и рыбьего жира на 6+ часов
- Не для новичков — эффект заметнее у опытных (>2 лет)
- Источники в пище: яйца, мясо, субпродукты

Противопоказания: астма, аутоиммунные заболевания, приём НПВС.`;
}
export function getGlucosamineChondroitin(message: string): string {
  const keywords = ['глюкозамин', 'хондроитин', 'glucosamine', 'chondroitin', 'хондропротектор', 'суставы добавк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💊 ГЛЮКОЗАМИН + ХОНДРОИТИН:

Глюкозамин:
- Строительный блок хрящевой ткани
- Стимулирует синтез протеогликанов
- Формы: сульфат (лучше) vs гидрохлорид
- Доза: 1500 мг/день (500мг × 3 или 1500 разово)

Хондроитин:
- Удерживает воду в хряще (амортизация)
- Ингибирует ферменты разрушения хряща
- Доза: 800-1200 мг/день
- Синергия с глюкозамином

Эффективность (спорная):
- Мета-анализ 2010 (NEJM): не лучше плацебо
- Мета-анализ 2018: умеренный эффект при остеоартрозе колена
- Работает лучше при лёгкой-средней стадии
- Эффект через 4-8 недель (накопительный)

Для спортсменов:
- Профилактика износа хрящей при нагрузках
- Комбинировать с коллагеном и витамином C
- Не заменяет правильную технику и разумные нагрузки
- Лучше работает на ранних стадиях проблем

Оптимальный стек для суставов:
1. Глюкозамин сульфат 1500мг
2. Хондроитин сульфат 1200мг
3. Коллаген гидролизат 10г
4. Витамин C 250мг
5. Омега-3 2-4г
6. MSM 1000-3000мг

Курс: 3-6 месяцев минимум для оценки эффекта.
Побочки: редко — ЖКТ, аллергия на морепродукты (глюкозамин из панцирей).`;
}
export function getPycnogenolGuide(message: string): string {
  const keywords = ['пикногенол', 'pycnogenol', 'кора сосны', 'pine bark', 'проантоцианидин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌲 ПИКНОГЕНОЛ (ЭКСТРАКТ КОРЫ СОСНЫ):

Что это:
Стандартизированный экстракт из коры приморской сосны.
Содержит проантоцианидины — мощные антиоксиданты.

Механизм:
- Антиоксидантная сила в 20 раз > витамина C
- Ингибирует NF-κB (мастер воспаления)
- Улучшает выработку оксида азота (NO)
- Стабилизирует коллаген и эластин

Для спортсменов:
- Улучшение кровотока (вазодилатация через NO)
- Снижение DOMS и времени восстановления
- Снижение CRP (воспаление) на 72% за 5 дней (исследование)
- Улучшение выносливости (VO2max +5-8%)
- Защита суставов (ингибирование матриксных металлопротеиназ)
- Снижение отёчности после травм

Исследования:
- Снижение мышечных судорог на 37% (300мг, 4 нед)
- Улучшение когнитивных функций
- Снижение систолического давления на 5-8 мм рт.ст.

Дозировка:
- Общее здоровье: 50-100 мг/день
- Спортсмены: 100-200 мг/день
- Восстановление: 200-300 мг/день
- Принимать с едой
- Эффект через 1-2 недели

Побочки: минимальные. Редко: ЖКТ, головная боль.
Качество: только Pycnogenol® (запатентованный экстракт).`;
}
export function getCurcuminPiperine(message: string): string {
  const keywords = ['куркумин перец', 'куркумин пиперин', 'curcumin piperine', 'биоперин', 'биодоступность куркум'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌶️ КУРКУМИН + ПЕРЕЦ = СУПЕРСИНЕРГИЯ:

Проблема куркумина:
- Биодоступность чистого куркумина: <1%
- Быстро метаболизируется в печени
- Плохо всасывается в кишечнике
- Без усилителей — практически бесполезен

Пиперин (BioPerine®):
- Алкалоид чёрного перца
- Увеличивает биодоступность куркумина на 2000%!
- Ингибирует глюкуронидацию в печени
- Доза: 5-20 мг (1/20 чайной ложки перца)

Другие способы повышения:
- С жирами: куркумин жирорастворим (+?)
- Липосомальный куркумин: биодоступность ×10-30
- Наночастицы (NovaSol®): биодоступность ×185
- Фитосомы (Meriva®): ×30
- Longvida®: проходит ГЭБ (мозг)

Для спортсменов:
- Снижение DOMS на 25-30%
- Противовоспалительное = ибупрофену (без побочек на ЖКТ)
- Поддержка суставов при тяжёлых нагрузках
- Антиоксидантная защита

Рекомендация:
- Бюджет: куркумин 500мг + BioPerine 5мг × 2 раза/день
- Премиум: Meriva/NovaSol 500-1000мг/день
- Принимать с жирной пищей
- Курс: 8-12 недель для суставов`;
}
export function getAbsScienceBased(message: string): string {
  const keywords = ['пресс наука', 'abs science', 'кубики пресса', 'прямая мышца живота', 'пресс тренировка наук'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 ПРЕСС: НАУЧНЫЙ ПОДХОД:

Анатомия:
- Прямая мышца живота: «кубики» (сгибание позвоночника)
- Косые (внешние/внутренние): ротация, боковое сгибание
- Поперечная: глубокий стабилизатор (корсет)
- Квадратная поясницы: латеральная стабилизация

Топ упражнений по ЭМГ:
ВЕРХНИЙ ПРЕСС:
1. Скручивания на блоке: 3×12-15
2. Кранчи на фитболе: 3×15-20

НИЖНИЙ ПРЕСС:
1. Подъём ног в висе: 3×10-15
2. Reverse crunches: 3×12-15
3. Dragon flags: 3×5-8

КОСЫЕ:
1. Pallof press: 3×10-12
2. Woodchops (блок): 3×12-15
3. Русские скручивания (с весом): 3×12-15

Ключевые принципы:
- Пресс виден при <12% жира у мужчин, <20% у женщин
- Тренировка НЕ сжигает жир на животе (невозможно!)
- Пресс — мышца как любая другая (нужна прогрессия)
- 6-15 подходов/неделю достаточно
- Разнообразие углов и плоскостей

Что НЕ работает:
- 100 скручиваний каждый день (нет прогрессии)
- Только статика (планка не растит массу)
- Пояса для похудения (маркетинг)`;
}
export function getRdlFormDetailed(message: string): string {
  const keywords = ['румынская тяга техника', 'rdl форма', 'rdl техника', 'румынская тяга как', 'румынская подробно'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ РУМЫНСКАЯ ТЯГА — ДЕТАЛЬНЫЙ РАЗБОР ТЕХНИКИ:

Стартовая позиция:
- Штанга в руках (снять со стоек, не с пола)
- Хват чуть шире плеч (смешанный или прямой + лямки)
- Стопы на ширине бёдер, носки слегка наружу
- Колени слегка согнуты (10-15°) и ЗАФИКСИРОВАНЫ

Опускание:
1. Начало движения: ТАЗА НАЗАД (не наклон корпуса!)
2. Штанга скользит вдоль бёдер (касается!)
3. Спина: нейтральная (не округлять, не переразгибать)
4. Лопатки сведены, грудь вперёд
5. Взгляд: 2-3 метра вперёд (не вверх, не вниз)
6. Опускаться до натяжения задней поверхности

Подъём:
1. Разгибание бедра (не спина!)
2. Ягодицы мощно вперёд
3. Штанга вдоль ног
4. Полное разгибание: сжать ягодицы наверху
5. НЕ переразгибать поясницу

Глубина:
- Зависит от гибкости: от колена до середины голени
- Ориентир: чувство натяжения в бицепсе бедра
- Не гонитесь за глубиной — она придёт с практикой

Частые ошибки:
- Сгибание коленей (становится обычной тягой)
- Округление спины (травма!)
- Штанга далеко от ног (рычаг на поясницу)
- Подъём спиной, а не бёдрами
- Взгляд в потолок (переразгибание шеи)

Вес: 60-70% от обычной становой.`;
}
export function getAlphaLipoicAcid(message: string): string {
  const keywords = ['альфа-липоевая', 'alpha lipoic', 'ала кислота', 'ala supplement', 'липоевая кислота'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧪 АЛЬФА-ЛИПОЕВАЯ КИСЛОТА (АЛК):

Что это:
Универсальный антиоксидант — работает и в воде, и в жирах.
Единственный антиоксидант, проникающий везде в теле.

Механизм:
- Рециклинг витаминов C, E, глутатиона, CoQ10
- Хелатор тяжёлых металлов
- Улучшает инсулиновую чувствительность
- Активирует AMPK (энергетический сенсор клетки)
- Митохондриальный кофактор

Для спортсменов:
- Улучшение утилизации глюкозы мышцами (+25%)
- Снижение оксидативного стресса после тренировок
- Лучшее восстановление (антиоксидантный каскад)
- Нейропротекция (когнитивные функции)
- Поддержка при сушке (инсулиновая чувствительность)

Формы:
- R-ALA: натуральная, активная форма (в 2 раза эффективнее)
- S-ALA: синтетическая (менее активна)
- Racemic (R+S): дешевле, но менее эффективна

Дозировка:
- Общее здоровье: 300-600 мг/день
- Инсулиновая чувствительность: 600-1200 мг/день
- R-ALA: 100-300 мг/день (более концентрированная)
- Принимать натощак (жиры снижают усвоение)
- Разделить на 2-3 приёма

Побочки: ЖКТ при больших дозах, снижение сахара крови.
Осторожно: при диабете — корректировка дозы инсулина!`;
}
export function getPhosphatidylserineAdv(message: string): string {
  const keywords = ['фосфатидилсерин продвин', 'phosphatidylserine adv', 'фс кортизол', 'фосфатидилсерин стресс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧠 ФОСФАТИДИЛСЕРИН — ПРОДВИНУТЫЙ ГАЙД:

Что это:
Фосфолипид, составляющий 15% фосфолипидов мозга.
Критичен для мембран нейронов и сигнальных каскадов.

Для спортсменов (подробно):
- Снижение кортизола на 20-30% после тренировки
- Улучшение соотношения тестостерон/кортизол
- Ускорение восстановления (снижение катаболизма)
- Улучшение когнитивных функций (реакция, фокус)
- Снижение DOMS

Исследования:
- 600мг/день: снижение кортизола после тренировки на 30%
- 400мг/день: улучшение настроения и когнитивных функций
- 200мг/день: минимальная эффективная доза
- 800мг/день: улучшение точности в гольфе (исследование 2007)

Дозировка:
- Снижение кортизола: 400-800 мг/день
- Когнитивные функции: 200-400 мг/день
- Принимать после тренировки (снижение кортизола)
- Или перед сном (улучшение сна)

Источники:
- Соевый лецитин (дешевле, менее эффективен)
- Подсолнечный лецитин (без сои)
- Из коровьих мозгов (исторически, сейчас не используют)

Синергия:
- ФС + омега-3 = лучше усвоение и эффект
- ФС + ашваганда = двойное снижение кортизола
- ФС + магний = глубокий сон

Побочки: практически нет. Редко: ЖКТ при больших дозах.`;
}
export function getDipsDeepDive(message: string): string {
  const keywords = ['брусья углублённ', 'dips deep', 'отжимания на брусьях подробн', 'брусья техника детальн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ОТЖИМАНИЯ НА БРУСЬЯХ — УГЛУБЛЁННЫЙ ГАЙД:

Грудной вариант vs Трицепсовый:
ГРУДЬ: наклон вперёд 30°, локти в стороны, широкий хват
ТРИЦЕПС: тело вертикально, локти назад, узкий хват

Техника (грудной):
1. Хват чуть шире плеч
2. Наклон вперёд 20-30° (ОЧЕНЬ ВАЖНО!)
3. Опускание: до 90° в локтях (или чуть ниже)
4. Локти слегка разведены в стороны
5. Подъём мощный, не разгибая руки полностью
6. Контроль на протяжении всего ROM

Прогрессия:
1. Негативные (5 сек опускание): 4×5
2. С резинкой (помощь): 3×8-12
3. Собственный вес: 3×8-12
4. С паузой внизу (2 сек): 3×6-10
5. С отягощением: 3×6-10

Частые ошибки:
- Слишком глубокое опускание (травма плеча!)
- Раскачка корпусом
- Разгибание рук полностью (нагрузка на локти)
- Слишком быстрое опускание

Противопоказания:
- Импинджмент плеча (боль в передней части)
- Нестабильность плечевого сустава
- Проблемы с грудным отделом

Программирование:
- Compound движение: первое-второе на грудь/трицепс
- 3-4×6-12
- С отягощением: прогрессия по 2.5 кг каждые 1-2 недели`;
}
export function getRhodiolaRoseaGuide(message: string): string {
  const keywords = ['родиола', 'rhodiola', 'золотой корень', 'адаптоген', 'родиола розовая'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌿 РОДИОЛА РОЗОВАЯ (ЗОЛОТОЙ КОРЕНЬ) ДЛЯ СПОРТСМЕНОВ:

Что это: адаптоген, произрастает в Сибири и Арктике. Используется в советской/российской спортивной медицине с 1960-х.

Доказанные эффекты:
- Снижение субъективного ощущения усталости (RPE ниже)
- Улучшение когнитивных функций при стрессе
- Антикортизоловое действие (снижает стресс-гормон)
- Повышение выносливости на 3-5% при длительных нагрузках
- Антиоксидантная защита
- Нейропротекция (защита нервной системы)

Активные вещества:
- Розавин (специфичен для родиолы) — минимум 3%
- Салидрозид — минимум 1%
- Соотношение розавин:салидрозид = 3:1 (как в корне)

Дозировка:
- Стандартная: 200-400 мг/день (стандартизированного экстракта)
- До тренировки: 200 мг за 30-60 минут
- При стрессе/перетренированности: 400-600 мг
- Утром натощак — лучшее усвоение
- Циклирование: 5 дней приём / 2 дня перерыв

Предосторожности:
- Может усиливать действие стимуляторов
- Не принимать вечером (бодрящий эффект)
- Биполярное расстройство — противопоказание
- Курс: 4-8 недель, перерыв 2 недели`;
}
export function getDigestiveEnzymesGuide(message: string): string {
  const keywords = ['пищеварительные ферменты', 'ферменты', 'энзимы', 'digestive enzymes', 'переваривание белка', 'вздутие после еды'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧬 ПИЩЕВАРИТЕЛЬНЫЕ ФЕРМЕНТЫ ДЛЯ СПОРТСМЕНОВ:

Зачем спортсмену:
- Большой объём пищи = нагрузка на ЖКТ
- 150-200г белка/день требует эффективного расщепления
- Вздутие и газы — признак неполного переваривания
- Лучшее усвоение = лучшее восстановление

Основные ферменты:
- Протеазы: расщепляют белок → аминокислоты
- Липазы: расщепляют жиры → жирные кислоты
- Амилаза: расщепляет углеводы → глюкоза
- Лактаза: расщепляет молочный сахар
- Бромелайн (из ананаса): белок + противовоспалительное
- Папаин (из папайи): белок + противовоспалительное

Когда принимать:
- С большими приёмами пищи (особенно >40г белка за раз)
- При дискомфорте после еды
- При переходе на высокобелковую диету
- С молочными продуктами (если непереносимость)

Дозировка:
- Комплексные ферменты: 1-2 капсулы с едой
- Начинайте с одной капсулы, увеличивайте при необходимости
- Не принимайте натощак (кроме бромелайна — он работает как противовоспалительное)

Важно:
- Не замена здоровому пищеварению — устраните причину
- Жуйте тщательно — механическое измельчение важнее
- Стресс снижает выработку ферментов — ешьте спокойно
- Панкреатит — противопоказание (консультация врача)`;
}
export function getBetaAlanineComplete(message: string): string {
  const keywords = ['бета-аланин', 'beta-alanine', 'покалывание', 'парестезия добавка', 'карнозин мышцы'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚡ БЕТА-АЛАНИН — ПОЛНЫЙ ГАЙД:

Механизм: повышает уровень карнозина в мышцах → буферизация кислоты → дольше работаете без закисления.

Доказанные эффекты (уровень А):
- +2.85% производительность при нагрузках 1-10 минут
- Отсрочка мышечного отказа на высоких повторениях
- Наибольший эффект: 8-15 повторений, интервальные тренировки
- Минимальный эффект: 1-3 повторения (слишком короткое усилие)

Дозировка:
- Загрузка: 3.2-6.4 г/день, разделить на 4 приёма по 0.8-1.6 г
- Поддержание: 3.2 г/день
- Эффект начинается через 2-4 недели (накопление карнозина)
- Полное насыщение: 4-8 недель
- Не привязан к тренировке — важен ежедневный приём

Покалывание (парестезия):
- Безвредный побочный эффект (активация нервных рецепторов)
- Проходит через 30-60 минут
- Уменьшается при делении дозы на порции
- Формы с замедленным высвобождением снижают покалывание

Синергия:
- Бета-аланин + креатин: доказанная комбинация для силовых
- Бета-аланин + цитруллин: выносливость + пампинг
- Бета-аланин + кофеин: совместимы

Кому полезен:
- Кроссфит, функциональный тренинг, боевые искусства
- Тренировки с высокими повторениями (8-20)
- Интервальные тренировки (HIIT)
- Менее полезен для чистых силовиков (1-5 повторений)`;
}
export function getHipThrustScienceGuide(message: string): string {
  const keywords = ['хип траст', 'hip thrust', 'ягодичный мостик', 'мостик со штангой', 'ягодицы штанга'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍑 ХИП ТРАСТ (ЯГОДИЧНЫЙ МОСТИК) — ПОЛНЫЙ ГАЙД:

Почему это лучшее упражнение для ягодиц:
- Максимальная активация ягодичных в пиковом сокращении
- Минимальная нагрузка на поясницу (в отличие от приседа)
- Изолирует ягодицы лучше любого другого упражнения
- Исследование Contreras (2015): активация gluteus maximus до 235% MVIC

Техника:
1. Лопатки на скамье, стопы на ширине плеч
2. Штанга на тазовых костях (используйте подушку/накладку)
3. Подъём таза до полного разгибания бёдер
4. Сжатие ягодиц в верхней точке 1-2 секунды
5. Подбородок к груди (предотвращает гиперэкстензию поясницы)
6. Колени 90° в верхней точке

Ошибки:
- Гиперэкстензия поясницы (запрокидывание головы)
- Слишком близко/далеко стопы от скамьи
- Неполное разгибание (не дожимают наверху)
- Отсутствие паузы в пиковом сокращении

Вариации:
- С резиной вокруг коленей: +отведение = больше средняя ягодичная
- Одной ногой: исправление асимметрии
- С паузой: повышенное время под нагрузкой
- В Смите: стабильность для новичков
- Ягодичный мостик с пола: регрессия для начинающих

Параметры:
- Сила: 4×6-8 (тяжёлый вес)
- Гипертрофия: 3-4×10-15
- Частота: 2-3 раза в неделю
- Прогрессия: +2.5-5 кг в неделю`;
}
export function getGlutamineComplete(message: string): string {
  const keywords = ['глютамин', 'глутамин', 'glutamine', 'l-глютамин', 'l-glutamine'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💊 ГЛЮТАМИН — ПОЛНЫЙ ГАЙД:

Что это: самая распространённая аминокислота в организме (60% пула аминокислот в мышцах). Условно-незаменимая при стрессе.

Для кого РЕАЛЬНО полезен:
- При ОЧЕНЬ интенсивных нагрузках (2+ тренировки/день, марафоны)
- В период болезни или восстановления после операций
- При дефиците калорий (защита мышц от катаболизма)
- Проблемы с ЖКТ (основной источник энергии для энтероцитов)

Честная правда:
- Для обычного посетителя зала — практически бесполезен
- Большая часть перорального глютамина поглощается кишечником и печенью
- До мышц доходит минимум
- При нормальном питании дефицита не бывает
- Мета-анализы НЕ подтверждают эффект на рост мышц

Когда стоит принимать:
- Здоровье ЖКТ: 5-10г/день (синдром «leaky gut», СРК)
- Иммунитет при тяжёлых нагрузках: 10-20г/день
- Восстановление после болезни/травмы: 10-15г/день
- «Сушка» на жёстком дефиците: 10г/день

Источники в пище (много глютамина):
- Говядина: 4.8г/100г
- Яйца: 4.4г/100г
- Молоко: 3.3г/100г (казеин богат глютамином)
- Рис: 3.7г/100г

Вердикт: деньги лучше потратить на креатин, протеин и достаточное питание. Глютамин — ситуативная добавка.`;
}
export function getSpirulinaChlorella(message: string): string {
  const keywords = ['спирулина', 'хлорелла', 'spirulina', 'chlorella', 'водоросли добавка', 'суперфуд водоросли'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌊 СПИРУЛИНА И ХЛОРЕЛЛА ДЛЯ СПОРТСМЕНОВ:

СПИРУЛИНА:
- Сине-зелёная микроводоросль, 60-70% белка
- Богата железом (в 28 раз больше шпината)
- Фикоцианин: мощный антиоксидант и противовоспалительное
- Доказано: повышает выносливость (больше времени до утомления)
- Снижает окислительный стресс после тренировок
- Поддерживает иммунитет
- Дозировка: 3-10 г/день

ХЛОРЕЛЛА:
- Зелёная микроводоросль, богата хлорофиллом
- Детоксикация тяжёлых металлов (связывает и выводит)
- Нуклеотиды (CGF): ускоряют восстановление клеток
- Улучшает липидный профиль
- Поддерживает иммунную функцию
- Дозировка: 3-6 г/день

Отличия:
- Спирулина: больше белка, лучше для энергии и выносливости
- Хлорелла: лучше для детокса, иммунитета, восстановления
- Можно принимать вместе (комплементарные эффекты)

Практические советы:
- Начинайте с 1-2 г/день (адаптация ЖКТ)
- Таблетки удобнее порошка (порошок имеет специфический вкус)
- Принимать с едой
- Веганам: отличный источник B12 (особенно хлорелла)
- Качество: проверяйте на тяжёлые металлы (сертификация)`;
}
export function getPQQMitochondria(message: string): string {
  const keywords = ['pqq', 'пирролохинолинхинон', 'митохондрии добавка', 'биогенез митохондрий'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔋 PQQ (ПИРРОЛОХИНОЛИНХИНОН) — МИТОХОНДРИАЛЬНЫЙ БУСТЕР:

Что это: витаминоподобное вещество, стимулирует образование НОВЫХ митохондрий (биогенез).

Уникальность: единственная добавка, доказанно стимулирующая митохондриальный биогенез.

Доказанные эффекты:
- Активация PGC-1α (главный регулятор биогенеза митохондрий)
- Антиоксидантная защита в 5000 раз мощнее витамина C (по каталитическим циклам)
- Нейропротекция (улучшение памяти и когнитивных функций)
- Улучшение качества сна (глубокий сон)
- Снижение воспалительных маркеров (CRP, IL-6)

Для спортсменов:
- Больше митохондрий = больше энергии
- Лучшая утилизация жиров и углеводов
- Ускоренное восстановление
- Улучшенная аэробная ёмкость

Дозировка:
- 10-20 мг/день (стандартная)
- 20-40 мг/день (для спортсменов)
- Утром с едой
- Эффект через 2-4 недели

Синергия:
- PQQ + CoQ10: идеальная пара (новые митохондрии + энергия в них)
- PQQ + Alpha-GPC: когнитивный бустер
- PQQ + ресвератрол: анти-эйджинг комбо

Источники в пище: натто, петрушка, зелёный чай, какао (но дозы мизерные).`;
}
export function getLysineArginine(message: string): string {
  const keywords = ['лизин', 'аргинин', 'lysine', 'arginine', 'no бустер аминокислота', 'оксид азота аминокислота'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧬 ЛИЗИН И АРГИНИН ДЛЯ СПОРТСМЕНОВ:

L-АРГИНИН:
- Предшественник оксида азота (NO) — расширение сосудов
- Пампинг (вазодилатация): больше крови к мышцам
- Стимуляция гормона роста (особенно натощак)
- Дозировка: 3-6 г до тренировки
- Проблема: низкая биодоступность (только 30-40%)
- Лучшая альтернатива: цитруллин (конвертируется в аргинин, усваивается на 80%+)

L-ЛИЗИН:
- Незаменимая аминокислота (организм не синтезирует)
- Синтез коллагена (связки, сухожилия, кожа)
- Усвоение кальция (здоровье костей)
- Противовирусное (подавляет герпес)
- Синтез карнитина (утилизация жиров)
- Дозировка: 1-3 г/день

Синергия лизин + аргинин:
- Вместе стимулируют выброс гормона роста сильнее (Isidori 1981)
- Оптимальная комбинация: 1.5г лизина + 1.5г аргинина натощак перед сном
- Усиление синтеза коллагена

Источники:
- Аргинин: орехи, семена тыквы, говядина, индейка
- Лизин: красное мясо, рыба, яйца, молочные продукты
- Веганы: дефицит лизина — частая проблема (бобовые помогают)

Совет: вместо аргинина берите цитруллин 6-8г — больше NO при лучшем усвоении.`;
}
export function getCarnitineCompleteGuide(message: string): string {
  const keywords = ['карнитин', 'carnitine', 'l-карнитин', 'жиросжигатель карнитин', 'ацетил карнитин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔥 L-КАРНИТИН — ПОЛНЫЙ ГАЙД:

Механизм: транспортирует жирные кислоты в митохондрии для сжигания. Без карнитина жир не может быть использован как энергия.

Честная правда:
- НЕ жиросжигатель в прямом смысле
- При нормальном питании дефицита нет
- Работает ТОЛЬКО при дефиците калорий + тренировки
- Не поможет похудеть без диеты

Доказанные эффекты:
- Улучшение восстановления (снижение маркеров повреждения мышц)
- Снижение мышечной болезненности после тренировок
- Улучшение кровотока (вазодилатация)
- Когнитивные функции (ацетил-L-карнитин)

Формы:
- L-карнитин L-тартрат: лучший для спорта (восстановление)
- Ацетил-L-карнитин (ALCAR): лучший для мозга (проникает через ГЭБ)
- Пропионил-L-карнитин: кровоток, сердце
- L-карнитин фумарат: бюджетный вариант

Дозировка:
- 2-4 г/день L-карнитина тартрата
- Принимать с углеводами (инсулин повышает усвоение!)
- За 60-90 минут до тренировки
- Накопительный эффект: 2-3 недели

Источники: говядина (95мг/100г), свинина, молочные. Веганы — группа риска по дефициту.
Вердикт: добавка второго эшелона. Сначала: дефицит, тренировки, протеин, креатин.`;
}
export function getAppleCiderVinegar(message: string): string {
  const keywords = ['яблочный уксус', 'apple cider vinegar', 'уксус для похудения', 'acv'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍎 ЯБЛОЧНЫЙ УКСУС ДЛЯ СПОРТСМЕНОВ — НАУКА:

Доказанные эффекты:
- Снижение гликемического ответа на еду (на 20-30%)
- Улучшение чувствительности к инсулину
- Чувство сытости (помощь при дефиците калорий)
- Антимикробные свойства (здоровье ЖКТ)

Что НЕ доказано (мифы):
- «Сжигает жир» — нет прямого жиросжигания
- «Выводит токсины» — маркетинг
- «Ускоряет метаболизм» — эффект минимальный

Как правильно использовать:
- 1-2 столовые ложки (15-30 мл) на стакан воды
- Перед приёмами пищи с углеводами
- Через трубочку (защита зубной эмали!)
- НЕ пить неразбавленным (ожог пищевода)

Для спортсменов:
- Перед высокоуглеводной загрузкой: сглаживает скачок сахара
- На «сушке»: помогает с аппетитом
- После еды: улучшает пищеварение
- Маринование мяса: размягчает + вкус

Предосторожности:
- Эрозия зубной эмали (разбавлять и пить через трубочку)
- Раздражение желудка при гастрите/язве
- Не более 30 мл/день
- При приёме диабетических препаратов — консультация врача

Вердикт: полезный, но скромный инструмент. Не волшебное средство.`;
}
export function getColostrumGuide(message: string): string {
  const keywords = ['колострум', 'colostrum', 'молозиво', 'молозиво добавка', 'бычье молозиво'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥛 КОЛОСТРУМ (МОЛОЗИВО) ДЛЯ СПОРТСМЕНОВ:

Что это: первое молоко коровы после отёла (первые 72 часа). Концентрат иммунных и ростовых факторов.

Состав:
- Иммуноглобулины (IgG, IgA): 20-40% белка
- Лактоферрин: антимикробное, противовоспалительное
- Факторы роста: IGF-1, TGF-β (не влияют на допинг-тест)
- Пролин-богатые полипептиды: модуляция иммунитета

Доказанные эффекты:
- Снижение частоты ОРВИ у спортсменов на 30-40%
- Улучшение кишечного барьера (снижение проницаемости)
- Ускорение восстановления после тяжёлых тренировок
- Защита ЖКТ при приёме НПВП (ибупрофен и т.п.)
- Улучшение состава тела (некоторые исследования)

Дозировка:
- 20-60 г/день порошка
- Или 10-20 г/день концентрата
- Курс: 8-12 недель
- Утром натощак или после тренировки

Качество:
- Первый удой (6-12 часов) — максимальная концентрация IgG
- Минимум 30% IgG в составе
- Низкотемпературная обработка (сохранение факторов)
- Сертификация на отсутствие антибиотиков

Кому особенно: при частых простудах, в период соревнований, при проблемах с ЖКТ.
Не является допингом — разрешён WADA.`;
}
export function getPhospholipidsGuide(message: string): string {
  const keywords = ['фосфолипиды', 'phospholipids', 'лецитин', 'фосфатидилхолин', 'клеточные мембраны'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧠 ФОСФОЛИПИДЫ ДЛЯ СПОРТСМЕНОВ:

Что это: основа клеточных мембран. Каждая клетка тела окружена фосфолипидным бислоем.

Основные типы:
- Фосфатидилхолин (PC): основной, здоровье печени и мозга
- Фосфатидилсерин (PS): когнитивные функции, снижение кортизола
- Фосфатидилэтаноламин (PE): митохондриальная функция
- Фосфатидилинозитол (PI): передача сигналов в клетках

Для спортсменов:
- Целостность мышечных мембран (защита от повреждений)
- Восстановление клеток после нагрузки
- Когнитивные функции (связь мозг-мышца)
- Здоровье печени (особенно при высокобелковой диете)
- Усвоение жирорастворимых витаминов

Лецитин (главный источник):
- Подсолнечный лецитин: без ГМО, без аллергенов сои
- Соевый лецитин: дешевле, но возможные аллергии
- Яичный: из желтков, высокая биодоступность
- Дозировка: 5-10 г/день (лецитин гранулы)

Источники в пище:
- Яичные желтки: лучший природный источник
- Печень: высокая концентрация
- Соевые бобы
- Подсолнечные семечки

Совет: 2-3 яйца в день (с желтками!) покрывают базовую потребность в фосфолипидах.`;
}
export function getHipAbductorWork(message: string): string {
  const keywords = ['отведение бедра', 'hip abductor', 'средняя ягодичная', 'абдуктор', 'разведение ног тренажёр'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 ОТВЕДЕНИЕ БЕДРА — УКРЕПЛЕНИЕ СРЕДНЕЙ ЯГОДИЧНОЙ:

Зачем это важно:
- Средняя ягодичная — стабилизатор таза при ходьбе, беге, приседе
- Слабая средняя ягодичная = колени внутрь (вальгус) = травмы
- Профилактика: ITB-синдром, боль в коленях, поясничные проблемы
- Эстетика: «полочка» на боковой поверхности ягодиц

Лучшие упражнения:
1. Разведение ног в тренажёре: изоляция, контроль
2. Боковая планка с отведением: стабилизация + абдукция
3. Мостик с резинкой: ягодицы + стабилизаторы
4. Monster walks с резинкой: функциональный паттерн
5. Clamshells (ракушка): реабилитационное, активация
6. Боковые шаги с резинкой: разминка перед приседом

Тренажёр для отведения — техника:
- Сидя, спинка чуть откинута назад (больше ягодиц)
- Разведение до максимума, пауза 1-2 сек
- Сведение медленное (3 секунды)
- НЕ использовать инерцию

Программирование:
- 3-4×15-20 повторений (средняя ягодичная любит объём)
- Резинки: в каждой разминке перед ногами
- Тренажёр: 2-3 раза в неделю
- Дроп-сеты отлично работают

Признаки слабой средней ягодичной:
- Тренделенбург (таз проваливается при стоянии на одной ноге)
- Колени внутрь при приседе
- Боль в ITB (наружная сторона бедра)`;
}
export function getGreenTeaExtractGuide(message: string): string {
  const keywords = ['зелёный чай экстракт', 'green tea extract', 'egcg', 'катехины', 'зелёный чай жиросжигание'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍵 ЭКСТРАКТ ЗЕЛЁНОГО ЧАЯ (EGCG) — ГАЙД:

Активные вещества:
- EGCG (эпигаллокатехин галлат): основной катехин, 50-80% экстракта
- Кофеин: 2-4% (синергия с EGCG)
- L-теанин: спокойный фокус

Доказанные эффекты:
- Увеличение расхода энергии на 3-8% (термогенез)
- Усиление окисления жиров на 10-16%
- Антиоксидантная защита (мощнее витамина E)
- Кардиопротекция (снижение LDL-холестерина)
- Нейропротекция (снижение риска нейродегенерации)

Для спортсменов:
- Жиросжигание на «сушке» (в комбинации с дефицитом калорий)
- Антиоксидантная защита при тренировках
- Термогенез: +80-100 ккал/день (не чудо, но бонус)
- Улучшение кровотока (NO-зависимое)

Дозировка:
- EGCG: 300-500 мг/день
- Зелёный чай: 3-5 чашек/день
- Экстракт: 500-1000 мг (с содержанием 50% EGCG)
- Натощак или между приёмами пищи

Предосторожности:
- Гепатотоксичность при >800мг EGCG/день натощак!
- Снижает усвоение железа (не пить с едой)
- Содержит кофеин (бессонница при вечернем приёме)
- Начинать с малых доз (проверить переносимость)

Синергия: EGCG + кофеин + капсаицин = мощный термогенный стек.`;
}
export function getAshwagandhaComplete(message: string): string {
  const relevant = /ашваганд|ashwagandha|KSM.?66|withania|сонниферра|адаптоген.+полн|стресс.+добавк.+подробн/i.test(message);
  if (!relevant) return '';
  return `
🌿 АШВАГАНДА — ПОЛНЫЙ ГАЙД ДЛЯ СПОРТСМЕНОВ:

Что это: адаптоген (Withania somnifera), один из самых изученных в спортивной науке.

Доказанные эффекты (мета-анализы):
- Снижение кортизола: -14-28% (систематический обзор 2019)
- Рост тестостерона: +10-22% у мужчин (12 недель, 600 мг/день KSM-66)
- Увеличение VO2max: +4.9% (8 недель исследование)
- Рост силы: +1ПМ в жиме на 8-12 кг за 8 недель (vs плацебо)
- Снижение жировой массы: -3% за 8 недель при тренировках
- Улучшение сна: снижение латентности засыпания на 42%

Формы и дозировки:
- KSM-66 (экстракт корня): 300-600 мг/день — самая изученная форма
- Sensoril (экстракт корня+листьев): 125-250 мг/день — больше для сна
- Порошок корня: 3-6 г/день — слабее, нужна бо́льшая доза
- Оптимально: 600 мг KSM-66, разделить на 2 приёма (утро + вечер)

Когда принимать:
- Для восстановления: вечером, за 1-2 часа до сна
- Для производительности: утром с завтраком
- Курс: 8-12 недель, затем перерыв 2-4 недели

Синергия с другими добавками:
- + Магний: усиление антикортизолового эффекта
- + Родиола: дневная энергия + ночной сон
- + Цинк: поддержка тестостерона
- + Мелатонин (низкая доза): глубокий сон

Противопоказания:
- Щитовидная железа: может повышать Т3/Т4 — осторожно при гипертиреозе
- Аутоиммунные заболевания: стимулирует иммунитет
- Беременность: противопоказана
- Седативные препараты: усиливает действие`;
}
export function getRDLCompleteGuide(message: string): string {
  const relevant = /румынская.+тяг.+полн|RDL.+техник|румынск.+становая.+гайд|мёртвая.+тяг.+прям|задняя.+поверх.+тяг.+подробн/i.test(message);
  if (!relevant) return '';
  return `
🏋️ РУМЫНСКАЯ ТЯГА (RDL) — ПОЛНЫЙ ГАЙД:

Анатомия движения:
- Основные мышцы: задняя поверхность бедра (бицепс бедра), ягодичные
- Вспомогательные: разгибатели спины, трапеция (изометрия), предплечья (хват)
- Движение: hip hinge (тазобедренный шарнир) — основной паттерн

Техника по шагам:
1. Штанга на уровне бёдер, хват чуть шире плеч, лопатки сведены
2. Слегка согнуть колени (10-15°) и ЗАФИКСИРОВАТЬ угол
3. Отводить таз НАЗАД, опуская штангу вдоль бёдер
4. Штанга скользит по бёдрам → голеням (не отводить от тела!)
5. Опускаться пока чувствуете растяжку задней поверхности
6. Движение вверх: сжать ягодицы, «протолкнуть» таз вперёд

Глубина:
- Зависит от гибкости: обычно чуть ниже колена
- НЕ опускать до пола (это уже мёртвая тяга)
- Поясница должна оставаться нейтральной (не округлять!)
- Если поясница начинает округляться — это ваш предел глубины

RDL vs Мёртвая тяга vs Классическая:
- RDL: колени слегка согнуты, штанга не касается пола, акцент на задняя повехрность
- Мёртвая тяга на прямых: колени прямые, макс. растяжка, больше риск для поясницы
- Классическая становая: с пола, колени сильно согнуты, квадрицепс включён

Вариации:
- С гантелями: каждая рука независимо, баланс
- Одноногая RDL: баланс + стабилизаторы + устранение асимметрии
- RDL со штангой снизу (trap bar): нейтральный хват, безопаснее
- RDL с паузой 2 сек внизу: максимальное время под нагрузкой

Программирование:
- Гипертрофия: 3-4×8-12, темп 3-1-1
- Сила: 4×5-6, тяжёлый вес с идеальной техникой
- Как подсобка: 3×10-12 после основной тяги`;
}
export function getDigestiveProtocol(message: string): string {
  const relevant = /пищевар.+протокол|ЖКТ.+спортсмен.+подробн|digestive.+protocol|желудок.+тренировк.+проблем|вздути.+спорт|кишечник.+оптимиз/i.test(message);
  if (!relevant) return '';
  return `
🫁 ПИЩЕВАРИТЕЛЬНЫЙ ПРОТОКОЛ ДЛЯ СПОРТСМЕНОВ:

Проблема: 30-50% спортсменов страдают от ЖКТ-проблем на тренировках.

Причины ЖКТ-проблем при тренировках:
- Перенаправление крови от ЖКТ к мышцам (до 80% кровотока!)
- Механическое сотрясение (бег, прыжки)
- Повышение кортизола → снижение моторики
- Обезвоживание → замедление пищеварения
- НПВС (ибупрофен) → повреждение слизистой

Протокол питания вокруг тренировки:
ДО (за 2-3 часа): полноценный приём пищи
- Лёгкие углеводы + умеренный белок, мало жира и клетчатки
- Примеры: рис + курица, овсянка + банан, тост + яйца
ДО (за 30-60 мин): лёгкий снек (если нужна энергия)
- Банан, рисовые хлебцы, сок
- Избегать: жирное, молочное, бобовые, сырые овощи

ПОСЛЕ: в течение 1-2 часов
- Легкоусвояемый белок (сывороточный протеин, курица, рыба)
- Углеводы для восполнения гликогена
- Постепенно увеличивать объём и сложность пищи

Продукты-триггеры (избегать вокруг тренировок):
❌ Молоко (лактоза) — вздутие у 70% взрослых
❌ Бобовые (олигосахариды) — газообразование
❌ Крестоцветные (капуста, брокколи) — вздутие
❌ Острое — раздражение слизистой
❌ Кофеин натощак — повышает кислотность
❌ Протеиновые батончики с сахарными спиртами (сорбитол, мальтитол)

Добавки для ЖКТ:
- L-глутамин: 5 г/день — восстановление слизистой
- Пробиотики: 20-50 млрд КОЕ — баланс микрофлоры
- Пищеварительные ферменты: с большими приёмами пищи
- Имбирь: 1 г — против тошноты на тренировке
- Мята перечная (масло): снимает спазмы ЖКТ`;
}
export function getSeatedOHPGuide(message: string): string {
  const relevant = /жим.+сидя.+подробн|seated.?overhead|жим.+над.+голов.+сидя|армейский.+жим.+сидя|жим.+штанг.+сидя.+техник/i.test(message);
  if (!relevant) return '';
  return `
🏋️ ЖИМ СИДЯ НАД ГОЛОВОЙ — ПОЛНЫЙ ГАЙД:

Сидя vs Стоя — биомеханика:
- Сидя: на 10-15% БОЛЬШИЙ вес (нет нагрузки на стабилизацию)
- Стоя: больше кора и стабилизаторов, более функционально
- Сидя безопаснее для поясницы (спинка поддерживает)
- ЭМГ дельт примерно одинаковая в обоих вариантах

Техника жима штанги сидя:
1. Скамья под 85-90° (не строго 90° — легкий наклон назад)
2. Хват чуть шире плеч, гриф на уровне ключиц
3. Локти слегка впереди грифа (не точно под ним)
4. Жать вверх и ЧУТЬ НАЗАД (гриф над макушкой в верхней точке)
5. Голова слегка отклоняется, чтобы гриф прошёл перед лицом
6. Полное разгибание вверху (но без блокировки)

Жим гантелей сидя:
- Больше амплитуда (ниже штанги в нижней точке)
- Каждая рука независимо → устранение асимметрии
- Сложнее стабилизация → меньше вес чем со штангой
- Нейтральный хват (ладони друг к другу): безопаснее для плечей

Углы и акценты:
- 90° (вертикально): максимум передних + средних дельт
- 75-80°: чуть больше верхнего отдела грудных
- Жим Арнольда (с вращением): полная проработка всех пучков

Частые ошибки:
❌ Чрезмерный прогиб в пояснице → травма позвоночника
❌ Гриф опускается ниже подбородка → стресс для плечевого сустава
❌ Слишком широкий хват → укороченная амплитуда
❌ Локти уходят назад → перегрузка ротаторной манжеты

Программирование:
- Сила: 4×5-6, основное упражнение дня плеч
- Гипертрофия: 3-4×8-12, после тяжёлого жима стоя
- Выносливость: 3×15-20, суперсет с латеральными подъёмами`;
}
export function getPotassiumCompleteGuide(message: string): string {
  const relevant = /калий.+полн|калий.+спортсмен.+подробн|potassium.+complete|калий.+дефицит.+подробн|калий.+продукт.+дозировк/i.test(message);
  if (!relevant) return '';
  return `
🍌 КАЛИЙ ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Роль калия:
- Мышечные сокращения (ключевой электролит)
- Проведение нервных импульсов
- Регуляция водного баланса (антагонист натрия)
- Нормализация артериального давления
- Синтез гликогена в мышцах

Потребность спортсмена:
- Минимум: 3500-4700 мг/день (vs 2600 мг у обычного человека)
- Потери с потом: 120-280 мг/литр
- При интенсивных тренировках: до 5000 мг/день
- 90% людей НЕ добирают калий из еды

Симптомы дефицита:
- Мышечные судороги (особенно ночные)
- Слабость и быстрая утомляемость
- Аритмия, учащённое сердцебиение
- Запоры (калий нужен для перистальтики)
- Повышенное давление

Продукты-чемпионы (мг на 100г):
- Курага: 1717 мг 🥇
- Фасоль белая: 1189 мг
- Шпинат (варёный): 558 мг
- Картофель (с кожурой): 535 мг
- Авокадо: 485 мг
- Банан: 358 мг (переоценён — не лидер!)
- Лосось: 363 мг
- Свёкла: 325 мг

Калий из добавок:
⚠️ В России и многих странах — ограничение 99 мг на порцию (безопасность)
⚠️ Высокие дозы калия опасны для сердца (гиперкалиемия)
⚠️ ЛУЧШЕ получать из еды — безопаснее и эффективнее
- Калия цитрат: хорошая биодоступность
- Калия хлорид: самый распространённый

Взаимодействие с натрием:
- Оптимальное соотношение K:Na = 2:1 или выше
- Много натрия + мало калия = гипертония
- Много калия помогает «вывести» лишний натрий
- После солёной еды — добавить калийсодержащие продукты`;
}
export function getAshwagandhaKSM66(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['ksm-66', 'ксм-66', 'ashwagandha ksm', 'ашваганда ksm', 'ашваганда концентрат', 'ашваганда экстракт'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🌿 АШВАГАНДА KSM-66 — ЗОЛОТОЙ СТАНДАРТ:

═══ ЧТО ТАКОЕ KSM-66 ═══
• Полноспектральный экстракт корня ашваганды
• Стандартизация: ≥5% витанолидов (активные вещества)
• Производитель: Ixoreal Biomed (Индия)
• 14+ лет исследований, 24+ клинических испытаний
• Самый изученный экстракт ашваганды в мире

═══ ПРЕИМУЩЕСТВА ДЛЯ АТЛЕТОВ (по данным исследований) ═══
• Кортизол: снижение на 27-30% (p < 0.001)
• Тестостерон: повышение на 14-17% у мужчин
• Сила: увеличение 1RM жима лёжа на 20+ кг за 8 недель (исследование)
• VO2max: улучшение на 4.9% за 12 недель
• Мышечная масса: +1.5-2 кг vs плацебо за 8 недель
• Восстановление: снижение креатинкиназы (маркер повреждения мышц)
• Сон: улучшение качества сна на 72% по шкале

═══ KSM-66 VS ДРУГИЕ ФОРМЫ ═══
• KSM-66 (5% витанолидов): золотой стандарт, больше всего исследований
• Sensoril (10% витанолидов): больше концентрация, но экстракт корня + листьев
• Порошок корня: 0.3-1.5% витанолидов — нужно гораздо больше
• Рекомендация: KSM-66 для спорта, Sensoril — для анти-стресса/сна

═══ ПРОТОКОЛ ПРИЁМА ═══
• Дозировка: 600 мг/день (300 мг × 2 раза)
• Время: утром и вечером, с едой
• Курс: 8-12 недель → перерыв 4 недели
• Эффект: ощутим через 2-4 недели
• Для сна: 300-600 мг за 1 час до сна

═══ ПРОТИВОПОКАЗАНИЯ ═══
• Аутоиммунные заболевания (стимулирует иммунитет)
• Гипертиреоз (повышает T4)
• Беременность и кормление
• Приём иммуносупрессоров, седативных, тиреоидных гормонов
• Хирургические операции — отменить за 2 недели
`;
}
export function getCitrullineDoseProtocol(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['цитруллин дозировка', 'citrulline dose', 'цитруллин протокол', 'цитруллин малат дозировка', 'сколько цитруллина', 'цитруллин как принимать'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
💊 ЦИТРУЛЛИН — ТОЧНЫЙ ПРОТОКОЛ ДОЗИРОВАНИЯ:

═══ ФОРМЫ И ДОЗИРОВКИ ═══
• L-цитруллин (чистый): 6-8 г за 40-60 мин до тренировки
• Цитруллин малат (2:1): 8-10 г (содержит ~5.3-6.7 г цитруллина)
• Цитруллин малат (1:1): 6-8 г (содержит ~3-4 г цитруллина + яблочная кислота)
• ⚠️ Важно: проверяй соотношение на этикетке!

═══ МЕХАНИЗМ ═══
• L-цитруллин → L-аргинин → оксид азота (NO)
• NO расширяет сосуды → больше кровоток в мышцы
• Больше кислорода и нутриентов → лучше пампинг и выносливость
• Почему не аргинин напрямую? Цитруллин биодоступнее на 60-80%
• Яблочная кислота (малат): участвует в цикле Кребса → больше АТФ

═══ ДОКАЗАТЕЛЬНАЯ БАЗА ═══
• +1-3 дополнительных повторения в подходе (метаанализ)
• Снижение болезненности мышц (DOMS) на 40% при 8 г
• Улучшение выносливости при HIIT на 12-15%
• Снижение утомляемости при объёмных тренировках
• Эффект накапливается: лучше при регулярном приёме 7+ дней

═══ ОПТИМАЛЬНЫЙ ПРОТОКОЛ ═══
Ежедневно:
• Тренировочные дни: 6-8 г L-цитруллина за 40-60 мин до тренировки
• Дни отдыха: 3-4 г утром натощак (поддержание уровня NO)
• Натощак или с лёгким перекусом (жирная пища замедляет)

Загрузочный протокол (продвинутый):
• 3 г × 3 раза в день = 9 г/день в течение 7 дней
• Затем 6-8 г перед тренировкой

═══ СИНЕРГИЯ ═══
• + Бета-аланин (3.2-6.4 г): выносливость + пампинг
• + Свекольный сок (500 мл): двойной путь к NO
• + Аргинин (3 г): дополнительный субстрат для NO
• + Таурин (2 г): объём клеток + кровоток
• НЕ сочетать с ингибиторами ФДЭ-5 (виагра) — гипотензия!

═══ ПОБОЧНЫЕ ЭФФЕКТЫ ═══
• Редко: лёгкий дискомфорт в ЖКТ при >10 г
• Цитруллин малат: может вызвать изжогу (яблочная кислота)
• Решение: принимать с едой, начинать с малой дозы
`;
}
export function getGluteMedialMinimus(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['средняя ягодичная', 'малая ягодичная', 'gluteus medius', 'gluteus minimus', 'отведение бедра', 'стабилизация таза'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🍑 СРЕДНЯЯ И МАЛАЯ ЯГОДИЧНЫЕ — СКРЫТЫЕ СТАБИЛИЗАТОРЫ:

═══ АНАТОМИЯ ═══
• Средняя ягодичная (gluteus medius): отведение бедра, стабилизация таза
• Малая ягодичная (gluteus minimus): вспомогает средней, внутренняя ротация
• Эти мышцы — главные стабилизаторы таза при ходьбе/беге/приседе
• Слабость = «колени внутрь» при приседе, боль в пояснице, IT-band синдром

═══ ПОЧЕМУ ВАЖНО ═══
• Стабилизация таза при одноногих движениях (выпады, ступеньки)
• Профилактика «вальгуса» колена в приседе и прыжках
• Предотвращение IT-band синдрома у бегунов
• Защита поясницы — компенсация наклона таза
• Улучшение баланса и координации

═══ УПРАЖНЕНИЯ (от простого к сложному) ═══
1. Clamshell (раковина):
   • Лёжа на боку, колени согнуты 90°, ступни вместе
   • Открывать верхнее колено, держать стопы вместе
   • 3 × 15-20, можно с мини-бандом

2. Отведение бедра лёжа на боку:
   • Прямая нога, поднимать на 30-45°
   • 3 × 12-15, медленный темп

3. Monster walk (с мини-бандом):
   • Банд выше колен, полуприсед
   • Шаги в сторону, 3 × 10-12 шагов в каждую сторону

4. Single-leg glute bridge:
   • Одна нога на полу, вторая поднята
   • 3 × 10-12 на каждую ногу

5. Боковые выпады:
   • Широкий шаг в сторону, приседание на одну ногу
   • 3 × 8-10 на каждую сторону

6. Стойка на одной ноге с резинкой:
   • Банд на уровне колен, стоя на одной ноге
   • Отводить вторую ногу в сторону
   • 3 × 10-12

═══ ПРОГРАММИРОВАНИЕ ═══
• Как разминка: 2-3 упражнения по 1 подходу перед приседаниями/выпадами
• Как отдельная работа: 3-4 упражнения, 3 подхода, 2-3 раза/неделю
• Прогрессия: сначала объём (повторения), потом сопротивление (более жёсткий банд)
• Суперсет с приседаниями: clamshell между подходами приседа

═══ ПРИЗНАКИ СЛАБОСТИ ═══
• Колени «сваливаются» внутрь при приседе
• Тренделенбург тест: таз проваливается при стойке на одной ноге
• Боль в IT-band (наружная часть бедра)
• Боль в пояснице при ходьбе/беге
`;
}
export function getMuscleMemoryMechanisms(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['мышечная память механизм', 'muscle memory mechanism', 'мышечная память наука', 'как работает мышечная память', 'ядра мышечных клеток', 'миоядра'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🧬 МЫШЕЧНАЯ ПАМЯТЬ — КЛЕТОЧНЫЕ МЕХАНИЗМЫ:

═══ ЧТО ТАКОЕ МЫШЕЧНАЯ ПАМЯТЬ ═══
• Способность мышц быстро вернуть утраченный объём/силу
• Человек, тренировавшийся ранее, набирает обратно в 2-3 раза быстрее
• Это НЕ миф — подтверждено на клеточном уровне

═══ МЕХАНИЗМ: МИОЯДРА ═══
• Мышечные волокна — многоядерные клетки
• При тренировках: сателлитные клетки сливаются с волокном → новые ядра
• При детренировке: мышца УМЕНЬШАЕТСЯ, но ядра СОХРАНЯЮТСЯ
• «Домен миоядра»: каждое ядро управляет ~26% объёма саркоплазмы
• Больше ядер = мышца быстрее «раздувается» обратно
• Ядра сохраняются минимум 15+ лет (возможно, навсегда!)

═══ ЭПИГЕНЕТИКА ═══
• Тренировки меняют метилирование ДНК в мышцах
• Эти изменения сохраняются после прекращения тренировок
• «Тренировочный след» в ДНК — гены готовы к быстрой активации
• При возобновлении: гены гипертрофии включаются быстрее

═══ НЕЙРОННАЯ ПАМЯТЬ ═══
• Моторные паттерны сохраняются в мозжечке
• Техника упражнений «вспоминается» за 1-2 недели
• Нервно-мышечная эффективность восстанавливается первой
• Сила возвращается быстрее объёма (нейронный компонент)

═══ ПРАКТИЧЕСКИЕ ВЫВОДЫ ═══
• Перерыв 1-3 месяца: восстановление за 2-4 недели
• Перерыв 6-12 месяцев: восстановление за 2-3 месяца
• Перерыв 2-5 лет: восстановление за 4-8 месяцев
• Перерыв 10+ лет: восстановление за 6-12 месяцев

═══ ПРОТОКОЛ ВОЗВРАТА ═══
Неделя 1-2: Адаптация
• 50-60% от прежних рабочих весов
• 3 × 10-12, акцент на технику
• 3 тренировки/неделю максимум

Неделя 3-4: Наращивание
• 65-75% от прежних весов
• 3-4 × 8-10
• DOMS будет сильным — это нормально

Неделя 5-8: Восстановление уровня
• 80-95% от прежних весов
• Нормальная программа
• Большинство достигнет 90%+ прежнего уровня
`;
}
export function getOverreachingDetection(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['перетренированность признаки', 'overreaching', 'функциональное перенапряжение', 'нефункциональное перенапряжение', 'перетренировка симптомы', 'слишком много тренируюсь'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
⚠️ ПЕРЕТРЕНИРОВАННОСТЬ — РАСПОЗНАВАНИЕ И КОРРЕКЦИЯ:

═══ СТАДИИ (важно различать!) ═══
1. Функциональное перенапряжение (Functional Overreaching):
   • Временное снижение производительности на 5-10%
   • Восстановление: 1-2 недели отдыха/deload
   • НОРМАЛЬНО и даже полезно для суперкомпенсации

2. Нефункциональное перенапряжение (Non-functional Overreaching):
   • Снижение производительности на 10-20%
   • Восстановление: 3-8 недель
   • Требует вмешательства

3. Синдром перетренированности (Overtraining Syndrome):
   • Серьёзное снижение, гормональные нарушения
   • Восстановление: 3-12 месяцев
   • Редко, но опасно

═══ ФИЗИЧЕСКИЕ СИМПТОМЫ ═══
• Снижение силовых показателей 3+ тренировки подряд
• Повышенный пульс покоя (+5-10 уд/мин от нормы)
• Плохое восстановление между подходами
• Хронические DOMS (болезненность >72 часов)
• Частые простуды/инфекции (иммунитет)
• Потеря аппетита или наоборот постоянный голод
• Нарушения сна (трудно заснуть/проснуться)

═══ ПСИХОЛОГИЧЕСКИЕ СИМПТОМЫ ═══
• Нежелание тренироваться (мотивация на нуле)
• Раздражительность, перепады настроения
• Снижение концентрации
• Чувство тяжести/вялости
• Апатия к результатам

═══ ОБЪЕКТИВНЫЕ МАРКЕРЫ ═══
• ЧСС покоя утром: если +5-10 уд/мин → тревожный сигнал
• Вариабельность ЧСС (HRV): снижение = стресс
• Силовые тесты: если 3 недели без прогресса или регресс
• Сон: Fitbit/часы показывают мало глубокого сна

═══ ПРОТОКОЛ КОРРЕКЦИИ ═══
Лёгкая стадия (функциональная):
• Deload: 50% объёма на 1 неделю → возврат к норме

Средняя стадия (нефункциональная):
• 1 неделя полного отдыха (только ходьба)
• 1 неделя: 30% от обычного объёма
• 1 неделя: 50%
• 1 неделя: 75%
• Возврат к полному объёму

Тяжёлая стадия:
• Консультация спортивного врача
• 2-4 недели полного отдыха
• Анализы: тестостерон, кортизол, ТТГ, железо
• Постепенный возврат 2-3 месяца

═══ ПРОФИЛАКТИКА ═══
• Deload каждые 4-6 недель
• Сон 7-9 часов
• 1-2 дня отдыха в неделю
• Не увеличивать объём >10% в неделю
• Отслеживать RPE — если регулярно 9-10, пора отдыхать
`;
}
export function getMindMuscleNeuroscience(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['нейронаука мышц', 'mind muscle neuroscience', 'ментальная связь мышцы мозг', 'как чувствовать мышцу', 'нейромышечная связь улучшить'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🧠💪 НЕЙРОНАУКА СВЯЗИ «МОЗГ-МЫШЦА»:

═══ НАУЧНОЕ ОБОСНОВАНИЕ ═══
• Исследование (Calatayud 2016): фокус на мышце увеличивает EMG-активацию на 20-35%
• Schoenfeld 2018: внутренний фокус → +12% гипертрофия бицепса за 8 недель
• Механизм: усиление нейронного драйва к целевой мышце
• Увеличение количества активированных моторных единиц
• Особенно эффективно при <60% 1RM (изоляционная работа)

═══ КОГДА ЭТО РАБОТАЕТ ═══
✅ Изоляционные упражнения (сгибания, разводки, кроссовер)
✅ Умеренный вес (<60% 1RM)
✅ Гипертрофийная работа (8-15 повторений)
✅ Отстающие мышечные группы

❌ Тяжёлые базовые (>80% 1RM) — фокус на ДВИЖЕНИЕ, не мышцу
❌ Становая тяга, тяжёлый присед — опасно терять общий контроль
❌ Силовые подходы — внешний фокус эффективнее

═══ ТЕХНИКИ УЛУЧШЕНИЯ СВЯЗИ ═══
1. Касание целевой мышцы:
   • Перед подходом: коснуться мышцы, которую будешь качать
   • Попросить партнёра коснуться во время подхода
   • Увеличивает EMG на 10-15%

2. Визуализация:
   • Перед подходом: 5 сек представить сокращение мышцы
   • Во время: «видеть» как мышца работает
   • Исследования: визуализация → +5% силы даже без тренировки

3. Изометрическое напряжение:
   • Между подходами: напрягать целевую мышцу на 5-10 сек
   • Поза бицепса, поза грудных и т.д.
   • Обучает мозг изолированному сокращению

4. Медленный темп:
   • 3-5 сек эксцентрика: больше времени «чувствовать»
   • Пауза в точке максимального сокращения: 2-3 сек
   • Чем медленнее → тем больше осознанность

5. Предварительное утомление:
   • Сначала изоляция, потом база
   • Разводки → жим лёжа: грудные уже «горят» и легче ощущаются

═══ ПРОГРЕССИЯ НАВЫКА ═══
• Неделя 1-2: не чувствуешь — нормально, продолжай практику
• Неделя 3-4: начинаешь «ловить» мышцу в некоторых упражнениях
• Месяц 2-3: стабильная связь в большинстве упражнений
• 6+ месяцев: автоматический навык, «включается» сам
`;
}
export function getWalkingPadInclineGuide(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['ходьба на дорожке', 'walking pad', 'беговая дорожка наклон', 'treadmill incline', 'ходьба под наклоном', '12-3-30'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🚶 ХОДЬБА НА ДОРОЖКЕ С НАКЛОНОМ — НАУЧНЫЙ ПОДХОД:

═══ ПОЧЕМУ ХОДЬБА ПОД НАКЛОНОМ ═══
• Расход калорий на 40-60% выше чем ходьба по ровной поверхности
• Минимальная нагрузка на суставы (vs бег)
• Zone 2 кардио — развитие аэробной базы
• Активация ягодичных и задней поверхности бедра
• Не мешает восстановлению после силовых

═══ ПРОТОКОЛ 12-3-30 ═══
• 12% наклон, 3 км/ч скорость, 30 минут
• Расход: ~200-350 ккал за сессию
• Частота: 3-5 раз/неделю
• Уровень ЧСС: 120-140 уд/мин (Zone 2)
• Популяризован Lauren Giraldo, но принцип научно обоснован

═══ ПРОГРЕССИВНАЯ ПРОГРАММА ═══
Неделя 1-2: Адаптация
• 6-8% наклон, 4-5 км/ч, 15-20 мин

Неделя 3-4: Развитие
• 8-10% наклон, 4-5 км/ч, 20-25 мин

Неделя 5-8: Полная нагрузка
• 10-15% наклон, 4-5 км/ч, 25-30 мин

Продвинутый: Интервалы
• 2 мин @ 15% наклон / 1 мин @ 0% × 10 раундов

═══ ДЛЯ СИЛОВЫХ АТЛЕТОВ ═══
• Идеальное кардио: не мешает гипертрофии
• Время: после силовой или в отдельный день
• Не перед тренировкой ног! (утомление ягодичных)
• На сушке: 4-5 раз/неделю по 25-30 мин
• На массе: 2-3 раза/неделю по 20 мин (здоровье сердца)

═══ ОШИБКИ ═══
❌ Держаться за поручни — снимает нагрузку на 30-40%
❌ Слишком высокая скорость — переход на бег, суставы
❌ Наклон >15% без подготовки — боль в икрах и ахилле
❌ Ходьба сразу после тяжёлых приседов — перегрузка
`;
}
export function getStairMasterGuide(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['степпер', 'stair master', 'лестница тренажёр', 'stairmaster', 'ступеньки тренировка', 'подъём по лестнице'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🪜 STAIRMASTER — КАРДИО ДЛЯ ЯГОДИЧНЫХ:

═══ ПРЕИМУЩЕСТВА ═══
• Расход калорий: 400-600 ккал/час (больше чем дорожка)
• Целевые мышцы: ягодичные, квадрицепс, икроножные
• Кардио + лёгкая силовая нагрузка одновременно
• Низкий ударный стресс на суставы (vs бег)
• Функциональное движение — подъём по лестнице

═══ ТЕХНИКА ═══
• Стоять прямо, не наклоняться вперёд
• Лёгкое касание поручней (баланс, не опора)
• Полная стопа на ступеньке (не на носках)
• Давить через пятку → активация ягодичных
• Темп: умеренный, 40-70 ступенек/мин

═══ ПРОГРАММЫ ═══
Жиросжигание (Zone 2):
• 20-30 мин, уровень 4-6 (из 10)
• ЧСС: 130-150 уд/мин
• 3-5 раз/неделю

HIIT на степпере:
• 1 мин уровень 8-9 / 2 мин уровень 3-4
• 8-10 раундов = 24-30 мин
• 2 раза/неделю максимум

Ягодичный фокус:
• Через ступеньку (широкий шаг вверх)
• Боковой подъём: повернуться боком, шагать
• 15-20 мин, чередовать варианты по 3-5 мин

═══ ДЛЯ СИЛОВЫХ АТЛЕТОВ ═══
• На сушке: заменяет беговую дорожку, меньше нагрузки на колени
• Для ягодичных: дополнительная активация в день ног (в конце)
• Разминка: 5-10 мин на уровне 3-4 перед тренировкой ног
• ⚠️ После тяжёлых приседов — лучше на следующий день
`;
}
export function getBetaAlanineScience(message: string): string {
  const keywords = ['бета-аланин', 'beta-alanine', 'карнозин', 'покалыван', 'парестез', 'буфер'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Бета-аланин — научный разбор

### Механизм действия
• Бета-аланин → синтез карнозина в мышцах
• Карнозин = внутриклеточный pH-буфер
• Буферизует H+ ионы → отодвигает мышечную усталость
• Эффект накопительный: 4-12 недель приёма для насыщения

### Доказательная база (мета-анализы)
• Улучшение производительности: +2.85% в упражнениях 1-4 мин
• Максимальный эффект: нагрузки 60-240 секунд (среднеинтенсивные)
• Силовые тренировки: +1-2 повторения при 8-15 RM
• Минимальный эффект: чисто силовые (1-5 RM) и длительное кардио

### Протокол приёма
**Загрузка:** 3.2-6.4 г/день, разбить на 4 порции по 0.8-1.6 г
**Поддержание:** 1.6-3.2 г/день (после 4 недель загрузки)
**Форма:** sustained-release (SR) снижает парестезию
**Время:** с едой (улучшает усвоение на 30%)
**Длительность:** минимум 4 недели, оптимально 8-12 недель

### Парестезия (покалывание)
• Безвредная активация рецепторов MrgprD
• Обычно лицо, шея, руки — проходит за 30-60 мин
• Уменьшение: дробный приём (0.8 г за раз), SR-форма
• НЕ является показателем эффективности

### Синергия с другими добавками
**Бета-аланин + креатин:** комплементарный эффект (разные механизмы)
**Бета-аланин + бикарбонат натрия:** двойная буферизация (вне+внутри)
**Бета-аланин + кофеин:** работоспособность ↑ в интервалах

### Кому полезен
✓ Кроссфитеры и функциональный фитнес
✓ Бойцы и борцы (раунды 2-5 мин)
✓ Бегуны на 400-1500м
✓ Силовые тренировки с высоким объёмом (8-20 повторений)
✗ Пауэрлифтеры (чистая сила, 1-3 повторения) — минимальный эффект
`;
}
export function getTrapeziusFullDevelopment(message: string): string {
  const keywords = ['трапец', 'trap', 'шраг', 'верх спины', 'горб', 'ромбовидн', 'шея мышц'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Трапециевидная мышца — полное развитие

### Анатомия (3 части)
**Верхняя трапеция:**
• Функция: подъём лопаток, наклон шеи
• Иннервация: добавочный нерв (XI)
• Видимость: формирует «горку» от шеи к плечам

**Средняя трапеция:**
• Функция: приведение лопаток (сведение)
• Наибольший вклад в толщину верха спины
• Активация: горизонтальные тяги с ретракцией

**Нижняя трапеция:**
• Функция: депрессия и ротация лопатки вниз
• Часто недоразвита → проблемы с осанкой
• Активация: Y-подъёмы, тяги к нижней части груди

### Лучшие упражнения по частям
**Верхняя:**
1. Шраги со штангой: 4×10-12, пиковое сокращение 2 сек
2. Шраги с гантелями (лёгкий наклон вперёд): 3×12-15
3. Тяга штанги к подбородку (широкий хват): 3×10-12

**Средняя:**
1. Тяга в наклоне (пронированный хват, к груди): 4×8-10
2. Face Pull с верёвкой: 3×15-20
3. Тяга к груди в тренажёре сидя: 3×12

**Нижняя:**
1. Y-подъёмы на наклонной скамье: 3×12-15
2. Тяга верхнего блока прямыми руками: 3×12
3. Обратные шраги на брусьях: 3×10-12

### Программа «Мощные трапеции»
**День 1 (тяжёлый):**
• Шраги со штангой: 5×6-8 (heavy)
• Тяга в наклоне к груди: 4×8
• Face Pull: 3×15

**День 2 (лёгкий, конец недели):**
• Шраги с гантелями: 3×15
• Y-подъёмы: 3×12
• Обратные шраги: 3×10

### Частые ошибки
• Игнорирование средней и нижней трапеции
• Слишком тяжёлые шраги с неполной амплитудой
• Вращение плеч при шрагах (бесполезно и опасно)
• Отсутствие паузы в верхней точке
`;
}
export function getGluteBridgeVsHipThrust(message: string): string {
  const keywords = ['ягодичный мост', 'хип траст', 'hip thrust', 'glute bridge', 'мост vs', 'мостик', 'ягодиц'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Ягодичный мост vs Хип-траст — полное сравнение

### Биомеханические различия
**Ягодичный мост (Glute Bridge):**
• Лёжа на полу, без скамьи
• Меньшая амплитуда движения (ROM)
• Меньший момент силы на тазобедренный сустав
• EMG ягодичных: 70-80% от максимального

**Хип-траст (Hip Thrust):**
• Спина на скамье (≈40 см), больший ROM
• Больший момент силы → больше нагрузки на ягодицы
• EMG ягодичных: 85-95% от максимального
• Позволяет работать с бо́льшим весом

### Активация мышц (EMG данные)
| Мышца | Glute Bridge | Hip Thrust |
|-------|:----------:|:----------:|
| Gluteus Maximus | ★★★ | ★★★★★ |
| Gluteus Medius | ★★ | ★★★ |
| Hamstrings | ★★★ | ★★ |
| Quadriceps | ★ | ★ |
| Core | ★★ | ★★★ |

### Когда что использовать
**Glute Bridge лучше для:**
• Новичков (освоение паттерна разгибания бёдер)
• Разминки перед приседаниями/тягами
• Реабилитации после травм поясницы
• Тренировок дома без оборудования

**Hip Thrust лучше для:**
• Максимальной гипертрофии ягодичных
• Продвинутых атлетов
• Специализации на ягодичные мышцы
• Улучшения спринта и прыжков

### Программирование хип-траста
**Для силы:** 5×5, 80-85% 1RM, отдых 2-3 мин
**Для гипертрофии:** 3-4×8-12, 70-80% 1RM, пауза 2 сек вверху
**Для активации:** 2-3×15-20, лёгкий вес, фокус на сокращение
**Суперсет:** Hip Thrust + румынская тяга = максимальный pump

### Техника хип-траста
1. Лопатки на скамье, штанга на тазовых костях (используй подкладку!)
2. Стопы на ширине плеч, голени вертикально в верхней точке
3. Толкай через пятки, сжимай ягодицы 1-2 сек вверху
4. Подбородок к груди (нейтральная шея, не запрокидывай)
5. Полное разгибание бёдер без переразгибания поясницы
`;
}
export function getSumoVsConventionalDeep(message: string): string {
  const keywords = ['сумо', 'классическ тяг', 'тяга сумо', 'sumo deadlift', 'conventional', 'стойка тяг', 'какая тяга лучше'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Сумо vs Классическая становая тяга — углублённый анализ

### Биомеханические различия
**Классическая (Conventional):**
• Узкая стойка (ноги на ширине бёдер), руки снаружи ног
• Угол торса: 45-65° (больше нагрузка на спину)
• Момент на тазобедренный: выше на 10%
• ROM: больше на 20-25%

**Сумо:**
• Широкая стойка (1.5-2× ширина плеч), руки между ног
• Угол торса: 55-80° (более вертикальный)
• Момент на коленный: выше на 15%
• ROM: короче на 20-25%

### Активация мышц (EMG)
| Мышца | Классика | Сумо |
|-------|:-------:|:----:|
| Разгибатели спины | ★★★★★ | ★★★ |
| Ягодичные | ★★★ | ★★★★★ |
| Квадрицепс | ★★ | ★★★★ |
| Бицепс бедра | ★★★★ | ★★★ |
| Аддукторы | ★★ | ★★★★★ |
| Трапеции | ★★★★ | ★★★ |

### Как выбрать свой стиль
**Классика подходит, если:**
• Длинный торс, короткие ноги
• Хорошая подвижность тазобедренного
• Сильные разгибатели спины
• Цель: максимальная сила спины + задней цепи

**Сумо подходит, если:**
• Короткий торс, длинные ноги
• Хорошая подвижность в отведении бёдер
• Сильные квадрицепс и аддукторы
• Проблемы с поясницей (меньше нагрузка)

### Техника сумо (детально)
1. Стопы: 1.5-2× ширина плеч, носки развёрнуты 30-45°
2. Хват: чуть уже плеч, разнохват или крюк (hook grip)
3. Бёдра: «впихни» колени наружу, над стопами
4. Спина: нейтральная, грудь вверх
5. Тяга: «раздвигай пол» ногами, спина фиксирована
6. Локаут: мощное разгибание бёдер + колен одновременно

### Техника классики (детально)
1. Стопы: на ширине бёдер, носки слегка развёрнуты
2. Хват: на ширине плеч, снаружи ног
3. Наклон: бёдра назад, штанга у голеней
4. Тяга: сначала ноги (до колена), затем спина (выше колена)
5. Штанга скользит по голеням/бёдрам (держи близко!)
6. Локаут: бёдра вперёд, плечи назад

### Программирование
• Тренируй ОБА стиля: основной + вспомогательный
• Основной: 4×3-5 (тяжёлый)
• Вспомогательный: 3×8-10 (средний вес, акцент на слабости)
• Чередование: 4 недели основной → 2 недели вспомогательный
`;
}
export function getHamstringCompleteDev(message: string): string {
  const keywords = ['бицепс бедр', 'задняя поверхност', 'hamstring', 'хамстринг', 'сгибание ног', 'сгибатели бедра'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Бицепс бедра — полное развитие

### Анатомия
**Двуглавая мышца бедра (biceps femoris):**
• Длинная головка: разгибание бедра + сгибание колена
• Короткая головка: только сгибание колена
• Наружная часть задней поверхности

**Полуперепончатая (semimembranosus):**
• Разгибание бедра + сгибание колена + внутренняя ротация
• Глубокая, медиальная сторона

**Полусухожильная (semitendinosus):**
• Те же функции, более поверхностная
• Важна для стабильности колена

### Два типа упражнений (ОБЯЗАТЕЛЬНО оба)
**Hip Extension (разгибание бедра):**
• Румынская тяга (RDL): ЛУЧШЕЕ для длинной головки
• Good Morning
• Гиперэкстензия
→ Стретч хамстрингов при разгибании бедра, колено почти прямое

**Knee Flexion (сгибание колена):**
• Leg Curl (лёжа/сидя): ЛУЧШЕЕ для короткой головки
• Nordic Hamstring Curl: экстремальная эксцентрика
• Sliding Leg Curl
→ Сгибание колена, бедро фиксировано

### Лучшие упражнения по EMG
1. Nordic Hamstring Curl: EMG 95% (эксцентрика!)
2. Румынская тяга: EMG 90% (длинная головка)
3. Leg Curl лёжа: EMG 88% (короткая головка)
4. Гиперэкстензия 45°: EMG 80%
5. Glute-Ham Raise: EMG 92% (оба типа)
6. Становая тяга на прямых ногах: EMG 85%

### Программа «Мощные хамстринги»
**День 1 (hip extension фокус):**
• Румынская тяга: 4×8-10
• Гиперэкстензия с весом: 3×12-15
• Одноногий RDL: 3×10/сторону

**День 2 (knee flexion фокус):**
• Leg Curl лёжа: 4×10-12
• Nordic Hamstring Curl: 3×5-8 (или эксцентрика 3×3)
• Sliding Curl: 3×8-10

### Профилактика травм хамстрингов
• Nordic Hamstring Curl: снижает травмы на 51% (мета-анализ)
• Эксцентрическая работа = ключ к профилактике
• Разминка: динамическая растяжка (не статическая!)
• Соотношение квадрицепс:хамстринг → стремись к 0.6-0.8
• Не пренебрегай хамстрингами в пользу квадрицепса
`;
}
export function getCalciumVitDSynergyGuide(message: string): string {
  const keywords = ['кальций и витамин', 'кальций витамин d', 'кости спорт', 'остеопороз', 'плотность кост', 'calcium vitamin d'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Кальций + Витамин D — синергия для спортсмена

### Почему они работают вместе
• Витамин D необходим для абсорбции кальция в кишечнике
• Без вит.D усваивается только 10-15% кальция из пищи
• С вит.D: абсорбция до 30-40%
• Оба нужны для: костей, мышечных сокращений, нервной проводимости

### Кальций для спортсменов
**Суточная потребность:**
• Взрослые: 1000 мг/день
• Женщины 50+ / мужчины 70+: 1200 мг/день
• Спортсмены с высокими потерями пота: 1000-1500 мг/день

**Лучшие источники:**
• Творог (100г): 120-160 мг
• Сыр твёрдый (100г): 700-1000 мг
• Молоко (250мл): 300 мг
• Кефир (250мл): 300 мг
• Кунжут (100г): 975 мг (!!)
• Миндаль (100г): 264 мг
• Брокколи (100г): 47 мг
• Сардины с костями (100г): 380 мг

**Формы добавок:**
• Карбонат кальция: 40% элементарного Ca, с едой
• Цитрат кальция: 21% элементарного Ca, натощак OK
• Гидроксиапатит: из кости, содержит другие минералы

### Витамин D для спортсменов
**Потребность:**
• Минимум: 600-800 МЕ/день (для населения)
• Оптимально для атлетов: 2000-5000 МЕ/день
• Уровень в крови: целевой 40-60 нг/мл (50-75 нмоль/л)

**Дефицит в России:**
• 80-90% россиян имеют недостаток вит.D (особенно октябрь-апрель)
• Широта Москвы: солнце слишком низко для синтеза вит.D 6 мес/год
• Добавка критически важна: D3 (холекальциферол) > D2

### Влияние на спорт
**Витамин D:**
• Мышечная сила: +5-10% при коррекции дефицита
• Тестостерон: ↑ на 25% при подъёме с 20 до 50 нг/мл
• Иммунитет: снижение ОРВИ на 40%
• Восстановление: ускорение заживления мышц

**Кальций:**
• Мышечные сокращения: каждое зависит от Ca²+
• Стрессовые переломы: ↓ на 20% при достаточном Ca
• Нервная проводимость: скорость сигнала
• Сердечный ритм: стабильность

### Практические рекомендации
1. Вит.D3: 2000-4000 МЕ/день (осень-весна обязательно)
2. Принимай вит.D С ЖИРОМ (жирорастворимый!)
3. Кальций: 500 мг × 2 раза/день (лучше усваивается дробно)
4. Добавь вит.K2 (MK-7): направляет кальций в кости, а НЕ в сосуды
5. Проверяй уровень 25(OH)D в крови 1-2 раза в год
`;
}
export function getGlutamineWhenNeeded(message: string): string {
  const keywords = ['глутамин', 'glutamine', 'l-глутамин', 'кишечник глутамин', 'иммунитет глутамин'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Глутамин — когда реально нужен

### Что такое глутамин
• Самая распространённая аминокислота в организме (60% пула АК в мышцах)
• Условно-незаменимая: организм синтезирует, но при стрессе может не хватать
• Основное топливо для: энтероцитов (кишечник), иммунных клеток, почек

### Мифы (разоблачение)
❌ «Глутамин растит мышцы» → НЕТ при достаточном белке (1.6+ г/кг)
❌ «Глутамин ускоряет восстановление» → Минимальный эффект при нормальном питании
❌ «Нужен после каждой тренировки» → Нет, если белок в норме
❌ «Предотвращает катаболизм» → Нет убедительных данных

### Когда глутамин РЕАЛЬНО помогает
✅ **Кишечник (IBS, проницаемость):**
• 5-10 г/день восстанавливает слизистую кишечника
• Улучшает барьерную функцию (leaky gut)
• Помогает при СРК, вздутии, после антибиотиков

✅ **Иммунитет при ультранагрузках:**
• Марафонцы, триатлонисты (>2ч интенсивных)
• 5 г сразу после + 5 г через 2 часа
• Снижает частоту ОРВИ на 20-30%

✅ **Критические состояния:**
• Ожоги, травмы, послеоперационный период
• Интенсивная терапия (до 30 г/день в/в)
• Не для обычных спортсменов

✅ **Веганы и вегетарианцы:**
• Если белок <1.2 г/кг — может быть полезен
• 5 г/день как страховка

### Дозировка (если решил принимать)
**Для кишечника:** 5-10 г/день, натощак
**Для иммунитета:** 5 г после тренировки + 5 г перед сном
**При болезни:** 10-15 г/день (временно, до выздоровления)

### Пищевые источники (г на 100г)
• Говядина: 4.7 г
• Курица: 3.8 г
• Яйца: 0.6 г
• Молоко: 0.3 г
• Творог: 2.4 г
• Рис: 0.3 г
• Тофу: 1.2 г

### Итог для спортсмена
• Если белок >1.6 г/кг и питание разнообразное → глутамин НЕ нужен
• Если проблемы с ЖКТ или ультранагрузки → может помочь
• Один из самых переоценённых добавок в спортивном питании
• Деньги лучше потратить на: креатин, витамин D, рыбий жир
`;
}
export function getOHPStandingVsSeatedMastery(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['жим стоя', 'жим сидя', 'ohp', 'overhead', 'армейский жим', 'жим над головой', 'military press', 'жим штанги стоя', 'жим вверх', 'плечи жим'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🏋️ ЖИМ НАД ГОЛОВОЙ — СТОЯ VS СИДЯ: ПОЛНЫЙ РАЗБОР

📐 БИОМЕХАНИКА СТОЯ:
• Кинетическая цепь: стопы → колени → бёдра → кор → плечи → руки
• Вовлечение стабилизаторов: кор работает на 20-30% интенсивнее чем сидя
• Естественная траектория: штанга движется слегка назад за голову
• Активация глютеус: ягодичные стабилизируют таз (EMG +15% vs сидя)
• Позиция: стопы на ширине плеч, лёгкий наклон таза назад (нейтральный позвоночник)

📐 БИОМЕХАНИКА СИДЯ:
• Изоляция дельтовидных: меньше утечки силы в стабилизаторы
• Больший рабочий вес: обычно +10-15% к жиму стоя
• Угол спинки: 85-90° (не полные 90° — микронаклон снимает нагрузку с поясницы)
• Риск: гиперлордоз поясницы при больших весах → спинка как опора
• EMG дельт: передний пучок +5-8% активации vs стоя (Saeterbakken 2013)

⚡ ПРОГРЕССИЯ ОТ НОВИЧКА ДО ПРОДВИНУТОГО:
Уровень 1 (0-6 мес): Жим гантелей сидя → освоение траектории
Уровень 2 (6-12 мес): Жим штанги сидя → наращивание силы
Уровень 3 (1-2 года): Жим штанги стоя → функциональная сила
Уровень 4 (2+ года): Push press / жим с толчком → взрывная сила

📊 НОРМЫ СИЛЫ (1ПМ / вес тела):
• Новичок: 0.4-0.5x
• Средний: 0.6-0.75x
• Продвинутый: 0.8-1.0x
• Элита: 1.1-1.3x

🔧 ТИПИЧНЫЕ ОШИБКИ:
1. Чрезмерный прогиб поясницы → «стоячий наклонный жим» — решение: сжать ягодицы
2. Локти слишком далеко назад → травма плеча — решение: локти на 30° впереди
3. Штанга впереди лица → потеря баланса — решение: голова слегка назад, штанга над макушкой
4. Неполная амплитуда → недогруз дельт — решение: от подбородка до полного локаута
5. Хват слишком широкий → нагрузка на суставы — решение: чуть шире плеч

💡 ПРОГРАММИРОВАНИЕ:
• Сила: 5x5 @ 80-85% 1ПМ, отдых 3 мин
• Гипертрофия: 4x8-12 @ 65-75%, отдых 90 сек
• Выносливость: 3x15-20 @ 55-60%, отдых 60 сек
• Частота: 2 раза/неделю, минимум 48ч между сессиями

🏥 БЕЗОПАСНОСТЬ ПЛЕЧЕВОГО СУСТАВА:
• Разминка: 2-3 подхода ротаторной манжеты перед жимом
• Face pulls после жима: 3x15-20 для баланса
• При боли в плече: перейти на нейтральный хват (гантели)
• Не опускать штангу за голову — риск импинджмента

🎯 КОГДА ЧТО ВЫБИРАТЬ:
Стоя: функциональная сила, спорт, кроссфит, общая атлетичность
Сидя: изоляция дельт, бодибилдинг, травмы поясницы, максимальные веса
`;
}
export function getGluteusMaximusScientificDev(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['ягодичные', 'ягодицы', 'попа', 'gluteus', 'glute', 'зад', 'большая ягодичная', 'ягодичная мышца', 'glutes', 'бёдра и ягодицы'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🍑 ЯГОДИЧНЫЕ МЫШЦЫ — НАУЧНЫЙ ПОДХОД К РАЗВИТИЮ

🔬 АНАТОМИЯ ЯГОДИЧНЫХ:
• Gluteus Maximus — самая крупная мышца тела, ~66% массы ягодичной группы
• Gluteus Medius — стабилизация таза, отведение бедра (~20%)
• Gluteus Minimus — глубокий стабилизатор, ротация (~14%)
• Верхние волокна GM: отведение + наружная ротация
• Нижние волокна GM: разгибание бедра (главная сила)

📊 EMG-АКТИВАЦИЯ (% от МВПС):
Хип-траст штанга: 100% (эталон)
Ягодичный мостик 1 нога: 90-95%
Болгарские сплит-приседания: 85-90%
Становая тяга (румынская): 80-85%
Глубокий присед (ниже параллели): 75-85%
Step-up с гантелями: 75-80%
Обратная гиперэкстензия: 70-80%
Кабельные отведения: 65-75%

🏗️ ТРЕНИРОВКА ПО КОНТРАКТИЛЬНОМУ ПРОФИЛЮ:
1. Упражнения с пиком в растяжении (stretch-focused):
   → Глубокий присед, болгарские, RDL
   → Максимальное повреждение мышечных волокон → гипертрофия
2. Упражнения с пиком в сокращении (squeeze-focused):
   → Хип-траст, ягодичный мостик, кабельное отведение
   → Метаболический стресс + пиковое напряжение
3. Комбинация обоих типов = оптимальный рост

📋 ПРОГРАММА 2 РАЗА В НЕДЕЛЮ:
День A (тяжёлый):
• Хип-траст: 4x6-8 (тяжело)
• Болгарские сплит: 3x8-10 каждая нога
• RDL: 3x8-10
• Кабельное отведение: 3x12-15

День B (объёмный):
• Глубокий присед: 3x10-12
• Ягодичный мостик 1 нога: 3x12-15
• Step-up: 3x10-12 каждая
• Обратная гиперэкстензия: 3x15-20

⚡ АКТИВАЦИЯ ПЕРЕД ТРЕНИРОВКОЙ:
1. Clam shells (ракушки): 2x15 — пробуждение медиальной ягодичной
2. Band walks (ходьба с резинкой): 2x10 шагов каждая сторона
3. Ягодичный мостик без веса: 2x20 с паузой 2 сек наверху
→ «Ягодичная амнезия» от сидячего образа жизни — активация критична

🧠 MIND-MUSCLE CONNECTION:
• Направляй давление через пятки (не через носки)
• В верхней точке хип-траста: сознательно сжимай ягодицы на 1-2 сек
• Представляй, что «раздавливаешь орех» между ягодицами
• Наклон таза назад (posterior pelvic tilt) в верхней точке

📈 ПРОГРЕССИЯ НАГРУЗКИ:
Неделя 1-4: освоение техники, средние веса, фокус на связи «мозг-мышца»
Неделя 5-8: прогрессивное увеличение весов (+2.5-5 кг/неделю)
Неделя 9-12: пиковые нагрузки + интенсификация (дроп-сеты, паузы)
Неделя 13: разгрузочная неделя (50% объёма)

🏥 РАСПРОСТРАНЁННЫЕ ПРОБЛЕМЫ:
• «Не чувствую ягодицы в приседе» → приседай глубже + шире + носки врозь
• «Поясница забирает нагрузку» → акцент на posterior pelvic tilt
• «Квадрицепсы доминируют» → больше хип-тростов + RDL, меньше приседов
• «Асимметрия ягодиц» → односторонние упражнения: начинай со слабой стороны
`;
}
export function getChestDevelopmentMasterclass(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['грудные', 'грудь', 'chest', 'pec', 'пекторальные', 'жим лёжа', 'развитие груди', 'верх груди', 'низ груди', 'середина груди', 'грудная мышца'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
💪 РАЗВИТИЕ ГРУДНЫХ — МАСТЕРКЛАСС ПО РЕГИОНАМ

🔬 АНАТОМИЯ ПЕКТОРАЛЬНЫХ:
• Clavicular head (верхняя часть): от ключицы к плечевой кости — сгибание + приведение
• Sternocostal head (средняя/нижняя): от грудины и рёбер — горизонтальное приведение
• Abdominal head (нижняя часть): от апоневроза прямой мышцы живота
• Все волокна сходятся к одной точке на плечевой кости — веерообразная мышца

📊 EMG-ДАННЫЕ ПО РЕГИОНАМ:

ВЕРХНЯЯ ЧАСТЬ (ключичная):
• Жим на наклонной 30°: 91% активации (оптимальный угол)
• Жим на наклонной 45°: 85% (больше передний дельтовидный)
• Разводка гантелей на наклонной: 80%
• Кроссовер снизу вверх: 78%

СРЕДНЯЯ ЧАСТЬ (грудинная):
• Жим лёжа горизонтальный: 100% (эталон)
• Жим гантелей горизонтальный: 95%
• Разводка горизонтальная: 82%
• Кроссовер на уровне груди: 80%

НИЖНЯЯ ЧАСТЬ (абдоминальная):
• Жим на отрицательном наклоне (-15°): 93%
• Отжимания на брусьях (наклон корпуса): 88%
• Кроссовер сверху вниз: 85%
• Пуловер (гантель/штанга): 70%

🏗️ ПРОГРАММА — ПОЛНОЕ РАЗВИТИЕ (2 раза/нед):
День A — Сила:
• Жим штанги лёжа: 5x5 @ 82-85%
• Жим гантелей на наклонной 30°: 4x6-8
• Отжимания на брусьях (с весом): 3x6-8
• Кроссовер: 3x12

День B — Гипертрофия:
• Жим гантелей горизонтально: 4x8-12
• Жим на наклонной (штанга): 3x10-12
• Разводка гантелей горизонтально: 3x12-15
• Кроссовер снизу вверх: 3x15-20
• Пуловер: 2x12-15

📐 ТЕХНИКА ЖИМА ЛЁЖА (ключевые точки):
• Лопатки сведены и опущены — стабильная платформа
• Натуральный арч (не экстремальный) — защита плеч
• Хват: 1.5x ширина плеч (для груди, не для трицепса)
• Опускание: контролируемое, 2-3 сек, к нижней части грудины
• Жим: взрывной, штанга слегка к лицу (дуга, не вертикаль)

⚠️ ТИПИЧНЫЕ ОШИБКИ:
1. «Только горизонтальный жим» → неразвитый верх → добавь 30° наклон
2. «Слишком тяжёлый вес» → амплитуда страдает → полный ROM важнее веса
3. «Локти на 90°» → импинджмент плеча → локти 45-75° к корпусу
4. «Отбив штанги от груди» → травма грудины → пауза 1 сек внизу
5. «Игнорирование разводок» → нет растяжения волокон → добавь 2-3 подхода

🔑 СВЯЗЬ «МОЗГ-МЫШЦА» ДЛЯ ГРУДИ:
• Перед жимом: сведи ладони вместе, напряги грудные на 5 сек (изометрия)
• Во время жима: думай «свести локти друг к другу», а не «выжать вес»
• В кроссовере: скрещивай руки для пикового сокращения
• Растяжка между подходами: 15-20 сек, усиливает fascia stretch

📈 ПРОГРЕССИЯ ЖИМА (ориентиры 1ПМ/вес тела):
Новичок: 0.5-0.75x | Средний: 1.0-1.25x | Продвинутый: 1.5-1.75x | Элита: 2.0x+
`;
}
export function getLatDevelopmentCompleteScience(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['широчайшие', 'lat', 'lats', 'latissimus', 'спина ширина', 'v-taper', 'в-тейпер', 'крылья', 'ширина спины', 'широкая спина'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🦅 ШИРОЧАЙШИЕ — ПОЛНАЯ НАУКА РАЗВИТИЯ

🔬 АНАТОМИЯ LATISSIMUS DORSI:
• Самая широкая мышца тела (от таза до плечевой кости)
• Начало: остистые отростки T7-L5, крестец, гребень подвздошной кости, нижние рёбра
• Прикрепление: малый бугорок плечевой кости (межбугорковая борозда)
• Функции: приведение, разгибание, внутренняя ротация плеча
• Иннервация: торакодорсальный нерв (C6-C8)

📊 EMG-АКТИВАЦИЯ (% МВПС):

ВЕРТИКАЛЬНАЯ ТЯГА:
Подтягивания широким хватом (пронация): 100% (эталон)
Подтягивания средним хватом (супинация): 95%
Тяга верхнего блока широким: 85-90%
Подтягивания нейтральным хватом: 90%
Тяга верхнего блока обратным хватом: 88%

ГОРИЗОНТАЛЬНАЯ ТЯГА:
Тяга штанги в наклоне (пронация): 90-95%
Тяга гантели одной рукой: 88-92%
Тяга нижнего блока (V-рукоять): 82-88%
Тяга Т-грифа: 85-90%
Meadows row: 90%

ИЗОЛЯЦИЯ:
Пуловер (гантель/кабель): 70-80%
Straight-arm pulldown: 75-85%

🏗️ ПРОГРАММА — V-TAPER (2 раза/нед):
День A — Вертикальная тяга (ширина):
• Подтягивания: 4x6-10 (с весом если можешь 10+ BW)
• Тяга верхнего блока широким: 3x10-12
• Straight-arm pulldown: 3x12-15

День B — Горизонтальная тяга (толщина):
• Тяга штанги в наклоне: 4x6-8
• Тяга гантели: 3x8-10 каждой рукой
• Тяга нижнего блока: 3x10-12
• Пуловер: 2x12-15

📐 ТЕХНИКА КЛЮЧЕВЫХ УПРАЖНЕНИЙ:

ПОДТЯГИВАНИЯ:
• Хват: 1.5x ширина плеч (шире ≠ больше широчайших)
• Лопатки: опусти ПЕРЕД подъёмом (depressed + retracted)
• Локти: «тяни локти к бёдрам», а не подбородок к перекладине
• Пауза: 1 сек наверху для пикового сокращения
• Негатив: 3 сек — ключ к гипертрофии

ТЯГА ШТАНГИ:
• Наклон: 45° (не параллельно полу — это другое упражнение)
• Хват: чуть шире плеч, пронированный (для широчайших)
• Тяни к нижней части грудины/верху живота
• Лопатки: сведи в верхней точке, 1 сек пауза

🧠 MIND-MUSCLE CONNECTION:
• «Локти — крюки»: представь что руки = крюки, тянут широчайшие
• Не сгибай запястья — потеряешь связь
• Перед тягой: напряги широчайшие в позе «лат-спред» (3 сек)
• Используй лямки на тяжёлых подходах — хват не должен лимитировать спину

📈 ПРОГРЕССИЯ ПОДТЯГИВАНИЙ:
0 подтягиваний → австралийские (горизонтальные) + негативы 5 сек
1-5 подтягиваний → 5x(макс-1) + тяга верхнего блока
6-10 подтягиваний → 4xмакс + добавление веса 2.5 кг
10-15 подтягиваний → жилет/пояс +5-10 кг, 4x6-8
15+ → серьёзное отягощение, 4x5-8

⚡ ОШИБКИ:
1. «Тяну бицепсом» → используй лямки + «тяни локтями»
2. «Нет ширины» → больше вертикальных тяг, подтягиваний
3. «Нет толщины» → больше горизонтальных тяг, паузы в сокращении
4. «Маленький ROM» → полное растяжение внизу, полное сокращение вверху
`;
}
export function getHipHingeMovementMastery(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['тазобедренный шарнир', 'hip hinge', 'хип хинж', 'наклон таза', 'разгибание бедра', 'шарнирное движение', 'становая техника', 'как наклоняться', 'хинж паттерн', 'сгибание в тазу'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🔄 ТАЗОБЕДРЕННЫЙ ШАРНИР — БАЗОВЫЙ ПАТТЕРН ДВИЖЕНИЯ

📚 ЧТО ТАКОЕ HIP HINGE:
• Движение, где основное сгибание происходит в тазобедренном суставе
• Позвоночник остаётся НЕЙТРАЛЬНЫМ (без округления!)
• Таз отводится назад, корпус наклоняется вперёд
• Нагрузка: задняя цепь (ягодичные + бицепс бедра + разгибатели спины)
• Основа для: становой тяги, RDL, good morning, kb swing, наклонов

🔬 БИОМЕХАНИКА:
• Ось вращения: тазобедренный сустав (не поясница!)
• Момент силы: чем длиннее рычаг (корпус), тем больше нагрузка
• Поясничный отдел: стабилизирует, НЕ сгибается/разгибается
• Мышцы-движители: gluteus maximus (разгибание) + бицепс бедра (помощь)
• Мышцы-стабилизаторы: erector spinae, multifidus, абдоминальные

📋 ОБУЧЕНИЕ ХИНЖУ (прогрессия):

ШАГ 1 — СТЕНА (дефолтное упражнение):
• Встань спиной в 15 см от стены
• Отведи таз назад до касания стены ягодицами
• Руки скрещены на груди, спина нейтральная
• Повтори 20 раз → освой паттерн «таз назад»

ШАГ 2 — ПАЛКА НА СПИНЕ:
• Палка вдоль позвоночника: затылок + верх спины + крестец
• 3 точки касания должны СОХРАНЯТЬСЯ во время наклона
• Если палка отрывается → ты округляешь спину
• 3x10 повторений

ШАГ 3 — РУМЫНСКАЯ ТЯГА (пустой гриф):
• Хват чуть шире плеч, гриф скользит по бёдрам
• Таз назад → гриф опускается до середины голени
• Колени: слегка согнуты (15-20°), НЕ блокированы
• Чувствуй растяжение бицепса бедра → это сигнал конечной точки

ШАГ 4 — НАГРУЖЕННЫЙ ХИНЖ:
• Становая тяга (классика/сумо)
• RDL с серьёзным весом
• Good morning (штанга на спине)
• Kettlebell swing

⚠️ ТИПИЧНЫЕ ОШИБКИ:
1. Округление поясницы → травма диска → держи грудь раскрытой, взгляд вперёд
2. Сгибание в коленях (превращается в присед) → думай «таз назад», не «колени сгибаю»
3. Гиперэкстензия поясницы → «утиная попа» → напряги пресс, нейтральный позвоночник
4. Вес на носках → потеря баланса → вес на пятках, «толкни пол от себя»
5. Слишком быстрый спуск → потеря контроля → 2-3 сек на эксцентрик

🏋️ УПРАЖНЕНИЯ НА ХИНЖ (от простого к сложному):
1. Ягодичный мостик (лёжа — нет наклона → безопасно)
2. Румынская тяга гантелями
3. Kettlebell swing (Russian)
4. Румынская тяга штангой
5. Классическая становая тяга
6. Good morning
7. Гиперэкстензия с весом
8. Single-leg RDL (одноногий — баланс)

💡 КЛЮЧЕВОЙ ИНСАЙТ:
«Хинж — это не наклон. Это отведение таза назад при фиксированном позвоночнике. Учись движению с палкой, и каждая тяговая тренировка станет безопаснее и эффективнее.»
`;
}
export function getMicronutrientTimingOptimization(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['когда принимать витамины', 'тайминг витаминов', 'micronutrient timing', 'витамины утром вечером', 'совместимость витаминов', 'витамины вместе', 'расписание добавок', 'когда пить витамины', 'витамины с едой'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
⏰ ТАЙМИНГ МИКРОНУТРИЕНТОВ — КОГДА ПРИНИМАТЬ

📋 УТРО (с завтраком):

☀️ Витамин D (2000-4000 МЕ):
• Жирорастворимый → с жирной пищей (яйца, масло, авокадо)
• Утром: не мешает сну (вечерний приём может подавлять мелатонин)
• С витамином K2 (100-200 мкг): синергия для кальция

☀️ Витамин B-комплекс:
• Утром: даёт энергию (может мешать сну вечером)
• С едой (снижает тошноту от B6)
• B12: утром под язык (сублингвальная форма) — лучшее усвоение

☀️ Железо (если нужно):
• Натощак или с витамином C (апельсиновый сок) — ↑усвоение на 67%
• ⚠️ НЕ с кальцием, кофе, чаем (блокируют усвоение)
• ⚠️ НЕ с цинком (конкурируют за транспорт)

☀️ CoQ10 (убихинол):
• Жирорастворимый → с жирной пищей
• Утром: поддерживает энергию

📋 ДНЁМ (с обедом):

🌤️ Омега-3 (EPA+DHA):
• С жирной пищей → ↑усвоение в 3 раза
• Разделяй на 2 приёма (утро + обед) для лучшей переносимости
• Не на голодный желудок (рыбный привкус)

🌤️ Витамин C (500-1000 мг):
• Разделяй на 2-3 приёма (>500 мг за раз → ↓усвоение)
• С едой: снижает раздражение ЖКТ
• Улучшает усвоение железа

📋 ВЕЧЕР (с ужином или перед сном):

🌙 Магний глицинат (300-400 мг):
• Перед сном: улучшает засыпание, глубокий сон
• Глицин в составе: тормозной нейротрансмиттер
• ⚠️ Не оксид (диарея), не с кальцием (конкуренция)

🌙 Цинк (15-30 мг):
• Вечером: может улучшать сон (исследования неоднозначны)
• С едой: без тошноты
• ⚠️ НЕ с железом, НЕ с кальцием

🌙 Мелатонин (0.3-3 мг, если нужен):
• За 30-60 мин до сна
• Начинай с 0.3 мг (больше ≠ лучше)
• Не каждый день: риск привыкания

📊 НЕСОВМЕСТИМОСТИ (не принимай вместе):
❌ Железо + Кальций (блокируют друг друга)
❌ Железо + Цинк (конкуренция за транспорт)
❌ Кальций + Магний (в больших дозах конкурируют)
❌ Витамин D вечером (может подавлять мелатонин)
❌ B-витамины вечером (энергия → бессонница)
❌ Железо + Кофе/Чай (танины блокируют усвоение на 60%)

✅ СИНЕРГИИ (принимай вместе):
✅ Витамин D + K2 (направляет кальций в кости, не в сосуды)
✅ Витамин C + Железо (усвоение ↑ в 2-3 раза)
✅ Магний + B6 (взаимно усиливают)
✅ Цинк + B6 (помогает усвоению цинка)
✅ Омега-3 + витамин D (оба жирорастворимые, синергия)
✅ Витамин D + Кальций (D усиливает абсорбцию Ca)

📋 ИДЕАЛЬНОЕ РАСПИСАНИЕ АТЛЕТА:
УТРО: Витамин D + K2 | B-комплекс | Железо + Вит C (если нужно) | CoQ10
ОБЕД: Омега-3 | Витамин C
ВЕЧЕР: Магний глицинат | Цинк
ЕЖЕДНЕВНО (любое время): Креатин 5г
`;
}
export function getPectoralDevelopmentScience(message: string): string {
  const keywords = ['грудь', 'грудные', 'грудн', 'пекторал', 'жим лёжа', 'жим лежа', 'bench', 'chest', 'разводки', 'сведения', 'отжимания', 'pec'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ РАЗВИТИЕ ГРУДНЫХ МЫШЦ — НАУЧНЫЙ ПОДХОД:

📐 АНАТОМИЯ ГРУДНЫХ:
• Большая грудная — 3 пучка:
  - Ключичная часть (верх) — самая отстающая у большинства
  - Стернальная часть (середина) — основной объём
  - Абдоминальная часть (низ) — нижняя граница груди
• Малая грудная — глубокий слой, стабилизация лопатки
• Передняя зубчатая — «пальцы» по бокам рёбер

🎯 АКЦЕНТЫ ПО ПУЧКАМ:
ВЕРХ (ключичная часть):
• Наклонный жим 30-45° — золотой стандарт
• Разводки на наклонной — изоляция верха
• Кроссовер снизу вверх — длинная линия натяжения
• Важно: угол >45° переносит нагрузку на дельты!

СЕРЕДИНА (стернальная):
• Горизонтальный жим — классика
• Разводки горизонтально — максимальное растяжение
• Кроссовер на уровне груди
• Жим в Hammer Strength

НИЗ (абдоминальная):
• Отжимания на брусьях с наклоном вперёд
• Жим на обратном наклоне (15-20°)
• Кроссовер сверху вниз
• Дип-машина с акцентом на грудь

📊 ИССЛЕДОВАНИЯ EMG (активация грудных):
1. Жим штанги лёжа — 100% (базовый ориентир)
2. Жим гантелей на наклонной — 91% + верх
3. Кроссовер стоя — 93% (пиковое сокращение лучше)
4. Отжимания (ноги высоко) — 88%
5. Разводки на горизонтальной — 84% + растяжение

💪 ПРОГРАММА ДЛЯ ОТСТАЮЩЕЙ ГРУДИ:
День 1 (тяжёлый, понедельник):
• Жим штанги лёжа 4×6-8
• Жим гантелей наклон 30° 3×8-10
• Отжимания на брусьях (с весом) 3×8-10
• Кроссовер 3×12-15

День 2 (лёгкий, четверг):
• Жим гантелей горизонтально 3×10-12
• Разводки наклон 30° 3×12-15
• Пулловер через скамью 3×12-15
• Отжимания от пола 2×до отказа

📈 КЛЮЧЕВЫЕ ПРИНЦИПЫ РОСТА ГРУДИ:
• Объём: 16-22 рабочих подхода в неделю
• Частота: 2 раза в неделю — оптимально
• Прогрессивная перегрузка в жиме лёжа — маркер прогресса
• Полная амплитуда — растяжение внизу критично для гипертрофии
• Паузы внизу (1-2 сек) — убирают инерцию, усиливают стимул
• Mind-muscle connection — сводить грудные, а не толкать руками
`;
}
export function getCoreStabilityAntiMovement(message: string): string {
  const keywords = ['стабильность кора', 'core stability', 'антидвижение', 'anti-movement', 'планка', 'plank', 'pallof', 'мёртвый жук', 'dead bug', 'bird dog', 'антиротация', 'антифлексия', 'антиэкстензия'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 СТАБИЛЬНОСТЬ КОРА — АНТИ-ДВИЖЕНИЕ ТРЕНИНГ:

🔬 ПОЧЕМУ АНТИ-ДВИЖЕНИЕ > СКРУЧИВАНИЙ:
• Основная функция кора — СТАБИЛИЗАЦИЯ позвоночника, не движение
• Повторные скручивания → давление на диски L4-L5 → риск грыж (McGill)
• В спорте и жизни кор противодействует силам, а не создаёт движение
• Анти-движение тренирует кор функционально и безопасно

📐 4 ВЕКТОРА СТАБИЛЬНОСТИ:

1. АНТИ-ЭКСТЕНЗИЯ (сопротивление прогибу):
   Упражнения:
   • Планка на локтях — 3×30-60 сек
   • Rollout (колесо/штанга) — 3×8-12
   • Body saw — 3×10
   • Decline plank — 3×30-45 сек
   • Long lever plank — 3×20-30 сек
   Прогрессия: планка → планка с вытянутыми руками → rollout с колен → rollout стоя

2. АНТИ-РОТАЦИЯ (сопротивление вращению):
   Упражнения:
   • Pallof press — 3×10-12 на сторону
   • Cable anti-rotation hold — 3×20-30 сек
   • Односторонний фермерская прогулка — 3×30 м
   • Рenegade row — 3×8 на сторону
   • Bird dog — 3×10 на сторону
   Прогрессия: Pallof hold → Pallof press → Pallof с шагом → renegade row

3. АНТИ-ЛАТЕРАЛЬНАЯ ФЛЕКСИЯ (сопротивление наклону):
   Упражнения:
   • Боковая планка — 3×30-45 сек
   • Suitcase carry (чемодан) — 3×30 м на сторону
   • Copenhagen plank — 3×15-30 сек
   • Боковая планка с ротацией — 3×8
   Прогрессия: боковая планка на коленях → полная → с поднятой ногой → Copenhagen

4. АНТИ-ФЛЕКСИЯ (сопротивление сгибанию):
   Упражнения:
   • Dead bug — 3×10 на сторону
   • Фермерская прогулка — 3×40 м
   • Front rack holds — 3×30 сек
   • Zercher carries — 3×30 м
   Прогрессия: dead bug → dead bug с резинкой → loaded carries

💪 ПРОГРАММА СТАБИЛЬНОСТИ КОРА (15 мин, 3 раза в неделю):
A1: Rollout или планка — 3×10 или 3×45 сек
A2: Pallof press — 3×10 на сторону
B1: Боковая планка — 3×30 сек на сторону
B2: Dead bug — 3×10 на сторону
C: Фермерская прогулка — 3×40 м

⚡ ИНТЕГРАЦИЯ В ТРЕНИРОВКУ:
• Разминка: dead bug + bird dog (активация кора)
• Суперсет с основными упражнениями: Pallof press между подходами жима
• Финишер: планка + боковая планка + rollout (5-7 мин в конце)
• Loaded carries — можно делать вместо кардио в конце
`;
}
export function getBetaAlanineCarnosineMastery(message: string): string {
  const keywords = ['бета-аланин', 'бета аланин', 'beta-alanine', 'карнозин', 'carnosine', 'покалывание', 'парестезия', 'молочная кислота буфер', 'жжение мышц', 'лактат'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚗️ БЕТА-АЛАНИН И КАРНОЗИН — ПОЛНАЯ НАУКА:

🔬 МЕХАНИЗМ ДЕЙСТВИЯ:
• Бета-аланин → соединяется с гистидином → карнозин (в мышцах)
• Карнозин — внутриклеточный pH-буфер
• Буферирует ионы H+ (молочную кислоту) → задерживает усталость
• Увеличивает мышечную выносливость на 2.5-3.5%
• Особенно эффективен для подходов 60-240 секунд

📊 НАУЧНЫЕ ДАННЫЕ:
• Мета-анализ 40 исследований: достоверное улучшение выносливости
• Накопительный эффект: нужно 4-10 недель для насыщения карнозина
• Уровень карнозина в мышцах можно поднять на 40-80%
• Карнозин также антиоксидант и антигликант
• Эффект сохраняется 6-15 недель после прекращения приёма

💊 ДОЗИРОВКА И ПРИЁМ:
• 3.2-6.4 г/день — доказанная эффективная доза
• Разделить на 2-4 приёма (по 0.8-1.6 г) — снижает парестезию
• Принимать ежедневно, НЕ только в тренировочные дни
• Не зависит от приёма пищи
• Форма: бета-аланин (чистый порошок или капсулы)
• Sustained release формы — меньше покалывания

🤔 ПОКАЛЫВАНИЕ (ПАРЕСТЕЗИЯ):
• Безвредный побочный эффект — активация сенсорных нейронов
• Ощущается на лице, ушах, руках, шее
• Пик через 15-20 мин, длится 30-60 мин
• Снижается при: разделении дозы, приёме с едой, SR формах
• НЕ индикатор эффективности — «работает» и без покалывания

🎯 ДЛЯ КОГО НАИБОЛЕЕ ПОЛЕЗЕН:
Очень полезен:
• Подходы 60-240 секунд (8-30 повторений)
• Суперсеты и гигант-сеты
• HIIT и кроссфит
• Спринты, единоборства, плавание 100-400 м
• Высокообъёмный тренинг

Менее полезен:
• Чистая силовая работа (1-5 повторений, <30 сек)
• Низкообъёмный тренинг (5×3)
• Длительное кардио (>10 мин непрерывно)

⚡ СИНЕРГИЯ С ДРУГИМИ ДОБАВКАМИ:
• Бета-аланин + креатин — лучшая комбинация для силовой выносливости
• Бета-аланин + цитруллин — выносливость + пампинг
• Бета-аланин + кофеин — классика предтреника
• Бета-аланин + бикарбонат натрия — двойная буферизация (продвинутый уровень)

📋 ПРОТОКОЛ ЗАГРУЗКИ:
Неделя 1-4: 6.4 г/день (4 приёма по 1.6 г) — быстрая загрузка
Неделя 5+: 3.2 г/день — поддержание уровня карнозина
При перерыве >15 недель: начать загрузку заново
`;
}
export function getBackDevelopmentCompletePlan(message: string): string {
  const keywords = ['развитие спины полн', 'back development', 'спина программ', 'широкая спина', 'толщина спин', 'спина V-образ', 'ширина спины', 'как накачать спину', 'тренировка спины полн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 РАЗВИТИЕ СПИНЫ — ПОЛНЫЙ ПЛАН:

📐 АНАТОМИЯ СПИНЫ:

ШИРИНА (V-силуэт):
• Широчайшие (latissimus dorsi) — от подмышки до поясницы
• Большая круглая (teres major) — помощник широчайших

ТОЛЩИНА (глубина):
• Трапеция (верх, середина, низ) — от шеи до середины спины
• Ромбовидные — между лопатками
• Задние дельты — задняя поверхность плеч

НИЖНЯЯ СПИНА:
• Разгибатели позвоночника (erector spinae) — вдоль позвоночника

🎯 УПРАЖНЕНИЯ ПО ЦЕЛЯМ:

ДЛЯ ШИРИНЫ:
• Подтягивания широким хватом — 4×6-10
• Тяга верхнего блока — 3×10-12
• Пулловер (DB или cable) — 3×12-15
• Тяга одной рукой в кроссовере (стоя) — 3×12

ДЛЯ ТОЛЩИНЫ:
• Тяга штанги в наклоне — 4×6-8
• Тяга гантели одной рукой — 3×8-10
• Тяга к груди сидя (cable row) — 3×10-12
• Seal row (лёжа на скамье) — 3×10-12
• Шраги (верхняя трапеция) — 3×12-15

ДЛЯ НИЖНЕЙ СПИНЫ:
• Гиперэкстензия — 3×12-15
• Good morning — 3×10-12
• Становая тяга — нагружает ВСЮ спину

📊 ПРОГРАММА 2× В НЕДЕЛЮ:

День 1 (ширина + сила):
• Подтягивания с весом 4×6-8
• Тяга штанги в наклоне 4×6-8
• Тяга верхнего блока узким хватом 3×10-12
• Face pulls 3×15
Объём: 14 подходов

День 2 (толщина + гипертрофия):
• Тяга гантели одной рукой 4×8-10
• Тяга сидя (cable) 3×10-12
• Пулловер 3×12-15
• Шраги 3×12-15
• Гиперэкстензия 2×15
Объём: 15 подходов

📈 КЛЮЧЕВЫЕ ПРИНЦИПЫ:
• Тянуть ЛОКТЯМИ, не руками (mind-muscle connection)
• Полная амплитуда: растяжение + сведение лопаток
• Разнообразие хватов: пронированный, супинированный, нейтральный
• Разнообразие углов: горизонтальные + вертикальные тяги
• Объём: 14-22 подходов/неделю
• Бицепсы тренировать ПОСЛЕ спины (они уже поработали)

⚡ ПРОГРЕССИЯ ШИРИНЫ:
Месяц 1-2: подтягивания собственным весом → довести до 3×10
Месяц 3-4: +5 кг подтягивания → 3×8
Месяц 5-6: +10 кг → 3×6-8
6+ месяцев: +15-20 кг → «крылья» начнут выделяться визуально
`;
}
export function getArmDevelopmentComplete(message: string): string {
  const keywords = ['руки', 'arms', 'бицепс и трицепс', 'большие руки', 'объём рук', 'рост рук', 'тренировка рук'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ПОЛНОЕ РАЗВИТИЕ РУК:

📊 Анатомия и пропорции:
• **Трицепс** = 2/3 объёма руки (3 головки: длинная, латеральная, медиальная)
• **Бицепс** = 1/3 объёма (2 головки: длинная, короткая + брахиалис)
• **Предплечье** = визуальное завершение (брахиорадиалис, сгибатели/разгибатели)

🏋️ Программа для максимального роста:

**Трицепс (приоритет — он больше!):**
1. Жим узким хватом / отжимания на брусьях: 3×6-8 (тяжёлая база)
2. Французский жим лёжа / стоя: 3×10-12 (длинная головка — растяжка)
3. Разгибания на блоке (канат): 3×12-15 (латеральная + медиальная)

**Бицепс:**
1. Подъём штанги стоя (прямой гриф): 3×8-10 (общая масса)
2. Подъём гантелей с супинацией: 3×10-12 (пик бицепса)
3. Молотковые сгибания: 3×10-12 (брахиалис — ширина руки)

**Предплечье:**
1. Сгибания Зоттмана: 3×12-15
2. Удержание на время (фермерская прогулка): 3×30-45 сек

📊 Объём и частота:
- 12-20 прямых подходов/нед на бицепс
- 12-20 прямых подходов/нед на трицепс
- Частота: 2-3 раза/неделю (разделяй по дням или ставь после больших групп)
- Не забывай: жим и тяга УЖЕ нагружают руки — учитывай непрямую нагрузку

⚡ Техники интенсификации: дроп-сеты в последнем подходе изоляции, суперсеты бицепс+трицепс.
`;
}
export function getAbWheelRolloutGuide(message: string): string {
  const keywords = ['ролик для пресса', 'ab wheel', 'rollout', 'ролл-аут', 'колесо для пресса', 'ролик пресс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎡 РОЛИК ДЛЯ ПРЕССА — ТЕХНИКА И ПРОГРЕССИЯ:

📊 Почему ролик эффективнее скручиваний:
• Активация прямой мышцы живота на 80-90% МВСК (vs 60% при скручиваниях)
• Одновременная работа: пресс + косые + широчайшие + передняя зубчатая
• Тренировка антиэкстензии — защита позвоночника в реальной жизни
• Эксцентрическая нагрузка — максимальный стимул гипертрофии

📋 Прогрессия (от простого к сложному):
1. **Планка на руках** (30-60 сек) — если не держишь, к ролику рано
2. **Ролик с колен (частичная амплитуда)**: 3×8-10, останавливаясь на 50% диапазона
3. **Ролик с колен (полная амплитуда)**: 3×8-12, руки полностью вытянуты
4. **Ролик с колен + пауза**: 3×6-8 с 2-секундной паузой в нижней точке
5. **Ролик стоя (частичная)**: 3×5-8, ноги шире плеч
6. **Ролик стоя (полная)**: 3×5-8 — мастер-уровень

⚠️ Критические ошибки:
❌ Провисание поясницы (гиперэкстензия) — боль в пояснице гарантирована
❌ Движение за счёт рук, а не пресса
❌ Слишком быстрый темп — контролируй и эксцентрик, и концентрик
✅ Таз подкручен (posterior pelvic tilt), пресс напряжён ДО начала движения
✅ Выдох на обратном движении (когда возвращаешься)
✅ Темп: 3 секунды вперёд, 2 секунды назад

💡 Частота: 2-3 раза/нед, не ежедневно. Прогрессируй каждые 2-3 недели.
`;
}
export function getHipFlexorReleaseComplete(message: string): string {
  const keywords = ['подвздошно-поясничная', 'hip flexor', 'сгибатель бедра', 'psoas', 'поясничная мышца', 'бедро зажато', 'тугие бёдра'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 ПОДВЗДОШНО-ПОЯСНИЧНАЯ МЫШЦА — ОСВОБОЖДЕНИЕ И МОБИЛЬНОСТЬ:

📊 Почему это критично для спортсменов:
• Iliopsoas (поясничная + подвздошная) — главный сгибатель бедра
• Сидячий образ жизни = укорочение → передний наклон таза → боль в пояснице
• Тугие hip flexors = слабые ягодичные (реципрокное торможение)
• Результат: плохой присед, слабая становая, боль в пояснице

🔍 Тест на укорочение (тест Томаса):
1. Ляг на край скамьи, одно колено к груди
2. Свободная нога свисает — если бедро не опускается ниже горизонтали → укорочение
3. Если колено не сгибается до 90° → укорочение прямой мышцы бедра

📋 Протокол мобилизации (ежедневно 10-15 мин):

**Фаза 1 — Релиз (2-3 мин на сторону):**
- Миофасциальный релиз: мяч для лакросса в область подвздошно-поясничной
- Лёжа на животе, мяч под тазом, медленные покачивания

**Фаза 2 — Растяжка (30-60 сек на сторону):**
- Выпад с коленом на полу: заднее колено на полу, передняя нога 90°
- Сожми ягодицу задней ноги → почувствуй растяжение спереди бедра
- Добавь боковой наклон для усиления

**Фаза 3 — Активация антагонистов (2×10 на сторону):**
- Ягодичный мостик с акцентом на сжатие
- Hip extension стоя с резинкой
- «Мёртвый жук» (dead bug) — активация кора + hip flexor контроль

⚡ Результат через 2-4 недели: глубже присед, меньше боли в пояснице, сильнее ягодичные.
`;
}
export function getKneeWrapSleeveGuide(message: string): string {
  const keywords = ['наколенники', 'knee wraps', 'knee sleeves', 'бинты колени', 'наколенник', 'колени экипировка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦵 НАКОЛЕННИКИ И БИНТЫ — ПОЛНЫЙ ГАЙД:

📊 Типы и различия:
**Наколенники (sleeves) — неопрен 5-7мм:**
• Компрессия → тепло → улучшение проприоцепции
• Прибавка к приседу: +5-10кг (за счёт упругости и уверенности)
• Можно носить всю тренировку
• Подходят всем уровням
• Бренды: SBD, Rehband, Titan

**Бинты (wraps) — эластичные 2-2.5м:**
• Механическое преимущество → пружинящий эффект из «ямы»
• Прибавка к приседу: +15-30кг (зависит от жёсткости намотки)
• Носить ТОЛЬКО на рабочих подходах (ограничивают кровоток)
• Для продвинутых и соревнований
• Требуют правильной техники намотки

📋 Когда использовать что:
| Ситуация | Рекомендация |
|----------|-------------|
| Новичок, присед <100кг | Без экипировки или мягкие sleeves |
| Средний, 100-150кг | Sleeves 7мм |
| Продвинутый, >150кг | Sleeves на объём, wraps на максимумы |
| Боль в коленях | Sleeves обязательно + разминка |
| Соревнования (экипировочный дивизион) | Wraps |

⚠️ Важно: наколенники НЕ лечат колени. Если есть боль — сначала к врачу.
Не привыкай приседать ТОЛЬКО в наколенниках — периодически тренируйся без них.
`;
}
export function getMuscleAsymmetryCorrection(message: string): string {
  const keywords = ['асимметрия', 'asymmetry', 'одна рука больше', 'дисбаланс', 'одна нога слабее', 'неровные мышцы'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚖️ КОРРЕКЦИЯ МЫШЕЧНОЙ АСИММЕТРИИ:

📊 Нормально ли это?
• Асимметрия до 5-10% — абсолютная норма (доминантная сторона всегда чуть сильнее)
• >15% разница — требует коррекции (риск травмы, эстетический дефект)
• Причины: доминантность руки, старые травмы, неправильная техника, сколиоз

🔍 Как определить:
1. **Визуально**: фото спереди и сзади с расслабленными мышцами
2. **Силовой тест**: односторонние упражнения — запиши вес и повторения для каждой стороны
3. **Обхваты**: измерь обхват рук, ног, груди в одних точках

🔧 Стратегия коррекции:

**Правило 1: Односторонние упражнения — приоритет**
- Вместо жима штанги → жим одной гантелью
- Вместо приседа → болгарские выпады
- Начинай ВСЕГДА со слабой стороны

**Правило 2: Слабая сторона задаёт объём**
- Слабая рука сделала 10 повторов → сильная тоже делает 10 (не больше!)
- Дополнительный подход для слабой стороны в конце

**Правило 3: Не компенсируй весом**
- Слабая сторона: 20кг × 10 повторов
- Сильная сторона: тоже 20кг × 10 (не 22кг!)
- Сильная сторона подождёт — она никуда не денется

📋 Срок коррекции: 6-12 недель при системном подходе. Полная симметрия не нужна — стремись к <10% разнице.
`;
}
export function getBloodFlowRestrictionComplete(message: string): string {
  const keywords = ['bfr тренировка', 'blood flow restriction', 'окклюзионный', 'тренировка с жгутом', 'kaatsu', 'ограничение кровотока'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🩸 BFR-ТРЕНИРОВКИ (ОГРАНИЧЕНИЕ КРОВОТОКА):

📊 Принцип:
• Манжета/бинт на проксимальной части конечности (верх руки/бедра)
• Ограничивает ВЕНОЗНЫЙ отток (не артериальный!)
• Создаёт метаболический стресс → анаболический ответ
• Позволяет расти мышцам с лёгкими весами (20-30% 1ПМ)

🔬 Наука:
• Исследования: BFR с 20-30% 1ПМ ≈ гипертрофия с 65-70% 1ПМ
• Механизмы: накопление лактата → ГР ↑ (до 290%), mTOR-активация, рекрутинг быстрых волокон
• Безопасно: мета-анализы показывают минимальный риск при правильном применении

📋 Протокол BFR:
1. **Давление манжеты**: 40-80% от полного окклюзионного давления
   - Руки: 100-120 мм рт.ст. (или 5-7/10 субъективная шкала)
   - Ноги: 120-180 мм рт.ст. (или 6-8/10)
2. **Вес**: 20-30% от 1ПМ
3. **Схема**: 30-15-15-15 повторений, отдых 30-60 сек между подходами
4. **Время под манжетой**: не более 10-15 минут (потом снять!)
5. **Частота**: 2-4 раза/нед (можно ежедневно для реабилитации)

🎯 Когда использовать BFR:
✅ Реабилитация после травмы (нельзя поднимать тяжело)
✅ Разгрузочная неделя (сохранить стимул с лёгким весом)
✅ Дополнение к тяжёлым тренировкам (финишер на изоляции)
✅ Путешествия (тренировка в отеле с лёгкими гантелями)

⚠️ Противопоказания: тромбоз, варикозное расширение вен, гипертония, беременность.
`;
}
export function getArginineCitrullineNO(message: string): string {
  const keywords = ['аргинин', 'arginine', 'цитруллин', 'citrulline', 'оксид азота', 'nitric oxide', 'пампинг добавка', 'no booster'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
💨 АРГИНИН, ЦИТРУЛЛИН И ОКСИД АЗОТА — НАУКА ПАМПИНГА:

Оксид азота (NO) расширяет сосуды → ↑ кровоток к мышцам → больше кислорода, нутриентов и пампинг.

🔬 Механизм:
1. L-аргинин → NO-синтаза (eNOS) → оксид азота (NO)
2. NO → расслабление гладких мышц сосудов → вазодилатация
3. ↑ кровоток → ↑ доставка кислорода и нутриентов → ↑ производительность

📊 Аргинин vs Цитруллин:

| Параметр | L-аргинин | L-цитруллин |
|----------|-----------|-------------|
| Биодоступность | 20-50% (разрушается в кишечнике) | 80%+ (обходит печень) |
| Повышение NO | Умеренное | Значительное |
| Дозировка | 6-10 г | 6-8 г (или 8-10 г малата) |
| Побочки | ЖКТ при >10 г | Минимальные |
| Вердикт | Устаревший | **Победитель** |

🏆 Цитруллин малат — золотой стандарт:
- Цитруллин → превращается в аргинин в почках (обходя кишечник)
- Малат → участвует в цикле Кребса → ↑ выработка АТФ
- Мета-анализ (Trexler, 2019): +6-7% повторений при силовых
- ↓ болезненность мышц (DOMS) на 40%

📋 Как принимать:
1. **Цитруллин малат:** 8-10 г за 30-60 мин до тренировки
2. **L-цитруллин (чистый):** 6-8 г за 30-60 мин до тренировки
3. **L-аргинин:** 6-10 г (если цитруллин недоступен)
4. На пустой желудок (лучше усвоение)
5. Эффект накопительный: максимум через 7-10 дней ежедневного приёма

🥗 Пищевые источники:
- **Арбуз** — рекордсмен по цитруллину (1.5-3.5 г/кг)
- Дыня, огурец, тыква — семейство тыквенных
- Мясо, рыба — аргинин
- Орехи, семечки — аргинин
- Чеснок, свёкла — ↑ NO через нитраты

⚡ Стек для максимального пампинга:
- Цитруллин малат: 8 г
- Свекольный сок: 200 мл (нитраты → NO)
- Агматин: 500-1000 мг (↓ ферменты, разрушающие NO)
- За 40 мин до тренировки
`;
}
export function getBetaAlanineTimingGuide(message: string): string {
  const keywords = ['бета аланин время приёма', 'beta alanine timing', 'бета аланин когда', 'карнозин накопление', 'бета аланин покалывание'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
⚡ БЕТА-АЛАНИН — ВРЕМЯ ПРИЁМА И СТРАТЕГИЯ ЗАГРУЗКИ:

Бета-аланин → карнозин в мышцах → буфер кислотности → дольше работаешь при высокой интенсивности.

🔬 Как работает:
1. Бета-аланин накапливается в мышцах в форме карнозина
2. Карнозин буферирует H+ ионы (кислотность)
3. Меньше закисление → больше повторений → больше объём
4. Эффект: +2-3 повторения при подходах 60-240 сек

📊 Мета-анализ (Saunders, 2017):
- ↑ производительность на 2.85% в упражнениях 60-240 сек
- ↑ объём тренировки (больше повторений при 8-15 RM)
- Максимальный эффект через 4-12 недель приёма
- НЕ помогает: в упражнениях <60 сек (синглы, тройки) и >10 мин (марафон)

📋 Протокол загрузки:

**Стандартный (рекомендуемый):**
- 3.2-6.4 г/день
- Разбить на 4 приёма по 0.8-1.6 г (↓ парестезия)
- Длительность: минимум 4 недели для эффекта
- Оптимум: 8-12 недель непрерывного приёма
- Карнозин ↑ на 40-60% за первый месяц, до 80% за 10 недель

**Время приёма:**
- НЕ имеет значения, когда принимать (не как кофеин!)
- Карнозин накапливается постепенно, а не «перед тренировкой»
- Можно: утром, днём, вечером — главное регулярно
- С едой — ↓ парестезия (покалывание)

🔥 Парестезия (покалывание):
- Это НОРМАЛЬНО и БЕЗВРЕДНО
- Причина: бета-аланин активирует рецепторы MrgprD в коже
- Начинается через 15-20 мин после приёма
- Длится 60-90 мин
- Как уменьшить:
  - Разбей дозу на мелкие порции (0.8 г × 4-8 раз)
  - Принимай с едой
  - Sustained-release форма (медленного высвобождения)
  - Со временем организм адаптируется

📊 С чем комбинировать:
- **Креатин:** синергия — оба ↑ объём и выносливость
- **Цитруллин:** ↑ кровоток + ↓ закисление = идеальный стек
- **Кофеин:** ↑ энергия + ↑ буферизация
- **Сода (бикарбонат натрия):** ещё один буфер, но ЖКТ-проблемы

💡 Когда особенно полезен:
- Подходы на 8-15 повторений (бодибилдинг)
- Круговые тренировки / кроссфит
- Бег 400м-1500м
- Бокс, борьба, единоборства
- Любая работа с высоким уровнем «жжения»
`;
}
export function getSumoVsConventionalScience(message: string): string {
  const keywords = ['сумо vs классика', 'sumo vs conventional', 'становая сумо или классика', 'какая становая лучше', 'sumo deadlift сравнение'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
⚖️ СТАНОВАЯ ТЯГА: СУМО VS КЛАССИКА — ПОЛНЫЙ НАУЧНЫЙ РАЗБОР:

Оба стиля одинаково эффективны. Выбор зависит от антропометрии, сильных сторон и целей.

🔬 Биомеханические различия:

| Параметр | Классика | Сумо |
|----------|---------|------|
| Ширина ног | На ширине бёдер | 1.5-2× ширины плеч |
| Хват | За коленями | Между ног |
| Наклон корпуса | 40-50° | 20-30° |
| Нагрузка на поясницу | +++++ | ++ |
| Нагрузка на бёдра | +++ | +++++ |
| Амплитуда | 100% | 75-85% (↓ на 15-25%) |
| Момент на L4-L5 | Высокий | ↓ на 8-10% |

📊 Мышечная активация (ЭМГ):

| Мышца | Классика | Сумо |
|-------|---------|------|
| Разгибатели спины | ★★★★★ | ★★★ |
| Квадрицепс | ★★★ | ★★★★ |
| Ягодичные | ★★★★ | ★★★★★ |
| Бицепс бедра | ★★★★ | ★★★ |
| Приводящие | ★★ | ★★★★★ |

🏋️ Кому что подходит:

**Классика подходит если:**
- Короткие руки, длинный торс
- Сильная спина и задняя цепь
- Цель — гипертрофия спины и бицепса бедра
- Стронгмен (переносимость на атлас-стоуны, фермерскую прогулку)

**Сумо подходит если:**
- Длинные руки, короткий торс
- Широкий таз, хорошая подвижность тазобедренных
- Проблемы с поясницей (↓ нагрузка)
- Сильные ноги и приводящие
- Пауэрлифтинг (↓ амплитуда = ↑ вес на штанге)

📐 Техника сумо (ключевые отличия):
1. Ноги широко (голени вертикальные), стопы развёрнуты 30-45°
2. Хват между ног, на ширине плеч
3. «Расклинивание» — раздвигай пол ногами (knee-out cue)
4. Торс более вертикален, чем в классике
5. Тяга начинается с разгибания коленей, затем — бёдер
6. Локаут: полное разгибание, сжатие ягодичных

⚠️ Частые ошибки в сумо:
- Колени заваливаются внутрь (valgus) → травма
- Слишком широкая стойка (теряется сила)
- Округление поясницы при отрыве
- «Тяга спиной» вместо ног

💡 Совет: Тренируй ОБА стиля. Основной — тот, в котором сильнее. Второй — как подсобку 1 раз/неделю.
`;
}
export function getGutMicrobiomeComplete(message: string): string {
  const keywords = ['микробиом полный', 'gut microbiome complete', 'кишечник спорт наука', 'бактерии кишечника атлет', 'пробиотик пребиотик спорт'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🦠 МИКРОБИОМ КИШЕЧНИКА ДЛЯ СПОРТСМЕНА — ПОЛНЫЙ ГАЙД:

Кишечник — «второй мозг». 70% иммунитета, синтез витаминов, усвоение нутриентов — всё зависит от микробиома.

🔬 Как микробиом влияет на спорт:
- **Усвоение белка:** бактерии расщепляют белок → аминокислоты усваиваются лучше
- **Синтез КЦЖК** (короткоцепочечные жирные кислоты) → энергия для кишечника + ↓ воспаление
- **Синтез витаминов:** K, B12, B7 (биотин), фолат
- **Иммунитет:** 70% иммунных клеток в кишечнике
- **Нейротрансмиттеры:** 90% серотонина синтезируется в кишечнике → настроение и мотивация

📊 Микробиом спортсмена vs обычного человека:
- ↑ разнообразие видов на 30-40%
- ↑ Akkermansia muciniphila (↓ воспаление, ↑ метаболизм)
- ↑ Veillonella (перерабатывает лактат → пропионат → энергия!)
- ↑ Prevotella (у тех, кто ест много углеводов/клетчатки)

🥗 Как улучшить микробиом:

**Пребиотики (еда для бактерий):**
- Клетчатка: 25-40 г/день (цель для спортсмена)
- Инулин: лук, чеснок, спаржа, бананы (зелёные)
- Бета-глюканы: овёс, грибы, ячмень
- Пектин: яблоки, цитрусовые
- Резистентный крахмал: охлаждённый рис/картофель

**Пробиотики (полезные бактерии):**
- Кефир, йогурт (без сахара)
- Квашеная капуста (непастеризованная!)
- Кимчи, мисо, комбуча
- Добавки: Lactobacillus + Bifidobacterium (10-50 млрд КОЕ)

**Штаммы для спортсменов:**
| Штамм | Эффект |
|-------|--------|
| L. acidophilus | Усвоение белка, иммунитет |
| L. rhamnosus GG | ↓ ОРВИ на 50% у марафонцев |
| B. longum | ↓ воспаление, ↓ стресс |
| L. plantarum | ↓ ЖКТ-проблемы при беге |

🚫 Что вредит микробиому:
- Антибиотики (убивают и хорошие бактерии — восстановление 6+ мес)
- Сахар и ультрапереработанная еда (↑ патогенные бактерии)
- Алкоголь (↓ разнообразие)
- Хронический стресс (↓ полезные бактерии через ось кишечник-мозг)
- НПВС (ибупрофен) — повреждают слизистую кишечника
- Низкоклетчаточная диета (бактериям нечего есть)

📋 План на неделю:
- Ежедневно: кефир/йогурт + 5 порций овощей/фруктов
- 3-4 раза/неделю: квашеная капуста, кимчи
- Разнообразие: 30+ разных растительных продуктов в неделю
- Клетчатка: увеличивай постепенно (+5 г/неделю)
`;
}
export function getTaurineCompleteGuide(message: string): string {
  const keywords = ['таурин полный', 'taurine complete', 'таурин спорт наука', 'таурин сердце', 'таурин мышцы'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
⚡ ТАУРИН ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Таурин — условно незаменимая аминокислота. Содержится в мышцах (70% всего таурина в организме), мозге и сердце.

🔬 Функции таурина:
- **Осморегуляция:** контролирует объём клеток (↑ гидратация мышц)
- **Антиоксидант:** нейтрализует гипохлорную кислоту (мощный оксидант)
- **Кальциевая сигнализация:** ↑ выброс кальция из саркоплазматического ретикулума → ↑ сила сокращения
- **Нейропротекция:** ↓ возбудимость нейронов → ↓ тревожность
- **Кардиопротекция:** ↓ артериальное давление, ↑ работа сердца

📊 Что говорят исследования:
- ↑ выносливость на 1-3% при длительных нагрузках (Waldron, 2018)
- ↓ DOMS (крепатура) на 20-30% (Ra, 2013)
- ↓ окислительный стресс после тренировки
- ↑ жиросжигание при кардио (↑ окисление жиров)
- ↓ молочная кислота при субмаксимальных нагрузках
- Мета-анализ (2018): значимый ↑ выносливости при 1-6 г/день

📋 Как принимать:
- **Дозировка:** 1-3 г/день (стандарт) или до 6 г (для выносливости)
- **Время:** за 30-60 мин до тренировки
- **Безопасность:** до 6 г/день безопасно (EFSA)
- **С чем:** хорошо сочетается с кофеином, бета-аланином, цитруллином
- **Курс:** можно принимать постоянно (не накапливается)

🥩 Пищевые источники:
- Морепродукты (мидии, устрицы): 200-800 мг/100г
- Тёмное мясо птицы: 170 мг/100г
- Говядина: 40 мг/100г
- Молоко: 6 мг/100г
- Энергетики: 1000 мг/банка (но не рекомендую — сахар + кофеин)

💡 Когда особенно полезен:
- Длительные тренировки (>60 мин)
- Кардио для жиросжигания
- Высокий уровень стресса (↓ кортизол)
- Проблемы со сном (↓ возбудимость)
- После тяжёлых силовых (↓ DOMS)
`;
}
export function getMechanicalTensionScience(message: string): string {
  const keywords = ['механическое напряжение', 'mechanical tension', 'гипертрофия механизм', 'рост мышц механизм', 'натяжение мышц', 'мышечное натяжение', 'механика роста'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔬 НАУКА МЕХАНИЧЕСКОГО НАПРЯЖЕНИЯ — ГЛАВНЫЙ ДРАЙВЕР ГИПЕРТРОФИИ:

**Три механизма мышечного роста:**
1. **Механическое напряжение** (основной — 60-70% стимула):
   - Силовое растяжение саркомеров под нагрузкой
   - Активация механосенсоров (интегрины, титин, костамеры)
   - Запуск mTOR-сигнального пути → синтез белка
   - Оптимальная нагрузка: 60-85% от 1ПМ

2. **Метаболический стресс** (дополнительный — 20-25%):
   - Накопление лактата, H+, Pi в мышце
   - «Пампинг» — отёк клеток → механосигнализация
   - Окклюзионный эффект при 30-50% 1ПМ до отказа
   - Гормональный ответ: GH ↑, IGF-1 местный ↑

3. **Мышечные повреждения** (минорный — 10-15%):
   - Микротравмы Z-дисков и саркомерных структур
   - Активация сателлитных клеток → донорство ядер
   - Эксцентрические нагрузки = максимум повреждений
   - Избыточные повреждения = замедление роста!

**Как максимизировать механическое напряжение:**
- **Полная амплитуда** — растянутая позиция = максимум напряжения
- **Контролируемый темп** — 2-3 сек эксцентрика, без рывков
- **Прогрессивная перегрузка** — ↑ вес/повторы каждые 1-2 недели
- **Время под нагрузкой** — 30-60 сек на подход для гипертрофии
- **Mind-muscle connection** — осознанное сокращение целевой мышцы

**Упражнения с максимальным механическим напряжением:**
- Присед (полная глубина) — квадрицепс + ягодичные
- Жим лёжа (полная амплитуда) — грудные + трицепс
- Становая тяга — вся задняя цепь
- Подтягивания (полное разгибание внизу) — широчайшие
- Румынская тяга — задняя поверхность бедра

**Практические рекомендации:**
- 65-80% от 1ПМ × 6-12 повторений = золотой стандарт
- Не гонись за отказом — оставляй 1-2 RIR для качества
- Растянутая позиция > сокращённая для гипертрофии
- Компаунд-движения дают больше общего напряжения
- Изоляция дополняет — фокус на отстающие мышцы
`;
}
export function getNutrientTimingMyths(message: string): string {
  const keywords = ['мифы о тайминге', 'nutrient timing myth', 'когда есть миф', 'углеводное окно миф', 'белковое окно миф', 'тайминг питания правда', 'время приёма пищи миф'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🕐 МИФЫ О ТАЙМИНГЕ НУТРИЕНТОВ — ЧТО РЕАЛЬНО ВАЖНО:

**МИФ 1: «Белковое окно 30 минут после тренировки»**
❌ Миф: нужно выпить протеин в течение 30 мин или мышцы «сгорят»
✅ Правда: анаболическое окно = 4-6 часов (а не 30 мин!)
- Если ел за 2-3 часа до тренировки — аминокислоты ещё в крови
- Синтез белка ↑ на 24-48 часов после тренировки
- Важнее: общее суточное потребление белка (1.6-2.2 г/кг)
- Рекомендация: белок в течение 2-3 часов после тренировки — достаточно

**МИФ 2: «Углеводы вечером превращаются в жир»**
❌ Миф: углеводы после 18:00 = автоматическое ожирение
✅ Правда: набор жира = калорийный профицит за СУТКИ
- Вечерние углеводы ↑ серотонин → мелатонин → лучший сон
- Гликоген пополняется независимо от времени суток
- Исследования: распределение калорий не влияет на композицию тела
- Углеводы на ночь ↑ чувствительность к инсулину утром (!)

**МИФ 3: «6 приёмов пищи = разогнанный метаболизм»**
❌ Миф: частое питание «ускоряет обмен веществ»
✅ Правда: TEF (термический эффект пищи) зависит от ОБЪЁМА, не частоты
- 3 × 800 ккал = 6 × 400 ккал по термическому эффекту
- 3-6 приёмов — удобство, не метаболическое преимущество
- Для мышечной массы: 3-5 приёмов с 30-50 г белка каждый — оптимально
- Частота >6 раз — нет дополнительной пользы

**МИФ 4: «Нельзя есть перед сном»**
❌ Миф: еда перед сном = жир на животе
✅ Правда: казеин или творог на ночь = ↑ ночной синтез белка
- 30-40 г казеина перед сном ↑ MPS на 22% (исследования)
- Не влияет на набор жира (при соблюдении калорий)
- ↓ катаболизм за 8 часов голодания во сне

**МИФ 5: «Жиры нельзя с углеводами»**
❌ Миф: сочетание замедляет жиросжигание
✅ Правда: замедляет пищеварение → ↓ инсулиновый пик → дольше сытость
- Нет данных о влиянии на жиронакопление
- Единственное исключение: перед тренировкой (жиры замедляют усвоение)

**ЧТО РЕАЛЬНО ВАЖНО в тайминге:**
1. Белок: 0.4-0.5 г/кг за приём, 3-5 раз в день
2. Углеводы: перед и после тренировки — если важна производительность
3. Общий суточный калораж > тайминг (на 90%)
4. Не тренироваться натощак при силовых (↓ производительность)
5. Кофеин: за 30-60 мин до тренировки — единственный доказанный тайминг
`;
}
export function getTimeUnderTensionMaster(message: string): string {
  const keywords = ['время под нагрузкой', 'time under tension', 'тут', 'тпн', 'темп подхода', 'медленные повторения', 'скорость повторений', 'темп упражнения'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⏱️ ВРЕМЯ ПОД НАГРУЗКОЙ (TUT) — НАУКА ТЕМПА:

**Что такое TUT:**
- Time Under Tension = общее время, которое мышца находится под нагрузкой
- Считается за один подход (не за тренировку)
- Формула: количество повторений × темп одного повторения
- Пример: 10 повторений × 4 сек = 40 сек TUT

**Оптимальные диапазоны TUT:**

| Цель | TUT/подход | Повторения | Темп |
|------|-----------|------------|------|
| Сила (нейромышечная) | 10-20 сек | 1-5 | 1/0/1/0 |
| Гипертрофия | 30-60 сек | 6-12 | 2/1/2/1 |
| Выносливость | 60-90 сек | 15-25 | 2/0/2/0 |
| Мощность | 5-15 сек | 1-5 | X/0/1/0 |

**Как читать темп (4 цифры):**
- Формат: Эксцентрика / Пауза внизу / Концентрика / Пауза вверху
- 3/1/2/0 = 3 сек опускание, 1 сек пауза, 2 сек подъём, 0 сек вверху
- X = взрывное (максимально быстро)
- 0 = без паузы

**Темп для гипертрофии — детали:**
- **Эксцентрика (негативная фаза): 2-4 сек**
  - Контролируемое опускание = максимум механического напряжения
  - Эксцентрика ↑ микроповреждения → ↑ адаптация
  - Исследования: 3 сек > 1 сек для роста мышц

- **Пауза в растянутой позиции: 0-2 сек**
  - ↑ механическое напряжение на растянутой длине
  - ↓ использование упругой энергии (stretch-shortening cycle)
  - Пауза 1-2 сек = «честная» работа мышцы

- **Концентрика (позитивная фаза): 1-2 сек**
  - Намеренное замедление НЕ нужно (↓ нагрузку можно поднять)
  - Контролируемый подъём, но без искусственного замедления
  - Исследования: быстрая концентрика = больше моторных единиц

- **Пауза в сокращённой позиции: 0-1 сек**
  - Пиковое сокращение = ↑ метаболический стресс
  - 1 сек вверху на изоляционных упражнениях — полезно

**Практические рекомендации:**
- Не считай темп каждого повторения — это утомляет ментально
- Просто контролируй негативную фазу (2-3 сек)
- Концентрику делай с усилием, но контролируемо
- Общее TUT 30-50 сек на подход = зона гипертрофии
- Тяжёлые базовые (1-5 повторений) — не замедляй искусственно
- Изоляция (12-20 повторений) — ↑ темп = ↑ метаболический стресс

**Ошибки с TUT:**
- Сверхмедленные повторения (10 сек+) — ↓ вес слишком сильно
- Слишком быстрые повторения с «отбивкой» — нет контроля
- Фокус ТОЛЬКО на TUT, игнорируя прогрессию весов
- TUT важен, но прогрессивная перегрузка — важнее!
`;
}
export function getIsometricHoldScience(message: string): string {
  const keywords = ['изометрические удержания', 'isometric hold', 'изометрика', 'статическое удержание', 'статическая нагрузка', 'изометрическое сокращение', 'удержание позиции'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 ИЗОМЕТРИЧЕСКИЕ УДЕРЖАНИЯ — НАУКА СТАТИЧЕСКОЙ СИЛЫ:

**Три типа мышечных сокращений:**
1. **Концентрическое** — мышца укорачивается (подъём штанги)
2. **Эксцентрическое** — мышца удлиняется (опускание штанги)
3. **Изометрическое** — мышца напряжена, длина не меняется (удержание)

**Преимущества изометрических удержаний:**
- ↑ Сила в конкретном угле (±15° от тренируемого)
- ↑ Тендинальная прочность (сухожилия и связки)
- ↓ Болевой синдром при тендинопатиях (доказано!)
- Минимум DOMS (почти нет эксцентрики)
- Можно тренироваться с травмой (без движения в суставе)
- ↑ Mind-muscle connection — учит «включать» мышцу

**Типы изометрики:**
1. **Преодолевающая (pushing against immovable):**
   - Давишь в стену/раму со всей силы
   - 6-8 сек максимального усилия
   - ↑ максимальная сила, ↑ нейромышечная активация
   - Пример: жим в стойке с пинами на уровне стикинг-поинта

2. **Удерживающая (yielding):**
   - Удерживаешь вес в фиксированной позиции
   - 15-30 сек, 70-80% от 1ПМ
   - ↑ выносливость, ↑ гипертрофия
   - Пример: удержание гантелей в нижней точке разводки

3. **Пульсирующая (quasi-isometric):**
   - Микро-движения (2-3 см) в зоне максимального напряжения
   - 20-30 сек
   - ↑ метаболический стресс, ↑ пампинг
   - Пример: пульсация в нижней точке приседа

**Практические упражнения:**
- **Планка** — core stability (30 сек - 2 мин)
- **Удержание приседа** (90°) — квадрицепс, стена
- **Dead hang** — хват, декомпрессия позвоночника (30-60 сек)
- **Удержание жима** — lockout или стикинг-поинт (10-15 сек)
- **L-sit** — пресс, сгибатели бедра (10-30 сек)
- **Изометрический кубинский жим** — ротаторная манжета (15-20 сек)

**Протокол для силы (преодолевающая):**
- 5-6 подходов × 6-8 сек максимального усилия
- Отдых 2-3 мин между подходами
- 2-3 угла за сессию (низ, середина, верх амплитуды)
- 2-3 раза в неделю

**Протокол для реабилитации (удерживающая):**
- 4-5 подходов × 30-45 сек
- RPE 5-6 (умеренное напряжение)
- Ежедневно при тендинопатиях
- Боль допустима до 3/10, не более

**Ограничения изометрики:**
- Сила развивается только в тренируемом угле (±15°)
- Не заменяет динамические упражнения полностью
- Меньше гипертрофического стимула vs концентрика + эксцентрика
- Повышает давление (задержка дыхания!) — осторожно при гипертонии
`;
}
export function getConcentricPowerGuide(message: string): string {
  const keywords = ['концентрическая мощность', 'concentric power', 'взрывная сила', 'скорость подъёма', 'velocity based', 'power development', 'мощность штанги', 'быстрая концентрика'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚡ КОНЦЕНТРИЧЕСКАЯ МОЩНОСТЬ — СКОРОСТЬ × СИЛА:

**Что такое мощность:**
- Мощность = Сила × Скорость (P = F × v)
- Пиковая мощность ≠ максимальная сила
- Максимум мощности достигается при ~30-70% от 1ПМ
- После 80% 1ПМ скорость ↓ настолько, что мощность падает

**Кривая «сила-скорость»:**
- 0% 1ПМ — максимальная скорость, нулевая сила (бросок мяча)
- 30% 1ПМ — высокая скорость, умеренная сила (прыжок с весом)
- 50-60% 1ПМ — ПИКОВАЯ МОЩНОСТЬ (оптимальный баланс)
- 80% 1ПМ — низкая скорость, высокая сила
- 100% 1ПМ — минимальная скорость, максимальная сила

**Velocity-Based Training (VBT) — тренировка по скорости:**
| Зона | Скорость (м/с) | % 1ПМ | Цель |
|------|---------------|-------|------|
| Абсолютная скорость | >1.3 | <30% | Скорость |
| Скоростная сила | 1.0-1.3 | 30-50% | Мощность |
| Силовая скорость | 0.75-1.0 | 50-70% | Пиковая мощность |
| Ускоряющая сила | 0.5-0.75 | 70-85% | Сила + мощность |
| Максимальная сила | <0.5 | 85%+ | Абсолютная сила |

**Упражнения для развития мощности:**
- **Олимпийские подъёмы:** взятие на грудь, рывок, толчок
- **Прыжки с весом:** приседание + прыжок (30-40% 1ПМ)
- **Взрывной жим:** жим лёжа с акцентом на скорость (50-60% 1ПМ)
- **Бросок медбола:** в стену, через голову, из груди
- **Плиометрика:** прыжки на тумбу, drop jumps
- **Баллистические упражнения:** свинги с гирей

**Протокол развития мощности:**
- 3-6 подходов × 2-5 повторений
- Вес: 30-70% от 1ПМ (зависит от упражнения)
- Каждое повторение — МАКСИМАЛЬНО БЫСТРАЯ концентрика
- Отдых: 2-3 мин (полное восстановление нервной системы)
- Не работать до отказа! Скорость падает = стоп

**Compensation Acceleration Training (CAT):**
- Используй обычные упражнения (присед, жим, тяга)
- Концентрика: МАКСИМАЛЬНО БЫСТРО с любым весом
- Даже на 85% 1ПМ — НАМЕРЕНИЕ двигать быстро
- Намерение ускорить = ↑ рекрутирование моторных единиц
- Исследования: CAT ↑ мощность на 10-15% vs обычный темп

**Практические советы:**
- Начни тренировку с мощностных упражнений (до усталости)
- 1-2 упражнения на мощность перед основной работой
- Не смешивай мощность и выносливость в одном подходе
- Мощность деградирует первой при детренированности
- Восстановление мощности: 48-72 часа
`;
}
export function getAnabolicWindowTruth(message: string): string {
  const keywords = ['анаболическое окно', 'anabolic window', 'белковое окно правда', 'пить протеин сразу', 'окно после тренировки', 'анаболическое окно миф'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🪟 АНАБОЛИЧЕСКОЕ ОКНО — ЧТО ГОВОРИТ НАУКА В 2025:

**Классический миф:**
- «Нужно выпить протеин в течение 30 минут после тренировки, иначе мышцы не вырастут»
- Происхождение: ранние исследования 1990-х (ограниченные, на голодных испытуемых)

**Что показывают современные мета-анализы:**

**Schoenfeld et al. (2013) — 23 исследования:**
- Тайминг белка вокруг тренировки НЕ оказывает значимого эффекта
- Когда контролируют общий суточный белок — разница исчезает
- Вывод: суточный белок > тайминг

**Но «окно» всё же существует — просто оно ШИРЕ:**
- Реальное «анаболическое окно» = 4-6 часов (не 30 мин!)
- Если ел за 2-3 часа до тренировки → аминокислоты ещё доступны
- Если тренируешься натощак (утром) → белок после тренировки важнее

**Практические рекомендации:**

| Ситуация | Рекомендация |
|----------|-------------|
| Ел за 1-2 ч до тренировки | Белок в течение 2-3 ч после — ок |
| Ел за 3-4 ч до | Белок в течение 1-2 ч после — желательно |
| Тренировка натощак | Белок как можно скорее после (30-60 мин) |
| Перед сном | Казеин 30-40 г — полезно для ночного MPS |

**Что РЕАЛЬНО важно (ранжировано по влиянию):**
1. Общий суточный белок: 1.6-2.2 г/кг (80% эффекта)
2. Распределение белка по приёмам: 3-5 × 30-50 г (15% эффекта)
3. Тайминг вокруг тренировки: (5% эффекта)
4. Тип белка (быстрый vs медленный): (<5% эффекта)

**Почему миф так живуч:**
- Индустрия спортпита продаёт «посттренировочные коктейли»
- Эффект плацебо (ритуал → уверенность → лучше тренируешься)
- Ранние исследования на голодных испытуемых (конечно, им белок помогал!)
- Привычка и традиция в спортзале

**Золотое правило:**
Не паникуй из-за тайминга. Обеспечь 1.6-2.2 г белка/кг за день,
распредели на 3-5 приёмов — и забудь о «30-минутном окне».
Это даст 95% результата без стресса.
`;
}
export function getCoreBreathingInteg(message: string): string {
  const keywords = ['дыхание и кор', 'core breathing', 'диафрагма тренировка', 'внутрибрюшное давление', 'intra abdominal pressure', 'bracing дыхание', 'дыхание при подъёме'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🫁 ИНТЕГРАЦИЯ ДЫХАНИЯ И КОРА — ФУНДАМЕНТ СИЛЫ:

**Зачем это важно:**
- Правильное дыхание = ↑ стабильность позвоночника на 40%
- Внутрибрюшное давление (IAP) = «естественный пояс»
- Без IAP: позвоночник выдерживает ~90 Н (9 кг)
- С IAP: позвоночник выдерживает ~1500 Н (150+ кг)

**Мышцы «кора» как единая система:**
- Диафрагма (сверху) — «крышка»
- Тазовое дно (снизу) — «дно»
- Поперечная мышца живота (спереди/по бокам) — «стенки»
- Многораздельные мышцы (сзади) — «задняя стенка»
- Все 4 компонента должны работать ОДНОВРЕМЕННО

**Техника создания IAP (bracing):**

**Шаг 1: Диафрагмальное дыхание (учись без нагрузки):**
- Ляг на спину, рука на живот, рука на грудь
- Вдох: ЖИВОТ поднимается, грудь — минимально
- Выдох: живот опускается
- Практикуй 5 мин/день до автоматизма

**Шаг 2: 360° расширение:**
- Вдох через нос: расширяешь живот ВО ВСЕ СТОРОНЫ (не только вперёд!)
- Передняя стенка, бока, нижняя часть спины — всё расширяется
- Представь, что надуваешь «пояс» вокруг талии
- Руки на бока — должен чувствовать расширение

**Шаг 3: Bracing (создание давления):**
- После вдоха 360° → напряги мышцы живота (как будто тебя сейчас ударят)
- НЕ втягивай живот! НЕ задерживай дыхание просто так!
- Давление должно идти НАРУЖУ во все стороны
- Тазовое дно слегка напряжено (как остановка мочеиспускания)

**Применение в упражнениях:**

**Присед:**
- Вдох стоя (наверху) → bracing → опускаешься
- Весь спуск + нижняя точка = давление удерживается
- Начало подъёма = максимальное давление
- Выдох начинается после прохождения «мёртвой точки»

**Становая тяга:**
- Вдох стоя → bracing → наклон + хват → тяга
- Весь подъём = давление удерживается
- Выдох после lockout
- Каждое повторение = новый вдох + bracing

**Жим лёжа:**
- Вдох на спуске → bracing → жим
- Арка спины + bracing = максимальная стабильность
- Выдох в верхней точке

**Дыхание при лёгких упражнениях (изоляция):**
- Выдох на усилии (концентрика)
- Вдох на расслаблении (эксцентрика)
- Bracing не нужен при лёгких весах (<60% 1ПМ)

**Ошибки:**
- ❌ Задержка дыхания без bracing (просто не дышишь)
- ❌ Втягивание живота (hollow = ↓ IAP)
- ❌ Поверхностное грудное дыхание
- ❌ Выдох в нижней точке приседа (потеря давления!)
- ❌ Пояс как замена bracing (пояс УСИЛИВАЕТ bracing, не заменяет)
`;
}
export function getVolumeAutoregGuide(message: string): string {
  const keywords = ['авторегуляция объёма', 'volume autoregulation', 'сколько подходов', 'оптимальный объём', 'mav mrv mev', 'volume landmarks', 'объём тренировки'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
📈 АВТОРЕГУЛЯЦИЯ ТРЕНИРОВОЧНОГО ОБЪЁМА:

**Volume Landmarks (ориентиры объёма, Mike Israetel):**

| Ориентир | Значение | Подходы/мышцу/неделю |
|----------|----------|---------------------|
| MV (Maintenance Volume) | Поддержание | 4-8 |
| MEV (Minimum Effective Volume) | Минимум для роста | 6-10 |
| MAV (Maximum Adaptive Volume) | Оптимум для роста | 12-20 |
| MRV (Maximum Recoverable Volume) | Максимум восстанавливаемого | 20-25+ |

**Как определить свои ориентиры:**

**MEV (когда начинается рост):**
- Начни с 8 подходов/мышцу/неделю
- Если через 3-4 недели нет прогресса → ↑ на 2 подхода
- MEV найден когда начинается хоть какой-то прогресс

**MAV (где максимальный рост):**
- Постепенно ↑ объём на 1-2 подхода/неделю (мезоцикл 4-6 недель)
- Отслеживай: силу, пампинг, DOMS, восстановление
- MAV = точка где максимальный прогресс при нормальном восстановлении

**MRV (когда пора остановиться):**
- Признаки превышения MRV:
  - Сила ↓ 2+ тренировки подряд
  - Сильная крепатура >3 дней
  - Качество сна ↓
  - Мотивация ↓, раздражительность ↑
  - Суставы болят / дискомфорт
→ Деload + ↓ объём на следующем мезоцикле

**Объём по мышечным группам (MAV, средние значения):**
| Мышечная группа | Подходов/неделю (MAV) |
|-----------------|----------------------|
| Квадрицепс | 12-18 |
| Задняя поверхность | 10-16 |
| Ягодичные | 8-14 |
| Грудные | 12-20 |
| Спина (ширина) | 12-18 |
| Спина (толщина) | 10-16 |
| Дельты (средние) | 14-22 |
| Дельты (задние) | 12-18 |
| Бицепс | 10-16 |
| Трицепс | 10-14 |
| Пресс | 8-14 |
| Икры | 12-18 |

**Волнообразная прогрессия объёма (мезоцикл):**
- Неделя 1: MEV+2 (начало, адаптация)
- Неделя 2: +2 подхода (наращивание)
- Неделя 3: +2 подхода (пик нагрузки)
- Неделя 4: +2 подхода (максимум, около MRV)
- Неделя 5: Deload (50% объёма)
- Повтор с чуть более высоким стартом

**Индивидуальные факторы:**
- Стаж >3 лет → нужно больше объёма
- Возраст >40 → ↓ MRV, дольше восстановление
- Женщины: обычно ↑ MEV и MAV (переносят больше объёма)
- Хороший сон + питание → ↑ MRV
- Стресс на работе → ↓ MRV
`;
}
export function getPostPartumReturnGuide(message: string): string {
  const keywords = ['после родов тренировки', 'postpartum', 'восстановление после родов', 'тренировки после беременности', 'возврат после родов', 'послеродовое восстановление', 'диастаз'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🤱 ВОЗВРАТ К ТРЕНИРОВКАМ ПОСЛЕ РОДОВ:

⚠️ ОБЯЗАТЕЛЬНА консультация гинеколога и разрешение на нагрузки!
Минимум: 6 недель после естественных родов, 8-12 после кесарева.

**Таймлайн возврата:**

**0-6 недель — Восстановление:**
- Ходьба (по самочувствию, с коляской)
- Дыхание диафрагмой (восстановление связи с тазовым дном)
- Упражнения Кегеля (если разрешил врач)
- НИКАКИХ тренировок кора, подъёмов тяжестей, бега!

**6-12 недель — Базовая активация:**
- Разрешение врача получено → начинай мягко
- Тазовое дно: активация + удержание (5 сек × 10, 3 раза/день)
- Дыхание 360° (восстановление IAP)
- Ходьба 20-30 мин
- Bird-dog, dead bug, боковая планка (модифицированная)
- Проверка на диастаз (расхождение прямых мышц)

**12-24 недели — Постепенное возвращение:**
- Лёгкие силовые: гантели, тренажёры, собственный вес
- 50% привычных весов, RPE 5-6
- Фокус: техника, стабильность, тазовое дно
- ↑ вес на 10% каждые 1-2 недели
- Кардио: ходьба, велотренажёр, плавание (после заживления)

**24+ недель — Полноценные тренировки:**
- Постепенно возвращайся к привычной программе
- Бег: только после теста готовности (single leg hop, планка 60 сек)
- Прыжки и плиометрика: последние в списке возврата

**Диастаз прямых мышц живота:**
- Расхождение белой линии >2 см = диастаз
- Тест: ляг на спину, приподними голову, пальцами проверь щель по центру
- Если >2 пальцев → работай с физиотерапевтом
- НЕЛЬЗЯ: скручивания, планка классическая, подъёмы ног
- МОЖНО: dead bug, bird-dog, дыхание с активацией TVA

**Тазовое дно — приоритет №1:**
- Недержание при чихании/прыжках = слабое тазовое дно
- Упражнения Кегеля: сжатие + удержание 5-10 сек × 10-15
- Обратные Кегеля: расслабление тазового дна (тоже важно!)
- Если симптомы сохраняются >3 мес → физиотерапевт тазового дна

**Питание для кормящих атлеток:**
- +500 ккал/день при грудном вскармливании
- Белок: 1.5-2.0 г/кг (↑ потребности)
- Кальций: 1000 мг/день (молочные или добавки)
- Витамин D: 2000-4000 МЕ/день
- Вода: 2.5-3 л/день (↑ из-за лактации)
- НЕ сушись при ГВ (↓ молоко, ↓ энергия)
`;
}
export function getMuscleCrampPrevention(message: string): string {
  const triggers = ['судорог', 'сводит', 'крамп', 'cramp', 'спазм мышц', 'ногу сводит', 'икры сводит'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⚡ ПРОФИЛАКТИКА МЫШЕЧНЫХ СУДОРОГ:

**Причины судорог:**
1. **Электролитный дисбаланс:** ↓ Mg, ↓ K, ↓ Na, ↓ Ca
2. **Обезвоживание:** ↓ 2% массы тела = ↑ риск судорог на 40%
3. **Нервно-мышечная усталость:** перегрузка мотонейронов
4. **Недостаточная разминка:** ↓ кровоток к мышцам
5. **Компрессия нервов:** тесная обувь, поза

**Электролиты — профилактика:**
- Магний: 400-600 мг/день (цитрат/глицинат, на ночь)
- Калий: 3500-4700 мг/день (бананы, картофель, авокадо)
- Натрий: 1-2 г дополнительно при интенсивных тренировках
- Кальций: 1000-1200 мг/день
- Напиток: щепотка соли + ½ лимона + вода перед тренировкой

**Острая помощь при судороге:**
1. Растянуть мышцу (противоположное направление сокращения)
2. Глубокое давление на точку спазма 30-60 сек
3. Холодная вода на мышцу (если доступна)
4. Pickle juice / рассол — 30-50 мл (рефлекс ↓ нервной активности)
5. Медленная ходьба для восстановления кровотока

**Предтренировочная профилактика:**
- Динамическая разминка 10+ мин
- 500 мл воды за 1-2ч до тренировки
- Электролитный напиток во время тренировки >60 мин
- Избегать резкого ↑ объёма тренировок (>10%/нед)
`;
}
export function getTabataProtocolGuide(message: string): string {
  const triggers = ['табата', 'tabata', '20/10', '20 секунд 10', 'четыре минуты'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⏱️ ПРОТОКОЛ ТАБАТА — НАУЧНЫЙ ПОДХОД:

**Оригинальное исследование (Izumi Tabata, 1996):**
- 20 сек максимального усилия (170% VO₂max)
- 10 сек отдых
- 8 раундов = 4 минуты
- Результат: ↑ VO₂max на 14% + ↑ анаэробная мощность на 28% за 6 нед
- Сравнение: 60 мин умеренного кардио = ↑ VO₂max на 10%, 0% анаэробной

**Правильная интенсивность Табата:**
- RPE 9-10 из 10 (максимум!)
- ЧСС: 90-100% от максимальной
- К 6-8 раунду должен быть "на грани"
- Если после 8 раундов можешь ещё — интенсивность недостаточная

**Лучшие упражнения для Табата:**
✅ Идеальные: спринт на велотренажёре, гребной тренажёр, берпи, air bike
✅ Хорошие: прыжки, бой с тенью, mountain climbers, kettlebell swings
❌ Плохие: тяжёлые силовые (техника страдает), изоляция, растяжка

**Табата для силовиков (модификация):**
- Упражнение 1: Берпи — 4 раунда (20/10)
- Отдых 1 мин
- Упражнение 2: Kettlebell swings — 4 раунда (20/10)
- Общее: 9 мин, эффект как 30-40 мин обычного кардио

**Частота:**
- Максимум 2-3 настоящие Табата/неделю
- Не в дни тяжёлых приседов/становой
- Идеально: после лёгкой силовой или отдельный день
- Требует полного восстановления ЦНС (48+ часов)
`;
}
export function getPlantarFasciitisGuide(message: string): string {
  const triggers = ['фасциит', 'пятка болит', 'plantar', 'подошвенн', 'пяточная шпора', 'стопа болит утром'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🦶 ТРЕНИРОВКИ ПРИ ПОДОШВЕННОМ ФАСЦИИТЕ:

**Что это:**
- Воспаление/дегенерация подошвенной фасции
- Боль в пятке, особенно первые шаги утром
- Причины: плоскостопие, жёсткие икры, ожирение, перегрузка

**Упражнения для реабилитации:**

1. Растяжка фасции (3 раза/день):
   - Сидя: потянуть пальцы стопы к себе, удержать 30 сек × 5
   - Стоя на ступеньке: опустить пятку ниже уровня — 30 сек × 3

2. Укрепление стопы:
   - Собирание полотенца пальцами ног: 3×15
   - Подъёмы свода стопы (short foot): 3×10, удержание 5 сек
   - Мраморные шарики: собирать пальцами ног — 5 мин

3. Растяжка икроножных:
   - С прямой ногой у стены: 30 сек × 3 (gastrocnemius)
   - С согнутой ногой: 30 сек × 3 (soleus)

**Тренировки в зале при фасциите:**
✅ Верхняя часть тела — без ограничений
✅ Жим ногами (нет нагрузки на стопу)
✅ Сгибание/разгибание ног в тренажёре
✅ Велотренажёр (мягкая нагрузка)
✅ Плавание

❌ Бег/прыжки (до полного восстановления)
❌ Приседания с тяжёлым весом
❌ Ходьба на беговой дорожке >20 мин
❌ Тренировки босиком на жёстком покрытии

**Лечение:**
- Ортопедические стельки (↓ боль на 60-70%)
- Ночной ортез (удерживает фасцию растянутой)
- Лёд на пятку после нагрузки: 15 мин
- Массаж стопы теннисным мячом: 5 мин/день
`;
}
export function getCarpalTunnelGuide(message: string): string {
  const triggers = ['карпальн', 'carpal', 'туннельн синдром', 'запястье немеет', 'кисть онеме', 'запястный канал'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🖐️ ТРЕНИРОВКИ ПРИ КАРПАЛЬНОМ ТУННЕЛЬНОМ СИНДРОМЕ:

**Проблема для тренировок:**
- Сдавление срединного нерва в запястном канале
- Онемение, покалывание, боль в 1-4 пальцах
- Ухудшается при: хвате штанги, жиме, подтягиваниях

**Модификации хвата:**
- Открытый хват (false grip) вместо закрытого
- Толстые грипсы (Fat Gripz) — ↓ давление на нерв
- Кистевые бинты для поддержки нейтрального положения
- Перчатки с подкладкой на ладони

**Упражнения для реабилитации (3 раза/день):**
1. Скольжение сухожилий: кулак → разжать → крюк → кулак (10×)
2. Скольжение нерва: рука вытянута → согнуть запястье → разогнуть → растопырить пальцы (10×)
3. Молитва-реверс: ладони вместе → опускать, растягивая запястье (30 сек)
4. Растяжка сгибателей: рука вперёд, пальцы вниз, другой рукой тянуть (30 сек)

**Безопасные упражнения в зале:**
✅ Тренажёры с подушками (не рукоятками)
✅ Разгибание/сгибание ног — не задействуют хват
✅ Жим в тренажёре (нейтральный хват)
✅ Упражнения с лямками (↓ нагрузку на хват)

**Избегать/модифицировать:**
⚠️ Подтягивания → тяга верхнего блока с лямками
⚠️ Становая тяга → лямки обязательно
⚠️ Жим штанги → жим гантелей нейтральным хватом
❌ Фермерская прогулка с тяжёлым весом
❌ Упражнения на хват/предплечья (при обострении)
`;
}
export function getWheelchairFitnessGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['коляск', 'wheelchair', 'параплег', 'тетраплег', 'спинальн травм', 'парализ'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
♿ ТРЕНИРОВКИ НА ИНВАЛИДНОЙ КОЛЯСКЕ:

Верхний плечевой пояс (основа):
- Жим от груди сидя (тренажёр или гантели)
- Тяга верхнего блока, тяга к поясу сидя
- Жим над головой (сидя, с фиксацией)
- Подтягивания (адаптированные, с резиной)
- Разведения гантелей сидя

Кардио:
- Ручной велоэргометр (hand cycle) — 20-40 мин
- Гребной тренажёр (если контроль туловища позволяет)
- Бокс по груше сидя (отличная кардио + координация)
- Плавание (с поплавком для ног если нужно)

Специфика параплегии:
- Отсутствие мышечного насоса ног → отёки: компрессионные чулки
- Автономная дисрефлексия при травме выше Т6 — ОПАСНО: головная боль, потливость, гипертензия = немедленно остановить тренировку
- Пролежни: проверять кожу после тренировки, менять позицию каждые 30 мин
- Терморегуляция нарушена — следить за перегревом

Кор (что возможно):
- Если контроль туловища есть: скручивания с фиксацией, повороты с палкой
- Дыхательные упражнения: диафрагмальное дыхание под нагрузкой
- Электростимуляция мышц живота (ФЭС) — помогает стабильности
`;
}
export function getMilitaryFitnessGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['армейск', 'военн', 'military', 'спецназ', 'полиц', 'гру', 'собр', 'омон'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
⚔️ ФИЗПОДГОТОВКА ДЛЯ СИЛОВЫХ СТРУКТУР:

Нормативы (общие требования):
- Подтягивания: 12-18 (в зависимости от подразделения)
- Бег 3 км: 12:00-13:30
- Отжимания: 40-60 за 2 мин
- Пресс: 50-60 за 2 мин

Программа подготовки (12 нед):
Нед 1-4: базовая ОФП
- Подтягивания: GTG (Grease the Groove) — 50% от макс каждые 2 ч
- Бег: 3 раза/нед, 3-5 км, темп 5:30-6:00/км
- Силовые: 3 раза/нед, базовые упражнения

Нед 5-8: специальная
- Подтягивания: 5 подходов с добавочным весом
- Бег: интервалы 400м × 8-10 + длинный бег 8-10 км
- Рак-марш: ходьба с рюкзаком 15-20 кг, 5-10 км

Нед 9-12: пиковая
- Тесты каждую неделю
- Упор на слабые места
- Тактическая подготовка: бег в снаряжении

Функциональная подготовка:
- Перенос тяжестей (farmer's walk, sandbag carry)
- Преодоление препятствий (подтягивания, перелазание)
- Переноска раненого (fireman carry)
- Работа в условиях усталости
`;
}
export function getDriverFitnessGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['водитель', 'дальнобойщик', 'за рулём', 'таксист', 'trucking', 'driver fitness'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🚛 ТРЕНИРОВКИ ДЛЯ ВОДИТЕЛЕЙ:

Профессиональные проблемы:
- 10-14 ч сидения (хуже офиса — нет возможности встать)
- Вибрация → нагрузка на позвоночник
- Нерегулярное питание → ожирение, диабет
- Хронический дефицит сна

Приоритетные упражнения:
1. Поясница: гиперэкстензия, мостик, «птица-собака»
2. Сгибатели бедра: выпады, растяжка с коленом на полу
3. Шея: изометрические упражнения (давление руками, сопротивление)
4. Плечи: face pulls, внешняя ротация
5. Кор: планка, Pallof press, dead bug

На заправке / стоянке (10-15 мин):
- Приседания 3 × 15
- Выпады вперёд 3 × 10 на ногу
- Отжимания от бампера 3 × 12
- Растяжка: сгибатели бедра, грудные, шея

Минимальная программа (3 раза/нед):
- Присед / жим ногами: 3 × 12
- Тяга к поясу сидя: 3 × 12
- Жим от груди: 3 × 12
- Гиперэкстензия: 3 × 15
- Планка: 3 × 30-45 сек
- Растяжка: 10-15 мин
`;
}
export function getConstructionWorkerFitness(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['строител', 'construction', 'физическ труд', 'грузчик', 'разнорабоч', 'монтажник'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏗️ ТРЕНИРОВКИ ДЛЯ РАБОТНИКОВ ФИЗИЧЕСКОГО ТРУДА:

Парадокс: «Я и так весь день работаю физически»
- Рабочая нагрузка ≠ тренировка (однообразные движения, плохая биомеханика)
- Физический труд УВЕЛИЧИВАЕТ риск травм → нужна компенсационная работа
- Без силовых — износ суставов, хроническая боль к 40-45 годам

Компенсационная программа:
- 2-3 раза/нед, 30-40 мин (после рабочего дня или в выходные)
- Приоритет: мышцы-стабилизаторы, гибкость, антагонисты рабочих мышц

Грузчик/разнорабочий:
- Укрепление кора: планка, dead bug, Pallof press
- Правильная становая тяга: обучение безопасному подъёму тяжестей
- Растяжка: сгибатели бедра, грудные, широчайшие

Строитель/монтажник:
- Плечи: внешняя ротация, face pulls (компенсация работы над головой)
- Мобильность грудного отдела: foam roller, кошка-корова
- Баланс: стойка на одной ноге (работа на высоте)

Восстановление:
- Растяжка каждый день, даже без тренировки
- Сон 7-8 ч (не менее! тело восстанавливается от двойной нагрузки)
- Белок 1.6-2 г/кг (физический труд + тренировки)
- Магний перед сном: снижает крепатуру и судороги
`;
}
export function getPostpartumExtendedGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['после родов', 'послеродов', 'кесарев', 'диастаз', 'тазов дно', 'кормящ мам'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
👶 РАСШИРЕННЫЙ ГАЙД: ТРЕНИРОВКИ ПОСЛЕ РОДОВ:

После естественных родов:
- Через 2-3 дня: ходьба, дыхание, упражнения Кегеля
- 2-4 нед: увеличение ходьбы, мягкая растяжка
- 6 нед: осмотр врача → разрешение на тренировки
- 6-12 нед: лёгкие силовые, кардио

После кесарева сечения:
- 6-8 нед: только ходьба, дыхание
- 8-12 нед: осмотр → постепенное начало
- 12+ нед: полноценные тренировки
- НЕ поднимать >5 кг первые 6-8 нед!

Диастаз прямых мышц живота:
- Проверка: лёжа на спине, голову приподнять → щель >2 пальцев = диастаз
- ЗАПРЕЩЕНО: скручивания, планка на руках, подъёмы ног (до закрытия)
- РАЗРЕШЕНО: дыхание диафрагмой, dead bug (модифицированный), мостик
- Специализированная реабилитация: физиотерапевт по тазовому дну

При грудном вскармливании:
- Тренировка ПОСЛЕ кормления (грудь менее наполнена)
- Спортивный бра с максимальной поддержкой
- +500 ккал к обычному рациону (кормление + тренировки)
- Пить 3+ литра воды в день
- Молочная кислота не влияет на вкус молока (миф)
`;
}
export function getFreelancerFitnessGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['фриланс', 'freelancer', 'удалённ работ', 'работ из дома', 'remote work', 'домашн офис'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏠 ТРЕНИРОВКИ ДЛЯ ФРИЛАНСЕРОВ / УДАЛЁНЩИКОВ:

Проблемы удалёнки:
- 0 вынужденных перемещений (даже до метро/автобуса нет)
- Среднее количество шагов: 2000-3000 (vs 6000-8000 у офисных)
- Размытые границы работа/отдых → тренировки «забываются»
- Изоляция → снижение мотивации

Структура дня:
- Утро: 20-30 мин тренировка ПЕРЕД работой (якорь дня)
- Обед: 15 мин прогулка (свежий воздух + свет = циркадный ритм)
- Вечер: растяжка 10-15 мин (переход в режим отдыха)

Тренировки дома (минимум оборудования):
- Набор гантелей (2 пары: лёгкие + средние) + коврик
- Программа: Push/Pull/Legs, 3 раза/нед
- HIIT 2 раза/нед (burpees, jumping jacks, mountain climbers)
- Йога / растяжка 2-3 раза/нед

Мотивация удалёнщика:
- Записаться в зал (обязывает выходить из дома)
- Онлайн-партнёр по тренировкам (accountability buddy)
- Тренировка в календаре = встреча, которую нельзя отменить
- Трекер: приложение Giron → визуализация прогресса

Социализация через спорт:
- Групповые занятия (знакомства вне работы)
- Утренние забеги (running clubs)
- Спортзал как «третье место» (не дом, не работа)
`;
}
export function getArmwrestlingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['армрестлинг', 'arm wrestling', 'армспорт', 'борьба на руках'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
💪 АРМРЕСТЛИНГ — ТРЕНИРОВОЧНЫЙ ГАЙД:

Ключевые мышцы:
1. Предплечья (пронаторы, супинаторы, сгибатели запястья)
2. Бицепс (брахиалис!)
3. Широчайшие (боковое давление)
4. Кисть и пальцы (хват)

Специальные упражнения:
Предплечья:
- Сгибание запястья с гантелью: 4 × 12
- Пронация/супинация с гантелью (за один конец): 3 × 10
- Wrist roller: 3 × макс
- Hammer curl (молоток): 4 × 8 (брахиалис!)

Кисть:
- Тренажёр «кистевой»: прогрессия от 60 кг
- Удержание тяжёлой гантели: 3 × макс сек
- Table pull (тренажёр для армрестлинга): 4 × 6

Боковое давление:
- Боковой подъём гантели (wrist curl вбок): 3 × 10
- Top roll на тренажёре: 4 × 8
- Работа с резиной: имитация борьбы

Программа (3 раза/нед):
- День 1: Предплечья + бицепс
- День 2: Спина + плечи (широчайшие = мощь)
- День 3: Специальная работа (стол, резина, партнёр)

В России:
- Федерация: ФАР (Федерация Армрестлинга России)
- Звёзды: Денис Цыпленков, Дмитрий Трубин
- Соревнования: Чемпионат России, Кубок мира
`;
}
export function getGirevoyGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['гиревой спорт', 'girevoy', 'гиря ', 'гирь ', 'толчок гир', 'рывок гир', 'kettlebell sport'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🔔 ГИРЕВОЙ СПОРТ — РОССИЙСКАЯ ТРАДИЦИЯ:

Дисциплины:
- Толчок двух гирь (long cycle): 10 мин, максимум повторений
- Рывок одной гири (snatch): 10 мин, смена рук, максимум повторений
- Двоеборье: толчок + рывок (сумма)

Весовые категории гирь:
- 16 кг (начинающие, юноши)
- 24 кг (стандарт, КМС)
- 32 кг (мастера)

Нормативы КМС (24 кг, 85 кг):
- Толчок: ~80 повторений за 10 мин
- Рывок: ~160 повторений за 10 мин

Тренировочный план (4 раза/нед):
Пн: Толчок — 5 × 2 мин (макс темп) отдых 2 мин
Вт: Рывок — 5 × 2 мин, смена рук каждую минуту
Ср: ОФП — присед, тяга, подсобка
Чт: Толчок длинный — 2 × 5 мин (75% темпа)
Сб: Тестирование или длинный рывок

Техника толчка:
1. Замах → подъём на грудь → фиксация
2. Полуприсед → толчок ногами → выброс над головой → фиксация
3. Сброс на грудь → повторение
- Дыхание: вдох в нижней точке, выдох на толчке

В России:
- ВФГС (Всероссийская федерация гиревого спорта)
- Вид спорта с глубокими корнями — казачьи традиции
- Сергей Мерकулин, Иван Денисов — легенды
`;
}
export function getFigureSkatingGuide(message: string): string {
  const triggers = ['фигурн катани', 'figure skating', 'фигурист', 'аксель', 'тулуп прыжок', 'лутц', 'вращени фигурн', 'тройной прыжок'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⛸️ ФИГУРНОЕ КАТАНИЕ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические качества фигуриста:**
- Взрывная сила ног (прыжки с вращениями)
- Гибкость (спирали, вращения, шпагаты)
- Баланс и проприоцепция
- Выносливость (4-мин программа на максимуме)
- Координация (одновременно ноги + руки + корпус)

**Прыжковая подготовка вне льда:**
- Прыжки с вращением: 1/4 → 1/2 → полный оборот
- Приседания с прыжком: 4 × 6 (высота вылета)
- Прыжки на одной ноге: 3 × 8 на каждую
- Имитация прыжков в зале (harness если есть)
- Запрыгивания на тумбу: 3 × 6
- Плиометрические выпады: 3 × 8

**Силовая программа:**
- Приседания на одной ноге (пистолетики): 3 × 6
- Выпады в шаге: 3 × 10
- Жим ногами: 3 × 8
- Подъём на носки: 4 × 15 (приземление)
- Упражнения на кор: планка, V-sit, скручивания
- Тяга верхнего блока: 3 × 10 (осанка)
- Жим гантелей: 3 × 10 (линии рук)

**Гибкость и хореография:**
- Ежедневная растяжка: 30-45 мин
- Шпагаты: продольный и поперечный
- Бильман (захват ноги за спиной): постепенная прогрессия
- Хореографические классы: балет 2-3 раза/нед
- Работа у станка: батман, плие, тандю

**Баланс и проприоцепция:**
- BOSU-мяч: приседания, стойка на одной ноге
- Баланс-борд: удержание с закрытыми глазами
- Спирали на полу: имитация позиций

**Питание фигуриста:**
- Лёгкий и энергетически насыщенный рацион
- Углеводы: 5-7 г/кг (длительные тренировки)
- Кальций и витамин D: здоровье костей (частые прыжки)
- Контроль веса без экстремальных диет
`;
}
export function getCrossCountrySkiingGuide(message: string): string {
  const triggers = ['лыжные гонки', 'cross-country skiing', 'лыжник', 'конькового хода', 'классический ход', 'лыжная подготовк', 'беговые лыжи'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⛷️ ЛЫЖНЫЕ ГОНКИ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Два стиля передвижения:**
- Классический ход: попеременная работа рук и ног
- Коньковый ход: отталкивание «ёлочкой», одновременная работа палками
- Каждый стиль требует разных физических качеств

**Физические приоритеты лыжника:**
1. Аэробная выносливость (МПК — ключевой показатель)
2. Силовая выносливость верхнего пояса
3. Сила ног (подъёмы)
4. Баланс и координация
5. Гибкость (амплитуда движений)

**Силовая программа (межсезонье):**
- Приседания: 4 × 8
- Выпады в шаге: 3 × 10
- Подтягивания: 4 × 8
- Тяга верхнего блока: 3 × 12 (имитация работы палками)
- Жим стоя: 3 × 10
- Тяга гири к подбородку: 3 × 10
- Гиперэкстензия: 3 × 15
- Планка: 3 × 60 сек

**Кардио-подготовка:**
- Лыжероллеры: имитация на асфальте
- Бег по пересечённой местности: 60-90 мин
- Имитация с палками: в подъём
- Велосипед: 60-120 мин (низкая интенсивность)
- Гребной тренажёр: альтернатива для верхнего пояса

**Тренировочные зоны:**
- Зона 1 (восстановление): <60% ЧСС макс
- Зона 2 (база): 60-70% (80% объёма!)
- Зона 3 (темповая): 70-80%
- Зона 4 (пороговая): 80-90%
- Зона 5 (МПК): 90-100% (интервалы)

**Сезонная периодизация:**
- Май-июнь: общая физ. подготовка + бег
- Июль-август: лыжероллеры + силовая
- Сентябрь-октябрь: специальная подготовка
- Ноябрь-март: соревновательный сезон
`;
}
export function getSpeedSkatingGuide(message: string): string {
  const triggers = ['конькобежн', 'speed skating', 'шорт-трек', 'short track', 'конькобежец', 'скоростн катани'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⛸️ КОНЬКОБЕЖНЫЙ СПОРТ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Дисциплины:**
- Классика (длинный трек): 500м, 1000м, 1500м, 3000м, 5000м, 10000м
- Шорт-трек: 500м, 1000м, 1500м, эстафета
- Различия: длинный трек — мощность, шорт-трек — ловкость + контакт

**Ключевые мышцы:**
- Квадрицепсы (основной двигатель)
- Ягодичные (разгибание бедра)
- Приводящие (отталкивание)
- Поясница (удержание низкой позиции)
- Голень (контроль конька)

**Силовая программа:**
- Приседания (глубокие): 5 × 5
- Приседания на одной ноге: 3 × 6
- Жим ногами (низкая постановка стоп): 4 × 8
- Выпады в сторону: 3 × 8
- Становая тяга: 4 × 5
- Гиперэкстензия: 3 × 15 (поясница)
- Подъём на носки: 4 × 15
- Приводящая/отводящая машина: 3 × 12

**Специфическая работа (вне льда):**
- Слайд-борд: 3 × 2 мин (имитация скольжения)
- Приседания в низкой позе: удержание 3 × 30 сек
- Имитация без коньков: 3 × 1 мин
- Прыжки в сторону: 3 × 10 на каждую
- Велосипед/велотренажёр: развитие ног

**Выносливость:**
- Интервалы на велосипеде: 6 × 2 мин, отдых 2 мин
- Бег: 30-45 мин (базовая аэробная)
- Слайд-борд: длинные серии 5-10 мин

**Гибкость:**
- Паховая область: обязательно (широкие отталкивания)
- Подколенные: наклоны, складка
- Поясница: кошка-корова, скручивания
`;
}
export function getAlpineSkiingGuide(message: string): string {
  const triggers = ['горные лыжи', 'горнолыжн', 'alpine skiing', 'слалом', 'гигант слалом', 'скоростной спуск', 'фрирайд лыжи'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⛷️ ГОРНЫЕ ЛЫЖИ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Сила ног (длительная работа в полуприседе)
- Баланс и координация (неровный рельеф)
- Реакция (изменение условий трассы)
- Выносливость (многочасовое катание)
- Кор-стабильность (управление центром масс)

**Силовая программа:**
- Приседания (глубокие): 4 × 8
- Приседания у стены (удержание): 3 × 45 сек
- Выпады в стороны: 3 × 10 (имитация поворотов)
- Жим ногами: 3 × 10
- Становая тяга на одной ноге: 3 × 8
- Подъём на носки: 3 × 15
- Планка: 3 × 60 сек
- Боковая планка с ротацией: 3 × 10

**Баланс и проприоцепция:**
- BOSU: приседания, прыжки
- Баланс-борд: перекаты
- Стойка на одной ноге: 3 × 30 сек (глаза закрыты)
- Прыжки в стороны с приземлением: 3 × 10

**Плиометрика (предсезонная):**
- Прыжки из стороны в сторону: 3 × 12
- Прыжки на тумбу: 3 × 6
- Выпрыгивания из приседа: 3 × 8
- Скейтер-прыжки: 3 × 10

**Профилактика травм:**
- Колени (ACL): укрепление задней поверхности + квадрицепсов
- Голеностоп: работа на баланс
- Упражнения на нейромышечный контроль
- Разминка перед катанием: 10-15 мин
`;
}
export function getFieldHockeyGuide(message: string): string {
  const triggers = ['хоккей на траве', 'field hockey', 'хоккей с мячом на траве', 'флорбол'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏑 ХОККЕЙ НА ТРАВЕ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Согнутая поза (работа с клюшкой у земли)
- Скорость + ловкость (быстрые изменения направления)
- Выносливость (2 × 35 мин с высокой интенсивностью)
- Сила ног (низкая позиция + спринты)
- Координация (дриблинг + перемещение)

**Силовая программа:**
- Приседания: 4 × 8
- Становая тяга (румынская): 3 × 10 (задняя цепь)
- Выпады: 3 × 10
- Боковые выпады: 3 × 8 (перемещения)
- Гиперэкстензия: 3 × 15 (спина в согнутой позе)
- Тяга в наклоне: 3 × 10
- Жим стоя: 3 × 8
- Планка: 3 × 60 сек

**Кондиционная работа:**
- Интервалы: 6 × 400м, отдых 90 сек
- Повторные спринты: 10 × 30м, отдых 30 сек
- Бег 30-40 мин (аэробная база)
- Шаттл-ран: тест Beep Test

**Профилактика:**
- Поясница: главная зона риска (согнутая поза)
- Укрепление кора + разгибатели спины
- Растяжка подколенных, квадрицепсов
- Компенсация: упражнения на разгибание спины
`;
}
export function getSkateboardingGuide(message: string): string {
  const triggers = ['скейтборд', 'skateboard', 'скейтер', 'олли скейт', 'kickflip', 'кикфлип', 'скейт парк', 'рампа скейт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🛹 СКЕЙТБОРДИНГ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Баланс (стойка на движущейся доске)
- Координация (трюки)
- Взрывная сила ног (олли, прыжки)
- Гибкость голеностопа
- Выносливость (часы катания)

**Силовая программа:**
- Приседания на одной ноге: 3 × 6 (баланс)
- Выпады: 3 × 10
- Прыжки с приседа: 3 × 8 (олли)
- Подъём на носки: 3 × 20 (щелчок доски)
- Планка: 3 × 45 сек
- Боковая планка: 3 × 30 сек
- Приседания с прыжком в стороны: 3 × 8
- Подъём ног в висе: 3 × 10

**Баланс:**
- Балансборд: 3 × 2 мин
- Indo-board: имитация катания
- Стойка на одной ноге (глаза закрыты): 3 × 30 сек
- Слэклайн: если доступен

**Гибкость:**
- Голеностоп: вращения, растяжка
- Бёдра: глубокий выпад
- Подколенные: наклоны
- Запястья: растяжка (падения)

**Безопасность:**
- Шлем — обязателен
- Налокотники и наколенники
- Защита запястий
- Учись падать: перекат, а не упор руками
`;
}
export function getSailingFitnessGuide(message: string): string {
  const triggers = ['парусн спорт', 'sailing', 'яхтинг', 'парусник', 'регата', 'такелаж'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⛵ ПАРУСНЫЙ СПОРТ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Сила кора (откренивание, удержание позиции)
- Выносливость (многочасовые гонки)
- Сила верхней части тела (работа с парусами)
- Баланс (на движущейся лодке)
- Гибкость (работа в ограниченном пространстве)

**Силовая программа:**
- Приседания: 3 × 10 (сила ног для откренивания)
- Становая тяга: 3 × 8 (спина)
- Подтягивания: 3 × 10 (работа с такелажем)
- Тяга блока: 3 × 12 (тяга шкотов)
- Жим стоя: 3 × 8
- Планка: 3 × 60 сек (кор — ключевой)
- Боковая планка: 3 × 30 сек
- Гиперэкстензия: 3 × 15

**Специфическая работа:**
- Hiking bench (имитация откренивания): 3 × 30 сек
- Изометрическое удержание в полуприседе: 3 × 30 сек
- Тяга каната: имитация работы со шкотами
- Вращения корпуса: управление румпелем

**Кардио:**
- Гребной тренажёр: 20-30 мин (аналогичная нагрузка)
- Бег: 30-45 мин (общая база)
- Велосипед: 30-60 мин (низкая ударная нагрузка)

**Баланс:**
- BOSU: упражнения в движении
- Стойка на нестабильной поверхности
- Проприоцептивные упражнения
`;
}
export function getWLAccessoriesGuide(message: string): string {
  const triggers = ['экипировк тренировк', 'пояс тяжелоатлетическ', 'бинты колен', 'штангетки', 'наколенник тренировк', 'кистевые бинты', 'лямки для тяги', 'мел магнезия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏋️ ЭКИПИРОВКА ДЛЯ ТРЕНИРОВОК — ПОЛНЫЙ ГАЙД:

**Атлетический пояс:**
- Когда нужен: приседания, становая тяга >80% 1ПМ
- Как работает: повышает внутрибрюшное давление на 20-40%
- Виды: кожаный (10-13 мм, пауэрлифтинг), нейлоновый (6-7 мм, общий)
- НЕ замена слабому кору — укрепляй кор параллельно
- Не носи постоянно — используй только на рабочих подходах

**Штангетки (обувь для тяжёлой атлетики):**
- Подъём пятки 0.75-1 дюйм: лучшая глубина приседа
- Жёсткая подошва: стабильная опора
- Для: приседаний, рывка, толчка, жима стоя
- Не для: становой тяги (большинство тянет в плоской обуви)

**Кистевые бинты:**
- Поддержка запястий при жимах
- Жёсткие: пауэрлифтинг (50-80 см)
- Мягкие: общие тренировки (30-50 см)
- Не затягивай слишком сильно — онемение = слишком туго

**Наколенники/бинты:**
- Наколенники (неопрен 5-7 мм): тепло + лёгкая поддержка
- Бинты: компрессия + «пружина» снизу (добавляют 5-15% к приседу)
- Используй на тяжёлых подходах, не на лёгких

**Лямки для тяги:**
- Когда хват лимитирует тягу/тяги
- Виды: петли, крюки, figure-8
- Используй НЕ на каждой тренировке — хват тоже нужно тренировать

**Магнезия (мел):**
- Убирает влагу с ладоней → лучший хват
- Жидкая магнезия: для залов без мела
- Спрей: альтернатива
- Обязательна для: становой тяги, подтягиваний, тяжёлоатлетических движений
`;
}
export function getChestAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия груди', 'анатомия грудных', 'мышцы груди подробн', 'строение грудных мышц', 'головки грудных', 'верх низ середина груди'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🫁 АНАТОМИЯ ГРУДНЫХ МЫШЦ — ГЛУБОКИЙ РАЗБОР:

**Большая грудная мышца (Pectoralis Major):**
- Ключичная головка (верхняя часть): начало — медиальная часть ключицы
  - Лучшие упражнения: жим на наклонной 30-45°, разводка на наклонной
  - Движение: сгибание и горизонтальное приведение плеча
- Грудинно-рёберная головка (средняя): начало — грудина и рёбра
  - Лучшие упражнения: жим лёжа, сведение в кроссовере
  - Движение: горизонтальное приведение
- Брюшная головка (нижняя): начало — апоневроз прямой мышцы живота
  - Лучшие упражнения: отжимания на брусьях, жим на отрицательной
  - Движение: разгибание из согнутого положения

**Малая грудная мышца (Pectoralis Minor):**
- Под большой грудной
- Функция: протракция и депрессия лопатки
- Часто укорочена → «сутулость»
- Растяжка: дверной проём, рука на стене

**Принципы полного развития:**
- Наклон 30°: акцент верх (ключичная головка)
- Горизонтальный жим: средняя часть
- Отрицательный наклон / брусья: нижняя часть
- Разводки: растяжка + медиальная часть
- Кроссовер: пиковое сокращение

**Частые ошибки:**
- Игнорирование верхней части → плоская грудь сверху
- Слишком тяжёлые веса → работают передние дельты
- Неполная амплитуда → недостаточная стимуляция
`;
}
export function getBackAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия спины', 'мышцы спины подробн', 'строение мышц спины', 'широчайши анатомия', 'трапеци анатомия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔙 АНАТОМИЯ МЫШЦ СПИНЫ — ГЛУБОКИЙ РАЗБОР:

**Широчайшие мышцы спины (Latissimus Dorsi):**
- Самая крупная мышца верхней части тела
- Функция: приведение, разгибание, внутренняя ротация плеча
- Лучшие упражнения: подтягивания, тяга верхнего блока, тяга штанги
- Широкий хват → акцент на ширину
- Узкий хват → акцент на толщину + нижние волокна

**Трапециевидная мышца (Trapezius):**
- Верхние волокна: поднимание плеч → шраги
- Средние волокна: сведение лопаток → тяга к поясу, face pulls
- Нижние волокна: депрессия лопаток → тяга на блоке сверху

**Ромбовидные (Rhomboids):**
- Под трапецией, между лопатками
- Функция: ретракция (сведение) лопаток
- Упражнения: тяга к поясу с акцентом на лопатки

**Большая и малая круглые (Teres Major/Minor):**
- Рядом с широчайшими
- Функция: приведение и внутренняя (большая) / внешняя (малая) ротация
- Упражнения: пуловер, тяга одной рукой

**Разгибатели позвоночника (Erector Spinae):**
- Длинная мышца вдоль позвоночника
- Функция: разгибание спины, стабилизация
- Упражнения: гиперэкстензия, становая тяга, good morning

**Полное развитие спины:**
- Вертикальные тяги → ширина (широчайшие)
- Горизонтальные тяги → толщина (ромбовидные, средние трапеции)
- Разгибания → низ спины (разгибатели)
- Шраги → верхние трапеции
`;
}
export function getArmAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия рук', 'бицепс анатомия', 'трицепс анатомия', 'строение мышц рук', 'головки бицепса', 'головки трицепса'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 АНАТОМИЯ МЫШЦ РУК — ГЛУБОКИЙ РАЗБОР:

**БИЦЕПС (Biceps Brachii):**
- Длинная головка (внешняя): начало — надсуставной бугорок
  - Акцент: узкий хват, сгибания на наклонной скамье
  - Отвечает за «пик» бицепса
- Короткая головка (внутренняя): начало — клювовидный отросток
  - Акцент: широкий хват, сгибания Скотта
  - Отвечает за «толщину»
- Брахиалис: под бицепсом, «выталкивает» бицепс вверх
  - Акцент: молотковые сгибания, обратный хват
- Брахиорадиалис: предплечье → локоть
  - Акцент: молотковые сгибания, обратные сгибания

**ТРИЦЕПС (Triceps Brachii):**
- Длинная головка: начало — подсуставной бугорок лопатки
  - Единственная двусуставная головка
  - Акцент: французский жим, разгибания за головой
  - Самая крупная → наибольший потенциал роста
- Латеральная головка: начало — задняя поверхность плечевой кости
  - Акцент: разгибания на блоке, жим узким хватом
  - Отвечает за «подкову» трицепса
- Медиальная головка: глубокая, под двумя другими
  - Активна во ВСЕХ разгибаниях
  - Акцент: обратный хват на блоке

**Принципы полного развития рук:**
- Трицепс = 2/3 объёма руки → уделяй больше внимания
- Бицепс: 2-3 упражнения, разные хваты
- Трицепс: 2-3 упражнения, акцент на длинную головку
- Брахиалис: не забывай молотковые сгибания
- Суперсеты бицепс/трицепс: эффективны для пампа
`;
}
export function getLegAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия ног', 'квадрицепс анатомия', 'задняя поверхность бедра анатомия', 'строение мышц ног', 'головки квадрицепс'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦵 АНАТОМИЯ МЫШЦ НОГ — ГЛУБОКИЙ РАЗБОР:

**КВАДРИЦЕПС (4 головки):**
- Прямая мышца бедра (Rectus Femoris): двусуставная
  - Акцент: разгибания ног, выпрямленное бедро при приседе
- Латеральная широкая (Vastus Lateralis): внешняя часть бедра
  - Акцент: приседания с широкой постановкой
- Медиальная широкая (Vastus Medialis, VMO): «капля» над коленом
  - Акцент: приседания до полной глубины, разгибания
  - Критична для стабильности колена
- Промежуточная широкая (Vastus Intermedius): под прямой
  - Активна во всех разгибаниях

**ЗАДНЯЯ ПОВЕРХНОСТЬ БЕДРА (Hamstrings):**
- Бицепс бедра (длинная + короткая головки): внешняя часть
  - Акцент: сгибание ног лёжа, румынская тяга
- Полусухожильная: внутренняя часть
- Полуперепончатая: внутренняя часть, глубокая
  - Акцент: сгибание ног сидя
- Двусуставные: работают на разгибание бедра + сгибание колена
- Нужны ОБА типа упражнений для полного развития

**ПРИВОДЯЩИЕ (Adductors):**
- 5 мышц: большая, длинная, короткая приводящие + гребешковая + тонкая
- Функция: приведение бедра
- Упражнения: приседания сумо, приводящая машина
- Часто слабое звено → травмы паха

**Полное развитие ног:**
- Приседания: все головки квадрицепса + ягодичные
- Жим ногами: квадрицепс (разная постановка стоп)
- Румынская тяга: задняя поверхность (разгибание бедра)
- Сгибание ног: задняя поверхность (сгибание колена)
- Приводящая: приводящие мышцы
`;
}
export function getGluteAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия ягодиц', 'ягодичн мышц анатомия', 'строение ягодиц', 'большая ягодичная', 'средняя ягодичная', 'активация ягодиц'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🍑 АНАТОМИЯ ЯГОДИЧНЫХ МЫШЦ — ГЛУБОКИЙ РАЗБОР:

**Большая ягодичная (Gluteus Maximus):**
- Самая крупная мышца тела
- Функция: разгибание бедра, наружная ротация
- Верхние волокна: отведение
- Нижние волокна: приведение
- Лучшие упражнения: ягодичный мостик, хип-траст, приседания, становая тяга
- Максимальная активация: хип-траст > приседания > выпады

**Средняя ягодичная (Gluteus Medius):**
- Сбоку от таза, под большой ягодичной
- Функция: отведение бедра, стабилизация таза при ходьбе
- Передние волокна: внутренняя ротация
- Задние волокна: наружная ротация
- Упражнения: боковые шаги с резинкой, отведение ноги, clamshells
- Критична для предотвращения травм коленей

**Малая ягодичная (Gluteus Minimus):**
- Под средней ягодичной
- Функция: отведение + внутренняя ротация бедра
- Работает вместе со средней ягодичной
- Стабилизация таза при ходьбе/беге

**Активация ягодичных (если «не чувствуешь»):**
1. Разминочные активации перед тренировкой:
   - Ягодичный мостик без веса: 2 × 15
   - Clamshells с резинкой: 2 × 12
   - Fire hydrant: 2 × 10
2. Mind-muscle connection: сознательное сжатие в пике
3. Паузы в верхней точке: 2-3 сек
4. Медленный темп: 3-1-2 (3 сек вверх, пауза, 2 вниз)

**Полная программа ягодичных:**
- Хип-траст: 4 × 10 (основное)
- Приседания (глубокие): 3 × 8 (мультисуставное)
- Румынская тяга: 3 × 10 (растяжение)
- Выпады в шаге: 3 × 10 (унилатеральное)
- Отведение с резинкой: 3 × 15 (средняя ягодичная)
`;
}
export function getCoreAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия кора', 'анатомия пресса', 'мышцы кора подробн', 'строение мышц живота', 'прямая мышца живота', 'косые мышцы анатомия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🎯 АНАТОМИЯ МЫШЦ КОРА — ГЛУБОКИЙ РАЗБОР:

**Прямая мышца живота (Rectus Abdominis):**
- «Кубики пресса» — одна мышца с сухожильными перемычками
- Функция: сгибание позвоночника
- Верхняя часть: скручивания, ситапы
- Нижняя часть: подъём ног, обратные скручивания
- 6 или 8 кубиков определяется генетикой
- Видимость = низкий % жира (10-12% муж, 16-20% жен)

**Наружные косые (External Obliques):**
- Боковые мышцы живота
- Функция: ротация в противоположную сторону, боковое сгибание
- Упражнения: скручивания с поворотом, боковая планка, woodchop

**Внутренние косые (Internal Obliques):**
- Под наружными, волокна в противоположном направлении
- Функция: ротация в свою сторону, стабилизация
- Работают с наружными косыми как антагонисты

**Поперечная мышца живота (Transversus Abdominis):**
- Самый глубокий слой, «природный корсет»
- Функция: внутрибрюшное давление, стабилизация
- Активация: vacuum (втягивание живота), dead bug
- Критична для защиты поясницы

**Многораздельные (Multifidus) + разгибатели:**
- Задняя часть кора
- Стабилизация позвоночника
- Упражнения: bird dog, superman, гиперэкстензия

**Диафрагма + тазовое дно:**
- «Крышка» и «дно» кора
- Дыхание Вальсальвы: диафрагма + пресс = стабильность
- Тренировка тазового дна: упражнения Кегеля

**Тренировка кора правильно:**
- Антисгибание: планка, ab wheel
- Антиротация: Pallof press, планка с касанием
- Антибоковое сгибание: farmer's walk, боковая планка
- Сгибание: скручивания (дозированно)
`;
}
export function getForearmAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия предплечий', 'мышцы предплечья подробн', 'строение предплечий', 'разгибатели запястья анатомия', 'сгибатели запястья анатомия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 АНАТОМИЯ ПРЕДПЛЕЧИЙ — ГЛУБОКИЙ РАЗБОР:

**Сгибатели запястья (передняя группа):**
- Лучевой сгибатель запястья
- Локтевой сгибатель запястья
- Поверхностный сгибатель пальцев
- Глубокий сгибатель пальцев
- Функция: сгибание запястья, сжатие кулака
- Упражнения: сгибание запястья со штангой, wrist curls

**Разгибатели запястья (задняя группа):**
- Длинный/короткий лучевой разгибатель
- Локтевой разгибатель запястья
- Разгибатель пальцев
- Функция: разгибание запястья, раскрытие кисти
- Упражнения: обратные сгибания запястья, reverse wrist curls

**Брахиорадиалис:**
- Самая крупная мышца предплечья (визуально)
- Функция: сгибание локтя в нейтральном хвате
- Упражнения: молотковые сгибания, обратные сгибания

**Пронатор / Супинатор:**
- Пронатор круглый: разворот ладони вниз
- Супинатор: разворот ладони вверх
- Упражнения: вращение с гантелью, пронация/супинация

**Полная программа предплечий:**
- Сгибание запястья: 3 × 15 (сгибатели)
- Обратное сгибание: 3 × 15 (разгибатели)
- Молотковые сгибания: 3 × 10 (брахиорадиалис)
- Удержание штанги (fat grip): 3 × 30 сек (хват)
- Вращение с гантелью: 3 × 10 (ротаторы)
- Эспандер кистевой: 3 × 15

**«Теннисный локоть» и профилактика:**
- Причина: перегрузка разгибателей
- Профилактика: баланс сгибателей/разгибателей
- Лечение: эксцентрические разгибания запястья
`;
}
export function getCalfAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия икр', 'мышцы голени подробн', 'строение икроножных', 'камбаловидн мышц', 'икроножн анатомия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦶 АНАТОМИЯ МЫШЦ ГОЛЕНИ — ГЛУБОКИЙ РАЗБОР:

**Икроножная мышца (Gastrocnemius):**
- Двуглавая: медиальная + латеральная головки
- Двусуставная: пересекает колено и голеностоп
- Функция: подошвенное сгибание стопы (подъём на носки)
- Максимально активна при ПРЯМЫХ коленях
- Упражнения: подъём на носки стоя, donkey calf raise

**Камбаловидная мышца (Soleus):**
- Под икроножной, односуставная
- Функция: подошвенное сгибание стопы
- Максимально активна при СОГНУТЫХ коленях
- Упражнения: подъём на носки сидя
- 80% медленных волокон → высокий диапазон повторений (15-25)

**Передняя большеберцовая (Tibialis Anterior):**
- Передняя часть голени
- Функция: дорсифлексия (подъём стопы вверх)
- Упражнения: подъём стопы с весом, ходьба на пятках
- Важна для: профилактики shin splints

**Малоберцовые мышцы (Peroneus):**
- Боковая часть голени
- Функция: эверсия стопы (наружу)
- Стабилизация голеностопа

**Программа полного развития голени:**
- Подъём на носки стоя: 4 × 12-15 (икроножная)
- Подъём на носки сидя: 4 × 15-20 (камбаловидная)
- Подъём стопы (tibialis raise): 3 × 15 (передняя)
- Полная амплитуда: растяжение внизу + пауза вверху 1-2 сек

**Почему икры «не растут»:**
- Генетика: длинное/короткое сухожилие (не изменить)
- Недостаточный объём: икры выносливые, нужно 12-20 подходов/нед
- Неполная амплитуда: обязательно полное растяжение
- Читинг: отбив внизу вместо контролируемого движения
- Решение: 4 тренировки икр/нед, полная амплитуда, пауза вверху
`;
}
export function getRussianFitnessCulture(message: string): string {
  const triggers = ['российск фитнес', 'фитнес в россии', 'советск спорт', 'гто', 'дворов спорт', 'российск тренер', 'фитнес культур росси'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🇷🇺 ФИТНЕС-КУЛЬТУРА РОССИИ — ОБЗОР:

**Историческое наследие:**
- Советская спортивная школа: системный подход к физкультуре
- ГТО (Готов к труду и обороне): с 1931, возрождён в 2014
  - Нормативы по возрастам: бег, подтягивания, отжимания и др.
  - 6 возрастных ступеней, золото/серебро/бронза
- Спартакиады: массовые соревнования
- ДЮСШ: детско-юношеские спортивные школы

**Современные тренды в РФ:**
- Сетевые фитнес-клубы: World Class, X-Fit, Alex Fitness, DDX
- Crossfit / функциональный тренинг: очень популярен
- Воркаут-движение: площадки в каждом дворе
- Пауэрлифтинг: Россия — одна из сильнейших стран мира
- Гиревой спорт: исторически российский вид
- Бег: массовые забеги (Московский марафон, Белые ночи)

**Знаковые российские атлеты:**
- Юрий Власов, Василий Алексеев — легенды тяжёлой атлетики
- Андрей Маланичев — пауэрлифтинг
- Денис Цыпленков — армрестлинг
- Дмитрий Клоков — тяжёлая атлетика, фитнес-инфлюенсер

**Российские особенности тренировок:**
- Акцент на базовые упражнения (штанга, гири)
- Менее популярны: машины и тренажёры как основа
- Культура гиревого спорта: уникальна для РФ
- Зимние виды: лыжи, хоккей — национальные виды
- Дворовый спорт: турники, брусья в каждом дворе

**ГТО — нормативы (мужчины 18-24):**
- Бег 100м: золото <13.5 сек
- Бег 3 км: золото <12:30
- Подтягивания: золото ≥15
- Наклон: золото — касание пола ладонями
- Рывок гири 16 кг: золото ≥43 раза
`;
}
export function getBodyRecompScience(message: string): string {
  const triggers = ['рекомпозици тела наук', 'одновременн набор и сушк', 'рекомп подробн', 'можно ли одновременно', 'сжигать жир и набирать мышц'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔬 РЕКОМПОЗИЦИЯ ТЕЛА — НАУКА:

**Что такое рекомпозиция:**
- Одновременное наращивание мышц + сжигание жира
- Вес тела может не меняться, но состав меняется
- Ранее считалось невозможным, сейчас — доказано в определённых условиях

**Кому подходит рекомпозиция (идеальные кандидаты):**
1. Новички: первые 6-12 месяцев тренировок
2. После долгого перерыва: muscle memory эффект
3. Лица с высоким % жира (>20% муж, >30% жен)
4. Атлеты на стероидах (не рекомендуем)
5. Детренированные с мышечной базой

**Кому НЕ подходит:**
- Опытные атлеты с низким % жира: нужны чёткие фазы
- Сухие атлеты: невозможно одновременно

**Протокол рекомпозиции:**
- Калории: TDEE или лёгкий дефицит (-100-200)
- Белок: 2.2-2.6 г/кг (критически высокий)
- Углеводный цикл: +200-300 в тренировочные дни, -200-300 в дни отдыха
- Тренировки: 3-4 силовых/нед, прогрессивная перегрузка
- Кардио: 2-3 × 20-30 мин LISS (не чрезмерно)

**Скорость рекомпозиции:**
- Новичок: ~1 кг мышц + ~2 кг жира/мес (первые месяцы)
- Средний уровень: ~0.3-0.5 кг мышц + ~1 кг жира/мес
- Результат: через 3-6 месяцев — заметная трансформация

**Отслеживание прогресса:**
- Вес — плохой индикатор (может не меняться!)
- Замеры тела: талия, бёдра, руки, грудь
- Фото: каждые 2 недели, одинаковые условия
- Калипер или DEXA: % жира
- Рабочие веса: растут = мышцы растут
`;
}
export function getMindMuscleConnectionScience(message: string): string {
  const triggers = ['нейромышечн связь наука', 'mind muscle connection', 'ментальн связь с мышц', 'чувствовать мышцу работа', 'как научиться чувствовать мышц', 'нейромышечн контроль'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[НЕЙРОМЫШЕЧНАЯ СВЯЗЬ (MIND-MUSCLE CONNECTION) — НАУКА]
Внутренний фокус внимания (на целевой мышце) vs внешний (на движении/результате).

НЕЙРОФИЗИОЛОГИЯ:
- Моторная кора → пирамидный тракт → α-мотонейроны → мышечные волокна
- Ментальный фокус на мышце: ↑ ЭМГ-активность целевой мышцы на 20-30% (Calatayud 2016)
- Механизм: ↑ рекрутирование моторных единиц целевой мышцы, ↓ синергистов
- Работает до ~60% 1ПМ. При >80% 1ПМ — внешний фокус эффективнее (Schoenfeld 2018)

ИССЛЕДОВАНИЯ:
- Schoenfeld & Contreras (2016): внутренний фокус на бицепсе при сгибаниях ↑ рост бицепса на 12.4% vs внешний фокус за 8 недель
- Calatayud et al. (2016): вербальные инструкции «сожми грудные» ↑ ЭМГ pectoralis major на 22%
- Wulf (2013): для навыковых движений (спорт) внешний фокус лучше для координации

ПРАКТИЧЕСКОЕ ПРИМЕНЕНИЕ:
Гипертрофия (изоляция, <60% 1ПМ): ВНУТРЕННИЙ фокус — думай о целевой мышце
Сила (базовые, >80% 1ПМ): ВНЕШНИЙ фокус — думай о движении снаряда
Техника (обучение): ВНЕШНИЙ фокус — «толкай пол» вместо «напрягай квадрицепс»

ТРЕНИРОВКА MMC:
1. Изометрическое сокращение: напрягай целевую мышцу без веса 5×5с → учись «включать»
2. Лёгкие веса с паузами: 2-3с пауза в пиковом сокращении, фокус на ощущении
3. Односторонние упражнения: легче сосредоточиться на одной стороне
4. Касание мышцы: свободной рукой трогай целевую мышцу (тактильная обратная связь)
5. Медленный темп: 3-4с эксцентрика → больше времени для ментального фокуса
6. Предутомление: изоляция → база (пек-дек → жим лёжа) — мышца уже «включена»
`;
}
export function getPreExhaustionScience(message: string): string {
  const triggers = ['предутомлени метод', 'pre-exhaust', 'изоляция перед базой', 'предутомлен наука', 'предварительн утомлен'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[МЕТОД ПРЕДУТОМЛЕНИЯ (PRE-EXHAUSTION) — НАУКА]
Предутомление = изолирующее упражнение перед базовым для той же мышечной группы.
Пример: разведения гантелей → жим лёжа (грудные уже утомлены → ↑ ощущение работы в жиме)

ТЕОРИЯ (КЛАССИЧЕСКАЯ):
- Целевая мышца утомлена → в базовом движении она «ломается» первой → ↑ стимул именно для неё
- Синергисты (трицепс в жиме) свежие → берут на себя стабилизацию
- ↑ нейромышечная связь с целевой мышцей (MMC)

ЧТО ГОВОРИТ НАУКА (неожиданно):
- Gentil et al. (2007): предутомление СНИЖАЕТ ЭМГ-активность целевой мышцы в базовом упражнении
- Augustsson et al. (2003): разгибания → жим ногами: ↓ активность квадрицепса на 14%
- Причина: утомлённая мышца генерирует меньше силы → организм компенсирует СИНЕРГИСТАМИ

НО! ПРАКТИЧЕСКАЯ ЦЕННОСТЬ ЕСТЬ:
- ↑ субъективное ощущение работы целевой мышцы (важно для гипертрофии)
- ↑ общий объём на целевую мышцу за тренировку
- ↑ метаболический стресс → дополнительный стимул роста
- Полезно для «упрямых» мышечных групп, которые плохо чувствуются в базовых

КОГДА ИСПОЛЬЗОВАТЬ:
✅ Грудные плохо чувствуются в жиме лёжа → пек-дек перед жимом
✅ Квадрицепс не работает в приседаниях → разгибания перед приседаниями
✅ Широчайшие не чувствуются в тяге → пуловер перед тягой

КОГДА НЕ ИСПОЛЬЗОВАТЬ:
❌ Если приоритет — сила (↓ рабочий вес в базовом на 15-25%)
❌ Если техника базового нестабильна (утомление → ↓ контроль)
❌ Новичкам (сначала научиться чувствовать мышцу без предутомления)
`;
}
export function getBetaAlanineDeepScience(message: string): string {
  const triggers = ['бета аланин наука', 'beta alanine', 'карнозин мышцы', 'бета аланин эффект', 'покалывание от бета аланин', 'парестезия добавк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[БЕТА-АЛАНИН — НАУКА И ПРАКТИКА]
Бета-аланин → ↑ карнозин в мышцах → буфер H+ (кислотности) → ↓ утомление при высокоинтенсивной работе.

БИОХИМИЯ:
- Карнозин = бета-аланин + гистидин (дипептид)
- Бета-аланин — лимитирующий фактор синтеза карнозина
- Карнозин: буфер pH в мышцах (↓ закисление → ↓ жжение → ↑ повторы)
- ↑ карнозин на 40-80% за 4-10 недель приёма бета-аланина

ДОКАЗАННЫЕ ЭФФЕКТЫ:
- ↑ производительность в нагрузках 1-4 минуты на 2-3% (Hobson 2012 мета-анализ)
- ↑ количество повторений в подходе при 60-80% 1ПМ на 1-3 повтора
- ↑ время до отказа при высокоинтенсивном кардио
- Наиболее эффективен: при подходах 60-240с (гребля, спринты 400-1500м, круговые тренировки)
- Менее эффективен: при подходах <60с (чистая сила, 1-5 повторов) или >4 мин (аэробная зона)

ДОЗИРОВКА:
- 3.2-6.4 г/день, разделить на 2-4 приёма (↓ парестезия)
- Накопительный эффект: 2-4 недели до ощутимого результата
- Приём: ежедневно, включая дни отдыха (накопление карнозина)
- Время приёма: не важно (карнозин накапливается в мышцах)
- Форма: sustained-release (медленное высвобождение) → ↓ покалывание

ПАРЕСТЕЗИЯ (покалывание):
- Безвредно! Активация MRGPRD рецепторов в коже
- ↓ при приёме с едой, разделении дозы, sustained-release формы
- Длится 15-30 мин, локализация: лицо, руки, уши

СИНЕРГИЯ: бета-аланин + креатин → ↑↑ эффект (буфер кислотности + ресинтез АТФ)
`;
}
export function getConjugateMethodGuide(message: string): string {
  const triggers = ['сопряжённый метод', 'conjugate method', 'westside barbell', 'вестсайд метод', 'луи симмонс метод', 'max effort dynamic effort'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[СОПРЯЖЁННЫЙ МЕТОД (CONJUGATE / WESTSIDE BARBELL)]
Создатель: Луи Симмонс (Westside Barbell). Основа: одновременное развитие всех качеств через вариативность.

СТРУКТУРА НЕДЕЛИ (классическая):
Понедельник — Max Effort Upper (максимальное усилие, верх):
- 1 основное упражнение: работа до 1-3ПМ (менять упражнение каждые 1-3 недели!)
- Пример: жим с пола → жим с цепями → жим с досок → жим с бруска
- 3-4 вспомогательных упражнения для слабых мест

Среда — Max Effort Lower (максимальное усилие, низ):
- 1 основное: работа до 1-3ПМ (box squat, good morning, rack pull, deficit deadlift)
- 3-4 вспомогательных: GHR, обратная гиперэкстензия, пресс

Пятница — Dynamic Effort Upper (скоростной день, верх):
- Жим лёжа: 8-10×3 при 50-60% 1ПМ + accommodating resistance (цепи/ленты)
- Скорость штанги >0.8 м/с, отдых 30-60с
- 3-4 вспомогательных

Воскресенье — Dynamic Effort Lower (скоростной день, низ):
- Box squat: 10-12×2 при 50-60% + цепи/ленты
- Тяга: 6-8×1 при 60-70% (скорость!)
- 3-4 вспомогательных

КЛЮЧЕВЫЕ ПРИНЦИПЫ:
1. Ротация упражнений: основное упражнение меняется каждые 1-3 недели (↓ аккомодация)
2. Accommodating resistance: цепи и резиновые ленты → ↑ нагрузка в верхней точке
3. Слабые звенья: вспомогательные упражнения нацелены на слабые точки лифтов
4. Повторный метод (RE): вспомогательные упражнения в 3-4×8-15 для гипертрофии

⚠️ Требует опыт 2+ лет, знание своих слабых мест, доступ к цепям/лентам
`;
}
export function getRotatorCuffProtocol(message: string): string {
  const triggers = ['ротаторная манжета', 'вращательн манжет', 'rotator cuff', 'надостная мышца', 'подостная мышца', 'вращатели плеча тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[РОТАТОРНАЯ МАНЖЕТА — ПРОФИЛАКТИКА И УКРЕПЛЕНИЕ]
4 мышцы ротаторной манжеты: надостная (supraspinatus), подостная (infraspinatus), малая круглая (teres minor), подлопаточная (subscapularis).

ФУНКЦИИ:
- Динамическая стабилизация головки плечевой кости в суставной впадине
- Центрация: удержание головки по центру при движениях
- Ротация: внешняя (infraspinatus, teres minor) и внутренняя (subscapularis)

ПОЧЕМУ АТЛЕТЫ ТРАВМИРУЮТ:
- Дисбаланс: много жимов (внутренняя ротация) vs мало тяг (внешняя ротация)
- Оптимальное соотношение ER/IR: 66-75% (внешняя ротация = 66-75% силы внутренней)
- У жимовиков: часто 50-55% → ↑ риск импинджмента

ПРОТОКОЛ УКРЕПЛЕНИЯ:
Разминка (перед КАЖДОЙ тренировкой верха):
1. Band pull-aparts: 2×20 (лёгкая резинка)
2. External rotation с резинкой (локоть прижат к телу): 2×15
3. Band dislocates: 2×10

Укрепление (2-3 раза/неделю):
1. Side-lying external rotation: 3×15 (1-3кг гантель)
2. Prone Y-T-W raises: 2×10 каждая позиция
3. Full can raises (подъём с большим пальцем вверх, НЕ пустая банка): 3×12
4. Face pulls с внешней ротацией: 3×15-20
5. Serratus wall slides: 3×10

ДОЗИРОВКА:
- Вес: ЛЁГКИЙ (1-3кг). Ротаторная манжета — маленькие мышцы, не нужны большие веса
- Темп: медленный, контролируемый (3с концентрика, 3с эксцентрика)
- Частота: 3-4 раза/неделю для профилактики
- Общее время: 5-8 минут — встраивается в разминку

ПРАВИЛО: на каждые 2 подхода жимов — 3 подхода тяг и 1 подход внешней ротации
`;
}
export function getPosturalCorrectionGuide(message: string): string {
  const triggers = ['коррекция осанк', 'исправить осанк', 'сутулость исправить', 'верхний перекрёстный синдром', 'нижний перекрёстный', 'осанка тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[КОРРЕКЦИЯ ОСАНКИ ДЛЯ АТЛЕТОВ]
2 основных постуральных дисбаланса (Janda):

ВЕРХНИЙ ПЕРЕКРЁСТНЫЙ СИНДРОМ:
Укорочены: верхняя трапеция, поднимающая лопатку, грудные, подзатылочные
Ослаблены: глубокие сгибатели шеи, нижняя/средняя трапеция, ромбовидные, серратус
Результат: голова вперёд, округлённые плечи, ↑ грудной кифоз

Коррекция — УКРЕПЛЯТЬ:
1. Chin tucks (подбородок к себе): 3×10, удержание 5с — глубокие сгибатели шеи
2. Face pulls с внешней ротацией: 3×15-20 — средняя/нижняя трапеция
3. Prone Y-raises: 3×12 — нижняя трапеция
4. Serratus push-ups: 3×12 — передняя зубчатая
5. Band pull-aparts: 3×20 — ромбовидные, задние дельты

Коррекция — РАСТЯГИВАТЬ:
1. Pec stretch в дверном проёме: 3×30с
2. Upper trap stretch (ухо к плечу): 3×30с каждая сторона
3. Suboccipital release: мяч для лакросса под основание черепа, 2 мин

НИЖНИЙ ПЕРЕКРЁСТНЫЙ СИНДРОМ:
Укорочены: сгибатели бедра (psoas), разгибатели поясницы
Ослаблены: ягодичные, пресс (глубокий — transversus abdominis)
Результат: передний наклон таза (anterior pelvic tilt), ↑ поясничный лордоз

Коррекция — УКРЕПЛЯТЬ:
1. Glute bridge / hip thrust: 3×12-15 с паузой вверху — активация ягодичных
2. Dead bug: 3×8 каждая сторона — глубокие мышцы кора
3. Posterior pelvic tilt (подкручивание таза): лёжа, прижать поясницу к полу 3×10
4. RKC plank: 3×20с с максимальным напряжением ягодичных и пресса

Коррекция — РАСТЯГИВАТЬ:
1. Couch stretch / half-kneeling hip flexor: 3×30с — psoas
2. Foam roller на поясницу (без давления на позвонки): 60с

СКОЛЬКО НУЖНО ВРЕМЕНИ: 4-8 недель при ежедневных 10-15 минутах. Ключ — ПОСТОЯНСТВО.
`;
}
export function getHingePatternScience(message: string): string {
  const triggers = ['тазобедренное сгибание', 'hinge pattern', 'шарнирное движение', 'румынская тяга техника', 'гудморнинг техника'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🏋️ ПАТТЕРН HIP HINGE (ТАЗОБЕДРЕННОЕ СГИБАНИЕ):

ЧТО ТАКОЕ HIP HINGE:
Движение, где основное сгибание происходит в тазобедренном суставе, а не в коленях или пояснице. Ключевой паттерн для: становой тяги, румынской тяги, гудморнинга, свингов, тяги с пола.

БИОМЕХАНИКА:
- Основные движители: ягодичные (разгибание ТБС), подколенные сухожилия (разгибание ТБС + сгибание колена), разгибатели спины (стабилизация).
- Момент на поясницу: пропорционален длине торса × cos(угол наклона). Чем длиннее торс, тем важнее контроль нагрузки.
- Колени: мягко согнуты (15-25°), НЕ прямые. Прямые колени = перенапряжение подколенных сухожилий.

КАК НАУЧИТЬСЯ HINGE (прогрессия):
1. Стена: встать спиной к стене (30 см), сгибать бёдра назад до касания стены ягодицами. Колени минимально сгибаются.
2. Палка вдоль спины: 3 точки контакта (затылок, грудной отдел, крестец). Наклон с сохранением контакта.
3. Румынская тяга с палкой/пустым грифом: фокус на «отталкивании бёдер назад».
4. Румынская тяга с нагрузкой.
5. Становая тяга с пола.

УПРАЖНЕНИЯ HINGE-ПАТТЕРНА:
1. Румынская тяга (RDL): гриф скользит по бёдрам, максимальное растяжение подколенных. Амплитуда до уровня середины голени.
2. Гудморнинг: штанга на спине, наклон вперёд. Изометрическая работа разгибателей. Средний-продвинутый уровень.
3. Тяга на прямых ногах (SLDL): похожа на RDL, но колени прямее, гриф дальше от тела. Больше нагрузка на поясницу — осторожно.
4. Гиперэкстензия / обратная гиперэкстензия: разгибание ТБС в тренажёре. Отличное упражнение для реабилитации поясницы.
5. Свинг гири: динамический hinge, тренировка взрывной силы. Разгибание ТБС генерирует силу, руки = маятник.
6. Румынская тяга на одной ноге: максимальная активация средней ягодичной + баланс.

ОШИБКИ:
1. Сгибание поясницы вместо ТБС — ГЛАВНАЯ ошибка. Позвоночник нейтрален всегда.
2. Слишком далеко гриф от тела — увеличение момента на поясницу. Гриф «скользит» по бёдрам.
3. Переразгибание в локауте — гиперлордоз поясницы вместо сжатия ягодичных.
4. Начало движения с коленей (приседание вместо hinge).

ОБЪЁМ И ЧАСТОТА:
- Hinge — тяжёлый паттерн. 2-3 упражнения в неделю, 8-15 общих подходов.
- Тяжёлая работа (становая): 1 раз/нед. Лёгкая (RDL, гиперэкстензия): 2 раза/нед.
`;
}
export function getCarryLoadedMovement(message: string): string {
  const triggers = ['перенос тяжест', 'farmer walk', 'фермерская прогулка', 'loaded carry', 'нести гантели', 'кор стабилизац'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🏋️ LOADED CARRIES (ПЕРЕНОС ТЯЖЕСТЕЙ) — НАУКА:

ПОЧЕМУ ЭТО ВАЖНО:
Dan John: «Если бы я мог добавить одно упражнение к программе каждого человека, это были бы фермерские прогулки.»
- Тренировка ВСЕГО тела: хват, трапеция, кор, ноги, кардио — одновременно.
- Функциональность: перенос тяжёлых предметов — базовое движение человека.
- Антиротация и антилатерофлексия: мышцы кора работают изометрически, предотвращая нежелательное движение позвоночника. Это ТО, для чего кор предназначен.

ВИДЫ ПЕРЕНОСОВ:
1. Фермерская прогулка (Farmer's Walk): по гантели/гире в каждой руке. Самый базовый. Нагрузка: 50-75% веса тела в каждой руке (для продвинутых).
2. Чемоданная прогулка (Suitcase Carry): одна гантель/гиря в одной руке. Мощнейшее антилатерофлексионное упражнение. Активация квадратной мышцы поясницы и косых — рекордная.
3. Кубковый перенос (Goblet Carry): гиря/гантель у груди. Передняя загрузка — антифлексия кора.
4. Overhead Carry: одна или две руки над головой. Стабилизация плеча + кор. Требует хорошей подвижности плеч.
5. Waiter's Walk: одна рука над головой, одна вдоль тела — комбинированная стабилизация.
6. Перенос мешка (Sandbag Carry): нестабильный объект. Максимальная активация стабилизаторов.
7. Yoke Walk: штанга на спине/специальная рама. Тяжелейшие веса. Стронгмен-базис.

БИОМЕХАНИКА:
- Вертикальная нагрузка через позвоночник → компрессия межпозвоночных дисков. Но: активная стабилизация мышцами кора снижает сдвиговые силы на 30-40% vs пассивного стояния с тем же весом.
- Хват: farmer's walk — один из лучших упражнений для силы хвата. Изометрическое удержание > динамического сжатия для развития хвата.
- Походка: шаг укорачивается, частота увеличивается. Это нормально при тяжёлом весе.

ПРОГРАММИРОВАНИЕ:
- Дистанция: 20-40 метров (или 30-60 секунд).
- Подходы: 3-5.
- Частота: 2-3 раза/неделю в конце тренировки.
- Прогрессия: вес → дистанция → время → скорость.
- Как финишер: 3×30 сек после основной тренировки.
- Как основное упражнение: 5×40 м с тяжёлым весом.

ИНТЕГРАЦИЯ В ПРОГРАММУ:
- День ног: farmer's walk или yoke walk.
- День верха: overhead carry или waiter's walk.
- День кора: suitcase carry + goblet carry (суперсет).
`;
}
export function getBodyImageDisorder(message: string): string {
  const triggers = ['расстройство образа тел', 'дисморфия тела спорт', 'body image disorder', 'бигорексия', 'ненависть к телу тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⚠️ РАССТРОЙСТВА ОБРАЗА ТЕЛА У СПОРТСМЕНОВ:

МЫШЕЧНАЯ ДИСМОРФИЯ (БИГОРЕКСИЯ):
- Что: постоянное ощущение «недостаточно мускулистый», несмотря на объективно развитое тело.
- Распространённость: до 10% серьёзно тренирующихся мужчин (Pope et al., 2005).
- Признаки:
  * Отказ от социальных событий ради тренировок/диеты.
  * Паника при пропуске тренировки.
  * Носить мешковатую одежду, чтобы скрыть «недостаточное» тело.
  * Часы перед зеркалом с негативной оценкой.
  * Использование ПАВ (стероидов) ради размеров.

РАССТРОЙСТВА ПИЩЕВОГО ПОВЕДЕНИЯ (РПП) В СПОРТЕ:
- RED-S (Relative Energy Deficiency in Sport): недостаточное потребление энергии → нарушение гормонов, костей, иммунитета, ментального здоровья.
- Женская триада: дефицит энергии → аменорея → остеопороз. Встречается у 15-25% спортсменок.
- Орторексия: навязчивое стремление к «правильному» питанию до степени нарушения жизни.
- Bulimia/Anorexia: серьёзные расстройства, требующие профессиональной помощи.

КРАСНЫЕ ФЛАГИ:
1. Ритуальное взвешивание 3+ раз/день с эмоциональной реакцией на цифры.
2. Исключение всё большего числа продуктов без медицинских показаний.
3. Тренировки как «наказание» за еду.
4. Страх «потерять форму» при одном пропуске.
5. Самооценка полностью зависит от внешнего вида / цифр на весах.
6. Социальная изоляция ради режима.

ЧТО ДЕЛАТЬ:
- Это НЕ слабость. Это расстройство, требующее помощи.
- Первый шаг: разговор с психологом/психотерапевтом, специализирующимся на спортивной психологии или РПП.
- В России: служба экстренной психологической помощи: 051 (с мобильного) или 8-495-051 (Москва).
- Линия помощи при РПП: благотворительные организации типа «Ассоциация РПП».

ЗДОРОВЫЙ ПОДХОД К ТЕЛУ:
- Тело — инструмент для ФУНКЦИИ (сила, выносливость, здоровье), не только для внешности.
- Прогресс измеряй по ДЕЛАМ (присед вырос, пробежал быстрее), а не только по зеркалу.
- Разнообразие «идеальных» тел: посмотри на олимпийцев разных видов. Нет единого стандарта.
- Соцсети: 90% «идеальных тел» — освещение + ракурс + фильтры + фарма. Не сравнивай.

ВАЖНО: Iron Coach — не замена профессиональной психологической помощи. При серьёзных проблемах с образом тела обратись к специалисту.
`;
}
export function getCryotherapyScience(message: string): string {
  const triggers = ['криотерапия спорт', 'холодная ванна мышцы', 'закаливание тренировк', 'ледяной душ восстановлен', 'крио восстановлен'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🧊 КРИОТЕРАПИЯ И ХОЛОДОВОЕ ВОЗДЕЙСТВИЕ:

**Механизмы действия:**
- Вазоконстрикция → уменьшение отёка и воспаления
- Снижение скорости нервной проводимости → обезболивание
- Активация бурого жира → повышение метаболизма
- Выброс норадреналина → бодрость, фокус, настроение

**Протоколы:**
- Холодный душ: 1-3 мин при 10-15°С, начинать с 30 сек
- Ледяная ванна: 10-15 мин при 10-15°С (классика)
- Криокамера: -110°С, 2-3 мин (профессиональный уровень)
- Контрастный душ: 1 мин холод → 2 мин тепло, 3-5 циклов, заканчивать холодом

**Когда применять:**
✅ В дни отдыха — максимальный эффект восстановления
✅ После соревнований / матчей
✅ При 2-х тренировках в день (между сессиями)
⚠️ НЕ сразу после силовой для гипертрофии! Холод подавляет mTOR-сигналинг

**Гипертрофия и холод — конфликт:**
- Воспаление после тренировки = сигнал к росту мышц
- Холод подавляет этот сигнал → меньше гипертрофия
- Решение: холод не ранее 4-6 часов после силовой
- Или: использовать холод только в дни без силовых

**Адаптация:**
- Начинай с 15°С по 30 сек, наращивай постепенно
- Дыхание: глубокий вдох носом, медленный выдох ртом
- Не прыгай сразу в ледяную воду — шок опасен
- 2-4 раза в неделю достаточно для адаптации
`;
}
export function getChronobiologyFitness(message: string): string {
  const triggers = ['хронотип тренировк', 'сова жаворонок спорт', 'когда лучше тренироваться утро вечер', 'биоритмы тренировк', 'циркадные ритмы спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⏰ ХРОНОБИОЛОГИЯ И ОПТИМАЛЬНОЕ ВРЕМЯ ТРЕНИРОВОК:

**Хронотипы:**
- Жаворонки (утренний тип): пик активности 8-12, засыпают рано
- Совы (вечерний тип): пик активности 16-22, засыпают поздно
- Промежуточный тип: большинство людей, гибкий ритм

**Физиология по времени суток:**
- 6-8 утра: кортизол максимален, тестостерон максимален, но температура тела ↓
- 10-12 дня: координация ↑, бдительность ↑, умеренная сила
- 14-16: время реакции оптимально, гибкость ↑
- 16-18: пик температуры тела → максимальная сила, мощность, скорость
- 18-20: выносливость ↑, болевой порог ↑
- 20-22: сила ↓, начало выработки мелатонина

**Рекомендации по хронотипу:**
Жаворонки:
- Силовые: 8-11 утра
- Кардио: 7-9 утра
- Разминка длиннее (тело холоднее утром)

Совы:
- Силовые: 16-19
- Кардио: 17-20
- Не заставляй себя тренироваться в 6 утра — неэффективно

**Адаптация к неудобному времени:**
- Организм адаптируется к любому времени за 2-3 недели
- Постоянство важнее "идеального" времени
- Разминка 10-15 мин компенсирует утреннюю "холодность"
- Кофеин за 30-40 мин до утренней тренировки помогает

**Ночные смены / нерегулярный график:**
- Тренируйся в одно и то же время относительно пробуждения
- Блокируй синий свет за 2 часа до сна
- Мелатонин при нерегулярном графике
- Не пропускай тренировки из-за "неидеального" времени — плохая тренировка лучше никакой
`;
}
export function getPrenatalFitnessGuide(message: string): string {
  const triggers = ['тренировки при беременност', 'фитнес беременным', 'prenatal fitness', 'упражнения для беременных', 'спорт при беременност'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🤰 ФИТНЕС ПРИ БЕРЕМЕННОСТИ:

⚠️ ОБЯЗАТЕЛЬНО консультация с врачом перед началом тренировок!

**Общие принципы:**
- Если тренировалась до беременности — можно продолжать (с модификациями)
- Если не тренировалась — начинать с лёгких нагрузок
- Не повышать интенсивность выше дородового уровня
- "Разговорный тест": должна мочь говорить во время упражнения

**По триместрам:**
1-й триместр (1-12 недель):
- Минимальные изменения если нет осложнений
- Избегать перегрева (не тренироваться в жару)
- Снизить интенсивность при тошноте/усталости

2-й триместр (13-26 недель):
- Исключить упражнения лёжа на спине после 16 недели
- Модифицировать приседания (широкая стойка)
- Укреплять мышцы тазового дна (упражнения Кегеля)
- Работать с умеренными весами

3-й триместр (27-40 недель):
- Фокус на ходьбу, плавание, лёгкую растяжку
- Дыхательные упражнения
- Укрепление спины (боль в пояснице)
- Избегать резких движений и прыжков

**Безопасные упражнения:**
✅ Ходьба, плавание, велотренажёр
✅ Йога для беременных (специализированная)
✅ Лёгкие силовые с гантелями
✅ Растяжка, мобильность, пилатес

**Абсолютные противопоказания:**
❌ Контактные виды спорта
❌ Упражнения с риском падения
❌ Подъём тяжестей с натуживанием (Вальсальва)
❌ Горячая йога, тренировки в жару
❌ Прыжки, резкие повороты
`;
}
export function getPostnatalReturnGuide(message: string): string {
  const triggers = ['тренировки после родов', 'вернуться в форму после родов', 'postnatal fitness', 'восстановление после родов спорт', 'фитнес после кесарев'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
👶 ВОЗВРАЩЕНИЕ К ТРЕНИРОВКАМ ПОСЛЕ РОДОВ:

⚠️ Получите разрешение врача (обычно 6 недель после ЕР, 8-12 после КС)

**Фаза 1 (0-6 недель): восстановление**
- Дыхание диафрагмой и упражнения Кегеля
- Короткие прогулки (10-15 мин)
- Нежная растяжка
- Никаких нагрузок на пресс!

**Фаза 2 (6-12 недель): лёгкие нагрузки**
- Ходьба 20-30 мин
- Bodyweight упражнения (приседания без веса, мосты)
- Активация глубоких мышц кора (НЕ скручивания!)
- Лёгкие гантели (2-5 кг)

**Фаза 3 (3-6 месяцев): постепенное возвращение**
- Силовые 2-3 раза в неделю
- Постепенное увеличение весов
- Кардио: быстрая ходьба, велотренажёр, плавание
- Проверка на диастаз прямых мышц живота

**Фаза 4 (6-12 месяцев): полноценные тренировки**
- Возврат к привычной программе
- Бег, прыжки — если нет проблем с тазовым дном
- Прогрессивная нагрузка
- Реалистичные ожидания (тело изменилось — это нормально)

**Диастаз прямых мышц:**
- Расхождение белой линии живота — частое явление
- Проверить: лёжа на спине, приподнять голову, пальпировать линию выше пупка
- Если >2 пальцев — специальные упражнения, возможно физиотерапия
- Запрещено: скручивания, планка, подъёмы ног до коррекции

**Питание при грудном вскармливании:**
- +300-500 ккал к поддерживающему уровню
- Белок 1.5-2 г/кг для восстановления мышц
- Жидкость: 2.5-3 литра в день
- Не садиться на жёсткую диету — влияет на молоко
`;
}
export function getDiabetesT2FitnessGuide(message: string): string {
  const triggers = ['диабет 2 типа тренировк', 'сахарный диабет спорт', 'инсулинорезистентность упражнен', 'тренировки при диабете', 'глюкоза и физнагрузк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💉 ТРЕНИРОВКИ ПРИ ДИАБЕТЕ 2 ТИПА:

⚠️ Обязательно согласуйте программу с эндокринологом!

**Почему тренировки критически важны:**
- Силовые повышают чувствительность к инсулину на 24-48 часов
- Мышцы — главный потребитель глюкозы (до 80% постпрандиальной)
- Регулярные тренировки снижают HbA1c на 0.5-0.7%
- Комбинация силовых + кардио эффективнее любого по отдельности

**Оптимальная программа:**
- Силовые: 2-3 раза/неделю, все основные группы мышц
- Кардио: 150 мин/неделю умеренного (быстрая ходьба, велосипед)
- Не пропускать более 2 дней подряд без нагрузки
- Объём: 2-3 подхода × 10-15 повторений

**Контроль глюкозы вокруг тренировки:**
- Измерить глюкозу до тренировки
- <5.0 ммоль/л — съесть 15-20 г углеводов, подождать 15 мин
- 5.0-13.9 ммоль/л — безопасный диапазон для тренировки
- >13.9 ммоль/л — проверить кетоны, тренировку отложить
- После тренировки: глюкоза может снижаться ещё 24-48 часов

**Безопасность:**
- Всегда иметь быстрые углеводы (сок, конфеты) под рукой
- Тренироваться с партнёром или тренером при начале программы
- Носить медицинский браслет/идентификатор
- Осматривать стопы до и после тренировки (нейропатия)
- Пить воду: обезвоживание повышает глюкозу

**Питание:**
- Углеводы за 1-2 часа до тренировки (медленные: каша, хлеб)
- Белок + углеводы после тренировки
- Дробное питание 4-5 раз в день
- Клетчатка замедляет всасывание глюкозы
`;
}
export function getCarnosineBetaStrategy(message: string): string {
  const triggers = ['бета аланин стратегия', 'карнозин мышцы', 'бета аланин покалывание', 'буферизация кислоты мышц', 'beta alanine dosing'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚡ БЕТА-АЛАНИН И КАРНОЗИН:

**Механизм действия:**
- Бета-аланин → синтез карнозина в мышцах
- Карнозин буферизует ионы H+ (кислотность)
- Результат: отсрочка закисления мышц при высокоинтенсивной работе
- Максимальный эффект: упражнения 1-4 минуты (подходы 15-30+ повторений)

**Дозировка:**
- 3.2-6.4 г/день, разделить на 2-4 приёма (по 800 мг-1.6 г)
- Насыщение: 4-8 недель регулярного приёма
- Принимать ежедневно, без перерывов
- Время дня не важно (накопительный эффект)

**Парестезия (покалывание):**
- Безвредное покалывание кожи лица/рук через 15-30 мин после приёма
- Связано с активацией рецепторов MrgprD в коже
- Снижается при дроблении дозы (по 800 мг × 4 раза)
- Форма Sustained Release (замедленного высвобождения) уменьшает эффект
- Проходит через 1-2 часа, не опасно

**Когда бета-аланин наиболее полезен:**
- Кроссфит, гребля, велоспринт (высокая анаэробная нагрузка)
- Подходы на 15-30+ повторений
- Круговые тренировки
- Финишные ускорения в кардио

**Когда НЕ поможет:**
- Подходы на 1-5 повторений (фосфокреатиновая система, не гликолиз)
- Чистая выносливость >30 мин (аэробная система)
- Тяжёлые силовые с длинным отдыхом

**Синергия с креатином:**
- Креатин + бета-аланин = больше, чем каждый по отдельности
- Креатин для подходов 1-10 повторений, бета-аланин для 10-30+
- Можно принимать одновременно
`;
}
export function getVitDSunlightGuide(message: string): string {
  const triggers = ['витамин д спортсмен', 'витамин d солнце', 'дефицит витамина д тренировк', 'vitamin d athletes', 'витамин д дозировка спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
☀️ ВИТАМИН D ДЛЯ СПОРТСМЕНОВ:

**Почему критически важен:**
- 70-80% россиян имеют дефицит витамина D (широта + климат)
- Влияет на: силу, скорость восстановления, иммунитет, настроение, тестостерон
- Рецепторы витамина D есть в мышечных клетках
- Дефицит = снижение силы на 10-15%, повышенный травматизм

**Диагностика:**
- Анализ крови: 25(OH)D (кальцидиол)
- <20 нг/мл — дефицит (критично!)
- 20-30 нг/мл — недостаточность
- 30-50 нг/мл — оптимум для здоровья
- 40-60 нг/мл — оптимум для спортсменов
- >100 нг/мл — токсичность (опасно)

**Дозировки:**
- Профилактика: 2000-4000 IU/день (для россиян — круглогодично)
- Коррекция дефицита: 5000-10000 IU/день × 8-12 недель, затем поддержка
- Форма D3 (холекальциферол) лучше D2
- Принимать с жирной пищей (жирорастворимый)
- Контроль через 3 месяца после начала приёма

**Солнце vs добавки:**
- В России (выше 50° с.ш.) синтез витамина D в коже = 0 с октября по март
- Летом: 15-20 мин на солнце в полдень (руки и ноги открыты) ≈ 10000-20000 IU
- Солнцезащитный крем SPF30+ блокирует 95% синтеза
- Для большинства россиян: добавки круглый год + солнце летом

**Синергия:**
- Витамин D + K2 (MK-7, 100-200 мкг): направляет кальций в кости, а не в сосуды
- Витамин D + магний: магний нужен для активации витамина D
- Без K2 и магния эффективность витамина D снижается
`;
}
export function getMagGlycinateGuide(message: string): string {
  const triggers = ['магний глицинат спорт', 'магний для сна тренировк', 'magnesium glycinate', 'дефицит магния атлет', 'магний судороги мышц'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🧪 МАГНИЙ ДЛЯ СПОРТСМЕНОВ:

**Почему магний критичен:**
- Участвует в 300+ ферментативных реакциях
- Синтез белка, энергетический метаболизм, нервная проводимость
- Потеря с потом: 3-15 мг/литр пота
- 50-60% россиян не получают достаточно магния из пищи

**Формы магния (не все одинаковы!):**
- Глицинат: высокая биодоступность, не слабит, улучшает сон ⭐ ЛУЧШИЙ
- Цитрат: хорошая биодоступность, может слабить
- Таурат: для сердечно-сосудистой системы
- L-треонат: проникает через ГЭБ (когнитивные функции)
- Оксид: дешёвый, плохая биодоступность (4%), слабительный ❌
- Малат: энергетический метаболизм, хорош для мышц

**Дозировки:**
- Мужчины: 400-420 мг элементарного магния/день
- Женщины: 310-320 мг/день
- Спортсмены: 400-600 мг/день (повышенные потери)
- Перед сном: 200-400 мг глицината (улучшение качества сна)

**Симптомы дефицита:**
- Мышечные судороги и спазмы
- Нарушения сна, трудности засыпания
- Тревожность, раздражительность
- Снижение силовых показателей
- Повышенное артериальное давление

**Пищевые источники:**
- Тыквенные семечки: 150 мг / 30 г
- Тёмный шоколад (70%+): 65 мг / 30 г
- Миндаль: 80 мг / 30 г
- Шпинат: 157 мг / чашка (варёный)
- Авокадо: 58 мг / штука

**Взаимодействия:**
- Не принимать с кальцием одновременно (конкуренция за усвоение)
- Кофеин увеличивает экскрецию магния с мочой
- Витамин B6 улучшает усвоение магния
- Цинк: принимать в разное время (конкуренция)
`;
}
export function getBlockPerScience(message: string): string {
  const triggers = ['блочная периодизация наука', 'block periodization', 'концентрированные блоки', 'мезоциклы блочные', 'периодизация по иссурину'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🧱 БЛОЧНАЯ ПЕРИОДИЗАЦИЯ (ИССУРИН):

**Концепция:**
- Концентрация тренировочной нагрузки на 1-2 качества за блок
- Минимально-эффективные дозы для поддержания остальных качеств
- Блоки: 2-4 недели, последовательная смена
- Разработана для элитных атлетов

**3 типа блоков (мезоциклов):**

Аккумуляция (2-4 недели):
- Цель: наработка базы, увеличение объёма
- Высокий объём, умеренная интенсивность
- Приседания: 4-5×8-12 @ 65-75%
- Подсобка: большой объём, изоляция
- "Накопление" тренировочного потенциала

Трансмутация (2-3 недели):
- Цель: преобразование базы в специфическую силу
- Средний объём, высокая интенсивность
- Приседания: 4-5×3-5 @ 80-90%
- Специфические упражнения
- "Трансформация" объёма в силу

Реализация (1-2 недели):
- Цель: реализация потенциала, пиковая форма
- Низкий объём, максимальная интенсивность
- Приседания: 3-4×1-2 @ 90-100%
- Минимум подсобки
- Тестирование 1ПМ или соревнование

**Поддерживающие нагрузки:**
- В каждом блоке: 1-2 тренировки/неделю на "неприоритетные" качества
- Минимальный объём для предотвращения деградации
- Пример: в блоке силы — 1 день гипертрофии с 50% объёма

**Для кого:**
✅ Продвинутые атлеты (3+ лет стажа)
✅ Спортсмены с конкретной датой соревнований
✅ При стагнации на DUP/линейной
❌ Новички и средний уровень (линейная прогрессия ещё работает)
`;
}
export function getVBTScience(message: string): string {
  const triggers = ['vbt тренировк', 'velocity based training', 'скорость штанги тренировк', 'тренировки по скорости', 'гимраст энкодер'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚡ VBT — ТРЕНИРОВКИ НА ОСНОВЕ СКОРОСТИ:

**Концепция:**
- Измерение скорости штанги для управления нагрузкой
- Объективнее чем RPE (прибор не врёт)
- Определение 1ПМ без выхода на максимум
- Управление утомлением в реальном времени

**Зоны скорости (для приседа/жима):**
- >1.0 м/с: скоростная сила (30-50% от 1ПМ)
- 0.75-1.0 м/с: мощность (50-65%)
- 0.5-0.75 м/с: сила-скорость (65-80%)
- 0.35-0.5 м/с: максимальная сила (80-90%)
- 0.2-0.35 м/с: околомаксимальная сила (90-97%)
- <0.2 м/с: попытка 1ПМ (97-100%)

**Применение:**
Авторегуляция по минимальной скорости (velocity stop):
- Задаёшь пороговую скорость (например, 0.5 м/с)
- Когда скорость подхода падает ниже порога — прекращаешь подходы
- Результат: оптимальный объём без перетренировки

Определение дневного 1ПМ:
- Разминочные подходы: записать скорость при 50%, 70%, 80%
- Построить кривую: скорость vs вес
- Экстраполировать 1ПМ без реального выхода на максимум

**Оборудование:**
- Push Band, GymAware, Tendo Unit, OpenBarbell
- Бюджетный вариант: приложения с камерой (менее точно)
- Цена: от 5000 до 50000 руб.

**Для кого:**
✅ Продвинутые атлеты, пауэрлифтеры
✅ Тренеры с несколькими спортсменами
✅ Атлеты в пиковый период (избежать переутомления)
❌ Новички (RPE + простая прогрессия достаточно)
`;
}
export function getRestPauseProtocol(message: string): string {
  const triggers = ['рест пауза протокол', 'rest pause метод', 'мийо рипс', 'myo reps тренировк', 'рест пауза для гипертрофии'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⏸️ REST-PAUSE И MYO-REPS:

**Rest-Pause классический (для силы):**
- Выполни 1-3 повторения @ 85-90% 1ПМ
- Положи штангу, отдых 10-15 сек (стоя у стойки)
- Повтори ещё 1-2 повторения
- Повтори ещё раз (всего 3-4 мини-серии)
- Итого: 5-8 повторений с весом, который обычно поднимаешь на 2-3
- Используется для преодоления плато в силе

**Myo-Reps (для гипертрофии):**
Создатель: Borge Fagerli
- Активационный подход: 12-20 повторений до RPE 8-9
- Отдых 5-10 сек (глубоких вдохов)
- Мини-серия: 3-5 повторений
- Отдых 5-10 сек
- Повторять мини-серии пока можешь делать целевое число (3-5)
- Стоп когда повторения падают ниже целевых

**Почему это работает:**
- Активационный подход рекрутирует высокопороговые волокна
- Мини-серии удерживают их активными (закон Хеннемана)
- Каждое повторение мини-серии = "эффективное" повторение
- Экономия времени: 5 мин вместо 15 на ту же группу мышц

**Пример Myo-Reps:**
- Разгибание ног: 15 повторений → 5 сек → 5 → 5 сек → 4 → 5 сек → 3 (стоп)
- Общий объём: 27 повторений за ~3 минуты
- Эквивалент: ~3 обычных подхода по 10

**Когда использовать:**
✅ Подсобные/изолирующие упражнения (идеально)
✅ Ограниченное время тренировки
✅ Последний упражнение дня (добить мышцу)
❌ Тяжёлые базовые упражнения (безопасность)
❌ Новички (нужно чувствовать RPE точно)
`;
}
export function getRussianFederationGuide(message: string): string {
  const triggers = ['российская федерация спорт', 'федерация пауэрлифтинг россия', 'фпрс фбр рфс', 'российские соревнования', 'турниры россия', 'отечественные чемпионаты'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏆 РОССИЙСКИЕ СПОРТИВНЫЕ ФЕДЕРАЦИИ И СОРЕВНОВАНИЯ:

**Пауэрлифтинг:**
ФПРС (Федерация пауэрлифтинга России):
- Международная аффилиация: IPF (International Powerlifting Federation)
- Главные соревнования: Чемпионат России, Кубок России, региональные чемпионаты
- Весовые категории: IPF-стандарт (59, 66, 74, 83, 93, 105, 120, 120+ кг у мужчин)
- Форма: комбинезон Inzer/Titan для классики, сырое снаряжение — бинты или рукава
- Допинг-контроль: обязателен на всероссийских соревнованиях (РУСАДА)

**Бодибилдинг:**
ФБР (Федерация бодибилдинга России):
- Аффилиация: IFBB (International Federation of Bodybuilding)
- Дисциплины: классический бодибилдинг, мужской физик, бикини, фитнес-бикини
- Открытый бодибилдинг, фитнес, атлетик-физик
- Главные старты: Гран-при России, Кубок Победы, Чемпионат России

**Тяжёлая атлетика:**
ФТА России (Федерация тяжёлой атлетики):
- Олимпийские дисциплины: рывок, толчок
- Чемпионат России ежегодно, региональные соревнования

**Как начать соревноваться:**
1. Получи медицинский допуск (спортивная медицина)
2. Вступи в региональную федерацию (взнос 500-2000₽/год)
3. Пройди квалификационный норматив или регистрируйся на открытые старты
4. Первые соревнования: региональные кубки — без жёсткого отбора

**Нормативы МСМК/МС/КМС:**
- Зависят от вида спорта и весовой категории
- Пример: пауэрлифтинг сырой 83кг КМС мужчины = ~480кг сумма (приседание+жим+тяга)
- Официальные нормативы: сайт ФПРС, ФБР, ФТА
`;
}
export function getFBRBodybuildingGuide(message: string): string {
  const triggers = ['фбр', 'ифбб россия', 'бодибилдинг соревнования россия', 'федерация бодибилдинг россия', 'ifbb pro россия', 'бикини соревнования россия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 ФБР / IFBB — БОДИБИЛДИНГ В РОССИИ:

**Дивизионы IFBB (что выбрать):**

Мужской физик (Men's Physique):
- Критерии: V-образный торс, мышечность без экстремальной сушки
- Оценка: мышечный баланс, кожа, презентация
- Подходит: 75-90 кг, рост пропорционально

Классический бодибилдинг:
- Максимальный вес по росту: ограничен формулой IFBB
- Большой акцент на симметрию и форму, не только размер
- Средняя сушка: 5-7% жира

Открытый бодибилдинг (Open):
- Максимальный размер и симметрия
- Экстремальная сушка: 3-5% жира
- Требует многолетнего фарм-сопровождения на топ-уровне

Бикини (Women's Bikini):
- Лёгкая мышечность, тонус, линии
- Пример: 60-65 кг при 165 см, 15-18% жира
- Самый популярный женский дивизион

Фитнес-бикини:
- Более мышечное телосложение vs классическое бикини

**Подготовка к сцене (общие принципы):**

Пик-уик (неделя перед):
- Углеводная загрузка: за 2-3 дня до старта
- Снижение воды: за 12-24ч ограничение жидкости и натрия
- Карбон-синтез: рис, сладкий картофель (не сладкое!)
- Диурез: только если есть опыт, иначе риск спазмов

Позирование:
- Обязательная практика: 15-20 минут в день от 8-12 недель до старта
- Обязательные позиции: фронтальная, боковые, задняя
- Видеосъёмка себя — единственный объективный способ улучшить

**Регистрация на старт:**
- Сайт ФБР, группы ВКонтакте, Telegram-каналы региональных федераций
- Взнос: 1500-5000₽
- Медицинская справка обязательна
`;
}
export function getMoscowGymCulture(message: string): string {
  const triggers = ['московский зал', 'культура зала москва', 'фитнес клуб россия', 'тренажёрный зал москва', 'спортзал питер', 'фитнес россия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏙️ КУЛЬТУРА ТРЕНАЖЁРНЫХ ЗАЛОВ В РОССИИ:

**Типы залов:**

Коммерческие сети (Москва/регионы):
- World Class: премиум-сегмент, бассейн, SPA, цена 5000-15000₽/мес
- X-Fit: средний+ сегмент, групповые программы, 3000-8000₽/мес
- FitService, WeGym: доступный средний, 2000-5000₽/мес
- Planet Fitness (RF): эконом, только тренажёры, ~1500-2500₽/мес

Специализированные залы:
- Пауэрлифтинг-залы: помосты, штанги Eleiko/Ivanko, атмосфера «старой школы»
- CrossFit-боксы: WOD, сертифицированные тренеры, обычно 5000-10000₽/мес
- Бокс/единоборства: ринг + тренажёры, часто при спортклубах

**Этикет российских залов:**
- Протирать снаряды после себя: норма в сетевых, не всегда в «дворовых»
- Возврат блинов: культура формируется, но не везде соблюдается
- Скоростные стойки в час пик: принято спрашивать «рабочие?»
- Фото в зале: в большинстве залов нет запрета (в отличие от некоторых западных)
- Музыка без наушников: в «железных» залах часто включают громко — норма

**Специфика российских залов:**
- «Качалки» в подвалах: дешевле, серьёзнее атмосфера, без лишних услуг
- Спортивные комплексы СССР: часто дешевле коммерческих, хорошее оборудование
- ДЮСШ: залы при детско-юношеских школах — доступ для взрослых часто есть

**Время для тренировок:**
- Час пик: 18:00-21:00 (рабочие дни)
- Лучшее время: 7:00-10:00 или 13:00-16:00
- Выходные утром: очереди к зеркалам и свободным весам

**Онлайн-комьюнити:**
- Telegram-каналы: Спорт Онлайн, Пауэрлифтинг RU
- ВКонтакте: крупные сообщества по видам спорта
- YouTube: Денис Гусев, Станислав Линдовер — популярные русскоязычные тренеры
`;
}
export function getSelfTalkStrategies(message: string): string {
  const triggers = ['самоговор спорт', 'внутренний диалог тренировк', 'позитивный самоговор', 'аффирмации тренировк', 'self talk спорт', 'разговор с собой тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💬 САМОГОВОР (SELF-TALK) В СПОРТЕ:

**Типы самоговора:**

Мотивационный:
- «Ты можешь!», «Держи!», «Ещё один!»
- Повышает усилие, настойчивость
- Лучший эффект: на выносливостных задачах

Инструктивный (технический):
- «Спина ровная», «Штанга близко», «Дышать»
- Улучшает технику и точность
- Лучший эффект: при обучении и под давлением

Негативный автоматический:
- «Я слабак», «Снова не получилось», «Зачем вообще»
- Исходит от неосознанных убеждений
- НУЖНО замечать и перерабатывать

**Создание личных аффирмаций:**

Правила:
1. Настоящее время: «Я сильный», не «Я стану сильным»
2. Утвердительное: «Техника чёткая», не «Не горблюсь»
3. Личное: работает ТО, во что ты веришь
4. Краткое: 2-4 слова — лучше помнится в стрессе

Примеры для силовых:
- «Я поднимаю» (в тяжёлом подходе)
- «Спина держит» (приседания)
- «Мощь в ногах» (становая)
- «Контроль» (сложная техника)

**Протокол замены негативного:**

Шаг 1: Заметить («Я опять думаю, что не подниму»)
Шаг 2: Прерыть («Стоп. Это просто мысль, не факт»)
Шаг 3: Заменить («Я справлялся с таким весом раньше»)
Шаг 4: Действовать (подход, не думая)

**Практика:**

Дневник самоговора (2 недели):
- Записывай мысли до/во время/после тяжёлых подходов
- Выяви паттерны: что срабатывает, что мешает
- Разработай личный «словарь» под свои паттерны

Парные ключевые слова:
- Проблема → решение всегда рядом
- «Тяжело» → «Значит, работает»
- «Не могу» → «Что мне нужно, чтобы смочь?»
- «Провалился» → «Что данные говорят о следующем подходе?»
`;
}
export function getMuscleAnatomyDeep(message: string): string {
  const triggers = ['анатомия мышц', 'строение мышц', 'мышечные волокна строение', 'анатомия мускулатуры', 'микроструктура мышц', 'саркомер актин миозин'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 АНАТОМИЯ И ФИЗИОЛОГИЯ МЫШЦ — УГЛУБЛЁННО:

**Структура мышцы (от крупного к мелкому):**

Мышца → пучки волокон → мышечные волокна → миофибриллы → саркомеры

Саркомер (функциональная единица сокращения):
- Актин (тонкие нити) + миозин (толстые нити)
- Скользящая теория нитей Хаксли: актин скользит вдоль миозина
- Мостики миозина «гребут» актин → укорочение

Тубулярная система и Ca²⁺:
- Нервный импульс → деполяризация → T-трубочки → Ca²⁺ из SR
- Ca²⁺ связывается с тропонином → открывает активные центры актина
- Миозиновые мостики прикрепляются → сокращение

**Типы мышечных волокон:**

Тип I (медленные, красные):
- Много митохондрий, миоглобина
- Устойчивы к усталости
- Аэробный метаболизм
- Развивают меньше силы, но долго
- Тренировка: выносливость, высокие повторения (15+)

Тип IIa (быстрые адаптируемые):
- Переходный тип
- Могут работать и аэробно, и анаэробно
- Хорошо гипертрофируются
- Тренировка: 8-15 повторений

Тип IIx/IIb (быстрые, белые):
- Мало митохондрий
- Максимальная сила и скорость
- Быстро утомляются
- Тренировка: 1-5 повторений, взрывная работа

**Распределение типов волокон:**

Типичное соотношение (у нетренированных):
- Квадрицепс: ~50% I / 50% II
- Трицепс: ~40% I / 60% II
- Камбаловидная: ~80% I (постуральная!)

Индивидуальные различия:
- Генетически детерминированы на 40-60%
- Тренировки сдвигают IIx → IIa (не I → II)
- Элитные спринтеры: >70% II; марафонцы: >70% I

**Мышечная гипертрофия (механизмы):**

Миофибриллярная:
- Добавление новых саркомеров (параллельно)
- Тренировка: 1-8 повторений, высокая нагрузка
- Увеличивает силу + размер

Саркоплазматическая:
- Расширение саркоплазмы (гликоген, митохондрии)
- Тренировка: 8-15 повторений, умеренная нагрузка
- Увеличивает объём > силы
`;
}
export function getLeverAgeAdvantage(message: string): string {
  const triggers = ['рычаги тела', 'биомеханическое преимущество', 'длина конечностей тренировк', 'антропометрия пауэрлифтинг', 'длинные руки становая', 'пропорции тела спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
📐 РЫЧАГИ И АНТРОПОМЕТРИЯ В СИЛОВОМ СПОРТЕ:

**Как измерить свои пропорции:**

Торако-бедренный индекс:
- Длина туловища / длина бедра
- >1.0 = длинное туловище (преимущество в приседании)
- <1.0 = короткое туловище (труднее приседания, легче становая)

Индекс руки (wingspan/height):
- Размах рук / рост
- >1.0 = длинные руки (преимущество в становой тяге)
- <1.0 = короткие руки (преимущество в жиме лёжа)

**Профили для конкретных упражнений:**

Приседание — идеальная антропометрия:
✅ Длинное туловище (сохраняет вертикаль)
✅ Короткие бёдра (меньше наклон)
✅ Средняя подвижность голеностопа
Сложная антропометрия: длинные бёдра + короткое туловище → сильный наклон → увеличь ширину постановки

Становая тяга — идеальная антропометрия:
✅ Длинные руки (короче путь штанги)
✅ Короткое туловище (меньше момент)
✅ Длинные ноги (мощный стартовый толчок)
Сложная антропометрия: высокое прикрепление бицепса бедра → плоха «точка» внизу → сумо как альтернатива

Жим лёжа — идеальная антропометрия:
✅ Короткие руки (меньше диапазон движения)
✅ Широкая грудная клетка (больше «моста», меньше диапазон)
✅ Длинные предплечья (эффективнее передача силы)

**Адаптации техники под анатомию:**

Длинные бёдра в приседании:
- Ширина постановки: широкая (45-60° носки)
- Глубина: через мобильность таза, не насилие
- Низкая штанга на спине уменьшает наклон туловища

Короткие руки в становой:
- Сумо-тяга как альтернатива (фактически укорачивает путь)
- Стартовая позиция: бёдра ниже, спина вертикальнее

Длинный торс в жиме:
- Более широкий хват (до максимума IPF 81 см)
- «Арка» снижает диапазон (легальная техника)

**Важное предупреждение:**
Антропометрия объясняет ЧАСТЬ разницы в результатах
Тренировки, техника и программирование важнее биологии
Не используй «неудобную» анатомию как оправдание — адаптируй технику
`;
}
export function getHipMechanicsGuide(message: string): string {
  const triggers = ['биомеханика таза', 'тазобедренный сустав упражнен', 'hip hinge механика', 'отведение бедра механика', 'хип хинж техника', 'тазовый наклон тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦵 БИОМЕХАНИКА ТАЗОБЕДРЕННОГО СУСТАВА:

**Hip Hinge — ключевое движение:**
Что это: наклон туловища при фиксированном нейтральном позвоночнике
Движущий сустав: тазобедренный (НЕ поясница!)
Ошибка новичков: «сгибают поясницу» вместо «шарнира в бёдрах»

Техника обучения (со стеной):
1. Встань в 30 см от стены спиной
2. Чуть согни колени
3. Отведи ягодицы к стене, сохраняя прямую спину
4. Касание ягодицами стены = правильный хинж
5. Постепенно отходи дальше → глубже наклон

**Упражнения на hip hinge:**
Становая тяга (все вариации), RDL, гудморнинг, KB swing, SLDL, ягодичный мостик, гиперэкстензия

**Ретроверсия vs Антеверсия таза:**

Антеверсия (таз наклонён вперёд):
- Лордоз поясницы более выражен
- Естественное положение → облегчает глубокие приседания
- Риск: перегрузка КПС при чрезмерном лордозе

Ретроверсия (таз наклонён назад):
- Поясница более плоская
- Трудности с глубоким приседом (раннее касание бедра об таз = «bone on bone»)
- Адаптация: более широкая постановка + мысок наружу

**Костная морфология таза:**
- Угол шейки бедра (coxa vara/valga) — генетический
- Ориентация вертлужной впадины — влияет на «внешнее» положение бедра
- «Бедро в бедро» (femoral impingement): ограничение при глубоком приседе
- Диагностика: тест FADDIR, тест Томаса

**Ягодичные мышцы — биомеханика:**

Большая ягодичная:
- Разгибание бедра (основная функция)
- Наружная ротация (вторичная)
- Максимальное участие: угол >45° сгибания бедра
- Активируется лучше при: широких приседах, ягодичном мостике, hip thrust

Средняя ягодичная:
- Отведение бедра + стабилизация таза при ходьбе
- Слабость → колени падают вовнутрь (вальгус)
- Упражнения: clam shells, боковые шаги с лентой, боковые выпады
`;
}
export function getForceVelocityCurve(message: string): string {
  const triggers = ['кривая сила скорость', 'force velocity', 'взрывная сила', 'скоростно-силовые качества', 'мощность развитие', 'RFD скорость нарастания силы'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚡ КРИВАЯ СИЛА-СКОРОСТЬ И РАЗВИТИЕ МОЩНОСТИ:

**Кривая Сила-Скорость (Hill, 1938):**
Обратная зависимость: чем выше скорость сокращения → тем меньше сила
- Максимальная сила (1ПМ): скорость → 0
- Максимальная скорость (спринт без нагрузки): сила → 0
- Максимальная мощность: в середине кривой (~30-60% от 1ПМ)

Зоны кривой:
F-зона (силовая): 85-100% 1ПМ → медленно, много силы
P-зона (мощностная): 30-70% 1ПМ → взрывно, оптимальная мощность
V-зона (скоростная): 0-30% 1ПМ → максимально быстро

**Где находится большинство атлетов:**
- Пауэрлифтеры: сильная F-зона, слабая V-зона
- Спринтеры: сильная V-зона, слабая F-зона
- Тяжелоатлеты: оптимально для P-зоны

**RFD — Rate of Force Development (скорость нарастания силы):**
Определение: насколько быстро ты достигаешь пика силы
Критично для: прыжков, спринта, единоборств
Время контакта в спорте: 100-200 мс → нужен высокий RFD

Тренировка RFD:
- Плиометрика: прыжки с отскоком (reactive jumps)
- Взрывные упражнения: rogue KB swing, power clean
- Тяжёлая атлетика: рывок, толчок (лучший метод)
- Баллистические жимы: жим + подбросить гантели

**Применение кривой в программировании:**

Метод контраста (contrast method):
- Тяжёлый подход (85-95%) → взрывной подход (30-50%) без паузы
- Пример: приседание 5×90кг → прыжок 3×собственный вес
- PAP (потенциация после активации): 4-8 мин между тяжёлым и взрывным

Испанский squat → box jump → становая (contrast cluster)

**Силовой дефицит:**
Определение: разрыв между максимальной силой и взрывной силой
- Высокий дефицит (>15%): нужна тяжёлая силовая работа
- Низкий дефицит (<5%): нужна взрывная/плиометрическая работа
Тест: сравни вертикальный прыжок с места vs после 5с разгона
`;
}
export function getImmersionTherapyGuide(message: string): string {
  const triggers = ['погружение в воду восстановление', 'контрастный душ', 'ванна со льдом', 'cold water immersion', 'горячая ванна восстановление', 'термальное восстановление'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🌊 ВОДНЫЕ ПРОЦЕДУРЫ ДЛЯ ВОССТАНОВЛЕНИЯ:

**Cold Water Immersion (CWI — ледяная ванна):**

Протокол:
- Температура: 10-15°C (не ниже 8°C — риск)
- Продолжительность: 10-15 минут (не дольше)
- Время: сразу после тренировки или через 30-60 мин
- Погружение: по грудь (руки снаружи)

Эффекты (доказанные):
✅ Снижение воспринимаемой болезненности (субъективно)
✅ Улучшение психологического восстановления
✅ Снижение отёчности
⚠️ Возможно снижает адаптацию к гипертрофии (ингибиция mTOR)

Рекомендация: используй CWI перед соревнованиями и в период накопленной усталости. Избегай сразу после силовых тренировок на гипертрофию (24-48ч после последней силовой).

**Contrast Water Therapy (контрастная):**
Чередование холодной (10-15°C) и горячей (38-40°C) воды
Протокол: 1 мин холодно → 3 мин тепло × 3-5 циклов, заканчивай холодным
Эффект: вазоконстрикция/вазодилатация = «мышечная помпа»
Лучше CWI: для восстановления силовых без риска блокировки адаптации

**Горячая ванна/сауна:**

Горячая ванна (38-40°C, 20-30 мин):
- Расслабление мышц
- Подготовка к сну (температура тела снижается после → сонливость)
- Лучше: за 1-2ч до сна

Сауна (80-100°C):
- Гормоны роста: краткосрочный пульс после сауны
- Heat shock proteins: защита мышечных белков
- Кровоток: улучшает эндотелиальную функцию
- Протокол: 15-20 мин × 2-3 захода с охлаждением

**Практика в российских условиях:**

Домашний вариант CWI:
- Холодный душ как замена ледяной ванне (хуже, но доступно)
- Постепенный вход: 3 мин на 20°C → каждые 3 дня -1°C
- Психологическая польза: контроль дискомфорта

Русская баня:
- Традиционный инструмент восстановления
- Пар + берёзовый веник = дополнительная гиперемия
- Веник: механическое воздействие на кожу + эфиромасличные вещества
- Частота: 1-2 раза в неделю
`;
}
export function getElectricalStimGuide(message: string): string {
  const triggers = ['электростимуляция', 'ems тренировка', 'tens восстановление', 'электростимуляция мышц', 'нейромышечная стимуляция', 'эмс пояс'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚡ ЭЛЕКТРИЧЕСКАЯ СТИМУЛЯЦИЯ — ПРАВДА И МИФЫ:

**Типы электростимуляции:**

EMS (Electrical Muscle Stimulation):
- Прямая стимуляция двигательных нейронов → сокращение мышцы
- Частота: 30-100 Гц
- Применение: реабилитация, восстановление, дополнительная тренировка
- Важно: не заменяет обычные тренировки!

TENS (Transcutaneous Electrical Nerve Stimulation):
- Стимуляция чувствительных нервов → обезболивание
- Частота: 50-200 Гц (высокая) или 1-10 Гц (низкая)
- Применение: хроническая боль, DOMS
- Не для тренировки мышц

Microcurrent (MENS):
- Очень слабый ток (микроамперы, не миллиамперы)
- Ускорение клеточного восстановления
- Применяется при травмах

**Что реально работает:**

EMS для восстановления:
- Пассивная EMS после тренировки: ускоряет выведение лактата
- Частота: 10-20 Гц, низкая интенсивность (не болезненно)
- Продолжительность: 15-20 мин
- Доказательства: умеренные, субъективное восстановление лучше

EMS для силы (дополнение):
- У элитных атлетов: +2-5% к силовым показателям как добавка к обычным тренировкам
- У нетренированных: больший эффект
- Недостаточен сам по себе — только как дополнение

**Мифы об EMS:**

❌ «EMS-пояс сожжёт жир на животе»
Реальность: нет исследований, подтверждающих потерю жира от пояса

❌ «Заменяет тренировку в зале»
Реальность: развивает локально, не даёт системных адаптаций

❌ «Профессионалы используют вместо тренировок»
Реальность: профессионалы используют КАК ДОПОЛНЕНИЕ к полноценным тренировкам

**Практическое применение:**

Восстановление:
- Купи/возьми в аренду EMS-устройство (Compex, Globus)
- Программа «Recovery» или «Active Recovery»
- Место электродов: на брюшко мышцы (не на суставы, не на позвоночник)
- Интенсивность: до ощущения «покалывания + лёгкое сокращение» (не больно)

Показания:
- После очень тяжёлой тренировки
- DOMS высокий, но нет возможности для активного восстановления
- В путешествии (нет зала)
`;
}
export function getRedLightTherapyGuide(message: string): string {
  const triggers = ['красный свет терапия', 'фотобиомодуляция', 'PBM лечение', 'инфракрасная терапия мышцы', 'red light therapy', 'LLLT спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔴 ФОТОБИОМОДУЛЯЦИЯ (КРАСНЫЙ И ИНФРАКРАСНЫЙ СВЕТ):

**Что это и как работает:**
- Длины волн: красный 630-700нм + ближний инфракрасный 800-1000нм
- Механизм: поглощение цитохромом c оксидазой → ↑ производство ATP
- Дополнительно: ↑ высвобождение NO (оксида азота) → вазодилатация

**Доказательная база для атлетов:**

Мышечная усталость и восстановление:
- Мета-анализ Leal-Junior (2015): до тренировки снижает усталость на 37-47%
- Снижение маркеров повреждения (CK, LDH) на 20-40%
- Улучшение результата при протоколах с усталостью

Эффективные протоколы:
- До тренировки (pre-conditioning): 5-10 мин, 20-50 Дж/см² на группу мышц
- После тренировки: 10-15 мин для ускорения восстановления

Боль (тендиниты, артриты):
- Умеренная доказательная база для хронической боли
- НПВП не заменяет, но может дополнять

**Параметры устройств:**

Мощность (irradiance): 30-200 мВт/см²
Доза (fluence): 4-50 Дж/см²
Расстояние: < 5 см от поверхности (через кожу, не через одежду)

Типы устройств:
- Панели (полное тело): наилучшее покрытие, эффективнее
- Локальные устройства/пояса: для конкретных зон
- Ванды/прожекторы: точечная работа

**Соотношение цена/качество:**
- Бюджетные (3000-10000₽): минимальная мощность, ограниченная эффективность
- Средний сегмент (15000-40000₽): достаточная мощность для восстановления
- Профессиональные (50000+₽): полноценный протокол

**Безопасность:**
- НЕ применять на злокачественные образования
- Защита глаз (тёмные очки)
- Не применять поверх фотосенсибилизирующих препаратов

**Вывод:** Один из наиболее перспективных немедикаментозных методов восстановления. Доказательная база растёт. Риски минимальны при соблюдении инструкций.
`;
}
export function getMuscleArchitecture(message: string): string {
  const kw = ['архитектура мышц', 'угол перистости', 'пучки мышц', 'physiological cross-section', 'pcsa мышца', 'длина пучков'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Архитектура мышц и её влияние на силу:**

**Основные параметры архитектуры:**
1. **Угол перистости (pennation angle)** — угол пучков к линии тяги
   - 0° (параллельная): бицепс, портняжная → большая скорость/амплитуда
   - 15-30° (перистая): прямая мышца бедра, икроножная → сила
   - >30° (многоперистая): дельтовидная, камбаловидная → максимальная сила

2. **Физиологическое поперечное сечение (PCSA)** — больше PCSA = больше сила
   - Перистые мышцы: большое PCSA в компактном объёме → мощность
   - Параллельные: меньшее PCSA, но длинные волокна → скорость

3. **Длина саркомеров** — определяет оптимальный угол для пиковой силы
   - Укорочение мышцы → саркомеры ниже оптимума → сила падает
   - Кривая сила-длина: важно тренироваться в полном ROM

**Практическое значение:**
- Тренировки в растянутой позиции (deep stretch) → больший гипертрофический стимул
- Угол перистости увеличивается при гипертрофии → больше силы на единицу объёма
- Длинные мышечные пучки → лучший спринт/прыжки (быстрые волокна)
- Разные люди → разная архитектура → разный силовой потенциал

**Влияние тренировок на архитектуру:**
Гипертрофия увеличивает и угол, и объём пучков.
Силовые → преимущественно ↑ угол перистости.
Скоростные → ↑ длина пучков (адаптация к быстрым сокращениям).
`;
}
export function getMovementScreening(message: string): string {
  const kw = ['скрининг движений', 'fms тест', 'оценка движений', 'функциональный скрининг', 'тест подвижности', 'оценка техники'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Функциональный скрининг движений (Movement Screening):**

**FMS — Functional Movement Screen:**
7 базовых паттернов, оценка 0-3 для каждого:
3 — идеально, без болей
2 — выполнено с компенсацией
1 — не может выполнить
0 — боль при движении → медицинская консультация

**7 тестов FMS:**
1. Deep Squat — глубокий присед с палкой над головой
2. Hurdle Step — перешаг через препятствие
3. Inline Lunge — выпад по одной линии
4. Shoulder Mobility — тест подвижности плеч
5. Active Straight Leg Raise — подъём прямой ноги лёжа
6. Trunk Stability Push-up — отжимание на стабильность туловища
7. Rotary Stability — ротационная стабильность

**Интерпретация:**
Сумма <14 → повышенный риск травм (исследование Cook, 2006)
Асимметрия >1 балл → исправлять асимметрию до добавления нагрузки
Тест 0 (боль) → стоп, консультация специалиста

**Простой самоскрининг (без оборудования):**
- Приседание с руками вверх: колени не заваливаются, пятки на полу
- Наклон вперёд стоя: пальцы касаются пола
- Ротация сидя: 45° в обе стороны симметрично
- Планка: 60 сек без провала поясницы

**Коррекция по результатам:**
Ограниченный Deep Squat → работа на голеностоп + тазобедренный
Слабый Trunk Stability → антиротационные упражнения (Pallof press)
Ограниченная Shoulder Mobility → ротаторы манжеты + грудной отдел
`;
}
export function getForceVeloProfile(message: string): string {
  const kw = ['кривая сила скорость', 'force velocity', 'мощность кривая', 'силовой профиль атлета', 'сила vs скорость'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Кривая Сила-Скорость и индивидуальный профиль атлета:**

**Основной принцип:**
При увеличении скорости сокращения мышца производит меньшую силу (обратная зависимость).
Пик мощности — в середине кривой (~30% от максимальной силы или скорости).

**Типы атлетов по профилю:**

**Силовой профиль (Force-dominant):**
Высокая 1ПМ, медленная скорость, низкий прыжок
Что развивать: взрывные/баллистические упражнения, снизить % нагрузки в тренировках
Примеры: пауэрлифтеры без специализированной скоростной работы

**Скоростной профиль (Velocity-dominant):**
Высокая скорость движений, низкая абсолютная сила, хороший прыжок
Что развивать: тяжёлые силовые (80-90% 1ПМ), медленные эксцентрики
Примеры: спринтеры без силовой базы

**Сбалансированный профиль:**
Идеал для большинства видов спорта
Хорошая 1ПМ + хороший прыжок

**Оценка своего профиля:**
Тест 1: 1ПМ в приседе (сила)
Тест 2: высота прыжка в длину (скорость/мощность)
Соотношение: если 1ПМ/вес тела >> норма, но прыжок слабый → силовой профиль → нужна скоростная работа

**Профильная тренировка (Профицит Крибба):**
Силовой профиль: 30-50% 1ПМ × быстро + плиометрика
Скоростной профиль: 80-90% 1ПМ × медленно + тяжёлые негативы
Сбалансированный: полный спектр нагрузок
`;
}
export function getRefeedDayProtocol(message: string): string {
  const kw = ['рефид', 'refeed', 'углеводная загрузка диета', 'день загрузки', 'высокоуглеводный день', 'перезагрузка углеводами'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Рефид (Refeed Day) — протокол:**

**Что такое рефид:**
Запланированный день/период с повышенным потреблением углеводов на фоне дефицита калорий.
Цель: временное восстановление лептина, гликогена и метаболизма.

**Физиологический эффект:**
↑ Лептин — гормон насыщения, снижается при диете → рефид временно поднимает
↑ Гликоген мышц → лучшие тренировки, сила возвращается
↑ Настроение, мотивация (серотонин связан с углеводами)
↑ Скорость метаболизма на 5-10% в течение 1-2 дней

**Когда нужен рефид:**
- Дефицит калорий > 4-6 недель
- Прогресс в тренировках стагнирует
- Постоянная усталость, снижение силы
- Жиро% < 15% у мужчин / < 25% у женщин

**Протокол рефида:**
Углеводы: +50-100% от обычного уровня (например, с 200 до 350-400 г)
Белок: норма или чуть ниже
Жиры: значительно снизить (акцент именно на углеводах)
Калории: обычно выходят в ~TDEE или +5-10%

**Источники углеводов для рефида:**
Рис, картофель, овсянка, бананы, хлеб — качественные крахмалы
Избегать: жирная пища + углеводы вместе = максимальное отложение жира

**Частота:**
Лёгкий дефицит (~15%): рефид раз в 2 нед
Умеренный (~20-25%): раз в 7-10 дней
Агрессивный (>25%): раз в 5-7 дней
`;
}
export function getEnergyGelStrategy(message: string): string {
  const kw = ['энергетический гель', 'спортивный гель', 'гель на тренировке', 'углеводы во время бега', 'energy gel марафон'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Энергетические гели — стратегия применения:**

**Что такое энергетический гель:**
Концентрированный источник быстрых углеводов (25-40 г на пакетик)
Обычно глюкоза + фруктоза + мальтодекстрин ± электролиты ± кофеин
Форматы: гель (тягучий), «гоммы» (желейки), жидкие концентраты

**Когда использовать гели:**
Аэробные нагрузки >60-75 мин непрерывно
Марафон, полумарафон, триатлон, лыжи, велоспорт
Силовые тренировки >90 мин (высокий объём)

**Протокол приёма:**
Первый гель: через 45-60 мин нагрузки
Последующие: каждые 30-45 мин
Запивать водой (100-200 мл) — иначе концентрированные углеводы замедляют всасывание
Цель: 30-60 г углеводов/час (тренированные: до 90 г/час)

**Гели с кофеином:**
Эффективны на 2+ ч нагрузки
Доза: 50-100 мг кофеина (за 1 пакетик)
Рекомендация: использовать в 2-й половине дистанции для «финишного ускорения»
Не использовать каждый пакетик — суммарное количество кофеина может быть избыточным

**Тренировка ЖКТ:**
Желудок надо тренировать работать во время нагрузки!
Начинать с малых доз на лёгких тренировках
Многие атлеты страдают от ЖКТ-проблем на соревнованиях — репетировать нужно заранее

**DIY гель (дешевле в 5-10 раз):**
Финики 3-4 шт. (блендер) + щепотка соли + вода = натуральный гель
`;
}
export function getPeakingProtocol(message: string): string {
  const kw = ['пиккинг', 'пик формы', 'выход на пик', 'peaking', 'подводка к соревнованию', 'пик перед соревнованием'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Протокол выхода на пик (Peaking):**

**Что такое пиккинг:**
2-4-недельный период снижения объёма с сохранением/ростом интенсивности.
Цель: суперкомпенсация — организм восстанавливается и превосходит предыдущий уровень.

**Физиологическая основа:**
Накопленная усталость маскирует истинный уровень формы.
Убрав усталость → проявляются адаптации → рост показателей.

**Классический протокол (3 нед до соревнования):**

**Неделя -3 (последняя тяжёлая):**
Объём: 100% от пиковой нагрузки
Интенсивность: 80-85% 1ПМ
Цель: «закончить тяжёлую работу»

**Неделя -2 (снижение объёма):**
Объём: 50-60% от пикового
Интенсивность: 85-90% 1ПМ (тяжелее, но меньше)
Продолжительность: сессии короче

**Неделя -1 (разгрузка):**
Объём: 30-40% от пикового
Интенсивность: 90-95% (только специфика, 1-2 подводящих сета)
Цель: ощущать силу, поддерживать нейронную активацию

**День соревнования:**
Разминочная тренировка за 2-4 дня до: 3-5 повторений × 60-70% — почувствовать гриф
День до: полный отдых или лёгкая прогулка

**Важно:**
Сон критично важен в период пика (8-9 ч)
Углеводная загрузка за 2-3 дня: +100-150 г углеводов к обычному
Минимизировать стрессоры — работа, конфликты, новые активности
`;
}
export function getSupercompensation(message: string): string {
  const kw = ['суперкомпенсация', 'supercompensation', 'закон суперкомпенсации', 'пиковая форма адаптация', 'восстановление выше базы'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Суперкомпенсация — теория и практика:**

**Теория суперкомпенсации Яковлева (1955):**
1. Нагрузка → снижение работоспособности (утомление)
2. Восстановление → возврат к исходному уровню
3. Суперкомпенсация → превышение исходного уровня (тренировочный эффект)
4. Возврат к исходному (если нет новой нагрузки)

**Временны́е рамки суперкомпенсации:**
Гликоген: пик через 24-48 ч
Мышечные сократительные белки: пик через 48-72 ч
ЦНС: 72-96 ч после максимальных усилий
Соединительная ткань: 7-14+ дней

**Практическое значение:**

**Правильное время следующей тренировки:**
Тренировать в фазу суперкомпенсации (не слишком рано, не слишком поздно)
Слишком рано: кумуляция усталости, нет полного восстановления
Слишком поздно: суперкомпенсация прошла, вернулись к базе

**Для разных компонентов:**
Нейромышечная усталость после тяжёлой сессии ног: 96-120 ч до следующей тяжёлой
После лёгкой кардио-сессии: 24 ч достаточно
После техническая/скиллового тренинга: 48 ч

**Проблема реального применения:**
Организм не один «резервуар» — много систем с разными временны́ми рамками
Поэтому ориентируемся на практические индикаторы: самочувствие, сон, аппетит, настроение
`;
}
export function getChokingPrevention(message: string): string {
  const kw = ['чокинг', 'choking', 'провал под давлением', 'деградация под нагрузкой', 'теряю форму на соревновании', 'на соревновании хуже чем на тренировке'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Choking (Срыв под давлением) — причины и профилактика:**

**Что такое Choking:**
Резкое ухудшение производительности в стрессовых ситуациях несмотря на высокий уровень подготовки.
Парадокс: чем важнее событие, тем хуже результат.

**Два механизма Choking:**

**1. Self-consciousness (Излишний самоконтроль):**
Обычно навык выполняется автоматически.
Под давлением → начинаешь думать о каждом шаге → разрушаешь автоматику.
Пример: «слежу за техникой жима» → нарушение координации

**2. Arousal-performance (Инвертированная U):**
Оптимальный уровень возбуждения → максимальная производительность.
Слишком высокое возбуждение (паника) → мышечное напряжение, сужение внимания.

**Стратегии профилактики:**

**1. Process focus (Процесс, не результат):**
Концентрация на выполнении, не на исходе
«Следующий подъём» вместо «я должен поднять этот вес»

**2. Pre-performance рутина:**
Стандартизированная последовательность перед каждым подходом/выступлением
Активирует автоматику, отключает избыточный анализ

**3. Тренировки в условиях давления:**
Намеренное создание стресса на тренировках (аудитория, публичный подъём)
Десенсибилизация к давлению

**4. Attentional control:**
Техники управления вниманием — переключение внешнее/внутреннее/узкое/широкое
Внешнее узкое (на цель): оптимально для технических навыков

**5. Дыхание перед подходом:**
4 сек вдох → 6 сек выдох × 3 → снижение ЧСС и напряжения
`;
}
export function getInnerGameConcept(message: string): string {
  const kw = ['внутренняя игра', 'inner game', 'критический голос', 'само 1 само 2', 'галлоуэй теннис', 'тихий разум спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**«Внутренняя Игра» Тимоти Голлуэя — концепция:**

**Суть теории:**
Производительность = Потенциал − Помехи
Помехи = внутренний критический голос (Self 1)
Потенциал реализует тело само (Self 2)

**Self 1 (Рациональный «я»):**
Постоянно анализирует, критикует, даёт инструкции
«Ты поднял слишком рано», «колени завалились», «ты слабак»
Проблема: мешает автоматическому выполнению

**Self 2 (Тело-«я»):**
Естественный исполнитель — умеет выполнять то, что натренировано
Работает лучше, когда Self 1 «замолкает»
Активируется через поглощённость процессом, игру

**Как заглушить Self 1:**

**1. Concentration games (Игры концентрации):**
Следи за мячом/штангой/целью → Self 1 занят наблюдением, не критикой
«Где находится гриф в нижней точке?» → внимание без суждений

**2. Non-judgmental awareness (Безоценочное наблюдение):**
Заметь ошибку без критики: «гриф ушёл вперёд» — просто факт
Не «я идиот», а «интересно, что произошло»

**3. Доверие телу:**
«Пусть случится» — после правильной тренировки тело само знает
Ошибка большинства: перетренированность инструкциями

**4. Образ (Image) вместо инструкции:**
Думай образами движения, не словесными инструкциями
«Представь дугу штанги» vs «держи локти под углом 45°»

**Практика:** на следующей тренировке попробуй 1 подход без внутреннего комментария — только наблюдать.
`;
}
export function getREDSSyndrome(message: string): string {
  const kw = ['reds syndrome', 'относительный дефицит энергии', 'female athlete triad', 'триада спортсменок', 'потеря менструации тренировки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**RED-S и Триада спортсменки — критически важно:**

**Female Athlete Triad (Триада):**
Три взаимосвязанные проблемы:
1. Низкая энергетическая доступность (дефицит относительно нагрузок)
2. Нарушение менструального цикла (аменорея, олигоменорея)
3. Снижение минеральной плотности костей (остеопения/остеопороз)

**RED-S (Relative Energy Deficiency in Sport):**
Расширенная концепция Триады — включает мужчин и более широкий спектр последствий.
Причина: хроническая нехватка калорий относительно энергозатрат.

**Энергетическая доступность (EA):**
EA = (Калории − Затраты на тренировку) / Масса тела без жира
Норма: ≥45 ккал/кг сухой массы
Субклиническая область: 30-45 ккал/кг
Дисфункция: <30 ккал/кг

**Последствия RED-S:**
- Нарушение менструального цикла / аменорея
- Снижение плотности костей → стрессовые переломы
- ↓ Иммунитет, частые заболевания
- ↓ Сила, выносливость, координация
- Психологические проблемы (тревожность, депрессия)
- В долгосрочной перспективе: необратимая потеря костей

**Красные флаги:**
Потеря 3+ менструаций подряд
Стрессовые переломы без контактных травм
Постоянная усталость несмотря на достаточный сон
Чрезмерная озабоченность едой и весом

**Действие:**
При любом из флагов → НЕМЕДЛЕННО увеличить потребление калорий и обратиться к врачу
Это медицинская проблема, не «слабость»
`;
}
export function getPostpartumFitnessGuide(message: string): string {
  const kw = ['послеродовые тренировки', 'после родов тренировки', 'фитнес после беременности', 'возвращение к тренировкам после родов', 'диастаз пресса'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Возвращение к тренировкам после родов:**

**Временны́е рамки:**
Минимум 6-8 нед после обычных родов (медицинское разрешение)
После кесарева сечения: 10-12 нед
Полное «закрытие» тазового дна: 3-6 месяцев
Полное восстановление: 12-18 месяцев

**Диастаз прямых мышц живота:**
Расхождение прямых мышц по белой линии (у 60-100% беременных)
Степень: норма до 2 см, >2 см требует специального подхода
Тест: ляг на спину, подними голову — если пупочная область «провалилась» → диастаз

**Что НЕ делать при диастазе:**
Классические скручивания (crunches)
Планка с выпиранием живота
Тяжёлые упражнения без укрепления тазового дна

**Программа возвращения (по этапам):**

**Неделя 1-6 (база):**
Диафрагмальное дыхание (самое первое)
Активация тазового дна (Кегель-упражнения)
Лёгкие прогулки, постепенное увеличение

**Неделя 6-12 (постепенное введение):**
Мостик ягодичный, bird-dog, dead bug
Приседания без нагрузки
Ходьба 30-45 мин/день

**Неделя 12-20 (умеренные нагрузки):**
Лёгкие силовые, приседания с весом
Избегать высокоударных (прыжки) до укрепления тазового дна

**Неделя 20+ (полноценные тренировки):**
Возврат к обычным программам при отсутствии симптомов
Консультация физиотерапевта тазового дна — золотой стандарт

**При грудном вскармливании:**
↑ Потребность в калориях (+300-500 ккал)
Белок: 1.8-2.2 г/кг
Обильное питьё
`;
}
export function getBalanceFallPrevention(message: string): string {
  const kw = ['баланс тренировки', 'профилактика падений', 'равновесие упражнения', 'координация пожилых', 'устойчивость'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировка баланса и профилактика падений:**

**Статистика:** Падения — причина №1 травм у людей 65+
Тренировка баланса снижает риск падений на 23-40% (мета-анализ Sherrington 2019)

**Три системы равновесия:**
1. Вестибулярная (внутреннее ухо)
2. Проприоцептивная (мышцы, суставы)
3. Зрительная

**Упражнения (от простого к сложному):**
Уровень 1: стойка на одной ноге (у стены) — 30 сек × 3
Уровень 2: тандемная стойка (пятка к носку) — 30 сек × 3
Уровень 3: стойка на одной ноге с закрытыми глазами — 20 сек × 3
Уровень 4: стойка на нестабильной поверхности (подушка)
Уровень 5: динамический баланс — шаги с поворотами, перешагивания через препятствия

**Интеграция в силовую:**
Выпады (вперёд, назад, боковые)
Приседания на одной ноге (с поддержкой)
Становая на одной ноге (румынская)
Step-up на платформу
Фермерская прогулка (тяжёлая — лучшее для хвата + баланса)

**Частота:** 3+ раз в неделю, 10-15 мин
`;
}
export function getCoreStabilityProtocol(message: string): string {
  const kw = ['кор стабильность', 'укрепление кора', 'пресс функциональный', 'стабилизация корпуса', 'антиротация'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировка кора для стабильности (не для "кубиков"):**

**Stuart McGill "Big 3" (доказано для здоровья спины):**
1. Curl-up (не скручивание!): руки под поясницу, одно колено согнуто, отрыв головы+плеч на 2 см → 3× (10, 8, 6)
2. Bird-dog: стоя на четвереньках, вытягивание противоположной руки и ноги → 3× (10, 8, 6)
3. Side plank: на локте, прямое тело → 3× (10, 8, 6 сек)
Порядок важен. Пирамида убывающая (10-8-6).

**Функциональная классификация кора:**
Анти-разгибание: планка, roll-out, body saw
Анти-сгибание: обратная гиперэкстензия, рюкзак с весом
Анти-ротация: Pallof press, птичья собака, одноручные фермерские
Анти-латеральное сгибание: чемоданная прогулка, боковая планка

**Прогрессия:**
Уровень 1: McGill Big 3 + планка → 2-4 недели
Уровень 2: Pallof press + roll-out + suitcase carry → 4-6 недель
Уровень 3: Turkish get-up + одноручные упражнения + hanging leg raise

**Важно:**
Кор тренируется при ЛЮБЫХ тяжёлых многосуставных (приседания, тяги, жимы)
Изолированная работа — дополнение, не основа
Скручивания позвоночника под нагрузкой ≠ безопасно (McGill)
Вакуум живота — для поперечной мышцы, не для стабильности
`;
}
export function getMovementScreeningSelfTest(message: string): string {
  const kw = ['оценка движений', 'скрининг тела', 'мышечный дисбаланс', 'асимметрия тела', 'слабые места'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Самостоятельная оценка качества движений:**

**Overhead Squat Assessment (приседание руки вверх):**
Что смотрим: стопы, колени, таз, спина, плечи
Компенсации:
- Пятки отрываются → ↓ мобильность голеностопа, укорочение икр
- Колени внутрь (вальгус) → слабые ягодичные (средняя), укороченные приводящие
- Передний наклон таза → укорочение сгибателей бедра, слабый пресс
- Округление спины → ↓ мобильность грудного, слабые разгибатели
- Руки падают вперёд → укорочение широчайших/грудных, ↓ мобильность плеч

**Single Leg Tests:**
Приседание на одной ноге (пистолетик к стулу):
- Колено уходит внутрь → слабая средняя ягодичная
- Таз проваливается → слабые абдукторы
- Не можешь встать → слабый квадрицепс/ягодичные

**Push-up Test:**
Лопатки "крылят" → слабая передняя зубчатая
Поясница прогибается → слабый кор
Голова уходит вперёд → дисбаланс шейных мышц

**Коррекция (общая стратегия):**
1. Растяжка коротких мышц (статика после тренировки)
2. Активация слабых мышц (изоляция перед тренировкой)
3. Интеграция в движение (базовые упражнения с правильной техникой)
Пример: колено внутрь → растяжка приводящих + активация средней ягодичной (band walks) + приседания с резинкой на коленях
`;
}
export function getGeneticsAndMuscleType(message: string): string {
  const kw = ['генетика мышцы', 'тип мышечных волокон', 'быстрые медленные волокна', 'генетика и спорт', 'мышечный потенциал'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Генетика и типы мышечных волокон:**

**Два основных типа:**
Тип I (медленные, окислительные): выносливость, аэробная работа, 60+ повторений
Тип II (быстрые, гликолитические): сила, мощность, спринт
  - IIa: промежуточные (сила + некоторая выносливость)
  - IIx: чисто быстрые (максимальная мощность, быстро утомляются)

**Генетическое распределение:**
Среднестатистический человек: ~50% тип I, ~50% тип II
Элита в выносливости (марафонцы): до 80-90% тип I
Элита в спринте/силе: до 70-80% тип II
Распределение определяется генетикой на ~45%, тренировками на ~55%

**Как определить свой тип:**
Тест 80%: возьми 80% от 1ПМ и сделай максимум повторений
>12 повторений → преобладание медленных → больше объёма (12-20 повторений)
<7 повторений → преобладание быстрых → тяжёлые веса (3-8 повторений)
7-12 → смешанный → стандартная гипертрофия

**Практическое применение:**
Больше медленных → дольше отдых, больше подходов, выше частота
Больше быстрых → тяжелее веса, короче подходы, больше отдых
Важно: тренировки МОГУТ частично конвертировать IIx → IIa (но не I → II)
`;
}
export function getGeneticMuscleBuilding(message: string): string {
  const kw = ['генетический потенциал', 'максимум мышц', 'натуральный лимит', 'сколько мышц набрать', 'генетический предел'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Генетический потенциал набора мышечной массы:**

**Модель Лайла МакДональда (натуральный предел):**
Год 1: ~10-13 кг мышц (мужчины) / 5-6 кг (женщины)
Год 2: ~5-6 кг / 2.5-3 кг
Год 3: ~2.5-3 кг / 1-1.5 кг
Год 4+: ~1-1.5 кг / 0.5 кг
Итого за карьеру: 20-25 кг чистых мышц (мужчины) / 10-12 кг (женщины)

**Модель Мартина Беркхана (FFMI):**
FFMI (Fat-Free Mass Index) = мышечная масса / рост²
Натуральный предел мужчин: FFMI ~25 (±1)
Натуральный предел женщин: FFMI ~22 (±1)
FFMI > 26 без ПАВ — крайне маловероятно

**Факторы, влияющие на потенциал:**
Длина мышечных брюшек (генетика — нельзя изменить)
Точки крепления сухожилий (рычаги)
Гормональный профиль (тестостерон, ГР, кортизол)
Инсулиновая чувствительность
Плотность андрогенных рецепторов

**Практический вывод:**
Не сравнивай себя с другими — у всех разная генетика
Фокусируйся на собственном прогрессе: +5 кг к жиму за 3 мес > "как у блогера"
Генетика определяет потолок, но 99% людей далеки от него
`;
}
export function getHormonalOptimization(message: string): string {
  const kw = ['тестостерон поднять', 'гормоны натурально', 'тестостерон натуральный', 'повысить тестостерон', 'гормональная оптимизация'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Натуральная оптимизация тестостерона:**

**Доказательные методы:**

1. **Сон** (самый важный):
   7-9 часов, ложиться до 23:00
   1 неделя 5ч сна = ↓ тестостерон на 10-15%

2. **Силовые тренировки:**
   Базовые многосуставные: приседания, тяга, жимы
   Объём > интенсивности для гормонального отклика
   Не перетренируйся: хронический перетрен ↓ тестостерон

3. **Питание:**
   Жиры: минимум 0.8 г/кг (холестерин → прекурсор тестостерона)
   Не менее 20% калорий из жиров
   Цинк: 15-30 мг/день (мясо, тыквенные семечки)
   Витамин D: 2000-5000 МЕ/день (особенно зимой в России)
   Магний: 200-400 мг/день

4. **Управление стрессом:**
   Хронический кортизол подавляет тестостерон
   Медитация, ходьба на природе, дыхательные практики

5. **Жировая масса:**
   Ожирение → ↑ ароматаза → тестостерон → эстрадиол
   Снижение % жира до 12-18% (мужчины) = ↑ тестостерон

**Что НЕ работает:**
Трибулус, мака, DHEA — нет доказательств для здоровых мужчин
"Бустеры тестостерона" — маркетинг

**Нормы:**
Общий тестостерон: 12-35 нмоль/л (мужчины)
Если <12 + симптомы → к эндокринологу, не в зал
`;
}
export function getGeneticTestingFitness(message: string): string {
  const kw = ['генетический тест', 'днк тест спорт', 'генетика фитнес тест', 'тест на генетику', 'генетический анализ'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Генетическое тестирование для фитнеса:**

**Что реально показывают тесты:**
ACTN3 (ген спринтера): R/R = больше быстрых волокон, X/X = выносливость
ACE (ангиотензин): I/I = выносливость, D/D = сила
PPARGC1A: эффективность митохондрий
IL-6, TNF-α: скорость восстановления после воспаления
MTHFR: метаболизм фолата → влияет на восстановление
CYP1A2: метаболизм кофеина (быстрый/медленный)
LACT: толерантность к лактозе

**Что они НЕ показывают:**
Точный "идеальный вид спорта"
Сколько мышц ты наберёшь
Какая программа "лучшая" именно для тебя

**Стоит ли делать?**
Плюсы: интересная информация, может подсказать направление
Минусы: не меняет фундаментальные принципы тренировок
Вердикт: если есть деньги и любопытство — почему нет
Но НИКОГДА не ставь генетику как ограничение: "мне не дано" = самосаботаж

**Практический подход без тестов:**
Попробуй разные стили (сила, выносливость, гибридный) по 8-12 недель
Где прогрессируешь быстрее → там твоя генетика сильнее
Субъективное удовольствие важнее генетики для долгосрочности
`;
}
export function getMetconDesign(message: string): string {
  const kw = ['метакон тренировка', 'круговая тренировка', 'метаболический кондиционинг', 'жиросжигающая тренировка', 'circuit training'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Метаболический кондиционинг (MetCon):**

**Что это:** высокоинтенсивная работа, сочетающая силу и кардио
Цель: ↑ EPOC (дожигание калорий), ↑ работоспособность, ↑ жиросжигание

**Принципы дизайна MetCon:**

1. **Чередуй верх/низ** (чтобы работать дольше):
   Пример: приседания → отжимания → выпады → подтягивания

2. **Push/Pull/Legs ротация:**
   Жим → тяга → ноги → повтор
   Минимальный отдых между упражнениями

3. **Выбирай простые движения:**
   ✅ Бёрпи, KB swing, box jump, row, bike
   ❌ Сложные упражнения (рывок, толчок) — только если техника идеальна

**Проверенные форматы:**

EMOM 20 мин:
Нечётная минута: 12 KB swings
Чётная минута: 8 бёрпи

AMRAP 15 мин:
10 air squats + 8 push-ups + 6 pull-ups + 200м бег

Tabata 16 мин (4 упражнения):
Air squat / Push-up / Sit-up / Burpee
20 сек работа / 10 сек отдых × 8 на каждое

**Частота:** 2-3 MetCon/неделю, не каждый день (восстановление!)
`;
}
export function getWorkCapacityBuilding(message: string): string {
  const kw = ['рабочая ёмкость', 'work capacity', 'тренировочный объём увеличить', 'больше тренироваться', 'выносливость в зале'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Построение рабочей ёмкости (Work Capacity):**

**Что это:** способность выполнять и восстанавливаться от большого объёма тренировок
Без рабочей ёмкости: не сможешь тренироваться достаточно для прогресса

**Как строить (постепенно!):**

1. **Увеличивай объём на 10-20% в неделю:**
   Неделя 1: 12 подходов на группу
   Неделя 2: 14 подходов
   Неделя 3: 16 подходов
   Неделя 4: deload (8-10 подходов)
   Повтор с нового уровня

2. **Добавляй плотность (density):**
   Сокращай отдых: 3 мин → 2.5 → 2 мин
   Используй суперсеты (антагонисты)
   Giant sets для аксессоров

3. **Кардио база:**
   Zone 2: 3-4 раза/неделю по 30-45 мин
   Это ФУНДАМЕНТ — без аэробной базы восстановление медленное

4. **GPP (General Physical Preparedness):**
   Прогулки с весом (фермерская, прогулка с санями)
   Лёгкие метконы 1-2 раза/неделю
   Ежедневная активность: 8000+ шагов

**Признаки что ёмкость растёт:**
Меньше усталость после тренировок
Быстрее восстановление ЧСС
Можешь добавлять подходы без ↓ качества
Меньше DOMS

**Типичная ошибка:** сразу копировать программу продвинутого атлета
→ Его ёмкость строилась годами, твоя — ещё нет
`;
}
export function getNutrientTiming(message: string): string {
  const kw = ['тайминг питания', 'когда есть', 'еда до тренировки', 'еда после тренировки', 'нутриент тайминг'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тайминг нутриентов (Nutrient Timing):**

**До тренировки (1-3 часа):**
Углеводы: 1-2 г/кг (для гликогена)
Белок: 20-30 г
Жиры: минимум (замедляют пищеварение)
Пример: рис + курица + немного овощей
Если <1 часа: банан + протеин (быстро усваивается)

**Во время тренировки (>60 мин):**
BCAA или EAA: 5-10 г (если натощак)
Углеводы: 30-60 г/час (для длинных сессий)
Для большинства силовых <60 мин: достаточно воды

**После тренировки (0-2 часа):**
"Анаболическое окно" — существует, но шире, чем думали
Белок: 30-50 г (стимулирует MPS максимально)
Углеводы: 0.5-1 г/кг (для восполнения гликогена)
Жиры: не мешают усвоению белка (миф)

**Правда об анаболическом окне:**
Если ел за 2-3ч до тренировки → окно не критично (ещё есть аминокислоты в крови)
Если тренировался натощак → белок ASAP (в течение 1ч)
Общий дневной белок важнее тайминга
`;
}
export function getGutHealthFitness(message: string): string {
  const kw = ['здоровье кишечника', 'микробиом', 'пробиотики', 'вздутие', 'пищеварение спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Здоровье кишечника для атлетов:**

**Почему важно:**
70% иммунитета — в кишечнике
Микробиом влияет на: усвоение белка, воспаление, настроение, сон
Интенсивные тренировки ↑ проницаемость кишечника ("leaky gut")

**Как поддержать микробиом:**

Пребиотики (корм для бактерий):
Клетчатка: 25-35 г/день (овощи, фрукты, бобовые, овсянка)
Инулин: лук, чеснок, бананы, артишок
Крахмал резистентный: варёный и охлаждённый картофель/рис

Пробиотики (полезные бактерии):
Кефир, йогурт, квашеная капуста, кимчи
Добавки: Lactobacillus, Bifidobacterium (10+ млрд КОЕ/день)

Избегать:
Чрезмерный белок (>3 г/кг) → ↑ гнилостные бактерии
Искусственные подсластители (сукралоза — спорно)
Антибиотики без необходимости
НПВС (ибупрофен) регулярно → ↑ проницаемость

**При вздутии на высокобелковой диете:**
Добавь ферменты (бромелаин, папаин)
Разделяй белок на 4-5 приёмов (не 2 больших)
L-глутамин: 5-10 г/день (поддержка слизистой)
`;
}
export function getBreathworkBiohacking(message: string): string {
  const kw = ['дыхательные практики', 'вим хоф метод', 'гипервентиляция', 'контроль дыхания', 'пранаяма спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Дыхательные практики для биохакинга:**

**Wim Hof Method:**
30 глубоких вдохов (быстро, через рот)
→ Задержка на выдохе (до дискомфорта, 1-3 мин)
→ Вдох, задержка 15 сек
Повтор ×3 раунда
Эффект: ↑ pH крови, ↑ адреналин, ↑ иммунитет, ↓ воспаление

**Box Breathing (Navy SEALs):**
Вдох 4 сек → задержка 4 сек → выдох 4 сек → задержка 4 сек
Повтор 5-10 мин
Эффект: ↓ тревога, ↑ фокус, баланс ВНС

**Physiological Sigh (Хуберман):**
Двойной вдох через нос (2 коротких) → длинный выдох через рот
1-3 повторения
Самый быстрый способ снизить стресс в моменте

**4-7-8 (Эндрю Вейл):**
Вдох 4 сек → задержка 7 сек → выдох 8 сек
Перед сном: 4 цикла
Эффект: активация парасимпатики → ↓ ЧСС → сон

**Nasal Breathing (носовое дыхание):**
При тренировках Zone 2: только нос
↑ NO (оксид азота) на 15% → ↑ вазодилатация
↑ CO2 толерантность → ↑ выносливость
Тренировка: 3 мин бег носом / 1 мин ртом → увеличивай
`;
}
export function getNeuroplasticityFitness(message: string): string {
  const kw = ['нейропластичность', 'мозг и тренировки', 'когнитивные функции', 'bdnf', 'спорт и мозг'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки и нейропластичность:**

**BDNF (Brain-Derived Neurotrophic Factor):**
"Удобрение для мозга" — белок, который стимулирует рост нейронов
Кардио ↑ BDNF на 30-40% (особенно Zone 2-3)
Силовые ↑ BDNF на 20-30%
Комбинация = максимальный эффект

**Что тренировки делают для мозга:**
↑ Объём гиппокампа на 2% за год (Erickson 2011)
↑ Память и обучение
↓ Риск Альцгеймера на 45%
↓ Депрессия (эффект сравним с антидепрессантами при лёгкой-средней)
↑ Исполнительные функции (планирование, самоконтроль)

**Оптимальный протокол для мозга:**
Кардио: 150+ мин/неделю Zone 2 (для BDNF)
Силовые: 2-3 раза/неделю (для IGF-1 → нейрогенез)
Координация: новые навыки (танцы, единоборства, жонглирование)
→ Новизна + физическая нагрузка = максимальная нейропластичность

**Тайминг для обучения:**
Тренировка → через 1-2 часа → учёба/работа
(↑ BDNF + ↑ дофамин + ↑ норадреналин = ↑ усвоение информации)
`;
}
export function getTendinopathyManagement(message: string): string {
  const kw = ['тендинит', 'тендинопатия', 'сухожилие болит', 'локоть теннисист', 'ахилл болит'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тендинопатия — управление и лечение:**

**Что это:** Дегенерация сухожилия (НЕ воспаление, вопреки названию "тендинит")
Причина: перегрузка + недостаточное восстановление

**Частые локализации у атлетов:**
Коленная (patellar) — "колено прыгуна"
Ахиллова — задняя часть голени
Латеральный эпикондилит — "локоть теннисиста"
Медиальный эпикондилит — "локоть гольфиста"

**Протокол лечения (Silbernagel/Alfredson):**

Фаза 1 (1-2 недели): изометрия
45 сек удержание при 70% макс усилия, 5 повторений × 3 подхода
Пример (колено): wall sit, удержание 45° × 45 сек

Фаза 2 (2-6 недель): тяжёлые медленные эксцентрики
Пример: эксцентрические приседания на наклонной 25°
3 сек вниз × 15 повторений × 3 подхода × 2 раза/день

Фаза 3 (6-12 недель): возврат к нагрузке
Постепенное возвращение к нормальным тренировкам
↑ 10% нагрузки в неделю

**Что НЕ помогает:**
Полный отдых (сухожилие ещё больше ослабнет)
Растяжка (↑ компрессия → ↑ боль)
Кортизон (временное облегчение, но ↓ качество сухожилия)
`;
}
export function getPosturalCorrection(message: string): string {
  const kw = ['осанка исправить', 'кифоз', 'сутулость', 'передний наклон таза', 'лордоз'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Коррекция осанки через тренировки:**

**Верхний перекрёстный синдром (сутулость/кифоз):**
Причина: сидение → укорочены грудные + верхние трапеции, ослаблены нижние трапеции + глубокие сгибатели шеи

Программа (ежедневно 10 мин):
Растяжка грудных в дверном проёме: 3×30 сек
Chin tucks (подтягивание подбородка): 3×15
Face pulls: 3×20 (лёгкий вес)
Prone Y-raises: 3×10
Foam roller — лёжа вдоль валика, руки в стороны: 2-3 мин

**Нижний перекрёстный синдром (передний наклон таза):**
Причина: сидение → укорочены сгибатели бедра + поясничные разгибатели, ослаблены ягодичные + пресс

Программа:
Couch stretch (растяжка сгибателей): 2×60 сек на ногу
Glute bridge: 3×15 (с паузой 3 сек наверху)
Dead bug: 3×8 на сторону
Plank: 3×30 сек (активно втягивай живот)

**Главное правило:**
Осанка — это не поза, а привычка движения
Нельзя "исправить" осанку за 5 мин зарядки и сидеть криво 8 часов
Чередуй позы: стоя/сидя каждые 30-60 мин
Силовые тренировки с полной амплитудой — лучшее для осанки
`;
}
export function getMartialArtsConditioning(message: string): string {
  const kw = ['бокс подготовка', 'мма физподготовка', 'единоборства зал', 'борьба тренировки', 'ударка и зал'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Физическая подготовка для единоборств:**

**Требования:** Взрывная сила, выносливость, хват, кор, мощность

**Силовая (2-3 раза/нед):**
Базовые: приседания, тяга, жим, подтягивания (3-5 повторений, тяжело)
Взрывные: power clean, push press, med ball throws
Хват: farmer's walk 3×30м, towel pull-ups, wrist curls
Шея: 4-стороннее укрепление (профилактика нокаутов)

**Кондиционная (специфика):**

Для бокса/ММА (3 мин раунд):
Интервалы 3 мин работа / 1 мин отдых × 5-8 раундов
Работа: мешок, лапы, спарринг или круговая

Для борьбы (2×3 мин или 3×3 мин):
Интервалы с партнёром: 30 сек ALL-OUT борьба / 30 сек отдых × 10
Гиревые комплексы: 5 мин AMRAP (swing + clean + press)
Санки/тяги: имитация давления

**Кор для ударников:**
Pallof press: 3×10 (антиротация)
Med ball rotation throw: 3×8 на сторону
Hanging leg raise: 3×10
Cable woodchop: 3×10

**Распределение в неделю:**
Пн: Силовая верх + кондиционная
Вт: Техника
Ср: Силовая низ + кор
Чт: Спарринг
Пт: Взрывная + кондиционная
Сб: Лёгкая техника / восстановление
`;
}
export function getMindBodyConnectionV2(message: string): string {
  const kw = ['связь разума и тела', 'психосоматика спорт', 'ментальное восстановление', 'нейромышечная связь'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Нейромышечная связь и психосоматика в спорте:**

**Нейромышечная связь (Mind-Muscle Connection):**
Фокус на целевой мышце во время движения ↑ её активацию на 10-15% (ЭМГ данные)
Как тренировать: работа с 40-60% 1ПМ без темпа, полная концентрация
Применение: изолирующие упражнения — ДА. Базовые движения — нет (↓ производительность)

**Влияние психологического стресса на физическое восстановление:**
Кортизол от работы/отношений = кортизол от перетренированности
При высоком стрессе в жизни: снижай объём тренировок на 20-30%
Психологическое выгорание предшествует физическому

**Техники ментального восстановления:**
Прогрессивная мышечная релаксация: 10-15 мин → ↓ кортизол
Нидра-йога (Yoga Nidra): 20 мин = 1-2ч сна по восстановительному эффекту
Биофидбэк дыхание (4-7-8): активация парасимпатики за 5 мин

**Признаки ментального перетренирования:**
- Потеря удовольствия от тренировок (была мотивация — пропала)
- Тревожность, раздражительность без причины
- Навязчивые мысли о тренировках/диете
- Ухудшение когнитивных функций: память, концентрация
`;
}
export function getBreathingMechanics(message: string): string {
  const kw = ['механика дыхания', 'дыхание на тренировке', 'техника дыхания спорт', 'дыхание при жиме', 'valsalva маневр', 'как правильно дышать на тренировке'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Механика дыхания в силовом тренинге:**

**Манёвр Вальсальвы (Valsalva Maneuver):**
Глубокий вдох → закрыть голосовую щель → натужиться → создание внутрибрюшного давления (IAP)
IAP = естественный "пояс" — ↑ жёсткость позвоночника на 40-70%
Применение: субмаксимальные нагрузки (>85% 1ПМ), присед, становая, жим

**Когда использовать Valsalva:**
Максимальные и субмаксимальные попытки — обязательно
Лёгкие нагрузки (<60% 1ПМ) — стандартное дыхание
НЕ применять: гипертония 2-3 ст., глаукома, после инфаркта/инсульта

**Стандартная техника при умеренных нагрузках:**
Выдох в преодолевающей фазе (подъём), вдох в уступающей (опускание)
Присед: вдох перед спуском → выдох при вставании
Жим: вдох перед опусканием → выдох при жиме

**360° дыхание (для кора):**
Вдох должен расширять живот во ВСЕ стороны: вперёд + назад + в стороны
НЕ только грудью — диафрагмальное дыхание активирует глубокий кор
Проверка: руки на рёбрах → почувствовать боковое расширение при вдохе

**Дыхание и восстановление:**
Физиологический вздох: двойной вдох носом → длинный выдох ртом
Сбрасывает CO₂, активирует парасимпатику, снижает ЧСС быстрее
После тяжёлого подхода: 2-3 физиологических вздоха → нормальное дыхание

**Box Breathing (2-4-6-2):**
Вдох 4 сек → задержка 4 сек → выдох 4 сек → задержка 4 сек
Снижает кортизол, улучшает фокус перед подходом
`;
}
export function getFunctionalMovementPatterns(message: string): string {
  const kw = ['функциональные паттерны движения', 'фундаментальные движения', 'squат hinge push pull', 'паттерн движения тренировка', 'базовые паттерны силовой'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Функциональные паттерны движения:**

**7 базовых паттернов:**
1. **Squat (приседание)**: двустороннее разгибание бедра/колена — присед, гоблет, фронтальный
2. **Hip Hinge (тяга)**: сгибание в тазобедренном суставе с нейтральным позвоночником — становая, румынская, свинг
3. **Push (толкание) — горизонтальное**: жим лёжа, отжимания, дипы
4. **Push (толкание) — вертикальное**: жим стоя, армейский жим, pike push-up
5. **Pull (тяга) — горизонтальная**: тяга к поясу, горизонтальные тяги
6. **Pull (тяга) — вертикальная**: подтягивания, тяга верхнего блока
7. **Carry (перенос)**: farmer carry, suitcase carry, overhead carry — интеграция всего

**Принцип баланса паттернов:**
Push : Pull = 1:1 (или в пользу pull) — профилактика проблем плечевого пояса
Squat : Hinge = 1:1 — развитие передней и задней цепи равномерно

**Одностороннее движение (Unilateral):**
Bulgarian split squat, lunges (squat-паттерн)
Single-leg deadlift, step-up (hinge-паттерн)
1-arm row, single-arm press
Устраняет асимметрию, тренирует стабилизаторы

**Ошибка программирования:**
Только «пляжные» упражнения (бицепс/пресс/грудь) без тяги и ног
→ мышечный дисбаланс, боли в спине/плечах, слабая спортивная форма

**Минимальная программа на всё тело (4 паттерна в 1 тренировке):**
Squat + Hinge + Push + Pull = полное тело за 40 мин
Пример: присед + румынская тяга + жим гантелей + тяга к поясу
`;
}
export function getSupercompensationV2(message: string): string {
  const kw = ['суперкомпенсация', 'принцип суперкомпенсации', 'период восстановления', 'когда тренироваться снова', 'переутомление адаптация'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Теория суперкомпенсации:**

**Принцип:**
После нагрузки → истощение → восстановление → суперкомпенсация (уровень выше исходного) → возврат к базе
Следующая тренировка должна попасть в фазу суперкомпенсации — тогда идёт прогресс

**Тайминг по системам:**
Фосфатная система (взрывная сила): восстановление 48-72ч
Гликолиз (силовые): суперкомпенсация 48-96ч
Аэробная система: 24-48ч
Нервная система: 72-96ч+ (после максимальных усилий)
Гормоны (тестостерон): 48-72ч

**Практические следствия:**
Одна группа мышц 2-3 раза/нед — оптимально для большинства
Слишком часто = не успеваешь восстановиться (не попадаешь в фазу)
Слишком редко = возврат к базе, нет прогресса
Симптом недовосстановления: сила падает, нет прогресса 2+ недели подряд

**Функциональное перенапряжение vs перетренированность:**
Функциональное (planned overreaching): 1-2 недели повышенной нагрузки → затем тейпер → суперкомпенсация
Нефункциональное: нарушение сна, раздражительность, потеря мотивации — нужен полный отдых
`;
}
export function getTimeUnderTension(message: string): string {
  const kw = ['время под нагрузкой', 'темп повторений', 'тайм андер тензион', 'медленные повторения', 'эксцентрика'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Время под нагрузкой (Time Under Tension, TUT) — научный подход:**

**Что такое TUT:**
Время, в течение которого мышца находится под нагрузкой за один подход. Ключевой параметр, который многие игнорируют, сосредотачиваясь только на весе и повторениях.

**Оптимальные диапазоны TUT:**
Гипертрофия: 40-70 секунд на подход (золотой стандарт по Schoenfeld 2015)
Сила: 20-40 секунд (тяжёлые веса, меньше повторений)
Выносливость: 70-100 секунд (лёгкие веса, много повторений)

**Нотация темпа (4 цифры):**
Формат: эксцентрика - пауза внизу - концентрика - пауза вверху
Пример: 3-1-2-0 = 3 сек опускание, 1 сек пауза, 2 сек подъём, 0 пауза вверху = 6 сек на повторение
Для 10 повторений: 10 × 6 = 60 сек TUT → идеально для гипертрофии

**Темпы для разных целей:**
Гипертрофия: 3-1-2-0 или 4-0-2-0 (5-6 сек/повтор × 8-12 = 40-72 сек)
Сила: 2-0-1-0 (3 сек/повтор × 3-6 = 9-18 сек) — быстро и мощно
Эксцентрический акцент: 5-1-1-0 (7 сек/повтор) — максимальное повреждение мышечных волокон

**Эксцентрический тренинг:**
Schoenfeld (2017): акцент на эксцентрике даёт +40% гипертрофии vs только концентрика
Эксцентрическая фаза — основной источник микроповреждений мышц (стимул для роста)
Мышца может выдерживать на 20-40% больше веса в эксцентрике → можно использовать сверхнагрузки

**Практические советы:**
Считайте темп вслух (или про себя) — это дисциплинирует
Уменьшите рабочий вес на 20-30% при переходе на контролируемый темп
Не используйте медленный темп во ВСЕХ упражнениях — чередуйте с взрывными
2-3 упражнения с контролируемым темпом за тренировку достаточно
Лучше всего работает на изолирующих упражнениях и машинах (безопаснее)
`;
}
export function getGymEtiquette(message: string): string {
  const kw = ['правила в зале', 'этикет спортзала', 'поведение в зале'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Этикет спортзала — правила, которые уважают все:**

**Основные правила:**
1. ВСЕГДА возвращайте веса на место. Это правило №1. Разбросанные блины — признак неуважения к другим.
2. Протирайте оборудование после использования — полотенце или антисептические салфетки.
3. Не занимайте оборудование между подходами — если отдыхаете, дайте другим «вработаться» (work in).

**Работа с оборудованием:**
Не стойте перед стойкой с гантелями — берите гантели и отходите
Не делайте суперсеты на 3+ снарядах в час пик — это блокирует оборудование для других
Если нужно несколько пар гантелей — спросите, не мешаете ли кому
Силовую раму используйте для приседаний/жима, а не для сгибаний на бицепс

**Социальные нормы:**
Наушники = «не беспокоить». Если человек в наушниках — не начинайте разговор без необходимости.
Спрашивайте «Можно вработаться?» (Can I work in?) — это нормальная практика, не стесняйтесь.
Не давайте непрошеные советы по технике — только если видите реальную опасность травмы.
Не занимайте скамью для сидения с телефоном — скамья для упражнений.

**Телефон и съёмка:**
Между подходами — допустимо (таймер, запись результатов, музыка)
Съёмка себя: допустимо, но НЕ снимайте других людей без разрешения
Не занимайте зеркало для селфи, если кто-то контролирует технику
Длинные разговоры по телефону — выйдите из зала

**Гигиена:**
Чистая спортивная одежда каждую тренировку
Дезодорант — обязательно, сильный парфюм — нет (в закрытом помещении раздражает)
Своё полотенце — стелите на скамьи и тренажёры
Сланцы в душе — для вашей же безопасности

**Уважение к пространству:**
Не ходите перед человеком, который делает подход (особенно перед зеркалом)
Не стойте вплотную к работающему атлету
Если нужен снаряд — подождите, пока человек закончит подход, затем спросите
Будьте вежливы и приветливы — хорошая атмосфера в зале = лучшие тренировки для всех
`;
}
export function getBodyRecomposition(message: string): string {
  const kw = ['рекомпозиция тела', 'одновременно набрать мышцы и сбросить жир', 'body recomp', 'рекомп'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Рекомпозиция тела — одновременный набор мышц и сжигание жира:**

**Для кого реально работает:**
Новички в тренажёрном зале (первые 6-12 месяцев) — "newbie gains" позволяют одновременно
Возвращающиеся после перерыва (muscle memory — ядра мышечных клеток сохраняются годами)
Люди с избыточным весом (жировые запасы = источник энергии для роста мышц)
Продвинутые атлеты — рекомпозиция крайне медленная и почти незаметная

**Калорийность для рекомпа:**
Поддерживающий уровень (TDEE) или лёгкий дефицит -200 ккал (не больше!)
Сильный дефицит (-500 и более) — будет потеря жира, но мышцы расти не будут
Профицит (+300 и более) — будет рост мышц, но жир тоже увеличится
Goldilocks zone: -100 до -200 ккал от TDEE

**Высокий белок — обязательно:**
2.0-2.4 г/кг массы тела — выше нормы, чтобы максимизировать MPS в условиях дефицита
При дефиците калорий организм склонен разрушать мышцы — белок это компенсирует
Распределение: 4-5 приёмов по 30-50г белка равномерно в течение дня

**Силовые тренировки — обязательно:**
Без силовых рекомпозиция невозможна — сигнал для роста мышц
3-4 тренировки в неделю, фокус на базовых упражнениях (присед, тяга, жим)
Прогрессивная перегрузка: добавляйте вес/повторения каждую неделю
Кардио: умеренно (2-3 сессии по 20-30 мин), не переусердствуйте

**Терпение — ключ к успеху:**
Видимые результаты: 3-6 месяцев (медленнее, чем чистый набор или чистая сушка)
Вес на весах может НЕ меняться (мышцы тяжелее жира при том же объёме)
Отслеживание: обхваты тела (талия, бицепс, бёдра), фото каждые 4 недели, % жира
НЕ ориентируйтесь только на весы — они врут при рекомпе

**Ожидания по результатам:**
Новичок с избыточным весом: -1-2 кг жира + 0.5-1 кг мышц в месяц (лучший сценарий)
Тренированный: -0.5 кг жира + 0.2-0.3 кг мышц в месяц (реалистично)
Если прогресс остановился через 4-6 месяцев — рассмотрите переход на циклы набор/сушка
`;
}
export function getCommonMistakes(message: string): string {
  const kw = ['ошибки в зале', 'типичные ошибки новичков', 'что делают не так', 'ошибки тренировки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Топ-10 типичных ошибок в тренажёрном зале:**

**1. Ego lifting (поднимание эго, а не мышц):**
Слишком тяжёлый вес → ломается техника → нет стимула для мышц + риск травмы
Правило: если не можете выполнить 80% повторений с чистой техникой — вес слишком большой
Никого в зале не волнует, сколько вы жмёте. Всем всё равно.

**2. Пропуск дня ног:**
Тренировка только верха тела = мышечный дисбаланс + слабый фундамент
Ноги — самая большая мышечная группа, их тренировка повышает анаболические гормоны
Минимум: приседания + румынская тяга 2 раза в неделю

**3. Отсутствие прогрессивной перегрузки:**
Один и тот же вес месяцами = ноль прогресса (мышцы адаптировались)
Каждую неделю добавляйте: +1-2 повторения, +2.5 кг, -10 сек отдыха, +1 подход

**4. Слишком много объёма слишком рано:**
Новичок: 10-12 подходов на группу мышц в неделю — достаточно
Программа из интернета на 25+ подходов — для продвинутых на стероидах
Больше ≠ лучше. Восстановление = рост.

**5. Игнорирование питания:**
"Тренируюсь 5 раз в неделю, но не расту" — скорее всего, мало едите/мало белка
Тренировка — это стимул. Еда — это строительный материал. Без еды нет роста.

**6. Недосып:**
Сон < 7 часов: снижение тестостерона на 15%, увеличение кортизола, плохое восстановление
Большинство мышечного роста происходит во сне (пик гормона роста)
7-9 часов — не роскошь, а необходимость для прогресса

**7. Сравнение с другими:**
Генетика, стаж, фармакология — вы не знаете чужую историю
Сравнивайте себя только с собой прошлым. Прогресс — относительная величина.

**8. Program hopping (прыжки между программами):**
Новая программа каждые 2 недели → ноль адаптации ни к одной из них
Минимум 6-8 недель на одной программе, чтобы оценить результат
Лучшая программа — та, которой вы следуете последовательно

**9. Не ведёте дневник тренировок:**
Без записей невозможно отследить прогрессию — вы просто "ходите в зал"
Записывайте: упражнение, вес, повторения, RPE — каждый подход (используйте это приложение!)

**10. Статическая растяжка ПЕРЕД силовой:**
Статическая растяжка перед тренировкой снижает силу на 5-8% (Simic et al. 2013)
ДО тренировки: динамическая разминка (круговые движения, выпады, махи)
ПОСЛЕ тренировки: статическая растяжка — безопасно и полезно для гибкости
`;
}
export function getBloodFlowRestriction(message: string): string {
  const kw = ['окклюзионный тренинг подробно', 'bfr подробно', 'тренировки с жгутом'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**BFR (Blood Flow Restriction) — окклюзионный тренинг подробно:**

**Как это работает:**
Специальные манжеты или эластичные бинты ограничивают венозный отток (но не артериальный приток)
Кровь поступает в мышцу, но не уходит → быстрое накопление метаболитов
Результат: мышца "думает", что работает тяжело, хотя вес лёгкий

**Правильная техника наложения:**
Плотность: 7 из 10 (10 = полное пережатие — НИКОГДА так не делайте)
Место: верхняя часть конечности (верх бицепса для рук, верх бедра для ног)
Ширина: чем шире манжета — тем меньше давление нужно (безопаснее)
Держите обмотку во время ВСЕХ подходов включая отдых, снимайте между упражнениями

**Протокол тренировки:**
Вес: 20-30% от 1RM (очень лёгкий!)
Подходы: 30-15-15-15 повторений (первый подход длинный, остальные до отказа)
Отдых: 30-60 секунд между подходами (манжета остаётся!)
Общее время под манжетой: не более 15-20 минут

**Преимущества:**
Гипертрофия при очень низких нагрузках (исследования показывают рост мышц сравнимый с 70% 1RM)
Минимальная нагрузка на суставы и связки
Увеличение выброса гормона роста (до 170% выше нормы — Takarada et al.)

**Кому особенно полезно:**
Люди с травмами (можно тренироваться, не нагружая повреждённый сустав)
Пожилые люди (рост мышц без тяжёлых весов)
В период деload (поддержание мышц при сниженной нагрузке)
Реабилитация после операций (под контролем физиотерапевта)

**Безопасность:**
НЕ используйте при тромбозах, варикозе, гипертонии, сахарном диабете
Онемение или синюшность — немедленно снимите манжету
Начинайте с лёгкого давления, увеличивайте постепенно
`;
}
export function getIsometricHolds(message: string): string {
  const kw = ['изометрические удержания', 'изометрика подробно', 'паузы в упражнениях'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Изометрические удержания — сила без движения:**

**Два типа изометрики:**

1. Overcoming (преодолевающая): давите против неподвижного объекта
Пример: толкайте стену, жмите штангу в упоры силовой рамы
Развивает максимальную силу в конкретном угле

2. Yielding (удерживающая): удерживаете вес в заданной позиции
Пример: пауза в нижней точке приседа, удержание гантелей в стороны
Развивает выносливость, стабильность, контроль

**Пауза-повторения (pause reps):**
2-3 секунды паузы в самой трудной точке движения (обычно внизу)
Убирают инерцию — мышца вынуждена генерировать силу "с нуля"
Отлично для улучшения "стартовой силы" и прохождения мёртвых точек
Примеры: пауза на груди в жиме лёжа, пауза в нижней точке приседа

**Классические изометрические упражнения:**
Планка и её вариации: фронтальная, боковая, с поднятой ногой/рукой
Wall sit (стул у стены): 30-60 секунд × 3-5 подходов
Удержание в верхней точке подтягивания: 10-30 секунд
L-sit на брусьях: развитие кора и плеч

**Преимущества:**
Укрепление сухожилий и связок (сухожилия адаптируются к изометрике лучше, чем к динамическим движениям)
Работа в "мёртвых точках" — тренировка конкретного угла, где вы слабы
Минимальный DOMS (нет эксцентрической фазы)
Можно тренироваться при некоторых травмах (когда движение болезненно, но удержание — нет)

**Программирование:**
3-5 подходов × 10-30 секунд удержания
Для силы: максимальное усилие, 5-10 секунд
Для выносливости/реабилитации: умеренное усилие, 20-45 секунд
Отдых: 60-90 секунд между подходами
`;
}
export function getConjugateMethodAdv(message: string): string {
  const kw = ['сопряжённый метод', 'вестсайд', 'conjugate method', 'westside'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Сопряжённый метод (Conjugate/Westside) — система Луи Симмонса:**

**Три метода в одной системе:**

1. Max Effort (максимальное усилие):
Работа до 1-3RM в базовом движении
КЛЮЧ: ротация упражнений каждую неделю (чтобы избежать адаптации ЦНС)
Пример: неделя 1 — жим с бруска, неделя 2 — жим с цепями, неделя 3 — жим с пола
Не работайте на максимум в соревновательном движении чаще 1 раза в месяц

2. Dynamic Effort (динамическое усилие):
Вес: 50-60% от 1RM + бэнды или цепи (аккомодирующее сопротивление)
8-12 подходов по 2-3 повторения со взрывной скоростью
Фокус на СКОРОСТИ штанги, а не на весе
Отдых: 45-60 секунд между подходами
Развивает rate of force development (скорость генерации силы)

3. Repetition Method (повторный метод):
Вспомогательные упражнения на гипертрофию
3-5 подходов по 8-15 повторений
Цель: укрепление слабых звеньев, наращивание мышечной массы
Примеры: тяги, подъёмы, работа на тренажёрах

**Структура недели:**
Понедельник: Max Effort верх тела
Среда: Max Effort низ тела
Пятница: Dynamic Effort верх тела
Воскресенье: Dynamic Effort низ тела

**Бэнды и цепи — зачем:**
Аккомодирующее сопротивление: нагрузка увеличивается по мере разгибания
Учит разгоняться через весь диапазон движения (а не тормозить наверху)
Снижает нагрузку в нижней (опасной) точке, увеличивает в верхней (сильной)

**Для кого:**
Средний и продвинутый уровень (минимум 2 года тренировочного стажа)
Пауэрлифтеры и силовые атлеты
НЕ для новичков — слишком сложная система, требующая понимания своих слабых мест
Луи Симмонс создал эту систему в Westside Barbell — клубе с 140+ элитными лифтерами
`;
}
export function getDigestiveHealth(message: string): string {
  const kw = ['пищеварение и спорт', 'желудок после тренировки', 'вздутие спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Пищеварение и спорт — как не навредить желудку:**

**Тайминг приёмов пищи:**
Полноценный приём: за 2-3 часа до тренировки (время на переваривание)
Лёгкий перекус: за 1 час (банан, рисовые хлебцы, протеиновый коктейль)
Натощак: допустимо, но может снизить производительность на 10-15%

**Что избегать ПЕРЕД тренировкой:**
Высоковолокнистые продукты (бобовые, капуста, сырые овощи) — вздутие и дискомфорт
Жирная пища (>20г жира) — медленное переваривание, тяжесть
Молочные продукты (у людей с лактазной недостаточностью)
Острая пища — может вызвать изжогу при наклонах/напряжении
Газированные напитки — отрыжка и дискомфорт

**После тренировки — легкоусвояемое:**
Протеиновый коктейль на воде (быстрое усвоение, минимальная нагрузка на ЖКТ)
Банан + протеин (углеводы для гликогена + белок для мышц)
Рис + куриная грудка (классика бодибилдинга — легко переваривается)
Полноценный приём пищи через 1-2 часа после тренировки

**Поддержка пищеварения:**
Пробиотики: улучшают усвоение нутриентов и иммунитет (Lactobacillus, Bifidobacterium)
Гидратация: вода критична для пищеварения — пейте между приёмами пищи
Не пейте много воды ВО ВРЕМЯ еды (разбавление желудочного сока)
Ешьте медленно, тщательно пережёвывая — ферменты слюны начинают пищеварение
Ферменты (при необходимости): пищеварительные энзимы при тяжести после больших приёмов пищи
`;
}
export function getSocialFitness(message: string): string {
  const kw = ['тренировки с друзьями', 'фитнес сообщество', 'групповые тренировки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Социальный фитнес — сила тренировочного сообщества:**

**Эффект подотчётности (accountability):**
Исследования показывают: наличие тренировочного партнёра повышает вероятность достижения цели на 65%
Когда кто-то ждёт вас в зале — вы пропускаете в 3-4 раза реже
Публичное обязательство (рассказать друзьям о цели) усиливает приверженность

**Преимущества тренировочного партнёра:**
Безопасность: страховка при тяжёлых подходах (жим лёжа, приседания)
Мотивация: здоровая конкуренция ("он смог — и я смогу")
Форсированные повторения: партнёр помогает выжать 1-2 дополнительных повтора
Объективная обратная связь по технике (видит со стороны)
Эмоциональная поддержка в "плохие дни" (напоминает о целях)

**Как выбрать тренировочного партнёра:**
Похожий уровень подготовки (±20% по силе)
Совместимое расписание (и готовность его соблюдать!)
Схожие цели (оба на массу, оба на силу — не "один сушится, другой набирает")
Позитивное влияние (мотивирует, а не токсичный конкурент)

**Групповые тренировки — психология:**
Эффект Кёлера (Köhler effect): люди работают усерднее в группе, чем в одиночку
Музыка + энергия группы повышает болевой порог и RPE
Социальное облегчение (social facilitation): присутствие других улучшает производительность
Чувство принадлежности к сообществу — один из трёх ключевых мотиваторов (Self-Determination Theory)

**Онлайн-сообщества:**
Reddit (r/fitness, r/powerlifting), Telegram-каналы, Discord-серверы
Фитнес-вызовы (challenges): 30-дневные, сезонные — создают структуру и азарт
Логирование тренировок в приложениях с социальными функциями (как это!)
Делиться прогрессом: фото, PR, достижения — получать обратную связь

**Соревнования и ивенты:**
Любительские соревнования по пауэрлифтингу/кроссфиту — доступны для любого уровня
Забеги (5К, 10К, полумарафон) — конкретная цель + праздничная атмосфера
Спортивные лиги (баскетбол, волейбол, футбол) — фитнес + удовольствие + социализация
OCR (Spartan Race, гонки с препятствиями) — командная работа + приключение
`;
}
