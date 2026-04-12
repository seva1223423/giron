import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore, useSubscriptionStore } from '../../../store';
import { Card, FadeIn, PaywallModal } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { builtInPrograms } from '../../../data/programs';
import { Workout } from '../../../types';
import { UserProgramsList } from './UserProgramsList';

const GOAL_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'strength', label: 'Сила' },
  { key: 'muscle', label: 'Масса' },
  { key: 'fat_loss', label: 'Похудение' },
  { key: 'endurance', label: 'Выносливость' },
] as const;

const LEVEL_FILTERS = [
  { key: 'all', label: 'Любой уровень' },
  { key: 'beginner', label: 'Новичок' },
  { key: 'intermediate', label: 'Средний' },
  { key: 'advanced', label: 'Продвинутый' },
] as const;

const GOAL_LABELS: Record<string, string> = { strength: 'Сила', muscle: 'Масса', fat_loss: 'Похудение', endurance: 'Выносливость' };
const LEVEL_LABELS: Record<string, string> = { beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый' };

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
          ...s, id: `set-${Date.now()}-${ei}-${si}`, completed: false, weight: s.weight ?? undefined, rpe: s.rpe ?? undefined,
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
      <UserProgramsList programs={programs} navigation={navigation} onStartWorkout={startProgramWorkout} />

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
          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.accent }}>PRO</Text>
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
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isLocked ? colors.border + '40' : colors.primary + '12', borderWidth: 1.5, borderColor: isLocked ? colors.border : colors.primary + '40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}><Text style={{ fontSize: 16, fontWeight: '700', color: isLocked ? colors.textTertiary : colors.primary }}>{isLocked ? '◈' : program.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: isLocked ? colors.textSecondary : colors.text }]} numberOfLines={1}>{program.name}</Text>
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                    {program.daysPerWeek} дн/нед • {program.durationWeeks} нед • {program.split}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                    <View style={[styles.miniTag, { backgroundColor: isLocked ? colors.border : colors.primary + '15', borderWidth: 1, borderColor: isLocked ? colors.border : colors.primary + '35' }]}>
                      <Text style={[typography.captionMedium, { color: isLocked ? colors.textTertiary : colors.primary, fontSize: 10 }]}>
                        {LEVEL_LABELS[program.level] || program.level}
                      </Text>
                    </View>
                    <View style={[styles.miniTag, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                      <Text style={[typography.captionMedium, { color: colors.textSecondary, fontSize: 10 }]}>
                        {GOAL_LABELS[program.goal] || program.goal}
                      </Text>
                    </View>
                    {isLocked && (
                      <View style={[styles.miniTag, { backgroundColor: colors.accent + '20', borderWidth: 1, borderColor: colors.accent + '40' }]}>
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
