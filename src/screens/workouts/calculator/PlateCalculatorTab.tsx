import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { Card, Button, AnimatedPressable, NumberSheet } from '../../../components';
import { buildPresets } from '../../../utils/wheel';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { calculatePlates, PLATE_SIZES } from '../../../utils/plates';

const PLATE_COLORS: Record<number, string> = {
  25: '#E8364F', 20: '#3B6BF0', 15: '#F0F032', 10: '#3BC46E',
  5: '#F0F032', 2.5: '#E8364F', 1.25: '#C0C0C0',
};
const BARBELL_OPTIONS = [
  { label: 'Олимпийский гриф', weight: 20, description: '20 кг, Ø50мм' },
  { label: 'Мужской WL гриф', weight: 20, description: '20 кг' },
  { label: 'Женский гриф', weight: 15, description: '15 кг, Ø25мм' },
  { label: 'Малый гриф', weight: 10, description: '10 кг' },
  { label: 'EZ-гриф', weight: 10, description: '~10 кг' },
  { label: 'Гантель', weight: 0, description: 'Без грифа' },
];

const PlateVisual: React.FC<{ plates: Map<number, number> }> = ({ plates }) => {
  const colors = useThemeColors();
  const plateArray: number[] = [];
  PLATE_SIZES.forEach((size) => {
    for (let i = 0; i < (plates.get(size) || 0); i++) plateArray.push(size);
  });
  if (plateArray.length === 0) return null;
  return (
    <View style={styles.barVisual}>
      <View style={styles.platesSide}>
        {[...plateArray].reverse().map((p, i) => {
          const h = Math.max(32, Math.min(80, p * 2.8));
          return <View key={i} style={[styles.plate, { height: h, backgroundColor: p === 5 ? colors.surface : PLATE_COLORS[p] || '#888', borderWidth: p === 5 ? 2 : 0, borderColor: colors.border, marginRight: 1 }]} />;
        })}
      </View>
      <View style={[styles.barCenter, { backgroundColor: colors.textTertiary }]}>
        <View style={[styles.barSleeve, { backgroundColor: colors.textSecondary }]} />
      </View>
      <View style={styles.platesSide}>
        {plateArray.map((p, i) => {
          const h = Math.max(32, Math.min(80, p * 2.8));
          return <View key={i} style={[styles.plate, { height: h, backgroundColor: p === 5 ? colors.surface : PLATE_COLORS[p] || '#888', borderWidth: p === 5 ? 2 : 0, borderColor: colors.border, marginLeft: 1 }]} />;
        })}
      </View>
    </View>
  );
};

interface Props {
  initialWeight?: number;
  /**
   * When supplied, a primary "Применить" action appears. The calculator was
   * previously a one-way read-only trip from SetRow — the user would pick a
   * weight, exit, and still have to type the value into the input manually.
   * Now the caller can thread the result back.
   */
  onApplyWeight?: (weightKg: number) => void;
}

