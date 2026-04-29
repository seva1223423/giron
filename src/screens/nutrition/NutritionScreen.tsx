import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useAchievementCheck } from '../../hooks/useAchievementCheck';
import { useThemeStore, useNutritionStore } from '../../store';
import type { Achievement } from '../../utils/achievements';
import { Button, Tooltip, Icon } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { NutritionItem } from '../../types';
import {
  GoalsModal, QuickAddModal, DailyOverview, WaterTracker, WeekStats,
  SavedFoodsQuickAdd, MealSection, DateNavigator, MEAL_TYPES, QuickMeals,
} from './components';
import { localDateStr } from '../../utils/date';

const todayDate = () => localDateStr(new Date());

export const NutritionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddFood, setQuickAddFood] = useState<NutritionItem | null>(null);

  const handleAchievementsUnlocked = useCallback((achievements: Achievement[]) => {
    haptic.success();
    const titles = achievements.map((a) => `${a.title}`).join('\n');
    Alert.alert('Ачивка разблокирована!', titles, [{ text: 'Отлично!' }]);
  }, []);

  useAchievementCheck(handleAchievementsUnlocked);

  // Auto-clean nutrition logs older than 90 days on screen mount
  const { cleanupOldLogs, syncMealsFromServer } = useNutritionStore();
  useEffect(() => { cleanupOldLogs(90); }, []);

  // Sync meals from server when date changes (catches additions from other devices or AI chat)
  useEffect(() => { syncMealsFromServer(selectedDate).catch(() => {}); }, [selectedDate]);

  const handleQuickAdd = (food: NutritionItem) => {
    haptic.selection();
    setQuickAddFood(food);
    setShowQuickAddModal(true);
  };

  const handlePhotoScan = () => navigation.navigate('FoodScanner');

  const SUB_TABS: { key: string; label: string; a11y: string }[] = [
    { key: 'NutritionHistory', label: 'История',     a11y: 'История приёмов пищи' },
    { key: 'Recipes',          label: 'Рецепты',     a11y: 'Библиотека рецептов' },
    { key: 'MealPlan',         label: 'ИИ-план',     a11y: 'План питания от ИИ' },
    { key: 'MacroCalculator',  label: 'Калькулятор', a11y: 'Калькулятор КБЖУ' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      <GoalsModal visible={showGoalsModal} onClose={() => setShowGoalsModal(false)} selectedDate={selectedDate} />
      <QuickAddModal
        visible={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        food={quickAddFood}
        selectedDate={selectedDate}
      />

      {/* Title row + primary action "Цели" */}
      <View style={styles.header}>
        <Text style={[typography.h2, { color: colors.text }]}>Питание</Text>
        <TouchableOpacity
          onPress={() => { haptic.selection(); setShowGoalsModal(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Настроить дневные цели по КБЖУ"
          accessibilityRole="button"
        >
          <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + '35' }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]} numberOfLines={1}>Цели</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Sub-section tabs — horizontally scrollable so they never overflow viewport */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsScroller}
      >
        {SUB_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => { haptic.selection(); navigation.navigate(tab.key); }}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityLabel={tab.a11y}
            accessibilityRole="button"
            style={[styles.tabPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} />
      <DailyOverview selectedDate={selectedDate} />
      <QuickMeals selectedDate={selectedDate} />
      <Tooltip tipId="nutrition-scan" text="Нажми кнопку ниже для сканирования еды по фото или штрих-коду" />

      <Button
        title="Сканировать еду по фото"
        onPress={handlePhotoScan}
        fullWidth
        size="lg"
        icon={<Icon name="camera" size={20} color={colors.textInverse} strokeWidth={2} />}
        style={{ marginBottom: spacing.lg }}
        accessibilityLabel="Сканировать еду по фото или штрих-коду"
        accessibilityHint="Откроет камеру для AI-анализа продуктов"
      />

      <SavedFoodsQuickAdd onQuickAdd={handleQuickAdd} />
      <WaterTracker selectedDate={selectedDate} />
      <WeekStats />

      {MEAL_TYPES.map((mt) => (
        <MealSection key={mt.key} mealType={mt.key} selectedDate={selectedDate} navigation={navigation} onPhotoScan={handlePhotoScan} />
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  tabsScroller: {
    marginHorizontal: -spacing.xl,
    marginBottom: spacing.md,
  },
  tabsRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
});
