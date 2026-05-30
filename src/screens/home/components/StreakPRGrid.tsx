import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { normalizeWeekDots, pluralizeDaysRu } from '../../../utils/layout';

interface Props {
  /** Current streak in days. */
  streakDays: number;
  /** Bitmap of the last 7 days — 1 for completed, 0 for missed.
   *  Index 0 = oldest, 6 = today. */
  weekDots: (0 | 1)[];
  /** Personal record — weight in kilograms. */
  prKg: number;
  /** What exercise the PR is for, e.g. "Жим штанги". */
  prLabel?: string;
}

/**
 * Direction A home card grid — two tiles side by side:
 *
 *   ┌─────────────────┐ ┌──────────────┐
 *   │ 🔥 СТРИК        │ │ 🏆 РЕКОРД    │
 *   │                 │ │              │
 *   │ 47 дней         │ │ 120 кг       │
 *   │                 │ │              │
 *   │ ▓ ▓ ▓ ▓ ▓ ▓ ▒   │ │ Жим штанги   │
 *   └─────────────────┘ └──────────────┘
 *
 * Streak tile: gold eyebrow, huge day count, then a 7-bar weekly grid
 * where filled bars = completed workouts and dim bars = missed days.
 * PR tile: muted eyebrow, big weight with small unit, subtle caption.
 */
export const StreakPRGrid: React.FC<Props> = ({
  streakDays,
  weekDots,
  prKg,
  prLabel = 'Жим штанги · новый PR',
}) => {
  const colors = useThemeColors();

  // Defensive clamps: a negative streak or weird PR shouldn't crash the UI.
  const safeStreakDays = Number.isFinite(streakDays) && streakDays >= 0 ? Math.floor(streakDays) : 0;
  const safePrKg = Number.isFinite(prKg) && prKg >= 0 ? prKg : 0;
  // Normalize to exactly 7 dots — pads / slices / coerces non-binary.
  const safeDots = normalizeWeekDots(weekDots);
  // Russian plural handles 11-14 correctly (e.g. 11 дней, not 11 день).
  const dayLabel = pluralizeDaysRu(safeStreakDays);

  return (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.lg }}>
      {/* Streak tile — takes more width (design uses 1.2fr vs 1fr split). */}
      <View
        style={{
          flex: 1.2,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 22,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}>
          <Icon name="flame" size={18} color={colors.primary} />
          <Text
            style={[
              typography.metaLabel,
              {
                color: colors.primary,
                textTransform: 'uppercase',
              },
            ]}
          >
            Стрик
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text
            style={[typography.number, { color: colors.text }]}
          >
            {safeStreakDays}
          </Text>
          <Text
            style={[typography.body, { color: colors.textSecondary, marginLeft: spacing.xs }]}
          >
            {dayLabel}
          </Text>
        </View>
        {/* 7-bar week strip. Filled bars get gold, missed bars get a dim
            translucent fill so the user still sees what's missing. */}
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 12 }}>
          {safeDots.map((d, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 22,
                borderRadius: 5,
                backgroundColor: d ? colors.primary : colors.border,
                opacity: d ? 1 : 0.6,
              }}
            />
          ))}
        </View>
      </View>

      {/* PR tile */}
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 22,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}>
          <Icon name="trophy" size={18} color={colors.textSecondary} />
          <Text
            style={[
              typography.metaLabel,
              {
                color: colors.textSecondary,
                textTransform: 'uppercase',
              },
            ]}
          >
            Рекорд
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[typography.h2, { color: colors.text }]}>
            {safePrKg}
          </Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginLeft: spacing.xs }]}>
            кг
          </Text>
        </View>
        <Text
          style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}
          numberOfLines={1}
        >
          {prLabel}
        </Text>
      </View>
    </View>
  );
};
