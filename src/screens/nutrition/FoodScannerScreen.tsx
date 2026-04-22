import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, useWindowDimensions, Modal, Platform, AppState } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore, useNutritionStore, useSubscriptionStore, useConnectionStore, FREE_LIMITS } from '../../store';
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
import { FOOD_DB } from './manual/foodData';
import {
  fingerprintBase64,
  flagSanity,
  extractKcal,
  parseServingGrams,
  defaultMealType,
  findSavedFoodMatch,
  findDuplicateNames,
  mergeDuplicateItems,
  normalizeFoodName,
  buildBarcodeDisplayName,
  isDraftFresh,
  DRAFT_TTL_MS,
  computeTypicalPortions,
  typicalPortionFor,
  type SanityFlag,
  type ScannerDraft,
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

/** Remove a barcode from the recent-scans list. Survives parallel writes
 *  because we re-read before filtering. The barcode itself stays in the
 *  BARCODE_CACHE_KEY 30d lookup cache — "remove from recents" is about
 *  hiding an occasional mistake from the quick-access row, not purging
 *  it from the OFF product cache. */
async function removeRecentScan(barcode: string) {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SCANS_KEY);
    const scans: RecentScan[] = raw ? JSON.parse(raw) : [];
    const filtered = scans.filter((s) => s.barcode !== barcode);
    await AsyncStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(filtered));
  } catch {}
}

// ─── First-launch onboarding hint ────────────────────────────────────────────

const ONBOARDING_KEY = 'iron_gym_scanner_onboarded';

async function isOnboarded(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

async function markOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  } catch { /* non-fatal */ }
}

// ─── Draft autosave (AsyncStorage) ───────────────────────────────────────────

const DRAFT_KEY = 'iron_gym_scanner_draft';
// Remembers the last meal type the user SAVED (not just browsed). Lets the
// default pick be "what you last picked at this hour" instead of the blunt
// time-of-day heuristic alone. Key is stored separately so wiping scanner
// drafts (on save/cancel) doesn't erase this preference.
const LAST_MEAL_TYPE_KEY = 'iron_gym_scanner_last_meal_type';
// Keep only recent history (last 14 days) — so a 3-month-old "завтрак in
// evening" choice doesn't override today's correct default.
const LAST_MEAL_TYPE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function loadLastMealType(): Promise<{ type: 'breakfast' | 'lunch' | 'dinner' | 'snack'; savedAt: number; hour: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_MEAL_TYPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.type || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > LAST_MEAL_TYPE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveLastMealType(type: 'breakfast' | 'lunch' | 'dinner' | 'snack'): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_MEAL_TYPE_KEY,
      JSON.stringify({ type, savedAt: Date.now(), hour: new Date().getHours() }),
    );
  } catch { /* non-fatal */ }
}

async function loadDraft(): Promise<ScannerDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: ScannerDraft = JSON.parse(raw);
    if (!isDraftFresh(parsed)) {
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function saveDraft(draft: ScannerDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* non-fatal — the user still has the in-memory state */
  }
}

