import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeStore, useSubscriptionStore, useWorkoutStore, FREE_LIMITS } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { AIMeta } from '../../../services';

function getRecoveryColor(score: number, colors: { success: string; warning: string; error: string }): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.warning;
  if (score >= 40) return colors.error;
  return colors.error;
}

function getRecoveryLabel(score: number): string {
  if (score >= 80) return 'Отличное';
  if (score >= 60) return 'Хорошее';
  if (score >= 40) return 'Среднее';
  return 'Низкое';
}

interface Props {
  lastMeta: AIMeta | null;
}

/**
 * AI chat header — pixel copy of Direction A design (A_AI).
 * Left-aligned gradient avatar tile (44pt rounded square, gold→bronze
 * linear gradient) + name + online dot + memory cue + quota counter
 * in the top-right.
 *
 *  ┌ ╔══╗                                            ┐
 *  │ ║✦ ║  ИИ‑тренер                          8 / 10 │
 *  │ ╚══╝  • Онлайн · помнит вашу историю            │
 *  └─────────────────────────────────────────────────┘
 *
 * The recovery chip + streak are kept as optional extras under the
 * primary row — they carry genuine runtime info and don't fight the
 * design's "clean header" spec.
 */
export const ChatHeader: React.FC<Props> = ({ lastMeta }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { isPremiumActive, aiMessagesLeft } = useSubscriptionStore();
  // Memory-cue subtitle: workout count + PR count come from the local
  // workout store. There's no dedicated personalRecords slice, so we
  // infer PRs from workout history (sum sets flagged isPR by the
  // store's completion logic). Brand-new users (0/0) get the original
  // generic copy so the header doesn't look like a bug.
  const workoutHistory = useWorkoutStore((s) => s.workoutHistory);
  const workoutsLen = workoutHistory.length;
  let prCount = 0;
  for (const w of workoutHistory) {
    for (const ex of w.exercises ?? []) {
      for (const set of ex.sets ?? []) {
        if (set.isPR) prCount++;
      }
    }
  }
  const memorySubtitle = workoutsLen === 0 && prCount === 0
    ? 'Онлайн · помнит вашу историю'
    : `Знает: ${workoutsLen} тренировок · ${prCount} PR · ваш ритм`;

  const quotaText = isPremiumActive()
    ? '∞ Pro'
    : `${aiMessagesLeft()}/${FREE_LIMITS.AI_MESSAGES_PER_DAY}`;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          paddingTop: safeTop + spacing.md,
        },
      ]}
    >
      <View style={styles.row}>
        {/* Gradient avatar tile — rounded square with gold→bronze fill
            matching A_AI's 44pt accent/accent2 gradient spec. */}
        <View style={styles.avatar}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="aiAvatarBg" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.primaryLight} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.primaryDark} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#aiAvatarBg)" rx="14" ry="14" />
          </Svg>
          <Icon name="spark" size={22} color={colors.textInverse} strokeWidth={2} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={[typography.h4, { color: colors.text }]}
              numberOfLines={1}
            >
              ИИ‑тренер
            </Text>
            {isPremiumActive() && (
              <View
                style={[styles.proBadge, { backgroundColor: colors.primary }]}
              >
                <Text
                  style={{ color: colors.textInverse, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}
                >
                  PRO
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text
              style={[typography.caption, { color: colors.success }]}
              numberOfLines={1}
            >
              {memorySubtitle}
            </Text>
          </View>
        </View>

        <Text
          style={[
            typography.caption,
            { color: colors.textSecondary, fontVariant: ['tabular-nums'] },
          ]}
        >
          {quotaText}
        </Text>
      </View>

      {/* Secondary row with recovery + streak — only shows when server
          supplied the meta, keeps the header compact otherwise. */}
      {(lastMeta?.recovery != null || (lastMeta?.streak ?? 0) > 0) && (
        <View style={styles.metaRow}>
          {lastMeta?.recovery != null && (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: getRecoveryColor(lastMeta.recovery, colors) + '15',
                  borderColor: getRecoveryColor(lastMeta.recovery, colors) + '40',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: getRecoveryColor(lastMeta.recovery, colors),
                }}
              >
                {getRecoveryLabel(lastMeta.recovery)} {lastMeta.recovery}%
              </Text>
            </View>
          )}
          {lastMeta?.streak != null && lastMeta.streak > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="flame" size={12} color={colors.primary} />
              <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>
                {lastMeta.streak} дн.
              </Text>
            </View>
          )}
        </View>
      )}

      <Text
        style={[
          typography.caption,
          {
            color: colors.textTertiary,
            fontSize: 10,
            textAlign: 'center',
            paddingHorizontal: spacing.md,
            marginTop: 8,
          },
        ]}
      >
        Рекомендации носят информационный характер и не заменяют консультацию врача.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  proBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
});
