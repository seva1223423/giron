import React from 'react';
import { Pressable, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Text } from './Text';
import { useThemeStore } from '../store/useThemeStore';
import { useResponsive } from '../hooks/useResponsive';

interface IconButtonProps {
  onPress?: () => void;
  /** Icon node — usually a Lucide / SVG component sized to ~20-24px */
  icon: React.ReactNode;
  /** Optional badge dot (e.g. unread). */
  badge?: boolean | number;
  variant?: 'plain' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

const SIZE_MAP = { sm: 36, md: 44, lg: 52 } as const;

/**
 * Square tappable icon. Always ≥44pt (md/lg) — sm uses 36 with hitSlop bump
 * so the touch target still satisfies guidelines.
 */
export function IconButton({
  onPress,
  icon,
  badge,
  variant = 'plain',
  size = 'md',
  disabled,
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();
  const dim = r.scale(SIZE_MAP[size]);

  const palette = {
    plain: { bg: 'transparent', border: 'transparent' },
    filled: { bg: colors.surface, border: 'transparent' },
    outlined: { bg: 'transparent', border: colors.border },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={size === 'sm' ? 8 : 4}
      style={({ pressed }) => [
        styles.btn,
        {
          width: dim,
          height: dim,
          borderRadius: r.scale(12),
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'outlined' ? StyleSheet.hairlineWidth : 0,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.primary ?? '#EF4444' }]}>
          {typeof badge === 'number' ? (
            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>
              {badge > 9 ? '9+' : badge}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

interface IconLabelProps {
  icon: React.ReactNode;
  label: string;
  /** Optional secondary line. */
  hint?: string;
  /** Stack vertically (default) or horizontally. */
  direction?: 'row' | 'column';
  onPress?: () => void;
}

/**
 * Icon + label pair — used in tab bars, toolbars, action grids.
 */
export function IconLabel({ icon, label, hint, direction = 'column', onPress }: IconLabelProps) {
  const colors = useThemeStore((s) => s.colors);
  const r = useResponsive();
  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: any) => [
        {
          flexDirection: direction,
          alignItems: 'center',
          justifyContent: 'center',
          gap: direction === 'row' ? 8 : 4,
          opacity: onPress && pressed ? 0.7 : 1,
          minHeight: 44,
          paddingHorizontal: 8,
        },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      {icon}
      <View style={direction === 'column' ? { alignItems: 'center' } : { flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: r.fontScale_(12), fontWeight: '600' }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: colors.textMuted ?? colors.text, fontSize: r.fontScale_(10) }}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
