import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Achievement { id: string; emoji: string; title: string; description: string }

interface Props { achievements: Achievement[] }

export const AchievementsCard: React.FC<Props> = ({ achievements }) => {
  const { colors } = useThemeStore();
  if (achievements.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, backgroundColor: '#FFD70015', borderLeftWidth: 4, borderLeftColor: '#FFD700' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={{ fontSize: 24, marginRight: spacing.sm }}>🏅</Text>
        <Text style={[typography.h4, { color: '#B8860B' }]}>
          {achievements.length === 1 ? 'Новое достижение!' : `${achievements.length} новых достижения!`}
        </Text>
      </View>
      {achievements.map((a, i) => (
        <View key={a.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs }, i < achievements.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#FFD70030' }]}>
          <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: colors.text }]}>{a.title}</Text>
            <Text style={[typography.small, { color: colors.textSecondary }]}>{a.description}</Text>
          </View>
          <Text style={{ fontSize: 16 }}>✅</Text>
        </View>
      ))}
    </Card>
  );
};
