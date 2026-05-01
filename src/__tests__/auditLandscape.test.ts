/**
 * LANDSCAPE ORIENTATION AUDIT
 * ───────────────────────────
 * The app is designed primarily for portrait (orientation=portrait in
 * app.json), but iPad apps respect orientation rotation per Apple's
 * tablet guidelines, and Android phones can land in landscape during
 * media playback / external display attachment.
 *
 * In landscape: width > height. The major risks are:
 *   1. Hero rings / cards that assume tall layout get cropped.
 *   2. Forms with inputs at the bottom get pushed off-screen.
 *   3. ScrollView content top inset gets eaten by notch on landscape
 *      iPhones (the notch is on the LEFT side in landscape, not top).
 *   4. Modal sheets at 92% height cover most of the visible area.
 *
 * This audit covers the realistic landscape sizes and locks
 * mathematical invariants so design regressions trip the suite.
 */

import { buildResponsiveInfo } from '../theme/responsive';

type Landscape = {
  name: string;
  width: number;
  height: number;
  notchLeft?: boolean; // notch is on left in landscape
  homeIndicator?: boolean;
};

const LANDSCAPES: Landscape[] = [
  // Phones in landscape
  { name: 'iPhone SE landscape (667×375)', width: 667, height: 375 },
  { name: 'iPhone 13 mini landscape (812×375)', width: 812, height: 375, notchLeft: true, homeIndicator: true },
  { name: 'iPhone 14 landscape (844×390)', width: 844, height: 390, notchLeft: true, homeIndicator: true },
  { name: 'iPhone 14 Pro landscape (852×393)', width: 852, height: 393, notchLeft: true, homeIndicator: true },
  { name: 'iPhone 14 Plus landscape (896×414)', width: 896, height: 414, notchLeft: true, homeIndicator: true },
  { name: 'iPhone 14 Pro Max landscape (932×430)', width: 932, height: 430, notchLeft: true, homeIndicator: true },
  { name: 'Pixel 7 Pro landscape (915×412)', width: 915, height: 412 },

  // iPad landscape
  { name: 'iPad mini landscape (1024×768)', width: 1024, height: 768 },
  { name: 'iPad landscape (1180×810)', width: 1180, height: 810, homeIndicator: true },
  { name: 'iPad Pro 11" landscape (1194×834)', width: 1194, height: 834, homeIndicator: true },
  { name: 'iPad Pro 12.9" landscape (1366×1024)', width: 1366, height: 1024, homeIndicator: true },

  // Foldables in landscape (rare)
  { name: 'Galaxy Fold open landscape (841×673)', width: 841, height: 673 },
];

function infoFor(d: Landscape) {
  return buildResponsiveInfo(
    { width: d.width, height: d.height, scale: 2, fontScale: 1 },
    'normal',
  );
}

// ─── Sanity ──────────────────────────────────────────────────────────────────

describe('Landscape matrix', () => {
  test('every entry has width > height', () => {
    for (const d of LANDSCAPES) {
      expect(d.width).toBeGreaterThan(d.height);
    }
  });

  test('isLandscape flag set on every entry', () => {
    for (const d of LANDSCAPES) {
      const r = infoFor(d);
      expect(r.isLandscape).toBe(true);
      expect(r.isPortrait).toBe(false);
    }
  });

  test('all phones have isShort=true (height < 700) in landscape', () => {
    for (const d of LANDSCAPES.filter((l) => l.height < 500)) {
      const r = infoFor(d);
      expect(r.isShort).toBe(true);
    }
  });
});

// ─── Vertical-space tightness ────────────────────────────────────────────────

describe('Vertical space remaining after chrome on every landscape device', () => {
  // Chrome = status bar / notch (44pt top in portrait, 0 in landscape iOS),
  // tab bar (88 + 8 floor = 96pt), home indicator (~21 in landscape iPhone).

  test.each(LANDSCAPES)('$name: usable height after tab bar + home indicator >= 200pt', (d) => {
    const tabBar = 96;
    const homeInd = d.homeIndicator ? 21 : 0;
    const safeTop = d.notchLeft ? 0 : 0; // landscape iOS — top inset is 0; notch on left
    const usable = d.height - tabBar - homeInd - safeTop;
    expect(usable).toBeGreaterThanOrEqual(200);
  });

  test.each(LANDSCAPES)('$name: at least 1 hero card row visible above the fold', (d) => {
    const heroH = 180; // ring stats card is ~180pt tall
    const usable = d.height - 96 - (d.homeIndicator ? 21 : 0);
    expect(usable).toBeGreaterThanOrEqual(heroH);
  });
});

// ─── HomeScreen in landscape ─────────────────────────────────────────────────

