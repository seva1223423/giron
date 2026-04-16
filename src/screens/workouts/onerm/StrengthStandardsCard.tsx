import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const STRENGTH_STANDARDS: Record<string, { male: number[]; female: number[]; label: string }> = {
  squat: { label: 'Присед со штангой', male: [50, 75, 100, 142, 197], female: [30, 47, 65, 90, 120] },
  bench: { label: 'Жим лёжа', male: [37, 57, 80, 112, 150], female: [20, 32, 45, 63, 84] },
  deadlift: { label: 'Становая тяга', male: [65, 97, 130, 180, 240], female: [42, 62, 85, 115, 153] },
  ohp: { label: 'Жим стоя', male: [25, 37, 52, 72, 97], female: [13, 20, 29, 40, 55] },
  row: { label: 'Тяга штанги в наклоне', male: [40, 60, 82, 112, 150], female: [22, 33, 46, 63, 84] },
};
const STANDARD_LABELS = ['Новичок', 'Начинающий', 'Средний', 'Продвинутый', 'Элита'];
const STANDARD_COLORS = ['#9E9E9E', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

interface Props {
  oneRM: number;
  userWeight: number;
  userGender: 'male' | 'female';
  delay?: number;
}

export const StrengthStandardsCard: React.FC<Props> = ({ oneRM, userWeight, userGender, delay = 240 }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const standardsForSelected = useMemo(() => {
    if (!selectedKey) return null;
    const std = STRENGTH_STANDARDS[selectedKey];
    if (!std) return null;
    if (!userWeight || userWeight <= 0) return null;
    const refWeight = userGender === 'female' ? 60 : 80;
    const scaleFactor = userWeight / refWeight;
    return std[userGender].map((v, i) => ({
      label: STANDARD_LABELS[i],
      color: STANDARD_COLORS[i],
      value: Math.round(v * scaleFactor),
      met: oneRM >= Math.round(v * scaleFactor),
    }));
  }, [selectedKey, oneRM, userWeight, userGender]);

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>Сравнение с нормативами</Text>
        <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.md }]}>
          Выбери упражнение для сравнения со стандартами (вес тела: {userWeight} кг)
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {Object.entries(STRENGTH_STANDARDS).map(([key, val]) => (
              <TouchableOpacity
                key={key}
                onPress={() => { haptic.selection(); setSelectedKey(selectedKey === key ? null : key); }}
                style={[styles.chip, { backgroundColor: selectedKey === key ? colors.primary : colors.surface, borderColor: selectedKey === key ? colors.primary : colors.border }]}
              >
                <Text style={[typography.captionMedium, { color: selectedKey === key ? '#FFF' : colors.text }]}>{val.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {standardsForSelected && (
          <View style={{ gap: spacing.sm }}>
            {standardsForSelected.map((s) => {
              const maxValue = standardsForSelected[standardsForSelected.length - 1].value;
              const stdBarWidth = maxValue > 0 ? Math.min(100, (s.value / maxValue) * 100) : 0;
              return (
                <View key={s.label}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {s.met && <Text style={{ fontSize: 12, fontWeight: '700', color: s.color }}>✓</Text>}
                      <Text style={[typography.captionMedium, { color: s.met ? s.color : colors.textSecondary }]}>{s.label}</Text>
                    </View>
                    <Text style={[typography.captionMedium, { color: s.met ? s.color : colors.textSecondary }]}>{s.value} кг</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${stdBarWidth}%` as any, backgroundColor: s.color, opacity: s.met ? 1 : 0.35 }} />
                  </View>
                </View>
              );
            })}
            <Text style={[typography.captionMedium, { color: colors.primary, marginTop: spacing.xs }]}>Твой ~1ПМ: {oneRM} кг</Text>
          </View>
        )}
      </Card>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
});
