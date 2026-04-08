import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { HistoryStatsCard, WorkoutCard } from './history';

const MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' }, { key: 'chest', label: 'Грудь' }, { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' }, { key: 'biceps', label: 'Бицепс' }, { key: 'triceps', label: 'Трицепс' },
  { key: 'quadriceps', label: 'Ноги' }, { key: 'abs', label: 'Пресс' },
];

function groupByMonth(workouts: any[]) {
  const map = new Map<string, any[]>();
  workouts.forEach((w) => {
    const d = new Date(w.completedAt || w.startedAt || '');
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const arr = map.get(key) ?? [];
    arr.push({ ...w, _label: label });
    map.set(key, arr);
  });
  return Array.from(map.entries()).map(([key, items]) => ({ key, label: items[0]._label, workouts: items }));
}

export const WorkoutHistoryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');

  const filtered = useMemo(() => workoutHistory.filter((w) => {
    const matchSearch = !searchQuery || w.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchMuscle = muscleFilter === 'all' || w.exercises.some((ex: any) => ex.exercise?.primaryMuscles?.includes(muscleFilter));
    return matchSearch && matchMuscle;
  }), [workoutHistory, searchQuery, muscleFilter]);

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>История тренировок</Text>
        <View style={{ width: 24 }} />
      </View>

      {workoutHistory.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56, marginBottom: spacing.lg }}>🏋️</Text>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Нет тренировок</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            После первой тренировки здесь появится история
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <HistoryStatsCard workoutHistory={workoutHistory} />

          <FadeIn delay={40}>
            <TextInput
              style={[styles.search, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
              value={searchQuery} onChangeText={setSearchQuery}
              placeholder="Поиск по названию..." placeholderTextColor={colors.inputPlaceholder}
            />
          </FadeIn>

          <FadeIn delay={60}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
              {MUSCLE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => { haptic.selection(); setMuscleFilter(f.key); }}
                  style={[styles.chip, { backgroundColor: muscleFilter === f.key ? colors.primary : colors.surface, borderColor: muscleFilter === f.key ? colors.primary : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </FadeIn>

          {(searchQuery || muscleFilter !== 'all') && (
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>Найдено: {filtered.length}</Text>
          )}

          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
              <Text style={{ fontSize: 40, marginBottom: spacing.md }}>🔍</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>Ничего не найдено</Text>
            </View>
          )}

          {groups.map((group, gi) => (
            <FadeIn key={group.key} delay={gi * 40}>
              <Text style={[typography.captionMedium, { color: colors.textTertiary, marginBottom: spacing.md, marginTop: gi > 0 ? spacing.lg : 0 }]}>
                {group.label.toUpperCase()}
              </Text>
              {group.workouts.map((workout) => (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  isExpanded={expandedId === workout.id}
                  onToggle={() => setExpandedId(expandedId === workout.id ? null : workout.id)}
                  navigation={navigation}
                />
              ))}
            </FadeIn>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  search: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, marginBottom: spacing.md },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
});
