import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeColors } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Icon, type IconName } from '../../../components';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme';

interface Action {
  /** Icon name from the shared Icon set (24pt stroke). */
  icon: IconName;
  label: string;
  subtitle: string;
  onPress: () => void;
  /** Icon-tile accent — picks from the Direction A macro palette
   *  (audit R-2026-05-22 V3 design pick). When unset, the tile uses
   *  the gold primary — matching the V1 production look. The point
   *  of per-action colour is faster visual scanning ("еда=терракот,
   *  AI=янтарь, вес=золото") on a 4-tile grid where all-gold tiles
   *  read identical at a glance.
   *
   *  Maps to theme tokens:
   *    'primary'  → colors.primary (gold, default)
   *    'calories' → colors.calories (terracotta)
   *    'protein'  → colors.protein (gold deep)
   *    'fats'     → colors.fats (amber)
   *    'carbs'    → colors.carbs (sage) */
  accent?: 'primary' | 'calories' | 'protein' | 'fats' | 'carbs';
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
 * Icons are SVG from the shared Icon set so they stay sharp on any DPR.
 */
export const QuickActionsGrid: React.FC<Props> = ({ actions }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      {actions.map((a, i) => {
        // Resolve the accent to an actual theme colour. Defaults to
        // primary so callers that don't opt in keep the V1 look.
        const accentColor =
          a.accent === 'calories' ? colors.calories
          : a.accent === 'protein' ? colors.protein
          : a.accent === 'fats' ? colors.fats
          : a.accent === 'carbs' ? colors.carbs
          : colors.primary;
        return (
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
                backgroundColor: accentColor + '24' /* ~14% — slightly more saturated than V1's 10% gold; the non-gold tints need it to read as colour and not noise */,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Icon name={a.icon} size={16} color={accentColor} />
            </View>
            <Text style={[typography.smallLite, { color: colors.text }]}>
              {a.label}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {a.subtitle}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
