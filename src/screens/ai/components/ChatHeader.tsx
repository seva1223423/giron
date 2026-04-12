import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeStore, useSubscriptionStore, FREE_LIMITS } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { AIMeta } from '../../../services';

function getRecoveryColor(score: number, colors: { success: string; warning: string; error: string }): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.warning;
  if (score >= 40) return colors.error;
  return colors.error;
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
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { isPremiumActive, aiMessagesLeft } = useSubscriptionStore();

  return (
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>IC</Text></View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 }} numberOfLines={1}>Iron Coach</Text>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          {isPremiumActive() && (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>PRO</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {isPremiumActive()
              ? '∞ Безлимитный доступ'
              : `${aiMessagesLeft()} / ${FREE_LIMITS.AI_MESSAGES_PER_DAY} сообщений`}
          </Text>
          {lastMeta?.recovery != null && (
            <View style={[styles.badge, { backgroundColor: getRecoveryColor(lastMeta.recovery, colors) + '15', borderWidth: 1, borderColor: getRecoveryColor(lastMeta.recovery, colors) + '40' }]}>
              <Text style={{ fontSize: 10, color: getRecoveryColor(lastMeta.recovery, colors), fontWeight: '600' }}>
                {getRecoveryLabel(lastMeta.recovery)} {lastMeta.recovery}%
              </Text>
            </View>
          )}
          {lastMeta?.streak != null && lastMeta.streak > 0 && (
            <Text style={[typography.caption, { color: colors.accent, fontWeight: '600' }]}>
              {lastMeta.streak} дн.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'center', paddingBottom: spacing.md, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
});
