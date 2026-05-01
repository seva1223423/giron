import React from 'react';
import { Pressable, PressableProps, View, ViewStyle, StyleProp } from 'react-native';

interface HitTargetProps extends PressableProps {
  /** Minimum logical-px size (default 44). */
  size?: number;
  /** Visual content; HitTarget guarantees hit area without changing layout. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pressable wrapper that guarantees a 44×44pt minimum hit area (Apple HIG /
 * Material 48dp minimum). The inner content stays its visual size; the hit
 * area is expanded via `hitSlop` so layout doesn't change.
 *
 * Use everywhere small icon buttons appear: bell, close, dots, chevrons.
 */
export function HitTarget({ size = 44, children, style, ...rest }: HitTargetProps) {
  return (
    <Pressable
      {...rest}
      hitSlop={Math.max(0, (size - 24) / 2)}
      style={({ pressed }) => [
        { opacity: pressed ? 0.6 : 1 },
        typeof style === 'function' ? undefined : style,
      ]}
    >
      <View>{children}</View>
    </Pressable>
  );
}
