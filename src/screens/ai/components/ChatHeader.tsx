import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore, useSubscriptionStore, FREE_LIMITS } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { AIMeta } from '../../../services';

function getRecoveryColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 60) return '#FF9800';
  if (score >= 40) return '#FF5722';
  return '#F44336';
}

function getRecoveryLabel(score: number): string {
  if (score >= 80) return 'Отличное';
  if (score >= 60) return 'Хорошее';
  if (score >= 40) return 'Среднее';
  return 'Низкое';
}

interface Props {
  lastMeta: AIMeta | null;
}

export const ChatHeader: React.FC<Props> = ({ lastMeta }) => {
  const { colors } = useThemeStore();
  const { isPremiumActive, aiMessagesLeft } = useSubscriptionStore();

  return (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={[typography.h3, { color: colors.text }]}>Iron Coach</Text>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          {isPremiumActive() && (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>PRO</Text>
            </View>
          )}
          {lastMeta?.recovery != null && (
            <View style={[styles.badge, { backgroundColor: getRecoveryColor(lastMeta.recovery) + '20', borderWidth: 1, borderColor: getRecoveryColor(lastMeta.recovery) + '60' }]}>
              <Text style={{ fontSize: 10, color: getRecoveryColor(lastMeta.recovery), fontWeight: '700' }}>
                {getRecoveryLabel(lastMeta.recovery)} {lastMeta.recovery}%
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={[typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
            {isPremiumActive()
              ? 'Безлимитный доступ'
              : `Осталось ${aiMessagesLeft()} из ${FREE_LIMITS.AI_MESSAGES_PER_DAY} сообщений`}
          </Text>
          {lastMeta?.streak != null && lastMeta.streak > 0 && (
            <Text style={[typography.small, { color: colors.accent, marginTop: 2, fontWeight: '600' }]}>
              🔥 {lastMeta.streak} дн
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'center', paddingTop: 56, paddingBottom: spacing.md, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
});
