import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, AuthRequest } from '../middleware/auth';
import { FULL_KNOWLEDGE_BASE } from '../knowledge';

const router = Router();
const prisma = new PrismaClient();

const getAnthropicClient = () => {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

const SYSTEM_PROMPT = `Ты — Iron Coach, персональный ИИ-тренер мирового уровня в приложении Iron Gym. Ты сочетаешь глубокие научные знания с практическим опытом лучших тренеров мира.

## ТВОЯ ЛИЧНОСТЬ И СТИЛЬ

Ты — опытный тренер с 15+ годами стажа и образованием в области спортивной науки. Ты не робот и не ChatGPT — ты персональный наставник, который искренне заботится о прогрессе подопечного.

**Стиль общения:**
- Обращайся на "ты" — мы в зале, не на конференции
- Будь прямым и конкретным. Не лей воду. Дай чёткий ответ и объясни почему.
- Используй простой язык, но с научной базой. Не упрощай до потери смысла.
- Будь мотивирующим, но честным. Если человек делает ошибку — скажи прямо, но конструктивно.
- Добавляй практические примеры: "Например, вот как это выглядит на практике..."
- Если не знаешь ответ точно — честно скажи и дай общую рекомендацию
- Используй эмодзи умеренно, не злоупотребляй

**Тон:**
- Дружелюбный, но профессиональный
- Как тренер в зале: вежливый, но прямой
- Мотивирующий: подчёркивай успехи, подбадривай при трудностях
- Никогда не осуждай: если человек только начинает — поддержи

## ТВОИ ВОЗМОЖНОСТИ

1. **Программирование тренировок:** Составление полных программ под цели, уровень, доступное оборудование и время. Периодизация, выбор упражнений, объём, интенсивность.

2. **Питание и КБЖУ:** Расчёт калорий и макросов, составление рационов, рекомендации по добавкам, тайминг питания. Работа с набором массы, похудением, рекомпозицией.

3. **Техника упражнений:** Детальные инструкции, разбор ошибок, подводящие упражнения, альтернативы. Для любого упражнения — от базы до изоляции.

4. **Восстановление:** Сон, стресс-менеджмент, растяжка, мобильность, деload, профилактика перетренированности.

5. **Работа с травмами и ограничениями:** Адаптация программы при болях, ограничениях подвижности, хронических проблемах. ВАЖНО: при серьёзных жалобах ВСЕГДА рекомендуй обратиться к врачу/физиотерапевту.

6. **Мотивация и психология:** Помощь с плато, потерей мотивации, постановкой целей, формированием привычек.

## ПРАВИЛА ОТВЕТОВ

**Формат:**
- Структурируй ответы с подзаголовками, списками, выделением важного
- Для программ тренировок: таблицы или чёткие списки (упражнение × подходы × повторения)
- Давай конкретные числа: не "ешь больше белка", а "тебе нужно 160-180 г белка в день"
- Используй разделители для длинных ответов

**Персонализация:**
- ВСЕГДА учитывай данные пользователя: пол, возраст, вес, рост, цели, уровень, ограничения
- Если данных нет — спроси. Не давай общих советов без контекста.
- Адаптируй язык под уровень: новичку — проще, продвинутому — детальнее
- Учитывай активную программу пользователя при рекомендациях

**Безопасность:**
- При жалобах на ОСТРУЮ боль, онемение, хруст в суставах → рекомендуй обратиться к врачу/ортопеду
- Не диагностируй травмы. Ты тренер, не врач.
- При упоминании стероидов/фармакологии — предупреди о рисках, рекомендуй эндокринолога
- При признаках расстройства пищевого поведения — мягко порекомендуй специалиста

**Научная база:**
- Основывай рекомендации на текущих научных данных
- Если есть спорные данные — дай обе стороны аргумента
- Разоблачай мифы вежливо но уверенно

**Ограничения:**
- Не давай медицинских диагнозов
- Не рекомендуй конкретные лекарства (кроме витаминов и добавок)
- Не составляй планы для людей с серьёзными медицинскими противопоказаниями без рекомендации врача

## ШАБЛОНЫ ОТВЕТОВ

**При запросе программы тренировок:**
1. Уточни/подтверди: цель, уровень, дни в неделю, доступное оборудование
2. Дай программу в формате: День → Упражнение × Подходы × Повторения (отдых)
3. Объясни логику: почему эти упражнения, почему такой объём
4. Дай рекомендации по прогрессии
5. Укажи когда делать деload

**При запросе расчёта КБЖУ:**
1. Рассчитай TDEE по формуле Миффлина-Сан Жеора
2. Определи калории под цель
3. Распиши макросы: белок → жиры → углеводы (в этом порядке)
4. Дай 2-3 примера приёмов пищи
5. Укажи добавки при необходимости

**При вопросе о технике:**
1. Целевые мышцы
2. Установка (стартовая позиция) пошагово
3. Выполнение пошагово
4. Частые ошибки и как их исправить
5. Вариации и альтернативы

**При жалобе на боль/дискомфорт:**
1. Уточни: острая или хроническая, где именно, когда возникает
2. Если острая → ОБЯЗАТЕЛЬНО рекомендуй врача
3. Если хроническая/умеренная → дай рекомендации по модификации упражнений
4. Предложи альтернативные упражнения, не нагружающие проблемную зону
5. Дай упражнения на реабилитацию/укрепление (если уместно)`;

// Determine which knowledge chunks are relevant to the user's question
function getRelevantKnowledge(message: string): string {
  const lower = message.toLowerCase();
  const chunks: string[] = [];

  // Always include — compact version of key info
  // Training-related keywords
  const trainingKeywords = ['тренировк', 'программ', 'сплит', 'подход', 'повтор', 'объём', 'объем',
    'интенсивн', 'периодиз', 'деload', 'разгруз', 'разминк', 'частот', 'упражнен',
    'сет', 'rep', 'set', 'волум', 'прогресс', 'перегруз', 'сила', 'масс', 'гипертроф',
    'фулбоди', 'full body', 'upper', 'lower', 'push', 'pull', 'leg', '5/3/1', 'вендлер',
    'ppl', 'план', 'начать', 'новичок', 'начинающ'];
  if (trainingKeywords.some((k) => lower.includes(k))) {
    chunks.push('TRAINING_PRINCIPLES');
  }

  // Nutrition-related keywords
  const nutritionKeywords = ['питан', 'кбжу', 'калори', 'белок', 'протеин', 'жир', 'углевод',
    'диет', 'рацион', 'еда', 'продукт', 'добавк', 'креатин', 'витамин', 'supplement',
    'масс', 'сушк', 'похуде', 'набор', 'дефицит', 'профицит', 'bulk', 'cut', 'есть',
    'кушать', 'завтрак', 'обед', 'ужин', 'перекус', 'вода', 'гидрат', 'whey', 'казеин',
    'омега', 'omega', 'макро', 'нутр', 'меню', 'рассчит', 'считать'];
  if (nutritionKeywords.some((k) => lower.includes(k))) {
    chunks.push('NUTRITION');
  }

  // Exercise technique keywords
  const techniqueKeywords = ['техник', 'как делать', 'как правильно', 'выполнен', 'ошибк',
    'жим', 'присед', 'тяг', 'подтягив', 'curl', 'press', 'squat', 'deadlift', 'bench',
    'бицепс', 'трицепс', 'дельт', 'плеч', 'грудь', 'спин', 'ног', 'пресс', 'кор',
    'штанг', 'гантел', 'тренажёр', 'тренажер', 'блок', 'кабел', 'разводк', 'махи',
    'планк', 'скручиван', 'разгибан', 'сгибан', 'заменить', 'альтернат', 'чем заменить',
    'аналог', 'вариант', 'вариац'];
  if (techniqueKeywords.some((k) => lower.includes(k))) {
    chunks.push('EXERCISE_TECHNIQUE');
  }

  // Recovery keywords
  const recoveryKeywords = ['восстановлен', 'сон', 'спать', 'отдых', 'растяж', 'мобильн',
    'травм', 'боль', 'болит', 'дискомфорт', 'перетрен', 'стресс', 'усталос', 'утомлен',
    'алкогол', 'болезн', 'простуд', 'температур', 'плечо', 'колен', 'поясниц', 'спин',
    'локоть', 'сустав', 'связк', 'сухожил', 'foam roll', 'ролл', 'сауна', 'массаж',
    'разогрев', 'заминк', 'стретч', 'deload'];
  if (recoveryKeywords.some((k) => lower.includes(k))) {
    chunks.push('RECOVERY');
  }

  // Special populations / FAQ keywords
  const specialKeywords = ['новичок', 'начинающ', 'женщин', 'девушк', 'после 40', 'возраст',
    'миф', 'правда ли', 'вредно ли', 'можно ли', 'нужно ли', 'плато', 'стагнац',
    'результат', 'сколько времен', 'как быстро', 'одновременно',
    'рекомпозиц', 'пол', 'ягодиц', 'попа', 'вопрос'];
  if (specialKeywords.some((k) => lower.includes(k))) {
    chunks.push('SPECIAL_POPULATIONS');
  }

  // Cardio & conditioning keywords
  const cardioKeywords = ['кардио', 'бег', 'бегать', 'велосипед', 'плаван', 'hiit', 'интервал',
    'пульс', 'чсс', 'выносливос', 'аэроб', 'жиросжиган', 'сжигание жир', 'сжечь жир',
    'neat', 'шаги', 'ходьб', 'спринт', 'табата', 'круговая', 'скакалк', 'гребн',
    'эллипс', 'беговая', 'зона пульс', 'vo2', 'рефид', 'натощак'];
  if (cardioKeywords.some((k) => lower.includes(k))) {
    chunks.push('CARDIO');
  }

  // Sports physiology keywords
  const physiologyKeywords = ['мышц', 'волокн', 'анатом', 'физиолог', 'биомехан', 'гормон',
    'тестостерон', 'кортизол', 'инсулин', 'гормон роста', 'синтез белк', 'mps',
    'тип волокон', 'энергетическ', 'atp', 'гликолиз', 'креатинфосфат', 'пучок',
    'ротатор', 'лопатк', 'рычаг', 'длинн', 'коротк', 'антропометр',
    'широчайш', 'ромбовидн', 'трапец', 'квадрицепс', 'бицепс бедр', 'икроножн'];
  if (physiologyKeywords.some((k) => lower.includes(k))) {
    chunks.push('PHYSIOLOGY');
  }

  // Home & bodyweight keywords
  const homeKeywords = ['дом', 'домашн', 'без оборудован', 'без зала', 'собственн вес',
    'bodyweight', 'калистеник', 'отжиман', 'турник', 'брусья', 'резинк', 'эспандер',
    'гир', 'kettlebell', 'минимальн оборудов', 'без тренажёр', 'без тренажер',
    'trx', 'петл', 'кольц', 'скакалк', 'ролик для пресс'];
  if (homeKeywords.some((k) => lower.includes(k))) {
    chunks.push('HOME_BODYWEIGHT');
  }

  // Psychology & habits keywords
  const psychKeywords = ['мотивац', 'привычк', 'дисциплин', 'лен', 'не хочу', 'не могу',
    'заставить себя', 'бросить', 'пропустил', 'скучно', 'надоело', 'психолог',
    'цель', 'дневник', 'трекер', 'прогресс', 'ожидани', 'реалистичн', 'фрустрац',
    'сравнива', 'тело', 'body image', 'фото', 'измерени', 'smart', 'зачем',
    'как начать', 'начать заниматься', 'atomic', 'привычка'];
  if (psychKeywords.some((k) => lower.includes(k))) {
    chunks.push('PSYCHOLOGY');
  }

  return chunks.join(', ') || 'GENERAL';
}

// Chat with AI
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

    // Get user profile
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { healthRestrictions: true },
    });

    // Get recent chat history
    const history = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Get active program
    const activeProgram = await prisma.program.findFirst({
      where: { userId: req.userId, isActive: true },
      include: {
        workouts: {
          include: { exercises: { include: { exercise: true, sets: true } } },
        },
      },
    });

    // Get recent workout stats
    const recentWorkouts = await prisma.workout.findMany({
      where: {
        userId: req.userId,
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 5,
      include: {
        exercises: {
          include: { exercise: true, sets: true },
        },
      },
    });

    // Build user context
    let userContext = '';
    if (user) {
      const age = user.dateOfBirth
        ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      userContext = `\n## ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ
- Имя: ${user.firstName}
- Пол: ${user.gender === 'male' ? 'мужской' : user.gender === 'female' ? 'женский' : 'не указан'}
${age ? `- Возраст: ${age} лет` : ''}
- Рост: ${user.heightCm ? `${user.heightCm} см` : 'не указан'}
- Вес: ${user.weightKg ? `${user.weightKg} кг` : 'не указан'}
- Цель: ${user.goal ? ({
  weight_loss: 'похудение',
  muscle_gain: 'набор мышечной массы',
  strength: 'развитие силы',
  endurance: 'выносливость',
  flexibility: 'гибкость',
  general_fitness: 'общая физическая форма',
} as Record<string, string>)[user.goal] || user.goal : 'не указана'}
- Уровень подготовки: ${user.fitnessLevel ? ({
  beginner: 'новичок',
  intermediate: 'средний',
  advanced: 'продвинутый',
  expert: 'эксперт',
} as Record<string, string>)[user.fitnessLevel] || user.fitnessLevel : 'не указан'}
- Тренировочный стаж: ${user.trainingExperienceYears ? `${user.trainingExperienceYears} лет` : 'не указан'}
${user.healthRestrictions.length > 0 ? `- Ограничения здоровья: ${user.healthRestrictions.map((h) => `${h.bodyPart}: ${h.description} (${h.severity})`).join('; ')}` : '- Ограничений здоровья: нет'}`;
    }

    // Build program context
    let programContext = '\n## ТЕКУЩАЯ ПРОГРАММА\n';
    if (activeProgram) {
      programContext += `Активная программа: "${activeProgram.name}" (тип: ${activeProgram.type}, ${activeProgram.daysPerWeek} дней/нед, уровень: ${activeProgram.level || 'не указан'})\n`;
      if (activeProgram.workouts.length > 0) {
        programContext += 'Тренировки в программе:\n';
        activeProgram.workouts.forEach((w) => {
          programContext += `- ${w.name}: ${w.exercises.map((e) => `${e.exercise.name} ${e.sets.length}×${e.sets[0]?.reps || '?'}`).join(', ')}\n`;
        });
      }
    } else {
      programContext += 'Активной программы нет.\n';
    }

    // Build recent workout stats
    let statsContext = '';
    if (recentWorkouts.length > 0) {
      statsContext = '\n## ПОСЛЕДНИЕ ТРЕНИРОВКИ\n';
      recentWorkouts.slice(0, 3).forEach((w) => {
        const date = w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '';
        const totalVolume = w.exercises.reduce((sum, ex) =>
          sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0);
        statsContext += `- ${date}: ${w.name}, ${w.durationMinutes || '?'} мин, объём ${Math.round(totalVolume)} кг\n`;
      });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { role: 'user', content: message, userId: req.userId! },
    });

    // Build conversation messages
    const messages = history
      .reverse()
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    messages.push({ role: 'user', content: message });

    // Determine relevant knowledge based on user message
    const relevantTopics = getRelevantKnowledge(message);

    // Call Claude with full knowledge base
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: FULL_KNOWLEDGE_BASE,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: `${userContext}\n${programContext}\n${statsContext}\n\nРелевантные темы запроса: ${relevantTopics}`,
        },
      ],
      messages,
    });

    const aiContent = response.content[0].type === 'text' ? response.content[0].text : '';

    // Save AI response
    await prisma.chatMessage.create({
      data: { role: 'assistant', content: aiContent, userId: req.userId! },
    });

    res.json({ message: aiContent });
  } catch (e) {
    console.error('AI Chat error:', e);
    res.status(500).json({ error: 'Ошибка ИИ-ассистента' });
  }
});

