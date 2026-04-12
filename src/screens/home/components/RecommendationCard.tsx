import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface RestDayRec { reason: string; tip: string }
interface WorkoutRec { name: string; emoji: string; daysLabel: string; programWorkout: any | null }

interface Props {
  restDayRecommendation: RestDayRec | null;
  workoutRecommendation: WorkoutRec;
  activeProgram: any | null;
  haptic: { medium: () => void };
  startWorkout: (w: any) => void;
  navigation: any;
}

export const RecommendationCard: React.FC<Props> = ({
  restDayRecommendation, workoutRecommendation, activeProgram, haptic, startWorkout, navigation,
}) => {
  const { colors } = useThemeStore();

  if (restDayRecommendation) {
    return (
      <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + '18', borderWidth: 1.5, borderColor: colors.accent + '40', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent }}>R</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.captionMedium, { color: colors.accent }]}>ДЕНЬ ОТДЫХА</Text>
            <Text style={[typography.bodyMedium, { color: colors.text, marginTop: spacing.xs }]}>
              {restDayRecommendation.reason}
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 4 }]}>
              {restDayRecommendation.tip}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const handlePress = () => {
    if (workoutRecommendation.programWorkout) {
      const pw = workoutRecommendation.programWorkout as any;
      const fresh = {
        id: `workout-${Date.now()}`,
        name: pw.name,
        exercises: (pw.exercises || []).map((we: any, idx: number) => ({
          ...we,
          id: `we-${Date.now()}-${idx}`,
          sets: (we.sets || []).map((s: any, si: number) => ({
            ...s,
            id: `set-${Date.now()}-${idx}-${si}`,
            completed: false,
          })),
        })),
        startedAt: undefined,
        completedAt: undefined,
      };
      haptic.medium();
      startWorkout(fresh as any);
      navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
    } else {
      navigation.navigate('WorkoutsTab');
    }
  };

  return (
    <Card
      style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.success }}
      onPress={handlePress}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.captionMedium, { color: colors.success }]}>
            {workoutRecommendation.programWorkout ? 'СЛЕДУЮЩАЯ ТРЕНИРОВКА' : 'РЕКОМЕНДУЕМ СЕГОДНЯ'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>{workoutRecommendation.emoji}</Text>
            <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>{workoutRecommendation.name}</Text>
          </View>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
            {workoutRecommendation.daysLabel}
            {workoutRecommendation.programWorkout ? ` · ${activeProgram?.name}` : ''}
          </Text>
          {!workoutRecommendation.programWorkout && workoutRecommendation.daysLabel !== 'Уже сегодня' && (
            <View style={[{ alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.success + '15' }]}>
              <Text style={[typography.caption, { color: colors.success, fontSize: 11 }]}>
                {workoutRecommendation.daysLabel === 'Ещё не тренировал' ? '✓ Мышцы полностью отдохнули' : '✓ Мышцы восстановились'}
              </Text>
            </View>
          )}
        </View>
        <Text style={[typography.body, { color: colors.primary, marginTop: spacing.sm }]}>▶</Text>
      </View>
    </Card>
  );
};
