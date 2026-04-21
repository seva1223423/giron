import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { MacroResultCard } from './macro';
import { localDateStr } from '../../utils/date';
import { isFemale, normalizeGender } from '../../utils/gender';

const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Малоподвижный', desc: 'Офис, нет спорта', multiplier: 1.2 },
  { key: 'light', label: 'Лёгкая активность', desc: '1–2 тренировки/нед', multiplier: 1.375 },
  { key: 'moderate', label: 'Умеренная активность', desc: '3–5 тренировок/нед', multiplier: 1.55 },
  { key: 'high', label: 'Высокая активность', desc: '6–7 тренировок/нед', multiplier: 1.725 },
  { key: 'extreme', label: 'Экстремальная', desc: '2 раза в день / физ. труд', multiplier: 1.9 },
];

const GOALS = [
  { key: 'weight_loss_fast', label: 'Быстрое похудение', desc: '-0.7–1 кг/нед', calDelta: -700 },
  { key: 'weight_loss', label: 'Похудение', desc: '-0.3–0.5 кг/нед', calDelta: -400 },
  { key: 'recomp', label: 'Рекомпозиция', desc: 'Поддержание + сила', calDelta: 0 },
  { key: 'muscle_gain', label: 'Набор массы', desc: '+0.3–0.5 кг/нед', calDelta: 400 },
  { key: 'mass', label: 'Быстрый набор', desc: '+0.7–1 кг/нед', calDelta: 700 },
];

const InputField: React.FC<{ label: string; unit: string; value: string; onChange: (v: string) => void; colors: any }> = ({ label, unit, value, onChange, colors }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
    <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" selectTextOnFocus style={[typography.bodyMedium, { color: colors.text, textAlign: 'center', flex: 1 }]} />
    </View>
    <Text style={[typography.small, { color: colors.textSecondary, marginTop: 4 }]}>{unit}</Text>
  </View>
);

export const MacroCalculatorScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { setTargets } = useNutritionStore();
  const { user } = useAuthStore();

  const [gender, setGender] = useState<'male' | 'female'>(normalizeGender(user?.gender) ?? 'male');
  const userAge = user?.dateOfBirth ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
  const [age, setAge] = useState(userAge ? String(userAge) : '28');
  const [weight, setWeight] = useState(user?.weightKg ? String(user.weightKg) : '80');
  const [height, setHeight] = useState(user?.heightCm ? String(user.heightCm) : '175');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [goal, setGoal] = useState('muscle_gain');

  const result = useMemo(() => {
    const w = parseFloat(weight.replace(',', '.')) || 80;
    const h = parseFloat(height.replace(',', '.')) || 175;
    const a = parseFloat(age.replace(',', '.')) || 28;
    const bmr = gender === 'female' ? 10 * w + 6.25 * h - 5 * a - 161 : 10 * w + 6.25 * h - 5 * a + 5;
    const actInfo = ACTIVITY_LEVELS.find((x) => x.key === activityLevel) ?? ACTIVITY_LEVELS[2];
    const tdee = Math.round(bmr * actInfo.multiplier);
    const goalInfo = GOALS.find((x) => x.key === goal) ?? GOALS[2];
    const targetCal = Math.max(1200, tdee + goalInfo.calDelta);
    const proteinPerKg = goal === 'mass' || goal === 'muscle_gain' ? 2.2 : goal === 'recomp' ? 2.0 : 1.8;
    const protein = Math.round(w * proteinPerKg);
    const fats = Math.round((targetCal * 0.25) / 9);
    const carbs = Math.max(50, Math.round((targetCal - protein * 4 - fats * 9) / 4));
    return { bmr: Math.round(bmr), tdee, targetCal, protein, fats, carbs, proteinPerKg };
  }, [gender, age, weight, height, activityLevel, goal]);

  const handleApply = () => {
    haptic.success();
    const today = localDateStr(new Date());
    setTargets(today, { calories: result.targetCal, protein: result.protein, fats: result.fats, carbs: result.carbs });
    Alert.alert(
      'КБЖУ применены',
      `Цель: ${result.targetCal} ккал · Б: ${result.protein} г · Ж: ${result.fats} г · У: ${result.carbs} г`,
      [{ text: 'Отлично', onPress: () => navigation.goBack() }],
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <FadeIn delay={0} from="top">
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary }}>CALC</Text>
          <Text style={[typography.h2, { color: colors.text, marginTop: spacing.md }]}>Калькулятор КБЖУ</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }]}>
            Рассчитай точные нормы питания по формуле Миффлина-Сан Жеора
          </Text>
        </View>
      </FadeIn>

      <FadeIn delay={50}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ПОЛ</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {(['male', 'female'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => { haptic.selection(); setGender(g); }}
                style={[styles.segmentBtn, { borderColor: gender === g ? colors.primary : colors.border, backgroundColor: gender === g ? colors.primary + '15' : 'transparent', flex: 1 }]}
              >
                <Text style={{ fontSize: 18, fontWeight: '700', color: gender === g ? colors.primary : colors.textSecondary }}>{g === 'male' ? 'М' : 'Ж'}</Text>
                <Text style={[typography.bodyMedium, { color: gender === g ? colors.primary : colors.text, marginTop: 4 }]}>
                  {g === 'male' ? 'Мужской' : 'Женский'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={100}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ПАРАМЕТРЫ ТЕЛА</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <InputField label="Возраст" unit="лет" value={age} onChange={setAge} colors={colors} />
            <InputField label="Вес" unit="кг" value={weight} onChange={setWeight} colors={colors} />
            <InputField label="Рост" unit="см" value={height} onChange={setHeight} colors={colors} />
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={150}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>УРОВЕНЬ АКТИВНОСТИ</Text>
          {ACTIVITY_LEVELS.map((level) => (
            <TouchableOpacity
              key={level.key}
              onPress={() => { haptic.selection(); setActivityLevel(level.key); }}
              style={[styles.optionRow, { borderColor: activityLevel === level.key ? colors.primary : colors.border, backgroundColor: activityLevel === level.key ? colors.primary + '12' : 'transparent' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyMedium, { color: activityLevel === level.key ? colors.primary : colors.text }]}>{level.label}</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>{level.desc}</Text>
              </View>
              <View style={[styles.radio, { borderColor: activityLevel === level.key ? colors.primary : colors.border }]}>
                {activityLevel === level.key && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      </FadeIn>

      <FadeIn delay={200}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ЦЕЛЬ</Text>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g.key}
              onPress={() => { haptic.selection(); setGoal(g.key); }}
              style={[styles.optionRow, { borderColor: goal === g.key ? colors.primary : colors.border, backgroundColor: goal === g.key ? colors.primary + '12' : 'transparent' }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyMedium, { color: goal === g.key ? colors.primary : colors.text }]}>{g.label}</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>{g.desc}</Text>
              </View>
              <View style={[styles.radio, { borderColor: goal === g.key ? colors.primary : colors.border }]}>
                {goal === g.key && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      </FadeIn>

      <MacroResultCard result={result} delay={250} />

      <FadeIn delay={300}>
        <Button title="Применить эти нормы КБЖУ" onPress={handleApply} fullWidth size="lg" style={{ marginBottom: spacing.md }} />
        <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.huge }]}>
          Нормы будут установлены в дневнике питания на сегодня
        </Text>
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.huge },
  segmentBtn: { flex: 1, borderWidth: 1.5, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  optionRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  inputWrap: { borderWidth: 1, borderRadius: borderRadius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, width: '100%', alignItems: 'center' },
});
