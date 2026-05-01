import React from 'react';
import { Pressable, StyleSheet, View, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { Text } from './Text';
import { useThemeStore } from '../store/useThemeStore';
import { useResponsive } from '../hooks/useResponsive';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const SIZE_HEIGHT: Record<Size, number> = { sm: 36, md: 48, lg: 56 };
const SIZE_FONT: Record<Size, number> = { sm: 13, md: 15, lg: 17 };
const SIZE_PAD: Record<Size, number> = { sm: 12, md: 18, lg: 22 };

/**
 * Universal Iron Gym button — adaptive height/font and theme-aware colors.
 * Always at least 44pt tall (md/lg) to satisfy hit-area guidelines.
 */
export function ResponsiveButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  disabled,
  leading,
  trailing,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: colors.primary ?? colors.text, fg: colors.background, border: 'transparent' },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
    destructive: { bg: colors.error ?? '#EF4444', fg: '#FFF', border: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          height: r.scale(SIZE_HEIGHT[size]),
          paddingHorizontal: r.scale(SIZE_PAD[size]),
          borderRadius: r.scale(12),
          width: fullWidth ? '100%' : undefined,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {leading ? <View style={{ marginRight: 8 }}>{leading}</View> : null}
          <Text style={{ color: palette.fg, fontSize: r.fontScale_(SIZE_FONT[size]), fontWeight: '600' }}>
            {label}
          </Text>
          {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center' },
});
