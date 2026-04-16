import React, { useState } from 'react';
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { NutritionItem, Meal } from '../../../types';
import { scheduleNutritionSummaryReminder } from '../../../services/notificationService';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак', emoji: 'З' },
  { key: 'lunch', label: 'Обед', emoji: 'О' },
  { key: 'dinner', label: 'Ужин', emoji: 'У' },
  { key: 'snack', label: 'Перекус', emoji: 'П' },
] as const;

const todayDate = () => new Date().toISOString().split('T')[0];

interface Props {
  visible: boolean;
  onClose: () => void;
  food: NutritionItem | null;
  selectedDate: string;
}

export const QuickAddModal: React.FC<Props> = ({ visible, onClose, food, selectedDate }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addMeal, getDayLog } = useNutritionStore();
  const [quickWeight, setQuickWeight] = useState('100');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');

  // Reset state when modal opens with new food
  React.useEffect(() => {
    if (visible) {
      setQuickWeight(food?.weightGrams?.toString() || '100');
      setMealType('breakfast');
    }
  }, [visible, food?.id]);

  const dayLog = getDayLog(selectedDate);
  const totalCalories = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);
  const totalProtein = dayLog.meals.reduce((s, m) => s + m.totalProtein, 0);

  const handleConfirm = () => {
    if (!food) return;
    const w = Math.max(1, parseFloat(quickWeight) || 100);
    const ratio = w / (food.weightGrams || 100);
    const item: NutritionItem = {
      ...food,
      id: Date.now().toString(),
      weightGrams: w,
      calories: Math.round(food.calories * ratio),
      protein: Math.round(food.protein * ratio * 10) / 10,
      fats: Math.round(food.fats * ratio * 10) / 10,
      carbs: Math.round(food.carbs * ratio * 10) / 10,
    };
    const meal: Meal = {
      id: Date.now().toString(),
      type: mealType,
      items: [item],
      totalCalories: item.calories,
      totalProtein: item.protein,
      totalFats: item.fats,
      totalCarbs: item.carbs,
      createdAt: new Date().toISOString(),
    };
    addMeal(selectedDate, meal);
    haptic.success();
    if (selectedDate === todayDate()) {
      const calTarget = dayLog.targetCalories || 2000;
      const protTarget = dayLog.targetProtein || 150;
      scheduleNutritionSummaryReminder(
        calTarget > 0 ? (totalCalories + item.calories) / calTarget : 0,
        protTarget > 0 ? (totalProtein + item.protein) / protTarget : 0,
      ).catch(() => {});
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.xs }]}>{food?.name}</Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
            {food?.calories} ккал / {food?.weightGrams || 100}г
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Вес (г)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text, marginBottom: spacing.lg }]}
            value={quickWeight}
            onChangeText={setQuickWeight}
            keyboardType="numeric"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Приём пищи</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {MEAL_TYPES.map((mt) => (
              <TouchableOpacity
                key={mt.key}
                onPress={() => setMealType(mt.key as any)}
                style={[styles.chip, { backgroundColor: mealType === mt.key ? colors.primary : colors.surface, borderColor: mealType === mt.key ? colors.primary : colors.border }]}
              >
                <Text style={[typography.caption, { color: mealType === mt.key ? '#FFF' : colors.text }]}>
                  {mt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button title="Отмена" variant="outline" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Добавить" onPress={handleConfirm} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, paddingBottom: 48 },
  input: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
