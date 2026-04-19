import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
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
  const { colors } = useThemeStore();

  const macroCal = useMemo(() => {
    const p = parseFloat(state.protein.replace(',', '.')) || 0;
    const f = parseFloat(state.fats.replace(',', '.')) || 0;
    const c = parseFloat(state.carbs.replace(',', '.')) || 0;
    if (p + f + c === 0) return null;
    return Math.round(p * 4 + f * 9 + c * 4);
  }, [state.protein, state.fats, state.carbs]);

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
      {macroCal !== null && (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm }}
          onPress={() => onChange('calories', String(macroCal))}
        >
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            Из макросов: {macroCal} ккал
          </Text>
          <Text style={[typography.caption, { color: colors.primary }]}>Подставить</Text>
        </TouchableOpacity>
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
});
