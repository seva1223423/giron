import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';
import { MUSCLE_LABELS } from './PRRecordCard';

interface Props {
  search: string;
  onSearch: (v: string) => void;
  availableMuscles: string[];
  selectedMuscle: string | null;
  onSelectMuscle: (m: string | null) => void;
  sortBy: '1rm' | 'date' | 'name';
  onSortBy: (s: '1rm' | 'date' | 'name') => void;
}

export const PRFilters: React.FC<Props> = ({ search, onSearch, availableMuscles, selectedMuscle, onSelectMuscle, sortBy, onSortBy }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <>
      <FadeIn delay={0}>
        <TextInput
          style={[styles.search, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
          value={search}
          onChangeText={onSearch}
          placeholder="Поиск упражнения..."
          placeholderTextColor={colors.inputPlaceholder}
        />
      </FadeIn>

      {availableMuscles.length > 0 && (
        <FadeIn delay={40}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs }}>
              <TouchableOpacity
                onPress={() => { haptic.selection(); onSelectMuscle(null); }}
                style={[styles.chip, { backgroundColor: selectedMuscle === null ? colors.primary : colors.surface, borderColor: selectedMuscle === null ? colors.primary : colors.border }]}
              >
                <Text style={[typography.captionMedium, { color: selectedMuscle === null ? '#FFF' : colors.text }]}>Все</Text>
              </TouchableOpacity>
              {availableMuscles.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => { haptic.selection(); onSelectMuscle(selectedMuscle === m ? null : m); }}
                  style={[styles.chip, { backgroundColor: selectedMuscle === m ? colors.primary : colors.surface, borderColor: selectedMuscle === m ? colors.primary : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: selectedMuscle === m ? '#FFF' : colors.text }]}>{MUSCLE_LABELS[m] || m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </FadeIn>
      )}

      <FadeIn delay={60}>
        <View style={[styles.sortRow, { marginBottom: spacing.md }]}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginRight: spacing.sm }]}>Сортировка:</Text>
          {(['1rm', 'date', 'name'] as const).map((s) => {
            const label = s === '1rm' ? '1ПМ' : s === 'date' ? 'Дата' : 'A–Я';
            return (
              <TouchableOpacity
                key={s}
                onPress={() => { haptic.selection(); onSortBy(s); }}
                style={[styles.sortBtn, { backgroundColor: sortBy === s ? colors.primary + '20' : 'transparent', borderColor: sortBy === s ? colors.primary : colors.border }]}
              >
                <Text style={[typography.captionMedium, { color: sortBy === s ? colors.primary : colors.textSecondary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FadeIn>
    </>
  );
};

const styles = StyleSheet.create({
  search: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 15, marginBottom: spacing.md },
  chip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  sortRow: { flexDirection: 'row', alignItems: 'center' },
  sortBtn: { paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, borderWidth: 1, marginRight: spacing.xs },
});
