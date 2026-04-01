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
    name: 'Starting Strength',
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
    name: 'Push Pull Legs (6 дней)',
    description: 'Классический PPL-сплит для набора массы. Каждая группа мышц тренируется дважды в неделю. Оптимальный объём и частота для гипертрофии.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 6,
    durationWeeks: 12,
    split: 'Push / Pull / Legs',
    emoji: '💪',
    days: [
      {
        name: 'Push — Грудь, плечи, трицепс',
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
        name: 'Pull — Спина, бицепс',
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
        name: 'Legs — Ноги',
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
    name: 'Upper / Lower (4 дня)',
    description: 'Сплит верх/низ — отличный баланс частоты и объёма. Каждая группа тренируется 2x в неделю. Идеально для одновременного роста силы и массы.',
    goal: 'muscle',
    level: 'intermediate',
    daysPerWeek: 4,
    durationWeeks: 12,
    split: 'Upper / Lower',
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
];
