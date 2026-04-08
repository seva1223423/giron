import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { PRRecordCard, PRFilters, MUSCLE_ORDER, epley1RM } from './records';
import type { PREntry } from './records';

export const PersonalRecordsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { workoutHistory, customExercises } = useWorkoutStore();
  const allExercises = useMemo(() => [...customExercises, ...localExercises], [customExercises]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'1rm' | 'date' | 'name'>('1rm');

  const allRecords = useMemo((): PREntry[] => {
    const map = new Map<string, { bestWeight: number; bestReps: number; best1RM: number; date: string; byDate: Map<string, number> }>();

    workoutHistory.forEach((workout) => {
      const workoutDate = (workout.completedAt || workout.startedAt || '').split('T')[0];
      if (!workoutDate) return;
      workout.exercises.forEach((we) => {
        we.sets.forEach((set) => {
          if (!set.completed || !set.weight || !set.reps || set.weight <= 0 || set.reps <= 0) return;
          if (set.type === 'warmup') return;
          const rm = epley1RM(set.weight, set.reps);
          const existing = map.get(we.exerciseId);
          if (!existing) {
            const byDate = new Map<string, number>();
            byDate.set(workoutDate, rm);
            map.set(we.exerciseId, { bestWeight: set.weight, bestReps: set.reps, best1RM: rm, date: workoutDate, byDate });
          } else {
            const prevDateBest = existing.byDate.get(workoutDate) || 0;
            if (rm > prevDateBest) existing.byDate.set(workoutDate, rm);
            if (rm > existing.best1RM) {
              existing.bestWeight = set.weight;
              existing.bestReps = set.reps;
              existing.best1RM = rm;
              existing.date = workoutDate;
            }
          }
        });
      });
    });

    const entries: PREntry[] = [];
    map.forEach((data, exerciseId) => {
      const ex = allExercises.find((e) => e.id === exerciseId);
      const history = Array.from(data.byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, estimated1RM]) => ({ date, estimated1RM }));
      entries.push({
        exerciseId,
        exerciseName: ex?.name || exerciseId,
        muscle: ex?.primaryMuscles?.[0] || 'full_body',
        bestWeight: data.bestWeight,
        bestReps: data.bestReps,
        estimated1RM: data.best1RM,
        date: data.date,
        history,
      });
    });
    return entries;
  }, [workoutHistory, allExercises]);

  const availableMuscles = useMemo(() => {
    const s = new Set(allRecords.map((r) => r.muscle));
    return MUSCLE_ORDER.filter((m) => s.has(m));
  }, [allRecords]);

  const filtered = useMemo(() => {
    let list = allRecords;
    if (selectedMuscle) list = list.filter((r) => r.muscle === selectedMuscle);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.exerciseName.toLowerCase().includes(q));
    }
    if (sortBy === '1rm') return [...list].sort((a, b) => b.estimated1RM - a.estimated1RM);
    if (sortBy === 'date') return [...list].sort((a, b) => b.date.localeCompare(a.date));
    return [...list].sort((a, b) => a.exerciseName.localeCompare(b.exerciseName, 'ru'));
  }, [allRecords, selectedMuscle, search, sortBy]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Личные рекорды</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>{allRecords.length} упражнений с данными</Text>
        </View>
      </View>

      <PRFilters
        search={search}
        onSearch={setSearch}
        availableMuscles={availableMuscles}
        selectedMuscle={selectedMuscle}
        onSelectMuscle={setSelectedMuscle}
        sortBy={sortBy}
        onSortBy={setSortBy}
      />

      {filtered.length === 0 ? (
        <FadeIn delay={100}>
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>🏆</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>
              {workoutHistory.length === 0 ? 'Ещё нет завершённых тренировок' : 'Ничего не найдено'}
            </Text>
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
              {workoutHistory.length === 0
                ? 'Заверши первую тренировку, чтобы увидеть свои рекорды'
                : 'Попробуй изменить фильтры или поиск'}
            </Text>
          </View>
        </FadeIn>
      ) : (
        filtered.map((record, idx) => (
          <PRRecordCard
            key={record.exerciseId}
            record={record}
            idx={idx}
            isExpanded={expandedId === record.exerciseId}
            onToggle={() => setExpandedId(expandedId === record.exerciseId ? null : record.exerciseId)}
          />
        ))
      )}

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  emptyState: { alignItems: 'center', paddingTop: spacing.huge },
});
