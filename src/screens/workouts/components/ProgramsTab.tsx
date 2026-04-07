import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore, useSubscriptionStore } from '../../../store';
import { Card, FadeIn, PaywallModal } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { builtInPrograms } from '../../../data/programs';
import { Workout } from '../../../types';

const GOAL_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'strength', label: '💪 Сила' },
  { key: 'muscle', label: '📈 Масса' },
  { key: 'fat_loss', label: '🔥 Похудение' },
  { key: 'endurance', label: '🏃 Выносливость' },
] as const;

const LEVEL_FILTERS = [
  { key: 'all', label: 'Любой уровень' },
  { key: 'beginner', label: 'Новичок' },
  { key: 'intermediate', label: 'Средний' },
  { key: 'advanced', label: 'Продвинутый' },
] as const;

interface Props {
  navigation: any;
}

export const ProgramsTab: React.FC<Props> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { programs, startWorkout } = useWorkoutStore();
  const { isPremiumActive } = useSubscriptionStore();
  const [showPaywall, setShowPaywall] = useState(false);
  const [goalFilter, setGoalFilter] = useState<typeof GOAL_FILTERS[number]['key']>('all');
  const [levelFilter, setLevelFilter] = useState<typeof LEVEL_FILTERS[number]['key']>('all');
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);

  const filteredPrograms = useMemo(() =>
    builtInPrograms.filter((p) => {
      const matchesGoal = goalFilter === 'all' || p.goal === goalFilter;
      const matchesLevel = levelFilter === 'all' || p.level === levelFilter;
      return matchesGoal && matchesLevel;
    }),
    [goalFilter, levelFilter]
  );

  const startProgramWorkout = (workout: any) => {
    haptic.medium();
    const fresh: Workout = {
      ...workout,
      id: `workout-${Date.now()}`,
      exercises: workout.exercises.map((ex: any, ei: number) => ({
        ...ex,
        id: `we-${Date.now()}-${ei}`,
        sets: ex.sets.map((s: any, si: number) => ({
          ...s,
          id: `set-${Date.now()}-${ei}-${si}`,
          completed: false,
          weight: s.weight ?? undefined,
          rpe: s.rpe ?? undefined,
        })),
      })),
      startedAt: undefined,
      completedAt: undefined,
    };
    startWorkout(fresh);
    navigation.navigate('ActiveWorkout');
  };

  return (
    <>
      {programs.length > 0 && (
        <>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Мои программы</Text>
          {programs.map((program, i) => (
            <FadeIn key={program.id} delay={i * 60}>
              <Card style={{ marginBottom: spacing.md }}>
                <TouchableOpacity onPress={() => { haptic.light(); setExpandedProgramId(expandedProgramId === program.id ? null : program.id); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, marginRight: spacing.md }}>{program.createdBy === 'ai' ? '🤖' : '📋'}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>{program.name}</Text>
                        {program.isActive && (
                          <View style={[styles.miniTag, { backgroundColor: colors.success + '20' }]}>
                            <Text style={[typography.captionMedium, { color: colors.success, fontSize: 10 }]}>Активная</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                        {program.workouts.length} тренировок{program.description ? ` • ${program.description}` : ''}
                      </Text>
                    </View>
                    <Text style={[typography.body, { color: colors.textTertiary }]}>
                      {expandedProgramId === program.id ? '∧' : '∨'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {expandedProgramId === program.id && program.workouts.length > 0 && (
                  <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm }}>
                    {program.workouts.map((workout) => (
                      <TouchableOpacity
                        key={workout.id}
                        onPress={() => startProgramWorkout(workout)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.md }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.bodyMedium, { color: colors.text }]}>{workout.name}</Text>
                          <Text style={[typography.small, { color: colors.textSecondary }]}>{workout.exercises.length} упражнений</Text>
                        </View>
                        <View style={[styles.miniTag, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[typography.captionMedium, { color: colors.primary, fontSize: 10 }]}>Начать</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {expandedProgramId === program.id && program.workouts.length === 0 && (
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.md }]}>
                    Нет тренировок — попроси Iron Coach составить тренировку
                  </Text>
                )}
              </Card>
            </FadeIn>
          ))}
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: spacing.lg }} />
        </>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
        {GOAL_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptic.selection(); setGoalFilter(f.key); }}
            style={[styles.filterChip, { backgroundColor: goalFilter === f.key ? colors.primary : colors.surface, borderColor: goalFilter === f.key ? colors.primary : colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: goalFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
        {LEVEL_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptic.selection(); setLevelFilter(f.key); }}
            style={[styles.filterChip, { backgroundColor: levelFilter === f.key ? colors.accent : colors.surface, borderColor: levelFilter === f.key ? colors.accent : colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: levelFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!isPremiumActive() && (
        <TouchableOpacity
          onPress={() => setShowPaywall(true)}
          style={[styles.proBanner, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '40' }]}
        >
          <Text style={{ fontSize: 18 }}>👑</Text>
          <Text style={[typography.small, { color: colors.accent, flex: 1 }]}>
            3 из {builtInPrograms.length} программ бесплатно — <Text style={{ fontWeight: '700' }}>получи все с Pro</Text>
          </Text>
          <Text style={[typography.caption, { color: colors.accent }]}>›</Text>
        </TouchableOpacity>
      )}

      {filteredPrograms.length === 0 && (
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl }]}>
          Нет программ с такими фильтрами
        </Text>
      )}

      {filteredPrograms.map((program, i) => {
        const globalIndex = builtInPrograms.findIndex((p) => p.id === program.id);
        const isLocked = !isPremiumActive() && globalIndex >= 3;
        return (
          <FadeIn key={program.id} delay={i * 60}>
            <Card
              style={{ marginBottom: spacing.md, opacity: isLocked ? 0.7 : 1 }}
              onPress={() => {
                if (isLocked) { haptic.warning(); setShowPaywall(true); }
                else navigation.navigate('ProgramDetail', { program });
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 32, marginRight: spacing.md }}>{isLocked ? '🔒' : program.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: isLocked ? colors.textSecondary : colors.text }]}>{program.name}</Text>
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                    {program.daysPerWeek} дн/нед • {program.durationWeeks} нед • {program.split}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                    <View style={[styles.miniTag, { backgroundColor: isLocked ? colors.border : colors.primary + '15' }]}>
                      <Text style={[typography.captionMedium, { color: isLocked ? colors.textTertiary : colors.primary, fontSize: 10 }]}>
                        {program.level === 'beginner' ? 'Новичок' : program.level === 'intermediate' ? 'Средний' : 'Продвинутый'}
                      </Text>
                    </View>
                    <View style={[styles.miniTag, { backgroundColor: colors.surface }]}>
                      <Text style={[typography.captionMedium, { color: colors.textSecondary, fontSize: 10 }]}>
                        {program.goal === 'strength' ? 'Сила' : program.goal === 'muscle' ? 'Масса' : program.goal === 'fat_loss' ? 'Похудение' : 'Выносливость'}
                      </Text>
                    </View>
                    {isLocked && (
                      <View style={[styles.miniTag, { backgroundColor: colors.accent + '20' }]}>
                        <Text style={[typography.captionMedium, { color: colors.accent, fontSize: 10 }]}>Pro</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[typography.body, { color: colors.textTertiary }]}>{isLocked ? '›' : '>'}</Text>
              </View>
            </Card>
          </FadeIn>
        );
      })}

      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} reason="programs_limit" navigation={navigation} />
    </>
  );
};

const styles = StyleSheet.create({
  miniTag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  filterChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  proBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, marginBottom: spacing.md },
});
