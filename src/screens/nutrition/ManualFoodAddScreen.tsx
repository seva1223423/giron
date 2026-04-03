import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  FlatList,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useNutritionStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { Meal, NutritionItem } from '../../types';

// Common foods database (per 100g)
const FOOD_DB = [
  // Мясо и птица
  { name: 'Куриная грудка', calories: 165, protein: 31, fats: 3.6, carbs: 0 },
  { name: 'Куриное бедро', calories: 215, protein: 26, fats: 12, carbs: 0 },
  { name: 'Индейка (грудка)', calories: 157, protein: 29, fats: 3.2, carbs: 0 },
  { name: 'Говядина (фарш)', calories: 250, protein: 26, fats: 17, carbs: 0 },
  { name: 'Говядина (вырезка)', calories: 187, protein: 29, fats: 7, carbs: 0 },
  { name: 'Свинина (корейка)', calories: 270, protein: 23, fats: 19, carbs: 0 },
  { name: 'Свинина (вырезка)', calories: 143, protein: 22, fats: 6, carbs: 0 },
  { name: 'Докторская колбаса', calories: 256, protein: 13, fats: 22, carbs: 2 },
  { name: 'Куриная варёная колбаса', calories: 170, protein: 16, fats: 10, carbs: 5 },
  // Рыба и морепродукты
  { name: 'Лосось', calories: 208, protein: 20, fats: 13, carbs: 0 },
  { name: 'Горбуша', calories: 142, protein: 21, fats: 7, carbs: 0 },
  { name: 'Скумбрия', calories: 191, protein: 18, fats: 13, carbs: 0 },
  { name: 'Треска', calories: 75, protein: 17, fats: 0.6, carbs: 0 },
  { name: 'Минтай', calories: 72, protein: 16, fats: 0.9, carbs: 0 },
  { name: 'Тунец консервированный', calories: 116, protein: 25, fats: 1, carbs: 0 },
  { name: 'Сельдь солёная', calories: 217, protein: 17, fats: 16, carbs: 0 },
  // Яйца и молочное
  { name: 'Яйцо куриное', calories: 155, protein: 13, fats: 11, carbs: 1.1 },
  { name: 'Яичный белок', calories: 52, protein: 11, fats: 0.2, carbs: 0.7 },
  { name: 'Творог 0%', calories: 71, protein: 16, fats: 0, carbs: 1.8 },
  { name: 'Творог 5%', calories: 121, protein: 17, fats: 5, carbs: 1.8 },
  { name: 'Творог 9%', calories: 159, protein: 16, fats: 9, carbs: 2 },
  { name: 'Греческий йогурт', calories: 59, protein: 10, fats: 0.4, carbs: 3.6 },
  { name: 'Йогурт 2.5%', calories: 53, protein: 4.3, fats: 2.5, carbs: 3.5 },
  { name: 'Кефир 1%', calories: 40, protein: 3.3, fats: 1, carbs: 4.7 },
  { name: 'Ряженка 2.5%', calories: 54, protein: 2.9, fats: 2.5, carbs: 4.2 },
  { name: 'Молоко 3.2%', calories: 60, protein: 3.2, fats: 3.2, carbs: 4.7 },
  { name: 'Сметана 15%', calories: 158, protein: 2.6, fats: 15, carbs: 3 },
  { name: 'Сыр твёрдый', calories: 356, protein: 26, fats: 27, carbs: 0.4 },
  { name: 'Сыр плавленый', calories: 261, protein: 16, fats: 20, carbs: 3 },
  { name: 'Протеин (сывороточный)', calories: 380, protein: 74, fats: 5, carbs: 10 },
  // Крупы и злаки
  { name: 'Гречка (варёная)', calories: 110, protein: 4.2, fats: 0.6, carbs: 21 },
  { name: 'Гречка (сухая)', calories: 313, protein: 12, fats: 3.3, carbs: 57 },
  { name: 'Рис (варёный)', calories: 130, protein: 2.7, fats: 0.3, carbs: 28 },
  { name: 'Овсянка (варёная)', calories: 68, protein: 2.4, fats: 1.4, carbs: 12 },
  { name: 'Овсяные хлопья (сухие)', calories: 352, protein: 12, fats: 6, carbs: 60 },
  { name: 'Перловка (варёная)', calories: 109, protein: 3.1, fats: 0.4, carbs: 22 },
  { name: 'Пшено (варёное)', calories: 90, protein: 3, fats: 0.7, carbs: 18 },
  { name: 'Макароны (варёные)', calories: 158, protein: 5.5, fats: 0.9, carbs: 31 },
  // Хлеб
  { name: 'Хлеб цельнозерновой', calories: 247, protein: 8, fats: 2, carbs: 48 },
  { name: 'Хлеб чёрный (Бородинский)', calories: 201, protein: 6.8, fats: 1.3, carbs: 40 },
  { name: 'Батон белый', calories: 264, protein: 7.9, fats: 3.4, carbs: 50 },
  { name: 'Хлебцы рисовые', calories: 363, protein: 8, fats: 2.8, carbs: 76 },
  // Бобовые
  { name: 'Нут (варёный)', calories: 164, protein: 9, fats: 2.6, carbs: 27 },
  { name: 'Чечевица (варёная)', calories: 116, protein: 9, fats: 0.4, carbs: 20 },
  { name: 'Фасоль (варёная)', calories: 127, protein: 8.7, fats: 0.5, carbs: 22 },
  // Овощи
  { name: 'Картофель (варёный)', calories: 87, protein: 1.9, fats: 0.1, carbs: 20 },
  { name: 'Брокколи', calories: 34, protein: 2.8, fats: 0.4, carbs: 6.6 },
  { name: 'Капуста белокочанная', calories: 27, protein: 1.8, fats: 0.1, carbs: 4.7 },
  { name: 'Огурец', calories: 15, protein: 0.8, fats: 0.1, carbs: 2.5 },
  { name: 'Помидор', calories: 20, protein: 0.9, fats: 0.2, carbs: 3.9 },
  { name: 'Морковь', calories: 41, protein: 0.9, fats: 0.2, carbs: 9.6 },
  { name: 'Свекла (варёная)', calories: 49, protein: 1.8, fats: 0.1, carbs: 10 },
  { name: 'Шпинат', calories: 23, protein: 2.9, fats: 0.4, carbs: 3.6 },
  // Фрукты
  { name: 'Банан', calories: 89, protein: 1.1, fats: 0.3, carbs: 23 },
  { name: 'Яблоко', calories: 52, protein: 0.3, fats: 0.2, carbs: 14 },
  { name: 'Апельсин', calories: 47, protein: 0.9, fats: 0.1, carbs: 12 },
  { name: 'Клубника', calories: 32, protein: 0.7, fats: 0.3, carbs: 7.7 },
  { name: 'Вишня', calories: 52, protein: 0.8, fats: 0.5, carbs: 12 },
  // Орехи и масла
  { name: 'Орехи грецкие', calories: 654, protein: 15, fats: 65, carbs: 14 },
  { name: 'Миндаль', calories: 579, protein: 21, fats: 50, carbs: 22 },
  { name: 'Арахисовая паста', calories: 588, protein: 25, fats: 50, carbs: 20 },
  { name: 'Семечки подсолнечника', calories: 584, protein: 21, fats: 53, carbs: 11 },
  { name: 'Авокадо', calories: 160, protein: 2, fats: 15, carbs: 9 },
  { name: 'Оливковое масло', calories: 884, protein: 0, fats: 100, carbs: 0 },
  { name: 'Подсолнечное масло', calories: 884, protein: 0, fats: 100, carbs: 0 },
  // Прочее
  { name: 'Мёд', calories: 304, protein: 0.8, fats: 0, carbs: 82 },
  { name: 'Шоколад тёмный 70%', calories: 598, protein: 7.8, fats: 43, carbs: 46 },
  { name: 'Шоколад молочный', calories: 550, protein: 6.9, fats: 35, carbs: 52 },
];

