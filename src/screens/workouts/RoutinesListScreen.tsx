/**
 * RoutinesListScreen — user's saved Routines.
 *
 * A Routine is a server-backed, named workout template. Unlike the older
 * `savedTemplates` (client-only Zustand persist), routines have:
 *  - an id issued by the server
 *  - exercises + sets with per-set reps/weight/rpe
 *  - a `/routines/:id/start` endpoint that auto-applies progressive overload
 *    (+2.5kg if all sets were closed last session with reps ≥ target)
 *
 * This screen is the single place for the user to see, start, and delete
 * their routines. Creation happens from the WorkoutSummaryScreen via the
 * "Save as routine" action — after a real workout, not in this screen,
 * because progression only makes sense off of actual history.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

export const RoutinesListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { routines, isLoadingRoutines, fetchRoutines, removeRoutine, startWorkoutFromRoutine, activeWorkout } = useWorkoutStore();

  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutines().catch(() => {});
  }, []);

  const handleStart = async (id: string, name: string) => {
    if (activeWorkout) {
      Alert.alert(
        'Тренировка уже идёт',
        `«${activeWorkout.workout.name}» не завершена. Сначала заверши её или отмени.`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть текущую', onPress: () => navigation.navigate('ActiveWorkout') },
        ],
      );
      return;
    }
    haptic.medium();
    setStartingId(id);
    try {
      const workout = await startWorkoutFromRoutine(id);
      if (workout) {
        haptic.success();
        navigation.navigate('ActiveWorkout');
      } else {
        Alert.alert('Ошибка', 'Не удалось запустить рутину. Проверь соединение.');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось запустить рутину. Проверь соединение.');
    } finally {
      setStartingId(null);
    }
  };

  const handleDelete = (id: string, name: string) => {
    haptic.medium();
    Alert.alert(
      'Удалить рутину?',
      `«${name}» будет удалена. Прогресс по упражнениям в истории не затрагивается.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeRoutine(id);
              haptic.success();
            } catch {
              haptic.error();
              Alert.alert('Ошибка', 'Не удалось удалить. Проверь соединение.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: safeTop, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text, flex: 1, textAlign: 'center' }]}>Мои рутины</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoadingRoutines} onRefresh={() => fetchRoutines().catch(() => {})} tintColor={colors.primary} />}
      >
        {routines.length === 0 && !isLoadingRoutines && (
          <FadeIn delay={0}>
            <Card style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, marginBottom: spacing.md }}>◈</Text>
              <Text style={[typography.h4, { color: colors.text, textAlign: 'center', marginBottom: spacing.sm }]}>
                Нет сохранённых рутин
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }]}>
                Заверши тренировку и нажми <Text style={{ fontWeight: '700', color: colors.primary }}>«Сохранить как рутину»</Text> — сервер будет автоматически добавлять +2.5 кг после успешной сессии.
              </Text>
            </Card>
          </FadeIn>
        )}

        {routines.length === 0 && isLoadingRoutines && (
          <View style={{ paddingVertical: spacing.huge, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {routines.map((routine, i) => {
          const totalSets = routine.exercises.reduce((s, e) => s + e.sets.length, 0);
          const previewNames = routine.exercises.slice(0, 3).map((e) => e.exercise?.name).filter(Boolean).join(', ');
          const rest = routine.exercises.length - 3;
          const isStarting = startingId === routine.id;
          return (
            <FadeIn key={routine.id} delay={i * 60}>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{routine.name}</Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                      {routine.exercises.length} упр. · {totalSets} подходов
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(routine.id, routine.name)}
                    style={[styles.deleteBtn, { borderColor: colors.error + '50' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 14, color: colors.error }}>×</Text>
                  </TouchableOpacity>
                </View>
                {previewNames && (
                  <Text style={[typography.small, { color: colors.textTertiary, marginBottom: spacing.md }]} numberOfLines={2}>
                    {previewNames}{rest > 0 ? ` +${rest}` : ''}
                  </Text>
                )}
                <Button
                  title={isStarting ? 'Запускаю...' : 'Начать тренировку'}
                  onPress={() => handleStart(routine.id, routine.name)}
                  disabled={isStarting}
                  fullWidth
                  size="sm"
                />
              </Card>
            </FadeIn>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
