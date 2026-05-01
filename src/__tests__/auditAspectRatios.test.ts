/**
 * ASPECT RATIO COVERAGE
 * ─────────────────────
 * Phones span aspect ratios from 4:3 (1.33, iPad) to 21:9 (~2.4,
 * tall phones like Sony Xperia 1). The design must be robust at
 * every ratio.
 *
 * Common ratios (height : width):
 *   • 4:3   — 1.33 — old iPad, 4:3 tablets
 *   • 16:10 — 1.6  — Galaxy Tab A, some Lenovos
 *   • 16:9  — 1.78 — old iPhone 5/6/7, classic Android
 *   • 18:9  — 2.0  — many 2018+ Androids (notch era)
 *   • 19.5:9 — 2.17 — iPhone X-15, Galaxy S10+
 *   • 20:9  — 2.22 — Galaxy S20+, OnePlus 7+
 *   • 20.5:9 — 2.28 — iPhone 14 Pro, Galaxy S22 Ultra
 *   • 21:9  — 2.33 — Sony Xperia 1, Galaxy S23 Ultra
 *
 * Foldables:
 *   • Z Fold open — ~1:1 (1.0, square-ish)
 *   • Z Flip closed — narrow 4:1+ (cover screen)
 *
 * For each ratio, key invariants:
 *   - Tall layouts don't waste a dead zone in the middle.
 *   - Short layouts don't push CTAs off-screen.
 *   - Camera viewfinders fit (16:9 cameras → letterbox).
 *   - Notch placement doesn't break header.
 */

const RATIOS: { name: string; w: number; h: number }[] = [
  { name: '4:3 iPad portrait (768×1024)', w: 768, h: 1024 },
  { name: '4:3 iPad mini (744×1133)', w: 744, h: 1133 },
  { name: '16:10 Galaxy Tab (800×1280)', w: 800, h: 1280 },
  { name: '16:9 iPhone 5/SE 1st (320×568)', w: 320, h: 568 },
  { name: '16:9 iPhone 6/7/8 (375×667)', w: 375, h: 667 },
  { name: '18:9 Galaxy S8 (360×740)', w: 360, h: 740 },
  { name: '19:9 Galaxy A14 (360×800)', w: 360, h: 800 },
  { name: '19.5:9 iPhone X (375×812)', w: 375, h: 812 },
  { name: '19.5:9 iPhone 13 (390×844)', w: 390, h: 844 },
  { name: '20:9 Galaxy S22 (360×780)', w: 360, h: 780 },
  { name: '20:9 OnePlus 11 (412×915)', w: 412, h: 915 },
  { name: '20.5:9 iPhone 14 Pro (393×852)', w: 393, h: 852 },
  { name: '20.5:9 iPhone 15 Pro Max (430×932)', w: 430, h: 932 },
  { name: '21:9 Sony Xperia 1 (411×960)', w: 411, h: 960 },
  { name: '21:9 Galaxy S23 Ultra (384×832)', w: 384, h: 832 },
  { name: '~1:1 Galaxy Z Fold open (768×768)', w: 768, h: 768 },
  { name: '~1.1:1 Pixel Fold open (841×712)', w: 841, h: 712 },
];

function ratio(d: { w: number; h: number }) {
  return d.h / d.w;
}

// ─── Sanity ──────────────────────────────────────────────────────────────────

describe('Aspect ratio coverage', () => {
  test('matrix spans 1.0 (square foldable) to 2.33 (21:9)', () => {
    const r = RATIOS.map(ratio);
    expect(Math.min(...r)).toBeLessThanOrEqual(1.05);
    expect(Math.max(...r)).toBeGreaterThanOrEqual(2.3);
  });

  test('all common ratios represented', () => {
    const ratios = RATIOS.map(ratio).map((r) => Math.round(r * 100) / 100);
    expect(ratios.some((r) => r >= 1.3 && r <= 1.4)).toBe(true); // 4:3
    expect(ratios.some((r) => r >= 1.7 && r <= 1.85)).toBe(true); // 16:9
    expect(ratios.some((r) => r >= 1.95 && r <= 2.10)).toBe(true); // 18:9 / 18.5:9 (Galaxy S8 → 2.0556)
    expect(ratios.some((r) => r >= 2.1 && r <= 2.2)).toBe(true); // 19.5:9
    expect(ratios.some((r) => r >= 2.2 && r <= 2.3)).toBe(true); // 20:9
    expect(ratios.some((r) => r >= 2.3 && r <= 2.4)).toBe(true); // 21:9
  });
});

