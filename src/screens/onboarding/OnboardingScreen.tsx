import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useThemeColors, useAuthStore, useNutritionStore, useWorkoutStore } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button, Icon } from '../../components';
import { typography } from '../../theme';
import { spacing, contentMaxWidth } from '../../theme/spacing';
import { TrainingGoal, FitnessLevel, Gender } from '../../types';
import { GenderStep, BodyStep, GoalStep, LevelStep, DaysStep } from './steps';
import { localDateStr } from '../../utils/date';
import { calcMacros, DEFAULT_ACTIVITY, TRAINING_GOAL_TO_MACRO_GOAL } from '../../utils/macros';
import { userService } from '../../services';

const TOTAL_STEPS = 5;

/**
 * Onboarding flow — 5 data-collection steps, wrapped in the Direction A
 * premium shell from the design handoff (A_Onboarding).
 *
 * Visual layer per design:
 *   - Radial gold glow from top-center (ellipse 50%/0%)
 *   - "GIRON" brand mark in gold at the top-left + "Пропустить" on the right
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
  const colors = useThemeColors();
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

  /**
   * Best-effort onboarding step telemetry. Fired when the user submits
   * (advances past) a step. Server stores first-touch only so a flaky
   * network retry doesn't reshape the funnel data. Errors are swallowed —
   * onboarding UX must not be blocked on a server roundtrip.
   */
  const recordStep = useCallback((s: 0 | 1 | 2 | 3 | 4) => {
    userService.recordOnboardingStep(s).catch(() => {
      /* telemetry is best-effort — drop on the floor */
    });
  }, []);

  const handleFinish = () => {
    // Express-path fallback: if the user reached "Skip" on the Days step
    // without selecting anything, seed with the standard 3-day split so
    // the week plan isn't empty and notification scheduling still has
    // something to anchor to. Mon/Wed/Fri matches the screen default.
    const effectiveDays = trainingDays.length > 0 ? trainingDays : [0, 2, 4];
    effectiveDays.forEach((dayIndex) => {
      const existing = weekPlan[dayIndex];
      if (!existing || !existing.exercises?.length) {
        setWeekPlanDay(dayIndex, { name: 'Тренировка', emoji: '◎', exercises: [] });
      }
    });
    // Skipping leaves these blank and we fall back to 175/75/25. That is fine
    // as a starting point, but the calorie/protein targets derived from them
    // used to be presented as if they were the user's real numbers (audit
    // R12) — so we tell them plainly and point at the profile.
    const usedFallbackBody = !height.trim() || !weight.trim() || !age.trim();
    const heightVal = Math.max(100, Math.min(300, parseInt(height.replace(',', '.'), 10) || 175));
    const weightVal = Math.max(20, Math.min(500, parseFloat(weight.replace(',', '.')) || 75));
    // Age floor 14 — users under 14 need a legal guardian's consent under 152-ФЗ ст. 9,
    // and we don't currently collect parental consent through a dedicated flow.
    const ageVal = Math.max(14, Math.min(120, parseInt(age.replace(',', '.'), 10) || 25));
    // Use July 1 as estimated birth date (midpoint of year) to minimise ±1 year error
    const dateOfBirth = ageVal > 0 ? new Date(new Date().getFullYear() - ageVal, 6, 1).toISOString() : undefined;

    updateProfile({ gender: gender || undefined, heightCm: heightVal, weightKg: weightVal, goal: goal || undefined, fitnessLevel: level || undefined, dateOfBirth });

    // Onboarding used to carry its own third copy of Mifflin-St Jeor with a
    // different surplus (+250 vs +400) and different protein multipliers, so
    // the targets set here disagreed with both the macro calculator and the
    // nutrition goals modal for the same profile (audit R37).
    const macro = calcMacros(
      weightVal,
      heightVal,
      ageVal,
      gender === 'female',
      DEFAULT_ACTIVITY,
      TRAINING_GOAL_TO_MACRO_GOAL[goal ?? 'general_fitness'],
    );
    const waterTargetMl = Math.round(weightVal * 35);
    const today = localDateStr(new Date());
    setTargets(today, {
      calories: macro.targetCal,
      protein: macro.protein,
      fats: macro.fats,
      carbs: macro.carbs,
      waterTargetMl,
    });

    completeOnboarding();

    if (usedFallbackBody) {
      Alert.alert(
        'Цели пока примерные',
        'Мы посчитали калории и БЖУ по средним данным. Укажи рост, вес и возраст в профиле — пересчитаем под тебя.',
      );
    }
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

      {/* Brand header row — gold GIRON mark + skip link. The skip
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
            GIRON
          </Text>
        </View>
        {step > 0 && (
          // "Skip" available from step 1 onwards (gender stays required —
          // it's a 2-tap binary that materially changes BMR/TDEE math, and
          // we don't have a credible default for it). All later steps have
          // numeric or list fallbacks downstream in handleFinish, so users
          // can bail out and still get a usable profile.
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
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 140, width: '100%', maxWidth: contentMaxWidth.tablet, alignSelf: 'center' }}
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
          onPress={() => {
            // Record the current step BEFORE advancing — clicking Next is
            // the user's commitment to this step's data. On the final step
            // this also marks onboardingCompletedAt server-side via the
            // step=4 path inside handleFinish.
            recordStep(step as 0 | 1 | 2 | 3 | 4);
            if (step === TOTAL_STEPS - 1) handleFinish();
            else setStep((s) => s + 1);
          }}
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
