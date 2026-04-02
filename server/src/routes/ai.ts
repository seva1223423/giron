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

7. **Здоровье и биомаркеры:** Интерпретация анализов, рекомендации по микронутриентам, адаптогены, воспаление. Рассматривай здоровье, тренировки и питание как единую систему.

## ИНТЕГРИРОВАННЫЙ ПОДХОД

**Ключевой принцип:** Всегда рассматривай здоровье, тренировки и питание как взаимосвязанную систему, а не отдельные темы.

- При вопросе о тренировках — учитывай питание и восстановление
- При вопросе о питании — учитывай тренировочную фазу и гормональный контекст
- При вопросе о здоровье — связывай с тренировочным планом и рационом
- Используй оценку готовности (сон + стресс + питание) для корректировки плана

## ДЕЙСТВИЯ (TOOLS)

У тебя есть возможность реально изменять данные пользователя в приложении:
- **update_user_profile** — обновить вес, рост, цель, уровень подготовки
- **log_body_weight** — записать замер веса тела
- **create_workout** — создать тренировку и добавить её в план
- **update_nutrition_targets** — установить дневные нормы КБЖУ (калории, белки, жиры, углеводы)
- **log_meal** — записать приём пищи в дневник питания
- **log_water** — записать выпитую воду в дневник
- **delete_meal** — удалить приём пищи из дневника (при ошибке или по запросу пользователя)

Используй эти инструменты когда:
- Пользователь сообщает свой актуальный вес ("сегодня вешу 85 кг") → log_body_weight + update_user_profile
- Пользователь хочет изменить цель тренировок → update_user_profile
- Пользователь просит составить конкретную тренировку → create_workout
- После составления программы — создай первую тренировку сразу
- Пользователь просит рассчитать КБЖУ/калории или установить нормы питания → рассчитай TDEE и вызови update_nutrition_targets
- При изменении цели (похудение/набор) → update_nutrition_targets с пересчитанными нормами
- Пользователь сообщает что поел ("съел 200г гречки и куриную грудку") → log_meal с рассчитанным КБЖУ
- Пользователь просит записать еду/приём пищи → log_meal
- Пользователь хочет удалить/отменить записанный приём пищи → найди его id в разделе "ПИТАНИЕ СЕГОДНЯ" и вызови delete_meal
- Пользователь сообщает что выпил воду/чай/кофе → log_water с количеством в мл

После использования инструмента — не упоминай технические детали, просто подтверди действие в тексте: "Записал твой вес — 85 кг" или "Создал тренировку — она уже в твоём плане".

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
- Основывай рекомендации на текущих научных данных из базы знаний
- Если есть спорные данные — дай обе стороны аргумента
- Разоблачай мифы вежливо но уверенно

**Ограничения:**
- Не давай медицинских диагнозов
- Не рекомендуй конкретные лекарства (кроме витаминов и добавок)
- Не составляй планы для людей с серьёзными медицинскими противопоказаниями без рекомендации врача

## РОССИЙСКИЙ КОНТЕКСТ

Ты работаешь с российскими пользователями. Это значит:
- **Все ответы — только на русском языке**
- Единицы: кг, см, ккал (никаких фунтов, дюймов, калорий в kcal как единице)
- Добавки: ориентируйся на то, что доступно в России (протеин, креатин, омега-3, витамин D, магний, цинк, BCAA и т.п.)
- Новости и примеры: российские атлеты и соревнования — Чемпионаты России, РФС, ФПРС, ФБР, IPF-Russia, МСМК
- При рекомендации специалиста: говори "обратись к спортивному врачу / ортопеду" — не "see a doctor"
- Питание: знай российские продукты, типичные блюда (гречка, творог, куриная грудка, кефир, борщ), российские КБЖУ-таблицы

## ШАБЛОНЫ ОТВЕТОВ

**При запросе программы тренировок:**
1. Уточни/подтверди: цель, уровень, дни в неделю, доступное оборудование
2. Дай программу в формате: День → Упражнение × Подходы × Повторения (отдых)
3. Объясни логику: почему эти упражнения, почему такой объём
4. Дай рекомендации по прогрессии
5. Укажи когда делать деload
6. Создай первую тренировку через инструмент create_workout

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

