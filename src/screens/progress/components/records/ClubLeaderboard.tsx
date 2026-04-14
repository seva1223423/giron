import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useThemeStore } from '../../../../store';
import { Card, FadeIn, SkeletonLoader, PaywallModal } from '../../../../components';
import { typography } from '../../../../theme';
import { spacing } from '../../../../theme/spacing';
import { workoutService } from '../../../../services';
import type { LeaderboardEntry } from '../../../../services/workoutService';
import { useSubscriptionStore } from '../../../../store/useSubscriptionStore';

export const ClubLeaderboard: React.FC = () => {
  const { colors } = useThemeStore();
  const { canViewLeaderboard } = useSubscriptionStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const fetch = useCallback(async () => {
    if (fetched || !canViewLeaderboard()) return;
    setLoading(true);
    try {
      const data = await workoutService.getLeaderboard();
      setLeaderboard(data);
    } catch {} finally {
      setLoading(false);
      setFetched(true);
    }
  }, [fetched, canViewLeaderboard]);

  // Auto-fetch on mount (only for premium users)
  React.useEffect(() => { fetch(); }, [fetch]);

  // Gate leaderboard behind premium
  if (!canViewLeaderboard()) {
    return (
      <FadeIn>
        <TouchableOpacity onPress={() => setShowPaywall(true)} activeOpacity={0.85}>
          <Card style={{ marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.md, color: colors.primary, fontWeight: '800' }}>◈</Text>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Клубный лидерборд</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }]}>
              Соревнуйся с участниками клуба по силовым показателям
            </Text>
            <View style={{ backgroundColor: colors.primary + '15', borderRadius: 20, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>Открыть Pro →</Text>
            </View>
          </Card>
        </TouchableOpacity>
        <PaywallModal
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          reason="feature"
          featureName="Клубный лидерборд"
        />
      </FadeIn>
    );
  }

  if (loading) return (
    <Card style={{ marginTop: spacing.lg }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md }}>
          <SkeletonLoader width={32} height={32} borderRadius={16} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonLoader width="70%" height={14} />
            <SkeletonLoader width="40%" height={10} />
          </View>
          <SkeletonLoader width={50} height={20} />
        </View>
      ))}
    </Card>
  );

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
              {i < 3 ? `${i + 1}` : `${i + 1}`}
            </Text>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{entry.exerciseName}</Text>
                {entry.verified && (
                  <Text style={{ fontSize: 11, color: colors.success, fontWeight: '600' }}>✓</Text>
                )}
              </View>
              <Text style={[typography.small, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{entry.userName} • {entry.weightKg} кг × {entry.reps}</Text>
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

