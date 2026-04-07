import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface HistoryEntry {
  date: string;
  bestWeight: number;
  bestReps: number;
  totalVolume: number;
}

const TrendChart: React.FC<{ data: { label: string; value: number }[]; color: string }> = ({ data, color }) => {
  const { colors } = useThemeStore();
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map((d) => d.value));
  const minVal = Math.min(...data.map((d) => d.value));
  const range = maxVal - minVal || 1;
  const h = 90;
  return (
    <View style={{ height: h + 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: colors.textTertiary, fontSize: 10 }}>{maxVal} кг</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 10 }}>{minVal} кг</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: h }}>
        {data.map((item, i) => {
          const y = ((item.value - minVal) / range) * (h - 12);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', height: h, justifyContent: 'flex-end' }}>
              <View style={{ position: 'absolute', bottom: y }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((item, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.textTertiary, fontSize: 9 }}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

interface Props {
  exerciseHistory: HistoryEntry[];
  maxWeight: number;
  estimated1RM: number;
  oneRMTrend: { label: string; value: number }[];
}

export const ExerciseStatsCard: React.FC<Props> = ({ exerciseHistory, maxWeight, estimated1RM, oneRMTrend }) => {
  const { colors } = useThemeStore();
  if (exerciseHistory.length === 0) return null;

  return (
    <>
      <FadeIn delay={400}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Твои рекорды</Text>
          <View style={styles.recordsRow}>
            <View style={styles.recordItem}>
              <Text style={[typography.number, { color: colors.primary }]}>{maxWeight}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Макс. вес (кг)</Text>
            </View>
            {estimated1RM > 0 && (
              <View style={styles.recordItem}>
                <Text style={[typography.number, { color: colors.accent }]}>{estimated1RM}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>1RM (кг)</Text>
              </View>
            )}
            <View style={styles.recordItem}>
              <Text style={[typography.number, { color: colors.success }]}>{exerciseHistory.length}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
            </View>
          </View>
          {oneRMTrend.length >= 2 && (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ДИНАМИКА ~1ПМ</Text>
              <TrendChart data={oneRMTrend} color={colors.accent} />
            </View>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={480}>
        <Card style={{ marginBottom: spacing.huge }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Последние тренировки</Text>
          {exerciseHistory.slice(0, 5).map((h, i) => (
            <View
              key={i}
              style={[styles.historyRow, i < Math.min(exerciseHistory.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
            >
              <Text style={[typography.small, { color: colors.textSecondary, width: 80 }]}>
                {new Date(h.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={[typography.bodyMedium, { color: colors.text, flex: 1 }]}>{h.bestWeight} кг x {h.bestReps}</Text>
              <Text style={[typography.small, { color: colors.textTertiary }]}>{Math.round(h.totalVolume)} кг</Text>
            </View>
          ))}
        </Card>
      </FadeIn>
    </>
  );
};

const styles = StyleSheet.create({
  recordsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  recordItem: { alignItems: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
});