// AI tools that Iron Coach can call to modify user data
const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_user_profile',
    description: 'Обновить профиль пользователя. Используй когда пользователь сообщает новый вес тела, рост, хочет изменить цель тренировок или уровень подготовки. Можно обновлять одно или несколько полей.',
    input_schema: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Вес тела в кг' },
        heightCm: { type: 'number', description: 'Рост в см' },
        goal: {
          type: 'string',
          enum: ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS'],
          description: 'Тренировочная цель',
        },
        fitnessLevel: {
          type: 'string',
          enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
          description: 'Уровень подготовки',
        },
      },
    },
  },
  {
    name: 'log_body_weight',
    description: 'Записать замер веса тела. Используй когда пользователь сообщает свой текущий вес. Автоматически также обновляет вес в профиле.',
    input_schema: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Вес тела в кг' },
        date: { type: 'string', description: 'Дата в формате YYYY-MM-DD (по умолчанию сегодня)' },
      },
      required: ['weightKg'],
    },
  },
  {
    name: 'create_workout',
    description: 'Создать тренировку и добавить её в план пользователя. Используй когда составляешь конкретную тренировку по запросу. Упражнения ищутся по названию в базе данных.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Название тренировки (например "День ног", "Верх тела A", "Full Body")' },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exerciseName: { type: 'string', description: 'Название упражнения на русском или английском' },
              sets: { type: 'number', description: 'Количество подходов' },
              reps: { type: 'number', description: 'Количество повторений' },
              weight: { type: 'number', description: 'Вес в кг (если применимо)' },
              restSeconds: { type: 'number', description: 'Отдых между подходами в секундах' },
            },
            required: ['exerciseName', 'sets', 'reps'],
          },
          description: 'Список упражнений тренировки',
        },
      },
      required: ['name', 'exercises'],
    },
  },
  {
    name: 'update_nutrition_targets',
    description: 'Установить дневные нормы КБЖУ пользователя. Используй когда рассчитываешь TDEE и макросы по запросу или когда пользователь просит изменить нормы питания. Рассчитай точные значения на основе профиля и цели, затем вызови этот инструмент.',
    input_schema: {
      type: 'object',
      properties: {
        calories: { type: 'number', description: 'Дневная норма калорий в ккал' },
        protein: { type: 'number', description: 'Дневная норма белка в граммах' },
        fats: { type: 'number', description: 'Дневная норма жиров в граммах' },
        carbs: { type: 'number', description: 'Дневная норма углеводов в граммах' },
      },
      required: ['calories', 'protein', 'fats', 'carbs'],
    },
  },
  {
    name: 'log_water',
    description: 'Записать выпитую воду в дневник пользователя. Используй когда пользователь сообщает что выпил воду или другой напиток (чай, кофе считаются). 1 стакан ≈ 250 мл, 1 бутылка ≈ 500 мл.',
    input_schema: {
      type: 'object',
      properties: {
        ml: { type: 'number', description: 'Количество воды в миллилитрах' },
      },
      required: ['ml'],
    },
  },
  {
    name: 'delete_meal',
    description: 'Удалить приём пищи из дневника питания. Используй когда пользователь хочет отменить или удалить ранее записанный приём пищи (например "удали завтрак", "убери последний перекус", "я не ел это"). ID приёма берётся из контекста питания сегодня.',
    input_schema: {
      type: 'object',
      properties: {
        mealId: { type: 'string', description: 'ID приёма пищи из списка "ПИТАНИЕ СЕГОДНЯ"' },
      },
      required: ['mealId'],
    },
  },
  {
    name: 'log_meal',
    description: 'Записать приём пищи в дневник питания пользователя. Используй когда пользователь сообщает что поел или просит записать еду. Рассчитай КБЖУ для каждого продукта на основе указанного веса. Если вес не указан — используй стандартную порцию.',
    input_schema: {
      type: 'object',
      properties: {
        mealType: {
          type: 'string',
          enum: ['breakfast', 'lunch', 'dinner', 'snack'],
          description: 'Тип приёма пищи: breakfast (завтрак), lunch (обед), dinner (ужин), snack (перекус)',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Название продукта' },
              weightGrams: { type: 'number', description: 'Вес порции в граммах' },
              calories: { type: 'number', description: 'Калорийность данной порции в ккал' },
              protein: { type: 'number', description: 'Белки данной порции в граммах' },
              fats: { type: 'number', description: 'Жиры данной порции в граммах' },
              carbs: { type: 'number', description: 'Углеводы данной порции в граммах' },
            },
            required: ['name', 'weightGrams', 'calories', 'protein', 'fats', 'carbs'],
          },
          description: 'Список продуктов в приёме пищи с КБЖУ',
        },
      },
      required: ['mealType', 'items'],
    },
  },
];

