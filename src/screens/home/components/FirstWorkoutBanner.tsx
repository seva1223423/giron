/**
 * FirstWorkoutBanner — activation nudge for users who registered
 * >24h ago and still have zero completed workouts (FUNNEL-2).
 *
 * Extracted from HomeScreen.tsx (audit R-2026-05-22, Tier 1 item 3).
 * Eligibility check + JSX moved into one memoized component so
 * HomeScreen no longer recomputes the .some() scan AND rebuilds the
 * banner JSX on every parent render.
 *
 * Visibility logic stays in here (caller passes raw user+history) so
 * the banner is genuinely opt-out via parent — caller doesn't need
 * to know the "24h + zero workouts" rule.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../../../components';
import { spacing } from '../../../theme/spacing';
import type { Colors } from '../../../theme/colors';
import type { Workout } from '../../../types';

interface FirstWorkoutBannerProps {
  userCreatedAt: string | Date | null | undefined;
  workoutHistory: Workout[];
  dismissed: boolean;
  colors: Colors;
  onDismiss: () => void;
  onStart: () => void;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const FirstWorkoutBannerImpl: React.FC<FirstWorkoutBannerProps> = ({
  userCreatedAt,
  workoutHistory,
  dismissed,
  colors,
  onDismiss,
  onStart,
}) => {
  if (dismissed) return null;
  if (!userCreatedAt) return null;
  const ageMs = Date.now() - new Date(userCreatedAt).getTime();
  if (ageMs < ONE_DAY_MS) return null;
  const hasAnyWorkout = workoutHistory.some((w) => w.completedAt);
  if (hasAnyWorkout) return null;

  return (
    <View style={[styles.banner, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '10', marginBottom: spacing.md }]}>
      <Icon name="dumbbell" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.primary }]}>Время первой тренировки</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
          Ты с нами больше суток — попробуй короткую тренировку. Без неё профиль не оживает.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={onStart}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primary }}
          accessibilityRole="button"
          accessibilityLabel="Начать первую тренировку"
        >
          <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '700' }}>Начать</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={12}
          style={{ padding: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Скрыть напоминание"
        >
          <View style={{ transform: [{ rotate: '45deg' }] }}>
            <Icon name="plus" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const FirstWorkoutBanner = React.memo(FirstWorkoutBannerImpl);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 18 },
});
