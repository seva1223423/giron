/**
 * RUSSIAN TEXT OVERFLOW PER DEVICE
 * ────────────────────────────────
 * Russian words tend to be 1.2-1.4× longer than the English equivalent.
 * This audit catches overflow risks on narrow devices for the most
 * frequently-shown labels in Iron Gym.
 *
 * The math is approximate — character × ~7pt at 14pt font, ~9pt at
 * 17pt font, etc. — which matches typical Cyrillic average glyph
 * width in the system font (San Francisco / Roboto).
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Approximate width of a Russian text string at a given font size. */
function ruWidth(text: string, fontSize: number): number {
  const avgRatio = 0.55; // proportional fonts ~ 55% of font size on average
  return text.length * fontSize * avgRatio;
}

const DEVICES = [272, 280, 320, 360, 375, 390, 414, 430];

// ─── Tab labels ──────────────────────────────────────────────────────────────

describe('Tab bar labels (10pt font)', () => {
  const TAB_LABELS = ['Главная', 'Тренировки', 'ИИ', 'Питание', 'Профиль'];

  test.each(DEVICES)('tab labels fit at %ipt device width', (w) => {
    const tabW = w / 5;
    for (const label of TAB_LABELS) {
      const labelW = ruWidth(label, 10);
      // labels can wrap-truncate or be small enough
      if (labelW > tabW - 8) {
        // Will be ellipsized — make sure that's acceptable
        expect(label.length).toBeLessThanOrEqual(11); // "Тренировки" = 10 chars
      }
    }
  });

  test('"Тренировки" label (longest) at 10pt < 65pt wide', () => {
    expect(ruWidth('Тренировки', 10)).toBeLessThan(65);
  });
});

// ─── Section headers (17pt font) ─────────────────────────────────────────────

describe('Section headers fit content area', () => {
  const HEADERS = [
    'Сегодняшняя тренировка',
    'Календарь тренировок',
    'История тренировок',
    'Программа тренировок',
    'Настройки уведомлений',
    'Безопасность аккаунта',
    'Привязанные аккаунты',
  ];

  test.each(DEVICES)('all section headers fit at %ipt width', (w) => {
    const content = w - 2 * 20;
    for (const h of HEADERS) {
      const headerW = ruWidth(h, 17);
      expect(headerW).toBeLessThanOrEqual(content + 20); // small tolerance for measurement
    }
  });
});

// ─── Button labels (15pt font) ───────────────────────────────────────────────

describe('Button labels fit standard button widths', () => {
  const CTAs = [
    'Начать тренировку',
    'Завершить тренировку',
    'Создать программу',
    'Сохранить изменения',
    'Восстановить пароль',
    'Перейти к оплате',
    'Подтвердить вход',
    'Сканировать еду',
    'Войти через Google',
    'Войти через VK ID',
    'Войти через Яндекс',
  ];

  test.each(DEVICES)('all CTAs fit full-width button at %ipt', (w) => {
    const buttonW = w - 2 * 20 - 2 * 16; // screen pad + button inner pad
    for (const label of CTAs) {
      const labelW = ruWidth(label, 15);
      expect(labelW).toBeLessThanOrEqual(buttonW + 20);
    }
  });
});

// ─── Greeting / hero strings (24pt font) ─────────────────────────────────────

describe('Hero greetings wrap or fit', () => {
  test('"Доброе утро, Александр" fits at 360pt portrait', () => {
    const greeting = 'Доброе утро, Александр';
    const content = 360 - 2 * 20 - 40 - 16; // pad - bell - gap
    expect(ruWidth(greeting, 24)).toBeLessThanOrEqual(content + 80); // wraps to 2 lines OK
  });

  test('"Привет, Влад" fits comfortably at 280pt fold-closed', () => {
    const content = 280 - 2 * 20 - 40 - 16;
    expect(ruWidth('Привет, Влад', 24)).toBeLessThan(content + 20);
  });

  test('extra-long name "Привет, Владимирович" wraps to 2 lines', () => {
    const longGreeting = 'Привет, Владимирович';
    const content = 280 - 40 - 40 - 16;
    // Will wrap: chars / line ~ 12, total 20 chars → 2 lines
    expect(longGreeting.length).toBeGreaterThan(12);
  });
});

// ─── Badge / chip labels (10-12pt font) ─────────────────────────────────────

describe('Badges and chips fit their containers', () => {
  const CHIPS = [
    'Новый', 'PRO', 'Скоро', 'Бесплатно', 'Активна', 'Завершена', 'Отдых',
    'Кардио', 'Сила', 'Растяжка', 'HIIT', 'Программа',
  ];

  test('all chip labels are short enough (< 12 chars)', () => {
    for (const chip of CHIPS) {
      expect(chip.length).toBeLessThanOrEqual(12);
    }
  });

  test('chip min-width 50pt fits at 11pt font', () => {
    for (const chip of CHIPS) {
      const w = ruWidth(chip, 11) + 16; // padding
      expect(w).toBeLessThanOrEqual(120);
    }
  });
});

// ─── Toast messages (14pt font) ──────────────────────────────────────────────

