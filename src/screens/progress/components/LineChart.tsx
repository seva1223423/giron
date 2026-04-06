import React from 'react';
import { View, Text } from 'react-native';
import { typography } from '../../../theme';

interface LineChartProps {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  colors: any;
  suffix?: string;
}

export const LineChart: React.FC<LineChartProps> = ({ data, color, height = 120, colors, suffix = '' }) => {
  if (data.length < 2) return null;

  const maxVal = Math.max(...data.map((d) => d.value));
  const minVal = Math.min(...data.map((d) => d.value));
  const range = maxVal - minVal || 1;
  const chartH = height - 32;

  return (
    <View style={{ height }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>{maxVal}{suffix}</Text>
        <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>{minVal}{suffix}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH }}>
        {data.map((item, i) => {
          const y = ((item.value - minVal) / range) * (chartH - 16);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', height: chartH, justifyContent: 'flex-end' }}>
              <View style={{ position: 'absolute', bottom: y }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: color,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((item, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.small, { color: colors.textTertiary, fontSize: 9 }]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
