import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { Achievement } from '../../../utils/achievements';

interface Props {
  achievements: Achievement[];
  delay?: number;
}

export const AchievementsCard: React.FC<Props> = ({ achievements, delay = 180 }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [showAll, setShowAll] = useState(false);

  const unlocked = achievements.filter((a) => a.unlocked);
  const inProgress = achievements.filter((a) => !a.unlocked && (a.progress ?? 0) > 0);

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <View>
            <Text style={[typography.h4, { color: colors.text }]}>Достижения</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
              {unlocked.length} / {achievements.length} разблокировано
            </Text>
          </View>
          {(inProgress.length > 0 || unlocked.length > 0) && (
            <TouchableOpacity onPress={() => { haptic.selection(); setShowAll((v) => !v); }}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>{showAll ? 'Свернуть' : 'Все'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {unlocked.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: inProgress.length > 0 ? spacing.lg : 0 }}>
            {(showAll ? unlocked : unlocked.slice(0, 8)).map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => Alert.alert(`${a.emoji} ${a.title}`, a.description)}
                style={{ width: 68, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: 4, borderRadius: borderRadius.md, borderWidth: 1, backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }}
              >
                <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
                <Text style={[typography.caption, { color: colors.primary, marginTop: 4, textAlign: 'center' }]} numberOfLines={2}>{a.title}</Text>
              </TouchableOpacity>
            ))}
            {!showAll && unlocked.length > 8 && (
              <TouchableOpacity onPress={() => setShowAll(true)} style={{ width: 68, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: 4, borderRadius: borderRadius.md, borderWidth: 1, backgroundColor: colors.surface, borderColor: colors.border }}>
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>+{unlocked.length - 8}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {showAll && inProgress.length > 0 && (
          <View>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>В ПРОЦЕССЕ</Text>
            {inProgress.slice(0, 4).map((a) => (
              <View key={a.id} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={{ fontSize: 18 }}>{a.emoji}</Text>
                    <Text style={[typography.small, { color: colors.text }]}>{a.title}</Text>
                  </View>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{a.progressLabel}</Text>
                </View>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
                  <View style={{ height: 4, borderRadius: 2, width: `${Math.round((a.progress ?? 0) * 100)}%` as any, backgroundColor: colors.primary + '80' }} />
                </View>
              </View>
            ))}
          </View>
        )}

        {unlocked.length === 0 && inProgress.length === 0 && (
          <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.md }]}>
            Заверши первую тренировку — разблокируй первое достижение
          </Text>
        )}
      </Card>
    </FadeIn>
  );
};
