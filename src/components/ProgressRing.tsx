import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors } from '../store';
import { typography } from '../theme';

interface ProgressRingProps {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  value?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress = 0,
  size = 80,
  strokeWidth = 6,
  color,
  label,
  value,
}) => {
  const colors = useThemeColors();
  const ringColor = color || colors.primary;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - Math.min(Math.max(progress, 0), 1) * circumference;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.progressBarBackground}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        {value && (
          <Text style={[typography.bodySemibold, { color: colors.text }]}>{value}</Text>
        )}
        {label && (
          <Text style={[typography.caption, { color: colors.textTertiary }]}>{label}</Text>
        )}
      </View>
    </View>
  );
};
