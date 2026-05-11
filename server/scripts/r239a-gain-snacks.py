"""Round-239a: close the gain × snack gap (currently 4, target ≥7).
Adds 4 mass-snack classics not covered by generators. Stable IDs
crecipe000000000r239gs01..04.
"""
from __future__ import annotations
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

NEW = """  // ─── ROUND 239a — gain × snack cell expansion (4 → 8) ─────────────────────
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
    # Count gain-snacks
    gain_snack = 0
    for blk in re.finditer(r"\{[\s\S]*?tags:\s*\[([^\]]+)\][\s\S]*?\}", m.group(1)):
        tags = blk.group(1)
        if "'gain'" in tags and "'snack'" in tags:
            gain_snack += 1
    print(f'Total hand-written: {len(ids)}')
    print(f'gain × snack: {gain_snack}')


if __name__ == '__main__':
    main()
