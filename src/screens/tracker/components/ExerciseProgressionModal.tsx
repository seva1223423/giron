import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { useWorkoutStore, useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  visible: boolean;
  onClose: () => void;
  exerciseId: string;
  exerciseName: string;
}

function epley1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

export const ExerciseProgressionModal: React.FC<Props> = ({ visible, onClose, exerciseId, exerciseName }) => {
  const colors = useThemeColors();
  const getExerciseHistory = useWorkoutStore((s) => s.getExerciseHistory);
  const { width: screenW } = useWindowDimensions();

  const sessions = useMemo(() => {
    const history = getExerciseHistory(exerciseId);
    return history
      .map((w) => {
        const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
        if (!ex) return null;
        const workingSets = ex.sets.filter(
          (s) => s.completed && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0 && s.type !== 'warmup',
        );
        if (workingSets.length === 0) return null;
        const best = workingSets.reduce(
          (acc, s) => {
            const rm = epley1RM(s.weight!, s.reps!);
            return rm > acc.rm ? { rm, weight: s.weight!, reps: s.reps! } : acc;
          },
          { rm: 0, weight: 0, reps: 0 },
        );
        const maxWeight = Math.max(...workingSets.map((s) => s.weight!));
        const totalVol = workingSets.reduce((s, set) => s + set.weight! * set.reps!, 0);
        return {
          date: w.completedAt ?? w.startedAt ?? '',
          rm: Math.round(best.rm),
          weight: best.weight,
          reps: best.reps,
          maxWeight,
          totalVol: Math.round(totalVol),
          sets: workingSets.length,
        };
      })
      .filter((s): s is { date: string; rm: number; weight: number; reps: number; maxWeight: number; totalVol: number; sets: number } => s !== null)
      .slice(-15);
  }, [exerciseId, getExerciseHistory]);

  const chartData = sessions;

  const W = screenW - spacing.xl * 2 - 32;
  const H = 130;
  const PAD = { top: 12, bottom: 24, left: 4, right: 4 };

  const chartPath = useMemo(() => {
    if (chartData.length < 2) return { line: '', area: '' };
    const maxRM = Math.max(...chartData.map((d) => d.rm));
    const minRM = Math.min(...chartData.map((d) => d.rm));
    const range = maxRM - minRM || 1;
    const pts = chartData.map((d, i) => {
      const x = PAD.left + (i / (chartData.length - 1)) * (W - PAD.left - PAD.right);
      const y = PAD.top + (1 - (d.rm - minRM) / range) * (H - PAD.top - PAD.bottom);
      return { x, y };
    });
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - PAD.bottom} L${pts[0].x.toFixed(1)},${H - PAD.bottom} Z`;
    return { line, area, pts, minRM, maxRM };
  }, [chartData, W, H]);

  const allRM = chartData.map((d) => d.rm);
  const allWeight = chartData.map((d) => d.maxWeight);
  const bestRM = allRM.length > 0 ? Math.max(...allRM) : 0;
  const bestWeight = allWeight.length > 0 ? Math.max(...allWeight) : 0;
  const trend = chartData.length >= 3
    ? ((chartData[chartData.length - 1].rm - chartData[0].rm) / chartData[0].rm) * 100
    : null;

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getDate()}.${dt.getMonth() + 1}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000060' }} activeOpacity={1} onPress={onClose} />
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: colors.background,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight: '80%',
      }}>
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>{exerciseName}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                Прогресс · {chartData.length} тренировок
              </Text>
            </View>
            {trend !== null && (
              <View style={{
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                borderRadius: borderRadius.md,
                backgroundColor: trend >= 0 ? colors.success + '18' : colors.error + '18',
                borderWidth: 1, borderColor: trend >= 0 ? colors.success + '50' : colors.error + '50',
              }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: trend >= 0 ? colors.success : colors.error }}>
                  {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
                </Text>
              </View>
            )}
          </View>

          {/* Chart */}
          {chartData.length >= 2 ? (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                Расч. 1ПМ (кг)
              </Text>
              <Svg width={W} height={H}>
                <Defs>
                  <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.25" />
                    <Stop offset="100%" stopColor={colors.primary} stopOpacity="0.02" />
                  </LinearGradient>
                </Defs>
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((f) => (
                  <Line
                    key={f}
                    x1={PAD.left} y1={PAD.top + f * (H - PAD.top - PAD.bottom)}
                    x2={W - PAD.right} y2={PAD.top + f * (H - PAD.top - PAD.bottom)}
                    stroke={colors.border} strokeWidth="1" strokeDasharray="3,4"
                  />
                ))}
                {/* Area fill */}
                <Path d={chartPath.area || ''} fill="url(#grad)" />
                {/* Line */}
                <Path d={chartPath.line || ''} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {/* Points */}
                {(chartPath as any).pts?.map((p: { x: number; y: number }, i: number) => (
                  <Circle
                    key={i}
                    cx={p.x} cy={p.y} r={i === chartData.length - 1 ? 5 : 3}
                    fill={i === chartData.length - 1 ? colors.primary : colors.background}
                    stroke={colors.primary}
                    strokeWidth={i === chartData.length - 1 ? 0 : 2}
                  />
                ))}
              </Svg>
              {/* X labels */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={{ fontSize: 9, color: colors.textTertiary }}>{formatDate(chartData[0].date)}</Text>
                {chartData.length > 2 && (
                  <Text style={{ fontSize: 9, color: colors.textTertiary }}>
                    {formatDate(chartData[Math.floor(chartData.length / 2)].date)}
                  </Text>
                )}
                <Text style={{ fontSize: 9, color: colors.textTertiary }}>{formatDate(chartData[chartData.length - 1].date)}</Text>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.lg }}>
              <Text style={[typography.body, { color: colors.textSecondary }]}>
                Нужно минимум 2 тренировки для графика
              </Text>
            </View>
          )}

          {/* Stats row */}
          <View style={{
            flexDirection: 'row', backgroundColor: colors.surface,
            borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border,
            marginBottom: spacing.lg,
          }}>
            {[
              { label: 'Лучший 1ПМ', value: bestRM > 0 ? `${bestRM} кг` : '—' },
              { label: 'Макс. вес', value: bestWeight > 0 ? `${bestWeight} кг` : '—' },
              { label: 'Сессий', value: String(chartData.length) },
            ].map(({ label, value }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <View style={{ width: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />}
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary }}>{value}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Recent sessions list */}
          {chartData.length > 0 && (
            <>
              <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.md }]}>
                Последние тренировки
              </Text>
              {[...chartData].reverse().slice(0, 8).map((s, i) => (
                <View key={i} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                  borderRadius: borderRadius.md, marginBottom: spacing.xs,
                  backgroundColor: i === 0 ? colors.primary + '08' : colors.surface,
                  borderWidth: 1, borderColor: i === 0 ? colors.primary + '30' : colors.border,
                }}>
                  <Text style={[typography.caption, { color: colors.textTertiary, width: 44 }]}>
                    {formatDate(s.date)}
                  </Text>
                  <Text style={[typography.captionMedium, { color: colors.text, flex: 1 }]}>
                    {s.weight} кг × {s.reps} повт.{s.sets > 1 ? ` (+${s.sets - 1})` : ''}
                  </Text>
                  <Text style={[typography.captionMedium, { color: colors.primary }]}>
                    1ПМ ~{s.rm} кг
                  </Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};