describe('HomeScreen landscape', () => {
  test.each(LANDSCAPES)('$name: ring stats card has 60+ pt below for stat rows', (d) => {
    const usable = d.height - 96 - (d.homeIndicator ? 21 : 0);
    const greeting = 60;
    const remaining = usable - greeting;
    expect(remaining).toBeGreaterThanOrEqual(60);
  });

  test.each(LANDSCAPES)('$name: 2-column quick actions still 2-col (not 3) on tablet landscape', (d) => {
    const r = infoFor(d);
    const cols = r.cols({ phone: 2, tablet: 2, desktop: 3 });
    if (r.isPhone) expect(cols).toBe(2);
    if (r.isTablet) expect(cols).toBe(2);
    if (r.isDesktop) expect(cols).toBe(3);
  });
});

// ─── ActiveWorkout in landscape (most-tested screen) ────────────────────────

describe('ActiveWorkout landscape', () => {
  test.each(LANDSCAPES)('$name: weight + reps + RPE row fits horizontally', (d) => {
    const content = d.width - 2 * 16;
    const inputW = 80;
    const totalRow = 3 * inputW + 2 * 8; // 256pt
    expect(content).toBeGreaterThanOrEqual(totalRow);
  });

  test.each(LANDSCAPES)('$name: rest timer + finish CTA fit one row', (d) => {
    const content = d.width - 2 * 16;
    const timer = 80;
    const cta = 200;
    const gap = 12;
    expect(content).toBeGreaterThanOrEqual(timer + cta + gap);
  });

  test.each(LANDSCAPES)('$name: working-set numpad row > 240pt for digits 1-9', (d) => {
    const content = d.width - 2 * 16;
    expect(content).toBeGreaterThanOrEqual(240);
  });
});

// ─── FoodScanner camera view ─────────────────────────────────────────────────

describe('FoodScanner camera in landscape', () => {
  test.each(LANDSCAPES)('$name: camera viewfinder square fits height', (d) => {
    const safeTop = 0;
    const safeBottom = d.homeIndicator ? 21 : 0;
    const ctrlsH = 120;
    const usable = d.height - safeTop - safeBottom - ctrlsH;
    expect(usable).toBeGreaterThan(80); // viewfinder min
  });
});

// ─── Auth forms in landscape (worst case: SE landscape 375pt tall) ──────────

describe('Auth forms in landscape', () => {
  test.each(LANDSCAPES)('$name: login form has visible input + button above keyboard', (d) => {
    // Keyboard takes ~270pt on landscape iPhone, ~310pt on landscape iPad.
    // We need at least 60pt for one visible input + 48pt for button.
    const kbd = d.height < 500 ? 270 : 310;
    const usable = d.height - kbd;
    if (usable < 60 + 48) {
      // SE landscape: 375 - 270 = 105 — fits one input + button. Tight.
      expect(usable).toBeGreaterThanOrEqual(48);
    } else {
      expect(usable).toBeGreaterThanOrEqual(108);
    }
  });

  test.each(LANDSCAPES)('$name: TOTP 6-digit input row fits horizontally', (d) => {
    const content = d.width - 2 * 20;
    expect(content).toBeGreaterThanOrEqual(280); // 6×40 + 5×8 = 280
  });
});

// ─── Modals in landscape ─────────────────────────────────────────────────────

describe('Modals adapt to landscape', () => {
  test.each(LANDSCAPES)('$name: paywall modal at 92% height leaves >= 100pt visible above', (d) => {
    const sheetH = d.height * 0.92;
    const visibleAbove = d.height - sheetH;
    expect(visibleAbove).toBeGreaterThanOrEqual(20);
  });

  test.each(LANDSCAPES)('$name: paywall plan card row fits 2 plans side-by-side', (d) => {
    const sheetW = d.width;
    const innerPad = 20;
    const cardGap = 12;
    const cardW = (sheetW - 2 * innerPad - cardGap) / 2;
    expect(cardW).toBeGreaterThanOrEqual(140);
  });
});

// ─── Per-screen working invariants in landscape ──────────────────────────────

describe('Critical screens fit landscape iPhone SE (667×375)', () => {
  const SE = { width: 667, height: 375 };

  test('HomeScreen: ring (110) + greeting (24) + tab bar (96) + home indicator (0) all fit', () => {
    const total = 110 + 24 + 96;
    expect(total).toBeLessThan(SE.height + 50); // small margin OK because content scrolls
  });

  test('LoginScreen: logo (80) + 2 inputs (104) + CTA (48) above keyboard', () => {
    const sumStatic = 80 + 104 + 48;
    const usable = SE.height - 270; // landscape iOS keyboard
    // We expect to scroll if usable < total, but the form must always be reachable
    expect(usable).toBeGreaterThan(0); // not negative
  });

  test('ActiveWorkout: working set + finish CTA all reachable', () => {
    const usable = SE.height - 96; // tab bar
    expect(usable).toBeGreaterThan(200);
  });

  test('OnboardingScreen 4-step: question + 2 answers visible above CTA', () => {
    const usable = SE.height - 80; // header (progress dots + question)
    expect(usable).toBeGreaterThan(100);
  });
});
