import { Dimensions, PixelRatio, Platform, ScaledSize, StyleSheet } from 'react-native';

/**
 * Iron Gym responsive system.
 *
 * Brejkpoints based on real device widths (logical pixels / "points"):
 *   xs       <360   — iPhone SE (1st gen 320), Galaxy Z Fold cover (~280)
 *   sm       360-389 — most stock Androids, iPhone 13 mini (375), iPhone SE 2/3 (375)
 *   md       390-429 — iPhone 14/15 (390), iPhone 14/15 Pro (393), Xiaomi 14 (~386)
 *   lg       430-639 — iPhone Pro Max (430), Pixel Pro XL, large Androids
 *   tablet   640-1023 — iPad mini portrait (744), iPad portrait (810/820), foldable open
 *   desktop  ≥1024  — iPad landscape, iPad Pro, web/desktop
 *
 * Density modes:
 *   compact   — UI shrinks ~12% (advanced users, more on screen)
 *   normal    — baseline (default)
 *   spacious  — UI grows ~12% (older users, more breathing room)
 */

export const breakpoints = {
  xs: 0,
  sm: 360,
  md: 390,
  lg: 430,
  tablet: 640,
  desktop: 1024,
} as const;

export type Breakpoint = keyof typeof breakpoints;

export type Density = 'compact' | 'normal' | 'spacious';
export const DENSITY_MULTIPLIER: Record<Density, number> = {
  compact: 0.88,
  normal: 1.0,
  spacious: 1.12,
};

export type ResponsiveValue<T> = T | Partial<Record<Breakpoint, T>>;

export function resolveBreakpoint(width: number): Breakpoint {
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  if (width >= breakpoints.lg) return 'lg';
  if (width >= breakpoints.md) return 'md';
  if (width >= breakpoints.sm) return 'sm';
  return 'xs';
}

const BP_ORDER: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'tablet', 'desktop'];

/** Pick the most-specific value for a current breakpoint, falling back down the chain. */
export function pickResponsive<T>(value: ResponsiveValue<T>, bp: Breakpoint): T {
  if (value === null || typeof value !== 'object') return value as T;
  const map = value as Partial<Record<Breakpoint, T>>;
  const idx = BP_ORDER.indexOf(bp);
  for (let i = idx; i >= 0; i--) {
    const v = map[BP_ORDER[i]];
    if (v !== undefined) return v as T;
  }
  // Fallback: scan upward if no smaller match
  for (let i = idx + 1; i < BP_ORDER.length; i++) {
    const v = map[BP_ORDER[i]];
    if (v !== undefined) return v as T;
  }
  return undefined as unknown as T;
}

/**
 * Reference width = iPhone 14 Pro (393pt). Scales tokens up/down softly
 * so a 320pt screen doesn't look cramped and a 768pt tablet doesn't look
 * like a giant phone.
 *
 * Returns a multiplier in [0.88 .. 1.25] — never extreme.
 */
export function widthMultiplier(width: number): number {
  const ref = 393;
  const raw = width / ref;
  // Soften: take square root so growth is sublinear, then clamp.
  const eased = Math.sqrt(raw);
  return Math.max(0.88, Math.min(1.25, eased));
}

/** Round to nearest 0.5 px to avoid sub-pixel blur on hairlines. */
export function px(value: number): number {
  return PixelRatio.roundToNearestPixel(value);
}

export function scaleSize(value: number, width: number, density: Density = 'normal'): number {
  return px(value * widthMultiplier(width) * DENSITY_MULTIPLIER[density]);
}

/**
 * Hairline that's at least 1 logical pixel even on @3x displays.
 * RN's StyleSheet.hairlineWidth can be too thin (0.33) on dense screens.
 */
export const hairline = Math.max(StyleSheet.hairlineWidth, 0.5);

/**
 * Modular type scale — multiply token by ratio for next step up / down.
 * Useful for hero numbers that should scale with screen width but stay
 * proportional to body text.
 */
export const TYPE_RATIO = 1.18;

export interface ResponsiveInfo {
  width: number;
  height: number;
  bp: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLandscape: boolean;
  isPortrait: boolean;
  isShort: boolean;            // height < 700 — iPhone SE, landscape phones
  isNarrow: boolean;           // width < 360 — Galaxy Fold cover, SE 1st
  isLargeText: boolean;        // user has fontScale > 1.2 (Dynamic Type heavy)
  fontScale: number;           // user accessibility setting
  pixelRatio: number;
  density: Density;            // current density mode
  /** Width-aware sizing including density multiplier. */
  scale: (value: number) => number;
  /** Pick the right value for current breakpoint. */
  pick: <T>(value: ResponsiveValue<T>) => T;
  /** Returns columns count for typical grid layouts. */
  cols: (opts?: { phone?: number; tablet?: number; desktop?: number }) => number;
  /** Pick spacing token by breakpoint, with density applied. */
  space: (key: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl' | 'huge') => number;
  /** Type scale step from a base — useful for adaptive headings. */
  fontScale_(base: number, step?: number): number;
  /** True when running on web / desktop builds. */
  isWeb: boolean;
}

const BASE_SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 };

export function buildResponsiveInfo(
  window: ScaledSize,
  density: Density = 'normal',
): ResponsiveInfo {
  const { width, height, fontScale, scale } = window;
  const bp = resolveBreakpoint(width);
  const isLandscape = width > height;
  const isPortrait = !isLandscape;
  const isShort = height < 700;
  const isNarrow = width < 360;
  const isLargeText = fontScale > 1.2;
  const isTablet = bp === 'tablet';
  const isDesktop = bp === 'desktop';
  const isPhone = !isTablet && !isDesktop;

  return {
    width,
    height,
    bp,
    isPhone,
    isTablet,
    isDesktop,
    isLandscape,
    isPortrait,
    isShort,
    isNarrow,
    isLargeText,
    fontScale,
    pixelRatio: scale,
    density,
    scale: (v: number) => scaleSize(v, width, density),
    pick: <T,>(value: ResponsiveValue<T>) => pickResponsive(value, bp),
    cols: ({ phone = 1, tablet = 2, desktop = 3 } = {}) =>
      isDesktop ? desktop : isTablet ? tablet : phone,
    space: (key) => scaleSize(BASE_SPACING[key], width, density),
    fontScale_: (base: number, step: number = 0) =>
      px(base * Math.pow(TYPE_RATIO, step) * widthMultiplier(width) * DENSITY_MULTIPLIER[density]),
    isWeb: Platform.OS === 'web',
  };
}

/** Synchronous snapshot — handy for StyleSheet.create() that runs once at module load. */
export function getResponsiveSnapshot(density: Density = 'normal'): ResponsiveInfo {
  return buildResponsiveInfo(Dimensions.get('window'), density);
}
