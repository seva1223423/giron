import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../../store';
import { Card, Button, FadeIn, Icon, HitTarget, NumberSheet } from '../../../components';
import { buildPresets } from '../../../utils/wheel';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../../../types';
import { startWorkoutSafe } from '../../../utils/startWorkoutSafe';

interface ExConfig { sets: number; reps: number; rest: number; }
const DEFAULT_CONFIG: ExConfig = { sets: 4, reps: 10, rest: 90 };

/**
 * The three numbers that describe an exercise. Each used to sit between a
 * pair of 28pt ± buttons — six per card, thirty-six on a six-exercise
 * workout. They are values now; tapping one opens the wheel.
 */
const FIELDS = [
  { label: 'Подходы',     field: 'sets' as const, min: 1,  max: 20,  step: 1,  fmt: (v: number) => String(v) },
  { label: 'Повторения', field: 'reps' as const, min: 1,  max: 50,  step: 1,  fmt: (v: number) => String(v) },
  { label: 'Отдых',       field: 'rest' as const, min: 15, max: 300, step: 15, fmt: (v: number) => `${v}с` },
];

interface Props {
  selectedExercises: Exercise[];
  onRemove: (exercise: Exercise) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onBack: () => void;
  navigation: any;
}

export const ConfigureStep: React.FC<Props> = ({ selectedExercises, onRemove, onMove, onBack, navigation }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const { saveAsTemplate } = useWorkoutStore();
  const [workoutName, setWorkoutName] = useState('');
  const [exConfigs, setExConfigs] = useState<Record<string, ExConfig>>({});
  const [supersetPairs, setSupersetPairs] = useState<Set<number>>(new Set());

  const getConfig = (id: string): ExConfig => exConfigs[id] ?? DEFAULT_CONFIG;

  const updateConfig = (id: string, patch: Partial<ExConfig>) => {
    setExConfigs((prev) => ({ ...prev, [id]: { ...getConfig(id), ...patch } }));
  };

  const toggleSuperset = (i: number) => {
    haptic.selection();
    setSupersetPairs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const buildWorkout = (): Workout => {
    const exercises: WorkoutExercise[] = selectedExercises.map((ex, index) => {
      const cfg = getConfig(ex.id);
      const sets: WorkoutSet[] = Array.from({ length: cfg.sets }, (_, i) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1,
        type: 'normal' as const,
        reps: cfg.reps,
        weight: 0,
        completed: false,
      }));
      let supersetGroupId: string | undefined;
      if (supersetPairs.has(index)) supersetGroupId = `ss-${index}`;
      else if (supersetPairs.has(index - 1)) supersetGroupId = `ss-${index - 1}`;
      return {
        id: `we-${Date.now()}-${index}`,
        exerciseId: ex.id,
        exercise: ex,
        order: index,
        sets,
        restSeconds: cfg.rest,
        ...(supersetGroupId ? { supersetGroupId } : {}),
      };
    });
    return {
      id: `workout-${Date.now()}`,
      name: workoutName || `Тренировка ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
      exercises,
    };
  };

  const handleStart = (navigation: any) => {
    haptic.medium();
    startWorkoutSafe(buildWorkout(), navigation);
  };

  const handleSaveTemplate = () => {
    haptic.success();
    saveAsTemplate(buildWorkout());
    Alert.alert('Сохранено', 'Шаблон добавлен в «Мои шаблоны»');
  };

  // Clear index-based superset pairs when exercises are reordered — indices become stale
  const handleMove = (index: number, direction: 'up' | 'down') => {
    setSupersetPairs(new Set());
    onMove(index, direction);
  };

  // ConfigureStep needs navigation to start workout — pass it via context or prop
  // Since this is called from CustomWorkoutScreen which has navigation, we use a callback
  return (
    <ConfigureStepView
      selectedExercises={selectedExercises}
      onRemove={onRemove}
      onMove={handleMove}
      onBack={onBack}
      workoutName={workoutName}
      onNameChange={setWorkoutName}
      exConfigs={exConfigs}
      onUpdateConfig={updateConfig}
      supersetPairs={supersetPairs}
      onToggleSuperset={toggleSuperset}
      onStart={handleStart}
      onSaveTemplate={handleSaveTemplate}
      getConfig={getConfig}
      navigation={navigation}
    />
  );
};

interface InnerProps {
  selectedExercises: Exercise[];
  onRemove: (exercise: Exercise) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onBack: () => void;
  workoutName: string;
  onNameChange: (name: string) => void;
  exConfigs: Record<string, ExConfig>;
  onUpdateConfig: (id: string, patch: Partial<ExConfig>) => void;
  supersetPairs: Set<number>;
  onToggleSuperset: (i: number) => void;
  onStart: (navigation: any) => void;
  onSaveTemplate: () => void;
  getConfig: (id: string) => ExConfig;
}

// Separate inner component so we can pass navigation via prop from CustomWorkoutScreen
export const ConfigureStepView: React.FC<InnerProps & { navigation: any }> = ({
  selectedExercises, onRemove, onMove, onBack, workoutName, onNameChange,
  exConfigs, onUpdateConfig, supersetPairs, onToggleSuperset, onStart,
  onSaveTemplate, getConfig, navigation,
}) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  // One sheet for the whole list — only one number is ever being edited.
  const [editing, setEditing] = useState<{ exId: string; field: 'sets' | 'reps' | 'rest' } | null>(null);
  const editSpec = editing ? FIELDS.find((f) => f.field === editing.field)! : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: spacing.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <HitTarget
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Назад"
          >
            <View style={[styles.backBtn, { transform: [{ rotate: '180deg' }] }]}>
              <Icon name="chev" size={20} color={colors.text} />
            </View>
          </HitTarget>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>02 · НАСТРОЙКА</Text>
            <Text style={[typography.h2, { color: colors.text, marginTop: 2 }]}>Параметры</Text>
          </View>
        </View>

        <TextInput
          style={[styles.nameInput, typography.body, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
          value={workoutName}
          onChangeText={onNameChange}
          placeholder="Название тренировки"
          placeholderTextColor={colors.inputPlaceholder}
        />

        <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.md }]}>
          УПРАЖНЕНИЯ ({selectedExercises.length})
        </Text>

        {selectedExercises.map((ex, i) => {
          const cfg = getConfig(ex.id);
          const isSupersetStart = supersetPairs.has(i);
          return (
            <FadeIn key={ex.id} delay={i * 60}>
              <Card style={{ marginBottom: spacing.xs }}>
                <View style={styles.configRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    {i > 0 && (
                      <HitTarget onPress={() => onMove(i, 'up')} accessibilityRole="button" accessibilityLabel="Переместить вверх">
                        <View style={[styles.moveBtn, { borderColor: colors.border, transform: [{ rotate: '-90deg' }] }]}>
                          <Icon name="chev" size={14} color={colors.textSecondary} />
                        </View>
                      </HitTarget>
                    )}
                    {i < selectedExercises.length - 1 && (
                      <HitTarget onPress={() => onMove(i, 'down')} accessibilityRole="button" accessibilityLabel="Переместить вниз">
                        <View style={[styles.moveBtn, { borderColor: colors.border, transform: [{ rotate: '90deg' }] }]}>
                          <Icon name="chev" size={14} color={colors.textSecondary} />
                        </View>
                      </HitTarget>
                    )}
                    <HitTarget onPress={() => onRemove(ex)} accessibilityRole="button" accessibilityLabel="Удалить упражнение">
                      <View style={[styles.moveBtn, { backgroundColor: colors.error + '15', borderColor: colors.error + '40', transform: [{ rotate: '45deg' }] }]}>
                        <Icon name="plus" size={14} color={colors.error} />
                      </View>
                    </HitTarget>
                  </View>
                </View>

                <View style={styles.steppersRow}>
                  {FIELDS.map((s, si) => (
                    <React.Fragment key={s.field}>
                      {si > 0 && <View style={[styles.stepperDivider, { backgroundColor: colors.divider }]} />}
                      <HitTarget
                        onPress={() => { haptic.selection(); setEditing({ exId: ex.id, field: s.field }); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.label}: ${s.fmt(cfg[s.field])}. Нажми, чтобы изменить`}
                      >
                        <View style={styles.stepperGroup}>
                          <Text style={[typography.caption, { color: colors.textTertiary }]}>{s.label}</Text>
                          <Text style={[typography.h4, { color: colors.text }]} allowFontScaling={false}>
                            {s.fmt(cfg[s.field])}
                          </Text>
                        </View>
                      </HitTarget>
                    </React.Fragment>
                  ))}
                </View>
              </Card>

              {i < selectedExercises.length - 1 && (
                <TouchableOpacity
                  onPress={() => onToggleSuperset(i)}
                  accessibilityRole="button"
                  accessibilityLabel={isSupersetStart ? 'Убрать суперсет' : 'Добавить суперсет'}
                  style={[styles.supersetBtn, { backgroundColor: isSupersetStart ? colors.accent + '20' : colors.surface, borderColor: isSupersetStart ? colors.accent : colors.border }]}
                >
                  <Icon name="link" size={14} color={isSupersetStart ? colors.accent : colors.textTertiary} />
                  <Text style={[typography.captionMedium, { color: isSupersetStart ? colors.accent : colors.textTertiary }]}>
                    {isSupersetStart ? 'Суперсет активен' : 'Суперсет'}
                  </Text>
                </TouchableOpacity>
              )}
            </FadeIn>
          );
        })}

        <Button title="Сохранить как шаблон" variant="outline" onPress={onSaveTemplate} fullWidth style={{ marginTop: spacing.xl }} />
      </ScrollView>

      {/* Sticky-bottom primary CTA — thumb-zone (§19) */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
            elevation: 8,
          },
        ]}
      >
        <Button
          title="Начать тренировку"
          onPress={() => onStart(navigation)}
          disabled={selectedExercises.length === 0}
          fullWidth
          size="lg"
          hapticStyle="medium"
        />
      </View>

      {editing && editSpec && (
        <NumberSheet
          visible
          onClose={() => setEditing(null)}
          title={editSpec.label}
          primary={{
            label: editSpec.label,
            value: getConfig(editing.exId)[editing.field],
            onChange: (v) => onUpdateConfig(editing.exId, { [editing.field]: v }),
            min: editSpec.min,
            max: editSpec.max,
            step: editSpec.step,
            unit: editing.field === 'rest' ? 'сек' : undefined,
          }}
          presets={buildPresets(getConfig(editing.exId)[editing.field], editSpec.step, editSpec.min)}
          confirmLabel="Готово"
          onConfirm={() => setEditing(null)}
        />
      )}
    </View>
  );
};

