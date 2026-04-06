import React from 'react';
import { View, Dimensions } from 'react-native';
import { spacing } from '../../../theme/spacing';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - spacing.xl * 2 - spacing.lg * 2;

interface WeeklyHeatmapProps {
  workoutDates: string[];
  weeks?: number;
  colors: any;
}

export const WeeklyHeatmap: React.FC<WeeklyHeatmapProps> = ({ workoutDates, weeks = 12, colors }) => {
  const today = new Date();
  const cells: { date: string; count: number; dayOfWeek: number }[] = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const count = workoutDates.filter((wd) => wd.startsWith(dateStr)).length;
    cells.push({ date: dateStr, count, dayOfWeek: d.getDay() });
  }

  const cellSize = Math.floor((CHART_WIDTH - 24) / weeks) - 2;

  return (
    <View style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {cells.map((cell, i) => (
        <View
          key={i}
          style={{
            width: cellSize,
            height: cellSize,
            borderRadius: 2,
            backgroundColor: cell.count > 0
              ? cell.count >= 2 ? colors.success : colors.success + '70'
              : colors.surface,
          }}
        />
      ))}
    </View>
  );
};
