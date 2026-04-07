import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { Workout } from '../../../types';

const VolumeTrendChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const { colors } = useThemeStore();
  if (data.length < 2) return null;
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const barH = 48;
  return (
    <View>
      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
        ОБЪЁМ — ПОСЛЕДНИЕ {data.length} ТРЕНИРОВОК
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: barH + 20, gap: 3 }}>
        {data.map((item, i) => {
          const h = Math.max(4, (item.value / maxVal) * barH);
          const isLast = i === data.length - 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', height: barH + 20, justifyContent: 'flex-end' }}>
              <View style={{ width: '85%', height: h, borderRadius: 3, backgroundColor: isLast ? colors.primary : colors.primary + '60' }} />
              <Text style={{ color: colors.textTertiary, fontSize: 8, marginTop: 3 }} numberOfLines={1}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

interface Props {
  workoutHistory: Workout[];
}

export const HistoryStatsCard: React.FC<Props> = ({ workoutHistory }) => {
  const { colors } = useThemeStore();
  const totalVolumeTons = Math.round(workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0) / 1000);
  const totalHours = Math.round(workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0) / 60);
  const avgDuration = workoutHistory.length > 0
    ? Math.round(workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0) / workoutHistory.length) : 0;

  const volumeTrend = workoutHistory
    .filter((w) => w.completedAt && (w.totalVolume || 0) > 0)
    .slice(0, 8).reverse()
    .map((w) => ({ label: new Date(w.completedAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' ', ''), value: Math.round(w.totalVolume || 0) }));

  return (
    <FadeIn delay={0}>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.row}>
          {[
            { value: workoutHistory.length.toString(), label: 'тренировок', color: colors.primary },
            { value: totalVolumeTons.toString(), label: 'тонн', color: colors.accent },
            { value: totalHours.toString(), label: 'часов', color: colors.success },
            { value: avgDuration.toString(), label: 'мин/тр.', color: colors.protein },
          ].map(({ value, label, color }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
              <View style={styles.stat}>
                <Text style={[typography.number, { color }]}>{value}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
        {volumeTrend.length >= 2 && (
          <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <VolumeTrendChart data={volumeTrend} />
          </View>
        )}
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center' },
  divider: { width: 1, height: 40 },
});
