import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { Workout } from '../../../types';

interface Props {
  workouts: Workout[];
  delay?: number;
  navigation?: any;
}

const MUSCLE_CHIPS = [
  { label: 'Все', key: null },
  { label: 'Грудь', key: 'chest' },
  { label: 'Спина', key: 'back' },
  { label: 'Ноги', key: 'legs' },
  { label: 'Плечи', key: 'shoulders' },
  { label: 'Руки', key: 'arms' },
] as const;

type MuscleKey = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | null;

const MUSCLE_FILTER_MAP: Record<string, string[]> = {
  chest: ['chest'],
  back: ['back', 'lats'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  shoulders: ['shoulders'],
  arms: ['biceps', 'triceps', 'forearms'],
};

const PAGE_SIZE = 50;

function workoutMatchesMuscle(workout: Workout, muscleKey: string): boolean {
  const muscles = MUSCLE_FILTER_MAP[muscleKey] ?? [];
  return workout.exercises.some((ex) =>
    ex.exercise.primaryMuscles.some((m) => muscles.includes(m))
  );
}

export const WorkoutHistoryList: React.FC<Props> = ({ workouts, delay = 600, navigation }) => {
  const { colors } = useThemeStore();
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleKey>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = workouts.filter((w) => {
    const matchesSearch = search.trim() === '' || w.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesMuscle = muscleFilter === null || workoutMatchesMuscle(w, muscleFilter);
    return matchesSearch && matchesMuscle;
  });

  const displayed = showAll ? filtered.slice(0, PAGE_SIZE) : filtered.slice(0, PAGE_SIZE);
  const visibleCount = showAll ? Math.min(filtered.length, PAGE_SIZE) : Math.min(filtered.length, 10);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount && visibleCount < PAGE_SIZE;

  return (
    <FadeIn delay={delay}>
      <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
        Последние тренировки
      </Text>

      {/* Search bar */}
      <TextInput
        style={[
          styles.searchInput,
          {
            backgroundColor: colors.card,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        placeholder="Поиск по названию..."
        placeholderTextColor={colors.textSecondary}
        value={search}
        onChangeText={(t) => { setSearch(t); setShowAll(false); }}
        clearButtonMode="while-editing"
      />

      {/* Muscle filter chips */}
      <View style={styles.chipsRow}>
        {MUSCLE_CHIPS.map((chip) => {
          const active = muscleFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.label}
              onPress={() => { setMuscleFilter(chip.key as MuscleKey); setShowAll(false); }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[typography.small, { color: active ? '#fff' : colors.textSecondary }]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            {workouts.length === 0
              ? 'Нет завершённых тренировок. Начни первую!'
              : 'Ничего не найдено. Попробуй другой запрос.'}
          </Text>
        </Card>
      ) : (
        <>
          {visible.map((workout, i) => (
            <FadeIn key={workout.id} delay={delay + 50 + i * 50}>
              <Card
                style={{ marginBottom: spacing.sm }}
                onPress={navigation ? () => navigation.navigate('WorkoutsTab', { screen: 'WorkoutSummary', params: { workout } }) : undefined}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{workout.name}</Text>
                    <Text style={[typography.small, { color: colors.textSecondary }]} numberOfLines={1}>
                      {workout.exercises.length} упр. {'\u2022'} {workout.durationMinutes || 0} мин
                      {workout.totalVolume ? ` \u2022 ${Math.round(workout.totalVolume)} кг` : ''}
                      {workout.exercises.some((e: any) => e.supersetGroupId) && <Text style={{ fontSize: 9, fontWeight: '700', color: colors.accent }}> SS</Text>}
                    </Text>
                  </View>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    {workout.completedAt
                      ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                      : ''}
                  </Text>
                </View>
              </Card>
            </FadeIn>
          ))}

          {hasMore && (
            <TouchableOpacity
              onPress={() => setShowAll(true)}
              style={[styles.showMoreBtn, { borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <Text style={[typography.bodyMedium, { color: colors.primary }]}>
                Показать ещё ({filtered.length - visibleCount})
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  searchInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 15,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
});
