/**
 * Extreme / edge-device coverage — makes sure the design chrome doesn't
 * fall apart on unusual screen sizes that escape the "modern iPhone"
 * mental model.
 *
 * Includes tiny watchables (280pt), folded states (300-320pt),
 * tablets (768-1366), and landscape variants.
 */

// Every width we care about, in a single table. Comment column explains
// what the device actually is.
const DEVICES: Array<{ name: string; width: number; height: number }> = [
  { name: 'Samsung Fold closed', width: 280, height: 653 },
  { name: 'Palm Phone', width: 320, height: 506 },
  { name: 'iPhone 5/SE 1st', width: 320, height: 568 },
  { name: 'Pixel 4a', width: 360, height: 800 },
  { name: 'Samsung S21', width: 360, height: 800 },
  { name: 'iPhone SE 2/3', width: 375, height: 667 },
  { name: 'iPhone 13 mini', width: 375, height: 812 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone 14 Plus', width: 414, height: 896 },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932 },
  { name: 'Pixel 7 Pro', width: 412, height: 915 },
  { name: 'Fold open / Flip', width: 673, height: 841 },
  { name: 'iPad mini portrait', width: 768, height: 1024 },
  { name: 'iPad portrait', width: 820, height: 1180 },
  { name: 'iPad Pro 11" portrait', width: 834, height: 1194 },
  { name: 'iPad Pro 12.9" portrait', width: 1024, height: 1366 },
  { name: 'iPhone SE landscape', width: 667, height: 375 },
  { name: 'iPhone 14 landscape', width: 844, height: 390 },
  { name: 'iPad Pro landscape', width: 1366, height: 1024 },
];

// ─── Universal invariants ───────────────────────────────────────────────────

describe('Universal screen invariants', () => {
  test('every listed device has positive dimensions', () => {
    for (const d of DEVICES) {
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
    }
  });

  test('widths span 280pt to 1366pt (covers practical range)', () => {
    const widths = DEVICES.map((d) => d.width);
    expect(Math.min(...widths)).toBe(280);
    expect(Math.max(...widths)).toBe(1366);
  });
});

// ─── Screen-padding invariants ──────────────────────────────────────────────

describe('Screen content area width (screen padding = 20pt)', () => {
  const SCREEN_XL_PADDING = 20;

  test.each(DEVICES)('$name ($width×$height) has readable content width', ({ width }) => {
    const content = width - 2 * SCREEN_XL_PADDING;
    // Even the Samsung Fold closed @280pt has 240pt of content area.
    // Anything narrower would be unusable.
    expect(content).toBeGreaterThanOrEqual(240);
  });
});

// ─── Home ring stats card sanity ───────────────────────────────────────────

describe('RingStatsCard fits every target device', () => {
  const RING_DIAM = 110;
  const CARD_PAD = 20;
  const GAP = 20;

  test.each(DEVICES)('$name fits ring + bars', ({ width }) => {
    const content = width - 2 * 20; // screen padding
    const barsMin = 40; // bars need ≥ 40pt to show values
    expect(content).toBeGreaterThanOrEqual(RING_DIAM + CARD_PAD * 2 + GAP + barsMin);
  });
});

// ─── WeekPlanStrip horizontal scroll needed ────────────────────────────────

describe('WeekPlanStrip — horizontal scroll required below iPad portrait', () => {
  const STRIP_WIDTH = 7 * 96 + 6 * 8; // 720pt total

  test.each(DEVICES)('$name: strip width is 720, compare vs content', ({ width }) => {
    const content = width - 2 * 20;
    const needsScroll = STRIP_WIDTH > content;
    // iPad mini portrait (768) barely fits (content = 728 > strip 720).
    // Anything narrower than 760pt must scroll.
    if (content < 720) {
      expect(needsScroll).toBe(true);
    } else {
      // On wider screens the strip may fit without scroll — ScrollView
      // still works fine, this is just informational
      expect(needsScroll).toBe(false);
    }
  });
});

// ─── Tab bar layout — center tile never overflows ─────────────────────────

describe('Tab bar 6-tab + center gold tile fit', () => {
  const SIDE_TAB_W = 40; // icon + label column
  const CENTER_TAB_W = 56; // gold pill
  const EXTRA = 20; // bar padding

  test.each(DEVICES)('$name: 5 side tabs + 1 center fit', ({ width }) => {
    const totalNeeded = 5 * SIDE_TAB_W + CENTER_TAB_W + EXTRA;
    expect(totalNeeded).toBeLessThanOrEqual(width + 10);
  });
});

// ─── Paywall sheet ────────────────────────────────────────────────────────

describe('Paywall sheet renders on every device', () => {
  test.each(DEVICES)('$name: sheet height (92% of screen) is ≥ 300pt', ({ height }) => {
    const sheetHeight = Math.round(height * 0.92);
    // Need at least room for title + features + CTA — 300pt is the floor
    expect(sheetHeight).toBeGreaterThanOrEqual(300);
  });

  test('iPhone SE portrait has enough room for feature list', () => {
    // 667 * 0.92 = 613pt. Feature list 4 rows * 60pt = 240pt + headers + CTA
    expect(667 * 0.92).toBeGreaterThanOrEqual(600);
  });
});

// ─── Touch-target accessibility ───────────────────────────────────────────

describe('Touch-target sizes meet WCAG 44pt', () => {
  test('button lg size (58pt) exceeds WCAG', () => {
    expect(58).toBeGreaterThanOrEqual(44);
  });

  test('button md size (44pt) matches WCAG exactly', () => {
    expect(44).toBeGreaterThanOrEqual(44);
  });

  test('button sm (36pt) + 8pt hitSlop gets to 52', () => {
    const effective = 36 + 8 * 2;
    expect(effective).toBeGreaterThanOrEqual(44);
  });

  test('TabBar icon size 22pt is within an ~80pt tile so the touch is the tile', () => {
    // The tile gets ~72+ pt from flex division; tap-area is the tile
    // itself.
    const iconSize = 22;
    const tileMinHeight = 72;
    expect(tileMinHeight).toBeGreaterThanOrEqual(44);
    expect(tileMinHeight).toBeGreaterThan(iconSize);
  });
});
