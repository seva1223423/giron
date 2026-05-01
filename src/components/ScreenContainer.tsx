import React from 'react';
import {
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
  ViewProps,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { contentMaxWidth, screenPaddingByBp } from '../theme/spacing';
import { useThemeStore } from '../store/useThemeStore';

interface ScreenContainerProps extends ViewProps {
  /** Add safe-area top padding (notch). Default true. */
  safeTop?: boolean;
  /** Add safe-area bottom padding (home indicator). Default true. */
  safeBottom?: boolean;
  /** Apply standard horizontal screen gutter from spacing tokens. Default true. */
  gutter?: boolean;
  /** Center content with a max-width on tablet+. Default true. */
  centered?: boolean;
  /** Override background color (defaults to theme background). */
  bg?: string;
  children?: React.ReactNode;
}

/**
 * Top-level wrapper for every screen.
 *
 * Handles in one place: safe-area padding, screen gutter, max-width centering
 * on tablets/desktop, theme background. Drop this around the root of any
 * screen and you immediately get correct behavior on every device class.
 */
export function ScreenContainer({
  safeTop = true,
  safeBottom = true,
  gutter = true,
  centered = true,
  bg,
  style,
  children,
  ...rest
}: ScreenContainerProps) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((s) => s.colors);

  const horizontalPad = gutter ? screenPaddingByBp[r.bp] : 0;
  const maxWidth = centered ? contentMaxWidth[r.bp] : undefined;

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: bg ?? colors.background },
        style,
      ]}
      {...rest}
    >
      <View
        style={[
          styles.flex,
          {
            paddingTop: safeTop ? Math.max(insets.top, Platform.OS === 'android' ? 12 : 0) : 0,
            paddingBottom: safeBottom
              ? Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0)
              : 0,
            paddingHorizontal: horizontalPad,
            alignSelf: 'center',
            width: '100%',
            maxWidth,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

interface ScreenScrollProps extends ScrollViewProps {
  safeTop?: boolean;
  safeBottom?: boolean;
  gutter?: boolean;
  centered?: boolean;
  bg?: string;
  /** Extra space at the bottom, on top of safe area. Default 24. */
  bottomExtra?: number;
}

/**
 * Same as ScreenContainer but scrollable. Applies the gutter via
 * `contentContainerStyle` so the scrollbar still sits at the screen edge.
 */
export function ScreenScroll({
  safeTop = true,
  safeBottom = true,
  gutter = true,
  centered = true,
  bg,
  bottomExtra = 24,
  contentContainerStyle,
  style,
  children,
  ...rest
}: ScreenScrollProps) {
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((s) => s.colors);

  const horizontalPad = gutter ? screenPaddingByBp[r.bp] : 0;
  const maxWidth = centered ? contentMaxWidth[r.bp] : undefined;

  return (
    <ScrollView
      {...rest}
      style={[styles.flex, { backgroundColor: bg ?? colors.background }, style]}
      contentContainerStyle={[
        {
          paddingTop: safeTop ? Math.max(insets.top, Platform.OS === 'android' ? 12 : 0) : 0,
          paddingBottom:
            (safeBottom ? Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0) : 0) +
            bottomExtra,
          paddingHorizontal: horizontalPad,
          alignSelf: 'center',
          width: '100%',
          maxWidth,
        },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
