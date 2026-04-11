import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { TrainerClient } from '../../../store';

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение', muscle_gain: 'Набор массы', strength: 'Сила',
  endurance: 'Выносливость', general_fitness: 'Общая форма',
};
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
};

function daysSince(dateStr?: string): string | null {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  return `${diff} дн. назад`;
}

interface Props {
  client: TrainerClient;
  onPress: () => void;
  onLongPress: () => void;
}

export const ClientCard: React.FC<Props> = ({ client, onPress, onLongPress }) => {
  const { colors } = useThemeStore();
  const today = new Date().toISOString().split('T')[0];
  const isToday = client.lastVisit === today;
  const lastVisitLabel = daysSince(client.lastVisit);

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <Card style={[styles.card, isToday && { borderWidth: 1.5, borderColor: colors.success + '60' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={{ fontSize: 22 }}>{client.emoji || '◉'}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]}>{client.name}</Text>
              {isToday && (
                <View style={[styles.todayBadge, { backgroundColor: colors.success + '20' }]}>
                  <Text style={[typography.caption, { color: colors.success, fontSize: 10 }]}>сегодня</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: 2, flexWrap: 'wrap' }}>
              {client.goal && <Text style={[typography.caption, { color: colors.textSecondary }]}>{GOAL_LABELS[client.goal] ?? client.goal}</Text>}
              {client.level && <Text style={[typography.caption, { color: colors.textSecondary }]}>{LEVEL_LABELS[client.level] ?? client.level}</Text>}
            </View>
            {client.assignedProgram && <Text style={[typography.caption, { color: colors.primary, marginTop: 2 }]}>{client.assignedProgram}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[typography.numberSmall, { color: colors.primary, fontSize: 18 }]}>{client.totalWorkouts || 0}</Text>
            <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>трен.</Text>
            {lastVisitLabel && <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2, fontSize: 10 }]}>{lastVisitLabel}</Text>}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  todayBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 6 },
});
