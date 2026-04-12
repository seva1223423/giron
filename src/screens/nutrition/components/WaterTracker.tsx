import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const QUICK_AMOUNTS = [
  { label: 'Стакан', ml: 250 },
  { label: 'Бутылка', ml: 500 },
  { label: '1 литр', ml: 1000 },
];

interface Props {
  selectedDate: string;
}

export const WaterTracker: React.FC<Props> = ({ selectedDate }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const { getDayLog, addWater } = useNutritionStore();
  const user = useAuthStore((s) => s.user);
  const dayLog = getDayLog(selectedDate);
  const waterTarget = dayLog.waterTargetMl ?? 2500;

  const [excessWarning, setExcessWarning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const waterPercent = waterTarget > 0 ? dayLog.waterMl / waterTarget : 0;
  const remaining = Math.max(0, waterTarget - dayLog.waterMl);

  // Estimated water from food (~60% average water content of food by weight)
  const estimatedFoodWater = useMemo(() => {
    const totalFoodGrams = dayLog.meals.reduce((sum, m) =>
      sum + m.items.reduce((s, item) => s + (item.weightGrams || 0), 0), 0);
    return Math.round(totalFoodGrams * 0.6);
  }, [dayLog.meals]);

  // Recommended daily water based on body weight
  const recommendedMl = Math.round((user?.weightKg || 70) * 35);

  const handleAddWater = (amount: number) => {
    const currentTotal = dayLog.waterMl + amount;
    if (currentTotal > 5000 && !excessWarning) {
      setExcessWarning(true);
    }
    haptic.light();
    addWater(selectedDate, amount);
  };

  const waterLog = dayLog.waterLog || [];

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View>
          <Text style={[typography.h4, { color: colors.text }]}>Вода</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            {dayLog.waterMl >= 1000 ? `${(dayLog.waterMl / 1000).toFixed(1)}л` : `${dayLog.waterMl}мл`} / {waterTarget >= 1000 ? `${(waterTarget / 1000).toFixed(1)}л` : `${waterTarget}мл`}
          </Text>
        </View>
        {waterLog.length > 0 && (
          <TouchableOpacity onPress={() => setShowHistory((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.caption, { color: colors.primary }]}>
              {showHistory ? 'скрыть' : `история (${waterLog.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      <View style={[styles.waterBar, { backgroundColor: colors.progressBarBackground }]}>
        <View style={{
          height: '100%', width: `${Math.min(waterPercent * 100, 100)}%`,
          backgroundColor: waterPercent >= 1 ? colors.success : colors.info,
          borderRadius: borderRadius.full,
        }} />
      </View>

      {/* Quick add buttons */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        {QUICK_AMOUNTS.map(({ label, ml }) => (
          <TouchableOpacity
            key={ml}
            style={[styles.waterBtn, { backgroundColor: colors.info + '12', borderColor: colors.info + '60', flex: 1 }]}
            onPress={() => handleAddWater(ml)}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.info }}>{label}</Text>
            <Text style={{ fontSize: 10, color: colors.info + 'AA' }}>{ml}мл</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Day history */}
      {showHistory && waterLog.length > 0 && (
        <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm }}>
          <Text style={[typography.captionMedium, { color: colors.textTertiary, marginBottom: spacing.xs }]}>История за день</Text>
          <ScrollView style={{ maxHeight: 120 }} showsVerticalScrollIndicator={false}>
            {[...waterLog].reverse().map((entry, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <Text style={[typography.small, { color: colors.textSecondary }]}>{entry.time}</Text>
                <Text style={[typography.small, { color: colors.info, fontWeight: '600' }]}>+{entry.ml} мл</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Footer info */}
      <View style={{ marginTop: spacing.sm, gap: 2 }}>
        {estimatedFoodWater > 0 && (
          <Text style={[typography.caption, { color: colors.textTertiary }]}>
            + ~{estimatedFoodWater} мл из еды
          </Text>
        )}
        <Text style={[typography.caption, { color: colors.textTertiary }]}>
          Рекомендация: {recommendedMl} мл/день
        </Text>
        {waterPercent < 0.3 && (
          <Text style={[typography.caption, { color: colors.error }]}>
            Пей воду регулярно — даже 2% обезвоживания снижает производительность
          </Text>
        )}
        {waterPercent >= 0.8 && waterPercent < 1.0 && (
          <Text style={[typography.caption, { color: colors.success }]}>
            Почти у цели! Осталось {remaining} мл
          </Text>
        )}
        {waterPercent >= 1.0 && (
          <Text style={[typography.caption, { color: colors.success }]}>
            Норма воды выполнена! Отличная работа
          </Text>
        )}
        {excessWarning && dayLog.waterMl > 5000 && (
          <Text style={[typography.caption, { color: colors.warning }]}>
            Более 5 литров воды в день может быть избыточным
          </Text>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  waterBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, alignItems: 'center' },
  waterBar: { height: 8, borderRadius: borderRadius.full, marginTop: spacing.md, overflow: 'hidden' },
});
