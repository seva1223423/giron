import React, { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useThemeStore } from '../../../../store';
import { Card, FadeIn } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing } from '../../../../theme/spacing';
import { workoutService } from '../../../../services';
import type { LeaderboardEntry } from '../../../../services/workoutService';

export const ClubLeaderboard: React.FC = () => {
  const { colors } = useThemeStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetch = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const data = await workoutService.getLeaderboard();
      setLeaderboard(data);
    } catch {} finally {
      setLoading(false);
      setFetched(true);
    }
  }, [fetched]);

  // Auto-fetch on mount
  React.useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />;

  if (leaderboard.length === 0) {
    return (
      <FadeIn>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Рекорды клуба появятся когда участники завершат тренировки
          </Text>
        </Card>
      </FadeIn>
    );
  }

  return (
    <FadeIn delay={0}>
      <Card style={{ marginTop: spacing.lg }}>
        {leaderboard.slice(0, 30).map((entry, i) => (
          <View
            key={i}
            style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }, i < leaderboard.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
          >
            <Text style={[typography.numberSmall, { color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : colors.textTertiary, width: 32, textAlign: 'center', fontSize: i < 3 ? 18 : 14 }]}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
            </Text>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{entry.exerciseName}</Text>
                {entry.verified && (
                  <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>✓</Text>
                )}
              </View>
              <Text style={[typography.small, { color: colors.textSecondary }]}>{entry.userName} • {entry.weightKg} кг × {entry.reps}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.numberSmall, { color: colors.accent, fontSize: 16 }]}>{entry.estimated1RM} кг</Text>
              <Text style={[typography.small, { color: colors.textTertiary }]}>~1ПМ</Text>
            </View>
          </View>
        ))}
      </Card>
    </FadeIn>
  );
};
