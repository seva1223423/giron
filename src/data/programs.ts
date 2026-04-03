export interface ProgramDay {
  name: string;
  exercises: { exerciseId: string; sets: number; reps: string; rest: number }[];
}

export interface BuiltInProgram {
  id: string;
  name: string;
  description: string;
  goal: 'strength' | 'muscle' | 'fat_loss' | 'endurance';
  level: 'beginner' | 'intermediate' | 'advanced';
  daysPerWeek: number;
  durationWeeks: number;
  split: string;
  emoji: string;
  days: ProgramDay[];
}

export const builtInPrograms: BuiltInProgram[] = [
  {
    id: 'starting-strength',
    name: 'Стартовая сила',
    description: 'Классическая программа Марка Риппто для начинающих. 3 тренировки в неделю, только базовые упражнения. Цель — максимально быстро набрать силу.',
    goal: 'strength',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 12,
    split: 'Фулбоди A/B',
    emoji: '🏋️',
    days: [
      {
        name: 'День A — Фулбоди',
        exercises: [
          { exerciseId: 'squat', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'bench-press', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'barbell-row', sets: 3, reps: '5', rest: 180 },
        ],
      },
      {
        name: 'День B — Фулбоди',
        exercises: [
          { exerciseId: 'squat', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'overhead-press', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'deadlift', sets: 1, reps: '5', rest: 300 },
        ],
      },
    ],
  },
  {
    id: 'ppl-6days',
    name: 'Толчок-Тяга-Ноги (6 дней)',
    description: 'Классический сплит Толчок-Тяга-Ноги для набора массы. Каждая группа мышц тренируется дважды в неделю. Оптимальный объём и частота для гипертрофии.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 6,
    durationWeeks: 12,
    split: 'Толчок / Тяга / Ноги',
    emoji: '💪',
    days: [
      {
        name: 'Толчок — Грудь, плечи, трицепс',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '6-8', rest: 120 },
          { exerciseId: 'incline-bench-press', sets: 3, reps: '8-10', rest: 90 },
          { exerciseId: 'dumbbell-fly', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'overhead-press', sets: 3, reps: '8-10', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '12-15', rest: 60 },
        ],
      },
      {
        name: 'Тяга — Спина, бицепс',
        exercises: [
          { exerciseId: 'deadlift', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'barbell-row', sets: 4, reps: '6-8', rest: 120 },
          { exerciseId: 'pull-ups', sets: 3, reps: '8-12', rest: 90 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'seated-row', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '10-12', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '12-15', rest: 60 },
        ],
      },
      {
        name: 'Ноги',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '6-8', rest: 180 },
          { exerciseId: 'leg-press', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'leg-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'leg-extension', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '15-20', rest: 60 },
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Верх / Низ (4 дня)',
    description: 'Сплит верх/низ — отличный баланс частоты и объёма. Каждая группа тренируется 2x в неделю. Идеально для одновременного роста силы и массы.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 12,
    split: 'Верх / Низ',
    emoji: '⚡',
    days: [
      {
        name: 'Верх A — Сила',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '4-6', rest: 180 },
          { exerciseId: 'barbell-row', sets: 4, reps: '4-6', rest: 180 },
          { exerciseId: 'overhead-press', sets: 3, reps: '6-8', rest: 120 },
          { exerciseId: 'pull-ups', sets: 3, reps: '6-8', rest: 120 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '10-12', rest: 90 },
        ],
      },
      {
        name: 'Низ A — Сила',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '4-6', rest: 180 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '6-8', rest: 120 },
          { exerciseId: 'leg-press', sets: 3, reps: '8-10', rest: 90 },
          { exerciseId: 'leg-curl', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'calf-raise', sets: 4, reps: '15-20', rest: 60 },
        ],
      },
      {
        name: 'Верх B — Гипертрофия',
        exercises: [
          { exerciseId: 'incline-bench-press', sets: 4, reps: '8-12', rest: 90 },
          { exerciseId: 'seated-row', sets: 4, reps: '8-12', rest: 90 },
          { exerciseId: 'dumbbell-fly', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'french-press', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '12-15', rest: 60 },
        ],
      },
      {
        name: 'Низ B — Гипертрофия',
        exercises: [
          { exerciseId: 'deadlift', sets: 3, reps: '4-6', rest: 180 },
          { exerciseId: 'hack-squat', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'leg-extension', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '15-20', rest: 60 },
        ],
      },
    ],
  },
  {
    id: '531-wendler',
    name: '5/3/1 Вендлера',
    description: 'Легендарная программа Джима Вендлера для развития максимальной силы. Прогрессия каждые 4 недели по 4-м базовым движениям. Работает для всех уровней.',
    goal: 'strength',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 16,
    split: '4-дневный сплит',
    emoji: '🔥',
    days: [
      {
        name: 'День 1 — Присед',
        exercises: [
          { exerciseId: 'squat', sets: 3, reps: '5/3/1+', rest: 240 },
          { exerciseId: 'leg-press', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'romanian-deadlift', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'leg-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'calf-raise', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'День 2 — Жим',
        exercises: [
          { exerciseId: 'bench-press', sets: 3, reps: '5/3/1+', rest: 240 },
          { exerciseId: 'dumbbell-bench-press', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'seated-row', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'День 3 — Тяга',
        exercises: [
          { exerciseId: 'deadlift', sets: 3, reps: '5/3/1+', rest: 300 },
          { exerciseId: 'barbell-row', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'lat-pulldown', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'hyperextension', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'День 4 — Жим стоя',
        exercises: [
          { exerciseId: 'overhead-press', sets: 3, reps: '5/3/1+', rest: 240 },
          { exerciseId: 'incline-bench-press', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'pull-ups', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '15', rest: 60 },
        ],
      },
    ],
  },
  {
    id: 'fat-loss-3day',
    name: 'Сжигание жира (3 дня)',
    description: 'Программа для похудения с сохранением мышц. Круговые тренировки с суперсетами и кардио-финишерами. Максимальный расход калорий за минимум времени.',
    goal: 'fat_loss',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 8,
    split: 'Фулбоди + кардио',
    emoji: '🔥',
    days: [
      {
        name: 'А — Фулбоди (толчок)',
        exercises: [
          { exerciseId: 'goblet-squat', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'push-ups', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'lunges', sets: 3, reps: '12/ногу', rest: 60 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'plank', sets: 3, reps: '45 сек', rest: 45 },
          { exerciseId: 'treadmill', sets: 1, reps: '10 мин', rest: 0 },
        ],
      },
      {
        name: 'Б — Фулбоди (тяга)',
        exercises: [
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'seated-row', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'leg-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'jump-rope', sets: 1, reps: '10 мин', rest: 0 },
        ],
      },
      {
        name: 'В — Фулбоди (тотал)',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '12', rest: 75 },
          { exerciseId: 'bench-press', sets: 3, reps: '12', rest: 75 },
          { exerciseId: 'barbell-row', sets: 3, reps: '12', rest: 75 },
          { exerciseId: 'overhead-press', sets: 3, reps: '12', rest: 75 },
          { exerciseId: 'hanging-leg-raise', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'treadmill', sets: 1, reps: '15 мин', rest: 0 },
        ],
      },
    ],
  },
  {
    id: 'bro-split',
    name: 'Бро-сплит (5 дней)',
    description: 'Классический сплит: каждая мышечная группа один раз в неделю, максимальный объём на группу. Отлично для продвинутых атлетов с хорошим восстановлением.',
    goal: 'muscle',
    level: 'advanced',
    daysPerWeek: 5,
    durationWeeks: 12,
    split: 'Грудь / Спина / Ноги / Плечи / Руки',
    emoji: '🎯',
    days: [
      {
        name: 'Пн — Грудь',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '6-8', rest: 120 },
          { exerciseId: 'incline-bench-press', sets: 4, reps: '8-10', rest: 90 },
          { exerciseId: 'dumbbell-bench-press', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'dumbbell-fly', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'cable-crossover', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'dips', sets: 3, reps: '10-15', rest: 60 },
        ],
      },
      {
        name: 'Вт — Спина',
        exercises: [
          { exerciseId: 'deadlift', sets: 4, reps: '5', rest: 240 },
          { exerciseId: 'barbell-row', sets: 4, reps: '6-8', rest: 120 },
          { exerciseId: 'pull-ups', sets: 4, reps: '8-12', rest: 90 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'seated-row', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'dumbbell-row', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'hyperextension', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'Чт — Ноги',
        exercises: [
          { exerciseId: 'squat', sets: 5, reps: '5-8', rest: 180 },
          { exerciseId: 'leg-press', sets: 4, reps: '10-12', rest: 120 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'leg-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'leg-extension', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'calf-raise', sets: 5, reps: '15-20', rest: 60 },
        ],
      },
      {
        name: 'Пт — Плечи',
        exercises: [
          { exerciseId: 'overhead-press', sets: 4, reps: '6-8', rest: 120 },
          { exerciseId: 'arnold-press', sets: 3, reps: '8-10', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 4, reps: '15-20', rest: 60 },
          { exerciseId: 'front-raise', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'reverse-fly', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'shrugs', sets: 4, reps: '12-15', rest: 60 },
        ],
      },
      {
        name: 'Сб — Руки',
        exercises: [
          { exerciseId: 'barbell-curl', sets: 4, reps: '8-10', rest: 90 },
          { exerciseId: 'preacher-curl', sets: 3, reps: '10-12', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'concentration-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'tricep-pushdown', sets: 4, reps: '10-12', rest: 90 },
          { exerciseId: 'french-press', sets: 3, reps: '10-12', rest: 60 },
          { exerciseId: 'close-grip-bench', sets: 3, reps: '10-12', rest: 60 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '12-15', rest: 60 },
        ],
      },
    ],
  },
  {
    id: 'stronglifts-5x5',
    name: 'StrongLifts 5×5',
    description: 'Простейшая программа для набора силы: два чередующихся фулбоди-дня, 5 подходов по 5 повторений. Прогрессия веса на каждой тренировке. Идеально для стартующих в силовом.',
    goal: 'strength',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 12,
    split: 'Фулбоди A/B',
    emoji: '🔩',
    days: [
      {
        name: 'Тренировка A',
        exercises: [
          { exerciseId: 'squat', sets: 5, reps: '5', rest: 180 },
          { exerciseId: 'bench-press', sets: 5, reps: '5', rest: 120 },
          { exerciseId: 'barbell-row', sets: 5, reps: '5', rest: 120 },
        ],
      },
      {
        name: 'Тренировка B',
        exercises: [
          { exerciseId: 'squat', sets: 5, reps: '5', rest: 180 },
          { exerciseId: 'overhead-press', sets: 5, reps: '5', rest: 120 },
          { exerciseId: 'deadlift', sets: 1, reps: '5', rest: 300 },
        ],
      },
    ],
  },
  {
    id: 'powerlifting-beginner',
    name: 'Пауэрлифтинг — Старт',
    description: 'Программа для начинающих пауэрлифтеров: акцент на приседание, жим лёжа и становую тягу. Технические подходы, базовая периодизация, 4 дня в неделю.',
    goal: 'strength',
    level: 'beginner',
    daysPerWeek: 4,
    durationWeeks: 10,
    split: 'Верх / Низ × 2',
    emoji: '🏅',
    days: [
      {
        name: 'Пн — Низ (приседания)',
        exercises: [
          { exerciseId: 'squat', sets: 5, reps: '5', rest: 240 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '8', rest: 120 },
          { exerciseId: 'leg-press', sets: 3, reps: '10', rest: 90 },
          { exerciseId: 'calf-raise', sets: 4, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'Вт — Верх (жим)',
        exercises: [
          { exerciseId: 'bench-press', sets: 5, reps: '5', rest: 180 },
          { exerciseId: 'overhead-press', sets: 3, reps: '8', rest: 120 },
          { exerciseId: 'barbell-row', sets: 4, reps: '6', rest: 120 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '12', rest: 60 },
        ],
      },
      {
        name: 'Чт — Низ (тяга)',
        exercises: [
          { exerciseId: 'deadlift', sets: 4, reps: '4', rest: 300 },
          { exerciseId: 'squat', sets: 3, reps: '8', rest: 180 },
          { exerciseId: 'leg-curl', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'hyperextension', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'Пт — Верх (тяга)',
        exercises: [
          { exerciseId: 'bench-press', sets: 3, reps: '8', rest: 120 },
          { exerciseId: 'barbell-row', sets: 5, reps: '5', rest: 180 },
          { exerciseId: 'pull-ups', sets: 4, reps: '6-8', rest: 120 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '10', rest: 90 },
          { exerciseId: 'overhead-press', sets: 3, reps: '10', rest: 90 },
        ],
      },
    ],
  },
  {
    id: 'phul',
    name: 'PHUL — Сила + Гипертрофия',
    description: 'Power Hypertrophy Upper Lower: 4 дня, 2 силовых + 2 объёмных. Сочетает низкий объём с высокой интенсивностью и умеренный объём для гипертрофии. Один из лучших промежуточных форматов.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 12,
    split: 'Верх сила / Низ сила / Верх объём / Низ объём',
    emoji: '⚡',
    days: [
      {
        name: 'Пн — Верх (сила)',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '3-5', rest: 240 },
          { exerciseId: 'barbell-row', sets: 4, reps: '3-5', rest: 240 },
          { exerciseId: 'overhead-press', sets: 3, reps: '5-8', rest: 180 },
          { exerciseId: 'pull-ups', sets: 3, reps: '6-10', rest: 180 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '10', rest: 90 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '10', rest: 90 },
        ],
      },
      {
        name: 'Вт — Низ (сила)',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '3-5', rest: 300 },
          { exerciseId: 'deadlift', sets: 4, reps: '3-5', rest: 300 },
          { exerciseId: 'leg-press', sets: 3, reps: '10-15', rest: 120 },
          { exerciseId: 'calf-raise', sets: 4, reps: '10-15', rest: 60 },
        ],
      },
      {
        name: 'Чт — Верх (объём)',
        exercises: [
          { exerciseId: 'incline-bench-press', sets: 4, reps: '8-12', rest: 90 },
          { exerciseId: 'dumbbell-row', sets: 4, reps: '8-12', rest: 90 },
          { exerciseId: 'dumbbell-bench-press', sets: 3, reps: '10-15', rest: 60 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '10-15', rest: 60 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '12-20', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '10-15', rest: 60 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '10-15', rest: 60 },
        ],
      },
      {
        name: 'Пт — Низ (объём)',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '10-15', rest: 120 },
          { exerciseId: 'romanian-deadlift', sets: 4, reps: '10-15', rest: 90 },
          { exerciseId: 'leg-press', sets: 3, reps: '15-20', rest: 90 },
          { exerciseId: 'leg-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'leg-extension', sets: 3, reps: '15-20', rest: 60 },
          { exerciseId: 'calf-raise', sets: 5, reps: '15-20', rest: 60 },
        ],
      },
    ],
  },
  {
    id: 'women-toning',
    name: 'Женский тонус',
    description: 'Программа для женщин: проработка всего тела с упором на ягодицы, ноги и пресс. Умеренные веса, высокое количество повторений, минимальный отдых. Жиросжигание + тонус.',
    goal: 'fat_loss',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 8,
    split: 'Фулбоди 3×',
    emoji: '🌸',
    days: [
      {
        name: 'День 1 — Ноги, ягодицы + кардио',
        exercises: [
          { exerciseId: 'goblet-squat', sets: 4, reps: '15-20', rest: 60 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'lunges', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'leg-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'plank', sets: 3, reps: '30-60с', rest: 45 },
          { exerciseId: 'treadmill', sets: 1, reps: '20 мин', rest: 0 },
        ],
      },
      {
        name: 'День 2 — Верх + кор',
        exercises: [
          { exerciseId: 'dumbbell-bench-press', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'dumbbell-row', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15-20', rest: 45 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'cable-crunch', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '20', rest: 45 },
        ],
      },
      {
        name: 'День 3 — Фулбоди + интервалы',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '15', rest: 60 },
          { exerciseId: 'push-ups', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'pull-ups', sets: 3, reps: '8-10', rest: 90 },
          { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'russian-twist', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'hanging-leg-raise', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'jump-rope', sets: 5, reps: '1 мин', rest: 30 },
        ],
      },
    ],
  },
  {
    id: 'sheiko-beginner',
    name: 'Шейко — Основа',
    description: 'Адаптация методики Бориса Шейко для начинающих: высокий объём при умеренной интенсивности, акцент на технику. Подходит для тех, кто хочет серьёзно заниматься пауэрлифтингом.',
    goal: 'strength',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 10,
    split: 'Верх-Низ-Верх-Низ',
    emoji: '🇷🇺',
    days: [
      {
        name: 'Пн — Приседания + Жим',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '5', rest: 180 },
          { exerciseId: 'bench-press', sets: 4, reps: '5', rest: 180 },
          { exerciseId: 'squat', sets: 4, reps: '5', rest: 120 },
          { exerciseId: 'dumbbell-fly', sets: 3, reps: '10', rest: 60 },
        ],
      },
      {
        name: 'Ср — Тяга + Жим стоя',
        exercises: [
          { exerciseId: 'deadlift', sets: 4, reps: '4', rest: 240 },
          { exerciseId: 'overhead-press', sets: 4, reps: '5', rest: 120 },
          { exerciseId: 'barbell-row', sets: 4, reps: '6', rest: 90 },
          { exerciseId: 'hyperextension', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'Пт — Жим + Приседания',
        exercises: [
          { exerciseId: 'bench-press', sets: 5, reps: '4', rest: 180 },
          { exerciseId: 'squat', sets: 5, reps: '4', rest: 180 },
          { exerciseId: 'incline-bench-press', sets: 3, reps: '8', rest: 90 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '12', rest: 60 },
        ],
      },
      {
        name: 'Сб — Тяга + Вспомогательные',
        exercises: [
          { exerciseId: 'deadlift', sets: 3, reps: '3', rest: 300 },
          { exerciseId: 'barbell-row', sets: 4, reps: '5', rest: 120 },
          { exerciseId: 'pull-ups', sets: 4, reps: '6-8', rest: 90 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '10', rest: 60 },
          { exerciseId: 'plank', sets: 3, reps: '60с', rest: 60 },
        ],
      },
    ],
  },
  {
    id: '531-bbb',
    name: '5/3/1 — Boring But Big',
    description: 'Вариация Джима Вендлера: основной подъём по схеме 5/3/1, затем 5×10 с 50% от максимума. Массив объёма на простых движениях. Для тех, кто хочет стать большим И сильным.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 16,
    split: 'Жим / Тяга / Жим стоя / Присед',
    emoji: '🐻',
    days: [
      {
        name: 'День 1 — Жим лёжа',
        exercises: [
          { exerciseId: 'bench-press', sets: 3, reps: '5/3/1', rest: 240 },
          { exerciseId: 'bench-press', sets: 5, reps: '10', rest: 120 },
          { exerciseId: 'barbell-row', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'dips', sets: 5, reps: '10', rest: 60 },
          { exerciseId: 'barbell-curl', sets: 5, reps: '10', rest: 60 },
        ],
      },
      {
        name: 'День 2 — Становая тяга',
        exercises: [
          { exerciseId: 'deadlift', sets: 3, reps: '5/3/1', rest: 300 },
          { exerciseId: 'deadlift', sets: 5, reps: '10', rest: 180 },
          { exerciseId: 'leg-press', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'leg-curl', sets: 5, reps: '10', rest: 60 },
          { exerciseId: 'calf-raise', sets: 5, reps: '10', rest: 60 },
        ],
      },
      {
        name: 'День 3 — Жим стоя',
        exercises: [
          { exerciseId: 'overhead-press', sets: 3, reps: '5/3/1', rest: 240 },
          { exerciseId: 'overhead-press', sets: 5, reps: '10', rest: 120 },
          { exerciseId: 'lat-pulldown', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 5, reps: '15', rest: 60 },
          { exerciseId: 'tricep-pushdown', sets: 5, reps: '10', rest: 60 },
        ],
      },
      {
        name: 'День 4 — Приседание',
        exercises: [
          { exerciseId: 'squat', sets: 3, reps: '5/3/1', rest: 300 },
          { exerciseId: 'squat', sets: 5, reps: '10', rest: 180 },
          { exerciseId: 'romanian-deadlift', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'leg-extension', sets: 5, reps: '10', rest: 60 },
          { exerciseId: 'hanging-leg-raise', sets: 5, reps: '10', rest: 60 },
        ],
      },
    ],
  },
  {
    id: 'hypertrophy-4day',
    name: 'Гипертрофия 4 дня',
    description: 'Программа нацеленная исключительно на рост мышц: умеренная интенсивность (65-75%), высокий объём, диапазон 8-15 повторений. Оптимальное время под нагрузкой для гипертрофии.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 10,
    split: 'Верх A / Низ A / Верх B / Низ B',
    emoji: '📈',
    days: [
      {
        name: 'День 1 — Верх A (толчок)',
        exercises: [
          { exerciseId: 'incline-bench-press', sets: 4, reps: '8-10', rest: 90 },
          { exerciseId: 'dumbbell-bench-press', sets: 4, reps: '10-12', rest: 90 },
          { exerciseId: 'cable-crossover', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'overhead-press', sets: 4, reps: '8-12', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 4, reps: '15-20', rest: 45 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '12-15', rest: 60 },
        ],
      },
      {
        name: 'День 2 — Низ A (квадрицепс)',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '8-12', rest: 120 },
          { exerciseId: 'leg-press', sets: 4, reps: '10-15', rest: 90 },
          { exerciseId: 'leg-extension', sets: 4, reps: '12-15', rest: 60 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'leg-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'calf-raise', sets: 5, reps: '15-20', rest: 45 },
        ],
      },
      {
        name: 'День 3 — Верх B (тяга)',
        exercises: [
          { exerciseId: 'barbell-row', sets: 4, reps: '8-10', rest: 90 },
          { exerciseId: 'lat-pulldown', sets: 4, reps: '10-12', rest: 90 },
          { exerciseId: 'seated-row', sets: 4, reps: '10-12', rest: 90 },
          { exerciseId: 'dumbbell-row', sets: 3, reps: '10-15', rest: 60 },
          { exerciseId: 'barbell-curl', sets: 4, reps: '10-12', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'preacher-curl', sets: 3, reps: '12-15', rest: 60 },
        ],
      },
      {
        name: 'День 4 — Низ B (задняя цепь)',
        exercises: [
          { exerciseId: 'deadlift', sets: 4, reps: '6-8', rest: 180 },
          { exerciseId: 'romanian-deadlift', sets: 4, reps: '10-12', rest: 90 },
          { exerciseId: 'leg-curl', sets: 4, reps: '12-15', rest: 60 },
          { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '10-12', rest: 90 },
          { exerciseId: 'hyperextension', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '15-20', rest: 45 },
        ],
      },
    ],
  },
  {
    id: 'shred-5day',
    name: 'Летняя сушка',
    description: 'Интенсивная программа для жиросжигания: 5 дней, короткий отдых, суперсеты, кардио. Сохраняет мышечную массу при дефиците калорий. Высокая плотность работы.',
    goal: 'fat_loss',
    level: 'intermediate',
    daysPerWeek: 5,
    durationWeeks: 8,
    split: 'Грудь / Спина / Ноги / Плечи / Руки + кардио',
    emoji: '🔥',
    days: [
      {
        name: 'Пн — Грудь + кардио',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'incline-bench-press', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'dumbbell-fly', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'cable-crossover', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'push-ups', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'treadmill', sets: 1, reps: '20 мин', rest: 0 },
        ],
      },
      {
        name: 'Вт — Спина + кардио',
        exercises: [
          { exerciseId: 'pull-ups', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'barbell-row', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'seated-row', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'hyperextension', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'rowing-machine', sets: 1, reps: '15 мин', rest: 0 },
        ],
      },
      {
        name: 'Ср — Ноги + пресс',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '15', rest: 90 },
          { exerciseId: 'leg-press', sets: 4, reps: '15', rest: 90 },
          { exerciseId: 'lunges', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'leg-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'cable-crunch', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'hanging-leg-raise', sets: 4, reps: '15', rest: 45 },
        ],
      },
      {
        name: 'Чт — Плечи + кардио',
        exercises: [
          { exerciseId: 'overhead-press', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'lateral-raise', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'front-raise', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'reverse-fly', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'shrugs', sets: 4, reps: '15', rest: 45 },
          { exerciseId: 'jump-rope', sets: 5, reps: '2 мин', rest: 30 },
        ],
      },
      {
        name: 'Пт — Руки + кор',
        exercises: [
          { exerciseId: 'barbell-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'plank', sets: 4, reps: '60с', rest: 45 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '30', rest: 45 },
          { exerciseId: 'russian-twist', sets: 3, reps: '30', rest: 45 },
        ],
      },
    ],
  },
  {
    id: 'endurance-crossfit',
    name: 'Силовая выносливость',
    description: 'Функциональные тренировки для развития силовой выносливости: комплексы, круговые тренировки, минимальный отдых. Подойдёт тем, кто хочет стать одновременно сильным и выносливым.',
    goal: 'endurance',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 8,
    split: 'Функциональный фулбоди',
    emoji: '🏃',
    days: [
      {
        name: 'День 1 — Тяжёлый фулбоди',
        exercises: [
          { exerciseId: 'deadlift', sets: 5, reps: '5', rest: 180 },
          { exerciseId: 'pull-ups', sets: 5, reps: '5-10', rest: 120 },
          { exerciseId: 'push-ups', sets: 5, reps: '15-20', rest: 60 },
          { exerciseId: 'squat', sets: 5, reps: '10', rest: 90 },
          { exerciseId: 'plank', sets: 5, reps: '60с', rest: 45 },
        ],
      },
      {
        name: 'День 2 — Кардио + кор',
        exercises: [
          { exerciseId: 'rowing-machine', sets: 3, reps: '5 мин', rest: 60 },
          { exerciseId: 'jump-rope', sets: 5, reps: '2 мин', rest: 30 },
          { exerciseId: 'hanging-leg-raise', sets: 4, reps: '15', rest: 45 },
          { exerciseId: 'cable-crunch', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'russian-twist', sets: 4, reps: '30', rest: 45 },
        ],
      },
      {
        name: 'День 3 — Круговая (верх)',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'barbell-row', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'overhead-press', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'lat-pulldown', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'dips', sets: 4, reps: '12-15', rest: 60 },
          { exerciseId: 'barbell-curl', sets: 4, reps: '12', rest: 45 },
        ],
      },
      {
        name: 'День 4 — Круговая (низ + кардио)',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '15', rest: 60 },
          { exerciseId: 'lunges', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'leg-press', sets: 4, reps: '15', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'treadmill', sets: 1, reps: '15 мин', rest: 0 },
          { exerciseId: 'plank', sets: 3, reps: '60с', rest: 45 },
        ],
      },
    ],
  },
  {
    id: 'home-workout',
    name: 'Домашние тренировки',
    description: 'Полноценный план без оборудования или с минимальным инвентарём: только собственный вес, гантели, скакалка. Подходит для тех, кто тренируется дома или в дороге.',
    goal: 'fat_loss',
    level: 'beginner',
    daysPerWeek: 4,
    durationWeeks: 8,
    split: 'Верх / Низ × 2',
    emoji: '🏠',
    days: [
      {
        name: 'День 1 — Верх тела',
        exercises: [
          { exerciseId: 'push-ups', sets: 4, reps: '15-20', rest: 60 },
          { exerciseId: 'pull-ups', sets: 4, reps: '5-10', rest: 90 },
          { exerciseId: 'dips', sets: 3, reps: '10-15', rest: 60 },
          { exerciseId: 'overhead-tricep-ext', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'plank', sets: 3, reps: '60с', rest: 45 },
        ],
      },
      {
        name: 'День 2 — Низ тела',
        exercises: [
          { exerciseId: 'goblet-squat', sets: 4, reps: '15-20', rest: 60 },
          { exerciseId: 'lunges', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '10-12', rest: 60 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '12-15', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'jump-rope', sets: 3, reps: '2 мин', rest: 30 },
        ],
      },
      {
        name: 'День 3 — Функциональный верх',
        exercises: [
          { exerciseId: 'pull-ups', sets: 5, reps: '5-8', rest: 90 },
          { exerciseId: 'push-ups', sets: 5, reps: '20', rest: 60 },
          { exerciseId: 'hanging-leg-raise', sets: 4, reps: '12', rest: 45 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '25', rest: 45 },
          { exerciseId: 'russian-twist', sets: 3, reps: '30', rest: 45 },
          { exerciseId: 'side-plank', sets: 3, reps: '45с', rest: 45 },
        ],
      },
      {
        name: 'День 4 — Кардио + всё тело',
        exercises: [
          { exerciseId: 'jump-rope', sets: 5, reps: '3 мин', rest: 60 },
          { exerciseId: 'squat', sets: 4, reps: '20', rest: 60 },
          { exerciseId: 'push-ups', sets: 4, reps: '15', rest: 60 },
          { exerciseId: 'lunges', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'plank', sets: 3, reps: '60с', rest: 45 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '20', rest: 45 },
        ],
      },
    ],
  },

  // ─── 18 ─── Русский силовой минимум (3×/нед, фулбоди, начинающий)
  {
    id: 'russian-strength-minimum',
    name: 'Русский силовой минимум',
    description: 'Три базовых движения — присед, жим, тяга. Прогресс на каждой тренировке. Идеально для начинающих силовиков.',
    goal: 'strength',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 8,
    split: 'Фулбоди A/B',
    emoji: '🇷🇺',
    days: [
      {
        name: 'День A — Присед + Жим',
        exercises: [
          { exerciseId: 'squat', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'bench-press', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'barbell-row', sets: 3, reps: '5', rest: 180 },
        ],
      },
      {
        name: 'День B — Присед + Жим стоя',
        exercises: [
          { exerciseId: 'squat', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'overhead-press', sets: 3, reps: '5', rest: 180 },
          { exerciseId: 'deadlift', sets: 1, reps: '5', rest: 240 },
        ],
      },
    ],
  },

  // ─── 19 ─── Программа жиросжигания «Сушка 6 недель»
  {
    id: 'cut-6-weeks',
    name: 'Сушка 6 недель',
    description: 'Суперсеты, высокий темп, минимальный отдых. Максимальный расход калорий при сохранении мышц.',
    goal: 'fat_loss',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 6,
    split: 'Верх / Низ',
    emoji: '🔥',
    days: [
      {
        name: 'День 1 — Верх тела',
        exercises: [
          { exerciseId: 'bench-press', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'barbell-row', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'overhead-press', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'barbell-curl', sets: 3, reps: '15', rest: 30 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '15', rest: 30 },
        ],
      },
      {
        name: 'День 2 — Низ тела',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '15', rest: 60 },
          { exerciseId: 'romanian-deadlift', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'leg-press', sets: 3, reps: '20', rest: 45 },
          { exerciseId: 'leg-curl', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'calf-raise', sets: 4, reps: '20', rest: 30 },
          { exerciseId: 'plank', sets: 3, reps: '45с', rest: 30 },
        ],
      },
      {
        name: 'День 3 — Верх тела (силовой)',
        exercises: [
          { exerciseId: 'incline-bench-press', sets: 4, reps: '10', rest: 75 },
          { exerciseId: 'pull-ups', sets: 4, reps: '8-10', rest: 75 },
          { exerciseId: 'machine-shoulder-press', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'cable-row', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '12', rest: 30 },
          { exerciseId: 'french-press', sets: 3, reps: '12', rest: 30 },
        ],
      },
      {
        name: 'День 4 — Низ тела + Кардио',
        exercises: [
          { exerciseId: 'hack-squat', sets: 4, reps: '12', rest: 60 },
          { exerciseId: 'lunges', sets: 3, reps: '12', rest: 45 },
          { exerciseId: 'leg-extension', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'jump-rope', sets: 5, reps: '2 мин', rest: 30 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '25', rest: 30 },
        ],
      },
    ],
  },

  // ─── 20 ─── Пауэрлифтинг Пик (8 нед, продвинутый)
  {
    id: 'powerlifting-peak',
    name: 'Пауэрлифтинг: Пик',
    description: '8-недельный пик перед соревнованиями или тестом 1ПМ. Волновая нагрузка, интенсивность 80–95%.',
    goal: 'strength',
    level: 'advanced',
    daysPerWeek: 4,
    durationWeeks: 8,
    split: 'Сопряжённый метод',
    emoji: '⚡',
    days: [
      {
        name: 'День 1 — Максимальная сила (жим)',
        exercises: [
          { exerciseId: 'bench-press', sets: 5, reps: '3', rest: 300 },
          { exerciseId: 'close-grip-bench', sets: 4, reps: '4', rest: 240 },
          { exerciseId: 'tricep-pushdown', sets: 4, reps: '8', rest: 120 },
          { exerciseId: 'dumbbell-fly', sets: 3, reps: '10', rest: 90 },
          { exerciseId: 'face-pull', sets: 3, reps: '15', rest: 90 },
        ],
      },
      {
        name: 'День 2 — Максимальная сила (присед)',
        exercises: [
          { exerciseId: 'squat', sets: 5, reps: '3', rest: 300 },
          { exerciseId: 'squat', sets: 4, reps: '3', rest: 300 },
          { exerciseId: 'leg-press', sets: 3, reps: '8', rest: 120 },
          { exerciseId: 'leg-curl', sets: 3, reps: '10', rest: 90 },
          { exerciseId: 'hanging-leg-raise', sets: 3, reps: '10', rest: 90 },
        ],
      },
      {
        name: 'День 3 — Динамическая сила (жим)',
        exercises: [
          { exerciseId: 'bench-press', sets: 8, reps: '3', rest: 60 },
          { exerciseId: 'incline-bench-press', sets: 3, reps: '6', rest: 120 },
          { exerciseId: 'barbell-row', sets: 4, reps: '6', rest: 120 },
          { exerciseId: 'pull-ups', sets: 3, reps: '6', rest: 90 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'День 4 — Максимальная сила (тяга)',
        exercises: [
          { exerciseId: 'deadlift', sets: 5, reps: '2', rest: 360 },
          { exerciseId: 'hyperextension', sets: 3, reps: '3', rest: 300 },
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '6', rest: 180 },
          { exerciseId: 'barbell-row', sets: 4, reps: '5', rest: 180 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '8', rest: 90 },
        ],
      },
    ],
  },

  // ─── 21 ─── Женская программа «Форма и тонус»
  {
    id: 'women-shape-tone',
    name: 'Форма и тонус',
    description: 'Программа для девушек: акцент на ягодицы, ноги и корпус. Умеренные веса, высокий объём, красивая форма.',
    goal: 'muscle',
    level: 'beginner',
    daysPerWeek: 3,
    durationWeeks: 8,
    split: 'Ноги / Верх / Фулбоди',
    emoji: '✨',
    days: [
      {
        name: 'День 1 — Ноги и ягодицы',
        exercises: [
          { exerciseId: 'squat', sets: 4, reps: '15', rest: 90 },
          { exerciseId: 'romanian-deadlift', sets: 4, reps: '12', rest: 90 },
          { exerciseId: 'leg-press', sets: 3, reps: '15', rest: 75 },
          { exerciseId: 'lunges', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'calf-raise', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'hyperextension', sets: 3, reps: '15', rest: 60 },
        ],
      },
      {
        name: 'День 2 — Верх тела',
        exercises: [
          { exerciseId: 'dumbbell-bench-press', sets: 3, reps: '12', rest: 75 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '12', rest: 75 },
          { exerciseId: 'machine-shoulder-press', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'cable-row', sets: 3, reps: '12', rest: 60 },
          { exerciseId: 'hammer-curl', sets: 3, reps: '12', rest: 45 },
          { exerciseId: 'tricep-pushdown', sets: 3, reps: '15', rest: 45 },
        ],
      },
      {
        name: 'День 3 — Фулбоди + Кор',
        exercises: [
          { exerciseId: 'romanian-deadlift', sets: 3, reps: '12', rest: 90 },
          { exerciseId: 'incline-bench-press', sets: 3, reps: '12', rest: 75 },
          { exerciseId: 'leg-curl', sets: 3, reps: '15', rest: 60 },
          { exerciseId: 'lateral-raise', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'plank', sets: 3, reps: '45с', rest: 45 },
          { exerciseId: 'bicycle-crunch', sets: 3, reps: '20', rest: 30 },
        ],
      },
    ],
  },

  // ─── 22 ─── Выносливость «Железный марафонец»
  {
    id: 'iron-marathoner',
    name: 'Железный марафонец',
    description: 'Силовая выносливость для спортсменов. Высокие повторения, короткие паузы, функциональные движения.',
    goal: 'endurance',
    level: 'intermediate',
    daysPerWeek: 5,
    durationWeeks: 6,
    split: 'Функциональный сплит',
    emoji: '🏃',
    days: [
      {
        name: 'День 1 — Нижняя выносливость',
        exercises: [
          { exerciseId: 'squat', sets: 5, reps: '20', rest: 60 },
          { exerciseId: 'lunges', sets: 4, reps: '20', rest: 45 },
          { exerciseId: 'jump-rope', sets: 6, reps: '2 мин', rest: 30 },
          { exerciseId: 'goblet-squat', sets: 4, reps: '15', rest: 45 },
          { exerciseId: 'calf-raise', sets: 5, reps: '25', rest: 30 },
        ],
      },
      {
        name: 'День 2 — Верхняя выносливость',
        exercises: [
          { exerciseId: 'push-ups', sets: 6, reps: '20', rest: 45 },
          { exerciseId: 'pull-ups', sets: 6, reps: 'МАКС', rest: 60 },
          { exerciseId: 'overhead-press', sets: 4, reps: '15', rest: 45 },
          { exerciseId: 'barbell-row', sets: 4, reps: '15', rest: 45 },
          { exerciseId: 'dips', sets: 4, reps: '15', rest: 45 },
        ],
      },
      {
        name: 'День 3 — Кардио + Кор',
        exercises: [
          { exerciseId: 'jump-rope', sets: 8, reps: '3 мин', rest: 30 },
          { exerciseId: 'plank', sets: 5, reps: '60с', rest: 30 },
          { exerciseId: 'bicycle-crunch', sets: 4, reps: '30', rest: 30 },
          { exerciseId: 'russian-twist', sets: 4, reps: '25', rest: 30 },
          { exerciseId: 'hanging-leg-raise', sets: 4, reps: '15', rest: 30 },
        ],
      },
      {
        name: 'День 4 — Фулбоди мощность',
        exercises: [
          { exerciseId: 'deadlift', sets: 4, reps: '12', rest: 90 },
          { exerciseId: 'bench-press', sets: 4, reps: '12', rest: 75 },
          { exerciseId: 'barbell-row', sets: 4, reps: '12', rest: 75 },
          { exerciseId: 'squat', sets: 4, reps: '12', rest: 75 },
          { exerciseId: 'push-ups', sets: 3, reps: '20', rest: 45 },
        ],
      },
      {
        name: 'День 5 — Восстановительная',
        exercises: [
          { exerciseId: 'jump-rope', sets: 3, reps: '5 мин', rest: 60 },
          { exerciseId: 'lunges', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'push-ups', sets: 3, reps: '15', rest: 45 },
          { exerciseId: 'plank', sets: 3, reps: '45с', rest: 30 },
          { exerciseId: 'side-plank', sets: 2, reps: '30с', rest: 30 },
        ],
      },
    ],
  },
];