// Analyze food photo
router.post('/analyze-food', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Изображение обязательно' });

    // Get user info for personalized analysis
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    const userInfo = user
      ? `Пользователь: ${user.gender === 'male' ? 'мужчина' : user.gender === 'female' ? 'женщина' : ''}, ${user.weightKg ? `вес ${user.weightKg} кг` : ''}, цель: ${user.goal || 'не указана'}.`
      : '';

    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `Ты — эксперт-нутрициолог. Проанализируй фото еды максимально точно.

${userInfo}

Для КАЖДОГО продукта на фото определи:
1. Название продукта (на русском)
2. Примерный вес в граммах (оценивай по размеру тарелки/порции)
3. Калорийность (ккал)
4. Белки (г)
5. Жиры (г)
6. Углеводы (г)

Используй стандартные значения КБЖУ из российских таблиц калорийности.
Будь точным в оценке размера порции — это критически важно.

Ответь СТРОГО в формате JSON:
{
  "items": [
    {
      "name": "название продукта",
      "weightGrams": 150,
      "calories": 200,
      "protein": 30,
      "fats": 5,
      "carbs": 10
    }
  ]
}

Только JSON, без комментариев и пояснений.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Не удалось распознать еду' });
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (e) {
    console.error('Food analysis error:', e);
    res.status(500).json({ error: 'Ошибка анализа фото' });
  }
});

// Get chat history
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения истории чата' });
  }
});

export { router as aiRouter };
