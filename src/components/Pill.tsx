/**
 * Pill — small inline capsule for numbers / short labels.
 *
 * Direction A spec (chat2.md): "Pill‑компонент для чисел в тексте — единая
 * визуальная грамматика." Renders a value (e.g. `100`, `+250 мл`, `85 кг`)
 * with a tinted background and a 1px accent border. Used inline in chat
 * messages, in DiffCard, and anywhere we want a number to stand out from
 * the surrounding body text without screaming.
 *
 * Variants:
 *   default     — gold tint (accent + alpha) on graphite
 *   success     — sage tint (e.g. "+1 подход выполнен")
 *   danger      — terracotta tint (e.g. "-5 кг")
 *   muted       — border-only, no fill (for old/before values in DiffCard)
 *
 * The component renders a single <View> with a <Text> inside so it can be
 * positioned via parent layout (text-line embedding requires wrapping in
 * <Text> at the call site).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../store/useThemeStore';
import type { Colors } from '../theme/colors';

export type PillVariant = 'default' | 'success' | 'danger' | 'muted';

interface PillProps {
  text: string | number;
  variant?: PillVariant;
  size?: 'sm' | 'md';
}

const PillImpl: React.FC<PillProps> = ({ text, variant = 'default', size = 'md' }) => {
  const colors = useThemeColors();

  const tint = pickTint(variant, colors);
  const fontSize = size === 'sm' ? 10 : 12;
  const paddingV = size === 'sm' ? 1 : 2;
  const paddingH = size === 'sm' ? 5 : 8;

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: tint.bg,
          borderColor: tint.border,
          paddingVertical: paddingV,
          paddingHorizontal: paddingH,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: tint.text, fontSize },
        ]}
        numberOfLines={1}
      >
        {String(text)}
      </Text>
    </View>
  );
};

function pickTint(variant: PillVariant, colors: Colors) {
  switch (variant) {
    case 'success':
      return {
        bg: colors.success + '22',
        border: colors.success + '55',
        text: colors.success,
      };
    case 'danger':
      return {
        bg: colors.error + '22',
        border: colors.error + '55',
        text: colors.error,
      };
    case 'muted':
      return {
        bg: 'transparent',
        border: colors.border,
        text: colors.textSecondary,
      };
    case 'default':
    default:
      return {
        bg: colors.primary + '22',
        border: colors.primary + '55',
        text: colors.primary,
      };
  }
}

// React.memo: Pills appear inline in chat messages (potentially dozens
// per turn during a long AI conversation). Default shallow equality on
// {text, variant, size} is enough.
export const Pill = React.memo(PillImpl);

const styles = StyleSheet.create({
  box: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
