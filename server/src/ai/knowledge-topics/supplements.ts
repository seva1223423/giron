/**
 * knowledge-topics/supplements.ts — auto-split from knowledgeHelpers.ts
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

export function buildSupplementAdvice(
  userGoal: string | null,
  hasWorkoutToday: boolean,
  hour: number,
): string {
  if (!userGoal) return '';

  const advice: string[] = [];

  // Universal: creatine
  advice.push('💊 Креатин: 5г ежедневно, в любое время (с едой для лучшего усвоения)');

  // Protein timing
  if (hasWorkoutToday) {
    if (hour < 12) {
      advice.push('🥤 Протеин: 25-30г в течение 2ч после тренировки (сывороточный)');
    } else {
      advice.push('🥤 Протеин: 25-30г после тренировки + казеин перед сном');
    }
  } else {
    advice.push('🥤 Протеин: распредели равномерно по приёмам пищи (30г каждый)');
  }

  // Goal-specific
  if (userGoal === 'WEIGHT_LOSS') {
    advice.push('🔥 Перед тренировкой: кофеин (200мг) за 30 мин для повышения метаболизма');
    advice.push('🥬 Витамин D: 2000-4000 МЕ с жирной пищей (часто дефицит в РФ)');
  } else if (userGoal === 'MUSCLE_GAIN') {
    advice.push('🍌 До тренировки: 30-40г углеводов за 1-2ч для энергии');
    advice.push('💧 Во время тренировки: BCAA или EAA (5-10г) если тренируешься натощак');
  } else if (userGoal === 'STRENGTH') {
    advice.push('⚡ До тренировки: кофеин (3-6 мг/кг) за 30-60 мин для силовых показателей');
    advice.push('🧂 Электролиты: при длительных тренировках (>60 мин) — натрий + калий');
  }

  // Season-specific for Russia
  const month = new Date().getMonth();
  if (month >= 9 || month <= 3) {
    advice.push('☀️ Витамин D: 2000-4000 МЕ/день (октябрь-март — мало солнца в РФ)');
  }

  return `\n\n## 💊 РЕКОМЕНДАЦИИ ПО ДОБАВКАМ
${advice.slice(0, 4).join('\n')}
→ Упоминай при обсуждении питания или восстановления. Это общие рекомендации, не медицинский совет.`;
}
export function suggestSupplements(
  userGoal: string | null,
  userWeightKg: number | null,
  hasWorkoutToday: boolean,
): string {
  if (!userGoal) return '';

  interface Supplement {
    name: string;
    dose: string;
    timing: string;
    evidence: string;
  }

  const baseSupplements: Supplement[] = [
    { name: 'Креатин моногидрат', dose: '5г/день', timing: 'в любое время', evidence: 'A+, самая изученная добавка' },
    { name: 'Витамин D3', dose: '2000-4000 МЕ/день', timing: 'с жирной пищей', evidence: 'A, особенно в РФ (дефицит у 80%)' },
    { name: 'Омега-3', dose: '2-3г EPA+DHA/день', timing: 'с едой', evidence: 'A, противовоспалительный эффект' },
  ];

  const goalSupplements: Record<string, Supplement[]> = {
    MUSCLE_GAIN: [
      { name: 'Сывороточный протеин', dose: '25-40г', timing: 'после тренировки + между приёмами', evidence: 'A' },
      { name: 'Цитруллин малат', dose: '6-8г', timing: '30-40 мин до тренировки', evidence: 'B, пампинг + выносливость' },
    ],
    STRENGTH: [
      { name: 'Бета-аланин', dose: '3-5г/день', timing: 'разделить на 2 приёма', evidence: 'B, буфер молочной кислоты' },
      { name: 'Кофеин', dose: '3-6 мг/кг', timing: '30-60 мин до тренировки', evidence: 'A, сила + фокус' },
    ],
    WEIGHT_LOSS: [
      { name: 'Кофеин', dose: '200-400мг', timing: 'утром / до тренировки', evidence: 'B, ускоряет метаболизм на 3-5%' },
      { name: 'Сывороточный протеин', dose: '25-30г', timing: 'для сохранения мышц на дефиците', evidence: 'A' },
    ],
    ENDURANCE: [
      { name: 'Бета-аланин', dose: '3-5г/день', timing: 'ежедневно', evidence: 'B, отсрочивает усталость' },
      { name: 'Электролиты', dose: 'по потребности', timing: 'во время и после тренировки', evidence: 'A' },
    ],
  };

  const supplements = [...baseSupplements, ...(goalSupplements[userGoal] || [])];

  // Доза "3-6 мг/кг" — это то, что человек должен пересчитать в уме посреди
  // разговора. Вес известен, так что считаем за него. Раньше и вес, и наличие
  // тренировки сегодня приходили в функцию и не использовались вообще.
  const resolveDose = (s: Supplement): string => {
    const perKg = s.dose.match(/^(\d+)-(\d+)\s*мг\/кг$/);
    if (!perKg || !userWeightKg || userWeightKg <= 0) return s.dose;
    const lo = Math.round(Number(perKg[1]) * userWeightKg);
    const hi = Math.round(Number(perKg[2]) * userWeightKg);
    return `${lo}-${hi} мг (${s.dose} при ${Math.round(userWeightKg)} кг)`;
  };

  const lines = supplements.map((s) => `• ${s.name} — ${resolveDose(s)} (${s.timing}) [${s.evidence}]`);

  // Половина списка привязана ко времени тренировки. В день отдыха эти
  // указания бессмысленны, а ежедневные — нет.
  const preWorkout = supplements.filter((s) => /до тренировки/.test(s.timing)).map((s) => s.name);
  const timingLine = preWorkout.length === 0
    ? ''
    : hasWorkoutToday
      ? `\nСегодня тренировка: ${preWorkout.join(', ')} — за 30-60 мин до неё.`
      : `\nСегодня тренировки нет: ${preWorkout.join(', ')} сегодня не нужны, ежедневные принимай как обычно.`;

  return `\n\n## 💊 ДОБАВКИ (доказательная база)
${lines.join('\n')}${timingLine}
⚠️ Это не медицинская рекомендация. Перед приёмом проконсультируйся с врачом.
→ Рекомендуй только если пользователь спрашивает про добавки или спортпит.`;
}
export function buildSupplementTiming(
  nextWorkoutEstimate: 'morning' | 'afternoon' | 'evening' | 'unknown',
  userGoal: string | null,
): string {
  if (nextWorkoutEstimate === 'unknown') return '';

  const timings: Record<string, string[]> = {
    morning: [
      'Креатин: 5 г с завтраком (до тренировки)',
      'Кофеин: за 30 мин до тренировки (утро — идеальное время)',
      'BCAA: 5-10 г если тренируешься натощак',
    ],
    afternoon: [
      'Креатин: 5 г с обедом',
      'Кофеин: за 30 мин до тренировки (не позже 15:00 чтобы не нарушить сон)',
      'Перекус с белком: за 1-2 часа до тренировки',
    ],
    evening: [
      'Креатин: 5 г с ужином (после тренировки)',
      'Кофеин: НЕ рекомендуется (нарушит сон). Альтернатива: цитруллин 6-8 г',
      'Казеин: перед сном для ночного восстановления',
    ],
  };

  const applicable = timings[nextWorkoutEstimate] || [];
  if (applicable.length === 0) return '';

  const goalExtra = userGoal === 'WEIGHT_LOSS'
    ? '\nДля похудения: L-карнитин 2 г за 30 мин до кардио.'
    : userGoal === 'MUSCLE_GAIN'
    ? '\nДля набора: гейнер после тренировки если не набираешь калории из еды.'
    : '';

  return `\n\n## 💊 ТАЙМИНГ ДОБАВОК (тренировка ${nextWorkoutEstimate === 'morning' ? 'утром' : nextWorkoutEstimate === 'afternoon' ? 'днём' : 'вечером'})
${applicable.map(t => `- ${t}`).join('\n')}${goalExtra}
Упоминай только если пользователь спрашивает о добавках.`;
}
export function buildEnvironmentTips(
  currentHour: number,
  userGoal: string | null,
): string {
  const tips: string[] = [];

  // Music recommendation based on goal
  if (userGoal === 'STRENGTH') {
    tips.push('Музыка: тяжёлый рок/металл или агрессивный рэп для максимальных подъёмов.');
  } else if (userGoal === 'WEIGHT_LOSS') {
    tips.push('Музыка: быстрый EDM/поп (120-140 BPM) для поддержания темпа.');
  }

  // Temperature
  if (currentHour >= 6 && currentHour < 9) {
    tips.push('Утро: одежда потеплее для разминки, тело ещё не разогрелось.');
  }

  // Focus
  tips.push('Убери телефон между подходами — 2-3 мин отвлечения удлиняют тренировку на 15+ мин.');

  return `\n\n## 🏋️ СРЕДА ТРЕНИРОВКИ
${tips.slice(0, 2).map(t => `- ${t}`).join('\n')}
Упоминай только если контекст подходит.`;
}
export function buildPreWorkoutChecklist(
  lastMealHoursAgo: number | null,
  userHydrated: boolean,
  warmupDone: boolean,
  focusExercise: string | null,
): string {
  const checklist: Array<{ done: boolean; item: string }> = [
    { done: lastMealHoursAgo !== null && lastMealHoursAgo >= 1 && lastMealHoursAgo <= 3, item: 'Поел за 1-3 часа до тренировки' },
    { done: userHydrated, item: 'Выпил 400-500 мл воды за час до тренировки' },
    { done: warmupDone, item: '5 мин кардио + суставная разминка' },
    { done: false, item: 'Знаешь план тренировки (упражнения, подходы, веса)' },
    { done: false, item: 'Телефон в режиме "не беспокоить"' },
  ];

  if (focusExercise) {
    checklist.push({ done: false, item: `Разминочные подходы перед ${focusExercise}` });
  }

  const pending = checklist.filter(c => !c.done);
  if (pending.length === 0) return '';

  return `\n\n## ✅ ЧЕК-ЛИСТ ПЕРЕД ТРЕНИРОВКОЙ
${checklist.map(c => `${c.done ? '✅' : '☐'} ${c.item}`).join('\n')}
Предложи это если пользователь говорит что собирается тренироваться.`;
}
export function getSupplementTiming(
  message: string,
  workoutTimeHour: number | null,
): string {
  const suppKeywords = /креатин|кофеин|протеин|bcaa|бета-аланин|предтрен|добавк|спортпит/i;
  if (!suppKeywords.test(message)) return '';

  const timing: string[] = [];

  if (/креатин/i.test(message)) {
    timing.push('**Креатин**: 5г в любое время (лучше с едой). Важна регулярность, не время приёма. Нагрузочная фаза (20г/4дня) — опционально.');
  }

  if (/кофеин|предтрен/i.test(message)) {
    const preTime = workoutTimeHour !== null ? `за 30-45 мин до (в ${workoutTimeHour - 1}:00)` : 'за 30-45 мин до тренировки';
    timing.push(`**Кофеин**: 200-400мг ${preTime}. Максимальная доза для спорта: 6 мг/кг веса тела.`);
  }

  if (/bcaa/i.test(message)) {
    timing.push('**BCAA**: бесполезны если достаточно белка (1.6+ г/кг). Деньги лучше потратить на протеин/еду.');
  }

  if (/протеин.*после|после.*протеин/i.test(message)) {
    timing.push('**Протеин после тренировки**: в течение 2 часов. Анаболическое окно шире чем думали — 2 часа, не 30 мин.');
  }

  if (/бета-аланин/i.test(message)) {
    timing.push('**Бета-аланин**: 3.2-6.4г/день. Вызывает покалывание — это нормально. Эффект накопительный (2-4 нед).');
  }

  if (timing.length === 0) return '';

  return `\n\n## 💊 РАСПИСАНИЕ ДОБАВОК
${timing.join('\n')}`;
}
export function getTrainingEnvironmentTips(message: string): string {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('дома') || lowerMsg.includes('домашн')) {
    return `\n\n🏠 Тренировки дома — максимум без зала:
• Отжимания: варьируйте ширину хвата (широкий=грудь, узкий=трицепс, на кулаках=грудь+стабилизаторы)
• Приседания: пистолетик, болгарские сплит-приседания с опорой на диван
• Пресс: планка, скалолаз, обратные скручивания
• Без гантелей: рюкзак с книгами = 5-15кг. Бутылки 5л = ~5кг каждая
• Прогресс: замедляйте фазу опускания (3-4 сек) — увеличивает нагрузку без веса`;
  }

  if (lowerMsg.includes('на улице') || lowerMsg.includes('воркаут') || lowerMsg.includes('турник')) {
    return `\n\n🌳 Тренировки на улице / воркаут:
• Турник: подтягивания (спина+бицепс), выходы силой (трудно, но комплексно), австралийские подтягивания
• Брусья: отжимания (грудь+трицепс), подъём ног (пресс)
• Прогрессия: утяжелители на пояс, рюкзак с грузом
• RPE на улице выше зимой — холод увеличивает воспринимаемую нагрузку`;
  }

  return '';
}
export function buildSupplementStack(goal: string | null, budget: string | null, message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['добавки', 'спортпит', 'протеин купить', 'что принимать', 'что пить', 'bcaa', 'предтреник', 'гейнер'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const isLowBudget = budget === 'low' || lowerMsg.includes('дёшево') || lowerMsg.includes('бюджет');

  interface SupplementInfo { name: string; dose: string; when: string; priority: number }
  const stacks: Record<string, SupplementInfo[]> = {
    muscle_gain: [
      { name: 'Креатин моногидрат', dose: '5г/день', when: 'в любое время (постоянно)', priority: 1 },
      { name: 'Протеин (сывороточный)', dose: '25-30г', when: 'после тренировки', priority: 1 },
      { name: 'Углеводный гейнер', dose: '50г углеводов', when: 'после тренировки (при худобе)', priority: 2 },
      { name: 'Витамин D3', dose: '2000-4000 МЕ', when: 'утром с едой', priority: 2 },
      { name: 'Цинк + Магний (ZMA)', dose: '1 порция', when: 'перед сном', priority: 3 },
    ],
    weight_loss: [
      { name: 'Протеин (казеиновый или сывороточный)', dose: '25г', when: 'между приёмами пищи', priority: 1 },
      { name: 'Омега-3', dose: '2-3г EPA+DHA', when: 'с едой', priority: 1 },
      { name: 'Кофеин (натуральный)', dose: '100-200мг', when: 'за 30 мин до тренировки', priority: 2 },
      { name: 'Витамин D3', dose: '2000 МЕ', when: 'утром', priority: 2 },
    ],
    strength: [
      { name: 'Креатин моногидрат', dose: '5г/день', when: 'постоянно', priority: 1 },
      { name: 'Бета-аланин', dose: '3.2г/день', when: 'в два приёма', priority: 2 },
      { name: 'Протеин', dose: '25-30г', when: 'после тренировки', priority: 1 },
      { name: 'Магний', dose: '300-400мг', when: 'перед сном', priority: 2 },
    ],
  };

  const stack = stacks[goal ?? 'muscle_gain'] ?? stacks['muscle_gain'];
  const filtered = isLowBudget ? stack.filter(s => s.priority === 1) : stack;
  const lines = filtered.map(s => `• **${s.name}**: ${s.dose} — ${s.when}`).join('\n');

  return `\n\n💊 Стек добавок для вашей цели${isLowBudget ? ' (бюджетный)' : ''}:\n${lines}\n\n💡 Важно: добавки дают ~5-10% результата. Без правильного питания и тренировок — бесполезны.`;
}
export function guideCreatineUsage(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['креатин', 'creatine', 'как принимать креатин', 'загрузка креатином', 'моногидрат'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  return `\n\n💊 Руководство по креатину:

**Что это:** Самая изученная спортивная добавка. 100+ мета-анализов подтверждают эффективность.

**Форма:** Моногидрат (самая дешёвая = самая эффективная). Этил эстер, HCl — маркетинг.

**Схема приёма:**

*Без загрузки (рекомендуется):*
• 3-5г в день, в любое время, с едой или без
• Насыщение мышц через 3-4 недели
• Нет побочек, удобно

*С загрузкой (быстрее, но не нужно):*
• 20г/день × 7 дней (4 приёма по 5г)
• Затем 3-5г/день для поддержки
• Возможно вздутие на этапе загрузки

**Результаты:**
• +5-15% к силовым показателям
• +1-3кг мышечной массы за 4-6 недель
• Улучшение восстановления между подходами

**Важно:** Запивайте водой (не кофе). При почечных проблемах — консультация врача.`;
}
export function guidePreWorkoutNutrition(message: string, workoutTimeHour: number | null, goal: string | null): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['что съесть перед', 'питание перед', 'перед тренировкой поесть', 'еда до тренировки'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant) return '';

  const isMorning = workoutTimeHour !== null && workoutTimeHour < 10;
  const isEvening = workoutTimeHour !== null && workoutTimeHour >= 17;
  const isCut = goal === 'WEIGHT_LOSS' || goal === 'weight_loss' || goal === 'cutting';
  const isMass = goal === 'MUSCLE_GAIN' || goal === 'muscle_gain' || goal === 'hypertrophy';

  // Раскладка макросов здесь была почти дословной копией getPreWorkoutMealPlan
  // ниже, и обе функции ловят фразу "питание перед" — один вопрос давал модели
  // два почти одинаковых куска. Здесь осталось то, чего у соседа нет: время
  // суток. Цель раньше приходила в функцию и не использовалась.
  const morningLine = !isMorning ? '' : isCut
    ? '🌅 Утро: тренировка натощак жир быстрее не сожжёт — суточный дефицит решает. Некомфортно без еды — банан или 20г протеина за 30 мин.'
    : isMass
      ? '🌅 Утро: на массе натощак не тренируйся — потеряешь силовые. Банан + 20-30г протеина за 30-40 мин, этого хватит.'
      : '🌅 Утро: нет времени поесть — протеин и банан за 30 мин.';

  const eveningLine = !isEvening ? '' : isCut
    ? '🌆 Вечер: тяжёлую пищу — не позже чем за 2 часа. Перекус за 45 мин лучше взять белковый, углеводы оставь на после.'
    : isMass
      ? '🌆 Вечер: тяжёлую пищу — не позже чем за 2 часа. За 45 мин углеводный перекус: на массе энергия для последних подходов важнее лёгкости в желудке.'
      : '🌆 Вечер: не ешь тяжёлую пищу менее чем за 2 часа. Перекус за 45 мин — оптимально.';

  return `\n\n🍽 Питание перед тренировкой — по времени суток:

**За 30-60 мин (если основного приёма не было):**
• Банан + 20г протеина
• Йогурт с мюсли
• Рисовые хлебцы + творог

${morningLine}
${eveningLine}

**Чего избегать до тренировки:**
❌ Большие порции жирного (пицца, бургеры) — вздутие, нет энергии
❌ Много клетчатки (бобовые) — дискомфорт в желудке
❌ Алкоголь (даже накануне вечером)`;
}
export function getPreWorkoutMealPlan(message: string, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['перед тренировкой', 'предтреник', 'pre-workout', 'что есть перед', 'питание перед', 'за час до'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const isMass = userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy';
  const isWeightLoss = userGoalStr === 'weight_loss' || userGoalStr === 'cutting';

  const lines: string[] = ['🍽 **Питание перед тренировкой:**', ''];

  lines.push('**За 2-3 часа (полноценный приём):**');
  if (isMass) {
    lines.push('• Рис/гречка + куриная грудка/рыба + овощи');
    lines.push('• 50-80г углеводов + 30-40г белка + минимум жира (замедляет опустошение желудка)');
  } else if (isWeightLoss) {
    lines.push('• Нежирный белок + сложные углеводы в меньшем объёме');
    lines.push('• 30г белка + 30-40г углеводов — питает мышцы, не мешает жиросжиганию');
  } else {
    lines.push('• Смешанный приём: белок + углеводы + немного жира');
    lines.push('• Примеры: гречка с грудкой, овсянка с яйцами, рис с рыбой');
  }

  lines.push('');
  lines.push('**За 30-60 минут (если нет времени на полный приём):**');
  lines.push('• Банан + протеиновый батончик');
  lines.push('• Творог + мёд + ягоды');
  lines.push('• Хлеб цельнозерновой + арахисовая паста');
  lines.push('• Рисовые лепёшки + варёное яйцо');

  lines.push('');
  lines.push('**Чего избегать перед тренировкой:**');
  lines.push('• Жирная еда (шашлык, фастфуд) — тяжесть, тошнота');
  lines.push('• Большие объёмы клетчатки — вздутие на тренировке');
  lines.push('• Бобовые — газообразование во время подходов');

  lines.push('');
  lines.push('☕ Кофеин за 30-60 мин — +3-5% к силовым показателям (150-300 мг = 1-2 чашки).');

  return '\n\n' + lines.join('\n');
}
export function getCaffeineGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['кофеин', 'кофе', 'предтреник', 'caffeine', 'энергетик', 'стимулятор', 'перед тренировкой кофе'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n☕ **Кофеин — наиболее изученный спортивный эргоген:**

**Доказанные эффекты:**
• +3-5% к силовым показателям
• +12-15% к выносливости
• Снижает воспринимаемую нагрузку (RPE) на 1-2 пункта
• Улучшает фокус и координацию

**Оптимальная доза:**
• 3-6 мг на кг веса тела
• Пример: 80 кг → 240-480 мг = 2-4 чашки кофе
• Начинай с меньшей дозы — определи свою толерантность

**Тайминг:**
• За 30-60 минут до тренировки (пик в крови через 45-60 мин)
• Не позже 14:00 (период полувыведения 5-6 часов = нарушает сон до 20:00)

**Формы:**
• Натуральный кофе: работает, плюс теофиллин и хлорогеновая кислота
• Таблетки кофеина: точнее дозировка
• Энергетики: часто содержат лишний сахар, тауринобразные добавки без доказательств

**Толерантность:**
• При ежедневном применении эффект снижается через 2-3 недели
• Циклируй: 5 дней с кофеином, 2 дня без (или неделя без раз в месяц)

⚠️ Тревожность, тахикардия при приёме → снижай дозу. Высокое давление → консультируй врача.`;
}
export function getCreatineFullGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['креатин', 'creatine', 'как принимать креатин', 'нужен ли креатин', 'моногидрат'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n💊 **Креатин — самая изученная спортивная добавка:**

**Почему это лучшая добавка для силового атлета:**
• Более 1,000 исследований подтверждают эффективность
• +5-15% к силовым показателям при регулярном применении
• Увеличивает запасы фосфокреатина в мышцах → больше АТФ для коротких усилий

**Протокол приёма:**

**Вариант 1 — Без загрузки (рекомендуется):**
• 3-5г/день в любое время (с едой или без — всё равно)
• Насыщение тканей через 3-4 недели
• Меньше побочных эффектов (ЖКТ)

**Вариант 2 — С загрузкой (быстрее):**
• 20г/день × 7 дней (по 4×5г с едой) → насыщение за 1 неделю
• Затем поддерживающая доза: 3-5г/день
• Побочка: вздутие, дискомфорт ЖКТ у некоторых

**Важные факты:**
• Форма: моногидрат — лучшая и дешевейшая. Этил эстер, нитрат — маркетинг.
• Вес: прибавка 1-2 кг сразу — это вода в мышцах, не жир
• Вегетарианцы: особенно эффективен (мяса нет = мало своего креатина)
• Безопасность: 30+ лет исследований, нет доказанных побочных эффектов при нормальной функции почек

**Когда не нужен:**
• Кардиоспортсмены (бегуны, велосипедисты): минимальный эффект
• Если уже ешь 400-500г красного мяса в день: частично получаешь из еды

💡 Цена 5г/день: ~15-25₽. Эффект: реальный прирост силы. Лучшее соотношение цена/результат.`;
}
export function getProteinPowderGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['протеин', 'protein powder', 'сывороточный', 'казеин', 'изолят', 'концентрат', 'какой протеин', 'протеиновый порошок'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🥛 **Протеиновые порошки — полный гид:**

**Зачем нужен порошок:**
Это удобство, а не необходимость. Можно набрать белок из еды полностью.
Порошок = просто быстрый, дешёвый источник белка без лишних калорий.

**Виды и когда использовать:**

**Сывороточный концентрат (WPC 80%):**
• 70-80% белка, содержит лактозу
• Быстрое усвоение (пик аминокислот через 30-60 мин)
• Лучший вариант: после тренировки, утром
• Цена: самый дешёвый (~600-1500₽/кг)

**Сывороточный изолят (WPI 90%+):**
• 90%+ белка, почти без лактозы и жира
• Подходит при непереносимости лактозы
• Дороже: ~1500-3000₽/кг

**Казеин (медленный белок):**
• Усваивается 5-7 часов
• Идеален перед сном → постоянный поток аминокислот ночью
• Также: перед длительными перерывами в еде

**Веганские протеины:**
• Горох + рис (комбо) = полный аминокислотный профиль
• Соевый: полноценный, но фитоэстрогены (не критично при нормальных дозах)
• Немного хуже усвоение → бери на 20% больше

**Что искать на этикетке:**
• Белок на порцию: > 20-25г
• Сахара: < 5г/порцию
• Состав: whey concentrate/isolate первым в составе

💡 Бюджетный выбор: отечественный WPC 80% или KFD/Sporter — качество = дорогим брендам.`;
}
export function getSupplementStack(message: string, userGoalStr: string | null): string {
  const lower = message.toLowerCase();
  const keywords = ['стек добавок', 'supplement stack', 'какие добавки', 'что принимать', 'набор добавок', 'спортивное питание список'];
  if (!keywords.some(k => lower.includes(k))) return '';

  const lines: string[] = ['💊 **Стек добавок по приоритету:**', '', '**Уровень 1 — Доказательная база (работает)**'];

  lines.push('• Креатин моногидрат: 3-5г/день → сила +5-15%');
  lines.push('• Витамин D3: 2000-4000 МЕ/день (осень-зима) → тестостерон, иммунитет');
  lines.push('• Магний: 300-400мг/день (цитрат/глицинат) → сон, судороги');
  lines.push('• Протеин (если не добираешь из еды): 20-40г/день');
  lines.push('• Омега-3: 2-3г ЭПК+ДГК → воспаление, суставы');

  lines.push('');
  lines.push('**Уровень 2 — Умеренные доказательства**');
  lines.push('• Кофеин: 3-6мг/кг за 45 мин до тренировки → производительность');
  lines.push('• Цинк: 15-25мг/день (при нагрузках и потоотделении)');
  lines.push('• Бета-аланин: 3.2г/день → выносливость (побочка: покалывание кожи — норма)');

  if (userGoalStr === 'muscle_gain' || userGoalStr === 'hypertrophy') {
    lines.push('');
    lines.push('**Специально для набора мышц:**');
    lines.push('• HMB (β-гидрокси β-метилбутират): 3г/день → может снизить распад мышц');
    lines.push('• Ашваганда: 600мг/день → кортизол ↓, тестостерон ↑ (умеренно)');
  }

  if (userGoalStr === 'weight_loss' || userGoalStr === 'cutting') {
    lines.push('');
    lines.push('**Специально для жиросжигания:**');
    lines.push('• Кофеин (термогенный эффект + аппетит ↓)');
    lines.push('• L-карнитин: слабые доказательства, но безопасен');
    lines.push('• Клетчатка (псиллиум): снижает аппетит, улучшает микробиом');
  }

  lines.push('');
  lines.push('**Не нужны (маркетинг):**');
  lines.push('• BCAA отдельно (если ешь достаточно белка)');
  lines.push('• Жиросжигатели-термогеники (лишний кофеин + риски)');
  lines.push('• "Предтреники" дорогие (часто = кофеин + бета-аланин + ароматизатор)');
  lines.push('');
  lines.push('💡 Уровень 1 = 90% результата. Остальное — оптимизация.');

  return '\n\n' + lines.join('\n');
}
export function getBeginnerSupplementGuide(message: string, totalWorkoutsEver: number): string {
  const lower = message.toLowerCase();
  const isNewcomer = totalWorkoutsEver < 50;
  const relevant = lower.includes('добавк') || lower.includes('спортивное питание') ||
    lower.includes('что принимать') || lower.includes('протеин нужен') ||
    lower.includes('с чего начать') && lower.includes('добавк');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💊 ДОБАВКИ ДЛЯ НАЧИНАЮЩИХ:');
  if (isNewcomer) {
    lines.push(`ℹ️ У тебя ${totalWorkoutsEver} тренировок — добавки не приоритет, важнее питание.`);
  }
  lines.push('');
  lines.push('🥇 УРОВЕНЬ 1 (реально работают, дёшево):');
  lines.push('• Протеин — если не добираешь 2 г/кг из еды (не обязателен при достаточном питании)');
  lines.push('• Креатин — единственная добавка с бесспорной доказательной базой (+5–10% силы)');
  lines.push('• Витамин D3 — большинство россиян в дефиците (2000–4000 МЕ/день)');
  lines.push('• Омега-3 — если мало рыбы (2–3 г EPA+DHA)');
  lines.push('');
  lines.push('🥈 УРОВЕНЬ 2 (полезны в конкретных ситуациях):');
  lines.push('• Магний глицинат — сон, судороги, стресс (400 мг на ночь)');
  lines.push('• Кофеин — предтренировочный стимул (натуральный через кофе)');
  lines.push('• Цинк — при частых болезнях, низком тестостероне');
  lines.push('');
  lines.push('🥉 УРОВЕНЬ 3 (маркетинг, экономь деньги):');
  lines.push('• Тестостероновые бустеры, жиросжигатели, экстракты "ягод ашваганды"');
  lines.push('• NO-бустеры (аргинин) — минимальный эффект');
  lines.push('• Дорогие "матрицы восстановления"');
  lines.push('');
  lines.push('💡 Деньги в зал + качественная еда > все добавки вместе взятые.');
  return '\n\n' + lines.join('\n');
}
export function getCreatineProtocol(message: string): string {
  const lower = message.toLowerCase();
  const relevant = /креатин|creatine|загрузка|поддержк|моногидрат/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💊 ПРОТОКОЛ ПРИЁМА КРЕАТИНА:');
  lines.push('');
  lines.push('📋 ЗАГРУЗКА (быстро, но не обязательно):');
  lines.push('• 5 г × 4 раза в день = 20 г/сут — 5–7 дней');
  lines.push('• Насыщение мышц за 1 неделю');
  lines.push('• Побочка: возможен дискомфорт ЖКТ');
  lines.push('');
  lines.push('📋 БЕЗ ЗАГРУЗКИ (рекомендуется):');
  lines.push('• 3–5 г каждый день');
  lines.push('• Насыщение за 3–4 недели');
  lines.push('• Никакой разницы в долгосрочном эффекте');
  lines.push('');
  lines.push('⏰ КОГДА ПРИНИМАТЬ:');
  lines.push('• В тренировочный день: после тренировки (с углеводами/белком)');
  lines.push('• В день отдыха: в любое время');
  lines.push('• Форма: моногидрат — самая изученная и дешёвая');
  lines.push('');
  lines.push('💧 ВАЖНО: пить достаточно воды (2–3 л/сут)');
  lines.push('🔄 Отмена: через 4–6 нед сила немного снизится — это норма');
  return '\n\n' + lines.join('\n');
}
export function getPreWorkoutCaffeineTiming(message: string): string {
  const relevant = /кофеин.+тренировк|кофе.+до тренировк|предтрен.+кофеин|caffeine.+workout|когда пить кофе/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('☕ КОФЕИН ПЕРЕД ТРЕНИРОВКОЙ — оптимальная схема:');
  lines.push('');
  lines.push('⏰ ТАЙМИНГ:');
  lines.push('• Кофеин достигает пика в крови через 30–60 мин');
  lines.push('• Пей за 45–60 мин до тренировки');
  lines.push('• Эффект длится 4–6 часов (полувыведение)');
  lines.push('');
  lines.push('📊 ДОЗИРОВКА:');
  lines.push('• Эффективная: 3–6 мг/кг (для 80 кг = 240–480 мг)');
  lines.push('• Начни с нижней границы — чувствительность индивидуальна');
  lines.push('• 1 чашка эспрессо: ~70 мг, фильтр-кофе: ~90–120 мг');
  lines.push('');
  lines.push('🎯 ЭФФЕКТЫ:');
  lines.push('• Сила: +2–4%');
  lines.push('• Выносливость: +4–8%');
  lines.push('• Снижение болевого восприятия и усилия');
  lines.push('');
  lines.push('⚠️ ВАЖНО:');
  lines.push('• Толерантность развивается за 1–2 недели');
  lines.push('• Циклируй: 4–6 нед приём → 1–2 нед отдыха');
  lines.push('• НЕ принимай после 14:00–15:00 — нарушит сон');
  return '\n\n' + lines.join('\n');
}
export function getPreWorkoutMealTiming(message: string): string {
  const relevant = /есть перед тренировкой|предтрен.+еда|pre.?workout.+meal|что поесть до|питание до тренировки/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🍽️ ПИТАНИЕ ПЕРЕД ТРЕНИРОВКОЙ — тайминг:');
  lines.push('');
  lines.push('⏰ ЗА 2–3 ЧАСА (полноценный приём):');
  lines.push('• Белок 30–40 г + медленные углеводы 50–80 г + немного жиров');
  lines.push('• Гречка с куриным филе, рис с яйцами и овощами');
  lines.push('• Оптимально для максимальной энергии');
  lines.push('');
  lines.push('⚡ ЗА 60–90 МИНУТ (лёгкий перекус):');
  lines.push('• Быстрые + медленные углеводы 30–50 г, минимум жиров');
  lines.push('• Банан, рисовый хлеб с мёдом, фрукты + йогурт');
  lines.push('');
  lines.push('🏃 ЗА 30–45 МИНУТ (совсем быстро):');
  lines.push('• Только быстрые углеводы 20–30 г');
  lines.push('• Банан, сок, спортивный напиток, горсть изюма');
  lines.push('');
  lines.push('💧 ГИДРАТАЦИЯ: за 2 ч — 400–600 мл воды');
  lines.push('');
  lines.push('❌ ИЗБЕГАТЬ ПЕРЕД ТРЕНИРОВКОЙ:');
  lines.push('• Жирная еда (замедляет переваривание)');
  lines.push('• Большой объём клетчатки (вздутие)');
  lines.push('• Алкоголь (снижает силу, нарушает координацию)');
  return '\n\n' + lines.join('\n');
}
export function getVitaminDAthletes(message: string): string {
  const relevant = /витамин д|vitamin d|витамин d|д3|нехватка солнца|дефицит витамин/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('☀️ ВИТАМИН D ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('📊 ПОЧЕМУ КРИТИЧНО:');
  lines.push('• 80% россиян имеют недостаток витамина D (особенно октябрь–март)');
  lines.push('• Дефицит → снижение силы, иммунитета, синтеза тестостерона');
  lines.push('• Витамин D влияет на экспрессию 1000+ генов, включая мышечные');
  lines.push('');
  lines.push('🎯 ДОЗИРОВКА:');
  lines.push('• Минимальная: 1000–2000 МЕ/день');
  lines.push('• Для спортсменов с дефицитом: 4000–6000 МЕ/день (под контролем)');
  lines.push('• Измерь 25(OH)D: оптимум для спортсменов 50–80 нг/мл');
  lines.push('');
  lines.push('💊 ФОРМА И ПРИЁМ:');
  lines.push('• D3 (холекальциферол) > D2 — более биодоступен');
  lines.push('• Принимай с жирной едой (жирорастворимый)');
  lines.push('• Совместно с K2 (МК-7): направляет кальций в кости, не сосуды');
  lines.push('');
  lines.push('⚡ ЭФФЕКТ ДЛЯ СПОРТА: сила, скорость восстановления, иммунитет, настроение');
  return '\n\n' + lines.join('\n');
}
export function getOmega3Athletes(message: string): string {
  const relevant = /омега.?3|omega.?3|рыбий жир|fish oil|дгк|эпк|EPA|DHA/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🐟 ОМЕГА-3 ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('🔬 ЧТО ДАЁТ:');
  lines.push('• Снижение воспаления после тренировок');
  lines.push('• Ускоренное восстановление мышц');
  lines.push('• Защита суставов и хрящей');
  lines.push('• Улучшение чувствительности к инсулину');
  lines.push('• Здоровье сердца и мозга');
  lines.push('');
  lines.push('📊 ДОЗИРОВКА:');
  lines.push('• Профилактика: 1–2 г EPA+DHA в день');
  lines.push('• При активных тренировках: 2–4 г EPA+DHA');
  lines.push('• Терапевтическая (боли в суставах): до 4–6 г под контролем');
  lines.push('');
  lines.push('💊 ФОРМА:');
  lines.push('• Рыбий жир: доступен, проверяй чистоту (rtTG-форма лучше)');
  lines.push('• Масло криля: дороже, лучшая биодоступность');
  lines.push('• Растительные (АЛК): плохо конвертируются в EPA/DHA');
  lines.push('');
  lines.push('⏰ ТАЙМИНГ: во время еды, лучше утром');
  lines.push('⚠️ Принимай с антиоксидантами (витамин Е) для защиты от окисления');
  return '\n\n' + lines.join('\n');
}
export function getCollagenJointHealth(message: string): string {
  const relevant = /коллаген|collagen|суставы.+добавк|связки.+укрепить|хрящ.+питани|gelatin/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦴 КОЛЛАГЕН ДЛЯ СУСТАВОВ И СВЯЗОК:');
  lines.push('');
  lines.push('🔬 ОСНОВЫ:');
  lines.push('• Коллаген — основной белок суставного хряща, связок, сухожилий');
  lines.push('• С возраста 25+ синтез снижается, потребность у спортсменов повышена');
  lines.push('');
  lines.push('💊 КАК ПРИНИМАТЬ:');
  lines.push('• Гидролизованный коллаген: 10–15 г за 30–60 мин ДО тренировки');
  lines.push('• Обязательно с витамином C (250–500 мг) — нужен для синтеза коллагена');
  lines.push('• Тип I/III: связки, кожа, кости; Тип II: хрящи');
  lines.push('');
  lines.push('🍲 НАТУРАЛЬНЫЕ ИСТОЧНИКИ:');
  lines.push('• Костный бульон (говяжий): 8–10 г коллагена/стакан');
  lines.push('• Холодец, студень — русская традиция = функциональное питание!');
  lines.push('• Желатин + апельсиновый сок = практически то же что спортивный коллаген');
  lines.push('');
  lines.push('⏰ ЭФФЕКТ: заметен через 8–12 недель регулярного приёма');
  lines.push('⚠️ Коллаген НЕ заменяет полноценный белок — это добавка для суставов');
  return '\n\n' + lines.join('\n');
}
export function getMagnesiumRecovery(message: string): string {
  const relevant = /магний|magnesium|судороги.+ночью|мышечные судороги|не могу расслабиться|Mg /i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💊 МАГНИЙ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('📊 ЗАЧЕМ ВАЖЕН:');
  lines.push('• Участвует в >300 ферментативных реакциях, включая синтез АТФ');
  lines.push('• Расслабление мышц (баланс Ca²⁺/Mg²⁺)');
  lines.push('• Синтез белка, производство тестостерона');
  lines.push('• Улучшение сна (регуляция ГАМК)');
  lines.push('• Дефицит у 70% активных людей!');
  lines.push('');
  lines.push('🎯 ДОЗИРОВКА:');
  lines.push('• 300–400 мг элементарного магния в день');
  lines.push('• Форма: глицинат (лучший для сна), малат (для энергии), цитрат (доступен)');
  lines.push('• Избегай оксид — плохо усваивается');
  lines.push('');
  lines.push('⏰ ТАЙМИНГ:');
  lines.push('• Вечером перед сном: расслабляет, улучшает сон');
  lines.push('• Или после тренировки: восполняет потери с потом');
  lines.push('');
  lines.push('🥗 ПИЩЕВЫЕ ИСТОЧНИКИ: тёмный шоколад, орехи, шпинат, гречка, бобовые');
  return '\n\n' + lines.join('\n');
}
export function getElectrolytesGuide(message: string): string {
  const keywords = ['электролит', 'натрий', 'калий', 'судорог', 'спазм', 'cramping', 'electrolyte', 'соль тренировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('⚡ ЭЛЕКТРОЛИТЫ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('🔬 КЛЮЧЕВЫЕ ЭЛЕКТРОЛИТЫ:');
  lines.push('• Натрий (Na): основной, теряется с потом (0.9-2г/л пота)');
  lines.push('• Калий (K): сокращение мышц, сердечный ритм');
  lines.push('• Магний (Mg): расслабление мышц, энергия');
  lines.push('• Кальций (Ca): сокращение мышц, нервная проводимость');
  lines.push('');
  lines.push('💧 КОГДА НУЖНА ДОБАВКА:');
  lines.push('• Тренировка >60 мин — добавь натрий');
  lines.push('• Жаркая погода — потери натрия x2-3');
  lines.push('• Судороги во время тренировки — дефицит Na/Mg/K');
  lines.push('• Кето/низкоуглеводная диета — повышенная потребность');
  lines.push('');
  lines.push('🥤 ПРОСТОЙ РЕЦЕПТ ИЗОТОНИКА:');
  lines.push('• 1л воды + 1/4 ч.л. соли + 2 ст.л. мёда + сок лимона');
  lines.push('• Или: кокосовая вода + щепотка соли');
  lines.push('');
  lines.push('⚠️ Не переборщи с натрием при гипертонии!');
  return '\n\n' + lines.join('\n');
}
export function getCaffeineCyclingStrategy(message: string): string {
  const keywords = ['кофеин цикл', 'толерантность кофеин', 'кофе перестал действ', 'caffeine cycling', 'привыкание к кофе'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('☕ ЦИКЛИРОВАНИЕ КОФЕИНА:');
  lines.push('');
  lines.push('🔬 ПРОБЛЕМА: через 2-3 недели ежедневного приёма эффект ↓ (толерантность)');
  lines.push('');
  lines.push('📊 СТРАТЕГИИ:');
  lines.push('');
  lines.push('1️⃣ Полный отказ на 7-14 дней:');
  lines.push('• Самый эффективный ресет');
  lines.push('• Первые 2-3 дня: головная боль, усталость');
  lines.push('• После ресета: кофеин снова работает на 100%');
  lines.push('');
  lines.push('2️⃣ Циклирование 5/2:');
  lines.push('• 5 дней с кофеином, 2 дня без');
  lines.push('• Поддерживает чувствительность');
  lines.push('• Выходные без кофеина (если не тренируешься)');
  lines.push('');
  lines.push('3️⃣ Только перед тренировкой:');
  lines.push('• 200-400мг за 30-60 мин до тренировки');
  lines.push('• В нетренировочные дни — без кофеина');
  lines.push('');
  lines.push('⏰ Последний приём: минимум за 6-8ч до сна (период полувыведения)');
  lines.push('📋 Оптимальная доза: 3-6 мг/кг массы тела');
  return '\n\n' + lines.join('\n');
}
export function getProteinPowderComparison(message: string): string {
  const keywords = ['сывороточн казеин', 'whey vs casein', 'какой протеин выбрать', 'протеин сравнен', 'растительн протеин', 'вид протеин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🥛 СРАВНЕНИЕ ПРОТЕИНОВЫХ ПОРОШКОВ:');
  lines.push('');
  lines.push('⚡ СЫВОРОТОЧНЫЙ (Whey):');
  lines.push('• Скорость усвоения: быстрая (30-60 мин)');
  lines.push('• Лейцин: 10-12% (высокий — триггер синтеза белка)');
  lines.push('• Когда: после тренировки, утром');
  lines.push('• Whey Concentrate (80%) — дешевле, Isolate (90%) — меньше лактозы');
  lines.push('');
  lines.push('🌙 КАЗЕИН:');
  lines.push('• Скорость: медленная (6-8 часов)');
  lines.push('• Лейцин: 8-9%');
  lines.push('• Когда: перед сном (антикатаболический эффект)');
  lines.push('• Альтернатива: творог (натуральный казеин)');
  lines.push('');
  lines.push('🌱 РАСТИТЕЛЬНЫЙ:');
  lines.push('• Горох + рис: комбинация даёт полный аминопрофиль');
  lines.push('• Лейцин: 6-8% (ниже → нужно больше порция)');
  lines.push('• Когда: для веганов/непереносимость лактозы');
  lines.push('• Порция: 35-45г (vs 25-30г whey)');
  lines.push('');
  lines.push('🎯 ОПТИМАЛЬНО:');
  lines.push('• Whey после тренировки + казеин (или творог) на ночь');
  lines.push('• Или: 2 порции whey в день, если удобнее');
  return '\n\n' + lines.join('\n');
}
export function getZincMagnesiumAthletes(message: string): string {
  const keywords = ['цинк магний', 'ZMA', 'цинк тренировк', 'магний спорт', 'zinc magnesium', 'минералы спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💊 ЦИНК И МАГНИЙ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('🔬 ЦИНК (Zn):');
  lines.push('• Роль: тестостерон, иммунитет, синтез белка');
  lines.push('• Потребность: 15-30мг/день (спортсмены теряют с потом)');
  lines.push('• Источники: красное мясо, тыквенные семечки, устрицы');
  lines.push('• Дефицит: ↓ тестостерон, частые простуды, медленное заживление');
  lines.push('');
  lines.push('🔬 МАГНИЙ (Mg):');
  lines.push('• Роль: мышечная функция, сон, >300 ферментативных реакций');
  lines.push('• Потребность: 400-600мг/день (спортсмены — верхняя граница)');
  lines.push('• Источники: шпинат, миндаль, тёмный шоколад, авокадо');
  lines.push('• Дефицит: судороги, плохой сон, тревожность');
  lines.push('');
  lines.push('📋 ФОРМЫ ДОБАВОК:');
  lines.push('• Магний: глицинат (сон), цитрат (общий), треонат (когнитивный)');
  lines.push('• Цинк: пиколинат или бисглицинат (высокая усвояемость)');
  lines.push('• ZMA (цинк+магний+B6): комплексная добавка');
  lines.push('');
  lines.push('⚠️ Цинк и магний: принимать на пустой желудок или перед сном');
  lines.push('⚠️ Не принимать цинк >50мг/день длительно (↓ медь)');
  return '\n\n' + lines.join('\n');
}
export function getIronDeficiencyAthletes(message: string): string {
  const keywords = ['железо дефицит', 'анеми', 'iron deficiency', 'ферритин', 'гемоглобин низк', 'усталость трен'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🩸 ДЕФИЦИТ ЖЕЛЕЗА У СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('🔬 ПОЧЕМУ АТЛЕТЫ В ГРУППЕ РИСКА:');
  lines.push('• Потери с потом, ЖКТ-стрессом, гемолизом (бег)');
  lines.push('• Повышенная потребность (эритроциты + миоглобин)');
  lines.push('• Женщины: менструация дополнительно ↑ потери');
  lines.push('');
  lines.push('📊 СИМПТОМЫ:');
  lines.push('• Необъяснимая усталость и ↓ производительности');
  lines.push('• Одышка при обычной нагрузке');
  lines.push('• Бледность, ломкие ногти, выпадение волос');
  lines.push('• Частые простуды');
  lines.push('');
  lines.push('🩺 ДИАГНОСТИКА (анализы):');
  lines.push('• Ферритин: оптимально >50 нг/мл (не просто "в норме")');
  lines.push('• Гемоглобин: >130 мужчины, >120 женщины');
  lines.push('• Трансферрин, ОЖСС — дополнительно');
  lines.push('');
  lines.push('📋 ИСТОЧНИКИ:');
  lines.push('• Гемовое железо (мясо, печень): усвоение 15-35%');
  lines.push('• Негемовое (шпинат, бобовые): усвоение 2-20%');
  lines.push('• Витамин С ↑ усвоение негемового железа');
  lines.push('• Кофе/чай/кальций ↓ усвоение (не совмещать с железом)');
  lines.push('');
  lines.push('⚠️ Не принимай железо "на всякий случай" — избыток токсичен! Сначала анализ');
  return '\n\n' + lines.join('\n');
}
export function getVitaminB12Performance(message: string): string {
  const kw = /b12|б12|витамин.*б|кобаламин|веган.*витамин|анеми|усталость.*витамин/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('💊 ВИТАМИН B12 И СПОРТИВНАЯ ПРОИЗВОДИТЕЛЬНОСТЬ:');
  lines.push('');
  lines.push('🔬 Роль B12 в организме:');
  lines.push('• Синтез красных кровяных клеток → доставка кислорода');
  lines.push('• Функция нервной системы → мышечная координация');
  lines.push('• Синтез ДНК → восстановление и рост тканей');
  lines.push('• Метаболизм фолиевой кислоты → энергопроизводство');
  lines.push('');
  lines.push('⚠️ Группы риска дефицита:');
  lines.push('• Веганы и строгие вегетарианцы (B12 только в животных продуктах)');
  lines.push('• Пожилые (снижение абсорбции с возрастом)');
  lines.push('• Люди с проблемами ЖКТ (гастрит, целиакия)');
  lines.push('• Принимающие метформин, омепразол');
  lines.push('');
  lines.push('🥩 Источники:');
  lines.push('• Печень говяжья — 60 мкг/100г (2000% дневной нормы!)');
  lines.push('• Скумбрия — 19 мкг/100г');
  lines.push('• Говядина — 6 мкг/100г');
  lines.push('• Яйца — 2 мкг/100г');
  lines.push('• Для веганов: обогащённое растительное молоко, добавки');
  lines.push('');
  lines.push('💡 Рекомендации:');
  lines.push('• Норма: 2.4 мкг/день (спортсменам может быть нужно больше)');
  lines.push('• Веганам: обязательно добавка 250-500 мкг/день');
  lines.push('• Форма: метилкобаламин > цианокобаламин (лучше усваивается)');
  lines.push('• Анализ: сывороточный B12 + гомоцистеин для точной оценки');
  return '\n\n' + lines.join('\n');
}
export function getPreWorkoutSupplements(message: string): string {
  const kw = /предтрен|пре.?ворк|pre.?workout|бустер.*тренир|энерг.*тренир|dmaa|цитруллин.*кофеин/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('⚡ ПРЕДТРЕНИРОВОЧНЫЕ КОМПЛЕКСЫ (ПРЕ-ВОРКАУТ):');
  lines.push('');
  lines.push('📋 Ключевые ингредиенты (с доказательной базой):');
  lines.push('• Кофеин: 3-6 мг/кг за 30-60 мин (сила + выносливость)');
  lines.push('• Цитруллин малат: 6-8 г (пампинг + выносливость)');
  lines.push('• Бета-аланин: 3.2-6.4 г/день (буфер закисления)');
  lines.push('• Креатин: 3-5 г/день (можно в любое время, не обязательно до)');
  lines.push('• Таурин: 1-3 г (антиоксидант, фокус)');
  lines.push('');
  lines.push('⚠️ Что НЕ работает/опасно:');
  lines.push('• DMAA/DMHA — запрещены, опасны для сердца');
  lines.push('• "Проприетарные смеси" — непрозрачный состав');
  lines.push('• Аргинин в свободной форме — плохое усвоение (цитруллин лучше)');
  lines.push('• Передозировка кофеина (>600 мг) — тремор, тахикардия');
  lines.push('');
  lines.push('💊 Собери свой предтреник (дешевле и эффективнее):');
  lines.push('• Кофе 2 чашки (200 мг кофеина) + цитруллин 6г + креатин 5г');
  lines.push('• Стоимость: ~15-20₽ за порцию vs 100-150₽ за готовый');
  lines.push('');
  lines.push('📊 Тайминг:');
  lines.push('• Кофеин: 30-60 мин до тренировки');
  lines.push('• Цитруллин: 30-40 мин до');
  lines.push('• Бета-аланин: ежедневно (накопительный эффект)');
  lines.push('• Не принимай после 16:00 (нарушение сна)');
  return '\n\n' + lines.join('\n');
}
export function getVitaminDAthletic(message: string): string {
  const kw = /витамин.*[dд].*спорт|витамин.*[dд].*мышц|солнц.*витамин|дефицит.*[dд]|[dд].*дефицит|холекальциф/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('☀️ ВИТАМИН D И СПОРТИВНАЯ ПРОИЗВОДИТЕЛЬНОСТЬ:');
  lines.push('');
  lines.push('🔬 Влияние на спорт:');
  lines.push('• Рецепторы витамина D есть в мышечных клетках');
  lines.push('• Дефицит → снижение силы на 10-15%');
  lines.push('• Влияет на синтез тестостерона');
  lines.push('• Регуляция кальция → сокращение мышц, здоровье костей');
  lines.push('• Иммунитет: снижение ОРВИ на 40% при достаточном уровне');
  lines.push('');
  lines.push('📊 Уровни в крови (25(OH)D):');
  lines.push('• <20 нг/мл — дефицит (у 80% россиян зимой!)');
  lines.push('• 20-30 нг/мл — недостаточность');
  lines.push('• 30-50 нг/мл — оптимум для спортсменов');
  lines.push('• >100 нг/мл — токсичность (не превышай!)');
  lines.push('');
  lines.push('💊 Рекомендации:');
  lines.push('• Анализ крови 2 раза/год (осень + весна)');
  lines.push('• Поддержание: 2000-4000 МЕ/день');
  lines.push('• Коррекция дефицита: 5000-10000 МЕ/день (под контролем врача)');
  lines.push('• Форма: D3 (холекальциферол) > D2');
  lines.push('• Принимай с жирной пищей (жирорастворимый!)');
  lines.push('• Кофактор: витамин K2 (направляет кальций в кости, а не в сосуды)');
  return '\n\n' + lines.join('\n');
}
export function getProbioticsAthletes(message: string): string {
  const kw = /пробиотик|лактобактер|бифидо|кишечн.*флор|микрофлор.*кишечн|ферментир.*продукт|кефир.*польз/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦠 ПРОБИОТИКИ ДЛЯ СПОРТСМЕНОВ:');
  lines.push('');
  lines.push('🔬 Доказанные эффекты:');
  lines.push('• Снижение ОРВИ у спортсменов на 30-50%');
  lines.push('• Улучшение пищеварения и усвоения белка');
  lines.push('• Снижение воспалительных маркеров после тренировок');
  lines.push('• Улучшение настроения (ось кишечник-мозг)');
  lines.push('• Возможное улучшение состава тела');
  lines.push('');
  lines.push('🍶 Продукты-источники:');
  lines.push('• Кефир — лучший натуральный пробиотик (до 30 штаммов!)');
  lines.push('• Натуральный йогурт (без сахара)');
  lines.push('• Квашеная капуста (НЕ пастеризованная!)');
  lines.push('• Кимчи');
  lines.push('• Комбуча');
  lines.push('');
  lines.push('💊 Добавки:');
  lines.push('• Lactobacillus + Bifidobacterium — базовые штаммы');
  lines.push('• 10-20 млрд КОЕ/день — эффективная доза');
  lines.push('• Курс: минимум 4 недели для эффекта');
  lines.push('• Хранить в холодильнике (если живые бактерии)');
  lines.push('');
  lines.push('📊 Для спортсменов: кефир 200-300мл/день + квашеная капуста = отличная база');
  lines.push('💡 Не принимай пробиотики сразу с антибиотиками — разница 2 часа');
  return '\n\n' + lines.join('\n');
}
export function getIronZincInteraction(message: string): string {
  const kw = /железо.*цинк|цинк.*железо|совмест.*минерал|минерал.*совмест|антагон.*минерал|взаимодейств.*добав/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('⚗️ ВЗАИМОДЕЙСТВИЕ ЖЕЛЕЗА И ЦИНКА:');
  lines.push('');
  lines.push('🔬 Проблема:');
  lines.push('• Железо и цинк конкурируют за абсорбцию в кишечнике');
  lines.push('• Совместный приём → усвоение обоих снижается на 30-50%');
  lines.push('• Кальций тоже мешает усвоению железа');
  lines.push('');
  lines.push('📊 Правила совместимости:');
  lines.push('• Железо + витамин C → усвоение ↑ в 3-6 раз!');
  lines.push('• Железо + кальций → НЕ совмещать (разные приёмы пищи)');
  lines.push('• Цинк + медь → антагонисты (нужен баланс)');
  lines.push('• Магний + кальций → конкурируют, но меньше');
  lines.push('• Витамин D + кальций → синергия (совмещай!)');
  lines.push('• Витамин D + K2 → синергия (совмещай!)');
  lines.push('');
  lines.push('📋 Оптимальное расписание:');
  lines.push('• Утро: железо + витамин C (натощак лучше)');
  lines.push('• Обед: цинк + еда');
  lines.push('• Вечер: магний + кальций + витамин D');
  lines.push('• Между приёмами минералов: минимум 2 часа');
  lines.push('');
  lines.push('💡 Из еды — конкуренция минимальна (матрица пищи защищает)');
  lines.push('Проблема в основном с добавками в высоких дозах');
  return '\n\n' + lines.join('\n');
}
export function getZincSupplementation(message: string): string {
  const keywords = ['цинк', 'zinc', 'иммунитет', 'тестостерон', 'заживление', 'кожа'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ЦИНК ДЛЯ СПОРТСМЕНОВ]
Цинк — критический минерал для синтеза белка, иммунитета и гормональной системы.

Функции в спорте:
- Участвует в синтезе тестостерона и гормона роста
- Поддерживает иммунитет (интенсивные тренировки снижают запасы)
- Ускоряет заживление тканей и восстановление
- Участвует в 300+ ферментативных реакциях

Дозировка:
- Мужчины: 15-30 мг/день (верхний предел 40 мг)
- Женщины: 12-25 мг/день
- При дефиците: до 50 мг/день курсом 2-3 месяца
- Форма: пиколинат или бисглицинат (лучшее усвоение)

Источники:
- Устрицы — 74 мг/100г (абсолютный лидер)
- Говядина — 12 мг/100г
- Тыквенные семечки — 10 мг/100г
- Чечевица — 5 мг/100г
- Кешью — 5.6 мг/100г

Важно: фитаты (зерновые, бобовые) снижают усвоение цинка. Принимай отдельно от кальция и железа.
Признаки дефицита: частые простуды, медленное заживление, выпадение волос, снижение аппетита.`;
}
export function getColostrumSupplement(message: string): string {
  const keywords = ['колострум', 'colostrum', 'молозиво', 'иммуноглобулин', 'кишечник', 'восстановление'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[КОЛОСТРУМ (МОЛОЗИВО) ДЛЯ СПОРТСМЕНОВ]
Колострум — первое молоко, богатое иммуноглобулинами, факторами роста и противовоспалительными веществами.

Доказанные эффекты:
- Укрепление кишечного барьера (снижает проницаемость при интенсивных тренировках)
- Поддержка иммунитета в периоды высоких нагрузок
- Ускорение восстановления мышц (IGF-1, TGF-β)
- Снижение риска ОРВИ у спортсменов на 30-50%

Дозировка:
- Стандартная: 10-20г/день порошка
- Интенсивные нагрузки: 20-40г/день
- Курс: 8-12 недель, затем перерыв 4 недели
- Приём: натощак или за 30 мин до еды

Состав (на 10г):
- IgG (иммуноглобулин G): 2-3г
- Лактоферрин: 100-300мг
- Факторы роста (IGF-1, IGF-2): следовые количества
- Пролин-богатые полипептиды

Важно: выбирай колострум от коров на свободном выпасе, без антибиотиков.
Не является допингом — разрешён WADA.`;
}
export function getVitaminK2Calcium(message: string): string {
  const keywords = ['витамин к2', 'vitamin k2', 'менахинон', 'кальций кости', 'кальцификация', 'остеокальцин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ВИТАМИН K2 — НАПРАВЛЯЕТ КАЛЬЦИЙ В КОСТИ]
K2 (менахинон) — критический витамин, определяющий КУДА пойдёт кальций: в кости или в артерии.

Механизм:
- Активирует остеокальцин → кальций встраивается в кости
- Активирует MGP (матричный Gla-протеин) → предотвращает кальцификацию сосудов
- Без K2 кальций может откладываться в артериях, суставах, почках

Для спортсменов:
- Укрепление костей при ударных нагрузках
- Профилактика стресс-переломов
- Синергия с витамином D3 (D3 увеличивает усвоение Ca, K2 направляет его)
- Здоровье суставов и связок

Дозировка:
- MK-7 (лучшая форма): 100-200 мкг/день
- MK-4: 1-15 мг/день (короткий период полувыведения)
- Принимать с жирной пищей (жирорастворимый)
- Связка: D3 (2000-5000 МЕ) + K2 (100-200 мкг) + Магний

Источники:
- Натто (соевые бобы): 1000+ мкг/100г (MK-7)
- Твёрдые сыры: 50-80 мкг/100г (MK-9)
- Гусиная печень: 370 мкг/100г
- Яичный желток: 15-30 мкг

Противопоказания: приём варфарина (антикоагулянт) — K2 снижает его действие.
Дефицит распространён: до 50% населения не получает достаточно K2.`;
}
export function getAdaptogenicMushrooms(message: string): string {
  const keywords = ['грибы адаптоген', 'lion\'s mane', 'рейши', 'reishi', 'кордицепс', 'cordyceps', 'чага', 'грибные добавк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[АДАПТОГЕННЫЕ ГРИБЫ ДЛЯ СПОРТСМЕНОВ]
Функциональные грибы — тренд с научной базой для выносливости, восстановления и когнитивных функций.

1. КОРДИЦЕПС (Cordyceps militaris):
   - Повышает VO2max на 7-11% (метаанализ 2020)
   - Увеличивает выработку ATP
   - Дозировка: 1-3г/день или 500мг экстракта

2. РЕЙШИ (Ganoderma lucidum):
   - Модулирует иммунитет (не стимулирует, а балансирует)
   - Улучшает качество сна (не седативный)
   - Снижает кортизол
   - Дозировка: 1-2г/день экстракта, вечером

3. ЕЖОВИК ГРЕБЕНЧАТЫЙ (Lion's Mane):
   - Стимулирует NGF (фактор роста нервов)
   - Улучшает фокус, память, нейропластичность
   - Дозировка: 500мг-2г/день экстракта

4. ЧАГА (Inonotus obliquus):
   - Мощный антиоксидант (ORAC > ягод асаи)
   - Поддерживает иммунитет
   - Противовоспалительное действие
   - Дозировка: 1-2г/день, как чай или экстракт

Российский бонус: чага и кордицепс растут в России — качественное отечественное сырьё.
Стек для спортсмена: кордицепс (утро) + Lion's Mane (день) + рейши (вечер).
Форма: двойной экстракт (водный + спиртовой) — оптимальное усвоение.`;
}
export function getElectrolyteBalanceSport(message: string): string {
  const keywords = ['электролит баланс', 'electrolyte', 'натрий калий баланс', 'судороги тренировк', 'пот минерал', 'солевой баланс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ЭЛЕКТРОЛИТНЫЙ БАЛАНС ПРИ ТРЕНИРОВКАХ]
С потом теряется 1-2 литра жидкости/час с критическими минералами. Дисбаланс → судороги, слабость, аритмия.

Потери с потом (на 1 литр):
- Натрий: 500-1500 мг (основная потеря!)
- Калий: 100-200 мг
- Магний: 10-30 мг
- Кальций: 20-60 мг
- Хлор: 700-2000 мг

Стратегия восполнения:
ДО тренировки (30-60 мин):
- 400-500 мл воды + 500 мг натрия + 200 мг калия

ВО ВРЕМЯ тренировки:
- 150-200 мл каждые 15-20 мин
- При >60 мин: добавлять электролиты
- Рецепт: 1л воды + 1/4 ч.л. соли + сок лимона + мёд

ПОСЛЕ тренировки:
- 150% от потерянного веса (взвесься до и после)
- 1000-1500 мг натрия + 300-500 мг калия
- Магний: 200-400 мг (цитрат или глицинат)

Признаки дисбаланса:
- Судороги → дефицит магния/натрия
- Слабость, головокружение → низкий натрий
- Мышечные подёргивания → дефицит кальция/магния
- Тошнота при тренировке → возможна гипонатриемия (перебор воды!)

Важно: ЧИСТАЯ ВОДА при длительных тренировках может быть ОПАСНЕЕ обезвоживания (гипонатриемия). Всегда добавляй электролиты.`;
}
export function getHmbSupplement(message: string): string {
  const keywords = ['hmb', 'гидроксиметилбутират', 'hmb добавка', 'анти-катаболи', 'hmb мышцы'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[HMB (β-ГИДРОКСИМЕТИЛБУТИРАТ) — АНТИКАТАБОЛИК]
Метаболит лейцина — защищает мышцы от распада при интенсивных нагрузках и дефиците калорий.

Механизм:
- Активирует mTOR (синтез белка) и ингибирует убиквитин-протеасомный путь (распад)
- Из 20г лейцина организм производит только 1г HMB — мало!
- Стабилизирует клеточные мембраны мышечных волокон
- Снижает миостатин (ингибитор роста мышц)

Когда РЕАЛЬНО эффективен:
✅ Новички (первые 3-6 месяцев тренировок) — снижение DOMS; данные на рост слабые
⚠️ Мета-анализ по тренированным: эффект НУЛЕВОЙ (сила ES=0.00) — не трать деньги, если давно тренируешься
✅ Сушка/дефицит калорий — сохранение мышечной массы
✅ Пожилые спортсмены — антисаркопения
✅ Травмы/иммобилизация — снижение атрофии
❌ Опытные спортсмены на профиците — минимальный эффект

Дозировка:
- 3г/день, разделить на 3 приёма (по 1г)
- HMB-FA (свободная кислота): 3г/день, 30 мин до тренировки
- HMB-Ca (кальциевая соль): 3г/день, с едой

Формы:
- HMB-FA: быстрое усвоение (30 мин), дороже
- HMB-Ca: медленное усвоение (2-3 часа), дешевле

Совместимость: хорошо с креатином (синергия для новичков), витамином D, протеином.
Побочки: нет при рекомендуемых дозах.`;
}
export function getOmega3AthleteDosage(message: string): string {
  const keywords = ['омега', 'omega', 'рыбий жир', 'epa', 'dha', 'жирные кислоты', 'fish oil'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🐟 ОМЕГА-3 ДЛЯ СПОРТСМЕНОВ:

Зачем атлетам:
- Снижение воспаления после тренировок (DOMS -15-20%)
- Улучшение синтеза мышечного белка (+25% при 4г/день)
- Защита суставов и связок
- Улучшение когнитивных функций (DHA)
- Кардиозащита при высокоинтенсивных нагрузках

Дозировки для спортсменов:
- Минимум: 2г EPA+DHA/день (общее здоровье)
- Оптимум: 3-4г EPA+DHA/день (восстановление)
- При травмах/воспалении: 4-6г/день (краткосрочно)
- Соотношение: EPA:DHA = 2:1 (для воспаления) или 1:1

Когда принимать:
- С жирной пищей (усвоение +70%)
- Разделить на 2-3 приёма
- После тренировки — оптимально для восстановления
- Утром — для когнитивных функций

Форма:
- Триглицериды (rTG): лучшее усвоение
- Этиловые эфиры (EE): дешевле, хуже усвоение
- Фосфолипиды (криль): хорошее усвоение, дороже
- Проверять IFOS/Labdoor рейтинг

Маркеры эффективности:
- Omega-3 Index >8% (анализ крови)
- Снижение hs-CRP (воспаление)
- Субъективно: меньше DOMS, лучше сон

Противопоказания: высокие дозы перед операцией (разжижение крови).`;
}
export function getBVitaminsSport(message: string): string {
  const keywords = ['витамин b', 'витамины б', 'b-комплекс', 'b12', 'b6', 'фолиевая', 'тиамин', 'рибофлавин', 'ниацин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💊 ВИТАМИНЫ ГРУППЫ B ДЛЯ СПОРТСМЕНОВ:

B1 (тиамин) — 1.5-3 мг:
- Углеводный метаболизм (энергия из гликогена)
- Нервная проводимость
- Дефицит: усталость, слабость, нейропатия

B2 (рибофлавин) — 1.5-3 мг:
- Энергетический метаболизм (ФАД-коферменты)
- Антиоксидантная защита (глутатион-редуктаза)
- Потребность растёт при нагрузках

B3 (ниацин) — 15-20 мг:
- НАД+/НАДН — клеточная энергия
- Осторожно: высокие дозы вызывают flush (покраснение)

B6 (пиридоксин) — 2-10 мг:
- Синтез нейромедиаторов (серотонин, дофамин)
- Метаболизм аминокислот и гликогена
- Важен при высокобелковой диете

B9 (фолат) — 400-800 мкг:
- Синтез ДНК и деление клеток (мышечный рост)
- Форма: метилфолат (не фолиевая кислота)

B12 (кобаламин) — 500-1000 мкг:
- Кроветворение (транспорт кислорода)
- Нервная система
- Дефицит частый у веганов/вегетарианцев
- Форма: метилкобаламин

Для спортсменов: потребность в B-витаминах на 50-100% выше.
Принимать: утром, с едой, курсом 2-3 месяца.`;
}
export function getZincTestosterone(message: string): string {
  const keywords = ['цинк тестостерон', 'zinc testosterone', 'zma', 'цинк гормоны', 'цинк мужчин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚡ ЦИНК И ТЕСТОСТЕРОН:

Связь:
- Цинк — кофактор 300+ ферментов, включая ароматазу
- Дефицит цинка = снижение тестостерона на 50%+ (исследование 1996)
- Добавка НЕ повысит тестостерон выше нормы (только восполняет дефицит)
- Цинк ингибирует ароматазу (меньше конвертация в эстроген)

Кто в группе риска дефицита:
- Интенсивно тренирующиеся (потери с потом: 0.5-1 мг/л)
- Вегетарианцы/веганы (фитаты блокируют усвоение)
- Злоупотребляющие алкоголем
- Диеты с ограничением калорий

Дозировка:
- Профилактика: 15-25 мг/день
- При дефиците: 30-45 мг/день (курс 8-12 недель)
- Не более 40-50 мг/день (верхний предел)
- Лучшие формы: пиколинат, бисглицинат, цитрат

ZMA (Zinc-Magnesium-Aspartate):
- Цинк 30 мг + Магний 450 мг + B6 10.5 мг
- Приём: перед сном, натощак
- Может улучшить качество сна (магний)
- Исследования: противоречивые результаты

Важно:
- Не принимать с кальцием/железом (конкуренция)
- Принимать отдельно от молочных продуктов
- Длительный приём >50 мг вызывает дефицит меди`;
}
export function getCreatineHclVsMono(message: string): string {
  const keywords = ['hcl', 'гидрохлорид', 'моногидрат или', 'какой креатин', 'форма креатина', 'creatine hcl'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚗️ КРЕАТИН: HCL vs МОНОГИДРАТ:

Моногидрат (CMH):
✅ Золотой стандарт — 500+ исследований
✅ Самый дешёвый (₽300-500/месяц)
✅ Доказанная эффективность
✅ 5г/день — простая дозировка
❌ Может вызывать вздутие у некоторых
❌ Загрузочная фаза (необязательно, но ускоряет)

Гидрохлорид (HCL):
✅ Лучшая растворимость в воде (38× моногидрата)
✅ Меньше доза нужна (1-2г vs 5г)
✅ Меньше вздутие и задержка воды
❌ Мало исследований (в 100 раз меньше)
❌ Дороже в 3-5 раз
❌ Не доказано превосходство

Вердикт:
- Для 95% людей: МОНОГИДРАТ — лучший выбор
- Если ЖКТ не переносит моногидрат → пробуй HCL
- Бренд Creapure® — эталон качества моногидрата
- Микронизированный — лучше растворяется

Другие формы (не рекомендуются):
- Креатин этиловый эфир — деградирует в креатинин
- Kre-Alkalyn — нет преимуществ перед моногидратом
- Креатин малат — мало данных
- Креатин нитрат — маркетинг > наука`;
}
export function getMagnesiumTaurate(message: string): string {
  const keywords = ['таурат магния', 'magnesium taurate', 'магний таурат', 'магний для сердца'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💊 ТАУРАТ МАГНИЯ:

Что это:
Магний + таурин в одной молекуле.
Двойная польза: магний для мышц + таурин для сердца.

Преимущества формы:
- Высокая биодоступность (~15% выше цитрата)
- Кардиопротекторное действие (таурин)
- Не вызывает диарею (в отличие от оксида/цитрата)
- Хорошая переносимость ЖКТ
- Проникает через ГЭБ (нейропротекция)

Для спортсменов:
- Предотвращение судорог (магний + таурин = синергия)
- Поддержка сердечного ритма при нагрузках
- Улучшение качества сна и восстановления
- Снижение артериального давления
- Антиоксидантная защита миокарда

Сравнение форм магния:
- Таурат: сердце, сон, общее здоровье
- Глицинат: сон, тревожность, мышцы
- Цитрат: бюджетный вариант, может слабить
- Малат: энергия, мышечная усталость
- Треонат: когнитивные функции
- Оксид: самый дешёвый, худшее усвоение

Дозировка:
- 200-400 мг элементарного магния/день
- Приём: вечером, за 1-2 часа до сна
- Курс: постоянный (дефицит у 70% россиян)
- Сочетать с витамином B6 (улучшает усвоение)`;
}
export function getCollagenAdvancedGuide(message: string): string {
  const keywords = ['коллаген сустав', 'коллаген связк', 'гидролизат коллаген', 'collagen peptides', 'тип коллагена'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 КОЛЛАГЕН ДЛЯ СУСТАВОВ (ПРОДВИНУТЫЙ ГАЙД):

Типы коллагена:
- Тип I: кожа, сухожилия, связки, кости (90% в теле)
- Тип II: хрящи (суставные поверхности)
- Тип III: сосуды, внутренние органы
- Для суставов: тип II + тип I

Гидролизованный коллаген:
- Пептиды (разрушенные цепочки) — усвоение 90%+
- 10-15г/день — оптимальная доза
- За 30-60 мин до тренировки + витамин C (50мг)
- Витамин C критичен (кофактор синтеза коллагена)

UC-II (неденатурированный тип II):
- Работает через иммунную модуляцию (oral tolerance)
- Доза: всего 40 мг/день (не граммы!)
- Принимать натощак, на ночь
- Нельзя сочетать с гидролизатом (разные механизмы)

Что выбрать:
- Профилактика: гидролизат 10г + вит C
- Больные суставы: UC-II 40мг
- Серьёзные проблемы: оба, но в разное время

Исследования:
- Снижение боли в суставах на 43% за 24 нед (UC-II)
- Увеличение плотности сухожилий (гидролизат + нагрузка)
- Уменьшение времени восстановления после травм

Источники в пище: костный бульон, холодец, желатин.`;
}
export function getVitaminEAntioxidant(message: string): string {
  const keywords = ['витамин e', 'витамин е', 'токоферол', 'vitamin e', 'антиоксидант витамин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌾 ВИТАМИН E ДЛЯ СПОРТСМЕНОВ:

Формы:
- Альфа-токоферол: основная форма, самая изученная
- Гамма-токоферол: противовоспалительный
- Токотриенолы: более мощные антиоксиданты
- Смешанные токоферолы — лучший выбор

Для атлетов:
- Защита клеточных мембран от окислительного стресса
- Снижение DOMS (отсроченная мышечная болезненность)
- Защита эритроцитов от гемолиза (важно для кардио)
- Поддержка иммунитета при интенсивных нагрузках

Дозировка:
- Рекомендуемая: 15 мг (22 МЕ) / день
- Для спортсменов: 200-400 МЕ / день
- НЕ превышать 1000 МЕ (увеличивает смертность!)
- Принимать с жирной пищей (жирорастворимый)

Важные нюансы:
- Высокие дозы могут УХУДШИТЬ адаптацию к тренировкам
- Блокирует полезный оксидативный стресс (сигнал к адаптации)
- Не принимать перед/после тренировки
- Лучше из пищи: орехи, семечки, авокадо, оливковое масло

Взаимодействия:
- Усиливает эффект витамина C (рециклинг)
- Конкурирует с витамином K (осторожно при приёме антикоагулянтов)
- Селен усиливает антиоксидантный эффект`;
}
export function getElectrolytesEndurance(message: string): string {
  const keywords = ['электролиты длительн', 'электролиты марафон', 'натрий тренировка длительн', 'потери пота', 'гипонатриемия'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚡ ЭЛЕКТРОЛИТЫ ПРИ ДЛИТЕЛЬНЫХ ТРЕНИРОВКАХ:

Потери с потом (на литр):
- Натрий: 200-1500 мг (основная потеря!)
- Калий: 150-300 мг
- Магний: 1-5 мг
- Кальций: 10-40 мг
- Хлорид: 500-1500 мг

Когда критично:
- Тренировки >60 минут
- Жаркая погода / высокая влажность
- Обильное потоотделение (>1 л/час)
- Две тренировки в день

Признаки дефицита:
- Судороги (натрий, магний, калий)
- Головокружение (натрий)
- Слабость и утомляемость
- Тёмная моча
- Тошнота

Рецепт домашнего изотоника:
- 1 л воды
- 1/4 чайной ложки соли (500мг натрия)
- 2 ст.л. мёда или сахара (30г углеводов)
- Сок половины лимона (калий + вкус)
- Щепотка заменителя соли NoSalt (калий)

Коммерческие варианты:
- LMNT: 1000мг Na, 200мг K, 60мг Mg (без сахара)
- Regidron (аптечный): дёшево и эффективно
- SiS GO Electrolyte: с углеводами

ВАЖНО: Не пейте только воду при длительных нагрузках —
риск гипонатриемии (разведение натрия)!`;
}
export function getIronAthletes(message: string): string {
  const keywords = ['железо спортсмен', 'iron athlete', 'анемия спорт', 'ферритин', 'дефицит железа трен'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🩸 ЖЕЛЕЗО ДЛЯ СПОРТСМЕНОВ:

Почему дефицит частый:
- Потери с потом: 0.3-0.5 мг/день
- Гемолиз при беге (удары стопой)
- Разрушение эритроцитов при нагрузках
- Потери через ЖКТ при интенсивных тренировках
- Гепсидин повышается после тренировки (блокирует всасывание)

Симптомы дефицита:
- Быстрая утомляемость, снижение выносливости
- Одышка при умеренных нагрузках
- Бледность кожи и слизистых
- Ломкие ногти, выпадение волос
- Частые простуды

Анализы:
- Ферритин: оптимум 50-100 нг/мл (не просто >12!)
- Гемоглобин: >130 мужчины, >120 женщины
- Трансферрин, ОЖСС
- Сдавать утром натощак

Дозировка:
- Профилактика: 15-18 мг/день (из пищи)
- Дефицит: 30-60 мг через день (лучше усвоение!)
- Форма: бисглицинат > фумарат > сульфат
- С витамином C (50-100мг) — усвоение ×2-3

Когда принимать:
- Утром натощак или через 2ч после еды
- НЕ с кофе/чаем (танины -60% усвоения)
- НЕ с кальцием/цинком (конкуренция)
- Через день эффективнее ежедневного приёма

Группы риска: женщины, бегуны, вегетарианцы, подростки.`;
}
export function getBcaaVsEaaDetail(message: string): string {
  const keywords = ['bcaa или eaa', 'bcaa vs eaa', 'бцаа или еаа', 'аминокислоты какие', 'bcaa бесполезн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚗️ BCAA vs EAA — ДЕТАЛЬНОЕ СРАВНЕНИЕ:

BCAA (3 аминокислоты):
- Лейцин, изолейцин, валин
- Триггер mTOR (лейцин) — сигнал к синтезу белка
- НО: для синтеза нужны ВСЕ 9 незаменимых АК
- Без остальных 6 АК — строить белок не из чего
- По сути: сигнал без строительного материала

EAA (9 аминокислот):
- Все 9 незаменимых: лейцин, изолейцин, валин + гистидин,
  лизин, метионин, фенилаланин, треонин, триптофан
- Полный набор для синтеза мышечного белка
- Замена BCAA во всех сценариях

Вердикт:
❌ BCAA: устаревший продукт, переплата за 3 АК из 9
✅ EAA: если нужны свободные аминокислоты
✅ Сывороточный протеин: содержит ВСЕ АК + дешевле

Когда EAA оправданы:
- Тренировка натощак (быстрое усвоение)
- Невозможность есть перед тренировкой
- Между приёмами пищи (>4-5ч)
- Интра-тренировочное питание

Когда НЕ нужны ни BCAA, ни EAA:
- Если едите белок каждые 3-4 часа
- Если пьёте протеин до/после тренировки
- При достаточном суточном белке (1.6-2.2г/кг)

Дозировка EAA: 10-15г за 15 мин до или во время тренировки.`;
}
export function getCaseinBeforeBed(message: string): string {
  const keywords = ['казеин', 'casein', 'белок перед сном', 'медленный протеин', 'казеиновый протеин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌙 КАЗЕИН ПЕРЕД СНОМ:

Что это:
Медленно усваивающийся белок из молока (80% молочного белка).
Образует гель в желудке → постепенное высвобождение АК 6-8 часов.

Зачем перед сном:
- Ночь = 7-9 часов без еды (катаболическое окно)
- Казеин поддерживает аминокислотный пул всю ночь
- Исследование 2012 (Maastricht): +22% синтез белка ночью
- Увеличение мышечной массы +1.2 кг за 12 недель (vs плацебо)

Сколько:
- 30-40г казеина за 30-60 мин до сна
- Мицеллярный казеин — лучшая форма
- Казеинат кальция/натрия — быстрее (менее оптимально)

Лучшие источники:
- Творог (18-20г казеина на 200г) — бюджетный вариант!
- Греческий йогурт (10-15г на 200г)
- Казеиновый порошок (удобнее)

Рецепт «ночной пудинг»:
- 30г мицеллярного казеина
- 100 мл молока
- Перемешать густо → холодильник 10 мин
- Текстура как пудинг, насыщает

Кому не подходит:
- Непереносимость лактозы (казеин содержит мало, но есть)
- Аллергия на молочный белок
- Проблемы с ЖКТ ночью

Альтернатива: 200г творога 5% + горсть орехов.`;
}
export function getCarnosineSupplement(message: string): string {
  const keywords = ['карнозин', 'carnosine', 'бета-аланин карнозин', 'буфер молочной', 'карнозин мышц'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧪 КАРНОЗИН (НЕ ПУТАТЬ С КАРНИТИНОМ):

Что это:
Дипептид (бета-аланин + гистидин), содержится в мышцах.
Основной буфер кислотности в мышечной ткани.

Механизм:
- Буферизация H+ ионов (снижает закисление мышц)
- Антиоксидант (защита от гликирования)
- Хелатор металлов (медь, цинк)
- Антигликатор (против AGE-продуктов — старение)

Почему бета-аланин, а не карнозин напрямую:
- Карнозин разрушается в ЖКТ (фермент карнозиназа)
- Бета-аланин = лимитирующий фактор синтеза карнозина
- Приём бета-аланина повышает карнозин в мышцах на 40-80%

Для спортсменов:
- Отсрочка утомления при высокоинтенсивных нагрузках
- Больше повторений до отказа (+2-3 повтора)
- Лучше для упражнений 60-240 сек (среднее время)
- Менее эффективен для чисто силовых (1-5 сек)

Дозировка (через бета-аланин):
- 3.2-6.4 г/день бета-аланина
- Разделить на 4 приёма по 0.8-1.6г (снижение парестезии)
- Загрузка: 4-6 недель для максимального эффекта
- Парестезия (покалывание кожи) — безвредна

Карнозин напрямую:
- 500-1000 мг/день (для антиоксидантных целей)
- Дороже бета-аланина, менее изучен для спорта
- Лучше для anti-aging, чем для производительности`;
}
export function getVitaminAAthletes(message: string): string {
  const keywords = ['витамин a', 'витамин а', 'ретинол', 'vitamin a', 'бета-каротин спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥕 ВИТАМИН A ДЛЯ АТЛЕТОВ:

Формы:
- Ретинол (животный): активная форма, сразу используется
- Бета-каротин (растительный): конвертируется в ретинол (6:1)
- Ретиниловые эфиры: форма хранения в печени

Для спортсменов:
- Иммунная функция (барьерный иммунитет, NK-клетки)
- Синтез тестостерона (участвует в стероидогенезе)
- Зрение (особенно ночное — важно для вечерних тренировок)
- Антиоксидантная защита (бета-каротин)
- Рост и дифференцировка клеток (мышечная регенерация)

Потребность:
- Мужчины: 900 мкг RAE/день
- Женщины: 700 мкг RAE/день
- Верхний предел: 3000 мкг/день (токсичность!)

Источники:
- Печень (говяжья): 9000+ мкг/100г (осторожно!)
- Морковь: 835 мкг/100г (бета-каротин)
- Батат: 709 мкг/100г
- Шпинат: 469 мкг/100г
- Яйца: 160 мкг/штука

ВАЖНО — токсичность:
- Витамин A жирорастворим → накапливается!
- Гипервитаминоз: тошнота, головная боль, повреждение печени
- НЕ принимать добавки без показаний
- Бета-каротин безопаснее (конверсия регулируется)
- Курильщикам: высокие дозы бета-каротина увеличивают риск рака лёгких`;
}
export function getProbioticsAthletesAdv(message: string): string {
  const keywords = ['пробиотики спортсмен', 'probiotics athlete', 'кишечник спорт', 'микробиом тренировк', 'лактобактерии спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦠 ПРОБИОТИКИ ДЛЯ СПОРТСМЕНОВ:

Зачем:
- Интенсивные тренировки = стресс для кишечника
- 70% иммунной системы — в кишечнике
- Усвоение нутриентов зависит от микробиома
- Марафонцы: 2-6× больше заболеваний верхних дыхательных путей

Штаммы для атлетов:
- Lactobacillus rhamnosus GG: иммунитет, снижение ОРВИ
- Lactobacillus acidophilus: усвоение белка, ЖКТ здоровье
- Bifidobacterium lactis: иммуномодуляция
- Lactobacillus plantarum: противовоспалительное, барьерная функция
- Saccharomyces boulardii: защита при антибиотиках

Исследования для спортсменов:
- Снижение частоты ОРВИ на 50% (мета-анализ 2015)
- Снижение длительности ЖКТ симптомов при марафоне
- Улучшение усвоения белка (+20%)
- Снижение системного воспаления

Дозировка:
- 10-50 млрд CFU/день (КОЕ)
- Многоштаммовые формулы (5-10 штаммов)
- Курс: 4-12 недель для заселения
- Хранение: холодильник (живые культуры)

Пребиотики (пища для пробиотиков):
- Инулин: цикорий, чеснок, лук
- ФОС: бананы, артишоки
- Резистентный крахмал: холодный картофель, зелёные бананы

Лучше из пищи: кефир, квашеная капуста, йогурт, кимчи.`;
}
export function getWheyProteinComplete(message: string): string {
  const keywords = ['сывороточный протеин полн', 'whey protein complete', 'сывороточный протеин гайд', 'whey концентрат изолят', 'какой протеин выбрать'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥛 СЫВОРОТОЧНЫЙ ПРОТЕИН — ПОЛНЫЙ ГАЙД:

Формы:
КОНЦЕНТРАТ (WPC):
- 70-80% белка
- Содержит лактозу и жиры
- Дешевле, вкуснее
- Подходит большинству
- ₽1500-2500/кг

ИЗОЛЯТ (WPI):
- 90%+ белка
- Минимум лактозы (<1%)
- Для непереносимости лактозы
- Быстрее усваивается
- ₽2500-4000/кг

ГИДРОЛИЗАТ (WPH):
- Предварительно расщеплён (пептиды)
- Максимально быстрое усвоение
- Горький вкус
- Самый дорогой
- ₽4000-7000/кг

Дозировка:
- 1 порция: 25-40г белка (1-2 скупа)
- Суточная: 1-3 порции (зависит от рациона)
- Цель: 1.6-2.2 г белка/кг из ВСЕХ источников
- Протеин — добавка к еде, НЕ замена

Когда принимать:
- После тренировки: в течение 2 часов (не обязательно 30 мин!)
- Утром: быстрый белок после голодания
- Между приёмами: если разрыв >4 часов
- Перед сном: лучше казеин, но сыворотка тоже работает

Выбор:
- Бюджет: концентрат от проверенного бренда
- Непереносимость лактозы: изолят
- Максимальная скорость: гидролизат (не стоит переплаты)
- Проверяйте: аминокислотный профиль, отсутствие аминосыпки

Красные флаги: слишком дешёвый, нет аминокислотного профиля на этикетке.`;
}
export function getCopperZincBalance(message: string): string {
  const keywords = ['медь', 'цинк баланс', 'copper', 'медь цинк', 'соотношение минералов'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚖️ БАЛАНС МЕДИ И ЦИНКА У СПОРТСМЕНОВ:

Почему это важно:
- Медь и цинк конкурируют за всасывание в кишечнике
- Избыток цинка (>50 мг/день) может вызвать дефицит меди
- Оптимальное соотношение Cu:Zn = 1:8 — 1:15

Функции меди:
- Синтез коллагена (связки, сухожилия)
- Транспорт железа (профилактика анемии)
- Антиоксидантная защита (фермент SOD)
- Энергетический метаболизм (цитохром-с-оксидаза)
- Норма: 0.9-1.3 мг/день

Функции цинка:
- Синтез тестостерона и гормона роста
- Иммунитет (>300 ферментов)
- Заживление ран и восстановление тканей
- Белковый синтез
- Норма спортсменам: 15-30 мг/день

Признаки дисбаланса:
- Избыток цинка: тошнота, низкая медь, анемия
- Дефицит меди: усталость, частые травмы связок, анемия
- Дефицит цинка: плохой иммунитет, медленное восстановление

Практические советы:
- Принимайте цинк и медь в разное время суток
- Если пьёте ZMA (цинк 30мг) — добавьте 1-2 мг меди утром
- Источники меди: печень, орехи, какао, морепродукты
- Анализ крови: церулоплазмин + сывороточная медь + цинк`;
}
export function getVitaminKAthletes(message: string): string {
  const keywords = ['витамин к', 'витамин k', 'vitamin k', 'менахинон', 'филлохинон', 'к2 мк7'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💚 ВИТАМИН K ДЛЯ СПОРТСМЕНОВ:

Две формы:
- K1 (филлохинон): свёртывание крови, из зелёных овощей
- K2 (менахинон): направляет кальций в кости (не в сосуды)
  • MK-4: короткое действие, из животных продуктов
  • MK-7: длительное действие, из ферментированных продуктов (лучший выбор)

Зачем спортсмену:
- Здоровье костей: K2 активирует остеокальцин (белок костной ткани)
- Защита сосудов: предотвращает кальцификацию артерий
- Синергия с витамином D: D повышает усвоение кальция, K2 направляет его в кости
- Профилактика переломов при высоких нагрузках

Дозировка:
- K2 MK-7: 100-200 мкг/день
- K1: 90-120 мкг/день (обычно из пищи достаточно)
- При приёме витамина D: K2 ОБЯЗАТЕЛЕН
- Принимать с жирной пищей (жирорастворимый)

Источники:
- K1: шпинат, капуста, брокколи, петрушка
- K2 MK-7: натто (рекордсмен), твёрдые сыры, квашеная капуста
- K2 MK-4: печень, яичные желтки, сливочное масло

Стек для костей: витамин D3 + K2 MK-7 + магний + кальций (из пищи).
Осторожно: при приёме антикоагулянтов (варфарин) — консультация врача!`;
}
export function getOmega369Balance(message: string): string {
  const keywords = ['омега 3 6 9', 'omega 3 6 9', 'баланс жирных кислот', 'омега соотношение', 'ненасыщенные жиры баланс'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚖️ БАЛАНС ОМЕГА 3-6-9 ДЛЯ СПОРТСМЕНОВ:

Омега-3 (противовоспалительные):
- EPA: снижение воспаления, здоровье сердца
- DHA: мозг, нервная система, зрение
- Источники: жирная рыба, льняное масло, чиа
- Норма спортсменам: 2-4 г EPA+DHA/день

Омега-6 (провоспалительные в избытке):
- Арахидоновая кислота: воспалительные процессы
- Линолевая кислота: базовая потребность
- Источники: подсолнечное масло, орехи, мясо
- Проблема: в типичном рационе избыток в 15-20 раз

Омега-9 (нейтральные):
- Олеиновая кислота: здоровье сосудов
- Организм синтезирует сам — добавки НЕ нужны
- Источники: оливковое масло, авокадо, миндаль

Идеальное соотношение:
- Омега-6 : Омега-3 = 2:1 — 4:1 (оптимум)
- Реальность: 15:1 — 20:1 (типичная российская диета)
- Следствие: хроническое воспаление, медленное восстановление

Как исправить:
1. Увеличить омега-3: рыба 2-3 раза/неделю + добавки
2. Снизить омега-6: заменить подсолнечное масло на оливковое
3. Избегать: маргарин, фастфуд, промышленная выпечка
4. Добавки омега-9 НЕ нужны — достаточно из пищи

Добавки «Омега 3-6-9» — маркетинг. Нужны только Омега-3!`;
}
export function getFishOilQuality(message: string): string {
  const keywords = ['рыбий жир качество', 'выбор рыбьего жира', 'fish oil quality', 'омега 3 как выбрать', 'рыбий жир какой'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🐟 КАК ВЫБРАТЬ КАЧЕСТВЕННЫЙ РЫБИЙ ЖИР:

5 критериев качества:

1. ФОРМА:
- Триглицеридная (rTG) — лучшая: усвоение на 70% выше
- Этиловые эфиры (EE) — дешевле, усвоение хуже
- На этикетке: «triglyceride form» или «rTG»

2. КОНЦЕНТРАЦИЯ EPA+DHA:
- Минимум 60% (600мг EPA+DHA на 1000мг рыбьего жира)
- Идеал: 75-90% (меньше капсул для нужной дозы)
- Дешёвые: 30% (нужно в 2-3 раза больше капсул)

3. ЧИСТОТА:
- Сертификация IFOS (International Fish Oil Standards) — золотой стандарт
- Молекулярная дистилляция (очистка от ртути, диоксинов, ПХБ)
- Тесты на окисление: TOTOX <26

4. СВЕЖЕСТЬ:
- Показатель окисления (перекисное число): <5 мЭкв/кг
- Запах: свежий рыбий жир НЕ пахнет тухлой рыбой
- Срок годности: 2 года максимум
- Хранение: в холодильнике после вскрытия

5. ИСТОЧНИК:
- Мелкая рыба: анчоусы, сардины (меньше тяжёлых металлов)
- Дикий лосось: хороший, но дороже
- Избегать: печень трески (избыток витамина A)

Дозировка спортсменам: 2-4 г EPA+DHA в день.
Красные флаги: нет EPA/DHA на этикетке, запах тухлости, мутность капсул.`;
}
export function getVitaminB12Athletes(message: string): string {
  const keywords = ['витамин б12', 'витамин b12', 'кобаламин', 'b12 спорт', 'цианокобаламин', 'метилкобаламин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔴 ВИТАМИН B12 ДЛЯ СПОРТСМЕНОВ:

Функции:
- Образование эритроцитов (транспорт кислорода!)
- Синтез ДНК (восстановление и рост мышц)
- Здоровье нервной системы (миелиновая оболочка)
- Метилирование (детоксикация, энергетический метаболизм)
- Синтез нейротрансмиттеров

Для спортсменов критично:
- Низкий B12 = анемия = падение выносливости
- Нервная система: координация, скорость реакции
- Энергетический метаболизм: конвертация макронутриентов в энергию

Формы:
- Метилкобаламин: активная форма, лучший выбор
- Аденозилкобаламин: участвует в цикле Кребса
- Гидроксикобаламин: инъекционная форма, длительное действие
- Цианокобаламин: синтетическая, дешёвая, нужна конвертация

Дозировка:
- РНП: 2.4 мкг/день (очень мало)
- Спортсменам: 500-1000 мкг метилкобаламина
- Веганам: 1000-2000 мкг/день (ОБЯЗАТЕЛЬНО)
- Сублингвально — лучшее усвоение

Группы риска дефицита:
- Веганы и вегетарианцы (B12 только в животных продуктах)
- Люди старше 50 (снижение внутреннего фактора)
- При заболеваниях ЖКТ (нарушение всасывания)
- При приёме метформина

Источники: печень, мясо, рыба, яйца, молочные. Растительных источников B12 НЕ существует.`;
}
export function getVitaminCCompleteGuide(message: string): string {
  const keywords = ['витамин с', 'витамин c', 'аскорбиновая', 'vitamin c спорт', 'аскорбинка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍊 ВИТАМИН C ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Функции:
- Антиоксидантная защита от окислительного стресса
- Синтез коллагена (связки, сухожилия, хрящи, кожа)
- Иммунитет (активация NK-клеток, нейтрофилов)
- Усвоение железа (важно при анемии)
- Синтез карнитина (утилизация жиров)
- Производство адреналина и норадреналина

ВНИМАНИЕ:
- Высокие дозы (>1000мг) могут БЛОКИРОВАТЬ тренировочные адаптации!
- Paulsen (2014): витамин C + E снизили прирост силы
- Механизм: ROS (свободные радикалы) — СИГНАЛ для адаптации
- Убирая все ROS, вы убираете сигнал к суперкомпенсации

Оптимальная стратегия:
- 200-500 мг/день (базовая поддержка)
- НЕ принимать за 2 часа до/после тренировки
- При простуде: повысить до 1000-2000 мг на 5-7 дней
- Лучше из пищи (синергия с биофлавоноидами)

Формы:
- Аскорбиновая кислота: дёшево, может раздражать желудок
- Аскорбат натрия/кальция: буферизованная, мягче для ЖКТ
- Липосомальный витамин C: лучшее усвоение
- Эстер-C: долгое действие

Источники: шиповник (1250мг/100г!), чёрная смородина (200мг), перец болгарский (128мг), киви (93мг).`;
}
export function getMagnesiumTypesGuide(message: string): string {
  const relevant = /магний.+форм|магний.+какой|вид.+магни|тип.+магни|magnesium.+type|цитрат.+глицинат|магний.+лучш/i.test(message);
  if (!relevant) return '';
  return `
💊 ФОРМЫ МАГНИЯ — КАКОЙ ВЫБРАТЬ СПОРТСМЕНУ:

1. Магния глицинат (бисглицинат):
   - Биодоступность: ★★★★★ (самая высокая)
   - Для чего: сон, восстановление, мышечные спазмы
   - Доза: 200-400 мг элементарного Mg перед сном
   - Побочки: минимальные, не вызывает диарею
   - ЛУЧШИЙ ВЫБОР для спортсменов

2. Магния цитрат:
   - Биодоступность: ★★★★☆
   - Для чего: восполнение дефицита, лёгкий слабительный эффект
   - Доза: 200-400 мг
   - Побочки: может вызвать диарею при высоких дозах
   - Хорош если нужно + нормализовать ЖКТ

3. Магния таурат:
   - Биодоступность: ★★★★☆
   - Для чего: сердечно-сосудистая система, давление
   - Доза: 200-400 мг
   - Бонус: таурин дополнительно поддерживает сердце

4. Магния малат:
   - Биодоступность: ★★★★☆
   - Для чего: энергия, мышечная усталость (через цикл Кребса)
   - Доза: 200-400 мг утром
   - Лучше утром/днём — может бодрить

5. Магния L-треонат:
   - Биодоступность для мозга: ★★★★★
   - Для чего: когнитивные функции, focus
   - Доза: 1-2 г (144 мг элементарного Mg)
   - Дорогой, но проникает через ГЭБ

6. Магния оксид:
   - Биодоступность: ★★☆☆☆ (НИЗКАЯ)
   - Для чего: только как слабительное
   - НЕ РЕКОМЕНДУЕТСЯ для восполнения дефицита

Признаки дефицита магния у спортсменов:
- Ночные судороги, подёргивания мышц
- Бессонница, тревожность
- Повышенный пульс покоя
- Снижение силовых показателей
- Головные боли после тренировки

Оптимальная стратегия:
- Глицинат 200 мг вечером + малат 200 мг утром
- Потери с потом: ~15 мг/литр — восполнять при длительных тренировках
- Продукты-чемпионы: тыквенные семечки (550 мг/100г), какао, гречка, миндаль`;
}
export function getElectrolyteProtocol(message: string): string {
  const relevant = /электролит.+протокол|электролит.+тренировк|натрий.+калий.+баланс|соль.+до.+тренировк|потерi.+пот|electrolyte.+protocol/i.test(message);
  if (!relevant) return '';
  return `
⚡ ЭЛЕКТРОЛИТНЫЙ ПРОТОКОЛ ДЛЯ ТРЕНИРОВОК:

Потери электролитов с потом (на литр):
- Натрий: 400-1800 мг (в среднем 900 мг)
- Калий: 120-280 мг
- Магний: 10-20 мг
- Кальций: 15-40 мг
- Хлорид: 600-1400 мг
- Средний объём пота: 0.5-2.5 л/час (зависит от интенсивности и температуры)

Протокол ДО тренировки (за 30-60 мин):
- 500 мл воды + 500-700 мг натрия (1/4 ч.л. соли)
- Это «предзагрузка» — увеличивает объём плазмы
- Улучшает терморегуляцию и выносливость
- Особенно важно в жару или при длительных тренировках

Протокол ВО ВРЕМЯ тренировки:
- До 60 мин: обычная вода достаточно
- 60-90 мин: вода + щепотка соли или электролитный напиток
- 90+ мин: обязательно электролиты + углеводы (30-60 г/час)
- Формула напитка: 500 мл воды + 500 мг натрия + 30 г углеводов

Протокол ПОСЛЕ тренировки:
- Восполнить 150% потерянной жидкости (взвесьтесь до и после)
- Каждый потерянный кг = 1.5 л воды + электролиты
- Натрий помогает удержать воду (без него вода «проходит транзитом»)

Признаки дисбаланса:
- Гипонатриемия (мало натрия): головная боль, тошнота, спутанность
- Гипокалиемия (мало калия): слабость, аритмия, судороги
- Дефицит магния: спазмы, подёргивания, бессонница

Простые решения:
- Домашний электролитный напиток: 1 л воды + 1/4 ч.л. соли + сок лимона + мёд
- Кокосовая вода: натуральный источник калия (~250 мг/стакан)
- Солёные продукты после тренировки: огурцы, оливки, сыр`;
}
export function getProbioticsComplete(message: string): string {
  const relevant = /пробиотик.+полн|пробиотик.+спорт|кишечник.+спортсмен|probiotics?.+athlet|штамм.+пробиот|микробиом.+тренировк/i.test(message);
  if (!relevant) return '';
  return `
🦠 ПРОБИОТИКИ ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Зачем спортсмену пробиотики:
- Интенсивные тренировки повреждают слизистую кишечника (↑ проницаемость)
- 70% иммунной системы — в кишечнике
- Нарушение микробиома → воспаление → замедление восстановления
- У 30-50% спортсменов на выносливость — ЖКТ-проблемы на тренировках

Изученные штаммы для спорта:
1. Lactobacillus rhamnosus GG — снижение ОРВИ на 33%
2. Lactobacillus acidophilus — улучшение усвоения белка
3. Bifidobacterium lactis — укрепление барьерной функции кишечника
4. Lactobacillus plantarum — снижение вздутия и газообразования
5. Bacillus coagulans — стабилен без холодильника, снижение мышечной боли

Мета-анализ (2019, 12 исследований):
- Снижение частоты ОРВИ: -47% у спортсменов
- Сокращение длительности болезни: на 2 дня
- Улучшение усвоения белка: +5-15%
- Снижение маркеров воспаления (CRP): -15-25%

Дозировка:
- Минимум: 10 млрд КОЕ/день (10 billion CFU)
- Оптимум: 20-50 млрд КОЕ/день
- Мультиштаммовые формулы эффективнее моноштаммов
- Курс: минимум 4-8 недель для стабильного эффекта

Когда принимать:
- Утром натощак ИЛИ перед сном (минимум кислоты в желудке)
- НЕ с горячей едой/напитками (убивает бактерии)
- Вместе с пребиотиками (клетчатка — «еда» для бактерий)

Продукты-пробиотики:
- Кефир (самый доступный в России, ~10 млрд КОЕ/стакан)
- Квашеная капуста (без уксуса — только молочнокислое брожение)
- Натуральный йогурт без сахара
- Комбуча (чайный гриб)

Ошибки:
- Принимать антибиотик + пробиотик одновременно (разнести на 2-3 часа)
- Ожидать мгновенный эффект (нужно 2-4 недели)
- Хранить при комнатной температуре (кроме Bacillus coagulans)`;
}
export function getZincCompleteAthletes(message: string): string {
  const relevant = /цинк.+полн|цинк.+спортсмен.+гайд|zinc.+complete|цинк.+форм.+какой|цинк.+дозировк.+подробн/i.test(message);
  if (!relevant) return '';
  return `
💊 ЦИНК ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Роль цинка в организме спортсмена:
- Участвует в синтезе тестостерона (ключевой минерал)
- Кофактор 300+ ферментов (включая синтез белка)
- Поддержка иммунитета (снижение ОРВИ на 33%)
- Антиоксидантная защита (через SOD)
- Заживление ран и восстановление тканей

Потери цинка при тренировках:
- С потом: 0.5-1 мг/литр пота
- Повышенный расход при стрессе и воспалении
- У 30-40% спортсменов — субклинический дефицит
- Вегетарианцы теряют на 50% больше (фитаты блокируют усвоение)

Формы цинка (от лучшей к худшей):
1. Цинк пиколинат — биодоступность ~70% ★★★★★
2. Цинк бисглицинат — ~65%, мягкий для ЖКТ ★★★★★
3. Цинк цитрат — ~60% ★★★★☆
4. Цинк глюконат — ~55% ★★★☆☆
5. Цинк оксид — ~25% (самый дешёвый, самый бесполезный) ★★☆☆☆

Дозировка:
- Профилактика: 15-25 мг/день элементарного цинка
- При дефиците: 30-50 мг/день (курс 4-8 недель)
- Максимум: 40 мг/день (длительно), 50 мг (курсом)
- Принимать с едой (снижает тошноту)

Важные взаимодействия:
⚠️ Цинк конкурирует с медью — при приёме >25 мг/день добавьте медь (1-2 мг)
⚠️ Кальций и железо снижают усвоение — разнести приём на 2 часа
⚠️ Фитаты (злаки, бобовые) блокируют цинк — замачивание снижает фитаты
✅ Витамин B6 улучшает усвоение цинка
✅ Белковая пища улучшает абсорбцию

Признаки дефицита:
- Снижение либидо и тестостерона
- Частые простуды
- Медленное заживление ран
- Выпадение волос
- Снижение аппетита, нарушение вкуса

Продукты-чемпионы (мг/100г):
- Устрицы: 78 мг (абсолютный рекордсмен)
- Говяжья печень: 12 мг
- Тыквенные семечки: 7.5 мг
- Говядина: 6 мг
- Кедровые орехи: 6.5 мг`;
}
export function getCollagenPeptidesAdvanced(message: string): string {
  const relevant = /коллаген.+пептид|коллаген.+продвинут|collagen.+peptide|коллаген.+суставы.+подробн|коллаген.+тип.+какой/i.test(message);
  if (!relevant) return '';
  return `
🧬 КОЛЛАГЕНОВЫЕ ПЕПТИДЫ — ПРОДВИНУТЫЙ ГАЙД:

Типы коллагена и их функции:
- Тип I (90% в организме): кожа, сухожилия, связки, кости
- Тип II: хрящевая ткань (суставы)
- Тип III: сосуды, органы, мышцы (часто вместе с типом I)
- Тип V: плацента, клеточная поверхность

Что покупать спортсмену:
- Для суставов: коллаген II типа (UC-II, неденатурированный)
- Для сухожилий/связок: гидролизованный коллаген I+III типа
- Для всего: комбинированные формулы

Доказательная база (мета-анализы):
- Боль в суставах: снижение на 24% за 24 недели (10 г/день)
- Здоровье сухожилий: ↑ синтез коллагена I типа на 65% (с витамином C)
- Мышечная масса: +1.5 кг за 12 недель (vs плацебо, 15 г/день + тренировки)
- Травмы: ускорение заживления связок на 20-30%

Оптимальный протокол для спортсменов:
1. Гидролизованный коллаген: 10-15 г/день
2. + Витамин C: 50-100 мг (ОБЯЗАТЕЛЬНО — кофактор синтеза)
3. Принимать за 30-60 мин до тренировки (исследование Keith Baar)
4. Это повышает синтез коллагена в нагружаемых тканях

UC-II (неденатурированный коллаген II типа):
- Доза: 40 мг/день (НЕ граммы — он работает иначе)
- Механизм: иммуномодуляция, а не «строительный материал»
- Эффективнее глюкозамина + хондроитина (исследование Lugo, 2016)
- Принимать натощак перед сном

Источники из еды:
- Костный бульон (варить 12-24 часа): 10+ г коллагена на порцию
- Куриная кожа, хрящи
- Холодец (студень) — русский суперфуд для суставов
- Рыбий коллаген (из кожи рыб) — лучшая биодоступность`;
}
export function getIronMineralAthletes(message: string): string {
  const relevant = /железо.+спорт.+подробн|анемия.+спортсмен|iron.+athlete|дефицит.+желез.+трениров|ферритин.+спорт|железо.+добавк/i.test(message);
  if (!relevant) return '';
  return `
🩸 ЖЕЛЕЗО ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Почему спортсмены в группе риска:
- Потери с потом: 0.3-0.5 мг/литр
- «Foot-strike hemolysis»: разрушение эритроцитов при беге (удары стоп)
- Повышенный расход при воспалении от тренировок
- Разведение при увеличении объёма плазмы (ложная анемия)
- До 50% бегуний и 15-30% силовых спортсменов — дефицит

Оптимальные показатели для спортсменов:
- Ферритин: 30-100 нг/мл (ниже 30 = функциональный дефицит)
- Гемоглобин: муж 14-17 г/дл, жен 12-15 г/дл
- Трансферрин: 20-45%
- ВАЖНО: ферритин — маркер воспаления, может быть ложно повышен

Симптомы дефицита:
- Необъяснимая усталость на тренировках
- Снижение выносливости и силы
- Одышка при привычных нагрузках
- Бледность кожи и слизистых
- Холодные руки и ноги
- Ломкие ногти, выпадение волос

Формы добавок:
1. Бисглицинат железа — ЛУЧШИЙ (высокая усвояемость, минимум побочек)
2. Хелат железа — хорошо усваивается
3. Фумарат — средне
4. Сульфат — дёшево, но тошнота и запоры

Правила приёма:
- Натощак для максимального усвоения (или с витамином C)
- НЕ принимать с: чаем, кофе, молочкой, кальцием, цинком
- Витамин C (100 мг) повышает усвоение на 67%
- Лучше через день (исследование Moretti 2015 — усвоение выше чем ежедневно)

Продукты-лидеры:
- Говяжья печень: 7 мг/100г (гемовое железо — усваивается в 5 раз лучше)
- Говядина: 3.5 мг/100г
- Гречка: 8 мг/100г (негемовое, усваивается хуже)
- Шпинат: 3.5 мг/100г (но оксалаты мешают)`;
}
export function getAdaptogensStackGuide(message: string): string {
  const relevant = /адаптоген.+стек|адаптоген.+комбинац|adaptogen.+stack|какие.+адаптоген|адаптоген.+вместе|набор.+адаптоген/i.test(message);
  if (!relevant) return '';
  return `
🌿 СТЕК АДАПТОГЕНОВ ДЛЯ СПОРТСМЕНОВ:

Что такое адаптогены:
- Растительные соединения, повышающие устойчивость к стрессу
- Работают через ось HPA (гипоталамус-гипофиз-надпочечники)
- Модулируют кортизол: снижают при высоком, поддерживают при низком
- Эффект накапливается за 2-4 недели

Топ-5 адаптогенов для спорта:

1. Ашваганда (KSM-66, 600 мг/день):
   - Кортизол ↓28%, тестостерон ↑15%, сила ↑, VO2max ↑
   - Лучший для: силовых атлетов, восстановления, сна
   - Приём: утро + вечер

2. Родиола розовая (Rhodiola rosea, 200-400 мг):
   - Выносливость ↑, время до утомления ↑, RPE ↓
   - Лучший для: кардио, высокоинтенсивных тренировок
   - Приём: утром натощак, НЕ вечером (бодрит)

3. Элеутерококк (Eleutherococcus, 300-400 мг):
   - «Сибирский женьшень», популярен в российском спорте
   - Выносливость ↑, иммунитет ↑, когнитивные функции ↑
   - Приём: утром, курс 6-8 недель

4. Лимонник китайский (Schisandra, 500-1000 мг):
   - Антиоксидант, защита печени, фокус и концентрация
   - Традиционно использовался советскими спортсменами
   - Приём: утром или перед тренировкой

5. Кордицепс (Cordyceps militaris, 1-3 г):
   - VO2max ↑7%, утилизация кислорода ↑
   - Анти-усталость, поддержка ATP-синтеза
   - Приём: до тренировки за 30-60 мин

Готовые стеки:
🔴 Для силы и массы: Ашваганда + Элеутерококк
🔵 Для выносливости: Родиола + Кордицепс
🟢 Для восстановления: Ашваганда + Лимонник
🟡 Универсальный: Ашваганда + Родиола + Элеутерококк

Правила комбинирования:
- Не более 2-3 адаптогенов одновременно
- Циклировать: 8 недель приём → 2-4 недели перерыв
- Начинать с одного, добавлять по одному каждые 2 недели
- Утренние (бодрящие): Родиола, Элеутерококк, Кордицепс
- Вечерние (успокаивающие): Ашваганда, Рейши`;
}
export function getVitaminD3K2Synergy(message: string): string {
  const relevant = /витамин.?D.+K2|D3.+K2|кальций.+витамин.+D.+K|витамин.?Д.+К2|d3.+k2.+синерг/i.test(message);
  if (!relevant) return '';
  return `
☀️ ВИТАМИН D3 + K2 — СИНЕРГИЯ ДЛЯ СПОРТСМЕНОВ:

Почему D3 и K2 принимают ВМЕСТЕ:
- D3 повышает усвоение кальция из кишечника
- K2 направляет кальций в КОСТИ, а не в сосуды/почки
- Без K2 высокие дозы D3 → кальцификация артерий и камни в почках
- Это не маркетинг — мета-анализ 2017 подтверждает синергию

Витамин D3 для спортсменов:
- 80% россиян имеют дефицит D (широта + мало солнца зимой)
- Оптимальный уровень: 40-60 нг/мл (25(OH)D в крови)
- Дозировка: 2000-5000 МЕ/день (зависит от текущего уровня)
- Зимой (октябрь-апрель): обязательно, солнца недостаточно
- Летом: можно снизить если загораете 20+ мин/день

Эффекты D3 на тренировки:
- Тестостерон: +25% при нормализации уровня (из дефицита)
- Сила: +18.75% улучшение в жиме лёжа (12 недель, исследование)
- Иммунитет: -42% респираторных инфекций
- Восстановление мышц: ускорение на 15-20%
- Настроение: снижение тревожности и депрессии

Витамин K2 (менахинон):
- Форма MK-7: длительное действие (период полувыведения 72 часа)
- Форма MK-4: короткое действие, но выше концентрации в тканях
- Доза MK-7: 100-200 мкг/день
- Источники: натто (японские бобы), твёрдый сыр, желтки

Оптимальный протокол:
- D3 2000-5000 МЕ + K2 (MK-7) 100-200 мкг
- Принимать с жирной пищей (жирорастворимые витамины!)
- Утром или в обед (D3 может мешать мелатонину вечером)
- Анализ 25(OH)D каждые 6 месяцев
- Кофакторы: магний (нужен для активации D3) + цинк`;
}
export function getCreatineHCLvsMono(message: string): string {
  const relevant = /креатин.+HCL.+моногидрат|креатин.+гидрохлорид|creatine.+hcl.+mono|какой.+креатин.+лучш|креатин.+формы.+сравнен/i.test(message);
  if (!relevant) return '';
  return `
⚗️ КРЕАТИН: HCL vs МОНОГИДРАТ — ПОЛНОЕ СРАВНЕНИЕ:

Креатин моногидрат:
- Самая изученная форма (500+ исследований)
- Биодоступность: ~99% при приёме с углеводами
- Доза: 3-5 г/день (или загрузка 20 г/день × 5-7 дней)
- Цена: самый дешёвый (~300-500₽ за 300г)
- Побочки: задержка воды (1-3 кг), у некоторых вздутие
- Эффективность: +++++ (золотой стандарт)

Креатин HCL (гидрохлорид):
- Заявлена в 41 раз лучшая растворимость
- Доза: 1.5-3 г/день (якобы нужно меньше)
- Цена: в 3-5 раз дороже моногидрата
- Побочки: меньше вздутия и задержки воды
- Эффективность: +++ (меньше исследований)

Научный вердикт:
⚠️ НЕТ качественных исследований, доказывающих превосходство HCL
⚠️ «Лучшая растворимость» ≠ лучшая биодоступность
⚠️ Моногидрат и так усваивается на ~99%
⚠️ Большинство заявлений о HCL — маркетинг

Когда HCL может быть оправдан:
- Сильное вздутие от моногидрата (5-10% людей)
- Чувствительный ЖКТ
- Нежелание набирать водный вес (перед соревнованиями)
- Готовность платить больше за комфорт

Другие формы креатина:
- Креалкалин (буферизованный): НЕТ преимуществ (исследование Jagim, 2012)
- Этиловый эфир: ХУЖЕ моногидрата (конвертируется в креатинин)
- Нитрат: мало данных, потенциально интересен
- Магниевый хелат: чуть лучше усвоение, дорогой

РЕКОМЕНДАЦИЯ: Моногидрат (Creapure) — лучшее соотношение цена/эффект.
Если вздутие — попробуйте микронизированный моногидрат или HCL.`;
}
export function getBVitaminsComplex(message: string): string {
  const relevant = /витамин.+B.+комплекс.+спорт|группа.+B.+спортсмен|b.?vitamins?.+complex|витамин.+B.+все.+подробн|B.+витамин.+стек/i.test(message);
  if (!relevant) return '';
  return `
💊 ВИТАМИНЫ ГРУППЫ B ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ РАЗБОР:

B1 (тиамин) — 1.5-3 мг/день:
- Углеводный метаболизм (пируватдегидрогеназа)
- Дефицит: усталость, мышечная слабость
- Источники: свинина, гречка, горох

B2 (рибофлавин) — 1.5-3 мг/день:
- Энергетический метаболизм (FAD, FMN)
- Антиоксидантная система (глутатион-редуктаза)
- Источники: печень, яйца, молоко

B3 (ниацин) — 15-25 мг/день:
- NAD+/NADH — ключевой кофермент энергетики
- Расширение сосудов (пампинг-эффект)
- Источники: курица, тунец, индейка

B5 (пантотеновая кислота) — 5-10 мг/день:
- Синтез КоА (центральный в метаболизме)
- Синтез стероидных гормонов
- Источники: авокадо, грибы, яйца

B6 (пиридоксин) — 2-10 мг/день:
- Метаболизм аминокислот (критично для синтеза белка!)
- Синтез серотонина, дофамина, ГАМК
- Потребность растёт с количеством белка
- Источники: бананы, курица, картофель

B7 (биотин) — 30-100 мкг/день:
- Глюконеогенез, синтез жирных кислот
- Волосы, кожа, ногти
- Источники: яйца (варёные!), орехи

B9 (фолат) — 400-800 мкг/день:
- Синтез ДНК (деление клеток, включая мышечные)
- Метилирование (эпигенетика)
- Источники: зелёные листовые, бобовые

B12 (кобаламин) — 500-1000 мкг/день:
- Формирование эритроцитов (перенос кислорода!)
- Нервная система, когнитивные функции
- Дефицит: анемия, усталость, снижение выносливости
- Источники: ТОЛЬКО животные (мясо, рыба, яйца)

Рекомендация:
- B-комплекс с активными формами (метилфолат, метилкобаламин)
- Принимать УТРОМ (бодрят, могут мешать сну)
- Вегетарианцам: B12 ОБЯЗАТЕЛЬНО как добавка`;
}
export function getCaffeineCyclingProtocol(message: string): string {
  const relevant = /кофеин.+циклиров.+протокол|кофеин.+перерыв.+подробн|caffeine.+cycling.+prot|толерантност.+кофеин.+сброс|кофеин.+эффективн.+восстанов/i.test(message);
  if (!relevant) return '';
  return `
☕ ЦИКЛИРОВАНИЕ КОФЕИНА — ПРОТОКОЛ ДЛЯ СПОРТСМЕНОВ:

Проблема толерантности:
- Регулярный приём → рецепторы аденозина увеличиваются на 20-30%
- Через 7-12 дней ежедневного приёма эффект снижается на 50%
- Через 3-4 недели — нужна бо́льшая доза для того же эффекта
- Результат: пьёте больше кофе, получаете меньше эффекта

Протокол циклирования:
📅 Вариант 1: «5/2»
- 5 дней с кофеином → 2 дня без
- Лёгкий для соблюдения (выходные без кофеина)
- Поддерживает ~70% чувствительности

📅 Вариант 2: «3 недели / 1 неделя»
- 3 недели нормального приёма → 1 неделя без кофеина
- Полный «ресет» толерантности за неделю
- Эффект кофеина после перерыва — как в первый раз

📅 Вариант 3: «Только для тренировок»
- Кофеин ТОЛЬКО в дни тренировок (3-4 раза в неделю)
- В дни отдыха — без кофеина
- Сохраняет чувствительность ~80%

Как пережить неделю без кофеина:
- Первые 1-3 дня: головная боль, усталость, раздражительность
- Дни 4-5: симптомы ослабевают
- Дни 6-7: нормальное состояние, толерантность сброшена
- Лайфхак: постепенное снижение (день 1: 50% дозы, день 2: 25%, день 3: 0)

Оптимальные дозы для тренировок:
- Эргогенная доза: 3-6 мг/кг массы тела
- Для 80 кг человека: 240-480 мг (2-4 чашки крепкого кофе)
- За 30-60 мин до тренировки
- Максимум: 400 мг/день (рекомендация ВОЗ)

Время приёма:
- До 14:00 (период полувыведения 5-6 часов)
- Не позже чем за 8 часов до сна
- Утренняя тренировка: сразу после пробуждения
- Вечерняя тренировка: в обед (если тренировка до 18:00)`;
}
export function getPreWorkoutSuppGuide(message: string): string {
  const relevant = /предтреник.+гайд|предтрен.+добавк.+подробн|pre.?workout.+suppl.+guide|что.+в.+предтрен|предтрен.+состав.+разбор/i.test(message);
  if (!relevant) return '';
  return `
⚡ ПРЕДТРЕНИРОВОЧНЫЕ ДОБАВКИ — ПОЛНЫЙ РАЗБОР:

Что реально работает (по доказательной базе):

1. Кофеин (3-6 мг/кг, 200-400 мг):
   ⭐⭐⭐⭐⭐ Доказательность
   - Сила +3-5%, выносливость +10-15%, RPE ↓
   - За 30-60 мин до тренировки

2. Цитруллин малат (6-8 г):
   ⭐⭐⭐⭐☆ Доказательность
   - Пампинг, снижение усталости, +повторений
   - L-цитруллин (не DL-) — предпочтительная форма

3. Бета-аланин (3-6 г/день):
   ⭐⭐⭐⭐☆ Доказательность
   - Буфер молочной кислоты, помогает при 1-4 мин нагрузки
   - Покалывание (парестезия) — безвредно
   - Загрузка: 3-6 г/день, эффект через 2-4 недели

4. Креатин (3-5 г):
   ⭐⭐⭐⭐⭐ Доказательность
   - Можно в любое время, но удобно до/после
   - Уже описан подробно отдельно

5. Таурин (1-3 г):
   ⭐⭐⭐☆☆ Доказательность
   - Антиоксидант, может помочь выносливости
   - Дешёвый, без побочек

Что есть в предтрениках, но НЕ работает:
❌ Аргинин: хуже цитруллина (хуже усвоение)
❌ BCAA перед тренировкой: уже есть в протеине/еде
❌ «Проприетарные смеси»: скрывают дозировки (обычно занижены)
❌ DMAA/DMHA: стимуляторы с побочками и запретами WADA

Рецепт своего предтреника (дешевле в 3-5 раз):
- Кофеин 200 мг (кофеин в таблетках или крепкий кофе)
- Цитруллин малат 6 г
- Бета-аланин 3 г
- Креатин 5 г
- Таурин 2 г
- Всё смешать в воде за 30 мин до тренировки
- Стоимость: ~15-25₽ за порцию (vs 100-200₽ за фабричный)

Когда НЕ нужен предтреник:
- Тренировка после 16:00 (кофеин мешает сну)
- Проблемы с сердцем, давлением
- Тревожность, панические атаки
- Зависимость от стимуляторов (всегда «не могу без»)`;
}
export function getVitaminETocopherols(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['витамин е токоферол', 'vitamin e tocopherol', 'витамин е формы', 'токоферол vs токотриенол', 'витамин е антиоксидант', 'витамин е для спортсмен'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🧬 ВИТАМИН Е — ТОКОФЕРОЛЫ И ТОКОТРИЕНОЛЫ ДЛЯ АТЛЕТОВ:

═══ ФОРМЫ ВИТАМИНА Е ═══
• 4 токоферола: альфа, бета, гамма, дельта
• 4 токотриенола: альфа, бета, гамма, дельта
• Всего 8 форм — каждая с уникальными свойствами
• Альфа-токоферол: самый распространённый в добавках
• Гамма-токоферол: самый мощный противовоспалительный

═══ РОЛЬ В СПОРТЕ ═══
• Главный жирорастворимый антиоксидант в мембранах клеток
• Защита мышечных мембран от оксидативного повреждения
• Снижение воспаления после тяжёлых тренировок
• Улучшение иммунной функции при высоких нагрузках
• Защита от перекисного окисления липидов

═══ ДОЗИРОВКИ ═══
• RDI: 15 мг (22.4 МЕ) альфа-токоферола
• Спортсмены: 200-400 МЕ/день смешанных токоферолов
• ⚠️ Не превышать 1000 МЕ/день (риск кровотечений)
• Лучшая форма: d-альфа-токоферол (натуральный)
• Избегать: dl-альфа-токоферол (синтетический, 50% неактивен)

═══ НАТУРАЛЬНЫЕ ИСТОЧНИКИ ═══
• Миндаль (25-30 шт): ~7.3 мг альфа-токоферола
• Подсолнечные семечки (30 г): ~7.4 мг
• Авокадо (1 средний): ~2.7 мг
• Оливковое масло (1 ст. ложка): ~1.9 мг
• Шпинат (100 г): ~2 мг
• Арахис (30 г): ~2.4 мг

═══ ВАЖНЫЕ НЮАНСЫ ═══
• Жирорастворимый — принимать с едой, содержащей жиры
• Избыток витамина Е подавляет усвоение витамина К → свёртываемость
• Высокие дозы (>400 МЕ): противоречивые данные по безопасности
• Лучше получать из пищи + умеренные добавки
• Совместимость: витамин С восстанавливает окислённый витамин Е → синергия

═══ КОГДА НЕ НУЖНЫ ДОБАВКИ ═══
• При разнообразном питании с орехами, маслами, зеленью
• При приёме мультивитаминов (обычно содержат 30-100 МЕ)
• Высокие дозы НЕ улучшают производительность у здоровых атлетов
• Антиоксиданты в больших дозах могут ПРИТУПЛЯТЬ адаптацию к тренировкам
`;
}
export function getProbioticsMicrobiome(message: string): string {
  const keywords = ['пробиотик', 'микробиом', 'кишечник', 'бактери', 'флора', 'дисбактериоз', 'лакто', 'бифидо'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Пробиотики и микробиом спортсмена

### Микробиом и производительность
• Кишечник — «второй мозг»: 70% иммунных клеток находятся в ЖКТ
• Микробиом спортсменов разнообразнее на 40% vs сидячий образ жизни
• Бутират (продукт бактерий) → энергия для колоноцитов + противовоспалительный эффект
• Veillonella (бактерия) → превращает лактат в пропионат → дополнительная энергия

### Штаммы для спортсменов
**Lactobacillus rhamnosus GG:**
• Снижает частоту ОРВИ на 40% у атлетов
• Доза: 10-20 млрд CFU/день

**Lactobacillus acidophilus NCFM:**
• Улучшает усвоение белка на 15-20%
• Снижает вздутие от высокобелковой диеты

**Bifidobacterium longum:**
• Снижает кортизол на 18% (исследование 2023)
• Улучшает качество сна

**Saccharomyces boulardii:**
• Защита от диареи путешественников (для выездных соревнований)
• Восстановление после антибиотиков

### Пребиотики — корм для бактерий
• Инулин (цикорий, топинамбур) — 5-10 г/день
• ГОС/ФОС (лук, чеснок, бананы) — 3-5 г/день
• Резистентный крахмал (охлаждённый рис, картофель)
• Бета-глюкан (овёс, ячмень) — иммуномодуляция

### Влияние тренировок на микробиом
• Умеренные нагрузки → рост разнообразия микробиома
• Чрезмерные (марафон, перетренированность) → проницаемость кишечника ↑
• НПВС (ибупрофен) + нагрузка → двойной удар по слизистой
• Стресс → снижение Lactobacillus → больше инфекций

### Практические рекомендации
• Ферментированные продукты ежедневно: кефир, квашеная капуста, комбуча
• Пробиотики: принимать с едой или за 30 мин до (для выживаемости)
• Разнообразие клетчатки: 30+ видов растительной пищи в неделю
• Избегать: избыток сахара, алкоголь, необоснованные антибиотики
`;
}
export function getElectrolyteSweatingScience(message: string): string {
  const keywords = ['электролит', 'потоотделен', 'пот', 'натрий', 'калий', 'магний', 'обезвожив', 'дегидратац', 'водный баланс'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Электролиты и наука потоотделения

### Состав пота спортсмена (на 1 литр)
• Натрий: 200-1600 мг (в среднем 900 мг) — основная потеря
• Калий: 150-300 мг
• Кальций: 15-70 мг
• Магний: 5-35 мг
• Хлорид: 500-1500 мг
• Потеря пота: 0.5-2.5 л/час (зависит от интенсивности и жары)

### Индивидуальный тест пота (Sweat Test)
1. Взвесься до тренировки (без одежды)
2. Тренируйся 60 мин (записывай выпитую воду)
3. Взвесься после (без одежды)
4. Потеря массы (кг) + выпитая вода (л) = объём пота/час
5. Если белые разводы на одежде = «солёный потитель» (>1000 мг Na/л)

### Стратегия гидратации
**До тренировки (2-4 часа):** 5-7 мл/кг массы тела
**Во время:** 150-250 мл каждые 15-20 мин
**После:** 150% потерянного веса за 2-4 часа
**Соль:** добавлять 0.5-1 г на литр при тренировках >60 мин

### Электролитный напиток своими руками
• 1 л воды
• 1/4 чайной ложки соли (500 мг натрия)
• 2 ст.л. мёда или сахара (30 г углеводов)
• Сок половины лимона (калий + вкус)
• Щепотка калийной соли (по желанию)

### Признаки дисбаланса электролитов
**Гипонатриемия (мало натрия):**
• Головная боль, тошнота, спутанность сознания
• Опасно: пить много воды без соли в жару

**Гипокалиемия (мало калия):**
• Мышечные судороги, слабость, аритмия
• Источники: бананы, картофель, авокадо

**Гипомагниемия (мало магния):**
• Судороги, бессонница, тремор
• 400-600 мг/день для атлетов (цитрат или глицинат)

### Когда нужны электролиты
• Тренировка >60 мин
• Жаркая/влажная среда
• Два тренировки в день
• Обильное потоотделение
• Диета с низким содержанием углеводов/соли
`;
}
export function getVitaminCSportsScience(message: string): string {
  const keywords = ['витамин с', 'витамин c', 'аскорбин', 'ascorbic', 'антиоксидант', 'иммунитет спорт'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Витамин C — спортивная наука

### Роль в организме спортсмена
• Синтез коллагена: сухожилия, связки, кожа, хрящи
• Антиоксидантная защита: нейтрализация ROS после тренировки
• Иммуномодуляция: снижение ОРВИ на 50% у атлетов
• Карнитин синтез: помогает транспорту жирных кислот → энергия
• Абсорбция железа: увеличивает на 67% (важно для бегунов)

### Дозировка для спортсменов
**Базовая:** 200-500 мг/день (с едой)
**При интенсивных нагрузках:** 500-1000 мг/день
**При болезни:** 1000-2000 мг/день (временно)
**Максимум:** >2000 мг/день не имеет пользы + риск камней

### Важный нюанс: адаптация к тренировкам
• Высокие дозы вит.С (>1000 мг) ПОСЛЕ тренировки могут блокировать адаптацию
• ROS (свободные радикалы) = сигнал для роста митохондрий и мышц
• Блокируя ROS антиоксидантами → ослабляем тренировочный стимул
• Решение: принимай вит.С за 3-4 часа до или через 3+ часа после тренировки

### Лучшие пищевые источники (мг на 100г)
• Шиповник: 650 мг (!!)
• Облепиха: 200 мг
• Чёрная смородина: 180 мг
• Болгарский перец: 150 мг
• Брокколи: 90 мг
• Киви: 75 мг
• Апельсин: 53 мг
• Клубника: 60 мг

### Синергия с другими нутриентами
• Витамин C + Железо → абсорбция Fe ↑67%
• Витамин C + Витамин E → регенерация вит.Е
• Витамин C + Цинк → иммунитет ↑↑
• Витамин C + Коллаген → синтез коллагена ↑↑

### Формы витамина С
• Аскорбиновая кислота: дешёвая, эффективная, может раздражать ЖКТ
• Аскорбат натрия/кальция: буферизированная, мягче для желудка
• Липосомальный: лучшая биодоступность (до 90%)
• Ester-C: pH-нейтральная, задерживается в тканях дольше
`;
}
export function getOmega6to3BalanceGuide(message: string): string {
  const keywords = ['омега-6', 'omega-6', 'соотношен', 'воспален', 'противовоспал', 'линолев', 'арахидон'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Баланс Омега-6 / Омега-3 для спортсмена

### Проблема современного питания
• Идеальное соотношение Ω6:Ω3 = 1:1 до 4:1
• Реальное соотношение в России: 15-20:1 (!)
• Дисбаланс → хроническое воспаление → замедленное восстановление
• Источники избытка Ω6: подсолнечное масло, маргарин, фастфуд, чипсы

### Омега-6: не враг, но нужен баланс
**Полезные функции:**
• Линолевая к-та (LA): клеточные мембраны, кожа
• Арахидоновая к-та (AA): иммунный ответ, мышечный рост
• GLA (гамма-линоленовая): противовоспалительная (масло примулы)

**Проблема = избыток:**
• Конкурирует с Ω3 за одни ферменты (Δ5/Δ6 десатуразы)
• Больше Ω6 → больше провоспалительных эйкозаноидов
• Хроническое воспаление → DOMS длится дольше, боль в суставах

### Стратегия оптимизации
**Шаг 1: Уменьши Ω6**
• Замени подсолнечное масло → оливковое/кокосовое
• Избегай: маргарин, майонез на подс.масле, жареная пища
• Ограничь: семечки подсолнечника, кукурузное масло

**Шаг 2: Увеличь Ω3**
• Жирная рыба 2-3 раза/неделю (сёмга, скумбрия, сардины)
• Льняное семя: 1-2 ст.л./день (ALA → частично в EPA/DHA)
• Грецкие орехи: 30-50 г/день
• Добавка: рыбий жир 2-4 г EPA+DHA/день

### Влияние на спортсмена
**Оптимальное Ω6:Ω3 (2-4:1):**
• Восстановление после тренировки: на 20-30% быстрее
• DOMS: снижение интенсивности и продолжительности
• Суставы: меньше боли и скованности
• Иммунитет: реже болеешь при высоких нагрузках
• Синтез белка: Ω3 стимулирует mTOR → анаболизм

### Практические рекомендации
• Готовь на оливковом масле (высокая точка дыма = extra light)
• Сёмга/форель 2-3 раза/неделю
• Рыбий жир: 2-4 г EPA+DHA, утром с едой
• Орехи: грецкие > миндаль > кешью (по содержанию Ω3)
• Читай этикетки: ищи «пальмовое», «подсолнечное» — ограничивай
`;
}
export function getCreatineMythsTruth(message: string): string {
  const keywords = ['креатин', 'creatine', 'моногидрат', 'креатин миф', 'креатин вред', 'загрузка креатин'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Креатин — мифы и правда (научный разбор)

### Что доказано (мета-анализы, уровень A)
✅ Увеличение силы: +5-10% в тяжёлых упражнениях
✅ Увеличение мышечной массы: +1-2 кг за 12 недель (сверх плацебо)
✅ Улучшение производительности: интервальные нагрузки 2-30 сек
✅ Безопасность: >500 исследований, без вреда при нормальной функции почек
✅ Когнитивные функции: улучшение при недосыпе и стрессе
✅ Нейропротекция: потенциальная защита от нейродегенерации

### Разбор мифов
❌ «Креатин = стероид» → Нет, это натуральное вещество (мясо, рыба)
❌ «Убивает почки» → Нет вреда при здоровых почках (проверено на 5 г/день, >5 лет)
❌ «Нужна загрузка» → Не обязательно (5 г/день за 3-4 недели = тот же результат)
❌ «Нужно циклировать» → Нет, можно принимать непрерывно
❌ «Вызывает облысение» → Одно слабое исследование, не подтверждено
❌ «Задерживает воду, портит рельеф» → Вода внутриклеточная (в мышцах), не подкожная
❌ «Нельзя с кофеином» → Можно, нет значимого взаимодействия
❌ «Креатин HCL лучше моногидрата» → Нет, моногидрат = золотой стандарт, лучше изучен

### Оптимальный протокол
**Базовый (без загрузки):**
• 5 г моногидрата/день, каждый день, без перерывов
• Эффект через 3-4 недели

**С загрузкой (быстрее):**
• Неделя 1: 20 г/день (4×5 г с едой)
• Далее: 3-5 г/день поддержание
• Эффект через 5-7 дней

**Время приёма:**
• С едой (улучшает усвоение на 25% с углеводами/белком)
• После тренировки (чуть лучше, чем до — одно исследование)
• Главное: ежедневно, постоянно

### Формы креатина — рейтинг
1. **Креатин моногидрат** — золотой стандарт, дёшево, эффективно
2. **Micronized (микронизированный)** — лучше растворяется, тот же эффект
3. **Креалкалин (Kre-Alkalyn)** — маркетинг, НЕ лучше моногидрата
4. **Креатин HCL** — меньшая доза, но дороже и менее изучен
5. **Креатин этил-эстер** — хуже моногидрата (быстрее распадается)

### Кому особенно полезен
• Вегетарианцы/веганы (нет креатина из мяса): +10-15% прирост vs мясоеды
• Атлеты 30+ (снижение естественных запасов)
• Интервальные виды спорта (единоборства, кроссфит, спринт)
• Тяжёлые силовые тренировки (приседы, тяги, жимы)
`;
}
export function getPreWorkoutSuppScienceGuide(message: string): string {
  const keywords = ['предтреник', 'предтренировочн', 'pre-workout', 'бустер', 'пампилк', 'помпа добав'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Предтренировочные добавки — наука

### Ингредиенты с доказательной базой (Tier A)
**Кофеин:**
• Доза: 3-6 мг/кг за 30-60 мин
• Эффект: +3-5% к силе, +2-4% к мощности, ↑ фокус
• Толерантность: развивается за 2-3 недели, циклируй
• Не позже 6 часов до сна

**Креатин:**
• 5 г/день ежедневно (не обязательно перед тренировкой)
• +5-10% к силе и мощности
• Не требует тайминга — накопительный эффект

**Бета-аланин:**
• 3.2-6.4 г/день (разбить на порции)
• Буферизация H+ → отсрочка утомления на 1-4 мин нагрузки
• Накопительный эффект (4-12 недель)

**Цитруллин (или цитруллин малат):**
• 6-8 г за 60 мин до тренировки
• ↑ NO (оксид азота) → вазодилатация → пампинг
• +1-3 повторения при высоком объёме

### Ингредиенты с умеренной базой (Tier B)
**L-тирозин:**
• 1-2 г за 30-60 мин
• Улучшение фокуса при стрессе/недосыпе
• Предшественник дофамина и норадреналина

**Бетаин (триметилглицин):**
• 2.5 г/день
• +5% к силе в приседаниях (некоторые исследования)
• Улучшение гидратации клеток

**Альфа-GPC:**
• 300-600 мг за 30-60 мин
• +14% к мощности (одно исследование)
• Предшественник ацетилхолина → нервно-мышечная связь

### Бесполезные ингредиенты (маркетинг)
❌ BCAA при достаточном белке (1.6+ г/кг) — пустая трата
❌ Глутамин для мышц (полезен только для кишечника)
❌ «Proprietary blend» — скрытые дозировки = скорее всего мало
❌ DMAA/DMHA — стимуляторы с рисками для сердца (запрещены)

### DIY предтреник (эффективно и дёшево)
• Кофеин: 200-300 мг (или чашка эспрессо)
• Цитруллин малат: 8 г
• Бета-аланин: 3.2 г
• Соль: 0.5-1 г (натрий → пампинг + электролиты)
• Стоимость: ~15-20₽ за порцию vs 50-100₽ за коммерческий

### Правила безопасности
• Начинай с половины дозы (оцени переносимость)
• Не более 400 мг кофеина в день (из всех источников)
• Не смешивай стимуляторы (кофе + предтреник + энергетик = опасно)
• Не принимай каждый день — делай 2-3 дня без стимуляторов/неделю
• При сердцебиении, тревожности, бессоннице — снижай дозу или отмени
`;
}
export function getZincTestImmuneComplete(message: string): string {
  const keywords = ['цинк', 'zinc', 'тестостерон цинк', 'zma', 'иммунитет минерал', 'цинк добавк'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Цинк — тестостерон, иммунитет, восстановление

### Роль цинка для спортсмена
• Кофактор 300+ ферментов (синтез белка, ДНК, деление клеток)
• Критичен для синтеза тестостерона
• Иммуномодулятор: Т-клетки, NK-клетки
• Антиоксидант: защита от окислительного стресса
• Заживление ран и восстановление тканей

### Цинк и тестостерон
• Дефицит цинка → тестостерон ↓ на 30-50% за 20 недель
• Коррекция дефицита → тестостерон ↑ до нормы за 6 мес
• При нормальном уровне: дополнительный цинк НЕ повышает тестостерон сверх нормы
• Спортсмены теряют цинк с потом: 0.5-1.5 мг/литр пота

### Суточная потребность
**Мужчины:** 11 мг/день (RDA)
**Женщины:** 8 мг/день
**Спортсмены:** 15-30 мг/день (повышенные потери с потом)
**Максимум:** 40 мг/день (выше → дисбаланс меди)

### Пищевые источники (мг на 100г)
• Устрицы: 78 мг (!!)
• Говядина: 5-7 мг
• Тыквенные семечки: 7.5 мг
• Кунжут: 7.8 мг
• Чечевица: 3.3 мг
• Кешью: 5.6 мг
• Тёмный шоколад (85%): 3.3 мг
• Яйца: 1.3 мг

### Формы добавок (от лучшей к худшей)
1. **Цинк пиколинат** — биодоступность 60%, золотой стандарт
2. **Цинк глюконат** — 60%, хорошо переносится
3. **Цинк цитрат** — 50%, недорогой
4. **Цинк бисглицинат** — 40-50%, мягкий для ЖКТ
5. **Цинк оксид** — 15-20%, дешёвый, плохо усваивается

### Важные нюансы
• Принимай натощак или с белковой пищей
• НЕ принимай одновременно с кальцием, железом, медью (конкуренция)
• Разнеси приём цинка и меди на 2+ часа
• При приёме >20 мг цинка → добавь медь (1-2 мг) для баланса
• Фитаты (зерновые, бобовые) снижают усвоение → не принимай с ними

### ZMA (Zinc Magnesium Aspartate)
• Состав: цинк 30 мг + магний 450 мг + B6 10.5 мг
• Приём: на ночь, натощак (за 30-60 мин до сна)
• Эффект: улучшение сна + восстановление (при дефиците)
• Тестостерон: повышается ТОЛЬКО при исходном дефиците
`;
}
export function getCollagenJointAdvanced(message: string): string {
  const keywords = ['коллаген', 'collagen', 'сухожил', 'связк', 'сустав добавк', 'хрящ', 'соединительн'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Коллаген для суставов и сухожилий — продвинутый гид

### Типы коллагена
**Тип I:** 90% коллагена тела — кожа, сухожилия, кости, связки
**Тип II:** Хрящевая ткань (суставные хрящи)
**Тип III:** Кровеносные сосуды, внутренние органы (с типом I)
• Для суставов и сухожилий: типы I + II наиболее важны

### Протокол Кита Баара (доказательная база)
• 15 г гидролизованного коллагена + 50 мг витамина С
• За 30-60 мин ДО тренировки связок/сухожилий
• Тренировка: 5-10 мин изометрических или лёгких упражнений
• 6-часовой цикл: можно повторить 2-3 раза/день
• Результат: ↑ синтез коллагена в 2 раза (исследование 2017)

### Дозировка
**Для суставов:** 10-15 г гидролизованного коллагена/день
**Для кожи:** 5-10 г/день
**Для сухожилий (реабилитация):** 15-20 г/день + вит.С
**Тип II (UC-II, неденатурированный):** 40 мг/день (другой механизм — иммунная модуляция)

### Источники коллагена
**Пищевые:**
• Костный бульон (длительная варка 12-24ч): 5-10 г/порцию
• Хрящи, кожа, сухожилия (если ешь)
• Желатин: то же, что коллаген (денатурированный)
• Холодец: русская традиция = отличный источник!

**Добавки:**
• Гидролизованный коллаген (пептиды): лучшая биодоступность
• Желатин: дешевле, менее удобен
• UC-II: 40 мг/день, другой механизм (не путай с гидролизованным)

### Синтез коллагена: что нужно
• Витамин C: 50-250 мг с каждым приёмом коллагена (ОБЯЗАТЕЛЬНО!)
• Медь: 1-2 мг/день (кофактор лизил-оксидазы)
• Пролин и глицин: в коллагене уже есть
• Физическая нагрузка: стимулирует синтез (изометрика + эксцентрика)

### Практический протокол для спортсмена
**Утро (за 30 мин до разминки):**
15 г коллагена + 1 киви (витамин С) → 5 мин разминка суставов
**Вечер (перед сном):**
10 г коллагена + 50 мг вит.С → для восстановления ночью
**Курс:** минимум 3-6 месяцев для заметного эффекта на суставы
`;
}
export function getBVitaminsAthleteComplete(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['витамин b', 'витамины группы b', 'b-комплекс', 'b vitamin', 'тиамин', 'рибофлавин', 'ниацин', 'b6', 'b12', 'фолиевая', 'пантотеновая', 'биотин', 'b1', 'b2', 'b3', 'b5', 'b7', 'b9'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
💊 ВИТАМИНЫ ГРУППЫ B — ПОЛНЫЙ ГАЙД ДЛЯ АТЛЕТОВ

🔬 8 ВИТАМИНОВ И ИХ РОЛИ В СПОРТЕ:

B1 (ТИАМИН) — энергия из углеводов:
• Кофермент пируватдегидрогеназы → углеводный метаболизм
• Потребность: 1.2-2.0 мг/день (растёт с углеводной нагрузкой)
• Дефицит: усталость, мышечная слабость, снижение аэробной мощности
• Источники: свинина, семечки, бобовые, овсянка

B2 (РИБОФЛАВИН) — антиоксидант + энергия:
• Часть FAD/FMN — электрон-транспортная цепь
• Потребность: 1.3-2.0 мг/день (повышена при интенсивных тренировках)
• Ключевая роль: регенерация глутатиона — главного антиоксиданта
• Источники: яйца, молочные, печень, миндаль

B3 (НИАЦИН) — NAD+ производство:
• Критичен для 400+ ферментативных реакций
• NAD+ → клеточная энергия + восстановление ДНК
• Потребность: 16-20 мг NE/день
• ⚠️ Высокие дозы (>500 мг): flush-эффект (покраснение кожи)
• Источники: курица, тунец, арахис, грибы

B5 (ПАНТОТЕНОВАЯ КИСЛОТА) — синтез CoA:
• Коэнзим А → метаболизм жиров, углеводов, белков
• Потребность: 5-7 мг/день
• Дефицит редок, но проявляется жжением в стопах
• Источники: авокадо, брокколи, яйца, курица

B6 (ПИРИДОКСИН) — аминокислотный метаболизм:
• 100+ ферментов аминокислотного обмена
• Синтез нейротрансмиттеров: серотонин, дофамин, ГАМК
• Гликогенолиз: ключевой для выброса энергии при тренировке
• Потребность: 1.3-2.0 мг/день (до 2.5 мг при высокобелковой диете)
• ⚠️ Токсичность >100 мг/день — нейропатия
• Источники: курица, картофель, бананы, нут

B7 (БИОТИН) — кожа, волосы, углеводный обмен:
• Карбоксилазные реакции: глюконеогенез, синтез жирных кислот
• Потребность: 30-50 мкг/день
• Мало влияет на спортивную производительность напрямую
• Источники: яйца (варёные!), орехи, соя

B9 (ФОЛАТ) — клеточное деление:
• Синтез ДНК → критичен для регенерации тканей после тренировок
• Эритропоэз: формирование красных кровяных телец → кислородоёмкость
• Потребность: 400-600 мкг DFE/день
• Источники: тёмная зелень, бобовые, свёкла, спаржа

B12 (КОБАЛАМИН) — нервная система + кровь:
• Миелинизация нервов → скорость нервных импульсов
• Синтез эритроцитов совместно с фолатом
• Потребность: 2.4-6 мкг/день
• ⚠️ Риск дефицита: вегетарианцы, веганы (только животные источники)
• Источники: печень, красное мясо, рыба, молочные

📊 ПРИЗНАКИ ДЕФИЦИТА У СПОРТСМЕНОВ:
• Необъяснимая усталость → проверь B1, B2, B12
• Снижение выносливости → проверь B12, фолат (анемия?)
• Плохое восстановление → B6, B9 (ремонт тканей)
• Судороги, нервозность → B1, B6, магний
• Трещины в углах рта → B2, B3

💡 РЕКОМЕНДАЦИИ:
• Комплексный B-витамин: принимай утром с едой (повышает энергию)
• Не принимай B-комплекс перед сном — может нарушить засыпание
• При высокобелковой диете: повышай B6
• При высокоуглеводной: повышай B1
• При вегетарианстве: обязательно B12 отдельно (метилкобаламин)
`;
}
export function getPreWorkoutNutritionTimingComplete(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['еда перед тренировкой', 'что есть перед', 'pre workout meal', 'питание перед тренировкой', 'за сколько есть до тренировки', 'приём пищи перед', 'что съесть перед', 'есть перед залом'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🍽️ ПИТАНИЕ ПЕРЕД ТРЕНИРОВКОЙ — ТОЧНЫЙ ТАЙМИНГ

⏰ ВРЕМЕННЫЕ ОКНА:

3-4 ЧАСА ДО ТРЕНИРОВКИ (полноценный приём):
• Полный обед/ужин: белок + углеводы + жиры + клетчатка
• Примеры:
  → Курица 150г + рис 200г (готовый) + овощи + ложка масла
  → Рыба 200г + картофель 250г + салат
  → Паста 100г (сухая) + фарш 150г + соус
• Калории: 500-700 ккал
• Углеводы: 60-80г (основной источник энергии)
• Белок: 30-40г (начнёт перевариваться к тренировке)

1.5-2 ЧАСА ДО (лёгкий перекус):
• Быстрые + медленные углеводы + немного белка
• Примеры:
  → Банан + протеиновый коктейль
  → Творог 150г + мёд + хлебцы
  → Овсянка 60г + протеин + ягоды
  → Бутерброд: хлеб + индейка + банан
• Калории: 300-400 ккал
• Углеводы: 40-60г
• Белок: 20-30г
• Жиры: минимум (<10г) — замедляют пищеварение

30-45 МИНУТ ДО (если не успел поесть раньше):
• Только быстрые углеводы
• Примеры:
  → Банан
  → Финики 3-4 шт
  → Рисовые хлебцы 2-3 шт + джем
  → Спортивный напиток с углеводами
• Калории: 100-200 ккал
• Углеводы: 25-40г
• Белок/жиры: минимум (не успеют перевариться)

🚀 ТРЕНИРОВКА НАТОЩАК:
• Допустима для кардио Zone 2 (утром для жиросжигания)
• НЕ рекомендуется для силовых: -10-15% к производительности
• Если натощак силовая: хотя бы 5-10г BCAA/EAA перед тренировкой
• Кортизол утром натощак повышен → катаболизм мышц

📊 ЧТО НЕЛЬЗЯ ПЕРЕД ТРЕНИРОВКОЙ:
• Много жира (>20г): замедляет пищеварение → тяжесть, тошнота
• Много клетчатки: вздутие, дискомфорт при нагрузке
• Молоко/кефир у некоторых: лактоза → газы при нагрузке
• Острая пища: рефлюкс при наклонах/жимах
• Новые продукты: не экспериментируй перед важной тренировкой

💊 ДОБАВКИ ДО ТРЕНИРОВКИ (тайминг):
• Кофеин (3-6 мг/кг): за 30-60 мин → пик через 45-60 мин
• Креатин (5г): в любое время дня (не привязан к тренировке)
• Цитруллин (6-8г): за 30-60 мин → вазодилатация, пампинг
• Бета-аланин (3.2г): за 30 мин (или ежедневно для накопления)
• Без сахара energy drink: читай состав — часто >300мг кофеина!

🎯 ИНДИВИДУАЛЬНЫЕ СТРАТЕГИИ:
• Утренний тренирующийся: лёгкий перекус за 30-45 мин достаточно
• Обеденный: обед за 2-3ч + банан за 30 мин
• Вечерний: обед → перекус за 1.5ч → тренировка → ужин
• При наборе массы: больше углеводов pre-workout (70-80г)
• При сушке: меньше углеводов, но НЕ ноль (30-40г минимум)
`;
}
export function getMagnesiumFormsAthleteGuide(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['магний форма', 'какой магний', 'магний выбрать', 'magnesium form', 'глицинат', 'цитрат', 'таурат', 'магний для спорта', 'магния оксид', 'магний лучший', 'формы магния'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
💊 ФОРМЫ МАГНИЯ — ПОЛНЫЙ ГАЙД ДЛЯ АТЛЕТОВ

🔬 ПОЧЕМУ МАГНИЙ КРИТИЧЕН:
• Кофактор 300+ ферментов (энергия, синтез белка, нервная система)
• 70-80% людей в дефиците (даже при нормальном питании)
• У атлетов потери через пот выше → потребность +20-30%
• RDA: 400-420 мг/день (мужчины), 310-320 мг (женщины)
• Для атлетов: 400-600 мг/день

📊 ФОРМЫ МАГНИЯ — СРАВНЕНИЕ:

1. МАГНИЙ ГЛИЦИНАТ (бисглицинат):
🏆 Лучший для сна и восстановления
• Биодоступность: очень высокая (~80%)
• Глицин в составе: тормозной нейротрансмиттер → успокаивает
• Побочки: минимальные (не вызывает диарею)
• Приём: 200-400 мг перед сном
• Для: улучшение сна, снижение тревожности, восстановление

2. МАГНИЙ ЦИТРАТ:
🏆 Лучший для общего дефицита
• Биодоступность: высокая (~65%)
• Осмотический эффект: может размягчать стул
• Дешевле глицината
• Приём: 200-400 мг с едой
• Для: восполнение дефицита, здоровье кишечника

3. МАГНИЙ ТАУРАТ:
🏆 Лучший для сердца
• Таурин + магний: двойная кардиопротекция
• Стабилизация ЧСС, снижение давления
• Биодоступность: высокая
• Приём: 200-400 мг утром или вечером
• Для: сердечно-сосудистое здоровье, аритмии

4. МАГНИЙ L-ТРЕОНАТ:
🏆 Лучший для мозга
• Единственная форма, проникающая через ГЭБ
• Улучшение когнитивных функций, памяти
• Исследование MIT: улучшение синаптической плотности
• Приём: 144 мг элементарного Mg (2000 мг L-треоната)
• Для: фокус, концентрация, нейропротекция

5. МАГНИЙ МАЛАТ:
🏆 Лучший для энергии
• Малат = участник цикла Кребса → производство АТФ
• Снижение мышечной усталости, болезненности
• Приём: 200-400 мг утром с едой
• Для: энергия, фибромиалгия, хроническая усталость

6. МАГНИЙ ОКСИД:
⚠️ Самый дешёвый, но худший
• Биодоступность: низкая (~4%)
• Сильный осмотический эффект → диарея
• Приём: только как слабительное
• НЕ рекомендуется для дефицита

7. МАГНИЙ ХЛОРИД (бишофит):
Для наружного применения
• Спрей/масло на кожу, ванны
• Абсорбция через кожу спорна (мало исследований)
• Может снимать мышечные спазмы локально
• Ванны с магнием: расслабление, но не заменяет пероральный приём

📋 СТРАТЕГИЯ ДЛЯ АТЛЕТА:
УТРО: Малат 200 мг (энергия) или Цитрат 200 мг
ВЕЧЕР (за 1ч до сна): Глицинат 300-400 мг (сон + восстановление)
ОПЦИОНАЛЬНО: Треонат днём (фокус на тренировке)

📊 ПРИЗНАКИ ДЕФИЦИТА МАГНИЯ:
• Судороги (особенно ночные)
• Проблемы со сном
• Тревожность, раздражительность
• Мышечные подёргивания (тики)
• Плохое восстановление после тренировок
• Повышенное давление
→ Анализ крови: сывороточный Mg часто НОРМАЛЬНЫЙ при дефиците (только 1% Mg в крови)
→ Лучше: RBC Magnesium (магний в эритроцитах)

💡 ПРОДУКТЫ С МАГНИЕМ:
Тыквенные семечки: 550 мг/100г
Тёмный шоколад 85%: 228 мг/100г
Миндаль: 270 мг/100г
Шпинат (варёный): 87 мг/100г
Авокадо: 29 мг/100г
Бананы: 27 мг/100г
`;
}
export function getCreatineDeepScienceComplete(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['креатин подробно', 'креатин гайд', 'creatine deep', 'креатин наука', 'креатин побочки', 'креатин вода', 'креатин загрузка', 'моногидрат', 'креатин для чего', 'как принимать креатин'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
⚡ КРЕАТИН — ГЛУБОКИЙ НАУЧНЫЙ РАЗБОР

🔬 МЕХАНИЗМ ДЕЙСТВИЯ:
• Креатин → фосфокреатин (PCr) в мышцах
• PCr + ADP → ATP (мгновенная энергия для мышечного сокращения)
• АТФ-PCr система: первые 6-10 сек максимального усилия
• Больше PCr в мышцах = больше рабочих сек до отказа = больше повторений
• Средний эффект: +5-10% к силе, +10-15% к объёму работы

📊 ДОКАЗАТЕЛЬНАЯ БАЗА:
• 500+ исследований — самая изученная добавка в истории
• ISSN, ACSM, IOC: признают безопасным и эффективным
• Эффект подтверждён для: силы, мощности, спринтов, восстановления
• Не является стероидом, не запрещён WADA

📋 ПРОТОКОЛЫ ПРИЁМА:

ВАРИАНТ 1 — ЗАГРУЗКА + ПОДДЕРЖКА (быстрый):
Неделя 1: 20г/день (5г × 4 приёма с едой)
Неделя 2+: 3-5г/день постоянно
→ Насыщение за 5-7 дней

ВАРИАНТ 2 — БЕЗ ЗАГРУЗКИ (постепенный):
3-5г/день постоянно с первого дня
→ Насыщение за 3-4 недели
→ Результат идентичный, просто позже

🏆 РЕКОМЕНДАЦИЯ: 5г/день без загрузки — проще, дешевле, та же эффективность

⏰ КОГДА ПРИНИМАТЬ:
• Время дня: НЕ ВАЖНО (главное — ежедневно)
• С чем: с углеводами + белком (инсулин улучшает транспорт в мышцы)
• Исследование: после тренировки чуть лучше чем до (Антонио 2013), но разница минимальна

💧 КРЕАТИН И ВОДА:
• Креатин притягивает воду В МЫШЦЫ (внутриклеточно)
• Это НЕ отёки (подкожная вода) — это гидратация мышечных клеток
• Прибавка веса: 1-2 кг в первые 1-2 недели = ВОДА В МЫШЦАХ
• «Залитый» вид: миф при правильной гидратации
• Пей 2.5-3л воды/день на креатине (обязательно!)

❌ МИФЫ:

МИФ: «Креатин вредит почкам»
ПРАВДА: У здоровых людей — нет. 300+ исследований, включая 5-летние, без ухудшения
⚠️ При существующей болезни почек — консультация с врачом

МИФ: «Нужно циклировать (месяц через месяц)»
ПРАВДА: Нет необходимости. Тело не «привыкает», собственный синтез восстанавливается при отмене

МИФ: «Креатин HCL/буферизованный лучше моногидрата»
ПРАВДА: Моногидрат = золотой стандарт. HCL и Kre-Alkalyn не показали преимущества в исследованиях, но стоят в 5-10 раз дороже

МИФ: «Кофеин блокирует креатин»
ПРАВДА: Один раннее исследование (Vandenberghe 1996) → не подтверждено позже. Можно совмещать

МИФ: «Креатин только для качков»
ПРАВДА: Пользу получают все: бегуны, пловцы, единоборцы, пожилые (сохранение мышц), вегетарианцы (у них дефицит из-за отсутствия мяса)

📊 КТО ПОЛУЧИТ МАКСИМАЛЬНУЮ ПОЛЬЗУ:
• «Респондеры» (~70%): выраженный эффект (+10-15%)
• «Нон-респондеры» (~30%): минимальный эффект
• Вегетарианцы: огромный эффект (исходно низкий PCr)
• Большая мышечная масса: больший эффект (больше «хранилище»)
• Type II (быстрые) волокна: больше PCr = больше пользы

💰 ВЫБОР И БЮДЖЕТ:
• Форма: креатин МОНОГИДРАТ (Creapure® — лучший бренд сырья)
• Цена: 500-1000₽ за 300г (хватит на 2 мес)
• Добавка: 5г/день = ~1500г/год = 2500-5000₽/год
• Самая дешёвая и эффективная добавка в спорте
`;
}
export function getVitaminDAthleteCompleteMastery(message: string): string {
  const keywords = ['витамин д', 'витамин d', 'vitamin d', 'кальциферол', 'холекальциферол', 'солнце', 'солнечн', 'кости', 'остеопороз', 'd3', 'д3'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
☀️ ВИТАМИН D ДЛЯ АТЛЕТОВ — ПОЛНОЕ РУКОВОДСТВО:

🔬 БИОХИМИЯ И МЕХАНИЗМЫ:
• Витамин D — на самом деле прогормон, не витамин
• D3 (холекальциферол) → печень → 25(OH)D → почки → 1,25(OH)2D (активная форма)
• Рецепторы VDR есть в мышцах, костях, иммунных клетках, мозге
• Влияет на экспрессию >1000 генов
• T1/2 в крови — 2-3 недели (медленное накопление/снижение)

📊 УРОВНИ В КРОВИ (25-OH витамин D):
• <20 нг/мл — дефицит (в России у 60-80% населения зимой)
• 20-30 нг/мл — недостаточность
• 30-50 нг/мл — норма
• 40-60 нг/мл — оптимум для спортсменов
• >100 нг/мл — токсичность (крайне редко от добавок)

💪 ВЛИЯНИЕ НА СПОРТИВНЫЕ ПОКАЗАТЕЛИ:
• Синтез тестостерона — D3 стимулирует клетки Лейдига
• Мышечная сила — VDR в быстрых мышечных волокнах
• Скорость восстановления — противовоспалительное действие
• Иммунитет — снижение ОРВИ на 40-50% при оптимальном уровне
• Кости — усвоение кальция увеличивается на 30-40%
• Мышечная масса — корреляция с уровнем тестостерона

📋 ДОЗИРОВКИ:
• Поддержание (30+ нг/мл): 2000-4000 МЕ/день
• Коррекция дефицита: 5000-10000 МЕ/день 8-12 недель
• Спортсмены (оптимум 50 нг/мл): 4000-5000 МЕ/день
• Принимать С ЖИРНОЙ ПИЩЕЙ — усвоение +50%
• Витамин K2 (MK-7, 100-200 мкг) — ОБЯЗАТЕЛЬНЫЙ кофактор

⚠️ ОСОБЕННОСТИ ДЛЯ РОССИИ:
• Широта >42°N — синтез D3 в коже НЕВОЗМОЖЕН с октября по март
• Москва (55°N) — с ноября по февраль солнце не поднимается достаточно
• Даже летом нужно 20-30 мин прямого солнца (без крема) на 40% тела
• Смуглая кожа — синтез в 3-5 раз медленнее
• Стекло блокирует УФ-B лучи — загар через окно не работает

🔄 СИНЕРГИЯ С ДРУГИМИ НУТРИЕНТАМИ:
• D3 + K2 — направляет кальций в кости, а не в сосуды
• D3 + магний — магний нужен для активации D3
• D3 + кальций — классическая связка для костей
• D3 + цинк — совместное влияние на тестостерон
• D3 + омега-3 — усиление противовоспалительного эффекта
`;
}
export function getZincImmunityPerformanceGuide(message: string): string {
  const keywords = ['цинк', 'zinc', 'иммунитет', 'immunity', 'тестостерон цинк', 'простуд', 'цинк и', 'zn', 'zinc immunity'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🛡️ ЦИНК — ИММУНИТЕТ И ПРОИЗВОДИТЕЛЬНОСТЬ:

🔬 РОЛЬ ЦИНКА В ОРГАНИЗМЕ АТЛЕТА:
• Кофактор 300+ ферментов (включая синтез белка)
• Необходим для синтеза тестостерона — дефицит снижает Т на 40-50%
• Иммунная функция — активация T-лимфоцитов и NK-клеток
• Заживление тканей — синтез коллагена и репарация ДНК
• Антиоксидантная защита — компонент СОД (супероксиддисмутаза)
• Инсулиновый сигналинг — улучшает чувствительность к инсулину

📊 ПОТРЕБНОСТЬ И ДЕФИЦИТ:
• РНП: мужчины — 11 мг, женщины — 8 мг
• Спортсмены: 15-30 мг/день (повышенный расход)
• Потери с потом: 0.5-1.0 мг/литр пота
• Дефицит в России: 30-40% населения (бедные почвы, обработка пищи)
• Вегетарианцы: потребность +50% из-за фитатов

🔍 ПРИЗНАКИ ДЕФИЦИТА:
• Частые ОРВИ и затяжное выздоровление
• Снижение силовых показателей без причины
• Медленное заживление царапин/мозолей
• Ухудшение аппетита
• Акне и сухая кожа
• Ломкие ногти с белыми пятнами
• Снижение либидо (у мужчин)

💊 ФОРМЫ ЦИНКА (от лучшей к худшей):
1. Цинк пиколинат — усвоение ~60% (лучший выбор)
2. Цинк бисглицинат — ~55%, мягкий для желудка
3. Цинк цитрат — ~50%, хорошее соотношение цена/качество
4. Цинк глюконат — ~40%, в лечебных пастилках
5. Цинк оксид — ~15-20% (худший, самый дешёвый, избегать)
6. Цинк сульфат — ~25%, может раздражать ЖКТ

⏰ ОПТИМАЛЬНЫЙ ПРИЁМ:
• 15-30 мг элементарного цинка в день
• Натощак или через 2 часа после еды — лучше усвоение
• НЕ принимать с кальцием, железом, медью — конкуренция
• Принимать с витамином B6 — синергия для тестостерона
• Вечером — помогает качеству сна

⚠️ ВАЖНЫЕ ВЗАИМОДЕЙСТВИЯ:
• Цинк >50 мг/день подавляет усвоение меди — добавлять медь 1-2 мг
• Фитаты (зерно, бобовые) снижают усвоение — замачивать продукты
• Кофе/чай — танины снижают усвоение цинка
• Цинк + витамин C — синергия для иммунитета
• Антибиотики (тетрациклины) — принимать с разницей 2 часа
`;
}
export function getElectrolyteSweatingProtocol(message: string): string {
  const keywords = ['электролит', 'потоотделение', 'потлив', 'пот', 'sweat', 'electrolyte', 'натрий', 'калий', 'судороги мышц', 'обезвоживание тренировк', 'солев', 'изотоник'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💧 ЭЛЕКТРОЛИТЫ И ПОТООТДЕЛЕНИЕ — ПРОТОКОЛ УПРАВЛЕНИЯ:

🔬 ЧТО ТЕРЯЕТСЯ С ПОТОМ:
• Натрий: 200-1600 мг/л (основная потеря!)
• Калий: 100-200 мг/л
• Магний: 5-15 мг/л
• Кальций: 10-40 мг/л
• Хлориды: 500-1500 мг/л
• Средние потери пота: 0.5-2.5 л/час при тренировке

📊 ИНДИВИДУАЛЬНАЯ ПОТЛИВОСТЬ:
Тест «sweat rate»:
1. Взвесься без одежды перед тренировкой
2. Тренируйся 60 мин без питья
3. Взвесься после (без одежды, протерев пот)
4. Разница в граммах = мл пота в час
• <500 мл/час — низкая потливость
• 500-1000 мл/час — средняя
• >1000 мл/час — высокая (нужно больше электролитов!)

«Солёный» пот (белые разводы на одежде):
• Концентрация натрия >1000 мг/л — «солёный потер»
• Нужно БОЛЬШЕ натрия во время тренировки
• Обычно генетическая особенность

💊 ПРОТОКОЛ ЭЛЕКТРОЛИТОВ:
ДО тренировки (30-60 мин):
• 300-500 мл воды + 300-500 мг натрия
• Помогает «предзагрузить» гидратацию
• Щепотка гималайской соли в воде

ВО ВРЕМЯ тренировки:
• Каждые 15-20 мин: 150-250 мл жидкости
• При тренировке <60 мин: просто вода
• При тренировке >60 мин: изотоник (натрий + углеводы)
• Домашний изотоник: 1 л воды + 1/4 чл соли + 2 ст.л. мёда + лимонный сок

ПОСЛЕ тренировки:
• 150% от потерянного веса в течение 2-4 часов
• Потерял 1 кг → выпить 1.5 л с электролитами
• Солёная еда + вода = натуральное восполнение

🍽 ПРОДУКТЫ-ИСТОЧНИКИ ЭЛЕКТРОЛИТОВ:
Натрий: солёная рыба, квашеная капуста, сыр, маринады
Калий: бананы (422 мг), картофель (926 мг), авокадо (485 мг)
Магний: тыквенные семечки (262 мг), тёмный шоколад, шпинат
Кальций: молочные продукты, кунжут, сардины

⚠️ ПРИЗНАКИ ДИСБАЛАНСА:
Дефицит натрия: головокружение, тошнота, спутанность, мышечные судороги
Дефицит калия: слабость, аритмия, спазмы, запор
Дефицит магния: судороги (особенно ночью), тремор, бессонница
Гипонатриемия (опасно!): пьёте СЛИШКОМ много воды без натрия — отёк мозга
`;
}
export function getPreWorkoutSupplementScience(message: string): string {
  const keywords = ['предтреник', 'предтрен', 'pre-workout', 'preworkout', 'бустер', 'энергетик тренировк', 'перед тренировкой добавк', 'накачка', 'pump', 'NO2', 'оксид азота спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💥 ПРЕДТРЕНИРОВОЧНЫЕ ДОБАВКИ — НАУЧНЫЙ РАЗБОР:

🔬 КОМПОНЕНТЫ С ДОКАЗАННОЙ ЭФФЕКТИВНОСТЬЮ:

1. КОФЕИН — главный активный ингредиент
   • Дозировка: 3-6 мг/кг (для 80 кг = 240-480 мг)
   • Эффект: +3-5% сила, +4-6% выносливость, фокус
   • Принимать: за 30-60 мин до тренировки
   • Толерантность: циклировать 2 недели on / 1 неделя off
   • Не позже 14:00 при проблемах со сном

2. ЦИТРУЛЛИН — пампинг и выносливость
   • L-цитруллин: 6-8 г (НЕ цитруллин малат 2:1!)
   • Конвертируется в аргинин → оксид азота → вазодилатация
   • Эффект: +пампинг, -усталость, +кровоток к мышцам
   • Принимать: за 30-60 мин

3. БЕТА-АЛАНИН — буфер молочной кислоты
   • 3.2-6.4 г/день (накопительный эффект, 4+ недели)
   • Покалывание (парестезия) — безвредный побочный эффект
   • Эффект: +выносливость в 60-240 сек подходах
   • Можно разделить на 2-3 приёма в день

4. КРЕАТИН — не предтреник, но часто в составе
   • 3-5 г/день каждый день (не привязан к тренировке)
   • Работает через насыщение — принимать ежедневно

⚠️ КОМПОНЕНТЫ-ПУСТЫШКИ (маркетинг):
• BCAA / EAA в предтренике — бессмысленно, если ели белок
• Аргинин — плохо усваивается, цитруллин лучше
• Трибулус — не повышает тестостерон
• «Проприетарные смеси» — скрывают дозировки (красный флаг!)
• Агматин — недостаточно доказательств
• Нооботропные добавки — часто в неэффективных дозах

🧪 ДОМАШНИЙ ПРЕДТРЕНИК (эффективно и дёшево):
• Кофеин 200-300 мг (таблетки или крепкий кофе)
• L-цитруллин 6 г (порошок)
• Бета-аланин 3.2 г (порошок)
• Соль — 1/4 чл (натрий = пампинг и гидратация)
Стоимость: ~15-20 руб за порцию vs 50-80 руб за готовый

📋 КОГДА НЕ НУЖЕН ПРЕДТРЕНИК:
• Тренировка после 16:00 (кофеин нарушит сон)
• При тревожности / повышенном давлении
• При зависимости от кофеина (>4 чашек/день)
• Если и без него тренируетесь продуктивно
• Лучшая «добавка» перед тренировкой: нормальный сон + еда за 2 часа
`;
}
export function getOmega3FishOilCompleteMastery(message: string): string {
  const keywords = ['омега-3 подробн', 'omega-3 detail', 'рыбий жир полн', 'epa dha подробн', 'рыбий жир дозировк', 'omega 3 как выбрать', 'омега жирные кислоты', 'fish oil guide'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🐟 ОМЕГА-3 И РЫБИЙ ЖИР — ПОЛНОЕ РУКОВОДСТВО:

🔬 EPA vs DHA — РАЗНЫЕ ФУНКЦИИ:
EPA (эйкозапентаеновая):
• Мощный противовоспалительный эффект
• Снижает маркеры воспаления (CRP, IL-6) на 20-30%
• Улучшает настроение (антидепрессивный эффект)
• Здоровье сердечно-сосудистой системы
• Предпочтительно: для атлетов с высоким воспалением

DHA (докозагексаеновая):
• Основа мембран нейронов (20% мозга = DHA)
• Когнитивные функции, память, внимание
• Здоровье сетчатки глаз
• Триглицериды в крови снижает эффективнее EPA
• Предпочтительно: для когнитивных функций

📊 ДОЗИРОВКИ ДЛЯ СПОРТСМЕНОВ:
• Общая рекомендация: 2-3 г EPA+DHA в день
• Для противовоспалительного эффекта: EPA 2 г + DHA 1 г
• Для когнитивных функций: DHA 1-2 г + EPA 1 г
• Для сердца: EPA+DHA суммарно 2 г
• Максимум безопасно: до 5 г EPA+DHA/день

💊 КАК ВЫБРАТЬ РЫБИЙ ЖИР:
Форма:
1. Триглицеридная (TG) — натуральная, усвоение +70% vs EE
2. Этиловых эфиров (EE) — дешевле, но хуже усваивается
3. Фосфолипидная (из криля) — хорошо, но дорого

Проверить на этикетке:
• Содержание EPA+DHA на КАПСУЛУ (не «рыбий жир», а именно EPA+DHA)
• Если 1000 мг рыбьего жира, а EPA+DHA = 300 мг — это плохой продукт
• Хороший: EPA+DHA ≥ 60% от массы капсулы
• IFOS сертификация — гарантия чистоты от тяжёлых металлов

⏰ ПРИЁМ:
• С жирной пищей — усвоение выше в 3 раза
• Разделить на 2 приёма (утро + вечер)
• Хранить в холодильнике после вскрытия
• Срок: 3 месяца после вскрытия (окисление)
• Если «рыбная отрыжка» — принимать замороженными или перед едой

🍽 ПРОДУКТЫ-ИСТОЧНИКИ:
• Скумбрия: 2.5 г EPA+DHA / 100 г
• Лосось: 2.0 г / 100 г
• Сельдь: 1.7 г / 100 г
• Сардины: 1.5 г / 100 г
• Тунец: 0.7 г / 100 г
• Льняное масло: ALA (конверсия в EPA <5%) — НЕ замена рыбе

⚠️ ВЗАИМОДЕЙСТВИЯ:
• Разжижает кровь — осторожно с антикоагулянтами
• Перед операцией: прекратить за 7-10 дней
• Витамин E (400 МЕ) — защищает от окисления омега-3
• НЕ принимать с высокими дозами витамина A (в масле печени трески есть!)
`;
}
export function getIronAbsorptionAthleteGuide(message: string): string {
  const keywords = ['железо усвоение', 'iron absorption', 'анемия спорт', 'ферритин', 'гемоглобин низк', 'железодефицит', 'iron deficiency', 'гемовое железо', 'железо дозировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🩸 ЖЕЛЕЗО ДЛЯ СПОРТСМЕНОВ — УСВОЕНИЕ И ОПТИМИЗАЦИЯ:

🔬 ПОЧЕМУ ЖЕЛЕЗО КРИТИЧНО:
• Гемоглобин — транспорт кислорода к мышцам
• Миоглобин — запас кислорода В мышцах
• Цитохромы — митохондриальная энергетика
• Дефицит → усталость, снижение VO2max на 10-20%, слабость
• Спортсмены теряют железо: пот (0.3-0.5 мг/л), ЖКТ, гемолиз стоп

📊 НОРМЫ ДЛЯ СПОРТСМЕНОВ:
• Ферритин: оптимум 40-100 нг/мл (не просто «в пределах нормы»)
• Гемоглобин: мужчины 14-18 г/дл, женщины 12-16 г/дл
• Ферритин <30 нг/мл = скрытый дефицит (даже если гемоглобин в норме!)
• Ферритин <15 нг/мл = дефицит, нужна коррекция
• Женщины-спортсменки: 30-50% имеют дефицит (менструации + тренировки)

🍽 ИСТОЧНИКИ ЖЕЛЕЗА:

Гемовое железо (из животных, усвоение 15-35%):
• Печень говяжья: 6.9 мг / 100 г (ЛУЧШИЙ источник)
• Говядина: 2.7 мг / 100 г
• Индейка (тёмное мясо): 2.3 мг / 100 г
• Скумбрия: 1.0 мг / 100 г

Негемовое железо (из растений, усвоение 2-20%):
• Чечевица: 3.3 мг / 100 г (варёная)
• Шпинат: 2.7 мг / 100 г (но оксалаты мешают!)
• Тыквенные семечки: 8.8 мг / 100 г
• Тофу: 5.4 мг / 100 г

⚡ УСИЛИТЕЛИ УСВОЕНИЯ:
• Витамин C — увеличивает усвоение негемового железа в 3-6 раз!
  (75 мг витамина C + железо = оптимально)
• Мясо/рыба — «мясной фактор» улучшает усвоение растительного железа
• Кислая среда — лимонный сок, квашеная капуста
• Готовка в чугунной посуде — железо переходит в пищу

🚫 ИНГИБИТОРЫ УСВОЕНИЯ:
• Кофе/чай: танины снижают усвоение на 60-90% — пить ЧЕРЕЗ 1-2 часа после еды!
• Молочные продукты: кальций конкурирует с железом
• Фитаты (злаки, бобовые): замачивание/проращивание снижает фитаты
• Антациды: снижают кислотность → хуже усвоение
• Добавки кальция/цинка: принимать в РАЗНОЕ время с железом

💊 ДОБАВКИ:
• Бисглицинат железа — лучшая форма (мало побочек, хорошее усвоение)
• Принимать натощак или с витамином C
• Дозировка при дефиците: 25-50 мг элементарного железа
• Контроль ферритина через 3 месяца
• НЕ принимать без анализа — избыток железа ТОКСИЧЕН
`;
}
export function getVitaminB6AthleteGuide(message: string): string {
  const keywords = ['витамин b6', 'витамин б6', 'пиридоксин', 'pyridoxine', 'b6 спорт', 'b6 тренировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💊 ВИТАМИН B6 (ПИРИДОКСИН) ДЛЯ СПОРТСМЕНОВ:

🔬 ФУНКЦИИ В ОРГАНИЗМЕ АТЛЕТА:
• Метаболизм аминокислот — кофактор 100+ ферментов
• Синтез нейромедиаторов: серотонин, дофамин, ГАМК, норадреналин
• Гликогенолиз — высвобождение глюкозы из гликогена
• Синтез гемоглобина — транспорт кислорода
• Иммунная функция — производство лимфоцитов
• Конверсия триптофана в ниацин (B3)

📊 ПОТРЕБНОСТЬ:
• РНП: 1.3-1.7 мг/день
• Спортсмены: 2-5 мг/день (повышенный метаболизм белка)
• Верхний безопасный предел: 100 мг/день
• >200 мг/день хронически → нейропатия (покалывание конечностей)!

🍽 ИСТОЧНИКИ:
• Куриная грудка: 0.5 мг / 100 г
• Лосось: 0.6 мг / 100 г
• Картофель: 0.4 мг / 100 г
• Бананы: 0.4 мг / штука
• Нут: 0.5 мг / 100 г (варёный)
• Подсолнечные семечки: 0.8 мг / 100 г

⚡ СИНЕРГИИ:
• B6 + цинк — синтез тестостерона (ZMA формула)
• B6 + магний — магний лучше усваивается с B6
• B6 + B12 + фолат — снижение гомоцистеина
• B6 как часть B-комплекса — самый разумный приём

⚠️ ПРИЗНАКИ ДЕФИЦИТА:
• Трещины в уголках рта (хейлит)
• Дерматит, себорея
• Анемия микроцитарная
• Раздражительность, бессонница
• Мышечные подёргивания
`;
}
export function getMagnesiumGlycinateAthleteUse(message: string): string {
  const keywords = ['магний глицинат', 'magnesium glycinate', 'магний для сна', 'магний вечер', 'magnesium sleep', 'магний какой лучше', 'магний биглицинат', 'магний хелат'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💤 МАГНИЙ ГЛИЦИНАТ — ЛУЧШАЯ ФОРМА ДЛЯ СПОРТСМЕНОВ:

🔬 ПОЧЕМУ ГЛИЦИНАТ:
• Хелатная форма: магний + 2 молекулы глицина
• Усвоение: 80-90% (vs 4% у оксида!)
• Глицин САМПО является нейромедиатором (тормозным)
• Двойное действие: магний + глицин → расслабление и сон
• Минимум побочек: НЕ вызывает диарею (в отличие от цитрата)

📊 СРАВНЕНИЕ ФОРМ:
Глицинат (бисглицинат): ★★★★★ — сон, мышцы, без побочек
Таурат: ★★★★☆ — сердце, давление
Треонат (L-threonate): ★★★★☆ — мозг, когнитивные функции
Цитрат: ★★★☆☆ — хорошее усвоение, но может слабить
Малат: ★★★☆☆ — энергия, мышечная боль
Оксид: ★☆☆☆☆ — слабительное, почти не усваивается

💊 ДОЗИРОВКА:
• Базовая: 200-400 мг элементарного магния в день
• Спортсмены: 400-600 мг (повышенный расход)
• Перед сном: 300-400 мг за 30-60 мин
• Начать с 200 мг и увеличивать постепенно
• ВНИМАНИЕ: на этикетке «магний глицинат 1000 мг» может содержать только 100 мг ЭЛЕМЕНТАРНОГО магния — читайте состав!

⏰ КОГДА ПРИНИМАТЬ:
• Для сна: за 30-60 мин до сна
• Для мышц (судороги): разделить на 2 приёма (утро + вечер)
• Для восстановления: после тренировки + перед сном
• С едой: можно, слегка замедляет усвоение, но лучше переносится

⚡ ЭФФЕКТЫ ДЛЯ АТЛЕТА:
• Качество сна: засыпание быстрее, глубокий сон дольше
• Мышечные судороги: устранение в течение 1-2 недель
• Восстановление: снижение DOMS
• Тестостерон: магний поддерживает уровень свободного T
• Стресс: снижение кортизола (антагонист стресса)
• Инсулиновая чувствительность: улучшение утилизации глюкозы

⚠️ ВЗАИМОДЕЙСТВИЯ:
• С цинком: ОТЛИЧНО (ZMA = цинк + магний + B6)
• С витамином D: магний нужен для АКТИВАЦИИ D3
• С кальцием: принимать в РАЗНОЕ время (конкуренция)
• С антибиотиками: разделить приём на 2 часа
`;
}
export function getVitaminAAthleteGuide(message: string): string {
  const keywords = ['витамин а', 'vitamin a', 'ретинол', 'retinol', 'каротин', 'бета-каротин', 'зрение спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🥕 ВИТАМИН А ДЛЯ СПОРТСМЕНОВ:

📊 Формы и биодоступность:
• **Ретинол (животный)**: печень, яйца, молочные — усвоение 70-90%
• **Бета-каротин (растительный)**: морковь, тыква, шпинат — конверсия 10-20% в ретинол
• РСН: мужчины 900 мкг RAE, женщины 700 мкг RAE
• Спортсмены: 1000-1500 мкг RAE (повышенный оксидативный стресс)

🏋️ Функции в спорте:
1. **Иммунная защита** — барьерная функция слизистых (дыхательные пути, ЖКТ)
2. **Зрение** — родопсин для адаптации к свету (важно для зальных тренировок)
3. **Синтез белка** — участвует в экспрессии генов мышечного роста
4. **Антиоксидант** — защита мембран от перекисного окисления
5. **Репродуктивное здоровье** — синтез тестостерона

⚠️ Дозировки и безопасность:
- Верхний допустимый: 3000 мкг RAE/день (риск гепатотоксичности)
- Бета-каротин безопаснее — организм конвертирует по потребности
- Не сочетать высокие дозы с алкоголем (нагрузка на печень)
- Лучшие источники: печень трески (1 ст.л. = 1400 мкг), морковь, батат, шпинат

💡 Для спортсмена достаточно: 100г печени 2 раза/нед + ежедневно оранжевые/зелёные овощи.
`;
}
export function getVitaminCTimingScience(message: string): string {
  const keywords = ['витамин с тайминг', 'vitamin c timing', 'аскорбинка когда', 'витамин с до тренировки', 'витамин с доза'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍊 ВИТАМИН С — ТАЙМИНГ И ДОЗИРОВАНИЕ ДЛЯ СПОРТСМЕНОВ:

📊 Двойственная роль:
• Антиоксидант → защита от оксидативного стресса
• НО: избыток антиоксидантов ПОСЛЕ тренировки может блокировать адаптацию
• Исследования: >1000мг витамина С сразу после тренировки снижает сигналы для гипертрофии

📋 Оптимальный тайминг:
| Время | Доза | Обоснование |
|-------|------|-------------|
| Утром с едой | 250-500 мг | Базовая доза, иммунитет |
| За 2-3ч ДО тренировки | 200-500 мг | Защита, не мешает адаптации |
| Сразу ПОСЛЕ тренировки | ❌ НЕ принимать | Может блокировать ROS-сигнализацию |
| Через 3-4ч после | ✅ Можно | Сигнализация завершена |
| Перед сном | 200-500 мг | Синтез коллагена (ночью) |

📊 Дозировки:
- Минимальная: 200 мг/день (насыщение плазмы)
- Оптимальная для спортсменов: 500-1000 мг/день
- При простуде: 1000-2000 мг/день (разделить на 3-4 приёма)
- Верхний предел: 2000 мг/день (больше → ЖКТ-проблемы, оксалаты)

🥝 Лучшие пищевые источники:
- Шиповник (1200 мг/100г), чёрная смородина (200 мг), болгарский перец (150 мг)
- Киви (93 мг), апельсин (53 мг), брокколи (89 мг)

💡 Правило: витамин С — утром и вечером, но НЕ в первые 2 часа после тренировки.
`;
}
export function getProbioticStrainsAthlete(message: string): string {
  const keywords = ['пробиотик штамм', 'probiotic strain', 'лактобактерии', 'бифидобактерии', 'какой пробиотик', 'кишечник спорт'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦠 ШТАММЫ ПРОБИОТИКОВ ДЛЯ СПОРТСМЕНОВ:

📊 Зачем спортсмену пробиотики:
• Интенсивные тренировки ↑ проницаемость кишечника
• 70% иммунной системы — в кишечнике
• Лучшее усвоение нутриентов (белок, минералы)
• Снижение воспаления и ускорение восстановления

📋 Лучшие штаммы по задачам:

**Иммунитет (снижение ОРВИ на 30-50%):**
• Lactobacillus rhamnosus GG — самый изученный
• Lactobacillus plantarum — снижение воспаления
• Доза: 10-20 млрд КОЕ/день

**Пищеварение и усвоение белка:**
• Lactobacillus acidophilus — расщепление лактозы
• Bifidobacterium longum — усвоение минералов
• Bacillus coagulans GBI-30 — выживает в желудочной кислоте
• Доза: 5-10 млрд КОЕ/день

**Восстановление и воспаление:**
• Lactobacillus casei Shirota — снижение кортизола
• Bifidobacterium breve — антиоксидантная защита
• Доза: 10 млрд КОЕ/день

📋 Практические советы:
- Принимай с едой (выживаемость ↑)
- Курс: минимум 4-8 недель для эффекта
- Пребиотики (клетчатка) обязательны — «еда» для пробиотиков
- Натуральные источники: кефир, квашеная капуста, кимчи, йогурт

⚠️ Не все пробиотики одинаковы. Дешёвые аптечные часто содержат «мёртвые» бактерии.
`;
}
export function getVitaminKBoneAthlete(message: string): string {
  const keywords = ['витамин к', 'vitamin k', 'менахинон', 'филлохинон', 'k2 mk7', 'свёртываемость крови'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 ВИТАМИН К ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

📊 Две формы витамина К:
• **K1 (филлохинон)**: зелёные листовые овощи → свёртываемость крови
• **K2 (менахинон)**: ферментированные продукты → кости + сосуды
  - MK-4: мясо, яйца, молоко (короткий период полураспада)
  - MK-7: натто, квашеная капуста (длинный период, эффективнее)

🏋️ Зачем спортсмену:
1. **Кости**: K2 активирует остеокальцин → кальций идёт В кости
2. **Сосуды**: K2 активирует MGP → кальций НЕ откладывается в артериях
3. **Суставы**: K2 может замедлять разрушение хряща
4. **Свёртываемость**: K1 — правильная свёртываемость (важно при травмах)
5. **Воспаление**: K2 модулирует воспалительные пути

📋 Дозировки:
- K1: 90-120 мкг/день (из еды — обычно достаточно)
- K2 (MK-7): 100-200 мкг/день (добавка рекомендуется)
- Верхний предел: не установлен для K1/K2 (низкая токсичность)

🥬 Источники K1 (на 100г):
- Шпинат — 483 мкг, брокколи — 102 мкг, капуста — 76 мкг

🫘 Источники K2:
- Натто (100г) — 1000+ мкг MK-7, твёрдый сыр — 76 мкг MK-4
- Яичный желток — 32 мкг MK-4

⚠️ Взаимодействия:
- Антикоагулянты (варфарин) — витамин К ПРОТИВОПОКАЗАН без врача
- Витамин D + K2 = синергия (D помогает усвоить кальций, K2 направляет его в кости)
- Жирорастворимый → принимай с жирной пищей
`;
}
export function getElectrolyteBalanceComplete(message: string): string {
  const keywords = ['электролиты баланс', 'натрий калий', 'судороги тренировка', 'потеря солей', 'electrolyte balance', 'гипонатриемия', 'потоотделение'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
⚡ ЭЛЕКТРОЛИТНЫЙ БАЛАНС — ПОЛНОЕ РУКОВОДСТВО:

Электролиты — минералы с электрическим зарядом, критичные для мышечных сокращений, нервных импульсов и гидратации.

🔬 Ключевые электролиты для спортсмена:

| Электролит | Функция | Потеря с потом (мг/л) | Суточная норма |
|-----------|---------|----------------------|----------------|
| Натрий (Na+) | Баланс жидкости | 200-1600 | 2000-3000 мг |
| Калий (K+) | Сокращение мышц | 120-600 | 3500-4700 мг |
| Магний (Mg2+) | Расслабление мышц | 1-12 | 400-500 мг |
| Кальций (Ca2+) | Нервные импульсы | 4-60 | 1000-1200 мг |
| Хлорид (Cl-) | pH баланс | 300-2400 | 2300 мг |

💧 Потери при тренировке:
- Лёгкая (30 мин): 300-500 мл пота → 150-800 мг натрия
- Средняя (60 мин): 500-1000 мл → 500-1600 мг натрия
- Интенсивная (90+ мин): 1000-2500 мл → 1000-4000 мг натрия

⚠️ Признаки дисбаланса:
- **Нехватка натрия:** головокружение, тошнота, спутанность сознания
- **Нехватка калия:** слабость, аритмия, судороги
- **Нехватка магния:** судороги, тремор, бессонница
- **Гипонатриемия** (опасно!): возникает при чрезмерном потреблении воды БЕЗ соли

🥤 Как восполнять:

**До тренировки (за 2 часа):**
- 500 мл воды + щепотка соли (500 мг натрия)

**Во время тренировки (каждые 15-20 мин):**
- 150-200 мл изотоника или подсоленной воды
- Рецепт: 1 л воды + 1/4 ч.л. соли + 2 ст.л. мёда + сок лимона

**После тренировки:**
- Вода с электролитами или минералка (Ессентуки-4, Нарзан)
- Банан (калий) + солёные орешки (натрий)

📋 Натуральные источники:
- **Натрий:** соль, квашеная капуста, сыр, оливки
- **Калий:** бананы, авокадо, картофель, шпинат, курага
- **Магний:** тыквенные семечки, миндаль, тёмный шоколад
- **Кальций:** творог, кефир, сардины, кунжут
`;
}
export function getCollagenSupplementGuide(message: string): string {
  const keywords = ['коллаген', 'collagen', 'коллаген суставы', 'гидролизат коллагена', 'желатин суставы', 'коллаген для связок'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🦴 КОЛЛАГЕН ДЛЯ СПОРТСМЕНОВ — ПОЛНОЕ РУКОВОДСТВО:

Коллаген — самый распространённый белок в организме (30% от всех белков). Ключевой для суставов, связок, сухожилий, кожи.

🔬 Типы коллагена:
- **Тип I** (90% всего коллагена) — кожа, кости, сухожилия, связки
- **Тип II** — хрящевая ткань (суставы)
- **Тип III** — кровеносные сосуды, мышцы, органы
- **Тип V** — плацента, клеточные поверхности

📊 Что говорит наука:
- **Суставы:** мета-анализ (2019): 10 г коллагена/день → снижение боли в суставах на 20-30%
- **Сухожилия:** приём 15 г желатина + витамин C за 1 час до тренировки → ↑ синтез коллагена в 2 раза
- **Восстановление:** ускорение заживления связок на 15-25%
- **Мышцы:** 15 г коллагена после силовой → ↑ мышечной массы (у пожилых)

💊 Формы коллагена:

| Форма | Усвоение | Дозировка | Цена |
|-------|----------|-----------|------|
| Гидролизат | 90-95% | 10-15 г | Средняя |
| Желатин | 80-85% | 15-20 г | Низкая |
| Нативный (UC-II) | Иммунная модуляция | 40 мг | Высокая |
| Костный бульон | 60-70% | 500 мл | Низкая |

📋 Как принимать:
1. **Дозировка:** 10-15 г гидролизата или 15-20 г желатина в день
2. **Время:** за 30-60 мин до тренировки ИЛИ перед сном
3. **Обязательно с витамином C** (50-100 мг) — без него синтез коллагена невозможен!
4. **Курс:** минимум 3 месяца (соединительная ткань обновляется медленно)
5. **Натощак** (для лучшего усвоения)

🍲 Натуральные источники:
- Костный бульон (6-12 часов варки) — лучший источник
- Желе, холодец, заливное
- Хрящи, куриные лапки, свиные уши
- Рыба с кожей (лосось, скумбрия)

⚠️ Кому особенно нужен:
- Спортсмены с болями в суставах
- После травм связок/сухожилий
- При высоком объёме бега (колени, ахилл)
- Возраст 30+ (синтез коллагена снижается на 1-1.5%/год)
- Тяжелоатлеты (нагрузка на суставы)
`;
}
export function getIronDeficiencyAdvanced(message: string): string {
  const keywords = ['дефицит железа продвинутый', 'iron deficiency advanced', 'ферритин спорт', 'анемия спортсмен', 'железо бегуны', 'гемоглобин низкий'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🩸 ДЕФИЦИТ ЖЕЛЕЗА У СПОРТСМЕНОВ — ПРОДВИНУТЫЙ ГАЙД:

Спортсмены теряют железо быстрее обычных людей: через пот, ЖКТ, разрушение эритроцитов при ударных нагрузках (foot-strike hemolysis).

🔬 Метаболизм железа у спортсмена:
- **Гепсидин** — гормон, блокирующий всасывание железа. После тренировки ↑ на 3-6 часов!
- **Foot-strike hemolysis** — разрушение эритроцитов при беге (удары стоп)
- **Потери с потом:** 0.3-0.5 мг/л пота
- **ЖКТ-кровотечения:** НПВС (ибупрофен) ↑ риск микрокровотечений

📊 Нормы для спортсменов (строже, чем для населения):
| Показатель | Обычная норма | Для спортсмена | Оптимум |
|-----------|--------------|----------------|---------|
| Ферритин | 15-200 нг/мл | >30 нг/мл | 50-100 нг/мл |
| Гемоглобин (М) | 130-170 г/л | >140 г/л | 150-160 г/л |
| Гемоглобин (Ж) | 120-150 г/л | >130 г/л | 135-145 г/л |
| Трансферрин | 20-50% | >25% | 30-45% |

⚠️ Стадии дефицита:
1. **Прелатентный** — ферритин ↓ (<30), гемоглобин в норме → усталость, ↓ выносливости
2. **Латентный** — ферритин <15, трансферрин ↓ → значительное ↓ производительности
3. **Анемия** — гемоглобин ↓ → одышка, тахикардия, невозможность тренироваться

🍖 Источники железа:

**Гемовое (животное, усвоение 15-35%):**
- Говяжья печень: 6.5 мг/100г
- Говядина: 2.7 мг/100г
- Индейка тёмное мясо: 2.3 мг/100г
- Морепродукты (устрицы, мидии): 3-5 мг/100г

**Негемовое (растительное, усвоение 2-20%):**
- Чечевица: 3.3 мг/100г
- Шпинат: 2.7 мг/100г
- Тыквенные семечки: 8.8 мг/100г
- Тофу: 5.4 мг/100г

📋 Стратегия восполнения:
1. **Витамин C** вместе с железом — усвоение ↑ в 2-3 раза
2. **Избегай** кофе/чай за 1 час до/после приёма железа (танины ↓ усвоение на 60%)
3. **Избегай** кальций одновременно с железом
4. **Принимай добавки** через 3-6 часов после тренировки (когда гепсидин снижается)
5. **Готовь в чугунной посуде** — железо переходит в пищу

💊 Добавки (при ферритине <30):
- Бисглицинат железа: 25-50 мг/день (лучшая переносимость)
- Через день (не каждый день!) — усвоение выше
- Курс: 3-6 месяцев, контроль ферритина каждые 2 месяца
`;
}
export function getVitaminECompleteGuide(message: string): string {
  const keywords = ['витамин е полный', 'vitamin e complete', 'токоферол спорт', 'витамин е антиоксидант спорт', 'витамин e дозировка'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🌿 ВИТАМИН E ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

Витамин E — жирорастворимый антиоксидант, защищающий клеточные мембраны от окислительного повреждения.

🔬 Формы витамина E:
- **Альфа-токоферол** — основная форма, 90% в плазме крови
- **Гамма-токоферол** — мощный противовоспалительный
- **Токотриенолы** — в 40-60 раз мощнее токоферолов как антиоксиданты
- Всего 8 форм: 4 токоферола (α, β, γ, δ) + 4 токотриенола

📊 Роль в спорте:
- **Защита мембран** — при тренировке ↑ свободные радикалы, витамин E нейтрализует их
- **Восстановление мышц** — ↓ маркеры повреждения (креатинкиназа) на 15-20%
- **Иммунитет** — модулирует T-клетки, ↑ иммунный ответ
- **Кровообращение** — ↓ агрегация тромбоцитов, улучшает кровоток

⚠️ Важный нюанс для спортсменов:
- Высокие дозы (>400 МЕ/день) могут БЛОКИРОВАТЬ адаптацию к тренировкам!
- Свободные радикалы — не только «вредные»: они — сигнал для адаптации мышц
- Исследование (Paulsen, 2014): 1000 МЕ витамина E + C → ↓ прирост силы на 10%
- **Вывод:** не мегадозируй, получай из пищи

📋 Дозировки:
| Категория | Дозировка | Источник |
|-----------|-----------|----------|
| Обычный приём | 15-30 мг (22-45 МЕ) | Пища |
| Спортсмен | 100-200 МЕ | Пища + добавка |
| Максимум | 400 МЕ | Только кратковременно |
| Опасно | >800 МЕ | Повышает смертность! |

🥜 Лучшие пищевые источники:
- Миндаль: 7.3 мг/30г (50% дневной нормы)
- Семечки подсолнечника: 7.4 мг/30г
- Авокадо: 2.1 мг/100г
- Оливковое масло: 1.9 мг/ст.л.
- Шпинат: 1.9 мг/100г (приготовленный)
- Красный перец: 1.6 мг/100г

💡 Рекомендация:
- Получай витамин E из пищи (орехи, семечки, масла)
- Добавки — только при подтверждённом дефиците
- Принимай с жирной пищей (жирорастворимый)
- Комбинируй с витамином C (регенерация витамина E)
`;
}
export function getZincTestosteroneComplete(message: string): string {
  const keywords = ['цинк тестостерон полный', 'zinc testosterone complete', 'цинк для мужчин спорт', 'дефицит цинка спортсмен', 'цинк дозировка спорт'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
⚡ ЦИНК И ТЕСТОСТЕРОН — ПОЛНОЕ РУКОВОДСТВО:

Цинк — второй по распространённости микроэлемент в организме. Критичен для выработки тестостерона, иммунитета и восстановления.

🔬 Механизм влияния на тестостерон:
- Цинк — кофактор фермента 5α-редуктазы (конвертирует тестостерон в ДГТ)
- Ингибирует ароматазу (↓ конвертация тестостерона в эстроген)
- Необходим для синтеза ЛГ (лютеинизирующий гормон → стимулирует яички)
- Дефицит цинка → тестостерон ↓ на 30-50% (Prasad, 1996)

📊 Потребность и потери у спортсменов:
- Суточная норма: 11 мг (мужчины), 8 мг (женщины)
- Спортсмены: 15-25 мг (↑ потери с потом и мочой)
- Потери с потом: 0.5-1.0 мг/л (за час тренировки — до 1.5 мг)
- Потери с мочой после тренировки: ↑ на 10-15%
- 30-40% спортсменов имеют субоптимальный уровень цинка

📋 Признаки дефицита:
- ↓ тестостерон (усталость, ↓ либидо, ↓ мышечная масса)
- ↓ иммунитет (частые простуды)
- Медленное заживление ран
- Потеря аппетита
- Ухудшение вкуса и обоняния
- Ломкость ногтей, выпадение волос

🥩 Лучшие пищевые источники:
- **Устрицы:** 74 мг/100г (абсолютный рекордсмен!)
- **Говядина:** 4.8 мг/100г
- **Тыквенные семечки:** 7.8 мг/100г
- **Чечевица:** 3.3 мг/100г
- **Кешью:** 5.6 мг/100г
- **Индейка:** 3.1 мг/100г
- **Яйца:** 1.3 мг/шт
- **Тёмный шоколад:** 3.3 мг/100г

💊 Добавки:
| Форма | Биодоступность | Дозировка | Побочки |
|-------|---------------|-----------|---------|
| Пиколинат цинка | Высокая | 15-30 мг | Минимальные |
| Цитрат цинка | Высокая | 15-30 мг | Минимальные |
| Глюконат цинка | Средняя | 20-40 мг | Тошнота |
| Оксид цинка | Низкая | НЕ рекомендуется | ЖКТ |
| ZMA (цинк+магний+B6) | Средняя | 30 мг цинка | Минимальные |

⚠️ Важные правила:
- Принимай на пустой желудок (или с белковой едой)
- НЕ принимай с кальцием, железом, кофе (↓ усвоение)
- Не превышай 40 мг/день (↑ дозы → дефицит меди!)
- Курс: 2-3 месяца, затем перерыв или снижение дозы
- Лучшее время: вечером, перед сном (↑ восстановление)
`;
}
export function getPreWorkoutMealScience(message: string): string {
  const keywords = ['еда перед тренировкой наука', 'pre workout meal science', 'что есть перед тренировкой', 'питание перед силовой', 'перекус до тренировки'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🍽️ ПИТАНИЕ ПЕРЕД ТРЕНИРОВКОЙ — НАУЧНЫЙ ПОДХОД:

Правильный приём пищи перед тренировкой ↑ производительность на 10-15%, ↑ выносливость и ↓ разрушение мышц.

🔬 Цели предтренировочного питания:
- Максимизировать запасы гликогена → ↑ энергия
- Обеспечить аминокислоты → ↓ катаболизм, ↑ синтез белка
- Предотвратить голод и гипогликемию
- Избежать дискомфорта ЖКТ

📊 Тайминг и объём:

| Время до тренировки | Тип приёма | Пример |
|---------------------|-----------|---------|
| 3-4 часа | Полноценный обед | Курица + рис + овощи |
| 2-3 часа | Средний приём | Овсянка + яйца + банан |
| 1-2 часа | Лёгкий перекус | Бутерброд с индейкой, йогурт с фруктами |
| 30-60 мин | Быстрый перекус | Банан, рисовые хлебцы, протеин |
| <30 мин | Жидкость | Протеиновый коктейль, сок |

📋 Что есть — формула:

**За 2-3 часа (оптимально):**
- Белок: 20-40 г (курица, рыба, яйца, творог)
- Углеводы: 40-80 г (рис, овсянка, макароны, картофель)
- Жиры: минимум (<15 г) — замедляют усвоение
- Клетчатка: минимум — избегай вздутия

**За 1 час (если не успел поесть раньше):**
- Белок: 20 г (протеин, йогурт)
- Углеводы: 30-50 г (банан, рисовые хлебцы, мёд)
- Жиры: избегай (замедляют пищеварение)

🍌 Топ-10 продуктов перед тренировкой:
1. **Банан** — быстрые углеводы + калий
2. **Овсянка** — медленные углеводы + энергия на 2-3 часа
3. **Рис (белый)** — быстро усваивается, не вздувает
4. **Куриная грудка** — чистый белок
5. **Яйца** — полноценный белок + лейцин
6. **Йогурт** — белок + углеводы + пробиотики
7. **Тост с мёдом** — быстрая энергия
8. **Протеиновый коктейль** — быстрое усвоение
9. **Батат** — медленные углеводы + витамин A
10. **Арахисовая паста** — белок + жиры (если есть 3+ часа)

🚫 Чего избегать:
- Жирная еда (бургер, пицца) — тяжесть, медленное усвоение
- Много клетчатки (бобовые, капуста) — вздутие
- Острая еда — рефлюкс при наклонах
- Молоко (у многих — вздутие)
- Новые продукты (проверяй реакцию ЖКТ заранее)

💡 Если тренировка утром натощак:
- Минимум: 20 г BCAA/EAA + 5 г креатина + вода
- Лучше: протеиновый коктейль + банан за 30 мин
- Полноценный завтрак ПОСЛЕ тренировки (в первые 30-60 мин)
`;
}
export function getPhosphocreatineSystemGuide(message: string): string {
  const keywords = ['фосфокреатин', 'phosphocreatine', 'креатинфосфат', 'АТФ-КФ', 'атф система', 'энергообеспечение мышц', 'алактатная', 'анаэробная алактатная'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⚡ ФОСФОКРЕАТИНОВАЯ (АТФ-КФ) СИСТЕМА — МГНОВЕННАЯ ЭНЕРГИЯ:

**Три энергосистемы мышц:**
1. **АТФ-КФ (фосфокреатиновая)** — 0-10 сек:
   - Мгновенная мощность без кислорода
   - Запасы: ~5 ммоль АТФ + ~25 ммоль КФ в мышце
   - Мощность: 36 ккал/мин (максимальная!)
   - Использование: спринт, 1ПМ, прыжки, броски

2. **Гликолитическая** — 10 сек - 2 мин:
   - Расщепление гликогена → лактат
   - Мощность: 16 ккал/мин
   - Использование: подходы 8-20 повторений, бег 400м

3. **Окислительная** — 2 мин и более:
   - Жиры + углеводы + O₂ → АТФ
   - Мощность: 10 ккал/мин
   - Использование: кардио, длительные нагрузки

**Как работает фосфокреатиновая система:**
- КФ + ADP → АТФ + креатин (фермент: креатинкиназа)
- Скорость ресинтеза АТФ: 0.5-1 сек (мгновенно!)
- Полное истощение КФ: за 6-10 сек максимального усилия
- Восстановление: 50% за 30 сек, 95% за 3-5 мин

**Практическое применение для тренировок:**
- **Силовые (1-5 повторений):**
  - Отдых 3-5 мин между подходами (полное восстановление КФ)
  - Каждый подход = «свежий старт» энергетически
  - Почему силовики отдыхают долго — именно поэтому!

- **Гипертрофия (6-12 повторений):**
  - Отдых 1.5-3 мин — частичное восстановление КФ
  - Подключается гликолиз → метаболический стресс → пампинг
  - Баланс между силой и объёмным стимулом

- **Выносливость (15+ повторений):**
  - Отдых 30-90 сек — минимальное восстановление КФ
  - Преобладает гликолиз → жжение, закисление
  - Тренировка буферной ёмкости мышц

**Роль креатина (добавки):**
- ↑ запасы КФ в мышце на 20-30%
- ↑ мощность и выносливость на коротких усилиях
- 5 г/день — поддерживающая доза
- Загрузка (20 г/день × 5 дней) — быстрый эффект, но не обязательна
- Моногидрат — лучшая изученная форма
`;
}
export function getRhodiolaAdaptogenMaster(message: string): string {
  const keywords = ['родиола розовая', 'rhodiola', 'золотой корень', 'адаптоген спорт', 'розавин', 'салидрозид', 'родиола для спорта'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🌿 РОДИОЛА РОЗОВАЯ (ЗОЛОТОЙ КОРЕНЬ) — АДАПТОГЕН ДЛЯ АТЛЕТОВ:

**Что это:**
- Adaptogenic herb — Rhodiola rosea
- Традиционная российская фитотерапия (Алтай, Сибирь)
- Активные вещества: розавин (3%), салидрозид (1%)
- Категория: адаптоген (↑ сопротивляемость стрессу)

**Доказанные эффекты для атлетов:**
- **Физическая выносливость:** ↑ время до утомления на 3-7%
- **Когнитивная функция:** ↑ концентрация, ↓ ментальная усталость
- **Кортизол:** ↓ базальный уровень на 10-20% при хроническом стрессе
- **Восстановление:** ↓ время восстановления ЧСС после нагрузки
- **Настроение:** ↓ тревожность, ↑ мотивация (серотонин, дофамин)
- **VO₂max:** ↑ на 3-5% при регулярном приёме (спорно)

**Дозировка и протокол:**
- Стандартная доза: 200-600 мг/день (экстракт 3% розавина)
- Оптимально: 400 мг утром натощак
- НЕ принимать вечером (может нарушить сон — стимулирующий эффект)
- Курс: 4-8 недель → перерыв 2 недели (цикличность!)
- Эффект проявляется через 5-7 дней регулярного приёма

**Когда принимать атлету:**
- Перед соревнованиями: за 2-4 недели до старта
- В период высоких нагрузок (интенсивный цикл)
- При перетренированности / выгорании
- Зимой при недостатке солнца / сниженном настроении
- Во время сушки (↑ окисление жиров, ↓ кортизол)

**Сочетания:**
- ✅ Родиола + ашваганда — комплексная антистрессовая защита
- ✅ Родиола + кофеин — синергия для выносливости
- ✅ Родиола + креатин — безопасно, нет конфликтов
- ⚠️ Родиола + антидепрессанты СИОЗС — консультация врача!
- ❌ Родиола + стимуляторы (эфедрин) — перестимуляция

**Противопоказания:**
- Биполярное расстройство (может спровоцировать маниакальную фазу)
- Аутоиммунные заболевания (стимулирует иммунитет)
- Беременность и лактация (недостаточно данных)
- Гипертония (возможно ↑ давления при высоких дозах)
`;
}
export function getCaffeinePerformanceScience(message: string): string {
  const triggers = ['кофеин и тренировк', 'кофе перед тренировк', 'кофеин производительност', 'кофеин наука спорт', 'предтреник кофеин', 'кофеин дозировк спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[КОФЕИН И СПОРТИВНАЯ ПРОИЗВОДИТЕЛЬНОСТЬ — НАУКА]
Кофеин — наиболее изученный и эффективный легальный эргогеник (↑ производительность).

МЕХАНИЗМЫ:
- Блокада аденозиновых рецепторов A1 и A2A → ↓ восприятие усталости
- ↑ высвобождение дофамина и норадреналина → ↑ фокус, ↑ мотивация
- ↑ мобилизация жирных кислот → ↑ окисление жиров (экономия гликогена)
- ↑ внутриклеточный кальций → ↑ сила мышечного сокращения
- ↓ RPE (воспринимаемое усилие) на 5-6% при той же нагрузке

ЭФФЕКТЫ НА ТРЕНИРОВКИ:
- Сила: ↑ 1ПМ на 2-5% (мета-анализ Grgic 2018)
- Мощность: ↑ на 3-7%
- Выносливость: ↑ время до отказа на 12-15% (мета-анализ Doherty & Smith 2004)
- Спринт: ↑ пиковая мощность на 3-4%
- ↑ тренировочный объём: на 3-5 повторов больше при силовых

ОПТИМАЛЬНАЯ ДОЗИРОВКА:
- Эргогенная доза: 3-6 мг/кг массы тела (для 80кг = 240-480мг)
- Время приёма: за 30-60 минут до тренировки
- Пик концентрации в крови: через 30-75 минут после приёма
- Период полураспада: 3-7 часов (генетика CYP1A2 определяет метаболизм)
- ⚠️ >6 мг/кг: ↑ побочные эффекты без ↑ производительности (потолок)

ТОЛЕРАНТНОСТЬ И ЦИКЛИРОВАНИЕ:
- Толерантность развивается за 7-14 дней регулярного приёма
- Стратегия: 2-4 недели кофеин → 1-2 недели без → восстановление чувствительности
- Или: кофеин только в дни тяжёлых тренировок (2-3 раза/неделю)
- Полный вывод: 7-12 дней без кофеина для полного ресета рецепторов

⚠️ ОГРАНИЧЕНИЯ: не пить после 14:00 (↓ качество сна), не >600 мг/день, индивидуальная чувствительность
`;
}
export function getCreatineMonohydratScience(message: string): string {
  const triggers = ['креатин наука подробн', 'креатин моногидрат наука', 'как работает креатин', 'креатин мифы правда', 'креатин полный гайд', 'креатин безопасност'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[КРЕАТИН — ПОЛНЫЙ НАУЧНЫЙ РАЗБОР]
Креатин моногидрат — самая изученная и эффективная спортивная добавка в истории (500+ исследований).

БИОХИМИЯ:
- Креатин → фосфокреатин (PCr) в мышцах
- PCr + ADP → ATP + креатин (реакция креатинкиназы)
- Ресинтез АТФ за 2-7 секунд (анаэробная алактатная система)
- ↑ запас PCr на 20-30% → ↑ способность повторять высокоинтенсивные усилия

ДОКАЗАННЫЕ ЭФФЕКТЫ:
- ↑ сила на 5-10% (мета-анализ Lanhers 2017)
- ↑ мышечная масса на 1-2 кг за 4-12 недель (сверх тренировочного эффекта)
- ↑ мощность и спринтерская производительность на 5-15%
- ↑ восстановление между подходами
- ↑ когнитивные функции (особенно при недосыпе)
- ↓ частота сотрясений мозга у контактных атлетов (предварительные данные)
- Безопасен для почек у здоровых людей (мета-анализ >1000 участников, до 5 лет приёма)

ПРОТОКОЛ:
Загрузка (опционально): 20г/день (4×5г) × 5-7 дней → быстрое насыщение
Поддержание: 3-5г/день ЕЖЕДНЕВНО (включая дни отдыха)
Без загрузки: 5г/день → насыщение через 3-4 недели (тот же результат, медленнее)
Время приёма: не важно (любое время, с едой для лучшего усвоения)
Циклирование: НЕ нужно (нет привыкания, нет подавления эндогенного синтеза)

ФОРМЫ КРЕАТИНА:
- Моногидрат: ЕДИНСТВЕННАЯ доказанная форма. Остальные — маркетинг
- HCL, буферизованный, этиловый эфир, жидкий — НЕ превосходят моногидрат
- Micronized (микронизированный моногидрат): лучше растворяется, та же эффективность

МИФЫ:
❌ «Задерживает воду» → задержка ВНУТРИКЛЕТОЧНАЯ (в мышцах), не подкожная
❌ «Вредит почкам» → безопасен при GFR >60 (здоровые почки)
❌ «Нужно циклировать» → нет научного обоснования
❌ «Нужна загрузка» → нет, просто быстрее насыщение
`;
}
export function getCitrullineArginineSupplement(message: string): string {
  const triggers = ['цитруллин добавк', 'аргинин добавк', 'цитруллин малат', 'аргинин или цитруллин', 'NO бустер наука', 'оксид азота добавк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ЦИТРУЛЛИН И АРГИНИН — НАУКА ОКСИДА АЗОТА (NO)]
Оксид азота (NO) → вазодилатация → ↑ кровоток к мышцам → ↑ доставка нутриентов и кислорода.

ЦИТРУЛЛИН vs АРГИНИН:
- Аргинин: прямой предшественник NO (аргинин → NO + цитруллин, фермент eNOS)
- НО: 60-70% пищевого аргинина разрушается в кишечнике и печени (first-pass metabolism)
- Цитруллин: обходит печень → превращается в аргинин в почках → ↑ уровень аргинина в крови эффективнее самого аргинина!
- Цитруллин ↑ аргинин плазмы на 227% vs аргинин ↑ на 90% (Schwedhelm 2008)

ЦИТРУЛЛИН МАЛАТ (L-Citrulline Malate):
Дозировка: 6-8г за 30-60 мин до тренировки (соотношение 2:1 цитруллин:малат)
Или L-цитруллин (чистый): 3-6г

Доказанные эффекты:
- ↑ количество повторений до отказа на 12-53% (Pérez-Guisado 2010)
- ↓ DOMS (мышечная боль) на 40% через 24-48ч
- ↑ кровоток к мышцам (пампинг)
- ↑ утилизация BCAA во время тренировки
- Малат: промежуточный продукт цикла Кребса → ↑ аэробное энергопроизводство

АРГИНИН:
Дозировка: 6-10г (если выбрали аргинин вместо цитруллина)
- Менее эффективен чем цитруллин как NO-бустер
- Может вызвать ЖКТ-дискомфорт при >10г
- Единственное преимущество: дешевле

ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ:
- Первый выбор: цитруллин малат 6-8г предтрен
- Синергия: + 3-5г креатина + 3г бета-аланина = комплексный предтрен
- Без необходимости покупать дорогие «NO-бустеры» — сам цитруллин эффективнее
- Эффект накапливается за 7-14 дней регулярного приёма

⚠️ НЕ принимать с ингибиторами ФДЭ-5 (силденафил) — ↑↑ гипотензия
`;
}
export function getPreWorkoutNutritionScience(message: string): string {
  const triggers = ['питание перед тренировк', 'что есть до тренировк', 'pre workout nutrition', 'еда перед залом', 'углеводы до тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🍽️ ПИТАНИЕ ПЕРЕД ТРЕНИРОВКОЙ — НАУКА:

ЦЕЛИ ПРЕДТРЕНИРОВОЧНОГО ПРИЁМА:
1. Заполнение гликогена — топливо для высокоинтенсивной работы.
2. Обеспечение аминокислотами — снижение распада мышечного белка.
3. Гидратация — предотвращение снижения производительности.
4. Минимизация дискомфорта ЖКТ — правильный тайминг и состав.

ТАЙМИНГ:
- Большой приём (500-700 ккал): за 3-4 часа до тренировки. Полноценная еда с белком, углеводами, умеренным жиром.
- Средний приём (300-400 ккал): за 1.5-2 часа. Легкоусвояемые углеводы + белок, минимум жира и клетчатки.
- Перекус (100-200 ккал): за 30-60 мин. Быстрые углеводы (банан, белый хлеб, спортивный напиток).
- Натощак: допустимо для кардио низкой интенсивности. Для силовых — снижение производительности на 10-15%.

УГЛЕВОДЫ:
- Гликоген мышц: основное топливо при >65% МПК. Запасы: 300-500 г (1200-2000 ккал).
- При тренировке <60 мин: 1-3 г/кг за 1-4 часа до.
- При тренировке >90 мин: 1-4 г/кг за 1-4 часа + углеводы ВО ВРЕМЯ тренировки (30-60 г/час).
- Гликемический индекс: за 3-4 ч — любой. За 30-60 мин — высокий ГИ (быстрая энергия).

БЕЛОК:
- 20-40 г за 2-3 часа до тренировки — достаточно для обеспечения аминокислотами.
- Начинает МПС (мышечный синтез) ещё до начала тренировки → «окно» расширяется.

ЖИР:
- Замедляет пищеварение. За 3-4 ч — допустимо. За <1 ч — минимизировать.
- Не влияет на производительность при правильном тайминге.

ПРИМЕРЫ ПРЕДТРЕНИРОВОЧНЫХ ПРИЁМОВ:
За 3-4 ч: рис + куриная грудка + овощи (60-80 г углеводов, 30-40 г белка).
За 1.5-2 ч: овсянка на молоке + банан + ложка мёда (50-60 г углеводов, 20 г белка).
За 30-60 мин: банан + стакан сока или 30 г протеина с водой.

КОФЕИН:
- Оптимальная доза: 3-6 мг/кг за 30-60 мин до тренировки.
- Эффект: +3-5% силы, +2-4% выносливости, снижение RPE.
- Толерантность: при ежедневном употреблении эффект снижается. Циклирование: 2 нед без → 1 нед с.
`;
}
export function getHydrationElectrolyteScience(message: string): string {
  const triggers = ['гидратация тренировк', 'электролиты спорт', 'hydration electrolyte', 'сколько воды тренировк', 'потеря пота тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
💧 ГИДРАТАЦИЯ И ЭЛЕКТРОЛИТЫ ДЛЯ СПОРТСМЕНОВ:

ВЛИЯНИЕ ДЕГИДРАТАЦИИ НА ПРОИЗВОДИТЕЛЬНОСТЬ:
- -1% массы тела (пот): минимальное влияние.
- -2%: снижение выносливости на 7-10%, снижение силы на 2-3%.
- -3%: снижение мощности на 5-8%, когнитивные нарушения.
- -4%: серьёзное ухудшение всех показателей, риск теплового удара.
- Потери пота: 0.5-2.0 л/час в зависимости от интенсивности, температуры, влажности.

СТРАТЕГИЯ ГИДРАТАЦИИ:
ДО тренировки (за 2-4 часа): 5-7 мл/кг (350-500 мл для 70 кг).
ВО ВРЕМЯ тренировки: 150-250 мл каждые 15-20 минут. Не ждать жажды — жажда отстаёт от реальной потребности на 20-30 минут.
ПОСЛЕ тренировки: 150% потерянного веса. Взвешивание до/после тренировки: потеряно 1 кг → выпить 1.5 л в течение 2-4 часов.

ЭЛЕКТРОЛИТЫ:
Натрий (Na+): главный электролит пота. Потери: 300-1200 мг/л пота. При тренировке >60 мин в жару — добавлять 300-600 мг/л к воде.
Калий (K+): потери 120-300 мг/л пота. Обычно компенсируется едой (бананы, картофель).
Магний (Mg): потери 5-15 мг/л пота. При дефиците: судороги, снижение силы. Суточная норма: 400-600 мг для спортсменов.
Кальций (Ca): потери 20-60 мг/л пота. Молочные продукты / добавки.

СПОРТИВНЫЕ НАПИТКИ — КОГДА НУЖНЫ:
- Тренировка <60 мин: достаточно воды. Спортивный напиток = лишние калории.
- Тренировка 60-90 мин: вода + электролиты (без углеводов) или изотоник.
- Тренировка >90 мин: изотоник (6-8% углеводов + электролиты). 30-60 г углеводов/час.
- Жаркая погода (>30°C): электролиты нужны раньше — с 30-45 мин.

ПРИЗНАКИ ДЕГИДРАТАЦИИ:
- Тёмная моча (цвет яблочного сока или темнее).
- Редкое мочеиспускание (<4 раз/день).
- Головная боль, головокружение, усталость.
- Тест щипка кожи: если складка расправляется >2 сек — дегидратация.

ГИПОНАТРИЕМИЯ (перегидратация):
- Опасно: пить СЛИШКОМ много воды без электролитов (марафонцы, ультра).
- Разведение натрия в крови → отёк мозга. Опаснее дегидратации!
- Профилактика: не пить >800 мл/час, добавлять натрий при длительных нагрузках.
`;
}
export function getCreatineMonohydrateDeep(message: string): string {
  const triggers = ['креатин моногидрат подробно', 'креатин загрузка', 'креатин побочные', 'creatine monohydrate', 'креатин как принимать правильн'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💊 КРЕАТИН МОНОГИДРАТ — ПОЛНЫЙ ГАЙД:

**Научная база:**
- Самая изученная спортивная добавка (1000+ исследований)
- Увеличивает запасы фосфокреатина в мышцах на 20-40%
- Эффект: +5-10% к силе, +1-2 кг сухой массы за 4-8 недель
- Безопасен при длительном приёме (5+ лет исследований)

**Протоколы приёма:**
Вариант 1 — Загрузка:
- 5 г × 4 раза/день = 20 г/день × 5-7 дней
- Затем поддержка: 3-5 г/день
- Быстрое насыщение за неделю

Вариант 2 — Без загрузки (рекомендуется):
- 3-5 г/день постоянно
- Полное насыщение за 3-4 недели
- Меньше ЖКТ-дискомфорта

**Когда принимать:**
- Время дня не критично (накопительный эффект)
- С углеводами или белком — улучшает усвоение (инсулин помогает транспорту)
- Можно с постренировочным коктейлем
- Ежедневно, включая дни без тренировок

**Побочные эффекты:**
- Задержка воды: +1-2 кг в первые недели (внутриклеточная, не отёки)
- ЖКТ: при больших дозах — перейти на меньшие порции
- Почки: НЕ повреждает здоровые почки (подтверждено исследованиями)
- Выпадение волос: НЕ доказано (единичные данные, слабые)

**Кому особенно полезен:**
- Вегетарианцам/веганам (меньше креатина из пищи)
- Атлетам 40+ (противодействие саркопении)
- При высокоинтенсивных тренировках (спринт, силовые)
- Когнитивные функции: 3-5 г/день улучшает память у вегетарианцев

**Форма:** только моногидрат. Креалкалин, этил-эстер, буферизованный — маркетинг без преимуществ.
`;
}
export function getCaffeineStrategyGuide(message: string): string {
  const triggers = ['кофеин стратегия тренировк', 'кофе перед тренировкой дозировк', 'caffeine performance strategy', 'толерантность к кофеину', 'отказ от кофеина спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
☕ КОФЕИН — СТРАТЕГИЯ ПРИМЕНЕНИЯ:

**Механизм:**
- Блокирует аденозиновые рецепторы (снижает ощущение усталости)
- Повышает выброс адреналина и дофамина
- Увеличивает мобилизацию жирных кислот
- Эффект: +3-5% к силе, +2-4% к выносливости, снижение RPE

**Оптимальная дозировка:**
- 3-6 мг/кг массы тела за 30-60 мин до тренировки
- Для 80 кг = 240-480 мг (1-2 чашки крепкого кофе или таблетка)
- Начинать с 3 мг/кг, увеличивать при необходимости
- >9 мг/кг — побочные эффекты без дополнительного эффекта

**Управление толерантностью:**
- Толерантность развивается за 1-2 недели ежедневного приёма
- Стратегия 1: кофеин только перед тяжёлыми тренировками (2-3 раза/неделю)
- Стратегия 2: циклирование — 3-4 недели приём, 1 неделя без
- Стратегия 3: полный отказ на 7-14 дней для "перезагрузки"

**Отмена кофеина:**
- Симптомы: головная боль, усталость, раздражительность (пик на 1-2 день)
- Проходят за 3-7 дней
- Постепенное снижение: -50 мг каждые 2-3 дня мягче

**Время приёма:**
- Не позже 14:00 (период полувыведения 5-6 часов)
- За 30-60 мин до тренировки для пика эффекта
- Натощак: сильнее, но может раздражать желудок
- С едой: мягче, но медленнее всасывание

**Индивидуальные различия:**
- Генетика CYP1A2: быстрые метаболизаторы получают больше пользы
- Медленные метаболизаторы: тревожность, бессонница даже от малых доз
- Если кофе вызывает тревогу — снизить дозу или заменить на зелёный чай (L-теанин сглаживает)
`;
}
export function getWheyVsCaseinGuide(message: string): string {
  const triggers = ['сывороточный vs казеин', 'whey casein разница', 'какой протеин лучше выбрать', 'казеин на ночь', 'протеин для роста мышц выбор'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🥛 СЫВОРОТОЧНЫЙ ПРОТЕИН vs КАЗЕИН:

**Сывороточный (Whey):**
- Быстрое усвоение: пик аминокислот через 60-90 мин
- Высокое содержание лейцина (10-12%) — триггер MPS
- Формы: Concentrate (70-80% белка), Isolate (90%+), Hydrolysate (предварительно расщеплён)
- Лучшее время: после тренировки, утром

**Казеин (Casein):**
- Медленное усвоение: 6-8 часов (формирует гель в желудке)
- Антикатаболический эффект (защищает мышцы от распада)
- Мицеллярный казеин — самая медленная форма
- Лучшее время: перед сном, при длительных перерывах между приёмами пищи

**Что выбрать:**
- Для максимальной гипертрофии: сывороточный после тренировки + казеин перед сном
- Бюджет ограничен: сывороточный концентрат (лучшее соотношение цена/качество)
- Похудение: казеин (дольше насыщает)
- Непереносимость лактозы: изолят сыворотки (минимум лактозы)

**Дозировки:**
- 20-40 г за приём (зависит от массы тела)
- Лейциновый порог: минимум 2.5-3 г лейцина за приём
- 40 г для атлетов 40+ (анаболическая резистентность)
- Общий белок: 1.6-2.2 г/кг/день из всех источников

**Растительные альтернативы:**
- Гороховый + рисовый = полный аминокислотный профиль
- Соевый: полноценный, но фитоэстрогены (споры)
- Конопляный: хороший профиль, но дороже
- Растительные: +10-20% к порции для компенсации усвояемости
`;
}
export function getEAASupplementGuide(message: string): string {
  const triggers = ['eaa незаменимые аминокислот', 'bcaa vs eaa', 'аминокислоты для тренировк', 'eaa добавка', 'нужны ли bcaa'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💎 EAA vs BCAA — НЕЗАМЕНИМЫЕ АМИНОКИСЛОТЫ:

**9 незаменимых аминокислот (EAA):**
Лейцин, изолейцин, валин (= BCAA), + лизин, метионин, фенилаланин, треонин, триптофан, гистидин

**Почему EAA лучше BCAA:**
- BCAA (3 аминокислоты) НЕ могут запустить полный синтез белка
- Для синтеза нужны ВСЕ 9 незаменимых аминокислот
- BCAA без остальных EAA = сигнал к синтезу без строительного материала
- Исследования: EAA > BCAA для мышечного роста

**Когда EAA действительно нужны:**
✅ Тренировки натощак (утром до еды)
✅ Между приёмами пищи при длинных перерывах (>5 часов)
✅ Во время длительных тренировок (>90 мин)
✅ При ограниченном аппетите (сушка, болезнь)
✅ Веганам с неполноценным белком

**Когда НЕ нужны:**
❌ Если ешь достаточно белка (1.6-2.2 г/кг)
❌ Если принимаешь сывороточный протеин
❌ Между приёмами пищи с полноценным белком (<4 часов)
❌ Как замена реальной еде

**Дозировка EAA:**
- 10-15 г перед/во время тренировки натощак
- Обязательно: минимум 3 г лейцина в порции
- Растворить в воде, пить в течение тренировки
- Вкус EAA без ароматизатора — горький (нормально)

**Вердикт:**
- Протеиновый коктейль > EAA > BCAA > ничего
- Если бюджет ограничен: лучше купить сывороточный протеин
- BCAA как отдельная добавка — деньги на ветер при достаточном белке
`;
}
export function getFishOilDosingGuide(message: string): string {
  const triggers = ['рыбий жир дозировка спорт', 'омега 3 для атлетов', 'fish oil дозировка', 'epa dha тренировк', 'омега 3 воспаление мышцы'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🐟 ОМЕГА-3 (EPA/DHA) ДЛЯ АТЛЕТОВ:

**Зачем спортсмену:**
- Противовоспалительное действие (восстановление после тренировок)
- Снижение мышечной болезненности (DOMS) на 15-30%
- Улучшение чувствительности к инсулину
- Поддержка сердечно-сосудистой системы
- Здоровье суставов и связок

**Оптимальные дозировки:**
- Общее здоровье: 1-2 г EPA+DHA/день
- Спортсмены: 2-3 г EPA+DHA/день
- Восстановление суставов: 3-4 г EPA+DHA/день
- Важно: считать EPA+DHA, а не общий рыбий жир!
- Типичная капсула 1000 мг рыбьего жира = 300-500 мг EPA+DHA

**Соотношение EPA:DHA:**
- Противовоспалительный эффект: больше EPA (2:1 EPA:DHA)
- Когнитивные функции: больше DHA
- Универсальный вариант: 1:1 или 2:1

**Качество и выбор:**
- Форма триглицеридов (TG) лучше усваивается чем этиловые эфиры (EE)
- Проверяй сертификат IFOS или NSF
- Хранить в холодильнике (окисление)
- Если пахнет прогорклой рыбой — выбросить (окисленные вредны)

**Альтернативы:**
- Жирная рыба 2-3 раза/неделю: лосось, скумбрия, сельдь, сардины
- Порция 150 г лосося ≈ 3 г EPA+DHA
- Водорослевое масло (веганский DHA) — достойная альтернатива
- Льняное масло: ALA (предшественник), конверсия в EPA/DHA <5% — не замена

**Приём:**
- С жирной пищей (улучшает усвоение на 300%)
- Разделить на 2 приёма (утро + вечер)
- При рыбной отрыжке: принимать с едой или замороженные капсулы
`;
}
export function getZincImmuneGuide(message: string): string {
  const triggers = ['цинк иммунитет спорт', 'цинк тестостерон доза', 'zinc athletes', 'дефицит цинка тренировк', 'цинк для восстановлен'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🛡️ ЦИНК ДЛЯ СПОРТСМЕНОВ:

**Роль цинка:**
- Иммунная функция: цинк критичен для Т-клеток и NK-клеток
- Синтез тестостерона: дефицит цинка = снижение тестостерона на 40-50%
- Синтез белка: цинк-содержащие ферменты участвуют в MPS
- Антиоксидантная защита (SOD — супероксиддисмутаза)

**Потери при тренировках:**
- С потом: 0.5-1 мг/литр
- Повышенный расход при стрессе и воспалении
- Интенсивные тренировки снижают уровень цинка в крови
- Вегетарианцы: фитаты в зерновых блокируют усвоение цинка

**Дозировки:**
- RDA: мужчины 11 мг, женщины 8 мг
- Спортсмены: 15-30 мг/день элементарного цинка
- Не превышать 40 мг/день (верхний допустимый уровень)
- >40 мг/день хронически → дефицит меди

**Формы:**
- Пиколинат: высокая биодоступность ⭐
- Глюконат: хорошая биодоступность, доступная цена
- Цитрат: хороший вариант
- Оксид: дешёвый, низкая биодоступность ❌

**Пищевые источники (на 100 г):**
- Устрицы: 78 мг (рекордсмен!)
- Говядина: 6-7 мг
- Тыквенные семечки: 7.8 мг
- Кешью: 5.6 мг
- Куриная печень: 4 мг

**Важные взаимодействия:**
- Цинк конкурирует с медью → при приёме цинка >15 мг добавлять 1-2 мг меди
- Не принимать с кальцием и железом одновременно
- Принимать с белковой пищей (улучшает усвоение)
- ZMA (цинк + магний + B6): популярная комбинация для сна и восстановления
`;
}
export function getPreWorkoutStackGuide(message: string): string {
  const triggers = ['предтрен состав', 'стак перед тренировкой', 'pre workout stack', 'свой предтреник', 'предтрен своими руками'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🔋 ПРЕДТРЕНИРОВОЧНЫЙ СТАК — СОБЕРИ СВОЙ:

**Почему собирать самому:**
- Готовые предтреники: "proprietary blends" скрывают дозировки
- Недодозировка активных веществ (экономия производителя)
- Переплата за маркетинг и вкусовые добавки
- Свой стак = точные дозы, проверенные наукой

**Базовый стак (доказательная база A-уровня):**
1. Кофеин: 3-6 мг/кг за 30-60 мин до тренировки
2. Креатин: 3-5 г/день (можно и в предтрен, и отдельно)
3. Бета-аланин: 3.2-6.4 г/день (накопительный, время не важно)
4. Цитруллин малат: 6-8 г за 30-60 мин (NO-бустер, пампинг)

**Продвинутый стак (+к базовому):**
5. L-тирозин: 1-2 г (фокус, нейротрансмиттеры)
6. Таурин: 1-3 г (антиоксидант, выносливость)
7. Альфа-GPC: 300-600 мг (ацетилхолин → связь мозг-мышцы)
8. Бетаин (TMG): 2.5 г (поддержка метилирования, сила +3-5%)

**Что НЕ работает (маркетинг):**
❌ BCAA при достаточном белке
❌ L-аргинин (плохая биодоступность, цитруллин лучше)
❌ Трибулус (не влияет на тестостерон)
❌ "Жиросжигатели" в предтренах (маркетинг)
❌ Бустеры тестостерона (D-аспарагиновая кислота и т.п.)

**Пример рецепта (80 кг атлет):**
- Кофеин 300 мг (таблетка)
- Цитруллин малат 8 г (порошок)
- Бета-аланин 3.2 г (порошок)
- L-тирозин 1.5 г (порошок)
- Растворить в 300-400 мл воды, выпить за 30 мин до тренировки
- Креатин 5 г можно добавить сюда или пить отдельно

**Стоимость:** собственный стак обходится в 2-3 раза дешевле брендовых предтреников
`;
}
export function getRussianSupplementMarket(message: string): string {
  const triggers = ['российский рынок спортпит', 'где купить спортпит россия', 'спортивное питание цены россия', 'протеин wildberries', 'спортпит ozon', 'аналог спортпит россия'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🛒 РЫНОК СПОРТИВНОГО ПИТАНИЯ В РОССИИ (2025):

**Маркетплейсы:**

Wildberries:
- Огромный ассортимент, часто лучшие цены
- Риск: подделки (проверяй рейтинг продавца, читай отзывы)
- Совет: покупай только у официальных дистрибьюторов с сертификатами
- Топ-категории: протеин, BCAA, витамины, предтреники

Ozon:
- Более строгий контроль качества vs WB
- Официальные поставщики многих брендов
- Цены чуть выше, зато меньше рисков

iHerb (через Беларусь):
- Работает для РФ через белорусский склад
- Лучший выбор для: витамины, минералы, рыбий жир, специфические добавки
- Цены в $ с доставкой, но часто выгодно

**Отечественные производители (заслуживающие внимания):**
- Академия-Т / PureProtein: доступный протеин нормального качества
- Geneticlab Nutrition: средний ценовой сегмент, хорошая линейка
- Syntech Nutrition: премиальный российский бренд
- BioTechUSA (Венгрия, но доступен): известное европейское качество

**Что покупать где:**

Протеин:
- Wildberries: Академия-Т, PureProtein (экономия 20-30% vs спортмаги)
- Ozon: BSN, Syntech (официальные поставщики)
- Специализированные магазины: Спортмастер, Fit-Food, питание-спортсмена.рф

Витамины и минералы:
- iHerb: лучший выбор (D3+K2, магний, рыбий жир, цинк)
- Ozon: российские аналоги Solgar от GoldTouch, Natrol

Предтренировочные комплексы:
- Осторожно с «мощными предтрениками» — часто содержат геранамин/DMAA (запрещено)
- Безопасно: кофеин + бета-аланин + BCAA (самостоятельный стек)

**Красные флаги при покупке:**
🚩 «Жиросжигатель -5кг за 2 недели»
🚩 Состав на иностранном языке без русского перевода
🚩 Нет штрих-кода EAN или декларации соответствия
🚩 Цена протеина ниже 500₽/кг (скорее всего фальсификат)
`;
}
export function getHMBSupplement(message: string): string {
  const kw = ['hmb', 'гмб добавка', 'бета-гидрокси', 'hmb мышцы', 'hmb сила'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**HMB (β-гидрокси-β-метилбутират) — детальный разбор:**

**Что такое HMB:**
Метаболит лейцина (аминокислоты с BCAA) — 5% лейцина конвертируется в HMB.
Механизмы: ↓ катаболизм белка + ↑ синтез белка (слабее лейцина).

**Формы HMB:**
- HMB-Ca (кальциевая соль): классическая форма, хорошо изучена
- HMB-FA (свободная кислота): более быстрое всасывание, выше пиковая концентрация

**Научные данные:**
Ранние исследования (Nissen, 1996): значительный прирост мышц → оптимизм
Поздние мета-анализы: эффект значительно меньше в тренированных атлетах
Тренированные: минимальный эффект или нулевой
Нетренированные/пожилые: умеренный эффект на сохранение мышц

**Где HMB реально работает:**
✓ Начинающие (нетренированные) — первые 6-12 мес
✓ Пожилые (+60 лет) — борьба с саркопенией
✓ Очень высокий дефицит калорий (жёсткая диета, болезнь)
✓ Выход из длительного перерыва в тренировках

**Дозировка:**
HMB-Ca: 3 г/день, делить на 3 приёма
HMB-FA: 1-2 г за 30-60 мин до тренировки

**Вывод:**
Для опытных атлетов — мало смысла (лучше купить лишний кг куриной грудки).
Для новичков и пожилых — разумная добавка при бюджете.
`;
}
export function getOmega3AthleteAdv(message: string): string {
  const kw = ['омега-3 атлет', 'рыбий жир тренировки', 'омега3 мышцы', 'dha epa спорт', 'рыбий жир воспаление спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Омега-3 жирные кислоты для атлетов:**

**Ключевые формы:**
EPA (эйкозапентаеновая) → противовоспалительное действие, психология
DHA (докозагексаеновая) → мозг, нервная система, зрение
ALA (альфа-линоленовая) → растительные источники, плохо конвертируется в EPA/DHA

**Спортивные эффекты омега-3:**

**1. Снижение воспаления:**
↓ ИЛ-6, ЦОГ-2 простагландины → меньший DOMS
Лучшее восстановление между тренировками

**2. Синтез белка (mTOR):**
EPA/DHA включаются в мембраны мышечных клеток → повышают чувствительность к лейцину
+20-25% прироста к синтезу белка при приёме с белком (Смит и др., 2011)

**3. Нейромышечная функция:**
DHA в миелиновых оболочках → скорость нервного импульса
Фокус, реакция, снижение воспринимаемой нагрузки

**4. Жировой обмен:**
Усиление бета-окисления жиров при аэробных нагрузках
Небольшое влияние на состав тела

**Дозировка для атлетов:**
Минимум: 2-3 г EPA+DHA/день
Оптимум: 3-5 г EPA+DHA/день (не общий рыбий жир!)
Высокое воспаление/интенсивный тренинг: 5-6 г/день

**Время приёма:**
С едой (лучше усвоение), желательно с пищей, содержащей жиры.
Разбить на 2 приёма — меньше риска «рыбной отрыжки».

**Источники:**
Жирная рыба (лосось, скумбрия, сардины): 2-3 г EPA+DHA / 100 г
Рыбий жир в капсулах: читать состав — не «жир», а EPA+DHA граммы
Водорослевый омега-3: для веганов, преимущественно DHA
`;
}
export function getVitaminDSport(message: string): string {
  const kw = ['витамин д спорт', 'vitamin d атлет', 'витамин d тренировки', 'дефицит витамина d спортсмен', 'холекальциферол спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Витамин D для спортсменов:**

**Витамин D — не витамин, а прогормон:**
Синтезируется в коже под действием УФ-В излучения.
Рецепторы VDR есть практически во всех тканях, включая мышцы.

**Распространённость дефицита:**
До 70% населения России имеют недостаток витамина D (октябрь-апрель).
Спортсмены, тренирующиеся в зале — особая группа риска.

**Спортивные эффекты витамина D:**

**Мышечная функция:**
Рецепторы VDR в мышечных клетках → влияет на сокращение и рост
Дефицит: снижение силы, замедленная реакция, ↑ риск травм
Нормализация: умеренный прирост силы (+2-5% в дефицитных группах)

**Иммунитет и здоровье:**
↓ заболеваемость ОРВИ (актуально для регулярных тренировок зимой)
↓ риск стрессовых переломов (усвоение кальция)

**Тестостерон:**
Витамин D коррелирует с тестостероном у мужчин
Нормализация дефицита → умеренный рост тестостерона (~20%)

**Целевые уровни:**
Минимум: 30 нмоль/л (20 нг/мл)
Оптимум для спортсменов: 75-125 нмоль/л (30-50 нг/мл)
Обязательно сдать анализ (25-OH-D3) перед началом приёма

**Дозировка:**
Поддержание (летом, с солнцем): 1000-2000 МЕ/день
Дефицит (зима, РФ): 2000-4000 МЕ/день
Коррекция глубокого дефицита: 5000 МЕ/день (под наблюдением врача)

**Форма:** D3 (холекальциферол) >> D2; желательно с K2 (MK-7) для правильного распределения кальция.
`;
}
export function getZincSportPerf(message: string): string {
  const kw = ['цинк спорт', 'zinc атлет', 'цинк тестостерон', 'дефицит цинка спортсмен', 'цинк мышцы'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Цинк для спортсменов:**

**Роль цинка в организме:**
>300 ферментативных реакций — включая синтез белка, ДНК
Синтез тестостерона и ИФР-1 (инсулиноподобный фактор роста)
Иммунная функция, заживление ран
Антиоксидантная защита (компонент супероксиддисмутазы)

**Потери цинка у спортсменов:**
С потом: 0.6-1.5 мг/ч при интенсивной нагрузке
С мочой: ↑ при высоком катаболизме
Итог: атлеты теряют в 2-3 раза больше цинка, чем обычные люди

**Признаки дефицита цинка:**
Частые простуды, плохое заживление
Снижение либидо и тестостерона
Ухудшение вкуса и обоняния
Замедленный рост мышц при тренировках

**Влияние на производительность:**
Нормализация дефицита → восстановление тестостерона и ИФР-1
Улучшение иммунитета → меньше пропусков тренировок
ZMA (цинк + магний + B6) — популярная комбинация для атлетов

**Дозировка:**
Мужчины-атлеты: 15-30 мг/день
Женщины-атлеты: 10-15 мг/день
Не превышать 40 мг/день (верхний безопасный порог)

**Форма:** цинк бисглицинат или цитрат > оксид (лучше всасывается)

**Важно:** принимать отдельно от кальция и железа — конкурируют за всасывание.
Вечерний приём (с ужином) — традиционный для атлетов.
`;
}
export function getElectrolyteComplex(message: string): string {
  const kw = ['электролиты комплекс', 'солевые таблетки', 'натрий калий магний баланс', 'потеря электролитов пот', 'электролитный напиток'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Электролитный менеджмент для атлетов:**

**Основные электролиты и их роль:**

**Натрий (Na⁺) — главный:**
Регуляция объёма крови и межклеточной жидкости
Нервно-мышечная передача
Потери: 500-2000 мг/час при интенсивном поте
Дефицит → мышечные судороги, слабость, гипонатриемия

**Калий (K⁺):**
Сокращение мышц, поддержание давления
Потери с потом: 150-500 мг/час
Дефицит → судороги, аритмия, слабость

**Магний (Mg²⁺):**
>300 реакций, включая синтез АТФ и расслабление мышц
Потери с потом: 10-40 мг/час
Дефицит → судороги, бессонница, тремор

**Хлорид (Cl⁻):**
Регуляция pH, баланс жидкостей
Основной анион внеклеточной жидкости

**Протокол восполнения:**
Тренировка <1 ч, нет сильного пота: вода + обычная еда
Тренировка 1-2 ч, умеренный пот: спортивный напиток или таблетки
Тренировка >2 ч / жара: целенаправленный электролитный протокол

**DIY электролитный напиток (на 500 мл):**
Вода: 500 мл
Соль: 1/4 ч.л. (~300 мг натрия)
Лимонный сок: 2 ст.л. (калий + вкус)
Мёд/сахар: 1 ч.л. (быстрые углеводы)
Экономичнее готовых напитков в 5-10 раз

**Предупреждение гипонатриемии:**
Пить по жажде, не «заливаться» водой без соли
Длительные нагрузки (марафон, ультра): добавлять натрий обязательно
`;
}
export function getSupplementStackGuide(message: string): string {
  const kw = ['стек добавок', 'какие добавки', 'необходимые добавки', 'базовый стек', 'минимум добавок'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**С��ек добавок по приоритету (доказательная база):**

**Уровень 1 — Обязательные (для всех):**
Протеин (whey/казеин): если не добираешь белок из еды
Креатин моногидрат: 5 г/день, каждый день (без загрузки)
Витамин D3: 2000-5000 МЕ/день (особенно в России)
Омега-3 (рыбий жир): 2-3 г EPA+DHA в день

**Уровень 2 — Рекомендуемые (по ситуации):**
Магний (глицинат или цитрат): 200-400 мг перед сном
Цинк: 15-30 мг/день (если мало мяса)
Кофеин: 3-6 мг/кг за 30-60 мин до тренировки

**Уровень 3 — Опциональные:**
Бета-аланин: 3-6 г/день (для выносливости в 60-240 сек)
Цитруллин: 6-8 г до тренировки (пампинг, выносливость)
Мелатонин: 0.5-3 мг за 30 мин до сна (если проблемы со сном)

**НЕ работает (экономь деньги):**
BCAA (если достаточно белка — бесполезны)
Трибулус (нет эффекта на тестостерон)
Глутамин для мышц (работает только для кишечника)
CLA (минимальный эффект, дорого)
"Жиросжигатели" (кроме кофеина — маркетинг)

**Бюджет ~3000 руб/мес:**
Креатин (500 руб) + Витамин D (300 руб) + Омега-3 (800 руб) + Магний (400 руб) + Протеин (1000 руб)
`;
}
export function getWaterAndElectrolytes(message: string): string {
  const kw = ['электролиты', 'сколько пить воды', 'гидратация спорт', 'натрий тренировки', 'обезвоживание'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Гидратация и электролиты для атлетов:**

**Базовая потребность в воде:**
30-35 мл на кг массы тела (80 кг = 2.4-2.8 л)
+ 500-1000 мл на каждый час тренировки
+ 500 мл в жаркую погоду

**Признаки обезвоживания:**
Моча тёмно-жёлтая (должна быть светло-жёлтая)
↓ Силы на 10-20% при потере 2% массы тела
Головная боль, головокружение
↑ ЧСС при той же нагрузке

**Электролиты:**

Натрий (самый важный при потоотделении):
Потеря: 500-1500 мг/л пота
Тренировка >60 мин: 500-700 мг натрия на литр воды
Источник: щепотка соли в воду или спортивный напиток

Калий: 2000-3000 мг/день (бананы, картофель, авокадо)
Магний: 400 мг/день (часто дефицит)

**Практический рецепт электролитного напитка:**
1 л воды + 1/4 ч.л. соли + сок 1/2 лимона + 1 ст.л. мёда
= ~500 мг натрия, ~50 ккал, освежает

**Перегидратация (тоже опасна!):**
>8 л воды в день без электролитов → гипонатриемия
Не пей "впрок" — пей по жажде + контролируй цвет мочи
`;
}
export function getLongevitySupplements(message: string): string {
  const kw = ['добавки для долголетия', 'anti-age добавки', 'nad+', 'ресвератрол', 'метформин спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**До��авки для долголетия — что говорит наука:**

**Уровень А (сильные доказательства):**
Креатин: защита мозга, ↑ когнитивные, ↑ мышцы в старости
Витамин D3: ↓ смертность при дефиците, ↑ иммунитет, ↑ кости
Омега-3: ↓ воспаление, ↓ кардиориск, ↑ мозг
Магний: ↓ давление, ↑ сон, ↑ инсулиновая чувствительность

**Уровень B (перспективные):**
NMN/NR (прекурсоры NAD+): ↑ NAD+ в тканях, ↑ энергия
Исследования на мышах: ↑ выносливость, ↓ маркеры старения
На людях: ранние данные положительны, но долгосрочных нет
Доза: NMN 250-500 мг/день, NR 300-600 мг/день

**Уровень C (интересные, но рано):**
Ресвератрол: ↓ воспаление, но биодоступность низкая
Куркумин: ↓ воспаление, лучше с пиперином (×2000%)
Метформин: споры (↓ старение, но может ↓ адаптацию к тренировкам)
Рапамицин: потенциал ↑ аутофагии, но побочки → только под наблюдением

**Уровень D (не доказано):**
Коллаген (для кожи): данные слабые
Астаксантин: антиоксидант, но ↑ антиоксиданты могут ↓ адаптацию

**Приоритет:**
Сначала: сон, тренировки, питание, стресс → бесплатно и доказано
Потом: базовые добавки (D, Omega-3, Mg, креатин)
Затем: NMN/NR если бюджет позволяет
`;
}
export function getSupplementsForRecovery(message: string): string {
  const kw = ['добавки для восстановления', 'спортпит восстановление', 'supplements recovery', 'что пить после тренировки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Добавки для восстановления — доказательная база:**

**Уровень А (сильные доказательства):**
Креатин 3-5г/день: ↑ синтез гликогена, ↑ регенерация, ↓ воспаление
Омега-3 (ЭПК+ДГК) 2-4г/день: ↓ мышечная болезненность, ↓ DOMS
Магний 300-400мг (глицинат/малат): сон, ↓ судороги, ↓ воспаление

**Уровень Б (умеренные доказательства):**
Витамин D 2000-4000 МЕ: иммунитет, ↓ воспаление
Коллаген 10-15г + вит. C за 1ч до тренировки: ↑ синтез коллагена сухожилий
Ашвагандha 600мг: ↓ кортизол, ↑ качество сна, ↑ сила

**Уровень В (ограниченные доказательства):**
Куркумин 500-1000мг: антиоксидант, ↓ DOMS (НО ↓ адаптацию при длительном приёме!)
Цинк+магний (ZMA): если есть дефицит — да. Без дефицита — нет эффекта
Теанин 200мг + кофеин: ↑ качество фокуса, ↓ тревога

**❌ Что не работает:**
- Глютамин (у здоровых атлетов без пользы)
- Антиоксиданты в больших дозах (вит. C >1г, вит. E): ↓ долгосрочная адаптация!

**Оптимальное время приёма:**
Утро: витамин D, омега-3, ашвагандha
До тренировки: кофеин, бета-аланин
После тренировки: белок + углеводы (главное)
Перед сном: магний глицинат, ZMA (если принимаешь)
`;
}
export function getPreWorkoutNutrition(message: string): string {
  const kw = ['питание перед тренировкой', 'что есть перед тренировкой', 'предтренировочное питание', 'углеводы перед тренировкой', 'кофеин тренировка', 'есть ли перед тренировкой натощак'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Питание перед тренировкой — наука и практика:**

**Тайминг и размер порции:**
За 3-4 часа: полноценный приём пищи (белки + углеводы + немного жиров)
За 1-2 часа: лёгкий перекус (углеводы + немного белка, мало жира/клетчатки)
За 30-60 мин: быстроусвояемые углеводы (банан, спортивный напиток), если нужно

**Углеводы — ключевое топливо:**
Силовой тренинг: 1-4 г/кг за 1-4 ч до тренировки
Быстрые (банан, белый рис, мёд) — за 30-60 мин
Медленные (овсянка, гречка) — за 2-3 часа
Цель: пополнить гликоген, обеспечить глюкозу в крови

**Белок перед тренировкой:**
20-40 г за 2-3 ч до тренировки — снижает распад мышечного белка
Не обязательно за 30 мин (аминокислоты уже в крови от предыдущего приёма)

**Кофеин (1 из лучших эргогенных добавок):**
Дозировка: 3-6 мг/кг за 45-60 мин до тренировки (типично 200-300 мг)
Эффекты: ↑ сила ~3-5%, ↑ выносливость 10-15%, ↓ RPE
Форма: кофе, кофеиновые таблетки, предтрен

**Тренировки натощак:**
Возможны — организм использует жир как топливо
Минус: снижается производительность при высоко интенсивных тренировках
Если тренируешься натощак: BCAA или сывороточный белок до тренировки

**Что избегать:**
Много клетчатки и жира за 1-2 ч до (замедляют пищеварение → дискомфорт)
Новые продукты перед соревнованиями/важными тренировками
`;
}
export function getCreatineGuide(message: string): string {
  const kw = ['креатин', 'creatine', 'креатин моногидрат', 'загрузка креатином'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Креатин — полное руководство:**

**Что это:**
Креатин моногидрат — наиболее изученная и эффективная спортивная добавка. Естественно содержится в мясе и рыбе (1-2 г/кг), но для тренировочного эффекта нужно больше.

**Загрузка — нужна ли?**
Фаза загрузки (20 г/день × 5-7 дней) НЕ обязательна. При приёме 5 г/день запасы креатинфосфата в мышцах выходят на максимум за 3-4 недели — тот же результат, просто медленнее.

**Дозировка:**
Поддерживающая доза: 3-5 г/день (для атлетов 90+ кг — 5-7 г/день)
Время приёма: ЛЮБОЕ. Нет разницы между приёмом до или после тренировки (meta-analysis, Forbes & Candow 2018)

**Эффекты:**
Прирост силы: +5-10% в базовых упражнениях за 4-8 недель
Прибавка массы: +1-2 кг (вода в мышцах — это НОРМАЛЬНО, не жир)
Ускорение восстановления между подходами (ресинтез АТФ из креатинфосфата)
Возможные когнитивные преимущества (улучшение рабочей памяти)

**Безопасность:**
Мета-анализы (Kreider et al. 2017, 500+ исследований): безопасен при длительном приёме
НЕ вредит почкам у здоровых людей (проверено до 5 лет непрерывного приёма)
Единственный побочный эффект: задержка воды 1-2 кг

**Кому подходит:**
Начинающие и продвинутые атлеты получают одинаковую пользу
Особенно эффективен для вегетарианцев (у них базовые запасы креатина ниже)
Не нужен, если вы едите 500+ г красного мяса/рыбы ежедневно
`;
}
export function getCaffeineAndPerformance(message: string): string {
  const kw = ['кофеин и тренировки', 'кофе перед тренировкой', 'предтреник кофеин', 'сколько кофеина'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Кофеин и спортивная производительность — доказательная база:**

**Оптимальная дозировка:**
3-6 мг/кг массы тела — доказанный диапазон эффективности (Goldstein et al. 2010)
Для атлета 80 кг: 240-480 мг (2-4 чашки крепкого кофе или 1-2 капсулы по 200 мг)
Больше 6 мг/кг — побочные эффекты растут, дополнительных преимуществ нет
Новичкам: начните с 2-3 мг/кг и постепенно увеличивайте

**Тайминг:**
Оптимально: за 30-60 минут до тренировки (пик концентрации в крови)
Период полувыведения: 3-7 часов (индивидуально, зависит от генетики CYP1A2)
НЕ принимайте после 14:00-16:00, если тренируетесь вечером и хотите нормально спать

**Влияние на производительность:**
Сила: +3-5% в максимальных подъёмах (мета-анализ Grgic et al. 2019)
Выносливость: +2-4% повышение работоспособности (Ganio et al. 2009)
Мощность: +3-7% в спринтах и прыжках
Субъективно: снижение воспринимаемой нагрузки (RPE) на 5-6%
Фокус и реакция: значительное улучшение (это основной эффект — блокада аденозина)

**Толерантность и циклирование:**
При ежедневном приёме эффекты снижаются за 1-2 недели (толерантность)
Рекомендация: 2 недели перерыва каждые 6-8 недель, или приём только в дни тренировок
«Выходной» от кофеина: 3-7 дней абстиненции = полный «сброс» чувствительности
Симптомы отмены (головная боль, усталость): пик 24-48 часов, проходят за 3-5 дней

**Источники кофеина (сравнение):**
Кофе (100 мл): ~40-80 мг — натуральный, содержит антиоксиданты, но нестабильная доза
Кофеин в таблетках (200 мг): точная доза, дёшево, без калорий
Предтренировочный комплекс: 150-400 мг + другие компоненты (бета-аланин, цитруллин)
Энергетики: 80-300 мг + сахар/подсластители — худший вариант (лишние калории, химия)

**Побочные эффекты и противопоказания:**
Тахикардия, тревожность, бессонница (при передозировке)
ЖКТ-проблемы: кофе натощак может вызвать изжогу/диарею
Не сочетать с эфедрой и другими стимуляторами
При гипертонии — с осторожностью (повышает АД на 5-10 мм рт. ст. краткосрочно)
`;
}
export function getSupplementsForBeginners(message: string): string {
  const kw = ['какие добавки пить', 'добавки для начинающих', 'нужен ли протеин', 'базовые добавки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Добавки для начинающих — честный tier-лист на основе науки:**

**Tier 1 — Доказанная эффективность (рекомендуется):**

Креатин моногидрат — 5 г/день каждый день (не нужна загрузка)
Самая изученная добавка в спортивной науке (1000+ исследований)
Эффекты: +5-10% силы, +1-2 кг мышечной массы за 3 месяца, улучшение когнитивных функций
Безопасен для почек у здоровых людей (Kreider et al. 2017)
Первые 1-2 недели: набор 1-2 кг воды (это нормально, не жир)

Сывороточный протеин (whey) — только если не добираете белок из еды
Не "волшебная добавка", а просто удобный источник белка
Когда нужен: не можете съесть 1.6-2.2 г/кг белка из обычной еды
Когда НЕ нужен: если едите достаточно курицы, рыбы, яиц, творога
Доза: 25-40 г за приём (1-2 порции в день)

Витамин D — 2000 МЕ/день (если живёте в северном климате или мало бываете на солнце)
Дефицит витамина D: снижение тестостерона, слабость мышц, ухудшение иммунитета
80%+ населения России имеют недостаток витамина D (особенно зимой)
Лучше сдать анализ (25-OH vitamin D) и дозировать по результату

**Tier 2 — Полезно, но не обязательно:**

Кофеин — 3-6 мг/кг за 30-60 минут до тренировки
Доказанный эргогенный эффект: +3-5% силы, снижение RPE (ощущение нагрузки)
Дешевле и эффективнее любого предтреника: просто чашка крепкого кофе

Омега-3 (рыбий жир) — 1-2 г EPA+DHA в день
Противовоспалительный эффект, поддержка суставов, здоровье сердца
Если едите жирную рыбу 2-3 раза в неделю — добавка не нужна

**Tier 3 — Опционально при дефиците:**

Магний — 200-400 мг перед сном (улучшение сна и восстановления)
Цинк — 15-30 мг/день (если мало мяса и морепродуктов в рационе)

**НЕ нужно (выброшенные деньги):**
BCAA — полный scam если вы едите достаточно белка (BCAA уже есть в любом белке)
Жиросжигатели (fat burners) — не работают или дают эффект 50-100 ккал/день (ничтожно)
Тестобустеры (tribulus, d-aspartic acid) — НЕ повышают тестостерон у здоровых мужчин
Гейнеры — переоценённый дешёвый сахар с протеином; лучше поесть нормальной еды
L-carnitine для похудения — не работает при нормальном уровне в организме
`;
}
