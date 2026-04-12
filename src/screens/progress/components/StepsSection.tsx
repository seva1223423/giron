import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { usePedometer } from '../../../hooks/usePedometer';

const DAILY_GOAL = 10_000;

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')} тыс.`;
  return String(n);
}

interface Props { colors: any }

export const StepsSection: React.FC<Props> = ({ colors }) => {
  const { todaySteps, weekSteps, weekDayLabels, weekAvg, isAvailable, isLoading } = usePedometer() as any;

  if (isLoading) return null;
  if (!isAvailable) {
    return (
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>Шагомер</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          Шагомер недоступен на этом устройстве или не выданы разрешения на отслеживание активности.
        </Text>
      </Card>
    );
  }

  const weekMax = Math.max(...(weekSteps as number[]), 1);
  const avg = weekSteps.length > 0
    ? Math.round((weekSteps as number[]).reduce((a: number, b: number) => a + b, 0) / weekSteps.length)
    : 0;
  const best = Math.max(...(weekSteps as number[]), todaySteps);
  const goalDays = (weekSteps as number[]).filter((s: number) => s >= DAILY_GOAL).length;

  return (
    <>
      {/* Today */}
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
            <View>
              <Text style={[typography.h4, { color: colors.text }]}>Сегодня</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Цель: {fmt(DAILY_GOAL)} шагов</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.numberSmall, { color: todaySteps >= DAILY_GOAL ? colors.success : colors.primary }]}>
                {fmt(todaySteps)}
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>шагов</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.fill, {
              width: `${Math.min(100, Math.round(todaySteps / DAILY_GOAL * 100))}%` as any,
              backgroundColor: todaySteps >= DAILY_GOAL ? colors.success : colors.primary,
            }]} />
          </View>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
            {todaySteps >= DAILY_GOAL
              ? `Цель выполнена! +${fmt(todaySteps - DAILY_GOAL)} сверх`
              : `Ещё ${fmt(DAILY_GOAL - todaySteps)} до цели`}
          </Text>
        </Card>
      </FadeIn>

      {/* Week chart */}
      {weekSteps.length === 7 && (
        <FadeIn delay={80}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>За неделю</Text>
            <View style={styles.chartRow}>
              {(weekSteps as number[]).map((steps, i) => {
                const barH = Math.max(4, Math.round((steps / weekMax) * 80));
                const isToday = i === weekSteps.length - 1;
                const hit = steps >= DAILY_GOAL;
                return (
                  <View key={i} style={styles.barCol}>
                    <Text style={[styles.barLabel, { color: colors.textTertiary }]}>{fmt(steps)}</Text>
                    <View style={[styles.barTrack, { height: 80 }]}>
                      <View style={[styles.barFill, {
                        height: barH,
                        backgroundColor: hit ? colors.success : isToday ? colors.primary : colors.border,
                        borderRadius: 4,
                      }]} />
                    </View>
                    <Text style={[styles.dayLabel, {
                      color: isToday ? colors.primary : colors.textTertiary,
                      fontWeight: isToday ? '700' : '400',
                    }]}>{weekDayLabels[i]}</Text>
                    {hit && <Text style={{ fontSize: 9, color: colors.success }}>✓</Text>}
                  </View>
                );
              })}
            </View>

            {/* Goal line label */}
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
              Зелёный = достигнута цель {fmt(DAILY_GOAL)} шагов
            </Text>
          </Card>
        </FadeIn>
      )}

      {/* Week stats */}
      <FadeIn delay={140}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Статистика</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.numberSmall, { color: colors.primary }]}>{fmt(avg)}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Среднее/день</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.numberSmall, { color: colors.primary }]}>{fmt(best)}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Рекорд недели</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.numberSmall, { color: goalDays > 0 ? colors.success : colors.textTertiary }]}>{goalDays}/7</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней с целью</Text>
            </View>
          </View>
        </Card>
      </FadeIn>
    </>
  );
};

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.xs },
  fill: { height: 8, borderRadius: 4 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', flex: 1 },
  barLabel: { fontSize: 8, marginBottom: 2 },
  barTrack: { justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  barFill: { width: '60%' },
  dayLabel: { fontSize: 10, marginTop: 4 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
});
