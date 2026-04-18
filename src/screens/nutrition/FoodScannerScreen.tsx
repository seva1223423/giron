import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, useWindowDimensions } from 'react-native';
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
import { scheduleNutritionSummaryReminder, scheduleProteinReminder } from '../../services/notificationService';
import { BarcodeScannerModal, RecognizedItemCard } from './scanner';
import { localDateStr } from '../../utils/date';

const todayDate = () => localDateStr(new Date());

// ─── Barcode cache ────────────────────────────────────────────────────────────

const BARCODE_CACHE_KEY = 'iron_gym_barcode_cache';
const RECENT_SCANS_KEY = 'iron_gym_recent_scans';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BarcodeProduct { name: string; cal: number; prot: number; fats: number; carbs: number; }
interface RecentScan extends BarcodeProduct { barcode: string; }

async function getCachedProduct(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const raw = await AsyncStorage.getItem(BARCODE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entry = parsed[barcode];
    if (!entry) return null;
    if (entry.cachedAt && Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      // Stale — evict in background
      delete parsed[barcode];
      AsyncStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(parsed)).catch(() => {});
      return null;
    }
    return entry;
  } catch { return null; }
}

async function cacheProduct(barcode: string, product: BarcodeProduct) {
  try {
    const raw = await AsyncStorage.getItem(BARCODE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[barcode] = { ...product, cachedAt: Date.now() };
    const keys = Object.keys(parsed);
    if (keys.length > 200) {
      const sorted = keys.sort((a, b) => (parsed[a].cachedAt || 0) - (parsed[b].cachedAt || 0));
      sorted.slice(0, keys.length - 200).forEach((k) => delete parsed[k]);
    }
    await AsyncStorage.setItem(BARCODE_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

async function saveRecentScan(scan: RecentScan) {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SCANS_KEY);
    const scans: RecentScan[] = raw ? JSON.parse(raw) : [];
    const updated = [scan, ...scans.filter((s) => s.barcode !== scan.barcode)].slice(0, 5);
    await AsyncStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(updated));
  } catch {}
}

async function loadRecentScans(): Promise<RecentScan[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SCANS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ─── OpenFoodFacts helpers ────────────────────────────────────────────────────

/** Extract kcal/100g from nutriments (kcal only, no kJ conversion). */
function extractKcal(n: Record<string, any>): number {
  if (n['energy-kcal_100g'] != null && n['energy-kcal_100g'] > 0) return Math.round(n['energy-kcal_100g']);
  if (n['energy-kcal'] != null && n['energy-kcal'] > 0) return Math.round(n['energy-kcal']);
  return 0;
}

/** Parse serving size string like "100g", "30 g", "1 portion (45g)", "250ml". */
function parseServingGrams(servingSize: string): number | null {
  if (!servingSize) return null;
  const gMatch = servingSize.match(/(\d+(?:[.,]\d+)?)\s*g(?!\w)/i);
  if (gMatch) {
    const g = Math.round(parseFloat(gMatch[1].replace(',', '.')));
    if (g >= 5 && g <= 2000) return g;
  }
  const mlMatch = servingSize.match(/(\d+(?:[.,]\d+)?)\s*ml/i);
  if (mlMatch) {
    const ml = Math.round(parseFloat(mlMatch[1].replace(',', '.')));
    if (ml >= 5 && ml <= 500) return ml;
  }
  return null;
}

// ─── Meal type labels ─────────────────────────────────────────────────────────

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export const FoodScannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { height: screenHeight } = useWindowDimensions();
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { addMeal, getDayLog, savedFoods } = useNutritionStore();
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
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const lastBase64Ref = useRef<string>('');
  // Prevent double barcode scan consumption
  const barcodeProcessingRef = useRef(false);

  const { consumeFoodScan, foodScansLeft, isPremiumActive } = useSubscriptionStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [isBarcodeResult, setIsBarcodeResult] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [lastBarcode, setLastBarcode] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadRecentScans().then(setRecentScans);
    return () => { abortRef.current?.abort(); lastBase64Ref.current = ''; };
  }, []);

  // ─── AI photo analysis ──────────────────────────────────────────────────────

  const analyzeFood = async (base64: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    lastBase64Ref.current = base64;
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    setLoading(true);
    setError('');
    try {
      const result = await aiService.analyzeFood(base64, controller.signal);
      const items: NutritionItem[] = result.items.map((item: any, index: number) => ({
        id: `item-${Date.now()}-${index}`,
        name: item.name, calories: item.calories, protein: item.protein,
        fats: item.fats, carbs: item.carbs, weightGrams: item.weightGrams,
      }));
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
      if (items.length === 0) {
        setError('Продукты не распознаны. Попробуй сделать чёткое фото тарелки с едой.');
        setImageUri(null);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') {
        setError('Анализ отменён.');
        setImageUri(null);
        lastBase64Ref.current = '';
      } else if (e?.suggestion) {
        // 422: vision failed — server provides a helpful hint
        setError(e.suggestion);
      } else {
        setError(getApiError(e).message);
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setLoading(false);
    }
  };

  const cancelAnalysis = () => {
    abortRef.current?.abort();
    barcodeProcessingRef.current = false;
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
      if (!consumeFoodScan()) { setShowPaywall(true); return; }
      const base64 = result.assets[0].base64 || '';
      if (base64.length > 5_000_000) {
        setError('Изображение слишком большое. Выбери изображение поменьше.');
        return;
      }
      setImageUri(result.assets[0].uri);
      setError('');
      analyzeFood(base64);
    }
  };

  // ─── Barcode ────────────────────────────────────────────────────────────────

  const openBarcodeScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках устройства'); return; }
    }
    setBarcodeScanned(false);
    setError('');
    setShowBarcodeScanner(true);
  };

  const applyBarcodeProduct = (product: BarcodeProduct, defaultWeight?: number) => {
    const w = defaultWeight ?? 100;
    const item: NutritionItem = {
      id: `item-${Date.now()}-barcode`,
      name: product.name,
      calories: Math.round((product.cal * w) / 100),
      protein: Math.round(((product.prot * w) / 100) * 10) / 10,
      fats: Math.round(((product.fats * w) / 100) * 10) / 10,
      carbs: Math.round((product.carbs * w) / 100),
      weightGrams: w,
    };
    setItemBases({ [item.id]: { cal: product.cal, prot: product.prot, fats: product.fats, carbs: product.carbs } });
    setRecognizedItems([item]);
    setIsBarcodeResult(true);
    setNotFound(false);
    setShowBarcodeScanner(false);
  };

  const lookupBarcode = async (barcode: string) => {
    if (barcodeProcessingRef.current) return;
    barcodeProcessingRef.current = true;

    setLastBarcode(barcode);
    setNotFound(false);

    // Cache hit — free, no credit consumed
    const cached = await getCachedProduct(barcode);
    if (cached) {
      applyBarcodeProduct(cached);
      barcodeProcessingRef.current = false;
      return;
    }

    setBarcodeLoading(true);
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 10_000);

    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
        { signal: fetchController.signal },
      );
      const data = await response.json();

      if (data.status === 1 && data.product) {
        // Credit consumed only on success
        if (!consumeFoodScan()) {
          setShowBarcodeScanner(false);
          setBarcodeLoading(false);
          setShowPaywall(true);
          barcodeProcessingRef.current = false;
          return;
        }

        const p = data.product;
        const n: Record<string, any> = p.nutriments || {};
        const cal = extractKcal(n);
        const prot = Math.round((n.proteins_100g || 0) * 10) / 10;
        const fats = Math.round((n.fat_100g || 0) * 10) / 10;
        const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
        const productName: string = p.product_name_ru || p.product_name || p.brands || 'Неизвестный продукт';

        const product: BarcodeProduct = { name: productName, cal, prot, fats, carbs };
        const servingGrams = parseServingGrams(p.serving_size || p.serving_quantity || '');

        await cacheProduct(barcode, product);
        const scan: RecentScan = { barcode, ...product };
        await saveRecentScan(scan);
        loadRecentScans().then(setRecentScans);

        applyBarcodeProduct(product, servingGrams ?? undefined);
      } else {
        setShowBarcodeScanner(false);
        setNotFound(true);
        // No credit consumed — product not in database
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        Alert.alert('Тайм-аут', 'База продуктов не ответила. Попробуй ещё раз.', [
          { text: 'ОК', onPress: () => setBarcodeScanned(false) },
        ]);
      } else {
        Alert.alert('Ошибка', 'Не удалось получить данные.', [
          { text: 'ОК', onPress: () => setBarcodeScanned(false) },
        ]);
      }
    } finally {
      clearTimeout(fetchTimeout);
      setBarcodeLoading(false);
      barcodeProcessingRef.current = false;
    }
  };

  const handleBarcodeScan = (barcode: string) => {
    setBarcodeScanned(true);
    setManualBarcode('');
    lookupBarcode(barcode);
  };

  // ─── Items management ───────────────────────────────────────────────────────

  const updateItemWeight = useCallback((id: string, newWeight: string) => {
    const w = parseInt(newWeight, 10) || 0;
    if (w <= 0) return;
    const base = itemBases[id];
    if (!base) return;
    setRecognizedItems((prev) => prev.map((item) =>
      item.id === id
        ? {
            ...item, weightGrams: w,
            calories: Math.round((base.cal * w) / 100),
            protein: Math.round(((base.prot * w) / 100) * 10) / 10,
            fats: Math.round(((base.fats * w) / 100) * 10) / 10,
            carbs: Math.round((base.carbs * w) / 100),
          }
        : item,
    ));
  }, [itemBases]);

  const removeItem = useCallback((id: string) => {
    setRecognizedItems((prev) => prev.filter((item) => item.id !== id));
    setItemBases((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  const addSavedFoodItem = useCallback((food: NutritionItem) => {
    const id = `item-${Date.now()}-added`;
    const w = food.weightGrams || 100;
    setRecognizedItems((prev) => [...prev, { ...food, id }]);
    setItemBases((prev) => ({
      ...prev,
      [id]: {
        cal: (food.calories / w) * 100,
        prot: (food.protein / w) * 100,
        fats: (food.fats / w) * 100,
        carbs: (food.carbs / w) * 100,
      },
    }));
    setShowAddPanel(false);
  }, []);

  // ─── Save ───────────────────────────────────────────────────────────────────

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
    // Compute date at save time — handles midnight-boundary edge case
    addMeal(localDateStr(new Date()), meal);
    const calTarget = dayLog.targetCalories || 2000;
    const protTarget = dayLog.targetProtein || 150;
    const totalProteinSoFar = dayLog.meals.reduce((s, m) => s + m.totalProtein, 0) + totalProt;
    scheduleNutritionSummaryReminder(
      calTarget > 0 ? (alreadyEaten + totalCal) / calTarget : 0,
      protTarget > 0 ? totalProteinSoFar / protTarget : 0,
    ).catch(() => {});
    scheduleProteinReminder(totalProteinSoFar, protTarget).catch(() => {});
    navigation.goBack();
  };

  const totalCal = recognizedItems.reduce((s, i) => s + i.calories, 0);
  const manualDigits = manualBarcode.replace(/\D/g, '');

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <React.Fragment>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text }]}>КБЖУ по фото</Text>
          <View style={[styles.badge, { backgroundColor: (isPremiumActive() ? colors.accent : foodScansLeft() === 0 ? colors.error : colors.accent) + '15' }]}>
            <Text style={[typography.caption, { color: isPremiumActive() ? colors.accent : foodScansLeft() === 0 ? colors.error : colors.accent, fontWeight: '700' }]}>
              {isPremiumActive() ? '∞ Pro' : foodScansLeft() === 0 ? 'Лимит' : `${foodScansLeft()}/${FREE_LIMITS.FOOD_SCANS_PER_DAY}`} сканов
            </Text>
          </View>
        </View>

        {/* Photo or empty-state card */}
        {imageUri ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUri }} style={[styles.image, { height: Math.min(250, screenHeight * 0.3) }]} />
            <TouchableOpacity style={[styles.retakeBtn, { backgroundColor: colors.surface }]} onPress={() => { setImageUri(null); setRecognizedItems([]); setError(''); lastBase64Ref.current = ''; }}>
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
              <Button title="📷 Камера" onPress={() => pickImage(true)} style={{ flex: 1 }} />
              <Button title="Галерея" variant="outline" onPress={() => pickImage(false)} style={{ flex: 1 }} />
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
                maxLength={14}
                returnKeyType="search"
                onSubmitEditing={() => { if (manualDigits.length >= 8) handleBarcodeScan(manualDigits); }}
              />
              <TouchableOpacity
                onPress={() => { if (manualDigits.length >= 8) handleBarcodeScan(manualDigits); }}
                disabled={manualDigits.length < 8}
                style={{ paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: borderRadius.md, backgroundColor: manualDigits.length >= 8 ? colors.primary : colors.border }}
              >
                <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Найти</Text>
              </TouchableOpacity>
            </View>

            {/* Recent scans — quick re-use without camera */}
            {recentScans.length > 0 && (
              <View style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                  Недавние сканы:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {recentScans.map((scan) => (
                      <TouchableOpacity
                        key={scan.barcode}
                        onPress={() => applyBarcodeProduct(scan)}
                        style={[styles.recentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <Text style={[typography.captionMedium, { color: colors.text }]} numberOfLines={1}>
                          {scan.name.length > 22 ? scan.name.slice(0, 20) + '…' : scan.name}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>{scan.cal} ккал/100г</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </Card>
        )}

        {/* Analysis progress */}
        {loading && (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.xxl }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>ИИ анализирует фото...</Text>
            <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.xs }]}>Определяю продукты и рассчитываю КБЖУ</Text>
            <TouchableOpacity onPress={cancelAnalysis} style={{ marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Error / suggestion */}
        {!!error && (
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.error }}>
            <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
            <Button
              title="Попробовать снова"
              variant="outline"
              onPress={() => {
                if (lastBase64Ref.current) {
                  setError('');
                  analyzeFood(lastBase64Ref.current);
                } else {
                  setImageUri(null);
                  setError('');
                }
              }}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        )}

        {/* Barcode not found */}
        {notFound && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Продукт не найден</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Штрих-код {lastBarcode} не найден в базе данных.
            </Text>
            <Button title="Добавить вручную" onPress={() => navigation.navigate('ManualFoodAdd', { mealType: 'snack', date: todayDate() })} fullWidth />
            <TouchableOpacity style={{ marginTop: spacing.md, alignItems: 'center' }} onPress={() => { setNotFound(false); setShowBarcodeScanner(true); }}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Сканировать другой код</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Recognized items */}
        {recognizedItems.length > 0 && (
          <>
            {/* Meal type selector */}
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((mt) => (
                <TouchableOpacity
                  key={mt.key}
                  onPress={() => setMealType(mt.key)}
                  style={[styles.mealTypeBtn, { backgroundColor: mealType === mt.key ? colors.primary : colors.surface, borderColor: mealType === mt.key ? colors.primary : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: mealType === mt.key ? '#FFF' : colors.text }]}>{mt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Barcode source hint */}
            {isBarcodeResult && (
              <View style={[{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md }, { backgroundColor: colors.accent + '15' }]}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent + '18', borderWidth: 1, borderColor: colors.accent + '40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>i</Text>
                </View>
                <Text style={[typography.small, { color: colors.accent, flex: 1 }]}>
                  Данные из базы продуктов. При необходимости измените вес порции.
                </Text>
              </View>
            )}

            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Распознано:</Text>
            {recognizedItems.map((item) => (
              <RecognizedItemCard key={item.id} item={item} base={itemBases[item.id]} onWeightChange={updateItemWeight} onRemove={removeItem} />
            ))}

            {/* Add saved food panel */}
            <TouchableOpacity
              onPress={() => setShowAddPanel((v) => !v)}
              style={[styles.addMoreBtn, { borderColor: showAddPanel ? colors.primary : colors.border, backgroundColor: colors.surface }]}
            >
              <Text style={[typography.smallMedium, { color: showAddPanel ? colors.primary : colors.textSecondary }]}>
                {showAddPanel ? '− Свернуть' : '+ Добавить продукт'}
              </Text>
            </TouchableOpacity>

            {showAddPanel && (
              <Card style={{ marginBottom: spacing.md }}>
                {savedFoods.length === 0 ? (
                  <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.sm }]}>
                    Сохраняй продукты кнопкой + в карточке — они появятся здесь
                  </Text>
                ) : (
                  <>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                      Сохранённые продукты
                    </Text>
                    {savedFoods.slice(0, 15).map((food) => (
                      <TouchableOpacity
                        key={food.id}
                        onPress={() => addSavedFoodItem(food)}
                        style={[styles.savedFoodRow, { borderBottomColor: colors.border }]}
                      >
                        <Text style={[typography.smallMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>{food.name}</Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          {food.calories} ккал / {food.weightGrams}г
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </Card>
            )}

            {/* Totals */}
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

            {/* Remaining calories indicator */}
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
        onScan={handleBarcodeScan}
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
  mealTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, flexWrap: 'wrap' },
  mealTypeBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, borderWidth: 1, flex: 1 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  barcodeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, alignSelf: 'stretch' },
  manualInput: { height: 44, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, fontSize: 16 },
  recentChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, minWidth: 120, maxWidth: 180 },
  addMoreBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, alignItems: 'center', marginBottom: spacing.md },
  savedFoodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
