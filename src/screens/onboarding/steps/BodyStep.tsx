import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Input } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  height: string;
  weight: string;
  age: string;
  onHeightChange: (v: string) => void;
  onWeightChange: (v: string) => void;
  onAgeChange: (v: string) => void;
}

export const BodyStep: React.FC<Props> = ({ height, weight, age, onHeightChange, onWeightChange, onAgeChange }) => {
  const { colors } = useThemeStore();
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Параметры тела</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xxxl }]}>
        Это поможет подобрать программу и рассчитать КБЖУ.
      </Text>
      <Input label="Рост (см)" placeholder="175" keyboardType="numeric" value={height} onChangeText={onHeightChange} containerStyle={{ marginBottom: spacing.xl }} />
      <Input label="Вес (кг)" placeholder="75" keyboardType="numeric" value={weight} onChangeText={onWeightChange} containerStyle={{ marginBottom: spacing.xl }} />
      <Input label="Возраст" placeholder="25" keyboardType="numeric" value={age} onChangeText={onAgeChange} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
});
