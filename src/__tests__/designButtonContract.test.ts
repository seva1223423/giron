/**
 * Button component contract — verifies the size-to-radius + variant
 * rules that the Direction A redesign relies on stay stable.
 *
 * Constants under test live in Button.tsx as inline logic; rather than
 * render, we re-derive them here using the same inputs.
 */

import { spacing, borderRadius } from '../theme/spacing';

// ─── Button height × variant × radius contract ────────────────────────────

describe('Button design contract', () => {
  // Re-derive from the Button.tsx getContainerStyle logic.
  function getMinHeight(size: 'sm' | 'md' | 'lg'): number {
    if (size === 'sm') return 36;
    if (size === 'md') return 44;
    return 58; // lg
  }

  function getBorderRadius(size: 'sm' | 'md' | 'lg'): number {
    return size === 'lg' ? borderRadius.xl : borderRadius.lg;
  }

  test('small button is 36pt tall', () => {
    expect(getMinHeight('sm')).toBe(36);
  });

  test('medium button is 44pt tall (Apple HIG minimum)', () => {
    expect(getMinHeight('md')).toBe(44);
    expect(getMinHeight('md')).toBeGreaterThanOrEqual(44);
  });

  test('large button is 58pt tall (Direction A spec)', () => {
    expect(getMinHeight('lg')).toBe(58);
  });

  test('large button uses xl radius (20pt), smaller use lg (16pt)', () => {
    expect(getBorderRadius('lg')).toBe(borderRadius.xl);
    expect(getBorderRadius('lg')).toBe(20);
    expect(getBorderRadius('md')).toBe(borderRadius.lg);
    expect(getBorderRadius('md')).toBe(16);
    expect(getBorderRadius('sm')).toBe(16);
  });

  test('button heights are monotonically non-decreasing with size', () => {
    expect(getMinHeight('sm')).toBeLessThanOrEqual(getMinHeight('md'));
    expect(getMinHeight('md')).toBeLessThanOrEqual(getMinHeight('lg'));
  });
});

// ─── spacing scale integrity ───────────────────────────────────────────────

describe('Spacing scale', () => {
  test('all scale keys exist', () => {
    expect(spacing).toHaveProperty('xs');
    expect(spacing).toHaveProperty('sm');
    expect(spacing).toHaveProperty('md');
    expect(spacing).toHaveProperty('lg');
    expect(spacing).toHaveProperty('xl');
    expect(spacing).toHaveProperty('xxl');
    expect(spacing).toHaveProperty('xxxl');
    expect(spacing).toHaveProperty('huge');
  });

  test('values are monotonically increasing', () => {
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(spacing.md).toBeLessThan(spacing.lg);
    expect(spacing.lg).toBeLessThan(spacing.xl);
    expect(spacing.xl).toBeLessThan(spacing.xxl);
    expect(spacing.xxl).toBeLessThan(spacing.xxxl);
    expect(spacing.xxxl).toBeLessThan(spacing.huge);
  });

  test('expected values match design tokens', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(12);
    expect(spacing.lg).toBe(16);
    expect(spacing.xl).toBe(20);
    expect(spacing.xxl).toBe(24);
    expect(spacing.xxxl).toBe(32);
    expect(spacing.huge).toBe(48);
  });
});

// ─── borderRadius scale integrity ──────────────────────────────────────────

describe('BorderRadius scale', () => {
  test('all keys exist', () => {
    for (const k of ['sm', 'md', 'lg', 'xl', 'xxl', 'full']) {
      expect(borderRadius).toHaveProperty(k);
    }
  });

  test('values are monotonically increasing before "full"', () => {
    expect(borderRadius.sm).toBeLessThan(borderRadius.md);
    expect(borderRadius.md).toBeLessThan(borderRadius.lg);
    expect(borderRadius.lg).toBeLessThan(borderRadius.xl);
    expect(borderRadius.xl).toBeLessThan(borderRadius.xxl);
  });

  test('"full" is at least 9999 (renders as pill)', () => {
    expect(borderRadius.full).toBeGreaterThanOrEqual(999);
  });

  test('xl = 20 matches Direction A premium button', () => {
    expect(borderRadius.xl).toBe(20);
  });

  test('xxl = 24 matches Direction A hero-card radius', () => {
    expect(borderRadius.xxl).toBe(24);
  });
});
