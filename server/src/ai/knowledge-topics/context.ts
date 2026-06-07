/**
 * knowledge-topics/context.ts — auto-split from knowledgeHelpers.ts
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

export function buildContextGreeting(
  userName: string,
  currentHour: number,
  daysSinceLastWorkout: number,
  currentStreak: number,
  lastWorkoutName: string | null,
  todayCalories: number,
  targetCalories: number,
): string {
  const timeGreeting = currentHour < 6 ? 'Ранняя пташка!' :
                       currentHour < 12 ? 'Доброе утро' :
                       currentHour < 18 ? 'Добрый день' :
                       currentHour < 22 ? 'Добрый вечер' : 'Не спится?';

  const parts: string[] = [`${timeGreeting}, ${userName}!`];

  if (daysSinceLastWorkout === 0) {
    parts.push('Уже тренировался сегодня — красавец!');
  } else if (daysSinceLastWorkout === 1) {
    parts.push(`Вчера была ${lastWorkoutName || 'тренировка'}. Готов к новой?`);
  } else if (daysSinceLastWorkout >= 3) {
    parts.push(`Не тренировался ${daysSinceLastWorkout} дней. Самое время вернуться!`);
  }

  if (currentStreak >= 7) {
    parts.push(`Серия ${currentStreak} дней — огонь! 🔥`);
  }

  if (todayCalories > 0 && targetCalories > 0) {
    const pct = Math.round((todayCalories / targetCalories) * 100);
    if (pct < 50) parts.push(`Питание: пока только ${pct}% нормы.`);
  }

  return `\n\n## 👋 ПЕРСОНАЛИЗИРОВАННОЕ ПРИВЕТСТВИЕ
${parts.join(' ')}
Используй это как основу для приветственного сообщения.`;
}
