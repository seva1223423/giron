import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useThemeStore, useAuthStore, useNutritionStore, useWorkoutStore } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { TrainingGoal, FitnessLevel, Gender } from '../../types';
import { GenderStep, BodyStep, GoalStep, LevelStep, DaysStep } from './steps';
import { localDateStr } from '../../utils/date';

const TOTAL_STEPS = 5;

export const OnboardingScreen: React.FC<{ navigation: any }> = () => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { updateProfile, completeOnboarding } = useAuthStore();
  const { setTargets } = useNutritionStore();
  const { setWeekPlanDay, weekPlan } = useWorkoutStore();
  const [step, setStep] = useState(0);

  const [gender, setGender] = useState<Gender | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [level, setLevel] = useState<FitnessLevel | null>(null);
  const [trainingDays, setTrainingDays] = useState<number[]>([0, 2, 4]); // Mon, Wed, Fri default

  const toggleDay = useCallback((dayIndex: number) => {
    setTrainingDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  }, []);

  const handleFinish = () => {
    // Apply training days to week plan
    trainingDays.forEach((dayIndex) => {
      const existing = weekPlan[dayIndex];
      if (!existing || !existing.exercises?.length) {
        setWeekPlanDay(dayIndex, { name: 'Тренировка', emoji: '◎', exercises: [] });
      }
    });
    const heightVal = Math.max(100, Math.min(300, parseInt(height, 10) || 175));
    const weightVal = Math.max(20, Math.min(500, parseFloat(weight.replace(',', '.')) || 75));
    const ageVal = Math.max(10, Math.min(120, parseInt(age, 10) || 25));
    // Use July 1 as estimated birth date (midpoint of year) to minimise ±1 year error
    const dateOfBirth = ageVal > 0 ? new Date(new Date().getFullYear() - ageVal, 6, 1).toISOString() : undefined;

    updateProfile({ gender: gender || undefined, heightCm: heightVal, weightKg: weightVal, goal: goal || undefined, fitnessLevel: level || undefined, dateOfBirth });

    const bmr = gender === 'female'
      ? 10 * weightVal + 6.25 * heightVal - 5 * ageVal - 161
      : 10 * weightVal + 6.25 * heightVal - 5 * ageVal + 5;
    const tdee = Math.round(bmr * 1.55);
    const targetCalories = goal === 'weight_loss' ? Math.round(tdee - 400) : goal === 'muscle_gain' ? Math.round(tdee + 250) : tdee;
    const proteinPerKg = goal === 'muscle_gain' ? 2.2 : goal === 'weight_loss' ? 2.0 : 1.8;
    const targetProtein = Math.round(weightVal * proteinPerKg);
    const targetFats = Math.round((targetCalories * 0.25) / 9);
    const targetCarbs = Math.round((targetCalories - targetProtein * 4 - targetFats * 9) / 4);
    const waterTargetMl = Math.round(weightVal * 35);
    const today = localDateStr(new Date());
    setTargets(today, { calories: targetCalories, protein: targetProtein, fats: targetFats, carbs: Math.max(targetCarbs, 50), waterTargetMl });

    completeOnboarding();
  };

  const canNext = () => {
    switch (step) {
      case 0: return gender !== null;
      case 1: return (
        height.length > 0 && Number.isFinite(parseFloat(height.replace(',', '.'))) &&
        weight.length > 0 && Number.isFinite(parseFloat(weight.replace(',', '.'))) &&
        age.length > 0 && Number.isFinite(parseInt(age, 10))
      );
      case 2: return goal !== null;
      case 3: return level !== null;
      case 4: return trainingDays.length > 0;
      default: return false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return <GenderStep gender={gender} onSelect={setGender} />;
      case 1: return <BodyStep height={height} weight={weight} age={age} onHeightChange={setHeight} onWeightChange={setWeight} onAgeChange={setAge} />;
      case 2: return <GoalStep goal={goal} onSelect={setGoal} />;
      case 3: return <LevelStep level={level} onSelect={setLevel} />;
      case 4: return <DaysStep selectedDays={trainingDays} onToggle={toggleDay} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
      <View style={styles.progressContainer}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.progressBarBackground, width: i === step ? 24 : 8 }]} />
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}>
        {renderStep()}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.background }]}>
        {step > 0 && (
          <Button title="Назад" variant="ghost" onPress={() => setStep((s) => s - 1)} style={{ marginRight: spacing.md }} />
        )}
        <Button
          title={step === TOTAL_STEPS - 1 ? 'Начать' : 'Далее'}
          variant="primary"
          onPress={() => { if (step === TOTAL_STEPS - 1) handleFinish(); else setStep((s) => s + 1); }}
          disabled={!canNext()}
          fullWidth={step === 0}
          style={{ flex: step > 0 ? 1 : undefined }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl, marginBottom: spacing.xxl, gap: spacing.sm, flexWrap: 'wrap' },
  dot: { height: 8, borderRadius: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: spacing.xxl, paddingBottom: 40, paddingTop: spacing.lg },
});
