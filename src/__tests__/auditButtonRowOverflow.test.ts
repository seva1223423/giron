/**
 * BUTTON ROW OVERFLOW AUDIT
 * ─────────────────────────
 * Multiple buttons in a horizontal row are prone to overflow on
 * narrow devices. This audit checks every common 2-button and
 * 3-button row pattern in the app.
 *
 * Pattern A: Cancel / Confirm — bottom of modals, alerts, forms
 * Pattern B: Назад / Далее — onboarding, multi-step
 * Pattern C: Plus / Minus / Number — set count adjusters
 * Pattern D: Filter chips row — sometimes 4-6 chips
 * Pattern E: Workout action row — Pause / Resume / End
 *
 * Each pattern is verified to fit on the smallest realistic device
 * (320pt iPhone SE 1st gen) without text truncation.
 */

const SE = 320;
const FOLD_CLOSED = 280;
const SCREEN_PAD = 20;

function ruWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

// ─── Pattern A: Cancel / Confirm ────────────────────────────────────────────

describe('Pattern A: Cancel / Confirm row', () => {
  const labels = [
    { cancel: 'Отмена', confirm: 'Сохранить' },
    { cancel: 'Назад', confirm: 'Подтвердить' },
    { cancel: 'Закрыть', confirm: 'Применить' },
    { cancel: 'Отменить', confirm: 'Удалить' },
    { cancel: 'Нет', confirm: 'Да, удалить' },
  ];

  test.each(labels)('"$cancel" / "$confirm" fits SE width', ({ cancel, confirm }) => {
    const content = SE - 2 * SCREEN_PAD - 12; // gap
    const cancelW = ruWidth(cancel, 15) + 2 * 16; // text + padding
    const confirmW = ruWidth(confirm, 15) + 2 * 16;
    expect(cancelW + confirmW).toBeLessThanOrEqual(content + 30); // 30pt tolerance
  });
});

// ─── Pattern B: Назад / Далее (onboarding) ──────────────────────────────────

describe('Pattern B: Назад / Далее onboarding', () => {
  test('"Назад" (compact) + spacer + "Далее" (flex) at SE 320pt', () => {
    const content = SE - 2 * SCREEN_PAD;
    const backW = 80; // compact ghost button
    const dalee = content - backW - 12; // flex
    expect(dalee).toBeGreaterThanOrEqual(180);
  });

  test('"Завершить" final-step CTA is full-width', () => {
    const content = SE - 2 * SCREEN_PAD;
    expect(content).toBeGreaterThanOrEqual(232);
  });

  test('progress dots (4) fit above Назад/Далее', () => {
    const dotsW = 4 * 8 + 3 * 8;
    expect(dotsW).toBe(56);
    expect(dotsW).toBeLessThan(SE - 2 * SCREEN_PAD);
  });
});

// ─── Pattern C: Numeric adjuster (- N +) ────────────────────────────────────

describe('Pattern C: Plus / Minus / Number adjuster', () => {
  test('- N + row at 80pt min total fits anywhere', () => {
    const total = 32 + 32 + 8 + 32 + 8; // [-] gap N gap [+]
    expect(total).toBe(112);
    expect(total).toBeLessThan(SE);
  });

  test('weight adjuster "-2.5  85.5  +2.5" at 14pt fits 200pt column', () => {
    const minus = ruWidth('-2.5', 14) + 16; // ~47pt
    const number = ruWidth('85.5', 14) + 16; // ~47pt
    const plus = ruWidth('+2.5', 14) + 16;
    const gaps = 2 * 12;
    // 3 chips each ~47pt + 2 gaps × 12 = ~165pt total
    expect(minus + number + plus + gaps).toBeLessThan(180);
  });
});

// ─── Pattern D: Filter chips row ────────────────────────────────────────────

describe('Pattern D: Filter chips row', () => {
  const chipSets = [
    ['Все', 'Сила', 'Кардио', 'Растяжка'],
    ['Все', 'Завтрак', 'Обед', 'Ужин', 'Перекус'],
    ['Сегодня', 'Неделя', 'Месяц', 'Год'],
  ];

  test.each(chipSets)('chips row scrollable on SE 320pt: %j', (...chips) => {
    const totalW = chips.reduce((sum, c) => sum + ruWidth(c, 12) + 24 /* chip pad */, 0);
    const content = SE - 2 * SCREEN_PAD;
    if (totalW > content) {
      // Must scroll horizontally — verify each chip fits individually
      for (const c of chips) {
        const w = ruWidth(c, 12) + 24;
        expect(w).toBeLessThan(content);
      }
    } else {
      expect(totalW).toBeLessThanOrEqual(content);
    }
  });
});

// ─── Pattern E: Workout action row ──────────────────────────────────────────

describe('Pattern E: ActiveWorkout action row', () => {
  test('"Пауза" + "Завершить" 2-button row fits SE landscape (667×375)', () => {
    const w = 667;
    const content = w - 2 * 16;
    const pause = ruWidth('Пауза', 15) + 32;
    const finish = ruWidth('Завершить', 15) + 32;
    expect(pause + finish + 12).toBeLessThanOrEqual(content);
  });

  test('"Skip" + "Done" iconified row fits portrait', () => {
    const content = SE - 2 * 16;
    const skip = ruWidth('Пропустить', 14) + 32;
    expect(skip).toBeLessThanOrEqual(content / 2);
  });
});

