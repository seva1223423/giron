/**
 * Light/dark palette parity — guarantees that every color key exists in
 * BOTH modes and that no mode accidentally silently renders a design
 * component differently (e.g. surface disappearing in light mode).
 *
 * Also locks the gold-on-dark / dark-on-gold contrast contract used by
 * Button, Paywall CTA, AI Coach card, and the tab-bar center tile.
 */

import { lightColors, darkColors } from '../theme/colors';

describe('theme key parity', () => {
  const lightKeys = Object.keys(lightColors).sort();
  const darkKeys = Object.keys(darkColors).sort();

  test('every light color key exists in dark', () => {
    for (const k of lightKeys) expect(darkKeys).toContain(k);
  });

  test('every dark color key exists in light', () => {
    for (const k of darkKeys) expect(lightKeys).toContain(k);
  });

  test('neither palette has extra keys (exact set match)', () => {
    expect(lightKeys).toEqual(darkKeys);
  });

  test('both palettes have at least 30 keys (full coverage)', () => {
    expect(lightKeys.length).toBeGreaterThanOrEqual(30);
  });

  test('semantic categories all populated', () => {
    const semantics = ['primary', 'background', 'surface', 'text', 'border', 'success', 'warning', 'error', 'tabBar', 'inputBackground', 'calories', 'protein', 'fats', 'carbs'];
    for (const s of semantics) {
      expect(lightKeys).toContain(s);
      expect(darkKeys).toContain(s);
    }
  });
});

// ─── Gold-on-dark contrast ──────────────────────────────────────────────────

describe('brand gold visibility across modes', () => {
  test('dark mode: gold primary on graphite background — high contrast', () => {
    // Gold #D4B07A is very light-warm, background #0E0E0F is very dark
    // Simple contrast check: they must be visibly different
    expect(darkColors.primary).not.toBe(darkColors.background);
    expect(darkColors.primary).not.toBe(darkColors.surface);
  });

  test('light mode: deeper gold on cream — readable', () => {
    expect(lightColors.primary).not.toBe(lightColors.background);
    expect(lightColors.primary).not.toBe(lightColors.surface);
  });

  test('textInverse is darker than text in dark mode (swap rule)', () => {
    // In dark mode: text is cream, textInverse is graphite
    expect(darkColors.text).toBe('#F4F1EA');
    expect(darkColors.textInverse).toBe('#0E0E0F');
  });

  test('textInverse is lighter than text in light mode (swap rule)', () => {
    expect(lightColors.text).toBe('#17171A');
    expect(lightColors.textInverse).toBe('#F4F1EA');
  });

  test('gold primary + textInverse contrast contract', () => {
    // The "gold fill + dark text" contract we enforce on Button primary,
    // paywall CTA, tab bar center, and AI coach CTA. textInverse must
    // be dark in dark mode so the contract reads right.
    expect(darkColors.textInverse.toLowerCase()).toBe('#0e0e0f');
  });
});

// ─── Hex shape integrity ────────────────────────────────────────────────────

describe('color value shapes', () => {
  const isColor = (v: string): boolean =>
    /^#[0-9A-Fa-f]{3,8}$/.test(v) || /^rgba?\(/.test(v);

  test('every dark palette value is a valid color string', () => {
    for (const [k, v] of Object.entries(darkColors)) {
      expect(isColor(v)).toBe(true);
    }
  });

  test('every light palette value is a valid color string', () => {
    for (const [k, v] of Object.entries(lightColors)) {
      expect(isColor(v)).toBe(true);
    }
  });

  test('no palette value is an empty string', () => {
    for (const v of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(v.length).toBeGreaterThan(0);
    }
  });

  test('no palette value is the string "undefined" or "null"', () => {
    for (const v of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(v).not.toBe('undefined');
      expect(v).not.toBe('null');
    }
  });
});

// ─── Macro palette consistency ──────────────────────────────────────────────

describe('macro colors across modes', () => {
  test('protein equals primary (brand-aligned macro bar)', () => {
    expect(darkColors.protein).toBe(darkColors.primary);
    expect(lightColors.protein).toBe(lightColors.primary);
  });

  test('4 macro colors all defined distinctly per mode', () => {
    // calories / protein / fats / carbs shouldn't all be the same color
    // in either mode.
    const darkMacros = new Set([darkColors.calories, darkColors.protein, darkColors.fats, darkColors.carbs]);
    const lightMacros = new Set([lightColors.calories, lightColors.protein, lightColors.fats, lightColors.carbs]);
    expect(darkMacros.size).toBe(4);
    expect(lightMacros.size).toBe(4);
  });
});

// ─── Tab-bar translucency ───────────────────────────────────────────────────

describe('tab-bar translucent style', () => {
  test('dark tab bar is rgba-based (backdrop-blur-friendly)', () => {
    // The tokens spec uses "rgba(20,20,24,0.82)" for the floating bar
    expect(darkColors.tabBar).toMatch(/^rgba?\(/);
  });

  test('light tab bar still a solid hex (no backdrop on cream bg)', () => {
    expect(lightColors.tabBar).toMatch(/^#/);
  });
});
