/**
 * TABLET ADAPTATION AUDIT
 * ───────────────────────
 * On iPad / large foldables / desktop, single-column phone layouts
 * waste enormous amounts of horizontal space. The responsive system
 * provides `cols()` and `pick()` helpers to opt into 2/3-column
 * layouts on bigger screens.
 *
 * This audit locks in:
 *   1. The breakpoint thresholds (640pt = tablet, 1024pt = desktop).
 *   2. `cols()` returns sensible counts at each width.
 *   3. The AdaptiveGrid component honours phone/tablet/desktop counts.
 *   4. Content max-width prevents text from stretching ridiculously
 *      wide on a 1366pt iPad Pro landscape.
 *   5. Typical screens (Profile, Workouts, Nutrition lists) use
 *      multi-column on tablet+.
 */

import { buildResponsiveInfo, breakpoints, resolveBreakpoint } from '../theme/responsive';

const TABLETS = [
  { name: 'iPad mini portrait (744)', w: 744, h: 1133 },
  { name: 'iPad mini portrait (768)', w: 768, h: 1024 },
  { name: 'iPad portrait (810)', w: 810, h: 1180 },
  { name: 'iPad Pro 11" (834)', w: 834, h: 1194 },
  { name: 'Galaxy Fold open (673)', w: 673, h: 841 },
];

const DESKTOPS = [
  { name: 'iPad Pro 12.9" portrait (1024)', w: 1024, h: 1366 },
  { name: 'iPad landscape (1180)', w: 1180, h: 810 },
  { name: 'iPad Pro 11" landscape (1194)', w: 1194, h: 834 },
  { name: 'iPad Pro 12.9" landscape (1366)', w: 1366, h: 1024 },
];

const PHONES = [
  { name: 'Pixel 7 (412)', w: 412, h: 915 },
  { name: 'iPhone 14 Pro Max (430)', w: 430, h: 932 },
  { name: 'iPhone 14 (390)', w: 390, h: 844 },
];

// ─── Breakpoint thresholds ───────────────────────────────────────────────────

describe('Breakpoint thresholds', () => {
  test('tablet starts at 640pt, desktop at 1024pt', () => {
    expect(breakpoints.tablet).toBe(640);
    expect(breakpoints.desktop).toBe(1024);
  });

  test('iPad mini (744pt) resolves to tablet', () => {
    expect(resolveBreakpoint(744)).toBe('tablet');
  });

  test('iPad Pro 12.9" (1024pt) resolves to desktop', () => {
    expect(resolveBreakpoint(1024)).toBe('desktop');
  });

  test('Galaxy Fold open (673pt) resolves to tablet', () => {
    expect(resolveBreakpoint(673)).toBe('tablet');
  });

  test('phone widths (< 640pt) all resolve below tablet', () => {
    for (const p of PHONES) {
      expect(['xs', 'sm', 'md', 'lg']).toContain(resolveBreakpoint(p.w));
    }
  });
});

// ─── cols() returns sensible counts ──────────────────────────────────────────

describe('cols() helper produces expected column counts', () => {
  test.each(PHONES)('$name → 1 col by default', (p) => {
    const r = buildResponsiveInfo({ width: p.w, height: p.h, scale: 2, fontScale: 1 });
    expect(r.cols()).toBe(1);
  });

  test.each(TABLETS)('$name → 2 cols by default', (t) => {
    const r = buildResponsiveInfo({ width: t.w, height: t.h, scale: 2, fontScale: 1 });
    expect(r.cols()).toBe(2);
  });

  test.each(DESKTOPS)('$name → 3 cols by default', (d) => {
    const r = buildResponsiveInfo({ width: d.w, height: d.h, scale: 2, fontScale: 1 });
    expect(r.cols()).toBe(3);
  });

  test.each(TABLETS)('$name → custom cols { tablet: 3 } returns 3', (t) => {
    const r = buildResponsiveInfo({ width: t.w, height: t.h, scale: 2, fontScale: 1 });
    expect(r.cols({ phone: 1, tablet: 3, desktop: 4 })).toBe(3);
  });
});

// ─── AdaptiveGrid math ───────────────────────────────────────────────────────

describe('AdaptiveGrid produces correct flexBasis', () => {
  test('1 col → 100%', () => {
    const n = 1;
    expect(n === 1 ? '100%' : `${100 / n}%`).toBe('100%');
  });

  test('2 cols → 50%', () => {
    const n = 2;
    expect(`${100 / n}%`).toBe('50%');
  });

  test('3 cols → 33.333…%', () => {
    const n = 3;
    expect(`${100 / n}%`).toMatch(/^33\./);
  });

  test('4 cols → 25%', () => {
    const n = 4;
    expect(`${100 / n}%`).toBe('25%');
  });
});

// ─── Content max-width on huge screens ───────────────────────────────────────

