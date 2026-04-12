import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props {
  lastWorkout: Workout;
  daysSinceLastWorkout: number;
  activeWorkout: any | null;
  onRepeat: () => void;
}

export const LastWorkoutCard: React.FC<Props> = ({ lastWorkout, daysSinceLastWorkout, activeWorkout, onRepeat }) => {
  const { colors } = useThemeStore();

  const handleShare = useCallback(async () => {
    const totalSets = lastWorkout.exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0
    );
    const message = [
      `Моя тренировка: ${lastWorkout.name}`,
      `${lastWorkout.durationMinutes || 0} мин - ${Math.round(lastWorkout.totalVolume || 0)} кг`,
      `${lastWorkout.exercises.length} упражнений - ${totalSets} подходов`,
      `Тренируйся с Iron Gym`,
    ].join('\n');
    try {
      await Share.share({ message });
    } catch {}
  }, [lastWorkout]);

  const daysWord = (n: number) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'ДНЕЙ';
    if (mod10 === 1) return 'ДЕНЬ';
    if (mod10 >= 2 && mod10 <= 4) return 'ДНЯ';
    return 'ДНЕЙ';
  };
  const label =
    daysSinceLastWorkout === 0 ? 'СЕГОДНЯ' :
    daysSinceLastWorkout === 1 ? 'ВЧЕРА' :
    `${daysSinceLastWorkout} ${daysWord(daysSinceLastWorkout)} НАЗАД`;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <Text style={[typography.captionMedium, { color: colors.textTertiary }]}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <TouchableOpacity
            onPress={handleShare}
            style={{ backgroundColor: colors.primary + '12', paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.primary + '35' }}
          >
            <Text style={[typography.captionMedium, { color: colors.primary }]} numberOfLines={1}>Поделиться</Text>
          </TouchableOpacity>
          {!activeWorkout && (
            <TouchableOpacity
              onPress={onRepeat}
              style={{ backgroundColor: colors.primary + '12', paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.primary + '35' }}
            >
              <Text style={[typography.captionMedium, { color: colors.primary }]} numberOfLines={1}>Повторить</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xs }]} numberOfLines={1}>
        {lastWorkout.name}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
        {lastWorkout.exercises.length > 0 && (
          <View>
            <Text style={[typography.numberSmall, { color: colors.primary, fontSize: 18 }]}>
              {lastWorkout.exercises.length}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>упр.</Text>
          </View>
        )}
        {!!lastWorkout.durationMinutes && (
          <View>
            <Text style={[typography.numberSmall, { color: colors.accent, fontSize: 18 }]}>
              {lastWorkout.durationMinutes}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>мин</Text>
          </View>
        )}
        {!!lastWorkout.totalVolume && (
          <View>
            <Text style={[typography.numberSmall, { color: colors.success, fontSize: 18 }]}>
              {Math.round(lastWorkout.totalVolume)}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
          </View>
        )}
      </View>
    </Card>
  );
};
