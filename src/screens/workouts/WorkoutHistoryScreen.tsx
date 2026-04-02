import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Dimensions } from 'react-native';
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

const MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'chest', label: 'Грудь' },
  { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' },
  { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' },
  { key: 'quadriceps', label: 'Ноги' },
  { key: 'abs', label: 'Пресс' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

// Mini bar chart for volume trend
const VolumeTrendChart: React.FC<{ data: { label: string; value: number }[]; color: string; colors: any }> = ({ data, color, colors }) => {
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
              <View
                style={{
                  width: '85%',
                  height: h,
                  borderRadius: 3,
                  backgroundColor: isLast ? color : color + '60',
                }}
              />
              <Text style={{ color: colors.textTertiary, fontSize: 8, marginTop: 3 }} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export const WorkoutHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { workoutHistory, activeWorkout, startWorkout } = useWorkoutStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');

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

  const filteredWorkouts = useMemo(() => {
    return workoutHistory.filter((w) => {
      const matchesSearch = searchQuery
        ? w.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesMuscle = muscleFilter === 'all'
        ? true
        : w.exercises.some((ex: any) => ex.exercise?.primaryMuscles?.includes(muscleFilter));
      return matchesSearch && matchesMuscle;
    });
  }, [workoutHistory, searchQuery, muscleFilter]);

  const groups = useMemo(() => groupWorkoutsByMonth(filteredWorkouts), [filteredWorkouts]);

  // Volume trend: last 8 completed workouts (with volume)
  const volumeTrend = useMemo(() => {
    return workoutHistory
      .filter((w) => w.completedAt && (w.totalVolume || 0) > 0)
      .slice(0, 8)
      .reverse()
      .map((w) => ({
        label: new Date(w.completedAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' ', ''),
        value: Math.round(w.totalVolume || 0),
      }));
  }, [workoutHistory]);

  const totalVolumeTons = Math.round(
    workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0) / 1000
  );
  const totalHours = Math.round(
    workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0) / 60
  );
  const avgDuration = workoutHistory.length > 0
    ? Math.round(workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0) / workoutHistory.length)
    : 0;

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
            <Card style={{ marginBottom: spacing.lg }}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.primary }]}>{workoutHistory.length}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.accent }]}>{totalVolumeTons}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>тонн</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.success }]}>{totalHours}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>часов</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.protein }]}>{avgDuration}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>мин/тр.</Text>
                </View>
              </View>

              {volumeTrend.length >= 2 && (
                <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
                  <VolumeTrendChart data={volumeTrend} color={colors.primary} colors={colors} />
                </View>
              )}
            </Card>
          </FadeIn>

          {/* Search */}
          <FadeIn delay={40}>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Поиск по названию..."
              placeholderTextColor={colors.inputPlaceholder}
            />
          </FadeIn>

          {/* Muscle filter chips */}
          <FadeIn delay={60}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
            >
              {MUSCLE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { Haptics.selectionAsync(); setMuscleFilter(f.key); }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: muscleFilter === f.key ? colors.primary : colors.surface,
                      borderColor: muscleFilter === f.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? '#FFF' : colors.text }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </FadeIn>

          {/* Results count */}
          {(searchQuery || muscleFilter !== 'all') && (
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Найдено: {filteredWorkouts.length}
            </Text>
          )}

          {filteredWorkouts.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
              <Text style={{ fontSize: 40, marginBottom: spacing.md }}>🔍</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                Ничего не найдено
              </Text>
            </View>
          )}

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
                          {workout.notes ? (
                            <Text style={[typography.small, { color: colors.textSecondary, fontStyle: 'italic', marginBottom: spacing.md }]} numberOfLines={3}>
                              📝 {workout.notes}
                            </Text>
                          ) : null}
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
  searchInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
