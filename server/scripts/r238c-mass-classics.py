"""Round-238c: add 8 hand-written muscle-gain classics not covered by
combinatorial generators. Each is calorie-dense (≥600 kcal/serving),
protein-rich (≥30g), with detailed step explanations matching the
r238b quality standard.

Inserted before the closing `];` of the hand-written RECIPES array,
inheriting `crecipe000000000r238mass01..08` stable IDs so re-runs are
idempotent (upsert in seed.ts).
"""
from __future__ import annotations
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

NEW_RECIPES = """  // ─── ROUND 238c — muscle-gain classics not covered by generators ───────────
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
"""


def main() -> None:
    path = 'prisma/seed-recipes.ts'
    with open(path, encoding='utf-8') as f:
        src = f.read()

    # Insert before the first `];` (closing RECIPES array)
    close = re.search(r'\n\];\n', src)
    if close is None:
        raise SystemExit("array close `];` not found")
    new_src = src[: close.start() + 1] + NEW_RECIPES + src[close.start() + 1 :]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_src)

    m = re.search(r'const RECIPES: SeedRecipe\[\] = \[(.+?)\n\];\n', new_src, re.DOTALL)
    assert m
    ids = re.findall(r"id:\s+'(crecipe[a-z0-9]+)'", m.group(1))
    print(f'Total hand-written after insert: {len(ids)}')
    gain = [n for n in re.findall(r"name:\s*'([^']+)',[\s\S]*?tags:\s*\[[^\]]*'gain'", m.group(1))]
    print(f'Hand-written with gain tag: {len(gain)}')


if __name__ == '__main__':
    main()
