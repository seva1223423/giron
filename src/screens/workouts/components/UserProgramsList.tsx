import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { Workout } from '../../../types';

interface UserProgram {
  id: string;
  name: string;
  description?: string;
  createdBy?: string;
  isActive?: boolean;
  workouts: { id: string; name: string; exercises: any[] }[];
}

interface Props {
  programs: UserProgram[];
  onStartWorkout: (workout: any) => void;
}

export const UserProgramsList: React.FC<Props> = ({ programs, onStartWorkout }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (programs.length === 0) return null;

  return (
    <>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Мои программы</Text>
      {programs.map((program, i) => (
        <FadeIn key={program.id} delay={i * 60}>
          <Card style={{ marginBottom: spacing.md }}>
            <TouchableOpacity onPress={() => { haptic.light(); setExpandedId(expandedId === program.id ? null : program.id); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}><Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{program.createdBy === 'ai' ? 'AI' : 'MY'}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]}>{program.name}</Text>
                    {program.isActive && (
                      <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.success + '20' }}>
                        <Text style={[typography.captionMedium, { color: colors.success, fontSize: 10 }]}>Активная</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                    {program.workouts.length} тренировок{program.description ? ` • ${program.description}` : ''}
                  </Text>
                </View>
                <Text style={[typography.body, { color: colors.textTertiary }]}>{expandedId === program.id ? '∧' : '∨'}</Text>
              </View>
            </TouchableOpacity>

            {expandedId === program.id && program.workouts.length > 0 && (
              <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm }}>
                {program.workouts.map((workout) => (
                  <TouchableOpacity
                    key={workout.id}
                    onPress={() => onStartWorkout(workout)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.md }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyMedium, { color: colors.text }]}>{workout.name}</Text>
                      <Text style={[typography.small, { color: colors.textSecondary }]}>{workout.exercises.length} упражнений</Text>
                    </View>
                    <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm, backgroundColor: colors.primary + '15' }}>
                      <Text style={[typography.captionMedium, { color: colors.primary, fontSize: 10 }]}>Начать</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {expandedId === program.id && program.workouts.length === 0 && (
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.md }]}>
                Нет тренировок — попроси Iron Coach составить тренировку
              </Text>
            )}
          </Card>
        </FadeIn>
      ))}
      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: spacing.lg }} />
    </>
  );
};
