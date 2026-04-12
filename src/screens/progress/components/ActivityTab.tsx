import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { CalendarTab } from './CalendarTab';
import { CardioTab } from './CardioTab';
import type { Workout } from '../../../types';

type Section = 'calendar' | 'cardio';

interface Props {
  colors: any;
  workoutHistory: Workout[];
}

export const ActivityTab: React.FC<Props> = ({ colors, workoutHistory }) => {
  const haptic = useHaptic();
  const [section, setSection] = useState<Section>('calendar');

  return (
    <View>
      {/* Segmented control */}
      <View style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        padding: 3,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
        {([
          { key: 'calendar' as const, label: 'Тренировки' },
          { key: 'cardio' as const, label: 'Кардио' },
        ] as { key: Section; label: string }[]).map((s) => (
          <TouchableOpacity
            key={s.key}
            onPress={() => { haptic.selection(); setSection(s.key); }}
            style={{
              flex: 1, paddingVertical: 7, borderRadius: borderRadius.sm - 1,
              backgroundColor: section === s.key ? colors.background : 'transparent',
              alignItems: 'center',
              shadowColor: section === s.key ? '#000' : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08, shadowRadius: 2, elevation: section === s.key ? 1 : 0,
            }}
          >
            <Text style={[typography.smallMedium, { color: section === s.key ? colors.text : colors.textSecondary }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'calendar' && <CalendarTab colors={colors} workoutHistory={workoutHistory} />}
      {section === 'cardio' && <CardioTab colors={colors} />}
    </View>
  );
};
