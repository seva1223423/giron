import React, { useState } from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

function calcSmartTargets(user: { weightKg?: number; heightCm?: number; goal?: string; gender?: string; dateOfBirth?: string } | null) {
  const weight = user?.weightKg || 80;
  const height = user?.heightCm || 175;
  const age = user?.dateOfBirth
    ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : 28;
  const bmr = user?.gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
  const tdee = Math.round(bmr * 1.55);
  const goal = user?.goal;
  let calories = goal === 'weight_loss' ? Math.round(tdee - 500) : goal === 'muscle_gain' ? Math.round(tdee + 400) : goal === 'strength' ? Math.round(tdee + 200) : tdee;
  calories = Math.max(calories, 1200);
  const proteinPerKg = goal === 'muscle_gain' ? 2.2 : goal === 'weight_loss' ? 2.0 : goal === 'strength' ? 2.0 : 1.8;
  const protein = Math.round(weight * proteinPerKg);
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

  const handleSave = () => {
    setTargets(selectedDate, {
      calories: parseInt(goalCalories) || 2000,
      protein: parseInt(goalProtein) || 150,
      fats: parseInt(goalFats) || 70,
      carbs: parseInt(goalCarbs) || 250,
    });
    haptic.success();
    onClose();
  };

  const handleSmartCalc = () => {
    const smart = calcSmartTargets(user);
    setGoalCalories(smart.calories.toString());
    setGoalProtein(smart.protein.toString());
    setGoalFats(smart.fats.toString());
    setGoalCarbs(smart.carbs.toString());
    haptic.light();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>Дневные цели КБЖУ</Text>
          <TouchableOpacity
            onPress={handleSmartCalc}
            style={[styles.smartBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
          >
            <Text style={[typography.smallMedium, { color: colors.primary }]}>⚡ Авторассчитать по профилю</Text>
          </TouchableOpacity>
          {[
            { label: 'Калории (ккал)', value: goalCalories, setter: setGoalCalories },
            { label: 'Белки (г)', value: goalProtein, setter: setGoalProtein },
            { label: 'Жиры (г)', value: goalFats, setter: setGoalFats },
            { label: 'Углеводы (г)', value: goalCarbs, setter: setGoalCarbs },
          ].map(({ label, value, setter }) => (
            <View key={label} style={{ marginBottom: spacing.md }}>
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                value={value}
                onChangeText={setter}
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
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, paddingBottom: 48 },
  smartBtn: { borderWidth: 1, borderRadius: borderRadius.md, paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.lg },
  input: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: '600' },
});
