/**
 * Color token format validity — every color should be a valid
 * SVG/CSS-compatible string. If a token is a bad format (e.g.
 * "rgb(300, ...)" or "#GGG"), React Native will silently ignore it.
 */

import { darkColors, lightColors } from '../theme/colors';

function isValidHex(color: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color);
}

function isValidRgba(color: string): boolean {
  // Match rgba(r, g, b, a) or rgb(r, g, b) with 0..255 int and 0..1 decimal
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)$/.exec(color);
  if (!m) return false;
  const [, r, g, b, a] = m;
  if (+r < 0 || +r > 255) return false;
  if (+g < 0 || +g > 255) return false;
  if (+b < 0 || +b > 255) return false;
  if (a !== undefined) {
    const av = +a;
    if (av < 0 || av > 1) return false;
  }
  return true;
}

function isValidColor(color: string): boolean {
  return isValidHex(color) || isValidRgba(color);
}

// ─── Helper sanity ─────────────────────────────────────────────────────────

describe('color format helpers', () => {
  test('#FFF valid hex', () => {
    expect(isValidHex('#FFF')).toBe(true);
    expect(isValidHex('#fff')).toBe(true);
  });

  test('#FFFFFF valid hex', () => {
    expect(isValidHex('#FFFFFF')).toBe(true);
  });

  test('#GGGGGG invalid hex', () => {
    expect(isValidHex('#GGGGGG')).toBe(false);
  });

  test('#FF invalid hex (too short)', () => {
    expect(isValidHex('#FF')).toBe(false);
  });

  test('rgb(10,20,30) valid', () => {
    expect(isValidRgba('rgb(10, 20, 30)')).toBe(true);
  });

  test('rgba(0,0,0,0.5) valid', () => {
    expect(isValidRgba('rgba(0, 0, 0, 0.5)')).toBe(true);
  });

  test('rgba with alpha >1 invalid', () => {
    expect(isValidRgba('rgba(0, 0, 0, 1.5)')).toBe(false);
  });

  test('rgba with r>255 invalid', () => {
    expect(isValidRgba('rgba(300, 0, 0, 1)')).toBe(false);
  });
});

// ─── Dark mode tokens all valid ────────────────────────────────────────────

describe('darkColors tokens are all valid CSS colors', () => {
  test.each(Object.entries(darkColors))('"%s" is a valid color (%s)', (key, value) => {
    expect(isValidColor(value as string)).toBe(true);
  });
});

// ─── Light mode tokens all valid ──────────────────────────────────────────

describe('lightColors tokens are all valid CSS colors', () => {
  test.each(Object.entries(lightColors))('"%s" is a valid color (%s)', (key, value) => {
    expect(isValidColor(value as string)).toBe(true);
  });
});

// ─── No duplicate brand definitions ───────────────────────────────────────

describe('Brand gold token consistency', () => {
  test('all gold-role tokens in dark mode use #D4B07A', () => {
    expect(darkColors.primary).toBe('#D4B07A');
    expect(darkColors.accent).toBe('#D4B07A');
    expect(darkColors.protein).toBe('#D4B07A');
    expect(darkColors.tabBarActive).toBe('#D4B07A');
    expect(darkColors.progressBar).toBe('#D4B07A');
  });

  test('light mode primary is deep bronze-gold (#86693B)', () => {
    // Was #B08A4E until audit R19: that measured 2.82:1 on the cream
    // background, below the 4.5:1 AA floor, in the DEFAULT theme.
    expect(lightColors.primary).toBe('#86693B');
    expect(lightColors.accent).toBe('#86693B');
  });
});

// ─── No unused / stale legacy colors ──────────────────────────────────────

describe('Legacy purple tokens removed', () => {
  test('no dark token uses old #8B5CF6 purple', () => {
    for (const [, v] of Object.entries(darkColors)) {
      expect(String(v).toUpperCase()).not.toContain('8B5CF6');
    }
  });

  test('no light token uses old #8B5CF6 purple', () => {
    for (const [, v] of Object.entries(lightColors)) {
      expect(String(v).toUpperCase()).not.toContain('8B5CF6');
    }
  });

  test('no light token uses old dark purple #A78BFA', () => {
    for (const [, v] of Object.entries(darkColors)) {
      expect(String(v).toUpperCase()).not.toContain('A78BFA');
    }
  });
});

// ─── Alpha channel format consistency ─────────────────────────────────────

describe('Alpha channel tokens use rgba format', () => {
  const alphaTokens = ['border', 'borderLight', 'divider', 'overlay', 'shadow'];

  test.each(alphaTokens)('%s in dark mode uses rgba', (key) => {
    const value = (darkColors as any)[key];
    expect(value).toMatch(/^rgba\(/);
  });
});

// ─── Transparent token validity ──────────────────────────────────────────

describe('No bogus "transparent" strings misplaced', () => {
  test('no token spelled "transparent" instead of rgba', () => {
    for (const [, v] of Object.entries(darkColors)) {
      // rgba(0,0,0,0) is valid; "transparent" is a CSS keyword
      // We accept "transparent" as a special case but not in our palette
      expect(String(v)).not.toMatch(/^transparent$/);
    }
  });
});