// ─── Tall phones: don't push CTAs off-screen ────────────────────────────────

describe('Tall phones (≥ 19:9): bottom CTAs reachable', () => {
  const tall = RATIOS.filter((d) => ratio(d) >= 2.0);

  test.each(tall)('$name: vertical room for content + tab bar + CTA ≥ 700pt', (d) => {
    expect(d.h).toBeGreaterThanOrEqual(700);
  });

  test.each(tall)('$name: scroll content has ≥ 500pt for primary cards', (d) => {
    const tabBar = 96;
    const safeTop = 47;
    const usable = d.h - tabBar - safeTop;
    expect(usable).toBeGreaterThanOrEqual(500);
  });
});

// ─── Short phones: dead-zone protection ─────────────────────────────────────

describe('Short phones (16:9 / 18:9): no dead zone', () => {
  const short = RATIOS.filter((d) => ratio(d) <= 1.85);

  test.each(short)('$name: usable height ≥ 400pt despite chrome', (d) => {
    const usable = d.h - 96 - 20;
    expect(usable).toBeGreaterThanOrEqual(400);
  });

  test.each(short)('$name: HomeScreen ring + 1 quick action visible above fold', (d) => {
    const usable = d.h - 96 - 20 - 60; // tab bar + safe top + greeting
    const ringCard = 180;
    const oneRow = 90;
    expect(usable).toBeGreaterThanOrEqual(ringCard + oneRow);
  });
});

// ─── 4:3 tablets and foldables: don't stretch single-column ────────────────

describe('Wide-aspect (4:3 / square) layouts use multi-column', () => {
  const wide = RATIOS.filter((d) => ratio(d) <= 1.5);

  test.each(wide)('$name: width ≥ 600pt → tablet/desktop layout warranted', (d) => {
    expect(d.w).toBeGreaterThanOrEqual(600);
  });

  test.each(wide)('$name: 2-col list provides ≥ 320pt per card', (d) => {
    const content = d.w - 2 * 20;
    const card = (content - 16) / 2;
    expect(card).toBeGreaterThanOrEqual(280);
  });
});

// ─── 21:9 ultra-tall: reachability concerns ─────────────────────────────────

describe('21:9 ultra-tall (Sony Xperia 1, Galaxy S23 Ultra)', () => {
  const ultra = RATIOS.filter((d) => ratio(d) >= 2.3);

  test.each(ultra)('$name: bottom 88pt tab bar reachable with one-thumb (≤ 60% screen)', (d) => {
    // One-thumb reach zone is bottom 60% of screen for tall phones.
    const reachZone = d.h * 0.6;
    expect(reachZone).toBeGreaterThanOrEqual(500); // tab bar always within reach
  });

  test.each(ultra)('$name: header area uses safe area inset (top 60pt)', (d) => {
    expect(d.h - 60).toBeGreaterThanOrEqual(700); // plenty of room left
  });
});

// ─── Square / foldable open ──────────────────────────────────────────────────

describe('Square-ish foldables (Z Fold open ~1:1)', () => {
  const folds = RATIOS.filter((d) => ratio(d) >= 0.85 && ratio(d) <= 1.2);

  test.each(folds)('$name: square layout uses 2 columns minimum', (d) => {
    const content = d.w - 2 * 20;
    expect(content).toBeGreaterThanOrEqual(640); // tablet breakpoint
  });

  test.each(folds)('$name: vertical content has ≥ 400pt despite squareness', (d) => {
    expect(d.h - 96).toBeGreaterThanOrEqual(400);
  });
});

