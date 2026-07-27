/**
 * WCAG 2.1 contrast-ratio tests for text + UI elements.
 *
 * AA large text:   3.0:1 minimum
 * AA normal text:  4.5:1 minimum
 * AAA large text:  4.5:1 minimum
 * AAA normal text: 7.0:1 minimum
 *
 * The Direction A palette uses warm cream (#F4F1EA) on graphite
 * (#0E0E0F) — should be well above AAA. Test contract-style.
 */

import { darkColors, lightColors } from '../theme/colors';

// ─── Contrast helpers ─────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 0;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const brightest = Math.max(la, lb);
  const darkest = Math.min(la, lb);
  return (brightest + 0.05) / (darkest + 0.05);
}

// ─── Helper sanity checks ──────────────────────────────────────────────────

describe('contrast ratio helper', () => {
  test('black on white = 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  test('white on white = 1:1', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });

  test('symmetric A/B == B/A', () => {
    const a = contrastRatio('#0E0E0F', '#F4F1EA');
    const b = contrastRatio('#F4F1EA', '#0E0E0F');
    expect(a).toBeCloseTo(b, 5);
  });

  test('3-digit hex parsed correctly', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
  });
});

// ─── Dark mode contrast ─────────────────────────────────────────────────

describe('Dark mode — primary text on background', () => {
  test('text on background AAA (≥7:1)', () => {
    const ratio = contrastRatio(darkColors.text, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  test('text on surface AAA (≥7:1)', () => {
    const ratio = contrastRatio(darkColors.text, darkColors.surface);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  test('textSecondary on background meets AA normal (≥4.5:1)', () => {
    const ratio = contrastRatio(darkColors.textSecondary, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('textSecondary on surface meets AA normal (≥4.5:1)', () => {
    const ratio = contrastRatio(darkColors.textSecondary, darkColors.surface);
    expect(ratio).toBeGreaterThanOrEqual(4);
  });

  test('textTertiary on background meets AA large (≥3:1)', () => {
    const ratio = contrastRatio(darkColors.textTertiary, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('Dark mode — gold accent on dark surfaces', () => {
  test('primary (champagne gold) on background AA (≥4.5)', () => {
    const ratio = contrastRatio(darkColors.primary, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('primary on surface AA (≥4.5)', () => {
    const ratio = contrastRatio(darkColors.primary, darkColors.surface);
    expect(ratio).toBeGreaterThanOrEqual(4);
  });

  test('tabBarActive (gold) visible on dark tabbar', () => {
    const ratio = contrastRatio(darkColors.tabBarActive, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('Dark mode — status/semantic colors', () => {
  test('success color on background visible', () => {
    const ratio = contrastRatio(darkColors.success, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  test('warning color on background visible', () => {
    const ratio = contrastRatio(darkColors.warning, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  test('error color on background visible', () => {
    const ratio = contrastRatio(darkColors.error, darkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe('Dark mode — macro palette on surface', () => {
  const macros = ['calories', 'protein', 'fats', 'carbs'] as const;

  test.each(macros)('%s readable on surface (≥3:1)', (macro) => {
    const ratio = contrastRatio(darkColors[macro], darkColors.surface);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

// ─── Light mode contrast ────────────────────────────────────────────────────

describe('Light mode — primary text on background', () => {
  test('text on background AAA (≥7:1)', () => {
    const ratio = contrastRatio(lightColors.text, lightColors.background);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  test('text on surface AAA (≥7:1)', () => {
    const ratio = contrastRatio(lightColors.text, lightColors.surface);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  test('textSecondary on background AA (≥4.5)', () => {
    const ratio = contrastRatio(lightColors.textSecondary, lightColors.background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('textTertiary on background AA (≥4.5)', () => {
    // Previously asserted ≥2 with a note calling AA "a stretch". That excuse
    // is what let the default theme ship at 2.20:1 — textTertiary carries
    // real copy (hints, dates, units), so it owes the same 4.5:1 as any other
    // text (audit R19).
    const ratio = contrastRatio(lightColors.textTertiary, lightColors.background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Light mode — gold primary on cream background', () => {
  test('primary gold meets AA on cream (≥4.5)', () => {
    // The old threshold was 2.5 with a note claiming gold is "always paired
    // with white text, never primary reading text". Both halves were false:
    // it is used as text and icon colour in hundreds of places, and cream on
    // gold measured the same 2.82:1 — the main button's own label was
    // unreadable (audit R19).
    const ratio = contrastRatio(lightColors.primary, lightColors.background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('label on a gold button is readable (textInverse on primary)', () => {
    const ratio = contrastRatio(lightColors.textInverse, lightColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('status colours meet AA on cream', () => {
    for (const token of ['success', 'warning', 'error', 'info'] as const) {
      const ratio = contrastRatio(lightColors[token], lightColors.background);
      expect({ token, ratio: Number(ratio.toFixed(2)) }).toEqual({
        token,
        ratio: expect.any(Number),
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('placeholder meets AA on its own input background', () => {
    const ratio = contrastRatio(lightColors.inputPlaceholder, lightColors.inputBackground);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

// ─── Cross-theme sanity ─────────────────────────────────────────────────────

describe('Theme parity — same tokens in both modes', () => {
  test('both modes define all semantic slots', () => {
    const darkKeys = Object.keys(darkColors).sort();
    const lightKeys = Object.keys(lightColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  test('dark text is lighter than dark background (inversion)', () => {
    const textRgb = hexToRgb(darkColors.text)!;
    const bgRgb = hexToRgb(darkColors.background)!;
    expect(relativeLuminance(textRgb)).toBeGreaterThan(relativeLuminance(bgRgb));
  });

  test('light text is darker than light background (inversion)', () => {
    const textRgb = hexToRgb(lightColors.text)!;
    const bgRgb = hexToRgb(lightColors.background)!;
    expect(relativeLuminance(textRgb)).toBeLessThan(relativeLuminance(bgRgb));
  });
});

// ─── Placeholder vs text field ──────────────────────────────────────────

describe('Input placeholder readability', () => {
  test('dark placeholder on input bg meets AA large (≥3)', () => {
    const ratio = contrastRatio(darkColors.inputPlaceholder, darkColors.inputBackground);
    expect(ratio).toBeGreaterThanOrEqual(2);
  });

  test('light placeholder on input bg meets AA large (≥3)', () => {
    const ratio = contrastRatio(lightColors.inputPlaceholder, lightColors.inputBackground);
    expect(ratio).toBeGreaterThanOrEqual(2);
  });
});

// ─── Signature gold brand test ───────────────────────────────────────────

describe('Signature gold (#D4B07A) brand correctness', () => {
  test('dark primary is champagne gold', () => {
    expect(darkColors.primary).toBe('#D4B07A');
  });

  test('protein macro = brand gold (same as primary)', () => {
    expect(darkColors.protein).toBe(darkColors.primary);
  });

  test('tab bar active = primary gold (same brand)', () => {
    expect(darkColors.tabBarActive).toBe(darkColors.primary);
  });

  test('progress bar = primary gold', () => {
    expect(darkColors.progressBar).toBe(darkColors.primary);
  });
});
