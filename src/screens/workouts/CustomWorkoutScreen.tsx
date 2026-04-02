import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../../types';

const CREATE_MUSCLE_OPTIONS = [
  { key: 'chest', label: 'Грудь' }, { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' }, { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' }, { key: 'quadriceps', label: 'Ноги' },
  { key: 'abs', label: 'Пресс' }, { key: 'glutes', label: 'Ягодицы' },
  { key: 'calves', label: 'Икры' }, { key: 'full_body', label: 'Всё тело' },
];

const CREATE_EQUIPMENT_OPTIONS = [
  { key: 'barbell', label: 'Штанга' }, { key: 'dumbbell', label: 'Гантели' },
  { key: 'bodyweight', label: 'Без снаряжения' }, { key: 'cable', label: 'Блок' },
  { key: 'machine', label: 'Тренажёр' }, { key: 'cardio', label: 'Кардио' },
];

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

const EQUIPMENT_FILTERS = [
  { key: 'all', label: '🏠 Всё' },
  { key: 'barbell', label: '🏋️ Штанга' },
  { key: 'dumbbell', label: '💪 Гантели' },
  { key: 'bodyweight', label: '🤸 Своё тело' },
  { key: 'cable', label: '🔗 Блок' },
  { key: 'machine', label: '⚙️ Тренажёр' },
  { key: 'cardio', label: '🏃 Кардио' },
];