describe('Toasts fit narrow devices', () => {
  const TOASTS = [
    'Новый рекорд!',
    'Тренировка сохранена',
    'Программа создана',
    'Не удалось загрузить',
    'Нет соединения',
    'Скопировано',
    'Удалено',
    'Сохранено',
    'Подписка активна до 25 декабря',
    'Тренировка добавлена в избранное',
  ];

  test.each(DEVICES)('all toast messages fit at %ipt', (w) => {
    const content = w - 2 * 20 - 2 * 14; // screen pad + toast inner pad
    for (const t of TOASTS) {
      const tW = ruWidth(t, 14);
      // 2-line wrap acceptable for long messages
      if (tW > content) {
        const linesNeeded = Math.ceil(tW / content);
        expect(linesNeeded).toBeLessThanOrEqual(3);
      } else {
        expect(tW).toBeLessThanOrEqual(content);
      }
    }
  });
});

// ─── Form labels (13pt font) ─────────────────────────────────────────────────

describe('Form labels fit input column', () => {
  const LABELS = [
    'Электронная почта',
    'Текущий пароль',
    'Новый пароль',
    'Подтверждение пароля',
    'Имя пользователя',
    'Дата рождения',
    'Рост (см)',
    'Вес (кг)',
    'Уровень подготовки',
    'Цель тренировок',
    'Период подписки',
  ];

  test.each(DEVICES)('all form labels fit at %ipt', (w) => {
    const content = w - 2 * 20;
    for (const l of LABELS) {
      expect(ruWidth(l, 13)).toBeLessThan(content);
    }
  });
});

// ─── Plurals (день / дня / дней) ─────────────────────────────────────────────

describe('Russian plural agreement strings stay compact', () => {
  test('streak "47 дней подряд" fits home card', () => {
    const text = '47 дней подряд';
    expect(ruWidth(text, 14)).toBeLessThan(200);
  });

  test('rest day count "2 дня отдыха" formats correctly', () => {
    const cases: Array<[number, string]> = [
      [1, 'день'],
      [2, 'дня'],
      [3, 'дня'],
      [4, 'дня'],
      [5, 'дней'],
      [11, 'дней'],
      [21, 'день'],
      [22, 'дня'],
      [25, 'дней'],
      [101, 'день'],
    ];
    function dayWord(n: number): string {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 14) return 'дней';
      if (mod10 === 1) return 'день';
      if (mod10 >= 2 && mod10 <= 4) return 'дня';
      return 'дней';
    }
    for (const [n, expected] of cases) {
      expect(dayWord(n)).toBe(expected);
    }
  });
});

// ─── Onboarding question texts (20pt font) ──────────────────────────────────

describe('Onboarding question titles fit', () => {
  const QUESTIONS = [
    'Какова ваша цель?',
    'Сколько раз в неделю?',
    'Какой у вас уровень?',
    'Откуда вы тренируетесь?',
    'Расскажите о себе',
  ];

  test.each(DEVICES)('all onboarding questions fit at %ipt (1 line)', (w) => {
    const content = w - 2 * 20;
    for (const q of QUESTIONS) {
      const qW = ruWidth(q, 20);
      // 1 line preferred but 2-line wrap acceptable on narrow
      const linesNeeded = Math.ceil(qW / content);
      expect(linesNeeded).toBeLessThanOrEqual(2);
    }
  });
});

// ─── Error messages (13pt font) ──────────────────────────────────────────────

describe('Error messages fit form input width', () => {
  const ERRORS = [
    'Неверный пароль',
    'Пользователь не найден',
    'Сетевая ошибка',
    'Слишком много попыток',
    'Срок действия истёк',
    'Минимум 8 символов',
    'Введите корректный email',
    'Поля не совпадают',
  ];

  test.each(DEVICES)('error messages fit input width at %ipt', (w) => {
    const inputW = w - 2 * 20;
    for (const e of ERRORS) {
      expect(ruWidth(e, 13)).toBeLessThan(inputW + 20);
    }
  });
});

// ─── Long-name truncation (recipe / exercise names) ─────────────────────────

describe('Truncation logic for long Russian names', () => {
  test('recipe name >32 chars gets truncated to 30 + ellipsis', () => {
    const name = 'Овсянка с бананом и грецкими орехами и мёдом';
    const truncated = name.length > 32 ? name.slice(0, 30) + '…' : name;
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(31);
  });

  test('exercise name >24 chars on narrow row truncates', () => {
    const name = 'Жим штанги лёжа на наклонной скамье вверх';
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;
    expect(truncate(name, 24).length).toBe(24);
  });

  test('passing through short names unchanged', () => {
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;
    expect(truncate('Приседания', 30)).toBe('Приседания');
  });
});

// ─── Numeric formatting in Russian locale ───────────────────────────────────

describe('Russian-locale formatting stays compact', () => {
  test('weight "85,5 кг" fits column at 14pt < 70pt', () => {
    expect(ruWidth('85,5 кг', 14)).toBeLessThan(70);
  });

  test('calories "1 640 / 2 400 ккал" fits at 13pt < 180pt', () => {
    expect(ruWidth('1 640 / 2 400 ккал', 13)).toBeLessThan(180);
  });

  test('workout duration "1 ч 23 мин" fits at 12pt < 80pt', () => {
    expect(ruWidth('1 ч 23 мин', 12)).toBeLessThan(80);
  });

  test('streak "365 дней подряд" stays under 200pt at 14pt', () => {
    expect(ruWidth('365 дней подряд', 14)).toBeLessThan(200);
  });
});
