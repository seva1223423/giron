/**
 * Block 65: Seasonal Recommendations
 *
 * Originally inline at ai.ts L16156 (`getSeasonalAdvice`). Pure function
 * of the current month — no inputs needed. Kept in the same shape as
 * a KnowledgeBlock for registry-driven discovery.
 */

import type { KnowledgeBlock } from './types';

function buildSeasonalAdvice(): string {
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

export const seasonalAdviceBlock: KnowledgeBlock = {
  id: 'lifestyle:seasonal-advice',
  keywords: [
    'сезон', 'зима', 'весна', 'лето', 'осень',
    'погода', 'витамин d', 'жара', 'холод', 'термо',
  ],
  build: () => buildSeasonalAdvice(),
};