// Keyword mappings — module-level constant (computed once, not per-request)
const KEYWORD_MAPPINGS: Array<[string, string[]]> = [
  ['TRAINING_PRINCIPLES', [
    'тренировк', 'программ', 'сплит', 'подход', 'повтор', 'объём', 'объем',
    'интенсивн', 'периодиз', 'деload', 'разгруз', 'разминк', 'частот', 'упражнен',
    'сет', 'rep', 'set', 'волум', 'прогресс', 'перегруз', 'сила', 'масс', 'гипертроф',
    'фулбоди', 'full body', 'upper', 'lower', 'push', 'pull', 'leg', '5/3/1', 'вендлер',
    'ppl', 'план', 'начать', 'новичок', 'начинающ',
  ]],
  ['NUTRITION', [
    'питан', 'кбжу', 'калори', 'белок', 'протеин', 'жир', 'углевод',
    'диет', 'рацион', 'еда', 'продукт', 'добавк', 'креатин', 'supplement',
    'масс', 'сушк', 'похуде', 'набор', 'дефицит', 'профицит', 'bulk', 'cut', 'есть',
    'кушать', 'завтрак', 'обед', 'ужин', 'перекус', 'вода', 'гидрат', 'whey', 'казеин',
    'омега', 'omega', 'макро', 'нутр', 'меню', 'рассчит', 'считать',
  ]],
  ['EXERCISE_TECHNIQUE', [
    'техник', 'как делать', 'как правильно', 'выполнен', 'ошибк',
    'жим', 'присед', 'тяг', 'подтягив', 'curl', 'press', 'squat', 'deadlift', 'bench',
    'бицепс', 'трицепс', 'дельт', 'плеч', 'грудь', 'спин', 'ног', 'пресс', 'кор',
    'штанг', 'гантел', 'тренажёр', 'тренажер', 'блок', 'кабел', 'разводк', 'махи',
    'планк', 'скручиван', 'разгибан', 'сгибан', 'заменить', 'альтернат', 'чем заменить',
    'аналог', 'вариант', 'вариац',
  ]],
  ['RECOVERY', [
    'восстановлен', 'сон', 'спать', 'отдых', 'растяж', 'мобильн',
    'травм', 'боль', 'болит', 'дискомфорт', 'перетрен', 'стресс', 'усталос', 'утомлен',
    'алкогол', 'болезн', 'простуд', 'температур', 'плечо', 'колен', 'поясниц',
    'локоть', 'сустав', 'связк', 'сухожил', 'foam roll', 'ролл', 'сауна', 'массаж',
    'разогрев', 'заминк', 'стретч', 'deload',
  ]],
  ['SPECIAL_POPULATIONS', [
    'новичок', 'начинающ', 'женщин', 'девушк', 'после 40', 'возраст',
    'миф', 'правда ли', 'вредно ли', 'можно ли', 'нужно ли', 'плато', 'стагнац',
    'результат', 'сколько времен', 'как быстро', 'одновременно',
    'рекомпозиц', 'ягодиц', 'попа', 'вопрос',
  ]],
  ['CARDIO', [
    'кардио', 'бег', 'бегать', 'велосипед', 'плаван', 'hiit', 'интервал',
    'пульс', 'чсс', 'выносливос', 'аэроб', 'жиросжиган', 'сжигание жир', 'сжечь жир',
    'neat', 'шаги', 'ходьб', 'спринт', 'табата', 'круговая', 'скакалк', 'гребн',
    'эллипс', 'беговая', 'зона пульс', 'vo2', 'рефид', 'натощак',
  ]],
  ['PHYSIOLOGY', [
    'мышц', 'волокн', 'анатом', 'физиолог', 'биомехан', 'гормон роста', 'синтез белк', 'mps',
    'тип волокон', 'энергетическ', 'atp', 'гликолиз', 'креатинфосфат', 'пучок',
    'ротатор', 'лопатк', 'рычаг', 'антропометр',
    'широчайш', 'ромбовидн', 'трапец', 'квадрицепс', 'бицепс бедр', 'икроножн',
  ]],
  ['HOME_BODYWEIGHT', [
    'дом', 'домашн', 'без оборудован', 'без зала', 'собственн вес',
    'bodyweight', 'калистеник', 'отжиман', 'турник', 'брусья', 'резинк', 'эспандер',
    'гир', 'kettlebell', 'минимальн оборудов', 'без тренажёр', 'без тренажер',
    'trx', 'петл', 'кольц', 'ролик для пресс',
  ]],
  ['PSYCHOLOGY', [
    'мотивац', 'привычк', 'дисциплин', 'лен', 'не хочу', 'не могу',
    'заставить себя', 'бросить', 'пропустил', 'скучно', 'надоело', 'психолог',
    'цель', 'дневник', 'трекер', 'ожидани', 'реалистичн', 'фрустрац',
    'сравнива', 'body image', 'smart', 'зачем',
    'как начать', 'начать заниматься', 'atomic', 'привычка',
  ]],
  ['HEALTH_BIOMARKERS', [
    'анализ', 'биомаркер', 'тестостерон', 'кортизол', 'гемоглобин', 'ферритин',
    'ттг', 'щитовидн', 'инсулин', 'глюкоз', 'hba1c', 'холестерин', 'липид',
    'витамин d', 'магний', 'цинк', 'железо', 'кальций', 'омега-3', 'omega-3',
    'воспален', 'crp', 'микронутриент', 'анемия', 'иммун', 'hrv', 'всс', 'всрс',
    'ашваганда', 'адаптоген', 'родиол', 'куркум', 'антиоксидант', 'антивоспал',
    'инсулинорезист', 'метаболическ', 'кишечник', 'микробиом', 'пробиотик',
    'дефицит витамин', 'сдать анализ', 'кровь', 'биохими',
  ]],
  ['INTEGRATED_APPROACH', [
    'комплексн', 'интеграц', 'система', 'всё вместе', 'одновременно',
    'рекомпозиц', 'готовность', 'готов к тренировке', 'стоит ли тренироваться',
    'гормональн', 'тестостерон кортизол', 'периодизация питан', 'тайминг',
    'адаптац', 'уравнение', 'мультипликатор', 'оценить состояние',
    'суставы питание', 'коллаген', 'сухожил',
  ]],
  ['POWERLIFTING', [
    'пауэрлифтинг', 'powerlifting', 'соревнован', 'федераци', 'фпрс', 'wrpf', 'ipf',
    'шейко', 'смолов', 'smolov', 'sheiko', 'nsuns', '5/3/1', 'вендлер', 'wendler',
    'конъюгат', 'cube method', 'пиковый', 'peak', 'equipped', 'raw', 'экипировка',
    'weight cut', 'срезка веса', 'категори', 'вилкс', 'wilks', 'dots', 'ipf points',
    'сарычев', 'шерипов', 'присед соревн', 'жим соревн', 'тяга соревн',
    'экипировочн', 'безэкипировочн', 'монолифт', 'пояс', 'бинты', 'коленные',
  ]],
  ['ADVANCED_TECHNIQUES', [
    'myoreps', 'мио-репы', 'мио репы', 'rest-pause', 'рест пауза', 'bfr', 'окклюзи',
    'дроп-сет', 'дропсет', 'drop set', 'суперсет', 'superset', 'гигантский сет',
    'кластерный', 'cluster', 'механическ дроп', 'пауза', 'темп', 'tut', 'время под нагруз',
    'pap', 'post-activation', 'контрастн', 'par', 'частичн повтор', 'pin press',
    'dup', 'daily undulat', 'блоковая периодиз', 'block periodiz',
    'плато пробить', 'застрял', 'не растёт', 'продвинутые техник',
    'rir', 'rpe субъективн', 'отказ', 'тренировка до отказа',
  ]],
  ['SUPPLEMENTS_DETAILED', [
    'добавк', 'supplement', 'протеин марк', 'сывороточн', 'whey', 'казеин',
    'креатин моногидрат', 'creapure', 'загрузка креатином',
    'кофеин доз', 'предтрен', 'pre-workout',
    'омега-3', 'omega-3', 'epa', 'dha', 'рыбий жир',
    'витамин d3', 'k2', 'mk-7',
    'магний глицинат', 'малат', 'l-треонат',
    'коллаген', 'витамин c', 'tendon',
    'цитруллин малат', 'citrulline', 'beta-alanine', 'бета-аланин',
    'ашваганда', 'ksm-66', 'ashwagandha', 'адаптоген',
    'issn', 'grade a', 'лейцин', 'leucine',
    'bcaa', 'eaa', 'незаменим аминокислот',
    'спортивн питан', 'российск протеин', 'geneticlab', 'bsn', 'optimum',
  ]],
  ['WOMENS_PROGRAMMING', [
    'женщин', 'девушк', 'женск', 'female', 'girl',
    'менструальн', 'цикл', 'месячн', 'фолликулярн', 'лютеинов', 'овуляц',
    'пмс', 'premenstrual', 'ягодичн', 'попа', 'glute', 'бёдр',
    'беременн', 'после родов', 'менопауз', 'перименопауз',
    'эстроген', 'прогестерон', 'красивая фигур', 'подтянут', 'рельефн',
    'тонус', 'девушке', 'для женщин', 'женский организм', 'гормон',
    'acl', 'колен', 'тазовое дно', 'кегель', 'диастаз',
    'жировые отложения бёдра', 'феминн', 'шейп',
  ]],
  ['CUTTING_BULKING', [
    'сушк', 'набор масс', 'булк', 'bulk', 'cut', 'cutting', 'bulking',
    'дефицит', 'профицит', 'lean bulk', 'dirty bulk',
    'рефид', 'refeed', 'diet break', 'диетическ пауз',
    'обратная диета', 'reverse diet', 'метаболическ адаптац',
    'жиросжиган', 'рекомпозиц', 'одновременно мышцы и жир',
    'процент жира', '% жира', 'когда начат сушку', 'когда начат набор',
    'сколько есть', 'сколько калорий', 'рассчит калори',
    'углеводное цикл', 'carb cycling', 'if', 'интервальн голодан', '16:8',
    'скорость похудени', 'скорость набора', 'набрать без жира',
    'похудеть без потери мышц', 'сохранить мышцы на сушке',
  ]],
];

