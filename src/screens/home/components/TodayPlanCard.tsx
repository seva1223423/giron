import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exerciseThumbSource } from '../../../config/store';
import { exercises as localExercises } from '../../../data/exercises';

interface Props {
  todayPlan: { name: string; emoji: string; exercises: string[] };
  onStart: () => void;
}

const MAX_THUMBS = 4;

export const TodayPlanCard: React.FC<Props> = ({ todayPlan, onStart }) => {
  const { colors } = useThemeStore();

  // Visual preview: up to 4 exercise posters as overlapping chips. If the user
  // has more than MAX_THUMBS, append a '+N' tile so the total is still honest.
  const thumbItems = React.useMemo(() => {
    const ids = todayPlan.exercises.slice(0, MAX_THUMBS);
    return ids.map((id) => ({
      id,
      thumb: exerciseThumbSource(id),
      emoji: localExercises.find((e) => e.id === id)?.type === 'cardio' ? '🏃' : '💪',
    }));
  }, [todayPlan.exercises]);
  const overflow = Math.max(0, todayPlan.exercises.length - MAX_THUMBS);

  return (
    <Card
      style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent }}
      onPress={todayPlan.exercises.length > 0 ? onStart : undefined}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.captionMedium, { color: colors.accent }]}>ПЛАН НА СЕГОДНЯ</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent }}>{todayPlan.emoji}</Text>
            <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>{todayPlan.name}</Text>
          </View>
        </View>
        {todayPlan.exercises.length > 0 && (
          <Text style={[typography.bodySemibold, { color: colors.accent }]}>▶ Начать</Text>
        )}
      </View>

      {thumbItems.length > 0 && (
        <View style={styles.thumbRow}>
          {thumbItems.map((item, i) => (
            <View
              key={item.id + i}
              style={[
                styles.thumb,
                { marginLeft: i === 0 ? 0 : -10, borderColor: colors.surface, zIndex: MAX_THUMBS - i },
              ]}
            >
              {item.thumb !== undefined ? (
                <Image source={item.thumb} style={StyleSheet.absoluteFillObject} />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
                  <Text style={styles.placeholderIcon}>{item.emoji}</Text>
                </View>
              )}
            </View>
          ))}
          {overflow > 0 && (
            <View style={[styles.thumb, styles.overflowTile, { marginLeft: -10, borderColor: colors.surface, backgroundColor: colors.surface }]}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>+{overflow}</Text>
            </View>
          )}
          <Text style={[typography.caption, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
            {todayPlan.exercises.length} упр
          </Text>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  thumb: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#0F0F1A',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 16, opacity: 0.7 },
  overflowTile: { alignItems: 'center', justifyContent: 'center' },
});
