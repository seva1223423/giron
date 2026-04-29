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

// ── KBJU per 100g for the most common Russian-supermarket ingredients ────────
// Used by ing() / egg() helpers below to compose recipes with consistent
// macros without hand-counting each variation. Values are typical USDA /
// Russian food handbook averages — not authoritative, but consistent.
type Per100 = { calories: number; protein: number; fats: number; carbs: number };

const K = {
  // Каши, крупы, хлеб
  oatsRaw:          { calories: 389, protein: 17,   fats: 7,    carbs: 66 },
  oatBranRaw:       { calories: 246, protein: 17.3, fats: 7,    carbs: 66 },
  buckwheatCooked:  { calories: 110, protein: 4,    fats: 1,    carbs: 22 },
  whiteRiceCooked:  { calories: 130, protein: 2.7,  fats: 0.3,  carbs: 28 },
  brownRiceCooked:  { calories: 112, protein: 2.6,  fats: 1,    carbs: 23 },
  pearlBarleyCooked:{ calories: 123, protein: 3,    fats: 0.5,  carbs: 27 },
  quinoaCooked:     { calories: 120, protein: 4.4,  fats: 1.9,  carbs: 21.3 },
  bulgurCooked:     { calories: 83,  protein: 3,    fats: 0.2,  carbs: 19 },
  couscousCooked:   { calories: 112, protein: 3.8,  fats: 0.2,  carbs: 23 },
  millet:           { calories: 116, protein: 3.5,  fats: 1,    carbs: 24 },
  pastaWhole:       { calories: 124, protein: 5,    fats: 1,    carbs: 26 },
  pastaReg:         { calories: 158, protein: 5.8,  fats: 0.9,  carbs: 31 },
  breadWhole:       { calories: 247, protein: 13,   fats: 4,    carbs: 41 },
  breadRye:         { calories: 199, protein: 6,    fats: 1,    carbs: 40 },
  flatbread:        { calories: 277, protein: 9,    fats: 1,    carbs: 53 },
  crispbread:       { calories: 380, protein: 12,   fats: 3,    carbs: 72 },
  granolaPlain:     { calories: 480, protein: 10,   fats: 20,   carbs: 65 },

  // Молочка
  milkLow:          { calories: 52,  protein: 2.9,  fats: 2.5,  carbs: 4.7 },
  milkSkim:         { calories: 35,  protein: 3.4,  fats: 0.5,  carbs: 4.9 },
  milkOat:          { calories: 45,  protein: 0.4,  fats: 1.6,  carbs: 7 },
  yogurtGreek:      { calories: 59,  protein: 10,   fats: 0.4,  carbs: 3.6 },
  yogurtNat:        { calories: 60,  protein: 3.5,  fats: 3.2,  carbs: 4.7 },
  curd5:            { calories: 121, protein: 17.2, fats: 5,    carbs: 1.8 },
  curd0:            { calories: 71,  protein: 16.5, fats: 0.5,  carbs: 1.3 },
  curd9:            { calories: 159, protein: 16.7, fats: 9,    carbs: 2 },
  fetaCheese:       { calories: 264, protein: 14,   fats: 21,   carbs: 4 },
  mozzarella:       { calories: 280, protein: 22,   fats: 22,   carbs: 2.2 },
  parmesan:         { calories: 392, protein: 35.7, fats: 26,   carbs: 3.2 },
  hardCheese20:     { calories: 230, protein: 29,   fats: 12,   carbs: 0 },
  brynza:           { calories: 260, protein: 11,   fats: 19,   carbs: 0.4 },
  ricotta:          { calories: 174, protein: 11,   fats: 13,   carbs: 3 },
  butter:           { calories: 717, protein: 0.5,  fats: 82.5, carbs: 0.8 },
  sourCream10:      { calories: 116, protein: 3,    fats: 10,   carbs: 4 },
  sourCream15:      { calories: 158, protein: 2.8,  fats: 15,   carbs: 3.6 },

  // Мясо/рыба/птица
  chickenBreast:    { calories: 165, protein: 31,   fats: 3.6,  carbs: 0 },
  chickenThigh:     { calories: 211, protein: 25,   fats: 12,   carbs: 0 },
  chickenLeg:       { calories: 184, protein: 22,   fats: 10,   carbs: 0 },
  turkeyBreast:     { calories: 135, protein: 30,   fats: 0.7,  carbs: 0 },
  turkeyMince:      { calories: 187, protein: 27,   fats: 8,    carbs: 0 },
  beef:             { calories: 250, protein: 26,   fats: 15,   carbs: 0 },
  beefMince:        { calories: 254, protein: 19,   fats: 19,   carbs: 0 },
  beefSteak:        { calories: 270, protein: 26,   fats: 17,   carbs: 0 },
  porkLean:         { calories: 143, protein: 19,   fats: 7,    carbs: 0 },
  porkLoin:         { calories: 242, protein: 21,   fats: 16,   carbs: 0 },
  ham:              { calories: 145, protein: 22,   fats: 6,    carbs: 0 },
  salmon:           { calories: 208, protein: 20,   fats: 13,   carbs: 0 },
  trout:            { calories: 208, protein: 20,   fats: 13,   carbs: 0 },
  cod:              { calories: 82,  protein: 18,   fats: 0.7,  carbs: 0 },
  hake:             { calories: 86,  protein: 17,   fats: 2,    carbs: 0 },
  tuna:             { calories: 132, protein: 24,   fats: 3.5,  carbs: 0 },
  tunaCanned:       { calories: 116, protein: 26,   fats: 0.8,  carbs: 0 },
  shrimp:           { calories: 99,  protein: 24,   fats: 0.3,  carbs: 0 },
  squid:            { calories: 92,  protein: 15,   fats: 2,    carbs: 3 },
  mussel:           { calories: 86,  protein: 12,   fats: 2,    carbs: 3.7 },
  herring:          { calories: 158, protein: 18,   fats: 9,    carbs: 0 },
  mackerel:         { calories: 305, protein: 19,   fats: 25,   carbs: 0 },

  // Овощи
  broccoli:         { calories: 28,  protein: 3,    fats: 0.4,  carbs: 4.3 },
  cauliflower:      { calories: 25,  protein: 2,    fats: 0.3,  carbs: 5 },
  cabbage:          { calories: 25,  protein: 1.3,  fats: 0.1,  carbs: 5.8 },
  cabbageSauer:     { calories: 19,  protein: 0.9,  fats: 0.1,  carbs: 4.3 },
  carrot:           { calories: 32,  protein: 1.3,  fats: 0.1,  carbs: 6.9 },
  beetroot:         { calories: 43,  protein: 1.6,  fats: 0.2,  carbs: 9.6 },
  potato:           { calories: 77,  protein: 2,    fats: 0.4,  carbs: 17 },
  sweetPotato:      { calories: 86,  protein: 1.6,  fats: 0.1,  carbs: 20 },
  zucchini:         { calories: 17,  protein: 1.2,  fats: 0.3,  carbs: 3.1 },
  eggplant:         { calories: 25,  protein: 1.2,  fats: 0.2,  carbs: 5.8 },
  bellPepper:       { calories: 27,  protein: 1.3,  fats: 0.1,  carbs: 5.3 },
  tomato:           { calories: 20,  protein: 1.1,  fats: 0.2,  carbs: 3.7 },
  tomatoCanned:     { calories: 21,  protein: 1.1,  fats: 0.2,  carbs: 3.6 },
  cucumber:         { calories: 14,  protein: 0.7,  fats: 0.1,  carbs: 2.5 },
  onion:            { calories: 40,  protein: 1.4,  fats: 0.2,  carbs: 8.7 },
  greenOnion:       { calories: 30,  protein: 2,    fats: 0.1,  carbs: 4.2 },
  garlic:           { calories: 149, protein: 6,    fats: 0.5,  carbs: 33 },
  spinach:          { calories: 23,  protein: 2.9,  fats: 0.4,  carbs: 3.6 },
  arugula:          { calories: 25,  protein: 2.6,  fats: 0.7,  carbs: 3.7 },
  romain:           { calories: 17,  protein: 1.2,  fats: 0.3,  carbs: 3.3 },
  saladMix:         { calories: 14,  protein: 1.4,  fats: 0.2,  carbs: 2.4 },
  asparagus:        { calories: 20,  protein: 2.2,  fats: 0.1,  carbs: 3.9 },
  greenBeans:       { calories: 31,  protein: 1.8,  fats: 0.1,  carbs: 7 },
  peasFrozen:       { calories: 81,  protein: 5,    fats: 0.4,  carbs: 14 },
  corn:             { calories: 89,  protein: 3.3,  fats: 2,    carbs: 19 },
  mushroom:         { calories: 22,  protein: 3.1,  fats: 0.3,  carbs: 3.3 },
  radish:           { calories: 16,  protein: 0.7,  fats: 0.1,  carbs: 3.4 },
  pumpkin:          { calories: 26,  protein: 1,    fats: 0.1,  carbs: 6.5 },
  oliveBlack:       { calories: 115, protein: 0.8,  fats: 11,   carbs: 6 },
  dill:             { calories: 43,  protein: 3.5,  fats: 1.1,  carbs: 7 },
  parsley:          { calories: 36,  protein: 3,    fats: 0.8,  carbs: 6.3 },

  // Фрукты, ягоды, сухофрукты
  apple:            { calories: 52,  protein: 0.3,  fats: 0.2,  carbs: 14 },
  banana:           { calories: 89,  protein: 1.1,  fats: 0.3,  carbs: 23 },
  pear:             { calories: 57,  protein: 0.4,  fats: 0.1,  carbs: 15 },
  orange:           { calories: 47,  protein: 0.9,  fats: 0.1,  carbs: 12 },
  grapefruit:       { calories: 42,  protein: 0.8,  fats: 0.1,  carbs: 11 },
  strawberry:       { calories: 32,  protein: 0.7,  fats: 0.3,  carbs: 8 },
  blueberry:        { calories: 57,  protein: 0.7,  fats: 0.3,  carbs: 14 },
  raspberry:        { calories: 52,  protein: 1.2,  fats: 0.7,  carbs: 12 },
  blackcurrant:     { calories: 63,  protein: 1,    fats: 0.4,  carbs: 15 },
  cherry:           { calories: 50,  protein: 1,    fats: 0.3,  carbs: 12 },
  mango:            { calories: 60,  protein: 0.8,  fats: 0.4,  carbs: 15 },
  kiwi:             { calories: 61,  protein: 1.1,  fats: 0.5,  carbs: 15 },
  pineapple:        { calories: 50,  protein: 0.5,  fats: 0.1,  carbs: 13 },
  peach:            { calories: 39,  protein: 0.9,  fats: 0.3,  carbs: 10 },
  pomegranate:      { calories: 83,  protein: 1.7,  fats: 1.2,  carbs: 19 },
  avocado:          { calories: 160, protein: 2,    fats: 15,   carbs: 9 },
  raisin:           { calories: 299, protein: 3,    fats: 0.5,  carbs: 79 },
  prune:            { calories: 240, protein: 2.2,  fats: 0.4,  carbs: 64 },
  date:             { calories: 282, protein: 2.5,  fats: 0.4,  carbs: 75 },
  driedApricot:     { calories: 241, protein: 3.4,  fats: 0.5,  carbs: 63 },

  // Бобовые
  chickpeasCooked:  { calories: 164, protein: 8.9,  fats: 2.6,  carbs: 27.4 },
  lentilCooked:     { calories: 116, protein: 9,    fats: 0.4,  carbs: 20 },
  lentilRedRaw:     { calories: 350, protein: 24,   fats: 1,    carbs: 63 },
  beanRedCooked:    { calories: 127, protein: 8.7,  fats: 0.5,  carbs: 22.8 },
  beanWhiteCooked:  { calories: 139, protein: 8,    fats: 0.5,  carbs: 25 },

  // Орехи / семечки / масла / прочее
  almond:           { calories: 575, protein: 21,   fats: 49,   carbs: 22 },
  walnut:           { calories: 654, protein: 15,   fats: 65,   carbs: 14 },
  cashew:           { calories: 553, protein: 18,   fats: 44,   carbs: 30 },
  peanut:           { calories: 567, protein: 26,   fats: 49,   carbs: 16 },
  pumpkinSeed:      { calories: 559, protein: 30,   fats: 49,   carbs: 11 },
  flaxseed:         { calories: 534, protein: 18,   fats: 42,   carbs: 29 },
  chiaSeed:         { calories: 486, protein: 17,   fats: 31,   carbs: 42 },
  oliveOil:         { calories: 884, protein: 0,    fats: 100,  carbs: 0 },
  sunflowerOil:     { calories: 884, protein: 0,    fats: 100,  carbs: 0 },
  peanutButter:     { calories: 588, protein: 25,   fats: 50,   carbs: 20 },
  honey:            { calories: 304, protein: 0.3,  fats: 0,    carbs: 82.4 },
  proteinWhey:      { calories: 384, protein: 72,   fats: 4.5,  carbs: 8 },
  proteinPlant:     { calories: 367, protein: 80,   fats: 5,    carbs: 7 },
  hummus:           { calories: 166, protein: 8,    fats: 10,   carbs: 14 },
  soyMilk:          { calories: 33,  protein: 3,    fats: 2,    carbs: 0.5 },
  coconutMilkLight: { calories: 73,  protein: 0.5,  fats: 4.5,  carbs: 3 },
  coconutMilkFull:  { calories: 230, protein: 2.3,  fats: 24,   carbs: 3.4 },
  soyaSauce:        { calories: 53,  protein: 8,    fats: 0,    carbs: 5 },
  chocolateDark:    { calories: 546, protein: 4.9,  fats: 31,   carbs: 61 },
  chocolateMilk:    { calories: 535, protein: 7.5,  fats: 30,   carbs: 59 },
  cocoaPowder:      { calories: 228, protein: 19.6, fats: 14,   carbs: 57 },
} satisfies Record<string, Per100>;