// Determine which knowledge chunks are relevant to the user's question
function getRelevantKnowledge(message: string): string {
  const lower = message.toLowerCase();
  const chunks = KEYWORD_MAPPINGS
    .filter(([, keywords]) => keywords.some((k) => lower.includes(k)))
    .map(([module]) => module);
  return chunks.join(', ') || 'GENERAL';
}

// Execute an AI tool call and return the result string + performed action info
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
): Promise<{ resultText: string; actionDescription: string; actionData?: Record<string, unknown> }> {
  if (toolName === 'update_user_profile') {
    const { weightKg, heightCm, goal, fitnessLevel } = toolInput as {
      weightKg?: number;
      heightCm?: number;
      goal?: string;
      fitnessLevel?: string;
    };

    const updateData: Record<string, unknown> = {};
    if (weightKg !== undefined) updateData.weightKg = weightKg;
    if (heightCm !== undefined) updateData.heightCm = heightCm;
    if (goal !== undefined) updateData.goal = goal;
    if (fitnessLevel !== undefined) updateData.fitnessLevel = fitnessLevel;

    await prisma.user.update({ where: { id: userId }, data: updateData });

    const parts: string[] = [];
    if (weightKg !== undefined) parts.push(`вес ${weightKg} кг`);
    if (heightCm !== undefined) parts.push(`рост ${heightCm} см`);
    if (goal !== undefined) parts.push(`цель обновлена`);
    if (fitnessLevel !== undefined) parts.push(`уровень обновлён`);

    return {
      resultText: `Профиль обновлён: ${parts.join(', ')}`,
      actionDescription: `Профиль обновлён: ${parts.join(', ')}`,
    };
  }

  if (toolName === 'log_body_weight') {
    const { weightKg, date } = toolInput as { weightKg: number; date?: string };
    const logDate = date ? new Date(date) : new Date();
    logDate.setHours(0, 0, 0, 0);

    await prisma.bodyWeight.upsert({
      where: { userId_date: { userId, date: logDate } },
      create: { userId, weightKg, date: logDate },
      update: { weightKg },
    });

    // Also update profile weight
    await prisma.user.update({ where: { id: userId }, data: { weightKg } });

    return {
      resultText: `Вес записан: ${weightKg} кг`,
      actionDescription: `Вес ${weightKg} кг записан в дневник`,
    };
  }

  if (toolName === 'create_workout') {
    const { name, exercises } = toolInput as {
      name: string;
      exercises: Array<{
        exerciseName: string;
        sets: number;
        reps: number;
        weight?: number;
        restSeconds?: number;
      }>;
    };

    // Find exercises in DB (case-insensitive partial match)
    const exerciseRecords = await Promise.all(
      exercises.map(async (ex) => {
        const found = await prisma.exercise.findFirst({
          where: { name: { contains: ex.exerciseName, mode: 'insensitive' } },
        });
        return { input: ex, record: found };
      }),
    );

    const validExercises = exerciseRecords.filter((e) => e.record !== null);

    if (validExercises.length === 0) {
      return {
        resultText: 'Упражнения не найдены в базе данных',
        actionDescription: 'Тренировка не создана — упражнения не найдены',
      };
    }

    const workout = await prisma.workout.create({
      data: {
        name,
        userId,
        createdAt: new Date(),
        exercises: {
          create: validExercises.map((ex, idx) => ({
            order: idx + 1,
            restSeconds: ex.input.restSeconds ?? 90,
            exerciseId: ex.record!.id,
            sets: {
              create: Array.from({ length: ex.input.sets }, (_, i) => ({
                setNumber: i + 1,
                reps: ex.input.reps,
                weight: ex.input.weight ?? null,
              })),
            },
          })),
        },
      },
    });

    const foundNames = validExercises.map((e) => e.record!.name).join(', ');
    return {
      resultText: `Тренировка "${workout.name}" создана с упражнениями: ${foundNames}`,
      actionDescription: `Тренировка "${name}" добавлена в план (${validExercises.length} упражнений)`,
    };
  }

  if (toolName === 'log_meal') {
    const { mealType, items } = toolInput as {
      mealType: string;
      items: Array<{
        name: string;
        weightGrams: number;
        calories: number;
        protein: number;
        fats: number;
        carbs: number;
      }>;
    };

    const totalCalories = items.reduce((s, i) => s + i.calories, 0);
    const totalProtein = items.reduce((s, i) => s + i.protein, 0);
    const totalFats = items.reduce((s, i) => s + i.fats, 0);
    const totalCarbs = items.reduce((s, i) => s + i.carbs, 0);

    await prisma.meal.create({
      data: {
        type: mealType,
        userId,
        totalCalories,
        totalProtein,
        totalFats,
        totalCarbs,
        items: {
          create: items.map((i) => ({
            name: i.name,
            calories: i.calories,
            protein: i.protein,
            fats: i.fats,
            carbs: i.carbs,
            weightGrams: i.weightGrams,
          })),
        },
      },
    });

    const MEAL_LABELS: Record<string, string> = {
      breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
    };
    const label = MEAL_LABELS[mealType] || mealType;
    const itemSummary = items.map((i) => `${i.name} ${i.weightGrams}г`).join(', ');
    const description = `${label} записан: ${itemSummary} — ${Math.round(totalCalories)} ккал`;

    return {
      resultText: `Приём пищи "${label}" добавлен: ${itemSummary}. Итого: ${Math.round(totalCalories)} ккал, Б${Math.round(totalProtein)}г, Ж${Math.round(totalFats)}г, У${Math.round(totalCarbs)}г`,
      actionDescription: description,
      actionData: { mealType, totalCalories: Math.round(totalCalories) },
    };
  }

  if (toolName === 'log_water') {
    const { ml } = toolInput as { ml: number };
    const amount = Math.round(ml);
    return {
      resultText: `Записано ${amount} мл воды`,
      actionDescription: `+${amount} мл воды`,
      actionData: { ml: amount },
    };
  }

  if (toolName === 'delete_meal') {
    const { mealId } = toolInput as { mealId: string };

    const meal = await prisma.meal.findFirst({ where: { id: mealId, userId } });
    if (!meal) {
      return { resultText: 'Приём пищи не найден или уже удалён', actionDescription: '' };
    }

    await prisma.meal.delete({ where: { id: mealId } });

    const MEAL_LABELS: Record<string, string> = {
      breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
    };
    const label = MEAL_LABELS[meal.type] || meal.type;
    const description = `${label} удалён (${Math.round(meal.totalCalories)} ккал)`;

    return {
      resultText: `${label} удалён из дневника питания`,
      actionDescription: description,
      actionData: { mealId, mealType: meal.type },
    };
  }

  if (toolName === 'update_nutrition_targets') {
    const { calories, protein, fats, carbs } = toolInput as {
      calories: number;
      protein: number;
      fats: number;
      carbs: number;
    };

    const cal = Math.round(calories);
    const prot = Math.round(protein);
    const fat = Math.round(fats);
    const carb = Math.round(carbs);

    const description = `Нормы КБЖУ: ${cal} ккал / Б${prot}г / Ж${fat}г / У${carb}г`;

    return {
      resultText: `Нормы КБЖУ установлены: ${cal} ккал, белок ${prot}г, жиры ${fat}г, углеводы ${carb}г`,
      actionDescription: description,
      actionData: { calories: cal, protein: prot, fats: fat, carbs: carb },
    };
  }

  return { resultText: 'Неизвестный инструмент', actionDescription: '' };
}

