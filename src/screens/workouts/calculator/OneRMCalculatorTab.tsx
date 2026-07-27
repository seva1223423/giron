import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { Card, AnimatedPressable, NumberSheet } from '../../../components';
import { buildPresets } from '../../../utils/wheel';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const ONE_RM_PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

import { estimateOneRepMax as calcEpley } from '../../../utils/oneRepMax';
function calcBrzycki(w: number, r: number) { return r === 1 ? w : r >= 37 ? w : w * (36 / (37 - r)); }
function calcLander(w: number, r: number) { return r === 1 ? w : r >= 38 ? w : (100 * w) / (101.3 - 2.67123 * r); }

export const OneRMCalculatorTab: React.FC = () => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const [rmWeight, setRmWeight] = useState(100);
  const [rmReps, setRmReps] = useState(5);
  const [editing, setEditing] = useState(false);

  const results = useMemo(() => {
    const w = rmWeight;
    const r = rmReps || 1;
    if (w <= 0 || r <= 0) return null;
    const epley = calcEpley(w, r);
    const brzycki = calcBrzycki(w, r);
    const lander = calcLander(w, r);
    return { epley, brzycki, lander, avg: (epley + brzycki + lander) / 3 };
  }, [rmWeight, rmReps]);

  return (
    <View>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>ВВЕДИ РАБОЧИЙ ВЕС И ПОВТОРЕНИЯ</Text>
        <AnimatedPressable
          onPress={() => { haptic.selection(); setEditing(true); }}
          haptic={false}
          scaleDown={0.98}
          style={[styles.entry, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }] as any}
          accessibilityRole="button"
          accessibilityLabel={`${rmWeight} килограмм на ${rmReps} повторений. Нажми, чтобы изменить`}
        >
          <Text style={[typography.number, { color: colors.text }]} allowFontScaling={false}>{rmWeight}</Text>
          <Text style={[typography.caption, { color: colors.textTertiary, marginLeft: 3, marginRight: spacing.sm }]}>кг</Text>
          <Text style={[typography.h4, { color: colors.textTertiary }]}>×</Text>
          <Text style={[typography.number, { color: colors.text, marginLeft: spacing.sm }]} allowFontScaling={false}>{rmReps}</Text>
        </AnimatedPressable>

        {editing && (
          <NumberSheet
            visible
            onClose={() => setEditing(false)}
            title="Вес и повторения"
            primary={{ label: 'Вес', value: rmWeight, onChange: setRmWeight, min: 0, max: 400, step: 0.5, unit: 'кг' }}
            secondary={{ label: 'Повторения', value: rmReps, onChange: setRmReps, min: 1, max: 30, step: 1 }}
            presets={buildPresets(rmWeight, 2.5)}
            confirmLabel="Готово"
            onConfirm={() => setEditing(false)}
          />
        )}
      </Card>

      {results && (
        <>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>РАСЧЁТНЫЙ 1ПМ</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color: colors.primary, fontSize: 42 }]}>{Math.round(results.avg)}</Text>
                <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>кг (среднее)</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.md, paddingTop: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                {[{ v: results.epley, label: 'Эпли' }, { v: results.brzycki, label: 'Бжицки' }, { v: results.lander, label: 'Лэндер' }].map(({ v, label }) => (
                  <View key={label} style={{ alignItems: 'center' }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]}>{Math.round(v)}</Text>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          <Card>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.md }]}>ТАБЛИЦА ПРОЦЕНТОВ ОТ 1ПМ</Text>
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
                <View key={pct} style={[{ flexDirection: 'row', paddingVertical: spacing.sm, borderRadius: borderRadius.sm, paddingHorizontal: spacing.xs, backgroundColor: isHighlight ? colors.primary + '12' : 'transparent' }, i < ONE_RM_PERCENTAGES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                  <Text style={[typography.bodySemibold, { color: isHighlight ? colors.primary : colors.text, flex: 1 }]}>{pct}%</Text>
                  <Text style={[typography.bodySemibold, { color: isHighlight ? colors.primary : colors.text, width: 80, textAlign: 'right' }]} numberOfLines={1}>{weight}</Text>
                  <Text style={[typography.caption, { color: zone.color, width: 80, textAlign: 'right' }]} numberOfLines={1}>{zone.label}</Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  entry: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    minHeight: 64, borderRadius: borderRadius.md, borderWidth: 1,
  },
});
