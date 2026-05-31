/**
 * knowledge-topics/equipment.ts — auto-split from knowledgeHelpers.ts
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
import { GoalProgress } from './misc';

export function estimateGoalProgress(
  user: { weightKg?: number | null; goal?: string | null; fitnessLevel?: string | null },
  bodyWeightHistory: Array<{ weightKg: number; date: Date }>,
  totalWorkoutsLast30Days: number,
  weeklyAvgVolume: number,
): GoalProgress | null {
  if (!user.goal) return null;

  const goal = user.goal;
  const currentWeight = user.weightKg || bodyWeightHistory[0]?.weightKg;

  if (goal === 'WEIGHT_LOSS') {
    if (!currentWeight || bodyWeightHistory.length < 3) {
      return { goal: 'Похудение', progressPercent: 0, estimatedWeeksLeft: null, insight: 'Недостаточно данных о весе. Записывай вес регулярно для отслеживания прогресса.', onTrack: false };
    }
    // Calculate weekly weight loss rate
    const oldest = bodyWeightHistory[bodyWeightHistory.length - 1];
    const weeksBetween = Math.max(1, (Date.now() - new Date(oldest.date).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const totalLoss = oldest.weightKg - currentWeight;
    const weeklyRate = totalLoss / weeksBetween;

    // Estimate target: ~10-15% body fat reduction for general weight loss
    const targetWeight = currentWeight * 0.9; // ~10% loss as rough target
    const remainingLoss = currentWeight - targetWeight;

    if (weeklyRate > 0) {
      const weeksLeft = Math.round(remainingLoss / weeklyRate);
      const onTrack = weeklyRate >= 0.3 && weeklyRate <= 1.0;
      return {
        goal: 'Похудение',
        progressPercent: Math.min(100, Math.round((totalLoss / (totalLoss + remainingLoss)) * 100)),
        estimatedWeeksLeft: weeksLeft > 0 ? weeksLeft : null,
        insight: onTrack
          ? `Темп потери: ${weeklyRate.toFixed(1)} кг/нед — оптимально (0.3-1.0 кг/нед).`
          : weeklyRate > 1.0
            ? `Темп потери: ${weeklyRate.toFixed(1)} кг/нед — слишком быстро! Риск потери мышц. Добавь 200-300 ккал.`
            : `Темп потери: ${weeklyRate.toFixed(1)} кг/нед — медленно. Рассмотри снижение калорий на 200 ккал или добавление кардио.`,
        onTrack,
      };
    }

    return { goal: 'Похудение', progressPercent: 0, estimatedWeeksLeft: null, insight: `Вес не снижается или растёт. Проверь калорийность и увеличь активность.`, onTrack: false };
  }

  if (goal === 'MUSCLE_GAIN') {
    if (!currentWeight || bodyWeightHistory.length < 3) {
      return { goal: 'Набор массы', progressPercent: 0, estimatedWeeksLeft: null, insight: 'Записывай вес регулярно для отслеживания набора.', onTrack: false };
    }
    const oldest = bodyWeightHistory[bodyWeightHistory.length - 1];
    const weeksBetween = Math.max(1, (Date.now() - new Date(oldest.date).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const totalGain = currentWeight - oldest.weightKg;
    const weeklyRate = totalGain / weeksBetween;

    const onTrack = weeklyRate >= 0.2 && weeklyRate <= 0.5;
    return {
      goal: 'Набор массы',
      progressPercent: Math.min(100, Math.round(totalWorkoutsLast30Days / 16 * 100)), // ~4 workouts/week target
      estimatedWeeksLeft: null,
      insight: onTrack
        ? `Набор: ${weeklyRate.toFixed(1)} кг/нед — идеально для чистого набора.`
        : weeklyRate > 0.5
          ? `Набор: ${weeklyRate.toFixed(1)} кг/нед — слишком быстро, часть уйдёт в жир. Снизь профицит на 200 ккал.`
          : weeklyRate < 0.1
            ? `Набор: ${weeklyRate.toFixed(1)} кг/нед — медленно. Увеличь калорийность на 300 ккал.`
            : `Набор: ${weeklyRate.toFixed(1)} кг/нед.`,
      onTrack,
    };
  }

  if (goal === 'STRENGTH') {
    const onTrack = totalWorkoutsLast30Days >= 12 && weeklyAvgVolume > 0;
    return {
      goal: 'Сила',
      progressPercent: Math.min(100, Math.round(totalWorkoutsLast30Days / 16 * 100)),
      estimatedWeeksLeft: null,
      insight: onTrack
        ? `${totalWorkoutsLast30Days} тренировок за 30 дней — отличная регулярность для силового прогресса.`
        : totalWorkoutsLast30Days < 8
          ? `Только ${totalWorkoutsLast30Days} тренировок за 30 дней — для силы нужна регулярность (3-4 раза/нед).`
          : `${totalWorkoutsLast30Days} тренировок за 30 дней — хорошо, но стремись к 4/нед.`,
      onTrack,
    };
  }

  return null;
}
export function estimateBodyComposition(
  user: { weightKg?: number | null; heightCm?: number | null; gender?: string | null },
  bodyWeightHistory: Array<{ weightKg: number; date: Date }>,
  totalWorkoutsLast30Days: number,
): string {
  if (!user.weightKg || !user.heightCm || bodyWeightHistory.length < 2) return '';

  const bmi = user.weightKg / Math.pow(user.heightCm / 100, 2);

  // Simple BF% estimation from BMI (Deurenberg formula, rough approximation)
  // BF% = 1.2 × BMI + 0.23 × age − 10.8 × sex − 5.4
  // Without age, use simplified version
  const sexFactor = user.gender === 'MALE' ? 1 : 0;
  const estimatedBF = Math.round(1.2 * bmi - 10.8 * sexFactor - 5.4 + 0.23 * 25); // assume ~25 age

  // Categorize
  let category: string;
  if (user.gender === 'MALE') {
    if (estimatedBF < 10) category = 'соревновательная форма';
    else if (estimatedBF < 15) category = 'атлетичная форма';
    else if (estimatedBF < 20) category = 'нормальный уровень';
    else if (estimatedBF < 25) category = 'выше нормы';
    else category = 'избыточный';
  } else {
    if (estimatedBF < 18) category = 'соревновательная форма';
    else if (estimatedBF < 23) category = 'атлетичная форма';
    else if (estimatedBF < 28) category = 'нормальный уровень';
    else if (estimatedBF < 33) category = 'выше нормы';
    else category = 'избыточный';
  }

  // Weight trend over last month
  const newest = bodyWeightHistory[0];
  const monthAgo = bodyWeightHistory.find(
    (bw) => (Date.now() - new Date(bw.date).getTime()) / (1000 * 60 * 60 * 24) >= 21
  );
  let trendNote = '';
  if (monthAgo) {
    const delta = newest.weightKg - monthAgo.weightKg;
    if (Math.abs(delta) > 0.5) {
      trendNote = `\nДинамика за месяц: ${delta > 0 ? '+' : ''}${delta.toFixed(1)} кг`;
    }
  }

  return `\n\n## 📐 СОСТАВ ТЕЛА (оценка)
BMI: ${bmi.toFixed(1)} | Примерный % жира: ~${estimatedBF}% (${category})
Вес: ${user.weightKg} кг, Рост: ${user.heightCm} см${trendNote}
⚠️ Это грубая оценка по BMI. Для точности рекомендуй калиперометрию или биоимпедансометрию.
→ Используй при обсуждении целей по составу тела.`;
}
export function estimateTrainingAge(
  user: { trainingExperienceYears?: number | null; fitnessLevel?: string | null },
  totalWorkoutsInApp: number,
  avgVolume: number,
): string {
  // Calculate effective training age
  let estimatedYears = user.trainingExperienceYears || 0;

  // Adjust based on app usage
  if (totalWorkoutsInApp > 200 && estimatedYears < 2) estimatedYears = Math.max(estimatedYears, 2);
  if (totalWorkoutsInApp > 500 && estimatedYears < 4) estimatedYears = Math.max(estimatedYears, 4);

  // Cross-check with fitness level
  if (user.fitnessLevel === 'EXPERT' && estimatedYears < 3) estimatedYears = 3;
  if (user.fitnessLevel === 'ADVANCED' && estimatedYears < 2) estimatedYears = 2;

  let tier: string;
  let adviceStyle: string;

  if (estimatedYears < 1) {
    tier = 'новичок';
    adviceStyle = 'Объясняй базово, избегай сложной терминологии. Фокус на правильную технику и постепенность. Не перегружай информацией.';
  } else if (estimatedYears < 3) {
    tier = 'средний';
    adviceStyle = 'Можно использовать базовую терминологию (RPE, суперсет, периодизация). Объясняй «почему» за рекомендациями.';
  } else if (estimatedYears < 6) {
    tier = 'опытный';
    adviceStyle = 'Используй продвинутую терминологию свободно. Давай нюансированные советы. Обсуждай стратегии (DUP, блоковая периодизация, авторегуляция).';
  } else {
    tier = 'ветеран';
    adviceStyle = 'Общайся как с коллегой. Обсуждай тонкости (RIR vs RPE, accommodating resistance, velocity-based training). Предлагай продвинутые методики.';
  }

  return `\n\n## 🎓 ТРЕНИРОВОЧНЫЙ ОПЫТ
Оценка: ~${estimatedYears} ${estimatedYears === 1 ? 'год' : estimatedYears < 5 ? 'года' : 'лет'} (${tier})
${adviceStyle}`;
}
export function estimateGoalTimeline(
  userGoal: string | null,
  userWeightKg: number | null,
  bodyWeightHistory: Array<{ weightKg: number; date: Date }>,
  totalWorkoutsEver: number,
  weeklyWorkouts: number,
): string {
  if (!userGoal || !userWeightKg || bodyWeightHistory.length < 3) return '';

  const lines: string[] = [];

  if (userGoal === 'WEIGHT_LOSS') {
    // Calculate weight loss rate
    const oldest = bodyWeightHistory[bodyWeightHistory.length - 1];
    const newest = bodyWeightHistory[0];
    const weeksBetween = Math.max(1, (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const weeklyChange = (newest.weightKg - oldest.weightKg) / weeksBetween;

    if (weeklyChange < -0.1) {
      const rate = Math.abs(weeklyChange);
      lines.push(`📉 Темп похудения: ${rate.toFixed(2)} кг/нед`);
      // Healthy target: lose ~10% body weight
      const targetLoss = userWeightKg * 0.1;
      const weeksToGoal = Math.ceil(targetLoss / rate);
      lines.push(`🎯 ~${targetLoss.toFixed(0)} кг до -10%: примерно ${weeksToGoal} недель (${Math.ceil(weeksToGoal / 4)} мес)`);
      if (rate > 1) {
        lines.push('⚠️ Слишком быстро! Рекомендуется 0.5-1 кг/нед. Быстрое похудение = потеря мышц.');
      }
    } else {
      lines.push('⚠️ Вес не снижается. Проверь калорийный дефицит и активность.');
    }
  } else if (userGoal === 'MUSCLE_GAIN') {
    const oldest = bodyWeightHistory[bodyWeightHistory.length - 1];
    const newest = bodyWeightHistory[0];
    const weeksBetween = Math.max(1, (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const weeklyChange = (newest.weightKg - oldest.weightKg) / weeksBetween;

    if (weeklyChange > 0) {
      lines.push(`📈 Темп набора: ${weeklyChange.toFixed(2)} кг/нед`);
      if (weeklyChange > 0.5) {
        lines.push('⚠️ Слишком быстро — скорее всего набираешь жир. Идеально: 0.2-0.4 кг/нед.');
      }
    } else {
      lines.push('⚠️ Вес не растёт. Увеличь калорийность на 200-300 ккал/день.');
    }
  } else if (userGoal === 'STRENGTH') {
    if (totalWorkoutsEver >= 10 && weeklyWorkouts >= 2) {
      lines.push('📊 При 3+ тренировках/нед с прогрессивной перегрузкой — заметный рост силы через 4-8 недель');
    }
  }

  if (lines.length === 0) return '';

  return `\n\n## 🗓️ ПРОГНОЗ ПО ЦЕЛИ
${lines.join('\n')}
→ Используй для мотивации и коррекции стратегии.`;
}
export function estimateBodyCompositionSimple(
  weightKg: number | null,
  heightCm: number | null,
  gender: string | null,
  fitnessLevel: string | null,
): string {
  if (!weightKg || !heightCm) return '';

  const bmi = weightKg / ((heightCm / 100) ** 2);

  // Navy method approximation without waist measurements
  // Use BMI + activity level as proxy
  const activityFactor = fitnessLevel === 'advanced' ? -5 : fitnessLevel === 'intermediate' ? -3 : 0;
  const genderFactor = gender?.toLowerCase() === 'female' ? 10 : 0;
  const estimatedBF = Math.round(1.2 * bmi + 0.23 * 30 - 5.4 + genderFactor + activityFactor); // rough estimate

  const clampedBF = Math.max(5, Math.min(50, estimatedBF));

  const category = clampedBF < 10 ? 'Очень низкий (атлет)' :
    clampedBF < 15 ? 'Низкий (спортивный)' :
    clampedBF < 20 ? 'Нормальный' :
    clampedBF < 25 ? 'Умеренный' :
    clampedBF < 30 ? 'Повышенный' : 'Высокий';

  const leanMass = Math.round(weightKg * (1 - clampedBF / 100));

  return `\n\n## 🏃 СОСТАВ ТЕЛА (оценка)
ИМТ: ${bmi.toFixed(1)} | ~% жира: ${clampedBF}% (${category})
Сухая масса: ~${leanMass}кг
⚠️ Оценка приблизительная. Для точности нужны замеры или DEXA.`;
}
export function detectGoalMismatch(
  statedGoal: string | null,
  workoutTypes: string[], // names of exercises
  avgReps: number,
): string {
  if (!statedGoal || workoutTypes.length === 0) return '';

  const isDoingCardio = workoutTypes.some(e => /кардио|бег|велосипед|эллипс|ходьба/i.test(e));
  const isDoingStrength = workoutTypes.some(e => /жим|присед|становая|тяга|подтягиван/i.test(e));
  const isHighReps = avgReps > 15;
  const isLowReps = avgReps > 0 && avgReps < 6;

  const mismatches: string[] = [];

  if (statedGoal === 'muscle_gain' && isHighReps && !isLowReps) {
    mismatches.push('Для набора мышц работай в диапазоне 6-12 повторений. Сейчас у тебя слишком высокие повторения.');
  }

  if (statedGoal === 'weight_loss' && !isDoingCardio && isDoingStrength) {
    mismatches.push('Для похудения добавь кардио (20-30 мин) или переключись на круговые тренировки с коротким отдыхом.');
  }

  if (statedGoal === 'strength' && isHighReps) {
    mismatches.push('Для развития силы используй 1-5 повторений с тяжёлым весом (85-95% 1ПМ).');
  }

  if (mismatches.length === 0) return '';

  return `\n\n## 🎯 ТРЕНИРОВКИ VS ЦЕЛЬ
Твоя цель: ${statedGoal === 'muscle_gain' ? 'набор мышц' : statedGoal === 'weight_loss' ? 'похудение' : 'сила'}
${mismatches.join('\n')}`;
}
export function helpChooseBarOrDumbbell(message: string): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['штанга или гантели', 'что лучше гантели', 'что лучше штанга', 'гантели или штанга', 'барбел или думбел'].some(kw => lowerMsg.includes(kw));

  if (!isRelevant) return '';

  return `\n\n🏋️ Штанга vs Гантели:

**Штанга лучше для:**
- Максимальной силы (более стабильный хват = больше веса)
- Базовых движений: присед, становая, жим лёжа
- Отслеживания прогресса (точные 2.5кг шаги)

**Гантели лучше для:**
- Устранения дисбаланса между сторонами тела
- Большей амплитуды движения (особенно в жимах)
- Упражнений в домашних условиях
- Реабилитации и работы при травмах

**Оптимально:** используйте оба. Штанга — основа, гантели — дополнение.`;
}
export function estimatePowerliftingTotal(bestLifts: Record<string, number>): string {
  const squat = Object.entries(bestLifts).find(([k]) => k.toLowerCase().includes('присед'))?.[1];
  const bench = Object.entries(bestLifts).find(([k]) => k.toLowerCase().includes('жим лёж'))?.[1];
  const deadlift = Object.entries(bestLifts).find(([k]) => k.toLowerCase().includes('становая'))?.[1];

  if (!squat && !bench && !deadlift) return '';

  const total = (squat ?? 0) + (bench ?? 0) + (deadlift ?? 0);
  const knownLifts = [squat && `присед ${squat}кг`, bench && `жим ${bench}кг`, deadlift && `становая ${deadlift}кг`].filter(Boolean);

  return `\n\n🏋️ Ваш пауэрлифтерский тоталь:
${knownLifts.join(' + ')} = **${total}кг**
${total > 500 ? '🏆 Серьёзный результат!' : total > 350 ? '💪 Хороший тоталь для любителя' : total > 200 ? '📈 Хороший старт, потенциал большой' : '🎯 Продолжайте прогрессировать!'}`;
}
export function getProperSetup(message: string): string {
  const lower = message.toLowerCase();
  const setupKeywords = ['постановка', 'исходное положение', 'как встать', 'настройка', 'setup', 'как выполнять', 'техника'];
  if (!setupKeywords.some(k => lower.includes(k))) return '';

  const exercises: Record<string, string> = {
    'присед': `🏋️ **Приседание — исходное положение:**\n• Стопы чуть шире плеч, носки развёрнуты 15-30°\n• Гриф на трапециях (low bar) или верхних дельтах (high bar)\n• Грудь вперёд, поясница нейтральная (не округлять!)\n• Взгляд прямо или чуть вниз\n• Вдох → задержка → опускаемся → выдох вверху`,
    'жим': `🏋️ **Жим лёжа — исходное положение:**\n• Глаза под грифом, лопатки сведены и опущены (как будто давишь ими в скамью)\n• 5 точек опоры: голова, лопатки, ягодицы, обе стопы\n• Хват чуть шире плеч, большой палец ВОКРУГ грифа (безопасный хват)\n• Арка (прогиб) — норма в пауэрлифтинге, для гипертрофии — минимальный`,
    'тяга': `🏋️ **Становая тяга — исходное положение:**\n• Стопы по ширине таза, гриф над серединой стопы (примерно 2-3 см от голеней)\n• Наклон → взяться за гриф → "подтяни" бёдра вниз (не приседай!)\n• Лопатки над грифом, плечи чуть впереди грифа\n• Нейтральная спина, взгляд вниз-вперёд\n• Вдох → задержка → тяни пол от себя`,
    'подтягивания': `🏋️ **Подтягивания — исходное положение:**\n• Хват чуть шире плеч, прямой или обратный\n• Из виса — сведи лопатки и опусти плечи (активный вис)\n• Тянись грудью к перекладине, не подбородком\n• Полная амплитуда: до полного разгибания внизу\n• Исключи раскачку — строгая техника > количество`,
  };

  for (const [key, val] of Object.entries(exercises)) {
    if (lower.includes(key)) return '\n\n' + val;
  }

  return '\n\n💡 Уточни упражнение — и я дам детальное описание исходного положения и техники.';
}
export function getKettlebellGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['гиря', 'гири', 'kettlebell', 'swing', 'турецкий подъём', 'махи гирей', 'тренировка с гирей'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🔔 **Тренировки с гирями:**

**Почему гири работают:**
• Нестабильный центр тяжести → активирует стабилизаторы
• Отлично сочетают силу и кардио (metabolic conditioning)
• Swing тренирует заднюю цепь лучше, чем большинство тренажёров

**Базовые упражнения с гирей:**

**1. Swing (Мах)**
Стопы шире плеч, гиря между ног → взрывное разгибание бёдер → гиря летит вперёд.
• Главное: ЭТО не приседание, а ШАРНИР в бёдрах (hip hinge)
• 3×15-20 повторений → тренирует всю заднюю цепь + кардио

**2. Turkish Get-Up (Турецкий подъём)**
Встаёшь с пола в стойку с гирей над головой. Самое комплексное упражнение.
• 3×3 на каждую руку → плечевой пояс + кор + координация

**3. Goblet Squat**
Гиря у груди → приседание. Идеален для постановки техники приседа.
• 3×10-12 → ноги + кор + равновесие

**4. Clean & Press**
Подъём гири до плеча + жим вверх. Комплексное движение всего тела.

**Вес гири для начала:**
• Мужчины: 16-24 кг | Женщины: 8-12 кг

💡 Гиря — один инвентарь, полная тренировка. Идеал для дома.`;
}
export function getResistanceBandGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['резиновые ленты', 'эспандер', 'resistance band', 'резинки', 'трубчатый эспандер', 'тренировка с лентами'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🟡 **Тренировки с резиновыми лентами:**

**Преимущества лент:**
• Переменное сопротивление: максимум в конечной точке (где мышца сильнее) → лучшее растяжение
• Портативность: тренировка где угодно
• Суставосберегающие: меньше нагрузка на суставы vs свободные веса
• Идеальны для реабилитации и разминки

**Упражнения:**

**Ноги:**
• Приседание с лентой над коленями → активирует ягодицы
• Hip thrust с лентой → максимальная нагрузка в верхней точке (где ягодицы на пике)
• Side walk (боковые шаги) → средняя ягодичная

**Верх:**
• Тяга ленты к лицу (face pull) → задние дельты + внешние ротаторы плеча
• Тяга ленты → имитация тяги верхнего блока
• Жим лентой → добавляет сопротивление к отжиманиям

**Кор:**
• Паллоф-пресс → ротационная стабильность
• Woodchop → динамика ротации

**Как выбрать ленту:**
• Тонкая жёлтая: 5-15 кг — разминка, реабилитация
• Средняя зелёная: 15-35 кг — основная работа
• Толстая синяя/чёрная: 35-65+ кг — помощь в подтягиваниях

💡 Ленты — отличное дополнение к штанге/гантелям, а не замена при силовых целях.`;
}
export function getHomeGymEssentials(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['домашний зал', 'дома тренироваться', 'home gym', 'оборудование дома', 'купить для дома', 'без зала'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🏠 **Домашний зал — что купить и в каком порядке:**

**Уровень 0 — бесплатно (только тело):**
Отжимания, подтягивания, приседания, планка, выпады
→ При правильном подходе достаточно для хорошей формы

**Уровень 1 — до 5,000 ₽:**
• Турник (дверной): 1,500-3,000 ₽ → подтягивания, вис
• Резиновые ленты (набор): 1,000-2,000 ₽ → почти всё тело

**Уровень 2 — 5,000-20,000 ₽:**
• Разборные гантели 20-40 кг: 5,000-10,000 ₽ → 80% упражнений
• Гиря 16-24 кг: 2,000-4,000 ₽ → свинги, турецкий подъём
• Брусья: 2,000-5,000 ₽ → трицепс, грудь

**Уровень 3 — 20,000-60,000 ₽:**
• Разборная штанга + блины (100-150 кг): 15,000-30,000 ₽
• Силовая рама или стойки: 10,000-30,000 ₽
→ Полноценный силовой зал

**Уровень 4 — 60,000+ ₽:**
• Регулируемая скамья
• Многофункциональный тренажёр
• Кардио: велотренажёр / беговая дорожка

**Рекомендуемый старт:**
Турник + гантели 20-40 кг + резинки = 10,000-15,000 ₽ → 90% результата за минимальные деньги

💡 Самое дорогое оборудование — то, которым не пользуются.`;
}
export function getHomeWorkoutNoEquipment(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('дома без инвентаря') || lower.includes('тренировка дома') ||
    lower.includes('без штанг') && lower.includes('дома') || lower.includes('bodyweight') ||
    lower.includes('в квартире') || lower.includes('без зала');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏠 ТРЕНИРОВКА ДОМА БЕЗ ИНВЕНТАРЯ:');
  lines.push('');
  lines.push('💪 ПЛАН A (30 мин, средний уровень):');
  lines.push('');
  lines.push('Круговая тренировка × 3 круга, отдых 60 сек между кругами:');
  lines.push('• Приседания × 20');
  lines.push('• Отжимания × 15');
  lines.push('• Планка 45 сек');
  lines.push('• Выпады × 12/сторону');
  lines.push('• Отжимания на трицепс (узкий хват) × 12');
  lines.push('• Прыжки с подтягиванием коленей × 20');
  lines.push('');
  lines.push('💪 ПЛАН Б (прогрессия на месяц):');
  lines.push('• Неделя 1–2: 3 круга × 3 тренировки/нед');
  lines.push('• Неделя 3–4: 4 круга + негативные отжимания');
  lines.push('• Месяц 2: пистолеты с поддержкой + взрывные отжимания');
  lines.push('');
  lines.push('🎯 МИНИМАЛЬНЫЙ ИНВЕНТАРЬ ДЛЯ МАКСИМУМА:');
  lines.push('• Турник на косяк (1500–2000 ₽): + подтягивания, вис, пресс');
  lines.push('• Гимнастические кольца (2500 ₽): полный арсенал');
  lines.push('• Гиря 16–24 кг: упражнений на весь год');
  return '\n\n' + lines.join('\n');
}
export function getEquipmentAccessoriesGuide(message: string): string {
  const relevant = /кистевые бинты|пояс|лямки|ремни|wraps|belt|straps|кистевые|экипировк/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('⚙️ РУКОВОДСТВО ПО ВСПОМОГАТЕЛЬНОЙ ЭКИПИРОВКЕ:');
  lines.push('');
  lines.push('🔒 АТЛЕТИЧЕСКИЙ ПОЯС:');
  lines.push('• Когда: присед/тяга >80% 1ПМ, соревнования');
  lines.push('• Зачем: повышает внутрибрюшное давление → защита позвоночника');
  lines.push('• НЕ носить: на лёгких весах — ослабит кор');
  lines.push('• Выбор: кожаный 10 мм (пауэрлифтинг) или нейлоновый (тренировки)');
  lines.push('');
  lines.push('🤲 КИСТЕВЫЕ БИНТЫ:');
  lines.push('• Жим лёжа, жим стоя — стабилизация запястья');
  lines.push('• Не для каждого подхода — усиляет слабое место, не развивает его');
  lines.push('• Длина: 30–60 см (короткие — тренировки, длинные — соревнования)');
  lines.push('');
  lines.push('🔗 ЛЯМКИ/РЕМНИ:');
  lines.push('• Тяга, подтягивания — когда хват отказывает раньше спины');
  lines.push('• НЕ использовать на каждой тренировке — развивай хват отдельно');
  lines.push('• Альтернатива: крюки (hook grips), нейтральный хват');
  lines.push('');
  lines.push('🦵 НАКОЛЕННИКИ vs БИНТЫ:');
  lines.push('• Рукава (sleeves): тепло + компрессия — ежедневно');
  lines.push('• Бинты: +10–15 кг на присед, соревнования/максы');
  return '\n\n' + lines.join('\n');
}
export function getHomeGymBudget(message: string): string {
  const relevant = /домашний зал|купить инвентарь|оборудование дома|home gym|тренировки дома.+инвентарь/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏠 ДОМАШНИЙ СПОРТЗАЛ — с чего начать:');
  lines.push('');
  lines.push('🥉 БЮДЖЕТ 3–5 тыс. ₽ (минимум):');
  lines.push('• Резиновые петли/эспандеры — набор 5 уровней');
  lines.push('• Коврик для пола');
  lines.push('• Перекладина в дверной проём');
  lines.push('→ Подтягивания, отжимания, работа с резиной, пресс');
  lines.push('');
  lines.push('🥈 БЮДЖЕТ 10–20 тыс. ₽:');
  lines.push('• Разборные гантели 2–24 кг (турок)');
  lines.push('• Скакалка скоростная');
  lines.push('• Параллельные брусья (или напольные)');
  lines.push('→ 80% упражнений из зала');
  lines.push('');
  lines.push('🥇 БЮДЖЕТ 50–100 тыс. ₽:');
  lines.push('• Штанга + блины 150 кг набор');
  lines.push('• Скамья с регулируемым углом');
  lines.push('• Рама (силовая рама) для безопасного приседа');
  lines.push('→ Полноценные силовые тренировки');
  lines.push('');
  lines.push('💡 ПРИОРИТЕТ: штанга + блины > тренажёры (универсальнее)');
  return '\n\n' + lines.join('\n');
}
export function getBarbellRowVariations(message: string): string {
  const relevant = /тяга.+наклон|barbell row|тяга штанги.+наклон|варианты тяги|row variations/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏋️ ВАРИАНТЫ ТЯГИ ШТАНГИ В НАКЛОНЕ:');
  lines.push('');
  lines.push('📋 ОСНОВНЫЕ ВАРИАНТЫ:');
  lines.push('• Пронация (хват сверху): акцент задние дельты + верх спины');
  lines.push('• Супинация (хват снизу): акцент широчайшие + бицепс');
  lines.push('• Угол наклона корпуса 45°: баланс верх/широчайшие');
  lines.push('• Угол 30° (почти горизонтально): акцент широчайшие');
  lines.push('');
  lines.push('⚙️ PENDLAY ROW (с пола):');
  lines.push('• Каждое повторение с пола (строгий стоп)');
  lines.push('• Взрывная тяга → больше мощности');
  lines.push('• Меньше нагрузки на поясницу (нет постоянного напряжения)');
  lines.push('');
  lines.push('🎯 ТЯГА ГАНТЕЛЕЙ В НАКЛОНЕ (альтернатива):');
  lines.push('• Больший диапазон движения');
  lines.push('• Независимое движение рук = устранение асимметрии');
  lines.push('• Опора одной рукой = меньше нагрузки на поясницу');
  lines.push('');
  lines.push('💡 ТЯНИ ЛОКОТЬ К БЕДРУ, не к потолку — так лучше работает спина');
  return '\n\n' + lines.join('\n');
}
export function getPosteriorChainDev(message: string): string {
  const keywords = ['задняя цеп', 'posterior chain', 'задняя поверхн', 'зпб', 'ягодиц и бицепс бедра', 'задняя мышечн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔗 РАЗВИТИЕ ЗАДНЕЙ ЦЕПИ:');
  lines.push('');
  lines.push('📐 ЧТО ВХОДИТ: ягодицы → бицепс бедра → разгибатели спины → трапеции');
  lines.push('');
  lines.push('❓ ПОЧЕМУ ВАЖНО:');
  lines.push('• Профилактика травм поясницы и коленей');
  lines.push('• Взрывная сила и спринт');
  lines.push('• Правильная осанка');
  lines.push('• Баланс с передней цепью (квадрицепсы часто доминируют)');
  lines.push('');
  lines.push('💪 ТОП УПРАЖНЕНИЙ:');
  lines.push('• Становая тяга (классика и сумо): король задней цепи');
  lines.push('• Румынская тяга: бицепс бедра + ягодицы');
  lines.push('• Hip thrust: максимальная активация ягодиц');
  lines.push('• Гиперэкстензия: разгибатели спины');
  lines.push('• GHR (glute-ham raise): бицепс бедра в эксцентрике');
  lines.push('• Свинги с гирей: взрывная сила + кондиция');
  lines.push('');
  lines.push('📋 ПРОГРАММА: минимум 2 движения задней цепи на каждую тренировку ног');
  lines.push('🎯 Соотношение квадрицепсы:задняя цепь = 1:1 по объёму');
  return '\n\n' + lines.join('\n');
}
export function getGymEquipmentMaintenance(message: string): string {
  const keywords = ['оборудование', 'домашн зал', 'уход за штанг', 'ржавчин', 'equipment', 'инвентарь', 'тренажёр дома'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔧 УХОД ЗА СПОРТИВНЫМ ОБОРУДОВАНИЕМ:');
  lines.push('');
  lines.push('🏋️ ШТАНГА:');
  lines.push('• Протирать насухо после тренировки (пот = ржавчина)');
  lines.push('• Раз в месяц: 3-в-1 масло на втулки и насечку');
  lines.push('• Не бросать пустую (без блинов) — деформация');
  lines.push('• Хранить горизонтально или в стойке');
  lines.push('');
  lines.push('🔩 ГАНТЕЛИ:');
  lines.push('• Проверять замки регулярно (раскручиваются)');
  lines.push('• Резиновые — протирать, чтобы не липли');
  lines.push('• Хром — следить за ржавчиной');
  lines.push('');
  lines.push('🪢 РЕЗИНКИ/ЭСПАНДЕРЫ:');
  lines.push('• Хранить вдали от солнца (UV разрушает латекс)');
  lines.push('• Проверять на трещины перед использованием');
  lines.push('• Срок службы: 6-12 мес при активном использовании');
  lines.push('');
  lines.push('🧹 СКАМЬЯ/СТОЙКА:');
  lines.push('• Протирать обивку антисептиком');
  lines.push('• Проверять болты раз в месяц');
  lines.push('• Смазывать подвижные части (WD-40, силиконовая смазка)');
  return '\n\n' + lines.join('\n');
}
export function getGeneticPotentialEstimation(message: string): string {
  const keywords = ['генетик', 'генетическ потенциал', 'максимум мышц', 'сколько можно набрать', 'натуральн предел', 'genetic potential'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🧬 ГЕНЕТИЧЕСКИЙ ПОТЕНЦИАЛ МЫШЕЧНОГО РОСТА:');
  lines.push('');
  lines.push('📊 МОДЕЛИ ОЦЕНКИ (для натуралов):');
  lines.push('');
  lines.push('1️⃣ Модель Лайла МакДональда:');
  lines.push('• 1 год: 10-13 кг мышц');
  lines.push('• 2 год: 5-6 кг');
  lines.push('• 3 год: 2.5-3 кг');
  lines.push('• 4+ год: 1-1.5 кг/год');
  lines.push('• Итого за карьеру: ~20-25 кг чистых мышц');
  lines.push('');
  lines.push('2️⃣ FFMI (Fat-Free Mass Index):');
  lines.push('• Формула: безжировая масса / рост² (кг/м²)');
  lines.push('• Натуральный предел: FFMI ≈ 25 (±1)');
  lines.push('• FFMI > 26: вероятно не натурально');
  lines.push('');
  lines.push('🧬 ГЕНЕТИЧЕСКИЕ ФАКТОРЫ:');
  lines.push('• Количество мышечных волокон (не меняется)');
  lines.push('• Длина мышечных брюшков');
  lines.push('• Соотношение типов волокон (I vs II)');
  lines.push('• Чувствительность рецепторов к тестостерону');
  lines.push('• Длина сухожилий и рычаги');
  lines.push('');
  lines.push('💡 Генетика определяет потолок, но 99% людей даже близко к нему не подошли');
  return '\n\n' + lines.join('\n');
}
export function getResistanceBandTrainingAdv(message: string): string {
  const keywords = ['резинк тренировк', 'resistance band', 'эспандер тренировк', 'резинки упражн', 'тренировка с резинк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🪢 ТРЕНИРОВКИ С РЕЗИНКАМИ — ПРОДВИНУТЫЙ ГАЙД:');
  lines.push('');
  lines.push('📊 ВИДЫ РЕЗИНОК:');
  lines.push('• Мини-петли (hip bands): активация ягодиц, разминка');
  lines.push('• Длинные петли (pull-up bands): ассистирование, добавочное сопротивление');
  lines.push('• Трубчатые с ручками: замена гантелей для изоляции');
  lines.push('');
  lines.push('💡 УНИКАЛЬНЫЕ ПРЕИМУЩЕСТВА:');
  lines.push('• Аккомодирующее сопротивление: нагрузка ↑ в сильной позиции');
  lines.push('• Постоянное мышечное напряжение (нет "мёртвых точек")');
  lines.push('• Лёгкие для суставов (нет инерции)');
  lines.push('• Портативность (путешествия, дом)');
  lines.push('');
  lines.push('🏋️ ПРИМЕНЕНИЕ:');
  lines.push('• Разминка/активация: 2-3 упражнения перед тренировкой');
  lines.push('• Дополнение к штанге: +резинка на жим/присед (↑ скорость в локауте)');
  lines.push('• Реабилитация: мягкая прогрессия нагрузки');
  lines.push('• Полноценная тренировка: возможна, но ↓ потенциал для гипертрофии vs свободные веса');
  lines.push('');
  lines.push('⚠️ Проверяй резинки перед использованием — изношенная может лопнуть!');
  return '\n\n' + lines.join('\n');
}
export function getMachineVsFreeWeights(message: string): string {
  const keywords = ['тренажёр vs', 'тренажёры или свободн', 'machine vs free', 'свободн вес тренажёр', 'что лучше тренажёр'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🏋️ ТРЕНАЖЁРЫ vs СВОБОДНЫЕ ВЕСА:');
  lines.push('');
  lines.push('💪 СВОБОДНЫЕ ВЕСА (штанга, гантели):');
  lines.push('• +: Функциональность, стабилизаторы, перенос на реальную жизнь');
  lines.push('• +: Больше мышц за упражнение');
  lines.push('• +: Прогрессия нагрузки проще (добавил блин)');
  lines.push('• -: Требуют технику, риск травмы при плохой форме');
  lines.push('• -: Нужен страхующий для тяжёлых подходов');
  lines.push('');
  lines.push('🔧 ТРЕНАЖЁРЫ:');
  lines.push('• +: Безопаснее (фиксированная траектория)');
  lines.push('• +: Лучшая изоляция целевой мышцы');
  lines.push('• +: Можно тренироваться без партнёра');
  lines.push('• +: Отлично для новичков и реабилитации');
  lines.push('• -: Менее функционально, не вовлекают стабилизаторы');
  lines.push('');
  lines.push('🎯 ОПТИМАЛЬНЫЙ ПОДХОД:');
  lines.push('• Начало тренировки: база со свободными весами');
  lines.push('• Добивка: тренажёры для изоляции');
  lines.push('• Новички: тренажёры для освоения паттернов → переход к свободным');
  lines.push('• Травма: тренажёры позволяют обойти боль');
  return '\n\n' + lines.join('\n');
}
export function getCableExercisesBenefits(message: string): string {
  const keywords = ['кроссовер блок', 'тросов тренажёр', 'cable exercise', 'блочн тренажёр', 'упражнения на блок'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🔗 ТРЕНИРОВКИ НА БЛОКАХ (КРОССОВЕР):');
  lines.push('');
  lines.push('✅ ПРЕИМУЩЕСТВА БЛОКОВ:');
  lines.push('• Постоянное напряжение (нет "мёртвых точек" как с гантелями)');
  lines.push('• Свободный вектор нагрузки (любой угол)');
  lines.push('• Безопасно (нет риска уронить снаряд)');
  lines.push('• Идеально для изоляции и добивки');
  lines.push('');
  lines.push('💪 ЛУЧШИЕ УПРАЖНЕНИЯ НА БЛОКАХ:');
  lines.push('• Face pulls: задние дельты + ротаторная манжета');
  lines.push('• Разводки в кроссовере: грудные (постоянное напряжение)');
  lines.push('• Тяга к поясу нижнего блока: спина');
  lines.push('• Трицепс на верхнем блоке: максимальная изоляция');
  lines.push('• Сгибания на нижнем блоке: бицепс с постоянным сопротивлением');
  lines.push('• Pallof press: антиротация кора');
  lines.push('• Woodchop: ротация + кор');
  lines.push('');
  lines.push('📋 КОГДА ИСПОЛЬЗОВАТЬ:');
  lines.push('• После базовых упражнений');
  lines.push('• Для суперсетов (быстрая смена веса)');
  lines.push('• При травмах (более контролируемая нагрузка)');
  lines.push('• Для разминки и активации');
  return '\n\n' + lines.join('\n');
}
export function getDumbbellVsBarbell(message: string): string {
  const kw = /гантел.*штанг|штанг.*гантел|dumbbell.*barbell|что.*лучше.*гантел|что.*лучше.*штанг|свободн.*вес/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏋️ ГАНТЕЛИ VS ШТАНГА — ПОЛНОЕ СРАВНЕНИЕ:');
  lines.push('');
  lines.push('📊 Штанга (преимущества):');
  lines.push('• Больший абсолютный вес → выше механическое напряжение');
  lines.push('• Стабильная траектория → проще прогрессировать');
  lines.push('• Удобнее для базовых: присед, жим, тяга');
  lines.push('• Двусторонняя нагрузка → больше общая сила');
  lines.push('');
  lines.push('📊 Гантели (преимущества):');
  lines.push('• Бо́льшая амплитуда движения');
  lines.push('• Каждая сторона работает независимо → выявляет дисбалансы');
  lines.push('• Безопаснее без страхующего (можно сбросить)');
  lines.push('• Больше стабилизаторов задействовано');
  lines.push('• Разнообразие углов и позиций');
  lines.push('');
  lines.push('📋 Когда что использовать:');
  lines.push('• Сила и мощность → штанга (присед, жим, тяга)');
  lines.push('• Гипертрофия → микс (штанга для тяжёлых, гантели для добивки)');
  lines.push('• Реабилитация → гантели (контроль, односторонняя работа)');
  lines.push('• Домашний зал → гантели (компактнее, универсальнее)');
  lines.push('');
  lines.push('💡 Идеальная программа: основа на штанге + добивка гантелями');
  lines.push('Пример: жим штанги 4×6 → жим гантелей наклонный 3×10 → разводка 3×12');
  return '\n\n' + lines.join('\n');
}
export function getCableMachineGuide(message: string): string {
  const kw = /кроссовер|блочн.*тренажёр|блочн.*тренажер|cable.*machine|тросов|блок.*упражн|нижн.*блок|верхн.*блок.*упр/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔗 БЛОЧНЫЕ ТРЕНАЖЁРЫ — ПОЛНОЕ РУКОВОДСТВО:');
  lines.push('');
  lines.push('✅ Преимущества блоков:');
  lines.push('• Постоянное натяжение на всей амплитуде');
  lines.push('• Свобода углов (любое направление тяги)');
  lines.push('• Безопасность (нет риска уронить вес)');
  lines.push('• Идеальны для изоляции и финишеров');
  lines.push('');
  lines.push('🏋️ Лучшие упражнения по группам:');
  lines.push('• Грудь: сведения в кроссовере (верх/низ/середина)');
  lines.push('• Спина: тяга нижнего блока, пуловер на верхнем блоке');
  lines.push('• Плечи: разведения в стороны, face pulls');
  lines.push('• Бицепс: сгибания на нижнем блоке (постоянное натяжение!)');
  lines.push('• Трицепс: разгибания на верхнем блоке, французский жим');
  lines.push('• Пресс: скручивания на верхнем блоке (молитва)');
  lines.push('• Ягодичные: отведение ноги назад');
  lines.push('');
  lines.push('💡 Продвинутые техники:');
  lines.push('• Дроп-сеты: просто переставь штырь (5 секунд)');
  lines.push('• Механические дроп-сеты: меняй угол, не вес');
  lines.push('• Iso-hold: пауза в точке пикового сокращения 2-3с');
  lines.push('');
  lines.push('📊 Место в программе: после базовых со свободными весами');
  return '\n\n' + lines.join('\n');
}
export function getSmithMachineExercises(message: string): string {
  const kw = /смит|smith.?machine|тренажёр.*смит|тренажер.*смит|направляющ.*штанг/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🏗️ ТРЕНАЖЁР СМИТА — КОГДА ИСПОЛЬЗОВАТЬ:');
  lines.push('');
  lines.push('📊 Преимущества:');
  lines.push('• Безопасность: стопоры ловят штангу');
  lines.push('• Тренировка без партнёра — можно работать до отказа');
  lines.push('• Изоляция целевых мышц (убраны стабилизаторы)');
  lines.push('• Обратные выпады в Смите — стабильность для коленей');
  lines.push('');
  lines.push('⚠️ Недостатки:');
  lines.push('• Фиксированная траектория → неестественный паттерн движения');
  lines.push('• Меньше активации стабилизаторов');
  lines.push('• НЕ замена свободным весам для новичков');
  lines.push('• Приседания в Смите — спорно (изменённая биомеханика)');
  lines.push('');
  lines.push('✅ Лучшие упражнения в Смите:');
  lines.push('• Hip thrust (удобнее, чем со свободной штангой)');
  lines.push('• Обратные выпады (стабильность)');
  lines.push('• Жим лёжа наклонный (безопасный отказ)');
  lines.push('• Шрагги (тяжёлый вес без хвата)');
  lines.push('• Подъёмы на носки (большая нагрузка)');
  lines.push('');
  lines.push('❌ Не стоит делать:');
  lines.push('• Приседания со штангой → лучше свободные или жим ногами');
  lines.push('• Жим стоя → Смит блокирует естественный path штанги');
  lines.push('• Любые олимпийские движения');
  lines.push('');
  lines.push('💡 Место в программе: дополнение к свободным весам, не замена');
  return '\n\n' + lines.join('\n');
}
export function getResistanceBandsOnly(message: string): string {
  const kw = /резинк.*тренир|тренир.*резинк|фитнес.*резинк|эспандер.*тренир|resistance.*band.*only|дома.*резинк|без.*зал.*резинк/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('💪 ПОЛНОЦЕННАЯ ТРЕНИРОВКА С РЕЗИНКАМИ:');
  lines.push('');
  lines.push('📊 Преимущества:');
  lines.push('• Линейное сопротивление (чем больше растянул, тем тяжелее)');
  lines.push('• Акцент на пиковое сокращение (свободные веса — наоборот)');
  lines.push('• Компактность, доступность, безопасность');
  lines.push('• Постоянное натяжение = хорошая мышечная связь');
  lines.push('');
  lines.push('🏋️ Программа полного тела:');
  lines.push('• Грудь: отжимания с резинкой на спине, сведения');
  lines.push('• Спина: тяга к поясу стоя, тяга к лицу');
  lines.push('• Плечи: разведения в стороны, жим вверх');
  lines.push('• Бицепс: сгибания стоя на резинке');
  lines.push('• Трицепс: разгибания за головой');
  lines.push('• Ноги: приседания с резинкой, румынская тяга');
  lines.push('• Ягодичные: мостик с мини-бэндом, отведения');
  lines.push('');
  lines.push('📐 Набор резинок для дома:');
  lines.push('• Мини-бэнды (3 уровня): разминка, ягодичные');
  lines.push('• Длинные петли (3-4 уровня): основные упражнения');
  lines.push('• Трубчатые с рукоятками: удобство для рук');
  lines.push('');
  lines.push('⚠️ Ограничения:');
  lines.push('• Для максимальной гипертрофии — недостаточно (нужны тяжёлые веса)');
  lines.push('• Сложно точно прогрессировать (нет точных кг)');
  lines.push('• Отлично для поддержания, реабилитации, путешествий');
  return '\n\n' + lines.join('\n');
}
export function getProperBreathingExercise(message: string): string {
  const kw = /дыхан.*упражн|как.*дышать.*тренир|дышать.*при.*жим|дышать.*присед|задерж.*дыхан.*вес/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🌬️ ПРАВИЛЬНОЕ ДЫХАНИЕ ПРИ УПРАЖНЕНИЯХ:');
  lines.push('');
  lines.push('📐 Базовый паттерн:');
  lines.push('• Вдох — на эксцентрике (опускание/растяжение)');
  lines.push('• Выдох — на концентрике (подъём/сокращение)');
  lines.push('• Пример жим лёжа: вдох при опускании, выдох при жиме вверх');
  lines.push('');
  lines.push('🏋️ Вальсальва (для тяжёлых базовых):');
  lines.push('• Глубокий вдох, задержка, напрягаем кор');
  lines.push('• Создаёт внутрибрюшное давление → стабилизация позвоночника');
  lines.push('• Применять при 80%+ от 1ПМ');
  lines.push('• Выдох после прохождения мёртвой точки');
  lines.push('• ⚠️ Повышает артериальное давление! Не при гипертонии');
  lines.push('');
  lines.push('📊 По упражнениям:');
  lines.push('• Присед: вдох стоя → задержка → сел-встал → выдох вверху');
  lines.push('• Становая: вдох → задержка → тянем → выдох после локаута');
  lines.push('• Жим лёжа: вдох при спуске → задержка → жим → выдох');
  lines.push('• Подтягивания: выдох при подъёме, вдох при спуске');
  lines.push('• Изоляция: свободное дыхание, выдох на усилии');
  lines.push('');
  lines.push('❌ Частые ошибки:');
  lines.push('• Задержка дыхания на всю серию');
  lines.push('• Поверхностное дыхание (не набирает воздух)');
  lines.push('• Дыхание через рот при кардио (нос → рот при высокой интенсивности)');
  return '\n\n' + lines.join('\n');
}
export function getCableCrossoverVar(message: string): string {
  const keywords = ['кроссовер', 'crossover', 'сведение', 'грудь кабель', 'блок грудь', 'разводка блок'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[ВАРИАЦИИ КРОССОВЕРА — ПОЛНАЯ ПРОРАБОТКА ГРУДНЫХ]
Кабельный кроссовер — единственное упражнение с постоянным натяжением во всей амплитуде.

Варианты по углу:
1. Верхний блок (стандарт): нижняя часть груди
   - Блоки сверху, руки сводятся внизу перед собой
   - Наклон корпуса 15-20°, шаг вперёд одной ногой

2. Средний блок: средняя часть груди
   - Блоки на уровне плеч, руки сводятся перед собой
   - Корпус прямой, лёгкий наклон вперёд

3. Нижний блок: верхняя часть груди
   - Блоки снизу, руки поднимаются и сводятся вверх
   - Движение снизу-вверх и к центру

Техника (все варианты):
- Локти слегка согнуты (15-20°) и зафиксированы
- Движение только в плечевом суставе
- Пиковое сокращение 1-2 сек при сведении
- Медленная негативная фаза (3 сек)
- 3-4 × 12-15 повторений

Продвинутые техники:
- Односторонний кроссовер — больше растяжка и амплитуда
- Кроссовер с паузой в растянутой позиции (2 сек)
- Дроп-сет: 3 сброса веса без отдыха`;
}
export function getCablePullThrough(message: string): string {
  const keywords = ['pull-through', 'pull through', 'протяжка в кроссовере', 'кабельная протяжка', 'тяга между ног'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔗 КАБЕЛЬНАЯ ПРОТЯЖКА (PULL-THROUGH):

Что это:
Тазодоминантное упражнение на блоке:
нижний блок, канатная рукоять между ног,
движение — разгибание бедра (как становая тяга, но без осевой нагрузки).

Целевые мышцы:
- Ягодицы (максимальная активация в верхней точке)
- Задняя поверхность бедра
- Разгибатели спины (стабилизация)

Техника:
1. Встать спиной к блоку, канат между ног
2. Шаг вперёд (чтобы вес не лежал на стеке)
3. Наклон вперёд: таз назад, спина прямая
4. Руки расслаблены — тянут только ягодицы и бёдра
5. Мощное разгибание бедра → сжать ягодицы в верхней точке
6. Пауза 1-2 сек наверху

Преимущества:
- Нет осевой нагрузки на позвоночник
- Постоянное натяжение (кабель ≠ свободный вес)
- Учит паттерну hip hinge (подготовка к становой)
- Безопасно для поясницы

Программирование:
- 3-4×12-20 повторений
- Accessory после приседов/тяг
- Суперсет с hip thrust
- Отличный разминочный паттерн перед становой`;
}
export function getPendulumReverseHyperMachine(message: string): string {
  const keywords = ['пендулум реверс', 'pendulum reverse hyper', 'обратная гиперэкстензия тренажёр', 'луи симмонс гипер'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔄 МАЯТНИКОВАЯ ОБРАТНАЯ ГИПЕРЭКСТЕНЗИЯ:

Что это:
Тренажёр Луи Симмонса (Westside Barbell).
Уникальное упражнение: одновременно тренирует
и декомпрессирует позвоночник.

Целевые мышцы:
- Ягодицы (основная нагрузка)
- Задняя поверхность бедра
- Разгибатели спины
- Мышцы тазового дна

Уникальные преимущества:
- Тракция (растяжение) позвоночника в нижней фазе
- Укрепление задней цепи без осевой нагрузки
- Реабилитация грыж и протрузий (под контролем врача)
- Улучшает подвижность поясницы

Техника:
1. Лечь животом на подушку, бёдра на краю
2. Ноги в педалях/роликах
3. Маятниковое движение: разгибание бедра
4. Без рывков — плавный контроль
5. Не переразгибать поясницу в верхней точке

Программирование:
- Реабилитация: 4×15-25, лёгкий вес
- Сила: 3×10-12, тяжёлый вес
- Можно каждую тренировку (малая нагрузка на ЦНС)
- Отлично перед становой (активация + декомпрессия)

Альтернатива без тренажёра: обратная гиперэкстензия на скамье.`;
}
export function getCableLateralRaise(message: string): string {
  const keywords = ['махи в кроссовере', 'cable lateral', 'кабельные махи', 'блок махи в стороны', 'боковые подъёмы блок'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔗 МАХИ В СТОРОНЫ НА БЛОКЕ:

Преимущества перед гантелями:
- Постоянное натяжение по всей амплитуде
- Гантели: нагрузка максимальна наверху, ноль внизу
- Кабель: нагрузка одинакова на протяжении всего ROM
- Меньше читинга (нельзя раскачиваться)
- Лучше для mind-muscle connection

Вариации:
1. Стоя боком к блоку (одной рукой):
   - Блок снизу → классическая траектория
   - Блок за спиной → больше растяжка дельты
   - Блок перед собой → акцент на заднюю дельту

2. Стоя лицом к блоку (двумя руками, крест-накрест):
   - Берёшь левую рукоять правой рукой и наоборот
   - Растяжение в нижней точке максимальное

3. Сидя на скамье:
   - Убирает раскачку
   - Чистейшая изоляция

Техника:
- Слегка наклониться от блока (увеличить ROM)
- Вести локтём, не кистью
- Не поднимать выше плеча (трапеция)
- 2 сек вверх, 1 сек пауза, 3 сек вниз

Программирование:
- 3-4×12-20 повторений
- Отлично как финишер после жимов
- Чередовать с гантелями (разный профиль нагрузки)`;
}
export function getInclineDumbbellCurl(message: string): string {
  const keywords = ['наклонные сгибания', 'incline curl', 'сгибания на наклонной', 'бицепс наклонная скамья', 'растяжение бицепса'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
💪 СГИБАНИЯ НА НАКЛОННОЙ СКАМЬЕ:

Почему это лучшее упражнение на бицепс:
- Максимальное растяжение длинной головки
- Растяжение под нагрузкой = #1 фактор гипертрофии
- Плечо отведено назад → полный ROM бицепса
- Невозможно читинговать (корпус зафиксирован)

Техника:
1. Скамья 45-60° (чем ниже, тем больше растяжка)
2. Руки свисают вертикально вниз
3. Супинация (ладони вперёд) с самого начала
4. Медленный подъём (2 сек) до пикового сокращения
5. Контролируемое опускание (3-4 сек!)
6. Полное разгибание внизу (не сгибать локти)

Вариации:
- 45° наклон: стандарт, хороший баланс
- 30° наклон: максимум растяжки, очень тяжело
- Одной рукой: лучший фокус
- С супинацией: нейтральный хват → супинация наверху
- 21s: 7 нижняя часть + 7 верхняя + 7 полных

Частые ошибки:
- Слишком тяжёлый вес (теряется растяжка)
- Подъём плеч (передняя дельта включается)
- Неполная амплитуда внизу
- Быстрое опускание (теряется эксцентрик)

Программирование:
- 3×8-12 повторений
- Первое изолирующее упражнение на бицепс
- Вес на 20-30% меньше обычных сгибаний`;
}
export function getPotassiumAthletes(message: string): string {
  const keywords = ['калий спортсмен', 'potassium athlete', 'калий судороги', 'калий мышцы', 'гипокалиемия'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🍌 КАЛИЙ ДЛЯ СПОРТСМЕНОВ:

Зачем:
- Мышечные сокращения (Na/K-насос)
- Нервная проводимость
- Баланс жидкости (контр-натрию)
- Сердечный ритм
- Синтез гликогена

Потребность:
- Обычный человек: 3500-4700 мг/день
- Спортсмен: 4700-6000 мг/день
- Потери с потом: 150-300 мг/литр

Симптомы дефицита:
- Мышечные судороги и спазмы
- Слабость и утомляемость
- Аритмии (опасно!)
- Запоры
- Мышечная ригидность

Лучшие источники (на 100г):
- Курага: 1162 мг
- Фасоль: 1406 мг
- Картофель (с кожурой): 535 мг
- Бананы: 358 мг (не лучший источник!)
- Авокадо: 485 мг
- Шпинат: 558 мг
- Лосось: 490 мг
- Батат: 337 мг

Добавки:
- Калия цитрат: хорошее усвоение
- Калия хлорид (NoSalt): дёшево
- НЕ более 99мг в капсуле (FDA ограничение)
- Лучше из пищи (большие дозы добавок = ЖКТ)

ВАЖНО: избыток калия опасен (гиперкалиемия)!
Не принимать добавки без анализа крови при проблемах с почками.`;
}
export function getBenchWithChains(message: string): string {
  const keywords = ['жим с цепями', 'bench chains', 'цепи жим лёжа', 'аккомодирующее сопротивление', 'вестсайд цепи'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
⛓️ ЖИМ ЛЁЖА С ЦЕПЯМИ:

Принцип:
Аккомодирующее сопротивление — вес увеличивается
по мере подъёма штанги (цепи поднимаются с пола).
Внизу: лёгче (меньше цепи висит). Вверху: тяжелее.

Зачем:
- Тренирует локаут (верхнюю часть жима)
- Учит ускорять штангу (нельзя замедлиться наверху)
- Развивает скоростную силу
- Снижает нагрузку в нижней точке (безопаснее для плеч)
- Метод Westside Barbell (Луи Симмонс)

Настройка:
- Цепи: 10-20% от рабочего веса на штанге
- Пример: жим 100кг → 80кг штанга + 20кг цепи
- Цепи крепятся на концы грифа
- Должны полностью лежать на полу в нижней точке

Программирование:
- Скоростной день: 8-10×3 с 50-60% + цепи (взрывная сила)
- Максимальный день: 3-5×3-5 с 80-85% + цепи
- Отдых: 60-90 сек (скоростной), 3-5 мин (максимальный)

Альтернатива: резиновые ленты (bands).
Разница: цепи — линейная прогрессия, ленты — экспоненциальная.

Кому подходит:
- Пауэрлифтерам (слабый локаут)
- Продвинутым атлетам (базовая сила уже есть)
- НЕ для новичков (сначала — чистая техника)`;
}
export function getSeatedCableRow(message: string): string {
  const keywords = ['тяга нижнего блока', 'seated cable row', 'тяга сидя', 'горизонтальная тяга блок', 'тяга к поясу сидя'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔗 ТЯГА НИЖНЕГО БЛОКА (SEATED ROW):

Рукояти и акценты:
- V-рукоять (узкая): акцент на среднюю часть спины, ромбовидные
- Широкая рукоять (прямой хват): верхняя часть спины, задние дельты
- Канатная рукоять: свобода траектории, ротация
- Одна D-рукоять: односторонняя работа

Техника:
1. Сидя, упор ногами, колени слегка согнуты
2. Хват рукояти, спина прямая, грудь вперёд
3. Начало: лёгкое растяжение (не округлять!)
4. Тяга к животу: локти назад вдоль тела
5. Сведение лопаток в конечной точке (пауза 1 сек)
6. Контролируемое возвращение с растяжкой

Частые ошибки:
- Раскачка корпусом (поясница работает вместо спины)
- Тяга руками (бицепсы вместо широчайших)
- Округление спины при растяжении
- Слишком короткая амплитуда

Вариации:
- С наклоном вперёд (растяжение): больший ROM
- Без наклона (строго вертикально): изоляция
- Одной рукой: коррекция дисбаланса
- Широким хватом к груди: верх спины

Программирование:
- 3-4×10-15 повторений
- Второе/третье упражнение на спину
- Чередовать рукояти каждую тренировку`;
}
export function getCableFlyCrossover(message: string): string {
  const keywords = ['кроссовер', 'cable fly', 'сведение в кроссовере', 'сведение рук', 'кабельная разводка', 'блочная разводка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 СВЕДЕНИЕ РУК В КРОССОВЕРЕ — ПОЛНЫЙ ГАЙД:

Преимущества перед гантелями:
- Постоянное натяжение во всей амплитуде
- Пиковое сокращение в конечной точке
- Меньше нагрузка на плечевой сустав
- Вариативность углов без смены оборудования

Верхний блок (акцент на нижнюю часть груди):
- Блоки выше головы, шаг вперёд
- Сведение рук вниз-вперёд на уровне пупка
- Корпус наклонён слегка вперёд
- Локти чуть согнуты и зафиксированы

Средний блок (средняя часть груди):
- Блоки на уровне плеч
- Сведение рук прямо перед собой
- Классическое движение «обнимаем дерево»

Нижний блок (акцент на верхнюю часть груди):
- Блоки внизу, сведение вверх
- Имитирует разводку гантелей на наклонной
- Отличная альтернатива для верхней груди

Техника (все варианты):
- Лопатки сведены, грудь вперёд
- Движение дугообразное, не жимовое
- Пиковое сжатие 1-2 секунды в конце
- Негатив медленный (3 секунды)
- Вес умеренный — чувствуйте грудь, не плечи

Параметры:
- 3-4 × 12-15 повторений
- Изоляция — делать ПОСЛЕ тяжёлых жимов
- Отлично для дроп-сетов и суперсетов
- Можно одной рукой для лучшей связи мозг-мышца`;
}
export function getDumbbellPulloverDetailed(message: string): string {
  const keywords = ['пуловер гантель', 'dumbbell pullover', 'пуловер лёжа', 'пуловер на скамье', 'растяжка грудной клетки'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 ПУЛОВЕР С ГАНТЕЛЕЙ — ДЕТАЛЬНЫЙ ГАЙД:

Уникальность: единственное упражнение, работающее и на грудь, и на спину одновременно.

Целевые мышцы (зависят от техники):
- Акцент на грудь: согнутые руки, сжатие в верхней точке
- Акцент на широчайшие: прямые руки, тяга локтями
- Зубчатые мышцы (serratus anterior)
- Длинная головка трицепса
- Межрёберные мышцы

Техника:
1. Поперёк скамьи (только лопатки на скамье) — классика
2. Или вдоль скамьи — стабильнее, проще
3. Гантель обеими руками за верхний блин
4. Руки слегка согнуты, зафиксированы
5. Опускаем за голову до максимального растяжения
6. Подъём в исходное, сжатие грудных/широчайших
7. Таз не поднимать и не опускать

Поперёк vs вдоль скамьи:
- Поперёк: больший ROM, растяжение грудной клетки, работа зубчатых
- Вдоль: стабильнее, безопаснее для новичков, меньше нагрузка на поясницу

Программирование:
- 3×12-15 повторений
- Лёгкий-средний вес (контроль важнее веса)
- В конце тренировки груди или спины
- Темп: 2 секунды вниз, пауза, 2 секунды вверх

Миф: «расширяет грудную клетку». У взрослых — нет. У подростков до закрытия зон роста — возможно.`;
}
export function getMachineChestPressGuide(message: string): string {
  const keywords = ['жим в тренажёре', 'machine press', 'хаммер жим', 'hammer strength', 'тренажёр грудь жим'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ЖИМ В ТРЕНАЖЁРЕ — ПОЛНЫЙ ГАЙД:

Преимущества перед свободными весами:
- Безопасность (нет риска уронить штангу)
- Фиксированная траектория = изоляция грудных
- Не нужен страхующий
- Идеально для отказных подходов и дроп-сетов
- Меньше работа стабилизаторов (больше целевой мышцы)

Типы тренажёров:
- Hammer Strength (рычажные): ближе к свободным весам, каждая рука независимо
- Блочные (тросовые): плавное сопротивление
- С фиксированной траекторией: самые безопасные
- Наклонные: акцент на верхнюю грудь

Техника:
1. Высота сиденья: ручки на уровне средней/нижней груди
2. Лопатки сведены, грудь вперёд
3. Стопы устойчиво на полу
4. Жим до полного выпрямления рук
5. Контролируемое возвращение (растяжение грудных)
6. НЕ расслабляться в нижней точке

Когда использовать:
- Добивка после тяжёлых жимов со штангой
- Дроп-сеты (быстрая смена веса)
- Реабилитация (безопасная траектория)
- Новички (освоение жимового паттерна)
- Одной рукой: коррекция асимметрии (Hammer Strength)

Параметры: 3-4×10-15. Темп: 2-1-3 (жим-пауза-негатив).`;
}
export function getCableLateralRaiseDet(message: string): string {
  const keywords = ['боковые подъёмы блок', 'cable lateral raise', 'разведение на блоке', 'средняя дельта блок', 'махи на блоке'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🎯 РАЗВЕДЕНИЕ РУК НА БЛОКЕ — ДЕТАЛЬНЫЙ ГАЙД:

Преимущества перед гантелями:
- Постоянное натяжение (нет мёртвой зоны внизу)
- Пиковая нагрузка в верхней точке сохраняется
- Вектор сопротивления горизонтальный (не вертикальный)
- Лучшая связь мозг-мышца
- Плавность движения

Вариации:
1. За спиной (через тело):
   - Блок с противоположной стороны, трос за спиной
   - Максимальное растяжение средней дельты
   - Лучший вариант для гипертрофии

2. Перед собой:
   - Блок с той же стороны
   - Короче амплитуда, но удобная позиция
   - Хорош для дроп-сетов

3. Двумя руками (кроссовер):
   - Оба блока одновременно
   - Экономия времени

Техника:
- Лёгкий наклон в сторону рабочей руки
- Подъём до уровня плеча (не выше — трапеция)
- Мизинец чуть выше большого пальца
- Контролируемый негатив 3 секунды
- НЕ дёргать, НЕ раскачиваться

Параметры:
- 3-4×12-20 повторений (средняя дельта любит объём)
- Лёгкий вес, идеальная техника
- Минимум 15-20 подходов на среднюю дельту в неделю
- Суперсет: разведения на блоке + face pull = идеальная связка`;
}
export function getKettlebellSwingGuide(message: string): string {
  const keywords = ['гиря махи', 'kettlebell swing', 'свинг', 'гиревой спорт', 'махи гирей'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🔔 МАХИ ГИРЕЙ (KETTLEBELL SWING) — ПОЛНЫЙ ГАЙД:

Почему это одно из лучших упражнений:
- Работает вся задняя цепь: ягодицы, бицепс бедра, поясница
- Кардио + сила одновременно (метаболический эффект)
- Развивает взрывную силу разгибания бёдер
- Сжигает до 20 ккал/минуту (исследование ACE)
- Минимум оборудования — одна гиря

Русский vs Американский свинг:
- Русский: до уровня груди (StrongFirst, Pavel Tsatsouline)
- Американский: над головой (CrossFit)
- Русский безопаснее для плеч и эффективнее для задней цепи

Техника (русский свинг):
1. Гиря между ног, ноги чуть шире плеч
2. Наклон от бёдер (НЕ приседание)
3. Взрывное разгибание бёдер — гиря летит вперёд
4. Руки — направляющие, НЕ поднимают гирю
5. Верхняя точка: гиря на уровне груди, руки параллельно полу
6. Контролируемый обратный мах между ног

Выбор веса:
- Мужчины начинающие: 16 кг
- Мужчины подготовленные: 24-32 кг
- Женщины начинающие: 8-12 кг
- Женщины подготовленные: 16-24 кг

Протоколы:
- Простая и действенная: 10×10 за минимальное время
- Табата: 20 сек работа / 10 сек отдых × 8 раундов
- EMOM: 15-20 махов каждую минуту × 10 минут`;
}
export function getCableRowVariations(message: string): string {
  const relevant = /тяг.+блок.+вариа|cable.?row|тросов.+тяг|блочн.+тяг.+виды|нижн.+блок.+тяг|верхн.+блок/i.test(message);
  if (!relevant) return '';
  return `
🔗 ТЯГИ НА БЛОКЕ — ВСЕ ВАРИАЦИИ И ТЕХНИКА:

1. Тяга нижнего блока сидя (Seated Cable Row):
   - V-рукоять: нейтральный хват, акцент на середину спины + бицепс
   - Широкая рукоять: пронированный хват, акцент на широчайшие
   - Канатная рукоять: максимальная ротация, пиковое сокращение
   Техника: грудь вперёд, лопатки назад-вниз, локти вдоль тела

2. Тяга верхнего блока (Lat Pulldown вариации):
   - Широкий хват к груди: ширина широчайших
   - Обратный хват (супинация): нижние широчайшие + бицепс
   - Нейтральный узкий хват: толщина спины, ромбовидные
   - Одной рукой: устранение дисбаланса

3. Тяга на блоке стоя:
   - Прямые руки (пуловер): изоляция широчайших без бицепса
   - Face pull: задние дельты + внешние ротаторы
   - Тяга к лицу с разведением: ромбовидные + нижняя трапеция

4. Продвинутые вариации:
   - Тяга Мидроу стоя (одна рука, блок на уровне пояса)
   - Тяга с паузой 2 сек в пиковом сокращении
   - Дроп-сеты на блоке: идеальны — быстрая смена веса
   - Тяга Байеса: одна рука, макс растяжение широчайшей

Преимущество блока над свободным весом:
- Постоянное натяжение троса во всей амплитуде
- Безопасность: нет осевой нагрузки на позвоночник
- Микро-регулировка веса (шаг 2.5-5 кг)
- Контроль темпа легче — трос не даёт «бросить»

Программирование:
- 3-4×10-15 для гипертрофии
- Начинать тренировку спины с блочных для разогрева
- Или финишировать высокоповторными после базы`;
}
export function getDumbbellCurlVariations(message: string): string {
  const relevant = /сгибани.+гантел.+вариа|подъём.+бицепс.+гантел|dumbbell.?curl|виды.+сгибан.+бицепс|как.+качать.+бицепс.+гантел/i.test(message);
  if (!relevant) return '';
  return `
💪 СГИБАНИЯ С ГАНТЕЛЯМИ — ВСЕ ВАРИАЦИИ ДЛЯ БИЦЕПСА:

1. Классические сгибания стоя:
   - Супинация (ладони вверх): длинная + короткая головки
   - Начинать с нейтрального хвата, супинировать по ходу подъёма
   - ЭМГ-активация: ~85% максимума для бицепса
   - 3×8-12, контроль эксцентрика

2. Молотковые сгибания (Hammer curl):
   - Нейтральный хват (ладони друг к другу)
   - Акцент: брахиалис + брахиорадиалис (предплечье)
   - Визуально «расширяет» руку (вид сбоку)
   - Можно поднимать больше веса — сильнее хват

3. Сгибания на наклонной скамье (Incline curl):
   - Скамья 45-60°, руки свисают вниз
   - Максимальная растяжка длинной головки бицепса
   - ЛУЧШЕЕ упражнение для пика бицепса
   - Вес на 20-30% меньше чем стоя

4. Концентрированные сгибания:
   - Сидя, локоть упирается во внутреннюю часть бедра
   - Максимальная изоляция — нет инерции
   - Акцент на пиковое сокращение (задержка вверху 1-2 сек)
   - Идеально для «добивки»

5. Сгибания Зоттмана:
   - Подъём супинированным хватом → опускание пронированным
   - Бицепс в концентрике + предплечья в эксцентрике
   - Два в одном: бицепс + предплечья

6. Перекрёстные сгибания (Cross-body curl):
   - Гантель поднимается к противоположному плечу
   - Акцент на длинную головку бицепса
   - Хорошо прорабатывает «внешнюю» часть

7. Сгибания с вращением (Spider curl на наклонной):
   - Лёжа грудью на наклонной скамье (~45°)
   - Руки свисают перпендикулярно полу
   - Постоянное напряжение, нет мёртвой точки

Программа для максимального бицепса:
- Упражнение 1: Молотковые 3×8-10 (тяжёлые)
- Упражнение 2: На наклонной 3×10-12 (растяжка)
- Упражнение 3: Концентрированные 2×12-15 (пиковое сокращение)`;
}
export function getCableKickbackGuide(message: string): string {
  const relevant = /отведени.+блок.+ягодиц|кикбэк.+блок|cable.?kickback|ягодиц.+блок.+техник|отведен.+ног.+назад.+блок/i.test(message);
  if (!relevant) return '';
  return `
🍑 ОТВЕДЕНИЕ НОГИ НАЗАД НА БЛОКЕ (CABLE KICKBACK):

Целевые мышцы:
- Большая ягодичная (основная)
- Средняя ягодичная (стабилизация)
- Задняя поверхность бедра (вспомогательная)
- ЭМГ-активация ягодичных: ~85% от максимума

Техника:
1. Манжета на голеностоп, нижний блок
2. Встать лицом к блоку, руки на раме для опоры
3. Слегка согнуть опорную ногу (5-10°)
4. Отвести рабочую ногу НАЗАД, сжимая ягодицу
5. Нога почти прямая (лёгкий изгиб в колене)
6. НЕ прогибать поясницу — движение в тазобедренном суставе
7. Медленный возврат (3 сек эксцентрик)

Ключевые моменты:
- Думать о ягодице, а не о ноге (мышечно-мозговая связь)
- Небольшой наклон корпуса вперёд (15-20°) для бо́льшей амплитуды
- Пауза 1-2 сек в верхней точке (пиковое сокращение)
- Не раскачиваться — контролируемое движение

Вариации:
- На четвереньках у блока: больше изоляция, проще баланс
- С согнутым коленом: акцент на ягодичную, меньше задняя поверхность
- Отведение в сторону: средняя ягодичная + тензор
- Стоя боком к блоку: отведение бедра (аддукторы/абдукторы)

Ошибки:
❌ Прогиб поясницы → нагрузка уходит с ягодиц
❌ Слишком тяжёлый вес → компенсация поясницей
❌ Быстрые рывковые движения → инерция вместо мышц
❌ Разворот корпуса → нет изоляции ягодичной

Программирование:
- 3-4×12-15 на каждую ногу
- Как часть тренировки ягодиц (после базы: присед, выпады)
- Суперсет: кикбэк + ягодичный мост = максимальный пампинг`;
}
export function getBarbellHipThrustAdv(message: string): string {
  const relevant = /хип.?траст.+штанг|barbell.?hip.?thrust.+adv|ягодичн.+мост.+штанг.+продвинут|хип.+траст.+техник.+подробн/i.test(message);
  if (!relevant) return '';
  return `
🍑 БАРБЕЛЛИРОВАННЫЙ ХИП-ТРАСТ — ПРОДВИНУТЫЙ ГАЙД:

Почему хип-траст — №1 для ягодиц:
- ЭМГ-активация большой ягодичной: 100% (эталонное упражнение по Bret Contreras)
- Максимальная нагрузка в верхней точке (пиковое сокращение)
- Минимальная нагрузка на позвоночник
- Можно работать с очень тяжёлыми весами безопасно

Техника по шагам:
1. Спина (лопатки) на скамье высотой ~40-45 см
2. Штанга на тазовых костях (использовать подкладку/пэд!)
3. Стопы на ширине плеч, колени под 90° в верхней точке
4. Поднять таз до полного разгибания (тело — прямая линия)
5. СЖАТЬ ягодицы максимально вверху (пауза 1-2 сек)
6. Подбородок к груди (предотвращает гиперэкстензию поясницы)
7. Опуститься контролируемо (не «падать»)

Постановка стоп и акценты:
- Стопы ближе: больше квадрицепс
- Стопы дальше: больше задняя поверхность + ягодицы
- Широкая стойка + носки наружу: больше верхняя часть ягодиц
- На возвышении (deficit): увеличенная амплитуда

Продвинутые техники:
- Пауза 3-5 сек вверху: максимальная активация
- Бандаж на коленях (мини-бэнд): +15-20% активации средней ягодичной
- Одной ногой: устранение асимметрии (намного сложнее!)
- Дроп-сет: 3 сброса по 20%, до отказа
- Tempo 2-3-1: 2 сек вверх, 3 сек пауза, 1 сек вниз

Программирование:
- Сила ягодиц: 4-5×5-8, тяжёлый вес, 2-3 мин отдых
- Гипертрофия: 3-4×8-12, 90 сек отдых
- Выносливость: 2-3×15-25, 60 сек отдых
- Рабочий вес: обычно 1.5-2.5× веса тела у продвинутых`;
}
export function getSmithMachineComplete(message: string): string {
  const relevant = /смит.+полн|тренажёр.+смит.+подробн|smith.+machine.+complete|машина.+смит.+гайд|смит.+упражнен.+все/i.test(message);
  if (!relevant) return '';
  return `
🏗️ ТРЕНАЖЁР СМИТА — ПОЛНЫЙ ГАЙД:

Преимущества:
- Фиксированная траектория: безопаснее без страхующего
- Можно работать до отказа (стопоры-крючки)
- Стабильность: фокус на целевую мышцу, не на баланс
- Лёгкая смена веса (быстрая регулировка)
- Подходит для травмированных (контролируемая траектория)

Недостатки:
- НЕ заменяет свободные веса (нет стабилизации)
- Фиксированная траектория может не соответствовать биомеханике
- Менее функционально (нет работы стабилизаторов)
- Иллюзия силы (в Смите жмёшь больше, чем со штангой)

ТОП-10 упражнений в Смите:

ГРУДЬ:
1. Жим лёжа: безопасная работа до отказа, акцент на грудь
2. Жим наклонный: стабильная траектория для верха груди

ПЛЕЧИ:
3. Жим сидя за голову: более безопасная версия чем со штангой
4. Тяга к подбородку: контролируемый подъём

НОГИ:
5. Приседания (стопы вперёд): акцент на квадрицепс
6. Сплит-приседания: болгарский сплит с опорой Смита
7. Выпады на месте: стабильная база для тяжёлых весов

СПИНА:
8. Тяга в наклоне: изоляция спины без нагрузки на стабилизаторы
9. Шраги: тяжёлые, безопасные, фокус на трапецию

ЯГОДИЦЫ:
10. Хип-траст: идеально — штанга не катится!

Когда использовать Смит:
✅ Тренировка без партнёра (работа до отказа)
✅ Изоляция конкретной мышцы
✅ Реабилитация после травмы
✅ Дроп-сеты (быстрая смена веса)
❌ НЕ как единственный тренажёр (добавляйте свободные веса)`;
}
export function getSuppTimingMatrix(message: string): string {
  const relevant = /добавк.+время.+приём.+матриц|когда.+приним.+добавк.+все|supplement.+timing.+matrix|расписан.+добавок|добавк.+утро.+вечер.+подробн/i.test(message);
  if (!relevant) return '';
  return `
⏰ МАТРИЦА ТАЙМИНГА ДОБАВОК — КОГДА ЧТО ПРИНИМАТЬ:

🌅 УТРО (с завтраком):
- Витамин D3 + K2 (жирорастворимые — с жирной едой)
- Железо (натощак + витамин C, НЕ с кофе/чаем)
- Витамины группы B (бодрят — утром)
- Родиола розовая (энергия на весь день)
- Элеутерококк (адаптоген, бодрит)
- Омега-3 (с жирной едой, делить на 2 приёма)
- Коэнзим Q10 (жирорастворимый)

🏋️ ДО ТРЕНИРОВКИ (за 30-60 мин):
- Кофеин: 3-6 мг/кг (200-400 мг)
- Креатин: 3-5 г (можно в любое время, но удобно до/после)
- Цитруллин: 6-8 г
- Бета-аланин: 3-6 г (или разделить на весь день)
- Коллаген + витамин C: 10-15 г + 50 мг (для сухожилий)
- Кордицепс: 1-3 г (для выносливости)

💪 ПОСЛЕ ТРЕНИРОВКИ:
- Протеин: 20-40 г (сывороточный — самый быстрый)
- Креатин: 3-5 г (если не пили до)
- L-глутамин: 5 г (восстановление)
- Электролиты (если потели обильно)

🍽️ С ОБЕДОМ:
- Цинк (с белковой пищей — усвоение лучше)
- Омега-3 (вторая порция)
- Куркумин (с жирной едой + чёрный перец)

🌙 ВЕЧЕР (за 1-2 часа до сна):
- Магний глицинат: 200-400 мг (расслабление, сон)
- Ашваганда: 300 мг (снижение кортизола)
- Глицин: 3 г (качество сна)
- L-теанин: 200 мг (спокойствие)
- ZMA (цинк + магний): если не пили отдельно
- Мелатонин: 0.3-1 мг (только при необходимости)

❌ НЕ СОЧЕТАТЬ:
- Кальций + железо (конкуренция за усвоение)
- Цинк + медь в одном приёме (разнести на 2+ часа)
- Кофеин + железо (кофеин снижает усвоение)
- Витамин C в больших дозах + B12 (может разрушать B12)
- Магний + цинк в высоких дозах одновременно

✅ СИНЕРГИЯ:
- D3 + K2 + магний
- Железо + витамин C
- Куркумин + пиперин (чёрный перец)
- Коллаген + витамин C
- Цинк + B6`;
}
export function getSodiumAthleteProtocol(message: string): string {
  const relevant = /натрий.+спортсмен.+протокол|соль.+тренировк.+подробн|sodium.+athlete.+protocol|натрий.+сколько.+спортсмен|соль.+сила.+связь/i.test(message);
  if (!relevant) return '';
  return `
🧂 НАТРИЙ (СОЛЬ) ДЛЯ СПОРТСМЕНОВ — ПРОТОКОЛ:

Мифы и реальность:
❌ МИФ: «Соль вредна для всех» — это для гипертоников с малой активностью
✅ РЕАЛЬНОСТЬ: Спортсмены ТЕРЯЮТ натрий с потом и НУЖДАЮТСЯ в нём

Потери натрия:
- Средние потери с потом: 800-1500 мг/литр
- Интенсивная тренировка 1.5 часа: потеря 1-3 литров пота = 800-4500 мг натрия
- Это 2-10 г соли (1 г соли = 400 мг натрия)

Функции натрия для спортсмена:
- Передача нервных импульсов (мышечные сокращения!)
- Поддержание объёма плазмы крови
- Транспорт глюкозы и аминокислот
- Регуляция кислотно-щелочного баланса
- Удержание воды (гидратация!)

Сколько нужно:
- Обычный человек: 2300 мг/день (рекомендация ВОЗ)
- Спортсмен: 3000-5000 мг/день (с учётом потерь)
- Тяжёлые тренировки в жару: до 7000 мг/день
- 1 чайная ложка соли = ~2300 мг натрия

Протокол:
ДО тренировки (30-60 мин):
- 500-700 мг натрия + 500 мл воды
- Увеличивает объём плазмы → лучше выносливость

ВО ВРЕМЯ (>60 мин):
- 300-500 мг натрия/час с водой
- Или электролитный напиток

ПОСЛЕ:
- Солёная еда + достаточно воды
- Восполнить 150% потерянной жидкости

Признаки гипонатриемии (дефицит натрия):
⚠️ Головная боль после длительной тренировки
⚠️ Тошнота, дезориентация
⚠️ Мышечные спазмы
⚠️ Отёки (парадокс: мало натрия → организм удерживает воду)

Лайфхак: щепотка морской соли + лимон + вода = простой электролитный напиток`;
}
export function getSeatedCableRowAdvanced(message: string): string {
  const relevant = /тяг.+нижн.+блок.+продвинут|тяг.+сидя.+блок.+подробн|seated.+cable.+row.+adv|горизонтальн.+тяг.+блок.+детал|тяг.+к.+поясу.+блок.+полн/i.test(message);
  if (!relevant) return '';
  return `
🔗 ТЯГА НИЖНЕГО БЛОКА СИДЯ — ПРОДВИНУТЫЙ ГАЙД:

ЭМГ-данные по рукояткам:
- V-рукоять (нейтральный хват): 100% широчайших + 85% ромбовидных
- Широкая прямая (пронация): 90% широчайших + 95% задних дельт
- Канатная рукоять: 88% широчайших + пиковое сокращение
- Одна рука: 95% + максимальная амплитуда

Техника — детальный разбор:
1. Сесть на платформу, стопы на упорах, колени слегка согнуты
2. Грудь вперёд, «горделивая» осанка
3. Тянуть локтями НАЗАД (не руками к себе!)
4. Лопатки: сведение в конечной точке (пауза 1-2 сек)
5. Возврат: контролируемо, позволить плечам чуть протрактироваться (растяжка)
6. НЕ раскачиваться корпусом (отклонение макс 10-15°)

Продвинутые техники:
- Тяга с ротацией: одна рука, поворот корпуса → амплитуда ↑
- Паузы 3 сек в сокращении: максимальное мышечное чувство
- Негативы 5 сек: гипертрофический стимул
- Дроп-сеты × 3: идеально на блоке (быстрая смена веса)
- Мёртвый стоп: полная остановка, нет инерции

Ошибки:
❌ Слишком сильный наклон назад → тяга телом, не спиной
❌ Подъём плеч вверх → трапеция забирает нагрузку
❌ Рывок в начале → бицепс доминирует
❌ Неполная амплитуда → нет растяжки широчайших

Программирование:
- Толщина спины: V-рукоять, 4×8-12, 90 сек отдых
- Задние дельты: широкая рукоять, 3×12-15
- Ширина: одна рука, 3×10-12 на каждую
- Суперсет: тяга нижнего + тяга верхнего = толщина + ширина`;
}
export function getBarbellShrugComplete(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['шраги', 'шраги со штангой', 'barbell shrug', 'трапеция упражнение', 'шраги техника', 'тренировка трапеций'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
💪 ШРАГИ СО ШТАНГОЙ — ПОЛНОЕ РУКОВОДСТВО:

═══ АНАТОМИЯ ТРАПЕЦИЕВИДНЫХ ═══
• Верхний пучок: поднимает лопатки → шраги основное движение
• Средний пучок: сведение лопаток → тяги горизонтальные
• Нижний пучок: опускание лопаток → Y-разводки
• Шраги = целевое упражнение для верхних трапеций

═══ ПРАВИЛЬНАЯ ТЕХНИКА ═══
• Хват: чуть шире плеч, прямой (пронированный)
• Стартовая позиция: стоя прямо, руки полностью выпрямлены
• Движение: СТРОГО вверх — плечи к ушам
• Амплитуда: максимальная! Полностью вверх → задержка 1-2 сек → медленно вниз
• Голова: смотреть прямо, не наклонять

═══ КРИТИЧЕСКИЕ ОШИБКИ ═══
❌ Вращение плечами — нагружает суставы, НЕ трапеции
❌ Сгибание рук (читинг бицепсами) — снимает нагрузку
❌ Чрезмерный вес с урезанной амплитудой — бессмысленно
❌ Быстрые рывки — инерция, не мышечная работа
❌ Наклон головы вперёд — защемление нерва

═══ ВАРИАНТЫ ═══
• Штанга перед собой: классика, максимальная загрузка
• Штанга за спиной (Гаккеншмидт): больше задняя дельта + верх трапеции
• В тренажёре Смита: стабильная траектория, фокус на сокращение
• Гантели: больше амплитуда, но меньше вес
• Шраги в раме (от упоров): силовой вариант, короткая амплитуда, тяжёлый вес

═══ ПРОГРАММИРОВАНИЕ ═══
• Гипертрофия: 3-4 × 12-15 повторений (трапеции любят объём)
• Сила: 4-5 × 6-8, тяжёлый вес, полная амплитуда
• Высокоповторные: 2-3 × 20-25 с лёгким весом — пампинг
• Частота: 2 раза в неделю (быстро восстанавливаются)
• Прогрессия: +5 кг при выполнении всех повторений

═══ МЕСТО В ТРЕНИРОВКЕ ═══
• После тяжёлых тяг (становая, тяга в наклоне)
• Можно в день спины или плеч
• Суперсет: шраги + разводки на задние дельты → полная верхняя спина
`;
}
export function getReverseFlyCableDB(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['обратные разводки', 'reverse fly', 'разводки на задние дельты', 'задние дельты разводки', 'обратная бабочка', 'reverse pec deck'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🎯 ОБРАТНЫЕ РАЗВОДКИ — ЗАДНИЕ ДЕЛЬТЫ ОТ А ДО Я:

═══ ЗАЧЕМ НУЖНЫ ═══
• Задние дельты — самая отстающая часть у 90% атлетов
• Критичны для здоровья плеч и осанки
• Баланс: передние дельты перегружены жимами → нужна компенсация
• Правило: соотношение тяг к жимам = 2:1 для здоровых плеч

═══ ВАРИАНТЫ ВЫПОЛНЕНИЯ ═══
1. Гантели в наклоне:
   • Наклон 45-60°, грудь параллельно полу
   • Слегка согнутые руки, движение «обнять дерево наоборот»
   • Мизинец ведёт → максимум задней дельты
   • 3-4 × 15-20

2. В тренажёре (reverse pec deck):
   • Лицом к тренажёру, хват нейтральный или пронированный
   • Стабильная траектория — лучше для новичков
   • Регулировка: руки на уровне плеч
   • 3-4 × 12-15

3. Кроссовер (кабель):
   • Верхний блок: крест-накрест без ручек
   • Нижний блок: разводки в стороны-вверх
   • Постоянное натяжение — преимущество кабелей
   • 3-4 × 15-20

4. Лёжа на наклонной скамье (30°):
   • Убирает инерцию полностью
   • Идеально для изоляции
   • 2-3 × 15-20

═══ КЛЮЧЕВЫЕ ОШИБКИ ═══
❌ Слишком тяжёлый вес — подключаются трапеции
❌ Сведение лопаток — это тяга, не разводка
❌ Работа бицепсами — локти должны быть зафиксированы
❌ Неполная амплитуда — теряется стимул
❌ Рывки — инерция вместо мышечной работы

═══ ПРОГРАММИРОВАНИЕ ═══
• Частота: 3-4 раза в неделю (маленькая мышца, быстрое восстановление)
• Объём: 12-20 подходов в неделю суммарно
• Темп: медленный! 2-1-3 (подъём-пауза-опускание)
• Вес: лёгкий/средний, 15-25 повторений
• Место: каждая тренировка верха или как суперсет с жимами
`;
}
export function getCalciumAthleteProtocol(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['кальций спортсмен', 'calcium athlete', 'кальций для костей', 'кальций протокол', 'кальций сколько пить', 'кальций и тренировки'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🦴 КАЛЬЦИЙ — ПРОТОКОЛ ДЛЯ АТЛЕТОВ:

═══ ЗАЧЕМ СПОРТСМЕНУ КАЛЬЦИЙ ═══
• 99% кальция — в костях и зубах
• Мышечные сокращения НЕВОЗМОЖНЫ без кальция
• Нервная проводимость, свёртываемость крови
• Силовые нагрузки увеличивают потребность на 10-20%
• Пот содержит ~40 мг кальция/литр — потери при тренировках

═══ ДОЗИРОВКА ═══
• Базовая потребность: 1000-1200 мг/день
• Спортсмены (тяжёлые нагрузки): 1200-1500 мг/день
• Максимум: 2500 мг/день (выше — риск камней в почках)
• ⚠️ За один приём усваивается максимум 500 мг — разделять!
• Оптимально: 2-3 приёма по 400-500 мг

═══ ФОРМЫ КАЛЬЦИЯ ═══
• Карбонат кальция: 40% элементарного Ca, дешёвый, принимать с едой
• Цитрат кальция: 21% элементарного Ca, дороже, но усваивается натощак
• Гидроксиапатит: из костей, содержит фосфор и коллаген, дорогой
• Глюконат кальция: 9% элементарного Ca — неэффективен
• Рекомендация: цитрат для атлетов (лучшая усвояемость)

═══ СИНЕРГИЯ ═══
• + Витамин D3 (2000-4000 МЕ): ОБЯЗАТЕЛЕН для усвоения кальция
• + Витамин K2 (100-200 мкг MK-7): направляет Ca в кости, а не в сосуды
• + Магний (300-400 мг): баланс Ca/Mg критичен (2:1)
• − Кофеин: увеличивает выведение Ca (компенсация: +40 мг Ca на чашку кофе)
• − Оксалаты (шпинат, свёкла): связывают Ca → снижают усвоение

═══ ПИЩЕВЫЕ ИСТОЧНИКИ ═══
• Творог (200 г): ~230 мг
• Сыр твёрдый (30 г): ~220 мг
• Молоко (250 мл): ~300 мг
• Йогурт (200 г): ~260 мг
• Кунжут (1 ст.л.): ~88 мг
• Сардины (100 г с костями): ~382 мг
• Брокколи (100 г): ~47 мг
• Миндаль (30 г): ~75 мг

═══ ВРЕМЯ ПРИЁМА ═══
• С едой (карбонат) или натощак (цитрат)
• НЕ принимать с железом — конкуренция за усвоение
• НЕ принимать одновременно с кофе/чаем (танины связывают)
• Вечерний приём: может улучшить сон (кальций расслабляет мышцы)
• Разделять: утро + вечер по 500 мг
`;
}
export function getJumpRopeScience(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['скакалка', 'jump rope', 'прыжки на скакалке', 'скакалка тренировка', 'скакалка для похудения', 'скакалка кардио'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🪢 СКАКАЛКА — НАУКА ЭФФЕКТИВНОГО КАРДИО:

═══ ПОЧЕМУ СКАКАЛКА ═══
• Расход: 700-1000 ккал/час (больше чем бег!)
• Развивает координацию, ловкость, тайминг
• Укрепляет икроножные мышцы и голеностоп
• Портативная — можно брать куда угодно
• 10 мин скакалки ≈ 30 мин бега по расходу калорий

═══ ТЕХНИКА ═══
• Вращение запястьями, НЕ плечами
• Локти прижаты к бокам
• Прыжки: 2-3 см от пола (минимальная высота)
• Приземление на переднюю часть стопы (не на пятки!)
• Взгляд прямо, не на ноги
• Длина скакалки: стоя на середине, ручки на уровне подмышек

═══ ПРОГРАММА ДЛЯ НОВИЧКОВ ═══
Неделя 1-2: Базовые прыжки
• 30 сек прыжки / 30 сек отдых × 10 раундов
• Фокус: ритм и техника

Неделя 3-4: Увеличение объёма
• 1 мин / 30 сек отдых × 10 раундов
• Добавить чередование ног

Неделя 5-8: Непрерывная работа
• 3-5 мин непрерывных прыжков × 3-4 подхода
• Добавить двойные прыжки (double under)

═══ ПРОДВИНУТЫЕ ТЕХНИКИ ═══
• Double under: 2 оборота за 1 прыжок — взрывная сила
• Крест-накрест: скрещивание рук — координация
• Бег на месте: высокие колени + скакалка
• Боксёрский шаг: перенос веса с ноги на ногу
• Single leg: прыжки на одной ноге × 30 сек

═══ HIIT НА СКАКАЛКЕ ═══
Тренировка 1 (15 мин):
• 40 сек быстро / 20 сек отдых × 15 раундов (Tabata-стиль)

Тренировка 2 (20 мин):
• 1 мин обычные / 30 сек double under / 30 сек отдых × 10

Тренировка 3 (финишер после силовой):
• 100 прыжков × 5 подходов, минимум отдыха

═══ ДЛЯ СИЛОВЫХ АТЛЕТОВ ═══
• Разминка: 3-5 мин лёгких прыжков (лучше чем дорожка)
• Финишер: 5 мин после тренировки
• На сушке: 15-20 мин 3-4 раза/неделю
• ⚠️ Тяжёлым атлетам (100+ кг): больше ударная нагрузка, начинать осторожно
• Обувь: кроссовки с хорошей амортизацией обязательно
`;
}
export function getBattleRopeTraining(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['канат тренировка', 'battle rope', 'батл роуп', 'канаты для тренировки', 'тренировочные канаты', 'веревка тренировка'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🪢 ТРЕНИРОВОЧНЫЕ КАНАТЫ (BATTLE ROPES):

═══ ПРЕИМУЩЕСТВА ═══
• Кардио + силовая выносливость верхней части тела
• 400-600 ккал/час
• Минимальная нагрузка на суставы
• Развитие grip strength и выносливости предплечий
• Улучшение кор-стабилизации

═══ ОСНОВНЫЕ ДВИЖЕНИЯ ═══
1. Alternating waves (поочерёдные волны):
   • Правая вверх — левая вниз, поочерёдно
   • Основное движение, начинать с него
   • Фокус: плечи, руки, кор

2. Double waves (двойные волны):
   • Обе руки вверх-вниз одновременно
   • Тяжелее, больше нагрузка на плечи
   • Работают: дельты, трапеции, кор

3. Slams (удары):
   • Поднять канаты максимально вверх → ударить в пол
   • Взрывная сила, расход калорий максимальный
   • Работают: всё тело, особенно широчайшие

4. Circles (круги):
   • Вращение обеих рук по кругу (наружу или внутрь)
   • Ротаторная манжета, плечи
   • Хорошо для здоровья плеч

5. Snake (змейка):
   • Руки в стороны, волна горизонтально по полу
   • Грудные, передние дельты

═══ ТРЕНИРОВОЧНЫЕ ПРОТОКОЛЫ ═══
Новички (15 мин):
• 20 сек работа / 40 сек отдых × 15 раундов
• Чередовать: waves → slams → circles

Средний уровень (20 мин):
• 30 сек / 30 сек × 20 раундов
• Добавить: double waves, snake

Продвинутый HIIT (15 мин):
• 30 сек максимальная интенсивность / 15 сек отдых × 20 раундов
• Tabata: 20/10 × 8 раундов = 4 мин (повторить 3 блока)

═══ ПАРАМЕТРЫ КАНАТА ═══
• Длина: 9-15 м (12 м стандарт)
• Диаметр: 38 мм (стандарт) / 50 мм (тяжёлый)
• Вес: 10-20 кг в зависимости от размера
• Крепление: к стойке, стене, столбу

═══ ДЛЯ СИЛОВЫХ АТЛЕТОВ ═══
• Финишер: 3-5 раундов по 30 сек после тренировки
• День кардио: 20 мин HIIT на канатах
• Суперсет: канаты между подходами жима (активное восстановление)
• Кондиционинг: 2 раза/неделю
`;
}
export function getSledPushPullTraining(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['санки тренировка', 'sled push', 'sled pull', 'prowler', 'сани толкание', 'сани тренажёр', 'prowler push'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🛷 САНИ (SLED) — ТРЕНИРОВКА ТОЛКАНИЯ И ТЯГИ:

═══ ПОЧЕМУ САНИ ═══
• Только концентрическая фаза — минимальные DOMS
• Можно тренироваться тяжело без ущерба восстановлению
• Кондиционинг + силовая выносливость
• Развитие стартовой силы и ускорения
• Используется в NFL, MMA, единоборствах

═══ ВАРИАНТЫ ═══
1. Sled push (толкание):
   • Руки высоко: больше квадрицепс
   • Руки низко: больше ягодичные, наклон корпуса
   • Спринт: лёгкий вес, максимальная скорость
   • Марш: тяжёлый вес, медленное продвижение

2. Sled pull (тяга):
   • Тяга лицом к саням: бицепс, спина
   • Тяга спиной к саням (backward drag): квадрицепс
   • Тяга верёвкой: рука за рукой, функциональная сила
   • Тяга на ремне: привязать к поясу, ходьба

3. Lateral drag (боковая тяга):
   • Боком к саням: приводящие, отводящие
   • Стабилизаторы таза

═══ ПРОГРАММИРОВАНИЕ ═══
Кондиционинг (после силовой):
• 6 × 20-30 м толкание, отдых 60-90 сек
• Вес: 50-70% массы тела на санях

Силовая выносливость:
• 4 × 40 м: 20 м толкание + 20 м тяга назад
• Тяжёлый вес, медленный темп
• Отдых 2-3 мин

HIIT:
• 10 × 15 м максимальный спринт, отдых 45 сек
• Лёгкий-средний вес

Восстановительная сессия:
• Лёгкий вес, 10 × 20 м прогулочным темпом
• Между подходами: 30-45 сек
• Нагоняет кровь в мышцы → ускоряет восстановление

═══ НОРМАТИВЫ ВЕСА (толкание, мужчины) ═══
• Новичок: 0.5-0.75× масса тела
• Средний: 1.0-1.5× масса тела
• Продвинутый: 1.5-2.0× масса тела
• Элита: 2.0-3.0× масса тела

═══ ДЛЯ СИЛОВЫХ АТЛЕТОВ ═══
• Идеальный финишер: 5-10 мин после тренировки
• Не утомляет ЦНС (нет эксцентрики)
• Можно делать каждый день (лёгкий вес)
• Восстановительное кардио: лёгкие сани в день отдыха
• Перенос на спорт: ускорение, стартовая скорость
`;
}
export function getTRXSuspensionComplete(message: string): string {
  const keywords = ['trx', 'петли', 'suspension', 'подвес', 'функциональн', 'кольца', 'петля'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## TRX / Suspension Training — полный гид

### Принципы подвесного тренинга
• Нестабильность → активация стабилизаторов (core +45% EMG vs стабильные)
• Угол тела к полу определяет нагрузку (больше наклон = тяжелее)
• Принцип «одной точки»: одна конечность на петлях, другая на полу
• Длина строп: короче = сложнее для верха, длиннее = сложнее для низа

### Топ-упражнения TRX для каждой группы
**Грудь:**
• TRX Push-up (ноги в петлях) — стабилизация корпуса +40%
• TRX Chest Fly — максимальное растяжение грудных
• TRX Atomic Push-up — комбо: жим + подтягивание колен

**Спина:**
• TRX Row (обратный наклон) — регулируй угол для прогрессии
• TRX Y-Fly — задние дельты + ромбовидные
• TRX Face Pull — здоровье плечевого сустава

**Ноги:**
• TRX Pistol Squat — баланс + сила одной ноги
• TRX Hamstring Curl — лёжа, ноги в петлях
• TRX Lunge (задняя нога в петле) — аналог болгарских

**Корпус:**
• TRX Pike — продвинутый уровень, складка
• TRX Mountain Climber — кардио + core
• TRX Side Plank — косые мышцы

### Программирование TRX
**Для гипертрофии:** 3-4×12-15, темп 3-1-2, отдых 60с
**Для силовой выносливости:** 2-3×20-25, минимальный отдых
**Как finisher:** 1-2 упражнения в конце обычной тренировки
**Full-body TRX сессия:** 6-8 упражнений, круговой метод, 30-40 мин

### Преимущества TRX
• Минимальное оборудование, максимальная вариативность
• Безопасно для суставов (закрытая кинетическая цепь)
• Развивает проприоцепцию и баланс
• Подходит для реабилитации после травм
• Можно тренироваться где угодно (дом, парк, зал)
`;
}
export function getCableFullBodyExercises(message: string): string {
  const keywords = ['кабель', 'блок', 'трос', 'cable', 'кроссовер', 'нижний блок', 'верхний блок', 'тренажёр блочн'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Кабельные упражнения — тренировка всего тела

### Преимущества кабелей
• Постоянное напряжение по всей амплитуде (vs свободные веса)
• Любой угол нагрузки (360°) → уникальная стимуляция
• Безопаснее: нет момента «застрял под штангой»
• Плавная нагрузка → идеально для реабилитации
• Односторонняя работа → устранение дисбалансов

### Топ упражнения по группам мышц

**Грудь:**
1. Cable Fly (кроссовер) — стоя, сверху вниз: стретч + сокращение
2. Cable Fly снизу вверх: верх грудных
3. Cable Press (одной рукой): стабилизация + грудь

**Спина:**
1. Тяга нижнего блока сидя: классика для толщины
2. Прямые руки тяга вниз (pullover): изоляция широчайших
3. Face Pull: задние дельты + ротаторная манжета

**Плечи:**
1. Cable Lateral Raise: постоянное напряжение (лучше гантелей!)
2. Cable Front Raise: передние дельты
3. Cable Reverse Fly: задние дельты

**Руки:**
1. Cable Curl (нижний блок): бицепс с постоянным напряжением
2. Cable Pushdown (верхний блок): трицепс
3. Overhead Cable Extension: длинная головка трицепса

**Ноги:**
1. Cable Pull-Through: ягодичные + hamstrings
2. Cable Kickback: изоляция ягодичных
3. Cable Abduction/Adduction: средняя ягодичная / аддукторы

**Core:**
1. Pallof Press: anti-ротация (лучшее для core!)
2. Cable Woodchop: ротационная сила
3. Cable Crunch: прямая мышца живота

### Кабельная тренировка Full Body (40-50 мин)
1. Cable Pull-Through: 3×12 (ягодичные/задняя цепь)
2. Cable Row сидя: 3×10-12 (спина)
3. Cable Fly: 3×12-15 (грудь)
4. Cable Lateral Raise: 3×12-15 (плечи)
5. Cable Curl + Pushdown (суперсет): 3×12
6. Pallof Press: 3×10/сторону (core)

### Советы по технике
• Медленный темп: 2-1-3 (концентрика-пауза-эксцентрика)
• Стой стабильно: ноги шире плеч, core напряжён
• Контролируй возврат (не отпускай рывком)
• Экспериментируй с углами и высотой блока
`;
}
export function getDumbbellVsBarbellCompleteAnalysis(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['гантели или штанга', 'гантели vs штанга', 'dumbbell vs barbell', 'гантели против штанги', 'что лучше гантели', 'штанга или гантели', 'db vs bb', 'гантели штанга разница'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🏋️ ГАНТЕЛИ VS ШТАНГА — ПОЛНЫЙ АНАЛИЗ

📊 СРАВНЕНИЕ ПО КРИТЕРИЯМ:

МАКСИМАЛЬНАЯ СИЛА:
🏆 Штанга > Гантели
• Штанга: стабильнее → больший рабочий вес → больше механического напряжения
• Разница: штанга позволяет поднять на 15-25% больше
• Жим лёжа штанга: 100 кг | Жим гантелей: ~40 кг в каждой руке (80 кг суммарно)
• Для 1ПМ и абсолютной силы — штанга незаменима

ГИПЕРТРОФИЯ:
🤝 Равны (при правильном использовании)
• Гантели: больший ROM (растяжение внизу), стабилизаторы, mind-muscle
• Штанга: больше нагрузки, прогрессивная перегрузка проще
• Мета-анализ: нет значимой разницы в гипертрофии при равном объёме
• Оптимально: КОМБИНАЦИЯ обоих

УСТРАНЕНИЕ АСИММЕТРИИ:
🏆 Гантели > Штанга
• Каждая сторона работает независимо → слабая сторона не «прячется»
• Штанга: сильная рука компенсирует слабую (незаметно)
• При асимметрии >10%: 4-6 недель гантельной работы, начинай со слабой стороны

БЕЗОПАСНОСТЬ ДЛЯ СУСТАВОВ:
🏆 Гантели > Штанга
• Гантели: свободная ротация кистей → естественная траектория
• Штанга: фиксированный хват → потенциальный стресс на запястья/локти/плечи
• Нейтральный хват гантелей: самый безопасный для плечевого сустава

📋 УПРАЖНЕНИЕ ЗА УПРАЖНЕНИЕМ:

ЖИМ ЛЁЖА:
• Штанга: больше вес, прогрессия в силе, соревновательное движение
• Гантели: больше ROM внизу (+15% растяжение грудных), нейтральный хват доступен
→ Рекомендация: штанга = основное, гантели = дополнительное

ПРИСЕДАНИЯ:
• Штанга: единственный вариант для серьёзных весов
• Гантели: гоблет-присед для новичков, болгарские сплит-приседания
→ Рекомендация: штанга = основное (>40 кг), гантели = вариации

ТЯГА В НАКЛОНЕ:
• Штанга: оба ряда работают вместе, большая нагрузка
• Гантели: односторонняя → антиротация, исправление дисбаланса
→ Рекомендация: чередуй каждые 4-6 недель

ЖИМ НАД ГОЛОВОЙ:
• Штанга: больше вес, вовлечение кора стоя
• Гантели: безопаснее для плеч (нейтральный хват), больше ROM
→ Рекомендация: гантели если есть проблемы с плечами

СТАНОВАЯ ТЯГА:
• Штанга: единственный вариант для серьёзных весов
• Гантели: румынская тяга, для новичков и высоких повторений
→ Рекомендация: штанга = основное, гантели = RDL

🎯 РЕКОМЕНДАЦИИ ПО УРОВНЮ:

НОВИЧОК (0-1 год):
• 60% гантели / 40% штанга
• Гантели для освоения движений, баланса, координации
• Штанга: присед, тяга (обязательно изучить)

СРЕДНИЙ (1-3 года):
• 50% штанга / 50% гантели
• Штанга: базовые компаундные (присед, жим, тяга)
• Гантели: вариации, изоляция, коррекция слабых мест

ПРОДВИНУТЫЙ (3+ лет):
• 60% штанга / 40% гантели
• Штанга: прогрессивная перегрузка на базе
• Гантели: специализация, пампинг, завершающие сеты

💡 ЗОЛОТОЕ ПРАВИЛО:
«Начни подход со штанги (сила), закончи гантелями (гипертрофия). Тяжёлый жим штанги 5x5, затем жим гантелей 3x12 — лучшая комбинация.»
`;
}
export function getSodiumAthleteComplete(message: string): string {
  const keywords = ['натрий', 'sodium', 'соль спорт', 'соль тренировк', 'электролит натрий', 'гипонатриемия'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧂 НАТРИЙ ДЛЯ СПОРТСМЕНОВ — ПОЛНЫЙ ГАЙД:

📊 Роль натрия в организме:
• Основной внеклеточный электролит (поддерживает объём плазмы)
• Передача нервных импульсов + мышечные сокращения
• Регуляция артериального давления
• Транспорт глюкозы и аминокислот через мембраны

💧 Потери с потом:
- Средние потери: 800-1500 мг Na/литр пота
- Тренировка 1ч умеренная: 0.5-1.0 л пота = 400-1500 мг Na
- Тренировка 1ч интенсивная: 1.0-2.5 л пота = 800-3750 мг Na
- «Солёный потник» (белые следы на одежде): потери ещё выше

📋 Рекомендации для спортсменов:
• **Общее потребление**: 3000-5000 мг Na/день (больше при жаре)
• **До тренировки** (30-60 мин): 500-700 мг Na с 500мл воды
• **Во время** (>60 мин): 300-600 мг Na/час с жидкостью
• **После**: восполнить потери — 1.5 л жидкости с Na на каждый кг потерянного веса

⚠️ Гипонатриемия (низкий натрий):
- Опасное состояние при избыточном питье чистой воды без электролитов
- Симптомы: тошнота, головная боль, спутанность сознания, судороги
- Профилактика: НИКОГДА не пить только воду при тренировках >90 мин

💡 Практика: щепотка морской соли в воду перед тренировкой, изотонический напиток во время.
`;
}
export function getCableFlyAdvancedForm(message: string): string {
  const keywords = ['кроссовер техника', 'cable fly form', 'кабельные разводки наука', 'сведение в кроссовере продвинутый', 'pec fly cable'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🦅 КАБЕЛЬНЫЕ РАЗВОДКИ (CABLE FLY) — ПРОДВИНУТАЯ ТЕХНИКА:

Кроссовер — уникальное упражнение: постоянное напряжение во всей амплитуде (в отличие от гантельных разводок).

🔬 Биомеханика:
- Грудные мышцы работают через **горизонтальное приведение** плеча
- Кабель создаёт напряжение в пиковом сокращении (гантели — нет)
- Угол троса определяет акцент на разные части груди

📐 Варианты по углу троса:

**1. Высокий кроссовер (сверху вниз):**
- Блоки выше плеч
- Руки сводятся внизу перед собой
- Акцент: **нижняя часть груди**
- Наклон корпуса ~15-20° вперёд

**2. Средний кроссовер (на уровне груди):**
- Блоки на уровне плеч
- Руки сводятся перед грудью
- Акцент: **средняя часть груди**
- Корпус прямо, лёгкий наклон

**3. Низкий кроссовер (снизу вверх):**
- Блоки внизу
- Руки поднимаются и сводятся перед собой
- Акцент: **верхняя часть груди + передняя дельта**
- Корпус слегка отклонён назад

🎯 Техника выполнения:
1. Встань в центр, одна нога впереди (split stance)
2. Лёгкий сгиб в локтях (15-20°) — зафиксируй и НЕ МЕНЯЙ
3. Движение — дугообразное (как обнимаешь дерево)
4. Пиковое сокращение: задержи на 1-2 сек, сжимая грудь
5. Негативная фаза: медленно (3-4 сек) возвращай
6. Не своди руки полностью — останови за 5-10 см до касания

⚠️ Частые ошибки:
- Сгибание/разгибание локтей (превращает в жим)
- Рывки и использование инерции
- Слишком большой вес (теряется контроль)
- Отсутствие пикового сокращения

📊 Программирование:
- Вес: 60-70% от максимального (контроль важнее веса)
- Повторения: 12-15 (для пампинга и гипертрофии)
- Подходы: 3-4
- Отдых: 60-90 сек
- Место в программе: после тяжёлых жимов (добивка груди)
`;
}
export function getKettlebellSwingAdvanced(message: string): string {
  const keywords = ['махи гирей продвинутый', 'kettlebell swing advanced', 'гиря мах наука', 'свинг гирей техника', 'russian swing vs american'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🔔 МАХИ ГИРЕЙ (KETTLEBELL SWING) — ПРОДВИНУТЫЙ МАСТЕР-КЛАСС:

Один из лучших упражнений для задней цепи, мощности и кондиции. Работает ягодицы, хамстринги, кор, хват одновременно.

🔬 Биомеханика:
- Основное движение — **баллистическое разгибание тазобедренного сустава** (hip hinge)
- Мощность генерируется ягодицами и задней цепью, НЕ руками
- Сила реакции в нижней точке: 2-3× массы гири (центробежная сила)
- ЭМГ: ягодичные активируются на 76% от МВИС, бицепс бедра на 70%

📐 Русский свинг vs Американский:

| Параметр | Русский (до уровня груди) | Американский (над головой) |
|----------|--------------------------|---------------------------|
| Амплитуда | До уровня плеч | Над головой |
| Безопасность | ✅ Безопасен | ⚠️ Риск для плеч/поясницы |
| Мощность | Максимальная | Теряется в верхней части |
| Рекомендация | **Для всех** | Только опытные кроссфитеры |

📋 Техника русского свинга:
1. Гиря на полу, на расстоянии вытянутой руки
2. Наклонись (hip hinge), хват двумя руками, спина прямая
3. «Пас назад»: качни гирю между ног (предплечья касаются внутренней части бёдер)
4. **Взрывное разгибание бёдер** — как прыжок без отрыва от земли
5. Руки — проводники, НЕ двигатели (гиря летит за счёт бёдер)
6. В верхней точке: полное разгибание, ягодицы сжаты, пресс напряжён
7. Позволь гире «упасть» назад между ног под контролем

⚡ Продвинутые вариации:
- **Одной рукой** — ↑ антиротационный компонент кора
- **Hand-to-hand** — перехват в верхней точке
- **Dead stop swing** — пауза на полу между повторениями (чистая мощность)
- **Double swing** — две гири (↑ нагрузка, ↑ стабильность)
- **Swing to squat** — свинг + приседание внизу

📊 Программирование:
- **Сила/мощность:** 5-8×5-8, тяжёлая гиря, отдых 60-90 сек
- **Кондиция (HIIT):** 30 сек работа / 30 сек отдых × 10-15 раундов
- **Выносливость:** 10-15 мин непрерывно, средняя гиря
- **Простой метод:** 100 свингов за минимум подходов (5×20, 10×10)

🎯 Выбор веса:
- Мужчины начинающие: 16 кг
- Мужчины средний уровень: 24 кг
- Мужчины продвинутые: 32+ кг
- Женщины начинающие: 8-12 кг
- Женщины средний/продвинутый: 16-24 кг
`;
}
export function getSeleniumAthleteGuide(message: string): string {
  const keywords = ['селен спорт', 'selenium athlete', 'селен щитовидная', 'селен антиоксидант', 'селен для мужчин'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🧬 СЕЛЕН ДЛЯ СПОРТСМЕНОВ:

Селен — микроэлемент, критичный для щитовидной железы (метаболизм), иммунитета и антиоксидантной защиты.

🔬 Функции в организме:
- **Глутатионпероксидаза** — ключевой антиоксидантный фермент (селен = кофактор)
- **Тиреоидные гормоны** — конвертация Т4→Т3 (активная форма) требует селена
- **Тестостерон** — селен участвует в сперматогенезе и синтезе тестостерона
- **Иммунитет** — ↑ активность NK-клеток и Т-лимфоцитов
- **Восстановление** — ↓ окислительное повреждение мышц после тренировки

📊 Потребности спортсмена:
- Суточная норма (обычный): 55 мкг
- Для спортсмена: 100-200 мкг
- Максимум безопасности: 400 мкг (выше — токсично!)
- Потери с потом: 10-20 мкг/час интенсивной тренировки

⚠️ Признаки дефицита:
- Усталость и слабость (↓ Т3)
- Частые простуды
- Медленное восстановление
- Ухудшение качества волос и ногтей
- ↓ либидо (у мужчин)

🥜 Лучшие пищевые источники:
- **Бразильские орехи:** 544 мкг/30г (1-2 ореха = суточная норма!)
- **Тунец:** 92 мкг/100г
- **Куриная грудка:** 31 мкг/100г
- **Яйца:** 20 мкг/шт
- **Творог:** 15 мкг/100г
- **Чеснок:** 14 мкг/100г
- **Гречка:** 8 мкг/100г

💊 Добавки (при подтверждённом дефиците):
- Селенометионин: 100-200 мкг/день (лучшая биодоступность)
- Селенит натрия: 100-200 мкг (дешевле, хуже усвоение)
- Принимай с витамином E (синергия антиоксидантного действия)
- НЕ совмещай с витамином C (↓ усвоение селена)

⚠️ Осторожно:
- Передозировка селена (>400 мкг) = селеноз: запах чеснока изо рта, выпадение волос, ломкость ногтей
- Россия — регион с умеренным дефицитом селена (бедные почвы)
- Регулярно ешь бразильские орехи — простейший способ покрытия нормы
`;
}
export function getCableRowFormMaster(message: string): string {
  const keywords = ['тяга нижнего блока форма', 'cable row form master', 'горизонтальная тяга наука', 'seated cable row техника', 'тяга к поясу блок'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🚣 ТЯГА НИЖНЕГО БЛОКА — МАСТЕР ФОРМЫ:

Тяга нижнего блока — основное горизонтальное тяговое упражнение. Строит толщину спины (ромбовидные, средняя трапеция, широчайшие).

🔬 Мышцы-мишени:
- **Широчайшие** — основной двигатель (разгибание плеча)
- **Ромбовидные + средняя трапеция** — ретракция лопаток
- **Задние дельты** — горизонтальное отведение
- **Бицепс** — синергист (сгибание локтя)
- **Разгибатели спины** — стабилизация (изометрически)

📐 Варианты рукояток:

| Рукоять | Хват | Акцент |
|---------|------|--------|
| V-bar (узкая) | Нейтральный | Толщина средней спины |
| Широкая прямая | Пронированный | Ширина + задние дельты |
| D-handle (одна рука) | Нейтральный | Ротация + антиротация кора |
| Канат | Нейтральный | Задние дельты + ромбовидные |
| MAG grip | Нейтральный | Широчайшие (лучший рычаг) |

📋 Эталонная техника:
1. Сядь, ноги на упоры, колени слегка согнуты
2. Возьми рукоять, выпрями спину, грудь вперёд
3. **Стартовая позиция:** руки вытянуты, лопатки «уехали» вперёд (протракция) → растяжка широчайших
4. **Инициация:** начни с ретракции лопаток (сведи лопатки)
5. Тяни к нижней части груди/верху живота
6. Локти идут НАЗАД, близко к корпусу
7. **Пиковое сокращение:** сожми лопатки максимально, пауза 1-2 сек
8. Медленно возвращай (3-4 сек), позволяя лопаткам «уехать» вперёд
9. НЕ раскачивайся корпусом (±5° допустимо, не больше)

🧠 Ментальные подсказки:
- «Тяни локтями, не руками»
- «Лопатки в задние карманы брюк»
- «Грудь вперёд, как будто показываешь медаль»
- «Сожми апельсин между лопатками»

⚠️ Главные ошибки:
1. Раскачивание корпусом (читинг → поясница страдает)
2. Тяга руками (бицепс доминирует, спина не работает)
3. Неполная амплитуда (не довёл лопатки)
4. Слишком быстрая эксцентрика (бросил вес)
5. Округление спины в начальной позиции

📊 Программирование:
- **Толщина спины:** 3-4×8-12, V-bar, контролируемый темп 2-1-3
- **Задние дельты:** 3×12-15, широкая рукоять, пронированный хват
- **Односторонняя:** 3×10-12 каждая рука, D-handle
- В каждой тренировке спины: 1 вертикальная тяга + 1 горизонтальная тяга (минимум)
`;
}
export function getResistanceBandProgression(message: string): string {
  const keywords = ['резиновые ленты прогрессия', 'resistance band progression', 'резинки для тренировок', 'тренировка с лентами', 'прогрессия с резинками', 'фитнес резинки', 'эспандер тренировка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🟡 ПРОГРЕССИЯ С РЕЗИНОВЫМИ ЛЕНТАМИ — ПОЛНЫЙ ГАЙД:

**Типы лент и их сопротивление:**
| Цвет (обычно) | Сопротивление | Использование |
|---------------|---------------|---------------|
| Жёлтая/тонкая | 2-7 кг | Реабилитация, разминка |
| Красная/средняя | 7-15 кг | Изоляция, лёгкие упражнения |
| Чёрная/тяжёлая | 15-30 кг | Основные упражнения |
| Фиолетовая | 30-50 кг | Помощь в подтягиваниях |
| Зелёная/экстра | 50-80 кг | Тяжёлые компаунды |

**Преимущества лент vs свободные веса:**
- ✅ Аккомодационное сопротивление (↑ нагрузка при растяжении)
- ✅ Постоянное напряжение (нет «мёртвых зон»)
- ✅ Портативность (тренировка в путешествии)
- ✅ Безопасность (нет риска уронить на себя)
- ✅ Доступная цена
- ❌ Сложно точно измерить нагрузку
- ❌ Ограниченная максимальная нагрузка
- ❌ Износ со временем (проверяй на трещины!)

**Лучшие упражнения с лентами:**

**Верх тела:**
- Band pull-apart (разведение перед собой) — задние дельты, 3×15-20
- Banded push-up (лента на спине) — грудь, 3×12-20
- Band row (тяга к поясу) — спина, 3×12-15
- Band shoulder press — дельты, 3×10-15
- Band bicep curl — бицепс, 3×12-20
- Band tricep pushdown (от двери) — трицепс, 3×15-20

**Низ тела:**
- Banded squat — квадрицепс, 3×15-20
- Banded hip thrust — ягодицы, 3×15-20
- Banded lateral walk — средняя ягодичная, 3×12 каждая
- Banded leg curl (лёжа) — задняя поверхность, 3×15-20
- Banded deadlift — задняя цепь, 3×12-15

**Прогрессия с лентами:**
1. ↑ Количество повторений (12 → 15 → 20)
2. ↓ Темп (медленнее = тяжелее)
3. Добавить паузу в пике сокращения (2-3 сек)
4. ↑ Сопротивление ленты (переход к следующему цвету)
5. Двойная лента (две одновременно)
6. 1.5 reps (полный + половинный = 1 повторение)

**Комбинация лент + свободные веса:**
- Присед со штангой + лента = ↑ нагрузка в верхней фазе
- Жим лёжа + лента = ↑ lockout strength
- Становая + лента = ↑ скоростная сила
- Это «аккомодационное сопротивление» — метод Westside Barbell
`;
}
export function getRheumatoidArthritisGuide(message: string): string {
  const triggers = ['ревматоидн', 'rheumatoid', 'ра ', 'аутоиммунн артрит', 'суставы воспал'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🤲 ТРЕНИРОВКИ ПРИ РЕВМАТОИДНОМ АРТРИТЕ:

**Почему нужно тренироваться:**
- ↓ Воспаление (↓ CRP, IL-6) — парадоксальный эффект
- ↓ Утреннюю скованность на 30-50%
- ↑ Плотность костей (↓ риск остеопороза от ГКС)
- ↑ Мышечную массу (ревматоидная кахексия — потеря мышц)
- ↓ Кардиоваскулярный риск (↑ при РА в 2 раза)

**Безопасная программа:**

Силовые (2-3 раза/нед):
- Начать: 1-2 подхода × 12-15 повт, 40-50% 1ПМ
- Прогрессия до: 3×10-12, 60-70% 1ПМ
- Тренажёры > свободные веса (контролируемая амплитуда)
- Избегать нагрузки на воспалённые суставы

Аэробные (3-5 раз/нед):
- Аквааэробика (золотой стандарт: тёплая вода ↓ скованность)
- Велотренажёр: 20-30 мин при 60-70% ЧСС макс
- Ходьба: 30 мин/день

Гибкость (ежедневно):
- Утренняя разминка суставов: 10-15 мин
- Мягкие растяжки: удержание 15-30 сек
- Тай-чи: доказанный эффект при РА

**Правила при обострении:**
- ↓↓ Интенсивность, но НЕ прекращать полностью
- Только ROM-упражнения (амплитуда движения)
- Избегать нагрузки на воспалённые суставы
- Тепло перед тренировкой, лёд после
`;
}
export function getBasketballTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['баскетбол', 'basketball', 'nba', 'данк', 'прыжок вверх'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏀 СИЛОВАЯ ПОДГОТОВКА ДЛЯ БАСКЕТБОЛА:

Ключевые качества:
- Вертикальный прыжок (взрывная сила ног)
- Латеральная скорость (защита)
- Выносливость (40 мин игры)
- Сила кора (контакт, стабилизация в воздухе)

Программа (межсезонье, 3-4 раза/нед):
Ноги (приоритет):
- Приседания: 4 × 5-6 (сила) + прыжки из приседа 3 × 5 (мощность)
- Болгарские выпады: 3 × 8 на ногу
- Прыжки на тумбу: 4 × 5 (максимальная высота)
- Боковые выпады: 3 × 8 (латеральная сила)

Верх тела:
- Жим лёжа: 3 × 8 (контакт под кольцом)
- Тяга в наклоне: 3 × 10
- Жим стоя: 3 × 8 (бросок)

Плиометрика (2 раза/нед):
- Depth jumps: 4 × 3 (прыжок вниз с тумбы → вверх)
- Lateral bounds: 3 × 6
- Прыжки на одной ноге: 3 × 5

Увеличение вертикального прыжка:
- Присед до 1.5× массы тела = основа
- Олимпийские подъёмы (power clean): 4 × 3
- Прыжки с гантелями: 3 × 6
- Реалистичный прогресс: +5-10 см за 12 нед программы
`;
}
export function getVolleyballTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['волейбол', 'volleyball', 'нападающ удар', 'блок волейбол'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🏐 СИЛОВАЯ ПОДГОТОВКА ДЛЯ ВОЛЕЙБОЛА:

Ключевые качества:
- Вертикальный прыжок (атака, блок)
- Скорость реакции и первого шага
- Сила плечевого пояса (атакующий удар, подача)
- Выносливость прыжковая (80-100 прыжков за матч)

Программа (3 раза/нед):
Ноги:
- Приседания: 4 × 5 (база вертикального прыжка)
- Прыжки из приседа: 4 × 5 (с 30% от 1ПМ)
- Depth jumps: 3 × 4 (с тумбы 40-60 см)
- Подъёмы на носки: 4 × 12 (голеностоп)

Плечи и руки:
- Жим стоя: 3 × 8 (нападающий удар)
- Подтягивания: 3 × 8-10
- Внешняя ротация: 3 × 15 (профилактика)
- Отжимания с хлопком: 3 × 8

Кор:
- Hang leg raises: 3 × 10 (складка в воздухе)
- Медбол бросок сверху: 3 × 8 (имитация удара)
- Russian twist: 3 × 12 (повороты)

Профилактика:
- «Колено прыгуна» (тендинит надколенника): самое частое
  * Испанские приседания с резиной: 3 × 15
  * Эксцентрические приседания на наклонной доске
  * Растяжка квадрицепса + foam roller
- Плечо: внешняя ротация, face pulls — ежедневно
- Голеностоп: проприоцептивные упражнения на нестабильной поверхности
`;
}
export function getMMATrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['мма', 'mma', 'смешанн единоборств', 'ufc', 'октагон', 'mixed martial'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🥋 СИЛОВАЯ ПОДГОТОВКА ДЛЯ ММА:

Физические требования:
- Взрывная сила (удары, тейкдауны)
- Силовая выносливость (5 раундов × 5 мин)
- Сила хвата (борьба, клинч)
- Кор: антиротация + вращение (удары, тейкдауны)
- Шея (защита от нокаута)

Программа (2-3 силовые/нед + техника):
День 1 — Взрывная сила:
- Power clean: 4 × 3
- Прыжки на тумбу: 4 × 5
- Медбол бросок: 4 × 5
- Жим стоя: 3 × 5

День 2 — Сила:
- Становая: 4 × 3-5
- Приседания: 4 × 5
- Подтягивания с весом: 4 × 5
- Жим лёжа: 3 × 5

Специальные:
- Гиревые свинги: 5 × 15 (взрывная сила бёдер)
- Turkish get-up: 3 × 3 на руку (от контроля на земле до стойки)
- Farmer's walk: 3 × 40 м (хват, кор)
- Rope climb: 3 × подъём (хват, тяговая сила)

Кондиция (raund simulation):
- Интервалы: 5 мин работа / 1 мин отдых × 5 (как раунд)
- Ассолт байк / гребной: 30 сек макс / 30 сек лёгко × 10
- Шатл бег: 5 × 1 мин

Шея (профилактика):
- Мостик (прогрессивно): 3 × 30 сек
- Изометрические: 4 направления × 10 сек × 3
- Harness work: 3 × 12
`;
}
export function getHandballTrainingGuide(message: string): string {
  const triggers = ['гандбол', 'handball', 'гандболист', 'бросок гандбол', 'вратарь гандбол'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🤾 ГАНДБОЛ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Скорость: быстрые контратаки
- Прыжковая сила: броски в прыжке
- Сила броска: 80-100+ км/ч
- Выносливость: 2 × 30 мин (высокая интенсивность)
- Контактная прочность: игра в защите

**Силовая программа:**
- Жим лёжа: 4 × 6 (сила броска)
- Тяга штанги в наклоне: 4 × 8
- Приседания: 4 × 6 (прыжки)
- Подтягивания: 3 × 10
- Жим гантели одной рукой: 3 × 8 (бросковая рука)
- Ротация корпуса с блоком: 3 × 12 (сила вращения)
- Выпады в стороны: 3 × 8 (перемещения в защите)
- Планка с ротацией: 3 × 10

**Прыжковая подготовка:**
- Прыжки с приседа: 4 × 6
- Запрыгивания на тумбу: 3 × 6
- Прыжки с одной ноги: 3 × 8
- Глубинные прыжки: 3 × 5
- Прыжки с разбега с доставанием

**Бросковая мощность:**
- Броски медбола: в стену, из-за головы, боковые
- Жим стоя одной рукой: 3 × 8
- Ротационные броски: 3 × 10 на сторону
- Резиновый жгут: имитация броска с сопротивлением

**Скорость и ловкость:**
- Спринты 20-40м: 6-8 повторов
- Челночный бег с мячом
- Координационная лестница
- Реакционные упражнения с партнёром
`;
}
export function getAmericanFootballGuide(message: string): string {
  const triggers = ['американск футбол', 'american football', 'нфл', 'nfl', 'тачдаун', 'квотербек', 'лайнмен'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏈 АМЕРИКАНСКИЙ ФУТБОЛ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Позиционные требования:**
- Лайнмены: максимальная сила и масса
- Бегущие/ресиверы: скорость + ловкость
- Квотербек: точность + подвижность
- Защитники: реакция + контактная прочность

**Силовая (общая):**
- Приседания: 5 × 5 (тяжёлые)
- Жим лёжа: 5 × 5
- Становая тяга: 4 × 5
- Взятие на грудь: 4 × 3 (взрывная сила)
- Жим стоя: 4 × 6
- Подтягивания: 3 × 10
- Тяга в наклоне: 4 × 8

**Скоростная работа:**
- Спринты 10-40 ярдов: 8 × с полным отдыхом
- 40-yard dash: тест скорости
- Три-конус дрилл: ловкость
- Шаттл-ран: 5-10-5
- Pro agility: стандартный тест NFL

**Кондиционная подготовка:**
- Спринтерские интервалы: 10 × 100м, отдых 30 сек
- 300-yard shuttle: тест выносливости
- Gassers: спринт через всё поле и обратно
- Круговая тренировка: 6 станций × 3 круга

**Контактная подготовка:**
- Толкание саней: 4 × 20м
- Перевороты покрышки: 3 × 8
- Работа с шилдами
- Тэкл-техника: безопасный вход
`;
}
export function getBaseballTrainingGuide(message: string): string {
  const triggers = ['бейсбол', 'baseball', 'бейсболист', 'питчер', 'бэттинг', 'подача бейсбол', 'хоумран'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚾ БЕЙСБОЛ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Позиционные акценты:**
- Питчер: ротационная сила, здоровье плеча/локтя
- Бэттер: ротационная мощность, реакция
- Полевые: скорость, бросковая точность
- Все: взрывная сила, ловкость

**Силовая программа:**
- Становая тяга: 4 × 5 (база)
- Приседания: 4 × 6
- Жим лёжа: 3 × 8
- Подтягивания: 3 × 10
- Вращения с медболом: 3 × 10 на сторону (свинг/бросок)
- Боковые броски медбола в стену: 3 × 8
- Выпады: 3 × 8
- Планка anti-rotation: 3 × 10

**Ротационная мощность (ключевая):**
- Медбол: ротационные броски, слэм, overhead
- Cable woodchop: 3 × 10 на сторону
- Landmine rotation: 3 × 8
- Pallof press: 3 × 10 (антиротация)

**Здоровье плеча (питчеры):**
- Внешняя ротация с резинкой: 3 × 15
- Внутренняя ротация: 3 × 15
- Face pulls: 3 × 15
- Sleeper stretch: ежедневно
- Правило: 100 бросков/игра максимум, дни отдыха

**Скорость:**
- Спринты 60 футов (от базы к базе): 6 × макс
- Старт из позиции (lead-off): реакция
- Ловкость: конусы, направленные спринты
`;
}
export function getBeachVolleyballGuide(message: string): string {
  const triggers = ['пляжн волейбол', 'beach volleyball', 'пляжка', 'волейбол на песке', 'beach volley'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏐 ПЛЯЖНЫЙ ВОЛЕЙБОЛ — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Отличия от зального волейбола:**
- Песок: каждый шаг требует больше усилий (+30% энергии)
- 2 игрока (вместо 6): покрытие всей площадки
- Солнце, ветер, жара: климатические факторы
- Нет замен: полная игра без отдыха

**Силовая программа:**
- Приседания с прыжком: 4 × 6 (прыжки на песке)
- Выпады: 3 × 10
- Становая тяга на одной ноге: 3 × 8
- Жим стоя: 3 × 8 (удар и подача)
- Подтягивания: 3 × 8
- Планка: 3 × 60 сек
- Russian twist: 3 × 15
- Подъём на носки: 3 × 20

**Прыжковая подготовка:**
- Прыжки на песке: 3 × 10 (специфика)
- Запрыгивания на тумбу: 3 × 6
- Серийные прыжки: 3 × 8 (имитация блока)
- Прыжки в глубину → прыжок: 3 × 5

**Выносливость:**
- Бег по песку: 20-30 мин (специфическая)
- Интервалы на песке: 10 × 20м спринт
- Игровые ситуации: 2 на 2, сеты на время
- Плавание: дополнительная кардио

**Термоадаптация:**
- Тренировки в жару (постепенно)
- Гидратация: 500-1000 мл/час
- Солнцезащита: крем, очки, кепка
`;
}
export function getKettlebellTrainingScience(message: string): string {
  const triggers = ['гиревой спорт', 'тренировка с гирей', 'kettlebell training', 'свинг гиря техника', 'гиря тренировк'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🏋️ ГИРЕВОЙ СПОРТ И ТРЕНИРОВКА С ГИРЯМИ:

РОССИЙСКИЕ КОРНИ:
Гиревой спорт — РУССКИЙ вид спорта. Зародился в России в XVIII веке. Федерация гиревого спорта России (ФГСР). Соревновательные дисциплины: толчок, рывок, длинный цикл.

ПРЕИМУЩЕСТВА ГИРЬ:
1. Смещённый центр тяжести → больше стабилизаторов задействовано.
2. Баллистические движения (свинг, рывок) → развитие мощности и кондиционирования.
3. Компактность: одна гиря = десятки упражнений. Идеально для дома.
4. Grip strength: рукоятка и динамика движений — отличная тренировка хвата.
5. Кондиционирование: 20 мин свингов = мощнейшая кардио-тренировка.

БАЗОВЫЕ УПРАЖНЕНИЯ:
1. Свинг (Swing): фундамент. Баллистический hip hinge. 10-20 ккал/мин. Ягодичные + подколенные + кор.
2. Турецкий подъём (Turkish Get-Up): из положения лёжа встать с гирей над головой. Мобильность + стабильность всего тела.
3. Кубковый присед (Goblet Squat): гиря у груди. Идеален для обучения приседу.
4. Жим гири (Press): стоя, одной рукой. Плечи + кор.
5. Рывок гири (Snatch): с пола/свинга над голову одним движением. Мощность + выносливость.
6. Толчок гири (Clean & Jerk/Push Press): на грудь + выталкивание. Соревновательное движение.

РАЗМЕРЫ ГИРЬ (стандарт):
- Женщины начинающие: 8-12 кг.
- Мужчины начинающие: 12-16 кг.
- Средний уровень: М 20-24 кг, Ж 16-20 кг.
- Продвинутый: М 28-32 кг, Ж 24 кг.
- Соревновательные: М 32 кг, Ж 24 кг (рывок/толчок на кол-во повторений за 10 мин).

ПРОГРАММА ДЛЯ НАЧИНАЮЩИХ (Simple & Sinister, Pavel Tsatsouline):
- 100 свингов одной рукой (10×10, чередуя руки).
- 10 турецких подъёмов (5 на сторону).
- 4-5 раз/неделю. Время: 20-30 мин.
- Прогрессия: когда можешь завершить за 20 мин с чистой техникой → следующий размер гири.

ГИРИ + СИЛОВЫЕ:
- Отличное дополнение: свинги в дни между тяжёлыми тренировками.
- Кондиционирование: 10 мин свингов EMOM = замена кардио.
- Разминка: TGU + goblet squat = идеальная разминка перед силовой.

СОРЕВНОВАТЕЛЬНЫЙ ГИРЕВОЙ СПОРТ В РОССИИ:
- Дисциплины: толчок (32 кг × 2, 10 мин), рывок (32 кг, 10 мин, смена рук 1 раз), длинный цикл.
- Разряды: от III разряда до МСМК.
- Очень доступный: минимум экипировки, гири есть в любом зале.
`;
}
export function getWestsideBarbellGuide(message: string): string {
  const triggers = ['westside barbell метод', 'вестсайд программа', 'конъюгатный метод подробно', 'луи симмонс метод', 'максимальное усилие динамическое усилие'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏋️ МЕТОД WESTSIDE BARBELL (КОНЪЮГАТНЫЙ):

**Создатель:** Луи Симмонс — легендарный пауэрлифтер и тренер

**Структура — 4 дня/неделю:**

День 1 — ME Upper (Максимальное усилие, верх):
- Вариация жима лёжа: работа до 1-3ПМ
- Менять вариацию каждые 1-3 недели
- Варианты: жим с досок, жим с пола, жим с цепями
- Подсобка: трицепс, широчайшие, плечи

День 2 — ME Lower (Максимальное усилие, низ):
- Вариация приседа/тяги: работа до 1-3ПМ
- Варианты: присед на ящик, присед с цепями, тяга с дефицита
- Подсобка: ягодицы, задняя цепь, пресс

День 3 — DE Upper (Динамическое усилие, верх):
- Жим лёжа: 8-9×3 @ 50-60% + 25% в цепях/резинах
- Максимальная скорость подъёма!
- Подсобка: трицепс, плечи, спина

День 4 — DE Lower (Динамическое усилие, низ):
- Присед на ящик: 10-12×2 @ 50-60% + цепи/резины
- Тяга скоростная: 6-8×1 @ 60-70%
- Подсобка: GHR, reverse hyper, пресс

**Ключевые принципы:**
- ME: ротация упражнений каждые 1-3 недели (избежание аккомодации)
- DE: акцент на СКОРОСТЬ, не на вес
- Аккомодирующее сопротивление: цепи и резины обязательны
- Подсобка: 60-70% общего объёма тренировки — слабые места

**Слабые звенья:**
- Жим слабый внизу → жим с паузой, жим с пола
- Жим слабый вверху → жим с досок, трицепс
- Присед слабый из ямы → присед с паузой
- Тяга слабый локаут → тяга с подставок, блочная тяга
`;
}
export function getRFSFootballFitness(message: string): string {
  const triggers = ['рфс', 'футбол физподготовка', 'футбольная физическая', 'подготовка футболиста', 'тренировки для футбола', 'выносливость футбол'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
⚽ ФИЗИЧЕСКАЯ ПОДГОТОВКА ФУТБОЛИСТА (РФС-СТАНДАРТЫ):

**Физические качества футболиста:**
- Скоростная выносливость: главное качество (много ускорений за игру)
- Максимальная скорость: спринт 30-40м (2.5-3.5 сек у профи)
- Аэробная база: VO2max 55-65 мл/кг/мин (центр/атакующий)
- Взрывная сила ног: прыжок в высоту 60-75 см
- Сила корпуса: для единоборств

**Нормативы РФС (примерные, взрослый ФНЛ):**
- Бег 30м: <4.0 сек
- Йо-йо тест 2 уровень: >800м
- Прыжок с места: >65 см
- Тест Купера (12 мин): >3000м

**Программа силовой для футболиста:**

Нижняя часть тела (приоритет):
- Приседания: 3×5 @ 75-80% (сила, не масса)
- Болгарские выпады: 3×8 каждая нога
- RDL: 3×8 (профилактика травм подколенных)
- Подъём на носки: 3×15 (профилактика ахилла)

Верх тела (поддержание):
- Жим лёжа: 3×8
- Тяга: 3×8
- Горизонтальные тяги: 3×12

Плиометрика:
- Прыжки на ящик: 4×5
- Спринтерские ускорения: 6×30м
- Перемена направления (COD): агилити-лесенка

**Совмещение силовых с футболом:**
- Понедельник: тяжёлый силовой (после игры 48-72ч)
- Среда: лёгкий поддерживающий + плиометрика
- Пятница: активное восстановление или выходной перед игрой
- Никогда: тяжёлый силовой за 24ч до игры
`;
}
export function getKettlebellTraining(message: string): string {
  const kw = ['гиря тренировки', 'kettlebell', 'гиревой спорт', 'свинг гирей', 'турецкий подъём'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки с гирями (Kettlebell):**

**Преимущества:**
Одновременно сила + кардио + гибкость
Минимум места и оборудования
Развитие хвата, кора, задней цепи

**Базовые упражнения:**

1. **Swing (мах)** — основа основ:
   Шарнирное движение (hip hinge), НЕ приседание
   Сила из бёдер, руки только направляют
   10-25 повторений, 3-5 подходов

2. **Turkish Get-Up (турецкий подъём):**
   С пола → стоя с гирей над головой
   1-3 повторения на сторону, медленно
   Лучшее упражнение для стабильности плеча

3. **Goblet Squat (кубковый присед):**
   Гиря у груди, глубокий присед
   Отлично для обучения технике
   10-15 повторений

4. **Clean & Press:**
   Подъём на грудь + жим
   5-8 повторений на руку

5. **Snatch (рывок гири):**
   С пола → над головой одним движением
   Продвинутое упражнение (учи после swing)

**Программа Simple & Sinister (Pavel Tsatsouline):**
100 свингов (10×10) + 10 Turkish Get-Up (5 на сторону)
Каждый день, 20-30 мин
Стандарт: мужчины 32 кг, женщины 24 кг
`;
}
export function getBasketballTraining(message: string): string {
  const kw = ['баскетбол подготовка', 'прыжок выше', 'вертикальный прыжок', 'тренировки для баскетбола'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Физическая подготовка для баскетбола:**

**Вертикальный прыжок — ключевой навык:**

Силовая база (нужна перед плиометрикой):
Приседания: минимум 1.5× вес тела для 1ПМ
Если <1.5× → сначала сила, потом прыжки

Плиометрика (2 раза/нед, свежие ноги):
Box jumps: 3×5 (максимальная высота)
Depth jumps: 3×5 (с коробки 30-50 см → прыжок вверх)
Hurdle hops: 4×5 (через барьеры)
Single-leg bounds: 3×5 на ногу

**Формула прыжка:**
Прыжок = Сила × Скорость (мощность)
Тяжёлые приседания → сила
Плиометрика → скорость приложения силы
Олимпийские → мощность

**Кондиционная:**
Баскетбол = повторные спринты + восстановление
Shuttle runs: 4× (5-10-15-20м) с разворотами
Суицидные спринты: 4 серии
Lane agility drills
Zone 2: 20-30 мин (восстановление между играми)

**Силовая программа (3 раза/нед):**
День 1: Приседания 4×5, Hip thrust 3×8, Nordic curls 3×5
День 2: Жим лёжа 3×8, Тяга 3×8, Плечи
День 3: Фронтальный присед 3×6, Step-ups 3×8, Плиометрика
`;
}
export function getResistanceBands(message: string): string {
  const kw = ['резиновые петли', 'резинки для тренировок', 'эспандер', 'resistance bands', 'тренировки с резинками'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Резиновые петли и эспандеры — тренировки и наука:**

**Принцип аккомодационного сопротивления:**
Нагрузка увеличивается по мере растяжения резинки → максимальна в верхней точке движения.
Это совпадает с кривой силы большинства упражнений (в верхней точке вы сильнее).
Результат: более равномерная нагрузка на мышцу по всей амплитуде.

**Типы резинок:**
Loop-петли (замкнутые): для приседаний, тяг, жимов, подтягиваний — универсальный вариант
Мини-петли (mini bands): для активации ягодичных, разминки, реабилитации
Трубчатые эспандеры: с ручками, удобны для изоляции (тяга к лицу, разгибания)

**Научные данные:**
Бандированные приседания: +15% мощности vs обычные приседания (Wallace et al. 2006)
Гипертрофия: сопоставима со свободными весами при равном объёме (Lopes et al. 2019)
Реабилитация: меньше компрессионной нагрузки на суставы → безопаснее при травмах

**Программирование с резинками:**
В паре со штангой: резинка добавляет 15-25% нагрузки в верхней точке
Пример: присед 80 кг + резинка 20 кг в верхней точке = прогрессивная нагрузка
Отдельно: полноценная тренировка для дома/путешествий

**Тренировка в путешествии (полная, 30-40 мин):**
Приседания с петлёй на плечах: 4×15
Тяга петли к поясу (крепление к двери): 4×12
Жим петли от груди (крепление сзади): 4×12
Разведения мини-петлёй: 3×20
Сгибания на бицепс: 3×15
Разгибания на трицепс: 3×15

**Преимущества:**
Портативность (вес 200-500 г), подходят для разминки, основной тренировки и реабилитации.
Снижают нагрузку на суставы, отлично подходят для пожилых и при травмах.
`;
}
export function getHomeGymSetup(message: string): string {
  const kw = ['домашний зал', 'оборудование для дома', 'home gym', 'минимальный набор'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Домашний зал — от минимума до полного комплекта:**

**Уровень 1 — Бюджетный (3000-8000 руб):**
Резиновые петли (набор 5 шт разного сопротивления) — заменяют многие тренажёры
Турник в дверной проём — подтягивания, висы, пресс
Коврик — для упражнений на полу и растяжки
Что можно делать: полноценные тренировки всего тела, достаточно для начинающих и поддержания формы

**Уровень 2 — Средний (15000-40000 руб):**
Разборные гантели (до 40 кг каждая) — универсальный инструмент
Регулируемая скамья (наклон от -15° до 90°) — расширяет упражнения
Турник + брусья (напольная стойка или настенная) — калистеника
Что можно делать: 80% упражнений коммерческого зала, серьёзный прогресс возможен

**Уровень 3 — Премиум (60000-150000+ руб):**
Силовая рама (power rack) со страховочными упорами — безопасные приседания и жим
Олимпийский гриф (20 кг) + набор блинов (100-150 кг)
Регулируемая скамья
Помост/резиновое покрытие для пола
Что можно делать: практически всё, что в коммерческом зале. Долгосрочная инвестиция.

**Требования к пространству:**
Минимум: 2×2 м (гантели + скамья)
Комфорт: 3×3 м (рама + скамья + свободное пространство)
Идеал: 4×4 м (полная свобода движения, место для хранения)
Высота потолка: минимум 2.3 м (для жима стоя и подтягиваний)

**Пол и покрытие:**
Резиновые маты (минимум 15 мм) — защита пола, снижение шума, сцепление
Для становой тяги: 20-30 мм резина или деревянный помост с резиновыми вставками
Не ставьте раму на ламинат/паркет без защиты — продавится и поцарапается

**Дополнительные полезные аксессуары:**
Таймер/часы на стену — контроль отдыха
Зеркало — контроль техники (не обязательно, но очень помогает)
Вентилятор или кондиционер — без вентиляции тренироваться тяжело
Колонка для музыки — домашний зал = ваши правила, ваша музыка
`;
}
