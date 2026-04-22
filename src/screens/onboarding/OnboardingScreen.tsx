import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useThemeStore, useAuthStore, useNutritionStore, useWorkoutStore } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button, Icon } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { TrainingGoal, FitnessLevel, Gender } from '../../types';
import { GenderStep, BodyStep, GoalStep, LevelStep, DaysStep } from './steps';
import { localDateStr } from '../../utils/date';

const TOTAL_STEPS = 5;

/**
 * Onboarding flow — 5 data-collection steps, wrapped in the Direction A
 * premium shell from the design handoff (A_Onboarding).
 *
 * Visual layer per design:
 *   - Radial gold glow from top-center (ellipse 50%/0%)
 *   - "IRON GYM" brand mark in gold at the top-left + "Пропустить" on the right
 *   - Active progress-dot is a 28pt wide gold pill, inactive dots are 12pt
 *     neutral pills (matches the indent design spec exactly)
 *   - Bottom CTA uses the tall gold pill (Button lg variant already does this)
 *
 * The 5 data-collection step components (gender/body/goal/level/days)
 * are unchanged — they handle the actual profile data and feed the
 * BMR/TDEE calc at finish.
 */
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
    const heightVal = Math.max(100, Math.min(300, parseInt(height.replace(',', '.'), 10) || 175));
    const weightVal = Math.max(20, Math.min(500, parseFloat(weight.replace(',', '.')) || 75));
    // Age floor 14 — users under 14 need a legal guardian's consent under 152-ФЗ ст. 9,
    // and we don't currently collect parental consent through a dedicated flow.
    const ageVal = Math.max(14, Math.min(120, parseInt(age.replace(',', '.'), 10) || 25));
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
        age.length > 0 && Number.isFinite(parseInt(age.replace(',', '.'), 10))
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Radial gold glow from top-center — design spec. The SVG is
          pointer-events: none so it never intercepts taps. */}
      <Svg
        width="100%"
        height={400}
        style={styles.backdrop}
        pointerEvents="none"
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient id="onbGlow" cx="50%" cy="0%" rx="80%" ry="75%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#onbGlow)" />
      </Svg>

      {/* Brand header row — gold IRON GYM mark + skip link. The skip
          button completes onboarding immediately, filling in sensible
          defaults downstream (handleFinish uses fallback numbers when
          inputs are blank). */}
      <View style={[styles.brandRow, { paddingTop: safeTop + spacing.sm }]}>
        <View style={styles.brand}>
          <Icon name="logo" size={22} color={colors.primary} />
          <Text
            style={{
              color: colors.primary,
              fontSize: 13,
              fontWeight: '600',
              letterSpacing: 3,
            }}
          >
            IRON GYM
          </Text>
        </View>
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <TouchableOpacity
            onPress={handleFinish}
            accessibilityLabel="Пропустить онбординг"
            accessibilityRole="button"
          >
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>
              Пропустить
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress dots — active is 28pt wide gold pill, inactive are
          12pt neutral. Matches the design's "|  ▪  ▪  ▪" indentation. */}
      <View style={styles.progressContainer}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === step
                  ? colors.primary
                  : i < step
                  ? colors.primary + '80'
                  : colors.border,
                width: i === step ? 28 : 12,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
      >
        {renderStep()}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.background }]}>
        {step > 0 && (
          <Button
            title="Назад"
            variant="ghost"
            onPress={() => setStep((s) => s - 1)}
            style={{ marginRight: spacing.md }}
          />
        )}
        <Button
          title={step === TOTAL_STEPS - 1 ? 'Начать путь' : 'Далее'}
          variant="primary"
          size="lg"
          iconRight={<Icon name="arrow" size={18} color={colors.textInverse} strokeWidth={2.2} />}
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
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0 },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: spacing.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandGlyph: { fontSize: 22, fontWeight: '700' },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
    gap: 6,
  },
  dot: { height: 4, borderRadius: 999 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 40,
    paddingTop: spacing.lg,
  },
});
