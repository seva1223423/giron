import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Button, Input } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { TrainingGoal, FitnessLevel, Gender } from '../../types';

const { width } = Dimensions.get('window');

type Step = 'welcome' | 'gender' | 'body' | 'goal' | 'level' | 'restrictions';

const GOALS: { key: TrainingGoal; label: string; emoji: string }[] = [
  { key: 'weight_loss', label: 'Похудение', emoji: '🔥' },
  { key: 'muscle_gain', label: 'Набор массы', emoji: '💪' },
  { key: 'strength', label: 'Сила', emoji: '🏋️' },
  { key: 'endurance', label: 'Выносливость', emoji: '🏃' },
  { key: 'flexibility', label: 'Гибкость', emoji: '🧘' },
  { key: 'general_fitness', label: 'Общая форма', emoji: '⚡' },
];

const LEVELS: { key: FitnessLevel; label: string; description: string }[] = [
  { key: 'beginner', label: 'Новичок', description: 'Менее 6 месяцев опыта' },
  { key: 'intermediate', label: 'Средний', description: '6 месяцев — 2 года' },
  { key: 'advanced', label: 'Продвинутый', description: '2 — 5 лет' },
  { key: 'expert', label: 'Эксперт', description: 'Более 5 лет' },
];

export const OnboardingScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { updateProfile, completeOnboarding } = useAuthStore();
  const [step, setStep] = useState(0);

  const [gender, setGender] = useState<Gender | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [level, setLevel] = useState<FitnessLevel | null>(null);

  const totalSteps = 4;

  const handleFinish = () => {
    updateProfile({
      gender: gender || undefined,
      heightCm: height ? parseInt(height) : undefined,
      weightKg: weight ? parseFloat(weight) : undefined,
      goal: goal || undefined,
      fitnessLevel: level || undefined,
    });
    completeOnboarding();
  };

  const canNext = () => {
    switch (step) {
      case 0: return gender !== null;
      case 1: return height.length > 0 && weight.length > 0;
      case 2: return goal !== null;
      case 3: return level !== null;
      default: return false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <Text style={[typography.h1, { color: colors.text, marginBottom: spacing.sm }]}>
              Привет! 👋
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxxl }]}>
              Давай настроим Iron Gym под тебя. Укажи свой пол.
            </Text>
            <View style={styles.optionRow}>
              {(['male', 'female'] as Gender[]).map((g) => (
                <TouchableOpacity
                  key={g}
                  activeOpacity={0.7}
                  onPress={() => setGender(g)}
                  style={[
                    styles.genderCard,
                    {
                      backgroundColor: gender === g ? colors.primary : colors.surface,
                      borderColor: gender === g ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 48 }}>{g === 'male' ? '🙋‍♂️' : '🙋‍♀️'}</Text>
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: gender === g ? '#FFF' : colors.text, marginTop: spacing.md },
                    ]}
                  >
                    {g === 'male' ? 'Мужской' : 'Женский'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>
              Параметры тела
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxxl }]}>
              Это поможет подобрать программу и рассчитать КБЖУ.
            </Text>
            <Input
              label="Рост (см)"
              placeholder="175"
              keyboardType="numeric"
              value={height}
              onChangeText={setHeight}
              containerStyle={{ marginBottom: spacing.xl }}
            />
            <Input
              label="Вес (кг)"
              placeholder="75"
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              containerStyle={{ marginBottom: spacing.xl }}
            />
            <Input
              label="Возраст"
              placeholder="25"
              keyboardType="numeric"
              value={age}
              onChangeText={setAge}
            />
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>
              Какая у тебя цель?
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxl }]}>
              Мы подберём программу и питание под твою цель.
            </Text>
            {GOALS.map((g) => (
              <TouchableOpacity
                key={g.key}
                activeOpacity={0.7}
                onPress={() => setGoal(g.key)}
                style={[
                  styles.listOption,
                  {
                    backgroundColor: goal === g.key ? colors.primary : colors.surface,
                    borderColor: goal === g.key ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 24, marginRight: spacing.md }}>{g.emoji}</Text>
                <Text
                  style={[
                    typography.bodySemibold,
                    { color: goal === g.key ? '#FFF' : colors.text },
                  ]}
                >
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>
              Уровень подготовки
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxl }]}>
              Это определит сложность стартовой программы.
            </Text>
            {LEVELS.map((l) => (
              <TouchableOpacity
                key={l.key}
                activeOpacity={0.7}
                onPress={() => setLevel(l.key)}
                style={[
                  styles.listOption,
                  {
                    backgroundColor: level === l.key ? colors.primary : colors.surface,
                    borderColor: level === l.key ? colors.primary : colors.border,
                  },
                ]}
              >
                <View>
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: level === l.key ? '#FFF' : colors.text },
                    ]}
                  >
                    {l.label}
                  </Text>
                  <Text
                    style={[
                      typography.small,
                      { color: level === l.key ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
                    ]}
                  >
                    {l.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress dots */}
      <View style={styles.progressContainer}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i <= step ? colors.primary : colors.progressBarBackground,
                width: i === step ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}
      >
        {renderStep()}
      </ScrollView>

      {/* Bottom buttons */}
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
          title={step === totalSteps - 1 ? 'Начать' : 'Далее'}
          variant="primary"
          onPress={() => {
            if (step === totalSteps - 1) {
              handleFinish();
            } else {
              setStep((s) => s + 1);
            }
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
  container: { flex: 1, paddingTop: 60 },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  stepContainer: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: spacing.md,
  },
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
