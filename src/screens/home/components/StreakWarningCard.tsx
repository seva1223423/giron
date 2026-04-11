import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  streak: number;
  navigation: any;
}

export const StreakWarningCard: React.FC<Props> = ({ streak, navigation }) => {
  const { colors } = useThemeStore();

  return (
    <Card
      style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.error }}
      onPress={() => navigation.navigate('WorkoutsTab')}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.error + '18', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16, fontWeight: '800', color: colors.error }}>!</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.captionMedium, { color: colors.error }]}>СЕРИЯ ПОД УГРОЗОЙ!</Text>
          <Text style={[typography.bodyMedium, { color: colors.text, marginTop: 2 }]}>
            Серия {streak} {streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'} — потренируйся сегодня
          </Text>
        </View>
        <Text style={[typography.bodySemibold, { color: colors.error }]}>▶</Text>
      </View>
    </Card>
  );
};