export const PlateCalculatorTab: React.FC<Props> = ({ initialWeight, onApplyWeight }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const [weight, setWeight] = useState<number>(initialWeight ?? 100);
  const [editing, setEditing] = useState(false);
  const [barbellIdx, setBarbellIdx] = useState(0);

  const barbell = BARBELL_OPTIONS[barbellIdx];
  const plates = useMemo(() => calculatePlates(weight, barbell.weight), [weight, barbell.weight]);
  const totalPlatesWeight = useMemo(() => { let s = 0; plates.forEach((c, sz) => { s += c * sz * 2; }); return s; }, [plates]);
  const actualWeight = barbell.weight + totalPlatesWeight;

  return (
    <>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ЦЕЛЕВОЙ ВЕС</Text>
        {/* Two ± buttons, a keyboard field and six delta chips — nine
            controls to say one number. Now the number IS the control. */}
        <AnimatedPressable
          onPress={() => { haptic.selection(); setEditing(true); }}
          haptic={false}
          scaleDown={0.98}
          style={[styles.target, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }] as any}
          accessibilityRole="button"
          accessibilityLabel={`Целевой вес ${weight} кг. Нажми, чтобы изменить`}
        >
          <Text style={[typography.number, { color: colors.text, fontSize: 40 }]} allowFontScaling={false}>{weight}</Text>
          <Text style={[typography.h4, { color: colors.textSecondary, marginLeft: 4 }]}>кг</Text>
        </AnimatedPressable>

        {editing && (
          <NumberSheet
            visible
            onClose={() => setEditing(false)}
            title="Целевой вес"
            primary={{ label: 'Вес на штанге', value: weight, onChange: setWeight, min: 0, max: 400, step: 0.5, unit: 'кг' }}
            presets={buildPresets(weight, 2.5)}
            confirmLabel="Готово"
            onConfirm={() => setEditing(false)}
          />
        )}
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ТИП ГРИФА</Text>
        {BARBELL_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => { haptic.selection(); setBarbellIdx(i); }}
            style={[styles.barbellRow, { borderColor: barbellIdx === i ? colors.primary : colors.divider, backgroundColor: barbellIdx === i ? colors.primary + '15' : 'transparent' }, i > 0 && { borderTopWidth: 0 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[typography.body, { color: barbellIdx === i ? colors.primary : colors.text }]}>{opt.label}</Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>{opt.description}</Text>
            </View>
            {barbellIdx === i && <Text style={[typography.body, { color: colors.primary }]}>✓</Text>}
          </TouchableOpacity>
        ))}
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>БЛИНЫ НА ОДНУ СТОРОНУ</Text>
        {plates.size === 0 ? (
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }]}>
            {actualWeight <= 0 ? 'Введи вес выше нуля' : `${barbell.weight} кг гриф — блины не нужны`}
          </Text>
        ) : (
          <>
            <PlateVisual plates={plates} />
            <View style={styles.plateList}>
              {PLATE_SIZES.filter((s) => plates.has(s)).map((size) => (
                <View key={size} style={[styles.plateChip, { backgroundColor: size === 5 ? colors.surface : PLATE_COLORS[size] + '25', borderColor: size === 5 ? colors.border : PLATE_COLORS[size] }]}>
                  <Text style={[typography.bodySemibold, { color: size === 5 ? colors.text : PLATE_COLORS[size] }]}>{size} кг</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>× {plates.get(size)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
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
        {Math.abs(actualWeight - weight) > 0.1 && weight > 0 && (
          <Text style={[typography.small, { color: colors.warning || colors.accent, textAlign: 'center', marginTop: spacing.sm }]}>
            Точный вес: {actualWeight} кг (ближайший возможный)
          </Text>
        )}
      </Card>

      {onApplyWeight && (
        <Button
          title={`Применить ${actualWeight} кг`}
          onPress={() => { haptic.medium(); onApplyWeight(actualWeight); }}
          fullWidth
          size="lg"
          style={{ marginBottom: spacing.lg }}
        />
      )}

      <Card>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>ПОПУЛЯРНЫЕ ВЕСА</Text>
        <View style={styles.presets}>
          {[60, 80, 100, 120, 140, 160, 180, 200].map((w) => (
            <TouchableOpacity
              key={w}
              onPress={() => { haptic.selection(); setWeight(w); }}
              style={[styles.presetBtn, { backgroundColor: weight === w ? colors.primary : colors.surface, borderColor: weight === w ? colors.primary : colors.border }]}
            >
              <Text style={[typography.smallMedium, { color: weight === w ? '#fff' : colors.text }]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </>
  );
};

const styles = StyleSheet.create({
  target: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    minHeight: 76, borderRadius: 14, borderWidth: 1.5,
  },
  barbellRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, marginBottom: spacing.xs },
  barVisual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, height: 100 },
  platesSide: { flexDirection: 'row', alignItems: 'center' },
  plate: { width: 14, borderRadius: 3 },
  barCenter: { height: 12, width: 60, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  barSleeve: { height: 8, width: 28, borderRadius: 4 },
  plateList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg, justifyContent: 'center' },
  plateChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5, alignItems: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', rowGap: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1, marginTop: spacing.sm },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presetBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, minWidth: 52, alignItems: 'center' },
});
