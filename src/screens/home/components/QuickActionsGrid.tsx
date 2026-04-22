import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Action {
  /** Emoji or glyph for the icon tile. Kept simple so we don't need an icon lib. */
  icon: string;
  label: string;
  subtitle: string;
  onPress: () => void;
}

interface Props {
  actions: Action[];
}

/**
 * 2-up grid of quick actions — matches the Direction A home "Сканировать
 * еду / Добавить вес" pair:
 *
 *   ┌─────────────────┐ ┌─────────────────┐
 *   │ ▣               │ │ ▥               │  ← gold-tinted icon tile
 *   │ Сканировать еду │ │ Добавить вес    │
 *   │ ИИ определит КБЖУ│ │ Утреннее взвеш. │
 *   └─────────────────┘ └─────────────────┘
 *
 * Accepts an array so callers can pass any 2 (or more) relevant actions
 * — the design shows exactly two but the grid auto-flows to 2 per row.
 */
export const QuickActionsGrid: React.FC<Props> = ({ actions }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      {actions.map((a, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => { haptic.selection(); a.onPress(); }}
          accessibilityLabel={a.label}
          accessibilityHint={a.subtitle}
          accessibilityRole="button"
          style={{
            flexGrow: 1,
            flexBasis: '48%',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: colors.primary + '18',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 16 }}>{a.icon}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
            {a.label}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {a.subtitle}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
