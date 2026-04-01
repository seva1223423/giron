import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

// Standard plate weights in kg
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];

// Colors for each plate size
const PLATE_COLORS: Record<number, string> = {
  25: '#E8364F',   // red
  20: '#3B6BF0',   // blue
  15: '#F0F032',   // yellow
  10: '#3BC46E',   // green
  5: '#F0F032',    // white (will use surface)
  2.5: '#E8364F',  // red (small)
  1.25: '#C0C0C0', // silver
};

const BARBELL_OPTIONS = [
  { label: 'Олимпийский гриф', weight: 20, description: '20 кг, Ø50мм' },
  { label: 'Мужской WL гриф', weight: 20, description: '20 кг' },
  { label: 'Женский гриф', weight: 15, description: '15 кг, Ø25мм' },
  { label: 'Малый гриф', weight: 10, description: '10 кг' },
  { label: 'EZ-гриф', weight: 10, description: '~10 кг' },
  { label: 'Гантель', weight: 0, description: 'Без грифа' },
];

function calculatePlates(targetWeight: number, barbellWeight: number): Map<number, number> {
  const platesWeight = (targetWeight - barbellWeight) / 2;
  const result = new Map<number, number>();

  if (platesWeight <= 0) return result;

  let remaining = platesWeight;
  for (const plate of PLATE_SIZES) {
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      result.set(plate, count);
      remaining -= count * plate;
      remaining = Math.round(remaining * 100) / 100;
    }
  }

  return result;
}

