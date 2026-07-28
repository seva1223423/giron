import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectionStore, useThemeColors } from '../store';
import { typography } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';

/**
 * Top banner for the one network state worth interrupting for: no connection.
 *
 * There used to be a second, amber "Соединение медленное…" state on any request
 * still running after a few seconds. The server sleeps on Render's free tier
 * and takes 30-50s to wake, so that banner was up more often than it was down —
 * it stopped carrying information and became something to look past. Raising
 * the threshold only made it slower to appear, not rarer.
 *
 * Slowness is already visible where it happens: buttons show a spinner, lists
 * show skeletons. A banner across the top added nothing those did not.
 *
 * Reactive — appears/disappears as the store mutates. pointerEvents="none" so
 * it never blocks taps underneath.
 */
export const NetworkStatusBar: React.FC = () => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Debounced, so a momentary blip doesn't flash the banner.
  const isOfflineConfirmed = useConnectionStore((s) => s.isOfflineConfirmed);
  if (!isOfflineConfirmed) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xs, backgroundColor: colors.error }]} pointerEvents="none">
      <View style={styles.row}>
        <Text style={[typography.smallMedium, { color: colors.textInverse }]} numberOfLines={1}>
          Нет соединения
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
