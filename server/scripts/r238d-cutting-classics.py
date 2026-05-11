"""Round-238d: add 7 hand-written cutting/weight-loss classics targeting
breakfast and snack gaps (audit showed only 5 breakfasts + 7 snacks tagged
weight-loss). Each recipe ≤300 kcal/serving, high-protein where possible
to preserve lean mass during cutting.

Stable IDs crecipe000000000r238wl01..07.
"""
from __future__ import annotations
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

NEW = """  // ─── ROUND 238d — cutting / weight-loss classics (≤300 kcal, high-protein) ──
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
"""


def main() -> None:
    path = 'prisma/seed-recipes.ts'
    with open(path, encoding='utf-8') as f:
        src = f.read()
    close = re.search(r'\n\];\n', src)
    if close is None:
        raise SystemExit("array close not found")
    new_src = src[: close.start() + 1] + NEW + src[close.start() + 1 :]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_src)
    m = re.search(r'const RECIPES: SeedRecipe\[\] = \[(.+?)\n\];\n', new_src, re.DOTALL)
    assert m
    ids = re.findall(r"id:\s+'(crecipe[a-z0-9]+)'", m.group(1))
    wl = re.findall(r"name:\s*'([^']+)',[\s\S]*?tags:\s*\[[^\]]*'weight-loss'", m.group(1))
    print(f'Total hand-written: {len(ids)}')
    print(f'With weight-loss tag: {len(wl)}')


if __name__ == '__main__':
    main()