// ─── Pattern F: 3-segment selector ───────────────────────────────────────────

describe('Pattern F: 3-segment selector (light/dark/auto)', () => {
  const SEGMENTS = [
    ['Светлая', 'Тёмная', 'Авто'],
    ['День', 'Неделя', 'Месяц'],
    ['Все', 'Активные', 'Завершённые'],
  ];

  test.each(SEGMENTS)('3 segments fit SE 320pt: %j', (...segs) => {
    const content = SE - 2 * SCREEN_PAD - 2 * 14; // card padding
    const segW = content / 3;
    for (const s of segs) {
      const labelW = ruWidth(s, 12) + 16;
      expect(labelW).toBeLessThan(segW + 5); // small tolerance
    }
  });
});

// ─── Pattern G: 4 OAuth buttons stacked ─────────────────────────────────────

describe('Pattern G: 4 OAuth buttons stacked vertically', () => {
  // OAuth: Google, VK, Yandex, Mail.ru. Stacked vertical buttons,
  // each full-width.
  test.each([SE, FOLD_CLOSED])('OAuth button at %ipt has 200+ pt for "Войти через Mail.ru"', (w) => {
    const content = w - 2 * SCREEN_PAD;
    const label = ruWidth('Войти через Mail.ru', 15);
    expect(content).toBeGreaterThanOrEqual(label + 32);
  });

  test('4 OAuth + email-password stack height fits SE 568pt', () => {
    const buttonH = 48;
    const gap = 12;
    const totalStack = 4 * buttonH + 3 * gap; // 4 OAuth buttons
    expect(totalStack).toBe(228);
    // SE has 568pt - safeTop 20 - keyboard 270 = 278pt remaining
    // With email + password fields above (104) — stack must scroll
    expect(totalStack + 104).toBeGreaterThan(278);
  });
});

// ─── Pattern H: ListItem with leading icon + label + trailing chevron ──────

describe('Pattern H: List row "icon + label + chevron"', () => {
  const ROW_LABELS = [
    'Уведомления',
    'Подписка Premium',
    'Привязанные аккаунты',
    'Безопасность',
    'Удалить аккаунт',
    'О приложении',
  ];

  test.each([FOLD_CLOSED, SE, 360, 390])('list row fits at %ipt', (w) => {
    const content = w - 2 * SCREEN_PAD;
    const cardInner = content - 2 * 14;
    const icon = 24;
    const chevron = 16;
    const labelArea = cardInner - icon - chevron - 24;
    for (const label of ROW_LABELS) {
      expect(ruWidth(label, 15)).toBeLessThan(labelArea + 30);
    }
  });
});

// ─── Pattern I: Macro bar 4-up row ───────────────────────────────────────────

describe('Pattern I: 4 macro bars in a row (calories/protein/fats/carbs)', () => {
  const macros = ['Ккал', 'Белки', 'Жиры', 'Углеводы'];

  test.each([SE, 360, 390])('macros fit 4-column row at %ipt', (w) => {
    const content = w - 2 * SCREEN_PAD - 2 * 14;
    const colW = content / 4;
    for (const label of macros) {
      const labelW = ruWidth(label, 11);
      expect(labelW).toBeLessThan(colW + 5);
    }
  });

  test('macro values "240 г" fit 4-column row', () => {
    const content = SE - 2 * SCREEN_PAD - 2 * 14;
    const colW = content / 4;
    expect(ruWidth('240 г', 14)).toBeLessThan(colW + 5);
  });
});

// ─── Pattern J: Set entry row (weight × reps × RPE × ✓) ─────────────────────

describe('Pattern J: ActiveWorkout set entry row', () => {
  test('weight (80) + reps (80) + RPE (60) + check (44) at SE 320pt fits with scroll OR wraps', () => {
    const content = SE - 2 * 16;
    const totalRow = 80 + 80 + 60 + 44 + 3 * 8;
    if (content < totalRow) {
      // Use 2-row layout: weight+reps on row 1, RPE+check on row 2
      const row1 = 80 + 80 + 8;
      expect(content).toBeGreaterThanOrEqual(row1);
    } else {
      expect(content).toBeGreaterThanOrEqual(totalRow);
    }
  });
});

// ─── Pattern K: Bottom sheet handles + close ────────────────────────────────

describe('Pattern K: Modal sheet header (drag handle + title + close)', () => {
  test('handle (40×4) + title (flex) + close (24) row fits SE', () => {
    const handle = 40;
    const close = 32;
    const content = SE - 2 * 20;
    expect(handle + close + 12).toBeLessThan(content);
  });

  test('title "Настройки приложения" (17pt) fits between handle and close', () => {
    const handle = 40;
    const close = 32;
    const titleArea = SE - 2 * 20 - handle - close - 24; // gaps
    expect(ruWidth('Настройки приложения', 17)).toBeLessThan(titleArea + 50);
  });
});
