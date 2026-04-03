import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useThemeStore, useNutritionStore, useSubscriptionStore, FREE_LIMITS } from '../../store';
import { Button, Card, PaywallModal } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NutritionItem, Meal } from '../../types';
import { aiService, getApiError } from '../../services';
import { scheduleNutritionSummaryReminder } from '../../services/notificationService';

const todayDate = () => new Date().toISOString().split('T')[0];

export const FoodScannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { addMeal, getDayLog, saveFoodItem } = useNutritionStore();
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

  // Subscription gating
  const { consumeFoodScan, foodScansLeft, isPremiumActive } = useSubscriptionStore();
  const [showPaywall, setShowPaywall] = useState(false);

  // Barcode scanner
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    const allowed = consumeFoodScan();
    if (!allowed) { setShowPaywall(true); return; }

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

  const openBarcodeScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках устройства');
        return;
      }
    }
    setBarcodeScanned(false);
    setError('');
    setShowBarcodeScanner(true);
  };

  const lookupBarcode = async (barcode: string) => {
    const allowed = consumeFoodScan();
    if (!allowed) { setShowBarcodeScanner(false); setShowPaywall(true); return; }
    setBarcodeLoading(true);
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await response.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};
        const name = p.product_name_ru || p.product_name || p.abbreviated_product_name || 'Продукт';
        const cal = Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0);
        const prot = Math.round((n.proteins_100g || 0) * 10) / 10;
        const fats = Math.round((n.fat_100g || 0) * 10) / 10;
        const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
        const item: NutritionItem = {
          id: `item-${Date.now()}-barcode`,
          name,
          calories: cal,
          protein: prot,
          fats,
          carbs,
          weightGrams: 100,
        };
        setItemBases({ [item.id]: { cal, prot, fats, carbs } });
        setRecognizedItems([item]);
        setShowBarcodeScanner(false);
      } else {
        Alert.alert('Не найдено', 'Продукт не найден в базе данных.\nПопробуй другой штрих-код или добавь КБЖУ вручную.', [
          { text: 'ОК', onPress: () => setBarcodeScanned(false) },
        ]);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить данные. Проверь подключение к интернету.', [
        { text: 'ОК', onPress: () => setBarcodeScanned(false) },
      ]);
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleBarcodeScan = ({ data: barcode }: { data: string }) => {
    if (barcodeScanned || barcodeLoading) return;
    setBarcodeScanned(true);
    lookupBarcode(barcode);
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

  const removeItem = useCallback((id: string) => {
    setRecognizedItems((prev) => prev.filter((item) => item.id !== id));
    setItemBases((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleSave = () => {
    if (recognizedItems.length === 0) return;

    const totalCal = recognizedItems.reduce((s, i) => s + i.calories, 0);
    const totalProt = recognizedItems.reduce((s, i) => s + i.protein, 0);

    const meal: Meal = {
      id: `meal-${Date.now()}`,
      type: mealType,
      items: recognizedItems,
      photoUrl: imageUri || undefined,
      totalCalories: totalCal,
      totalProtein: totalProt,
      totalFats: recognizedItems.reduce((s, i) => s + i.fats, 0),
      totalCarbs: recognizedItems.reduce((s, i) => s + i.carbs, 0),
      createdAt: new Date().toISOString(),
    };

    addMeal(today, meal);

    // Update nutrition summary notification for today
    const calTarget = dayLog.targetCalories || 2000;
    const protTarget = dayLog.targetProtein || 150;
    scheduleNutritionSummaryReminder(
      calTarget > 0 ? (alreadyEaten + totalCal) / calTarget : 0,
      protTarget > 0 ? (dayLog.meals.reduce((s, m) => s + m.totalProtein, 0) + totalProt) / protTarget : 0,
    ).catch(() => {});

    navigation.goBack();
  };

  const mealTypes = [
    { key: 'breakfast', label: 'Завтрак' },
    { key: 'lunch', label: 'Обед' },
    { key: 'dinner', label: 'Ужин' },
    { key: 'snack', label: 'Перекус' },
  ] as const;

  return (
    <React.Fragment>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text }]}>
          КБЖУ по фото
        </Text>
        {!isPremiumActive() && (
          <View style={[styles.scanCountBadge, { backgroundColor: foodScansLeft() === 0 ? colors.error + '20' : colors.accent + '15' }]}>
            <Text style={[typography.caption, { color: foodScansLeft() === 0 ? colors.error : colors.accent, fontWeight: '700' }]}>
              {foodScansLeft() === 0 ? 'Лимит' : `${foodScansLeft()}/${FREE_LIMITS.FOOD_SCANS_PER_DAY}`} сканов
            </Text>
          </View>
        )}
        {isPremiumActive() && (
          <View style={[styles.scanCountBadge, { backgroundColor: colors.accent + '15' }]}>
            <Text style={[typography.caption, { color: colors.accent, fontWeight: '700' }]}>∞ Pro</Text>
          </View>
        )}
      </View>

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
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <Button title="📷 Камера" onPress={() => pickImage(true)} />
            <Button title="Галерея" variant="outline" onPress={() => pickImage(false)} />
          </View>
          <TouchableOpacity
            onPress={openBarcodeScanner}
            style={[styles.barcodeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={{ fontSize: 22 }}>📦</Text>
            <View style={{ marginLeft: spacing.sm }}>
              <Text style={[typography.smallMedium, { color: colors.text }]}>Сканировать штрих-код</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Для упакованных продуктов</Text>
            </View>
          </TouchableOpacity>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => removeItem(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={[styles.deleteItemBtn, { backgroundColor: colors.error + '15', borderColor: colors.error + '40' }]}>
                      <Text style={{ fontSize: 12, color: colors.error, fontWeight: '700' }}>✕</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const base = itemBases[item.id];
                      saveFoodItem({
                        ...item,
                        id: `saved-${item.name.replace(/\s/g, '-').toLowerCase()}`,
                        calories: base ? Math.round(base.cal) : item.calories,
                        protein: base ? Math.round(base.prot * 10) / 10 : item.protein,
                        fats: base ? Math.round(base.fats * 10) / 10 : item.fats,
                        carbs: base ? Math.round(base.carbs * 10) / 10 : item.carbs,
                        weightGrams: 100,
                      });
                      Alert.alert('Сохранено ⭐', `${item.name} добавлен в быстрые продукты`);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 18 }}>⭐</Text>
                  </TouchableOpacity>
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

    <PaywallModal
      visible={showPaywall}
      onClose={() => setShowPaywall(false)}
      reason="food_scan_limit"
      navigation={navigation}
    />

    {/* Barcode scanner modal */}
    <Modal visible={showBarcodeScanner} animationType="slide" statusBarTranslucent>
      <View style={[styles.barcodeModal, { backgroundColor: '#000' }]}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
          onBarcodeScanned={handleBarcodeScan}
          facing="back"
        />
        {/* Overlay */}
        <View style={styles.barcodeOverlay}>
          <View style={[styles.barcodeTopArea, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <TouchableOpacity
              onPress={() => setShowBarcodeScanner(false)}
              style={[styles.barcodeCloseBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
            >
              <Text style={{ color: '#FFF', fontSize: 16 }}>✕  Закрыть</Text>
            </TouchableOpacity>
            <Text style={[typography.body, { color: '#FFF', textAlign: 'center', marginTop: spacing.sm }]}>
              Направь камеру на штрих-код продукта
            </Text>
          </View>

          {/* Scan frame */}
          <View style={styles.scanFrame}>
            <View style={[styles.scanCorner, styles.scanCornerTL]} />
            <View style={[styles.scanCorner, styles.scanCornerTR]} />
            <View style={[styles.scanCorner, styles.scanCornerBL]} />
            <View style={[styles.scanCorner, styles.scanCornerBR]} />
          </View>

          <View style={[styles.barcodeBottomArea, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            {barcodeLoading ? (
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <ActivityIndicator color="#FFF" />
                <Text style={[typography.small, { color: '#FFF' }]}>Ищем продукт в базе данных...</Text>
              </View>
            ) : (
              <Text style={[typography.small, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>
                EAN-13 / EAN-8 / UPC / Code 128
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
    </React.Fragment>
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
  scanCountBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  barcodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  barcodeModal: { flex: 1 },
  barcodeOverlay: { flex: 1 },
  barcodeTopArea: {
    paddingTop: 56,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  barcodeCloseBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  scanFrame: {
    flex: 1,
    margin: spacing.xl * 2,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#FFF',
  },
  scanCornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  scanCornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  scanCornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  scanCornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  barcodeBottomArea: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  deleteItemBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
