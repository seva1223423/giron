import React from 'react';
import { Text, Switch } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';

export const AppearanceSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors, isDark, toggleTheme } = useThemeStore();
  return (
    <FadeIn delay={0}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>ВНЕШНИЙ ВИД</Text>
        <SettingRow
          label="Тёмная тема"
          right={
            <Switch
              value={isDark}
              onValueChange={() => { haptic.selection(); toggleTheme(); }}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={isDark ? colors.primary : '#f4f3f4'}
            />
          }
        />
      </Card>
    </FadeIn>
  );
};