export const CustomWorkoutScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { startWorkout, saveAsTemplate, customExercises, addCustomExercise, deleteCustomExercise } = useWorkoutStore();
  const [workoutName, setWorkoutName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [step, setStep] = useState<'select' | 'configure'>('select');

  // Custom exercise creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExMuscle, setNewExMuscle] = useState('chest');
  const [newExEquipment, setNewExEquipment] = useState('barbell');

  const allExercises = useMemo(() => [...customExercises, ...localExercises], [customExercises]);

  const filteredExercises = useMemo(() =>
    allExercises.filter((ex) => {
      const matchesSearch = searchQuery
        ? ex.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesMuscle = muscleFilter === 'all'
        ? true
        : ex.primaryMuscles.includes(muscleFilter as any);
      const matchesEquipment = equipmentFilter === 'all'
        ? true
        : ex.type === equipmentFilter;
      return matchesSearch && matchesMuscle && matchesEquipment;
    }),
  [allExercises, searchQuery, muscleFilter, equipmentFilter]);

  const handleCreateExercise = () => {
    if (!newExName.trim()) {
      Alert.alert('Введи название', 'Название упражнения не может быть пустым');
      return;
    }
    const exercise: Exercise = {
      id: `custom-${Date.now()}`,
      name: newExName.trim(),
      description: '',
      category: 'strength' as any,
      primaryMuscles: [newExMuscle as any],
      secondaryMuscles: [],
      type: newExEquipment as any,
      difficulty: 'beginner',
      instructions: [],
    };
    addCustomExercise(exercise);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewExName('');
    setNewExMuscle('chest');
    setNewExEquipment('barbell');
    setShowCreateModal(false);
  };

  const handleDeleteCustomExercise = (id: string, name: string) => {
    Alert.alert('Удалить упражнение', `Удалить «${name}»?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          deleteCustomExercise(id);
          setSelectedExercises((prev) => prev.filter((e) => e.id !== id));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const toggleExercise = (exercise: Exercise) => {
    Haptics.selectionAsync();
    setSelectedExercises((prev) => {
      const exists = prev.find((e) => e.id === exercise.id);
      if (exists) return prev.filter((e) => e.id !== exercise.id);
      return [...prev, exercise];
    });
  };

  const isSelected = (id: string) => selectedExercises.some((e) => e.id === id);

  const buildWorkout = (): Workout => {
    const workoutExercises: WorkoutExercise[] = selectedExercises.map((ex, index) => {
      const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1,
        type: 'normal' as const,
        reps: 10,
        weight: 0,
        completed: false,
      }));
      return {
        id: `we-${Date.now()}-${index}`,
        exerciseId: ex.id,
        exercise: ex,
        order: index,
        sets,
        restSeconds: 90,
      };
    });
    return {
      id: `workout-${Date.now()}`,
      name: workoutName || `Тренировка ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`,
      exercises: workoutExercises,
    };
  };

  const handleStart = () => {
    if (selectedExercises.length === 0) {
      Alert.alert('Выбери упражнения', 'Добавь хотя бы одно упражнение в тренировку');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startWorkout(buildWorkout());
    navigation.navigate('ActiveWorkout');
  };

  const handleSaveTemplate = () => {
    if (selectedExercises.length === 0) {
      Alert.alert('Выбери упражнения', 'Добавь хотя бы одно упражнение');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveAsTemplate(buildWorkout());
    Alert.alert('Сохранено', 'Шаблон добавлен в «Мои шаблоны»');
  };

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    Haptics.selectionAsync();
    setSelectedExercises((prev) => {
      const arr = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= arr.length) return prev;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  };

  if (step === 'configure') {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('select')}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={[typography.h2, { color: colors.text, flex: 1, marginLeft: spacing.md }]}>
            Настройка
          </Text>
        </View>

        <TextInput
          style={[
            styles.nameInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.inputText,
            },
          ]}
          value={workoutName}
          onChangeText={setWorkoutName}
          placeholder="Название тренировки"
          placeholderTextColor={colors.inputPlaceholder}
        />

        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>
          Упражнения ({selectedExercises.length})
        </Text>

        {selectedExercises.map((ex, i) => (
          <FadeIn key={ex.id} delay={i * 60}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={styles.configRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.name}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    4 x 10 • Отдых 90с
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  {i > 0 && (
                    <TouchableOpacity onPress={() => moveExercise(i, 'up')} style={styles.moveBtn}>
                      <Text style={[typography.body, { color: colors.textSecondary }]}>↑</Text>
                    </TouchableOpacity>
                  )}
                  {i < selectedExercises.length - 1 && (
                    <TouchableOpacity onPress={() => moveExercise(i, 'down')} style={styles.moveBtn}>
                      <Text style={[typography.body, { color: colors.textSecondary }]}>↓</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => toggleExercise(ex)}
                    style={[styles.moveBtn, { backgroundColor: colors.error + '15' }]}
                  >
                    <Text style={[typography.body, { color: colors.error }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          </FadeIn>
        ))}

        <Button
          title="Сохранить как шаблон"
          variant="outline"
          onPress={handleSaveTemplate}
          fullWidth
          style={{ marginTop: spacing.xl }}
        />

        <Button
          title="Начать тренировку"
          onPress={handleStart}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.selectHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>Выбери упражнения</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TouchableOpacity onPress={() => setShowCreateModal(true)}>
            <Text style={[typography.bodySemibold, { color: colors.accent }]}>+ Своё</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (selectedExercises.length > 0) setStep('configure');
            }}
          >
            <Text style={[typography.bodySemibold, { color: selectedExercises.length > 0 ? colors.primary : colors.textTertiary }]}>
              Далее ({selectedExercises.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
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
          placeholder="Поиск упражнений..."
          placeholderTextColor={colors.inputPlaceholder}
        />
        {(searchQuery || muscleFilter !== 'all' || equipmentFilter !== 'all') && (
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs, textAlign: 'right' }]}>
            {filteredExercises.length} упражнений
          </Text>
        )}
      </View>

      {/* Muscle filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.xs }}
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

      {/* Equipment filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.md }}
      >
        {EQUIPMENT_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { Haptics.selectionAsync(); setEquipmentFilter(f.key); }}
            style={[
              styles.filterChip,
              {
                backgroundColor: equipmentFilter === f.key ? colors.accent : colors.surface,
                borderColor: equipmentFilter === f.key ? colors.accent : colors.border,
              },
            ]}
          >
            <Text style={[typography.captionMedium, { color: equipmentFilter === f.key ? '#FFF' : colors.text }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Exercise list */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}>
        {filteredExercises.map((ex) => {
          const selected = isSelected(ex.id);
          const isCustom = ex.id.startsWith('custom-');
          return (
            <TouchableOpacity
              key={ex.id}
              onPress={() => toggleExercise(ex)}
              onLongPress={() => isCustom && handleDeleteCustomExercise(ex.id, ex.name)}
              style={[
                styles.exerciseItem,
                {
                  backgroundColor: selected ? colors.primary + '10' : colors.card,
                  borderColor: selected ? colors.primary : colors.card,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.name}</Text>
                  {isCustom && (
                    <View style={{ backgroundColor: colors.accent + '25', borderRadius: borderRadius.full, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.accent, fontWeight: '600' }}>МОЁ</Text>
                    </View>
                  )}
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {ex.primaryMuscles.join(', ')}
                </Text>
              </View>
              <View style={[
                styles.checkCircle,
                {
                  backgroundColor: selected ? colors.primary : 'transparent',
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}>
                {selected && <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Create custom exercise modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[typography.h4, { color: colors.text }]}>Новое упражнение</Text>
            <TouchableOpacity onPress={handleCreateExercise}>
              <Text style={[typography.bodySemibold, { color: colors.primary }]}>Сохранить</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              НАЗВАНИЕ
            </Text>
            <TextInput
              style={[styles.nameInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, marginBottom: spacing.xl }]}
              value={newExName}
              onChangeText={setNewExName}
              placeholder="Название упражнения"
              placeholderTextColor={colors.inputPlaceholder}
              autoFocus
            />

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              ГРУППА МЫШЦ
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xl }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {CREATE_MUSCLE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setNewExMuscle(opt.key)}
                    style={[styles.filterChip, { backgroundColor: newExMuscle === opt.key ? colors.primary : colors.surface, borderColor: newExMuscle === opt.key ? colors.primary : colors.border }]}
                  >
                    <Text style={[typography.captionMedium, { color: newExMuscle === opt.key ? '#FFF' : colors.text }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              СНАРЯЖЕНИЕ
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {CREATE_EQUIPMENT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setNewExEquipment(opt.key)}
                    style={[styles.filterChip, { backgroundColor: newExEquipment === opt.key ? colors.accent : colors.surface, borderColor: newExEquipment === opt.key ? colors.accent : colors.border }]}
                  >
                    <Text style={[typography.captionMedium, { color: newExEquipment === opt.key ? '#FFF' : colors.text }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>
    </View>
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
  selectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  searchInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
});
