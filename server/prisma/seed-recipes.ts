/**
 * Curated-recipes seed.
 *
 * 30 hand-balanced Russian recipes split across breakfast/lunch/dinner/snack
 * and weight-loss/maintain/gain. KBJU pre-computed; allergens flagged so the
 * client filter can hide problematic options.
 *
 * Run separately via `npm run seed:recipes` — NOT auto-invoked on deploy
 * (idempotent thanks to the slug-derived id, but we don't want to re-run on
 * every push).
 *
 * Idempotency: each recipe's id is a fixed CUID-shaped string (`crecipe…`)
 * that survives across runs. `upsert` lets us iterate without dupes; if a
 * recipe is removed from this file it stays in the DB until manually deleted
 * (intentional — don't drop content silently).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedIngredient = {
  name: string;
  weightGrams: number;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
};

type SeedRecipe = {
  id: string; // 24+ chars, starts with 'c', lowercase alphanumeric
  name: string;
  descriptionRu: string;
  prepTimeMin: number;
  servings: number;
  ingredients: SeedIngredient[];
  steps: string[];
  tags: string[];
  allergens: string[];
};

const RECIPES: SeedRecipe[] = [
  // ─── ЗАВТРАКИ (8) ──────────────────────────────────────────────────────────
  {
    id: 'crecipe000000000000breakf01',
    name: 'Овсянка на воде с бананом',
    descriptionRu: 'Классический сытный завтрак для снижения веса',
    prepTimeMin: 10, servings: 1,
    ingredients: [
      { name: 'Овсяные хлопья', weightGrams: 60, calories: 224, protein: 7.6, fats: 4.2, carbs: 39 },
      { name: 'Банан', weightGrams: 100, calories: 89, protein: 1.1, fats: 0.3, carbs: 22.8 },
    ],
    steps: ['Залить хлопья 200 мл воды', 'Варить 5 минут на среднем огне', 'Нарезать банан, добавить сверху'],
    tags: ['breakfast', 'weight-loss'],
    allergens: ['gluten'],
  },
  {
    id: 'crecipe000000000000breakf02',
    name: 'Творог с ягодами и мёдом',
    descriptionRu: 'Высокобелковый завтрак для набора массы',
    prepTimeMin: 5, servings: 1,
    ingredients: [
      { name: 'Творог 5%', weightGrams: 200, calories: 242, protein: 34, fats: 10, carbs: 4 },
      { name: 'Голубика', weightGrams: 80, calories: 46, protein: 0.6, fats: 0.3, carbs: 11.6 },
      { name: 'Мёд', weightGrams: 15, calories: 46, protein: 0, fats: 0, carbs: 12.4 },
    ],
    steps: ['Выложить творог в миску', 'Добавить ягоды и полить мёдом'],
    tags: ['breakfast', 'maintain', 'high-protein'],
    allergens: ['lactose'],
  },
  {
    id: 'crecipe000000000000breakf03',
    name: 'Омлет из 3 яиц со шпинатом',
    descriptionRu: 'Белковый завтрак для тренировочных дней',
    prepTimeMin: 10, servings: 1,
    ingredients: [
      { name: 'Яйцо куриное', weightGrams: 165, calories: 247, protein: 21, fats: 17.5, carbs: 1.2 },
      { name: 'Шпинат', weightGrams: 50, calories: 11, protein: 1.4, fats: 0.2, carbs: 1.8 },
      { name: 'Оливковое масло', weightGrams: 5, calories: 45, protein: 0, fats: 5, carbs: 0 },
    ],
    steps: ['Взбить яйца со щепоткой соли', 'Разогреть масло, бросить шпинат на 30 сек', 'Залить яйцами, готовить под крышкой 4 мин'],
    tags: ['breakfast', 'maintain', 'high-protein'],
    allergens: ['eggs'],
  },
  {
    id: 'crecipe000000000000breakf04',
    name: 'Гречка с молоком',
    descriptionRu: 'Сытный завтрак для набора массы',
    prepTimeMin: 20, servings: 1,
    ingredients: [
      { name: 'Гречка варёная', weightGrams: 180, calories: 184, protein: 6.3, fats: 1.9, carbs: 36.7 },
      { name: 'Молоко 2.5%', weightGrams: 200, calories: 104, protein: 5.8, fats: 5, carbs: 9.4 },
      { name: 'Сахар', weightGrams: 10, calories: 40, protein: 0, fats: 0, carbs: 10 },
    ],
    steps: ['Сварить гречку в подсолённой воде 15 мин', 'Залить горячим молоком', 'Добавить сахар по вкусу'],
    tags: ['breakfast', 'gain'],
    allergens: ['lactose'],
  },
  {
    id: 'crecipe000000000000breakf05',
    name: 'Сырники без муки',
    descriptionRu: 'Низкоуглеводные сырники для снижения веса',
    prepTimeMin: 15, servings: 1,
    ingredients: [
      { name: 'Творог 5%', weightGrams: 200, calories: 242, protein: 34, fats: 10, carbs: 4 },
      { name: 'Яйцо', weightGrams: 55, calories: 82, protein: 7, fats: 5.8, carbs: 0.4 },
      { name: 'Овсяные отруби', weightGrams: 15, calories: 36, protein: 2.5, fats: 1, carbs: 4 },
    ],
    steps: ['Размять творог вилкой, добавить яйцо и отруби', 'Слепить лепёшки', 'Жарить на сухой сковороде по 3 мин с каждой стороны'],
    tags: ['breakfast', 'weight-loss', 'high-protein'],
    allergens: ['lactose', 'eggs', 'gluten'],
  },
  {
    id: 'crecipe000000000000breakf06',
    name: 'Йогурт с гранолой и орехами',
    descriptionRu: 'Быстрый завтрак с клетчаткой',
    prepTimeMin: 3, servings: 1,
    ingredients: [
      { name: 'Греческий йогурт', weightGrams: 150, calories: 89, protein: 15, fats: 0.7, carbs: 5.4 },
      { name: 'Гранола', weightGrams: 40, calories: 192, protein: 4, fats: 8, carbs: 26 },
      { name: 'Грецкий орех', weightGrams: 15, calories: 98, protein: 2.3, fats: 9.8, carbs: 1.6 },
    ],
    steps: ['Выложить йогурт в чашу', 'Посыпать гранолой и орехами'],
    tags: ['breakfast', 'maintain'],
    allergens: ['lactose', 'gluten', 'nuts'],
  },
  {
    id: 'crecipe000000000000breakf07',
    name: 'Тост с авокадо и яйцом-пашот',
    descriptionRu: 'Сбалансированный завтрак для поддержания веса',
    prepTimeMin: 12, servings: 1,
    ingredients: [
      { name: 'Цельнозерновой хлеб', weightGrams: 50, calories: 119, protein: 4.5, fats: 1.3, carbs: 22 },
      { name: 'Авокадо', weightGrams: 80, calories: 128, protein: 1.6, fats: 11.7, carbs: 6.9 },
      { name: 'Яйцо', weightGrams: 55, calories: 82, protein: 7, fats: 5.8, carbs: 0.4 },
    ],
    steps: ['Поджарить хлеб 2 мин', 'Размять авокадо, посолить', 'Сварить яйцо-пашот в кипятке с уксусом 3 мин', 'Собрать: хлеб, авокадо, сверху яйцо'],
    tags: ['breakfast', 'maintain'],
    allergens: ['gluten', 'eggs'],
  },
  {
    id: 'crecipe000000000000breakf08',
    name: 'Протеиновый смузи без молока',
    descriptionRu: 'Веганский смузи на растительном молоке',
    prepTimeMin: 5, servings: 1,
    ingredients: [
      { name: 'Овсяное молоко', weightGrams: 250, calories: 113, protein: 1, fats: 4, carbs: 17.5 },
      { name: 'Банан', weightGrams: 120, calories: 107, protein: 1.3, fats: 0.4, carbs: 27.4 },
      { name: 'Растительный протеин', weightGrams: 30, calories: 110, protein: 24, fats: 1.5, carbs: 2 },
    ],
    steps: ['Сложить всё в блендер', 'Взбить 30 секунд', 'Перелить в стакан'],
    tags: ['breakfast', 'gain', 'high-protein'],
    allergens: [],
  },

  // ─── ОБЕДЫ (10) ────────────────────────────────────────────────────────────
  {
    id: 'crecipe0000000000000lunch01',
    name: 'Куриная грудка с гречкой и овощами',
    descriptionRu: 'Классический спортивный обед',
    prepTimeMin: 30, servings: 1,
    ingredients: [
      { name: 'Куриная грудка', weightGrams: 180, calories: 198, protein: 37, fats: 4.5, carbs: 0 },
      { name: 'Гречка варёная', weightGrams: 150, calories: 154, protein: 5.3, fats: 1.6, carbs: 30.6 },
      { name: 'Брокколи', weightGrams: 100, calories: 28, protein: 3, fats: 0.4, carbs: 4.3 },
    ],
    steps: ['Грудку посолить, жарить 8 мин с каждой стороны', 'Сварить гречку 15 мин', 'Брокколи приготовить на пару 5 мин', 'Подать всё вместе'],
    tags: ['lunch', 'maintain', 'high-protein'],
    allergens: [],
  },
  {
    id: 'crecipe0000000000000lunch02',
    name: 'Лосось с киноа и спаржей',
    descriptionRu: 'Полезные жиры и белок для поддержания формы',
    prepTimeMin: 25, servings: 1,
    ingredients: [
      { name: 'Лосось', weightGrams: 150, calories: 309, protein: 30, fats: 19.5, carbs: 0 },
      { name: 'Киноа варёная', weightGrams: 120, calories: 144, protein: 5.3, fats: 2.3, carbs: 25 },
      { name: 'Спаржа', weightGrams: 100, calories: 20, protein: 2.2, fats: 0.1, carbs: 3.9 },
    ],
    steps: ['Лосось посолить, обжарить 4 мин с каждой стороны', 'Сварить киноа 15 мин', 'Спаржу обжарить 5 мин на оливковом масле'],
    tags: ['lunch', 'maintain', 'high-protein'],
    allergens: ['fish'],
  },
  {
    id: 'crecipe0000000000000lunch03',
    name: 'Говядина с овощами на сковороде',
    descriptionRu: 'Сытный обед для набора массы',
    prepTimeMin: 25, servings: 1,
    ingredients: [
      { name: 'Говядина', weightGrams: 180, calories: 466, protein: 33, fats: 36, carbs: 0 },
      { name: 'Болгарский перец', weightGrams: 100, calories: 27, protein: 1.3, fats: 0.1, carbs: 5.3 },
      { name: 'Лук репчатый', weightGrams: 50, calories: 20, protein: 0.7, fats: 0.1, carbs: 4.4 },
      { name: 'Бурый рис варёный', weightGrams: 150, calories: 165, protein: 3.6, fats: 1.4, carbs: 34.7 },
    ],
    steps: ['Нарезать говядину полосками', 'Обжарить лук, добавить мясо на 5 мин', 'Добавить перец, тушить 8 мин', 'Подать с рисом'],
    tags: ['lunch', 'gain', 'high-protein'],
    allergens: [],
  },
  {
    id: 'crecipe0000000000000lunch04',
    name: 'Куриный салат с авокадо',
    descriptionRu: 'Лёгкий салат для снижения веса',
    prepTimeMin: 15, servings: 1,
    ingredients: [
      { name: 'Куриная грудка варёная', weightGrams: 150, calories: 165, protein: 31, fats: 3.6, carbs: 0 },
      { name: 'Авокадо', weightGrams: 80, calories: 128, protein: 1.6, fats: 11.7, carbs: 6.9 },
      { name: 'Помидор черри', weightGrams: 100, calories: 18, protein: 0.9, fats: 0.2, carbs: 3.9 },
      { name: 'Салат латук', weightGrams: 50, calories: 8, protein: 0.7, fats: 0.1, carbs: 1.5 },
    ],
    steps: ['Нарезать грудку и авокадо кубиками', 'Помидоры пополам', 'Смешать с порванным салатом', 'Заправить лимоном и оливковым маслом'],
    tags: ['lunch', 'weight-loss', 'high-protein'],
    allergens: [],
  },
  {
    id: 'crecipe0000000000000lunch05',
    name: 'Чечевичный суп',
    descriptionRu: 'Согревающий обед с растительным белком',
    prepTimeMin: 40, servings: 2,
    ingredients: [
      { name: 'Красная чечевица', weightGrams: 150, calories: 525, protein: 36, fats: 1.5, carbs: 90 },
      { name: 'Морковь', weightGrams: 100, calories: 32, protein: 1.3, fats: 0.1, carbs: 6.9 },
      { name: 'Лук репчатый', weightGrams: 80, calories: 32, protein: 1.1, fats: 0.2, carbs: 7 },
      { name: 'Томатная паста', weightGrams: 30, calories: 25, protein: 1.4, fats: 0.1, carbs: 5.4 },
    ],
    steps: ['Лук и морковь обжарить 5 мин', 'Добавить чечевицу и томатную пасту', 'Залить 1 л воды', 'Варить 25 мин'],
    tags: ['lunch', 'maintain'],
    allergens: [],
  },
  {
    id: 'crecipe0000000000000lunch06',
    name: 'Индейка с печёным картофелем',
    descriptionRu: 'Простой обед на каждый день',
    prepTimeMin: 35, servings: 1,
    ingredients: [
      { name: 'Филе индейки', weightGrams: 180, calories: 154, protein: 35, fats: 1.4, carbs: 0 },
      { name: 'Картофель', weightGrams: 200, calories: 154, protein: 4, fats: 0.8, carbs: 34 },
      { name: 'Оливковое масло', weightGrams: 8, calories: 72, protein: 0, fats: 8, carbs: 0 },
    ],
    steps: ['Картофель нарезать дольками, сбрызнуть маслом', 'Запекать при 200°C 25 мин', 'Индейку обжарить 6 мин с каждой стороны'],
    tags: ['lunch', 'maintain', 'high-protein'],
    allergens: [],
  },
  {
    id: 'crecipe0000000000000lunch07',
    name: 'Запечённая рыба с овощами',
    descriptionRu: 'Низкокалорийный обед в один противень',
    prepTimeMin: 35, servings: 1,
    ingredients: [
      { name: 'Треска', weightGrams: 200, calories: 164, protein: 36, fats: 1.4, carbs: 0 },
      { name: 'Кабачок', weightGrams: 150, calories: 25, protein: 1.8, fats: 0.5, carbs: 4.7 },
      { name: 'Помидор', weightGrams: 100, calories: 20, protein: 1.1, fats: 0.2, carbs: 3.7 },
    ],
    steps: ['Овощи нарезать кружочками, выложить на противень', 'Сверху положить треску, посолить', 'Запекать при 180°C 25 мин'],
    tags: ['lunch', 'weight-loss', 'high-protein'],
    allergens: ['fish'],
  },
  {
    id: 'crecipe0000000000000lunch08',
    name: 'Паста с куриной грудкой и томатами',
    descriptionRu: 'Сбалансированный обед перед тренировкой',
    prepTimeMin: 25, servings: 1,
    ingredients: [
      { name: 'Цельнозерновая паста сухая', weightGrams: 80, calories: 290, protein: 11, fats: 2, carbs: 58 },
      { name: 'Куриная грудка', weightGrams: 120, calories: 132, protein: 25, fats: 3, carbs: 0 },
      { name: 'Помидоры в собственном соку', weightGrams: 150, calories: 31, protein: 1.6, fats: 0.3, carbs: 5.4 },
    ],
    steps: ['Сварить пасту al dente 8 мин', 'Грудку нарезать кубиками, обжарить 6 мин', 'Добавить томаты, тушить 5 мин', 'Смешать с пастой'],
    tags: ['lunch', 'gain', 'high-protein'],
    allergens: ['gluten'],
  },
  {
    id: 'crecipe0000000000000lunch09',
    name: 'Боул с тунцом и киноа',
    descriptionRu: 'Готовый обед с собой',
    prepTimeMin: 20, servings: 1,
    ingredients: [
      { name: 'Тунец консервированный', weightGrams: 120, calories: 116, protein: 25, fats: 1.2, carbs: 0 },
      { name: 'Киноа варёная', weightGrams: 100, calories: 120, protein: 4.4, fats: 1.9, carbs: 21.3 },
      { name: 'Огурец', weightGrams: 100, calories: 14, protein: 0.7, fats: 0.1, carbs: 2.5 },
      { name: 'Морковь', weightGrams: 50, calories: 16, protein: 0.7, fats: 0.1, carbs: 3.5 },
    ],
    steps: ['Сварить киноа 15 мин и остудить', 'Овощи натереть на крупной тёрке', 'Тунец размять вилкой', 'Сложить всё в контейнер'],
    tags: ['lunch', 'weight-loss', 'high-protein'],
    allergens: ['fish'],
  },
  {
    id: 'crecipe0000000000000lunch10',
    name: 'Курица карри с рисом',
    descriptionRu: 'Острый обед без молочки',
    prepTimeMin: 30, servings: 2,
    ingredients: [
      { name: 'Куриная грудка', weightGrams: 300, calories: 330, protein: 62, fats: 7.5, carbs: 0 },
      { name: 'Бурый рис варёный', weightGrams: 250, calories: 275, protein: 6, fats: 2.3, carbs: 57.8 },
      { name: 'Кокосовое молоко', weightGrams: 100, calories: 230, protein: 2.3, fats: 24, carbs: 3.4 },
      { name: 'Карри-паста', weightGrams: 30, calories: 30, protein: 1, fats: 1.5, carbs: 4 },
    ],
    steps: ['Грудку нарезать кубиками', 'Обжарить с карри-пастой 5 мин', 'Залить кокосовым молоком, тушить 15 мин', 'Подать с рисом'],
    tags: ['lunch', 'maintain', 'high-protein'],
    allergens: [],
  },

  // ─── УЖИНЫ (8) ─────────────────────────────────────────────────────────────
  {
    id: 'crecipe000000000000dinner01',
    name: 'Запечённая куриная грудка с овощами',
    descriptionRu: 'Лёгкий ужин для снижения веса',
    prepTimeMin: 30, servings: 1,
    ingredients: [
      { name: 'Куриная грудка', weightGrams: 200, calories: 220, protein: 41, fats: 5, carbs: 0 },
      { name: 'Цветная капуста', weightGrams: 150, calories: 38, protein: 2.9, fats: 0.5, carbs: 6 },
      { name: 'Морковь', weightGrams: 100, calories: 32, protein: 1.3, fats: 0.1, carbs: 6.9 },
    ],
    steps: ['Грудку и овощи выложить на противень', 'Сбрызнуть оливковым маслом', 'Запекать при 200°C 25 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'],
    allergens: [],
  },
  {
    id: 'crecipe000000000000dinner02',
    name: 'Творожная запеканка',
    descriptionRu: 'Белковый ужин',
    prepTimeMin: 40, servings: 2,
    ingredients: [
      { name: 'Творог 5%', weightGrams: 400, calories: 484, protein: 68, fats: 20, carbs: 8 },
      { name: 'Яйцо', weightGrams: 110, calories: 165, protein: 14, fats: 11.7, carbs: 0.8 },
      { name: 'Манная крупа', weightGrams: 30, calories: 100, protein: 3.1, fats: 0.3, carbs: 21.8 },
    ],
    steps: ['Смешать творог, яйца и манку', 'Выложить в форму', 'Запекать при 180°C 30 мин'],
    tags: ['dinner', 'maintain', 'high-protein'],
    allergens: ['lactose', 'eggs', 'gluten'],
  },
  {
    id: 'crecipe000000000000dinner03',
    name: 'Котлеты из индейки на пару',
    descriptionRu: 'Диетический ужин без жарки',
    prepTimeMin: 30, servings: 2,
    ingredients: [
      { name: 'Фарш индейки', weightGrams: 400, calories: 444, protein: 76, fats: 14.4, carbs: 0 },
      { name: 'Лук репчатый', weightGrams: 60, calories: 24, protein: 0.8, fats: 0.1, carbs: 5.3 },
      { name: 'Яйцо', weightGrams: 55, calories: 82, protein: 7, fats: 5.8, carbs: 0.4 },
    ],
    steps: ['Лук пробить блендером', 'Смешать фарш, лук и яйцо', 'Слепить котлеты, готовить на пару 20 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'],
    allergens: ['eggs'],
  },
  {
    id: 'crecipe000000000000dinner04',
    name: 'Стейк из лосося с салатом',
    descriptionRu: 'Омега-3 на ужин',
    prepTimeMin: 20, servings: 1,
    ingredients: [
      { name: 'Лосось', weightGrams: 200, calories: 412, protein: 40, fats: 26, carbs: 0 },
      { name: 'Микс салатов', weightGrams: 80, calories: 14, protein: 1.4, fats: 0.2, carbs: 2.4 },
      { name: 'Помидор черри', weightGrams: 100, calories: 18, protein: 0.9, fats: 0.2, carbs: 3.9 },
    ],
    steps: ['Лосось посолить, обжарить 4 мин с каждой стороны', 'Салат и помидоры заправить лимоном', 'Подать вместе'],
    tags: ['dinner', 'maintain', 'high-protein'],
    allergens: ['fish'],
  },
  {
    id: 'crecipe000000000000dinner05',
    name: 'Тушёная говядина с овощами',
    descriptionRu: 'Ужин для набора массы',
    prepTimeMin: 60, servings: 2,
    ingredients: [
      { name: 'Говядина', weightGrams: 400, calories: 1036, protein: 74, fats: 80, carbs: 0 },
      { name: 'Морковь', weightGrams: 150, calories: 48, protein: 2, fats: 0.2, carbs: 10.4 },
      { name: 'Лук репчатый', weightGrams: 100, calories: 40, protein: 1.4, fats: 0.2, carbs: 8.7 },
      { name: 'Картофель', weightGrams: 300, calories: 231, protein: 6, fats: 1.2, carbs: 51 },
    ],
    steps: ['Мясо нарезать кубиками, обжарить 5 мин', 'Добавить лук и морковь, тушить 10 мин', 'Залить водой, готовить 30 мин', 'Добавить картофель, тушить ещё 15 мин'],
    tags: ['dinner', 'gain', 'high-protein'],
    allergens: [],
  },
  {
    id: 'crecipe000000000000dinner06',
    name: 'Овощное рагу с нутом',
    descriptionRu: 'Веганский ужин с растительным белком',
    prepTimeMin: 30, servings: 2,
    ingredients: [
      { name: 'Нут варёный', weightGrams: 250, calories: 410, protein: 21.8, fats: 6.5, carbs: 67.5 },
      { name: 'Кабачок', weightGrams: 200, calories: 34, protein: 2.4, fats: 0.6, carbs: 6.2 },
      { name: 'Баклажан', weightGrams: 200, calories: 50, protein: 2.4, fats: 0.4, carbs: 11.6 },
      { name: 'Помидор', weightGrams: 200, calories: 40, protein: 2.2, fats: 0.4, carbs: 7.4 },
    ],
    steps: ['Овощи нарезать кубиками', 'Обжарить лук, добавить баклажан и кабачок', 'Через 10 мин добавить помидоры и нут', 'Тушить ещё 15 мин'],
    tags: ['dinner', 'maintain'],
    allergens: [],
  },
  {
    id: 'crecipe000000000000dinner07',
    name: 'Фрикадельки в томатном соусе',
    descriptionRu: 'Уютный домашний ужин',
    prepTimeMin: 35, servings: 2,
    ingredients: [
      { name: 'Фарш говяжий', weightGrams: 400, calories: 1004, protein: 68, fats: 80, carbs: 0 },
      { name: 'Яйцо', weightGrams: 55, calories: 82, protein: 7, fats: 5.8, carbs: 0.4 },
      { name: 'Помидоры в собственном соку', weightGrams: 300, calories: 63, protein: 3.3, fats: 0.6, carbs: 10.8 },
      { name: 'Бурый рис варёный', weightGrams: 200, calories: 220, protein: 4.8, fats: 1.8, carbs: 46.2 },
    ],
    steps: ['Фарш смешать с яйцом, слепить шарики', 'Обжарить фрикадельки 5 мин', 'Залить томатами, тушить 20 мин', 'Подать с рисом'],
    tags: ['dinner', 'gain', 'high-protein'],
    allergens: ['eggs'],
  },
  {
    id: 'crecipe000000000000dinner08',
    name: 'Куриные шашлычки с овощами на гриле',
    descriptionRu: 'Сочный белковый ужин',
    prepTimeMin: 30, servings: 2,
    ingredients: [
      { name: 'Куриная грудка', weightGrams: 400, calories: 440, protein: 82, fats: 10, carbs: 0 },
      { name: 'Болгарский перец', weightGrams: 200, calories: 54, protein: 2.6, fats: 0.2, carbs: 10.6 },
      { name: 'Лук репчатый', weightGrams: 100, calories: 40, protein: 1.4, fats: 0.2, carbs: 8.7 },
    ],
    steps: ['Грудку нарезать кубиками 3 см', 'Замариновать в соевом соусе и специях 10 мин', 'Нанизать на шпажки с овощами', 'Жарить на гриле 12 мин'],
    tags: ['dinner', 'maintain', 'high-protein'],
    allergens: ['soy'],
  },

  // ─── ПЕРЕКУСЫ (4) ──────────────────────────────────────────────────────────
  {
    id: 'crecipe00000000000snack0001',
    name: 'Протеиновый шейк с бананом',
    descriptionRu: 'Послетренировочный перекус',
    prepTimeMin: 3, servings: 1,
    ingredients: [
      { name: 'Сывороточный протеин', weightGrams: 30, calories: 117, protein: 24, fats: 1.5, carbs: 3 },
      { name: 'Молоко 2.5%', weightGrams: 250, calories: 130, protein: 7.3, fats: 6.3, carbs: 11.8 },
      { name: 'Банан', weightGrams: 100, calories: 89, protein: 1.1, fats: 0.3, carbs: 22.8 },
    ],
    steps: ['Сложить ингредиенты в шейкер', 'Взбить или встряхнуть 30 секунд'],
    tags: ['snack', 'gain', 'high-protein'],
    allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000000snack0002',
    name: 'Орехи с яблоком',
    descriptionRu: 'Простой перекус на ходу',
    prepTimeMin: 1, servings: 1,
    ingredients: [
      { name: 'Миндаль', weightGrams: 30, calories: 173, protein: 6.4, fats: 14.9, carbs: 6.5 },
      { name: 'Яблоко', weightGrams: 150, calories: 78, protein: 0.6, fats: 0.6, carbs: 17.7 },
    ],
    steps: ['Помыть яблоко', 'Нарезать дольками, есть с миндалём'],
    tags: ['snack', 'maintain'],
    allergens: ['nuts'],
  },
  {
    id: 'crecipe00000000000snack0003',
    name: 'Творог с огурцом и зеленью',
    descriptionRu: 'Низкокалорийный белковый перекус',
    prepTimeMin: 5, servings: 1,
    ingredients: [
      { name: 'Творог 2%', weightGrams: 150, calories: 156, protein: 27, fats: 3, carbs: 3 },
      { name: 'Огурец', weightGrams: 80, calories: 11, protein: 0.6, fats: 0.1, carbs: 2 },
      { name: 'Укроп', weightGrams: 10, calories: 4, protein: 0.3, fats: 0.1, carbs: 0.6 },
    ],
    steps: ['Огурец натереть', 'Зелень мелко порезать', 'Смешать с творогом, посолить'],
    tags: ['snack', 'weight-loss', 'high-protein'],
    allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000000snack0004',
    name: 'Хумус с морковью',
    descriptionRu: 'Растительный перекус с клетчаткой',
    prepTimeMin: 3, servings: 1,
    ingredients: [
      { name: 'Хумус', weightGrams: 60, calories: 100, protein: 4.7, fats: 7.4, carbs: 8.6 },
      { name: 'Морковь', weightGrams: 100, calories: 32, protein: 1.3, fats: 0.1, carbs: 6.9 },
    ],
    steps: ['Морковь нарезать палочками', 'Макать в хумус'],
    tags: ['snack', 'maintain'],
    allergens: [],
  },
];

function totals(ings: SeedIngredient[]) {
  return {
    totalCalories: Math.round(ings.reduce((s, i) => s + i.calories, 0)),
    totalProtein: Math.round(ings.reduce((s, i) => s + i.protein, 0) * 10) / 10,
    totalFats: Math.round(ings.reduce((s, i) => s + i.fats, 0) * 10) / 10,
    totalCarbs: Math.round(ings.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
  };
}

async function main() {
  let created = 0;
  let updated = 0;
  for (const r of RECIPES) {
    const data = {
      source: 'CURATED' as const,
      userId: null,
      name: r.name,
      descriptionRu: r.descriptionRu,
      imageUrl: null,
      prepTimeMin: r.prepTimeMin,
      servings: r.servings,
      ingredients: r.ingredients,
      steps: r.steps,
      tags: r.tags,
      allergens: r.allergens,
      ...totals(r.ingredients),
    };
    const existing = await prisma.recipe.findUnique({ where: { id: r.id } });
    if (existing) {
      await prisma.recipe.update({ where: { id: r.id }, data });
      updated++;
    } else {
      await prisma.recipe.create({ data: { id: r.id, ...data } });
      created++;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[seed-recipes] ${created} created, ${updated} updated, ${RECIPES.length} total`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
