import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore, useNutritionStore } from '../../store';
import { Button, Card, Input } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NutritionItem, Meal } from '../../types';

const todayDate = () => new Date().toISOString().split('T')[0];

export const FoodScannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { addMeal } = useNutritionStore();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recognizedItems, setRecognizedItems] = useState<NutritionItem[]>([]);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Нужен доступ', 'Разрешите доступ к камере/галерее в настройках');
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      analyzeFood(result.assets[0].base64 || '');
    }
  };

  const analyzeFood = async (base64: string) => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call to backend -> Claude Vision
      // Mock response for now
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const mockItems: NutritionItem[] = [
        {
          id: `item-${Date.now()}-1`,
          name: 'Куриная грудка',
          calories: 165,
          protein: 31,
          fats: 3.6,
          carbs: 0,
          weightGrams: 150,
        },
        {
          id: `item-${Date.now()}-2`,
          name: 'Рис варёный',
          calories: 200,
          protein: 4,
          fats: 0.5,
          carbs: 44,
          weightGrams: 150,
        },
        {
          id: `item-${Date.now()}-3`,
          name: 'Овощной салат',
          calories: 45,
          protein: 2,
          fats: 1,
          carbs: 7,
          weightGrams: 100,
        },
      ];
      setRecognizedItems(mockItems);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось распознать еду');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (recognizedItems.length === 0) return;

    const meal: Meal = {
      id: `meal-${Date.now()}`,
      type: mealType,
      items: recognizedItems,
      photoUrl: imageUri || undefined,
      totalCalories: recognizedItems.reduce((s, i) => s + i.calories, 0),
      totalProtein: recognizedItems.reduce((s, i) => s + i.protein, 0),
      totalFats: recognizedItems.reduce((s, i) => s + i.fats, 0),
      totalCarbs: recognizedItems.reduce((s, i) => s + i.carbs, 0),
      createdAt: new Date().toISOString(),
    };

    addMeal(todayDate(), meal);
    navigation.goBack();
  };

  const updateItem = (index: number, field: keyof NutritionItem, value: string) => {
    setRecognizedItems((items) =>
      items.map((item, i) =>
        i === index ? { ...item, [field]: isNaN(Number(value)) ? value : Number(value) } : item
      )
    );
  };

  const mealTypes = [
    { key: 'breakfast', label: 'Завтрак' },
    { key: 'lunch', label: 'Обед' },
    { key: 'dinner', label: 'Ужин' },
    { key: 'snack', label: 'Перекус' },
  ] as const;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.lg }]}>
        КБЖУ по фото
      </Text>

      {/* Image area */}
      {imageUri ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} />
          <TouchableOpacity
            style={[styles.retakeBtn, { backgroundColor: colors.surface }]}
            onPress={() => { setImageUri(null); setRecognizedItems([]); }}
          >
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Переснять</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.huge }}>
          <Text style={{ fontSize: 64, marginBottom: spacing.lg }}>📷</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl }]}>
            Сфотографируй еду или загрузи из галереи
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button title="Камера" onPress={() => pickImage(true)} />
            <Button title="Галерея" variant="outline" onPress={() => pickImage(false)} />
          </View>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center' }}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            Анализирую фото...
          </Text>
        </Card>
      )}

      {/* Results */}
      {recognizedItems.length > 0 && (
        <>
          {/* Meal type selector */}
          <View style={styles.mealTypeRow}>
            {mealTypes.map((mt) => (
              <TouchableOpacity
                key={mt.key}
                onPress={() => setMealType(mt.key)}
                style={[
                  styles.mealTypeBtn,
                  {
                    backgroundColor: mealType === mt.key ? colors.primary : colors.surface,
                    borderColor: mealType === mt.key ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.captionMedium,
                    { color: mealType === mt.key ? '#FFF' : colors.text },
                  ]}
                >
                  {mt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recognized items */}
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Распознано:
          </Text>
          {recognizedItems.map((item, index) => (
            <Card key={item.id} style={{ marginBottom: spacing.md }}>
              <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.sm }]}>
                {item.name}
              </Text>
              <View style={styles.nutritionRow}>
                <View style={styles.nutritionCell}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Ккал</Text>
                  <Text style={[typography.bodyMedium, { color: colors.calories }]}>{item.calories}</Text>
                </View>
                <View style={styles.nutritionCell}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Белки</Text>
                  <Text style={[typography.bodyMedium, { color: colors.protein }]}>{item.protein}г</Text>
                </View>
                <View style={styles.nutritionCell}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Жиры</Text>
                  <Text style={[typography.bodyMedium, { color: colors.fats }]}>{item.fats}г</Text>
                </View>
                <View style={styles.nutritionCell}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Углев.</Text>
                  <Text style={[typography.bodyMedium, { color: colors.carbs }]}>{item.carbs}г</Text>
                </View>
                <View style={styles.nutritionCell}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Вес</Text>
                  <Text style={[typography.bodyMedium, { color: colors.text }]}>{item.weightGrams}г</Text>
                </View>
              </View>
            </Card>
          ))}

          {/* Total */}
          <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '10' }}>
            <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.sm }]}>
              Итого:
            </Text>
            <View style={styles.nutritionRow}>
              <View style={styles.nutritionCell}>
                <Text style={[typography.numberSmall, { color: colors.calories }]}>
                  {recognizedItems.reduce((s, i) => s + i.calories, 0)}
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>ккал</Text>
              </View>
              <View style={styles.nutritionCell}>
                <Text style={[typography.numberSmall, { color: colors.protein }]}>
                  {recognizedItems.reduce((s, i) => s + i.protein, 0)}г
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>белки</Text>
              </View>
              <View style={styles.nutritionCell}>
                <Text style={[typography.numberSmall, { color: colors.fats }]}>
                  {Math.round(recognizedItems.reduce((s, i) => s + i.fats, 0) * 10) / 10}г
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>жиры</Text>
              </View>
              <View style={styles.nutritionCell}>
                <Text style={[typography.numberSmall, { color: colors.carbs }]}>
                  {recognizedItems.reduce((s, i) => s + i.carbs, 0)}г
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>углев.</Text>
              </View>
            </View>
          </Card>

          <Button
            title="Сохранить в дневник"
            onPress={handleSave}
            fullWidth
            size="lg"
          />
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  imageContainer: { marginBottom: spacing.lg, borderRadius: borderRadius.lg, overflow: 'hidden' },
  image: { width: '100%', height: 250, borderRadius: borderRadius.lg },
  retakeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  mealTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  mealTypeBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutritionCell: {
    alignItems: 'center',
  },
});
