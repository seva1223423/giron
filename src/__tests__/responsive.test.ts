import { resolveBreakpoint, pickResponsive, widthMultiplier, buildResponsiveInfo } from '../theme/responsive';

describe('resolveBreakpoint', () => {
  test.each([
    [280, 'xs'],   // Galaxy Fold cover
    [320, 'xs'],   // iPhone SE 1st
    [359, 'xs'],
    [360, 'sm'],   // stock Android
    [375, 'sm'],   // iPhone 13 mini
    [389, 'sm'],
    [390, 'md'],   // iPhone 14
    [393, 'md'],   // iPhone 14 Pro — baseline
    [429, 'md'],
    [430, 'lg'],   // iPhone 15 Pro Max
    [639, 'lg'],
    [744, 'tablet'], // iPad mini
    [820, 'tablet'], // iPad portrait
    [1023, 'tablet'],
    [1024, 'desktop'],
    [1366, 'desktop'],
  ])('%i → %s', (width, expected) => {
    expect(resolveBreakpoint(width)).toBe(expected);
  });
});

describe('pickResponsive', () => {
  test('plain values pass through', () => {
    expect(pickResponsive(16, 'md')).toBe(16);
  });

  test('most-specific match wins', () => {
    expect(pickResponsive({ xs: 12, md: 16, tablet: 24 }, 'md')).toBe(16);
  });

  test('falls back to smaller breakpoint', () => {
    expect(pickResponsive({ xs: 12, md: 16 }, 'lg')).toBe(16);
    expect(pickResponsive({ xs: 12 }, 'tablet')).toBe(12);
  });

  test('falls back upward if no smaller match', () => {
    expect(pickResponsive({ tablet: 24 }, 'sm')).toBe(24);
  });
});

describe('widthMultiplier', () => {
  test('reference width gives ~1', () => {
    expect(widthMultiplier(393)).toBeCloseTo(1, 1);
  });
  test('narrow screen shrinks softly', () => {
    expect(widthMultiplier(320)).toBeGreaterThan(0.85);
    expect(widthMultiplier(320)).toBeLessThan(1);
  });
  test('wide screen grows but is clamped', () => {
    expect(widthMultiplier(1366)).toBeLessThanOrEqual(1.25);
  });
});

describe('buildResponsiveInfo', () => {
  const win = (width: number, height: number, fontScale = 1) =>
    ({ width, height, fontScale, scale: 2 } as any);

  test('iPhone SE in portrait', () => {
    const r = buildResponsiveInfo(win(320, 568));
    expect(r.bp).toBe('xs');
    expect(r.isPhone).toBe(true);
    expect(r.isShort).toBe(true);
    expect(r.isNarrow).toBe(true);
    expect(r.isPortrait).toBe(true);
  });

  test('iPad portrait', () => {
    const r = buildResponsiveInfo(win(820, 1180));
    expect(r.bp).toBe('tablet');
    expect(r.isTablet).toBe(true);
    expect(r.isPhone).toBe(false);
    expect(r.cols({ tablet: 2, desktop: 3 })).toBe(2);
  });

  test('large fontScale flips isLargeText', () => {
    const r = buildResponsiveInfo(win(393, 852, 1.4));
    expect(r.isLargeText).toBe(true);
  });

  test('density compact shrinks scale()', () => {
    const normal = buildResponsiveInfo(win(393, 852), 'normal');
    const compact = buildResponsiveInfo(win(393, 852), 'compact');
    expect(compact.scale(48)).toBeLessThan(normal.scale(48));
  });
});
