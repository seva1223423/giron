import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  label: string;
  sublabel?: string;
  right: React.ReactNode;
  onPress?: () => void;
  divider?: boolean;
}

export const SettingRow: React.FC<Props> = ({ label, sublabel, right, onPress, divider }) => {
  const { colors } = useThemeStore();
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container onPress={onPress} style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
        {sublabel && <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>{sublabel}</Text>}
      </View>
      {right}
    </Container>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
});
