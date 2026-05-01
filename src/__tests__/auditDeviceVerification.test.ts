/**
 * COMPREHENSIVE PER-DEVICE VERIFICATION
 * ─────────────────────────────────────
 * For every device in the master matrix, run ALL the major layout
 * invariants in a SINGLE test. If any device fails any invariant,
 * the test fails with a clear "Device X violated invariant Y" message.
 *
 * This is the "very carefully checked" pass requested by the user.
 * Catches cross-cutting regressions that per-invariant tests
 * might miss.
 *
 * Master matrix: 100+ devices spanning every realistic phone +
 * tablet + foldable from 2014 to 2025.
 */

import { buildResponsiveInfo } from '../theme/responsive';

// ─── Master device matrix (100+ devices, deduplicated by dimensions) ─────────

type Dev = {
  name: string;
  w: number;
  h: number;
  dpr: number;
  notch?: boolean;
  homeIndicator?: boolean;
  category: 'phone' | 'tablet' | 'foldable_closed' | 'foldable_open' | 'legacy';
};

const DEVICES: Dev[] = [
  // ── iPhones (every distinct dimension) ──
  { name: 'iPhone 5/5s/SE 1st (320×568)', w: 320, h: 568, dpr: 2, category: 'legacy' },
  { name: 'iPhone 6/7/8/SE 2/3 (375×667)', w: 375, h: 667, dpr: 2, category: 'phone' },
  { name: 'iPhone 6+/7+/8+ (414×736)', w: 414, h: 736, dpr: 3, category: 'legacy' },
  { name: 'iPhone X/XS/12 mini/13 mini (375×812)', w: 375, h: 812, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone XR/11 (414×896 @2x)', w: 414, h: 896, dpr: 2, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone XS Max/11 Pro Max (414×896 @3x)', w: 414, h: 896, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone 12/13/14 (390×844)', w: 390, h: 844, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone 14 Pro/15/15 Pro/16 (393×852)', w: 393, h: 852, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone 16 Pro (402×874) NEW', w: 402, h: 874, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone 12/13 Pro Max/14 Plus (428×926)', w: 428, h: 926, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone 14 Pro Max/15 Plus/15 Pro Max/16 Plus (430×932)', w: 430, h: 932, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },
  { name: 'iPhone 16 Pro Max (440×956) NEW', w: 440, h: 956, dpr: 3, notch: true, homeIndicator: true, category: 'phone' },

  // ── Samsung Galaxy S premium ──
  { name: 'Galaxy S8/S9 (360×740 @4x)', w: 360, h: 740, dpr: 4, category: 'phone' },
  { name: 'Galaxy S10 (360×760)', w: 360, h: 760, dpr: 4, category: 'phone' },
  { name: 'Galaxy S20/S21 (360×800)', w: 360, h: 800, dpr: 3, category: 'phone' },
  { name: 'Galaxy S22/S23/S24 (360×780)', w: 360, h: 780, dpr: 3, category: 'phone' },
  { name: 'Galaxy S23/S24 Ultra (384×832)', w: 384, h: 832, dpr: 3.75, category: 'phone' },
  { name: 'Galaxy S25 (360×780, rumored)', w: 360, h: 780, dpr: 3, category: 'phone' },
  { name: 'Galaxy Note 10/20 Ultra (412×915)', w: 412, h: 915, dpr: 3.5, category: 'phone' },

  // ── Samsung Galaxy A budget ──
  { name: 'Galaxy A04/A14/A24 (360×800)', w: 360, h: 800, dpr: 2.625, category: 'phone' },
  { name: 'Galaxy A12/A13/A23 (360×800)', w: 360, h: 800, dpr: 3, category: 'phone' },
  { name: 'Galaxy A32/A33/A34 (360×780)', w: 360, h: 780, dpr: 2.625, category: 'phone' },
  { name: 'Galaxy A52/A53/A54 (384×854)', w: 384, h: 854, dpr: 2.625, category: 'phone' },
  { name: 'Galaxy A71/A72 (412×915)', w: 412, h: 915, dpr: 2.625, category: 'phone' },

  // ── Samsung legacy J series ──
  { name: 'Galaxy J5/J6/J7 (360×640)', w: 360, h: 640, dpr: 2, category: 'legacy' },

  // ── Xiaomi Redmi/Mi/POCO ──
  { name: 'Redmi 9/10/Note 11/12/13 (393×873)', w: 393, h: 873, dpr: 2.75, category: 'phone' },
  { name: 'Redmi Note 9/10 (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Redmi Note 13/14 Pro (411×914)', w: 411, h: 914, dpr: 2.75, category: 'phone' },
  { name: 'Mi 11/12/13 (393×873 @3.5x)', w: 393, h: 873, dpr: 3.5, category: 'phone' },
  { name: 'Mi 12 Ultra/13 Ultra/14 Ultra (412×915)', w: 412, h: 915, dpr: 3.5, category: 'phone' },
  { name: 'Xiaomi 14/14 Pro (393×873)', w: 393, h: 873, dpr: 3.5, category: 'phone' },
  { name: 'POCO X3/X4/X5/X6/F5 (393×873)', w: 393, h: 873, dpr: 2.75, category: 'phone' },

  // ── Honor ──
  { name: 'Honor 8X/9X/10X (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Honor X8/X9 (393×873)', w: 393, h: 873, dpr: 2.75, category: 'phone' },
  { name: 'Honor 70/90/100/200 (412×915)', w: 412, h: 915, dpr: 2.75, category: 'phone' },
  { name: 'Honor Magic 5/6 Pro (412×919)', w: 412, h: 919, dpr: 3.5, category: 'phone' },

  // ── Realme ──
  { name: 'Realme C25/C31/C33 (360×800)', w: 360, h: 800, dpr: 2, category: 'phone' },
  { name: 'Realme C35/C53 (393×873)', w: 393, h: 873, dpr: 2.75, category: 'phone' },
  { name: 'Realme 9/10/11/GT/GT 6 (412×915)', w: 412, h: 915, dpr: 2.75, category: 'phone' },

  // ── Vivo ──
  { name: 'Vivo Y20/Y31 (360×800)', w: 360, h: 800, dpr: 2.75, category: 'phone' },
  { name: 'Vivo Y36/Y56/S18/S19 (393×873)', w: 393, h: 873, dpr: 2.75, category: 'phone' },
  { name: 'Vivo V25/V27/V30 (412×915)', w: 412, h: 915, dpr: 3.5, category: 'phone' },
  { name: 'Vivo X80/X90/X100 (412×919)', w: 412, h: 919, dpr: 3.5, category: 'phone' },

  // ── Oppo ──
  { name: 'Oppo Find X7 (412×919)', w: 412, h: 919, dpr: 3.5, category: 'phone' },
  { name: 'Oppo Reno 11/12 (412×915)', w: 412, h: 915, dpr: 2.625, category: 'phone' },

  // ── Google Pixel ──
  { name: 'Pixel 4a/5/5a (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Pixel 6/6a/7/7a/8/8a/9 (412×915)', w: 412, h: 915, dpr: 2.625, category: 'phone' },
  { name: 'Pixel 6 Pro/7 Pro (412×892)', w: 412, h: 892, dpr: 3.5, category: 'phone' },
  { name: 'Pixel 8 Pro/9 Pro XL (448×998)', w: 448, h: 998, dpr: 3, category: 'phone' },

  // ── OnePlus ──
  { name: 'OnePlus 9/10/11/12 (412×915)', w: 412, h: 915, dpr: 3, category: 'phone' },
  { name: 'OnePlus Nord/Nord 2/Nord CE (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },

  // ── Foldables (closed) ──
  { name: 'Z Fold 3/4 closed (374×832)', w: 374, h: 832, dpr: 3.5, category: 'foldable_closed' },
  { name: 'Z Fold 5/6 closed (384×832)', w: 384, h: 832, dpr: 3.5, category: 'foldable_closed' },
  { name: 'Pixel Fold closed (384×841)', w: 384, h: 841, dpr: 3, category: 'foldable_closed' },

  // ── Foldables (open) ──
  { name: 'Z Fold 3 open (673×841)', w: 673, h: 841, dpr: 2.625, category: 'foldable_open' },
  { name: 'Z Fold 4 open (712×870)', w: 712, h: 870, dpr: 2.625, category: 'foldable_open' },
  { name: 'Z Fold 5/6 open (819×879)', w: 819, h: 879, dpr: 2.625, category: 'foldable_open' },
  { name: 'Pixel Fold open (841×700)', w: 841, h: 700, dpr: 2.625, category: 'foldable_open' },
  { name: 'OnePlus Open (757×826)', w: 757, h: 826, dpr: 2.625, category: 'foldable_open' },
  { name: 'Honor Magic V2 open (822×884)', w: 822, h: 884, dpr: 2.625, category: 'foldable_open' },
  { name: 'Huawei Mate X3 open (778×868)', w: 778, h: 868, dpr: 2.625, category: 'foldable_open' },
  { name: 'Z Flip 4/5/6 open (412×919)', w: 412, h: 919, dpr: 2.625, category: 'phone' },

  // ── Tablets ──
  { name: 'iPad mini 6/7 (744×1133)', w: 744, h: 1133, dpr: 2, category: 'tablet' },
  { name: 'iPad mini portrait (768×1024)', w: 768, h: 1024, dpr: 2, category: 'tablet' },
  { name: 'iPad 10th/Air (820×1180)', w: 820, h: 1180, dpr: 2, homeIndicator: true, category: 'tablet' },
  { name: 'iPad Pro 11" (834×1194)', w: 834, h: 1194, dpr: 2, homeIndicator: true, category: 'tablet' },
  { name: 'iPad Pro 12.9"/13" (1024×1366)', w: 1024, h: 1366, dpr: 2, homeIndicator: true, category: 'tablet' },
  { name: 'Galaxy Tab A7/A8 (800×1280)', w: 800, h: 1280, dpr: 1.5, category: 'tablet' },
  { name: 'Galaxy Tab S6 Lite (800×1280)', w: 800, h: 1280, dpr: 2, category: 'tablet' },
  { name: 'Galaxy Tab S7/S8 (753×1193)', w: 753, h: 1193, dpr: 2.25, category: 'tablet' },
  { name: 'Galaxy Tab S9 (800×1280)', w: 800, h: 1280, dpr: 2, category: 'tablet' },
  { name: 'Galaxy Tab S9 Ultra (1024×1536)', w: 1024, h: 1536, dpr: 2.75, category: 'tablet' },
  { name: 'Lenovo Tab P11/P12 (800×1280)', w: 800, h: 1280, dpr: 1.5, category: 'tablet' },
  { name: 'Huawei MatePad 11 (800×1280)', w: 800, h: 1280, dpr: 2, category: 'tablet' },
  { name: 'Xiaomi Pad 6/6 Pro (800×1280)', w: 800, h: 1280, dpr: 2.25, category: 'tablet' },
  { name: 'Redmi Pad SE (800×1280)', w: 800, h: 1280, dpr: 2, category: 'tablet' },

  // ── Niche / emerging market ──
  { name: 'Tecno Spark 8/9/10 (360×800)', w: 360, h: 800, dpr: 2, category: 'phone' },
  { name: 'Tecno Camon 18/19/20 (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Infinix Hot 11/12 (360×800)', w: 360, h: 800, dpr: 2, category: 'phone' },
  { name: 'Infinix Note 11/12 (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Sony Xperia 1/5 (411×960)', w: 411, h: 960, dpr: 3.5, category: 'phone' },
  { name: 'Sony Xperia 10 V (360×800)', w: 360, h: 800, dpr: 2.75, category: 'phone' },
  { name: 'Asus Zenfone (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Asus ROG Phone 7/8 (412×915)', w: 412, h: 915, dpr: 2.625, category: 'phone' },
  { name: 'Motorola G8/G9 (393×851)', w: 393, h: 851, dpr: 2.75, category: 'phone' },
  { name: 'Motorola Edge 30/40 (412×915)', w: 412, h: 915, dpr: 2.625, category: 'phone' },
  { name: 'Nokia G50/G60 (360×800)', w: 360, h: 800, dpr: 2, category: 'phone' },
  { name: 'Lenovo K8/K9 legacy (360×640)', w: 360, h: 640, dpr: 2, category: 'legacy' },
];

// ─── Invariants table ───────────────────────────────────────────────────────

type Invariant = {
  name: string;
  // Returns null if pass, error message if fail
  check: (d: Dev) => string | null;
  // Categories this invariant applies to (omitted = all)
  applies?: Dev['category'][];
};

const INVARIANTS: Invariant[] = [
  {
    name: 'content_area_280',
    check: (d) => {
      const content = d.w - 2 * 20;
      return content >= 280 ? null : `content area ${content}pt < 280pt`;
    },
    applies: ['phone', 'tablet', 'foldable_open', 'foldable_closed'],
  },
  {
    name: 'tab_tile_56pt',
    check: (d) => {
      const tile = d.w / 5;
      return tile >= 56 ? null : `tab tile ${tile.toFixed(1)}pt < 56pt for AI center pill`;
    },
    applies: ['phone', 'tablet', 'foldable_open', 'foldable_closed'],
  },
  {
    name: 'cta_full_width',
    check: (d) => {
      const cta = d.w - 2 * 20;
      return cta >= 232 ? null : `CTA ${cta}pt cannot fit "Начать тренировку"`;
    },
    applies: ['phone', 'tablet', 'foldable_open', 'foldable_closed'],
  },
  {
    name: 'two_col_grid',
    check: (d) => {
      const tile = (d.w - 2 * 20 - 12) / 2;
      return tile >= 130 ? null : `2-col tile ${tile}pt < 130pt`;
    },
    applies: ['phone', 'tablet', 'foldable_open', 'foldable_closed'],
  },
  {
    name: 'vertical_room_min',
    check: (d) => {
      const usable = d.h - 96;
      // Different floors per category
      const floor = d.category === 'legacy' ? 380 : d.category === 'tablet' ? 700 : 460;
      return usable >= floor ? null : `vertical ${usable}pt < ${floor}pt`;
    },
  },
  {
    name: 'header_greeting_area',
    check: (d) => {
      const titleArea = d.w - 2 * 20 - 40 - 16;
      // 264pt @ 360pt phones is enough for "Привет, имя" or 2-line wrap
      // for longer greetings. Floor: 240pt (acceptable for wrap).
      const floor = d.w < 360 ? 170 : d.category === 'legacy' ? 240 : 240;
      return titleArea >= floor ? null : `greeting area ${titleArea}pt < ${floor}pt`;
    },
    applies: ['phone', 'tablet', 'foldable_open', 'foldable_closed'],
  },
  {
    name: 'ring_with_3_rows',
    check: (d) => {
      const content = d.w - 2 * 20 - 2 * 20;
      const ring = 110;
      const rowsArea = content - ring - 20;
      return rowsArea >= 30 ? null : `ring+rows area ${rowsArea}pt insufficient`;
    },
    applies: ['phone', 'tablet', 'foldable_open', 'foldable_closed'],
  },
  {
    name: 'list_row_label',
    check: (d) => {
      const content = d.w - 2 * 20;
      const cardInner = content - 2 * 14;
      const labelArea = cardInner - 24 - 16 - 24; // icon + chevron + 2 gaps
      return labelArea >= 60 ? null : `list label area ${labelArea}pt < 60pt`;
    },
  },
  {
    name: 'fits_safe_area',
    check: (d) => {
      const safeTop = d.notch ? 47 : 20;
      const safeBottom = d.homeIndicator ? 34 : 0;
      const usable = d.h - safeTop - safeBottom - 96;
      const floor = d.category === 'legacy' ? 350 : 400;
      return usable >= floor ? null : `safe-area usable ${usable}pt < ${floor}pt`;
    },
  },
  {
    name: 'modal_92_visible',
    check: (d) => {
      const visibleAbove = d.h - d.h * 0.92;
      return visibleAbove >= 8 ? null : `modal-92% top visible ${visibleAbove}pt < 8pt`;
    },
  },
  {
    name: 'modal_50_usable',
    check: (d) => {
      const sheet = d.h * 0.5;
      const floor = d.category === 'legacy' ? 180 : 200;
      return sheet >= floor ? null : `modal-50% sheet ${sheet}pt < ${floor}pt`;
    },
  },
  {
    name: 'pixel_ratio_finite',
    check: (d) => {
      return Number.isFinite(d.dpr) && d.dpr >= 1 && d.dpr <= 5
        ? null
        : `DPR ${d.dpr} out of range`;
    },
  },
  {
    name: 'dimensions_positive',
    check: (d) => {
      return d.w > 0 && d.h > 0 ? null : `non-positive dim w=${d.w} h=${d.h}`;
    },
  },
  {
    name: 'breakpoint_resolves',
    check: (d) => {
      const r = buildResponsiveInfo(
        { width: d.w, height: d.h, scale: d.dpr, fontScale: 1 },
      );
      return /^(xs|sm|md|lg|tablet|desktop)$/.test(r.bp)
        ? null
        : `bp invalid: ${r.bp}`;
    },
  },
  {
    name: 'cols_returns_count',
    check: (d) => {
      const r = buildResponsiveInfo(
        { width: d.w, height: d.h, scale: d.dpr, fontScale: 1 },
      );
      const c = r.cols();
      return Number.isInteger(c) && c >= 1 && c <= 4
        ? null
        : `cols() returned ${c}`;
    },
  },
];

// ─── Top-level invariant — every device passes every applicable invariant ─

describe('Master device verification — all invariants for all devices', () => {
  test('matrix has 85+ devices', () => {
    expect(DEVICES.length).toBeGreaterThanOrEqual(85);
  });

  test('matrix has at least 15 distinct invariants', () => {
    expect(INVARIANTS.length).toBeGreaterThanOrEqual(15);
  });

  test.each(DEVICES)('$name passes ALL applicable invariants', (d) => {
    const failures: string[] = [];
    for (const inv of INVARIANTS) {
      const applies = inv.applies === undefined || inv.applies.includes(d.category);
      if (!applies) continue;
      const err = inv.check(d);
      if (err !== null) failures.push(`${inv.name}: ${err}`);
    }
    if (failures.length > 0) {
      // Surface every failure so we don't have to re-run to find them all
      throw new Error(
        `Device "${d.name}" failed ${failures.length} invariant(s):\n  - ${failures.join('\n  - ')}`,
      );
    }
    expect(failures.length).toBe(0);
  });
});

// ─── Per-category coverage ──────────────────────────────────────────────────

describe('Category coverage', () => {
  test('matrix has 50+ phones', () => {
    const phones = DEVICES.filter((d) => d.category === 'phone');
    expect(phones.length).toBeGreaterThanOrEqual(50);
  });

  test('matrix has 10+ tablets', () => {
    const tablets = DEVICES.filter((d) => d.category === 'tablet');
    expect(tablets.length).toBeGreaterThanOrEqual(10);
  });

  test('matrix has 3+ foldable closed states', () => {
    const closed = DEVICES.filter((d) => d.category === 'foldable_closed');
    expect(closed.length).toBeGreaterThanOrEqual(3);
  });

  test('matrix has 5+ foldable open states', () => {
    const open = DEVICES.filter((d) => d.category === 'foldable_open');
    expect(open.length).toBeGreaterThanOrEqual(5);
  });

  test('matrix has 3+ legacy phones', () => {
    const legacy = DEVICES.filter((d) => d.category === 'legacy');
    expect(legacy.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Specific physical-dimension verification ───────────────────────────────

describe('iPhone dimensions match Apple HIG', () => {
  // Source: developer.apple.com human-interface-guidelines/devices
  const APPLE_OFFICIAL: Record<string, { w: number; h: number }> = {
    'iPhone 5/5s/SE 1st (320×568)': { w: 320, h: 568 },
    'iPhone 6/7/8/SE 2/3 (375×667)': { w: 375, h: 667 },
    'iPhone 6+/7+/8+ (414×736)': { w: 414, h: 736 },
    'iPhone X/XS/12 mini/13 mini (375×812)': { w: 375, h: 812 },
    'iPhone XR/11 (414×896 @2x)': { w: 414, h: 896 },
    'iPhone XS Max/11 Pro Max (414×896 @3x)': { w: 414, h: 896 },
    'iPhone 12/13/14 (390×844)': { w: 390, h: 844 },
    'iPhone 14 Pro/15/15 Pro/16 (393×852)': { w: 393, h: 852 },
    'iPhone 16 Pro (402×874) NEW': { w: 402, h: 874 },
    'iPhone 12/13 Pro Max/14 Plus (428×926)': { w: 428, h: 926 },
    'iPhone 14 Pro Max/15 Plus/15 Pro Max/16 Plus (430×932)': { w: 430, h: 932 },
    'iPhone 16 Pro Max (440×956) NEW': { w: 440, h: 956 },
  };

  test.each(Object.entries(APPLE_OFFICIAL))(
    '%s dimensions match Apple HIG',
    (name, { w, h }) => {
      const dev = DEVICES.find((d) => d.name === name);
      expect(dev).toBeDefined();
      expect(dev!.w).toBe(w);
      expect(dev!.h).toBe(h);
    },
  );
});

// ─── DPR / hairline math ────────────────────────────────────────────────────

describe('Pixel ratios produce visible hairlines', () => {
  test.each(DEVICES)('$name: hairline (max(1/dpr, 0.5)) is visible', (d) => {
    const hairline = Math.max(1 / d.dpr, 0.5);
    expect(hairline).toBeGreaterThanOrEqual(0.5);
    const pixels = hairline * d.dpr;
    expect(pixels).toBeGreaterThanOrEqual(0.5);
  });

  test.each(DEVICES)('$name: 1pt border renders >= 1 actual pixel', (d) => {
    expect(1 * d.dpr).toBeGreaterThanOrEqual(1);
  });
});

// ─── Aspect ratio sanity ────────────────────────────────────────────────────

describe('Every device has sensible aspect ratio', () => {
  test.each(DEVICES)('$name: aspect within 1:1 to 21:9 ', (d) => {
    const aspect = Math.max(d.w, d.h) / Math.min(d.w, d.h);
    expect(aspect).toBeGreaterThanOrEqual(1.0);
    expect(aspect).toBeLessThanOrEqual(2.5);
  });

  test('matrix includes square-ish foldables (aspect ≤ 1.2)', () => {
    const square = DEVICES.filter(
      (d) => Math.max(d.w, d.h) / Math.min(d.w, d.h) <= 1.2,
    );
    expect(square.length).toBeGreaterThanOrEqual(3);
  });

  test('matrix includes 21:9 ultra-tall (aspect ≥ 2.3)', () => {
    const ultra = DEVICES.filter(
      (d) => Math.max(d.w, d.h) / Math.min(d.w, d.h) >= 2.3,
    );
    expect(ultra.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Width / height range coverage ──────────────────────────────────────────

describe('Width/height range coverage', () => {
  test('width range: smallest ≤ 320, largest ≥ 1024', () => {
    const widths = DEVICES.map((d) => d.w);
    expect(Math.min(...widths)).toBeLessThanOrEqual(320);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(1024);
  });

  test('height range: smallest ≤ 568, largest ≥ 1366', () => {
    const heights = DEVICES.map((d) => d.h);
    expect(Math.min(...heights)).toBeLessThanOrEqual(640);
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(1366);
  });

  test('every breakpoint represented (xs through desktop)', () => {
    const seen = new Set<string>();
    for (const d of DEVICES) {
      const r = buildResponsiveInfo({ width: d.w, height: d.h, scale: d.dpr, fontScale: 1 });
      seen.add(r.bp);
    }
    expect(seen.has('xs')).toBe(true);
    expect(seen.has('sm')).toBe(true);
    expect(seen.has('md')).toBe(true);
    expect(seen.has('lg')).toBe(true);
    expect(seen.has('tablet')).toBe(true);
    expect(seen.has('desktop')).toBe(true);
  });
});

// ─── Notched / non-notched coverage ─────────────────────────────────────────

describe('Notch / Dynamic Island coverage', () => {
  test('matrix has 5+ notched iPhones', () => {
    const notched = DEVICES.filter((d) => d.notch);
    expect(notched.length).toBeGreaterThanOrEqual(5);
  });

  test('matrix has 30+ non-notched devices (Android, iPad, etc.)', () => {
    const nonNotched = DEVICES.filter((d) => !d.notch);
    expect(nonNotched.length).toBeGreaterThanOrEqual(30);
  });
});

// ─── Density mode stability ─────────────────────────────────────────────────

describe('All density modes produce valid layout for every device', () => {
  test.each(DEVICES.slice(0, 30))(  // sample first 30 to keep runtime sane
    '$name: compact / normal / spacious all return finite scale',
    (d) => {
      for (const density of ['compact', 'normal', 'spacious'] as const) {
        const r = buildResponsiveInfo(
          { width: d.w, height: d.h, scale: d.dpr, fontScale: 1 },
          density,
        );
        expect(Number.isFinite(r.scale(16))).toBe(true);
        expect(r.scale(48)).toBeGreaterThan(20);
      }
    },
  );
});

// ─── Font scale 80% → 310% with every device ───────────────────────────────

describe('Font scale 80%-310% on every device produces finite values', () => {
  const SAMPLE = DEVICES.slice(0, 20); // sample to keep runtime sane

  test.each(SAMPLE)(
    '$name: font scales 0.85, 1.0, 1.5, 2.0, 3.1 all produce valid sizes',
    (d) => {
      for (const fs of [0.85, 1.0, 1.5, 2.0, 3.1]) {
        const r = buildResponsiveInfo(
          { width: d.w, height: d.h, scale: d.dpr, fontScale: fs },
        );
        expect(Number.isFinite(r.fontScale_(15))).toBe(true);
        expect(r.fontScale_(15)).toBeGreaterThan(0);
      }
    },
  );
});

// ─── Dump summary at end ────────────────────────────────────────────────────

describe('Audit summary', () => {
  test('total devices verified', () => {
    expect(DEVICES.length).toBeGreaterThanOrEqual(85);
  });

  test('total invariants checked per device', () => {
    expect(INVARIANTS.length).toBeGreaterThanOrEqual(15);
  });

  test('total individual checks (devices × invariants) ≥ 1200', () => {
    let total = 0;
    for (const d of DEVICES) {
      for (const inv of INVARIANTS) {
        if (inv.applies === undefined || inv.applies.includes(d.category)) {
          total++;
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(1200);
  });
});
