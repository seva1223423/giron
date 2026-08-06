/**
 * knowledge-topics/gamification.ts — auto-split from knowledgeHelpers.ts
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

export function buildGamificationContext(gam: GamificationData): string {
  if (gam.totalWorkouts === 0) return '';

  const lines: string[] = ['## 🏆 ДОСТИЖЕНИЯ И СТРИКИ'];

  lines.push(`Всего тренировок: ${gam.totalWorkouts}`);
  if (gam.currentStreak > 0) {
    lines.push(`Текущая серия: ${gam.currentStreak} ${gam.currentStreak === 1 ? 'день' : gam.currentStreak < 5 ? 'дня' : 'дней'} подряд`);
  }
  if (gam.longestStreak > gam.currentStreak) {
    lines.push(`Рекорд серии: ${gam.longestStreak} дней`);
  }

  // Top 5 PRs by weight
  const topPRs = gam.personalRecords
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  if (topPRs.length > 0) {
    lines.push(`\nТоп-5 личных рекордов:`);
    for (const pr of topPRs) {
      lines.push(`- ${pr.exercise}: ${pr.weight} кг × ${pr.reps}`);
    }
  }

  if (gam.milestones.length > 0) {
    lines.push(`\n🎯 Активные достижения:`);
    for (const m of gam.milestones) {
      lines.push(`- ${m}`);
    }
    lines.push(`\n→ ОБЯЗАТЕЛЬНО поздравь пользователя с этими достижениями если контекст подходит!`);
  }

  return '\n' + lines.join('\n');
}
export function protectStreak(
  currentStreak: number,
  daysSinceLastWorkout: number | null,
  scheduledToday: boolean,
): string {
  if (currentStreak < 2) return '';

  // Streak at risk: trained consistently but gap growing
  if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= 2 && !scheduledToday) {
    const urgency = daysSinceLastWorkout >= 3 ? '🔴' : '🟡';
    return `\n\n## ${urgency} СТРИК ПОД УГРОЗОЙ
Текущий стрик: ${currentStreak} (${daysSinceLastWorkout} дней без тренировки)
💡 Мини-тренировка на 15-20 минут сохранит стрик:
- 3×10 отжиманий + 3×15 приседаний без веса + планка 3×30сек
- 20 минут быстрой ходьбы / лёгкого бега
- 10 минут растяжки + 5 минут скакалки
→ Предложи если пользователь не планирует полноценную тренировку.`;
  }

  return '';
}
export function celebrateMilestones(
  totalWorkouts: number,
  currentStreak: number,
  totalVolumeTons: number,
  newPRs: number,
): string {
  const celebrations: string[] = [];

  // Workout count milestones
  const workoutMilestones = [10, 25, 50, 100, 200, 500];
  if (workoutMilestones.includes(totalWorkouts)) {
    celebrations.push(`🎉 ${totalWorkouts} тренировок! Это серьёзный результат — ты в топ тренирующихся.`);
  }

  // Streak milestones
  const streakMilestones = [7, 14, 21, 30, 60, 90];
  if (streakMilestones.includes(currentStreak)) {
    celebrations.push(`🔥 ${currentStreak} дней подряд! Именно такая дисциплина меняет тела.`);
  }

  // Volume milestones
  const volMilestones = [10, 50, 100, 500, 1000];
  const roundedVol = Math.round(totalVolumeTons);
  if (volMilestones.includes(roundedVol) && roundedVol > 0) {
    celebrations.push(`💪 ${roundedVol} тонн поднято за всё время! Ты буквально переместил горы.`);
  }

  // PR milestones
  if (newPRs > 0) {
    celebrations.push(`🏆 ${newPRs} личных рекорд${newPRs === 1 ? '' : 'а'} на этой неделе! Сила растёт.`);
  }

  if (celebrations.length === 0) return '';

  return `\n\n## 🎊 ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО
${celebrations.join('\n')}
Похвали пользователя искренне, без шаблонности.`;
}
export function detectAndCelebratePR(message: string, strengthBestLifts: Record<string, number>): string {
  const lowerMsg = message.toLowerCase();
  const prKeywords = ['личный рекорд', 'пр', 'pr', 'побил рекорд', 'лучший результат', 'рекорд'];
  const hasPR = prKeywords.some(kw => lowerMsg.includes(kw));

  if (!hasPR) return '';

  const liftsCount = Object.keys(strengthBestLifts).length;

  return `\n\n🎉 ЛИЧНЫЙ РЕКОРД! ПОЗДРАВЛЯЮ!
${liftsCount > 0 ? `Ваши текущие лучшие результаты: ${Object.entries(strengthBestLifts).slice(0, 3).map(([ex, w]) => `${ex}: ${w}кг`).join(', ')}` : ''}

Это результат недель тяжёлой работы. Несколько мыслей:
🧠 Зафиксируйте этот момент — он укрепляет нейронные паттерны уверенности
💪 Сила растёт нелинейно — рекорды случаются реже, но они РЕАЛЬНЫ
🔄 После рекорда: добавьте разгрузочный день или лёгкую тренировку перед следующей тяжёлой сессией`;
}
export function buildMilestoneRoadmap(totalWorkoutsEver: number, goal: string | null, bestLifts: Record<string, number>): string {
  if (!totalWorkoutsEver) return '';

  const milestones: string[] = [];

  if (totalWorkoutsEver < 10) milestones.push('🎯 Первый месяц: 12 тренировок → освоить технику базовых упражнений');
  else if (totalWorkoutsEver < 50) milestones.push(`✅ ${totalWorkoutsEver} тренировок за спиной!\n🎯 Следующая цель: 50 тренировок → тело адаптируется, начнётся реальный прогресс`);
  else if (totalWorkoutsEver < 100) milestones.push(`✅ ${totalWorkoutsEver} тренировок!\n🎯 Цель: 100 → любительский уровень силы`);
  else if (totalWorkoutsEver < 200) milestones.push(`💪 ${totalWorkoutsEver} тренировок — серьёзный опыт!\n🎯 Цель: 200 → продвинутый спортсмен`);
  else milestones.push(`🏆 ${totalWorkoutsEver} тренировок — вы элита настойчивости!`);

  const liftGoals: string[] = [];
  const squatBest = Object.entries(bestLifts).find(([k]) => k.toLowerCase().includes('присед'))?.[1];
  if (squatBest) {
    const next = Math.ceil(squatBest / 5) * 5 + 5;
    liftGoals.push(`Присед: ${squatBest}кг → ${next}кг`);
  }

  // Число тренировок — не цель, а средство, и для разных целей следующая
  // отметка разная. Цель приходила в функцию и не использовалась: человеку
  // на похудении предлагали «200 тренировок → продвинутый спортсмен».
  const goalMilestone = {
    WEIGHT_LOSS: 'На похудении считай не тренировки, а недели без срыва режима: 4 недели подряд — точка, после которой вес начинает идти стабильно.',
    MUSCLE_GAIN: 'На массе следующая отметка — не количество тренировок, а +1 кг веса при тех же силовых или выше. Это и есть рост, а не отёк.',
    STRENGTH: 'На силе отметки — это цифры на штанге: присед 1.5× своего веса, жим 1×, тяга 2×. Дальше уже разряды.',
    ENDURANCE: 'На выносливость отметка — тот же темп при более низком пульсе. Проверяй раз в месяц по одному и тому же маршруту.',
  }[String(goal || '')];

  return `\n\n🗺 Ваша дорожная карта прогресса:\n${milestones.join('\n')}${goalMilestone ? `\n${goalMilestone}` : ''}${liftGoals.length ? `\n\n**Ближайшие силовые цели:**\n${liftGoals.map(g => `• ${g}`).join('\n')}` : ''}`;
}
export function getAICoachingMilestone(message: string, totalWorkoutsEver: number): string {
  const relevant = /iron coach|как ты работаешь|что ты умеешь|расскажи о себе|твои возможности/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤖 IRON COACH — ТВОЙ ПЕРСОНАЛЬНЫЙ AI-ТРЕНЕР:');
  lines.push('');
  lines.push('🧠 ЧТО Я УМЕЮ:');
  lines.push('• Анализирую твои тренировки, питание и восстановление');
  lines.push('• Даю персонализированные советы на основе реальных данных');
  lines.push('• Отвечаю на вопросы по технике, питанию, программам');
  lines.push('• Предсказываю риски перетренированности и травм');
  lines.push('• Помогаю расставить приоритеты в тренировках');
  lines.push('');
  lines.push(`📊 ТВОЙ ПРОГРЕСС: ${totalWorkoutsEver} тренировок в базе → чем больше, тем точнее мои советы`);
  lines.push('');
  lines.push('💬 ЧТО МОЖНО СПРОСИТЬ:');
  lines.push('• "Почему не растёт жим?"');
  lines.push('• "Что поесть перед тренировкой?"');
  lines.push('• "Болит плечо — что делать?"');
  lines.push('• "Составь программу на 3 дня"');
  lines.push('• "Объясни технику становой"');
  lines.push('');
  lines.push('🎯 ПРИНЦИП: я не даю универсальные советы из интернета — только персонализированные под твои данные');
  return '\n\n' + lines.join('\n');
}
