import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useNutritionStore } from '../../store';
import { Card, Button, ProgressRing, MacroBar } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const todayDate = () => new Date().toISOString().split('T')[0];

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак', emoji: '🌅' },
  { key: 'lunch', label: 'Обед', emoji: '☀️' },
  { key: 'dinner', label: 'Ужин', emoji: '🌙' },
  { key: 'snack', label: 'Перекус', emoji: '🍎' },
] as const;

export const NutritionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { getDayLog, addWater, setTargets } = useNutritionStore();
  const today = todayDate();
  const dayLog = getDayLog(today);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [goalCalories, setGoalCalories] = useState(dayLog.targetCalories.toString());
  const [goalProtein, setGoalProtein] = useState(dayLog.targetProtein.toString());
  const [goalFats, setGoalFats] = useState(dayLog.targetFats?.toString() || '70');
  const [goalCarbs, setGoalCarbs] = useState(dayLog.targetCarbs?.toString() || '250');

  const handleSaveGoals = () => {
    const cal = parseInt(goalCalories) || 2000;
    const prot = parseInt(goalProtein) || 150;
    const fat = parseInt(goalFats) || 70;
    const carb = parseInt(goalCarbs) || 250;
    setTargets(today, { calories: cal, protein: prot, fats: fat, carbs: carb });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowGoalsModal(false);
  };

  const totalCalories = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);
  const totalProtein = dayLog.meals.reduce((s, m) => s + m.totalProtein, 0);
  const totalFats = dayLog.meals.reduce((s, m) => s + m.totalFats, 0);
  const totalCarbs = dayLog.meals.reduce((s, m) => s + m.totalCarbs, 0);
  const remaining = dayLog.targetCalories - totalCalories;

  const getMealsByType = (type: string) =>
    dayLog.meals.filter((m) => m.type === type);

  const handlePhotoScan = () => {
    navigation.navigate('FoodScanner');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Goals modal */}
      <Modal visible={showGoalsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.xl }]}>
              Дневные цели КБЖУ
            </Text>
            {[
              { label: 'Калории (ккал)', value: goalCalories, setter: setGoalCalories },
              { label: 'Белки (г)', value: goalProtein, setter: setGoalProtein },
              { label: 'Жиры (г)', value: goalFats, setter: setGoalFats },
              { label: 'Углеводы (г)', value: goalCarbs, setter: setGoalCarbs },
            ].map(({ label, value, setter }) => (
              <View key={label} style={{ marginBottom: spacing.md }}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label}</Text>
                <TextInput
                  style={[styles.goalInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  value={value}
                  onChangeText={setter}
                  keyboardType="numeric"
                  placeholderTextColor={colors.inputPlaceholder}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
              <Button title="Отмена" variant="outline" onPress={() => setShowGoalsModal(false)} style={{ flex: 1 }} />
              <Button title="Сохранить" onPress={handleSaveGoals} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text }]}>Питание</Text>
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setShowGoalsModal(true); }}>
          <Text style={[typography.smallMedium, { color: colors.primary }]}>Цели</Text>
        </TouchableOpacity>
      </View>

      {/* Daily overview */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.overviewRow}>
          <ProgressRing
            progress={dayLog.targetCalories > 0 ? totalCalories / dayLog.targetCalories : 0}
            size={110}
            strokeWidth={10}
            value={`${totalCalories}`}
            label="ккал"
          />
          <View style={{ flex: 1, marginLeft: spacing.xl }}>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              Осталось: <Text style={[typography.bodySemibold, { color: remaining > 0 ? colors.success : colors.error }]}>
                {remaining > 0 ? remaining : 0} ккал
              </Text>
            </Text>
            <MacroBar label="Белки" current={totalProtein} target={dayLog.targetProtein} color={colors.protein} />
            <MacroBar label="Жиры" current={totalFats} target={dayLog.targetFats} color={colors.fats} />
            <MacroBar label="Углеводы" current={totalCarbs} target={dayLog.targetCarbs} color={colors.carbs} />
          </View>
        </View>
      </Card>

      {/* Scan food button */}
      <Button
        title="📸 Сканировать еду по фото"
        onPress={handlePhotoScan}
        fullWidth
        size="lg"
        style={{ marginBottom: spacing.lg }}
      />

      {/* Water tracker */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[typography.h4, { color: colors.text }]}>💧 Вода</Text>
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              {dayLog.waterMl} мл / 2500 мл
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[250, 500].map((ml) => (
              <TouchableOpacity
                key={ml}
                style={[styles.waterBtn, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
                onPress={() => addWater(today, ml)}
              >
                <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[styles.waterBar, { backgroundColor: colors.progressBarBackground }]}>
          <View
            style={{
              height: '100%',
              width: `${Math.min((dayLog.waterMl / 2500) * 100, 100)}%`,
              backgroundColor: colors.info,
              borderRadius: borderRadius.full,
            }}
          />
        </View>
      </Card>

      {/* Meals by type */}
      {MEAL_TYPES.map((mealType) => {
        const meals = getMealsByType(mealType.key);
        const typeCalories = meals.reduce((s, m) => s + m.totalCalories, 0);

        return (
          <Card key={mealType.key} style={{ marginBottom: spacing.md }}>
            <View style={styles.mealHeader}>
              <Text style={[typography.h4, { color: colors.text }]}>
                {mealType.emoji} {mealType.label}
              </Text>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>
                {typeCalories} ккал
              </Text>
            </View>

            {meals.length > 0 ? (
              meals.map((meal) => (
                <View key={meal.id} style={[styles.mealItem, { borderTopColor: colors.divider }]}>
                  {meal.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{item.name}</Text>
                      <Text style={[typography.small, { color: colors.textSecondary }]}>
                        {item.calories} ккал
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.sm }]}>
                Пока ничего не добавлено
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('ManualFoodAdd', { mealType: mealType.key })}
              >
                <Text style={[typography.smallMedium, { color: colors.primary }]}>+ Добавить</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePhotoScan}>
                <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>📸 Фото</Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  overviewRow: { flexDirection: 'row', alignItems: 'center' },
  waterBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  waterBar: {
    height: 8,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: 48,
  },
  goalInput: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontWeight: '600',
  },
  mealItem: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
});
