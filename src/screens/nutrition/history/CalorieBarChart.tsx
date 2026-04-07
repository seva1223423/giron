import React from 'react';
import { View, Text } from 'react-native';
import { typography } from '../../../theme';

interface BarData {
  label: string;
  calories: number;
  target: number;
}

interface Props {
  data: BarData[];
  colors: any;
}

export const CalorieBarChart: React.FC<Props> = ({ data, colors }) => {
  const maxCal = Math.max(...data.map((d) => d.calories), ...data.map((d) => d.target), 1);
  const chartH = 80;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH + 24, gap: 4, paddingTop: 4 }}>
      {data.map((d, i) => {
        const barH = Math.max(4, (d.calories / maxCal) * chartH);
        const targetH = (d.target / maxCal) * chartH;
        const over = d.target > 0 && d.calories > d.target * 1.1;
        const good = d.target > 0 && d.calories >= d.target * 0.85;
        const barColor = d.calories === 0 ? colors.border : over ? colors.error : good ? colors.success : colors.primary;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', height: chartH + 24, justifyContent: 'flex-end' }}>
            <View style={{ width: '100%', height: chartH, justifyContent: 'flex-end', position: 'relative' }}>
              {d.target > 0 && (
                <View style={{ position: 'absolute', bottom: targetH, left: 0, right: 0, height: 1, backgroundColor: colors.accent + '80' }} />
              )}
              <View style={{ width: '100%', height: barH, borderRadius: 3, backgroundColor: barColor, opacity: d.calories === 0 ? 0.25 : 0.9 }} />
            </View>
            <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 9, marginTop: 4, textAlign: 'center' }]} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