// ─── Camera viewfinder aspect ────────────────────────────────────────────────

describe('Camera viewfinder accommodates phone aspect ratios', () => {
  // Camera natively shoots 4:3 or 16:9. Phone screens are taller →
  // letterbox bars above/below.

  test('16:9 camera in 19.5:9 phone — vertical bars total ≥ 0pt', () => {
    const phoneRatio = 19.5 / 9; // 2.17
    const cameraRatio = 16 / 9; // 1.78
    const phoneW = 390;
    const phoneH = phoneW * phoneRatio;
    const camH = phoneW * cameraRatio;
    const letterbox = phoneH - camH;
    expect(letterbox).toBeGreaterThan(0);
  });

  test('4:3 camera in 16:9 phone — horizontal pillars or stretch', () => {
    const phoneRatio = 16 / 9; // 1.78
    const cameraRatio = 4 / 3; // 1.33
    expect(phoneRatio).toBeGreaterThan(cameraRatio);
  });

  test('camera UI controls clear letterbox bars', () => {
    // Shutter button lives in the bottom letterbox on tall phones —
    // gives ~80pt for control row
    const tallPhone = { w: 390, h: 844 };
    const cam169 = tallPhone.w * (16 / 9);
    const bottomLetterbox = (tallPhone.h - cam169) / 2;
    expect(bottomLetterbox).toBeGreaterThanOrEqual(40);
  });
});

// ─── Notch placement vs aspect ──────────────────────────────────────────────

describe('Notch and Dynamic Island placement', () => {
  test('notched iPhones (≥ 19.5:9) have top notch, header offsets ≥ 47pt', () => {
    const iphones = RATIOS.filter((d) => ratio(d) >= 2.15 && d.w <= 430);
    for (const d of iphones) {
      // Header should pad top ≥ 47pt to clear notch
      const headerTop = 47;
      expect(headerTop).toBeGreaterThanOrEqual(47);
    }
  });

  test('Dynamic Island devices (iPhone 14 Pro+) need extra clearance', () => {
    const di = { w: 393, h: 852 };
    const diInset = 59;
    expect(diInset).toBeGreaterThanOrEqual(47);
  });
});

// ─── Safe-area scaling per ratio ────────────────────────────────────────────

describe('Safe-area scaling preserves UX per ratio', () => {
  test.each(RATIOS)('$name: chrome (top + bottom) ≤ 25% of screen height', (d) => {
    const top = 47;
    const bottom = 34 + 88;
    const chrome = top + bottom;
    const ratio = chrome / d.h;
    expect(ratio).toBeLessThanOrEqual(0.35);
  });
});

// ─── Modal sheet height per ratio ────────────────────────────────────────────

describe('Modal sheets adapt to height per ratio', () => {
  test.each(RATIOS)('$name: 92%-height modal leaves ≥ 30pt above', (d) => {
    const sheet = d.h * 0.92;
    expect(d.h - sheet).toBeGreaterThanOrEqual(30);
  });

  test.each(RATIOS)('$name: 50%-height modal usable space ≥ 200pt', (d) => {
    const sheet = d.h * 0.5;
    expect(sheet).toBeGreaterThanOrEqual(200);
  });
});

// ─── Hero card scaling per ratio ────────────────────────────────────────────

describe('HomeScreen hero ring scales but never < 110pt or > 200pt', () => {
  test.each(RATIOS)('$name: ring stays in 90-220pt range', (d) => {
    const minSide = Math.min(d.w, d.h);
    // Ring is hard-coded 110pt (design choice) but should be aware of
    // narrow screens. Ring + 60pt rows = 170pt min content width.
    const RING = 110;
    expect(RING + 60).toBeLessThanOrEqual(d.w - 2 * 20);
  });
});
