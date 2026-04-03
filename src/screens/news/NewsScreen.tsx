import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NewsArticle, NewsCategory } from '../../types';
import { newsService, getApiError } from '../../services';

const CATEGORIES: { key: NewsCategory | 'all' | 'saved'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'saved', label: '🔖 Сохранённые' },
  { key: 'russian', label: 'Россия' },
  { key: 'powerlifting', label: 'Силовые' },
  { key: 'records', label: 'Рекорды' },
  { key: 'championships', label: 'Чемпионаты' },
  { key: 'club', label: 'Клуб' },
];

// Fallback data when server is unavailable
const FALLBACK_NEWS: NewsArticle[] = [
  {
    id: '1',
    title: 'Юрий Белкин установил новый мировой рекорд в становой тяге',
    summary: 'На чемпионате WRPF Юрий Белкин поднял 440 кг в категории до 110 кг, побив свой прежний рекорд. Выступление прошло в Москве при полных трибунах.',
    content: 'На прошедшем в Москве чемпионате WRPF Юрий Белкин совершил то, что многие считали невозможным — поднял 440 кг в становой тяге в весовой категории до 110 кг.\n\nПопытка прошла безупречно: Белкин уверенно зафиксировал штангу и получил три белых флага от судей. Предыдущий мировой рекорд составлял 432.5 кг и принадлежал ему же.\n\n«Я готовился к этому подъёму шесть месяцев. Программа была полностью перестроена под этот рекорд», — сказал атлет после взвешивания.\n\nЗал встретил рекорд стоячими овациями. Белкин — один из лучших пауэрлифтеров России, неоднократный чемпион WRPF и абсолютный рекордсмен страны в становой тяге.',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-30T10:00:00Z',
    isSaved: false,
  },
  {
    id: '2',
    title: 'Рекорд дня: Жим лёжа 200 кг в категории 82.5 кг',
    summary: 'Российский атлет Дмитрий Иноземцев выжал 200 кг на соревнованиях IPF в Москве. Результат засчитан с тремя белыми флагами.',
    content: 'На открытых соревнованиях IPF в Москве Дмитрий Иноземцев установил новый рекорд России в жиме лёжа в весовой категории 82.5 кг — 200 кг.\n\nЭто знаковое достижение: двести килограммов в относительно лёгкой весовой категории — результат, который доступен единицам в мире. Иноземцев шёл к этой отметке три года.\n\nСтарт был заявлен с 190 кг (первый подход), затем 197.5 кг (второй подход) и финальные 200 кг. Все три подхода засчитаны чисто.\n\n«Тренировал жим по методу Шейко последние два года. Результаты говорят сами за себя», — рассказал атлет в интервью после турнира.',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-29T14:00:00Z',
    isSaved: false,
  },
  {
    id: '3',
    title: 'Чемпионат России по пауэрлифтингу 2026: итоги',
    summary: 'Подводим итоги главного национального турнира — 12 новых рекордов страны, 8 регионов-призёров, более 300 участников из 62 городов.',
    content: 'Чемпионат России по пауэрлифтингу 2026 прошёл в Москве и собрал рекордные 312 участников из 62 городов страны. По итогам турнира обновлено 12 рекордов страны.\n\n🏆 Главные результаты:\n\n— Антон Плесецкий (93 кг): сумма 820 кг без экипировки — новый рекорд России\n— Виктория Соловьёва (63 кг): жим лёжа 122.5 кг — рекорд страны среди женщин\n— Алексей Громов (120+ кг): становая тяга 382.5 кг\n\n🥇 Командный зачёт:\n1. Москва\n2. Санкт-Петербург\n3. Свердловская область\n\nСледующий крупный старт — Кубок России, сентябрь 2026.',
    category: ['russian', 'championships', 'powerlifting'],
    publishedAt: '2026-03-28T09:00:00Z',
    isSaved: false,
  },
  {
    id: '4',
    title: '5 научно обоснованных способов ускорить восстановление',
    summary: 'Разбираем методы восстановления, подтверждённые исследованиями: сон, питание, активное восстановление, ледяные ванны и правильная разминка.',
    content: 'Восстановление — такая же часть тренировочного процесса, как и сами тренировки. Разбираем пять методов с доказанной эффективностью.\n\n1️⃣ Сон (самый важный)\nИсследования показывают, что 8–9 часов сна дают на 20–30% лучший синтез белка по сравнению с 6-часовым сном. Приоритет — стабильный режим.\n\n2️⃣ Белок сразу после тренировки\nАнаболическое окно — не миф. 30–40 г белка в течение 30 минут после тренировки ускоряют восстановление мышечных волокон.\n\n3️⃣ Активное восстановление\n20 минут лёгкого кардио или растяжки на следующий день улучшают кровоток и выводят продукты распада из мышц.\n\n4️⃣ Контрастный душ\nЧередование горячей и холодной воды (3 цикла × 30/30 сек) снижает воспаление и DOMS.\n\n5️⃣ Магний перед сном\n300–400 мг магния цитрата улучшают качество сна и снижают мышечные судороги.',
    category: ['russian'],
    publishedAt: '2026-03-27T12:00:00Z',
    isSaved: false,
  },
  {
    id: '5',
    title: 'Как правильно делать присед: разбор техники',
    summary: 'Детальный разбор биомеханики приседа со штангой от тренера сборной России по пауэрлифтингу. Частые ошибки и способы их устранить.',
    content: 'Присед — фундаментальное силовое упражнение. Неправильная техника ведёт к травмам и снижению результатов. Разбираем ключевые точки.\n\n📍 Стартовое положение\n— Штанга лежит на верхней части трапеции (низкое положение) или на дельтах (высокое)\n— Ноги на ширине плеч или чуть шире, носки развёрнуты 25–35°\n— Хват широкий, локти направлены вниз-назад\n\n📍 Фаза опускания\n— Движение начинается с отведения таза назад и вниз\n— Колени движутся в сторону носков (не внутрь!)\n— Спина сохраняет нейтральное положение\n— Глубина — бёдра параллельно полу или ниже\n\n📍 Фаза подъёма\n— Отталкивайтесь пятками\n— Таз и плечи поднимаются одновременно\n— Не теряйте грудь вперёд при подъёме\n\n❌ Частые ошибки: «пещера» в пояснице, отрыв пяток, падение коленей внутрь, наклон корпуса вперёд.',
    category: ['powerlifting'],
    publishedAt: '2026-03-26T08:00:00Z',
    isSaved: false,
  },
  {
    id: '6',
    title: 'Клубный рекорд побит: присед 250 кг в Iron Gym',
    summary: 'Алексей Громов из нашего клуба установил новый рекорд зала — 250 кг в приседе без снаряжения! Поздравляем чемпиона.',
    content: 'Вчера вечером в Iron Gym произошло событие, которое войдёт в историю клуба: Алексей Громов выполнил присед со штангой весом 250 кг без снаряжения, установив новый абсолютный рекорд зала.\n\nАлексей тренируется в Iron Gym уже 4 года. Всё это время он последовательно наращивал силовые показатели, работая по программе 5/3/1 с элементами конъюгированной методики.\n\n«Я целился на 240, а 250 — это был подарок. Разминка прошла идеально, тело само попросило ещё. Взял и не пожалел», — рассказал Алексей после подъёма.\n\nЗал встретил рекорд аплодисментами. Предыдущий рекорд клуба в приседе составлял 237 кг и держался больше двух лет.\n\n🏆 Рекорды зала Iron Gym (без снаряжения):\n— Присед: 250 кг (Алексей Громов)\n— Жим лёжа: 180 кг\n— Становая тяга: 270 кг\n\nПоздравляем Алексея с великолепным результатом! Продолжай в том же духе.',
    category: ['club', 'records'],
    publishedAt: '2026-03-31T18:00:00Z',
    isSaved: false,
  },
  {
    id: '7',
    title: 'Открытый Кубок Москвы по жиму лёжа: результаты',
    summary: 'В Москве прошёл Открытый кубок по жиму лёжа среди любителей. Победитель в абсолюте — Сергей Воронов с результатом 182.5 кг.',
    content: 'В минувшие выходные в Москве состоялся Открытый кубок столицы по жиму лёжа среди атлетов-любителей. В соревнованиях приняли участие 84 спортсмена из 12 регионов.\n\n🥇 Победители по весовым категориям:\n— до 66 кг: Илья Петров — 137.5 кг\n— до 74 кг: Максим Ульянов — 152.5 кг\n— до 83 кг: Евгений Маслов — 167.5 кг\n— до 93 кг: Сергей Воронов — 182.5 кг\n— до 105 кг: Владислав Корнеев — 195 кг\n— свыше 105 кг: Артём Белов — 215 кг\n\n🏆 Победитель в абсолютном зачёте — Сергей Воронов (182.5 кг при собственном весе 91 кг).\n\nСергей — участник нашего клуба Iron Gym. Поздравляем его с победой!\n\nВсе результаты засчитаны IPF, лучшие атлеты получили приглашения на Чемпионат России среди любителей в июне.',
    category: ['russian', 'championships'],
    publishedAt: '2026-03-25T15:00:00Z',
    isSaved: false,
  },
  {
    id: '8',
    title: 'Разбор: периодизация нагрузки для силового атлета',
    summary: 'Линейная, волнообразная, блочная — разбираем три подхода к периодизации и объясняем, какой выбрать в зависимости от уровня и целей.',
    content: 'Периодизация — это плановое изменение нагрузки, интенсивности и объёма тренировок во времени. Без неё прогресс рано или поздно останавливается.\n\n📊 Линейная периодизация\nКаждую неделю нагрузка плавно растёт: начинаем с большого объёма и малым весом, заканчиваем малым объёмом и большим весом. Идеально для новичков — прогресс предсказуем и прост.\n\n📊 Волнообразная периодизация\nНагрузка меняется внутри недели: понедельник — тяжёлый день, среда — средний, пятница — лёгкий. Или нелинейно: каждый микроцикл отличается от предыдущего. Подходит опытным атлетам — тело не адаптируется к одному стимулу.\n\n📊 Блочная периодизация\nТренировочный цикл делится на блоки: накопление (объём), трансформация (интенсивность), реализация (соревновательные веса). Оптимальна для пауэрлифтеров с конкретной датой старта.\n\n💡 Рекомендация: новичкам — линейная, атлетам со стажем 1–2 года — волнообразная, спортсменам с целевым стартом — блочная.',
    category: ['powerlifting'],
    publishedAt: '2026-03-24T11:00:00Z',
    isSaved: false,
  },
  {
    id: '9',
    title: 'Кирилл Сарычев: «Генетика важна, но без труда она ничто»',
    summary: 'Интервью с обладателем мирового рекорда по жиму лёжа. О подготовке, диете, травмах и планах на 2026 год.',
    content: 'Кирилл Сарычев — обладатель абсолютного мирового рекорда в жиме лёжа в экипировке: 335 кг. Мы поговорили с ним о том, как он пришёл к этому результату и что ждёт впереди.\n\n— Кирилл, многие говорят, что у тебя уникальная генетика. Согласен?\n— Да, генетика важна. Но я знаю десятки людей с отличными данными, которые так и остались середнячками. Без системного труда, правильного питания и умной восстановки ничего не выйдет. Я посвятил жиму лёжа 12 лет жизни.\n\n— Как строится твоя подготовка?\n— Основа — волнообразная периодизация. Три цикла в год: накопление объёма, работа на интенсивность, выход на пик перед стартом. В межсезонье жму 4 раза в неделю, перед стартом — 2–3.\n\n— Питание?\n— Без профицита не растёшь. В период набора я ем 4500–5000 ккал в день, 250–280 г белка. Никаких чудодейственных добавок — только базовые: протеин, креатин, рыбий жир.\n\n— Планы на 2026?\n— Хочу выступить на чемпионате WRPF в Москве. Целюсь на 340 кг. Если спина позволит — попробуем.',
    category: ['russian', 'records'],
    publishedAt: '2026-03-23T09:30:00Z',
    isSaved: false,
  },
  {
    id: '10',
    title: 'Первенство России среди молодёжи: новые имена пауэрлифтинга',
    summary: 'На Первенстве России 2026 сразу 5 молодых атлетов выполнили норматив мастера спорта. Рассказываем о самых ярких выступлениях.',
    content: 'Первенство России по пауэрлифтингу среди молодёжи (до 23 лет) прошло в Екатеринбурге. 156 участников из 38 регионов — рекордное количество за всю историю турнира.\n\n⭐ Самые яркие результаты:\n\nДарья Сомова (59 кг, Москва) — сумма 450 кг, новый юниорский рекорд страны. 21 год, тренируется с 16 лет.\n\nПавел Трубников (83 кг, СПб) — сумма 672.5 кг, выполнил норматив МС с первой попытки. Специализируется на становой тяге (260 кг при весе 82 кг).\n\nАлина Фёдорова (52 кг, Казань) — три личных рекорда за один день: присед 130 кг, жим 82.5 кг, тяга 155 кг.\n\n📊 Итого выполнили норматив МС: 5 атлетов.\n\nРуководство ФПРС отметило высокий уровень технической подготовки молодых спортсменов. Многие из них уже получили приглашения в сборную страны.\n\nСледующий турнир для молодёжи — Кубок России, август 2026.',
    category: ['russian', 'championships', 'powerlifting'],
    publishedAt: '2026-03-22T14:00:00Z',
    isSaved: false,
  },
  {
    id: '11',
    title: 'Топ-10 упражнений для развития взрывной силы',
    summary: 'Тренеры ФПРС составили список упражнений для развития взрывной мощи — незаменимы для пауэрлифтеров и спринтеров.',
    content: 'Взрывная сила — способность развить максимальное усилие за минимальное время. Её развитие критично для пауэрлифтеров, тяжелоатлетов и спринтеров. Методисты ФПРС составили топ-10 упражнений.\n\n1️⃣ Рывок гири (16–32 кг) — учит взрывному разгону бёдер и плеч\n\n2️⃣ Прыжок в длину с места — базовое плиометрическое движение без инвентаря\n\n3️⃣ Прыжок на ящик (Box Jump) — высота 50–80 см, максимальное усилие на отталкивание\n\n4️⃣ Взрывное отжимание с хлопком — плиометрика для верхней части тела\n\n5️⃣ Тяга с плит (мёртвая точка) — снимает инерцию и учит «взрываться» из нижней позиции\n\n6️⃣ Жим с досок (Board Press) — развивает взрывное усилие в верхней фазе жима\n\n7️⃣ Спринт 30–40 м × 6–8 повторений — прямая работа над взрывными мышечными волокнами\n\n8️⃣ Толчок медбола об стену (3–5 кг) — быстрые ротационные движения\n\n9️⃣ Присед на максимальной скорости с 50–60% от 1ПМ — тренирует ускорение снаряда\n\n🔟 Дроп-прыжки (Depth Jump) — самый мощный плиометрический инструмент, только для подготовленных атлетов\n\n💡 Рекомендация: 2–3 взрывных упражнения в конце разминки или начале силовой тренировки. 3–5 подходов × 3–6 повторений. Отдых 2–3 минуты.',
    category: ['russian', 'powerlifting'],
    publishedAt: '2026-03-21T10:00:00Z',
    isSaved: false,
  },
  {
    id: '12',
    title: 'Клуб Iron Gym проводит открытую тренировку в эти выходные',
    summary: 'Приглашаем всех желающих на открытую тренировку с тренерами клуба. Без ограничений по уровню подготовки. Суббота, 10:00.',
    content: 'Iron Gym открывает двери для всех желающих!\n\n📅 Дата: суббота, 10:00\n📍 Место: Iron Gym, основной зал\n\nПрограмма дня:\n— 10:00–10:30: Разминка и инструктаж\n— 10:30–12:00: Открытая тренировка под руководством тренеров клуба\n— 12:00–12:30: Разбор техники базовых упражнений (присед, жим, тяга)\n— 12:30–13:00: Вопросы и ответы, мастер-класс по правильному питанию\n\n👥 Для кого:\nМероприятие открыто для всех — от новичков до опытных атлетов. Если ты только думаешь о тренажёрном зале или хочешь сменить клуб — это отличная возможность познакомиться с командой Iron Gym.\n\n✅ Что взять с собой:\n— Спортивную форму и кроссовки\n— Бутылку воды\n— Хорошее настроение 😄\n\nМероприятие бесплатное. Количество мест ограничено — записывайтесь через приложение.',
    category: ['club'],
    publishedAt: '2026-03-20T08:00:00Z',
    isSaved: false,
  },
  {
    id: '13',
    title: 'Рекорд России в троеборье без снаряжения обновлён',
    summary: 'Антон Плесецкий набрал сумму 850 кг в категории 93 кг, превысив прежний рекорд страны на 7.5 кг. Выступление прошло в Санкт-Петербурге.',
    content: 'На чемпионате Северо-Западного федерального округа по пауэрлифтингу в Санкт-Петербурге Антон Плесецкий установил новый рекорд России в троеборье без снаряжения в категории 93 кг.\n\n📊 Результаты подходов Антона:\n\nПрисед:\n— 1-й: 285 кг ✅\n— 2-й: 295 кг ✅\n— 3-й: 302.5 кг ✅ (личный рекорд)\n\nЖим лёжа:\n— 1-й: 195 кг ✅\n— 2-й: 202.5 кг ✅\n— 3-й: 210 кг ❌\n\nСтановая тяга:\n— 1-й: 315 кг ✅\n— 2-й: 325 кг ✅\n— 3-й: 337.5 кг ✅ (личный рекорд)\n\nИтоговая сумма: 302.5 + 202.5 + 345 = 850 кг. Прежний рекорд России составлял 842.5 кг.\n\nАнтон Плесецкий — мастер спорта международного класса, тренируется в Москве. По словам спортсмена, следующая цель — сумма 870 кг на Чемпионате России.',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-19T16:00:00Z',
    isSaved: false,
  },
  {
    id: '14',
    title: 'Питание для силовых тренировок: белок, углеводы и жиры',
    summary: 'Спортивный нутрициолог сборной России рассказывает, как правильно рассчитать КБЖУ для набора силы без лишнего жира.',
    content: 'Правильное питание — половина успеха в силовом спорте. Рассказывает Ирина Кравцова, нутрициолог сборной России по пауэрлифтингу.\n\n🥩 Белок — приоритет №1\nДля силового атлета норма — 1.8–2.2 г на кг веса тела. Меньше 1.6 г/кг — и вы недовосстанавливаетесь. Лучшие источники: куриная грудка, яйца, творог 0–5%, рыба (минтай, тунец, лосось), говядина.\n\nЕсли сложно набрать норму из еды — добавьте сывороточный протеин. 30–40 г после тренировки достаточно.\n\n🍚 Углеводы — топливо для тренировки\nВ дни тренировок нужно 4–6 г углеводов на кг. За 2 часа до тренировки — медленные углеводы (гречка, овсянка, рис). Сразу после — можно быстрые (банан, рисовые галеты).\n\n🥑 Жиры — не враги\nМинимум 0.8–1 г жиров на кг. Жиры нужны для гормонального здоровья. Источники: рыбий жир, оливковое масло, орехи, авокадо.\n\n📊 Пример рациона на 80 кг при наборе:\n— Калории: ~3200 ккал\n— Белок: 176 г (22%)\n— Жиры: 80 г (22%)\n— Углеводы: 450 г (56%)\n\n💡 Главный совет: взвешивайте продукты и ведите дневник питания хотя бы 4 недели. Большинство атлетов сильно ошибаются в оценке своего рациона "на глаз".',
    category: ['russian'],
    publishedAt: '2026-03-18T12:00:00Z',
    isSaved: false,
  },
  {
    id: '15',
    title: 'Новый рекорд зала по становой тяге — 270 кг',
    summary: 'Максим Коваль из Iron Gym установил рекорд клуба в становой тяге — 270 кг. Великолепное достижение после 3 лет тренировок!',
    content: 'Ещё один клубный рекорд пал в Iron Gym! На этот раз в становой тяге: Максим Коваль поднял 270 кг, побив прежний рекорд зала (265 кг, державшийся 8 месяцев).\n\nМаксим занимается в Iron Gym три года. Начинал с 60-килограммовой тяги — прогресс за это время составил 210 кг.\n\n«Первый год я вообще не понимал технику. Потом начал работать с тренером, разобрал технику с нуля. Это изменило всё», — рассказал Максим.\n\nЕго программа на последний год:\n— 3 тренировки в неделю\n— Тяга по методу Эдди Холла: волнообразная нагрузка, акцент на слабых звеньях\n— Дополнительно: тяга Румынская, гиперэкстензии, тяга в блоке сидя\n\n🏆 Актуальные рекорды зала Iron Gym (без снаряжения):\n— Присед: 250 кг (Алексей Громов)\n— Жим лёжа: 180 кг\n— Становая тяга: 270 кг (Максим Коваль) 🆕\n\nПоздравляем Максима — это заслуженный результат упорного труда!',
    category: ['club', 'records'],
    publishedAt: '2026-03-17T19:00:00Z',
    isSaved: false,
  },
];

