import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

interface AdaptiveGridProps {
  /** Items count per breakpoint. Default: 1 phone, 2 tablet, 3 desktop. */
  cols?: { phone?: number; tablet?: number; desktop?: number };
  /** Gap between cells (logical px). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Drop-in responsive grid. Lays children out in N columns based on breakpoint.
 *
 *   <AdaptiveGrid cols={{ phone: 1, tablet: 2 }} gap={16}>
 *     <Card />
 *     <Card />
 *   </AdaptiveGrid>
 *
 * Uses CSS-grid-like math with flexBasis percentages so it works on RN core
 * (no `gap` polyfill needed for RN < 0.71).
 */
export function AdaptiveGrid({
  cols = { phone: 1, tablet: 2, desktop: 3 },
  gap = 16,
  style,
  children,
}: AdaptiveGridProps) {
  const r = useResponsive();
  const n = r.cols(cols);
  const items = React.Children.toArray(children);

  // Compute basis so n items + (n-1) gaps fit one row. Cast to RN
  // DimensionValue (TS expects "${number}%" template literal, our
  // computed string satisfies that at runtime).
  const basisPct = (n === 1 ? '100%' : `${100 / n}%`) as `${number}%`;

  return (
    <View style={[styles.row, { marginHorizontal: -gap / 2, marginTop: -gap }, style]}>
      {items.map((child, i) => (
        <View
          key={i}
          style={{
            flexBasis: basisPct,
            maxWidth: basisPct,
            paddingHorizontal: gap / 2,
            marginTop: gap,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
