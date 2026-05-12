import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { AchievementSticker } from '../../../components/Sticker';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { Achievement } from '../../../utils/achievements';

// Summary card consumes the same Achievement shape as everywhere else so the
// sticker resolver gets the `category` field it needs. Required fields:
// id + category drive sticker selection; `unlocked` is hardcoded true here
// because this card only renders NEWLY unlocked achievements.
interface Props { achievements: Achievement[] }

export const AchievementsCard: React.FC<Props> = ({ achievements }) => {
  const { colors } = useThemeStore();
  if (achievements.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, backgroundColor: '#FFD70015', borderLeftWidth: 4, borderLeftColor: '#FFD700' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFD700' + '20', alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, borderWidth: 1.5, borderColor: '#FFD700' + '50' }}><Text style={{ fontSize: 13, fontWeight: '800', color: '#B8860B' }}>!</Text></View>
        <Text style={[typography.h4, { color: '#B8860B' }]}>
          {achievements.length === 1 ? 'Новое достижение!' : `${achievements.length} новых достижения!`}
        </Text>
      </View>
      {achievements.map((a, i) => (
        <View key={a.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs }, i < achievements.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#FFD70030' }]}>
          <AchievementSticker achievement={a} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: colors.text }]}>{a.title}</Text>
            <Text style={[typography.small, { color: colors.textSecondary }]}>{a.description}</Text>
          </View>
          <View style={{ backgroundColor: colors.success + '20', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.success + '50' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.success }}>✓</Text>
          </View>
        </View>
      ))}
    </Card>
  );
};
