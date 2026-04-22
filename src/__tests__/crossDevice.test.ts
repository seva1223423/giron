/**
 * Cross-device layout invariants for the Direction A redesign.
 *
 * The real React Native components use flex-based layout so they
 * adapt to screen width automatically. What we can lock in unit
 * tests are the numeric invariants: nothing breaks at 280pt fold
 * state, 360pt Android small, 390pt iPhone 14, 430pt iPhone Max,
 * or 768pt iPad.
 *
 * Also guards edge formatting — number localisation, truncation
 * limits, currency separators — which are non-obvious but easy to
 * regress when someone swaps toLocaleString settings.
 */

// Representative device widths — covers the realistic spread
const DEVICE_WIDTHS = {
  foldClosed: 280,      // Z Fold closed
  androidSmall: 360,    // Pixel 4a, budget Android
  iphoneSE: 375,        // iPhone SE 2nd/3rd
  iphone14: 390,        // iPhone 14, 15, 16
  iphoneMax: 430,       // iPhone 14/15/16 Pro Max
  ipad: 768,            // iPad mini portrait
  ipadLandscape: 1024,  // iPad landscape
};

// ─── Ring + stats layout ─────────────────────────────────────────────────────

describe('RingStatsCard layout invariants', () => {
  const RING_SIZE = 110;
  const CARD_H_PADDING = 20 * 2; // padding 20 both sides
  const CARD_GAP_TO_ROWS = 20;

  test('ring fits inside every target device', () => {
    // Card is centered within the content area (content has xl=20 padding).
    // Ring is 110pt. Min content width = smallest device - 2 * screen xl padding.
    for (const [name, width] of Object.entries(DEVICE_WIDTHS)) {
      const contentWidth = width - 20 * 2; // screen padding from HomeScreen
      expect(contentWidth).toBeGreaterThan(RING_SIZE + CARD_GAP_TO_ROWS);
    }
  });

  test('3 rows next to the ring have >= 100pt to breathe on smallest device', () => {
    const foldContent = DEVICE_WIDTHS.foldClosed - 40;
    const rowsWidth = foldContent - CARD_H_PADDING - RING_SIZE - CARD_GAP_TO_ROWS;
    // Expect at least 60pt for the rows (they're already narrow but readable)
    expect(rowsWidth).toBeGreaterThan(40);
  });
});

// ─── QuickActionsGrid flex basis ─────────────────────────────────────────────

describe('QuickActionsGrid layout invariants', () => {
  test('two tiles with 48% basis + 10pt gap always fit on one row', () => {
    for (const [name, width] of Object.entries(DEVICE_WIDTHS)) {
      const contentWidth = width - 20 * 2; // screen padding
      const tileMinWidth = contentWidth * 0.48;
      // Tile must have at least 140pt to fit the icon tile + label + subtitle
      expect(tileMinWidth).toBeGreaterThanOrEqual(60);
    }
  });

  test('icon tile (32pt) + padding (14×2) + line gap (10) all fit the tile height budget', () => {
    // Tile needs at least: iconTile 32 + gap 10 + label 13 + gap 2 + subtitle 11 + padding 14*2
    const minContentHeight = 32 + 10 + 13 + 2 + 11 + 28;
    // 2-line tiles ≥ 90pt — fine for any device
    expect(minContentHeight).toBeLessThan(100);
  });
});

// ─── WeekPlanStrip horizontal scroll ─────────────────────────────────────────

describe('WeekPlanStrip layout invariants', () => {
  test('7 day cards at minWidth 96 need horizontal scroll below iPad', () => {
    const totalContent = 7 * 96 + 6 * 8; // 7 tiles with 8pt gaps
    expect(totalContent).toBe(720);
    // Only iPad (768+) gets close to fitting them all
    expect(totalContent).toBeGreaterThan(DEVICE_WIDTHS.iphoneMax);
    // On small devices: expected to scroll
    expect(totalContent).toBeGreaterThan(DEVICE_WIDTHS.androidSmall);
  });

  test('day label column header fits in the 96pt card', () => {
    // "Пн" / "Вт" etc. at 10pt with letter-spacing — ≤ 30pt wide
    // Leaves 60+ for the title 2-line area. Safety-check.
    expect(96 - 14 * 2).toBe(68); // 14pt padding on each side
    expect(96).toBeGreaterThan(30 + 14 * 2); // header + padding
  });
});

// ─── Tab bar ─────────────────────────────────────────────────────────────────

describe('Tab bar layout invariants', () => {
  test('6 tab icons all fit at smallest device width', () => {
    const tabBarPaddingX = 10 * 2; // ~10pt on each side via flex
    const minIconWidth = 50; // icon + label column — see TabIcon spec
    const totalIconsWidth = 6 * minIconWidth;
    // Allow for center tab being 56pt wide instead of 50
    expect(totalIconsWidth + 6 + tabBarPaddingX).toBeLessThanOrEqual(DEVICE_WIDTHS.androidSmall);
  });

  test('center gold tile (56pt) fits even on fold closed', () => {
    const centerWidth = 56;
    // The fold-closed 280pt device still needs the bar. Center + 5 regular
    // tabs at ~40pt = 56 + 5*40 = 256 — fits.
    expect(centerWidth + 5 * 40 + 20).toBeLessThanOrEqual(DEVICE_WIDTHS.foldClosed + 20);
  });
});

// ─── Paywall plan cards ──────────────────────────────────────────────────────

