import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../store';
import { typography } from '../theme';
import { borderRadius, spacing } from '../theme/spacing';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

export const MacroBar: React.FC<MacroBarProps> = ({
  label,
  current,
  target,
  color,
  unit = 'г',
}) => {
  const { colors } = useThemeStore();
  const progress = target > 0 ? Math.min(current / target, 1) : 0;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        <Text style={[typography.small, { color: colors.textSecondary }]} numberOfLines={1}>
          {Math.round(current)} / {target} {unit}
        </Text>
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: colors.progressBarBackground,
          borderRadius: borderRadius.full,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            backgroundColor: color,
            borderRadius: borderRadius.full,
          }}
        />
      </View>
    </View>
  );
};
