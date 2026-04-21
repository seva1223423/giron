import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Button, Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { workoutService } from '../../services';
import type { RoutineStartPayload, RoutineHistoryEntry } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtWeight(w: number | undefined): string {
  if (!w || w === 0) return '—';
  return Number.isInteger(w) ? `${w} кг` : `${w} кг`;
}

function fmtRest(sec: number): string {
  if (sec === 0) return '';
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} мин` : `${m}м ${s}с`;
}

function estimateVolume(exercises: RoutineStartPayload['exercises']): number {
  return exercises.reduce((total, ex) =>
    total + ex.sets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0), 0
  );
}

// ─── Progression Preview Modal ─────────────────────────────────────────────────

interface ProgressionPreviewProps {
  payload: RoutineStartPayload;
  onConfirm: () => void;
  onCancel: () => void;
  colors: any;
}

const ProgressionPreviewModal: React.FC<ProgressionPreviewProps> = ({ payload, onConfirm, onCancel, colors }) => {
  const hasProgression = payload.exercises.some((e) => e.progressionApplied);
  const vol = estimateVolume(payload.exercises);
  const lastUsedStr = payload.lastUsedAt
    ? new Date(payload.lastUsedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={previewStyles.overlay}>
        <View style={[previewStyles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: 4 }]}>{payload.name}</Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
            {payload.exercises.length} упр. · {vol > 0 ? `~${Math.round(vol / 1000 * 10) / 10} т объём` : 'объём не задан'}
            {lastUsedStr ? ` · прошлый раз ${lastUsedStr}` : ' · первый запуск'}
          </Text>

          {hasProgression && (
            <View style={[previewStyles.progressionBanner, { backgroundColor: colors.success + '15', borderColor: colors.success + '40' }]}>
              <Text style={[typography.captionMedium, { color: colors.success }]}>
                Прогрессия применена — все подходы завершены в прошлый раз
              </Text>
            </View>
          )}

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {payload.exercises.map((ex, i) => (
              <View key={ex.exerciseId + i} style={[previewStyles.exRow, { borderBottomColor: colors.divider }]}>
                <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {ex.exercise?.name ?? ex.exerciseId}
                </Text>
                {ex.progressionApplied && ex.previousWeight !== null ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[typography.captionMedium, { color: colors.success }]}>
                      {ex.previousWeight} → {ex.sets[0]?.weight ?? ex.previousWeight} кг
                    </Text>
                    <Text style={[typography.caption, { color: colors.success + 'CC' }]}>+2.5 кг</Text>
                  </View>
                ) : ex.previousWeight !== null ? (
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {ex.previousWeight} кг (без изменений)
                  </Text>
                ) : (
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>первый раз</Text>
                )}
              </View>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
            <Button title="Отмена" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
            <Button title="Начать" onPress={onConfirm} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const previewStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.xl, paddingBottom: 48,
  },
  progressionBanner: {
    padding: spacing.sm, borderRadius: borderRadius.md,
    borderWidth: 1, marginBottom: spacing.md,
  },
  exRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1,
  },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export const RoutineDetailScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { routineId } = route.params as { routineId: string };
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { routines, activeWorkout, removeRoutine, updateRoutineName, duplicateRoutine, startWorkoutFromRoutine, fetchRoutines } = useWorkoutStore();

  const routine = routines.find((r) => r.id === routineId);

  const [isStarting, setIsStarting] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<RoutineStartPayload | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [history, setHistory] = useState<RoutineHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!routine) return;
    setLoadingHistory(true);
    workoutService.getRoutineHistory(routine.id)
      .then((r) => setHistory(r.history))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [routine?.id]);

  const handleStartPress = useCallback(async () => {
    if (!routine) return;
    if (activeWorkout) {
      Alert.alert(
        'Тренировка уже идёт',
        `«${activeWorkout.workout.name}» не завершена.`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть текущую', onPress: () => navigation.navigate('ActiveWorkout') },
        ],
      );
      return;
    }
    haptic.medium();
    setIsStarting(true);
    try {
      const payload = await workoutService.prepareRoutineWorkout(routine.id);
      setPreviewPayload(payload);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить данные о прогрессии. Проверь соединение.');
    } finally {
      setIsStarting(false);
    }
  }, [routine, activeWorkout, haptic, navigation]);

  const handleConfirmStart = useCallback(async () => {
    if (!previewPayload || !routine) return;
    const payload = previewPayload;
    setPreviewPayload(null);
    const workout = await startWorkoutFromRoutine(routine.id, payload);
    if (workout) {
      haptic.success();
      navigation.navigate('ActiveWorkout');
    } else {
      Alert.alert('Ошибка', 'Не удалось запустить тренировку.');
    }
  }, [previewPayload, routine, startWorkoutFromRoutine, haptic, navigation]);

  const openRename = useCallback(() => {
    if (!routine) return;
    setRenameValue(routine.name);
    setShowRename(true);
  }, [routine]);

  const handleRename = useCallback(async () => {
    const name = renameValue.trim();
    if (!name || !routine) return;
    if (name === routine.name) { setShowRename(false); return; }
    setRenaming(true);
    try {
      await updateRoutineName(routine.id, name, routine.description);
      haptic.success();
      setShowRename(false);
    } catch {
      haptic.error();
      Alert.alert('Ошибка', 'Не удалось переименовать. Проверь соединение.');
    } finally {
      setRenaming(false);
    }
  }, [renameValue, routine, updateRoutineName, haptic]);

  const handleRemoveExercise = useCallback(async (exerciseIndex: number) => {
    if (!routine) return;
    if (routine.exercises.length <= 1) {
      Alert.alert('Нельзя удалить', 'Рутина должна содержать хотя бы одно упражнение.');
      return;
    }
    haptic.medium();
    setSavingEdit(true);
    const updated = routine.exercises
      .filter((_, i) => i !== exerciseIndex)
      .map((ex, i) => ({
        exerciseId: ex.exerciseId,
        order: i,
        restSeconds: ex.restSeconds,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({ setNumber: s.setNumber, type: s.type as string, reps: s.reps, weight: s.weight, rpe: s.rpe })),
      }));
    try {
      const saved = await workoutService.updateRoutine(routine.id, { name: routine.name, description: routine.description, exercises: updated });
      updateRoutineName(routine.id, saved.name, saved.description ?? null);
      // Update routines list with new exercises (full refresh)
      fetchRoutines().catch(() => {});
      haptic.success();
    } catch {
      haptic.error();
      Alert.alert('Ошибка', 'Не удалось сохранить. Проверь соединение.');
    } finally {
      setSavingEdit(false);
    }
  }, [routine, haptic, updateRoutineName, fetchRoutines]);

  const handleDuplicate = useCallback(async () => {
    if (!routine) return;
    haptic.medium();
    const copy = await duplicateRoutine(routine.id);
    if (copy) {
      haptic.success();
      Alert.alert('Скопировано', `«${copy.name}» добавлена в список рутин.`);
    } else {
      Alert.alert('Ошибка', 'Не удалось скопировать. Проверь соединение.');
    }
  }, [routine, duplicateRoutine, haptic]);

  const handleDelete = useCallback(() => {
    if (!routine) return;
    haptic.medium();
    Alert.alert(
      'Удалить рутину?',
      `«${routine.name}» будет удалена. История тренировок не затрагивается.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeRoutine(routine.id);
              haptic.success();
              navigation.goBack();
            } catch {
              haptic.error();
              Alert.alert('Ошибка', 'Не удалось удалить. Проверь соединение.');
            }
          },
        },
      ],
    );
  }, [routine, removeRoutine, haptic, navigation]);

  if (!routine) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: safeTop, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
          </TouchableOpacity>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Рутина не найдена</Text>
        </View>
      </View>
    );
  }

  const totalSets = routine.exercises.reduce((s, e) => s + e.sets.length, 0);
  const createdDate = new Date(routine.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: safeTop, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>{routine.name}</Text>
        </View>
        <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 18, color: colors.error }}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats row */}
        <FadeIn delay={0}>
          <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.statItem}>
              <Text style={[typography.h3, { color: colors.primary }]}>{routine.exercises.length}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>упражнений</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[typography.h3, { color: colors.primary }]}>{totalSets}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>подходов</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>создана</Text>
              <Text style={[typography.captionMedium, { color: colors.text }]}>{createdDate}</Text>
            </View>
          </View>
        </FadeIn>

        {/* Quick actions */}
        <FadeIn delay={50}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <TouchableOpacity
              onPress={openRename}
              style={[styles.actionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>✎ Переименовать</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDuplicate}
              style={[styles.actionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>◈ Дублировать</Text>
            </TouchableOpacity>
          </View>
        </FadeIn>

        {routine.description ? (
          <FadeIn delay={60}>
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={[typography.small, { color: colors.textSecondary, lineHeight: 20 }]}>{routine.description}</Text>
            </Card>
          </FadeIn>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, marginTop: spacing.sm }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1 }]}>УПРАЖНЕНИЯ</Text>
          <TouchableOpacity
            onPress={() => setEditMode((v) => !v)}
            style={[styles.actionChip, { borderColor: editMode ? colors.primary + '60' : colors.border, backgroundColor: editMode ? colors.primary + '12' : colors.surface }]}
          >
            <Text style={[typography.caption, { color: editMode ? colors.primary : colors.textSecondary }]}>
              {editMode ? 'Готово' : 'Редактировать'}
            </Text>
          </TouchableOpacity>
        </View>

        {routine.exercises.map((ex, i) => (
          <FadeIn key={ex.id ?? ex.exerciseId + i} delay={80 + i * 40}>
            <Card style={{ marginBottom: spacing.sm }}>
              {/* Exercise header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                <View style={[styles.exIndex, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={[typography.captionMedium, { color: colors.primary }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                    {ex.exercise?.name ?? ex.exerciseId}
                  </Text>
                  {ex.restSeconds > 0 && (
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      Отдых: {fmtRest(ex.restSeconds)}
                    </Text>
                  )}
                </View>
                {editMode && (
                  <TouchableOpacity
                    onPress={() => handleRemoveExercise(i)}
                    disabled={savingEdit}
                    style={[styles.deleteBtn, { borderColor: colors.error + '50', marginLeft: spacing.sm }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {savingEdit ? <ActivityIndicator size="small" color={colors.error} /> : <Text style={{ color: colors.error }}>×</Text>}
                  </TouchableOpacity>
                )}
              </View>

              {ex.notes ? (
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm, fontStyle: 'italic' }]}>
                  {ex.notes}
                </Text>
              ) : null}

              {/* Sets table */}
              <View style={[styles.setsHeader, { borderBottomColor: colors.border }]}>
                <Text style={[typography.caption, { color: colors.textTertiary, width: 32 }]}>Под.</Text>
                <Text style={[typography.caption, { color: colors.textTertiary, width: 80 }]}>Вес</Text>
                <Text style={[typography.caption, { color: colors.textTertiary, width: 60 }]}>Повт.</Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>Тип</Text>
              </View>
              {ex.sets.map((s) => (
                <View key={s.setNumber} style={[styles.setRow, { borderBottomColor: colors.border + '60' }]}>
                  <Text style={[typography.caption, { color: colors.textSecondary, width: 32 }]}>{s.setNumber}</Text>
                  <Text style={[typography.captionMedium, { color: colors.text, width: 80 }]}>{fmtWeight(s.weight)}</Text>
                  <Text style={[typography.captionMedium, { color: colors.text, width: 60 }]}>
                    {s.reps != null ? `×${s.reps}` : '—'}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    {s.type === 'normal' ? '' : s.type ?? ''}
                  </Text>
                </View>
              ))}
            </Card>
          </FadeIn>
        ))}

        {/* Progression history */}
        {(history.length > 0 || loadingHistory) && (
          <FadeIn delay={180}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.sm }]}>
              ПРОГРЕССИЯ
            </Text>
            {loadingHistory ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                {history.slice(0, 5).map((session, si) => {
                  const dateStr = new Date(session.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                  return (
                    <View
                      key={session.id}
                      style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{dateStr}</Text>
                      {session.exercises.slice(0, 3).map((ex) => (
                        <View key={ex.exerciseId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                          <Text style={[typography.caption, { color: colors.text, flex: 1 }]} numberOfLines={1}>{ex.name}</Text>
                          <Text style={[typography.captionMedium, { color: ex.maxWeight ? colors.primary : colors.textTertiary }]}>
                            {ex.maxWeight ? `${ex.maxWeight}кг` : '—'}
                          </Text>
                        </View>
                      ))}
                      {session.durationMinutes ? (
                        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                          {session.durationMinutes} мин
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </FadeIn>
        )}

        <FadeIn delay={200}>
          <View style={{ marginTop: spacing.md, marginBottom: spacing.huge }}>
            <Button
              title={isStarting ? 'Загружаю прогресс...' : 'Начать тренировку'}
              onPress={handleStartPress}
              disabled={isStarting}
              fullWidth
              size="lg"
            />
            {isStarting && (
              <View style={{ position: 'absolute', right: spacing.lg, top: '50%' }}>
                <ActivityIndicator size="small" color={colors.background} />
              </View>
            )}
          </View>
        </FadeIn>
      </ScrollView>

      {/* Progression preview modal */}
      {previewPayload && (
        <ProgressionPreviewModal
          payload={previewPayload}
          onConfirm={handleConfirmStart}
          onCancel={() => setPreviewPayload(null)}
          colors={colors}
        />
      )}

      {/* Rename modal */}
      <Modal visible={showRename} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={[previewStyles.overlay, { justifyContent: 'center', paddingHorizontal: spacing.xl }]}>
            <View style={[{ backgroundColor: colors.surface, borderRadius: 16, padding: spacing.xl }]}>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Переименовать рутину</Text>
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                style={[styles.renameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                autoFocus
                maxLength={200}
                returnKeyType="done"
                onSubmitEditing={handleRename}
              />
              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                <Button title="Отмена" variant="ghost" onPress={() => setShowRename(false)} style={{ flex: 1 }} disabled={renaming} />
                <Button title={renaming ? 'Сохранение...' : 'Сохранить'} onPress={handleRename} style={{ flex: 1 }} disabled={renaming || !renameValue.trim()} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: spacing.sm,
  },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  statsRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statDivider: { width: 1 },
  exIndex: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  setsHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    marginBottom: spacing.xs,
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginRight: spacing.sm,
    minWidth: 140,
    maxWidth: 160,
  },
  actionChip: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
