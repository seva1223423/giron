import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore, useNutritionStore, useSubscriptionStore, FREE_LIMITS } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { Button, Card, PaywallModal } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { NutritionItem, Meal } from '../../types';
import { aiService, getApiError } from '../../services';
import { scheduleNutritionSummaryReminder } from '../../services/notificationService';
import { BarcodeScannerModal, RecognizedItemCard } from './scanner';

const todayDate = () => new Date().toISOString().split('T')[0];
const todayDateStr = () => new Date().toISOString().split('T')[0];

// Barcode cache helpers
const BARCODE_CACHE_KEY = 'iron_gym_barcode_cache';

async function getCachedProduct(barcode: string) {
  try {
    const cache = await AsyncStorage.getItem(BARCODE_CACHE_KEY);
    if (!cache) return null;
    const parsed = JSON.parse(cache);
    return parsed[barcode] || null;
  } catch { return null; }
}

async function cacheProduct(barcode: string, product: any) {
  try {
    const cache = await AsyncStorage.getItem(BARCODE_CACHE_KEY);
    const parsed = cache ? JSON.parse(cache) : {};
    parsed[barcode] = { ...product, cachedAt: Date.now() };
    // Keep max 200 cached products
    const keys = Object.keys(parsed);
    if (keys.length > 200) {
      const sorted = keys.sort((a, b) => (parsed[a].cachedAt || 0) - (parsed[b].cachedAt || 0));
      sorted.slice(0, keys.length - 200).forEach(k => delete parsed[k]);
    }
    await AsyncStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
] as const;

export const FoodScannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { addMeal, getDayLog } = useNutritionStore();
  const today = todayDate();
  const dayLog = getDayLog(today);
  const alreadyEaten = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recognizedItems, setRecognizedItems] = useState<NutritionItem[]>([]);
  const [itemBases, setItemBases] = useState<Record<string, { cal: number; prot: number; fats: number; carbs: number }>>({});
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [error, setError] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);

  const { consumeFoodScan, foodScansLeft, isPremiumActive } = useSubscriptionStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [isBarcodeResult, setIsBarcodeResult] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lastBarcode, setLastBarcode] = useState('');
  const [notFound, setNotFound] = useState(false);

  const analyzeFood = async (base64: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await aiService.analyzeFood(base64);
      const items: NutritionItem[] = result.items.map((item: any, index: number) => ({
        id: `item-${Date.now()}-${index}`,
        name: item.name, calories: item.calories, protein: item.protein,
        fats: item.fats, carbs: item.carbs, weightGrams: item.weightGrams,
      }));
      const bases: typeof itemBases = {};
      items.forEach((item) => {
        const w = item.weightGrams || 100;
        bases[item.id] = { cal: (item.calories / w) * 100, prot: (item.protein / w) * 100, fats: (item.fats / w) * 100, carbs: (item.carbs / w) * 100 };
      });
      setItemBases(bases);
      setRecognizedItems(items);
    } catch (e) {
      const apiError = getApiError(e);
      setError(apiError.status === 0 ? 'Нет подключения к серверу. Проверь, что сервер запущен.' : apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (useCamera: boolean) => {
    if (foodScansLeft() === 0 && !isPremiumActive()) { setShowPaywall(true); return; }
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Нужен доступ', 'Разрешите доступ к камере/галерее в настройках'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });
    if (!result.canceled && result.assets[0]) {
      // Consume scan credit only after user actually picked an image
      if (!consumeFoodScan()) { setShowPaywall(true); return; }
      setImageUri(result.assets[0].uri);
      setError('');
      analyzeFood(result.assets[0].base64 || '');
    }
  };

  const openBarcodeScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках устройства'); return; }
    }
    setBarcodeScanned(false);
    setError('');
    setShowBarcodeScanner(true);
  };

  const applyBarcodeProduct = (product: { name: string; cal: number; prot: number; fats: number; carbs: number }) => {
    const item: NutritionItem = { id: `item-${Date.now()}-barcode`, name: product.name, calories: product.cal, protein: product.prot, fats: product.fats, carbs: product.carbs, weightGrams: 100 };
    setItemBases({ [item.id]: { cal: product.cal, prot: product.prot, fats: product.fats, carbs: product.carbs } });
    setRecognizedItems([item]);
    setIsBarcodeResult(true);
    setNotFound(false);
    setShowBarcodeScanner(false);
  };

  const lookupBarcode = async (barcode: string) => {
    setLastBarcode(barcode);
    setNotFound(false);

    // Check cache first
    const cached = await getCachedProduct(barcode);
    if (cached) {
      applyBarcodeProduct(cached);
      return;
    }

    if (!consumeFoodScan()) { setShowBarcodeScanner(false); setShowPaywall(true); return; }
    setBarcodeLoading(true);
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
      const data = await response.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};
        const cal = Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0);
        const prot = Math.round((n.proteins_100g || 0) * 10) / 10;
        const fats = Math.round((n.fat_100g || 0) * 10) / 10;
        const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
        const productName = p.product_name_ru || p.product_name || p.brands || 'Неизвестный продукт';
        const product = { name: productName, cal, prot, fats, carbs };
        await cacheProduct(barcode, product);
        applyBarcodeProduct(product);
      } else {
        setShowBarcodeScanner(false);
        setNotFound(true);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить данные.', [{ text: 'ОК', onPress: () => setBarcodeScanned(false) }]);
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleBarcodeScan = (barcode: string) => {
    setBarcodeScanned(true);
    setManualBarcode('');
    lookupBarcode(barcode);
  };

  const updateItemWeight = useCallback((id: string, newWeight: string) => {
    const w = parseInt(newWeight) || 0;
    if (w <= 0) return;
    const base = itemBases[id];
    if (!base) return;
    setRecognizedItems((prev) => prev.map((item) =>
      item.id === id ? { ...item, weightGrams: w, calories: Math.round((base.cal * w) / 100), protein: Math.round((base.prot * w) / 100), fats: Math.round((base.fats * w) / 100 * 10) / 10, carbs: Math.round((base.carbs * w) / 100) } : item
    ));
  }, [itemBases]);

  const removeItem = useCallback((id: string) => {
    setRecognizedItems((prev) => prev.filter((item) => item.id !== id));
    setItemBases((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  const handleSave = () => {
    if (recognizedItems.length === 0) return;
    const totalCal = recognizedItems.reduce((s, i) => s + i.calories, 0);
    const totalProt = recognizedItems.reduce((s, i) => s + i.protein, 0);
    const meal: Meal = {
      id: `meal-${Date.now()}`, type: mealType, items: recognizedItems, photoUrl: imageUri || undefined,
      totalCalories: totalCal, totalProtein: totalProt,
      totalFats: recognizedItems.reduce((s, i) => s + i.fats, 0),
      totalCarbs: recognizedItems.reduce((s, i) => s + i.carbs, 0),
      createdAt: new Date().toISOString(),
    };
    addMeal(today, meal);
    const calTarget = dayLog.targetCalories || 2000;
    const protTarget = dayLog.targetProtein || 150;
    scheduleNutritionSummaryReminder(
      calTarget > 0 ? (alreadyEaten + totalCal) / calTarget : 0,
      protTarget > 0 ? (dayLog.meals.reduce((s, m) => s + m.totalProtein, 0) + totalProt) / protTarget : 0,
    ).catch(() => {});
    navigation.goBack();
  };

  const totalCal = recognizedItems.reduce((s, i) => s + i.calories, 0);

  return (
    <React.Fragment>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text }]}>КБЖУ по фото</Text>
          <View style={[styles.badge, { backgroundColor: (isPremiumActive() ? colors.accent : foodScansLeft() === 0 ? colors.error : colors.accent) + '15' }]}>
            <Text style={[typography.caption, { color: isPremiumActive() ? colors.accent : foodScansLeft() === 0 ? colors.error : colors.accent, fontWeight: '700' }]}>
              {isPremiumActive() ? '∞ Pro' : foodScansLeft() === 0 ? 'Лимит' : `${foodScansLeft()}/${FREE_LIMITS.FOOD_SCANS_PER_DAY}`} сканов
            </Text>
          </View>
        </View>

        {imageUri ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUri }} style={styles.image} />
            <TouchableOpacity style={[styles.retakeBtn, { backgroundColor: colors.surface }]} onPress={() => { setImageUri(null); setRecognizedItems([]); setError(''); }}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Переснять</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.huge }}>
            <Text style={{ fontSize: 64, marginBottom: spacing.lg }}>📷</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl }]}>
              Сфотографируй еду или загрузи из галереи{'\n'}ИИ определит продукты и рассчитает КБЖУ
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
              <Button title="📷 Камера" onPress={() => pickImage(true)} />
              <Button title="Галерея" variant="outline" onPress={() => pickImage(false)} />
            </View>
            <TouchableOpacity onPress={openBarcodeScanner} style={[styles.barcodeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 22 }}>📦</Text>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[typography.smallMedium, { color: colors.text }]}>Сканировать штрих-код</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Для упакованных продуктов</Text>
              </View>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <TextInput
                style={[styles.manualInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text, flex: 1 }]}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                placeholder="Введите штрих-код вручную"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="numeric"
                maxLength={13}
              />
              <TouchableOpacity
                onPress={() => { if (manualBarcode.length >= 8) handleBarcodeScan(manualBarcode); }}
                disabled={manualBarcode.length < 8}
                style={{ paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: borderRadius.md, backgroundColor: manualBarcode.length >= 8 ? colors.primary : colors.border }}
              >
                <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Найти</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {loading && (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.xxl }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>ИИ анализирует фото...</Text>
            <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.xs }]}>Определяю продукты и рассчитываю КБЖУ</Text>
          </Card>
        )}

        {error ? (
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.error }}>
            <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
            <Button title="Попробовать снова" variant="outline" onPress={() => { setImageUri(null); setError(''); }} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        {notFound && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Продукт не найден</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Штрих-код {lastBarcode} не найден в базе данных.
            </Text>
            <Button title="Добавить вручную" onPress={() => navigation.navigate('ManualFoodAdd', { mealType: 'snack', date: todayDateStr() })} fullWidth />
            <TouchableOpacity style={{ marginTop: spacing.md, alignItems: 'center' }} onPress={() => { setNotFound(false); setShowBarcodeScanner(true); }}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Сканировать другой код</Text>
            </TouchableOpacity>
          </Card>
        )}

        {recognizedItems.length > 0 && (
          <>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((mt) => (
                <TouchableOpacity key={mt.key} onPress={() => setMealType(mt.key)} style={[styles.mealTypeBtn, { backgroundColor: mealType === mt.key ? colors.primary : colors.surface, borderColor: mealType === mt.key ? colors.primary : colors.border }]}>
                  <Text style={[typography.captionMedium, { color: mealType === mt.key ? '#FFF' : colors.text }]}>{mt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {isBarcodeResult && (
              <View style={[{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md }, { backgroundColor: colors.accent + '15' }]}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm }}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>i</Text></View>
                <Text style={[typography.small, { color: colors.accent, flex: 1 }]}>
                  КБЖУ указано на 100г. Измените вес в поле справа от названия продукта.
                </Text>
              </View>
            )}
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Распознано:</Text>
            {recognizedItems.map((item) => (
              <RecognizedItemCard key={item.id} item={item} base={itemBases[item.id]} onWeightChange={updateItemWeight} onRemove={removeItem} />
            ))}

            <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '10' }}>
              <Text style={[typography.bodySemibold, { color: colors.text, marginBottom: spacing.sm }]}>Итого:</Text>
              <View style={styles.nutritionRow}>
                {[
                  { label: 'ккал', value: String(recognizedItems.reduce((s, i) => s + i.calories, 0)), color: colors.calories },
                  { label: 'белки', value: `${recognizedItems.reduce((s, i) => s + i.protein, 0)}г`, color: colors.protein },
                  { label: 'жиры', value: `${Math.round(recognizedItems.reduce((s, i) => s + i.fats, 0) * 10) / 10}г`, color: colors.fats },
                  { label: 'углев.', value: `${recognizedItems.reduce((s, i) => s + i.carbs, 0)}г`, color: colors.carbs },
                ].map(({ label, value, color }) => (
                  <View key={label} style={{ alignItems: 'center' }}>
                    <Text style={[typography.numberSmall, { color }]}>{value}</Text>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {dayLog.targetCalories > 0 && (() => {
              const afterMeal = alreadyEaten + totalCal;
              const remaining = dayLog.targetCalories - afterMeal;
              return (
                <View style={[{ padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.lg }, { backgroundColor: remaining >= 0 ? colors.success + '15' : colors.error + '15' }]}>
                  <Text style={[typography.small, { color: remaining >= 0 ? colors.success : colors.error }]}>
                    После этого приёма: {afterMeal} / {dayLog.targetCalories} ккал ({remaining >= 0 ? `остаток ${remaining}` : `превышение ${Math.abs(remaining)}`} ккал)
                  </Text>
                </View>
              );
            })()}

            <Button title="Сохранить в дневник" onPress={handleSave} fullWidth size="lg" />
          </>
        )}
      </ScrollView>

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} reason="food_scan_limit" navigation={navigation} />
      <BarcodeScannerModal
        visible={showBarcodeScanner}
        loading={barcodeLoading}
        scanned={barcodeScanned}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={(barcode) => handleBarcodeScan(barcode)}
      />
    </React.Fragment>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  imageContainer: { marginBottom: spacing.lg, borderRadius: borderRadius.lg, overflow: 'hidden' },
  image: { width: '100%', height: 250, borderRadius: borderRadius.lg },
  retakeBtn: { position: 'absolute', top: spacing.md, right: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm },
  mealTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  mealTypeBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, borderWidth: 1 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  barcodeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
  manualInput: { height: 44, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, fontSize: 16 },
});
