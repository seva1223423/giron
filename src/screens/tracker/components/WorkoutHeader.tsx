import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors, useWorkoutStore, useAuthStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout, MuscleGroup, ExerciseType } from '../../../types';

// Muscle group → short label + tonal hue. Was a neon rainbow (#EF4444 red,
// #3B82F6 blue, #F59E0B amber, etc.) — all banned by Direction A.
// Refactored to a warm tonal palette of Direction A semantics: terracotta /
// gold / amber / sage / bronze variants. Adjacent muscles still differ
// enough to read at a glance, but the dots stop screaming.
const MUSCLE_META: Partial<Record<MuscleGroup, { abbr: string; color: string }>> = {
  chest:       { abbr: 'Гр', color: '#E07A6B' }, // terracotta (error tone)
  back:        { abbr: 'Сп', color: '#8BA8BF' }, // info slate
  shoulders:   { abbr: 'Пл', color: '#D4B07A' }, // primary gold
  biceps:      { abbr: 'Бц', color: '#E8A36A' }, // warning amber
  triceps:     { abbr: 'Тц', color: '#C9824E' }, // deeper amber
  forearms:    { abbr: 'Пр', color: '#9AC28C' }, // success sage
  abs:         { abbr: 'Пр', color: '#6FA66A' }, // deeper sage
  quadriceps:  { abbr: 'Кв', color: '#B35647' }, // deep terracotta
  hamstrings:  { abbr: 'Бд', color: '#B08A4E' }, // antique bronze
  glutes:      { abbr: 'Яг', color: '#C76558' }, // light-mode terracotta
  calves:      { abbr: 'Ик', color: '#6B91B0' }, // deeper slate
  lower_back:  { abbr: 'Пс', color: '#8E6B3E' }, // dark bronze
  traps:       { abbr: 'Тр', color: '#B08A4E' },
  lats:        { abbr: 'Ши', color: '#A8A49C' }, // warm grey
};

// MET values per exercise type for calorie estimation
const MET_BY_TYPE: Record<ExerciseType, number> = {
  barbell: 6, dumbbell: 5, machine: 4, cable: 4,
  bodyweight: 5, kettlebell: 6, band: 3,
  cardio: 7, stretch: 2,
};

interface Props {
  workout: Workout;
  elapsed: number;
  totalCompletedSets: number;
  totalSets: number;
  onCancel: () => void;
  onFinish: () => void;
}

const MiniProgressRing: React.FC<{ progress: number; color: string; bgColor: string }> = ({ progress, color, bgColor }) => {
  const size = 24;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - Math.min(Math.max(progress, 0), 1) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={bgColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 8, fontWeight: '800', color }}>
        {Math.round(progress * 100)}
      </Text>
    </View>
  );
};

export const WorkoutHeader: React.FC<Props> = ({ workout, elapsed, totalCompletedSets, totalSets, onCancel, onFinish }) => {
  const colors = useThemeColors();
  const { workoutDurationGoal } = useSettingsStore();
  const { user } = useAuthStore();
  const safeTop = useSafeTop();

  const completionProgress = totalSets > 0 ? totalCompletedSets / totalSets : 0;

  // Compute total volume from completed sets in real-time
  const totalVolume = useMemo(() => {
    return workout.exercises.reduce((vol, ex) => {
      return vol + ex.sets
        .filter((s) => s.completed && s.weight && s.reps)
        .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
    }, 0);
  }, [workout.exercises]);

  // Unique primary muscles from all exercises (up to 6)
  const muscleDots = useMemo(() => {
    const seen = new Set<MuscleGroup>();
    const result: Array<{ muscle: MuscleGroup; abbr: string; color: string }> = [];
    for (const ex of workout.exercises) {
      for (const m of (ex.exercise?.primaryMuscles ?? [])) {
        if (!seen.has(m) && MUSCLE_META[m]) {
          seen.add(m);
          result.push({ muscle: m, ...MUSCLE_META[m]! });
          if (result.length >= 6) break;
        }
      }
      if (result.length >= 6) break;
    }
    return result;
  }, [workout.exercises]);

  // Estimated calories burned: MET-based
  const estimatedCalories = useMemo(() => {
    const bodyWeightKg = user?.weightKg || 80;
    // Average MET across exercises (weighted by set count)
    let totalMet = 0; let setCount = 0;
    for (const ex of workout.exercises) {
      const met = MET_BY_TYPE[ex.exercise?.type] ?? 5;
      const count = ex.sets.length;
      totalMet += met * count;
      setCount += count;
    }
    const avgMet = setCount > 0 ? totalMet / setCount : 5;
    const hours = elapsed / 60;
    return Math.round(avgMet * bodyWeightKg * hours);
  }, [workout.exercises, elapsed, user?.weightKg]);

  const goalText = workoutDurationGoal > 0 ? (() => {
    const remaining = workoutDurationGoal - elapsed;
    if (remaining > 0) {
      return { text: `осталось ${remaining} мин`, color: colors.success };
    }
    return { text: `\u2212${Math.abs(remaining)} мин (перебор)`, color: colors.warning };
  })() : null;

  const formatVolume = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
    return `${Math.round(kg)}`;
  };

  return (
    <View style={{
      paddingTop: safeTop, paddingBottom: spacing.sm, paddingHorizontal: spacing.xl,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      {/* Top row: cancel / name / finish */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
            {workout.name}
          </Text>
          <Text style={[typography.h4, { color: colors.primary, marginTop: 1 }]}>
            {elapsed} мин
          </Text>
        </View>

        <TouchableOpacity onPress={onFinish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[typography.bodySemibold, {
            color: colors.success,
            fontSize: totalCompletedSets === totalSets && totalSets > 0 ? 18 : 16,
            fontWeight: totalCompletedSets === totalSets && totalSets > 0 ? '800' : '600',
          }]}>
            {totalCompletedSets === totalSets && totalSets > 0 ? 'Завершить' : 'Готово'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom row: progress ring + stats + muscle dots + calories */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs, gap: spacing.md, flexWrap: 'wrap' }}>
        <MiniProgressRing progress={completionProgress} color={colors.primary} bgColor={colors.border} />
        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={2}>
          {totalCompletedSets}/{totalSets} подх. • {formatVolume(totalVolume)} кг
        </Text>

        {estimatedCalories > 0 && (
          <Text style={[typography.caption, { color: colors.warning }]}>
            ~{estimatedCalories} ккал
          </Text>
        )}

        {/* Muscle group dots */}
        {muscleDots.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {muscleDots.map(({ muscle, abbr, color }) => (
              <View key={muscle} style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: color + '22', borderWidth: 1.5, borderColor: color + '80',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 7, fontWeight: '800', color }}>{abbr}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {goalText && (
        <Text style={[typography.caption, { color: goalText.color, textAlign: 'center', marginTop: 2 }]}>
          {goalText.text}
        </Text>
      )}
    </View>
  );
};
