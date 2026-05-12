import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { SleepStages } from '../../../services/health';

/**
 * Horizontal stacked bar showing sleep-stage breakdown.
 *
 * Each stage gets a slice proportional to its minutes; labels are
 * rendered below each slice when the slice is wide enough to read.
 * Colours mirror the Direction A macro palette idea: deep = primary
 * gold (the "main" stage), rem = accent, light = textTertiary, awake
 * = calorie terracotta. These don't come from `colors.*` because they
 * carry semantic meaning that doesn't map onto an existing token —
 * `MacroBar` follows the same convention.
 */

interface StageBarProps {
  stages: SleepStages;
}

interface Slice {
  key: 'deep' | 'rem' | 'light' | 'awake';
  label: string;
  minutes: number;
  color: string;
}

export const StageBar: React.FC<StageBarProps> = ({ stages }) => {
  const colors = useThemeColors();

  const slices: Slice[] = useMemo(() => {
    const list: Slice[] = [];
    if (stages.deep)  list.push({ key: 'deep',  label: 'Глубокий', minutes: stages.deep,  color: colors.primary });
    if (stages.rem)   list.push({ key: 'rem',   label: 'REM',      minutes: stages.rem,   color: colors.accent });
    if (stages.light) list.push({ key: 'light', label: 'Лёгкий',   minutes: stages.light, color: colors.textTertiary });
    if (stages.awake) list.push({ key: 'awake', label: 'Бодрств.', minutes: stages.awake, color: colors.error });
    return list;
  }, [stages, colors]);

  const total = slices.reduce((s, x) => s + x.minutes, 0);

  if (slices.length === 0 || total === 0) return null;

  return (
    <View style={{ marginTop: spacing.md }}>
      {/* Stacked bar */}
      <View
        style={{
          flexDirection: 'row',
          height: 10,
          borderRadius: borderRadius.full,
          backgroundColor: colors.border,
          overflow: 'hidden',
        }}
        accessibilityRole="image"
        accessibilityLabel={`Распределение сна: ${slices.map((s) => `${s.label} ${s.minutes} минут`).join(', ')}`}
      >
        {slices.map((s, i) => (
          <View
            key={s.key}
            style={{
              flex: s.minutes,
              backgroundColor: s.color,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: colors.background,
            }}
          />
        ))}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm, gap: spacing.md }}>
        {slices.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: borderRadius.full,
                backgroundColor: s.color,
              }}
            />
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              {s.label}
            </Text>
            <Text style={[typography.captionMedium, { color: colors.text }]}>
              {s.minutes} мин
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};
