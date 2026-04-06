import React from 'react';
import { View, Text } from 'react-native';
import { typography } from '../../../theme';

interface BarChartProps {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  colors: any;
}

export const BarChart: React.FC<BarChartProps> = ({ data, color, height = 140, colors }) => {
  const maxValue = Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {data.map((item, i) => {
        const barHeight = (item.value / maxValue) * (height - 24);
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {item.value > 0 && (
              <Text style={[typography.small, { color: colors.textTertiary, fontSize: 9, marginBottom: 2 }]}>
                {item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value}
              </Text>
            )}
            <View
              style={{
                width: '70%',
                height: Math.max(barHeight, 2),
                backgroundColor: item.value > 0 ? color : colors.border,
                borderRadius: 4,
                minHeight: 2,
              }}
            />
            <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10, marginTop: 4 }]}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
