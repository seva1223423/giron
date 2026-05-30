import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectionStore, useThemeColors } from '../store';
import { Spinner } from './Spinner';
import { typography } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';

/**
 * Top banner that surfaces network state to the user (round 290).
 *
 * Two states (priority order):
 *   1. Offline (red, "Нет соединения") — shown when `isOnline === false`.
 *      The store flag is flipped by the axios response interceptor when
 *      a request fails with a network error. After the round-290 timeout
 *      bump (15s → 45s) and 3-attempt retry, this only fires when the
 *      retry budget is genuinely exhausted.
 *   2. Slow (amber, "Соединение медленное…") — shown when at least one
 *      axios request has been in-flight > 8s. The 8s threshold sits well
 *      below the 45s timeout so the user gets feedback long before any
 *      timeout fires; useful for VPN-routed Russian users hitting Render
 *      cold-start.
 *
 * Reactive — appears/disappears as the store mutates. No imperative API.
 * pointerEvents="none" so it never blocks taps underneath.
 */
export const NetworkStatusBar: React.FC = () => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isOnline = useConnectionStore((s) => s.isOnline);
  const slowCount = useConnectionStore((s) => s.slowRequestCount);

  const variant: 'offline' | 'slow' | null = !isOnline ? 'offline' : slowCount > 0 ? 'slow' : null;
  if (!variant) return null;

  const bg = variant === 'offline' ? colors.error : colors.warning;
  const label = variant === 'offline' ? 'Нет соединения' : 'Соединение медленное…';

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xs, backgroundColor: bg }]} pointerEvents="none">
      <View style={styles.row}>
        {variant === 'slow' ? <Spinner color={colors.textInverse} size={14} /> : null}
        <Text style={[typography.smallMedium, { color: colors.textInverse }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    zIndex: 1000,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
});
