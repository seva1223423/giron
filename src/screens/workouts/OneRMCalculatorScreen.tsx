import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useAuthStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

// Strength standards for main lifts (kg), indexed by exercise key
// Values: [Beginner, Novice, Intermediate, Advanced, Elite] for 80kg male
const STRENGTH_STANDARDS: Record<string, { male: number[]; female: number[]; label: string }> = {
  squat: {
    label: 'Присед со штангой',
    male: [50, 75, 100, 142, 197],
    female: [30, 47, 65, 90, 120],
  },
  bench: {
    label: 'Жим лёжа',
    male: [37, 57, 80, 112, 150],
    female: [20, 32, 45, 63, 84],
  },
  deadlift: {
    label: 'Становая тяга',
    male: [65, 97, 130, 180, 240],
    female: [42, 62, 85, 115, 153],
  },
  ohp: {
    label: 'Жим стоя',
    male: [25, 37, 52, 72, 97],
    female: [13, 20, 29, 40, 55],
  },
  row: {
    label: 'Тяга штанги в наклоне',
    male: [40, 60, 82, 112, 150],
    female: [22, 33, 46, 63, 84],
  },
};

const STANDARD_LABELS = ['Новичок', 'Начинающий', 'Средний', 'Продвинутый', 'Элита'];
const STANDARD_COLORS = ['#9E9E9E', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

function epley(w: number, r: number): number {
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30));
}
function brzycki(w: number, r: number): number {
  if (r === 1) return w;
  return Math.round(w * (36 / (37 - r)));
}
function lander(w: number, r: number): number {
  if (r === 1) return w;
  return Math.round((100 * w) / (101.3 - 2.67123 * r));
}
function oconner(w: number, r: number): number {
  if (r === 1) return w;
  return Math.round(w * (1 + r / 40));
}

const PERCENTAGES = [100, 97, 95, 92, 90, 87, 85, 80, 75, 70, 65, 60, 55, 50];

