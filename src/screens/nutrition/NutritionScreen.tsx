import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useAchievementCheck } from '../../hooks/useAchievementCheck';
import { useThemeStore } from '../../store';
import type { Achievement } from '../../utils/achievements';
import { Button } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { NutritionItem } from '../../types';
import {
  GoalsModal, QuickAddModal, DailyOverview, WaterTracker, WeekStats,
  SavedFoodsQuickAdd, MealSection, DateNavigator, MEAL_TYPES,
} from './components';

const todayDate = () => new Date().toISOString().split('T')[0];

export const NutritionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddFood, setQuickAddFood] = useState<NutritionItem | null>(null);

  const handleAchievementsUnlocked = useCallback((achievements: Achievement[]) => {
    haptic.success();
    const titles = achievements.map((a) => `${a.emoji} ${a.title}`).join('\n');
    Alert.alert('Ачивка разблокирована!', titles, [{ text: 'Отлично!' }]);
  }, []);

  useAchievementCheck(handleAchievementsUnlocked);

  const handleQuickAdd = (food: NutritionItem) => {
    haptic.selection();
    setQuickAddFood(food);
    setShowQuickAddModal(true);
  };

  const handlePhotoScan = () => navigation.navigate('FoodScanner');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
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
          <TouchableOpacity onPress={() => navigation.navigate('NutritionHistory')}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>История</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('MacroCalculator'); }}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>🧮</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.selection(); setShowGoalsModal(true); }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Цели</Text>
          </TouchableOpacity>
        </View>
      </View>

      <DateNavigator selectedDate={selectedDate} onChange={setSelectedDate} />
      <DailyOverview selectedDate={selectedDate} />

      <Button title="📸 Сканировать еду по фото" onPress={handlePhotoScan} fullWidth size="lg" style={{ marginBottom: spacing.lg }} />

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
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
});
