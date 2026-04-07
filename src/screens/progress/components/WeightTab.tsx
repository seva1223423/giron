import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { LineChart } from './LineChart';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { userService } from '../../../services';
import type { BodyWeight, BodyMeasurement } from '../../../types';
import { AddWeightModal, AddMeasurementsModal, BodyMeasurementsCard, MEASUREMENTS_KEY } from './weight';

interface WeightTabProps {
  colors: any;
  user: any;
}

export const WeightTab: React.FC<WeightTabProps> = ({ colors, user }) => {
  const haptic = useHaptic();
  const [weightHistory, setWeightHistory] = useState<BodyWeight[]>([]);
  const [loadingWeight, setLoadingWeight] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [measurementHistory, setMeasurementHistory] = useState<BodyMeasurement[]>([]);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);

  const fetchMeasurementHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(MEASUREMENTS_KEY);
      if (raw) {
        const data: BodyMeasurement[] = JSON.parse(raw);
        setMeasurementHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      }
    } catch {}
  }, []);

  const fetchWeightHistory = useCallback(async () => {
    setLoadingWeight(true);
    try {
      const data = await userService.getWeightHistory();
      setWeightHistory(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch {} finally {
      setLoadingWeight(false);
    }
  }, []);

  useEffect(() => {
    fetchWeightHistory();
    fetchMeasurementHistory();
  }, [fetchWeightHistory, fetchMeasurementHistory]);

  return (
    <>
      {/* Current weight + add button */}
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Текущий вес</Text>
              <Text style={[typography.h1, { color: colors.primary, marginTop: 2 }]}>
                {weightHistory.length > 0 ? `${weightHistory[weightHistory.length - 1].weightKg} кг` : user?.weightKg ? `${user.weightKg} кг` : '— кг'}
              </Text>
              {weightHistory.length >= 2 && (() => {
                const diff = weightHistory[weightHistory.length - 1].weightKg - weightHistory[weightHistory.length - 2].weightKg;
                const sign = diff > 0 ? '+' : '';
                const color = diff < 0 ? colors.success : diff > 0 ? colors.error : colors.textSecondary;
                return <Text style={[typography.small, { color, marginTop: 2 }]}>{sign}{diff.toFixed(1)} кг с прошлого замера</Text>;
              })()}
            </View>
            <TouchableOpacity onPress={() => { haptic.light(); setShowWeightModal(true); }} style={[styles.addWeightBtn, { backgroundColor: colors.primary }]}>
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
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Динамика веса</Text>
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
      ) : !loadingWeight && weightHistory.length === 0 ? (
        <FadeIn delay={100}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Добавь первый замер, чтобы отслеживать динамику
            </Text>
          </Card>
        </FadeIn>
      ) : null}

      {/* Weight trend prediction */}
      {weightHistory.length >= 4 && (() => {
        const sample = weightHistory.slice(-8);
        const firstWeight = sample[0].weightKg;
        const lastWeight = sample[sample.length - 1].weightKg;
        const firstDate = new Date(sample[0].date).getTime();
        const lastDate = new Date(sample[sample.length - 1].date).getTime();
        const weeks = (lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000) || 1;
        const weeklyRate = (lastWeight - firstWeight) / weeks;

        let icon: string;
        let message: string;
        let trendColor: string;

        if (Math.abs(weeklyRate) < 0.05) {
          icon = '⚖️';
          message = 'Вес стабилен последние несколько недель';
          trendColor = colors.textSecondary;
        } else if (weeklyRate < 0) {
          icon = '📉';
          message = `Темп: \u2212${Math.abs(weeklyRate).toFixed(1)} кг/нед → \u2212${(Math.abs(weeklyRate) * 4).toFixed(1)} кг/мес`;
          trendColor = colors.success;
        } else {
          icon = '📈';
          message = `Темп: +${weeklyRate.toFixed(1)} кг/нед → +${(weeklyRate * 4).toFixed(1)} кг/мес`;
          trendColor = colors.error;
        }

        return (
          <FadeIn delay={150}>
            <Card style={{ marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 18 }}>{icon}</Text>
                <Text style={[typography.small, { color: trendColor, flex: 1 }]}>{message}</Text>
              </View>
            </Card>
          </FadeIn>
        );
      })()}

      {/* Weight history list */}
      {weightHistory.length > 0 && (
        <FadeIn delay={200}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>История замеров</Text>
            {[...weightHistory].reverse().slice(0, 20).map((entry, i) => (
              <View key={i} style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm }, i < Math.min(weightHistory.length, 20) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                <Text style={[typography.body, { color: colors.text }]}>{new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</Text>
                <Text style={[typography.bodySemibold, { color: colors.primary }]}>{entry.weightKg} кг</Text>
              </View>
            ))}
          </Card>
        </FadeIn>
      )}

      <BodyMeasurementsCard
        measurementHistory={measurementHistory}
        user={user}
        onAddPress={() => { haptic.light(); setShowMeasurementModal(true); }}
        delay={250}
      />

      <AddWeightModal
        visible={showWeightModal}
        onClose={() => setShowWeightModal(false)}
        onSaved={() => { setShowWeightModal(false); fetchWeightHistory(); }}
      />
      <AddMeasurementsModal
        visible={showMeasurementModal}
        measurementHistory={measurementHistory}
        onClose={() => setShowMeasurementModal(false)}
        onSaved={(updated) => { setMeasurementHistory(updated); setShowMeasurementModal(false); }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  addWeightBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
