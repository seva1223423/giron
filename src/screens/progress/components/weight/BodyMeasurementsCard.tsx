import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../../store';
import { Card, FadeIn } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing, borderRadius } from '../../../../theme/spacing';
import type { BodyMeasurement } from '../../../../types';
import { MEASUREMENT_FIELDS } from './AddMeasurementsModal';

interface Props {
  measurementHistory: BodyMeasurement[];
  user: any;
  onAddPress: () => void;
  delay?: number;
}

export const BodyMeasurementsCard: React.FC<Props> = ({ measurementHistory, user, onAddPress, delay = 250 }) => {
  const { colors } = useThemeStore();

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

  const latest = measurementHistory.length > 0 ? measurementHistory[measurementHistory.length - 1] : null;
  const prev = measurementHistory.length >= 2 ? measurementHistory[measurementHistory.length - 2] : null;

  return (
    <>
      <FadeIn delay={delay}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.h4, { color: colors.text }]}>Обхваты тела</Text>
            <TouchableOpacity onPress={onAddPress} style={[styles.addBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}>
              <Text style={[typography.captionMedium, { color: colors.accent }]}>+ Замер</Text>
            </TouchableOpacity>
          </View>

          {!latest ? (
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }]}>
              Добавь первый замер обхватов
            </Text>
          ) : (
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
                    <View key={key} style={[styles.measureBox, { backgroundColor: colors.surface }]}>
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
                        const parts = MEASUREMENT_FIELDS.filter(({ key }) => m[key] != null).map(({ key, label }) => `${label}: ${m[key]} см`);
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
          )}
        </Card>
      </FadeIn>

      {bodyFatEstimate !== null && (
        <FadeIn delay={delay + 50}>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Жировая масса (Navy метод)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                  <Text style={[typography.number, { color: bodyFatEstimate.color, fontSize: 36 }]}>{bodyFatEstimate.pct}</Text>
                  <Text style={[typography.h4, { color: bodyFatEstimate.color }]}>%</Text>
                </View>
                <View style={[{ alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full, backgroundColor: bodyFatEstimate.color + '20' }]}>
                  <Text style={[typography.captionMedium, { color: bodyFatEstimate.color }]}>{bodyFatEstimate.category}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 32 }}>🔬</Text>
            </View>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.md }]}>
              Рассчитано по методу ВМФ США на основе замеров шеи, талии{user?.gender === 'female' ? ', бёдер' : ''} и роста из профиля
            </Text>
          </Card>
        </FadeIn>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  addBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
  measureBox: { borderRadius: borderRadius.md, padding: spacing.sm, minWidth: 90, alignItems: 'center' },
});
