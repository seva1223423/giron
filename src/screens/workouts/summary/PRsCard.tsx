import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface PR { name: string; weight: number; reps: number; est1rm: number }

interface Props { prs: PR[] }

export const PRsCard: React.FC<Props> = ({ prs }) => {
  const { colors } = useThemeStore();
  if (prs.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.accent + '15', borderLeftWidth: 4, borderLeftColor: colors.accent }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={{ fontSize: 24, marginRight: spacing.sm }}>🎉</Text>
        <Text style={[typography.h4, { color: colors.accent }]}>
          {prs.length === 1 ? 'Новый личный рекорд!' : `${prs.length} новых рекорда!`}
        </Text>
      </View>
      {prs.map((pr, i) => (
        <View key={i} style={[{ paddingVertical: spacing.xs }, i < prs.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.accent + '30' }]}>
          <Text style={[typography.bodySemibold, { color: colors.text }]}>{pr.name}</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>
            {pr.weight} кг × {pr.reps} повт. • ~1ПМ: {pr.est1rm} кг
          </Text>
        </View>
      ))}
    </Card>
  );
};
