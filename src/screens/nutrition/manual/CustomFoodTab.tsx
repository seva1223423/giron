import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

export interface CustomFoodState {
  name: string;
  calories: string;
  protein: string;
  fats: string;
  carbs: string;
}

interface Props {
  state: CustomFoodState;
  onChange: (field: keyof CustomFoodState, value: string) => void;
}

export const CustomFoodTab: React.FC<Props> = ({ state, onChange }) => {
  const colors = useThemeColors();

  const macros = useMemo(() => {
    const p = Math.max(0, parseFloat(state.protein.replace(',', '.')) || 0);
    const f = Math.max(0, parseFloat(state.fats.replace(',', '.')) || 0);
    const c = Math.max(0, parseFloat(state.carbs.replace(',', '.')) || 0);
    const sumKcal = p * 4 + f * 9 + c * 4;
    if (sumKcal < 1) return null;
    const pctP = Math.round((p * 4 / sumKcal) * 100);
    const pctF = Math.round((f * 9 / sumKcal) * 100);
    const pctC = Math.max(0, 100 - pctP - pctF);
    return { kcal: Math.round(sumKcal), pctP, pctF, pctC };
  }, [state.protein, state.fats, state.carbs]);
  const macroCal = macros?.kcal ?? null;

  return (
    <Card>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Ввод вручную</Text>
      <View style={{ marginBottom: spacing.md }}>
        <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Название</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
          value={state.name}
          onChangeText={(v) => onChange('name', v)}
          placeholder="Куриная грудка..."
          placeholderTextColor={colors.inputPlaceholder}
        />
      </View>
      {macroCal !== null && macros && (
        <View style={{ marginBottom: spacing.sm }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            onPress={() => onChange('calories', String(macroCal))}
            accessibilityLabel={`Подставить ${macroCal} калорий рассчитанных из макросов`}
            accessibilityRole="button"
          >
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Из макросов: {macroCal} ккал
            </Text>
            <Text style={[typography.caption, { color: colors.primary }]}>Подставить</Text>
          </TouchableOpacity>
          {/* Live macro distribution preview — same stacked bar pattern used
              in the scanner's totals card. Helps the user spot data-entry
              issues at a glance (e.g. only protein typed → bar all purple). */}
          <View style={[styles.macroBar, { backgroundColor: colors.border, marginTop: 6 }]}>
            <View style={{ width: `${macros.pctP}%`, height: '100%', backgroundColor: colors.protein }} />
            <View style={{ width: `${macros.pctF}%`, height: '100%', backgroundColor: colors.fats }} />
            <View style={{ width: `${macros.pctC}%`, height: '100%', backgroundColor: colors.carbs }} />
          </View>
        </View>
      )}
      <View style={styles.row}>
        {([['calories', 'Калории', 'ккал'], ['protein', 'Белки', 'г']] as const).map(([field, label, unit]) => (
          <View key={field} style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]} numberOfLines={1}>{label} ({unit})</Text>
            <TextInput
              style={[styles.macroInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={state[field]}
              onChangeText={(v) => onChange(field, v)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.inputPlaceholder}
              selectTextOnFocus
              maxLength={6}
            />
          </View>
        ))}
      </View>
      <View style={[styles.row, { marginTop: spacing.md }]}>
        {([['fats', 'Жиры', 'г'], ['carbs', 'Углеводы', 'г']] as const).map(([field, label, unit]) => (
          <View key={field} style={{ flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]} numberOfLines={1}>{label} ({unit})</Text>
            <TextInput
              style={[styles.macroInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={state[field]}
              onChangeText={(v) => onChange(field, v)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.inputPlaceholder}
              selectTextOnFocus
              maxLength={6}
            />
          </View>
        ))}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  input: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16 },
  row: { flexDirection: 'row', gap: spacing.md },
  macroInput: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  macroBar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
});
