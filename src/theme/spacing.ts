import { getResponsiveSnapshot, scaleSize } from './responsive';

/**
 * Static spacing (legacy import — keep so existing screens keep working).
 *
 * For new screens, prefer `useResponsive()` + `r.scale(spacing.lg)` so paddings
 * shrink on 320pt phones and grow on tablets.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

/**
 * Width-aware spacing snapshot. Returns scaled spacing tokens for the *current*
 * window size at the moment this is called. Useful inside `StyleSheet.create()`
 * but won't auto-update on rotation — for that use the `useResponsive` hook.
 */
export function getResponsiveSpacing() {
  const { width } = getResponsiveSnapshot();
  return {
    xs: scaleSize(spacing.xs, width),
    sm: scaleSize(spacing.sm, width),
    md: scaleSize(spacing.md, width),
    lg: scaleSize(spacing.lg, width),
    xl: scaleSize(spacing.xl, width),
    xxl: scaleSize(spacing.xxl, width),
    xxxl: scaleSize(spacing.xxxl, width),
    huge: scaleSize(spacing.huge, width),
  } as Record<keyof typeof spacing, number>;
}

/**
 * Standard horizontal screen padding by breakpoint. Use as the gutter on the
 * outermost ScrollView / SafeAreaView.
 *
 *   xs/sm   16   sensible phone gutter
 *   md/lg   20   roomier on Pro/Pro Max
 *   tablet  32   matches design canvas
 *   desktop 48   keeps text columns from going edge-to-edge
 */
export const screenPaddingByBp = {
  xs: 16,
  sm: 16,
  md: 20,
  lg: 20,
  tablet: 32,
  desktop: 48,
} as const;

/** Max readable column width — applied on tablet+ to keep paragraphs comfortable. */
export const contentMaxWidth = {
  xs: undefined,
  sm: undefined,
  md: undefined,
  lg: undefined,
  tablet: 720,
  desktop: 920,
} as const;
