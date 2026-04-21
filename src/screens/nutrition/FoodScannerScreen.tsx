import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, useWindowDimensions, Modal, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore, useNutritionStore, useSubscriptionStore, FREE_LIMITS } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useHaptic } from '../../hooks/useHaptic';
import { Button, Card, PaywallModal, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { NutritionItem, Meal } from '../../types';
import { aiService, getApiError } from '../../services';
import { scheduleNutritionSummaryReminder, scheduleProteinReminder } from '../../services/notificationService';
import { BarcodeScannerModal, RecognizedItemCard } from './scanner';
import { localDateStr } from '../../utils/date';
import {
  fingerprintBase64,
  flagSanity,
  extractKcal,
  parseServingGrams,
  defaultMealType,
  findSavedFoodMatch,
  buildBarcodeDisplayName,
  type SanityFlag,
} from '../../utils/foodScanner';

const todayDate = () => localDateStr(new Date());

// ─── Barcode cache ────────────────────────────────────────────────────────────

const BARCODE_CACHE_KEY = 'iron_gym_barcode_cache';
const RECENT_SCANS_KEY = 'iron_gym_recent_scans';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BarcodeProduct { name: string; cal: number; prot: number; fats: number; carbs: number; }
interface RecentScan extends BarcodeProduct { barcode: string; servingGrams?: number; }

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

// ─── AI scan result cache (AsyncStorage wrapper around the utility helpers) ───

const AI_SCAN_CACHE_KEY = 'iron_gym_ai_scan_cache';
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedAIResult {
  items: Array<{
    name: string;
    calories: number;
    protein: number;
    fats: number;
    carbs: number;
    weightGrams: number;
    confidence?: number;
  }>;
  cachedAt: number;
}

async function getCachedAIResult(fingerprint: string): Promise<CachedAIResult | null> {
  try {
    const raw = await AsyncStorage.getItem(AI_SCAN_CACHE_KEY);
    if (!raw) return null;
    const parsed: Record<string, CachedAIResult> = JSON.parse(raw);
    const entry = parsed[fingerprint];
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > AI_CACHE_TTL_MS) {
      delete parsed[fingerprint];
      AsyncStorage.setItem(AI_SCAN_CACHE_KEY, JSON.stringify(parsed)).catch(() => {});
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function cacheAIResult(fingerprint: string, items: CachedAIResult['items']): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AI_SCAN_CACHE_KEY);
    const parsed: Record<string, CachedAIResult> = raw ? JSON.parse(raw) : {};
    parsed[fingerprint] = { items, cachedAt: Date.now() };
    // Evict oldest when we hit 50 entries — AI payloads are larger than barcode
    // entries and 50 is already ~50 meals of memory pressure.
    const keys = Object.keys(parsed);
    if (keys.length > 50) {
      const sorted = keys.sort((a, b) => (parsed[a].cachedAt || 0) - (parsed[b].cachedAt || 0));
      sorted.slice(0, keys.length - 50).forEach((k) => delete parsed[k]);
    }
    await AsyncStorage.setItem(AI_SCAN_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    /* non-fatal */
  }
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
] as const;

// ─── Image compression ───────────────────────────────────────────────────────

const MAX_IMAGE_SIDE = 1280;
const COMPRESS_QUALITY = 0.82;

async function compressImageForUpload(uri: string): Promise<{ base64: string; mimeType: string }> {
  // Get original size to decide whether to constrain width or height
  const info = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
  const { width: w, height: h } = info;
  const resize = w > h
    ? { width: Math.min(w, MAX_IMAGE_SIDE) }
    : { height: Math.min(h, MAX_IMAGE_SIDE) };
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize }],
    { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return { base64: result.base64 ?? '', mimeType: 'image/jpeg' };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export const FoodScannerScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { height: screenHeight } = useWindowDimensions();
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addMeal, getDayLog, savedFoods, dailyLog } = useNutritionStore();
  const today = todayDate();
  const dayLog = getDayLog(today);
  const alreadyEaten = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);

  /** Most recent meals from today/yesterday that can be one-tap repeated.
   *  Dedupes by first-item name so three logs of "куриная грудка" collapse
   *  to a single chip. Caps at 3 to keep the empty-state card tidy. */
  const recentMealChips = React.useMemo(() => {
    const now = new Date();
    const yday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const keys = [localDateStr(now), localDateStr(yday)];
    const all: Array<{ meal: Meal; date: string }> = [];
    for (const k of keys) {
      const day = dailyLog[k];
      if (day?.meals) for (const m of day.meals) all.push({ meal: m, date: k });
    }
    // Newest first by createdAt
    all.sort((a, b) => (b.meal.createdAt || '').localeCompare(a.meal.createdAt || ''));
    const seen = new Set<string>();
    const out: Array<{ meal: Meal; date: string }> = [];
    for (const entry of all) {
      const key = entry.meal.items[0]?.name?.toLowerCase() || entry.meal.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
      if (out.length >= 3) break;
    }
    return out;
  }, [dailyLog]);

  const repeatMeal = useCallback((src: Meal) => {
    haptic.medium();
    // Clone the meal's items with fresh ids; reuse the bases for weight scaling.
    const items: NutritionItem[] = src.items.map((it, i) => ({
      ...it,
      id: `item-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
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
    setIsBarcodeResult(false);
    setSanityFlags([]);
    setTotalWeightDraft(String(items.reduce((s, i) => s + (i.weightGrams || 0), 0)));
    setError('');
    // Skip image / loading — we're not analysing anything, just re-seeding state.
  }, [haptic]);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recognizedItems, setRecognizedItems] = useState<NutritionItem[]>([]);
  const [itemBases, setItemBases] = useState<Record<string, { cal: number; prot: number; fats: number; carbs: number }>>({});
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(defaultMealType);
  const [error, setError] = useState('');
  const [errorRetryable, setErrorRetryable] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  // Full-size image preview on tap — the thumbnail is small and users want
  // to double-check what they actually photographed before trusting the AI.
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  // Draft for the "scale all portions" total-weight input
  const [totalWeightDraft, setTotalWeightDraft] = useState('');
  // Sanity flags set after analyzeFood — triggers the implausible-values banner
  const [sanityFlags, setSanityFlags] = useState<SanityFlag[]>([]);
  // Whether the last AI result came from local cache (hint to the user + no credit burned)
  const [cachedResult, setCachedResult] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastBase64Ref = useRef<string>('');
  const lastMimeRef = useRef<string>('image/jpeg');
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

  const applyAIItems = (rawItems: CachedAIResult['items']) => {
    const items: NutritionItem[] = rawItems.map((raw, index) => {
      // Prefer user's saved macros when the AI-recognised name is one the
      // user has previously added — their data is higher trust than the
      // AI's per-image estimate. We keep the AI's weight guess and scale
      // the saved per-100g values to it.
      const match = findSavedFoodMatch(savedFoods, raw.name);
      const w = raw.weightGrams || 100;
      if (match) {
        const mw = match.weightGrams || 100;
        return {
          id: `item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
          name: match.name,
          calories: Math.round((match.calories * w) / mw),
          protein: Math.round(((match.protein * w) / mw) * 10) / 10,
          fats: Math.round(((match.fats * w) / mw) * 10) / 10,
          carbs: Math.round(((match.carbs * w) / mw) * 10) / 10,
          weightGrams: w,
          confidence: 1, // user-sourced data, full confidence
        };
      }
      return {
        id: `item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
        name: raw.name, calories: raw.calories, protein: raw.protein,
        fats: raw.fats, carbs: raw.carbs, weightGrams: raw.weightGrams,
        confidence: raw.confidence,
      };
    });
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
    setIsBarcodeResult(false);
    setSanityFlags(flagSanity(items));
    setTotalWeightDraft(String(items.reduce((s, i) => s + (i.weightGrams || 0), 0)));
    return items;
  };

  const analyzeFood = async (base64: string, mimeType = 'image/jpeg') => {
    const controller = new AbortController();
    abortRef.current = controller;
    lastBase64Ref.current = base64;
    lastMimeRef.current = mimeType;
    const timeoutId = setTimeout(() => controller.abort(), 50_000);

    setLoading(true);
    setError('');
    setSanityFlags([]);

    // Cache hit — same photo was already analysed within 24h. Return instantly,
    // don't burn a credit, don't hit the network.
    const fingerprint = fingerprintBase64(base64);
    const cached = await getCachedAIResult(fingerprint);
    if (cached) {
      const items = applyAIItems(cached.items);
      setCachedResult(true);
      lastBase64Ref.current = '';
      setLoading(false);
      clearTimeout(timeoutId);
      if (items.length > 0) haptic.success();
      return;
    }
    setCachedResult(false);

    try {
      const result = await aiService.analyzeFood(base64, controller.signal, mimeType);
      const items = applyAIItems(result.items);
      if (items.length === 0) {
        setError('Продукты не распознаны. Попробуй сделать чёткое фото тарелки с едой, или просканируй штрих-код упаковки.');
        setImageUri(null);
        haptic.warning();
      } else {
        // Cache the successful result by the image fingerprint — next re-scan is free.
        cacheAIResult(fingerprint, result.items).catch(() => {});
        // Release the ~5-7MB base64 — retry is only meaningful on error paths.
        lastBase64Ref.current = '';
        haptic.success();
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') {
        setError('Анализ отменён.');
        setImageUri(null);
        lastBase64Ref.current = '';
      } else if (e?.response?.status === 402) {
        // Server quota exceeded (e.g. scanned on another device) — show paywall
        setImageUri(null);
        lastBase64Ref.current = '';
        setShowPaywall(true);
        haptic.warning();
      } else if (e?.suggestion) {
        setError(e.suggestion);
        setErrorRetryable(e?.retryable !== false);
        haptic.error();
      } else {
        setError(getApiError(e).message);
        setErrorRetryable(true);
        haptic.error();
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
    haptic.selection();
    if (foodScansLeft() === 0 && !isPremiumActive()) { setShowPaywall(true); haptic.warning(); return; }
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Нужен доступ', 'Разрешите доступ к камере/галерее в настройках'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.9, base64: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.9, base64: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setError('');
      setLoading(true);
      haptic.light();
      try {
        // Resize to max 1280px and convert to JPEG — reduces payload 4-10x vs raw HEIC/PNG
        const compressed = await compressImageForUpload(asset.uri);
        if (!compressed.base64) {
          setImageUri(null);
          setError('Не удалось обработать изображение. Попробуй ещё раз.');
          setLoading(false);
          return;
        }
        // Server rejects base64 strings > 9MB — reject early on client to avoid opaque 400 error
        if (compressed.base64.length > 9_000_000) {
          setImageUri(null);
          setError('Фото слишком большое. Попробуй более близкий кадр или другое изображение.');
          setLoading(false);
          return;
        }
        // Consume credit only after successful compression — failed compression must not deduct a scan
        if (!isPremiumActive() && !consumeFoodScan()) {
          setImageUri(null);
          setLoading(false);
          setShowPaywall(true);
          return;
        }
        analyzeFood(compressed.base64, compressed.mimeType);
      } catch {
        setImageUri(null);
        setError('Не удалось обработать изображение.');
        setLoading(false);
      }
    }
  };

  // ─── Barcode ────────────────────────────────────────────────────────────────

  const openBarcodeScanner = async () => {
    haptic.selection();
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках устройства'); haptic.warning(); return; }
    }
    setBarcodeScanned(false);
    setError('');
    setShowBarcodeScanner(true);
  };

  const applyBarcodeProduct = (product: BarcodeProduct, defaultWeight?: number) => {
    const w = defaultWeight ?? 100;
    const item: NutritionItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-barcode`,
      name: product.name,
      calories: Math.round((product.cal * w) / 100),
      protein: Math.round(((product.prot * w) / 100) * 10) / 10,
      fats: Math.round(((product.fats * w) / 100) * 10) / 10,
      carbs: Math.round(((product.carbs * w) / 100) * 10) / 10,
      weightGrams: w,
    };
    setItemBases({ [item.id]: { cal: product.cal, prot: product.prot, fats: product.fats, carbs: product.carbs } });
    setRecognizedItems([item]);
    setIsBarcodeResult(true);
    setError('');
    setNotFound(false);
    setShowBarcodeScanner(false);
    setSanityFlags(flagSanity([item]));
    setTotalWeightDraft(String(w));
    haptic.success();
  };

  const lookupBarcode = async (barcode: string) => {
    if (barcodeProcessingRef.current) return;
    barcodeProcessingRef.current = true;

    setLastBarcode(barcode);
    setNotFound(false);
    setError('');

    // Cache hit — free, no credit consumed
    const cached = await getCachedProduct(barcode);
    if (cached) {
      applyBarcodeProduct(cached);
      barcodeProcessingRef.current = false;
      return;
    }

    setBarcodeLoading(true);
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 15_000);

    // Request only the fields we need to reduce payload size
    const OFF_FIELDS = 'product_name,product_name_ru,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';

    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}&lc=ru`,
        { signal: fetchController.signal },
      );
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const p = data.product;
        const n: Record<string, any> = p.nutriments || {};
        const cal = extractKcal(n);
        const prot = Math.round((n.proteins_100g || 0) * 10) / 10;
        const fats = Math.round((n.fat_100g || 0) * 10) / 10;
        const carbs = Math.round((n.carbohydrates_100g || 0) * 10) / 10;
        const productName = buildBarcodeDisplayName({
          product_name: p.product_name,
          product_name_ru: p.product_name_ru,
          product_name_en: p.product_name_en,
          brands: p.brands,
          quantity: p.quantity,
        });

        // Skip products with no usable nutrition data — don't charge a scan
        if (cal === 0 && prot === 0 && fats === 0 && carbs === 0) {
          setShowBarcodeScanner(false);
          setNotFound(true);
          return;
        }

        // Credit consumed only when we have actual nutrition data to return
        if (!isPremiumActive() && !consumeFoodScan()) {
          setShowBarcodeScanner(false);
          setShowPaywall(true);
          return;
        }

        const product: BarcodeProduct = { name: productName, cal, prot, fats, carbs };
        const servingGrams = parseServingGrams(p.serving_size || p.serving_quantity || '');

        await cacheProduct(barcode, product);
        const scan: RecentScan = { barcode, ...product, ...(servingGrams ? { servingGrams } : {}) };
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
        ], { cancelable: false });
      } else {
        Alert.alert('Ошибка', 'Не удалось получить данные.', [
          { text: 'ОК', onPress: () => setBarcodeScanned(false) },
        ], { cancelable: false });
      }
    } finally {
      clearTimeout(fetchTimeout);
      setBarcodeLoading(false);
      barcodeProcessingRef.current = false;
    }
  };

  const handleBarcodeScan = (barcode: string) => {
    haptic.medium();
    setBarcodeScanned(true);
    setManualBarcode('');
    lookupBarcode(barcode);
  };

  // ─── Items management ───────────────────────────────────────────────────────

  const updateItemWeight = useCallback((id: string, newWeight: string) => {
    const w = parseFloat(newWeight.replace(',', '.')) || 0;
    if (w <= 0 || w > 5000) return;
    const base = itemBases[id];
    if (!base) return;
    setRecognizedItems((prev) => prev.map((item) =>
      item.id === id
        ? {
            ...item, weightGrams: w,
            calories: Math.round((base.cal * w) / 100),
            protein: Math.round(((base.prot * w) / 100) * 10) / 10,
            fats: Math.round(((base.fats * w) / 100) * 10) / 10,
            carbs: Math.round(((base.carbs * w) / 100) * 10) / 10,
          }
        : item,
    ));
  }, [itemBases]);

  const removeItem = useCallback((id: string) => {
    haptic.medium();
    setRecognizedItems((prev) => prev.filter((item) => item.id !== id));
    setItemBases((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }, [haptic]);

  /** Rename a recognized item — lets the user correct AI misidentifications
   *  (e.g. AI said "рис", user knows it's actually "плов"). */
  const renameItem = useCallback((id: string, newName: string) => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed) return;
    setRecognizedItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: trimmed } : i)));
  }, []);

  /** Scale all items proportionally so the combined weight equals `totalG`.
   *  Use case: AI guessed the plate was 350g, but scale says 500g — one tap
   *  corrects every item's macros instead of editing each row manually. */
  const scaleAllPortions = useCallback(() => {
    const target = parseFloat(totalWeightDraft.replace(',', '.')) || 0;
    if (target <= 0 || target > 10000) {
      haptic.warning();
      return;
    }
    const currentTotal = recognizedItems.reduce((s, i) => s + (i.weightGrams || 0), 0);
    if (currentTotal === 0) return;
    const factor = target / currentTotal;
    setRecognizedItems((prev) => prev.map((item) => {
      const base = itemBases[item.id];
      const newW = Math.max(1, Math.round((item.weightGrams || 0) * factor));
      if (!base) return { ...item, weightGrams: newW };
      return {
        ...item,
        weightGrams: newW,
        calories: Math.round((base.cal * newW) / 100),
        protein: Math.round(((base.prot * newW) / 100) * 10) / 10,
        fats: Math.round(((base.fats * newW) / 100) * 10) / 10,
        carbs: Math.round(((base.carbs * newW) / 100) * 10) / 10,
      };
    }));
    haptic.success();
  }, [totalWeightDraft, recognizedItems, itemBases, haptic]);

  const addSavedFoodItem = useCallback((food: NutritionItem) => {
    const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-added`;
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
    haptic.success();
    const totalCal = Math.round(recognizedItems.reduce((s, i) => s + i.calories, 0));
    const totalProt = Math.round(recognizedItems.reduce((s, i) => s + i.protein, 0) * 10) / 10;
    const ts = Date.now();
    // photoUrl is intentionally not set: the image picker gives us a file:// URI
    // that won't survive an app reinstall, the server only accepts HTTPS URLs (so it
    // never syncs up), and no UI component actually renders the meal's own image
    // right now. Storing the URI locally would only produce orphaned references.
    const meal: Meal = {
      id: `meal-${ts}-${Math.random().toString(36).slice(2, 7)}`, type: mealType, items: recognizedItems,
      totalCalories: totalCal, totalProtein: totalProt,
      totalFats: Math.round(recognizedItems.reduce((s, i) => s + i.fats, 0) * 10) / 10,
      totalCarbs: Math.round(recognizedItems.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
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
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptic.selection(); setImagePreviewOpen(true); }}>
              <Image source={{ uri: imageUri }} style={[styles.image, { height: Math.min(250, screenHeight * 0.3) }]} />
              <View style={styles.zoomHint}>
                <Text style={{ fontSize: 14, color: '#FFF' }}>⤢</Text>
              </View>
            </TouchableOpacity>
            {cachedResult && (
              <View style={[styles.cachedBadge, { backgroundColor: colors.success + '20', borderColor: colors.success + '60' }]}>
                <Text style={[typography.caption, { color: colors.success, fontWeight: '700' }]}>
                  ✓ Из кеша — скан не засчитан
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.retakeBtn, { backgroundColor: colors.surface }]}
              onPress={() => { haptic.light(); abortRef.current?.abort(); setImageUri(null); setRecognizedItems([]); setItemBases({}); setLoading(false); setError(''); setIsBarcodeResult(false); setSanityFlags([]); setCachedResult(false); setTotalWeightDraft(''); lastBase64Ref.current = ''; }}
            >
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Переснять</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.huge }}>
            <Text style={{ fontSize: 64, marginBottom: spacing.lg }}>📷</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md }]}>
              Сфотографируй еду или загрузи из галереи{'\n'}ИИ определит продукты и рассчитает КБЖУ
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.xl }]}>
              Совет: снимай тарелку сверху при хорошем освещении — чем лучше фото, тем точнее результат
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
                onPress={() => { if (manualDigits.length >= 8 && !barcodeLoading) handleBarcodeScan(manualDigits); }}
                disabled={manualDigits.length < 8 || barcodeLoading}
                style={{ paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: borderRadius.md, backgroundColor: manualDigits.length >= 8 ? colors.primary : colors.border }}
              >
                {barcodeLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Найти</Text>}
              </TouchableOpacity>
            </View>

            {/* Repeat a recent meal — fastest possible path for habitual eaters.
                Takes a meal from today/yesterday and re-seeds the recognised-items
                list without hitting the camera, the AI, or a barcode lookup. */}
            {recentMealChips.length > 0 && (
              <View style={{ alignSelf: 'stretch', marginTop: spacing.lg }}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                  Повторить приём:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {recentMealChips.map(({ meal }) => {
                      const firstName = meal.items[0]?.name ?? 'Приём пищи';
                      const more = meal.items.length > 1 ? ` +${meal.items.length - 1}` : '';
                      return (
                        <TouchableOpacity
                          key={meal.id}
                          onPress={() => repeatMeal(meal)}
                          style={[styles.recentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        >
                          <Text style={[typography.captionMedium, { color: colors.text }]} numberOfLines={1}>
                            {firstName.length > 20 ? firstName.slice(0, 18) + '…' : firstName}{more}
                          </Text>
                          <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            {Math.round(meal.totalCalories)} ккал
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

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
                        onPress={() => applyBarcodeProduct(scan, scan.servingGrams)}
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
            <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.xs }]}>Обычно 5–15 секунд</Text>
            <TouchableOpacity onPress={cancelAnalysis} style={{ marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Error / suggestion */}
        {!!error && (
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.error }}>
            <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
            {errorRetryable && !loading && (
              <Button
                title="Попробовать снова"
                variant="outline"
                onPress={() => {
                  if (lastBase64Ref.current) {
                    setError('');
                    analyzeFood(lastBase64Ref.current, lastMimeRef.current);
                  } else {
                    setImageUri(null);
                    setError('');
                  }
                }}
                style={{ marginTop: spacing.md }}
              />
            )}
            {/* If the AI failed to recognise food, offer an immediate barcode
                fallback — much more reliable for packaged products. */}
            {!loading && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <Button
                  title="📦 Штрих-код"
                  variant="outline"
                  onPress={() => { setError(''); setImageUri(null); openBarcodeScanner(); }}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Вручную"
                  variant="outline"
                  onPress={() => { setError(''); setImageUri(null); navigation.navigate('ManualFoodAdd', { mealType, date: todayDate() }); }}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </Card>
        )}

        {/* Sanity warning — AI returned implausible values. Non-blocking but loud. */}
        {recognizedItems.length > 0 && sanityFlags.length > 0 && (
          <Card style={{ marginBottom: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.warning, backgroundColor: colors.warning + '10' }}>
            <Text style={[typography.smallMedium, { color: colors.warning, marginBottom: 4 }]}>
              ⚠ Подозрительные значения
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, lineHeight: 17 }]}>
              {sanityFlags.includes('kcal_per_100g') && 'Калорийность на 100г слишком высокая (&gt;900 ккал). '}
              {sanityFlags.includes('kcal_per_item') && 'Один из продуктов содержит слишком много калорий. '}
              {sanityFlags.includes('total_kcal') && 'Суммарно больше 5000 ккал. '}
              Проверь названия и вес порций перед сохранением.
            </Text>
          </Card>
        )}

        {/* Barcode not found */}
        {notFound && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Продукт не найден</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Штрих-код {lastBarcode} не найден в базе данных. Можно распознать по фото или добавить вручную.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Button title="📷 Фото" onPress={() => { setNotFound(false); pickImage(true); }} style={{ flex: 1 }} />
              <Button title="Вручную" variant="outline" onPress={() => navigation.navigate('ManualFoodAdd', { mealType, date: todayDate() })} style={{ flex: 1 }} />
            </View>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: spacing.sm }} onPress={() => { setNotFound(false); setBarcodeScanned(false); setShowBarcodeScanner(true); }}>
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
            {recognizedItems.map((item, idx) => (
              <FadeIn key={item.id} delay={idx * 60} from="bottom">
                <RecognizedItemCard
                  item={item}
                  base={itemBases[item.id]}
                  onWeightChange={updateItemWeight}
                  onRemove={removeItem}
                  onRename={renameItem}
                />
              </FadeIn>
            ))}

            {/* Portion scaler — single input that resizes every item proportionally
                to match the total plate/bowl weight. Useful when the AI got the
                proportions right but guessed the absolute size wrong. */}
            {recognizedItems.length >= 2 && (
              <View style={[styles.scalerRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[typography.small, { color: colors.textSecondary, flex: 1 }]}>
                  Общий вес тарелки:
                </Text>
                <TextInput
                  style={[styles.scalerInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                  value={totalWeightDraft}
                  onChangeText={setTotalWeightDraft}
                  keyboardType="numeric"
                  selectTextOnFocus
                  maxLength={5}
                  returnKeyType="done"
                  onSubmitEditing={scaleAllPortions}
                />
                <Text style={[typography.small, { color: colors.textSecondary, marginLeft: 4 }]}>г</Text>
                <TouchableOpacity
                  onPress={scaleAllPortions}
                  style={[styles.scalerBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[typography.captionMedium, { color: '#FFF', fontWeight: '700' }]}>Пересчитать</Text>
                </TouchableOpacity>
              </View>
            )}

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
                    {savedFoods.length > 15 && (
                      <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', paddingTop: spacing.xs }]}>
                        + ещё {savedFoods.length - 15} — открой «Поиск продуктов» для полного списка
                      </Text>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* Totals */}
            <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '10' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>Итого:</Text>
                {recognizedItems.some((i) => i.confidence == null || i.confidence < 0.75) && (
                  <Text style={[typography.caption, { color: colors.warning }]}>~ приблизительно</Text>
                )}
              </View>
              <View style={styles.nutritionRow}>
                {[
                  { label: 'ккал', value: String(Math.round(recognizedItems.reduce((s, i) => s + i.calories, 0))), color: colors.calories },
                  { label: 'белки', value: `${Math.round(recognizedItems.reduce((s, i) => s + i.protein, 0) * 10) / 10}г`, color: colors.protein },
                  { label: 'жиры', value: `${Math.round(recognizedItems.reduce((s, i) => s + i.fats, 0) * 10) / 10}г`, color: colors.fats },
                  { label: 'углев.', value: `${Math.round(recognizedItems.reduce((s, i) => s + i.carbs, 0) * 10) / 10}г`, color: colors.carbs },
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
              const afterMeal = Math.round(alreadyEaten + totalCal);
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

      {/* Full-screen image preview — tap the thumbnail to inspect what you
          actually photographed before trusting the AI's identification. */}
      <Modal visible={imagePreviewOpen} transparent animationType="fade" onRequestClose={() => setImagePreviewOpen(false)}>
        <TouchableOpacity
          style={styles.previewOverlay}
          activeOpacity={1}
          onPress={() => { haptic.selection(); setImagePreviewOpen(false); }}
        >
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
          )}
          <Text style={styles.previewHint}>Тап, чтобы закрыть</Text>
        </TouchableOpacity>
      </Modal>
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
  zoomHint: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  cachedBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  scalerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  scalerInput: {
    width: 64,
    height: 36,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  scalerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  previewHint: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 42 : 24,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
});
