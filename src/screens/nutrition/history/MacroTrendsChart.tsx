import React from 'react';
import { View, Text } from 'react-native';
import { typography } from '../../../theme';

interface DayMacro {
  label: string;
  protein: number;
  fats: number;
  carbs: number;
}

interface MacroLine {
  key: keyof Omit<DayMacro, 'label'>;
  label: string;
  color: string;
  target?: number;
}

interface Props {
  data: DayMacro[];
  targetProtein?: number;
  targetFats?: number;
  targetCarbs?: number;
  colors: any;
}

function MiniBarChart({ data, maxVal, color, target }: { data: number[]; maxVal: number; color: string; target?: number }) {
  const chartH = 48;
  const effectiveMax = Math.max(maxVal, target ?? 0, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH + 4, gap: 2 }}>
      {data.map((v, i) => {
        const barH = v === 0 ? 2 : Math.max(4, (v / effectiveMax) * chartH);
        const over = target && v > 0 && v > target * 1.12;
        const good = target && v > 0 && v >= target * 0.85;
        const barColor = v === 0 ? '#00000015' : over ? '#EF444490' : good ? color : color + '60';
        return (
          <View key={i} style={{ flex: 1, height: chartH, justifyContent: 'flex-end', position: 'relative' }}>
            {target && target > 0 && (
              <View style={{ position: 'absolute', bottom: (target / effectiveMax) * chartH, left: 0, right: 0, height: 1, backgroundColor: color + '50' }} />
            )}
            <View style={{ width: '100%', height: barH, borderRadius: 2, backgroundColor: barColor }} />
          </View>
        );
      })}
    </View>
  );
}

export const MacroTrendsChart: React.FC<Props> = ({ data, targetProtein, targetFats, targetCarbs, colors }) => {
  const maxProt = Math.max(...data.map((d) => d.protein), targetProtein ?? 0, 1);
  const maxFats = Math.max(...data.map((d) => d.fats), targetFats ?? 0, 1);
  const maxCarbs = Math.max(...data.map((d) => d.carbs), targetCarbs ?? 0, 1);

  const lines: MacroLine[] = [
    { key: 'protein', label: 'Белки', color: colors.protein, target: targetProtein },
    { key: 'fats', label: 'Жиры', color: colors.fats, target: targetFats },
    { key: 'carbs', label: 'Углеводы', color: colors.carbs, target: targetCarbs },
  ];

  const maxVals = { protein: maxProt, fats: maxFats, carbs: maxCarbs };

  return (
    <View style={{ gap: 12 }}>
      {lines.map(({ key, label, color, target }) => {
        const vals = data.map((d) => d[key]);
        const avg = vals.filter((v) => v > 0).length > 0
          ? Math.round(vals.filter((v) => v > 0).reduce((s, v) => s + v, 0) / vals.filter((v) => v > 0).length)
          : 0;
        return (
          <View key={key}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
                <Text style={[typography.captionMedium, { color: colors.text }]}>{label}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {avg > 0 && (
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    ср. {avg}г
                  </Text>
                )}
                {target && target > 0 && (
                  <Text style={[typography.caption, { color: color + 'CC' }]}>
                    цель {target}г
                  </Text>
                )}
              </View>
            </View>
            <MiniBarChart data={vals} maxVal={maxVals[key]} color={color} target={target} />
          </View>
        );
      })}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, flex: 1 }}>
        {data.filter((_, i) => i % 2 === 0).map((d, i) => (
          <Text key={i} style={[typography.caption, { color: colors.textTertiary, fontSize: 9 }]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
};
