import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { LineChart } from './LineChart';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { userService } from '../../../services';
import { BodyWeight, BodyMeasurement } from '../../../types';

const MEASUREMENTS_KEY = 'iron_gym_body_measurements';

const MEASUREMENT_FIELDS: { key: keyof BodyMeasurement; label: string; emoji: string }[] = [
  { key: 'chest', label: 'Грудь', emoji: '💪' },
  { key: 'waist', label: 'Талия', emoji: '📏' },
  { key: 'hips', label: 'Бёдра', emoji: '🦵' },
  { key: 'bicep', label: 'Бицепс', emoji: '💪' },
  { key: 'thigh', label: 'Бедро', emoji: '🦵' },
  { key: 'calf', label: 'Икра', emoji: '🦿' },
  { key: 'neck', label: 'Шея', emoji: '📐' },
];

interface WeightTabProps {
  colors: any;
  user: any;
}

export const WeightTab: React.FC<WeightTabProps> = ({ colors, user }) => {
  const haptic = useHaptic();

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

  // Body fat % estimation (US Navy method) from latest measurements
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
      const val = 163.205 * Math.log10(waist + hips - neck) - 97.684 * Math.log10(heightCm) - 78.387;
      pct = Math.max(5, Math.min(60, Math.round(val * 10) / 10));
    } else {
      const val = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(heightCm) + 36.76;
      pct = Math.max(3, Math.min(60, Math.round(val * 10) / 10));
    }
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
    fetchWeightHistory();
    fetchMeasurementHistory();
  }, [fetchWeightHistory, fetchMeasurementHistory]);

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

  return (
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
    </>
  );
};

const styles = StyleSheet.create({
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
});
