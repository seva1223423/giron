import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

export const ActiveWorkoutScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const {
    activeWorkout,
    completeSet,
    addSet,
    removeSet,
    nextExercise,
    prevExercise,
    finishWorkout,
    cancelWorkout,
    setRestTimer,
  } = useWorkoutStore();

  const [restTime, setRestTime] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRest = (seconds: number) => {
    setRestTime(seconds);
    setIsResting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRestTime((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsResting(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const skipRest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsResting(false);
    setRestTime(0);
  };

  if (!activeWorkout) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[typography.h3, { color: colors.text }]}>Нет активной тренировки</Text>
        <Button title="К тренировкам" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const { workout, currentExerciseIndex, startTime } = activeWorkout;
  const currentExercise = workout.exercises[currentExerciseIndex];
  const elapsed = Math.round((Date.now() - startTime) / 60000);

  const handleCompleteSet = (setIndex: number, reps: number, weight: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    completeSet(currentExerciseIndex, setIndex, { reps, weight });
    startRest(currentExercise.restSeconds || 90);
  };

  const handleFinish = () => {
    Alert.alert('Завершить тренировку?', 'Прогресс будет сохранён', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Завершить',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          finishWorkout();
          navigation.goBack();
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Отменить тренировку?', 'Прогресс не будет сохранён', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, отменить',
        style: 'destructive',
        onPress: () => {
          cancelWorkout();
          navigation.goBack();
        },
      },
    ]);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[typography.bodySemibold, { color: colors.text }]}>{workout.name}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{elapsed} мин</Text>
        </View>
        <TouchableOpacity onPress={handleFinish}>
          <Text style={[typography.bodySemibold, { color: colors.success }]}>Готово</Text>
        </TouchableOpacity>
      </View>

      {/* Rest timer overlay */}
      {isResting && (
        <View style={[styles.restOverlay, { backgroundColor: colors.primary }]}>
          <Text style={[typography.caption, { color: 'rgba(255,255,255,0.7)' }]}>ОТДЫХ</Text>
          <Text style={[{ fontSize: 56, fontWeight: '800', color: '#FFF' }]}>
            {formatTime(restTime)}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
            <TouchableOpacity
              onPress={() => setRestTime((r) => r + 30)}
              style={[styles.restBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            >
              <Text style={[typography.buttonSmall, { color: '#FFF' }]}>+30с</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={skipRest}
              style={[styles.restBtn, { backgroundColor: '#FFF' }]}
            >
              <Text style={[typography.buttonSmall, { color: colors.primary }]}>Пропустить</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Exercise navigation */}
      <View style={[styles.exerciseNav, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={prevExercise}
          disabled={currentExerciseIndex === 0}
          style={{ opacity: currentExerciseIndex === 0 ? 0.3 : 1 }}
        >
          <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
            {currentExerciseIndex + 1} из {workout.exercises.length}
          </Text>
          <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>
            {currentExercise.exercise.name}
          </Text>
        </View>
        <TouchableOpacity
          onPress={nextExercise}
          disabled={currentExerciseIndex === workout.exercises.length - 1}
          style={{ opacity: currentExerciseIndex === workout.exercises.length - 1 ? 0.3 : 1 }}
        >
          <Text style={[typography.h3, { color: colors.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Sets */}
      <ScrollView contentContainerStyle={styles.setsContainer} showsVerticalScrollIndicator={false}>
        {/* Table header */}
        <View style={styles.setRow}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, width: 40 }]}>Сет</Text>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1, textAlign: 'center' }]}>Вес (кг)</Text>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, flex: 1, textAlign: 'center' }]}>Повт.</Text>
          <View style={{ width: 60 }} />
        </View>

        {currentExercise.sets.map((set, setIndex) => (
          <SetRow
            key={set.id}
            set={set}
            setIndex={setIndex}
            onComplete={(reps, weight) => handleCompleteSet(setIndex, reps, weight)}
            colors={colors}
          />
        ))}

        <Button
          title="+ Добавить подход"
          variant="ghost"
          size="sm"
          onPress={() => addSet(currentExerciseIndex)}
          style={{ marginTop: spacing.md }}
        />

        {/* Exercise description */}
        <Card style={{ marginTop: spacing.xxl }}>
          <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.sm }]}>Техника:</Text>
          {currentExercise.exercise.instructions.map((inst, i) => (
            <Text key={i} style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              {i + 1}. {inst}
            </Text>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
};

// Individual set row component
const SetRow: React.FC<{
  set: any;
  setIndex: number;
  onComplete: (reps: number, weight: number) => void;
  colors: any;
}> = ({ set, setIndex, onComplete, colors }) => {
  const [weight, setWeight] = useState(set.weight?.toString() || '');
  const [reps, setReps] = useState(set.reps?.toString() || '10');

  return (
    <View
      style={[
        styles.setRow,
        {
          backgroundColor: set.completed ? colors.success + '10' : 'transparent',
          borderRadius: borderRadius.sm,
          paddingVertical: spacing.sm,
        },
      ]}
    >
      <Text style={[typography.bodyMedium, { color: colors.textSecondary, width: 40 }]}>
        {setIndex + 1}
      </Text>
      <TextInput
        style={[
          styles.setInput,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
        ]}
        value={weight}
        onChangeText={setWeight}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.inputPlaceholder}
      />
      <TextInput
        style={[
          styles.setInput,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
        ]}
        value={reps}
        onChangeText={setReps}
        keyboardType="numeric"
        placeholder="10"
        placeholderTextColor={colors.inputPlaceholder}
      />
      <TouchableOpacity
        style={[
          styles.checkBtn,
          {
            backgroundColor: set.completed ? colors.success : colors.inputBackground,
            borderColor: set.completed ? colors.success : colors.border,
          },
        ]}
        onPress={() => onComplete(parseInt(reps) || 0, parseFloat(weight) || 0)}
      >
        <Text style={{ color: set.completed ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>
          ✓
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  restOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: spacing.xxxl,
  },
  restBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  exerciseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  setsContainer: {
    padding: spacing.xl,
    paddingBottom: spacing.huge * 2,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
  },
  setInput: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
