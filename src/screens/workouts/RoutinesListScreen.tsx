import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

export const RoutinesListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { routines, isLoadingRoutines, fetchRoutines, removeRoutine, workoutHistory, startWorkoutFromRoutine } = useWorkoutStore();
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutines().catch(() => {});
  }, []);

  const handleStart = async (id: string) => {
    haptic.medium();
    setStartingId(id);
    try {
      const workout = await startWorkoutFromRoutine(id);
      if (workout) navigation.navigate('ActiveWorkout');
    } catch {
      haptic.error();
      Alert.alert('Ошибка', 'Не удалось запустить рутину. Проверь соединение.');
    } finally {
      setStartingId(null);
    }
  };

  const handleDelete = (id: string, name: string) => {
    haptic.medium();
    Alert.alert(
      'Удалить рутину?',
      `«${name}» будет удалена. История тренировок не затрагивается.`,
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
        refreshControl={
          <RefreshControl
            refreshing={isLoadingRoutines}
            onRefresh={() => fetchRoutines().catch(() => {})}
            tintColor={colors.primary}
          />
        }
      >
        {routines.length === 0 && isLoadingRoutines && (
          <View style={{ paddingVertical: spacing.huge, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {routines.length === 0 && !isLoadingRoutines && (
          <FadeIn delay={0}>
            <Card style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, marginBottom: spacing.md }}>◈</Text>
              <Text style={[typography.h4, { color: colors.text, textAlign: 'center', marginBottom: spacing.sm }]}>
                Нет сохранённых рутин
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }]}>
                Заверши тренировку и нажми{' '}
                <Text style={{ fontWeight: '700', color: colors.primary }}>«Сохранить как рутину»</Text>
                {' '}— следующий раз сервер автоматически добавит +2.5 кг после успешной сессии.
              </Text>
            </Card>
          </FadeIn>
        )}

        {[...routines].sort((a, b) => {
          const aLast = workoutHistory.find((w) => w.routineId === a.id && w.completedAt)?.completedAt;
          const bLast = workoutHistory.find((w) => w.routineId === b.id && w.completedAt)?.completedAt;
          if (aLast && bLast) return new Date(bLast).getTime() - new Date(aLast).getTime();
          if (aLast) return -1;
          if (bLast) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }).map((routine, i) => {
          const totalSets = routine.exercises.reduce((s, e) => s + e.sets.length, 0);
          const previewNames = routine.exercises.slice(0, 3).map((e) => e.exercise?.name).filter(Boolean).join(', ');
          const rest = routine.exercises.length - 3;
          const lastWorkout = workoutHistory.find((w) => w.routineId === routine.id && w.completedAt);
          const lastUsedStr = lastWorkout?.completedAt
            ? new Date(lastWorkout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
            : null;

          return (
            <FadeIn key={routine.id} delay={i * 50}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => { haptic.selection(); navigation.navigate('RoutineDetail', { routineId: routine.id }); }}
              >
                <Card style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: previewNames ? spacing.xs : 0 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{routine.name}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                        {routine.exercises.length} упр. · {totalSets} подходов
                        {lastUsedStr ? ` · ${lastUsedStr}` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => handleStart(routine.id)}
                        disabled={startingId !== null}
                        style={[styles.startBtn, { backgroundColor: colors.success + (startingId === routine.id ? '30' : '18'), borderColor: colors.success + '50' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {startingId === routine.id
                          ? <ActivityIndicator size="small" color={colors.success} />
                          : <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700' }}>▶</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(routine.id, routine.name)}
                        style={[styles.deleteBtn, { borderColor: colors.error + '50' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: 14, color: colors.error }}>×</Text>
                      </TouchableOpacity>
                      <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
                    </View>
                  </View>
                  {previewNames ? (
                    <Text style={[typography.small, { color: colors.textTertiary }]} numberOfLines={1}>
                      {previewNames}{rest > 0 ? ` +${rest}` : ''}
                    </Text>
                  ) : null}
                </Card>
              </TouchableOpacity>
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
  startBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
