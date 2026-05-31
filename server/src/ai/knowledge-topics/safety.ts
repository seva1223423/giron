/**
 * knowledge-topics/safety.ts — auto-split from knowledgeHelpers.ts
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

export function scoreFormRisk(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; difficulty: string };
      sets: Array<{ weight: number | null; reps: number | null; rpe: number | null; completed: boolean }>;
      order: number;
    }>;
  }>,
): string {
  if (recentWorkouts.length < 2) return '';

  const risks: Array<{ exercise: string; reason: string }> = [];

  for (const w of recentWorkouts.slice(0, 3)) {
    for (const ex of w.exercises) {
      const completedSets = ex.sets.filter(s => s.completed);
      if (completedSets.length < 2) continue;

      // Risk 1: High RPE on compound movements late in workout
      const highRpeSets = completedSets.filter(s => s.rpe && s.rpe >= 9);
      if (highRpeSets.length >= 2 && ex.order >= 3) {
        risks.push({
          exercise: ex.exercise?.name,
          reason: 'высокий RPE (9-10) на утомлённые мышцы (поздно в тренировке)',
        });
      }

      // Risk 2: Big rep drop-off suggesting too heavy weight
      const reps = completedSets.map(s => s.reps).filter((r): r is number => r !== null);
      if (reps.length >= 3) {
        const drop = (reps[0] - reps[reps.length - 1]) / reps[0];
        if (drop > 0.5) {
          risks.push({
            exercise: ex.exercise?.name,
            reason: `повторения упали на ${Math.round(drop * 100)}% (${reps[0]} → ${reps[reps.length - 1]})`,
          });
        }
      }
    }
  }

  if (risks.length === 0) return '';

  return `\n\n## ⚠️ РИСК НАРУШЕНИЯ ТЕХНИКИ
${risks.slice(0, 3).map(r => `- ${r.exercise}: ${r.reason}`).join('\n')}
Напомни о важности техники. Лучше снизить вес, чем получить травму.`;
}
export function getGymSafetyTip(
  exerciseName: string | null,
  totalWorkouts: number,
): string {
  if (!exerciseName || totalWorkouts > 50) return ''; // Skip for experienced users

  const safetyTips: Record<string, string> = {
    'становая': '🛡️ БЕЗОПАСНОСТЬ: Всегда используй пояс при работе с весами >80% 1ПМ. Разминочные подходы — обязательно.',
    'жим лёжа': '🛡️ БЕЗОПАСНОСТЬ: Без страховщика — используй стойки со страховочными цепями или штангу в Смите.',
    'присед': '🛡️ БЕЗОПАСНОСТЬ: Проверь высоту страховочных стоек перед работой с максимальным весом.',
    'жим стоя': '🛡️ БЕЗОПАСНОСТЬ: Выполняй в силовой раме или с зафиксированным пространством позади.',
  };

  const nameL = exerciseName.toLowerCase();
  for (const [key, tip] of Object.entries(safetyTips)) {
    if (nameL.includes(key)) {
      return `\n\n${tip}`;
    }
  }
  return '';
}
