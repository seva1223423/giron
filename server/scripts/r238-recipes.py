"""Round-238 recipe re-apply: cull 40 + add 6 popular ПП-classics."""
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

DELETE_NAMES = {
    'Овсянка с грушей и мёдом', 'Овсянка на овсяном молоке с черникой',
    'Овсянка с малиной и грецким орехом', 'Овсянка с какао и бананом',
    'Овсянка с арахисовой пастой и бананом', 'Овсянка с тыквой и корицей',
    'Овсянка с манго и кокосом', 'Овсянка с финиками и миндалём',
    'Овсянка с черносливом и грецким орехом', 'Овсянка с курагой и мёдом',
    'Овсянка с яблоком и грецкими орехами', 'Овсянка с изюмом и корицей',
    'Творог с грушей и грецким орехом', 'Творожная масса с какао',
    'Творог с черникой и семенами чиа', 'Творожная запеканка без муки',
    'Протеиновый смузи без молока', 'Смузи с бананом и арахисовой пастой',
    'Зелёный смузи со шпинатом и яблоком', 'Ягодный смузи с греческим йогуртом',
    'Смузи с манго и кокосовым молоком', 'Протеиновый смузи с какао и бананом',
    'Смузи с клубникой и овсянкой', 'Шейк протеиновый ванильный',
    'Шейк протеиновый шоколадный', 'Шейк с бананом и арахисовой пастой',
    'Овсяно-финиковые шарики', 'Орехово-кокосовые шарики',
    'Фруктовые шарики с финиками', 'Грейпфрут с миндалём',
    'Груша с грецким орехом', 'Апельсин с тыквенными семечками',
    'Киви с миндалём', 'Свекольный хумус с морковью',
    'Тыквенный хумус с огурцом',
    'Творог с грецким орехом и грушей', 'Творог с авокадо и зеленью',
    'Табуле с булгуром', 'Боул с фалафелем и нутом',
}
DELETE_IDS = {'crecipe00000000snack005'}

NEW = '''  // ─── ROUND 238 — popular ПП-classics NOT covered by combinatorial generators ──
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
'''


def main() -> None:
    path = 'prisma/seed-recipes.ts'
    with open(path, encoding='utf-8') as f:
        src = f.read()

    block_re = re.compile(
        r"  \{\s*\n    id:\s*'(crecipe[a-z0-9]+)',\s*name:\s*'([^']+)',[\s\S]*?\n  \},\n",
    )
    matches = list(block_re.finditer(src))
    deletions = []
    for m in matches:
        rid, name = m.group(1), m.group(2)
        if name in DELETE_NAMES or rid in DELETE_IDS:
            deletions.append((m.start(), m.end()))
    print(f'pre={len(matches)} delete={len(deletions)}')

    for start, end in sorted(deletions, key=lambda x: x[0], reverse=True):
        src = src[:start] + src[end:]

    close = re.search(r'\n\];\n', src)
    assert close is not None
    src = src[: close.start() + 1] + NEW + src[close.start() + 1 :]

    src = src.replace('180 hand-balanced', '146 hand-balanced')
    src = src.replace('140 hand-balanced', '146 hand-balanced')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)

    final = re.search(r'const RECIPES: SeedRecipe\[\] = \[(.+?)\n\];\n', src, re.DOTALL)
    assert final is not None
    ids = re.findall(r"id:\s+'(crecipe[a-z0-9]+)'", final.group(1))
    print(f'final={len(ids)} unique={len(set(ids))}')


if __name__ == '__main__':
    main()
