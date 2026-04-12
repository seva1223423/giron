import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { usePedometer } from '../../../hooks/usePedometer';

const DAILY_GOAL = 10_000;

function formatSteps(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} тыс.`;
  return String(n);
}

export const StepsCard: React.FC = () => {
  const { colors } = useThemeStore();
  const { todaySteps, weekSteps, weekDayLabels, isAvailable, isLoading } = usePedometer();

  if (isLoading || !isAvailable) return null;

  const progress = Math.min(todaySteps / DAILY_GOAL, 1);
  const pct = Math.round(progress * 100);
  const remaining = Math.max(0, DAILY_GOAL - todaySteps);
  const goalReached = todaySteps >= DAILY_GOAL;

  const weekMax = Math.max(...weekSteps, 1);
  const weekAvg = weekSteps.length > 0
    ? Math.round(weekSteps.reduce((a, b) => a + b, 0) / weekSteps.length)
    : 0;

  return (
    <FadeIn delay={330}>
      <Card style={{ marginBottom: spacing.lg }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.iconBox, { backgroundColor: colors.success + '15', borderColor: colors.success + '40' }]}>
              <Text style={{ fontSize: 16 }}>👣</Text>
            </View>
            <View>
              <Text style={[typography.h4, { color: colors.text }]}>Шагомер</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                {goalReached ? 'Цель достигнута!' : `Ещё ${formatSteps(remaining)} до цели`}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.numberSmall, { color: goalReached ? colors.success : colors.primary }]}>
              {formatSteps(todaySteps)}
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>из {formatSteps(DAILY_GOAL)}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${pct}%` as any,
                backgroundColor: goalReached ? colors.success : colors.primary,
              },
            ]}
          />
          {/* Goal marker at 100% */}
          {!goalReached && (
            <View style={[styles.goalMarker, { backgroundColor: colors.primary + '40' }]} />
          )}
        </View>
        <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.md }]}>
          {pct}% от дневной нормы
        </Text>

        {/* Week mini-chart */}
        {weekSteps.length === 7 && (
          <View style={styles.weekRow}>
            {weekSteps.map((steps, i) => {
              const barH = Math.max(4, Math.round((steps / weekMax) * 32));
              const isToday = i === weekSteps.length - 1;
              const dayGoal = steps >= DAILY_GOAL;
              return (
                <View key={i} style={styles.dayCol}>
                  <View style={[styles.barTrack, { height: 36 }]}>
                    <View style={[
                      styles.bar,
                      {
                        height: barH,
                        backgroundColor: dayGoal
                          ? colors.success
                          : isToday
                          ? colors.primary
                          : colors.border,
                      },
                    ]} />
                  </View>
                  <Text style={[
                    styles.dayLabel,
                    { color: isToday ? colors.primary : colors.textTertiary, fontWeight: isToday ? '700' : '400' },
                  ]}>
                    {weekDayLabels[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Week average */}
        {weekAvg > 0 && (
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Среднее за неделю: {formatSteps(weekAvg)} шагов/день
          </Text>
        )}
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  progressTrack: { height: 8, borderRadius: 4, marginBottom: spacing.xs, overflow: 'hidden', position: 'relative' },
  progressFill: { height: 8, borderRadius: 4 },
  goalMarker: { position: 'absolute', right: 0, top: -2, width: 2, height: 12, borderRadius: 1 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  dayCol: { alignItems: 'center', flex: 1 },
  barTrack: { justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 6, borderRadius: 3 },
  dayLabel: { fontSize: 9, marginTop: 4 },
});
