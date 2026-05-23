/**
 * knowledge-topics/injury.ts — auto-split from knowledgeHelpers.ts
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
import { MuscleRecoveryStatus } from './recovery';

export const BODY_PART_INJURY_KEYWORDS: Record<string, string[]> = {
  'плечо': ['плеч', 'дельт', 'ротатор', 'импинджмент', 'вращатель'],
  'колено': ['колен', 'мениск', 'пкс', 'связк колен', 'коленн'],
  'поясница': ['поясниц', 'спин', 'грыж', 'протруз', 'позвоноч'],
  'локоть': ['локт', 'эпикондилит', 'теннисн', 'локтев'],
  'запястье': ['запясть', 'кист', 'лучезапястн'],
  'грудь': ['груд', 'грудин', 'реберн'],
};
export function detectInjuryZone(message: string, healthRestrictions?: Array<{ description: string; bodyPart: string }>): string[] {
  const zones: Set<string> = new Set();
  const text = message.toLowerCase();

  for (const [zone, keywords] of Object.entries(BODY_PART_INJURY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        zones.add(zone);
        break;
      }
    }
  }

  // Check stored health restrictions
  if (healthRestrictions) {
    for (const hr of healthRestrictions) {
      const r = `${hr.description} ${hr.bodyPart}`.toLowerCase();
      for (const [zone, keywords] of Object.entries(BODY_PART_INJURY_KEYWORDS)) {
        for (const kw of keywords) {
          if (r.includes(kw)) { zones.add(zone); break; }
        }
      }
    }
  }

  return Array.from(zones);
}
export const INJURY_EXERCISE_BLACKLIST: Record<string, string[]> = {
  'shoulder': ['Жим штанги стоя', 'Жим штанги лёжа', 'Разведение гантелей', 'Французский жим'],
  'knee': ['Приседания со штангой', 'Выпады', 'Жим ногами'],
  'lower_back': ['Становая тяга', 'Тяга штанги в наклоне', 'Приседания со штангой'],
  'wrist': ['Подъём штанги на бицепс', 'Жим штанги лёжа', 'Французский жим'],
  'elbow': ['Французский жим', 'Подъём штанги на бицепс', 'Жим узким хватом'],
};
export function predictInjuryRisks(
  fatigueRatio: number,
  fatigueStatus: string,
  muscleRecovery: MuscleRecoveryStatus[],
  overloadData: Array<{ exercise: string; status: string }>,
  recentWorkouts: Array<{ durationMinutes: number | null; completedAt: Date | null }>,
): string {
  const risks: string[] = [];

  // Risk 1: High ACWR ratio
  if (fatigueRatio > 1.5) {
    risks.push('🔴 ACWR > 1.5 — резкий скачок нагрузки, высокий риск травмы. Рекомендуй снизить объём.');
  } else if (fatigueRatio > 1.3) {
    risks.push('🟡 ACWR 1.3-1.5 — зона риска. Не увеличивай нагрузку дальше.');
  }

  // Risk 2: Training recovering muscles
  const notRecovered = muscleRecovery.filter((m) => m.status === 'fresh' || (m.status === 'recovering' && m.hoursSinceTraining < 24));
  if (notRecovered.length > 0) {
    risks.push(`🟡 Недовосстановленные мышцы: ${notRecovered.map((m) => m.muscle).join(', ')} — не нагружай их сегодня`);
  }

  // Risk 3: Consecutive heavy days without rest
  const completed = recentWorkouts
    .filter((w) => w.completedAt)
    .map((w) => new Date(w.completedAt!))
    .sort((a, b) => b.getTime() - a.getTime());

  if (completed.length >= 5) {
    // Check if last 5 workouts were within 5 days
    const daySpan = (completed[0].getTime() - completed[4].getTime()) / (1000 * 60 * 60 * 24);
    if (daySpan <= 5) {
      risks.push('🟠 5 тренировок за 5 дней — нет дней отдыха. Рекомендуй день восстановления.');
    }
  }

  // Risk 4: Long workouts without deload
  const longWorkouts = recentWorkouts.filter((w) => (w.durationMinutes || 0) > 120);
  if (longWorkouts.length >= 3) {
    risks.push('🟡 Регулярные тренировки >2ч — повышенный риск перетренированности и травм суставов');
  }

  if (risks.length === 0) return '';

  return `\n\n## ⚠️ РИСКИ ТРАВМ
${risks.join('\n')}
→ ПРИОРИТЕТНО: предупреди пользователя о рисках. Безопасность важнее прогресса.`;
}
export function monitorJointHealth(
  healthRestrictions: Array<{ bodyPart: string; description: string; severity: string }>,
  scheduledExercises: Array<{ exercise: { name: string; primaryMuscles: string[]; type: string } }>,
): string {
  if (healthRestrictions.length === 0 || scheduledExercises.length === 0) return '';

  // Map body parts to potentially problematic exercises
  const riskMap: Record<string, string[]> = {
    'колено': ['quadriceps', 'hamstrings', 'glutes', 'calves'],
    'knee': ['quadriceps', 'hamstrings', 'glutes', 'calves'],
    'плечо': ['shoulders', 'chest'],
    'shoulder': ['shoulders', 'chest'],
    'спина': ['back', 'lats', 'lower_back'],
    'back': ['back', 'lats', 'lower_back'],
    'поясница': ['lower_back', 'glutes', 'hamstrings'],
    'lower_back': ['lower_back', 'glutes', 'hamstrings'],
    'запястье': ['forearms', 'biceps', 'triceps'],
    'wrist': ['forearms', 'biceps', 'triceps'],
    'локоть': ['biceps', 'triceps', 'forearms'],
    'elbow': ['biceps', 'triceps', 'forearms'],
  };

  const warnings: string[] = [];

  for (const restriction of healthRestrictions) {
    const bodyPart = restriction.bodyPart.toLowerCase();
    const riskyMuscles = riskMap[bodyPart] || [];
    if (riskyMuscles.length === 0) continue;

    const riskyExercises = scheduledExercises.filter((ex) =>
      (ex.exercise.primaryMuscles ?? []).some((m) => riskyMuscles.includes(m)),
    );

    if (riskyExercises.length > 0) {
      const severity = restriction.severity === 'severe' ? '🔴' : restriction.severity === 'moderate' ? '🟡' : '🟢';
      // Sanitize user-controlled fields — `bodyPart` and `description` come
      // from onboarding/profile input and would otherwise feed prompt-
      // injection markers (e.g. "\n[USER]: …") into the LLM-readable
      // warning block via persisted storage.
      warnings.push(
        `${severity} ${sanitizeForPrompt(restriction.bodyPart, 60)}: ${sanitizeForPrompt(restriction.description, 200)} (${restriction.severity}) — потенциально задействованы: ${riskyExercises.map((e) => e.exercise?.name).join(', ')}`,
      );
    }
  }

  if (warnings.length === 0) return '';

  return `\n\n## 🩺 ЗДОРОВЬЕ СУСТАВОВ
${warnings.join('\n')}
→ ОБЯЗАТЕЛЬНО предупреди пользователя. Предложи замену или модификацию (меньший вес, другой хват, машина вместо свободных весов).`;
}
export function buildInjuryPreventionTips(
  heavyCompoundCount: number,
  weeklyWorkouts: number,
  userAge: number | null,
  healthRestrictions: Array<{ bodyPart: string; severity: string }>,
): string {
  const tips: string[] = [];

  // High frequency + heavy compounds
  if (weeklyWorkouts >= 5 && heavyCompoundCount >= 3) {
    tips.push('Много тяжёлых тренировок. Убедись что есть хотя бы 1-2 лёгких дня в неделю.');
  }

  // Age-specific
  if (userAge && userAge > 35) {
    tips.push('После 35 лет восстановление связок медленнее. Разминка и разминочные подходы обязательны.');
  }
  if (userAge && userAge > 50) {
    tips.push('Суставы требуют особого внимания. Рассмотри добавление глюкозамина + хондроитина.');
  }

  // Restriction-specific prevention
  for (const r of healthRestrictions) {
    if (r.bodyPart.toLowerCase().includes('колен') || r.bodyPart.toLowerCase().includes('knee')) {
      tips.push('Проблемы с коленями: избегай глубоких приседаний с тяжёлым весом, добавь укрепление VMO.');
    }
    if (r.bodyPart.toLowerCase().includes('спин') || r.bodyPart.toLowerCase().includes('back')) {
      tips.push('Проблемы со спиной: укрепляй кор, используй пояс на тяжёлых подходах, контролируй поясницу.');
    }
    if (r.bodyPart.toLowerCase().includes('плеч') || r.bodyPart.toLowerCase().includes('shoulder')) {
      tips.push('Проблемы с плечами: разминка ротаторов обязательна, избегай жим из-за головы.');
    }
  }

  if (tips.length === 0) return '';

  return `\n\n## 🛡️ ПРОФИЛАКТИКА ТРАВМ
${tips.slice(0, 3).map(t => `- ${t}`).join('\n')}
Упоминай профилактику если разговор о тренировках — но ненавязчиво.`;
}
export function estimateMobilityScore(
  recentWorkouts: Array<{
    exercises: Array<{
      exercise: { name: string; category: string };
    }>;
  }>,
): string {
  if (recentWorkouts.length < 3) return '';

  let mobilityExCount = 0;
  let strengthExCount = 0;
  let totalExercises = 0;

  for (const w of recentWorkouts.slice(0, 5)) {
    for (const ex of w.exercises) {
      totalExercises++;
      if (ex.exercise?.category === 'flexibility') mobilityExCount++;
      else if (ex.exercise?.category === 'strength') strengthExCount++;
    }
  }

  if (totalExercises === 0) return '';

  const mobilityPct = Math.round((mobilityExCount / totalExercises) * 100);

  if (mobilityPct < 5) {
    return `\n\n## 🧘 МОБИЛЬНОСТЬ
В тренировках почти нет упражнений на гибкость (${mobilityPct}%).
Рекомендация: добавь 10 мин растяжки после каждой тренировки или 1 день мобильности в неделю.
Это улучшит амплитуду движений и снизит риск травм.`;
  }

  if (mobilityPct >= 10) {
    return `\n\n## 🧘 МОБИЛЬНОСТЬ
Хороший баланс: ${mobilityPct}% упражнений на гибкость. Так держать!`;
  }

  return '';
}
export function earlyInjuryWarning(
  message: string,
  injuryZones: string[],
  weeklyVolumeChange: number,
  avgRPE: number | null,
): string {
  const painKeywords = /ноет|тянет|жжёт|покалыв|онемен|опуха|отёк|хруст|щёлк/i;
  const hasPainKeywords = painKeywords.test(message);

  const warnings: string[] = [];

  if (hasPainKeywords) {
    warnings.push('⚠️ Боль/дискомфорт — СТОП-сигнал. Не тренируй через боль. Дай 2-3 дня отдыха.');
    warnings.push('Если боль не проходит за 3-5 дней — обратись к врачу или физиотерапевту.');
  }

  if (injuryZones.length > 0 && weeklyVolumeChange > 15) {
    warnings.push(`⚠️ У тебя есть ограничения (${injuryZones.join(', ')}) + резкий рост объёма. Будь осторожен.`);
  }

  if (avgRPE !== null && avgRPE > 8.5 && weeklyVolumeChange > 10) {
    warnings.push('⚠️ Высокий RPE + рост объёма одновременно — высокий риск перетренированности/травмы');
  }

  if (warnings.length === 0) return '';

  return `\n\n## 🚨 ПРЕДУПРЕЖДЕНИЕ: РИСК ТРАВМЫ
${warnings.join('\n')}`;
}
export function assessMobility(exerciseNames: string[], injuryZones: string[]): string {
  if (!exerciseNames.length) return '';

  const mobilityNeeds: Record<string, string[]> = {
    'приседания': ['тазобедренный', 'голеностоп', 'грудной отдел'],
    'становая тяга': ['тазобедренный', 'поясница', 'грудной отдел'],
    'жим лёжа': ['грудной отдел', 'плечо', 'запястье'],
    'жим стоя': ['плечо', 'грудной отдел', 'запястье'],
    'тяга': ['тазобедренный', 'грудной отдел', 'плечо'],
  };

  const needsSet = new Set<string>();
  for (const ex of exerciseNames) {
    const lower = ex.toLowerCase();
    for (const [keyword, zones] of Object.entries(mobilityNeeds)) {
      if (lower.includes(keyword)) zones.forEach(z => needsSet.add(z));
    }
  }

  if (!needsSet.size) return '';

  const injured = injuryZones.map(z => z.toLowerCase());
  const riskZones = [...needsSet].filter(z => injured.some(inj => z.toLowerCase().includes(inj)));

  let result = `\n\n🧘 Мобильность для ваших упражнений:
Зоны, требующие проработки: ${[...needsSet].join(', ')}`;

  if (riskZones.length > 0) {
    result += `\n⚠️ Зоны риска (совпадают с травмами): ${riskZones.join(', ')} — уделите им особое внимание в разминке.`;
  }

  result += `\n💡 Уделите 5-7 минут на мобильность этих зон перед тренировкой для безопасности и лучшей техники.`;
  return result;
}
export function warnOveruseInjury(exerciseNames: string[], workoutsPerWeek: number): string {
  if (!exerciseNames.length || workoutsPerWeek < 3) return '';

  const highRiskPatterns: Array<{ keywords: string[]; zone: string; warning: string }> = [
    { keywords: ['жим лёжа', 'жим гантелей', 'разводка', 'отжимания'], zone: 'плечевой сустав', warning: 'Слишком частые жимы → теннисный локоть и вращательная манжета плеча. Максимум 3 раза/неделю.' },
    { keywords: ['подтягивания', 'тяга к поясу', 'тяга блока', 'тяга штанги'], zone: 'локтевой сустав', warning: 'Частые тяговые движения → болоть бицепс-сухожилие. Нужен день отдыха между тренировками спины.' },
    { keywords: ['приседания', 'выпады', 'жим ногами', 'болгарские'], zone: 'коленный сустав', warning: 'Частые квадрицепсовые нагрузки → пателло-феморальный синдром. Чередуйте с тягами и отдыхом.' },
    { keywords: ['становая', 'гиперэкстензия', 'наклоны'], zone: 'поясница', warning: 'Частые нагрузки на поясницу → грыжа диска. Максимум 2 раза/неделю тяжёлых становых.' },
  ];

  const warnings: string[] = [];
  const exLower = exerciseNames.map(e => e.toLowerCase());

  for (const pattern of highRiskPatterns) {
    const matchCount = pattern.keywords.filter(kw => exLower.some(ex => ex.includes(kw))).length;
    if (matchCount >= 2) {
      warnings.push(`⚠️ ${pattern.zone}: ${pattern.warning}`);
    }
  }

  if (!warnings.length) return '';

  return `\n\n🩺 Предупреждение о перегрузке:\n${warnings.join('\n')}`;
}
export function getInjuryComeback(message: string, injuryZones: string[]): string {
  const lowerMsg = message.toLowerCase();
  const isRelevant = ['после травмы', 'после перерыва', 'вернуться', 'восстановление после', 'долго не тренировался'].some(kw => lowerMsg.includes(kw));
  if (!isRelevant && !injuryZones.length) return '';

  return `\n\n🏥 Протокол возвращения после травмы/перерыва:

**Неделя 1-2 (Адаптация):**
• Снизьте все веса до 50-60% от последних рабочих
• Фокус на технике и нейромышечной связи
• Исключите болезненные движения полностью

**Неделя 3-4 (Восстановление):**
• Поднимите до 70-75%
• Добавьте изолирующие упражнения на травмированную зону (с малым весом)
• Следите за болью: 0-2/10 — норма, 3+/10 — стоп

**Неделя 5+ (Прогресс):**
• Постепенно возвращайтесь к рабочим весам (+2.5-5кг в неделю)
• Не пытайтесь "догнать" пропущенный прогресс — мышечная память вернёт силу за 2-4 недели

⚠️ Правило: боль при движении = не делать. Дискомфорт от нагрузки = норма.`;
}
export function getJointWarmUpSequence(exerciseNames: string[]): string {
  if (!exerciseNames.length) return '';

  const joints: string[] = [];
  const exLower = exerciseNames.map(e => e.toLowerCase());

  if (exLower.some(e => e.includes('присед') || e.includes('становая') || e.includes('ноги'))) {
    joints.push('Голеностоп: круговые вращения 10х каждый');
    joints.push('Колено: сгибания-разгибания, круговые 10x');
    joints.push('Тазобедренный: круговые вращения бедром 10x');
  }
  if (exLower.some(e => e.includes('жим') || e.includes('тяга') || e.includes('подтяг'))) {
    joints.push('Запястье: вращения 10x в каждую сторону');
    joints.push('Локоть: сгибания-разгибания 10x');
    joints.push('Плечо: маятник, вращения 15x');
  }
  if (exLower.some(e => e.includes('становая') || e.includes('гиперэкстен'))) {
    joints.push('Поясница: кошка-корова 10x, скрутки лёжа');
  }

  if (!joints.length) return '';

  return `\n\n🦴 Суставная разминка (5 мин перед тренировкой):\n${joints.map((j, i) => `${i + 1}. ${j}`).join('\n')}`;
}
export function getMobilityAssessmentAdvanced(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['подвижность', 'mobility', 'скованность', 'ограничение движения', 'не могу сесть глубоко', 'тазобедренный', 'лодыжка'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🦵 **Самооценка подвижности — 3 теста:**

**Тест 1: Глубокий присед**
Встань перед зеркалом. Стопы по ширине плеч, носки вперёд или чуть наружу.
Опускайся в присед как можно глубже, руки перед собой.
• ✅ Норма: бёдра ниже колен, спина ровная, пятки на полу
• ❌ Пятки отрываются → слабая подвижность голеностопа (работай на растяжку икр)
• ❌ Спина округляется → слабая подвижность бёдер + тазобедренных

**Тест 2: Рука за спину**
Одну руку вверх-за-голову, другую снизу-за-спину. Попытайся соединить пальцы.
• ✅ Норма: пальцы соприкасаются
• ❌ Расстояние > 10 см → ограничение плечевого пояса (требует работы с капсулой плеча)

**Тест 3: Наклон стоя**
Прямые ноги, наклон вперёд, тянись пальцами к полу.
• ✅ Норма: ладони ложатся на пол или минимальное расстояние
• ❌ Больше 10-15 см до пола → бицепс бедра/поясница ограничена

**Коррекция:**
• Голеностоп: растяжка икр у стены 3×30 сек, присед к стене
• Бёдра: голубь (pigeon pose) 60 сек/сторону
• Плечи: кросс-тело стрейч + дверной проём`;
}
export function getInjuryPrevTop5(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['профилактика травм', 'как не травмироваться', 'injury prevention', 'избежать травму', 'безопасно тренироваться'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🛡️ **Топ-5 правил профилактики травм:**

**1. Разминка — не опциональна**
5-10 мин общей разминки + разминочные подходы в каждом упражнении.
Холодные мышцы рвутся. Тёплые — адаптируются.

**2. Эго — враг спортсмена**
Большинство травм происходит от веса, который "должен был взять".
Правило: если техника ломается → вес слишком большой.

**3. Прогрессируй постепенно (10%)**
Не увеличивай объём или интенсивность более чем на 10% в неделю.
Кость, сухожилие и связки адаптируются В 10 РАЗ МЕДЛЕННЕЕ мышц.

**4. Слушай тело — различай боль**
• Мышечное жжение (ощущение работы) — норма
• DOMS (болезненность через 24-48 ч) — норма
• Острая боль / щелчок / боль в суставе → СТОП немедленно

**5. Восстановление — часть тренировки**
Сон 7-9 часов. Дни отдыха. Деньги.
Пропустить деньги = разрушить следующий цикл.

**Бонус: самые травмоопасные ошибки:**
• Работа с максимальными весами без пояса (поясница)
• Резкое увеличение беговых объёмов (колено)
• Жим лёжа широким хватом без разминки плеч
• Становая без разогрева поясницы

💡 Один год без травм = больше прогресса, чем два года "через боль".`;
}
export function getNeckPostureGuide(message: string): string {
  const lower = message.toLowerCase();
  const keywords = ['шея', 'neck', 'осанка', 'posture', 'сутулость', 'горб', 'текстовая шея', 'болит шея', 'верхняя трапеция'];
  if (!keywords.some(k => lower.includes(k))) return '';

  return `\n\n🧍 **Шея, осанка и верхняя спина:**

**"Текстовая шея" (forward head posture) — современная эпидемия:**
За каждые 2.5 см смещения головы вперёд → нагрузка на шею удваивается.
8 часов за компьютером = сотни часов под нагрузкой в год.

**Признаки:**
• Голова выдвинута вперёд
• Плечи скруглены
• Напряжение в верхних трапециях и шее
• Боль в затылке, головные боли

**Исправление — упражнения:**

**Chin tuck (подбородочный тяг):**
Стоя у стены — затылок и лопатки касаются стены. "Уберись" головой назад, не наклоняя шею.
10 повторений × 3, держи 2 сек каждое.

**Face pull:**
Трос на уровне лица → тянешь к лицу, локти высоко, внешняя ротация плеч.
3×15 — ключевое упражнение против сутулости.

**Band pull-apart:**
Лента в руках перед собой → разводишь через стороны.
3×20 — задние дельты + ромбовидные.

**Стрейч грудных:**
Дверной проём, руки на 90°, шаг вперёд. 3×30 сек.

**Укрепление:**
• Тяга ленты к лицу
• Горизонтальные тяги (тяга в наклоне, горизонтальный блок)
• Ретракция лопаток (мышцы между лопатками)

💡 10 мин в день на эти упражнения = через 8-12 недель значительное улучшение осанки.`;
}
export function getInjuryComebackFull(message: string, injuryZones: string[]): string {
  const lower = message.toLowerCase();
  const hasInjury = injuryZones.length > 0;
  const relevant = lower.includes('после травм') || lower.includes('вернуться к') ||
    lower.includes('реабилитац') || lower.includes('восстановление после') || hasInjury;
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🏥 ВОЗВРАЩЕНИЕ В ТРЕНИНГ ПОСЛЕ ТРАВМЫ:');
  if (hasInjury) {
    lines.push(`⚠️ Зоны ограничений: ${injuryZones.join(', ')}`);
  }
  lines.push('');
  lines.push('📅 ФАЗЫ ВОЗВРАЩЕНИЯ:');
  lines.push('');
  lines.push('ФАЗА 1 — ОСТРАЯ (0–7 дней):');
  lines.push('• RICE: Rest, Ice (15 мин × 3/день), Compression, Elevation');
  lines.push('• Тренируй ВСЁ кроме травмированной зоны');
  lines.push('• Не форсируй — воспаление нужно для заживления');
  lines.push('');
  lines.push('ФАЗА 2 — РЕАБИЛИТАЦИЯ (1–8 нед):');
  lines.push('• Изометрические упражнения без боли');
  lines.push('• Постепенное введение амплитуды');
  lines.push('• Физиотерапия, если нужно');
  lines.push('');
  lines.push('ФАЗА 3 — ВОЗВРАТ К ТРЕНИРОВКАМ:');
  lines.push('• Начни с 50% рабочего веса');
  lines.push('• +10% в неделю при отсутствии боли');
  lines.push('• Полное восстановление ≠ отсутствие боли (≥ 80% силы)');
  lines.push('');
  lines.push('⚕️ Обязательно: врач при боли > 7/10, отёке, нестабильности.');
  return '\n\n' + lines.join('\n');
}
export function getWristElbowHealth(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('запястье') || lower.includes('локоть') || lower.includes('теннисн') ||
    lower.includes('тендинит') || lower.includes('боль в запястье') || lower.includes('боль в локте') ||
    lower.includes('кисть болит') || lower.includes('forearm pain');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 ЗДОРОВЬЕ ЗАПЯСТИЙ И ЛОКТЕЙ:');
  lines.push('');
  lines.push('🔴 ТЕННИСНЫЙ ЛОКОТЬ (Lateral Epicondylitis):');
  lines.push('• Боль снаружи локтя при хвате/вращении');
  lines.push('• Причина: перегрузка разгибателей запястья');
  lines.push('• Лечение: эксцентрические разгибания запястья × 3×15');
  lines.push('• Временно избегай: жим обратным хватом, тяги со штангой');
  lines.push('');
  lines.push('🔴 ЛОКОТЬ ГОЛЬФИСТА (Medial Epicondylitis):');
  lines.push('• Боль изнутри локтя при сгибании запястья');
  lines.push('• Причина: перегрузка сгибателей');
  lines.push('• Лечение: эксцентрические сгибания запястья');
  lines.push('');
  lines.push('💪 УКРЕПЛЕНИЕ ЗАПЯСТИЙ:');
  lines.push('• Вращения запястьями с лёгкими гантелями (1–2 кг)');
  lines.push('• Сгибания запястья с гантелью × 3×15');
  lines.push('• Удержание блина пальцами × 3×20 сек');
  lines.push('• Обратные сгибания на блоке');
  lines.push('');
  lines.push('🛡️ ПРОФИЛАКТИКА:');
  lines.push('• Разминка кистей перед жимами');
  lines.push('• Нейтральный хват там, где возможно (EZ-гриф для бицепса)');
  lines.push('• Кистевые бинты при работе с большим весом');
  return '\n\n' + lines.join('\n');
}
export function getShoulderHealthGuide(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('плечо') || lower.includes('ротатор') || lower.includes('shoulder') ||
    lower.includes('боль в плече') || lower.includes('жим болит плечо') || lower.includes('плечевой сустав');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦺 ЗДОРОВЬЕ И МОБИЛЬНОСТЬ ПЛЕЧ:');
  lines.push('');
  lines.push('🔬 АНАТОМИЯ ПРОБЛЕМ:');
  lines.push('• Ротаторная манжета: 4 мышцы (надостная, подостная, малая круглая, подлопаточная)');
  lines.push('• Импинджмент: защемление при подъёме руки');
  lines.push('• Нестабильность: слабость стабилизаторов (лопатки!)');
  lines.push('');
  lines.push('💊 УПРАЖНЕНИЯ ДЛЯ РОТАТОРНОЙ МАНЖЕТЫ:');
  lines.push('• Внешняя ротация с резинкой × 3×15');
  lines.push('• Лежачая внешняя ротация с гантелью × 3×12');
  lines.push('• Face pulls × 3×20 — главное профилактическое упражнение');
  lines.push('• YWT-разводки лёжа на животе × 3×12');
  lines.push('');
  lines.push('🏋️ БЕЗОПАСНЫЙ ЖИМОВОЙ ТРЕНИНГ:');
  lines.push('• Ширина хвата на жиме: чуть шире плеч (не слишком широко)');
  lines.push('• Локти под углом 45–60°, не 90° в сторону');
  lines.push('• Гантели → безопаснее для плеч чем штанга');
  lines.push('');
  lines.push('⚠️ Боль при жиме → делай жим гантелями, добавь face pulls и ротаторы.');
  lines.push('Сохраняется > 2 нед → врач-ортопед или физиотерапевт.');
  return '\n\n' + lines.join('\n');
}
export function getAnkleMobilitySquats(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('голеностоп') || lower.includes('ankle') || lower.includes('пятка') &&
    lower.includes('отрыва') || lower.includes('мобильность') && lower.includes('присед') ||
    lower.includes('не могу присесть') || lower.includes('каблуки') && lower.includes('присед');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦶 МОБИЛЬНОСТЬ ГОЛЕНОСТОПА ДЛЯ ПРИСЕДА:');
  lines.push('');
  lines.push('⚠️ ПРИЗНАКИ ОГРАНИЧЕННОЙ МОБИЛЬНОСТИ:');
  lines.push('• Пятки отрываются от пола при приседе');
  lines.push('• Наклон корпуса вперёд при глубоком приседе');
  lines.push('• Боль в колене при приседе');
  lines.push('');
  lines.push('🧪 ТЕСТ:');
  lines.push('• Встань носком в 10 см от стены → колено вперёд к стене');
  lines.push('• Колено касается стены при прямой стопе = норма');
  lines.push('• Не касается = нужна работа над мобильностью');
  lines.push('');
  lines.push('📋 УПРАЖНЕНИЯ:');
  lines.push('• Динамические круги голеностопом × 2×20/сторону (разминка)');
  lines.push('• Stretch у стены: наклон колена вперёд стоя × 3×30 сек');
  lines.push('• Присед с поддержкой (держась за стойку) — постепенно углубляй');
  lines.push('• Икры: растяжка на ступеньке × 3×60 сек (прямое и согнутое колено)');
  lines.push('');
  lines.push('⚡ ВРЕМЕННОЕ РЕШЕНИЕ:');
  lines.push('• Блины под пятки (2.5–5 кг) → позволяет приседать глубже сразу');
  lines.push('• Обувь с каблуком (штангетки) → профессиональное решение');
  lines.push('');
  lines.push('⏰ Ожидаемый прогресс: 4–8 недель ежедневной работы.');
  return '\n\n' + lines.join('\n');
}
export function getThoracicSpineMobility(message: string): string {
  const lower = message.toLowerCase();
  const relevant = lower.includes('грудной отдел') || lower.includes('грудной позвонок') ||
    lower.includes('thoracic') || lower.includes('сутулость') || lower.includes('горб') ||
    lower.includes('мобильность спины') || lower.includes('скованность грудного');
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦴 МОБИЛЬНОСТЬ ГРУДНОГО ОТДЕЛА ПОЗВОНОЧНИКА:');
  lines.push('');
  lines.push('⚠️ ПОЧЕМУ ЭТО ВАЖНО:');
  lines.push('• Ограниченный грудной отдел → нагрузка переходит на поясницу');
  lines.push('• Сутулость → ухудшение техники жима и тяги');
  lines.push('• Боль в шее и плечах часто = следствие проблем в грудном отделе');
  lines.push('');
  lines.push('📋 УПРАЖНЕНИЯ:');
  lines.push('• Разгибание на пенном ролле (лёжа, ролл поперёк спины) × 5 уровней');
  lines.push('• Ротация сидя (руки за голову, поворот торса) × 10/сторону');
  lines.push('• Кошка-корова: 10 медленных циклов');
  lines.push('• Открывашка (Thread-the-needle): лёжа на боку × 10/сторону');
  lines.push('• Т-разводка на стуле с поддержкой головы × 10');
  lines.push('');
  lines.push('⏰ РУТИНА: 5–7 мин каждое утро = через месяц заметный результат.');
  lines.push('');
  lines.push('💡 Для жима и тяги: ретракция лопаток → невозможна без мобильного грудного отдела.');
  return '\n\n' + lines.join('\n');
}
export function getNeckTraining(message: string): string {
  const relevant = /шея|neck training|тренировка шеи|укрепить шею|болит шея/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('💪 ТРЕНИРОВКА ШЕИ:');
  lines.push('');
  lines.push('🎯 ЗАЧЕМ ТРЕНИРОВАТЬ ШЕЮ:');
  lines.push('• Профилактика травм (борьба, единоборства, контактные виды)');
  lines.push('• Устранение "forward head posture" (синдром выдвинутой головы)');
  lines.push('• Эстетика — визуально добавляет массивности');
  lines.push('');
  lines.push('📋 УПРАЖНЕНИЯ:');
  lines.push('• Сгибание шеи лёжа на спине с блином (2–3 кг): 3×15–20');
  lines.push('• Разгибание шеи лёжа на животе с блином: 3×15–20');
  lines.push('• Боковые наклоны с рукой: 3×15 в каждую сторону');
  lines.push('• Изометрическое давление ладонью в лоб/затылок: 30 сек × 3');
  lines.push('');
  lines.push('⚠️ ПРАВИЛА:');
  lines.push('• Начни с веса тела или минимальным весом');
  lines.push('• Медленные, контролируемые движения');
  lines.push('• НЕ вращать шею — только сгибание/разгибание/боковые наклоны');
  lines.push('• 2–3 раза/нед, в конце тренировки');
  return '\n\n' + lines.join('\n');
}
export function getCalvesTrainingEffective(message: string): string {
  const relevant = /икры|голень|calf|calves|икроножн|камбаловидн/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦵 ЭФФЕКТИВНАЯ ТРЕНИРОВКА ИКРОНОЖНЫХ МЫШЦ:');
  lines.push('');
  lines.push('🔬 ОСОБЕННОСТИ МЫШЦ ГОЛЕНИ:');
  lines.push('• Икроножная (Gastrocnemius): быстрые волокна, нужен тяжёлый вес + низкие повторения');
  lines.push('• Камбаловидная (Soleus): медленные волокна, нужно много повторений');
  lines.push('• Оба нужно тренировать!');
  lines.push('');
  lines.push('📋 ПРОТОКОЛ:');
  lines.push('• Подъём на носки стоя: 4×6–10 (тяжело, полная амплитуда)');
  lines.push('• Подъём на носки сидя: 3×15–25 (Soleus, нога согнута)');
  lines.push('• Осликовые подъёмы или наклонный жим на носки: 3×12–15');
  lines.push('');
  lines.push('⚡ КЛЮЧИ К РОСТУ ИКРОНОЖНЫХ:');
  lines.push('• Полная амплитуда: максимальное растяжение внизу (2 сек)');
  lines.push('• Не отдыхай в нижней точке — постоянное напряжение');
  lines.push('• Высокая частота: 3–4 раза/нед (быстро восстанавливаются)');
  lines.push('• Прогрессируй вес, не только повторения');
  lines.push('');
  lines.push('⚠️ Генетика важна — но правильный тренинг улучшит любые икры');
  return '\n\n' + lines.join('\n');
}
export function getOverheadSquatMobility(message: string): string {
  const relevant = /присед над головой|overhead squat|ots|накладки.+плеч|глубокий присед.+руки/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('☝️ ПРИСЕД СО ШТАНГОЙ НАД ГОЛОВОЙ — мобильность:');
  lines.push('');
  lines.push('📋 ТРЕБОВАНИЯ К МОБИЛЬНОСТИ:');
  lines.push('• Голеностоп: дорсифлексия ≥35° — критично для глубины');
  lines.push('• Бёдра: внешняя ротация + флексия');
  lines.push('• Плечи: полное отведение над головой без компенсации');
  lines.push('• Грудной отдел: разгибание (thoracic extension)');
  lines.push('');
  lines.push('🔧 ТЕСТ: можешь ли ты встать, подняв руки прямо вверх без прогиба?');
  lines.push('');
  lines.push('🏋️ ПРОГРЕССИЯ:');
  lines.push('• 1 этап: OHS с палкой или PVC-трубой → найди ограничения');
  lines.push('• 2 этап: Работа над ограничивающим звеном 10–15 мин/день');
  lines.push('• 3 этап: OHS с грифом (20 кг) → постепенно добавляй вес');
  lines.push('');
  lines.push('⚡ ГЛАВНЫЕ ОГРАНИЧЕНИЯ: голеностоп (80% случаев) и грудной отдел');
  lines.push('💊 Ankle mobility + thoracic extension → 90% людей смогут освоить OHS');
  return '\n\n' + lines.join('\n');
}
export function getShoulderImpingementPrev(message: string): string {
  const relevant = /импинджмент|subacromial|защемлени.+плеч|боль.+верх.+плеча|rotator.+cuff|ротаторная манжет/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦾 ПРОФИЛАКТИКА ИМПИНДЖМЕНТА ПЛЕЧА:');
  lines.push('');
  lines.push('🔬 ЧТО ЭТО: сдавление сухожилий ротаторной манжеты при движении руки вверх');
  lines.push('');
  lines.push('📍 ПРИЧИНЫ:');
  lines.push('• Слабость ротаторной манжеты');
  lines.push('• Нарушение осанки (округлые плечи, сутулость)');
  lines.push('• Дисбаланс: много жимов, мало тяговых');
  lines.push('• Неправильная техника жима/тяги над головой');
  lines.push('');
  lines.push('🔧 УКРЕПЛЯЮЩИЕ УПРАЖНЕНИЯ:');
  lines.push('• Внешние ротации с резиной/гантелью: 3×15–20');
  lines.push('• Face pull: 3×15–20 (трапеция + ротаторы)');
  lines.push('• YTWA-упражнения лёжа на животе');
  lines.push('• Scapular press (плечевая ретракция): 3×15');
  lines.push('');
  lines.push('📋 ПРОФИЛАКТИКА:');
  lines.push('• Соотношение тяги к жиму = 2:1 (минимум 1.5:1)');
  lines.push('• Жим — локти под 45–75° от туловища (не 90°!)');
  lines.push('• Растяжка задней капсулы: "спящий stretch"');
  return '\n\n' + lines.join('\n');
}
export function getWristElbowRehab(message: string): string {
  const relevant = /болит запястье|болит локоть|теннисный локоть|golf elbow|wrist pain|elbow pain|реабилитаци.+запяст|реабилитаци.+локот/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🤝 РЕАБИЛИТАЦИЯ ЗАПЯСТЬЯ И ЛОКТЯ:');
  lines.push('');
  lines.push('📍 ТЕННИСНЫЙ ЛОКОТЬ (Lateral epicondylitis):');
  lines.push('• Боль снаружи локтя при сгибании/разгибании запястья');
  lines.push('• Упражнение: эксцентрическое разгибание запястья с лёгким весом');
  lines.push('• Протокол: 3×15 медленно 2–3 раза/день, 8–12 нед');
  lines.push('');
  lines.push('📍 ЛОКОТЬ ГОЛЬФИСТА (Medial epicondylitis):');
  lines.push('• Боль внутри локтя');
  lines.push('• Упражнение: эксцентрическое сгибание запястья');
  lines.push('');
  lines.push('🔧 ЗАПЯСТЬЕ (общие упражнения):');
  lines.push('• Сгибание/разгибание запястья с лёгкой гантелью: 3×20');
  lines.push('• Вращение запястья с гантелью: 3×15/направление');
  lines.push('• Хват с экспандером/резиной: 3×20');
  lines.push('');
  lines.push('⚠️ ПРИ ОСТРОЙ БОЛИ:');
  lines.push('• Уменьши или исключи провоцирующие упражнения');
  lines.push('• Лёд 10–15 мин после нагрузки');
  lines.push('• При сохранении >2 нед — к врачу (возможна МРТ/УЗИ)');
  return '\n\n' + lines.join('\n');
}
export function getOverheadMobility(message: string): string {
  const relevant = /мобильность.+жим|руки над головой.+ограничен|подвижность плеч.+жим|overhead mobility|плечи не подымаются/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('☝️ МОБИЛЬНОСТЬ ДЛЯ ЖИМА НАД ГОЛОВОЙ:');
  lines.push('');
  lines.push('🔍 ТЕСТ: Встань у стены, прижми поясницу, подними руки над головой.');
  lines.push('Если не можешь — работай над этими ограничениями:');
  lines.push('');
  lines.push('📋 ОГРАНИЧЕНИЯ И УПРАЖНЕНИЯ:');
  lines.push('• Широчайшие: растяжка широчайших в дверном проёме (60 сек × 3)');
  lines.push('• Грудной отдел: разгибание на пенном ролике (1 мин/позиция)');
  lines.push('• Капсула плеча: "сонная растяжка" лёжа (60 сек/сторону)');
  lines.push('• Передняя дельта: грудь к двери, медленный поворот (30 сек × 3)');
  lines.push('');
  lines.push('⚡ АКТИВАЦИОННЫЕ УПРАЖНЕНИЯ:');
  lines.push('• Угол скольжения по стене (wall slide): 2×10');
  lines.push('• Кубинский пресс с палкой: 2×10');
  lines.push('• YTA лёжа: 2×10–12 каждой буквой');
  lines.push('');
  lines.push('📅 ЕЖЕДНЕВНО 5–10 мин → через 4–8 нед жим над головой без боли');
  return '\n\n' + lines.join('\n');
}
export function getMuscleSorenessVsInjury(message: string): string {
  const relevant = /боль.+крепатура|крепатура.+травма|muscle soreness vs injury|doms.+боль|болит мышца или травма/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🩺 КРЕПАТУРА vs ТРАВМАТИЧЕСКАЯ БОЛЬ:');
  lines.push('');
  lines.push('✅ КРЕПАТУРА (DOMS) — норма:');
  lines.push('• Появляется через 12–72 ч после нагрузки');
  lines.push('• Двусторонняя (обе ноги, оба плеча)');
  lines.push('• Усиливается при движении, снижается при разогреве');
  lines.push('• Нет отёка/покраснения/нестабильности суставов');
  lines.push('• Проходит через 3–5 дней');
  lines.push('');
  lines.push('🚨 ТРАВМА — нужна диагностика:');
  lines.push('• Острая боль ВО ВРЕМЯ выполнения движения');
  lines.push('• Односторонняя, точечная боль в суставе (не мышце)');
  lines.push('• Не проходит через 7+ дней');
  lines.push('• Отёк, гематома, ограниченная подвижность');
  lines.push('• Слышен щелчок/хруст в момент боли');
  lines.push('');
  lines.push('🔧 ЧТО ДЕЛАТЬ:');
  lines.push('• DOMS: лёгкое движение, разогрев, магний, активное восстановление');
  lines.push('• Травма (острая): RICE (покой, лёд, компрессия, поднятие) → врач');
  lines.push('• Хроническая боль >1–2 нед: обязательно к ортопеду/спортивному врачу');
  return '\n\n' + lines.join('\n');
}
export function getTrainingAroundKneePain(message: string): string {
  const relevant = /болит колено|боль в колене|knee pain|тренировки с болью в колене|колено при приседе/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🦵 ТРЕНИРОВКИ ПРИ БОЛИ В КОЛЕНЕ:');
  lines.push('');
  lines.push('⚠️ СНАЧАЛА: определи тип боли');
  lines.push('• Передняя (надколенник): пателлофеморальный синдром');
  lines.push('• Внутренняя/внешняя: связки (ПКС, LCL, MCL)');
  lines.push('• Задняя: мениск, подколенные структуры');
  lines.push('');
  lines.push('✅ ЧТО МОЖНО ДЕЛАТЬ:');
  lines.push('• Жим ногами с малым диапазоном (0–60°)');
  lines.push('• Разгибание в тренажёре (лёгкий вес, полный диапазон)');
  lines.push('• Тяга бедром (hip thrust) — минимальная нагрузка на колено');
  lines.push('• Кардио: велосипед (не бег), плавание, эллиптический тренажёр');
  lines.push('');
  lines.push('❌ ВРЕМЕННО ИСКЛЮЧИ:');
  lines.push('• Глубокий присед (>90° сгибания)');
  lines.push('• Выпады с большим шагом');
  lines.push('• Прыжки и плиометрику');
  lines.push('');
  lines.push('🔧 ВОССТАНОВЛЕНИЕ:');
  lines.push('• Укрепляй квадрицепс и ягодицы — снижают нагрузку на колено');
  lines.push('• VMO (внутренняя головка квадрицепса): терминальное разгибание');
  lines.push('• Консультация: при боли >2 нед → MRI/УЗИ');
  return '\n\n' + lines.join('\n');
}
export function getShoulderExternalRotation(message: string): string {
  const relevant = /внешняя ротаци.+плеч|external rotation|ротаторы плеча|вращат.+манжет|face pull зачем/i.test(message);
  if (!relevant) return '';
  const lines: string[] = [];
  lines.push('🔄 ВНЕШНЯЯ РОТАЦИЯ ПЛЕЧА — критическая функция:');
  lines.push('');
  lines.push('🔬 ПОЧЕМУ ЭТО ВАЖНО:');
  lines.push('• При поднятии руки вверх плечо должно вращаться наружу');
  lines.push('• Слабая внешняя ротация → импинджмент → боль при жиме вверх');
  lines.push('• Большинство жимовых мышц — ВНУТРЕННИЕ ротаторы → дисбаланс');
  lines.push('');
  lines.push('📊 ДИСБАЛАНС У ТИПИЧНОГО АТЛЕТА:');
  lines.push('• Много жимов, мало внешней ротации');
  lines.push('• Округлые плечи, сутулость, боль при жиме над головой');
  lines.push('');
  lines.push('📋 УПРАЖНЕНИЯ:');
  lines.push('• Face pull 3×15–20 (важнейшее упражнение!)');
  lines.push('• Внешняя ротация с резиной лёжа/стоя: 3×15–20');
  lines.push('• Band pull apart: 3×20 горизонтально');
  lines.push('• Турецкий подъём с гирей/гантелью');
  lines.push('');
  lines.push('⚡ ПРАВИЛО: каждый жимовой подход = 1 подход внешней ротации');
  lines.push('📅 Face pull КАЖДУЮ тренировку — не только раз/нед');
  return '\n\n' + lines.join('\n');
}
export function getAnkleStabilityRehab(message: string): string {
  const keywords = ['голеностоп', 'подвернул ног', 'лодыж', 'ankle', 'стопа нестабильн', 'растяжение связок ног'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦶 СТАБИЛЬНОСТЬ ГОЛЕНОСТОПА:');
  lines.push('');
  lines.push('⚠️ ПОСЛЕ ПОДВОРОТА/РАСТЯЖЕНИЯ:');
  lines.push('• Первые 48ч: RICE (покой, лёд, компрессия, возвышение)');
  lines.push('• День 3-7: лёгкие движения стопой (алфавит в воздухе)');
  lines.push('• Неделя 2+: начинаем укрепление');
  lines.push('');
  lines.push('💪 УПРАЖНЕНИЯ НА СТАБИЛЬНОСТЬ:');
  lines.push('• Стойка на одной ноге: 3×30 сек (глаза открыты → закрыты)');
  lines.push('• Подъёмы на носки одной ногой: 3×15');
  lines.push('• Ходьба на пятках / на носках: 3×20м');
  lines.push('• Баланс на нестабильной поверхности (подушка, BOSU)');
  lines.push('• Резинка: эверсия/инверсия стопы, 3×15');
  lines.push('');
  lines.push('🏋️ ВЛИЯНИЕ НА ТРЕНИРОВКИ:');
  lines.push('• Нестабильный голеностоп → компенсация в коленях и пояснице');
  lines.push('• Приседания: штангетки помогают при ограниченной дорсифлексии');
  lines.push('• Разминка голеностопа перед любыми упражнениями стоя');
  return '\n\n' + lines.join('\n');
}
export function getTrainingWithHernia(message: string): string {
  const keywords = ['грыж', 'протруз', 'межпозвон', 'herniat', 'disc', 'грыжа диск', 'выпячиван'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('⚕️ ТРЕНИРОВКИ ПРИ ГРЫЖЕ/ПРОТРУЗИИ ДИСКА:');
  lines.push('');
  lines.push('⚠️ ВАЖНО: консультация невролога/ортопеда ОБЯЗАТЕЛЬНА!');
  lines.push('');
  lines.push('✅ ОБЫЧНО БЕЗОПАСНО:');
  lines.push('• Ходьба — лучшее лекарство');
  lines.push('• Плавание на спине');
  lines.push('• Укрепление кора (планка, bird-dog, dead bug)');
  lines.push('• Тяга верхнего блока с умеренным весом');
  lines.push('• Жим ногами (без скругления поясницы!)');
  lines.push('• Упражнения МакКензи (разгибания лёжа)');
  lines.push('');
  lines.push('⚠️ С ОСТОРОЖНОСТЬЮ:');
  lines.push('• Жим лёжа — нейтральная поясница, без моста');
  lines.push('• Приседания: только с разрешения врача, начинать с goblet');
  lines.push('');
  lines.push('❌ ИЗБЕГАТЬ:');
  lines.push('• Становая тяга (пока нет ремиссии)');
  lines.push('• Скручивания и ситапы (компрессия дисков)');
  lines.push('• Наклоны с весом');
  lines.push('• Прыжки и ударная нагрузка');
  lines.push('');
  lines.push('🎯 ПРИНЦИП: укрепление мышечного корсета = лучшая стабилизация позвоночника');
  return '\n\n' + lines.join('\n');
}
export function getWristWrapsAccessories(message: string): string {
  const keywords = ['бинт кист', 'лямки', 'кистевые бинт', 'wrist wrap', 'lifting strap', 'пояс тяжелоатлет', 'наколенник', 'экипировк'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🎽 ЭКИПИРОВКА ДЛЯ ТРЕНИРОВОК:');
  lines.push('');
  lines.push('🔧 КИСТЕВЫЕ БИНТЫ (Wrist Wraps):');
  lines.push('• Для: жимов (лёжа, стоя, гантелей)');
  lines.push('• Зачем: стабилизация запястья, профилактика травм');
  lines.push('• Когда: при весах >70% 1ПМ');
  lines.push('');
  lines.push('🪢 ЛЯМКИ (Lifting Straps):');
  lines.push('• Для: тяг, шрагов, тяжёлых тяг');
  lines.push('• Зачем: хват не лимитирует целевую мышцу');
  lines.push('• ⚠️ Не используй на каждой тренировке — хват тоже надо развивать');
  lines.push('');
  lines.push('🏋️ ТЯЖЕЛОАТЛЕТИЧЕСКИЙ ПОЯС:');
  lines.push('• Для: приседов, тяг, жима стоя с тяжёлыми весами');
  lines.push('• Зачем: ↑ внутрибрюшное давление → стабильность поясницы');
  lines.push('• Когда: >80% 1ПМ; не носить постоянно');
  lines.push('');
  lines.push('🦵 НАКОЛЕННИКИ (Knee Sleeves):');
  lines.push('• Согревают сустав, лёгкая поддержка');
  lines.push('• Не путать с бинтами (wraps) — те добавляют отдачу');
  lines.push('');
  lines.push('👟 ОБУВЬ:');
  lines.push('• Штангетки: присед, жим стоя (каблук помогает)');
  lines.push('• Плоская подошва (конверсы): становая тяга');
  lines.push('• ❌ Беговые кроссовки с амортизацией — нестабильны!');
  return '\n\n' + lines.join('\n');
}
export function getJointFriendlyAlternatives(message: string): string {
  const keywords = ['суставы болят', 'щадящ', 'альтернатив для сустав', 'joint friendly', 'без нагрузки на сустав', 'бережн'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦴 ЩАДЯЩИЕ АЛЬТЕРНАТИВЫ УПРАЖНЕНИЙ:');
  lines.push('');
  lines.push('🦵 КОЛЕНИ:');
  lines.push('• Вместо приседов: жим ногами, болгарские сплиты с малым весом');
  lines.push('• Вместо разгибаний ног: терминальные разгибания (TKE) с резинкой');
  lines.push('• Вместо выпадов: step-ups на низкую ступень');
  lines.push('');
  lines.push('💪 ПЛЕЧИ:');
  lines.push('• Вместо жима из-за головы: жим гантелей нейтральным хватом');
  lines.push('• Вместо тяги к подбородку: махи в стороны с наклоном');
  lines.push('• Вместо классического жима лёжа: жим на наклонной 15-30°');
  lines.push('');
  lines.push('🔙 ПОЯСНИЦА:');
  lines.push('• Вместо становой: тяга трэп-грифом или румынская с гантелями');
  lines.push('• Вместо тяги штанги в наклоне: тяга с опорой на грудь');
  lines.push('• Вместо гиперэкстензии: bird-dog, dead bug');
  lines.push('');
  lines.push('✋ ЗАПЯСТЬЯ:');
  lines.push('• Вместо жима штанги: жим гантелей нейтральным хватом');
  lines.push('• Вместо фронтального приседа: safety bar squat');
  lines.push('');
  lines.push('💡 Правило: если упражнение вызывает боль — замени, не терпи');
  return '\n\n' + lines.join('\n');
}
export function getTendonHealthTraining(message: string): string {
  const keywords = ['сухожил', 'тендин', 'тенд', 'tendon', 'связки укреп', 'ахилл', 'тендиноз'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🦴 ЗДОРОВЬЕ СУХОЖИЛИЙ:');
  lines.push('');
  lines.push('🔬 ОСОБЕННОСТИ:');
  lines.push('• Сухожилия адаптируются в 3-5 раз МЕДЛЕННЕЕ мышц');
  lines.push('• Это причина №1 травм у продвинутых (мышцы готовы, сухожилия нет)');
  lines.push('• Кровоснабжение слабое → заживление долгое');
  lines.push('');
  lines.push('💪 КАК УКРЕПИТЬ:');
  lines.push('• Тяжёлые изометрические удержания: 30-45 сек, 3-5 подходов');
  lines.push('• Медленные эксцентрические нагрузки: 3-5 сек негатив');
  lines.push('• Постепенная прогрессия нагрузки (не +10кг за неделю!)');
  lines.push('• Коллаген + витамин С за 30-60 мин до тренировки');
  lines.push('');
  lines.push('⚠️ ТЕНДИНИТ vs ТЕНДИНОЗ:');
  lines.push('• Тендинит: острое воспаление → лёд, покой, НПВС');
  lines.push('• Тендиноз: дегенерация без воспаления → эксцентрические нагрузки, время');
  lines.push('• Большинство хронических болей = тендиноз, не тендинит');
  lines.push('');
  lines.push('📋 ПРОБЛЕМНЫЕ ЗОНЫ:');
  lines.push('• Локоть: латеральный/медиальный эпикондилит → wrist curls eccentric');
  lines.push('• Колено: тендинопатия надколенника → испанские приседы');
  lines.push('• Ахилл: подъёмы на носки эксцентрические (протокол Альфредсона)');
  return '\n\n' + lines.join('\n');
}
export function getPostureCorrectionExercises(message: string): string {
  const keywords = ['осанк', 'сутулос', 'кифоз', 'posture', 'скруглённ спин', 'голова вперёд', 'выпрямить спин'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('🧍 КОРРЕКЦИЯ ОСАНКИ УПРАЖНЕНИЯМИ:');
  lines.push('');
  lines.push('📊 ТИПИЧНЫЕ ПРОБЛЕМЫ:');
  lines.push('');
  lines.push('1️⃣ ПЕРЕДНИЙ НАКЛОН ГОЛОВЫ:');
  lines.push('• Причина: телефон, компьютер');
  lines.push('• Решение: chin tucks (втягивание подбородка) 3×15, растяжка SCM');
  lines.push('');
  lines.push('2️⃣ ОКРУГЛЁННЫЕ ПЛЕЧИ:');
  lines.push('• Причина: слабые ромбовидные + укороченные грудные');
  lines.push('• Решение: face pulls 3×20, растяжка грудных в дверном проёме');
  lines.push('• Band pull-aparts: 100 повторений/день');
  lines.push('');
  lines.push('3️⃣ ГРУДНОЙ КИФОЗ (горбик):');
  lines.push('• Разгибания на пенном ролике');
  lines.push('• Cat-cow: 2×10');
  lines.push('• Тяга к поясу + подтягивания (укрепление разгибателей)');
  lines.push('');
  lines.push('4️⃣ ПЕРЕДНИЙ НАКЛОН ТАЗА:');
  lines.push('• Причина: слабый пресс + укороченные сгибатели бедра');
  lines.push('• Планка: 3×30-60 сек');
  lines.push('• Растяжка сгибателей бедра: 2×30 сек/сторона');
  lines.push('• Ягодичный мостик: 3×15');
  lines.push('');
  lines.push('📋 РЕЖИМ: ежедневно 10-15 мин, результат за 4-8 недель');
  return '\n\n' + lines.join('\n');
}
export function getShoulderPressVariations(message: string): string {
  const keywords = ['вариант жим плеч', 'жим гантел плеч', 'жим арнольд', 'shoulder press var', 'жим сидя стоя плеч'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  const lines: string[] = [];
  lines.push('💪 ВАРИАЦИИ ЖИМА НА ПЛЕЧИ:');
  lines.push('');
  lines.push('📊 СРАВНЕНИЕ:');
  lines.push('• Жим штанги стоя (OHP): сила + кор + координация');
  lines.push('• Жим штанги сидя: больше изоляция дельт (без читинга)');
  lines.push('• Жим гантелей сидя: больший ROM, каждая сторона работает отдельно');
  lines.push('• Жим гантелей стоя: сила + стабилизация');
  lines.push('• Жим Арнольда: полная ротация → больше передняя дельта');
  lines.push('• Жим в тренажёре: безопасность, изоляция');
  lines.push('');
  lines.push('🎯 ДЛЯ РАЗНЫХ ЦЕЛЕЙ:');
  lines.push('• Сила: жим штанги стоя (OHP) — главное');
  lines.push('• Гипертрофия дельт: жим гантелей сидя + жим Арнольда');
  lines.push('• Здоровье плеч: жим гантелей нейтральным хватом');
  lines.push('• Разнообразие: чередуй варианты каждые 4-6 недель');
  lines.push('');
  lines.push('⚠️ НЮАНСЫ:');
  lines.push('• Жим из-за головы: ИЗБЕГАТЬ (↑ стресс на ротаторы)');
  lines.push('• За головой безопасно только при идеальной мобильности плеч');
  return '\n\n' + lines.join('\n');
}
export function getTrainingKneePain(message: string): string {
  const kw = /колен|мениск|коленн|боль.*колен|колен.*боль|артр.*колен|крестообразн|пкс|связк.*колен/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦵 ТРЕНИРОВКИ ПРИ БОЛЯХ В КОЛЕНЯХ:');
  lines.push('');
  lines.push('⚠️ Важно: сначала диагноз у врача!');
  lines.push('');
  lines.push('✅ Безопасные упражнения:');
  lines.push('• Жим ногами (неполная амплитуда, 45-90°)');
  lines.push('• Разгибания ног (верхняя часть амплитуды, лёгкий вес)');
  lines.push('• Ягодичный мост / hip thrust — нет нагрузки на колени');
  lines.push('• Румынская становая — минимальное сгибание колена');
  lines.push('• Степ-апы на низкую платформу (15-20 см)');
  lines.push('• Сгибания ног лёжа — укрепляют бицепс бедра');
  lines.push('');
  lines.push('❌ Избегать или модифицировать:');
  lines.push('• Глубокие приседания — пока боль не пройдёт');
  lines.push('• Выпады с шагом вперёд → замена: обратные выпады (меньше нагрузки)');
  lines.push('• Прыжки и плиометрика — высокий ударный стресс');
  lines.push('• Бег по жёсткому покрытию');
  lines.push('');
  lines.push('🔧 Реабилитация:');
  lines.push('• Укрепление VMO (внутренней головки квадрицепса)');
  lines.push('• Тренировка баланса на нестабильных поверхностях');
  lines.push('• Растяжка IT-тракта и квадрицепса');
  lines.push('• Укрепление мышц бедра: отведение/приведение');
  lines.push('• Лёд после тренировки при отёке (15 мин)');
  lines.push('');
  lines.push('📈 Возвращение к нагрузкам:');
  lines.push('• Правило: 0 боли во время и после упражнения');
  lines.push('• Прогрессия: амплитуда → вес → объём');
  lines.push('• Наколенники (7мм неопрен) — тепло + компрессия');
  return '\n\n' + lines.join('\n');
}
export function getShoulderImpingementTraining(message: string): string {
  const kw = /импинджмент|защемлен.*плеч|плеч.*защемлен|субакромиальн|боль.*плеч.*жим|жим.*боль.*плеч|плеч.*бурсит/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦴 ТРЕНИРОВКИ ПРИ ИМПИНДЖМЕНТ-СИНДРОМЕ ПЛЕЧА:');
  lines.push('');
  lines.push('⚠️ Диагноз должен подтвердить ортопед!');
  lines.push('');
  lines.push('❌ Исключить/модифицировать:');
  lines.push('• Жим штанги стоя (за голову — категорически!)');
  lines.push('• Тяга штанги к подбородку широким хватом');
  lines.push('• Разведение гантелей стоя выше 80° (не до горизонта)');
  lines.push('• Жим лёжа с полной амплитудой → ограничь спуск (не касаясь груди)');
  lines.push('');
  lines.push('✅ Безопасные альтернативы:');
  lines.push('• Жим гантелей нейтральным хватом (ладони друг к другу)');
  lines.push('• Жим Лендмайн (landmine press) — дуговая траектория');
  lines.push('• Тяга к лицу (face pull) — укрепляет ротаторы');
  lines.push('• Разведение в наклоне (задняя дельта)');
  lines.push('• Cable lateral raise — контроль на всей амплитуде');
  lines.push('');
  lines.push('🔧 Реабилитация (ежедневно):');
  lines.push('• Внешняя ротация с резинкой — 3×15');
  lines.push('• Scapular wall slides — 3×10');
  lines.push('• Растяжка грудных (дверной проём) — 3×30с');
  lines.push('• Sleeper stretch — 3×30с каждая сторона');
  lines.push('• Укрепление нижней трапеции — prone Y-raises');
  lines.push('');
  lines.push('📈 Прогрессия: безболезненная амплитуда → полная → добавляй вес');
  return '\n\n' + lines.join('\n');
}
export function getNeckTrainingSafety(message: string): string {
  const kw = /шея.*тренир|тренир.*шеи|шею.*качать|накачать.*шею|neck.*train|упражн.*шеи|борц.*мост/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🦴 БЕЗОПАСНАЯ ТРЕНИРОВКА МЫШЦ ШЕИ:');
  lines.push('');
  lines.push('⚠️ Шея — зона повышенного риска! Тренируй осторожно.');
  lines.push('');
  lines.push('💪 Мышцы шеи:');
  lines.push('• SCM (грудино-ключично-сосцевидная) — сгибание');
  lines.push('• Трапеция (верхняя) — разгибание, боковой наклон');
  lines.push('• Глубокие сгибатели — стабилизация');
  lines.push('');
  lines.push('✅ Безопасные упражнения:');
  lines.push('• Сгибание/разгибание с полотенцем (самосопротивление)');
  lines.push('• Изометрические: рука давит на голову, шея сопротивляется (10с×4 стороны)');
  lines.push('• Neck curl на скамье с блином (начинай с 2.5 кг!)');
  lines.push('• Neck extension на скамье с блином');
  lines.push('• Шрагги — трапеции вносят вклад в объём шеи');
  lines.push('');
  lines.push('❌ Избегать:');
  lines.push('• Борцовский мост (экстремальная нагрузка на позвонки)');
  lines.push('• Быстрые вращения головой с весом');
  lines.push('• Тяжёлые веса до освоения техники');
  lines.push('');
  lines.push('📊 Программа:');
  lines.push('• 2-3 раза/неделю, 2-3 подхода × 15-25 повторений');
  lines.push('• Лёгкий вес, медленный темп, полный контроль');
  lines.push('• Прогрессия: +0.5-1 кг в неделю максимум');
  lines.push('• Сначала изометрия 2 недели → затем динамические');
  return '\n\n' + lines.join('\n');
}
export function getShoulderMobilityDrills(message: string): string {
  const kw = /мобильност.*плеч|плеч.*мобильност|плеч.*разминк|растяжк.*плеч|overhead.*mobil|плеч.*не.*подним/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔄 МОБИЛЬНОСТЬ ПЛЕЧЕВОГО СУСТАВА:');
  lines.push('');
  lines.push('📐 Почему важно:');
  lines.push('• Плечо — самый подвижный и нестабильный сустав');
  lines.push('• Ограниченная мобильность → компенсация поясницей');
  lines.push('• Необходима для жимов, подтягиваний, приседов с штангой');
  lines.push('');
  lines.push('🔧 Ежедневные упражнения (10 мин):');
  lines.push('• Пропускание палки (dislocates): 2×15 (постепенно сужай хват)');
  lines.push('• Вращения в плечах с лентой: 2×10 каждое направление');
  lines.push('• Dead hang на турнике: 3×20-30 секунд');
  lines.push('• Sleeper stretch: 2×30с каждая сторона');
  lines.push('• Растяжка грудных в дверном проёме: 2×30с');
  lines.push('• Контролируемые круговые движения руками: 2×10');
  lines.push('');
  lines.push('📊 Перед тренировкой:');
  lines.push('• Band pull-apart: 2×15');
  lines.push('• Shoulder CARs (контролируемые артикуляции): 5 каждое направление');
  lines.push('• Face pulls лёгкие: 2×15');
  lines.push('• Wall slides: 2×10');
  lines.push('');
  lines.push('⏱️ Результаты:');
  lines.push('• 2-4 недели ежедневной работы → заметное улучшение');
  lines.push('• Не форсируй! Боль = стоп');
  lines.push('• Лучше 10 мин ежедневно, чем 30 мин раз в неделю');
  return '\n\n' + lines.join('\n');
}
export function getPostInjuryReturn(message: string): string {
  const kw = /после.*травм.*тренир|возвращ.*тренир.*травм|травм.*как.*начать|когда.*можно.*трениров.*после|реабилитац.*зал/i;
  if (!kw.test(message)) return '';
  const lines: string[] = [];
  lines.push('🔄 ВОЗВРАЩЕНИЕ В ЗАЛ ПОСЛЕ ТРАВМЫ:');
  lines.push('');
  lines.push('⚠️ Главное правило: разрешение врача/физиотерапевта!');
  lines.push('');
  lines.push('📋 Фазы возвращения:');
  lines.push('');
  lines.push('📅 Фаза 1 — Безболезненная амплитуда (1-2 нед):');
  lines.push('• Только движения без боли');
  lines.push('• Без отягощений или минимальные');
  lines.push('• Изометрические упражнения');
  lines.push('• Тренируй НЕПОВРЕЖДЁННЫЕ части тела!');
  lines.push('');
  lines.push('📅 Фаза 2 — Лёгкая нагрузка (2-4 нед):');
  lines.push('• 30-50% от прежних рабочих весов');
  lines.push('• Высокие повторения (15-20)');
  lines.push('• Увеличивай амплитуду постепенно');
  lines.push('• Фокус: качество движения, не вес');
  lines.push('');
  lines.push('📅 Фаза 3 — Прогрессия (4-8 нед):');
  lines.push('• Увеличивай вес на 10% в неделю');
  lines.push('• Возвращай нормальные повторения (8-12)');
  lines.push('• Слушай тело: дискомфорт ≠ боль');
  lines.push('');
  lines.push('📅 Фаза 4 — Полное возвращение:');
  lines.push('• 90-100% от прежних весов');
  lines.push('• Профилактические упражнения в каждой тренировке');
  lines.push('');
  lines.push('💡 Правило: если было больно вчера → сегодня не увеличивай');
  return '\n\n' + lines.join('\n');
}
export function getHipMobilityComplex(message: string): string {
  const keywords = ['тазобедренн', 'hip mobility', 'бёдра подвижность', 'раскрытие таза', 'присед глубина', 'тугие бёдра'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `\n\n[КОМПЛЕКС МОБИЛЬНОСТИ ТАЗОБЕДРЕННОГО СУСТАВА]
Ограниченная подвижность ТБС — причина №1 плохой техники приседаний и болей в пояснице.

5-минутный комплекс перед тренировкой:
1. 90/90 stretch (30 сек на сторону)
   - Сядь на пол, обе ноги согнуты под 90°
   - Наклонись к передней ноге, держи спину прямо

2. Глубокий присед с раскачиванием (60 сек)
   - Присядь максимально глубоко, локти упрись в колени
   - Покачивайся из стороны в сторону

3. Казачий присед (8 на сторону)
   - Широкая стойка, перенеси вес на одну ногу
   - Опустись, выпрямляя другую ногу

4. Pigeon stretch (30 сек на сторону)
   - Передняя нога согнута перед собой
   - Задняя вытянута назад, опустись на предплечья

5. Махи ногой (10 вперёд-назад + 10 в стороны)
   - Контролируемые маховые движения
   - Увеличивай амплитуду постепенно

Для тех кто сидит весь день:
- Делай этот комплекс 2 раза в день (утро + перед тренировкой)
- Добавь "couch stretch" (2 мин на сторону) — лучшее для сгибателей бедра
- Прогресс заметен через 2-3 недели регулярной практики.`;
}
export function getMsmJoints(message: string): string {
  const keywords = ['msm', 'метилсульфонилметан', 'мсм', 'сера для суставов', 'msm суставы'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧪 MSM (МЕТИЛСУЛЬФОНИЛМЕТАН):

Что это:
Органическое соединение серы. Сера — третий
по количеству минерал в теле (после кальция и фосфора).

Механизм:
- Донор серы для синтеза коллагена и кератина
- Противовоспалительное (ингибирует NF-κB)
- Антиоксидантное (повышает глутатион)
- Снижает проницаемость клеточных мембран (отёки)

Для спортсменов:
- Снижение мышечной боли после тренировок
- Ускорение восстановления суставов и связок
- Уменьшение DOMS на 30% (исследование 2012)
- Снижение маркеров воспаления (IL-6, CRP)
- Поддержка синтеза коллагена

Дозировка:
- Суставы: 1500-3000 мг/день
- Восстановление: 3000-6000 мг/день
- Разделить на 2-3 приёма
- Эффект накопительный (2-4 недели)

Синергия:
- MSM + глюкозамин + хондроитин = золотой стандарт
- MSM + витамин C = усиление синтеза коллагена
- MSM + бромелаин = противовоспалительный стек

Побочки: минимальные. Редко: ЖКТ дискомфорт, головная боль.
Качество: OptiMSM® — лучший бренд (дистиллированный).`;
}
export function getHipFlexorMobility(message: string): string {
  const keywords = ['подвздошно-поясничная', 'сгибатель бедра', 'hip flexor', 'растяжка бедра', 'тугие сгибатели', 'псоас'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧘 МОБИЛЬНОСТЬ СГИБАТЕЛЕЙ БЕДРА — ГАЙД ДЛЯ СПОРТСМЕНОВ:

Почему это важно:
- 8+ часов сидения/день = укороченные сгибатели бедра
- Тугие сгибатели → боль в пояснице (передний наклон таза)
- Слабая активация ягодиц (реципрокное торможение)
- Ограниченная амплитуда в приседе, тяге, выпадах

Подвздошно-поясничная мышца (psoas):
- Главный сгибатель бедра
- Соединяет поясничный отдел с бедром
- При укорочении: тянет поясницу вперёд

Лучшие растяжки:
1. Выпад с поднятой рукой (30-60 сек/сторону)
2. «Диван-стретч» (стопа на стене/диване за собой)
3. Half-kneeling hip flexor stretch с боковым наклоном
4. Pigeon pose (поза голубя — йога)
5. 90/90 stretch (обе ноги под 90°)

Активация антагонистов:
- Ягодичный мостик: активируем ягодицы → расслабляем сгибатели
- Bird-dog: стабилизация + разгибание бедра
- Румынская тяга: удлинение задней цепи

Протокол:
- Утром: 5 минут мобильность (раскрыть после сна)
- Перед приседом/тягой: динамическая растяжка 2 минуты
- Вечером: статическая растяжка 30-60 сек × 3 подхода
- Каждый час сидения: встать и сделать выпад (30 сек)

Важно: растяжка + укрепление ягодиц = двойной эффект. Только растяжка без укрепления — временный результат.`;
}
export function getFrontSquatMobility(message: string): string {
  const relevant = /фронтальн.+присед.+мобильност|front.?squat.+mobil|присед.+фронт.+гибкост|не.+могу.+фронтальн|запястья.+фронтальн.+присед/i.test(message);
  if (!relevant) return '';
  return `
🧘 ФРОНТАЛЬНЫЙ ПРИСЕД — МОБИЛЬНОСТЬ И РЕШЕНИЕ ПРОБЛЕМ:

Три критичных зоны мобильности:

1. ЗАПЯСТЬЯ И ПЕРЕДНИЙ ХВАТ (самая частая проблема):
Проблема: не удерживаете гриф в «стойке» (локти падают)
Решения:
- Растяжка запястий: ладони на стене, пальцы вниз, 30 сек × 3
- Кросс-хват (руки крестом): альтернатива если не хватает гибкости
- Лямки на грифе: держаться за лямки вместо самого грифа
- Прогрессия: начать с 2 пальцев на грифе → добавлять
- Ежедневно: 2-3 мин растяжки запястий

2. ГРУДНОЙ ОТДЕЛ ПОЗВОНОЧНИКА:
Проблема: округление спины → локти падают → штанга скатывается
Решения:
- Cat-cow (кошка-корова): 10 повторений перед тренировкой
- Foam roller extension: лёжа спиной на ролле, раскрыть грудь
- Seated rotation: сидя, повороты с палкой на плечах
- Гантельные пуловеры: раскрывают грудной отдел
- Ежедневно: 5 мин работы на грудной отдел

3. ГОЛЕНОСТОП:
Проблема: пятки отрываются, наклон вперёд чрезмерный
Решения:
- Мобильность голеностопа: колено к стене (30 сек × 3/нога)
- Штангетки с каблуком (подъём пятки на 1-2 см) — мгновенное решение
- Блины под пятки (временная мера)
- Бандаж: floss band на голеностоп перед тренировкой
- Ежедневно: 3-5 мин работы на dorsiflexion

Разминочный протокол перед фронтальным приседом:
1. Foam roller грудной отдел: 2 мин
2. Растяжка запястий: 1 мин
3. Goblet squat с паузой 10 сек внизу: 2×5
4. Фронтальный присед с пустым грифом: 2×5 (фокус на позицию)
5. Рабочие подходы

Альтернативы при плохой мобильности:
- Goblet squat: гантель у груди = та же механика
- Safety Squat Bar: хват не нужен
- Zercher squat: гриф на сгибе локтей`;
}
export function getMachineShoulderPressGuide(message: string): string {
  const relevant = /жим.+плечи.+тренажёр.+подробн|machine.+shoulder.+press|жим.+дельт.+машин|тренажёр.+для.+плеч.+техник|жим.+в.+хаммер.+плечи/i.test(message);
  if (!relevant) return '';
  return `
🏗️ ЖИМ НА ПЛЕЧИ В ТРЕНАЖЁРЕ — ПОЛНЫЙ ГАЙД:

Типы тренажёров:
1. Converging (сходящаяся траектория): руки сходятся вверху → больше медиальная дельта
2. Parallel (параллельная): руки идут параллельно → больше передняя дельта
3. Hammer Strength: рычажная система, каждая рука независимо
4. Смит: фиксированная вертикальная траектория

Преимущества тренажёра:
- Безопасность: нет риска уронить на голову
- Изоляция дельт: стабилизаторы работают минимально
- Работа до отказа без партнёра
- Идеально для дроп-сетов (быстрая смена веса)
- Менее стрессово для плечевого сустава

Техника:
1. Сесть ровно, спина прижата к спинке
2. Хват на уровне плеч (ручки на уровне ушей в нижней точке)
3. Жать вверх, НЕ блокируя локти полностью
4. Контролируемое опускание (2-3 сек)
5. Не опускать ниже уровня ушей (стресс для плечей)

Когда использовать тренажёр vs свободный вес:
✅ Тренажёр: финишер после тяжёлых жимов, дроп-сеты, реабилитация
✅ Тренажёр: новички (безопасно учить паттерн)
✅ Свободные веса: основное упражнение для силы и координации
✅ Оптимум: начать со свободных → закончить тренажёром

Программирование:
- После жима стоя/сидя: 3×10-15 (добивка)
- Как основное (при травмах): 4×8-12
- Дроп-сет: 4 сброса по 20%, до отказа на каждом
- Суперсет: машинный жим + латеральные подъёмы = объём дельт`;
}
export function getGutBrainAxisTraining(message: string): string {
  const relevant = /кишечник.+мозг.+ос|ось.+кишечник|gut.?brain.+axis|микробиом.+настроен|кишечник.+тренировк.+связь/i.test(message);
  if (!relevant) return '';
  return `
🧠🦠 ОСЬ КИШЕЧНИК-МОЗГ В СПОРТЕ:

Что это:
- Двунаправленная связь между кишечником и мозгом
- Через блуждающий нерв, гормоны, иммунные сигналы
- 95% серотонина производится в кишечнике (не в мозге!)
- 70% иммунных клеток — в кишечнике

Как тренировки влияют на кишечник:
Умеренные тренировки (позитивно):
✅ Увеличение разнообразия микробиома на 22%
✅ Рост полезных бактерий (Akkermansia, Faecalibacterium)
✅ Улучшение барьерной функции кишечника
✅ Снижение воспаления (короткоцепочечные жирные кислоты)

Чрезмерные тренировки (негативно):
❌ «Leaky gut» (повышенная проницаемость) — при >2 часов интенсивных
❌ Перенаправление крови от ЖКТ → ишемия слизистой
❌ Повышение кортизола → дисбактериоз
❌ НПВС (ибупрофен) после тренировок → повреждение слизистой

Как кишечник влияет на тренировки:
- Серотонин → настроение, мотивация, болевой порог
- ГАМК (производится бактериями) → спокойствие, сон
- Дофамин (50% в кишечнике) → мотивация к тренировкам
- Воспаление из кишечника → системное → замедление восстановления
- Усвоение нутриентов → синтез белка → рост мышц

Оптимизация оси кишечник-мозг:
1. Разнообразие питания: 30+ видов растений в неделю
2. Ферментированные продукты: кефир, квашеная капуста, комбуча
3. Пребиотики: клетчатка, инулин, ФОС (пища для бактерий)
4. Пробиотики: 20-50 млрд КОЕ мультиштаммовый
5. L-глутамин: 5 г/день (восстановление слизистой)
6. Стресс-менеджмент: медитация, сон (кортизол → дисбиоз)
7. Минимизация НПВС, антибиотиков, алкоголя`;
}
export function getHipMobilityRoutines(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['подвижность бёдер', 'мобильность тазобедренного', 'hip mobility routine', 'раскрытие тазобедренных', 'растяжка бёдер комплекс', 'разминка бёдер'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🧘 МОБИЛЬНОСТЬ ТАЗОБЕДРЕННЫХ СУСТАВОВ — ПОЛНЫЕ РУТИНЫ:

═══ ПОЧЕМУ ЭТО КРИТИЧНО ═══
• Тазобедренный = самый нагруженный сустав в силовых
• Ограниченная подвижность → компенсация поясницей → травма
• Глубокий присед невозможен без адекватной мобильности бёдер
• Сидячий образ жизни → укорочение сгибателей → «передний наклон таза»

═══ РУТИНА #1: БЫСТРАЯ РАЗМИНКА (5 мин, перед тренировкой) ═══
1. Круги бёдрами стоя: 10 в каждую сторону
2. Выпады казака: 8 на каждую ногу, плавно
3. Махи ногой вперёд-назад: 10 на каждую ногу
4. 90/90 переходы на полу: 8 повторений
5. Приседание «гоблет» с паузой внизу: 5 × 3-5 сек

═══ РУТИНА #2: ГЛУБОКАЯ РАБОТА (15-20 мин, отдельно или после тренировки) ═══
1. Растяжка сгибателей бедра (полуприсед): 60 сек каждая сторона
2. «Голубь» (pigeon pose): 60-90 сек каждая сторона
3. «Лягушка» (frog stretch): 60-90 сек, плавное покачивание
4. 90/90 растяжка с наклоном: 45-60 сек каждая позиция
5. Внутренняя поверхность бедра (боковой выпад): 60 сек
6. Ягодичный мостик с паузой: 10 × 5 сек наверху
7. «Скорпион» лёжа: 8-10 на каждую сторону

═══ РУТИНА #3: КОРРЕКЦИЯ ДЛЯ ПРИСЕДА ═══
Если не можешь сесть глубоко:
1. Приседание с удержанием за опору: 3 × 30 сек внизу
2. Растяжка приводящих в широкой стойке: 60 сек
3. Мобилизация голеностопа у стены: 15 повторений каждая нога
4. Стрейч-банд дистракция тазобедренного: 60 сек
5. Глубокий присед со сведёнными руками: 5 × 10 сек

═══ ЕЖЕДНЕВНЫЕ ПРИВЫЧКИ ═══
• Сидение на полу вместо дивана (10-15 мин/день)
• 90/90 позиция при просмотре телефона
• Глубокий присед «на корточках» (1-3 мин/день)
• Прогулка с широким шагом
• Каждый час вставать и делать 5 круговых движений бёдрами

═══ ПРОГРЕСС ═══
• Неделя 1-2: возможен дискомфорт, ограниченная амплитуда
• Неделя 3-4: заметное улучшение «глубины» приседа
• Неделя 5-8: значительный прогресс во всех упражнениях
• 3 месяца: полная амплитуда движения для большинства людей
`;
}
export function getWristStrengthGuide(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['сила запястий', 'wrist strength', 'укрепление запястий', 'запястья болят', 'слабые запястья', 'запястья тренировка'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🤜 УКРЕПЛЕНИЕ ЗАПЯСТИЙ — ПОЛНОЕ РУКОВОДСТВО:

═══ ЗАЧЕМ УКРЕПЛЯТЬ ═══
• Запястья — слабое звено в жимах, тягах, подъёмах
• Слабые запястья = ограничение рабочих весов
• Профилактика тендинита и туннельного синдрома
• Улучшение хвата и контроля снаряда

═══ УПРАЖНЕНИЯ С ВЕСОМ ═══
1. Сгибание запястий (wrist curls):
   • Предплечье на скамье, кисть свисает
   • Гантель/штанга, 3 × 15-20
   • Медленно! 2 сек вверх, 3 сек вниз

2. Разгибание запястий (reverse wrist curls):
   • То же, но ладонью вниз
   • Лёгкий вес! 3 × 15-20
   • Укрепляет разгибатели — профилактика «теннисного локтя»

3. Пронация/супинация с молотком:
   • Держишь молоток/гантель за один конец
   • Вращение внутрь и наружу
   • 3 × 10-15 каждое направление

4. Farmer's walk (прогулка фермера):
   • Тяжёлые гантели/гири, ходьба 30-60 сек
   • Комплексное укрепление всей цепи

═══ УПРАЖНЕНИЯ БЕЗ ОБОРУДОВАНИЯ ═══
• Круговые движения запястьями: 20 в каждую сторону
• Сжимание теннисного мяча: 3 × 20 сжиманий
• Растяжка «молитва»: ладони вместе, давить вниз, 30 сек
• Растяжка «обратная молитва»: тыльные стороны вместе, 30 сек
• Отжимания на кулаках: укрепляют запястья в нейтральной позиции

═══ РЕАБИЛИТАЦИЯ ═══
При боли в запястьях:
• Снизить вес на 30-50% во всех упражнениях
• Использовать кистевые бинты (wrist wraps) временно
• Разминка запястий перед КАЖДОЙ тренировкой (5 мин)
• Ледяной массаж после тренировки: 10 мин
• Если боль > 2 недель → к врачу (возможно повреждение связок)

═══ ПРОГРАММА УКРЕПЛЕНИЯ (4 недели) ═══
Каждый день (5 мин):
• Круговые движения: 20 × в каждую сторону
• Сжимание мяча: 20 раз
• Растяжки: по 30 сек

3 раза в неделю (после тренировки):
• Сгибания запястий: 3 × 15-20
• Разгибания: 3 × 15-20
• Пронация/супинация: 2 × 12
`;
}
export function getHamstringInjuryPrev(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['травма задней поверхности', 'hamstring injury', 'профилактика задней поверхности', 'растяжение бицепса бедра', 'порвал заднюю', 'надрыв задней'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
🛡️ ПРОФИЛАКТИКА ТРАВМ ЗАДНЕЙ ПОВЕРХНОСТИ БЕДРА:

═══ ПОЧЕМУ ЗАДНЯЯ РВЁТСЯ ═══
• Самая частая мышечная травма в спорте (12-33% всех травм)
• Причина: дисбаланс квадрицепс/бицепс бедра (должно быть ≥0.6)
• Фактор: недостаточная эксцентрическая сила
• Риск: быстрые движения (спринт, прыжки, махи)
• Повторные травмы: 30% рецидив в первый год!

═══ ФАКТОРЫ РИСКА ═══
• Дисбаланс квадрицепс/бицепс бедра < 0.6
• Слабость при эксцентрических сокращениях
• Недостаточная разминка
• Предыдущие травмы задней поверхности
• Тугие сгибатели бедра (передний наклон таза)
• Низкая мобильность тазобедренного сустава
• Утомление (конец тренировки/матча)

═══ ПРОГРАММА ПРОФИЛАКТИКИ ═══
1. Нордические сгибания (Nordic hamstring curl):
   • ЛУЧШЕЕ упражнение для профилактики (снижение травм на 51%!)
   • 3 × 3-5 (начинать с эксцентрической фазы только)
   • Прогрессия: от эксцентрики к полному движению

2. РДЛ (румынская тяга):
   • 3 × 8-10, контроль эксцентрики (3 сек)
   • Полная растяжка под нагрузкой

3. Эксцентрические сгибания ног в тренажёре:
   • Поднимать двумя ногами, опускать одной (5 сек)
   • 3 × 6-8 на каждую ногу

4. Мёртвая тяга на одной ноге:
   • Баланс + эксцентрическая нагрузка
   • 3 × 8-10 на каждую ногу

5. Sprinter pulls (с резинкой):
   • Имитация спринта с сопротивлением
   • 3 × 10 на каждую ногу

═══ ПРОТОКОЛ РАЗМИНКИ ═══
Перед каждой тренировкой ног/спины:
1. Динамическая растяжка: маятник вперёд-назад × 10
2. Inchworm (гусеница): 5 повторений
3. Лёгкие нордические (только эксцентрика): 5 повторений
4. Ягодичный мостик: 10 повторений
5. Лёгкие РДЛ с пустым грифом: 10 повторений

═══ ЕСЛИ ТРАВМА ПРОИЗОШЛА ═══
• Немедленно: лёд, компрессия, возвышение (RICE)
• 1-3 день: покой, без нагрузки
• 3-7 день: лёгкие изометрические упражнения
• 1-3 неделя: плавное увеличение амплитуды
• 3-6 неделя: постепенная нагрузка, эксцентрические упражнения
• 6-12 неделя: возврат к полным тренировкам
• ⚠️ К врачу если: острая боль, синяк, невозможно ходить
`;
}
export function getDiabetesTrainingGuide(message: string): string {
  const m = message.toLowerCase();
  const keywords = ['диабет тренировки', 'diabetes training', 'сахарный диабет спорт', 'инсулин тренировка', 'диабет 2 типа спорт', 'глюкоза тренировка'];
  if (!keywords.some(k => m.includes(k))) return '';

  return `
💉 ТРЕНИРОВКИ ПРИ САХАРНОМ ДИАБЕТЕ — РУКОВОДСТВО:

═══ ДИАБЕТ 2 ТИПА И СИЛОВЫЕ ═══
• Силовые тренировки СНИЖАЮТ инсулинорезистентность на 25-40%
• Мышцы = главный потребитель глюкозы в организме
• Больше мышц → больше «губок» для глюкозы → ниже сахар
• После тренировки: глюкоза снижается на 2-5 ммоль/л
• Эффект длится 24-72 часа!

═══ РЕКОМЕНДАЦИИ ═══
• Частота: 3-5 раз/неделю (аэробные + силовые)
• Силовые: 2-3 раза/неделю, 8-10 упражнений, 2-3 × 10-15
• Аэробные: 150 мин/неделю умеренной интенсивности
• Комбинация: наилучший результат по контролю HbA1c

═══ БЕЗОПАСНОСТЬ ═══
⚠️ ОБЯЗАТЕЛЬНО: согласование с эндокринологом!
• Измерять глюкозу ДО тренировки
• <5.5 ммоль/л: перекусить 15-30 г углеводов перед тренировкой
• >14 ммоль/л: НЕ тренироваться, проверить кетоны
• 5.5-14 ммоль/л: безопасный диапазон для тренировки
• Иметь при себе быстрые углеводы (сок, глюкоза)
• Носить медицинский браслет

═══ ГИПОГЛИКЕМИЯ — ПРИЗНАКИ ═══
• Дрожь, потливость, головокружение
• Спутанность сознания, раздражительность
• Слабость, бледность
• Действия: НЕМЕДЛЕННО прекратить тренировку, съесть 15 г быстрых углеводов
• Подождать 15 мин, перемерить → если <4.0, повторить

═══ ОСОБЕННОСТИ ПИТАНИЯ ═══
• Перед тренировкой: 20-30 г сложных углеводов + 15-20 г белка
• Во время (>60 мин): 15-30 г углеводов каждые 30 мин
• После: стандартное восстановление (белок + углеводы)
• Мониторить сахар: перед, каждые 30 мин, после, через 2 часа

═══ НА ИНСУЛИНОТЕРАПИИ ═══
• Корректировка дозы инсулина — ТОЛЬКО с врачом
• Обычно: снижение базального на 10-20% в день тренировки
• Болюсный: снижение перед тренировкой на 25-50%
• Место инъекции: НЕ в мышцу, которая будет работать
• Интенсивная тренировка → может повышать сахар (кортизол, адреналин)
`;
}
export function getAdaptiveInjuryTraining(message: string): string {
  const keywords = ['травм', 'боли', 'болит', 'повреждени', 'после травм', 'адаптив', 'ограничени', 'нельзя делать'];
  const msgLower = message.toLowerCase();
  if (!keywords.some(k => msgLower.includes(k))) return '';
  return `
## Адаптивный тренинг при травмах

### Принцип №1: «Не навреди, но тренируйся»
• Полный покой редко оптимален (кроме острых травм)
• Движение = лечение (за исключением первых 48-72ч острой травмы)
• Тренируй то, что НЕ болит
• Модифицируй упражнения, не отменяй тренировку целиком

### Адаптация по зонам травмы

**Травма плеча:**
✗ Избегать: жим над головой, разводки, тяга к подбородку
✓ Альтернативы: жим в тренажёре (нейтральный хват), отжимания на полу, тяга нижнего блока
✓ Можно: все упражнения на ноги, пресс

**Травма поясницы:**
✗ Избегать: становая тяга, приседания со штангой, гиперэкстензия с весом
✓ Альтернативы: жим ногами, болгарские сплит (без осевой), тренажёры сидя
✓ Реабилитация: планки, bird-dog, dead bug, McGill Big 3

**Травма колена:**
✗ Избегать: глубокие приседания, выпады, прыжки
✓ Альтернативы: жим ногами (малая амплитуда), разгибания (лёгкий вес, 60-90°), велотренажёр
✓ Акцент: укрепление VMO (vastus medialis obliquus)

**Травма запястья:**
✗ Избегать: жим штанги, тяга штанги, сгибания со штангой
✓ Альтернативы: тренажёры с упорами, бретели (лямки), EZ-гриф
✓ Можно: все упражнения на ноги

### Протокол возвращения к тренировкам
**Фаза 1 (0-2 недели):** Лёгкие веса, без боли, 2-3×15-20
**Фаза 2 (2-4 недели):** Постепенный рост нагрузки, 3×12-15
**Фаза 3 (4-8 недель):** Возвращение к обычным весам (80-90%)
**Фаза 4 (8+ недель):** Полноценная нагрузка

### Правило светофора
🟢 **Зелёный (0-3 боль):** Тренируйся нормально
🟡 **Жёлтый (4-6 боль):** Уменьши вес на 30-50%, избегай проблемного движения
🔴 **Красный (7-10 боль):** СТОП, обратись к врачу/физиотерапевту

### Психология травмы
• Травма ≠ конец тренировок
• Обходные пути всегда есть
• Используй время для подтягивания слабых мест
• Травма часть — научиться слушать тело
`;
}
export function getFlexibilityVsMobilityGuide(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['гибкость', 'мобильность', 'flexibility', 'mobility', 'подвижность', 'растяжка vs', 'мобилити', 'диапазон движения', 'range of motion', 'rom', 'амплитуда движения'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🧘 ГИБКОСТЬ VS МОБИЛЬНОСТЬ — РАЗНИЦА И ПРОТОКОЛЫ

📚 ОПРЕДЕЛЕНИЯ:
• Гибкость (Flexibility): пассивный диапазон движения в суставе
  → Мышцы/сухожилия растягиваются, ты не контролируешь позицию
  → Пример: партнёр давит тебе на спину в наклоне
• Мобильность (Mobility): активный контролируемый диапазон движения
  → Суставы + мышцы + нервная система = управляемое движение
  → Пример: ты сам опускаешься в глубокий присед и контролируешь каждый градус

⚡ ПОЧЕМУ МОБИЛЬНОСТЬ > ГИБКОСТИ ДЛЯ АТЛЕТОВ:
• Гибкость без силы = нестабильность → риск травмы
• Мобильность = гибкость + контроль + сила в крайних позициях
• «Пассивный шпагат без контроля = травма при динамическом движении»

🔬 КОМПОНЕНТЫ ОГРАНИЧЕНИЯ ПОДВИЖНОСТИ:
1. Мышечная жёсткость (47%): укороченные мышцы-антагонисты
2. Суставная капсула (41%): фиброзная ткань, ограничивающая ротацию
3. Сухожилия (10%): менее эластичны чем мышцы
4. Кожа (2%): минимальный вклад

📋 ПРОТОКОЛ МОБИЛЬНОСТИ ДЛЯ СИЛОВЫХ АТЛЕТОВ:

ПЛЕЧЕВОЙ СУСТАВ (для жимов и тяг):
1. Пассивное растяжение грудных: дверной проём, 3x30 сек
2. Sleeper stretch (лёжа на боку): 2x30 сек каждое плечо
3. Ротация с палкой: 2x10 внутрь/наружу
4. CARS (Controlled Articular Rotations): 2x5 полных кругов
→ Перед каждой тренировкой верха

ТАЗОБЕДРЕННЫЙ СУСТАВ (для приседов и тяг):
1. 90/90 stretch: 2x30 сек каждая позиция
2. Глубокий присед (goblet hold): 2x30 сек удержание внизу
3. Выпад с ротацией торса: 2x8 каждая сторона
4. Pigeon pose (поза голубя): 2x30 сек
→ Перед каждой тренировкой ног

ГОЛЕНОСТОП (для приседа и выпадов):
1. Стена (knee-to-wall): 3x10 повторений каждая нога
2. Самомассаж икроножных (ролл): 60 сек каждая
3. Alphabet ankles (рисуй буквы стопой): 1 алфавит каждой
→ Критично для глубины приседа

⏰ КОГДА И СКОЛЬКО:
• Перед тренировкой: динамическая мобильность 5-10 мин (НЕ статическая растяжка!)
• После тренировки: статическая растяжка 5-10 мин (3x30 сек на группу)
• Отдельная сессия: 15-20 мин мобильности 2-3 раза/неделю
• ⚠️ Статическая растяжка перед силовой → снижение силы на 5-8% (Simic 2013)

📊 НОРМЫ ПОДВИЖНОСТИ ДЛЯ СИЛОВЫХ УПРАЖНЕНИЙ:
• Присед: дорсифлексия голеностопа ≥35°, сгибание бедра ≥120°
• Жим лёжа: разгибание плеча ≥60°, ретракция лопаток полная
• Становая тяга: сгибание бедра ≥90° при нейтральном позвоночнике
• Жим над головой: сгибание плеча ≥180° без компенсации поясницей

💡 ПРОГРЕССИЯ МОБИЛЬНОСТИ:
Неделя 1-2: пассивные растяжки + CARS (нейрологическая адаптация)
Неделя 3-4: добавить изометрию в растянутой позиции (PAILs/RAILs)
Неделя 5-8: активные упражнения на конечном диапазоне (end-range)
Неделя 9+: нагруженная растяжка (weighted stretching) — продвинутый метод
`;
}
export function getKneeRehabTrainingProtocol(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['реабилитация колена', 'колено болит', 'больное колено', 'knee rehab', 'восстановление колена', 'колено после травмы', 'пкс', 'мениск', 'связки колена', 'артроз колена', 'хруст в колене', 'пателлофеморальный'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🦵 РЕАБИЛИТАЦИЯ КОЛЕНА ЧЕРЕЗ ТРЕНИРОВКИ

⚠️ ВАЖНО: Это общие рекомендации. При острой травме — сначала к врачу!

🔬 АНАТОМИЯ КОЛЕННОГО СУСТАВА:
• 4 связки: ПКС (передняя крестообразная), ЗКС, МКС, ЛКС
• 2 мениска: медиальный (внутренний), латеральный (наружный)
• Надколенник (коленная чашечка): скользит по желобку бедренной кости
• Суставной хрящ: амортизация, 2-4 мм толщины

📋 ТИПИЧНЫЕ ПРОБЛЕМЫ И ПОДХОД:

1. ПАТЕЛЛОФЕМОРАЛЬНЫЙ СИНДРОМ (боль вокруг коленной чашечки):
Причина: слабость VMO (внутренняя головка квадрицепса), тугие IT-band/квадрицепс
Протокол:
• Испанские приседания (Spanish squat): 3x30-45 сек — золотой стандарт
• Терминальное разгибание (terminal knee extension): 3x15
• Изометрический присед у стены: 3x30-45 сек (угол 70-90°)
• Степ-даун (step-down): 3x10 каждая нога — эксцентрический контроль
• Растяжка квадрицепса + IT-band ролл: ежедневно

2. ТЕНДИНОПАТИЯ НАДКОЛЕННИКА («колено прыгуна»):
Причина: перегрузка сухожилия надколенника (бег, прыжки)
Протокол:
• Изометрический жим ногами (угол 60°): 5x45 сек — обезболивание
• Приседания на наклонной доске 25°: 3x15 — нагрузка на сухожилие
• Эксцентрический присед на одной ноге: 3x10 (медленно 3-4 сек вниз)
• Heavy slow resistance: 4x8 @ 70% 1ПМ, темпо 3-0-3 (3 сек вниз, 3 вверх)
• Прогрессия: боль до 3/10 допустима, >5/10 — снизь нагрузку

3. ПОСЛЕ ОПЕРАЦИИ НА ПКС:
Фаза 1 (0-6 нед): ROM восстановление, активация квадрицепса
• Сгибание/разгибание на столе, SLR (подъём прямой ноги)
Фаза 2 (6-12 нед): нагрузка, базовые движения
• Мини-приседания до 60°, жим ногами (ограниченный ROM)
Фаза 3 (3-6 мес): полный ROM, силовая прогрессия
• Полный присед, выпады, степ-ап
Фаза 4 (6-9 мес): возврат к спорту
• Плиометрика, смена направления, спорт-специфика
→ Возврат к полным нагрузкам: 9-12 мес минимум

4. АРТРОЗ (остеоартрит):
• Движение = лекарство! Покой УХУДШАЕТ артроз
• Силовые тренировки: 3x/нед, полный ROM, 3x10-15 @ умеренный вес
• Кардио с низкой нагрузкой: велосипед, плавание, эллипсоид
• Коллаген 10-15г + витамин C за 30-60 мин до тренировки
• Похудение (если есть лишний вес): -1 кг веса тела = -4 кг нагрузки на колено

🏋️ БЕЗОПАСНЫЕ УПРАЖНЕНИЯ ДЛЯ КОЛЕНЕЙ:
✅ Безопасные: жим ногами (контролируемый ROM), мостик, румынская тяга, степ-ап (невысокий), велосипед, плавание
⚠️ С осторожностью: приседания (контролируй глубину), выпады (короткий шаг), разгибание ног (не полный ROM)
❌ Избегать при острой боли: прыжки, бег по асфальту, глубокие выпады, сисси-приседания

💪 УКРЕПЛЕНИЕ МЫШЦ ВОКРУГ КОЛЕНА:
• Квадрицепс (VMO): испанские приседания, терминальное разгибание, присед у стены
• Бицепс бедра: Nordic hamstring curl, мостик на 1 ноге, румынская тяга
• Икроножные: подъём на носки (стабилизация)
• Ягодичные: мостик, clam shell, боковая ходьба с резинкой
→ Баланс квадрицепсы:бицепс бедра = 3:2 (идеальное соотношение)

📈 ПРОГРЕССИЯ:
Боль 0-3/10: можно прогрессировать → добавляй вес/объём
Боль 4-5/10: поддерживай текущий уровень, не увеличивай
Боль >5/10: снизь нагрузку, проконсультируйся с врачом
Боль на следующий день: если прошла за 24ч → нагрузка ОК
`;
}
export function getShoulderImpingementRecoveryTraining(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['импинджмент', 'плечо защемление', 'shoulder impingement', 'субакромиальный', 'боль при жиме', 'плечо болит жим', 'плечевой синдром', 'боль поднимаю руку', 'плечо хрустит', 'ротаторная манжета травма'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🏥 ИМПИНДЖМЕНТ ПЛЕЧА — ВОССТАНОВЛЕНИЕ ЧЕРЕЗ ТРЕНИРОВКИ

⚠️ ОБРАТИСЬ К ВРАЧУ при: острой боли, невозможности поднять руку, ночной боли

🔬 ЧТО ТАКОЕ ИМПИНДЖМЕНТ:
• Защемление сухожилий ротаторной манжеты в субакромиальном пространстве
• При подъёме руки 60-120° — «болезненная дуга»
• Причины: слабость ротаторов, дисбаланс (передние дельты > задние), плохая осанка
• Усугубляет: жим лёжа широким хватом, жим из-за головы, вертикальные тяги за голову

📋 ФАЗЫ ВОССТАНОВЛЕНИЯ:

ФАЗА 1 — РАЗГРУЗКА (1-2 недели):
• Убери все болезненные движения (жимы, разводки, жим над головой)
• Лёд 15 мин после активности
• Лёгкая мобильность: маятник Кодмана (рука висит, круговые качания)
• Самомассаж: задние дельты, инфраспинатус (теннисный мяч у стены)

ФАЗА 2 — АКТИВАЦИЯ (2-4 недели):
1. Изометрическая наружная ротация:
   Полотенце между локтем и корпусом, давишь наружу в стену 10 сек × 5
2. Side-lying external rotation:
   Лёжа на здоровом боку, лёгкая гантель (1-2 кг), 3x15
3. Prone Y-T-W raises:
   Лёжа лицом вниз на скамье, руки в буквы Y, T, W, 2x10 каждая
4. Band pull-apart:
   Резинка перед грудью, разведение, 3x15-20

ФАЗА 3 — УКРЕПЛЕНИЕ (4-8 недель):
1. Face pull с паузой:
   Канат к лицу, пауза 2 сек, 3x15, фокус на внешней ротации
2. Cable external rotation (90/90):
   Локоть на уровне плеча, ротация наружу, 3x12
3. Scaption (подъём в плоскости лопатки):
   Гантели 3-5 кг, подъём на 30° впереди фронтальной плоскости, 3x12
4. Нижняя трапеция:
   Prone Y-raise с весом, 3x10

ФАЗА 4 — ВОЗВРАТ К ТРЕНИРОВКАМ (8+ недель):
• Жим лёжа: начни с 50% от рабочего веса, хват уже (ширина плеч)
• Жим гантелей (нейтральный хват): безопаснее штанги
• Жим над головой: только гантели нейтральным хватом
• Face pull: КАЖДУЮ тренировку, навсегда

🚫 УПРАЖНЕНИЯ — ЧЁРНЫЙ СПИСОК (при импинджменте):
❌ Жим из-за головы
❌ Тяга верхнего блока за голову
❌ Вертикальная тяга штанги к подбородку (upright row) широким хватом
❌ Разводка гантелей лёжа (нагрузка при максимальном растяжении)
❌ Жим лёжа очень широким хватом

✅ ЗАМЕНЫ:
Жим из-за головы → Жим гантелей нейтральным хватом
Upright row → Scaption или lateral raise с наклоном
Разводка лёжа → Cable fly (контролируемый ROM)
Широкий жим → Жим средним хватом + пауза

📐 СООТНОШЕНИЕ ЖИМЫ:ТЯГИ:
• При здоровом плече: 1:1
• При импинджменте: 1:2 или 1:3 (тяг в 2-3 раза больше жимов)
• Каждая тренировка: face pull + band pull-apart (не опция, а обязательство)

💡 ПРОФИЛАКТИКА (чтобы не вернулось):
• Разминка ротаторов перед КАЖДОЙ тренировкой (2-3 мин)
• Face pull: 3x15-20 в каждую тренировку верха
• Осанка: не горбись, ретракция лопаток
• Сон: НЕ на больном плече
• Баланс: задние дельты = передние дельты по объёму
`;
}
export function getHamstringInjuryPreventionProtocol(message: string): string {
  const t = message.toLowerCase();
  const keywords = ['травма бицепса бедра', 'hamstring injury', 'задняя поверхность бедра', 'порвал бицепс бедра', 'растяжение бицепса бедра', 'профилактика бедро', 'задняя цепь травма', 'hamstring prevention', 'бицепс бедра болит', 'потянул заднюю'];
  if (!keywords.some(k => t.includes(k))) return '';

  return `
🦵 ПРОФИЛАКТИКА ТРАВМ ЗАДНЕЙ ПОВЕРХНОСТИ БЕДРА

📊 ПОЧЕМУ ЭТО ВАЖНО:
• Травма бицепса бедра — #1 мышечная травма в спорте
• Рецидив: 30% травм повторяются в первые 2 мес после возврата
• Причины: слабость, дисбаланс квад:хамстринг, недостаточная эксцентрическая сила

🔬 АНАТОМИЯ:
• Бицепс бедра (длинная + короткая головки): сгибание колена + разгибание бедра
• Полуперепончатая: сгибание колена + внутренняя ротация голени
• Полусухожильная: то же + стабилизация колена
• Двусуставные мышцы: пересекают и тазобедренный, и коленный суставы
→ Особенно уязвимы при одновременном разгибании бедра + сгибании колена (спринт!)

📋 ФАКТОРЫ РИСКА:
✅ Контролируемые:
• Слабость бицепса бедра (особенно эксцентрическая)
• Дисбаланс квадрицепс:бицепс бедра (норма 3:2, опасно >2:1)
• Недостаточная разминка
• Усталость (конец тренировки/матча)
• Низкая гибкость (хотя доказательства слабые)

❌ Неконтролируемые:
• Предыдущая травма (#1 фактор!)
• Возраст >25 лет
• Генетика (архитектура волокон)

🛡️ ПРОТОКОЛ ПРОФИЛАКТИКИ:

УПРАЖНЕНИЕ #1 — NORDIC HAMSTRING CURL:
🏆 Золотой стандарт профилактики (мета-анализ: -51% травм!)
• Стоя на коленях, партнёр/фиксатор держит лодыжки
• Медленно опускайся вперёд (3-5 сек), контролируя эксцентрик
• «Поймай» себя руками у пола → оттолкнись назад
Программа:
Неделя 1: 2x3 | Неделя 2: 2x5 | Неделя 3: 3x6 | Неделя 4+: 3x8-10
→ 2-3 раза в неделю, в конце тренировки ног

УПРАЖНЕНИЕ #2 — РУМЫНСКАЯ ТЯГА (RDL):
• Растяжение бицепса бедра под нагрузкой
• 3x8-10 с контролируемым эксцентриком (3 сек вниз)
• Фокус: чувствуй растяжение, не просто поднимай вес

УПРАЖНЕНИЕ #3 — SLIDER LEG CURL:
• Лёжа на спине, пятки на слайдерах/полотенце
• Подними таз → скользи пятками от себя → к себе
• 3x8-10 (прогрессия: одна нога)

УПРАЖНЕНИЕ #4 — МОСТИК НА ОДНОЙ НОГЕ:
• Стопа на скамье/возвышении → подъём таза → пауза 2 сек
• 3x10 каждая нога

УПРАЖНЕНИЕ #5 — СПРИНТОВЫЕ УСКОРЕНИЯ:
• Постепенная прогрессия: 60% → 70% → 80% → 90% скорости
• 4-6 ускорений на 30-50 м в конце тренировки
• Подготовка к эксцентрической нагрузке высокой скорости

📊 ЕЖЕНЕДЕЛЬНЫЙ МИНИМУМ:
• Nordic curl: 2x/нед (3x6-8)
• RDL: 2x/нед (3x8-10)
• Slider curl или мостик 1 нога: 1-2x/нед
• Спринты (прогрессивные): 1x/нед

⚡ СООТНОШЕНИЕ КВАД:ХАМСТРИНГ:
• Тестирование: изокинетический динамометр (в спортклиниках)
• Норма: H:Q = 0.6-0.8 (концентрическое)
• Функциональное: H эксцентрическое : Q концентрическое ≥ 1.0
• Если <0.6: увеличь объём хамстрингов в 2 раза на 6-8 недель

🏥 ЕСЛИ ТРАВМА ПРОИЗОШЛА:
• Фаза 1 (0-5 дней): RICE (покой, лёд, компрессия, возвышение)
• Фаза 2 (5-14 дней): лёгкая ходьба, изометрия, безболезненный ROM
• Фаза 3 (2-6 недель): прогрессивная нагрузка, Nordic eccentric, лёгкий бег
• Фаза 4 (6-12 недель): полная нагрузка, спринты, возврат к спорту
→ Возврат слишком рано = рецидив. Лучше +2 недели, чем -2 месяца
`;
}
export function getAnkleStabilityTrainingProtocol(message: string): string {
  const keywords = ['голеностоп', 'лодыжка', 'ankle', 'подвёртыван', 'подвертыван', 'связки голеностоп', 'растяжен', 'стабильность стопы', 'баланс', 'проприоцепция', 'босиком', 'стопа', 'подошв'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦶 СТАБИЛЬНОСТЬ ГОЛЕНОСТОПА — ПОЛНЫЙ ПРОТОКОЛ:

📐 АНАТОМИЯ И БИОМЕХАНИКА:
• Голеностоп: таранная + большеберцовая + малоберцовая кости
• Латеральные связки (ATFL, CFL, PTFL) — 85% всех травм
• Медиальная дельтовидная связка — мощнее, но тоже уязвима
• Перонеальные мышцы — основные динамические стабилизаторы
• Задний большеберцовый — поддержка свода стопы

🔍 ТЕСТ СТАБИЛЬНОСТИ:
• Стойка на одной ноге с закрытыми глазами — норма >30 сек
• Y-Balance Test — асимметрия >4 см = риск травмы
• Тест дорсифлексии у стены — норма >10 см от стены
• Hop-and-hold — приземление без «дрожания» = хорошая стабильность
• Star Excursion Balance Test — золотой стандарт

💪 УПРАЖНЕНИЯ ДЛЯ СТАБИЛЬНОСТИ:
Уровень 1 (базовый):
• Подъёмы на носки (двуногие) — 3×20
• Alphabet ankles — рисуем буквы стопой
• Towel scrunches — собираем полотенце пальцами
• Стойка на одной ноге — 3×30 сек

Уровень 2 (средний):
• Подъёмы на носки на одной ноге — 3×15
• Босу-шар стойка — 3×45 сек
• Боковые шаги с резинкой — 3×12
• Ходьба на носках/пятках/внешнем крае

Уровень 3 (продвинутый):
• Прыжки на одной ноге с приземлением — 3×8
• Реактивные прыжки на нестабильной поверхности
• Плиометрические дропы с приземлением
• Спринтерские упражнения с резкими сменами направления

⚠️ ПРОФИЛАКТИКА ТРАВМ:
• Разминка голеностопа перед КАЖДОЙ тренировкой — 3-5 минут
• Тейпирование при нестабильности (техника восьмёрки)
• Правильная обувь — жёсткий задник, хороший фиксаж
• При приседе/становой — давление через всю стопу (tripod foot)
• После растяжения — RICE первые 48 часов, затем постепенная нагрузка

🔄 ПРОГРЕССИЯ ПОСЛЕ ТРАВМЫ:
Неделя 1-2: изометрия, ROM без боли, бассейн
Неделя 3-4: упражнения с собственным весом, велосипед
Неделя 5-6: лёгкий бег, балансовые упражнения
Неделя 7-8: плиометрика, спортспецифичные движения
`;
}
export function getRotatorCuffPrehabilitation(message: string): string {
  const keywords = ['ротатор', 'вращательная манжета', 'manжет', 'ротаторная', 'rotator cuff', 'плечо болит', 'боль в плече', 'надостная', 'подостная', 'подлопаточн', 'малая круглая', 'внешняя ротация', 'внутренняя ротация', 'преабилитац', 'прехаб'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏥 ПРЕАБИЛИТАЦИЯ РОТАТОРНОЙ МАНЖЕТЫ — ПОЛНЫЙ ПРОТОКОЛ:

📐 АНАТОМИЯ РОТАТОРНОЙ МАНЖЕТЫ:
• Надостная (supraspinatus) — отведение 0-30°, САМАЯ уязвимая
• Подостная (infraspinatus) — наружная ротация, 60% силы ER
• Малая круглая (teres minor) — помощник наружной ротации
• Подлопаточная (subscapularis) — внутренняя ротация, самая крупная
• Все 4 мышцы ЦЕНТРИРУЮТ головку плеча в суставной впадине

⚠️ ФАКТОРЫ РИСКА ТРАВМ:
• Дисбаланс ER/IR — норма 66-75% (наружная/внутренняя)
• Чрезмерный жим без тяговых движений (push/pull дисбаланс)
• Жим из-за головы, тяга верхнего блока за голову
• Упражнения с руками выше плеч при усталости
• Сон на одном плече

💪 ПРОГРАММА ПРЕАБИЛИТАЦИИ (3 раза в неделю):

Разминка (перед КАЖДОЙ тренировкой верха, 5 мин):
• Band pull-aparts — 2×15
• Наружная ротация с резинкой — 2×12 на руку
• Scapular wall slides — 2×10
• Лёгкие круговые движения руками — 30 сек

Основная программа:
1. Наружная ротация лёжа на боку — 3×15, 1-3 кг
2. Prone Y-T-W raises — 2×10 каждая позиция
3. Face pulls с ротацией — 3×15
4. Тяга к лицу с резинкой — 3×15
5. Cuban press (L-fly) — 2×12, очень лёгкий вес
6. Eccentric ER с гантелей — 2×8 (медленная фаза 4 сек)
7. Bottoms-up KB press — 2×8 (стабилизация)

🎯 СООТНОШЕНИЯ ДЛЯ ЗДОРОВЫХ ПЛЕЧ:
• Push:Pull = 1:1.5-2 (больше тяг, чем жимов)
• Горизонтальные:Вертикальные = 2:1
• Внешняя ротация: 15-20% от силы жима лёжа
• Face pulls: в КАЖДОЙ тренировке верха тела

📋 КРАСНЫЕ ФЛАГИ (к врачу!):
• Боль при отведении руки 60-120° (arc of pain) — тендинит надостной
• Ночная боль, мешающая спать — возможен разрыв
• Слабость при поднятии руки — возможен полный разрыв
• Щелчки + боль при ротации — повреждение labrum
• Боль >2 недель без улучшения

🔄 ИНТЕГРАЦИЯ В ТРЕНИРОВКУ:
Перед жимом: band pull-aparts + ER с резинкой (2×15)
После жима: face pulls 3×15-20
Отдельно: полная программа 2-3 раза в неделю
Суперсет: жим + face pull (экономит время)

⚡ МОДИФИКАЦИЯ УПРАЖНЕНИЙ ПРИ БОЛИ:
• Жим лёжа → жим с пола (ограничивает амплитуду)
• Жим над головой → landmine press (безопаснее для плеча)
• Разводки → кроссовер (постоянное натяжение, меньше стресс)
• Подтягивания → нейтральный хват (меньше импинджмент)
• Отжимания на брусьях → узкий жим (если болят плечи)
`;
}
export function getHipMobilityCompleteRoutine(message: string): string {
  const keywords = ['подвижность бедра', 'подвижность тазобедренн', 'hip mobility', 'тазобедренный', 'раскрытие бёдер', 'сгибатели бедра', 'скован бёдр', 'присед глубина', 'растяжка бёдер', 'pigeon', 'голубь поза'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 ПОДВИЖНОСТЬ ТАЗОБЕДРЕННОГО СУСТАВА — ПОЛНАЯ РУТИНА:

📐 ПОЧЕМУ ЭТО КРИТИЧНО:
• Сидячий образ жизни → укорочение сгибателей бедра → антеверсия таза
• Ограниченная подвижность бедра → компенсация поясницей → боль в спине
• Недостаточная ротация → ограничение глубины приседа
• Слабые ягодицы + тугие сгибатели = «нижний перекрёстный синдром»

🔍 ТЕСТЫ ПОДВИЖНОСТИ:
• Thomas test: лёжа на краю стола, одно колено к груди — висящая нога должна быть горизонтальна (если выше — тугие сгибатели)
• 90/90 test: сидя на полу, обе ноги согнуты 90° — можете ли сидеть ровно?
• Deep squat test: глубокий присед с руками над головой — пятки на полу, торс вертикально
• Internal rotation test: сидя на стуле, развернуть стопу наружу — норма 35-45°

💪 УТРЕННЯЯ РУТИНА (10 мин, ежедневно):

1. 90/90 переходы — 10 на каждую сторону
   Сидя на полу, ноги в 90/90, перекатывание с одной стороны на другую

2. Мировой наибольший стрейч (World's Greatest Stretch) — 5 на сторону
   Выпад → ротация торса к колену → рука вверх → выпрямление ноги

3. Поза голубя (pigeon) — 60 сек на сторону
   Наклон вперёд для глубокого растяжения наружных ротаторов

4. Hip CARs (контролируемые ротации) — 5 кругов на сторону
   Стоя, поднимаем колено вверх → в сторону → назад → полный круг

5. Couch stretch / Растяжка «у дивана» — 60 сек на сторону
   Колено у стены, другая нога в выпаде — растяжка сгибателей

6. Frog stretch / Лягушка — 60 сек
   На четвереньках, колени широко, покачивания назад

🏋️ ПЕРЕД ПРИСЕДАНИЯМИ (5 мин):
• Hip CARs — 5 кругов на сторону
• Goblet squat hold — 30 сек в нижней позиции с гирей
• Казачий присед — 5 на каждую сторону
• Band distraction — резинка на бедро, выпад вперёд — 30 сек/сторону
• Adductor rocks — на четвереньках, покачивания в стороны

📋 ПРОГРЕССИЯ ПО НЕДЕЛЯМ:
Неделя 1-2: статические стретчи, 30-60 сек/позиция
Неделя 3-4: добавить CARs и PAILs/RAILs (сокращение в растянутой позиции)
Неделя 5-6: добавить нагруженную мобильность (goblet squat, казачий)
Неделя 7-8: полные Hip CARs в конечных амплитудах

⚠️ ЧАСТЫЕ ОШИБКИ:
• Растяжка ТОЛЬКО перед тренировкой — недостаточно, нужна отдельная работа
• Агрессивное растягивание холодных мышц — сначала разогрев
• Игнорирование внутренней ротации — важна для глубокого приседа
• Только пассивная растяжка без активной мобильности (CARs)
`;
}
export function getPostureCorrectionTrainingGuide(message: string): string {
  const keywords = ['осанка', 'posture', 'сутулость', 'кифоз', 'лордоз', 'голова вперёд', 'голова вперед', 'округление плеч', 'сколиоз тренировк', 'выпрямление спин', 'правильная осанка'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🧍 КОРРЕКЦИЯ ОСАНКИ ЧЕРЕЗ ТРЕНИРОВКИ:

📐 ТИПИЧНЫЕ НАРУШЕНИЯ:

1. ВЕРХНИЙ ПЕРЕКРЁСТНЫЙ СИНДРОМ (Janda):
   Укорочены: верхняя трапеция, грудные, леватор лопатки
   Ослаблены: глубокие сгибатели шеи, нижняя трапеция, ромбовидные
   Результат: голова вперёд, округлые плечи, кифоз

   Коррекция:
   • Растяжка: грудные (doorway stretch) — 2×30 сек
   • Укрепление: подбородок к себе (chin tucks) — 3×15
   • Face pulls — 3×15-20
   • Тяга к лицу с ротацией — 3×12
   • Prone Y-T-W raises — 2×10 каждая
   • Серратус (serratus wall slides) — 2×12

2. НИЖНИЙ ПЕРЕКРЁСТНЫЙ СИНДРОМ:
   Укорочены: сгибатели бедра, разгибатели поясницы
   Ослаблены: ягодицы, пресс
   Результат: передний наклон таза (anterior pelvic tilt), гиперлордоз

   Коррекция:
   • Растяжка сгибателей бедра (couch stretch) — 2×60 сек
   • Glute bridges — 3×15
   • Dead bugs — 3×10
   • Планка — 3×30-45 сек
   • RKC plank (максимальное сжатие ягодиц) — 3×15 сек
   • Posterior pelvic tilts — 3×15

3. ГРУДНОЙ КИФОЗ (сутулость):
   • Foam roller extension — 2×10 (лёжа на валике вдоль)
   • Cat-cow — 2×10
   • Thoracic rotation — 2×10 на сторону
   • Тяги к груди/лицу — 3×15
   • Band pull-aparts — 3×20

💪 ПРОГРАММА КОРРЕКЦИИ (15 мин/день):
Утро:
• Chin tucks — 15 повторений
• Cat-cow — 10 повторений
• Glute bridge — 15 повторений
• Dead bug — 10 на сторону

Перед тренировкой:
• Band pull-aparts — 2×15
• Doorway chest stretch — 30 сек на сторону
• Hip flexor stretch — 30 сек на сторону
• Thoracic rotation — 10 на сторону

В тренировке:
• Push:Pull = 1:2 (больше тяг!)
• Каждый жим → суперсет с face pull или pull-apart
• Тяги > жимы по объёму

📊 СРОКИ УЛУЧШЕНИЯ:
• 2 недели: заметно лучше «осознание» осанки
• 4-6 недель: видимые изменения при последовательной работе
• 3 месяца: значительное улучшение
• Пожизненная поддержка: осанка требует постоянной работы

⚠️ ВАЖНО:
• Осанку невозможно исправить ТОЛЬКО упражнениями — нужно менять привычки
• Рабочее место: монитор на уровне глаз, кресло с поддержкой поясницы
• Каждые 30-45 мин сидения → встать и подвигаться
• Сон: подушка правильной высоты, не спать на животе
`;
}
export function getTendonLigamentStrengthening(message: string): string {
  const keywords = ['сухожили', 'связки укрепл', 'tendon', 'ligament', 'тендинит', 'тендиноз', 'тендинопат', 'коллаген сухожил', 'ахиллово', 'надколенник сухожил', 'боль сухожил', 'хруст'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 УКРЕПЛЕНИЕ СУХОЖИЛИЙ И СВЯЗОК — НАУЧНЫЙ ПРОТОКОЛ:

🔬 ФИЗИОЛОГИЯ СУХОЖИЛИЙ:
• Состав: 70% коллаген I типа + 30% вода/протеогликаны
• Кровоснабжение: в 3-5 раз хуже, чем у мышц → медленнее адаптируются
• Мышцы адаптируются за 2-4 недели, сухожилия — за 3-6 месяцев
• Это причина травм при быстрой прогрессии: мышцы готовы, сухожилия — нет

📐 МЕХАНИЗМЫ УКРЕПЛЕНИЯ:
• Тяжёлая нагрузка (>70% 1ПМ) стимулирует синтез коллагена
• Изометрия — ЛУЧШИЙ стимул для сухожилий
• Эксцентрика — ремоделирование при тендинопатии
• Медленный темп — больше времени под нагрузкой = больше стимул
• Heavy Slow Resistance (HSR) — золотой стандарт реабилитации

💪 ПРОГРАММА УКРЕПЛЕНИЯ:

Ахиллово сухожилие:
• Эксцентрические подъёмы на носки (Alfredson protocol): 3×15, 2 раза/день
• Изометрические удержания на носке: 45 сек × 4, тяжёлый вес
• HSR: подъёмы на носки 4×6-8 с весом, темп 3-0-3

Коленное сухожилие (надколенника):
• Приседания с наклоном 25° (decline squat): 3×15 эксцентрик
• Leg extension изометрия: 45 сек × 4 в 70% ROM
• Spanish squat с резинкой: 3×20 сек изометрия

Локтевое (теннисный локоть):
• Tyler Twist с FlexBar: 3×15, 2 раза/день
• Эксцентрические разгибания запястья: 3×15
• Изометрия хвата: 45 сек × 4

Ротаторная манжета:
• Изометрическая наружная ротация: 30-45 сек × 4
• Эксцентрическая ER с гантелей: 3×10 (4 сек вниз)

📊 НУТРИЦИОЛОГИЧЕСКАЯ ПОДДЕРЖКА:
• Коллаген/желатин: 15 г за 60 мин до тренировки
• Витамин C: 50-200 мг одновременно с коллагеном (кофактор синтеза)
• Исследование Shaw 2017: коллаген + витамин C удвоил синтез коллагена
• Медь: 1-2 мг/день — кофактор лизилоксидазы
• Марганец: участвует в формировании соединительной ткани

⚠️ ПРИНЦИПЫ БЕЗОПАСНОСТИ:
• Прогрессия нагрузки: +5-10% в 2 недели (НЕ быстрее!)
• Боль >3/10 по VAS во время упражнения = слишком много
• Боль, усиливающаяся на следующий день = слишком много объёма
• Тепло перед тренировкой — улучшает кровоток к сухожилию
• Лёд после тренировки — спорно, может замедлять ремоделирование
• НПВС — краткосрочно ок, долгосрочно замедляют заживление
`;
}
export function getTrainingAroundPainGuide(message: string): string {
  const keywords = ['тренировк через боль', 'боль тренировк', 'training around', 'болит не могу тренироват', 'травма тренировк', 'обходить боль', 'модификац упражнен', 'замена упражнен боль', 'больно делать'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏥 ТРЕНИРОВКИ ПРИ БОЛИ — КАК ОБХОДИТЬ, НЕ ОСТАНАВЛИВАЯСЬ:

⚠️ ПРАВИЛО #1: РАЗЛИЧАЙ БОЛЬ:
• Мышечная боль (DOMS) — тупая, двусторонняя, через 24-48 ч → БЕЗОПАСНО
• Суставная боль — острая, при определённом движении → МОДИФИКАЦИЯ
• Нервная боль (стреляющая, онемение) → К ВРАЧУ, НЕ ТРЕНИРОВАТЬСЯ
• Боль при нагрузке >4/10 по шкале → СТОП, модификация

📐 МАТРИЦА ЗАМЕН ПО ЗОНАМ БОЛИ:

ПЛЕЧО:
• Жим лёжа → жим с пола / жим нейтральным хватом / жим в машине
• Жим над головой → landmine press / жим в тренажёре
• Разводки → кроссовер (постоянное натяжение)
• Подтягивания → нейтральный хват / тяга верхнего блока
• Брусья → узкий жим лёжа

ПОЯСНИЦА:
• Становая тяга → trap bar / румынская тяга с гантелями
• Приседания → жим ногами / гакк-приседания / болгарский сплит
• Тяга штанги в наклоне → тяга с упором грудью / тяга в TRX
• Гиперэкстензия → bird dog / dead bug (антиэкстензия)

КОЛЕНО:
• Глубокий присед → box squat / частичный присед
• Выпады вперёд → выпады назад (меньше сдвиг колена)
• Разгибание ног → изометрия в безболезненном ROM
• Бег → велосипед / эллипсоид

ЛОКОТЬ:
• Жим узким хватом → отжимания / жим в тренажёре
• Подъём на бицепс → молотки / EZ-гриф (меньше супинации)
• Французский жим → разгибание на блоке с канатом

ЗАПЯСТЬЕ:
• Жим штангой → жим гантелями нейтральным хватом
• Сгибания на бицепс → молотки
• Подтягивания → нейтральный хват / тренажёр

📋 ОБЩИЕ СТРАТЕГИИ:
1. Изменить амплитуду — ограничить ROM до безболезненного
2. Изменить хват — нейтральный обычно самый безопасный
3. Изменить инструмент — гантели > штанги для свободы движения
4. Снизить вес, увеличить повторения — меньше стресс на сустав
5. Использовать тренажёры — стабильная траектория
6. Эксцентрический фокус — терапевтический эффект на сухожилия
7. Тренировать ДРУГУЮ сторону — эффект кросс-обучения (+10-15% силы)

💡 ПРИНЦИПЫ:
• Боль ≤3/10 во время упражнения — допустимо
• Боль не должна усиливаться ПОСЛЕ тренировки
• Боль не должна быть хуже на следующее утро
• Если 3 условия соблюдены — тренировка безопасна
• Полный покой — ХУЖЕ, чем правильная модифицированная нагрузка
`;
}
export function getShoulderPressVariationsGuide(message: string): string {
  const keywords = ['жим на плечи вариант', 'shoulder press вариант', 'жим над головой все', 'ohp вариации', 'армейский жим вариант', 'жим дельты вид', 'какой жим на плечи'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ЖИМЫ НА ПЛЕЧИ — ВСЕ ВАРИАНТЫ:

📐 КЛАССИФИКАЦИЯ:

СТОЯ vs СИДЯ:
Стоя (strict press / OHP):
• Больше кор-стабилизация (+35% активация кора)
• Функциональнее для спорта
• Вес меньше на 10-15% (стабилизация забирает силу)

Сидя (seated press):
• Больший вес (опора для спины)
• Лучшая изоляция дельт
• Безопаснее для поясницы

📊 ВАРИАНТЫ ОТ ЛУЧШИХ К СПЕЦИАЛЬНЫМ:

1. Жим штанги стоя (Strict Press):
   • Золотой стандарт, функциональная сила
   • Передние + средние дельты, трицепс, кор
   • 4×6-8

2. Жим гантелей сидя:
   • Больший ROM, каждая рука независимо
   • Лучше для гипертрофии дельт
   • Нейтральный хват = меньше стресс на плечи
   • 3×8-12

3. Arnold press:
   • Ротация из нейтрального хвата в пронированный
   • Больший ROM и активация всех 3 пучков
   • 3×10-12

4. Push press:
   • Штанга с подхватом ногами (quarter squat → press)
   • Позволяет использовать на 30% больше веса
   • Мощность, сила, локаут

5. Landmine press:
   • Односторонний, под углом
   • Самый безопасный для проблемных плеч
   • 3×10-12 на руку

6. Z-press (сидя на полу):
   • Без опоры спины, ноги вытянуты
   • Максимальная стабилизация кора
   • Выявляет и устраняет дисбалансы

7. Viking press / Chest-supported press:
   • Тренажёр с рычагами
   • Стабильная траектория, безопасно
   • Для добивки после основного жима

💡 ПРОГРАММИРОВАНИЕ ДЛЯ ДЕЛЬТ:
Основной жим (штанга или гантели): 4×6-8 — сила
Второй жим (другой вариант): 3×10-12 — гипертрофия
Изоляция: махи в стороны 3×15-20
Задние дельты: face pulls 3×15-20

⚠️ БЕЗОПАСНОСТЬ:
• НЕ жать из-за головы (shoulder impingement risk)
• Не перегибать поясницу (особенно стоя)
• При боли: landmine press > все остальные
• Хват чуть шире плеч — оптимально
`;
}
export function getDbShoulderPressMasterclass(message: string): string {
  const keywords = ['жим гантелей сидя', 'dumbbell shoulder press', 'жим гантелей плечи', 'db press shoulders', 'жим гантелей стоя'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🏋️ ЖИМ ГАНТЕЛЕЙ НА ПЛЕЧИ — МАСТЕР-КЛАСС:

📊 Преимущества перед штангой:
• Больший диапазон движения (ROM) → больше стимул гипертрофии
• Каждая рука работает независимо → коррекция дисбаланса
• Более естественная траектория для плечевого сустава
• Стабилизаторы работают больше → функциональная сила

📐 Техника (сидя):
1. **Исходное**: наклон скамьи 80-85° (не строго 90° — уменьшает нагрузку на поясницу)
2. **Старт**: гантели на уровне ушей, локти под 45° к корпусу
3. **Жим**: вверх и слегка внутрь (гантели почти касаются вверху)
4. **Опускание**: контролируемо до уровня ушей (не ниже — риск для плеча)
5. **Локти**: не разводить строго в стороны — держи 30-45° перед корпусом

📋 Вариации:
| Вариант | Акцент | Подходы × Повторы |
|---------|--------|-------------------|
| Сидя, пронация | Передний + средний пучок | 4×8-10 |
| Стоя | + кор, стабилизация | 3×8-10 |
| Арнольд-пресс | Полная ротация, все пучки | 3×10-12 |
| Поочерёдный | Антиротация кора | 3×10 на руку |
| Нейтральный хват | Безопаснее для плеч | 3×10-12 |

⚡ Программирование:
- Сила: 4×5-6, отдых 3 мин (тяжёлые гантели)
- Гипертрофия: 3-4×8-12, отдых 90-120 сек
- Выносливость: 3×15-20, отдых 60 сек
- Прогрессия: +1кг на гантель каждые 2-3 недели
`;
}
export function getWristMobilityGuide(message: string): string {
  const keywords = ['запястье', 'wrist', 'кисть болит', 'запястье болит', 'кистевой сустав', 'фронтальный присед запястье'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🤲 МОБИЛЬНОСТЬ И УКРЕПЛЕНИЕ ЗАПЯСТИЙ:

📊 Почему запястья важны для силовиков:
• Фронтальный присед, рывок, взятие — требуют разгибания >70°
• Жим лёжа и стоя — неправильный хват = перегрузка запястий
• Подтягивания — давление на лучезапястный сустав
• Планка/отжимания — компрессия при разгибании

🔍 Тест подвижности:
- Ладони на столе, пальцы к себе → нагрузи вперёд
- Норма: 90° разгибания без боли
- <70° → ограничение, нужна работа

📋 Протокол мобилизации (5 мин ежедневно):

**Разминка (перед каждой тренировкой):**
1. Круговые вращения запястий: 15 в каждую сторону
2. Сгибание/разгибание с мягким давлением: 10 × 3 сек
3. «Молитва» (ладони вместе, локти в стороны): удержание 30 сек
4. Обратная «молитва» (тыльные стороны вместе): 30 сек

**Укрепление (2-3 раза/нед):**
1. Сгибание запястья с гантелью: 3×15 (2-5кг)
2. Разгибание запястья с гантелью: 3×15 (1-3кг)
3. Радиальное/ульнарное отведение: 3×12
4. Кистевой эспандер: 3×20 (40-60кг)
5. Растяжка разгибателей на полу: 3×30 сек

⚠️ Бинты для запястий: используй при жиме >80% 1ПМ, но НЕ на каждом подходе — запястья должны укрепляться.
`;
}
export function getShoulderMobilityAdvancedProtocol(message: string): string {
  const keywords = ['мобильность плеч', 'shoulder mobility', 'плечо не поднимается', 'жёсткие плечи', 'плечевой пояс', 'overhead mobility'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦴 МОБИЛЬНОСТЬ ПЛЕЧЕВОГО ПОЯСА — ПРОДВИНУТЫЙ ПРОТОКОЛ:

📊 Почему плечи «зажаты»:
• Сидячая работа → округление плеч → укорочение грудных и передней дельты
• Много жимов, мало тяг → дисбаланс мышц
• Недостаточная разминка → спайки и ограничения капсулы

🔍 Тесты подвижности:
1. **Wall angel**: спина к стене, руки вверх — локти и запястья касаются стены?
2. **Overhead reach**: руки над головой — полное сгибание 180° без прогиба поясницы?
3. **Behind-back reach**: одна рука сверху, другая снизу — пальцы соединяются?

📋 Ежедневный протокол (15 мин):

**Миофасциальный релиз (3 мин):**
- Лакросс-мяч: большая грудная (у стены) — 60 сек/сторона
- Лакросс-мяч: задняя дельта/инфраспинатус — 60 сек/сторона

**Растяжка (5 мин):**
- Doorway stretch (растяжка в дверном проёме): 3×30 сек
- Sleeper stretch (лёжа на боку, внутренняя ротация): 3×30 сек
- Cross-body stretch (рука через грудь): 3×30 сек
- Overhead lat stretch (висы с наклоном): 3×30 сек

**Активация (5 мин):**
- Band pull-apart: 3×15
- Face pull с внешней ротацией: 3×12
- YTWL на наклонной скамье: 2×8 каждая позиция
- Cuban rotation: 2×10

**CARs (контролируемые вращения, 2 мин):**
- Полные круги плечевого сустава: 5 по часовой, 5 против
- Максимальная амплитуда при максимальном напряжении

💡 Делай ПЕРЕД каждой тренировкой верха и каждое утро. Результат через 4-6 недель.
`;
}
export function getAnkleRehabilitationProtocol(message: string): string {
  const keywords = ['голеностоп реабилитация', 'ankle rehab', 'подвернул ногу', 'растяжение голеностопа', 'нестабильность голеностопа'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦶 РЕАБИЛИТАЦИЯ ГОЛЕНОСТОПА — ПРОТОКОЛ:

⚠️ При острой травме — обратись к врачу! Этот гайд для восстановления.

📊 Фазы восстановления после растяжения:

**Фаза 1: Острая (0-72 часа) — PEACE & LOVE:**
- P — Protect (разгрузить)
- E — Elevate (поднять выше сердца)
- A — Avoid anti-inflammatories (НПВС замедляют заживление!)
- C — Compress (эластичный бинт)
- E — Educate (понять степень травмы)

**Фаза 2: Подострая (3-14 дней):**
- Лёгкие движения стопой (круги, сгибание-разгибание)
- Изометрические упражнения (давление стопой в стену без движения)
- Частичная нагрузка при ходьбе (если нет острой боли)

**Фаза 3: Укрепление (2-6 недель):**
1. Подъём на носки: 3×15 (сначала двумя ногами → потом одной)
2. Ходьба на носках/пятках: 3×20м
3. Резинка (эверсия/инверсия): 3×15
4. Приседания на одной ноге (частичные): 3×10
5. Баланс на одной ноге: 3×30 сек (глаза открыты → закрыты)

**Фаза 4: Возврат к спорту (6-12 недель):**
1. Прыжки на месте → прыжки в стороны
2. Бег по прямой → бег с поворотами
3. Тренировка на нестабильной поверхности (BOSU, подушка)
4. Плиометрика с приземлением

📋 Профилактика повторных травм:
- Проприоцептивные упражнения 3 раза/нед (баланс на одной ноге)
- Укрепление перонеальных мышц (эверсия с резинкой)
- Правильная обувь для тренировок (не бегать в кедах)
`;
}
export function getPostureTrainingGuide(message: string): string {
  const keywords = ['осанка тренировка', 'posture training', 'сутулость исправить', 'кифоз упражнения', 'лордоз упражнения', 'верхний перекрёстный'];
  const lower = message.toLowerCase();
  if (!keywords.some(k => lower.includes(k))) return '';
  return `
🧍 ТРЕНИРОВКИ ДЛЯ ИСПРАВЛЕНИЯ ОСАНКИ — ПОЛНЫЙ ГАЙД:

80% посетителей зала имеют нарушения осанки. Тренировки могут как исправить, так и усугубить их.

🔬 Основные нарушения осанки:

**1. Верхний перекрёстный синдром (Upper Cross):**
- Укорочены: грудные, верхняя трапеция, леватор лопатки
- Ослаблены: глубокие сгибатели шеи, нижняя трапеция, ромбовидные
- Вид: сутулость, голова вперёд, округлые плечи
- Причина: сидячая работа, телефон, чрезмерный жим лёжа

**2. Нижний перекрёстный синдром (Lower Cross):**
- Укорочены: поясничные разгибатели, подвздошно-поясничная мышца
- Ослаблены: пресс, ягодичные
- Вид: чрезмерный прогиб в пояснице (гиперлордоз), живот вперёд
- Причина: длительное сидение, слабый кор

**3. Кифоз грудного отдела:**
- Усиленный изгиб верхней части спины
- Часто сочетается с верхним перекрёстным синдромом

📋 Программа коррекции верхнего перекрёстного (3-4 раза/нед):

**Растяжка укороченных мышц (ежедневно):**
- Растяжка грудных в дверном проёме: 3×30 сек
- Растяжка верхней трапеции: 3×20 сек (каждая сторона)
- Растяжка леватора лопатки: 2×20 сек

**Укрепление ослабленных мышц:**
- Face pull: 3×15-20
- Y-T-W подъёмы лёжа на животе: 2×10 каждого
- Ретракция лопаток у стены: 3×15
- Подбородок к себе (chin tuck): 3×10 (удержание 5 сек)
- Тяга нижнего блока к животу: 3×12

📋 Программа коррекции нижнего перекрёстного:

**Растяжка:**
- Выпад с растяжкой подвздошно-поясничной: 3×30 сек
- Растяжка разгибателей поясницы (поза ребёнка): 3×30 сек

**Укрепление:**
- Dead bug: 3×8 (каждая сторона)
- Глют-бридж: 3×15
- Планка: 3×30-45 сек
- Bird-dog: 3×10 (каждая сторона)
- Обратная гиперэкстензия: 3×12

📊 Правила тренировки при нарушенной осанке:
- Соотношение тяг к жимам — **2:1** (пока осанка не исправится)
- Face pull / band pull-apart — КАЖДУЮ тренировку
- Приоритет: тяга к поясу, тяга верхнего блока, face pull, Y-raises
- Ограничь: жим лёжа, жим стоя (пока не исправишь верхний крест)
- Мёртвый вис на турнике: 3×30 сек/день (декомпрессия позвоночника)

⏰ Сроки:
- Первые улучшения: 2-4 недели
- Значительное исправление: 3-6 месяцев
- Полная коррекция: 6-12 месяцев (при постоянной работе)
`;
}
export function getCalfMobilityGuide(message: string): string {
  const keywords = ['мобильность голеностопа', 'calf mobility', 'подвижность голеностопа', 'мобильность икр', 'dorsiflexion', 'дорсифлексия', 'голеностоп подвижность', 'стопа мобильность'];
  if (!keywords.some(k => message.toLowerCase().includes(k))) return '';
  return `
🦶 МОБИЛЬНОСТЬ ГОЛЕНОСТОПА И ИКР — ФУНДАМЕНТ ДВИЖЕНИЯ:

**Почему это критично:**
- Ограниченная дорсифлексия → колени не идут за носки → компенсация в пояснице
- Нужно для: глубокого приседа, выпадов, бега, прыжков
- Норма дорсифлексии: 35-45° (или колено за носок на 10+ см)
- У большинства людей: 15-25° (недостаточно!)

**Тест дорсифлексии (wall test):**
1. Встань лицом к стене, стопа на расстоянии кулака
2. Согни колено к стене, пятка на полу
3. Если колено касается стены — хорошо (≈35°)
4. Если не касается — ограничение дорсифлексии
5. Отодвигай стопу: каждый см = ~2° дорсифлексии

**Причины ограничения:**
1. **Жёсткость икроножных мышц** (gastrocnemius + soleus)
2. **Капсульное ограничение** голеностопного сустава
3. **Фасциальные адгезии** (спайки)
4. **Костная блокада** (анатомическая — редко)

**Упражнения для улучшения:**

**1. Растяжка икроножных (2×30 сек каждая нога):**
- У стены: прямая нога назад, пятка на полу
- Вариант с согнутым коленом (для камбаловидной/soleus)
- Ежедневно!

**2. Мобилизация голеностопа с лентой (бандинг):**
- Резиновая лента на голеностоп, тяга назад
- Выпад вперёд (колено за носок)
- 2×15 каждая нога
- Лента оттягивает таранную кость назад → ↑ суставное пространство

**3. Эксцентрическая растяжка на ступеньке:**
- Встань на край ступеньки пальцами
- Опусти пятки ниже уровня ступеньки (3 сек)
- Поднимись на носки
- 3×15

**4. Foam rolling икр:**
- Сидя на полу, ролл под икрой
- Медленно прокатывай от ахилла до колена
- 1-2 мин каждая нога
- Задерживайся на болезненных точках 20-30 сек

**5. Goblet squat hold:**
- Присед с гантелей у груди
- Удержание в нижней точке 30-60 сек
- Локти расталкивают колени
- Работает и на бёдра, и на голеностоп

**Протокол на 4 недели:**
- Ежедневно: растяжка икр (2×30 сек) + wall test
- 3×/неделю: бандинг + эксцентрика + foam rolling
- Прогресс: ↑ дистанция в wall test каждую неделю
- Ожидаемый результат: +3-5 см за 4 недели

**Для приседа:**
- Если не хватает дорсифлексии → подставка под пятки (2-3 см)
- Штангетки (weightlifting shoes) = +15-20° дорсифлексии
- Широкая стойка = ↓ требования к дорсифлексии
- Работай над мобильностью параллельно с использованием штангеток
`;
}
export function getTendinopathyRehab(message: string): string {
  const triggers = ['тендинопат', 'тендинит', 'сухожили', 'tendin', 'эпикондилит', 'ахилл болит', 'локоть теннис'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🔧 РЕАБИЛИТАЦИЯ ТЕНДИНОПАТИИ:

**Стадии тендинопатии (модель Cook & Purdam):**
1. Реактивная (острая): отёк, боль при нагрузке → ↓ нагрузку, НЕ растяжку!
2. Дегенеративная (хроническая): структурные изменения → эксцентрика + изометрия
3. Реактивная на дегенеративном фоне: обострение → как стадия 1

**Протокол реабилитации:**

Фаза 1 — Обезболивание (1-2 нед):
- Изометрические удержания: 5×45 сек, 70% от макс усилия
- Эффект: ↓ боль на 30-50% немедленно (ингибиция болевых путей)
- Частота: 3-4 раза/день
- Пример (надколенник): удержание приседа на 60° — 5×45 сек

Фаза 2 — Эксцентрическая нагрузка (2-6 нед):
- Медленная эксцентрика: 3-4 сек опускание
- 3×15 повторений, 2 раза/день
- Допустима боль до 4/10 по VAS
- Пример (ахилл): подъём на носки двумя ногами → опускание одной — 3×15

Фаза 3 — Тяжёлая медленная нагрузка (6-12 нед):
- Heavy Slow Resistance: 4×6-8 (6 сек концентрика + 6 сек эксцентрика)
- Прогрессия веса каждые 1-2 нед
- 3 раза/нед

Фаза 4 — Возврат к спорту (12+ нед):
- Плиометрика + специфические движения
- Постепенное ↑ объёма и интенсивности

**Типичные ошибки:**
❌ Полный покой (ослабляет сухожилие ещё больше)
❌ Растяжка реактивного сухожилия (↑ компрессию)
❌ Кортизоновые уколы (краткий эффект, ↓ структуру)
❌ Слишком быстрое возвращение к нагрузкам
`;
}
export function getScoliosisTrainingGuide(message: string): string {
  const triggers = ['сколиоз', 'искривлен', 'scoliosis', 'позвоночник кривой', 'асимметри спин'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🔄 ТРЕНИРОВКИ ПРИ СКОЛИОЗЕ:

**Степени сколиоза и ограничения:**
- I степень (1-10°): все упражнения допустимы с коррекцией техники
- II степень (11-25°): исключить осевые нагрузки >50% 1ПМ
- III степень (26-50°): только ЛФК + изоляция + тренажёры
- IV степень (>50°): строго под руководством реабилитолога

**Принципы тренировок при сколиозе:**
1. Унилатеральные упражнения — компенсация асимметрии
2. Вогнутая сторона: больше объём, ↑ силу (она слабее)
3. Выпуклая сторона: растяжка, ↓ гипертонус
4. Кор — приоритет №1 (стабилизация позвоночника)
5. Избегать компрессионных нагрузок в начале

**Рекомендованные упражнения:**
✅ Планка (боковая — слабая сторона x2 объём)
✅ Bird-dog (контралатеральная стабилизация)
✅ Тяга одной рукой в наклоне (слабая сторона +1-2 подхода)
✅ Жим гантели одной рукой лёжа
✅ Ягодичный мост (односторонний)
✅ Плавание на спине
✅ Тренажёры с фиксацией спины

**ЗАПРЕЩЕНО при сколиозе II+:**
❌ Приседания со штангой на спине (осевая нагрузка)
❌ Становая тяга с большим весом
❌ Армейский жим стоя
❌ Рывок/толчок
❌ Прыжки с отягощением

**Метод Шрот (Schroth):**
- Специализированная ЛФК для сколиоза
- Ротационное дыхание: вдох в вогнутую сторону
- 3D коррекция: удлинение, де-ротация, стабилизация
- 15-30 мин/день → ↓ угол Кобба на 3-7° за 6 мес
`;
}
export function getPCOSTrainingGuide(message: string): string {
  const triggers = ['спкя', 'поликистоз', 'pcos', 'яичник', 'гиперандроген'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🌸 ТРЕНИРОВКИ ПРИ СПКЯ (СИНДРОМ ПОЛИКИСТОЗНЫХ ЯИЧНИКОВ):

**Влияние тренировок при СПКЯ:**
- ↑ Чувствительность к инсулину на 30-50% (ключевой фактор!)
- ↓ Тестостерон и андрогены
- ↓ Воспаление (↓ CRP, IL-6)
- ↑ Овуляция у 50% женщин после 3 мес регулярных тренировок
- ↓ Абдоминальный жир (ключевой при СПКЯ)

**Оптимальная программа:**

Силовые (3 раза/нед):
- Базовые компаундные упражнения: приседания, жим, тяга
- 3×10-12, 65-75% 1ПМ
- Акцент на крупные мышечные группы (↑ инсулиновая чувствительность)
- Отдых 60-90 сек

Кардио (2-3 раза/нед):
- LISS: 30-45 мин при 60-70% ЧСС макс
- HIIT (1-2 раза/нед): 20 мин — мощнее влияет на инсулин
- Утренние тренировки предпочтительнее (↓ кортизол)

**Питание при СПКЯ + тренировки:**
- ↓ Гликемический индекс (↓ инсулиновые спайки)
- Белок: 1.6-2.0 г/кг (↑ сытость, ↓ инсулин)
- Омега-3: 2-4 г/день (↓ воспаление)
- Витамин D: 2000-4000 МЕ (дефицит у 67-85% с СПКЯ)
- Инозитол: 2-4 г/день мио-инозитол (↑ овуляция)
- Избегать: рафинированные углеводы, сахар, молочные продукты (↑ андрогены)

**Чего избегать:**
❌ Чрезмерное кардио (>60 мин/день) — ↑ кортизол, ↓ метаболизм
❌ Экстремальные дефициты калорий
❌ Тренировки при сильном стрессе (кортизол ↑ андрогены)
`;
}
export function getStrokeRehabExercise(message: string): string {
  const triggers = ['инсульт', 'stroke', 'парез', 'гемиплег', 'после инсульт', 'мозговой удар'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🧠 ТРЕНИРОВКИ ПОСЛЕ ИНСУЛЬТА:

**Важно:** начинать только после разрешения врача!

**Цели реабилитации:**
- Восстановление моторных функций (нейропластичность)
- ↑ Силы и выносливости паретичной стороны
- ↓ Спастичности
- ↑ Баланс и ↓ падения
- ↓ Риска повторного инсульта

**Программа по фазам:**

Ранняя (2-4 нед после инсульта):
- Пассивные движения паретичной конечности
- Повороты в кровати
- Присаживание с помощью
- Дыхательные упражнения

Подострая (1-6 мес):
- Силовые: паретичная сторона — лёгкие тренажёры, 1-2×10
- Ходьба с поддержкой: 10-20 мин
- Равновесие сидя → стоя
- Constraint-induced therapy (ограничение здоровой руки)

Хроническая (>6 мес):
- Силовые: 2-3 раза/нед, 2×10-15, прогрессия
- Кардио: 20-30 мин, 3-5 раз/нед
- Велоэргометр, ходьба, аквааэробика
- Баланс: тай-чи, упражнения на нестабильных поверхностях

**Ключевые принципы:**
- Повторение: 400-600 повторений/день для нейропластичности
- Интенсивность: по возможности увеличивать
- Специфичность: тренировать конкретные задачи (ходьба, хват)
- Контроль АД: <180/110 во время тренировки
`;
}
export function getHerniatedDiscExercise(message: string): string {
  const triggers = ['грыж', 'herniated', 'протрузи', 'межпозвонков', 'диск выпал', 'грыжа диска'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
🔴 ТРЕНИРОВКИ ПРИ ГРЫЖЕ/ПРОТРУЗИИ МЕЖПОЗВОНКОВОГО ДИСКА:

**Понимание проблемы:**
- Грыжа = выпячивание ядра диска за пределы фиброзного кольца
- Протрузия = начальная стадия, кольцо не разорвано
- 80% грыж = поясничный отдел (L4-L5, L5-S1)
- Тренировки помогают в 70-80% случаев (vs хирургия)

**Метод МакКензи (централизация):**
- Если боль ↓ при разгибании → делать разгибание
- Если боль ↓ при сгибании → делать сгибание
- Цель: «вернуть» боль из ноги в поясницу (централизация)

**Безопасные упражнения:**
✅ Птица-собака (bird-dog): 3×10 на сторону
✅ Планка (боковая и прямая): 3×20-30 сек
✅ Мостик ягодичный: 3×15
✅ Ходьба: 30 мин/день
✅ Плавание на спине
✅ Тренажёры с поддержкой спины
✅ Жим ногами (нейтральная поясница)

**ЗАПРЕЩЕНО (при остром периоде):**
❌ Приседания со штангой
❌ Становая тяга
❌ Скручивания/кранчи
❌ Наклоны вперёд с весом
❌ Жим над головой стоя
❌ Гиперэкстензия с весом
❌ Бег (ударная нагрузка на диски)

**Возвращение к силовым (после стихания симптомов):**
Фаза 1 (2-4 нед): стабилизация кора (планки, bird-dog)
Фаза 2 (4-8 нед): тренажёры, лёгкие гантели
Фаза 3 (8-12 нед): базовые упражнения с лёгким весом
Фаза 4 (12+ нед): постепенное ↑ нагрузки, идеальная техника
`;
}
export function getFrozenShoulderGuide(message: string): string {
  const triggers = ['замороженн плеч', 'frozen shoulder', 'адгезивн капсул', 'плечо не подним', 'тугоподвижн плеч'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
❄️ ТРЕНИРОВКИ ПРИ «ЗАМОРОЖЕННОМ ПЛЕЧЕ» (АДГЕЗИВНЫЙ КАПСУЛИТ):

**Стадии заболевания:**
1. Замораживание (2-9 мес): ↑ боль, начало ↓ подвижности
2. Замороженное (4-12 мес): ↓ боль, максимальное ↓ подвижности
3. Размораживание (5-24 мес): постепенное ↑ подвижности

**Упражнения по стадиям:**

Стадия 1 — Замораживание:
- Маятник Кодмана: наклониться, свесить руку, покачивать 30 круговых × 3
- Ползание пальцами по стене: 3×10 (фронтально + боково)
- Пассивные движения: здоровой рукой помогать больной
- Тепло 15 мин перед упражнениями

Стадия 2 — Замороженное:
- Растяжка: полотенце за спиной (обе руки) — 30 сек × 5
- Растяжка в дверном проёме: 30 сек × 3
- Внутренняя ротация: рука за спиной, тянуть полотенцем
- Лёгкие силовые: резинка, 0.5-1 кг гантели

Стадия 3 — Размораживание:
- Прогрессивные силовые: ↑ вес каждые 1-2 нед
- Жим гантели лёжа (нейтральный хват)
- Тяга к поясу в тренажёре
- Подъёмы гантели перед собой/в стороны

**Тренировки в зале:**
✅ Все упражнения для ног (без ограничений)
✅ Здоровое плечо — тренировать как обычно
✅ Больное плечо: только в безболезненной амплитуде
❌ Жим над головой (до восстановления ROM)
❌ Подтягивания
❌ Разведения в стороны с весом
`;
}
export function getSciaticaExerciseGuide(message: string): string {
  const triggers = ['ишиас', 'sciatica', 'седалищн нерв', 'боль в ноге от спины', 'прострел в ногу'];
  if (!triggers.some(t => message.toLowerCase().includes(t))) return '';
  return `
⚡ ТРЕНИРОВКИ ПРИ ИШИАСЕ (ЗАЩЕМЛЕНИЕ СЕДАЛИЩНОГО НЕРВА):

**Причины ишиаса:**
- Грыжа диска (90% случаев)
- Синдром грушевидной мышцы
- Стеноз позвоночного канала
- Спондилолистез

**Упражнения для облегчения:**

При грыже (наиболее частая причина):
1. Разгибание лёжа (МакКензи): лёжа на животе, подняться на руках — 10× каждые 2ч
2. Птица-собака: 3×10 на сторону
3. Кошка-корова: 3×10
4. Мостик ягодичный: 3×15

При синдроме грушевидной мышцы:
1. Растяжка грушевидной: лёжа, нога крест-накрест → тянуть к себе — 30 сек × 3
2. Pigeon pose (поза голубя): 30 сек × 3
3. Теннисный мяч под ягодицу: 1-2 мин прокатывания
4. Clamshell: 3×15

**Тренировки в зале:**
✅ Упражнения для верхней части тела — без ограничений
✅ Жим ногами (нейтральная поясница)
✅ Разгибание/сгибание ног в тренажёре
✅ Ходьба (часто ↓ симптомы)
✅ Плавание на спине

❌ Приседания (осевая нагрузка)
❌ Становая тяга
❌ Наклоны вперёд с весом
❌ Скручивания
❌ Длительное сидение между подходами

**Нервная мобилизация (nerve flossing):**
- Сидя: выпрямить ногу → согнуть стопу на себя → опустить → повторить — 10×
- Выполнять медленно, без боли (лёгкое натяжение допустимо)
- 2-3 раза/день
`;
}
export function getChronicPainExerciseGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['хронич бол', 'chronic pain', 'фибромиалг бол', 'центральн сенситизац', 'нейропатическ бол'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
💊 ТРЕНИРОВКИ ПРИ ХРОНИЧЕСКОЙ БОЛИ:

Парадокс боли:
- Движение кажется опасным, но БЕЗДЕЙСТВИЕ ухудшает боль
- Центральная сенситизация: мозг «привык» к боли → нужен новый сигнал
- Тренировки активируют эндогенные опиоиды (встроенное обезболивание)
- Регулярные занятия снижают интенсивность боли на 20-40%

Принцип «pacing» (темпирование):
- Не «всё или ничего» (хороший день = перетренировка → 3 дня в постели)
- Стабильная нагрузка: одинаково в хороший и плохой день
- Базовый уровень: 50% от того что можешь в лучший день
- Повышение: 10% каждые 1-2 недели

Программа:
- Ходьба: начни с 5-10 мин, +2 мин каждую неделю
- Аквааэробика: тепло + невесомость + движение
- Силовые: лёгкие, тренажёры, 2-3 раза/нед
- Растяжка: ежедневно, мягко, без боли

Когнитивные стратегии:
- «Боль ≠ повреждение» — боль может быть при здоровых тканях
- Фокус на функции: «сегодня я поднял 10 кг» > «у меня болит»
- Дневник боли: отслеживание паттернов (что ухудшает/улучшает)
- Страх движения (кинезиофобия) — главный враг: постепенная экспозиция

НЕ помогает:
- Полный покой (ухудшает боль через 2-3 дня)
- Агрессивные тренировки «через боль»
- Резкие изменения нагрузки
`;
}
export function getDeskJobMobilityGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['мобильност офис', 'разминка на работ', 'затек', 'онемен от сидени', 'упражнени на работ'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🪑 МОБИЛЬНОСТЬ НА РАБОЧЕМ МЕСТЕ:

Каждый час (2-3 мин):
1. Встать, потянуться руками вверх (10 сек)
2. Наклон вперёд (достать пальцами пол) 10 сек
3. Вращение плечами назад × 10
4. Повороты головы влево-вправо × 5
5. 10 приседаний (или подъёмов на носки)

Каждые 2 часа (5 мин):
- Растяжка грудных в дверном проёме: 30 сек × 2
- Растяжка сгибателей бедра: 30 сек на ногу
- Cat-cow (кошка-корова) стоя: 10 повторений
- Chin tucks (подбородок к шее): 10 × 5 сек

Обеденная мини-тренировка (15 мин):
- Ходьба по лестнице 5 мин
- Стенка (wall sit) 3 × 30 сек
- Отжимания от стола 3 × 10
- Обратные выпады 3 × 8 на ногу
- Планка 3 × 20 сек

Эргономика:
- Монитор на уровне глаз
- Локти 90°, ступни на полу
- Каждые 20 мин: 20 сек смотреть на объект 20 м (правило 20-20-20)
- Стоячий стол: чередовать 30 мин сидя / 15 мин стоя
`;
}
export function getTennisTrainingGuide(message: string): string {
  const t = message.toLowerCase();
  const triggers = ['теннис', 'tennis', 'ракетк', 'корт', 'бадминтон'];
  if (!triggers.some(k => t.includes(k))) return '';
  return `
🎾 СИЛОВАЯ ПОДГОТОВКА ДЛЯ ТЕННИСА:

Физические требования:
- Латеральное движение (80% перемещений по корту)
- Вращательная сила (удар справа, слева, подача)
- Выносливость (матч 2-3 часа)
- Плечевой сустав (подача: 200+ повторений за матч)

Программа (2-3 раза/нед):
Ноги:
- Боковые выпады: 3 × 8 на ногу (латеральное движение)
- Приседания на одной ноге: 3 × 6 (стабильность)
- Латеральные прыжки: 3 × 8 (first step speed)
- Спринты 5-10 м с разворотом: 6-8 повторов

Вращение (ключевое):
- Cable rotation: 3 × 10 на сторону
- Медбол бросок вбок: 3 × 8 на сторону
- Landmine rotation: 3 × 8
- Pallof press: 3 × 10 (антиротация)

Плечи (профилактика):
- Внешняя ротация с резиной: 3 × 15
- Face pulls: 3 × 15
- Scapular push-ups: 3 × 12
- Нижняя трапеция: Y-raises 3 × 12

Компенсация асимметрии:
- «Теннисный локоть» → укрепление разгибателей предплечья
- Рабочая сторона сильнее → дополнительный объём на нерабочую
- Мобильность грудного отдела: foam roller ежедневно
`;
}
export function getGymnasticsTrainingGuide(message: string): string {
  const triggers = ['гимнастик', 'gymnastics', 'акробатик', 'сальто', 'стойка на руках', 'handstand', 'кольца гимнаст', 'перекладин'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🤸 ГИМНАСТИКА И АКРОБАТИКА — РУКОВОДСТВО:

**Базовые элементы (фундамент):**
- Стойка на руках: прогрессия от стены к свободной
- Мостик: из положения лёжа → из стойки → перекид
- Колесо: боковое, одноручное, рондат
- Кувырки: вперёд, назад, через плечо
- Шпагаты: продольный и поперечный

**Силовая подготовка гимнаста:**
- Подтягивания: строгие, с отягощением, L-sit подтягивания
- Отжимания на кольцах: 3 × 8-12
- Передний вис (front lever): прогрессия tuck → advanced → full
- Задний вис (back lever): аналогичная прогрессия
- Планш: frog stand → tuck planche → straddle → full
- V-sit / L-sit: удержание на параллетах
- Жим в стойку: pike press → straddle press

**Гибкость (критична для гимнастики):**
- Ежедневная растяжка 30-60 мин
- PNF-стретчинг для ускорения прогресса
- Активная гибкость: удержание ноги в высоких позициях
- Мостик: работа над подвижностью плеч и грудного отдела

**Прогрессия акробатических элементов:**
1. Кувырок вперёд → стойка на руках → колесо
2. Рондат → фляк (назад) → сальто назад
3. Переднее сальто → винт → двойное
- Используй гимнастическую яму и маты
- Обязательна страховка при освоении новых элементов

**Профилактика травм:**
- Укрепление запястий: вращения, сгибания с отягощением
- Лучезапястный сустав: растяжка перед каждой тренировкой
- Голеностоп: работа на баланс-борде
- Плечи: внешняя ротация, face pulls
`;
}
export function getTableTennisTrainingGuide(message: string): string {
  const triggers = ['настольн теннис', 'table tennis', 'пинг-понг', 'ping pong', 'ракетк теннис настольн'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🏓 НАСТОЛЬНЫЙ ТЕННИС — ФИЗИЧЕСКАЯ ПОДГОТОВКА:

**Физические требования:**
- Молниеносная реакция (мяч летит до 100+ км/ч)
- Координация глаз-рука
- Быстрые перемещения у стола
- Вращательная сила корпуса
- Выносливость запястья

**Силовая программа:**
- Приседания: 3 × 10 (опора для перемещений)
- Боковые выпады: 3 × 8 на сторону
- Вращения корпуса с медболом: 3 × 12
- Тяга нижнего блока одной рукой: 3 × 10
- Сгибание запястья с гантелью: 3 × 20
- Планка с ротацией: 3 × 10 на сторону
- Прыжки в стороны: 3 × 10

**Тренировка реакции и координации:**
- Мяч у стены (bounce ball): ловля и бросок
- Жонглирование 2-3 мячами
- Координационная лестница: боковые шаги
- Реакционные светодиодные тренажёры (если доступны)
- Многопуншевая тренировка на столе (робот-подающий)

**Скорость перемещений:**
- Челнок 3×3м: имитация перемещений у стола
- Прыжки из стороны в сторону через линию
- Теневая работа ног: имитация приёма подач

**Компенсация асимметрии:**
- Работа на неигровую руку: 50% от объёма
- Растяжка плеч и предплечий после тренировки
- Укрепление кора для баланса
- Упражнения на осанку: антагонисты грудных
`;
}
export function getShoulderAnatomyDeepGuide(message: string): string {
  const triggers = ['анатомия плеч', 'дельтовидн анатомия', 'строение дельт', 'пучки дельт', 'мышцы плеча подробн'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 АНАТОМИЯ ДЕЛЬТОВИДНЫХ МЫШЦ — ГЛУБОКИЙ РАЗБОР:

**Передний пучок (Anterior Deltoid):**
- Начало: латеральная треть ключицы
- Функция: сгибание плеча, горизонтальное приведение
- Упражнения: жим стоя, фронтальные подъёмы
- Часто ПЕРЕТРЕНИРОВАН (работает во всех жимах)

**Средний (латеральный) пучок (Lateral Deltoid):**
- Начало: акромион лопатки
- Функция: отведение плеча
- Упражнения: махи в стороны, жим из-за головы
- Ключ к «ширине» плеч
- Оптимальный угол: руки слегка впереди тела

**Задний пучок (Posterior Deltoid):**
- Начало: ость лопатки
- Функция: горизонтальное отведение, внешняя ротация
- Упражнения: обратные разведения, face pulls, тяга к лицу
- Часто НЕДОТРЕНИРОВАН → дисбаланс, травмы

**Ротаторная манжета:**
- 4 мышцы: надостная, подостная, малая круглая, подлопаточная
- Стабилизируют плечевой сустав
- Травмы = #1 проблема плеч у тренирующихся
- Профилактика: внешняя ротация 3 × 15, face pulls

**Баланс пучков (идеальное соотношение):**
- Передний : Средний : Задний = 1 : 2 : 2
- Передний получает достаточно от жимов
- Средний и задний требуют изолированной работы
- Минимум 2 упражнения на задний пучок в неделю
`;
}
export function getNeckAnatomyGuide(message: string): string {
  const triggers = ['анатомия шеи', 'мышцы шеи подробн', 'тренировка шеи анатомия', 'строение шеи мышц', 'грудино-ключичн'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦒 АНАТОМИЯ МЫШЦ ШЕИ — ГЛУБОКИЙ РАЗБОР:

**Грудино-ключично-сосцевидная (SCM):**
- Передняя часть шеи, видимая мышца
- Функция: наклон головы вперёд, поворот в сторону
- Упражнение: сгибание шеи с диском на лбу

**Трапециевидная (верхняя часть):**
- Задняя часть шеи
- Функция: подъём плеч, наклон головы назад
- Упражнения: шраги, разгибание шеи

**Лестничные мышцы (Scalenes):**
- Боковая часть шеи
- Функция: боковой наклон, вспомогательное дыхание
- Часто напряжены → головные боли

**Глубокие сгибатели шеи:**
- Стабилизируют шейный отдел
- Часто слабые → «компьютерная шея»
- Тренировка: chin tuck (ретракция подбородка)

**Программа тренировки шеи:**
- Сгибание (вперёд): 3 × 15 с диском на лбу
- Разгибание (назад): 3 × 15 с диском на затылке
- Боковое сгибание: 3 × 12 на каждую сторону
- Шраги: 3 × 12 (верхние трапеции)
- Chin tuck: 3 × 15 (глубокие стабилизаторы)

**Безопасность:**
- Никогда не делай резких движений
- Начинай без веса, прогрессируй медленно
- Полный контроль на протяжении всего движения
- Не тренируй шею при болях или травмах
- Прогрессия: собственный вес → лёгкий диск → neck harness
`;
}
export function getJointHealthLongevity(message: string): string {
  const triggers = ['здоровье суставов долгосрочн', 'суставы долголетие', 'сохранить суставы', 'профилактика артроз', 'хрящ восстановлен', 'суставы в пожилом возраст'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦴 ЗДОРОВЬЕ СУСТАВОВ И ДОЛГОЛЕТИЕ В ТРЕНИРОВКАХ:

**Анатомия сустава (базовое понимание):**
- Хрящ: покрывает суставные поверхности, НЕ имеет кровоснабжения
- Питание хряща: через синовиальную жидкость (при движении)
- Мениски (колено): амортизаторы, ограниченная регенерация
- Связки: стабилизируют, заживают медленно (6-12 мес)
- Сухожилия: соединяют мышцы с костями, адаптируются медленнее мышц

**Принципы тренировок для здоровья суставов:**
1. Прогрессия нагрузки медленнее мышечной адаптации
   - Мышцы: адаптация 1-2 нед → сухожилия/связки: 4-8 нед
   - Не увеличивай нагрузку быстрее, чем ткани успевают адаптироваться
2. Полная амплитуда движения: питает хрящ через синовиальную жидкость
3. Контролируемый темп: без рывков и отбивов
4. Разнообразие углов: избегай однотипной нагрузки на один сустав

**Нутрицевтики для суставов (доказательная база):**
- Коллаген (тип II): 10-15 г/день + витамин C (помогает синтезу)
- Глюкозамин + хондроитин: 1500 мг + 1200 мг (спорная, но безопасная добавка)
- Омега-3: 2-3 г/день (противовоспалительное)
- Куркумин + пиперин: 500-1000 мг (противовоспалительное)
- MSM: 1-3 г/день (сера для соединительной ткани)

**Упражнения для долголетия суставов:**
- Ежедневная подвижность: CARs (Controlled Articular Rotations)
- Разминка суставов перед каждой тренировкой
- Фасциальная работа: foam rolling, мячи
- Низконагрузочная работа: лёгкие веса, высокие повторения (разгрузочные дни)

**Красные флаги (немедленно к врачу):**
- Острая боль при движении
- Отёк сустава без травмы
- Блокировка (сустав «заклинило»)
- Нестабильность (сустав «подкашивается»)
- Боль в покое или ночью
`;
}
export function getFlexibilityMobilityDeepScience(message: string): string {
  const triggers = ['гибкость vs мобильность', 'разница гибкост мобильност', 'пассивн активн гибкость', 'мобильность суставов наука', 'растяжка наука подробн', 'гибкость для силы'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[НАУКА ГИБКОСТИ VS МОБИЛЬНОСТИ — ГЛУБОКИЙ РАЗБОР]
Гибкость — пассивный диапазон движения (ROM) в суставе. Мобильность — активный контроль над этим ROM + стабильность.

НЕЙРОФИЗИОЛОГИЯ РАСТЯЖКИ:
- Мышечное веретено: сенсор длины → рефлекс растяжения (защитное сокращение)
- Сухожильный орган Гольджи: при длительном растяжении >6с → аутогенное торможение → расслабление
- Tolerance theory: регулярная растяжка ↑ толерантность к растяжению, а не длину мышцы
- Titin (титин): гигантский белок саркомера, определяет пассивную жёсткость мышцы
- Фасция: коллагеновая сеть, адаптируется за 6-24 месяца тренировок

ТИПЫ ГИБКОСТИ:
1. Пассивная статическая — удержание позиции внешней силой (гравитация, партнёр) 30-60с
2. Активная статическая — удержание позиции мышцами-агонистами (удержание ноги в воздухе)
3. Динамическая — контролируемое движение через полный ROM (махи ногами)
4. Баллистическая — пружинистые движения в конце ROM (⚠️ высокий риск травмы)

МОБИЛЬНОСТЬ — КОМПОНЕНТЫ:
- Суставная капсула: может ограничивать ROM (capsular pattern)
- Мышечная длина: короткие мышцы = ↓ ROM
- Нервная система: моторный контроль в конечных диапазонах
- Стабильность: способность создавать силу в крайних позициях
- Фасциальное скольжение: межтканевое скольжение слоёв

ПРОТОКОЛЫ:
Для гибкости: статическая растяжка 3-4×30-60с, PNF (contract-relax) 3×6с сокращение + 30с растяжка
Для мобильности: CARs (Controlled Articular Rotations), PAILs/RAILs, end-range isometrics
Для силовых атлетов: приоритет мобильности > гибкости. Нужен активный контроль, не пассивный ROM
Частота: 5-7 дней/неделю для прогресса, 2-3 для поддержания

ВЛИЯНИЕ НА СИЛУ:
- Статическая растяжка >60с перед тренировкой: ↓ сила на 5-7% (мета-анализ Simic 2013)
- Динамическая разминка: ↑ сила и мощность на 1-3%
- Долгосрочная растяжка (>4 недель): НЕ снижает силу, может ↑ гипертрофию через увеличение ROM
`;
}
export function getShoulderRehabProtocol(message: string): string {
  const triggers = ['реабилитация плеча', 'травма плеча тренировк', 'болит плечо тренировк', 'импинджмент плеча', 'плечо реабилитац', 'тренировки с больным плечом'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[РЕАБИЛИТАЦИЯ ПЛЕЧЕВОГО СУСТАВА ДЛЯ АТЛЕТОВ]
Плечо — самый подвижный и уязвимый сустав. 36% силовых атлетов имеют проблемы с плечом.

ЧАСТЫЕ ТРАВМЫ:
1. Импинджмент-синдром (subacrominal): защемление сухожилий ротаторной манжеты при поднятии руки
2. Тендинопатия надостной мышцы (supraspinatus): боль при отведении 60-120°
3. SLAP-повреждение (верхняя губа): боль при жиме над головой, щелчки
4. Нестабильность: подвывихи, ощущение «выскальзывания»

ФАЗЫ РЕАБИЛИТАЦИИ:
Фаза 1 — Острая (1-2 недели): покой от болезненных движений, ↓ воспаление
- Исключить: жим над головой, разведения выше 90°, жим лёжа широким хватом
- Можно: тяги в горизонтальной плоскости, изометрия ротаторной манжеты
- Лёд после тренировки 15 мин

Фаза 2 — Восстановление подвижности (2-4 недели):
- Pendulum exercises (маятник Кодмана): 3×30с
- Sleeper stretch: 3×30с для внутренней ротации
- Cross-body stretch: 3×30с для задней капсулы
- Пассивная флексия/абдукция без боли

Фаза 3 — Укрепление (4-8 недель):
- Ротаторная манжета: внешняя ротация с резинкой 3×15, внутренняя 3×15
- Нижняя трапеция: Y-raises лёжа на животе 3×12
- Серратус (передняя зубчатая): serratus push-ups 3×12, wall slides 3×10
- Scapular retraction: тяга к лицу (face pull) 3×15-20

Фаза 4 — Возврат к тренировкам:
- Жим лёжа: начать с узкого хвата, ↓ ROM (не касаться груди), 50% веса
- Жим над головой: только через 6-8 недель, landmine press как промежуточный
- Прогрессия: ↑ вес на 10%/неделю при отсутствии боли

ПРОФИЛАКТИКА: фейс-пулл 3×15 в каждую тренировку, баланс жимы:тяги = 1:2
`;
}
export function getKneeRehabProtocol(message: string): string {
  const triggers = ['реабилитация колена', 'травма колена тренировк', 'болит колено присед', 'пателлярн тендинит', 'колено реабилитац', 'тренировки с больным коленом'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[РЕАБИЛИТАЦИЯ КОЛЕННОГО СУСТАВА ДЛЯ АТЛЕТОВ]
Колено — шарнирный сустав, испытывающий нагрузки до 7× массы тела при приседаниях.

ЧАСТЫЕ ТРАВМЫ:
1. Пателлярная тендинопатия («колено прыгуна»): боль под коленной чашечкой
2. Пателлофеморальный синдром: боль вокруг/за коленной чашечкой при приседании
3. Менисковые повреждения: щелчки, блокирование, отёк
4. Тендинопатия квадрицепса: боль выше коленной чашечки
5. IT-band синдром: боль снаружи колена (бегуны)

ПАТЕЛЛЯРНАЯ ТЕНДИНОПАТИЯ — ЗОЛОТОЙ СТАНДАРТ ЛЕЧЕНИЯ:
Фаза 1 — Изометрия (0-2 недели):
- Spanish squat (с резинкой за колени): 5×45с удержание
- Wall sit: 4×45с при угле 60°
- Эффект: анальгезия (↓ боль на 4-6 часов после изометрии)

Фаза 2 — Тяжёлые медленные эксцентрики (2-12 недель):
- Приседания на одной ноге на платформе: 4×8 (3с вниз, 3с вверх)
- Leg press одной ногой: 3×10 (4с эксцентрика)
- Прогрессия веса при ↓ боли (допустимо: до 3/10 по шкале боли)

Фаза 3 — Энергозапасающие упражнения (12+ недель):
- Прыжки на платформу (box jump) с мягким приземлением
- Drop jumps с постепенным ↑ высоты
- Возврат к полным приседаниям с прогрессией

ПАТЕЛЛОФЕМОРАЛЬНЫЙ СИНДРОМ:
- Укрепление VMO: приседания с акцентом на последние 30° разгибания
- Укрепление ягодичных: hip thrust, clam shell, monster walk
- Растяжка квадрицепса и IT-band
- Коррекция вальгуса колена (колени внутрь) при приседаниях

МОДИФИКАЦИИ ТРЕНИРОВОК:
- Приседания болят → box squat (↓ нагрузка на сухожилие в нижней точке)
- Разгибания болят → разгибания в верхней части ROM (45-0°)
- Выпады болят → обратные выпады (↓ нагрузка на переднее колено)
`;
}
export function getLowBackRehabScience(message: string): string {
  const triggers = ['реабилитация поясниц', 'боль в пояснице тренировк', 'грыжа диска тренировк', 'протрузия тренировк', 'поясница болит штанг', 'low back pain атлет'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[БОЛЬ В ПОЯСНИЦЕ — НАУКА И ТРЕНИРОВКИ]
85% людей испытывают боль в пояснице хотя бы раз в жизни. Большинство случаев — неспецифическая (без конкретной патологии).

ВАЖНО: боль ≠ повреждение. МРТ-находки (грыжи, протрузии) часто обнаруживаются у БЕССИМПТОМНЫХ людей:
- 30-40% людей 20-39 лет имеют протрузии БЕЗ боли (Brinjikji 2015)
- Наличие грыжи на МРТ НЕ означает, что она — причина боли

СИСТЕМА McGILL (Stuart McGill) — «BIG 3»:
1. Curl-up (модифицированное скручивание): руки под поясницей, одна нога согнута
   - 3×8-10, удержание 10с → тренировка прямой мышцы без флексии позвоночника
2. Side plank (боковая планка): 3×20-30с каждая сторона
   - Тренировка квадратной мышцы поясницы и косых
3. Bird dog: 3×8-10 каждая сторона, удержание 10с
   - Стабильность в нейтральной позиции, координация

ПРИНЦИПЫ ТРЕНИРОВОК С БОЛЬЮ В ПОЯСНИЦЕ:
- Spine sparing: минимизировать сгибание/разгибание позвоночника под нагрузкой
- Hip hinge > spine flexion: движение из тазобедренных, не из поясницы
- Нейтральный позвоночник: в приседаниях и тягах — ОБЯЗАТЕЛЬНО
- ↓ осевая нагрузка в острой фазе: заменить приседания на жим ногами, belt squat
- Ходьба: лучшее «лекарство» — 30-60 мин/день ↓ боль и ↑ кровоток

БЕЗОПАСНЫЕ УПРАЖНЕНИЯ ПРИ БОЛИ:
✅ Жим ногами, belt squat, гиперэкстензия (↓ ROM), тяга верхнего блока
✅ Жим лёжа (нейтральный позвоночник), тяга гантели с упором
✅ Hip thrust, glute bridge, bird dog, pallof press
❌ Становая тяга с пола (в острой фазе), good morning, гиперэкстензия с весом
❌ Приседания с большим наклоном корпуса, скручивания с весом

ВОЗВРАТ К ТЯЖЁЛЫМ ТЯГАМ/ПРИСЕДАМ: 50% → 60% → 70% → 80%, ↑ 10%/неделю при 0 боли
`;
}
export function getElbowTendinopathyGuide(message: string): string {
  const triggers = ['теннисный локот', 'локоть гольфиста', 'эпикондилит тренировк', 'болит локоть тренировк', 'тендинит локтя', 'локоть тренировк боль'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[ТЕНДИНОПАТИЯ ЛОКТЯ — ТЕННИСНЫЙ ЛОКОТЬ И ЛОКОТЬ ГОЛЬФИСТА]
Латеральный эпикондилит (теннисный локоть): боль СНАРУЖИ локтя — разгибатели запястья
Медиальный эпикондилит (локоть гольфиста): боль ВНУТРИ локтя — сгибатели запястья

ПРИЧИНЫ У АТЛЕТОВ:
- Подтягивания с большим объёмом
- Становая тяга (хват)
- Сгибания на бицепс (медиальный)
- Жим лёжа узким хватом
- Избыточный объём без постепенного наращивания

РЕАБИЛИТАЦИЯ — ПРОТОКОЛ TYLER TWIST (латеральный):
- FlexBar (резиновый брусок): скручивание + медленное раскручивание
- 3×15, 2 раза/день, 6-8 недель
- Эффективность: ↓ боль на 81% (Tyler 2006)

ЭКСЦЕНТРИЧЕСКАЯ ПРОГРАММА:
Латеральный: разгибание запястья с гантелью, рука на колене ладонью вниз
- Поднять двумя руками → медленно опустить одной (3-4с) — 3×15
Медиальный: сгибание запястья, рука ладонью вверх
- Та же схема: концентрика двумя руками → эксцентрика одной

ИЗОМЕТРИЯ (в острой фазе для обезболивания):
- Сжимание теннисного мяча: 5×45с, 3 раза/день
- Wrist extension isometric: давить тыльной стороной ладони в стол 5×10с

МОДИФИКАЦИИ ТРЕНИРОВОК:
- Подтягивания → тяга верхнего блока (нейтральный хват) или thick grip
- Сгибания штангой → молотки или сгибания с канатом
- Становая тяга → лямки (↓ нагрузка на предплечья)
- Fat gripz / thick bar → ↑ активация предплечий, ↓ точечное давление на сухожилия
- Компрессионный бандаж на предплечье ниже локтя (↓ нагрузка на сухожилие)
`;
}
export function getAnkleMobilityProtocol(message: string): string {
  const triggers = ['мобильность голеностоп', 'ankle mobility', 'голеностоп подвижност', 'дорсифлексия', 'приседание пятки отрыва', 'ankle mobility присед'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[МОБИЛЬНОСТЬ ГОЛЕНОСТОПНОГО СУСТАВА]
Дорсифлексия (сгибание стопы на себя) — ключевой показатель. Норма: >35°. У многих атлетов: 15-25°.

ПОЧЕМУ ВАЖНО:
- ↓ дорсифлексия → колени не могут двигаться вперёд в приседе → компенсация наклоном корпуса
- → ↑ нагрузка на поясницу, ↓ глубина приседа, ↓ активация квадрицепса
- → ↑ вальгус колена (колени внутрь) при приседаниях
- → ↑ риск травмы ACL (передней крестообразной связки)

ТЕСТ (Knee-to-Wall):
- Встань лицом к стене, стопа на расстоянии 10-12см от стены
- Согни колено, коснись стеной, пятка на полу
- Норма: ≥10-12 см. <8 см = ограничение. >14 см = отлично

ПРОТОКОЛ УЛУЧШЕНИЯ:
1. Banded ankle mobilization: резинка на голень спереди, тянет назад → выпад вперёд
   - 2×20 покачиваний каждая нога, перед КАЖДОЙ тренировкой ног
2. Weighted knee-over-toe stretch: с гантелью/гирей на колене, 3×30с
3. Растяжка икроножной: стоя на степе, пятки свисают → опускание 3×30с
4. Растяжка камбаловидной: то же, но колено согнуто 30° (камбаловидная пересекает только голеностоп)
5. Самомиофасциальный релиз: мяч для лакросса под подошву 60с, валик на икры 60с

ВРЕМЕННЫЕ РЕШЕНИЯ:
- Штангетки (подъём пятки 0.75-1 дюйм): компенсируют ↓ дорсифлексию
- Подкладки под пятки (блины 1.25-2.5 кг): бюджетная альтернатива штангеткам
- НО: это костыль, работай над мобильностью параллельно

ПРОГРЕСС: ↑ 2-5° за 4-6 недель ежедневной работы
`;
}
export function getHipMobilityProtocol(message: string): string {
  const triggers = ['мобильность тазобедренн', 'hip mobility', 'тбс подвижност', 'бёдра мобильност', 'раскрыть бёдра', 'тазобедренн подвижност'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[МОБИЛЬНОСТЬ ТАЗОБЕДРЕННОГО СУСТАВА]
ТБС — шаровидный сустав, движение в 3 плоскостях. Ограничения → компенсация поясницей → боль.

АНАТОМИЧЕСКИЕ ОГРАНИЧЕНИЯ:
- Мышечные: короткие сгибатели бедра (psoas, iliacus) от сидячего образа жизни
- Капсулярные: жёсткая суставная капсула (адаптация к ↓ подвижности)
- Костные: строение вертлужной впадины (индивидуально!) — определяет максимальный ROM
- FAI (femoroacetabular impingement): костные выросты → ↓ ROM в определённых направлениях

ТЕСТ НА КОСТНЫЕ ОГРАНИЧЕНИЯ:
- Если при глубоком приседе «зажимает» в паху (передняя часть ТБС) → возможно FAI
- Попробуй присед с широкой постановкой ног и развёрнутыми носками — если лучше → анатомия требует такой стойки
- Не все могут приседать с узкой постановкой — это НОРМАЛЬНО

ПРОТОКОЛ:
Ежедневно (5-10 минут):
1. 90/90 stretch: сидя на полу, обе ноги под 90°, ротация 3×10 каждая сторона
2. Couch stretch (растяжка iliopsoas): задняя нога на скамье/диване, 3×30с
3. Pigeon stretch (голубь): 3×30с — глубокие ротаторы
4. Frog stretch: на четвереньках, колени широко, покачивания назад 3×15
5. CARs (Controlled Articular Rotations): полные круги в ТБС 5× каждая нога

Перед тренировкой ног:
1. Hip circles: 10× каждое направление
2. Goblet squat hold: с гирей, 30с удержание внизу, локти расталкивают колени
3. Lateral lunge: 8× каждая сторона
4. Banded hip distraction: резинка на бедро, тяга латерально, покачивания в выпаде 2×15

ВЛИЯНИЕ НА ТРЕНИРОВКИ:
- ↑ глубина приседа → ↑ активация ягодичных на 25%
- ↓ butt wink (подкручивание таза) в нижней точке приседа
- ↓ компенсаторный наклон корпуса в приседании
`;
}
export function getThoracicMobilityGuide(message: string): string {
  const triggers = ['грудной отдел мобильност', 'thoracic mobility', 'кифоз тренировк', 'тораксальн мобильност', 'верхняя спина мобильност', 'сутулость тренировк'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[МОБИЛЬНОСТЬ ГРУДНОГО ОТДЕЛА ПОЗВОНОЧНИКА]
Грудной отдел (Т1-Т12): 12 позвонков, прикреплены к рёбрам → естественно менее подвижен.
Но: избыточный кифоз (сутулость) = проблема для атлетов.

ПОЧЕМУ ВАЖНО:
- ↓ разгибание грудного → ↓ ROM в жиме над головой → компенсация поясницей (↑ лордоз)
- ↓ ротация грудного → ↓ качество тяги в наклоне, ↓ стабильность в приседе
- ↑ кифоз → ↑ протракция плеч → ↑ риск импинджмента
- Влияет на все базовые движения: присед, жим, тяга

ОЦЕНКА:
- Wall angel test: стоя спиной к стене, поднимать руки вверх вдоль стены
  - Норма: руки касаются стены полностью при полном подъёме
  - Ограничение: руки отрываются от стены, компенсация прогибом поясницы
- Seated rotation test: сидя, гриф на плечах, повернуться → норма >45° в каждую сторону

ПРОТОКОЛ:
Ежедневно (5 минут):
1. Foam roller extension: валик под грудной отдел, руки за головой, разгибание 3×10
2. Cat-cow: 2×10 — мобилизация в сгибание/разгибание
3. Thread the needle: на четвереньках, ротация 3×8 каждая сторона
4. Open book: лёжа на боку, верхняя рука рисует дугу через верх 3×8

Перед тренировкой:
1. Wall slides: спиной к стене, руки скользят вверх-вниз 2×10
2. Prone swimmer: лёжа на животе, руки рисуют круги 2×8
3. Band pull-apart с паузой в конце: 2×15

Продвинутые:
1. Jefferson curl: ЛЁГКИЙ вес, медленное позвонковое сгибание сверху вниз 3×5
2. Turkish get-up: комплексное упражнение на мобильность + стабильность
3. Windmill с гирей: ротация + разгибание под нагрузкой

ПРОГРЕСС: заметное улучшение за 3-4 недели ежедневной работы
`;
}
export function getWristMobilityStrength(message: string): string {
  const triggers = ['мобильность запясть', 'болит запясть тренировк', 'запястье тренировк', 'wrist mobility', 'запястья укрепл', 'фронтальный присед запясть'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
[МОБИЛЬНОСТЬ И СИЛА ЗАПЯСТИЙ]
Запястье — сложный сустав (8 костей запястья). Ограничения влияют на: фронтальный присед, отжимания, жим, взятие на грудь.

ЧАСТЫЕ ПРОБЛЕМЫ:
- ↓ разгибание (extension): боль при отжиманиях, фронтальном приседе
- Синдром запястного канала: онемение пальцев (срединный нерв)
- Тендинит от хвата: слишком много тяг/подтягиваний

ОЦЕНКА:
- Норма разгибания: >70° (ладони на столе, пальцы к себе, локти вытянуты)
- Норма сгибания: >80°
- Если <60° разгибания → проблемы с front rack position

ПРОТОКОЛ МОБИЛЬНОСТИ:
1. Wrist CARs: полные медленные круги запястьем 10× каждое направление
2. Wrist extension on floor: ладони на полу, пальцы к себе, покачивания 2×15
3. Wrist flexion stretch: тыльная сторона ладони на полу, покачивания 2×15
4. Pronation/supination с лёгким весом: вращение предплечья с гантелью 2×10
5. Prayer stretch + reverse prayer: 3×20с каждое

УКРЕПЛЕНИЕ:
1. Wrist curls (сгибание): 3×15-20 с лёгкой гантелью
2. Reverse wrist curls (разгибание): 3×15-20
3. Radial/ulnar deviation: 3×10 (молоток — подъём верх/вниз)
4. Plate pinch: удержание блина пальцами 3×30с
5. Rice bucket: погружение руки в ведро с рисом, сжимание/разжимание 3×30с
6. Finger extensions с резинкой: 3×20

ДЛЯ ФРОНТАЛЬНОГО ПРИСЕДА:
- Используй 2-3 пальца вместо полного хвата если ↓ мобильность
- Cross-grip (руки крестом) как временное решение
- Straps на грифе → позволяют front rack без полного разгибания
`;
}
export function getOsteoarthritisTrainGuide(message: string): string {
  const triggers = ['артроз тренировк', 'остеоартрит спорт', 'больные суставы тренировк', 'артрит колено тренировк', 'суставы болят зал'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦴 ТРЕНИРОВКИ ПРИ ОСТЕОАРТРОЗЕ:

⚠️ Проконсультируйтесь с ревматологом или ортопедом!

**Почему тренировки НЕОБХОДИМЫ при артрозе:**
- Мышцы стабилизируют сустав и снимают нагрузку с хряща
- Движение обеспечивает питание хряща (синовиальная жидкость)
- Потеря веса через тренировки снижает нагрузку на суставы
- Бездействие УХУДШАЕТ артроз (атрофия мышц → больше нагрузка на хрящ)

**Принципы тренировок:**
- Начинать с минимума, наращивать постепенно
- Боль во время упражнения до 3/10 — допустима
- Боль >5/10 или усиление после тренировки >2 часов — слишком много
- Утренняя скованность <30 мин на следующий день — нагрузка адекватна

**Для коленного артроза:**
✅ Изометрический квадрицепс, мост, жим ногами (неполная амплитуда)
✅ Плавание, велотренажёр (минимальная ударная нагрузка)
✅ Мини-приседания (до 45°), степ-апы на низкую ступень
❌ Глубокие приседания с весом, прыжки, бег по асфальту

**Для тазобедренного артроза:**
✅ Отведение бедра, мост, ходьба, плавание
✅ Лёгкие приседания с широкой стойкой
❌ Глубокие выпады, бег, высокоударные нагрузки

**Для артроза рук/кистей:**
✅ Сжатие мягкого мяча, разгибание пальцев с резинкой
✅ Использовать толстые грипы на гантелях
❌ Тяжёлый хват, тяги без лямок при острой боли

**Дополнительно:**
- Разминка: 10-15 мин, тёплый компресс на сустав перед тренировкой
- Холод после тренировки (15-20 мин) при отёке
- Глюкозамин + хондроитин: доказательства слабые, но безвредно
- Омега-3: 2-3 г/день (противовоспалительный эффект)
- Коллаген II типа: 40 мг/день — перспективные данные
`;
}
export function getMentalToughnessTraining(message: string): string {
  const triggers = ['ментальная жёсткость', 'mental toughness', 'стрессоустойчивость спорт', 'психологическая выносливость', 'устойчивость к давлению', 'жёсткость характера спорт'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦾 МЕНТАЛЬНАЯ ЖЁСТКОСТЬ (MENTAL TOUGHNESS):

**Определение (модель 4C — Clough & Earle):**
- Control (контроль): вера в управление ситуацией
- Commitment (обязательность): доведение дел до конца
- Challenge (вызов): трудности как возможности, не угрозы
- Confidence (уверенность): высокая самооценка под давлением

**Развитие ментальной жёсткости — практика:**

Метод дискомфорта (прогрессивный):
- Еженедельно добавляй 1 неудобную задачу
- Холодный душ 2 мин (начни с 30 сек) — физическая тренировка терпения
- Завершай тренировки даже когда «не хочется» (в меру)
- Записывай: «Сегодня я сделал сложное несмотря на X»

Управление внутренним диалогом:
- Замечай автоматические мысли («слишком тяжело», «я слабак»)
- Замени на: «Это тяжело — и я справляюсь», «Дискомфорт временный»
- Техника «разворота»: боль в подходе → «значит я расту»

Стрессовые тренировки (simulation training):
- Создавай давление заранее: «Если не выполню — добавлю штрафной подход»
- Соревновательные тренировки с партнёром
- Ставь таймер, видеозапись, «аудиторию» — симулируй соревновательный стресс

Дыхательный контроль (для немедленного применения):
- Физиологический вздох: двойной вдох + долгий выдох
- Снижает кортизол за 30-60 секунд
- Использовать между подходами при высокой тревоге

**Признаки высокой ментальной жёсткости:**
✅ Продолжаешь работать при дискомфорте
✅ Не ищешь оправданий, ищешь решения
✅ Восстанавливаешься быстро после неудач
✅ Мотивация не зависит от настроения

**Признаки низкой (развивать):**
❌ Бросаешь упражнение при первом дискомфорте
❌ Прокрастинируешь сложные подходы
❌ Одна плохая тренировка = «я неудачник»
❌ Нужна внешняя валидация каждый раз
`;
}
export function getJointMechanicsGuide(message: string): string {
  const triggers = ['механика суставов', 'суставной угол', 'кинематика суставов', 'амплитуда суставов', 'подвижность суставов биомеханик', 'суставные силы'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
🦴 МЕХАНИКА СУСТАВОВ — ПРИМЕНЕНИЕ В ТРЕНИРОВКАХ:

**Типы суставов и их движения:**

Шаровидный (плечо, тазобедренный):
- Движения: сгибание, разгибание, отведение, приведение, ротация
- Риск: импинджмент при неправильном положении
- Тренировка: нужен полный ROM (диапазон движения)

Блоковидный (локоть, коленный):
- Движения преимущественно: сгибание-разгибание
- Колено: небольшая ротация при согнутом положении
- Риск: вальгус/варус при нестабильности

Седловидный (лучезапястный, I плюснефаланговый):
- Бимануальные движения
- Критично для жима (хват, запястья)

**Оптимальные углы в силовых упражнениях:**

Становая тяга:
- Старт: бёдра ~45-60° к горизонту (зависит от пропорций)
- Колено: 90-110° в начале тяги
- Спина: нейтральная (не кифоз, не гиперлордоз)

Приседание (параллель):
- Голень: наклон 15-25° от вертикали
- Бедро: параллельно полу или ниже
- Колено: над мыском (или чуть за мысок — норма при глубоком приседе)

Жим лёжа:
- Локоть: 45-75° к туловищу (не 90° — это риск плеча)
- Предплечье: вертикально (максимальная передача силы)
- Запястье: нейтральное (не разогнуто)

**Синдром импинджмента плеча:**
Причина: сужение субакромиального пространства при подъёме руки
Риски при:
- Жиме с локтями 90° к туловищу
- Тяге к подбородку узким хватом
- Тяге верхнего блока за голову

Профилактика:
- Депрессия лопатки при жиме (лопатки вниз и назад)
- Внешняя ротация плеча в жимах
- Баланс жим:тяга = 1:1 (или лучше 1:1.5)

**Вальгус колена:**
- Колени уходят вовнутрь при приседании
- Причина: слабость ягодичных, плохая мобильность голеностопа
- Коррекция: лента выше колен, упражнения на отведение бедра
`;
}
export function getShoulderComplexGuide(message: string): string {
  const triggers = ['биомеханика плеч', 'лопаточно-плечевой ритм', 'плечевой комплекс', 'ротаторная манжета биомеханик', 'стабилизация лопатки', 'подъём руки механика'];
  const msg = message.toLowerCase();
  if (!triggers.some(t => msg.includes(t))) return '';
  return `
💪 ПЛЕЧЕВОЙ КОМПЛЕКС — БИОМЕХАНИКА И ТРЕНИРОВКА:

**Анатомия плечевого комплекса:**
Не один сустав, а 4:
1. Плечевой (GH) — главное движение руки
2. Акромиально-ключичный (AC) — вверху лопатки
3. Грудино-ключичный (SC) — у грудины
4. Лопаточно-грудной (ST) — лопатка скользит по ребрам

Все 4 работают синхронно → нарушение одного ведёт к компенсациям

**Лопаточно-плечевой ритм:**
Подъём руки до 180°:
- Первые 30°: только плечевой сустав (GH)
- 30-90°: GH + лопатка 2:1 (2° в GH, 1° поворот лопатки)
- 90-180°: продолжение + наружная ротация ключицы

Нарушение ритма → импинджмент, боль, риск травм

**Ротаторная манжета:**
4 мышцы (SITS):
- Supraspinatus (надостная) — начало отведения до 15°, депрессор головки
- Infraspinatus (подостная) — внешняя ротация (60% вклад)
- Teres minor (малая круглая) — внешняя ротация
- Subscapularis (подлопаточная) — внутренняя ротация

Функция: центрация головки плечевой кости в суставе
При слабости: голова «уезжает» вверх → импинджмент

**Лопаточная стабилизация:**
Мышцы: трапеция (3 части), передняя зубчатая, ромбовидные

Правильная позиция при жимах:
- Лопатки назад и вниз (retraction + depression)
- Не пожимать плечами (элевация лопаток) при жиме

Слабость передней зубчатой:
- «Крыловидная лопатка» (scapular winging)
- Проблемы со всеми вертикальными жимами и тягами
- Упражнение: serratus wall slides, hollow body hold

**Программирование для здоровых плеч:**
Соотношение горизонтальное:
- Жим горизонтальный : горизонтальная тяга = 1:1.5
Соотношение вертикальное:
- Вертикальный жим : вертикальная тяга = 1:2

Обязательные упражнения для здоровья:
- Внешняя ротация: 3×15 (лента/гантель), 3 р/нед
- Face pulls: 3×15-20, 3 р/нед
- YTW: 2×12 на скамье
`;
}
export function getTendonElasticity(message: string): string {
  const kw = ['здоровье сухожилий', 'тендинопатия', 'лечение сухожилия', 'изометрия сухожилие', 'укрепление сухожилий'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Здоровье и тренировка сухожилий:**

**Биология сухожилия:**
- Состоит из коллагена I типа (~70% сухого веса)
- Метаболизм медленный — адаптация занимает месяцы
- Кровоснабжение ограничено → регенерация медленная
- Температура тендона растёт при нагрузке → важна разминка

**Стадии тендинопатии:**
1. Реактивная (острая) — временное утолщение, болезненность
2. Дисrepair — нарушение структуры коллагена
3. Дегенеративная — хроническая, клетки гибнут
→ Ранняя диагностика критически важна!

**Протокол лечения (Alfredson/Rio):**
**Изометрия** (острая фаза): 5×45 сек, умеренное усилие, нет боли
**Тяжёлые медленные повторения (HSR)** (субострая фаза):
- 3-4 сета × 6-15 повторений, темп 3-0-3
- Нагрузка: умеренная боль допустима (3-4/10 по NRS), но не после
**Плиометрика** (поздняя фаза): постепенное введение реактивной нагрузки

**Специфика по тендонам:**
Ахиллово: подъёмы на носки (эксцентрика) — классика
Надколенника: испанский присед, разгибания ног
Вращательная манжета: изометрия ротаторов + тяги

**Критические правила:**
- Нет пассивного отдыха — изометрия продолжается всегда
- Боль утром → снизить нагрузку вчера было избыточно
- Избегать растяжки в остром периоде
- Прогресс медленный — 3-6 месяцев до полного восстановления
`;
}
export function getJointHealthLongevityAdvanced(message: string): string {
  const kw = ['здоровье суставов', 'суставы возраст', 'колени берегу', 'артрит тренировки', 'хрящ восстановление'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Здоровье суставов и тренировки:**

**Факт:** Силовые тренировки НЕ разрушают суставы — наоборот, укрепляют
Мета-анализ (Denning 2017): бегуны имеют МЕНЬШЕ артрита, чем малоподвижные

**Хрящ — живая ткань:**
Питается диффузией при нагрузке/разгрузке (как губка)
Без движения → дегенерация
Умеренная нагрузка → адаптация и укрепление

**Протокол для суставов:**
Коллаген: 15 г + витамин C (50 мг) за 60 мин до тренировки
Желатин работает так же (дешевле)
Исследование Shaw 2017: ↑ синтез коллагена в 2 раза

**Глюкозамин + хондроитин:**
Эффект скромный, но безопасно
Глюкозамин сульфат 1500 мг/день
Хондроитин 800-1200 мг/день
Курс: минимум 3 месяца

**Стратегии сохранения суставов:**
Полная амплитуда > частичная (глубокий присед защищает колени)
Прогрессия нагрузки: не более +10% в неделю
Разминка: 5-10 мин — не пропускать
Эксцентрические упражнения: укрепляют сухожилия
Вариативность: чередовать паттерны движения
Вес тела: каждый лишний кг = +4 кг нагрузки на колени при ходьбе
`;
}
export function getThoracicMobility(message: string): string {
  const kw = ['мобильность грудного', 'грудной отдел', 'осанка упражнения', 'сутулость исправить', 'мобильность спины'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Мобильность грудного отдела позвоночника:**

**Почему важно:**
Грудной отдел = 12 позвонков, самый "застревающий" из-за сидячего образа жизни
Ограниченная мобильность → компенсация в пояснице и плечах → боль и травмы
Влияет на: жим над головой, приседания, становую тягу

**Тесты:**
Rotation: сидя, руки скрещены на груди, поворот > 45° = норма
Extension: лёжа на валике, руки за головой, касание пола = норма

**Упражнения (ежедневно 5-10 мин):**

1. **Cat-Cow (кошка-корова):** 10 циклов, акцент на грудной отдел
2. **Foam roller extension:** лежа на валике, руки за головой, 3×10 разгибаний
3. **Thread the needle:** 8 раз на сторону, удерживая таз стабильным
4. **Open book:** лёжа на боку, ротация с раскрытием → 8 на сторону
5. **Wall slide:** спиной к стене, скольжение руками вверх → 3×10

**Для офисных работников:**
Каждые 60 мин: 10 разгибаний грудного на стуле
Каждые 2 часа: 5 мин мобильности
Утро: 5 мин foam roller + cat-cow
`;
}
export function getHipMobility(message: string): string {
  const kw = ['мобильность таза', 'растяжка бёдер', 'тазобедренный сустав', 'раскрытие бёдер', 'глубокий присед мобильность'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Мобильность тазобедренного сустава:**

**Почему критично:**
Сидение 8+ часов → укорочение сгибателей бедра → передний наклон таза
→ боль в пояснице, ↓ глубина приседа, ↓ активация ягодичных

**Тесты:**
Thomas test: лёжа на краю стола, одна нога свисает. Если бедро не касается стола → укорочение
Squat test: глубокий присед без обуви. Пятки отрываются → ограничение голеностопа/бёдер

**Протокол "Hip Reset" (10 мин):**
1. 90/90 stretch — 60 сек на сторону
2. Couch stretch (сгибатель бедра) — 60 сек
3. Pigeon pose — 60 сек
4. Frog stretch — 90 сек
5. Deep squat hold (goblet) — 60 сек, пульсации в нижней точке

**Для улучшения приседа:**
Goblet squat с паузой 3 сек внизу
Казачий присед (боковой выпад) — ↑ приводящие
Ankle mobility: колено к стене (>12 см = норма)

**Ежедневный минимум:**
Утро: 2 мин deep squat hold (можно держась за дверь)
Перед тренировкой: 90/90 + couch stretch
После: pigeon pose + frog
`;
}
export function getShoulderMobility(message: string): string {
  const kw = ['мобильность плеч', 'плечи болят жим', 'плечевой сустав', 'ротаторная манжета', 'импинджмент плеча'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Мобильность и здоровье плечевого сустава:**

**Анатомия проблемы:**
Плечо = самый подвижный сустав = самый нестабильный
Ротаторная манжета (4 мышцы): суставной стабилизатор
Импинджмент: защемление сухожилия в субакромиальном пространстве

**Факторы риска:**
Чрезмерный жим (особенно за голову)
Слабые внешние ротаторы vs сильные внутренние
Укорочение грудных мышц → протракция плеч
Нестабильность лопатки

**Протокол здоровья плеча:**

Разминка перед жимом (обязательно):
1. Band pull-apart — 2×15
2. Face pull (резинка) — 2×15
3. External rotation (резинка) — 2×12 на руку
4. Wall slide — 2×10
5. Scapular push-up — 2×10

Превентивная работа (2 раза/нед):
Y-T-W-L подъёмы лёжа на животе — 2×10 каждое
Cuban rotation — 3×10
Bottoms-up KB press — 3×8 на руку (лучшее для стабильности)

**Соотношение тяга:жим:**
Рекомендация: 2:1 (вдвое больше тяговых)
Например: 4 подхода жима → 8 подходов тяг (в неделю)

**Красные флаги → к врачу:**
Боль при поднятии руки выше 90°
Ночная боль в плече
Слабость при внешней ротации
Щёлканье + боль
`;
}
export function getAnkleMobility(message: string): string {
  const kw = ['мобильность голеностопа', 'ankle mobility', 'стопа тренировки', 'голеностоп присед', 'пятки отрываются'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Мобильность голеностопа:**

**Почему важно для тренировок:**
Ограниченная дорсифлексия → пятки отрываются в приседе → наклон вперёд → нагрузка на поясницу
Норма: колено проходит >12 см от стены при тесте "колено к стене"

**Тест:**
Стопа в 12 см от стены, колено движется к стене
Если колено касается → норма
Если не касается → ограниченная дорсифлексия

**Упражнения (ежедневно 5 мин):**
1. Колено к стене (wall ankle stretch): 3×30 сек на ногу, пульсации
2. Elevated ankle stretch: стопа на возвышении 5 см, давление коленом → 3×20 сек
3. Banded ankle mobilization: резинка сзади на голеностоп, выпад → 2×15

**Укрепление стопы:**
Towel scrunches (собирание полотенца пальцами): 3×20
Short foot exercise (укорочение стопы): 3×10 сек удержание
Ходьба босиком по разным поверхностям: 5-10 мин/день
Calf raises (подъёмы на носки): 3×15 с паузой 2 сек наверху

**Временные решения:**
Штангетки (каблук 0.75-1 дюйм) — компенсируют недостаток дорсифлексии
Подкладки под пятки 1-2 см
НО: параллельно работай над мобильностью, не маскируй проблему
`;
}
export function getKneeInjuryPrevention(message: string): string {
  const kw = ['колено болит', 'травма колена', 'acl профилактика', 'мениск', 'колено хрустит'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Профилактика травм колена:**

**Топ-3 причины травм колена в зале:**
1. Вальгус (колени внутрь) при приседаниях/прыжках
2. Слабые ягодичные → нестабильность
3. Дисбаланс квадрицепс/задняя поверхность бедра

**Превентивная программа (3 раза/нед, 10 мин):**
Band walks (резинка на коленях, шаги в сторону): 3×15
Single-leg Romanian deadlift: 3×10 на ногу
Terminal knee extensions (резинка): 3×15
Peterson step-down: 3×8 на ногу
Nordic curls (или эксцентрические сгибания): 3×5

**Оптимальный угол:**
Колени МОГУТ выходить за носки — это миф что нельзя
Глубокий присед ЗАЩИЩАЕТ колени (≥90° = ↑ стабильность)
Частичный присед → ↑ нагрузка на надколенник

**Красные флаги → к ортопеду:**
Щелчок + боль + отёк = возможно мениск
Нестабильность ("подворачивается") = возможно ACL
Боль под коленной чашечкой = тендинопатия надколенника
Боль сбоку = IT-band синдром
`;
}
export function getShoulderInjuryPrevention(message: string): string {
  const kw = ['плечо травма', 'болит плечо жим', 'ротаторная манжета травма', 'импинджмент', 'плечо щёлкает'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Профилактика травм плеча:**

**Почему плечо самый травмируемый сустав:**
Максимальная амплитуда = минимальная стабильность
Ротаторная манжета (4 маленькие мышцы) vs большие мышцы (дельты, грудные)
Дисбаланс жим:тяга = протракция + ↓ субакромиальное пространство

**Программа "Bulletproof Shoulders" (перед каждой тренировкой верха):**
Face pulls (верёвка, блок): 2×20 (лёгкий вес!)
Band pull-apart: 2×20
External rotation (резинка, 90°): 2×15 на руку
Y-T-W лёжа на животе: 1×10 каждое
Scap push-ups: 2×10

**Правила для долгосрочного здоровья плеч:**
Тяга:жим = 2:1 по объёму
Избегай жим из-за головы (максимальная нагрузка на капсулу)
Жим лёжа: контролируемое опускание, локти ~45° к телу (не 90°!)
Подтягивания: не виси расслабленно — держи лопатки активными
Боковые махи: не выше 90° если есть дискомфорт

**Реабилитация (если уже болит):**
Изометрические упражнения (без движения) → безболезненные
Эксцентрические нагрузки (медленное опускание)
↓ Вес, ↑ повторения (>15)
Избегай болезненную амплитуду (не "работай через боль")
`;
}
export function getLowBackPainTraining(message: string): string {
  const kw = ['поясница болит', 'боль в спине', 'грыжа тренировки', 'протрузия', 'поясничный отдел'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Тренировки при боли в пояснице:**

**Важно:** Боль в спине ≠ запрет на тренировки!
95% боли в пояснице — неспецифическая (без серьёзной патологии)
Движение и силовые → лучшее лечение (мета-анализы Hayden 2021)

**McGill Big 3 (ежедневно, обязательно):**
1. Curl-up: 3× (10-8-6), руки под поясницу
2. Bird-dog: 3× (10-8-6), противоположные рука+нога
3. Side plank: 3× (10-8-6 сек), на локте

**Безопасные упражнения при боли:**
✅ Жим ногами (нет осевой нагрузки)
✅ Hip thrust (ягодичный мост)
✅ Разгибание/сгибание ног в тренажёре
✅ Жим от груди в тренажёре
✅ Подтягивания / тяга верхнего блока
✅ Ходьба (30-60 мин, лучшее лекарство)

**Ограничить (не запретить!):**
⚠️ Становая тяга → замени на trap-bar или румынскую
⚠️ Приседания → фронтальный присед или Goblet
⚠️ Жим стоя → жим сидя с опорой

**Красные флаги → немедленно к врачу:**
Онемение/слабость в ногах
Нарушение мочеиспускания
Боль не проходит в покое >6 недель
Травма (падение, удар)
`;
}
export function getPrehabilitation(message: string): string {
  const kw = ['прехаб', 'превентивные упражнения', 'профилактика травм', 'prehab', 'перед тренировкой разминка'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Прехабилитация (Prehab) — превентивные протоколы:**

**Перед КАЖДОЙ тренировкой (5-10 мин):**

Верхний день:
Band pull-apart: 2×15
Face pull (резинка): 2×15
External rotation (резинка): 2×12 на руку
Scap push-ups: 2×10
Arm circles: 10 в каждую сторону

Нижний день:
Band walks (резинка на коленях): 2×15 в сторону
Clamshells: 2×15 на сторону
Ankle circles: 10 в каждую сторону
Bodyweight squats: 2×10
Hip 90/90 stretch: 30 сек на сторону

**Еженедельная профилактика (2 раза/неделю, 15 мин):**
Nordic curls: 3×5 (профилактика задней поверхности)
Copenhagen adductors: 3×8 на ногу
Вращательная манжета: Y-T-W-L 2×10
Single-leg balance: 3×30 сек на ногу
Pallof press: 3×10 на сторону

**Статистика:**
Prehab снижает риск травм на 50%+ (мета-анализ Lauersen 2014)
Nordic curls снижают травмы задней поверхности на 65-85%
Программы FIFA 11+ снижают все травмы на 39%
`;
}
export function getOveruseInjuryGuide(message: string): string {
  const kw = ['перетренированность травма', 'хроническая травма', 'overuse', 'повторяющаяся боль', 'стрессовый перелом'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Травмы перегрузки (Overuse Injuries):**

**Что это:** микротравмы от повторяющейся нагрузки без достаточного восстановления
50-60% всех спортивных травм — overuse

**Типичные overuse-травмы:**
Тендинопатия (сухожилия)
Стрессовые переломы (кости)
Бурсит (суставные сумки)
Синдром карпального канала (запястье)
Shin splints (голени)

**Факторы риска:**
↑ Нагрузки >10% в неделю (правило 10%)
Монотонные движения (1 упражнение каждый день)
Недостаток сна (<7 часов)
Низкий калораж (RED-S — relative energy deficiency)
Биомеханические проблемы (плоскостопие, вальгус)

**Правило 10%:**
Не увеличивай общий объём более чем на 10% в неделю
Применяется к: весу, подходам, дистанции бега, частоте

**Менеджмент:**
1. Идентифицируй провокатор (какое движение/нагрузка?)
2. Снизь нагрузку на 30-50% (не прекращай полностью)
3. Замени на менее нагружающий вариант
4. Добавь prehab для слабого звена
5. Возвращайся к нагрузке по протоколу (см. Return to Sport)

**Профилактика:**
Вариативность: чередуй упражнения, углы, хваты
Периодизация: deload каждые 4-6 недель
Сон: 7-9 часов (главный фактор восстановления)
Калории: не менее BMR × 1.3 (даже на дефиците)
`;
}
export function getEnergySystemsTraining(message: string): string {
  const kw = ['энергетические системы тренировки', 'алактатная гликолитическая аэробная', 'системы энергообеспечения', 'фосфокреатиновая система', 'аэробный порог анаэробный'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Энергетические системы и их тренировка:**

**3 системы:**

**1. Фосфокреатиновая (алактатная, АТФ-КФ):**
Длительность: 0-10 сек максимального усилия
Восстановление: 3-5 мин полное
Тренировка: спринты 5-8 сек, максимальные прыжки, подъёмы ⟵ МОЩНОСТЬ
Пример: рывок штанги, спринт 40м

**2. Гликолитическая (лактатная):**
Длительность: 10 сек — 2 мин
Восстановление: 1-4 мин
Тренировка: работа 30-120 сек на 90-95% интенсивности ⟵ МОЩНОСТЬ + БУФЕРИЗАЦИЯ
Пример: Tabata, интервалы 400м, подходы до отказа

**3. Аэробная (окислительная):**
Длительность: 2 мин и более
Восстановление: часы
Тренировка: зона 2 (60-70% ЧССмакс, 80% общего объёма кардио), темповые бег, ЛИСС ⟵ ЁМКОСТЬ
Пример: бег 30 мин в умеренном темпе

**Принцип 80/20 (Polarized Training):**
80% тренировок — зона 2 (разговорный темп, аэробная база)
20% — зона 4-5 (выше анаэробного порога)
Пороговый тренинг (зона 3) — минимально

**Аэробная база для силовых:**
Зона 2 кардио 2-3×/нед по 30-45 мин = ↑ восстановление между подходами
↑ митохондриальная функция → ↑ использование жиров → легче сушка
`;
}
export function getShoulderHealth(message: string): string {
  const kw = ['здоровье плеч', 'боль в плече тренировки', 'вращательная манжета', 'rotator cuff', 'импинджмент плеча', 'укрепить плечи', 'плечи болят жим'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Здоровье плечевого пояса — профилактика и укрепление:**

**Анатомия и уязвимости:**
Ротаторная манжета (4 мышцы): надостная, подостная, малая круглая, подлопаточная
Стабилизируют головку плеча в суставной ямке при движении
Наиболее уязвима: надостная (проходит под акромионом → импинджмент)

**Импинджмент-синдром:**
Ущемление структур под акромионом при подъёме руки
Признаки: боль при подъёме руки 60-120°, ночная боль, боль при жиме
Причины: слабость ротаторной манжеты, нестабильность лопатки, неправильная техника

**Упражнения для ротаторной манжеты:**
External rotation (внешняя ротация): лёжа/стоя с эспандером — 3 × 15-20, лёгкое сопротивление
Face pull с верхнего блока: тянуть к лицу с разворотом — лучшее упражнение для манжеты
Y-T-W поднятия: развивает нижние трапеции и ромбовидные
Band pull-apart: горизонтальное разведение рук с эспандером

**Лопаточная стабилизация:**
Нижние трапеции и ромбовидные — часто слабые у жимовиков
«Свести и опустить лопатки» перед каждым жимом — активация стабилизаторов
Упражнения: overhead shrug, seated row с паузой, wall slides

**Баланс нагрузок:**
Тяговые : жимовые = 1:1 или 2:1 — профилактика дисбаланса
Многие атлеты тянут слишком мало → внутренняя ротация плеча → импинджмент

**При боли:**
Временно исключи жим над головой, снизь нагрузку
Добавь ротационные упражнения 2-3 раза/нед
Консультация врача при боли >2 недель
`;
}
export function getTendonLigamentTraining(message: string): string {
  const kw = ['сухожилия', 'связки', 'тендинит', 'здоровье суставов', 'укрепить сухожилия', 'коллаген', 'патель'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Сухожилия и связки — тренировка и восстановление:**

**Физиология:**
Сухожилия адаптируются к нагрузке медленнее мышц — 6-12 недель vs 2-4 недели
Кровоснабжение бедное → долгое восстановление после травм
Коллаген-1 — основной структурный белок

**Как стимулировать рост:**
Изометрия (60-90% 1ПМ, 30-45 сек × 4-5 подходов) — особенно при тендинопатии
Тяжёлые медленные повторения (Heavy Slow Resistance, 3/3/3 темп)
Частота: 3-5 раз в неделю (сухожилия адаптируются к высокой частоте)

**Питание для сухожилий:**
Витамин С (500 мг) + желатин/коллаген (15-20 г) за 60 мин до тренировки
Мета-анализ (Shaw et al., 2017): +17% к синтезу коллагена в сухожилиях
Продукты: костный бульон, студень, желатин, куриная кожа

**Профилактика:**
Разминка: мягкие движения в суставе, динамическая растяжка
Не игнорировать боль в сухожилиях — «игра через боль» ухудшает ситуацию
Постепенное увеличение нагрузки: не более +10% объёма/неделю
`;
}
export function getPostureCorrection(message: string): string {
  const kw = ['осанка', 'сутулость', 'кифоз', 'лордоз', 'upper cross syndrome', 'коррекция осанки'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Коррекция осанки — синдромы и упражнения:**

**Верхний перекрёстный синдром (Upper Cross Syndrome):**
Укорочены: грудные мышцы + верхняя трапеция/леватор лопатки
Ослаблены: нижняя трапеция + глубокие сгибатели шеи + ромбовидные
Результат: округлые плечи, голова вперёд, сутулость, боль в шее

**Нижний перекрёстный синдром (Lower Cross Syndrome):**
Укорочены: подвздошно-поясничная мышца + разгибатели спины
Ослаблены: ягодичные мышцы + пресс (особенно поперечная мышца живота)
Результат: чрезмерный поясничный лордоз, боль в пояснице, «выпирающий» живот

**Корректирующие упражнения для верхнего синдрома:**
Face pulls (тяга к лицу на блоке): 3×15-20, ежедневно — укрепление нижней трапеции и задних дельт
Band pull-aparts (разведение резинки): 3×20, между подходами жима — активация ромбовидных
Растяжка грудных в дверном проёме: 3×30 сек, 2-3 раза в день
Подбородок к себе (chin tucks): 3×10, для глубоких сгибателей шеи

**Корректирующие упражнения для нижнего синдрома:**
Dead bugs (жук на спине): 3×10 на сторону — стабилизация кора без компрессии позвоночника
Ягодичный мостик: 3×15 — активация ягодичных мышц
Растяжка подвздошно-поясничной: 3×30 сек на сторону (поза выпада)
Планка (правильная): 3×30-60 сек — поперечная мышца живота

**Ежедневные привычки:**
Рабочее место: монитор на уровне глаз, локти под 90°, стопы на полу
Перерывы: вставать и двигаться каждые 30 минут (даже 1-2 минуты ходьбы)
Соотношение тяг к жимам: 2:1 (больше тяговых упражнений для баланса)
Спать на спине или боку с поддержкой шеи (не на животе)

**Сроки улучшения:**
2-4 недели: субъективное улучшение, уменьшение болей
8-12 недель: структурные изменения, заметное улучшение осанки
Ключ: ЕЖЕДНЕВНАЯ практика, а не 2-3 раза в неделю
`;
}
export function getInjuryPrevention(message: string): string {
  const kw = ['профилактика травм', 'как не получить травму', 'безопасность в зале', 'травма на тренировке'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Профилактика травм в тренажёрном зале — топ-5 травм и как их избежать:**

**1. Импинджмент плеча (shoulder impingement):**
Причина: жим штанги из-за головы, слишком широкий хват, слабые ротаторы манжеты
Профилактика: жим гантелей вместо штанги (свободная траектория), внешняя ротация с резинкой 2×15 перед каждой тренировкой верха
Сигнал: щелчки или боль при подъёме руки выше 90° — немедленно прекратить движение

**2. Боль в пояснице (low back strain):**
Причина: округление спины в становой тяге/приседаниях, слабый кор, сидячий образ жизни
Профилактика: dead bug и bird dog ежедневно (3×10), всегда напрягайте пресс перед подъёмом, пояс при >80% от 1RM
Сигнал: острая стреляющая боль — СТОП, не "дотерпеть подход"

**3. Боль в коленях (patellar tendinopathy):**
Причина: слишком резкое увеличение нагрузки в приседаниях, неправильная техника (колени завалены внутрь)
Профилактика: колени в направлении носков, прогрессия не более +10%/неделю, разминка на велотренажёре 5 мин
Сигнал: ноющая боль под коленной чашечкой, усиливающаяся при подъёме по лестнице

**4. Травмы запястий (wrist strain):**
Причина: чрезмерное разгибание при жиме лёжа, неправильный хват
Профилактика: гриф лежит на основании ладони (не на пальцах), бинты-кистевики при тяжёлых жимах
Сигнал: онемение или покалывание в пальцах — возможен туннельный синдром

**5. Мышечные надрывы (muscle tear):**
Причина: рывковые движения без разминки, работа с непривычно тяжёлым весом, усталость
Профилактика: всегда 2-3 разминочных подхода, прогрессивная перегрузка (максимум +10% в неделю)
Сигнал: внезапная острая боль "как будто порвалось" — лёд, покой, врач

**Главные правила безопасности:**
Техника ВСЕГДА важнее веса — если форма ломается, снижайте вес
Прогрессивная перегрузка: не более +2.5-5 кг на штангу за тренировку (верх/низ)
Слушайте боль: "тупая боль в мышцах" = нормально (DOMS), "острая боль в суставе" = СТОП
Достаточный сон (7-9ч) — недосып увеличивает риск травмы на 60% (Milewski et al.)
Когда продолжать: лёгкий дискомфорт, который уходит при разминке
Когда остановиться: боль усиливается с каждым повторением, острая/стреляющая боль, отёк
`;
}
export function getFlexibilityVsMobility(message: string): string {
  const kw = ['гибкость или мобильность', 'разница гибкость мобильность', 'нужна ли растяжка', 'мобильность суставов'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Гибкость vs мобильность — в чём разница и что нужно лифтерам:**

**Определения:**
Гибкость (flexibility) — пассивный диапазон движения (кто-то тянет вашу ногу)
Мобильность (mobility) — активный диапазон движения ПОД НАГРУЗКОЙ (глубокий присед с весом)
Пример: можете сесть на шпагат (гибкость), но не можете глубоко присесть (нет мобильности)
Мобильность = гибкость + контроль + сила в крайнем диапазоне

**Что важнее для тренирующихся:**
Мобильность > гибкость для силовых тренировок
Лифтеру не нужен шпагат — нужен глубокий присед, жим над головой, правильная тяга
Излишняя гибкость без силы = нестабильность суставов = повышенный риск травмы
Цель: достаточный диапазон движения для ваших упражнений + контроль в этом диапазоне

**Ключевые зоны мобильности для лифтеров:**

1. Голеностоп (ankle dorsiflexion):
Ограничение → колени не идут вперёд в приседе → компенсация поясницей
Тест: колено к стене в выпаде (>10 см от стены = ОК)
Упражнение: ankle rocks у стены, 2×15 каждая нога

2. Тазобедренный сустав (hip mobility):
Ограничение → "butt wink" в приседе, скругление поясницы внизу
Тест: глубокий присед с руками вперёд (пятки на полу, спина ровная)
Упражнение: 90/90 hip stretch, 60 сек каждая сторона

3. Грудной отдел позвоночника (thoracic spine):
Ограничение → сутулость в жиме над головой, плохая позиция в тяге
Тест: лёжа на спине, руки за голову — локти должны касаться пола
Упражнение: cat-cow (кошка-корова) 2×10, foam roller extension

4. Плечи (shoulder mobility):
Ограничение → боль при жиме над головой, невозможность низкого хвата грифа в приседе
Тест: руки за спину — одна сверху, одна снизу — пальцы должны соприкоснуться
Упражнение: wall slides (скольжение по стене) 2×10, dislocates с палкой

**Ежедневная 10-минутная рутина мобильности:**
1. Cat-cow (кошка-корова) — 10 повторений (грудной отдел)
2. 90/90 hip switch — 8 каждая сторона (тазобедренный)
3. Wall slides — 10 повторений (плечи)
4. Ankle rocks — 15 каждая нога (голеностоп)
5. World's greatest stretch — 5 каждая сторона (всё тело)
Делайте утром или перед тренировкой — занимает 10 минут, эффект огромный

**Важно:**
Статическая растяжка перед силовой — снижает силу. Делайте ПОСЛЕ тренировки.
Динамическая разминка (мобильность) перед тренировкой — улучшает производительность.
Прогресс в мобильности: 4-8 недель регулярной работы для заметных изменений.
`;
}
export function getJointHealth(message: string): string {
  const kw = ['здоровье суставов подробно', 'хруст в суставах', 'профилактика суставов'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Здоровье суставов — профилактика и поддержка:**

**Добавки для суставов (по доказательной базе):**

Коллаген: 15-20 г гидролизованного коллагена + 50 мг витамина C за 30-60 мин до тренировки
Исследования Shaw et al. 2017: увеличивает синтез коллагена в связках и сухожилиях
Витамин C обязателен — без него коллаген не синтезируется

Омега-3 (EPA + DHA): 2-3 г суммарно EPA+DHA в день
Мощный противовоспалительный эффект, снижает боль в суставах
Лучший источник: рыбий жир высокой концентрации или жирная рыба 3 раза в неделю

Глюкозамин + хондроитин: 1500 мг + 1200 мг в день
Смешанные научные данные (работает у ~50% людей)
Попробуйте 3 месяца — если нет эффекта, отменяйте
Безопасен, побочных эффектов практически нет

**Тренировочные правила для здоровья суставов:**
Разминка ОБЯЗАТЕЛЬНА: 5-10 минут общей + специальная разминка для целевых суставов
Избегайте полного разгибания (lockout) под тяжёлой нагрузкой — оставляйте микросгиб
Контролируйте эксцентрику (опускание) — рывки разрушают суставы быстрее всего
Прогрессия нагрузки: сухожилия адаптируются медленнее мышц (в 2-3 раза)

**Мобильность — ежедневно:**
Утренняя рутина мобильности 5-10 минут (кошка-корова, круговые движения суставами)
Перед тренировкой: динамическая разминка целевых суставов
После тренировки: статическая растяжка (30-60 сек на позицию)

**Хруст в суставах:**
Крепитация (хруст без боли) — обычно безобидна (пузырьки газа в синовиальной жидкости)
Хруст + боль или отёк — консультация врача обязательна
Скрип/треск при движении, который увеличивается — может быть признаком износа хряща

**Красные флаги (немедленно к врачу):**
Отёк сустава, который не проходит 48+ часов
Блокировка сустава (не может полностью согнуть/разогнуть)
Острая боль при обычном весе (не DOMS)
Нестабильность ("сустав подкашивается")
`;
}
export function getPostInjuryReturnAdv(message: string): string {
  const kw = ['возвращение после травмы', 'тренировки после травмы', 'реабилитация спорт'];
  if (!kw.some(k => message.toLowerCase().includes(k))) return '';
  return `
**Возвращение к тренировкам после травмы — пошаговый протокол:**

**Фаза 1: Острая (1-2 недели)**
Полный покой травмированной области
RICE/POLICE протокол: Protection, Optimal Loading, Ice, Compression, Elevation
Противовоспалительные (ибупрофен) первые 48-72 часа — далее НЕ рекомендуется (замедляет заживление)
НЕ растягивайте острую травму — это усугубит повреждение!
Можно: тренировать здоровые части тела ("work around, not through pain")

**Фаза 2: Реабилитация (2-8 недель)**
Постепенное введение движений с минимальной нагрузкой
Начните с изометрики (удержания без движения) → переходите к движению без веса → лёгкий вес
Шкала боли 0-10: работа при уровне 0-3 допустима, >3 = слишком рано
Увеличение нагрузки: не более +10% в неделю
Физиотерапия: если доступна — значительно ускоряет восстановление

**Фаза 3: Возвращение к тренировкам (2-4 недели)**
Начните с 50% от предтравменных рабочих весов
Прогрессия: 50% → 60% → 70% → 80% → 90% → 100% (каждые 3-5 дней)
Первые 2 недели: избегайте упражнений, вызвавших травму (замените на аналоги)
Слушайте тело: если "что-то не так" — отступите на шаг назад

**Принципы реабилитационной тренировки:**
"Work around, not through pain" — работайте ВОКРУГ боли, а не ЧЕРЕЗ неё
Травма колена? Тренируйте верх тела, делайте упражнения для ног без нагрузки на колено
Травма плеча? Тренируйте ноги, делайте жимы в безболезненном диапазоне
Поддерживайте общую форму — полный простой хуже, чем адаптированная тренировка

**Распространённые ошибки при возвращении:**
Слишком быстрое возвращение к прежним весам (→ повторная травма, часто тяжелее первой)
Полное прекращение тренировок на месяцы (потеря формы + психологический барьер)
Игнорирование боли "ну немного тянет, но терпимо" — боль = сигнал, слушайте его
Пропуск реабилитационных упражнений после того, как "уже не болит"
`;
}
