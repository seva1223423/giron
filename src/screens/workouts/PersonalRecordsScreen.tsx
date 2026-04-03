import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';

// Epley 1RM estimate
function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Muscle group display names (Russian)
const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь',
  back: 'Спина',
  lats: 'Широчайшие',
  lower_back: 'Нижняя спина',
  shoulders: 'Плечи',
  traps: 'Трапеции',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предплечья',
  quadriceps: 'Квадрицепс',
  hamstrings: 'Задняя поверхность',
  glutes: 'Ягодицы',
  calves: 'Икры',
  abs: 'Пресс',
  obliques: 'Косые мышцы',
  hip_flexors: 'Сгибатели бедра',
  full_body: 'Всё тело',
};

const MUSCLE_ORDER = [
  'chest', 'back', 'lats', 'lower_back', 'shoulders', 'traps',
  'biceps', 'triceps', 'forearms',
  'quadriceps', 'hamstrings', 'glutes', 'calves',
  'abs', 'obliques', 'hip_flexors', 'full_body',
];

interface PREntry {
  exerciseId: string;
  exerciseName: string;
  muscle: string;
  bestWeight: number;
  bestReps: number;
  estimated1RM: number;
  date: string;
  // history of top sets by date (for sparkline)
  history: { date: string; estimated1RM: number }[];
}