// Chat with AI
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { message, nutritionTargets, waterMl } = req.body as {
      message: string;
      nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number };
      waterMl?: number;
    };
    if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

    const userId = req.userId!;

    // Get user profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { healthRestrictions: true },
    });

    // Get recent chat history
    const history = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Get active program
    const activeProgram = await prisma.program.findFirst({
      where: { userId, isActive: true },
      include: {
        workouts: {
          include: { exercises: { include: { exercise: true, sets: true } } },
        },
      },
    });

    // Get recent workout stats
    const recentWorkouts = await prisma.workout.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 5,
      include: { exercises: { include: { exercise: true, sets: true } } },
    });

    // Get body weight history
    const bodyWeightHistory = await prisma.bodyWeight.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 10,
    });

    // Get today's meals
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayMeals = await prisma.meal.findMany({
      where: { userId, createdAt: { gte: todayStart, lte: todayEnd } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    // Build user context
    let userContext = '';
    if (user) {
      const age = user.dateOfBirth
        ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      userContext = `\n## ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ
- Имя: ${user.firstName}
- Пол: ${user.gender === 'MALE' ? 'мужской' : user.gender === 'FEMALE' ? 'женский' : 'не указан'}
${age ? `- Возраст: ${age} лет` : ''}
- Рост: ${user.heightCm ? `${user.heightCm} см` : 'не указан'}
- Вес: ${user.weightKg ? `${user.weightKg} кг` : 'не указан'}
- Цель: ${user.goal ? ({
        WEIGHT_LOSS: 'похудение',
        MUSCLE_GAIN: 'набор мышечной массы',
        STRENGTH: 'развитие силы',
        ENDURANCE: 'выносливость',
        FLEXIBILITY: 'гибкость',
        GENERAL_FITNESS: 'общая физическая форма',
      } as Record<string, string>)[user.goal] || user.goal : 'не указана'}
- Уровень подготовки: ${user.fitnessLevel ? ({
        BEGINNER: 'новичок',
        INTERMEDIATE: 'средний',
        ADVANCED: 'продвинутый',
        EXPERT: 'эксперт',
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
      recentWorkouts.forEach((w) => {
        const date = w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '';
        const totalVolume = w.exercises.reduce((sum, ex) =>
          sum + ex.sets.filter((s) => s.completed).reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0), 0);
        statsContext += `- ${date}: ${w.name}, ${w.durationMinutes || '?'} мин, объём ${Math.round(totalVolume)} кг\n`;
      });

      // Build per-exercise progression for key compound lifts
      // Group sets by exercise across all recent workouts
      const exerciseHistory: Record<string, { name: string; sessions: Array<{ date: string; maxWeight: number; totalReps: number; sets: number }> }> = {};
      for (const w of recentWorkouts) {
        const date = w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '';
        for (const ex of w.exercises) {
          const id = ex.exerciseId;
          const completedSets = ex.sets.filter((s) => s.completed && (s.weight || 0) > 0);
          if (completedSets.length === 0) continue;
          const maxWeight = Math.max(...completedSets.map((s) => s.weight || 0));
          const totalReps = completedSets.reduce((sum, s) => sum + (s.reps || 0), 0);
          if (!exerciseHistory[id]) {
            exerciseHistory[id] = { name: ex.exercise.name, sessions: [] };
          }
          exerciseHistory[id].sessions.push({ date, maxWeight, totalReps, sets: completedSets.length });
        }
      }

      // Show progression for exercises with ≥2 sessions (meaningful trend)
      const progressionLines: string[] = [];
      for (const { name, sessions } of Object.values(exerciseHistory)) {
        if (sessions.length < 2) continue;
        const trend = sessions.map((s) => `${s.date}: ${s.maxWeight}кг×${s.sets}п`).join(' → ');
        // Detect plateau: same maxWeight in last 2+ sessions
        const last2 = sessions.slice(0, 2);
        const plateau = last2.length === 2 && last2[0].maxWeight === last2[1].maxWeight ? ' [плато]' : '';
        const progress = sessions[0].maxWeight > sessions[sessions.length - 1].maxWeight ? ' [прогресс ↑]' : '';
        progressionLines.push(`- ${name}: ${trend}${plateau}${progress}`);
      }
      if (progressionLines.length > 0) {
        statsContext += '\n## ПРОГРЕСС ПО УПРАЖНЕНИЯМ\n';
        statsContext += progressionLines.join('\n') + '\n';
      }
    }

    // Build body weight trend
    if (bodyWeightHistory.length > 0) {
      statsContext += '\n## ДИНАМИКА ВЕСА ТЕЛА\n';
      const entries = bodyWeightHistory.slice(0, 10).reverse(); // oldest first
      const weights = entries.map((e) => e.weightKg);
      const oldest = weights[0];
      const newest = weights[weights.length - 1];
      const delta = newest - oldest;
      const trend = Math.abs(delta) < 0.3 ? 'стабильный' : delta > 0 ? `+${delta.toFixed(1)} кг (рост)` : `${delta.toFixed(1)} кг (снижение)`;
      statsContext += `Последние записи: ${entries.map((e) => `${new Date(e.date).toLocaleDateString('ru-RU')}: ${e.weightKg} кг`).join(', ')}\n`;
      statsContext += `Тренд: ${trend}\n`;
    }

    // Build today's nutrition context
    if (nutritionTargets) {
      statsContext += '\n## НОРМЫ ПИТАНИЯ (ЦЕЛИ ПОЛЬЗОВАТЕЛЯ)\n';
      statsContext += `Калории: ${nutritionTargets.calories} ккал | Белок: ${nutritionTargets.protein}г | Жиры: ${nutritionTargets.fats}г | Углеводы: ${nutritionTargets.carbs}г | Вода: ${nutritionTargets.waterTargetMl} мл\n`;
      if (waterMl !== undefined) {
        const waterLeft = Math.max(0, nutritionTargets.waterTargetMl - waterMl);
        statsContext += `Вода выпита сегодня: ${waterMl} мл из ${nutritionTargets.waterTargetMl} мл (осталось ${waterLeft} мл)\n`;
      }
    }

    if (todayMeals.length > 0) {
      const MEAL_TYPE_LABELS: Record<string, string> = {
        breakfast: 'Завтрак',
        lunch: 'Обед',
        dinner: 'Ужин',
        snack: 'Перекус',
      };
      const totalCal = todayMeals.reduce((s, m) => s + m.totalCalories, 0);
      const totalProt = todayMeals.reduce((s, m) => s + m.totalProtein, 0);
      const totalFats = todayMeals.reduce((s, m) => s + m.totalFats, 0);
      const totalCarbs = todayMeals.reduce((s, m) => s + m.totalCarbs, 0);

      statsContext += '\n## ПИТАНИЕ СЕГОДНЯ\n';
      statsContext += `Итого: ${Math.round(totalCal)} ккал | Б ${Math.round(totalProt)}г | Ж ${Math.round(totalFats)}г | У ${Math.round(totalCarbs)}г\n`;
      statsContext += 'Приёмы пищи (id используй для удаления через delete_meal):\n';
      for (const meal of todayMeals) {
        const label = MEAL_TYPE_LABELS[meal.type] || meal.type;
        const itemList = meal.items.map((i) => `${i.name} (${Math.round(i.calories)} ккал, ${i.weightGrams}г)`).join(', ');
        statsContext += `- [id:${meal.id}] ${label}: ${Math.round(meal.totalCalories)} ккал — ${itemList || 'без деталей'}\n`;
      }
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { role: 'user', content: message, userId },
    });

    // Build conversation messages
    const messages: Anthropic.MessageParam[] = history
      .reverse()
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    messages.push({ role: 'user', content: message });

    const relevantTopics = getRelevantKnowledge(message);

    const systemBlocks: Anthropic.TextBlockParam[] = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: FULL_KNOWLEDGE_BASE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `${userContext}\n${programContext}\n${statsContext}\n\nРелевантные темы запроса: ${relevantTopics}` },
    ];

    const anthropic = getAnthropicClient();
    const performedActions: Array<{ type: string; description: string; data?: Record<string, unknown> }> = [];

    // First API call — may include tool_use
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemBlocks,
      tools: AI_TOOLS,
      messages,
    });

    // Agentic loop: process tool calls until we get a final text response
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      // Execute all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const { resultText, actionDescription, actionData } = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            userId,
          );
          if (actionDescription) {
            performedActions.push({ type: block.name, description: actionDescription, data: actionData });
          }
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: resultText,
          };
        }),
      );

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemBlocks,
        tools: AI_TOOLS,
        messages,
      });
    }

    const aiContent = response.content.find((b) => b.type === 'text')?.text ?? '';

    // Save AI response with actions
    await prisma.chatMessage.create({
      data: {
        role: 'assistant',
        content: aiContent,
        userId,
        actions: performedActions.length > 0 ? performedActions : undefined,
      },
    });

    res.json({ message: aiContent, actions: performedActions });
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

    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    const userInfo = user
      ? `Пользователь: ${user.gender === 'MALE' ? 'мужчина' : user.gender === 'FEMALE' ? 'женщина' : ''}, ${user.weightKg ? `вес ${user.weightKg} кг` : ''}, цель: ${user.goal || 'не указана'}.`
      : '';

    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Не удалось распознать еду' });
    }

    res.json(JSON.parse(jsonMatch[0]));
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
