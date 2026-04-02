import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { Exercise, Workout, WorkoutExercise, WorkoutSet } from '../../types';

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

export const CustomWorkoutScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { startWorkout, saveAsTemplate } = useWorkoutStore();
  const [workoutName, setWorkoutName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [step, setStep] = useState<'select' | 'configure'>('select');

  const filteredExercises = useMemo(() =>
    localExercises.filter((ex) => {
      const matchesSearch = searchQuery
        ? ex.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesMuscle = muscleFilter === 'all'
        ? true
        : ex.primaryMuscles.includes(muscleFilter as any);
      return matchesSearch && matchesMuscle;
    }),
  [searchQuery, muscleFilter]);

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
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.md }}
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

      {/* Exercise list */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}>
        {filteredExercises.map((ex) => {
          const selected = isSelected(ex.id);
          return (
            <TouchableOpacity
              key={ex.id}
              onPress={() => toggleExercise(ex)}
              style={[
                styles.exerciseItem,
                {
                  backgroundColor: selected ? colors.primary + '10' : colors.card,
                  borderColor: selected ? colors.primary : colors.card,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{ex.name}</Text>
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
});