// Wrap with state
export const ConfigureStepContainer: React.FC<{
  selectedExercises: Exercise[];
  onRemove: (exercise: Exercise) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onBack: () => void;
  navigation: any;
}> = ({ selectedExercises, onRemove, onMove, onBack, navigation }) => {
  const { saveAsTemplate } = useWorkoutStore();
  const [workoutName, setWorkoutName] = useState('');
  const [exConfigs, setExConfigs] = useState<Record<string, ExConfig>>({});
  const [supersetPairs, setSupersetPairs] = useState<Set<number>>(new Set());

  const getConfig = (id: string): ExConfig => exConfigs[id] ?? DEFAULT_CONFIG;

  const updateConfig = (id: string, patch: Partial<ExConfig>) =>
    setExConfigs((prev) => ({ ...prev, [id]: { ...getConfig(id), ...patch } }));

  const toggleSuperset = (i: number) =>
    setSupersetPairs((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });

  const buildWorkout = (): Workout => {
    const exercises: WorkoutExercise[] = selectedExercises.map((ex, index) => {
      const cfg = getConfig(ex.id);
      const sets: WorkoutSet[] = Array.from({ length: cfg.sets }, (_, i) => ({
        id: `set-${Date.now()}-${index}-${i}`, setNumber: i + 1, type: 'normal' as const, reps: cfg.reps, weight: 0, completed: false,
      }));
      let supersetGroupId: string | undefined;
      if (supersetPairs.has(index)) supersetGroupId = `ss-${index}`;
      else if (supersetPairs.has(index - 1)) supersetGroupId = `ss-${index - 1}`;
      return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: cfg.rest, ...(supersetGroupId ? { supersetGroupId } : {}) };
    });
    return {
      id: `workout-${Date.now()}`,
      name: workoutName || `Тренировка ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
      exercises,
    };
  };

  return (
    <ConfigureStepView
      selectedExercises={selectedExercises}
      onRemove={onRemove}
      onMove={onMove}
      onBack={onBack}
      workoutName={workoutName}
      onNameChange={setWorkoutName}
      exConfigs={exConfigs}
      onUpdateConfig={updateConfig}
      supersetPairs={supersetPairs}
      onToggleSuperset={toggleSuperset}
      onStart={() => startWorkoutSafe(buildWorkout(), navigation)}
      onSaveTemplate={() => { if (selectedExercises.length === 0) { Alert.alert('Ошибка', 'Добавьте хотя бы одно упражнение'); return; } saveAsTemplate(buildWorkout()); Alert.alert('Сохранено', 'Шаблон добавлен в «Мои шаблоны»'); }}
      getConfig={getConfig}
      navigation={navigation}
    />
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nameInput: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
  configRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  moveBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  steppersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperGroup: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center' },
  stepperDivider: { width: 1, height: 36, marginHorizontal: spacing.xs },
  supersetBtn: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, borderWidth: 1, marginVertical: spacing.xs, marginBottom: spacing.sm },
  bottomBar: { borderTopWidth: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, paddingBottom: spacing.lg },
});
