import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../../store';
import { Card, FadeIn } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing } from '../../../../theme/spacing';

const STRENGTH_STANDARDS = [
  { exerciseId: 'squat', name: 'Присед', multipliers: [0.5, 1.0, 1.5, 2.0, 2.5] },
  { exerciseId: 'bench-press', name: 'Жим лёжа', multipliers: [0.35, 0.75, 1.25, 1.75, 2.0] },
  { exerciseId: 'deadlift', name: 'Становая', multipliers: [0.5, 1.25, 1.75, 2.25, 2.75] },
  { exerciseId: 'overhead-press', name: 'Жим стоя', multipliers: [0.25, 0.5, 0.75, 1.0, 1.25] },
];
const LEVEL_NAMES = ['Новичок', 'Начинающий', 'Средний', 'Продвинутый', 'Элита'];
const LEVEL_COLORS = ['#9E9E9E', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

interface PR {
  exerciseId: string;
  estimated1RM: number;
}

interface Props {
  personalRecords: PR[];
  bodyWeightKg: number;
  delay?: number;
}

export const StrengthStandardsCard: React.FC<Props> = ({ personalRecords, bodyWeightKg, delay = 200 }) => {
  const { colors } = useThemeStore();

  const standardData = STRENGTH_STANDARDS.map((std) => {
    const pr = personalRecords.find((r) => r.exerciseId === std.exerciseId);
    if (!pr) return null;
    const ratio = pr.estimated1RM / bodyWeightKg;
    let levelIdx = 0;
    for (let li = 0; li < std.multipliers.length; li++) {
      if (ratio >= std.multipliers[li]) levelIdx = li;
    }
    const nextMult = std.multipliers[Math.min(levelIdx + 1, std.multipliers.length - 1)];
    const progress = levelIdx >= std.multipliers.length - 1
      ? 1
      : Math.max(0, Math.min(1, (ratio - std.multipliers[levelIdx]) / (nextMult - std.multipliers[levelIdx])));
    return { ...std, pr: pr.estimated1RM, ratio: Math.round(ratio * 100) / 100, levelIdx, progress };
  }).filter(Boolean) as { exerciseId: string; name: string; multipliers: number[]; pr: number; ratio: number; levelIdx: number; progress: number }[];

  if (standardData.length === 0) return null;

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>Стандарты силы</Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          На основе твоего веса тела {bodyWeightKg} кг
        </Text>
        {standardData.map((item, idx) => (
          <View key={item.exerciseId} style={idx < standardData.length - 1 ? { marginBottom: spacing.lg } : {}}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.xs }}>
              <Text style={[typography.smallMedium, { color: colors.text, flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>{item.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>{item.pr} кг  ({item.ratio}×)</Text>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: LEVEL_COLORS[item.levelIdx] + '25' }}>
                  <Text style={[typography.captionMedium, { color: LEVEL_COLORS[item.levelIdx], fontSize: 10 }]}>{LEVEL_NAMES[item.levelIdx]}</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
              {item.multipliers.map((_, segIdx) => {
                const filled = segIdx < item.levelIdx || (segIdx === item.levelIdx && item.progress > 0);
                const partial = segIdx === item.levelIdx;
                return (
                  <View key={segIdx} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 3, overflow: 'hidden' }}>
                    {filled && <View style={{ height: '100%', width: partial ? `${item.progress * 100}%` : '100%', backgroundColor: LEVEL_COLORS[Math.min(segIdx, LEVEL_COLORS.length - 1)], borderRadius: 3 }} />}
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              {item.multipliers.map((m, segIdx) => (
                <Text key={segIdx} style={[typography.small, { color: colors.textTertiary, fontSize: 9 }]}>{m}×</Text>
              ))}
            </View>
          </View>
        ))}
      </Card>
    </FadeIn>
  );
};