async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    /* non-fatal */
  }
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
  const isOnline = useConnectionStore((s) => s.isOnline);
  const today = todayDate();
  const dayLog = getDayLog(today);
  const alreadyEaten = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);

  // Median weight per food from the last ~30 days of meals. Feeds the
  // per-item "обычно ты ешь N г" hint in RecognizedItemCard.
  const typicalPortions = React.useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const days = Object.values(dailyLog)
      .filter((d: any) => {
        const ts = new Date(d.date + 'T00:00:00').getTime();
        return !isNaN(ts) && ts >= cutoff;
      });
    const meals = days.flatMap((d: any) => d.meals || []);
    return computeTypicalPortions(meals);
  }, [dailyLog]);

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
  // Seconds elapsed since loading started — ticks once/sec so we can show
  // a live progress hint instead of a static "Обычно 5–15 секунд" message.
  // Crosses 15s → switch to "still processing" reassurance copy.
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [recognizedItems, setRecognizedItems] = useState<NutritionItem[]>([]);
  const [itemBases, setItemBases] = useState<Record<string, { cal: number; prot: number; fats: number; carbs: number }>>({});
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(defaultMealType);
  const [error, setError] = useState('');
  const [errorRetryable, setErrorRetryable] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  // Search query inside the "+ Сохранённые" panel — filters savedFoods first,
  // falls through to FOOD_DB when nothing user-saved matches the query.
  const [addPanelQuery, setAddPanelQuery] = useState('');
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
  // Text-description fallback — type what you ate instead of taking a photo
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textDescription, setTextDescription] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  // First-launch onboarding tip — explains the 3 input methods. Dismissed
  // once and never shown again. Loaded async; default false → no flash.
  const [showOnboarding, setShowOnboarding] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastBase64Ref = useRef<string>('');
  const lastMimeRef = useRef<string>('image/jpeg');
  // Prevent double barcode scan consumption
  const barcodeProcessingRef = useRef(false);

  const { consumeFoodScan, refundFoodScan, foodScansLeft, isPremiumActive } = useSubscriptionStore();
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
    isOnboarded().then((done) => { if (!done) setShowOnboarding(true); });

    // Hydrate mealType from the user's last-saved choice when it lines up
    // with the current hour (within ±2h). Falls back to the time-of-day
    // heuristic otherwise. Example: user normally breakfasts at 10am —
    // opening the scanner at 10:30am will pre-select breakfast even if
    // the heuristic would say lunch.
    loadLastMealType().then((last) => {
      if (!last) return;
      const nowHour = new Date().getHours();
      if (Math.abs(nowHour - last.hour) <= 2) {
        setMealType(last.type);
      }
    });

    // Offer to restore an abandoned scan if the user was mid-editing when
    // they backgrounded / killed the app. Kept deliberately non-modal: an
    // Alert with Restore / Discard so a single tap either resumes or cleans
    // the slate for a fresh scan.
    loadDraft().then((draft) => {
      if (!draft || draft.items.length === 0) return;
      const firstName = draft.items[0]?.name ?? 'Приём пищи';
      const more = draft.items.length > 1 ? ` +${draft.items.length - 1}` : '';
      const totalCal = Math.round(draft.items.reduce((s, i) => s + (i.calories || 0), 0));
      Alert.alert(
        'Продолжить прошлое сканирование?',
        `«${firstName}${more}» — ${totalCal} ккал. Было сохранено как черновик.`,
        [
          {
            text: 'Сбросить',
            style: 'destructive',
            onPress: () => { clearDraft().catch(() => {}); haptic.light(); },
          },
          {
            text: 'Продолжить',
            onPress: () => {
              haptic.success();
              // Re-use the same builder path as the AI cache hit so all the
              // derived state (bases, totalWeight, sanity flags) gets recomputed.
              applyAIItems(draft.items);
              setMealType(draft.mealType);
              setIsBarcodeResult(draft.isBarcodeResult);
            },
          },
        ],
      );
    });

    return () => { abortRef.current?.abort(); lastBase64Ref.current = ''; };
  }, []);

  // Cancel any in-flight AI request when the app goes to background. Keeps
  // a dead ~10s request from counting against the user's free quota when
  // they've clearly lost interest, and avoids UI flashing when the user
  // returns to a stale "analysing..." indicator.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && loading && abortRef.current) {
        abortRef.current.abort();
      }
    });
    return () => sub.remove();
  }, [loading]);

  // Persist the current scan as a draft whenever recognisedItems changes.
  // Debounced indirectly by React's batching — every state-changing edit
  // writes once. On an empty list we clear the draft so the next mount
  // doesn't offer to restore nothing.
  useEffect(() => {
    if (recognizedItems.length === 0) {
      clearDraft().catch(() => {});
      return;
    }
    const draft: ScannerDraft = {
      mealType,
      isBarcodeResult,
      items: recognizedItems.map((i) => ({
        name: i.name,
        calories: i.calories,
        protein: i.protein,
        fats: i.fats,
        carbs: i.carbs,
        weightGrams: i.weightGrams,
        ...(i.confidence != null ? { confidence: i.confidence } : {}),
      })),
      savedAt: Date.now(),
    };
    saveDraft(draft).catch(() => {});
  }, [recognizedItems, mealType, isBarcodeResult]);

  // ─── AI photo analysis ──────────────────────────────────────────────────────

  /** Combined known-foods pool — user's savedFoods FIRST (highest trust),
   *  then the built-in FOOD_DB (Skurikhin-ish reference values). Wraps
   *  FOOD_DB entries with a synthetic id + weightGrams:100 so they match
   *  the MatchableFood signature that findSavedFoodMatch expects. */
  const knownFoods = React.useMemo(() => {
    const dbFoods = FOOD_DB.map((f, i) => ({
      id: `db-${i}`,
      name: f.name,
      calories: f.calories,
      protein: f.protein,
      fats: f.fats,
      carbs: f.carbs,
      weightGrams: 100,
    }));
    return [...savedFoods, ...dbFoods];
  }, [savedFoods]);

  /** When true, the next analyzeFood result will APPEND to existing
   *  recognizedItems instead of replacing them. Used by the "+ Ещё фото"
   *  flow for compound meals (soup + main + bread photographed separately). */
  const appendNextRef = useRef(false);

  const applyAIItems = (rawItems: CachedAIResult['items']) => {
    const items: NutritionItem[] = rawItems.map((raw, index) => {
      // Prefer user's saved macros first, then the built-in FOOD_DB — both
      // are higher trust than the AI's per-image estimate. Keep the AI's
      // weight guess and scale the reference per-100g values to it.
      const match = findSavedFoodMatch(knownFoods, raw.name);
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
    const newBases: typeof itemBases = {};
    items.forEach((item) => {
      const w = item.weightGrams || 100;
      newBases[item.id] = {
        cal: (item.calories / w) * 100,
        prot: (item.protein / w) * 100,
        fats: (item.fats / w) * 100,
        carbs: (item.carbs / w) * 100,
      };
    });

    // Append mode (multi-photo compound meals) — merge with existing items
    // instead of replacing. The combined list is then re-flagged so the
    // sanity check sees the full combined macros.
    if (appendNextRef.current) {
      appendNextRef.current = false;
      const merged = [...recognizedItems, ...items];
      setItemBases({ ...itemBases, ...newBases });
      setRecognizedItems(merged);
      setIsBarcodeResult(false);
      setSanityFlags(flagSanity(merged));
      setTotalWeightDraft(String(merged.reduce((s, i) => s + (i.weightGrams || 0), 0)));
      return items;
    }

    setItemBases(newBases);
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
      // Server now also returns sanityFlags — merge with our local flags so
      // the banner reflects all warnings (server may catch things the client
      // didn't, e.g. unmatched Skurikhin reference for the named food).
      if (result.sanityFlags && result.sanityFlags.length > 0) {
        setSanityFlags((prev) => Array.from(new Set([...prev, ...result.sanityFlags!])));
      }
      if (items.length === 0) {
        setError('Продукты не распознаны. Попробуй сделать чёткое фото тарелки с едой, или просканируй штрих-код упаковки.');
        setImageUri(null);
        // Refund the optimistically-consumed scan — user gets nothing out of
        // this call, so it shouldn't count against today's budget.
        refundFoodScan();
        // No items parsed → applyAIItems never ran → append flag never
        // got consumed. Clear it so the next fresh scan isn't contaminated.
        appendNextRef.current = false;
        haptic.warning();
      } else {
        // Cache the successful result by the image fingerprint — next re-scan is free.
        cacheAIResult(fingerprint, result.items).catch(() => {});
        // Release the ~5-7MB base64 — retry is only meaningful on error paths.
        lastBase64Ref.current = '';
        haptic.success();
      }
    } catch (e: any) {
      // Any error path means applyAIItems never ran — clear the append flag
      // once up here to cover all cases below.
      appendNextRef.current = false;
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') {
        setError('Анализ отменён.');
        setImageUri(null);
        lastBase64Ref.current = '';
        // User bailed before we got anything useful — refund.
        refundFoodScan();
      } else if (e?.response?.status === 402) {
        // Server quota exceeded (e.g. scanned on another device) — show paywall.
        // Don't refund: the server counted this against quota.
        setImageUri(null);
        lastBase64Ref.current = '';
        setShowPaywall(true);
        haptic.warning();
      } else if (e?.suggestion) {
        setError(e.suggestion);
        setErrorRetryable(e?.retryable !== false);
        // Refund only for non-retryable — retryable errors let the user press
        // "Попробовать снова" which reuses the AI call without consuming twice.
        if (e?.retryable === false) refundFoodScan();
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
    if (foodScansLeft() === 0 && !isPremiumActive()) {
      // Clear the append flag here too — a failed pre-check shouldn't leak
      // append intent into a later fresh scan.
      appendNextRef.current = false;
      setShowPaywall(true);
      haptic.warning();
      return;
    }
    // Offline short-circuit — without network, the AI call will hang for
    // 60s before axios gives up. Bail early with a clear error so the user
    // knows what to do. Barcode scans still use the full pickImage path
    // indirectly only for retake, but camera-open logic is handled separately.
    if (!isOnline) {
      appendNextRef.current = false;
      haptic.warning();
      Alert.alert(
        'Нет соединения',
        'Для AI-анализа фото нужен интернет. Попробуй штрих-код — некоторые продукты есть в локальном кеше, или добавь еду через «+ Сохранённые».',
      );
      return;
    }
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      // Permission denied — don't keep the append flag set, or the next
      // *fresh* photo would incorrectly merge into old items.
      appendNextRef.current = false;
      Alert.alert('Нужен доступ', 'Разрешите доступ к камере/галерее в настройках');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.9, base64: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.9, base64: false });
    // Reset the append flag early — if the user cancelled the picker, we
    // must not carry "append next" into a fresh photo taken later. The flag
    // is re-set just before the append-flow pickImage call, so this is safe.
    if (result.canceled) {
      appendNextRef.current = false;
      return;
    }
    if (result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setError('');
      setLoading(true);
      haptic.light();
      try {
        // Resize to max 1280px and convert to JPEG — reduces payload 4-10x vs raw HEIC/PNG
        const compressed = await compressImageForUpload(asset.uri);
        if (!compressed.base64) {
          appendNextRef.current = false;
          setImageUri(null);
          setError('Не удалось обработать изображение. Попробуй ещё раз.');
          setLoading(false);
          return;
        }
        // Server rejects base64 strings > 9MB — reject early on client to avoid opaque 400 error
        if (compressed.base64.length > 9_000_000) {
          appendNextRef.current = false;
          setImageUri(null);
          setError('Фото слишком большое. Попробуй более близкий кадр или другое изображение.');
          setLoading(false);
          return;
        }
        // Consume credit only after successful compression — failed compression must not deduct a scan
        if (!isPremiumActive() && !consumeFoodScan()) {
          appendNextRef.current = false;
          setImageUri(null);
          setLoading(false);
          setShowPaywall(true);
          return;
        }
        // analyzeFood owns the flag from here — applyAIItems will consume it
        // on success, and the ref-reset in the return-without-items path
        // (refundFoodScan branch) is handled there.
        analyzeFood(compressed.base64, compressed.mimeType);
      } catch {
        appendNextRef.current = false;
        setImageUri(null);
        setError('Не удалось обработать изображение.');
        setLoading(false);
      }
    }
  };

  // ─── Barcode ────────────────────────────────────────────────────────────────

  const analyzeByText = async () => {
    const desc = textDescription.trim();
    if (desc.length < 3) {
      haptic.warning();
      return;
    }
    if (!isPremiumActive() && foodScansLeft() === 0) {
      setTextModalOpen(false);
      setShowPaywall(true);
      haptic.warning();
      return;
    }
    // Text path is an AI call too — same offline rule as pickImage.
    if (!isOnline) {
      haptic.warning();
      setError('Нет соединения. Описание отправится в AI, когда появится интернет.');
      setTextModalOpen(false);
      return;
    }
    setTextLoading(true);
    setError('');
    setSanityFlags([]);
    try {
      const result = await aiService.analyzeFoodText(desc);
      // Same shape as /analyze-food — reuse applyAIItems so all the derived
      // state (bases, totalWeight, sanity flags) gets computed the same way.
      const items = applyAIItems(result.items);
      // Merge server-side sanity flags with whatever the client side flagged.
      if (result.sanityFlags && result.sanityFlags.length > 0) {
        setSanityFlags((prev) => Array.from(new Set([...prev, ...result.sanityFlags!])));
      }
      if (items.length === 0) {
        setError('Не удалось распознать продукты из описания. Попробуй конкретнее.');
        haptic.warning();
      } else {
        setTextModalOpen(false);
        setTextDescription('');
        setImageUri(null); // no photo — we came from text path
        haptic.success();
        // Count a scan for the free-plan quota (server already logs one).
        if (!isPremiumActive()) consumeFoodScan();
      }
    } catch (e: any) {
      if (e?.response?.status === 402) {
        setTextModalOpen(false);
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
      setTextLoading(false);
    }
  };

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

  /** Single-slot undo cache for the most recently removed item. Surfaced as
   *  a "Удалено: X. Отменить" row below the items list for ~6 seconds. We
   *  could remember a longer history but Alert noise / UI clutter aren't
   *  worth it — accidental delete is the use case, not undo-stacking. */
  const [lastRemoved, setLastRemoved] = useState<{ item: NutritionItem; base: { cal: number; prot: number; fats: number; carbs: number } | undefined; expiresAt: number } | null>(null);
  const lastRemovedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Bulk-clear undo snapshot. Distinct from lastRemoved because:
   *  - It holds every item + every base (not just one pair)
   *  - It has a longer TTL (10s) — bulk clear is scarier, more room to
   *    realize the mistake
   *  - The undo row formatting is different ("Очищено N позиций. Отменить")
   *  Set by the "Очистить" confirm handler; cleared by the timer, by
   *  undo, or whenever a new bulk-clear runs. */
  const [lastCleared, setLastCleared] = useState<{
    items: NutritionItem[];
    bases: Record<string, { cal: number; prot: number; fats: number; carbs: number }>;
    expiresAt: number;
  } | null>(null);
  const lastClearedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeItem = useCallback((id: string) => {
    haptic.medium();
    const removed = recognizedItems.find((i) => i.id === id);
    const removedBase = itemBases[id];
    setRecognizedItems((prev) => prev.filter((item) => item.id !== id));
    setItemBases((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (removed) {
      setLastRemoved({ item: removed, base: removedBase, expiresAt: Date.now() + 6000 });
      if (lastRemovedTimerRef.current) clearTimeout(lastRemovedTimerRef.current);
      lastRemovedTimerRef.current = setTimeout(() => setLastRemoved(null), 6000);
    }
  }, [haptic, recognizedItems, itemBases]);

  const undoRemove = useCallback(() => {
    if (!lastRemoved) return;
    haptic.success();
    if (lastRemovedTimerRef.current) clearTimeout(lastRemovedTimerRef.current);
    const { item, base } = lastRemoved;
    setRecognizedItems((prev) => [...prev, item]);
    if (base) setItemBases((prev) => ({ ...prev, [item.id]: base }));
    setLastRemoved(null);
  }, [lastRemoved, haptic]);

  /** Bulk-clear with undo snapshot. Called from the "Очистить" Alert confirm
   *  branch. Saves both arrays, sets a 10s auto-clear, wipes state. */
  const clearAllItems = useCallback(() => {
    const snapshot = {
      items: recognizedItems,
      bases: { ...itemBases },
      expiresAt: Date.now() + 10_000,
    };
    haptic.warning();
    setRecognizedItems([]);
    setItemBases({});
    setLastCleared(snapshot);
    if (lastClearedTimerRef.current) clearTimeout(lastClearedTimerRef.current);
    lastClearedTimerRef.current = setTimeout(() => setLastCleared(null), 10_000);
  }, [recognizedItems, itemBases, haptic]);

  const undoClear = useCallback(() => {
    if (!lastCleared) return;
    haptic.success();
    if (lastClearedTimerRef.current) clearTimeout(lastClearedTimerRef.current);
    setRecognizedItems(lastCleared.items);
    setItemBases(lastCleared.bases);
    setLastCleared(null);
  }, [lastCleared, haptic]);

  // Cleanup the undo timers on unmount so we don't leak setTimeouts.
  useEffect(() => () => {
    if (lastRemovedTimerRef.current) clearTimeout(lastRemovedTimerRef.current);
    if (lastClearedTimerRef.current) clearTimeout(lastClearedTimerRef.current);
  }, []);

  // Live elapsed-seconds counter for the AI analysis loading state.
  // Resets to 0 on each `loading → true` transition. Gated on `loading`
  // so the timer isn't running when the user's not waiting.
  useEffect(() => {
    if (!loading) {
      setLoadingElapsed(0);
      return undefined;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [loading]);

  /** Rename a recognized item — lets the user correct AI misidentifications
   *  (e.g. AI said "рис", user knows it's actually "плов"). */
  const renameItem = useCallback((id: string, newName: string) => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed) return;
    setRecognizedItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: trimmed } : i)));
  }, []);

  /** Merge duplicate-name items in the recognized list — delegates to the
   *  pure `mergeDuplicateItems` in utils/foodScanner so the logic is unit-
   *  testable without mounting the component. No-op if nothing to merge.
   *
   *  Not auto-invoked on detection: the warning banner calls this explicitly,
   *  so users with two legitimate portions of the same food (e.g. 2 yogurts)
   *  aren't silently collapsed. */
  const mergeDuplicates = useCallback(() => {
    const { items: nextItems, bases: nextBases, mergedCount } =
      mergeDuplicateItems(recognizedItems, itemBases);
    if (mergedCount === 0) return;
    setRecognizedItems(nextItems);
    setItemBases(nextBases);
    haptic.success();
  }, [recognizedItems, itemBases, haptic]);

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

  /** Heuristic check for an accidental re-log: today's meals (same mealType)
   *  where the first-item name matches the one we're about to save. Doesn't
   *  block — just surfaces an Alert so the user can cancel if it's a dupe. */
  const maybeDuplicateTodayMeal = React.useMemo(() => {
    if (recognizedItems.length === 0) return null;
    const firstName = recognizedItems[0]?.name?.toLowerCase().trim();
    if (!firstName) return null;
    const todaysMatches = (dayLog.meals || []).filter((m) => {
      if (m.type !== mealType) return false;
      const otherFirst = m.items[0]?.name?.toLowerCase().trim();
      return otherFirst === firstName;
    });
    return todaysMatches.length > 0 ? todaysMatches[todaysMatches.length - 1] : null;
  }, [recognizedItems, dayLog.meals, mealType]);

  const handleSave = () => {
    if (recognizedItems.length === 0) return;

    // If the AI returned implausible values, ask the user to confirm before
    // logging — flat-out blocking save would be too patronising, but they
    // shouldn't be able to dismiss the warning banner without acknowledgment.
    if (sanityFlags.length > 0) {
      const flagText = [
        sanityFlags.includes('kcal_per_100g') ? 'высокая калорийность на 100г' : null,
        sanityFlags.includes('kcal_per_item') ? 'крупная позиция' : null,
        sanityFlags.includes('total_kcal') ? 'большая суммарная калорийность' : null,
      ].filter(Boolean).join(', ');
      Alert.alert(
        'Подозрительные значения',
        `Обнаружено: ${flagText}. Проверь веса порций перед сохранением. Записать как есть?`,
        [
          { text: 'Проверить', style: 'cancel' },
          { text: 'Да, записать', onPress: () => maybeDuplicateTodayMeal ? confirmAndSave() : doSave() },
        ],
      );
      haptic.warning();
      return;
    }

    if (maybeDuplicateTodayMeal) {
      confirmAndSave();
      return;
    }
    doSave();
  };

  const confirmAndSave = () => {
    if (!maybeDuplicateTodayMeal) {
      doSave();
      return;
    }
    // Duplicate check — if today's log already has a meal of the same type
    // whose first item matches, ask before re-saving. Users occasionally
    // tap "Сохранить" twice or forget they already logged; this catches it.
    const prevCal = Math.round(maybeDuplicateTodayMeal.totalCalories);
    Alert.alert(
      'Похожий приём уже есть',
      `Сегодня уже записан «${maybeDuplicateTodayMeal.items[0]?.name}» на ${prevCal} ккал. Записать ещё раз?`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Да, записать', onPress: doSave },
      ],
    );
    haptic.warning();
  };

  const doSave = () => {
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
    // Draft has served its purpose — clear before leaving to prevent the
    // next mount from offering to restore already-saved data.
    clearDraft().catch(() => {});
    // Remember this meal-type choice for next time (±2h window) so the
    // default matches the user's actual eating pattern, not just the clock.
    saveLastMealType(mealType).catch(() => {});
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

        {/* Offline banner — AI photo / text analysis and OFF API barcode
            lookups all need network. Cached barcode lookups (30d TTL) and
            the manual-add panel still work, so we tell the user exactly
            what'll work right now. isOnline flips to false from axios'
            interceptor on any ERR_NETWORK response. */}
        {!isOnline && (
          <View style={{ flexDirection: 'row', padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.warning + '15', borderWidth: 1, borderColor: colors.warning + '40', marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 18, marginRight: spacing.sm }}>📡</Text>
            <Text style={[typography.small, { color: colors.warning, flex: 1 }]}>
              Нет соединения. AI-анализ и поиск штрих-кодов по базе временно недоступны — но уже отсканированные штрих-коды и список «+ Сохранённые» работают из кеша.
            </Text>
          </View>
        )}

        {/* Bulk-clear undo snapshot — distinct from the per-item undo row
            (which shows inside the items block). Sits near the top so it's
            obvious the list wasn't lost. Auto-dismisses after 10s via the
            setTimeout in clearAllItems. */}
        {lastCleared && (
          <View style={[styles.undoRow, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40', marginBottom: spacing.md }]}>
            <Text style={[typography.caption, { color: colors.warning, flex: 1 }]} numberOfLines={1}>
              Очищено {lastCleared.items.length} {lastCleared.items.length === 1 ? 'позиция' : 'позиций'}
            </Text>
            <TouchableOpacity
              onPress={undoClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Восстановить ${lastCleared.items.length} очищенных позиций`}
              accessibilityRole="button"
            >
              <Text style={[typography.captionMedium, { color: colors.warning, fontWeight: '700' }]}>Отменить</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* First-launch tip — three-method primer, dismissable. Persists
            via AsyncStorage so it never re-appears once the user gets it. */}
        {showOnboarding && !imageUri && recognizedItems.length === 0 && (
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.primary + '08' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
              <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>
                Три способа записать еду
              </Text>
              <TouchableOpacity
                onPress={() => { haptic.light(); setShowOnboarding(false); markOnboarded().catch(() => {}); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Скрыть подсказку"
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 16, color: colors.textTertiary }}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={[typography.small, { color: colors.textSecondary, lineHeight: 20 }]}>
              <Text style={{ fontWeight: '700' }}>📸 Фото</Text> — AI определит продукты на тарелке.{'\n'}
              <Text style={{ fontWeight: '700' }}>📦 Штрих-код</Text> — для упакованных продуктов из магазина.{'\n'}
              <Text style={{ fontWeight: '700' }}>📝 Текст</Text> — если знаешь название и вес.
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
              Все три способа учитывают твою дневную норму КБЖУ — после сохранения увидишь сколько осталось до цели.
            </Text>
          </Card>
        )}

        {/* Photo or empty-state card */}
        {imageUri ? (
          <View style={styles.imageContainer}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { haptic.selection(); setImagePreviewOpen(true); }}
              accessibilityLabel="Сфотографированная еда"
              accessibilityHint="Нажмите чтобы увеличить фото"
              accessibilityRole="imagebutton"
            >
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
              accessibilityLabel="Переснять фото"
              accessibilityHint="Сбрасывает текущий результат и возвращает к выбору фото"
              accessibilityRole="button"
            >
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Переснять</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.huge }}>
            {/* Quick remaining-calories context — even before the user starts
                a scan, they see how much room is left in today's budget. */}
            {dayLog.targetCalories > 0 && (() => {
              const remaining = dayLog.targetCalories - alreadyEaten;
              const overBy = remaining < 0 ? Math.abs(remaining) : 0;
              const tone = remaining < 0 ? colors.error : remaining < 300 ? colors.warning : colors.success;
              return (
                <View style={[{ alignSelf: 'stretch', padding: spacing.sm, marginBottom: spacing.md, borderRadius: borderRadius.md, backgroundColor: tone + '15', borderWidth: 1, borderColor: tone + '40' }]}>
                  <Text style={[typography.smallMedium, { color: tone, textAlign: 'center' }]}>
                    {remaining >= 0
                      ? `Осталось на сегодня: ${remaining} ккал из ${dayLog.targetCalories}`
                      : `Превышение цели: +${overBy} ккал из ${dayLog.targetCalories}`}
                  </Text>
                </View>
              );
            })()}
            <Text style={{ fontSize: 64, marginBottom: spacing.lg }}>📷</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md }]}>
              Сфотографируй еду или загрузи из галереи{'\n'}ИИ определит продукты и рассчитает КБЖУ
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.xl }]}>
              Совет: снимай тарелку сверху при хорошем освещении — чем лучше фото, тем точнее результат
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
              <Button
                title="📷 Камера"
                onPress={() => pickImage(true)}
                style={{ flex: 1 }}
                accessibilityLabel="Сфотографировать еду камерой для анализа ИИ"
              />
              <Button
                title="Галерея"
                variant="outline"
                onPress={() => pickImage(false)}
                style={{ flex: 1 }}
                accessibilityLabel="Выбрать фото еды из галереи для анализа ИИ"
              />
            </View>
            <TouchableOpacity
              onPress={openBarcodeScanner}
              style={[styles.barcodeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityLabel="Сканировать штрих-код"
              accessibilityHint="Для упакованных продуктов — ищет в базе OpenFoodFacts"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 22 }}>📦</Text>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[typography.smallMedium, { color: colors.text }]}>Сканировать штрих-код</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Для упакованных продуктов</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { haptic.selection(); setTextModalOpen(true); }}
              style={[styles.barcodeBtn, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: spacing.sm }]}
              accessibilityLabel="Описать еду текстом"
              accessibilityHint="Введите что ели с весом, AI распарсит в КБЖУ"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 22 }}>📝</Text>
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={[typography.smallMedium, { color: colors.text }]}>Описать текстом</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>«150г куриной грудки и 200г риса»</Text>
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
                accessibilityLabel="Штрих-код вручную"
                accessibilityHint="Введите 8–14 цифр если камера не справляется"
              />
              <TouchableOpacity
                onPress={() => { if (manualDigits.length >= 8 && !barcodeLoading) handleBarcodeScan(manualDigits); }}
                disabled={manualDigits.length < 8 || barcodeLoading}
                style={{ paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: borderRadius.md, backgroundColor: manualDigits.length >= 8 ? colors.primary : colors.border }}
                accessibilityLabel="Найти продукт по введённому штрих-коду"
                accessibilityHint={manualDigits.length < 8 ? 'Кнопка станет активной после 8 цифр' : undefined}
                accessibilityRole="button"
                accessibilityState={{ disabled: manualDigits.length < 8 || barcodeLoading }}
              >
                {barcodeLoading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Найти</Text>}
              </TouchableOpacity>
            </View>
            {/* Helper text under the row — tells the user the expected format
                and length. Visible only when they've started typing to
                avoid pre-emptive clutter on the empty state. */}
            {manualBarcode.length > 0 && manualBarcode.length < 8 && (
              <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                Осталось ввести ещё {8 - manualDigits.length} {manualDigits.length === 7 ? 'цифру' : 'цифр'}
              </Text>
            )}

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
                          accessibilityLabel={`Повторить приём: ${firstName}${meal.items.length > 1 ? ` и ещё ${meal.items.length - 1}` : ''}, ${Math.round(meal.totalCalories)} калорий`}
                          accessibilityHint="Подставит тот же список продуктов для сохранения сегодня"
                          accessibilityRole="button"
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

            {/* Recent scans — quick re-use without camera. Long-press to
                remove from the list (barcode stays in 30d cache so if
                re-scanned, it still resolves offline / instantly). */}
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
                        onLongPress={() => {
                          haptic.medium();
                          Alert.alert(
                            'Убрать из недавних?',
                            `${scan.name} исчезнет из быстрого доступа. Штрих-код останется в кеше, если отсканируешь снова — найдётся мгновенно.`,
                            [
                              { text: 'Отмена', style: 'cancel' },
                              {
                                text: 'Убрать',
                                style: 'destructive',
                                onPress: async () => {
                                  await removeRecentScan(scan.barcode);
                                  loadRecentScans().then(setRecentScans);
                                },
                              },
                            ],
                          );
                        }}
                        accessibilityLabel={`Применить сохранённый скан ${scan.name}, ${scan.cal} калорий на 100 грамм`}
                        accessibilityHint="Долгое нажатие чтобы убрать из списка"
                        accessibilityRole="button"
                        delayLongPress={400}
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

        {/* Analysis progress — tick once/sec so the user sees we're alive.
            Crosses 15s → softer "still processing" copy so they don't think
            it's hung. */}
        {loading && (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.xxl }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>ИИ анализирует фото...</Text>
            <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.xs }]}>Определяю продукты и рассчитываю КБЖУ</Text>
            <Text style={[typography.small, { color: loadingElapsed > 15 ? colors.warning : colors.textTertiary, marginTop: spacing.xs }]}>
              {loadingElapsed < 5
                ? 'Обычно 5–15 секунд'
                : loadingElapsed <= 15
                  ? `${loadingElapsed}с...`
                  : loadingElapsed <= 30
                    ? `${loadingElapsed}с — сложное фото, почти готово`
                    : `${loadingElapsed}с — можно отменить и попробовать проще`}
            </Text>
            <TouchableOpacity
              onPress={cancelAnalysis}
              style={{ marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border }}
              accessibilityLabel="Отменить анализ"
              accessibilityHint="Прерывает текущий запрос к AI"
              accessibilityRole="button"
            >
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
            {/* If the AI failed to recognise food, offer three direct
                fallbacks — text describe (fastest), barcode (for packaged
                products), and the manual full-form screen. */}
            {!loading && (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button
                    title="📝 Текстом"
                    variant="outline"
                    onPress={() => { haptic.selection(); setError(''); setImageUri(null); setTextModalOpen(true); }}
                    style={{ flex: 1 }}
                    accessibilityLabel="Переключиться на ввод текстом"
                    accessibilityHint="Откроет модальное окно с описанием еды"
                  />
                  <Button
                    title="📦 Штрих-код"
                    variant="outline"
                    onPress={() => { haptic.selection(); setError(''); setImageUri(null); openBarcodeScanner(); }}
                    style={{ flex: 1 }}
                    accessibilityLabel="Переключиться на сканер штрих-кода"
                    accessibilityHint="Откроет камеру для сканирования упаковки"
                  />
                </View>
                <Button
                  title="Добавить вручную"
                  variant="outline"
                  onPress={() => { haptic.selection(); setError(''); setImageUri(null); navigation.navigate('ManualFoodAdd', { mealType, date: todayDate() }); }}
                  fullWidth
                  accessibilityLabel="Перейти к ручному вводу КБЖУ"
                  accessibilityHint="Откроет полную форму с белками, жирами и углеводами"
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
              {sanityFlags.includes('kcal_per_100g') && 'Калорийность на 100г слишком высокая (>900 ккал). '}
              {sanityFlags.includes('kcal_per_item') && 'Один из продуктов содержит слишком много калорий. '}
              {sanityFlags.includes('total_kcal') && 'Суммарно больше 5000 ккал. '}
              Проверь названия и вес порций перед сохранением.
            </Text>
          </Card>
        )}

        {/* Barcode not found — 3-way fallback: photograph the label, describe
            in text, or open the full manual-add form. Nutrition-label photos
            use the same /analyze-food endpoint (prompt rule 9 already handles
            extracting KBJU straight from visible labels). */}
        {notFound && (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Продукт не найден</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Штрих-код {lastBarcode} не в базе OpenFoodFacts. Выбери самый быстрый для тебя способ:
            </Text>
            <View style={{ gap: spacing.sm }}>
              <TouchableOpacity
                onPress={() => { haptic.selection(); setNotFound(false); pickImage(true); }}
                style={[styles.fallbackRow, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}
                accessibilityLabel="Сфотографировать этикетку продукта"
                accessibilityHint="AI считает КБЖУ прямо с таблицы пищевой ценности"
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 24 }}>📸</Text>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.smallMedium, { color: colors.text }]}>Сфотографировать этикетку</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>AI считает КБЖУ прямо с таблицы питательной ценности</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { haptic.selection(); setNotFound(false); setTextModalOpen(true); }}
                style={[styles.fallbackRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityLabel="Описать продукт текстом"
                accessibilityHint="Введите название и вес — AI посчитает КБЖУ"
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 24 }}>📝</Text>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.smallMedium, { color: colors.text }]}>Описать текстом</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Если знаешь название и вес</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { haptic.selection(); navigation.navigate('ManualFoodAdd', { mealType, date: todayDate() }); }}
                style={[styles.fallbackRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityLabel="Ввести КБЖУ вручную"
                accessibilityHint="Откроет полную форму с белками, жирами и углеводами"
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 24 }}>✎</Text>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.smallMedium, { color: colors.text }]}>Ввести КБЖУ вручную</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Полная форма с белками/жирами/углеводами</Text>
                </View>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.sm }}
              onPress={() => { haptic.selection(); setNotFound(false); setBarcodeScanned(false); setShowBarcodeScanner(true); }}
              accessibilityLabel="Сканировать другой штрих-код"
              accessibilityRole="button"
            >
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Сканировать другой код</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Empty-items-with-image hint — bulk-clear or deleting every item
            while an image is still mounted leaves the user in a dead state:
            image at top, nothing below. Offer clear next actions so they
            don't feel stuck. Only shows when not loading (AI call in progress
            will populate items) and not in barcode-not-found state. */}
        {imageUri && !loading && recognizedItems.length === 0 && !error && !notFound && (
          <Card style={{ marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md }]}>
              Список пуст. Что дальше?
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' }}>
              <Button
                title="Переснять"
                variant="outline"
                onPress={() => {
                  haptic.light();
                  abortRef.current?.abort();
                  setImageUri(null);
                  setIsBarcodeResult(false);
                  setSanityFlags([]);
                  setCachedResult(false);
                  setTotalWeightDraft('');
                  lastBase64Ref.current = '';
                  setError('');
                }}
                style={{ flex: 1 }}
                accessibilityLabel="Убрать фото и вернуться к выбору"
              />
              <Button
                title="Вручную"
                onPress={() => { haptic.selection(); navigation.navigate('ManualFoodAdd', { mealType, date: todayDate() }); }}
                style={{ flex: 1 }}
                accessibilityLabel="Перейти к ручному добавлению еды"
              />
            </View>
          </Card>
        )}

        {/* Recognized items */}
        {recognizedItems.length > 0 && (
          <>
            {/* Meal type selector — haptic feedback + a11y labels + tab role
                so VO announces "Selected" for the active one. */}
            <View style={styles.mealTypeRow} accessibilityRole="tablist">
              {MEAL_TYPES.map((mt) => (
                <TouchableOpacity
                  key={mt.key}
                  onPress={() => { haptic.selection(); setMealType(mt.key); }}
                  style={[styles.mealTypeBtn, { backgroundColor: mealType === mt.key ? colors.primary : colors.surface, borderColor: mealType === mt.key ? colors.primary : colors.border }]}
                  accessibilityLabel={`Тип приёма: ${mt.label.toLowerCase()}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mealType === mt.key }}
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

            {/* Header row: "Распознано:" + per-state actions.
                - Count pill so the user sees item count at a glance.
                - "Неуверенные: N" removes all items with confidence < 0.5
                  (or missing confidence). Shown only when 2+ such items
                  exist — one low-conf item is quicker to delete via the ✕
                  on its card.
                - "Очистить" clears the list in one shot when it got unwieldy
                  (3+ items). Undo stays available through the single-item
                  lastRemoved row; bulk clear has no undo (too much state). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
              <Text style={[typography.h4, { color: colors.text, flex: 1 }]}>Распознано:</Text>
              {recognizedItems.length > 0 && (
                <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full, backgroundColor: colors.primary + '18' }}>
                  <Text style={[typography.captionMedium, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                    {recognizedItems.length}
                  </Text>
                </View>
              )}
              {(() => {
                const lowConfItems = recognizedItems.filter((i) => (i.confidence ?? 0) < 0.5);
                if (lowConfItems.length < 2) return null;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Удалить неуверенные?',
                        `${lowConfItems.length} позиций с низкой уверенностью AI будут удалены. Откройте карточку, чтобы проверить конкретные позиции.`,
                        [
                          { text: 'Отмена', style: 'cancel' },
                          {
                            text: 'Удалить',
                            style: 'destructive',
                            onPress: () => {
                              haptic.warning();
                              const keptIds = new Set(
                                recognizedItems
                                  .filter((i) => (i.confidence ?? 0) >= 0.5)
                                  .map((i) => i.id),
                              );
                              setRecognizedItems((prev) => prev.filter((i) => keptIds.has(i.id)));
                              setItemBases((prev) => {
                                const next: typeof prev = {};
                                for (const id of Object.keys(prev)) {
                                  if (keptIds.has(id)) next[id] = prev[id];
                                }
                                return next;
                              });
                            },
                          },
                        ],
                      );
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityLabel={`Удалить ${lowConfItems.length} позиций с низкой уверенностью AI`}
                    accessibilityHint="Оставит только позиции, в которых AI уверен"
                    accessibilityRole="button"
                  >
                    <Text style={[typography.captionMedium, { color: colors.warning, fontWeight: '700' }]}>
                      Неуверенные: {lowConfItems.length}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
              {recognizedItems.length >= 3 && (
                <TouchableOpacity
                  onPress={() => {
                    // Confirm before bulk-clear — fingers slip. Snapshot-undo
                    // is available for 10s after, but the user shouldn't rely
                    // on it for every tap.
                    Alert.alert(
                      'Очистить список?',
                      `Будут удалены все ${recognizedItems.length} позиций. Восстановить можно будет 10 секунд.`,
                      [
                        { text: 'Отмена', style: 'cancel' },
                        { text: 'Очистить', style: 'destructive', onPress: clearAllItems },
                      ],
                    );
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityLabel={`Очистить все ${recognizedItems.length} распознанных позиций`}
                  accessibilityHint="Список опустеет. После очистки будет 10 секунд на отмену."
                  accessibilityRole="button"
                >
                  <Text style={[typography.captionMedium, { color: colors.error, fontWeight: '700' }]}>Очистить</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Compute duplicate set once per render (small N — at most 10ish
                items, O(n)). Used both for the banner and the per-card flag. */}
            {(() => {
              const dups = findDuplicateNames(recognizedItems);
              const dupLabel = Array.from(dups).slice(0, 3).join(', ');
              const more = dups.size > 3 ? ` +${dups.size - 3}` : '';
              return (
                <>
                  {/* Duplicate-name warning — flags accidental double-counting when
                      multi-photo append or the AI returns two near-identical items.
                      Offers a one-tap "Объединить" that calls mergeDuplicates.
                      We don't auto-merge on detection: user may legitimately
                      have two portions of the same food (e.g. 2 yogurts). */}
                  {dups.size > 0 && (
                    <View style={{ padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.warning + '15', borderWidth: 1, borderColor: colors.warning + '40', marginBottom: spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 16, marginRight: spacing.sm }}>⚠</Text>
                        <Text style={[typography.small, { color: colors.warning, flex: 1 }]}>
                          Дубликаты: {dupLabel}{more}. Одинаковые позиции удвоят КБЖУ.
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Объединить дубликаты?',
                            'Одинаковые позиции сложатся по весу в одну. Это действие нельзя отменить.',
                            [
                              { text: 'Отмена', style: 'cancel' },
                              { text: 'Объединить', onPress: mergeDuplicates },
                            ],
                          );
                        }}
                        style={{ alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.warning + '60' }}
                        accessibilityLabel={`Объединить ${dups.size} групп дубликатов`}
                        accessibilityHint="Веса одинаковых позиций сложатся. Калории пересчитаются."
                        accessibilityRole="button"
                      >
                        <Text style={[typography.captionMedium, { color: colors.warning, fontWeight: '700' }]}>
                          Объединить
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {recognizedItems.map((item, idx) => (
                    <FadeIn key={item.id} delay={idx * 60} from="bottom">
                      <RecognizedItemCard
                        item={item}
                        base={itemBases[item.id]}
                        onWeightChange={updateItemWeight}
                        onRemove={removeItem}
                        onRename={renameItem}
                        typicalWeight={typicalPortionFor(typicalPortions, item.name)}
                        isDuplicate={dups.has(normalizeFoodName(item.name))}
                      />
                    </FadeIn>
                  ))}
                </>
              );
            })()}

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
                  accessibilityLabel="Общий вес тарелки в граммах"
                  accessibilityHint="Все позиции масштабируются пропорционально под этот вес"
                />
                <Text style={[typography.small, { color: colors.textSecondary, marginLeft: 4 }]}>г</Text>
                <TouchableOpacity
                  onPress={scaleAllPortions}
                  style={[styles.scalerBtn, { backgroundColor: colors.primary }]}
                  accessibilityLabel="Пересчитать веса и калории под указанный общий вес"
                  accessibilityRole="button"
                >
                  <Text style={[typography.captionMedium, { color: '#FFF', fontWeight: '700' }]}>Пересчитать</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* "+ Ещё фото" — multi-photo flow for compound meals (e.g. soup
                + main + bread photographed separately). Sets appendNextRef
                so the next analyzeFood call merges into existing items. */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <TouchableOpacity
                onPress={() => { haptic.selection(); appendNextRef.current = true; pickImage(true); }}
                style={[styles.addMoreBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.surface }]}
                accessibilityLabel="Добавить ещё фото к этому приёму"
                accessibilityHint="Распознанные позиции добавятся к текущим"
              >
                <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>+ Ещё фото</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { haptic.selection(); setShowAddPanel((v) => !v); }}
                style={[styles.addMoreBtn, { flex: 1, borderColor: showAddPanel ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                accessibilityLabel={showAddPanel ? 'Свернуть список сохранённых продуктов' : 'Открыть список сохранённых продуктов'}
                accessibilityRole="button"
                accessibilityState={{ expanded: showAddPanel }}
              >
                <Text style={[typography.smallMedium, { color: showAddPanel ? colors.primary : colors.textSecondary }]}>
                  {showAddPanel ? '− Свернуть' : '+ Сохранённые'}
                </Text>
              </TouchableOpacity>
            </View>

            {showAddPanel && (() => {
              const q = addPanelQuery.trim().toLowerCase();
              // Saved-foods first (case-insensitive substring), then FOOD_DB
              // (only when there's a query — without one we'd flood the panel
              // with 220 generic entries).
              const savedMatches = q
                ? savedFoods.filter((f) => f.name.toLowerCase().includes(q))
                : savedFoods;
              const dbMatches = q
                ? FOOD_DB.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 10)
                : [];
              const hasNothing = savedMatches.length === 0 && dbMatches.length === 0;

              return (
                <Card style={{ marginBottom: spacing.md }}>
                  {/* Inline search — hidden when there's nothing to search through */}
                  {(savedFoods.length > 0 || q.length > 0) && (
                    <TextInput
                      value={addPanelQuery}
                      onChangeText={setAddPanelQuery}
                      placeholder="Поиск по названию..."
                      placeholderTextColor={colors.inputPlaceholder}
                      style={[styles.addPanelSearch, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                      accessibilityLabel="Поиск продукта по названию"
                      autoCorrect={false}
                    />
                  )}
                  {savedFoods.length === 0 && !q ? (
                    <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.sm }]}>
                      Сохраняй продукты кнопкой + в карточке — они появятся здесь.
                      {'\n'}
                      Или введи название выше — поищем во встроенной базе.
                    </Text>
                  ) : hasNothing ? (
                    <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.sm }]}>
                      Ничего не найдено. Попробуй другое название.
                    </Text>
                  ) : (
                    <>
                      {savedMatches.length > 0 && (
                        <>
                          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.xs }]}>
                            Мои сохранённые ({savedMatches.length})
                          </Text>
                          {savedMatches.slice(0, q ? 50 : 15).map((food) => (
                            <TouchableOpacity
                              key={food.id}
                              onPress={() => { addSavedFoodItem(food); setAddPanelQuery(''); }}
                              style={[styles.savedFoodRow, { borderBottomColor: colors.border }]}
                            >
                              <Text style={[typography.smallMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>{food.name}</Text>
                              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                {food.calories} ккал / {food.weightGrams}г
                              </Text>
                            </TouchableOpacity>
                          ))}
                          {!q && savedFoods.length > 15 && (
                            <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', paddingTop: spacing.xs }]}>
                              + ещё {savedFoods.length - 15} — введи запрос для поиска
                            </Text>
                          )}
                        </>
                      )}
                      {dbMatches.length > 0 && (
                        <>
                          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }]}>
                            База продуктов ({dbMatches.length})
                          </Text>
                          {dbMatches.map((food, i) => (
                            <TouchableOpacity
                              key={`db-${i}-${food.name}`}
                              onPress={() => {
                                addSavedFoodItem({
                                  id: `db-add-${Date.now()}-${i}`,
                                  name: food.name,
                                  calories: food.calories,
                                  protein: food.protein,
                                  fats: food.fats,
                                  carbs: food.carbs,
                                  weightGrams: 100,
                                });
                                setAddPanelQuery('');
                              }}
                              style={[styles.savedFoodRow, { borderBottomColor: colors.border }]}
                            >
                              <Text style={[typography.smallMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>{food.name}</Text>
                              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                                {food.calories} ккал/100г
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </Card>
              );
            })()}

            {/* Undo last removal — auto-dismisses after 6s */}
            {lastRemoved && (
              <View style={[styles.undoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  Удалено: {lastRemoved.item.name}
                </Text>
                <TouchableOpacity
                  onPress={undoRemove}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={`Восстановить ${lastRemoved.item.name}`}
                  accessibilityRole="button"
                >
                  <Text style={[typography.captionMedium, { color: colors.primary, fontWeight: '700' }]}>Отменить</Text>
                </TouchableOpacity>
              </View>
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
              {/* Stacked macro distribution bar — visual at-a-glance ratio of
                  protein : fats : carbs by calorie contribution. Quickly tells
                  the user "this is a fat-heavy meal" vs "this is carb-heavy". */}
              {(() => {
                const totalP = recognizedItems.reduce((s, i) => s + i.protein, 0);
                const totalF = recognizedItems.reduce((s, i) => s + i.fats, 0);
                const totalC = recognizedItems.reduce((s, i) => s + i.carbs, 0);
                const calP = totalP * 4;
                const calF = totalF * 9;
                const calC = totalC * 4;
                const sum = calP + calF + calC;
                if (sum < 1) return null; // no macros — skip the bar
                const pctP = Math.round((calP / sum) * 100);
                const pctF = Math.round((calF / sum) * 100);
                const pctC = Math.max(0, 100 - pctP - pctF); // ensure they sum to 100
                return (
                  <View style={{ marginTop: spacing.md }}>
                    <View style={[styles.macroBar, { backgroundColor: colors.border }]}>
                      <View style={{ width: `${pctP}%`, height: '100%', backgroundColor: colors.protein }} />
                      <View style={{ width: `${pctF}%`, height: '100%', backgroundColor: colors.fats }} />
                      <View style={{ width: `${pctC}%`, height: '100%', backgroundColor: colors.carbs }} />
                    </View>
                    <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 4, textAlign: 'center' }]}>
                      Б {pctP}% · Ж {pctF}% · У {pctC}%
                    </Text>
                  </View>
                );
              })()}
            </Card>

            {/* Remaining calories indicator + "scale to fit" action when over */}
            {dayLog.targetCalories > 0 && (() => {
              const afterMeal = Math.round(alreadyEaten + totalCal);
              const remaining = dayLog.targetCalories - afterMeal;
              const overBy = remaining < 0 ? Math.abs(remaining) : 0;
              const remainingBudget = Math.max(0, dayLog.targetCalories - alreadyEaten);
              return (
                <View style={[{ padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.lg }, { backgroundColor: remaining >= 0 ? colors.success + '15' : colors.error + '15' }]}>
                  <Text style={[typography.small, { color: remaining >= 0 ? colors.success : colors.error }]}>
                    После этого приёма: {afterMeal} / {dayLog.targetCalories} ккал ({remaining >= 0 ? `остаток ${remaining}` : `превышение ${overBy}`} ккал)
                  </Text>
                  {/* "Scale to fit" only appears when (a) we're over budget,
                      (b) there's a positive remaining budget to scale into,
                      and (c) the current total > 0 so we can compute a ratio. */}
                  {overBy > 0 && remainingBudget > 0 && totalCal > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        haptic.medium();
                        // Scale every item's weight by the same factor so its
                        // sum lands on remainingBudget. Reuses applyAIItems'
                        // base-driven recalc by going through state directly.
                        const factor = remainingBudget / totalCal;
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
                      }}
                      style={{ marginTop: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.error + '60', alignSelf: 'flex-start' }}
                      accessibilityLabel={`Уменьшить порции под остаток ${remainingBudget} калорий`}
                      accessibilityHint="Все веса умножатся пропорционально"
                    >
                      <Text style={[typography.captionMedium, { color: colors.error, fontWeight: '700' }]}>
                        Подогнать под остаток ({remainingBudget} ккал)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            <Button
              title="Сохранить в дневник"
              onPress={handleSave}
              fullWidth
              size="lg"
              accessibilityLabel={`Сохранить ${recognizedItems.length} ${recognizedItems.length === 1 ? 'позицию' : 'позиции'} в дневник питания`}
              accessibilityHint={`Всего ${Math.round(totalCal)} калорий`}
            />
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

      {/* Text-description fallback — when a photo isn't practical (dark
          restaurant, already eaten, remembered meal) or when the vision
          path keeps failing, the user can type what they ate and get the
          same item-list response. Same daily quota, same cache. */}
      <Modal visible={textModalOpen} transparent animationType="fade" onRequestClose={() => !textLoading && setTextModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.textModalCard, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>
              Описать еду текстом
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Например: «гречка 150г с курицей 200г и салатом из помидоров». Укажи
              примерный вес — так точнее.
            </Text>
            {/* Quick-start chips — tap to replace the input with a template
                that shows the expected format (weight + product, comma-joined).
                Only shown when the field is empty so we don't clobber user
                typing mid-edit. */}
            {textDescription.length === 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                {[
                  'Овсянка 60г с бананом и 200мл молока',
                  'Гречка 150г, курица 200г, салат',
                  'Яблоко, творог 150г, кофе с молоком',
                ].map((tmpl) => (
                  <TouchableOpacity
                    key={tmpl}
                    onPress={() => { haptic.selection(); setTextDescription(tmpl); }}
                    style={{ paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
                    accessibilityLabel={`Вставить шаблон: ${tmpl}`}
                    accessibilityRole="button"
                  >
                    <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                      {tmpl.length > 32 ? tmpl.slice(0, 30) + '…' : tmpl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput
              value={textDescription}
              onChangeText={setTextDescription}
              placeholder="Что ты ел? С примерным весом..."
              placeholderTextColor={colors.inputPlaceholder}
              style={[styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              multiline
              autoFocus
              maxLength={2000}
              editable={!textLoading}
              accessibilityLabel="Описание еды"
              accessibilityHint="Напишите что ели и примерный вес"
            />
            {/* Character count + short-description hint. Turns warning if
                under 3 chars (which would fail the analyzeByText guard)
                or approaching maxLength. */}
            <Text style={[typography.caption, {
              color: textDescription.length < 3 || textDescription.length >= 1900
                ? colors.warning
                : colors.textTertiary,
              textAlign: 'right',
              marginTop: spacing.xs,
            }]}>
              {textDescription.length < 3
                ? 'Напиши хотя бы несколько слов с весом'
                : `${textDescription.length} / 2000`}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
              <Button
                title="Отмена"
                variant="outline"
                onPress={() => { if (!textLoading) { setTextModalOpen(false); setTextDescription(''); } }}
                style={{ flex: 1 }}
                accessibilityLabel="Отменить и закрыть"
              />
              {textLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <Button
                  title="Распознать"
                  onPress={analyzeByText}
                  disabled={textDescription.trim().length < 3}
                  style={{ flex: 1 }}
                  accessibilityLabel="Распознать описание с помощью AI"
                  accessibilityHint={textDescription.trim().length < 3 ? 'Введите описание длиннее 3 символов' : undefined}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  textModalCard: {
    padding: spacing.xl,
    borderRadius: 16,
  },
  textArea: {
    minHeight: 110,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  fallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  addPanelSearch: {
    height: 40,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  macroBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
});
