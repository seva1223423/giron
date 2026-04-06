import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, TextInput, Modal, Alert, ActivityIndicator, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '../../hooks/useHaptic';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore, useWorkoutStore, useAuthStore, useNutritionStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { userService } from '../../services';
import { BodyWeight, BodyMeasurement } from '../../types';
import { computeAchievements, ACHIEVEMENT_DEFINITIONS, Achievement } from '../../utils/achievements';
import { BarChart, LineChart, WeeklyHeatmap, OverviewTab, CalendarTab, AchievementsTab, RecordsTab } from './components';

const MEASUREMENTS_KEY = 'iron_gym_body_measurements';
const PROGRESS_PHOTOS_KEY = 'iron_gym_progress_photos';

interface ProgressPhoto {
  id: string;
  uri: string;
  date: string; // ISO date string
  note?: string;
}

const MEASUREMENT_FIELDS: { key: keyof BodyMeasurement; label: string; emoji: string }[] = [
  { key: 'chest', label: 'Грудь', emoji: '💪' },
  { key: 'waist', label: 'Талия', emoji: '📏' },
  { key: 'hips', label: 'Бёдра', emoji: '🦵' },
  { key: 'bicep', label: 'Бицепс', emoji: '💪' },
  { key: 'thigh', label: 'Бедро', emoji: '🦵' },
  { key: 'calf', label: 'Икра', emoji: '🦿' },
  { key: 'neck', label: 'Шея', emoji: '📐' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - spacing.xl * 2 - spacing.lg * 2;



export const ProgressScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { user } = useAuthStore();
  const { dailyLog } = useNutritionStore();
  const [tab, setTab] = useState<'overview' | 'calendar' | 'records' | 'weight' | 'achievements' | 'photos'>('overview');


  // Body weight state
  const [weightHistory, setWeightHistory] = useState<BodyWeight[]>([]);
  const [loadingWeight, setLoadingWeight] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  // Body measurements state
  const [measurementHistory, setMeasurementHistory] = useState<BodyMeasurement[]>([]);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [newMeasurements, setNewMeasurements] = useState<Partial<Record<keyof BodyMeasurement, string>>>({});
  const [savingMeasurements, setSavingMeasurements] = useState(false);

  // Progress photos state
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [photoNoteInput, setPhotoNoteInput] = useState('');
  const [showPhotoNoteModal, setShowPhotoNoteModal] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const fetchProgressPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_PHOTOS_KEY);
      if (raw) {
        const data: ProgressPhoto[] = JSON.parse(raw);
        setProgressPhotos(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingPhotos(false);
    }
  }, []);

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к фото в настройках телефона');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingPhotoUri(result.assets[0].uri);
      setPhotoNoteInput('');
      setShowPhotoNoteModal(true);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках телефона');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingPhotoUri(result.assets[0].uri);
      setPhotoNoteInput('');
      setShowPhotoNoteModal(true);
    }
  };

  const handleSavePhoto = async () => {
    if (!pendingPhotoUri) return;
    const newPhoto: ProgressPhoto = {
      id: `photo-${Date.now()}`,
      uri: pendingPhotoUri,
      date: new Date().toISOString(),
      note: photoNoteInput.trim() || undefined,
    };
    try {
      const updated = [newPhoto, ...progressPhotos];
      await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(updated));
      setProgressPhotos(updated);
      setShowPhotoNoteModal(false);
      setPendingPhotoUri(null);
      haptic.success();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить фото');
    }
  };

  const handleDeletePhoto = async (id: string) => {
    Alert.alert('Удалить фото?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const updated = progressPhotos.filter((p) => p.id !== id);
          await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(updated));
          setProgressPhotos(updated);
          if (selectedPhotoId === id) setSelectedPhotoId(null);
          haptic.warning();
        },
      },
    ]);
  };

  // Body fat % estimation (US Navy method) from latest measurements
  // Requires: waist, neck (men) or waist, hips, neck (women) + user height
  const bodyFatEstimate = useMemo((): { pct: number; category: string; color: string } | null => {
    if (measurementHistory.length === 0) return null;
    const latest = measurementHistory[measurementHistory.length - 1];
    const heightCm = user?.heightCm;
    const gender = user?.gender;
    if (!heightCm || !latest.waist || !latest.neck) return null;
    const { waist, neck, hips } = latest;
    let pct: number;
    if (gender === 'female') {
      if (!hips) return null;
      // Navy formula for women
      const val = 163.205 * Math.log10(waist + hips - neck) - 97.684 * Math.log10(heightCm) - 78.387;
      pct = Math.max(5, Math.min(60, Math.round(val * 10) / 10));
    } else {
      // Navy formula for men (default)
      const val = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(heightCm) + 36.76;
      pct = Math.max(3, Math.min(60, Math.round(val * 10) / 10));
    }
    // Category classification
    let category: string;
    let color: string;
    if (gender === 'female') {
      if (pct < 14) { category = 'Очень низкий'; color = '#FF9800'; }
      else if (pct < 21) { category = 'Спортсмен'; color = '#4CAF50'; }
      else if (pct < 25) { category = 'Фитнес'; color = '#2196F3'; }
      else if (pct < 32) { category = 'Норма'; color = '#9E9E9E'; }
      else { category = 'Выше нормы'; color = '#FF5722'; }
    } else {
      if (pct < 6) { category = 'Очень низкий'; color = '#FF9800'; }
      else if (pct < 14) { category = 'Спортсмен'; color = '#4CAF50'; }
      else if (pct < 18) { category = 'Фитнес'; color = '#2196F3'; }
      else if (pct < 25) { category = 'Норма'; color = '#9E9E9E'; }
      else { category = 'Выше нормы'; color = '#FF5722'; }
    }
    return { pct, category, color };
  }, [measurementHistory, user]);

  const fetchMeasurementHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEASUREMENTS_KEY);
      if (raw) {
        const data: BodyMeasurement[] = JSON.parse(raw);
        setMeasurementHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      }
    } catch {
      // silently fail
    }
  }, []);

  const handleAddMeasurements = async () => {
    const today = new Date().toISOString().split('T')[0];
    const entry: BodyMeasurement = { date: today };
    let hasAny = false;
    MEASUREMENT_FIELDS.forEach(({ key }) => {
      const val = parseFloat((newMeasurements[key] ?? '').replace(',', '.'));
      if (val > 0 && val < 200) { (entry as any)[key] = val; hasAny = true; }
    });
    if (!hasAny) { Alert.alert('Ошибка', 'Введи хотя бы одно измерение'); return; }
    setSavingMeasurements(true);
    try {
      const updated = [...measurementHistory.filter((m) => m.date !== today), entry]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      await AsyncStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(updated));
      setMeasurementHistory(updated);
      setNewMeasurements({});
      setShowMeasurementModal(false);
      haptic.success();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить измерения');
    } finally {
      setSavingMeasurements(false);
    }
  };

  const fetchWeightHistory = useCallback(async () => {
    setLoadingWeight(true);
    try {
      const data = await userService.getWeightHistory();
      setWeightHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch {
      // silently fail
    } finally {
      setLoadingWeight(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'weight') { fetchWeightHistory(); fetchMeasurementHistory(); }
    if (tab === 'photos') fetchProgressPhotos();
  }, [tab, fetchWeightHistory, fetchMeasurementHistory, fetchProgressPhotos]);

  const handleAddWeight = async () => {
    const kg = parseFloat(newWeight.replace(',', '.'));
    if (!kg || kg < 20 || kg > 300) {
      Alert.alert('Ошибка', 'Введи корректный вес (20–300 кг)');
      return;
    }
    setSavingWeight(true);
    try {
      await userService.addWeight(kg);
      haptic.success();
      setShowWeightModal(false);
      setNewWeight('');
      await fetchWeightHistory();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить вес');
    } finally {
      setSavingWeight(false);
    }
  };

  const totalWorkouts = workoutHistory.length;
  const totalVolume = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const totalDuration = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      if (workoutHistory.some((w) => w.completedAt && w.completedAt.startsWith(dateStr))) {
        s++;
      } else if (i > 0) {
        break;
      }
    }
    return s;
  }, [workoutHistory]);

  // Weekly volume data for last 8 weeks
  const weeklyVolumeData = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const today = new Date();

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - w * 7 - today.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const volume = workoutHistory
        .filter((wk) => {
          if (!wk.completedAt) return false;
          const d = new Date(wk.completedAt);
          return d >= weekStart && d < weekEnd;
        })
        .reduce((s, wk) => s + (wk.totalVolume || 0), 0);

      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ label, value: Math.round(volume) });
    }

    return weeks;
  }, [workoutHistory]);

  // Weekly workout count
  const weeklyCountData = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const today = new Date();

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - w * 7 - today.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const count = workoutHistory.filter((wk) => {
        if (!wk.completedAt) return false;
        const d = new Date(wk.completedAt);
        return d >= weekStart && d < weekEnd;
      }).length;

      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      weeks.push({ label, value: count });
    }

    return weeks;
  }, [workoutHistory]);

  // Average workout duration over last 10 workouts
  const durationTrend = useMemo(() => {
    return workoutHistory
      .slice(0, 10)
      .reverse()
      .map((w, i) => ({
        label: `${i + 1}`,
        value: w.durationMinutes || 0,
      }));
  }, [workoutHistory]);

  // Workout dates for heatmap
  const workoutDates = useMemo(() => {
    return workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => w.completedAt!);
  }, [workoutHistory]);



  // Muscle group distribution
  const muscleDistribution = useMemo(() => {
    const muscles: Record<string, number> = {};
    const labels: Record<string, string> = {
      chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
      triceps: 'Трицепс', quadriceps: 'Ноги', hamstrings: 'Задняя', glutes: 'Ягодицы',
      abs: 'Пресс', calves: 'Икры',
    };

    workoutHistory.forEach((w) => {
      w.exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed).length;
        ex.exercise.primaryMuscles.forEach((m) => {
          muscles[m] = (muscles[m] || 0) + completedSets;
        });
      });
    });

    return Object.entries(muscles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => ({ label: labels[key] || key, value }));
  }, [workoutHistory]);

  // Nutrition days logged (distinct dates with at least 1 meal)
  const nutritionDaysLogged = useMemo(() => {
    return Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
  }, [dailyLog]);

  // Achievements
  const achievements = useMemo(() =>
    computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak }),
  [workoutHistory, nutritionDaysLogged, streak]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const tabs = [
    { key: 'overview', label: 'Обзор' },
    { key: 'calendar', label: 'Календарь' },
    { key: 'records', label: 'Рекорды' },
    { key: 'weight', label: 'Вес тела' },
    { key: 'achievements', label: `🏅 ${unlockedCount}/${ACHIEVEMENT_DEFINITIONS.length}` },
    { key: 'photos', label: '📸 Фото' },
  ] as const;


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h2, { color: colors.text, paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md }]}>
        Прогресс
      </Text>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[{ borderBottomWidth: 1, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { haptic.selection(); setTab(t.key); }}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[typography.smallMedium, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'overview' && (
          <OverviewTab
            colors={colors}
            totalWorkouts={totalWorkouts}
            streak={streak}
            totalVolume={totalVolume}
            totalDuration={totalDuration}
            workoutDates={workoutDates}
            weeklyVolumeData={weeklyVolumeData}
            weeklyCountData={weeklyCountData}
            muscleDistribution={muscleDistribution}
            durationTrend={durationTrend}
            workoutHistory={workoutHistory}
          />
        )}

        {tab === 'calendar' && (
          <CalendarTab colors={colors} workoutHistory={workoutHistory} />
        )}

        {tab === 'records' && (
          <RecordsTab colors={colors} workoutHistory={workoutHistory} weightHistory={weightHistory} user={user} />
        )}
        {tab === 'weight' && (
          <>
            {/* Current weight + add button */}
            <FadeIn delay={0}>
              <Card style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>Текущий вес</Text>
                    <Text style={[typography.h1, { color: colors.primary, marginTop: 2 }]}>
                      {weightHistory.length > 0
                        ? `${weightHistory[weightHistory.length - 1].weightKg} кг`
                        : user?.weightKg ? `${user.weightKg} кг` : '— кг'}
                    </Text>
                    {weightHistory.length >= 2 && (() => {
                      const diff = weightHistory[weightHistory.length - 1].weightKg - weightHistory[weightHistory.length - 2].weightKg;
                      const sign = diff > 0 ? '+' : '';
                      const color = diff < 0 ? colors.success : diff > 0 ? colors.error : colors.textSecondary;
                      return (
                        <Text style={[typography.small, { color, marginTop: 2 }]}>
                          {sign}{diff.toFixed(1)} кг с прошлого замера
                        </Text>
                      );
                    })()}
                  </View>
                  <TouchableOpacity
                    onPress={() => { haptic.light(); setShowWeightModal(true); }}
                    style={[styles.addWeightBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={{ color: '#fff', fontSize: 22, lineHeight: 26 }}>+</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </FadeIn>

            {/* Weight chart */}
            {loadingWeight ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : weightHistory.length >= 2 ? (
              <FadeIn delay={100}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    Динамика веса
                  </Text>
                  <LineChart
                    data={weightHistory.slice(-12).map((w) => ({
                      label: new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
                      value: w.weightKg,
                    }))}
                    color={colors.primary}
                    colors={colors}
                    suffix=" кг"
                    height={140}
                  />
                </Card>
              </FadeIn>
            ) : weightHistory.length === 0 && !loadingWeight ? (
              <FadeIn delay={100}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Добавь первый замер, чтобы отслеживать динамику
                  </Text>
                </Card>
              </FadeIn>
            ) : null}

            {/* Weight history list */}
            {weightHistory.length > 0 && (
              <FadeIn delay={200}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    История замеров
                  </Text>
                  {[...weightHistory].reverse().slice(0, 20).map((entry, i) => (
                    <View
                      key={i}
                      style={[
                        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
                        i < Math.min(weightHistory.length, 20) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                      ]}
                    >
                      <Text style={[typography.body, { color: colors.text }]}>
                        {new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                      </Text>
                      <Text style={[typography.bodySemibold, { color: colors.primary }]}>
                        {entry.weightKg} кг
                      </Text>
                    </View>
                  ))}
                </Card>
              </FadeIn>
            )}

            {/* Body measurements section */}
            <FadeIn delay={250}>
              <Card style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <Text style={[typography.h4, { color: colors.text }]}>Обхваты тела</Text>
                  <TouchableOpacity
                    onPress={() => { haptic.light(); setShowMeasurementModal(true); }}
                    style={[{ backgroundColor: colors.accent + '15', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.accent + '40' }]}
                  >
                    <Text style={[typography.captionMedium, { color: colors.accent }]}>+ Замер</Text>
                  </TouchableOpacity>
                </View>

                {measurementHistory.length === 0 ? (
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }]}>
                    Добавь первый замер обхватов
                  </Text>
                ) : (() => {
                  const latest = measurementHistory[measurementHistory.length - 1];
                  const prev = measurementHistory.length >= 2 ? measurementHistory[measurementHistory.length - 2] : null;
                  return (
                    <>
                      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                        {new Date(latest.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                        {MEASUREMENT_FIELDS.filter(({ key }) => latest[key] != null).map(({ key, label, emoji }) => {
                          const val = latest[key] as number;
                          const prevVal = prev?.[key] as number | undefined;
                          const diff = prevVal != null ? val - prevVal : null;
                          return (
                            <View
                              key={key}
                              style={[{ backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, minWidth: 90, alignItems: 'center' }]}
                            >
                              <Text style={{ fontSize: 16 }}>{emoji}</Text>
                              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{label}</Text>
                              <Text style={[typography.bodySemibold, { color: colors.primary }]}>{val} см</Text>
                              {diff != null && diff !== 0 && (
                                <Text style={[typography.caption, { color: diff < 0 ? colors.success : colors.error, fontSize: 10 }]}>
                                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>

                      {measurementHistory.length >= 2 && (
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              'История замеров',
                              [...measurementHistory].reverse().slice(0, 10).map((m) => {
                                const parts = MEASUREMENT_FIELDS
                                  .filter(({ key }) => m[key] != null)
                                  .map(({ key, label }) => `${label}: ${m[key]} см`);
                                return `${new Date(m.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}\n${parts.join(', ')}`;
                              }).join('\n\n')
                            );
                          }}
                          style={{ marginTop: spacing.md }}
                        >
                          <Text style={[typography.caption, { color: colors.primary, textAlign: 'center' }]}>
                            История ({measurementHistory.length} замеров) ›
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()}
              </Card>
            </FadeIn>

            {/* Body fat % estimate card */}
            {bodyFatEstimate !== null && (
              <FadeIn delay={300}>
                <Card style={{ marginBottom: spacing.lg }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                        Жировая масса (Navy метод)
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                        <Text style={[typography.number, { color: bodyFatEstimate.color, fontSize: 36 }]}>
                          {bodyFatEstimate.pct}
                        </Text>
                        <Text style={[typography.h4, { color: bodyFatEstimate.color }]}>%</Text>
                      </View>
                      <View style={[{ alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full, backgroundColor: bodyFatEstimate.color + '20' }]}>
                        <Text style={[typography.captionMedium, { color: bodyFatEstimate.color }]}>
                          {bodyFatEstimate.category}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 32 }}>🔬</Text>
                    </View>
                  </View>
                  <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.md }]}>
                    Рассчитано по методу ВМФ США на основе замеров шеи, талии{user?.gender === 'female' ? ', бёдер' : ''} и роста из профиля
                  </Text>
                </Card>
              </FadeIn>
            )}
          </>
        )}

        {tab === 'photos' && (
          <>
            {/* Header row */}
            <FadeIn delay={0}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                <View>
                  <Text style={[typography.h3, { color: colors.text }]}>Фото прогресса</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    {progressPhotos.length} {progressPhotos.length === 1 ? 'фото' : progressPhotos.length < 5 ? 'фото' : 'фото'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {progressPhotos.length >= 2 && (
                    <TouchableOpacity
                      onPress={() => { haptic.selection(); setCompareMode((v) => !v); }}
                      style={[
                        styles.photoActionBtn,
                        { backgroundColor: compareMode ? colors.primary : colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[typography.captionMedium, { color: compareMode ? '#fff' : colors.text }]}>
                        Сравнить
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </FadeIn>

            {/* Add photo buttons */}
            <FadeIn delay={60}>
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}>
                <TouchableOpacity
                  onPress={handleTakePhoto}
                  style={[styles.addPhotoBtn, { backgroundColor: colors.primary, flex: 1 }]}
                >
                  <Text style={{ fontSize: 20 }}>📷</Text>
                  <Text style={[typography.captionMedium, { color: '#fff', marginTop: 4 }]}>Камера</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddPhoto}
                  style={[styles.addPhotoBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
                >
                  <Text style={{ fontSize: 20 }}>🖼️</Text>
                  <Text style={[typography.captionMedium, { color: colors.text, marginTop: 4 }]}>Галерея</Text>
                </TouchableOpacity>
              </View>
            </FadeIn>

            {/* Compare view — side by side */}
            {compareMode && progressPhotos.length >= 2 && (
              <FadeIn delay={80}>
                <Card style={{ marginBottom: spacing.xl }}>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md, textAlign: 'center' }]}>
                    СРАВНЕНИЕ: первое vs последнее
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {[progressPhotos[progressPhotos.length - 1], progressPhotos[0]].map((photo, idx) => (
                      <View key={photo.id} style={{ flex: 1 }}>
                        <Image
                          source={{ uri: photo.uri }}
                          style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: borderRadius.md }}
                          resizeMode="cover"
                        />
                        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }]}>
                          {idx === 0 ? 'Начало' : 'Сейчас'}
                        </Text>
                        <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center' }]}>
                          {new Date(photo.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {progressPhotos.length >= 2 && (() => {
                    const firstDate = new Date(progressPhotos[progressPhotos.length - 1].date);
                    const lastDate = new Date(progressPhotos[0].date);
                    const days = Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
                    return days > 0 ? (
                      <Text style={[typography.captionMedium, { color: colors.primary, textAlign: 'center', marginTop: spacing.md }]}>
                        {days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} трансформации
                      </Text>
                    ) : null;
                  })()}
                </Card>
              </FadeIn>
            )}

            {/* Loading state */}
            {loadingPhotos && (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {/* Empty state */}
            {!loadingPhotos && progressPhotos.length === 0 && (
              <FadeIn delay={120}>
                <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                  <Text style={{ fontSize: 56 }}>📸</Text>
                  <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg }]}>
                    Начни фото-дневник
                  </Text>
                  <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>
                    Регулярные фото — лучший способ видеть реальный прогресс, который цифры не всегда показывают
                  </Text>
                </View>
              </FadeIn>
            )}

            {/* Photos grid */}
            {!loadingPhotos && progressPhotos.length > 0 && (
              <FadeIn delay={100}>
                <View style={styles.photosGrid}>
                  {progressPhotos.map((photo, i) => {
                    const isSelected = selectedPhotoId === photo.id;
                    return (
                      <View key={photo.id} style={styles.photoCell}>
                        <TouchableOpacity
                          onPress={() => {
                            haptic.selection();
                            setSelectedPhotoId(isSelected ? null : photo.id);
                          }}
                          onLongPress={() => handleDeletePhoto(photo.id)}
                          activeOpacity={0.85}
                        >
                          <Image
                            source={{ uri: photo.uri }}
                            style={[
                              styles.photoThumb,
                              isSelected && { borderColor: colors.primary, borderWidth: 2 },
                            ]}
                            resizeMode="cover"
                          />
                          {i === 0 && (
                            <View style={[styles.photoBadge, { backgroundColor: colors.primary }]}>
                              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>NOW</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                        <Text style={[typography.small, { color: colors.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 10 }]}>
                          {new Date(photo.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </Text>
                        {photo.note ? (
                          <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', fontSize: 9 }]} numberOfLines={1}>
                            {photo.note}
                          </Text>
                        ) : null}
                        {isSelected && (
                          <TouchableOpacity
                            onPress={() => handleDeletePhoto(photo.id)}
                            style={[styles.deletePhotoBtn, { backgroundColor: colors.error + '20', borderColor: colors.error }]}
                          >
                            <Text style={[typography.small, { color: colors.error, fontSize: 10 }]}>Удалить</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
                <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.lg }]}>
                  Удержи фото для удаления
                </Text>
              </FadeIn>
            )}
          </>
        )}

        {tab === 'achievements' && (
          <AchievementsTab colors={colors} achievements={achievements} unlockedCount={unlockedCount} />
        )}
      </ScrollView>

      {/* Add measurements modal */}
      <Modal visible={showMeasurementModal} transparent animationType="slide" onRequestClose={() => setShowMeasurementModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 0, paddingBottom: 48 }]}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Замер обхватов</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>Заполни только те поля, которые хочешь отследить</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MEASUREMENT_FIELDS.map(({ key, label, emoji }) => (
                <View key={key} style={{ marginBottom: spacing.md }}>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                    {emoji} {label.toUpperCase()}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <TextInput
                      style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, flex: 1 }]}
                      value={newMeasurements[key] ?? ''}
                      onChangeText={(v) => setNewMeasurements((prev) => ({ ...prev, [key]: v }))}
                      placeholder="—"
                      placeholderTextColor={colors.inputPlaceholder}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />
                    <Text style={[typography.body, { color: colors.textSecondary }]}>см</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                onPress={() => { setShowMeasurementModal(false); setNewMeasurements({}); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddMeasurements}
                disabled={savingMeasurements}
                style={[styles.modalBtn, { backgroundColor: colors.accent, flex: 1 }]}
              >
                {savingMeasurements
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo note modal */}
      <Modal visible={showPhotoNoteModal} transparent animationType="fade" onRequestClose={() => setShowPhotoNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>
              Добавить фото
            </Text>
            {pendingPhotoUri && (
              <Image
                source={{ uri: pendingPhotoUri }}
                style={{ width: '100%', height: 180, borderRadius: borderRadius.md, marginBottom: spacing.md }}
                resizeMode="cover"
              />
            )}
            <TextInput
              style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, height: 48, paddingHorizontal: spacing.md }]}
              value={photoNoteInput}
              onChangeText={setPhotoNoteInput}
              placeholder="Заметка (необязательно)..."
              placeholderTextColor={colors.inputPlaceholder}
              maxLength={80}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity
                onPress={() => { setShowPhotoNoteModal(false); setPendingPhotoUri(null); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePhoto}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>

      {/* Add weight modal */}
      <Modal visible={showWeightModal} transparent animationType="fade" onRequestClose={() => setShowWeightModal(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.md }]}>
              Записать вес
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TextInput
                style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={newWeight}
                onChangeText={setNewWeight}
                placeholder="85.5"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="decimal-pad"
                autoFocus
                maxLength={6}
              />
              <Text style={[typography.h4, { color: colors.textSecondary }]}>кг</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                onPress={() => { setShowWeightModal(false); setNewWeight(''); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddWeight}
                disabled={savingWeight}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]}
              >
                {savingWeight
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
                }
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
};

const CELL_SIZE = (SCREEN_WIDTH - spacing.xl * 2) / 7;

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { width: (SCREEN_WIDTH - spacing.xl * 2 - spacing.md) / 2 - 1, alignItems: 'center', paddingVertical: spacing.xl },
  monthNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  calendarHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  workoutDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  segmentControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: 3,
    marginBottom: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  addWeightBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: { padding: spacing.xl },
  achievementProgressBar: {
    height: 6,
    borderRadius: 3,
    width: '70%',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  achievementProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  weightInput: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBtn: {
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photoCell: {
    width: (SCREEN_WIDTH - spacing.xl * 2 - spacing.md * 2) / 3,
    alignItems: 'center',
  },
  photoThumb: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.md,
  },
  photoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addPhotoBtn: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  deletePhotoBtn: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
});
