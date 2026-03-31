import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../store';
import { Card, Button, ProgressRing, MacroBar } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { Meal, NutritionItem } from '../../types';

const todayDate = () => new Date().toISOString().split('T')[0];

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак', emoji: '🌅' },
  { key: 'lunch', label: 'Обед', emoji: '☀️' },
  { key: 'dinner', label: 'Ужин', emoji: '🌙' },
  { key: 'snack', label: 'Перекус', emoji: '🍎' },
] as const;

export const NutritionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { getDayLog, addMeal, addWater } = useNutritionStore();
  const today = todayDate();
  const dayLog = getDayLog(today);

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
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.lg }]}>
        Питание
      </Text>

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

            <TouchableOpacity
              onPress={handlePhotoScan}
              style={{ marginTop: spacing.md }}
            >
              <Text style={[typography.smallMedium, { color: colors.primary }]}>
                + Добавить
              </Text>
            </TouchableOpacity>
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
