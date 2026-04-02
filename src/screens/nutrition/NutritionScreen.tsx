import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useNutritionStore } from '../../store';
import { Card, Button, ProgressRing, MacroBar } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const todayDate = () => new Date().toISOString().split('T')[0];

function formatDisplayDate(dateStr: string): string {
  const today = todayDate();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак', emoji: '🌅' },
  { key: 'lunch', label: 'Обед', emoji: '☀️' },
  { key: 'dinner', label: 'Ужин', emoji: '🌙' },
  { key: 'snack', label: 'Перекус', emoji: '🍎' },
] as const;

export const NutritionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { getDayLog, addWater, setTargets, removeMeal } = useNutritionStore();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const isToday = selectedDate === todayDate();
  const dayLog = getDayLog(selectedDate);
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
    setTargets(selectedDate, { calories: cal, protein: prot, fats: fat, carbs: carb });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowGoalsModal(false);
  };

  const { totalCalories, totalProtein, totalFats, totalCarbs } = useMemo(() => ({
    totalCalories: dayLog.meals.reduce((s, m) => s + m.totalCalories, 0),
    totalProtein: dayLog.meals.reduce((s, m) => s + m.totalProtein, 0),
    totalFats: dayLog.meals.reduce((s, m) => s + m.totalFats, 0),
    totalCarbs: dayLog.meals.reduce((s, m) => s + m.totalCarbs, 0),
  }), [dayLog.meals]);
  const remaining = dayLog.targetCalories - totalCalories;
  const waterTarget = dayLog.waterTargetMl ?? 2500;

  const getMealsByType = (type: string) =>
    dayLog.meals.filter((m) => m.type === type);

  const handlePhotoScan = () => {
    navigation.navigate('FoodScanner');
  };

  const handlePrevDay = () => {
    Haptics.selectionAsync();
    setSelectedDate((d) => shiftDate(d, -1));
  };

  const handleNextDay = () => {
    if (isToday) return;
    Haptics.selectionAsync();
    setSelectedDate((d) => shiftDate(d, 1));
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

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Питание</Text>
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <TouchableOpacity onPress={() => navigation.navigate('NutritionHistory')}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>История</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setShowGoalsModal(true); }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Цели</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date navigation */}
      <View style={[styles.dateNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity onPress={handlePrevDay} style={styles.dateNavBtn}>
          <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { if (!isToday) { Haptics.selectionAsync(); setSelectedDate(todayDate()); } }}>
          <Text style={[typography.bodySemibold, { color: colors.text }]}>{formatDisplayDate(selectedDate)}</Text>
          {!isToday && (
            <Text style={[typography.caption, { color: colors.primary, textAlign: 'center', marginTop: 1 }]}>
              Вернуться к сегодня
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNextDay} style={styles.dateNavBtn} disabled={isToday}>
          <Text style={[typography.h3, { color: isToday ? colors.textTertiary : colors.primary }]}>›</Text>
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
              {dayLog.waterMl} мл / {waterTarget} мл
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[250, 500].map((ml) => (
              <TouchableOpacity
                key={ml}
                style={[styles.waterBtn, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
                onPress={() => addWater(selectedDate, ml)}
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
              width: `${Math.min((dayLog.waterMl / waterTarget) * 100, 100)}%`,
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
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); removeMeal(selectedDate, meal.id); }}
                    style={{ alignSelf: 'flex-end', marginTop: 4 }}
                  >
                    <Text style={[typography.caption, { color: colors.error }]}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.sm }]}>
                Пока ничего не добавлено
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('ManualFoodAdd', { mealType: mealType.key, date: selectedDate })}
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
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  dateNavBtn: {
    padding: spacing.xs,
    minWidth: 32,
    alignItems: 'center',
  },
});
