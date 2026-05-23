import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, FadeIn, Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { Program } from '../../../types';

const GOAL_COLORS: Record<string, string> = {
  weight_loss: '#FF5722', muscle_gain: '#9C27B0', strength: '#3B6BF0',
  endurance: '#4CAF50', flexibility: '#00BCD4', general_fitness: '#FF9800',
};
const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение', muscle_gain: 'Масса', strength: 'Сила',
  endurance: 'Выносливость', flexibility: 'Гибкость', general_fitness: 'Форма',
};

interface Props {
  programs: Program[];
  navigation: any;
  onStartWorkout: (workout: any) => void;
}

export const UserProgramsList: React.FC<Props> = ({ programs, navigation, onStartWorkout }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();

  if (programs.length === 0) return null;

  return (
    <>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Мои программы</Text>
      {programs.map((program, i) => {
        const goalColor = GOAL_COLORS[program.goal] || colors.primary;
        const totalEx = program.workouts.reduce((s, w) => s + w.exercises.length, 0);
        return (
          <FadeIn key={program.id} delay={i * 50}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { haptic.light(); navigation.navigate('AIProgramDetail', { program }); }}
            >
              <Card style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  {/* Icon */}
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: goalColor + '18', borderWidth: 1.5, borderColor: goalColor + '40', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[typography.smallMedium, { color: goalColor }]}>
                      {program.createdBy === 'ai' ? 'AI' : 'MY'}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    {/* Name + badges */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                        {program.name}
                      </Text>
                      {program.isActive && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.success + '22', borderWidth: 1, borderColor: colors.success + '40' }}>
                          <Text style={[typography.metaLabel, { color: colors.success }]}>АКТИВНАЯ</Text>
                        </View>
                      )}
                    </View>

                    {/* Meta row */}
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
                      <View style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: goalColor + '18', borderWidth: 1, borderColor: goalColor + '35' }]}>
                        <Text style={[typography.metaLabel, { color: goalColor }]}>
                          {GOAL_LABELS[program.goal] || program.goal}
                        </Text>
                      </View>
                      <Text style={[typography.caption, { color: colors.textTertiary }]}>
                        {program.workouts.length} трен · {totalEx} упр
                      </Text>
                    </View>
                  </View>

                  {/* Arrow + quick start */}
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Icon name="chev" size={16} color={colors.textTertiary} />
                    {program.workouts.length > 0 && (
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); haptic.medium(); onStartWorkout(program.workouts[0]); }}
                        style={{ backgroundColor: goalColor, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                      >
                        <Text style={[typography.captionMedium, { color: colors.textInverse }]}>Начать</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          </FadeIn>
        );
      })}
      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: spacing.lg }} />
    </>
  );
};
