import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Gender } from '../../../types';

interface Props {
  gender: Gender | null;
  onSelect: (gender: Gender) => void;
}

export const GenderStep: React.FC<Props> = ({ gender, onSelect }) => {
  const { colors } = useThemeStore();
  return (
    <View style={styles.container}>
      <Text style={[typography.h1, { color: colors.text, marginBottom: spacing.sm }]}>Привет! 👋</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxxl }]}>
        Давай настроим Iron Gym под тебя. Укажи свой пол.
      </Text>
      <View style={styles.optionRow}>
        {(['male', 'female'] as Gender[]).map((g) => (
          <TouchableOpacity
            key={g}
            activeOpacity={0.7}
            onPress={() => onSelect(g)}
            style={[styles.card, { backgroundColor: gender === g ? colors.primary : colors.surface, borderColor: gender === g ? colors.primary : colors.border }]}
          >
            <Text style={{ fontSize: 48 }}>{g === 'male' ? '🙋‍♂️' : '🙋‍♀️'}</Text>
            <Text style={[typography.bodySemibold, { color: gender === g ? '#FFF' : colors.text, marginTop: spacing.md }]}>
              {g === 'male' ? 'Мужской' : 'Женский'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  optionRow: { flexDirection: 'row', gap: spacing.lg },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, borderRadius: borderRadius.xl, borderWidth: 2 },
});
