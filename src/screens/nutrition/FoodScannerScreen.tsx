import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore, useNutritionStore } from '../../store';
import { Button, Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NutritionItem, Meal } from '../../types';
import { aiService, getApiError } from '../../services';

const todayDate = () => new Date().toISOString().split('T')[0];

export const FoodScannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { addMeal, getDayLog } = useNutritionStore();
  const today = todayDate();
  const dayLog = getDayLog(today);
  const alreadyEaten = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recognizedItems, setRecognizedItems] = useState<NutritionItem[]>([]);
  // Per-item base values (per 100g) for proportional recalculation
  const [itemBases, setItemBases] = useState<Record<string, { cal: number; prot: number; fats: number; carbs: number }>>({});
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [error, setError] = useState('');

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
      setError('');
      analyzeFood(result.assets[0].base64 || '');
    }
  };

  const analyzeFood = async (base64: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await aiService.analyzeFood(base64);

      const items: NutritionItem[] = result.items.map((item, index) => ({
        id: `item-${Date.now()}-${index}`,
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        fats: item.fats,
        carbs: item.carbs,
        weightGrams: item.weightGrams,
      }));

      // Store per-100g base so we can recalculate when weight is changed
      const bases: typeof itemBases = {};
      items.forEach((item) => {
        const w = item.weightGrams || 100;
        bases[item.id] = {
          cal: (item.calories / w) * 100,
          prot: (item.protein / w) * 100,
          fats: (item.fats / w) * 100,
          carbs: (item.carbs / w) * 100,
        };
      });
      setItemBases(bases);
      setRecognizedItems(items);
    } catch (e) {
      const apiError = getApiError(e);
      setError(
        apiError.status === 0
          ? 'Нет подключения к серверу. Проверь, что сервер запущен.'
          : apiError.message
      );
    } finally {
      setLoading(false);
    }
  };

  const updateItemWeight = useCallback((id: string, newWeight: string) => {
    const w = parseInt(newWeight) || 0;
    if (w <= 0) return;
    const base = itemBases[id];
    if (!base) return;
    setRecognizedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              weightGrams: w,
              calories: Math.round((base.cal * w) / 100),
              protein: Math.round((base.prot * w) / 100),
              fats: Math.round((base.fats * w) / 100 * 10) / 10,
              carbs: Math.round((base.carbs * w) / 100),
            }
          : item
      )
    );
  }, [itemBases]);

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

    addMeal(today, meal);
    navigation.goBack();
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
            onPress={() => { setImageUri(null); setRecognizedItems([]); setError(''); }}
          >
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Переснять</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.huge }}>
          <Text style={{ fontSize: 64, marginBottom: spacing.lg }}>📷</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl }]}>
            Сфотографируй еду или загрузи из галереи{'\n'}
            ИИ определит продукты и рассчитает КБЖУ
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Button title="Камера" onPress={() => pickImage(true)} />
            <Button title="Галерея" variant="outline" onPress={() => pickImage(false)} />
          </View>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.xxl }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
            ИИ анализирует фото...
          </Text>
          <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.xs }]}>
            Определяю продукты и рассчитываю КБЖУ
          </Text>
        </Card>
      )}

      {/* Error */}
      {error ? (
        <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.error }}>
          <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
          <Button
            title="Попробовать снова"
            variant="outline"
            onPress={() => { setImageUri(null); setError(''); }}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

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
          {recognizedItems.map((item) => (
            <Card key={item.id} style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>{item.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TextInput
                    style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                    value={item.weightGrams?.toString() ?? ''}
                    onChangeText={(v) => updateItemWeight(item.id, v)}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                  <Text style={[typography.small, { color: colors.textSecondary }]}>г</Text>
                </View>
              </View>
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

          {dayLog.targetCalories > 0 && (() => {
            const mealCal = recognizedItems.reduce((s, i) => s + i.calories, 0);
            const afterMeal = alreadyEaten + mealCal;
            const remaining = dayLog.targetCalories - afterMeal;
            return (
              <View style={[{ padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.lg }, { backgroundColor: remaining >= 0 ? colors.success + '15' : colors.error + '15' }]}>
                <Text style={[typography.small, { color: remaining >= 0 ? colors.success : colors.error }]}>
                  После этого приёма: {afterMeal} / {dayLog.targetCalories} ккал
                  {' '}({remaining >= 0 ? `остаток ${remaining}` : `превышение ${Math.abs(remaining)}`} ккал)
                </Text>
              </View>
            );
          })()}

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
  weightInput: {
    width: 56,
    height: 32,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});
