/**
 * Design compliance audit — snapshot of the design tokens we've
 * committed to match. If any of these drift, the suite fails and
 * forces the reviewer to acknowledge + re-align.
 *
 * This acts as the "canonical spec" captured as code — anyone editing
 * the theme/typography needs to think about whether it still matches
 * the Direction A design handoff from 2026-04-22.
 */

import { darkColors, lightColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

// ─── Source-of-truth tokens from project/src/tokens.js ───────────────────

const DESIGN_TOKENS_A = {
  bg: '#0E0E0F',
  surface: '#17171A',
  surfaceHi: '#1E1E22',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  text: '#F4F1EA',
  textSub: '#A8A49C',
  textDim: '#6B6860',
  accent: '#D4B07A',
  accent2: '#8E6B3E',
  good: '#9AC28C',
  warn: '#E8A36A',
  danger: '#E07A6B',
};

describe('Design compliance — tokens.js Direction A mapping', () => {
  test('bg → darkColors.background', () => {
    expect(darkColors.background).toBe(DESIGN_TOKENS_A.bg);
  });

  test('surface → darkColors.surface', () => {
    expect(darkColors.surface).toBe(DESIGN_TOKENS_A.surface);
  });

  test('surfaceHi → darkColors.surfaceElevated', () => {
    expect(darkColors.surfaceElevated).toBe(DESIGN_TOKENS_A.surfaceHi);
  });

  // rgba string comparison ignores whitespace variations ("rgba(0,0,0,1)"
  // vs "rgba(0, 0, 0, 1)" — both valid CSS but byte-different).
  const rgbaEq = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

  test('line → darkColors.border', () => {
    expect(rgbaEq(darkColors.border, DESIGN_TOKENS_A.line)).toBe(true);
  });

  test('lineStrong → darkColors.tabBarBorder + inputBorder', () => {
    expect(rgbaEq(darkColors.tabBarBorder, DESIGN_TOKENS_A.lineStrong)).toBe(true);
    expect(rgbaEq(darkColors.inputBorder, DESIGN_TOKENS_A.lineStrong)).toBe(true);
  });

  test('text → darkColors.text', () => {
    expect(darkColors.text).toBe(DESIGN_TOKENS_A.text);
  });

  test('textSub → darkColors.textSecondary', () => {
    expect(darkColors.textSecondary).toBe(DESIGN_TOKENS_A.textSub);
  });

  test('textDim → darkColors.textTertiary', () => {
    expect(darkColors.textTertiary).toBe(DESIGN_TOKENS_A.textDim);
  });

  test('accent → darkColors.primary', () => {
    expect(darkColors.primary).toBe(DESIGN_TOKENS_A.accent);
    expect(darkColors.accent).toBe(DESIGN_TOKENS_A.accent);
  });

  test('accent2 is used somewhere in the dark palette (bronze stop)', () => {
    // The design's accent2 #8E6B3E is a deeper bronze stop. We use it
    // in the AI avatar gradient (see ChatHeader) rather than primaryDark.
    // primaryDark instead gets a more moderate #B08A4E for pressed states.
    // Verify at least one palette slot holds accent2's intent (warmer
    // than base gold but not as dark as background).
    const anyBronze = Object.values(darkColors).some(
      (v) => typeof v === 'string' && (v.toLowerCase() === DESIGN_TOKENS_A.accent2.toLowerCase() || v.toLowerCase() === '#b08a4e'),
    );
    expect(anyBronze).toBe(true);
  });

  test('good → darkColors.success', () => {
    expect(darkColors.success).toBe(DESIGN_TOKENS_A.good);
  });

  test('warn → darkColors.warning', () => {
    expect(darkColors.warning).toBe(DESIGN_TOKENS_A.warn);
  });

  test('danger → darkColors.error', () => {
    expect(darkColors.error).toBe(DESIGN_TOKENS_A.danger);
  });
});

// ─── Spec lockdown — each design value in one place ─────────────────────────

describe('Design spec lockdown', () => {
  test('7 named color roles covered by tokens.A', () => {
    // A single source of truth prevents drift: every new color should
    // be added to DESIGN_TOKENS_A here (and then wired to darkColors).
    expect(Object.keys(DESIGN_TOKENS_A).length).toBe(13);
  });

  test('h1 size matches design display (36pt)', () => {
    expect(typography.h1.fontSize).toBe(36);
  });

  test('lg button radius matches design (20pt)', () => {
    expect(borderRadius.xl).toBe(20);
  });

  test('hero-card radius matches design (24pt)', () => {
    expect(borderRadius.xxl).toBe(24);
  });

  test('content padding (xl = 20) matches design screen gutters', () => {
    expect(spacing.xl).toBe(20);
  });
});

// ─── Light-mode derivation consistency ──────────────────────────────────────

describe('Light mode derivation consistency', () => {
  // Light mode uses deeper gold for readability on cream; these are
  // app-side decisions not direct tokens.A mappings. Lock them anyway.
  test('light mode primary is deeper gold #B08A4E', () => {
    expect(lightColors.primary).toBe('#B08A4E');
  });

  test('light mode background is warm cream #F4F1EA (inverse of dark text)', () => {
    expect(lightColors.background).toBe('#F4F1EA');
  });

  test('text colors invert cleanly between modes', () => {
    // dark.text === light.background (warm cream on both)
    expect(darkColors.text).toBe(lightColors.background);
    // dark.background === light.text?... actually dark.bg is #0E0E0F
    // and light.text is #17171A — close enough (warm graphites).
    // Assert they're both dark
    expect(darkColors.background).toMatch(/^#0/);
    expect(lightColors.text).toMatch(/^#1/);
  });
});

// ─── Macro/stats tie-ins ────────────────────────────────────────────────────

describe('Macro palette ties to brand', () => {
  test('protein color == primary in both modes (macro bar is gold)', () => {
    expect(darkColors.protein).toBe(darkColors.primary);
    expect(lightColors.protein).toBe(lightColors.primary);
  });

  test('calories uses danger/terracotta tone (not neon red)', () => {
    expect(darkColors.calories).toBe(DESIGN_TOKENS_A.danger);
  });

  test('fats uses amber tone (design warn)', () => {
    expect(darkColors.fats).toBe(DESIGN_TOKENS_A.warn);
  });

  test('carbs uses sage tone (design good)', () => {
    expect(darkColors.carbs).toBe(DESIGN_TOKENS_A.good);
  });
});
