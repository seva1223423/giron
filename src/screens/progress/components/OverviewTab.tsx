import React from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { WeeklyHeatmap } from './WeeklyHeatmap';
import type { Workout } from '../../../types';

interface OverviewTabProps {
  colors: any;
  totalWorkouts: number;
  streak: number;
  totalVolume: number;
  totalDuration: number;
  workoutDates: string[];
  weeklyVolumeData: { label: string; value: number }[];
  weeklyCountData: { label: string; value: number }[];
  muscleDistribution: { label: string; value: number }[];
  durationTrend: { label: string; value: number }[];
  workoutHistory: Workout[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  colors,
  totalWorkouts,
  streak,
  totalVolume,
  totalDuration,
  workoutDates,
  weeklyVolumeData,
  weeklyCountData,
  muscleDistribution,
  durationTrend,
  workoutHistory,
}) => (
  <>
    {/* Stats cards */}
    <FadeIn delay={0}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
          <Text style={[typography.number, { color: colors.primary }]}>{totalWorkouts}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
        </Card>
        <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
          <Text style={[typography.number, { color: colors.success }]}>{streak}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней подряд</Text>
        </Card>
        <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
          <Text style={[typography.number, { color: colors.accent }]}>{Math.round(totalVolume / 1000)}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн всего</Text>
        </Card>
        <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
          <Text style={[typography.number, { color: colors.primary }]}>{totalDuration}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
        </Card>
      </View>
    </FadeIn>

    {/* Activity heatmap */}
    <FadeIn delay={100}>
      <Card style={{ marginTop: spacing.xl }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          Активность
        </Text>
        <WeeklyHeatmap workoutDates={workoutDates} colors={colors} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: spacing.sm, gap: spacing.xs }}>
          <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>Мало</Text>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.surface }} />
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success + '70' }} />
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} />
          <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>Много</Text>
        </View>
      </Card>
    </FadeIn>

    {/* Weekly volume chart */}
    <FadeIn delay={200}>
      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          Объём по неделям (кг)
        </Text>
        <BarChart data={weeklyVolumeData} color={colors.primary} colors={colors} />
      </Card>
    </FadeIn>

    {/* Workout frequency chart */}
    <FadeIn delay={300}>
      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
          Тренировок в неделю
        </Text>
        <BarChart data={weeklyCountData} color={colors.success} height={100} colors={colors} />
      </Card>
    </FadeIn>

    {/* Muscle distribution */}
    {muscleDistribution.length > 0 && (
      <FadeIn delay={400}>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Распределение нагрузки
          </Text>
          {muscleDistribution.map((m, i) => {
            const maxSets = Math.max(1, muscleDistribution[0].value);
            const pct = (m.value / maxSets) * 100;
            return (
              <View key={i} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={[typography.smallMedium, { color: colors.text }]}>{m.label}</Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>{m.value} подх.</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface }}>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primary,
                      width: `${pct}%`,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      </FadeIn>
    )}

    {/* Duration trend */}
    {durationTrend.length >= 2 && (
      <FadeIn delay={500}>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Длительность тренировок (мин)
          </Text>
          <LineChart data={durationTrend} color={colors.accent} colors={colors} suffix=" мин" />
        </Card>
      </FadeIn>
    )}

    {/* Recent workouts */}
    <FadeIn delay={600}>
      <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
        Последние тренировки
      </Text>
      {workoutHistory.length === 0 ? (
        <Card>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Нет завершённых тренировок. Начни первую!
          </Text>
        </Card>
      ) : (
        workoutHistory.slice(0, 10).map((workout, i) => (
          <FadeIn key={workout.id} delay={650 + i * 50}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{workout.name}</Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>
                    {workout.exercises.length} упр. {'\u2022'} {workout.durationMinutes || 0} мин
                    {workout.totalVolume ? ` \u2022 ${Math.round(workout.totalVolume)} кг` : ''}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {workout.completedAt
                    ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                    : ''}
                </Text>
              </View>
            </Card>
          </FadeIn>
        ))
      )}
    </FadeIn>
  </>
);
