/**
 * Palette / typography integrity — make sure nobody silently regresses
 * the Direction A theme back to the old Apple-purple scheme or drops
 * the premium display-heading specs.
 *
 * These guards lock:
 *   - No accidental Apple-purple #8B5CF6 / #A78BFA leaks
 *   - Primary colors are in the champagne-gold family
 *   - Dark-mode background is the warm graphite, not cool pure-black
 *   - Typography weights + tracking stay in the premium spec range
 */

import { lightColors, darkColors } from '../theme/colors';
import { typography } from '../theme/typography';

// ─── Colors ──────────────────────────────────────────────────────────────────

describe('theme colors — Direction A integrity', () => {
  const OLD_PURPLES = ['#8B5CF6', '#A78BFA', '#7C3AED', '#C4B5FD', '#8b5cf6', '#a78bfa'];

  test('no Apple-purple hex values leak into the palette', () => {
    const values = [
      ...Object.values(lightColors),
      ...Object.values(darkColors),
    ];
    for (const p of OLD_PURPLES) {
      expect(values).not.toContain(p);
    }
  });

  test('dark mode primary is champagne gold #D4B07A', () => {
    expect(darkColors.primary).toBe('#D4B07A');
    expect(darkColors.accent).toBe('#D4B07A');
  });

  test('dark mode background is warm graphite (not cool black)', () => {
    expect(darkColors.background).toBe('#0E0E0F');
    // Pure black (#000) + cool dark (#0A0A0F from the old theme) must
    // not be the new baseline.
    expect(darkColors.background).not.toBe('#000000');
    expect(darkColors.background).not.toBe('#0A0A0F');
  });

  test('dark mode surfaces layer warmly (17→1E)', () => {
    expect(darkColors.surface).toBe('#17171A');
    expect(darkColors.surfaceElevated).toBe('#1E1E22');
  });

  test('dark mode text is warm cream, not pure white', () => {
    expect(darkColors.text).toBe('#F4F1EA');
    expect(darkColors.text).not.toBe('#FFFFFF');
  });

  test('protein macro color is brand gold (ties macro bar to brand)', () => {
    // Protein macro shared the purple brand color; migrated to gold.
    expect(darkColors.protein).toBe('#D4B07A');
  });

  test('light mode uses deeper gold for contrast', () => {
    // Champagne gold is too washed on cream bg; B08A4E is the deeper
    // stop from the design token.
    expect(lightColors.primary).toBe('#B08A4E');
  });

  test('success / warning / error use warm (not neon) palette', () => {
    // Old dark theme used #30D158 / #FFD60A / #FF453A — Apple neons.
    // Direction A uses sage / amber / terracotta.
    expect(darkColors.success).toBe('#9AC28C');
    expect(darkColors.warning).toBe('#E8A36A');
    expect(darkColors.error).toBe('#E07A6B');
  });

  test('light and dark palettes have matching keys (no asymmetry)', () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  test('every palette value is a non-empty string', () => {
    for (const [key, val] of Object.entries(darkColors)) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
      // Guards against accidental empty/null strings sneaking in
      if (val.startsWith('#')) {
        expect(val).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      } else if (val.startsWith('rgba')) {
        expect(val).toMatch(/^rgba\(/);
      }
    }
    // Sanity: at least one key verified
    expect(Object.keys(darkColors).length).toBeGreaterThan(10);
  });
});

// ─── Typography ──────────────────────────────────────────────────────────────

describe('typography — premium display specs', () => {
  test('h1 uses 36pt with negative tracking (Manrope-style display)', () => {
    expect(typography.h1.fontSize).toBe(36);
    expect(typography.h1.letterSpacing).toBeLessThan(0);
    // Premium display tracks -0.8 or tighter
    expect(typography.h1.letterSpacing).toBeLessThanOrEqual(-0.8);
  });

  test('h1 weight is 600 (not heavy 800 — gold accent handles emphasis)', () => {
    expect(typography.h1.fontWeight).toBe('600');
  });

  test('h2/h3/h4 all use 600 semibold', () => {
    expect(typography.h2.fontWeight).toBe('600');
    expect(typography.h3.fontWeight).toBe('600');
    expect(typography.h4.fontWeight).toBe('600');
  });

  test('metaLabel preset exists for "01 · ОНБОРДИНГ" style labels', () => {
    expect(typography.metaLabel).toBeDefined();
    expect(typography.metaLabel.fontSize).toBe(11);
    expect(typography.metaLabel.letterSpacing).toBeGreaterThanOrEqual(1);
    expect(typography.metaLabel.fontFamily).toBeDefined();
    // Meta label uses mono for the caps-tracked feel
    expect(String(typography.metaLabel.fontFamily)).toMatch(/mono|Menlo/);
  });

  test('number preset has heavy negative tracking for dashboard stats', () => {
    expect(typography.number.fontSize).toBe(32);
    expect(typography.number.fontWeight).toBe('700');
    expect(typography.number.letterSpacing).toBeLessThan(-0.5);
  });

  test('tabLabel is 10pt semibold (premium translucent tab bar)', () => {
    expect(typography.tabLabel.fontSize).toBe(10);
    expect(typography.tabLabel.fontWeight).toBe('600');
  });

  test('body sizes preserved (16pt is usable baseline)', () => {
    expect(typography.body.fontSize).toBe(16);
    expect(typography.bodyMedium.fontSize).toBe(16);
    expect(typography.bodySemibold.fontSize).toBe(16);
  });

  test('no accidentally-zero or negative font sizes', () => {
    for (const [key, style] of Object.entries(typography)) {
      expect(style.fontSize).toBeGreaterThan(0);
      // Sanity ceiling — no typography preset should exceed 60pt
      expect(style.fontSize).toBeLessThanOrEqual(60);
    }
  });

  test('all line heights are >= fontSize (no overlapping text)', () => {
    for (const [key, style] of Object.entries(typography)) {
      if (style.lineHeight && style.fontSize) {
        expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
      }
    }
  });
});
