import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';

export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', lats: 'Широчайшие', lower_back: 'Нижняя спина',
  shoulders: 'Плечи', traps: 'Трапеции', biceps: 'Бицепс', triceps: 'Трицепс',
  forearms: 'Предплечья', quadriceps: 'Квадрицепс', hamstrings: 'Задняя поверхность',
  glutes: 'Ягодицы', calves: 'Икры', abs: 'Пресс', obliques: 'Косые мышцы',
  hip_flexors: 'Сгибатели бедра', full_body: 'Всё тело',
};

export const MUSCLE_ORDER = [
  'chest', 'back', 'lats', 'lower_back', 'shoulders', 'traps',
  'biceps', 'triceps', 'forearms',
  'quadriceps', 'hamstrings', 'glutes', 'calves',
  'abs', 'obliques', 'hip_flexors', 'full_body',
];

export interface PREntry {
  exerciseId: string;
  exerciseName: string;
  muscle: string;
  bestWeight: number;
  bestReps: number;
  estimated1RM: number;
  date: string;
  history: { date: string; estimated1RM: number }[];
}

function formatDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const Sparkline: React.FC<{ history: { estimated1RM: number }[]; color: string }> = ({ history, color }) => {
  const last = history.slice(-8);
  if (last.length < 2) return null;
  const max = Math.max(...last.map((h) => h.estimated1RM));
  const min = Math.min(...last.map((h) => h.estimated1RM));
  const range = max - min || 1;
  const BAR_HEIGHT = 24;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT, gap: 3 }}>
      {last.map((point, i) => {
        const barH = Math.max(3, Math.round(((point.estimated1RM - min) / range) * BAR_HEIGHT));
        return (
          <View key={i} style={{ width: 5, height: barH, borderRadius: 2, backgroundColor: i === last.length - 1 ? color : color + '55' }} />
        );
      })}
    </View>
  );
};

interface Props {
  record: PREntry;
  idx: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export const PRRecordCard: React.FC<Props> = ({ record, idx, isExpanded, onToggle }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  const trend = record.history.length >= 2
    ? record.history[record.history.length - 1].estimated1RM - record.history[record.history.length - 2].estimated1RM
    : 0;
  const trendColor = trend > 0 ? colors.success : trend < 0 ? colors.error : colors.textTertiary;
  const trendLabel = trend > 0 ? `+${trend} кг` : trend < 0 ? `${trend} кг` : '';

  return (
    <FadeIn delay={Math.min(idx * 30, 300)}>
      <Card style={{ marginBottom: spacing.sm }}>
        <TouchableOpacity onPress={() => { haptic.selection(); onToggle(); }} activeOpacity={0.7}>
          <View style={styles.recordRow}>
            <View style={[styles.rankBadge, { backgroundColor: idx < 3 ? colors.primary + '20' : colors.surface, borderWidth: 1, borderColor: idx < 3 ? colors.primary + '40' : colors.border }]}>
              <Text style={[typography.captionMedium, { color: idx < 3 ? colors.primary : colors.textTertiary }]}>{idx + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{record.exerciseName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap' }}>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>{MUSCLE_LABELS[record.muscle] || record.muscle}</Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>{formatDate(record.date)}</Text>
                {trendLabel ? (
                  <>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
                    <Text style={[typography.captionMedium, { color: trendColor }]}>{trendLabel}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Text style={[typography.number, { color: colors.primary, fontSize: 24 }]}>{record.estimated1RM}</Text>
                <Text style={[typography.caption, { color: colors.primary }]}>кг</Text>
              </View>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>~1ПМ</Text>
            </View>
          </View>

          <View style={[styles.subRow, { borderTopColor: colors.divider }]}>
            <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
              Лучший подход:{' '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{record.bestWeight} кг × {record.bestReps} пов</Text>
            </Text>
            <Sparkline history={record.history} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {isExpanded && record.history.length > 1 && (
          <View style={[styles.historySection, { borderTopColor: colors.divider }]}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ИСТОРИЯ ~1ПМ</Text>
            {[...record.history].reverse().slice(0, 10).map((h, i) => {
              const isFirst = i === 0;
              const barPct = Math.round((h.estimated1RM / record.estimated1RM) * 100);
              return (
                <View key={h.date} style={{ marginBottom: spacing.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={[typography.caption, { color: isFirst ? colors.primary : colors.textSecondary }]}>
                      {isFirst ? 'PR ' : ''}{formatDate(h.date)}
                    </Text>
                    <Text style={[typography.captionMedium, { color: isFirst ? colors.primary : colors.text }]}>{h.estimated1RM} кг</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${barPct}%` as any, backgroundColor: isFirst ? colors.primary : colors.primary + '40' }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  historySection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
});
