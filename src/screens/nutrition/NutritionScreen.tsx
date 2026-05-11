import React, { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useAchievementCheck } from '../../hooks/useAchievementCheck';
import { useThemeColors, useNutritionStore } from '../../store';
import type { Achievement } from '../../utils/achievements';
import { Tooltip } from '../../components';
import { spacing } from '../../theme/spacing';
import { NutritionItem } from '../../types';
import {
  GoalsModal,
  QuickAddModal,
  DailyOverview,
  WaterTracker,
  SavedFoodsQuickAdd,
  MealSection,
  DateNavigator,
  MEAL_TYPES,
  QuickMeals,
  NutritionHeader,
  NutritionHeroButton,
  NutritionTabBar,
  NutritionTab,
  NutritionMenu,
  WeekTab,
} from './components';
import { localDateStr } from '../../utils/date';

const todayDate = () => localDateStr(new Date());

/**
 * Nutrition root screen — Direction A redesign mirroring Workouts.
 *
 *   Header (title + 🔍 + ⋮)
 *   NutritionHeroButton  (Сканировать еду → FoodScanner)
 *   TabBar               (Сегодня / Неделя)
 *   ─ Сегодня tab → DateNavigator + DailyOverview + QuickMeals + Tooltip
 *                   + SavedFoodsQuickAdd + WaterTracker + 4× MealSection
 *   ─ Неделя tab  → WeekTab (WeekStats wrapper)
 *   ⋮ menu         → inline panel: Цели, История, Рецепты, ИИ-план, Калькулятор
 */
export const NutritionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddFood, setQuickAddFood] = useState<NutritionItem | null>(null);
  const [tab, setTab] = useState<NutritionTab>('today');
  const [menuOpen, setMenuOpen] = useState(false);

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

  // TODO: dedicated food/recipe search screen — currently routes to the
  // Recipes browse list as a placeholder until a unified search lands.
  const handleSearchPress = () => navigation.navigate('Recipes');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GoalsModal visible={showGoalsModal} onClose={() => setShowGoalsModal(false)} selectedDate={selectedDate} />
      <QuickAddModal
        visible={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        food={quickAddFood}
        selectedDate={selectedDate}
      />

      <NutritionHeader
        onSearchPress={handleSearchPress}
        onMenuPress={() => setMenuOpen((v) => !v)}
      />
      <NutritionHeroButton onPress={handlePhotoScan} />
      <NutritionTabBar activeTab={tab} onTabChange={setTab} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'today' ? (
          <>
            <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} />
            <DailyOverview selectedDate={selectedDate} />
            <QuickMeals selectedDate={selectedDate} />
            <Tooltip tipId="nutrition-scan" text="Нажми кнопку выше для сканирования еды по фото или штрих-коду" />
            <SavedFoodsQuickAdd onQuickAdd={handleQuickAdd} />
            <WaterTracker selectedDate={selectedDate} />
            {MEAL_TYPES.map((mt) => (
              <MealSection
                key={mt.key}
                mealType={mt.key}
                selectedDate={selectedDate}
                navigation={navigation}
                onPhotoScan={handlePhotoScan}
              />
            ))}
          </>
        ) : (
          <WeekTab />
        )}
      </ScrollView>

      <NutritionMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(screen) => navigation.navigate(screen)}
        onOpenGoals={() => setShowGoalsModal(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
});