export const NewsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all' | 'saved'>('all');
  const [news, setNews] = useState<NewsArticle[]>(FALLBACK_NEWS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      const category = activeCategory === 'all' || activeCategory === 'saved' ? undefined : activeCategory;
      const articles = await newsService.getNews({ category });
      if (articles.length > 0) {
        setNews(articles);
      }
      // Load saved articles
      try {
        const saved = await newsService.getSaved();
        setSavedIds(new Set(saved.map((a) => a.id)));
      } catch {}
    } catch {
      // Keep fallback data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNews();
  };

  const onFetchFreshNews = async () => {
    setRefreshing(true);
    try {
      await newsService.triggerRefresh();
    } catch {
      // ignore — server will have tried its best
    }
    await fetchNews();
  };

  const filteredNews = activeCategory === 'all'
    ? news
    : activeCategory === 'saved'
      ? news.filter((n) => savedIds.has(n.id))
      : news.filter((n) => n.category?.includes(activeCategory as NewsCategory));

  const toggleSave = async (id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await newsService.toggleSave(id);
    } catch {
      // Revert on error
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const formatDateFull = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleArticlePress = (article: NewsArticle) => {
    Haptics.selectionAsync();
    setSelectedArticle(article);
  };

  const handleShareArticle = async (article: NewsArticle) => {
    try {
      await Share.share({
        message: `${article.title}\n\n${article.summary}\n\nIron Gym — лучшее фитнес-приложение для зала`,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Новости</Text>
        <TouchableOpacity onPress={onFetchFreshNews} disabled={refreshing}>
          <Text style={[typography.small, { color: refreshing ? colors.textTertiary : colors.primary }]}>
            {refreshing ? 'Обновление...' : '↻ Обновить'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            onPress={() => setActiveCategory(cat.key)}
            style={[
              styles.categoryChip,
              {
                backgroundColor: activeCategory === cat.key ? colors.primary : colors.surface,
                borderColor: activeCategory === cat.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                typography.smallMedium,
                { color: activeCategory === cat.key ? '#FFF' : colors.text },
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Article Detail Modal */}
      <Modal
        visible={selectedArticle !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedArticle(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <TouchableOpacity onPress={() => setSelectedArticle(null)}>
                <Text style={[typography.body, { color: colors.primary }]}>✕ Закрыть</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => selectedArticle && toggleSave(selectedArticle.id)}>
                  <Text style={{ fontSize: 22 }}>
                    {selectedArticle && savedIds.has(selectedArticle.id) ? '🔖' : '📌'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectedArticle && handleShareArticle(selectedArticle)}>
                  <Text style={[typography.body, { color: colors.primary }]}>Поделиться</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Category tags */}
              {selectedArticle && (
                <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.sm }}>
                  {(selectedArticle.category || []).map((cat) => (
                    <View key={cat} style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[typography.caption, { color: colors.primary }]}>
                        {CATEGORIES.find((c) => c.key === cat)?.label || cat}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Title */}
              <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>
                {selectedArticle?.title}
              </Text>

              {/* Date */}
              <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.lg }]}>
                {selectedArticle ? formatDateFull(selectedArticle.publishedAt) : ''}
              </Text>

              {/* Summary */}
              <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 22 }]}>
                {selectedArticle?.summary}
              </Text>

              {/* Full content */}
              {selectedArticle?.content ? (
                <Text style={[typography.body, { color: colors.text, lineHeight: 24, marginBottom: spacing.xl }]}>
                  {selectedArticle.content}
                </Text>
              ) : (
                <View style={[styles.tag, { backgroundColor: colors.surface, alignSelf: 'flex-start', paddingVertical: spacing.sm, marginBottom: spacing.xl }]}>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>Полный текст скоро появится</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* News list */}
      <ScrollView
        contentContainerStyle={styles.newsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading && news.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.huge }} />
        ) : (
          <>
            {/* Record of the day */}
            {activeCategory !== 'saved' && <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
              <Text style={[typography.captionMedium, { color: colors.accent }]}>РЕКОРД ДНЯ</Text>
              <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
                Присед 350 кг — Андрей Маланичев
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Абсолютный рекорд России в экипировочном пауэрлифтинге
              </Text>
            </Card>}

            {filteredNews.length === 0 && activeCategory === 'saved' && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔖</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Пока нет сохранённых статей.{'\n'}Нажми 📌 на любой статье чтобы сохранить.
                </Text>
              </View>
            )}

            {filteredNews.map((article) => (
              <TouchableOpacity
                key={article.id}
                onPress={() => handleArticlePress(article)}
                activeOpacity={0.75}
              >
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.articleHeader}>
                    <View style={styles.categoryTags}>
                      {(article.category || []).map((cat) => (
                        <View
                          key={cat}
                          style={[styles.tag, { backgroundColor: colors.primary + '15' }]}
                        >
                          <Text style={[typography.caption, { color: colors.primary }]}>
                            {CATEGORIES.find((c) => c.key === cat)?.label || cat}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => toggleSave(article.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 20 }}>
                        {savedIds.has(article.id) ? '🔖' : '📌'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[typography.h4, { color: colors.text, marginTop: spacing.sm }]}>
                    {article.title}
                  </Text>
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]} numberOfLines={2}>
                    {article.summary}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {formatDate(article.publishedAt)}
                    </Text>
                    {article.content ? (
                      <Text style={[typography.caption, { color: colors.primary }]}>Читать →</Text>
                    ) : null}
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  categories: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  newsList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.huge,
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryTags: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  tag: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 48,
    maxHeight: '85%',
  },
});