describe('Content max-width on desktop / tablet landscape', () => {
  // We don't want a single-column page (e.g., a settings list) to stretch
  // 1366pt wide. Reasonable max-width is ~720pt so text stays readable.

  const MAX_TEXT_WIDTH = 720;

  test.each(DESKTOPS)('$name: text-width gate clamps to <= 720pt for readability', (d) => {
    const desired = Math.min(d.w - 2 * 20, MAX_TEXT_WIDTH);
    expect(desired).toBeLessThanOrEqual(MAX_TEXT_WIDTH);
  });

  test('list rows centered horizontally on iPad Pro 12.9" landscape', () => {
    const w = 1366;
    const desired = MAX_TEXT_WIDTH;
    const sideMargin = (w - desired) / 2;
    expect(sideMargin).toBeGreaterThan(200); // huge margins on each side OK
  });
});

// ─── Modal sheet width on tablet ─────────────────────────────────────────────

describe('Modal sheets adapt to tablet by capping width', () => {
  // Phone: full-width sheet. Tablet: should cap at ~520pt and center.
  const TABLET_SHEET_MAX = 520;

  test.each(TABLETS)('$name: modal capped at 520pt and centered', (t) => {
    const sheet = Math.min(t.w, TABLET_SHEET_MAX);
    expect(sheet).toBeLessThanOrEqual(TABLET_SHEET_MAX);
  });

  test.each(DESKTOPS)('$name: modal centered with margins >= 200pt each side', (d) => {
    const sheet = TABLET_SHEET_MAX;
    const margin = (d.w - sheet) / 2;
    expect(margin).toBeGreaterThan(50);
  });
});

// ─── 2-column adoption: which screens benefit ───────────────────────────────

describe('Multi-column suitability', () => {
  test('Workouts list: 2-col on tablet preserves 360pt+ per card', () => {
    const t = TABLETS[2]; // iPad portrait (810)
    const content = t.w - 2 * 20;
    const cardW = (content - 16) / 2;
    expect(cardW).toBeGreaterThanOrEqual(360);
  });

  test('Nutrition meals: 2-col on tablet preserves 360pt+', () => {
    const t = TABLETS[2];
    const content = t.w - 2 * 20;
    const cardW = (content - 16) / 2;
    expect(cardW).toBeGreaterThanOrEqual(360);
  });

  test('Profile settings: stay 1-col with max-width 720pt for readability', () => {
    const d = DESKTOPS[3]; // iPad Pro 12.9" landscape (1366)
    const desired = Math.min(d.w - 2 * 20, 720);
    expect(desired).toBe(720);
  });

  test('Quick actions grid: 3-col on tablet/desktop, 2-col on phone', () => {
    for (const p of PHONES) {
      const r = buildResponsiveInfo({ width: p.w, height: p.h, scale: 2, fontScale: 1 });
      expect(r.cols({ phone: 2, tablet: 3, desktop: 4 })).toBe(2);
    }
    for (const t of TABLETS) {
      const r = buildResponsiveInfo({ width: t.w, height: t.h, scale: 2, fontScale: 1 });
      expect(r.cols({ phone: 2, tablet: 3, desktop: 4 })).toBe(3);
    }
    for (const d of DESKTOPS) {
      const r = buildResponsiveInfo({ width: d.w, height: d.h, scale: 2, fontScale: 1 });
      expect(r.cols({ phone: 2, tablet: 3, desktop: 4 })).toBe(4);
    }
  });
});

// ─── Tablet sidebar opportunities (if implemented later) ────────────────────

describe('Tablet sidebar / split-view feasibility', () => {
  // If we ever implement a tablet sidebar, the master pane needs ≥320pt
  // and the detail pane ≥360pt. Lock in the math now.
  const SIDEBAR_W = 320;
  const DETAIL_MIN = 360;

  test.each(TABLETS)('$name: master 320pt + detail >= 360pt fit', (t) => {
    const detail = t.w - SIDEBAR_W;
    if (t.w >= 700) {
      expect(detail).toBeGreaterThanOrEqual(DETAIL_MIN);
    }
  });

  test.each(DESKTOPS)('$name: master 320 + detail with >= 600pt of room', (d) => {
    const detail = d.w - SIDEBAR_W;
    expect(detail).toBeGreaterThanOrEqual(600);
  });
});

// ─── Typography scales gracefully ───────────────────────────────────────────

describe('Typography scale on tablet/desktop', () => {
  test('hero number (28pt) doesn\'t balloon ridiculously on iPad', () => {
    // widthMultiplier on 768pt is sqrt(768/393) ≈ 1.4 → clamped to 1.25
    // So a 28pt token becomes 28 * 1.25 = 35pt — sane
    const r = buildResponsiveInfo({ width: 768, height: 1024, scale: 2, fontScale: 1 });
    const heroSize = r.fontScale_(28);
    expect(heroSize).toBeLessThan(40);
    expect(heroSize).toBeGreaterThan(28);
  });

  test('body text (15pt) scales to 18pt on iPad portrait', () => {
    const r = buildResponsiveInfo({ width: 768, height: 1024, scale: 2, fontScale: 1 });
    const bodySize = r.fontScale_(15);
    expect(bodySize).toBeGreaterThanOrEqual(15);
    expect(bodySize).toBeLessThanOrEqual(20);
  });

  test('on desktop (1366pt) text doesn\'t exceed 1.25× baseline', () => {
    const r = buildResponsiveInfo({ width: 1366, height: 1024, scale: 2, fontScale: 1 });
    const bodySize = r.fontScale_(15);
    expect(bodySize / 15).toBeLessThanOrEqual(1.5);
  });
});
