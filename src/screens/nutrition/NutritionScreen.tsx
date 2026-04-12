import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useAchievementCheck } from '../../hooks/useAchievementCheck';
import { useThemeStore, useNutritionStore } from '../../store';
import type { Achievement } from '../../utils/achievements';
import { Button, Tooltip } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { NutritionItem } from '../../types';
import {
  GoalsModal, QuickAddModal, DailyOverview, WaterTracker, WeekStats,
  SavedFoodsQuickAdd, MealSection, DateNavigator, MEAL_TYPES, QuickMeals,
} from './components';

const todayDate = () => new Date().toISOString().split('T')[0];

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
  const { cleanupOldLogs } = useNutritionStore();
  useEffect(() => { cleanupOldLogs(90); }, []);

  const handleQuickAdd = (food: NutritionItem) => {
    haptic.selection();
    setQuickAddFood(food);
    setShowQuickAddModal(true);
  };

  const handlePhotoScan = () => navigation.navigate('FoodScanner');

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

      <View style={styles.header}>
        <Text style={[typography.h2, { color: colors.text }]}>Питание</Text>
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('NutritionHistory'); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]} numberOfLines={1}>История</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('MacroCalculator'); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]} numberOfLines={1}>Калькулятор</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.selection(); setShowGoalsModal(true); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]} numberOfLines={1}>Цели</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} />
      <DailyOverview selectedDate={selectedDate} />
      <QuickMeals />
      <Tooltip tipId="nutrition-scan" text="Нажми + чтобы сканировать штрих-код продукта или сфотографировать еду" />

      <Button title="Сканировать еду по фото" onPress={handlePhotoScan} fullWidth size="lg" style={{ marginBottom: spacing.lg }} />

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
});
