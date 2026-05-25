/**
 * FirstWorkoutBanner — activation nudge for users who registered
 * >24h ago and still have zero completed workouts (FUNNEL-2).
 *
 * Visual: V10 final pick from docs/design/variants/firstWorkoutBanner/.
 * Combines a small progress ring (showing onboarding journey "1/4"),
 * Direction A premium gradient + corner orb, primary CTA + secondary
 * "Через час" snooze (concrete defer instead of vague dismiss).
 *
 * Why V10 over V1 (current):
 *   - 80px → 110px height (+38%, still compact next to other cards)
 *   - Gold gradient + corner orb = much higher visual weight, harder
 *     to ignore than the V1 rgba(212,176,122,0.06) flat fill
 *   - "1/4" ring frames the ask as part of an onboarding journey,
 *     not a random nag — psychologically: "ещё 3 шага и готово"
 *   - "Через час" snooze instead of "×" dismiss-and-forget: user
 *     defers without committing to never-see-again, reducing the
 *     funnel-killing "dismiss on first impression" pattern
 *
 * Visibility logic stays in here (caller passes raw user+history)
 * so the banner is opt-out via parent — caller doesn't need to
 * know the "24h + zero workouts" rule.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../../../components';
import { ProgressRing } from '../../../components/ProgressRing';
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
  /** Optional — defers the banner for 1 hour instead of forever.
   *  When provided, the secondary "Через час" button renders next to
   *  the primary CTA. Without it, only "×" dismiss is shown.
   *  Caller is expected to set a sessionStorage / state flag and
   *  re-show after the snooze window. */
  onSnooze?: () => void;
  /** Current onboarding step. Defaults to 1 of 4 (registration done,
   *  first workout pending). Will become dynamic once the broader
   *  onboarding tracker is wired (issue: client doesn't yet read
   *  `User.onboardingStepLog` for this). */
  onboardingStep?: number;
  /** Total onboarding steps for the ring denominator. */
  onboardingTotal?: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const FirstWorkoutBannerImpl: React.FC<FirstWorkoutBannerProps> = ({
  userCreatedAt,
  workoutHistory,
  dismissed,
  colors,
  onDismiss,
  onStart,
  onSnooze,
  onboardingStep = 1,
  onboardingTotal = 4,
}) => {
  if (dismissed) return null;
  if (!userCreatedAt) return null;
  const ageMs = Date.now() - new Date(userCreatedAt).getTime();
  if (ageMs < ONE_DAY_MS) return null;
  const hasAnyWorkout = workoutHistory.some((w) => w.completedAt);
  if (hasAnyWorkout) return null;

  return (
    <View style={[styles.outer, { marginBottom: spacing.md }]}>
      <LinearGradient
        colors={[colors.primary + '24' /* 14% */, colors.primary + '05' /* 2% */]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.banner, { borderColor: colors.primary + '4D' /* 30% */, backgroundColor: colors.surface }]}
      >
        {/* Corner orb — subtle gold radial behind the close button. RN
            doesn't do radial gradients without a heavy lib; this is an
            approximation using a translucent rounded view. */}
        <View
          pointerEvents="none"
          style={[styles.orb, { backgroundColor: colors.primary + '47' /* 28% */ }]}
        />

        {/* Close (×) — full dismiss (kills banner for this user forever) */}
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Скрыть напоминание навсегда"
        >
          <View style={{ transform: [{ rotate: '45deg' }] }}>
            <Icon name="plus" size={16} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        <View style={styles.topRow}>
          <ProgressRing
            progress={onboardingStep / onboardingTotal}
            size={46}
            strokeWidth={4}
            color={colors.primary}
            value={`${onboardingStep}/${onboardingTotal}`}
          />
          <View style={styles.titles}>
            <Text style={[styles.labelTag, { color: colors.primary }]}>НАСТРОЙКА</Text>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              Первая тренировка — 15 минут
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onStart}
            style={[styles.ctaPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Начать первую тренировку сейчас"
          >
            <Text style={[styles.ctaPrimaryText, { color: colors.textInverse }]}>Начать сейчас →</Text>
          </TouchableOpacity>
          {onSnooze && (
            <TouchableOpacity
              onPress={onSnooze}
              style={[styles.ctaSecondary, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Отложить на час"
            >
              <Text style={[styles.ctaSecondaryText, { color: colors.textSecondary }]}>Через час</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    </View>
  );
};

export const FirstWorkoutBanner = React.memo(FirstWorkoutBannerImpl);

const styles = StyleSheet.create({
  outer: {
    // Wrapper isolates the LinearGradient's border-radius clipping
    // from any flex constraints the parent applies.
    borderRadius: 16,
    overflow: 'hidden',
  },
  banner: {
    position: 'relative',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    opacity: 0.6,
  },
  close: {
    position: 'absolute',
    top: 8,
    right: 10,
    padding: 4,
    zIndex: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 12,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  labelTag: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  ctaPrimary: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ctaSecondary: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
