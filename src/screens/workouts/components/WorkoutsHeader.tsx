import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeStore } from '../../../store';
import { Icon, type IconName } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  navigation: any;
}

/** Shortcut pills — the horizontal row under the title. Each maps an
 *  Icon name (from the shared set) to a Workouts-stack screen target. */
const SHORTCUTS: Array<{ label: string; icon: IconName; screen: string }> = [
  { label: 'История', icon: 'chart', screen: 'WorkoutHistory' },
  { label: 'Рутины', icon: 'grid', screen: 'Routines' },
  { label: 'Кардио', icon: 'heart', screen: 'Cardio' },
  { label: 'Шагомер', icon: 'flame', screen: 'Steps' },
  { label: 'Рекорды', icon: 'trophy', screen: 'PersonalRecords' },
  { label: 'Неделя', icon: 'timer', screen: 'WeeklyPlan' },
  { label: '1ПМ', icon: 'target', screen: 'OneRMCalculator' },
  { label: 'Блины', icon: 'dumbbell', screen: 'PlateCalculator' },
];

/**
 * Workouts screen header — pixel-ish copy of A_Workouts. Per the
 * Direction A design:
 *
 *   ── Title row ──────────────────────────── + (gold +)
 *   ИСТОРИЯ | РУТИНЫ | КАРДИО | РЕКОРДЫ | ... (pill row)
 *   ────────────────────────────────────────
 *   Tabs below (handled by WorkoutsTabBar)
 *
 * Glyphs migrated from raw unicode (◧ ◉ ◑ ◎ ◈) to SVG icons from the
 * shared set; pills lose the decorative `fontWeight: 700` on the glyph
 * since the icon provides its own weight.
 */
export const WorkoutsHeader: React.FC<Props> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View style={{ paddingTop: safeTop, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {/* Title row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Тренировки</Text>
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.navigate('CustomWorkout'); }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Новая свободная тренировка"
          accessibilityRole="button"
        >
          <Icon name="plus" size={20} color={colors.textInverse} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {/* Shortcuts row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.sm }}
      >
        {SHORTCUTS.map((s) => (
          <TouchableOpacity
            key={s.screen}
            onPress={() => { haptic.selection(); navigation.navigate(s.screen); }}
            accessibilityLabel={s.label}
            accessibilityRole="button"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingVertical: 7, paddingHorizontal: spacing.md,
              borderRadius: borderRadius.full,
              backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Icon name={s.icon} size={14} color={colors.primary} />
            <Text style={[typography.small, { color: colors.textSecondary, fontWeight: '600' }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
