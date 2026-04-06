import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { LineChart } from './LineChart';
import { workoutService } from '../../../services';
import { Workout, BodyWeight } from '../../../types';
import { LeaderboardEntry } from '../../../services/workoutService';

const STRENGTH_STANDARDS = [
  { exerciseId: 'squat', name: 'Присед', multipliers: [0.5, 1.0, 1.5, 2.0, 2.5] },
  { exerciseId: 'bench-press', name: 'Жим лёжа', multipliers: [0.35, 0.75, 1.25, 1.75, 2.0] },
  { exerciseId: 'deadlift', name: 'Становая', multipliers: [0.5, 1.25, 1.75, 2.25, 2.75] },
  { exerciseId: 'overhead-press', name: 'Жим стоя', multipliers: [0.25, 0.5, 0.75, 1.0, 1.25] },
];
const LEVEL_NAMES = ['Новичок', 'Начинающий', 'Средний', 'Продвинутый', 'Элита'];
const LEVEL_COLORS = ['#9E9E9E', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

interface RecordsTabProps {
  colors: any;
  workoutHistory: Workout[];
  weightHistory: BodyWeight[];
  user: any;
}

export const RecordsTab: React.FC<RecordsTabProps> = ({ colors, workoutHistory, weightHistory, user }) => {
  const haptic = useHaptic();

  const [recordsView, setRecordsView] = useState<'mine' | 'club'>('mine');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    if (leaderboard.length > 0) return; // already loaded
    setLoadingLeaderboard(true);
    try {
      const data = await workoutService.getLeaderboard();
      setLeaderboard(data);
    } catch {
      // silently fail
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [leaderboard.length]);

  // Personal records
  const personalRecords = useMemo(() => {
    const records: Record<string, { exerciseId: string; name: string; maxWeight: number; maxReps: number; estimated1RM: number }> = {};

    workoutHistory.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        ex.sets
          .filter((s) => s.completed && s.weight && s.reps)
          .forEach((set) => {
            const key = ex.exerciseId;
            const estimated1RM = (set.weight || 0) * (1 + (set.reps || 0) / 30);

            if (!records[key] || estimated1RM > records[key].estimated1RM) {
              records[key] = {
                exerciseId: ex.exerciseId,
                name: ex.exercise.name,
                maxWeight: set.weight || 0,
                maxReps: set.reps || 0,
                estimated1RM: Math.round(estimated1RM),
              };
            }
          });
      });
    });

    return Object.values(records).sort((a, b) => b.estimated1RM - a.estimated1RM);
  }, [workoutHistory]);

  // 1RM history for selected exercise
  const oneRMHistory = useMemo(() => {
    if (!selectedExerciseId) return [];

    const byDate = new Map<string, number>();

    [...workoutHistory]
      .filter((w) => w.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())
      .forEach((workout) => {
        workout.exercises
          .filter((ex) => ex.exerciseId === selectedExerciseId)
          .forEach((ex) => {
            ex.sets
              .filter((s) => s.completed && s.weight && s.reps)
              .forEach((set) => {
                const date = workout.completedAt!.split('T')[0];
                const est1rm = Math.round((set.weight || 0) * (1 + (set.reps || 0) / 30));
                if (!byDate.has(date) || est1rm > byDate.get(date)!) {
                  byDate.set(date, est1rm);
                }
              });
          });
      });

    return Array.from(byDate.entries()).map(([date, value]) => ({
      label: new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value,
    }));
  }, [selectedExerciseId, workoutHistory]);

  return (
    <>
      {/* Mine / Club toggle */}
      <FadeIn delay={0}>
        <View style={[styles.segmentControl, { backgroundColor: colors.surface }]}>
          {(['mine', 'club'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => {
                haptic.selection();
                setRecordsView(v);
                if (v === 'club') fetchLeaderboard();
              }}
              style={[
                styles.segmentBtn,
                recordsView === v && { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[typography.smallMedium, {
                color: recordsView === v ? '#fff' : colors.textSecondary,
              }]}>
                {v === 'mine' ? 'Мои рекорды' : '🏆 Клуб'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </FadeIn>

      {/* My records */}
      {recordsView === 'mine' && (
        personalRecords.length === 0 ? (
          <FadeIn>
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Рекорды появятся после первых тренировок
              </Text>
            </Card>
          </FadeIn>
        ) : (
          (() => {
          const records = personalRecords;
          return records.map((record, i) => {
            const isSelected = selectedExerciseId === record.exerciseId;
            return (
              <FadeIn key={record.exerciseId} delay={i * 60}>
                <TouchableOpacity
                  onPress={() => {
                    haptic.selection();
                    setSelectedExerciseId(isSelected ? null : record.exerciseId);
                  }}
                  activeOpacity={0.85}
                >
                  <Card style={{
                    marginBottom: spacing.sm,
                    marginTop: i === 0 ? spacing.lg : 0,
                    borderWidth: isSelected ? 1.5 : 0,
                    borderColor: isSelected ? colors.accent : 'transparent',
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>{record.name}</Text>
                      <Text style={[typography.caption, { color: isSelected ? colors.accent : colors.textTertiary, marginLeft: spacing.sm }]}>
                        {isSelected ? 'Скрыть ▲' : 'График ▼'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
                      <View>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>Макс. вес</Text>
                        <Text style={[typography.numberSmall, { color: colors.primary }]}>{record.maxWeight} кг</Text>
                      </View>
                      <View>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>Повторений</Text>
                        <Text style={[typography.numberSmall, { color: colors.text }]}>{record.maxReps}</Text>
                      </View>
                      <View>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>~1ПМ</Text>
                        <Text style={[typography.numberSmall, { color: colors.accent }]}>{record.estimated1RM} кг</Text>
                      </View>
                    </View>
                    <View style={{ marginTop: spacing.sm }}>
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface }}>
                        <View style={{
                          height: 4, borderRadius: 2, backgroundColor: colors.primary,
                          width: `${(record.estimated1RM / records[0].estimated1RM) * 100}%`,
                        }} />
                      </View>
                    </View>
                    {isSelected && oneRMHistory.length >= 2 && (
                      <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
                        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>
                          ДИНАМИКА ~1ПМ
                        </Text>
                        <LineChart
                          data={oneRMHistory.slice(-12)}
                          color={colors.accent}
                          colors={colors}
                          suffix=" кг"
                          height={130}
                        />
                      </View>
                    )}
                    {isSelected && oneRMHistory.length < 2 && (
                      <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                        <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center' }]}>
                          Нужно минимум 2 тренировки с этим упражнением для графика
                        </Text>
                      </View>
                    )}
                  </Card>
                </TouchableOpacity>
              </FadeIn>
            );
          });
        })()
        )
      )}

      {/* Strength Standards */}
      {recordsView === 'mine' && personalRecords.length > 0 && (() => {
        const bodyWeightKg = weightHistory.length > 0
          ? weightHistory[weightHistory.length - 1].weightKg
          : user?.weightKg || 80;

        const standardData = STRENGTH_STANDARDS.map((std) => {
          const pr = personalRecords.find((r) => r.exerciseId === std.exerciseId);
          if (!pr) return null;
          const ratio = pr.estimated1RM / bodyWeightKg;
          let levelIdx = 0;
          for (let li = 0; li < std.multipliers.length; li++) {
            if (ratio >= std.multipliers[li]) levelIdx = li;
          }
          const nextMultiplier = std.multipliers[Math.min(levelIdx + 1, std.multipliers.length - 1)];
          const progress = levelIdx >= std.multipliers.length - 1
            ? 1
            : (ratio - std.multipliers[levelIdx]) / (nextMultiplier - std.multipliers[levelIdx]);
          return { ...std, pr: pr.estimated1RM, ratio: Math.round(ratio * 100) / 100, levelIdx, progress: Math.max(0, Math.min(1, progress)) };
        }).filter(Boolean) as { exerciseId: string; name: string; multipliers: number[]; pr: number; ratio: number; levelIdx: number; progress: number }[];

        if (standardData.length === 0) return null;

        return (
          <FadeIn delay={200}>
            <Card style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>
                Стандарты силы
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
                На основе твоего веса тела {bodyWeightKg} кг
              </Text>
              {standardData.map((item, idx) => (
                <View key={item.exerciseId} style={idx < standardData.length - 1 ? { marginBottom: spacing.lg } : {}}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.xs }}>
                    <Text style={[typography.smallMedium, { color: colors.text }]}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>{item.pr} кг  ({item.ratio}×)</Text>
                      <View style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }, { backgroundColor: LEVEL_COLORS[item.levelIdx] + '25' }]}>
                        <Text style={[typography.captionMedium, { color: LEVEL_COLORS[item.levelIdx], fontSize: 10 }]}>
                          {LEVEL_NAMES[item.levelIdx]}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {/* Progress bar with 5 segments */}
                  <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
                    {item.multipliers.map((_, segIdx) => {
                      const filled = segIdx < item.levelIdx || (segIdx === item.levelIdx && item.progress > 0);
                      const partial = segIdx === item.levelIdx;
                      return (
                        <View key={segIdx} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 3, overflow: 'hidden' }}>
                          {filled && (
                            <View style={{
                              height: '100%',
                              width: partial ? `${item.progress * 100}%` : '100%',
                              backgroundColor: LEVEL_COLORS[Math.min(segIdx, LEVEL_COLORS.length - 1)],
                              borderRadius: 3,
                            }} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    {item.multipliers.map((m, segIdx) => (
                      <Text key={segIdx} style={[typography.small, { color: colors.textTertiary, fontSize: 9 }]}>{m}×</Text>
                    ))}
                  </View>
                </View>
              ))}
            </Card>
          </FadeIn>
        );
      })()}

      {/* Club leaderboard */}
      {recordsView === 'club' && (
        loadingLeaderboard ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        ) : leaderboard.length === 0 ? (
          <FadeIn>
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Рекорды клуба появятся когда участники завершат тренировки
              </Text>
            </Card>
          </FadeIn>
        ) : (
          <FadeIn delay={0}>
            <Card style={{ marginTop: spacing.lg }}>
              {leaderboard.slice(0, 30).map((entry, i) => (
                <View
                  key={i}
                  style={[
                    { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
                    i < leaderboard.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                  ]}
                >
                  <Text style={[typography.numberSmall, {
                    color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : colors.textTertiary,
                    width: 32,
                    textAlign: 'center',
                    fontSize: i < 3 ? 18 : 14,
                  }]}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </Text>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]}>{entry.exerciseName}</Text>
                    <Text style={[typography.small, { color: colors.textSecondary }]}>
                      {entry.userName} • {entry.weightKg} кг × {entry.reps}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[typography.numberSmall, { color: colors.accent, fontSize: 16 }]}>
                      {entry.estimated1RM} кг
                    </Text>
                    <Text style={[typography.small, { color: colors.textTertiary }]}>~1ПМ</Text>
                  </View>
                </View>
              ))}
            </Card>
          </FadeIn>
        )
      )}
    </>
  );
};

const styles = StyleSheet.create({
  segmentControl: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 3,
    marginBottom: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 12,
  },
});

export default RecordsTab;
