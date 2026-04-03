import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
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

const ONE_RM_PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

function calcEpley(weight: number, reps: number) {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function calcBrzycki(weight: number, reps: number) {
  if (reps === 1) return weight;
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
}

function calcLander(weight: number, reps: number) {
  if (reps === 1) return weight;
  return (100 * weight) / (101.3 - 2.67123 * reps);
}

const OneRMCalculator: React.FC<{ colors: any }> = ({ colors }) => {
  const [rmWeight, setRmWeight] = useState('100');
  const [rmReps, setRmReps] = useState('5');

  const results = useMemo(() => {
    const w = parseFloat(rmWeight.replace(',', '.')) || 0;
    const r = parseInt(rmReps) || 1;
    if (w <= 0 || r <= 0) return null;
    const epley = calcEpley(w, r);
    const brzycki = calcBrzycki(w, r);
    const lander = calcLander(w, r);
    const avg = (epley + brzycki + lander) / 3;
    return { epley, brzycki, lander, avg };
  }, [rmWeight, rmReps]);

  const adjustReps = (delta: number) => {
    haptic.selection();
    const current = parseInt(rmReps) || 1;
    const next = Math.max(1, Math.min(30, current + delta));
    setRmReps(String(next));
  };

  return (
    <View>
      {/* Input */}
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
          ВВЕДИ РАБОЧИЙ ВЕС И ПОВТОРЕНИЯ
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {/* Weight */}
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.xs }]}>Вес (кг)</Text>
            <TextInput
              style={[{
                color: colors.text,
                borderColor: colors.inputBorder,
                backgroundColor: colors.inputBackground,
                fontSize: 28,
                fontWeight: '800',
                textAlign: 'center',
                paddingVertical: spacing.sm,
                borderRadius: borderRadius.lg,
                borderWidth: 1.5,
              }]}
              value={rmWeight}
              onChangeText={setRmWeight}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
          </View>
          {/* Reps */}
          <View style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.xs }]}>Повторения</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <TouchableOpacity
                onPress={() => adjustReps(-1)}
                style={[styles.adjustBtn, { backgroundColor: colors.surface, width: 40, height: 40, borderRadius: 20 }]}
              >
                <Text style={[typography.h4, { color: colors.primary }]}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={[{
                  flex: 1,
                  color: colors.text,
                  borderColor: colors.inputBorder,
                  backgroundColor: colors.inputBackground,
                  fontSize: 28,
                  fontWeight: '800',
                  textAlign: 'center',
                  paddingVertical: spacing.sm,
                  borderRadius: borderRadius.lg,
                  borderWidth: 1.5,
                }]}
                value={rmReps}
                onChangeText={(v) => setRmReps(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <TouchableOpacity
                onPress={() => adjustReps(1)}
                style={[styles.adjustBtn, { backgroundColor: colors.surface, width: 40, height: 40, borderRadius: 20 }]}
              >
                <Text style={[typography.h4, { color: colors.primary }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Card>

      {results && (
        <>
          {/* 1RM result */}
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              РАСЧЁТНЫЙ 1ПМ
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color: colors.primary, fontSize: 42 }]}>
                  {Math.round(results.avg)}
                </Text>
                <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>кг (среднее)</Text>
              </View>
            </View>
            <View style={[{ borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.md, paddingTop: spacing.md }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{Math.round(results.epley)}</Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>Эпли</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{Math.round(results.brzycki)}</Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>Бжицки</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{Math.round(results.lander)}</Text>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>Лэндер</Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Percentage table */}
          <Card>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              ТАБЛИЦА ПРОЦЕНТОВ ОТ 1ПМ
            </Text>
            <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
              <Text style={[typography.captionMedium, { color: colors.textTertiary, flex: 1 }]}>%</Text>
              <Text style={[typography.captionMedium, { color: colors.textTertiary, width: 80, textAlign: 'right' }]}>Вес (кг)</Text>
              <Text style={[typography.captionMedium, { color: colors.textTertiary, width: 80, textAlign: 'right' }]}>Зона</Text>
            </View>
            {ONE_RM_PERCENTAGES.map((pct, i) => {
              const weight = Math.round((results.avg * pct / 100) * 2) / 2;
              const zone = pct >= 90 ? { label: 'Сила', color: colors.error || '#E8364F' }
                : pct >= 75 ? { label: 'Гипертрофия', color: colors.accent }
                : pct >= 60 ? { label: 'Выносливость', color: colors.success }
                : { label: 'Разминка', color: colors.textTertiary };
              const isHighlight = pct === 80 || pct === 85;
              return (
                <View
                  key={pct}
                  style={[{
                    flexDirection: 'row',
                    paddingVertical: spacing.sm,
                    borderRadius: borderRadius.sm,
                    paddingHorizontal: spacing.xs,
                    backgroundColor: isHighlight ? colors.primary + '12' : 'transparent',
                  }, i < ONE_RM_PERCENTAGES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
                >
                  <Text style={[typography.bodySemibold, { color: isHighlight ? colors.primary : colors.text, flex: 1 }]}>
                    {pct}%
                  </Text>
                  <Text style={[typography.bodySemibold, { color: isHighlight ? colors.primary : colors.text, width: 80, textAlign: 'right' }]}>
                    {weight}
                  </Text>
                  <Text style={[typography.caption, { color: zone.color, width: 80, textAlign: 'right' }]}>
                    {zone.label}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </View>
  );
};

export const PlateCalculatorScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const initialWeight = route?.params?.initialWeight;
  const [activeTab, setActiveTab] = useState<'plates' | 'onerm'>('plates');
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
    haptic.selection();
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
        <Text style={[typography.h4, { color: colors.text }]}>Инструменты</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'plates' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => { haptic.selection(); setActiveTab('plates'); }}
        >
          <Text style={[typography.bodySemibold, { color: activeTab === 'plates' ? colors.primary : colors.textSecondary }]}>
            🏋️ Блины
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'onerm' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => { haptic.selection(); setActiveTab('onerm'); }}
        >
          <Text style={[typography.bodySemibold, { color: activeTab === 'onerm' ? colors.primary : colors.textSecondary }]}>
            📊 1ПМ
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'onerm' && <OneRMCalculator colors={colors} />}
        {activeTab === 'plates' && (
        <React.Fragment>
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
              onPress={() => { haptic.selection(); setBarbellIdx(i); }}
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
                onPress={() => { haptic.selection(); setTargetWeight(String(w)); }}
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
        </React.Fragment>
        )}
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
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