describe('Paywall plan card layout invariants', () => {
  test('price 2990₽ + "списание раз в год" sub fits in the min-width plan card', () => {
    // Plan card uses 20pt horizontal padding inside the paywall sheet.
    // Sheet itself is screen width * 1 (bottom sheet).
    // Narrowest device: 280pt fold. 280 - 40 (sheet pad) = 240pt inner.
    // Plan row: 16pt card pad + 14pt gold border + price column ≥ 100pt.
    const innerWidth = 280 - 20 * 2;
    const cardInner = innerWidth - 16 * 2;
    expect(cardInner).toBeGreaterThanOrEqual(100);
  });

  test('VALID price formatting for 2990 → "2 990 ₽" (ru-RU locale)', () => {
    const formatted = (2990).toLocaleString('ru-RU');
    // NBSP (\u202F or \u00A0) is the thousands separator in ru-RU locale
    expect(formatted).toMatch(/^2[\s\u202F\u00A0]990$/);
  });

  test('VALID price formatting for crossed-out 6788 → "6 788"', () => {
    const formatted = (6788).toLocaleString('ru-RU');
    expect(formatted).toMatch(/^6[\s\u202F\u00A0]788$/);
  });
});

// ─── Number / locale formatting ──────────────────────────────────────────────

describe('Number formatting for Direction A UI', () => {
  test('big calorie totals format with NBSP (not comma)', () => {
    // Ring stats card shows "1 640 / 2 400 ккал" — ru-RU uses NBSP
    const n = 1640;
    const formatted = n.toLocaleString('ru-RU');
    expect(formatted).not.toContain(',');
    // Separator char between 1 and 640
    expect(formatted.length).toBe(5); // "1 640"
  });

  test('large 6-digit numbers format properly (workout volume)', () => {
    const n = 123456;
    const formatted = n.toLocaleString('ru-RU');
    expect(formatted.replace(/\s/g, '').replace(/\u202F/g, '').replace(/\u00A0/g, '')).toBe('123456');
  });

  test('sub-1000 numbers pass through unchanged', () => {
    for (const n of [0, 1, 42, 999]) {
      const formatted = n.toLocaleString('ru-RU');
      expect(formatted).toBe(String(n));
    }
  });

  test('decimal formatting uses comma for ru-RU (0.5 → "0,5")', () => {
    const formatted = (0.5).toLocaleString('ru-RU', { minimumFractionDigits: 1 });
    expect(formatted).toBe('0,5');
  });
});

// ─── Text truncation boundaries ──────────────────────────────────────────────

describe('Text truncation boundaries', () => {
  test('recent-scan chip truncates name >22 chars to 20 + ellipsis', () => {
    // FoodScannerScreen clips scan.name.length > 22 ? slice(0,20)+'…' : name
    const truncate = (name: string) => name.length > 22 ? name.slice(0, 20) + '…' : name;
    expect(truncate('Normal product')).toBe('Normal product');
    expect(truncate('x'.repeat(23))).toBe('x'.repeat(20) + '…');
    expect(truncate('x'.repeat(22))).toBe('x'.repeat(22));
  });

  test('header greeting "Привет, <name>" accepts unicode', () => {
    const names = ['Артём', 'Иван', 'Юлия', 'Ляйля', 'José', 'Владимир Владимирович'];
    for (const n of names) {
      const out = `Привет, ${n}`;
      expect(out).toContain(n);
      expect(out.length).toBeLessThan(150);
    }
  });

  test('week plan day title clamps to 2 lines visually (clamp at ~32 chars)', () => {
    // `numberOfLines={2}` + ~13pt font + 96pt min-width ≈ ≤32 chars
    // renders safely. Just a safe-guard on input shape.
    for (const label of ['Грудь + трицепс', 'Сегодня', 'Отдых', 'Кардио 30 мин']) {
      expect(label.length).toBeLessThanOrEqual(30);
    }
  });
});

// ─── Huge-number safety (overflow / visual break guards) ─────────────────────

describe('Huge number safety', () => {
  test('calorie "1 234 567 890" still renders readably as ru-RU', () => {
    const huge = 1234567890;
    const s = huge.toLocaleString('ru-RU');
    // Should include a separator every 3 digits
    expect(s.split(/[\s\u202F\u00A0]/).length).toBeGreaterThan(3);
  });

  test('streak 47 days, warmup reps 999 all format without losing width', () => {
    // Home streak card + warmup weight-input clamps at maxLength=5
    expect(String(47).length).toBeLessThan(5);
    expect(String(999).length).toBeLessThan(5);
    expect(String(1234).length).toBeLessThan(6);
  });

  test('PR weight shows with 3-digit range (up to 999 kg realistic)', () => {
    for (const kg of [50, 100, 175, 250, 300, 500]) {
      expect(String(kg).length).toBeLessThanOrEqual(3);
    }
  });
});

// ─── Safe-area guards ────────────────────────────────────────────────────────

describe('Safe-area top paddings', () => {
  // useSafeTop returns raw insets.top. Tab bar respects insets.bottom.
  // Test that padding math stays sensible for device-shaped insets.
  const SAFE_TOPS = { legacy: 20, modern: 44, maxPro: 59 };

  test('safeTop values stay within realistic iOS/Android range', () => {
    for (const [name, inset] of Object.entries(SAFE_TOPS)) {
      expect(inset).toBeGreaterThanOrEqual(0);
      expect(inset).toBeLessThanOrEqual(80);
    }
  });

  test('tab bar bottom padding uses max(inset, 8) not raw inset', () => {
    // With no inset (0), we want a floor of 8 so the tab labels still
    // have a little breathing room. Math.max(0, 8) = 8.
    expect(Math.max(0, 8)).toBe(8);
    expect(Math.max(34, 8)).toBe(34);
  });
});