export const ManualFoodAddScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const mealType = route.params?.mealType || 'snack';
  const routeDate = route.params?.date as string | undefined;
  const { colors } = useThemeStore();
  const { addMeal, dailyLog, saveFoodItem } = useNutritionStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<typeof FOOD_DB[0] | null>(null);
  const [weightGrams, setWeightGrams] = useState('100');
  const [customName, setCustomName] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customFats, setCustomFats] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [tab, setTab] = useState<'search' | 'custom'>('search');

  const today = routeDate ?? new Date().toISOString().split('T')[0];

  const filteredFoods = useMemo(() => {
    if (!searchQuery.trim()) return FOOD_DB.slice(0, 12);
    return FOOD_DB.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: (typeof FOOD_DB[0])[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const log = dailyLog[dateStr];
      if (!log) continue;
      for (const meal of log.meals) {
        for (const item of meal.items) {
          const grams = item.weightGrams || 100;
          const baseName = item.name.replace(/\s*\(\d+г\)$/, '').trim();
          if (seen.has(baseName)) continue;
          seen.add(baseName);
          const factor = 100 / grams;
          result.push({
            name: baseName,
            calories: Math.round(item.calories * factor),
            protein: Math.round(item.protein * factor * 10) / 10,
            fats: Math.round(item.fats * factor * 10) / 10,
            carbs: Math.round(item.carbs * factor * 10) / 10,
          });
          if (result.length >= 10) break;
        }
        if (result.length >= 10) break;
      }
      if (result.length >= 10) break;
    }
    return result;
  }, [dailyLog]);

  const computedNutrition = useMemo(() => {
    if (!selectedFood) return null;
    const factor = (parseFloat(weightGrams) || 100) / 100;
    return {
      calories: Math.round(selectedFood.calories * factor),
      protein: Math.round(selectedFood.protein * factor * 10) / 10,
      fats: Math.round(selectedFood.fats * factor * 10) / 10,
      carbs: Math.round(selectedFood.carbs * factor * 10) / 10,
    };
  }, [selectedFood, weightGrams]);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let item: NutritionItem;

    if (tab === 'search' && selectedFood && computedNutrition) {
      item = {
        id: `item-${Date.now()}`,
        name: `${selectedFood.name} (${weightGrams}г)`,
        calories: computedNutrition.calories,
        protein: computedNutrition.protein,
        fats: computedNutrition.fats,
        carbs: computedNutrition.carbs,
        weightGrams: parseFloat(weightGrams) || 100,
      };
    } else if (tab === 'custom') {
      if (!customName.trim()) {
        Alert.alert('Укажи название продукта');
        return;
      }
      item = {
        id: `item-${Date.now()}`,
        name: customName.trim(),
        calories: parseInt(customCalories) || 0,
        protein: parseFloat(customProtein) || 0,
        fats: parseFloat(customFats) || 0,
        carbs: parseFloat(customCarbs) || 0,
        weightGrams: 100,
      };
    } else {
      Alert.alert('Выбери продукт из списка или введи данные вручную');
      return;
    }

    const meal: Meal = {
      id: `meal-${Date.now()}`,
      type: mealType,
      items: [item],
      totalCalories: item.calories,
      totalProtein: item.protein,
      totalFats: item.fats,
      totalCarbs: item.carbs,
      createdAt: new Date().toISOString(),
    };

    addMeal(today, meal);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  };

  const MEAL_NAMES: Record<string, string> = {
    breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>
          Добавить в {MEAL_NAMES[mealType] || mealType}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['search', 'custom'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => { Haptics.selectionAsync(); setTab(t); }}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[typography.smallMedium, { color: tab === t ? colors.primary : colors.textSecondary }]}>
              {t === 'search' ? '🔍 База продуктов' : '✏️ Вручную'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'search' && (
          <>
            {recentFoods.length > 0 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                  🕒 Недавно добавлено
                </Text>
                <FlatList
                  data={recentFoods}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => item.name}
                  contentContainerStyle={{ gap: spacing.sm }}
                  renderItem={({ item }) => {
                    const isSelected = selectedFood?.name === item.name;
                    return (
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); setSelectedFood(item); setWeightGrams('100'); }}
                        style={[
                          styles.recentChip,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.surface,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[typography.small, { color: isSelected ? '#fff' : colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[typography.caption, { color: isSelected ? 'rgba(255,255,255,0.75)' : colors.textTertiary }]}>
                          {item.calories} ккал/100г
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Найти продукт..."
              placeholderTextColor={colors.inputPlaceholder}
            />

            {filteredFoods.map((food) => {
              const isSelected = selectedFood?.name === food.name;
              return (
                <TouchableOpacity
                  key={food.name}
                  onPress={() => { Haptics.selectionAsync(); setSelectedFood(food); }}
                >
                  <Card
                    style={{
                      marginBottom: spacing.sm,
                      borderWidth: isSelected ? 1.5 : 0,
                      borderColor: isSelected ? colors.primary : 'transparent',
                    }}
                    padding={spacing.md}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[typography.bodySemibold, { color: isSelected ? colors.primary : colors.text }]}>
                        {food.name}
                      </Text>
                      <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
                        {food.calories} ккал/100г
                      </Text>
                    </View>
                    <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                      Б: {food.protein}г  Ж: {food.fats}г  У: {food.carbs}г
                    </Text>
                  </Card>
                </TouchableOpacity>
              );
            })}

            {selectedFood && (
              <Card style={{ marginTop: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <Text style={[typography.captionMedium, { color: colors.primary }]}>
                    {selectedFood.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      saveFoodItem({
                        id: `saved-${selectedFood.name.replace(/\s/g, '-').toLowerCase()}`,
                        name: selectedFood.name,
                        calories: selectedFood.calories,
                        protein: selectedFood.protein,
                        fats: selectedFood.fats,
                        carbs: selectedFood.carbs,
                        weightGrams: 100,
                      });
                      Alert.alert('Сохранено ⭐', `${selectedFood.name} добавлен в быстрые продукты`);
                    }}
                    style={[styles.saveBtn, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}
                  >
                    <Text style={[typography.caption, { color: colors.warning }]}>⭐ Сохранить</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <Text style={[typography.body, { color: colors.text }]}>Порция:</Text>
                  <TextInput
                    style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                    value={weightGrams}
                    onChangeText={setWeightGrams}
                    keyboardType="numeric"
                  />
                  <Text style={[typography.body, { color: colors.textSecondary }]}>г</Text>
                </View>
                {computedNutrition && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[typography.numberSmall, { color: colors.calories, fontSize: 20 }]}>{computedNutrition.calories}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>ккал</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[typography.numberSmall, { color: colors.protein, fontSize: 20 }]}>{computedNutrition.protein}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>белки</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[typography.numberSmall, { color: colors.fats, fontSize: 20 }]}>{computedNutrition.fats}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>жиры</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[typography.numberSmall, { color: colors.carbs, fontSize: 20 }]}>{computedNutrition.carbs}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>углеводы</Text>
                    </View>
                  </View>
                )}
              </Card>
            )}
          </>
        )}

        {tab === 'custom' && (
          <Card>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Ввод вручную
            </Text>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Название</Text>
              <TextInput
                style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                value={customName}
                onChangeText={setCustomName}
                placeholder="Куриная грудка..."
                placeholderTextColor={colors.inputPlaceholder}
              />
            </View>
            <View style={styles.customRow}>
              {[
                { label: 'Калории', value: customCalories, setter: setCustomCalories, unit: 'ккал' },
                { label: 'Белки', value: customProtein, setter: setCustomProtein, unit: 'г' },
              ].map(({ label, value, setter, unit }) => (
                <View key={label} style={{ flex: 1 }}>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label} ({unit})</Text>
                  <TextInput
                    style={[styles.macroInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                    value={value}
                    onChangeText={setter}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.inputPlaceholder}
                  />
                </View>
              ))}
            </View>
            <View style={[styles.customRow, { marginTop: spacing.md }]}>
              {[
                { label: 'Жиры', value: customFats, setter: setCustomFats, unit: 'г' },
                { label: 'Углеводы', value: customCarbs, setter: setCustomCarbs, unit: 'г' },
              ].map(({ label, value, setter, unit }) => (
                <View key={label} style={{ flex: 1 }}>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>{label} ({unit})</Text>
                  <TextInput
                    style={[styles.macroInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                    value={value}
                    onChangeText={setter}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.inputPlaceholder}
                  />
                </View>
              ))}
            </View>
          </Card>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.huge }}>
          {tab === 'custom' && customName.trim() !== '' && (
            <TouchableOpacity
              onPress={() => {
                if (!customName.trim()) return;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                saveFoodItem({
                  id: `saved-${customName.trim().replace(/\s/g, '-').toLowerCase()}-${Date.now()}`,
                  name: customName.trim(),
                  calories: parseInt(customCalories) || 0,
                  protein: parseFloat(customProtein) || 0,
                  fats: parseFloat(customFats) || 0,
                  carbs: parseFloat(customCarbs) || 0,
                  weightGrams: 100,
                });
                Alert.alert('Сохранено ⭐', `${customName.trim()} добавлен в быстрые продукты`);
              }}
              style={[styles.saveBtnLg, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}
            >
              <Text style={[typography.smallMedium, { color: colors.warning }]}>⭐</Text>
            </TouchableOpacity>
          )}
          <Button
            title="Добавить"
            onPress={handleAdd}
            fullWidth
            size="lg"
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  tab: {
    paddingVertical: spacing.md,
    marginRight: spacing.xl,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  searchInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  weightInput: {
    width: 80,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  macroInput: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  recentChip: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 110,
    maxWidth: 150,
  },
  saveBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  saveBtnLg: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
