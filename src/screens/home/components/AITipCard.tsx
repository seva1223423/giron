import React from 'react';
import { Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

export const AITipCard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();

  return (
    <Card
      style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}
      onPress={() => navigation.navigate('AITab')}
    >
      <Text style={[typography.captionMedium, { color: colors.accent }]}>ИИ-ТРЕНЕР</Text>
      <Text style={[typography.body, { color: colors.text, marginTop: spacing.sm }]}>
        Спроси что угодно о тренировках, питании или технике упражнений
      </Text>
      <Text style={[typography.smallMedium, { color: colors.primary, marginTop: spacing.sm }]}>
        Открыть чат
      </Text>
    </Card>
  );
};
