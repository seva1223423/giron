import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { AnimatedPressable } from '../../../components';
import type { WeekPlanEntry } from '../../../store/useWorkoutStore';
import type { Workout } from '../../../types';

/**
 * The one thing this screen exists to answer: what do I train today.
 *
 * Until now nothing on the workouts screen said it. The user arrived, saw
 * three tabs — Начать, Программы, Библиотека — and had to remember which day
 * of their own split it was. The answer was in the weekly plan, two screens
 * away, and the "Повторить прошлую" button that should have covered the gap
 * did nothing.
 *
 * Three states, in the order they matter:
 *   in progress — a workout is already running, everything else can wait
 *   planned     — the weekly plan has a day for today
 *   open        — nothing planned; offer to repeat the last session
 */

interface Props {
  activeName?: string | null;
  plan: WeekPlanEntry | null;
  /** Size of the session, e.g. "5 упражнений · ~55 мин". Hidden when unknown. */
  progressLabel?: string | null;
  lastWorkout: Workout | null;
  daysSinceLast: number | null;
  onPress: () => void;
  onRepeat: () => void;
}

/** "вчера" reads better than "1 день назад" — and 0 means today. */
function agoLabel(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 5) return `${days} дня назад`;
  return `${days} дней назад`;
}

export const TodayCard: React.FC<Props> = ({
  activeName, plan, progressLabel, lastWorkout, daysSinceLast, onPress, onRepeat,
}) => {
  const colors = useThemeColors();
  const hasPlan = !!plan && (!!plan.routineId || plan.exercises.length > 0);

  // Live workout wins over everything — it is the only thing the user can be
  // in the middle of, and losing it is the worst outcome on this screen.
  if (activeName) {
    return (
      <AnimatedPressable
        onPress={onPress}
        scaleDown={0.985}
        style={[styles.card, { backgroundColor: colors.success + '12', borderColor: colors.success + '55' }] as any}
        accessibilityRole="button"
        accessibilityLabel={`Продолжить тренировку ${activeName}`}
      >
        <Text style={[typography.metaLabel, { color: colors.success }]}>ИДЁТ СЕЙЧАС</Text>
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.xs }]} numberOfLines={2}>
          {activeName}
        </Text>
      </AnimatedPressable>
    );
  }

  if (hasPlan) {
    return (
      <AnimatedPressable
        onPress={onPress}
        scaleDown={0.985}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.primary + '3D' }] as any}
        accessibilityRole="button"
        accessibilityLabel={`Сегодня: ${plan!.name}. Начать`}
      >
        <Text style={[typography.metaLabel, { color: colors.primary }]}>СЕГОДНЯ</Text>
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.xs }]} numberOfLines={2}>
          {plan!.name}
        </Text>
        {!!progressLabel && (
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            {progressLabel}
          </Text>
        )}
      </AnimatedPressable>
    );
  }

  // Nothing planned. Say it in two words and hand over the fastest way back
  // into training. The line that used to sit here — "повтори прошлую, возьми
  // шаблон или выбери программу" — narrated the shelves drawn right below it.
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>СЕГОДНЯ</Text>
      <Text style={[typography.h3, { color: colors.text, marginTop: spacing.xs }]}>
        Плана нет
      </Text>

      {lastWorkout && (
        <AnimatedPressable
          onPress={onRepeat}
          scaleDown={0.98}
          style={[styles.repeat, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' }] as any}
          accessibilityRole="button"
          accessibilityLabel={`Повторить прошлую тренировку ${lastWorkout.name}`}
        >
          <Icon name="refresh" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: colors.primary }]}>Повторить прошлую</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
              {lastWorkout.name}{daysSinceLast !== null ? ` · ${agoLabel(daysSinceLast)}` : ''}
            </Text>
          </View>
          <Icon name="chev" size={16} color={colors.primary} />
        </AnimatedPressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
  repeat: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1,
    marginTop: spacing.lg, minHeight: 56,
  },
});