/** Build an ingredient line from a per-100g profile + grams. KBJU rounded to
 *  match what server-side recipeBodySchema accepts (sub-gram precision is
 *  noise — body composition isn't decided by 0.07g of carbs). */
function ing(name: string, per100: Per100, grams: number): SeedIngredient {
  const f = (v: number) => Math.round((v * grams) / 100 * 10) / 10;
  return {
    name,
    weightGrams: grams,
    calories: Math.round((per100.calories * grams) / 100),
    protein: f(per100.protein),
    fats: f(per100.fats),
    carbs: f(per100.carbs),
  };
}

/** Egg helper — by piece (the seed-ref values from CLAUDE briefing). */
function egg(count = 1): SeedIngredient {
  return {
    name: count === 1 ? 'Яйцо' : `Яйца (${count} шт)`,
    weightGrams: 50 * count,
    calories: 70 * count,
    protein: 6 * count,
    fats: 5 * count,
    carbs: Math.round(0.4 * count * 10) / 10,
  };
}

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

  // ════════════════════════════════════════════════════════════════════════
  // EXPANSION BATCH — programmatically composed via ing() / egg() helpers.
  // Goal: ~150 additional recipes covering every common Russian-supermarket
  // ingredient + 4 meal slots × 3 goal tiers. KBJU is computed from the
  // KBJU-per-100g table above so totals stay internally consistent.
  // ════════════════════════════════════════════════════════════════════════

  // ─── ОВСЯНКИ И КАШИ (15) ──────────────────────────────────────────────────
  {
    id: 'crecipe0000000breakf001', name: 'Овсянка с яблоком и корицей',
    descriptionRu: 'Тёплый завтрак с натуральной сладостью', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Яблоко', K.apple, 100)],
    steps: ['Залить хлопья молоком, варить 5 мин', 'Добавить нарезанное яблоко', 'Посыпать корицей по вкусу'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf002', name: 'Овсянка с грушей и мёдом',
    descriptionRu: 'Сладкий завтрак без сахара', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Груша', K.pear, 120), ing('Мёд', K.honey, 10)],
    steps: ['Сварить хлопья на молоке 5 мин', 'Добавить нарезанную грушу', 'Полить мёдом'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf003', name: 'Овсянка с ягодами и льняными семенами',
    descriptionRu: 'Антиоксидантный завтрак с омега-3', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Ягоды mix', K.blueberry, 80), ing('Льняные семена', K.flaxseed, 10)],
    steps: ['Сварить овсянку 5 мин', 'Добавить ягоды и льняные семена', 'Перемешать'],
    tags: ['breakfast', 'weight-loss'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf004', name: 'Овсянка на овсяном молоке с черникой',
    descriptionRu: 'Завтрак без молочных продуктов', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Овсяное молоко', K.milkOat, 200), ing('Черника', K.blueberry, 80)],
    steps: ['Залить хлопья овсяным молоком, варить 5 мин', 'Сверху выложить чернику'],
    tags: ['breakfast', 'weight-loss'], allergens: ['gluten'],
  },
  {
    id: 'crecipe0000000breakf005', name: 'Овсянка с малиной и грецким орехом',
    descriptionRu: 'Хрусткий завтрак с белком', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Малина', K.raspberry, 70), ing('Грецкий орех', K.walnut, 15)],
    steps: ['Сварить хлопья на молоке 5 мин', 'Добавить малину и измельчённый орех'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose', 'nuts'],
  },
  {
    id: 'crecipe0000000breakf006', name: 'Овсянка с какао и бананом',
    descriptionRu: 'Шоколадный завтрак с пользой', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Какао-порошок', K.cocoaPowder, 8), ing('Банан', K.banana, 100)],
    steps: ['Сварить хлопья с какао на молоке 5 мин', 'Сверху положить нарезанный банан'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf007', name: 'Овсянка с арахисовой пастой и бананом',
    descriptionRu: 'Высококалорийный завтрак для набора массы', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 60), ing('Молоко 2.5%', K.milkLow, 250), ing('Банан', K.banana, 120), ing('Арахисовая паста', K.peanutButter, 20)],
    steps: ['Сварить хлопья на молоке 5 мин', 'Добавить нарезанный банан', 'Сверху ложка пасты'],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['gluten', 'lactose', 'nuts'],
  },
  {
    id: 'crecipe0000000breakf008', name: 'Овсянка с тыквой и корицей',
    descriptionRu: 'Осенний согревающий завтрак', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Тыква запечённая', K.pumpkin, 150)],
    steps: ['Запечь тыкву 10 мин', 'Сварить овсянку на молоке 5 мин', 'Смешать с тыквенным пюре, посыпать корицей'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf009', name: 'Овсянка с манго и кокосом',
    descriptionRu: 'Тропический завтрак', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Кокосовое молоко light', K.coconutMilkLight, 200), ing('Манго', K.mango, 100)],
    steps: ['Сварить хлопья на кокосовом молоке 5 мин', 'Сверху выложить нарезанное манго'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten'],
  },
  {
    id: 'crecipe0000000breakf010', name: 'Овсянка с финиками и миндалём',
    descriptionRu: 'Натуральный сладкий завтрак', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Финики', K.date, 30), ing('Миндаль', K.almond, 15)],
    steps: ['Сварить хлопья на молоке 5 мин', 'Добавить нарезанные финики и миндаль'],
    tags: ['breakfast', 'gain'], allergens: ['gluten', 'lactose', 'nuts'],
  },
  {
    id: 'crecipe0000000breakf011', name: 'Овсянка с черносливом и грецким орехом',
    descriptionRu: 'Завтрак для мягкого пищеварения', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Чернослив', K.prune, 30), ing('Грецкий орех', K.walnut, 15)],
    steps: ['Сварить хлопья на молоке 5 мин', 'Добавить нарезанный чернослив и орехи'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose', 'nuts'],
  },
  {
    id: 'crecipe0000000breakf012', name: 'Овсянка с курагой и мёдом',
    descriptionRu: 'Сладкий лёгкий завтрак', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Курага', K.driedApricot, 30), ing('Мёд', K.honey, 10)],
    steps: ['Сварить овсянку на молоке 5 мин', 'Добавить нарезанную курагу и мёд'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf013', name: 'Овсянка с яблоком и грецкими орехами',
    descriptionRu: 'Хрустящий сытный завтрак', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Яблоко', K.apple, 100), ing('Грецкий орех', K.walnut, 20)],
    steps: ['Сварить хлопья на молоке 5 мин', 'Добавить нарезанное яблоко', 'Посыпать орехами'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose', 'nuts'],
  },
  {
    id: 'crecipe0000000breakf014', name: 'Овсянка с изюмом и корицей',
    descriptionRu: 'Классическая каша на скорую руку', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Изюм', K.raisin, 25)],
    steps: ['Сварить хлопья на молоке с изюмом 5 мин', 'Посыпать корицей'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf015', name: 'Ночная овсянка с чиа и ягодами',
    descriptionRu: 'Готовится с вечера, утром просто достать', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Семена чиа', K.chiaSeed, 10), ing('Ягоды mix', K.blueberry, 80)],
    steps: ['Смешать хлопья, чиа и молоко в банке', 'Убрать в холодильник на ночь', 'Утром добавить ягоды'],
    tags: ['breakfast', 'weight-loss'], allergens: ['gluten', 'lactose'],
  },

  // ─── ЯЙЦА И БЕЛКОВЫЕ ЗАВТРАКИ (8) ────────────────────────────────────────
  {
    id: 'crecipe0000000breakf016', name: 'Шакшука с томатами и перцем',
    descriptionRu: 'Восточный завтрак из яиц в томатном соусе', prepTimeMin: 20, servings: 2,
    ingredients: [egg(4), ing('Помидоры в собственном соку', K.tomatoCanned, 300), ing('Болгарский перец', K.bellPepper, 150), ing('Лук репчатый', K.onion, 80), ing('Оливковое масло', K.oliveOil, 10)],
    steps: ['Обжарить лук и перец 5 мин', 'Добавить томаты, тушить 8 мин', 'Сделать углубления, разбить туда яйца', 'Накрыть, готовить 5-7 мин'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe0000000breakf017', name: 'Омлет со шпинатом и фетой',
    descriptionRu: 'Средиземноморский завтрак с белком', prepTimeMin: 12, servings: 1,
    ingredients: [egg(3), ing('Шпинат', K.spinach, 60), ing('Фета', K.fetaCheese, 40), ing('Оливковое масло', K.oliveOil, 5)],
    steps: ['Взбить яйца', 'Бросить шпинат на разогретое масло', 'Залить яйцами, посыпать фетой', 'Готовить под крышкой 4 мин'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['eggs', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf018', name: 'Омлет с грибами и зеленью',
    descriptionRu: 'Лесной аромат с утра', prepTimeMin: 15, servings: 1,
    ingredients: [egg(3), ing('Шампиньоны', K.mushroom, 100), ing('Лук репчатый', K.onion, 30), ing('Оливковое масло', K.oliveOil, 5), ing('Укроп', K.dill, 10)],
    steps: ['Обжарить лук и грибы 5 мин', 'Залить взбитыми яйцами', 'Готовить под крышкой 4 мин', 'Посыпать укропом'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe0000000breakf019', name: 'Омлет с курицей и помидорами',
    descriptionRu: 'Сытный белковый завтрак', prepTimeMin: 15, servings: 1,
    ingredients: [egg(3), ing('Куриная грудка варёная', K.chickenBreast, 80), ing('Помидоры', K.tomato, 80)],
    steps: ['Грудку и помидоры нарезать кубиками', 'Обжарить 3 мин', 'Залить взбитыми яйцами', 'Готовить под крышкой 4 мин'],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe0000000breakf020', name: 'Омлет с тунцом и зелёным луком',
    descriptionRu: 'Высокобелковый завтрак', prepTimeMin: 10, servings: 1,
    ingredients: [egg(3), ing('Тунец консервированный', K.tunaCanned, 80), ing('Зелёный лук', K.greenOnion, 20)],
    steps: ['Взбить яйца с тунцом и луком', 'Жарить на сухой сковороде 4 мин под крышкой'],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['eggs', 'fish'],
  },
  {
    id: 'crecipe0000000breakf021', name: 'Скрэмбл с авокадо и тостом',
    descriptionRu: 'Сбалансированный завтрак с полезными жирами', prepTimeMin: 10, servings: 1,
    ingredients: [egg(2), ing('Авокадо', K.avocado, 80), ing('Цельнозерновой хлеб', K.breadWhole, 50)],
    steps: ['Взбить яйца, готовить помешивая 3 мин', 'Поджарить хлеб', 'Размять авокадо на тост', 'Сверху выложить скрэмбл'],
    tags: ['breakfast', 'maintain'], allergens: ['eggs', 'gluten'],
  },
  {
    id: 'crecipe0000000breakf022', name: 'Белковый омлет с зеленью',
    descriptionRu: 'Минимум жира, максимум белка', prepTimeMin: 10, servings: 1,
    ingredients: [egg(4), ing('Зелёный лук', K.greenOnion, 15), ing('Укроп', K.dill, 10)],
    steps: ['Отделить белки от 4 яиц + 1 целое', 'Взбить с зеленью', 'Жарить на сухой сковороде 4 мин'],
    tags: ['breakfast', 'weight-loss', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe0000000breakf023', name: 'Яйца-пашот на цельнозерновом тосте',
    descriptionRu: 'Кафешный классический завтрак', prepTimeMin: 12, servings: 1,
    ingredients: [egg(2), ing('Цельнозерновой хлеб', K.breadWhole, 60), ing('Помидоры', K.tomato, 80)],
    steps: ['Поджарить хлеб', 'Сварить яйца-пашот 3 мин в кипятке с уксусом', 'Выложить на тост, рядом помидоры'],
    tags: ['breakfast', 'maintain'], allergens: ['eggs', 'gluten'],
  },

  // ─── ТВОРОЖНЫЕ ЗАВТРАКИ (6) ──────────────────────────────────────────────
  {
    id: 'crecipe0000000breakf024', name: 'Творог с малиной и мёдом',
    descriptionRu: 'Лёгкий белковый завтрак', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 200), ing('Малина', K.raspberry, 80), ing('Мёд', K.honey, 10)],
    steps: ['Выложить творог в миску', 'Добавить малину, полить мёдом'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf025', name: 'Творог с грушей и грецким орехом',
    descriptionRu: 'Хрустящий завтрак с белком', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 200), ing('Груша', K.pear, 100), ing('Грецкий орех', K.walnut, 15)],
    steps: ['Творог выложить в миску', 'Сверху нарезанная груша и измельчённые орехи'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose', 'nuts'],
  },
  {
    id: 'crecipe0000000breakf026', name: 'Сырники с яблоком и корицей',
    descriptionRu: 'Низкоуглеводные сырники', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 200), egg(1), ing('Овсяные отруби', K.oatBranRaw, 20), ing('Яблоко', K.apple, 80)],
    steps: ['Размять творог с яйцом и отрубями', 'Добавить тёртое яблоко и корицу', 'Слепить сырники, жарить на сухой сковороде по 3 мин с каждой стороны'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose', 'eggs', 'gluten'],
  },
  {
    id: 'crecipe0000000breakf027', name: 'Творожная масса с какао',
    descriptionRu: 'Сладкий завтрак без сахара', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 200), ing('Какао-порошок', K.cocoaPowder, 8), ing('Мёд', K.honey, 15)],
    steps: ['Смешать творог с какао и мёдом', 'Взбить блендером для нежной текстуры'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf028', name: 'Творог с черникой и семенами чиа',
    descriptionRu: 'Антиоксидантный белковый завтрак', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 200), ing('Черника', K.blueberry, 80), ing('Семена чиа', K.chiaSeed, 10)],
    steps: ['Смешать творог с чиа, оставить 5 мин', 'Сверху выложить чернику'],
    tags: ['breakfast', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf029', name: 'Творожная запеканка без муки',
    descriptionRu: 'Высокобелковый завтрак на завтра-послезавтра', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Творог 5%', K.curd5, 400), egg(2), ing('Овсяные отруби', K.oatBranRaw, 30), ing('Изюм', K.raisin, 30)],
    steps: ['Смешать творог, яйца, отруби, изюм', 'Выложить в форму', 'Запекать при 180°C 30 мин'],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['lactose', 'eggs', 'gluten'],
  },

  // ─── СМУЗИ И НАПИТКИ (6) ──────────────────────────────────────────────────
  {
    id: 'crecipe0000000breakf030', name: 'Смузи с бананом и арахисовой пастой',
    descriptionRu: 'Калорийный смузи для набора массы', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Молоко 2.5%', K.milkLow, 250), ing('Банан', K.banana, 150), ing('Арахисовая паста', K.peanutButter, 20), ing('Овсяные хлопья', K.oatsRaw, 30)],
    steps: ['Сложить всё в блендер', 'Взбить 30 секунд'],
    tags: ['breakfast', 'gain'], allergens: ['lactose', 'nuts', 'gluten'],
  },
  {
    id: 'crecipe0000000breakf031', name: 'Зелёный смузи со шпинатом и яблоком',
    descriptionRu: 'Утренний детокс', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Шпинат', K.spinach, 50), ing('Яблоко', K.apple, 150), ing('Банан', K.banana, 100), ing('Вода', { calories: 0, protein: 0, fats: 0, carbs: 0 } as Per100, 200)],
    steps: ['Все ингредиенты в блендер', 'Взбить 45 секунд'],
    tags: ['breakfast', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe0000000breakf032', name: 'Ягодный смузи с греческим йогуртом',
    descriptionRu: 'Свежий завтрак с белком', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Греческий йогурт', K.yogurtGreek, 150), ing('Ягоды mix', K.blueberry, 120), ing('Молоко 2.5%', K.milkLow, 100)],
    steps: ['Все в блендер', 'Взбить до однородности'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf033', name: 'Смузи с манго и кокосовым молоком',
    descriptionRu: 'Тропический безмолочный смузи', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Манго', K.mango, 200), ing('Кокосовое молоко light', K.coconutMilkLight, 250), ing('Банан', K.banana, 80)],
    steps: ['Сложить ингредиенты в блендер', 'Взбить 30 сек'],
    tags: ['breakfast', 'maintain'], allergens: [],
  },
  {
    id: 'crecipe0000000breakf034', name: 'Протеиновый смузи с какао и бананом',
    descriptionRu: 'Послетренировочный завтрак', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Молоко 2.5%', K.milkLow, 250), ing('Сывороточный протеин', K.proteinWhey, 30), ing('Банан', K.banana, 120), ing('Какао-порошок', K.cocoaPowder, 8)],
    steps: ['Все в шейкер', 'Встряхнуть 30 сек'],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf035', name: 'Смузи с клубникой и овсянкой',
    descriptionRu: 'Сытный фруктовый смузи', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Клубника', K.strawberry, 150), ing('Овсяные хлопья', K.oatsRaw, 30), ing('Молоко 2.5%', K.milkLow, 250), ing('Мёд', K.honey, 10)],
    steps: ['Все в блендер', 'Взбить до однородности'],
    tags: ['breakfast', 'maintain'], allergens: ['lactose', 'gluten'],
  },

  // ─── ПРОЧИЕ ЗАВТРАКИ (5) ──────────────────────────────────────────────────
  {
    id: 'crecipe0000000breakf036', name: 'Овсяные блины с творогом',
    descriptionRu: 'ПП-блины без муки', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), egg(2), ing('Молоко 2.5%', K.milkLow, 100), ing('Творог 5%', K.curd5, 100)],
    steps: ['Хлопья измельчить в блендере', 'Смешать с яйцами и молоком', 'Жарить блины на сухой сковороде', 'Подать с творогом'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['gluten', 'lactose', 'eggs'],
  },
  {
    id: 'crecipe0000000breakf037', name: 'Тыквенная каша на молоке',
    descriptionRu: 'Сезонный витаминный завтрак', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Тыква', K.pumpkin, 400), ing('Молоко 2.5%', K.milkLow, 400), ing('Пшено', K.millet, 80), ing('Мёд', K.honey, 20)],
    steps: ['Тыкву нарезать, варить в молоке 15 мин', 'Добавить пшено, варить 12 мин', 'Подать с мёдом'],
    tags: ['breakfast', 'maintain'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf038', name: 'Рисовая каша с яблоком',
    descriptionRu: 'Лёгкая каша на скорую руку', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Рис варёный', K.whiteRiceCooked, 180), ing('Молоко 2.5%', K.milkLow, 200), ing('Яблоко', K.apple, 100)],
    steps: ['Сварить рис', 'Залить тёплым молоком', 'Добавить нарезанное яблоко и корицу'],
    tags: ['breakfast', 'maintain'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf039', name: 'Авокадо-тост с творогом',
    descriptionRu: 'Свежий завтрак за 5 минут', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 60), ing('Авокадо', K.avocado, 80), ing('Творог 5%', K.curd5, 80)],
    steps: ['Поджарить хлеб', 'Размять авокадо', 'Намазать на хлеб творог, сверху авокадо'],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf040', name: 'Авокадо-тост с лососем',
    descriptionRu: 'Завтрак выходного дня', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 60), ing('Авокадо', K.avocado, 80), ing('Лосось солёный', K.salmon, 50)],
    steps: ['Поджарить хлеб', 'Размять авокадо на тост', 'Сверху положить лосось'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['gluten', 'fish'],
  },

  // ─── СУПЫ (10) ────────────────────────────────────────────────────────────
  {
    id: 'crecipe00000000lunch011', name: 'Куриный суп с лапшой',
    descriptionRu: 'Классический согревающий суп', prepTimeMin: 40, servings: 4,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 400), ing('Лапша яичная', K.pastaReg, 100), ing('Морковь', K.carrot, 150), ing('Лук репчатый', K.onion, 100), ing('Картофель', K.potato, 200)],
    steps: ['Грудку залить 1.5 л воды, варить 20 мин', 'Достать мясо, добавить нарезанные овощи и лапшу', 'Варить 10 мин', 'Вернуть нарезанное мясо'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten', 'eggs'],
  },
  {
    id: 'crecipe00000000lunch012', name: 'Постный борщ',
    descriptionRu: 'Лёгкий борщ без мяса', prepTimeMin: 50, servings: 4,
    ingredients: [ing('Свёкла', K.beetroot, 300), ing('Капуста', K.cabbage, 200), ing('Морковь', K.carrot, 100), ing('Картофель', K.potato, 250), ing('Помидоры в собственном соку', K.tomatoCanned, 200)],
    steps: ['Свёклу натереть, потушить 10 мин', 'В кастрюлю с 1.5 л воды добавить картофель, варить 10 мин', 'Добавить капусту, морковь, лук, томаты', 'Варить 15 мин, добавить свёклу'],
    tags: ['lunch', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch013', name: 'Зелёные щи со щавелем',
    descriptionRu: 'Весенний суп с витаминами', prepTimeMin: 40, servings: 4,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 300), ing('Щавель', K.spinach, 200), ing('Картофель', K.potato, 200), egg(2), ing('Морковь', K.carrot, 100)],
    steps: ['Сварить грудку 20 мин в 1.5 л воды', 'Добавить нарезанный картофель и морковь, варить 10 мин', 'Добавить порезанный щавель, варить 5 мин', 'Подать с половинкой яйца'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe00000000lunch014', name: 'Грибной крем-суп',
    descriptionRu: 'Сливочный суп без сливок', prepTimeMin: 30, servings: 3,
    ingredients: [ing('Шампиньоны', K.mushroom, 400), ing('Картофель', K.potato, 200), ing('Молоко 2.5%', K.milkLow, 300), ing('Лук репчатый', K.onion, 80)],
    steps: ['Лук и грибы обжарить 8 мин', 'Добавить картофель и 600 мл воды, варить 15 мин', 'Влить молоко', 'Пробить блендером'],
    tags: ['lunch', 'maintain'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch015', name: 'Гороховый суп с курицей',
    descriptionRu: 'Высокобелковый суп', prepTimeMin: 60, servings: 4,
    ingredients: [ing('Горох сухой', K.lentilRedRaw, 200), ing('Куриная грудка', K.chickenBreast, 300), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80), ing('Картофель', K.potato, 200)],
    steps: ['Горох замочить на ночь', 'Залить 1.5 л воды с горохом и грудкой, варить 30 мин', 'Добавить нарезанные овощи, варить 20 мин', 'Достать мясо, нарезать, вернуть в суп'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch016', name: 'Минестроне с овощами',
    descriptionRu: 'Итальянский овощной суп', prepTimeMin: 35, servings: 3,
    ingredients: [ing('Фасоль белая варёная', K.beanWhiteCooked, 200), ing('Морковь', K.carrot, 100), ing('Сельдерей', { calories: 16, protein: 0.7, fats: 0.2, carbs: 3 } as Per100, 80), ing('Цуккини', K.zucchini, 150), ing('Помидоры в собственном соку', K.tomatoCanned, 250)],
    steps: ['Лук, морковь, сельдерей обжарить 5 мин', 'Добавить помидоры и 1 л воды', 'Через 10 мин — цуккини и фасоль', 'Варить ещё 10 мин'],
    tags: ['lunch', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch017', name: 'Томатный суп с фрикадельками',
    descriptionRu: 'Классика с белком', prepTimeMin: 40, servings: 4,
    ingredients: [ing('Фарш индейки', K.turkeyMince, 300), ing('Помидоры в собственном соку', K.tomatoCanned, 400), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80), ing('Рис варёный', K.whiteRiceCooked, 100)],
    steps: ['Из фарша слепить мелкие фрикадельки', 'Овощи обжарить 5 мин', 'Залить 1.2 л воды и томатами', 'Опустить фрикадельки и рис, варить 15 мин'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch018', name: 'Крем-суп из брокколи',
    descriptionRu: 'Зелёный суп с пользой', prepTimeMin: 25, servings: 3,
    ingredients: [ing('Брокколи', K.broccoli, 500), ing('Картофель', K.potato, 200), ing('Молоко 2.5%', K.milkLow, 250), ing('Лук репчатый', K.onion, 80)],
    steps: ['Лук обжарить, добавить брокколи и картофель', 'Залить 600 мл воды, варить 15 мин', 'Влить молоко', 'Пробить блендером'],
    tags: ['lunch', 'weight-loss'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch019', name: 'Тыквенный крем-суп с имбирём',
    descriptionRu: 'Согревающий осенний суп', prepTimeMin: 30, servings: 3,
    ingredients: [ing('Тыква', K.pumpkin, 600), ing('Морковь', K.carrot, 150), ing('Имбирь', { calories: 80, protein: 1.8, fats: 0.7, carbs: 18 } as Per100, 15), ing('Кокосовое молоко light', K.coconutMilkLight, 200)],
    steps: ['Тыкву и морковь нарезать кубиками', 'Залить 600 мл воды, добавить имбирь, варить 20 мин', 'Влить кокосовое молоко', 'Пробить блендером'],
    tags: ['lunch', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch020', name: 'Уха из трески',
    descriptionRu: 'Лёгкая рыбная уха', prepTimeMin: 35, servings: 3,
    ingredients: [ing('Треска', K.cod, 400), ing('Картофель', K.potato, 250), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80), ing('Лавровый лист', { calories: 0, protein: 0, fats: 0, carbs: 0 } as Per100, 2)],
    steps: ['В кипящую подсолённую воду 1.5 л положить картофель и лук', 'Через 10 мин добавить морковь и лавровый лист', 'Через 5 мин — треску, варить 10 мин'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['fish'],
  },

  // ─── САЛАТЫ (10) ──────────────────────────────────────────────────────────
  {
    id: 'crecipe00000000lunch021', name: 'Цезарь light с курицей',
    descriptionRu: 'Лёгкий цезарь без сухариков и сливок', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 150), ing('Салат ромэн', K.romain, 100), ing('Пармезан', K.parmesan, 20), ing('Греческий йогурт', K.yogurtGreek, 30), ing('Лимон', { calories: 29, protein: 1, fats: 0.3, carbs: 9 } as Per100, 20)],
    steps: ['Грудку обжарить 8 мин с каждой стороны, нарезать', 'Салат порвать руками', 'Йогурт смешать с лимонным соком и тёртым пармезаном', 'Заправить салат, выложить курицу'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch022', name: 'Греческий салат с фетой',
    descriptionRu: 'Классика средиземноморья', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Помидоры', K.tomato, 150), ing('Огурец', K.cucumber, 100), ing('Фета', K.fetaCheese, 60), ing('Маслины', K.oliveBlack, 40), ing('Оливковое масло', K.oliveOil, 8)],
    steps: ['Овощи нарезать крупно', 'Фету кубиками', 'Добавить маслины и масло, перемешать'],
    tags: ['lunch', 'maintain'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch023', name: 'Шопский салат',
    descriptionRu: 'Болгарский овощной салат', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Помидоры', K.tomato, 200), ing('Огурец', K.cucumber, 150), ing('Болгарский перец', K.bellPepper, 100), ing('Брынза', K.brynza, 60)],
    steps: ['Овощи нарезать кубиками', 'Сверху натереть брынзу', 'Полить оливковым маслом'],
    tags: ['lunch', 'weight-loss'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch024', name: 'Овощной салат с курицей',
    descriptionRu: 'Сытный обед с зеленью', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Куриная грудка варёная', K.chickenBreast, 150), ing('Помидоры черри', K.tomato, 100), ing('Огурец', K.cucumber, 100), ing('Микс салатов', K.saladMix, 60)],
    steps: ['Грудку нарезать кубиками', 'Овощи нарезать', 'Смешать с салатом, заправить лимоном'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch025', name: 'Нисуаз с тунцом',
    descriptionRu: 'Французский салат с яйцом и тунцом', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Тунец консервированный', K.tunaCanned, 100), egg(2), ing('Стручковая фасоль', K.greenBeans, 100), ing('Помидоры черри', K.tomato, 100), ing('Маслины', K.oliveBlack, 30)],
    steps: ['Сварить яйца 8 мин, фасоль 5 мин', 'Нарезать всё, выложить на тарелку', 'Полить оливковым маслом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['eggs', 'fish'],
  },
  {
    id: 'crecipe00000000lunch026', name: 'Табуле с булгуром',
    descriptionRu: 'Левантийский травяной салат', prepTimeMin: 25, servings: 2,
    ingredients: [ing('Булгур варёный', K.bulgurCooked, 200), ing('Петрушка', K.parsley, 80), ing('Помидоры', K.tomato, 200), ing('Лимон', { calories: 29, protein: 1, fats: 0.3, carbs: 9 } as Per100, 30), ing('Оливковое масло', K.oliveOil, 10)],
    steps: ['Сварить булгур 15 мин', 'Нарезать петрушку и помидоры мелко', 'Смешать с булгуром, заправить лимоном и маслом'],
    tags: ['lunch', 'maintain'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000lunch027', name: 'Салат с киноа и овощами',
    descriptionRu: 'Растительный белок и клетчатка', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Киноа варёная', K.quinoaCooked, 150), ing('Огурец', K.cucumber, 100), ing('Помидоры черри', K.tomato, 100), ing('Авокадо', K.avocado, 60)],
    steps: ['Сварить киноа 15 мин и остудить', 'Овощи и авокадо нарезать кубиками', 'Смешать, заправить лимоном'],
    tags: ['lunch', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch028', name: 'Тёплый салат с тунцом',
    descriptionRu: 'Сытный белковый салат', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Тунец стейк', K.tuna, 150), ing('Картофель', K.potato, 200), ing('Стручковая фасоль', K.greenBeans, 100), ing('Микс салатов', K.saladMix, 60)],
    steps: ['Картофель и фасоль отварить', 'Тунец обжарить по 2 мин с каждой стороны', 'Выложить всё тёплым на салат, заправить маслом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe00000000lunch029', name: 'Салат с креветками и рукколой',
    descriptionRu: 'Лёгкий ресторанный салат', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Креветки', K.shrimp, 200), ing('Руккола', K.arugula, 80), ing('Помидоры черри', K.tomato, 100), ing('Авокадо', K.avocado, 80), ing('Оливковое масло', K.oliveOil, 8)],
    steps: ['Креветки отварить 3 мин', 'Авокадо и помидоры нарезать', 'Смешать с рукколой и креветками', 'Полить маслом и лимоном'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch030', name: 'Оливье light',
    descriptionRu: 'Лёгкий оливье на йогурте', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Куриная грудка варёная', K.chickenBreast, 200), ing('Картофель', K.potato, 200), egg(3), ing('Огурец солёный', K.cucumber, 150), ing('Греческий йогурт', K.yogurtGreek, 100), ing('Зелёный горошек', K.peasFrozen, 80)],
    steps: ['Картофель и яйца отварить', 'Всё нарезать кубиками', 'Заправить йогуртом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['eggs', 'lactose'],
  },

  // ─── БОУЛЫ И КРУПЫ (8) ────────────────────────────────────────────────────
  {
    id: 'crecipe00000000lunch031', name: 'Боул с курицей и киноа',
    descriptionRu: 'Готовый обед на работу', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 150), ing('Киноа варёная', K.quinoaCooked, 150), ing('Брокколи', K.broccoli, 100), ing('Морковь', K.carrot, 80)],
    steps: ['Сварить киноа', 'Грудку обжарить 8 мин', 'Брокколи и морковь приготовить на пару', 'Сложить в боул'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch032', name: 'Боул с лососем и бурым рисом',
    descriptionRu: 'Омега-3 и сложные углеводы', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Лосось', K.salmon, 150), ing('Бурый рис варёный', K.brownRiceCooked, 180), ing('Авокадо', K.avocado, 60), ing('Огурец', K.cucumber, 80)],
    steps: ['Сварить рис', 'Лосось обжарить по 4 мин с каждой стороны', 'Нарезать авокадо и огурец', 'Сложить в боул'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe00000000lunch033', name: 'Боул с индейкой и гречкой',
    descriptionRu: 'Спортивный обед', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Филе индейки', K.turkeyBreast, 180), ing('Гречка варёная', K.buckwheatCooked, 180), ing('Болгарский перец', K.bellPepper, 100), ing('Огурец', K.cucumber, 80)],
    steps: ['Сварить гречку 15 мин', 'Индейку обжарить 8 мин с каждой стороны', 'Овощи нарезать', 'Сложить в боул'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch034', name: 'Боул с креветками и булгуром',
    descriptionRu: 'Средиземноморский лёгкий обед', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Креветки', K.shrimp, 200), ing('Булгур варёный', K.bulgurCooked, 150), ing('Авокадо', K.avocado, 60), ing('Помидоры черри', K.tomato, 100)],
    steps: ['Сварить булгур 15 мин', 'Креветки отварить 3 мин', 'Овощи нарезать', 'Сложить в боул'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000lunch035', name: 'Боул с тунцом и авокадо',
    descriptionRu: 'Японский поке light', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Тунец консервированный', K.tunaCanned, 120), ing('Бурый рис варёный', K.brownRiceCooked, 150), ing('Авокадо', K.avocado, 80), ing('Огурец', K.cucumber, 100), ing('Соевый соус', K.soyaSauce, 10)],
    steps: ['Сварить рис', 'Авокадо и огурец нарезать', 'Тунец размять вилкой', 'Сложить в боул, полить соевым соусом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['fish', 'soy'],
  },
  {
    id: 'crecipe00000000lunch036', name: 'Боул с курицей и сладким картофелем',
    descriptionRu: 'Питательный осенний боул', prepTimeMin: 35, servings: 1,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 150), ing('Сладкий картофель', K.sweetPotato, 200), ing('Брокколи', K.broccoli, 100), ing('Шпинат', K.spinach, 50)],
    steps: ['Сладкий картофель нарезать кубиками, запекать 25 мин', 'Грудку обжарить 8 мин с каждой стороны', 'Брокколи на пару 5 мин', 'Сложить в боул со шпинатом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000lunch037', name: 'Боул с фалафелем и нутом',
    descriptionRu: 'Веганский белковый обед', prepTimeMin: 30, servings: 1,
    ingredients: [ing('Нут варёный', K.chickpeasCooked, 200), ing('Булгур варёный', K.bulgurCooked, 150), ing('Огурец', K.cucumber, 100), ing('Хумус', K.hummus, 50)],
    steps: ['Нут размять с зеленью, слепить котлетки, обжарить 8 мин', 'Сварить булгур 15 мин', 'Огурец нарезать', 'Сложить в боул с хумусом'],
    tags: ['lunch', 'maintain'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000lunch038', name: 'Овощной боул с киноа',
    descriptionRu: 'Веганский обед с растительным белком', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Киноа варёная', K.quinoaCooked, 150), ing('Нут варёный', K.chickpeasCooked, 100), ing('Авокадо', K.avocado, 60), ing('Помидоры черри', K.tomato, 100), ing('Шпинат', K.spinach, 50)],
    steps: ['Сварить киноа', 'Овощи нарезать', 'Сложить в боул, полить лимонным соком и оливковым маслом'],
    tags: ['lunch', 'weight-loss'], allergens: [],
  },

  // ─── РОЛЛЫ И ПАСТА (9) ────────────────────────────────────────────────────
  {
    id: 'crecipe00000000lunch039', name: 'Лаваш с курицей и овощами',
    descriptionRu: 'Сытный ролл с собой', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Лаваш тонкий', K.flatbread, 80), ing('Куриная грудка варёная', K.chickenBreast, 120), ing('Помидоры', K.tomato, 80), ing('Микс салатов', K.saladMix, 40)],
    steps: ['Грудку нарезать соломкой', 'На лаваш выложить салат, помидоры, курицу', 'Свернуть рулетом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000lunch040', name: 'Лаваш с тунцом и шпинатом',
    descriptionRu: 'Быстрый ролл с белком', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Лаваш тонкий', K.flatbread, 80), ing('Тунец консервированный', K.tunaCanned, 100), ing('Шпинат', K.spinach, 40), ing('Греческий йогурт', K.yogurtGreek, 30)],
    steps: ['Тунец размять с йогуртом', 'На лаваш выложить шпинат и тунец', 'Свернуть'],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['gluten', 'fish', 'lactose'],
  },
  {
    id: 'crecipe00000000lunch041', name: 'Лаваш с творогом и зеленью',
    descriptionRu: 'Лёгкий вегетарианский ролл', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Лаваш тонкий', K.flatbread, 80), ing('Творог 5%', K.curd5, 150), ing('Укроп', K.dill, 15), ing('Огурец', K.cucumber, 80)],
    steps: ['Творог смешать с измельчённым укропом', 'На лаваш намазать творог, выложить нарезанный огурец', 'Свернуть'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe00000000lunch042', name: 'Лаваш с хумусом и овощами',
    descriptionRu: 'Веганский ролл с растительным белком', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Лаваш тонкий', K.flatbread, 80), ing('Хумус', K.hummus, 60), ing('Болгарский перец', K.bellPepper, 80), ing('Огурец', K.cucumber, 80), ing('Микс салатов', K.saladMix, 40)],
    steps: ['Намазать на лаваш хумус', 'Выложить нарезанные овощи и салат', 'Свернуть'],
    tags: ['lunch', 'weight-loss'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000lunch043', name: 'Шаурма куриная light',
    descriptionRu: 'Домашняя шаурма без жирного соуса', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Лаваш тонкий', K.flatbread, 100), ing('Куриная грудка', K.chickenBreast, 180), ing('Помидоры', K.tomato, 80), ing('Огурец', K.cucumber, 80), ing('Греческий йогурт', K.yogurtGreek, 50)],
    steps: ['Грудку обжарить 10 мин, нарезать соломкой', 'Йогурт смешать с давленым чесноком', 'Выложить начинку на лаваш с соусом', 'Свернуть рулетом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe00000000lunch044', name: 'Паста с курицей и брокколи',
    descriptionRu: 'Сбалансированный обед', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Паста цельнозерновая сухая', K.pastaWhole, 80), ing('Куриная грудка', K.chickenBreast, 150), ing('Брокколи', K.broccoli, 150), ing('Оливковое масло', K.oliveOil, 8)],
    steps: ['Сварить пасту al dente', 'Грудку нарезать кубиками, обжарить 6 мин', 'Брокколи на пару 5 мин', 'Смешать всё, полить маслом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000lunch045', name: 'Паста с тунцом и томатами',
    descriptionRu: 'Итальянская паста на скорую руку', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Паста цельнозерновая сухая', K.pastaWhole, 80), ing('Тунец консервированный', K.tunaCanned, 120), ing('Помидоры в собственном соку', K.tomatoCanned, 200), ing('Чеснок', K.garlic, 5)],
    steps: ['Сварить пасту', 'Чеснок обжарить 30 сек', 'Добавить томаты и тунец, тушить 5 мин', 'Смешать с пастой'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten', 'fish'],
  },
  {
    id: 'crecipe00000000lunch046', name: 'Паста с грибами в сливочном соусе',
    descriptionRu: 'Кремовая паста на молоке', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Паста цельнозерновая сухая', K.pastaWhole, 80), ing('Шампиньоны', K.mushroom, 200), ing('Молоко 2.5%', K.milkLow, 200), ing('Пармезан', K.parmesan, 20)],
    steps: ['Сварить пасту', 'Грибы обжарить 8 мин', 'Влить молоко, тушить 5 мин до загустения', 'Смешать с пастой и пармезаном'],
    tags: ['lunch', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe00000000lunch047', name: 'Паста с креветками и чесноком',
    descriptionRu: 'Лёгкая морская паста', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Паста цельнозерновая сухая', K.pastaWhole, 80), ing('Креветки', K.shrimp, 200), ing('Чеснок', K.garlic, 5), ing('Оливковое масло', K.oliveOil, 10)],
    steps: ['Сварить пасту', 'Чеснок обжарить 30 сек', 'Добавить креветки, обжарить 3 мин', 'Смешать с пастой'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['gluten'],
  },

  // ─── АЗИАТСКАЯ КУХНЯ (3) ──────────────────────────────────────────────────
  {
    id: 'crecipe00000000lunch048', name: 'Рис с курицей и соевым соусом',
    descriptionRu: 'Просто и быстро в азиатском стиле', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 180), ing('Бурый рис варёный', K.brownRiceCooked, 180), ing('Болгарский перец', K.bellPepper, 100), ing('Соевый соус', K.soyaSauce, 15)],
    steps: ['Сварить рис', 'Грудку нарезать кубиками, обжарить 5 мин', 'Добавить перец, тушить 5 мин', 'Влить соевый соус, подать с рисом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['soy'],
  },
  {
    id: 'crecipe00000000lunch049', name: 'Гречневая лапша с овощами',
    descriptionRu: 'Японская соба с овощами', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Гречневая лапша сухая', K.pastaWhole, 80), ing('Болгарский перец', K.bellPepper, 80), ing('Морковь', K.carrot, 80), ing('Соевый соус', K.soyaSauce, 15), ing('Кунжутное масло', K.sunflowerOil, 5)],
    steps: ['Сварить лапшу 4 мин', 'Овощи нарезать соломкой, обжарить 5 мин', 'Смешать с лапшой', 'Заправить соевым соусом и маслом'],
    tags: ['lunch', 'weight-loss'], allergens: ['gluten', 'soy'],
  },
  {
    id: 'crecipe00000000lunch050', name: 'Донбури с лососем и авокадо',
    descriptionRu: 'Японский рисовый боул', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Лосось', K.salmon, 150), ing('Бурый рис варёный', K.brownRiceCooked, 200), ing('Авокадо', K.avocado, 80), ing('Огурец', K.cucumber, 80), ing('Соевый соус', K.soyaSauce, 10)],
    steps: ['Сварить рис', 'Лосось обжарить по 3 мин с каждой стороны', 'Нарезать авокадо и огурец кубиками', 'Сложить рис, сверху лосось и овощи, полить соевым соусом'],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['fish', 'soy'],
  },

  // ─── ДОПОЛНИТЕЛЬНЫЕ УЖИНЫ — КУРИЦА (10) ───────────────────────────────────
  {
    id: 'crecipe000000dinner009', name: 'Запечённое куриное филе с лимоном',
    descriptionRu: 'Простой ужин в один противень', prepTimeMin: 30, servings: 1,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 200), ing('Лимон', { calories: 29, protein: 1, fats: 0.3, carbs: 9 } as Per100, 30), ing('Цуккини', K.zucchini, 150), ing('Оливковое масло', K.oliveOil, 5)],
    steps: ['Грудку посолить и сбрызнуть лимоном', 'Цуккини нарезать кружками', 'Запекать всё при 200°C 25 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner010', name: 'Куриные бёдра в духовке с травами',
    descriptionRu: 'Сочные бёдра с прованскими травами', prepTimeMin: 45, servings: 2,
    ingredients: [ing('Куриные бёдра', K.chickenThigh, 400), ing('Картофель', K.potato, 300), ing('Морковь', K.carrot, 150), ing('Оливковое масло', K.oliveOil, 10)],
    steps: ['Бёдра посолить и натереть травами', 'Овощи нарезать, выложить в форму с бёдрами', 'Запекать при 190°C 35 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner011', name: 'Куриные котлеты на пару',
    descriptionRu: 'Диетические сочные котлеты', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Фарш куриный', K.chickenBreast, 400), ing('Лук репчатый', K.onion, 60), egg(1), ing('Овсяные хлопья', K.oatsRaw, 30)],
    steps: ['Фарш смешать с измельчённым луком, яйцом и хлопьями', 'Слепить котлеты', 'Готовить на пару 20 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['eggs', 'gluten'],
  },
  {
    id: 'crecipe000000dinner012', name: 'Куриная грудка с овощным соте',
    descriptionRu: 'Сезонный овощной ужин', prepTimeMin: 30, servings: 1,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 180), ing('Цуккини', K.zucchini, 150), ing('Болгарский перец', K.bellPepper, 100), ing('Помидоры', K.tomato, 100)],
    steps: ['Грудку обжарить 8 мин с каждой стороны', 'Овощи нарезать кубиками, тушить 12 мин', 'Подать вместе'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner013', name: 'Курица с овощами в кефире',
    descriptionRu: 'Сочная курица в маринаде', prepTimeMin: 50, servings: 2,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 400), ing('Кефир 1%', { calories: 38, protein: 3, fats: 1, carbs: 4 } as Per100, 200), ing('Болгарский перец', K.bellPepper, 200), ing('Лук репчатый', K.onion, 100)],
    steps: ['Грудку замариновать в кефире 30 мин', 'Выложить в форму с овощами', 'Запекать при 200°C 30 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000dinner014', name: 'Куриные рулетики с сыром',
    descriptionRu: 'Сытный праздничный ужин', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 400), ing('Сыр твёрдый', K.hardCheese20, 80), ing('Шпинат', K.spinach, 80)],
    steps: ['Грудку отбить пластами', 'Выложить шпинат и сыр, свернуть рулетиками', 'Запекать при 200°C 25 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000dinner015', name: 'Цыплёнок табака',
    descriptionRu: 'Грузинская классика', prepTimeMin: 50, servings: 2,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 400), ing('Чеснок', K.garlic, 10), ing('Оливковое масло', K.oliveOil, 10)],
    steps: ['Грудку отбить, натереть чесноком и солью', 'Жарить под прессом 15 мин с каждой стороны'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner016', name: 'Курица в томатном соусе',
    descriptionRu: 'Тушёная курица для ужина', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Куриные бёдра', K.chickenLeg, 400), ing('Помидоры в собственном соку', K.tomatoCanned, 300), ing('Лук репчатый', K.onion, 100), ing('Чеснок', K.garlic, 10)],
    steps: ['Бёдра обжарить по 3 мин с каждой стороны', 'Лук обжарить, добавить томаты и чеснок', 'Залить курицу, тушить 25 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner017', name: 'Куриные шашлычки с овощами',
    descriptionRu: 'Шпажки с белком и овощами', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 400), ing('Болгарский перец', K.bellPepper, 200), ing('Лук репчатый', K.onion, 100), ing('Соевый соус', K.soyaSauce, 20)],
    steps: ['Грудку нарезать кубиками 3 см, замариновать в соусе 10 мин', 'Нанизать с овощами на шпажки', 'Жарить на гриле 12 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['soy'],
  },
  {
    id: 'crecipe000000dinner018', name: 'Куриная грудка по-итальянски',
    descriptionRu: 'Запечённая под помидорами и моцареллой', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Куриная грудка', K.chickenBreast, 400), ing('Помидоры', K.tomato, 200), ing('Моцарелла', K.mozzarella, 100), ing('Базилик', K.parsley, 10)],
    steps: ['Грудку выложить в форму', 'Сверху помидоры и моцарелла', 'Запекать при 200°C 25 мин', 'Посыпать базиликом'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['lactose'],
  },

  // ─── РЫБА (8) ─────────────────────────────────────────────────────────────
  {
    id: 'crecipe000000dinner019', name: 'Лосось запечённый с лимоном',
    descriptionRu: 'Сочный лосось за 20 минут', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Лосось', K.salmon, 200), ing('Лимон', { calories: 29, protein: 1, fats: 0.3, carbs: 9 } as Per100, 30), ing('Спаржа', K.asparagus, 150)],
    steps: ['Лосось посолить, сбрызнуть лимоном', 'Спаржу выложить рядом', 'Запекать при 200°C 18 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe000000dinner020', name: 'Треска на пару с овощами',
    descriptionRu: 'Самый диетический ужин', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Треска', K.cod, 200), ing('Брокколи', K.broccoli, 150), ing('Морковь', K.carrot, 100)],
    steps: ['В пароварке готовить треску 12 мин', 'Брокколи и морковь рядом 10 мин', 'Подать с лимоном'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe000000dinner021', name: 'Минтай в томатном соусе',
    descriptionRu: 'Простая рыба к ужину', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Минтай', K.hake, 400), ing('Лук репчатый', K.onion, 100), ing('Морковь', K.carrot, 150), ing('Помидоры в собственном соку', K.tomatoCanned, 200)],
    steps: ['Лук и морковь обжарить 5 мин', 'Добавить помидоры, тушить 5 мин', 'Уложить минтай, тушить 15 мин под крышкой'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe000000dinner022', name: 'Форель запечённая с травами',
    descriptionRu: 'Праздничная рыба за 25 минут', prepTimeMin: 25, servings: 2,
    ingredients: [ing('Форель', K.trout, 400), ing('Розмарин', K.parsley, 5), ing('Лимон', { calories: 29, protein: 1, fats: 0.3, carbs: 9 } as Per100, 40), ing('Оливковое масло', K.oliveOil, 10)],
    steps: ['Форель разрезать вдоль, посолить', 'Внутрь положить розмарин и ломтики лимона', 'Запекать при 200°C 20 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe000000dinner023', name: 'Хек в духовке с морковью',
    descriptionRu: 'Доступная рыба с овощами', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Хек', K.hake, 400), ing('Морковь', K.carrot, 200), ing('Лук репчатый', K.onion, 100), ing('Сметана 10%', K.sourCream10, 100)],
    steps: ['Лук и морковь натереть', 'Хек выложить на овощную подушку', 'Залить сметаной, запекать при 180°C 25 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['fish', 'lactose'],
  },
  {
    id: 'crecipe000000dinner024', name: 'Лосось гриль со спаржей',
    descriptionRu: 'Ресторанный ужин дома', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Лосось', K.salmon, 180), ing('Спаржа', K.asparagus, 150), ing('Оливковое масло', K.oliveOil, 8)],
    steps: ['Лосось обжарить 4 мин с каждой стороны на сковороде-гриль', 'Спаржу обжарить 5 мин', 'Подать вместе с долькой лимона'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['fish'],
  },
  {
    id: 'crecipe000000dinner025', name: 'Котлеты из трески',
    descriptionRu: 'Нежные рыбные котлеты', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Треска', K.cod, 400), egg(1), ing('Лук репчатый', K.onion, 60), ing('Овсяные хлопья', K.oatsRaw, 30)],
    steps: ['Треску пробить блендером', 'Смешать с яйцом, луком, хлопьями', 'Слепить котлеты, запекать при 180°C 20 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['fish', 'eggs', 'gluten'],
  },
  {
    id: 'crecipe000000dinner026', name: 'Скумбрия запечённая в фольге',
    descriptionRu: 'Жирная рыба с омега-3', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Скумбрия', K.mackerel, 400), ing('Лук репчатый', K.onion, 100), ing('Лимон', { calories: 29, protein: 1, fats: 0.3, carbs: 9 } as Per100, 50)],
    steps: ['Рыбу выпотрошить, посолить', 'Внутрь положить лук кольцами и лимон', 'Запекать в фольге при 200°C 25 мин'],
    tags: ['dinner', 'gain', 'high-protein'], allergens: ['fish'],
  },

  // ─── ГОВЯДИНА (6) ─────────────────────────────────────────────────────────
  {
    id: 'crecipe000000dinner027', name: 'Стейк говяжий с овощами',
    descriptionRu: 'Сочный стейк с гарниром', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Говяжий стейк', K.beefSteak, 200), ing('Брокколи', K.broccoli, 150), ing('Грибы шампиньоны', K.mushroom, 100)],
    steps: ['Стейк обжарить по 4 мин с каждой стороны (medium)', 'Брокколи на пару 5 мин', 'Грибы обжарить 6 мин', 'Подать всё вместе'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner028', name: 'Тефтели в томате',
    descriptionRu: 'Домашние тефтели в подливке', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Фарш говяжий', K.beefMince, 400), ing('Помидоры в собственном соку', K.tomatoCanned, 300), egg(1), ing('Бурый рис варёный', K.brownRiceCooked, 100)],
    steps: ['Фарш смешать с яйцом и рисом, слепить тефтели', 'Обжарить 5 мин', 'Залить томатами, тушить 20 мин'],
    tags: ['dinner', 'gain', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe000000dinner029', name: 'Плов с говядиной (light)',
    descriptionRu: 'Облегчённая версия плова', prepTimeMin: 60, servings: 4,
    ingredients: [ing('Говядина', K.beef, 500), ing('Бурый рис', K.brownRiceCooked, 400), ing('Морковь', K.carrot, 200), ing('Лук репчатый', K.onion, 150), ing('Чеснок', K.garlic, 10)],
    steps: ['Говядину нарезать, обжарить 5 мин', 'Лук и морковь добавить, обжарить 8 мин', 'Залить водой, тушить 25 мин', 'Добавить рис, варить ещё 20 мин'],
    tags: ['dinner', 'gain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner030', name: 'Бефстроганов light',
    descriptionRu: 'Без жирной сметаны', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Говядина', K.beef, 300), ing('Лук репчатый', K.onion, 100), ing('Шампиньоны', K.mushroom, 200), ing('Греческий йогурт', K.yogurtGreek, 100)],
    steps: ['Говядину нарезать соломкой, обжарить 5 мин', 'Добавить лук и грибы, тушить 10 мин', 'Влить йогурт, прогреть 3 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000dinner031', name: 'Котлеты говяжьи на пару',
    descriptionRu: 'Диетические котлеты', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Фарш говяжий', K.beefMince, 400), ing('Лук репчатый', K.onion, 60), egg(1), ing('Овсяные хлопья', K.oatsRaw, 30)],
    steps: ['Смешать фарш, лук, яйцо, хлопья', 'Слепить котлеты', 'Готовить на пару 20 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['eggs', 'gluten'],
  },
  {
    id: 'crecipe000000dinner032', name: 'Гуляш говяжий',
    descriptionRu: 'Тушёное мясо с подливкой', prepTimeMin: 75, servings: 3,
    ingredients: [ing('Говядина', K.beef, 500), ing('Лук репчатый', K.onion, 200), ing('Морковь', K.carrot, 150), ing('Болгарский перец', K.bellPepper, 200), ing('Томатная паста', { calories: 92, protein: 5, fats: 0.5, carbs: 19 } as Per100, 50)],
    steps: ['Говядину нарезать кубиками, обжарить 5 мин', 'Добавить лук и морковь, тушить 10 мин', 'Залить водой и томатной пастой, тушить 50 мин', 'Добавить перец на последние 10 мин'],
    tags: ['dinner', 'gain', 'high-protein'], allergens: [],
  },

  // ─── ИНДЕЙКА (5) ──────────────────────────────────────────────────────────
  {
    id: 'crecipe000000dinner033', name: 'Филе индейки запечённое',
    descriptionRu: 'Постный белок к ужину', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Филе индейки', K.turkeyBreast, 400), ing('Цуккини', K.zucchini, 200), ing('Морковь', K.carrot, 100)],
    steps: ['Филе посолить, выложить в форму с овощами', 'Сбрызнуть оливковым маслом', 'Запекать при 200°C 25 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner034', name: 'Котлеты из индейки',
    descriptionRu: 'Сочные диетические котлеты', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Фарш индейки', K.turkeyMince, 400), ing('Лук репчатый', K.onion, 60), egg(1), ing('Овсяные хлопья', K.oatsRaw, 30)],
    steps: ['Смешать фарш с измельчённым луком, яйцом, хлопьями', 'Слепить котлеты', 'Запекать при 180°C 20 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['eggs', 'gluten'],
  },
  {
    id: 'crecipe000000dinner035', name: 'Индейка тушёная с овощами',
    descriptionRu: 'Тушёное рагу из индейки', prepTimeMin: 40, servings: 2,
    ingredients: [ing('Филе индейки', K.turkeyBreast, 400), ing('Цуккини', K.zucchini, 200), ing('Морковь', K.carrot, 150), ing('Помидоры в собственном соку', K.tomatoCanned, 200)],
    steps: ['Индейку нарезать кубиками, обжарить 5 мин', 'Добавить морковь, тушить 10 мин', 'Добавить цуккини и томаты, тушить 15 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner036', name: 'Индейка с рисом и грибами',
    descriptionRu: 'Уютный домашний ужин', prepTimeMin: 40, servings: 2,
    ingredients: [ing('Филе индейки', K.turkeyBreast, 350), ing('Бурый рис варёный', K.brownRiceCooked, 200), ing('Шампиньоны', K.mushroom, 200), ing('Лук репчатый', K.onion, 80)],
    steps: ['Индейку нарезать, обжарить 5 мин', 'Лук и грибы добавить, тушить 10 мин', 'Подать с рисом'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner037', name: 'Тефтели из индейки в томате',
    descriptionRu: 'Лёгкие тефтели', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Фарш индейки', K.turkeyMince, 400), ing('Помидоры в собственном соку', K.tomatoCanned, 300), egg(1), ing('Бурый рис варёный', K.brownRiceCooked, 80)],
    steps: ['Фарш смешать с яйцом и рисом, слепить тефтели', 'Обжарить 4 мин', 'Залить томатами, тушить 20 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['eggs'],
  },

  // ─── ВЕГЕТАРИАНСКИЕ УЖИНЫ (5) ─────────────────────────────────────────────
  {
    id: 'crecipe000000dinner038', name: 'Чечевица с овощами и томатами',
    descriptionRu: 'Сытный веганский ужин', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Чечевица варёная', K.lentilCooked, 300), ing('Помидоры в собственном соку', K.tomatoCanned, 200), ing('Морковь', K.carrot, 150), ing('Лук репчатый', K.onion, 100)],
    steps: ['Лук и морковь обжарить 5 мин', 'Добавить чечевицу и томаты, тушить 15 мин'],
    tags: ['dinner', 'maintain'], allergens: [],
  },
  {
    id: 'crecipe000000dinner039', name: 'Нут карри с овощами',
    descriptionRu: 'Индийский веганский ужин', prepTimeMin: 30, servings: 2,
    ingredients: [ing('Нут варёный', K.chickpeasCooked, 400), ing('Кокосовое молоко light', K.coconutMilkLight, 200), ing('Помидоры в собственном соку', K.tomatoCanned, 200), ing('Карри-паста', { calories: 100, protein: 3, fats: 5, carbs: 13 } as Per100, 30)],
    steps: ['Карри-пасту обжарить 1 мин', 'Добавить томаты, тушить 5 мин', 'Влить кокосовое молоко и нут, тушить 15 мин'],
    tags: ['dinner', 'maintain'], allergens: [],
  },
  {
    id: 'crecipe000000dinner040', name: 'Овощное рагу с грибами',
    descriptionRu: 'Лёгкое рагу для ужина', prepTimeMin: 35, servings: 2,
    ingredients: [ing('Цуккини', K.zucchini, 250), ing('Баклажан', K.eggplant, 200), ing('Помидоры', K.tomato, 200), ing('Шампиньоны', K.mushroom, 200), ing('Лук репчатый', K.onion, 100)],
    steps: ['Лук обжарить 3 мин', 'Добавить грибы и баклажан, тушить 10 мин', 'Добавить цуккини и помидоры, тушить 15 мин'],
    tags: ['dinner', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe000000dinner041', name: 'Запечённые баклажаны с творогом',
    descriptionRu: 'Низкокалорийный ужин', prepTimeMin: 40, servings: 2,
    ingredients: [ing('Баклажаны', K.eggplant, 400), ing('Творог 5%', K.curd5, 200), ing('Помидоры', K.tomato, 150), ing('Сыр твёрдый', K.hardCheese20, 50)],
    steps: ['Баклажаны нарезать пластами, посолить, дать стечь 10 мин', 'Выложить в форму слоями: баклажан-творог-помидор', 'Посыпать сыром, запекать при 200°C 25 мин'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000dinner042', name: 'Тыквенное рагу с нутом',
    descriptionRu: 'Веганское рагу для холодных вечеров', prepTimeMin: 40, servings: 2,
    ingredients: [ing('Тыква', K.pumpkin, 400), ing('Нут варёный', K.chickpeasCooked, 250), ing('Лук репчатый', K.onion, 100), ing('Помидоры в собственном соку', K.tomatoCanned, 200)],
    steps: ['Тыкву нарезать кубиками', 'Лук обжарить, добавить тыкву, тушить 10 мин', 'Добавить нут и томаты, тушить 20 мин'],
    tags: ['dinner', 'maintain'], allergens: [],
  },

  // ─── СВИНИНА (3) ──────────────────────────────────────────────────────────
  {
    id: 'crecipe000000dinner043', name: 'Свиная отбивная light',
    descriptionRu: 'Запечённая, без панировки', prepTimeMin: 30, servings: 1,
    ingredients: [ing('Свинина нежирная', K.porkLean, 200), ing('Цуккини', K.zucchini, 150), ing('Болгарский перец', K.bellPepper, 100)],
    steps: ['Свинину отбить, посолить', 'Овощи нарезать кружками', 'Запекать всё при 200°C 25 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner044', name: 'Свинина тушёная с капустой',
    descriptionRu: 'Бигус по-домашнему', prepTimeMin: 50, servings: 3,
    ingredients: [ing('Свинина нежирная', K.porkLean, 400), ing('Капуста', K.cabbage, 500), ing('Лук репчатый', K.onion, 150), ing('Морковь', K.carrot, 100)],
    steps: ['Свинину нарезать, обжарить 5 мин', 'Лук и морковь добавить, тушить 5 мин', 'Капусту нашинковать, добавить с водой', 'Тушить 35 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000dinner045', name: 'Эскалоп свиной с горчицей',
    descriptionRu: 'Быстрый ужин на сковороде', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Свинина нежирная', K.porkLean, 200), ing('Горчица', { calories: 64, protein: 4, fats: 4, carbs: 5 } as Per100, 15), ing('Брокколи', K.broccoli, 200)],
    steps: ['Свинину отбить, смазать горчицей', 'Жарить 5 мин с каждой стороны', 'Брокколи готовить на пару'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: [],
  },

  // ─── МОРЕПРОДУКТЫ (3) ─────────────────────────────────────────────────────
  {
    id: 'crecipe000000dinner046', name: 'Креветки с рисом и овощами',
    descriptionRu: 'Лёгкий азиатский ужин', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Креветки', K.shrimp, 200), ing('Бурый рис варёный', K.brownRiceCooked, 180), ing('Болгарский перец', K.bellPepper, 100), ing('Соевый соус', K.soyaSauce, 15)],
    steps: ['Сварить рис', 'Креветки и перец обжарить 5 мин', 'Влить соевый соус', 'Подать с рисом'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['soy'],
  },
  {
    id: 'crecipe000000dinner047', name: 'Креветки в чесночно-сливочном соусе',
    descriptionRu: 'Ресторанные креветки на ужин', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Креветки', K.shrimp, 250), ing('Чеснок', K.garlic, 10), ing('Молоко 2.5%', K.milkLow, 100), ing('Пармезан', K.parmesan, 20)],
    steps: ['Чеснок обжарить 30 сек', 'Добавить креветки, обжарить 3 мин', 'Влить молоко с пармезаном, тушить 3 мин'],
    tags: ['dinner', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000dinner048', name: 'Кальмары жареные с овощами',
    descriptionRu: 'Лёгкий белковый ужин', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Кальмары', K.squid, 250), ing('Болгарский перец', K.bellPepper, 100), ing('Лук репчатый', K.onion, 80), ing('Соевый соус', K.soyaSauce, 10)],
    steps: ['Кальмары нарезать кольцами', 'Лук обжарить 3 мин, добавить перец', 'Добавить кальмары, жарить 3 мин', 'Влить соевый соус'],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['soy'],
  },

  // ─── ПЕРЕКУСЫ (30) ────────────────────────────────────────────────────────
  {
    id: 'crecipe00000000snack005', name: 'Творог с малиной и мёдом',
    descriptionRu: 'Сладкий белковый перекус', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 150), ing('Малина', K.raspberry, 60), ing('Мёд', K.honey, 8)],
    steps: ['Выложить творог', 'Сверху малина, полить мёдом'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000snack006', name: 'Творог с черникой и семенами',
    descriptionRu: 'Антиоксидантный перекус', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Творог обезжиренный', K.curd0, 150), ing('Черника', K.blueberry, 80), ing('Семена чиа', K.chiaSeed, 8)],
    steps: ['Смешать творог с чиа', 'Сверху чернику'],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000snack007', name: 'Творог с грецким орехом и грушей',
    descriptionRu: 'Хрустящий белковый снек', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 150), ing('Груша', K.pear, 80), ing('Грецкий орех', K.walnut, 12)],
    steps: ['Творог в миску', 'Груша кубиками сверху', 'Посыпать орехами'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose', 'nuts'],
  },
  {
    id: 'crecipe00000000snack008', name: 'Творог с авокадо и зеленью',
    descriptionRu: 'Несладкий белковый перекус', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 150), ing('Авокадо', K.avocado, 60), ing('Укроп', K.dill, 10)],
    steps: ['Размять авокадо вилкой с творогом', 'Добавить укроп и соль'],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000snack009', name: 'Запечённый сырник',
    descriptionRu: 'Один сырник в духовке', prepTimeMin: 25, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 150), egg(1), ing('Овсяные отруби', K.oatBranRaw, 15)],
    steps: ['Размять творог с яйцом и отрубями', 'Слепить сырник', 'Запекать при 180°C 20 мин'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose', 'eggs', 'gluten'],
  },
  {
    id: 'crecipe00000000snack010', name: 'Шейк протеиновый ванильный',
    descriptionRu: 'Простой шейк после тренировки', prepTimeMin: 2, servings: 1,
    ingredients: [ing('Сывороточный протеин', K.proteinWhey, 30), ing('Молоко 2.5%', K.milkLow, 250)],
    steps: ['Все в шейкер', 'Встряхнуть 30 сек'],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000snack011', name: 'Шейк протеиновый шоколадный',
    descriptionRu: 'Шоколадный вкус с какао', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Сывороточный протеин', K.proteinWhey, 30), ing('Молоко 2.5%', K.milkLow, 250), ing('Какао-порошок', K.cocoaPowder, 8)],
    steps: ['Все в шейкер', 'Встряхнуть 30 сек'],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000snack012', name: 'Шейк ягодный без молока',
    descriptionRu: 'Веганский протеиновый шейк', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Растительный протеин', K.proteinPlant, 30), ing('Овсяное молоко', K.milkOat, 250), ing('Ягоды mix', K.blueberry, 80)],
    steps: ['Все в блендер', 'Взбить 30 сек'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe00000000snack013', name: 'Шейк с бананом и арахисовой пастой',
    descriptionRu: 'Калорийный шейк для набора', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Сывороточный протеин', K.proteinWhey, 30), ing('Молоко 2.5%', K.milkLow, 250), ing('Банан', K.banana, 120), ing('Арахисовая паста', K.peanutButter, 20)],
    steps: ['Все в блендер', 'Взбить 30 сек'],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose', 'nuts'],
  },
  {
    id: 'crecipe00000000snack014', name: 'Варёное яйцо с авокадо',
    descriptionRu: 'Минимальный перекус с белком и жиром', prepTimeMin: 12, servings: 1,
    ingredients: [egg(2), ing('Авокадо', K.avocado, 80)],
    steps: ['Яйца варить 8 мин', 'Авокадо нарезать', 'Подать с яйцами и щепоткой соли'],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe00000000snack015', name: 'Фаршированные яйца с творогом',
    descriptionRu: 'Простые фаршированные яйца', prepTimeMin: 15, servings: 1,
    ingredients: [egg(3), ing('Творог 5%', K.curd5, 50), ing('Укроп', K.dill, 10)],
    steps: ['Яйца сварить 10 мин', 'Желтки смешать с творогом и укропом', 'Заполнить половинки белков'],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['eggs', 'lactose'],
  },
  {
    id: 'crecipe00000000snack016', name: 'Скрэмбл белковый с зеленью',
    descriptionRu: 'Перекус из 2 минут', prepTimeMin: 5, servings: 1,
    ingredients: [egg(3), ing('Укроп', K.dill, 10)],
    steps: ['Взбить 3 белка + 1 целое яйцо', 'Жарить помешивая 3 мин', 'Посыпать укропом'],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe00000000snack017', name: 'Хумус классический с овощами',
    descriptionRu: 'Растительный белок и клетчатка', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Хумус', K.hummus, 80), ing('Морковь', K.carrot, 100), ing('Огурец', K.cucumber, 100)],
    steps: ['Овощи нарезать палочками', 'Макать в хумус'],
    tags: ['snack', 'maintain'], allergens: [],
  },
  {
    id: 'crecipe00000000snack018', name: 'Свекольный хумус с морковью',
    descriptionRu: 'Розовый хумус с пользой свёклы', prepTimeMin: 15, servings: 2,
    ingredients: [ing('Нут варёный', K.chickpeasCooked, 200), ing('Свёкла варёная', K.beetroot, 100), ing('Оливковое масло', K.oliveOil, 15), ing('Лимонный сок', { calories: 22, protein: 0.4, fats: 0.2, carbs: 7 } as Per100, 15)],
    steps: ['Все ингредиенты в блендер', 'Взбить до однородности'],
    tags: ['snack', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000snack019', name: 'Тыквенный хумус с огурцом',
    descriptionRu: 'Сезонный осенний хумус', prepTimeMin: 15, servings: 2,
    ingredients: [ing('Нут варёный', K.chickpeasCooked, 200), ing('Тыква запечённая', K.pumpkin, 150), ing('Огурец', K.cucumber, 150)],
    steps: ['Нут с тыквой пробить блендером', 'Огурец нарезать палочками для макания'],
    tags: ['snack', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000snack020', name: 'Тост с творогом и зеленью',
    descriptionRu: 'Простой быстрый перекус', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 50), ing('Творог 5%', K.curd5, 80), ing('Укроп', K.dill, 10)],
    steps: ['Хлеб поджарить', 'Смешать творог с укропом', 'Намазать на тост'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe00000000snack021', name: 'Хлебец с авокадо и яйцом',
    descriptionRu: 'Низкокалорийный перекус', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Хлебцы цельнозерновые', K.crispbread, 20), ing('Авокадо', K.avocado, 60), egg(1)],
    steps: ['Сварить яйцо 8 мин', 'Размять авокадо', 'На хлебец выложить авокадо и нарезанное яйцо'],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['gluten', 'eggs'],
  },
  {
    id: 'crecipe00000000snack022', name: 'Сэндвич с тунцом',
    descriptionRu: 'Перекус с белком в дороге', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 60), ing('Тунец консервированный', K.tunaCanned, 80), ing('Греческий йогурт', K.yogurtGreek, 20), ing('Огурец', K.cucumber, 50)],
    steps: ['Тунец размять с йогуртом', 'Намазать на хлеб, сверху огурец', 'Закрыть вторым ломтиком'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['gluten', 'fish', 'lactose'],
  },
  {
    id: 'crecipe00000000snack023', name: 'Овсяно-финиковые шарики',
    descriptionRu: 'Энергетический перекус без сахара', prepTimeMin: 15, servings: 4,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 100), ing('Финики', K.date, 150), ing('Миндаль', K.almond, 50), ing('Какао-порошок', K.cocoaPowder, 15)],
    steps: ['Финики и миндаль пробить блендером', 'Добавить хлопья и какао, перемешать', 'Слепить 12 шариков, охладить 15 мин'],
    tags: ['snack', 'maintain'], allergens: ['gluten', 'nuts'],
  },
  {
    id: 'crecipe00000000snack024', name: 'Орехово-кокосовые шарики',
    descriptionRu: 'Сырые конфеты без сахара', prepTimeMin: 20, servings: 4,
    ingredients: [ing('Финики', K.date, 200), ing('Кешью', K.cashew, 80), ing('Кокосовая стружка', { calories: 660, protein: 6.9, fats: 64.5, carbs: 23.7 } as Per100, 30)],
    steps: ['Финики и кешью пробить', 'Слепить шарики', 'Обвалять в кокосовой стружке'],
    tags: ['snack', 'maintain'], allergens: ['nuts'],
  },
  {
    id: 'crecipe00000000snack025', name: 'Шоколадно-протеиновые шарики',
    descriptionRu: 'Высокобелковый снек', prepTimeMin: 15, servings: 4,
    ingredients: [ing('Сывороточный протеин', K.proteinWhey, 60), ing('Овсяные хлопья', K.oatsRaw, 80), ing('Арахисовая паста', K.peanutButter, 60), ing('Какао-порошок', K.cocoaPowder, 15)],
    steps: ['Все ингредиенты смешать с 50 мл воды', 'Слепить 10 шариков', 'Охладить 15 мин'],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose', 'gluten', 'nuts'],
  },
  {
    id: 'crecipe00000000snack026', name: 'Фруктовые шарики с финиками',
    descriptionRu: 'Натуральные сладости', prepTimeMin: 15, servings: 4,
    ingredients: [ing('Финики', K.date, 150), ing('Курага', K.driedApricot, 100), ing('Грецкий орех', K.walnut, 50)],
    steps: ['Сухофрукты и орехи пробить блендером', 'Слепить 10 шариков', 'Охладить'],
    tags: ['snack', 'maintain'], allergens: ['nuts'],
  },
  {
    id: 'crecipe00000000snack027', name: 'Грейпфрут с миндалём',
    descriptionRu: 'Витамин C + полезные жиры', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Грейпфрут', K.grapefruit, 200), ing('Миндаль', K.almond, 20)],
    steps: ['Грейпфрут очистить', 'Подать с миндалём'],
    tags: ['snack', 'weight-loss'], allergens: ['nuts'],
  },
  {
    id: 'crecipe00000000snack028', name: 'Груша с грецким орехом',
    descriptionRu: 'Сезонный перекус', prepTimeMin: 2, servings: 1,
    ingredients: [ing('Груша', K.pear, 200), ing('Грецкий орех', K.walnut, 20)],
    steps: ['Грушу нарезать', 'Подать с грецким орехом'],
    tags: ['snack', 'maintain'], allergens: ['nuts'],
  },
  {
    id: 'crecipe00000000snack029', name: 'Апельсин с тыквенными семечками',
    descriptionRu: 'Витаминный снек', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Апельсин', K.orange, 200), ing('Тыквенные семечки', K.pumpkinSeed, 20)],
    steps: ['Апельсин очистить', 'Подать с семечками'],
    tags: ['snack', 'weight-loss'], allergens: [],
  },
  {
    id: 'crecipe00000000snack030', name: 'Киви с миндалём',
    descriptionRu: 'Простой витаминный перекус', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Киви', K.kiwi, 150), ing('Миндаль', K.almond, 15)],
    steps: ['Киви нарезать кружками', 'Подать с миндалём'],
    tags: ['snack', 'weight-loss'], allergens: ['nuts'],
  },
  {
    id: 'crecipe00000000snack031', name: 'Греческий йогурт с гранолой',
    descriptionRu: 'Хрусткий белковый перекус', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Греческий йогурт', K.yogurtGreek, 150), ing('Гранола', K.granolaPlain, 30), ing('Ягоды mix', K.blueberry, 60)],
    steps: ['Йогурт в стакан', 'Сверху гранола и ягоды'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose', 'gluten'],
  },
  {
    id: 'crecipe00000000snack032', name: 'Сыр с яблоком и хлебцами',
    descriptionRu: 'Перекус с белком и углеводами', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Сыр твёрдый', K.hardCheese20, 50), ing('Яблоко', K.apple, 150), ing('Хлебцы цельнозерновые', K.crispbread, 20)],
    steps: ['Сыр и яблоко нарезать', 'Подать с хлебцами'],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose', 'gluten'],
  },
  {
    id: 'crecipe00000000snack033', name: 'Мини авокадо-тост',
    descriptionRu: 'Маленький бутерброд для перекуса', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 30), ing('Авокадо', K.avocado, 60), ing('Помидор черри', K.tomato, 50)],
    steps: ['Хлеб поджарить', 'Размять авокадо', 'Намазать, сверху помидор'],
    tags: ['snack', 'weight-loss'], allergens: ['gluten'],
  },
  {
    id: 'crecipe00000000snack034', name: 'Морковь с арахисовой пастой',
    descriptionRu: 'Хрустящий перекус с белком', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Морковь', K.carrot, 150), ing('Арахисовая паста', K.peanutButter, 25)],
    steps: ['Морковь нарезать палочками', 'Макать в арахисовую пасту'],
    tags: ['snack', 'maintain'], allergens: ['nuts'],
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
