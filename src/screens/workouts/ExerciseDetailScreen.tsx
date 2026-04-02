import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, Linking, Alert, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', forearms: 'Предплечья', quadriceps: 'Квадрицепс',
  hamstrings: 'Бицепс бедра', glutes: 'Ягодицы', calves: 'Икры',
  abs: 'Пресс', obliques: 'Косые', traps: 'Трапеции', lats: 'Широчайшие',
  lower_back: 'Поясница', hip_flexors: 'Сгибатели бедра',
  adductors: 'Приводящие', abductors: 'Отводящие',
};

const TYPE_LABELS: Record<string, string> = {
  barbell: 'Штанга', dumbbell: 'Гантели', machine: 'Тренажёр',
  cable: 'Блок', bodyweight: 'Своё тело', kettlebell: 'Гиря',
  band: 'Резинка', cardio: 'Кардио', stretch: 'Растяжка',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#4CAF50', intermediate: '#FF9800', advanced: '#F44336', expert: '#9C27B0',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mini line chart for 1RM trend
const TrendChart: React.FC<{ data: { label: string; value: number }[]; color: string; colors: any }> = ({ data, color, colors }) => {
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map((d) => d.value));
  const minVal = Math.min(...data.map((d) => d.value));
  const range = maxVal - minVal || 1;
  const h = 90;

  return (
    <View style={{ height: h + 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={[{ color: colors.textTertiary, fontSize: 10 }]}>{maxVal} кг</Text>
        <Text style={[{ color: colors.textTertiary, fontSize: 10 }]}>{minVal} кг</Text>
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
            <Text style={[{ color: colors.textTertiary, fontSize: 9 }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export const ExerciseDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { exerciseId } = route.params;
  const { colors } = useThemeStore();
  const { workoutHistory, activeWorkout, addExerciseToWorkout } = useWorkoutStore();

  const exercise = localExercises.find((e) => e.id === exerciseId);
  if (!exercise) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[typography.h3, { color: colors.text }]}>Упражнение не найдено</Text>
        <Button title="Назад" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const exerciseHistory = useMemo(() =>
    workoutHistory
      .filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId))
      .map((w) => {
        const ex = w.exercises.find((e) => e.exerciseId === exerciseId)!;
        const completedSets = ex.sets.filter((s) => s.completed && s.weight && s.reps);
        const bestSet = completedSets.sort((a, b) => (b.weight || 0) * (b.reps || 0) - (a.weight || 0) * (a.reps || 0))[0];
        return {
          date: w.completedAt || w.startedAt || '',
          sets: ex.sets.filter((s) => s.completed),
          bestWeight: bestSet?.weight || 0,
          bestReps: bestSet?.reps || 0,
          totalVolume: completedSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [workoutHistory, exerciseId]);

  const maxWeight = Math.max(0, ...exerciseHistory.map((h) => h.bestWeight));
  const estimated1RM = maxWeight > 0 && exerciseHistory[0]
    ? Math.round(maxWeight * (1 + exerciseHistory[0].bestReps / 30))
    : 0;

  const oneRMTrend = useMemo(() =>
    [...exerciseHistory]
      .reverse()
      .slice(-10)
      .map((h) => ({
        label: new Date(h.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' ', ''),
        value: Math.round(h.bestWeight * (1 + h.bestReps / 30)),
      })),
  [exerciseHistory]);

  const difficultyColor = DIFFICULTY_COLORS[exercise.difficulty] || colors.textSecondary;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'} </Text>
          </TouchableOpacity>
          <Text style={[typography.h2, { color: colors.text, flex: 1 }]} numberOfLines={2}>
            {exercise.name}
          </Text>
        </View>
      </FadeIn>

      {/* Tags */}
      <FadeIn delay={80}>
        <View style={styles.tagsRow}>
          <View style={[styles.tag, { backgroundColor: difficultyColor + '20' }]}>
            <Text style={[typography.captionMedium, { color: difficultyColor }]}>
              {DIFFICULTY_LABELS[exercise.difficulty] || exercise.difficulty}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>
              {TYPE_LABELS[exercise.type] || exercise.type}
            </Text>
          </View>
          <View style={[styles.tag, { backgroundColor: colors.info + '15' }]}>
            <Text style={[typography.captionMedium, { color: colors.info }]}>
              {exercise.category === 'strength' ? 'Силовое' : exercise.category === 'cardio' ? 'Кардио' : exercise.category}
            </Text>
          </View>
        </View>
      </FadeIn>

      {/* Add to active workout */}
      {activeWorkout && (
        <FadeIn delay={120}>
          <TouchableOpacity
            onPress={() => {
              const alreadyAdded = activeWorkout.workout.exercises.some((e) => e.exerciseId === exerciseId);
              if (alreadyAdded) {
                Alert.alert('Уже добавлено', 'Это упражнение уже есть в текущей тренировке.');
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              addExerciseToWorkout(exercise);
              Alert.alert('Добавлено!', `${exercise.name} добавлено в тренировку.`, [
                { text: 'Продолжить просмотр' },
                { text: 'К тренировке', onPress: () => navigation.navigate('ActiveWorkout') },
              ]);
            }}
            style={[{ backgroundColor: colors.success + '18', borderWidth: 1, borderColor: colors.success + '50', borderRadius: borderRadius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }]}
          >
            <Text style={{ fontSize: 18 }}>➕</Text>
            <Text style={[typography.bodySemibold, { color: colors.success }]}>Добавить в текущую тренировку</Text>
          </TouchableOpacity>
        </FadeIn>
      )}

      {/* Description */}
      <FadeIn delay={160}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          {exercise.description}
        </Text>
      </FadeIn>

      {/* Video preview card */}
      <FadeIn delay={200}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={async () => {
            const videoUrl = exercise.youtubeId
              ? `https://www.youtube.com/watch?v=${exercise.youtubeId}`
              : null;
            const appUrl = exercise.youtubeId
              ? `youtube://www.youtube.com/watch?v=${exercise.youtubeId}`
              : null;
            const query = encodeURIComponent(`${exercise.name} техника выполнения`);
            const searchWebUrl = `https://www.youtube.com/results?search_query=${query}`;
            const searchAppUrl = `youtube://results?search_query=${query}`;
            try {
              if (appUrl && videoUrl) {
                const canOpen = await Linking.canOpenURL(appUrl);
                await Linking.openURL(canOpen ? appUrl : videoUrl);
              } else {
                const canOpen = await Linking.canOpenURL(searchAppUrl);
                await Linking.openURL(canOpen ? searchAppUrl : searchWebUrl);
              }
            } catch {
              Linking.openURL(videoUrl || searchWebUrl);
            }
          }}
          style={[styles.videoCard, { borderColor: colors.border }]}
        >
          {/* Thumbnail area */}
          <View style={styles.videoThumbnail}>
            {exercise.youtubeId ? (
              <Image
                source={{ uri: `https://img.youtube.com/vi/${exercise.youtubeId}/hqdefault.jpg` }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.videoOverlay} />
            {/* Muscle groups watermark */}
            <Text style={styles.videoMuscleText}>
              {exercise.primaryMuscles.map((m) => (MUSCLE_LABELS[m] || m)).join(' · ')}
            </Text>
            {/* Play button */}
            <View style={styles.playButton}>
              <View style={styles.playButtonInner}>
                <Text style={{ color: '#FFF', fontSize: 18, marginLeft: 3 }}>▶</Text>
              </View>
            </View>
            {/* YouTube badge */}
            <View style={styles.youtubeBadge}>
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>▶ YouTube</Text>
            </View>
          </View>
          {/* Bottom info */}
          <View style={[styles.videoInfo, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>
                {exercise.name} — техника выполнения
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                Нажми чтобы открыть в приложении YouTube
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
          </View>
        </TouchableOpacity>
      </FadeIn>

      {/* Muscles */}
      <FadeIn delay={240}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Мышцы
          </Text>
          <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            Основные:
          </Text>
          <View style={styles.muscleRow}>
            {exercise.primaryMuscles.map((m) => (
              <View key={m} style={[styles.muscleChip, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[typography.captionMedium, { color: colors.primary }]}>
                  {MUSCLE_LABELS[m] || m}
                </Text>
              </View>
            ))}
          </View>
          {exercise.secondaryMuscles.length > 0 && (
            <>
              <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
                Вспомогательные:
              </Text>
              <View style={styles.muscleRow}>
                {exercise.secondaryMuscles.map((m) => (
                  <View key={m} style={[styles.muscleChip, { backgroundColor: colors.surface }]}>
                    <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
                      {MUSCLE_LABELS[m] || m}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
      </FadeIn>

      {/* Instructions */}
      <FadeIn delay={320}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Техника выполнения
          </Text>
          {exercise.instructions.map((inst, i) => (
            <View key={i} style={styles.instructionRow}>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                {inst}
              </Text>
            </View>
          ))}
        </Card>
      </FadeIn>

      {/* Personal records */}
      {exerciseHistory.length > 0 && (
        <FadeIn delay={400}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Твои рекорды
            </Text>
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
                <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                  ДИНАМИКА ~1ПМ
                </Text>
                <TrendChart data={oneRMTrend} color={colors.accent} colors={colors} />
              </View>
            )}
          </Card>
        </FadeIn>
      )}

      {/* Recent history */}
      {exerciseHistory.length > 0 && (
        <FadeIn delay={480}>
          <Card style={{ marginBottom: spacing.huge }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
              Последние тренировки
            </Text>
            {exerciseHistory.slice(0, 5).map((h, i) => (
              <View
                key={i}
                style={[
                  styles.historyRow,
                  i < Math.min(exerciseHistory.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <Text style={[typography.small, { color: colors.textSecondary, width: 80 }]}>
                  {new Date(h.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </Text>
                <Text style={[typography.bodyMedium, { color: colors.text, flex: 1 }]}>
                  {h.bestWeight} кг x {h.bestReps}
                </Text>
                <Text style={[typography.small, { color: colors.textTertiary }]}>
                  {Math.round(h.totalVolume)} кг
                </Text>
              </View>
            ))}
          </Card>
        </FadeIn>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  tag: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  videoCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  videoThumbnail: {
    height: 160,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  videoMuscleText: {
    position: 'absolute',
    top: 10,
    left: 12,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  youtubeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    backgroundColor: '#FF0000',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  videoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  muscleChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  recordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  recordItem: { alignItems: 'center' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
