import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../store';
import { Card, Button, ProgressRing, MacroBar } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NutritionItem, Meal } from '../../types';

function calcSmartTargets(user: { weightKg?: number; heightCm?: number; goal?: string; gender?: string; age?: number } | null) {
  const weight = user?.weightKg || 80;
  const height = user?.heightCm || 175;
  const age = user?.age || 28;
  const gender = user?.gender;
  const goal = user?.goal;

  const bmr = gender === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;

  const tdee = Math.round(bmr * 1.55); // moderately active (gym 3-5x/week)

  let calories: number;
  if (goal === 'weight_loss') calories = Math.round(tdee - 500);
  else if (goal === 'muscle_gain') calories = Math.round(tdee + 400);
  else if (goal === 'strength') calories = Math.round(tdee + 200);
  else calories = tdee;
  calories = Math.max(calories, 1200);

  const proteinPerKg = goal === 'muscle_gain' ? 2.2 : goal === 'weight_loss' ? 2.0 : goal === 'strength' ? 2.0 : 1.8;
  const protein = Math.round(weight * proteinPerKg);
  const fats = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(Math.round((calories - protein * 4 - fats * 9) / 4), 50);

  return { calories, protein, fats, carbs };
}

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
  const { user } = useAuthStore();
  const { dailyLog, getDayLog, addWater, setTargets, removeMeal, addMeal, savedFoods, removeSavedFood } = useNutritionStore();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const isToday = selectedDate === todayDate();
  const dayLog = getDayLog(selectedDate);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddFood, setQuickAddFood] = useState<NutritionItem | null>(null);
  const [quickMealType, setQuickMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [quickWeight, setQuickWeight] = useState('100');
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

  const weekStats = useMemo(() => {
    const days: { date: string; calories: number; protein: number; fats: number; carbs: number; target: number }[] = [];
    const today = todayDate();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const log = dailyLog[dateStr];
      if (!log || log.meals.length === 0) continue;
      days.push({
        date: dateStr,
        calories: log.meals.reduce((s, m) => s + m.totalCalories, 0),
        protein: log.meals.reduce((s, m) => s + m.totalProtein, 0),
        fats: log.meals.reduce((s, m) => s + m.totalFats, 0),
        carbs: log.meals.reduce((s, m) => s + m.totalCarbs, 0),
        target: log.targetCalories,
      });
    }
    if (days.length === 0) return null;
    const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const goalMet = days.filter((d) => d.calories <= d.target * 1.05 && d.calories >= d.target * 0.85).length;
    return {
      daysLogged: days.length,
      avgCalories: avg(days.map((d) => d.calories)),
      avgProtein: avg(days.map((d) => d.protein)),
      avgFats: avg(days.map((d) => d.fats)),
      avgCarbs: avg(days.map((d) => d.carbs)),
      goalMet,
      days,
    };
  }, [dailyLog]);

  const getMealsByType = (type: string) =>
    dayLog.meals.filter((m) => m.type === type);

  const handlePhotoScan = () => {
    navigation.navigate('FoodScanner');
  };

  const handleQuickAdd = (food: NutritionItem) => {
    Haptics.selectionAsync();
    setQuickAddFood(food);
    setQuickWeight('100');
    setShowQuickAddModal(true);
  };

  const handleConfirmQuickAdd = () => {
    if (!quickAddFood) return;
    const w = parseFloat(quickWeight) || 100;
    const base = quickAddFood.weightGrams || 100;
    const ratio = w / base;
    const item: NutritionItem = {
      ...quickAddFood,
      id: Date.now().toString(),
      weightGrams: w,
      calories: Math.round(quickAddFood.calories * ratio),
      protein: Math.round(quickAddFood.protein * ratio * 10) / 10,
      fats: Math.round(quickAddFood.fats * ratio * 10) / 10,
      carbs: Math.round(quickAddFood.carbs * ratio * 10) / 10,
    };
    const meal: Meal = {
      id: Date.now().toString(),
      type: quickMealType,
      items: [item],
      totalCalories: item.calories,
      totalProtein: item.protein,
      totalFats: item.fats,
      totalCarbs: item.carbs,
      createdAt: new Date().toISOString(),
    };
    addMeal(selectedDate, meal);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowQuickAddModal(false);
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
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>
              Дневные цели КБЖУ
            </Text>
            <TouchableOpacity
              onPress={() => {
                const smart = calcSmartTargets(user);
                setGoalCalories(smart.calories.toString());
                setGoalProtein(smart.protein.toString());
                setGoalFats(smart.fats.toString());
                setGoalCarbs(smart.carbs.toString());
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
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

      {/* Quick-add modal */}
      <Modal visible={showQuickAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.xs }]}>
              {quickAddFood?.name}
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
              {quickAddFood?.calories} ккал / {quickAddFood?.weightGrams || 100}г
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Вес (г)</Text>
            <TextInput
              style={[styles.goalInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text, marginBottom: spacing.lg }]}
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
                  onPress={() => setQuickMealType(mt.key as any)}
                  style={[
                    styles.mealTypeChip,
                    {
                      backgroundColor: quickMealType === mt.key ? colors.primary : colors.surface,
                      borderColor: quickMealType === mt.key ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[typography.caption, { color: quickMealType === mt.key ? '#FFF' : colors.text }]}>
                    {mt.emoji} {mt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button title="Отмена" variant="outline" onPress={() => setShowQuickAddModal(false)} style={{ flex: 1 }} />
              <Button title="Добавить" onPress={handleConfirmQuickAdd} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Scan food button */}
      <Button
        title="📸 Сканировать еду по фото"
        onPress={handlePhotoScan}
        fullWidth
        size="lg"
        style={{ marginBottom: spacing.lg }}
      />

      {/* Saved foods quick-add */}
      {savedFoods.length > 0 && (
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.h4, { color: colors.text }]}>⭐ Быстрые продукты</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>{savedFoods.length}/30</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xs }}>
            {savedFoods.map((food) => (
              <TouchableOpacity
                key={food.id}
                onPress={() => handleQuickAdd(food)}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  removeSavedFood(food.id);
                }}
                style={[styles.savedFoodChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[typography.captionMedium, { color: colors.text }]} numberOfLines={1}>{food.name}</Text>
                <Text style={[typography.small, { color: colors.primary }]}>{food.calories} ккал</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
            Нажми для добавления · Удержи для удаления
          </Text>
        </Card>
      )}

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

      {/* 7-day analytics */}
      {weekStats && (
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.h4, { color: colors.text }]}>📊 За 7 дней</Text>
            <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full }}>
              <Text style={[typography.caption, { color: colors.primary }]}>
                Цель выполнена {weekStats.goalMet}/{weekStats.daysLogged}
              </Text>
            </View>
          </View>

          {/* Mini bar chart for daily calories */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56, marginBottom: spacing.md }}>
            {weekStats.days.map((d, i) => {
              const maxCal = Math.max(...weekStats.days.map((dd) => dd.calories), weekStats.days[0]?.target || 2000);
              const barH = Math.max(4, (d.calories / maxCal) * 44);
              const isGoalMet = d.calories <= d.target * 1.05 && d.calories >= d.target * 0.85;
              const dayLabel = new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short' }).slice(0, 2);
              return (
                <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: '80%', height: barH, backgroundColor: isGoalMet ? colors.success : colors.primary, borderRadius: 3 }} />
                  <Text style={[typography.small, { color: colors.textTertiary, fontSize: 9, marginTop: 3 }]}>{dayLabel}</Text>
                </View>
              );
            })}
          </View>

          {/* Average macros */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { label: 'Ккал', value: weekStats.avgCalories, color: colors.primary },
              { label: 'Белки', value: `${weekStats.avgProtein}г`, color: colors.success },
              { label: 'Жиры', value: `${weekStats.avgFats}г`, color: colors.warning },
              { label: 'Углев.', value: `${weekStats.avgCarbs}г`, color: colors.accent },
            ].map(({ label, value, color }) => (
              <View key={label} style={{ alignItems: 'center' }}>
                <Text style={[typography.bodySemibold, { color }]}>{value}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}/день</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

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
  smartBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center' as const,
    marginBottom: spacing.lg,
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
  savedFoodChip: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xs,
    minWidth: 90,
    alignItems: 'center',
  },
  mealTypeChip: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
