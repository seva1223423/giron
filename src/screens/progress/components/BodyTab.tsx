import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { WeightTab } from './WeightTab';
import { PhotosTab } from './PhotosTab';
import { MeasurementsTab } from './MeasurementsTab';

type Section = 'weight' | 'measurements' | 'photos';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'weight', label: 'Вес' },
  { key: 'measurements', label: 'Замеры' },
  { key: 'photos', label: 'Фото' },
];

interface Props {
  colors: any;
  user: any;
}

export const BodyTab: React.FC<Props> = ({ colors, user }) => {
  const haptic = useHaptic();
  const [section, setSection] = useState<Section>('weight');

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
        {SECTIONS.map((s) => (
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

      {section === 'weight' && <WeightTab colors={colors} user={user} />}
      {section === 'measurements' && <MeasurementsTab colors={colors} />}
      {section === 'photos' && <PhotosTab colors={colors} />}
    </View>
  );
};
