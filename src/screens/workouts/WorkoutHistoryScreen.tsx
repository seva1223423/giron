import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', quadriceps: 'Ноги', hamstrings: 'Задняя', glutes: 'Ягодицы',
  abs: 'Пресс', calves: 'Икры', lats: 'Широчайшие',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ч ${m}мин` : `${h}ч`;
}

function groupWorkoutsByMonth(workouts: any[]) {
  const groups = new Map<string, any[]>();
  workouts.forEach((w) => {
    const date = new Date(w.completedAt || w.startedAt || '');
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...w, _monthLabel: label });
  });
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: items[0]._monthLabel,
    workouts: items,
  }));
}

export const WorkoutHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { workoutHistory, activeWorkout, startWorkout } = useWorkoutStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleRepeatWorkout = (workout: any) => {
    if (activeWorkout) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const exercises: WorkoutExercise[] = workout.exercises.map((we: any, index: number) => {
      const sets: WorkoutSet[] = we.sets.map((s: any, i: number) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1,
        type: s.type,
        reps: s.reps,
        weight: s.weight,
        completed: false,
      }));
      return { ...we, id: `we-${Date.now()}-${index}`, sets };
    });
    startWorkout({ id: `workout-${Date.now()}`, name: workout.name, exercises });
    navigation.navigate('ActiveWorkout');
  };

  const groups = useMemo(() => groupWorkoutsByMonth(workoutHistory), [workoutHistory]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>История тренировок</Text>
        <View style={{ width: 24 }} />
      </View>

      {workoutHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 56, marginBottom: spacing.lg }}>🏋️</Text>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>
            Нет тренировок
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            После первой тренировки здесь появится история
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Summary stats */}
          <FadeIn delay={0}>
            <Card style={{ marginBottom: spacing.xl }}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.primary }]}>{workoutHistory.length}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.accent }]}>
                    {Math.round(workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0) / 1000)}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>тонн</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.success }]}>
                    {Math.round(workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0) / 60)}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>часов</Text>
                </View>
              </View>
            </Card>
          </FadeIn>

          {groups.map((group, gi) => (
            <FadeIn key={group.key} delay={gi * 40}>
              <Text style={[typography.captionMedium, { color: colors.textTertiary, marginBottom: spacing.md, marginTop: gi > 0 ? spacing.lg : 0 }]}>
                {group.label.toUpperCase()}
              </Text>
              {group.workouts.map((workout, wi) => {
                const isExpanded = expandedId === workout.id;
                const completedSets = workout.exercises.reduce(
                  (s: number, e: any) => s + e.sets.filter((set: any) => set.completed).length, 0
                );

                // Get primary muscles trained
                const muscleSet = new Set<string>();
                workout.exercises.forEach((ex: any) => {
                  ex.exercise.primaryMuscles.slice(0, 1).forEach((m: string) => muscleSet.add(m));
                });
                const muscles = Array.from(muscleSet).slice(0, 3);

                return (
                  <TouchableOpacity
                    key={workout.id}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setExpandedId(isExpanded ? null : workout.id);
                    }}
                  >
                    <Card style={{ marginBottom: spacing.sm }}>
                      <View style={styles.workoutHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                            {workout.name}
                          </Text>
                          <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                            {formatDate(workout.completedAt || workout.startedAt || '')}
                          </Text>
                          {muscles.length > 0 && (
                            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                              {muscles.map((m) => (
                                <View key={m} style={[styles.muscleTag, { backgroundColor: colors.primary + '15' }]}>
                                  <Text style={[typography.captionMedium, { color: colors.primary, fontSize: 10 }]}>
                                    {MUSCLE_LABELS[m] || m}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                          {workout.durationMinutes && (
                            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
                              {formatDuration(workout.durationMinutes)}
                            </Text>
                          )}
                          {workout.totalVolume > 0 && (
                            <Text style={[typography.captionMedium, { color: colors.primary }]}>
                              {Math.round(workout.totalVolume)} кг
                            </Text>
                          )}
                          {workout.rating > 0 && (
                            <Text style={{ fontSize: 10 }}>
                              {'⭐'.repeat(workout.rating)}
                            </Text>
                          )}
                          <Text style={[typography.caption, { color: colors.textTertiary }]}>
                            {completedSets} подх. {isExpanded ? '▲' : '▼'}
                          </Text>
                        </View>
                      </View>

                      {/* Expanded: exercise breakdown */}
                      {isExpanded && (
                        <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                          {!activeWorkout && (
                            <TouchableOpacity
                              onPress={() => handleRepeatWorkout(workout)}
                              style={[{ backgroundColor: colors.primary + '15', borderRadius: borderRadius.sm, paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.md }]}
                            >
                              <Text style={[typography.captionMedium, { color: colors.primary }]}>🔁 Повторить тренировку</Text>
                            </TouchableOpacity>
                          )}
                          {workout.exercises.map((ex: any, ei: number) => {
                            const doneSets = ex.sets.filter((s: any) => s.completed);
                            const vol = doneSets.reduce((s: number, set: any) => s + (set.weight || 0) * (set.reps || 0), 0);
                            const bestSet = doneSets.sort((a: any, b: any) => (b.weight || 0) - (a.weight || 0))[0];
                            return (
                              <View
                                key={ex.id}
                                style={[
                                  styles.exRow,
                                  ei < workout.exercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                                ]}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={[typography.small, { color: colors.text }]} numberOfLines={1}>
                                    {ex.exercise.name}
                                  </Text>
                                  {ex.notes ? (
                                    <Text style={[typography.small, { color: colors.textTertiary, fontStyle: 'italic' }]} numberOfLines={1}>
                                      {ex.notes}
                                    </Text>
                                  ) : null}
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
                                    {doneSets.length}×{bestSet ? `${bestSet.weight}кг` : '-'}
                                  </Text>
                                  {vol > 0 && (
                                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                                      {Math.round(vol)} кг
                                    </Text>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </FadeIn>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 40 },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  muscleTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
});