export const OneRMCalculatorScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const [weightStr, setWeightStr] = useState('');
  const [repsStr, setRepsStr] = useState('');
  const [selectedStandard, setSelectedStandard] = useState<string | null>(null);

  const weight = parseFloat(weightStr) || 0;
  const reps = parseInt(repsStr, 10) || 0;
  const validInput = weight > 0 && reps >= 1 && reps <= 30;

  const results = useMemo(() => {
    if (!validInput) return null;
    const estimates = [
      { name: 'Эпли', value: epley(weight, reps) },
      { name: 'Брзыцки', value: brzycki(weight, reps) },
      { name: 'Ландер', value: lander(weight, reps) },
      { name: "О'Коннер", value: oconner(weight, reps) },
    ];
    const avg = Math.round(estimates.reduce((s, e) => s + e.value, 0) / estimates.length);
    return { estimates, avg };
  }, [weight, reps, validInput]);

  const percentTable = useMemo(() => {
    if (!results) return [];
    return PERCENTAGES.map((pct) => ({
      pct,
      weight: Math.round((results.avg * pct) / 100 * 2) / 2, // round to 0.5 kg
    }));
  }, [results]);

  const userWeight = user?.weightKg || 80;
  const userGender = user?.gender === 'female' ? 'female' : 'male';

  const standardsForSelected = useMemo(() => {
    if (!selectedStandard || !results) return null;
    const std = STRENGTH_STANDARDS[selectedStandard];
    if (!std) return null;
    // Scale standards to user's bodyweight (linear scaling)
    const refWeight = userGender === 'female' ? 60 : 80;
    const scaleFactor = userWeight / refWeight;
    return std[userGender].map((v, i) => ({
      label: STANDARD_LABELS[i],
      color: STANDARD_COLORS[i],
      value: Math.round(v * scaleFactor),
      met: results.avg >= Math.round(v * scaleFactor),
    }));
  }, [selectedStandard, results, userWeight, userGender]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Калькулятор 1ПМ</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>
            Оценка одноповторного максимума
          </Text>
        </View>
      </View>

      {/* Inputs */}
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
            Введи рабочий подход
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                ВЕС (кг)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={weightStr}
                onChangeText={setWeightStr}
                placeholder="100"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                ПОВТОРЕНИЯ
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={repsStr}
                onChangeText={setRepsStr}
                placeholder="5"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {reps > 30 && (
            <Text style={[typography.caption, { color: colors.error, marginTop: spacing.sm }]}>
              Для точного расчёта используй ≤30 повторений
            </Text>
          )}
        </Card>
      </FadeIn>

      {/* Results */}
      {results && (
        <>
          <FadeIn delay={80}>
            <Card style={{ marginBottom: spacing.lg }}>
              {/* Main result */}
              <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                  СРЕДНИЙ РАСЧЁТНЫЙ 1ПМ
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                  <Text style={[typography.number, { color: colors.primary, fontSize: 56 }]}>
                    {results.avg}
                  </Text>
                  <Text style={[typography.h3, { color: colors.primary }]}>кг</Text>
                </View>
                <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                  Усреднено по 4 формулам
                </Text>
              </View>

              {/* Formula breakdown */}
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
                ПО ФОРМУЛАМ
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {results.estimates.map((e) => (
                  <View key={e.name} style={[styles.formulaChip, { backgroundColor: colors.surface }]}>
                    <Text style={[typography.captionMedium, { color: colors.textTertiary }]}>{e.name}</Text>
                    <Text style={[typography.bodyMedium, { color: colors.text }]}>{e.value} кг</Text>
                  </View>
                ))}
              </View>
            </Card>
          </FadeIn>

          {/* Percentage table */}
          <FadeIn delay={160}>
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                Таблица процентов
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {percentTable.map(({ pct, weight: w }) => {
                  const isHigh = pct >= 90;
                  const isMed = pct >= 75 && pct < 90;
                  const dotColor = isHigh ? colors.error : isMed ? colors.warning || colors.accent : colors.success;
                  return (
                    <View key={pct} style={[styles.pctRow, { backgroundColor: colors.surface }]}>
                      <Text style={[typography.captionMedium, { color: dotColor }]}>{pct}%</Text>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>{w} кг</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.md }]}>
                💡 90–100% — максимальная работа; 75–89% — силовая гипертрофия; ≤74% — объёмная работа
              </Text>
            </Card>
          </FadeIn>

          {/* Strength standards */}
          <FadeIn delay={240}>
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>
                Сравнение с нормативами
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.md }]}>
                Выбери упражнение для сравнения со стандартами (вес тела: {userWeight} кг)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {Object.entries(STRENGTH_STANDARDS).map(([key, val]) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => { haptic.selection(); setSelectedStandard(selectedStandard === key ? null : key); }}
                      style={[
                        styles.standardChip,
                        {
                          backgroundColor: selectedStandard === key ? colors.primary : colors.surface,
                          borderColor: selectedStandard === key ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[typography.captionMedium, { color: selectedStandard === key ? '#FFF' : colors.text }]}>
                        {val.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {standardsForSelected && (
                <View style={{ gap: spacing.sm }}>
                  {standardsForSelected.map((s) => {
                    const barWidth = Math.min(100, (results.avg / standardsForSelected[standardsForSelected.length - 1].value) * 100);
                    const stdBarWidth = Math.min(100, (s.value / standardsForSelected[standardsForSelected.length - 1].value) * 100);
                    return (
                      <View key={s.label}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                            {s.met && <Text style={{ fontSize: 12 }}>✅</Text>}
                            <Text style={[typography.captionMedium, { color: s.met ? s.color : colors.textSecondary }]}>
                              {s.label}
                            </Text>
                          </View>
                          <Text style={[typography.captionMedium, { color: s.met ? s.color : colors.textSecondary }]}>
                            {s.value} кг
                          </Text>
                        </View>
                        <View style={[{ height: 6, borderRadius: 3, backgroundColor: colors.surface }]}>
                          <View style={[{ height: 6, borderRadius: 3, width: `${stdBarWidth}%` as any, backgroundColor: s.color, opacity: s.met ? 1 : 0.35 }]} />
                        </View>
                      </View>
                    );
                  })}
                  {/* User's 1RM marker */}
                  <Text style={[typography.captionMedium, { color: colors.primary, marginTop: spacing.xs }]}>
                    Твой ~1ПМ: {results.avg} кг
                  </Text>
                </View>
              )}
            </Card>
          </FadeIn>
        </>
      )}

      {!validInput && (
        <FadeIn delay={120}>
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>🏋️</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>
              Введи рабочий вес и количество повторений
            </Text>
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
              Например: 100 кг × 5 повторений
            </Text>
          </View>
        </FadeIn>
      )}
    </ScrollView>
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
  input: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: { height: 1, marginVertical: spacing.md },
  formulaChip: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    gap: 4,
  },
  pctRow: {
    width: '22%',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    gap: 2,
  },
  standardChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.huge,
  },
});
