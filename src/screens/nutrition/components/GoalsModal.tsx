import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

type GoalKey = 'weight_loss' | 'muscle_gain' | 'strength' | 'maintenance' | 'endurance';

const GOAL_PRESETS: Array<{ key: GoalKey; label: string; emoji: string; desc: string }> = [
  { key: 'weight_loss', label: 'Похудение', emoji: '🔥', desc: '-500 ккал/TDEE' },
  { key: 'maintenance', label: 'Поддержание', emoji: '⚖️', desc: '= TDEE' },
  { key: 'muscle_gain', label: 'Набор массы', emoji: '💪', desc: '+400 ккал/TDEE' },
  { key: 'strength', label: 'Сила', emoji: '🏋️', desc: '+200 ккал/TDEE' },
  { key: 'endurance', label: 'Выносливость', emoji: '🏃', desc: '+100 ккал/TDEE' },
];

function calcBMR(user: { weightKg?: number; heightCm?: number; gender?: string; dateOfBirth?: string } | null) {
  const weight = user?.weightKg || 80;
  const height = user?.heightCm || 175;
  const age = user?.dateOfBirth
    ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : 28;
  const bmr = user?.gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
  return { bmr: Math.round(bmr), tdee: Math.round(bmr * 1.55) };
}

function calcTargetsForGoal(user: { weightKg?: number; heightCm?: number; gender?: string; dateOfBirth?: string } | null, goal: GoalKey) {
  const weight = user?.weightKg || 80;
  const { tdee } = calcBMR(user);
  const calMap: Record<GoalKey, number> = {
    weight_loss: Math.max(tdee - 500, 1200),
    maintenance: tdee,
    muscle_gain: tdee + 400,
    strength: tdee + 200,
    endurance: tdee + 100,
  };
  const protMap: Record<GoalKey, number> = {
    weight_loss: 2.0, maintenance: 1.8, muscle_gain: 2.2, strength: 2.0, endurance: 1.6,
  };
  const calories = calMap[goal];
  const protein = Math.round(weight * protMap[goal]);
  const fats = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(Math.round((calories - protein * 4 - fats * 9) / 4), 50);
  return { calories, protein, fats, carbs };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
}

export const GoalsModal: React.FC<Props> = ({ visible, onClose, selectedDate }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { getDayLog, setTargets } = useNutritionStore();
  const { user } = useAuthStore();
  const dayLog = getDayLog(selectedDate);
  const [goalCalories, setGoalCalories] = useState(dayLog.targetCalories.toString());
  const [goalProtein, setGoalProtein] = useState(dayLog.targetProtein.toString());
  const [goalFats, setGoalFats] = useState(dayLog.targetFats?.toString() || '70');
  const [goalCarbs, setGoalCarbs] = useState(dayLog.targetCarbs?.toString() || '250');
  const [selectedGoal, setSelectedGoal] = useState<GoalKey | null>(null);

  const { bmr, tdee } = useMemo(() => calcBMR(user), [user?.weightKg, user?.heightCm, user?.gender, user?.dateOfBirth]);

  // Reset state when modal opens or selectedDate changes
  React.useEffect(() => {
    if (visible) {
      const log = getDayLog(selectedDate);
      setGoalCalories(log.targetCalories.toString());
      setGoalProtein(log.targetProtein.toString());
      setGoalFats(log.targetFats?.toString() || '70');
      setGoalCarbs(log.targetCarbs?.toString() || '250');
      setSelectedGoal(null);
    }
  }, [visible, selectedDate]);

  const applyGoalPreset = (goalKey: GoalKey) => {
    haptic.light();
    setSelectedGoal(goalKey);
    const t = calcTargetsForGoal(user, goalKey);
    setGoalCalories(t.calories.toString());
    setGoalProtein(t.protein.toString());
    setGoalFats(t.fats.toString());
    setGoalCarbs(t.carbs.toString());
  };

  const handleSave = () => {
    setTargets(selectedDate, {
      calories: Math.round(parseFloat(goalCalories.replace(',', '.')) || 2000),
      protein: Math.round(parseFloat(goalProtein.replace(',', '.')) || 150),
      fats: Math.round(parseFloat(goalFats.replace(',', '.')) || 70),
      carbs: Math.round(parseFloat(goalCarbs.replace(',', '.')) || 250),
    });
    haptic.success();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.xs }]}>Дневные цели КБЖУ</Text>

            {/* BMR / TDEE info */}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primary + '08' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>Базовый обмен</Text>
                <Text style={[typography.bodyMedium, { color: colors.primary }]}>{bmr} ккал</Text>
                <Text style={{ fontSize: 9, color: colors.textTertiary }}>BMR</Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.divider }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>С учётом активности</Text>
                <Text style={[typography.bodyMedium, { color: colors.accent }]}>{tdee} ккал</Text>
                <Text style={{ fontSize: 9, color: colors.textTertiary }}>TDEE (×1.55)</Text>
              </View>
            </View>

            {/* Goal presets */}
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Выбери цель:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {GOAL_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.key}
                    onPress={() => applyGoalPreset(preset.key)}
                    style={[styles.presetBtn, {
                      backgroundColor: selectedGoal === preset.key ? colors.primary : colors.inputBackground,
                      borderColor: selectedGoal === preset.key ? colors.primary : colors.border,
                    }]}
                  >
                    <Text style={{ fontSize: 18 }}>{preset.emoji}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: selectedGoal === preset.key ? '#FFF' : colors.text, marginTop: 2 }}>
                      {preset.label}
                    </Text>
                    <Text style={{ fontSize: 9, color: selectedGoal === preset.key ? 'rgba(255,255,255,0.7)' : colors.textTertiary, marginTop: 1 }}>
                      {preset.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Manual fields */}
            {[
              { label: 'Калории (ккал)', value: goalCalories, setter: setGoalCalories, color: colors.calories },
              { label: 'Белки (г)', value: goalProtein, setter: setGoalProtein, color: colors.protein },
              { label: 'Жиры (г)', value: goalFats, setter: setGoalFats, color: colors.fats },
              { label: 'Углеводы (г)', value: goalCarbs, setter: setGoalCarbs, color: colors.carbs },
            ].map(({ label, value, setter, color }) => (
              <View key={label} style={{ marginBottom: spacing.md }}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: color + '60', color: colors.text }]}
                  value={value}
                  onChangeText={(v) => { setter(v); setSelectedGoal(null); }}
                  keyboardType="numeric"
                  placeholderTextColor={colors.inputPlaceholder}
                />
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
              <Button title="Отмена" variant="outline" onPress={onClose} style={{ flex: 1 }} />
              <Button title="Сохранить" onPress={handleSave} style={{ flex: 1 }} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, paddingBottom: 48, maxHeight: '92%' },
  input: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: '600' },
  presetBtn: { width: 90, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: borderRadius.md, borderWidth: 1 },
});