export const PersonalRecordsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory, customExercises } = useWorkoutStore();
  const allExercises = useMemo(() => [...customExercises, ...localExercises], [customExercises]);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'1rm' | 'date' | 'name'>('1rm');

  // Compute personal records from workout history
  const allRecords = useMemo((): PREntry[] => {
    // Map: exerciseId → { bestWeight, bestReps, best1RM, date, historyByDate }
    const map = new Map<
      string,
      { bestWeight: number; bestReps: number; best1RM: number; date: string; byDate: Map<string, number> }
    >();

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
            map.set(we.exerciseId, {
              bestWeight: set.weight,
              bestReps: set.reps,
              best1RM: rm,
              date: workoutDate,
              byDate,
            });
          } else {
            // Update best per-date
            const prevDateBest = existing.byDate.get(workoutDate) || 0;
            if (rm > prevDateBest) existing.byDate.set(workoutDate, rm);

            // Update overall best
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
      const name = ex?.name || exerciseId;
      const muscle = ex?.primaryMuscles?.[0] || 'full_body';

      // Build sorted history (oldest→newest) for sparkline
      const history = Array.from(data.byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, estimated1RM]) => ({ date, estimated1RM }));

      entries.push({
        exerciseId,
        exerciseName: name,
        muscle,
        bestWeight: data.bestWeight,
        bestReps: data.bestReps,
        estimated1RM: data.best1RM,
        date: data.date,
        history,
      });
    });

    return entries;
  }, [workoutHistory, allExercises]);

  // Muscles that actually have records
  const availableMuscles = useMemo(() => {
    const s = new Set(allRecords.map((r) => r.muscle));
    return MUSCLE_ORDER.filter((m) => s.has(m));
  }, [allRecords]);

  // Filtered + sorted
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

  // Format date for display
  const formatDate = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

  // Sparkline — tiny inline bar chart (last 8 data points)
  const Sparkline: React.FC<{ history: { estimated1RM: number }[]; color: string }> = ({ history, color }) => {
    const last = history.slice(-8);
    if (last.length < 2) return null;
    const max = Math.max(...last.map((h) => h.estimated1RM));
    const min = Math.min(...last.map((h) => h.estimated1RM));
    const range = max - min || 1;
    const BAR_HEIGHT = 24;
    const BAR_WIDTH = 5;
    const GAP = 3;

    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT, gap: GAP }}>
        {last.map((point, i) => {
          const heightPct = (point.estimated1RM - min) / range;
          const barH = Math.max(3, Math.round(heightPct * BAR_HEIGHT));
          const isLast = i === last.length - 1;
          return (
            <View
              key={i}
              style={{
                width: BAR_WIDTH,
                height: barH,
                borderRadius: 2,
                backgroundColor: isLast ? color : color + '55',
              }}
            />
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Личные рекорды</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>
            {allRecords.length} упражнений с данными
          </Text>
        </View>
      </View>

      {/* Search */}
      <FadeIn delay={0}>
        <TextInput
          style={[
            styles.search,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.inputText,
            },
          ]}
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск упражнения..."
          placeholderTextColor={colors.inputPlaceholder}
        />
      </FadeIn>

      {/* Muscle filter chips */}
      {availableMuscles.length > 0 && (
        <FadeIn delay={40}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing.md }}
          >
            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs }}>
              <TouchableOpacity
                onPress={() => { haptic.selection(); setSelectedMuscle(null); }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selectedMuscle === null ? colors.primary : colors.surface,
                    borderColor: selectedMuscle === null ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[typography.captionMedium, { color: selectedMuscle === null ? '#FFF' : colors.text }]}>
                  Все
                </Text>
              </TouchableOpacity>
              {availableMuscles.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => { haptic.selection(); setSelectedMuscle(selectedMuscle === m ? null : m); }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selectedMuscle === m ? colors.primary : colors.surface,
                      borderColor: selectedMuscle === m ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[typography.captionMedium, { color: selectedMuscle === m ? '#FFF' : colors.text }]}>
                    {MUSCLE_LABELS[m] || m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </FadeIn>
      )}

      {/* Sort controls */}
      <FadeIn delay={60}>
        <View style={[styles.sortRow, { marginBottom: spacing.md }]}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginRight: spacing.sm }]}>
            Сортировка:
          </Text>
          {(['1rm', 'date', 'name'] as const).map((s) => {
            const label = s === '1rm' ? '1ПМ' : s === 'date' ? 'Дата' : 'A–Я';
            return (
              <TouchableOpacity
                key={s}
                onPress={() => { haptic.selection(); setSortBy(s); }}
                style={[
                  styles.sortBtn,
                  {
                    backgroundColor: sortBy === s ? colors.primary + '20' : 'transparent',
                    borderColor: sortBy === s ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[typography.captionMedium, { color: sortBy === s ? colors.primary : colors.textSecondary }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FadeIn>

      {/* Records list */}
      {filtered.length === 0 ? (
        <FadeIn delay={100}>
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>🏆</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>
              {workoutHistory.length === 0
                ? 'Ещё нет завершённых тренировок'
                : 'Ничего не найдено'}
            </Text>
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
              {workoutHistory.length === 0
                ? 'Заверши первую тренировку, чтобы увидеть свои рекорды'
                : 'Попробуй изменить фильтры или поиск'}
            </Text>
          </View>
        </FadeIn>
      ) : (
        filtered.map((record, idx) => {
          const isExpanded = expandedId === record.exerciseId;
          const trend =
            record.history.length >= 2
              ? record.history[record.history.length - 1].estimated1RM -
                record.history[record.history.length - 2].estimated1RM
              : 0;
          const trendColor = trend > 0 ? colors.success : trend < 0 ? colors.error : colors.textTertiary;
          const trendLabel = trend > 0 ? `+${trend} кг` : trend < 0 ? `${trend} кг` : '';

          return (
            <FadeIn key={record.exerciseId} delay={Math.min(idx * 30, 300)}>
              <Card style={{ marginBottom: spacing.sm }}>
                <TouchableOpacity
                  onPress={() => {
                    haptic.selection();
                    setExpandedId(isExpanded ? null : record.exerciseId);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.recordRow}>
                    {/* Rank badge */}
                    <View style={[styles.rankBadge, { backgroundColor: idx < 3 ? colors.primary + '20' : colors.surface }]}>
                      <Text style={[typography.captionMedium, { color: idx < 3 ? colors.primary : colors.textTertiary }]}>
                        {idx + 1}
                      </Text>
                    </View>

                    {/* Exercise info */}
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                        {record.exerciseName}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
                        <Text style={[typography.caption, { color: colors.textTertiary }]}>
                          {MUSCLE_LABELS[record.muscle] || record.muscle}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
                        <Text style={[typography.caption, { color: colors.textTertiary }]}>
                          {formatDate(record.date)}
                        </Text>
                        {trendLabel ? (
                          <>
                            <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
                            <Text style={[typography.captionMedium, { color: trendColor }]}>{trendLabel}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>

                    {/* 1RM + best set */}
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={[typography.number, { color: colors.primary, fontSize: 24 }]}>
                          {record.estimated1RM}
                        </Text>
                        <Text style={[typography.caption, { color: colors.primary }]}>кг</Text>
                      </View>
                      <Text style={[typography.caption, { color: colors.textTertiary }]}>
                        ~1ПМ
                      </Text>
                    </View>
                  </View>

                  {/* Best set + sparkline */}
                  <View style={[styles.subRow, { borderTopColor: colors.divider }]}>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                      Лучший подход:{' '}
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {record.bestWeight} кг × {record.bestReps} пов
                      </Text>
                    </Text>
                    <Sparkline history={record.history} color={colors.primary} />
                  </View>
                </TouchableOpacity>

                {/* Expanded history */}
                {isExpanded && record.history.length > 1 && (
                  <View style={[styles.historySection, { borderTopColor: colors.divider }]}>
                    <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                      ИСТОРИЯ ~1ПМ
                    </Text>
                    {[...record.history].reverse().slice(0, 10).map((h, i) => {
                      const isFirst = i === 0;
                      const barMax = record.estimated1RM;
                      const barPct = Math.round((h.estimated1RM / barMax) * 100);
                      return (
                        <View key={h.date} style={{ marginBottom: spacing.xs }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text style={[typography.caption, { color: isFirst ? colors.primary : colors.textSecondary }]}>
                              {isFirst ? '🏆 ' : ''}{formatDate(h.date)}
                            </Text>
                            <Text style={[typography.captionMedium, { color: isFirst ? colors.primary : colors.text }]}>
                              {h.estimated1RM} кг
                            </Text>
                          </View>
                          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface }}>
                            <View
                              style={{
                                height: 4,
                                borderRadius: 2,
                                width: `${barPct}%` as any,
                                backgroundColor: isFirst ? colors.primary : colors.primary + '40',
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            </FadeIn>
          );
        })
      )}

      <View style={{ height: spacing.huge }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  search: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortBtn: {
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    marginRight: spacing.xs,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  historySection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.huge,
  },
});