const PlateVisual: React.FC<{ plates: Map<number, number>; colors: any }> = ({ plates, colors }) => {
  // Build visual array from largest to smallest
  const plateArray: number[] = [];
  PLATE_SIZES.forEach((size) => {
    const count = plates.get(size) || 0;
    for (let i = 0; i < count; i++) plateArray.push(size);
  });

  if (plateArray.length === 0) return null;

  return (
    <View style={styles.barVisual}>
      {/* Left side plates (mirrored) */}
      <View style={styles.platesSide}>
        {[...plateArray].reverse().map((p, i) => {
          const h = Math.max(32, Math.min(80, p * 2.8));
          return (
            <View
              key={i}
              style={[
                styles.plate,
                {
                  height: h,
                  backgroundColor: p === 5 ? colors.surface : PLATE_COLORS[p] || '#888',
                  borderWidth: p === 5 ? 2 : 0,
                  borderColor: colors.border,
                  marginRight: 1,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Bar */}
      <View style={[styles.barCenter, { backgroundColor: colors.textTertiary }]}>
        <View style={[styles.barSleeve, { backgroundColor: colors.textSecondary }]} />
      </View>

      {/* Right side plates */}
      <View style={styles.platesSide}>
        {plateArray.map((p, i) => {
          const h = Math.max(32, Math.min(80, p * 2.8));
          return (
            <View
              key={i}
              style={[
                styles.plate,
                {
                  height: h,
                  backgroundColor: p === 5 ? colors.surface : PLATE_COLORS[p] || '#888',
                  borderWidth: p === 5 ? 2 : 0,
                  borderColor: colors.border,
                  marginLeft: 1,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

export const PlateCalculatorScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { colors } = useThemeStore();
  const initialWeight = route?.params?.initialWeight;
  const [targetWeight, setTargetWeight] = useState(
    initialWeight != null ? String(initialWeight) : '100'
  );
  const [barbellIdx, setBarbellIdx] = useState(0);

  const barbell = BARBELL_OPTIONS[barbellIdx];

  const plates = useMemo(() => {
    const w = parseFloat(targetWeight.replace(',', '.')) || 0;
    return calculatePlates(w, barbell.weight);
  }, [targetWeight, barbell.weight]);

  const totalPlatesWeight = useMemo(() => {
    let sum = 0;
    plates.forEach((count, size) => { sum += count * size * 2; });
    return sum;
  }, [plates]);

  const actualWeight = barbell.weight + totalPlatesWeight;

  const adjustWeight = (delta: number) => {
    Haptics.selectionAsync();
    const current = parseFloat(targetWeight.replace(',', '.')) || 0;
    const next = Math.max(0, Math.round((current + delta) * 4) / 4);
    setTargetWeight(String(next));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>Калькулятор блинов</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Weight input */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            ЦЕЛЕВОЙ ВЕС
          </Text>
          <View style={styles.weightRow}>
            <TouchableOpacity onPress={() => adjustWeight(-2.5)} style={[styles.adjustBtn, { backgroundColor: colors.surface }]}>
              <Text style={[typography.h3, { color: colors.primary }]}>−</Text>
            </TouchableOpacity>
            <View style={styles.weightInputWrap}>
              <TextInput
                style={[styles.weightInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={[typography.h4, { color: colors.textSecondary }]}>кг</Text>
            </View>
            <TouchableOpacity onPress={() => adjustWeight(2.5)} style={[styles.adjustBtn, { backgroundColor: colors.surface }]}>
              <Text style={[typography.h3, { color: colors.primary }]}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Quick +/- buttons */}
          <View style={styles.quickBtns}>
            {[-10, -5, -2.5, +2.5, +5, +10].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => adjustWeight(d)}
                style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[typography.small, { color: d > 0 ? colors.success : colors.error, fontWeight: '700' }]}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Barbell selector */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            ТИП ГРИФА
          </Text>
          {BARBELL_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => { Haptics.selectionAsync(); setBarbellIdx(i); }}
              style={[
                styles.barbellRow,
                { borderColor: barbellIdx === i ? colors.primary : colors.divider },
                { backgroundColor: barbellIdx === i ? colors.primary + '15' : 'transparent' },
                i > 0 && { borderTopWidth: 0 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { color: barbellIdx === i ? colors.primary : colors.text }]}>
                  {opt.label}
                </Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>{opt.description}</Text>
              </View>
              {barbellIdx === i && (
                <Text style={[typography.body, { color: colors.primary }]}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </Card>

        {/* Result */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            БЛИНЫ НА ОДНУ СТОРОНУ
          </Text>

          {plates.size === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }]}>
              {actualWeight <= 0 ? 'Введи вес выше нуля' : `${barbell.weight} кг гриф — блины не нужны`}
            </Text>
          ) : (
            <>
              {/* Plate visual */}
              <PlateVisual plates={plates} colors={colors} />

              {/* Plate list */}
              <View style={styles.plateList}>
                {PLATE_SIZES.filter((s) => plates.has(s)).map((size) => (
                  <View key={size} style={[styles.plateChip, { backgroundColor: size === 5 ? colors.surface : PLATE_COLORS[size] + '25', borderColor: size === 5 ? colors.border : PLATE_COLORS[size] }]}>
                    <Text style={[typography.bodySemibold, { color: size === 5 ? colors.text : PLATE_COLORS[size] }]}>
                      {size} кг
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                      × {plates.get(size)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Summary */}
          <View style={[styles.summary, { borderTopColor: colors.divider }]}>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typography.numberSmall, { color: colors.primary }]}>{barbell.weight}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>гриф</Text>
            </View>
            <Text style={[typography.h3, { color: colors.textTertiary }]}>+</Text>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typography.numberSmall, { color: colors.accent }]}>{totalPlatesWeight}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>блины</Text>
            </View>
            <Text style={[typography.h3, { color: colors.textTertiary }]}>=</Text>
            <View style={{ alignItems: 'center' }}>
              <Text style={[typography.numberSmall, { color: colors.success, fontSize: 28 }]}>{actualWeight}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>итого кг</Text>
            </View>
          </View>

          {Math.abs(actualWeight - (parseFloat(targetWeight) || 0)) > 0.1 && parseFloat(targetWeight) > 0 && (
            <Text style={[typography.small, { color: colors.warning || colors.accent, textAlign: 'center', marginTop: spacing.sm }]}>
              Точный вес: {actualWeight} кг (ближайший возможный)
            </Text>
          )}
        </Card>

        {/* Common weights quick access */}
        <Card>
          <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            ПОПУЛЯРНЫЕ ВЕСА
          </Text>
          <View style={styles.presets}>
            {[60, 80, 100, 120, 140, 160, 180, 200].map((w) => (
              <TouchableOpacity
                key={w}
                onPress={() => { Haptics.selectionAsync(); setTargetWeight(String(w)); }}
                style={[styles.presetBtn, {
                  backgroundColor: parseFloat(targetWeight) === w ? colors.primary : colors.surface,
                  borderColor: parseFloat(targetWeight) === w ? colors.primary : colors.border,
                }]}
              >
                <Text style={[typography.smallMedium, { color: parseFloat(targetWeight) === w ? '#fff' : colors.text }]}>
                  {w}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  adjustBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  weightInput: {
    width: 120,
    textAlign: 'center',
    fontSize: 36,
    fontWeight: '800',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  quickBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  quickBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  barbellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  barVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    height: 100,
  },
  platesSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plate: {
    width: 14,
    borderRadius: 3,
  },
  barCenter: {
    height: 12,
    width: 60,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barSleeve: {
    height: 8,
    width: 28,
    borderRadius: 4,
  },
  plateList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    justifyContent: 'center',
  },
  plateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  presetBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minWidth: 52,
    alignItems: 'center',
  },
});
