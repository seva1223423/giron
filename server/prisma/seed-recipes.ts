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
    steps: [
      'Творог выложить в миску, размять вилкой до однородности (3-5 движений)',
      'Если творог суховат — добавить 1 ст.л. йогурта для кремовости',
      'Сверху распределить ягоды, полить мёдом',
      'Подать сразу или охладить 10 мин для смягчения вкуса',
    ],
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
    steps: [
      'Яйца взбить вилкой с щепоткой соли и 1 ст.л. молока',
      'Разогреть 1 ч.л. оливкового масла на сковороде',
      'Шпинат бросить на 30 сек до увядания',
      'Залить взбитыми яйцами, накрыть крышкой',
      'Готовить на минимальном огне 4-5 мин — белок должен стать матовым по краям',
    ],
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
    steps: [
      'Греческий йогурт выложить в чашу',
      'Орехи слегка обжарить на сухой сковороде 2 мин для аромата',
      'Гранолу и орехи распределить сверху',
      'Подать сразу — гранола сохранит хруст',
    ],
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
    steps: [
      'Куриную грудку отварить 20 мин или обжарить 8 мин с каждой стороны, остудить',
      'Грудку и авокадо нарезать кубиками 1-1.5 см',
      'Помидоры черри разрезать пополам',
      'Салат порвать руками (резать нельзя — потеряется хруст)',
      'Смешать в большой миске, заправить оливковым маслом + соком лимона',
      'Посолить-поперчить, перемешать аккуратно, дать настояться 5 мин',
    ],
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
    steps: [
      'Банан очистить, разломить руками на крупные куски',
      'В шейкер налить молоко (или молоко-заменитель)',
      'Добавить мерную ложку протеина и куски банана',
      'Плотно закрыть, встряхивать 30-40 сек до полного растворения',
      'Подать охлаждённым, лучше в течение 30 мин после тренировки',
    ],
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
    steps: [
      'Яблоко помыть, разрезать на 4 части, удалить серединку',
      'Нарезать дольками 0.5-1 см',
      'Миндаль (или другие орехи) слегка обжарить на сухой сковороде 2 мин для аромата',
      'Подать вместе — идеально за 30 мин до тренировки',
    ],
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
    steps: [
      'Огурец натереть на крупной тёрке, отжать лишнюю воду',
      'Зелень (укроп, петрушка) мелко порубить',
      'Смешать творог с огурцом и зеленью',
      'Посолить, добавить щепотку чёрного перца',
      'Подать сразу — со временем огурец даст много воды',
    ],
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
    steps: [
      'Морковь помыть, очистить, нарезать палочками 6-8 см длиной',
      'Хумус выложить в небольшую пиалу',
      'В центре сделать углубление, налить 1 ч.л. оливкового масла',
      'Подать вместе как дип',
    ],
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
    id: 'crecipe0000000breakf003', name: 'Овсянка с ягодами и льняными семенами',
    descriptionRu: 'Антиоксидантный завтрак с омега-3', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Ягоды mix', K.blueberry, 80), ing('Льняные семена', K.flaxseed, 10)],
    steps: ['Сварить овсянку 5 мин', 'Добавить ягоды и льняные семена', 'Перемешать'],
    tags: ['breakfast', 'weight-loss'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf015', name: 'Ночная овсянка с чиа и ягодами',
    descriptionRu: 'Готовится с вечера, утром просто достать', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), ing('Молоко 2.5%', K.milkLow, 200), ing('Семена чиа', K.chiaSeed, 10), ing('Ягоды mix', K.blueberry, 80)],
    steps: [
      'Овсяные хлопья, чиа и молоко смешать в банке с крышкой',
      'Закрыть, встряхнуть, поставить в холодильник на 6-8 часов (или на ночь)',
      'Утром перемешать, добавить ягоды сверху',
      'По желанию полить мёдом или сиропом',
      'Хранится в холодильнике 3 дня',
    ],
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
    steps: [
      'Тунец слить от рассола, размять вилкой',
      'Яйца взбить вилкой с щепоткой соли',
      'Зелёный лук мелко нарезать',
      'Смешать яйца с тунцом и луком',
      'Жарить на разогретой сухой сковороде под крышкой 4-5 мин до схватывания белка',
    ],
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
    steps: [
      'Творог выложить в миску, размять вилкой до пастообразной массы',
      'Малину промыть холодной водой, обсушить',
      'Выложить малину на творог, полить мёдом',
      'По желанию посыпать семенами льна или чиа',
    ],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf026', name: 'Сырники с яблоком и корицей',
    descriptionRu: 'Низкоуглеводные сырники', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Творог 5%', K.curd5, 200), egg(1), ing('Овсяные отруби', K.oatBranRaw, 20), ing('Яблоко', K.apple, 80)],
    steps: ['Размять творог с яйцом и отрубями', 'Добавить тёртое яблоко и корицу', 'Слепить сырники, жарить на сухой сковороде по 3 мин с каждой стороны'],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose', 'eggs', 'gluten'],
  },

  // ─── СМУЗИ И НАПИТКИ (6) ──────────────────────────────────────────────────

  // ─── ПРОЧИЕ ЗАВТРАКИ (5) ──────────────────────────────────────────────────
  {
    id: 'crecipe0000000breakf036', name: 'Овсяные блины с творогом',
    descriptionRu: 'ПП-блины без муки', prepTimeMin: 20, servings: 1,
    ingredients: [ing('Овсяные хлопья', K.oatsRaw, 50), egg(2), ing('Молоко 2.5%', K.milkLow, 100), ing('Творог 5%', K.curd5, 100)],
    steps: [
      'Хлопья измельчить в блендере до муки',
      'Смешать с яйцами и молоком до однородности (тесто как на тонкие блины)',
      'Дать постоять 5 мин для набухания',
      'Жарить на сухой сковороде с антипригарным покрытием по 1-2 мин с каждой стороны',
      'Подать с творогом, можно полить мёдом или ягодным соусом',
    ],
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
    steps: [
      'Рис промыть до прозрачной воды',
      'Залить молоком 1:3, довести до кипения',
      'Варить на минимальном огне 25-30 мин под крышкой, помешивая',
      'Яблоко натереть на крупной тёрке или нарезать кубиками',
      'Снять с огня, добавить яблоко и корицу, дать постоять 5 мин',
    ],
    tags: ['breakfast', 'maintain'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000breakf039', name: 'Авокадо-тост с творогом',
    descriptionRu: 'Свежий завтрак за 5 минут', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 60), ing('Авокадо', K.avocado, 80), ing('Творог 5%', K.curd5, 80)],
    steps: [
      'Хлеб подсушить в тостере 2-3 мин до золотистости',
      'Авокадо разрезать пополам, удалить косточку, размять вилкой с щепоткой соли',
      'На тёплый хлебец намазать творог тонким слоем',
      'Сверху авокадо, посолить-поперчить',
      'По желанию сбрызнуть лимоном для свежести',
    ],
    tags: ['breakfast', 'maintain'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe0000000breakf040', name: 'Авокадо-тост с лососем',
    descriptionRu: 'Завтрак выходного дня', prepTimeMin: 5, servings: 1,
    ingredients: [ing('Цельнозерновой хлеб', K.breadWhole, 60), ing('Авокадо', K.avocado, 80), ing('Лосось солёный', K.salmon, 50)],
    steps: [
      'Хлеб подсушить в тостере 2-3 мин',
      'Авокадо размять вилкой с солью и капелькой лимонного сока',
      'Размазать авокадо на тёплый хлебец',
      'Сверху положить ломтики солёного лосося, посыпать чёрным перцем',
      'Можно украсить веточкой укропа',
    ],
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
    steps: [
      'Помидоры, огурцы, болгарский перец нарезать крупными кубиками 2 см',
      'Красный лук тонкими полукольцами, замочить в холодной воде 5 мин (уберёт горечь)',
      'Фету нарезать кубиками',
      'Маслины добавить целыми (или половинками)',
      'Полить оливковым маслом, посолить орегано',
      'Аккуратно перемешать, подавать сразу',
    ],
    tags: ['lunch', 'maintain'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch023', name: 'Шопский салат',
    descriptionRu: 'Болгарский овощной салат', prepTimeMin: 10, servings: 1,
    ingredients: [ing('Помидоры', K.tomato, 200), ing('Огурец', K.cucumber, 150), ing('Болгарский перец', K.bellPepper, 100), ing('Брынза', K.brynza, 60)],
    steps: [
      'Помидоры и огурцы нарезать кубиками 1.5 см',
      'Перец нарезать соломкой, лук тонкими полукольцами',
      'Сложить овощи в миску, посолить, перемешать',
      'Сверху щедро натереть брынзу на крупной тёрке',
      'Полить оливковым маслом, по желанию сбрызнуть винным уксусом',
    ],
    tags: ['lunch', 'weight-loss'], allergens: ['lactose'],
  },
  {
    id: 'crecipe00000000lunch024', name: 'Овощной салат с курицей',
    descriptionRu: 'Сытный обед с зеленью', prepTimeMin: 15, servings: 1,
    ingredients: [ing('Куриная грудка варёная', K.chickenBreast, 150), ing('Помидоры черри', K.tomato, 100), ing('Огурец', K.cucumber, 100), ing('Микс салатов', K.saladMix, 60)],
    steps: [
      'Куриную грудку отварить 20 мин в подсолённой воде, остудить, нарезать кубиками',
      'Огурец, помидор, перец нарезать кубиками',
      'Зелёный салат порвать руками',
      'Смешать всё в миске, заправить соком лимона + оливковым маслом',
      'Посолить, перемешать аккуратно',
    ],
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
    steps: [
      'Картофель и яйца отварить вкрутую (картофель 20 мин, яйца 10 мин)',
      'Куриную грудку отварить 20 мин, остудить',
      'Всё нарезать одинаковыми кубиками 0.7-1 см',
      'Огурцы и зелёный горошек добавить, перемешать',
      'Заправить греческим йогуртом + ложкой горчицы',
      'Посолить, дать настояться 30 мин в холодильнике',
    ],
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
    steps: [
      'Бурый рис промыть, залить 1:2.5 водой, варить 25 мин до мягкости',
      'Авокадо нарезать дольками, огурец кубиками',
      'Тунец слить от масла, размять вилкой',
      'В глубокую тарелку выложить рис, секторами рис, авокадо, огурец, тунец',
      'Полить соевым соусом и кунжутным маслом, посыпать кунжутом',
    ],
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
    steps: [
      'Грудку отбить молотком до толщины 1.5 см',
      'Натереть тёртым чесноком, посолить-поперчить, дать постоять 10 мин для маринования',
      'Сковороду разогреть с 1 ч.л. оливкового масла',
      'Выложить грудку, накрыть тяжёлым прессом (тарелка + банка)',
      'Жарить 15 мин с каждой стороны на среднем огне до золотистой корочки',
      'Подать с зеленью и долькой лимона',
    ],
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
    steps: [
      'Чечевицу промыть холодной водой',
      'Лук и морковь нарезать кубиками, обжарить на оливковом масле 5 мин до мягкости',
      'Добавить чечевицу и нарезанные томаты',
      'Влить 400 мл воды, посолить, тушить под крышкой 25-30 мин до готовности',
      'В конце добавить зелень',
    ],
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
    id: 'crecipe00000000snack006', name: 'Творог с черникой и семенами',
    descriptionRu: 'Антиоксидантный перекус', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Творог обезжиренный', K.curd0, 150), ing('Черника', K.blueberry, 80), ing('Семена чиа', K.chiaSeed, 8)],
    steps: [
      'Семена чиа залить творогом, перемешать, оставить на 5 мин для набухания',
      'Чернику промыть, обсушить',
      'Выложить чернику сверху, можно полить мёдом',
      'Совет: для густой консистенции дайте постоять 10 мин',
    ],
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
    id: 'crecipe00000000snack012', name: 'Шейк ягодный без молока',
    descriptionRu: 'Веганский протеиновый шейк', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Растительный протеин', K.proteinPlant, 30), ing('Овсяное молоко', K.milkOat, 250), ing('Ягоды mix', K.blueberry, 80)],
    steps: [
      'Ягоды промыть, если замороженные — не размораживать (густая текстура)',
      'Все ингредиенты в блендер',
      'Взбить 30-40 сек до однородной консистенции',
      'Подать сразу — со временем расслаивается',
    ],
    tags: ['snack', 'maintain', 'high-protein'], allergens: [],
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
    steps: [
      'Овощи (морковь, огурец, перец) помыть и нарезать палочками',
      'Хумус выложить в пиалу, в центре углубление',
      'В углубление налить 1 ч.л. оливкового масла, посыпать паприкой',
      'Подать вместе — макать овощи в хумус',
    ],
    tags: ['snack', 'maintain'], allergens: [],
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
    id: 'crecipe00000000snack025', name: 'Шоколадно-протеиновые шарики',
    descriptionRu: 'Высокобелковый снек', prepTimeMin: 15, servings: 4,
    ingredients: [ing('Сывороточный протеин', K.proteinWhey, 60), ing('Овсяные хлопья', K.oatsRaw, 80), ing('Арахисовая паста', K.peanutButter, 60), ing('Какао-порошок', K.cocoaPowder, 15)],
    steps: ['Все ингредиенты смешать с 50 мл воды', 'Слепить 10 шариков', 'Охладить 15 мин'],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose', 'gluten', 'nuts'],
  },
  {
    id: 'crecipe00000000snack031', name: 'Греческий йогурт с гранолой',
    descriptionRu: 'Хрусткий белковый перекус', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Греческий йогурт', K.yogurtGreek, 150), ing('Гранола', K.granolaPlain, 30), ing('Ягоды mix', K.blueberry, 60)],
    steps: [
      'Йогурт выложить в стакан или пиалу',
      'Сверху гранола, посыпать ягодами',
      'По желанию полить мёдом или сиропом топинамбура',
      'Подать сразу пока гранола хрустящая',
    ],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose', 'gluten'],
  },
  {
    id: 'crecipe00000000snack032', name: 'Сыр с яблоком и хлебцами',
    descriptionRu: 'Перекус с белком и углеводами', prepTimeMin: 3, servings: 1,
    ingredients: [ing('Сыр твёрдый', K.hardCheese20, 50), ing('Яблоко', K.apple, 150), ing('Хлебцы цельнозерновые', K.crispbread, 20)],
    steps: [
      'Сыр нарезать тонкими ломтиками',
      'Яблоко разрезать на 4 части, удалить серединку, нарезать дольками',
      'Хлебцы выложить на тарелку, сверху сыр и яблоко',
      'Совет: твёрдый сыр + кислое яблоко = классическое сочетание для перекуса',
    ],
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
    steps: [
      'Морковь помыть, очистить, нарезать палочками',
      'Арахисовую пасту слегка прогреть (1 ст.л. в микроволновке 10 сек) для мягкости',
      'Макать палочки моркови в пасту',
      'Хрустящий перекус с белком (~6г протеина в 1 ст.л. пасты)',
    ],
    tags: ['snack', 'maintain'], allergens: ['nuts'],
  },
  // ─── ROUND 238 — popular ПП-classics NOT covered by combinatorial generators ──
  // Pizza/наггетсы/чизкейк/кефир-маринад/сердечки/запеканка — specific
  // techniques and forms that don't fit the protein×side×veg matrix in
  // generators 8 / 15 / 20-22. Added per user feedback that gym/weight-
  // loss classics are higher priority than search-result variety.
  {
    id: 'crecipe0000000r238add01', name: 'Пицца на курином филе',
    descriptionRu: 'ПП-пицца: основа из филе вместо теста, белок 50г/порция', prepTimeMin: 30, servings: 1,
    ingredients: [
      ing('Куриное филе', K.chickenBreast, 200),
      egg(1),
      ing('Помидор', K.tomato, 80),
      ing('Моцарелла', K.mozzarella, 40),
      ing('Шампиньоны', K.mushroom, 50),
    ],
    steps: [
      'Филе пробить в плоский «блин» толщиной 1 см',
      'Обжарить с двух сторон по 2 мин на сухой сковороде',
      'Сверху томатное пюре, помидор кружками, грибы, моцарелла',
      'Под крышкой 5 мин — моцарелла плавится',
    ],
    tags: ['lunch', 'maintain', 'high-protein'], allergens: ['lactose', 'eggs'],
  },
  {
    id: 'crecipe0000000r238add02', name: 'Куриные наггетсы в духовке',
    descriptionRu: 'ПП-наггетсы без муки, запечённые с отрубями', prepTimeMin: 25, servings: 2,
    ingredients: [
      ing('Куриное филе', K.chickenBreast, 400),
      egg(1),
      ing('Овсяные отруби', K.oatBranRaw, 40),
    ],
    steps: [
      'Филе нарезать кубиками 2 см',
      'Смешать яйцо с отрубями, паприкой и солью',
      'Обмакнуть каждый кусочек, выложить на противень с пергаментом',
      'Запекать при 200°C 18-20 мин до золотистой корочки',
    ],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['eggs', 'gluten'],
  },
  {
    id: 'crecipe0000000r238add03', name: 'Творожный чизкейк без выпечки',
    descriptionRu: 'ПП-десерт: творог + йогурт, охладить и подать с ягодами', prepTimeMin: 15, servings: 2,
    ingredients: [
      ing('Творог 5%', K.curd5, 300),
      ing('Греческий йогурт', K.yogurtGreek, 150),
      ing('Мёд', K.honey, 20),
      ing('Овсяные отруби', K.oatBranRaw, 30),
      ing('Клубника', K.strawberry, 100),
    ],
    steps: [
      'Творог + йогурт + мёд взбить блендером до гладкости',
      'Отруби на дно формы как корж',
      'Сверху творожная масса, разровнять',
      'В холодильник минимум 2 часа',
      'Перед подачей — клубника сверху',
    ],
    tags: ['snack', 'maintain', 'high-protein'], allergens: ['lactose', 'gluten'],
  },
  {
    id: 'crecipe0000000r238add04', name: 'Куриная грудка в кефире',
    descriptionRu: 'Сочная грудка благодаря маринаду в кефире на ночь', prepTimeMin: 30, servings: 1,
    ingredients: [
      ing('Куриное филе', K.chickenBreast, 200),
      ing('Кефир 1%', K.milkLow, 100),
      ing('Чеснок', K.garlic, 5),
      ing('Зелень', K.parsley, 10),
    ],
    steps: [
      'Филе залить кефиром с тёртым чесноком, посолить — на ночь в холодильник',
      'Слить кефир, обсушить',
      'Запекать при 200°C 20 мин или жарить на сухой сковороде 4-5 мин с каждой стороны',
      'Посыпать зеленью',
    ],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe0000000r238add05', name: 'Куриные сердечки тушёные с луком',
    descriptionRu: 'High-protein low-cal классика для зала', prepTimeMin: 35, servings: 1,
    ingredients: [
      { name: 'Куриные сердечки', weightGrams: 200, calories: 316, protein: 32, fats: 20, carbs: 1.4 },
      ing('Лук', K.onion, 80),
      ing('Морковь', K.carrot, 60),
      ing('Оливковое масло', K.oliveOil, 5),
    ],
    steps: [
      'Сердечки промыть, очистить от плёнок',
      'Лук + морковь поджарить 5 мин',
      'Добавить сердечки, тушить 25-30 мин в собственном соку',
      'Соль/перец по вкусу',
    ],
    tags: ['dinner', 'weight-loss', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe0000000r238add06', name: 'Творожная запеканка ПП',
    descriptionRu: 'Классическая ПП-запеканка без муки и сахара', prepTimeMin: 35, servings: 2,
    ingredients: [
      ing('Творог 5%', K.curd5, 400),
      egg(2),
      ing('Овсяные отруби', K.oatBranRaw, 40),
      ing('Мёд', K.honey, 20),
      ing('Изюм', K.raisin, 30),
    ],
    steps: [
      'Творог растереть с яйцами, отрубями и мёдом',
      'Добавить изюм',
      'Выложить в форму, запекать при 180°C 30 мин до золотистого верха',
    ],
    tags: ['breakfast', 'maintain', 'high-protein'], allergens: ['lactose', 'eggs', 'gluten'],
  },
  // ─── ROUND 238c — muscle-gain classics not covered by generators ───────────
  // Calorie-dense (≥600 kcal/serving), protein-rich (≥30g), carb-loaded
  // (≥60g) dishes that real mass-gain users eat. Hand-written because
  // these specific combinations (банан+АП+овсянка+протеин+молоко;
  // творог 9%+орехи+мёд+сухофрукты; сэндвич мясной с яйцом+сыром) are
  // distinct dishes, not protein×side×veg matrix entries.
  {
    id: 'crecipe000000000r238mass01', name: 'Овсянка на цельном молоке с протеином и арахисовой пастой',
    descriptionRu: 'Mass-завтрак — 700+ ккал, 40г белка, 80г углеводов. Покрывает 1/4 дневной нормы', prepTimeMin: 12, servings: 1,
    ingredients: [
      ing('Овсяные хлопья', K.oatsRaw, 80),
      ing('Молоко 2.5%', K.milkLow, 350),
      ing('Сывороточный протеин', K.proteinWhey, 30),
      ing('Банан', K.banana, 150),
      ing('Арахисовая паста', K.peanutButter, 30),
      ing('Мёд', K.honey, 15),
    ],
    steps: [
      'Молоко довести до кипения в ковшике',
      'Всыпать овсяные хлопья, варить 6-8 мин на медленном огне до густой кашицы, помешивая',
      'Снять с огня, дать остыть до 60°C (горячее молоко расплавит протеин в комочки)',
      'Добавить мерную ложку протеина, тщательно размешать до однородности',
      'Сверху выложить нарезанный банан, полить арахисовой пастой и мёдом',
      'Совет: для +200 ккал добавьте 20г грецкого ореха — идеально перед тяжёлой тренировкой',
    ],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['gluten', 'lactose', 'nuts'],
  },
  {
    id: 'crecipe000000000r238mass02', name: 'Гейнер-смузи (банан, арахис, протеин, молоко)',
    descriptionRu: 'Жидкий mass-shake — 600 ккал за 3 минуты. Идеален между приёмами пищи или после тренировки', prepTimeMin: 3, servings: 1,
    ingredients: [
      ing('Молоко 2.5%', K.milkLow, 400),
      ing('Сывороточный протеин', K.proteinWhey, 40),
      ing('Банан', K.banana, 150),
      ing('Арахисовая паста', K.peanutButter, 30),
      ing('Овсяные хлопья', K.oatsRaw, 40),
      ing('Мёд', K.honey, 15),
    ],
    steps: [
      'Молоко налить в блендер (можно охладить заранее или добавить пару кубиков льда)',
      'Добавить банан кусками, протеин, арахисовую пасту, сухие хлопья и мёд',
      'Взбить 60 сек на максимальной скорости — хлопья измельчатся и загустят смузи',
      'Перелить в шейкер или большой стакан',
      'Выпить в течение 30 мин после приготовления — потом расслаивается',
      'Лайфхак: для +100 ккал добавьте 1 ст.л. кокосового масла',
    ],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose', 'nuts', 'gluten'],
  },
  {
    id: 'crecipe000000000r238mass03', name: 'Творог 9% с орехами, мёдом и сухофруктами',
    descriptionRu: 'Mass-bowl на основе жирного творога — 550 ккал, 35г белка. Удобно есть вечером перед сном (медленный казеин)', prepTimeMin: 5, servings: 1,
    ingredients: [
      ing('Творог 9%', K.curd9, 250),
      ing('Грецкий орех', K.walnut, 25),
      ing('Миндаль', K.almond, 20),
      ing('Финики', K.date, 40),
      ing('Курага', K.driedApricot, 30),
      ing('Мёд', K.honey, 15),
    ],
    steps: [
      'Творог выложить в глубокую миску, размять вилкой до однородности',
      'Орехи слегка обжарить на сухой сковороде 2-3 мин — раскроется аромат',
      'Финики и курагу нарезать кубиками (если очень сухие — замочить в кипятке на 5 мин)',
      'Орехи крупно порубить ножом',
      'Все компоненты выложить на творог, полить мёдом',
      'Подать сразу или взять с собой в контейнере — идеален как поздний ужин',
    ],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose', 'nuts'],
  },
  {
    id: 'crecipe000000000r238mass04', name: 'Куриная грудка с рисом и сырным соусом',
    descriptionRu: 'Классический bodybuilder-обед: 650 ккал, 50г белка, 70г углеводов', prepTimeMin: 30, servings: 1,
    ingredients: [
      ing('Куриная грудка', K.chickenBreast, 250),
      ing('Бурый рис варёный', K.brownRiceCooked, 200),
      ing('Сыр твёрдый 20%', K.hardCheese20, 40),
      ing('Молоко 2.5%', K.milkLow, 100),
      ing('Оливковое масло', K.oliveOil, 10),
      ing('Чеснок', K.garlic, 5),
    ],
    steps: [
      'Бурый рис залить водой 1:2.5, варить 25 мин под крышкой до готовности',
      'Куриную грудку отбить до 1.5 см, посолить-поперчить',
      'Жарить на разогретой сковороде с 1 ч.л. оливкового масла по 4-5 мин с каждой стороны до золотистости',
      'Сыр натереть на мелкой тёрке',
      'В отдельной кастрюле подогреть молоко до 60°C, добавить тёртый сыр и тёртый чеснок, помешивать до полного плавления',
      'На тарелку выложить рис, сверху нарезанная грудка, полить сырным соусом',
    ],
    tags: ['lunch', 'gain', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000000r238mass05', name: 'Стейк с картофелем фри в духовке',
    descriptionRu: 'Mass-ужин для leg/back day — 800 ккал, 45г белка. Картофель в духовке без масляной ванны', prepTimeMin: 40, servings: 1,
    ingredients: [
      ing('Говяжий стейк', K.beefSteak, 220),
      ing('Картофель', K.potato, 300),
      ing('Оливковое масло', K.oliveOil, 15),
      ing('Чеснок', K.garlic, 8),
    ],
    steps: [
      'Картофель помыть, нарезать брусочками 1×6 см (кожуру можно оставить — больше клетчатки)',
      'Брусочки замочить в холодной воде на 15 мин — уйдёт лишний крахмал, корочка будет хрустящей',
      'Обсушить полотенцем, перемешать с 1 ст.л. оливкового масла, солью и чесночным порошком',
      'Запекать при 220°C 25-30 мин на пергаменте, перевернуть 1 раз',
      'Параллельно: стейк за 30 мин до жарки достать из холодильника (комнатная t° = равномерная прожарка)',
      'Жарить на максимально разогретой сковороде по 3-4 мин с каждой стороны (medium), дать отдохнуть 5 мин под фольгой',
      'Подать с картофелем фри и зеленью',
    ],
    tags: ['dinner', 'gain', 'high-protein'], allergens: [],
  },
  {
    id: 'crecipe000000000r238mass06', name: 'Сэндвич мясной с яйцом и сыром',
    descriptionRu: 'Mass-обед на ходу: 650 ккал, 40г белка. Можно собрать заранее и взять в зал', prepTimeMin: 12, servings: 1,
    ingredients: [
      ing('Цельнозерновой хлеб', K.breadWhole, 100),
      ing('Куриная грудка варёная', K.chickenBreast, 150),
      egg(2),
      ing('Сыр твёрдый 20%', K.hardCheese20, 40),
      ing('Помидор', K.tomato, 80),
      ing('Авокадо', K.avocado, 50),
      ing('Греческий йогурт', K.yogurtGreek, 30),
    ],
    steps: [
      'Хлеб (2 ломтика) подсушить в тостере 2-3 мин до золотистой корочки',
      'Куриную грудку нарезать тонкими ломтиками поперёк волокон',
      'Яйца сварить вкрутую (10 мин в кипятке), остудить, нарезать кружочками',
      'Авокадо размять вилкой, помидор нарезать тонкими ломтиками',
      'На один ломтик хлеба намазать авокадо, сверху курица → сыр → яйцо → помидор',
      'Второй ломтик смазать греческим йогуртом изнутри, накрыть сэндвич',
      'Разрезать пополам наискосок, можно слегка прижать для компактности',
    ],
    tags: ['lunch', 'gain', 'high-protein'], allergens: ['gluten', 'lactose', 'eggs'],
  },
  {
    id: 'crecipe000000000r238mass07', name: 'Сырники с творогом 9% и сметаной (mass-version)',
    descriptionRu: 'Жирный творог + овсянка + сметана = 650 ккал, 40г белка. Для серьёзного набора', prepTimeMin: 25, servings: 1,
    ingredients: [
      ing('Творог 9%', K.curd9, 250),
      egg(1),
      ing('Овсяные хлопья', K.oatsRaw, 40),
      ing('Мёд', K.honey, 20),
      ing('Сметана 15%', K.sourCream15, 60),
      ing('Изюм', K.raisin, 20),
    ],
    steps: [
      'Хлопья измельчить в блендере или кофемолке до муки',
      'Творог растереть с яйцом и мёдом до однородности',
      'Добавить овсяную муку и изюм, перемешать — масса должна держать форму',
      'Влажными руками сформировать 4-5 сырников толщиной 1.5 см',
      'Жарить на разогретой сухой сковороде с антипригарным покрытием по 3 мин с каждой стороны до золотистости',
      'Подать со сметаной (для +150 ккал — добавить ложку варенья)',
    ],
    tags: ['breakfast', 'gain', 'high-protein'], allergens: ['lactose', 'eggs', 'gluten'],
  },
  {
    id: 'crecipe000000000r238mass08', name: 'Лапша с курицей, яйцом и соевым соусом (азиатский mass)',
    descriptionRu: 'Stir-fry style: 700 ккал, 45г белка. Готовится 15 мин, насыщает 4-5 часов', prepTimeMin: 15, servings: 1,
    ingredients: [
      ing('Цельнозерновая паста', K.pastaWhole, 80),
      ing('Куриная грудка', K.chickenBreast, 200),
      egg(2),
      ing('Соевый соус', K.soyaSauce, 20),
      ing('Болгарский перец', K.bellPepper, 100),
      ing('Морковь', K.carrot, 80),
      ing('Чеснок', K.garlic, 8),
      ing('Оливковое масло', K.oliveOil, 10),
    ],
    steps: [
      'Пасту отварить в подсолённой воде al dente (на 1 мин меньше времени с упаковки)',
      'Куриную грудку нарезать тонкими полосками поперёк волокон',
      'Перец и морковь нарезать соломкой',
      'На разогретом масле обжарить курицу 5 мин до белого цвета',
      'Добавить чеснок, морковь и перец, жарить 4 мин на сильном огне (овощи должны остаться хрустящими)',
      'В сторону сдвинуть, на свободное место вбить яйца, помешивать 1 мин — получится «скрэмбл»',
      'Влить соевый соус, добавить пасту, всё перемешать и прогреть 1 мин',
      'Подать сразу, посыпать зелёным луком',
    ],
    tags: ['lunch', 'gain', 'high-protein'], allergens: ['gluten', 'eggs'],
  },
  // ─── ROUND 238d — cutting / weight-loss classics (≤300 kcal, high-protein) ──
  // Breakfast and snack buckets were thin in the prior audit. These are
  // volumetric (big portion + low cal), protein-preserving (≥20g) classics
  // not covered by generators.
  {
    id: 'crecipe000000000r238wl01', name: 'Творожный мусс с ягодами',
    descriptionRu: 'Лёгкий белковый завтрак — 200 ккал, 30г белка. Творог взбит до мусса', prepTimeMin: 5, servings: 1,
    ingredients: [
      ing('Творог обезжиренный', K.curd0, 200),
      ing('Греческий йогурт', K.yogurtGreek, 80),
      ing('Малина', K.raspberry, 80),
      ing('Мёд', K.honey, 5),
    ],
    steps: [
      'Творог 0% и йогурт сложить в блендер',
      'Взбить 30-40 сек до пышной кремовой массы (как мусс)',
      'Перелить в чашу или стакан',
      'Сверху выложить малину, полить тонкой струйкой мёда',
      'Совет: для +10г белка добавьте мерную ложку протеина в блендер на шаге 1',
    ],
    tags: ['breakfast', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000000r238wl02', name: 'Белковый омлет с овощами',
    descriptionRu: '3 белка + 1 целое яйцо + овощи — 220 ккал, 25г белка', prepTimeMin: 10, servings: 1,
    ingredients: [
      egg(1),
      { name: 'Яичные белки (3 шт)', weightGrams: 100, calories: 52, protein: 11, fats: 0, carbs: 0.7 },
      ing('Шпинат', K.spinach, 60),
      ing('Помидор', K.tomato, 80),
      ing('Болгарский перец', K.bellPepper, 50),
    ],
    steps: [
      'Овощи нарезать мелким кубиком',
      'Сковороду разогреть БЕЗ масла (антипригарное покрытие)',
      'Шпинат, помидор и перец обжарить 3 мин до увядания шпината',
      'Яйцо и белки взбить вилкой с щепоткой соли',
      'Залить яичной смесью овощи, накрыть крышкой',
      'Готовить 4-5 мин на минимальном огне до полного схватывания белка',
      'Совет: чтобы омлет получился пышным — добавьте 1 ст.л. молока 0% к яичной смеси',
    ],
    tags: ['breakfast', 'weight-loss', 'high-protein'], allergens: ['eggs'],
  },
  {
    id: 'crecipe000000000r238wl03', name: 'Огуречные роллы с творогом и лососем',
    descriptionRu: 'Низкокалорийная альтернатива маки-роллам — 180 ккал, 22г белка', prepTimeMin: 10, servings: 1,
    ingredients: [
      ing('Огурец', K.cucumber, 200),
      ing('Творог обезжиренный', K.curd0, 80),
      ing('Лосось солёный', K.salmon, 50),
      ing('Укроп', K.dill, 5),
    ],
    steps: [
      'Огурец вымыть, тонко нарезать вдоль овощечисткой — получатся длинные ленты',
      'Творог смешать с мелко рубленым укропом, посолить-поперчить',
      'Лосось нарезать тонкими полосками',
      'На каждую огуречную ленту намазать чайную ложку творога, положить полоску лосося',
      'Аккуратно свернуть рулетиком, закрепить зубочисткой если надо',
      'Подать сразу — со временем огурец отдаёт воду',
    ],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['lactose', 'fish'],
  },
  {
    id: 'crecipe000000000r238wl04', name: 'Кефирно-огуречный коктейль с зеленью',
    descriptionRu: 'Освежающий напиток (как окрошка но проще) — 80 ккал, 6г белка. Объёмное насыщение при дефиците', prepTimeMin: 5, servings: 1,
    ingredients: [
      ing('Кефир 1%', K.milkLow, 250),
      ing('Огурец', K.cucumber, 150),
      ing('Укроп', K.dill, 10),
    ],
    steps: [
      'Огурец очистить, крупно нарезать',
      'Зелень (укроп, можно добавить петрушку) мелко порубить',
      'Сложить в блендер с кефиром, добавить щепотку соли',
      'Взбить 30 сек до однородности — получится густой освежающий напиток',
      'Подать охлаждённым в высоком стакане',
      'Совет: 250 мл такого коктейля = 80 ккал = идеальный полдник на cutting',
    ],
    tags: ['snack', 'weight-loss'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000000r238wl05', name: 'Тунец с огурцом и творогом',
    descriptionRu: 'Низкокал салат — 250 ккал, 35г белка. Готов за 5 мин', prepTimeMin: 5, servings: 1,
    ingredients: [
      ing('Тунец консервированный', K.tunaCanned, 120),
      ing('Огурец', K.cucumber, 150),
      ing('Творог обезжиренный', K.curd0, 80),
      ing('Лук репчатый', K.onion, 30),
      ing('Зелень', K.parsley, 10),
    ],
    steps: [
      'Тунец слить от рассола, размять вилкой',
      'Огурец нарезать мелким кубиком, лук — ещё мельче (или замочить в холодной воде 5 мин для убирания горечи)',
      'Зелень мелко порубить',
      'Творог смешать с тунцом до однородной пасты',
      'Добавить огурец и лук, аккуратно перемешать',
      'Посолить, поперчить, посыпать зеленью',
      'Можно есть ложкой или намазать на хлебец как паштет',
    ],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['lactose', 'fish'],
  },
  {
    id: 'crecipe000000000r238wl06', name: 'Зелёный протеиновый смузи на воде',
    descriptionRu: 'Низкокал post-workout без молока — 180 ккал, 25г белка', prepTimeMin: 3, servings: 1,
    ingredients: [
      ing('Шпинат', K.spinach, 50),
      ing('Яблоко', K.apple, 100),
      ing('Сывороточный протеин', K.proteinWhey, 30),
      ing('Лимон', K.orange, 30),
    ],
    steps: [
      'Шпинат вымыть, удалить толстые стебли',
      'Яблоко нарезать кубиками (кожуру не снимать — больше клетчатки)',
      'Сложить в блендер с протеином, добавить 250 мл холодной воды',
      'Выжать сок половинки лимона',
      'Взбить 40-60 сек на максимуме до полной однородности',
      'Подать сразу — шпинат окисляется и темнеет за 10 мин',
      'Совет: горький вкус шпината маскирует яблоко + лимон, не пугайтесь цвета',
    ],
    tags: ['snack', 'weight-loss', 'high-protein'], allergens: ['lactose'],
  },
  {
    id: 'crecipe000000000r238wl07', name: 'Яичные блины-роллы с курицей и шпинатом',
    descriptionRu: 'Безуглеводная альтернатива лавашу — 280 ккал, 35г белка', prepTimeMin: 15, servings: 1,
    ingredients: [
      egg(2),
      ing('Молоко обезжиренное', K.milkSkim, 30),
      ing('Куриная грудка варёная', K.chickenBreast, 100),
      ing('Шпинат', K.spinach, 60),
      ing('Творог обезжиренный', K.curd0, 50),
    ],
    steps: [
      'Яйца взбить с молоком и щепоткой соли — получится жидкое тесто',
      'Сковороду разогреть, слегка смазать оливковым маслом (можно даже без него)',
      'Вылить половину яичной смеси, готовить как тонкий блин 1-2 мин до схватывания',
      'Перевернуть, готовить ещё 30 сек, снять — получится тонкая яичная «лепёшка»',
      'Повторить со второй порцией',
      'На каждый яичный блин намазать творог, выложить курицу и шпинат',
      'Свернуть плотным рулетом, разрезать пополам наискосок',
      'Совет: вместо лаваша или хлеба — экономия 150 ккал на каждом ролле',
    ],
    tags: ['lunch', 'weight-loss', 'high-protein'], allergens: ['eggs', 'lactose'],
  },
  // ─── ROUND 239a — gain × snack cell expansion (4 → 8) ─────────────────────
  // Mass-snack classics not covered by generators: dishes with specific
  // technique or fixed combo (a sandwich isn't protein×side×veg, dates
  // stuffed with peanut butter is a no-cook bite, etc).
  {
    id: 'crecipe000000000r239gs01', name: 'Сэндвич мясной с курицей, сыром и авокадо',
    descriptionRu: 'Mass-снэк on-the-go: 550 ккал, 35г белка. Удобно взять в зал между приёмами пищи', prepTimeMin: 8, servings: 1,
    ingredients: [
      ing('Цельнозерновой хлеб', K.breadWhole, 80),
      ing('Куриная грудка варёная', K.chickenBreast, 120),
      ing('Сыр твёрдый 20%', K.hardCheese20, 30),
      ing('Авокадо', K.avocado, 60),
      ing('Помидор', K.tomato, 60),
      ing('Греческий йогурт', K.yogurtGreek, 20),
    ],
    steps: [
      'Хлеб (2 ломтика) подсушить в тостере 2-3 мин до лёгкой корочки — иначе раскиснет от авокадо',
      'Куриную грудку нарезать тонкими ломтиками поперёк волокон',
      'Авокадо размять вилкой с щепоткой соли и каплей лимонного сока (чтобы не темнело)',
      'Сыр нарезать тонкими ломтиками или натереть',
      'Один ломтик хлеба смазать греческим йогуртом, второй — авокадо',
      'Собрать: йогурт-сторона хлеба → курица → сыр → помидор → авокадо-сторона хлеба',
      'Слегка прижать рукой, разрезать пополам наискосок',
      'Можно завернуть в пергамент — не разваливается в зале',
    ],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['gluten', 'lactose'],
  },
  {
    id: 'crecipe000000000r239gs02', name: 'Тост с арахисовой пастой и бананом',
    descriptionRu: 'Классический pre-workout mass-снэк — 380 ккал, 12г белка. Готов за 5 мин', prepTimeMin: 5, servings: 1,
    ingredients: [
      ing('Цельнозерновой хлеб', K.breadWhole, 60),
      ing('Арахисовая паста', K.peanutButter, 30),
      ing('Банан', K.banana, 120),
      ing('Мёд', K.honey, 10),
    ],
    steps: [
      'Хлеб подсушить в тостере 2-3 мин до золотистой корочки',
      'Тёплый тост — арахисовая паста легче размазывается на горячем',
      'Намазать арахисовую пасту толстым слоем (~1.5 ст.л.)',
      'Банан нарезать кружочками 5-7 мм, выложить на пасту',
      'Полить мёдом тонкой струйкой, по желанию посыпать корицей',
      'Совет: за 30 мин до тренировки — быстрые углеводы банана + мёда дают энергию, паста замедляет всасывание',
    ],
    tags: ['snack', 'gain'], allergens: ['gluten', 'nuts'],
  },
  {
    id: 'crecipe000000000r239gs03', name: 'Финики фаршированные арахисовой пастой',
    descriptionRu: 'Mass-bites без готовки — 4 шт = 280 ккал, 8г белка. Идеально на тренировку', prepTimeMin: 8, servings: 1,
    ingredients: [
      ing('Финики', K.date, 60),
      ing('Арахисовая паста', K.peanutButter, 20),
      ing('Миндаль', K.almond, 15),
    ],
    steps: [
      'Финики помыть (если очень сухие — замочить в кипятке на 3 мин, потом обсушить)',
      'Сделать продольный надрез с одной стороны, удалить косточку',
      'В каждый финик вложить чайную ложку арахисовой пасты',
      'Сверху воткнуть половинку миндаля как «крышку»',
      'Можно охладить 10 мин в холодильнике — паста застынет, удобнее есть',
      'Лайфхак: 3-4 финика за 30 мин до тренировки = идеальный быстрый углевод + жир для длинной сессии',
    ],
    tags: ['snack', 'gain'], allergens: ['nuts'],
  },
  {
    id: 'crecipe000000000r239gs04', name: 'Кефирно-овсяный шейк с бананом',
    descriptionRu: 'Густой mass-шейк — 450 ккал, 22г белка. Овсянка как загуститель и slow carb', prepTimeMin: 5, servings: 1,
    ingredients: [
      ing('Кефир 2.5%', K.milkLow, 350),
      ing('Овсяные хлопья', K.oatsRaw, 50),
      ing('Банан', K.banana, 150),
      ing('Мёд', K.honey, 15),
      ing('Грецкий орех', K.walnut, 15),
    ],
    steps: [
      'Овсяные хлопья измельчить в блендере 10 сек в муку — иначе шейк будет с крупинками',
      'Добавить кефир, банан кусками, мёд',
      'Взбить 30-40 сек на максимальной скорости до однородной кремовой консистенции',
      'Перелить в высокий стакан',
      'Сверху посыпать крупно рублеными грецкими орехами',
      'Совет: для дополнительного белка добавьте мерную ложку протеина — будет +20г белка',
    ],
    tags: ['snack', 'gain', 'high-protein'], allergens: ['lactose', 'gluten', 'nuts'],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// COMBINATORIAL GENERATORS — produce ~820 recipes from compact ingredient
// catalogs. Each loop yields N×M variations with auto-computed KBJU. Pure
// data + small templates → fewer chances for typos than hand-writing 800
// individual entries, and the per-recipe macros are guaranteed consistent
// since they come from the same K table.
// ════════════════════════════════════════════════════════════════════════════

const GENERATED: SeedRecipe[] = [];

let _idCounter = 0;
const genId = () => {
  _idCounter++;
  return `crecipeg${String(_idCounter).padStart(16, '0')}`;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Item = { ru: string; ruDat?: string; cap: string; k: Per100; g: number; allergens?: string[] };

// ── Каталоги ─────────────────────────────────────────────────────────────────
// ru: краткое название в нижнем регистре (для имени блюда, "с яблоком")
// ruDat: дательный падеж (после "к ...") — fallback к ru если совпадает
// cap: с заглавной (как в списке ингредиентов)

const FRUITS_OATS: Item[] = [
  { ru: 'яблоком',      cap: 'Яблоко',     k: K.apple,        g: 100 },
  { ru: 'грушей',       cap: 'Груша',      k: K.pear,         g: 120 },
  { ru: 'бананом',      cap: 'Банан',      k: K.banana,       g: 100 },
  { ru: 'малиной',      cap: 'Малина',     k: K.raspberry,    g: 80 },
  { ru: 'черникой',     cap: 'Черника',    k: K.blueberry,    g: 80 },
  { ru: 'клубникой',    cap: 'Клубника',   k: K.strawberry,   g: 100 },
  { ru: 'персиком',     cap: 'Персик',     k: K.peach,        g: 100 },
  { ru: 'манго',        cap: 'Манго',      k: K.mango,        g: 100 },
  { ru: 'киви',         cap: 'Киви',       k: K.kiwi,         g: 100 },
  { ru: 'апельсином',   cap: 'Апельсин',   k: K.orange,       g: 120 },
  { ru: 'смородиной',   cap: 'Смородина',  k: K.blackcurrant, g: 80 },
  { ru: 'вишней',       cap: 'Вишня',      k: K.cherry,       g: 80 },
  { ru: 'ананасом',     cap: 'Ананас',     k: K.pineapple,    g: 100 },
  { ru: 'гранатом',     cap: 'Гранат',     k: K.pomegranate,  g: 80 },
  { ru: 'изюмом',       cap: 'Изюм',       k: K.raisin,       g: 25 },
  { ru: 'черносливом',  cap: 'Чернослив',  k: K.prune,        g: 30 },
  { ru: 'курагой',      cap: 'Курага',     k: K.driedApricot, g: 30 },
  { ru: 'финиками',     cap: 'Финики',     k: K.date,         g: 30 },
];

const NUTS: Item[] = [
  { ru: 'грецкий орех',         cap: 'Грецкий орех',        k: K.walnut,       g: 15, allergens: ['nuts'] },
  { ru: 'миндаль',              cap: 'Миндаль',             k: K.almond,       g: 15, allergens: ['nuts'] },
  { ru: 'кешью',                cap: 'Кешью',               k: K.cashew,       g: 15, allergens: ['nuts'] },
  { ru: 'арахис',               cap: 'Арахис',              k: K.peanut,       g: 15, allergens: ['nuts'] },
  { ru: 'тыквенные семечки',    cap: 'Тыквенные семечки',   k: K.pumpkinSeed,  g: 15 },
  { ru: 'льняные семена',       cap: 'Льняные семена',      k: K.flaxseed,     g: 10 },
  { ru: 'семена чиа',           cap: 'Семена чиа',          k: K.chiaSeed,     g: 10 },
];

const PROTEINS: Item[] = [
  { ru: 'курицей',     cap: 'Куриная грудка',  k: K.chickenBreast, g: 180 },
  { ru: 'индейкой',    cap: 'Филе индейки',    k: K.turkeyBreast,  g: 180 },
  { ru: 'говядиной',   cap: 'Говядина',        k: K.beef,          g: 180 },
  { ru: 'свининой',    cap: 'Свинина нежирная',k: K.porkLean,      g: 180 },
  { ru: 'лососем',     cap: 'Лосось',          k: K.salmon,        g: 150, allergens: ['fish'] },
  { ru: 'треской',     cap: 'Треска',          k: K.cod,           g: 200, allergens: ['fish'] },
  { ru: 'тунцом',      cap: 'Тунец',           k: K.tuna,          g: 150, allergens: ['fish'] },
  { ru: 'креветками',  cap: 'Креветки',        k: K.shrimp,        g: 200 },
  { ru: 'форелью',     cap: 'Форель',          k: K.trout,         g: 180, allergens: ['fish'] },
  { ru: 'минтаем',     cap: 'Минтай',          k: K.hake,          g: 200, allergens: ['fish'] },
];

const SIDES: Item[] = [
  { ru: 'гречкой',          cap: 'Гречка варёная',          k: K.buckwheatCooked,   g: 150 },
  { ru: 'бурым рисом',      cap: 'Бурый рис варёный',       k: K.brownRiceCooked,   g: 150 },
  { ru: 'киноа',            cap: 'Киноа варёная',           k: K.quinoaCooked,      g: 150 },
  { ru: 'булгуром',         cap: 'Булгур варёный',          k: K.bulgurCooked,      g: 150, allergens: ['gluten'] },
  { ru: 'кускусом',         cap: 'Кускус варёный',          k: K.couscousCooked,    g: 150, allergens: ['gluten'] },
  { ru: 'перловкой',        cap: 'Перловка варёная',        k: K.pearlBarleyCooked, g: 150, allergens: ['gluten'] },
  { ru: 'пшеном',           cap: 'Пшено варёное',           k: K.millet,            g: 150 },
  { ru: 'картофелем',       cap: 'Картофель',               k: K.potato,            g: 200 },
  { ru: 'бататом',          cap: 'Сладкий картофель',       k: K.sweetPotato,       g: 200 },
];

const VEGS: Item[] = [
  { ru: 'брокколи',           cap: 'Брокколи',          k: K.broccoli,    g: 150 },
  { ru: 'цветной капустой',   cap: 'Цветная капуста',   k: K.cauliflower, g: 150 },
  { ru: 'спаржей',            cap: 'Спаржа',            k: K.asparagus,   g: 120 },
  { ru: 'стручковой фасолью', cap: 'Стручковая фасоль', k: K.greenBeans,  g: 120 },
  { ru: 'цуккини',            cap: 'Цуккини',           k: K.zucchini,    g: 150 },
  { ru: 'баклажанами',        cap: 'Баклажан',          k: K.eggplant,    g: 150 },
  { ru: 'болгарским перцем',  cap: 'Болгарский перец',  k: K.bellPepper,  g: 100 },
  { ru: 'грибами',            cap: 'Шампиньоны',        k: K.mushroom,    g: 150 },
  { ru: 'шпинатом',           cap: 'Шпинат',            k: K.spinach,     g: 80 },
  { ru: 'морковью',           cap: 'Морковь',           k: K.carrot,      g: 100 },
];

const MILKS: Item[] = [
  { ru: 'молоке 2.5%',  cap: 'Молоко 2.5%',     k: K.milkLow,          g: 200, allergens: ['lactose'] },
  { ru: 'овсяном молоке', cap: 'Овсяное молоко', k: K.milkOat,         g: 200 },
  { ru: 'кокосовом молоке', cap: 'Кокосовое молоко light', k: K.coconutMilkLight, g: 200 },
  { ru: 'воде',         cap: 'Вода',            k: { calories: 0, protein: 0, fats: 0, carbs: 0 }, g: 200 },
];

// helpers — собираем allergens из выбранных ингредиентов плюс базовые
function collectAllergens(...items: (Item | undefined)[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (it?.allergens) it.allergens.forEach((a) => set.add(a));
  return [...set];
}

// ────────────────────────────────────────────────────────────────────────────
// 1. ОВСЯНКИ × фрукты × молоко (~50 вариаций)
// ────────────────────────────────────────────────────────────────────────────
for (const fruit of FRUITS_OATS) {
  for (const milk of MILKS) {
    if (milk.ru === 'воде' && fruit.ru === 'изюмом') continue; // skip uninteresting combo
    if (GENERATED.length >= 50) break;
    const baseAllergens = ['gluten', ...(milk.allergens ?? [])];
    GENERATED.push({
      id: genId(),
      name: `Овсянка с ${fruit.ru} на ${milk.ru}`,
      descriptionRu: `Сытный завтрак из овсянки с ${fruit.ru}`,
      prepTimeMin: 10, servings: 1,
      ingredients: [
        ing('Овсяные хлопья', K.oatsRaw, 50),
        ing(milk.cap, milk.k, milk.g),
        ing(fruit.cap, fruit.k, fruit.g),
      ],
      steps: [
        `${milk.cap} довести до кипения в ковшике`,
        'Всыпать овсяные хлопья, варить 5-7 мин на медленном огне, периодически помешивая',
        'Снять с огня, накрыть крышкой, дать постоять 2 мин для парения',
        `Подать с ${fruit.ru}, по желанию полить мёдом и посыпать корицей`,
      ],
      tags: ['breakfast', 'maintain'],
      allergens: [...new Set([...baseAllergens, ...collectAllergens(fruit)])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. ОВСЯНКИ С ОРЕХАМИ (15 вариаций)
// ────────────────────────────────────────────────────────────────────────────
const oatNutFruits = FRUITS_OATS.slice(0, 8);
for (const fruit of oatNutFruits) {
  for (const nut of NUTS.slice(0, 2)) {
    if (GENERATED.length >= 65) break;
    GENERATED.push({
      id: genId(),
      name: `Овсянка с ${fruit.ru} и ${nut.ru.includes('семена') ? nut.ru : `${nut.ru.replace('ё','е').replace(/\b(\S+)$/,'$1')}ом`}`,
      descriptionRu: `Хрустящий завтрак с белком и полезными жирами`,
      prepTimeMin: 10, servings: 1,
      ingredients: [
        ing('Овсяные хлопья', K.oatsRaw, 50),
        ing('Молоко 2.5%', K.milkLow, 200),
        ing(fruit.cap, fruit.k, fruit.g),
        ing(nut.cap, nut.k, nut.g),
      ],
      steps: [
        'Молоко довести до кипения, всыпать овсяные хлопья',
        'Варить 5-7 мин на медленном огне до густой консистенции, помешивая',
        'Снять с огня, накрыть, дать постоять 2 мин',
        `Подать с ${fruit.ru}, посыпать ${nut.cap.toLowerCase()}`,
        'Совет: орехи можно слегка обжарить на сухой сковороде 2 мин — раскроется вкус',
      ],
      tags: ['breakfast', 'maintain'],
      allergens: [...new Set(['gluten', 'lactose', ...collectAllergens(nut)])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. КАШИ × крупы × фрукты (~30)
// ────────────────────────────────────────────────────────────────────────────
const PORRIDGES = [
  { ru: 'Гречневая каша',  cap: 'Гречка варёная',     k: K.buckwheatCooked, g: 180, allergens: [] as string[] },
  { ru: 'Рисовая каша',    cap: 'Рис варёный',        k: K.whiteRiceCooked, g: 180, allergens: [] as string[] },
  { ru: 'Пшённая каша',    cap: 'Пшено варёное',      k: K.millet,          g: 180, allergens: [] as string[] },
  { ru: 'Перловая каша',   cap: 'Перловка варёная',   k: K.pearlBarleyCooked, g: 180, allergens: ['gluten'] },
  { ru: 'Манная каша',     cap: 'Манная крупа',       k: K.pastaReg,        g: 60,  allergens: ['gluten'] },
];
const PORRIDGE_TOPPINGS = FRUITS_OATS.slice(0, 8);
for (const por of PORRIDGES) {
  for (const top of PORRIDGE_TOPPINGS.slice(0, 6)) {
    GENERATED.push({
      id: genId(),
      name: `${por.ru} с ${top.ru}`,
      descriptionRu: `Тёплая каша на молоке с ${top.ru}`,
      prepTimeMin: 20, servings: 1,
      ingredients: [
        ing(por.cap, por.k, por.g),
        ing('Молоко 2.5%', K.milkLow, 200),
        ing(top.cap, top.k, top.g),
      ],
      steps: [
        'Крупу промыть холодной водой',
        'Залить молоком в пропорции 1:2, довести до кипения',
        'Варить на минимальном огне до готовности (гречка 15 мин, рис 20 мин, перловка 40-50 мин)',
        `Подать с ${top.ru}, по желанию посыпать корицей`,
      ],
      tags: ['breakfast', 'maintain'],
      allergens: [...new Set(['lactose', ...por.allergens])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. ОМЛЕТЫ × начинки (~40)
// ────────────────────────────────────────────────────────────────────────────
const OMLET_FILLINGS: Array<{ ru: string; ings: SeedIngredient[]; allergens?: string[] }> = [
  { ru: 'шпинатом',           ings: [ing('Шпинат', K.spinach, 60)] },
  { ru: 'грибами',            ings: [ing('Шампиньоны', K.mushroom, 100)] },
  { ru: 'помидорами',         ings: [ing('Помидоры', K.tomato, 100)] },
  { ru: 'болгарским перцем',  ings: [ing('Болгарский перец', K.bellPepper, 80)] },
  { ru: 'брокколи',           ings: [ing('Брокколи', K.broccoli, 100)] },
  { ru: 'цуккини',            ings: [ing('Цуккини', K.zucchini, 100)] },
  { ru: 'спаржей',            ings: [ing('Спаржа', K.asparagus, 80)] },
  { ru: 'фетой',              ings: [ing('Фета', K.fetaCheese, 40)], allergens: ['lactose'] },
  { ru: 'моцареллой',         ings: [ing('Моцарелла', K.mozzarella, 40)], allergens: ['lactose'] },
  { ru: 'твёрдым сыром',      ings: [ing('Сыр твёрдый', K.hardCheese20, 30)], allergens: ['lactose'] },
  { ru: 'курицей',            ings: [ing('Куриная грудка варёная', K.chickenBreast, 80)] },
  { ru: 'тунцом',             ings: [ing('Тунец консервированный', K.tunaCanned, 70)], allergens: ['fish'] },
  { ru: 'лососем',            ings: [ing('Лосось солёный', K.salmon, 50)], allergens: ['fish'] },
  { ru: 'ветчиной',           ings: [ing('Ветчина', K.ham, 50)] },
  { ru: 'кабачком',           ings: [ing('Кабачок', K.zucchini, 100)] },
  { ru: 'зелёным луком',      ings: [ing('Зелёный лук', K.greenOnion, 30)] },
  { ru: 'укропом и зеленью',  ings: [ing('Укроп', K.dill, 15)] },
  { ru: 'нутом',              ings: [ing('Нут варёный', K.chickpeasCooked, 80)] },
  { ru: 'фасолью',            ings: [ing('Фасоль красная', K.beanRedCooked, 80)] },
  { ru: 'картофелем',         ings: [ing('Картофель варёный', K.potato, 100)] },
];
for (const fill of OMLET_FILLINGS) {
  for (let eggs = 2; eggs <= 3; eggs++) {
    GENERATED.push({
      id: genId(),
      name: `Омлет из ${eggs} яиц с ${fill.ru}`,
      descriptionRu: `Белковый завтрак с ${fill.ru}`,
      prepTimeMin: 10, servings: 1,
      ingredients: [egg(eggs), ...fill.ings, ing('Оливковое масло', K.oliveOil, 5)],
      steps: [
        'Яйца взбить вилкой с щепоткой соли и 1 ст.л. молока до однородности',
        `Начинку (${fill.ru}) нарезать, обжарить на разогретой сковороде 3 мин до мягкости`,
        'Залить взбитыми яйцами, накрыть крышкой',
        'Готовить на минимальном огне 4-5 мин, пока белок не схватится и не станет матовым',
        'Подать с зеленью и свежим хлебом',
      ],
      tags: ['breakfast', 'maintain', 'high-protein'],
      allergens: [...new Set(['eggs', ...(fill.allergens ?? [])])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. ТВОРОЖНЫЕ ЗАВТРАКИ — творог × фрукты × орехи (~30)
// ────────────────────────────────────────────────────────────────────────────
const CURD_FRUITS = FRUITS_OATS.slice(0, 12);
for (const fruit of CURD_FRUITS) {
  for (const variant of [
    { fat: 5,  cap: 'Творог 5%',           k: K.curd5,  goal: 'maintain' },
    { fat: 0,  cap: 'Творог обезжиренный', k: K.curd0,  goal: 'weight-loss' },
  ]) {
    if (GENERATED.length >= 250) break;
    GENERATED.push({
      id: genId(),
      name: `${variant.cap} с ${fruit.ru}`,
      descriptionRu: 'Простой белковый завтрак',
      prepTimeMin: 3, servings: 1,
      ingredients: [
        ing(variant.cap, variant.k, 200),
        ing(fruit.cap, fruit.k, fruit.g),
      ],
      steps: [
        'Творог выложить в миску, размять вилкой до однородности',
        'Если творог сухой — добавить 1 ст.л. йогурта или молока для кремовости',
        `Сверху выложить ${fruit.ru}`,
        'По желанию полить мёдом и посыпать семенами льна',
      ],
      tags: ['breakfast', variant.goal, 'high-protein'],
      allergens: ['lactose'],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 6. СМУЗИ — фрукты × молоко (~50)
// ────────────────────────────────────────────────────────────────────────────
const SMOOTHIE_FRUITS = [
  { ru: 'банан-малина',     ings: [ing('Банан', K.banana, 100), ing('Малина', K.raspberry, 80)] },
  { ru: 'банан-черника',    ings: [ing('Банан', K.banana, 100), ing('Черника', K.blueberry, 80)] },
  { ru: 'банан-клубника',   ings: [ing('Банан', K.banana, 100), ing('Клубника', K.strawberry, 100)] },
  { ru: 'манго-апельсин',   ings: [ing('Манго', K.mango, 120), ing('Апельсин', K.orange, 100)] },
  { ru: 'клубника-киви',    ings: [ing('Клубника', K.strawberry, 100), ing('Киви', K.kiwi, 100)] },
  { ru: 'персик-малина',    ings: [ing('Персик', K.peach, 120), ing('Малина', K.raspberry, 60)] },
  { ru: 'банан-какао',      ings: [ing('Банан', K.banana, 120), ing('Какао-порошок', K.cocoaPowder, 8)] },
  { ru: 'ягодный микс',     ings: [ing('Ягоды mix', K.blueberry, 150)] },
  { ru: 'яблоко-морковь',   ings: [ing('Яблоко', K.apple, 150), ing('Морковь', K.carrot, 80)] },
  { ru: 'шпинат-яблоко',    ings: [ing('Шпинат', K.spinach, 50), ing('Яблоко', K.apple, 150), ing('Банан', K.banana, 80)] },
  { ru: 'шпинат-груша',     ings: [ing('Шпинат', K.spinach, 50), ing('Груша', K.pear, 150)] },
  { ru: 'свёкла-апельсин',  ings: [ing('Свёкла варёная', K.beetroot, 100), ing('Апельсин', K.orange, 150)] },
  { ru: 'тыква-имбирь',     ings: [ing('Тыква запечённая', K.pumpkin, 150), ing('Банан', K.banana, 80)] },
];
const SMOOTHIE_BASES: Array<{ ru: string; ing: SeedIngredient; allergens: string[] }> = [
  { ru: 'на молоке',          ing: ing('Молоко 2.5%', K.milkLow, 250),      allergens: ['lactose'] },
  { ru: 'на овсяном молоке',  ing: ing('Овсяное молоко', K.milkOat, 250),   allergens: [] },
  { ru: 'на йогурте',         ing: ing('Греческий йогурт', K.yogurtGreek, 200), allergens: ['lactose'] },
  { ru: 'на кокосовом молоке', ing: ing('Кокосовое молоко light', K.coconutMilkLight, 250), allergens: [] },
];
for (const fruits of SMOOTHIE_FRUITS) {
  for (const base of SMOOTHIE_BASES) {
    if (GENERATED.length >= 320) break;
    GENERATED.push({
      id: genId(),
      name: `Смузи ${fruits.ru} ${base.ru}`,
      descriptionRu: `Витаминный смузи`,
      prepTimeMin: 5, servings: 1,
      ingredients: [base.ing, ...fruits.ings],
      tags: ['breakfast', 'maintain'],
      steps: [
        'Фрукты вымыть, крупно нарезать (бананы можно заранее заморозить — гуще + холоднее)',
        'Сложить в блендер вместе с жидкой основой',
        'Взбить 30-40 сек до однородной кремовой текстуры',
        'Перелить в стакан, подать сразу — со временем расслаивается',
      ],
      allergens: base.allergens,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 7. БЕЛКОВЫЕ ШЕЙКИ — протеин × фрукты (~25)
// ────────────────────────────────────────────────────────────────────────────
const SHAKE_ADDONS: Array<{ ru: string; cap: string; k: Per100; g: number; allergens?: string[] }> = [
  { ru: 'банан',     cap: 'Банан',     k: K.banana, g: 120 },
  { ru: 'клубника',  cap: 'Клубника',  k: K.strawberry, g: 120 },
  { ru: 'малина',    cap: 'Малина',    k: K.raspberry, g: 80 },
  { ru: 'черника',   cap: 'Черника',   k: K.blueberry, g: 80 },
  { ru: 'манго',     cap: 'Манго',     k: K.mango, g: 100 },
  { ru: 'персик',    cap: 'Персик',    k: K.peach, g: 100 },
  { ru: 'какао',     cap: 'Какао-порошок', k: K.cocoaPowder, g: 8 },
  { ru: 'арахисовая паста', cap: 'Арахисовая паста', k: K.peanutButter, g: 20, allergens: ['nuts'] },
  { ru: 'овсянка',   cap: 'Овсяные хлопья', k: K.oatsRaw, g: 30, allergens: ['gluten'] },
];
for (const addon of SHAKE_ADDONS) {
  for (const proto of [
    { cap: 'Сывороточный протеин', k: K.proteinWhey,  base: 'Молоко 2.5%',  baseK: K.milkLow,  baseAl: ['lactose'] as string[] },
    { cap: 'Растительный протеин', k: K.proteinPlant, base: 'Овсяное молоко', baseK: K.milkOat,  baseAl: [] as string[] },
  ]) {
    GENERATED.push({
      id: genId(),
      name: `Протеиновый шейк с ${addon.ru} (${proto.cap.toLowerCase()})`,
      descriptionRu: 'Послетренировочный белковый напиток',
      prepTimeMin: 3, servings: 1,
      ingredients: [
        ing(proto.cap, proto.k, 30),
        ing(proto.base, proto.baseK, 250),
        ing(addon.cap, addon.k, addon.g),
      ],
      steps: [
        'В шейкер налить жидкость (молоко или молоко-заменитель)',
        'Добавить мерную ложку протеина и фруктовый/вкусовой компонент',
        'Плотно закрыть, встряхивать 30-40 сек до полного растворения порошка',
        'Пить охлаждённым в течение 30 мин после тренировки',
      ],
      tags: ['snack', 'gain', 'high-protein'],
      allergens: [...new Set([...proto.baseAl, ...(addon.allergens ?? [])])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 8. БЕЛКОВЫЕ ОБЕДЫ/УЖИНЫ — белок × гарнир × овощ (~120)
// ────────────────────────────────────────────────────────────────────────────
for (const meat of PROTEINS) {
  for (const side of SIDES.slice(0, 6)) {
    for (const veg of VEGS.slice(0, 4)) {
      if (GENERATED.length >= 480) break;
      const isFish = !!meat.allergens?.includes('fish');
      const cookVerb = isFish ? 'Запечь' : 'Обжарить';
      const meal = (meat.k.fats > 10 || side.cap.includes('Картоф')) ? 'dinner' : 'lunch';
      GENERATED.push({
        id: genId(),
        name: `${meat.cap} с ${side.ru} и ${veg.ru}`,
        descriptionRu: `Сбалансированный обед: белок, сложные углеводы, овощи`,
        prepTimeMin: 30, servings: 1,
        ingredients: [
          ing(meat.cap, meat.k, meat.g),
          ing(side.cap, side.k, side.g),
          ing(veg.cap, veg.k, veg.g),
        ],
        steps: [
          `${cookVerb} ${meat.cap.toLowerCase()} 12-15 мин`,
          `Подготовить ${side.ru}`,
          `${veg.cap} приготовить на пару 5-7 мин`,
          'Собрать на тарелке',
        ],
        tags: [meal, 'maintain', 'high-protein'],
        allergens: collectAllergens(meat, side, veg),
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 9. САЛАТЫ — белок × овощи × заправка (~50)
// ────────────────────────────────────────────────────────────────────────────
const SALAD_PROTEINS: Item[] = [
  { ru: 'курицей',    cap: 'Куриная грудка варёная', k: K.chickenBreast, g: 150 },
  { ru: 'тунцом',     cap: 'Тунец консервированный', k: K.tunaCanned,    g: 100, allergens: ['fish'] },
  { ru: 'индейкой',   cap: 'Индейка варёная',         k: K.turkeyBreast,  g: 150 },
  { ru: 'лососем',    cap: 'Лосось',                  k: K.salmon,        g: 120, allergens: ['fish'] },
  { ru: 'креветками', cap: 'Креветки',                k: K.shrimp,        g: 150 },
  { ru: 'яйцом',      cap: 'Яйца варёные',            k: { calories: 155, protein: 13, fats: 11, carbs: 1.1 }, g: 100, allergens: ['eggs'] },
  { ru: 'тофу',       cap: 'Тофу',                    k: { calories: 76, protein: 8, fats: 4.8, carbs: 1.9 }, g: 150, allergens: ['soy'] },
];
const SALAD_GREENS: Item[] = [
  { ru: 'руколой',    cap: 'Руккола',         k: K.arugula,    g: 60 },
  { ru: 'микс-салатом', cap: 'Микс салатов', k: K.saladMix,   g: 80 },
  { ru: 'шпинатом',   cap: 'Шпинат',          k: K.spinach,    g: 80 },
  { ru: 'ромэном',    cap: 'Салат ромэн',     k: K.romain,     g: 100 },
];
const SALAD_EXTRAS: Item[] = [
  { ru: 'помидорами черри',  cap: 'Помидоры черри', k: K.tomato,    g: 100 },
  { ru: 'огурцом',           cap: 'Огурец',          k: K.cucumber,  g: 100 },
  { ru: 'авокадо',           cap: 'Авокадо',         k: K.avocado,   g: 80 },
  { ru: 'болгарским перцем', cap: 'Болгарский перец',k: K.bellPepper, g: 80 },
];
for (const prot of SALAD_PROTEINS) {
  for (const green of SALAD_GREENS) {
    for (const extra of SALAD_EXTRAS.slice(0, 2)) {
      if (GENERATED.length >= 540) break;
      GENERATED.push({
        id: genId(),
        name: `Салат с ${prot.ru}, ${green.ru} и ${extra.ru}`,
        descriptionRu: 'Лёгкий белковый салат',
        prepTimeMin: 15, servings: 1,
        ingredients: [
          ing(prot.cap, prot.k, prot.g),
          ing(green.cap, green.k, green.g),
          ing(extra.cap, extra.k, extra.g),
          ing('Оливковое масло', K.oliveOil, 8),
        ],
        steps: [
          `${prot.cap} отварить или обжарить 5-8 мин до готовности, дать остыть и нарезать`,
          'Овощи вымыть, нарезать кубиками или соломкой среднего размера',
          `${green.cap} порвать руками — резать ножом нельзя, потеряется хруст`,
          'Все компоненты смешать в большой миске',
          'Заправить оливковым маслом + соком лимона, посолить-поперчить, перемешать аккуратно',
        ],
        tags: ['lunch', 'weight-loss', 'high-protein'],
        allergens: collectAllergens(prot, extra),
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 10. БОУЛЫ — белок × крупа × овощ × заправка (~80)
// ────────────────────────────────────────────────────────────────────────────
for (const prot of SALAD_PROTEINS.slice(0, 5)) {
  for (const side of SIDES.slice(0, 4)) {
    for (const veg of VEGS.slice(0, 4)) {
      if (GENERATED.length >= 620) break;
      GENERATED.push({
        id: genId(),
        name: `Боул с ${prot.ru}, ${side.ru} и ${veg.ru}`,
        descriptionRu: 'Сбалансированный обед в одной миске',
        prepTimeMin: 25, servings: 1,
        ingredients: [
          ing(prot.cap, prot.k, prot.g),
          ing(side.cap, side.k, side.g),
          ing(veg.cap, veg.k, veg.g),
          ing('Авокадо', K.avocado, 60),
        ],
        steps: [
          `${prot.cap} отварить/обжарить 8-10 мин до готовности, нарезать кусочками`,
          `Гарнир (${side.ru}) сварить согласно инструкции на упаковке`,
          `${veg.cap} приготовить на пару 5-7 мин до сохранения цвета и лёгкого хруста`,
          'Авокадо очистить, нарезать дольками',
          'В глубокую тарелку выложить гарнир основой, сверху белок, овощи и авокадо секторами',
          'Сбрызнуть оливковым маслом и лимонным соком',
        ],
        tags: ['lunch', 'maintain', 'high-protein'],
        allergens: collectAllergens(prot, side, veg),
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 11. ЛАВАШИ/WRAPS — начинки (~30)
// ────────────────────────────────────────────────────────────────────────────
const WRAP_FILLINGS: Array<{ ru: string; ings: SeedIngredient[]; allergens: string[] }> = [
  { ru: 'курицей и овощами',     ings: [ing('Куриная грудка варёная', K.chickenBreast, 120), ing('Помидоры', K.tomato, 80), ing('Микс салатов', K.saladMix, 40)], allergens: [] },
  { ru: 'индейкой и шпинатом',   ings: [ing('Индейка варёная', K.turkeyBreast, 120), ing('Шпинат', K.spinach, 50)], allergens: [] },
  { ru: 'тунцом и йогуртом',     ings: [ing('Тунец консервированный', K.tunaCanned, 100), ing('Греческий йогурт', K.yogurtGreek, 30)], allergens: ['fish', 'lactose'] },
  { ru: 'творогом и зеленью',    ings: [ing('Творог 5%', K.curd5, 150), ing('Укроп', K.dill, 15)], allergens: ['lactose'] },
  { ru: 'хумусом и овощами',     ings: [ing('Хумус', K.hummus, 60), ing('Болгарский перец', K.bellPepper, 80), ing('Огурец', K.cucumber, 80)], allergens: [] },
  { ru: 'фалафелем и хумусом',   ings: [ing('Нут варёный', K.chickpeasCooked, 150), ing('Хумус', K.hummus, 50)], allergens: [] },
  { ru: 'лососем и авокадо',     ings: [ing('Лосось солёный', K.salmon, 80), ing('Авокадо', K.avocado, 60)], allergens: ['fish'] },
  { ru: 'креветками и авокадо',  ings: [ing('Креветки варёные', K.shrimp, 120), ing('Авокадо', K.avocado, 60)], allergens: [] },
  { ru: 'говядиной и луком',     ings: [ing('Говядина варёная', K.beef, 120), ing('Лук репчатый', K.onion, 40)], allergens: [] },
  { ru: 'яйцом и зеленью',       ings: [egg(2), ing('Зелёный лук', K.greenOnion, 30)], allergens: ['eggs'] },
  { ru: 'фетой и шпинатом',      ings: [ing('Фета', K.fetaCheese, 50), ing('Шпинат', K.spinach, 60)], allergens: ['lactose'] },
  { ru: 'грибами и шпинатом',    ings: [ing('Шампиньоны', K.mushroom, 120), ing('Шпинат', K.spinach, 50)], allergens: [] },
];
for (const fill of WRAP_FILLINGS) {
  for (const breadType of [
    { cap: 'Лаваш тонкий', k: K.flatbread, g: 80 },
    { cap: 'Хлеб цельнозерновой', k: K.breadWhole, g: 60 },
  ]) {
    GENERATED.push({
      id: genId(),
      name: `${breadType.cap.includes('Лаваш') ? 'Лаваш' : 'Сэндвич'} с ${fill.ru}`,
      descriptionRu: 'Удобный обед или перекус с собой',
      prepTimeMin: 10, servings: 1,
      ingredients: [ing(breadType.cap, breadType.k, breadType.g), ...fill.ings],
      steps: [
        `${breadType.cap} развернуть на доске или большой тарелке`,
        'Распределить начинку тонким слоем по центру, отступив 2-3 см от краёв',
        'Свернуть рулетом снизу вверх, плотно прижимая для компактности',
        'По желанию: обжарить на сухой сковороде по 2 мин с каждой стороны до хрустящей корочки',
        'Разрезать пополам наискосок и подавать',
      ],
      tags: ['lunch', 'maintain', 'high-protein'],
      allergens: [...new Set(['gluten', ...fill.allergens])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 12. ПАСТА — соус × белок (~30)
// ────────────────────────────────────────────────────────────────────────────
const PASTA_PROTEINS: Item[] = [
  { ru: 'курицей',  cap: 'Куриная грудка',  k: K.chickenBreast, g: 150 },
  { ru: 'индейкой', cap: 'Филе индейки',    k: K.turkeyBreast,  g: 150 },
  { ru: 'тунцом',   cap: 'Тунец консервированный', k: K.tunaCanned, g: 120, allergens: ['fish'] },
  { ru: 'креветками', cap: 'Креветки',       k: K.shrimp,        g: 150 },
  { ru: 'фаршем индейки', cap: 'Фарш индейки', k: K.turkeyMince,  g: 150 },
];
const PASTA_SAUCES: Array<{ ru: string; ings: SeedIngredient[]; allergens?: string[] }> = [
  { ru: 'томатном соусе',     ings: [ing('Помидоры в собственном соку', K.tomatoCanned, 200)] },
  { ru: 'сливочном соусе',    ings: [ing('Молоко 2.5%', K.milkLow, 200), ing('Пармезан', K.parmesan, 20)], allergens: ['lactose'] },
  { ru: 'песто',              ings: [ing('Песто соус', { calories: 450, protein: 6, fats: 45, carbs: 8 }, 30), ing('Пармезан', K.parmesan, 15)], allergens: ['lactose', 'nuts'] },
];
for (const prot of PASTA_PROTEINS) {
  for (const sauce of PASTA_SAUCES) {
    GENERATED.push({
      id: genId(),
      name: `Паста с ${prot.ru} в ${sauce.ru}`,
      descriptionRu: `Сбалансированная итальянская паста`,
      prepTimeMin: 25, servings: 1,
      ingredients: [
        ing('Паста цельнозерновая сухая', K.pastaWhole, 80),
        ing(prot.cap, prot.k, prot.g),
        ...sauce.ings,
      ],
      steps: [
        'В кипящую подсоленную воду опустить пасту, варить al dente (на 1-2 мин меньше времени с упаковки)',
        `${prot.cap} нарезать, обжарить на разогретой сковороде с 1 ст.л. оливкового масла 5-8 мин до золотистости`,
        `Добавить ${sauce.ru.replace(/^.+? /,'')}, прогреть 2-3 мин`,
        'Пасту слить, оставив 50 мл воды для соуса',
        'Смешать пасту с соусом на сковороде 1 мин, при необходимости добавить пасту-воду для шелковистой текстуры',
        'Подать сразу, при подаче посыпать пармезаном и зеленью',
      ],
      tags: ['lunch', 'maintain', 'high-protein'],
      allergens: [...new Set(['gluten', ...(prot.allergens ?? []), ...(sauce.allergens ?? [])])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 13. СУПЫ (~30)
// ────────────────────────────────────────────────────────────────────────────
const SOUPS: Array<{ name: string; desc: string; ings: SeedIngredient[]; steps: string[]; allergens: string[]; tags: string[] }> = [
  { name: 'Суп-пюре из брокколи', desc: 'Лёгкий зелёный крем-суп',
    ings: [ing('Брокколи', K.broccoli, 400), ing('Картофель', K.potato, 150), ing('Лук репчатый', K.onion, 80), ing('Молоко 2.5%', K.milkLow, 200)],
    steps: ['Лук обжарить', 'Добавить брокколи и картофель, залить водой 600 мл', 'Варить 15 мин', 'Влить молоко, пробить блендером'],
    allergens: ['lactose'], tags: ['lunch', 'weight-loss'] },
  { name: 'Суп-пюре из тыквы', desc: 'Согревающий осенний суп',
    ings: [ing('Тыква', K.pumpkin, 500), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80)],
    steps: ['Овощи нарезать кубиками', 'Залить 700 мл воды, варить 20 мин', 'Пробить блендером'],
    allergens: [], tags: ['lunch', 'weight-loss'] },
  { name: 'Суп-пюре из цветной капусты', desc: 'Нежный суп с пользой',
    ings: [ing('Цветная капуста', K.cauliflower, 400), ing('Картофель', K.potato, 150), ing('Молоко 2.5%', K.milkLow, 200)],
    steps: ['Капусту и картофель сварить 15 мин', 'Влить молоко', 'Пробить блендером'],
    allergens: ['lactose'], tags: ['lunch', 'weight-loss'] },
  { name: 'Чечевичный суп с морковью', desc: 'Растительный белок согревает',
    ings: [ing('Красная чечевица', K.lentilRedRaw, 150), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80), ing('Помидоры в собственном соку', K.tomatoCanned, 150)],
    steps: ['Лук и морковь обжарить', 'Добавить чечевицу, томаты, 1 л воды', 'Варить 25 мин'],
    allergens: [], tags: ['lunch', 'maintain'] },
  { name: 'Куриный суп с овощами и киноа', desc: 'Полноценный белковый обед',
    ings: [ing('Куриная грудка', K.chickenBreast, 300), ing('Морковь', K.carrot, 100), ing('Сельдерей', { calories: 16, protein: 0.7, fats: 0.2, carbs: 3 }, 80), ing('Киноа варёная', K.quinoaCooked, 100)],
    steps: ['Грудку варить 20 мин', 'Достать, вернуть нарезанной', 'Добавить овощи и киноа, варить 10 мин'],
    allergens: [], tags: ['lunch', 'maintain', 'high-protein'] },
  { name: 'Грибной суп с перловкой', desc: 'Сытный осенний суп',
    ings: [ing('Шампиньоны', K.mushroom, 300), ing('Перловка варёная', K.pearlBarleyCooked, 150), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80)],
    steps: ['Перловку отварить заранее', 'Грибы и овощи обжарить 8 мин', 'Залить 1 л воды, варить 15 мин', 'Добавить перловку, прогреть'],
    allergens: ['gluten'], tags: ['lunch', 'maintain'] },
  { name: 'Рассольник с курицей', desc: 'Кисло-солёный согревающий суп',
    ings: [ing('Куриная грудка', K.chickenBreast, 300), ing('Перловка варёная', K.pearlBarleyCooked, 150), ing('Огурцы солёные', K.cucumber, 200), ing('Морковь', K.carrot, 100)],
    steps: ['Грудку отварить 20 мин', 'Добавить огурцы, морковь, перловку', 'Варить 15 мин'],
    allergens: ['gluten'], tags: ['lunch', 'maintain', 'high-protein'] },
  { name: 'Солянка сборная light', desc: 'Облегчённая версия классики',
    ings: [ing('Куриная грудка', K.chickenBreast, 200), ing('Ветчина', K.ham, 100), ing('Огурцы солёные', K.cucumber, 150), ing('Помидоры в собственном соку', K.tomatoCanned, 200), ing('Маслины', K.oliveBlack, 50)],
    steps: ['Мясо нарезать', 'Огурцы и томаты потушить 8 мин', 'Залить 1 л воды, добавить мясо, варить 15 мин', 'Подать с маслинами'],
    allergens: [], tags: ['lunch', 'maintain', 'high-protein'] },
  { name: 'Окрошка на кефире', desc: 'Освежающий летний суп',
    ings: [ing('Кефир 1%', { calories: 38, protein: 3, fats: 1, carbs: 4 }, 500), ing('Огурец', K.cucumber, 200), ing('Картофель варёный', K.potato, 150), egg(2), ing('Куриная грудка варёная', K.chickenBreast, 150)],
    steps: ['Овощи и мясо нарезать кубиками', 'Залить кефиром', 'Подать охлаждённым'],
    allergens: ['lactose', 'eggs'], tags: ['lunch', 'weight-loss', 'high-protein'] },
  { name: 'Холодный свекольник', desc: 'Освежающий красный суп на кефире',
    ings: [ing('Свёкла варёная', K.beetroot, 200), ing('Огурец', K.cucumber, 150), ing('Кефир 1%', { calories: 38, protein: 3, fats: 1, carbs: 4 }, 400), egg(1)],
    steps: ['Свёклу натереть', 'Огурец нарезать', 'Залить кефиром', 'Подать с половинкой яйца'],
    allergens: ['lactose', 'eggs'], tags: ['lunch', 'weight-loss'] },
  { name: 'Минестроне с фасолью', desc: 'Итальянский густой овощной суп',
    ings: [ing('Фасоль белая варёная', K.beanWhiteCooked, 200), ing('Морковь', K.carrot, 100), ing('Цуккини', K.zucchini, 150), ing('Помидоры в собственном соку', K.tomatoCanned, 200), ing('Паста цельнозерновая сухая', K.pastaWhole, 50)],
    steps: ['Овощи нарезать, обжарить 5 мин', 'Залить 1 л воды, варить 15 мин', 'Добавить пасту и фасоль, варить ещё 8 мин'],
    allergens: ['gluten'], tags: ['lunch', 'maintain'] },
  { name: 'Том-кха с курицей', desc: 'Тайский кокосовый суп',
    ings: [ing('Куриная грудка', K.chickenBreast, 250), ing('Кокосовое молоко light', K.coconutMilkLight, 400), ing('Шампиньоны', K.mushroom, 150), ing('Имбирь', { calories: 80, protein: 1.8, fats: 0.7, carbs: 18 }, 10)],
    steps: ['Курицу нарезать соломкой', 'Залить кокосовым молоком и водой 200 мл', 'Добавить имбирь и грибы, варить 15 мин'],
    allergens: [], tags: ['lunch', 'maintain', 'high-protein'] },
  { name: 'Рыбный суп с лососем', desc: 'Лёгкая уха с лососем',
    ings: [ing('Лосось', K.salmon, 300), ing('Картофель', K.potato, 200), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80)],
    steps: ['В воде 1.5 л сварить картофель и лук 10 мин', 'Добавить морковь и лосось, варить 12 мин'],
    allergens: ['fish'], tags: ['lunch', 'weight-loss', 'high-protein'] },
  { name: 'Куриный суп с лапшой по-домашнему', desc: 'Домашний суп',
    ings: [ing('Куриная грудка', K.chickenBreast, 300), ing('Лапша яичная', K.pastaReg, 80), ing('Морковь', K.carrot, 100), ing('Лук репчатый', K.onion, 80)],
    steps: ['Грудку отварить 20 мин', 'Добавить морковь и лук, варить 8 мин', 'Добавить лапшу, варить 5 мин'],
    allergens: ['gluten', 'eggs'], tags: ['lunch', 'maintain', 'high-protein'] },
  { name: 'Гаспачо', desc: 'Холодный испанский томатный суп',
    ings: [ing('Помидоры', K.tomato, 500), ing('Огурец', K.cucumber, 150), ing('Болгарский перец', K.bellPepper, 100), ing('Оливковое масло', K.oliveOil, 15)],
    steps: ['Все овощи пробить блендером', 'Заправить оливковым маслом', 'Охладить 1 час'],
    allergens: [], tags: ['lunch', 'weight-loss'] },
];
for (const s of SOUPS) {
  GENERATED.push({
    id: genId(),
    name: s.name, descriptionRu: s.desc,
    prepTimeMin: 35, servings: 3,
    ingredients: s.ings, steps: s.steps,
    tags: s.tags, allergens: s.allergens,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 14. РАГУ И ТУШЁНОЕ (~25)
// ────────────────────────────────────────────────────────────────────────────
const STEW_PROTEINS: Item[] = [
  { ru: 'курицы',     cap: 'Куриные бёдра', k: K.chickenLeg,  g: 400 },
  { ru: 'индейки',    cap: 'Филе индейки',  k: K.turkeyBreast, g: 400 },
  { ru: 'говядины',   cap: 'Говядина',      k: K.beef,         g: 400 },
  { ru: 'свинины',    cap: 'Свинина нежирная', k: K.porkLean,  g: 400 },
];
const STEW_VEGS: Array<{ ru: string; ings: SeedIngredient[] }> = [
  { ru: 'с картофелем и морковью', ings: [ing('Картофель', K.potato, 300), ing('Морковь', K.carrot, 150), ing('Лук репчатый', K.onion, 100)] },
  { ru: 'с фасолью и томатами',    ings: [ing('Фасоль красная варёная', K.beanRedCooked, 200), ing('Помидоры в собственном соку', K.tomatoCanned, 250), ing('Лук репчатый', K.onion, 100)] },
  { ru: 'с грибами и луком',       ings: [ing('Шампиньоны', K.mushroom, 250), ing('Лук репчатый', K.onion, 150), ing('Морковь', K.carrot, 100)] },
  { ru: 'с цуккини и баклажанами', ings: [ing('Цуккини', K.zucchini, 200), ing('Баклажан', K.eggplant, 200), ing('Помидоры', K.tomato, 150)] },
  { ru: 'с капустой',              ings: [ing('Капуста', K.cabbage, 400), ing('Морковь', K.carrot, 150), ing('Помидоры в собственном соку', K.tomatoCanned, 150)] },
];
for (const prot of STEW_PROTEINS) {
  for (const veg of STEW_VEGS) {
    GENERATED.push({
      id: genId(),
      name: `Рагу из ${prot.ru} ${veg.ru}`,
      descriptionRu: 'Тушёное мясо с овощами',
      prepTimeMin: 60, servings: 3,
      ingredients: [ing(prot.cap, prot.k, prot.g), ...veg.ings],
      steps: [`${prot.cap} нарезать, обжарить 5 мин`, 'Добавить овощи, тушить 10 мин', 'Влить 200 мл воды, тушить 35 мин под крышкой'],
      tags: ['dinner', 'maintain', 'high-protein'],
      allergens: collectAllergens(prot),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 15. ЗАПЕЧЁННЫЕ БЛЮДА — белок × овощ-микс (~30)
// ────────────────────────────────────────────────────────────────────────────
const BAKED_VEGS: Array<{ ru: string; ings: SeedIngredient[] }> = [
  { ru: 'с брокколи и морковью',     ings: [ing('Брокколи', K.broccoli, 200), ing('Морковь', K.carrot, 150)] },
  { ru: 'с картофелем и спаржей',    ings: [ing('Картофель', K.potato, 250), ing('Спаржа', K.asparagus, 150)] },
  { ru: 'с кабачками и помидорами',  ings: [ing('Цуккини', K.zucchini, 200), ing('Помидоры', K.tomato, 150)] },
  { ru: 'с цветной капустой',        ings: [ing('Цветная капуста', K.cauliflower, 250), ing('Морковь', K.carrot, 100)] },
  { ru: 'с тыквой и луком',          ings: [ing('Тыква', K.pumpkin, 250), ing('Лук репчатый', K.onion, 100)] },
];
for (const prot of PROTEINS.slice(0, 6)) {
  for (const v of BAKED_VEGS) {
    if (GENERATED.length >= 720) break;
    GENERATED.push({
      id: genId(),
      name: `${prot.cap} запечённая ${v.ru}`,
      descriptionRu: 'Запекание в один противень',
      prepTimeMin: 40, servings: 2,
      ingredients: [ing(prot.cap, prot.k, prot.g * 1.5), ...v.ings, ing('Оливковое масло', K.oliveOil, 10)],
      steps: [`${prot.cap} посолить и сбрызнуть маслом`, 'Овощи нарезать', 'Запекать всё при 200°C 30 мин'],
      tags: ['dinner', 'maintain', 'high-protein'],
      allergens: collectAllergens(prot),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 16. ТОСТЫ И ХЛЕБЦЫ-ПЕРЕКУСЫ (~30)
// ────────────────────────────────────────────────────────────────────────────
const TOAST_TOPPINGS: Array<{ ru: string; ings: SeedIngredient[]; allergens: string[] }> = [
  { ru: 'авокадо и яйцом',          ings: [ing('Авокадо', K.avocado, 60), egg(1)], allergens: ['eggs'] },
  { ru: 'творогом и зеленью',       ings: [ing('Творог 5%', K.curd5, 80), ing('Укроп', K.dill, 10)], allergens: ['lactose'] },
  { ru: 'хумусом и огурцом',        ings: [ing('Хумус', K.hummus, 50), ing('Огурец', K.cucumber, 60)], allergens: [] },
  { ru: 'арахисовой пастой и бананом', ings: [ing('Арахисовая паста', K.peanutButter, 20), ing('Банан', K.banana, 80)], allergens: ['nuts'] },
  { ru: 'тунцом и луком',           ings: [ing('Тунец консервированный', K.tunaCanned, 60), ing('Зелёный лук', K.greenOnion, 15)], allergens: ['fish'] },
  { ru: 'лососем и творогом',       ings: [ing('Лосось солёный', K.salmon, 50), ing('Творог 5%', K.curd5, 40)], allergens: ['fish', 'lactose'] },
  { ru: 'моцареллой и томатом',     ings: [ing('Моцарелла', K.mozzarella, 50), ing('Помидор', K.tomato, 80)], allergens: ['lactose'] },
  { ru: 'фетой и оливками',         ings: [ing('Фета', K.fetaCheese, 50), ing('Маслины', K.oliveBlack, 30)], allergens: ['lactose'] },
  { ru: 'рикоттой и мёдом',         ings: [ing('Рикотта', K.ricotta, 60), ing('Мёд', K.honey, 10)], allergens: ['lactose'] },
  { ru: 'сыром и грушей',           ings: [ing('Сыр твёрдый', K.hardCheese20, 40), ing('Груша', K.pear, 80)], allergens: ['lactose'] },
  { ru: 'арахисовой пастой и яблоком', ings: [ing('Арахисовая паста', K.peanutButter, 20), ing('Яблоко', K.apple, 80)], allergens: ['nuts'] },
  { ru: 'творогом и ягодами',       ings: [ing('Творог 5%', K.curd5, 80), ing('Ягоды mix', K.blueberry, 50)], allergens: ['lactose'] },
];
for (const top of TOAST_TOPPINGS) {
  for (const breadType of [
    { cap: 'Цельнозерновой хлеб', k: K.breadWhole, g: 50, type: 'gluten' },
    { cap: 'Хлебцы цельнозерновые', k: K.crispbread, g: 20, type: 'gluten' },
  ]) {
    GENERATED.push({
      id: genId(),
      name: `${breadType.cap.includes('Хлебцы') ? 'Хлебец' : 'Тост'} с ${top.ru}`,
      descriptionRu: 'Быстрый перекус',
      prepTimeMin: 5, servings: 1,
      ingredients: [ing(breadType.cap, breadType.k, breadType.g), ...top.ings],
      steps: [
        `${breadType.cap} подсушить в тостере или на сухой сковороде до золотистой корочки (2-3 мин)`,
        'По желанию: натереть тёплый хлебец зубчиком чеснока для аромата',
        'Сверху распределить начинку ровным слоем',
        'Посолить-поперчить по вкусу, при подаче можно сбрызнуть оливковым маслом или соком лимона',
      ],
      tags: ['snack', 'maintain'],
      allergens: [...new Set([breadType.type, ...top.allergens])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 17. ФРУКТЫ + ОРЕХИ ПЕРЕКУСЫ (~30)
// ────────────────────────────────────────────────────────────────────────────
const SNACK_FRUITS: Item[] = [
  { ru: 'яблоком',     cap: 'Яблоко',     k: K.apple,      g: 150 },
  { ru: 'грушей',      cap: 'Груша',      k: K.pear,       g: 150 },
  { ru: 'бананом',     cap: 'Банан',      k: K.banana,     g: 100 },
  { ru: 'мандарином',  cap: 'Мандарин',   k: K.orange,     g: 150 },
  { ru: 'грейпфрутом', cap: 'Грейпфрут',  k: K.grapefruit, g: 200 },
  { ru: 'киви',        cap: 'Киви',       k: K.kiwi,       g: 150 },
];
for (const fruit of SNACK_FRUITS) {
  for (const nut of NUTS.slice(0, 5)) {
    GENERATED.push({
      id: genId(),
      name: `${fruit.cap} с ${nut.ru.includes('семен') ? nut.ru : nut.cap.toLowerCase().split(' ')[0] + 'ом'}`,
      descriptionRu: 'Быстрый натуральный перекус',
      prepTimeMin: 2, servings: 1,
      ingredients: [ing(fruit.cap, fruit.k, fruit.g), ing(nut.cap, nut.k, nut.g)],
      steps: [
        `${fruit.cap} вымыть, очистить от кожуры (если нужно) и нарезать дольками`,
        `${nut.cap} можно слегка обжарить на сухой сковороде 2 мин — раскроется аромат`,
        'Выложить на тарелку или в небольшую миску для перекуса',
        'Совет: идеально съесть за 30 мин до тренировки — быстрые углеводы + энергия',
      ],
      tags: ['snack', 'maintain'],
      allergens: collectAllergens(nut),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 18. ЙОГУРТНЫЕ И ТВОРОЖНЫЕ ЧАШИ-ПЕРЕКУСЫ (~30)
// ────────────────────────────────────────────────────────────────────────────
const YOGURT_TOPPINGS: Array<{ ru: string; ings: SeedIngredient[]; allergens: string[] }> = [
  { ru: 'малиной и мёдом',          ings: [ing('Малина', K.raspberry, 80), ing('Мёд', K.honey, 8)], allergens: [] },
  { ru: 'черникой и гранолой',      ings: [ing('Черника', K.blueberry, 80), ing('Гранола', K.granolaPlain, 25)], allergens: ['gluten'] },
  { ru: 'клубникой и семенами чиа', ings: [ing('Клубника', K.strawberry, 100), ing('Семена чиа', K.chiaSeed, 8)], allergens: [] },
  { ru: 'персиком и грецким орехом', ings: [ing('Персик', K.peach, 100), ing('Грецкий орех', K.walnut, 12)], allergens: ['nuts'] },
  { ru: 'манго и кокосом',          ings: [ing('Манго', K.mango, 100), ing('Кокосовая стружка', { calories: 660, protein: 6.9, fats: 64.5, carbs: 23.7 }, 10)], allergens: [] },
  { ru: 'ягодами и миндалём',       ings: [ing('Ягоды mix', K.blueberry, 80), ing('Миндаль', K.almond, 12)], allergens: ['nuts'] },
  { ru: 'грушей и грецким орехом',  ings: [ing('Груша', K.pear, 100), ing('Грецкий орех', K.walnut, 12)], allergens: ['nuts'] },
  { ru: 'киви и семенами льна',     ings: [ing('Киви', K.kiwi, 100), ing('Льняные семена', K.flaxseed, 8)], allergens: [] },
  { ru: 'бананом и арахисовой пастой', ings: [ing('Банан', K.banana, 100), ing('Арахисовая паста', K.peanutButter, 15)], allergens: ['nuts'] },
  { ru: 'инжиром и мёдом',          ings: [ing('Финики', K.date, 30), ing('Мёд', K.honey, 8)], allergens: [] },
];
for (const top of YOGURT_TOPPINGS) {
  for (const base of [
    { cap: 'Греческий йогурт',  k: K.yogurtGreek, name: 'Греческий йогурт', tag: 'high-protein' as const },
    { cap: 'Творог обезжиренный', k: K.curd0,    name: 'Творог обезжиренный', tag: 'high-protein' as const },
    { cap: 'Творог 5%',         k: K.curd5,     name: 'Творог 5%',          tag: 'high-protein' as const },
  ]) {
    if (GENERATED.length >= 850) break;
    GENERATED.push({
      id: genId(),
      name: `${base.name} с ${top.ru}`,
      descriptionRu: 'Белковый перекус',
      prepTimeMin: 3, servings: 1,
      ingredients: [ing(base.cap, base.k, 150), ...top.ings],
      steps: [
        `${base.name} выложить в глубокую чашу (200-250 мл объёмом)`,
        'Сверху распределить начинку слоями: сначала фрукты/ягоды, затем орехи/семечки',
        'По желанию полить мёдом или сиропом топинамбура',
        'Совет: если творог суховат, добавьте 1 ст.л. греческого йогурта для кремовости',
      ],
      tags: ['snack', 'maintain', base.tag],
      allergens: [...new Set(['lactose', ...top.allergens])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 19. ЭНЕРГЕТИЧЕСКИЕ ШАРИКИ И БАТОНЧИКИ (~10)
// ────────────────────────────────────────────────────────────────────────────
const BITE_RECIPES: Array<{ name: string; desc: string; ings: SeedIngredient[]; allergens: string[] }> = [
  { name: 'Овсяные шарики с финиками и какао', desc: 'Натуральные конфеты',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 100), ing('Финики', K.date, 150), ing('Какао-порошок', K.cocoaPowder, 15)], allergens: ['gluten'] },
  { name: 'Кокосово-миндальные шарики', desc: 'Сырые конфеты',
    ings: [ing('Финики', K.date, 200), ing('Миндаль', K.almond, 80), ing('Кокосовая стружка', { calories: 660, protein: 6.9, fats: 64.5, carbs: 23.7 }, 30)], allergens: ['nuts'] },
  { name: 'Протеиновые шарики с арахисовой пастой', desc: 'Высокобелковый снек',
    ings: [ing('Сывороточный протеин', K.proteinWhey, 60), ing('Овсяные хлопья', K.oatsRaw, 80), ing('Арахисовая паста', K.peanutButter, 60)], allergens: ['lactose', 'gluten', 'nuts'] },
  { name: 'Овсяные батончики с курагой', desc: 'Здоровая альтернатива магазинным',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 150), ing('Курага', K.driedApricot, 100), ing('Мёд', K.honey, 30), ing('Грецкий орех', K.walnut, 50)], allergens: ['gluten', 'nuts'] },
  { name: 'Шарики из чернослива и грецкого ореха', desc: 'Натуральные сладости',
    ings: [ing('Чернослив', K.prune, 200), ing('Грецкий орех', K.walnut, 100), ing('Какао-порошок', K.cocoaPowder, 10)], allergens: ['nuts'] },
  { name: 'Энергетические шарики с инжиром и кешью', desc: 'Сладкий и питательный снек',
    ings: [ing('Финики', K.date, 150), ing('Кешью', K.cashew, 80), ing('Овсяные хлопья', K.oatsRaw, 50)], allergens: ['nuts', 'gluten'] },
  { name: 'Орехово-семечковые батончики', desc: 'Без сахара, с растительным белком',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 100), ing('Тыквенные семечки', K.pumpkinSeed, 50), ing('Льняные семена', K.flaxseed, 30), ing('Мёд', K.honey, 30)], allergens: ['gluten'] },
  { name: 'Шоколадные шарики с протеином', desc: 'Послетренировочные сладости',
    ings: [ing('Сывороточный протеин', K.proteinWhey, 50), ing('Финики', K.date, 100), ing('Какао-порошок', K.cocoaPowder, 15), ing('Миндаль', K.almond, 40)], allergens: ['lactose', 'nuts'] },
];
for (const b of BITE_RECIPES) {
  GENERATED.push({
    id: genId(),
    name: b.name, descriptionRu: b.desc,
    prepTimeMin: 15, servings: 4,
    ingredients: b.ings,
    steps: ['Все ингредиенты пробить блендером', 'Слепить шарики/батончики', 'Охладить 30 мин в холодильнике'],
    tags: ['snack', 'maintain'],
    allergens: b.allergens,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 20. ПЛОВ / РИС С МЯСОМ — белок × рис × специи (~15)
// ────────────────────────────────────────────────────────────────────────────
const PLOV_PROTEINS: Item[] = [
  { ru: 'курицей',  cap: 'Куриная грудка',  k: K.chickenBreast, g: 400 },
  { ru: 'индейкой', cap: 'Филе индейки',    k: K.turkeyBreast,  g: 400 },
  { ru: 'говядиной',cap: 'Говядина',        k: K.beef,          g: 400 },
];
for (const prot of PLOV_PROTEINS) {
  for (const rice of [
    { cap: 'Бурый рис варёный', k: K.brownRiceCooked, name: 'бурым рисом' },
    { cap: 'Рис варёный',       k: K.whiteRiceCooked, name: 'белым рисом' },
  ]) {
    GENERATED.push({
      id: genId(),
      name: `Плов с ${prot.ru} и ${rice.name}`,
      descriptionRu: 'Облегчённая версия плова',
      prepTimeMin: 60, servings: 4,
      ingredients: [
        ing(prot.cap, prot.k, prot.g),
        ing(rice.cap, rice.k, 400),
        ing('Морковь', K.carrot, 200),
        ing('Лук репчатый', K.onion, 150),
        ing('Чеснок', K.garlic, 10),
      ],
      steps: [`${prot.cap} нарезать, обжарить 5 мин`, 'Лук и морковь обжарить 8 мин', 'Залить водой, тушить 25 мин', 'Добавить рис, варить 20 мин'],
      tags: ['dinner', 'gain', 'high-protein'],
      allergens: collectAllergens(prot),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 21. КОТЛЕТЫ И ТЕФТЕЛИ — фарш × дополнения (~25)
// ────────────────────────────────────────────────────────────────────────────
const MINCE_PROTEINS: Item[] = [
  { ru: 'куриные',   cap: 'Фарш куриный',  k: K.chickenBreast, g: 400 },
  { ru: 'индюшиные', cap: 'Фарш индейки',  k: K.turkeyMince,   g: 400 },
  { ru: 'говяжьи',   cap: 'Фарш говяжий',  k: K.beefMince,     g: 400 },
  { ru: 'из трески', cap: 'Треска',        k: K.cod,           g: 400, allergens: ['fish'] },
];
const MINCE_VARIANTS: Array<{ ru: string; cookSteps: string[]; tags: string[] }> = [
  { ru: 'котлеты на пару',   cookSteps: ['Готовить на пару 20 мин'], tags: ['dinner', 'weight-loss', 'high-protein'] },
  { ru: 'котлеты в духовке', cookSteps: ['Запекать при 180°C 25 мин'], tags: ['dinner', 'maintain', 'high-protein'] },
  { ru: 'тефтели в томате',  cookSteps: ['Обжарить 5 мин', 'Залить томатным соусом, тушить 20 мин'], tags: ['dinner', 'maintain', 'high-protein'] },
];
for (const prot of MINCE_PROTEINS) {
  for (const variant of MINCE_VARIANTS) {
    GENERATED.push({
      id: genId(),
      name: `${prot.ru[0].toUpperCase() + prot.ru.slice(1)} ${variant.ru}`,
      descriptionRu: 'Домашние котлеты',
      prepTimeMin: 35, servings: 2,
      ingredients: [
        ing(prot.cap, prot.k, prot.g),
        ing('Лук репчатый', K.onion, 60),
        egg(1),
        ing('Овсяные хлопья', K.oatsRaw, 30),
        ...(variant.ru.includes('томат') ? [ing('Помидоры в собственном соку', K.tomatoCanned, 200)] : []),
      ],
      steps: [
        `${prot.cap} (если не фарш — измельчить в блендере или мясорубке)`,
        'Лук натереть на мелкой тёрке для сочности (не обжаривать)',
        'Смешать фарш с луком, яйцом, овсяными хлопьями, посолить-поперчить',
        'Отбить фарш о доску 10-15 раз — масса станет эластичной, котлеты не развалятся',
        'Влажными руками сформировать котлеты/тефтели нужного размера',
        ...variant.cookSteps,
      ],
      tags: variant.tags,
      allergens: [...new Set(['eggs', 'gluten', ...(prot.allergens ?? [])])],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 22. БЛИНЫ И СЫРНИКИ (~15)
// ────────────────────────────────────────────────────────────────────────────
const PANCAKE_VARIANTS: Array<{ name: string; desc: string; ings: SeedIngredient[]; allergens: string[]; tags: string[] }> = [
  { name: 'Овсяные блины с творогом', desc: 'ПП-блины без муки',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 60), egg(2), ing('Молоко 2.5%', K.milkLow, 150), ing('Творог 5%', K.curd5, 100)],
    allergens: ['gluten', 'eggs', 'lactose'], tags: ['breakfast', 'maintain', 'high-protein'] },
  { name: 'Овсяные блины с яблоком', desc: 'Сладкие блины без сахара',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 60), egg(2), ing('Молоко 2.5%', K.milkLow, 150), ing('Яблоко', K.apple, 100)],
    allergens: ['gluten', 'eggs', 'lactose'], tags: ['breakfast', 'maintain'] },
  { name: 'Овсяные блины с бананом', desc: 'Натурально-сладкие блины',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 60), egg(2), ing('Банан', K.banana, 120)],
    allergens: ['gluten', 'eggs'], tags: ['breakfast', 'maintain'] },
  { name: 'Сырники классические', desc: 'Творожные сырники в духовке',
    ings: [ing('Творог 5%', K.curd5, 300), egg(2), ing('Овсяные хлопья', K.oatsRaw, 50)],
    allergens: ['lactose', 'eggs', 'gluten'], tags: ['breakfast', 'maintain', 'high-protein'] },
  { name: 'Сырники с изюмом', desc: 'Сладкие сырники',
    ings: [ing('Творог 5%', K.curd5, 300), egg(2), ing('Овсяные хлопья', K.oatsRaw, 50), ing('Изюм', K.raisin, 30)],
    allergens: ['lactose', 'eggs', 'gluten'], tags: ['breakfast', 'maintain', 'high-protein'] },
  { name: 'Сырники с ягодами', desc: 'Сырники со свежими ягодами',
    ings: [ing('Творог 5%', K.curd5, 300), egg(2), ing('Овсяные хлопья', K.oatsRaw, 50), ing('Малина', K.raspberry, 80)],
    allergens: ['lactose', 'eggs', 'gluten'], tags: ['breakfast', 'maintain', 'high-protein'] },
  { name: 'Творожная запеканка с яблоком', desc: 'Запеканка для всей семьи',
    ings: [ing('Творог 5%', K.curd5, 500), egg(3), ing('Манная крупа', K.pastaReg, 40), ing('Яблоко', K.apple, 150)],
    allergens: ['lactose', 'eggs', 'gluten'], tags: ['breakfast', 'maintain', 'high-protein'] },
  { name: 'Протеиновые блины', desc: 'Высокобелковые блины',
    ings: [ing('Овсяные хлопья', K.oatsRaw, 60), egg(2), ing('Сывороточный протеин', K.proteinWhey, 30), ing('Молоко 2.5%', K.milkLow, 150)],
    allergens: ['gluten', 'eggs', 'lactose'], tags: ['breakfast', 'gain', 'high-protein'] },
];
for (const p of PANCAKE_VARIANTS) {
  GENERATED.push({
    id: genId(),
    name: p.name, descriptionRu: p.desc,
    prepTimeMin: 25, servings: 2,
    ingredients: p.ings,
    steps: ['Хлопья измельчить', 'Смешать с остальными ингредиентами', 'Жарить блины/сырники на сухой сковороде по 3 мин с каждой стороны'],
    tags: p.tags, allergens: p.allergens,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 23. ХУМУС-ВАРИАЦИИ И ОВОЩНЫЕ ПЕРЕКУСЫ (~10)
// ────────────────────────────────────────────────────────────────────────────
const HUMMUS_VARIANTS: Array<{ name: string; desc: string; ings: SeedIngredient[] }> = [
  { name: 'Классический хумус с морковью и огурцом', desc: 'Растительный белок и клетчатка',
    ings: [ing('Хумус', K.hummus, 100), ing('Морковь', K.carrot, 100), ing('Огурец', K.cucumber, 100)] },
  { name: 'Свекольный хумус с овощными палочками', desc: 'Розовый хумус с пользой свёклы',
    ings: [ing('Нут варёный', K.chickpeasCooked, 200), ing('Свёкла варёная', K.beetroot, 100), ing('Морковь', K.carrot, 100), ing('Болгарский перец', K.bellPepper, 80)] },
  { name: 'Тыквенный хумус с овощами', desc: 'Сезонный осенний хумус',
    ings: [ing('Нут варёный', K.chickpeasCooked, 200), ing('Тыква запечённая', K.pumpkin, 150), ing('Огурец', K.cucumber, 100)] },
  { name: 'Авокадо-крем с овощами', desc: 'Жирный белковый дип',
    ings: [ing('Авокадо', K.avocado, 150), ing('Творог 5%', K.curd5, 80), ing('Морковь', K.carrot, 100), ing('Сельдерей', { calories: 16, protein: 0.7, fats: 0.2, carbs: 3 }, 80)] },
  { name: 'Гуакамоле с морковью', desc: 'Мексиканский авокадо-дип',
    ings: [ing('Авокадо', K.avocado, 200), ing('Помидоры', K.tomato, 80), ing('Лук репчатый', K.onion, 30), ing('Морковь', K.carrot, 150)] },
  { name: 'Творожный дип с зеленью', desc: 'Низкокалорийный дип',
    ings: [ing('Творог обезжиренный', K.curd0, 200), ing('Укроп', K.dill, 15), ing('Огурец', K.cucumber, 100), ing('Болгарский перец', K.bellPepper, 80)] },
];
for (const h of HUMMUS_VARIANTS) {
  GENERATED.push({
    id: genId(),
    name: h.name, descriptionRu: h.desc,
    prepTimeMin: 10, servings: 2,
    ingredients: h.ings,
    steps: ['Нут/творог пробить блендером с лимоном и оливковым маслом', 'Овощи нарезать палочками', 'Подать вместе'],
    tags: ['snack', 'weight-loss'],
    allergens: h.name.includes('Творож') || h.name.includes('Авокадо-крем') ? ['lactose'] : [],
  });
}

// Combined list — hand-curated 180 + ~820 generated combinations
const ALL_RECIPES: SeedRecipe[] = [...RECIPES, ...GENERATED];

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
  for (const r of ALL_RECIPES) {
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
  console.log(`[seed-recipes] ${created} created, ${updated} updated, ${ALL_RECIPES.length} total`);
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
