import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ActiveWorkoutScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const {
    activeWorkout,
    workoutHistory,
    completeSet,
    addSet,
    removeSet,
    nextExercise,
    prevExercise,
    finishWorkout,
    cancelWorkout,
    setRestTimer,
    setExerciseNotes,
    updateSetData,
  } = useWorkoutStore();

  const [restTime, setRestTime] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [prToast, setPrToast] = useState<{ name: string; rm: number } | null>(null);
  const prToastAnim = useRef(new Animated.Value(0)).current;
  const prToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showPrToast = useCallback((name: string, rm: number) => {
    if (prToastTimer.current) clearTimeout(prToastTimer.current);
    setPrToast({ name, rm });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.spring(prToastAnim, { toValue: 1, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(prToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setPrToast(null));
  }, [prToastAnim]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRest = (seconds: number) => {
    setRestTime(seconds);
    setRestTotal(seconds);
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
  const totalCompletedSets = workout.exercises.reduce(
    (s, ex) => s + ex.sets.filter((set) => set.completed).length, 0
  );
  const totalSets = workout.exercises.reduce((s, ex) => s + ex.sets.length, 0);

  const handleCompleteSet = (setIndex: number, reps: number, weight: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    completeSet(currentExerciseIndex, setIndex, { reps, weight });
    startRest(currentExercise.restSeconds || 90);

    // PR detection: compare new 1RM against all-time best for this exercise
    if (weight > 0 && reps > 0) {
      const newRM = weight * (1 + reps / 30);
      const exerciseId = currentExercise.exerciseId;
      let bestPrevRM = 0;
      workoutHistory.forEach((w) => {
        w.exercises
          .filter((ex) => ex.exerciseId === exerciseId)
          .forEach((ex) => {
            ex.sets
              .filter((s) => s.completed && s.weight && s.reps)
              .forEach((s) => {
                const rm = (s.weight || 0) * (1 + (s.reps || 0) / 30);
                if (rm > bestPrevRM) bestPrevRM = rm;
              });
          });
      });
      if (newRM > bestPrevRM && bestPrevRM > 0) {
        showPrToast(currentExercise.exercise.name, Math.round(newRM));
      }
    }
  };

  const handleFinish = () => {
    Alert.alert('Завершить тренировку?', 'Прогресс будет сохранён', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Завершить',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const completed = finishWorkout();
          if (completed) {
            navigation.replace('WorkoutSummary', { workout: completed });
          } else {
            navigation.goBack();
          }
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
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{workout.name}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {elapsed} мин {'\u2022'} {totalCompletedSets}/{totalSets} подходов
          </Text>
        </View>
        <TouchableOpacity onPress={handleFinish}>
          <Text style={[typography.bodySemibold, { color: colors.success }]}>Готово</Text>
        </TouchableOpacity>
      </View>

      {/* Rest timer overlay */}
      {isResting && (
        <View style={[styles.restOverlay, { backgroundColor: colors.primary }]}>
          <Text style={[typography.captionMedium, { color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }]}>ОТДЫХ</Text>
          {/* Circular progress */}
          <View style={{ width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl }}>
            {/* Background ring */}
            <View style={{
              position: 'absolute',
              width: 180,
              height: 180,
              borderRadius: 90,
              borderWidth: 8,
              borderColor: 'rgba(255,255,255,0.2)',
            }} />
            {/* Progress segments */}
            {(() => {
              const progress = restTotal > 0 ? restTime / restTotal : 0;
              const segments = 60;
              return Array.from({ length: segments }).map((_, i) => {
                const angle = (i / segments) * 360 - 90;
                const rad = (angle * Math.PI) / 180;
                const isActive = i / segments <= progress;
                const cx = 90 + Math.cos(rad) * 82;
                const cy = 90 + Math.sin(rad) * 82;
                return (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: cx - 3,
                      top: cy - 3,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: isActive ? '#FFF' : 'rgba(255,255,255,0.15)',
                    }}
                  />
                );
              });
            })()}
            <Text style={[{ fontSize: 48, fontWeight: '800', color: '#FFF' }]}>
              {formatTime(restTime)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <TouchableOpacity
              onPress={() => { setRestTime((r) => r + 30); setRestTotal((t) => t + 30); }}
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

      {/* Overall progress bar */}
      <View style={{ paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
        <View style={{ height: 3, borderRadius: 1.5, backgroundColor: colors.border }}>
          <View
            style={{
              height: 3,
              borderRadius: 1.5,
              backgroundColor: colors.primary,
              width: `${totalSets > 0 ? (totalCompletedSets / totalSets) * 100 : 0}%`,
            }}
          />
        </View>
      </View>

      {/* Exercise navigation */}
      <View style={[styles.exerciseNav, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={prevExercise}
          disabled={currentExerciseIndex === 0}
          style={{ opacity: currentExerciseIndex === 0 ? 0.3 : 1 }}
        >
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
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
          <Text style={[typography.h3, { color: colors.primary }]}>{'›'}</Text>
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
            onRpeChange={(rpe) => completeSet(currentExerciseIndex, setIndex, { rpe })}
            onRemove={currentExercise.sets.length > 1 ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); removeSet(currentExerciseIndex, setIndex); } : undefined}
            onTypeChange={(type) => updateSetData(currentExerciseIndex, setIndex, { type: type as any })}
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

        {/* Exercise notes */}
        <TextInput
          style={[
            styles.notesInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.text,
            },
          ]}
          value={currentExercise.notes || ''}
          onChangeText={(text) => setExerciseNotes(currentExerciseIndex, text)}
          placeholder="Заметки к упражнению..."
          placeholderTextColor={colors.inputPlaceholder}
          multiline
          maxLength={300}
        />

        {/* Exercise description */}
        <Card style={{ marginTop: spacing.md }}>
          <Text style={[typography.smallMedium, { color: colors.text, marginBottom: spacing.sm }]}>Техника:</Text>
          {currentExercise.exercise.instructions.map((inst, i) => (
            <Text key={i} style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              {i + 1}. {inst}
            </Text>
          ))}
        </Card>
      </ScrollView>

      {/* PR Toast */}
      {prToast && (
        <Animated.View
          style={[
            styles.prToast,
            {
              backgroundColor: colors.accent,
              transform: [{
                translateY: prToastAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-80, 0],
                }),
              }],
              opacity: prToastAnim,
            },
          ]}
        >
          <Text style={{ fontSize: 20 }}>🏆</Text>
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={[typography.captionMedium, { color: '#fff', letterSpacing: 1 }]}>ЛИЧНЫЙ РЕКОРД!</Text>
            <Text style={[typography.small, { color: 'rgba(255,255,255,0.85)' }]}>
              {prToast.name} — ~{prToast.rm} кг 1ПМ
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const SET_TYPES = ['normal', 'warmup', 'dropset'] as const;
const SET_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  normal:  { label: 'РАБ',  color: '#9E9E9E' },
  warmup:  { label: 'РАЗМ', color: '#FF9800' },
  dropset: { label: 'ДРОП', color: '#9C27B0' },
};

const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const rpeColor = (rpe: number): string => {
  if (rpe <= 7) return '#3BC46E';   // green — easy
  if (rpe <= 8) return '#F0A832';   // orange — moderate
  if (rpe <= 9) return '#F06432';   // dark orange — hard
  return '#E8364F';                 // red — max
};

// Individual set row component
const SetRow: React.FC<{
  set: any;
  setIndex: number;
  onComplete: (reps: number, weight: number) => void;
  onRpeChange: (rpe: number) => void;
  onRemove?: () => void;
  onTypeChange?: (type: string) => void;
  colors: any;
}> = ({ set, setIndex, onComplete, onRpeChange, onRemove, onTypeChange, colors }) => {
  const [weight, setWeight] = useState(set.weight?.toString() || '');
  const [reps, setReps] = useState(set.reps?.toString() || '10');
  const [showRpe, setShowRpe] = useState(false);
  const currentType = set.type || 'normal';

  return (
    <View style={{ backgroundColor: set.completed ? colors.success + '10' : 'transparent', borderRadius: borderRadius.sm, marginBottom: 2 }}>
    <View
      style={[
        styles.setRow,
        { paddingVertical: spacing.sm },
      ]}
    >
      <TouchableOpacity
        onPress={onTypeChange ? () => {
          Haptics.selectionAsync();
          const idx = SET_TYPES.indexOf(currentType as any);
          onTypeChange(SET_TYPES[(idx + 1) % SET_TYPES.length]);
        } : undefined}
        onLongPress={onRemove}
        delayLongPress={500}
        style={{ width: 40, alignItems: 'center' }}
      >
        <Text style={[{ fontSize: 8, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1 }, { color: SET_TYPE_CONFIG[currentType].color }]}>
          {SET_TYPE_CONFIG[currentType].label}
        </Text>
        <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
          {setIndex + 1}
        </Text>
      </TouchableOpacity>
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
        onPress={() => {
          onComplete(parseInt(reps) || 0, parseFloat(weight) || 0);
          setShowRpe(true);
        }}
      >
        <Text style={{ color: set.completed ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>
          ✓
        </Text>
      </TouchableOpacity>
    </View>

      {/* RPE picker — shown inline below set row after completion */}
      {set.completed && showRpe && (
        <View style={[styles.rpePicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.textTertiary, marginRight: spacing.sm }]}>RPE</Text>
          {RPE_VALUES.map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => {
                Haptics.selectionAsync();
                onRpeChange(v);
                setShowRpe(false);
              }}
              style={[
                styles.rpeBtn,
                {
                  backgroundColor: set.rpe === v ? rpeColor(v) : colors.inputBackground,
                  borderColor: set.rpe === v ? rpeColor(v) : colors.border,
                },
              ]}
            >
              <Text style={[typography.small, { color: set.rpe === v ? '#fff' : colors.textSecondary, fontWeight: '700' }]}>
                {v}
              </Text>
            </TouchableOpacity>
          ))}
          {set.rpe && (
            <Text style={[typography.caption, { color: rpeColor(set.rpe), marginLeft: spacing.xs, fontWeight: '700' }]}>
              {set.rpe >= 10 ? 'Max' : set.rpe >= 9 ? 'Hard' : set.rpe >= 8 ? 'Tough' : 'Easy'}
            </Text>
          )}
        </View>
      )}
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
  notesInput: {
    marginTop: spacing.xl,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 80,
  },
  rpePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: 2,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    flexWrap: 'wrap',
    gap: 4,
  },
  rpeBtn: {
    width: 34,
    height: 28,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prToast: {
    position: 'absolute',
    top: 110,
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
